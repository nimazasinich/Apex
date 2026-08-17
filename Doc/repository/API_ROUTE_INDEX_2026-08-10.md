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
| `POST` | `/api/account/connect` | `server.ts:605` | yes |
| `DELETE` | `/api/account/connection` | `server.ts:634` | yes |
| `GET` | `/api/account/connection` | `server.ts:624` | yes |
| `POST` | `/api/account/demo/reset` | `server.ts:668` | yes |
| `POST` | `/api/account/mode` | `server.ts:645` | yes |
| `POST` | `/api/account/orders` | `server.ts:762` | yes |
| `POST` | `/api/account/orders/:id/cancel` | `server.ts:790` | yes |
| `POST` | `/api/account/orders/preview` | `server.ts:741` | yes |
| `GET` | `/api/account/portfolio` | `server.ts:683` | yes |
| `GET` | `/api/account/workspace` | `server.ts:710` | yes |
| `POST` | `/api/backtest/datasource/fetch` | `server.ts:2322` | yes |
| `GET` | `/api/backtest/datasource/status` | `server.ts:2280` | yes |
| `GET` | `/api/binance/depth` | `server.ts:2668` | yes |
| `GET` | `/api/binance/klines` | `server.ts:2676` | yes |
| `GET` | `/api/binance/open-interest` | `server.ts:2692` | yes |
| `GET` | `/api/binance/premium-index` | `server.ts:2685` | yes |
| `GET` | `/api/binance/sentiment-ls` | `server.ts:2617` | yes |
| `GET` | `/api/binance/sentiment-taker` | `server.ts:2637` | yes |
| `GET` | `/api/binance/ticker` | `server.ts:2661` | yes |
| `GET` | `/api/decision-memory` | `server.ts:1207` | yes |
| `POST` | `/api/decision-memory/batch` | `server.ts:1195` | yes |
| `GET` | `/api/decision-memory/export` | `server.ts:1636` | yes |
| `GET` | `/api/decision-memory/status` | `server.ts:1227` | yes |
| `GET` | `/api/execution/readiness` | `server.ts:897` | yes |
| `GET` | `/api/execution/testnet/account` | `server.ts:965` | yes |
| `GET` | `/api/execution/testnet/orders` | `server.ts:977` | yes |
| `POST` | `/api/execution/testnet/orders` | `server.ts:1157` | yes |
| `POST` | `/api/execution/testnet/orders/:id/cancel` | `server.ts:1170` | yes |
| `GET` | `/api/execution/validation/history` | `server.ts:935` | yes |
| `POST` | `/api/execution/validation/orders` | `server.ts:942` | yes |
| `GET` | `/api/execution/validation/readiness` | `server.ts:925` | yes |
| `POST` | `/api/external-sources/config` | `server.ts:3238` | yes |
| `POST` | `/api/external-sources/config/defaults` | `server.ts:3210` | yes |
| `GET` | `/api/external-sources/status` | `server.ts:3234` | yes |
| `POST` | `/api/external-sources/test` | `server.ts:3248` | yes |
| `POST` | `/api/feedback` | `server.ts:3460` | yes |
| `GET` | `/api/health` | `server.ts:3505` | yes |
| `GET` | `/api/hf-space/historical/:symbol` | `server.ts:2757` | yes |
| `GET` | `/api/hf-space/intel/defi/protocols` | `server.ts:2743` | yes |
| `GET` | `/api/hf-space/intel/defi/yields` | `server.ts:2750` | yes |
| `GET` | `/api/hf-space/intel/news` | `server.ts:2712` | yes |
| `GET` | `/api/hf-space/intel/sentiment` | `server.ts:2722` | yes |
| `POST` | `/api/hf-space/intel/sentiment/analyze` | `server.ts:2770` | yes |
| `GET` | `/api/hf-space/intel/whales` | `server.ts:2732` | yes |
| `GET` | `/api/hf-space/short-hunter/funding/:symbol` | `server.ts:2796` | yes |
| `GET` | `/api/hf-space/short-hunter/market/:symbol` | `server.ts:2783` | yes |
| `GET` | `/api/hf-space/short-hunter/open-interest/:symbol` | `server.ts:2802` | yes |
| `GET` | `/api/hf-space/short-hunter/orderbook/:symbol` | `server.ts:2789` | yes |
| `GET` | `/api/hf-space/short-hunter/snapshot/:symbol` | `server.ts:2808` | yes |
| `GET` | `/api/hf-space/status` | `server.ts:2703` | yes |
| `GET` | `/api/icon/:asset` | `server.ts:333` | yes |
| `GET` | `/api/intelligence/feeds` | `server.ts:3097` | yes |
| `POST` | `/api/kucoin/account-overview` | `server.ts:2418` | yes |
| `POST` | `/api/kucoin/bullet-public` | `server.ts:2565` | yes |
| `GET` | `/api/kucoin/candles` | `server.ts:2455` | yes |
| `GET` | `/api/kucoin/contract` | `server.ts:2541` | yes |
| `GET` | `/api/kucoin/contracts-active` | `server.ts:2519` | yes |
| `GET` | `/api/kucoin/contracts/active` | `server.ts:2530` | yes |
| `GET` | `/api/kucoin/funding` | `server.ts:2507` | yes |
| `GET` | `/api/kucoin/level2` | `server.ts:2443` | yes |
| `GET` | `/api/kucoin/ticker` | `server.ts:2431` | yes |
| `GET` | `/api/kucoin/trades` | `server.ts:2553` | yes |
| `GET` | `/api/liquidity-hunter/edge-thresholds` | `server.ts:1388` | yes |
| `POST` | `/api/liquidity-hunter/edge-thresholds/approve` | `server.ts:1419` | yes |
| `POST` | `/api/liquidity-hunter/edge-thresholds/propose` | `server.ts:1406` | yes |
| `POST` | `/api/liquidity-hunter/edge-thresholds/reject` | `server.ts:1431` | yes |
| `GET` | `/api/liquidity-hunter/evidence/:symbol` | `server.ts:1327` | yes |
| `POST` | `/api/liquidity-hunter/manual-testnet/:setupId/submit` | `server.ts:1159` | yes |
| `GET` | `/api/liquidity-hunter/manual-testnet/plans` | `server.ts:1439` | yes |
| `GET` | `/api/liquidity-hunter/paper-canary` | `server.ts:1290` | yes |
| `POST` | `/api/liquidity-hunter/replay` | `server.ts:1368` | yes |
| `GET` | `/api/liquidity-hunter/replay-datasets` | `server.ts:1354` | yes |
| `GET` | `/api/liquidity-hunter/replay-runs` | `server.ts:1362` | yes |
| `GET` | `/api/liquidity-hunter/replay-runs/:runId` | `server.ts:1363` | yes |
| `GET` | `/api/liquidity-hunter/setups` | `server.ts:1340` | yes |
| `GET` | `/api/liquidity-hunter/setups/:setupId` | `server.ts:1346` | yes |
| `POST` | `/api/liquidity-hunter/shadow/evaluate` | `server.ts:1527` | yes |
| `GET` | `/api/liquidity-hunter/state/:symbol` | `server.ts:1302` | yes |
| `GET` | `/api/liquidity-hunter/world-state/:symbol` | `server.ts:1318` | yes |
| `GET` | `/api/market/backtest` | `src/services/apexNextMarketRoutes.ts:3150` | yes |
| `POST` | `/api/market/backtest/production-input` | `src/services/apexNextMarketRoutes.ts:3339` | yes |
| `GET` | `/api/market/candidates` | `src/services/apexNextMarketRoutes.ts:1196` | yes |
| `GET` | `/api/market/correlation` | `src/services/apexNextMarketRoutes.ts:1154` | yes |
| `GET` | `/api/market/gainers-losers` | `src/services/apexNextMarketRoutes.ts:1145` | yes |
| `GET` | `/api/market/majors` | `src/services/apexNextMarketRoutes.ts:3313` | yes |
| `GET` | `/api/market/open-interest-history` | `server.ts:3720` | yes |
| `GET` | `/api/market/open-interest-history/:symbol` | `server.ts:3711` | yes |
| `GET` | `/api/market/sentiment` | `src/services/apexNextMarketRoutes.ts:1179` | yes |
| `GET` | `/api/market/symbol/:symbol` | `src/services/apexNextMarketRoutes.ts:1479` | yes |
| `GET` | `/api/market/top-volume` | `src/services/apexNextMarketRoutes.ts:1137` | yes |
| `GET` | `/api/operations/adaptive-thresholds` | `server.ts:1239` | yes |
| `POST` | `/api/operations/adaptive-thresholds/approve` | `server.ts:1587` | yes |
| `GET` | `/api/operations/adaptive-thresholds/fast-shadow` | `server.ts:1243` | yes |
| `POST` | `/api/operations/adaptive-thresholds/propose` | `server.ts:1571` | yes |
| `POST` | `/api/operations/adaptive-thresholds/reject` | `server.ts:1600` | yes |
| `POST` | `/api/operations/adaptive-thresholds/rollback` | `server.ts:1612` | yes |
| `GET` | `/api/operations/liquidity-hunter` | `server.ts:1280` | yes |
| `GET` | `/api/operations/market-statistics` | `server.ts:1556` | yes |
| `GET` | `/api/operations/market-streaming` | `server.ts:1262` | yes |
| `GET` | `/api/operations/ml-governance` | `server.ts:1623` | yes |
| `GET` | `/api/operations/status` | `server.ts:1648` | yes |
| `GET` | `/api/operations/trading-modules` | `server.ts:1235` | yes |
| `GET` | `/api/readiness` | `server.ts:302` | yes |
| `POST` | `/api/research/market-making/cross-venue/simulate` | `server.ts:3763` | yes |
| `POST` | `/api/research/market-making/funding-aware/simulate` | `server.ts:3779` | yes |
| `GET` | `/api/research/microstructure/l1/:symbol` | `server.ts:3737` | yes |
| `GET` | `/api/research/microstructure/l2/:symbol` | `server.ts:3749` | yes |
| `GET` | `/api/research/microstructure/status` | `server.ts:3731` | yes |
| `GET` | `/api/security/bootstrap` | `server.ts:486` | yes |
| `GET` | `/api/strategies` | `src/services/apexNextMarketRoutes.ts:1720` | yes |
| `GET` | `/api/strategies/:strategyId` | `src/services/apexNextMarketRoutes.ts:2771` | yes |
| `POST` | `/api/strategies/:strategyId/fusion-preview` | `src/services/apexNextMarketRoutes.ts:2789` | yes |
| `GET` | `/api/strategies/:strategyId/optimization` | `src/services/apexNextMarketRoutes.ts:2874` | yes |
| `POST` | `/api/strategies/:strategyId/optimization/promote` | `src/services/apexNextMarketRoutes.ts:3027` | yes |
| `POST` | `/api/strategies/:strategyId/optimization/rollback` | `src/services/apexNextMarketRoutes.ts:3067` | yes |
| `POST` | `/api/strategies/:strategyId/optimize` | `src/services/apexNextMarketRoutes.ts:2891` | yes |
| `POST` | `/api/strategies/:strategyId/validate` | `src/services/apexNextMarketRoutes.ts:3086` | yes |
| `POST` | `/api/strategies/autopilot/control` | `src/services/apexNextMarketRoutes.ts:2441` | yes |
| `POST` | `/api/strategies/autopilot/cycle` | `src/services/apexNextMarketRoutes.ts:2407` | yes |
| `GET` | `/api/strategies/autopilot/status` | `src/services/apexNextMarketRoutes.ts:1734` | yes |
| `POST` | `/api/strategies/multi-backtest` | `src/services/apexNextMarketRoutes.ts:2571` | yes |
| `POST` | `/api/strategies/paper-multi-trade/size` | `src/services/apexNextMarketRoutes.ts:2736` | yes |
| `GET` | `/api/supplemental/all` | `server.ts:3397` | yes |
| `POST` | `/api/supplemental/config` | `server.ts:3018` | yes |
| `POST` | `/api/supplemental/config/defaults` | `server.ts:3043` | yes |
| `POST` | `/api/supplemental/config/probe` | `server.ts:3058` | yes |
| `GET` | `/api/supplemental/config/status` | `server.ts:3008` | yes |
| `GET` | `/api/supplemental/health` | `server.ts:3427` | yes |
| `GET` | `/api/supplemental/news` | `server.ts:3288` | yes |
| `GET` | `/api/supplemental/onchain` | `server.ts:3360` | yes |
| `GET` | `/api/supplemental/sentiment` | `server.ts:3324` | yes |
| `GET` | `/api/system/health` | `src/services/apexNextMarketRoutes.ts:3322` | yes |
| `POST` | `/api/telegram/config` | `server.ts:3690` | yes |
| `POST` | `/api/telegram/send` | `server.ts:3802` | yes |
| `GET` | `/api/telegram/status` | `server.ts:3676` | yes |
| `POST` | `/api/telegram/test` | `server.ts:3794` | yes |
