import type { GroupSubscription, PrefixSubscription, StoredAdjustmentListing } from '../types/domain';
import { toEnglishProvince } from '../shared/provinces';
import { normalizeWhitespace } from '../shared/text';
import { SqliteDatabase } from '../storage/database';

function findBestPrefix(group: GroupSubscription, majorCode: string): PrefixSubscription | null {
  const matches = group.prefixes.filter((prefix) => majorCode.startsWith(prefix.prefix));
  if (matches.length === 0) {
    return null;
  }

  return matches.sort((left, right) => right.prefix.length - left.prefix.length)[0];
}

function formatMajor(listing: StoredAdjustmentListing): string {
  return `${listing.majorCode} ${normalizeWhitespace(listing.majorName)}`;
}

function formatSummary(prefix: string, listings: StoredAdjustmentListing[]): string {
  const provinces = Array.from(new Set(listings.map((listing) => toEnglishProvince(listing.province)))).sort();
  return `${prefix}: ${listings.length} new listings in ${provinces.join(', ')}`;
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

  const grouped = new Map<string, Map<string, StoredAdjustmentListing[]>>();
  for (const listing of scoped) {
    const province = listing.province;
    const school = listing.schoolName;
    const schoolMap = grouped.get(province) ?? new Map<string, StoredAdjustmentListing[]>();
    const schoolListings = schoolMap.get(school) ?? [];
    schoolListings.push(listing);
    schoolMap.set(school, schoolListings);
    grouped.set(province, schoolMap);
  }

  const lines: string[] = [];
  for (const [province, schoolMap] of grouped) {
    for (const [school, schoolListings] of schoolMap) {
      const majors = Array.from(new Set(schoolListings.map((listing) => formatMajor(listing))));
      lines.push(
        `${toEnglishProvince(province)}: ${school} added ${majors.length} majors: ${majors.join(', ')}`,
      );
    }
  }
  return lines;
}

export class NotificationService {
  constructor(private readonly database: SqliteDatabase) {}

  buildMessages(group: GroupSubscription, newListings: StoredAdjustmentListing[]): string[] {
    if (newListings.length === 0 || group.prefixes.length === 0) {
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

      messages.push(formatSummary(prefix.prefix, listings));
      messages.push(...formatRegionDetails(prefix, listings));
    }
    return messages;
  }

  recordNotification(groupId: string, message: string): void {
    this.database.insertNotificationLog(groupId, message);
  }
}
