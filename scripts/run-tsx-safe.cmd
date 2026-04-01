@echo off
setlocal

call "%~dp0resolve-safe-drive.cmd" || exit /b 1
cd /d "%KIYUMART_SAFE_ROOT%" || exit /b 1

if "%~1"=="" (
  echo [SAFE-RUN] Missing tsx entry file.
  exit /b 1
)

set "ENTRY=%~1"
shift

if "%ENTRY:~1,2%"==":\" (
  set "TARGET=%ENTRY%"
) else (
  set "TARGET=%KIYUMART_SAFE_ROOT%\%ENTRY%"
)

node -r dotenv/config "%KIYUMART_SAFE_ROOT%\node_modules\tsx\dist\cli.mjs" "%TARGET%" %*
exit /b %ERRORLEVEL%
