@echo off
setlocal EnableDelayedExpansion
echo ========================================
echo    CLASP PUSH DEPLOYMENT
echo ========================================
echo.
cd /d "%~dp0"
echo Current directory: %CD%
echo.

REM ========================================
REM STEP 1: Pre-push syntax validation
REM ========================================
echo [Step 1/3] Running syntax validation...
echo ----------------------------------------
node validate-syntax.js
set VALIDATE_RESULT=%ERRORLEVEL%
echo.

if %VALIDATE_RESULT% NEQ 0 (
    echo.
    echo *** DEPLOYMENT ABORTED ***
    echo.
    echo Syntax errors found! Fix the issues above before pushing.
    echo.
    echo Press any key to close...
    pause >nul
    exit /b 1
)

REM ========================================
REM STEP 2: Check for duplicate files
REM ========================================
echo [Step 2/3] Checking for duplicate .js/.gs files...
set FOUND_DUPLICATES=0
for %%f in (src\*.js) do (
    if exist "%%~dpnf.gs" (
        echo   DUPLICATE: %%~nxf and %%~nf.gs both exist!
        set FOUND_DUPLICATES=1
    )
)

if %FOUND_DUPLICATES% EQU 1 (
    echo.
    echo Removing duplicate .js files...
    del /q src\*.js 2>nul
    echo Done! .js files removed.
) else (
    echo   No duplicates found.
)
echo.

REM ========================================
REM STEP 3: Push to Apps Script
REM ========================================
echo [Step 3/3] Pushing to Google Apps Script...
echo ----------------------------------------
echo.

REM Push and capture output
call "%APPDATA%\npm\clasp.cmd" push --force > push_output.txt 2>&1
set PUSH_RESULT=%ERRORLEVEL%
type push_output.txt

echo.
echo ----------------------------------------
echo.

if %PUSH_RESULT% EQU 0 (
    echo.
    echo ========================================
    echo SUCCESS! Files pushed to Apps Script.
    echo ========================================
    echo Updating Web App deployment...
    call "%APPDATA%\npm\clasp.cmd" deploy -i AKfycbzsCSiAhGr5aOMoEF6OlSInIgdnkvQbx_9zRcgdtA7usX7nZbPzlfZulyHDVTfStiuA -d "Auto deployed by push.bat"
) else (
    echo.
    echo ========================================
    echo PUSH FAILED
    echo ========================================
    echo.
    echo Exit code: %PUSH_RESULT%
    echo.
    echo Check push_output.txt for details.
    echo.
    echo Common issues:
    echo   - Syntax error in code
    echo   - Not logged in: run clasp login
    echo   - Network issue
)
echo.
echo Press any key to close...
pause >nul
endlocal
