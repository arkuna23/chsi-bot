import { DatabaseSync } from 'node:sqlite';

import type {
  GroupSubscription,
  PrefixSubscription,
  StoredAdjustmentListing,
} from '../types/domain';
import { ensureParentDirectory } from '../shared/fs';
import { nowIso } from '../shared/time';

interface ListingRow {
  stable_key: string;
  source_id: string | null;
  year: number;
  province: string;
  school_name: string;
  school_id: string | null;
  major_code: string;
  major_name: string;
  research_direction: string | null;
  learning_mode: string | null;
  special_program: string | null;
  matched_prefix: string;
  raw_payload: string;
  snapshot_hash: string;
  first_seen_at: string;
  last_seen_at: string;
}

interface GroupRow {
  group_id: string;
  enabled: number;
  created_at: string;
  updated_at: string;
}

interface PrefixRow {
  group_id: string;
  prefix: string;
  created_at: string;
  updated_at: string;
}

function toStoredListing(row: ListingRow): StoredAdjustmentListing {
  return {
    stableKey: row.stable_key,
    sourceId: row.source_id,
    year: row.year,
    province: row.province,
    schoolName: row.school_name,
    schoolId: row.school_id,
    majorCode: row.major_code,
    majorName: row.major_name,
    researchDirection: row.research_direction,
    learningMode: row.learning_mode,
    specialProgram: row.special_program,
    matchedPrefix: row.matched_prefix,
    rawPayload: JSON.parse(row.raw_payload) as StoredAdjustmentListing['rawPayload'],
    snapshotHash: row.snapshot_hash,
    firstSeenAt: row.first_seen_at,
    lastSeenAt: row.last_seen_at,
  };
}

export class SqliteDatabase {
  private readonly db: DatabaseSync;

  constructor(dbPath: string) {
    ensureParentDirectory(dbPath);
    this.db = new DatabaseSync(dbPath);
    this.db.exec('PRAGMA foreign_keys = ON');
  }

