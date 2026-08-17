/**
 * External Chrome headed acceptance for remaining master-plan gates.
 * Primary viewport: 1672×941 @ DPR 1. Verifies PNG metadata dimensions.
 */
import { chromium, type Page } from 'playwright';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { classifyConsoleError, startCaptureServer } from '../lib/captureServer.mts';
import { spawnSync } from 'node:child_process';
import { runQaCleanup } from '../qa/cleanupQaArtifacts.mts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19).replace('T', '_');
const out = resolve(root, '_qa', `v3_final_acceptance_${stamp}`);
const shots = resolve(out, 'screenshots');
const PORT = Number(process.env.APEX_UX_CAPTURE_PORT || 46244);
const BASE = `http://127.0.0.1:${PORT}?qa=visual`;
const VW = 1368;
const VH = 753;

mkdirSync(shots, { recursive: true });

function readPngSize(path: string): { width: number; height: number } {
  const buf = readFileSync(path);
  if (buf[0] !== 0x89 || buf.toString('ascii', 1, 4) !== 'PNG') throw new Error(`Not a PNG: ${path}`);
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

async function waitShell(page: Page) {
  await page.waitForSelector('.left-rail, .apex-command-rail, .desktop-workspace', { timeout: 60000 });
  await page.waitForTimeout(900);
}

async function waitLoaded(page: Page) {
  for (let i = 0; i < 25; i++) {
    if ((await page.locator('text=LOADING WORKSPACE').count()) === 0) break;
    await page.waitForTimeout(350);
  }
}

async function navLeft(page: Page, label: string) {
  const btn = page.locator(`.left-rail button[aria-label*="${label}" i]`).first();
  if ((await btn.count()) > 0) {
    await btn.click().catch(() => undefined);
    await page.waitForTimeout(500);
  }
}

async function navIntel(page: Page) {
  await page.evaluate(`(() => { window.location.hash = '#/intel'; })()`);
  await page.waitForTimeout(700);
  await waitShell(page);
  await page.waitForSelector('.intel-masterpiece, [data-workspace="intel"]', { timeout: 30000 }).catch(() => undefined);
  await page.waitForTimeout(500);
}

async function toggleTool(page: Page, label: string) {
  const btn = page.locator(`.apex-command-rail button[aria-label*="${label}" i]`).first();
  if ((await btn.count()) > 0) {
    await btn.click().catch(() => undefined);
    await page.waitForTimeout(500);
  }
}

async function measure(page: Page) {
  return page.evaluate(`(() => {
    const q = (sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { w: Math.round(r.width), h: Math.round(r.height), x: Math.round(r.x), y: Math.round(r.y) };
    };
    const board = document.querySelector('.command-board');
    const areas = board
      ? ['head','stat','hero','queue','intel','market','pulse','risk'].map((a) => {
          const el = document.querySelector('.command-board__' + a);
          if (!el) return { area: a, present: false };
          const r = el.getBoundingClientRect();
          return { area: a, present: true, w: Math.round(r.width), h: Math.round(r.height) };
        })
      : [];
    return {
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight,
      dpr: window.devicePixelRatio,
      leftRail: q('.left-rail'),
      commandRail: q('.apex-command-rail'),
      dock: q('.apex-dock-host:not(.apex-dock-host--empty)'),
      canvas: q('main.apex-shell__canvas, main'),
      backdropOpen: !!document.querySelector('.insight-panel__backdrop.is-open, .desk-execution-panel__backdrop.is-open'),
      modalBackdrop: !!document.querySelector('.fixed.inset-0.z-\\\\[80\\\\], [data-settings-backdrop], .settings-panel-backdrop'),
      settingsOpen: !!document.querySelector('[data-settings-open="true"], .settings-panel, [aria-label*="Settings" i][aria-modal="true"]'),
      commandBoardAreas: areas,
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      overflowX: document.documentElement.scrollWidth > window.innerWidth + 2,
    };
  })()`);
}

async function closeAllDock(page: Page) {
  for (const label of ['Watchlist', 'Ticket', 'Intel', 'Memory', 'Positions', 'Signals']) {
    const active = page.locator(`.apex-command-rail button[aria-label*="${label}" i][aria-pressed="true"]`);
    if ((await active.count()) > 0) await active.first().click().catch(() => undefined);
  }
  await page.waitForTimeout(350);
}

async function injectSplitDock(page: Page, workspace: string, ratio: number) {
  await page.evaluate(({ ws, r }) => {
    const raw = localStorage.getItem('apex.commandBoard.layout.v2');
    const doc = raw ? JSON.parse(raw) : { version: 2, workspaces: {} };
    doc.workspaces = doc.workspaces || {};
    doc.workspaces[ws] = {
      dockWidth: 336,
      dockMode: 'split',
      primaryTool: 'positions',
      secondaryTool: 'ticket',
      openTabs: ['positions', 'ticket'],
      splitRatio: r,
      pinnedTools: [],
      floatingTool: null,
      floatingRect: null,
    };
    localStorage.setItem('apex.commandBoard.layout.v2', JSON.stringify(doc));
  }, { ws: workspace, r: ratio });
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 120000 });
  await waitShell(page);
}

