/**
 * Compatibility barrel for the historical public exchange-data module name.
 *
 * This file intentionally exposes READ-ONLY public market-data helpers only.
 * New production code should import from `./providers/publicExchangeClient` so
 * research/data-plane dependencies cannot be confused with authenticated live
 * execution adapters in `connectedExchange.ts` / `testnetExecution.ts`.
 */
export * from './providers/publicExchangeClient';
