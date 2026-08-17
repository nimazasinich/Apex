export interface LiquidityHunterFeatureFlags {
  liquidityHunterEnabled: boolean;
  shadowOnly: true;
  realtimeEventRecordingEnabled: boolean;
  publicFeedsEnabled: boolean;
  binancePublicFeedEnabled: boolean;
  kucoinPublicFeedEnabled: boolean;
  bybitPublicFeedEnabled: boolean;
  realtimeL2Enabled: boolean;
  optionsGexEnabled: boolean;
  deribitOptionsPublicEnabled: boolean;
  hyblockLiquidationTopologyEnabled: boolean;
  walletGradingEnabled: boolean;
  hyperliquidWalletObserverEnabled: boolean;
  hyperliquidWalletHistoryGradingEnabled: boolean;
  sentimentVelocityEnabled: boolean;
  metaModelEnabled: boolean;
  websocketEnabled: boolean;
  paperCanaryEnabled: boolean;
  testnetCanaryEnabled: boolean;
  autonomousLiveExecutionEnabled: false;
}

export const LIQUIDITY_HUNTER_FLAG_NAMES = [
  'APEX_LIQUIDITY_HUNTER_ENABLED',
  'APEX_LIQUIDITY_HUNTER_SHADOW_ONLY',
  'APEX_REALTIME_EVENT_RECORDING_ENABLED',
  'APEX_LIQUIDITY_HUNTER_PUBLIC_FEEDS_ENABLED',
  'APEX_LIQUIDITY_HUNTER_BINANCE_WS_ENABLED',
  'APEX_LIQUIDITY_HUNTER_KUCOIN_WS_ENABLED',
  'APEX_LIQUIDITY_HUNTER_BYBIT_WS_ENABLED',
  'APEX_REALTIME_L2_ENABLED',
  'APEX_OPTIONS_GEX_ENABLED',
  'APEX_LIQUIDITY_HUNTER_DERIBIT_OPTIONS_ENABLED',
  'APEX_LIQUIDITY_HUNTER_HYBLOCK_LIQUIDATION_ENABLED',
  'APEX_WALLET_GRADING_ENABLED',
  'APEX_LIQUIDITY_HUNTER_HYPERLIQUID_WALLET_OBSERVER_ENABLED',
  'APEX_LIQUIDITY_HUNTER_HYPERLIQUID_WALLET_HISTORY_GRADING_ENABLED',
  'APEX_SENTIMENT_VELOCITY_ENABLED',
  'APEX_META_MODEL_ENABLED',
  'APEX_LIQUIDITY_HUNTER_WS_ENABLED',
  'APEX_LIQUIDITY_HUNTER_PAPER_CANARY',
  'APEX_LIQUIDITY_HUNTER_TESTNET_CANARY',
] as const;

function parseFlag(value: string | undefined): boolean {
  return /^(1|true|yes|on|enabled)$/i.test(String(value ?? '').trim());
}

export function readLiquidityHunterFeatureFlags(
  env: Record<string, string | undefined> = process.env,
): LiquidityHunterFeatureFlags {
  const liquidityHunterEnabled = parseFlag(env.APEX_LIQUIDITY_HUNTER_ENABLED);
  const requestedShadowOnly = env.APEX_LIQUIDITY_HUNTER_SHADOW_ONLY === undefined
    ? true
    : parseFlag(env.APEX_LIQUIDITY_HUNTER_SHADOW_ONLY);

  if (!requestedShadowOnly) {
    throw new Error('liquidity_hunter_shadow_only_cannot_be_disabled_in_core_release');
  }

  return {
    liquidityHunterEnabled,
    shadowOnly: true,
    realtimeEventRecordingEnabled: parseFlag(env.APEX_REALTIME_EVENT_RECORDING_ENABLED),
    publicFeedsEnabled: liquidityHunterEnabled && parseFlag(env.APEX_LIQUIDITY_HUNTER_PUBLIC_FEEDS_ENABLED),
    binancePublicFeedEnabled: liquidityHunterEnabled && parseFlag(env.APEX_LIQUIDITY_HUNTER_PUBLIC_FEEDS_ENABLED) && parseFlag(env.APEX_LIQUIDITY_HUNTER_BINANCE_WS_ENABLED),
    kucoinPublicFeedEnabled: liquidityHunterEnabled && parseFlag(env.APEX_LIQUIDITY_HUNTER_PUBLIC_FEEDS_ENABLED) && parseFlag(env.APEX_LIQUIDITY_HUNTER_KUCOIN_WS_ENABLED),
    bybitPublicFeedEnabled: liquidityHunterEnabled && parseFlag(env.APEX_LIQUIDITY_HUNTER_PUBLIC_FEEDS_ENABLED) && parseFlag(env.APEX_LIQUIDITY_HUNTER_BYBIT_WS_ENABLED),
    realtimeL2Enabled: parseFlag(env.APEX_REALTIME_L2_ENABLED),
    optionsGexEnabled: parseFlag(env.APEX_OPTIONS_GEX_ENABLED),
    deribitOptionsPublicEnabled: liquidityHunterEnabled && parseFlag(env.APEX_OPTIONS_GEX_ENABLED) && parseFlag(env.APEX_LIQUIDITY_HUNTER_DERIBIT_OPTIONS_ENABLED),
    hyblockLiquidationTopologyEnabled: liquidityHunterEnabled && parseFlag(env.APEX_LIQUIDITY_HUNTER_HYBLOCK_LIQUIDATION_ENABLED),
    walletGradingEnabled: parseFlag(env.APEX_WALLET_GRADING_ENABLED),
    hyperliquidWalletObserverEnabled: liquidityHunterEnabled && parseFlag(env.APEX_WALLET_GRADING_ENABLED) && parseFlag(env.APEX_LIQUIDITY_HUNTER_HYPERLIQUID_WALLET_OBSERVER_ENABLED),
    hyperliquidWalletHistoryGradingEnabled: liquidityHunterEnabled && parseFlag(env.APEX_WALLET_GRADING_ENABLED) && parseFlag(env.APEX_LIQUIDITY_HUNTER_HYPERLIQUID_WALLET_HISTORY_GRADING_ENABLED),
    sentimentVelocityEnabled: liquidityHunterEnabled && parseFlag(env.APEX_SENTIMENT_VELOCITY_ENABLED),
    metaModelEnabled: liquidityHunterEnabled && parseFlag(env.APEX_META_MODEL_ENABLED),
    websocketEnabled: parseFlag(env.APEX_LIQUIDITY_HUNTER_WS_ENABLED),
    paperCanaryEnabled: liquidityHunterEnabled && parseFlag(env.APEX_LIQUIDITY_HUNTER_PAPER_CANARY),
    testnetCanaryEnabled: liquidityHunterEnabled && parseFlag(env.APEX_LIQUIDITY_HUNTER_TESTNET_CANARY),
    autonomousLiveExecutionEnabled: false,
  };
}
