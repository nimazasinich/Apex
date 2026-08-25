@Doc/CLAUDE_UI_HANDOFF_20260816.md
@Doc/CLAUDE_SCRIPTS_TOOLING_MEMORY.md

## Agent operating rules — read this before choosing how to work (added 2026-08-23)

**Probe the execution surfaces first, in ONE batched call. Never infer availability from memory or from a previous
session.** Availability changes per session, and a stale assumption ("native execution is gated") has already cost a
full session of avoidable slowness.

- `mcp__desktop-commander__start_process("node -v")` — is native Windows execution available? Usually yes.
- `mcp__workspace__bash("ls -d /sessions/*/mnt/*/")` — is the project mounted in the Linux sandbox? **Often it is NOT**;
  when it is absent there is no `grep -r` and no batch reading from that surface, so plan around it instead of
  discovering it mid-task.

**Session initialization is mandatory and non-negotiable, regardless of the preference order below.** The very first
Serena call in any fresh session must be `activate_project` (or `get_current_config` solely to confirm one is already
active) — every other Serena tool fails with "No active project" until this runs, and skipping it is what causes a
session to silently fall back to Desktop Commander/bash for the entire task instead of ever touching Serena. Do this
before any file read, any grep, and before choosing which surface to use for the task — the preference order below
governs *ongoing* file work, not whether Serena gets initialized at all.

**Keep Serena's memory graph current — this is not optional bookkeeping.** Whenever a session discovers something
durable (a fixed bug, a corrected assumption, a resolved "unverified" item, a new config invariant, a hazard worth
remembering next session), write or edit the relevant memory before the session ends — via `write_memory` /
`edit_memory`, matched by content never by line number. A finding that lives only in chat output and never reaches
`.serena/memories/` is lost the moment the session ends and will be rediscovered (or contradicted) at full cost next
time. This applies even on sessions whose primary work happened through Desktop Commander — if the *outcome* is
something a future session needs to know, it still belongs in Serena's memory, not just in a CLAUDE.md edit or a chat
transcript.

**Serena must always have access when a task could plausibly need it.** Do not skip `activate_project` because the
task looks like "just a CSS tweak" — symbol-aware tools and the memory graph stay available throughout the session
once activated, at negligible ongoing cost, and the alternative (reactivating mid-task after discovering symbolic work
is actually needed) is strictly worse than activating once up front.

**Preference order for file work, fastest first** — canonical HERE. `mem:execution_environment` points back to this
section instead of restating it, so edit this block and nowhere else:

1. `desktop-commander` — `read_multiple_files` for batch reads, `start_search` for grep, `edit_block` for edits,
   `start_process` for gates. This is the **only** surface that can run `tsc` / `test:unit` / `build` / `verify`
   natively, so it is the primary surface whenever it answers.
2. `mcp__workspace__bash` — cheapest bulk reader, but only when the project is genuinely mounted.
3. Serena — symbol navigation, targeted symbolic edits, and its memory graph. One file per round-trip; never use it
   for bulk reading. Serena's overlapping non-symbolic tools (`read_file`, `create_text_file`, `list_dir`, `find_file`,
   `execute_shell_command`) are already excluded in the **global** `~/.serena/serena_config.yml` — NOT in
   `.serena/project.yml`, whose empty `excluded_tools: []` is correct and must not be "fixed". `replace_content`
   (regex; named `replace_regex` in older releases) and `replace_in_files` (multi-file, dry-run) stay active on
   purpose — Desktop Commander's `edit_block` has no equivalent.

Playwright is a separate job, not a rank in that list: browser geometry, viewport sizing, screenshots, visual and
workspace-runtime checks.

**Do not** read files one at a time when the paths are already known — batch them in a single call.
**Do not** run a 40-line `browser_evaluate` audit dump to establish a fact that six lines would settle.
**Do not** re-run a gate that already passed unless a source/config/build input actually changed.
**Do** batch every independent tool call into one block, and go straight from a diagnosed cause to the fix.

**Before ending a session that hit context pressure or that stops mid-task:** write the handoff via the `apex-resume`
convention — authoritative path, file/marker/hash evidence, the unfinished task. Serena has **no**
`prepare_for_new_conversation` tool in 1.7.0 (absent from `serena tools list --all`, not merely context-excluded), so
do not go looking for it and do not plan a handoff around it.

**Do not** let a Serena memory entry stay flagged "unverified" past 3 sessions — promote it, retire it, or delete it.

**Measured native-Windows timings (2026-08-23), so no gate here is "too slow to try":**
`npx tsc --noEmit` under 30s · `npm run test:unit` ~13s (130 files / 756 tests) · `npm run build` under 50s ·
`check:version-identity` + `check:build-identity` a few seconds each.

**Platform note:** `node_modules` ships `@esbuild/win32-x64` and `@rollup/rollup-win32-x64-*` only. Installing Linux
equivalents is forbidden. An esbuild/rollup "installed for another platform" error is therefore **never** evidence of a
source defect — it means the command was run on the wrong surface. Move it to Windows and re-run.

## Speed ideas — status as of 2026-08-23 (re-audited same day)

Detail and caveats live in the Serena memory `mem:execution_environment`; read it before acting on either open item.

- **OPEN (dated 2026-08-23).** `serena project index` to pre-warm the language server before the first symbol lookup
  of a session, instead of paying the cold-start cost mid-task on whichever `find_symbol` call happens to go first.
  The CLI *is* on PATH and confirmed working (`C:\Users\Dreammaker\.local\bin\serena.exe`, Serena 1.7.0), so the only
  untested part is whether it actually cuts measured latency here. Retire or promote within 3 sessions.
- **OPEN (dated 2026-08-23).** `get_diagnostics_for_file` as a faster interim check on a single edited file — narrower
  than a real compile, so it does NOT replace `npx tsc --noEmit` before a gate run. Note: `get_diagnostics_for_symbol`
  is an *optional* tool and is NOT in the active set, so only the per-file variant is callable.
- **RESOLVED 2026-08-23 — no action left.** Excluding Serena's non-symbolic file tools was already done, in the
  **global** `~/.serena/serena_config.yml`, whose `excluded_tools` holds exactly `read_file`, `create_text_file`,
  `list_dir`, `find_file`, `execute_shell_command`. Verified absent from `get_current_config`'s active-tools list.
  `.serena/project.yml`'s `excluded_tools: []` is therefore correct — a project-level copy would be a no-op duplicate.
  Also verified: excluding `create_text_file` / `execute_shell_command` does NOT prevent Serena 1.7.0 from starting.
