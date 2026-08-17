import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const out = resolve(root, '_qa', 'ui_audit');
const screenshots = resolve(out, 'screenshots');
mkdirSync(screenshots, { recursive: true });

const port = Number(process.env.APEX_UI_AUDIT_PORT || (43_000 + (process.pid % 7_000)));
const baseUrl = process.env.APEX_UI_AUDIT_URL || `http://127.0.0.1:${port}`;
const errors = [];
const warnings = [];
const clicked = [];

const tickers = ['BTC-USDT', 'ETH-USDT', 'SOL-USDT', 'AVAX-USDT', 'SUI-USDT'];
let tick = 0;
const base = { BTC: 65000, ETH: 3500, SOL: 145, AVAX: 42, SUI: 1.4 };

const env = (route, data) => ({
  ok: true,
  exchange: 'kucoin',
  route,
  url: 'synthetic://ui-audit',
  data,
  _dataSource: 'live',
  synthetic: true,
});

const tkr = (s) => s.replace(/USDTM$/, '-USDT').replace(/^XBT/, 'BTC');
const sym = (t) => t.split('-')[0];
const price = (t) => (base[sym(t)] ?? 10) * (1 + Math.sin((tick + sym(t).length) * 0.18) * 0.004);

function kl(t, n = 50) {
  let p = price(t);
  const bear = ['SOL-USDT', 'AVAX-USDT', 'SUI-USDT'].includes(t);
  return Array.from({ length: n }, (_, i) => {
    const o = p;
    p *= 1 + (bear ? -0.0013 : 0.0002) + (Math.random() - 0.5) * 0.0015;
    return [
      String((Math.floor(Date.now() / 1000) - n * 60 + i * 60) * 1000),
      String(o),
      String(Math.max(o, p) * 1.002),
      String(Math.min(o, p) * 0.998),
      String(p),
      String(1000 + Math.random() * 3000),
    ];
  });
}

function ob(t) {
  const p = price(t);
  const bear = ['SOL-USDT', 'AVAX-USDT', 'SUI-USDT'].includes(t);
  return {
    bids: Array.from({ length: 25 }, (_, i) => [
      String(p * (1 - (i + 1) * 0.0002)),
      String((bear ? 20 : 50) * (1 + Math.random()) / (i + 1)),
    ]),
    asks: Array.from({ length: 25 }, (_, i) => [
      String(p * (1 + (i + 1) * 0.0002)),
      String((bear ? 80 : 35) * (1 + Math.random()) / (i + 1)),
    ]),
  };
}

function trades(t) {
  const bear = ['SOL-USDT', 'AVAX-USDT', 'SUI-USDT'].includes(t);
  return Array.from({ length: 120 }, (_, i) => ({
    side: bear ? (Math.random() < 0.74 ? 'sell' : 'buy') : (Math.random() < 0.5 ? 'sell' : 'buy'),
    size: String(1 + Math.random() * 4),
    ts: String((Date.now() - i * 60) * 1e6),
  }));
}

