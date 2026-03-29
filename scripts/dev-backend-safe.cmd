@echo off
setlocal

call "%~dp0resolve-safe-drive.cmd" || exit /b 1
cd /d %KIYUMART_SAFE_ROOT% || exit /b 1

for /f "usebackq delims=" %%I in (`powershell -NoProfile -Command "$conn = Get-NetTCPConnection -LocalPort 5000 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1; if ($conn) { $proc = Get-Process -Id $conn.OwningProcess -ErrorAction SilentlyContinue; if ($proc -and $proc.ProcessName -eq 'node') { Write-Output 'RUNNING' } }"`) do set "BACKEND_ALREADY_RUNNING=%%I"
if /i "%BACKEND_ALREADY_RUNNING%"=="RUNNING" (
  echo [SAFE-RUN] Backend already appears to be running on port 5000. Reusing the existing server instead of starting a duplicate process.
  exit /b 0
)

node --preserve-symlinks --preserve-symlinks-main "%KIYUMART_SAFE_ROOT%\node_modules\tsx\dist\cli.mjs" "%KIYUMART_SAFE_ROOT%\server\index.ts"
exit /b %ERRORLEVEL%
