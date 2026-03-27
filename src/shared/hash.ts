import { createHash } from 'node:crypto';

import type { AdjustmentListing, JsonValue } from '../types/domain';

function stableStringify(value: JsonValue): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }

  const entries = Object.entries(value).sort(([left], [right]) =>
    left.localeCompare(right, 'en'),
  );

  return `{${entries
    .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`)
    .join(',')}}`;
}

function hashText(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

export function createStableKey(listing: AdjustmentListing): string {
  const seed = [
    listing.sourceId ?? '',
    listing.province,
    listing.schoolId ?? '',
    listing.schoolName,
    listing.majorCode,
    listing.majorName,
    listing.researchDirection ?? '',
    listing.learningMode ?? '',
    listing.specialProgram ?? '',
  ].join('|');

  return hashText(seed);
}

export function createSnapshotHash(listing: AdjustmentListing): string {
  const seed = stableStringify({
    sourceId: listing.sourceId ?? null,
    year: listing.year,
    province: listing.province,
    schoolName: listing.schoolName,
    schoolId: listing.schoolId ?? null,
    majorCode: listing.majorCode,
    majorName: listing.majorName,
    researchDirection: listing.researchDirection ?? null,
    learningMode: listing.learningMode ?? null,
    specialProgram: listing.specialProgram ?? null,
    rawPayload: listing.rawPayload,
  });

  return hashText(seed);
}
