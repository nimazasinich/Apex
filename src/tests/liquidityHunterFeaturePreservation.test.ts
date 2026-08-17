import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { listStrategyDefinitions } from '../services/strategyRegistry';
import { readLiquidityHunterFeatureFlags } from '../services/liquidityHunter/featureFlags';

const packageJson = JSON.parse(readFileSync('package.json', 'utf8')) as { scripts: Record<string, string> };
const serverSource = readFileSync('server.ts', 'utf8');

describe('liquidity hunter feature preservation', () => {
  it('preserves every audited strategy identity and compatibility control', () => {
    const definitions = listStrategyDefinitions({ includeBaseline: true });
    expect(definitions.length).toBeGreaterThanOrEqual(13);
    expect(definitions.some((row) => row.strategyId === 'apex-composite-scanner-v1')).toBe(true);
    const squeeze = definitions.find((row) => row.strategyId === 'volatility-squeeze-trend-volume-expansion-v1');
    expect(squeeze?.parameters.some((parameter) => parameter.key === 'widthLookback')).toBe(true);
    expect(squeeze?.parameters.some((parameter) => parameter.legacyKeys?.includes('squeezeLookback'))).toBe(true);
  });

  it('does not remove existing package gates', () => {
    expect(packageJson.scripts.verify).toBeTruthy();
    expect(packageJson.scripts['qa:feature-preservation']).toBeTruthy();
    expect(packageJson.scripts['qa:strategy-optimization']).toBeTruthy();
    expect(packageJson.scripts['qa:core10-fusion']).toBeTruthy();
  });

  it('adds only read/shadow liquidity-hunter routes and no execution route', () => {
    expect(serverSource).toContain("app.get('/api/operations/liquidity-hunter'");
    expect(serverSource).toContain("app.post('/api/liquidity-hunter/shadow/evaluate'");
    expect(serverSource).not.toMatch(/app\.(post|put|patch|delete)\([^\n]*liquidity-hunter\/(?:execute|order|trade|promote)/);
    expect(serverSource).toContain('executionAuthorized: false');
    expect(readLiquidityHunterFeatureFlags({}).autonomousLiveExecutionEnabled).toBe(false);
  });
});
