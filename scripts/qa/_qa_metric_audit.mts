import { chromium } from 'playwright';

const BASE = 'http://127.0.0.1:3000';
const PAGES = ['overview', 'markets', 'portfolio', 'watchlist', 'trading'];
const WIDTHS = [1440, 1920, 2560];

async function main() {
  const browser = await chromium.launch({ headless: true, channel: 'msedge' });
  const page = await browser.newPage();
  const results: any[] = [];

  for (const w of WIDTHS) {
    await page.setViewportSize({ width: w, height: 1000 });
    for (const p of PAGES) {
      await page.goto(`${BASE}/#/${p}`, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(1800);

      const data = await page.evaluate(() => {
        const cards = Array.from(document.querySelectorAll('.apex-metric-card'));
        return cards.map((card) => {
          const rect = card.getBoundingClientRect();
          const strongEls = Array.from(card.querySelectorAll('strong'));
          const strongInfo = strongEls.map((s) => {
            const r = s.getBoundingClientRect();
            const cs = getComputedStyle(s);
            return {
              text: s.textContent?.trim(),
              clientWidth: s.clientWidth,
              scrollWidth: s.scrollWidth,
              truncated: s.scrollWidth > s.clientWidth + 1,
              height: r.height,
              lineHeight: cs.lineHeight,
              // If element height is much greater than one line-height, text is wrapping to multiple lines
              multiLine: r.height > (parseFloat(cs.lineHeight) || 14) * 1.6,
              whiteSpace: cs.whiteSpace,
            };
          });
          return {
            cardRect: { w: rect.width, h: rect.height },
            overflowingCard: card.scrollWidth > card.clientWidth + 1,
            strongInfo,
          };
        });
      });

      const flagged = data.filter((c: any) =>
        c.overflowingCard || c.strongInfo.some((s: any) => s.truncated || s.multiLine),
      );

      results.push({ width: w, pageKey: p, totalCards: data.length, flaggedCount: flagged.length, flagged });
    }
  }

  await browser.close();
  console.log(JSON.stringify(results, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
