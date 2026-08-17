---
name: apex-windows-engineering
description: Use at the START of every session working on Windows-hosted APEX/Dreammaker projects through Claude Code Desktop with a third-party MCP provider. Establishes real tool capability (Windows write/execute vs. Linux read-only sandbox vs. blocked MCP connectors) BEFORE any file edit or build attempt, and dictates which of three fixed operating modes to use. Trigger whenever the user mentions C:\project\..., a Windows host, desktop-commander, FileOps.ps1, or reports environment confusion / MCP tool errors.
---

# APEX Windows Engineering — Environment Contract

## Why this file exists

Every session in this setup independently "discovers" the same three facts,
burns 5-10 tool calls doing it, sometimes gets it wrong, and mixes up which
environment a command actually ran in. This skill exists so that discovery
happens ONCE per session, in a fixed order, and the result is treated as a
hard fact for the rest of the session — not re-probed after every error.

## The three environments — know these before touching anything

1. **The real Windows host** (`C:\project\...`). This is the only place that
   matters for the user. Node modules here are `win32-x64` native binaries —
   npm/vitest/build/playwright can ONLY run here.
2. **A Linux sandbox** with the Windows project **mounted read-only**
   (permissions like `dr-x------`). The built-in `Bash` tool executes here,
   not on Windows. `node_modules` here (if present) are foreign-arch and
   cannot run real builds/tests — `tsc --noEmit` is the one exception, since
   it's pure JS and needs no native binary.
3. **The MCP connector layer**, provided by the org's third-party router.
   This is what's supposed to bridge into the real Windows host for
   execution and writes (e.g. `desktop-commander`, `filesystem`). It is
   controlled by the router/admin, not by anything Claude or a skill can do.

**Critical fact: writing `FileOps.ps1` (or any script) onto the Windows disk
does not create an execution channel.** A script is inert unless some tool
call can actually invoke `powershell.exe` on the real host. The built-in
`Bash` tool cannot do this — it runs in environment #2, where
`powershell.exe` does not exist. Only environment #3 (if the connector is
actually enabled) can run processes on Windows. No skill, prompt, or script
can substitute for a missing execution tool.

## Step 0 — Mandatory capability probe (run once, cache the result)

Before any plan, run exactly these probes, in this order, **once**:

| # | Probe | What it tells you |
|---|---|---|
| 1 | Built-in `Read` on a known file under `C:\project\...` | Does Read reach the real Windows host? |
| 2 | Built-in `Write` of a 1-line file to a **throwaway** path under the same `C:\project\...` tree (e.g. `_claude_probe.tmp`), then delete it | Does Write reach the real Windows host, or is it permission-denied? |
| 3 | Any MCP execution tool (`desktop-commander.start_process`, etc.) running a no-op like `echo ok` | Is Windows process execution available at all? |
| 4 | Built-in `Bash`: `pwd && uname -a` | Confirms sandbox identity (should NOT claim to be Windows) |

Do each **once**. Do not retry a failed probe more than **one** time. Record
the outcome as one of three modes and state it explicitly to the user in
your first reply:

- **Mode A — Full capability**: Read + Write + Execute all reach Windows.
  Proceed with the normal edit/build/test loop directly on
  `C:\project\...`.
- **Mode B — Read/Write only, no execute**: Write reaches Windows but no
  tool can run processes there. You can edit files directly, but you
  **cannot** run npm/tsc/vitest/build yourself. State this to the user up
  front and either (a) use the Linux mount's `tsc --noEmit` as partial,
  non-authoritative evidence, or (b) hand the user a short exact command
  list to run themselves and paste back the output.
- **Mode C — Read-only**: Write and/or Execute are denied or the MCP
  connector reports "disabled in connector settings" /
  "classifier temporarily unavailable". **Do not loop retrying these.**
  Switch immediately to diagnostic mode: read what you need from the real
  path, produce your fix as an exact patch (diff-style old→new blocks, one
  per file, copy-pasteable), and tell the user plainly that Write/Execute
  are unavailable this session — this is an admin/connector-side toggle,
  not something fixable by writing a script or skill. Point them at the
  specific error string so they can raise it with whoever manages the
  MCP connector.

## Reading the error strings correctly

