# APEX v1.0.56 — Gap Closure Session 1 (P0 batch) — 2026-08-10

Source of truth: `APEX_v1_0_56_MASTER_GAP_CLOSURE_PROMPT.md`.
Evidence class: current source code + clean-environment command output (this session, Linux, Node v22.22.2, npm 10.9.7).

## GAP REL-01 — Forbidden Secret-Bearing Config Exists in the Source Package
**Status: ALREADY RESOLVED** (confirmed this session)

- Verified `.external-api-sources.config.json` is **not present** in the delivered source tree; only `.external-api-sources.config.example.json` exists.
- `.gitignore` already excludes `.external-api-sources*` while allow-listing the `.example.json` template.
- `scripts/utilities/createReleaseArchive.mts` already enforces a forbidden-file gate over `.env`, `.env.local`, `.env.txt`, `.external-api-sources.config.json`, `.supplemental.config.json`, `.telegram.config.json`.
- No action required beyond the durable persistence-location fix tracked as PERS-01 below (the file could theoretically reappear at repo root at runtime — closed by that fix).

## GAP REL-02 — Source Archive Ships Platform-Specific `node_modules`
**Status: ALREADY RESOLVED** (confirmed this session)

- Verified no `node_modules` directory shipped in the source archive.
- Ran, from a clean checkout, in this Linux container:
  - `npm ci` → succeeded, 317 packages installed, no errors.
  - `npx tsc --noEmit -p tsconfig.json` → **0 errors**.
- This is real clean-install evidence (not a smoke claim); it directly satisfies the REL-02 acceptance criterion for `npm ci` + typecheck from a fresh install.
- `npm run build` / `npm run verify` were not run in this batch (deferred to the next QA-focused session — these are heavier, longer-running gates and are tracked separately as GAP QA-01).

## GAP PERS-01 — Runtime Secret/Config Persistence Should Not Use Repository Root
**Status: FIXED**

### Problem
`server.ts` persisted three operator-configurable, credential-bearing files directly under `process.cwd()` (the repository/source root):
- `.supplemental.config.json` (news/sentiment/on-chain API keys)
- `.external-api-sources.config.json` (operator-managed external source profiles)
- `.telegram.config.json` (Telegram bot token / chat id)

Storing secrets in the source/repo root risks accidental inclusion in a zipped source release, a git commit, or a static file path, even though `writePrivateJsonFileSync` already wrote them with `0600`/`0700` permissions and atomic rename.

### Fix
- Added `resolvePrivateDataDir()` and `resolvePrivateConfigPath()` to `src/services/privateConfigFile.ts`.
- Resolution order: `APEX_PRIVATE_DATA_DIR` env override → `%APPDATA%\APEX\private` on Windows → `~/.apex/private` on other OSes → `<cwd>/.apex-private-data` as a last-resort fallback only when no home directory is resolvable.
- `resolvePrivateConfigPath()` auto-migrates a legacy file from the old repo-root path into the new private directory on first run (one-time, atomic, then removes the legacy copy), so operators with existing saved keys/tokens are not silently reset.
- Repointed all three `*_CONFIG_PATH` constants in `server.ts` to use `resolvePrivateConfigPath(...)` with their old repo-root path passed as the legacy path.
- No change to file permissions logic (`writePrivateJsonFileSync` already sets `0700`/`0600` and does atomic writes) — only the directory changed.

### Files changed
- `src/services/privateConfigFile.ts` — added `resolvePrivateDataDir`, `resolvePrivateConfigPath`.
- `server.ts` — `SUPPLEMENTAL_CONFIG_PATH`, `EXTERNAL_SOURCES_CONFIG_PATH`, `TELEGRAM_CONFIG_PATH` now resolved outside the repo root, with legacy-path migration.

### Tests / evidence this session
- `npx tsc --noEmit -p tsconfig.json` → 0 errors after the change.
- Manual runtime smoke script (via `tsx`) exercising `resolvePrivateConfigPath`:
  - Confirmed a legacy file at a simulated repo-root path is migrated into the new private directory and removed from the old path.
  - Confirmed new directory permission `0700` and file permission `0600`.
- Not yet re-run: full `check:source-contracts` QA suite (Maximal Merge Safety 30/30, System Integration 12/12, Liquidity Hunter Safe Completion 29/29) — this is a long-running suite and is deferred to the next QA batch (GAP QA-01) rather than run partially.

