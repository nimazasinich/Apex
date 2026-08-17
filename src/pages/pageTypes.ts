import type { AccountSnapshot, ConnectionState, LiveReconciliationSummary } from '../services/accountClient';
import type { WorkspaceInsights } from '../services/workspaceInsights';
import type { AlertRule, CandidateScore, DataState, SentimentComposite, SymbolTicker, TerminalSettings } from '../types';

export interface MarketWorkspaceProps {
  tickers: SymbolTicker[];
  sentiment: SentimentComposite | null;
  longCandidates: CandidateScore[];
  shortCandidates: CandidateScore[];
  dataState: DataState;
  loading: boolean;
  selectedSymbol: string;
  onSelectSymbol: (symbol: string) => void;
  onRefresh: () => void;
}

export interface AccountWorkspaceProps {
  connection: ConnectionState;
  snapshot: AccountSnapshot | null;
  insights: WorkspaceInsights | null;
  reconciliation: LiveReconciliationSummary | null;
  loading: boolean;
  error: string | null;
  onConnect: () => void;
  onRefresh: () => Promise<void> | void;
  onOpenTrading?: (symbol?: string) => void;
  onOpenSettings?: () => void;
}

export interface AlertsWorkspaceProps {
  rules: AlertRule[];
  activeAlerts: Array<{ rule: AlertRule; symbol: string; tier: string }>;
  tickers: SymbolTicker[];
  candidates: CandidateScore[];
  onRulesChange: (rules: AlertRule[]) => void;
}

export interface SettingsWorkspaceProps {
  connection: ConnectionState;
  settings: TerminalSettings;
  onSettingsChange: (settings: TerminalSettings) => void;
  onConnectionChange: (connection: ConnectionState, snapshot?: AccountSnapshot | null) => void;
}
