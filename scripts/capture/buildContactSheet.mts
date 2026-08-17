/**
 * Build contact sheets from final acceptance captures.
 * Usage: tsx scripts/buildContactSheet.mts <screenshots-dir>
 */
import { chromium } from 'playwright';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const shotsDir = process.argv[2];
if (!shotsDir) {
  console.error('Usage: tsx scripts/buildContactSheet.mts <screenshots-dir>');
  process.exit(1);
}

const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19).replace('T', '_');
const outDir = resolve(root, '_qa', stamp, 'visual-unification');
mkdirSync(outDir, { recursive: true });

type SheetSpec = {
  file: string;
  tiles: string[];
  labels: string[];
  cols: number;
  thumbW: number;
  thumbH: number;
};

function buildSheetHtml(spec: SheetSpec, dir: string): string {
  const rows = Math.ceil(spec.tiles.length / spec.cols);
  const pad = 8;
  const labelH = 22;
  const canvasW = spec.cols * spec.thumbW + (spec.cols + 1) * pad;
  const canvasH = rows * (spec.thumbH + labelH) + (rows + 1) * pad;
  const cells = spec.tiles
    .map((file, i) => {
      const abs = resolve(dir, file);
      if (!existsSync(abs)) {
        return `<div class="cell"><div class="missing">MISSING: ${file}</div><span>${spec.labels[i] ?? file}</span></div>`;
      }
      const b64 = readFileSync(abs).toString('base64');
      return `<div class="cell"><img src="data:image/png;base64,${b64}" alt="${spec.labels[i] ?? file}"/><span>${spec.labels[i] ?? file}</span></div>`;
    })
    .join('');
  return `<!DOCTYPE html><html><head><style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: #0B0E14; font-family: Inter, sans-serif; width: ${canvasW}px; height: ${canvasH}px; padding: ${pad}px; }
  .grid { display: grid; grid-template-columns: repeat(${spec.cols}, ${spec.thumbW}px); gap: ${pad}px; }
  .cell { display: flex; flex-direction: column; gap: 4px; }
  .cell img { width: ${spec.thumbW}px; height: ${spec.thumbH}px; object-fit: cover; object-position: top left; border: 1px solid rgba(180,195,208,0.12); border-radius: 6px; }
  .missing { width: ${spec.thumbW}px; height: ${spec.thumbH}px; display:flex;align-items:center;justify-content:center;background:#1a1d24;color:#f87171;font-size:10px;border:1px dashed #f87171;border-radius:6px;padding:8px;text-align:center; }
  .cell span { font-size: 11px; color: #8A8E95; text-transform: uppercase; letter-spacing: 0.08em; }
</style></head><body><div class="grid">${cells}</div></body></html>`;
}

async function renderSheet(spec: SheetSpec, dir: string, outPath: string) {
  const html = buildSheetHtml(spec, dir);
  const htmlPath = resolve(outDir, `${spec.file.replace('.png', '')}.html`);
  writeFileSync(htmlPath, html);
  const rows = Math.ceil(spec.tiles.length / spec.cols);
  const pad = 8;
  const labelH = 22;
  const canvasW = spec.cols * spec.thumbW + (spec.cols + 1) * pad;
  const canvasH = rows * (spec.thumbH + labelH) + (rows + 1) * pad;
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: canvasW, height: canvasH } });
  await page.goto(`file:///${htmlPath.replace(/\\/g, '/')}`);
  await page.screenshot({ path: outPath, fullPage: true });
  await browser.close();
  const buf = readFileSync(outPath);
  console.log(`Contact sheet: ${outPath} (${buf.readUInt32BE(16)}×${buf.readUInt32BE(20)})`);
}

const primary1672: SheetSpec = {
  file: 'contact-sheet-1672x941.png',
  cols: 4,
  thumbW: 418,
  thumbH: 235,
  tiles: [
    'command-dock-closed-1672x941.png',
    'command-watchlist-docked-1672x941.png',
    'command-ticket-docked-1672x941.png',
    'queue-populated-1672x941.png',
    'queue-empty-1672x941.png',
    'queue-ticket-1672x941.png',
    'tracking-populated-1672x941.png',
    'tracking-empty-1672x941.png',
    'tracking-positions-1672x941.png',
    'tracking-ticket-1672x941.png',
    'tracking-split-60-40-1672x941.png',
    'tracking-split-50-50-1672x941.png',
    'markets-dock-closed-1672x941.png',
    'markets-watchlist-1672x941.png',
    'desk-dock-closed-1672x941.png',
    'desk-positions-1672x941.png',
    'desk-ticket-1672x941.png',
    'desk-split-60-40-1672x941.png',
    'desk-split-50-50-1672x941.png',
    'lab-dock-closed-1672x941.png',
    'lab-memory-docked-1672x941.png',
    'ops-1672x941.png',
    'intel-expanded-1672x941.png',
    'intel-dock-1672x941.png',
    'memory-active-1672x941.png',
    'memory-archive-1672x941.png',
    'settings-modal-1672x941.png',
  ],
  labels: [
    'Command · closed', 'Command · Watchlist', 'Command · Ticket', 'Queue · populated',
    'Queue · empty', 'Queue · Ticket', 'Tracking · populated', 'Tracking · empty',
    'Tracking · Positions', 'Tracking · Ticket',
    'Tracking · 60/40', 'Tracking · 50/50', 'Markets · closed', 'Markets · Watchlist',
    'Desk · closed', 'Desk · Positions', 'Desk · Ticket', 'Desk · 60/40', 'Desk · 50/50',
    'Lab · closed', 'Lab · Memory', 'Ops', 'Intel · expanded', 'Intel · Dock',
    'Memory · Active', 'Memory · Archive', 'Settings',
  ],
};

