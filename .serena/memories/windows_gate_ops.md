# Windows Gate Operations (how to actually run & observe long gates)

Applies to any canonical gate driven through Desktop Commander on the Windows host. Tool division and the fixed-port co-tenant rules live in `mem:execution_environment`.

## Correction for local-agent-mode (Claude Desktop) sessions
`mem:local_agent_mode_tool_surface` corrects and extends this file for Claude Desktop's local-agent-mode host specifically — most notably, the "Playwright MCP resolves relative screenshot paths to its own session uploads dir" claim further down this file is WRONG on that host (it resolves to the repo root instead, which trips `check:root-contract`). Also covers viewing an image on that host, which MCP tools are broken there, and PowerShell `$`-token expansion traps specific to `desktop-commander`. Read it first if this session is running in local-agent-mode.

## Launching
**Always launch long gates DETACHED via `Start-Process`; never via a plain DC `start_process` redirect.** A DC call that outlives the MCP request cap destroys the DC session, and the redirect's file handle is owned by the `cmd` that session spawned — so the log freezes at the exact byte where the session died and no further output ever lands, even though the npm tree keeps running and progressing. Net result of getting this wrong: a full 20-minute run produces zero usable verdict.

```powershell
$inner = 'cd /d "<ROOT>" && npm run <gate> > "<LOG>" 2>&1 & echo APEX_EXITCODE=!errorlevel! >> "<LOG>"'
Start-Process -FilePath 'cmd.exe' -ArgumentList '/v:on','/c',$inner -WindowStyle Hidden -PassThru
```
`/v:on` + `!errorlevel!` is required — `%errorlevel%` expands once at parse time and always prints 0.

**`Start-Process` is NOT detached enough (verified 2026-08-23).** When an MCP call exceeds the host cap the DC session is *restarted*, and the restart kills DC's entire spawned process tree — `Start-Process` children included. The gate then dies mid-run and the corpse looks exactly like a gate defect: three consecutive `verify:visual` attempts died at `page.goto … /#/help net::ERR_CONNECTION_REFUSED`, i.e. the harness server vanished under a still-running Playwright, and the death timestamps matched the DC restart times to the second. **Attribution rule: before believing a mid-run harness connection refusal is a gate bug, compare its timestamp against the DC restart times.** For any gate longer than one MCP call, spawn via WMI, which survives:
```powershell
Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{
  CommandLine = 'powershell.exe -NoProfile -ExecutionPolicy Bypass -File "<TEMP>\run-<gate>.ps1"' }
```
That launcher runs the canonical npm script verbatim and appends `<GATE>_EXIT=$LASTEXITCODE` to its own marker file. Then poll the marker with short, **non-sleeping** calls — a long `Start-Sleep` poll is itself what triggers the cap and kills the run.

Logs go OUTSIDE the repo (`$env:TEMP\apex-gates\<gate>.log`). A stray file at repo root fails `check:root-contract`, a `check:source-contracts` child.

Keep any single MCP call ≤ ~80s: launch with a short `timeout_ms` to capture the PID, then poll. `read_process_output` with the default offset re-dumps the whole buffer — tail with `offset:-40`.

## Reading progress
**Track progress from the PROCESS TREE, not the log.** Redirected Node stdout is block- not line-buffered, so a log can sit many minutes and hundreds of lines behind reality; a frozen log is NOT evidence of a hang.

```powershell
Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -like '*npm-cli*run*' } |
  ForEach-Object { if ($_.CommandLine -match 'run\s+([\w:.-]+)') { 'npm:' + $matches[1] } }
```
Because `verify` chains with `&&`, **seeing a later gate running is positive proof every earlier gate exited 0** — the cheapest reliable progress signal available. Avoid `Get-Process | Where StartTime` and `ManagementDateTimeConverter::ToDateTime` (throw on some processes). `list_processes` output is malformed (columns misaligned, Command blank) — useless for finding node/chromium; use `Get-NetTCPConnection` or `netstat -ano | findstr :PORT` instead. `Get-NetTCPConnection` works even though `net`/`netsh` are in DC's `blockedCommands` — that block is token-based on the first word only.

