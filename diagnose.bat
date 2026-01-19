@echo off
echo ========================================
echo    CLASP DIAGNOSTIC TEST
echo ========================================
echo.
echo This will test if clasp is working properly.
echo Window will stay open so you can read the output.
echo.
cd /d "C:\Users\codyb\WebstormProjects\Rubber Tracker"
echo Current directory: %CD%
echo.
echo ----------------------------------------
echo Test 1: Check if Node.js is available
echo ----------------------------------------
node --version
if %ERRORLEVEL% EQU 0 (
    echo [OK] Node.js is working
) else (
    echo [ERROR] Node.js not found or not working
)
echo.
echo ----------------------------------------
echo Test 2: Check if npm is available
echo ----------------------------------------
npm --version
if %ERRORLEVEL% EQU 0 (
    echo [OK] npm is working
) else (
    echo [ERROR] npm not found or not working
)
echo.
echo ----------------------------------------
echo Test 3: Check if clasp is installed
echo ----------------------------------------
where clasp
if %ERRORLEVEL% EQU 0 (
    echo [OK] clasp is installed
) else (
    echo [ERROR] clasp not found in PATH
)
echo.
echo ----------------------------------------
echo Test 4: Check clasp version
echo ----------------------------------------
call clasp --version
echo.
echo ----------------------------------------
echo Test 5: Check if .clasp.json exists
echo ----------------------------------------
if exist ".clasp.json" (
    echo [OK] .clasp.json found
    type .clasp.json
) else (
    echo [ERROR] .clasp.json not found
)
echo.
echo ========================================
echo    DIAGNOSTIC COMPLETE
echo ========================================
echo.
echo If all tests passed, try running push.bat
echo If tests failed, you'll need to use the manual copy-paste method.
echo.
pause
