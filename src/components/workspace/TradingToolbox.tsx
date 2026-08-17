import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { TRADING_TOOLBOX_REQUEST_EVENT, type TradingToolRequestKey } from '../../lib/tradingToolboxEvents';
import {
  loadTradingLayoutPreference,
  readTradingRailOpenPreference,
  saveTradingLayoutPreference,
  saveTradingRailOpenPreference,
  type TradingLayoutMode,
  type TradingLayoutPreferenceV2 as TradingLayoutPreference,
} from '../../lib/tradingLayoutPreference';
import { DrawerShell } from './ToolboxDrawers';

export type TradingToolKey = TradingToolRequestKey;
export type TradingToolboxMode = TradingLayoutMode;
type ResolvedTradingToolboxMode = Exclude<TradingToolboxMode, 'auto'>;

type RailIconProps = { size?: number; className?: string; 'aria-hidden'?: boolean };

export type { TradingLayoutPreferenceV2 } from '../../lib/tradingLayoutPreference';

export interface TradingToolboxState {
  active: TradingToolKey | null;
  docked: boolean;
  mode: ResolvedTradingToolboxMode;
  pinnedTools: TradingToolKey[];
  executionDockWidthPx: number;
  railOpen: boolean;
}

interface TradingToolboxProps {
  drawers: Partial<Record<TradingToolKey, React.ReactNode>>;
  onStateChange?: (state: TradingToolboxState) => void;
  mode?: TradingToolboxMode;
  containerWidth?: number;
  inlineTools?: TradingToolKey[];
  closeRequest?: number;
  workspaceActions?: Partial<Record<TradingToolKey, () => void>>;
}

