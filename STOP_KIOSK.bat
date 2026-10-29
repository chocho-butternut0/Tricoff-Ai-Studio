@echo off
title TRICOFF — Stopping Kiosk
color 0C

echo.
echo  Stopping TRICOFF Coffee Kiosk...
echo.

:: Kill the node process running on port 3000
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":3000"') do (
    taskkill /F /PID %%a >nul 2>&1
)

echo  Kiosk stopped.
echo.
timeout /t 2 /nobreak >nul
