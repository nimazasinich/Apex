import {
  chromium,
  type Browser,
  type BrowserContext,
  type Page,
} from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

type LogEntry = {
  time: string;
  type: string;
  message: string;
  url?: string;
  line?: number;
  column?: number;
};

type FailedRequest = {
  time: string;
  method: string;
  url: string;
  resourceType: string;
  error: string;
};

type BadResponse = {
  time: string;
  status: number;
  statusText: string;
  method: string;
  url: string;
  resourceType: string;
};

type CaptureResult = {
  name: string;
  viewportScreenshot: string;
  fullPageScreenshot?: string;
  pageMetrics: Record<string, unknown>;
};

type ToolState = {
  name: 'scanner' | 'movers' | 'signals';
  selectors: string[];
};

const PROJECT_ROOT = resolve(process.cwd());
const OUT_DIR = resolve(
  PROJECT_ROOT,
  process.env.SCREENSHOT_OUT_DIR || '_qa/diag',
);

const BASE_URL = (process.env.BASE_URL || 'http://127.0.0.1:3000').replace(
  /\/+$/,
  '',
);
const ROUTE = process.env.ROUTE || '/#/overview';
const TARGET_URL = `${BASE_URL}${ROUTE}`;

const VIEWPORT = {
  width: readPositiveInteger('VIEWPORT_WIDTH', 1368),
  height: readPositiveInteger('VIEWPORT_HEIGHT', 753),
};

const DEVICE_SCALE_FACTOR = readPositiveNumber('DEVICE_SCALE_FACTOR', 1);
const HEADLESS = process.env.HEADLESS !== '0';
const CAPTURE_FULL_PAGE = process.env.CAPTURE_FULL_PAGE !== '0';
const CAPTURE_TOOL_STATES = process.env.CAPTURE_TOOL_STATES !== '0';
const APP_READY_SELECTOR = process.env.APP_READY_SELECTOR || 'body';
const POST_LOAD_WAIT_MS = readPositiveInteger('POST_LOAD_WAIT_MS', 1500);
const TRADING_DATA_WAIT_MS = readPositiveInteger('TRADING_DATA_WAIT_MS', 30_000);
const NAVIGATION_TIMEOUT_MS = readPositiveInteger(
  'NAVIGATION_TIMEOUT_MS',
  60_000,
);
const ACTION_TIMEOUT_MS = readPositiveInteger('ACTION_TIMEOUT_MS', 15_000);

const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const runDir = resolve(OUT_DIR, timestamp);

mkdirSync(runDir, { recursive: true });
mkdirSync(OUT_DIR, { recursive: true });

const consoleLogs: LogEntry[] = [];
const pageErrors: LogEntry[] = [];
const failedRequests: FailedRequest[] = [];
const badResponses: BadResponse[] = [];
const skippedStates: Array<{ name: string; reason: string }> = [];
const captures: CaptureResult[] = [];

const TOOL_STATES: ToolState[] = [
  {
    name: 'scanner',
    selectors: [
      '[data-tool="scanner"]',
      '[data-testid="tool-scanner"]',
      'button:has-text("Scanner")',
      '[role="button"]:has-text("Scanner")',
    ],
  },
  {
    name: 'movers',
    selectors: [
      '[data-tool="movers"]',
      '[data-testid="tool-movers"]',
      'button:has-text("Movers")',
      '[role="button"]:has-text("Movers")',
    ],
  },
  {
    name: 'signals',
    selectors: [
      '[data-tool="signals"]',
      '[data-testid="tool-signals"]',
      'button:has-text("Signals")',
      '[role="button"]:has-text("Signals")',
    ],
  },
];

