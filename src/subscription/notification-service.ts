import type { GroupSubscription, PrefixSubscription, StoredAdjustmentListing } from '../types/domain';
import { Logger } from '../shared/logger';
import { normalizeProvinceInput } from '../shared/provinces';
import { normalizeWhitespace } from '../shared/text';
import { SqliteDatabase } from '../storage/database';

const MAX_SUMMARY_SCHOOLS = 6;
const MAX_REGION_SCHOOLS = 4;

function findBestPrefix(group: GroupSubscription, majorCode: string): PrefixSubscription | null {
  const matches = group.prefixes.filter((prefix) => majorCode.startsWith(prefix.prefix));
  if (matches.length === 0) {
    return null;
  }

  return matches.sort((left, right) => right.prefix.length - left.prefix.length)[0];
}

function normalizeSchoolName(name: string): string {
  return normalizeWhitespace(name);
}

function formatProvince(province: string): string {
  try {
    return normalizeProvinceInput(province);
  } catch {
    return province;
  }
}

function dedupeSchools(listings: StoredAdjustmentListing[]): string[] {
  return Array.from(new Set(listings.map((listing) => normalizeSchoolName(listing.schoolName)))).sort(
    (left, right) => left.localeCompare(right, 'zh-Hans-CN'),
  );
}

function formatSchoolList(schools: string[], maxVisible: number): string {
  if (schools.length <= maxVisible) {
    return schools.join('、');
  }

  return `${schools.slice(0, maxVisible).join('、')} 等${schools.length}所`;
}

function formatSummary(prefix: string, listings: StoredAdjustmentListing[]): string {
  const schools = dedupeSchools(listings);
  return `${prefix} 新增院校：${formatSchoolList(schools, MAX_SUMMARY_SCHOOLS)}`;
}

function formatRegionDetails(prefix: PrefixSubscription, listings: StoredAdjustmentListing[]): string[] {
  if (prefix.regions.length === 0) {
    return [];
  }

  const regionSet = new Set(prefix.regions);
  const scoped = listings.filter((listing) => regionSet.has(listing.province));
  if (scoped.length === 0) {
    return [];
  }

  const grouped = new Map<string, string[]>();
  for (const listing of scoped) {
    const province = formatProvince(listing.province);
    const schools = grouped.get(province) ?? [];
    schools.push(normalizeSchoolName(listing.schoolName));
    grouped.set(province, schools);
  }

  const regionParts: string[] = [];
  for (const region of prefix.regions) {
    const schools = grouped.get(region);
    if (!schools || schools.length === 0) {
      continue;
    }

    const dedupedSchools = Array.from(new Set(schools)).sort((left, right) =>
      left.localeCompare(right, 'zh-Hans-CN'),
    );
    regionParts.push(`${region}：${formatSchoolList(dedupedSchools, MAX_REGION_SCHOOLS)}`);
  }

  if (regionParts.length === 0) {
    return [];
  }

  return ['关注地区：', ...regionParts];
}

function buildPrefixMessage(prefix: PrefixSubscription, listings: StoredAdjustmentListing[]): string {
  const lines = [formatSummary(prefix.prefix, listings)];
  lines.push(...formatRegionDetails(prefix, listings));
  return lines.join('\n');
}

export class NotificationService {
  constructor(
    private readonly database: SqliteDatabase,
    private readonly logger: Logger = new Logger('NotificationService'),
  ) {}

  buildMessages(group: GroupSubscription, newListings: StoredAdjustmentListing[]): string[] {
    if (newListings.length === 0 || group.prefixes.length === 0) {
      this.logger.debug('Skipping notification build', {
        groupId: group.groupId,
        newListingCount: newListings.length,
        prefixCount: group.prefixes.length,
      });
      return [];
    }

    const grouped = new Map<string, StoredAdjustmentListing[]>();
    for (const listing of newListings) {
      const prefix = findBestPrefix(group, listing.majorCode);
      if (!prefix) {
        continue;
      }

      const items = grouped.get(prefix.prefix) ?? [];
      items.push(listing);
      grouped.set(prefix.prefix, items);
    }

    const messages: string[] = [];
    for (const prefix of group.prefixes.sort((left, right) => left.prefix.localeCompare(right.prefix))) {
      const listings = grouped.get(prefix.prefix);
      if (!listings || listings.length === 0) {
        continue;
      }

      messages.push(buildPrefixMessage(prefix, listings));
    }

    this.logger.info('Built notification messages', {
      groupId: group.groupId,
      newListingCount: newListings.length,
      matchedPrefixCount: grouped.size,
      messageCount: messages.length,
    });

    return messages;
  }

  recordNotification(groupId: string, message: string): void {
    this.logger.info('Recording notification', {
      groupId,
      length: message.length,
      preview: message.slice(0, 120),
    });
    this.database.insertNotificationLog(groupId, message);
  }
}
