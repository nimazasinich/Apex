import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '../..');
const outDir = resolve(root, '_qa/overview-layout');
mkdirSync(outDir, { recursive: true });

const PORT = Number(process.env.APEX_OVERVIEW_AUDIT_PORT || (43_000 + (process.pid % 7_000)));
const BASE_URL = `http://127.0.0.1:${PORT}`;

const TICKERS = ['BTC-USDT', 'ETH-USDT', 'SOL-USDT', 'AVAX-USDT', 'SUI-USDT'];
const BASE = { BTC: 65000, ETH: 3500, SOL: 145, AVAX: 42, SUI: 1.4 };
let tick = 0;

function syntheticApi(url: string) {
  tick += 1;
  const u = new URL(url);
  const p = u.pathname;
  const env = (route: string, data: unknown) => ({
    ok: true,
    exchange: 'kucoin',
    route,
    url: 'synthetic://overview-layout-audit',
    data,
    _dataSource: 'live',
    synthetic: true,
  });
  const tkr = (s: string) => s.replace(/USDTM$/, '-USDT').replace(/^XBT/, 'BTC');
  const sym = (t: string) => t.split('-')[0];
  const price = (t: string) => (BASE[sym(t) as keyof typeof BASE] ?? 10) * (1 + Math.sin((tick + sym(t).length) * 0.18) * 0.004);
  const kl = (t: string, n = 50) => {
    let p = price(t);
    return Array.from({ length: n }, (_, i) => {
      const o = p;
      p *= 1 + 0.0002 + (Math.random() - 0.5) * 0.0015;
      return [String((Math.floor(Date.now() / 1000) - n * 60 + i * 60) * 1000), String(o), String(Math.max(o, p) * 1.002), String(Math.min(o, p) * 0.998), String(p), String(1000 + Math.random() * 3000)];
    });
  };
  const ob = (t: string) => {
    const p = price(t);
    return {
      bids: Array.from({ length: 25 }, (_, i) => [String(p * (1 - (i + 1) * 0.0002)), String(50 / (i + 1))]),
      asks: Array.from({ length: 25 }, (_, i) => [String(p * (1 + (i + 1) * 0.0002)), String(35 / (i + 1))]),
    };
  };
  if (p.includes('contracts-active')) {
    return env('contracts-active', TICKERS.map((t, i) => ({
      symbol: t.replace('-', '').replace('BTC', 'XBT') + 'M',
      quoteCurrency: 'USDT',
      turnoverOf24h: String(1e8 - i * 1e7),
      markPrice: String(price(t)),
      openInterest: String(1e6),
      lotSize: '1',
    })));
  }
  if (p.endsWith('/ticker')) return env('ticker', { price: String(price(tkr(u.searchParams.get('symbol') || 'XBTUSDTM'))) });
  if (p.endsWith('/level2')) return env('level2', ob(tkr(u.searchParams.get('symbol') || 'XBTUSDTM')));
  if (p.endsWith('/candles')) return env('candles', kl(tkr(u.searchParams.get('symbol') || 'XBTUSDTM')));
  if (p.endsWith('/funding')) return env('funding', { value: '0.00022', timePoint: String(Date.now() + 3600000) });
  if (p.endsWith('/contract')) return env('contract', { markPrice: String(price(tkr(u.searchParams.get('symbol') || 'XBTUSDTM'))), openInterest: '1500000', lotSize: '1' });
  if (p.includes('binance')) return { _dataSource: 'live', value: [{ longShortRatio: '1.32' }], synthetic: true };
  if (p.includes('bullet-public')) return { ok: false, exchange: 'kucoin', route: 'bullet-public', reason: 'SYNTHETIC_WS_DISABLED' };
  return { ok: true, value: null, data: null, _dataSource: 'live', synthetic: true };
}

async function waitForServer(timeoutMs = 25_000): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(`${BASE_URL}/api/health`);
      if (response.ok) return;
    } catch {
      // retry
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('dev server did not become ready for overview layout audit');
}

