# Suggested Commands

Shell: Windows PowerShell (executed via Desktop Commander). Use canonical package.json scripts directly; do NOT create wrapper/orchestration scripts or curated gate subsets.

## Dev / build
- `npm run dev` — vite dev + function index
- `npm run build` — full build + bundle server → dist/server.cjs
- `npm run start` — node dist/server.cjs
- `npm run lint` — tsc --noEmit (typecheck)

## Canonical gates (full pipeline: `mem:task_completion`)
- `npm run test:unit` — vitest run
- `npm run test:runtime` — qa:strategy-* + runtime QA chain (scripts/qa/run*.mjs)
- `npm run check:source-contracts` — long source/contract QA chain (ends with check:root-contract, check:api-contract, check:build-identity)
- `npm run test:browser` — = qa:workspace-runtime (Playwright)
- `npm run test:visual` — = qa:ui-1368
- `npm run verify:visual` — = qa:ui-1368 && qa:workspace-runtime

## Identity / release
- `npm run check:version-identity`, `npm run check:build-identity`
- `npm run verify` — full aggregate gate
- `npm run release:package` — verify + createReleaseArchive.mts + release:verify-artifacts

## Windows shell util differences (vs unix)
- List dir: `dir` / `Get-ChildItem`; grep-equivalent: `Select-String`; env var: `$env:NAME` (not `$NAME`).
- Serena reference check: `serena memories check` from project root.
