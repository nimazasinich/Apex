# V19 File Organization

## Source retained at project root

The final ZIP keeps only launch and package-management files at the root:

- `.env.example`
- `.external-api-sources.config.example.json`
- `.gitignore`
- `README.md`
- `index.html`
- `package.json`
- `package-lock.json`
- `server.ts`
- `tsconfig.json`
- `vite.config.ts`

## Organized content

- Product and backend documentation: `Doc/`
- Release-specific evidence: `Doc/release-history/v19/`
- Current pre-fix screenshot: `Doc/release-history/v19/reference/current-overview-before-v19.png`
- Historical UI note previously under `_deliverables/`: `Doc/reports/historical/ui-evolution/SMOOTH_PASS_3_NOTES.md`
- Browser capture tools: `scripts/capture/`
- Contract and browser QA: `scripts/qa/`
- Cross-platform utilities: `scripts/utilities/`

## Excluded from the delivery ZIP

The following machine-local or stale artifacts are intentionally excluded:

- `.env`
- `.env.txt`
- `.external-api-sources.config.json`
- `.agent-index/`
- `dist/`

`dist/` is removed because it was built before the V19 source changes and would not represent this delivery. Recreate it using `npm ci` followed by `npm run build`.
