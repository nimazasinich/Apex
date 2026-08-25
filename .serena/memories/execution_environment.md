# Execution Environment (Windows-only)

Hard requirement: build/run/verify natively on Windows. Do NOT adapt deps / package.json / package-lock.json / native pkgs / source for Linux. Do NOT install Linux Rollup/esbuild packages.

## Session-start correction (2026-08-23) — probe, don't assume
A full session was lost to slowness caused by three compounding habits, NOT by any real tool outage: reading Serena files one at a time instead of batching, running large multi-hundred-token `browser_evaluate` probes for facts a few lines would settle, and **assuming from a past session's memory that native Windows execution was gated — it was not.** `mcp__desktop-commander__start_process("node -v")` and `npx tsc --noEmit` both answer cleanly on a healthy session. Canonical, fuller version of this correction lives in the project's own `CLAUDE.md` (root, not this memory store) under "Agent operating rules" — read it too, it is authoritative for tool-preference order.

**Do this at the start of every session, in ONE batched call — never infer availability from memory or a prior session:**
- `mcp__desktop-commander__start_process("node -v")` — is native Windows execution available? Usually yes.
- `mcp__workspace__bash("ls -d /sessions/*/mnt/*/")` — is the project mounted in the Linux sandbox? Often it is NOT; when absent, there is no `grep -r` or batch reading from that surface — plan around it rather than discover it mid-task.

## Tool division

**Authoritative elsewhere — do NOT restate it here.** The file-work preference order
(Desktop Commander → `mcp__workspace__bash` → Serena), the Playwright carve-out, the Serena
`excluded_tools` facts, and the measured native-Windows gate timings all live in the project's root
`CLAUDE.md` under "Agent operating rules". That block is the single source of truth — edit it there and
nowhere else. This memory carries only Serena-internal mechanics (symbol-lookup latency causes,
language-server config, MCP call-length limits) that don't belong in a repo-root file.

**Serena tool exclusions are owned by the GLOBAL config, NOT by this project (verified 2026-08-23).**
The owning key is `excluded_tools:` in `~/.serena/serena_config.yml` = `read_file`, `create_text_file`, `list_dir`,
`find_file`, `execute_shell_command`. (Find it by content — `Select-String -Pattern '^excluded_tools:'` — never by
line number; anything inserted above it shifts the position and a remembered line silently points at the wrong key.) The same file also sets `default_modes: [no-onboarding]`.
`.serena/project.yml`'s `excluded_tools: []` and empty `default_modes:` are therefore CORRECT — do not "fix" them.
**Implication: changing tool exclusions or default modes for this project means editing the GLOBAL file, not
project.yml; a project-level entry on top of an active global exclusion is a no-op duplicate.** That global file is
outside Desktop Commander's allowed roots — read it with `start_process` PowerShell, never `read_file`.

## Prohibitions
- No Cowork Linux workspace. No `/sessions/.../mnt/` paths — that is a separate Linux sandbox, NOT the Windows source tree; never verify APEX there.
- Do NOT run `npm install`.
- Do NOT modify package.json / package-lock.json unless the user explicitly requests it.
- No custom preflight runners, orchestration helpers, curated gate subsets, or intermediate status/task `.md` files — use canonical scripts.
  - **Sanctioned exception — `verify:fast`.** `scripts/gates/verifyFast.mjs` + its two helpers (`computeChangedScope.mjs`, `gateDependencyMap.mjs`) are an approved dev-loop runner and do NOT violate the rule above. Reasons: (a) they never modify `verify` or `release:package`, which remain the sole release-certifying chains — full canonical `verify` must still run before any release; (b) built specifically to cut redundant full-suite runs on unrelated changes; (c) verified end-to-end with real exit codes proving no gate was weakened. Never cite `verify:fast` as release evidence. Mechanics: `mem:task_completion`.
- No unattended or scheduled `release:package` / `verify` automation against this repo. Every release run requires an explicit human trigger for that specific run. An armed recurring task fires against whatever tree state happens to exist — a probe-dirty tree, a co-tenant chain mid-flight, a stale commit — and can package throwaway scaffolding into a shipped artifact. Semantic gate rewrites and release-management judgment calls likewise never happen unattended.
- Preserve unrelated user files and changes.

