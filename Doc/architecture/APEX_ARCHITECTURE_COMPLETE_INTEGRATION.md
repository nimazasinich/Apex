# APEX v1.0.56 — Complete Architecture Artifact Integration

The submitted `APEX_v1_0_56_ARCHITECTURE_COMPLETE.html` has been incorporated into the canonical APEX documentation surface.

## Canonical locations

- `Doc/generated/APEX_COMPLETE_VISUAL_PROJECT_DOCUMENTATION.html` — canonical interactive architecture page with the integrated **Deep Audit** tab.
- `Doc/architecture/APEX_v1.0.56_COMPLETE_VISUAL_INTERACTIVE_DOCUMENT.html` — versioned copy of the canonical visual page.
- `Doc/architecture/APEX_v1.0.56_ARCHITECTURE_COMPLETE_SUBMITTED.html` — the submitted complete architecture artifact preserved for audit provenance.
- `Doc/architecture/APEX_SYSTEM_LAYERS.md` — textual architecture and implementation-status contract.

## Reconciliation rule

The submitted page contains useful diagrams and historical audit findings, but not every historical finding still matches the current source tree. The canonical page therefore preserves the submitted artifact while adding a current-source reconciliation layer.

### Findings that are closed or no longer supported by current source

- The old claim that the live scanner is an RSI/MACD engine while backtesting uses OBI/QStruct is superseded: current `scannerCore.ts` directly evaluates OBI, volume and QStruct and imports Smart Money context.
- The claimed `Math.min` threshold override is not present in the inspected scanner path; the current `Math.min` clamps confidence to 0.99.
- `replay_proxy` provenance is exposed by `BacktestDataQualityPanel.tsx`.
- Hardcoded Sharpe/win-rate/drawdown metrics were not found in current `strategyRegistry.ts`.
- `smartMoneyContextEngine.ts` is not orphaned; it has live importers.
- No obvious top-level Backtesting TSX component orphan was found in the current page composition.

### Findings that remain runtime/deployment verification items

- Shadow-ML training/model availability.
- Decision-memory external durability restore state.
- Operator/configured supplemental keys and Telegram credentials.
- Operator security token state.
- Production connectivity of Bybit/Deribit/HyperLiquid feeds.
- Fresh dependency-complete TypeScript/Vitest/build verification.

### Intentional or architectural conditions

- Autonomous live execution from Smart Autopilot remains intentionally blocked.
- APEX remains a single-process modular monolith with flat-file JSON persistence.
- HMR and CDN/provider reachability are environment/configuration concerns, not missing core code paths.

## Current route/contract numbers

- Statically registered HTTP operations: **129**
- OpenAPI-described operations: **27**

The old `150+` route estimate is retained only inside the submitted artifact for provenance; it is not the canonical current count.
