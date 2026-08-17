import { WATCHLIST_FAVORITES_KEY } from './workspaceUi';

export const WATCHLIST_CHANGE_EVENT = 'apex:watchlist-change';

function normalizeSymbols(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  return [...new Set(values
    .map((value) => String(value || '').trim().toUpperCase())
    .filter(Boolean))];
}

export function readWatchlistFavorites(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    return new Set(normalizeSymbols(JSON.parse(window.localStorage.getItem(WATCHLIST_FAVORITES_KEY) || '[]')));
  } catch {
    return new Set();
  }
}

export function writeWatchlistFavorites(favorites: Iterable<string>): Set<string> {
  const normalized = new Set(normalizeSymbols([...favorites]));
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(WATCHLIST_FAVORITES_KEY, JSON.stringify([...normalized]));
      window.dispatchEvent(new CustomEvent(WATCHLIST_CHANGE_EVENT, { detail: [...normalized] }));
    } catch {
      // The in-memory value remains usable if storage is unavailable.
    }
  }
  return normalized;
}

export function toggleWatchlistFavorite(favorites: ReadonlySet<string>, symbol: string): Set<string> {
  const normalized = String(symbol || '').trim().toUpperCase();
  const next = new Set(favorites);
  if (!normalized) return next;
  if (next.has(normalized)) next.delete(normalized);
  else next.add(normalized);
  return writeWatchlistFavorites(next);
}