**Never infer elapsed wall-clock time from your own `Start-Sleep` durations.** MCP round-trip latency dwarfs the sleeps; derive elapsed from the log file's `CreationTime`. Sanity-check a suspiciously fast chain by grepping for the expensive steps' own evidence (`Test Files … passed`, `modules transformed`, the autopilot gate's "two cycles need at least 120s" banner), not from the clock.

**A long silence is not a hang.** `qa:autopilot-lifecycle-runtime` prints its START assertions then goes silent for many minutes while waiting out real scheduler cycles. Liveness proof: its harness server listens on 4599 and its CPU creeps upward from 1s status polling. Do NOT diagnose it by reading `GET /api/strategies/autopilot/status` mid-run — after the harness's final STOP the controller legitimately reads `phase:OFF, phaseReason:NOT_ARMED, cyclesStarted:0, nextRunAt:null`, which looks exactly like "the scheduler never fired" and is a long false trail. A transient `Unable to connect` on 4599 mid-run is also normal.

## Judging the result
**The only authoritative verdict is the `APEX_EXITCODE=` marker** the launcher appends. Failure-greps are navigation, never judgment: a `FAILED|^FAIL |npm error` sweep over a *green* log matches JSON counters (`"GATE_OBI_FAILED": 639`), deliberate offline fixtures (`[Proxy Route] all routes failed for …`), zero counters (`"failed": 0,`) and PASS lines whose text merely contains "failed".

Gate verdicts print as a JSON block at the very end: `{failures,warnings,routeChecks}` for `qa:workspace-runtime`, `{passed,failures,pageErrors,consoleErrors}` for `qa:ui-1368`. `warnings` are non-fatal — STRICT fails only on `failures`. Never set `APEX_QA_STRICT=0`; that is gate-lowering. Detail beyond the summary lives in `test-results/workspace-runtime/workspace-runtime-report.json` plus per-route PNGs.

Harmless recurring noise in the visual/browser gates: `WebSocket server error: Port 24678 is already in use` (Vite HMR default WS port; HMR is off) and `POST /api/decision-memory/batch → 503` (endpoint unavailable in that env). Neither is counted by the gates.

Rough budget on this box: full `verify` ≈ 6.5 min, of which lint + check:test-inventory + test:unit + build is only ~45s; `qa:autopilot-lifecycle-runtime` alone is ~120s minimum.

## Quoting traps (each has cost a silent no-op)
- DC `start_process` runs its command through `powershell.exe`. **Do NOT wrap as `powershell -NoProfile -Command "…"`** — the shell is already PowerShell, the outer pass strips every `$var`, and you get a wall of "You must provide a value expression following the '+' operator". Pass raw PowerShell as the `command` string and `$` survives.
- **Do NOT put escaped `\"` inside a `cmd /c "…"` wrapper passed through DC.** PowerShell consumes the escapes first and the remaining bare text is parsed as PowerShell, so `git commit -m \"tooling(gates): …\"` dies on an unrelated token (`(` / `;` become PowerShell syntax) and **nothing is committed, silently**. Fixes: (a) native PowerShell with **single**-quoted args — `git commit -m 'subject' -m 'body'`, `node script.mjs '--evidence=free text'`; (b) for anything long or multi-line, write it to a file and use `git commit -F <file>` / `node <file>`. Always echo `$LASTEXITCODE` and re-read `git log -1` afterwards, because this failure mode looks like a no-op rather than an error.
- PowerShell 5.1 rejects `if` inline inside string concatenation (`'x=' + (if …)`); use `$(if …)` or assign first.
- Playwright MCP resolves relative screenshot paths to its own session uploads dir, which the built-in Read tool cannot reach. Copy the PNG into the readable outputs dir before viewing.
