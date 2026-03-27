import { describe, expect, test } from 'vitest';

import {
  buildAuthExpiredMessage,
  buildCheckResultMessage,
  buildGroupStatusMessage,
  buildHelpMessage,
} from '../src/bot/message-formatter';
import type { GroupSubscription, PollRunResult } from '../src/types/domain';

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
    {
      groupId: '1',
      prefix: '0854',
      regions: ['江苏', '北京'],
      createdAt: '2026-03-27T00:00:00.000Z',
      updatedAt: '2026-03-27T00:00:00.000Z',
    },
  ],
};

describe('message formatter', () => {
  test('help text includes every command and explanation', () => {
    const message = buildHelpMessage();
    expect(message).toContain('/on');
    expect(message).toContain('说明：启用当前群的调剂监听功能。');
    expect(message).toContain('/help');
    expect(message).toContain('所有指令都必须以真实 @机器人 开头');
  });

  test('group status is rendered in Chinese', () => {
    const message = buildGroupStatusMessage(group);
    expect(message).toContain('当前群监听状态');
    expect(message).toContain('监听开关：已启用');
    expect(message).toContain('0854（地区细分：江苏、北京）');
  });

  test('check result includes errors and counts', () => {
    const result: PollRunResult = {
      prefixes: ['08', '0854'],
      crawledPrefixes: ['08'],
      sentGroups: ['1'],
      newListingCount: 3,
      updatedListingCount: 1,
      errors: { '0854': 'fetch failed' },
      sessionStatus: 'VALID',
      authRecoveryStatus: 'AUTO_LOGIN_SUCCESS',
    };

    const message = buildCheckResultMessage(result);
    expect(message).toContain('检查完成。');
    expect(message).toContain('系统已自动重新登录并完成本次检查');
    expect(message).toContain('新增记录：3 条');
    expect(message).toContain('0854：fetch failed');
  });

  test('auth expired message is rendered in Chinese for challenge flow', () => {
    const message = buildAuthExpiredMessage('CHALLENGE_REQUIRED');
    expect(message).toContain('登录态已失效');
    expect(message).toContain('验证码或短信验证');
  });
});
