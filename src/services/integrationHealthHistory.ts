export type IntegrationHealthState = 'CONNECTED' | 'DEGRADED' | 'DISCONNECTED' | 'MISCONFIGURED';

export interface IntegrationHealthEntry {
  id: string;
  checkedAt: number;
  state: IntegrationHealthState;
  latencyMs: number | null;
  summary: string;
  route?: 'direct' | 'proxy' | 'mixed' | 'none';
}

/** Bounded in-memory operator history; secrets and raw upstream bodies never enter it. */
export class IntegrationHealthHistory {
  private readonly rows: IntegrationHealthEntry[] = [];

  constructor(private readonly capacity = 12) {}

  record(entry: Omit<IntegrationHealthEntry, 'id'>): IntegrationHealthEntry {
    const row = {
      ...entry,
      id: `${entry.checkedAt}:${this.rows.length}:${entry.state}`,
      summary: entry.summary.slice(0, 240),
    };
    this.rows.unshift(row);
    if (this.rows.length > this.capacity) this.rows.length = this.capacity;
    return { ...row };
  }

  list(): IntegrationHealthEntry[] {
    return this.rows.map((row) => ({ ...row }));
  }

  latest(): IntegrationHealthEntry | null {
    return this.rows[0] ? { ...this.rows[0] } : null;
  }

  clear(): void {
    this.rows.length = 0;
  }
}
