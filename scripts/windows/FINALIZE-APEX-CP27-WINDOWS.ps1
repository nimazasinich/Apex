#Requires -Version 5.1

<#
.SYNOPSIS
  Fail-closed Windows finalization runner for APEX v2.0.1 CP27 merged source.

.DESCRIPTION
  This script executes the work that could not be completed in the restricted Linux
  environment: dependency restore, full TypeScript/Vitest/build verification, canonical
  browser QA, Settings screenshot/diff evidence, provider-backed Autopilot two-cycle
  runtime safety, App Index finalization, build identity, release artifact verification,
  and (only when every mandatory condition is proven) a FINAL release bundle.

  It never converts SKIP/BLOCKED into PASS. In particular, the Autopilot lifecycle
  runtime must report zero SKIP and zero FAIL; an exit code of 0 with network-eligible
  skips is still BLOCKED for FINAL.

  Source prerequisites expected from CP27:
    - dedicated Smart Proxy Settings tab
    - Settings runtime selector moved to smart-proxy
    - captureWorkspaceScreens covers all 8 Settings tabs and executable override
    - Vitest includes .test.tsx
    - Vite build.assetsInlineLimit = 0

.PARAMETER ProjectRoot
  Project root. Defaults to two levels above this script when copied to scripts\windows,
  otherwise the current directory.

.PARAMETER ChromePath
  Path to chrome.exe. If omitted, common Google Chrome locations are probed.

.PARAMETER VisualBaselineDir
  Directory containing pre-Phase-3.6 Settings screenshots named:
    desktop-settings-account.jpg
    desktop-settings-security.jpg
    desktop-settings-appearance.jpg
    desktop-settings-notifications.jpg
    desktop-settings-trading.jpg
    desktop-settings-api.jpg
    desktop-settings-smart-proxy.jpg
    desktop-settings-devices.jpg
  A complete eight-tab baseline is required for automatic FINAL eligibility.

.PARAMETER ApproveVisualDiff
  Use only after manually reviewing the generated overlay/heatmap reports and confirming
  that the differences are intentional and confined to the Settings redesign. Without
  this explicit approval, visual evidence is generated but FINAL packaging is blocked.

.PARAMETER ForceNpmCi
  Force a clean npm ci even if the critical local dev tools already exist.

.PARAMETER RunFullMultiViewport
  Also run the broader workspace browser matrix. It is diagnostic, not the canonical
  release gate. Known Academy-only 1024x768 overflow may be classified as KNOWN_SCOPE.

.PARAMETER SkipLiveAutopilot
  Skip the provider-backed lifecycle test. This always makes the run NON-FINAL.

.PARAMETER SkipVisualDiff
  Skip Settings baseline/diff. This always makes the run NON-FINAL.

.PARAMETER NoPackage
  Do not create release archives even if every mandatory gate passes.

.EXAMPLE
  powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\windows\FINALIZE-APEX-CP27-WINDOWS.ps1 `
    -VisualBaselineDir C:\apex-evidence\phase35-settings-before `
    -ApproveVisualDiff

.EXAMPLE
  powershell -NoProfile -ExecutionPolicy Bypass -File .\FINALIZE-APEX-CP27-WINDOWS.ps1 `
    -ProjectRoot C:\project\APEX-v2.0.1-CP27-LATEST-FULL-PROJECT `
    -ChromePath 'C:\Program Files\Google\Chrome\Application\chrome.exe' `
    -VisualBaselineDir C:\apex-evidence\phase35-settings-before `
    -ApproveVisualDiff -RunFullMultiViewport
