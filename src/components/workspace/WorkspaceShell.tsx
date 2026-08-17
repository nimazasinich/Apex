import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  BookOpenCheck,
  BarChart3,
  Bell,
  BriefcaseBusiness,
  CircleHelp,
  FlaskConical,
  History,
  Layers3,
  LayoutDashboard,
  ListOrdered,
  Moon,
  Sun,
  ScanSearch,
  Search,
  ServerCog,
  Settings,
  Star,
  TrendingUp,
  WalletCards,
  X,
} from 'lucide-react';
import { BrandMark } from '../BrandMark';
import type { ConnectionState } from '../../services/accountClient';
import type { DataState, SymbolTicker } from '../../types';
import { SystemHealthDrawer } from './SystemHealthDrawer';
import { DecisionJournalDrawer } from './DecisionJournalDrawer';
import { WorkspaceFeedbackCenter } from '../ui/WorkspaceFeedbackCenter';
import { THEME_CHANGE_EVENT, setThemePreference } from '../../lib/theme';
import { notifyWorkspace } from '../../lib/workspaceFeedback';
import type { AutopilotControllerView } from '../../lib/useAutopilotController';
import { AutopilotHeaderControl } from './AutopilotHeaderControl';

export type WorkspacePage =
  | 'overview'
  | 'markets'
  | 'watchlist'
  | 'screener'
  | 'portfolio'
  | 'trading'
  | 'orders'
  | 'positions'
  | 'alerts'
  | 'history'
  | 'analytics'
  | 'backtesting'
  | 'strategies'
  | 'settings'
  | 'help';

interface WorkspaceShellProps {
  page: WorkspacePage;
  onNavigate: (page: WorkspacePage) => void;
  connection: ConnectionState;
  marketState: DataState;
  symbols: SymbolTicker[];
  onSelectSymbol: (symbol: string) => void;
  autopilotPreferenceEnabled: boolean;
  autopilotController: AutopilotControllerView;
  onAutopilotEnabledChange: (enabled: boolean) => void;
  children: React.ReactNode;
}

type NavItem = { id: WorkspacePage; label: string; icon: React.ComponentType<{ size?: number }> };
type NavGroup = { label: 'Monitor' | 'Trade' | 'Research' | 'Operations'; items: NavItem[] };

const navGroups: NavGroup[] = [
  {
    label: 'Monitor',
    items: [
      { id: 'overview', label: 'Overview', icon: LayoutDashboard },
      { id: 'markets', label: 'Markets', icon: BarChart3 },
      { id: 'watchlist', label: 'Watchlist', icon: Star },
      { id: 'screener', label: 'Screener', icon: ScanSearch },
    ],
  },
  {
    label: 'Trade',
    items: [
      { id: 'trading', label: 'Trading', icon: TrendingUp },
      { id: 'orders', label: 'Orders', icon: ListOrdered },
      { id: 'positions', label: 'Positions', icon: WalletCards },
      { id: 'portfolio', label: 'Portfolio', icon: BriefcaseBusiness },
    ],
  },
  {
    label: 'Research',
    items: [
      { id: 'strategies', label: 'Strategies', icon: Layers3 },
      { id: 'backtesting', label: 'Backtesting', icon: FlaskConical },
      { id: 'analytics', label: 'Analytics', icon: Activity },
    ],
  },
  {
    label: 'Operations',
    items: [
      { id: 'alerts', label: 'Alerts', icon: Bell },
      { id: 'history', label: 'History', icon: History },
    ],
  },
];

const navItems = navGroups.flatMap((group) => group.items);

const pageLabels: Array<{ id: WorkspacePage; label: string; detail: string }> = [
  ...navItems.map(({ id, label }) => ({ id, label, detail: 'Open workspace page' })),
  { id: 'settings', label: 'Settings', detail: 'Configure account and terminal' },
  { id: 'help', label: 'Help', detail: 'Open help center' },
];

