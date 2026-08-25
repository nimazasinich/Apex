# APEX Unified Terminal — Core (graph root)

## Purpose
Desktop crypto trading terminal: APEX-NEXT UI + APEX Trading Engine backend, unified into one app. React SPA served by an embedded Express server. Current release target: v1.0.68, native Windows.

## Top-level source map
- `src/` — frontend SPA (details: `mem:frontend/core`)
- `server.ts` — Express server entry; bundled to `dist/server.cjs` by build
- `scripts/` — ESM build/gate/qa/utility scripts (`.mts` via tsx, `.mjs` via node); subdirs gates/qa/utilities/capture/windows
- `src/contracts/`, `openapi/` — source/API contracts enforced by gates
- `QA/`, `tests/`, `src/tests/` — verification harnesses & tests
- `Doc/` — generated indexes (FUNCTION_INDEX, FILE_INDEX) + handoff docs (CLAUDE.md @-includes them)
- `public/`, `dist/`, `_release/` — static assets, build output, release archives

## Project-wide invariants
- Version 1.0.68; `package.json` version + `VERSION` + build identity kept in sync (identity gates).
- Node >=22 <25, npm >=10.9 <12, packageManager npm@10.9.2.
- Canonical QA viewport: 1368×753.
- Execution is Windows-only; strict tool division and hard prohibitions apply: `mem:execution_environment`.

## Memory graph
- Languages, frameworks, key deps, version pins: `mem:tech_stack`
- Frontend architecture + the three entry points (Overview, Strategy Studio, App Shell) + key dirs: `mem:frontend/core`
- Commands the user actually runs + Windows shell util differences: `mem:suggested_commands`
- Canonical verify/gate pipeline that defines "done" + failure workflow, plus the `verify:fast` dev-loop runner and why it is not release evidence: `mem:task_completion`
- Code style, file layout, naming, contract-string conventions: `mem:conventions`
- Windows-only run requirement, DC/Playwright/Serena tool division, prohibitions, viewport, fixed-port co-tenant traps, and Serena tool-usage rules (activate-project first, recursive globs, symbolic-tools-first): `mem:execution_environment`
- Standing strategy-profitability program — shadow-only/one-shot-holdout invariants, the phase order from diagnosis to Paper Canary, and the dated per-strategy classification scoreboard. Read before touching any strategy, backtesting, or promotion-gate code: `mem:strategy/profitability_roadmap`
