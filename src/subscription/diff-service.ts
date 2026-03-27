import type { AdjustmentListing, NewListingDiff, StoredAdjustmentListing } from '../types/domain';
import { createSnapshotHash, createStableKey } from '../shared/hash';
import { Logger } from '../shared/logger';
import { nowIso } from '../shared/time';
import { SqliteDatabase } from '../storage/database';

function choosePreferredListing(
  current: AdjustmentListing | undefined,
  candidate: AdjustmentListing,
): AdjustmentListing {
  if (!current) {
    return candidate;
  }

  if (candidate.matchedPrefix.length > current.matchedPrefix.length) {
    return candidate;
  }

  return current;
}

export class DiffService {
  constructor(
    private readonly database: SqliteDatabase,
    private readonly logger: Logger = new Logger('DiffService'),
  ) {}

  detectNewListings(listings: AdjustmentListing[]): NewListingDiff {
    this.logger.info('Starting diff detection', {
      inputCount: listings.length,
    });

    const dedupedMap = new Map<string, AdjustmentListing>();
    for (const listing of listings) {
      const stableKey = createStableKey(listing);
      dedupedMap.set(stableKey, choosePreferredListing(dedupedMap.get(stableKey), listing));
    }

    const dedupedEntries = Array.from(dedupedMap.entries());
    const existingMap = this.database.getStoredListings(dedupedEntries.map(([stableKey]) => stableKey));
    this.logger.debug('Prepared diff inputs', {
      dedupedCount: dedupedEntries.length,
      existingCount: existingMap.size,
    });
    const timestamp = nowIso();
    const upserts: StoredAdjustmentListing[] = [];
    const newListings: StoredAdjustmentListing[] = [];
    const updatedListings: StoredAdjustmentListing[] = [];

    for (const [stableKey, listing] of dedupedEntries) {
      const snapshotHash = createSnapshotHash(listing);
      const existing = existingMap.get(stableKey);
      const storedListing: StoredAdjustmentListing = {
        stableKey,
        snapshotHash,
        firstSeenAt: existing?.firstSeenAt ?? timestamp,
        lastSeenAt: timestamp,
        ...listing,
      };
      upserts.push(storedListing);

      if (!existing) {
        newListings.push(storedListing);
        continue;
      }

      if (existing.snapshotHash !== snapshotHash) {
        updatedListings.push(storedListing);
      }
    }

    this.database.upsertListings(upserts);
    this.logger.info('Finished diff detection', {
      upsertCount: upserts.length,
      newCount: newListings.length,
      updatedCount: updatedListings.length,
    });
    return { newListings, updatedListings };
  }
}
