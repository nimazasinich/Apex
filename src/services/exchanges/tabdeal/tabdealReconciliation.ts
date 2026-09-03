export interface LocalTabdealIntentIdentity {
  clientOrderId: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  quantity: number;
}

export interface ExchangeLookupResult {
  /** null means lookup could not establish truth (network/server/parse uncertainty). */
  found: boolean | null;
  order?: { clientOrderId: string | null; symbol: string; side: 'BUY' | 'SELL'; quantity: number; status: string };
}

export type ReconciliationState = 'CONFIRMED_PLACED' | 'CONFIRMED_NOT_PLACED' | 'UNKNOWN' | 'MISMATCH';
export interface TabdealReconciliationResult {
  state: ReconciliationState;
  safeToResubmit: boolean;
  reason: string;
}

export function evaluateReconciliation(local: LocalTabdealIntentIdentity, lookup: ExchangeLookupResult): TabdealReconciliationResult {
  if (lookup.found === null) return { state: 'UNKNOWN', safeToResubmit: false, reason: 'exchange_lookup_inconclusive' };
  if (lookup.found === false) return { state: 'CONFIRMED_NOT_PLACED', safeToResubmit: true, reason: 'exchange_confirmed_absence' };
  const order = lookup.order;
  if (!order) return { state: 'UNKNOWN', safeToResubmit: false, reason: 'lookup_claimed_found_without_order' };
  const quantityMatches = Math.abs(order.quantity - local.quantity) <= Math.max(1e-12, local.quantity * 1e-8);
  const matches = order.clientOrderId === local.clientOrderId && order.symbol === local.symbol && order.side === local.side && quantityMatches;
  if (!matches) return { state: 'MISMATCH', safeToResubmit: false, reason: 'exchange_record_does_not_match_local_intent' };
  return { state: 'CONFIRMED_PLACED', safeToResubmit: false, reason: 'exchange_confirmed_matching_order' };
}

export function canResubmit(result: TabdealReconciliationResult): boolean {
  return result.state === 'CONFIRMED_NOT_PLACED' && result.safeToResubmit === true;
}
