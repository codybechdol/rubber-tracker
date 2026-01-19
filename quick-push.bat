@echo off
echo ========================================
echo    SIMPLE CLASP TEST
echo ========================================
echo.
echo Testing if clasp is accessible...
echo.
cd /d "C:\Users\codyb\WebstormProjects\Rubber Tracker"
echo Current directory: %CD%
echo.
echo Checking for .clasp.json...
if exist ".clasp.json" (
    echo [OK] .clasp.json found
    echo.
    echo Contents:
    type .clasp.json
) else (
    echo [ERROR] .clasp.json not found!
)
echo.
echo ========================================
echo.
echo Now attempting clasp push...
echo (This might take 10-30 seconds, be patient!)
echo.
echo ----------------------------------------
echo.

REM Use clasp.cmd directly instead of PowerShell which has issues
call "%APPDATA%\npm\clasp.cmd" push

echo.
echo ----------------------------------------
echo.
echo If you see "Pushed X files" above, it worked!
echo If you see errors or timeout, use the manual method.
echo.
echo ========================================
echo.
pause
