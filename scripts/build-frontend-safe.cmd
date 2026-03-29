@echo off
setlocal

call "%~dp0resolve-safe-drive.cmd" || exit /b 1
cd /d %KIYUMART_SAFE_ROOT% || exit /b 1

node "%KIYUMART_SAFE_ROOT%\node_modules\vite\bin\vite.js" build
exit /b %ERRORLEVEL%
