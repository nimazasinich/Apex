# APEX Core 10 Dynamic-Fusion Strategy Portfolio

## Status and scope

This document describes the fixed ten-strategy research portfolio implemented in `src/services/strategyRegistry.ts`. It does not certify profitability, production readiness, or suitability for live funds. Every strategy remains subject to chronological validation, untouched holdout, cost stress, neighbor stability, risk-governor approval, and rollback.

The portfolio is fixed at ten core identities so evidence remains comparable over time. Parameters and bounded component weights may evolve; strategy identity, data requirements, hard no-trade rules, and risk ownership do not silently change.

## Shared ten-layer fusion contract

Every core strategy declares the same ten evidence layers:

1. Technical structure
2. Smart-money structure
3. Order flow / short-horizon scalp layer
4. Liquidity quality
5. Funding and crowding
6. Open-interest state
7. Sentiment
8. News event context
9. Whale exchange flow
10. Market regime

Layers are classified as native historical, candle-derived proxy, or live-only. Missing live-only data is disclosed and can make a strategy incomplete. A missing layer is never replaced with a neutral value and described as verified.

The term “scramble strategy” did not resolve to a stable trading-method definition during research. APEX therefore uses the narrower, auditable interpretation “short-horizon scalping/order-flow layer,” while keeping true L2-dependent scalping blocked until historical L2 snapshots and execution calibration exist.

## Core portfolio

| Rank | Strategy ID | Primary edge hypothesis | Current engine |
| ---: | --- | --- | --- |
| 1 | `crypto-multi-alpha-ls-v1` | Diversified multi-alpha evidence agreement | Scanner preset |
| 2 | `adaptive-long-short-trend-portfolio-v1` | Cross-asset trend and regime rotation | Bespoke |
| 3 | `funding-basis-carry-v1` | Funding/basis carry with crowding and liquidity filters | Scanner preset |
| 4 | `opening-range-vwap-rvol-breakout-v1` | Session/event breakout with VWAP and participation | Bespoke |
| 5 | `volatility-squeeze-trend-volume-expansion-v1` | Compression-to-expansion with trend and participation | Bespoke |
| 6 | `multi-timeframe-vwap-pullback-reacceleration-v1` | Trend pullback and volume reacceleration | Bespoke |
| 7 | `liquidity-sweep-fvg-reversal-v1` | Liquidity sweep, displacement and FVG-style reversal | Scanner preset |
| 8 | `whale-flow-sentiment-reversal-v1` | Exchange whale flow and sentiment exhaustion | Scanner preset |
| 9 | `news-sentiment-momentum-breakout-v1` | Event momentum with news/sentiment and price confirmation | Scanner preset |
| 10 | `regime-routed-ai-ensemble-v1` | Causal routing among deterministic child agents | Bespoke |

## Manual control versus automatic evolution

Manual controls are registry-bounded. User settings can adjust eligible thresholds, child-agent preferences, scanner weights, and live-layer fusion weights. Values are clamped to the strategy definition.

Automatic optimization may tune only parameters marked `optimization: enabled`. News, sentiment and whale-flow weights remain `manual-only` until APEX persists timestamp-aligned historical snapshots. This prevents current alternative data from leaking into historical optimization.

Automatic promotion remains exact-context:

`strategy + symbol + interval + direction`

A profile is promoted only after the existing optimizer passes untouched holdout, cost stress, drawdown/sample gates, and neighbor stability. Rollback remains revisioned and immutable.

## Causal regime router

The tenth strategy selects a deterministic child agent in blocks. Each route decision uses only candles closed before the block starts. It may select trend, squeeze, breakout, pullback, or abstain. It cannot invent a trade outside the selected child’s rules and cannot bypass the canonical risk governor.

## External research basis

The design uses external material as hypothesis input, not as proof of profit:

- Whale/on-chain activity can contain information about volatility and market stress.
- Funding, open interest and valuation/on-chain variables can have regime-dependent predictive content.
- Crypto market microstructure and liquidity state can influence short-horizon behavior.
- Multisource models can combine price, derivatives and textual sentiment, but require strict temporal alignment.
- Practitioner Smart Money Concepts commonly combine liquidity sweeps, structure changes, order blocks and fair-value gaps; APEX converts only auditable subsets into deterministic rules.

Personal trader pages and community posts were used only to discover combinations worth formalizing. Their screenshots, win rates and short-period return claims are not imported as strategy evidence.

## Explicit exclusions

- No guaranteed “fast profit” or perfect strategy claim.
- No automatic live order placement from Strategy Studio.
- No historical news/sentiment/whale optimization without stored event-time snapshots.
- No candle proxy presented as true L2 order flow.
- No market-making or cross-exchange strategy promoted without fill, latency and inventory simulation.
- No unclassified whale transfer assigned bullish or bearish direction.

## Research-reference map

| ID | Research input | Use inside APEX |
| --- | --- | --- |
| CORE-R1 | Whale/on-chain transaction research | Volatility/stress hypothesis; not a direct buy/sell rule |
| CORE-R2 | Exchange whale-ratio and classified flow definitions | Deposit/withdrawal risk context with provenance |
| CORE-R3 | Crypto microstructure and liquidity research | Liquidity and short-horizon order-flow layers |
| CORE-R4 | Regime-dependent Bitcoin predictability using funding, OI and on-chain variables | Derivatives/regime feature hypotheses |
| CORE-R5 | Momentum/trend evidence summarized in crypto strategy surveys | Cross-asset trend portfolio |
| CORE-R6 | Perpetual funding and basis behavior | Cost-aware carry candidate |
| CORE-R7 | Practitioner SMC combinations: sweep, structure change, order block and FVG | Deterministic SMC hypothesis only; practitioner claims are not evidence |
| CORE-R8 | Multisource price/derivatives/text fusion | Shared fusion architecture |
| CORE-R9 | News-conditioned trading research | Event-aware strategy hypothesis |
| CORE-R10 | On-chain plus social/news sentiment modeling | Alternative-data candidate features |
| CORE-R11 | L2 liquidity-state transition research | Causal regime routing and the blocked true-L2 scalper |
