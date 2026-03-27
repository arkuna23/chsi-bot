import { describe, expect, test } from 'vitest';

import { ChsiCrawlerService } from '../src/crawler/chsi-crawler-service';
import type { AdjustmentListing, SessionStatus } from '../src/types/domain';

class FakeApiClient {
  readonly calls: string[] = [];

  constructor(
    private readonly listingsByPrefix: Record<string, AdjustmentListing[]>,
    private readonly errorByPrefix: Record<string, Error> = {},
  ) {}

  async validateSession(): Promise<SessionStatus> {
    return 'VALID';
  }

  async fetchAllByPrefix(prefix: string): Promise<AdjustmentListing[]> {
    this.calls.push(prefix);

    const error = this.errorByPrefix[prefix];
    if (error) {
      throw error;
    }

    return this.listingsByPrefix[prefix] ?? [];
  }
}

function createListing(majorCode: string, majorName: string): AdjustmentListing {
  return {
    sourceId: majorCode,
    year: 2026,
    province: '江苏',
    schoolName: '南京大学',
    schoolId: '10284',
    majorCode,
    majorName,
    researchDirection: null,
    learningMode: '1',
    specialProgram: '0',
    matchedPrefix: '08',
    rawPayload: {},
  };
}

describe('ChsiCrawlerService', () => {
  test('merges prefixes with the same first two digits into one request and filters locally', async () => {
    const apiClient = new FakeApiClient({
      '08': [
        createListing('081200', '计算机科学与技术'),
        createListing('085400', '电子信息'),
        createListing('080100', '力学'),
      ],
    });
    const service = new ChsiCrawlerService(apiClient as never);

    const result = await service.crawlByMajorPrefixes(['0812', '0854', '08']);

    expect(apiClient.calls).toEqual(['08']);
    expect(result.errors.size).toBe(0);
    expect(result.results.get('08')?.map((listing) => listing.majorCode)).toEqual([
      '081200',
      '085400',
      '080100',
    ]);
    expect(result.results.get('0812')?.map((listing) => listing.majorCode)).toEqual(['081200']);
    expect(result.results.get('0854')?.map((listing) => listing.majorCode)).toEqual(['085400']);
    expect(result.results.get('0812')?.[0]?.matchedPrefix).toBe('0812');
    expect(result.results.get('0854')?.[0]?.matchedPrefix).toBe('0854');
  });

  test('shares one root request error across every requested prefix under that root', async () => {
    const apiClient = new FakeApiClient({}, { '08': new Error('request failed') });
    const service = new ChsiCrawlerService(apiClient as never);

    const result = await service.crawlByMajorPrefixes(['0812', '0854']);

    expect(apiClient.calls).toEqual(['08']);
    expect(result.results.size).toBe(0);
    expect(result.errors.get('0812')).toBe('request failed');
    expect(result.errors.get('0854')).toBe('request failed');
  });
});
