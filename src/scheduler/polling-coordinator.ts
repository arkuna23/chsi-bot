import type { GroupSubscription, PollRunResult } from '../types/domain';
import { DiffService } from '../subscription/diff-service';
import { NotificationService } from '../subscription/notification-service';
import { SubscriptionService } from '../subscription/subscription-service';
import { ChsiCrawlerService } from '../crawler/chsi-crawler-service';
import { OneBotClient } from '../bot/onebot-client';
import { Logger } from '../shared/logger';
import { SqliteDatabase } from '../storage/database';

export class PollingCoordinator {
  private running = false;

  constructor(
    private readonly subscriptionService: SubscriptionService,
    private readonly crawlerService: ChsiCrawlerService,
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
      return null;
    }

    this.running = true;
    try {
      const groups = targetGroupId
        ? this.getScopedGroups(targetGroupId)
        : this.subscriptionService.listEnabledGroups();
      const prefixes = Array.from(
        new Set(
          groups.flatMap((group) => group.prefixes.map((prefix) => prefix.prefix)),
        ),
      ).sort((left, right) => left.length - right.length || left.localeCompare(right));

      if (groups.length === 0 || prefixes.length === 0) {
        return {
          prefixes,
          crawledPrefixes: [],
          sentGroups: [],
          newListingCount: 0,
          updatedListingCount: 0,
          errors: {},
          sessionStatus: 'VALID',
        };
      }

      const crawlResult = await this.crawlerService.crawlByMajorPrefixes(prefixes);
      const errors = Object.fromEntries(crawlResult.errors.entries());

      if (crawlResult.sessionStatus === 'AUTH_EXPIRED') {
        await this.sendAdminAlert('CHSI session expired');
        return {
          prefixes,
          crawledPrefixes: Array.from(crawlResult.results.keys()),
          sentGroups: [],
          newListingCount: 0,
          updatedListingCount: 0,
          errors,
          sessionStatus: 'AUTH_EXPIRED',
        };
      }

      const allListings = Array.from(crawlResult.results.values()).flat();
      const diff = this.diffService.detectNewListings(allListings);

      for (const prefix of prefixes) {
        const error = crawlResult.errors.get(prefix) ?? null;
        this.database.updateCheckpoint(prefix, error ? 'ERROR' : 'SUCCESS', error);
      }

      const sentGroups: string[] = [];
      for (const group of groups) {
        const messages = this.notificationService.buildMessages(group, diff.newListings);
        if (messages.length === 0 || !this.oneBotClient) {
          continue;
        }

        for (const message of messages) {
          await this.oneBotClient.sendGroupMessage(group.groupId, message);
          this.notificationService.recordNotification(group.groupId, message);
        }
        sentGroups.push(group.groupId);
      }

      return {
        prefixes,
        crawledPrefixes: Array.from(crawlResult.results.keys()),
        sentGroups,
        newListingCount: diff.newListings.length,
        updatedListingCount: diff.updatedListings.length,
        errors,
        sessionStatus: 'VALID',
      };
    } finally {
      this.running = false;
    }
  }

  private getScopedGroups(groupId: string): GroupSubscription[] {
    const group = this.subscriptionService.getGroup(groupId);
    if (!group || !group.enabled) {
      return [];
    }

    return [group];
  }

  private async sendAdminAlert(message: string): Promise<void> {
    this.logger.warn(message);
    if (!this.oneBotClient) {
      return;
    }

    for (const groupId of this.adminGroupIds) {
      await this.oneBotClient.sendGroupMessage(groupId, message);
    }
  }
}
