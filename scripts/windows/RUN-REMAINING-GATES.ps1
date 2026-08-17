<#
.SYNOPSIS
  Executes the remaining APEX v1.0.68 P0/P1 release gates on the Windows release target.

.DESCRIPTION
  Windows is the authoritative release target for this project. This runner executes the
  remaining-tasks sequence in the documented order and records real evidence for each gate.

  It deliberately does NOT:
    - install or side-load any Linux-native package,
    - regenerate or rewrite package-lock.json,
    - lower a threshold, skip a test, or weaken a gate to obtain a PASS.

  It proves the lockfile is unchanged by hashing it before and after the run.

.PARAMETER ReinstallDeps
  Recreate node_modules from the checked-in lockfile (Remove-Item node_modules + npm ci).
  Only use this when the existing Windows install is proven corrupted.

.PARAMETER ContinueOnFailure
  Run every gate even after one fails, instead of stopping at the first failure.
  Useful for producing a complete failure inventory in one pass.

.PARAMETER SkipBrowser
  Skip the browser QA gate (npm run test:browser).

.PARAMETER SkipVisual
  Skip the visual gates (npm run test:visual / npm run verify:visual).

.EXAMPLE
  powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\windows\RUN-REMAINING-GATES.ps1

.EXAMPLE
  powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\windows\RUN-REMAINING-GATES.ps1 -ContinueOnFailure