#>
[CmdletBinding()]
param(
  [string]$ProjectRoot = '',
  [string]$ChromePath = '',
  [string]$VisualBaselineDir = '',
  [switch]$ApproveVisualDiff,
  [switch]$ForceNpmCi,
  [switch]$RunFullMultiViewport,
  [switch]$SkipLiveAutopilot,
  [switch]$SkipVisualDiff,
  [switch]$NoPackage,
  [int]$ExpectedFontFiles = 92,
  [int]$NpmCiAttempts = 3
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

# Environment fallbacks used by the companion BAT. Explicit PowerShell parameters win.
if (-not $ChromePath -and $env:APEX_PLAYWRIGHT_EXECUTABLE) {
  $ChromePath = [string]$env:APEX_PLAYWRIGHT_EXECUTABLE
}
if (-not $VisualBaselineDir -and $env:APEX_VISUAL_BASELINE_DIR) {
  $VisualBaselineDir = [string]$env:APEX_VISUAL_BASELINE_DIR
}
if (-not $ApproveVisualDiff -and $env:APEX_APPROVE_VISUAL_DIFF -match '^(1|true|yes)$') {
  $ApproveVisualDiff = $true
}


# --------------------------------------------------------------------------------------
# Root / environment
# --------------------------------------------------------------------------------------
$ScriptPath = $MyInvocation.MyCommand.Path
$ScriptDir = Split-Path -Parent $ScriptPath
if (-not $ProjectRoot) {
  $candidate = Join-Path $ScriptDir '..\..'
  if (Test-Path (Join-Path $candidate 'package.json')) {
    $ProjectRoot = (Resolve-Path $candidate).Path
  } elseif (Test-Path (Join-Path (Get-Location) 'package.json')) {
    $ProjectRoot = (Resolve-Path (Get-Location)).Path
  } else {
    throw 'Could not infer ProjectRoot. Pass -ProjectRoot explicitly.'
  }
} else {
  $ProjectRoot = (Resolve-Path $ProjectRoot).Path
}
Set-Location $ProjectRoot

if (-not (Test-Path 'package.json')) { throw "package.json missing under $ProjectRoot" }
if (-not (Test-Path 'REMEDIATION_CHECKPOINTS.md')) { throw 'REMEDIATION_CHECKPOINTS.md missing; wrong project tree?' }
if (-not (Test-Path 'REMEDIATION_CHECKPOINTS.json')) { throw 'REMEDIATION_CHECKPOINTS.json missing; wrong project tree?' }

$Stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$EvidenceRoot = Join-Path $ProjectRoot 'QA\windows-finalization'
$EvidenceDir = Join-Path $EvidenceRoot $Stamp
$LogDir = Join-Path $EvidenceDir 'logs'
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
$Results = [System.Collections.Generic.List[object]]::new()
$MandatoryBlocked = [System.Collections.Generic.List[string]]::new()
$RunStartedUtc = (Get-Date).ToUniversalTime().ToString('o')

function Write-Section([string]$Text) {
  Write-Host ''
  Write-Host ('=' * 92) -ForegroundColor DarkGray
  Write-Host $Text -ForegroundColor Cyan
  Write-Host ('=' * 92) -ForegroundColor DarkGray
}

function Safe-Name([string]$Value) {
  return ($Value -replace '[^A-Za-z0-9_.-]', '_')
}

function Add-Result {
  param(
    [string]$Phase,
    [string]$Name,
    [string]$Status,
    [Nullable[int]]$ExitCode,
    [string]$Detail,
    [string]$LogPath = '',
    [bool]$Mandatory = $true
  )
  $Results.Add([pscustomobject]@{
    phase = $Phase
    name = $Name
    status = $Status
    exitCode = $ExitCode
    detail = $Detail
    log = if ($LogPath) { $LogPath.Substring($ProjectRoot.Length).TrimStart([char]92) } else { $null }
    mandatory = $Mandatory
    timestampUtc = (Get-Date).ToUniversalTime().ToString('o')
  })
  if ($Mandatory -and $Status -notin @('PASS','KNOWN_SCOPE','NOT_APPLICABLE')) {
    $MandatoryBlocked.Add("$Phase / $Name => $Status : $Detail")
  }
}

function Set-ProcessEnvironment {
  param([hashtable]$Overrides)
  $saved = @{}
  foreach ($key in $Overrides.Keys) {
    $saved[$key] = [Environment]::GetEnvironmentVariable($key, 'Process')
    $value = $Overrides[$key]
    if ($null -eq $value) {
      [Environment]::SetEnvironmentVariable($key, $null, 'Process')
    } else {
      [Environment]::SetEnvironmentVariable($key, [string]$value, 'Process')
    }
  }
  return $saved
}

function Restore-ProcessEnvironment {
  param([hashtable]$Saved)
  foreach ($key in $Saved.Keys) {
    [Environment]::SetEnvironmentVariable($key, $Saved[$key], 'Process')
  }
}

function Invoke-LoggedCommand {
  param(
    [string]$Phase,
    [string]$Name,
    [string]$CommandLine,
    [hashtable]$Env = @{},
    [bool]$Mandatory = $true,
    [bool]$RecordResult = $true
  )
  $safe = Safe-Name "$Phase-$Name"
  $stdoutPath = Join-Path $LogDir "${safe}.stdout.log"
  $stderrPath = Join-Path $LogDir "${safe}.stderr.log"
  $combinedPath = Join-Path $LogDir "${safe}.log"
  $saved = Set-ProcessEnvironment $Env
  $started = Get-Date
  try {
    Write-Host "> $CommandLine" -ForegroundColor DarkCyan
    $proc = Start-Process -FilePath 'cmd.exe' -ArgumentList @('/d','/s','/c', $CommandLine) `
      -WorkingDirectory $ProjectRoot -NoNewWindow -Wait -PassThru `
      -RedirectStandardOutput $stdoutPath -RedirectStandardError $stderrPath
    $code = [int]$proc.ExitCode
  } finally {
    Restore-ProcessEnvironment $saved
  }
  $outText = if (Test-Path $stdoutPath) { Get-Content $stdoutPath -Raw -ErrorAction SilentlyContinue } else { '' }
  $errText = if (Test-Path $stderrPath) { Get-Content $stderrPath -Raw -ErrorAction SilentlyContinue } else { '' }
  @(
    "COMMAND: $CommandLine"
    "EXIT_CODE: $code"
    "ELAPSED_SECONDS: $([math]::Round(((Get-Date) - $started).TotalSeconds, 1))"
    '--- STDOUT ---'
    $outText
    '--- STDERR ---'
    $errText
  ) | Set-Content -Path $combinedPath -Encoding UTF8
  if ($outText) { Write-Host $outText.TrimEnd() }
  if ($errText) { Write-Host $errText.TrimEnd() -ForegroundColor DarkYellow }
  if ($RecordResult) {
    if ($code -eq 0) {
      Add-Result $Phase $Name 'PASS' $code 'Command exited 0.' $combinedPath $Mandatory
    } else {
      Add-Result $Phase $Name 'FAIL' $code 'Command returned non-zero.' $combinedPath $Mandatory
    }
  }
  return [pscustomobject]@{ ExitCode = $code; LogPath = $combinedPath; Stdout = $outText; Stderr = $errText; Text = "$outText`n$errText" }
}

function Assert-TextContains {
  param([string]$Path, [string]$Pattern, [string]$Description)
  if (-not (Test-Path $Path)) { throw "Missing prerequisite file: $Path" }
  $text = Get-Content $Path -Raw
  if ($text -notmatch $Pattern) { throw "CP27 prerequisite missing: $Description ($Path)" }
  Write-Host "  OK  $Description" -ForegroundColor Green
}

function Find-Chrome {
  param([string]$Explicit)
  $candidates = [System.Collections.Generic.List[string]]::new()
  if ($Explicit) { $candidates.Add($Explicit) }
  if ($env:PROGRAMFILES) { $candidates.Add((Join-Path $env:PROGRAMFILES 'Google\Chrome\Application\chrome.exe')) }
  $pf86 = [Environment]::GetEnvironmentVariable('ProgramFiles(x86)')
  if ($pf86) { $candidates.Add((Join-Path $pf86 'Google\Chrome\Application\chrome.exe')) }
  if ($env:LOCALAPPDATA) { $candidates.Add((Join-Path $env:LOCALAPPDATA 'Google\Chrome\Application\chrome.exe')) }
  foreach ($candidate in $candidates) {
    if ($candidate -and (Test-Path $candidate)) { return (Resolve-Path $candidate).Path }
  }
  return $null
}

function Get-PortPids([int]$Port) {
  $pids = @()
  try {
    $rows = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction Stop
    $pids = @($rows | Select-Object -ExpandProperty OwningProcess -Unique)
  } catch {
    $lines = & netstat -ano -p tcp 2>$null
    foreach ($line in $lines) {
      if ($line -match "^\s*TCP\s+\S+:$Port\s+\S+\s+LISTENING\s+(\d+)\s*$") {
        $pids += [int]$Matches[1]
      }
    }
    $pids = @($pids | Select-Object -Unique)
  }
  return $pids
}

function Get-ProcessEvidence([int]$OwnerPid) {
  $name = ''
  $path = ''
  $cmd = ''
  try {
    $p = Get-Process -Id $OwnerPid -ErrorAction Stop
    $name = $p.ProcessName
    try { $path = $p.Path } catch { $path = '' }
  } catch { }
  try {
    $wmi = Get-CimInstance Win32_Process -Filter "ProcessId=$OwnerPid" -ErrorAction Stop
    $cmd = [string]$wmi.CommandLine
  } catch { }
  return [pscustomobject]@{ Pid = $OwnerPid; Name = $name; Path = $path; CommandLine = $cmd }
}

function Assert-PortsFree {
  param([int[]]$Ports, [string]$Phase)
  foreach ($port in $Ports) {
    $pids = @(Get-PortPids $port)
    if (-not $pids.Count) {
      Write-Host ('  port {0}: FREE' -f $port)
      continue
    }
    foreach ($ownerPid in $pids) {
      $evidence = Get-ProcessEvidence $ownerPid
      Write-Host ('  port {0}: PID {1} {2} {3}' -f $port, $ownerPid, $evidence.Name, $evidence.Path)
      Write-Host "    $($evidence.CommandLine)"
      $looksLikeThisProject = $false
      if ($evidence.CommandLine -and $evidence.CommandLine.IndexOf($ProjectRoot, [StringComparison]::OrdinalIgnoreCase) -ge 0) {
        $looksLikeThisProject = $true
      }
      if ($looksLikeThisProject) {
        Write-Host "    stopping confirmed current-project listener..." -ForegroundColor Yellow
        & taskkill.exe /PID $ownerPid /T /F | Out-Null
        Start-Sleep -Milliseconds 500
      } else {
        throw "BLOCKED_ENVIRONMENT: port $port is owned by PID $ownerPid and cannot be proven to belong to this project. Free it manually; do not kill an unrelated process."
      }
    }
    $remaining = @(Get-PortPids $port)
    if ($remaining.Count) { throw "BLOCKED_ENVIRONMENT: port $port is still listening after cleanup: $($remaining -join ',')" }
  }
}

function Critical-DependenciesReady {
  $required = @(
    'node_modules\.bin\tsx.cmd',
    'node_modules\.bin\vite.cmd',
    'node_modules\.bin\vitest.cmd',
    'node_modules\vite\client.d.ts',
    'node_modules\typescript\lib\typescript.js',
    'node_modules\playwright\package.json'
  )
  foreach ($path in $required) { if (-not (Test-Path $path)) { return $false } }
  return $true
}

function Finalize-AppIndexSqlite {
  $helper = Join-Path $EvidenceDir 'finalize-app-index-sqlite.mjs'
  @'
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
const root = process.cwd();
const dbPath = path.join(root, 'APP_INDEX', 'app-index.sqlite');
if (!fs.existsSync(dbPath)) throw new Error(`missing:${dbPath}`);
const db = new DatabaseSync(dbPath);
try {
  let checkpoint = null;
  try { checkpoint = db.prepare('PRAGMA wal_checkpoint(TRUNCATE)').all(); } catch (error) { checkpoint = [{ note: String(error) }]; }
  const journal = db.prepare('PRAGMA journal_mode=DELETE').get();
  db.exec('VACUUM');
  const integrity = db.prepare('PRAGMA integrity_check').all();
  console.log(JSON.stringify({ checkpoint, journal, integrity }, null, 2));
  const ok = integrity.length === 1 && String(Object.values(integrity[0])[0]).toLowerCase() === 'ok';
  if (!ok) process.exit(2);
} finally { db.close(); }
for (const suffix of ['-wal','-shm']) {
  const p = dbPath + suffix;
  if (fs.existsSync(p)) {
    console.error(`stale sqlite sidecar remains: ${p}`);
    process.exit(3);
  }
}
'@ | Set-Content -Path $helper -Encoding UTF8
  return Invoke-LoggedCommand 'P5' 'app-index-sqlite-finalize' "node `"$helper`"" @{} $true $false
}

function Write-EvidenceSummary {
  param([string]$OverallStatus)
  $buildInfo = $null
  if (Test-Path 'public\build-info.json') {
    try { $buildInfo = Get-Content 'public\build-info.json' -Raw | ConvertFrom-Json } catch { $buildInfo = $null }
  }
  $payload = [ordered]@{
    schema = 'apex.cp27.windows-finalization.v1'
    projectRoot = $ProjectRoot
    startedAtUtc = $RunStartedUtc
    updatedAtUtc = (Get-Date).ToUniversalTime().ToString('o')
    overallStatus = $OverallStatus
    chrome = $ChromePath
    expectedFontFiles = $ExpectedFontFiles
    visualBaselineDir = if ($VisualBaselineDir) { $VisualBaselineDir } else { $null }
    visualApprovedByOperatorSwitch = [bool]$ApproveVisualDiff
    build = if ($buildInfo) { [ordered]@{ version=$buildInfo.version; buildId=$buildInfo.buildId; sourceHash=$buildInfo.sourceHash; sourceTreeHash=$buildInfo.sourceTreeHash } } else { $null }
    blocked = if ($MandatoryBlocked.Count) { $MandatoryBlocked.ToArray() } else { @() }
    results = if ($Results.Count) { $Results.ToArray() } else { @() }
  }
  $jsonPath = Join-Path $EvidenceDir 'CP28_WINDOWS_FINALIZATION.json'
  $mdPath = Join-Path $EvidenceDir 'CP28_WINDOWS_FINALIZATION.md'
  $payload | ConvertTo-Json -Depth 10 | Set-Content $jsonPath -Encoding UTF8
  $lines = [System.Collections.Generic.List[string]]::new()
  $lines.Add('# CP28 Windows Finalization of CP27')
  $lines.Add('')
  $lines.Add("- Status: **$OverallStatus**")
  if ($buildInfo) { $lines.Add(('- Build ID: `{0}`' -f $buildInfo.buildId)) }
  $lines.Add(('- Evidence directory: `{0}`' -f $EvidenceDir))
  $lines.Add('')
  $lines.Add('| Phase | Gate | Status | Exit | Detail |')
  $lines.Add('|---|---|---:|---:|---|')
  foreach ($r in $Results) {
    $detail = ([string]$r.detail).Replace('|','\|').Replace("`r",' ').Replace("`n",' ')
    $exit = if ($null -eq $r.exitCode) { '' } else { [string]$r.exitCode }
    $lines.Add("| $($r.phase) | $($r.name) | $($r.status) | $exit | $detail |")
  }
  if ($MandatoryBlocked.Count) {
    $lines.Add('')
    $lines.Add('## Blocking items')
    foreach ($b in $MandatoryBlocked) { $lines.Add("- $b") }
  }
  $lines | Set-Content $mdPath -Encoding UTF8
}

function Update-LedgerBeforeFinalIndex {
  # This writes CP28 once BEFORE the last index:app refresh. Do not write the
  # root ledgers again after the final App Index run, otherwise index freshness
  # becomes self-referential/stale. Final post-index evidence lives under QA/,
  # which generateAppIndex intentionally excludes.
  $jsonPath = Join-Path $ProjectRoot 'REMEDIATION_CHECKPOINTS.json'
  $mdPath = Join-Path $ProjectRoot 'REMEDIATION_CHECKPOINTS.md'
  $buildInfo = $null
  if (Test-Path 'public\build-info.json') { try { $buildInfo = Get-Content 'public\build-info.json' -Raw | ConvertFrom-Json } catch { } }
  $status = if ($MandatoryBlocked.Count -eq 0) { 'COMPLETED' } else { 'PARTIAL_BLOCKED' }
  $entry = [ordered]@{
    id = 'CP28'
    title = 'Windows finalization of CP27 merged source'
    status = $status
    startingCommit = 'NOT_AVAILABLE_SOURCE_ARCHIVE'
    resultingCommit = 'NOT_AVAILABLE_SOURCE_ARCHIVE'
    startingSourceTreeHash = $null
    resultingSourceTreeHash = if ($buildInfo) { $buildInfo.sourceTreeHash } else { $null }
    resultingBuildId = if ($buildInfo) { $buildInfo.buildId } else { $null }
    updatedAt = (Get-Date).ToUniversalTime().ToString('o')
    scope = @(
      'Restored/validated the Windows dependency tree without package-lock drift.',
      'Finalized the CP27 merge that preserves CP26 App Index/release hardening plus the CP22 Smart Proxy, Settings, TSX, font, and browser-QA ports.',
      'Re-ran TypeScript, Vitest including TSX honesty suites, build, canonical browser, runtime suites, API/App Index, and release identity gates.',
      'Required provider-backed Autopilot lifecycle to complete with zero SKIP for FINAL eligibility.',
      'Captured exact CP27 Settings visual evidence and required explicit operator review before FINAL packaging.'
    )
    gates = @($Results | ForEach-Object { [ordered]@{ command=$_.name; status=$_.status; exitCode=$_.exitCode; detail=$_.detail } })
    evidenceDirectory = $EvidenceDir.Substring($ProjectRoot.Length).TrimStart([char]92)
    note = 'When status is COMPLETED, the runner immediately performs one final index:app + qa:app-index refresh after this write and downgrades the ledger if that refresh fails. Post-index/package command logs are also recorded under QA/windows-finalization, which App Index excludes.'
  }
  $doc = Get-Content $jsonPath -Raw | ConvertFrom-Json
  $kept = @($doc.checkpoints | Where-Object { $_.id -ne 'CP28' })
  $doc.checkpoints = @($kept + [pscustomobject]$entry)
  $doc | ConvertTo-Json -Depth 12 | Set-Content $jsonPath -Encoding UTF8

  $md = Get-Content $mdPath -Raw
  $marker = '## CP28 - Windows finalization of CP27 merged source'
  $policyMarker = '## Policy'
  $idx = $md.IndexOf($marker, [StringComparison]::Ordinal)
  if ($idx -ge 0) {
    $pidx = $md.IndexOf($policyMarker, $idx, [StringComparison]::Ordinal)
    if ($pidx -lt 0) { $md = $md.Substring(0,$idx) } else { $md = $md.Substring(0,$idx) + $md.Substring($pidx) }
  }
  $block = [System.Collections.Generic.List[string]]::new()
  $block.Add($marker)
  $block.Add('')
  $block.Add("- Status: $status")
  if ($buildInfo) {
    $block.Add(('- Build ID: `{0}`' -f $buildInfo.buildId))
    $block.Add(('- Source tree hash: `{0}`' -f $buildInfo.sourceTreeHash))
  }
  $block.Add(('- Evidence directory: `{0}`' -f $entry.evidenceDirectory))
  $block.Add('- Root ledger frozen before the final App Index regeneration. If that refresh fails, the runner rewrites this checkpoint to PARTIAL_BLOCKED before exiting; post-index/package logs are also in the QA evidence report.')
  $block.Add('')
  $block.Add('| Gate | Status | Exit | Detail |')
  $block.Add('|---|---:|---:|---|')
  foreach ($r in $Results) {
    $detail = ([string]$r.detail).Replace('|','\|').Replace("`r",' ').Replace("`n",' ')
    $exit = if ($null -eq $r.exitCode) { '' } else { [string]$r.exitCode }
    $block.Add("| $($r.name) | $($r.status) | $exit | $detail |")
  }
  $blockText = ($block -join "`r`n") + "`r`n`r`n"
  $policyIndex = $md.IndexOf($policyMarker, [StringComparison]::Ordinal)
  if ($policyIndex -ge 0) {
    $newMd = $md.Substring(0,$policyIndex).TrimEnd() + "`r`n`r`n" + $blockText + $md.Substring($policyIndex)
  } else {
    $newMd = $md.TrimEnd() + "`r`n`r`n" + $blockText
  }
  Set-Content $mdPath -Value $newMd -Encoding UTF8
}

function Fail-Run([string]$Message) {
  Write-Host ''
  Write-Host $Message -ForegroundColor Red
  # Persist a truthful partial CP28 checkpoint when possible. A failed run may
  # leave App Index stale, which is acceptable only because FINAL is blocked;
  # the next successful run regenerates App Index after the ledger write.
  try { Update-LedgerBeforeFinalIndex } catch { Write-Warning "Could not update CP28 ledger on failure: $($_.Exception.Message)" }
  Write-EvidenceSummary 'BLOCKED_OR_FAILED'
  Write-Host "Evidence: $EvidenceDir" -ForegroundColor Yellow
  exit 1
}

# --------------------------------------------------------------------------------------
# STEP 0 - host + CP27 source preconditions
# --------------------------------------------------------------------------------------
Write-Section 'STEP 0 - Windows host and CP27 source prerequisites'
$isWindowsHost = $false
if ($PSVersionTable.PSVersion.Major -ge 6) { $isWindowsHost = $IsWindows } else { $isWindowsHost = $true }
if (-not $isWindowsHost) { throw 'This runner is Windows-only.' }

$pkg = Get-Content 'package.json' -Raw | ConvertFrom-Json
if ([string]$pkg.version -ne '2.0.1') { throw "Expected APEX 2.0.1, found $($pkg.version)" }
$nodeVer = (& node -v)
$npmVer = (& npm -v)
Write-Host "  Node: $nodeVer"
Write-Host "  npm : $npmVer"
if ($nodeVer -notmatch '^v(2[2-4])\.') { throw "Node must satisfy package engines >=22 <25. Current: $nodeVer" }

Assert-TextContains 'vite.config.ts' 'assetsInlineLimit\s*:\s*0' 'font assets are never inlined'
Assert-TextContains 'vite.config.ts' 'test\.\{ts,tsx\}' 'Vitest includes .test.tsx suites'
Assert-TextContains 'src\pages\settings\SettingsPage.tsx' "'smart-proxy'" 'dedicated Smart Proxy Settings section exists'
Assert-TextContains 'src\pages\settings\SettingsPage.tsx' 'ProxySettingsPanel' 'Smart Proxy panel is mounted from SettingsPage'
Assert-TextContains 'scripts\qa\verifyWorkspaceRuntime.mts' 'data-settings-section="smart-proxy"' 'browser integration verifier targets Smart Proxy tab'
Assert-TextContains 'scripts\capture\captureWorkspaceScreens.mts' "\['smart-proxy',\s*'Smart Proxy'\]" 'capture matrix includes Smart Proxy tab'
Assert-TextContains 'scripts\capture\captureWorkspaceScreens.mts' 'APEX_PLAYWRIGHT_EXECUTABLE' 'capture honors explicit Chrome executable'
Assert-TextContains 'src\pages\settings\SettingsPage.tsx' 'Fail-closed routing' 'Smart Proxy fail-closed section header is present'
Assert-TextContains 'src\pages\settings\SettingsPage.tsx' 'Terminal control center' 'enhanced Settings control-center heading is present'
Assert-TextContains 'src\pages\settings\SettingsPage.css' 'CP27 / Settings UX enhancement' 'final Settings UX enhancement block is present'
Assert-TextContains 'scripts\qa\verifyWorkspaceRuntime.mts' 'settings-smart-proxy-1368x753\.png' 'runtime verifier emits dedicated Smart Proxy evidence'
Assert-TextContains 'scripts\qa\verifyWorkspaceRuntime.mts' 'settings-api-integrations-1368x753\.png' 'runtime verifier emits dedicated API integration evidence'

$settingsCss = Get-Content 'src\pages\settings\SettingsPage.css' -Raw
$eightTabGridCount = ([regex]::Matches($settingsCss, 'repeat\(8,\s*minmax\(')).Count
if ($eightTabGridCount -lt 5) {
  throw "CP27 prerequisite missing: expected at least 5 eight-tab Settings nav grid rules; found $eightTabGridCount."
}
$settingsCssRaw = Get-Content -LiteralPath (Join-Path $ProjectRoot 'src\pages\settings\SettingsPage.css') -Raw
if ($settingsCssRaw -match '(?is)settings-nav[^}]{0,260}repeat\(7\s*,') {
  throw 'CP27 prerequisite violated: seven-column Settings navigation CSS remains after the eight-tab UX merge.'
}
if ($settingsCss -notmatch 'CP22\s*/\s*Phase 3\.6.*cohesive Settings visual hierarchy') {
  throw 'CP27 prerequisite missing: merged CP22 Phase 3.6 Settings visual hierarchy block.'
}
Write-Host "  OK  Settings CSS contains $eightTabGridCount eight-tab grid rules and the Phase 3.6 hierarchy block" -ForegroundColor Green

$appIndexGenerator = Get-Content 'scripts\utilities\generateAppIndex.mjs' -Raw
foreach ($privateRoot in @('.apex-data', '.apex-private-data', '_release', '.playwright-browsers')) {
  if ($appIndexGenerator -notmatch [regex]::Escape($privateRoot)) {
    throw "CP27 prerequisite missing: App Index private/runtime exclusion $privateRoot"
  }
}
Write-Host '  OK  CP26 App Index private/runtime-root hardening is preserved' -ForegroundColor Green
if ((Get-Content 'src\components\IntelligenceSourcesSettingsPanel.tsx' -Raw) -match '<ProxySettingsPanel') {
  throw 'CP27 prerequisite violated: ProxySettingsPanel is still rendered inside IntelligenceSourcesSettingsPanel.'
}
Add-Result 'P0' 'cp27-source-prerequisites' 'PASS' 0 'All CP27 source prerequisites are present.' '' $true

$ChromePath = Find-Chrome $ChromePath
if (-not $ChromePath) {
  Add-Result 'P0' 'google-chrome' 'BLOCKED_ENVIRONMENT' $null 'Google Chrome executable not found. Pass -ChromePath.' '' $true
  Fail-Run 'Chrome is required for canonical browser evidence.'
}
$chromeVersion = & $ChromePath --version 2>$null
Write-Host "  Chrome: $chromeVersion ($ChromePath)" -ForegroundColor Green
[Environment]::SetEnvironmentVariable('APEX_PLAYWRIGHT_EXECUTABLE', $ChromePath, 'Process')
Add-Result 'P0' 'google-chrome' 'PASS' 0 "$chromeVersion at $ChromePath" '' $true

# --------------------------------------------------------------------------------------
# STEP 1 - dependency restore, explicitly neutralizing global NODE_ENV=production
# --------------------------------------------------------------------------------------
Write-Section 'STEP 1 - dependency restore / integrity'
$lockBefore = (Get-FileHash -Algorithm SHA256 'package-lock.json').Hash
$needCi = $ForceNpmCi -or -not (Critical-DependenciesReady)
if ($needCi) {
  $ciSucceeded = $false
  for ($attempt = 1; $attempt -le $NpmCiAttempts; $attempt++) {
    Write-Host "  npm ci attempt $attempt/$NpmCiAttempts" -ForegroundColor Yellow
    $ci = Invoke-LoggedCommand 'P1' "npm-ci-attempt-$attempt" 'npm ci --include=dev --include=optional --no-audit --no-fund' @{
      NODE_ENV = $null
      NPM_CONFIG_PRODUCTION = $null
    } $false $false
    if ($ci.ExitCode -eq 0) { $ciSucceeded = $true; break }
    if ($attempt -lt $NpmCiAttempts) { Start-Sleep -Seconds ([math]::Min(15, 3 * $attempt)) }
  }
  if (-not $ciSucceeded) {
    Add-Result 'P1' 'npm-ci' 'BLOCKED_ENVIRONMENT' 1 'npm ci failed after retries; inspect attempt logs for DNS/registry errors.' '' $true
    Fail-Run 'Dependency restore failed. No downstream missing-package failure may be called PASS.'
  }
  Add-Result 'P1' 'npm-ci' 'PASS' 0 'Locked dev+optional dependencies restored with NODE_ENV/NPM_CONFIG_PRODUCTION neutralized only for npm ci.' '' $true
} else {
  Add-Result 'P1' 'npm-ci' 'PASS' 0 'Existing dependency tree contains tsx/vite/vitest/vite-client/typescript/playwright; reinstall not required.' '' $true
}
$lockAfter = (Get-FileHash -Algorithm SHA256 'package-lock.json').Hash
if ($lockAfter -ne $lockBefore) {
  Add-Result 'P1' 'package-lock-integrity' 'FAIL' 1 "$lockBefore -> $lockAfter" '' $true
  Fail-Run 'package-lock.json drifted during dependency restore.'
}
if (-not (Critical-DependenciesReady)) {
  Add-Result 'P1' 'critical-dev-dependencies' 'FAIL' 1 'Critical dependency files still missing after restore.' '' $true
  Fail-Run 'Dependency restore returned but the required toolchain is incomplete.'
}
Add-Result 'P1' 'package-lock-integrity' 'PASS' 0 "SHA-256 unchanged: $lockAfter" '' $true

# Windows-native dependency sanity (do not tolerate Linux native packages in release tree)
$nativeNames = @()
foreach ($dir in @('node_modules\@rollup','node_modules\@esbuild')) {
  if (Test-Path $dir) { $nativeNames += @(Get-ChildItem $dir -Directory | Select-Object -ExpandProperty Name) }
}
if (@($nativeNames | Where-Object { $_ -like '*linux*' }).Count -gt 0) {
  Add-Result 'P1' 'windows-native-dependencies' 'FAIL' 1 "Linux native package(s): $($nativeNames -join ', ')" '' $true
  Fail-Run 'Linux-native build packages leaked into the Windows dependency tree.'
}
if (@($nativeNames | Where-Object { $_ -like '*win32*' }).Count -eq 0) {
  Add-Result 'P1' 'windows-native-dependencies' 'FAIL' 1 "No win32 native package found: $($nativeNames -join ', ')" '' $true
  Fail-Run 'Windows Rollup/esbuild native package is missing.'
}
Add-Result 'P1' 'windows-native-dependencies' 'PASS' 0 ($nativeNames -join ', ') '' $true

# --------------------------------------------------------------------------------------
# STEP 2 - TypeScript + test inventory + newly enabled TSX suites + full Vitest
# --------------------------------------------------------------------------------------
Write-Section 'STEP 2 - TypeScript and Vitest'
foreach ($gate in @(
  @{ Name='lint-tsc-noEmit'; Cmd='npm run lint' },
  @{ Name='test-inventory'; Cmd='npm run check:test-inventory' },
  @{ Name='tsx-honesty-suites'; Cmd='npx --no-install vitest run src/tests/remediationTruthfulness.test.tsx src/tests/settingsIntegrationHealth.test.tsx' }
)) {
  $r = Invoke-LoggedCommand 'P2' $gate.Name $gate.Cmd @{} $true $false
  if ($r.ExitCode -ne 0) {
    Add-Result 'P2' $gate.Name 'FAIL' $r.ExitCode 'Gate failed; see log.' $r.LogPath $true
    Fail-Run "$($gate.Name) failed."
  }
  Add-Result 'P2' $gate.Name 'PASS' 0 'Gate exited 0.' $r.LogPath $true
}

# Full Vitest is mandatory. The operator-observed Windows load-timeout signature in dataflowHardening is
# allowed one diagnostic isolation run plus ONE unchanged full-suite retry. We do not
# increase testTimeout, change assertions, or convert a persistent failure into PASS.
$vitest1 = Invoke-LoggedCommand 'P2' 'full-vitest-attempt-1' 'npm test' @{} $true $false
if ($vitest1.ExitCode -eq 0) {
  Add-Result 'P2' 'full-vitest' 'PASS' 0 'Full Vitest passed on first attempt.' $vitest1.LogPath $true
} else {
  $knownDataflowLoadFlake = (
    $vitest1.Text -match 'FAIL\s+src/tests/dataflowHardening\.test\.ts\s+>\s+sealed governance and immutable archives\s+>\s+archives a content-addressed segment before rolling deletion' -and
    $vitest1.Text -match 'Test timed out in 30000ms' -and
    $vitest1.Text -match 'Test Files\s+1 failed\s+\|\s+155 passed \(156\)' -and
    $vitest1.Text -match 'Tests\s+1 failed\s+\|\s+955 passed\s+\|\s+1 skipped \(957\)'
  )
  if (-not $knownDataflowLoadFlake) {
    Add-Result 'P2' 'full-vitest' 'FAIL' $vitest1.ExitCode 'Full Vitest failed with a signature other than the one known Windows dataflow load timeout.' $vitest1.LogPath $true
    Fail-Run 'full-vitest failed.'
  }

  Add-Result 'P2' 'full-vitest-known-load-timeout-attempt-1' 'DIAGNOSTIC' $vitest1.ExitCode 'Exactly the previously observed dataflowHardening Windows load-timeout signature occurred; isolation + one unchanged full-suite retry required before PASS.' $vitest1.LogPath $false

  $isolation = Invoke-LoggedCommand 'P2' 'dataflow-hardening-isolation' 'npx --no-install vitest run src/tests/dataflowHardening.test.ts' @{} $true $false
  if ($isolation.ExitCode -ne 0) {
    Add-Result 'P2' 'full-vitest' 'FAIL' $isolation.ExitCode 'Known timeout did not pass in isolation; this is not classifiable as a load-only flake.' $isolation.LogPath $true
    Fail-Run 'dataflowHardening failed in isolation.'
  }
  Add-Result 'P2' 'dataflow-hardening-isolation' 'PASS' 0 'The exact failing file passed unchanged in isolation.' $isolation.LogPath $false

  $vitest2 = Invoke-LoggedCommand 'P2' 'full-vitest-attempt-2' 'npm test' @{} $true $false
  if ($vitest2.ExitCode -ne 0) {
    Add-Result 'P2' 'full-vitest' 'FAIL' $vitest2.ExitCode 'Full Vitest still failed on the one allowed unchanged retry; FINAL remains blocked.' $vitest2.LogPath $true
    Fail-Run 'full-vitest failed again after the controlled retry.'
  }
  Add-Result 'P2' 'full-vitest' 'PASS' 0 'Initial run hit the exact known dataflow load timeout; unchanged isolation passed and the one allowed unchanged full-suite retry passed.' $vitest2.LogPath $true
}

# --------------------------------------------------------------------------------------
# STEP 3 - production build + font determinism + build identity
# --------------------------------------------------------------------------------------
Write-Section 'STEP 3 - build, font determinism, build identity'
$r = Invoke-LoggedCommand 'P3' 'production-build' 'npm run build' @{} $true $false
if ($r.ExitCode -ne 0) {
  Add-Result 'P3' 'production-build' 'FAIL' $r.ExitCode 'Production build failed.' $r.LogPath $true
  Fail-Run 'Production build failed.'
}
Add-Result 'P3' 'production-build' 'PASS' 0 'Production build exited 0.' $r.LogPath $true

$fontFiles = @(Get-ChildItem 'dist' -Recurse -File | Where-Object { $_.Extension -match '^\.(woff2?|ttf|otf)$' })
$inlineHits = @()
$textAssets = @(Get-ChildItem 'dist' -Recurse -File | Where-Object { $_.Extension -in @('.css','.js','.html') })
foreach ($file in $textAssets) {
  $hit = Select-String -LiteralPath $file.FullName -Pattern 'data:font/|data:application/(?:font|x-font)' -AllMatches -ErrorAction SilentlyContinue
  if ($hit) { $inlineHits += $hit }
}
$fontDetail = "emitted=$($fontFiles.Count), inlineRefs=$($inlineHits.Count), expected=$ExpectedFontFiles"
if ($inlineHits.Count -ne 0 -or $fontFiles.Count -ne $ExpectedFontFiles) {
  Add-Result 'P3' 'font-asset-determinism' 'FAIL' 1 $fontDetail '' $true
  Fail-Run "Font determinism assertion failed: $fontDetail"
}
Add-Result 'P3' 'font-asset-determinism' 'PASS' 0 $fontDetail '' $true

$r = Invoke-LoggedCommand 'P3' 'build-identity' 'npm run check:build-identity' @{} $true $false
if ($r.ExitCode -ne 0) {
  Add-Result 'P3' 'build-identity' 'FAIL' $r.ExitCode 'Build identity is stale or invalid.' $r.LogPath $true
  Fail-Run 'Build identity failed after a successful build.'
}
Add-Result 'P3' 'build-identity' 'PASS' 0 'Build ID/source hash are current.' $r.LogPath $true

# --------------------------------------------------------------------------------------
# STEP 4 - canonical browser and Settings integration evidence
# --------------------------------------------------------------------------------------
Write-Section 'STEP 4 - canonical 1368x753 browser QA'
try {
  Assert-PortsFree @(3210,43239,46111,4599,24678) 'P4'
} catch {
  Add-Result 'P4' 'port-preflight' 'BLOCKED_ENVIRONMENT' $null $_.Exception.Message '' $true
  Fail-Run $_.Exception.Message
}
Add-Result 'P4' 'port-preflight' 'PASS' 0 'Dedicated QA/browser/runtime ports are free.' '' $true

$r = Invoke-LoggedCommand 'P4' 'qa-ui-1368' 'npm run qa:ui-1368' @{
  APEX_PLAYWRIGHT_EXECUTABLE = $ChromePath
  APEX_QA_OUT_DIR = (Join-Path $EvidenceDir 'ui-1368-light')
  APEX_QA_INLINE_PORT = '43239'
} $true $false
if ($r.ExitCode -ne 0) {
  Add-Result 'P4' 'qa-ui-1368' 'FAIL' $r.ExitCode 'Canonical visual/runtime gate failed.' $r.LogPath $true
  Fail-Run 'Canonical qa:ui-1368 failed.'
}
Add-Result 'P4' 'qa-ui-1368' 'PASS' 0 'Canonical 1368x753 gate exited 0.' $r.LogPath $true

# Run the workspace browser gate in canonical-only mode. This still executes
# settings-integrations + interactive flows, but does not turn the intentionally
# unsupported 1024x768 Academy layout into a release blocker.
$canonicalWorkspaceOut = Join-Path $EvidenceDir 'workspace-runtime-canonical'
$r = Invoke-LoggedCommand 'P4' 'workspace-runtime-canonical' 'npm run test:browser' @{
  APEX_PLAYWRIGHT_EXECUTABLE = $ChromePath
  APEX_QA_LIGHT_ONLY = '1'
  APEX_QA_OUT_DIR = $canonicalWorkspaceOut
  APEX_QA_PORT = '3210'
} $true $false
if ($r.ExitCode -ne 0) {
  Add-Result 'P4' 'workspace-runtime-canonical' 'FAIL' $r.ExitCode 'Canonical workspace browser gate failed.' $r.LogPath $true
  Fail-Run 'Canonical workspace runtime failed.'
}
$canonicalReport = Join-Path $canonicalWorkspaceOut 'workspace-runtime-report.json'
if (-not (Test-Path $canonicalReport)) {
  Add-Result 'P4' 'workspace-runtime-canonical-report' 'FAIL' 1 'workspace-runtime-report.json missing.' '' $true
  Fail-Run 'Canonical workspace report is missing.'
}
$wr = Get-Content $canonicalReport -Raw | ConvertFrom-Json
$settingsFailures = @($wr.findings | Where-Object { $_.kind -eq 'failure' -and [string]$_.scope -like 'settings-integrations/*' })
$canonicalFailures = @($wr.findings | Where-Object { $_.kind -eq 'failure' })
if ($canonicalFailures.Count -ne 0 -or $settingsFailures.Count -ne 0) {
  Add-Result 'P4' 'workspace-runtime-canonical-report' 'FAIL' 1 "failures=$($canonicalFailures.Count), settingsIntegrationFailures=$($settingsFailures.Count)" $canonicalReport $true
  Fail-Run 'Canonical workspace report contains failures.'
}
Add-Result 'P4' 'workspace-runtime-canonical' 'PASS' 0 "failures=0; settings-integrations=0; warnings=$($wr.summary.warnings)" $r.LogPath $true

if ($RunFullMultiViewport) {
  Write-Section 'STEP 4B - diagnostic full multi-viewport browser matrix'
  try { Assert-PortsFree @(3210,24678) 'P4B' } catch {
    Add-Result 'P4B' 'full-browser-port-preflight' 'BLOCKED_ENVIRONMENT' $null $_.Exception.Message '' $false
  }
  $fullOut = Join-Path $EvidenceDir 'workspace-runtime-full'
  $full = Invoke-LoggedCommand 'P4B' 'workspace-runtime-full' 'npm run test:browser' @{
    APEX_PLAYWRIGHT_EXECUTABLE = $ChromePath
    APEX_QA_LIGHT_ONLY = $null
    APEX_QA_OUT_DIR = $fullOut
    APEX_QA_PORT = '3210'
  } $false $false
  $fullReport = Join-Path $fullOut 'workspace-runtime-report.json'
  if ($full.ExitCode -eq 0) {
    Add-Result 'P4B' 'workspace-runtime-full' 'PASS' 0 'Full multi-viewport browser matrix passed.' $full.LogPath $false
  } elseif (Test-Path $fullReport) {
    $fr = Get-Content $fullReport -Raw | ConvertFrom-Json
    $fails = @($fr.findings | Where-Object { $_.kind -eq 'failure' })
    $unexpected = @($fails | Where-Object {
      [string]$_.scope -ne 'academy@1024x768/light' -or
      ([string]$_.message -notmatch 'overflow|containment|bottom|right|scroll')
    })
    if ($fails.Count -gt 0 -and $unexpected.Count -eq 0) {
      Add-Result 'P4B' 'workspace-runtime-full' 'KNOWN_SCOPE' $full.ExitCode "Only $($fails.Count) Academy@1024x768 intentional non-canonical layout finding(s); canonical gate already passed." $full.LogPath $false
    } else {
      Add-Result 'P4B' 'workspace-runtime-full' 'FAIL' $full.ExitCode "Unexpected full-matrix failures=$($unexpected.Count) / total=$($fails.Count)." $full.LogPath $false
    }
  } else {
    Add-Result 'P4B' 'workspace-runtime-full' 'FAIL' $full.ExitCode 'Full matrix failed and report is missing.' $full.LogPath $false
  }
}

# --------------------------------------------------------------------------------------
# STEP 5 - Phase 3.6 current screenshots + pixel-diff evidence
# --------------------------------------------------------------------------------------
Write-Section 'STEP 5 - Settings visual evidence / pixel diff'
if ($SkipVisualDiff) {
  Add-Result 'P3.6' 'settings-visual-diff' 'BLOCKED_BY_REQUEST' $null 'Skipped by -SkipVisualDiff; FINAL is not eligible.' '' $true
} else {
  $settingsTabs = @('account','security','appearance','notifications','trading','api','smart-proxy','devices')
  $captureReady = $true
  try {
    Assert-PortsFree @(46111,24678) 'P3.6'
    Add-Result 'P3.6' 'capture-port-preflight' 'PASS' 0 'Capture/HMR ports are free.' '' $true
  } catch {
    Add-Result 'P3.6' 'capture-port-preflight' 'BLOCKED_ENVIRONMENT' $null $_.Exception.Message '' $true
    $captureReady = $false
  }

  $captureOk = $false
  if ($captureReady) {
    $capture = Invoke-LoggedCommand 'P3.6' 'capture-settings-after' 'node --import tsx scripts/capture/captureWorkspaceScreens.mts' @{
      APEX_PLAYWRIGHT_EXECUTABLE = $ChromePath
      APEX_UX_CAPTURE_PORT = '46111'
    } $true $false
    if ($capture.ExitCode -ne 0) {
      Add-Result 'P3.6' 'capture-settings-after' 'FAIL' $capture.ExitCode 'Workspace capture failed.' $capture.LogPath $true
    } else {
      Add-Result 'P3.6' 'capture-settings-after' 'PASS' 0 'Current workspace/settings screenshots captured.' $capture.LogPath $true
      $captureOk = $true
    }
  }

  if (-not $VisualBaselineDir) {
    Add-Result 'P3.6' 'settings-visual-baseline' 'BLOCKED_MISSING_BASELINE' $null 'Current screenshots were captured, but strict before/after evidence requires -VisualBaselineDir with all eight pre-Phase-3.6 Settings screenshots.' '' $true
  } elseif (-not (Test-Path $VisualBaselineDir)) {
    Add-Result 'P3.6' 'settings-visual-baseline' 'BLOCKED_MISSING_BASELINE' $null "Directory not found: $VisualBaselineDir" '' $true
  } elseif ($captureOk) {
    $missingBaseline = @()
    foreach ($tab in $settingsTabs) {
      $baselinePath = Join-Path $VisualBaselineDir "desktop-settings-${tab}.jpg"
      if (-not (Test-Path $baselinePath)) { $missingBaseline += $baselinePath }
    }
    if ($missingBaseline.Count) {
      Add-Result 'P3.6' 'settings-visual-baseline' 'BLOCKED_MISSING_BASELINE' $null ("Missing: " + ($missingBaseline -join '; ')) '' $true
    } else {
      Add-Result 'P3.6' 'settings-visual-baseline' 'PASS' 0 'All eight pre-Phase-3.6 Settings screenshots are present.' '' $true
      $currentShots = Join-Path $ProjectRoot '_qa\ux_capture\screenshots'
      $diffRoot = Join-Path $EvidenceDir 'settings-visual-diff'
      New-Item -ItemType Directory -Force -Path $diffRoot | Out-Null
      $pythonExe = $null
      $pythonPrefix = ''
      if (Get-Command python.exe -ErrorAction SilentlyContinue) { $pythonExe = 'python.exe' }
      elseif (Get-Command py.exe -ErrorAction SilentlyContinue) { $pythonExe = 'py.exe'; $pythonPrefix='-3 ' }
      if (-not $pythonExe) {
        Add-Result 'P3.6' 'pixel-diff-tool' 'BLOCKED_ENVIRONMENT' $null 'Python 3 executable not found.' '' $true
      } else {
        $diffFailures = 0
        foreach ($tab in $settingsTabs) {
          $before = Join-Path $VisualBaselineDir "desktop-settings-${tab}.jpg"
          $after = Join-Path $currentShots "desktop-settings-${tab}.jpg"
          if (-not (Test-Path $after)) {
            Add-Result 'P3.6' "pixel-diff-$tab" 'FAIL' 1 "Current screenshot missing: $after" '' $true
            $diffFailures++
            continue
          }
          $out = Join-Path $diffRoot $tab
          New-Item -ItemType Directory -Force -Path $out | Out-Null
          $cmd = "$pythonExe $pythonPrefix`"scripts\utilities\apex_visual_diff.py`" `"$before`" `"$after`" --out `"$out`""
          $d = Invoke-LoggedCommand 'P3.6' "pixel-diff-$tab" $cmd @{} $true $false
          $report = Join-Path $out 'report.json'
          if ($d.ExitCode -ne 0 -or -not (Test-Path $report)) {
            Add-Result 'P3.6' "pixel-diff-$tab" 'FAIL' $d.ExitCode 'Diff tool failed or report.json missing.' $d.LogPath $true
            $diffFailures++
          } else {
            $metrics = Get-Content $report -Raw | ConvertFrom-Json
            Add-Result 'P3.6' "pixel-diff-$tab" 'PASS' 0 "evidence generated: verdict=$($metrics.verdict), ms_ssim=$([math]::Round([double]$metrics.ms_ssim,4)), changed=$([math]::Round([double]$metrics.pixel.pct_pixels_changed,3))%" $d.LogPath $true
          }
        }
        if ($diffFailures -eq 0) {
          if ($ApproveVisualDiff) {
            Add-Result 'P3.6' 'operator-visual-review' 'PASS' 0 'Operator explicitly approved generated Settings diff evidence via -ApproveVisualDiff.' '' $true
          } else {
            Add-Result 'P3.6' 'operator-visual-review' 'REVIEW_REQUIRED' $null "Inspect overlays/heatmaps under $diffRoot, then rerun with -ApproveVisualDiff." '' $true
          }
        }
      }
    }
  }
}

