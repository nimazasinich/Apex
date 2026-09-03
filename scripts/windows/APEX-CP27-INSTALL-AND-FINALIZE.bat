@echo off
setlocal EnableExtensions DisableDelayedExpansion
title APEX CP27 - LOCKED DEPENDENCY RESTORE + WINDOWS FINALIZATION

set "DEFAULT_PROJECT=C:\project\APEX-v2.0.1-CP27-LATEST-FULL-PROJECT"
set "PROJECT="

rem 1) Explicit environment override.
if defined APEX_PROJECT_ROOT if exist "%APEX_PROJECT_ROOT%\package.json" set "PROJECT=%APEX_PROJECT_ROOT%"

rem 2) Run from inside the extracted project.
if not defined PROJECT if exist "%CD%\package.json" set "PROJECT=%CD%"

rem 3) BAT placed in the project root.
if not defined PROJECT if exist "%~dp0package.json" set "PROJECT=%~dp0"
if not defined PROJECT if exist "%~dp0..\..\package.json" set "PROJECT=%~dp0..\.."
if defined PROJECT if "%PROJECT:~-1%"=="\" set "PROJECT=%PROJECT:~0,-1%"

rem 4) Canonical default path.
if not defined PROJECT if exist "%DEFAULT_PROJECT%\package.json" set "PROJECT=%DEFAULT_PROJECT%"

if not defined PROJECT (
  echo [FAIL] Could not locate the CP27 project.
  echo.
  echo Either:
  echo   - run this BAT from the extracted CP27 project root, or
  echo   - place it in that root, or
  echo   - set APEX_PROJECT_ROOT to the project path.
  exit /b 10
)

set "SOURCE_PS1=%~dp0FINALIZE-APEX-CP27-WINDOWS.ps1"
set "TARGET_PS1=%SOURCE_PS1%"
set "BOOTSTRAP_LOG=%PROJECT%\QA\windows-bootstrap\cp27-dependency-bootstrap.log"

echo ================================================================================
echo APEX CP27 - LOCKED DEPENDENCY RESTORE + WINDOWS FINALIZATION
echo ================================================================================
echo Project:
echo   %PROJECT%
echo.

if not exist "%SOURCE_PS1%" (
  echo [FAIL] FINALIZE-APEX-CP27-WINDOWS.ps1 must be next to this BAT.
  exit /b 11
)

if not exist "%PROJECT%\package-lock.json" (
  echo [FAIL] package-lock.json is missing.
  exit /b 12
)

if not exist "%PROJECT%\REMEDIATION_CHECKPOINTS.json" (
  echo [FAIL] CP27 ledger is missing; refusing to run against the wrong tree.
  exit /b 13
)

if not exist "%PROJECT%\Doc\CP27_MERGE_MANIFEST.md" (
  echo [FAIL] Doc\CP27_MERGE_MANIFEST.md is missing; this is not the merged CP27 tree.
  exit /b 14
)

if not exist "%PROJECT%\QA\windows-bootstrap" mkdir "%PROJECT%\QA\windows-bootstrap" >nul 2>&1

echo [OK] Finalizer helper (executed in place; project root is not mutated):
echo   %TARGET_PS1%

cd /d "%PROJECT%"

for /f "delims=" %%V in ('node -v 2^>nul') do set "NODE_VER=%%V"
for /f "delims=" %%V in ('npm -v 2^>nul') do set "NPM_VER=%%V"
if not defined NODE_VER (
  echo [FAIL] Node.js is not available on PATH.
  exit /b 16
)
if not defined NPM_VER (
  echo [FAIL] npm is not available on PATH.
  exit /b 17
)
echo [INFO] Node: %NODE_VER%
echo [INFO] npm : %NPM_VER%

node -e "const p=require('./package.json'); const major=Number(process.versions.node.split('.')[0]); if(p.version!=='2.0.1') process.exit(21); if(major<22||major>=25) process.exit(22); if(p.packageManager!=='npm@10.9.2') process.exit(23);" 
if errorlevel 1 (
  echo [FAIL] package/version/Node/packageManager contract does not match CP27.
  exit /b 18
)

for /f "tokens=1" %%H in ('certutil -hashfile "package-lock.json" SHA256 ^| findstr /R /V "hash CertUtil"') do if not defined LOCK_BEFORE set "LOCK_BEFORE=%%H"
echo [INFO] package-lock SHA256 before: %LOCK_BEFORE%

