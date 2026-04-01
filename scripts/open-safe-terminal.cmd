@echo off
setlocal

call "%~dp0resolve-safe-drive.cmd" || exit /b 1

echo [SAFE-RUN] Opening terminal at %KIYUMART_SAFE_ROOT% for KiyuMart.
start "" cmd /k "cd /d ""%KIYUMART_SAFE_ROOT%"""

exit /b 0
