import type { EvidenceQuality } from './evidenceValue';
import type { MarketEventType } from './marketEvent';

export interface WorldStateKey {
  source: string;
  symbol: string;
  eventType: MarketEventType;
}

export interface WorldStateEntry<T = unknown> {
  key: string;
  eventId: string;
  source: string;
  symbol: string;
  eventType: MarketEventType;
  value: T | null;
  observedAt: number;
  receivedAt: number;
  updatedAt: number;
  expiresAt: number;
  sourceVersion: string;
  quality: EvidenceQuality;
  sequence?: number;
  reasons: string[];
}

export interface WorldStateSnapshot {
  schemaVersion: 1;
  generatedAt: number;
  entries: WorldStateEntry[];
}

export function toWorldStateKey(input: WorldStateKey): string {
  return `${input.source}:${input.symbol}:${input.eventType}`;
}
