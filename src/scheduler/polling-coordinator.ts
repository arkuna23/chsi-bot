import type { AuthRecoveryStatus, GroupSubscription, PollRunResult } from '../types/domain';
import { DiffService } from '../subscription/diff-service';
import { NotificationService } from '../subscription/notification-service';
import { SubscriptionService } from '../subscription/subscription-service';
import { ChsiAuthRecoveryService } from '../crawler/chsi-auth-recovery-service';
import { ChsiCrawlerService } from '../crawler/chsi-crawler-service';
import { OneBotClient } from '../bot/onebot-client';
import { Logger } from '../shared/logger';
import { SqliteDatabase } from '../storage/database';

export class PollingCoordinator {
  private running = false;

  constructor(
    private readonly subscriptionService: SubscriptionService,
    private readonly crawlerService: ChsiCrawlerService,
    private readonly authRecoveryService: ChsiAuthRecoveryService,
    private readonly diffService: DiffService,
    private readonly notificationService: NotificationService,
    private readonly oneBotClient: OneBotClient | null,
    private readonly database: SqliteDatabase,
    private readonly logger: Logger,
    private readonly adminGroupIds: string[],
  ) {}

  isRunning(): boolean {
    return this.running;
  }

  async runOnce(targetGroupId?: string): Promise<PollRunResult | null> {
    if (this.running) {
      this.logger.warn('Skipping polling run because another run is in progress', {
        targetGroupId: targetGroupId ?? null,
      });
      return null;
    }

    this.running = true;
    try {
      return await this.runOnceInternal(targetGroupId, true, 'NONE');
    } finally {
      this.running = false;
    }
  }

  private async runOnceInternal(
    targetGroupId: string | undefined,
    allowRecovery: boolean,
    authRecoveryStatus: AuthRecoveryStatus,
  ): Promise<PollRunResult> {
    const startedAt = Date.now();
    this.logger.info('Starting polling run', {
      targetGroupId: targetGroupId ?? null,
      allowRecovery,
      authRecoveryStatus,
    });

    const groups = targetGroupId
      ? this.getScopedGroups(targetGroupId)
      : this.subscriptionService.listEnabledGroups();
    const prefixes = Array.from(
      new Set(
        groups.flatMap((group) => group.prefixes.map((prefix) => prefix.prefix)),
      ),
    ).sort((left, right) => left.length - right.length || left.localeCompare(right));

    this.logger.info('Resolved polling scope', {
      groupCount: groups.length,
      groupIds: groups.map((group) => group.groupId),
      prefixCount: prefixes.length,
      prefixes,
    });

    if (groups.length === 0 || prefixes.length === 0) {
      this.logger.info('Polling run finished without crawl because scope is empty', {
        groupCount: groups.length,
        prefixCount: prefixes.length,
      });
      return this.createEmptyResult(prefixes, 'VALID', authRecoveryStatus);
    }

    const crawlResult = await this.crawlerService.crawlByMajorPrefixes(prefixes);
    const errors = Object.fromEntries(crawlResult.errors.entries());
    this.logger.info('Crawler returned result', {
      sessionStatus: crawlResult.sessionStatus,
      crawledPrefixCount: crawlResult.results.size,
      errorCount: crawlResult.errors.size,
    });

    if (crawlResult.sessionStatus === 'AUTH_EXPIRED') {
      return this.handleAuthExpired(targetGroupId, prefixes, crawlResult, errors, allowRecovery, authRecoveryStatus);
    }

    const allListings = Array.from(crawlResult.results.values()).flat();
    const diff = this.diffService.detectNewListings(allListings);
    this.logger.info('Diff detection finished', {
      crawledListingCount: allListings.length,
      newListingCount: diff.newListings.length,
      updatedListingCount: diff.updatedListings.length,
    });

    for (const prefix of prefixes) {
      const error = crawlResult.errors.get(prefix) ?? null;
      this.logger.debug('Updating crawl checkpoint', {
        prefix,
        status: error ? 'ERROR' : 'SUCCESS',
        error,
      });
      this.database.updateCheckpoint(prefix, error ? 'ERROR' : 'SUCCESS', error);
    }

    const sentGroups: string[] = [];
    for (const group of groups) {
      const messages = this.notificationService.buildMessages(group, diff.newListings);
      this.logger.info('Prepared notifications for group', {
        groupId: group.groupId,
        messageCount: messages.length,
      });
      if (messages.length === 0 || !this.oneBotClient) {
        continue;
      }

      for (const message of messages) {
        await this.oneBotClient.sendGroupMessage(group.groupId, message);
        this.notificationService.recordNotification(group.groupId, message);
      }
      sentGroups.push(group.groupId);
    }

    this.logger.info('Polling run finished', {
      durationMs: Date.now() - startedAt,
      sentGroupCount: sentGroups.length,
      sentGroups,
      newListingCount: diff.newListings.length,
      updatedListingCount: diff.updatedListings.length,
      authRecoveryStatus,
    });

    return {
      prefixes,
      crawledPrefixes: Array.from(crawlResult.results.keys()),
      sentGroups,
      newListingCount: diff.newListings.length,
      updatedListingCount: diff.updatedListings.length,
      errors,
      sessionStatus: 'VALID',
      authRecoveryStatus,
    };
  }

