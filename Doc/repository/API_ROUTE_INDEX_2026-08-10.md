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
| `POST` | `/api/account/connect` | `server.ts:648` | yes |
| `DELETE` | `/api/account/connection` | `server.ts:677` | yes |
| `GET` | `/api/account/connection` | `server.ts:667` | yes |
| `POST` | `/api/account/demo/reset` | `server.ts:711` | yes |
| `POST` | `/api/account/mode` | `server.ts:688` | yes |
| `POST` | `/api/account/orders` | `server.ts:805` | yes |
| `POST` | `/api/account/orders/:id/cancel` | `server.ts:833` | yes |
| `POST` | `/api/account/orders/preview` | `server.ts:784` | yes |
| `GET` | `/api/account/portfolio` | `server.ts:726` | yes |
| `GET` | `/api/account/workspace` | `server.ts:753` | yes |
| `POST` | `/api/backtest/datasource/fetch` | `server.ts:2315` | yes |
| `GET` | `/api/backtest/datasource/status` | `server.ts:2273` | yes |
| `GET` | `/api/binance/depth` | `server.ts:2661` | yes |
| `GET` | `/api/binance/klines` | `server.ts:2669` | yes |
| `GET` | `/api/binance/open-interest` | `server.ts:2685` | yes |
| `GET` | `/api/binance/premium-index` | `server.ts:2678` | yes |
| `GET` | `/api/binance/sentiment-ls` | `server.ts:2610` | yes |
| `GET` | `/api/binance/sentiment-taker` | `server.ts:2630` | yes |
| `GET` | `/api/binance/ticker` | `server.ts:2654` | yes |
| `GET` | `/api/decision-memory` | `src/services/routes/decisionMemoryRoutes.ts:32` | yes |
| `POST` | `/api/decision-memory/batch` | `src/services/routes/decisionMemoryRoutes.ts:10` | yes |
| `GET` | `/api/decision-memory/export` | `src/services/routes/decisionMemoryRoutes.ts:61` | yes |
| `GET` | `/api/decision-memory/status` | `src/services/routes/decisionMemoryRoutes.ts:52` | yes |
| `GET` | `/api/execution/readiness` | `server.ts:940` | yes |
| `GET` | `/api/execution/testnet/account` | `server.ts:1008` | yes |
| `GET` | `/api/execution/testnet/orders` | `server.ts:1020` | yes |
| `POST` | `/api/execution/testnet/orders` | `server.ts:1200` | yes |
| `POST` | `/api/execution/testnet/orders/:id/cancel` | `server.ts:1213` | yes |
| `GET` | `/api/execution/validation/history` | `server.ts:978` | yes |
| `POST` | `/api/execution/validation/orders` | `server.ts:985` | yes |
| `GET` | `/api/execution/validation/readiness` | `server.ts:968` | yes |
| `POST` | `/api/external-sources/config` | `server.ts:3231` | yes |
| `POST` | `/api/external-sources/config/defaults` | `server.ts:3203` | yes |
| `GET` | `/api/external-sources/status` | `server.ts:3227` | yes |
| `POST` | `/api/external-sources/test` | `server.ts:3241` | yes |
| `POST` | `/api/feedback` | `server.ts:3453` | yes |
| `GET` | `/api/health` | `server.ts:3498` | yes |
| `GET` | `/api/hf-space/historical/:symbol` | `server.ts:2750` | yes |
| `GET` | `/api/hf-space/intel/defi/protocols` | `server.ts:2736` | yes |
| `GET` | `/api/hf-space/intel/defi/yields` | `server.ts:2743` | yes |
| `GET` | `/api/hf-space/intel/news` | `server.ts:2705` | yes |
| `GET` | `/api/hf-space/intel/sentiment` | `server.ts:2715` | yes |
| `POST` | `/api/hf-space/intel/sentiment/analyze` | `server.ts:2763` | yes |
| `GET` | `/api/hf-space/intel/whales` | `server.ts:2725` | yes |
| `GET` | `/api/hf-space/short-hunter/funding/:symbol` | `server.ts:2789` | yes |
| `GET` | `/api/hf-space/short-hunter/market/:symbol` | `server.ts:2776` | yes |
| `GET` | `/api/hf-space/short-hunter/open-interest/:symbol` | `server.ts:2795` | yes |
| `GET` | `/api/hf-space/short-hunter/orderbook/:symbol` | `server.ts:2782` | yes |
| `GET` | `/api/hf-space/short-hunter/snapshot/:symbol` | `server.ts:2801` | yes |
| `GET` | `/api/hf-space/status` | `server.ts:2696` | yes |
| `GET` | `/api/icon/:asset` | `server.ts:336` | yes |
| `GET` | `/api/intelligence/feeds` | `server.ts:3090` | yes |
| `POST` | `/api/kucoin/account-overview` | `server.ts:2411` | yes |
| `POST` | `/api/kucoin/bullet-public` | `server.ts:2558` | yes |
| `GET` | `/api/kucoin/candles` | `server.ts:2448` | yes |
| `GET` | `/api/kucoin/contract` | `server.ts:2534` | yes |
| `GET` | `/api/kucoin/contracts-active` | `server.ts:2512` | yes |
| `GET` | `/api/kucoin/contracts/active` | `server.ts:2523` | yes |
| `GET` | `/api/kucoin/funding` | `server.ts:2500` | yes |
| `GET` | `/api/kucoin/level2` | `server.ts:2436` | yes |
| `GET` | `/api/kucoin/ticker` | `server.ts:2424` | yes |
| `GET` | `/api/kucoin/trades` | `server.ts:2546` | yes |
| `GET` | `/api/liquidity-hunter/edge-thresholds` | `server.ts:1393` | yes |
| `POST` | `/api/liquidity-hunter/edge-thresholds/approve` | `server.ts:1424` | yes |
| `POST` | `/api/liquidity-hunter/edge-thresholds/propose` | `server.ts:1411` | yes |
| `POST` | `/api/liquidity-hunter/edge-thresholds/reject` | `server.ts:1436` | yes |
| `GET` | `/api/liquidity-hunter/evidence/:symbol` | `server.ts:1332` | yes |
| `POST` | `/api/liquidity-hunter/manual-testnet/:setupId/submit` | `server.ts:1202` | yes |
| `GET` | `/api/liquidity-hunter/manual-testnet/plans` | `server.ts:1444` | yes |
| `GET` | `/api/liquidity-hunter/paper-canary` | `server.ts:1295` | yes |
| `POST` | `/api/liquidity-hunter/replay` | `server.ts:1373` | yes |
| `GET` | `/api/liquidity-hunter/replay-datasets` | `server.ts:1359` | yes |
| `GET` | `/api/liquidity-hunter/replay-runs` | `server.ts:1367` | yes |
| `GET` | `/api/liquidity-hunter/replay-runs/:runId` | `server.ts:1368` | yes |
| `GET` | `/api/liquidity-hunter/setups` | `server.ts:1345` | yes |
| `GET` | `/api/liquidity-hunter/setups/:setupId` | `server.ts:1351` | yes |
| `POST` | `/api/liquidity-hunter/shadow/evaluate` | `server.ts:1532` | yes |
| `GET` | `/api/liquidity-hunter/state/:symbol` | `server.ts:1307` | yes |
| `GET` | `/api/liquidity-hunter/world-state/:symbol` | `server.ts:1323` | yes |
| `GET` | `/api/market/backtest` | `src/services/apexNextMarketRoutes.ts:3164` | yes |
| `POST` | `/api/market/backtest/production-input` | `src/services/apexNextMarketRoutes.ts:3353` | yes |
| `GET` | `/api/market/candidates` | `src/services/apexNextMarketRoutes.ts:1201` | yes |
| `GET` | `/api/market/correlation` | `src/services/apexNextMarketRoutes.ts:1159` | yes |
| `GET` | `/api/market/gainers-losers` | `src/services/apexNextMarketRoutes.ts:1150` | yes |
| `GET` | `/api/market/majors` | `src/services/apexNextMarketRoutes.ts:3327` | yes |
| `GET` | `/api/market/open-interest-history` | `server.ts:3713` | yes |
| `GET` | `/api/market/open-interest-history/:symbol` | `server.ts:3704` | yes |
| `GET` | `/api/market/sentiment` | `src/services/apexNextMarketRoutes.ts:1184` | yes |
| `GET` | `/api/market/symbol/:symbol` | `src/services/apexNextMarketRoutes.ts:1484` | yes |
| `GET` | `/api/market/top-volume` | `src/services/apexNextMarketRoutes.ts:1142` | yes |
| `GET` | `/api/operations/adaptive-thresholds` | `server.ts:1244` | yes |
| `POST` | `/api/operations/adaptive-thresholds/approve` | `server.ts:1592` | yes |
| `GET` | `/api/operations/adaptive-thresholds/fast-shadow` | `server.ts:1248` | yes |
| `POST` | `/api/operations/adaptive-thresholds/propose` | `server.ts:1576` | yes |
| `POST` | `/api/operations/adaptive-thresholds/reject` | `server.ts:1605` | yes |
| `POST` | `/api/operations/adaptive-thresholds/rollback` | `server.ts:1617` | yes |
| `GET` | `/api/operations/liquidity-hunter` | `server.ts:1285` | yes |
| `GET` | `/api/operations/market-statistics` | `server.ts:1561` | yes |
| `GET` | `/api/operations/market-streaming` | `server.ts:1267` | yes |
| `GET` | `/api/operations/ml-governance` | `server.ts:1628` | yes |
| `GET` | `/api/operations/status` | `server.ts:1641` | yes |
| `GET` | `/api/operations/trading-modules` | `server.ts:1240` | yes |
| `GET` | `/api/readiness` | `server.ts:304` | yes |
| `POST` | `/api/research/market-making/cross-venue/simulate` | `server.ts:3756` | yes |
| `POST` | `/api/research/market-making/funding-aware/simulate` | `server.ts:3772` | yes |
| `GET` | `/api/research/microstructure/l1/:symbol` | `server.ts:3730` | yes |
| `GET` | `/api/research/microstructure/l2/:symbol` | `server.ts:3742` | yes |
| `GET` | `/api/research/microstructure/status` | `server.ts:3724` | yes |
| `GET` | `/api/security/bootstrap` | `server.ts:529` | yes |
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
| `GET` | `/api/supplemental/all` | `server.ts:3390` | yes |
| `POST` | `/api/supplemental/config` | `server.ts:3011` | yes |
| `POST` | `/api/supplemental/config/defaults` | `server.ts:3036` | yes |
| `POST` | `/api/supplemental/config/probe` | `server.ts:3051` | yes |
| `GET` | `/api/supplemental/config/status` | `server.ts:3001` | yes |
| `GET` | `/api/supplemental/health` | `server.ts:3420` | yes |
| `GET` | `/api/supplemental/news` | `server.ts:3281` | yes |
| `GET` | `/api/supplemental/onchain` | `server.ts:3353` | yes |
| `GET` | `/api/supplemental/sentiment` | `server.ts:3317` | yes |
| `GET` | `/api/system/health` | `src/services/apexNextMarketRoutes.ts:3336` | yes |
| `POST` | `/api/telegram/config` | `server.ts:3683` | yes |
| `POST` | `/api/telegram/send` | `server.ts:3795` | yes |
| `GET` | `/api/telegram/status` | `server.ts:3669` | yes |
| `POST` | `/api/telegram/test` | `server.ts:3787` | yes |
