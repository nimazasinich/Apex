$ErrorActionPreference = "Stop"

# APEX apex-fileops installer/fixer
$ProjectRoot = 'C:\project\APEX-frontend-phase31\APEX-unified-maximal-v1.0.56-r2-merged-source\APEX-unified-maximal-v1.0.56-r2-merged'

$CorrectDst = Join-Path $ProjectRoot '.claude\skills\apex-fileops'
$WrongDst   = "$ProjectRoot.claude\skills\apex-fileops"

$SourceCandidates = @(
    'C:\Users\Dreammaker\AppData\Local\Claude-3p\local-agent-mode-sessions\b3b3a33d\00000000\local_ccb63983-a96a-4345-b25a-b87582a54f6b\outputs\apex-fileops',
    'C:\Users\Dreammaker\AppData\Local\Claude-3p\local-agent-mode-sessions\b3b3a33d\00000000\local\_ccb63983-a96a-4345-b25a-b87582a54f6b\outputs\apex-fileops',
    $WrongDst
)

function Test-ApexFileOpsSource {
    param([Parameter(Mandatory)][string]$Path)
    return (
        (Test-Path -LiteralPath (Join-Path $Path 'SKILL.md') -PathType Leaf) -and
        (Test-Path -LiteralPath (Join-Path $Path 'scripts\FileOps.ps1') -PathType Leaf)
    )
}

function Fail {
    param([Parameter(Mandatory)][string]$Message)
    Write-Host ""
    Write-Host "ERROR: $Message" -ForegroundColor Red
    exit 1
}

Write-Host "APEX apex-fileops installer/fixer" -ForegroundColor Cyan
Write-Host "Project: $ProjectRoot"
Write-Host ""

if (-not (Test-Path -LiteralPath $ProjectRoot -PathType Container)) {
    Fail "Project root does not exist: $ProjectRoot"
}

$Source = $null
foreach ($candidate in $SourceCandidates) {
    if (Test-ApexFileOpsSource -Path $candidate) {
        $Source = $candidate
        break
    }
}

if (-not $Source) {
    Write-Host "Checked these candidate locations:" -ForegroundColor Yellow
    $SourceCandidates | ForEach-Object { Write-Host "  $_" }
    Fail "Could not find both SKILL.md and scripts\FileOps.ps1."
}

Write-Host "Source found:" -ForegroundColor Green
Write-Host "  $Source"
Write-Host ""

[System.IO.Directory]::CreateDirectory((Join-Path $CorrectDst 'scripts')) | Out-Null

$SourceSkill = Join-Path $Source 'SKILL.md'
$SourceOps   = Join-Path $Source 'scripts\FileOps.ps1'
$DestSkill   = Join-Path $CorrectDst 'SKILL.md'
$DestOps     = Join-Path $CorrectDst 'scripts\FileOps.ps1'

[System.IO.File]::Copy($SourceSkill, $DestSkill, $true)
[System.IO.File]::Copy($SourceOps,   $DestOps,   $true)

if (-not (Test-Path -LiteralPath $DestSkill -PathType Leaf)) {
    Fail "SKILL.md was not created at the correct destination."
}
if (-not (Test-Path -LiteralPath $DestOps -PathType Leaf)) {
    Fail "FileOps.ps1 was not created at the correct destination."
}

$skillInfo = Get-Item -LiteralPath $DestSkill
$opsInfo   = Get-Item -LiteralPath $DestOps
if ($skillInfo.Length -le 0) { Fail "SKILL.md is empty." }
if ($opsInfo.Length -le 0)   { Fail "FileOps.ps1 is empty." }

$skillText = [System.IO.File]::ReadAllText($DestSkill)
$opsText   = [System.IO.File]::ReadAllText($DestOps)

if (-not $skillText.StartsWith("---")) {
    Fail "SKILL.md does not start with YAML frontmatter."
}
if ($skillText -notmatch '(?m)^\s*name:\s*apex-fileops\s*$') {
    Fail "SKILL.md YAML frontmatter does not contain: name: apex-fileops"
}
$frontmatterMatches = [regex]::Matches($skillText, '(?m)^---\s*$')
if ($frontmatterMatches.Count -lt 2) {
    Fail "SKILL.md YAML frontmatter does not have a closing --- delimiter."
}

$RequiredActions = @('Read', 'Write', 'Edit', 'Search', 'List')
$MissingActions = @()
foreach ($action in $RequiredActions) {
    $escaped = [regex]::Escape($action)
    $hasAction =
        ($opsText -match ('"' + $escaped + '"')) -or
        ($opsText -match ("'" + $escaped + "'")) -or
        ($opsText -match ('Invoke-' + $escaped + 'Action'))
    if (-not $hasAction) {
        $MissingActions += $action
    }
}
if ($MissingActions.Count -gt 0) {
    Fail ("FileOps.ps1 is missing expected action(s): " + ($MissingActions -join ', '))
}

$skillHash = (Get-FileHash -LiteralPath $DestSkill -Algorithm SHA256).Hash
$opsHash   = (Get-FileHash -LiteralPath $DestOps -Algorithm SHA256).Hash

Write-Host "Verification PASSED." -ForegroundColor Green
Write-Host ""
Write-Host "Installed files:" -ForegroundColor Cyan
Write-Host "  $DestSkill"
Write-Host "  $DestOps"
Write-Host ""
Write-Host "Sizes:"
Write-Host "  SKILL.md    : $($skillInfo.Length) bytes"
Write-Host "  FileOps.ps1 : $($opsInfo.Length) bytes"
Write-Host ""
Write-Host "SHA256:"
Write-Host "  SKILL.md    : $skillHash"
Write-Host "  FileOps.ps1 : $opsHash"

$WrongClaudeRoot = "$ProjectRoot.claude"
if (
    (Test-Path -LiteralPath $WrongClaudeRoot -PathType Container) -and
    ($WrongClaudeRoot -ne (Join-Path $ProjectRoot '.claude'))
) {
    Write-Host ""
    Write-Host "Mistaken path detected:" -ForegroundColor Yellow
    Write-Host "  $WrongClaudeRoot"

    if (Test-Path -LiteralPath $WrongDst -PathType Container) {
        # Remove ONLY the mistaken apex-fileops folder. Never recursively delete
        # the whole mistaken root because it could contain unrelated files.
        Remove-Item -LiteralPath $WrongDst -Recurse -Force
        Write-Host "Removed only the mistaken apex-fileops folder after successful verification." -ForegroundColor Green

        # Remove empty parent folders only.
        $wrongSkills = Split-Path $WrongDst -Parent
        foreach ($dir in @($wrongSkills, $WrongClaudeRoot)) {
            if (Test-Path -LiteralPath $dir -PathType Container) {
                $remaining = @(Get-ChildItem -LiteralPath $dir -Force)
                if ($remaining.Count -eq 0) {
                    Remove-Item -LiteralPath $dir -Force
                }
            }
        }
    } else {
        Write-Host "No mistaken apex-fileops folder found; nothing was deleted." -ForegroundColor Yellow
    }
}

Write-Host ""
Write-Host "FINAL CORRECT LOCATION:" -ForegroundColor Green
Write-Host "  $CorrectDst"
Write-Host ""
Write-Host "If Claude does not detect the new project-local skill immediately, restart/reopen the Claude Code/Desktop project session."
