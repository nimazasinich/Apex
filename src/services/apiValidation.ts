export interface ValidationIssue {
  field: string;
  code: 'required' | 'invalid_type' | 'invalid_enum' | 'out_of_range' | 'invalid_format' | 'unknown_field' | 'too_large';
  message: string;
}

export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; issues: ValidationIssue[] };

export type BacktestInterval = '5m' | '15m' | '1h' | '4h' | '1d';
export type BacktestDirection = 'LONG' | 'SHORT';

export interface BacktestQueryInput {
  strategyId: string;
  symbol: string;
  direction: BacktestDirection;
  interval: BacktestInterval;
  requestedBars: number;
  maxHoldBars: number;
  commissionPctPerSide: number;
  slippagePctPerSide: number;
  fundingPctEstimate: number;
  parameters?: Record<string, number | string>;
}

const BACKTEST_INTERVALS = new Set<BacktestInterval>(['5m', '15m', '1h', '4h', '1d']);
const DIRECTIONS = new Set<BacktestDirection>(['LONG', 'SHORT']);
const SYMBOL_PATTERN = /^[A-Z0-9]{2,20}(?:[-_](?:USDT|USD|USDC)|USDTM?)$/;

function firstValue(value: unknown): unknown {
  return Array.isArray(value) ? value[0] : value;
}

function readString(record: Record<string, unknown>, field: string, fallback?: string): string | undefined {
  const raw = firstValue(record[field]);
  if (raw === undefined || raw === null || raw === '') return fallback;
  return typeof raw === 'string' || typeof raw === 'number' ? String(raw).trim() : undefined;
}

function parseFiniteNumber(
  record: Record<string, unknown>,
  field: string,
  fallback: number,
  min: number,
  max: number,
  issues: ValidationIssue[],
  integer = false,
): number {
  const raw = firstValue(record[field]);
  if (raw === undefined || raw === null || raw === '') return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    issues.push({ field, code: 'invalid_type', message: `${field} must be a finite number.` });
    return fallback;
  }
  if (parsed < min || parsed > max) {
    issues.push({ field, code: 'out_of_range', message: `${field} must be between ${min} and ${max}.` });
    return fallback;
  }
  if (integer && !Number.isInteger(parsed)) {
    issues.push({ field, code: 'invalid_type', message: `${field} must be an integer.` });
    return fallback;
  }
  return parsed;
}

function validateSymbol(raw: string | undefined, field: string, fallback: string, issues: ValidationIssue[]): string {
  const symbol = (raw || fallback).toUpperCase();
  if (symbol.length > 32 || !SYMBOL_PATTERN.test(symbol)) {
    issues.push({ field, code: 'invalid_format', message: `${field} must be a supported USD/USDT market symbol.` });
    return fallback;
  }
  return symbol;
}

function validateDirection(raw: string | undefined, issues: ValidationIssue[]): BacktestDirection {
  const direction = (raw || 'LONG').toUpperCase() as BacktestDirection;
  if (!DIRECTIONS.has(direction)) {
    issues.push({ field: 'direction', code: 'invalid_enum', message: 'direction must be LONG or SHORT.' });
    return 'LONG';
  }
  return direction;
}

function validateInterval(raw: string | undefined, issues: ValidationIssue[]): BacktestInterval {
  const interval = (raw || '1h') as BacktestInterval;
  if (!BACKTEST_INTERVALS.has(interval)) {
    issues.push({ field: 'interval', code: 'invalid_enum', message: 'interval must be one of 5m, 15m, 1h, 4h, or 1d.' });
    return '1h';
  }
  return interval;
}

