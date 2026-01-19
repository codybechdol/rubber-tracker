# Bug Fix: Import Error - Cannot convert '[object Object]' to int

## Date: January 17, 2026

## Problem
Error occurred during import:
```
Exception: Cannot convert '[object Object],[object Object]' to int.
at processExpiringCertsImportMultiRow(Code:1353:19)
```

## Root Cause
Line 1353 in Code.gs had incorrect syntax for the `sort()` method:
```javascript
// WRONG - Apps Script doesn't support this object notation
expiringSheet.sort([{column: 1, ascending: true}, {column: 6, ascending: true}]);
```

This is JavaScript array-of-objects syntax, but Apps Script's `Sheet.sort()` method expects simple column numbers.

## Solution
Changed to proper Apps Script syntax:
```javascript
// CORRECT - Use simple column numbers
expiringSheet.getRange(2, 1, batchData.length, headers.length).sort([1, 6]);
```

## Additional Fix
Also restored missing task generation code that was accidentally removed:
```javascript
// Generate To Do tasks for selected cert types
var tasksCreated = generateToDoTasksFromCerts(certRows, selectedCertTypes, empMap);
```

And updated the success message to include task count:
```javascript
message: '✅ Import Complete!\n\n...\nTo Do Tasks Created: ' + (tasksCreated || 0)
```

## Files Modified
- `Code.gs` - Fixed sort syntax and restored task generation

## Testing
After deploying this fix:
1. Try import again
2. Should complete successfully
3. Success message should show "To Do Tasks Created: X"
4. Expiring Certs sheet should be sorted correctly
5. Manual Tasks sheet should have new cert renewal tasks

## Deployment
Copy the updated `Code.gs` file to Google Apps Script and save.

## Status
✅ **FIXED** - Ready to deploy and test

---

## Bug #2: ReferenceError - generateToDoTasksFromCerts is not defined

### Date: January 17, 2026 (2:02 PM)

### Problem
After fixing the sort error, a second error occurred:
```
ReferenceError: generateToDoTasksFromCerts is not defined
at processExpiringCertsImportMultiRow(Code:1362:24)
```

### Root Cause
The `generateToDoTasksFromCerts` function was being called but never defined in Code.gs. The function implementation was written during Phase 4 but accidentally not included in the deployed code.

### Solution
Added the complete `generateToDoTasksFromCerts` function to Code.gs after the `processExpiringCertsImportMultiRow` function.

**Function Purpose:**
- Filters certifications by selected cert types (from checkboxes)
- Creates To Do tasks for:
  - Priority items (marked "Need Copy")
  - Expiring soon (≤30 days)
- Adds tasks to Manual Tasks sheet with:
  - Location, Priority, Task Type
  - Scheduled date (expiration date)
  - Employee name and current expiration in notes
  - Status: Pending
- Returns count of tasks created

**Key Features:**
- Error handling for date parsing
- Skips non-expiring certs
- Skips certs not in selected types
- Logs detailed information
- Returns 0 if Manual Tasks sheet not found

### Files Modified
- `Code.gs` - Added `generateToDoTasksFromCerts` function (~90 lines)

### Testing
After deploying this fix:
1. Import should complete successfully
2. Success message shows "To Do Tasks Created: X"
3. Manual Tasks sheet should have new cert renewal tasks
4. Tasks should only be for selected cert types
5. Tasks should only be for priority items or certs expiring ≤30 days

### Status
✅ **FIXED** - Ready to deploy and test again

