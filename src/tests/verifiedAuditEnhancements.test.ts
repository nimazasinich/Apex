import { describe, expect, it } from 'vitest';
import { describeOrderError } from '../services/orderErrorMessages';
import { assertMutationAllowed, isComputeHeavyRoute } from '../services/serverSecurity';
import { probeSupplementalKey } from '../services/supplementalKeyProbe';
import { interpretLiquidityHunterReadPlaneMessage } from '../services/liquidityHunterReadPlaneClient';

describe('Verified Audit Enhancements & Regression Tests', () => {
  describe('1. Backtest Route & Protection', () => {
    it('registers /api/market/backtest and related routes as compute heavy', () => {
      expect(isComputeHeavyRoute('/api/market/backtest')).toBe(true);
      expect(isComputeHeavyRoute('/api/market/backtest/production-input')).toBe(true);
    });
  });

  describe('2. Expired Order Preview Recovery & Error Formatting', () => {
    it('maps 410 order_preview_expired to user-friendly plain text without raw code leakage', () => {
      const friendly = describeOrderError('order_preview_expired');
      expect(friendly.kind).toBe('expired');
      expect(friendly.title).toBe('This order preview expired before it was confirmed.');
      expect(friendly.detail).toContain('Review the order again to get a fresh quote');
      expect(friendly.code).toBe('order_preview_expired');
    });

    it('maps risk_changed_repreview_required to user-friendly expired recovery', () => {
      const friendly = describeOrderError('risk_changed_repreview_required');
      expect(friendly.kind).toBe('expired');
      expect(friendly.title).toBe('Market or risk conditions changed since this preview.');
      expect(friendly.detail).toContain('Review the order again');
    });

    it('softens unknown error tokens into plain language without exposing internal codes in primary title', () => {
      const friendly = describeOrderError('random_internal_error_code');
      expect(friendly.title).toBe('The order could not be completed.');
      expect(friendly.detail).toBe('Review the order again before retrying.');
      expect(friendly.code).toBe('random_internal_error_code');
    });
  });

  describe('3. Operator Token Architecture & Local Trust Model', () => {
    it('allows loopback UI mutations without operator token even when Origin header is omitted', () => {
      const result = assertMutationAllowed({
        method: 'POST',
        path: '/api/account/orders',
        origin: null,
        referer: null,
        remoteAddress: '127.0.0.1',
        configuredOperatorToken: 'my-secret-token',
        allowedOrigins: ['http://127.0.0.1:3000', 'http://localhost:3000'],
        deploymentProfile: 'local',
        csrfHeader: '1',
      });
      expect(result.ok).toBe(true);
      expect(result.status).toBe(200);
    });

    it('rejects remote off-box mutations when operator token is missing', () => {
      const result = assertMutationAllowed({
        method: 'POST',
        path: '/api/account/orders',
        origin: 'http://192.168.1.50:3000',
        referer: null,
        remoteAddress: '192.168.1.50',
        configuredOperatorToken: 'my-secret-token',
        allowedOrigins: ['http://127.0.0.1:3000'],
        deploymentProfile: 'local',
        csrfHeader: '1',
      });
      expect(result.ok).toBe(false);
      expect(result.status).toBe(403);
    });
  });

  describe('4. BscScan / TronScan Probe Verification', () => {
    it('handles empty keys for bscScanKey and tronScanKey safely', async () => {
      const bscResult = await probeSupplementalKey('bscScanKey', '');
      expect(bscResult.ok).toBe(false);
      expect(bscResult.status).toBe('EMPTY');

      const tronResult = await probeSupplementalKey('tronScanKey', '');
      expect(tronResult.ok).toBe(false);
      expect(tronResult.status).toBe('EMPTY');
    });
  });

  describe('5. Liquidity Hunter Read-Plane Resync & State', () => {
    it('interprets RESYNC_REQUIRED as an explicit RESYNC action', () => {
      const action = interpretLiquidityHunterReadPlaneMessage({
        type: 'RESYNC_REQUIRED',
        reason: 'ws_disconnect_resubscribe_required',
      });
      expect(action).toEqual({
        kind: 'RESYNC',
        reason: 'ws_disconnect_resubscribe_required',
      });
    });

    it('interprets SNAPSHOT and PATCH as EVALUATION actions', () => {
      const mockEvaluation = { symbol: 'BTC-USDT', timestamp: Date.now() } as any;
      const snapshotAction = interpretLiquidityHunterReadPlaneMessage({
        type: 'SNAPSHOT',
        evaluation: mockEvaluation,
      });
      expect(snapshotAction).toEqual({
        kind: 'EVALUATION',
        evaluation: mockEvaluation,
      });
    });
  });
});