### Remaining limitations
- Windows-specific `%APPDATA%` path was implemented per platform conventions but not executed on an actual Windows host in this session (this container is Linux). Recommend a one-time manual check on your Windows dev machine after pulling this change: start the server once, then confirm `%APPDATA%\APEX\private\` is created and populated instead of files appearing in the project root.
- `APEX_PRIVATE_DATA_DIR` should be documented in `.env.example` / deployment docs as the recommended override for containerized/production deployments (tracked as a small follow-up, not done in this batch).

---

## Next batch (proposed)
P1 items not yet started: REL-03 (artifact separation), DOC-04 (OpenAPI coverage), QA-01 (full verify suite from clean install), DATA-04/DATA-09/DATA-11, LH-07, EXE-01–EXE-05, ML-01/02/07, OPS-02.

---

# Batch 2 (P1) — 2026-08-10

## GAP DATA-09 — KuCoin Order-Book Contract Quantities Require Multiplier-Aware Normalization
**Status: ALREADY RESOLVED** (confirmed this session)

Reviewed `src/services/marketDataService.ts::getOrderBook` end-to-end:
- KuCoin path fetches `kucoinContract` alongside `kucoinLevel2` and validates `Number.isFinite(multiplier) && multiplier > 0` **before** any conversion; on failure it records `contract multiplier unavailable` and falls through to the next provider rather than guessing.
- `OrderBookResult.volumeUnit` is a closed union (`'base_asset' | 'contracts_unknown'`); `finalizeOrderBook` only computes `bidDepthUsd`/`askDepthUsd` when `volumeUnit === 'base_asset'` (`canValueInUsd`), otherwise USD depth is `0` rather than fabricated.
- Space-4 path (`hfSpacesClient.ts`) already sets `volumeUnit: multiplier ? 'base_asset' : 'contracts_unknown'`, and this is covered by an existing test (`src/tests/hfSpacesClient.test.ts`, asserts `'contracts_unknown'`).
- No code change required. This gap's acceptance criteria (multiplier verified before conversion, source/converted units labeled, unknown multiplier cannot silently become USD depth, fail-closed on missing multiplier) are already met and test-covered.

## GAP EXE-05 — Production Authentication Profile Needs Explicit Hardening
**Status: FIXED**

### Problem
The runtime could operate with `APEX_OPERATOR_TOKEN` unset indefinitely, relying only on loopback/origin/CSRF checks — appropriate for a local desktop deployment but with no explicit distinction from a production/remote one, and no requirement for TLS.

### Fix
- Added `DeploymentProfile` (`'local' | 'lan' | 'production'`) and `resolveDeploymentProfile()` to `src/services/serverSecurity.ts`. Unset/unrecognized values resolve to `'local'` — **zero behavior change** for existing deployments that don't opt in.
- Extended `assertMutationAllowed()`: when `deploymentProfile === 'production'`, mutating requests now fail closed:
  - `503 operator_token_not_configured_for_production` if no operator token is configured at all (previously this silently degraded to origin/CSRF-only trust).
  - `403 tls_required_in_production` if the request did not arrive over TLS (checked via `req.secure` or a trusted `X-Forwarded-Proto: https`).
  - Existing token-mismatch behavior (`401 operator_token_required`) is unchanged.
- `server.ts`: reads `APEX_DEPLOYMENT_PROFILE`, logs a loud startup warning if `production` is selected without a token configured, and passes `deploymentProfile`/`requestIsSecure` into the mutation-auth middleware.
- `/api/security/bootstrap` now also reports `deploymentProfile`, `tlsRequired`, `requestIsSecure`, and a computed `hardeningSatisfied` boolean — all boolean/enum posture, no secret values.
- Documented `APEX_DEPLOYMENT_PROFILE` in `.env.example`.

### Files changed
- `src/services/serverSecurity.ts` — `DeploymentProfile`, `resolveDeploymentProfile()`, `assertMutationAllowed()` production-profile branch.
- `server.ts` — reads/validates the profile, startup warning, wires it into the mutation-auth middleware and `/api/security/bootstrap`.
- `.env.example` — documents `APEX_DEPLOYMENT_PROFILE`.
- `src/tests/serverSecurity.test.ts` — 7 new tests covering profile resolution and all four production-profile branches (missing token / plaintext / valid / wrong token).

### Tests / evidence this session
- `npm ci` (clean install) → 317 packages, no errors.
- `npx tsc --noEmit` → 0 errors.
- `npx vitest run src/tests/serverSecurity.test.ts` → **17/17 passed** (10 pre-existing + 7 new), confirming no regression to the default `local` profile and correct fail-closed behavior for `production`.

### Remaining limitations
- This closes the *application-layer* half of EXE-05 (token + TLS enforcement logic). The gap also asks for "TLS at the deployment boundary" — actually terminating TLS is an operator/infra decision (reverse proxy, certificate) outside this codebase; the app now correctly detects and requires it via `X-Forwarded-Proto`, but provisioning a certificate is a deployment task, not a code task.
- `lan` profile currently behaves identically to `local` (no additional enforcement) — it exists as a named placeholder for a future explicit trusted-subnet allowlist check if you want one; not implemented in this batch since the gap register didn't specify a concrete rule for it.

---

## Batch 2 status summary
| Gap | Result |
|---|---|
| DATA-09 | ALREADY RESOLVED (verified) |
| EXE-05 | FIXED (app-layer), verified with 17 passing tests + clean typecheck |

## Not started this batch (deferred, in priority order)
REL-03 (artifact separation), DOC-04 (OpenAPI coverage), QA-01 (full verify suite — long-running, needs a dedicated session), EXE-01–EXE-04 (require live/testnet exchange access to actually verify, not closable by source changes alone — will scope what's source-side-only next), ML-01/02/07 (need real outcome data, largely BLOCKED EXTERNALLY pending production data).
