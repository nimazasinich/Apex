import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(process.cwd());
const outDir = resolve(root, '_qa/claude');
mkdirSync(outDir, { recursive: true });
const BASE_URL = 'http://127.0.0.1:3000';
const name = process.argv[2] || 'overview';
const path = process.argv[3] || '#/overview';

async function main() {
  const browser = await chromium.launch({ headless: true, channel: 'msedge' });
  const page = await browser.newPage({ viewport: { width: 1680, height: 950 }, deviceScaleFactor: 1 });
  const consoleLogs: string[] = [];
  const pageErrors: string[] = [];
  page.on('console', (msg) => { if (msg.type() === 'error') consoleLogs.push(msg.text()); });
  page.on('pageerror', (err) => pageErrors.push(String(err?.stack || err)));
  await page.goto(`${BASE_URL}/${path}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: resolve(outDir, `${name}.png`), fullPage: false });
  writeFileSync(resolve(outDir, `${name}.json`), JSON.stringify({ consoleLogs, pageErrors }, null, 2));
  await browser.close();
  console.log('WROTE', resolve(outDir, `${name}.png`));
  console.log('ERRORS', consoleLogs.length + pageErrors.length);
}
void main();
