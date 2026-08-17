import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '../..');
const outDir = resolve(root, 'Doc/automation/operations_status/screenshots');
const reportDir = resolve(root, 'Doc/automation/operations_status');
mkdirSync(outDir, { recursive: true });

const PORT = Number(process.env.APEX_OPS_AUDIT_PORT || (42_000 + (process.pid % 8_000)));
const BASE_URL = `http://127.0.0.1:${PORT}`;

async function waitForServer(timeoutMs = 25_000): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(`${BASE_URL}/api/operations/status`);
      if (response.ok) return;
    } catch {
      // retry
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 500));
  }
  throw new Error('dev server did not become ready for operations panel audit');
}

async function main(): Promise<void> {
  const errors: string[] = [];
  let server: ChildProcess | null = null;
  let browserAvailable = true;

  try {
    server = spawn(process.execPath, ['--import', 'tsx', 'server.ts'], {
      cwd: root,
      env: { ...process.env, PORT: String(PORT), APEX_DECISION_MEMORY_MIRROR: 'false' },
      stdio: 'ignore',
    });
    await waitForServer();

    const browser = await chromium.launch({
      headless: true,
      channel: process.env.APEX_PLAYWRIGHT_CHANNEL || 'msedge',
    });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 });

    // App may sit on the init splash while exchange probes time out; wait for
    // the workspace shell before opening the Operations page.
    try {
      await Promise.race([
        page.getByRole('button', { name: 'Open Operations page' }).waitFor({ state: 'visible', timeout: 45_000 }),
        page.getByText('APEX PORTAL', { exact: false }).waitFor({ state: 'visible', timeout: 45_000 }),
      ]);
    } catch {
      errors.push('app_shell_not_ready');
    }

    try {
      await page.goto(`${BASE_URL}/#operations`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
      await page.getByText('Provider Health', { exact: false }).waitFor({ state: 'visible', timeout: 15_000 });
      await page.waitForTimeout(1500);
    } catch {
      const opsNav = page.getByRole('button', { name: 'Open Operations page' });
      try {
        await opsNav.waitFor({ state: 'visible', timeout: 10_000 });
        await opsNav.click({ timeout: 5000 });
        await page.getByText('Provider Health', { exact: false }).waitFor({ state: 'visible', timeout: 15_000 });
        await page.waitForTimeout(1500);
      } catch {
        errors.push('operations_page_not_found');
      }
    }

    const bodyText = await page.locator('body').innerText();
    const checks = {
      providerHealthVisible: /Provider Health/i.test(bodyText),
      decisionMemoryVisible: /Decision Memory Sync/i.test(bodyText),
      adaptiveAuditVisible: /Adaptive Audit/i.test(bodyText),
      adaptiveStressVisible: /Adaptive Stress Evidence/i.test(bodyText),
      providerRoutingVisible: /Provider Routing Evidence/i.test(bodyText),
      loadMatrixVisible: /Load Matrix Evidence/i.test(bodyText),
      shadowMlTrainingVisible: /Shadow ML Training/i.test(bodyText),
      shadowMlComparisonVisible: /Shadow ML Comparison/i.test(bodyText),
      localOnlyOrDegradedVisible: /LOCAL ONLY|DEGRADED|INSUFFICIENT DATA|NO MODEL|SYNC ENABLED|GEO BLOCKED|RATE LIMITED|UNSUPPORTED/i.test(bodyText),
      auditOnlyVisible: /audit-only|Audit-only/i.test(bodyText),
    };

    const adaptiveStressHeading = page.getByText('Adaptive Stress Evidence', { exact: true });
    if (await adaptiveStressHeading.count() === 1) {
      await adaptiveStressHeading.scrollIntoViewIfNeeded();
      await page.waitForTimeout(250);
    }
    const providerRoutingHeading = page.getByText('Provider Routing Evidence', { exact: true });
    if (await providerRoutingHeading.count() === 1) {
      await providerRoutingHeading.scrollIntoViewIfNeeded();
      await page.waitForTimeout(250);
    }
    const loadMatrixHeading = page.getByText('Load Matrix Evidence', { exact: true });
    if (await loadMatrixHeading.count() === 1) {
      await loadMatrixHeading.scrollIntoViewIfNeeded();
      await page.waitForTimeout(250);
    }
    await page.screenshot({ path: resolve(outDir, 'operations_panel_ops_tab.png'), fullPage: true });
    await browser.close();

    const report = {
      generatedAt: new Date().toISOString(),
      baseUrl: BASE_URL,
      screenshot: 'Doc/automation/operations_status/screenshots/operations_panel_ops_tab.png',
      checks,
      errors,
      ok: errors.length === 0 && Object.values(checks).every(Boolean),
      environmentUnavailable: false,
    };

    writeFileSync(resolve(reportDir, 'OPERATIONS_PANEL_AUDIT_v1.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    if (!report.ok) {
      console.error('Operations panel audit failed:', [...errors, ...Object.entries(checks).filter(([, value]) => !value).map(([key]) => key)].join(', '));
      process.exit(1);
    }
    console.log('Operations panel audit passed.');
  } catch (error) {
    browserAvailable = false;
    const reason = error instanceof Error ? error.message : String(error);
    const report = {
      generatedAt: new Date().toISOString(),
      baseUrl: BASE_URL,
      screenshot: null,
      checks: {},
      errors: [reason],
      ok: false,
      environmentUnavailable: true,
    };
    writeFileSync(resolve(reportDir, 'OPERATIONS_PANEL_AUDIT_v1.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    console.error(`Operations panel audit environment unavailable: ${reason}`);
    process.exit(1);
  } finally {
    stopChild(server);
  }
}

function stopChild(child: ChildProcess | null): void {
  if (!child?.pid) return;
  if (process.platform === 'win32') {
    spawnSync('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    return;
  }
  child.kill('SIGTERM');
}

void main();
