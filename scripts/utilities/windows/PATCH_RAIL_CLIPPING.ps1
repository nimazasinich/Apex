#Requires -Version 7.0
<#
    PATCH_RAIL_CLIPPING.ps1

    Guarded single-purpose patch for the dark-theme rail-button horizontal
    clipping bug at the 1368x753 workstation viewport.

    Target : src/components/trading/TradingWorkspace.css
    Scope  : replaces exactly ONE confirmed block; makes no other change.

    Exit codes:
      0 = PASS  (block replaced and verified)
      1 = FAIL  (guard tripped; file left untouched, or restored from backup)
#>

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# --------------------------------------------------------------------------
# Configuration
# --------------------------------------------------------------------------

$ProjectRoot = 'C:\project\APEX-frontend-phase31\APEX-unified-maximal-v1.0.56-r2-merged-source\APEX-unified-maximal-v1.0.56-r2-merged'
$TargetFile  = Join-Path $ProjectRoot 'src\components\trading\TradingWorkspace.css'
$ExpectedCount = 1

$OldBlock = @'
  .apex-trading-modern .apex-rail-button {
    width: 54px !important;
    min-width: 54px !important;
    height: 52px !important;
    min-height: 52px !important;
    gap: 3px !important;
    padding: 5px 3px !important;
    border-radius: 11px !important;
  }
  .apex-trading-modern .apex-rail-button > span { max-width: 48px !important; font-size: 10px !important; }
'@

$NewBlock = @'
  .apex-trading-modern .apex-rail-button {
    box-sizing: border-box !important;
    width: 34px !important;
    min-width: 34px !important;
    max-width: 34px !important;
    height: 52px !important;
    min-height: 52px !important;
    gap: 0 !important;
    padding: 0 !important;
    border-radius: 10px !important;
  }
  .apex-trading-modern .apex-rail-button > span { display: none !important; }
  .apex-trading-modern .apex-rail-button svg {
    width: 19px !important;
    height: 19px !important;
  }
'@

# --------------------------------------------------------------------------
# Helpers
# --------------------------------------------------------------------------

function Write-Step { param([string]$Message) Write-Host "  $Message" }

function Fail {
    param([string]$Reason)
    Write-Host ''
    Write-Host 'FAIL' -ForegroundColor Red
    Write-Host "  reason: $Reason"
    exit 1
}

function Get-OccurrenceCount {
    param([string]$Haystack, [string]$Needle)
    $count = 0
    $index = 0
    while ($true) {
        $index = $Haystack.IndexOf($Needle, $index, [System.StringComparison]::Ordinal)
        if ($index -lt 0) { break }
        $count++
        $index += $Needle.Length
    }
    return $count
}

# Re-join a here-string's lines using the newline convention of the target file
# so matching never depends on this script's own line endings.
function ConvertTo-FileNewline {
    param([string]$Text, [string]$Newline)
    $lines = [regex]::Split($Text, "\r\n|\n|\r")
    return ($lines -join $Newline)
}

Write-Host ''
Write-Host 'APEX rail-clipping patch (dark theme, 1368x753)'
Write-Host '-----------------------------------------------'

# --------------------------------------------------------------------------
# 1. Target must exist
# --------------------------------------------------------------------------

if (-not (Test-Path -LiteralPath $TargetFile -PathType Leaf)) {
    Fail "target file not found: $TargetFile"
}
Write-Step "target : $TargetFile"

# --------------------------------------------------------------------------
# 2. Read raw bytes, detect encoding (BOM) and newline convention
# --------------------------------------------------------------------------

$bytes = [System.IO.File]::ReadAllBytes($TargetFile)

$hasUtf8Bom = ($bytes.Length -ge 3 -and $bytes[0] -eq 0xEF -and $bytes[1] -eq 0xBB -and $bytes[2] -eq 0xBF)
$isUtf16Le  = ($bytes.Length -ge 2 -and $bytes[0] -eq 0xFF -and $bytes[1] -eq 0xFE)
$isUtf16Be  = ($bytes.Length -ge 2 -and $bytes[0] -eq 0xFE -and $bytes[1] -eq 0xFF)

if ($isUtf16Le -or $isUtf16Be) {
    Fail 'target is UTF-16; this patch only handles UTF-8 (refusing to re-encode)'
}

# Preserve exactly what was there: UTF-8 with or without BOM.
$encoding = [System.Text.UTF8Encoding]::new($hasUtf8Bom)
$original = $encoding.GetString($bytes)
if ($hasUtf8Bom) { $original = $original.TrimStart([char]0xFEFF) }

$newline = if ($original.Contains("`r`n")) { "`r`n" } else { "`n" }
$newlineLabel = if ($newline -eq "`r`n") { 'CRLF' } else { 'LF' }
$bomLabel = if ($hasUtf8Bom) { 'UTF-8 with BOM' } else { 'UTF-8 without BOM' }

Write-Step "encoding: $bomLabel / $newlineLabel"
Write-Step "size    : $($bytes.Length) bytes"

$oldNormalized = ConvertTo-FileNewline -Text $OldBlock -Newline $newline
$newNormalized = ConvertTo-FileNewline -Text $NewBlock -Newline $newline

# --------------------------------------------------------------------------
# 3. Guard: OLD block must appear exactly ExpectedCount times
# --------------------------------------------------------------------------

$oldCount = Get-OccurrenceCount -Haystack $original -Needle $oldNormalized
Write-Step "OLD block occurrences: $oldCount (expected $ExpectedCount)"

