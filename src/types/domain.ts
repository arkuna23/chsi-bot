export type SessionStatus = 'VALID' | 'AUTH_EXPIRED' | 'UNKNOWN';

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];
export interface JsonObject {
  [key: string]: JsonValue;
}

export interface AdjustmentListing {
  sourceId?: string | null;
  year: number;
  province: string;
  schoolName: string;
  schoolId?: string | null;
  majorCode: string;
  majorName: string;
  researchDirection?: string | null;
  learningMode?: string | null;
  specialProgram?: string | null;
  matchedPrefix: string;
  rawPayload: JsonValue;
}

export interface StoredAdjustmentListing extends AdjustmentListing {
  stableKey: string;
  snapshotHash: string;
  firstSeenAt: string;
  lastSeenAt: string;
}

export interface NewListingDiff {
  newListings: StoredAdjustmentListing[];
  updatedListings: StoredAdjustmentListing[];
}

export interface PrefixSubscription {
  groupId: string;
  prefix: string;
  regions: string[];
  createdAt: string;
  updatedAt: string;
}

export interface GroupSubscription {
  groupId: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
  prefixes: PrefixSubscription[];
}

export interface CrawlCheckpoint {
  prefix: string;
  lastCrawledAt: string | null;
  lastStatus: string;
  lastError: string | null;
}

export interface CrawlBatchResult {
  results: Map<string, AdjustmentListing[]>;
  errors: Map<string, string>;
  sessionStatus: SessionStatus;
}

export interface ChsiApiConfig {
  queryUrl: string;
  method: 'GET' | 'POST';
  bodyType: 'query' | 'form' | 'json';
  responseType: 'json';
  staticParams: Record<string, string>;
  prefixParam: string;
  pageParam?: string;
  pageSizeParam?: string;
  pageSize?: number;
  discoveredAt: string;
}

export interface OneBotRequest {
  action: string;
  params?: Record<string, unknown>;
  echo: string;
}

export interface OneBotResponse<T = unknown> {
  status: 'ok' | 'failed';
  retcode: number;
  data?: T;
  wording?: string;
  echo?: string;
}

export interface OneBotTextSegment {
  type: 'text';
  data: {
    text?: string;
  };
}

export interface OneBotAtSegment {
  type: 'at';
  data: {
    qq?: string;
  };
}

export interface OneBotOtherSegment {
  type: string;
  data: Record<string, unknown>;
}

export type OneBotMessageSegment = OneBotTextSegment | OneBotAtSegment | OneBotOtherSegment;

export interface OneBotMessageEvent {
  post_type: 'message';
  message_type: 'group' | string;
  self_id?: number;
  group_id?: number;
  user_id?: number;
  raw_message?: string;
  message?: string | OneBotMessageSegment[];
}

export type BotCommand =
  | { type: 'on' }
  | { type: 'off' }
  | { type: 'help' }
  | { type: 'list' }
  | { type: 'check' }
  | { type: 'sub'; prefix: string }
  | { type: 'unsub'; prefix: string }
  | { type: 'region'; prefix: string; provinces: string[] }
  | { type: 'unregion'; prefix: string };

export interface ParsedCommand {
  command: BotCommand | null;
  error: string | null;
}

export interface PollRunResult {
  prefixes: string[];
  crawledPrefixes: string[];
  sentGroups: string[];
  newListingCount: number;
  updatedListingCount: number;
  errors: Record<string, string>;
  sessionStatus: SessionStatus;
}
