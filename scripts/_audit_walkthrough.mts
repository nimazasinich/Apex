import { chromium } from 'playwright';

const BASE = 'http://127.0.0.1:3000';
const PAGES = [
  'overview','markets','watchlist','portfolio','trading','orders',
  'positions','alerts','history','analytics','backtesting',
  'strategies','settings','help'
];

async function main() {
  const browser = await chromium.launch({ channel: 'msedge' });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  const consoleErrors: Record<string, string[]> = {};
  const failedRequests: Record<string, string[]> = {};
  let currentPage = 'boot';

  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      (consoleErrors[currentPage] ??= []).push(msg.text().slice(0, 300));
    }
  });
  page.on('requestfailed', (req) => {
    (failedRequests[currentPage] ??= []).push(`${req.method()} ${req.url()} :: ${req.failure()?.errorText}`);
  });
  page.on('response', (res) => {
    if (res.status() >= 400) {
      (failedRequests[currentPage] ??= []).push(`${res.request().method()} ${res.url()} -> ${res.status()}`);
    }
  });
  page.on('pageerror', (err) => {
    (consoleErrors[currentPage] ??= []).push('PAGEERROR: ' + err.message.slice(0, 300));
  });

  for (const route of PAGES) {
    currentPage = route;
    try {
      await page.goto(`${BASE}/#/${route}`, { waitUntil: 'networkidle', timeout: 20000 });
      await page.waitForTimeout(1500);
    } catch (e: any) {
      (consoleErrors[route] ??= []).push('NAVIGATION_ERROR: ' + String(e).slice(0, 300));
    }
  }

  console.log('=== PAGE WALKTHROUGH RESULTS ===');
  for (const route of PAGES) {
    console.log(`\n--- ${route} ---`);
    console.log('console/page errors:', JSON.stringify(consoleErrors[route] ?? []));
    console.log('failed/4xx/5xx requests:', JSON.stringify(failedRequests[route] ?? []));
  }

  await browser.close();
}

main().catch((e) => { console.error('FATAL', e); process.exit(1); });
