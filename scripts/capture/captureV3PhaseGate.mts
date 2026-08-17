/**
 * External Chrome (or Edge) headed capture for V3 desktop UX acceptance.
 * Primary viewport: 1672×941 @ DPR 1. Verifies PNG dimensions.
 */
import { chromium, type Page } from 'playwright';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, type ChildProcess } from 'node:child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19).replace('T', '_');
const out = resolve(root, '_qa', `v3_phase_gate_${stamp}`);
const shots = resolve(out, 'screenshots');
const PORT = Number(process.env.APEX_UX_CAPTURE_PORT || 46222);
const BASE = `http://127.0.0.1:${PORT}`;
const VW = 1368;
const VH = 753;

const PAGES = [
  { key: 'overview', label: 'Command', hash: 'overview' },
  { key: 'desk', label: 'Desk', hash: 'desk' },
  { key: 'signals', label: 'Queue', hash: 'signals' },
  { key: 'tracking', label: 'Tracking', hash: 'tracking' },
  { key: 'watchlist', label: 'Markets', hash: 'watchlist' },
  { key: 'backtest', label: 'Lab', hash: 'backtest' },
  { key: 'operations', label: 'Ops', hash: 'operations' },
  { key: 'intel', label: 'Intel', hash: 'intel' },
  { key: 'decisions', label: 'Memory', hash: 'decisions' },
  { key: 'settings', label: 'Settings', hash: 'settings' },
] as const;

mkdirSync(shots, { recursive: true });

function readPngSize(path: string): { width: number; height: number } {
  const buf = readFileSync(path);
  // PNG IHDR: bytes 16-23 big-endian width/height
  if (buf[0] !== 0x89 || buf.toString('ascii', 1, 4) !== 'PNG') {
    throw new Error(`Not a PNG: ${path}`);
  }
  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  return { width, height };
}

async function waitShell(page: Page) {
  await page.waitForSelector('.left-rail, .apex-command-rail, .desktop-workspace', { timeout: 60000 });
  await page.waitForTimeout(1200);
}

async function measure(page: Page): Promise<{
  innerWidth: number;
  innerHeight: number;
  dpr: number;
  vvW: number | null;
  vvH: number | null;
  leftRail: { w: number; h: number; x: number; y: number } | null;
  commandRail: { w: number; h: number; x: number; y: number } | null;
  dock: { w: number; h: number; x: number; y: number } | null;
  canvas: { w: number; h: number; x: number; y: number } | null;
  backdropOpen: boolean;
  insightOpen: boolean;
  scrollWidth: number;
  clientWidth: number;
}> {
  return page.evaluate(`(() => {
    const q = (sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { w: Math.round(r.width), h: Math.round(r.height), x: Math.round(r.x), y: Math.round(r.y) };
    };
    return {
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight,
      dpr: window.devicePixelRatio,
      vvW: window.visualViewport ? window.visualViewport.width : null,
      vvH: window.visualViewport ? window.visualViewport.height : null,
      leftRail: q('.left-rail'),
      commandRail: q('.apex-command-rail'),
      dock: q('.apex-dock-host:not(.apex-dock-host--empty)'),
      canvas: q('main.apex-shell__canvas, main'),
      backdropOpen: !!document.querySelector('.insight-panel__backdrop.is-open'),
      insightOpen: !!document.querySelector('.insight-panel.is-open'),
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    };
  })()`) as Promise<{
    innerWidth: number;
    innerHeight: number;
    dpr: number;
    vvW: number | null;
    vvH: number | null;
    leftRail: { w: number; h: number; x: number; y: number } | null;
    commandRail: { w: number; h: number; x: number; y: number } | null;
    dock: { w: number; h: number; x: number; y: number } | null;
    canvas: { w: number; h: number; x: number; y: number } | null;
    backdropOpen: boolean;
    insightOpen: boolean;
    scrollWidth: number;
    clientWidth: number;
  }>;
}

