# APEX V31 UI + Governor Refinement 1.0.32

## Scope
- Refined reference-style metric cards to look closer to the supplied APEX screenshots.
- Strengthened Help page search affordance and secondary visual polish.
- Hardened the outbound market-data governor to reduce queue saturation, queue timeouts, and full-queue failures under bursty workloads.

## Frontend
- Updated `src/pages/referenceUi.tsx` and `src/styles/reference-ui.css`.
- Metric cards now use cleaner accents, better depth, restrained background treatment, and a dedicated sparkline slot.
- Analytics second-row cards were upsized slightly to avoid the toy-like dense appearance.
- Help search now exposes a keyboard affordance for a more product-like feel.

## Backend / Integration
- Updated `src/services/proxyFetch.ts`.
- New defaults:
  - `PROXY_MAX_CONCURRENCY`: 8
  - `PROXY_QUEUE_TIMEOUT_MS`: 30000
  - `PROXY_MAX_QUEUE`: 120
  - slightly longer short-TTL caches for ticker/depth/klines/premium/default endpoints
  - faster direct-route fail-fast timeout: 7000 ms
- Added stale-cache fallback for retryable transport/queue failures so the UI can continue rendering recently verified data instead of collapsing to empty/error states during temporary upstream congestion.

## Notes
- Environment variables still override all new defaults.
- No fake market data is introduced: stale-cache fallback only reuses previously successful responses inside a short grace window.
