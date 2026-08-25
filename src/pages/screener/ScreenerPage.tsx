import React, { useEffect, useMemo, useState } from 'react';
import './ScreenerPage.css';
import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  ArrowUpDown,
  ChevronDown,
  ChevronUp,
  Copy,
  Crosshair,
  Download,
  Gauge,
  LayoutList,
  Radar,
  RefreshCw,
  Save,
  ScanSearch,
  Search,
  ShieldCheck,
  Sparkles,
  SlidersHorizontal,
  Star,
  Trash2,
  TrendingUp,
  Waves,
  X,
} from 'lucide-react';
import { CoinIcon } from '../../components/CoinIcon';
import {
  DataState,
  KeyValueList,
  Panel,
  PanelHeader,
  StatusBadge,
  WorkspacePageFrame,
} from '../../components/ui/WorkspacePrimitives';
import { formatCompactNumber, formatPercent, formatPrice } from '../../lib/marketPresentation';
import { WATCHLIST_CHANGE_EVENT, readWatchlistFavorites, toggleWatchlistFavorite } from '../../lib/watchlistFavorites';
import { notifyWorkspace } from '../../lib/workspaceFeedback';
import type { MarketWorkspaceProps } from '../pageTypes';
import type { DataState as MarketDataState, ReadinessTier, TradeDirection } from '../../types';
import {
  applyScreenerFilters,
  buildScreenerRows,
  resetScreenerFilters,
  screenerFiltersActive,
  screenerSummary,
  sortScreenerRows,
} from './screenerModel';
import {
  DEFAULT_SCREENER_FILTERS,
  DEFAULT_SCREENER_SORT,
  DEFAULT_SCREENER_WORKSPACE,
  type SavedScreenerScreen,
  type ScreenerColumnSet,
  type ScreenerFilters,
  type ScreenerMetric,
  type ScreenerRow,
  type ScreenerSort,
  type ScreenerSortKey,
  type ScreenerViewMode,
  type ScreenerWorkspaceState,
} from './screenerTypes';
import {
  loadSavedScreenerScreens,
  loadScreenerWorkspace,
  saveSavedScreenerScreens,
  saveScreenerWorkspace,
} from './screenerPersistence';

type ScreenerPageProps = MarketWorkspaceProps & { onOpenTrading: (symbol?: string) => void };

/**
 * Plain-language labels over the existing domain enums.
 *
 * `ReadinessTier` is the scanner's vocabulary and stays that way in the data. Only
 * the label is translated, so filter state and payloads never diverge from what
 * the user reads.
 */
const TIER_LABELS: Record<ReadinessTier, string> = {
  CONFIRMED: 'Opportunity',
  WATCHLIST: 'Watch',
  CAUTION: 'Risk',
  BLOCKED: 'Avoid',
};

const TIER_TONES: Record<ReadinessTier, 'positive' | 'info' | 'warning' | 'negative'> = {
  CONFIRMED: 'positive',
  WATCHLIST: 'info',
  CAUTION: 'warning',
  BLOCKED: 'negative',
};

/**
 * `DataState` is not a subset of the `UiDataState` that `StatusBadge` maps
 * internally — 'degraded' and 'not_configured' are absent from it — so the tone is
 * chosen here rather than passing `state=` and silently landing on undefined.
 */
const MARKET_STATE_TONES: Record<MarketDataState, 'positive' | 'warning' | 'negative'> = {
  live: 'positive',
  degraded: 'warning',
  not_configured: 'warning',
  unavailable: 'negative',
};

const MARKET_STATE_LABELS: Record<MarketDataState, string> = {
  live: 'Live market data',
  degraded: 'Degraded market data',
  not_configured: 'Provider not configured',
  unavailable: 'Market data unavailable',
};

/**
 * Row-cell equivalents of MARKET_STATE_LABELS. The row badge is a fixed-width
 * column, and printing the enum key was wrong twice over: `not_configured`
 * renders as "not configured", which is the codebase's vocabulary rather than
 * the product's, and it measures 125px against a 108px cell. The full sentence
 * is still reachable — it stays on the header chip and is passed as this
 * badge's `detail`, which becomes its title and accessible name.
 */
const MARKET_STATE_ROW_LABELS: Record<MarketDataState, string> = {
  live: 'Live',
  degraded: 'Delayed',
  not_configured: 'No feed',
  unavailable: 'No data',
};

/** Compact presets beat a free-text box for a liquidity floor most users only coarsely tune. */
const TURNOVER_STEPS: Array<{ value: number; label: string }> = [
  { value: 0, label: 'Any liquidity' },
  { value: 1_000_000, label: 'Over $1M / 24h' },
  { value: 10_000_000, label: 'Over $10M / 24h' },
  { value: 50_000_000, label: 'Over $50M / 24h' },
  { value: 250_000_000, label: 'Over $250M / 24h' },
];

/**
 * Sort keys offered per lens.
 *
 * These are the same `ScreenerSortKey`s the table headers exposed. The results
 * are read as a ranked list rather than a matrix, so the sort affordance is an
 * explicit control instead of a clickable header row — no sort direction becomes
 * unreachable in the process.
 */
const SORT_OPTIONS: Record<ScreenerColumnSet, Array<{ key: ScreenerSortKey; label: string }>> = {
  overview: [
    { key: 'rank', label: 'Rank' }, { key: 'score', label: 'Score' }, { key: 'tier', label: 'Signal' },
    { key: 'direction', label: 'Bias' }, { key: 'change', label: '24h' }, { key: 'turnover', label: 'Turnover' },
    { key: 'symbol', label: 'Symbol' }, { key: 'warnings', label: 'Flags' },
  ],
  momentum: [
    { key: 'rank', label: 'Rank' }, { key: 'score', label: 'Score' }, { key: 'change', label: '24h' },
    { key: 'range', label: 'Range' }, { key: 'momentum', label: 'Momentum' }, { key: 'structure', label: 'Structure' },
  ],
  derivatives: [
    { key: 'rank', label: 'Rank' }, { key: 'score', label: 'Score' }, { key: 'funding', label: 'Funding' },
    { key: 'openInterest', label: 'Open interest' }, { key: 'turnover', label: 'Turnover' }, { key: 'warnings', label: 'Flags' },
  ],
  quality: [
    { key: 'rank', label: 'Rank' }, { key: 'score', label: 'Score' }, { key: 'coverage', label: 'Coverage' },
    { key: 'warnings', label: 'Flags' },
  ],
};

/**
 * Which measures each lens prints on a card.
 *
 * Every id resolves to a field the scanner or the market snapshot actually
 * reported. Nothing here is derived or filled in, so a lens can only ever show
 * less, never something invented.
 */
type ScreenerMetricSlot =
  | 'price' | 'change' | 'turnover' | 'range' | 'momentum'
  | 'structure' | 'funding' | 'openInterest' | 'coverage' | 'warningCount';

const LENS_METRICS: Record<ScreenerColumnSet, ScreenerMetricSlot[]> = {
  overview: ['price', 'change', 'turnover'],
  momentum: ['change', 'range', 'momentum', 'structure'],
  derivatives: ['funding', 'openInterest', 'turnover'],
  quality: ['coverage', 'warningCount'],
};

/**
 * Metric column labels, hoisted out of `renderMetricSlot`.
 *
 * The column header and the cell beneath it now read the same entry, so a label
 * cannot be renamed in one place and left stale in the other. Every string here
 * was measured to fit the 70px `--screener-col-metric` cell at 10px/650.
 */
const METRIC_SLOT_LABELS: Record<ScreenerMetricSlot, string> = {
  price: 'Price',
  change: '24h',
  turnover: 'Turnover',
  range: 'Range',
  momentum: 'Momentum',
  structure: 'Structure',
  funding: 'Funding',
  openInterest: 'Open int.',
  coverage: 'Coverage',
  warningCount: 'Flags',
};

/**
 * The sort key each metric column is the affordance for.
 *
 * `price` is absent because `ScreenerSortKey` has no price ordering — the header
 * for it therefore renders as a plain label rather than a dead button.
 */
