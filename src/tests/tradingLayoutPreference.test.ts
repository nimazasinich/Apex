import { describe, expect, it } from 'vitest';
import {
  LEGACY_TRADING_DOCK_STORAGE_KEY,
  TRADING_LAYOUT_STORAGE_KEY,
  TRADING_RAIL_OPEN_STORAGE_KEY,
  loadTradingLayoutPreference,
  loadTradingRailOpenPreference,
  readTradingRailOpenPreference,
  parseTradingLayoutPreference,
  type StorageLike,
} from '../lib/tradingLayoutPreference';

function memoryStorage(initial: Record<string, string> = {}): StorageLike & { values: Map<string, string> } {
  const values = new Map(Object.entries(initial));
  return {
    values,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value); },
    removeItem: (key) => { values.delete(key); },
  };
}

describe('trading layout preference v2', () => {
  it('rejects malformed and unsupported versions', () => {
    expect(parseTradingLayoutPreference('{bad json', 100).version).toBe(2);
    expect(parseTradingLayoutPreference(JSON.stringify({ version: 1, mode: 'compact-drawers' }), 100).mode).toBe('auto');
  });

  it('validates tools, removes duplicates, and clamps the dock width', () => {
    const parsed = parseTradingLayoutPreference(JSON.stringify({
      version: 2,
      mode: 'desktop-expanders',
      activeTool: 'depth',
      pinnedTools: ['depth', 'depth', 'invalid', 'orders'],
      executionDockWidthPx: 999,
      updatedAt: 42,
    }));
    expect(parsed.activeTool).toBe('depth');
    expect(parsed.pinnedTools).toEqual(['depth', 'orders']);
    expect(parsed.executionDockWidthPx).toBe(440);
  });

  it('migrates the legacy dock boolean once into the versioned object', () => {
    const storage = memoryStorage({ [LEGACY_TRADING_DOCK_STORAGE_KEY]: 'true' });
    const migrated = loadTradingLayoutPreference(storage, 123);
    expect(migrated.activeTool).toBe('order');
    expect(migrated.pinnedTools).toEqual(['order']);
    expect(storage.getItem(TRADING_LAYOUT_STORAGE_KEY)).not.toBeNull();
    expect(storage.getItem(LEGACY_TRADING_DOCK_STORAGE_KEY)).toBeNull();
  });
  it('distinguishes an unset rail preference from an explicit open or closed choice', () => {
    const storage = memoryStorage();
    expect(readTradingRailOpenPreference(storage)).toBeNull();
    expect(loadTradingRailOpenPreference(storage)).toBe(false);
    storage.setItem(TRADING_RAIL_OPEN_STORAGE_KEY, 'true');
    expect(readTradingRailOpenPreference(storage)).toBe(true);
    storage.setItem(TRADING_RAIL_OPEN_STORAGE_KEY, 'false');
    expect(readTradingRailOpenPreference(storage)).toBe(false);
  });

});
