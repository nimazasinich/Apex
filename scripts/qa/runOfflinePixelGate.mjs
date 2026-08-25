import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const root = process.cwd();
const executablePath = String(process.env.APEX_PLAYWRIGHT_EXECUTABLE || '').trim();
if (!executablePath || !fs.existsSync(executablePath)) throw new Error('APEX_PLAYWRIGHT_EXECUTABLE must name an existing Chromium binary.');
const pythonExe = (() => {
  const explicit = String(process.env.APEX_PYTHON || '').trim();
  const candidates = explicit ? [[explicit, []]] : [['python3', []], ['python', []], ['py', ['-3']]];
  for (const [exe, prefix] of candidates) {
    const probe = spawnSync(exe, [...prefix, '--version'], { encoding: 'utf8' });
    if (probe.status === 0 && /^Python 3/.test(String(probe.stdout || probe.stderr || '').trim())) return { exe, prefix };
  }
  throw new Error(`No working Python 3 interpreter found (tried: ${candidates.map(([exe, prefix]) => [exe, ...prefix].join(' ')).join(', ')}). Set APEX_PYTHON to an absolute interpreter path.`);
})();
const outDir = path.resolve(root, process.env.APEX_PIXEL_QA_OUT_DIR || 'QA/profitability-structural-remediation/browser');
const captureDir = path.join(outDir, 'captures');
const diffDir = path.join(outDir, 'diffs');
fs.mkdirSync(captureDir, { recursive: true });
fs.mkdirSync(diffDir, { recursive: true });

const buildInfo = JSON.parse(fs.readFileSync(path.join(root, 'dist/build-info.json'), 'utf8'));
const sourceIndex = fs.readFileSync(path.join(root, 'dist/index.html'), 'utf8');
const offlineIndex = sourceIndex
  .replace('<head>', `<head><base href="${pathToFileURL(path.join(root, 'dist/')).href}">`)
  .replace(/(?:src|href)="\/(?!\/)/g, (match) => match.replace('"/', '"./'));
const offlineIndexPath = path.join(outDir, 'offline-index.html');
fs.writeFileSync(offlineIndexPath, offlineIndex);

const browser = await chromium.launch({
  executablePath,
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-web-security', '--allow-file-access-from-files', '--force-device-scale-factor=1'],
});
const context = await browser.newContext({ viewport: { width: 1368, height: 753 }, deviceScaleFactor: 1, colorScheme: 'light' });
await context.addInitScript(() => {
  localStorage.setItem('apex_theme_v1', 'light');
  localStorage.setItem('apex_watchlist_favorites_v1', '["BTC-USDT","ETH-USDT","SOL-USDT"]');
  const ticker = (symbol, price) => ({ symbol, lastPrice: price, turnover24h: 100000000, priceChange24hPct: 1.25, volume24h: 10000, high24h: price * 1.02, low24h: price * 0.98, fundingRate: 0.0001, openInterest: 1000000, dataState: 'degraded' });
  const tickers = [ticker('BTC-USDT', 67842), ticker('ETH-USDT', 3271), ticker('SOL-USDT', 162)];
  window.fetch = async (input) => {
    const url = String(typeof input === 'string' ? input : input?.url || '');
    let body = { ok: true, dataState: 'degraded', timestamp: Date.now() };
    if (/tickers|majors|markets|scanner/i.test(url)) body = { ...body, tickers, symbols: tickers, candidates: [] };
    else if (/portfolio|account|balance/i.test(url)) body = { ...body, balance: 10000, totalEquity: 10000, availableBalance: 10000, holdings: [], positions: [] };
    else if (/orders/i.test(url)) body = { ...body, orders: [] };
    else if (/strateg/i.test(url)) body = { ...body, strategies: [], definitions: [] };
    return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  class OfflineWebSocket {
    static CONNECTING = 0; static OPEN = 1; static CLOSING = 2; static CLOSED = 3;
    constructor(url) { this.url = String(url); this.readyState = 1; queueMicrotask(() => this.onopen?.(new Event('open'))); }
    send() {} close() { this.readyState = 3; this.onclose?.(new CloseEvent('close', { code: 1000 })); }
    addEventListener(type, listener) { if (type === 'open') queueMicrotask(() => listener(new Event('open'))); }
    removeEventListener() {} dispatchEvent() { return true; }
  }
  Object.defineProperty(window, 'WebSocket', { configurable: true, value: OfflineWebSocket });
});

const page = await context.newPage();
const pageErrors = [];
const consoleErrors = [];
page.on('pageerror', (error) => pageErrors.push(error.message));
page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()); });
await page.goto(pathToFileURL(offlineIndexPath).href, { waitUntil: 'load', timeout: 60_000 });
await page.waitForTimeout(2_000);

const routes = ['watchlist', 'orders', 'positions', 'alerts', 'history', 'analytics', 'settings', 'help'];
const results = [];
for (const route of routes) {
  await page.evaluate((value) => { location.hash = `#/${value}`; }, route);
  await page.waitForTimeout(900);
  const capture = path.join(captureDir, `${route}-1368x753.png`);
  await page.screenshot({ path: capture, fullPage: false });
  const reference = path.join(root, 'Doc/reference/v20', `${route}-1368x753.png`);
  const routeDiffDir = path.join(diffDir, route);
  const diff = spawnSync(pythonExe.exe, [...pythonExe.prefix, 'scripts/utilities/apex_visual_diff.py', reference, capture, '--out', routeDiffDir], { cwd: root, encoding: 'utf8' });
  const reportFile = path.join(routeDiffDir, 'report.json');
  const report = fs.existsSync(reportFile) ? JSON.parse(fs.readFileSync(reportFile, 'utf8')) : null;
  results.push({
    route,
    passed: report?.verdict === 'pass',
    verdict: report?.verdict ?? 'tool_failed',
    msSsim: report?.ms_ssim ?? null,
    edgeF1: report?.edge_geometry?.edge_f1 ?? null,
    pctPixelsChanged: report?.pixel?.pct_pixels_changed ?? null,
    diffExitCode: diff.status,
    diffStderr: diff.status === 0 ? '' : String(diff.stderr || '').slice(0, 500),
  });
}
const rootTextLength = await page.locator('#root').innerText().then((value) => value.trim().length).catch(() => 0);
const browserVersion = browser.version();
await browser.close();

const runtimeGatePassed = rootTextLength >= 40 && pageErrors.length === 0;
const report = {
  status: 'completed',
  generatedAt: new Date().toISOString(),
  browser: { version: browserVersion, executablePath },
  visualDiff: { interpreter: [pythonExe.exe, ...pythonExe.prefix].join(' '), tool: 'scripts/utilities/apex_visual_diff.py' },
  testedBuild: buildInfo,
  viewport: { width: 1368, height: 753, deviceScaleFactor: 1 },
  mode: 'OFFLINE_REAL_CHROMIUM_FILE_BUILD_WITH_DETERMINISTIC_API_STUB',
  runtimeGatePassed,
  rootTextLength,
  pageErrors,
  consoleErrors,
  pixelPassed: results.filter((result) => result.passed).length,
  pixelTotal: results.length,
  results,
  passed: runtimeGatePassed && results.every((result) => result.passed),
};
fs.writeFileSync(path.join(outDir, 'pixel-qa.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ runtimeGatePassed, pixelPassed: report.pixelPassed, pixelTotal: report.pixelTotal, passed: report.passed, pageErrors: pageErrors.length }, null, 2));
process.exitCode = runtimeGatePassed ? 0 : 1;
