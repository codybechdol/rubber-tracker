# CLASP FIX - PowerShell Function
# This fixes the issue with clasp hanging in PowerShell
#
# USAGE:
#   1. Run this script: . .\clasp-fix.ps1
#   2. Now you can use clasp normally: clasp push, clasp pull, etc.
#
# OR add this to your PowerShell profile to make it permanent:
#   Add-Content $PROFILE "`n. 'C:\Users\codyb\WebstormProjects\Rubber Tracker\clasp-fix.ps1'"

function clasp {
    # Call clasp through node.exe directly (bypasses buggy npm wrapper)
    $claspPath = "$env:APPDATA\npm\node_modules\@google\clasp\build\src\index.js"

    if (Test-Path $claspPath) {
        & node $claspPath $args
    } else {
        Write-Host "ERROR: Clasp not found at $claspPath" -ForegroundColor Red
        Write-Host "Please install clasp: npm install -g @google/clasp" -ForegroundColor Yellow
    }
}

Write-Host "Clasp function loaded!" -ForegroundColor Green
Write-Host "  You can now use 'clasp' commands normally in this PowerShell session." -ForegroundColor Cyan
Write-Host ""
Write-Host "  Examples:" -ForegroundColor Yellow
Write-Host "    clasp push" -ForegroundColor White
Write-Host "    clasp pull" -ForegroundColor White
Write-Host "    clasp --version" -ForegroundColor White
Write-Host ""
