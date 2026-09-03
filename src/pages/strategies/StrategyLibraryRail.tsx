import React, { useMemo, useState } from 'react';
import { Bookmark, CircleDot, Clock3, FilterX, Grid2X2, Layers3, List, MoreHorizontal, Search, SlidersHorizontal, Star } from 'lucide-react';
import type { StrategyDefinition, TradeDirection } from '../../types';
import { StrategyArtwork, type StrategyArtworkVariant } from './StrategyArtwork';
import {
  strategyDataTier,
  strategyDisplayStatus,
  supportedDirections,
  type StrategyDataTier,
  type StrategyDisplayStatus,
} from './strategyPresentation';

export type StrategyLibraryViewMode = 'cards' | 'list';

export interface StrategyLibraryFilters {
  search: string;
  status: 'all' | StrategyDisplayStatus;
  category: 'all' | string;
  dataTier: 'all' | StrategyDataTier;
  direction: 'all' | TradeDirection;
  bookmarkedOnly: boolean;
}

interface StrategyLibraryRailProps {
  strategies: StrategyDefinition[];
  selectedStrategyId: string;
  bookmarks: Set<string>;
  filters: StrategyLibraryFilters;
  viewMode: StrategyLibraryViewMode;
  onViewModeChange: (mode: StrategyLibraryViewMode) => void;
  onFiltersChange: (filters: StrategyLibraryFilters) => void;
  onSelect: (strategyId: string) => void;
  onToggleBookmark: (strategyId: string) => void;
}

const DATA_TIERS: StrategyDataTier[] = ['Standard', 'Funding', 'Level 2', 'Cross-venue', 'Alternative data'];
const STATUSES: StrategyDisplayStatus[] = ['Verified', 'Candidate', 'Research Preview', 'Evidence Pending', 'Blocked'];

function strategyArtworkVariant(strategy: StrategyDefinition): StrategyArtworkVariant {
  const tags = strategy.categories.join(' ').toLowerCase();
  if (tags.includes('carry') || tags.includes('funding') || tags.includes('derivatives')) return 'funding';
  if (tags.includes('breakout') || tags.includes('event')) return 'breakout';
  if (tags.includes('volatility') || tags.includes('squeeze')) return 'volatility';
  if (tags.includes('trend') || tags.includes('regime') || tags.includes('vwap')) return 'trend';
  return 'fusion';
}

function directionLabel(strategy: StrategyDefinition): string {
  const directions = supportedDirections(strategy);
  return directions.length > 1 ? 'Long / Short' : directions[0] === 'LONG' ? 'Long' : 'Short';
}

function snapshotLabel(strategy: StrategyDefinition): string {
  const snapshot = strategy.latestSnapshot;
  if (!snapshot) return 'Evidence pending';
  const win = Number.isFinite(snapshot.winRatePct) ? `${snapshot.winRatePct.toFixed(1)}% win` : 'Win —';
  const rankScore = snapshot.score;
  const score = typeof rankScore === 'number' && Number.isFinite(rankScore) ? `score ${rankScore.toFixed(0)}` : 'score —';
  return `${win} · ${score}`;
}

export function filterStrategyLibrary(
  strategies: StrategyDefinition[],
  filters: StrategyLibraryFilters,
  bookmarks: Set<string>,
): StrategyDefinition[] {
  const query = filters.search.trim().toLowerCase();
  return strategies.filter((strategy) => {
    if (query) {
      const haystack = [strategy.name, strategy.summary, ...strategy.categories, ...strategy.dataRequirements].join(' ').toLowerCase();
      if (!haystack.includes(query)) return false;
    }
    if (filters.status !== 'all' && strategyDisplayStatus(strategy) !== filters.status) return false;
    if (filters.category !== 'all' && !strategy.categories.includes(filters.category)) return false;
    if (filters.dataTier !== 'all' && strategyDataTier(strategy) !== filters.dataTier) return false;
    if (filters.direction !== 'all' && !supportedDirections(strategy).includes(filters.direction)) return false;
    if (filters.bookmarkedOnly && !bookmarks.has(strategy.strategyId)) return false;
    return true;
  });
}

