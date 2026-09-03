/**
 * Frontend Telegram client. Bot credentials stay server-side; event preferences
 * are non-secret booleans stored locally.
 */
import type { SignalLifecycleState } from '../types';
import type { LifecycleTransition, SignalLifecycleRecord } from './signalLifecycleTracker';
import { isTerminalState, type LifecycleOutcome } from './lifecycleCore';
import { apiMutate } from './apiMutate';

export interface TelegramStatus {
  configured: boolean;
  enabled: boolean;
  chatConfigured: boolean;
  tokenConfigured?: boolean;
  lastTest?: TelegramTestObservation | null;
  history?: import('./integrationHealthHistory').IntegrationHealthEntry[];
}

export interface TelegramTestObservation {
  ok: boolean;
  checkedAt: number;
  latencyMs: number;
  route: 'direct' | 'proxy' | 'none';
  error: string | null;
}

export interface TelegramConfigInput {
  botToken?: string;
  chatId?: string;
  enabled?: boolean;
}

export interface TelegramConfigResult extends TelegramStatus {
  ok: boolean;
  error?: string;
}

export type TelegramEvent =
  | 'candidate'
  | 'confirmed'
  | 'expired'
  | 'tpHit'
  | 'slHit'
  | 'dataDegraded';

export interface TelegramPrefs {
  candidate: boolean;
  confirmed: boolean;
  expired: boolean;
  tpHit: boolean;
  slHit: boolean;
  dataDegraded: boolean;
}

const PREFS_KEY = 'apex.telegram.prefs.v1';
const SENT_KEY = 'apex.telegram.sent.v1';
const MAX_DEDUPE_KEYS = 200;

const DEFAULT_PREFS: TelegramPrefs = {
  candidate: false,
  confirmed: true,
  expired: true,
  tpHit: true,
  slHit: true,
  dataDegraded: false,
};

export function loadTelegramPrefs(): TelegramPrefs {
  if (typeof window === 'undefined' || !window.localStorage) return { ...DEFAULT_PREFS };
  try {
    const raw = window.localStorage.getItem(PREFS_KEY);
    if (raw) return { ...DEFAULT_PREFS, ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return { ...DEFAULT_PREFS };
}

export function saveTelegramPrefs(prefs: TelegramPrefs): boolean {
  if (typeof window === 'undefined' || !window.localStorage) return false;
  try { window.localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); return true; } catch { return false; }
}

export async function fetchTelegramStatus(): Promise<TelegramStatus> {
  try {
    const res = await fetch('/api/telegram/status', { credentials: 'same-origin' });
    if (!res.ok) return { configured: false, enabled: false, chatConfigured: false };
    return await res.json() as TelegramStatus;
  } catch {
    return { configured: false, enabled: false, chatConfigured: false };
  }
}

export async function fetchTelegramStatusDetailed(): Promise<{ ok: boolean; status: TelegramStatus; error?: string }> {
  try {
    const res = await fetch('/api/telegram/status', { credentials: 'same-origin' });
    if (!res.ok) return { ok: false, status: { configured: false, enabled: false, chatConfigured: false }, error: `http_${res.status}` };
    return { ok: true, status: await res.json() as TelegramStatus };
  } catch (error) {
    return { ok: false, status: { configured: false, enabled: false, chatConfigured: false }, error: error instanceof Error ? error.message : 'telegram_status_failed' };
  }
}

export async function saveTelegramConfig(cfg: TelegramConfigInput): Promise<TelegramConfigResult> {
  try {
    const res = await apiMutate('/api/telegram/config', {
      credentials: 'same-origin',
      body: JSON.stringify(cfg),
    });
    if (!res.ok) return { ok: false, configured: false, enabled: false, chatConfigured: false, error: `http_${res.status}` };
    return await res.json() as TelegramConfigResult;
  } catch (error) {
    return { ok: false, configured: false, enabled: false, chatConfigured: false, error: error instanceof Error ? error.message : 'request_failed' };
  }
}

export async function sendTelegramTest(): Promise<{ ok: boolean; error?: string; checkedAt?: number; latencyMs?: number; route?: 'direct' | 'proxy' | 'none'; history?: import('./integrationHealthHistory').IntegrationHealthEntry[] }> {
  try {
    const res = await apiMutate('/api/telegram/test', { credentials: 'same-origin' });
    return await res.json();
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'request_failed' };
  }
}

export async function notifyTelegram(text: string): Promise<boolean> {
  try {
    const res = await apiMutate('/api/telegram/send', {
      credentials: 'same-origin',
      body: JSON.stringify({ text }),
    });
    const payload = await res.json().catch(() => ({ ok: false }));
    return Boolean(payload?.ok);
  } catch {
    return false;
  }
}

function readDedupe(): string[] {
  if (typeof window === 'undefined' || !window.sessionStorage) return [];
  try {
    const rows = JSON.parse(window.sessionStorage.getItem(SENT_KEY) || '[]');
    return Array.isArray(rows) ? rows.filter((value): value is string => typeof value === 'string').slice(-MAX_DEDUPE_KEYS) : [];
  } catch { return []; }
}

