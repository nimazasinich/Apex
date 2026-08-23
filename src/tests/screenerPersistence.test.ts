import { describe, expect, it } from 'vitest';
import { DEFAULT_SCREENER_FILTERS } from '../pages/screener/screenerTypes';
import {
  loadSavedScreenerScreens,
  loadScreenerWorkspace,
  saveSavedScreenerScreens,
  saveScreenerWorkspace,
} from '../pages/screener/screenerPersistence';

function memoryStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  };
}

describe('screener persistence', () => {
  it('round-trips the complete workspace state', () => {
    const storage = memoryStorage();
    const workspace = {
      filters: { ...DEFAULT_SCREENER_FILTERS, minScore: 75, funding: 'NEGATIVE' as const, favoritesOnly: true },
      sort: { key: 'funding' as const, ascending: true },
      columnSet: 'derivatives' as const,
      viewMode: 'map' as const,
    };
    saveScreenerWorkspace(workspace, storage);
    expect(loadScreenerWorkspace(storage)).toEqual(workspace);
  });

  it('migrates a partial older workspace onto current safe defaults', () => {
    const storage = memoryStorage({ apex_screener_workspace_v2: JSON.stringify({ filters: { minScore: 80 }, columnSet: 'bad' }) });
    const workspace = loadScreenerWorkspace(storage);
    expect(workspace.filters.minScore).toBe(80);
    expect(workspace.filters.guard).toBe('ALL');
    expect(workspace.columnSet).toBe('overview');
    expect(workspace.viewMode).toBe('table');
  });

  it('sanitizes saved screen names and caps storage at twelve screens', () => {
    const storage = memoryStorage();
    const screens = Array.from({ length: 14 }, (_, index) => ({
      id: `screen-${index}`,
      name: `Screen ${index}`,
      createdAt: index,
      workspace: { filters: DEFAULT_SCREENER_FILTERS, sort: { key: 'rank' as const, ascending: true }, columnSet: 'overview' as const, viewMode: 'table' as const },
    }));
    saveSavedScreenerScreens(screens, storage);
    expect(loadSavedScreenerScreens(storage)).toHaveLength(12);
  });
});
