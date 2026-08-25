# APEX API Route Index — 2026-08-10

Runtime operations discovered: **136**  
OpenAPI operations: **136**  
Runtime operations documented in OpenAPI: **136 (100.0%)**  
CI coverage floor: **100.0%**

> Generated from current literal Express route registrations in `server.ts` and `src/services/**/*.ts`. Parameter syntax is normalized from `:param` to `{param}` only for OpenAPI comparison.

## Route groups

| Prefix | Operations |
|---|---:|
| `/api/liquidity-hunter` | 17 |
| `/api/hf-space` | 13 |
| `/api/strategies` | 13 |
| `/api/operations` | 12 |
| `/api/market` | 11 |
| `/api/account` | 10 |
| `/api/kucoin` | 10 |
| `/api/supplemental` | 9 |
| `/api/execution` | 8 |
| `/api/binance` | 7 |
| `/api/research` | 5 |
| `/api/decision-memory` | 4 |
| `/api/external-sources` | 4 |
| `/api/telegram` | 4 |
| `/api/backtest` | 2 |
| `/api/feedback` | 1 |
| `/api/health` | 1 |
| `/api/icon` | 1 |
| `/api/intelligence` | 1 |
| `/api/readiness` | 1 |
| `/api/security` | 1 |
| `/api/system` | 1 |

## Complete route index

