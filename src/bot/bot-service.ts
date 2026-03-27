import type { BotCommand, GroupSubscription, OneBotMessageEvent } from '../types/domain';
import { parseCommand } from './command-parser';
import { OneBotClient } from './onebot-client';
import { SubscriptionService } from '../subscription/subscription-service';
import { PollingCoordinator } from '../scheduler/polling-coordinator';

function extractMessageText(event: OneBotMessageEvent): string {
  if (typeof event.raw_message === 'string') {
    return event.raw_message;
  }

  if (typeof event.message === 'string') {
    return event.message;
  }

  if (Array.isArray(event.message)) {
    return event.message
      .map((segment) => {
        const data = (segment as { data?: { text?: string } }).data;
        return typeof data?.text === 'string' ? data.text : '';
      })
      .join('');
  }

  return '';
}

function formatGroupState(group: GroupSubscription | null): string {
  if (!group) {
    return 'disabled\nno subscriptions';
  }

  const header = group.enabled ? 'enabled' : 'disabled';
  if (group.prefixes.length === 0) {
    return `${header}\nno subscriptions`;
  }

  const lines = group.prefixes.map((prefix) => {
    if (prefix.regions.length === 0) {
      return `${prefix.prefix}: all regions`;
    }
    return `${prefix.prefix}: ${prefix.regions.join(', ')}`;
  });

  return [header, ...lines].join('\n');
}

function helpText(): string {
  return [
    '/on',
    '/off',
    '/sub <prefix>',
    '/unsub <prefix>',
    '/ls',
    '/region <prefix> <province...>',
    '/unregion <prefix>',
    '/check',
  ].join('\n');
}

export class BotService {
  constructor(
    private readonly oneBotClient: OneBotClient,
    private readonly subscriptionService: SubscriptionService,
    private readonly pollingCoordinator: PollingCoordinator,
  ) {}

  async handleMessage(event: OneBotMessageEvent): Promise<void> {
    const groupId = event.group_id ? String(event.group_id) : null;
    if (!groupId) {
      return;
    }

    const { command, error } = parseCommand(extractMessageText(event));
    if (!command && !error) {
      return;
    }

    if (error) {
      await this.reply(groupId, error);
      return;
    }

    await this.executeCommand(groupId, command!);
  }

  private async executeCommand(groupId: string, command: BotCommand): Promise<void> {
    switch (command.type) {
      case 'on':
        this.subscriptionService.enableGroup(groupId);
        await this.reply(groupId, 'enabled');
        return;
      case 'off':
        this.subscriptionService.disableGroup(groupId);
        await this.reply(groupId, 'disabled');
        return;
      case 'help':
        await this.reply(groupId, helpText());
        return;
      case 'list':
        await this.reply(groupId, formatGroupState(this.subscriptionService.getGroup(groupId)));
        return;
      case 'sub':
        this.subscriptionService.subscribePrefix(groupId, command.prefix);
        await this.reply(groupId, `subscribed ${command.prefix}`);
        return;
      case 'unsub':
        this.subscriptionService.unsubscribePrefix(groupId, command.prefix);
        await this.reply(groupId, `unsubscribed ${command.prefix}`);
        return;
      case 'region': {
        const group = this.subscriptionService.setRegionFilter(
          groupId,
          command.prefix,
          command.provinces,
        );
        const current = group.prefixes.find((item) => item.prefix === command.prefix);
        await this.reply(
          groupId,
          `${command.prefix} regions: ${current?.regions.join(', ') ?? 'all regions'}`,
        );
        return;
      }
      case 'unregion':
        this.subscriptionService.clearRegionFilter(groupId, command.prefix);
        await this.reply(groupId, `${command.prefix} region filter cleared`);
        return;
      case 'check': {
        const group = this.subscriptionService.getGroup(groupId);
        if (!group || !group.enabled) {
          await this.reply(groupId, 'enable first with /on');
          return;
        }

        await this.reply(groupId, 'checking');
        const result = await this.pollingCoordinator.runOnce(groupId);
        if (result === null) {
          await this.reply(groupId, 'another run is active');
          return;
        }

        if (result.sessionStatus === 'AUTH_EXPIRED') {
          await this.reply(groupId, 'CHSI session expired');
          return;
        }

        await this.reply(
          groupId,
          `done: ${result.newListingCount} new, ${result.updatedListingCount} updated`,
        );
        return;
      }
    }
  }

  private async reply(groupId: string, message: string): Promise<void> {
    await this.oneBotClient.sendGroupMessage(groupId, message);
  }
}
