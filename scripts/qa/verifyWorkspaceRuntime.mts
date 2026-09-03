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
  'alerts', 'history', 'analytics', 'backtesting', 'academy', 'strategies', 'settings', 'help',
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

function cssLuminance(value: string): number {
  const channels = (value.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number).map((channel) => {
    const normalized = channel / 255;
    return normalized <= .03928 ? normalized / 12.92 : ((normalized + .055) / 1.055) ** 2.4;
  });
  return (channels[0] ?? 0) * .2126 + (channels[1] ?? 0) * .7152 + (channels[2] ?? 0) * .0722;
}

function cssAlpha(value: string): number {
  const match = value.match(/rgba?\(([^)]+)\)/i);
  if (!match) return 0;
  const parts = match[1].split(',').map((part) => Number.parseFloat(part.trim()));
  return Number.isFinite(parts[3]) ? parts[3] : 1;
}

function cssContrast(left: string, right: string): number {
  const values = [cssLuminance(left), cssLuminance(right)].sort((a, b) => b - a);
  return (values[0] + .05) / (values[1] + .05);
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

  server = spawn(process.execPath, ['--import', 'tsx', 'server.ts'], {
    cwd: ROOT,
    shell: false,
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
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { shell: true, stdio: 'ignore' });
    server = null;
    return;
  }
  try {
    process.kill(-child.pid!, 'SIGTERM');
  } catch {
    try { child.kill('SIGTERM'); } catch { /* no-op */ }
  }
  await new Promise((resolveWait) => setTimeout(resolveWait, 750));
  if (child.exitCode == null && child.signalCode == null) {
    try {
      process.kill(-child.pid!, 'SIGKILL');
    } catch {
      try { child.kill('SIGKILL'); } catch { /* no-op */ }
    }
  }
  server = null;
}


function isMissingPlaywrightBrowser(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /Executable doesn't exist|playwright install|browserType\.launch.*executable/i.test(message);
}

