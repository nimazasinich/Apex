/**
 * Capability presentation truth (GAP UI-03).
 *
 * Two registries already declare what is actually operational:
 *   - `PROVIDER_CAPABILITIES` (providerRouter) — which venues have an
 *     executable implementation, and which are merely PLANNED.
 *   - `TRADING_MODULE_REGISTRY` — which modules hold live authority, and which
 *     are shadow / replay / research-only / planned / deprecated.
 *
 * Neither had a presentation layer, so "is this thing actually live?" was
 * re-answered ad hoc at each call site. This module answers it once.
 *
 * It deliberately does NOT introduce a new role vocabulary and does NOT read or
 * modify routing, provider authority, or execution gating. It only classifies
 * the declared roles for display.
 *
 * Fail-closed rule: anything not provably active is reported as not active.
 */
import {
  PROVIDER_CAPABILITIES,
  type PublicProviderId,
  type ProviderTransport,
} from '../contracts/providerCapabilities';
import {
  TRADING_MODULE_REGISTRY,
  type TradingModuleRegistration,
  type TradingModuleRole,
} from '../services/tradingModuleRegistry';

/** Roles that must never be presented as active live capability. */
export const NON_ACTIVE_MODULE_ROLES: readonly TradingModuleRole[] = [
  'PLANNED',
  'DEPRECATED',
] as const;

/** Roles that run, but only for observation/analysis — never live authority. */
export const RESEARCH_ONLY_MODULE_ROLES: readonly TradingModuleRole[] = [
  'OFFLINE_ANALYTICS',
  'STRESS_ONLY',
  'REPLAY',
] as const;

export interface ModuleCapabilityStatus {
  module: string;
  roles: readonly TradingModuleRole[];
  /** Participates in the live decision path at all. */
  isActive: boolean;
  /** Holds live decision authority. Strictly narrower than `isActive`. */
  isLiveAuthority: boolean;
  /** Runs alongside live, but cannot influence a live decision. */
  isShadow: boolean;
  /** Analysis/replay/stress only — not wired to live or replay gates. */
  isResearchOnly: boolean;
  /** Not implemented for operational use, or retired. */
  isPlanned: boolean;
  isDeprecated: boolean;
  /** Operator-facing label, safe to render directly. */
  label: string;
  /**
   * Why this capability is not available for live use, or undefined when it is.
   * Named to match the existing `TabOption.disabledReason` convention.
   */
  disabledReason?: string;
}

function has(roles: readonly TradingModuleRole[], role: TradingModuleRole): boolean {
  return roles.includes(role);
}

export function describeModuleCapability(
  registration: Pick<TradingModuleRegistration, 'module' | 'roles' | 'authoritative'>,
): ModuleCapabilityStatus {
  const roles = registration.roles ?? [];
  const isPlanned = has(roles, 'PLANNED');
  const isDeprecated = has(roles, 'DEPRECATED');
  const isShadow = has(roles, 'SHADOW');

  // Fail closed: a contradictory PLANNED/DEPRECATED marking always wins over a
  // LIVE marking, so a half-finished edit can never advertise live capability.
  const blockedFromLive = isPlanned || isDeprecated;
  const isActive = has(roles, 'LIVE') && !blockedFromLive;
  const isLiveAuthority = isActive && registration.authoritative === true;

  const isResearchOnly =
    !isActive &&
    !isShadow &&
    !blockedFromLive &&
    roles.some((role) => RESEARCH_ONLY_MODULE_ROLES.includes(role));

  let label: string;
  let disabledReason: string | undefined;

  if (isPlanned) {
    label = 'Planned';
    disabledReason = 'Planned capability with no operational consumer.';
  } else if (isDeprecated) {
    label = 'Deprecated';
    disabledReason = 'Retired capability, no longer operational.';
  } else if (isLiveAuthority) {
    label = 'Live authority';
  } else if (isActive) {
    label = 'Live (non-authoritative)';
  } else if (isShadow) {
    label = 'Shadow only';
    disabledReason = 'Shadow-only until an audited promotion is approved.';
  } else if (isResearchOnly) {
    label = 'Research only';
    disabledReason = 'Not connected to live or replay execution gates.';
  } else {
    label = 'Support';
    disabledReason = 'Not a live decision capability.';
  }

  return {
    module: registration.module,
    roles,
    isActive,
    isLiveAuthority,
    isShadow,
    isResearchOnly,
    isPlanned,
    isDeprecated,
    label,
    disabledReason,
  };
}

export interface ProviderCapabilityStatus {
  id: PublicProviderId;
  role: (typeof PROVIDER_CAPABILITIES)[PublicProviderId]['role'];
  transport: ProviderTransport;
  registered: boolean;
  /** True only when the venue has an executable implementation. */
  isActive: boolean;
  isPlanned: boolean;
  label: string;
  disabledReason?: string;
}

/**
 * Classify a public provider for display.
 *
 * A PLANNED venue is reported as planned and never as an available failover,
 * regardless of whether its name appears in any array.
 */
export function describeProviderCapability(id: PublicProviderId): ProviderCapabilityStatus {
  const capability = PROVIDER_CAPABILITIES[id];
  const isPlanned = capability.role === 'PLANNED';

  // Every condition must hold; a single missing piece means "not usable".
  const isActive =
    !isPlanned &&
    capability.registered === true &&
    capability.transport !== 'NONE' &&
    capability.categories.length > 0;

  return {
    id,
    role: capability.role,
    transport: capability.transport,
    registered: capability.registered,
    isActive,
    isPlanned,
    label: isActive ? capability.role : isPlanned ? 'Planned' : 'Unavailable',
    disabledReason: isActive
      ? undefined
      : isPlanned
        ? 'Planned venue with no executable implementation.'
        : 'No usable transport or category coverage.',
  };
}

/** Every declared provider, classified. */
export function listProviderCapabilities(): ProviderCapabilityStatus[] {
  return (Object.keys(PROVIDER_CAPABILITIES) as PublicProviderId[]).map(describeProviderCapability);
}

/** Every registered trading module, classified. */
export function listModuleCapabilities(): ModuleCapabilityStatus[] {
  return TRADING_MODULE_REGISTRY.map(describeModuleCapability);
}

export interface LiveEligibilityEvidence {
  dataState: 'live' | 'degraded' | 'not_configured' | 'unavailable' | null | undefined;
  observedAt: number | null | undefined;
  /** A verified authority decision owned by the supplying subsystem. */
  authorityVerified: boolean;
  now?: number;
  maxAgeMs?: number;
}

/**
 * One fail-closed UI rule for the literal `LIVE` label. Connectivity, a score,
 * or a non-empty payload is not sufficient: the supplying subsystem must also
 * assert authority and provide a current source observation.
 */
export function isVerifiedLiveEligibility(evidence: LiveEligibilityEvidence): boolean {
  if (!evidence.authorityVerified || evidence.dataState !== 'live') return false;
  if (!Number.isFinite(evidence.observedAt)) return false;
  const now = evidence.now ?? Date.now();
  const maxAgeMs = evidence.maxAgeMs ?? 120_000;
  const ageMs = now - Number(evidence.observedAt);
  return Number.isFinite(ageMs) && ageMs >= 0 && ageMs <= maxAgeMs;
}