  private getScopedGroups(groupId: string): GroupSubscription[] {
    const group = this.subscriptionService.getGroup(groupId);
    if (!group || !group.enabled) {
      return [];
    }

    return [group];
  }

  private async handleAuthExpired(
    targetGroupId: string | undefined,
    prefixes: string[],
    crawlResult: Awaited<ReturnType<ChsiCrawlerService['crawlByMajorPrefixes']>>,
    errors: Record<string, string>,
    allowRecovery: boolean,
    authRecoveryStatus: AuthRecoveryStatus,
  ): Promise<PollRunResult> {
    if (allowRecovery) {
      const recoveryStatus = await this.authRecoveryService.recoverSession();
      if (recoveryStatus === 'AUTO_LOGIN_SUCCESS') {
        this.logger.info('Automatic CHSI login succeeded, retrying polling run', {
          targetGroupId: targetGroupId ?? null,
        });
        const retryResult = await this.runOnceInternal(
          targetGroupId,
          false,
          'AUTO_LOGIN_SUCCESS',
        );

        if (retryResult.sessionStatus === 'VALID') {
          return retryResult;
        }

        return {
          ...retryResult,
          authRecoveryStatus: 'AUTO_LOGIN_FAILED',
        };
      }

      await this.sendAdminAlert(this.buildAuthExpiredAlertMessage(recoveryStatus));
      this.logger.warn('Polling run stopped because CHSI session expired', {
        recoveryStatus,
      });
      return {
        prefixes,
        crawledPrefixes: Array.from(crawlResult.results.keys()),
        sentGroups: [],
        newListingCount: 0,
        updatedListingCount: 0,
        errors,
        sessionStatus: 'AUTH_EXPIRED',
        authRecoveryStatus: recoveryStatus,
      };
    }

    const finalRecoveryStatus =
      authRecoveryStatus === 'AUTO_LOGIN_SUCCESS' ? 'AUTO_LOGIN_FAILED' : authRecoveryStatus;
    await this.sendAdminAlert(this.buildAuthExpiredAlertMessage(finalRecoveryStatus));
    this.logger.warn('Polling run stopped after failed automatic recovery', {
      authRecoveryStatus: finalRecoveryStatus,
    });

    return {
      prefixes,
      crawledPrefixes: Array.from(crawlResult.results.keys()),
      sentGroups: [],
      newListingCount: 0,
      updatedListingCount: 0,
      errors,
      sessionStatus: 'AUTH_EXPIRED',
      authRecoveryStatus: finalRecoveryStatus,
    };
  }

  private createEmptyResult(
    prefixes: string[],
    sessionStatus: PollRunResult['sessionStatus'],
    authRecoveryStatus: AuthRecoveryStatus,
  ): PollRunResult {
    return {
      prefixes,
      crawledPrefixes: [],
      sentGroups: [],
      newListingCount: 0,
      updatedListingCount: 0,
      errors: {},
      sessionStatus,
      authRecoveryStatus,
    };
  }

  private buildAuthExpiredAlertMessage(authRecoveryStatus: AuthRecoveryStatus): string {
    switch (authRecoveryStatus) {
      case 'AUTO_LOGIN_FAILED':
        return 'CHSI 登录态已失效，已尝试自动重新登录但失败，请检查账号密码或手动重新登录。';
      case 'CHALLENGE_REQUIRED':
        return 'CHSI 登录态已失效，自动重新登录遇到验证码或短信验证，请人工处理后再继续。';
      default:
        return 'CHSI 登录态已失效，且未配置自动重新登录账号密码，请尽快人工处理。';
    }
  }

  private async sendAdminAlert(message: string): Promise<void> {
    this.logger.warn(message);
    if (!this.oneBotClient) {
      return;
    }

    for (const groupId of this.adminGroupIds) {
      this.logger.warn('Sending admin alert', {
        groupId,
        message,
      });
      await this.oneBotClient.sendGroupMessage(groupId, message);
    }
  }
}
