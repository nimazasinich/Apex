/**
 * Exchange-connection registry.
 *
 * This file is intentionally NOT imported by any pixel-locked UI component
 * yet (SettingsModal.tsx / AccountViews.tsx are under a strict 1368×753
 * Playwright pixel contract that this session could not re-validate end to
 * end). It exists so that a follow-up UI change — made and verified through
 * the full `npm run verify` / pixel-lock QA chain — has a single, truthful
 * source to render "Tabdeal FAPI" as a selectable exchange connection
 * alongside KuCoin, without re-deriving capability logic in the component.
 *
 * KuCoin remains the default/primary exchange; nothing here changes that,
 * and nothing here performs automatic venue failover.
 */
import { buildTabdealCapabilities, deriveConnectionStatus, TABDEAL_EXCHANGE_ID, type TabdealConnectionStatus, type TabdealExecutionStage } from '../services/exchanges/tabdeal/tabdealCapabilities';

export interface ExchangeConnectionDescriptor {
  id: string;
  displayName: string;
  isDefault: boolean;
  status: TabdealConnectionStatus | 'CONNECTED';
  statusLabel: string;
}

export function describeTabdealConnection(
  executionStage: TabdealExecutionStage,
  signal: { credentialsPresent: boolean; lastPublicPingOk: boolean | null; lastAccountReadOk: boolean | null },
): ExchangeConnectionDescriptor {
  const capabilities = buildTabdealCapabilities(executionStage);
  const status = deriveConnectionStatus(capabilities, signal);
  const label: Record<TabdealConnectionStatus, string> = {
    DISCONNECTED: 'Disconnected',
    CONNECTED: 'Connected',
    READ_ONLY: 'Read-only',
    PAPER_READY: 'Paper-ready',
    LIVE_DISABLED: 'Live-disabled',
    DEGRADED: 'Degraded',
  };
  return {
    id: TABDEAL_EXCHANGE_ID,
    displayName: 'Tabdeal FAPI',
    isDefault: false,
    status,
    statusLabel: label[status],
  };
}

export function describeKuCoinConnection(connected: boolean): ExchangeConnectionDescriptor {
  return {
    id: 'kucoin',
    displayName: 'KuCoin Futures',
    isDefault: true,
    status: connected ? 'CONNECTED' : 'DISCONNECTED',
    statusLabel: connected ? 'Connected' : 'Disconnected',
  };
}

/**
 * Renders the full list a Settings UI would show. Order matters: KuCoin
 * first (primary), Tabdeal second (secondary, opt-in) — this function does
 * not pick one for the caller and performs no failover of any kind.
 */
export function listExchangeConnections(input: {
  kuCoinConnected: boolean;
  tabdealExecutionStage: TabdealExecutionStage;
  tabdealSignal: { credentialsPresent: boolean; lastPublicPingOk: boolean | null; lastAccountReadOk: boolean | null };
}): ExchangeConnectionDescriptor[] {
  return [
    describeKuCoinConnection(input.kuCoinConnected),
    describeTabdealConnection(input.tabdealExecutionStage, input.tabdealSignal),
  ];
}
