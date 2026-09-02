@echo off
setlocal

cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo [OMENSITE] Node.js 24 or newer is required.
  echo [OMENSITE] Install Node.js, then run this launcher again.
  pause
  exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
  echo [OMENSITE] npm was not found on your PATH.
  echo [OMENSITE] Repair your Node.js installation, then run this launcher again.
  pause
  exit /b 1
)

if not exist "node_modules\" (
  echo [OMENSITE] Installing dependencies...
  call npm install
  if errorlevel 1 (
    echo [OMENSITE] Dependency installation failed.
    pause
    exit /b 1
  )
)

if not defined HOST set "HOST=127.0.0.1"
if not defined PORT set "PORT=4173"

echo [OMENSITE] Starting the MVC app at http://%HOST%:%PORT%
echo [OMENSITE] Press Ctrl+C to stop the server.
call npm start
set "exitCode=%errorlevel%"

if not "%exitCode%"=="0" (
  echo [OMENSITE] The server exited with code %exitCode%.
  pause
)

endlocal & exit /b %exitCode%
