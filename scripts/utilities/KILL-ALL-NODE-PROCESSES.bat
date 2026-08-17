@echo off
setlocal EnableExtensions
title Kill All Node.js Processes

echo ============================================
echo   Kill all running Node.js processes
echo ============================================
echo.

tasklist /FI "IMAGENAME eq node.exe" 2>NUL | find /I "node.exe" >NUL

if errorlevel 1 (
    echo No running node.exe process was found.
    echo.
    pause
    exit /b 0
)

echo Running Node.js processes:
tasklist /FI "IMAGENAME eq node.exe"
echo.

echo Terminating all node.exe processes and their child processes...
taskkill /F /T /IM node.exe

if errorlevel 1 (
    echo.
    echo ERROR: Some processes could not be terminated.
    echo Run this file as Administrator and try again.
    echo.
    pause
    exit /b 1
)

echo.
echo SUCCESS: All Node.js processes were terminated.
echo.
pause
exit /b 0
