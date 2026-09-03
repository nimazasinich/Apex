export type DataState =
  | 'VALID'
  | 'MISSING'
  | 'UNAVAILABLE'
  | 'NOT_CONFIGURED'
  | 'NOT_SUPPORTED_BY_VENUE'
  | 'STALE'
  | 'DEGRADED';

export interface ObservedValue<T> {
  value: T | null;
  state: DataState;
  sourceObservedAt: number | null;
  providerReadAt?: number | null;
  provenance?: string;
  derivation?: string;
  decisionEligible: boolean;
}

export function observed<T>(input: Omit<ObservedValue<T>, 'state'> & { state?: DataState }): ObservedValue<T> {
  return {
    ...input,
    state: input.state ?? (input.value === null ? 'MISSING' : 'VALID'),
  };
}

export function missingObservedValue<T>(input: Partial<Omit<ObservedValue<T>, 'value' | 'state'>> = {}): ObservedValue<T> {
  return {
    value: null,
    state: 'MISSING',
    sourceObservedAt: input.sourceObservedAt ?? null,
    providerReadAt: input.providerReadAt ?? null,
    provenance: input.provenance,
    derivation: input.derivation,
    decisionEligible: input.decisionEligible ?? false,
  };
}
