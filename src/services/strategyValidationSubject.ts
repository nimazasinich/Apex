/**
 * Validation subject identity.
 *
 * WHY THIS EXISTS
 *
 * The walk-forward validation suite is the evidence the automatic-promotion gate
 * relies on. Before this module, that suite decided WHAT it was measuring
 * implicitly: `runStrategyDefinition` treated a missing `applyActiveOptimization`
 * flag as "read whatever profile is currently active from the store". The
 * `/validate` route passed no candidate, so it silently validated the
 * already-promoted profile B while appearing to validate the strategy. The
 * promotion gate, meanwhile, only checked strategy id, version and recency — it
 * never checked that the validation had actually measured the candidate being
 * promoted.
 *
 * The consequence: candidate A could be authorized on evidence produced by
 * profile B. That is the worst class of bug in this codebase, because it does not
 * look like a failure. It looks like a passing gate.
 *
 * THE FIX
 *
 * A validation run must name its subject up front. A subject is fully
 * materialized — concrete parameters and a concrete scanner config, snapshotted
 * once — so no replay inside the suite ever consults the optimization store.
 * `validationReplayInputs` therefore returns `applyActiveOptimization: false` as
 * a LITERAL type: it is not a default that can drift, it is a guarantee the type
 * system enforces at every call site.
 *
 * Pinning the subject also removes a real race. The suite runs many replays; an
 * automatic promotion landing midway through would previously have changed the
 * profile under the later slices, mixing two identities into one report.
 *
 * Every subject carries a fingerprint. The gate compares the fingerprint on the
 * report against the fingerprint of the candidate it is about to promote, so
 * "candidate A was validated as candidate A" is structurally enforced rather
 * than merely intended.
 *
 * PURITY: no clock, no network, no filesystem, no store access. Fingerprints are
 * derived only from the values passed in, so the same subject always yields the
 * same fingerprint across processes and runs.
 */
import type { ScannerConfig, StrategyDefinition } from '../types';

export const STRATEGY_VALIDATION_SUBJECT_VERSION = 'strategy_validation_subject_v1';
export const STRATEGY_VALIDATION_UNIVERSE_VERSION = 'strategy_validation_universe_v1';

export interface StrategyValidationUniverseIdentity {
  version: typeof STRATEGY_VALIDATION_UNIVERSE_VERSION;
  symbols: string[];
  interval: string;
  alignedFrom: number | null;
  alignedTo: number | null;
  candleCounts: Record<string, number>;
  contentFingerprint: string;
}

export function strategyValidationUniverseRequired(strategyId: string): boolean {
  return strategyId === 'adaptive-long-short-trend-portfolio-v1';
}

/**
 * What a validation run is measuring.
 *
 * - `OPTIMIZATION_CANDIDATE` — the winner of the optimization run under
 *   consideration. This is the only kind the automatic-promotion gate accepts.
 * - `ACTIVE_PROFILE` — the currently promoted profile, validated deliberately
 *   (re-checking live-facing settings, or a baseline comparison against a
 *   candidate).
 * - `DEFINITION_DEFAULTS` — the strategy's shipped defaults, with no profile
 *   applied at all.
 */
export type StrategyValidationSubjectKind =
  | 'OPTIMIZATION_CANDIDATE'
  | 'ACTIVE_PROFILE'
  | 'DEFINITION_DEFAULTS';

export interface StrategyValidationSubject {
  kind: StrategyValidationSubjectKind;
  strategyId: string;
  strategyVersion: number;
  /** Fully materialized parameter set. Never merged with store state later. */
  parameters: Record<string, number | string>;
  /**
   * Fully materialized scanner config, or null when the subject deliberately
   * carries none (definition defaults). Null is NOT "look it up" — it means the
   * replay may apply the definition's own overrides, as it always did.
   */
  scannerConfig: ScannerConfig | null;
  /**
   * Provenance only, for the audit trail and baseline comparison. These values
   * never influence the replay.
   */
  activeProfileRevision: number | null;
  sourceReportAt: number | null;
  /** Required for strategies whose semantics depend on a synchronized universe. */
  universeIdentityRequired?: boolean;
  /** Exact normalized universe that generated the replay evidence, when available. */
  universeIdentity?: StrategyValidationUniverseIdentity | null;
}

/** The identity stamped onto a validation report. */
export interface StrategyValidationSubjectIdentity {
  version: typeof STRATEGY_VALIDATION_SUBJECT_VERSION;
  kind: StrategyValidationSubjectKind;
  strategyId: string;
  strategyVersion: number;
  fingerprint: string;
  activeProfileRevision: number | null;
  sourceReportAt: number | null;
  universeIdentityRequired: boolean;
  universeIdentity: StrategyValidationUniverseIdentity | null;
}

/**
 * Exactly what a validation replay is allowed to receive.
 *
 * `applyActiveOptimization` and `scannerConfigAuthoritative` are literal types,
 * not booleans: a validation replay can never be constructed that reads the
 * optimization store, and TypeScript rejects any attempt to widen them.
 */
