import { describe, expect, test } from 'vitest';

import { NotificationService } from '../src/subscription/notification-service';
import type { GroupSubscription, StoredAdjustmentListing } from '../src/types/domain';

function createService(): NotificationService {
  return new NotificationService({
    insertNotificationLog: () => undefined,
  } as never);
}

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
      regions: ['江苏'],
      createdAt: '2026-03-27T00:00:00.000Z',
      updatedAt: '2026-03-27T00:00:00.000Z',
    },
  ],
};

const listing: StoredAdjustmentListing = {
  stableKey: 'x',
  snapshotHash: 'y',
  firstSeenAt: '2026-03-27T00:00:00.000Z',
  lastSeenAt: '2026-03-27T00:00:00.000Z',
  sourceId: '1',
  year: 2026,
  province: '江苏',
  schoolName: '南京大学',
  schoolId: '10284',
  majorCode: '085400',
  majorName: '电子信息',
  researchDirection: null,
  learningMode: '1',
  specialProgram: '0',
  matchedPrefix: '08',
  rawPayload: {},
};

const secondListingSameSchool: StoredAdjustmentListing = {
  ...listing,
  stableKey: 'x2',
  snapshotHash: 'y2',
  sourceId: '2',
  majorCode: '085401',
  majorName: '人工智能',
};

describe('NotificationService', () => {
  test('prefers longest matching prefix and joins notification lines with newlines', () => {
    const messages = createService().buildMessages(group, [listing, secondListingSameSchool]);
    expect(messages).toHaveLength(1);
    expect(messages[0]).toBe(['0854 新增院校：南京大学', '关注地区：', '江苏：南京大学'].join('\n'));
  });
});
