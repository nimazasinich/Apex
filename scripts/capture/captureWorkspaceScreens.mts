/**
 * Captures every workspace page plus key panel tabs for UX review.
 * Navigates via hash after boot (initial load always lands on overview).
 */
import { chromium, type Browser, type Page } from 'playwright';
import { mkdirSync, writeFileSync, existsSync, renameSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const out = resolve(root, '_qa', 'ux_capture');
const shots = resolve(out, 'screenshots');
const PORT = Number(process.env.APEX_UX_CAPTURE_PORT || 46111);
const BASE = process.env.APEX_UX_CAPTURE_URL || `http://127.0.0.1:${PORT}`;

const PAGES = [
  'overview',
  'watchlist',
  'tracking',
  'signals',
  'desk',
  'intel',
  'backtest',
  'decisions',
  'history',
  'operations',
  'feed',
] as const;

const SETTINGS_TABS = ['Execution', 'Telegram', 'External sources', 'Supplemental'] as const;
const CORRIDOR_TABS = ['Signal', 'Book', 'Feed', 'Archive'] as const;

function backupIfExists(dir: string) {
  if (!existsSync(dir)) return;
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const dest = resolve(root, 'temp', `ux_capture_${ts}`);
  mkdirSync(resolve(root, 'temp'), { recursive: true });
  renameSync(dir, dest);
  console.log(`Moved existing capture to ${dest}`);
}

backupIfExists(out);
mkdirSync(shots, { recursive: true });

const tickers = ['BTC-USDT', 'ETH-USDT', 'SOL-USDT', 'AVAX-USDT', 'SUI-USDT'];
let tick = 0;
const basePx: Record<string, number> = { BTC: 65000, ETH: 3500, SOL: 145, AVAX: 42, SUI: 1.4 };
const env = (route: string, data: unknown) => ({
  ok: true,
  exchange: 'kucoin',
  route,
  url: 'synthetic://ux-capture',
  data,
  _dataSource: 'live',
  synthetic: true,
});
const sym = (t: string) => t.split('-')[0];
const price = (t: string) => (basePx[sym(t)] ?? 10) * (1 + Math.sin((tick + sym(t).length) * 0.18) * 0.004);

function api(url: string) {
  tick += 1;
  const u = new URL(url);
  const p = u.pathname;
  if (p.includes('contracts-active')) {
    return env(
      'contracts-active',
      tickers.map((t, i) => ({
        symbol: t.replace('-', '').replace('BTC', 'XBT') + 'M',
        quoteCurrency: 'USDT',
        turnoverOf24h: String(1e8 - i * 1e7),
        markPrice: String(price(t)),
        openInterest: String(1e6),
        lotSize: '1',
      })),
    );
  }
  if (p.endsWith('/ticker')) return env('ticker', { price: String(price('BTC-USDT')) });
  if (p.endsWith('/level2')) {
    const px = price('BTC-USDT');
    return env('level2', {
      bids: Array.from({ length: 20 }, (_, i) => [String(px * (1 - (i + 1) * 0.0002)), String(40 / (i + 1))]),
      asks: Array.from({ length: 20 }, (_, i) => [String(px * (1 + (i + 1) * 0.0002)), String(35 / (i + 1))]),
    });
  }
  if (p.endsWith('/candles')) {
    let p0 = price('BTC-USDT');
    return env(
      'candles',
      Array.from({ length: 60 }, (_, i) => {
        const o = p0;
        p0 *= 1 + (Math.random() - 0.5) * 0.002;
        return [
          String((Math.floor(Date.now() / 1000) - 60 * 60 + i * 60) * 1000),
          String(o),
          String(Math.max(o, p0) * 1.001),
          String(Math.min(o, p0) * 0.999),
          String(p0),
          String(1000 + Math.random() * 2000),
        ];
      }),
    );
  }
  if (p.endsWith('/trades')) {
    return env(
      'trades',
      Array.from({ length: 40 }, (_, i) => ({
        side: Math.random() < 0.5 ? 'buy' : 'sell',
        size: String(1 + Math.random() * 3),
        ts: String((Date.now() - i * 1000) * 1e6),
      })),
    );
  }
  if (p.endsWith('/funding')) return env('funding', { value: '0.00022', timePoint: String(Date.now() + 3_600_000) });
  if (p.endsWith('/contract')) return env('contract', { markPrice: String(price('BTC-USDT')), openInterest: '1500000', lotSize: '1' });
  if (p.includes('binance')) {
    return { _dataSource: 'live', value: [{ longShortRatio: '1.32', buySellRatio: '0.91', longAccount: '0.58', shortAccount: '0.42' }], synthetic: true };
  }
  if (p.includes('bullet-public')) {
    return { ok: false, exchange: 'kucoin', route: 'bullet-public', reason: 'SYNTHETIC_WS_DISABLED' };
  }
  if (p.includes('/api/operations/status')) {
    return {
      schemaVersion: 4,
      generatedAt: new Date().toISOString(),
      providers: { kucoin: { status: 'ok' }, binance: { status: 'ok' } },
      decisionMemory: { mirror: 'idle', rows: 0 },
      adaptive: { status: 'idle' },
      synthetic: true,
    };
  }
  return { ok: true, value: null, data: null, _dataSource: 'live', synthetic: true };
}

async function waitForServer(timeoutMs = 45_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const r = await fetch(`${BASE}/`);
      if (r.ok) return;
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error(`Server not ready at ${BASE}`);
}

async function shot(page: Page, name: string, fullPage = false) {
  await page.waitForTimeout(500);
  await page.screenshot({
    path: resolve(shots, `${name}.jpg`),
    type: 'jpeg',
    quality: 78,
    fullPage,
  });
  console.log(`shot ${name}`);
}

async function goPage(page: Page, key: string) {
  await page.evaluate((k) => {
    window.location.hash = `#/${k}`;
  }, key);
  await page.waitForTimeout(900);
}

let server: ChildProcess | null = null;
let browser: Browser | null = null;
const manifest: { name: string; notes: string }[] = [];

try {
  if (!process.env.APEX_UX_CAPTURE_URL) {
    server = spawn(process.execPath, ['--import', 'tsx', 'server.ts'], {
      cwd: root,
      env: { ...process.env, PORT: String(PORT), APEX_DECISION_MEMORY_MIRROR: 'false' },
      stdio: 'ignore',
    });
  }
  await waitForServer();

  const channel = process.platform === 'win32' ? 'msedge' : undefined;
  browser = await chromium.launch({ headless: true, channel });
  const page = await browser.newPage({ viewport: { width: 1368, height: 753 } });
  await page.route('**/api/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(api(route.request().url())),
    }),
  );

  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForTimeout(3500);

  for (const key of PAGES) {
    await goPage(page, key);
    await shot(page, `desktop-${key}`, true);
    manifest.push({ name: `desktop-${key}`, notes: `Workspace page: ${key}` });
  }

  // Settings modal + tabs
  await goPage(page, 'settings');
  await page.waitForTimeout(700);
  await shot(page, 'desktop-settings-execution', false);
  manifest.push({ name: 'desktop-settings-execution', notes: 'Settings modal — Execution tab' });
  for (const tab of SETTINGS_TABS) {
    if (tab === 'Execution') continue;
    const btn = page.getByRole('button', { name: new RegExp(tab, 'i') });
    if ((await btn.count()) > 0) {
      await btn.first().click({ force: true, timeout: 4000 }).catch(() => undefined);
      await shot(page, `desktop-settings-${tab.toLowerCase().replace(/\s+/g, '-')}`, false);
      manifest.push({ name: `desktop-settings-${tab.toLowerCase().replace(/\s+/g, '-')}`, notes: `Settings tab: ${tab}` });
    }
  }
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);

  // Desk corridor tabs
  await goPage(page, 'desk');
  await page.waitForTimeout(1000);
  for (const tab of CORRIDOR_TABS) {
    const btn = page.getByRole('button', { name: new RegExp(`^${tab}$`, 'i') });
    if ((await btn.count()) > 0) {
      await btn.first().click({ force: true, timeout: 3000 }).catch(() => undefined);
      await shot(page, `desktop-desk-corridor-${tab.toLowerCase()}`, false);
      manifest.push({ name: `desktop-desk-corridor-${tab.toLowerCase()}`, notes: `Trading desk corridor tab: ${tab}` });
    }
  }

  // Mobile primary destinations
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(500);
  for (const key of ['overview', 'watchlist', 'signals', 'desk', 'tracking', 'operations'] as const) {
    await goPage(page, key);
    await shot(page, `mobile-${key}`, false);
    manifest.push({ name: `mobile-${key}`, notes: `Mobile viewport: ${key}` });
  }

  // Mobile more sheet
  const more = page.getByRole('button', { name: 'Open more workspace pages' });
  if ((await more.count()) > 0) {
    await more.first().click({ force: true });
    await page.waitForTimeout(400);
    await shot(page, 'mobile-more-sheet', false);
    manifest.push({ name: 'mobile-more-sheet', notes: 'Mobile overflow destinations sheet' });
    await page.keyboard.press('Escape');
  }

  writeFileSync(resolve(out, 'manifest.json'), `${JSON.stringify({ generatedAt: new Date().toISOString(), base: BASE, shots: manifest }, null, 2)}\n`);
  console.log(JSON.stringify({ ok: true, count: manifest.length, out }, null, 2));
} catch (error) {
  console.error(error);
  writeFileSync(
    resolve(out, 'manifest.json'),
    `${JSON.stringify({ ok: false, error: String(error), shots: manifest }, null, 2)}\n`,
  );
  process.exitCode = 1;
} finally {
  if (browser) await browser.close().catch(() => undefined);
  if (server?.pid) {
    if (process.platform === 'win32') {
      spawnSync('taskkill.exe', ['/PID', String(server.pid), '/T', '/F'], { stdio: 'ignore' });
    } else {
      server.kill('SIGTERM');
    }
  }
}
