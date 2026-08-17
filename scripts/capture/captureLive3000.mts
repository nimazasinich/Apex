import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(process.cwd());
const outDir = resolve(root, '_qa/diag');
mkdirSync(outDir, { recursive: true });
const BASE_URL = 'http://127.0.0.1:3000';

async function main() {
  const browser = await chromium.launch({ headless: true, channel: 'msedge' });
  const page = await browser.newPage({ viewport: { width: 1368, height: 753 } });
  const consoleLogs: string[] = [];
  const pageErrors: string[] = [];
  page.on('console', (msg) => consoleLogs.push(`[console:${msg.type()}] ${msg.text()}`));
  page.on('pageerror', (err) => pageErrors.push(String(err?.stack || err)));
  await page.goto(`${BASE_URL}/#overview`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(3000);
  await page.screenshot({ path: resolve(outDir, 'live-3000.jpg'), type: 'jpeg', quality: 85, fullPage: false });
  writeFileSync(resolve(outDir, 'live-3000.json'), JSON.stringify({ consoleLogs, pageErrors }, null, 2));
  await browser.close();
  console.log('OK, wrote live-3000.jpg');
}
void main();
