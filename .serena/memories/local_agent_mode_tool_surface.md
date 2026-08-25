# Local-agent-mode tool surface: what actually works (corrects `mem:windows_gate_ops`)

Verified 2026-08-23 in Claude desktop "local agent mode" against this project. A companion note, "why tools appear broken", was previously cited here as an auto-memory (`reference_claude_app_mcp_gating`) belonging to Claude Desktop's own separate project-memory feature, not Serena — it is not part of this project's Serena memory graph and cannot be read via `read_memory`. If that context is still needed, it must be pulled from Claude Desktop's project-memory UI directly, not from Serena.

## CORRECTION to `mem:windows_gate_ops`

That memory says *"Playwright MCP resolves relative screenshot paths to its own session uploads dir"*.
**That is wrong in this host.** A relative `filename` resolves to the **repository root**, i.e.
`browser_take_screenshot({filename: 'shot.png'})` writes
`...\APEX-Unified-Terminal-v1.0.68-LATEST-PATCHED-SOURCE-20260815\shot.png`.

That is the **`check:root-contract` stray-root-file hazard** — it will fail the gate. Always either pass an
absolute path inside the allowed roots, or move the file out immediately afterwards.

Playwright MCP allowed roots are exactly two:
- the repo root
- `<repo>\.playwright-mcp`  (where `browser_snapshot` .yml and `browser_console_messages` .log land)

Anything else (including `%TEMP%`) is rejected with *"File access denied: ... is outside allowed roots"*.

## Viewing an image produced on Windows

The built-in `Read` tool is **scratch-only** here — it refuses any path outside
`C:\Users\Dreammaker\AppData\Local\Claude-3p\local-agent-mode-sessions\b3b3a33d\00000000\<sessionId>\outputs\`.
Discover that dir by `Write`-ing a probe file and locating it with
`Get-ChildItem -LiteralPath 'C:\Users\Dreammaker\AppData\Local\Claude-3p\local-agent-mode-sessions\b3b3a33d' -Recurse -Filter 'probe.txt'`.

Working recipe: screenshot to the repo root (or `.playwright-mcp`) → `Move-Item` into that `outputs\` dir →
`Read` it with a **bare filename**. `Move-Item` (not Copy) also clears the root-contract violation in one step.

## Broken MCP tools in this host — do not retry, route around

`mcp__filesystem__*` tools that return content fail hard with:
*"invalid outputSchema: JSON Schema declares an unsupported dialect (draft-07). The default validator supports
JSON Schema 2020-12 only"*. Confirmed dead: `read_media_file`, `list_directory`. Assume the whole
`filesystem` server is unusable for reads. Use `desktop-commander` PowerShell or Serena instead.

## PowerShell quoting through `mcp__desktop-commander__start_process`

The outer layer **expands `$`-tokens before PowerShell sees them**, so `$_`, `$root`, `$env:TEMP` inside the
`-Command` string get substituted or blanked. Symptoms: `"The term '=' is not recognized"`,
`"The term '.Name' is not recognized"`, `"Missing an argument for parameter 'LiteralPath'"`.

Rules that work:
- Use **literal absolute paths**; never `$env:...` or user variables inside `-Command`.
- Never use `$_` — replace `ForEach-Object { $_.Name }` with `Select-Object Name, Length | Format-List`.
- `\"` inside the command breaks the tokenizer (*"The string is missing the terminator"*) — use single quotes.

## Other

- Recursive `Get-ChildItem` over `$USERPROFILE` or `C:\project` **times out** and can take the whole
  desktop-commander server down (*"Server desktop-commander unavailable"*). It recovers on the next trivial
  call. Always scope recursive searches to a specific known subtree.
- `mcp__playwright__browser_evaluate` returning one large JSON object is by far the most token-efficient way
  to gather geometry — batch every measurement into a single call.
