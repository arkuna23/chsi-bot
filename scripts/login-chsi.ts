import fs from 'node:fs';
import { URLSearchParams } from 'node:url';

import { chromium, errors, type BrowserContext } from 'playwright';

import { loadConfig } from '../src/app/config';
import { DEFAULT_CHSI_API_CONFIG } from '../src/crawler/default-api-config';
import { ensureParentDirectory } from '../src/shared/fs';

const SYSTEM_CHROME_CANDIDATES = [
  '/usr/bin/google-chrome-stable',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
];
const CHSI_LOGIN_PAGE_URL = 'https://yz.chsi.com.cn/sytj/tjyx/qecx.action';
const LOGIN_CHECK_PREFIX = '08';
const LOGIN_CHECK_INTERVAL_MS = 3_000;
const LOGIN_PROGRESS_LOG_EVERY = 10;
const REQUEST_HEADERS = {
  Accept: 'application/json, text/javascript, */*; q=0.01',
  'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8',
  Referer: CHSI_LOGIN_PAGE_URL,
  'User-Agent':
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36',
  'X-Requested-With': 'XMLHttpRequest',
} as const;

interface BrowserCookie {
  name: string;
  value: string;
  domain: string;
}

interface ChsiProbeResponse {
  flag?: boolean;
  invokeStatus?: string;
}

function findSystemChromePath(): string | null {
  for (const candidate of SYSTEM_CHROME_CANDIDATES) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}

function extractCookieHeader(cookies: BrowserCookie[]): string | null {
  const pairs = cookies
    .filter((cookie) => cookie.domain.includes('chsi.com.cn'))
    .map((cookie) => `${cookie.name}=${cookie.value}`);

  return pairs.length > 0 ? pairs.join('; ') : null;
}

function isHtmlResponse(responseText: string): boolean {
  return /<!DOCTYPE html>|<html/i.test(responseText);
}

async function hasValidChsiSession(context: BrowserContext): Promise<boolean> {
  const cookies = await context.cookies([CHSI_LOGIN_PAGE_URL]);
  const cookieHeader = extractCookieHeader(cookies);
  if (!cookieHeader) {
    return false;
  }

  const params = new URLSearchParams({
    ...DEFAULT_CHSI_API_CONFIG.staticParams,
    [DEFAULT_CHSI_API_CONFIG.prefixParam]: LOGIN_CHECK_PREFIX,
    [DEFAULT_CHSI_API_CONFIG.pageParam ?? 'start']: '0',
    [DEFAULT_CHSI_API_CONFIG.pageSizeParam ?? 'pageSize']: '1',
  });

  try {
    const response = await fetch(DEFAULT_CHSI_API_CONFIG.queryUrl, {
      method: DEFAULT_CHSI_API_CONFIG.method,
      headers: {
        ...REQUEST_HEADERS,
        Cookie: cookieHeader,
      },
      body: params.toString(),
    });

    const text = await response.text();
    if (isHtmlResponse(text)) {
      return false;
    }

    const payload = JSON.parse(text) as ChsiProbeResponse;
    return payload.flag === true && payload.invokeStatus === 'SUCCESS';
  } catch {
    return false;
  }
}

async function waitForSuccessfulLogin(context: BrowserContext): Promise<void> {
  let checks = 0;

  for (;;) {
    if (await hasValidChsiSession(context)) {
      return;
    }

    checks += 1;
    if (checks % LOGIN_PROGRESS_LOG_EVERY === 0) {
      console.log('尚未检测到登录成功，继续等待中...');
    }

    await new Promise<void>((resolve) => {
      setTimeout(resolve, LOGIN_CHECK_INTERVAL_MS);
    });
  }
}

async function main(): Promise<void> {
  const config = loadConfig({ requireBot: false });
  ensureParentDirectory(config.chsiStorageStatePath);

  const chromePath = findSystemChromePath();
  if (!chromePath) {
    throw new Error(
      [
        '未找到系统 Chrome，可执行文件不存在。',
        '请先安装系统 Chrome，或自行修改登录脚本中的浏览器路径。',
      ].join('\n'),
    );
  }

  const browser = await chromium.launch({
    headless: false,
    executablePath: chromePath,
  });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    await page.goto(CHSI_LOGIN_PAGE_URL, {
      waitUntil: 'commit',
      timeout: 15000,
    });
  } catch (error) {
    if (!(error instanceof errors.TimeoutError)) {
      throw error;
    }

    console.warn('页面加载超时，已保留当前浏览器窗口。若页面已打开，可直接继续登录。');
  }

  console.log(`已使用系统 Chrome 启动浏览器：${chromePath}`);
  console.log('请先手动完成登录。脚本会自动检测登录状态，成功后自动保存并关闭浏览器。');

  await waitForSuccessfulLogin(context);

  await context.storageState({ path: config.chsiStorageStatePath });
  await browser.close();
  console.log(`已保存 storageState：${config.chsiStorageStatePath}`);
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
