/**
 * Step 1 — Chrome verification for Queue, Tracking, Command, split Dock @ 1672×941.
 * Uses external Google Chrome. Writes PNGs + geometry report; exits non-zero on failures.
 */
import { chromium, type Page } from 'playwright';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, type ChildProcess } from 'node:child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19).replace('T', '_');
const out = resolve(root, '_qa', `step1_verify_${stamp}`);
const shots = resolve(out, 'screenshots');
const PORT = Number(process.env.APEX_VERIFY_PORT || 46244);
const BASE = `http://127.0.0.1:${PORT}`;
const VW = 1368;
const VH = 753;

mkdirSync(shots, { recursive: true });

interface Failures {
  failures: string[];
  observations: Record<string, unknown>[];
}

const state: Failures = { failures: [], observations: [] };

function fail(msg: string) {
  state.failures.push(msg);
  console.error(`[FAIL] ${msg}`);
}

async function waitShell(page: Page) {
  await page.waitForSelector('.left-rail, .apex-command-rail, .desktop-workspace', { timeout: 60000 });
  await page.waitForTimeout(700);
}

async function navLeft(page: Page, label: string) {
  const btn = page.locator(`.left-rail button[aria-label="Open ${label}"]`).first();
  if ((await btn.count()) > 0) await btn.click();
  else await page.locator(`.left-rail button[aria-label*="${label}" i]`).first().click().catch(() => undefined);
  await page.waitForTimeout(500);
}

async function closeAllDockTools(page: Page) {
  for (const label of ['Watchlist', 'Ticket', 'Intel', 'Memory', 'Positions', 'Signals']) {
    const active = page.locator(`.apex-command-rail button[aria-label*="${label}" i].is-active, .apex-command-rail button[aria-label*="${label}" i][aria-pressed="true"]`);
    const n = await active.count();
    for (let i = 0; i < n; i++) await active.first().click().catch(() => undefined);
  }
  await page.waitForTimeout(350);
}

async function toggleTool(page: Page, label: string) {
  const btn = page.locator(`.apex-command-rail button[aria-label*="${label}" i]`).first();
  if ((await btn.count()) > 0) await btn.click().catch(() => undefined);
  await page.waitForTimeout(450);
}

async function setDockWidth(page: Page, width: number) {
  await page.evaluate(`(() => {
    try {
      const raw = localStorage.getItem('apex.commandBoard.layout.v2');
      const doc = raw ? JSON.parse(raw) : { version: 2, workspaces: {} };
      for (const k of Object.keys(doc.workspaces || {})) {
        doc.workspaces[k].dockWidth = ${width};
      }
      if (!doc.workspaces) doc.workspaces = {};
      for (const ws of ['overview','signals','tracking','desk','watchlist','backtest','operations','memory']) {
        if (!doc.workspaces[ws]) doc.workspaces[ws] = { primaryTool: null, secondaryTool: null, dockMode: 'single', dockWidth: ${width}, openTabs: [], pinnedTools: [], splitRatio: 0.6, floatingTool: null, floatingRect: null };
        else doc.workspaces[ws].dockWidth = ${width};
      }
      localStorage.setItem('apex.commandBoard.layout.v2', JSON.stringify(doc));
    } catch (e) {}
  })()`);
  await page.reload({ waitUntil: 'networkidle' });
  await waitShell(page);
}

