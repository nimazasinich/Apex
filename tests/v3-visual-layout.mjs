// Canonical V3 visual acceptance test.
// Run after `npm run build` or against a running dev server:
// APEX_VISUAL_QA_URL=http://127.0.0.1:3000 node tests/v3-visual-layout.mjs
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const baseUrl = process.env.APEX_VISUAL_QA_URL || 'http://127.0.0.1:3000';
const output = path.join(root, '_qa', 'v3-layout');
fs.mkdirSync(output, { recursive: true });
const routes = ['watchlist', 'orders', 'positions', 'alerts', 'history', 'analytics', 'settings', 'help'];
const dprs = [1, 1.25];
const executablePath = process.env.APEX_PLAYWRIGHT_EXECUTABLE;
const browser = await chromium.launch(executablePath ? { headless: true, executablePath } : { headless: true });
const report = [];

try {
  for (const deviceScaleFactor of dprs) {
    const context = await browser.newContext({ viewport: { width: 1368, height: 753 }, deviceScaleFactor });
    for (const route of routes) {
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.goto(`${baseUrl}/#/${route}`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
      await page.locator('.apex-shell.apex-workspace').waitFor({ state: 'visible', timeout: 30_000 });
      await page.waitForTimeout(400);
      const geometry = await page.evaluate(() => {
        const rect = (selector) => {
          const element = document.querySelector(selector);
          if (!element) return null;
          const box = element.getBoundingClientRect();
          return { x: box.x, y: box.y, width: box.width, height: box.height };
        };
        return {
          document: {
            width: document.documentElement.scrollWidth,
            height: document.documentElement.scrollHeight,
            bodyWidth: document.body.scrollWidth,
            bodyHeight: document.body.scrollHeight,
          },
          sidebar: rect('.apex-sidebar'),
          header: rect('.apex-header'),
          pageFrame: rect('.apex-page-frame'),
          main: rect('.apex-page-main'),
          context: rect('.apex-context-panel'),
        };
      });
      assert.deepEqual(geometry.document, { width: 1368, height: 753, bodyWidth: 1368, bodyHeight: 753 });
      assert.ok(geometry.sidebar && Math.abs(geometry.sidebar.width - 180) <= 1);
      assert.ok(geometry.header && Math.abs(geometry.header.height - 52) <= 1);
      assert.ok(geometry.context && Math.abs(geometry.context.width - 300) <= 1);
      assert.ok(geometry.main && Math.abs(geometry.main.width - 852) <= 2);
      assert.equal(errors.length, 0, `page errors on ${route}: ${errors.join('; ')}`);
      await page.screenshot({ path: path.join(output, `${route}-dpr-${String(deviceScaleFactor).replace('.', '_')}.png`) });
      report.push({ route, deviceScaleFactor, geometry, errors });
      await page.close();
    }
    await context.close();
  }
} finally {
  await browser.close();
}
fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
console.log(`APEX V3 visual contract passed for ${report.length} route/DPR combinations.`);
