import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';

const root = resolve(process.cwd());
const outDir = resolve(root, '_qa/diag');
mkdirSync(outDir, { recursive: true });
const PORT = 45124;
const BASE_URL = `http://127.0.0.1:${PORT}`;

async function waitForServer(timeoutMs = 30000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const r = await fetch(`${BASE_URL}/`);
      if (r.ok || r.status === 404) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('server not ready');
}

async function main() {
  let server: ChildProcess | null = null;
  const consoleLogs: string[] = [];
  const pageErrors: string[] = [];
  try {
    server = spawn(process.execPath, ['--import', 'tsx', 'server.ts'], {
      cwd: root,
      env: {
        ...process.env,
        NODE_ENV: 'development',
        APEX_SERVE_DIST: '0',
        PORT: String(PORT),
        APEX_DECISION_MEMORY_MIRROR: 'false',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    server.stdout?.on('data', (d) => consoleLogs.push(`[server-stdout] ${d}`));
    server.stderr?.on('data', (d) => consoleLogs.push(`[server-stderr] ${d}`));
    await waitForServer();
    const browser = await chromium.launch({ headless: true, channel: 'msedge' });
    const page = await browser.newPage({ viewport: { width: 1368, height: 753 } });
    page.on('console', (msg) => consoleLogs.push(`[console:${msg.type()}] ${msg.text()}`));
    page.on('pageerror', (err) => pageErrors.push(String(err?.stack || err)));
    await page.goto(`${BASE_URL}/#overview`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(6000);
    await page.screenshot({ path: resolve(outDir, 'diag-dev.jpg'), type: 'jpeg', quality: 85, fullPage: false });
    const bodyText = await page.evaluate(() => document.body.innerText.slice(0, 3000));
    const bodyHTML = await page.evaluate(() => document.body.innerHTML.slice(0, 2000));
    writeFileSync(
      resolve(outDir, 'diag-dev.json'),
      JSON.stringify({ consoleLogs, pageErrors, bodyText, bodyHTML }, null, 2)
    );
    await browser.close();
    console.log('OK, wrote diag-dev.json and diag-dev.jpg');
  } finally {
    if (server?.pid) {
      if (process.platform === 'win32') spawnSync('taskkill.exe', ['/PID', String(server.pid), '/T', '/F'], { stdio: 'ignore' });
      else server.kill('SIGTERM');
    }
  }
}
void main();
