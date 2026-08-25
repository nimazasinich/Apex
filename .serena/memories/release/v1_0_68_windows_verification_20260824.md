# v1.0.68 Windows release verification — full PASS (2026-08-24)

## Outcome
`npm run release:package` exit **0**, which internally ran the entire `npm run verify` chain. Every canonical gate
green on native Windows. Measured numbers from this run:

- `test:unit` — 130 files / **758 tests** passed, 10.10s. (Older recorded baselines of 125/701 and 130/756 are stale.)
- `build` — PASS. `test:runtime` — PASS, all 14 children (~10 min; `qa:comprehensive-simulation` nests
  `qa:generate-simulation-data`).
- `check:source-contracts` — PASS, exit 0 in **58.7s**, all 28 children (root-contract 39 entries,
  api-contract 136/136 routes, build-identity).
- `test:visual` (`qa:ui-1368`) — PASS, exit 0, 26.5s, `passed:true failures:0 pageErrors:0 consoleErrors:0`.
- `test:browser` (`qa:workspace-runtime`) — PASS, `{"failures":0,"warnings":156,"routeChecks":60}`, `strict=true`.
- `verify:visual` = `qa:ui-1368 && qa:workspace-runtime` — definitionally satisfied by the two above.
- `release:gate`, `release:verify-artifacts` — PASS.

Build identity: buildId `4b45b635-12b7dba2`, sourceHash `12b7dba2f8b9`, commit `4b45b635e8e4`, dirtyTree `true`.

## Release artifacts — SHA-256 independently recomputed and matching CHECKSUMS.sha256
`_release/` (v1.0.67 archives also present and preserved — unrelated prior work):
- `apex-unified-terminal-v1.0.68.zip` 5,154,323 B — `627373c87258d57b1367e91c3727e31ad634c904c14ea19c4923808b361ad198`
- `apex-unified-terminal-v1.0.68-build.zip` 4,224,633 B — `751c5f638374eba1b9ceab1c480ce5ef768e1da5e7cd069868fbc4aa18f648f2`
- `apex-unified-terminal-v1.0.68-evidence.zip` 32,472,979 B — `995f2ab2e07a444b5050acc7c3d17db139ebc192c01f93ef1396e93e833c3a63`

## OPERATIONAL HAZARD — Desktop Commander kills the process tree at the 600s tool-call timeout
This wasted ~25 minutes. Two `npm run test:browser` attempts each stopped writing **exactly 600s** after launch,
which looks identical to a hung gate but is DC reaping its child tree when the tool call times out.
**Rule: any gate that can exceed ~9 minutes must be launched detached**, e.g.
`Start-Process powershell -ArgumentList '-NoProfile','-Command',$cmd -PassThru -WindowStyle Hidden`
with the command redirecting `*>` to a `$env:TEMP` log, then poll the log from separate short calls.
Detached runs survive the parent call returning.

Second effect: piping a gate's output through DC is **dramatically slower** than redirecting to a file in a
detached shell — `test:browser` took 2.7 min detached vs >10 min (unfinished) synchronously through DC.

Caveat on the detached pattern: the wrapper's trailing `"EXIT=$LASTEXITCODE" | Out-File` line failed to appear
twice, even though the gate itself completed. Do not treat a missing exit file as failure — read the gate's own
artifact instead (`test-results/workspace-runtime/workspace-runtime-report.json`) and its exit rule
(`verifyWorkspaceRuntime.mts:617` = `process.exit(STRICT && failures.length ? 1 : 0)`).

## OPERATIONAL HAZARD — orphaned qa-server squats ports 3210 / 24678
A killed gate leaves `tsx server.ts` alive; the next run logs
`WebSocket server error: Port 24678 is already in use` and degrades into a slow retry loop with no progress
output. Clean up before re-running, and verify with `Get-NetTCPConnection -State Listen -LocalPort 24678,3210`.

**The cleanup filter MUST exclude MCP node processes.** The filesystem MCP server's command line contains
`C:\project`, so a naive "kill node where CommandLine matches the project path" also kills your own tooling.
Working exclusion regex:
`server-filesystem|desktop-commander|@playwright[\\/]mcp|sequential-thinking|serena|language_servers|\.mcp-runtime|_npx`

## Do not mistake this coincidence for gate-weakening
`qa:workspace-runtime` findings totalled 156 on both 2026-08-19 (136 warn + 20 fail) and 2026-08-24
(156 warn + 0 fail). The 20 containment failures were genuinely fixed, NOT reclassified: line 329 still pushes
containment as `kind: 'failure'`, and the 08-24 report has zero findings matching `containment` — all 156 are
`Request failed` warnings from line 335. Coverage: 15 routes x {1368x753 light+dark, 1280x720 light,
1024x768 light} = 60 routeChecks.
