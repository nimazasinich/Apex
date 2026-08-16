import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';

const ROOT = process.cwd();
const PORT = Number(process.env.APEX_QA_PORT || 3210);
const BASE_URL = String(process.env.APEX_QA_BASE_URL || `http://127.0.0.1:${PORT}`).replace(/\/+$/, '');
const OUT_DIR = resolve(ROOT, process.env.APEX_QA_OUT_DIR || 'test-results/workspace-runtime');
const STRICT = process.env.APEX_QA_STRICT !== '0';
const AUTO_START = process.env.APEX_QA_START_SERVER !== '0';
const PLAYWRIGHT_EXECUTABLE = String(process.env.APEX_PLAYWRIGHT_EXECUTABLE || '').trim();
const LIGHT_ONLY = process.env.APEX_QA_LIGHT_ONLY === '1';
const TRANSPORT_BRIDGE = process.env.APEX_QA_TRANSPORT_BRIDGE === '1';

const ROUTES = [
  'overview', 'markets', 'watchlist', 'screener', 'portfolio', 'trading', 'orders', 'positions',
  'alerts', 'history', 'analytics', 'backtesting', 'strategies', 'settings', 'help',
];
const VIEWPORTS = [
  { name: '1368x753', width: 1368, height: 753 },
  { name: '1280x720', width: 1280, height: 720 },
  { name: '1024x768', width: 1024, height: 768 },
];

interface Finding {
  kind: 'failure' | 'warning';
  scope: string;
  message: string;
}

interface RouteResult {
  route: string;
  viewport: string;
  theme: string;
  rootTextLength: number;
  horizontalOverflow: boolean;
  pageErrors: string[];
  consoleErrors: string[];
  requestFailures: string[];
  badResponses: string[];
  containmentFailures: string[];
}

const findings: Finding[] = [];
const routeResults: RouteResult[] = [];
let server: ChildProcess | null = null;

function safeName(value: string): string {
  return value.replace(/[^a-z0-9_.-]+/gi, '-').replace(/^-+|-+$/g, '');
}

async function isServerReady(): Promise<boolean> {
  try {
    const response = await fetch(BASE_URL, { signal: AbortSignal.timeout(1_500) });
    return response.ok || response.status === 404;
  } catch {
    return false;
  }
}