async function measureWorkspace(page: Page) {
  return page.evaluate(`(() => {
    const root = document.querySelector('.desktop-workspace .apex-workspace-page') || document.querySelector('.apex-workspace-page');
    if (!root) return { error: 'no workspace root' };
    const q = (sel) => {
      const el = root.querySelector(sel);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return {
        w: Math.round(r.width), h: Math.round(r.height),
        padL: parseFloat(cs.paddingLeft), padT: parseFloat(cs.paddingTop),
      };
    };
    const metricCards = [...root.querySelectorAll('.apex-workspace-page__metrics .apex-metric-card, .apex-metric-card')].filter((el) => el.getBoundingClientRect().height > 0).map((el) => Math.round(el.getBoundingClientRect().height));
    const row = root.querySelector('.apex-data-table__row td');
    const dockEmpty = document.querySelector('.desktop-workspace .apex-dock-host--empty, .apex-dock-host--empty');
    const dock = document.querySelector('.desktop-workspace .apex-dock-host:not(.apex-dock-host--empty), .apex-dock-host:not(.apex-dock-host--empty)');
    const splitPanes = [...document.querySelectorAll('.apex-dock-split__pane')].map((el) => Math.round(el.getBoundingClientRect().height));
    const tabs = [...document.querySelectorAll('.apex-compact-ticket__tab')].filter((el) => el.getBoundingClientRect().width > 0).map((el) => {
      const r = el.getBoundingClientRect();
      return { x: r.x, w: r.width, text: el.textContent?.trim() };
    });
    let tabOverlap = false;
    for (let i = 0; i < tabs.length - 1; i++) {
      if (tabs[i].x + tabs[i].w > tabs[i + 1].x + 1) tabOverlap = true;
    }
    const emptyInRegion = !!root.querySelector('.apex-workspace-table-region .apex-empty-state');
    const header = root.querySelector('.apex-page-header');
    const canvas = document.querySelector('.desktop-workspace main.apex-shell__canvas, main.apex-shell__canvas');
    return {
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight,
      dpr: window.devicePixelRatio,
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      overflowX: document.documentElement.scrollWidth > window.innerWidth + 2,
      workspace: { w: Math.round(root.getBoundingClientRect().width), h: Math.round(root.getBoundingClientRect().height), padL: parseFloat(getComputedStyle(root).paddingLeft) },
      headerH: header ? Math.round(header.getBoundingClientRect().height) : 0,
      pagePad: parseFloat(getComputedStyle(root).paddingLeft),
      metricHeights: metricCards,
      metricUniform: metricCards.length > 1 ? Math.max(...metricCards) - Math.min(...metricCards) <= 4 : true,
      tableRowH: row ? Math.round(row.getBoundingClientRect().height) : 0,
      dockW: dock && dock.getBoundingClientRect().width > 0 ? Math.round(dock.getBoundingClientRect().width) : 0,
      dockClosed: !dock || dock.getBoundingClientRect().width <= 1,
      canvasW: canvas ? Math.round(canvas.getBoundingClientRect().width) : 0,
      splitPaneHeights: splitPanes.filter((h) => h > 0),
      tabOverlap,
      emptyInRegion,
      selectedRow: !!root.querySelector('.apex-data-table__row.is-selected'),
    };
  })()`);
}

async function capture(page: Page, name: string, checks?: (m: Record<string, unknown>) => void) {
  const m = (await measureWorkspace(page)) as Record<string, unknown>;
  const file = resolve(shots, `${name}.png`);
  await page.screenshot({ path: file, fullPage: false });
  const png = readFileSync(file);
  const pngW = png.readUInt32BE(16);
  const pngH = png.readUInt32BE(20);
  const obs = { name, file, png: { w: pngW, h: pngH }, ...m };
  state.observations.push(obs);
  console.log(`[capture] ${name} dock=${m.dockW} overflow=${m.overflowX} row=${m.tableRowH}`);
  if (pngW !== VW || pngH !== VH) fail(`${name}: PNG ${pngW}x${pngH} expected ${VW}x${VH}`);
  if (m.overflowX) fail(`${name}: horizontal document overflow`);
  checks?.(m);
}

