# Fix: Previous Employees Now Removed from Employees Sheet

**Date:** February 2, 2026  
**Issue:** Employees marked as "Previous Employee" were staying on the Employees sheet instead of being removed

## Problem

When marking an employee as laid off, fired, resigned, or quit via the Crew Import dialog, the system was:
1. ✅ Logging to Employee History (working correctly)
2. ✅ Setting Location to "Previous Employee" (working correctly)
3. ❌ **NOT removing the employee from the Employees sheet** (BUG)

This resulted in employees with Location = "Previous Employee" remaining visible on the Employees sheet, cluttering the active employee list.

## Root Cause

The `applySpecialCircumstanceUpdate()` function in `85-DataImport.gs` had an explicit comment (line ~720):

```javascript
// NOTE: Do NOT delete the row when setting to Previous Employee
// The employee should remain on the Employees sheet with Location = "Previous Employee"
```

This contradicted the established behavior in `51-EmployeeHistory.gs` where `handleLastDayChange()` correctly:
1. Shows confirmation popup
2. Logs to Employee History
3. Sets location to "Previous Employee"
4. **Deletes the row from Employees sheet** (line 421)

## Solution

### 1. Fixed `applySpecialCircumstanceUpdate()` Function
**File:** `src/85-DataImport.gs` (line ~716)

**Removed incorrect comment and added deletion logic:**

```javascript
// Delete employee from Employees sheet if marked as Previous Employee
if (data.newLocation === 'Previous Employee') {
  Utilities.sleep(500);
  employeesSheet.deleteRow(rowIndex);
  Logger.log('Deleted employee row ' + rowIndex + ' for ' + data.name);
}
```

### 2. Fixed `markEmployeeAsPrevious()` Function
**File:** `src/85-DataImport.gs` (line ~445)

**Added deletion after logging to history:**

```javascript
// Delete employee from Employees sheet
Utilities.sleep(500);
employeesSheet.deleteRow(rowIndex);

Logger.log('Marked ' + data.name + ' as Previous Employee and deleted from sheet');
logEvent('Crew Import: Marked ' + data.name + ' as Previous Employee (' + data.status + ')');

return { success: true, message: 'Employee marked as Previous Employee and removed from sheet' };
```

### 3. Enhanced Confirmation Popups
**File:** `src/CrewImport.html`

#### A. In `applySpecialUpdate()` function (line ~1429):
Added warning when marking as Previous Employee:

```javascript
// Add warning if marking as Previous Employee
if (newLocation === 'Previous Employee') {
  msg += '\n\n⚠️ WARNING: This will REMOVE the employee from the Employees sheet.';
  msg += '\nThey will only exist in Employee History.';
}
```

#### B. In `markAsPreviousEmployee()` function (line ~1489):
Enhanced confirmation message:

```javascript
msg += '\nThis will:\n';
msg += '• Set their Location to "Previous Employee"\n';
msg += '• Clear their Job Number\n';
msg += '• Log to Employee History\n';
msg += '• REMOVE them from the Employees sheet\n';
msg += '\n⚠️ The employee will only exist in Employee History after this action.';
```

## Behavior After Fix

### When marking an employee as "Previous Employee" via Crew Import:

1. **Confirmation popup appears** with warning:
   ```
   Apply changes for "Riley Pfrimmer"?
   
   • Location: Previous Employee
   • Status: Layoff
   • Date: 01/26/2026
   
   This will be logged to Employee History.
   
   ⚠️ WARNING: This will REMOVE the employee from the Employees sheet.
   They will only exist in Employee History.
   ```

2. **After confirmation:**
   - ✅ Employee History entry created with:
     - Event Type: LAYOFF (or FIRED, QUIT, RESIGNED)
     - Last Day: [date entered]
     - Last Day Reason: [status selected]
     - Full employee details preserved
   
   - ✅ Employee row **DELETED** from Employees sheet
   
   - ✅ Success message: "Employee marked as Previous Employee and removed from sheet"

3. **Result:**
   - Employee NO LONGER appears in active Employees sheet
   - Employee data preserved in Employee History for records
   - Clean separation between active and previous employees

## Testing Steps

1. **Open Crew Import:** Glove Manager → Data Import → Import Crew Makeup
2. **Upload Excel file** with crew makeup
3. **Detect special circumstances** - employee marked as Layoff, Fired, Resigned, or Quit
4. **Select employee** in special circumstances section
5. **Set fields:**
   - Status/Reason: Layoff (or Fired, Resigned, Quit)
   - New Location: Previous Employee
   - Date: [termination date]
6. **Click "Apply Changes"**
7. **Verify confirmation popup** shows warning about removal
8. **Confirm** the action
9. **Verify Results:**
   - ✅ Employee removed from Employees sheet (no longer visible)
   - ✅ Employee History entry created
   - ✅ Success message displayed

## Files Changed

1. **src/85-DataImport.gs**
   - `applySpecialCircumstanceUpdate()` - Added employee deletion when Location = "Previous Employee"
   - `markEmployeeAsPrevious()` - Added employee deletion after logging to history
   - Removed incorrect comment about keeping employees on sheet

2. **src/CrewImport.html**
   - `applySpecialUpdate()` - Enhanced confirmation popup with removal warning
   - `markAsPreviousEmployee()` - Enhanced confirmation popup with removal warning

## Consistency with Existing Behavior

This fix aligns the Crew Import behavior with the **established pattern** in `51-EmployeeHistory.gs`:

### `handleLastDayChange()` (Employees sheet manual edit):
- User fills in Last Day + Last Day Reason on Employees sheet
- System shows confirmation popup
- Logs to Employee History
- Sets Location to "Previous Employee"
- **Deletes row from Employees sheet** ✅

### `applySpecialCircumstanceUpdate()` (Crew Import):
- User marks employee as Previous Employee in Crew Import
- System shows confirmation popup with removal warning
- Logs to Employee History
- Sets Location to "Previous Employee"
- **Deletes row from Employees sheet** ✅ (FIXED)

Both methods now behave consistently!

## Deployment

✅ **Successfully deployed** via `.\push.bat` on February 2, 2026

## Related Documentation

- **FIX_LAYOFF_VALIDATION.md** - Last Day Reason validation fix
- **FIX_FIRED_DROPDOWN_COMPLETE.md** - Added "Fired" to dropdown
- **LAYOFF_USER_GUIDE.md** - User guide for employee termination
- **.github/copilot-instructions.md** - System architecture documentation

## Important Note

**Previous Employees are NOT archived on the sheet** - they are completely removed and only exist in Employee History. This is the intended behavior to keep the Employees sheet clean and focused on active employees only.

To view terminated employees, use the **Employee History** sheet which maintains a complete record of all employment changes including terminations with Last Day, Last Day Reason, and other relevant details.
