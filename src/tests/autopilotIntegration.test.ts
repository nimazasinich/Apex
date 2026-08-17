import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');

describe('Smart Autopilot integration', () => {
  it('persists one global opt-in setting and exposes the same mini control on Backtesting and Strategies', () => {
    expect(read('src/types.ts')).toContain('autopilotEnabled: boolean');
    expect(read('src/lib/storage.ts')).toContain('autopilotEnabled: false');
    expect(read('src/pages/settings/SettingsPage.tsx')).toContain('Smart Autopilot — rotate strategy/timeframe contexts every 5 minutes');
    expect(read('src/pages/backtesting/BacktestRunBuilder.tsx')).toContain('SmartAutopilotMiniToggle');
    expect(read('src/pages/strategies/StrategyEvidenceRail.tsx')).toContain('SmartAutopilotMiniToggle');
    expect(read('src/pages/strategies/StrategyPage.tsx')).toContain('onAutopilotEnabledChange');
    const app = read('src/App.tsx');
    expect(app).toContain('setAutopilotEnabled');
    expect(app).toContain('saveSettings(next)');
    expect(app.match(/onAutopilotEnabledChange=\{setAutopilotEnabled\}/g)?.length).toBeGreaterThanOrEqual(2);
  });

  it('runs bounded five-minute Smart Autopilot cycles instead of a single-context loop', () => {
    const backtesting = read('src/pages/backtesting/useBacktestingOptimization.ts');
    expect(backtesting).toContain("apiMutate('/api/strategies/autopilot/cycle'");
    expect(backtesting).toContain('maxContexts: 6');
    expect(backtesting).toContain('symbols: marketOptions.slice(0, 4)');
    expect(backtesting).toContain('window.setInterval(() => void runAutopilotOptimization(), 5 * 60_000)');
    expect(backtesting).toContain('autopilotInFlightRef.current');
    expect(backtesting).toContain('SMART_AUTOPILOT_CYCLE_KEY');
  });

  it('uses multi-agent promotion gates and the existing multi-strategy paper council', () => {
    const routes = read('src/services/apexNextMarketRoutes.ts');
    expect(routes).toContain("app.post('/api/strategies/autopilot/cycle'");
    expect(routes).toContain('buildSmartAutopilotPlan');
    expect(routes).toContain('runSmartAutopilotOptimizationCouncil(report)');
    expect(routes).toContain('if (council.approvedForPromotion)');
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