const METRIC_SLOT_SORT: Partial<Record<ScreenerMetricSlot, ScreenerSortKey>> = {
  change: 'change',
  turnover: 'turnover',
  range: 'range',
  momentum: 'momentum',
  structure: 'structure',
  funding: 'funding',
  openInterest: 'openInterest',
  coverage: 'coverage',
  warningCount: 'warnings',
};

/**
 * Which optional badges the row's state cell carries, per lens.
 *
 * These two predicates are the single source consumed by BOTH the column header
 * and the row body. The header reserves one `--screener-col-badge` slot per
 * badge, so if a lens ever gains or loses a badge the header cannot silently
 * keep reserving the old number of columns.
 */
const showConfluenceBadge = (set: ScreenerColumnSet) => set === 'momentum' || set === 'quality';
const showFeedBadge = (set: ScreenerColumnSet) => set === 'quality';

const COLUMN_SET_OPTIONS: Array<{ id: ScreenerColumnSet; label: string; icon: React.ComponentType<{ size?: number }> }> = [
  { id: 'overview', label: 'Overview', icon: LayoutList },
  { id: 'momentum', label: 'Momentum', icon: Waves },
  { id: 'derivatives', label: 'Derivatives', icon: Gauge },
  { id: 'quality', label: 'Quality', icon: ShieldCheck },
];

const PRESETS: Array<{ id: string; label: string; detail: string; state: Omit<Partial<ScreenerWorkspaceState>, 'filters'> & { filters: Partial<ScreenerFilters> } }> = [
  { id: 'all', label: 'All signals', detail: 'Full ranked candidate set', state: { filters: {}, sort: DEFAULT_SCREENER_SORT, columnSet: 'overview', viewMode: 'table' } },
  { id: 'conviction', label: 'High conviction', detail: '75+ · aligned · guarded · liquid', state: { filters: { minScore: 75, minTurnoverUsd: 10_000_000, guard: 'PASS', confluence: 'ALIGNED', dataQuality: 'LIVE' }, sort: { key: 'score', ascending: false }, columnSet: 'overview', viewMode: 'table' } },
  { id: 'momentum', label: 'Momentum leaders', detail: 'Positive tape · 65+ momentum', state: { filters: { performance: 'GAINERS', minMomentum: 65, guard: 'PASS' }, sort: { key: 'momentum', ascending: false }, columnSet: 'momentum', viewMode: 'table' } },
  { id: 'shorts', label: 'Short pressure', detail: 'Falling short-biased candidates', state: { filters: { direction: 'SHORT', performance: 'LOSERS', minScore: 60 }, sort: { key: 'score', ascending: false }, columnSet: 'derivatives', viewMode: 'table' } },
  { id: 'risk', label: 'Risk radar', detail: 'Flagged or incomplete evidence', state: { filters: { dataQuality: 'PARTIAL' }, sort: { key: 'warnings', ascending: false }, columnSet: 'quality', viewMode: 'table' } },
];

const directionTone = (direction: TradeDirection) => direction === 'LONG' ? 'positive' : 'negative';
const changeTone = (value: number) => !Number.isFinite(value) ? 'neutral' : value > 0 ? 'positive' : value < 0 ? 'negative' : 'neutral';
const usdCompact = (value: number | null) => value == null || !Number.isFinite(value) ? '—' : `$${formatCompactNumber(value)}`;
const confluenceLabel = (row: ScreenerRow) => row.timeframeConfluenceState ?? (row.timeframeConfluence ? 'ALIGNED' : 'NOT ALIGNED');

/** Renders a metric or says plainly that it is missing. Never prints a stand-in number. */
function MetricValue({ metric, render }: { metric: ScreenerMetric; render: (value: number) => string }) {
  if (metric.state === 'UNAVAILABLE' || metric.value == null) {
    return <span className="apex-screener-unavailable" title={metric.note ?? undefined}>Unavailable</span>;
  }
  return <>{render(metric.value)}</>;
}

function ScoreGlyph({ value, tone }: { value: number; tone: ReadinessTier }) {
  const safe = Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
  return <span className={`apex-screener-score-glyph tone-${tone.toLowerCase()}`} aria-label={`Scanner score ${Math.round(safe)} out of 100`}>
    <b>{Math.round(safe)}</b>
    <i style={{ '--score-fill': `${safe}%` } as React.CSSProperties} />
  </span>;
}

/**
 * The five published score factors as one small column chart.
 *
 * This is the page's signature detail: it makes the shape of the evidence legible
 * at a glance without repeating five numbers on every card. An unavailable factor
 * is drawn as a full-height hatched column, never as a short one, because a bar
 * scaled to zero would read as "scored zero" instead of "not reported" — the same
 * convention `.apex-screener-factor-meter i.empty` already uses in the detail
 * panel.
 */
function EvidenceEqualizer({ row }: { row: ScreenerRow }) {
  const readings = row.factors.map((factor) => ({
    id: factor.id,
    label: factor.label,
    value: factor.metric.state === 'AVAILABLE' && factor.metric.value != null
      ? Math.max(0, Math.min(100, factor.metric.value))
      : null,
    note: factor.metric.note,
  }));
  const summary = readings
    .map((reading) => `${reading.label} ${reading.value == null ? 'unavailable' : Math.round(reading.value)}`)
    .join(', ');
  return (
    <span className="apex-screener-equalizer" role="img" aria-label={`Score factors: ${summary}`}>
      {readings.map((reading, index) => (
        <i
          key={reading.id}
          className={reading.value == null ? 'absent' : undefined}
          title={reading.value == null
            ? `${reading.label}: ${reading.note ?? 'not reported by the scanner.'}`
            : `${reading.label}: ${Math.round(reading.value)} of 100`}
          style={{ '--bar': `${reading.value ?? 100}%`, '--bar-index': index } as React.CSSProperties}
        />
      ))}
    </span>
  );
}

function relativeAge(observedAtMs: number | null, nowMs: number): string | null {
  if (observedAtMs == null) return null;
  const ageMs = nowMs - observedAtMs;
  if (!Number.isFinite(ageMs) || ageMs < 0) return null;
  if (ageMs < 60_000) return `${Math.max(1, Math.round(ageMs / 1000))}s ago`;
  if (ageMs < 3_600_000) return `${Math.round(ageMs / 60_000)}m ago`;
  return `${Math.round(ageMs / 3_600_000)}h ago`;
}

/** Above this the market snapshot is old enough that the user should be told. */
const STALE_AFTER_MS = 180_000;