async function startServer(): Promise<void> {
  if (await isServerReady()) return;
  if (!AUTO_START) throw new Error(`APEX runtime is not reachable at ${BASE_URL}`);

  server = spawn('npm', ['run', 'dev:server'], {
    cwd: ROOT,
    shell: process.platform === 'win32',
    detached: process.platform !== 'win32',
    env: { ...process.env, PORT: String(PORT), APEX_PORT: String(PORT), DISABLE_HMR: 'true', APEX_ENABLE_HMR: 'false' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  server.stdout?.on('data', (chunk) => process.stdout.write(`[qa-server] ${String(chunk)}`));
  server.stderr?.on('data', (chunk) => process.stderr.write(`[qa-server:err] ${String(chunk)}`));

  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (await isServerReady()) return;
    if (server.exitCode != null) throw new Error(`APEX server exited with code ${server.exitCode}`);
    await new Promise((resolveWait) => setTimeout(resolveWait, 500));
  }
  throw new Error(`APEX server did not become ready at ${BASE_URL}`);
}

async function stopServer(): Promise<void> {
  if (!server?.pid) return;
  const child = server;
  try {
    if (process.platform === 'win32') child.kill('SIGTERM');
    else process.kill(-child.pid!, 'SIGTERM');
  } catch {
    try { child.kill('SIGTERM'); } catch { /* no-op */ }
  }
  await new Promise((resolveWait) => setTimeout(resolveWait, 750));
  if (child.exitCode == null && child.signalCode == null) {
    try {
      if (process.platform === 'win32') spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { shell: true });
      else process.kill(-child.pid!, 'SIGKILL');
    } catch {
      try { child.kill('SIGKILL'); } catch { /* no-op */ }
    }
  }
  server = null;
}

async function launchBrowser(): Promise<Browser> {
  const options = { headless: process.env.HEADLESS !== '0', args: ['--disable-dev-shm-usage', '--disable-features=TranslateUI'] };
  if (PLAYWRIGHT_EXECUTABLE) return chromium.launch({ ...options, executablePath: PLAYWRIGHT_EXECUTABLE });
  const channel = process.env.BROWSER_CHANNEL;
  if (channel) {
    try { return await chromium.launch({ ...options, channel: channel as any }); }
    catch (error) { findings.push({ kind: 'warning', scope: 'browser', message: `Channel ${channel} unavailable: ${String(error)}` }); }
  }
  return chromium.launch(options);
}


function inspectViewportContainment(): string[] {
  const failures: string[] = [];
  const tolerance = 1;
  const viewport = { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight, width: window.innerWidth, height: window.innerHeight };

  function rect(element: Element | null) {
    if (!element) return null;
    const value = element.getBoundingClientRect();
    return {
      left: value.left,
      right: value.right,
      top: value.top,
      bottom: value.bottom,
      width: value.width,
      height: value.height,
      clientWidth: element instanceof HTMLElement ? element.clientWidth : 0,
      scrollWidth: element instanceof HTMLElement ? element.scrollWidth : 0,
      clientHeight: element instanceof HTMLElement ? element.clientHeight : 0,
      scrollHeight: element instanceof HTMLElement ? element.scrollHeight : 0,
      overflow: element instanceof HTMLElement ? getComputedStyle(element).overflow : '',
      overflowX: element instanceof HTMLElement ? getComputedStyle(element).overflowX : '',
      overflowY: element instanceof HTMLElement ? getComputedStyle(element).overflowY : '',
      minWidth: element instanceof HTMLElement ? getComputedStyle(element).minWidth : '',
      widthValue: element instanceof HTMLElement ? getComputedStyle(element).width : '',
    };
  }

  function label(element: Element | null, fallback: string) {
    if (!element) return fallback;
    const classes = element instanceof HTMLElement ? element.className : '';
    const classText = typeof classes === 'string' && classes ? `.${classes.trim().split(/\s+/).slice(0, 4).join('.')}` : '';
    return `${element.tagName.toLowerCase()}${element.id ? `#${element.id}` : ''}${classText || ''}`;
  }

  function within(child: Element | null, owner: Element | null, childName: string, ownerName: string, vertical = true) {
    const c = rect(child);
    const o = owner ? rect(owner) : viewport;
    if (!c || !o) {
      failures.push(`${childName}: missing containment node; owner=${ownerName}`);
      return;
    }
    if (c.left < o.left - tolerance) failures.push(`${childName}.left ${c.left.toFixed(1)} < ${ownerName}.left ${o.left.toFixed(1)}`);
    if (c.right > o.right + tolerance) failures.push(`${childName}.right ${c.right.toFixed(1)} > ${ownerName}.right ${o.right.toFixed(1)}`);
    if (vertical && c.top < o.top - tolerance) failures.push(`${childName}.top ${c.top.toFixed(1)} < ${ownerName}.top ${o.top.toFixed(1)}`);
    if (vertical && c.bottom > o.bottom + tolerance) failures.push(`${childName}.bottom ${c.bottom.toFixed(1)} > ${ownerName}.bottom ${o.bottom.toFixed(1)}`);
    if (c.scrollWidth > c.clientWidth + tolerance) failures.push(`${childName} clipped horizontal descendant overflow: scrollWidth=${c.scrollWidth} clientWidth=${c.clientWidth} overflowX=${c.overflowX}`);
  }

  const shell = document.querySelector('.apex-shell');
  const sidebar = document.querySelector('.apex-sidebar');
  const stage = document.querySelector('.apex-stage');
  const header = document.querySelector('.apex-header');
  const content = document.querySelector('.apex-content');
  const pageRoot = content?.firstElementChild ?? null;

  within(shell, null, '.apex-shell', 'viewport');
  within(sidebar, shell, '.apex-sidebar', '.apex-shell');
  within(stage, shell, '.apex-stage', '.apex-shell');
  within(header, stage, '.apex-header', '.apex-stage');
  within(content, stage, '.apex-content', '.apex-stage');
  if (pageRoot) within(pageRoot, content, label(pageRoot, 'pageRoot'), '.apex-content');
  else failures.push('pageRoot: .apex-content has no active page root');

  document.querySelectorAll('.apex-header > *').forEach((child, index) => within(child, header, `.apex-header child[${index}] ${label(child, 'header-child')}`, '.apex-header'));

  const commonSelectors = [
    '.apex-page-stack', '.apex-unified-page', '.v20-reference-page', '.apex-mkt2', '.apex-v3-page',
    '.apex-backtest-workspace', '.strategy-studio', '.apex-help-page', '.apex-settings-page', '.apex-overview-terminal',
  ];
  for (const selector of commonSelectors) {
    const element = document.querySelector(selector);
    if (element && content) within(element, content, selector, '.apex-content');
  }

  const trading = document.querySelector('.apex-trading-terminal.apex-trading-modern');
  if (trading && content) {
    within(trading, content, '.apex-trading-terminal', '.apex-content');
    const page = trading.querySelector('.trading-page');
    const cockpit = trading.querySelector('.apex-trading-cockpit');
    const rail = trading.querySelector('.apex-trading-toolbox');
    const activity = trading.querySelector('.apex-trading-activity-card');
    const ticket = trading.querySelector('.apex-trading-order-column');
    const depth = trading.querySelector('.apex-trading-market-column');
    within(page, trading, '.trading-page', '.apex-trading-terminal');
    within(cockpit, page || trading, '.apex-trading-cockpit', '.trading-page');
    within(rail, trading, '.apex-trading-toolbox', '.apex-trading-terminal');
    within(activity, page || trading, '.apex-trading-activity-card', '.trading-page');
    if (cockpit) {
      within(ticket, cockpit, '.apex-trading-order-column', '.apex-trading-cockpit');
      within(depth, cockpit, '.apex-trading-market-column', '.apex-trading-cockpit');
    }
  }

  return failures;
}

function attachDiagnostics(page: Page) {
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  const requestFailures: string[] = [];
  const badResponses: string[] = [];

  page.on('pageerror', (error) => pageErrors.push(String(error.message || error).slice(0, 500)));
  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    const text = message.text();
    if (/favicon|ERR_BLOCKED_BY_ORB|Failed to load resource/i.test(text)) {
      consoleErrors.push(`NETWORK: ${text.slice(0, 500)}`);
      return;
    }
    consoleErrors.push(text.slice(0, 500));
  });
  page.on('requestfailed', (request) => requestFailures.push(`${request.method()} ${request.url()} :: ${request.failure()?.errorText || 'failed'}`));
  page.on('response', (response) => {
    if (response.status() < 400) return;
    badResponses.push(`${response.request().method()} ${response.url()} -> ${response.status()}`);
  });
  return { pageErrors, consoleErrors, requestFailures, badResponses };
}

