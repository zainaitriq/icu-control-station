@echo off
REM ============================================================
REM  ICU Control Station - Offline update to v1.0.2
REM  Usage:  update-to-v1.0.2.bat  [install folder]
REM  Default install folder: C:\icu-control-station-v1.0.0
REM  No internet required - node_modules are NOT touched.
REM ============================================================
setlocal EnableDelayedExpansion

set "TARGET=%~1"
if "%TARGET%"=="" set "TARGET=C:\icu-control-station-v1.0.0"
set "SRC=%~dp0"

echo.
echo ================================================
echo   ICU Control Station - Update to v1.0.2
echo ================================================
echo   Source : %SRC%
echo   Target : %TARGET%
echo.

if not exist "%TARGET%\backend-obfuscated\src" (
    echo ERROR: "%TARGET%\backend-obfuscated\src" not found.
    echo Pass the correct install folder, e.g.:
    echo     update-to-v1.0.2.bat "C:\icu-control-station-v1.0.0"
    pause
    exit /b 1
)

set "BACKUP=%TARGET%\backup-before-v1.0.2"
if exist "%BACKUP%" set "BACKUP=%TARGET%\backup-before-v1.0.2-%RANDOM%"

echo [1/5] Stopping services...
call pm2 stop icu-bridge icu-consumer
echo.

echo [2/5] Backing up current version to:
echo       %BACKUP%
mkdir "%BACKUP%" >nul 2>&1
xcopy "%TARGET%\backend-obfuscated\src" "%BACKUP%\backend-src\" /E /I /Y /Q >nul
xcopy "%TARGET%\frontend-build"         "%BACKUP%\frontend-build\" /E /I /Y /Q >nul
echo       Backup done.
echo.

echo [3/5] Updating backend (obfuscated sources only)...
copy /Y "%SRC%backend-obfuscated\src\*.js" "%TARGET%\backend-obfuscated\src\"
if errorlevel 1 goto :failed
echo.

echo [4/5] Updating frontend build...
if exist "%TARGET%\frontend-build\assets" rmdir /S /Q "%TARGET%\frontend-build\assets"
xcopy "%SRC%frontend-build" "%TARGET%\frontend-build\" /E /I /Y /Q >nul
if errorlevel 1 goto :failed
echo       Frontend updated.
echo.

echo [5/5] Restarting services...
call pm2 restart icu-bridge icu-consumer
call pm2 save
echo.

echo ================================================
echo   Update to v1.0.2 complete
echo ================================================
echo.
echo   Backup kept at: %BACKUP%
echo.
echo   Now open the dashboard and press CTRL+F5:
echo     http://localhost:3000
echo.
echo   You should see:  JDHC   and the  AIGH  hospital tab.
echo.
call pm2 status
echo.
pause
exit /b 0

:failed
echo.
echo ERROR: update failed. Restore from: %BACKUP%
pause
exit /b 1
