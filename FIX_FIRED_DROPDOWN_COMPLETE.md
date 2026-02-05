# Fix: Added "Fired" to Crew Import Dropdown

**Date:** February 2, 2026  
**Issue:** Last Day Reason validation was rejecting "Layoff" and other valid values in Crew Import dialog

## Problem

When updating crew structure and marking an employee as laid off, the system showed an error:
> "⚠️ Invalid Last Day Reason - The reason 'Layoff' is not valid."

However, "Layoff" was actually a valid value in the backend validation.

## Root Cause

The **Status/Reason dropdown** in the Crew Import dialog's special circumstances section was missing **"Fired"** as an option, even though the backend validation in `51-EmployeeHistory.gs` expects exactly 4 valid values:
- Quit
- Fired
- Layoff
- Resigned

The dropdown only had: `Layoff, Resigned, Quit, Time Off, Vacation, Light Duty, Leave, FMLA, MT Misc, Unknown`

## Solution

### 1. Added "Fired" to Status/Reason Dropdown
**File:** `src/CrewImport.html` (line ~1298)

**Changed from:**
```javascript
var statuses = ['Layoff', 'Resigned', 'Quit', 'Time Off', 'Vacation', 'Light Duty', 'Leave', 'FMLA', 'MT Misc', 'Unknown'];
```

**Changed to:**
```javascript
var statuses = ['Layoff', 'Fired', 'Resigned', 'Quit', 'Time Off', 'Vacation', 'Light Duty', 'Leave', 'FMLA', 'MT Misc', 'Unknown'];
```

### 2. Added "Fired" Status Badge Styling
**File:** `src/CrewImport.html` (line ~1219)

Added visual styling for "Fired" status in special circumstances cards:
```javascript
} else if (spec.status === 'Fired') {
  suggestedLocation = 'Previous Employee';
  suggestedAction = 'previous';
  statusBadgeClass = 'bg-danger';
  statusIcon = 'bi-x-circle';
}
```

### 3. Added "Fired" Event Type Mapping (Backend)
**File:** `src/85-DataImport.gs` (line ~660)

**Function:** `applySpecialCircumstanceUpdate()`
```javascript
else if (statusLower === 'fired') eventType = 'FIRED';
```

**Function:** `markEmployeeAsPrevious()` (line ~410)
```javascript
else if (data.status === 'Fired') eventType = 'FIRED';
```

## Validation

The backend validation in `51-EmployeeHistory.gs` (line 314-332) checks:
```javascript
var validReasons = ['Quit', 'Fired', 'Layoff', 'Resigned'];
```

All 4 termination reasons are now available in the Crew Import dialog and will pass validation.

## Testing Steps

1. Open Crew Import dialog: **Glove Manager → Data Import → Import Crew Makeup**
2. Upload crew makeup Excel file
3. Detect special circumstances (employee marked as Layoff, Fired, Resigned, or Quit)
4. Select employee in special circumstances section
5. Change **Status/Reason** dropdown - verify all 4 termination reasons appear:
   - ✅ Layoff
   - ✅ Fired (NEW)
   - ✅ Resigned
   - ✅ Quit
6. Set **New Location** to "Previous Employee"
7. Click **Apply Changes**
8. Verify no validation error occurs

## Files Changed

1. **src/CrewImport.html**
   - Added "Fired" to Status/Reason dropdown
   - Added "Fired" status badge styling

2. **src/85-DataImport.gs**
   - Added "Fired" event type mapping in `applySpecialCircumstanceUpdate()`
   - Added "Fired" event type mapping in `markEmployeeAsPrevious()`

## Deployment

✅ Deployed successfully via `.\push.bat` on February 2, 2026

## Related Documentation

- **FIX_LAYOFF_VALIDATION.md** - Previous fix for Last Day Reason validation
- **LAYOFF_USER_GUIDE.md** - User guide for marking employees as laid off
- **.github/copilot-instructions.md** - Updated to standardize "Layoff" terminology
