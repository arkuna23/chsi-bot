import { loadConfig } from '../src/app/config';
import { ChsiCookieProvider } from '../src/crawler/cookie-provider';
import { ChsiApiClient } from '../src/crawler/chsi-api-client';
import { DEFAULT_CHSI_API_CONFIG } from '../src/crawler/default-api-config';
import { writeJsonFile } from '../src/shared/fs';

async function main(): Promise<void> {
  const config = loadConfig({ requireBot: false });
  const client = new ChsiApiClient(config, new ChsiCookieProvider(config));
  const listings = await client.fetchAllByPrefix(process.argv[2] ?? '08');

  writeJsonFile(config.chsiApiConfigPath, {
    ...DEFAULT_CHSI_API_CONFIG,
    discoveredAt: new Date().toISOString(),
    sampleCount: listings.length,
    sampleMajorCode: listings[0]?.majorCode ?? null,
    sampleSchool: listings[0]?.schoolName ?? null,
  });

  console.log(`Verified API and wrote ${config.chsiApiConfigPath}`);
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