export function StrategyLibraryRail(props: StrategyLibraryRailProps) {
  const { strategies, selectedStrategyId, bookmarks, filters, viewMode, onViewModeChange, onFiltersChange, onSelect, onToggleBookmark } = props;
  const categories = useMemo(
    () => Array.from(new Set(strategies.flatMap((strategy) => strategy.categories))).sort((left, right) => left.localeCompare(right)),
    [strategies],
  );
  const visible = useMemo(() => filterStrategyLibrary(strategies, filters, bookmarks), [bookmarks, filters, strategies]);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const activeFilterCount = [
    filters.status !== 'all',
    filters.category !== 'all',
    filters.dataTier !== 'all',
    filters.direction !== 'all',
  ].filter(Boolean).length;
  const hasFilters = filters.search !== ''
    || filters.status !== 'all'
    || filters.category !== 'all'
    || filters.dataTier !== 'all'
    || filters.direction !== 'all'
    || filters.bookmarkedOnly;

  const patch = (next: Partial<StrategyLibraryFilters>) => onFiltersChange({ ...filters, ...next });
  const clear = () => onFiltersChange({
    search: '',
    status: 'all',
    category: 'all',
    dataTier: 'all',
    direction: 'all',
    bookmarkedOnly: false,
  });

  const bookmarkButton = (strategy: StrategyDefinition) => {
    const bookmarked = bookmarks.has(strategy.strategyId);
    return (
      <button
        type="button"
        className={`strategy-library-bookmark ${bookmarked ? 'is-saved' : ''}`}
        aria-pressed={bookmarked}
        aria-label={bookmarked ? `Remove ${strategy.name} bookmark` : `Bookmark ${strategy.name}`}
        title={bookmarked ? 'Remove bookmark' : 'Bookmark this strategy'}
        onClick={(event) => {
          event.stopPropagation();
          onToggleBookmark(strategy.strategyId);
        }}
      >
        <Bookmark size={12} fill={bookmarked ? 'currentColor' : 'none'} />
      </button>
    );
  };

  return (
    <aside className="strategy-library-rail" aria-label="Strategy library">
      <header className="strategy-rail-heading strategy-library-titlebar">
        <h1>STRATEGY LIBRARY</h1>
        <em>{visible.length} / {strategies.length}</em>
      </header>

      <div className="strategy-library-search-row">
        <label className="strategy-search-field">
          <Search size={14} aria-hidden="true" />
          <input
            type="search"
            value={filters.search}
            placeholder="Search strategies…"
            aria-label="Search strategy models"
            onChange={(event) => patch({ search: event.target.value })}
          />
        </label>
        <button
          type="button"
          className={`strategy-filter-icon ${filtersOpen ? 'active' : ''}`}
          aria-expanded={filtersOpen}
          aria-label={filtersOpen ? 'Hide strategy filters' : 'Show strategy filters'}
          title={activeFilterCount ? `${activeFilterCount} filter${activeFilterCount > 1 ? 's' : ''} applied` : 'Filters'}
          onClick={() => setFiltersOpen(!filtersOpen)}
        >
          <SlidersHorizontal size={13} />
          {activeFilterCount > 0 && <em>{activeFilterCount}</em>}
        </button>
      </div>

      {filtersOpen && (
        <div className="strategy-filter-grid" aria-label="Strategy filters">
          <label>
            <span className="sr-only">Status</span>
            <select value={filters.status} onChange={(event) => patch({ status: event.target.value as StrategyLibraryFilters['status'] })}>
              <option value="all">All statuses</option>
              {STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
            </select>
          </label>
          <label>
            <span className="sr-only">Category</span>
            <select value={filters.category} onChange={(event) => patch({ category: event.target.value })}>
              <option value="all">All categories</option>
              {categories.map((category) => <option key={category} value={category}>{category}</option>)}
            </select>
          </label>
          <label>
            <span className="sr-only">Data tier</span>
            <select value={filters.dataTier} onChange={(event) => patch({ dataTier: event.target.value as StrategyLibraryFilters['dataTier'] })}>
              <option value="all">All data tiers</option>
              {DATA_TIERS.map((tier) => <option key={tier} value={tier}>{tier}</option>)}
            </select>
          </label>
          <label>
            <span className="sr-only">Direction</span>
            <select value={filters.direction} onChange={(event) => patch({ direction: event.target.value as StrategyLibraryFilters['direction'] })}>
              <option value="all">Long &amp; Short</option>
              <option value="LONG">Long capable</option>
              <option value="SHORT">Short capable</option>
            </select>
          </label>
        </div>
      )}

      <div className="strategy-filter-actions">
        <div className="strategy-view-mode-toggle" role="group" aria-label="Strategy library display mode">
          <button type="button" className={viewMode === 'cards' ? 'active' : ''} aria-pressed={viewMode === 'cards'} onClick={() => onViewModeChange('cards')} title="Card View"><Grid2X2 size={13} /></button>
          <button type="button" className={viewMode === 'list' ? 'active' : ''} aria-pressed={viewMode === 'list'} onClick={() => onViewModeChange('list')} title="List View"><List size={14} /></button>
        </div>
        <button
          type="button"
          className={filters.bookmarkedOnly ? 'active' : ''}
          aria-pressed={filters.bookmarkedOnly}
          title="Show bookmarked strategies only"
          onClick={() => patch({ bookmarkedOnly: !filters.bookmarkedOnly })}
        >
          <Bookmark size={13} />Saved
        </button>
        <button
          type="button"
          className="strategy-filter-clear"
          disabled={!hasFilters}
          aria-label="Clear all filters"
          title="Clear all filters"
          onClick={clear}
        >
          <FilterX size={13} />
        </button>
      </div>

      <div className={`strategy-model-list is-${viewMode}`} role="listbox" aria-label="Strategy models">
        {visible.length ? visible.map((strategy) => {
          const status = strategyDisplayStatus(strategy);
          const selected = strategy.strategyId === selectedStrategyId;
          const dataTier = strategyDataTier(strategy);
          const intervals = strategy.supportedIntervals.slice(0, 3).join(' · ');
          return viewMode === 'cards' ? (
            <article
              key={strategy.strategyId}
              role="option"
              tabIndex={0}
              aria-selected={selected}
              aria-label={`${strategy.name}. ${status}. ${directionLabel(strategy)}. Select strategy.`}
              className={`strategy-library-card ${selected ? 'selected' : ''}`}
              onClick={() => onSelect(strategy.strategyId)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  onSelect(strategy.strategyId);
                }
              }}
            >
              <div className="strategy-library-card-topline">
                <em className={`strategy-status ${status.toLowerCase().replaceAll(' ', '-')}`}>{status}</em>
                {strategy.isCore && <span className="strategy-core-chip">Core <Star size={9} fill="currentColor" /></span>}
                {bookmarkButton(strategy)}
              </div>
              <div className="strategy-library-card-body">
                <StrategyArtwork variant={strategyArtworkVariant(strategy)} className="strategy-library-art" />
                <div className="strategy-library-card-copy">
                  <strong title={strategy.name}>{strategy.name}</strong>
                  <span className="strategy-library-card-meta">
                    <small><CircleDot size={9} />{directionLabel(strategy)}</small>
                    <small><Clock3 size={9} />{intervals || '—'}</small>
                    <small><Layers3 size={9} />{dataTier}</small>
                  </span>
                </div>
                <MoreHorizontal size={14} className="strategy-library-card-menu" aria-hidden="true" />
              </div>
            </article>
          ) : (
            <article
              key={strategy.strategyId}
              role="option"
              tabIndex={0}
              aria-selected={selected}
              aria-label={`${strategy.name}. ${status}. ${directionLabel(strategy)}. Select strategy.`}
              className={`strategy-library-row ${selected ? 'selected' : ''}`}
              onClick={() => onSelect(strategy.strategyId)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  onSelect(strategy.strategyId);
                }
              }}
            >
              <div className="strategy-library-row-main">
                <strong title={strategy.name}>{strategy.name}</strong>
                <span>{strategy.strategyId} · v{strategy.version}</span>
              </div>
              <em className={`strategy-status ${status.toLowerCase().replaceAll(' ', '-')}`}>{status}</em>
              <small>{directionLabel(strategy)}</small>
              <small>{intervals || '—'}</small>
              <small>{dataTier}</small>
              <small>{snapshotLabel(strategy)}</small>
              {bookmarkButton(strategy)}
            </article>
          );
        }) : (
          <div className="strategy-list-empty">
            <SlidersHorizontal size={18} />
            <strong>No matching models</strong>
            <span>Clear a filter to restore the catalogue.</span>
          </div>
        )}
      </div>
    </aside>
  );
}
