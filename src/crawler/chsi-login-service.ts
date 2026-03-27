import fs from 'node:fs';
import { URLSearchParams } from 'node:url';

import {
  chromium,
  errors,
  type Browser,
  type BrowserContext,
  type Locator,
  type Page,
} from 'playwright';

import type { AppConfig } from '../app/config';
import { ensureParentDirectory } from '../shared/fs';
import { Logger } from '../shared/logger';

import { DEFAULT_CHSI_API_CONFIG } from './default-api-config';

export type ChsiLoginResultStatus = 'SUCCESS' | 'FAILED' | 'CHALLENGE_REQUIRED';

export interface ChsiLoginResult {
  status: ChsiLoginResultStatus;
  message: string;
  cookieHeader: string | null;
}

interface BrowserCookie {
  name: string;
  value: string;
  domain: string;
}

interface ChsiProbeResponse {
  flag?: boolean;
  invokeStatus?: string;
}

interface ChsiLoginContext {
  browser: Browser;
  context: BrowserContext;
  page: Page;
  chromePath: string;
}

interface WaitForSessionOptions {
  timeoutMs: number | null;
  logProgress: boolean;
  abortOnChallenge: boolean;
}

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
const AUTO_LOGIN_TIMEOUT_MS = 30_000;
const LOGIN_FORM_WAIT_TIMEOUT_MS = 15_000;
const REQUEST_HEADERS = {
  Accept: 'application/json, text/javascript, */*; q=0.01',
  'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8',
  Referer: CHSI_LOGIN_PAGE_URL,
  'User-Agent':
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36',
  'X-Requested-With': 'XMLHttpRequest',
} as const;
const USERNAME_SELECTORS = [
  'input[name="username"]',
  'input#username',
  'input[name="loginId"]',
  'input[autocomplete="username"]',
  'input[type="text"]',
];
const PASSWORD_SELECTORS = [
  'input[name="password"]',
  'input#password',
  'input[autocomplete="current-password"]',
  'input[type="password"]',
];
const SUBMIT_SELECTORS = [
  'button[type="submit"]',
  'input[type="submit"]',
  'button:has-text("登录")',
  'a:has-text("登录")',
];
const CHALLENGE_PATTERNS = [/验证码/, /短信验证码/, /人机验证/, /安全验证/, /滑动验证/];
const CHALLENGE_SELECTORS = [
  'input[name*="captcha" i]',
  'input[name*="verify" i]',
  'input[name*="yzm" i]',
  'input[placeholder*="验证码"]',
];
const LOGIN_ERROR_PATTERNS = [/用户名或密码错误/, /账号或密码错误/, /密码错误/, /登录失败/, /用户不存在/];

function sleep(delayMs: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, delayMs);
  });
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

export class ChsiLoginService {
  constructor(
    private readonly config: AppConfig,
    private readonly logger: Logger = new Logger('ChsiLoginService'),
  ) {}

  async loginInteractively(): Promise<ChsiLoginResult> {
    return this.withHeadfulContext(async ({ context, page, chromePath }) => {
      await this.openLoginPage(page);
      await this.waitForLoginReady(page, context);

      this.logger.info('Interactive CHSI login browser opened', { chromePath });
      this.logger.info('Waiting for manual CHSI login');

      await this.waitForSuccessfulLogin(context, page, {
        timeoutMs: null,
        logProgress: true,
        abortOnChallenge: false,
      });

      return this.persistAuthenticatedState(context);
    });
  }

  async loginWithCredentials(username: string, password: string): Promise<ChsiLoginResult> {
    return this.withHeadfulContext(async ({ context, page, chromePath }) => {
      await this.openLoginPage(page);
      await this.waitForLoginReady(page, context);

      this.logger.info('Attempting automatic CHSI login', { chromePath });

      if (await this.hasValidChsiSession(context)) {
        this.logger.info('CHSI session was already valid before automatic login');
        return this.persistAuthenticatedState(context);
      }

      const credentialsFilled = await this.fillCredentials(page, username, password);
      if (!credentialsFilled) {
        this.logger.error('Failed to locate CHSI login form', await this.capturePageState(page));
        return {
          status: 'FAILED',
          message: '未找到 CHSI 登录表单，无法自动填写账号密码。',
          cookieHeader: null,
        };
      }

      const submitted = await this.submitLogin(page);
      if (!submitted) {
        this.logger.error(
          'Failed to locate CHSI login submit control',
          await this.capturePageState(page),
        );
        return {
          status: 'FAILED',
          message: '未找到 CHSI 登录按钮，无法提交登录表单。',
          cookieHeader: null,
        };
      }

      const waitResult = await this.waitForSuccessfulLogin(context, page, {
        timeoutMs: AUTO_LOGIN_TIMEOUT_MS,
        logProgress: false,
        abortOnChallenge: true,
      });

      if (waitResult) {
        return this.persistAuthenticatedState(context);
      }

      const failureMessage = await this.detectLoginFailureMessage(page);
      if (failureMessage) {
        return {
          status: 'FAILED',
          message: `自动重新登录失败：${failureMessage}`,
          cookieHeader: null,
        };
      }

      if (await this.detectChallenge(page)) {
        return {
          status: 'CHALLENGE_REQUIRED',
          message: '自动重新登录遇到验证码或短信验证，需要人工处理。',
          cookieHeader: null,
        };
      }

      return {
        status: 'FAILED',
        message: '自动重新登录失败，未在限定时间内恢复 CHSI 登录态。',
        cookieHeader: null,
      };
    });
  }

