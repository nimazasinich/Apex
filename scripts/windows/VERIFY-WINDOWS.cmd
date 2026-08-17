@echo off
setlocal
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0VERIFY-WINDOWS.ps1"
exit /b %ERRORLEVEL%
