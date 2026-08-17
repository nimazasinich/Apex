/**
 * Human-readable messages for order preview/submission errors.
 *
 * The server returns stable machine codes (see accountRouteError in server.ts).
 * Those are correct for logs and tests but must never be shown to a person as
 * raw tokens like `order_preview_expired`. This module is the single place that
 * turns a code into a clear sentence and classifies how the UI should recover.
 *
 * The original code is preserved on the result (`.code`) so callers can still
 * log the precise reason for debugging.
 */

export type OrderErrorKind =
  | 'expired' // preview/risk went stale — the safe path is a fresh review
  | 'confirmation' // the typed confirmation phrase is missing/incorrect
  | 'validation' // the order parameters are not acceptable
  | 'risk' // the risk governor blocked/'altered the order
  | 'margin' // not enough margin / exceeds a limit
  | 'connectivity' // exchange/market data temporarily unavailable
  | 'auth' // credentials / arming problem
  | 'unconfirmed' // sent, but final state unknown — must reconcile
  | 'generic';

export interface FriendlyOrderError {
  /** One-line, plain-language summary suitable as the primary message. */
  title: string;
  /** Optional second sentence describing the next action. */
  detail?: string;
  /** Original machine code, preserved for logs/debugging. */
  code: string;
  /** How the UI should treat this failure. */
  kind: OrderErrorKind;
}

interface Entry {
  title: string;
  detail?: string;
  kind: OrderErrorKind;
}

