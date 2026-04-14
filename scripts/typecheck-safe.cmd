@echo off
setlocal

for %%I in ("%~dp0..") do set "REPO_ROOT=%%~fI"
set "SAFE_DRIVE="

for %%D in (Z Y X W V U T S R Q P O N M L K J I H G F E D) do (
  subst %%D: "%REPO_ROOT%" >nul 2>&1
  if not errorlevel 1 (
    set "SAFE_DRIVE=%%D:"
    goto :mapped
  )
)

echo [typecheck-safe] Could not create a temporary drive mapping. Falling back to direct execution.
pushd "%REPO_ROOT%" || exit /b 1
node ".\scripts\typecheck-safe.mjs"
set "ERR=%ERRORLEVEL%"
popd
exit /b %ERR%

:mapped
pushd "%SAFE_DRIVE%" || (
  subst %SAFE_DRIVE% /d >nul 2>&1
  exit /b 1
)

node ".\scripts\typecheck-safe.mjs"
set "ERR=%ERRORLEVEL%"
popd
subst %SAFE_DRIVE% /d >nul 2>&1
exit /b %ERR%
