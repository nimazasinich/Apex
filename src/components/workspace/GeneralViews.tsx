import type { AccountSnapshot, ConnectionState } from '../../services/accountClient';
import type { TradePlan } from '../../services/tradePlan';
import type { Candle, CandidateScore, ChartFeedStatus, DataState, OrderBookSummary, SentimentComposite, SymbolTicker, TerminalSettings } from '../../types';
import { formatPercent, formatPrice } from '../../lib/marketPresentation';
import { getTickerSparkline } from '../../lib/sparkline';
import { CoinIcon } from '../CoinIcon';
import { MiniSparkline } from '../MiniSparkline';
import type { AccountViewProps } from './AccountViews';
import type { WorkspacePage } from './WorkspaceShell';
import { OverviewMarketSummary } from '../overview/OverviewMarketSummary';
import { OverviewKpiStrip } from '../overview/OverviewKpiStrip';
import { OverviewAttentionPanel } from '../overview/OverviewAttentionPanel';
import { OverviewActivityPanel } from '../overview/OverviewActivityPanel';
import '../overview/OverviewWorkspace.css';

const signed = (value: number | null | undefined) => value == null || value === 0 ? '' : value > 0 ? 'positive' : 'negative';

interface MarketViewProps {
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

interface OverviewProps extends MarketViewProps {
  connection: ConnectionState;
  settings: TerminalSettings;
  snapshot: AccountSnapshot | null;
  account: AccountViewProps;
  selectedTicker: SymbolTicker | null;
  chartCandles: Candle[];
  chartOrderBook: OrderBookSummary | null;
  chartInterval: string;
  chartFeed: ChartFeedStatus;
  onRetryChart: () => void;
  onChartIntervalChange: (interval: '1m' | '5m' | '15m' | '1h' | '4h' | '1d') => void;
  tradePlanLong: TradePlan | null;
  tradePlanShort: TradePlan | null;
  onNavigate: (page: WorkspacePage) => void;
}

function TickerStrip({ tickers, selectedSymbol, onSelectSymbol, limit = 5 }: Pick<MarketViewProps, 'tickers' | 'selectedSymbol' | 'onSelectSymbol'> & { limit?: number }) {
  return (
    <div className="apex-market-strip apex-market-strip-rich">
      {tickers.slice(0, limit).map((ticker) => (
        <button key={ticker.symbol} type="button" className={ticker.symbol === selectedSymbol ? 'active' : ''} onClick={() => onSelectSymbol(ticker.symbol)}>
          <CoinIcon symbol={ticker.symbol} size={28} />
          <span><strong>{ticker.symbol}</strong><small>{formatPrice(ticker.lastPrice)}</small></span>
          <em className={signed(ticker.priceChange24hPct)}>{formatPercent(ticker.priceChange24hPct)}</em>
          <MiniSparkline
            values={getTickerSparkline(ticker)}
            tone={ticker.priceChange24hPct >= 0 ? 'positive' : 'negative'}
          />
        </button>
      ))}
    </div>
  );
}

export function OverviewView(props: OverviewProps) {
  const candidates = [...props.longCandidates, ...props.shortCandidates];
  return (
    <div className="apex-overview-v2" data-testid="overview-workspace">
      <TickerStrip tickers={props.tickers} selectedSymbol={props.selectedSymbol} onSelectSymbol={props.onSelectSymbol} />
      <OverviewKpiStrip
        connection={props.connection}
        snapshot={props.snapshot}
        candidates={candidates}
        onNavigate={props.onNavigate}
      />
      <div className="apex-overview-command-grid">
        <div className="apex-overview-primary-stack">
          <OverviewMarketSummary
            ticker={props.selectedTicker}
            candles={props.chartCandles}
            feed={props.chartFeed}
            onRetry={props.onRetryChart}
            onOpenTrading={() => props.onNavigate('trading')}
          />
          <OverviewActivityPanel snapshot={props.snapshot} connection={props.connection} onNavigate={props.onNavigate} />
        </div>
        <OverviewAttentionPanel
          marketState={props.dataState}
          connection={props.connection}
          snapshot={props.snapshot}
          candidates={candidates}
          onNavigate={props.onNavigate}
        />
      </div>
    </div>
  );
}
