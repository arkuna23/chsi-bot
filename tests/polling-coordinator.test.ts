import { describe, expect, test } from 'vitest';

import { PollingCoordinator } from '../src/scheduler/polling-coordinator';
import { Logger } from '../src/shared/logger';
import type { CrawlBatchResult, GroupSubscription, NewListingDiff } from '../src/types/domain';

const group: GroupSubscription = {
  groupId: '1',
  enabled: true,
  createdAt: '2026-03-27T00:00:00.000Z',
  updatedAt: '2026-03-27T00:00:00.000Z',
  prefixes: [
    {
      groupId: '1',
      prefix: '08',
      regions: [],
      createdAt: '2026-03-27T00:00:00.000Z',
      updatedAt: '2026-03-27T00:00:00.000Z',
    },
  ],
};

function createEmptyDiff(): NewListingDiff {
  return {
    newListings: [],
    updatedListings: [],
  };
}

describe('PollingCoordinator', () => {
  test('automatically re-logs in and retries once when session expires', async () => {
    const crawlResults: CrawlBatchResult[] = [
      {
        results: new Map(),
        errors: new Map(),
        sessionStatus: 'AUTH_EXPIRED',
      },
      {
        results: new Map([['08', []]]),
        errors: new Map(),
        sessionStatus: 'VALID',
      },
    ];
    const recoveryCalls: string[] = [];

    const coordinator = new PollingCoordinator(
      {
        listEnabledGroups: () => [group],
        getGroup: () => group,
      } as never,
      {
        crawlByMajorPrefixes: async () => crawlResults.shift()!,
      } as never,
      {
        recoverSession: async () => {
          recoveryCalls.push('recover');
          return 'AUTO_LOGIN_SUCCESS';
        },
      } as never,
      {
        detectNewListings: () => createEmptyDiff(),
      } as never,
      {
        buildMessages: () => [],
        recordNotification: () => undefined,
      } as never,
      {
        sendGroupMessage: async () => undefined,
      } as never,
      {
        updateCheckpoint: () => undefined,
      } as never,
      new Logger('test'),
      ['999'],
    );

    const result = await coordinator.runOnce();

    expect(result).not.toBeNull();
    expect(result?.sessionStatus).toBe('VALID');
    expect(result?.authRecoveryStatus).toBe('AUTO_LOGIN_SUCCESS');
    expect(recoveryCalls).toEqual(['recover']);
  });

  test('sends Chinese admin alert when auto login requires manual verification', async () => {
    const adminMessages: Array<{ groupId: string; message: string }> = [];

    const coordinator = new PollingCoordinator(
      {
        listEnabledGroups: () => [group],
        getGroup: () => group,
      } as never,
      {
        crawlByMajorPrefixes: async () => ({
          results: new Map(),
          errors: new Map(),
          sessionStatus: 'AUTH_EXPIRED',
        }),
      } as never,
      {
        recoverSession: async () => 'CHALLENGE_REQUIRED',
      } as never,
      {
        detectNewListings: () => createEmptyDiff(),
      } as never,
      {
        buildMessages: () => [],
        recordNotification: () => undefined,
      } as never,
      {
        sendGroupMessage: async (groupId: string, message: string) => {
          adminMessages.push({ groupId, message });
        },
      } as never,
      {
        updateCheckpoint: () => undefined,
      } as never,
      new Logger('test'),
      ['999'],
    );

    const result = await coordinator.runOnce();

    expect(result).not.toBeNull();
    expect(result?.sessionStatus).toBe('AUTH_EXPIRED');
    expect(result?.authRecoveryStatus).toBe('CHALLENGE_REQUIRED');
    expect(adminMessages).toEqual([
      {
        groupId: '999',
        message: 'CHSI 登录态已失效，自动重新登录遇到验证码或短信验证，请人工处理后再继续。',
      },
    ]);
  });
});