function parseParameters(raw: unknown, issues: ValidationIssue[]): Record<string, number | string> | undefined {
  const value = firstValue(raw);
  if (value === undefined || value === null || value === '') return undefined;
  let parsed: unknown = value;
  if (typeof value === 'string') {
    if (value.length > 8_192) {
      issues.push({ field: 'parameters', code: 'too_large', message: 'parameters exceeds the 8 KiB limit.' });
      return undefined;
    }
    try {
      parsed = JSON.parse(value);
    } catch {
      issues.push({ field: 'parameters', code: 'invalid_format', message: 'parameters must be valid JSON.' });
      return undefined;
    }
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    issues.push({ field: 'parameters', code: 'invalid_type', message: 'parameters must be an object.' });
    return undefined;
  }
  const entries = Object.entries(parsed as Record<string, unknown>);
  if (entries.length > 32) {
    issues.push({ field: 'parameters', code: 'too_large', message: 'parameters may contain at most 32 entries.' });
    return undefined;
  }
  const result: Record<string, number | string> = {};
  for (const [key, entry] of entries) {
    if (!/^[A-Za-z][A-Za-z0-9_.-]{0,63}$/.test(key)) {
      issues.push({ field: `parameters.${key}`, code: 'invalid_format', message: 'Parameter keys must be safe identifiers.' });
      continue;
    }
    if (typeof entry === 'number') {
      if (!Number.isFinite(entry)) issues.push({ field: `parameters.${key}`, code: 'invalid_type', message: 'Numeric parameters must be finite.' });
      else result[key] = entry;
    } else if (typeof entry === 'string' && entry.length <= 256) {
      result[key] = entry;
    } else {
      issues.push({ field: `parameters.${key}`, code: 'invalid_type', message: 'Parameters must be finite numbers or strings up to 256 characters.' });
    }
  }
  return result;
}

export function validateBacktestQuery(input: Record<string, unknown>): ValidationResult<BacktestQueryInput> {
  const issues: ValidationIssue[] = [];
  const strategyId = readString(input, 'strategy', 'opening-range-vwap-rvol-breakout-v1') || 'opening-range-vwap-rvol-breakout-v1';
  if (!/^[a-z0-9][a-z0-9-]{1,95}$/i.test(strategyId)) {
    issues.push({ field: 'strategy', code: 'invalid_format', message: 'strategy must be a registered strategy identifier.' });
  }
  const symbol = validateSymbol(readString(input, 'symbol'), 'symbol', 'BTC-USDT', issues);
  const direction = validateDirection(readString(input, 'direction'), issues);
  const interval = validateInterval(readString(input, 'interval'), issues);
  const requestedBars = parseFiniteNumber(input, input.bars === undefined ? 'lookback' : 'bars', 2_000, 200, 5_000, issues, true);
  const maxHoldBars = parseFiniteNumber(input, 'maxBars', 72, 1, 240, issues, true);
  const commissionPctPerSide = parseFiniteNumber(input, 'commissionPct', 0.04, 0, 5, issues);
  const slippagePctPerSide = parseFiniteNumber(input, 'slippagePct', 0.05, 0, 5, issues);
  const fundingPctEstimate = parseFiniteNumber(input, 'fundingPct', 0.01, 0, 5, issues);
  const parameters = parseParameters(input.parameters, issues);
  return issues.length ? { ok: false, issues } : {
    ok: true,
    value: { strategyId, symbol, direction, interval, requestedBars, maxHoldBars, commissionPctPerSide, slippagePctPerSide, fundingPctEstimate, parameters },
  };
}

export interface StrategyOptimizationInput {
  symbol: string;
  direction: BacktestDirection;
  interval: BacktestInterval;
  maxHoldBars: number;
  requestedBars: number;
  coarseCandidates: number;
  refinementCandidates: number;
  maxConcurrent: number;
  autoPromote: boolean;
  commissionPctPerSide: number;
  slippagePctPerSide: number;
  fundingPctEstimate: number;
}

function parseBoolean(value: unknown, fallback: boolean): boolean {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
}

