import type { GroupSubscription } from '../types/domain';
import { Logger } from '../shared/logger';
import { normalizePrefix } from '../shared/prefix';
import { normalizeProvinceInput } from '../shared/provinces';
import { SqliteDatabase } from '../storage/database';

export class SubscriptionService {
  constructor(
    private readonly database: SqliteDatabase,
    private readonly logger: Logger = new Logger('SubscriptionService'),
  ) {}

  enableGroup(groupId: string): GroupSubscription {
    this.logger.info('Enabling group monitoring', { groupId });
    this.database.setGroupEnabled(groupId, true);
    const group = this.getGroupOrThrow(groupId);
    this.logger.info('Group monitoring enabled', {
      groupId,
      prefixCount: group.prefixes.length,
    });
    return group;
  }

  disableGroup(groupId: string): GroupSubscription {
    this.logger.info('Disabling group monitoring', { groupId });
    this.database.setGroupEnabled(groupId, false);
    const group = this.getGroupOrThrow(groupId);
    this.logger.info('Group monitoring disabled', {
      groupId,
      prefixCount: group.prefixes.length,
    });
    return group;
  }

  subscribePrefix(groupId: string, prefixInput: string): GroupSubscription {
    const prefix = normalizePrefix(prefixInput);
    this.logger.info('Subscribing prefix', { groupId, prefix });
    this.database.addPrefixSubscription(groupId, prefix);
    const group = this.getGroupOrThrow(groupId);
    this.logger.info('Prefix subscribed', {
      groupId,
      prefix,
      prefixCount: group.prefixes.length,
    });
    return group;
  }

  unsubscribePrefix(groupId: string, prefixInput: string): GroupSubscription {
    const prefix = normalizePrefix(prefixInput);
    this.logger.info('Unsubscribing prefix', { groupId, prefix });
    this.database.removePrefixSubscription(groupId, prefix);
    this.database.clearRegions(groupId, prefix);
    const group = this.getGroupOrThrow(groupId);
    this.logger.info('Prefix unsubscribed', {
      groupId,
      prefix,
      prefixCount: group.prefixes.length,
    });
    return group;
  }

  setRegionFilter(groupId: string, prefixInput: string, provinces: string[]): GroupSubscription {
    const prefix = normalizePrefix(prefixInput);
    const normalized = Array.from(new Set(provinces.map((province) => normalizeProvinceInput(province))));
    this.logger.info('Updating region filter', {
      groupId,
      prefix,
      regions: normalized,
    });
    this.database.addPrefixSubscription(groupId, prefix);
    this.database.setRegions(groupId, prefix, normalized);
    const group = this.getGroupOrThrow(groupId);
    this.logger.info('Region filter updated', {
      groupId,
      prefix,
      regions: normalized,
    });
    return group;
  }

  clearRegionFilter(groupId: string, prefixInput: string): GroupSubscription {
    const prefix = normalizePrefix(prefixInput);
    this.logger.info('Clearing region filter', { groupId, prefix });
    this.database.clearRegions(groupId, prefix);
    const group = this.getGroupOrThrow(groupId);
    this.logger.info('Region filter cleared', { groupId, prefix });
    return group;
  }

  getGroup(groupId: string): GroupSubscription | null {
    return this.database.getGroup(groupId);
  }

  getGroupOrThrow(groupId: string): GroupSubscription {
    const group = this.getGroup(groupId);
    if (!group) {
      throw new Error(`group not found: ${groupId}`);
    }
    return group;
  }

  listEnabledGroups(): GroupSubscription[] {
    const groups = this.database.listEnabledGroups();
    this.logger.debug('Loaded enabled groups', {
      groupCount: groups.length,
      groupIds: groups.map((group) => group.groupId),
    });
    return groups;
  }

  listEnabledPrefixes(): string[] {
    const prefixes = this.database.listAllEnabledPrefixes();
    this.logger.debug('Loaded enabled prefixes', {
      prefixCount: prefixes.length,
      prefixes,
    });
    return prefixes;
  }
}