function api(url) {
  tick += 1;
  const u = new URL(url);
  const p = u.pathname;
  if (p.includes('contracts-active')) {
    return env('contracts-active', tickers.map((t, i) => ({
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
  if (p.endsWith('/trades')) return env('trades', trades(tkr(u.searchParams.get('symbol') || 'XBTUSDTM')));
  if (p.endsWith('/funding')) return env('funding', { value: '0.00022', timePoint: String(Date.now() + 3600000) });
  if (p.endsWith('/contract')) return env('contract', {
    markPrice: String(price(tkr(u.searchParams.get('symbol') || 'XBTUSDTM'))),
    openInterest: String(1.5e6 + tick * 1000),
    lotSize: '1',
  });
  if (p.includes('binance')) {
    return {
      _dataSource: 'live',
      value: [{ longShortRatio: '1.32', buySellRatio: '0.91', longAccount: '0.58', shortAccount: '0.42' }],
      synthetic: true,
    };
  }
  if (p.includes('bullet-public')) {
    return { ok: false, exchange: 'kucoin', route: 'bullet-public', url: 'synthetic://', reason: 'SYNTHETIC_WS_DISABLED' };
  }
  return { ok: true, value: null, data: null, _dataSource: 'live', synthetic: true };
}

async function waitForServer(timeoutMs = 30_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(`${baseUrl}/`);
      if (response.ok) return;
    } catch {
      // retry
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 500));
  }
  throw new Error(`UI audit server did not become ready at ${baseUrl}`);
}

function launchOptions() {
  const options = { headless: true };
  if (process.env.APEX_PLAYWRIGHT_EXECUTABLE) {
    options.executablePath = process.env.APEX_PLAYWRIGHT_EXECUTABLE;
  } else if (process.env.APEX_PLAYWRIGHT_CHANNEL) {
    options.channel = process.env.APEX_PLAYWRIGHT_CHANNEL;
  } else if (process.platform === 'win32') {
    options.channel = 'msedge';
  }
  return options;
}

function screenshotPath(name) {
  return resolve(screenshots, `${name}.jpg`);
}

function isExpectedSyntheticSocketMessage(text) {
  return text.includes('WebSocket closed without opened')
    || text.includes('[vite] failed to connect to websocket')
    || text.includes('SYNTHETIC_WS_DISABLED')
    || text.includes('WebSocket connection to');
}

async function clickDesktopNav(page, pageKey, label) {
  const button = page.getByRole('button', { name: `Open ${label} page` });
  if (await button.count() === 0) {
    errors.push({ type: 'missing-navigation', page: pageKey, label, surface: 'desktop' });
    return false;
  }
  await button.first().click({ timeout: 5000 });
  await page.waitForTimeout(350);
  return true;
}

async function clickMobileNav(page, pageKey, label) {
  const primary = page.getByRole('button', { name: `Open ${label}` });
  if (await primary.count()) {
    await primary.first().click({ timeout: 5000 });
    await page.waitForTimeout(350);
    return true;
  }

  const more = page.getByRole('button', { name: 'Open more workspace pages' });
  if (await more.count() === 0) {
    errors.push({ type: 'missing-navigation', page: pageKey, label, surface: 'mobile' });
    return false;
  }
  await more.first().click({ timeout: 5000 });
  await page.waitForTimeout(250);
  const sheet = page.getByRole('dialog', { name: 'More workspace pages' });
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const destination = sheet.getByRole('button', { name: new RegExp(escaped, 'i') });
  if (await destination.count() === 0) {
    errors.push({ type: 'missing-navigation', page: pageKey, label, surface: 'mobile-more' });
    await page.keyboard.press('Escape');
    return false;
  }
  await destination.first().click({ timeout: 5000 });
  await page.waitForTimeout(350);
  return true;
}

async function clickNav(page, pageKey, label, { mobile = false } = {}) {
  const navigated = mobile
    ? await clickMobileNav(page, pageKey, label)
    : await clickDesktopNav(page, pageKey, label);
  if (!navigated) return;

  if (pageKey === 'settings') {
    const hash = await page.evaluate(() => window.location.hash);
    if (hash !== '#/settings') errors.push({ type: 'wrong-hash', page: pageKey, hash });
    // Settings opens a full-screen modal; close it so later nav clicks are not blocked.
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    clicked.push(pageKey);
    await page.screenshot({ path: screenshotPath(`page-${pageKey}`), type: 'jpeg', quality: 72, fullPage: true });
    return;
  }
  clicked.push(pageKey);
  const hash = await page.evaluate(() => window.location.hash);
  if (hash !== `#/${pageKey}`) errors.push({ type: 'wrong-hash', page: pageKey, hash });
  await page.screenshot({ path: screenshotPath(`page-${pageKey}`), type: 'jpeg', quality: 72, fullPage: true });
}

let server = null;
let browser = null;

try {
  if (!process.env.APEX_UI_AUDIT_URL) {
    server = spawn(process.execPath, ['--import', 'tsx', 'server.ts'], {
      cwd: root,
      env: { ...process.env, PORT: String(port), APEX_DECISION_MEMORY_MIRROR: 'false' },
      stdio: 'ignore',
    });
  }
  await waitForServer();

  browser = await chromium.launch(launchOptions());
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  page.on('console', (message) => {
    if (message.type() === 'error' && !isExpectedSyntheticSocketMessage(message.text())) {
      errors.push({ type: 'console', text: message.text().slice(0, 500) });
    }
    if (message.type() === 'warning') warnings.push(message.text().slice(0, 500));
  });
  page.on('pageerror', (error) => {
    if (!isExpectedSyntheticSocketMessage(error.message)) {
      errors.push({ type: 'pageerror', text: error.message.slice(0, 500) });
    }
  });
  await page.route('**/api/**', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(api(route.request().url())),
  }));

  await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForTimeout(4_000);
  await page.screenshot({ path: screenshotPath('page-overview'), type: 'jpeg', quality: 72, fullPage: true });

  const nav = [
    ['overview', 'Command center'],
    ['watchlist', 'Markets'],
    ['tracking', 'Tracking'],
    ['signals', 'Signal queue'],
    ['desk', 'Trading desk'],
    ['intel', 'Intelligence'],
    ['backtest', 'Backtesting'],
    ['decisions', 'Decision memory'],
    ['operations', 'Operations'],
    ['feed', 'Feed status'],
    ['history', 'History'],
    ['settings', 'Settings'],
  ];
  for (const [pageKey, label] of nav) await clickNav(page, pageKey, label);
  await clickNav(page, 'overview', 'Command center');

  const rightSidebarCount = await page.locator('[data-testid="right-sidebar"], .right-sidebar, .command-sidebar').count();
  const mainText = await page.locator('main').innerText().catch(() => '');

  const settingsButton = page.getByRole('button', { name: 'Settings' }).filter({ hasNot: page.locator('.left-rail') });
  const headerSettings = page.locator('.dh-icon-btn[title="Settings"]:visible, button[title="System Exchange Settings"]:visible');
  if (await headerSettings.count()) {
    await headerSettings.first().click({ timeout: 5000 });
    await page.waitForTimeout(500);
    await page.keyboard.press('Escape');
  } else if (await settingsButton.count()) {
    await settingsButton.first().click({ timeout: 5000 });
    await page.waitForTimeout(500);
    await page.keyboard.press('Escape');
  } else {
    errors.push({ type: 'missing-settings-flow' });
  }

  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(500);
  await clickNav(page, 'desk', 'Trading Desk', { mobile: true });
  await page.waitForTimeout(1200);
  await clickNav(page, 'tracking', 'Tracking', { mobile: true });
  await page.waitForTimeout(500);
  const trackingCards = await page.locator('.tracking-mobile-card').count();
  if (trackingCards > 0) {
    await page.locator('.tracking-mobile-card').first().click({ timeout: 5000 });
    await page.waitForTimeout(400);
  }
  await clickNav(page, 'desk', 'Trading Desk', { mobile: true });
  await page.waitForTimeout(800);
  const detailButton = page.locator('button[title="Open full execution level details"]:visible');
  const signalDrawer = { available: false, tabs: [] };
  if (await detailButton.count()) {
    await detailButton.last().click({ timeout: 5000 });
    await page.waitForTimeout(500);
    signalDrawer.available = (await page.locator('.signal-inspector').count()) > 0;
    for (const [tab, visibleLabel] of [['METRICS', 'METRICS'], ['EDGE', 'EDGE'], ['LEVELS', 'BREAKOUTS'], ['CAPITAL', 'CAPITAL']]) {
      const tabButton = page.getByRole('button', { name: new RegExp(visibleLabel, 'i') });
      if (await tabButton.count()) {
        await tabButton.first().click({ timeout: 5000 });
        signalDrawer.tabs.push(tab);
        await page.screenshot({
          path: screenshotPath(`signal-drawer-${tab.toLowerCase()}`),
          type: 'jpeg',
          quality: 72,
          fullPage: false,
        });
      }
    }
    await page.keyboard.press('Escape');
  } else {
    errors.push({ type: 'missing-signal-detail-flow' });
  }

  const buttons = await page.locator('button').evaluateAll((items) => items.map((button) => ({
    text: button.innerText.trim(),
    aria: button.getAttribute('aria-label'),
    title: button.getAttribute('title'),
    disabled: button.disabled,
    visible: Boolean(button.offsetWidth || button.offsetHeight || button.getClientRects().length),
  })));
  const report = {
    generatedAt: new Date().toISOString(),
    baseUrl,
    clicked,
    warnings,
    errors,
    buttonCount: buttons.length,
    rightSidebarCount,
    rightSidebarDisabled: rightSidebarCount === 0,
    mainContentPresent: mainText.trim().length > 0,
    signalDrawer,
    mobileTrackingCards: trackingCards,
    browser: process.env.APEX_PLAYWRIGHT_CHANNEL || (process.platform === 'win32' ? 'msedge' : 'default'),
    buttons,
    ok: errors.length === 0 && rightSidebarCount === 0 && mainText.trim().length > 0 && signalDrawer.available && signalDrawer.tabs.length === 4,
  };
  writeFileSync(resolve(out, 'ui_click_audit_result.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({
    ok: report.ok,
    clicked: clicked.length,
    rightSidebarDisabled: report.rightSidebarDisabled,
    signalTabs: signalDrawer.tabs,
    errors: errors.length,
    output: resolve(out, 'ui_click_audit_result.json'),
  }, null, 2));
  if (!report.ok) process.exitCode = 1;
} catch (error) {
  const reason = error instanceof Error ? error.message : String(error);
  const report = {
    generatedAt: new Date().toISOString(),
    baseUrl,
    clicked,
    warnings,
    errors: [...errors, { type: 'fatal', text: reason }],
    ok: false,
  };
  writeFileSync(resolve(out, 'ui_click_audit_result.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.error(reason);
  process.exitCode = 1;
} finally {
  if (browser) await browser.close().catch(() => {});
  if (server?.pid) {
    if (process.platform === 'win32') {
      spawnSync('taskkill.exe', ['/PID', String(server.pid), '/T', '/F'], { stdio: 'ignore' });
    } else {
      server.kill('SIGTERM');
    }
  }
}