| Error text | Meaning | Correct response |
|---|---|---|
| `disabled in connector settings` | An admin/org toggle for that MCP connector is off. | Not retryable. Tell the user; do not keep probing this tool. |
| `<model> is temporarily unavailable, so auto mode cannot determine the safety of <tool>` | The desktop app's **auto-mode safety classifier** is down — a single shared gate that every non-native MCP call (Desktop Commander, filesystem MCP, any other MCP server) routes through, **including read-only calls**. This is not per-connector; it's app-wide. | Confirm it's this shared outage, not a per-connector issue, with **at most 2 probes total** (one MCP tool call on each of at most two different servers — not 3+ retries on the same one). The instant you see this identical message from a second independent server, stop probing MCP entirely for the rest of the session and go straight to the stage-and-handoff fallback below. Retrying a 3rd, 4th, 5th time burns turns for zero new information — the classifier being down isn't something any tool call will change. |
| `classifier temporarily unavailable` (connector-specific, e.g. Desktop Commander's own) | Router-side transient block, scoped to that one connector. | Retry **once** after a pause. If it fails again, treat as unavailable for the rest of the session — don't re-test every few turns. |
| `denied by permission settings` (built-in Write/Edit) | Claude Code's own workspace permission/allowed-paths config doesn't cover this folder — check whether it's scoped to a subfolder (e.g. `.claude/`) or the *entire* project tree by probing both once. | Tell the user to add the path in Claude Code's permission settings; this is separate from the connector/classifier issues above and won't be fixed by MCP changes or waiting. |
| Linux mount write attempt (`Read-only file system`) | Expected — the mount is intentionally read-only. | Not a bug. Never try to write through the Linux path. |

**Retry budget, stated plainly:** across Step 0 and any later write/execute attempt, you get at most **2 attempts per distinct channel** and **at most 2 channels** before you must stop and switch to the fallback below. If you notice you're about to make a 3rd call to the same blocked tool, or you've already tried both Desktop Commander and a second MCP server with the identical classifier error, that is the stop signal — not a coincidence to route around.

## The stage-and-handoff fallback (Mode B/C, when Write/Execute are blocked)

Don't just print a text diff and hope the user retypes it. The task's own
`outputs`/scratchpad location (the directory backing `present_files` /
file-creation in Claude Code Desktop) is itself a **real path on the Windows
host** — it's just outside the project tree, so it isn't hit by the
project-scoped permission deny. Use it:

1. Write the finished, complete file(s) there (native Write works fine
   outside the denied project path).
2. Give the user **two** copy-pasteable PowerShell blocks, generalized with
   variables so they work regardless of the exact staged path or target:
   - A **copy** block: creates the destination folder(s) and copies each
     staged file to its real destination under `C:\project\...`.
   - A **verify** block: checks each destination file exists, is non-empty,
     and (for text/config files) contains the specific markers you actually
     care about — don't just check existence.
3. Tell the user plainly this is a one-time manual step caused by a
   session-side block, not something they need to repeat every time.

This is strictly better than a raw diff: it's copy-paste-once, it's already
byte-verified on your end before handoff, and the verify block catches a
bad copy immediately instead of surfacing later as a mysterious bug.

## Never do this

- Don't re-run the same failed MCP probe more than once per session hoping
  it recovered — cache the Mode from Step 0 and act on it.
- Don't alternate between multiple MCP servers hoping a *different* one is
  unaffected once you've already seen the shared auto-mode classifier
  error on one — if a second server gives the identical message, that
  confirms it's shared, not per-server; stop probing MCP altogether.
- Don't check for an existing `.claude/skills/apex-fileops/` (or similarly
  named) skill before creating a new one — if it's already there from a
  prior session, update it in place rather than duplicating it under a
  second name.
- Don't attempt `Bash` commands assuming they land on Windows (they don't —
  see environment #2 above).
- Don't treat a script sitting on the Windows disk as proof you can execute
  it. Presence ≠ an execution channel.
- Don't silently fall back to editing the Linux mount and call it done —
  it's read-only and, even if it weren't, is a shadow copy, not the host
  the user actually runs.

## FileOps.ps1 — what it's actually for

`FileOps.ps1` (bundled below/alongside this skill) is a solid, dependency-free
alternative to MCP file tools — but it only helps in **Mode A**, where some
tool can already run `powershell.exe -File FileOps.ps1 ...` on the real host
(via a working MCP execute connector). In Mode B/C it has no path to run at
all. In Mode C, its real use is different: paste its `Edit`/`Write` action
as an exact command block for the **user** to run themselves in their own
terminal — i.e. it becomes the handoff format for diagnostic-mode patches,
not something Claude invokes directly.

## First reply of every session, always include:

1. Which Mode (A/B/C) the probe found, in one line.
2. If not Mode A: which specific tool/error caused it, and whether it's
   admin-side (connector) or local-side (Claude Code permissions) — these
   need different people to fix.
3. What you'll do differently as a result (direct edits vs. patch handoff).