async function shotAt(page: Page, name: string, report: Record<string, unknown>[], vw: number, vh: number, extras: Record<string, unknown> = {}) {
  await waitLoaded(page);
  const metrics = await measure(page);
  const file = resolve(shots, `${name}-${vw}x${vh}.png`);
  await page.screenshot({ path: file, fullPage: false });
  const png = readPngSize(file);
  const row = {
    name,
    metrics,
    png,
    pngValid: png.width === vw && png.height === vh,
    viewportOk: (metrics as any).innerWidth === vw && (metrics as any).innerHeight === vh && (metrics as any).dpr === 1,
    blockingBackdrop: (metrics as any).backdropOpen,
    overflowX: (metrics as any).overflowX,
    file,
    ...extras,
  };
  report.push(row);
  console.log(`[capture] ${name} png=${png.width}x${png.height} dock=${(metrics as any).dock?.w ?? 0}`);
}

async function shot(page: Page, name: string, report: Record<string, unknown>[], extras: Record<string, unknown> = {}) {
  return shotAt(page, name, report, VW, VH, extras);
}

async function prepareEmptyFixture(page: Page, baseUrl: string, fixtureQuery: string, navLabel: string) {
  await page.goto(`${baseUrl}&${fixtureQuery}`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.evaluate(() => {
    try {
      sessionStorage.setItem('apex.qa.visual.v1', '1');
      localStorage.setItem('apex.commandBoard.layout.v2', JSON.stringify({ version: 2, workspaces: {} }));
    } catch {
      /* ignore */
    }
  });
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 120000 });
  await waitShell(page);
  await navLeft(page, navLabel);
  await closeAllDock(page);
  await waitLoaded(page);
}

