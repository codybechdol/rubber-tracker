@echo off
setlocal
echo ========================================
echo    SAFETY ASSISTANT - MANUAL BACKUP
echo ========================================
echo.
cd /d "%~dp0"
echo Current directory: %CD%
echo.
echo Triggering Google Drive backup (Sheet + JSON)...
node scripts\trigger-backup.js
echo.
echo Press any key to close...
pause >nul
endlocal
