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

export interface WatchlistPersistenceResult {
  favorites: Set<string>;
  persisted: boolean;
}

export function writeWatchlistFavorites(favorites: Iterable<string>): WatchlistPersistenceResult {
  const normalized = new Set(normalizeSymbols([...favorites]));
  if (typeof window === 'undefined') return { favorites: normalized, persisted: false };
  try {
    window.localStorage.setItem(WATCHLIST_FAVORITES_KEY, JSON.stringify([...normalized]));
    window.dispatchEvent(new CustomEvent(WATCHLIST_CHANGE_EVENT, { detail: [...normalized] }));
    return { favorites: normalized, persisted: true };
  } catch {
    return { favorites: normalized, persisted: false };
  }
}

export function toggleWatchlistFavorite(favorites: ReadonlySet<string>, symbol: string): WatchlistPersistenceResult {
  const normalized = String(symbol || '').trim().toUpperCase();
  const next = new Set(favorites);
  if (!normalized) return { favorites: next, persisted: false };
  if (next.has(normalized)) next.delete(normalized);
  else next.add(normalized);
  return writeWatchlistFavorites(next);
}
