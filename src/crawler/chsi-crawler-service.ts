import type { CrawlBatchResult, SessionStatus } from '../types/domain';

import { ChsiApiClient } from './chsi-api-client';
import { AuthExpiredError } from './errors';

export class ChsiCrawlerService {
  constructor(private readonly apiClient: ChsiApiClient) {}

  async validateSession(): Promise<SessionStatus> {
    return this.apiClient.validateSession();
  }

  async crawlByMajorPrefix(prefix: string) {
    return this.apiClient.fetchAllByPrefix(prefix);
  }

  async crawlByMajorPrefixes(prefixes: string[]): Promise<CrawlBatchResult> {
    const results = new Map<string, Awaited<ReturnType<ChsiApiClient['fetchAllByPrefix']>>>();
    const errors = new Map<string, string>();

    for (const prefix of prefixes) {
      try {
        const listings = await this.apiClient.fetchAllByPrefix(prefix);
        results.set(prefix, listings);
      } catch (error) {
        if (error instanceof AuthExpiredError) {
          return {
            results,
            errors,
            sessionStatus: 'AUTH_EXPIRED',
          };
        }

        errors.set(prefix, error instanceof Error ? error.message : String(error));
      }
    }

    return {
      results,
      errors,
      sessionStatus: 'VALID',
    };
  }
}
