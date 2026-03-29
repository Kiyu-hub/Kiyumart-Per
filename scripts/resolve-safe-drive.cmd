@echo off
setlocal EnableDelayedExpansion

for %%I in ("%~dp0..") do set "REPO_ROOT=%%~fI"
if "%REPO_ROOT:~-1%"=="\" set "REPO_ROOT=%REPO_ROOT:~0,-1%"

set "SELECTED_DRIVE="
set "SAFE_ROOT="

for /f "tokens=1,* delims=> " %%A in ('subst') do (
  set "CURRENT_DRIVE=%%A"
  set "CURRENT_TARGET=%%B"
  if defined CURRENT_DRIVE if defined CURRENT_TARGET (
    set "CURRENT_DRIVE=!CURRENT_DRIVE:~0,2!"
    set "CURRENT_TARGET=!CURRENT_TARGET: =!"
    if /I "!CURRENT_TARGET!"=="%REPO_ROOT%" (
      set "SELECTED_DRIVE=!CURRENT_DRIVE!"
      set "SAFE_ROOT=!CURRENT_DRIVE!\"
      goto :resolved_root
    )
  )
)

for %%D in (X: Y: Z: W: V: U: T: S: R: Q: P:) do (
  if not defined SELECTED_DRIVE (
    subst %%D "%REPO_ROOT%" >nul 2>&1
    if not errorlevel 1 (
      set "SELECTED_DRIVE=%%D"
      set "SAFE_ROOT=%%D\"
    )
  )
)

if not defined SAFE_ROOT (
  for %%I in ("%REPO_ROOT%") do set "SHORT_ROOT=%%~sI"
  if defined SHORT_ROOT (
    if /I not "%SHORT_ROOT%"=="%REPO_ROOT%" (
      set "SAFE_ROOT=%SHORT_ROOT%"
      set "SELECTED_DRIVE=%SHORT_ROOT:~0,2%"
    )
  )
)

if not defined SAFE_ROOT (
  set "JUNCTION_ROOT=C:\Users\Public\KiyuMartSafeRepo"
  if exist "!JUNCTION_ROOT!" (
    for %%I in ("!JUNCTION_ROOT!") do (
      if /I "%%~fI"=="%REPO_ROOT%" (
        set "SAFE_ROOT=!JUNCTION_ROOT!"
      ) else (
        rmdir "!JUNCTION_ROOT!" >nul 2>&1
      )
    )
  )
  if not defined SAFE_ROOT (
    mklink /J "!JUNCTION_ROOT!" "%REPO_ROOT%" >nul 2>&1
    if exist "!JUNCTION_ROOT!" set "SAFE_ROOT=!JUNCTION_ROOT!"
  )
  if defined SAFE_ROOT set "SELECTED_DRIVE=!SAFE_ROOT:~0,2!"
)

if not defined SAFE_ROOT (
  set "SAFE_ROOT=%REPO_ROOT%"
  set "SELECTED_DRIVE=%REPO_ROOT:~0,2%"
)

:resolved_root
for /f "tokens=1,* delims=> " %%A in ('subst') do (
  set "MAPPED_DRIVE=%%A"
  set "MAPPED_TARGET=%%B"
  if defined MAPPED_DRIVE if defined MAPPED_TARGET (
    set "MAPPED_DRIVE=!MAPPED_DRIVE:~0,2!"
    set "MAPPED_TARGET=!MAPPED_TARGET: =!"
    if /I "!MAPPED_TARGET!"=="%REPO_ROOT%" if /I not "!MAPPED_DRIVE!"=="!SELECTED_DRIVE!" (
      subst !MAPPED_DRIVE! /d >nul 2>&1
    )
  )
)

if "%SAFE_ROOT:~-1%"=="\" set "SAFE_ROOT=%SAFE_ROOT:~0,-1%"
set "KIYUMART_SAFE_DRIVE=!SELECTED_DRIVE!"
set "KIYUMART_SAFE_ROOT=!SAFE_ROOT!"

endlocal & set "KIYUMART_SAFE_DRIVE=%KIYUMART_SAFE_DRIVE%" & set "KIYUMART_SAFE_ROOT=%KIYUMART_SAFE_ROOT%"
exit /b 0
