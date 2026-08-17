import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';

const root = resolve(process.cwd());
const outDir = resolve(root, '_qa/diag');
mkdirSync(outDir, { recursive: true });
const PORT = 45123;
const BASE_URL = `http://127.0.0.1:${PORT}`;

function syntheticApi(url: string) {
  const u = new URL(url);
  const p = u.pathname;
  const env = (route: string, data: unknown) => ({ ok: true, exchange: 'kucoin', route, url: 'synthetic://diag', data, _dataSource: 'live', synthetic: true });
  const TICKERS = ['BTC-USDT', 'ETH-USDT', 'SOL-USDT'];
  if (p.includes('contracts-active')) {
    return env('contracts-active', TICKERS.map((t, i) => ({
      symbol: t.replace('-', '').replace('BTC', 'XBT') + 'M',
      quoteCurrency: 'USDT',
      turnoverOf24h: String(1e8 - i * 1e7),
      lastTradePrice: String(65000 - i * 1000),
      priceChgPct: String(0.02 - i * 0.01),
      volumeOf24h: String(50000 + i * 1000),
      markPrice: String(65000),
      openInterest: String(1e6),
      lotSize: '1',
    })));
  }
  if (p.endsWith('/ticker')) return env('ticker', { price: '65000' });
  if (p.endsWith('/level2')) return env('level2', { bids: [], asks: [] });
  if (p.endsWith('/candles')) return env('candles', []);
  if (p.endsWith('/funding')) return env('funding', { value: '0.0001', timePoint: String(Date.now()) });
  if (p.endsWith('/contract')) return env('contract', { markPrice: '65000', openInterest: '1000000', lotSize: '1' });
  if (p.includes('bullet-public')) return { ok: false, exchange: 'kucoin', route: 'bullet-public', reason: 'SYNTHETIC_WS_DISABLED' };
  return { ok: true, value: null, data: null, _dataSource: 'live', synthetic: true };
}

async function waitForServer(timeoutMs = 25000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const r = await fetch(`${BASE_URL}/api/health`);
      if (r.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('server not ready');
}

async function main() {
  let server: ChildProcess | null = null;
  const consoleLogs: string[] = [];
  const pageErrors: string[] = [];
  try {
    server = spawn(process.execPath, ['--import', 'tsx', 'server.ts'], {
      cwd: root,
      env: { ...process.env, PORT: String(PORT), APEX_DECISION_MEMORY_MIRROR: 'false' },
      stdio: 'ignore',
    });
    await waitForServer();
    const browser = await chromium.launch({ headless: true, channel: 'msedge' });
    const page = await browser.newPage({ viewport: { width: 1368, height: 753 } });
    page.on('console', (msg) => consoleLogs.push(`[${msg.type()}] ${msg.text()}`));
    page.on('pageerror', (err) => pageErrors.push(String(err?.stack || err)));
    await page.route('**/api/**', (route) => route.fulfill({
      status: 200, contentType: 'application/json', body: JSON.stringify(syntheticApi(route.request().url())),
    }));
    await page.goto(`${BASE_URL}/#overview`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(5000);
    await page.screenshot({ path: resolve(outDir, 'diag.jpg'), type: 'jpeg', quality: 80, fullPage: false });
    const bodyText = await page.evaluate(() => document.body.innerText.slice(0, 2000));
    writeFileSync(resolve(outDir, 'diag.json'), JSON.stringify({ consoleLogs, pageErrors, bodyText }, null, 2));
    await browser.close();
    console.log('OK, wrote diag.json and diag.jpg');
  } finally {
    if (server?.pid) {
      if (process.platform === 'win32') spawnSync('taskkill.exe', ['/PID', String(server.pid), '/T', '/F'], { stdio: 'ignore' });
      else server.kill('SIGTERM');
    }
  }
}
void main();