const MAP: Record<string, Entry> = {
  order_preview_expired: {
    title: 'This order preview expired before it was confirmed.',
    detail: 'Prices and risk checks may have moved. Review the order again to get a fresh quote, then confirm.',
    kind: 'expired',
  },
  risk_changed_repreview_required: {
    title: 'Market or risk conditions changed since this preview.',
    detail: 'Review the order again to see the updated numbers before confirming.',
    kind: 'expired',
  },
  explicit_live_confirmation_required: {
    title: 'Type the exact confirmation phrase to place this live order.',
    kind: 'confirmation',
  },
  explicit_demo_confirmation_required: {
    title: 'Type the exact confirmation phrase to place this demo order.',
    kind: 'confirmation',
  },
  execution_not_armed: {
    title: 'Live execution is not armed for this session.',
    detail: 'Enable live trading when connecting your account, then try again.',
    kind: 'auth',
  },
  live_connection_required: {
    title: 'Connect a live account before placing live orders.',
    kind: 'auth',
  },
  exchange_authentication_failed: {
    title: 'The exchange rejected your API credentials.',
    detail: 'Re-check your KuCoin API key, secret and passphrase in Settings.',
    kind: 'auth',
  },
  session_notional_limit_exceeded: {
    title: 'This order is larger than the per-order limit set for this session.',
    detail: 'Reduce the size, or reconnect with a higher limit.',
    kind: 'margin',
  },
  insufficient_available_margin: {
    title: 'There is not enough available margin for this order.',
    detail: 'Lower the size or leverage, or free up margin, then review again.',
    kind: 'margin',
  },
  exchange_open_order_limit_reached: {
    title: 'The exchange open-order limit has been reached.',
    detail: 'Cancel an existing order before placing a new one.',
    kind: 'margin',
  },
  invalid_order_request: { title: 'This order request is not valid.', kind: 'validation' },
  invalid_order_quantity_or_leverage: {
    title: 'The order size or leverage is not valid for this contract.',
    kind: 'validation',
  },
  invalid_order_quantity: { title: 'The order size is not valid.', kind: 'validation' },
  invalid_quantity_step: {
    title: 'The order size does not match this contract’s step size.',
    kind: 'validation',
  },
  leverage_exceeds_contract_max: {
    title: 'The chosen leverage is above this contract’s maximum.',
    kind: 'validation',
  },
  limit_price_required: { title: 'Enter a limit price for this order type.', kind: 'validation' },
  invalid_price_tick: { title: 'The price does not match this contract’s tick size.', kind: 'validation' },
  invalid_protection_price_tick: {
    title: 'A take-profit or stop-loss price does not match the tick size.',
    kind: 'validation',
  },
  contract_not_open: { title: 'This market is not open for trading right now.', kind: 'validation' },
  reduce_only_has_no_exposure: {
    title: 'Reduce-only was set, but there is no open position to reduce.',
    kind: 'validation',
  },
  reduce_only_protection_not_allowed: {
    title: 'Take-profit/stop-loss cannot be attached to a reduce-only order.',
    kind: 'validation',
  },
  long_take_profit_must_be_above_entry: {
    title: 'For a long, the take-profit must be above the entry price.',
    kind: 'validation',
  },
  long_stop_loss_must_be_below_entry: {
    title: 'For a long, the stop-loss must be below the entry price.',
    kind: 'validation',
  },
  short_take_profit_must_be_below_entry: {
    title: 'For a short, the take-profit must be below the entry price.',
    kind: 'validation',
  },
  short_stop_loss_must_be_above_entry: {
    title: 'For a short, the stop-loss must be above the entry price.',
    kind: 'validation',
  },
  trade_plan_invalid: { title: 'This trade plan did not pass validation.', kind: 'validation' },
  risk_governor_rejected: {
    title: 'The risk governor blocked this order.',
    detail: 'Adjust the size, leverage or protection levels and review again.',
    kind: 'risk',
  },
  risk_governor_deferred: {
    title: 'The risk governor deferred this order for review.',
    kind: 'risk',
  },
  risk_governor_reduced_below_minimum: {
    title: 'After risk limits were applied, the order fell below the minimum size, so nothing was placed.',
    kind: 'risk',
  },
  risk_governor_recheck_failed: {
    title: 'The risk re-check did not pass, so the order was not placed.',
    kind: 'risk',
  },
  market_reference_unavailable: {
    title: 'A live reference price for this market is temporarily unavailable.',
    detail: 'Wait a moment and review the order again.',
    kind: 'connectivity',
  },
  demo_market_quote_unavailable: {
    title: 'A live price for this market is temporarily unavailable.',
    detail: 'Wait a moment and review the order again.',
    kind: 'connectivity',
  },
  demo_order_not_found: { title: 'That demo order could not be found.', kind: 'generic' },
  live_order_state_unknown_reconciliation_required: {
    title: 'The order was sent, but its final status is not yet confirmed.',
    detail: 'Refresh account data to reconcile before trying again — do not resubmit blindly.',
    kind: 'unconfirmed',
  },
  order_preview_failed: {
    title: 'The order preview could not be generated.',
    detail: 'Check the order details and try again.',
    kind: 'generic',
  },
  cancel_failed: {
    title: 'The order could not be cancelled.',
    detail: 'Refresh the account data to check whether it is still open, then try again.',
    kind: 'generic',
  },
  live_order_submission_failed: {
    title: 'The order could not be submitted.',
    detail: 'Review the order again before retrying.',
    kind: 'generic',
  },
};

/** Turn a bare `request_failed_<n>` / HTTP-ish token into a sentence. */
function describeTransport(code: string): Entry | null {
  const m = /^request_failed_(\d{3})$/.exec(code);
  if (!m) return null;
  const status = Number(m[1]);
  if (status === 429) {
    return { title: 'The server is rate-limiting requests. Wait a few seconds and try again.', kind: 'connectivity' };
  }
  if (status === 503 || status === 502 || status === 504) {
    return { title: 'The service is temporarily unavailable. Try again shortly.', kind: 'connectivity' };
  }
  if (status >= 500) {
    return { title: 'The server hit an unexpected error. Try again shortly.', kind: 'generic' };
  }
  return null;
}

/**
 * Convert an order-flow error (Error.message from accountClient, which is the
 * server's machine code) into a friendly, classified message. Unknown codes are
 * softened into a readable sentence rather than shown as a raw token, while the
 * original code is always retained on `.code`.
 */
export function describeOrderError(raw: string | null | undefined): FriendlyOrderError {
  const code = (raw || '').trim() || 'unknown_error';
  const entry = MAP[code] || describeTransport(code);
  if (entry) return { ...entry, code };

  // Unknown / unmapped: never surface the raw token. Produce a neutral sentence
  // but keep the code for logs.
  return {
    title: 'The order could not be completed.',
    detail: 'Review the order again before retrying.',
    code,
    kind: 'generic',
  };
}