  init(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS group_subscription (
        group_id TEXT PRIMARY KEY,
        enabled INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS group_prefix_subscription (
        group_id TEXT NOT NULL,
        prefix TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (group_id, prefix),
        FOREIGN KEY (group_id) REFERENCES group_subscription(group_id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS group_region_subscription (
        group_id TEXT NOT NULL,
        prefix TEXT NOT NULL,
        province TEXT NOT NULL,
        created_at TEXT NOT NULL,
        PRIMARY KEY (group_id, prefix, province),
        FOREIGN KEY (group_id, prefix) REFERENCES group_prefix_subscription(group_id, prefix) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS adjustment_listing (
        stable_key TEXT PRIMARY KEY,
        source_id TEXT,
        year INTEGER NOT NULL,
        province TEXT NOT NULL,
        school_name TEXT NOT NULL,
        school_id TEXT,
        major_code TEXT NOT NULL,
        major_name TEXT NOT NULL,
        research_direction TEXT,
        learning_mode TEXT,
        special_program TEXT,
        matched_prefix TEXT NOT NULL,
        raw_payload TEXT NOT NULL,
        snapshot_hash TEXT NOT NULL,
        first_seen_at TEXT NOT NULL,
        last_seen_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS crawl_checkpoint (
        prefix TEXT PRIMARY KEY,
        last_crawled_at TEXT,
        last_status TEXT NOT NULL,
        last_error TEXT
      );

      CREATE TABLE IF NOT EXISTS notification_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        group_id TEXT NOT NULL,
        sent_at TEXT NOT NULL,
        summary TEXT NOT NULL
      );
    `);
  }

  close(): void {
    this.db.close();
  }

  ensureGroup(groupId: string): void {
    const timestamp = nowIso();
    this.db
      .prepare(
        `
          INSERT INTO group_subscription (group_id, enabled, created_at, updated_at)
          VALUES (@groupId, 0, @timestamp, @timestamp)
          ON CONFLICT(group_id) DO UPDATE SET updated_at = excluded.updated_at
        `,
      )
      .run({ groupId, timestamp });
  }

  setGroupEnabled(groupId: string, enabled: boolean): void {
    this.ensureGroup(groupId);
    this.db
      .prepare(
        `
          UPDATE group_subscription
          SET enabled = @enabled, updated_at = @timestamp
          WHERE group_id = @groupId
        `,
      )
      .run({ groupId, enabled: enabled ? 1 : 0, timestamp: nowIso() });
  }

  addPrefixSubscription(groupId: string, prefix: string): void {
    this.ensureGroup(groupId);
    const timestamp = nowIso();
    this.db
      .prepare(
        `
          INSERT INTO group_prefix_subscription (group_id, prefix, created_at, updated_at)
          VALUES (@groupId, @prefix, @timestamp, @timestamp)
          ON CONFLICT(group_id, prefix) DO UPDATE SET updated_at = excluded.updated_at
        `,
      )
      .run({ groupId, prefix, timestamp });
  }

  removePrefixSubscription(groupId: string, prefix: string): void {
    this.db
      .prepare('DELETE FROM group_prefix_subscription WHERE group_id = ? AND prefix = ?')
      .run(groupId, prefix);
  }

  setRegions(groupId: string, prefix: string, provinces: string[]): void {
    const timestamp = nowIso();
    const insert = this.db.prepare(
      `
        INSERT INTO group_region_subscription (group_id, prefix, province, created_at)
        VALUES (@groupId, @prefix, @province, @timestamp)
      `,
    );
    const remove = this.db.prepare(
      'DELETE FROM group_region_subscription WHERE group_id = ? AND prefix = ?',
    );
    this.db.exec('BEGIN');
    try {
      remove.run(groupId, prefix);
      for (const province of provinces) {
        insert.run({ groupId, prefix, province, timestamp });
      }
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  clearRegions(groupId: string, prefix: string): void {
    this.db
      .prepare('DELETE FROM group_region_subscription WHERE group_id = ? AND prefix = ?')
      .run(groupId, prefix);
  }

  getGroup(groupId: string): GroupSubscription | null {
    const group = this.db
      .prepare('SELECT * FROM group_subscription WHERE group_id = ?')
      .get(groupId) as GroupRow | undefined;
    if (!group) {
      return null;
    }

    return this.buildGroupSubscription(group);
  }

  listEnabledGroups(): GroupSubscription[] {
    const groups = this.db
      .prepare('SELECT * FROM group_subscription WHERE enabled = 1 ORDER BY group_id')
      .all() as unknown as GroupRow[];
    return groups.map((group: GroupRow) => this.buildGroupSubscription(group));
  }

  listGroupPrefixes(groupId: string): PrefixSubscription[] {
    const prefixes = this.db
      .prepare(
        'SELECT * FROM group_prefix_subscription WHERE group_id = ? ORDER BY length(prefix), prefix',
      )
      .all(groupId) as unknown as PrefixRow[];
    return prefixes.map((prefix: PrefixRow) => this.buildPrefixSubscription(prefix));
  }

  listAllEnabledPrefixes(): string[] {
    const rows = this.db
      .prepare(
        `
          SELECT DISTINCT gps.prefix AS prefix
          FROM group_prefix_subscription gps
          INNER JOIN group_subscription gs ON gs.group_id = gps.group_id
          WHERE gs.enabled = 1
          ORDER BY length(gps.prefix), gps.prefix
        `,
      )
      .all() as Array<{ prefix: string }>;
    return rows.map((row: { prefix: string }) => row.prefix);
  }

  getStoredListings(stableKeys: string[]): Map<string, StoredAdjustmentListing> {
    if (stableKeys.length === 0) {
      return new Map();
    }

    const placeholders = stableKeys.map(() => '?').join(', ');
    const statement = this.db.prepare(
      `SELECT * FROM adjustment_listing WHERE stable_key IN (${placeholders})`,
    ) as unknown as {
      all: (...args: string[]) => ListingRow[];
    };
    const rows = statement.all(...stableKeys);

    return new Map<string, StoredAdjustmentListing>(
      rows.map((row: ListingRow) => [row.stable_key, toStoredListing(row)]),
    );
  }

  upsertListings(listings: StoredAdjustmentListing[]): void {
    if (listings.length === 0) {
      return;
    }

    const statement = this.db.prepare(`
      INSERT INTO adjustment_listing (
        stable_key,
        source_id,
        year,
        province,
        school_name,
        school_id,
        major_code,
        major_name,
        research_direction,
        learning_mode,
        special_program,
        matched_prefix,
        raw_payload,
        snapshot_hash,
        first_seen_at,
        last_seen_at
      ) VALUES (
        @stableKey,
        @sourceId,
        @year,
        @province,
        @schoolName,
        @schoolId,
        @majorCode,
        @majorName,
        @researchDirection,
        @learningMode,
        @specialProgram,
        @matchedPrefix,
        @rawPayload,
        @snapshotHash,
        @firstSeenAt,
        @lastSeenAt
      )
      ON CONFLICT(stable_key) DO UPDATE SET
        source_id = excluded.source_id,
        year = excluded.year,
        province = excluded.province,
        school_name = excluded.school_name,
        school_id = excluded.school_id,
        major_code = excluded.major_code,
        major_name = excluded.major_name,
        research_direction = excluded.research_direction,
        learning_mode = excluded.learning_mode,
        special_program = excluded.special_program,
        matched_prefix = excluded.matched_prefix,
        raw_payload = excluded.raw_payload,
        snapshot_hash = excluded.snapshot_hash,
        last_seen_at = excluded.last_seen_at
    `);

    this.db.exec('BEGIN');
    try {
      for (const listing of listings) {
        statement.run({
          ...listing,
          rawPayload: JSON.stringify(listing.rawPayload),
        });
      }
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  updateCheckpoint(prefix: string, status: string, error: string | null): void {
    this.db
      .prepare(
        `
          INSERT INTO crawl_checkpoint (prefix, last_crawled_at, last_status, last_error)
          VALUES (@prefix, @timestamp, @status, @error)
          ON CONFLICT(prefix) DO UPDATE SET
            last_crawled_at = excluded.last_crawled_at,
            last_status = excluded.last_status,
            last_error = excluded.last_error
        `,
      )
      .run({ prefix, timestamp: nowIso(), status, error });
  }

  insertNotificationLog(groupId: string, summary: string): void {
    this.db
      .prepare(
        `
          INSERT INTO notification_log (group_id, sent_at, summary)
          VALUES (?, ?, ?)
        `,
      )
      .run(groupId, nowIso(), summary);
  }

  private buildGroupSubscription(group: GroupRow): GroupSubscription {
    return {
      groupId: group.group_id,
      enabled: group.enabled === 1,
      createdAt: group.created_at,
      updatedAt: group.updated_at,
      prefixes: this.listGroupPrefixes(group.group_id),
    };
  }

  private buildPrefixSubscription(prefix: PrefixRow): PrefixSubscription {
    const regionRows = this.db
      .prepare(
        'SELECT province FROM group_region_subscription WHERE group_id = ? AND prefix = ? ORDER BY province',
      )
      .all(prefix.group_id, prefix.prefix) as Array<{ province: string }>;
    const regions = regionRows.map((row: { province: string }) => row.province);

    return {
      groupId: prefix.group_id,
      prefix: prefix.prefix,
      regions,
      createdAt: prefix.created_at,
      updatedAt: prefix.updated_at,
    };
  }
}