async function main() {
  let server: ChildProcess | null = null;
  const env = { ...process.env, PORT: String(PORT), APEX_PORT: String(PORT) };
  server = spawn('npx', ['tsx', 'server.ts'], {
    cwd: root,
    env,
    shell: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let ready = false;
  server.stdout?.on('data', (d) => {
    const s = String(d);
    if (/listening|Local:|ready|http/i.test(s)) ready = true;
    process.stdout.write(`[server] ${s}`);
  });
  server.stderr?.on('data', (d) => process.stderr.write(`[server:err] ${d}`));

  for (let i = 0; i < 60 && !ready; i++) {
    await new Promise((r) => setTimeout(r, 500));
    try {
      const res = await fetch(BASE);
      if (res.ok || res.status === 404) {
        ready = true;
        break;
      }
    } catch {
      /* wait */
    }
  }
  if (!ready) {
    // soft-ready: try navigate anyway after 8s
    await new Promise((r) => setTimeout(r, 8000));
  }

  let browser;
  let channel = 'chrome';
  try {
    browser = await chromium.launch({
      channel: 'chrome',
      headless: false,
      args: ['--force-device-scale-factor=1'],
    });
  } catch {
    channel = 'msedge';
    browser = await chromium.launch({
      channel: 'msedge',
      headless: false,
      args: ['--force-device-scale-factor=1'],
    });
  }

  const context = await browser.newContext({
    viewport: { width: VW, height: VH },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();

  // Clear storage for clean-profile boot
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.evaluate(`(() => { try { localStorage.clear(); } catch (e) {} })()`);
  await page.reload({ waitUntil: 'networkidle', timeout: 120000 });
  await waitShell(page);

  const report: Record<string, unknown>[] = [];
  const consoleErrors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => consoleErrors.push(String(err)));

  for (const p of PAGES) {
    consoleErrors.length = 0;
    await page.evaluate(`(hash => { window.location.hash = '#/' + hash; })(${JSON.stringify(p.hash)})`);
    await page.waitForTimeout(800);
    // Click left rail when possible for real UI nav
    const railBtn = page.locator(`.left-rail button[aria-label*="${p.label}" i]`).first();
    if ((await railBtn.count()) > 0 && p.key !== 'settings' && p.key !== 'intel' && p.key !== 'decisions') {
      await railBtn.click().catch(() => undefined);
      await page.waitForTimeout(600);
    }
    if (p.key === 'settings') {
      const settingsBtn = page.locator('.left-rail button[aria-label*="Settings" i]').first();
      if ((await settingsBtn.count()) > 0) await settingsBtn.click().catch(() => undefined);
      await page.waitForTimeout(600);
    }
    await waitShell(page);
    // Wait out LOADING WORKSPACE
    for (let i = 0; i < 20; i++) {
      const loading = await page.locator('text=LOADING WORKSPACE').count();
      if (!loading) break;
      await page.waitForTimeout(400);
    }

    const metrics = await measure(page);
    const file = resolve(shots, `desktop-${p.key}-after-${VW}x${VH}.png`);
    await page.screenshot({ path: file, fullPage: false });
    const png = readPngSize(file);
    report.push({
      workspace: p.label,
      key: p.key,
      metrics,
      png,
      pngValid: png.width === VW && png.height === VH,
      viewportOk:
        metrics.innerWidth === VW && metrics.innerHeight === VH && metrics.dpr === 1,
      blockingBackdrop: metrics.backdropOpen,
      layer2Open: metrics.insightOpen,
      consoleErrors: [...consoleErrors],
      file,
    });
    console.log(
      `[capture] ${p.key} png=${png.width}x${png.height} backdrop=${metrics.backdropOpen} insightOpen=${metrics.insightOpen} errors=${consoleErrors.length}`,
    );
  }

  // Secondary viewports for overview
  for (const vp of [
    { w: 1440, h: 900 },
    { w: 1920, h: 1080 },
  ]) {
    await page.setViewportSize({ width: vp.w, height: vp.h });
    await page.evaluate(`(() => { window.location.hash = '#/overview'; })()`);
    await waitShell(page);
    const file = resolve(shots, `desktop-overview-after-${vp.w}x${vp.h}.png`);
    await page.screenshot({ path: file, fullPage: false });
  }

  mkdirSync(resolve(out, 'reports'), { recursive: true });
  writeFileSync(
    resolve(out, 'reports', 'phase_gate_report.json'),
    JSON.stringify({ channel, headed: true, stamp, primary: `${VW}x${VH}`, pages: report }, null, 2),
  );

  // markdown summary
  const md = [
    `# V3 Phase gate capture — ${stamp}`,
    '',
    `- Browser channel: **${channel}** (headed)`,
    `- Primary viewport: **${VW}×${VH}** DPR 1`,
    '',
    '| Workspace | PNG | Viewport OK | Backdrop | Layer2 open | Console errors |',
    '|---|---|---|---|---|---|',
    ...report.map((r: any) => {
      return `| ${r.workspace} | ${r.png.width}×${r.png.height} ${r.pngValid ? '✓' : '✗'} | ${r.viewportOk ? '✓' : '✗'} | ${r.blockingBackdrop ? 'FAIL' : 'ok'} | ${r.layer2Open ? 'open' : 'closed'} | ${r.consoleErrors.length} |`;
    }),
    '',
  ].join('\n');
  writeFileSync(resolve(out, 'reports', 'phase_gate_report.md'), md);

  await browser.close();
  try {
    server?.kill('SIGTERM');
  } catch {
    /* ignore */
  }
  console.log(`Wrote ${out}`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