async function seedTheme(page: Page, theme: 'light' | 'dark'): Promise<void> {
  await page.addInitScript((selectedTheme) => {
    window.localStorage.setItem('apex_theme_v1', selectedTheme);
  }, theme);
}

async function inspectRoute(
  browser: Browser,
  route: string,
  viewport: { name: string; width: number; height: number },
  theme: 'light' | 'dark' = 'light',
  screenshot = false,
): Promise<RouteResult> {
  const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height } });
  const page = await context.newPage();
  await seedTheme(page, theme);
  const diagnostics = attachDiagnostics(page);
  let navigationError: string | null = null;

  try {
    await page.goto(`${BASE_URL}/#/${route}`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await page.waitForSelector('#root', { timeout: 15_000 });
    await page.waitForTimeout(1_200);
  } catch (error) {
    navigationError = String(error);
    diagnostics.pageErrors.push(`NAVIGATION: ${navigationError}`);
  }

  const metrics = await page.evaluate(() => ({
    rootTextLength: document.getElementById('root')?.innerText.trim().length ?? 0,
    horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    resolvedTheme: document.documentElement.getAttribute('data-apex-theme-resolved') || '',
  })).catch(() => ({ rootTextLength: 0, horizontalOverflow: false, resolvedTheme: '' }));

  const containmentFailures = await page.evaluate(inspectViewportContainment)
    .catch((error) => [`Containment inspection failed: ${String(error)}`]);

  if (screenshot) {
    const file = resolve(OUT_DIR, `${safeName(route)}-${safeName(viewport.name)}-${theme}.png`);
    await page.screenshot({ path: file, fullPage: false }).catch(() => undefined);
  }

  const result: RouteResult = {
    route,
    viewport: viewport.name,
    theme,
    rootTextLength: metrics.rootTextLength,
    horizontalOverflow: metrics.horizontalOverflow,
    pageErrors: diagnostics.pageErrors,
    consoleErrors: diagnostics.consoleErrors,
    requestFailures: diagnostics.requestFailures,
    badResponses: diagnostics.badResponses,
    containmentFailures,
  };
  routeResults.push(result);

  const scope = `${route}@${viewport.name}/${theme}`;
  if (metrics.rootTextLength < 40) findings.push({ kind: 'failure', scope, message: `Root content is empty or incomplete (${metrics.rootTextLength} chars).` });
  if (metrics.horizontalOverflow) findings.push({ kind: 'failure', scope, message: 'Horizontal page overflow detected.' });
  for (const message of containmentFailures) findings.push({ kind: 'failure', scope, message: `Viewport containment: ${message}` });
  for (const message of diagnostics.pageErrors) findings.push({ kind: 'failure', scope, message: `Page error: ${message}` });
  for (const message of diagnostics.consoleErrors) {
    const kind = message.startsWith('NETWORK:') ? 'warning' : 'failure';
    findings.push({ kind, scope, message: `Console error: ${message}` });
  }
  for (const message of diagnostics.requestFailures) findings.push({ kind: 'warning', scope, message: `Request failed: ${message}` });
  for (const message of diagnostics.badResponses) {
    const sameOrigin = message.includes(BASE_URL);
    const status = Number(message.match(/->\s*(\d+)/)?.[1] || 0);
    findings.push({ kind: sameOrigin && status >= 500 ? 'failure' : 'warning', scope, message: `HTTP response: ${message}` });
  }
  if (metrics.resolvedTheme && metrics.resolvedTheme !== theme) findings.push({ kind: 'failure', scope, message: `Theme resolved as ${metrics.resolvedTheme}, expected ${theme}.` });

  await context.close();
  return result;
}

