@echo off
title Safety Assistant - Build Standalone Windows Installer
echo ========================================================
echo   Building Safety Assistant Standalone Windows App
echo ========================================================
cd /d "%~dp0desktop"
call npm run build
echo.
echo ========================================================
echo   Build complete! Check desktop\dist for:
echo   - Safety Assistant Setup 1.0.0.exe (NSIS Installer)
echo   - Safety Assistant 1.0.0.exe (Portable Standalone)
echo ========================================================
pause