function WorkspaceClock() {
  const [clock, setClock] = useState('');
  useEffect(() => {
    const update = () => setClock(`${new Date().toISOString().slice(11, 19)} UTC`);
    update();
    const id = window.setInterval(update, 1000);
    return () => window.clearInterval(id);
  }, []);
  return <span className="apex-clock" aria-label={`Current time ${clock}`}>{clock}</span>;
}

export function WorkspaceShell({
  page,
  onNavigate,
  connection,
  marketState,
  symbols,
  onSelectSymbol,
  autopilotPreferenceEnabled,
  autopilotController,
  onAutopilotEnabledChange,
  children,
}: WorkspaceShellProps) {
  const [query, setQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [healthOpen, setHealthOpen] = useState(false);
  const [journalOpen, setJournalOpen] = useState(false);
  const [buildIdentity, setBuildIdentity] = useState<{ version: string; buildId: string } | null>(null);
  const [resolvedTheme, setResolvedTheme] = useState<'light' | 'dark'>(() => (typeof document !== 'undefined' && document.documentElement.dataset.apexThemeResolved === 'dark' ? 'dark' : 'light'));
  const searchRef = useRef<HTMLInputElement>(null);
  const searchContainerRef = useRef<HTMLDivElement>(null);
  const mainRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setSearchOpen(true);
        searchRef.current?.focus();
      }
      if (event.key === 'Escape') setSearchOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);


  useEffect(() => {
    const syncTheme = () => setResolvedTheme(document.documentElement.dataset.apexThemeResolved === 'dark' ? 'dark' : 'light');
    window.addEventListener(THEME_CHANGE_EVENT, syncTheme);
    return () => window.removeEventListener(THEME_CHANGE_EVENT, syncTheme);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void fetch('/build-info.json', { cache: 'no-store', signal: controller.signal })
      .then((response) => response.ok ? response.json() : null)
      .then((value) => {
        if (value && typeof value.version === 'string' && typeof value.buildId === 'string') {
          setBuildIdentity({ version: value.version, buildId: value.buildId });
        }
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, []);

  const toggleTheme = () => {
    const next = resolvedTheme === 'dark' ? 'light' : 'dark';
    setThemePreference(next);
    notifyWorkspace({
      title: `${next === 'dark' ? 'Dark' : 'Light'} theme enabled`,
      detail: 'The preference is saved for future sessions.',
      tone: 'success',
    });
  };

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(event.target as Node)) setSearchOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, []);

  useEffect(() => {
    mainRef.current?.focus({ preventScroll: true });
  }, [page]);

  const results = useMemo(() => {
    const normalized = query.trim().toUpperCase();
    const marketResults = symbols
      .filter((ticker) => !normalized || ticker.symbol.toUpperCase().includes(normalized))
      .slice(0, 3)
      .flatMap((ticker) => ([
        {
          type: 'symbol' as const,
          id: `${ticker.symbol}:markets`,
          symbol: ticker.symbol,
          destination: 'markets' as const,
          label: ticker.symbol,
          detail: `Open in Markets · Last ${Number(ticker.lastPrice).toLocaleString()}`,
        },
        {
          type: 'symbol' as const,
          id: `${ticker.symbol}:trading`,
          symbol: ticker.symbol,
          destination: 'trading' as const,
          label: ticker.symbol,
          detail: `Open in Trading · Last ${Number(ticker.lastPrice).toLocaleString()}`,
        },
      ]));
    const pageResults = pageLabels
      .filter((item) => !normalized || item.label.toUpperCase().includes(normalized))
      .slice(0, 5)
      .map((item) => ({ type: 'page' as const, ...item }));
    return [...marketResults, ...pageResults].slice(0, 8);
  }, [query, symbols]);

  useEffect(() => setActiveIndex(0), [query]);

  const chooseResult = (result: (typeof results)[number]) => {
    if (result.type === 'symbol') {
      onSelectSymbol(result.symbol);
      onNavigate(result.destination);
    } else {
      onNavigate(result.id);
    }
    setQuery('');
    setSearchOpen(false);
  };

  const shortcutLabel = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘K' : 'Ctrl K';
  const activeResultId = searchOpen && results[activeIndex] ? `apex-search-result-${activeIndex}` : undefined;

  return (
    <div className={`apex-shell apex-workspace ${page === 'strategies' ? 'strategy-active' : ''}`} data-page={page}>
      <a className="apex-skip-link" href="#apex-main-content">Skip to workspace content</a>
      <aside className="apex-sidebar" aria-label="Primary navigation">
        <button className="apex-logo" onClick={() => onNavigate('overview')} type="button">
          <BrandMark size={36} title="APEX" />
          <span>APEX</span>
        </button>

        <nav className="apex-nav" aria-label="Workspace navigation">
          {navGroups.map((group) => (
            <section className="apex-nav-group" key={group.label} aria-labelledby={`apex-nav-group-${group.label.toLowerCase()}`}>
              <h2 id={`apex-nav-group-${group.label.toLowerCase()}`}>{group.label}</h2>
              <div>
                {group.items.map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      type="button"
                      key={item.id}
                      className={page === item.id ? 'active' : ''}
                      aria-current={page === item.id ? 'page' : undefined}
                      aria-label={`Open ${item.label}`}
                      title={item.label}
                      data-route={item.id}
                      onClick={() => onNavigate(item.id)}
                    >
                      <span className="apex-nav-icon" aria-hidden="true"><Icon size={20} /></span>
                      <span>{item.label}</span>
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
        </nav>

        <div className="apex-sidebar-bottom">
          <button type="button" className={page === 'settings' ? 'active' : ''} aria-current={page === 'settings' ? 'page' : undefined} onClick={() => onNavigate('settings')}>
            <span className="apex-nav-icon" aria-hidden="true"><Settings size={20} /></span>
            <span>Settings</span>
          </button>
          <button type="button" className={page === 'help' ? 'active' : ''} aria-current={page === 'help' ? 'page' : undefined} onClick={() => onNavigate('help')}>
            <span className="apex-nav-icon" aria-hidden="true"><CircleHelp size={20} /></span>
            <span>Help</span>
          </button>
          <button type="button" className="apex-system-card" onClick={() => setHealthOpen(true)} aria-label="Open market data and system health details">
            <span className="apex-system-card-label"><span className={`apex-dot ${marketState === 'live' ? 'good' : 'warn'}`} /> Market Data</span>
            <strong>{marketState === 'live' ? 'Connected' : marketState.replace('_', ' ')}</strong>
            <small>{connection.mode === 'demo' ? 'Demo execution · real data' : connection.status === 'connected' ? 'KuCoin account verified' : 'Live account locked'}</small>
          </button>
        </div>
      </aside>

      <div className="apex-stage">
        <header className="apex-header">
          {page === 'trading' && <div id="apex-trading-header-slot" className="apex-trading-header-slot" aria-label="Trading quick market selector" />}
          <div ref={searchContainerRef} className="apex-global-search">
            <label className="apex-search" onFocus={() => setSearchOpen(true)}>
              <Search size={17} />
              <input
                ref={searchRef}
                value={query}
                role="combobox"
                aria-label="Search markets and workspace pages"
                aria-autocomplete="list"
                aria-expanded={searchOpen}
                aria-controls="apex-search-results"
                aria-activedescendant={activeResultId}
                placeholder="Search markets, symbols or contracts..."
                onChange={(event) => {
                  setQuery(event.target.value);
                  setSearchOpen(true);
                }}
                onKeyDown={(event) => {
                  if (event.key === 'ArrowDown') {
                    event.preventDefault();
                    if (results.length) setActiveIndex((index) => Math.min(results.length - 1, index + 1));
                  }
                  if (event.key === 'ArrowUp') {
                    event.preventDefault();
                    if (results.length) setActiveIndex((index) => Math.max(0, index - 1));
                  }
                  if (event.key === 'Home') {
                    event.preventDefault();
                    setActiveIndex(0);
                  }
                  if (event.key === 'End') {
                    event.preventDefault();
                    setActiveIndex(Math.max(0, results.length - 1));
                  }
                  if (event.key === 'Enter' && results[activeIndex]) {
                    event.preventDefault();
                    chooseResult(results[activeIndex]);
                  }
                }}
              />
              {query ? (
                <button
                  type="button"
                  className="apex-search-clear"
                  aria-label="Clear global search"
                  title="Clear search"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={(event) => {
                    event.preventDefault();
                    setQuery('');
                    setSearchOpen(true);
                    searchRef.current?.focus();
                  }}
                ><X size={14} /></button>
              ) : <kbd>{shortcutLabel}</kbd>}
            </label>
            {searchOpen && (
              <div id="apex-search-results" className="apex-search-popover" role="listbox" aria-label="Search results">
                {results.length ? results.map((result, index) => (
                  <button
                    key={`${result.type}-${result.id}`}
                    id={`apex-search-result-${index}`}
                    type="button"
                    role="option"
                    aria-selected={index === activeIndex}
                    className={index === activeIndex ? 'active' : ''}
                    onMouseDown={(event) => event.preventDefault()}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => chooseResult(result)}
                  >
                    <Search size={14} />
                    <span><strong>{result.label}</strong><small>{result.detail}</small></span>
                    <em>{result.type === 'symbol' ? result.destination : result.type}</em>
                  </button>
                )) : <div className="apex-search-empty">No matching market or page.</div>}
              </div>
            )}
          </div>
          <div className="apex-header-status">
            <AutopilotHeaderControl
              preferenceEnabled={autopilotPreferenceEnabled}
              controller={autopilotController}
              onToggle={onAutopilotEnabledChange}
            />
            <button
              type="button"
              className={`apex-mode-badge ${connection.mode === 'live' && connection.status === 'connected' ? 'live' : 'demo'}`}
              onClick={() => onNavigate('settings')}
            >
              {connection.mode === 'demo' ? 'DEMO TRADING' : connection.status === 'connected' ? 'LIVE ACCOUNT' : 'LIVE LOCKED'}
            </button>
            <WorkspaceClock />
            {buildIdentity && <span className="apex-build-identity" title={`Build ${buildIdentity.buildId}`}>v{buildIdentity.version} · {buildIdentity.buildId.slice(0, 7)}</span>}
            <button type="button" className="apex-data-status apex-data-status-action" onClick={() => setHealthOpen(true)} title="Open system health details">
              <span className={`apex-dot ${marketState === 'live' ? 'good' : 'warn'}`} />
              Market Data {marketState === 'live' ? 'Connected' : 'Degraded'}
            </button>
            <button type="button" className="apex-header-icon" aria-label="Open system health" onClick={() => setHealthOpen(true)} title="System Health"><ServerCog size={18} /></button>
            <button type="button" className="apex-header-icon" aria-label="Open decision journal" onClick={() => setJournalOpen(true)} title="Decision Journal"><BookOpenCheck size={18} /></button>
            <button type="button" className="apex-header-icon" aria-label="Open alerts" onClick={() => onNavigate('alerts')}><Bell size={18} /></button>
            <button type="button" className="apex-header-icon apex-theme-toggle" aria-label={`Switch to ${resolvedTheme === 'dark' ? 'light' : 'dark'} theme`} onClick={toggleTheme} title={`Switch to ${resolvedTheme === 'dark' ? 'light' : 'dark'} theme`}>{resolvedTheme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}</button>
            <button type="button" className="apex-header-icon" aria-label="Open settings" title="Settings" onClick={() => onNavigate('settings')}><Settings size={18} /></button>
            <button type="button" className="apex-avatar" aria-label="Open account settings" title="Account settings" onClick={() => onNavigate('settings')}>AP</button>
          </div>
        </header>
        <main ref={mainRef} id="apex-main-content" className="apex-content" tabIndex={-1}>{children}</main>
      </div>
      <SystemHealthDrawer isOpen={healthOpen} onClose={() => setHealthOpen(false)} />
      <DecisionJournalDrawer isOpen={journalOpen} onClose={() => setJournalOpen(false)} />
      <WorkspaceFeedbackCenter />
    </div>
  );
}
