@echo off
setlocal
cd /d "%~dp0"

set "APEX_VERSION=unknown"
if exist VERSION set /p APEX_VERSION=<VERSION

echo [APEX] Unified Terminal v%APEX_VERSION%
where node >nul 2>&1 || (
  echo [APEX] Node.js 22+ is required. Install Node.js, then run this launcher again.
  pause
  exit /b 1
)

for /f "tokens=1 delims=." %%V in ('node -p "process.versions.node"') do set "NODE_MAJOR=%%V"
if %NODE_MAJOR% LSS 22 (
  echo [APEX] Node.js 22+ is required. Detected major version %NODE_MAJOR%.
  pause
  exit /b 1
)

rem Refresh source identity before deciding whether an existing build is safe to run.
node scripts\utilities\generateBuildIdentity.mjs || goto :failed

rem A directory left by an interrupted npm install is not a valid dependency install.
if not exist node_modules\.bin\tsx.cmd (
  echo [APEX] Installing locked dependencies...
  echo [APEX] If you are offline and have apex-npm-tarballs.zip, run scripts\windows\Restore-OfflineDependencies.ps1 first.
  call npm ci --no-audit --no-fund || goto :failed
)

set "NEED_BUILD=0"
if not exist dist\server.cjs set "NEED_BUILD=1"
if not exist dist\build-info.json set "NEED_BUILD=1"
if "%NEED_BUILD%"=="0" (
  node -e "const fs=require('fs');const s=JSON.parse(fs.readFileSync('public/build-info.json','utf8'));const d=JSON.parse(fs.readFileSync('dist/build-info.json','utf8'));process.exit(s.version===d.version&&s.buildId===d.buildId?0:1)" >nul 2>&1
  if errorlevel 1 set "NEED_BUILD=1"
)

if "%NEED_BUILD%"=="1" (
  echo [APEX] Building current source...
  call npm run build || goto :failed
)

node scripts\gates\checkBuildIdentity.mjs || goto :failed

echo [APEX] Starting terminal at http://127.0.0.1:3000
echo [APEX] Research/paper controls do not grant autonomous live-execution authority.
call npm start
exit /b %errorlevel%

:failed
echo [APEX] Startup failed. Review the error above.
pause
exit /b 1
