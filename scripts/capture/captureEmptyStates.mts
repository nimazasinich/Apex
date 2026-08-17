/**
 * Headed Chrome captures for Queue empty and Tracking empty QA fixtures.
 * Usage: tsx scripts/captureEmptyStates.mts [output-screenshots-dir]
 */
import { chromium, type Page } from 'playwright';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { classifyConsoleError, startCaptureServer } from '../lib/captureServer.mts';
import { runQaCleanup } from '../qa/cleanupQaArtifacts.mts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const outDir =
  process.argv[2] ??
  resolve(root, '_qa', `empty_states_${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19).replace('T', '_')}`, 'screenshots');
mkdirSync(outDir, { recursive: true });

const PORT = Number(process.env.APEX_EMPTY_CAPTURE_PORT || 46248);
const VIEWPORTS = [
  { w: 1440, h: 900 },
  { w: 1672, h: 941 },
  { w: 1920, h: 1080 },
];

function readPngSize(path: string) {
  const buf = readFileSync(path);
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

async function waitShell(page: Page) {
  await page.waitForSelector('.desktop-workspace', { timeout: 60000 });
  await page.waitForTimeout(900);
}

async function waitLoaded(page: Page) {
  for (let i = 0; i < 25; i++) {
    if ((await page.locator('text=LOADING WORKSPACE').count()) === 0) break;
    await page.waitForTimeout(350);
  }
}

async function closeAllDock(page: Page) {
  for (const label of ['Watchlist', 'Ticket', 'Intel', 'Memory', 'Positions', 'Signals']) {
    const active = page.locator(`.apex-command-rail button[aria-label*="${label}" i][aria-pressed="true"]`);
    if ((await active.count()) > 0) await active.first().click().catch(() => undefined);
  }
  await page.waitForTimeout(350);
}

async function preparePage(page: Page, baseUrl: string, fixtureQuery: string, navLabel: string) {
  const url = `${baseUrl}&${fixtureQuery}`;
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.evaluate(() => {
    try {
      sessionStorage.setItem('apex.qa.visual.v1', '1');
      localStorage.setItem(
        'apex.commandBoard.layout.v2',
        JSON.stringify({ version: 2, workspaces: {} }),
      );
    } catch {
      /* ignore */
    }
  });
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 120000 });
  await waitShell(page);
  await page.locator(`.left-rail button[aria-label="Open ${navLabel}"]`).first().click();
  await page.waitForTimeout(500);
  await closeAllDock(page);
  await waitLoaded(page);
}

async function measureEmptyState(page: Page) {
  return page.evaluate(() => {
    const header = document.querySelector('.apex-page-header') as HTMLElement | null;
    const metrics = [...document.querySelectorAll('.apex-metric-card')].map((el) =>
      Math.round(el.getBoundingClientRect().height),
    );
    const empty = document.querySelector('.apex-empty-state') as HTMLElement | null;
    const region = document.querySelector('.apex-workspace-table-region') as HTMLElement | null;
    const dock = document.querySelector('.apex-dock-host:not(.apex-dock-host--empty)') as HTMLElement | null;
    return {
      headerH: header?.offsetHeight ?? 0,
      metricHeights: metrics,
      emptyW: empty ? Math.round(empty.getBoundingClientRect().width) : 0,
      emptyPresent: !!empty,
      regionH: region?.offsetHeight ?? 0,
      dockW: dock ? Math.round(dock.getBoundingClientRect().width) : 0,
      overflowX: document.documentElement.scrollWidth > window.innerWidth + 2,
      runScanVisible: !!document.querySelector('button[aria-label="Run scan"]'),
      editRulesVisible: !!document.querySelector('.apex-empty-state__action--secondary'),
      openQueueVisible: [...document.querySelectorAll('.apex-empty-state__action--primary')].some((el) =>
        /queue/i.test(el.textContent ?? ''),
      ),
    };
  });
}

const report: Record<string, unknown>[] = [];
const consoleErrors: string[] = [];
const appErrors: string[] = [];

const { baseUrl, stop } = await startCaptureServer(PORT);

try {
  let channel = 'chrome';
  let browser;
  try {
    browser = await chromium.launch({ channel: 'chrome', headless: false, args: ['--force-device-scale-factor=1'] });
  } catch {
    channel = 'msedge';
    browser = await chromium.launch({ channel: 'msedge', headless: false, args: ['--force-device-scale-factor=1'] });
  }

  const context = await browser.newContext({ viewport: { width: 1672, height: 941 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      const t = msg.text();
      consoleErrors.push(t);
      if (classifyConsoleError(t) === 'application') appErrors.push(t);
    }
  });
  page.on('pageerror', (err) => {
    consoleErrors.push(String(err));
    appErrors.push(String(err));
  });

  for (const vp of VIEWPORTS) {
    await page.setViewportSize({ width: vp.w, height: vp.h });

    for (const spec of [
      { name: 'queue-empty', query: 'queue=empty', nav: 'Queue', emptyTitle: 'Queue is empty' },
      { name: 'tracking-empty', query: 'tracking=empty', nav: 'Tracking', emptyTitle: 'No tracked theses' },
    ] as const) {
      await preparePage(page, baseUrl, spec.query, spec.nav);
      await page.waitForSelector(`.desktop-workspace .apex-empty-state__title:has-text("${spec.emptyTitle}")`, {
        state: 'visible',
        timeout: 15000,
      });
      const metrics = await measureEmptyState(page);
      const file = resolve(outDir, `${spec.name}-${vp.w}x${vp.h}.png`);
      await page.screenshot({ path: file, fullPage: false });
      const png = readPngSize(file);
      const row = {
        name: `${spec.name}-${vp.w}x${vp.h}`,
        channel,
        fixture: spec.query,
        png,
        pngValid: png.width === vp.w && png.height === vp.h,
        metrics,
        file,
        accepted:
          metrics.emptyPresent &&
          metrics.dockW === 0 &&
          !metrics.overflowX &&
          metrics.runScanVisible &&
          png.width === vp.w &&
          png.height === vp.h,
      };
      report.push(row);
      console.log(
        `[empty-capture] ${row.name} png=${png.width}x${png.height} emptyW=${metrics.emptyW} dock=${metrics.dockW}`,
      );
    }
  }

  await browser.close();
} finally {
  stop();
}

const reportPath = resolve(dirname(outDir), 'reports', 'empty_states_report.json');
mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(
  reportPath,
  JSON.stringify(
    {
      channel: 'chrome',
      headed: true,
      outDir,
      consoleErrors,
      applicationErrors: appErrors,
      captures: report,
    },
    null,
    2,
  ),
);

if (appErrors.length) {
  console.error('Application console errors detected:', appErrors.slice(0, 5));
  process.exit(1);
}

console.log(`Empty-state captures: ${outDir}`);
console.log(`Report: ${reportPath}`);
runQaCleanup({ dryRun: false });
