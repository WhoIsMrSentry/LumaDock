@echo off
setlocal
set ELECTRON_RUN_AS_NODE=
cd /d "%~dp0"
if not exist "node_modules\electron\dist\electron.exe" (
  call npm.cmd ci
  if errorlevel 1 (
    echo Installation failed. Please check the error message above.
    pause
    exit /b 1
  )
)
"node_modules\electron\dist\electron.exe" .
if errorlevel 1 (
  pause
)
