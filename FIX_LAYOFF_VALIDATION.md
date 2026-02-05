# STANDARDIZE LAYOFF - Complete Fix

**Date:** February 2, 2026  
**Issue:** "Last Day Reason" dropdown validation inconsistency

## Problem

User was unable to mark Riley Pfrimmer as laid off - getting error message that a reason needs to be picked, even though "Layoff" was selected.

**Root Cause:**
- The `handleLastDayChange()` function was NOT validating that Last Day Reason was filled in before proceeding
- This allowed empty values to pass through, causing confusion
- The validation dropdown was already set to use "Layoff" (not "Laid Off"), but no enforcement existed

## Solution

### 1. Added Validation in `handleLastDayChange()` Function

**File:** `src/51-EmployeeHistory.gs`

Added two validation checks BEFORE the confirmation dialog:

```javascript
// Validate that Last Day Reason is filled in
if (!lastDayReason || lastDayReason === '') {
  ui.alert('⚠️ Missing Last Day Reason', ...);
  sheet.getRange(editedRow, lastDayColIdx + 1).setValue('');
  return;
}

// Validate that Last Day Reason is one of the allowed values
var validReasons = ['Quit', 'Fired', 'Layoff', 'Resigned'];
if (validReasons.indexOf(lastDayReason) === -1) {
  ui.alert('⚠️ Invalid Last Day Reason', ...);
  sheet.getRange(editedRow, lastDayColIdx + 1).setValue('');
  return;
}
```

**What this does:**
- Checks if Last Day Reason is empty → Shows error, clears Last Day, stops
- Checks if Last Day Reason is not in the valid list → Shows error, clears Last Day, stops
- Only proceeds to termination confirmation if reason is valid

### 2. Created Utility Function to Fix Dropdown Validation

**File:** `src/22-EmployeeValidation.gs` (NEW)

Created `fixLastDayReasonValidation()` function:
- Finds the "Last Day Reason" column on Employees sheet
- Applies dropdown validation with ONLY these 4 values: `Quit`, `Fired`, `Layoff`, `Resigned`
- Sets `setAllowInvalid(false)` to reject any other values
- Applies to rows 2-100 (covers current + future employees)

**Menu Location:** Glove Manager → 🔧 Utilities → ✅ Fix Last Day Reason Dropdown

### 3. Updated Documentation

**Files Updated:**
- `UPDATE_HEADERS_EXPLAINED.md` - Changed "Laid Off" → "Layoff"
- `UPDATE_EMPLOYEE_HISTORY_HEADERS_GUIDE.md` - Standardized to "Quit, Fired, Layoff, Resigned"

## Standardized Values

The following 4 values are now standardized across the entire codebase:

| Value | Use Case |
|-------|----------|
| **Quit** | Employee voluntarily left without notice |
| **Fired** | Employee terminated by company |
| **Layoff** | Employee laid off (not performance-related) |
| **Resigned** | Employee formally resigned with notice |

## Testing

### How to Test the Fix:

1. **Deploy the changes:** Run `.\push.bat`

2. **Fix existing validation:** 
   - Glove Manager → 🔧 Utilities → ✅ Fix Last Day Reason Dropdown
   - Confirm the success message

3. **Test the validation:**
   - Pick an employee row on the Employees sheet
   - Enter a Last Day date (column L)
   - Leave Last Day Reason (column M) empty
   - **Expected:** Error message "Please select a reason... Fill in the Last Day Reason column (M)"

4. **Test with valid reason:**
   - Enter Last Day date
   - Select "Layoff" from the dropdown in column M
   - **Expected:** Confirmation dialog appears asking to proceed with termination

5. **Test Riley Pfrimmer scenario:**
   - Enter Last Day for Riley
   - Select "Layoff" from dropdown
   - Confirm termination
   - **Expected:** Riley moves to Employee History with Location = "Previous Employee"

## What Changed

### Code Files:
- ✅ `src/51-EmployeeHistory.gs` - Added validation checks in `handleLastDayChange()`
- ✅ `src/22-EmployeeValidation.gs` - NEW FILE with `fixLastDayReasonValidation()`
- ✅ `src/Code.gs` - Added menu item for fix function

### Documentation Files:
- ✅ `UPDATE_HEADERS_EXPLAINED.md` - Fixed example to use "Layoff"
- ✅ `UPDATE_EMPLOYEE_HISTORY_HEADERS_GUIDE.md` - Standardized to "Layoff"

### Already Correct:
- ✅ `src/Code.gs` line 8093 - Validation already uses "Layoff"
- ✅ `src/85-DataImport.gs` - Import logic already uses "Layoff"
- ✅ `src/CrewImport.html` - Dropdown already includes "Layoff"
- ✅ `README.md` - Already documented as "Layoff"

## Deployment

Run the deployment script:

```powershell
.\push.bat
```

This will:
1. Run syntax validation (catches JSDoc errors, duplicate files, etc.)
2. Push all changes to Google Apps Script
3. Show success/error messages

After deployment, run the fix utility once:
- **Glove Manager → 🔧 Utilities → ✅ Fix Last Day Reason Dropdown**

## Summary

The issue was that `handleLastDayChange()` wasn't validating the Last Day Reason field before proceeding. Now it:

1. ✅ Requires Last Day Reason to be filled in
2. ✅ Validates the reason is one of the 4 allowed values
3. ✅ Provides clear error messages if validation fails
4. ✅ Clears the Last Day cell if validation fails (prevents partial saves)

The user will now see a helpful error if they forget to select a reason, or if the dropdown has invalid values.

---

**Status:** ✅ READY TO DEPLOY

**Next Step:** Run `.\push.bat` to deploy changes
