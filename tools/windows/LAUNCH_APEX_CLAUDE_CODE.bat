@echo off
setlocal

set "PROJECT=C:\project\APEX-frontend-phase31\APEX-unified-maximal-v1.0.56-r2-merged-source\APEX-unified-maximal-v1.0.56-r2-merged"

echo.
echo ============================================================
echo   APEX - Launch Claude Code with Windows project permissions
echo ============================================================
echo.

if not exist "%PROJECT%\package.json" (
    echo [ERROR] APEX project was not found:
    echo %PROJECT%
    echo.
    pause
    exit /b 1
)

where claude >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Claude Code CLI ^(claude^) was not found in PATH.
    echo Install or fix Claude Code CLI first, then run this file again.
    echo.
    pause
    exit /b 1
)

cd /d "%PROJECT%"
if errorlevel 1 (
    echo [ERROR] Could not enter the APEX project directory.
    pause
    exit /b 1
)

echo [OK] Project:
echo %CD%
echo.
echo Starting Claude Code...
echo Native Bash / Read / Edit are allowed for this session.
echo.

claude --permission-mode acceptEdits --allowedTools "Bash" "Read" "Edit"

set "EXITCODE=%ERRORLEVEL%"
echo.
echo Claude Code exited with code %EXITCODE%.
pause
exit /b %EXITCODE%
