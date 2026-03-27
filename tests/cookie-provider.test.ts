import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, test } from 'vitest';

import { ChsiCookieProvider } from '../src/crawler/cookie-provider';

const tempDirectories: string[] = [];

function createTempDirectory(): string {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'chsi-cookie-provider-'));
  tempDirectories.push(directory);
  return directory;
}

afterEach(() => {
  while (tempDirectories.length > 0) {
    const directory = tempDirectories.pop()!;
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe('ChsiCookieProvider', () => {
  test('prefers runtime cookie header over configured sources', () => {
    const tempDirectory = createTempDirectory();
    const storageStatePath = path.join(tempDirectory, 'storage-state.json');

    fs.writeFileSync(
      storageStatePath,
      JSON.stringify({
        cookies: [{ name: 'state', value: '1', domain: '.chsi.com.cn' }],
      }),
      'utf8',
    );

    const provider = new ChsiCookieProvider({
      chsiCookieHeader: 'config=1',
      chsiCookieFile: null,
      chsiStorageStatePath: storageStatePath,
    } as never);

    provider.setRuntimeCookieHeader('runtime=1');
    expect(provider.getCookieHeader()).toBe('runtime=1');

    provider.clearRuntimeCookieHeader();
    expect(provider.getCookieHeader()).toBe('config=1');
  });
});
