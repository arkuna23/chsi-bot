import type { CrawlBatchResult, SessionStatus } from '../types/domain';
import { Logger } from '../shared/logger';
import { getRootPrefix, normalizePrefix } from '../shared/prefix';

import { ChsiApiClient } from './chsi-api-client';
import { AuthExpiredError } from './errors';

function groupPrefixesByRoot(prefixes: string[]): Map<string, string[]> {
  const grouped = new Map<string, string[]>();

  for (const rawPrefix of prefixes) {
    const prefix = normalizePrefix(rawPrefix);
    const rootPrefix = getRootPrefix(prefix);
    const current = grouped.get(rootPrefix) ?? [];

    if (!current.includes(prefix)) {
      current.push(prefix);
      current.sort((left, right) => left.length - right.length || left.localeCompare(right));
    }

    grouped.set(rootPrefix, current);
  }

  return grouped;
}

function filterListingsByPrefix(
  prefix: string,
  listings: Awaited<ReturnType<ChsiApiClient['fetchAllByPrefix']>>,
): Awaited<ReturnType<ChsiApiClient['fetchAllByPrefix']>> {
  return listings
    .filter((listing) => listing.majorCode.startsWith(prefix))
    .map((listing) => ({
      ...listing,
      matchedPrefix: prefix,
    }));
}

export class ChsiCrawlerService {
  constructor(
    private readonly apiClient: ChsiApiClient,
    private readonly logger: Logger = new Logger('ChsiCrawlerService'),
  ) {}

  async validateSession(): Promise<SessionStatus> {
    this.logger.info('Validating crawler session');
    return this.apiClient.validateSession();
  }

  async crawlByMajorPrefix(prefix: string) {
    const normalized = normalizePrefix(prefix);
    const requestPrefix = getRootPrefix(normalized);
    this.logger.info('Crawling single prefix via grouped strategy', {
      prefix: normalized,
      requestPrefix,
    });
    const listings = await this.apiClient.fetchAllByPrefix(requestPrefix);
    const filtered = filterListingsByPrefix(normalized, listings);
    this.logger.info('Finished single prefix crawl', {
      prefix: normalized,
      requestPrefix,
      listingCount: filtered.length,
    });
    return filtered;
  }

  async crawlByMajorPrefixes(prefixes: string[]): Promise<CrawlBatchResult> {
    const normalizedPrefixes = Array.from(new Set(prefixes.map((prefix) => normalizePrefix(prefix))));
    const groupedPrefixes = groupPrefixesByRoot(normalizedPrefixes);

    this.logger.info('Starting batch crawl', {
      prefixCount: normalizedPrefixes.length,
      prefixes: normalizedPrefixes,
      requestCount: groupedPrefixes.size,
      requestPrefixes: Array.from(groupedPrefixes.keys()),
    });
    const results = new Map<string, Awaited<ReturnType<ChsiApiClient['fetchAllByPrefix']>>>();
    const errors = new Map<string, string>();

    for (const [requestPrefix, requestedPrefixes] of groupedPrefixes) {
      try {
        this.logger.info('Crawling grouped prefixes', {
          requestPrefix,
          requestedPrefixes,
        });
        const listings = await this.apiClient.fetchAllByPrefix(requestPrefix);

        for (const prefix of requestedPrefixes) {
          const filtered = filterListingsByPrefix(prefix, listings);
          results.set(prefix, filtered);
          this.logger.info('Finished filtered prefix crawl', {
            requestPrefix,
            prefix,
            listingCount: filtered.length,
          });
        }
      } catch (error) {
        if (error instanceof AuthExpiredError) {
          this.logger.warn('Crawl stopped because CHSI session expired', {
            completedPrefixes: Array.from(results.keys()),
            failedRequestPrefix: requestPrefix,
          });
          return {
            results,
            errors,
            sessionStatus: 'AUTH_EXPIRED',
          };
        }

        const message = error instanceof Error ? error.message : String(error);
        for (const prefix of requestedPrefixes) {
          errors.set(prefix, message);
        }
        this.logger.error('Failed to crawl grouped prefixes', {
          requestPrefix,
          requestedPrefixes,
          error: message,
        });
      }
    }

    this.logger.info('Finished batch crawl', {
      successCount: results.size,
      errorCount: errors.size,
    });
    return {
      results,
      errors,
      sessionStatus: 'VALID',
    };
  }
}