if ($MandatoryBlocked.Count -gt 0) {
  Write-Host ''
  Write-Host 'Visual evidence currently has a blocking item. Continuing with independent runtime/source gates; FINAL packaging will remain disabled unless all blocks clear.' -ForegroundColor Yellow
}

# --------------------------------------------------------------------------------------
# STEP 6 - Runtime safety. Autopilot must be two real scheduler cycles, 0 SKIP.
# --------------------------------------------------------------------------------------
Write-Section 'STEP 6 - runtime safety and provider-backed Autopilot lifecycle'
$autopilotStrictPass = $false
$runtimePortReady = $true
try {
  Assert-PortsFree @(4599,24678) 'P4-runtime-safety'
  Add-Result 'P4' 'runtime-safety-port-preflight' 'PASS' 0 'Runtime safety ports are free.' '' $true
} catch {
  Add-Result 'P4' 'runtime-safety-port-preflight' 'BLOCKED_ENVIRONMENT' $null $_.Exception.Message '' $true
  $runtimePortReady = $false
}

if ($SkipLiveAutopilot) {
  Add-Result 'P4' 'autopilot-two-cycle-live' 'BLOCKED_BY_REQUEST' $null 'Skipped by -SkipLiveAutopilot; mandatory provider-backed lifecycle not proven.' '' $true
} elseif ($runtimePortReady) {
  $auto = Invoke-LoggedCommand 'P4' 'autopilot-two-cycle-live' 'npm run qa:autopilot-lifecycle-runtime' @{
    APEX_RUNTIME_PORT = '4599'
    APEX_RUNTIME_SCHEDULER_INTERVAL_MS = '60000'
    APEX_RUNTIME_BOOT_TIMEOUT_MS = '180000'
    APEX_RUNTIME_CYCLE_TIMEOUT_MS = '900000'
  } $true $false
  $skipCount = $null
  $failCount = $null
  if ($auto.Text -match 'Autopilot lifecycle runtime:\s*\d+/\d+ PASS,\s*(\d+) SKIP,\s*(\d+) FAIL') {
    $skipCount = [int]$Matches[1]
    $failCount = [int]$Matches[2]
  }
  if ($auto.ExitCode -ne 0) {
    Add-Result 'P4' 'autopilot-two-cycle-live' 'FAIL' $auto.ExitCode 'Autopilot lifecycle returned non-zero.' $auto.LogPath $true
  } elseif ($null -eq $skipCount -or $null -eq $failCount) {
    Add-Result 'P4' 'autopilot-two-cycle-live' 'FAIL' 1 'Could not parse lifecycle PASS/SKIP/FAIL summary; fail closed.' $auto.LogPath $true
  } elseif ($skipCount -ne 0 -or $failCount -ne 0) {
    Add-Result 'P4' 'autopilot-two-cycle-live' 'BLOCKED_ENVIRONMENT' 0 "Process exited 0 but mandatory lifecycle had SKIP=$skipCount FAIL=$failCount. Provider-backed two-cycle evidence is not complete." $auto.LogPath $true
  } else {
    $missingMarker = $null
    foreach ($marker in @(
      'scheduler-triggered Cycle N completes',
      'Cycle N has server scheduler provenance',
      'scheduler-triggered Cycle N+1 completes',
      'Cycle N+1 was not a manual HTTP cycle',
      'STOP returns the controller to OFF'
    )) {
      if ($auto.Text -notmatch [regex]::Escape($marker)) { $missingMarker = $marker; break }
    }
    if ($missingMarker) {
      Add-Result 'P4' 'autopilot-two-cycle-live' 'FAIL' 1 "Required evidence marker missing: $missingMarker" $auto.LogPath $true
    } else {
      Add-Result 'P4' 'autopilot-two-cycle-live' 'PASS' 0 'Zero SKIP/FAIL; two scheduler-owned cycles and STOP->OFF evidence present.' $auto.LogPath $true
      $autopilotStrictPass = $true
    }
  }
}

