# Conventions

- Components: React function components as named exports (e.g. `export function OverviewKpiStrip(...)`); some declared as typed const (e.g. `const NavBar`). Props typed via a sibling `XxxProps` interface in the same file.
- Layout: feature pages under `src/pages/<feature>/`; cross-cutting workspace views under `src/components/workspace/`; shared widgets in `src/components/`; overview panels in `src/components/overview/`.
- CSS: co-located per-page/per-component stylesheets (StrategyPage.css, OverviewWorkspace.css, MarketsPage.css, ...). Global class prefix `apex-` (e.g. `.apex-sidebar`, `.apex-nav`). Design tokens enforced by qa:design-tokens.
- Scripts: ESM only, under scripts/{gates,qa,utilities,capture,windows}; `.mts` run via tsx, `.mjs` via node.
- Contracts: source/API contracts in src/contracts + openapi/, enforced by check:source-contracts / check:api-contract / check:root-contract. Keep gate assertion/contract strings verbatim — many gates match exact substrings.
- Generated artifacts: Doc/FUNCTION_INDEX.* and Doc/repository/FILE_INDEX.* are generated (index:functions / repo:audit) — do not hand-edit.