export interface StrategyValidationReplayInputs {
  parameters: Record<string, number | string>;
  scannerConfig: ScannerConfig | undefined;
  applyActiveOptimization: false;
  scannerConfigAuthoritative: boolean;
}

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

/**
 * Canonical JSON: object keys sorted at every depth, so two structurally equal
 * configs always serialize identically regardless of insertion order.
 */
function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonicalize(value[key])]),
    );
  }
  // Normalize -0 to 0 so sign-of-zero cannot split one identity in two.
  if (typeof value === 'number' && value === 0) return 0;
  return value;
}

/** FNV-1a over the canonical form. Deterministic, dependency-free, portable. */
function hash(input: string): string {
  let value = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    value ^= input.charCodeAt(index);
    value = Math.imul(value, 0x01000193) >>> 0;
  }
  return value.toString(16).padStart(8, '0');
}

export function buildStrategyValidationUniverseIdentity(input: {
  interval: string;
  universeCandles: Record<string, Array<{ time: string; open: number; high: number; low: number; close: number; volume?: number }>>;
}): StrategyValidationUniverseIdentity | null {
  const rowsBySymbol = Object.fromEntries(
    Object.entries(input.universeCandles)
      .map(([rawSymbol, rows]) => {
        const symbol = rawSymbol.trim().toUpperCase();
        const normalized = rows
          .map((row) => ({
            time: row.time,
            timestamp: Date.parse(row.time),
            open: Number(row.open),
            high: Number(row.high),
            low: Number(row.low),
            close: Number(row.close),
            volume: Number(row.volume ?? 0),
          }))
          .filter((row) => Number.isFinite(row.timestamp) && [row.open, row.high, row.low, row.close, row.volume].every(Number.isFinite))
          .sort((left, right) => left.timestamp - right.timestamp);
        return [symbol, normalized] as const;
      })
      .filter(([symbol, rows]) => Boolean(symbol) && rows.length > 0),
  ) as Record<string, Array<{ time: string; timestamp: number; open: number; high: number; low: number; close: number; volume: number }>>;
  const symbols = Object.keys(rowsBySymbol).sort();
  if (symbols.length < 2) return null;
  const timestampSets = symbols.map((symbol) => new Set(rowsBySymbol[symbol].map((row) => row.timestamp)));
  const commonTimestamps = [...timestampSets[0]]
    .filter((timestamp) => timestampSets.every((set) => set.has(timestamp)))
    .sort((left, right) => left - right);
  if (!commonTimestamps.length) return null;
  const common = new Set(commonTimestamps);
  const alignedRows = Object.fromEntries(symbols.map((symbol) => [
    symbol,
    rowsBySymbol[symbol].filter((row) => common.has(row.timestamp)).map(({ timestamp: _timestamp, ...row }) => row),
  ]));
  const contentFingerprint = `${STRATEGY_VALIDATION_UNIVERSE_VERSION}:${hash(JSON.stringify(canonicalize({
    interval: input.interval,
    symbols,
    rows: alignedRows,
  })))}`;
  return {
    version: STRATEGY_VALIDATION_UNIVERSE_VERSION,
    symbols,
    interval: input.interval,
    alignedFrom: commonTimestamps[0] ?? null,
    alignedTo: commonTimestamps.at(-1) ?? null,
    candleCounts: Object.fromEntries(symbols.map((symbol) => [symbol, alignedRows[symbol].length])),
    contentFingerprint,
  };
}

/**
 * Stable identity of what was measured.
 *
 * Deliberately covers strategy identity, the parameter set and the scanner
 * config — the three things that change what a replay does. It deliberately does
 * NOT cover `activeProfileRevision` or `sourceReportAt`: those are provenance,
 * and the same candidate values must fingerprint identically whether they were
 * reached from revision 3 or revision 9.
 */
export function fingerprintStrategyValidationSubject(subject: StrategyValidationSubject): string {
  const canonical = JSON.stringify(canonicalize({
    strategyId: subject.strategyId,
    strategyVersion: subject.strategyVersion,
    parameters: subject.parameters,
    scannerConfig: subject.scannerConfig,
    universeIdentityRequired: subject.universeIdentityRequired === true,
    universeIdentity: subject.universeIdentity ?? null,
  }));
  return `${STRATEGY_VALIDATION_SUBJECT_VERSION}:${hash(canonical)}`;
}

export function identifyStrategyValidationSubject(
  subject: StrategyValidationSubject,
): StrategyValidationSubjectIdentity {
  return {
    version: STRATEGY_VALIDATION_SUBJECT_VERSION,
    kind: subject.kind,
    strategyId: subject.strategyId,
    strategyVersion: subject.strategyVersion,
    fingerprint: fingerprintStrategyValidationSubject(subject),
    activeProfileRevision: subject.activeProfileRevision,
    sourceReportAt: subject.sourceReportAt,
    universeIdentityRequired: subject.universeIdentityRequired === true,
    universeIdentity: subject.universeIdentity ?? null,
  };
}