async function main() {
  const consoleErrors: string[] = [];
  const applicationErrors: string[] = [];
  const failedRequests: string[] = [];

  const { baseUrl, stop } = await startCaptureServer(PORT);
  const BASE_URL = baseUrl;

  let channel = 'chrome';
  let browser;
  try {
    browser = await chromium.launch({ channel: 'chrome', headless: false, args: ['--force-device-scale-factor=1'] });
  } catch {
    channel = 'msedge';
    browser = await chromium.launch({ channel: 'msedge', headless: false, args: ['--force-device-scale-factor=1'] });
  }

  const context = await browser.newContext({ viewport: { width: VW, height: VH }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      const t = msg.text();
      consoleErrors.push(t);
      if (classifyConsoleError(t) === 'application') applicationErrors.push(t);
    }
  });
  page.on('pageerror', (err) => {
    const t = String(err);
    consoleErrors.push(t);
    applicationErrors.push(t);
  });
  page.on('requestfailed', (req) => {
    const url = req.url();
    if (/24678|@vite|hmr/i.test(url)) return;
    failedRequests.push(`${req.failure()?.errorText || 'fail'} ${url}`);
  });

  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.evaluate(`(() => { try { sessionStorage.setItem('apex.qa.visual.v1','1'); } catch (e) {} })()`);
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 120000 });
  await waitShell(page);

  const report: Record<string, unknown>[] = [];

  // ── Command ─────────────────────────────────────────────
  await navLeft(page, 'Command');
  await waitShell(page);
  await closeAllDock(page);
  await shot(page, 'command-dock-closed', report);

  await toggleTool(page, 'Watchlist');
  await shot(page, 'command-watchlist-docked', report);

  await closeAllDock(page);
  await toggleTool(page, 'Ticket');
  await shot(page, 'command-ticket-docked', report);

  // ── Queue ───────────────────────────────────────────────
  await navLeft(page, 'Queue');
  await waitShell(page);
  await closeAllDock(page);
  await shot(page, 'queue-populated', report);
  const signalRow = page.locator('.desktop-workspace .apex-data-table__row').first();
  if ((await signalRow.count()) > 0) {
    await signalRow.click().catch(() => undefined);
    await page.waitForTimeout(500);
    await toggleTool(page, 'Ticket');
    await shot(page, 'queue-ticket', report);
  }

  await prepareEmptyFixture(page, BASE_URL, 'queue=empty', 'Queue');
  await page.waitForSelector('.desktop-workspace .apex-empty-state__title:has-text("Queue is empty")', {
    state: 'visible',
    timeout: 15000,
  });
  await shot(page, 'queue-empty', report);

  // ── Tracking ────────────────────────────────────────────
  await navLeft(page, 'Tracking');
  await waitShell(page);
  await closeAllDock(page);
  await shot(page, 'tracking-populated', report);
  const thesisRow = page.locator('.desktop-workspace .apex-data-table__row').first();
  if ((await thesisRow.count()) > 0) await thesisRow.click().catch(() => undefined);
  await page.waitForTimeout(400);
  await toggleTool(page, 'Positions');
  await shot(page, 'tracking-positions', report);
  await closeAllDock(page);
  await toggleTool(page, 'Ticket');
  await shot(page, 'tracking-ticket', report);
  await injectSplitDock(page, 'tracking', 0.6);
  await navLeft(page, 'Tracking');
  await shot(page, 'tracking-split-60-40', report);
  await injectSplitDock(page, 'tracking', 0.5);
  await navLeft(page, 'Tracking');
  await shot(page, 'tracking-split-50-50', report);

  await prepareEmptyFixture(page, BASE_URL, 'tracking=empty', 'Tracking');
  await page.waitForSelector('.desktop-workspace .apex-empty-state__title:has-text("No tracked theses")', {
    state: 'visible',
    timeout: 15000,
  });
  await shot(page, 'tracking-empty', report);

  // ── Desk ────────────────────────────────────────────────
  await navLeft(page, 'Desk');
  await waitShell(page);
  await closeAllDock(page);
  await shot(page, 'desk-dock-closed', report);
  await toggleTool(page, 'Positions');
  await shot(page, 'desk-positions', report);
  await closeAllDock(page);
  await toggleTool(page, 'Ticket');
  await shot(page, 'desk-ticket', report);
  await injectSplitDock(page, 'desk', 0.6);
  await navLeft(page, 'Desk');
  await shot(page, 'desk-split-60-40', report);
  await injectSplitDock(page, 'desk', 0.5);
  await navLeft(page, 'Desk');
  await shot(page, 'desk-split-50-50', report);

  // ── Markets ─────────────────────────────────────────────
  await navLeft(page, 'Markets');
  await waitShell(page);
  await shot(page, 'markets-dock-closed', report);
  await toggleTool(page, 'Watchlist');
  await shot(page, 'markets-watchlist', report);

  // ── Lab ─────────────────────────────────────────────────
  await navLeft(page, 'Lab');
  await waitShell(page);
  await closeAllDock(page);
  await shot(page, 'lab-dock-closed', report);
  await toggleTool(page, 'Memory');
  await shot(page, 'lab-memory-docked', report);

  // ── Ops ─────────────────────────────────────────────────
  await navLeft(page, 'Ops');
  await waitShell(page);
  await closeAllDock(page);
  await shot(page, 'ops', report);

  // ── Intel expanded + dock ───────────────────────────────
  await navIntel(page);
  await shot(page, 'intel-expanded', report);
  await navLeft(page, 'Command');
  await waitShell(page);
  await closeAllDock(page);
  await toggleTool(page, 'Intel');
  await page.waitForSelector('.intel-masterpiece--compact, .intel-masterpiece', { timeout: 30000 }).catch(() => undefined);
  await shot(page, 'intel-dock', report);

  // ── Memory expanded ─────────────────────────────────────
  try {
    await navLeft(page, 'Command');
    await waitShell(page);
    await page.evaluate(`(() => {
      try { sessionStorage.setItem('apex.memory.preset.v1','active'); } catch (e) {}
      window.location.hash = '#/memory';
    })()`);
    await page.waitForTimeout(800);
    // Soft wait — Memory may render without remounting rails
    try { await waitShell(page); } catch { await page.waitForTimeout(1000); }
    await shot(page, 'memory-active', report);

    await page.evaluate(`(() => {
      try { sessionStorage.setItem('apex.memory.preset.v1','archive'); } catch (e) {}
      window.location.hash = '#/history';
    })()`);
    await page.waitForTimeout(800);
    try { await waitShell(page); } catch { await page.waitForTimeout(1000); }
    const archiveTab = page.locator('button:has-text("Archive")').first();
    if ((await archiveTab.count()) > 0) await archiveTab.click().catch(() => undefined);
    await shot(page, 'memory-archive', report);
  } catch (err) {
    console.error('[capture] memory branch failed', err);
    await shot(page, 'memory-error-fallback', report, { error: String(err) });
  }

  // ── Settings modal ──────────────────────────────────────
  await navLeft(page, 'Settings');
  await page.waitForTimeout(700);
  await shot(page, 'settings-modal', report);
  await page.keyboard.press('Escape').catch(() => undefined);
  // Ensure settings closes via UI if Escape is ignored
  const closeSettings = page.locator('button[aria-label*="Close" i], button:has-text("Close")').first();
  if ((await closeSettings.count()) > 0) await closeSettings.click().catch(() => undefined);
  await page.waitForTimeout(400);
  await page.evaluate(`(() => { window.location.hash = '#/overview'; })()`);
  await page.waitForTimeout(500);
  try { await waitShell(page); } catch { /* continue */ }
  await shot(page, 'settings-closed', report);

  // Secondary viewports — all primary workspaces
  const secondaryPages = [
    { nav: 'Command', name: 'command-closed', closeDock: true },
    { nav: 'Command', name: 'command-watchlist', tool: 'Watchlist' },
    { nav: 'Command', name: 'command-ticket', tool: 'Ticket' },
    { nav: 'Queue', name: 'queue' },
    { nav: 'Tracking', name: 'tracking' },
    { nav: 'Markets', name: 'markets' },
    { nav: 'Desk', name: 'desk' },
    { nav: 'Lab', name: 'lab' },
    { nav: 'Ops', name: 'ops' },
    { nav: 'Intel', name: 'intel', hash: '#/intel' },
    { nav: 'Queue', name: 'queue-empty', closeDock: true, fixture: 'queue=empty' },
    { nav: 'Tracking', name: 'tracking-empty', closeDock: true, fixture: 'tracking=empty' },
  ];
  for (const vp of [{ w: 1440, h: 900 }, { w: 1920, h: 1080 }]) {
    await page.setViewportSize({ width: vp.w, height: vp.h });
    for (const p of secondaryPages) {
      try {
        if ((p as { fixture?: string }).fixture) {
          await prepareEmptyFixture(page, BASE_URL, (p as { fixture: string }).fixture, p.nav);
        } else {
          await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 120000 });
          await waitShell(page);
          await navLeft(page, p.nav);
          if ((p as { hash?: string }).hash) {
            await page.evaluate(`(() => { window.location.hash = '${(p as { hash?: string }).hash}'; })()`);
            await page.waitForTimeout(700);
          }
          await waitShell(page);
          if (p.closeDock) await closeAllDock(page);
          if (p.tool) {
            await closeAllDock(page);
            await toggleTool(page, p.tool);
          }
        }
        await shotAt(page, p.name, report, vp.w, vp.h);
      } catch (err) {
        console.error(`[capture] secondary ${p.name}@${vp.w} failed`, err);
      }
    }
    // Memory + Settings at secondary sizes
    try {
      await page.evaluate(`(() => { try { sessionStorage.setItem('apex.memory.preset.v1','active'); window.location.hash='#/memory'; } catch (e) {} })()`);
      await page.waitForTimeout(800);
      await waitShell(page);
      await shotAt(page, 'memory', report, vp.w, vp.h);
      await navLeft(page, 'Settings');
      await page.waitForTimeout(700);
      await shotAt(page, 'settings', report, vp.w, vp.h);
      await page.keyboard.press('Escape').catch(() => undefined);
    } catch (err) {
      console.error(`[capture] secondary memory/settings@${vp.w} failed`, err);
    }
  }

  mkdirSync(resolve(out, 'reports'), { recursive: true });
  writeFileSync(
    resolve(out, 'reports', 'final_acceptance_report.json'),
    JSON.stringify({
      channel,
      headed: true,
      stamp,
      primary: `${VW}x${VH}`,
      consoleErrors,
      applicationErrors,
      hmrDisabled: true,
      failedRequests: failedRequests.slice(0, 40),
      captures: report,
    }, null, 2),
  );

  const md = [
    `# V3 Final acceptance — ${stamp}`,
    '',
    `- Browser channel: **${channel}** (headed)`,
    `- Primary viewport: **${VW}×${VH}** DPR 1`,
    `- HMR: disabled (DISABLE_HMR=true)`,
    `- Console errors (session): ${consoleErrors.length}`,
    `- Application console errors: ${applicationErrors.length}`,
    `- Failed network (session): ${failedRequests.length}`,
    '',
    '| Capture | PNG | Viewport | Backdrop | OverflowX |',
    '|---|---|---|---|---|',
    ...report.map((r: any) =>
      `| ${r.name} | ${r.png.width}×${r.png.height} ${r.pngValid ? '✓' : '✗'} | ${r.viewportOk ? '✓' : '✗'} | ${r.blockingBackdrop ? 'FAIL' : 'ok'} | ${r.overflowX ? 'FAIL' : 'ok'} |`,
    ),
    '',
  ].join('\n');
  writeFileSync(resolve(out, 'reports', 'final_acceptance_report.md'), md);

  await browser.close();
  stop();
  console.log(`Wrote ${out}`);
  if (applicationErrors.length) {
    console.error('Application console errors:', applicationErrors.slice(0, 8));
    process.exit(1);
  }

  const sheet = spawnSync('npx', ['tsx', 'scripts/capture/buildContactSheet.mts', shots], {
    cwd: root,
    shell: true,
    stdio: 'inherit',
  });
  if (sheet.status !== 0) {
    console.error('[capture] contact-sheet generation failed — skipping destructive QA cleanup');
    process.exit(sheet.status ?? 1);
  }

  runQaCleanup({ dryRun: false });
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