async function launchBrowser(): Promise<Browser> {
  const options = { headless: process.env.HEADLESS !== '0', args: ['--disable-dev-shm-usage', '--disable-features=TranslateUI'] };
  if (PLAYWRIGHT_EXECUTABLE) return chromium.launch({ ...options, executablePath: PLAYWRIGHT_EXECUTABLE });
  const channel = process.env.BROWSER_CHANNEL;
  if (channel) {
    try { return await chromium.launch({ ...options, channel: channel as any }); }
    catch (error) { findings.push({ kind: 'warning', scope: 'browser', message: `Channel ${channel} unavailable: ${String(error)}` }); }
  }
  if (process.platform === 'win32') {
    for (const installedChannel of ['chrome', 'msedge'] as const) {
      try { return await chromium.launch({ ...options, channel: installedChannel }); }
      catch { /* fall through to the next installed or Playwright-managed browser */ }
    }
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
    // Some workspace routes retain hidden compatibility wrappers alongside the
    // active layout. A zero-size wrapper cannot be a meaningful containment
    // boundary; visible descendants are checked through their active parent.
    if (c.width < 1 || c.height < 1 || (owner && (o.width < 1 || o.height < 1))) return;
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

  page.on('pageerror', (error) => {
    const text = String(error.message || error);
    if (/WebSocket closed without opened/i.test(text)) return;
    pageErrors.push(text.slice(0, 500));
  });
  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    const text = message.text();
    if (/\[vite\] failed to connect to websocket|WebSocket connection to ['"]ws:\/\/127\.0\.0\.1:24678/i.test(text)) return;
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

  await page.evaluate('globalThis.__name = globalThis.__name || function(target) { return target; }');
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
    { route: 'positions', selector: '.positions-reference-metric' },
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
    if (target.route === 'positions') {
      const colors = await page.locator(target.selector).first().evaluate((element) => {
        return {
          surface: getComputedStyle(element as HTMLElement).backgroundColor,
          text: [...element.querySelectorAll<HTMLElement>('.positions-reference-metric-head strong, .positions-reference-metric-value, footer small')]
            .map((child) => getComputedStyle(child).color),
        };
      });
      colors.text.map((color) => cssContrast(color, colors.surface)).forEach((ratio, index) => {
        if (ratio < 4.5) findings.push({ kind: 'failure', scope: 'theme-surfaces/positions', message: `Metric text ${index + 1} contrast is ${ratio.toFixed(2)}:1 in dark mode.` });
      });
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
    { route: 'positions', selector: '.positions-reference-metric' },
    { route: 'alerts', selector: '.apex-v3-table-panel' },
    { route: 'history', selector: '.apex-v3-table-panel' },
    { route: 'analytics', selector: '.analytics-card' },
    { route: 'backtesting', selector: '.apex-bt-rail-card' },
    { route: 'academy', selector: '.academy-panel' },
    { route: 'strategies', selector: '.strategy-identity-card' },
    { route: 'settings', selector: '.settings-overview-card' },
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
      const element = document.querySelector<HTMLElement>(selector);
      const avatar = document.querySelector<HTMLElement>('.apex-avatar');
      const bodyStyle = getComputedStyle(document.body);
      const style = element ? getComputedStyle(element) : null;
      const avatarStyle = avatar ? getComputedStyle(avatar) : null;
      const rect = element?.getBoundingClientRect();
      const rootStyle = getComputedStyle(document.documentElement);
      return {
        resolvedTheme: document.documentElement.dataset.apexThemeResolved ?? '',
        canvas: bodyStyle.backgroundColor,
        surface: style?.backgroundColor ?? '',
        text: style?.color ?? '',
        width: rect?.width ?? 0,
        height: rect?.height ?? 0,
        horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
        avatarBackground: avatarStyle?.backgroundColor ?? '',
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
    const surfaceAlpha = cssAlpha(result.surface);
    const surfaceLuminance = cssLuminance(result.surface);
    const textContrast = cssContrast(result.text, result.surface);
    const avatarLuminance = cssLuminance(result.avatarBackground);
    if (result.resolvedTheme !== 'light') findings.push({ kind: 'failure', scope, message: `Resolved theme is ${result.resolvedTheme || 'empty'}.` });
    if (surfaceAlpha < .95 || surfaceLuminance < .82) findings.push({ kind: 'failure', scope, message: `${target.selector} is not an opaque light surface (${result.surface}).` });
    if (textContrast > 0 && textContrast < 4.5) findings.push({ kind: 'failure', scope, message: `${target.selector} text contrast is ${textContrast.toFixed(2)}:1.` });
    if (result.width < 40 || result.height < 20) findings.push({ kind: 'failure', scope, message: `${target.selector} collapsed to ${result.width}×${result.height}.` });
    if (result.horizontalOverflow) findings.push({ kind: 'failure', scope, message: 'Horizontal page overflow detected at 1368×753.' });
    if (avatarLuminance < .45) findings.push({ kind: 'failure', scope, message: `Avatar retained a dark legacy fill (${result.avatarBackground}).` });
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
  const persisted = await page.evaluate(() => JSON.parse(window.localStorage.getItem('apex_watchlist_favorites_v1') || '[]') as string[]);
  if (!persisted.includes('BTC-USDT') || !persisted.includes('ETH-USDT')) {
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

async function verifySettingsIntegrationRuntime(browser: Browser): Promise<void> {
  const context = await browser.newContext({ viewport: { width: 1368, height: 753 } });
  const page = await context.newPage();
  await seedTheme(page, 'light');
  const diagnostics = attachDiagnostics(page);
  const fail = (scope: string, message: string) => findings.push({ kind: 'failure', scope: `settings-integrations/${scope}`, message });

  await page.goto(`${BASE_URL}/#/settings`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await page.waitForSelector('.apex-shell[data-page="settings"]', { timeout: 15_000 });
  await page.locator('button[data-settings-section="api"]').click();
  await page.waitForSelector('.settings-section-api .apex-v3-feed-runtime-card', { timeout: 15_000 });
  await page.locator('.apex-v3-feed-health-skeleton').waitFor({ state: 'detached', timeout: 15_000 }).catch(() => undefined);

  const feedTiles = page.locator('.apex-v3-feed-runtime-card .apex-v3-feed-health-grid > div');
  if ((await feedTiles.count()) < 5) fail('feed-health', 'Live feed panel did not render the five expected source states.');
  const syntheticHealthy = await feedTiles.evaluateAll((tiles) => tiles.some((tile) => {
    const text = tile.textContent || '';
    return /Unavailable/i.test(text) && tile.classList.contains('feed-connected');
  }));
  if (syntheticHealthy) fail('feed-truthfulness', 'An unavailable live feed was styled as connected.');

  await page.locator('.settings-section-api .apex-v3-feed-runtime-card').scrollIntoViewIfNeeded();
  await page.screenshot({ path: resolve(OUT_DIR, 'settings-api-integrations-1368x753.png'), fullPage: false });

  await page.locator('button[data-settings-section="smart-proxy"]').click();
  await page.waitForSelector('.settings-section-smart-proxy .apex-proxy-settings', { timeout: 15_000 });
  await page.locator('.apex-proxy-skeleton').waitFor({ state: 'detached', timeout: 15_000 }).catch(() => undefined);

  const proxyPanel = page.locator('.settings-section-smart-proxy .apex-proxy-settings');
  const modeCount = await proxyPanel.locator('.apex-proxy-mode-cards input[name="proxy-mode"]').count();
  if (modeCount !== 3) fail('proxy-modes', `Expected 3 explicit routing modes; rendered ${modeCount}.`);
  if (!(await proxyPanel.getByRole('button', { name: 'Save policy' }).isVisible().catch(() => false))) fail('proxy-save', 'Save policy action is missing.');

  const testDraft = proxyPanel.getByRole('button', { name: 'Test draft' });
  if (!(await testDraft.isVisible().catch(() => false))) {
    fail('proxy-test', 'Test draft action is missing.');
  } else {
    await testDraft.click();
    await page.waitForSelector('.apex-proxy-provider-results .row', { timeout: 45_000 });
    const providerRows = proxyPanel.locator('.apex-proxy-provider-results .row');
    const providerCount = await providerRows.count();
    if (providerCount !== 4) fail('proxy-test', `Expected 4 fixed provider probes; rendered ${providerCount}.`);
    const results = await providerRows.evaluateAll((rows) => rows.map((row) => {
      const cells = [...row.querySelectorAll('strong, span')].map((cell) => cell.textContent?.trim() || '');
      return { provider: cells[0] || '', state: cells[1] || '', route: cells[2] || '', latency: cells[3] || '' };
    }));
    for (const result of results) {
      if (!result.provider) fail('proxy-test', 'A provider probe row has no provider identity.');
      if (!/^(Direct|Proxy|None)/.test(result.route)) fail('proxy-test', `${result.provider || 'Provider'} has no explicit observed route (${result.route || 'empty'}).`);
      if (!/^\d+ ms$/.test(result.latency)) fail('proxy-test', `${result.provider || 'Provider'} has no measured latency (${result.latency || 'empty'}).`);
    }
    if (results.length && results.every((row) => row.state !== 'Connected')) {
      const badge = (await proxyPanel.locator('.apex-v3-panel-head .apex-v3-status').first().textContent())?.trim() || '';
      if (badge === 'CONNECTED') fail('proxy-truthfulness', 'Panel claimed CONNECTED even though every live provider probe failed.');
    }
  }

  await proxyPanel.scrollIntoViewIfNeeded();
  await page.screenshot({ path: resolve(OUT_DIR, 'settings-smart-proxy-1368x753.png'), fullPage: false });

  await page.locator('button[data-settings-section="notifications"]').click();
  await page.waitForSelector('.settings-section-notifications .apex-v3-telegram-panel', { timeout: 15_000 });
  await page.locator('.apex-v3-telegram-skeleton').waitFor({ state: 'detached', timeout: 15_000 }).catch(() => undefined);
  const telegramPanel = page.locator('.apex-v3-telegram-panel');
  if ((await telegramPanel.locator('.apex-v3-telegram-health-grid > div').count()) !== 4) fail('telegram-health', 'Telegram health summary did not render all 4 operational fields.');
  if (!(await telegramPanel.getByRole('button', { name: 'Send real test' }).isVisible().catch(() => false))) fail('telegram-test', 'Real Telegram test action is missing.');
  if (!(await telegramPanel.locator('.apex-v3-telegram-history').isVisible().catch(() => false))) fail('telegram-history', 'Telegram delivery history is missing.');
  const telegramBadge = (await telegramPanel.locator('.apex-v3-panel-head .apex-v3-status').first().textContent())?.trim() || '';
  const telegramTestDisabled = await telegramPanel.getByRole('button', { name: 'Send real test' }).isDisabled();
  if (telegramTestDisabled && telegramBadge === 'CONNECTED') fail('telegram-truthfulness', 'Telegram claimed CONNECTED while the real test action was unavailable.');
  await telegramPanel.scrollIntoViewIfNeeded();
  await page.screenshot({ path: resolve(OUT_DIR, 'settings-telegram-cp20-1368x753.png'), fullPage: false });

  const horizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
  if (horizontalOverflow) fail('layout', 'Settings integration view has horizontal overflow at 1368x753.');
  for (const message of diagnostics.pageErrors) fail('runtime', `Page error: ${message}`);
  for (const message of diagnostics.consoleErrors.filter((value) => !value.startsWith('NETWORK:'))) fail('runtime', `Console error: ${message}`);
  for (const message of diagnostics.badResponses.filter((value) => value.includes(BASE_URL) && /->\s*5\d\d/.test(value))) fail('runtime', `Server response: ${message}`);
  await context.close();
}

async function verifyCanonicalInteractiveFlows(browser: Browser): Promise<void> {
  const context = await browser.newContext({ viewport: { width: 1368, height: 753 }, acceptDownloads: true });
  const page = await context.newPage();
  const diagnostics = attachDiagnostics(page);
  const fail = (scope: string, message: string) => findings.push({ kind: 'failure', scope: `interactive/${scope}`, message });
  const expectPage = async (route: string, scope: string) => {
    const actual = await page.locator('.apex-shell').getAttribute('data-page');
    if (actual !== route) fail(scope, `Expected page ${route}, rendered ${actual ?? 'none'}.`);
  };

  await page.goto(`${BASE_URL}/#/overview`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await page.waitForSelector('.apex-shell[data-page="overview"]', { timeout: 15_000 });

  // Shell navigation is exercised through the rendered controls rather than
  // by changing hashes directly. This verifies route state and focusable
  // navigation wiring for every reachable workspace page.
  for (const route of ROUTES.filter((value) => value !== 'settings' && value !== 'help')) {
    await page.locator(`.apex-sidebar button[data-route="${route}"]`).click();
    await page.waitForSelector(`.apex-shell[data-page="${route}"]`, { timeout: 10_000 });
    await expectPage(route, `navigation/${route}`);
  }
  for (const route of ['settings', 'help']) {
    await page.locator('.apex-sidebar-bottom button').filter({ hasText: route === 'settings' ? 'Settings' : 'Help' }).click();
    await page.waitForSelector(`.apex-shell[data-page="${route}"]`, { timeout: 10_000 });
    await expectPage(route, `navigation/${route}`);
  }

  // Global keyboard search and both operational drawers.
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+K' : 'Control+K');
  const globalSearch = page.getByRole('combobox', { name: 'Search markets and workspace pages' });
  await globalSearch.fill('Academy');
  const academyResult = page.getByRole('option').filter({ hasText: 'Academy' }).first();
  if (await academyResult.count()) {
    await academyResult.click();
    await expectPage('academy', 'global-search');
  } else fail('global-search', 'Academy page result was not rendered.');

  await page.getByRole('button', { name: 'Open system health' }).click();
  if (!(await page.getByRole('dialog').isVisible().catch(() => false))) fail('system-health', 'System health dialog did not open.');
  await page.getByRole('button', { name: 'Close system health' }).click();
  await page.getByRole('button', { name: 'Open decision journal' }).click();
  if (!(await page.getByRole('dialog').isVisible().catch(() => false))) fail('decision-journal', 'Decision journal dialog did not open.');
  await page.getByRole('button', { name: 'Close decision journal' }).click();

  // Overview: activity tabs, market selection, details disclosure and linked
  // workflow are all stateful controls whose rendered outcome is asserted.
  await page.locator('.apex-sidebar button[data-route="overview"]').click();
  for (const label of ['Positions', 'Orders', 'Decisions', 'Alerts']) {
    const tab = page.locator('.apex-overview-activity-tabs button').filter({ hasText: label });
    await tab.click();
    if (!(await tab.evaluate((node) => node.classList.contains('active')))) fail('overview/activity-tabs', `${label} did not become active.`);
  }
  const marketTiles = page.locator('.apex-overview-market-tiles button');
  if (await marketTiles.count()) {
    await marketTiles.first().click();
    if ((await marketTiles.filter({ has: page.locator('[aria-pressed="true"]') }).count()) === 0
      && (await marketTiles.first().getAttribute('aria-pressed')) !== 'true') fail('overview/market-selection', 'Selected market did not become pressed.');
  }
  const sentiment = page.locator('.apex-overview-sentiment-inline');
  if (await sentiment.count()) {
    await sentiment.locator('summary').click();
    if (!(await sentiment.getAttribute('open'))) fail('overview/sentiment', 'Sentiment disclosure did not open.');
  }
  await page.screenshot({ path: resolve(OUT_DIR, 'interactive-overview-1368x753.png'), fullPage: false });

  // Orders: every status tab, search, select filters, keyboard row selection,
  // and assistant selection clearing. Draft/cancel controls are checked for
  // honest enablement but are not submitted by an automated review gate.
  await page.locator('.apex-sidebar button[data-route="orders"]').click();
  await page.waitForSelector('.v20-orders-table', { timeout: 10_000 });
  for (const label of ['All Orders', 'Open', 'Partially Filled', 'Filled', 'Cancelled']) {
    const tab = page.getByRole('tab', { name: label, exact: true });
    await tab.click();
    if ((await tab.getAttribute('aria-selected')) !== 'true') fail('orders/status-tabs', `${label} was not selected.`);
  }
  const orderSearch = page.getByPlaceholder('Search orders by ID or market…');
  await orderSearch.fill('__no_such_order__');
  if (!(await page.locator('.orders-empty-state').isVisible().catch(() => false))) fail('orders/search', 'No-results state did not render.');
  await orderSearch.fill('');
  await page.getByLabel('Filter orders by side').selectOption('buy');
  await page.getByLabel('Filter orders by type').selectOption('limit');
  const clearFilters = page.getByRole('button', { name: /Clear Filters/ });
  if (await clearFilters.isDisabled()) fail('orders/filters', 'Clear Filters stayed disabled after filters changed.');
  else await clearFilters.click();
  const orderRows = page.locator('.v20-orders-table tbody tr');
  if (await orderRows.count()) {
    await orderRows.first().focus();
    await page.keyboard.press('Enter');
    if (!(await orderRows.first().evaluate((node) => node.classList.contains('selected')))) fail('orders/keyboard-selection', 'Enter did not select the focused order.');
    await page.getByRole('button', { name: 'Clear selected order' }).click();
  }
  await page.screenshot({ path: resolve(OUT_DIR, 'interactive-orders-1368x753.png'), fullPage: false });

  // Academy: filtering, scoped tabs, registry keyboard/compare selection,
  // drill-down tabs and Safety Guide navigation.
  await page.locator('.apex-sidebar button[data-route="academy"]').click();
  await page.waitForSelector('[data-testid="strategy-academy"]', { timeout: 10_000 });
  await page.getByRole('button', { name: 'Advanced filters' }).click();
  if (!(await page.locator('.academy-filter-popover').isVisible().catch(() => false))) fail('academy/filters', 'Advanced filter popover did not open.');
  await page.locator('.academy-filter-popover select').nth(1).selectOption('Standard');
  await page.getByRole('button', { name: 'Reset filters' }).click();
  for (const label of ['All', 'FULL_STRATEGY', 'BASE_REPLAY', 'BLOCKED']) {
    const scope = page.locator('.academy-scope-tabs button').filter({ hasText: label }).first();
    await scope.click();
    if (!(await scope.evaluate((node) => node.classList.contains('active')))) fail('academy/scope-tabs', `${label} did not become active.`);
  }
  await page.locator('.academy-scope-tabs button').filter({ hasText: 'All' }).first().click();
  const compareChecks = page.locator('.academy-registry-table tbody input[type="checkbox"]');
  if (await compareChecks.count() >= 2) {
    await compareChecks.nth(0).check();
    await compareChecks.nth(1).check();
    if (!(await page.locator('.academy-comparison-table').isVisible().catch(() => false))) fail('academy/compare', 'Comparison table did not render after selecting two strategies.');
  }
  for (const label of ['Summary', 'Evidence', 'Statistics', 'Limitations', 'History']) {
    const tab = page.locator('.academy-drill-tabs button').filter({ hasText: label });
    await tab.click();
    if (!(await tab.evaluate((node) => node.classList.contains('active')))) fail('academy/drill-tabs', `${label} did not become active.`);
  }
  await page.getByRole('button', { name: 'Safety Guide' }).click();
  await expectPage('help', 'academy/safety-guide');
  await page.screenshot({ path: resolve(OUT_DIR, 'interactive-academy-safety-guide-1368x753.png'), fullPage: false });

  for (const message of diagnostics.pageErrors) fail('runtime', `Page error: ${message}`);
  for (const message of diagnostics.consoleErrors) fail('runtime', `Console error: ${message}`);
  for (const message of diagnostics.badResponses.filter((value) => value.includes(BASE_URL) && /->\s*5\d\d/.test(value))) fail('runtime', `Server response: ${message}`);
  await context.close();
}

async function main(): Promise<void> {
  if (TRANSPORT_BRIDGE) {
    const result = spawnSync(process.execPath, ['scripts/qa/verifyUi1368.mjs'], { cwd: ROOT, env: process.env, stdio: 'inherit' });
    if (result.status !== 0) process.exitCode = result.status ?? 1;
    return;
  }
  mkdirSync(OUT_DIR, { recursive: true });
  await startServer();
  let browser: Browser;
  try {
    browser = await launchBrowser();
  } catch (error) {
    if (!isMissingPlaywrightBrowser(error)) throw error;
    const reason = 'environment_missing_playwright_browser';
    const report = {
      generatedAt: new Date().toISOString(),
      baseUrl: BASE_URL,
      strict: STRICT,
      skipped: true,
      skipReason: reason,
      canonicalViewport: '1368x753',
      routesChecked: ROUTES,
      findings: [{ kind: 'warning', scope: 'browser', message: String(error) }],
      routeResults: [],
    };
    writeFileSync(resolve(OUT_DIR, 'workspace-runtime-report.json'), `${JSON.stringify(report, null, 2)}
`, 'utf8');
    console.log(`SKIP workspace runtime browser QA — ${reason}. Install Playwright Chromium or set APEX_PLAYWRIGHT_EXECUTABLE to execute this gate.`);
    await stopServer();
    if (STRICT && process.env.APEX_QA_ALLOW_BROWSER_SKIP !== '1') process.exitCode = 1;
    return;
  }

  try {
    const routeViewports = LIGHT_ONLY ? [VIEWPORTS[0]] : VIEWPORTS;
    for (const viewport of routeViewports) {
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
    await verifySettingsIntegrationRuntime(browser);
    await verifyCanonicalInteractiveFlows(browser);
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
