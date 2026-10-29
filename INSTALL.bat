@echo off
title TRICOFF — First-Time Setup
color 0A

echo.
echo  ============================================
echo   TRICOFF Coffee Kiosk — First-Time Setup
echo  ============================================
echo.

:: Check if Node.js is installed
where node >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    color 0C
    echo  [ERROR] Node.js is not installed.
    echo.
    echo  Please download and install Node.js LTS from:
    echo  https://nodejs.org
    echo.
    echo  After installing, run this file again.
    echo.
    pause
    exit /b 1
)

echo  [OK] Node.js found:
node --version
echo.

:: Install dependencies
echo  Installing dependencies (this takes a minute, please wait)...
echo.
cd /d "%~dp0"
call npm install

if %ERRORLEVEL% NEQ 0 (
    color 0C
    echo.
    echo  [ERROR] Installation failed. Check your internet and try again.
    echo.
    pause
    exit /b 1
)

echo.
echo  ============================================
echo   Installation complete!
echo  ============================================
echo.

:: Ask if they want auto-start on boot
set /p AUTOSTART="Auto-start kiosk when Windows boots? (Y/N): "
if /i "%AUTOSTART%"=="Y" (
    :: Create a shortcut in the Windows Startup folder
    set STARTUP_FOLDER=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup
    set SCRIPT_PATH=%~dp0START_KIOSK.bat

    powershell -Command "$ws = New-Object -ComObject WScript.Shell; $s = $ws.CreateShortcut('%STARTUP_FOLDER%\TRICOFF Kiosk.lnk'); $s.TargetPath = '%SCRIPT_PATH%'; $s.WorkingDirectory = '%~dp0'; $s.WindowStyle = 1; $s.Description = 'TRICOFF Coffee Kiosk'; $s.Save()"

    echo.
    echo  [OK] Kiosk will now start automatically on Windows boot.
)

echo.
echo  To start the kiosk: double-click START_KIOSK.bat
echo  To stop the kiosk:  double-click STOP_KIOSK.bat
echo.
pause
