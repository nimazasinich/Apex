/**
 * Full Playwright geometry assertions — all pages/states × viewports.
 * Run: npm run test:geometry
 */
import { chromium, type Page } from 'playwright';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const PORT = Number(process.env.APEX_GEOMETRY_PORT || 46245);
const VIEWPORTS = [
  { w: 1440, h: 900 },
  { w: 1672, h: 941 },
  { w: 1920, h: 1080 },
];

const failures: string[] = [];
const fail = (m: string) => failures.push(m);

async function waitShell(page: Page) {
  await page.waitForSelector('.desktop-workspace', { timeout: 60000 });
  await page.waitForTimeout(500);
}

async function navLeft(page: Page, label: string) {
  await page.locator(`.left-rail button[aria-label="Open ${label}"]`).first().click();
  await page.waitForTimeout(450);
}

async function closeAllDock(page: Page) {
  for (const label of ['Watchlist', 'Ticket', 'Intel', 'Memory', 'Positions', 'Signals']) {
    const btn = page.locator(`.apex-command-rail button[aria-label*="${label}" i].is-active`);
    if ((await btn.count()) > 0) await btn.first().click();
  }
  await page.waitForTimeout(250);
}

async function injectDock(page: Page, workspace: string, layout: Record<string, unknown>) {
  const hashByWorkspace: Record<string, string> = {
    overview: '#/overview',
    desk: '#/desk',
    signals: '#/signals',
    tracking: '#/tracking',
    watchlist: '#/watchlist',
    backtest: '#/backtest',
    operations: '#/operations',
  };
  await page.evaluate(
    ({ ws, l }) => {
      const raw = localStorage.getItem('apex.commandBoard.layout.v2');
      const doc = raw ? JSON.parse(raw) : { version: 2, workspaces: {} };
      doc.workspaces = doc.workspaces || {};
      doc.workspaces[ws] = { pinnedTools: [], floatingTool: null, floatingRect: null, ...l };
      localStorage.setItem('apex.commandBoard.layout.v2', JSON.stringify(doc));
    },
    { ws: workspace, l: layout },
  );
  await page.reload({ waitUntil: 'networkidle' });
  await page.evaluate((hash) => {
    window.location.hash = hash;
  }, hashByWorkspace[workspace] ?? '#/overview');
  await waitShell(page);
}

async function measure(page: Page, workspaceSel: string) {
  return page.evaluate(
    ({ sel }) => {
      const root = document.querySelector(`.desktop-workspace ${sel}`) as HTMLElement | null;
      const canvas = document.querySelector('.desktop-workspace main.apex-shell__canvas') as HTMLElement | null;
      const dock = document.querySelector('.desktop-workspace .apex-dock-host:not(.apex-dock-host--empty)') as HTMLElement | null;
      const header = root?.querySelector('.apex-page-header') as HTMLElement | null;
      const metrics = root
        ? [...root.querySelectorAll('.apex-metric-card')]
            .filter((el) => el.getBoundingClientRect().height > 0)
            .map((el) => Math.round(el.getBoundingClientRect().height))
        : [];
      const row = root?.querySelector('.apex-data-table__row td') as HTMLElement | null;
      const panes = [...document.querySelectorAll('.desktop-workspace .apex-dock-split__pane')]
        .map((el) => Math.round(el.getBoundingClientRect().height))
        .filter((h) => h > 0);
      return {
        overflowX: document.documentElement.scrollWidth > window.innerWidth + 2,
        pagePad: root ? parseFloat(getComputedStyle(root).paddingLeft) : null,
        headerH: header?.offsetHeight ?? 0,
        metricHeights: metrics,
        tableRowH: row?.offsetHeight ?? 0,
        canvasW: canvas ? Math.round(canvas.getBoundingClientRect().width) : 0,
        dockW: dock && dock.getBoundingClientRect().width > 1 ? Math.round(dock.getBoundingClientRect().width) : 0,
        splitPanes: panes,
        blank: !root || root.getBoundingClientRect().height < 120,
        shellPresent: !!document.querySelector('.left-rail') && !!document.querySelector('.apex-command-rail'),
        clientWidth: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
      };
    },
    { sel: workspaceSel },
  );
}

function assertCommon(name: string, m: Awaited<ReturnType<typeof measure>>, opts?: { skipPad?: boolean }) {
  if (!m.shellPresent) fail(`${name}: application shell missing`);
  if (m.blank) fail(`${name}: page root blank or missing`);
  if (m.overflowX) fail(`${name}: horizontal overflow (${m.scrollWidth}/${m.clientWidth})`);
  if (!opts?.skipPad && m.pagePad != null && m.pagePad !== 0 && m.pagePad !== 16) fail(`${name}: page padding ${m.pagePad}px expected 16`);
  if (m.headerH > 0 && (m.headerH < 60 || m.headerH > 130)) fail(`${name}: header ${m.headerH}px out of range`);
  if (m.metricHeights.length > 1) {
    const spread = Math.max(...m.metricHeights) - Math.min(...m.metricHeights);
    if (spread > 4) fail(`${name}: metric heights differ ${JSON.stringify(m.metricHeights)}`);
  }
  if (m.tableRowH > 0 && Math.abs(m.tableRowH - 44) > 4) fail(`${name}: row height ${m.tableRowH}px expected 44`);
  if (m.splitPanes.some((h) => h < 220)) fail(`${name}: split pane < 220px`);
}

