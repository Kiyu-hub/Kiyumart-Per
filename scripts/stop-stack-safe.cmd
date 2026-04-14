@echo off
setlocal

call "%~dp0resolve-safe-drive.cmd" || exit /b 1
cd /d "%KIYUMART_SAFE_ROOT%" || exit /b 1

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$ports = @(5000,5001,5173,5174);" ^
  "$connections = Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Where-Object { $ports -contains $_.LocalPort };" ^
  "$pids = @($connections | Select-Object -ExpandProperty OwningProcess -Unique);" ^
  "if ($pids.Count -eq 0) { Write-Output 'NO_SERVER_PROCESSES_FOUND'; exit 0 }" ^
  "foreach ($procId in $pids) { try { Stop-Process -Id $procId -Force -ErrorAction Stop; Write-Output ('STOPPED ' + $procId) } catch { Write-Output ('FAILED ' + $procId + ' ' + $_.Exception.Message) } }"

exit /b 0
