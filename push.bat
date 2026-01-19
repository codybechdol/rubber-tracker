@echo off
echo ========================================
echo    CLASP PUSH DEPLOYMENT
echo ========================================
echo.
cd /d "C:\Users\codyb\WebstormProjects\Rubber Tracker"
echo Current directory: %CD%
echo.
echo Checking clasp...
where clasp
echo.
echo Starting push...
echo ----------------------------------------
echo.
REM Use clasp.cmd directly instead of clasp.ps1 which has issues
call "%APPDATA%\npm\clasp.cmd" push
echo.
echo ----------------------------------------
echo.
if %ERRORLEVEL% EQU 0 (
    echo SUCCESS! Files pushed to Apps Script.
) else (
    echo WARNING: Exit code was %ERRORLEVEL%
    echo This might still have worked - check output above.
)
echo.
echo ========================================
echo.
echo Press any key to close this window...
pause >nul