# Independent runtime suites still run even if the external provider precondition
# blocks the live lifecycle, so one network limitation does not erase unrelated evidence.
foreach ($gate in @(
  @{ Name='runtime-core'; Cmd='npm run qa:suite:runtime-core' },
  @{ Name='runtime-simulation'; Cmd='npm run qa:suite:runtime-simulation' }
)) {
  $rr = Invoke-LoggedCommand 'P5' $gate.Name $gate.Cmd @{} $true $false
  if ($rr.ExitCode -ne 0) {
    Add-Result 'P5' $gate.Name 'FAIL' $rr.ExitCode 'Runtime suite failed.' $rr.LogPath $true
  } else {
    Add-Result 'P5' $gate.Name 'PASS' 0 'Suite exited 0.' $rr.LogPath $true
  }
}

if ($autopilotStrictPass) {
  $rr = Invoke-LoggedCommand 'P5' 'runtime-safety' 'npm run qa:suite:runtime-safety' @{} $true $false
  if ($rr.ExitCode -ne 0) {
    Add-Result 'P5' 'runtime-safety' 'FAIL' $rr.ExitCode 'Runtime safety suite failed.' $rr.LogPath $true
  } elseif ($rr.Text -match 'Autopilot lifecycle runtime:\s*\d+/\d+ PASS,\s*([1-9]\d*) SKIP') {
    Add-Result 'P5' 'runtime-safety' 'BLOCKED_ENVIRONMENT' 0 'Runtime safety suite contained mandatory Autopilot SKIP despite exit 0.' $rr.LogPath $true
  } else {
    Add-Result 'P5' 'runtime-safety' 'PASS' 0 '5/5 runtime safety leaves completed with no mandatory Autopilot skip.' $rr.LogPath $true
  }
} else {
  Add-Result 'P5' 'runtime-safety' 'BLOCKED_ENVIRONMENT' $null 'Full runtime-safety cannot be PASS until provider-backed Autopilot two-cycle is proven with zero SKIP. Running the four independent safety leaves below.' '' $true
  foreach ($leaf in @(
    @{ Name='unified-safety-runtime'; Cmd='npm run qa:unified-safety-runtime' },
    @{ Name='autopilot-lifecycle-environment'; Cmd='npm run qa:autopilot-lifecycle-environment' },
    @{ Name='supplemental-key-runtime'; Cmd='npm run qa:supplemental-key-runtime' },
    @{ Name='proxy-fetch-optional-deps'; Cmd='npm run qa:proxy-fetch-optional-deps' }
  )) {
    $lr = Invoke-LoggedCommand 'P5' $leaf.Name $leaf.Cmd @{} $false $false
    if ($lr.ExitCode -eq 0) {
      Add-Result 'P5' $leaf.Name 'PASS' 0 'Independent runtime-safety leaf passed.' $lr.LogPath $false
    } else {
      Add-Result 'P5' $leaf.Name 'FAIL' $lr.ExitCode 'Independent runtime-safety leaf failed.' $lr.LogPath $false
    }
  }
}

