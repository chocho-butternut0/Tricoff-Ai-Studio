@echo off
title TRICOFF Coffee Kiosk
color 0A

cd /d "%~dp0"

:: Check if node_modules exists, if not run install first
if not exist "node_modules" (
    echo  [SETUP] Running first-time install...
    call npm install
    if %ERRORLEVEL% NEQ 0 (
        color 0C
        echo  [ERROR] Install failed. Check your internet connection.
        pause
        exit /b 1
    )
)

echo.
echo  ============================================
echo   TRICOFF Coffee Kiosk is starting...
echo  ============================================
echo.
echo  Do NOT close this window while the kiosk is running.
echo  To stop the kiosk, close this window or run STOP_KIOSK.bat
echo.

:: Wait 2 seconds then open the browser
start "" /b cmd /c "timeout /t 2 /nobreak >nul && start http://localhost:3000/kiosk"

:: Start the server (this stays open)
npm run dev