async function verifyDesignTokensRuntime(browser: Browser): Promise<void> {
  const requiredTokens = [
    '--apex-green-050', '--apex-green-300', '--apex-green-500', '--apex-green-600',
    '--apex-muted-600', '--apex-surface', '--apex-border', '--apex-divider',
  ];

  const themes = LIGHT_ONLY ? (['light'] as const) : (['light', 'dark'] as const);
  for (const theme of themes) {
    const context = await browser.newContext({ viewport: { width: 1368, height: 753 } });
    const page = await context.newPage();
    await seedTheme(page, theme);
    await page.goto(`${BASE_URL}/#/help`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await page.waitForSelector('.apex-v3-topic-card > i', { timeout: 15_000 });
    await page.waitForTimeout(500);

    const result = await page.evaluate((tokens) => {
      const rootStyle = getComputedStyle(document.documentElement);
      const values = Object.fromEntries(tokens.map((token) => [token, rootStyle.getPropertyValue(token).trim()]));
      const icon = document.querySelector<HTMLElement>('.apex-v3-topic-card > i');
      const search = document.querySelector<HTMLElement>('.apex-v3-help-search');
      const iconStyle = icon ? getComputedStyle(icon) : null;
      const searchStyle = search ? getComputedStyle(search) : null;
      return {
        values,
        iconBackground: iconStyle?.backgroundColor ?? '',
        iconColor: iconStyle?.color ?? '',
        searchBorder: searchStyle?.borderTopColor ?? '',
      };
    }, requiredTokens);

    for (const token of requiredTokens) {
      if (!result.values[token]) {
        findings.push({ kind: 'failure', scope: `design-tokens/${theme}`, message: `${token} is empty at runtime.` });
      }
    }

    const transparent = new Set(['', 'transparent', 'rgba(0, 0, 0, 0)']);
    if (transparent.has(result.iconBackground)) {
      findings.push({ kind: 'failure', scope: `design-tokens/${theme}`, message: 'Help topic icon background is transparent.' });
    }
    if (transparent.has(result.iconColor)) {
      findings.push({ kind: 'failure', scope: `design-tokens/${theme}`, message: 'Help topic icon color is transparent.' });
    }
    if (transparent.has(result.searchBorder)) {
      findings.push({ kind: 'failure', scope: `design-tokens/${theme}`, message: 'Help search highlight border is transparent.' });
    }

    await page.screenshot({ path: resolve(OUT_DIR, `design-token-contract-help-${theme}-1368x753.png`), fullPage: false });
    await context.close();
  }
}

async function verifyThemeSurfaceRuntime(browser: Browser): Promise<void> {
  const targets = [
    { route: 'help', selector: '.apex-v3-topic-card' },
    { route: 'watchlist', selector: '.apex-v3-panel' },
    { route: 'orders', selector: '.v20-table-card' },
    { route: 'positions', selector: '.v20-metric' },
    { route: 'settings', selector: '.apex-v3-settings-body' },
  ];
  const white = new Set(['rgb(255, 255, 255)', 'rgba(255, 255, 255, 1)', '#fff', '#ffffff']);

  for (const target of targets) {
    const context = await browser.newContext({ viewport: { width: 1368, height: 753 } });
    const page = await context.newPage();
    await seedTheme(page, 'dark');
    await page.goto(`${BASE_URL}/#/${target.route}`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await page.waitForSelector(target.selector, { timeout: 15_000 });
    await page.waitForTimeout(400);
    const styles = await page.locator(target.selector).first().evaluate((element) => {
      const computed = getComputedStyle(element as HTMLElement);
      return { backgroundColor: computed.backgroundColor, color: computed.color };
    });
    if (white.has(styles.backgroundColor.toLowerCase())) {
      findings.push({ kind: 'failure', scope: `theme-surfaces/${target.route}`, message: `${target.selector} stayed white in dark mode.` });
    }
    if (!styles.color) {
      findings.push({ kind: 'failure', scope: `theme-surfaces/${target.route}`, message: `${target.selector} has no computed text color.` });
    }
    await context.close();
  }

  const context = await browser.newContext({ viewport: { width: 1368, height: 753 } });
  const page = await context.newPage();
  await seedTheme(page, 'light');
  await page.goto(`${BASE_URL}/#/help`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await page.waitForSelector('.apex-v3-tutorial-thumb', { timeout: 15_000 });
  const image = await page.locator('.apex-v3-tutorial-thumb').first().evaluate((element) => getComputedStyle(element as HTMLElement).backgroundImage);
  if (!image || image === 'none') {
    findings.push({ kind: 'failure', scope: 'help/tutorial-thumbnails', message: 'Tutorial thumbnail background image did not render.' });
  }
  await page.screenshot({ path: resolve(OUT_DIR, 'help-tutorial-thumbnails-1368x753.png'), fullPage: false });
  await context.close();
}

async function verifyLightThemeRuntime(browser: Browser): Promise<void> {
  const targets = [
    { route: 'overview', selector: '.apex-panel' },
    { route: 'markets', selector: '.apex-mkt2-table-panel' },
    { route: 'watchlist', selector: '.apex-v3-table-panel' },
    { route: 'portfolio', selector: '.v20-portfolio-card' },
    { route: 'trading', selector: '.apex-panel' },
    { route: 'orders', selector: '.v20-table-card' },
    { route: 'positions', selector: '.v20-metric' },
    { route: 'alerts', selector: '.apex-v3-table-panel' },
    { route: 'history', selector: '.apex-v3-table-panel' },
    { route: 'analytics', selector: '.v20-table-card' },
    { route: 'backtesting', selector: '.apex-bt-card' },
    { route: 'strategies', selector: '.strategy-insight-card' },
    { route: 'settings', selector: '.apex-v3-settings-body' },
    { route: 'help', selector: '.apex-v3-topics-card' },
  ];

  for (const target of targets) {
    const context = await browser.newContext({ viewport: { width: 1368, height: 753 } });
    const page = await context.newPage();
    await seedTheme(page, 'light');
    const diagnostics = attachDiagnostics(page);
    await page.goto(`${BASE_URL}/#/${target.route}`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await page.waitForSelector(target.selector, { timeout: 15_000 });
    await page.waitForTimeout(500);

    const result = await page.evaluate((selector) => {
      function parseColor(value: string): [number, number, number, number] | null {
        const match = value.match(/rgba?\(([^)]+)\)/i);
        if (!match) return null;
        const parts = match[1].split(',').map((part) => Number.parseFloat(part.trim()));
        if (parts.length < 3 || parts.slice(0, 3).some((part) => !Number.isFinite(part))) return null;
        return [parts[0], parts[1], parts[2], Number.isFinite(parts[3]) ? parts[3] : 1];
      }
      function luminance(rgb: [number, number, number, number] | null): number {
        if (!rgb) return -1;
        const channels = rgb.slice(0, 3).map((channel) => channel / 255).map((channel) => channel <= .03928 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4);
        return channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722;
      }
      function contrast(a: [number, number, number, number] | null, b: [number, number, number, number] | null): number {
        const values = [luminance(a), luminance(b)].sort((left, right) => right - left);
        return values[0] < 0 || values[1] < 0 ? -1 : (values[0] + .05) / (values[1] + .05);
      }

      const element = document.querySelector<HTMLElement>(selector);
      const avatar = document.querySelector<HTMLElement>('.apex-avatar');
      const bodyStyle = getComputedStyle(document.body);
      const style = element ? getComputedStyle(element) : null;
      const avatarStyle = avatar ? getComputedStyle(avatar) : null;
      const surface = parseColor(style?.backgroundColor ?? '');
      const text = parseColor(style?.color ?? '');
      const avatarBackground = parseColor(avatarStyle?.backgroundColor ?? '');
      const rect = element?.getBoundingClientRect();
      const rootStyle = getComputedStyle(document.documentElement);
      return {
        resolvedTheme: document.documentElement.dataset.apexThemeResolved ?? '',
        canvas: bodyStyle.backgroundColor,
        surface: style?.backgroundColor ?? '',
        surfaceAlpha: surface?.[3] ?? 0,
        surfaceLuminance: luminance(surface),
        textContrast: contrast(text, surface),
        width: rect?.width ?? 0,
        height: rect?.height ?? 0,
        horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
        avatarBackground: avatarStyle?.backgroundColor ?? '',
        avatarLuminance: luminance(avatarBackground),
        variables: {
          canvas: rootStyle.getPropertyValue('--apex-canvas').trim(),
          surface: rootStyle.getPropertyValue('--apex-surface').trim(),
          ink: rootStyle.getPropertyValue('--apex-ink-900').trim(),
          muted: rootStyle.getPropertyValue('--apex-muted-600').trim(),
          border: rootStyle.getPropertyValue('--apex-border').trim(),
        },
      };
    }, target.selector);

    const scope = `light-runtime/${target.route}`;
    if (result.resolvedTheme !== 'light') findings.push({ kind: 'failure', scope, message: `Resolved theme is ${result.resolvedTheme || 'empty'}.` });
    if (result.surfaceAlpha < .95 || result.surfaceLuminance < .82) findings.push({ kind: 'failure', scope, message: `${target.selector} is not an opaque light surface (${result.surface}).` });
    if (result.textContrast > 0 && result.textContrast < 4.5) findings.push({ kind: 'failure', scope, message: `${target.selector} text contrast is ${result.textContrast.toFixed(2)}:1.` });
    if (result.width < 40 || result.height < 20) findings.push({ kind: 'failure', scope, message: `${target.selector} collapsed to ${result.width}×${result.height}.` });
    if (result.horizontalOverflow) findings.push({ kind: 'failure', scope, message: 'Horizontal page overflow detected at 1368×753.' });
    if (result.avatarLuminance >= 0 && result.avatarLuminance < .45) findings.push({ kind: 'failure', scope, message: `Avatar retained a dark legacy fill (${result.avatarBackground}).` });
    for (const [name, value] of Object.entries(result.variables)) {
      if (!value) findings.push({ kind: 'failure', scope, message: `Computed light token ${name} is empty.` });
    }
    for (const message of diagnostics.pageErrors) findings.push({ kind: 'failure', scope, message: `Page error: ${message}` });
    for (const message of diagnostics.consoleErrors) findings.push({ kind: message.startsWith('NETWORK:') ? 'warning' : 'failure', scope, message: `Console error: ${message}` });

    await page.screenshot({ path: resolve(OUT_DIR, `light-contract-${target.route}-1368x753.png`), fullPage: false });
    await context.close();
  }
}

async function verifyWatchlistPersistence(browser: Browser): Promise<void> {
  const context = await browser.newContext({ viewport: { width: 1368, height: 753 } });
  const page = await context.newPage();
  await page.goto(`${BASE_URL}/#/watchlist`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await page.evaluate(() => window.localStorage.setItem('apex_watchlist_favorites_v1', JSON.stringify(['BTC-USDT', 'ETH-USDT'])));
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1_500);
  const text = await page.locator('body').innerText();
  if (!text.includes('BTC-USDT') || !text.includes('ETH-USDT')) {
    findings.push({ kind: 'failure', scope: 'watchlist-persistence', message: 'BTC-USDT and ETH-USDT did not survive a hard reload.' });
  }
  await page.screenshot({ path: resolve(OUT_DIR, 'watchlist-persistence-1368x753.png'), fullPage: false });
  await context.close();
}

async function verifyThemePersistence(browser: Browser): Promise<void> {
  const themes = LIGHT_ONLY ? (['light'] as const) : (['dark', 'light'] as const);
  for (const theme of themes) {
    const context = await browser.newContext({ viewport: { width: 1368, height: 753 } });
    const page = await context.newPage();
    await page.goto(`${BASE_URL}/#/settings`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await page.evaluate((selected) => window.localStorage.setItem('apex_theme_v1', selected), theme);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(900);
    const attrs = await page.evaluate(() => ({
      preference: document.documentElement.getAttribute('data-apex-theme'),
      resolved: document.documentElement.getAttribute('data-apex-theme-resolved'),
    }));
    if (attrs.preference !== theme || attrs.resolved !== theme) {
      findings.push({ kind: 'failure', scope: `theme-${theme}`, message: `Theme attributes were ${JSON.stringify(attrs)}.` });
    }
    await page.screenshot({ path: resolve(OUT_DIR, `settings-theme-${theme}-1368x753.png`), fullPage: false });
    await context.close();
  }
}

async function main(): Promise<void> {
  if (TRANSPORT_BRIDGE) {
    const result = spawnSync(process.execPath, ['scripts/qa/verifyUi1368.mjs'], { cwd: ROOT, env: process.env, stdio: 'inherit' });
    if (result.status !== 0) process.exitCode = result.status ?? 1;
    return;
  }
  mkdirSync(OUT_DIR, { recursive: true });
  await startServer();
  const browser = await launchBrowser();

  try {
    for (const viewport of VIEWPORTS) {
      for (const route of ROUTES) {
        await inspectRoute(browser, route, viewport, 'light', viewport.name === '1368x753');
      }
    }

    if (!LIGHT_ONLY) {
      for (const route of ROUTES) {
        await inspectRoute(browser, route, { name: '1368x753', width: 1368, height: 753 }, 'dark', route === 'trading' || route === 'strategies' || route === 'orders' || route === 'positions' || route === 'settings');
      }
    }

    await verifyDesignTokensRuntime(browser);
    if (!LIGHT_ONLY) await verifyThemeSurfaceRuntime(browser);
    await verifyLightThemeRuntime(browser);
    await verifyWatchlistPersistence(browser);
    await verifyThemePersistence(browser);
  } finally {
    await browser.close();
    await stopServer();
  }

  const failures = findings.filter((finding) => finding.kind === 'failure');
  const warnings = findings.filter((finding) => finding.kind === 'warning');
  const report = {
    generatedAt: new Date().toISOString(),
    baseUrl: BASE_URL,
    strict: STRICT,
    canonicalViewport: '1368x753',
    routesChecked: ROUTES,
    viewportsChecked: LIGHT_ONLY ? [{ name: '1368x753', width: 1368, height: 753 }] : VIEWPORTS,
    lightOnly: LIGHT_ONLY,
    summary: { failures: failures.length, warnings: warnings.length, routeChecks: routeResults.length },
    findings,
    routeResults,
  };
  writeFileSync(resolve(OUT_DIR, 'workspace-runtime-report.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(report.summary, null, 2));

  process.exit(STRICT && failures.length ? 1 : 0);
}

main().catch(async (error) => {
  await stopServer();
  console.error(error);
  process.exit(1);
});
