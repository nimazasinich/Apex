import { chromium } from 'playwright';

const BASE = 'http://127.0.0.1:3000';

async function main() {
  const browser = await chromium.launch({ channel: 'msedge' });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  // --- Theme test: dark (default) ---
  await page.goto(`${BASE}/#/overview`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: 'audit_theme_dark_default.png' });

  // --- Theme test: force light via the same storage key the app uses, then reload ---
  await page.evaluate(() => window.localStorage.setItem('apex_theme_v1', 'light'));
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  const rootAttrs = await page.evaluate(() => ({
    apexTheme: document.documentElement.getAttribute('data-apex-theme'),
    apexThemeResolved: document.documentElement.getAttribute('data-apex-theme-resolved'),
    storedPref: window.localStorage.getItem('apex_theme_v1'),
  }));
  await page.screenshot({ path: 'audit_theme_light_forced.png' });
  console.log('THEME_ROOT_ATTRS', JSON.stringify(rootAttrs));

  // reset to dark
  await page.evaluate(() => window.localStorage.setItem('apex_theme_v1', 'dark'));

  // --- Watchlist persistence test ---
  await page.evaluate(() => window.localStorage.setItem('apex_watchlist_favorites_v1', JSON.stringify(['BTCUSDT', 'ETHUSDT'])));
  await page.goto(`${BASE}/#/watchlist`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'audit_watchlist_after_seed.png' });
  const watchlistText = await page.evaluate(() => document.body.innerText.includes('BTCUSDT'));
  console.log('WATCHLIST_CONTAINS_BTCUSDT_AFTER_SEED_AND_RELOAD', watchlistText);

  await browser.close();
}

main().catch((e) => { console.error('FATAL', e); process.exit(1); });
