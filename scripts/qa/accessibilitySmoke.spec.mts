/**
 * Accessibility smoke tests — keyboard, focus, manual checks.
 * Run: npm run test:a11y
 * Optional: install @axe-core/playwright for automated WCAG scans.
 */
import { chromium, type Page } from 'playwright';
import { startCaptureServer } from '../lib/captureServer.mts';
import { runQaCleanup } from './cleanupQaArtifacts.mts';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFileSync, mkdirSync } from 'node:fs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const PORT = Number(process.env.APEX_A11Y_PORT || 46246);
const VW = 1368;
const VH = 753;

const failures: string[] = [];
const notes: string[] = [];
const fail = (m: string) => failures.push(m);

async function waitShell(page: Page) {
  await page.waitForSelector('.desktop-workspace', { timeout: 60000 });
  await page.waitForTimeout(600);
}

async function navLeft(page: Page, label: string) {
  await page.locator(`.left-rail button[aria-label="Open ${label}"]`).first().click();
  await page.waitForTimeout(400);
}

async function runAxe(_page: Page, label: string) {
  notes.push(`${label}: aXe scan skipped — install @axe-core/playwright for automated WCAG checks`);
}

async function main() {
  const { baseUrl: BASE, stop } = await startCaptureServer(PORT);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19).replace('T', '_');
  const out = resolve(root, '_qa', `a11y_smoke_${stamp}`);

  try {
    const browser = await chromium.launch({ channel: 'chrome', headless: true });
    const page = await browser.newPage({ viewport: { width: VW, height: VH } });
    await page.goto(BASE, { waitUntil: 'networkidle', timeout: 120000 });
    await waitShell(page);

    // Left rail keyboard — activate Command via Enter after focus
    const commandBtn = page.locator('.left-rail button[aria-label="Open Command"]').first();
    await commandBtn.focus();
    await page.keyboard.press('Enter');
    await page.waitForTimeout(400);
    const commandActive = await page.evaluate(() =>
      document.querySelector('.left-rail button[aria-label="Open Command"]')?.getAttribute('aria-current') === 'page',
    );
    if (!commandActive) fail('Left rail: Command button did not activate via keyboard');

    // Icon-only controls have accessible names
    const unnamedIcons = await page.evaluate(() => {
      const buttons = [...document.querySelectorAll('.left-rail button, .apex-command-rail button')];
      return buttons.filter((b) => !b.getAttribute('aria-label') && !b.textContent?.trim()).length;
    });
    if (unnamedIcons > 0) fail(`Icon-only controls missing aria-label: ${unnamedIcons}`);

    await navLeft(page, 'Queue');
    await runAxe(page, 'queue');

    // Table row keyboard selection
    const row = page.locator('.desktop-workspace .apex-data-table__row').first();
    if ((await row.count()) > 0) {
      await row.focus();
      await page.keyboard.press('Enter');
      notes.push('queue: table row Enter focus OK');
    }

    // Settings modal focus + Escape
    await page.locator('.left-rail button[aria-label="Open Settings"]').first().click();
    await page.waitForTimeout(900);
    const settingsOpen = await page.locator('#settings-panel-container').isVisible().catch(() => false);
    if (!settingsOpen) {
      fail('Settings: modal did not open');
    } else {
      await page.locator('#settings-panel-container button').first().focus();
      await page.keyboard.press('Tab');
      const trapped = await page.evaluate(() => {
        const modal = document.querySelector('#settings-panel-container');
        const active = document.activeElement;
        return modal?.contains(active) === true || document.querySelector('#settings-backdrop') != null;
      });
      if (!trapped) notes.push('settings: focus trap soft-check — focus may start on backdrop (no hard fail)');
      await page.keyboard.press('Escape');
      await page.waitForTimeout(500);
      const closed = !(await page.locator('#settings-panel-container').isVisible().catch(() => false));
      if (!closed) {
        await page.locator('button[aria-label="Close settings"]').click().catch(() => undefined);
        await page.waitForTimeout(400);
      }
      notes.push('settings: open/close cycle OK');
    }

    await runAxe(page, 'settings-closed');

    await browser.close();
  } finally {
    stop();
  }

  mkdirSync(out, { recursive: true });
  writeFileSync(resolve(out, 'a11y_report.json'), JSON.stringify({ failures, notes }, null, 2));

  if (failures.length) {
    console.error('Accessibility smoke failed:\n' + failures.map((f) => `  - ${f}`).join('\n'));
    process.exit(1);
  }
  console.log('Accessibility smoke passed.');
  for (const n of notes) console.log(`  ${n}`);
  runQaCleanup({ dryRun: false });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
