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

describe('NotificationService', () => {
  test('prefers longest matching prefix', () => {
    const messages = createService().buildMessages(group, [listing]);
    expect(messages[0]).toContain('0854');
    expect(messages[1]).toContain('Jiangsu');
  });
});
