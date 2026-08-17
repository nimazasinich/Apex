export type RealtimeFoundationStatus = 'DISABLED' | 'READY' | 'DEGRADED';

export interface RealtimeHealthSnapshot {
  status: RealtimeFoundationStatus;
  generatedAt: number;
  acceptedEvents: number;
  duplicateEvents: number;
  gapEvents: number;
  outOfOrderEvents: number;
  invalidEvents: number;
  persistedEvents: number;
  persistenceFailures: number;
  lastEventAt: number | null;
  lastError: string | null;
}

export class RealtimeHealthTracker {
  private acceptedEvents = 0;
  private duplicateEvents = 0;
  private gapEvents = 0;
  private outOfOrderEvents = 0;
  private invalidEvents = 0;
  private persistedEvents = 0;
  private persistenceFailures = 0;
  private lastEventAt: number | null = null;
  private lastError: string | null = null;

  accepted(at = Date.now()): void { this.acceptedEvents += 1; this.lastEventAt = at; }
  duplicate(): void { this.duplicateEvents += 1; }
  gap(reason: string): void { this.gapEvents += 1; this.lastError = reason; }
  outOfOrder(reason: string): void { this.outOfOrderEvents += 1; this.lastError = reason; }
  invalid(reason: string): void { this.invalidEvents += 1; this.lastError = reason; }
  persisted(): void { this.persistedEvents += 1; }
  persistenceFailed(reason: string): void { this.persistenceFailures += 1; this.lastError = reason; }

  snapshot(enabled: boolean, now = Date.now()): RealtimeHealthSnapshot {
    const degraded = this.gapEvents > 0 || this.outOfOrderEvents > 0 || this.invalidEvents > 0 || this.persistenceFailures > 0;
    return {
      status: enabled ? (degraded ? 'DEGRADED' : 'READY') : 'DISABLED',
      generatedAt: now,
      acceptedEvents: this.acceptedEvents,
      duplicateEvents: this.duplicateEvents,
      gapEvents: this.gapEvents,
      outOfOrderEvents: this.outOfOrderEvents,
      invalidEvents: this.invalidEvents,
      persistedEvents: this.persistedEvents,
      persistenceFailures: this.persistenceFailures,
      lastEventAt: this.lastEventAt,
      lastError: this.lastError,
    };
  }
}