function rememberDedupe(key: string): boolean {
  const rows = readDedupe();
  if (rows.includes(key)) return false;
  rows.push(key);
  if (typeof window === 'undefined' || !window.sessionStorage) return true;
  try { window.sessionStorage.setItem(SENT_KEY, JSON.stringify(rows.slice(-MAX_DEDUPE_KEYS))); } catch { /* ignore */ }
  return true;
}

export function lifecycleTelegramEvent(
  prevState: SignalLifecycleState,
  nextState: SignalLifecycleState,
  outcome: LifecycleOutcome | null,
): TelegramEvent | null {
  if (isTerminalState(prevState)) return null;
  if (prevState === 'CANDIDATE' && nextState === 'CONFIRMED') return 'confirmed';
  if (isTerminalState(nextState)) {
    if (outcome === 'WIN') return 'tpHit';
    if (outcome === 'LOSS') return 'slHit';
    return 'expired';
  }
  return null;
}

function formatLifecycleMessage(event: TelegramEvent, record: SignalLifecycleRecord): string {
  const title = event === 'confirmed' ? '✅ APEX SIGNAL CONFIRMED'
    : event === 'tpHit' ? '🎯 APEX TARGET HIT'
      : event === 'slHit' ? '❌ APEX STOP LOSS HIT'
        : event === 'dataDegraded' ? '⚠️ APEX DATA DEGRADED'
          : '⚠️ APEX SIGNAL CLOSED';
  const price = Number.isFinite(record.lastPrice) ? record.lastPrice : 'N/A';
  return `${title}\nSymbol: ${record.ticker}\nDirection: ${record.direction}\nLifecycle: ${record.state}\nEntry: ${record.entry}\nLast price: ${price}\nConfidence: ${(record.confidence * 100).toFixed(1)}%\nSignal ID: ${record.signalId}\nMode: shadow-only`;
}

/** Best-effort dispatch for lifecycle transitions, with preference and dedupe checks. */
export async function dispatchLifecycleTelegramTransitions(transitions: LifecycleTransition[]): Promise<void> {
  if (!transitions.length) return;
  const [status, prefs] = await Promise.all([fetchTelegramStatus(), Promise.resolve(loadTelegramPrefs())]);
  if (!status.enabled || !status.configured) return;
  for (const transition of transitions) {
    const event = lifecycleTelegramEvent(transition.previousState, transition.nextState, transition.record.outcome);
    if (!event || !prefs[event]) continue;
    const key = `${transition.record.signalId}:${event}:${transition.record.updatedAt}`;
    if (!rememberDedupe(key)) continue;
    await notifyTelegram(formatLifecycleMessage(event, transition.record));
  }
}


export async function dispatchCandidateTelegramRecords(records: SignalLifecycleRecord[]): Promise<void> {
  if (!records.length) return;
  const prefs = loadTelegramPrefs();
  if (!prefs.candidate) return;
  const status = await fetchTelegramStatus();
  if (!status.enabled || !status.configured) return;
  for (const record of records) {
    const key = `${record.signalId}:candidate`;
    if (!rememberDedupe(key)) continue;
    await notifyTelegram(`🔎 APEX CANDIDATE
Symbol: ${record.ticker}
Direction: ${record.direction}
Lifecycle: ${record.state}
Entry: ${record.entry}
Confidence: ${(record.confidence * 100).toFixed(1)}%
Signal ID: ${record.signalId}
Mode: shadow notification`);
  }
}

export async function dispatchCandidateTelegramAlert(input: {
  symbol: string;
  direction?: 'LONG' | 'SHORT';
  readiness: string;
  score?: number;
  signalId?: string;
}): Promise<void> {
  const prefs = loadTelegramPrefs();
  if (!prefs.candidate) return;
  const status = await fetchTelegramStatus();
  if (!status.enabled || !status.configured) return;
  const key = `${input.signalId || input.symbol}:${input.readiness}:candidate`;
  if (!rememberDedupe(key)) return;
  await notifyTelegram(`🔎 APEX CANDIDATE\nSymbol: ${input.symbol}\nDirection: ${input.direction || 'N/A'}\nReadiness: ${input.readiness}\nScore: ${input.score ?? 'N/A'}\nSignal ID: ${input.signalId || 'pending'}\nMode: shadow notification`);
}


/** Best-effort provider degradation notice. Session dedupe prevents scan-loop spam. */
export async function dispatchDataDegradedTelegramAlert(input: {
  state: 'degraded' | 'not_configured' | 'unavailable';
  source?: string | null;
  detail?: string;
}): Promise<void> {
  const prefs = loadTelegramPrefs();
  if (!prefs.dataDegraded) return;
  const status = await fetchTelegramStatus();
  if (!status.enabled || !status.configured) return;
  const hourBucket = Math.floor(Date.now() / 3_600_000);
  const key = `market-data:${input.state}:${input.source || 'unknown'}:${hourBucket}`;
  if (!rememberDedupe(key)) return;
  await notifyTelegram(`⚠️ APEX DATA DEGRADED
State: ${input.state.replaceAll('_', ' ')}
Source: ${input.source || 'unknown'}
Detail: ${input.detail || 'Verified market intelligence is incomplete; execution controls remain authoritative.'}`);
}
