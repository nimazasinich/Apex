import {
  DEFAULT_SCREENER_FILTERS,
  DEFAULT_SCREENER_SORT,
  DEFAULT_SCREENER_WORKSPACE,
  type SavedScreenerScreen,
  type ScreenerColumnSet,
  type ScreenerFilters,
  type ScreenerSort,
  type ScreenerViewMode,
  type ScreenerWorkspaceState,
} from './screenerTypes';

const WORKSPACE_KEY = 'apex_screener_workspace_v2';
const SCREENS_KEY = 'apex_screener_saved_screens_v2';
const COLUMN_SETS: ReadonlySet<ScreenerColumnSet> = new Set(['overview', 'momentum', 'derivatives', 'quality']);
const VIEW_MODES: ReadonlySet<ScreenerViewMode> = new Set(['table', 'map']);

function storageOrNull(): Storage | null {
  return typeof window === 'undefined' ? null : window.localStorage;
}

function normalizeWorkspace(value: unknown): ScreenerWorkspaceState {
  const record = value && typeof value === 'object' ? value as Partial<ScreenerWorkspaceState> : {};
  const filters = record.filters && typeof record.filters === 'object'
    ? { ...DEFAULT_SCREENER_FILTERS, ...record.filters } as ScreenerFilters
    : { ...DEFAULT_SCREENER_FILTERS };
  const sort = record.sort && typeof record.sort === 'object'
    ? { ...DEFAULT_SCREENER_SORT, ...record.sort } as ScreenerSort
    : { ...DEFAULT_SCREENER_SORT };
  return {
    filters,
    sort,
    columnSet: COLUMN_SETS.has(record.columnSet as ScreenerColumnSet) ? record.columnSet as ScreenerColumnSet : DEFAULT_SCREENER_WORKSPACE.columnSet,
    viewMode: VIEW_MODES.has(record.viewMode as ScreenerViewMode) ? record.viewMode as ScreenerViewMode : DEFAULT_SCREENER_WORKSPACE.viewMode,
  };
}

export function loadScreenerWorkspace(storage: Pick<Storage, 'getItem'> | null = storageOrNull()): ScreenerWorkspaceState {
  if (!storage) return normalizeWorkspace(null);
  try { return normalizeWorkspace(JSON.parse(storage.getItem(WORKSPACE_KEY) || 'null')); }
  catch { return normalizeWorkspace(null); }
}

export function saveScreenerWorkspace(workspace: ScreenerWorkspaceState, storage: Pick<Storage, 'setItem'> | null = storageOrNull()): void {
  if (!storage) return;
  try { storage.setItem(WORKSPACE_KEY, JSON.stringify(normalizeWorkspace(workspace))); } catch { /* in-memory state remains usable */ }
}

export function loadSavedScreenerScreens(storage: Pick<Storage, 'getItem'> | null = storageOrNull()): SavedScreenerScreen[] {
  if (!storage) return [];
  try {
    const parsed = JSON.parse(storage.getItem(SCREENS_KEY) || '[]') as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((item): SavedScreenerScreen[] => {
      if (!item || typeof item !== 'object') return [];
      const row = item as Partial<SavedScreenerScreen>;
      const name = String(row.name || '').trim().slice(0, 48);
      if (!name || !row.workspace) return [];
      return [{
        id: String(row.id || `screen-${row.createdAt || 0}-${name}`).slice(0, 96),
        name,
        createdAt: Number.isFinite(row.createdAt) ? Number(row.createdAt) : 0,
        workspace: normalizeWorkspace(row.workspace),
      }];
    }).slice(0, 12);
  } catch { return []; }
}

export function saveSavedScreenerScreens(screens: SavedScreenerScreen[], storage: Pick<Storage, 'setItem'> | null = storageOrNull()): void {
  if (!storage) return;
  try { storage.setItem(SCREENS_KEY, JSON.stringify(screens.slice(0, 12))); } catch { /* in-memory state remains usable */ }
}