export function validateStrategyOptimizationInput(input: Record<string, unknown>): ValidationResult<StrategyOptimizationInput> {
  const issues: ValidationIssue[] = [];
  const allowed = new Set([
    'symbol', 'direction', 'interval', 'maxBars', 'bars', 'lookback',
    'coarseCandidates', 'refinementCandidates', 'maxConcurrent', 'autoPromote',
    'commissionPct', 'slippagePct', 'fundingPct',
  ]);
  for (const key of Object.keys(input)) {
    if (!allowed.has(key)) issues.push({ field: key, code: 'unknown_field', message: `${key} is not accepted by this endpoint.` });
  }
  const symbol = validateSymbol(readString(input, 'symbol'), 'symbol', 'BTC-USDT', issues);
  const direction = validateDirection(readString(input, 'direction'), issues);
  const interval = validateInterval(readString(input, 'interval'), issues);
  const maxHoldBars = parseFiniteNumber(input, 'maxBars', 72, 1, 240, issues, true);
  const requestedBars = parseFiniteNumber(input, input.bars === undefined ? 'lookback' : 'bars', 2500, 1000, 5000, issues, true);
  const coarseCandidates = parseFiniteNumber(input, 'coarseCandidates', 28, 8, 64, issues, true);
  const refinementCandidates = parseFiniteNumber(input, 'refinementCandidates', 12, 0, 32, issues, true);
  const maxConcurrent = parseFiniteNumber(input, 'maxConcurrent', 4, 1, 8, issues, true);
  const commissionPctPerSide = parseFiniteNumber(input, 'commissionPct', 0.04, 0, 5, issues);
  const slippagePctPerSide = parseFiniteNumber(input, 'slippagePct', 0.05, 0, 5, issues);
  const fundingPctEstimate = parseFiniteNumber(input, 'fundingPct', 0.01, 0, 5, issues);
  const autoPromote = parseBoolean(input.autoPromote, false);
  return issues.length ? { ok: false, issues } : {
    ok: true,
    value: { symbol, direction, interval, maxHoldBars, requestedBars, coarseCandidates, refinementCandidates, maxConcurrent, autoPromote, commissionPctPerSide, slippagePctPerSide, fundingPctEstimate },
  };
}

export interface StrategyValidationInput {
  symbol: string;
  direction: BacktestDirection;
  interval: BacktestInterval;
  maxHoldBars: number;
  commissionPctPerSide: number;
  slippagePctPerSide: number;
  fundingPctEstimate: number;
}

export function validateStrategyValidationInput(input: Record<string, unknown>): ValidationResult<StrategyValidationInput> {
  const issues: ValidationIssue[] = [];
  const allowed = new Set(['symbol', 'direction', 'interval', 'maxBars', 'commissionPct', 'slippagePct', 'fundingPct']);
  for (const key of Object.keys(input)) {
    if (!allowed.has(key)) issues.push({ field: key, code: 'unknown_field', message: `${key} is not accepted by this endpoint.` });
  }
  const symbol = validateSymbol(readString(input, 'symbol'), 'symbol', 'BTC-USDT', issues);
  const direction = validateDirection(readString(input, 'direction'), issues);
  const interval = validateInterval(readString(input, 'interval'), issues);
  const maxHoldBars = parseFiniteNumber(input, 'maxBars', 24, 1, 240, issues, true);
  const commissionPctPerSide = parseFiniteNumber(input, 'commissionPct', 0.04, 0, 5, issues);
  const slippagePctPerSide = parseFiniteNumber(input, 'slippagePct', 0.05, 0, 5, issues);
  const fundingPctEstimate = parseFiniteNumber(input, 'fundingPct', 0.01, 0, 5, issues);
  return issues.length ? { ok: false, issues } : {
    ok: true,
    value: { symbol, direction, interval, maxHoldBars, commissionPctPerSide, slippagePctPerSide, fundingPctEstimate },
  };
}


export type ProductionReplayInterval = '1m' | '3m' | '5m' | '15m' | '30m' | '1h' | '4h' | '1d';

export interface ProductionReplayRequestInput {
  symbol: string;
  direction: BacktestDirection;
  interval: ProductionReplayInterval;
  maxHoldBars: number;
  candles: Array<Record<string, unknown>>;
  inputs: Array<Record<string, unknown>>;
}

