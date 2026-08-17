import type { TradeDirection } from '../../types';
import type { BacktestInterval, BacktestRiskProfile } from './backtestingTypes';

/**
 * Browser-local persistence for the Backtesting Lab.
 *
 * Two independent, versioned stores:
 *   - Named replay presets  (apex:backtest-presets:v1)
 *   - Per-run evidence notes (apex:backtest-notes:v1)
 *
 * Everything here is intentionally local-only (this browser). No server
 * contract is involved, nothing is fabricated, and all reads are defensively
 * validated so a corrupt/foreign payload can never crash the page.
 */

export const BACKTEST_PRESETS_KEY = 'apex:backtest-presets:v1';
export const BACKTEST_NOTES_KEY = 'apex:backtest-notes:v1';

const MAX_PRESETS = 24;
const MAX_NOTES = 200;
const MAX_NOTE_LENGTH = 4000;

export interface BacktestPresetConfig {
  strategyId: string;
  symbol: string;
  direction: TradeDirection;
  interval: BacktestInterval;
  bars: number;
  maxHoldBars: number;
  capital: number;
  riskProfile: BacktestRiskProfile;
  commissionPct: number;
  slippagePct: number;
  fundingPct: number;
  parameters: Record<string, number | string>;
}

export interface BacktestSavedPreset {
  id: string;
  name: string;
  savedAt: number;
  config: BacktestPresetConfig;
}

export interface BacktestNote {
  runId: string;
  text: string;
  updatedAt: number;
  strategyId?: string;
  symbol?: string;
  direction?: TradeDirection;
  interval?: string;
}

