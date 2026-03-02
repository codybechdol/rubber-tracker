# Fix: Employee Termination Duplicate Popup and Row Not Deleted

**Date:** February 26, 2026
**Status:** ✅ COMPLETE

## Problems Reported

1. **Duplicate confirmation popup** - When entering Last Day and Last Day Reason for employee termination, TWO identical confirmation popups appeared
2. **Row not deleted** - After confirming termination, Masen Worl's row was NOT removed from the Employees sheet

## Root Cause Analysis

### Issue 1: Duplicate Popup
The duplicate popup was caused by BOTH edit handlers firing for the same cell edit:

1. `onEdit()` function (simple trigger) calls `processEdit()` → calls `handleLastDayReasonChange()` → shows popup
2. `onEditHandler()` function (installable trigger) ALSO calls `processEdit()` → calls `handleLastDayReasonChange()` AGAIN → shows popup AGAIN

### Issue 2: Row Not Deleted
The row deletion likely failed because:
- The duplicate triggers caused a race condition
- When the user clicked YES on the first popup, the row was in process of being deleted
- When the second popup appeared, the user clicked YES again, but by then the row might have shifted or the lock wasn't properly managed

## Solution

### Fix 1: Prevent Duplicate Popup in `onEditHandler`
Added a guard in `onEditHandler()` to skip Employees sheet Last Day Reason changes since they're already handled by `onEdit()` → `processEdit()`:

```javascript
// SKIP Employees sheet Last Day Reason changes - already handled by onEdit → processEdit
// This prevents the double popup issue when both simple and installable triggers fire
if (sheetName === 'Employees') {
  var empHeaders = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  for (var h = 0; h < empHeaders.length; h++) {
    if (String(empHeaders[h]).toLowerCase().trim() === 'last day reason' && editedCol === (h + 1)) {
      Logger.log('onEditHandler: Skipping Employees Last Day Reason change (handled by onEdit)');
      return;  // Already handled by onEdit's processEdit call
    }
  }
}
```

### Fix 2: Add Lock to Prevent Race Conditions
Added script lock with proper try/finally handling in `handleLastDayReasonChange()`:

```javascript
// Get script lock to prevent duplicate execution from multiple triggers
var lock = LockService.getScriptLock();
var lockAcquired = false;

try {
  lock.waitLock(1000); // Wait up to 1 second
  lockAcquired = true;
  
  // ... termination logic ...
  
} finally {
  // Always release the lock
  if (lockAcquired) {
    lock.releaseLock();
  }
}
```

### Fix 3: Verify Row Before Deletion
Added verification that the correct row is still present before deleting:

```javascript
// First verify the row still contains this employee (in case of race condition)
var currentName = sheet.getRange(editedRow, 1).getValue();
if (String(currentName).trim() === String(empName).trim()) {
  sheet.deleteRow(editedRow);
  Logger.log('Employee "' + empName + '" row deleted from Employees sheet');
  ss.toast('Employee "' + empName + '" removed from Employees sheet and added to Employee History.', '✅ Terminated', 5);
} else {
  Logger.log('Row ' + editedRow + ' no longer contains "' + empName + '" - row may have already been deleted.');
  ss.toast('Employee "' + empName + '" added to history. Row may have already been removed.', '⚠️ Check', 5);
}
```

## Files Modified

1. **`src/11-Triggers.gs`** (~line 357)
   - Added guard to skip Employees Last Day Reason changes in `onEditHandler()`

2. **`src/51-EmployeeHistory.gs`** (lines 272-450)
   - Added script lock with proper try/finally handling
   - Added verification before row deletion
   - Improved logging throughout the function

## Manual Action Required

Since Masen Worl's row was not deleted in the previous attempt, manually delete row 41 from the Employees sheet. The Employee History entry should already exist from the first attempt.

## Testing

1. Set Last Day for an employee (any date)
2. Set Last Day Reason (Quit, Fired, Layoff, or Resigned)
3. Verify ONLY ONE confirmation popup appears
4. Click YES
5. Verify the employee row is deleted from Employees sheet
6. Verify the employee appears in Employee History with correct data

## Future Improvements

Consider using a flag/marker column to track that termination is in progress, preventing any possibility of duplicate processing even across script restarts.

