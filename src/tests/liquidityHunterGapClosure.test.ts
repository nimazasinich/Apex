import { describe, expect, it } from 'vitest';
import { interpretLiquidityHunterReadPlaneMessage } from '../services/liquidityHunterReadPlaneClient';
import { readFileSync } from 'node:fs';
import path from 'node:path';

describe('Liquidity Hunter production gap closure', () => {
  it('turns RESYNC_REQUIRED into an explicit fresh-snapshot action', () => {
    expect(interpretLiquidityHunterReadPlaneMessage({ type: 'RESYNC_REQUIRED', reason: 'client_backpressure_snapshot_required' })).toEqual({
      kind: 'RESYNC', reason: 'client_backpressure_snapshot_required',
    });
  });

  it('keeps production callers for TradePlan/Risk, manual canary, durable setup APIs, and read-plane UI', () => {
    const root = process.cwd();
    const routes = readFileSync(path.join(root, 'src/services/apexNextMarketRoutes.ts'), 'utf8');
    const server = readFileSync(path.join(root, 'server.ts'), 'utf8');
    const strategy = readFileSync(path.join(root, 'src/pages/strategies/StrategyPage.tsx'), 'utf8');
    const backtesting = readFileSync(path.join(root, 'src/pages/backtesting/BacktestingPage.tsx'), 'utf8');
    expect(routes).toContain('authorizeLiquidityHunterTradePlan({');
    expect(routes).toContain('liquidityHunterManualCanaryRegistry.put');
    expect(server).toContain("app.post('/api/liquidity-hunter/manual-testnet/:setupId/submit'");
    expect(server).toContain('liquidityHunterExecutionLifecycles.transition');
    expect(server).toContain('liquidityHunterProtectionCoordinator.create');
    expect(server).toContain("app.get('/api/liquidity-hunter/world-state/:symbol'");
    expect(server).toContain("app.post('/api/liquidity-hunter/edge-thresholds/approve'");
    expect(strategy).toContain('new WebSocket(');
    expect(strategy).toContain('interpretLiquidityHunterReadPlaneMessage');
    expect(backtesting).toContain('LiquidityHunterReplayPanel');
  });
});