# --------------------------------------------------------------------------------------
# STEP 7 - full source/API/App Index matrix + version/build/release source gates
# --------------------------------------------------------------------------------------
Write-Section 'STEP 7 - source/API/App Index/release regression matrix'
# Run API and initial App Index before source-core; source-core includes both plus build identity.
foreach ($gate in @(
  @{ Name='root-contract'; Cmd='npm run check:root-contract' },
  @{ Name='api-contract'; Cmd='npm run check:api-contract' },
  @{ Name='index-app-initial'; Cmd='npm run index:app' },
  @{ Name='qa-app-index-initial'; Cmd='npm run qa:app-index' },
  @{ Name='source-core'; Cmd='npm run qa:suite:source-core' },
  @{ Name='check-version'; Cmd='npm run check:version' },
  @{ Name='check-build-identity-final'; Cmd='npm run check:build-identity' },
  @{ Name='release-gate-source'; Cmd='npm run release:gate:source' }
)) {
  $rr = Invoke-LoggedCommand 'P5' $gate.Name $gate.Cmd @{} $true $false
  if ($rr.ExitCode -ne 0) {
    Add-Result 'P5' $gate.Name 'FAIL' $rr.ExitCode 'Gate failed.' $rr.LogPath $true
    Fail-Run "$($gate.Name) failed."
  }
  Add-Result 'P5' $gate.Name 'PASS' 0 'Gate exited 0.' $rr.LogPath $true
}