const primary1440: SheetSpec = {
  file: 'contact-sheet-1440x900.png',
  cols: 4,
  thumbW: 360,
  thumbH: 225,
  tiles: [
    'command-closed-1440x900.png', 'command-watchlist-1440x900.png', 'command-ticket-1440x900.png',
    'queue-1440x900.png', 'queue-empty-1440x900.png', 'tracking-1440x900.png', 'tracking-empty-1440x900.png',
    'markets-1440x900.png', 'desk-1440x900.png',
    'lab-1440x900.png', 'ops-1440x900.png', 'intel-1440x900.png', 'memory-1440x900.png', 'settings-1440x900.png',
  ],
  labels: [
    'Command', 'Command · Watchlist', 'Command · Ticket', 'Queue', 'Queue · empty', 'Tracking', 'Tracking · empty',
    'Markets', 'Desk', 'Lab', 'Ops', 'Intel', 'Memory', 'Settings',
  ],
};

const primary1920: SheetSpec = {
  ...primary1440,
  file: 'contact-sheet-1920x1080.png',
  thumbW: 480,
  thumbH: 270,
  tiles: primary1440.tiles.map((t) => t.replace('1440x900', '1920x1080')),
};

const grouped: SheetSpec[] = [
  {
    file: 'command-desk.png',
    cols: 3,
    thumbW: 520,
    thumbH: 293,
    tiles: ['command-dock-closed-1672x941.png', 'command-watchlist-docked-1672x941.png', 'desk-split-60-40-1672x941.png'],
    labels: ['Command · closed', 'Command · Watchlist', 'Desk · split'],
  },
  {
    file: 'queue-tracking-markets.png',
    cols: 3,
    thumbW: 520,
    thumbH: 293,
    tiles: [
      'queue-populated-1672x941.png',
      'queue-empty-1672x941.png',
      'tracking-populated-1672x941.png',
      'tracking-empty-1672x941.png',
      'tracking-split-60-40-1672x941.png',
      'markets-watchlist-1672x941.png',
    ],
    labels: ['Queue · populated', 'Queue · empty', 'Tracking · populated', 'Tracking · empty', 'Tracking · split', 'Markets · Watchlist'],
  },
  {
    file: 'lab-ops-intel-memory.png',
    cols: 2,
    thumbW: 520,
    thumbH: 293,
    tiles: ['lab-memory-docked-1672x941.png', 'ops-1672x941.png', 'intel-expanded-1672x941.png', 'memory-active-1672x941.png'],
    labels: ['Lab · Memory', 'Ops', 'Intel · expanded', 'Memory · Active'],
  },
  {
    file: 'dock-states.png',
    cols: 3,
    thumbW: 520,
    thumbH: 293,
    tiles: [
      'tracking-positions-1672x941.png', 'tracking-ticket-1672x941.png', 'tracking-split-50-50-1672x941.png',
      'desk-positions-1672x941.png', 'intel-dock-1672x941.png', 'lab-memory-docked-1672x941.png',
    ],
    labels: ['Tracking · Positions', 'Tracking · Ticket', 'Tracking · 50/50', 'Desk · Positions', 'Intel · Dock', 'Lab · Memory'],
  },
  {
    file: 'settings.png',
    cols: 1,
    thumbW: 820,
    thumbH: 462,
    tiles: ['settings-modal-1672x941.png'],
    labels: ['Settings modal'],
  },
];

for (const spec of [primary1672, primary1440, primary1920, ...grouped]) {
  await renderSheet(spec, shotsDir, resolve(outDir, spec.file));
}

writeFileSync(resolve(outDir, 'contact-sheet-manifest.json'), JSON.stringify({ shotsDir, outDir, generated: new Date().toISOString() }, null, 2));
console.log(`Manifest: ${resolve(outDir, 'contact-sheet-manifest.json')}`);
