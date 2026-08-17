# Untracked Files Audit

**Generated:** 2026-07-30T17:43:24.823Z
**Branch:** master
**HEAD:** `c2fd1fa34f5169cac188d345a6365e260bee3ff6`
**Accepted UI release:** `desktop-visual-unification-v3.0.0` → `9d13e5845ccb2783b91e0cd6553612a92a94cf25`

## Summary

| Metric | Count |
|--------|------:|
| Tracked files (pre-baseline) | 41 |
| Untracked non-ignored paths | 373 |
| Category A (application source) | 176 |
| Category B (configuration) | 11 |
| Category C (scripts) | 32 |
| Category D (tests) | 3 |
| Category E (documentation) | 70 |
| Category F–K (generated/local) | 76 |
| Category L (unknown) | 5 |

## Classification legend

| Code | Meaning |
|------|---------|
| **A** | Required application source |
| **B** | Required configuration |
| **C** | Required reusable script |
| **D** | Required test |
| **E** | Required documentation |
| **F** | Generated QA evidence |
| **G** | Build output |
| **H** | Dependency/cache |
| **I** | Log or screenshot |
| **J** | Environment/secret |
| **K** | Temporary or backup |
| **L** | Unknown and requiring inspection |

## Ignored paths (sample — via .gitignore)

- `_qa/`
- `dist/`
- `node_modules/`
- `.env`
- `.tmp-testnet-store-*.json`
- `coverage/`
- `playwright-report/`
- `test-results/`

## Full untracked inventory

