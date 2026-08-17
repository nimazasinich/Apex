import type { TradingToolRequestKey } from './tradingToolboxEvents';

export type TradingToolKey = TradingToolRequestKey;
export type TradingLayoutMode = 'auto' | 'desktop-expanders' | 'compact-drawers';

export interface TradingLayoutPreferenceV2 {
  version: 2;
  mode: TradingLayoutMode;
  activeTool: TradingToolKey | null;
  pinnedTools: TradingToolKey[];
  executionDockWidthPx: number;
  updatedAt: number;
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export const TRADING_LAYOUT_STORAGE_KEY = 'apex.trading.layout.v2';
export const TRADING_RAIL_OPEN_STORAGE_KEY = 'apex.trading.toolbox.railOpen.v1';
export const LEGACY_TRADING_DOCK_STORAGE_KEY = 'apex.trading.toolbox.docked';
export const TRADING_TOOL_KEYS: readonly TradingToolKey[] = ['order', 'orders', 'positions', 'depth', 'trades', 'strategy', 'signals'];
export const MIN_EXECUTION_DOCK_WIDTH_PX = 300;
export const MAX_EXECUTION_DOCK_WIDTH_PX = 440;
export const DEFAULT_EXECUTION_DOCK_WIDTH_PX = 338;

function isTool(value: unknown): value is TradingToolKey {
  return typeof value === 'string' && TRADING_TOOL_KEYS.includes(value as TradingToolKey);
}

function isMode(value: unknown): value is TradingLayoutMode {
  return value === 'auto' || value === 'desktop-expanders' || value === 'compact-drawers';
}

function clampWidth(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_EXECUTION_DOCK_WIDTH_PX;
  return Math.min(MAX_EXECUTION_DOCK_WIDTH_PX, Math.max(MIN_EXECUTION_DOCK_WIDTH_PX, Math.round(parsed)));
}

export function createDefaultTradingLayoutPreference(now = Date.now()): TradingLayoutPreferenceV2 {
  return {
    version: 2,
    mode: 'auto',
    activeTool: null,
    pinnedTools: [],
    executionDockWidthPx: DEFAULT_EXECUTION_DOCK_WIDTH_PX,
    updatedAt: now,
  };
}

export function parseTradingLayoutPreference(raw: string | null, now = Date.now()): TradingLayoutPreferenceV2 {
  const fallback = createDefaultTradingLayoutPreference(now);
  if (!raw) return fallback;
  try {
    const candidate = JSON.parse(raw) as Partial<TradingLayoutPreferenceV2>;
    if (candidate.version !== 2) return fallback;
    const pinnedTools = Array.isArray(candidate.pinnedTools)
      ? [...new Set(candidate.pinnedTools.filter(isTool))]
      : [];
    return {
      version: 2,
      mode: isMode(candidate.mode) ? candidate.mode : 'auto',
      activeTool: isTool(candidate.activeTool) ? candidate.activeTool : null,
      pinnedTools,
      executionDockWidthPx: clampWidth(candidate.executionDockWidthPx),
      updatedAt: Number.isFinite(candidate.updatedAt) ? Number(candidate.updatedAt) : now,
    };
  } catch {
    return fallback;
  }
}

export function loadTradingLayoutPreference(storage?: StorageLike, now = Date.now()): TradingLayoutPreferenceV2 {
  if (!storage) return createDefaultTradingLayoutPreference(now);
  const current = storage.getItem(TRADING_LAYOUT_STORAGE_KEY);
  if (current) return parseTradingLayoutPreference(current, now);

  const legacyDocked = storage.getItem(LEGACY_TRADING_DOCK_STORAGE_KEY);
  const migrated = createDefaultTradingLayoutPreference(now);
  if (legacyDocked === 'true') {
    migrated.activeTool = 'order';
    migrated.pinnedTools = ['order'];
  }
  try {
    storage.setItem(TRADING_LAYOUT_STORAGE_KEY, JSON.stringify(migrated));
    if (legacyDocked !== null) storage.removeItem(LEGACY_TRADING_DOCK_STORAGE_KEY);
  } catch {
    // Persistence is optional in private or embedded browser contexts.
  }
  return migrated;
}

export function saveTradingLayoutPreference(storage: StorageLike | undefined, preference: TradingLayoutPreferenceV2): void {
  if (!storage) return;
  const normalized = parseTradingLayoutPreference(JSON.stringify({ ...preference, version: 2 }), preference.updatedAt);
  storage.setItem(TRADING_LAYOUT_STORAGE_KEY, JSON.stringify(normalized));
}

export function readTradingRailOpenPreference(storage?: StorageLike): boolean | null {
  if (!storage) return null;
  const raw = storage.getItem(TRADING_RAIL_OPEN_STORAGE_KEY);
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  return null;
}

export function loadTradingRailOpenPreference(storage?: StorageLike): boolean {
  return readTradingRailOpenPreference(storage) ?? false;
}

export function saveTradingRailOpenPreference(storage: StorageLike | undefined, open: boolean): void {
  if (!storage) return;
  storage.setItem(TRADING_RAIL_OPEN_STORAGE_KEY, open ? 'true' : 'false');
}
