import { chromium } from 'playwright';

const browser = await chromium.launch({ channel: 'msedge' });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
page.on('console', (msg) => console.log('[console]', msg.type(), msg.text()));
page.on('pageerror', (err) => console.log('[pageerror]', err.message));

await page.goto('http://127.0.0.1:3000/#/overview', { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.waitForTimeout(3000);

const info = await page.evaluate(() => {
  const body = document.body;
  const root = document.getElementById('root');
  const rect = body.getBoundingClientRect();
  const rootRect = root ? root.getBoundingClientRect() : null;
  return {
    bodyRect: { w: rect.width, h: rect.height },
    rootRect: rootRect ? { w: rootRect.width, h: rootRect.height } : null,
    rootChildren: root ? root.children.length : -1,
    rootInnerHTMLLength: root ? root.innerHTML.length : -1,
    bodyDisplay: getComputedStyle(body).display,
    bodyVisibility: getComputedStyle(body).visibility,
    htmlHeight: getComputedStyle(document.documentElement).height,
    bodyHeight: getComputedStyle(body).height,
  };
});

console.log('INFO:', JSON.stringify(info, null, 2));

await browser.close();