const PRODUCTION_REPLAY_INTERVALS = new Set<ProductionReplayInterval>(['1m', '3m', '5m', '15m', '30m', '1h', '4h', '1d']);
const PRODUCTION_REPLAY_ALLOWED_FIELDS = new Set(['candles', 'inputs', 'symbol', 'direction', 'interval', 'maxBars']);
const MAX_PRODUCTION_REPLAY_ROWS = 5_000;
const MAX_PRODUCTION_REPLAY_ISSUES = 50;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function addIssue(issues: ValidationIssue[], issue: ValidationIssue): void {
  if (issues.length < MAX_PRODUCTION_REPLAY_ISSUES) issues.push(issue);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function validateProductionCandle(row: unknown, index: number, issues: ValidationIssue[]): row is Record<string, unknown> {
  const field = `candles[${index}]`;
  if (!isRecord(row)) {
    addIssue(issues, { field, code: 'invalid_type', message: `${field} must be an object.` });
    return false;
  }

  const time = row.time;
  if (typeof time !== 'string' || !time.trim() || !Number.isFinite(Date.parse(time))) {
    addIssue(issues, { field: `${field}.time`, code: 'invalid_format', message: `${field}.time must be an ISO-compatible timestamp.` });
  }

  for (const name of ['open', 'high', 'low', 'close', 'volume'] as const) {
    const value = row[name];
    if (!isFiniteNumber(value)) {
      addIssue(issues, { field: `${field}.${name}`, code: 'invalid_type', message: `${field}.${name} must be a finite number.` });
      continue;
    }
    if ((name === 'volume' && value < 0) || (name !== 'volume' && value <= 0)) {
      addIssue(issues, { field: `${field}.${name}`, code: 'out_of_range', message: `${field}.${name} must be ${name === 'volume' ? 'non-negative' : 'greater than zero'}.` });
    }
  }

  const open = row.open;
  const high = row.high;
  const low = row.low;
  const close = row.close;
  if (isFiniteNumber(open) && isFiniteNumber(high) && isFiniteNumber(low) && isFiniteNumber(close)) {
    if (high < low || high < open || high < close || low > open || low > close) {
      addIssue(issues, { field, code: 'invalid_format', message: `${field} contains inconsistent OHLC bounds.` });
    }
  }
  return true;
}

function validateProductionBarInput(row: unknown, index: number, issues: ValidationIssue[]): row is Record<string, unknown> {
  const field = `inputs[${index}]`;
  if (!isRecord(row)) {
    addIssue(issues, { field, code: 'invalid_type', message: `${field} must be an object.` });
    return false;
  }

  const timestamp = row.timestamp;
  const timestampOk = typeof timestamp === 'number'
    ? Number.isFinite(timestamp) && timestamp > 0
    : typeof timestamp === 'string' && timestamp.trim().length > 0 && Number.isFinite(Date.parse(timestamp));
  if (!timestampOk) {
    addIssue(issues, { field: `${field}.timestamp`, code: 'invalid_format', message: `${field}.timestamp must be a finite epoch value or ISO-compatible timestamp.` });
  }

  const requiredNumbers = ['bidDepthUsd', 'askDepthUsd', 'imbalancePct', 'obi', 'signedVolumeDelta', 'spread', 'microPrice', 'fundingRate'] as const;
  for (const name of requiredNumbers) {
    const value = row[name];
    if (!isFiniteNumber(value)) {
      addIssue(issues, { field: `${field}.${name}`, code: 'invalid_type', message: `${field}.${name} must be a finite number.` });
      continue;
    }
    if ((name === 'bidDepthUsd' || name === 'askDepthUsd' || name === 'spread') && value < 0) {
      addIssue(issues, { field: `${field}.${name}`, code: 'out_of_range', message: `${field}.${name} must be non-negative.` });
    }
    if (name === 'microPrice' && value <= 0) {
      addIssue(issues, { field: `${field}.${name}`, code: 'out_of_range', message: `${field}.${name} must be greater than zero.` });
    }
  }

  if (row.openInterestChangePct !== undefined && row.openInterestChangePct !== null && !isFiniteNumber(row.openInterestChangePct)) {
    addIssue(issues, { field: `${field}.openInterestChangePct`, code: 'invalid_type', message: `${field}.openInterestChangePct must be finite when provided.` });
  }
  return true;
}

export function validateProductionReplayRequest(input: unknown): ValidationResult<ProductionReplayRequestInput> {
  const issues: ValidationIssue[] = [];
  if (!isRecord(input)) {
    return { ok: false, issues: [{ field: 'body', code: 'invalid_type', message: 'The request body must be a JSON object.' }] };
  }

  for (const key of Object.keys(input)) {
    if (!PRODUCTION_REPLAY_ALLOWED_FIELDS.has(key)) {
      addIssue(issues, { field: key, code: 'unknown_field', message: `${key} is not accepted by this endpoint.` });
    }
  }

  const rawCandles = input.candles;
  const rawInputs = input.inputs;
  const candles = Array.isArray(rawCandles) ? rawCandles : [];
  const replayInputs = Array.isArray(rawInputs) ? rawInputs : [];

  if (!Array.isArray(rawCandles)) {
    addIssue(issues, { field: 'candles', code: 'invalid_type', message: 'candles must be an array.' });
  } else if (candles.length < 80) {
    addIssue(issues, { field: 'candles', code: 'out_of_range', message: 'candles must contain at least 80 closed rows.' });
  } else if (candles.length > MAX_PRODUCTION_REPLAY_ROWS) {
    addIssue(issues, { field: 'candles', code: 'too_large', message: `candles may contain at most ${MAX_PRODUCTION_REPLAY_ROWS} rows.` });
  }

  if (!Array.isArray(rawInputs)) {
    addIssue(issues, { field: 'inputs', code: 'invalid_type', message: 'inputs must be an array.' });
  } else if (replayInputs.length < 1) {
    addIssue(issues, { field: 'inputs', code: 'required', message: 'inputs must contain at least one recorded production-input row.' });
  } else if (replayInputs.length > MAX_PRODUCTION_REPLAY_ROWS) {
    addIssue(issues, { field: 'inputs', code: 'too_large', message: `inputs may contain at most ${MAX_PRODUCTION_REPLAY_ROWS} rows.` });
  }

  if (candles.length <= MAX_PRODUCTION_REPLAY_ROWS) {
    for (let index = 0; index < candles.length && issues.length < MAX_PRODUCTION_REPLAY_ISSUES; index += 1) {
      validateProductionCandle(candles[index], index, issues);
    }
  }
  if (replayInputs.length <= MAX_PRODUCTION_REPLAY_ROWS) {
    for (let index = 0; index < replayInputs.length && issues.length < MAX_PRODUCTION_REPLAY_ISSUES; index += 1) {
      validateProductionBarInput(replayInputs[index], index, issues);
    }
  }

  const symbol = validateSymbol(readString(input, 'symbol'), 'symbol', 'BTC-USDT', issues);
  const direction = validateDirection(readString(input, 'direction'), issues);
  const intervalRaw = readString(input, 'interval', '1h') as ProductionReplayInterval;
  const interval = PRODUCTION_REPLAY_INTERVALS.has(intervalRaw) ? intervalRaw : '1h';
  if (!PRODUCTION_REPLAY_INTERVALS.has(intervalRaw)) {
    addIssue(issues, { field: 'interval', code: 'invalid_enum', message: 'interval must be one of 1m, 3m, 5m, 15m, 30m, 1h, 4h, or 1d.' });
  }
  const maxHoldBars = parseFiniteNumber(input, 'maxBars', 24, 1, 240, issues, true);

  return issues.length ? { ok: false, issues } : {
    ok: true,
    value: {
      symbol,
      direction,
      interval,
      maxHoldBars,
      candles: candles as Array<Record<string, unknown>>,
      inputs: replayInputs as Array<Record<string, unknown>>,
    },
  };
}

export function apiValidationError(requestId: string | undefined, issues: ValidationIssue[]) {
  return {
    ok: false,
    error: {
      code: 'invalid_request',
      message: 'The request contains invalid or unsupported values.',
      requestId: requestId || null,
      retryable: false,
      issues,
    },
  };
}
