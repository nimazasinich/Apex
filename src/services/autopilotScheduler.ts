/**
 * Smart Autopilot server-side scheduler configuration.
 *
 * Before this module existed the lifecycle had no trigger: `cycleIndex` came
 * from the browser and the "repeat" step of research → backtest → validation →
 * promotion only advanced while an operator kept a workspace tab open.
 *
 * This module resolves — purely, with no I/O and no timers — whether the server
 * should run that same cycle on its own, and how often. The cycle body itself is
 * unchanged and still research/paper-only; scheduling decides *when* it runs,
 * never *what* it is allowed to do.
 *
 * Fail-closed rules:
 *   - Disabled unless the operator opts in explicitly. An unset, empty,
 *     malformed or unrecognized flag value leaves the scheduler OFF.
 *   - The interval is clamped into a sane band so a typo cannot turn the
 *     scheduler into a hot loop against the exchange history APIs.
 *   - Nothing here can grant execution authorization. The scheduler shares the
 *     research-only cycle path with the client route, so it cannot submit an
 *     order, bypass the Risk Governor, or reach DecisionBridge.
 */

export const AUTOPILOT_SCHEDULER_VERSION = 'autopilot_scheduler_v1';

/** Matches the 5-minute cadence the APEX client already uses when armed. */
export const AUTOPILOT_SCHEDULER_DEFAULT_INTERVAL_MS = 5 * 60_000;
export const AUTOPILOT_SCHEDULER_MIN_INTERVAL_MS = 60_000;
export const AUTOPILOT_SCHEDULER_MAX_INTERVAL_MS = 6 * 60 * 60_000;

export const AUTOPILOT_SCHEDULER_DEFAULT_SYMBOL = 'BTC-USDT';
/** Mirrors the per-cycle symbol ceiling enforced by the cycle controls. */
export const AUTOPILOT_SCHEDULER_MAX_SYMBOLS = 6;

export interface AutopilotSchedulerConfig {
  version: typeof AUTOPILOT_SCHEDULER_VERSION;
  /** True only on an explicit, recognized opt-in value. */
  enabled: boolean;
  intervalMs: number;
  maxContexts: number;
  symbols: string[];
  preferredInterval: string;
  /** Why the scheduler is off, or null when it is on. */
  disabledReason: string | null;
}

const TRUTHY = /^(1|true|yes|on)$/i;

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

/**
 * Resolve the scheduler configuration from an environment bag.
 *
 * Pure: given the same environment it always returns the same config, so the
 * default-OFF guarantee is directly testable without starting a server.
 */
export function resolveAutopilotSchedulerConfig(
  env: Record<string, string | undefined>,
): AutopilotSchedulerConfig {
  const raw = (env.APEX_AUTOPILOT_SCHEDULER || '').trim();
  const enabled = TRUTHY.test(raw);

  const disabledReason = enabled
    ? null
    : raw.length === 0
      ? 'APEX_AUTOPILOT_SCHEDULER is not set (server-side Smart Autopilot scheduling is off by default).'
      : `APEX_AUTOPILOT_SCHEDULER="${raw}" is not an opt-in value; set it to "true" to enable server-side scheduling.`;

  const rawInterval = Number((env.APEX_AUTOPILOT_SCHEDULER_INTERVAL_MS || '').trim());
  const intervalMs = Number.isFinite(rawInterval) && rawInterval > 0
    ? clamp(Math.floor(rawInterval), AUTOPILOT_SCHEDULER_MIN_INTERVAL_MS, AUTOPILOT_SCHEDULER_MAX_INTERVAL_MS)
    : AUTOPILOT_SCHEDULER_DEFAULT_INTERVAL_MS;

  const rawContexts = Number((env.APEX_AUTOPILOT_SCHEDULER_MAX_CONTEXTS || '').trim());
  const maxContexts = Number.isFinite(rawContexts) && rawContexts > 0
    ? clamp(Math.floor(rawContexts), 1, 8)
    : 6;

  const parsedSymbols = (env.APEX_AUTOPILOT_SCHEDULER_SYMBOLS || '')
    .split(',')
    .map((value) => value.trim().toUpperCase())
    .filter(Boolean);
  const symbols = parsedSymbols.length
    ? [...new Set(parsedSymbols)].slice(0, AUTOPILOT_SCHEDULER_MAX_SYMBOLS)
    : [AUTOPILOT_SCHEDULER_DEFAULT_SYMBOL];

  const preferredInterval = (env.APEX_AUTOPILOT_SCHEDULER_INTERVAL || '').trim() || '1h';

  return {
    version: AUTOPILOT_SCHEDULER_VERSION,
    enabled,
    intervalMs,
    maxContexts,
    symbols,
    preferredInterval,
    disabledReason,
  };
}