## Canonical QA viewport
1368×753. Visual gate qa:ui-1368 → scripts/qa/verifyUi1368.mjs; verify:visual = qa:ui-1368 && qa:workspace-runtime. Visual gates serve LIVE source via vite middleware, so UI can be re-checked without a rebuild.

## MCP / DC operational limits
Long MCP tool calls cap around ~90s. In Desktop Commander avoid bare `$VAR` and unix process-list idioms (they break); set the correct cwd for Playwright runs.

**Slow Serena symbol lookups are normal on this project — the ~90s cap is the only real "stuck" signal.** Individual symbol-lookup calls (`find_symbol`, `get_symbols_overview`, `find_referencing_symbols`, `find_declaration`, ...) routinely take several seconds and can legitimately reach roughly half a minute, because the TypeScript language server (re-)initializes and indexes a codebase of this size (~680+ TS symbols) on first touch, and re-warm after idle. That latency is expected cost, NOT a hang. Do not restart the MCP server, re-issue the same call, or fall back to raw text search / DC grep merely because a call is slow — a re-issue usually pays the initialization cost twice and makes it worse. Only a call that actually reaches the ~90s MCP timeout ceiling counts as genuinely stuck and worth a restart; anything that returns under that ceiling is "slow but fine". Judge by the ceiling, not by impatience. **Resolved contributor (2026-08-23):** a redundant `svelte` language server was double-indexing the same TS symbols; removed. See the invariant under "Symbol-lookup latency causes" below. This cut one duplicate indexing pass but did NOT eliminate lookup latency — the ~90s-ceiling rule above still stands.

How to launch, poll, attribute and judge a long gate run on this host — the detached `Start-Process` pattern, why the log freezes when a DC session dies, block-buffered stdout, the `APEX_EXITCODE` marker as the only verdict, and the quoting traps that fail silently: `mem:windows_gate_ops`.

**Fixed-port orphan / co-tenant collision class.** Never run two gate chains concurrently. `qa:autopilot-lifecycle-runtime` binds the FIXED port 4599 and `qa:workspace-runtime` / `dev:server` binds 3210; `qa:ui-1368` additionally leaks a `server.ts` holding Vite HMR port 24678. Both a stale orphan and a live co-tenant on those ports get silently accepted by boot checks that only require `/api/health` 200, producing a FALSE FAIL (classically `controller starts OFF — phase=WAITING`) or a mutual deadlock where neither chain can satisfy its cycle wait. Before launching any gate: check for listeners on 4599/3210 and sweep the node process tree — the ParentProcessId chain is what attributes a run, so capture your own probe's PPID in the same call as a control. A `public/build-info.json` mtime within minutes of now is a cheap co-tenant alarm. Interference is mutual: your `build` rewrites `dist/` + `public/build-info.json` underneath their chain and can fail THEIR `check:build-identity`, so deferring is correct even when your own run would survive.

## Symbol-lookup latency causes

**Invariant (fix applied 2026-08-23, has held since):** `.serena/project.yml` `language_servers:` is `typescript` + `powershell`. Do NOT re-add `svelte` — this repo is a React SPA with ZERO `.svelte` files and no svelte dependency, and the entry spawned a second companion `typescript-language-server` that re-indexed the same ~680+ TS symbols for nothing. Config-only change, per-project (never touch the global `serena_config.yml` for this). Match on content, never on a remembered line number. Investigation forensics are recoverable from git history — not repeated here.

**Schema correction:** there is no `ls_priorities` key in Serena 1.7.0's project.yml — the key is `language_servers` (a plain ordered list, no per-language priority numbers). Don't go looking for `ls_priorities`.

Other latency contributors worth checking before blaming anything else: `symbol_info_budget` is unset in project.yml (falls back to global), `ls_workspace_folders` is `["."]` so the entire deeply-nested project root is indexed, and the project path itself is very long/deeply nested on Windows (disk-I/O cost per stat).

