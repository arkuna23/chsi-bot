import type { BotCommand, OneBotMessageEvent } from '../types/domain';
import { parseCommand } from './command-parser';
import { OneBotClient } from './onebot-client';
import { Logger } from '../shared/logger';
import { SubscriptionService } from '../subscription/subscription-service';
import { PollingCoordinator } from '../scheduler/polling-coordinator';
import { extractMentionedCommand } from './mention-command';
import {
  buildAuthExpiredMessage,
  buildCheckingMessage,
  buildCheckResultMessage,
  buildDisableMessage,
  buildEnableFirstMessage,
  buildEnableMessage,
  buildGroupStatusMessage,
  buildHelpMessage,
  buildRegionMessage,
  buildRunningMessage,
  buildSubscribeMessage,
  buildUnknownCommandMessage,
  buildUnregionMessage,
  buildUnsubscribeMessage,
} from './message-formatter';

export class BotService {
  constructor(
    private readonly oneBotClient: OneBotClient,
    private readonly subscriptionService: SubscriptionService,
    private readonly pollingCoordinator: PollingCoordinator,
    private readonly logger: Logger = new Logger('BotService'),
  ) {}

  async handleMessage(event: OneBotMessageEvent): Promise<void> {
    const groupId = event.group_id ? String(event.group_id) : null;
    if (!groupId) {
      return;
    }

    const { commandText, mentioned } = extractMentionedCommand(event);
    if (!mentioned || !commandText) {
      return;
    }

    const { command, error } = parseCommand(commandText);
    if (!command && !error) {
      return;
    }

    if (error) {
      this.logger.warn('Command parse failed', { groupId, commandText, error });
      await this.reply(groupId, error);
      return;
    }

    this.logger.info('Executing command', { groupId, command });
    await this.executeCommand(groupId, command!);
  }

  private async executeCommand(groupId: string, command: BotCommand): Promise<void> {
    switch (command.type) {
      case 'on': {
        const group = this.subscriptionService.enableGroup(groupId);
        await this.reply(groupId, buildEnableMessage(group));
        return;
      }
      case 'off': {
        const group = this.subscriptionService.disableGroup(groupId);
        await this.reply(groupId, buildDisableMessage(group));
        return;
      }
      case 'help':
        await this.reply(groupId, buildHelpMessage());
        return;
      case 'list':
        await this.reply(groupId, buildGroupStatusMessage(this.subscriptionService.getGroup(groupId)));
        return;
      case 'sub': {
        const group = this.subscriptionService.subscribePrefix(groupId, command.prefix);
        await this.reply(groupId, buildSubscribeMessage(group, command.prefix));
        return;
      }
      case 'unsub': {
        const group = this.subscriptionService.unsubscribePrefix(groupId, command.prefix);
        await this.reply(groupId, buildUnsubscribeMessage(group, command.prefix));
        return;
      }
      case 'region': {
        const group = this.subscriptionService.setRegionFilter(
          groupId,
          command.prefix,
          command.provinces,
        );
        await this.reply(groupId, buildRegionMessage(group, command.prefix));
        return;
      }
      case 'unregion':
        this.subscriptionService.clearRegionFilter(groupId, command.prefix);
        await this.reply(groupId, buildUnregionMessage(command.prefix));
        return;
      case 'check': {
        const group = this.subscriptionService.getGroup(groupId);
        if (!group || !group.enabled) {
          await this.reply(groupId, buildEnableFirstMessage());
          return;
        }

        await this.reply(groupId, buildCheckingMessage());
        const result = await this.pollingCoordinator.runOnce(groupId);
        if (result === null) {
          this.logger.warn('Manual check skipped because polling is already running', { groupId });
          await this.reply(groupId, buildRunningMessage());
          return;
        }

        if (result.sessionStatus === 'AUTH_EXPIRED') {
          this.logger.warn('Manual check failed because CHSI session expired', { groupId });
          await this.reply(groupId, buildAuthExpiredMessage());
          return;
        }

        this.logger.info('Manual check finished', {
          groupId,
          result,
        });
        await this.reply(groupId, buildCheckResultMessage(result));
        return;
      }
    }
  }

  private async reply(groupId: string, message: string): Promise<void> {
    this.logger.info('Replying to group', {
      groupId,
      length: message.length,
      preview: message.slice(0, 120),
    });
    await this.oneBotClient.sendGroupMessage(groupId, message);
  }
}
