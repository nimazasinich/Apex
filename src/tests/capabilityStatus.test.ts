/**
 * GAP UI-03 regression tests.
 *
 * These lock the rule that a PLANNED / SHADOW / research-only / deprecated
 * capability can never be presented as active live capability. They assert
 * against the REAL registries, so if someone later flips a role — or adds a new
 * provider or module — the presentation consequences surface here rather than in
 * the terminal.
 *
 * These tests read the registries; they never mutate roles or authority.
 */
import { describe, expect, it } from 'vitest';
import {
  describeModuleCapability,
  describeProviderCapability,
  listModuleCapabilities,
  listProviderCapabilities,
} from '../lib/capabilityStatus';
import { PROVIDER_CAPABILITIES, type PublicProviderId } from '../services/providerRouter';
import { TRADING_MODULE_REGISTRY } from '../services/tradingModuleRegistry';

describe('provider capability presentation — GAP UI-03', () => {
  it('never presents a PLANNED venue as active', () => {
    for (const status of listProviderCapabilities()) {
      if (status.isPlanned) {
        expect(status.isActive).toBe(false);
        expect(status.label).toBe('Planned');
        expect(status.disabledReason).toBeTruthy();
      }
    }
  });

  it('classifies the currently planned venues as planned, not active', () => {
    for (const id of ['bitget', 'okx'] as PublicProviderId[]) {
      const status = describeProviderCapability(id);
      expect(status.isPlanned).toBe(true);
      expect(status.isActive).toBe(false);
      expect(status.label).not.toBe('PRIMARY');
    }
  });

  it('still presents implemented venues as active', () => {
    for (const id of ['binance', 'kucoin'] as PublicProviderId[]) {
      const status = describeProviderCapability(id);
      expect(status.isActive).toBe(true);
      expect(status.isPlanned).toBe(false);
      expect(status.disabledReason).toBeUndefined();
    }
  });

  it('requires a real transport and category coverage before reporting active', () => {
    for (const status of listProviderCapabilities()) {
      if (status.isActive) {
        expect(status.registered).toBe(true);
        expect(status.transport).not.toBe('NONE');
      }
    }
  });

  it('covers every declared provider', () => {
    expect(listProviderCapabilities()).toHaveLength(Object.keys(PROVIDER_CAPABILITIES).length);
  });
});

describe('module capability presentation — GAP UI-03', () => {
  it('never presents a PLANNED module as active or authoritative', () => {
    const planned = describeModuleCapability({
      module: 'MathEngine.detectStructuralZones', roles: ['PLANNED'], authoritative: false,
    });
    expect(planned.isPlanned).toBe(true);
    expect(planned.isActive).toBe(false);
    expect(planned.isLiveAuthority).toBe(false);
    expect(planned.label).toBe('Planned');
    expect(planned.disabledReason).toBeTruthy();
  });

  it('never presents a SHADOW module as active', () => {
    const shadow = describeModuleCapability({
      module: 'src/services/scannerCore.ts', roles: ['SHADOW', 'REPLAY'], authoritative: false,
    });
    expect(shadow.isShadow).toBe(true);
    expect(shadow.isActive).toBe(false);
    expect(shadow.isLiveAuthority).toBe(false);
    expect(shadow.label).toBe('Shadow only');
  });

  it('keeps shadow distinct from research-only', () => {
    const shadow = describeModuleCapability({ module: 'm', roles: ['SHADOW'], authoritative: false });
    const research = describeModuleCapability({ module: 'm', roles: ['OFFLINE_ANALYTICS'], authoritative: false });
    expect(shadow.isShadow).toBe(true);
    expect(shadow.isResearchOnly).toBe(false);
    expect(research.isResearchOnly).toBe(true);
    expect(research.isShadow).toBe(false);
    expect(research.label).toBe('Research only');
  });

  it('never presents a research-only module as active', () => {
    for (const roles of [['OFFLINE_ANALYTICS'], ['STRESS_ONLY'], ['REPLAY'], ['STRESS_ONLY', 'OFFLINE_ANALYTICS']] as const) {
      const status = describeModuleCapability({ module: 'm', roles: [...roles], authoritative: false });
      expect(status.isActive).toBe(false);
      expect(status.isLiveAuthority).toBe(false);
    }
  });

  it('never presents a DEPRECATED module as active', () => {
    const status = describeModuleCapability({ module: 'm', roles: ['DEPRECATED'], authoritative: false });
    expect(status.isActive).toBe(false);
    expect(status.label).toBe('Deprecated');
  });

  // Fail-closed: a contradictory marking must not advertise live capability.
  it('lets PLANNED and DEPRECATED override a contradictory LIVE marking', () => {
    const plannedLive = describeModuleCapability({ module: 'm', roles: ['LIVE', 'PLANNED'], authoritative: true });
    const deprecatedLive = describeModuleCapability({ module: 'm', roles: ['LIVE', 'DEPRECATED'], authoritative: true });
    expect(plannedLive.isActive).toBe(false);
    expect(plannedLive.isLiveAuthority).toBe(false);
    expect(deprecatedLive.isActive).toBe(false);
    expect(deprecatedLive.isLiveAuthority).toBe(false);
  });

  it('separates live authority from mere live participation', () => {
    const authority = describeModuleCapability({ module: 'm', roles: ['LIVE'], authoritative: true });
    const participant = describeModuleCapability({ module: 'm', roles: ['LIVE'], authoritative: false });
    expect(authority.isLiveAuthority).toBe(true);
    expect(authority.label).toBe('Live authority');
    expect(participant.isActive).toBe(true);
    expect(participant.isLiveAuthority).toBe(false);
    expect(participant.label).toBe('Live (non-authoritative)');
  });

  it('always supplies a reason when a capability is not live-usable', () => {
    for (const status of listModuleCapabilities()) {
      if (!status.isActive) expect(status.disabledReason).toBeTruthy();
    }
  });
});

describe('registry invariants the presentation depends on — GAP UI-03', () => {
  it('classifies every registered module', () => {
    expect(listModuleCapabilities()).toHaveLength(TRADING_MODULE_REGISTRY.length);
  });

  it('reports live authority only for modules the registry marks authoritative', () => {
    for (const status of listModuleCapabilities()) {
      if (status.isLiveAuthority) {
        const source = TRADING_MODULE_REGISTRY.find((m) => m.module === status.module);
        expect(source?.authoritative).toBe(true);
        expect(source?.roles).toContain('LIVE');
      }
    }
  });

  // The safety-critical modules must keep their live authority.
  it('preserves Risk Governor and Trade Plan as live authority', () => {
    const statuses = listModuleCapabilities();
    for (const module of ['src/services/riskGovernor.ts', 'src/services/tradePlan.ts']) {
      const status = statuses.find((s) => s.module === module);
      expect(status?.isLiveAuthority).toBe(true);
    }
  });

  // The advanced scanner is the signal authority; execution safety remains owned downstream.
  it('reports the advanced scanner as live signal authority without displacing Risk Governor authority', () => {
    const statuses = listModuleCapabilities();
    const scanner = statuses.find((s) => s.module === 'src/services/scannerCore.ts');
    const risk = statuses.find((s) => s.module === 'src/services/riskGovernor.ts');
    expect(scanner?.isActive).toBe(true);
    expect(scanner?.isLiveAuthority).toBe(true);
    expect(risk?.isLiveAuthority).toBe(true);
  });

  it('exposes no module that is simultaneously planned and active', () => {
    for (const status of listModuleCapabilities()) {
      expect(status.isPlanned && status.isActive).toBe(false);
    }
  });
});
