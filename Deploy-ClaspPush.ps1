# Clasp Push Script
# Run this file by right-clicking and selecting "Run with PowerShell"

# Keep window open even if script fails
$ErrorActionPreference = "Continue"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "   CLASP PUSH DEPLOYMENT SCRIPT" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Window will stay open - don't worry!" -ForegroundColor Yellow
Write-Host ""
Start-Sleep -Seconds 2

# Set location
Set-Location "C:\Users\codyb\WebstormProjects\Rubber Tracker"
Write-Host "Location: $PWD" -ForegroundColor Yellow
Write-Host ""

# Check if clasp is available
Write-Host "Checking clasp installation..." -ForegroundColor Yellow
$claspPath = Get-Command clasp -ErrorAction SilentlyContinue
if ($claspPath) {
    Write-Host "✓ Clasp found at: $($claspPath.Source)" -ForegroundColor Green
} else {
    Write-Host "✗ Clasp not found in PATH" -ForegroundColor Red
    Write-Host "Press any key to exit..."
    $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
    exit 1
}
Write-Host ""

# Check .clasp.json exists
if (Test-Path ".clasp.json") {
    Write-Host "✓ .clasp.json found" -ForegroundColor Green
    $claspConfig = Get-Content ".clasp.json" | ConvertFrom-Json
    Write-Host "  Script ID: $($claspConfig.scriptId)" -ForegroundColor Gray
    Write-Host "  Root Dir: $($claspConfig.rootDir)" -ForegroundColor Gray
} else {
    Write-Host "✗ .clasp.json not found" -ForegroundColor Red
    Write-Host "Press any key to exit..."
    $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
    exit 1
}
Write-Host ""

# Push to Apps Script
Write-Host "Pushing to Google Apps Script..." -ForegroundColor Yellow
Write-Host "This may take 10-30 seconds..." -ForegroundColor Gray
Write-Host "----------------------------------------" -ForegroundColor Gray
Write-Host ""

try {
    # Use node to call clasp directly (avoids buggy PowerShell wrapper)
    $claspPath = "$env:APPDATA\npm\node_modules\@google\clasp\build\src\index.js"

    # Capture both stdout and stderr
    $output = & node $claspPath push 2>&1
    $exitCode = $LASTEXITCODE

    # Display the output
    Write-Host $output
    Write-Host ""

    if ($exitCode -eq 0 -or $output -like "*Pushed*files*") {
        Write-Host "========================================" -ForegroundColor Green
        Write-Host "   ✓ DEPLOYMENT SUCCESSFUL!" -ForegroundColor Green
        Write-Host "========================================" -ForegroundColor Green
        Write-Host ""
        Write-Host "Next steps:" -ForegroundColor Cyan
        Write-Host "1. Refresh your Google Sheet (F5)" -ForegroundColor White
        Write-Host "2. Open Quick Actions → To Do Config" -ForegroundColor White
        Write-Host "3. Click Expiring Certs tab" -ForegroundColor White
        Write-Host "4. Verify employee certifications load" -ForegroundColor White
    } else {
        Write-Host ""
        Write-Host "========================================" -ForegroundColor Yellow
        Write-Host "   ⚠ PUSH COMPLETED WITH WARNINGS" -ForegroundColor Yellow
        Write-Host "========================================" -ForegroundColor Yellow
        Write-Host "Exit code: $exitCode" -ForegroundColor Gray
    }
} catch {
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Red
    Write-Host "   ✗ ERROR OCCURRED" -ForegroundColor Red
    Write-Host "========================================" -ForegroundColor Red
    Write-Host "Error: $_" -ForegroundColor Red
    Write-Host ""
    Write-Host "This might mean:" -ForegroundColor Yellow
    Write-Host "- Clasp needs authentication (run 'clasp login')" -ForegroundColor White
    Write-Host "- Network connection issue" -ForegroundColor White
    Write-Host "- Node.js/npm issue" -ForegroundColor White
    Write-Host ""
    Write-Host "TRY MANUAL METHOD instead (see DEPLOY_NOW_3_METHODS.md)" -ForegroundColor Cyan
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Press ENTER to close this window..." -ForegroundColor Yellow
Read-Host
