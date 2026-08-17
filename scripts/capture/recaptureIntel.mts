import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const out = resolve(root, '_qa/v3_final_acceptance_2026-07-30_16-55-34/screenshots');
const PORT = 46247;
const BASE = `http://127.0.0.1:${PORT}?qa=visual`;

const server = spawn('npx', ['tsx', 'server.ts'], {
  cwd: root,
  shell: true,
  env: { ...process.env, PORT: String(PORT) },
  stdio: 'pipe',
});
for (let i = 0; i < 40; i++) {
  try {
    if ((await fetch(BASE)).ok) break;
  } catch {
    /* wait */
  }
  await new Promise((r) => setTimeout(r, 500));
}

const browser = await chromium.launch({ channel: 'chrome', headless: false, args: ['--force-device-scale-factor=1'] });
const page = await browser.newPage({ viewport: { width: 1672, height: 941 }, deviceScaleFactor: 1 });
await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 120000 });
await page.waitForSelector('.desktop-workspace', { timeout: 60000 });
await page.waitForTimeout(900);

await page.evaluate(() => {
  window.location.hash = '#/intel';
});
await page.waitForTimeout(1200);
await page.waitForSelector('.intel-masterpiece', { timeout: 30000 });
await page.screenshot({ path: resolve(out, 'intel-expanded-1672x941.png'), fullPage: false });

for (const vp of [
  { w: 1440, h: 900 },
  { w: 1920, h: 1080 },
]) {
  await page.setViewportSize({ width: vp.w, height: vp.h });
  await page.evaluate(() => {
    window.location.hash = '#/intel';
  });
  await page.waitForTimeout(900);
  await page.screenshot({ path: resolve(out, `intel-${vp.w}x${vp.h}.png`), fullPage: false });
}

await browser.close();
server.kill('SIGTERM');
const b = readFileSync(resolve(out, 'intel-expanded-1672x941.png'));
console.log(`Recaptured intel-expanded ${b.readUInt32BE(16)}×${b.readUInt32BE(20)}`);
