import type { AppConfig } from '../app/config';

import { fileExists, readJsonFile, readTextFile } from '../shared/fs';

interface StorageStateCookie {
  name: string;
  value: string;
  domain: string;
}

interface StorageState {
  cookies: StorageStateCookie[];
}

function stripCookiePrefix(value: string): string {
  const normalized = value.trim();
  if (normalized.toLowerCase().startsWith('cookie:')) {
    return normalized.slice(7).trim();
  }
  return normalized;
}

function parseNetscapeCookieFile(raw: string): string | null {
  const pairs: string[] = [];

  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const columns = trimmed.split('\t');
    if (columns.length >= 7) {
      pairs.push(`${columns[5]}=${columns[6]}`);
    }
  }

  return pairs.length > 0 ? pairs.join('; ') : null;
}

function extractFromStorageState(state: StorageState): string | null {
  const cookies = state.cookies.filter((cookie) => cookie.domain.includes('chsi.com.cn'));
  if (cookies.length === 0) {
    return null;
  }

  return cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join('; ');
}

export class ChsiCookieProvider {
  private runtimeCookieHeader: string | null = null;

  constructor(private readonly config: AppConfig) {}

  setRuntimeCookieHeader(value: string): void {
    this.runtimeCookieHeader = stripCookiePrefix(value);
  }

  clearRuntimeCookieHeader(): void {
    this.runtimeCookieHeader = null;
  }

  getCookieHeader(): string {
    if (this.runtimeCookieHeader) {
      return this.runtimeCookieHeader;
    }

    if (this.config.chsiCookieHeader) {
      return stripCookiePrefix(this.config.chsiCookieHeader);
    }

    const fileHeader = this.readCookieFile();
    if (fileHeader) {
      return fileHeader;
    }

    const storageHeader = this.readStorageState();
    if (storageHeader) {
      return storageHeader;
    }

    const locations = [this.config.chsiStorageStatePath];
    if (this.config.chsiCookieFile) {
      locations.unshift(this.config.chsiCookieFile);
    }

    throw new Error(`no CHSI cookies found; checked ${locations.join(' and ')}`);
  }

  private readCookieFile(): string | null {
    if (!this.config.chsiCookieFile) {
      return null;
    }

    if (!fileExists(this.config.chsiCookieFile)) {
      return null;
    }

    const raw = readTextFile(this.config.chsiCookieFile);
    if (!raw) {
      return null;
    }

    const netscape = parseNetscapeCookieFile(raw);
    if (netscape) {
      return netscape;
    }

    return stripCookiePrefix(raw);
  }

  private readStorageState(): string | null {
    const storageState = readJsonFile<StorageState>(this.config.chsiStorageStatePath);
    if (!storageState) {
      return null;
    }

    return extractFromStorageState(storageState);
  }
}
