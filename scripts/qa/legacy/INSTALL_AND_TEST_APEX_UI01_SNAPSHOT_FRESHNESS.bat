@echo off
setlocal EnableExtensions
title APEX UI-01 Snapshot Freshness Installer + Test

set "PROJECT=C:\project\APEX-frontend-phase31\APEX-unified-maximal-v1.0.56-r2-merged-source\APEX-unified-maximal-v1.0.56-r2-merged"
set "HELPER=%PROJECT%\src\lib\snapshotFreshness.ts"
set "TESTFILE=%PROJECT%\src\tests\snapshotFreshness.test.ts"

echo.
echo ============================================================
echo  APEX UI-01 - Install Snapshot Freshness + Focused Test
echo ============================================================
echo.

if not exist "%PROJECT%\package.json" (
  echo [FAIL] Project not found:
  echo %PROJECT%
  pause
  exit /b 1
)

where pwsh.exe >nul 2>&1
if errorlevel 1 (
  echo [FAIL] PowerShell 7 ^(pwsh.exe^) not found in PATH.
  pause
  exit /b 1
)

echo [1/5] Preparing target folders...
if not exist "%PROJECT%\src\lib" mkdir "%PROJECT%\src\lib"
if not exist "%PROJECT%\src\tests" mkdir "%PROJECT%\src\tests"

echo [2/5] Creating backups if files already exist...
for /f %%I in ('pwsh.exe -NoProfile -Command "Get-Date -Format yyyyMMdd-HHmmss"') do set "STAMP=%%I"
if exist "%HELPER%" copy /y "%HELPER%" "%HELPER%.bak-%STAMP%" >nul
if exist "%TESTFILE%" copy /y "%TESTFILE%" "%TESTFILE%.bak-%STAMP%" >nul

