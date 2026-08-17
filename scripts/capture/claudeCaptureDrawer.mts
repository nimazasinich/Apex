import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(process.cwd());
const outDir = resolve(root, '_qa/claude');
mkdirSync(outDir, { recursive: true });
const BASE_URL = 'http://127.0.0.1:3000';

async function main() {
  const browser = await chromium.launch({ headless: true, channel: 'msedge' });
  const page = await browser.newPage({ viewport: { width: 1680, height: 950 }, deviceScaleFactor: 1 });
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(String(err?.stack || err)));
  await page.goto(`${BASE_URL}/#/overview`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(2000);
  const buttons = await page.$$('.apex-rail-button');
  for (let i = 0; i < buttons.length; i++) {
    await buttons[i].click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: resolve(outDir, `drawer_${i}.png`), fullPage: false });
    await buttons[i].click();
    await page.waitForTimeout(300);
  }
  writeFileSync(resolve(outDir, 'drawer_errors.json'), JSON.stringify(errors, null, 2));
  await browser.close();
  console.log('DONE', buttons.length, 'ERRORS', errors.length);
}
void main();
