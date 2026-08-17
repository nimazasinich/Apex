$ErrorActionPreference = "Stop"
$ProjectRoot = Resolve-Path (Join-Path $PSScriptRoot "../..")
Set-Location $ProjectRoot

# The product contract is 1368x753. The surrounding sizes are regression
# checks only; the first capture is always the canonical desktop frame.
$sizes = @(
  @{w=1368; h=753},
  @{w=1280; h=720},
  @{w=1366; h=768},
  @{w=1440; h=900},
  @{w=1536; h=864},
  @{w=1920; h=1080}
)

$Tsx = Join-Path $ProjectRoot "node_modules/.bin/tsx.cmd"
if (-not (Test-Path $Tsx)) {
  throw "tsx is not installed. Run npm ci before the viewport matrix."
}

foreach ($s in $sizes) {
  $env:VIEWPORT_WIDTH = "$($s.w)"
  $env:VIEWPORT_HEIGHT = "$($s.h)"
  $env:SCREENSHOT_OUT_DIR = "_qa/diag/vp-$($s.w)x$($s.h)"
  $env:CAPTURE_FULL_PAGE = "0"
  $env:APP_READY_SELECTOR = ".apex-workspace"
  Write-Output "=== Capturing $($s.w)x$($s.h) ==="
  & $Tsx "scripts/capture/capture-dashboard.mts"
}
