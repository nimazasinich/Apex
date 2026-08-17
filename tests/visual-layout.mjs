// Visual layout QA — drives system Edge via Playwright (Chromium CDN is geo-blocked here).
// Run: node tests/visual-layout.mjs <tag>
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn, spawnSync } from 'node:child_process';

const TAG = process.argv[2] || 'before';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let URL = process.env.APEX_VISUAL_QA_URL || 'http://127.0.0.1:3000';
const OUT = path.resolve(ROOT, '_qa', 'visual-layout');
fs.mkdirSync(OUT, { recursive: true });
const DESKTOP = { width: 1440, height: 900 };
const NARROW = { width: 1024, height: 800 };

const consoleErrors = [];
const failedRequests = [];
let server = null;

async function ensureServer() {
  try {
    const response = await fetch(URL);
    if (response.ok) return;
  } catch {
    // Start an isolated audit server below.
  }

  const port = Number(process.env.APEX_VISUAL_QA_PORT || (44_000 + (process.pid % 6_000)));
  URL = `http://127.0.0.1:${port}`;
  server = spawn(process.execPath, ['--import', 'tsx', 'server.ts'], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(port), APEX_DECISION_MEMORY_MIRROR: 'false' },
    stdio: 'ignore',
  });

  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(URL);
      if (response.ok) return;
    } catch {
      // retry
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 500));
  }
  throw new Error(`visual QA server did not become ready at ${URL}`);
}

const launchOptions = { headless: true };
if (process.env.APEX_PLAYWRIGHT_EXECUTABLE) {
  launchOptions.executablePath = process.env.APEX_PLAYWRIGHT_EXECUTABLE;
} else if (process.env.APEX_PLAYWRIGHT_CHANNEL) {
  launchOptions.channel = process.env.APEX_PLAYWRIGHT_CHANNEL;
} else if (process.platform === 'win32') {
  launchOptions.channel = 'msedge';
}
const browser = await chromium.launch(launchOptions);
const ctx = await browser.newContext({ viewport: DESKTOP, deviceScaleFactor: 1 });
const page = await ctx.newPage();
page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 220)); });
page.on('pageerror', e => consoleErrors.push('PAGEERROR: ' + e.message.slice(0, 220)));
page.on('requestfailed', r => failedRequests.push(r.url().slice(0, 120) + ' :: ' + (r.failure()?.errorText || '')));
page.on('response', r => { if (r.status() >= 500) failedRequests.push(r.status() + ' ' + r.url().slice(0, 120)); });

await ensureServer();
await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(e => console.log('goto:', e.message));

// Wait until the dashboard renders (left watchlist aside appears) OR the honest unavailable card shows.
let state = 'loading';
const deadline = Date.now() + 45000;
while (Date.now() < deadline) {
  const hasAside = await page.locator('aside').count();
  const hasUnavail = await page.locator('text=/UNAVAILABLE|unreachable|No live/i').count();
  if (hasAside > 0) { state = 'dashboard'; break; }
  if (hasUnavail > 0) { state = 'unavailable'; break; }
  await page.waitForTimeout(1500);
}
await page.waitForTimeout(2500); // settle live ticks
console.log('render state:', state);

await page.screenshot({ path: path.join(OUT, `${TAG}_desktop.jpg`), type: 'jpeg', quality: 72, fullPage: false });

const layout = await page.evaluate(() => {
  const docEl = document.documentElement;
  const out = { docOverflowX: docEl.scrollWidth - docEl.clientWidth, overflowers: [], scrollers: [], overlaps: [] };
  document.querySelectorAll('*').forEach(el => {
    const r = el.getBoundingClientRect();
    if (el.scrollWidth > el.clientWidth + 2 && r.width > 60 && r.height > 8) {
      out.overflowers.push({ tag: el.tagName, cls: (el.className || '').toString().slice(0, 80), sw: el.scrollWidth, cw: el.clientWidth, w: Math.round(r.width) });
    }
    const cs = getComputedStyle(el);
    const vS = (cs.overflowY === 'auto' || cs.overflowY === 'scroll') && el.scrollHeight > el.clientHeight + 2;
    const hS = (cs.overflowX === 'auto' || cs.overflowX === 'scroll') && el.scrollWidth > el.clientWidth + 2;
    if ((vS || hS) && r.width > 40 && r.height > 40) {
      out.scrollers.push({ axis: (vS ? 'V' : '') + (hS ? 'H' : ''), cls: (el.className || '').toString().slice(0, 70), w: Math.round(r.width), h: Math.round(r.height) });
    }
  });
  out.overflowers = out.overflowers.slice(0, 30);
  const overlap = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom - 6 && b.top < a.bottom - 6;
  document.querySelectorAll('aside, section').forEach(panel => {
    const stack = Array.from(panel.querySelectorAll(':scope > div > *')).filter(c => {
      const r = c.getBoundingClientRect(); return r.height > 12 && r.width > 12;
    });
    for (let i = 0; i < stack.length; i++)
      for (let j = i + 1; j < stack.length; j++) {
        const ra = stack[i].getBoundingClientRect(), rb = stack[j].getBoundingClientRect();
        if (overlap(ra, rb)) out.overlaps.push({
          panel: (panel.className || '').toString().slice(0, 22),
          a: (stack[i].className || '').toString().slice(0, 44),
          b: (stack[j].className || '').toString().slice(0, 44)
        });
      }
  });
  out.overlaps = out.overlaps.slice(0, 20);
  return out;
});

