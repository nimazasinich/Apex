import type { EvidenceQuality } from '../../contracts/realtime/evidenceValue';
import { assertValidEvidenceValue } from '../../contracts/realtime/evidenceValue';
import type { MarketEvent } from '../../contracts/realtime/marketEvent';
import type { WorldStateEntry, WorldStateSnapshot } from '../../contracts/realtime/worldState';
import { toWorldStateKey } from '../../contracts/realtime/worldState';

export interface WorldStateApplyOptions {
  ttlMs: number;
  quality?: EvidenceQuality;
  sourceVersion?: string;
  reasons?: string[];
  now?: number;
}

export class WorldStateStore {
  private readonly entries = new Map<string, WorldStateEntry>();

  apply(event: MarketEvent, options: WorldStateApplyOptions): WorldStateEntry {
    const now = options.now ?? Date.now();
    if (!Number.isFinite(options.ttlMs) || options.ttlMs <= 0 || options.ttlMs > 7 * 24 * 60 * 60 * 1_000) {
      throw new Error('invalid_world_state_ttl');
    }
    const quality = options.quality ?? 'VALID';
    const value = quality === 'INVALID' || quality === 'MISSING' || quality === 'NOT_CONFIGURED'
      ? null
      : event.payload;
    assertValidEvidenceValue({
      value,
      observedAt: event.exchangeTimestamp,
      receivedAt: event.receivedAt,
      expiresAt: event.exchangeTimestamp + options.ttlMs,
      source: event.source,
      sourceVersion: options.sourceVersion ?? `event-schema-${event.schemaVersion}`,
      quality,
      sequence: event.sequence,
      reasons: options.reasons ?? [],
    });
    const key = toWorldStateKey({ source: event.source, symbol: event.symbol, eventType: event.type });
    const entry: WorldStateEntry = {
      key,
      eventId: event.eventId,
      source: event.source,
      symbol: event.symbol,
      eventType: event.type,
      value,
      observedAt: event.exchangeTimestamp,
      receivedAt: event.receivedAt,
      updatedAt: now,
      expiresAt: event.exchangeTimestamp + options.ttlMs,
      sourceVersion: options.sourceVersion ?? `event-schema-${event.schemaVersion}`,
      quality,
      sequence: event.sequence,
      reasons: [...(options.reasons ?? [])],
    };
    this.entries.set(key, entry);
    return { ...entry, reasons: [...entry.reasons] };
  }

  invalidate(input: { source: string; symbol: string; eventType: MarketEvent['type'] }, reason: string, now = Date.now()): WorldStateEntry | null {
    const key = toWorldStateKey(input);
    const current = this.entries.get(key);
    if (!current) return null;
    const invalid: WorldStateEntry = {
      ...current,
      value: null,
      quality: 'INVALID',
      updatedAt: now,
      expiresAt: now,
      reasons: [...current.reasons, reason],
    };
    this.entries.set(key, invalid);
    return { ...invalid, reasons: [...invalid.reasons] };
  }

  get(key: string, now = Date.now()): WorldStateEntry | null {
    const entry = this.entries.get(key);
    if (!entry) return null;
    if (entry.expiresAt <= now && entry.quality !== 'INVALID' && entry.quality !== 'NOT_CONFIGURED') {
      return { ...entry, quality: 'STALE', reasons: [...entry.reasons, 'evidence_expired'] };
    }
    return { ...entry, reasons: [...entry.reasons] };
  }

  snapshot(now = Date.now()): WorldStateSnapshot {
    return {
      schemaVersion: 1,
      generatedAt: now,
      entries: [...this.entries.keys()]
        .map((key) => this.get(key, now))
        .filter((entry): entry is WorldStateEntry => Boolean(entry)),
    };
  }

  prune(now = Date.now(), retentionMs = 60 * 60 * 1_000): number {
    let removed = 0;
    for (const [key, entry] of this.entries) {
      if (entry.expiresAt + retentionMs < now) {
        this.entries.delete(key);
        removed += 1;
      }
    }
    return removed;
  }

  clear(): void {
    this.entries.clear();
  }
}
