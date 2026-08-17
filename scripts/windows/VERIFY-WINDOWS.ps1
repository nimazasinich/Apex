<#
Runs the canonical Windows verification sequence after npm dependencies are installed.
Use Restore-OfflineDependencies.ps1 first when working from the uploaded tarball bundle.
#>
$ErrorActionPreference = "Stop"
$checks = @(
  @('npm', @('run', 'lint')),
  @('npm', @('run', 'build')),
  @('npm', @('test')),
  @('node', @('scripts/qa/generateSmartBacktestingSyntheticFixtures.mjs')),
  @('node', @('scripts/qa/verifySmartBacktestingRuntimeHardening.mjs')),
  @('node', @('scripts/qa/verifyBacktestingStudioModernization.mjs')),
  @('node', @('scripts/qa/verifyBacktestingWorkspace.mjs')),
  @('node', @('scripts/qa/verifyBacktestingReferenceOptimization.mjs')),
  @('node', @('scripts/qa/verifySmartAutopilot.mjs')),
  @('node', @('scripts/qa/verifyStrategyPageModernization.mjs')),
  @('node', @('scripts/qa/verifyStrategyStudioReference.mjs')),
  @('node', @('scripts/qa/verifyTradingPageModernization.mjs')),
  @('node', @('scripts/qa/verifyTradingDrawerDocking.mjs')),
  @('node', @('scripts/qa/verifyFeaturePreservation.mjs')),
  @('node', @('scripts/qa/verifyResearchWorkspaceLayout.mjs')),
  @('node', @('scripts/qa/verifySystemIntegration.mjs')),
  @('node', @('scripts/qa/verifyMaximalMergeSafety.mjs')),
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
Write-Host "Windows verification sequence completed." -ForegroundColor Green