$sqlite = Finalize-AppIndexSqlite
if ($sqlite.ExitCode -ne 0) {
  Add-Result 'P5' 'app-index-sqlite-finalize' 'FAIL' $sqlite.ExitCode 'SQLite DELETE/VACUUM/integrity finalization failed.' $sqlite.LogPath $true
  Fail-Run 'App Index SQLite finalization failed.'
}
Add-Result 'P5' 'app-index-sqlite-finalize' 'PASS' 0 'journal_mode=DELETE, VACUUM complete, integrity_check=ok, no WAL/SHM.' $sqlite.LogPath $true

# Write the root checkpoint now, then perform the *last* App Index regeneration/check.
# There must be no subsequent root-ledger write.
Update-LedgerBeforeFinalIndex

$finalIndex = Invoke-LoggedCommand 'P5' 'index-app-after-ledger' 'npm run index:app' @{} $true $false
if ($finalIndex.ExitCode -ne 0) {
  Add-Result 'P5' 'index-app-after-ledger' 'FAIL' $finalIndex.ExitCode 'Final App Index regeneration after ledger write failed.' $finalIndex.LogPath $true
  Fail-Run 'Final App Index regeneration failed.'
}
Add-Result 'P5' 'index-app-after-ledger' 'PASS' 0 'Final App Index regenerated after root-ledger freeze.' $finalIndex.LogPath $true

