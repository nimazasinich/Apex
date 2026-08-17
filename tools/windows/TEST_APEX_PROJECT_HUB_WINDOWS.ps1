[CmdletBinding()]
param(
  [string]$Executable = (Join-Path $PSScriptRoot 'APEXProjectHub.exe')
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function Assert-True {
  param([bool]$Condition, [string]$Message)
  if (-not $Condition) { throw $Message }
}

function Invoke-Hub {
  param([string[]]$Arguments)
  $output = & $Executable @Arguments 2>&1
  $exit = $LASTEXITCODE
  [pscustomobject]@{ ExitCode = $exit; Output = ($output -join [Environment]::NewLine) }
}

Assert-True (Test-Path -LiteralPath $Executable -PathType Leaf) "APEXProjectHub.exe not found: $Executable"
Assert-True ((Get-Command node -ErrorAction SilentlyContinue) -ne $null) 'Node.js is required for this end-to-end test.'
Assert-True ((Get-Command npm -ErrorAction SilentlyContinue) -ne $null) 'npm is required for this end-to-end test.'

$expectedHash = '36cfec27c096c408c4920e07ddaa0aaaf5ed4df7c0e5bf843be967720f2f0f00'
$actualHash = (Get-FileHash -LiteralPath $Executable -Algorithm SHA256).Hash.ToLowerInvariant()
Assert-True ($actualHash -eq $expectedHash) "SHA-256 mismatch. Expected $expectedHash, got $actualHash"

$testRoot = Join-Path $env:TEMP ("APEXProjectHub-E2E-" + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $testRoot | Out-Null
$reportPath = Join-Path $PSScriptRoot 'APEXProjectHub_Windows_Test_Result.json'

$result = [ordered]@{
  startedAt = (Get-Date).ToString('o')
  executable = (Resolve-Path $Executable).Path
  sha256 = $actualHash
  tempProject = $testRoot
  checks = [ordered]@{}
  success = $false
}

try {
  Copy-Item -LiteralPath $Executable -Destination (Join-Path $testRoot 'APEXProjectHub.exe')
  $Executable = Join-Path $testRoot 'APEXProjectHub.exe'

  $package = [ordered]@{
    name = 'apex-project-hub-e2e-fixture'
    version = '1.0.0'
    private = $true
    scripts = [ordered]@{
      dev = 'node -e "require(''fs'').writeFileSync(''dev.marker'',''ok'')"'
      build = 'node -e "require(''fs'').writeFileSync(''build.marker'',''ok'')"'
    }
  }
  $packagePath = Join-Path $testRoot 'package.json'
  $package | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $packagePath -Encoding utf8
  $originalPackage = Get-Content -LiteralPath $packagePath -Raw

  Push-Location $testRoot
  try {
    $version = Invoke-Hub @('version')
    Assert-True ($version.ExitCode -eq 0) "version failed: $($version.Output)"
    $result.checks.version = $version.Output

    $install = Invoke-Hub @('install')
    Assert-True ($install.ExitCode -eq 0) "install failed: $($install.Output)"
    $result.checks.install = $install.Output

    Assert-True (Test-Path 'package.json.apex-hub.bak') 'Installer did not create package.json.apex-hub.bak.'
    Assert-True (Test-Path '.apex-hub.json') 'Installer did not create .apex-hub.json.'
    Assert-True (Test-Path '.apex-index/project-index.db.json') 'Initial index database was not created.'
    Assert-True (Test-Path '.apex-index/project-index.csv') 'Initial CSV index was not created.'
    Assert-True (Test-Path '.apex-index/api-contract.csv') 'API contract CSV was not created.'
    Assert-True (Test-Path '.apex-index/findings.json') 'Findings report was not created.'
    Assert-True (Test-Path '.apex-index/PROJECT_INDEX.md') 'Markdown report was not created.'
    Assert-True (Test-Path '.apex-index/project-index.html') 'HTML dashboard was not created.'
    Assert-True (Test-Path '.apex-index/hub.log') 'Hub log was not created.'

    $installedPackage = Get-Content package.json -Raw | ConvertFrom-Json
    $scriptNames = @($installedPackage.scripts.PSObject.Properties.Name)
    Assert-True ($scriptNames -contains 'hub:dev:original') 'hub:dev:original was not created.'
    Assert-True ($scriptNames -contains 'hub:build:original') 'hub:build:original was not created.'
    Assert-True ($installedPackage.scripts.dev -match 'APEXProjectHub\.exe.+wrap dev') 'dev wrapper was not installed correctly.'
    Assert-True ($installedPackage.scripts.build -match 'APEXProjectHub\.exe.+wrap build') 'build wrapper was not installed correctly.'
    $result.checks.hooks = 'package.json wrappers and preserved scripts verified'

    & npm run dev
    Assert-True ($LASTEXITCODE -eq 0) 'npm run dev failed through the Hub wrapper.'
    Assert-True (Test-Path 'dev.marker') 'Original dev command did not execute.'
    $result.checks.dev = 'passed'

    & npm run build
    Assert-True ($LASTEXITCODE -eq 0) 'npm run build failed through the Hub wrapper.'
    Assert-True (Test-Path 'build.marker') 'Original build command did not execute.'
    $result.checks.build = 'passed'

    $status = Invoke-Hub @('status')
    Assert-True ($status.ExitCode -eq 0) "status failed: $($status.Output)"
    $result.checks.status = $status.Output

    $report = Invoke-Hub @('report')
    Assert-True ($report.ExitCode -eq 0) "report failed: $($report.Output)"
    $result.checks.report = $report.Output

    $uninstall = Invoke-Hub @('uninstall')
    Assert-True ($uninstall.ExitCode -eq 0) "uninstall failed: $($uninstall.Output)"
    $result.checks.uninstall = $uninstall.Output

    $restoredPackage = Get-Content -LiteralPath $packagePath -Raw
    Assert-True ($restoredPackage -eq $originalPackage) 'package.json was not restored byte-for-byte after uninstall.'
    $result.checks.restore = 'package.json restored byte-for-byte'

    $result.success = $true
  }
  finally {
    Pop-Location
  }
}
catch {
  $result.error = $_.Exception.Message
  throw
}
finally {
  $result.finishedAt = (Get-Date).ToString('o')
  $result | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $reportPath -Encoding utf8
  Write-Host "Test report: $reportPath"
  Write-Host "Temporary fixture: $testRoot"
}

Write-Host 'APEXProjectHub Windows end-to-end test PASSED.' -ForegroundColor Green
