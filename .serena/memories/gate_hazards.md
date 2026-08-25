# Gate Hazards & Standing Traps

Known recurring failure causes and how to interpret them. The canonical pipeline and failure workflow are in `mem:task_completion`; execution mechanics in `mem:windows_gate_ops`.

## Vendored dependency pins — WILL regress after any npm install
`yallist@3.1.1` and `why-is-node-running@2.3.0` are pinned to tracked local tarballs under `vendor/`, but **the pin exists only in `package-lock.json`** — `package.json` carries no `overrides` and no `file:` reference. Any plain `npm install` rewrites `resolved` back to the registry and swaps in the registry `integrity`. Symptom: `qa:workspace-light-polish` fails on `locked yallist tarball is bundled` / `bundled yallist integrity matches lock`. Despite its name that script is not only UI polish — it also carries supply-chain checks. Fix by restoring the two lock entries to `file:vendor/<tarball>.tgz` (yallist keeps its integrity hash; the `why-is-node-running` file-resolved dev entry carries none); do **not** touch the gate. Never `git checkout HEAD -- package-lock.json` wholesale — the working lock legitimately contains intended changes and reverting desyncs it from `package.json`.

## package-lock `libc` blocks
22 `"libc"` blocks (13 `@rollup/rollup-linux-*`, 4 `@tailwindcss/oxide-linux-*`, 4 `lightningcss-linux-*`, 1 `@napi-rs/lzma-linux-x64-gnu`; 12 `glibc` / 10 `musl`) are Linux-side optional-dependency metadata. CI runs `npm ci` on `windows-latest`, and a win32-only lockfile has already caused an npm `EUSAGE` failure once. A local Windows npm run strips these blocks, and a blanket `git add -A` has shipped that strip for real. npm orders keys **alphabetically**, so `libc` sits between `cpu` and `license`, not after `os`. Restore by splicing the known-good entry's exact raw text, guarded by an `old_block_minus_libc_lines == current_block` assertion (abort rather than patch if it fails), then verify structurally: parsed result deep-equals current JSON + libc keys, file stays pure LF with a final newline. Regex-only patching is the wrong tool — parse and compare.

## Docs gates
- `docs:check` = `checkDocumentationLinks.mts` validates **only Markdown inline links**, regex `/\[[^\]]+\]\(([^)]+)\)/g` — never file hashes. Backtick code spans are not path candidates, so a path inside backticks passes; do not "fix" a code span or special-case the checker to satisfy this gate. Editing doc prose or versions cannot fail it unless a link breaks. Never link generated output that a clean checkout lacks (root `/QA/` is gitignored, and gate scripts write their JSON there).
- The `DOCUMENTATION_INDEX.json` content-hash drift check is `index:docs -- --if-changed` and is **CI-only (GitHub Actions), not in `verify` / `release:package`**. It compares only `fileHashes` (content sha256), never `updatedAt` — so preserve committed `updatedAt` values for content-unchanged entries, otherwise a naive regen churns hundreds of lines of pure timestamp noise.
- A gitignored generated HTML doc can still legitimately appear in `fileHashes` because CI generates it before the check runs; that only holds while the generator stays byte-deterministic (no timestamps, pure LF).

## `check:root-contract` masks the two gates behind it
The `check:source-contracts` tail is `… && check:root-contract && check:api-contract && check:build-identity`, so one stray root entry hides route-index and build-identity drift entirely. **After fixing root-contract, expect a second failure rather than a pass** and budget for it. Correct remedy for a stray helper artifact is removal or relocation into a classified + gitignored directory (`_archive/`), never classifying it. Genuine agent-tooling roots (`.serena`, `.playwright-browsers`) *are* classified — in both `scripts/gates/checkRootContract.mjs` and `Doc/repository/ROOT_CONTRACT.md`, which must be updated together.

## When a gate prints its own remedy command, that command is canonical
Run it instead of analysing. Example: `check:api-contract` reporting "generated API route index drifted; run npm run index:routes and commit the result" is fixed by exactly that script.

## `qa:autopilot-lifecycle-runtime` cycle-attribution assertion is FLAKY — not a hard blocker
The check maps `forwardEvaluation.evidence.entries[].lastCycleIndex` and asserts all values ≤ the current cycle index **and** one exactly equals cycle N. Both clauses rest on a false premise: `cycleIndex` is **per-boot** (`nextCycleIndex` resets to 0 on every boot) while the research-scoped forward mirror **persists across boots**, and `lastCycleIndex` is a per-`contextKey` max — so an older position in the same context masks cycle 0 even in a clean run. It is satisfiable only on runs where Cycle N actually opens a forward position; otherwise it takes an honest SKIP, which is how green runs happen. Do **not** clear the persisted forward mirror to make it pass — that evidence is what backs the honest "not promotable" verdict, and deleting it could make a non-promotable strategy look promotable. Do **not** rewrite the assertion unattended: the honest re-expression is contextKey coverage, a semantic change to a gate guarding research-promotion honesty, which belongs in a reviewed change.

## Duplicate-script trap
`runAutopilotLifecycleRuntime.mjs` exists in **both** `scripts/qa/` (canonical — the copy `package.json` maps) and `scripts/gates/` (dead; referenced by no npm script, CI, ps1 or cmd). It is the only filename duplicated between those two directories. A fix applied to the wrong copy is inert and looks like the fix simply did not work. Confirm which copy npm actually runs before patching.

## Release artifact checks
- **Zip length is not an identity check.** Two `release:package` runs from an identical commit produced byte-identical archive lengths with different SHA-256 (embedded timestamps). Always compare hashes, against both `CHECKSUMS.sha256` and `release-manifest.json`.
- **Read `git diff` before any `release:package`.** A deliberately dirty tree can be someone's test scaffolding — a self-labelled temporary probe comment has appeared in `src/services/strategyEngine/index.ts` — and packaging it embeds a throwaway marker in the shipped artifact. Treat a self-describing temporary marker as a hard stop.
- Stale artifacts from a previous release line can sit in `_release/` alongside the current set; that is not drift.

## Git hygiene for this repo
- Line endings are safe: no `.gitattributes`, `core.autocrlf` and `core.eol` unset, `core.filemode=false`, zero tracked files contain CRLF. Proof-by-diff — if `git status` ever shows every file modified, that IS line-ending churn; stop.
- **Never `git add package-lock.json` as collateral** from a local build/dev run (see the two lockfile hazards above). Keep doc/index commits scoped with explicit paths; treat any lockfile change as its own reviewed change.
- `.serena/.gitignore` contains `/cache`, which is what keeps the large binary `.pkl` symbol caches untracked. `.serena/project.yml` and `.serena/memories/**` ARE intended to be committed.
- Audit with `git status --porcelain` before committing, and clean up your own probe files — a permission-test touch file has been staged and nearly shipped.
- Beware `grep … | head -N && echo "FOUND"`: `head` exits 0 on empty input so the `&&` branch always fires. This produced a false secret-leak scare. Use `n=$(grep -c …)` and test `[ "$n" -eq 0 ]`.