/**
 * Build the replay arguments for one slice of the validation suite.
 *
 * `applyActiveOptimization` is always false — the subject is already
 * materialized, so consulting the store again could only reintroduce the bug
 * this module exists to prevent.
 *
 * `overrides` carries the stability-neighbour perturbations. They are layered
 * ON TOP of the subject's parameters, so a neighbour run still perturbs the
 * candidate under test rather than falling back to some other identity.
 */
export function validationReplayInputs(
  subject: StrategyValidationSubject,
  overrides?: Record<string, number | string>,
): StrategyValidationReplayInputs {
  return {
    parameters: { ...subject.parameters, ...(overrides || {}) },
    scannerConfig: subject.scannerConfig ?? undefined,
    applyActiveOptimization: false,
    // An explicit config is authoritative: it already includes whatever the
    // definition contributed when the candidate was built, so re-applying the
    // definition overrides would double-apply them. With no explicit config
    // there is nothing authoritative to honour, and the definition's own
    // overrides must still apply exactly as they always have.
    scannerConfigAuthoritative: subject.scannerConfig !== null,
  };
}

/** The optimization winner under consideration. The only promotable subject. */
export function optimizationCandidateSubject(input: {
  definition: Pick<StrategyDefinition, 'strategyId' | 'version'>;
  parameters: Record<string, number | string>;
  scannerConfig: ScannerConfig | null;
  sourceReportAt: number;
  /** Revision active at the time, recorded for the baseline comparison only. */
  activeProfileRevision: number | null;
  universeIdentity?: StrategyValidationUniverseIdentity | null;
}): StrategyValidationSubject {
  return {
    kind: 'OPTIMIZATION_CANDIDATE',
    strategyId: input.definition.strategyId,
    strategyVersion: input.definition.version,
    parameters: { ...input.parameters },
    scannerConfig: input.scannerConfig,
    activeProfileRevision: input.activeProfileRevision,
    sourceReportAt: input.sourceReportAt,
    universeIdentityRequired: strategyValidationUniverseRequired(input.definition.strategyId),
    universeIdentity: input.universeIdentity ?? null,
  };
}

/** The currently promoted profile, snapshotted and validated deliberately. */
export function activeProfileSubject(input: {
  definition: Pick<StrategyDefinition, 'strategyId' | 'version'>;
  profile: { revision: number; sourceReportAt: number; parameters: Record<string, number | string>; scannerConfig: ScannerConfig };
}): StrategyValidationSubject {
  return {
    kind: 'ACTIVE_PROFILE',
    strategyId: input.definition.strategyId,
    strategyVersion: input.definition.version,
    parameters: { ...input.profile.parameters },
    scannerConfig: input.profile.scannerConfig,
    activeProfileRevision: input.profile.revision,
    sourceReportAt: input.profile.sourceReportAt,
    universeIdentityRequired: false,
    universeIdentity: null,
  };
}

/** The strategy's shipped defaults, with no optimization profile applied. */
export function definitionDefaultsSubject(
  definition: Pick<StrategyDefinition, 'strategyId' | 'version' | 'parameters'>,
): StrategyValidationSubject {
  return {
    kind: 'DEFINITION_DEFAULTS',
    strategyId: definition.strategyId,
    strategyVersion: definition.version,
    parameters: Object.fromEntries(definition.parameters.map((parameter) => [parameter.key, parameter.default])),
    scannerConfig: null,
    activeProfileRevision: null,
    sourceReportAt: null,
    universeIdentityRequired: strategyValidationUniverseRequired(definition.strategyId),
    universeIdentity: null,
  };
}

/**
 * Report every way a foreign profile's values survived into a subject.
 *
 * Used by the identity regression test to prove that validating candidate A
 * carries none of active profile B, and available to callers that want a
 * defensive runtime check. Keys whose values legitimately agree are not leaks —
 * only a key where the subject still carries the foreign value while the
 * intended value differs is reported.
 */
export function detectValidationSubjectLeak(
  subject: StrategyValidationSubject,
  foreign: { parameters: Record<string, number | string>; scannerConfig?: ScannerConfig | null },
  intended: { parameters: Record<string, number | string> },
): string[] {
  const leaks: string[] = [];
  for (const [key, foreignValue] of Object.entries(foreign.parameters)) {
    const intendedValue = intended.parameters[key];
    const actual = subject.parameters[key];
    if (intendedValue === undefined) {
      // A key the intended identity does not define at all must not appear.
      if (actual !== undefined) leaks.push(`parameter_absent_in_intended:${key}`);
      continue;
    }
    if (intendedValue !== foreignValue && actual === foreignValue) {
      leaks.push(`parameter_from_foreign_profile:${key}`);
    }
  }
  if (foreign.scannerConfig && subject.scannerConfig === foreign.scannerConfig) {
    leaks.push('scanner_config_identity_from_foreign_profile');
  }
  return leaks;
}