| Path | Cat | Size | Purpose | Referenced | Required | Safe to track | Secrets | Proposed action |
|------|-----|------|---------|------------|----------|---------------|---------|-----------------|
| `server.ts` | A | 106.4 KB | Express + Vite dev/production server entry (`npm run dev:server`, `npm run build`) | Yes — package.json / Vite entry | Yes | Yes | No | Track |
| `src/components/AdaptiveHeuristics.tsx` | A | 13.2 KB | Application source required for build/run/test | Yes — import graph / tests | Yes | Yes | No | Track |
| `src/components/ApexLogo.tsx` | A | 3.5 KB | Application source required for build/run/test | Yes — import graph / tests | Yes | Yes | No | Track |
| `src/components/ArchivePanel.tsx` | A | 5.0 KB | Application source required for build/run/test | Yes — import graph / tests | Yes | Yes | No | Track |
| `src/components/BootSplash.tsx` | A | 6.0 KB | Application source required for build/run/test | Yes — import graph / tests | Yes | Yes | No | Track |
| `src/components/ChartConfluenceStrip.tsx` | A | 2.2 KB | Application source required for build/run/test | Yes — import graph / tests | Yes | Yes | No | Track |
| `src/components/ChartDeckPanel.tsx` | A | 2.3 KB | Application source required for build/run/test | Yes — import graph / tests | Yes | Yes | No | Track |
| `src/components/ChartTimeframeBar.tsx` | A | 1.7 KB | Application source required for build/run/test | Yes — import graph / tests | Yes | Yes | No | Track |
| `src/components/ChartView.tsx` | A | 4.3 KB | Application source required for build/run/test | Yes — import graph / tests | Yes | Yes | No | Track |
| `src/components/CommandPanel.tsx` | A | 21.4 KB | Application source required for build/run/test | Yes — import graph / tests | Yes | Yes | No | Track |
| `src/components/CompactUniverseSheet.tsx` | A | 10.6 KB | Application source required for build/run/test | Yes — import graph / tests | Yes | Yes | No | Track |
| `src/components/CryptoIcon.tsx` | A | 4.3 KB | Application source required for build/run/test | Yes — import graph / tests | Yes | Yes | No | Track |
| `src/components/DeskExecutionPanel.tsx` | A | 2.3 KB | Application source required for build/run/test | Yes — import graph / tests | Yes | Yes | No | Track |
| `src/components/DesktopHeader.tsx` | A | 9.3 KB | Application source required for build/run/test | Yes — import graph / tests | Yes | Yes | No | Track |
| `src/components/ExecutionCorridorPanel.tsx` | A | 7.9 KB | Application source required for build/run/test | Yes — import graph / tests | Yes | Yes | No | Track |
| `src/components/HistoryPage.tsx` | A | 494 B | Application source required for build/run/test | Yes — import graph / tests | Yes | Yes | No | Track |
| `src/components/HistoryPanel.tsx` | A | 2.1 KB | Application source required for build/run/test | Yes — import graph / tests | Yes | Yes | No | Track |
| `src/components/InsightPanel.tsx` | A | 16.1 KB | Application source required for build/run/test | Yes — import graph / tests | Yes | Yes | No | Track |
| `src/components/LabPage.tsx` | A | 1.5 KB | Application source required for build/run/test | Yes — import graph / tests | Yes | Yes | No | Track |
| `src/components/LeftRail.tsx` | A | 5.1 KB | Application source required for build/run/test | Yes — import graph / tests | Yes | Yes | No | Track |
| `src/components/LevelHUD.tsx` | A | 8.7 KB | Application source required for build/run/test | Yes — import graph / tests | Yes | Yes | No | Track |
| `src/components/LevelLadder.tsx` | A | 18.8 KB | Application source required for build/run/test | Yes — import graph / tests | Yes | Yes | No | Track |
| `src/components/LiveDataHealthPanel.tsx` | A | 12.6 KB | Application source required for build/run/test | Yes — import graph / tests | Yes | Yes | No | Track |
| `src/components/MetricIntegral.tsx` | A | 13.6 KB | Application source required for build/run/test | Yes — import graph / tests | Yes | Yes | No | Track |
| `src/components/MobileCommandStack.tsx` | A | 4.5 KB | Application source required for build/run/test | Yes — import graph / tests | Yes | Yes | No | Track |
| `src/components/MobileWorkspaceNav.tsx` | A | 7.5 KB | Application source required for build/run/test | Yes — import graph / tests | Yes | Yes | No | Track |
| `src/components/OperationalHealthPanel.tsx` | A | 20.0 KB | Application source required for build/run/test | Yes — import graph / tests | Yes | Yes | No | Track |
| `src/components/OpsPage.tsx` | A | 2.6 KB | Application source required for build/run/test | Yes — import graph / tests | Yes | Yes | No | Track |
| `src/components/OrderBookPanel.tsx` | A | 1008 B | Application source required for build/run/test | Yes — import graph / tests | Yes | Yes | No | Track |
| `src/components/OverviewBanner.tsx` | A | 5.4 KB | Application source required for build/run/test | Yes — import graph / tests | Yes | Yes | No | Track |
| `src/components/OverviewCommandDeck.tsx` | A | 2.9 KB | Application source required for build/run/test | Yes — import graph / tests | Yes | Yes | No | Track |
| `src/components/RiskRegimesPanel.tsx` | A | 3.0 KB | Application source required for build/run/test | Yes — import graph / tests | Yes | Yes | No | Track |
| `src/components/SegmentTabBar.tsx` | A | 1.4 KB | Application source required for build/run/test | Yes — import graph / tests | Yes | Yes | No | Track |
| `src/components/shell/AppShell.tsx` | A | 1.1 KB | Application source required for build/run/test | Yes — import graph / tests | Yes | Yes | No | Track |
| `src/components/shell/CommandRail.tsx` | A | 4.3 KB | Application source required for build/run/test | Yes — import graph / tests | Yes | Yes | No | Track |
| `src/components/shell/DockHost.tsx` | A | 4.0 KB | Application source required for build/run/test | Yes — import graph / tests | Yes | Yes | No | Track |
| `src/components/shell/DockSplit.tsx` | A | 1.9 KB | Application source required for build/run/test | Yes — import graph / tests | Yes | Yes | No | Track |
| `src/components/shell/FloatingPanel.tsx` | A | 2.4 KB | Application source required for build/run/test | Yes — import graph / tests | Yes | Yes | No | Track |
| `src/components/shell/index.ts` | A | 352 B | Application source required for build/run/test | Yes — import graph / tests | Yes | Yes | No | Track |
| `src/components/shell/PanelEmptyState.tsx` | A | 526 B | Application source required for build/run/test | Yes — import graph / tests | Yes | Yes | No | Track |
| `src/components/shell/PanelHeader.tsx` | A | 807 B | Application source required for build/run/test | Yes — import graph / tests | Yes | Yes | No | Track |
| `src/components/shell/PanelTabs.tsx` | A | 1.3 KB | Application source required for build/run/test | Yes — import graph / tests | Yes | Yes | No | Track |
| `src/components/SignalCard.tsx` | A | 14.9 KB | Application source required for build/run/test | Yes — import graph / tests | Yes | Yes | No | Track |
| `src/components/SignalDetailSheet.tsx` | A | 35.5 KB | Application source required for build/run/test | Yes — import graph / tests | Yes | Yes | No | Track |
| `src/components/TelegramSettings.tsx` | A | 7.5 KB | Application source required for build/run/test | Yes — import graph / tests | Yes | Yes | No | Track |
| `src/components/TopMoversCard.tsx` | A | 4.6 KB | Application source required for build/run/test | Yes — import graph / tests | Yes | Yes | No | Track |
| `src/components/TrackingBottomDock.tsx` | A | 4.0 KB | Application source required for build/run/test | Yes — import graph / tests | Yes | Yes | No | Track |
| `src/components/TrackingObservatoryPanel.tsx` | A | 18.4 KB | Application source required for build/run/test | Yes — import graph / tests | Yes | Yes | No | Track |
| `src/components/TradingChart.tsx` | A | 69.7 KB | Application source required for build/run/test | Yes — import graph / tests | Yes | Yes | No | Track |
| `src/components/WatchlistCard.tsx` | A | 6.0 KB | Application source required for build/run/test | Yes — import graph / tests | Yes | Yes | No | Track |
| `src/components/workspace/LabResultsTable.tsx` | A | 3.1 KB | Application source required for build/run/test | Yes — import graph / tests | Yes | Yes | No | Track |
| `src/components/workspace/OperationsProvidersTable.tsx` | A | 2.0 KB | Application source required for build/run/test | Yes — import graph / tests | Yes | Yes | No | Track |
| `src/config/completedApiDefaults.ts` | A | 7.1 KB | Application source required for build/run/test | Yes — import graph / tests | Yes | Yes | No | Track |
| `src/constants/decisionMemoryPaths.ts` | A | 418 B | Application source required for build/run/test | Yes — import graph / tests | Yes | Yes | No | Track |
| `src/constants/watchlistDefaults.ts` | A | 247 B | Application source required for build/run/test | Yes — import graph / tests | Yes | Yes | No | Track |
| `src/hooks/useCommandBoardShell.ts` | A | 6.4 KB | Application source required for build/run/test | Yes — import graph / tests | Yes | Yes | No | Track |
| `src/hooks/useIsXl.ts` | A | 647 B | Application source required for build/run/test | Yes — import graph / tests | Yes | Yes | No | Track |
| `src/hooks/useMarketData.ts` | A | 2.2 KB | Application source required for build/run/test | Yes — import graph / tests | Yes | Yes | No | Track |
| `src/hooks/useRejectedCandidateReplay.ts` | A | 2.7 KB | Application source required for build/run/test | Yes — import graph / tests | Yes | Yes | No | Track |
| `src/hooks/useSignalScanner.ts` | A | 24.8 KB | Application source required for build/run/test | Yes — import graph / tests | Yes | Yes | No | Track |
| `src/hooks/useWatchlistTracking.ts` | A | 15.2 KB | Application source required for build/run/test | Yes — import graph / tests | Yes | Yes | No | Track |
| `src/main.tsx` | A | 1.0 KB | Vite client bootstrap referenced by index.html | Yes — package.json / Vite entry | Yes | Yes | No | Track |
| `src/services/adaptiveLearningStress.ts` | A | 10.0 KB | Application source required for build/run/test | Yes — import graph / tests | Yes | Yes | No | Track |
| `src/services/adaptiveThresholdEngine.ts` | A | 28.6 KB | Application source required for build/run/test | Yes — import graph / tests | Yes | Yes | No | Track |
| `src/services/apiMutate.ts` | A | 1.3 KB | Application source required for build/run/test | Yes — import graph / tests | Yes | Yes | No | Track |
| `src/services/archivePanelPrefs.ts` | A | 1016 B | Application source required for build/run/test | Yes — import graph / tests | Yes | Yes | No | Track |
| `src/services/backtesting.ts` | A | 15.4 KB | Application source required for build/run/test | Yes — import graph / tests | Yes | Yes | No | Track |
| `src/services/backtestLedgerPrefs.ts` | A | 915 B | Application source required for build/run/test | Yes — import graph / tests | Yes | Yes | No | Track |
| `src/services/bootPhases.ts` | A | 5.4 KB | Application source required for build/run/test | Yes — import graph / tests | Yes | Yes | No | Track |
| `src/services/commandBoardLayout.ts` | A | 8.6 KB | Application source required for build/run/test | Yes — import graph / tests | Yes | Yes | No | Track |
| `src/services/decisionMemory.ts` | A | 5.7 KB | Application source required for build/run/test | Yes — import graph / tests | Yes | Yes | No | Track |
| `src/services/decisionMemoryDatasetSync.ts` | A | 8.7 KB | Application source required for build/run/test | Yes — import graph / tests | Yes | Yes | No | Track |
| `src/services/decisionMemoryMirror.ts` | A | 6.1 KB | Application source required for build/run/test | Yes — import graph / tests | Yes | Yes | No | Track |
| `src/services/decisionOutcome.ts` | A | 837 B | Application source required for build/run/test | Yes — import graph / tests | Yes | Yes | No | Track |
| `src/services/deskExecutionPanelPrefs.ts` | A | 1.1 KB | Application source required for build/run/test | Yes — import graph / tests | Yes | Yes | No | Track |
| `src/services/directionDivergence.ts` | A | 6.2 KB | Application source required for build/run/test | Yes — import graph / tests | Yes | Yes | No | Track |
| `src/services/directionDivergenceAnalysis.ts` | A | 11.2 KB | Application source required for build/run/test | Yes — import graph / tests | Yes | Yes | No | Track |
| `src/services/exchangeClient.ts` | A | 13.2 KB | Application source required for build/run/test | Yes — import graph / tests | Yes | Yes | No | Track |
| `src/services/executionSafety.ts` | A | 2.1 KB | Application source required for build/run/test | Yes — import graph / tests | Yes | Yes | No | Track |
| `src/services/externalApiSources.ts` | A | 3.1 KB | Application source required for build/run/test | Yes — import graph / tests | Yes | Yes | No | Track |
| `src/services/healthStatus.ts` | A | 1.4 KB | Application source required for build/run/test | Yes — import graph / tests | Yes | Yes | No | Track |
| `src/services/hfSpaceIntel.ts` | A | 10.4 KB | Application source required for build/run/test | Yes — import graph / tests | Yes | Yes | No | Track |
| `src/services/insightPanelPrefs.ts` | A | 1.9 KB | Application source required for build/run/test | Yes — import graph / tests | Yes | Yes | No | Track |
| `src/services/intelligenceFeedProbe.ts` | A | 14.0 KB | Application source required for build/run/test | Yes — import graph / tests | Yes | Yes | No | Track |
| `src/services/intelligenceFeeds.ts` | A | 1.2 KB | Application source required for build/run/test | Yes — import graph / tests | Yes | Yes | No | Track |
| `src/services/lifecycleCore.ts` | A | 7.6 KB | Application source required for build/run/test | Yes — import graph / tests | Yes | Yes | No | Track |
| `src/services/marketData.ts` | A | 70.0 KB | Application source required for build/run/test | Yes — import graph / tests | Yes | Yes | No | Track |
| `src/services/marketDataCoordinator.ts` | A | 4.9 KB | Application source required for build/run/test | Yes — import graph / tests | Yes | Yes | No | Track |
| `src/services/mathEngine.ts` | A | 28.0 KB | Application source required for build/run/test | Yes — import graph / tests | Yes | Yes | No | Track |
| `src/services/mlDatasetPreparation.ts` | A | 6.2 KB | Application source required for build/run/test | Yes — import graph / tests | Yes | Yes | No | Track |
| `src/services/mlFeatureExtractor.ts` | A | 8.5 KB | Application source required for build/run/test | Yes — import graph / tests | Yes | Yes | No | Track |
| `src/services/mlLogisticRegression.ts` | A | 5.8 KB | Application source required for build/run/test | Yes — import graph / tests | Yes | Yes | No | Track |
| `src/services/operationsAdvancedPrefs.ts` | A | 911 B | Application source required for build/run/test | Yes — import graph / tests | Yes | Yes | No | Track |
| `src/services/operationsStatus.ts` | A | 29.9 KB | Application source required for build/run/test | Yes — import graph / tests | Yes | Yes | No | Track |
| `src/services/proposalScore.ts` | A | 3.2 KB | Application source required for build/run/test | Yes — import graph / tests | Yes | Yes | No | Track |
| `src/services/providerHealth.ts` | A | 5.0 KB | Application source required for build/run/test | Yes — import graph / tests | Yes | Yes | No | Track |
| `src/services/providerRouter.ts` | A | 12.3 KB | Application source required for build/run/test | Yes — import graph / tests | Yes | Yes | No | Track |
| `src/services/providerRoutingStress.ts` | A | 16.1 KB | Application source required for build/run/test | Yes — import graph / tests | Yes | Yes | No | Track |
| `src/services/providers/intelligenceSources.ts` | A | 4.5 KB | Application source required for build/run/test | Yes — import graph / tests | Yes | Yes | No | Track |
| `src/services/providers/massiveApiRequest.ts` | A | 3.5 KB | Application source required for build/run/test | Yes — import graph / tests | Yes | Yes | No | Track |
| `src/services/providers/newsApiRequest.ts` | A | 15.6 KB | Application source required for build/run/test | Yes — import graph / tests | Yes | Yes | No | Track |
| `src/services/providers/newsApiServerFetch.ts` | A | 7.5 KB | Application source required for build/run/test | Yes — import graph / tests | Yes | Yes | No | Track |
| `src/services/providers/newsProviders.ts` | A | 9.2 KB | Application source required for build/run/test | Yes — import graph / tests | Yes | Yes | No | Track |
| `src/services/providers/onchainProviders.ts` | A | 28.8 KB | Application source required for build/run/test | Yes — import graph / tests | Yes | Yes | No | Track |
| `src/services/providers/sentimentProviders.ts` | A | 12.8 KB | Application source required for build/run/test | Yes — import graph / tests | Yes | Yes | No | Track |
| `src/services/providers/supplementalTypes.ts` | A | 3.4 KB | Application source required for build/run/test | Yes — import graph / tests | Yes | Yes | No | Track |
| `src/services/providers/usdPricing.ts` | A | 2.8 KB | Application source required for build/run/test | Yes — import graph / tests | Yes | Yes | No | Track |
| `src/services/proxyFetch.ts` | A | 16.5 KB | Application source required for build/run/test | Yes — import graph / tests | Yes | Yes | No | Track |
| `src/services/rejectedCandidateReplay.ts` | A | 6.4 KB | Application source required for build/run/test | Yes — import graph / tests | Yes | Yes | No | Track |
| `src/services/scannerCore.ts` | A | 14.2 KB | Application source required for build/run/test | Yes — import graph / tests | Yes | Yes | No | Track |
| `src/services/sentimentComposite.ts` | A | 6.2 KB | Application source required for build/run/test | Yes — import graph / tests | Yes | Yes | No | Track |
| `src/services/serverSecurity.ts` | A | 7.7 KB | Application source required for build/run/test | Yes — import graph / tests | Yes | Yes | No | Track |
| `src/services/shadowMlComparison.ts` | A | 7.0 KB | Application source required for build/run/test | Yes — import graph / tests | Yes | Yes | No | Track |
| `src/services/shadowMlModel.ts` | A | 5.2 KB | Application source required for build/run/test | Yes — import graph / tests | Yes | Yes | No | Track |
| `src/services/shadowMlTraining.ts` | A | 7.3 KB | Application source required for build/run/test | Yes — import graph / tests | Yes | Yes | No | Track |
| `src/services/signalsDetailPanelPrefs.ts` | A | 1014 B | Application source required for build/run/test | Yes — import graph / tests | Yes | Yes | No | Track |
| `src/services/smartMoneyContextEngine.ts` | A | 16.4 KB | Application source required for build/run/test | Yes — import graph / tests | Yes | Yes | No | Track |
| `src/services/supplementalKeyProbe.ts` | A | 10.1 KB | Application source required for build/run/test | Yes — import graph / tests | Yes | Yes | No | Track |
| `src/services/supplementalOrchestrator.ts` | A | 10.0 KB | Application source required for build/run/test | Yes — import graph / tests | Yes | Yes | No | Track |
| `src/services/supplementalSettings.ts` | A | 5.3 KB | Application source required for build/run/test | Yes — import graph / tests | Yes | Yes | No | Track |
| `src/services/telegram.ts` | A | 6.6 KB | Application source required for build/run/test | Yes — import graph / tests | Yes | Yes | No | Track |
| `src/services/testnetExecution.ts` | A | 15.4 KB | Application source required for build/run/test | Yes — import graph / tests | Yes | Yes | No | Track |
| `src/services/trackingInspectorPrefs.ts` | A | 1.1 KB | Application source required for build/run/test | Yes — import graph / tests | Yes | Yes | No | Track |
| `src/services/workspaceSession.ts` | A | 2.7 KB | Application source required for build/run/test | Yes — import graph / tests | Yes | Yes | No | Track |
| `src/tests/adaptiveLearningStress.test.ts` | A | 1.3 KB | Application source required for build/run/test | Yes — import graph / tests | Yes | Yes | No | Track |
| `src/tests/adaptiveThresholdEngine.hardening.test.ts` | A | 6.6 KB | Application source required for build/run/test | Yes — import graph / tests | Yes | Yes | No | Track |
| `src/tests/adaptiveThresholdEngine.test.ts` | A | 4.4 KB | Application source required for build/run/test | Yes — import graph / tests | Yes | Yes | No | Track |
| `src/tests/archivePanel.test.ts` | A | 858 B | Application source required for build/run/test | Yes — import graph / tests | Yes | Yes | No | Track |
| `src/tests/backtestLedgerPrefs.test.ts` | A | 869 B | Application source required for build/run/test | Yes — import graph / tests | Yes | Yes | No | Track |
| `src/tests/bootSplash.test.ts` | A | 4.1 KB | Application source required for build/run/test | Yes — import graph / tests | Yes | Yes | No | Track |
| `src/tests/commandBoardLayout.test.ts` | A | 2.7 KB | Application source required for build/run/test | Yes — import graph / tests | Yes | Yes | No | Track |
| `src/tests/decisionMemoryDatasetSync.test.ts` | A | 4.6 KB | Application source required for build/run/test | Yes — import graph / tests | Yes | Yes | No | Track |
| `src/tests/decisionMemoryExport.test.ts` | A | 1.4 KB | Application source required for build/run/test | Yes — import graph / tests | Yes | Yes | No | Track |
| `src/tests/decisionMemoryMirror.test.ts` | A | 2.2 KB | Application source required for build/run/test | Yes — import graph / tests | Yes | Yes | No | Track |
| `src/tests/decisionOutcome.test.ts` | A | 1.3 KB | Application source required for build/run/test | Yes — import graph / tests | Yes | Yes | No | Track |
| `src/tests/deskExecutionPanel.test.ts` | A | 1.2 KB | Application source required for build/run/test | Yes — import graph / tests | Yes | Yes | No | Track |
| `src/tests/directionDivergence.test.ts` | A | 1.9 KB | Application source required for build/run/test | Yes — import graph / tests | Yes | Yes | No | Track |
| `src/tests/directionDivergenceAnalysis.test.ts` | A | 6.9 KB | Application source required for build/run/test | Yes — import graph / tests | Yes | Yes | No | Track |
| `src/tests/executionSafety.test.ts` | A | 973 B | Application source required for build/run/test | Yes — import graph / tests | Yes | Yes | No | Track |
| `src/tests/healthStatus.test.ts` | A | 2.1 KB | Application source required for build/run/test | Yes — import graph / tests | Yes | Yes | No | Track |
| `src/tests/insightPanel.test.ts` | A | 3.6 KB | Application source required for build/run/test | Yes — import graph / tests | Yes | Yes | No | Track |
| `src/tests/lifecycleCore.test.ts` | A | 6.2 KB | Application source required for build/run/test | Yes — import graph / tests | Yes | Yes | No | Track |
| `src/tests/logicFixes.test.ts` | A | 3.2 KB | Application source required for build/run/test | Yes — import graph / tests | Yes | Yes | No | Track |
| `src/tests/marketDataCoordinator.test.ts` | A | 5.4 KB | Application source required for build/run/test | Yes — import graph / tests | Yes | Yes | No | Track |
| `src/tests/massiveApiRequest.test.ts` | A | 709 B | Application source required for build/run/test | Yes — import graph / tests | Yes | Yes | No | Track |
| `src/tests/mathEngine.test.ts` | A | 14.8 KB | Application source required for build/run/test | Yes — import graph / tests | Yes | Yes | No | Track |
| `src/tests/mlDatasetPreparation.test.ts` | A | 2.1 KB | Application source required for build/run/test | Yes — import graph / tests | Yes | Yes | No | Track |
| `src/tests/mlFeatureExtractor.test.ts` | A | 4.4 KB | Application source required for build/run/test | Yes — import graph / tests | Yes | Yes | No | Track |
| `src/tests/mlLogisticRegression.test.ts` | A | 1.2 KB | Application source required for build/run/test | Yes — import graph / tests | Yes | Yes | No | Track |
| `src/tests/newsApiRequest.test.ts` | A | 8.0 KB | Application source required for build/run/test | Yes — import graph / tests | Yes | Yes | No | Track |
| `src/tests/onchainSignals.test.ts` | A | 3.0 KB | Application source required for build/run/test | Yes — import graph / tests | Yes | Yes | No | Track |
| `src/tests/operationsAdvancedPrefs.test.ts` | A | 1.2 KB | Application source required for build/run/test | Yes — import graph / tests | Yes | Yes | No | Track |
| `src/tests/operationsStatus.test.ts` | A | 12.6 KB | Application source required for build/run/test | Yes — import graph / tests | Yes | Yes | No | Track |
| `src/tests/providerRouter.test.ts` | A | 6.0 KB | Application source required for build/run/test | Yes — import graph / tests | Yes | Yes | No | Track |
| `src/tests/providerRoutingStress.test.ts` | A | 5.5 KB | Application source required for build/run/test | Yes — import graph / tests | Yes | Yes | No | Track |
| `src/tests/proxyFetch.test.ts` | A | 1.3 KB | Application source required for build/run/test | Yes — import graph / tests | Yes | Yes | No | Track |
| `src/tests/rejectedCandidateReplay.test.ts` | A | 4.9 KB | Application source required for build/run/test | Yes — import graph / tests | Yes | Yes | No | Track |
| `src/tests/scannerCore.test.ts` | A | 5.1 KB | Application source required for build/run/test | Yes — import graph / tests | Yes | Yes | No | Track |
| `src/tests/sentimentComposite.test.ts` | A | 5.4 KB | Application source required for build/run/test | Yes — import graph / tests | Yes | Yes | No | Track |
| `src/tests/serverSecurity.test.ts` | A | 4.7 KB | Application source required for build/run/test | Yes — import graph / tests | Yes | Yes | No | Track |
| `src/tests/shadowMlComparison.test.ts` | A | 5.6 KB | Application source required for build/run/test | Yes — import graph / tests | Yes | Yes | No | Track |
| `src/tests/shadowMlModel.test.ts` | A | 1.7 KB | Application source required for build/run/test | Yes — import graph / tests | Yes | Yes | No | Track |
| `src/tests/shadowMlTraining.test.ts` | A | 3.1 KB | Application source required for build/run/test | Yes — import graph / tests | Yes | Yes | No | Track |
| `src/tests/signalId.test.ts` | A | 601 B | Application source required for build/run/test | Yes — import graph / tests | Yes | Yes | No | Track |
| `src/tests/signalsDetailPanelPrefs.test.ts` | A | 864 B | Application source required for build/run/test | Yes — import graph / tests | Yes | Yes | No | Track |
| `src/tests/smartMoneyContextEngine.extra.test.ts` | A | 3.4 KB | Application source required for build/run/test | Yes — import graph / tests | Yes | Yes | No | Track |
| `src/tests/smartMoneyContextEngine.test.ts` | A | 2.4 KB | Application source required for build/run/test | Yes — import graph / tests | Yes | Yes | No | Track |
| `src/tests/supplemental.test.ts` | A | 15.8 KB | Application source required for build/run/test | Yes — import graph / tests | Yes | Yes | No | Track |
| `src/tests/testnetExecution.test.ts` | A | 7.8 KB | Application source required for build/run/test | Yes — import graph / tests | Yes | Yes | No | Track |
| `src/tests/trackingInspectorPrefs.test.ts` | A | 899 B | Application source required for build/run/test | Yes — import graph / tests | Yes | Yes | No | Track |
| `src/tests/workspaceSession.test.ts` | A | 1.3 KB | Application source required for build/run/test | Yes — import graph / tests | Yes | Yes | No | Track |
| `src/types.ts` | A | 15.4 KB | Application source required for build/run/test | Yes — import graph / tests | Yes | Yes | No | Track |
| `src/types/workspaceShell.ts` | A | 1.6 KB | Application source required for build/run/test | Yes — import graph / tests | Yes | Yes | No | Track |
| `src/utils/decisionMemoryExport.ts` | A | 953 B | Application source required for build/run/test | Yes — import graph / tests | Yes | Yes | No | Track |
| `src/utils/signalDisplay.ts` | A | 4.1 KB | Application source required for build/run/test | Yes — import graph / tests | Yes | Yes | No | Track |
| `src/utils/signalId.ts` | A | 540 B | Application source required for build/run/test | Yes — import graph / tests | Yes | Yes | No | Track |
| `.env.example` | B | 5.0 KB | Documented environment variable template (no secrets) | No direct reference found | Yes | Yes (template only) | No — placeholders only | Track |
| `index.html` | B | 1.3 KB | Vite HTML shell | Yes — package.json / Vite entry | Yes | Yes | No | Track |
| `package-lock.json` | B | 152.3 KB | Reproducible dependency lockfile for npm ci | No direct reference found | Yes | Yes | No | Track |
| `public/apple-touch-icon.png` | B | 45.8 KB | Requires manual inspection | No direct reference found | Yes | Yes | No | Track |
| `public/favicon-32.png` | B | 2.9 KB | Requires manual inspection | No direct reference found | Yes | Yes | No | Track |
| `public/favicon.svg` | B | 1.4 KB | Requires manual inspection | No direct reference found | Yes | Yes | No | Track |
| `public/icon-192.png` | B | 50.1 KB | Requires manual inspection | No direct reference found | Yes | Yes | No | Track |
| `public/icon-512.png` | B | 315.4 KB | Requires manual inspection | No direct reference found | Yes | Yes | No | Track |
| `public/manifest.webmanifest` | B | 448 B | Requires manual inspection | No direct reference found | Yes | Yes | No | Track |
| `tsconfig.json` | B | 786 B | Requires manual inspection | No direct reference found | Yes | Yes | No | Track |
| `vite.config.ts` | B | 1.3 KB | Requires manual inspection | No direct reference found | Yes | Yes | No | Track |
| `scripts/analyzeDirectionDivergence.mts` | C | 7.2 KB | Reusable npm script target under package.json | Yes — package.json script | Yes | Yes | No | Track |
| `scripts/apex_visual_diff.py` | C | 27.2 KB | Reusable npm script target under package.json | Indirect — imported by other scripts | Yes | Yes | No | Track |
| `scripts/auditOperationsPanel.mts` | C | 6.2 KB | Reusable npm script target under package.json | Yes — package.json script | Yes | Yes | No | Track |
| `scripts/auditOverviewLayout.mts` | C | 8.3 KB | Reusable npm script target under package.json | Yes — package.json script | Yes | Yes | No | Track |
| `scripts/captureSecondaryPages.mts` | C | 4.9 KB | Reusable npm script target under package.json | Indirect — imported by other scripts | Yes | Yes | No | Track |
| `scripts/captureV3PhaseGate.mts` | C | 9.3 KB | Reusable npm script target under package.json | Indirect — imported by other scripts | Yes | Yes | No | Track |
| `scripts/captureWorkspaceScreens.mts` | C | 9.2 KB | Reusable npm script target under package.json | Indirect — imported by other scripts | Yes | Yes | No | Track |
| `scripts/checkDocumentationLinks.mts` | C | 1.3 KB | Reusable npm script target under package.json | Yes — package.json script | Yes | Yes | No | Track |
| `scripts/devWithFunctionIndex.mts` | C | 1.6 KB | Reusable npm script target under package.json | Yes — package.json script | Yes | Yes | No | Track |
| `scripts/diagScreenshot.mts` | C | 3.7 KB | Reusable npm script target under package.json | Indirect — imported by other scripts | Yes | Yes | No | Track |
| `scripts/exportDecisionDataset.mts` | C | 10.4 KB | Reusable npm script target under package.json | Yes — package.json script | Yes | Yes | No | Track |
| `scripts/generateDocumentationIndex.mts` | C | 4.4 KB | Reusable npm script target under package.json | Yes — package.json script | Yes | Yes | No | Track |
| `scripts/generateFunctionIndex.mts` | C | 16.5 KB | Reusable npm script target under package.json | Yes — package.json script | Yes | Yes | No | Track |
| `scripts/lib/decisionMemoryLoader.mts` | C | 3.3 KB | Reusable npm script target under package.json | Indirect — imported by other scripts | Yes | Yes | No | Track |
| `scripts/probeIntelHosts.mts` | C | 1.5 KB | Reusable npm script target under package.json | Indirect — imported by other scripts | Yes | Yes | No | Track |
| `scripts/qa/cleanupQaArtifacts.mts` | C | 12.6 KB | Reusable npm script target under package.json | Yes — package.json script | Yes | Yes | No | Track |
| `scripts/queryFunctionIndex.mts` | C | 3.2 KB | Reusable npm script target under package.json | Yes — package.json script | Yes | Yes | No | Track |
| `scripts/replayRejectedCandidates.mts` | C | 6.7 KB | Reusable npm script target under package.json | Yes — package.json script | Yes | Yes | No | Track |
| `scripts/runAdaptiveLearningStress.mts` | C | 2.5 KB | Reusable npm script target under package.json | Yes — package.json script | Yes | Yes | No | Track |
| `scripts/runFastMinuteMatrix.mts` | C | 24.8 KB | Reusable npm script target under package.json | Yes — package.json script | Yes | Yes | No | Track |
| `scripts/runHundredSeedLoadMatrix.mts` | C | 18.2 KB | Reusable npm script target under package.json | Yes — package.json script | Yes | Yes | No | Track |
| `scripts/runProviderRoutingStress.mts` | C | 2.5 KB | Reusable npm script target under package.json | Yes — package.json script | Yes | Yes | No | Track |
| `scripts/runSyntheticDecisionAudit.mts` | C | 10.1 KB | Reusable npm script target under package.json | Yes — package.json script | Yes | Yes | No | Track |
| `scripts/shadowMlCompare.mts` | C | 4.3 KB | Reusable npm script target under package.json | Yes — package.json script | Yes | Yes | No | Track |
| `scripts/smokeOperationsStatus.mts` | C | 6.8 KB | Reusable npm script target under package.json | Yes — package.json script | Yes | Yes | No | Track |
| `scripts/subfinder/build_function_index.py` | C | 4.1 KB | Reusable npm script target under package.json | Indirect — imported by other scripts | Yes | Yes | No | Track |
| `scripts/subfinder/query_function.py` | C | 2.2 KB | Reusable npm script target under package.json | Indirect — imported by other scripts | Yes | Yes | No | Track |
| `scripts/subfinder/README.md` | C | 1.8 KB | Reusable npm script target under package.json | Indirect — imported by other scripts | Yes | Yes | No | Track (relocate under Doc/ in org pass) |
| `scripts/syncDecisionMemoryExport.mts` | C | 3.5 KB | Reusable npm script target under package.json | Yes — package.json script | Yes | Yes | No | Track |
| `scripts/trainShadowMl.mts` | C | 5.3 KB | Reusable npm script target under package.json | Yes — package.json script | Yes | Yes | No | Track |
| `scripts/uiSyntheticAudit.mjs` | C | 14.0 KB | Reusable npm script target under package.json | Yes — package.json script | Yes | Yes | No | Track |
| `scripts/utilities/generateRepositoryAudit.mts` | C | 8.4 KB | Reusable npm script target under package.json | Indirect — imported by other scripts | Yes | Yes | No | Track |
| `tests/intelligence.test.ts` | D | 1.8 KB | Requires manual inspection | No direct reference found | Yes | Yes | No | Track |
| `tests/trackingDisplay.test.ts` | D | 1.2 KB | Requires manual inspection | No direct reference found | Yes | Yes | No | Track |
| `tests/visual-layout.mjs` | D | 8.2 KB | Requires manual inspection | No direct reference found | Yes | Yes | No | Track |
| `.cursor/rules/frontend-master-redesign.md` | E | 15.0 KB | Project documentation | No direct reference found | Recommended | Yes | No | Track (relocate under Doc/ in org pass) |
| `.cursor/rules/insight-panel-visual-audit.md` | E | 6.7 KB | Project documentation | No direct reference found | Recommended | Yes | No | Track (relocate under Doc/ in org pass) |
| `.cursor/rules/ui-ux-redesign.md` | E | 7.0 KB | Project documentation | No direct reference found | Recommended | Yes | No | Track (relocate under Doc/ in org pass) |
| `.kiro/steering/product.md` | E | 1.9 KB | Project documentation | No direct reference found | Recommended | Yes | No | Track (relocate under Doc/ in org pass) |
| `.kiro/steering/structure.md` | E | 4.4 KB | Project documentation | No direct reference found | Recommended | Yes | No | Track (relocate under Doc/ in org pass) |
| `.kiro/steering/tech.md` | E | 4.2 KB | Project documentation | No direct reference found | Recommended | Yes | No | Track (relocate under Doc/ in org pass) |
| `APEX_DEFINITIVE_DESKTOP_UX_UI_CSS_MASTER_PLAN.md` | E | 56.0 KB | Project documentation | No direct reference found | Recommended | Yes | No | Track (relocate under Doc/ in org pass) |
| `APEX_UI_UNIFICATION_EXECUTION_PROMPT_V3.md` | E | 34.3 KB | Project documentation | No direct reference found | Recommended | Yes | No | Track (relocate under Doc/ in org pass) |
| `APEX_UNIFIED_DESKTOP_UX_UI_MASTER_PLAN.md` | E | 26.2 KB | Project documentation | No direct reference found | Recommended | Yes | No | Track (relocate under Doc/ in org pass) |
| `Doc/ANALYST_BOARD_UI_SYNC_PLAN.md` | E | 18.5 KB | Project documentation | Yes — documentation index / README | Recommended | Yes | No | Track (relocate under Doc/ in org pass) |
| `Doc/api-config-complete__1_.txt` | E | 60.2 KB | Project documentation | Yes — documentation index / README | Recommended | Yes | No | Track (relocate under Doc/ in org pass) |
| `Doc/ARCHIVE_CHECKSUMS.json` | E | 3.7 KB | Project documentation | Yes — documentation index / README | Recommended | Yes | No | Track (relocate under Doc/ in org pass) |
| `Doc/automation/adaptive_learning/ADAPTIVE_LEARNING_STRESS_v1.json` | E | 2.7 KB | Project documentation | Yes — documentation index / README | Recommended | Yes | No | Track (relocate under Doc/ in org pass) |
| `Doc/automation/adaptive_learning/ADAPTIVE_LEARNING_STRESS_v1.md` | E | 1.6 KB | Project documentation | Yes — documentation index / README | Recommended | Yes | No | Track (relocate under Doc/ in org pass) |
| `Doc/automation/AUTONOMOUS_LEARNING_STRESS_RESULT.md` | E | 1.4 KB | Project documentation | Yes — documentation index / README | Recommended | Yes | No | Track (relocate under Doc/ in org pass) |
| `Doc/automation/AUTONOMOUS_THRESHOLD_LEARNING_ENGINE.md` | E | 4.2 KB | Project documentation | Yes — documentation index / README | Recommended | Yes | No | Track (relocate under Doc/ in org pass) |
| `Doc/automation/DECISION_MEMORY_DATA_CONTRACT.md` | E | 4.7 KB | Project documentation | Yes — documentation index / README | Recommended | Yes | No | Track (relocate under Doc/ in org pass) |
| `Doc/automation/DIRECTION_DIVERGENCE_POSITION_DETECTOR.md` | E | 3.9 KB | Project documentation | Yes — documentation index / README | Recommended | Yes | No | Track (relocate under Doc/ in org pass) |
| `Doc/automation/direction_divergence/DIRECTION_DIVERGENCE_ANALYSIS_v1.json` | E | 2.8 KB | Project documentation | Yes — documentation index / README | Recommended | Yes | No | Track (relocate under Doc/ in org pass) |
| `Doc/automation/direction_divergence/DIRECTION_DIVERGENCE_ANALYSIS_v1.md` | E | 3.2 KB | Project documentation | Yes — documentation index / README | Recommended | Yes | No | Track (relocate under Doc/ in org pass) |
| `Doc/automation/FAST_MINUTE_SELF_ADAPTATION_ENGINE.md` | E | 1.6 KB | Project documentation | Yes — documentation index / README | Recommended | Yes | No | Track (relocate under Doc/ in org pass) |
| `Doc/automation/LOAD_20M_HARDENED_ACCEPTANCE_RESULT.md` | E | 4.3 KB | Project documentation | Yes — documentation index / README | Recommended | Yes | No | Track (relocate under Doc/ in org pass) |
| `Doc/automation/LOAD_20M_HARDENED_SUMMARY.json` | E | 2.2 KB | Project documentation | Yes — documentation index / README | Recommended | Yes | No | Track (relocate under Doc/ in org pass) |
| `Doc/automation/LOAD_20M_SINGLE_SEED42.json` | E | 35.8 KB | Project documentation | Yes — documentation index / README | Recommended | Yes | No | Track (relocate under Doc/ in org pass) |
| `Doc/automation/LOAD_AND_AUTOMATION_STRESS_PLAN.md` | E | 2.6 KB | Project documentation | Yes — documentation index / README | Recommended | Yes | No | Track (relocate under Doc/ in org pass) |
| `Doc/automation/load_matrix_100/15m_100.json` | E | 182.5 KB | Project documentation | Yes — documentation index / README | Recommended | Yes | No | Track (relocate under Doc/ in org pass) |
| `Doc/automation/load_matrix_100/5m_100.json` | E | 175.5 KB | Project documentation | Yes — documentation index / README | Recommended | Yes | No | Track (relocate under Doc/ in org pass) |
| `Doc/automation/load_matrix_100/5m_warmup_plus_15m_100.json` | E | 182.5 KB | Project documentation | Yes — documentation index / README | Recommended | Yes | No | Track (relocate under Doc/ in org pass) |
| `Doc/automation/load_matrix_100/LOAD_MATRIX_100_RESULT.md` | E | 2.4 KB | Project documentation | Yes — documentation index / README | Recommended | Yes | No | Track (relocate under Doc/ in org pass) |
| `Doc/automation/load_matrix_100/LOAD_MATRIX_100_SUMMARY.json` | E | 612.8 KB | Project documentation | Yes — documentation index / README | Recommended | Yes | No | Track (relocate under Doc/ in org pass) |
| `Doc/automation/load_matrix_fast_1m_5m/1m_100.json` | E | 179.3 KB | Project documentation | Yes — documentation index / README | Recommended | Yes | No | Track (relocate under Doc/ in org pass) |
| `Doc/automation/load_matrix_fast_1m_5m/1m_warmup_plus_5m_100.json` | E | 194.6 KB | Project documentation | Yes — documentation index / README | Recommended | Yes | No | Track (relocate under Doc/ in org pass) |
| `Doc/automation/load_matrix_fast_1m_5m/2m_100.json` | E | 183.4 KB | Project documentation | Yes — documentation index / README | Recommended | Yes | No | Track (relocate under Doc/ in org pass) |
| `Doc/automation/load_matrix_fast_1m_5m/3m_100.json` | E | 184.3 KB | Project documentation | Yes — documentation index / README | Recommended | Yes | No | Track (relocate under Doc/ in org pass) |
| `Doc/automation/load_matrix_fast_1m_5m/4m_100.json` | E | 186.3 KB | Project documentation | Yes — documentation index / README | Recommended | Yes | No | Track (relocate under Doc/ in org pass) |
| `Doc/automation/load_matrix_fast_1m_5m/5m_100.json` | E | 189.0 KB | Project documentation | Yes — documentation index / README | Recommended | Yes | No | Track (relocate under Doc/ in org pass) |
| `Doc/automation/load_matrix_fast_1m_5m/FAST_MINUTE_MATRIX_RESULT.md` | E | 3.9 KB | Project documentation | Yes — documentation index / README | Recommended | Yes | No | Track (relocate under Doc/ in org pass) |
| `Doc/automation/load_matrix_fast_1m_5m/FAST_MINUTE_MATRIX_SUMMARY.json` | E | 1.24 MB | Project documentation | Yes — documentation index / README | Recommended | Yes | No | Track (relocate under Doc/ in org pass) |
| `Doc/automation/ml_dataset/decision_dataset_v1.json` | E | 4.2 KB | Project documentation | Yes — documentation index / README | Recommended | Yes | No | Track (relocate under Doc/ in org pass) |
| `Doc/automation/ml_dataset/VALIDATION_REPORT_v1.md` | E | 8.7 KB | Project documentation | Yes — documentation index / README | Recommended | Yes | No | Track (relocate under Doc/ in org pass) |
| `Doc/automation/ml_shadow/SHADOW_ML_COMPARISON_REPORT_v1.json` | E | 976 B | Project documentation | Yes — documentation index / README | Recommended | Yes | No | Track (relocate under Doc/ in org pass) |
| `Doc/automation/ml_shadow/SHADOW_ML_COMPARISON_REPORT_v1.md` | E | 1.3 KB | Project documentation | Yes — documentation index / README | Recommended | Yes | No | Track (relocate under Doc/ in org pass) |
| `Doc/automation/ml_shadow/SHADOW_ML_TRAINING_REPORT_v1.json` | E | 1.1 KB | Project documentation | Yes — documentation index / README | Recommended | Yes | No | Track (relocate under Doc/ in org pass) |
| `Doc/automation/ml_shadow/SHADOW_ML_TRAINING_REPORT_v1.md` | E | 1.6 KB | Project documentation | Yes — documentation index / README | Recommended | Yes | No | Track (relocate under Doc/ in org pass) |
| `Doc/automation/ML_SIGNAL_MODEL_METHODOLOGY.md` | E | 3.9 KB | Project documentation | Yes — documentation index / README | Recommended | Yes | No | Track (relocate under Doc/ in org pass) |
| `Doc/automation/operations_status/OPERATIONS_PANEL_AUDIT_v1.json` | E | 615 B | Project documentation | Yes — documentation index / README | Recommended | Yes | No | Track (relocate under Doc/ in org pass) |
| `Doc/automation/operations_status/OPERATIONS_STATUS_SMOKE_v1.json` | E | 542 B | Project documentation | Yes — documentation index / README | Recommended | Yes | No | Track (relocate under Doc/ in org pass) |
| `Doc/automation/operations_status/OPERATIONS_STATUS_SMOKE_v1.md` | E | 519 B | Project documentation | Yes — documentation index / README | Recommended | Yes | No | Track (relocate under Doc/ in org pass) |
| `Doc/automation/provider_routing/PROVIDER_ROUTING_STRESS_v1.json` | E | 7.2 KB | Project documentation | Yes — documentation index / README | Recommended | Yes | No | Track (relocate under Doc/ in org pass) |
| `Doc/automation/provider_routing/PROVIDER_ROUTING_STRESS_v1.md` | E | 3.4 KB | Project documentation | Yes — documentation index / README | Recommended | Yes | No | Track (relocate under Doc/ in org pass) |
| `Doc/automation/rejected_replay/REJECTED_REPLAY_REPORT_v1.json` | E | 469 B | Project documentation | Yes — documentation index / README | Recommended | Yes | No | Track (relocate under Doc/ in org pass) |
| `Doc/automation/rejected_replay/REJECTED_REPLAY_REPORT_v1.md` | E | 1.2 KB | Project documentation | Yes — documentation index / README | Recommended | Yes | No | Track (relocate under Doc/ in org pass) |
| `Doc/automation/SMART_MONEY_CONTEXT_ENGINE_RESULT.md` | E | 4.4 KB | Project documentation | Yes — documentation index / README | Recommended | Yes | No | Track (relocate under Doc/ in org pass) |
| `Doc/BEYOND_PROPOSAL_SHORT_INTELLIGENCE.md` | E | 2.7 KB | Project documentation | Yes — documentation index / README | Recommended | Yes | No | Track (relocate under Doc/ in org pass) |
| `Doc/COMMAND_BOARD_DOCKING_REDESIGN_PLAN.md` | E | 17.7 KB | Project documentation | Yes — documentation index / README | Recommended | Yes | No | Track (relocate under Doc/ in org pass) |
| `Doc/COMMAND_CENTER_REDESIGN_PLAN.md` | E | 15.4 KB | Project documentation | Yes — documentation index / README | Recommended | Yes | No | Track (relocate under Doc/ in org pass) |
| `Doc/CONSOLIDATION_MANIFEST.json` | E | 2.1 KB | Project documentation | Yes — documentation index / README | Recommended | Yes | No | Track (relocate under Doc/ in org pass) |
| `Doc/CURSOR_SYSTEM_DEFICIENCY_REMEDIATION_PROMPT.md` | E | 9.3 KB | Project documentation | Yes — documentation index / README | Recommended | Yes | No | Track (relocate under Doc/ in org pass) |
| `Doc/DOCUMENTATION_INDEX.json` | E | 13.2 KB | Project documentation | Yes — documentation index / README | Recommended | Yes | No | Track (relocate under Doc/ in org pass) |
| `Doc/DOCUMENTATION_INDEX.md` | E | 17.9 KB | Project documentation | Yes — documentation index / README | Recommended | Yes | No | Track (relocate under Doc/ in org pass) |
| `Doc/FRONTEND_MASTER_REDESIGN_PLAN.md` | E | 13.4 KB | Project documentation | Yes — documentation index / README | Recommended | Yes | No | Track (relocate under Doc/ in org pass) |
| `Doc/FUNCTION_INDEX_AUTOMATION.md` | E | 1.8 KB | Project documentation | Yes — documentation index / README | Recommended | Yes | No | Track (relocate under Doc/ in org pass) |
| `Doc/FUNCTION_INDEX.json` | E | 731.0 KB | Project documentation | Yes — documentation index / README | Recommended | Yes | No | Track (relocate under Doc/ in org pass) |
| `Doc/FUNCTION_INDEX.md` | E | 122.9 KB | Project documentation | Yes — documentation index / README | Recommended | Yes | No | Track (relocate under Doc/ in org pass) |
| `Doc/PROJECT_UPGRADE_PLAN.md` | E | 25.9 KB | Project documentation | Yes — documentation index / README | Recommended | Yes | No | Track (relocate under Doc/ in org pass) |
| `Doc/README.md` | E | 7.7 KB | Project documentation | Yes — documentation index / README | Recommended | Yes | No | Track (relocate under Doc/ in org pass) |
| `Doc/SUPPLEMENTAL_INTELLIGENCE.md` | E | 10.6 KB | Project documentation | Yes — documentation index / README | Recommended | Yes | No | Track (relocate under Doc/ in org pass) |
| `Doc/UX_IA_IMPROVEMENT_PLAN_v1.md` | E | 16.2 KB | Project documentation | Yes — documentation index / README | Recommended | Yes | No | Track (relocate under Doc/ in org pass) |
| `README.md` | E | 10.0 KB | Project documentation | No direct reference found | Recommended | Yes | No | Track (relocate under Doc/ in org pass) |
| `Refrence.md` | E | 69.3 KB | Agent navigation reference; linked from project docs | No direct reference found | Recommended | Yes | No | Track (relocate under Doc/ in org pass) |
| `qa/chrome-devtools/achieved-1672x941.png` | F | 493.7 KB | Generated QA capture evidence (_qa/ gitignored) | No direct reference found | No | No | No | Ignore / do not track |
| `qa/chrome-devtools/capture-report.json` | F | 4.3 KB | Generated QA capture evidence (_qa/ gitignored) | No direct reference found | No | No | No | Ignore / do not track |
| `qa/chrome-devtools/dom-snapshot.txt` | F | 6.7 KB | Generated QA capture evidence (_qa/ gitignored) | No direct reference found | No | No | No | Ignore / do not track |
| `cc-current-1672x941.png` | I | 431.3 KB | Ad-hoc screenshot at repo root | No direct reference found | No | No | No | Ignore / do not track |
| `Print-Screen/127.0.0.1_47501_ (1).png` | I | 2.10 MB | Requires manual inspection | No direct reference found | No | No | No | Ignore / do not track |
| `Print-Screen/127.0.0.1_47501_ (10).png` | I | 2.70 MB | Requires manual inspection | No direct reference found | No | No | No | Ignore / do not track |
| `Print-Screen/127.0.0.1_47501_ (11).png` | I | 821.2 KB | Requires manual inspection | No direct reference found | No | No | No | Ignore / do not track |
| `Print-Screen/127.0.0.1_47501_ (2).png` | I | 1.44 MB | Requires manual inspection | No direct reference found | No | No | No | Ignore / do not track |
| `Print-Screen/127.0.0.1_47501_ (3).png` | I | 718.8 KB | Requires manual inspection | No direct reference found | No | No | No | Ignore / do not track |
| `Print-Screen/127.0.0.1_47501_ (4).png` | I | 1.47 MB | Requires manual inspection | No direct reference found | No | No | No | Ignore / do not track |
| `Print-Screen/127.0.0.1_47501_ (5).png` | I | 2.02 MB | Requires manual inspection | No direct reference found | No | No | No | Ignore / do not track |
| `Print-Screen/127.0.0.1_47501_ (6).png` | I | 3.17 MB | Requires manual inspection | No direct reference found | No | No | No | Ignore / do not track |
| `Print-Screen/127.0.0.1_47501_ (7).png` | I | 3.15 MB | Requires manual inspection | No direct reference found | No | No | No | Ignore / do not track |
| `Print-Screen/127.0.0.1_47501_ (8).png` | I | 1.59 MB | Requires manual inspection | No direct reference found | No | No | No | Ignore / do not track |
| `Print-Screen/127.0.0.1_47501_ (9).png` | I | 2.28 MB | Requires manual inspection | No direct reference found | No | No | No | Ignore / do not track |
| `Print-Screen/127.0.0.1_47501_.png` | I | 1.30 MB | Requires manual inspection | No direct reference found | No | No | No | Ignore / do not track |
| `.agent-index/functions_index.json` | K | 604.6 KB | Editor config, temp store, or archive — local only | No direct reference found | No | No | No | Ignore / do not track |
| `.agent-index/python_functions_index.json` | K | 5.2 KB | Editor config, temp store, or archive — local only | No direct reference found | No | No | No | Ignore / do not track |
| `.cursor/hooks.json` | K | 194 B | Editor config, temp store, or archive — local only | No direct reference found | No | No | No | Ignore / do not track |
| `.cursor/hooks/reindex-functions.mjs` | K | 1.8 KB | Editor config, temp store, or archive — local only | No direct reference found | No | No | No | Ignore / do not track |
| `.cursor/rules/function-index.mdc` | K | 1.3 KB | Editor config, temp store, or archive — local only | No direct reference found | No | No | No | Ignore / do not track |
| `.cursor/settings.json` | K | 116 B | Editor config, temp store, or archive — local only | No direct reference found | No | No | No | Ignore / do not track |
| `.kiro/hooks/postman-api-testing.kiro.hook` | K | 841 B | Editor config, temp store, or archive — local only | No direct reference found | No | No | No | Ignore / do not track |
| `.kiro/settings/mcp.json` | K | 155 B | Editor config, temp store, or archive — local only | No direct reference found | No | No | No | Ignore / do not track |
| `.tmp-validation-store-00ed92fe-b0de-438e-9a3b-84c5cb53655e.json` | K | 525 B | Editor config, temp store, or archive — local only | No direct reference found | No | No | No | Ignore / do not track |
| `.tmp-validation-store-022ea1f2-26a1-44aa-965c-c5b352d1b692.json` | K | 525 B | Editor config, temp store, or archive — local only | No direct reference found | No | No | No | Ignore / do not track |
| `.tmp-validation-store-103cb78c-693b-4db1-9004-e0c2dbf4c2ce.json` | K | 525 B | Editor config, temp store, or archive — local only | No direct reference found | No | No | No | Ignore / do not track |
| `.tmp-validation-store-17e6d5fc-aaf0-4898-ae02-8ee8844d0940.json` | K | 525 B | Editor config, temp store, or archive — local only | No direct reference found | No | No | No | Ignore / do not track |
| `.tmp-validation-store-1957ab7b-5802-42e2-aca7-d9c193516027.json` | K | 525 B | Editor config, temp store, or archive — local only | No direct reference found | No | No | No | Ignore / do not track |
| `.tmp-validation-store-1fbb74c9-6212-4497-9225-3c39e340a5a3.json` | K | 525 B | Editor config, temp store, or archive — local only | No direct reference found | No | No | No | Ignore / do not track |
| `.tmp-validation-store-22e6c450-e641-4e83-a602-e17921862664.json` | K | 525 B | Editor config, temp store, or archive — local only | No direct reference found | No | No | No | Ignore / do not track |
| `.tmp-validation-store-2909031a-175f-4944-9fbf-18110a267f70.json` | K | 525 B | Editor config, temp store, or archive — local only | No direct reference found | No | No | No | Ignore / do not track |
| `.tmp-validation-store-29718633-e7d5-4396-8b7c-1b1fd1996ccb.json` | K | 525 B | Editor config, temp store, or archive — local only | No direct reference found | No | No | No | Ignore / do not track |
| `.tmp-validation-store-29d66b35-35f3-40aa-9192-b3732324d51e.json` | K | 525 B | Editor config, temp store, or archive — local only | No direct reference found | No | No | No | Ignore / do not track |
| `.tmp-validation-store-2ffda8bb-b6ed-4249-954c-eec7000bd585.json` | K | 525 B | Editor config, temp store, or archive — local only | No direct reference found | No | No | No | Ignore / do not track |
| `.tmp-validation-store-3575b867-3a59-4f76-b525-6c5bd691eac7.json` | K | 525 B | Editor config, temp store, or archive — local only | No direct reference found | No | No | No | Ignore / do not track |
| `.tmp-validation-store-3fc7dc5f-2811-4bb8-a6dc-bb1e265a54e8.json` | K | 525 B | Editor config, temp store, or archive — local only | No direct reference found | No | No | No | Ignore / do not track |
| `.tmp-validation-store-4b07e26f-7cbe-4505-b4cb-572cb4ee91e7.json` | K | 525 B | Editor config, temp store, or archive — local only | No direct reference found | No | No | No | Ignore / do not track |
| `.tmp-validation-store-516b6837-1e10-4ae9-9bf6-c897a995a0b4.json` | K | 525 B | Editor config, temp store, or archive — local only | No direct reference found | No | No | No | Ignore / do not track |
| `.tmp-validation-store-5d6304c3-75f2-4c9f-9e2a-29713aa86df5.json` | K | 525 B | Editor config, temp store, or archive — local only | No direct reference found | No | No | No | Ignore / do not track |
| `.tmp-validation-store-62020a09-01d0-4af4-9c5a-9d020c14deb7.json` | K | 525 B | Editor config, temp store, or archive — local only | No direct reference found | No | No | No | Ignore / do not track |
| `.tmp-validation-store-67d09ac0-7d96-4cb7-b29e-4ae5e9f8faff.json` | K | 525 B | Editor config, temp store, or archive — local only | No direct reference found | No | No | No | Ignore / do not track |
| `.tmp-validation-store-68826678-badc-4822-af94-e1f399928a1a.json` | K | 525 B | Editor config, temp store, or archive — local only | No direct reference found | No | No | No | Ignore / do not track |
| `.tmp-validation-store-69daa6d8-e6ce-4759-93dc-8cc11d5b62a3.json` | K | 525 B | Editor config, temp store, or archive — local only | No direct reference found | No | No | No | Ignore / do not track |
| `.tmp-validation-store-6ed058e0-e1f5-4af4-9171-aba80453f153.json` | K | 525 B | Editor config, temp store, or archive — local only | No direct reference found | No | No | No | Ignore / do not track |
| `.tmp-validation-store-7b53b8b3-1d83-450b-9a52-ccf71c71980a.json` | K | 525 B | Editor config, temp store, or archive — local only | No direct reference found | No | No | No | Ignore / do not track |
| `.tmp-validation-store-7ff9d158-cd82-43ec-a872-1da22d71b9f0.json` | K | 525 B | Editor config, temp store, or archive — local only | No direct reference found | No | No | No | Ignore / do not track |
| `.tmp-validation-store-80a456b9-57ac-465e-b106-0763bfd44f43.json` | K | 525 B | Editor config, temp store, or archive — local only | No direct reference found | No | No | No | Ignore / do not track |
| `.tmp-validation-store-80d32714-3a93-4c7c-8a7f-feb4107d1a25.json` | K | 525 B | Editor config, temp store, or archive — local only | No direct reference found | No | No | No | Ignore / do not track |
| `.tmp-validation-store-823b37f3-4aa2-423a-a32f-e063a2033ae6.json` | K | 525 B | Editor config, temp store, or archive — local only | No direct reference found | No | No | No | Ignore / do not track |
| `.tmp-validation-store-87da757a-c9e5-42ba-ab30-472fa45e7042.json` | K | 525 B | Editor config, temp store, or archive — local only | No direct reference found | No | No | No | Ignore / do not track |
| `.tmp-validation-store-893a7a9a-33fc-41ce-9eba-8c263f9808d2.json` | K | 525 B | Editor config, temp store, or archive — local only | No direct reference found | No | No | No | Ignore / do not track |
| `.tmp-validation-store-8ebd37ac-2cdb-457f-8b37-171fca340756.json` | K | 525 B | Editor config, temp store, or archive — local only | No direct reference found | No | No | No | Ignore / do not track |
| `.tmp-validation-store-8ece6f91-8bc6-4395-bd62-3a6ca60d3788.json` | K | 525 B | Editor config, temp store, or archive — local only | No direct reference found | No | No | No | Ignore / do not track |
| `.tmp-validation-store-91616878-2ef2-499d-8df8-6fb48f615e87.json` | K | 525 B | Editor config, temp store, or archive — local only | No direct reference found | No | No | No | Ignore / do not track |
| `.tmp-validation-store-9c7dedfc-4f04-47e8-a0b2-4fc94f649b43.json` | K | 525 B | Editor config, temp store, or archive — local only | No direct reference found | No | No | No | Ignore / do not track |
| `.tmp-validation-store-a0255f84-1258-44d8-8e9f-625a1affa225.json` | K | 525 B | Editor config, temp store, or archive — local only | No direct reference found | No | No | No | Ignore / do not track |
| `.tmp-validation-store-a1ba35f8-7e1a-4dc0-a52a-78b386f5aaf3.json` | K | 525 B | Editor config, temp store, or archive — local only | No direct reference found | No | No | No | Ignore / do not track |
| `.tmp-validation-store-a518f350-7170-4b98-adf7-2eef72d9083e.json` | K | 525 B | Editor config, temp store, or archive — local only | No direct reference found | No | No | No | Ignore / do not track |
| `.tmp-validation-store-a5d1268b-8297-481f-a9da-142f941bcb81.json` | K | 525 B | Editor config, temp store, or archive — local only | No direct reference found | No | No | No | Ignore / do not track |
| `.tmp-validation-store-a86cfff9-9c8a-4a55-a50a-ff5194778120.json` | K | 525 B | Editor config, temp store, or archive — local only | No direct reference found | No | No | No | Ignore / do not track |
| `.tmp-validation-store-a9eaed1c-f267-4fcd-80ce-3f473e72ab10.json` | K | 525 B | Editor config, temp store, or archive — local only | No direct reference found | No | No | No | Ignore / do not track |
| `.tmp-validation-store-b7ba873f-d2d2-46be-8933-9efa8d2abbd0.json` | K | 525 B | Editor config, temp store, or archive — local only | No direct reference found | No | No | No | Ignore / do not track |
| `.tmp-validation-store-c06fdbcf-fcb7-43cc-89fb-40a8b8af181a.json` | K | 525 B | Editor config, temp store, or archive — local only | No direct reference found | No | No | No | Ignore / do not track |
| `.tmp-validation-store-c1373157-5b86-4ec4-b724-14a55ff7c0aa.json` | K | 525 B | Editor config, temp store, or archive — local only | No direct reference found | No | No | No | Ignore / do not track |
| `.tmp-validation-store-c4f3760c-8dc0-4bd1-9448-b5a9dcb1d87b.json` | K | 525 B | Editor config, temp store, or archive — local only | No direct reference found | No | No | No | Ignore / do not track |
| `.tmp-validation-store-c536f5c5-e55b-4977-8c18-38838daf7ee0.json` | K | 525 B | Editor config, temp store, or archive — local only | No direct reference found | No | No | No | Ignore / do not track |
| `.tmp-validation-store-d8920dc8-ad08-405e-9a06-13fa38f0eca7.json` | K | 525 B | Editor config, temp store, or archive — local only | No direct reference found | No | No | No | Ignore / do not track |
| `.tmp-validation-store-dd1970b3-6d8e-4e5d-b9d2-47ac9599be33.json` | K | 525 B | Editor config, temp store, or archive — local only | No direct reference found | No | No | No | Ignore / do not track |
| `.tmp-validation-store-e110dd25-d8d0-4e53-a7dc-4da761ef7c6f.json` | K | 525 B | Editor config, temp store, or archive — local only | No direct reference found | No | No | No | Ignore / do not track |
| `.tmp-validation-store-e3f41186-e962-42d5-b344-331a6b7fadaa.json` | K | 525 B | Editor config, temp store, or archive — local only | No direct reference found | No | No | No | Ignore / do not track |
| `.tmp-validation-store-edc37a29-1599-49c4-8a2b-91dd3dd6f873.json` | K | 525 B | Editor config, temp store, or archive — local only | No direct reference found | No | No | No | Ignore / do not track |
| `.vscode/settings.json` | K | 4 B | Editor config, temp store, or archive — local only | No direct reference found | No | No | No | Ignore / do not track |
| `Archived/_archive_20260727_consolidated.zip` | K | 1.79 GB | Editor config, temp store, or archive — local only | No direct reference found | No | No | No | Ignore / do not track |
| `Archived/_archive_docs_historical_20260727.zip` | K | 1.80 MB | Editor config, temp store, or archive — local only | No direct reference found | No | No | No | Ignore / do not track |
| `Archived/temp_20260727.zip` | K | 50.8 KB | Editor config, temp store, or archive — local only | No direct reference found | No | No | No | Ignore / do not track |
| `_write_insightpanel.ps1` | L | 21.5 KB | One-off PowerShell helper script | No direct reference found | No | No | No | Inspect then decide |
| `.postman.json` | L | 19.4 KB | Requires manual inspection | No direct reference found | No | No | No | Inspect then decide |
| `apex_visual_diff.py` | L | 36.3 KB | Duplicate of scripts/apex_visual_diff.py at root | No direct reference found | No | No | No | Inspect then decide |
| `build_log.txt` | L | 424 B | Local build log artifact | No direct reference found | No | No | No | Inspect then decide |
| `metadata.json` | L | 252 B | Legacy project metadata; not referenced by build scripts | No direct reference found | No | No | No | Ignore — unused by build |