echo [3/5] Writing snapshotFreshness.ts...
pwsh.exe -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop'; $b=[Convert]::FromBase64String('LyoqCiAqIEFjY291bnQgc25hcHNob3QgZnJlc2huZXNzIGRlcml2YXRpb24gKEdBUCBVSS0wMSkuCiAqCiAqIGBBY2NvdW50U25hcHNob3Quc3luY2VkQXRgIGlzIHByb2R1Y2VkIGJ5IGNvbm5lY3RlZEV4Y2hhbmdlL2RlbW9BY2NvdW50IGJ1dCB3YXMKICogbmV2ZXIgY29uc3VtZWQgYnkgYW55IHZpZXcsIHNvIGEgMy1zZWNvbmQtb2xkIHNuYXBzaG90IGFuZCBhIDQwLW1pbnV0ZS1vbGQKICogc25hcHNob3QgcmVuZGVyZWQgaWRlbnRpY2FsbHkgYXMgbGl2ZSB0cnV0aC4gVGhpcyBtb2R1bGUgY29udmVydHMgdGhhdAogKiB0aW1lc3RhbXAgaW50byBhbiBleHBsaWNpdCwgcmVuZGVyYWJsZSBzdGF0ZSBzbyBjYWNoZWQvc3RhbGUgZGF0YSBpcyBuZXZlcgogKiBwcmVzZW50ZWQgYXMgbGl2ZS4KICovCgovKiogU25hcHNob3RzIG9sZGVyIHRoYW4gdGhpcyBhcmUgY2FjaGVkIHJlYWRzLCBub3QgbGl2ZSB0cnV0aC4gKi8KZXhwb3J0IGNvbnN0IFNOQVBTSE9UX1NUQUxFX0FGVEVSX01TID0gNjBfMDAwOwoKLyoqIFN1YnNldCBvZiBVSSBkYXRhIHN0YXRlcyB0aGlzIGhlbHBlciBjYW4gcHJvZHVjZS4gKi8KZXhwb3J0IHR5cGUgU25hcHNob3RGcmVzaG5lc3NTdGF0ZSA9ICdsaXZlJyB8ICdzdGFsZScgfCAndW5hdmFpbGFibGUnOwoKZXhwb3J0IGludGVyZmFjZSBTbmFwc2hvdEZyZXNobmVzcyB7CiAgc3RhdGU6IFNuYXBzaG90RnJlc2huZXNzU3RhdGU7CiAgLyoqIFNob3J0IG9wZXJhdG9yLWZhY2luZyBsYWJlbCwgc2FmZSB0byByZW5kZXIgZGlyZWN0bHkuICovCiAgbGFiZWw6IHN0cmluZzsKICAvKiogQWdlIGluIG1zLCBvciBudWxsIHdoZW4gbm8gdXNhYmxlIHRpbWVzdGFtcCB3YXMgcmVwb3J0ZWQuICovCiAgYWdlTXM6IG51bWJlciB8IG51bGw7CiAgLyoqIE5vcm1hbGl6ZWQgSVNPIHRpbWVzdGFtcCwgb3IgbnVsbCB3aGVuIHVudXNhYmxlLiAqLwogIHN5bmNlZEF0OiBzdHJpbmcgfCBudWxsOwp9CgpmdW5jdGlvbiBmb3JtYXRBZ2UoYWdlTXM6IG51bWJlcik6IHN0cmluZyB7CiAgaWYgKGFnZU1zIDwgMV8wMDApIHJldHVybiAnbm93JzsKICBpZiAoYWdlTXMgPCA2MF8wMDApIHJldHVybiBgJHtNYXRoLmZsb29yKGFnZU1zIC8gMV8wMDApfXMgYWdvYDsKICBpZiAoYWdlTXMgPCAzXzYwMF8wMDApIHJldHVybiBgJHtNYXRoLmZsb29yKGFnZU1zIC8gNjBfMDAwKX1tIGFnb2A7CiAgcmV0dXJuIGAke01hdGguZmxvb3IoYWdlTXMgLyAzXzYwMF8wMDApfWggYWdvYDsKfQoKLyoqCiAqIERlc2NyaWJlIGhvdyBmcmVzaCBhbiBhY2NvdW50IHNuYXBzaG90IGlzLgogKgogKiBSZXR1cm5zIGB1bmF2YWlsYWJsZWAgKG5ldmVyIGBsaXZlYCkgd2hlbiB0aGUgdGltZXN0YW1wIGlzIG1pc3NpbmcsIG1hbGZvcm1lZCwKICogb3IgbWF0ZXJpYWxseSBpbiB0aGUgZnV0dXJlIOKAlCBhbiB1bnZlcmlmaWFibGUgYWdlIG11c3Qgbm90IGJlIHByZXNlbnRlZCBhcwogKiBsaXZlIHRydXRoLiBTdWItc2Vjb25kIGNsb2NrIGppdHRlciBpcyB0b2xlcmF0ZWQuCiAqLwpleHBvcnQgZnVuY3Rpb24gZGVzY3JpYmVTbmFwc2hvdEZyZXNobmVzcygKICBzeW5jZWRBdDogc3RyaW5nIHwgbnVsbCB8IHVuZGVmaW5lZCwKICBub3c6IG51bWJlciA9IERhdGUubm93KCksCiAgc3RhbGVBZnRlck1zOiBudW1iZXIgPSBTTkFQU0hPVF9TVEFMRV9BRlRFUl9NUywKKTogU25hcHNob3RGcmVzaG5lc3MgewogIGlmICh0eXBlb2Ygc3luY2VkQXQgIT09ICdzdHJpbmcnIHx8ICFzeW5jZWRBdC50cmltKCkpIHsKICAgIHJldHVybiB7CiAgICAgIHN0YXRlOiAndW5hdmFpbGFibGUnLAogICAgICBsYWJlbDogJ1NuYXBzaG90IGFnZSB1bmtub3duJywKICAgICAgYWdlTXM6IG51bGwsCiAgICAgIHN5bmNlZEF0OiBudWxsLAogICAgfTsKICB9CgogIGNvbnN0IHBhcnNlZCA9IERhdGUucGFyc2Uoc3luY2VkQXQpOwogIGlmICghTnVtYmVyLmlzRmluaXRlKHBhcnNlZCkpIHsKICAgIHJldHVybiB7CiAgICAgIHN0YXRlOiAndW5hdmFpbGFibGUnLAogICAgICBsYWJlbDogJ1NuYXBzaG90IGFnZSB1bmtub3duJywKICAgICAgYWdlTXM6IG51bGwsCiAgICAgIHN5bmNlZEF0OiBudWxsLAogICAgfTsKICB9CgogIGNvbnN0IGlzbyA9IG5ldyBEYXRlKHBhcnNlZCkudG9JU09TdHJpbmcoKTsKICBjb25zdCBhZ2VNcyA9IG5vdyAtIHBhcnNlZDsKCiAgaWYgKGFnZU1zIDwgLTFfMDAwKSB7CiAgICByZXR1cm4gewogICAgICBzdGF0ZTogJ3VuYXZhaWxhYmxlJywKICAgICAgbGFiZWw6ICdTbmFwc2hvdCBjbG9jayBza2V3JywKICAgICAgYWdlTXM6IG51bGwsCiAgICAgIHN5bmNlZEF0OiBpc28sCiAgICB9OwogIH0KCiAgY29uc3Qgc2FmZUFnZSA9IE1hdGgubWF4KDAsIGFnZU1zKTsKCiAgaWYgKHNhZmVBZ2UgPj0gc3RhbGVBZnRlck1zKSB7CiAgICByZXR1cm4gewogICAgICBzdGF0ZTogJ3N0YWxlJywKICAgICAgbGFiZWw6IGBDYWNoZWQgwrcgJHtmb3JtYXRBZ2Uoc2FmZUFnZSl9YCwKICAgICAgYWdlTXM6IHNhZmVBZ2UsCiAgICAgIHN5bmNlZEF0OiBpc28sCiAgICB9OwogIH0KCiAgcmV0dXJuIHsKICAgIHN0YXRlOiAnbGl2ZScsCiAgICBsYWJlbDogYFNuYXBzaG90IHJlYWR5IMK3ICR7Zm9ybWF0QWdlKHNhZmVBZ2UpfWAsCiAgICBhZ2VNczogc2FmZUFnZSwKICAgIHN5bmNlZEF0OiBpc28sCiAgfTsKfQoKLyoqIFRydWUgd2hlbiB0aGUgc25hcHNob3QgbXVzdCBub3QgYmUgcHJlc2VudGVkIGFzIGxpdmUgdHJ1dGguICovCmV4cG9ydCBmdW5jdGlvbiBpc1NuYXBzaG90RGVncmFkZWQoZnJlc2huZXNzOiBTbmFwc2hvdEZyZXNobmVzcyk6IGJvb2xlYW4gewogIHJldHVybiBmcmVzaG5lc3Muc3RhdGUgIT09ICdsaXZlJzsKfQo='); [IO.File]::WriteAllBytes($env:HELPER,$b); if((Get-Item -LiteralPath $env:HELPER).Length -ne $b.Length){throw 'helper size verification failed'}"
if errorlevel 1 (
  echo [FAIL] Could not write snapshotFreshness.ts
  pause
  exit /b 1
)