$finalQaIndex = Invoke-LoggedCommand 'P5' 'qa-app-index-after-ledger' 'npm run qa:app-index' @{} $true $false
if ($finalQaIndex.ExitCode -ne 0) {
  Add-Result 'P5' 'qa-app-index-after-ledger' 'FAIL' $finalQaIndex.ExitCode 'Final App Index QA after ledger write failed.' $finalQaIndex.LogPath $true
  Fail-Run 'Final App Index QA failed.'
}
Add-Result 'P5' 'qa-app-index-after-ledger' 'PASS' 0 'Final App Index resolver/lineage/contract checks passed after ledger freeze.' $finalQaIndex.LogPath $true

$sqlite2 = Finalize-AppIndexSqlite
if ($sqlite2.ExitCode -ne 0) {
  Add-Result 'P5' 'app-index-sqlite-final-finalize' 'FAIL' $sqlite2.ExitCode 'Final SQLite finalization failed.' $sqlite2.LogPath $true
  Fail-Run 'Final App Index SQLite finalization failed.'
}
Add-Result 'P5' 'app-index-sqlite-final-finalize' 'PASS' 0 'Final DB checkpointed to DELETE/VACUUM/integrity=ok.' $sqlite2.LogPath $true

# Re-check source-only release and build identity after generated indexes. These commands
# do not mutate root source/ledger.
foreach ($gate in @(
  @{ Name='build-identity-post-index'; Cmd='npm run check:build-identity' },
  @{ Name='release-gate-source-post-index'; Cmd='npm run release:gate:source' }
)) {
  $rr = Invoke-LoggedCommand 'P5' $gate.Name $gate.Cmd @{} $true $false
  if ($rr.ExitCode -ne 0) {
    Add-Result 'P5' $gate.Name 'FAIL' $rr.ExitCode 'Post-index gate failed.' $rr.LogPath $true
    Fail-Run "$($gate.Name) failed."
  }
  Add-Result 'P5' $gate.Name 'PASS' 0 'Post-index gate exited 0.' $rr.LogPath $true
}

