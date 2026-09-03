import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');

describe('Smart Autopilot integration', () => {
  it('defaults to one global opt-in research mode and removes page-level toggles', () => {
    expect(read('src/types.ts')).toContain('autopilotEnabled: boolean');
    expect(read('src/lib/storage.ts')).toContain('autopilotEnabled: false');
    expect(read('src/pages/settings/SettingsPage.tsx')).toContain('One global Autopilot control');
    expect(read('src/pages/backtesting/BacktestRunBuilder.tsx')).not.toContain('SmartAutopilotMiniToggle');
    expect(read('src/pages/strategies/StrategyEvidenceRail.tsx')).not.toContain('SmartAutopilotMiniToggle');
    expect(read('src/pages/strategies/StrategyPage.tsx')).not.toContain('onAutopilotEnabledChange');
    const app = read('src/App.tsx');
    expect(app).toContain('setAutopilotEnabled');
    expect(app).toContain('saveSettings(next)');
    expect(app.match(/onAutopilotEnabledChange=\{setAutopilotEnabled\}/g)?.length).toBe(1);
  });

  it('runs one bounded server-owned lifecycle with the first cycle scheduled on the configured interval', () => {
    const routes = read('src/services/apexNextMarketRoutes.ts');
    expect(routes).toContain('APEX_AUTOPILOT_SCHEDULER');
    expect(routes).toContain('schedulerTimer = setInterval');
    expect(routes).not.toContain('queueMicrotask(() => { void runScheduledAutopilotCycle(); }');
    expect(routes).toContain("parseSmartAutopilotControls(req.body, 'CLIENT_REQUEST')");
    expect(routes).toContain("'SERVER_SCHEDULER'");
    const backtesting = read('src/pages/backtesting/useBacktestingOptimization.ts');
    expect(backtesting).not.toContain('/api/strategies/autopilot/cycle');
    expect(backtesting).not.toContain('SMART_AUTOPILOT_CYCLE_KEY');
  });

  it('uses multi-agent promotion gates and the existing multi-strategy paper council', () => {
    const routes = read('src/services/apexNextMarketRoutes.ts');
    expect(routes).toContain("app.post('/api/strategies/autopilot/cycle'");
    expect(routes).toContain('buildSmartAutopilotPlan');
    expect(routes).toContain('runSmartAutopilotOptimizationCouncil(report)');
    expect(routes).toContain('if (council.approvedForFinalValidation)');
    expect(routes).toContain("strategyOptimizationStore.promote(report, 'AUTOMATIC_PROMOTION')");
    expect(routes).toContain('runMultiStrategyResearch');
    expect(routes).toContain('runMultiAgentResearchCouncil(research');
  });

  it('keeps Smart Autopilot research/paper-only and never authorizes live exchange execution', () => {
    const routes = read('src/services/apexNextMarketRoutes.ts');
    expect(routes).toContain('researchOnly: true');
    expect(routes).toContain('paperOnly: true');
    expect(routes).toContain('executionAuthorized: false');
    expect(routes).toContain('automaticOrderSubmission: false');
    expect(routes).toContain('autonomousLiveExecutionEnabled: false');
    expect(routes).toContain('riskGovernorBypassAllowed: false');
    expect(routes).toContain('manualConfirmationRequired: true');
  });
});
