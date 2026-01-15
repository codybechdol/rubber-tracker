# Rubber Tracker Architecture Guide

## Overview

This document explains the intentional architecture of the Rubber Tracker codebase. **Read this before attempting any refactoring.**

## File Structure

```
src/
├── 00-Constants.gs          # Global constants (loads first)
├── 01-Utilities.gs          # Utility functions
├── 10-Menu.gs               # Menu stubs (incomplete)
├── 11-Triggers.gs           # Trigger definitions
├── 20-InventoryHandlers.gs  # Inventory handler stubs (incomplete)
├── 21-ChangeOutDate.gs      # Change out date calculations
├── 22-LocationSync.gs       # Location sync functions
├── 30-SwapGeneration.gs     # Swap generation stubs (incomplete)
├── 31-SwapHandlers.gs       # Swap handler stubs (incomplete)
├── 32-SwapPreservation.gs   # Swap preservation functions
├── 40-Reclaims.gs           # Reclaims stubs (DEPRECATED functions)
├── 50-History.gs            # History stubs (incomplete)
├── 51-EmployeeHistory.gs    # Employee history stubs (incomplete)
├── 60-PurchaseNeeds.gs      # Purchase needs stubs (incomplete)
├── 61-InventoryReports.gs   # Inventory reports functions
├── 70-ToDoList.gs           # To-Do list stubs (incomplete)
├── 75-Scheduling.gs         # Scheduling functions
├── 76-SmartScheduling.gs    # Smart scheduling functions
├── 76-EmployeeClassifications.gs  # Employee classifications
├── 80-EmailReports.gs       # Email report stubs (incomplete)
├── 85-DataImport.gs         # Data import functions
├── 90-Backup.gs             # Backup functions
├── 95-BuildSheets.gs        # Build sheets stubs (incomplete)
├── 95-DiagnosticTools.gs    # Diagnostic tools
├── 99-DiagnosticTool.gs     # Additional diagnostics
├── 99-MenuFix.gs            # Menu fix utilities
├── Code.gs                  # MAIN FILE - All complete implementations (loads LAST)
├── TestRunner.gs            # Test suite
└── *.html                   # UI templates
```

## Critical Concept: File Load Order

Google Apps Script loads files **alphabetically**:

```
00-Constants.gs      ← loads first
01-Utilities.gs
10-Menu.gs
...
99-MenuFix.gs
Code.gs              ← LOADS LAST!
TestRunner.gs
```

**Key insight:** Numbers (0-9) come before letters (A-Z) in ASCII sort order, so `Code.gs` loads AFTER all numbered files.

## The "Duplicate" Function Architecture

### Why Duplicates Exist

When a function is defined multiple times across files, **the last definition wins**. Since Code.gs loads last, its functions override all module file functions.

### The Pattern

| Module File | Contains | Code.gs | Contains |
|-------------|----------|---------|----------|
| 40-Reclaims.gs | `updateReclaimsSheet_INCOMPLETE_DEPRECATED()` | Code.gs | `updateReclaimsSheet()` ✅ |
| 30-SwapGeneration.gs | `generateAllReports()` (stub) | Code.gs | `generateAllReports()` ✅ |
| 50-History.gs | `saveHistory()` (partial) | Code.gs | `saveHistory()` ✅ |

### Why This Design?

1. **Code.gs is the single source of truth** - all working code lives here
2. **Module files are placeholders** - for potential future modular refactoring
3. **_INCOMPLETE_DEPRECATED suffix** - prevents accidental calls to incomplete versions
4. **Safety** - if someone adds code to a module file, Code.gs still overrides it

## Function Ownership

### Code.gs Owns (Complete Implementations):
- All menu functions (`onOpen`, `openQuickActionsSidebar`)
- All inventory handlers (`handleInventoryAssignedToChange`, etc.)
- All swap generation (`generateAllReports`, `generateGloveSwaps`, etc.)
- All swap handlers (`handlePickedCheckboxChange`, etc.)
- All history functions (`saveHistory`, `viewFullHistory`, etc.)
- All employee history (`trackEmployeeChange`, `saveEmployeeHistory`, etc.)
- All reclaims (`updateReclaimsSheet`, `setupReclaimsSheet`, etc.)
- All purchase needs (`updatePurchaseNeeds`)
- All email reports (`sendEmailReport`, `buildEmailReportHtml`, etc.)
- All build sheets (`buildSheets`, `ensurePickedForColumn`)

### Module Files Own (Complete, Not in Code.gs):
- `00-Constants.gs` - All constants (COLS, sheet names, etc.)
- `01-Utilities.gs` - `getCol()`, `getColumnMapping()`, `logEvent()`, `normalizeApprovalValue()`
- `21-ChangeOutDate.gs` - `calculateChangeOutDate()`
- `61-InventoryReports.gs` - `updateInventoryReports()`
- `75-Scheduling.gs` - Scheduling-specific functions
- `76-SmartScheduling.gs` - `generateSmartSchedule()`, task collection functions
- `85-DataImport.gs` - Data import functions
- `90-Backup.gs` - Backup functions

## ⚠️ Do NOT:

1. **Remove functions from Code.gs** - they are authoritative
2. **Rename `_INCOMPLETE_DEPRECATED` functions** - they exist to prevent override bugs
3. **Add complete implementations to module files** - they will NOT work (Code.gs overrides them)
4. **Change file naming (00-, 10-, etc.)** - this controls load order
5. **Trust AI to "clean up duplicates"** - the duplicates are intentional

## ✅ Safe Changes:

1. **Add new functions to Code.gs** - always works
2. **Modify existing functions in Code.gs** - safe
3. **Add new module files** - use numbered prefix (e.g., 77-NewFeature.gs)
4. **Remove truly dead code** - commented-out blocks only
5. **Update documentation** - always welcome

## Testing After Changes

After any code change:

```bash
clasp push
```

Then test in Google Sheets:
1. Refresh the spreadsheet
2. Check Glove Manager menu appears
3. Run "Generate All Reports"
4. Verify no errors in Execution Log

## History

- **Original Design:** Single Code.gs file with all functions
- **Modular Extraction (2025):** Functions extracted to numbered modules as stubs
- **Bug Fix (Jan 7, 2026):** Added `_INCOMPLETE_DEPRECATED` to 40-Reclaims.gs to prevent override
- **Failed Optimization (Jan 15, 2026):** AI attempted to "fix" duplicates, broke the system
- **Revert (Jan 15, 2026):** Restored working state, documented architecture

## Questions?

If you're unsure about making a change, check:
1. This document
2. REVERT_SUMMARY.md
3. Git history for the specific file
4. Test in a copy of the spreadsheet first

