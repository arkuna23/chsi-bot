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

const thirdListingAnotherSchool: StoredAdjustmentListing = {
  ...listing,
  stableKey: 'x3',
  snapshotHash: 'y3',
  sourceId: '3',
  schoolName: '苏州大学',
  schoolId: '10285',
  majorCode: '085402',
  majorName: '通信工程',
};

describe('NotificationService', () => {
  test('prefers longest matching prefix and renders all schools with region majors', () => {
    const messages = createService().buildMessages(group, [
      listing,
      secondListingSameSchool,
      thirdListingAnotherSchool,
    ]);
    expect(messages).toHaveLength(1);
    expect(messages[0]).toBe(
      [
        '0854 新增 3 条，涉及 2 所院校：南京大学、苏州大学',
        '关注地区：',
        '江苏：南京大学（085400 电子信息、085401 人工智能）；苏州大学（085402 通信工程）',
      ].join('\n'),
    );
  });

  test('caps summary school names at 20 while keeping total counts', () => {
    const manySchools = Array.from({ length: 21 }, (_, index) => ({
      ...listing,
      stableKey: `many-${index + 1}`,
      snapshotHash: `hash-${index + 1}`,
      sourceId: String(index + 1),
      schoolName: `学校${String(index + 1).padStart(2, '0')}`,
      schoolId: `10${index + 1}`,
      majorCode: '080100',
      majorName: `专业${index + 1}`,
    }));

    const messages = createService().buildMessages(
      {
        ...group,
        prefixes: [
          {
            ...group.prefixes[0],
            prefix: '08',
            regions: [],
          },
        ],
      },
      manySchools,
    );

    expect(messages).toHaveLength(1);
    expect(messages[0]).toContain('08 新增 21 条，涉及 21 所院校：');
    expect(messages[0]).toContain('学校01');
    expect(messages[0]).toContain('学校20');
    expect(messages[0]).not.toContain('学校21');
    expect(messages[0]).toContain('仅展示前20所');
  });
});