  private async withHeadfulContext<T>(
    action: (context: ChsiLoginContext) => Promise<T>,
  ): Promise<T> {
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

    try {
      const context = await browser.newContext();
      const page = await context.newPage();

      return await action({
        browser,
        context,
        page,
        chromePath,
      });
    } finally {
      await browser.close();
    }
  }

  private async openLoginPage(page: Page): Promise<void> {
    try {
      await page.goto(CHSI_LOGIN_PAGE_URL, {
        waitUntil: 'commit',
        timeout: 15_000,
      });
    } catch (error) {
      if (!(error instanceof errors.TimeoutError)) {
        throw error;
      }

      this.logger.warn('CHSI login page load timed out but browser remains open');
    }
  }

  private async waitForLoginReady(page: Page, context: BrowserContext): Promise<void> {
    const startedAt = Date.now();

    for (;;) {
      if (await this.hasValidChsiSession(context)) {
        this.logger.info('CHSI session is already valid while preparing login page');
        return;
      }

      const usernameField = await this.findVisibleLocator(page, USERNAME_SELECTORS);
      const passwordField = await this.findVisibleLocator(page, PASSWORD_SELECTORS);
      if (usernameField && passwordField) {
        this.logger.info('CHSI login form is ready', {
          url: page.url(),
        });
        return;
      }

      if (Date.now() - startedAt >= LOGIN_FORM_WAIT_TIMEOUT_MS) {
        this.logger.warn(
          'Timed out waiting for CHSI login form to appear',
          await this.capturePageState(page),
        );
        return;
      }

      await sleep(300);
    }
  }

  private async fillCredentials(page: Page, username: string, password: string): Promise<boolean> {
    const usernameField = await this.findVisibleLocator(page, USERNAME_SELECTORS);
    const passwordField = await this.findVisibleLocator(page, PASSWORD_SELECTORS);

    if (!usernameField || !passwordField) {
      return false;
    }

    await usernameField.fill(username);
    await passwordField.fill(password);
    return true;
  }

  private async submitLogin(page: Page): Promise<boolean> {
    const submitButton = await this.findVisibleLocator(page, SUBMIT_SELECTORS);
    if (submitButton) {
      await submitButton.click();
      return true;
    }

    const passwordField = await this.findVisibleLocator(page, PASSWORD_SELECTORS);
    if (!passwordField) {
      return false;
    }

    await passwordField.press('Enter');
    return true;
  }

  private async waitForSuccessfulLogin(
    context: BrowserContext,
    page: Page,
    options: WaitForSessionOptions,
  ): Promise<boolean> {
    let checks = 0;
    const startedAt = Date.now();

    for (;;) {
      if (await this.hasValidChsiSession(context)) {
        return true;
      }

      checks += 1;
      if (options.logProgress && checks % LOGIN_PROGRESS_LOG_EVERY === 0) {
        this.logger.info('尚未检测到登录成功，继续等待中...');
      }

      if (options.timeoutMs !== null && Date.now() - startedAt >= options.timeoutMs) {
        return false;
      }

      if (options.abortOnChallenge && (await this.detectChallenge(page))) {
        return false;
      }

      await sleep(LOGIN_CHECK_INTERVAL_MS);
    }
  }

  private async hasValidChsiSession(context: BrowserContext): Promise<boolean> {
    const cookieHeader = extractCookieHeader((await context.cookies()) as BrowserCookie[]);
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
    } catch (error) {
      this.logger.warn('Failed to probe CHSI login session', {
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  private async persistAuthenticatedState(context: BrowserContext): Promise<ChsiLoginResult> {
    const cookieHeader = extractCookieHeader((await context.cookies()) as BrowserCookie[]);
    if (!cookieHeader) {
      return {
        status: 'FAILED',
        message: '登录成功后未获取到 CHSI Cookie，无法保存会话。',
        cookieHeader: null,
      };
    }

    ensureParentDirectory(this.config.chsiStorageStatePath);
    await context.storageState({ path: this.config.chsiStorageStatePath });

    return {
      status: 'SUCCESS',
      message: `已保存 storageState：${this.config.chsiStorageStatePath}`,
      cookieHeader,
    };
  }

  private async detectChallenge(page: Page): Promise<boolean> {
    for (const selector of CHALLENGE_SELECTORS) {
      const locator = page.locator(selector).first();
      if (await locator.count()) {
        return true;
      }
    }

    const bodyText = await this.readBodyText(page);
    return CHALLENGE_PATTERNS.some((pattern) => pattern.test(bodyText));
  }

  private async detectLoginFailureMessage(page: Page): Promise<string | null> {
    const bodyText = await this.readBodyText(page);
    const matched = LOGIN_ERROR_PATTERNS.find((pattern) => pattern.test(bodyText));
    return matched ? matched.source.replace(/\\/g, '') : null;
  }

  private async readBodyText(page: Page): Promise<string> {
    try {
      const text = await page.locator('body').innerText();
      return text.trim();
    } catch {
      return '';
    }
  }

  private async findVisibleLocator(page: Page, selectors: string[]): Promise<Locator | null> {
    for (const selector of selectors) {
      const locator = page.locator(selector).first();
      if (!(await locator.count())) {
        continue;
      }

      try {
        if (await locator.isVisible()) {
          return locator;
        }
      } catch {
        continue;
      }
    }

    return null;
  }

  private async capturePageState(page: Page): Promise<{
    url: string;
    title: string;
    readyState: string;
    bodyText: string;
  }> {
    const readyState = await page.evaluate(() => document.readyState).catch(() => 'unknown');

    return {
      url: page.url(),
      title: await page.title().catch(() => ''),
      readyState,
      bodyText: (await this.readBodyText(page)).slice(0, 500),
    };
  }
}
