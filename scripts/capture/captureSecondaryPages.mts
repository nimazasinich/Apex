import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';

const root = process.cwd();
const shots = resolve(root, '_qa/ux_capture/screenshots');
mkdirSync(shots, { recursive: true });
const PORT = 46222;
const BASE = `http://127.0.0.1:${PORT}`;

const env = (route: string, data: unknown) => ({
  ok: true,
  exchange: 'kucoin',
  route,
  url: 'synthetic://',
  data,
  _dataSource: 'live',
  synthetic: true,
});

function api(url: string) {
  const u = new URL(url);
  const p = u.pathname;
  if (p.includes('contracts-active')) {
    return env(
      'contracts-active',
      ['BTC', 'ETH', 'SOL'].map((t, i) => ({
        symbol: `${t === 'BTC' ? 'XBT' : t}USDTM`,
        quoteCurrency: 'USDT',
        turnoverOf24h: String(1e8 - i * 1e7),
        markPrice: String(65000 - i * 1000),
        openInterest: '1000000',
        lotSize: '1',
      })),
    );
  }
  if (p.endsWith('/ticker')) return env('ticker', { price: '65000' });
  if (p.endsWith('/level2')) return env('level2', { bids: [['64990', '10']], asks: [['65010', '10']] });
  if (p.endsWith('/candles')) {
    return env(
      'candles',
      Array.from({ length: 40 }, (_, i) => [
        String((Date.now() / 1000 - i * 60) * 1000),
        '65000',
        '65100',
        '64900',
        '65050',
        '1000',
      ]),
    );
  }
  if (p.endsWith('/trades')) return env('trades', []);
  if (p.endsWith('/funding')) return env('funding', { value: '0.0002', timePoint: String(Date.now() + 3e6) });
  if (p.endsWith('/contract')) return env('contract', { markPrice: '65000', openInterest: '1000000', lotSize: '1' });
  if (p.includes('binance')) {
    return {
      _dataSource: 'live',
      value: [{ longShortRatio: '1.3', buySellRatio: '0.9', longAccount: '0.55', shortAccount: '0.45' }],
      synthetic: true,
    };
  }
  if (p.includes('bullet-public')) return { ok: false, reason: 'SYNTHETIC_WS_DISABLED' };
  if (p.includes('operations/status')) {
    return { schemaVersion: 4, generatedAt: new Date().toISOString(), providers: { kucoin: { status: 'ok' } }, synthetic: true };
  }
  return { ok: true, value: null, data: null, _dataSource: 'live', synthetic: true };
}

const server = spawn(process.execPath, ['--import', 'tsx', 'server.ts'], {
  cwd: root,
  env: { ...process.env, PORT: String(PORT), APEX_DECISION_MEMORY_MIRROR: 'false' },
  stdio: 'ignore',
});

try {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`${BASE}/`);
      if (r.ok) break;
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 500));
  }

  const browser = await chromium.launch({ headless: true, channel: 'msedge' });
  const page = await browser.newPage({ viewport: { width: 1368, height: 753 } });
  await page.route('**/api/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(api(route.request().url())),
    }),
  );
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForTimeout(5000);

  const nav: [string, string][] = [
    ['intel', 'Open Intelligence page'],
    ['backtest', 'Open Backtesting page'],
    ['decisions', 'Open Decision memory page'],
    ['history', 'Open History page'],
    ['operations', 'Open Operations page'],
    ['feed', 'Open Feed status page'],
  ];

  for (const [key, aria] of nav) {
    await page.getByRole('button', { name: aria }).first().click({ force: true, timeout: 8000 });
    await page.waitForTimeout(1800);
    await page.screenshot({ path: resolve(shots, `desktop-${key}.jpg`), type: 'jpeg', quality: 78, fullPage: false });
    const text = await page.evaluate(() => document.body.innerText.slice(0, 120).replace(/\s+/g, ' '));
    console.log('ok', key, text);
  }

  await page.getByRole('button', { name: 'Open Settings page' }).first().click({ force: true, timeout: 8000 });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: resolve(shots, 'desktop-settings-execution.jpg'), type: 'jpeg', quality: 78 });

  for (const label of ['Telegram', 'External sources', 'Supplemental'] as const) {
    const tab = page.getByRole('tab', { name: new RegExp(label, 'i') });
    const btn = page.getByRole('button', { name: new RegExp(label, 'i') });
    const target = (await tab.count()) > 0 ? tab.first() : (await btn.count()) > 0 ? btn.first() : null;
    if (!target) {
      console.log('missing settings tab', label);
      continue;
    }
    await target.click({ force: true });
    await page.waitForTimeout(700);
    const slug = label.toLowerCase().replace(/\s+/g, '-');
    await page.screenshot({ path: resolve(shots, `desktop-settings-${slug}.jpg`), type: 'jpeg', quality: 78 });
    console.log('settings', label);
  }

  await browser.close();
  console.log('done');
} finally {
  if (server.pid) spawnSync('taskkill.exe', ['/PID', String(server.pid), '/T', '/F'], { stdio: 'ignore' });
}
