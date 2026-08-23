# APEX structural profitability remediation — 2026-08-22

## Verdict

**NOT YET PROFITABLE OR PROMOTABLE.** No parameters were tuned in this remediation. The fresh holdout was sealed by content hash before its returns were evaluated, and no failed result was retuned.

## 1. Data infrastructure

| Series | Status | From | To | Rows / reason | SHA-256 prefix |
| --- | --- | --- | --- | --- | --- |
| btcusdt-candles-1h.json | Available | 2020-09-01 | 2025-12-31 | 46752 | d491c533583cab43 |
| ethusdt-candles-1h.json | Available | 2021-01-01 | 2025-12-31 | 43824 | f799d77ab0ac6353 |
| btcusdt-funding.json | Available | 2020-09-01 | 2025-12-31 | 5844 | a2b28ed1178239b2 |
| ethusdt-funding.json | Available | 2021-01-01 | 2025-12-31 | 5478 | dace2670f249f7f9 |
| btcusdt-open-interest-top-trader-1h.json | Available | 2022-01-01 | 2025-12-31 | 34958 | c28cb04b2498e849 |
| ethusdt-open-interest-top-trader-1h.json | Available | 2022-01-01 | 2025-12-31 | 34985 | 7a3fd7a35d516ee3 |
| btcusdt-order-book-depth-weekly-sample.json | Available | 2023-01-02 | 2025-12-29 | 3722 | bb28d05bb526cbcf |
| ethusdt-order-book-depth-weekly-sample.json | Available | 2023-01-02 | 2025-12-29 | 3722 | afea3a3076ab22a4 |
| crypto-news-google-rss.json | Available | 2022-01-03 | 2025-12-31 | 4799 | 0e42bd2c7feade97 |
| crypto-fear-greed-daily.json | Available | 2018-02-01 | 2026-08-22 | 3121 | d84c04439e6af509 |
| spread | Unavailable | — | — | Binance historical bookDepth archives contain depth bands but no top-of-book bid/ask spread. The historical bookTicker archive ends in 2023 and does not cover the sealed 2024-2025 1h holdout. | — |
| entity_classified_whale_flow | Unavailable | — | — | Whale Alert rejected unauthenticated access and no owner-provided on-chain/entity-labelled archive or API credential was supplied. Binance top-trader/taker flow is retained only as an explicitly labelled proxy. | — |

Every stored series has a payload SHA-256, exact-file SHA-256, and per-upstream-page SHA-256. Entity-classified whale flow and historical top-of-book spread remain unavailable for the reasons shown; the report does not relabel proxies as native data.

## 2. Strategy adapter separation

| Dataset | Strategy | Holdout trades | Sequence hash prefix | Distinct |
| --- | --- | --- | --- | --- |
| BTC_1H | crypto-multi-alpha-ls-v1 | 236 | acfda0644cf60282 | PASS |
| BTC_1H | funding-basis-carry-v1 | 64 | ba0c4ace9bcda1e6 | PASS |
| BTC_1H | liquidity-sweep-fvg-reversal-v1 | 86 | d5e93fba3751ed3c | PASS |
| BTC_1H | whale-flow-sentiment-reversal-v1 | 42 | 0d52635a81b9db68 | PASS |
| BTC_1H | news-sentiment-momentum-breakout-v1 | 19 | c7505dbaefd781f9 | PASS |
| ETH_1H | crypto-multi-alpha-ls-v1 | 201 | 1dfcae62f045dbb5 | PASS |
| ETH_1H | funding-basis-carry-v1 | 77 | 292ac44fea285a87 | PASS |
| ETH_1H | liquidity-sweep-fvg-reversal-v1 | 79 | 4707d6da107c0d5c | PASS |
| ETH_1H | whale-flow-sentiment-reversal-v1 | 51 | 113bc8cdb31fb154 | PASS |
| ETH_1H | news-sentiment-momentum-breakout-v1 | 18 | f65420ce9a819fd6 | PASS |

Scanner-family strategies now dispatch to strategy-specific native-signal rules. Missing signal bundles fail closed instead of falling back to the canonical candle proxy.

## 3. Holdout trade counts (reported before conclusions)

