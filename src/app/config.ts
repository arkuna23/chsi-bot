import path from 'node:path';

import dotenv from 'dotenv';

dotenv.config();

export interface AppConfig {
  oneBotWsUrl: string | null;
  oneBotAccessToken: string | null;
  sqlitePath: string;
  chsiStorageStatePath: string;
  chsiCookieFile: string | null;
  chsiCookieHeader: string | null;
  chsiApiConfigPath: string;
  chsiPageSize: number;
  chsiRequestIntervalMs: number;
  pollIntervalMinutes: number;
  adminGroupIds: string[];
}

export interface LoadConfigOptions {
  requireBot?: boolean;
}

function resolveAppPath(value: string, fallback: string): string {
  return path.resolve(process.cwd(), value || fallback);
}

function resolveOptionalAppPath(value: string | undefined): string | null {
  const normalized = value?.trim();
  if (!normalized) {
    return null;
  }

  return path.resolve(process.cwd(), normalized);
}

function parseInteger(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`invalid integer env value: ${value}`);
  }

  return parsed;
}

export function loadConfig(options: LoadConfigOptions = {}): AppConfig {
  const requireBot = options.requireBot ?? true;
  const oneBotWsUrl = process.env.ONEBOT_WS_URL?.trim() || null;

  if (requireBot && !oneBotWsUrl) {
    throw new Error('ONEBOT_WS_URL is required');
  }

  return {
    oneBotWsUrl,
    oneBotAccessToken: process.env.ONEBOT_ACCESS_TOKEN?.trim() || null,
    sqlitePath: resolveAppPath(process.env.SQLITE_PATH ?? '', 'data/chsi-bot.sqlite'),
    chsiStorageStatePath: resolveAppPath(
      process.env.CHSI_STORAGE_STATE_PATH ?? '',
      'data/chsi-storage-state.json',
    ),
    chsiCookieFile: resolveOptionalAppPath(process.env.CHSI_COOKIE_FILE),
    chsiCookieHeader: process.env.CHSI_COOKIE_HEADER?.trim() || null,
    chsiApiConfigPath: resolveAppPath(
      process.env.CHSI_API_CONFIG_PATH ?? '',
      'data/chsi-api-config.json',
    ),
    chsiPageSize: parseInteger(process.env.CHSI_PAGE_SIZE, 100),
    chsiRequestIntervalMs: parseInteger(process.env.CHSI_REQUEST_INTERVAL_MS, 1500),
    pollIntervalMinutes: parseInteger(process.env.POLL_INTERVAL_MINUTES, 30),
    adminGroupIds: (process.env.ADMIN_GROUP_IDS ?? '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean),
  };
}
