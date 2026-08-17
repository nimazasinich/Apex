import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const BASE_URL = 'http://127.0.0.1:3000';

async function main() {
  const browser = await chromium.launch({ headless: true, channel: 'msedge' });
  const page = await browser.newPage({ viewport: { width: 1680, height: 950 } });
  await page.goto(`${BASE_URL}/#/overview`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(2000);

  const selectors = [
    '.apex-sidebar', '.apex-header', '.apex-content', '.apex-overview-terminal',
    '.apex-market-strip', '.apex-overview-main', '.apex-watchlist-panel',
    '.apex-overview-center', '.apex-chart-panel', '.apex-activity-panel',
    '.apex-overview-order', '.apex-order-ticket', '.apex-risk-overview',
    '.apex-toolbox-rail', '.apex-rail-button',
  ];

  const result: Record<string, any> = {};
  for (const sel of selectors) {
    const box = await page.locator(sel).first().boundingBox().catch(() => null);
    result[sel] = box;
  }
  // Check for any element overflowing the viewport (would force page scroll)
  const overflow = await page.evaluate(() => {
    const el = document.scrollingElement!;
    return { scrollHeight: el.scrollHeight, clientHeight: el.clientHeight, scrollWidth: el.scrollWidth, clientWidth: el.clientWidth };
  });
  result['__docOverflow'] = overflow;

  writeFileSync(resolve(process.cwd(), '_qa/claude/metrics.json'), JSON.stringify(result, null, 2));
  await browser.close();
  console.log('DONE');
}
void main();
