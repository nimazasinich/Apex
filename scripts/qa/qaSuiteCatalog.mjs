/**
 * Composable QA suite catalog.
 *
 * The historical leaf scripts remain callable for compatibility, but release
 * orchestration should depend on these named suites instead of repeating long
 * shell chains in multiple package.json entries. Each leaf check has one owner.
 */
export const QA_SUITES = Object.freeze({
  'runtime-core': [
    'qa:academy-intelligence-runtime',
    'qa:strategy-engines',
    'qa:backtest-runtime',
    'qa:adaptive-governor',
    'qa:trading-engine-utilities',
    'qa:strategy-library',
    'qa:strategy-integration',
    'qa:strategy-backtest-production',
  ],
  'runtime-safety': [
    'qa:unified-safety-runtime',
    'qa:autopilot-lifecycle-environment',
    'qa:autopilot-lifecycle-runtime',
    'qa:supplemental-key-runtime',
    'qa:proxy-fetch-optional-deps',
    'qa:proxy-fetch-mockability',
  ],
  'runtime-simulation': [
    'qa:comprehensive-simulation',
    'qa:smart-backtesting-fixtures',
    'qa:smart-backtesting-runtime-hardening',
  ],
  'source-core': [
    'qa:merged-stage-ui',
    'qa:agent-safe-merge',
    'qa:overview-semantic-preservation',
    'qa:design-tokens',
    'qa:reference-ui',
    'qa:ui-interaction-polish',
    'qa:ui-theme-merge',
    'qa:light-theme',
    'qa:v19-contract',
    'qa:v20-contract',
    'qa:workspace-light-polish',
    'qa:strategy-optimization',
    'qa:core10-fusion',
    'qa:feature-preservation',
    'qa:liquidity-hunter',
    'qa:v1054-capability-preservation',
    'qa:ui-completeness-r2',
    'qa:research-workspace-layout',
    'qa:research-agent',
    'qa:function-usage-index',
    'qa:app-index',
    'qa:multi-agent-multi-trading',
    'qa:maximal-merge-safety',
    'qa:supplemental-key-wiring',
    'qa:smart-autopilot',
    'qa:strategy-studio-reference',
    'qa:strategy-page-modernization',
    'qa:live-data-truth',
    'qa:dataflow-hardening',
    'qa:attached-reference-pages',
    'qa:academy-intelligence',
    'check:root-contract',
    'check:api-contract',
    'check:build-identity',
  ],
});
