@echo off
setlocal

for %%I in ("%~dp0..") do set "REPO_ROOT=%%~fI"
if "%REPO_ROOT:~-1%"=="\" set "REPO_ROOT=%REPO_ROOT:~0,-1%"

set "KIYUMART_SAFE_ROOT=%REPO_ROOT%"
set "KIYUMART_SAFE_DRIVE=%REPO_ROOT:~0,2%"

endlocal & set "KIYUMART_SAFE_ROOT=%KIYUMART_SAFE_ROOT%" & set "KIYUMART_SAFE_DRIVE=%KIYUMART_SAFE_DRIVE%"
exit /b 0
