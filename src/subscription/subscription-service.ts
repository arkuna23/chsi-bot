import type { GroupSubscription } from '../types/domain';
import { normalizePrefix } from '../shared/prefix';
import { normalizeProvinceInput } from '../shared/provinces';
import { SqliteDatabase } from '../storage/database';

export class SubscriptionService {
  constructor(private readonly database: SqliteDatabase) {}

  enableGroup(groupId: string): GroupSubscription {
    this.database.setGroupEnabled(groupId, true);
    return this.getGroupOrThrow(groupId);
  }

  disableGroup(groupId: string): GroupSubscription {
    this.database.setGroupEnabled(groupId, false);
    return this.getGroupOrThrow(groupId);
  }

  subscribePrefix(groupId: string, prefixInput: string): GroupSubscription {
    const prefix = normalizePrefix(prefixInput);
    this.database.addPrefixSubscription(groupId, prefix);
    return this.getGroupOrThrow(groupId);
  }

  unsubscribePrefix(groupId: string, prefixInput: string): GroupSubscription {
    const prefix = normalizePrefix(prefixInput);
    this.database.removePrefixSubscription(groupId, prefix);
    this.database.clearRegions(groupId, prefix);
    return this.getGroupOrThrow(groupId);
  }

  setRegionFilter(groupId: string, prefixInput: string, provinces: string[]): GroupSubscription {
    const prefix = normalizePrefix(prefixInput);
    const normalized = Array.from(new Set(provinces.map((province) => normalizeProvinceInput(province))));
    this.database.addPrefixSubscription(groupId, prefix);
    this.database.setRegions(groupId, prefix, normalized);
    return this.getGroupOrThrow(groupId);
  }

  clearRegionFilter(groupId: string, prefixInput: string): GroupSubscription {
    const prefix = normalizePrefix(prefixInput);
    this.database.clearRegions(groupId, prefix);
    return this.getGroupOrThrow(groupId);
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
    return this.database.listEnabledGroups();
  }

  listEnabledPrefixes(): string[] {
    return this.database.listAllEnabledPrefixes();
  }
}
