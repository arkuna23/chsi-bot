import { chromium } from 'playwright';

import { loadConfig } from '../src/app/config';
import { ensureParentDirectory } from '../src/shared/fs';

async function main(): Promise<void> {
  const config = loadConfig({ requireBot: false });
  ensureParentDirectory(config.chsiStorageStatePath);

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto('https://yz.chsi.com.cn/sytj/tjyx/qecx.action', { waitUntil: 'networkidle' });
  console.log('Log in manually, then press Enter in this terminal to save storageState.');

  process.stdin.resume();
  await new Promise<void>((resolve) => {
    process.stdin.once('data', () => resolve());
  });

  await context.storageState({ path: config.chsiStorageStatePath });
  await browser.close();
  console.log(`Saved storage state to ${config.chsiStorageStatePath}`);
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