async function main() {
  let server: ChildProcess | null = spawn('npx', ['tsx', 'server.ts'], {
    cwd: root,
    env: { ...process.env, PORT: String(PORT) },
    shell: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  for (let i = 0; i < 40; i++) {
    try {
      const res = await fetch(BASE);
      if (res.ok) break;
    } catch { /* wait */ }
    await new Promise((r) => setTimeout(r, 500));
  }

  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--force-device-scale-factor=1'] });
  const page = await browser.newPage({ viewport: { width: VW, height: VH }, deviceScaleFactor: 1 });
  await page.goto(BASE, { waitUntil: 'networkidle', timeout: 120000 });
  await waitShell(page);

  // ── Command ──
  await navLeft(page, 'Command');
  await closeAllDockTools(page);
  await capture(page, 'command-dock-closed', (m) => {
    if ((m.dockW as number) > 2) fail('command-dock-closed: dock should be 0px');
    if ((m.canvasW as number) < 900) fail(`command-dock-closed: canvas ${m.canvasW}px < 900`);
  });

  await toggleTool(page, 'Watchlist');
  await capture(page, 'command-watchlist-docked', (m) => {
    const dw = m.dockW as number;
    if (dw < 300 || dw > 400) fail(`command-watchlist: dock ${dw}px not in 300–400`);
  });

  await toggleTool(page, 'Ticket');
  await capture(page, 'command-ticket-docked');

  // ── Queue ──
  await navLeft(page, 'Queue');
  await closeAllDockTools(page);
  await page.waitForSelector('.desktop-workspace [data-workspace="signals"].apex-workspace-page', { state: 'visible', timeout: 20000 });
  await capture(page, 'queue-dock-closed', (m) => {
    if ((m.pagePad as number) !== 16) fail(`queue: page padding ${m.pagePad}px expected 16`);
    if (!(m.metricUniform as boolean) && (m.metricHeights as number[])?.length > 1) {
      fail(`queue: metric card heights differ ${JSON.stringify(m.metricHeights)}`);
    }
    if ((m.headerH as number) < 60 || (m.headerH as number) > 100) fail(`queue: header ${m.headerH}px out of range`);
  });

  const row = page.locator('.desktop-workspace .apex-data-table__row').first();
  if ((await row.count()) > 0) {
    await row.click();
    await page.waitForTimeout(400);
    await toggleTool(page, 'Ticket');
    await capture(page, 'queue-populated-ticket', (m) => {
      if ((m.tableRowH as number) > 0 && Math.abs((m.tableRowH as number) - 44) > 4) {
        fail(`queue: row height ${m.tableRowH}px expected ~44`);
      }
    });
  } else {
    await capture(page, 'queue-empty', (m) => {
      if (!(m.emptyInRegion as boolean)) fail('queue-empty: EmptyState not inside table region');
    });
  }

  // ── Tracking ──
  await navLeft(page, 'Tracking');
  await closeAllDockTools(page);
  await page.waitForSelector('.desktop-workspace [data-workspace="tracking"].apex-workspace-page', { state: 'visible', timeout: 20000 });
  const tRow = page.locator('.desktop-workspace .apex-data-table__row').first();
  if ((await tRow.count()) > 0) {
    await tRow.click();
    await page.waitForTimeout(400);
    await capture(page, 'tracking-row-selected', (m) => {
      if (!(m.selectedRow as boolean)) fail('tracking: selected row not visible');
    });
    await toggleTool(page, 'Positions');
    await toggleTool(page, 'Ticket');
    await capture(page, 'tracking-split-default', (m) => {
      const panes = m.splitPaneHeights as number[];
      if (panes.some((h) => h > 0 && h < 220)) fail(`tracking-split: pane height < 220px ${JSON.stringify(panes)}`);
      if (m.tabOverlap) fail('tracking-split: compact ticket tabs overlap');
    });
  } else {
    await capture(page, 'tracking-empty', (m) => {
      if (!(m.emptyInRegion as boolean)) fail('tracking-empty: EmptyState not in table region');
    });
  }

  // ── Split dock widths ──
  for (const dw of [300, 336, 400]) {
    await setDockWidth(page, dw);
    await navLeft(page, 'Tracking');
    await closeAllDockTools(page);
    const tr = page.locator('.desktop-workspace .apex-data-table__row').first();
    if ((await tr.count()) > 0) {
      await tr.click();
      await toggleTool(page, 'Positions');
      await toggleTool(page, 'Ticket');
      await capture(page, `tracking-split-dock-${dw}`, (m) => {
        const w = m.dockW as number;
        if (Math.abs(w - dw) > 8) fail(`dock-${dw}: measured ${w}px`);
        if (m.tabOverlap) fail(`dock-${dw}: tab overlap`);
      });
    }
  }

  await browser.close();
  if (server) server.kill();

  mkdirSync(resolve(out, 'reports'), { recursive: true });
  writeFileSync(resolve(out, 'reports', 'step1_report.json'), JSON.stringify(state, null, 2));
  console.log(`\nReport: ${out}/reports/step1_report.json`);
  console.log(`Failures: ${state.failures.length}`);
  if (state.failures.length) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