async function main(): Promise<void> {
  let server: ChildProcess | null = null;
  const errors: string[] = [];

  try {
    server = spawn(process.execPath, ['--import', 'tsx', 'server.ts'], {
      cwd: root,
      env: { ...process.env, PORT: String(PORT), APEX_DECISION_MEMORY_MIRROR: 'false' },
      stdio: 'ignore',
    });
    await waitForServer();

    const browser = await chromium.launch({
      headless: true,
      channel: process.env.APEX_PLAYWRIGHT_CHANNEL || 'msedge',
    });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
    await page.route('**/api/**', (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(syntheticApi(route.request().url())),
    }));
    await page.goto(`${BASE_URL}/#overview`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await page.getByText('Precision over noise', { exact: false }).waitFor({ state: 'visible', timeout: 45_000 });
    await page.waitForTimeout(2_000);

    const readBox = async (selector: string, label: string) => {
      const loc = page.locator(selector).first();
      if (await loc.count() === 0) return null;
      const box = await loc.boundingBox();
      if (!box) return null;
      return {
        label,
        top: Math.round(box.y),
        left: Math.round(box.x),
        right: Math.round(box.x + box.width),
        bottom: Math.round(box.y + box.height),
        width: Math.round(box.width),
        height: Math.round(box.height),
      };
    };

    const layout = {
      banner: await readBox('.workspace-overview-banner', 'banner'),
      chart: await readBox('.overview-chart-cell', 'chart'),
      corridor: await readBox('.overview-corridor-cell', 'corridor'),
      risk: await readBox('.overview-risk-cell', 'risk'),
      leftRail: await readBox('nav.ds-panel', 'left-rail'),
    };

    const screenshotPath = resolve(outDir, 'overview-layout-desktop.jpg');
    await page.screenshot({ path: screenshotPath, type: 'jpeg', quality: 80, fullPage: false });
    await browser.close();

    const { banner, chart, corridor, risk, leftRail } = layout;
    if (!banner || !chart || !corridor || !risk) {
      errors.push('missing-layout-nodes');
    } else {
      // Corridor is a peer of LeftRail — tops/bottoms must match the left nav.
      if (!leftRail) {
        errors.push('missing-left-rail');
      } else {
        const heightDelta = Math.abs(corridor.height - leftRail.height);
        const topDelta = Math.abs(corridor.top - leftRail.top);
        const bottomDelta = Math.abs(corridor.bottom - leftRail.bottom);
        if (topDelta > 4) errors.push(`corridor-top-misaligned-with-left-rail: delta=${topDelta}px`);
        if (bottomDelta > 4) errors.push(`corridor-bottom-misaligned-with-left-rail: delta=${bottomDelta}px`);
        if (heightDelta > 4) errors.push(`corridor-height-mismatch-vs-left-rail: delta=${heightDelta}px corridor=${corridor.height} left=${leftRail.height}`);
      }
      if (banner.right > chart.right + 4) errors.push('banner-extends-into-corridor-column');
      if (corridor.left < chart.right - 4) errors.push('corridor-overlaps-chart-column');
      if (risk.right > chart.right + 4) errors.push('risk-extends-into-corridor-column');
    }

    const report = {
      generatedAt: new Date().toISOString(),
      baseUrl: BASE_URL,
      viewport: { width: 1440, height: 1100 },
      layout,
      screenshot: '_qa/overview-layout/overview-layout-desktop.jpg',
      checks: {
        corridorMatchesLeftRail: errors.filter((e) => e.includes('left-rail') || e.includes('corridor-')).length === 0,
        noBannerEncroachment: !errors.some((e) => e.includes('banner') && e.includes('extends')),
        noColumnOverlap: !errors.some((e) => e.includes('overlap') || e.includes('extends-into-corridor')),
      },
      errors,
      ok: errors.length === 0,
    };

    writeFileSync(resolve(outDir, 'OVERVIEW_LAYOUT_AUDIT.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');

    if (!report.ok) {
      console.error('Overview layout audit failed:', errors.join(', '));
      console.error(JSON.stringify(layout, null, 2));
      process.exit(1);
    }

    console.log('Overview layout audit passed.');
    console.log(`Sidebars: left=${layout.leftRail?.height ?? '?'}px · corridor=${corridor!.height}px · Δh=${layout.leftRail ? Math.abs(corridor!.height - layout.leftRail.height) : '?'}px`);
    console.log(`Screenshot: ${report.screenshot}`);
  } finally {
    if (server?.pid) {
      if (process.platform === 'win32') {
        spawnSync('taskkill.exe', ['/PID', String(server.pid), '/T', '/F'], { stdio: 'ignore' });
      } else {
        server.kill('SIGTERM');
      }
    }
  }
}

void main();
