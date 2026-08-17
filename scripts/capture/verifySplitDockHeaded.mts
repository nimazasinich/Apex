/**
 * Split-Dock verification with QA fixtures — uses headed external Chrome.
 * Enable fixtures via ?qa=visual (session-only, no localStorage watchlist persist).
 */
import { chromium, type Page } from 'playwright';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startCaptureServer } from '../lib/captureServer.mts';
import { runQaCleanup } from '../qa/cleanupQaArtifacts.mts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19).replace('T', '_');
const out = resolve(root, '_qa', `split_dock_headed_${stamp}`);
const shots = resolve(out, 'screenshots');
const PORT = Number(process.env.APEX_VERIFY_PORT || 46244);
const VW = 1368;
const VH = 753;

mkdirSync(shots, { recursive: true });

const failures: string[] = [];
const observations: Record<string, unknown>[] = [];

function fail(msg: string) {
  failures.push(msg);
  console.error(`[FAIL] ${msg}`);
}

async function waitShell(page: Page) {
  await page.waitForSelector('.desktop-workspace', { timeout: 60000 });
  await page.waitForTimeout(800);
}

async function navLeft(page: Page, label: string) {
  await page.locator(`.left-rail button[aria-label="Open ${label}"]`).first().click();
  await page.waitForTimeout(500);
}

type DockLayoutInject = {
  workspace: string;
  dockWidth: number;
  primaryTool: string;
  secondaryTool?: string | null;
  dockMode: 'single' | 'split';
  splitRatio?: number;
};

async function injectDockLayout(page: Page, layout: DockLayoutInject) {
  await page.evaluate((o) => {
    const raw = localStorage.getItem('apex.commandBoard.layout.v2');
    const doc = raw ? JSON.parse(raw) : { version: 2, workspaces: {} };
    doc.workspaces = doc.workspaces || {};
    const tabs = o.secondaryTool ? [o.primaryTool, o.secondaryTool] : [o.primaryTool];
    doc.workspaces[o.workspace] = {
      dockWidth: o.dockWidth,
      dockMode: o.dockMode,
      primaryTool: o.primaryTool,
      secondaryTool: o.dockMode === 'split' ? o.secondaryTool ?? null : null,
      openTabs: tabs,
      splitRatio: o.splitRatio ?? 0.6,
      pinnedTools: [],
      floatingTool: null,
      floatingRect: null,
    };
    localStorage.setItem('apex.commandBoard.layout.v2', JSON.stringify(doc));
  }, layout);
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
  await waitShell(page);
}

async function measureDock(page: Page) {
  return page.evaluate(() => {
    const dock = document.querySelector('.desktop-workspace .apex-dock-host:not(.apex-dock-host--empty)') as HTMLElement | null;
    const panes = [...document.querySelectorAll('.desktop-workspace .apex-dock-split__pane')].map((el) => ({
      h: Math.round(el.getBoundingClientRect().height),
      scrollH: el.scrollHeight,
      clientH: el.clientHeight,
    }));
    const tabs = [...document.querySelectorAll('.desktop-workspace .apex-compact-ticket__tab')].filter(
      (el) => el.getBoundingClientRect().width > 0,
    );
    let tabOverlap = false;
    for (let i = 0; i < tabs.length - 1; i++) {
      const a = tabs[i].getBoundingClientRect();
      const b = tabs[i + 1].getBoundingClientRect();
      if (a.x + a.width > b.x + 1) tabOverlap = true;
    }
    const nestedScroll = panes.some((p) => p.scrollH > p.clientH + 4);
    const dockW = dock ? Math.round(dock.getBoundingClientRect().width) : 0;
    const maxDockVw = Math.floor(window.innerWidth * 0.32);
    return {
      dockW,
      panes,
      tabOverlap,
      nestedScroll,
      overflowX: document.documentElement.scrollWidth > window.innerWidth + 2,
      dockWithinVw: dockW === 0 || dockW <= maxDockVw + 2,
      splitActive: panes.length >= 2,
    };
  });
}

