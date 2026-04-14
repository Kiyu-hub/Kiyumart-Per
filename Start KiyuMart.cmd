@echo off
setlocal

set "ROOT=%~dp0"
if "%ROOT:~-1%"=="\" set "ROOT=%ROOT:~0,-1%"

echo [KIYUMART] Launching live app server on port 5000...
start "KiyuMart Backend" cmd /k "cd /d ""%ROOT%"" ^& call ""scripts\dev-backend-safe.cmd"""

echo [KIYUMART] Backend window started.
echo [KIYUMART] Open the app at http://localhost:5000
echo [KIYUMART] Frontend changes should now appear live on port 5000.
exit /b 0