| Method | Path | Source | OpenAPI |
|---|---|---|---|
| `POST` | `/api/account/connect` | `server.ts:663` | yes |
| `DELETE` | `/api/account/connection` | `server.ts:692` | yes |
| `GET` | `/api/account/connection` | `server.ts:682` | yes |
| `POST` | `/api/account/demo/reset` | `server.ts:726` | yes |
| `POST` | `/api/account/mode` | `server.ts:703` | yes |
| `POST` | `/api/account/orders` | `server.ts:820` | yes |
| `POST` | `/api/account/orders/:id/cancel` | `server.ts:848` | yes |
| `POST` | `/api/account/orders/preview` | `server.ts:799` | yes |
| `GET` | `/api/account/portfolio` | `server.ts:741` | yes |
| `GET` | `/api/account/workspace` | `server.ts:768` | yes |
| `POST` | `/api/backtest/datasource/fetch` | `server.ts:2330` | yes |
| `GET` | `/api/backtest/datasource/status` | `server.ts:2288` | yes |
| `GET` | `/api/binance/depth` | `server.ts:2676` | yes |
| `GET` | `/api/binance/klines` | `server.ts:2684` | yes |
| `GET` | `/api/binance/open-interest` | `server.ts:2700` | yes |
| `GET` | `/api/binance/premium-index` | `server.ts:2693` | yes |
| `GET` | `/api/binance/sentiment-ls` | `server.ts:2625` | yes |
| `GET` | `/api/binance/sentiment-taker` | `server.ts:2645` | yes |
| `GET` | `/api/binance/ticker` | `server.ts:2669` | yes |
| `GET` | `/api/decision-memory` | `src/services/routes/decisionMemoryRoutes.ts:32` | yes |
| `POST` | `/api/decision-memory/batch` | `src/services/routes/decisionMemoryRoutes.ts:10` | yes |
| `GET` | `/api/decision-memory/export` | `src/services/routes/decisionMemoryRoutes.ts:61` | yes |
| `GET` | `/api/decision-memory/status` | `src/services/routes/decisionMemoryRoutes.ts:52` | yes |
| `GET` | `/api/execution/readiness` | `server.ts:955` | yes |
| `GET` | `/api/execution/testnet/account` | `server.ts:1023` | yes |
| `GET` | `/api/execution/testnet/orders` | `server.ts:1035` | yes |
| `POST` | `/api/execution/testnet/orders` | `server.ts:1215` | yes |
| `POST` | `/api/execution/testnet/orders/:id/cancel` | `server.ts:1228` | yes |
| `GET` | `/api/execution/validation/history` | `server.ts:993` | yes |
| `POST` | `/api/execution/validation/orders` | `server.ts:1000` | yes |
| `GET` | `/api/execution/validation/readiness` | `server.ts:983` | yes |
| `POST` | `/api/external-sources/config` | `server.ts:3246` | yes |
| `POST` | `/api/external-sources/config/defaults` | `server.ts:3218` | yes |
| `GET` | `/api/external-sources/status` | `server.ts:3242` | yes |
| `POST` | `/api/external-sources/test` | `server.ts:3256` | yes |
| `POST` | `/api/feedback` | `server.ts:3468` | yes |
| `GET` | `/api/health` | `server.ts:3513` | yes |
| `GET` | `/api/hf-space/historical/:symbol` | `server.ts:2765` | yes |
| `GET` | `/api/hf-space/intel/defi/protocols` | `server.ts:2751` | yes |
| `GET` | `/api/hf-space/intel/defi/yields` | `server.ts:2758` | yes |
| `GET` | `/api/hf-space/intel/news` | `server.ts:2720` | yes |
| `GET` | `/api/hf-space/intel/sentiment` | `server.ts:2730` | yes |
| `POST` | `/api/hf-space/intel/sentiment/analyze` | `server.ts:2778` | yes |
| `GET` | `/api/hf-space/intel/whales` | `server.ts:2740` | yes |
| `GET` | `/api/hf-space/short-hunter/funding/:symbol` | `server.ts:2804` | yes |
| `GET` | `/api/hf-space/short-hunter/market/:symbol` | `server.ts:2791` | yes |
| `GET` | `/api/hf-space/short-hunter/open-interest/:symbol` | `server.ts:2810` | yes |
| `GET` | `/api/hf-space/short-hunter/orderbook/:symbol` | `server.ts:2797` | yes |
| `GET` | `/api/hf-space/short-hunter/snapshot/:symbol` | `server.ts:2816` | yes |
| `GET` | `/api/hf-space/status` | `server.ts:2711` | yes |
| `GET` | `/api/icon/:asset` | `server.ts:337` | yes |
| `GET` | `/api/intelligence/feeds` | `server.ts:3105` | yes |
| `POST` | `/api/kucoin/account-overview` | `server.ts:2426` | yes |
| `POST` | `/api/kucoin/bullet-public` | `server.ts:2573` | yes |
| `GET` | `/api/kucoin/candles` | `server.ts:2463` | yes |
| `GET` | `/api/kucoin/contract` | `server.ts:2549` | yes |
| `GET` | `/api/kucoin/contracts-active` | `server.ts:2527` | yes |
| `GET` | `/api/kucoin/contracts/active` | `server.ts:2538` | yes |
| `GET` | `/api/kucoin/funding` | `server.ts:2515` | yes |
| `GET` | `/api/kucoin/level2` | `server.ts:2451` | yes |
| `GET` | `/api/kucoin/ticker` | `server.ts:2439` | yes |
| `GET` | `/api/kucoin/trades` | `server.ts:2561` | yes |
| `GET` | `/api/liquidity-hunter/edge-thresholds` | `server.ts:1408` | yes |
| `POST` | `/api/liquidity-hunter/edge-thresholds/approve` | `server.ts:1439` | yes |
| `POST` | `/api/liquidity-hunter/edge-thresholds/propose` | `server.ts:1426` | yes |
| `POST` | `/api/liquidity-hunter/edge-thresholds/reject` | `server.ts:1451` | yes |
| `GET` | `/api/liquidity-hunter/evidence/:symbol` | `server.ts:1347` | yes |
| `POST` | `/api/liquidity-hunter/manual-testnet/:setupId/submit` | `server.ts:1217` | yes |
| `GET` | `/api/liquidity-hunter/manual-testnet/plans` | `server.ts:1459` | yes |
| `GET` | `/api/liquidity-hunter/paper-canary` | `server.ts:1310` | yes |
| `POST` | `/api/liquidity-hunter/replay` | `server.ts:1388` | yes |
| `GET` | `/api/liquidity-hunter/replay-datasets` | `server.ts:1374` | yes |
| `GET` | `/api/liquidity-hunter/replay-runs` | `server.ts:1382` | yes |
| `GET` | `/api/liquidity-hunter/replay-runs/:runId` | `server.ts:1383` | yes |
| `GET` | `/api/liquidity-hunter/setups` | `server.ts:1360` | yes |
| `GET` | `/api/liquidity-hunter/setups/:setupId` | `server.ts:1366` | yes |
| `POST` | `/api/liquidity-hunter/shadow/evaluate` | `server.ts:1547` | yes |
| `GET` | `/api/liquidity-hunter/state/:symbol` | `server.ts:1322` | yes |
| `GET` | `/api/liquidity-hunter/world-state/:symbol` | `server.ts:1338` | yes |
| `GET` | `/api/market/backtest` | `src/services/apexNextMarketRoutes.ts:3164` | yes |
| `POST` | `/api/market/backtest/production-input` | `src/services/apexNextMarketRoutes.ts:3353` | yes |
| `GET` | `/api/market/candidates` | `src/services/apexNextMarketRoutes.ts:1201` | yes |
| `GET` | `/api/market/correlation` | `src/services/apexNextMarketRoutes.ts:1159` | yes |
| `GET` | `/api/market/gainers-losers` | `src/services/apexNextMarketRoutes.ts:1150` | yes |
| `GET` | `/api/market/majors` | `src/services/apexNextMarketRoutes.ts:3327` | yes |
| `GET` | `/api/market/open-interest-history` | `server.ts:3728` | yes |
| `GET` | `/api/market/open-interest-history/:symbol` | `server.ts:3719` | yes |
| `GET` | `/api/market/sentiment` | `src/services/apexNextMarketRoutes.ts:1184` | yes |
| `GET` | `/api/market/symbol/:symbol` | `src/services/apexNextMarketRoutes.ts:1484` | yes |
| `GET` | `/api/market/top-volume` | `src/services/apexNextMarketRoutes.ts:1142` | yes |
| `GET` | `/api/operations/adaptive-thresholds` | `server.ts:1259` | yes |
| `POST` | `/api/operations/adaptive-thresholds/approve` | `server.ts:1607` | yes |
| `GET` | `/api/operations/adaptive-thresholds/fast-shadow` | `server.ts:1263` | yes |
| `POST` | `/api/operations/adaptive-thresholds/propose` | `server.ts:1591` | yes |
| `POST` | `/api/operations/adaptive-thresholds/reject` | `server.ts:1620` | yes |
| `POST` | `/api/operations/adaptive-thresholds/rollback` | `server.ts:1632` | yes |
| `GET` | `/api/operations/liquidity-hunter` | `server.ts:1300` | yes |
| `GET` | `/api/operations/market-statistics` | `server.ts:1576` | yes |
| `GET` | `/api/operations/market-streaming` | `server.ts:1282` | yes |
| `GET` | `/api/operations/ml-governance` | `server.ts:1643` | yes |
| `GET` | `/api/operations/status` | `server.ts:1656` | yes |
| `GET` | `/api/operations/trading-modules` | `server.ts:1255` | yes |
| `GET` | `/api/readiness` | `server.ts:305` | yes |
| `POST` | `/api/research/market-making/cross-venue/simulate` | `server.ts:3771` | yes |
| `POST` | `/api/research/market-making/funding-aware/simulate` | `server.ts:3787` | yes |
| `GET` | `/api/research/microstructure/l1/:symbol` | `server.ts:3745` | yes |
| `GET` | `/api/research/microstructure/l2/:symbol` | `server.ts:3757` | yes |
| `GET` | `/api/research/microstructure/status` | `server.ts:3739` | yes |
| `GET` | `/api/security/bootstrap` | `server.ts:544` | yes |
| `GET` | `/api/strategies` | `src/services/apexNextMarketRoutes.ts:1725` | yes |
| `GET` | `/api/strategies/:strategyId` | `src/services/apexNextMarketRoutes.ts:2781` | yes |
| `POST` | `/api/strategies/:strategyId/fusion-preview` | `src/services/apexNextMarketRoutes.ts:2799` | yes |
| `GET` | `/api/strategies/:strategyId/optimization` | `src/services/apexNextMarketRoutes.ts:2884` | yes |
| `POST` | `/api/strategies/:strategyId/optimization/promote` | `src/services/apexNextMarketRoutes.ts:3041` | yes |
| `POST` | `/api/strategies/:strategyId/optimization/rollback` | `src/services/apexNextMarketRoutes.ts:3081` | yes |
| `POST` | `/api/strategies/:strategyId/optimize` | `src/services/apexNextMarketRoutes.ts:2905` | yes |
| `POST` | `/api/strategies/:strategyId/validate` | `src/services/apexNextMarketRoutes.ts:3100` | yes |
| `POST` | `/api/strategies/autopilot/control` | `src/services/apexNextMarketRoutes.ts:2451` | yes |
| `POST` | `/api/strategies/autopilot/cycle` | `src/services/apexNextMarketRoutes.ts:2417` | yes |
| `GET` | `/api/strategies/autopilot/status` | `src/services/apexNextMarketRoutes.ts:1739` | yes |
| `POST` | `/api/strategies/multi-backtest` | `src/services/apexNextMarketRoutes.ts:2581` | yes |
| `POST` | `/api/strategies/paper-multi-trade/size` | `src/services/apexNextMarketRoutes.ts:2746` | yes |
| `GET` | `/api/supplemental/all` | `server.ts:3405` | yes |
| `POST` | `/api/supplemental/config` | `server.ts:3026` | yes |
| `POST` | `/api/supplemental/config/defaults` | `server.ts:3051` | yes |
| `POST` | `/api/supplemental/config/probe` | `server.ts:3066` | yes |
| `GET` | `/api/supplemental/config/status` | `server.ts:3016` | yes |
| `GET` | `/api/supplemental/health` | `server.ts:3435` | yes |
| `GET` | `/api/supplemental/news` | `server.ts:3296` | yes |
| `GET` | `/api/supplemental/onchain` | `server.ts:3368` | yes |
| `GET` | `/api/supplemental/sentiment` | `server.ts:3332` | yes |
| `GET` | `/api/system/health` | `src/services/apexNextMarketRoutes.ts:3336` | yes |
| `POST` | `/api/telegram/config` | `server.ts:3698` | yes |
| `POST` | `/api/telegram/send` | `server.ts:3810` | yes |
| `GET` | `/api/telegram/status` | `server.ts:3684` | yes |
| `POST` | `/api/telegram/test` | `server.ts:3802` | yes |
