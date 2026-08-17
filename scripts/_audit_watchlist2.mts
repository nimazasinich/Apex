import { chromium } from 'playwright';

const BASE = 'http://127.0.0.1:3000';

async function main() {
  const browser = await chromium.launch({ channel: 'msedge' });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('console', (m) => { if (m.type() === 'error') console.log('CONSOLE_ERROR:', m.text().slice(0, 300)); });
  page.on('pageerror', (e) => console.log('PAGE_ERROR:', e.message.slice(0, 300)));

  // Seed favorites BEFORE any app mount, then load fresh (simulates "favorite, then reopen app")
  await page.goto(`${BASE}/#/watchlist`, { waitUntil: 'networkidle' });
  await page.evaluate(() => window.localStorage.setItem('apex_watchlist_favorites_v1', JSON.stringify(['BTCUSDT', 'ETHUSDT'])));
  // Full hard reload - this is the real test: does a fresh app boot pick up the persisted favorites?
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: 'audit_watchlist_after_hard_reload.png' });
  const bodyText = await page.evaluate(() => document.body.innerText);
  console.log('CONTAINS_BTCUSDT', bodyText.includes('BTCUSDT'));
  console.log('CONTAINS_ETHUSDT', bodyText.includes('ETHUSDT'));
  console.log('STORAGE_VALUE_AFTER_RELOAD', await page.evaluate(() => window.localStorage.getItem('apex_watchlist_favorites_v1')));
  console.log('BODY_SNIPPET', bodyText.slice(0, 600).replace(/\n+/g, ' | '));
  console.log('BODY_HTML_LENGTH', await page.evaluate(() => document.getElementById('root')?.innerHTML.length ?? -1));
  console.log('PAGE_TITLE', await page.title());
  console.log('CURRENT_HASH', await page.evaluate(() => window.location.hash));

  await browser.close();
}

main().catch((e) => { console.error('FATAL', e); process.exit(1); });