echo.
echo [STEP] Restoring exact dev + optional dependencies from package-lock.json...
set "NODE_ENV="
set "NPM_CONFIG_PRODUCTION="

set "CI_OK="
for /L %%A in (1,1,3) do (
  if not defined CI_OK (
    echo [INFO] npm ci attempt %%A/3
    call npm ci --include=dev --include=optional --no-audit --no-fund
    if not errorlevel 1 set "CI_OK=1"
    if errorlevel 1 if not "%%A"=="3" timeout /t 4 /nobreak >nul
  )
)
if not defined CI_OK (
  echo [FAIL] npm ci failed after 3 attempts.
  exit /b 20
)

set "LOCK_AFTER="
for /f "tokens=1" %%H in ('certutil -hashfile "package-lock.json" SHA256 ^| findstr /R /V "hash CertUtil"') do if not defined LOCK_AFTER set "LOCK_AFTER=%%H"
echo [INFO] package-lock SHA256 after : %LOCK_AFTER%
if /I not "%LOCK_BEFORE%"=="%LOCK_AFTER%" (
  echo [FAIL] package-lock.json drifted during npm ci.
  exit /b 21
)
echo [OK] package-lock.json did not drift.

echo.
echo [STEP] Verifying critical Windows toolchain...
for %%F in (
  "node_modules\.bin\tsx.cmd"
  "node_modules\.bin\vite.cmd"
  "node_modules\.bin\vitest.cmd"
  "node_modules\typescript\lib\typescript.js"
  "node_modules\playwright\package.json"
  "node_modules\vite\client.d.ts"
) do (
  if not exist %%F (
    echo [FAIL] Missing dependency: %%F
    exit /b 22
  )
)

node -e "require('esbuild'); console.log('[OK] esbuild native loader works')" || exit /b 23
node -e "import('rollup').then(()=>console.log('[OK] Rollup native loader works')).catch(e=>{console.error(e);process.exit(1)})" || exit /b 24

dir /B "node_modules\@rollup" 2>nul | findstr /I "linux" >nul && (
  echo [FAIL] Linux Rollup native package detected in the Windows tree.
  exit /b 25
)
dir /B "node_modules\@esbuild" 2>nul | findstr /I "linux" >nul && (
  echo [FAIL] Linux esbuild native package detected in the Windows tree.
  exit /b 26
)

echo.
echo [STEP] Native Windows PowerShell parser check...
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -Command ^
 "$ErrorActionPreference='Stop'; $t=$null; $e=$null; [System.Management.Automation.Language.Parser]::ParseFile('%TARGET_PS1%',[ref]$t,[ref]$e) | Out-Null; if($e.Count){$e | ForEach-Object { Write-Host ('[PARSE ERROR] line {0}, col {1}: {2}' -f $_.Extent.StartLineNumber,$_.Extent.StartColumnNumber,$_.Message) -ForegroundColor Red }; exit 1}; Write-Host '[OK] Parser: 0 errors.' -ForegroundColor Green"
if errorlevel 1 exit /b 27

echo.
echo ================================================================================
echo [STEP] Starting CP27 Windows finalizer
echo [INFO] PowerShell is executed directly; its exit code is authoritative.
echo ================================================================================

set "FINAL_ARGS=-ProjectRoot "%PROJECT%" -RunFullMultiViewport"
if defined APEX_CHROME_PATH set "FINAL_ARGS=%FINAL_ARGS% -ChromePath "%APEX_CHROME_PATH%""
if defined APEX_VISUAL_BASELINE_DIR set "FINAL_ARGS=%FINAL_ARGS% -VisualBaselineDir "%APEX_VISUAL_BASELINE_DIR%""
if /I "%APEX_APPROVE_VISUAL_DIFF%"=="1" set "FINAL_ARGS=%FINAL_ARGS% -ApproveVisualDiff"

powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%TARGET_PS1%" %FINAL_ARGS%
set "RC=%ERRORLEVEL%"

echo.
echo ================================================================================
if "%RC%"=="0" (
  echo [PASS] CP27 finalizer returned exit code 0.
) else (
  echo [BLOCKED/FAIL] CP27 finalizer returned exit code %RC%.
)
echo Evidence:
echo   %PROJECT%\QA\windows-finalization
echo ================================================================================
exit /b %RC%
