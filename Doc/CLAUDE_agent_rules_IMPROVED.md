# Agent Operating Rules — v2 (proposed revision, 2026-08-23)

This revises the "Agent operating rules" block in `CLAUDE.md` and the Serena memory files it
references (`mem:execution_environment`, `mem:memory_maintenance`, `.serena/project.yml`). Every
change below is sourced against Serena's official docs/source (oraios/serena, `035_tools.md`,
`02-usage/050_configuration.html`, `02-usage/030_clients.html`) — cited inline — not against
training-data guesses about how Serena behaves.

---

## 0. Governance problem this fixes

Right now the **same fact lives in two places** — the tool-preference order and the
Windows-execution rules appear verbatim in both `CLAUDE.md` and `mem:execution_environment`, with
a comment in each telling the reader to "keep the two in sync." Two sources of truth for one fact
is itself a standing hazard: the next edit will update one and miss the other, and nothing detects
the drift.

**Rule: `CLAUDE.md` is the single canonical source for agent operating rules.**
`mem:execution_environment` should *reference* it (`See root CLAUDE.md, "Agent operating rules" —
authoritative for tool order and prohibitions`) and carry only Serena-specific mechanics that
don't belong in a repo-root file (symbol-lookup latency causes, the svelte fix, MCP call-length
limits). This is already half-true in the current text ("Canonical, fuller version... read it too,
it is authoritative") — the fix is to delete the *duplicated* tool-order paragraph from the Serena
memory entirely rather than maintaining two copies of it.

Apply the same test to any future addition: if a rule governs tool choice/session behavior in
general, it goes in `CLAUDE.md` once. If it's a Serena-internal mechanic (why a lookup is slow,
which project.yml key does what), it goes in the Serena memory graph once. Never both.

---

## 1. Serena `excluded_tools` — concrete, sourced list

Serena's own docs recommend the pattern already suspected in `mem:execution_environment`'s
"unverified speed ideas" section: when a client already has its own file/shell tools (here,
Desktop Commander), disable Serena's *overlapping non-symbolic* tools to shrink the per-turn
tool-list payload without losing capability. This is a documented recommendation, not a guess —
Serena's client-integration docs say so explicitly for the analogous case of built-in editor
tools: keep the more powerful side of an overlapping pair active, disable the other[^1].