| Dataset | Strategy | Trades | Net | Win % | PF | Max DD | Sample |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BTC_1H | crypto-multi-alpha-ls-v1 | 236 | -8.61% | 37.3 | 0.8452 | 12.17% | meaningful |
| BTC_1H | adaptive-long-short-trend-portfolio-v1 | 168 | +2.21% | 37.5 | 1.0527 | 12.02% | meaningful |
| BTC_1H | funding-basis-carry-v1 | 64 | +0.86% | 46.9 | 1.063 | 4.94% | meaningful |
| BTC_1H | opening-range-vwap-rvol-breakout-v1 | 330 | -3.67% | 37.3 | 0.9524 | 8.60% | meaningful |
| BTC_1H | volatility-squeeze-trend-volume-expansion-v1 | 198 | -10.49% | 32.8 | 0.697 | 11.81% | meaningful |
| BTC_1H | multi-timeframe-vwap-pullback-reacceleration-v1 | 180 | -3.12% | 39.4 | 0.9069 | 5.97% | meaningful |
| BTC_1H | liquidity-sweep-fvg-reversal-v1 | 86 | -11.77% | 23.3 | 0.4495 | 12.14% | meaningful |
| BTC_1H | whale-flow-sentiment-reversal-v1 | 42 | -6.50% | 31.0 | 0.5313 | 6.50% | meaningful |
| BTC_1H | news-sentiment-momentum-breakout-v1 | 19 | +1.33% | 36.8 | 1.3485 | 1.26% | too small |
| BTC_1H | regime-routed-ai-ensemble-v1 | 185 | +6.98% | 40.0 | 1.1841 | 4.87% | meaningful |
| BTC_4H | crypto-multi-alpha-ls-v1 | 102 | -11.22% | 34.3 | 0.6808 | 12.18% | meaningful |
| BTC_4H | adaptive-long-short-trend-portfolio-v1 | 34 | -1.15% | 44.1 | 0.9139 | 4.86% | meaningful |
| BTC_4H | funding-basis-carry-v1 | 13 | +0.92% | 53.8 | 1.2621 | 1.56% | too small |
| BTC_4H | volatility-squeeze-trend-volume-expansion-v1 | 32 | +3.28% | 46.9 | 1.429 | 2.29% | meaningful |
| BTC_4H | whale-flow-sentiment-reversal-v1 | 9 | +1.85% | 44.4 | 2.1003 | 1.63% | too small |
| BTC_4H | regime-routed-ai-ensemble-v1 | 28 | -0.77% | 39.3 | 0.9161 | 2.28% | too small |
| ETH_1H | crypto-multi-alpha-ls-v1 | 201 | -6.59% | 39.8 | 0.8848 | 12.13% | meaningful |
| ETH_1H | adaptive-long-short-trend-portfolio-v1 | 168 | +2.21% | 37.5 | 1.0527 | 12.02% | meaningful |
| ETH_1H | funding-basis-carry-v1 | 77 | -1.18% | 45.5 | 0.9526 | 4.15% | meaningful |
| ETH_1H | opening-range-vwap-rvol-breakout-v1 | 235 | -7.68% | 35.3 | 0.876 | 12.19% | meaningful |
| ETH_1H | volatility-squeeze-trend-volume-expansion-v1 | 147 | -10.62% | 29.9 | 0.7096 | 12.22% | meaningful |
| ETH_1H | multi-timeframe-vwap-pullback-reacceleration-v1 | 171 | -8.47% | 33.9 | 0.8025 | 10.94% | meaningful |
| ETH_1H | liquidity-sweep-fvg-reversal-v1 | 79 | -11.45% | 25.3 | 0.4809 | 12.05% | meaningful |
| ETH_1H | whale-flow-sentiment-reversal-v1 | 51 | -9.31% | 31.4 | 0.4865 | 10.31% | meaningful |
| ETH_1H | news-sentiment-momentum-breakout-v1 | 18 | -2.62% | 27.8 | 0.5709 | 3.83% | too small |
| ETH_1H | regime-routed-ai-ensemble-v1 | 165 | -6.80% | 33.3 | 0.8569 | 12.20% | meaningful |

The pre-registered sample gate is 30 completed holdout trades. Rows below that threshold are descriptive only.

## 4. Risk controls and adaptive-trend re-run

| Dataset | Legacy full-exposure DD | Governed DD | Exposure cap | Hard shutdown DD |
| --- | --- | --- | --- | --- |
| BTC_1H | 33.35% | 12.02% | 0.35 | 12 |
| BTC_4H | 16.67% | 4.86% | 0.35 | 12 |
| ETH_1H | 33.35% | 12.02% | 0.35 | 12 |