function readPositiveInteger(name: string, fallback: number): number {
  const value = Number.parseInt(process.env[name] || '', 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function readPositiveNumber(name: string, fallback: number): number {
  const value = Number.parseFloat(process.env[name] || '');
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function now(): string {
  return new Date().toISOString();
}

function relativePath(absolutePath: string): string {
  return absolutePath.replace(`${PROJECT_ROOT}\\`, '').replace(`${PROJECT_ROOT}/`, '');
}

async function launchBrowser(): Promise<Browser> {
  const commonOptions = {
    headless: HEADLESS,
    args: [
      '--disable-dev-shm-usage',
      '--disable-features=TranslateUI',
      '--force-device-scale-factor=1',
      '--hide-scrollbars=false',
    ],
  };

  const preferredChannel = process.env.BROWSER_CHANNEL || 'msedge';

  try {
    return await chromium.launch({
      ...commonOptions,
      channel: preferredChannel,
    });
  } catch (error) {
    console.warn(
      `Could not launch "${preferredChannel}". Falling back to Playwright Chromium.`,
    );
    console.warn(String(error));
    return chromium.launch(commonOptions);
  }
}

function attachDiagnostics(page: Page): void {
  page.on('console', (message) => {
    const location = message.location();

    consoleLogs.push({
      time: now(),
      type: message.type(),
      message: message.text(),
      url: location.url || undefined,
      line: location.lineNumber,
      column: location.columnNumber,
    });
  });

  page.on('pageerror', (error) => {
    pageErrors.push({
      time: now(),
      type: 'pageerror',
      message: String(error.stack || error.message || error),
    });
  });

  page.on('requestfailed', (request) => {
    failedRequests.push({
      time: now(),
      method: request.method(),
      url: request.url(),
      resourceType: request.resourceType(),
      error: request.failure()?.errorText || 'Unknown request failure',
    });
  });

  page.on('response', (response) => {
    if (response.status() < 400) return;

    const request = response.request();

    badResponses.push({
      time: now(),
      status: response.status(),
      statusText: response.statusText(),
      method: request.method(),
      url: response.url(),
      resourceType: request.resourceType(),
    });
  });

  page.on('dialog', async (dialog) => {
    consoleLogs.push({
      time: now(),
      type: `dialog:${dialog.type()}`,
      message: dialog.message(),
    });

    await dialog.dismiss().catch(() => undefined);
  });
}

async function waitForAssets(page: Page): Promise<void> {
  await page.waitForSelector(APP_READY_SELECTOR, {
    state: 'visible',
    timeout: ACTION_TIMEOUT_MS,
  });

  await page
    .waitForLoadState('networkidle', { timeout: 12_000 })
    .catch(() => undefined);

  await page
    .evaluate(async () => {
      if ('fonts' in document) {
        await document.fonts.ready;
      }

      const pendingImages = Array.from(document.images).filter(
        (image) => !image.complete,
      );

      await Promise.all(
        pendingImages.map(
          (image) =>
            new Promise<void>((resolveImage) => {
              const finish = () => resolveImage();
              image.addEventListener('load', finish, { once: true });
              image.addEventListener('error', finish, { once: true });
              window.setTimeout(finish, 8_000);
            }),
        ),
      );
    })
    .catch(() => undefined);

  await waitForRouteData(page);
  await page.waitForTimeout(POST_LOAD_WAIT_MS);
  await waitForStableLayout(page);
}

async function waitForRouteData(page: Page): Promise<void> {
  if (!ROUTE.toLowerCase().includes('trading')) return;

  // The Trading route is honest about provider state and deliberately does not
  // draw synthetic candles. Wait until either a real chart has usable geometry
  // or the feed has definitively settled unavailable so visual QA never captures
  // the transient loading skeleton as if it were the final Trading UI.
  await page.waitForFunction(new Function(`
    const chart = document.querySelector('.apex-chart-svg');
    if (chart) {
      const rect = chart.getBoundingClientRect();
      if (rect.width >= 240 && rect.height >= 160) return true;
    }

    const feedState = document.querySelector('.apex-chart-feed-state');
    return Boolean(feedState && !feedState.classList.contains('loading'));
  `) as any, undefined, { timeout: TRADING_DATA_WAIT_MS }).catch(() => undefined);
}

async function waitForStableLayout(page: Page): Promise<void> {
  let stableChecks = 0;
  let previousSignature = '';

  for (let attempt = 0; attempt < 20; attempt += 1) {
    const signature = (await page.evaluate(new Function(`
      const root = document.documentElement;
      const body = document.body;

      return JSON.stringify({
        scrollWidth: Math.max(root.scrollWidth, body ? body.scrollWidth : 0),
        scrollHeight: Math.max(root.scrollHeight, body ? body.scrollHeight : 0),
        bodyRect: body
          ? {
              width: Math.round(body.getBoundingClientRect().width),
              height: Math.round(body.getBoundingClientRect().height),
            }
          : null,
      });
    `) as any)) as string;

    if (signature === previousSignature) {
      stableChecks += 1;
      if (stableChecks >= 3) return;
    } else {
      stableChecks = 0;
      previousSignature = signature;
    }

    await page.waitForTimeout(250);
  }
}

async function freezeVisualMotion(page: Page): Promise<void> {
  await page.addStyleTag({
    content: `
      html {
        scroll-behavior: auto !important;
      }

      *,
      *::before,
      *::after {
        animation-delay: 0s !important;
        animation-duration: 0s !important;
        animation-iteration-count: 1 !important;
        transition-delay: 0s !important;
        transition-duration: 0s !important;
        caret-color: transparent !important;
      }
    `,
  });

  await page.emulateMedia({
    colorScheme: 'light',
    reducedMotion: 'reduce',
  });

  await page.evaluate(async () => {
    window.scrollTo(0, 0);

    await new Promise<void>((resolveFrame) => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => resolveFrame());
      });
    });
  });
}

