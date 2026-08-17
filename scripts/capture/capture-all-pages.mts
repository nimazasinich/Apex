import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const PROJECT_ROOT = resolve(process.cwd());
const OUT_DIR = resolve(PROJECT_ROOT, '_qa/visual-review');
const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:3000';

const PAGES = [
  { name: 'overview', route: '/#/overview' },
  { name: 'trading', route: '/#/trading' },
  { name: 'strategies', route: '/#/strategies' },
  { name: 'backtesting', route: '/#/backtesting' },
  { name: 'analytics', route: '/#/analytics' },
  { name: 'markets', route: '/#/markets' },
  { name: 'settings', route: '/#/settings' },
];

const VIEWPORTS = [
  { name: '1368x753', width: 1368, height: 753 },
  { name: '1024x768', width: 1024, height: 768 },
];

mkdirSync(OUT_DIR, { recursive: true });

async function freezeVisualMotion(page: Page): Promise<void> {
  await page.addStyleTag({
    content: `
      html { scroll-behavior: auto !important; }
      *, *::before, *::after {
        animation-delay: 0s !important;
        animation-duration: 0s !important;
        animation-iteration-count: 1 !important;
        transition-delay: 0s !important;
        transition-duration: 0s !important;
        caret-color: transparent !important;
      }
    `,
  });
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
}

async function waitForAssets(page: Page, pageName?: string): Promise<void> {
  await page.waitForSelector('body', { state: 'visible', timeout: 15000 });
  await page.waitForSelector('.apex-route-skeleton', { state: 'detached', timeout: 15000 }).catch(() => undefined);
  if (pageName === 'backtesting') {
    await page.waitForSelector('.apex-backtest-workspace', { state: 'visible', timeout: 15000 }).catch(() => undefined);
  }
  await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => undefined);
  await page.evaluate(async () => {
    if ('fonts' in document) await document.fonts.ready;
  }).catch(() => undefined);
  await page.waitForTimeout(1000);
}

async function main() {
  console.log('Launching browser to capture APEX pages...');
  const browser = await chromium.launch({
    headless: true,
    channel: 'msedge',
    args: ['--disable-dev-shm-usage', '--disable-features=TranslateUI', '--force-device-scale-factor=1'],
  });

  const capturedFiles: string[] = [];

  for (const vp of VIEWPORTS) {
    console.log(`\n--- Capturing viewport: ${vp.name} (${vp.width}x${vp.height}) ---`);
    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: 1,
      colorScheme: 'light',
    });

    const page = await context.newPage();

    for (const p of PAGES) {
      const url = `${BASE_URL}${p.route}`;
      console.log(`Navigating to ${p.name} -> ${url}`);
      try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await waitForAssets(page, p.name);
        await freezeVisualMotion(page);

        const fileNameViewport = `${p.name}-${vp.name}-viewport.png`;
        const filePathViewport = resolve(OUT_DIR, fileNameViewport);
        await page.screenshot({ path: filePathViewport, fullPage: false });

        const fileNameFull = `${p.name}-${vp.name}-full.png`;
        const filePathFull = resolve(OUT_DIR, fileNameFull);
        await page.screenshot({ path: filePathFull, fullPage: true });

        console.log(`Captured: ${fileNameViewport} & ${fileNameFull}`);
        capturedFiles.push(filePathViewport);
      } catch (err) {
        console.error(`Failed capturing ${p.name}:`, err);
      }
    }
    await context.close();
  }

  await browser.close();
  console.log('\nAll captures completed successfully!');
  console.log(`Output directory: ${OUT_DIR}`);
}

void main();
