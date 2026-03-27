import { afterEach, describe, expect, test } from 'vitest';

import { loadConfig } from '../src/app/config';

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
});

describe('loadConfig', () => {
  test('reads CHSI automatic login credentials from environment variables', () => {
    process.env.CHSI_LOGIN_USERNAME = 'demo-user';
    process.env.CHSI_LOGIN_PASSWORD = 'demo-pass';

    const config = loadConfig({ requireBot: false });

    expect(config.chsiLoginUsername).toBe('demo-user');
    expect(config.chsiLoginPassword).toBe('demo-pass');
  });
});
