# apex-host-runner — MCP server for running the real APEX toolchain

## Why this exists

An agent working on this repo through a Linux sandbox can read every file but cannot
execute the toolchain. `node_modules` here was installed on Windows, so the only
platform binaries present are:

```
rollup natives:   rollup-win32-x64-gnu, rollup-win32-x64-msvc
esbuild natives:  win32-x64
```

Anything that goes through Rollup or esbuild — `vitest`, `vite`, `tsx`, and therefore
`npm run test:unit`, `npm run build`, `npm run verify`, and all 32 tsx-based scripts —
fails there with `Cannot find module @rollup/rollup-linux-x64-gnu`. Installing the Linux
binary is not possible either; the sandbox has no registry access (`npm error code E403`).

The practical consequence is that an agent in that environment can only ever *guess*
whether the tests pass. This repo's own history shows what that produces: 30+ status
reports claiming PASS for work that was never run.

This server closes that gap. It runs on the Windows host, where `node_modules` is
correct, and gives the agent a narrow way to execute the real verification chain and read
the real exit codes.

## Safety model

The design assumption is that the caller may be wrong, confused, or over-eager, and the
server should still be unable to do damage.

- **No arbitrary shell.** Only npm script *names* that appear in the allowlist inside
  `server.mjs` can run. `apex_run_script` with `{"script": "rm -rf /"}` is refused
  before anything is spawned.
- **The allowlist is verification-only.** Typecheck, tests, build, gates, QA and
  read-only inspection. Nothing that deletes files, writes a release archive, mutates
  persisted datasets or model state, changes risk thresholds, or contacts an exchange.
- **Destructive scripts are explicitly denied with a reason**, so the caller is told
  *why* rather than silently failing over to some workaround. `clean`, `clean:artifacts`
  and `qa:cleanup` are denied under this repo's standing no-delete rule; `release:package`,
  `ml:train`, `sync:decision-memory`, `import:deribit-options-history` and
  `manage:liquidity-hunter-thresholds` are denied as mutating.
- **Trading is forced off in the child environment**: `APEX_TRADING_ENABLED=0`,
  `APEX_LIVE_EXECUTION=0`, `APEX_AUTONOMOUS_EXECUTION=0`.
- **Hard timeouts** per script, SIGKILL on expiry, and head+tail output truncation at
  24,000 characters so a runaway log cannot flood the context window.
- **Long-lived servers are denied** (`dev`, `dev:server`, `start`) — the agent should not
  own the lifetime of a process you cannot see.

## Tools

| Tool | Purpose |
| --- | --- |
| `apex_list_scripts` | The allowlist with each script's real command and timeout, plus the denied list and the reason for each. A `!` marks a script allowlisted here but missing from `package.json`. |
| `apex_run_script` | Run one allowlisted script; returns real exit code, duration, stdout and stderr. |
| `apex_env_report` | Node/npm versions, repo root, package version, presence of `node_modules`/`dist`, and which rollup/esbuild platform binaries are installed. |

## Installation

Requires Node 18+ on the host. No dependencies, no install step, no build.

Add to `claude_desktop_config.json`:

- Windows: `%APPDATA%\Claude\claude_desktop_config.json`
- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "apex-host-runner": {
      "command": "node",
      "args": [
        "C:\\project\\APEX-frontend-phase31\\APEX-unified-maximal-v1.0.56-r2-merged-source\\APEX-unified-maximal-v1.0.56-r2-merged\\tools\\mcp\\apex-host-runner\\server.mjs",
        "--repo",
        "C:\\project\\APEX-frontend-phase31\\APEX-unified-maximal-v1.0.56-r2-merged-source\\APEX-unified-maximal-v1.0.56-r2-merged"
      ]
    }
  }
}
```

Note the doubled backslashes — JSON string escaping, not a typo. If the file already has
an `mcpServers` object, add `apex-host-runner` as another key inside it rather than
replacing it.

**Restart the desktop app.** MCP servers are registered at startup; the tools will not
appear until you do.

## Verifying it works without the desktop app

The server speaks newline-delimited JSON-RPC on stdio, so you can drive it from a shell:

```bash
printf '%s\n' \
  '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{}}}' \
  '{"jsonrpc":"2.0","id":2,"method":"tools/list"}' \
  '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"apex_env_report"}}' \
  | node tools/mcp/apex-host-runner/server.mjs --repo .
```

A healthy host prints `rollup natives: rollup-win32-...` **and** the Linux/darwin variant
matching wherever you run the tests. If `apex_env_report` shows only foreign-platform
binaries, fix that before interpreting any test failure as a code defect.

## Repo root resolution

In order: `--repo <path>` argument, then `APEX_REPO_ROOT`, then three directories up from
`server.mjs`. Passing `--repo` explicitly is recommended — it is unambiguous and survives
the file being moved.

## Adding a script to the allowlist

Adding an entry is a security decision, not a formality. Before adding, confirm the
script does not delete files, does not write outside `QA/` or `dist/`, does not mutate
persisted state under `data/`, and does not authenticate to an exchange. If it fails any
of those, put it in `DENIED_SCRIPTS` with a one-line reason instead.