const results = { renderState: state, watchlistClick: false, watchlistDblClick: false, settingsEsc: false };
try {
  const aside = page.locator('aside').first();
  if (await aside.count()) {
    const row = aside.locator('[class*="cursor-pointer"], button').first();
    if (await row.count()) {
      await row.click({ timeout: 5000 }); await page.waitForTimeout(800); results.watchlistClick = true;
      await row.dblclick({ timeout: 5000 }).catch(() => {}); await page.waitForTimeout(800); results.watchlistDblClick = true;
      await page.keyboard.press('Escape').catch(() => {}); await page.waitForTimeout(400);
    }
  }
} catch (e) { console.log('watchlist interaction:', e.message.slice(0, 120)); }

try {
  const gear = page.locator('button[title*="Setting" i], button:has-text("Settings"), [aria-label*="setting" i]').first();
  if (await gear.count()) {
    await gear.click({ timeout: 4000 }); await page.waitForTimeout(900);
    await page.keyboard.press('Escape'); await page.waitForTimeout(700);
    const stillOpen = await page.locator('text=/API .*Credential|Scanner Config/i').count();
    results.settingsEsc = stillOpen === 0 ? true : 'esc_uncertain';
  }
} catch (e) { console.log('settings interaction:', e.message.slice(0, 120)); }

await page.setViewportSize(NARROW);
await page.waitForTimeout(1500);
await page.screenshot({ path: path.join(OUT, `${TAG}_narrow.jpg`), type: 'jpeg', quality: 72, fullPage: false });

const report = { tag: TAG, renderState: state, docOverflowX: layout.docOverflowX,
  overflowerCount: layout.overflowers.length, overflowers: layout.overflowers,
  scrollerCount: layout.scrollers.length, scrollers: layout.scrollers,
  overlapCount: layout.overlaps.length, overlaps: layout.overlaps,
  consoleErrors, failedRequests: [...new Set(failedRequests)].slice(0, 25), interactions: results };
fs.writeFileSync(path.join(OUT, `${TAG}_report.json`), JSON.stringify(report, null, 2));

console.log('=== VISUAL QA (' + TAG + ') ===');
console.log('renderState:', state);
console.log('docOverflowX(px):', report.docOverflowX);
console.log('overflowers:', report.overflowerCount);
report.overflowers.forEach(o => console.log('  ' + o.tag + ' w=' + o.w + ' sw=' + o.sw + ' :: ' + o.cls));
console.log('scrollContainers:', report.scrollerCount);
report.scrollers.forEach(s => console.log('  [' + s.axis + '] ' + s.w + 'x' + s.h + ' :: ' + s.cls));
console.log('overlaps:', report.overlapCount);
report.overlaps.forEach(o => console.log('  panel(' + o.panel + ') A[' + o.a + '] B[' + o.b + ']'));
console.log('consoleErrors:', consoleErrors.length);
consoleErrors.slice(0, 12).forEach(e => console.log('  ' + e));
console.log('failedRequests:', report.failedRequests.length);
report.failedRequests.slice(0, 12).forEach(e => console.log('  ' + e));
console.log('interactions:', JSON.stringify(results));
await browser.close();
if (server?.pid) {
  if (process.platform === 'win32') {
    spawnSync('taskkill.exe', ['/PID', String(server.pid), '/T', '/F'], { stdio: 'ignore' });
  } else {
    server.kill('SIGTERM');
  }
}