function safeStorage(): Storage | null {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

function makeId(): string {
  try {
    const cryptoObj = typeof crypto !== 'undefined' ? crypto : undefined;
    if (cryptoObj && typeof cryptoObj.randomUUID === 'function') return cryptoObj.randomUUID();
  } catch {
    /* fall through */
  }
  return `p_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

const INTERVALS: BacktestInterval[] = ['5m', '15m', '1h', '4h', '1d'];
const RISK_PROFILES: BacktestRiskProfile[] = ['aggressive', 'balanced', 'conservative'];

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function sanitizeParameters(value: unknown): Record<string, number | string> {
  if (!value || typeof value !== 'object') return {};
  const out: Record<string, number | string> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (typeof raw === 'number' && Number.isFinite(raw)) out[key] = raw;
    else if (typeof raw === 'string') out[key] = raw;
  }
  return out;
}

function validatePreset(entry: unknown): BacktestSavedPreset | null {
  if (!entry || typeof entry !== 'object') return null;
  const row = entry as Record<string, unknown>;

  // Current named-preset shape.
  const nestedConfig = row.config as Record<string, unknown> | undefined;
  const config = nestedConfig && typeof nestedConfig === 'object' ? nestedConfig : row;

  if (typeof row.id !== 'string') return null;
  if (typeof config.strategyId !== 'string' || typeof config.symbol !== 'string') return null;
  if (config.direction !== 'LONG' && config.direction !== 'SHORT') return null;
  if (!INTERVALS.includes(config.interval as BacktestInterval)) return null;
  if (!RISK_PROFILES.includes(config.riskProfile as BacktestRiskProfile)) return null;
  if (!isFiniteNumber(config.bars) || !isFiniteNumber(config.maxHoldBars) || !isFiniteNumber(config.capital)) return null;
  if (!isFiniteNumber(config.commissionPct) || !isFiniteNumber(config.slippagePct) || !isFiniteNumber(config.fundingPct)) return null;

  // Backward compatibility: the immediately previous Backtesting Lab stored
  // flat, unnamed presets under the same v1 key. Preserve those entries and
  // surface them in the new load/delete UI instead of silently discarding them.
  const legacyName = `${config.symbol} · ${String(config.direction).toLowerCase()} · ${String(config.interval)}`;
  const name = typeof row.name === 'string' && row.name.trim() ? row.name.trim().slice(0, 80) : legacyName;
  const legacyCreatedAt = isFiniteNumber(row.createdAt) ? row.createdAt : Date.now();

  return {
    id: row.id,
    name,
    savedAt: isFiniteNumber(row.savedAt) ? row.savedAt : legacyCreatedAt,
    config: {
      strategyId: config.strategyId,
      symbol: config.symbol,
      direction: config.direction,
      interval: config.interval as BacktestInterval,
      bars: config.bars,
      maxHoldBars: config.maxHoldBars,
      capital: config.capital,
      riskProfile: config.riskProfile as BacktestRiskProfile,
      commissionPct: config.commissionPct,
      slippagePct: config.slippagePct,
      fundingPct: config.fundingPct,
      parameters: sanitizeParameters(config.parameters),
    },
  };
}

export function loadPresets(): BacktestSavedPreset[] {
  const storage = safeStorage();
  if (!storage) return [];
  try {
    const parsed = JSON.parse(storage.getItem(BACKTEST_PRESETS_KEY) || '[]') as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(validatePreset)
      .filter((entry): entry is BacktestSavedPreset => entry !== null)
      .slice(0, MAX_PRESETS);
  } catch {
    return [];
  }
}

function persistPresets(presets: BacktestSavedPreset[]): BacktestSavedPreset[] {
  const storage = safeStorage();
  const trimmed = presets.slice(0, MAX_PRESETS);
  if (storage) {
    try {
      storage.setItem(BACKTEST_PRESETS_KEY, JSON.stringify(trimmed));
    } catch {
      /* quota or serialization failure — keep in-memory copy */
    }
  }
  return trimmed;
}

/** Insert a new preset (or replace one that shares the same trimmed name). Returns the full updated list. */
export function savePreset(existing: BacktestSavedPreset[], name: string, config: BacktestPresetConfig): BacktestSavedPreset[] {
  const cleanName = name.trim().slice(0, 80) || `Preset ${new Date().toLocaleString()}`;
  const entry: BacktestSavedPreset = { id: makeId(), name: cleanName, savedAt: Date.now(), config };
  const deduped = existing.filter((preset) => preset.name.toLowerCase() !== cleanName.toLowerCase());
  return persistPresets([entry, ...deduped]);
}

export function deletePreset(existing: BacktestSavedPreset[], id: string): BacktestSavedPreset[] {
  return persistPresets(existing.filter((preset) => preset.id !== id));
}

function validateNote(entry: unknown): BacktestNote | null {
  if (!entry || typeof entry !== 'object') return null;
  const row = entry as Record<string, unknown>;
  if (typeof row.runId !== 'string' || typeof row.text !== 'string') return null;
  return {
    runId: row.runId,
    text: row.text.slice(0, MAX_NOTE_LENGTH),
    updatedAt: isFiniteNumber(row.updatedAt) ? row.updatedAt : Date.now(),
    strategyId: typeof row.strategyId === 'string' ? row.strategyId : undefined,
    symbol: typeof row.symbol === 'string' ? row.symbol : undefined,
    direction: row.direction === 'LONG' || row.direction === 'SHORT' ? row.direction : undefined,
    interval: typeof row.interval === 'string' ? row.interval : undefined,
  };
}

export function loadNotes(): Record<string, BacktestNote> {
  const storage = safeStorage();
  if (!storage) return {};
  try {
    const parsed = JSON.parse(storage.getItem(BACKTEST_NOTES_KEY) || '{}') as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out: Record<string, BacktestNote> = {};
    for (const value of Object.values(parsed as Record<string, unknown>)) {
      const note = validateNote(value);
      if (note) out[note.runId] = note;
    }
    return out;
  } catch {
    return {};
  }
}

function persistNotes(notes: Record<string, BacktestNote>): Record<string, BacktestNote> {
  const storage = safeStorage();
  // Cap the number of retained notes, keeping the most recently updated.
  const entries = Object.values(notes).sort((a, b) => b.updatedAt - a.updatedAt).slice(0, MAX_NOTES);
  const capped: Record<string, BacktestNote> = {};
  for (const note of entries) capped[note.runId] = note;
  if (storage) {
    try {
      storage.setItem(BACKTEST_NOTES_KEY, JSON.stringify(capped));
    } catch {
      /* quota or serialization failure — keep in-memory copy */
    }
  }
  return capped;
}

/** Upsert (or, when text is blank, delete) the note for a run. Returns the full updated map. */
export function saveNote(
  existing: Record<string, BacktestNote>,
  runId: string,
  text: string,
  context?: Pick<BacktestNote, 'strategyId' | 'symbol' | 'direction' | 'interval'>,
): Record<string, BacktestNote> {
  if (!runId) return existing;
  const next = { ...existing };
  const trimmed = text.slice(0, MAX_NOTE_LENGTH);
  if (!trimmed.trim()) {
    delete next[runId];
    return persistNotes(next);
  }
  next[runId] = {
    runId,
    text: trimmed,
    updatedAt: Date.now(),
    strategyId: context?.strategyId,
    symbol: context?.symbol,
    direction: context?.direction,
    interval: context?.interval,
  };
  return persistNotes(next);
}
