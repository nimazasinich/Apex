import { chromium } from 'playwright';

const BASE = 'http://127.0.0.1:3000';

async function main() {
  const browser = await chromium.launch({ headless: true, channel: 'msedge' });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  const client = await page.context().newCDPSession(page);
  await client.send('DOM.enable');
  await client.send('CSS.enable');

  await page.goto(`${BASE}/#/markets`, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => undefined);
  await page.waitForTimeout(6000);

  const { root } = await client.send('DOM.getDocument', { depth: -1, pierce: true });
  const { nodeId } = await client.send('DOM.querySelector', {
    nodeId: root.nodeId,
    selector: '.apex-metric-range strong',
  });
  if (!nodeId) {
    console.log(JSON.stringify({ error: 'not found' }));
    await browser.close();
    return;
  }

  const matched = await client.send('CSS.getMatchedStylesForNode', { nodeId });
  const relevant: any[] = [];
  const collectRules = (rules: any[], label: string) => {
    for (const m of rules || []) {
      const props = m.rule.style.cssProperties || [];
      const wsProp = props.find((p: any) => p.name === 'white-space');
      if (wsProp) {
        relevant.push({
          label,
          selector: m.rule.selectorList.text,
          value: wsProp.value,
          important: wsProp.important || false,
          layer: m.rule.layers ? m.rule.layers.map((l: any) => l.text) : undefined,
          origin: m.rule.origin,
        });
      }
    }
  };
  collectRules(matched.matchedCSSRules ?? [], 'matched');

  console.log(JSON.stringify(relevant, null, 2));
  await browser.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
