@echo off
setlocal

set "ROOT=%~dp0"
if "%ROOT:~-1%"=="\" set "ROOT=%ROOT:~0,-1%"

echo [KIYUMART] Launching backend and frontend...
start "KiyuMart Backend" cmd /k "cd /d \"%ROOT%\" ^& call scripts\dev-backend-safe.cmd"
timeout /t 2 /nobreak >nul
start "KiyuMart Frontend" cmd /k "cd /d \"%ROOT%\" ^& call scripts\dev-frontend-safe.cmd"

echo [KIYUMART] Backend window started.
echo [KIYUMART] Frontend window started.
echo [KIYUMART] Expected ports: 5000 backend, 5173 frontend.
exit /b 0
