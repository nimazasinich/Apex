import { chromium } from 'playwright';

const BASE = 'http://127.0.0.1:3000';
const PAGES = ['overview','markets','watchlist','trading','settings'];

async function main() {
  const browser = await chromium.launch({ channel: 'msedge' });
  for (const route of PAGES) {
    // Fresh context per page = fresh mount, exactly like a user opening that URL directly
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message.slice(0, 200)));
    page.on('console', (m) => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text().slice(0, 200)); });
    await page.goto(`${BASE}/#/${route}`, { waitUntil: 'networkidle', timeout: 20000 });
    await page.waitForTimeout(1500);
    const htmlLen = await page.evaluate(() => document.getElementById('root')?.innerHTML.length ?? -1);
    const bodyText = await page.evaluate(() => document.body.innerText.slice(0, 150));
    console.log(`--- ${route} --- rootHTMLLength=${htmlLen} errors=${JSON.stringify(errors)} bodyText=${JSON.stringify(bodyText)}`);
    await context.close();
  }
  await browser.close();
}

main().catch((e) => { console.error('FATAL', e); process.exit(1); });