async function collectPageMetrics(page: Page): Promise<Record<string, unknown>> {
  return page.evaluate(new Function(`
    const root = document.documentElement;
    const body = document.body;

    function getRect(element) {
      if (!element) return null;
      const rect = element.getBoundingClientRect();
      return {
        x: Math.round(rect.x * 100) / 100,
        y: Math.round(rect.y * 100) / 100,
        width: Math.round(rect.width * 100) / 100,
        height: Math.round(rect.height * 100) / 100,
        right: Math.round(rect.right * 100) / 100,
        bottom: Math.round(rect.bottom * 100) / 100,
      };
    }

    const landmarks = Array.from(
      document.querySelectorAll(
        'header, nav, main, aside, [role="banner"], [role="navigation"], [role="main"], [role="complementary"]',
      ),
    )
      .slice(0, 30)
      .map(function(element) {
        const style = window.getComputedStyle(element);
        return {
          tag: element.tagName.toLowerCase(),
          id: element.id || null,
          role: element.getAttribute('role'),
          className:
            typeof element.className === 'string'
              ? element.className.slice(0, 250)
              : null,
          text: (element.textContent || '').trim().replace(/\\s+/g, ' ').slice(0, 160),
          rect: getRect(element),
          display: style.display,
          position: style.position,
          overflowX: style.overflowX,
          overflowY: style.overflowY,
        };
      });

    const fixedElements = Array.from(document.querySelectorAll('body *'))
      .filter(function(element) {
        const position = window.getComputedStyle(element).position;
        return position === 'fixed' || position === 'sticky';
      })
      .slice(0, 50)
      .map(function(element) {
        return {
          tag: element.tagName.toLowerCase(),
          id: element.id || null,
          className:
            typeof element.className === 'string'
              ? element.className.slice(0, 200)
              : null,
          position: window.getComputedStyle(element).position,
          rect: getRect(element),
        };
      });

    const scrollWidth = Math.max(root.scrollWidth, body ? body.scrollWidth : 0);
    const scrollHeight = Math.max(root.scrollHeight, body ? body.scrollHeight : 0);

    return {
      url: window.location.href,
      title: document.title,
      userAgent: navigator.userAgent,
      devicePixelRatio: window.devicePixelRatio,
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight,
      },
      document: {
        scrollWidth,
        scrollHeight,
        clientWidth: root.clientWidth,
        clientHeight: root.clientHeight,
        hasHorizontalScroll: scrollWidth > root.clientWidth,
        hasVerticalScroll: scrollHeight > root.clientHeight,
      },
      bodyRect: getRect(body),
      landmarks,
      fixedElements,
    };
  `) as any);
}

async function capture(
  page: Page,
  name: string,
): Promise<CaptureResult> {
  await page.evaluate(() => window.scrollTo(0, 0));
  await waitForStableLayout(page);
  await freezeVisualMotion(page);

  const viewportPath = resolve(runDir, `${name}-viewport.png`);
  const latestViewportPath = resolve(OUT_DIR, `latest-${name}-viewport.png`);

  const screenshotOptions = {
    type: 'png' as const,
    animations: 'disabled' as const,
    caret: 'hide' as const,
    scale: 'css' as const,
    omitBackground: false,
  };

  await page.screenshot({
    ...screenshotOptions,
    path: viewportPath,
    fullPage: false,
  });

  await page.screenshot({
    ...screenshotOptions,
    path: latestViewportPath,
    fullPage: false,
  });

  let fullPagePath: string | undefined;

  if (CAPTURE_FULL_PAGE) {
    fullPagePath = resolve(runDir, `${name}-full-page.png`);
    const latestFullPagePath = resolve(OUT_DIR, `latest-${name}-full-page.png`);

    await page.screenshot({
      ...screenshotOptions,
      path: fullPagePath,
      fullPage: true,
    });

    await page.screenshot({
      ...screenshotOptions,
      path: latestFullPagePath,
      fullPage: true,
    });
  }

  const result: CaptureResult = {
    name,
    viewportScreenshot: relativePath(viewportPath),
    fullPageScreenshot: fullPagePath
      ? relativePath(fullPagePath)
      : undefined,
    pageMetrics: await collectPageMetrics(page),
  };

  captures.push(result);
  return result;
}

