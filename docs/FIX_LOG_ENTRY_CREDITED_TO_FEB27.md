# Fix: Log Entry "Credited To" Values - February 27, 2026

## Problem

When users assigned foremen to unknown job numbers during "Process Safety Emails", the JHA Log, Weekly Safety Log, and Monthly Checklist Log entries were not being credited to the correct crew.

### Symptoms

1. Line 12 (week of 02/22/2026) in Safety Compliance shows no credits even though emails exist in Gmail
2. Tooltip showing "Feb 19th" instead of "Feb 26th" for Thursday column
3. User-assigned foremen weren't resulting in proper crew credits

### Root Cause

In `updateLogEntriesForAssignedJobs()`, the function was calling:
```javascript
var primaryCrew = findForemanPrimaryCrew(assignment.foreman, null);
```

The second parameter (`employeeData`) was `null`, causing `findForemanPrimaryCrew()` to immediately return `null`:
```javascript
function findForemanPrimaryCrew(foremanName, employeeData) {
  if (!foremanName || !employeeData) return null;  // <-- Returns null immediately!
  ...
}
```

As a result, the fallback was used:
```javascript
primaryCrew: primaryCrew || baseJob  // baseJob = original typo job number like "054-26"
```

So entries were being "credited" to typo job numbers (054-26, 006-26, etc.) instead of actual tracked crews (052-25, etc.).

## Solution

### Fix 1: Load Employee Data Before Looking Up Crews

Updated `updateLogEntriesForAssignedJobs()` to load Employees sheet data first:

```javascript
// Load employee data to find foreman's primary crew
var empSheet = ss.getSheetByName('Employees');
var employeeData = empSheet ? empSheet.getDataRange().getValues() : null;

// Now findForemanPrimaryCrew will actually work
var primaryCrew = findForemanPrimaryCrew(assignment.foreman, employeeData);
```

### Fix 2: New Function to Fix All Existing Log Entries

Added `fixAllLogEntryCreditedTo()` which:
1. Loads Employees sheet data
2. Gets list of tracked crews
3. Iterates through all JHA Log, Weekly Safety Log, and Monthly Checklist Log entries
4. For each entry with a foreman name, looks up their primary crew
5. Updates "Credited To" column to the correct crew
6. Updates "Status" to "Credited" if it was "Unknown Job" or "Skipped"
7. Adds note documenting the fix

### Fix 3: New Menu Function

Added **Glove Manager → 🛡️ Safety → 🔧 Fix Log Entries & Recalculate** which:
1. Runs `fixAllLogEntryCreditedTo()` to fix all log entries
2. Runs `recalculateAllComplianceFromLogs()` to recalculate compliance for all weeks
3. Refreshes tooltips

## How to Fix Your Data

Run: **Glove Manager → 🛡️ Safety → 🔧 Fix Log Entries & Recalculate**

This will:
1. Scan all log entries and fix incorrect "Credited To" values
2. Recalculate compliance for every week in Safety Compliance sheet
3. Refresh all tooltips with correct dates

## Files Modified

1. **`src/88-SafetyReports.gs`**
   - Fixed `updateLogEntriesForAssignedJobs()` to load employee data
   - Added `fixAllLogEntryCreditedTo()` function
   - Added `menuFixAndRecalculateCompliance()` menu function

2. **`src/Code.gs`**
   - Added menu item for new fix function

## Affected Crews (from user report)

- Ben Lapka (052-25) - Job numbers: 054-26, 006-26, 054-25, 053-25, 034-26
- Erik Davis (038-26)
- Matt Miller (015-26)
- Waco Worts (029-25)
- Chad Cliff (036-26)
- Keenan O'Keefe (037-26)

## About the Tooltip Date Issue

The tooltip showing "Feb 19th" for a Thursday in week of 02/22/2026 was a side effect:
- The lookup was finding a JHA entry credited to an incorrect job number
- When the date in that entry (02/19) didn't match the expected date (02/26), the tooltip showed inconsistent data
- After running the fix, tooltips will show correct dates because entries are credited to proper crews

