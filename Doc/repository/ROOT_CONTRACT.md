# Root Contract

**Effective:** 2026-08-13 (APEX v1.0.58 remediation)

This contract classifies the repository root by **source ownership**, **generated/runtime state**, and **release inclusion**. A path may be legitimate in a working checkout without belonging in the clean source artifact.

## Canonical source / build inputs

| Path | Purpose | Clean source artifact |
|---|---|---|
| `README.txt` | Root pointer to canonical documentation under `Doc/` | Yes |
| `README.md` | Landing page rendered by GitHub for the published repository. Distinct from `README.txt`, which remains the in-artifact documentation pointer. | Yes |
| `CLAUDE.md` | Root agent instruction file; imports the handoff/tooling notes under `Doc/` | Yes |
| `VERSION` | Human-readable application version identity | Yes |
| `RUN-APEX.bat` | Canonical Windows install/build/start launcher | Yes |
| `package.json` / `package-lock.json` | npm manifest and lockfile | Yes |
| `.nvmrc` / `.node-version` | Supported Node version hints | Yes |
| `index.html` | Vite HTML entry | Yes |
| `server.ts` | Express + Vite server composition entry | Yes |
| `tsconfig.json` / `tsconfig.ui02.json` / `vite.config.ts` | TypeScript and Vite configuration | Yes |
| `.gitignore` / `.env.example` | Ignore policy and non-secret environment template | Yes |
| `.external-api-sources.config.example.json` | Non-secret provider configuration template | Yes |
| `src/` | Application source | Yes |
| `public/` | Static source assets | Yes |
| `scripts/` | Build, QA, gates, capture and maintenance automation | Yes |
| `tests/` | Integration tests | Yes |
| `vendor/` | Lockfile-pinned local npm tarballs required by `file:vendor/*` dependencies | **Yes — required for `npm ci` from the source artifact** |
| `openapi/` | Current same-origin API contract | Yes |
| `tools/` | Operator/developer tooling shipped with source | Yes |
| `.github/` | CI, nightly and release workflows | Yes |
| `Doc/` | Current source/build documentation; release packager filters historical/evidence-only subsets | Filtered |

## Working-copy-only / generated roots

| Path | Classification | Clean source artifact |
|---|---|---|
| `node_modules/` | Installed dependencies, platform-local | **No** |
| `.git/` | Git metadata for the published repository. Present in every clone and in every `actions/checkout` run, so it is classified rather than treated as an unknown root entry. | **No** |
| `dist/` | Compiled build output; belongs in the separate build artifact | **No** |
| `QA/` | Machine-readable/current QA output; belongs in evidence artifact where selected | **No** |
| `_qa/` | Ephemeral browser/visual captures | **No** |
| `_release/` | Generated source/build/evidence release artifacts | **No** |
| `.agent-index/` | Generated local function-agent index | **No** |
| `test-results/` | Generated browser/runtime/visual QA captures | **No** |
| `.apex-data/` | Runtime/private execution/governance state | **No** |
| `.claude/` | Local agent/editor settings; not product source | **No** |
| `_archive/` | Historical repository material retained for traceability | **No** |
| `apex-npm-tarballs.zip` | Operator-supplied Windows offline npm tarball bundle. Must sit at the root because `scripts/windows/Restore-OfflineDependencies.ps1` defaults `-TarballZip` to `.\apex-npm-tarballs.zip` and fails with "Place apex-npm-tarballs.zip in the project root" otherwise. Regenerable convenience bundle, not a build input — `npm ci` resolves `file:vendor/*` from `vendor/` instead. | **No** |
| `.mcp-recovered/` | Locally recovered MCP server installs (agent tooling, not product source) | **No** |

## Runtime/private state that must not be source

The following are never valid release-source entries:

- `.env`, `.env.local`, `.env.txt`
- `.external-api-sources.config.json`, `.supplemental.config.json`, `.telegram.config.json`
- `.apex-data/`, `.apex-private-data/`
- execution, governance, decision-memory, provider-key, or operator-token state files
- local logs, temporary stores, screenshots, coverage output

Private configuration must resolve through the OS/user private-data path implemented by `src/services/privateConfigFile.ts`; release artifacts must never contain the resulting files.

## Documentation locations

| Type | Location |
|---|---|
| Architecture & agent reference | `Doc/architecture/` |
| Active plans & specifications | `Doc/plans/active/` |
| Superseded plans | `Doc/plans/archive/` |
| Final acceptance reports | `Doc/reports/final/` |
| Historical reports | `Doc/reports/historical/` |
| Repository housekeeping | `Doc/repository/` |
| QA policy & capture docs | `Doc/qa/` |
| Automation stress results | `Doc/automation/` |
| Function atlas | `Doc/FUNCTION_INDEX.*` |
| API route inventory | `Doc/repository/API_ROUTE_INDEX_2026-08-10.*` |

## Script layout

```text
scripts/
├── capture/     # Headed capture, contact sheets, verification
├── qa/          # Runtime/source/geometry/a11y/soak verification
├── gates/       # Release, contract and source-quality gates
├── lib/         # Shared capture/decision-memory helpers
├── migrations/  # Explicit schema/data migrations
└── utilities/   # Indexers, release packaging, stress harnesses and ML tooling
```

## Root-governance rule

Any new root path must be classified here and added to `scripts/gates/checkRootContract.mjs` in the same change. Legacy desktop/Claude launchers and unrelated helper executables are preserved under `_archive/legacy-root-extras/` rather than competing with the application runtime. Unknown root entries are a source-contract failure; working-copy-only entries are allowed locally but must remain excluded from the clean source artifact.
