# APEX v2.0 — Autonomous Intelligence Terminal

APEX is a crypto-market research, screening, strategy-validation, backtesting, and guarded execution workspace.

**Agent code cartography:** before reasoning about where code lives or whether it is used, run `npm run index:app` and query `APP_INDEX/APP_MAP.json` / `APP_INDEX/app-index.sqlite` with `npm run index:app:file -- <repo-relative-path>`; the canonical Function Atlas remains in `Doc/FUNCTION_INDEX.json`, and **an import does not imply liveness** unless the file is transitively reachable from a valid root. The App Index resolver is config-aware (TypeScript paths, Vite aliases, package imports, case diagnostics, Vite globs and dynamic-template imports); fuzzy matches are evidence only, and unresolved dynamic imports must be reviewed before trusting dead-code classification.

Version 2.0 consolidates the automatic lifecycle into one server-owned **AUTO RESEARCH / MANUAL** control. Automatic research is **off by default**. An explicit START only arms the bounded five-minute scheduler; the first cycle runs on the interval rather than immediately. It remains research/paper-only: it cannot authorize or submit a live exchange order.

The canonical scanner now distinguishes `SIGNAL`, `QUALIFIED_SETUP`, `WATCH`, `ABSTAIN`, and `REJECTED`. A candidate is called a signal only when live evidence, empirical probability calibration, valid entry/stop/target geometry, and positive expected edge after observable costs are all present. Missing evidence fails closed.

## App Index / Code Cartography

`APP_INDEX/` is the canonical repository map for agents and maintainers. It records the complete folder tree, architecture layer, Function Atlas symbols, direct/reverse dependencies, external packages, production/test/source-contract reachability proofs, dead islands, cycles, and SQLite history for file identities and moves. It also records LOC, parse diagnostics, AST declarations, imported symbol names and advisory unused-export candidates (`npm run index:app:unused-exports`); those export candidates are evidence only, never automatic deletion authority. Use `npm run index:app:dead` instead of assuming that an imported file is live; a disconnected island of files can import each other and still be dead. The lineage engine is regression-tested with `npm run qa:app-index-lineage`; probable rename history is advisory and unrelated add/delete pairs must never be fabricated into moves. See `APP_INDEX/README.md`.

## Run locally

```bash
npm ci
npm run dev
```

Manual mode is the default. `APEX_AUTOPILOT_SCHEDULER=false` can still be set explicitly when you want the environment to state that policy rather than relying on the default.

## Research Agent

The optional research orchestrator is integrated under `scripts/research-agent/`. It runs development-only study queues, records exact study hashes, and keeps sealed-holdout access behind a one-shot interactive approval gate bound to the exact code that produced the development evidence.

```bash
npm run research:queue -- --dry-run
npm run research:summary
npm run qa:research-agent
```

See `scripts/research-agent/README.md` for the promotion-ledger and sealed-holdout workflow.

## Verify

```bash
npm run lint
npm run test
npm run build
```

See `Doc/APEX_V2_AUTONOMOUS_INTELLIGENCE_UPGRADE.md` for the architecture, decision philosophy, and verification scope.