The portfolio governor risks at most 0.75% per trade, caps gross exposure at 35%, throttles at 8% drawdown, and stops new entries at 12%. The legacy figure reconstructs the same holdout trade outcomes at unscaled exposure; the governed figure is the actual new result.

## 5. Browser / pixel QA

Browser/pixel QA did not run; promotion remains blocked.

Evidence: `QA/profitability-structural-remediation/browser/pixel-qa.json`.

## 6. Fresh promotion gate

Holdout seal: `e656624eca550227175d7d58a3fdbfe601994258f2f87a9a42406d55e9ea328e`. No optimizer was run (count: 0); registry defaults were frozen.

| Dataset | Strategy | Sample | Return | PF | DD | 2× cost | Full semantics | Distinct | Browser | Decision |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| BTC_1H | crypto-multi-alpha-ls-v1 | P | F | F | P | F | F | P | F | REJECT |
| BTC_1H | adaptive-long-short-trend-portfolio-v1 | P | P | P | P | F | F | n/a | F | REJECT |
| BTC_1H | funding-basis-carry-v1 | P | P | P | P | F | F | P | F | REJECT |
| BTC_1H | opening-range-vwap-rvol-breakout-v1 | P | F | F | P | F | F | n/a | F | REJECT |
| BTC_1H | volatility-squeeze-trend-volume-expansion-v1 | P | F | F | P | F | F | n/a | F | REJECT |
| BTC_1H | multi-timeframe-vwap-pullback-reacceleration-v1 | P | F | F | P | F | F | n/a | F | REJECT |
| BTC_1H | liquidity-sweep-fvg-reversal-v1 | P | F | F | P | F | F | P | F | REJECT |
| BTC_1H | whale-flow-sentiment-reversal-v1 | P | F | F | P | F | F | P | F | REJECT |
| BTC_1H | news-sentiment-momentum-breakout-v1 | F | P | P | P | P | F | P | F | REJECT |
| BTC_1H | regime-routed-ai-ensemble-v1 | P | P | P | P | F | F | n/a | F | REJECT |
| BTC_4H | crypto-multi-alpha-ls-v1 | P | F | F | P | F | F | F | F | REJECT |
| BTC_4H | adaptive-long-short-trend-portfolio-v1 | P | F | F | P | F | F | n/a | F | REJECT |
| BTC_4H | funding-basis-carry-v1 | F | P | P | P | P | F | F | F | REJECT |
| BTC_4H | volatility-squeeze-trend-volume-expansion-v1 | P | P | P | P | P | F | n/a | F | REJECT |
| BTC_4H | whale-flow-sentiment-reversal-v1 | F | P | P | P | P | F | F | F | REJECT |
| BTC_4H | regime-routed-ai-ensemble-v1 | F | F | F | P | F | F | n/a | F | REJECT |
| ETH_1H | crypto-multi-alpha-ls-v1 | P | F | F | P | F | F | P | F | REJECT |
| ETH_1H | adaptive-long-short-trend-portfolio-v1 | P | P | P | P | F | F | n/a | F | REJECT |
| ETH_1H | funding-basis-carry-v1 | P | F | F | P | F | F | P | F | REJECT |
| ETH_1H | opening-range-vwap-rvol-breakout-v1 | P | F | F | P | F | F | n/a | F | REJECT |
| ETH_1H | volatility-squeeze-trend-volume-expansion-v1 | P | F | F | P | F | F | n/a | F | REJECT |
| ETH_1H | multi-timeframe-vwap-pullback-reacceleration-v1 | P | F | F | P | F | F | n/a | F | REJECT |
| ETH_1H | liquidity-sweep-fvg-reversal-v1 | P | F | F | P | F | F | P | F | REJECT |
| ETH_1H | whale-flow-sentiment-reversal-v1 | P | F | F | P | F | F | P | F | REJECT |
| ETH_1H | news-sentiment-momentum-breakout-v1 | F | F | F | P | F | F | P | F | REJECT |
| ETH_1H | regime-routed-ai-ensemble-v1 | P | F | F | P | F | F | n/a | F | REJECT |

Strategies with unavailable semantic prerequisites fail the full-strategy gate even if a price replay is positive.

## Native development metrics