function FactorBreakdown({ row }: { row: ScreenerRow }) {
  return (
    <ul className="apex-screener-factors">
      {row.factors.map((factor) => {
        const value = factor.metric.state === 'AVAILABLE' ? factor.metric.value : null;
        return (
          <li key={factor.id}>
            <span className="apex-screener-factor-label">{factor.label}</span>
            <span className="apex-screener-factor-meter" aria-hidden="true">
              {value == null ? <i className="empty" /> : <i style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />}
            </span>
            <span className="apex-screener-factor-value">
              {value == null
                ? <span className="apex-screener-unavailable" title={factor.metric.note ?? undefined}>n/a</span>
                : Math.round(value)}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * The score cut points `deriveReadinessTier` actually compares against
 * (`src/lib/scoring.ts:246`), expressed as a band axis for the gauge.
 *
 * This is not a re-derivation of the tier — the tier stays the scanner's, read
 * from `row.readinessTier`. These are the published thresholds that decided it,
 * which is the one thing a bare 0-100 number cannot say on its own: how much room
 * is left before the verdict changes.
 *
 * The axis depends on the guard because the real function does. A passing guard
 * splits the range at 55 and 75. A failing guard discards that ladder entirely and
 * splits at 65 only, between BLOCKED and CAUTION — so an 83 with a failed guard is
 * CAUTION, not CONFIRMED. Drawing the passing-guard bands unconditionally is what
 * put an 83 inside an "Opportunity" band next to a RISK badge: a gauge
 * contradicting its own label, and an invented 35 threshold that exists nowhere in
 * the scoring code. Any future edit here must be checked against scoring.ts, not
 * chosen for even spacing.
 */
function tierBands(guardPass: boolean): Array<{ tier: ReadinessTier; from: number }> {
  return guardPass
    ? [{ tier: 'CAUTION', from: 0 }, { tier: 'WATCHLIST', from: 55 }, { tier: 'CONFIRMED', from: 75 }]
    : [{ tier: 'BLOCKED', from: 0 }, { tier: 'CAUTION', from: 65 }];
}

/**
 * Geometry for the score arc, in the SVG's own 200×124 user space.
 *
 * One semicircle of radius 82 centred at (100,100): fraction 0 is the left
 * terminus and 1 the right. The zone bands, the value marker and the tick all
 * read their position from these two helpers, so no part of the dial can disagree
 * with another part about where a score sits.
 */
const ARC_CENTRE = { x: 100, y: 100 };
const ARC_RADIUS = 82;
const arcPoint = (fraction: number, radius: number = ARC_RADIUS) => {
  const angle = Math.PI * (1 - Math.max(0, Math.min(1, fraction)));
  return { x: ARC_CENTRE.x + radius * Math.cos(angle), y: ARC_CENTRE.y - radius * Math.sin(angle) };
};
const arcPath = (from: number, to: number) => {
  const start = arcPoint(from);
  const end = arcPoint(to);
  return `M ${start.x.toFixed(2)} ${start.y.toFixed(2)} A ${ARC_RADIUS} ${ARC_RADIUS} 0 0 1 ${end.x.toFixed(2)} ${end.y.toFixed(2)}`;
};

/**
 * The panel's score gauge: one arc, banded by the real tier thresholds.
 *
 * This replaces a stack of two pictures of the same fact — a big numeral over a
 * segmented bar, with a second labelled scale under it repeating the same cut
 * points a third time. One representation now carries all of it: the arc's own
 * segments ARE the Avoid/Risk/Watch/Opportunity zones, the marker is the score,
 * the numeral sits inside the arc it belongs to, and the row beneath is a compact
 * colour key — a legend, not a second data visualization.
 *
 * The zone boundaries come from `tierBands(guardPass)`, which mirrors
 * `deriveReadinessTier` exactly: two zones under a failed guard, three under a
 * passing one. That is the whole reason the arc cannot contradict the badge beside
 * it — the band the marker lands in IS the verdict. The caption keeps the one
 * reading a bare 0-100 cannot give, distance to the next verdict, from those same
 * published cut points.
 *
 * The numeral is SVG `text` with `text-anchor="middle"`, not an HTML box: a
 * two-digit and a three-digit score are then centred by construction on every
 * update, with no width to re-measure and nothing to shift when the value changes
 * under a live refresh.
 */
function ScoreArc({ score, tier, guardPass, coveragePct }: { score: number; tier: ReadinessTier; guardPass: boolean; coveragePct: number | null }) {
  const safe = Math.max(0, Math.min(100, Number.isFinite(score) ? score : 0));
  const shown = Math.round(safe);
  const bands = tierBands(guardPass).map((band, index, all) => ({
    ...band,
    to: index + 1 < all.length ? all[index + 1].from : 100,
  }));
  const nextBand = bands.find((band) => band.from > safe) ?? null;
  const markerInner = arcPoint(safe / 100, ARC_RADIUS - 21);
  const markerOuter = arcPoint(safe / 100, ARC_RADIUS + 8);
  const markerTip = arcPoint(safe / 100, ARC_RADIUS);
  return (
    <div className={`apex-screener-gauge apex-screener-gauge-arc tone-${tier.toLowerCase()}`}>
      <svg
        className="apex-screener-arc"
        viewBox="0 0 200 124"
        role="img"
        aria-label={`Scanner score ${shown} of 100, ${TIER_LABELS[tier]}`}
      >
        <path className="apex-screener-arc-track" d={arcPath(0, 1)} />
        {bands.map((band) => <path
          key={band.tier}
          className={`apex-screener-arc-band tone-${band.tier.toLowerCase()}${band.tier === tier ? ' current' : ''}`}
          d={arcPath(band.from / 100, band.to / 100)}
        ><title>{`${TIER_LABELS[band.tier]}: ${band.from} to ${band.to}`}</title></path>)}
        <line
          className="apex-screener-arc-marker-halo"
          x1={markerInner.x} y1={markerInner.y} x2={markerOuter.x} y2={markerOuter.y}
        />
        <line
          className="apex-screener-arc-marker"
          x1={markerInner.x} y1={markerInner.y} x2={markerOuter.x} y2={markerOuter.y}
        />
        <circle className="apex-screener-arc-marker-tip" cx={markerTip.x} cy={markerTip.y} r={4.5} />
        <text className="apex-screener-arc-value" x={ARC_CENTRE.x} y={86} textAnchor="middle">{shown}</text>
        <text className="apex-screener-arc-tier" x={ARC_CENTRE.x} y={110} textAnchor="middle">{TIER_LABELS[tier]}</text>
      </svg>
      <ul className="apex-screener-arc-key">
        {bands.map((band) => <li
          key={band.tier}
          className={`tone-${band.tier.toLowerCase()}${band.tier === tier ? ' current' : ''}`}
        >
          <i aria-hidden="true" />
          <b>{TIER_LABELS[band.tier]}</b>
          <span>{band.from}–{band.to}</span>
        </li>)}
      </ul>
      <p className="apex-screener-gauge-caption">
        {nextBand
          ? <><b>{Math.round(nextBand.from - safe)}</b> points to {TIER_LABELS[nextBand.tier]} at {nextBand.from}</>
          : <>Top zone of this axis</>}
        <i aria-hidden="true" />
        {coveragePct == null ? 'coverage not reported' : `${Math.round(coveragePct)}% evidence coverage`}
      </p>
    </div>
  );
}

export function ScreenerPage(props: ScreenerPageProps) {
  const [initialWorkspace] = useState(() => loadScreenerWorkspace());
  const [filters, setFilters] = useState<ScreenerFilters>(() => initialWorkspace.filters);
  const [sort, setSort] = useState<ScreenerSort>(() => initialWorkspace.sort);
  const [columnSet, setColumnSet] = useState<ScreenerColumnSet>(() => initialWorkspace.columnSet);
  const viewMode: ScreenerViewMode = 'table';
  const [activePresetId, setActivePresetId] = useState('all');
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [favorites, setFavorites] = useState<Set<string>>(() => readWatchlistFavorites());
  const [savedScreens, setSavedScreens] = useState<SavedScreenerScreen[]>(() => loadSavedScreenerScreens());
  const [activeScreenId, setActiveScreenId] = useState('');
  const [saveDraft, setSaveDraft] = useState('');
  const [saveOpen, setSaveOpen] = useState(false);

  useEffect(() => {
    const sync = () => setFavorites(readWatchlistFavorites());
    window.addEventListener(WATCHLIST_CHANGE_EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(WATCHLIST_CHANGE_EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  useEffect(() => {
    saveScreenerWorkspace({ filters, sort, columnSet, viewMode });
  }, [columnSet, filters, sort, viewMode]);

  const rows = useMemo(
    () => buildScreenerRows([...props.longCandidates, ...props.shortCandidates], props.tickers),
    [props.longCandidates, props.shortCandidates, props.tickers],
  );
  const visible = useMemo(
    () => sortScreenerRows(applyScreenerFilters(rows, filters, favorites), sort),
    [favorites, filters, rows, sort],
  );
  const summary = useMemo(() => screenerSummary(rows, visible), [rows, visible]);
  const filtersActive = screenerFiltersActive(filters);

  /**
   * Which row the detail panel describes.
   *
   * This used to read `props.selectedSymbol` first — the app-global symbol, whose
   * default is the Trading page's, not the screener's. The panel therefore opened
   * on BTC no matter where BTC ranked, which contradicted the ranked list beside
   * it. The screener now keeps its own pick: nothing is picked until the user
   * picks something, and until then the panel describes whatever is currently
   * first in the active sort, so changing the sort moves the detail with it.
   *
   * `rows.find` stays as the last resort so a pick that the filters have since
   * excluded is still described rather than blanking the panel; `visible[0]`
   * deliberately outranks it, so a filtered-out pick yields to the visible rank 1.
   */
  const [pickedSymbol, setPickedSymbol] = useState<string | null>(null);
  const selected = (pickedSymbol == null ? null : visible.find((row) => row.symbol === pickedSymbol))
    || visible[0]
    || (pickedSymbol == null ? null : rows.find((row) => row.symbol === pickedSymbol))
    || null;

  const pickRow = (symbol: string) => {
    setPickedSymbol(symbol);
    props.onSelectSymbol(symbol);
  };

  /**
   * The detail panel's prose, de-duplicated where it is read rather than where it
   * is produced.
   *
   * `screenerModel.ts` is the scanner-facing contract and 23 unit tests assert its
   * exact strings, so nothing below changes the model. What was wrong is only what
   * the panel DID with the model's output:
   *
   * - Why it surfaced printed `Liquidity scored 100 of 100.` three rules under a
   *   bar chart already showing Liquidity at 100. Those lines are the bar chart
   *   read aloud, so they are dropped here; the reasons that carry an actual
   *   judgement (the checklist verdict, timeframe agreement) stay.
   * - Risk notes printed the guard's own wording AND the screener's paraphrase of
   *   the same objection — "Cross-timeframe contradiction: 15m and 1h momentum
   *   signals conflict" followed by "15m and 1h momentum disagree." Warnings are
   *   now collapsed by topic with the first wording winning, and `warningsFor`
   *   emits the guard's authoritative phrasing first, so the surviving line is
   *   always the more specific one.
   */
  const factorRestatement = /^(.+?) scored \d+ of 100\.$/;
  const factorLabels = new Set((selected?.factors ?? []).map((factor) => factor.label.toLowerCase()));
  const detailReasons = (selected?.reasons ?? []).filter((reason) => {
    const restated = factorRestatement.exec(reason);
    return !(restated && factorLabels.has(restated[1].toLowerCase()));
  });

  const warningTopic = (warning: string) => {
    const text = warning.toLowerCase();
    if (text.includes('timeframe') || text.includes('confluence') || (text.includes('15m') && text.includes('1h'))) return 'timeframe';
    if (text.includes('turnover') || text.includes('liquid') || text.includes('volume')) return 'liquidity';
    if (text.includes('spread') || text.includes('depth') || text.includes('order book')) return 'spread';
    if (text.includes('funding')) return 'funding';
    if (text.includes('coverage') || text.includes('partial') || text.includes('incomplete')) return 'coverage';
    return text;
  };
  const detailWarnings = (selected?.warnings ?? []).filter((warning, index, all) =>
    all.findIndex((other) => warningTopic(other) === warningTopic(warning)) === index);

  /**
   * The one sentence the bar chart cannot say.
   *
   * Both operands are published factor values, so this interprets the evidence
   * without adding any: it names which factor is holding the rank up and which one
   * is holding it back. That is the reading a user would otherwise have to do by
   * eye across five bars, and it is what Why it surfaced should lead with instead
   * of restating the bars.
   */
  const factorReadings = (selected?.factors ?? [])
    .map((factor) => ({
      label: factor.label,
      value: factor.metric.state === 'AVAILABLE' ? factor.metric.value : null,
    }))
    .filter((reading): reading is { label: string; value: number } => reading.value != null);
  const strongestFactor = factorReadings.reduce<{ label: string; value: number } | null>(
    (best, reading) => best == null || reading.value > best.value ? reading : best, null);
  const weakestFactor = factorReadings.reduce<{ label: string; value: number } | null>(
    (worst, reading) => worst == null || reading.value < worst.value ? reading : worst, null);
  const detailThesis = strongestFactor && weakestFactor && strongestFactor.label !== weakestFactor.label
    ? `${strongestFactor.label} at ${Math.round(strongestFactor.value)} carries this rank. ${weakestFactor.label} at ${Math.round(weakestFactor.value)} is the binding constraint.`
    : null;

  // The freshest input timestamp any row reported: a real observation time from the
  // market snapshot, not a render clock dressed up as one.
  const observedAtMs = rows.reduce<number | null>(
    (latest, row) => row.observedAtMs != null && (latest == null || row.observedAtMs > latest) ? row.observedAtMs : latest,
    null,
  );
  const nowMs = Date.now();
  const age = relativeAge(observedAtMs, nowMs);
  const stale = observedAtMs != null && nowMs - observedAtMs > STALE_AFTER_MS;

  const toggleSort = (key: ScreenerSortKey) => {
    setSort((current) => current.key === key
      ? { key, ascending: !current.ascending }
      // Identity columns read naturally ascending; measures read best highest-first.
      : { key, ascending: key === 'rank' || key === 'symbol' || key === 'direction' || key === 'tier' });
  };

  const toggleFavorite = (symbol: string) => {
    const existed = favorites.has(symbol);
    setFavorites(toggleWatchlistFavorite(favorites, symbol));
    notifyWorkspace({ title: existed ? 'Removed from watchlist' : 'Added to watchlist', detail: symbol, tone: 'success' });
  };

  const applyWorkspace = (workspace: ScreenerWorkspaceState, screenId = '') => {
    setFilters({ ...DEFAULT_SCREENER_FILTERS, ...workspace.filters });
    setSort(workspace.sort);
    setColumnSet(workspace.columnSet);
    setActiveScreenId(screenId);
    setActivePresetId('');
  };

  const applyPreset = (preset: (typeof PRESETS)[number]) => {
    applyWorkspace({
      filters: { ...DEFAULT_SCREENER_FILTERS, ...preset.state.filters },
      sort: preset.state.sort ?? DEFAULT_SCREENER_SORT,
      columnSet: preset.state.columnSet ?? DEFAULT_SCREENER_WORKSPACE.columnSet,
      viewMode: preset.state.viewMode ?? DEFAULT_SCREENER_WORKSPACE.viewMode,
    });
    setActivePresetId(preset.id);
  };

  const saveNamedScreen = () => {
    const name = saveDraft.trim().slice(0, 48);
    if (!name) return;
    const screen: SavedScreenerScreen = {
      id: `screen-${Date.now().toString(36)}`,
      name,
      createdAt: Date.now(),
      workspace: { filters, sort, columnSet, viewMode },
    };
    const next = [screen, ...savedScreens.filter((item) => item.name.toLowerCase() !== name.toLowerCase())].slice(0, 12);
    setSavedScreens(next);
    saveSavedScreenerScreens(next);
    setActiveScreenId(screen.id);
    setSaveDraft('');
    setSaveOpen(false);
    notifyWorkspace({ title: 'Screen saved', detail: name, tone: 'success' });
  };

  const deleteActiveScreen = () => {
    if (!activeScreenId) return;
    const removed = savedScreens.find((screen) => screen.id === activeScreenId);
    const next = savedScreens.filter((screen) => screen.id !== activeScreenId);
    setSavedScreens(next);
    saveSavedScreenerScreens(next);
    setActiveScreenId('');
    if (removed) notifyWorkspace({ title: 'Saved screen removed', detail: removed.name, tone: 'info' });
  };

  const exportVisible = () => {
    if (!visible.length) return;
    const factor = (row: ScreenerRow, id: ScreenerRow['factors'][number]['id']) => row.factors.find((item) => item.id === id)?.metric.value ?? '';
    const quote = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;
    const header = ['Rank', 'Symbol', 'Bias', 'Score', 'Readiness', '24h change %', '24h turnover USD', '24h range %', 'Funding rate', 'Open interest USD', 'Momentum', 'Order flow', 'Structure', 'Liquidity', 'Coverage %', 'Confluence', 'Guard pass', 'Warnings', 'Data state'];
    const lines = visible.map((row) => [row.rank, row.symbol, row.direction, row.score, row.readinessTier, row.priceChange24hPct, row.turnover24h, row.range24hPct.value ?? '', row.fundingRate.value ?? '', row.openInterest.value ?? '', factor(row, 'momentum'), factor(row, 'orderFlow'), factor(row, 'structure'), factor(row, 'liquidity'), row.scoreCoveragePct ?? '', row.timeframeConfluenceState ?? '', row.guardPass, row.warnings.join(' | '), row.dataState].map(quote).join(','));
    const blob = new Blob([[header.map(quote).join(','), ...lines].join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `apex-crypto-screen-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
    notifyWorkspace({ title: 'Screener exported', detail: `${visible.length} visible rows`, tone: 'success' });
  };

  const copySymbol = (symbol: string) => {
    // Clipboard access can be denied. The failure is reported, not swallowed.
    if (typeof navigator === 'undefined' || !navigator.clipboard) {
      notifyWorkspace({ title: 'Clipboard unavailable', detail: 'This browser did not expose clipboard access.', tone: 'error' });
      return;
    }
    void navigator.clipboard.writeText(symbol)
      .then(() => notifyWorkspace({ title: 'Symbol copied', detail: symbol, tone: 'success' }))
      .catch(() => notifyWorkspace({ title: 'Copy failed', detail: `${symbol} could not be copied to the clipboard.`, tone: 'error' }));
  };

  const openInTrading = (symbol: string) => {
    setPickedSymbol(symbol);
    props.onSelectSymbol(symbol);
    props.onOpenTrading(symbol);
    notifyWorkspace({
      title: `${symbol} opened in Trading`,
      detail: 'The screener is informational; review the plan and risk before any order.',
      tone: 'info',
    });
  };

  const factorMetric = (row: ScreenerRow, id: ScreenerRow['factors'][number]['id']): ScreenerMetric =>
    row.factors.find((factor) => factor.id === id)?.metric
    ?? { state: 'UNAVAILABLE', value: null, note: 'The scanner did not publish this factor.' };

  /**
   * One measure on a row.
   *
   * The label is no longer written here — it comes from `METRIC_SLOT_LABELS`,
   * which the column header reads too, so the two can never disagree. The label
   * stays in the DOM on every row (it is the cell's accessible name and the only
   * label present once the header is hidden at narrow widths) and is visually
   * folded away by CSS while the header is on screen.
   */
  const renderMetricSlot = (row: ScreenerRow, slot: ScreenerMetricSlot) => {
    const cell = (node: React.ReactNode, tone: 'positive' | 'negative' | 'neutral' = 'neutral') =>
      <span key={slot} className={`apex-screener-metric ${tone}`}><span>{METRIC_SLOT_LABELS[slot]}</span><b>{node}</b></span>;
    switch (slot) {
      case 'price': return cell(Number.isFinite(row.lastPrice)
        ? formatPrice(row.lastPrice)
        : <span className="apex-screener-unavailable" title="No last price was reported for this market.">Unavailable</span>);
      case 'change': return cell(formatPercent(row.priceChange24hPct), changeTone(row.priceChange24hPct));
      case 'turnover': return cell(usdCompact(Number.isFinite(row.turnover24h) ? row.turnover24h : null));
      case 'range': return cell(<MetricValue metric={row.range24hPct} render={(value) => `${value.toFixed(2)}%`} />);
      case 'momentum': return cell(<MetricValue metric={factorMetric(row, 'momentum')} render={(value) => Math.round(value).toString()} />);
      case 'structure': return cell(<MetricValue metric={factorMetric(row, 'structure')} render={(value) => Math.round(value).toString()} />);
      case 'funding': return cell(<MetricValue metric={row.fundingRate} render={(value) => `${(value * 100).toFixed(4)}%`} />);
      case 'openInterest': return cell(<MetricValue metric={row.openInterest} render={(value) => `$${formatCompactNumber(value)}`} />);
      case 'coverage': return cell(row.scoreCoveragePct == null
        ? <span className="apex-screener-unavailable" title="The scanner did not report evidence coverage.">Unavailable</span>
        : `${Math.round(row.scoreCoveragePct)}%`);
      case 'warningCount': return cell(row.warnings.length);
      default: return null;
    }
  };

  /**
   * The ranked stream's column header.
   *
   * Item this replaces: a left-packed `.apex-screener-sortbar` chip group that had
   * no column geometry at all, so nothing above the stream lined up with anything
   * in it and the chip order did not even match the data order. The header now
   * mirrors the row's box model exactly — same grid, same transparent 1px border,
   * same `--screener-row-pad-left`, same `--screener-row-gap`, and every cell
   * width read from the same `--screener-col-*` token the body cell reads. It
   * lives INSIDE `.apex-screener-stream` and is sticky, because a header outside
   * the scroller would be a scrollbar-width wider and that surplus would land
   * entirely on the one flexible cell, re-creating the divergence somewhere new.
   *
   * `claimedSortKeys` is what makes the header a complete replacement for the
   * chips rather than a partial one: each key is claimed by the first column that
   * can express it, so no key gets two competing affordances, and anything left
   * unclaimed falls through to the chip bar below instead of becoming unreachable.
   */
  const claimedSortKeys = new Set<ScreenerSortKey>();
  const columnHead = (key: ScreenerSortKey | null, label: string, className: string, id: string, name = label) => {
    if (key == null || !SORT_OPTIONS[columnSet].some((option) => option.key === key) || claimedSortKeys.has(key)) {
      return <span key={id} className={className}>{label}</span>;
    }
    claimedSortKeys.add(key);
    const active = sort.key === key;
    return <button
      key={id}
      type="button"
      className={`${className} apex-screener-col-sort${active ? ' active' : ''}`}
      aria-pressed={active}
      aria-label={name === label ? undefined : name}
      title={active
        ? `Sorted by ${name}, ${sort.ascending ? 'ascending' : 'descending'} — click to reverse`
        : `Sort by ${name}`}
      onClick={() => toggleSort(key)}
    >
      {label}
      {active && (sort.ascending ? <ChevronUp size={10} /> : <ChevronDown size={10} />)}
    </button>;
  };

  const columnsHeader = <div className="apex-screener-columns">
    <div className="apex-screener-columns-main">
      {/* `#` is the stable full-universe signal-strength rank (screenerTypes.ts,
          `signalStrengthOf` in screenerModel.ts), not this view's row position — so
          under a Turnover sort the leading row can legitimately read #14. The glyph
          is all that fits a 17px cell, so the semantic is carried by the accessible
          name and tooltip instead. */}
      {columnHead('rank', '#', 'apex-screener-col-rank', 'rank', 'signal strength rank')}
      <span className="apex-screener-col-symbol">
        {columnHead('symbol', 'Symbol', 'apex-screener-col-name', 'symbol')}
        {columnHead('score', 'Score', 'apex-screener-col-score', 'score')}
      </span>
      {columnHead('direction', 'Bias', 'apex-screener-col-bias', 'bias')}
      {/* The factor column is a glyph, not a number, so its header is the same
          icon that heads Score architecture in the detail panel rather than a
          four-letter abbreviation crushed into 34px. */}
      <span
        className="apex-screener-col-factors"
        role="img"
        aria-label="Score factors"
        title="Score factors: liquidity, momentum, order flow, structure and funding"
      ><Activity size={11} /></span>
      <span className="apex-screener-col-metrics">
        {LENS_METRICS[columnSet].map((slot) =>
          columnHead(METRIC_SLOT_SORT[slot] ?? null, METRIC_SLOT_LABELS[slot], 'apex-screener-col-metric', slot))}
      </span>
      <span className="apex-screener-col-state">
        {columnHead('tier', 'Signal', 'apex-screener-col-badge', 'tier')}
        {showConfluenceBadge(columnSet) && <span key="confluence" className="apex-screener-col-badge">Timeframes</span>}
        {showFeedBadge(columnSet) && <span key="feed" className="apex-screener-col-badge">Feed</span>}
        {columnHead('warnings', 'Guard', 'apex-screener-col-guard', 'guard')}
      </span>
    </div>
    <span className="apex-screener-col-actions" aria-hidden="true" />
  </div>;

  // Structural guarantee, not a claim: every sort key the current lens offers is
  // reachable from a column above, so this is empty for all four lenses today. If
  // a future lens gains a sort key with no column to hang it on, the chip row
  // reappears automatically instead of the key going missing.
  const unclaimedSorts = SORT_OPTIONS[columnSet].filter((option) => !claimedSortKeys.has(option.key));

  const resultsBody = props.loading && !rows.length
    ? <DataState availability="loading" title="Scanning markets" detail="Ranked results appear as soon as the scanner returns its candidate set." />
    : !rows.length
      ? <DataState
        availability={props.dataState === 'unavailable' ? 'error' : 'empty'}
        title={props.dataState === 'unavailable' ? 'Market scan unavailable' : 'No scanner results yet'}
        detail={props.dataState === 'unavailable'
          ? 'The scanner did not return a candidate set. Retry, or check provider status in Settings.'
          : 'The scanner has not published any candidates for the current universe and liquidity floor.'}
        onRetry={props.onRefresh}
      />
      : !visible.length
        ? <div className="apex-screener-empty">
          <ScanSearch size={24} />
          <strong>No symbols match these filters</strong>
          <span>{summary.scanned} symbol{summary.scanned === 1 ? '' : 's'} were scanned, but none satisfy every active filter. Widen the score or liquidity floor, or clear the filters.</span>
          <button type="button" className="apex-v3-button primary" onClick={() => setFilters(resetScreenerFilters())}>Reset filters</button>
        </div>
        : <div className="apex-v3-table-scroll apex-screener-stream">
          {columnsHeader}
          <ol className="apex-screener-rows">
            {visible.map((row, rowIndex) => {
              const isSelected = row.symbol === selected?.symbol;
              const isFavorite = favorites.has(row.symbol);
              return (
                <li
                  key={row.symbol}
                  // `flagged` is what makes the hover tint signal-aware: guard
                  // failure is the row's dominant fact, so it outranks the bias
                  // hue in the hover rules. Selection stays unconditionally green
                  // and keeps its rail, so hover and selected never converge.
                  className={`apex-screener-row ${row.direction.toLowerCase()}${row.guardPass ? '' : ' flagged'}${isSelected ? ' selected' : ''}`}
                  // Capped so a long result set does not stagger itself into a
                  // visible wave; past the first screenful the delay is constant.
                  style={{ '--row-index': Math.min(rowIndex, 12) } as React.CSSProperties}
                >
                  <button
                    type="button"
                    className="apex-screener-row-main"
                    aria-current={isSelected || undefined}
                    onClick={() => pickRow(row.symbol)}
                  >
                    <span className="apex-screener-row-rank">{row.rank}</span>
                    <span className="apex-screener-symbol">
                      <CoinIcon symbol={row.symbol} size={26} />
                      {/* The symbol block is the row's only flexible cell, so the pair
                          label is the designated thing that truncates. It ellipsizes on
                          the longest tickers (1000PEPE-USDT needs 79px of a 68px slot),
                          and title is what makes the full pair recoverable on hover — it
                          stays in the accessible name either way, since the text is not
                          removed from the DOM. */}
                      <span><strong>{row.baseAsset}</strong><small title={row.symbol}>{row.symbol}</small></span>
                      <ScoreGlyph value={row.score} tone={row.readinessTier} />
                    </span>
                    <span className={`apex-screener-bias ${row.direction.toLowerCase()}`}>
                      {row.direction === 'LONG' ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                      {row.direction === 'LONG' ? 'Long' : 'Short'}
                    </span>
                    <EvidenceEqualizer row={row} />
                    <span className="apex-screener-row-metrics">
                      {LENS_METRICS[columnSet].map((slot) => renderMetricSlot(row, slot))}
                    </span>
                    <span className="apex-screener-row-state">
                      <StatusBadge tone={TIER_TONES[row.readinessTier]} detail={`Scanner readiness: ${row.readinessTier}`}>
                        {TIER_LABELS[row.readinessTier]}
                      </StatusBadge>
                      {(showConfluenceBadge(columnSet)) && <StatusBadge
                        tone={confluenceLabel(row) === 'ALIGNED' ? 'positive' : confluenceLabel(row) === 'CONFLICTING' ? 'negative' : 'warning'}
                      >{confluenceLabel(row)}</StatusBadge>}
                      {showFeedBadge(columnSet) && <StatusBadge tone={MARKET_STATE_TONES[row.dataState]} detail={MARKET_STATE_LABELS[row.dataState]}>
                        {MARKET_STATE_ROW_LABELS[row.dataState]}
                      </StatusBadge>}
                      {/* Guard state shows on every lens: it is the risk objection,
                          not a column the user should have to go looking for. */}
                      {row.guardPass
                        ? <span className="apex-screener-guard pass"><ShieldCheck size={13} /> Pass</span>
                        : <span className="apex-screener-guard fail" title={row.warnings[0]}>
                          <AlertTriangle size={13} /> {row.warnings.length} flag{row.warnings.length === 1 ? '' : 's'}
                        </span>}
                    </span>
                  </button>
                  <div className="apex-screener-row-actions">
                    <button
                      type="button"
                      className={`apex-v3-icon-button ${isFavorite ? 'active' : ''}`}
                      aria-label={`${isFavorite ? 'Remove' : 'Add'} ${row.symbol} ${isFavorite ? 'from' : 'to'} watchlist`}
                      onClick={() => toggleFavorite(row.symbol)}
                    >
                      <Star size={13} fill={isFavorite ? 'currentColor' : 'none'} />
                    </button>
                    <button
                      type="button"
                      className="apex-v3-button secondary"
                      aria-label={`Open ${row.symbol} in Trading`}
                      onClick={() => openInTrading(row.symbol)}
                    >Open</button>
                  </div>
                </li>
              );
            })}
          </ol>
        </div>;

  const main = <div className="apex-screener-main">
    <header className="apex-screener-hero">
      <span className="apex-screener-hero-mark" aria-hidden="true"><Radar size={22} /><i /></span>
      <div className="apex-screener-hero-copy">
        <span><Sparkles size={11} /> Market intelligence</span>
        <h1>Crypto opportunity scanner</h1>
        <p>Calm, evidence-led signals ranked by the APEX scanner.</p>
      </div>
      <div className="apex-screener-heading-actions">
        <button type="button" className="apex-v3-button secondary" onClick={exportVisible} disabled={!visible.length}><Download size={14} /> Export</button>
        <button type="button" className="apex-v3-button secondary" onClick={props.onRefresh} disabled={props.loading}><RefreshCw size={14} className={props.loading ? 'spin' : ''} /> Refresh</button>
      </div>
    </header>

    <div className="apex-screener-chips" aria-label="Scan status">
      <span><Activity size={11} /><b>{summary.scanned}</b> scanned</span>
      {/* Count-dependent noun. `1 opportunities` was rendering on any single-hit
          scan, which is the exact case a trader is most likely to be reading. The
          empty-state copy at the top of this file already pluralizes this way. */}
      <span><Sparkles size={11} /><b>{summary.opportunities}</b> {summary.opportunities === 1 ? 'opportunity' : 'opportunities'}</span>
      <span><LayoutList size={11} /><b>{summary.matched}</b> shown</span>
      <span><Radar size={11} />{age ? <>Updated <b>{age}</b></> : <>Update time <b>unknown</b></>}</span>
      <StatusBadge tone={MARKET_STATE_TONES[props.dataState]}>{MARKET_STATE_LABELS[props.dataState]}</StatusBadge>
    </div>

    <section className="apex-screener-screenbar" aria-label="Screens and presets">
      <div className="apex-screener-presets">
        {PRESETS.map((preset) => <button key={preset.id} type="button" className={activePresetId === preset.id ? 'active' : ''} title={preset.detail} aria-pressed={activePresetId === preset.id} onClick={() => applyPreset(preset)}><span />{preset.label}</button>)}
      </div>
      <span className="apex-screener-screen-divider" aria-hidden="true" />
      <label className="apex-screener-saved-select">
        <span>Saved</span>
        <select value={activeScreenId} onChange={(event) => {
          const id = event.target.value;
          const screen = savedScreens.find((item) => item.id === id);
          if (screen) applyWorkspace(screen.workspace, screen.id); else setActiveScreenId('');
        }}>
          <option value="">Select screen…</option>
          {savedScreens.map((screen) => <option key={screen.id} value={screen.id}>{screen.name}</option>)}
        </select>
      </label>
      {saveOpen ? <form className="apex-screener-save-form" onSubmit={(event) => { event.preventDefault(); saveNamedScreen(); }}>
        <input autoFocus value={saveDraft} maxLength={48} onChange={(event) => setSaveDraft(event.target.value)} placeholder="Screen name" aria-label="Saved screen name" />
        <button type="submit" className="apex-v3-icon-button" disabled={!saveDraft.trim()} aria-label="Confirm saved screen"><Save size={13} /></button>
        <button type="button" className="apex-v3-icon-button" onClick={() => { setSaveOpen(false); setSaveDraft(''); }} aria-label="Cancel saved screen"><X size={13} /></button>
      </form> : <button type="button" className="apex-v3-button secondary" onClick={() => setSaveOpen(true)}><Save size={13} /> Save screen</button>}
      <button type="button" className="apex-v3-icon-button" onClick={deleteActiveScreen} disabled={!activeScreenId} aria-label="Delete selected saved screen"><Trash2 size={13} /></button>
    </section>

    {stale && <p className="apex-screener-stale" role="status">
      <AlertTriangle size={14} /> The newest market observation is {age} old. Refresh before acting on these ranks.
    </p>}

    <section className="apex-screener-filters" aria-label="Screener filters">
      <div className="apex-screener-filter-lead"><SlidersHorizontal size={14} /> Filters</div>

      <div className="apex-v3-search-with-clear">
        <label className="apex-v3-search-field">
          <Search size={15} />
          <input
            value={filters.query}
            onChange={(event) => setFilters((current) => ({ ...current, query: event.target.value }))}
            placeholder="Search symbol or asset..."
            aria-label="Search by symbol or asset"
          />
        </label>
        {filters.query && <button
          type="button"
          className="apex-v3-icon-button"
          aria-label="Clear screener search"
          onClick={() => setFilters((current) => ({ ...current, query: '' }))}
        ><X size={13} /></button>}
      </div>

      <label className="apex-screener-field">
        <span>Bias</span>
        <select
          value={filters.direction}
          onChange={(event) => setFilters((current) => ({ ...current, direction: event.target.value as ScreenerFilters['direction'] }))}
        >
          <option value="ALL">All</option>
          <option value="LONG">Long bias</option>
          <option value="SHORT">Short bias</option>
        </select>
      </label>

      <label className="apex-screener-field">
        <span>Signal</span>
        <select
          value={filters.tier}
          onChange={(event) => setFilters((current) => ({ ...current, tier: event.target.value as ScreenerFilters['tier'] }))}
        >
          <option value="ALL">All</option>
          <option value="CONFIRMED">Opportunity</option>
          <option value="WATCHLIST">Watch</option>
          <option value="CAUTION">Risk</option>
          <option value="BLOCKED">Avoid</option>
        </select>
      </label>

      <label className="apex-screener-field apex-screener-score-filter">
        <span>Min score <b>{filters.minScore}</b></span>
        {/* The track's filled portion is drawn in CSS from --slider-fill, which is
            the same state this label prints, so the bar and the number cannot drift
            apart. `accent-color` on its own left the unfilled track invisible. */}
        <input
          type="range"
          min={0}
          max={100}
          step={5}
          value={filters.minScore}
          style={{ '--slider-fill': `${filters.minScore}%` } as React.CSSProperties}
          onChange={(event) => setFilters((current) => ({ ...current, minScore: Number(event.target.value) }))}
        />
      </label>

      <label className="apex-screener-field">
        <span>Liquidity</span>
        <select
          value={String(filters.minTurnoverUsd)}
          onChange={(event) => setFilters((current) => ({ ...current, minTurnoverUsd: Number(event.target.value) }))}
        >
          {TURNOVER_STEPS.map((step) => <option key={step.value} value={step.value}>{step.label}</option>)}
        </select>
      </label>

      <label className="apex-screener-field">
        <span>Performance</span>
        <select value={filters.performance} onChange={(event) => setFilters((current) => ({ ...current, performance: event.target.value as ScreenerFilters['performance'] }))}>
          <option value="ALL">All moves</option><option value="GAINERS">Gainers</option><option value="LOSERS">Losers</option><option value="MOVERS">±3% movers</option>
        </select>
      </label>

      <button type="button" className={`apex-v3-button secondary apex-screener-advanced-toggle ${advancedOpen ? 'active' : ''}`} onClick={() => setAdvancedOpen((open) => !open)} aria-expanded={advancedOpen} aria-controls="apex-screener-advanced-filters">
        <SlidersHorizontal size={13} /> Advanced
      </button>

      <button
        type="button"
        className="apex-v3-button secondary apex-screener-reset"
        onClick={() => setFilters(resetScreenerFilters())}
        disabled={!filtersActive}
      >Reset filters</button>
    </section>

    {advancedOpen && <section id="apex-screener-advanced-filters" className="apex-screener-advanced" aria-label="Advanced screener filters">
      <label className="apex-screener-field"><span>Risk guard</span><select value={filters.guard} onChange={(event) => setFilters((current) => ({ ...current, guard: event.target.value as ScreenerFilters['guard'] }))}><option value="ALL">All</option><option value="PASS">Pass only</option><option value="FLAGGED">Flagged only</option></select></label>
      <label className="apex-screener-field"><span>Timeframes</span><select value={filters.confluence} onChange={(event) => setFilters((current) => ({ ...current, confluence: event.target.value as ScreenerFilters['confluence'] }))}><option value="ALL">All</option><option value="ALIGNED">Aligned</option><option value="CONFLICTING">Conflicting</option></select></label>
      <label className="apex-screener-field"><span>Funding</span><select value={filters.funding} onChange={(event) => setFilters((current) => ({ ...current, funding: event.target.value as ScreenerFilters['funding'] }))}><option value="ALL">All</option><option value="AVAILABLE">Available</option><option value="POSITIVE">Positive</option><option value="NEGATIVE">Negative</option></select></label>
      <label className="apex-screener-field"><span>Data quality</span><select value={filters.dataQuality} onChange={(event) => setFilters((current) => ({ ...current, dataQuality: event.target.value as ScreenerFilters['dataQuality'] }))}><option value="ALL">All</option><option value="LIVE">Live only</option><option value="PARTIAL">Needs review</option></select></label>
      <label className="apex-screener-field apex-screener-score-filter"><span>Min momentum <b>{filters.minMomentum}</b></span><input type="range" min={0} max={100} step={5} value={filters.minMomentum} style={{ '--slider-fill': `${filters.minMomentum}%` } as React.CSSProperties} onChange={(event) => setFilters((current) => ({ ...current, minMomentum: Number(event.target.value) }))} /></label>
      <label className="apex-screener-field apex-screener-score-filter"><span>Min coverage <b>{filters.minCoveragePct}%</b></span><input type="range" min={0} max={100} step={10} value={filters.minCoveragePct} style={{ '--slider-fill': `${filters.minCoveragePct}%` } as React.CSSProperties} onChange={(event) => setFilters((current) => ({ ...current, minCoveragePct: Number(event.target.value) }))} /></label>
      <label className="apex-screener-check"><input type="checkbox" checked={filters.favoritesOnly} onChange={(event) => setFilters((current) => ({ ...current, favoritesOnly: event.target.checked }))} /><Star size={13} /> Watchlist only</label>
    </section>}

    <Panel className="apex-screener-results">
      <PanelHeader
        title="Signal stream"
        subtitle={`${summary.matched} of ${summary.scanned} symbols · ${summary.partial} with partial data`}
        action={<div className="apex-screener-view-tools" aria-label="Result lens">
          {COLUMN_SET_OPTIONS.map(({ id, label, icon: Icon }) => <button key={id} type="button" className={columnSet === id ? 'active' : ''} onClick={() => setColumnSet(id)} aria-pressed={columnSet === id} title={`${label} result lens`}><Icon size={12} /><span>{label}</span></button>)}
        </div>}
      />
      {/* Sorting is expressed by the column header inside the stream now. This
          chip row is the overflow for any sort key a lens offers that no column
          can host — empty for all four lenses today, so it renders nothing. */}
      {visible.length > 0 && unclaimedSorts.length > 0 && <div className="apex-screener-sortbar" role="group" aria-label="Additional sort options">
        <span className="apex-screener-sortbar-lead"><ArrowUpDown size={11} /> Sort</span>
        {unclaimedSorts.map((option) => <button
          key={option.key}
          type="button"
          className={sort.key === option.key ? 'active' : ''}
          aria-pressed={sort.key === option.key}
          title={sort.key === option.key
            ? `Sorted by ${option.label}, ${sort.ascending ? 'ascending' : 'descending'} — click to reverse`
            : `Sort by ${option.label}`}
          onClick={() => toggleSort(option.key)}
        >
          {option.label}
          {sort.key === option.key && (sort.ascending ? <ChevronUp size={11} /> : <ChevronDown size={11} />)}
        </button>)}
      </div>}
      {resultsBody}
    </Panel>
  </div>;

  const context = <div className="apex-screener-context">
    <Panel className="apex-screener-detail">
      <PanelHeader
        title={selected ? `${selected.baseAsset} detail` : 'Symbol detail'}
        subtitle={selected ? `Rank ${selected.rank} of ${summary.scanned}` : 'Nothing selected'}
        action={selected ? <button
          type="button"
          className={`apex-v3-icon-button ${favorites.has(selected.symbol) ? 'active' : ''}`}
          aria-label={`${favorites.has(selected.symbol) ? 'Remove' : 'Add'} ${selected.symbol} ${favorites.has(selected.symbol) ? 'from' : 'to'} watchlist`}
          onClick={() => toggleFavorite(selected.symbol)}
        ><Star size={15} fill={favorites.has(selected.symbol) ? 'currentColor' : 'none'} /></button> : undefined}
      />
      {selected ? <>
        <div className="apex-screener-identity">
          <CoinIcon symbol={selected.symbol} size={32} />
          <div><strong>{selected.baseAsset}</strong><span>{selected.symbol}</span></div>
          <div className="apex-screener-identity-badges">
            <StatusBadge tone={directionTone(selected.direction)}>{selected.direction === 'LONG' ? 'Long bias' : 'Short bias'}</StatusBadge>
            <StatusBadge tone={TIER_TONES[selected.readinessTier]} detail={`Scanner readiness: ${selected.readinessTier}`}>
              {TIER_LABELS[selected.readinessTier]}
            </StatusBadge>
          </div>
        </div>

        <ScoreArc
          score={selected.score}
          tier={selected.readinessTier}
          guardPass={selected.guardPass}
          coveragePct={selected.scoreCoveragePct}
        />

        {/* First block in the panel, above every explanation, because it is the
            reason a trader opens this panel at all. Every price here is the
            scanner's own published ATR-band level for this candidate — see
            `levelsFor` in screenerModel.ts — and a level the scan did not publish
            says "Unavailable" rather than showing a plausible-looking number. */}
        <div className="apex-screener-block apex-screener-levels-block">
          <h3><Crosshair size={11} /> Trade levels</h3>
          <ul className="apex-screener-levels">
            <li className="entry">
              <span>Entry</span>
              <b><MetricValue metric={selected.entryPrice} render={formatPrice} /></b>
            </li>
            <li className="stop">
              <span>Stop</span>
              <b><MetricValue metric={selected.stopLoss} render={formatPrice} /></b>
            </li>
            <li className="target">
              <span>Target</span>
              <b><MetricValue metric={selected.takeProfit} render={formatPrice} /></b>
            </li>
          </ul>
          <div className="apex-screener-levels-meta">
            <span><i>Reward / risk</i><b><MetricValue metric={selected.riskReward} render={(value) => `${value.toFixed(2)}R`} /></b></span>
            <span><i>Risk from entry</i><b><MetricValue metric={selected.riskPct} render={(value) => `${value.toFixed(2)}%`} /></b></span>
            <span><i>24h high</i><b><MetricValue metric={selected.high24h} render={formatPrice} /></b></span>
            <span><i>24h low</i><b><MetricValue metric={selected.low24h} render={formatPrice} /></b></span>
          </div>
          <details className="apex-screener-explain">
            <summary>Where these levels come from</summary>
            <p>
              The scanner derives them from 1h ATR bands around its own entry reference and publishes
              them with the candidate ({selected.direction === 'LONG' ? 'long' : 'short'} side shown here).
              The screener copies them and divides the two distances for reward/risk — it computes no
              level of its own. Swing support and resistance beyond these bands, and order-book depth,
              are not part of the market-wide scan.
            </p>
          </details>
        </div>

        <div className="apex-screener-block">
          <h3><Activity size={11} /> Score architecture</h3>
          <FactorBreakdown row={selected} />
          <details className="apex-screener-explain">
            <summary>How this rank is decided</summary>
            <p>
              The scanner publishes these five sub-scores and the 0-100 above; the screener never
              re-derives either. Position in the list weights that score together with the risk guard,
              the readiness tier and how many flags a row carries, so a cleaner signal can outrank a
              marginally higher raw number.
            </p>
          </details>
        </div>

        <div className="apex-screener-block">
          <h3><Sparkles size={11} /> Why it surfaced</h3>
          {detailThesis && <p className="apex-screener-thesis">{detailThesis}</p>}
          {detailReasons.length > 0 && <ul className="apex-screener-reasons">
            {detailReasons.map((reason) => <li key={reason}>{reason}</li>)}
          </ul>}
          {!detailThesis && detailReasons.length === 0 && <p className="apex-screener-note">The scanner published no rationale beyond the sub-scores above.</p>}
        </div>

        <div className="apex-screener-block">
          <h3><AlertTriangle size={11} /> Risk notes</h3>
          {detailWarnings.length
            ? <ul className="apex-screener-warnings">
              {detailWarnings.map((warning) => <li key={warning}><AlertTriangle size={13} /> {warning}</li>)}
            </ul>
            : <p className="apex-screener-note">The risk guard raised no objection against this candidate.</p>}
        </div>

        <div className="apex-screener-block">
          <h3><Gauge size={11} /> Market texture</h3>
          <KeyValueList rows={[
            { label: 'Price', value: Number.isFinite(selected.lastPrice) ? formatPrice(selected.lastPrice) : <span className="apex-screener-unavailable">Unavailable</span> },
            { label: '24h change', value: formatPercent(selected.priceChange24hPct), tone: changeTone(selected.priceChange24hPct) },
            { label: '24h turnover', value: usdCompact(Number.isFinite(selected.turnover24h) ? selected.turnover24h : null) },
            { label: '24h base volume', value: <MetricValue metric={selected.baseVolume24h} render={formatCompactNumber} /> },
            { label: '24h high-low range', value: <MetricValue metric={selected.range24hPct} render={(value) => `${value.toFixed(2)}%`} /> },
            { label: 'Open interest', value: <MetricValue metric={selected.openInterest} render={(value) => `$${formatCompactNumber(value)}`} /> },
            { label: 'Funding rate', value: <MetricValue metric={selected.fundingRate} render={(value) => `${(value * 100).toFixed(4)}%`} /> },
            { label: 'Spread / depth', value: <MetricValue metric={selected.spreadDepth} render={(value) => String(value)} /> },
            { label: 'Timeframes', value: selected.timeframeConfluenceState ?? (selected.timeframeConfluence ? 'ALIGNED' : 'NOT ALIGNED') },
          ]} />
        </div>

        <div className="apex-screener-actions">
          <button type="button" className="apex-v3-button primary full" onClick={() => openInTrading(selected.symbol)}>
            <TrendingUp size={15} /> Open {selected.baseAsset} in Trading
          </button>
          <button type="button" className="apex-v3-button secondary full" onClick={() => copySymbol(selected.symbol)}>
            <Copy size={15} /> Copy symbol
          </button>
          <p className="apex-screener-note">The screener never places, arms, or modifies an order. Opening Trading only changes the selected symbol.</p>
        </div>
      </> : <DataState
        availability="empty"
        title="No symbol selected"
        detail="Choose a row to see its score breakdown, the reasons behind its rank, and its risk warnings."
      />}
    </Panel>
  </div>;

  return <WorkspacePageFrame className="apex-screener-page" main={main} context={context} />;
}
