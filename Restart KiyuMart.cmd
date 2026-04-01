@echo off
setlocal

set "ROOT=%~dp0"
if "%ROOT:~-1%"=="\" set "ROOT=%ROOT:~0,-1%"

echo [KIYUMART] Stopping existing app listeners...
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$ports = @(5000,5173,5174);" ^
  "$connections = Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Where-Object { $ports -contains $_.LocalPort };" ^
  "$pids = @($connections | Select-Object -ExpandProperty OwningProcess -Unique);" ^
  "foreach ($pid in $pids) { try { Stop-Process -Id $pid -Force -ErrorAction Stop; Write-Output ('STOPPED ' + $pid) } catch { Write-Output ('SKIPPED ' + $pid) } }"

timeout /t 2 /nobreak >nul
call "%ROOT%\Start KiyuMart.cmd"
exit /b %ERRORLEVEL%
