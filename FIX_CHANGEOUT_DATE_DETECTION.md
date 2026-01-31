# Fix: Changeout Date Not Showing for Swap Tasks

## Problem Identified

Austin York's glove swap task was showing in the Task List, but the **changeout date was not displaying** under his name, even though the code was supposed to show it.

## Root Cause

The column header detection in `collectSwapTasks()` function was looking for an exact match of `'change out date'`, but the actual column header in the Glove Swaps / Sleeve Swaps sheets is **"Change Out Date Assigned"** (with "Assigned" suffix).

### Original Code (Line 519)
```javascript
if (header === 'change out date') changeOutCol = h;
```

This exact match failed because:
- Expected: `'change out date'`
- Actual column header: `'change out date assigned'`
- Result: `changeOutCol` remained `-1` (not found)

## Solution Applied

Changed the detection logic to use a partial match instead of exact match:

### Fixed Code (Line 519)
```javascript
// Match "change out date" or "change out date assigned"
if (header.indexOf('change out date') !== -1) changeOutCol = h;
```

Now it will match:
- ✅ "change out date"
- ✅ "change out date assigned"
- ✅ "Change Out Date Assigned" (case insensitive due to `.toLowerCase()`)
- ✅ Any variation containing "change out date"

## Additional Improvements

### 1. Enhanced Debug Logging
Added logging to show the detected column index:
```javascript
Logger.log('collectSwapTasks: Section ' + section + ' - Processing rows ... changeOutCol=' + changeOutCol);
```

### 2. Row-Level Debug Logging
Added logging to show the actual changeout date value being read:
```javascript
if (rowsNotDelivered <= 3) {
  Logger.log('collectSwapTasks: Row ' + (i+1) + ' Employee="' + employee + '" changeOutDate=' + changeOutDate + ' (type=' + typeof changeOutDate + ')');
}
```

This helps diagnose issues where:
- Column is detected but value is empty
- Value is in wrong format
- Value is not being parsed correctly

## Expected Result

After regenerating the schedule (Glove Manager → Schedule & To-Do → Step 2: Create Smart Schedule), swap tasks should now show:

```
📦 Swap
🧤 Glove Swaps
👤 Austin York (bold green)
   🗓️ Change Out: 11/10/2025 (indented under name)
```

## Testing Steps

1. **Regenerate Schedule**:
   - Open Rubber Tracker spreadsheet
   - Go to Glove Manager → Schedule & To-Do
   - Click Step 2: "Create Smart Schedule"

2. **Open Task List**:
   - Open Schedule dialog
   - Go to Tasks tab
   - Find Austin York's swap task

3. **Verify Display**:
   - ✅ Name should be bold green
   - ✅ Changeout date should show under name
   - ✅ Format: "🗓️ Change Out: MM/DD/YYYY"
   - ✅ Red text if overdue

4. **Check Logs** (if still not showing):
   - Go to Extensions → Apps Script
   - View → Executions
   - Check logs for "changeOutCol=" to verify column was detected
   - Check logs for "changeOutDate=" to see if value is being read

## Files Modified

1. **src/76-SmartScheduling.gs**:
   - Line 519: Changed exact match to partial match for changeout date column
   - Line 533: Added changeOutCol to debug logging
   - Lines 583-588: Added debug logging for changeout date values

## Deployment

✅ **Deployed**: January 27, 2026 via `.\push.bat`

## Related Issues

This fix resolves the same issue for:
- Glove Swaps (Austin York example)
- Sleeve Swaps (same column header)
- All Class 0, Class 2, and Class 3 sections

## Column Headers in Glove Swaps / Sleeve Swaps

The actual column headers are:
- Column A: "Employee"
- Column B: "Current Glove #" / "Current Sleeve #"
- Column C: "Size"
- Column D: "Change Out Date" or "Change Out Date Assigned" ← This one!
- Column E: "Days Left"
- Column F: "Pick List Glove #" / "Pick List Sleeve #"
- Column G: "Status"
- Column H: "Picked"
- Column I: "Date Changed"

The fix now correctly detects column D regardless of whether it says "Change Out Date" or "Change Out Date Assigned".

## Next Steps

After the schedule is regenerated, the changeout dates should appear. If they still don't show:

1. Check the logs to verify `changeOutCol` is not -1
2. Check the logs to see if `changeOutDate` values are being read
3. Verify the Glove Swaps / Sleeve Swaps sheets have data in the changeout date column (column D/E)
4. Check if the dates are in proper date format (not text)

## Related Documentation
- See `FIX_SWAP_EMPLOYEE_FORMATTING.md` for the original feature implementation
- See `.github/copilot-instructions.md` for complete feature log