if ($oldCount -eq 0) {
    $alreadyPatched = Get-OccurrenceCount -Haystack $original -Needle $newNormalized
    if ($alreadyPatched -ge 1) {
        Fail 'OLD block not found, but NEW block is already present - patch appears to have been applied already; nothing to do'
    }
    Fail 'OLD block not found (file differs from the confirmed baseline) - no changes made'
}
if ($oldCount -ne $ExpectedCount) {
    Fail "OLD block found $oldCount times, expected exactly $ExpectedCount - refusing to guess; no changes made"
}

# Guard: refuse if the NEW block is somehow already present alongside the OLD.
$preNewCount = Get-OccurrenceCount -Haystack $original -Needle $newNormalized
if ($preNewCount -ne 0) {
    Fail "NEW block already present $preNewCount time(s) before patching - ambiguous state; no changes made"
}

# --------------------------------------------------------------------------
# 4. Timestamped backup (before any write)
# --------------------------------------------------------------------------

$stamp      = Get-Date -Format 'yyyyMMdd-HHmmss'
$backupPath = "$TargetFile.bak-$stamp"

if (Test-Path -LiteralPath $backupPath) {
    Fail "backup path already exists: $backupPath"
}

[System.IO.File]::WriteAllBytes($backupPath, $bytes)

if (-not (Test-Path -LiteralPath $backupPath -PathType Leaf)) {
    Fail "backup could not be created: $backupPath"
}
$backupBytes = (Get-Item -LiteralPath $backupPath).Length
if ($backupBytes -ne $bytes.Length) {
    Fail "backup size mismatch ($backupBytes vs $($bytes.Length)) - aborting before write"
}
Write-Step "backup : $backupPath ($backupBytes bytes)"

# --------------------------------------------------------------------------
# 5. Replace ONLY the confirmed block
# --------------------------------------------------------------------------

$position = $original.IndexOf($oldNormalized, [System.StringComparison]::Ordinal)
$patched  = $original.Substring(0, $position) +
            $newNormalized +
            $original.Substring($position + $oldNormalized.Length)

# Sanity: everything outside the replaced span must be identical.
$expectedLength = $original.Length - $oldNormalized.Length + $newNormalized.Length
if ($patched.Length -ne $expectedLength) {
    Fail 'internal length check failed - no write performed'
}
if ($patched.Substring(0, $position) -cne $original.Substring(0, $position)) {
    Fail 'content before the patched block changed - no write performed'
}
$tailOriginal = $original.Substring($position + $oldNormalized.Length)
$tailPatched  = $patched.Substring($position + $newNormalized.Length)
if ($tailPatched -cne $tailOriginal) {
    Fail 'content after the patched block changed - no write performed'
}

try {
    [System.IO.File]::WriteAllText($TargetFile, $patched, $encoding)
}
catch {
    [System.IO.File]::WriteAllBytes($TargetFile, $bytes)
    Fail "write failed ($($_.Exception.Message)); original restored from in-memory copy"
}

Write-Step 'write  : complete'

# --------------------------------------------------------------------------
# 6. Read back from disk and verify
# --------------------------------------------------------------------------

$verifyBytes = [System.IO.File]::ReadAllBytes($TargetFile)
$verifyText  = $encoding.GetString($verifyBytes)
if ($hasUtf8Bom) { $verifyText = $verifyText.TrimStart([char]0xFEFF) }

$verifyNewCount = Get-OccurrenceCount -Haystack $verifyText -Needle $newNormalized
$verifyOldCount = Get-OccurrenceCount -Haystack $verifyText -Needle $oldNormalized

Write-Step "read-back NEW block occurrences: $verifyNewCount (expected 1)"
Write-Step "read-back OLD block occurrences: $verifyOldCount (expected 0)"

if ($hasUtf8Bom) {
    $verifyBomOk = ($verifyBytes.Length -ge 3 -and $verifyBytes[0] -eq 0xEF -and $verifyBytes[1] -eq 0xBB -and $verifyBytes[2] -eq 0xBF)
} else {
    $verifyBomOk = -not ($verifyBytes.Length -ge 3 -and $verifyBytes[0] -eq 0xEF -and $verifyBytes[1] -eq 0xBB -and $verifyBytes[2] -eq 0xBF)
}

$restoreNeeded = $false
$failReason    = $null

if ($verifyNewCount -ne 1)         { $restoreNeeded = $true; $failReason = "NEW block found $verifyNewCount time(s) after write, expected 1" }
elseif ($verifyOldCount -ne 0)     { $restoreNeeded = $true; $failReason = "OLD block still present $verifyOldCount time(s) after write" }
elseif ($verifyText -cne $patched) { $restoreNeeded = $true; $failReason = 'read-back content does not match what was written' }
elseif (-not $verifyBomOk)         { $restoreNeeded = $true; $failReason = 'encoding/BOM was not preserved' }

if ($restoreNeeded) {
    [System.IO.File]::WriteAllBytes($TargetFile, $bytes)
    Write-Step "restored original from backup copy ($backupPath retained)"
    Fail $failReason
}

# --------------------------------------------------------------------------
# 7. Report
# --------------------------------------------------------------------------

$delta = $verifyBytes.Length - $bytes.Length
$deltaText = if ($delta -ge 0) { "+$delta" } else { "$delta" }

Write-Host ''
Write-Host 'PASS' -ForegroundColor Green
Write-Host "  file           : $TargetFile"
Write-Host "  backup         : $backupPath"
Write-Host "  blocks replaced: 1"
Write-Host "  size           : $($bytes.Length) -> $($verifyBytes.Length) bytes ($deltaText)"
Write-Host "  encoding       : $bomLabel / $newlineLabel (preserved)"
Write-Host "  other changes  : none"
Write-Host ''
exit 0