## Speed ideas — status (dated; see `mem:memory_maintenance` time-box rule)

Every entry here MUST carry a date and must be promoted, retired, or deleted within 3 sessions.

- **OPEN (2026-08-23).** `serena project index` to pre-warm the language server before the first `find_symbol` of a session, absorbing the cold-start cost as a one-time upfront hit. The `serena` CLI is confirmed on PATH and working (`C:\Users\Dreammaker\.local\bin\serena.exe`, Serena 1.7.0) — the only untested part is whether it measurably cuts latency here. Run it via Desktop Commander `start_process`, not as an MCP tool call.
- **OPEN (2026-08-23).** `get_diagnostics_for_file` as a cheap interim check right after a single symbolic edit. Narrower than a whole-project compile, so it does NOT replace `npx tsc --noEmit` before a gate run. `get_diagnostics_for_symbol` is an OPTIONAL tool and is NOT in the active set — only the per-file variant is callable.
- **RESOLVED (2026-08-23) — nothing left to do.** Excluding Serena's overlapping non-symbolic tools was already in place all along; the owning file, the exact names and the line number are under "Tool division" above — not repeated here. Three tool-registry corrections worth keeping: (1) excluding `create_text_file` / `execute_shell_command` does NOT stop Serena 1.7.0 from starting, contrary to upstream issue #636 — this project runs with both excluded; (2) `replace_regex` no longer exists, it is now `replace_content`, kept ACTIVE on purpose alongside `replace_in_files` because Desktop Commander's `edit_block` has no regex or multi-file equivalent; (3) `prepare_for_new_conversation`, `switch_modes` and `check_onboarding_performed` are ABSENT from the installed version's full tool registry — `serena tools list --all` returns 52 entries and contains none of them. That listing is verified unfiltered (all five globally-excluded tools plus context-inactive optional tools like `open_dashboard` / `get_diagnostics_for_symbol` still appear in it), so this is genuine absence from the install, not context filtering. Consequences: `apex-resume` is the ONLY session-continuity mechanism, there is no mid-session mode switch, and onboarding-state must be inferred from the memory graph.

## Serena usage
- **First Serena call in any fresh session must be `activate_project`** (or `get_current_config` purely to confirm one is already active). Calling `list_memories` / `search_for_pattern` / `find_symbol` / etc. first fails with "No active project."
- Read `mem:core` first — it is the graph root; follow its `mem:` references outward.
- **`search_for_pattern` + `paths_include_glob` must be recursive: `**/*.ts`, never `*.ts`.** A non-recursive glob matches only files sitting directly in that directory, silently skips nested files, and returns `{}` — which reads as false absence. Only deliberately restrict to one directory level. Serena also skips dot-prefixed paths, so root dotfiles/dotdirs need a PowerShell/grep sweep instead. A `{}` result is not evidence of absence until the glob is verified recursive.
- **`search_for_pattern` with `skip_ignored_files: false` crashes repo-wide:** `FileNotFoundError: [WinError 3]` on a stale `.claude/worktrees/objective-tharp-42ad38/...` path. Keep the default `true`. To reach gitignored artifacts (e.g. `QA/**` gate results, which return `{}` under the default), scope with `relative_path` to that subtree instead of disabling the filter. Minified single-line JSON fixtures under `QA/**` match any digit substring and are megabytes per line, so narrow the pattern and cap `max_answer_chars` — a truncated answer still lists the matched file/line pairs.
- **Prefer symbolic tools over text access for code work:** `get_symbols_overview`, `find_symbol`, `find_referencing_symbols`, `replace_symbol_body`, `insert_after_symbol` / `insert_before_symbol`. Use them for locating a symbol, understanding a function/class structure, and localized edits. Reserve `search_for_pattern` / `read_file` — and Desktop Commander cat/grep/sed-style access — for genuinely non-symbolic needs: JSON/config files, true whole-file reads, and cross-file text search for non-code content. Do not default to raw grep/regex or DC file reads for symbol lookup or targeted edits.
