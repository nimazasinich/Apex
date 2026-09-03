# APEX Next Agent Rules (Canonical HF + Provider Safety)

1. Do not treat HTTP 200 as valid data. Validate success envelope, usable rows, freshness and provenance.
2. HF Space-2 is historical/archive/multi-source. HF Space-4 is live/fallback intelligence. They are adapters, not truth replacement.
3. Canonical HF routes are required. Do not add random route guesses.
4. Binance and KuCoin are primary market adapters. Secondary providers cannot override execution market truth.
5. Never fabricate funding, open interest, whale flow, news or coverage data.
6. NewsData, NewsAPI.org and RSS are different providers with separate credentials and schemas.
7. CORS relays are not network proxies. Only use real HTTP CONNECT/SOCKS transports as proxy providers.
8. Preserve provenance on every accepted payload.
9. Keep Binance optional gating. A Binance timeout must not kill healthy HF/KuCoin data.
10. Run typecheck, tests and build before delivery. Report real output.