## Tracked files at audit time (41)

```
.gitignore
Doc/DESKTOP_VISUAL_UNIFICATION_FINAL_REPORT.md
package.json
scripts/accessibilitySmoke.spec.mts
scripts/buildContactSheet.mts
scripts/captureEmptyStates.mts
scripts/captureV3FinalAcceptance.mts
scripts/checkCssArbitraryColors.mjs
scripts/lib/captureServer.mts
scripts/recaptureIntel.mts
scripts/verifySplitDockHeaded.mts
scripts/verifyStep1Chrome.mts
scripts/workspaceGeometry.spec.mts
src/App.tsx
src/components/BacktestingPanel.tsx
src/components/CommandCenterPage.tsx
src/components/DockToolContent.tsx
src/components/IntelPage.tsx
src/components/IntelligencePanel.tsx
src/components/MarketsPage.tsx
src/components/MemoryPage.tsx
src/components/SettingsPanel.tsx
src/components/SignalsPage.tsx
src/components/TrackingPage.tsx
src/components/TradingDeskPage.tsx
src/components/WatchlistPanel.tsx
src/components/ui.tsx
src/components/workspace/CompactPositionsPanel.tsx
src/components/workspace/CompactTicketPanel.tsx
src/components/workspace/MarketsDataTable.tsx
src/components/workspace/MemoryArchiveTable.tsx
src/components/workspace/MemoryDecisionTable.tsx
src/components/workspace/SignalQueueTable.tsx
src/components/workspace/TrackingLifecycleTable.tsx
src/components/workspace/WorkspacePageTemplate.tsx
src/components/workspace/WorkspaceTableToolbar.tsx
src/index.css
src/qa/qaVisualMode.ts
src/qa/visualFixtures.ts
src/utils/signalRisk.ts
src/utils/trackingDisplay.ts
```
