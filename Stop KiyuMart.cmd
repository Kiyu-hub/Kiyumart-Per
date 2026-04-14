@echo off
setlocal

echo [KIYUMART] Stopping local app listeners on ports 5000, 5001, 5173, and 5174...
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$ports = @(5000,5001,5173,5174);" ^
  "$connections = Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Where-Object { $ports -contains $_.LocalPort };" ^
  "$pids = @($connections | Select-Object -ExpandProperty OwningProcess -Unique);" ^
  "if ($pids.Count -eq 0) { Write-Output 'NO_SERVER_PROCESSES_FOUND'; exit 0 }" ^
  "foreach ($procId in $pids) { try { Stop-Process -Id $procId -Force -ErrorAction Stop; Write-Output ('STOPPED ' + $procId) } catch { Write-Output ('FAILED ' + $procId + ' ' + $_.Exception.Message) } }"

echo [KIYUMART] Stop command finished.
exit /b 0