#>
[CmdletBinding()]
param(
  [switch]$ReinstallDeps,
  [switch]$ContinueOnFailure,
  [switch]$SkipBrowser,
  [switch]$SkipVisual
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

# --------------------------------------------------------------------------------------
# Locate the project root (this script lives in <root>\scripts\windows)
# --------------------------------------------------------------------------------------
$ScriptDir   = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = (Resolve-Path (Join-Path $ScriptDir '..\..')).Path
Set-Location $ProjectRoot

$Stamp       = Get-Date -Format 'yyyyMMdd-HHmmss'
$EvidenceDir = Join-Path $ProjectRoot 'QA\windows-verification'
$LogDir      = Join-Path $EvidenceDir $Stamp
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

$SummaryJson = Join-Path $LogDir 'gate-results.json'
$Transcript  = Join-Path $LogDir 'transcript.log'

function Write-Section {
  param([string]$Text)
  Write-Host ''
  Write-Host ('=' * 78) -ForegroundColor DarkGray
  Write-Host $Text -ForegroundColor Cyan
  Write-Host ('=' * 78) -ForegroundColor DarkGray
}

# --------------------------------------------------------------------------------------
# STEP 0 - Assert the release host is Windows and record its identity
# --------------------------------------------------------------------------------------
Write-Section 'STEP 0 - Windows release host identity'

$isWindowsHost = $false
if ($PSVersionTable.PSVersion.Major -ge 6) {
  $isWindowsHost = $IsWindows
} else {
  $isWindowsHost = $true   # Windows PowerShell 5.1 only ships on Windows
}
if (-not $isWindowsHost) {
  throw 'This runner must execute on Windows. Windows is the authoritative release target; do not adapt the project to another platform.'
}

$osCaption = $null
try { $osCaption = (Get-CimInstance Win32_OperatingSystem).Caption } catch { $osCaption = 'unknown' }
$osVersion = [System.Environment]::OSVersion.VersionString
$arch      = $env:PROCESSOR_ARCHITECTURE
$nodeVer   = (& node -v)
$npmVer    = (& npm -v)

$hostInfo = [ordered]@{
  windowsCaption   = $osCaption
  windowsVersion   = $osVersion
  cpuArchitecture  = $arch
  nodeVersion      = $nodeVer
  npmVersion       = $npmVer
  powershell       = $PSVersionTable.PSVersion.ToString()
  projectRoot      = $ProjectRoot
  timestampUtc     = (Get-Date).ToUniversalTime().ToString('o')
}
$hostInfo.GetEnumerator() | ForEach-Object { Write-Host ("  {0,-16} {1}" -f $_.Key, $_.Value) }

# Node must be >=22 and <25 per package.json engines.
# NOTE: single backslash before the dot. A doubled backslash would match a literal
# backslash and the guard could never succeed.
if ($nodeVer -notmatch '^v(2[2-4])\.') {
  throw "APEX requires Node >=22 and <25 (package.json engines). Current runtime: $nodeVer"
}
if ($npmVer -notmatch '^(1[01])\.') {
  Write-Warning "package.json expects npm >=10.9 <12. Detected: $npmVer"
}

# --------------------------------------------------------------------------------------
# STEP 1 - Dependency restore / integrity on the Windows toolchain
# --------------------------------------------------------------------------------------
Write-Section 'STEP 1 - Windows dependency integrity'

$LockPath = Join-Path $ProjectRoot 'package-lock.json'
$lockBefore = (Get-FileHash -Algorithm SHA256 -Path $LockPath).Hash
Write-Host "  package-lock.json SHA-256 (before): $lockBefore"

if ($ReinstallDeps) {
  $nm = Join-Path $ProjectRoot 'node_modules'
  if (Test-Path $nm) {
    Write-Host '  Removing node_modules (explicitly requested)...' -ForegroundColor Yellow
    Remove-Item -Recurse -Force $nm
  }
}

$tsxShim = Join-Path $ProjectRoot 'node_modules\.bin\tsx.cmd'
if (-not (Test-Path $tsxShim)) {
  Write-Host '  Installing locked dependencies with npm ci...' -ForegroundColor Yellow
  Write-Host '  (Offline? Run scripts\windows\Restore-OfflineDependencies.ps1 first.)'
  & npm ci --no-audit --no-fund
  if ($LASTEXITCODE -ne 0) { throw 'npm ci failed. Do not weaken the lockfile to work around this.' }
} else {
  Write-Host '  Existing Windows dependency install detected (node_modules\.bin\tsx.cmd present).' -ForegroundColor Green
}

# Prove the native toolchain is the Windows one, and that no Linux native leaked in.
$rollupDir  = Join-Path $ProjectRoot 'node_modules\@rollup'
$esbuildDir = Join-Path $ProjectRoot 'node_modules\@esbuild'
$nativeNames = @()
foreach ($d in @($rollupDir, $esbuildDir)) {
  if (Test-Path $d) { $nativeNames += (Get-ChildItem $d -Directory | Select-Object -ExpandProperty Name) }
}
Write-Host "  Resolved native packages: $($nativeNames -join ', ')"

$linuxLeak = $nativeNames | Where-Object { $_ -like '*linux*' }
if ($linuxLeak) {
  throw "Linux-native packages are present and must not be part of the Windows release path: $($linuxLeak -join ', ')"
}
$win32 = $nativeNames | Where-Object { $_ -like '*win32*' }
if (-not $win32) {
  throw 'No win32 Rollup/esbuild native package resolved. The Windows toolchain cannot build in this state.'
}
Write-Host "  Windows natives OK: $($win32 -join ', ')" -ForegroundColor Green

$lockAfter = (Get-FileHash -Algorithm SHA256 -Path $LockPath).Hash
if ($lockAfter -ne $lockBefore) {
  throw "package-lock.json changed during dependency restore ($lockBefore -> $lockAfter). Investigate before continuing; do not accept lockfile drift."
}
Write-Host '  No lockfile drift.' -ForegroundColor Green

# --------------------------------------------------------------------------------------
# Gate table - documented remaining-tasks order
# --------------------------------------------------------------------------------------
$gates = New-Object System.Collections.Generic.List[object]
function Add-Gate {
  param([string]$Phase, [string]$Name, [string]$Exe, [string[]]$GateArgs)
  $gates.Add([pscustomobject]@{ Phase = $Phase; Name = $Name; Exe = $Exe; GateArgs = $GateArgs })
}

Add-Gate 'P0' 'lint (tsc --noEmit)'        'npm' @('run','lint')
Add-Gate 'P0' 'check:test-inventory'       'npm' @('run','check:test-inventory')
Add-Gate 'P0' 'test:unit (701+ tests)'     'npm' @('run','test:unit')
Add-Gate 'P0' 'clean'                      'npm' @('run','clean')
Add-Gate 'P0' 'build (production)'         'npm' @('run','build')
Add-Gate 'P0' 'check:version-identity'     'npm' @('run','check:version-identity')
Add-Gate 'P0' 'check:build-identity'       'npm' @('run','check:build-identity')
Add-Gate 'P1' 'test:runtime'               'npm' @('run','test:runtime')
Add-Gate 'P1' 'check:source-contracts'     'npm' @('run','check:source-contracts')
if (-not $SkipBrowser) {
  Add-Gate 'P1' 'test:browser (14 routes)' 'npm' @('run','test:browser')
}
if (-not $SkipVisual) {
  Add-Gate 'P1' 'test:visual'              'npm' @('run','test:visual')
  Add-Gate 'P1' 'verify:visual'            'npm' @('run','verify:visual')
}
Add-Gate 'P1' 'qa:strategy-studio-reference'          'npm' @('run','qa:strategy-studio-reference')
Add-Gate 'P1' 'qa:strategy-page-modernization'        'npm' @('run','qa:strategy-page-modernization')
Add-Gate 'P1' 'qa:trading-page-modernization'         'npm' @('run','qa:trading-page-modernization')
Add-Gate 'P1' 'qa:backtesting-workspace'              'npm' @('run','qa:backtesting-workspace')
Add-Gate 'P1' 'qa:backtesting-reference-optimization' 'npm' @('run','qa:backtesting-reference-optimization')
Add-Gate 'P1' 'release:gate:source (secret scan)'     'npm' @('run','release:gate:source')

# --------------------------------------------------------------------------------------
# Execute
# --------------------------------------------------------------------------------------
Start-Transcript -Path $Transcript -Force | Out-Null
$results = New-Object System.Collections.Generic.List[object]
$index = 0
$firstFailure = $null

foreach ($gate in $gates) {
  $index++
  $label = "[$($gate.Phase)] $($gate.Name)"
  Write-Section "GATE $index/$($gates.Count) - $label"

  $safeName = ($gate.Name -replace '[^A-Za-z0-9\.-]', '_')
  $gateLog  = Join-Path $LogDir ("{0:d2}-{1}.log" -f $index, $safeName)
  $started  = Get-Date

  Write-Host "> $($gate.Exe) $($gate.GateArgs -join ' ')" -ForegroundColor DarkCyan
  # Splat through a variable: `@($gate.GateArgs)` would be an array *literal* and the
  # native command would receive all arguments collapsed into a single string.
  $gateExe  = $gate.Exe
  $gateArgv = $gate.GateArgs
  & $gateExe @gateArgv 2>&1 | Tee-Object -FilePath $gateLog
  $code = $LASTEXITCODE
  $elapsed = [math]::Round(((Get-Date) - $started).TotalSeconds, 1)

  $status = if ($code -eq 0) { 'PASS' } else { 'FAIL' }
  $colour = if ($code -eq 0) { 'Green' } else { 'Red' }
  Write-Host ("  {0} in {1}s (exit {2})" -f $status, $elapsed, $code) -ForegroundColor $colour

  $results.Add([pscustomobject]@{
    order    = $index
    phase    = $gate.Phase
    gate     = $gate.Name
    command  = "$($gate.Exe) $($gate.GateArgs -join ' ')"
    status   = $status
    exitCode = $code
    seconds  = $elapsed
    log      = (Split-Path -Leaf $gateLog)
  })

  if ($code -ne 0) {
    if (-not $firstFailure) { $firstFailure = $label }
    if (-not $ContinueOnFailure) {
      Write-Host ''
      Write-Host "Stopping at first failing gate: $label" -ForegroundColor Red
      Write-Host "Full output: $gateLog" -ForegroundColor Yellow
      break
    }
  }
}

# --------------------------------------------------------------------------------------
# Evidence + summary
# --------------------------------------------------------------------------------------
$lockFinal = (Get-FileHash -Algorithm SHA256 -Path $LockPath).Hash
$notExecuted = $gates.Count - $results.Count

$distInfo = $null
$distServer = Join-Path $ProjectRoot 'dist\server.cjs'
if (Test-Path $distServer) {
  $distInfo = [ordered]@{
    serverCjsSha256 = (Get-FileHash -Algorithm SHA256 -Path $distServer).Hash
    serverCjsUtc    = (Get-Item $distServer).LastWriteTimeUtc.ToString('o')
  }
}

$payload = [ordered]@{
  schema            = 'apex.windows-verification.v1'
  version           = (Get-Content (Join-Path $ProjectRoot 'VERSION') -Raw).Trim()
  host              = $hostInfo
  lockfileSha256    = [ordered]@{ before = $lockBefore; after = $lockFinal; drift = ($lockBefore -ne $lockFinal) }
  resolvedNatives   = $nativeNames
  gatesTotal        = $gates.Count
  gatesExecuted     = $results.Count
  gatesNotExecuted  = $notExecuted
  passed            = (@($results | Where-Object { $_.status -eq 'PASS' })).Count
  failed            = (@($results | Where-Object { $_.status -eq 'FAIL' })).Count
  firstFailure      = $firstFailure
  dist              = $distInfo
  results           = $results
}
$payload | ConvertTo-Json -Depth 8 | Set-Content -Path $SummaryJson -Encoding UTF8

Stop-Transcript | Out-Null

Write-Section 'SUMMARY'
$results | Format-Table order, phase, status, seconds, gate -AutoSize
Write-Host ("  Executed : {0}/{1}" -f $results.Count, $gates.Count)
Write-Host ("  Passed   : {0}" -f $payload.passed) -ForegroundColor Green
Write-Host ("  Failed   : {0}" -f $payload.failed) -ForegroundColor Red
if ($notExecuted -gt 0) {
  Write-Host ("  NOT EXECUTED: {0} (do not record these as passed)" -f $notExecuted) -ForegroundColor Yellow
}
Write-Host ("  Lockfile drift: {0}" -f $payload.lockfileSha256.drift)
Write-Host ("  Evidence: {0}" -f $LogDir)

if ($payload.failed -gt 0 -or $notExecuted -gt 0) {
  Write-Host ''
  Write-Host 'Release is NOT verified. Fix the failing gate at its root cause; do not lower a gate.' -ForegroundColor Red
  exit 1
}
Write-Host ''
Write-Host 'All requested Windows gates PASSED. Next: npm run verify, then npm run release:package.' -ForegroundColor Green
exit 0
