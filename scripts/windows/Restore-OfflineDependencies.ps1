<#
.SYNOPSIS
  Restores APEX npm dependencies from an uploaded offline tarball bundle on Windows.

.DESCRIPTION
  This script is intentionally Windows-first. It extracts apex-npm-tarballs.zip,
  seeds a local npm cache, runs npm ci with --prefer-offline, and then runs the
  core verification commands. If a tarball is missing, it prints the exact
  package URL from downloads-manifest.txt instead of silently weakening the lock.
#>
param(
  [string]$TarballZip = ".\apex-npm-tarballs.zip",
  [switch]$SkipChecks
)

$ErrorActionPreference = "Stop"
$Root = (Resolve-Path ".").Path
$OfflineDeps = Join-Path $Root ".offline-deps"
$NpmCache = Join-Path $Root ".npm-cache"

Write-Host "APEX offline dependency restore" -ForegroundColor Cyan
Write-Host "Project root: $Root"
Write-Host "Tarball ZIP : $TarballZip"

if (-not (Test-Path $TarballZip)) {
  throw "Dependency ZIP not found: $TarballZip. Place apex-npm-tarballs.zip in the project root or pass -TarballZip."
}

$nodeVersion = (& node -v)
$npmVersion = (& npm -v)
Write-Host "Node: $nodeVersion; npm: $npmVersion"
if ($nodeVersion -notmatch '^v2[2-4]\.') {
  throw "APEX requires Node >=22 and <25. Current runtime: $nodeVersion"
}

New-Item -ItemType Directory -Force $OfflineDeps | Out-Null
New-Item -ItemType Directory -Force $NpmCache | Out-Null
Expand-Archive -Path $TarballZip -DestinationPath $OfflineDeps -Force

$manifest = Join-Path $OfflineDeps "downloads-manifest.txt"
if (Test-Path $manifest) {
  $failed = Select-String -Path $manifest -Pattern '^FAILED \| ' -ErrorAction SilentlyContinue
  if ($failed) {
    Write-Warning "The uploaded bundle reports failed downloads. npm ci will try the registry for these if network is available:"
    $failed | ForEach-Object { Write-Warning $_.Line }
  }
}

$tarballs = Get-ChildItem $OfflineDeps -Recurse -Filter *.tgz
if (-not $tarballs.Count) { throw "No .tgz npm tarballs were found in $OfflineDeps" }
Write-Host "Caching $($tarballs.Count) npm tarballs..."
foreach ($pkg in $tarballs) {
  & npm cache add $pkg.FullName --cache $NpmCache
  if ($LASTEXITCODE -ne 0) { throw "npm cache add failed for $($pkg.FullName)" }
}

Write-Host "Running npm ci --prefer-offline..." -ForegroundColor Cyan
& npm ci --prefer-offline --cache $NpmCache
if ($LASTEXITCODE -ne 0) {
  throw "npm ci failed. Check missing/failed tarballs above, Node/npm version, and platform optional dependencies."
}

if (-not $SkipChecks) {
  $checks = @(
    @('npm', @('run', 'lint')),
    @('npm', @('run', 'build')),
    @('npm', @('test')),
    @('node', @('scripts/qa/verifyBacktestingStudioModernization.mjs')),
    @('node', @('scripts/qa/verifySmartBacktestingRuntimeHardening.mjs')),
    @('node', @('scripts/qa/verifyStrategyPageModernization.mjs')),
    @('node', @('scripts/qa/verifyTradingPageModernization.mjs')),
    @('node', @('scripts/gates/checkRootContract.mjs')),
    @('node', @('scripts/gates/checkVersionIdentity.mjs')),
    @('node', @('scripts/gates/checkBuildIdentity.mjs')),
    @('node', @('scripts/gates/checkNoSecretsInRelease.mjs', '--source-only')),
    @('node', @('scripts/gates/checkTestInventory.mjs'))
  )
  foreach ($check in $checks) {
    $cmd = $check[0]
    $args = $check[1]
    Write-Host "`n> $cmd $($args -join ' ')" -ForegroundColor Cyan
    & $cmd @args
    if ($LASTEXITCODE -ne 0) { throw "Check failed: $cmd $($args -join ' ')" }
  }
}

Write-Host "APEX dependency restore complete." -ForegroundColor Green