function assertDock(name: string, m: Awaited<ReturnType<typeof measure>>, closed: boolean) {
  if (closed && m.dockW > 1) fail(`${name}: dock should be closed, got ${m.dockW}px`);
  if (!closed) {
    if (m.dockW < 300 || m.dockW > 400) fail(`${name}: dock width ${m.dockW}px out of 300–400`);
    const maxVw = Math.floor(m.clientWidth * 0.32);
    if (m.dockW > maxVw + 2) fail(`${name}: dock ${m.dockW}px exceeds 32vw (${maxVw}px)`);
  }
}

async function startServer(): Promise<ChildProcess> {
  const child = spawn(process.execPath, ['--import', 'tsx', 'server.ts'], {
    cwd: root,
    shell: false,
    env: { ...process.env, PORT: String(PORT) },
    stdio: 'pipe',
  });
  for (let i = 0; i < 40; i++) {
    try {
      if ((await fetch(`http://127.0.0.1:${PORT}/`)).ok) break;
    } catch {
      /* wait */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return child;
}

async function navHash(page: Page, hash: string) {
  await page.evaluate((h) => {
    window.location.hash = h;
  }, hash);
  await page.waitForTimeout(600);
}

async function runViewport(page: Page, vw: number, vh: number, base: string) {
  await page.setViewportSize({ width: vw, height: vh });
  await page.goto(`${base}?qa=visual`, { waitUntil: 'networkidle', timeout: 120000 });
  await waitShell(page);

  // Command closed
  await navLeft(page, 'Command');
  await closeAllDock(page);
  let m = await measure(page, '.command-board');
  assertCommon(`command-closed@${vw}`, m);
  assertDock(`command-closed@${vw}`, m, true);
  if (m.canvasW < 900) fail(`command-closed@${vw}: canvas ${m.canvasW}px < 900`);

  // Command watchlist
  await injectDock(page, 'overview', {
    dockWidth: 336,
    dockMode: 'single',
    primaryTool: 'watchlist',
    openTabs: ['watchlist'],
  });
  await navLeft(page, 'Command');
  m = await measure(page, '.command-board');
  assertDock(`command-watchlist@${vw}`, m, false);

  // Command ticket
  await injectDock(page, 'overview', {
    dockWidth: 336,
    dockMode: 'single',
    primaryTool: 'ticket',
    openTabs: ['ticket'],
  });
  await navLeft(page, 'Command');
  m = await measure(page, '.command-board');
  assertDock(`command-ticket@${vw}`, m, false);

  // Queue populated
  await navLeft(page, 'Queue');
  await page.waitForSelector('.desktop-workspace [data-workspace="signals"]', { state: 'visible' });
  m = await measure(page, '[data-workspace="signals"]');
  assertCommon(`queue-populated@${vw}`, m);
  if (m.canvasW < 820) fail(`queue-populated@${vw}: canvas ${m.canvasW}px < 820`);

  // Queue empty (filter to zero rows if possible — assert page still valid)
  m = await measure(page, '[data-workspace="signals"]');
  assertCommon(`queue@${vw}`, m);

  // Tracking populated
  await navLeft(page, 'Tracking');
  await page.waitForSelector('.desktop-workspace [data-workspace="tracking"]', { state: 'visible' });
  m = await measure(page, '[data-workspace="tracking"]');
  assertCommon(`tracking-populated@${vw}`, m);
  if (m.canvasW < 820) fail(`tracking-populated@${vw}: canvas ${m.canvasW}px < 820`);

  // Tracking positions dock
  await injectDock(page, 'tracking', {
    dockWidth: 336,
    dockMode: 'single',
    primaryTool: 'positions',
    openTabs: ['positions'],
  });
  await navLeft(page, 'Tracking');
  m = await measure(page, '[data-workspace="tracking"]');
  assertDock(`tracking-positions@${vw}`, m, false);

  // Tracking ticket dock
  await injectDock(page, 'tracking', {
    dockWidth: 336,
    dockMode: 'single',
    primaryTool: 'ticket',
    openTabs: ['ticket'],
  });
  await navLeft(page, 'Tracking');
  m = await measure(page, '[data-workspace="tracking"]');
  assertDock(`tracking-ticket@${vw}`, m, false);

  // Tracking split 60/40
  await injectDock(page, 'tracking', {
    dockWidth: 336,
    dockMode: 'split',
    primaryTool: 'positions',
    secondaryTool: 'ticket',
    openTabs: ['positions', 'ticket'],
    splitRatio: 0.6,
  });
  await navLeft(page, 'Tracking');
  m = await measure(page, '[data-workspace="tracking"]');
  assertDock(`tracking-split-60-40@${vw}`, m, false);
  if (m.splitPanes.length < 2) fail(`tracking-split-60-40@${vw}: expected 2 split panes`);

  // Tracking split 50/50
  await injectDock(page, 'tracking', {
    dockWidth: 336,
    dockMode: 'split',
    primaryTool: 'positions',
    secondaryTool: 'ticket',
    openTabs: ['positions', 'ticket'],
    splitRatio: 0.5,
  });
  await navLeft(page, 'Tracking');
  m = await measure(page, '[data-workspace="tracking"]');
  assertDock(`tracking-split-50-50@${vw}`, m, false);
  if (m.splitPanes.length < 2) fail(`tracking-split-50-50@${vw}: expected 2 split panes`);

  // Markets closed / open
  await navLeft(page, 'Markets');
  await closeAllDock(page);
  m = await measure(page, '[data-workspace="watchlist"]');
  assertCommon(`markets-closed@${vw}`, m);
  assertDock(`markets-closed@${vw}`, m, true);

  await injectDock(page, 'watchlist', {
    dockWidth: 336,
    dockMode: 'single',
    primaryTool: 'watchlist',
    openTabs: ['watchlist'],
  });
  await navLeft(page, 'Markets');
  m = await measure(page, '[data-workspace="watchlist"]');
  assertDock(`markets-watchlist@${vw}`, m, false);

  // Desk
  await navLeft(page, 'Desk');
  await closeAllDock(page);
  m = await measure(page, '.workspace-trading-desk');
  assertCommon(`desk-closed@${vw}`, m, { skipPad: true });
  const chart = await page
    .$eval('[data-desk-chart], .trading-chart, canvas', (el) => el.getBoundingClientRect().width)
    .catch(() => 0);
  if (chart > 0 && chart < 720) fail(`desk-closed@${vw}: chart ${chart}px < 720`);

  await injectDock(page, 'desk', {
    dockWidth: 336,
    dockMode: 'split',
    primaryTool: 'positions',
    secondaryTool: 'ticket',
    openTabs: ['positions', 'ticket'],
    splitRatio: 0.6,
  });
  await navLeft(page, 'Desk');
  m = await measure(page, '.workspace-trading-desk');
  assertDock(`desk-split@${vw}`, m, false);

  // Lab + Memory dock
  await navLeft(page, 'Lab');
  await closeAllDock(page);
  await page.waitForSelector('.desktop-workspace [data-workspace="backtest"]', { state: 'visible', timeout: 30000 });
  m = await measure(page, '[data-workspace="backtest"]');
  assertCommon(`lab-closed@${vw}`, m);

  await injectDock(page, 'backtest', {
    dockWidth: 336,
    dockMode: 'single',
    primaryTool: 'memory',
    openTabs: ['memory'],
  });
  await navLeft(page, 'Lab');
  m = await measure(page, '[data-workspace="backtest"]');
  assertDock(`lab-memory@${vw}`, m, false);

  // Ops
  await navLeft(page, 'Ops');
  await page.waitForSelector('.desktop-workspace [data-workspace="operations"]', { state: 'visible', timeout: 30000 });
  await page.waitForTimeout(800);
  m = await measure(page, '[data-workspace="operations"]');
  assertCommon(`ops@${vw}`, m);

  // Intel (hash route)
  await navHash(page, '#/intel');
  await page.waitForSelector('.desktop-workspace [data-workspace="intel"]', { state: 'visible', timeout: 15000 }).catch(() => undefined);
  m = await measure(page, '[data-workspace="intel"]');
  assertCommon(`intel@${vw}`, m);

  // Memory Active (hash route)
  await navHash(page, '#/memory');
  await page.waitForSelector('.desktop-workspace [data-workspace="memory"]', { state: 'visible', timeout: 15000 }).catch(() => undefined);
  m = await measure(page, '[data-workspace="memory"]');
  assertCommon(`memory-active@${vw}`, m);

  // Memory Archive
  await navHash(page, '#/history');
  await page.waitForSelector('.desktop-workspace [data-workspace="memory"], .desktop-workspace [data-workspace="history"]', { state: 'visible', timeout: 15000 }).catch(() => undefined);
  m = await measure(page, '[data-workspace="memory"], [data-workspace="history"]');
  assertCommon(`memory-archive@${vw}`, m);
}

async function main() {
  const server = await startServer();
  try {
    const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--force-device-scale-factor=1'] });
    const page = await browser.newPage({ deviceScaleFactor: 1 });
    const base = `http://127.0.0.1:${PORT}`;

    for (const vp of VIEWPORTS) {
      await runViewport(page, vp.w, vp.h, base);
    }

    await browser.close();
  } finally {
    spawnSync('taskkill', ['/PID', String(server.pid), '/T', '/F'], { shell: true });
  }

  if (failures.length) {
    console.error(`Geometry assertions failed (${failures.length}):\n` + failures.map((f) => `  - ${f}`).join('\n'));
    process.exit(1);
  }
  console.log(`Geometry assertions passed at ${VIEWPORTS.map((v) => `${v.w}x${v.h}`).join(', ')}.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
