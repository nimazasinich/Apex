import { chromium } from 'playwright';

const BASE = 'http://127.0.0.1:3000';

async function main() {
  const browser = await chromium.launch({ headless: true, channel: 'msedge' });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  await page.goto(`${BASE}/#/markets`, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => undefined);
  await page.waitForTimeout(6000);

  const info = await page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll('.apex-metric-card'));
    const all = cards.map((c) => ({
      label: c.querySelector('.apex-metric-label')?.textContent,
      hasRange: !!c.querySelector('.apex-metric-range'),
      outerHTML: c.outerHTML.slice(0, 900),
    }));
    const rangeCard = cards.find((c) => c.querySelector('.apex-metric-range'));
    if (!rangeCard) return { error: 'no range card found', cardCount: cards.length, all };
    const strong = rangeCard.querySelector('.apex-metric-range strong');
    const cs = strong ? getComputedStyle(strong) : null;
    return {
      cardOuterHTML: rangeCard.outerHTML.slice(0, 1500),
      cardClassList: rangeCard.className,
      strongComputedWhiteSpace: cs?.whiteSpace,
      strongClassList: strong?.className,
      parentOfStrongClass: strong?.parentElement?.className,
    };
  });

  console.log(JSON.stringify(info, null, 2));
  await browser.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