async function capture(page: Page, name: string, expectSplit = false) {
  const m = await measureDock(page);
  const file = resolve(shots, `${name}.png`);
  await page.screenshot({ path: file, fullPage: false });
  const png = readFileSync(file);
  const obs = { name, file, png: { w: png.readUInt32BE(16), h: png.readUInt32BE(20) }, ...m };
  observations.push(obs);
  console.log(
    `[capture] ${name} dock=${m.dockW} split=${m.splitActive} panes=${JSON.stringify(m.panes.map((p) => p.h))}`,
  );
  if (m.tabOverlap) fail(`${name}: tab overlap`);
  if (m.nestedScroll) fail(`${name}: nested dock scrollbars`);
  if (m.overflowX) fail(`${name}: horizontal overflow`);
  if (m.dockW > 0 && (m.dockW < 300 || m.dockW > 400)) fail(`${name}: dock width ${m.dockW}px`);
  if (m.dockW > 0 && !m.dockWithinVw) fail(`${name}: dock exceeds 32vw`);
  if (expectSplit && !m.splitActive) fail(`${name}: expected split panes`);
  if (m.panes.some((p) => p.h > 0 && p.h < 220)) fail(`${name}: pane height < 220px`);
  if (m.dockW > 0 && !expectSplit && m.panes.length === 0) {
    // single-mode dock — ensure panel body exists
    const hasBody = await page.locator('.desktop-workspace .apex-dock-host__body').count();
    if (hasBody === 0) fail(`${name}: dock open but no panel body`);
  }
}

async function runMatrix(page: Page, baseUrl: string, workspace: string, navLabel: string, positionsMode: 'populated' | 'empty') {
  const url = positionsMode === 'empty' ? `${baseUrl}&positions=empty` : baseUrl;
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await waitShell(page);
  await navLeft(page, navLabel);

  const row = page.locator('.desktop-workspace .apex-data-table__row').first();
  if ((await row.count()) > 0) await row.click();
  await page.waitForTimeout(400);

  for (const dw of [300, 336, 400]) {
    await injectDockLayout(page, {
      workspace,
      dockWidth: dw,
      primaryTool: 'positions',
      dockMode: 'single',
    });
    await navLeft(page, navLabel);
    await capture(page, `${workspace}-positions-${positionsMode}-${dw}`);

    await injectDockLayout(page, {
      workspace,
      dockWidth: dw,
      primaryTool: 'ticket',
      dockMode: 'single',
    });
    await navLeft(page, navLabel);
    await capture(page, `${workspace}-ticket-${positionsMode}-${dw}`);

    await injectDockLayout(page, {
      workspace,
      dockWidth: dw,
      primaryTool: 'positions',
      secondaryTool: 'ticket',
      dockMode: 'split',
      splitRatio: 0.6,
    });
    await navLeft(page, navLabel);
    await capture(page, `${workspace}-split-60-40-${positionsMode}-${dw}`, true);

    await injectDockLayout(page, {
      workspace,
      dockWidth: dw,
      primaryTool: 'positions',
      secondaryTool: 'ticket',
      dockMode: 'split',
      splitRatio: 0.5,
    });
    await navLeft(page, navLabel);
    await capture(page, `${workspace}-split-50-50-${positionsMode}-${dw}`, true);
  }
}

async function main() {
  const { baseUrl: BASE, stop } = await startCaptureServer(PORT);

  const browser = await chromium.launch({ channel: 'chrome', headless: false, args: ['--force-device-scale-factor=1'] });
  const page = await browser.newPage({ viewport: { width: VW, height: VH }, deviceScaleFactor: 1 });

  await runMatrix(page, BASE, 'tracking', 'Tracking', 'populated');
  await runMatrix(page, BASE, 'tracking', 'Tracking', 'empty');
  await runMatrix(page, BASE, 'desk', 'Desk', 'populated');

  await browser.close();
  stop();

  mkdirSync(resolve(out, 'reports'), { recursive: true });
  writeFileSync(resolve(out, 'reports', 'split_dock_report.json'), JSON.stringify({ failures, observations }, null, 2));
  console.log(`Report: ${out}/reports/split_dock_report.json`);
  if (failures.length) process.exit(1);
  runQaCleanup({ dryRun: false });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