| Dataset | Strategy | Trades | Net | Win % | PF | Max DD |
| --- | --- | --- | --- | --- | --- | --- |
| BTC_1H | crypto-multi-alpha-ls-v1 | 244 | -8.69% | 36.9 | 0.8678 | 12.20% |
| BTC_1H | adaptive-long-short-trend-portfolio-v1 | 270 | -2.68% | 35.6 | 0.9731 | 11.65% |
| BTC_1H | funding-basis-carry-v1 | 19 | -2.02% | 31.6 | 0.564 | 3.29% |
| BTC_1H | opening-range-vwap-rvol-breakout-v1 | 103 | -10.74% | 30.1 | 0.6261 | 12.18% |
| BTC_1H | volatility-squeeze-trend-volume-expansion-v1 | 190 | -8.53% | 32.1 | 0.7545 | 9.89% |
| BTC_1H | multi-timeframe-vwap-pullback-reacceleration-v1 | 173 | -5.02% | 38.2 | 0.8586 | 9.24% |
| BTC_1H | liquidity-sweep-fvg-reversal-v1 | 89 | -2.05% | 38.2 | 0.865 | 6.09% |
| BTC_1H | whale-flow-sentiment-reversal-v1 | 32 | -6.80% | 21.9 | 0.4695 | 7.18% |
| BTC_1H | news-sentiment-momentum-breakout-v1 | 19 | +3.06% | 52.6 | 1.8079 | 1.39% |
| BTC_1H | regime-routed-ai-ensemble-v1 | 75 | -12.09% | 21.3 | 0.4821 | 12.09% |
| BTC_4H | crypto-multi-alpha-ls-v1 | 75 | -5.64% | 40.0 | 0.7992 | 9.89% |
| BTC_4H | adaptive-long-short-trend-portfolio-v1 | 74 | -3.88% | 35.1 | 0.8651 | 10.22% |
| BTC_4H | funding-basis-carry-v1 | 0 | +0.00% | 0.0 | 0 | 0.00% |
| BTC_4H | volatility-squeeze-trend-volume-expansion-v1 | 49 | +10.19% | 46.9 | 1.559 | 2.43% |
| BTC_4H | whale-flow-sentiment-reversal-v1 | 34 | +0.16% | 41.2 | 1.023 | 3.30% |
| BTC_4H | regime-routed-ai-ensemble-v1 | 51 | -4.63% | 33.3 | 0.8103 | 8.28% |
| ETH_1H | crypto-multi-alpha-ls-v1 | 67 | -6.53% | 31.3 | 0.7636 | 12.13% |
| ETH_1H | adaptive-long-short-trend-portfolio-v1 | 270 | -2.68% | 35.6 | 0.9731 | 11.65% |
| ETH_1H | funding-basis-carry-v1 | 21 | -1.54% | 38.1 | 0.7495 | 2.80% |
| ETH_1H | opening-range-vwap-rvol-breakout-v1 | 266 | -11.36% | 33.1 | 0.8561 | 12.04% |
| ETH_1H | volatility-squeeze-trend-volume-expansion-v1 | 204 | +6.30% | 38.2 | 1.1481 | 7.57% |
| ETH_1H | multi-timeframe-vwap-pullback-reacceleration-v1 | 170 | -5.66% | 35.9 | 0.8673 | 7.14% |
| ETH_1H | liquidity-sweep-fvg-reversal-v1 | 66 | -0.79% | 39.4 | 0.9373 | 3.10% |
| ETH_1H | whale-flow-sentiment-reversal-v1 | 40 | -6.76% | 35.0 | 0.5712 | 9.41% |
| ETH_1H | news-sentiment-momentum-breakout-v1 | 16 | +3.91% | 56.3 | 2.0258 | 1.91% |
| ETH_1H | regime-routed-ai-ensemble-v1 | 200 | -9.46% | 31.5 | 0.8154 | 11.02% |

## Cost-stress holdout results