async function clickFirstVisible(
  page: Page,
  selectors: string[],
): Promise<{ clicked: boolean; selector?: string; reason?: string }> {
  for (const selector of selectors) {
    const matches = page.locator(selector);
    const count = Math.min(await matches.count(), 10);

    for (let index = 0; index < count; index += 1) {
      const locator = matches.nth(index);

      try {
        if (!(await locator.isVisible())) continue;

        await locator.scrollIntoViewIfNeeded();
        await locator.click({ timeout: 5_000 });
        return { clicked: true, selector };
      } catch {
        // Try the next matching element or selector.
      }
    }
  }

  return {
    clicked: false,
    reason: `No visible element matched: ${selectors.join(', ')}`,
  };
}

async function captureToolStates(page: Page): Promise<void> {
  for (const state of TOOL_STATES) {
    const clickResult = await clickFirstVisible(page, state.selectors);

    if (!clickResult.clicked) {
      skippedStates.push({
        name: state.name,
        reason: clickResult.reason || 'Tool control not found.',
      });
      continue;
    }

    await page.waitForTimeout(500);
    await waitForAssets(page);
    await capture(page, state.name);
  }
}

async function createContext(browser: Browser): Promise<BrowserContext> {
  return browser.newContext({
    viewport: VIEWPORT,
    screen: VIEWPORT,
    deviceScaleFactor: DEVICE_SCALE_FACTOR,
    colorScheme: 'light',
    reducedMotion: 'reduce',
    locale: 'en-US',
    timezoneId: 'UTC',
    ignoreHTTPSErrors: true,
    serviceWorkers: 'allow',
  });
}

async function main(): Promise<void> {
  let browser: Browser | undefined;
  let context: BrowserContext | undefined;

  try {
    browser = await launchBrowser();
    context = await createContext(browser);

    const page = await context.newPage();
    page.setDefaultTimeout(ACTION_TIMEOUT_MS);
    page.setDefaultNavigationTimeout(NAVIGATION_TIMEOUT_MS);

    attachDiagnostics(page);

    const startedAt = now();

    const response = await page.goto(TARGET_URL, {
      waitUntil: 'domcontentloaded',
      timeout: NAVIGATION_TIMEOUT_MS,
    });

    if (!response) {
      throw new Error(`Navigation returned no response for ${TARGET_URL}`);
    }

    if (!response.ok()) {
      throw new Error(
        `Navigation failed: ${response.status()} ${response.statusText()} — ${TARGET_URL}`,
      );
    }

    await waitForAssets(page);
    await capture(page, 'overview');

    if (CAPTURE_TOOL_STATES) {
      await captureToolStates(page);
    }

    const finishedAt = now();

    const report = {
      ok: true,
      startedAt,
      finishedAt,
      targetUrl: TARGET_URL,
      viewport: VIEWPORT,
      deviceScaleFactor: DEVICE_SCALE_FACTOR,
      browserChannel: process.env.BROWSER_CHANNEL || 'msedge',
      headless: HEADLESS,
      captures,
      skippedStates,
      diagnostics: {
        consoleLogs,
        pageErrors,
        failedRequests,
        badResponses,
      },
    };

    const reportPath = resolve(runDir, 'report.json');
    const latestReportPath = resolve(OUT_DIR, 'latest-report.json');

    writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');
    writeFileSync(latestReportPath, JSON.stringify(report, null, 2), 'utf8');

    console.log(`OK: dashboard capture completed.`);
    console.log(`URL: ${TARGET_URL}`);
    console.log(`Run directory: ${runDir}`);
    console.log(`Viewport screenshot: ${resolve(runDir, 'overview-viewport.png')}`);

    if (CAPTURE_FULL_PAGE) {
      console.log(`Full-page screenshot: ${resolve(runDir, 'overview-full-page.png')}`);
    }

    console.log(`Diagnostics: ${reportPath}`);

    if (skippedStates.length > 0) {
      console.warn(
        `Skipped tool states: ${skippedStates
          .map((item) => item.name)
          .join(', ')}`,
      );
    }

    if (
      pageErrors.length > 0 ||
      failedRequests.length > 0 ||
      badResponses.length > 0
    ) {
      console.warn(
        `Diagnostics found issues: ${pageErrors.length} page errors, ` +
          `${failedRequests.length} failed requests, ` +
          `${badResponses.length} HTTP error responses.`,
      );
    }
  } catch (error) {
    const failureReport = {
      ok: false,
      time: now(),
      targetUrl: TARGET_URL,
      error: String(error instanceof Error ? error.stack || error.message : error),
      diagnostics: {
        consoleLogs,
        pageErrors,
        failedRequests,
        badResponses,
      },
    };

    writeFileSync(
      resolve(OUT_DIR, 'latest-failure.json'),
      JSON.stringify(failureReport, null, 2),
      'utf8',
    );

    console.error('Dashboard capture failed.');
    console.error(failureReport.error);
    process.exitCode = 1;
  } finally {
    await context?.close().catch(() => undefined);
    await browser?.close().catch(() => undefined);
  }
}

void main();