function ApexRailIcon({ tool, size = 22, className, ...svgProps }: RailIconProps & { tool: TradingToolKey }) {
  const common = {
    fill: 'none',
    stroke: 'currentColor',
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    strokeWidth: 1.85,
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={`apex-rail-svg ${className ?? ''}`.trim()}
      focusable="false"
      aria-hidden="true"
      {...svgProps}
    >
      {tool === 'order' && <g {...common}><path d="M7 4.75h10a2 2 0 0 1 2 2v10.5a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6.75a2 2 0 0 1 2-2Z" /><path d="M8 8.25h8" /><path d="M8 12h5" /><path d="M10.25 16h3.5" /><path d="M12 14.25v3.5" /></g>}
      {tool === 'orders' && <g {...common}><path d="M5.25 6.5h13.5" /><path d="M5.25 12h13.5" /><path d="M5.25 17.5h13.5" /><path d="m7.25 5.25-1.5 1.5-.75-.75" /><path d="m7.25 10.75-1.5 1.5-.75-.75" /><path d="m7.25 16.25-1.5 1.5-.75-.75" /></g>}
      {tool === 'positions' && <g {...common}><path d="M6.25 8.25h11.5a2 2 0 0 1 2 2v6.5a2 2 0 0 1-2 2H6.25a2 2 0 0 1-2-2v-6.5a2 2 0 0 1 2-2Z" /><path d="M9 8.25V6.5a1.5 1.5 0 0 1 1.5-1.5h3A1.5 1.5 0 0 1 15 6.5v1.75" /><path d="M4.25 12.25h15.5" /><path d="M12 11.5v2" /></g>}
      {tool === 'depth' && <g {...common}><path d="M5.25 7.25h7" /><path d="M5.25 12h11.5" /><path d="M5.25 16.75h8.5" /><path d="M16.25 6.5h2.5" /><path d="M18.75 11.25h-2.5" /><path d="M16.25 16h2.5" /><path d="M15 4.75v14.5" /></g>}
      {tool === 'trades' && <g {...common}><path d="M7 7.25h10.5l-2-2" /><path d="M17.5 7.25l-2 2" /><path d="M17 16.75H6.5l2 2" /><path d="M6.5 16.75l2-2" /><path d="M9 12h6" /></g>}
      {tool === 'strategy' && <g {...common}><path d="M7 7.5a2.25 2.25 0 1 0 0 .01" /><path d="M17 7.5a2.25 2.25 0 1 0 0 .01" /><path d="M12 17a2.25 2.25 0 1 0 0 .01" /><path d="M8.85 8.75 10.4 14" /><path d="m15.15 8.75-1.55 5.25" /><path d="M9.1 7.5h5.8" /></g>}
      {tool === 'signals' && <g {...common}><path d="M4.5 14.5h3l2.2-7 4.1 10 2.1-6h3.6" /><path d="M4.5 19.25h15" /><path d="M4.5 4.75h15" /></g>}
      <circle className="apex-rail-svg-halo" cx="12" cy="12" r="10" />
      <path className="apex-rail-svg-sheen" d="M7.25 6.75c1.25-1.05 2.85-1.6 4.75-1.6 1.9 0 3.5.55 4.75 1.6" />
      {tool === 'settings' && <g {...common}><path d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Z" /><path d="M19.1 13.1c.08-.36.08-.84 0-1.2l1.55-1.2-1.6-2.77-1.86.75a6.7 6.7 0 0 0-1.04-.6L15.9 6h-3.2l-.25 2.08c-.37.16-.72.36-1.04.6l-1.86-.75-1.6 2.77 1.55 1.2c-.08.36-.08.84 0 1.2l-1.55 1.2 1.6 2.77 1.86-.75c.32.24.67.44 1.04.6L12.7 19h3.2l.25-2.08c.37-.16.72-.36 1.04-.6l1.86.75 1.6-2.77-1.55-1.2Z" /></g>}
    </svg>
  );
}

function ApexChevronIcon({ direction, size = 18 }: { direction: 'left' | 'right'; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {direction === 'left' ? <path d="m15 6-6 6 6 6" /> : <path d="m9 6 6 6-6 6" />}
    </svg>
  );
}

const TOOLS: Array<{
  key: TradingToolKey;
  label: string;
  shortLabel: string;
  title: string;
  description: string;
  behavior: 'inline' | 'drawer' | 'workspace';
  badge?: string;
}> = [
  { key: 'order', label: 'Order ticket', shortLabel: 'Ticket', title: 'Order Ticket & Risk', description: 'opens inline ticket / drawer for review-first order entry', behavior: 'inline' },
  { key: 'orders', label: 'Open orders', shortLabel: 'Orders', title: 'Open Orders', description: 'opens drawer with working orders and full Orders link', behavior: 'drawer' },
  { key: 'positions', label: 'Open positions', shortLabel: 'Positions', title: 'Open Positions', description: 'opens drawer with current exposure and full Positions link', behavior: 'drawer' },
  { key: 'depth', label: 'Order book depth', shortLabel: 'Depth', title: 'Order Book', description: 'opens inline depth ladder; prices can prefill the ticket when enabled', behavior: 'inline', badge: 'LIVE' },
  { key: 'trades', label: 'Recent trades', shortLabel: 'Trades', title: 'Recent Trades', description: 'opens drawer with recent account fills', behavior: 'drawer' },
  { key: 'strategy', label: 'Strategy context', shortLabel: 'Strategy', title: 'Strategy & Backtest Context', description: 'opens strategy context and linked signals', behavior: 'drawer' },
  { key: 'signals', label: 'Setup signals', shortLabel: 'Signals', title: 'Setup Intelligence', description: 'opens current scanner levels, factors and setup evidence', behavior: 'drawer', badge: 'LIVE' },
  { key: 'settings', label: 'Trading settings', shortLabel: 'Settings', title: 'Settings', description: 'opens the full Settings workspace', behavior: 'workspace' },
];

export function TradingToolbox({
  drawers,
  onStateChange,
  mode = 'auto',
  containerWidth,
  inlineTools = ['order', 'depth'],
  closeRequest = 0,
  workspaceActions = {},
}: TradingToolboxProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const initialPreference = useMemo(
    () => loadTradingLayoutPreference(typeof window === 'undefined' ? undefined : window.localStorage),
    [],
  );
  const initialRailOpen = useMemo(() => {
    if (typeof window === 'undefined') return true;
    const stored = readTradingRailOpenPreference(window.localStorage);
    if (stored !== null) return stored;
    return window.innerWidth - 184 >= 1080;
  }, []);
  const [open, setOpen] = useState<TradingToolKey | null>(initialRailOpen && initialPreference.activeTool !== 'settings' ? initialPreference.activeTool : null);
  const [railOpen, setRailOpen] = useState(initialRailOpen);
  const [pinnedTools, setPinnedTools] = useState<TradingToolKey[]>(initialPreference.pinnedTools.filter((key) => key !== 'settings'));
  const [executionDockWidthPx] = useState(initialPreference.executionDockWidthPx);
  const compactInitialized = useRef(false);

  const requestedMode = mode === 'auto' ? initialPreference.mode : mode;
  const resolvedMode: ResolvedTradingToolboxMode = requestedMode === 'compact-drawers'
    ? 'compact-drawers'
    : requestedMode === 'desktop-expanders'
      ? 'desktop-expanders'
      : (containerWidth ?? (typeof window !== 'undefined' ? window.innerWidth - 184 : 1160)) < 1080
        ? 'compact-drawers'
        : 'desktop-expanders';

  useEffect(() => {
    if (closeRequest > 0) {
      setOpen(null);
      setRailOpen(false);
    }
  }, [closeRequest]);

  useEffect(() => {
    if (resolvedMode === 'compact-drawers' && !compactInitialized.current) {
      compactInitialized.current = true;
      setOpen(null);
      setRailOpen(false);
    }
    if (resolvedMode === 'desktop-expanders') compactInitialized.current = false;
  }, [resolvedMode]);

  const activePinned = open ? pinnedTools.includes(open) : false;
  const isInlineExpansion = Boolean(railOpen && open && resolvedMode === 'desktop-expanders' && inlineTools.includes(open));

  useEffect(() => {
    onStateChange?.({
      active: railOpen ? open : null,
      docked: activePinned,
      mode: resolvedMode,
      pinnedTools,
      executionDockWidthPx,
      railOpen,
    });
  }, [activePinned, executionDockWidthPx, onStateChange, open, pinnedTools, railOpen, resolvedMode]);

  useEffect(() => {
    const openRequestedTool = (event: Event) => {
      const requested = (event as CustomEvent<TradingToolKey>).detail;
      if (!TOOLS.some((tool) => tool.key === requested)) return;
      if (workspaceActions[requested]) { workspaceActions[requested]?.(); return; }
      if (drawers[requested] || inlineTools.includes(requested)) {
        setRailOpen(true);
        setOpen(requested);
      }
    };
    window.addEventListener(TRADING_TOOLBOX_REQUEST_EVENT, openRequestedTool);
    return () => window.removeEventListener(TRADING_TOOLBOX_REQUEST_EVENT, openRequestedTool);
  }, [drawers, inlineTools, workspaceActions]);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && railOpen && !activePinned) {
        setOpen(null);
        setRailOpen(false);
      }
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [activePinned, railOpen]);

  useEffect(() => {
    if (!open || activePinned || isInlineExpansion) return;
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(null);
    };
    document.addEventListener('pointerdown', closeOnOutsidePointer);
    return () => document.removeEventListener('pointerdown', closeOnOutsidePointer);
  }, [activePinned, isInlineExpansion, open]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const preference: TradingLayoutPreference = {
      version: 2,
      mode: requestedMode,
      activeTool: railOpen ? open : null,
      pinnedTools,
      executionDockWidthPx,
      updatedAt: Date.now(),
    };
    try {
      saveTradingLayoutPreference(window.localStorage, preference);
      saveTradingRailOpenPreference(window.localStorage, railOpen);
    } catch {
      // Persistence is optional in private or embedded browser contexts.
    }
  }, [executionDockWidthPx, open, pinnedTools, railOpen, requestedMode]);

  const close = () => setOpen(null);
  const toggleRail = () => {
    setRailOpen((current) => {
      if (current) setOpen(null);
      return !current;
    });
  };
  const toggle = (key: TradingToolKey) => {
    if (workspaceActions[key]) { workspaceActions[key]?.(); return; }
    setRailOpen(true);
    setOpen((current) => current === key && !pinnedTools.includes(key) ? null : key);
  };
  const active = railOpen && open ? TOOLS.find((tool) => tool.key === open) : null;
  const togglePin = () => {
    if (!open) return;
    setPinnedTools((current) => current.includes(open) ? current.filter((key) => key !== open) : [...current, open]);
  };

  return (
    <div
      ref={rootRef}
      className={`apex-toolbox apex-trading-toolbox${railOpen ? ' rail-open' : ' rail-closed'}${open ? ' open' : ''}${activePinned ? ' docked' : ' undocked'} mode-${resolvedMode}${isInlineExpansion ? ' inline-expansion' : ''}`}
      data-toolbox-mode={resolvedMode}
      data-active-tool={active?.key ?? 'none'}
      data-rail-open={railOpen ? 'true' : 'false'}
    >
      <button
        type="button"
        className="apex-toolbox-slide-toggle"
        onClick={toggleRail}
        title={railOpen ? 'Hide Trading tools' : 'Show Trading tools'}
        aria-label={railOpen ? 'Hide Trading tools' : 'Show Trading tools'}
        aria-expanded={railOpen}
        aria-controls="apex-trading-toolbox-rail"
      >
        <ApexChevronIcon direction={railOpen ? 'right' : 'left'} />
        <span className="apex-visually-hidden">{railOpen ? 'Hide Trading tools' : 'Show Trading tools'}</span>
      </button>

      {active && drawers[active.key] && !isInlineExpansion && (
        <DrawerShell
          title={active.title}
          badge={active.badge}
          subtitle={active.description}
          onClose={close}
          docked={activePinned}
          onToggleDock={togglePin}
        >
          {drawers[active.key]}
        </DrawerShell>
      )}

      <aside id="apex-trading-toolbox-rail" className="apex-toolbox-rail" aria-label="Trading toolbox" aria-hidden={!railOpen}>
        {TOOLS.map((tool) => {
          const opensWorkspace = Boolean(workspaceActions[tool.key]);
          const available = opensWorkspace || Boolean(drawers[tool.key] || inlineTools.includes(tool.key));
          const tooltip = `${tool.shortLabel} — ${tool.description}`;
          return (
            <button
              key={tool.key}
              type="button"
              className={`apex-rail-button ${active?.key === tool.key ? 'active' : ''} behavior-${tool.behavior}`}
              data-tool={tool.key}
              data-tooltip={tooltip}
              onClick={() => toggle(tool.key)}
              title={tooltip}
              aria-label={tooltip}
              aria-pressed={open === tool.key}
              disabled={!available}
              tabIndex={railOpen ? 0 : -1}
            >
              <ApexRailIcon tool={tool.key} size={21} />
              <span>{tool.shortLabel}</span>
              {opensWorkspace && <ExternalLink size={10} className="apex-rail-external" aria-hidden="true" />}
              <small className="apex-rail-behavior">{tool.behavior === 'workspace' ? 'Workspace' : tool.behavior === 'inline' ? 'Inline' : 'Drawer'}</small>
            </button>
          );
        })}
      </aside>
    </div>
  );
}
