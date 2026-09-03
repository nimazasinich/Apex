import type { DataState, SymbolTicker } from '../types';

const BASE_ASSET_PATTERN = /^[A-Z0-9]{1,32}$/;
const QUOTE_ONLY_SYMBOLS = new Set(['USD', 'USDC', 'USDT']);

function validBaseAsset(raw: string): string | null {
  const base = raw === 'XBT' ? 'BTC' : raw;
  if (!BASE_ASSET_PATTERN.test(base) || QUOTE_ONLY_SYMBOLS.has(base)) return null;
  return base;
}

/** Convert a Binance USD-M instrument id to APEX's canonical BASE-USDT form. */
export function canonicalizeBinanceSymbol(raw: unknown): string | null {
  const upper = String(raw ?? '').trim().toUpperCase();
  const base = upper.endsWith('-USDT')
    ? upper.slice(0, -5)
    : upper.endsWith('USDT')
      ? upper.slice(0, -4)
      : upper.includes('-')
        ? ''
        : upper;
  const valid = validBaseAsset(base);
  return valid ? `${valid}-USDT` : null;
}

/** Convert a KuCoin USDT-M contract id to APEX's canonical BASE-USDT form. */
export function canonicalizeKuCoinContractSymbol(raw: unknown): string | null {
  const upper = String(raw ?? '').trim().toUpperCase();
  const base = upper.endsWith('USDTM')
    ? upper.slice(0, -5)
    : upper.endsWith('USDM')
      ? upper.slice(0, -4)
      : upper.endsWith('-USDT')
        ? upper.slice(0, -5)
        : upper.endsWith('USDT')
          ? upper.slice(0, -4)
          : upper.endsWith('M')
            ? upper.slice(0, -1)
            : upper.includes('-')
              ? ''
              : upper;
  const valid = validBaseAsset(base);
  return valid ? `${valid}-USDT` : null;
}

function stateRank(state: DataState | undefined): number {
  if (state === 'live') return 3;
  if (state === 'degraded') return 2;
  return 1;
}

function preferTicker(current: SymbolTicker, candidate: SymbolTicker): SymbolTicker {
  const stateDifference = stateRank(candidate.dataState) - stateRank(current.dataState);
  if (stateDifference !== 0) return stateDifference > 0 ? candidate : current;
  const currentTimestamp = Number.isFinite(current.timestamp) ? current.timestamp : 0;
  const candidateTimestamp = Number.isFinite(candidate.timestamp) ? candidate.timestamp : 0;
  if (candidateTimestamp !== currentTimestamp) return candidateTimestamp > currentTimestamp ? candidate : current;
  return candidate.turnover24h > current.turnover24h ? candidate : current;
}

/**
 * Fail closed at the shared server/browser boundary: malformed quote-only ids
 * (for example USDT -> -USDT), invalid prices, and duplicate canonical symbols
 * never reach React lists or scanner inputs.
 */
export function sanitizeTickerUniverse(rows: readonly SymbolTicker[]): SymbolTicker[] {
  const unique = new Map<string, SymbolTicker>();
  for (const row of rows) {
    const symbol = canonicalizeBinanceSymbol(row?.symbol);
    if (
      !symbol
      || !Number.isFinite(row?.lastPrice)
      || row.lastPrice <= 0
      || !Number.isFinite(row?.turnover24h)
      || row.turnover24h < 0
    ) continue;
    const candidate = row.symbol === symbol ? row : { ...row, symbol };
    const current = unique.get(symbol);
    unique.set(symbol, current ? preferTicker(current, candidate) : candidate);
  }
  return [...unique.values()];
}
