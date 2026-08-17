import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const outDir = resolve(process.cwd(), '_qa/diag');
mkdirSync(outDir, { recursive: true });
const BASE_URL = 'http://127.0.0.1:3000';
const pages = ['overview', 'markets', 'portfolio', 'trading'];

async function main() {
  const browser = await chromium.launch({ headless: true, channel: 'msedge' });
  const page = await browser.newPage({ viewport: { width: 1368, height: 753 } });
  for (const p of pages) {
    await page.goto(`${BASE_URL}/#${p}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(2500);
    await page.screenshot({ path: resolve(outDir, `current-${p}.jpg`), type: 'jpeg', quality: 85, fullPage: true });
    console.log(`captured ${p}`);
  }
  await browser.close();
}
void main();