**Candidates to add to `excluded_tools` in `.serena/project.yml`** (all confirmed non-symbolic,
i.e. redundant with Desktop Commander's `read_multiple_files` / `start_search` / `edit_block`):
`list_dir`, `find_file`, `read_file`, `search_for_pattern` (only if DC's grep is preferred for
*all* text search — but `mem:execution_environment` already carves out a legitimate non-code use
for it, so **do not exclude `search_for_pattern`**), `replace_regex`, `insert_at_line`,
`delete_lines`, `replace_lines`.

**Do NOT attempt to exclude `create_text_file` or `execute_shell_command`.** A filed upstream
issue shows Serena fails to *start* when either is placed in `excluded_tools` — they are treated
as load-bearing internals, not optional surface[^2]. If neither is currently relied upon (Desktop
Commander already owns file creation and shell execution per the tool-division rule), the safe
move is simply never calling them, not excluding them.

**Process rule (already correctly stated, keep it):** get the exact current tool name list from
`serena tools list --all` before editing the YAML — tool names have changed across releases (e.g.
`search_files`/`list_dir` naming has shifted in different doc snapshots) — and paste that captured
list into a memory once, so it isn't re-discovered every time the topic comes up.

[^1]: oraios.github.io/serena, "Connecting Your MCP Client": *"We also recommend disabling the
following built-in tools for optimal performance... Serena offers better alternatives to these
basic tools. If you do prefer to use the built-in tools instead, you should disable corresponding
Serena tools instead to prevent context bloat."*
[^2]: github.com/oraios/serena, issue #636, "Cannot exclude `create_text_file` and
`execute_shell_command`" — confirmed hard failure at startup, not a soft warning.

---

## 2. Context and mode — pick one deliberately, don't inherit a default

Serena's tool surface is controlled by two orthogonal settings that this project's config never
sets explicitly: **context** (`desktop-app`, `ide-assistant`, `agent`, `claude-code`, ...) and
**modes** (`planning`, `editing`, `one-shot`, `no-onboarding`, ...). `desktop-app` is the *default*
context and assumes the host has *no* prior coding capability, so it exposes Serena's full tool
list including all the basic file/shell tools this project has deliberately decided to route to
Desktop Commander instead[^3]. Since this project always pairs Serena with Desktop Commander, that
default is a mismatch — `excluded_tools` (section 1) is the correct lever to compensate given
`desktop-app` is the operative context in Claude Desktop's local-agent-mode, but it's worth stating
explicitly in `project.yml` rather than leaving it implicit, so a future session doesn't "fix" the
apparent redundancy by re-adding tools DC already owns.

Two mode additions worth considering, both low-risk and reversible via `switch_modes` mid-session:
- **`no-onboarding`** as a `default_mode` — onboarding has already been performed and the memory
  graph is mature; this only skips a redundant onboarding pass Serena would otherwise be free to
  re-trigger, it does not disable anything the project needs.
- Do **not** add `one-shot` as a default — it's meant for single-response planning/report tasks,
  and this project's sessions are long, multi-turn engineering sessions.

[^3]: oraios.github.io/serena, "Configuration": *"desktop-app: Tailored for use with desktop
applications like Claude Desktop. This is the default. The full set of Serena's tools is provided,
as the application is assumed to have no prior coding-specific capabilities."*

---

## 3. Memory-file hygiene — prevent the graph from becoming a second gate_hazards dump

`mem:memory_maintenance` already states the right *style* rule (dense invariants, not prose) and
the right *threshold* rule (durable conventions only, not one-off task notes). Two additions close
a gap the current files already show signs of:

**3a. Read-only pins for the stable graph nodes.** `read_only_memory_patterns` (a project.yml key
this project has never populated) exists specifically to stop accidental edits to memories that
are meant to be structural anchors, not living logs. Good candidates: `core`, `tech_stack`,
`conventions`, `memory_maintenance` — these describe things that change on a release cadence, not
a session cadence. **Do not** include `execution_environment`, `gate_hazards`,
`windows_gate_ops`, or `task_completion` in this list — those are exactly the living
incident/mechanics logs that need to stay editable.

**3b. Time-box "unverified" entries.** `mem:execution_environment`'s own "Unverified speed ideas"
section is a good instinct (label speculation as speculation) but has no expiry. A note that stays
"unverified... not yet tried" across many sessions is functionally dead weight — either it gets
tested and promoted to a normal invariant (as the svelte fix already demonstrates the right
pattern for), or it gets tried and removed, or it gets removed for being untried after a defined
number of sessions. Add one line to `mem:memory_maintenance`: *any entry under an "unverified" /
"speed idea" heading must be dated; if it is still unverified after 3 sessions that touched this
project, delete it rather than let it accumulate.*

**3c. Compress resolved incidents instead of archiving them forever at full detail.** The svelte
double-indexing writeup in `mem:execution_environment` is a good forensic record, but once a fix
has held for multiple sessions (as it now has), the *investigation narrative* (evidence sweeps,
line-number caveats, "do not go hunting for a `- svelte` line") stops being agent-actionable and
should collapse to the single invariant that matters going forward: *`language_servers:` is
`typescript, powershell` — do not re-add `svelte`, there are no `.svelte` files in this repo.* Move
the rest to a commit message or `git blame`-recoverable history, not permanent memory. This is the
concrete application of `mem:memory_maintenance`'s own "avoid... rationale... unless it prevents
likely mistakes" rule — right now the rationale is being kept in full even after it has already
prevented the mistake once and been confirmed durable.

---

## 4. Session-continuity: use Serena's own handoff tool, not just ad hoc CLAUDE.md notes

Serena ships a tool for exactly the failure mode `execution_environment.md` describes ("a full
session was lost to slowness / a stale assumption") from the other direction — running out of
context mid-task. `prepare_for_new_conversation` builds a structured summary of progress and
writes it to a memory for the next session to pick up[^4]. This project already has a bespoke
`apex-resume` skill doing the same job by convention (verify authoritative path, check
file/marker/hash evidence, identify the unfinished task) — the two should be explicitly linked:
**before ending any session that hit context pressure or is stopping mid-task, call
`prepare_for_new_conversation` if it's present in the active tool list, and have `apex-resume`'s
first step read that memory alongside its existing evidence checks**, instead of relying solely on
the next session correctly inferring state from `CLAUDE.md` edits.

Caveat, also sourced rather than assumed: this tool is **excluded by default in the
`ide-assistant` context** (a filed upstream issue asks why, unresolved as of that report)[^5] — so
first confirm it's actually in the active tool list for whatever context this project's Claude
Desktop session is running under before depending on it; don't assume availability from the tool's
existence in the docs.

[^4]: Serena README / tool docs describe `prepare_for_new_conversation` as writing a continuation
summary to a memory for a fresh session to resume from.
[^5]: github.com/oraios/serena, issue #637, "why is `prepare_for_new_conversation` excluded in
`ide-assistant` context?" — confirms the exclusion is real and by design in that context, not a
bug, but also that it is *not* universal across contexts.

---

## 5. Rewritten root `CLAUDE.md` section

Replace the current "Agent operating rules" block's tool-order paragraph with a pointer, and fold
in the above:

```markdown
## Agent operating rules — read this before choosing how to work

**Probe the execution surfaces first, in ONE batched call. Never infer availability from memory or
from a previous session.**
- `mcp__desktop-commander__start_process("node -v")` — native Windows execution available?
- `mcp__workspace__bash("ls -d /sessions/*/mnt/*/")` — is the project mounted in the Linux sandbox?

**Preference order for file work (fastest first)** — canonical here; `mem:execution_environment`
references this section instead of restating it:
1. Desktop Commander — batch reads, grep, edits, and the only surface that runs `tsc` /
   `test:unit` / `build` / `verify` natively.
2. `mcp__workspace__bash` — only when genuinely mounted.
3. Serena — symbol navigation, targeted symbolic edits, and its memory graph. One file per
   round-trip; never bulk reading. Non-symbolic Serena tools that duplicate Desktop Commander
   (`list_dir`, `find_file`, `read_file`, `replace_regex`, `insert_at_line`, `delete_lines`,
   `replace_lines`) are excluded in `.serena/project.yml` — do not re-add them, and do not attempt
   to exclude `create_text_file` or `execute_shell_command` (Serena fails to start if you do).

**Before ending a session that hit context pressure or stops mid-task:** call
`prepare_for_new_conversation` if present in the active tool list, in addition to the usual
`apex-resume` handoff notes.

**Do not** let a Serena memory entry stay flagged "unverified" past 3 sessions — promote it,
retire it, or delete it.
```

---

## 6. What was deliberately left unchanged

- `windows_gate_ops.md`, `gate_hazards.md`, `task_completion.md`, `local_agent_mode_tool_surface.md`
  are exactly the kind of living incident/mechanics record memory is for — no governance issue
  found there beyond the general time-boxing rule in §3b.
- `project.yml`'s `activation_command`, `ls_workspace_folders`, `ignored_paths` — no evidence in
  the uploaded files that these are misconfigured; left as-is.
- The svelte language-server removal itself — correct, sourced, already verified; only its
  *write-up length* is flagged in §3c, not the fix.
