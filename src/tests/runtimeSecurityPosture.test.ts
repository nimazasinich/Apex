import { describe, expect, it } from 'vitest';
import { buildRuntimeSecurityPosture } from '../services/serverSecurity';

const killSwitches = {
  allTrading: false,
  newEntries: true,
  automatedExecution: true,
  exchanges: ['kucoin'],
  symbols: ['BTCUSDT'],
  strategies: ['example'],
};

describe('runtime security posture diagnostics', () => {
  it('reports non-secret controls and keeps autonomous live execution disabled', () => {
    const posture = buildRuntimeSecurityPosture({
      deploymentProfile: 'production',
      operatorTokenConfigured: true,
      requestIsSecure: true,
      killSwitches,
      manualLiveExecutionArmedSessions: 2,
    });
    expect(posture.hardeningSatisfied).toBe(true);
    expect(posture.mutationAuthEnabled).toBe(true);
    expect(posture.csrfOriginPolicyActive).toBe(true);
    expect(posture.killSwitches).toEqual({
      allTrading: false,
      newEntries: true,
      automatedExecution: true,
      exchangeScopeCount: 1,
      symbolScopeCount: 1,
      strategyScopeCount: 1,
    });
    expect(posture.execution).toEqual({
      autonomousLiveExecutionEnabled: false,
      manualLiveExecutionArmedSessions: 2,
    });
    expect(JSON.stringify(posture)).not.toMatch(/token|secret|password|credential/i);
  });

  it('fails production hardening truth when TLS or operator auth is missing', () => {
    expect(buildRuntimeSecurityPosture({
      deploymentProfile: 'production',
      operatorTokenConfigured: false,
      requestIsSecure: true,
      killSwitches: { ...killSwitches, exchanges: [], symbols: [], strategies: [] },
      manualLiveExecutionArmedSessions: 0,
    }).hardeningSatisfied).toBe(false);
    expect(buildRuntimeSecurityPosture({
      deploymentProfile: 'production',
      operatorTokenConfigured: true,
      requestIsSecure: false,
      killSwitches: { ...killSwitches, exchanges: [], symbols: [], strategies: [] },
      manualLiveExecutionArmedSessions: 0,
    }).hardeningSatisfied).toBe(false);
  });
});
