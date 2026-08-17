/**
 * Authoritative scanner configuration normalization.
 * Applies two-sided QStruct bounds and records every effective override.
 */
import type { ScannerConfig, ScoringWeights } from '../types';

export const QSTRUCT_THRESHOLD_MIN = -0.52;
export const QSTRUCT_THRESHOLD_MAX = -0.30;

/** Versioned replay policy: SMC weight cap until real SMC inputs are connected everywhere. */
export const REPLAY_PROXY_SMC_WEIGHT_CAP = 0.03;
export const REPLAY_PROXY_POLICY_VERSION = 'proxy_replay_v1';

export type ScannerConfigContext = 'live' | 'replay_proxy' | 'replay_production';

export interface ConfigOverride {
  field: string;
  configured: number | string;
  effective: number | string;
  reason: string;
  policyVersion?: string;
}

export interface EffectiveScannerConfig {
  configured: ScannerConfig;
  effective: ScannerConfig;
  overrides: ConfigOverride[];
  context: ScannerConfigContext;
}

export function clampQStructThreshold(value: number): { effective: number; override?: ConfigOverride } {
  if (!Number.isFinite(value)) {
    return {
      effective: QSTRUCT_THRESHOLD_MAX,
      override: {
        field: 'qStructThreshold',
        configured: value,
        effective: QSTRUCT_THRESHOLD_MAX,
        reason: 'Non-finite qStructThreshold replaced with policy maximum (-0.30).',
      },
    };
  }
  if (value > QSTRUCT_THRESHOLD_MAX) {
    return {
      effective: QSTRUCT_THRESHOLD_MAX,
      override: {
        field: 'qStructThreshold',
        configured: value,
        effective: QSTRUCT_THRESHOLD_MAX,
        reason: `qStructThreshold ${value} exceeds policy maximum ${QSTRUCT_THRESHOLD_MAX}; clamped.`,
      },
    };
  }
  if (value < QSTRUCT_THRESHOLD_MIN) {
    return {
      effective: QSTRUCT_THRESHOLD_MIN,
      override: {
        field: 'qStructThreshold',
        configured: value,
        effective: QSTRUCT_THRESHOLD_MIN,
        reason: `qStructThreshold ${value} below policy minimum ${QSTRUCT_THRESHOLD_MIN}; clamped.`,
      },
    };
  }
  return { effective: value };
}

export function normalizeEffectiveScannerConfig(
  config: ScannerConfig,
  context: ScannerConfigContext = 'live',
): EffectiveScannerConfig {
  const overrides: ConfigOverride[] = [];
  const qStruct = clampQStructThreshold(config.qStructThreshold);
  if (qStruct.override) overrides.push(qStruct.override);

  let scoreWeights: ScoringWeights = { ...config.scoreWeights };
  const configuredSmc = config.scoreWeights?.smc ?? 0.05;

  if (context === 'replay_proxy' && configuredSmc > REPLAY_PROXY_SMC_WEIGHT_CAP) {
    scoreWeights = { ...scoreWeights, smc: REPLAY_PROXY_SMC_WEIGHT_CAP };
    overrides.push({
      field: 'scoreWeights.smc',
      configured: configuredSmc,
      effective: REPLAY_PROXY_SMC_WEIGHT_CAP,
      reason: `Replay proxy policy caps SMC weight at ${REPLAY_PROXY_SMC_WEIGHT_CAP} until production SMC inputs are connected.`,
      policyVersion: REPLAY_PROXY_POLICY_VERSION,
    });
  }

  const effective: ScannerConfig = {
    ...config,
    qStructThreshold: qStruct.effective,
    scoreWeights,
  };

  return { configured: config, effective, overrides, context };
}

export function effectiveQStructThreshold(cfg: Pick<ScannerConfig, 'qStructThreshold'>): number {
  return clampQStructThreshold(cfg.qStructThreshold ?? -0.2).effective;
}