echo [4/5] Writing snapshotFreshness.test.ts...
pwsh.exe -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop'; $b=[Convert]::FromBase64String('aW1wb3J0IHsgZGVzY3JpYmUsIGV4cGVjdCwgaXQgfSBmcm9tICd2aXRlc3QnOwoKaW1wb3J0IHsKICBTTkFQU0hPVF9TVEFMRV9BRlRFUl9NUywKICBkZXNjcmliZVNuYXBzaG90RnJlc2huZXNzLAogIGlzU25hcHNob3REZWdyYWRlZCwKfSBmcm9tICcuLi9saWIvc25hcHNob3RGcmVzaG5lc3MnOwoKY29uc3QgTk9XID0gRGF0ZS5wYXJzZSgnMjAyNi0wOC0xMFQxMjowMDowMC4wMDBaJyk7CmNvbnN0IGF0ID0gKG1zQWdvOiBudW1iZXIpID0+IG5ldyBEYXRlKE5PVyAtIG1zQWdvKS50b0lTT1N0cmluZygpOwoKZGVzY3JpYmUoJ2Rlc2NyaWJlU25hcHNob3RGcmVzaG5lc3MgKEdBUCBVSS0wMSknLCAoKSA9PiB7CiAgaXQoJ3JlcG9ydHMgYSBqdXN0LXN5bmNlZCBzbmFwc2hvdCBhcyBsaXZlJywgKCkgPT4gewogICAgY29uc3QgcmVzdWx0ID0gZGVzY3JpYmVTbmFwc2hvdEZyZXNobmVzcyhhdCg1MDApLCBOT1cpOwoKICAgIGV4cGVjdChyZXN1bHQuc3RhdGUpLnRvQmUoJ2xpdmUnKTsKICAgIGV4cGVjdChyZXN1bHQubGFiZWwpLnRvQmUoJ1NuYXBzaG90IHJlYWR5IMK3IG5vdycpOwogICAgZXhwZWN0KHJlc3VsdC5hZ2VNcykudG9CZSg1MDApOwogICAgZXhwZWN0KGlzU25hcHNob3REZWdyYWRlZChyZXN1bHQpKS50b0JlKGZhbHNlKTsKICB9KTsKCiAgaXQoJ3JlcG9ydHMgYSByZWNlbnQgc25hcHNob3QgYXMgbGl2ZSB3aXRoIGEgc2Vjb25kcyBhZ2UnLCAoKSA9PiB7CiAgICBjb25zdCByZXN1bHQgPSBkZXNjcmliZVNuYXBzaG90RnJlc2huZXNzKGF0KDNfMDAwKSwgTk9XKTsKCiAgICBleHBlY3QocmVzdWx0LnN0YXRlKS50b0JlKCdsaXZlJyk7CiAgICBleHBlY3QocmVzdWx0LmxhYmVsKS50b0JlKCdTbmFwc2hvdCByZWFkeSDCtyAzcyBhZ28nKTsKICB9KTsKCiAgaXQoJ3JlcG9ydHMgYW4gb2xkIHNuYXBzaG90IGFzIHN0YWxlLCBub3QgbGl2ZScsICgpID0+IHsKICAgIGNvbnN0IHJlc3VsdCA9IGRlc2NyaWJlU25hcHNob3RGcmVzaG5lc3MoYXQoNDAgKiA2MF8wMDApLCBOT1cpOwoKICAgIGV4cGVjdChyZXN1bHQuc3RhdGUpLnRvQmUoJ3N0YWxlJyk7CiAgICBleHBlY3QocmVzdWx0LmxhYmVsKS50b0JlKCdDYWNoZWQgwrcgNDBtIGFnbycpOwogICAgZXhwZWN0KGlzU25hcHNob3REZWdyYWRlZChyZXN1bHQpKS50b0JlKHRydWUpOwogIH0pOwoKICBpdCgnZm9ybWF0cyBob3VyLXNjYWxlIGFnZXMnLCAoKSA9PiB7CiAgICBjb25zdCByZXN1bHQgPSBkZXNjcmliZVNuYXBzaG90RnJlc2huZXNzKGF0KDMgKiAzXzYwMF8wMDApLCBOT1cpOwoKICAgIGV4cGVjdChyZXN1bHQuc3RhdGUpLnRvQmUoJ3N0YWxlJyk7CiAgICBleHBlY3QocmVzdWx0LmxhYmVsKS50b0JlKCdDYWNoZWQgwrcgM2ggYWdvJyk7CiAgfSk7CgogIGl0KCd0cmVhdHMgdGhlIHN0YWxlIHRocmVzaG9sZCBhcyBpbmNsdXNpdmUnLCAoKSA9PiB7CiAgICBleHBlY3QoCiAgICAgIGRlc2NyaWJlU25hcHNob3RGcmVzaG5lc3MoYXQoU05BUFNIT1RfU1RBTEVfQUZURVJfTVMgLSAxKSwgTk9XKS5zdGF0ZSwKICAgICkudG9CZSgnbGl2ZScpOwoKICAgIGV4cGVjdCgKICAgICAgZGVzY3JpYmVTbmFwc2hvdEZyZXNobmVzcyhhdChTTkFQU0hPVF9TVEFMRV9BRlRFUl9NUyksIE5PVykuc3RhdGUsCiAgICApLnRvQmUoJ3N0YWxlJyk7CiAgfSk7CgogIGl0KCduZXZlciByZXBvcnRzIGFuIHVudmVyaWZpYWJsZSBhZ2UgYXMgbGl2ZScsICgpID0+IHsKICAgIGZvciAoY29uc3QgaW5wdXQgb2YgW251bGwsIHVuZGVmaW5lZCwgJycsICcgICAnLCAnbm90LWEtZGF0ZSddKSB7CiAgICAgIGNvbnN0IHJlc3VsdCA9IGRlc2NyaWJlU25hcHNob3RGcmVzaG5lc3MoaW5wdXQsIE5PVyk7CgogICAgICBleHBlY3QocmVzdWx0LnN0YXRlKS50b0JlKCd1bmF2YWlsYWJsZScpOwogICAgICBleHBlY3QocmVzdWx0LmxhYmVsKS50b0JlKCdTbmFwc2hvdCBhZ2UgdW5rbm93bicpOwogICAgICBleHBlY3QocmVzdWx0LmFnZU1zKS50b0JlTnVsbCgpOwogICAgICBleHBlY3QoaXNTbmFwc2hvdERlZ3JhZGVkKHJlc3VsdCkpLnRvQmUodHJ1ZSk7CiAgICB9CiAgfSk7CgogIGl0KCdyZWplY3RzIGEgZnV0dXJlIHRpbWVzdGFtcCBhcyBjbG9jayBza2V3IHJhdGhlciB0aGFuIGxpdmUnLCAoKSA9PiB7CiAgICBjb25zdCByZXN1bHQgPSBkZXNjcmliZVNuYXBzaG90RnJlc2huZXNzKAogICAgICBuZXcgRGF0ZShOT1cgKyAxMjBfMDAwKS50b0lTT1N0cmluZygpLAogICAgICBOT1csCiAgICApOwoKICAgIGV4cGVjdChyZXN1bHQuc3RhdGUpLnRvQmUoJ3VuYXZhaWxhYmxlJyk7CiAgICBleHBlY3QocmVzdWx0LmxhYmVsKS50b0JlKCdTbmFwc2hvdCBjbG9jayBza2V3Jyk7CiAgICBleHBlY3QoaXNTbmFwc2hvdERlZ3JhZGVkKHJlc3VsdCkpLnRvQmUodHJ1ZSk7CiAgfSk7CgogIGl0KCd0b2xlcmF0ZXMgc3ViLXNlY29uZCBjbG9jayBqaXR0ZXIgYXMgbGl2ZScsICgpID0+IHsKICAgIGV4cGVjdCgKICAgICAgZGVzY3JpYmVTbmFwc2hvdEZyZXNobmVzcyhuZXcgRGF0ZShOT1cgKyAyMDApLnRvSVNPU3RyaW5nKCksIE5PVykuc3RhdGUsCiAgICApLnRvQmUoJ2xpdmUnKTsKICB9KTsKCiAgaXQoJ25vcm1hbGl6ZXMgdGhlIHJlcG9ydGVkIHRpbWVzdGFtcCB0byBJU08nLCAoKSA9PiB7CiAgICBleHBlY3QoCiAgICAgIGRlc2NyaWJlU25hcHNob3RGcmVzaG5lc3MoJzIwMjYtMDgtMTBUMTE6NTk6MzBaJywgTk9XKS5zeW5jZWRBdCwKICAgICkudG9CZSgnMjAyNi0wOC0xMFQxMTo1OTozMC4wMDBaJyk7CiAgfSk7Cn0pOwo='); [IO.File]::WriteAllBytes($env:TESTFILE,$b); if((Get-Item -LiteralPath $env:TESTFILE).Length -ne $b.Length){throw 'test size verification failed'}"
if errorlevel 1 (
  echo [FAIL] Could not write snapshotFreshness.test.ts
  pause
  exit /b 1
)

echo.
echo Installed:
echo   %HELPER%
echo   %TESTFILE%
echo.

echo [5/5] Running focused Vitest...
cd /d "%PROJECT%"
call npx vitest run src/tests/snapshotFreshness.test.ts --reporter=dot
set "TESTEXIT=%ERRORLEVEL%"

echo.
if "%TESTEXIT%"=="0" (
  echo ============================================================
  echo  PASS - UI-01 snapshot freshness helper + focused tests
  echo ============================================================
  echo.
  echo NOTE:
  echo This installs and verifies the freshness helper and its unit tests.
  echo UI-01 is NOT fully closed until the helper is wired into the actual
  echo snapshot-consuming UI views and those focused view/component tests pass.
) else (
  echo ============================================================
  echo  FAIL - Focused Vitest returned exit code %TESTEXIT%
  echo ============================================================
)

echo.
pause
exit /b %TESTEXIT%
