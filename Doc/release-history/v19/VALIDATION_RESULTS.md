# V19 Validation Results

Validation date: 2026-08-03

| Check | Result |
|---|---|
| V19 project contract | 10/10 passed |
| TypeScript parser/transpile | 145/145 TS, TSX and MTS files passed |
| CSS parser | 0 errors across 4,054 top-level tokens |
| `package.json` | Valid JSON |
| `package-lock.json` | Valid JSON |
| Sensitive machine-local files | Excluded from delivery |
| Stale production `dist/` | Excluded; must be rebuilt from V19 source |

## Commands executed

```bash
npm run qa:v19-contract
```

The dependency-backed commands below were not executed in the delivery container because the available registry did not provide every package pinned by the existing lockfile:

```bash
npm ci
npm run build
npm run test
npm run qa:capture:1368
```

Run those commands on the target machine before replacing the production build.