# --------------------------------------------------------------------------------------
# STEP 8 - canonical release artifacts and outer FINAL release bundle
# --------------------------------------------------------------------------------------
Write-Section 'STEP 8 - release artifacts / FINAL bundle'
if ($MandatoryBlocked.Count -gt 0) {
  Write-EvidenceSummary 'PARTIAL_BLOCKED'
  Write-Host ''
  Write-Host 'FINAL packaging is disabled because one or more mandatory gates are BLOCKED/FAILED/REVIEW_REQUIRED.' -ForegroundColor Yellow
  foreach ($block in $MandatoryBlocked) { Write-Host "  - $block" -ForegroundColor Yellow }
  Write-Host "Evidence: $EvidenceDir"
  exit 2
}
if ($NoPackage) {
  Add-Result 'P6' 'final-package' 'NOT_APPLICABLE' $null 'Skipped by -NoPackage after all mandatory verification passed.' '' $false
  Write-EvidenceSummary 'VERIFIED_NO_PACKAGE'
  Write-Host "All mandatory verification passed. Packaging skipped by request. Evidence: $EvidenceDir" -ForegroundColor Green
  exit 0
}

$pack = Invoke-LoggedCommand 'P6' 'create-release-archives' 'node --import tsx scripts/utilities/createReleaseArchive.mts' @{} $true $false
if ($pack.ExitCode -ne 0) {
  Add-Result 'P6' 'create-release-archives' 'FAIL' $pack.ExitCode 'Canonical release archive creation failed.' $pack.LogPath $true
  Fail-Run 'Release archive creation failed.'
}
Add-Result 'P6' 'create-release-archives' 'PASS' 0 'Canonical source/build/evidence archives created.' $pack.LogPath $true

$verifyArtifacts = Invoke-LoggedCommand 'P6' 'release-verify-artifacts' 'npm run release:verify-artifacts' @{} $true $false
if ($verifyArtifacts.ExitCode -ne 0) {
  Add-Result 'P6' 'release-verify-artifacts' 'FAIL' $verifyArtifacts.ExitCode 'Release artifact verification failed.' $verifyArtifacts.LogPath $true
  Fail-Run 'Release artifact verification failed.'
}
Add-Result 'P6' 'release-verify-artifacts' 'PASS' 0 'Canonical release artifacts verified.' $verifyArtifacts.LogPath $true

# Build one outer bundle from the already-verified _release artifacts. This avoids
# inventing a second source inclusion policy and keeps dist inside the canonical build ZIP.
$version = [string]$pkg.version
$finalBundle = Join-Path $ProjectRoot "APEX-v$version-CP28-FINAL-RELEASE-BUNDLE.zip"
if (Test-Path $finalBundle) { Remove-Item $finalBundle -Force }
$releaseItems = Get-ChildItem (Join-Path $ProjectRoot '_release') -Force
if (-not $releaseItems.Count) {
  Add-Result 'P6' 'final-release-bundle' 'FAIL' 1 '_release is empty after archive creation.' '' $true
  Fail-Run '_release is empty.'
}
Compress-Archive -LiteralPath $releaseItems.FullName -DestinationPath $finalBundle -CompressionLevel Optimal -Force
$bundleHash = (Get-FileHash -Algorithm SHA256 $finalBundle).Hash.ToLowerInvariant()
$sidecar = "${finalBundle}.sha256"
"$bundleHash  $(Split-Path -Leaf $finalBundle)" | Set-Content $sidecar -Encoding ASCII

# Integrity test by extraction to a temporary directory.
$integrityDir = Join-Path ([System.IO.Path]::GetTempPath()) ("apex-final-integrity-" + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Force -Path $integrityDir | Out-Null
try {
  Expand-Archive -LiteralPath $finalBundle -DestinationPath $integrityDir -Force
  $requiredReleaseFiles = @(
    "apex-unified-terminal-v$version.zip",
    "apex-unified-terminal-v$version-build.zip",
    "apex-unified-terminal-v$version-evidence.zip",
    'release-manifest.json',
    'CHECKSUMS.sha256'
  )
  $missing = @($requiredReleaseFiles | Where-Object { -not (Test-Path (Join-Path $integrityDir $_)) })
  if ($missing.Count) { throw "FINAL bundle missing required release artifacts: $($missing -join ', ')" }
} catch {
  Add-Result 'P6' 'final-release-bundle-integrity' 'FAIL' 1 $_.Exception.Message '' $true
  Fail-Run 'FINAL bundle integrity check failed.'
} finally {
  Remove-Item $integrityDir -Recurse -Force -ErrorAction SilentlyContinue
}
Add-Result 'P6' 'final-release-bundle-integrity' 'PASS' 0 "SHA-256=$bundleHash; Expand-Archive succeeded; required nested artifacts present." '' $true

Write-EvidenceSummary 'FINAL_VERIFIED'

Write-Section 'FINAL RESULT'
$Results | Format-Table phase, status, exitCode, name -AutoSize
Write-Host ''
Write-Host 'ALL MANDATORY CP27/CP28 GATES ARE PROVEN.' -ForegroundColor Green
Write-Host "FINAL bundle : $finalBundle" -ForegroundColor Green
Write-Host "SHA-256      : $bundleHash" -ForegroundColor Green
Write-Host "Evidence     : $EvidenceDir" -ForegroundColor Green
exit 0