| Dataset | Strategy | Trades | Net | PF | Max DD | Gate |
| --- | --- | --- | --- | --- | --- | --- |
| BTC_1H | crypto-multi-alpha-ls-v1 | 133 | -10.41% | 0.7048 | 12.03% | FAIL |
| BTC_1H | adaptive-long-short-trend-portfolio-v1 | 165 | -3.54% | 0.9372 | 12.35% | FAIL |
| BTC_1H | funding-basis-carry-v1 | 64 | -2.13% | 0.8739 | 5.79% | FAIL |
| BTC_1H | opening-range-vwap-rvol-breakout-v1 | 190 | -11.34% | 0.7542 | 12.16% | FAIL |
| BTC_1H | volatility-squeeze-trend-volume-expansion-v1 | 120 | -11.02% | 0.5735 | 12.17% | FAIL |
| BTC_1H | multi-timeframe-vwap-pullback-reacceleration-v1 | 149 | -12.16% | 0.615 | 12.16% | FAIL |
| BTC_1H | liquidity-sweep-fvg-reversal-v1 | 72 | -11.70% | 0.4156 | 12.03% | FAIL |
| BTC_1H | whale-flow-sentiment-reversal-v1 | 42 | -8.41% | 0.4407 | 8.41% | FAIL |
| BTC_1H | news-sentiment-momentum-breakout-v1 | 19 | +0.47% | 1.1125 | 1.40% | PASS |
| BTC_1H | regime-routed-ai-ensemble-v1 | 185 | -1.98% | 0.9602 | 8.37% | FAIL |
| BTC_4H | crypto-multi-alpha-ls-v1 | 71 | -12.18% | 0.5862 | 12.18% | FAIL |
| BTC_4H | adaptive-long-short-trend-portfolio-v1 | 34 | -2.62% | 0.8054 | 5.75% | FAIL |
| BTC_4H | funding-basis-carry-v1 | 13 | +0.36% | 1.0997 | 1.63% | PASS |
| BTC_4H | volatility-squeeze-trend-volume-expansion-v1 | 32 | +1.79% | 1.2172 | 2.67% | PASS |
| BTC_4H | whale-flow-sentiment-reversal-v1 | 9 | +1.44% | 1.7657 | 1.81% | PASS |
| BTC_4H | regime-routed-ai-ensemble-v1 | 28 | -2.01% | 0.7875 | 2.78% | FAIL |
| ETH_1H | crypto-multi-alpha-ls-v1 | 155 | -8.90% | 0.8044 | 12.35% | FAIL |
| ETH_1H | adaptive-long-short-trend-portfolio-v1 | 165 | -3.54% | 0.9372 | 12.35% | FAIL |
| ETH_1H | funding-basis-carry-v1 | 77 | -4.67% | 0.8079 | 6.46% | FAIL |
| ETH_1H | opening-range-vwap-rvol-breakout-v1 | 152 | -8.86% | 0.7886 | 12.08% | FAIL |
| ETH_1H | volatility-squeeze-trend-volume-expansion-v1 | 90 | -10.69% | 0.5731 | 12.03% | FAIL |
| ETH_1H | multi-timeframe-vwap-pullback-reacceleration-v1 | 121 | -12.35% | 0.616 | 12.39% | FAIL |
| ETH_1H | liquidity-sweep-fvg-reversal-v1 | 63 | -11.48% | 0.4132 | 12.00% | FAIL |
| ETH_1H | whale-flow-sentiment-reversal-v1 | 51 | -9.73% | 0.4575 | 10.62% | FAIL |
| ETH_1H | news-sentiment-momentum-breakout-v1 | 18 | -3.40% | 0.487 | 4.48% | FAIL |
| ETH_1H | regime-routed-ai-ensemble-v1 | 152 | -9.47% | 0.7902 | 12.19% | FAIL |

## Iteration log

| Iteration | Structural change | Evidence | Parameter tuning |
| --- | --- | --- | --- |
| 1 | Added immutable, timestamp-aligned series envelopes and upstream-page hashes. | Data manifest and loader hash verification. | None |
| 2 | Replaced shared scanner replay for five scanner-family strategies with native-signal adapters. | Distinct trade-sequence hashes above. | None |
| 3 | Expanded and sealed calendar holdouts: BTC/ETH 1h use 2024–2025; BTC 4h uses 2023. | Holdout seal and trade counts above. | None |
| 4 | Added portfolio risk sizing, exposure cap, drawdown throttle, and shutdown. | Adaptive before/after drawdown table. | None |
| 5 | Installed and hash-verified Chromium through an official alternate channel; launch remained blocked by the runner before pixel execution. | Browser blocker evidence artifact; status NOT_RUN. | None |
| 6 | Evaluated promotion once against the sealed identities. | Promotion matrix; no second pass or retuning. | None |

## Interpretation constraints

- Funding carry remains a directional diagnostic because basis and historical spread are missing; it is not a delta-neutral carry P&L claim.
- Binance top-trader/taker ratios are real exchange observations but only a whale-flow proxy.
- Google News RSS is a historical headline index, not a complete newswire, and Alternative.me sentiment is market-wide daily data.
- Positive historical returns, where present, are not proof of future profitability.
