================================================================================
  CLAUDE CODE WINDOWS DOCTOR v4.0.0
  WINDOWS FILESYSTEM + CLAUDE CODE DIAGNOSTIC & SAFE REPAIR UTILITY
================================================================================

Target OS : Windows 10 / Windows 11 x64
PowerShell: Windows PowerShell 5.1 or PowerShell 7+
Default   : NON-DESTRUCTIVE DIAGNOSTICS

IMPORTANT
---------
This Doctor treats working third-party/custom inference configuration as protected.
It does not intentionally modify gateway URLs, API keys, credentials, model routing,
or authentication settings.

Recommended extraction directory:
  %USERPROFILE%\Desktop\ClaudeCodeRepair

Do NOT store the Doctor bundle inside the project root being diagnosed.

--------------------------------------------------------------------------------
QUICK START
--------------------------------------------------------------------------------
Double-click:
  Run-Claude-Code-Windows-Doctor.cmd

The launcher uses -ExecutionPolicy Bypass only for the child PowerShell process.
It does NOT override MachinePolicy/UserPolicy Group Policy enforcement.

Direct diagnostic:
  .\Claude-Code-Windows-Doctor.ps1 -DiagnosticOnly -ExportReport

Choose a project:
  .\Claude-Code-Windows-Doctor.ps1 -ProjectPath "C:\project\my-app" -DiagnosticOnly

Add filesystem paths:
  .\Claude-Code-Windows-Doctor.ps1 -ProjectPath "C:\project\my-app" -TestPath "C:\shared","D:\work" -DiagnosticOnly

Filesystem-only diagnostic:
  .\Claude-Code-Windows-Doctor.ps1 -ProjectPath "C:\project\my-app" -FilesystemOnly -ExportReport

Dry-run safe repair (ZERO WRITES):
  .\Claude-Code-Windows-Doctor.ps1 -Repair -RepairProfile Safe -DryRun

Apply safe user-settings repair with per-change confirmation:
  .\Claude-Code-Windows-Doctor.ps1 -Repair -RepairProfile Safe

Security-sensitive repair offers are separately gated and still require explicit
interactive confirmation:
  .\Claude-Code-Windows-Doctor.ps1 -Repair -RepairProfile Safe -SecuritySensitiveRepair

Automation / NDJSON diagnostics:
  .\Claude-Code-Windows-Doctor.ps1 -DiagnosticOnly -NonInteractive -OutputFormat NDJSON

Non-interactive SAFE repair requires the profile to be explicit:
  .\Claude-Code-Windows-Doctor.ps1 -Repair -RepairProfile Safe -NonInteractive

Unrestricted repair is blocked in -NonInteractive mode.

Named profile:
  .\Claude-Code-Windows-Doctor.ps1 -ProfileName "APEX Work" -ProjectPath "C:\project\my-app" -TestPath "C:\shared" -SaveProfile
  .\Claude-Code-Windows-Doctor.ps1 -ProfileName "APEX Work" -DiagnosticOnly

--------------------------------------------------------------------------------
FILESYSTEM ACCESS DIAGNOSTICS
--------------------------------------------------------------------------------
For each selected path the Doctor independently checks:
  - existence / enumeration
  - actual content read when a safe sample exists
  - temporary file create/write
  - read-back validation
  - delete validation
  - cleanup

On failures it records the .NET exception type/HRESULT and performs read-only
follow-up checks for ACL/owner/inheritance, likely file-lock causes, cloud-sync
attributes, Defender configuration and long-path risk.

ACL evidence includes the target and parent path when available. ACL observations
are not presented as a perfect Effective Access calculation; actual read/write/delete
probes are considered stronger evidence.

Filesystem MCP / Desktop Commander analysis is intentionally split into evidence levels:
  CONFIGURED
  EXECUTABLE RESOLVED
  ROOT COVERAGE CONFIG-CHECKED
  CLAUDE CLI LISTED (when available)
  LIVE MCP TOOL TESTED (only when real evidence exists)

The Doctor never calls a config-only MCP result "healthy" or "live tested".

Filesystem target normalization is case-insensitive for duplicate detection and preserves
Windows drive/share roots. Actual I/O probes remain authoritative over ACL/config guesses.

--------------------------------------------------------------------------------
SAFE REPAIR MODEL
--------------------------------------------------------------------------------
Safe repair may propose user-level settings such as:
  permissions.defaultMode = acceptEdits
  permissions.disableAutoMode = disable
  env.CLAUDE_CODE_USE_POWERSHELL_TOOL = 1
  defaultShell = powershell

Before writes it shows a diff and allows individual changes to be declined.
Malformed settings.json is backed up and BLOCKS automatic repair; it is never
silently rebuilt from defaults.

Critical settings replacement uses a validated temporary JSON file and Windows
File.Replace so the destination update is atomic on supported Windows filesystems.
Any failure triggers restoration from the recorded backup.

Full diagnostics also parse the Doctor source with the real PowerShell AST parser. If
PSScriptAnalyzer is installed, it is run as an optional additional quality check.

Security-sensitive operations are NOT part of normal Safe Repair:
  - ACL grants / owner changes
  - Defender exclusions
  - managed Registry policy changes
  - certificate installation / validation bypass
  - process termination

ACL/Defender live repair offers require -SecuritySensitiveRepair and an explicit
interactive confirmation. The Doctor never automatically grants Full Control,
takes ownership, disables TLS validation, or kills unrelated processes.

--------------------------------------------------------------------------------
CLAUDE SETTINGS / TOOL SEARCH
--------------------------------------------------------------------------------
The Doctor keeps Claude Desktop deployment policy separate from Claude Code managed
settings. For Claude Code, locally observable managed sources are resolved by the
Windows managed-source hierarchy; server-managed settings can only be confirmed by
the actual Claude Code session (for example with /status).

The Doctor does not invent environment-variable overrides for normal scalar settings.
CLAUDE_CODE_USE_POWERSHELL_TOOL and ENABLE_TOOL_SEARCH are treated as environment
settings because Claude Code exposes them that way.

Tool Search compatibility through a custom ANTHROPIC_BASE_URL is never assumed.
The Doctor distinguishes configured behavior from proxy compatibility and asks for a
real Claude Code ToolSearch test before declaring custom-gateway compatibility.

--------------------------------------------------------------------------------
REPORTS / BACKUPS
--------------------------------------------------------------------------------
Reports:
  %USERPROFILE%\Desktop\ClaudeCodeRepair\Reports

Backups:
  %USERPROFILE%\Desktop\ClaudeCodeRepair\Backups

Each settings backup has a backup-manifest.json containing the recorded original
path and hashes. Rollback shows a preview before restoring to that exact path.

--------------------------------------------------------------------------------
LIMITATIONS
--------------------------------------------------------------------------------
- Browser UI cannot inspect Windows directly; real results come from imported
  Doctor JSON or the PowerShell console/report.
- MCP root coverage can be checked from configuration, but live MCP file calls
  are only marked live-tested when an actual protocol/tool result is available.
- Absence of a Defender exclusion is not a failure by itself.
- ACL inspection is not a substitute for the real read/write/delete probe.
- Do not disable TLS certificate verification as a workaround.
- Process-local -ExecutionPolicy Bypass does not override MachinePolicy/UserPolicy.
- Duplicate runtime detection collapses child npm/node/server processes from one ancestor
  chain into a single runtime branch before declaring concurrent duplicates.
================================================================================
