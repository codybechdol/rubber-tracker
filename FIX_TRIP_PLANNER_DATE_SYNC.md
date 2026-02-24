# Fix: Trip Planner Date Synchronization with Task List/Calendar

**Date:** February 17, 2026

## Problem

Tasks scheduled in the Task List or Calendar view (e.g., Big Sky tasks scheduled for 02/23/2026) were not appearing in the Trip Planner on their scheduled day. The Trip Planner showed the correct dates in the week columns but the locations were empty.

**Symptoms:**
- Calendar shows "Big Sky" on Mon Feb 23
- Task List shows Big Sky training scheduled for 02/23/2026
- Trip Planner shows "Week of Feb 23" with Monday column **empty**

## Root Cause

**UTC vs Local Time Parsing Issue**

When reading scheduled dates from Task Metadata, the code was using:
```javascript
var scheduledDateObj = new Date(sourceTask.scheduledDate);
```

When `sourceTask.scheduledDate` is a string like `"2026-02-23"` (ISO date format without time), JavaScript's `new Date()` interprets this as **UTC midnight**. In time zones west of UTC (like Mountain Time, UTC-7), this becomes:
- UTC: `2026-02-23 00:00:00`
- Local: `2026-02-22 17:00:00` (previous day!)

This caused scheduled dates to be off by one day, so tasks scheduled for Monday Feb 23 were being parsed as Sunday Feb 22 - which is skipped as a weekend day.

## Solution

Added a new `parseDateAsLocal()` helper function that correctly parses YYYY-MM-DD strings as local time:

```javascript
function parseDateAsLocal(dateValue) {
  if (!dateValue) return null;
  
  if (dateValue instanceof Date) {
    return isNaN(dateValue.getTime()) ? null : dateValue;
  }
  
  var dateStr = String(dateValue).trim();
  var isoMatch = dateStr.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (isoMatch) {
    var year = parseInt(isoMatch[1], 10);
    var month = parseInt(isoMatch[2], 10) - 1; // JS months are 0-indexed
    var day = parseInt(isoMatch[3], 10);
    return new Date(year, month, day, 0, 0, 0, 0); // Local time!
  }
  
  // Also handles MM/DD/YYYY format
  // ... (see full implementation)
  
  return null;
}
```

Updated the scheduled date parsing in `collectTasksForTripPlanner()`:
```javascript
// Before (buggy):
var scheduledDateObj = sourceTask.scheduledDate instanceof Date ?
    sourceTask.scheduledDate : new Date(sourceTask.scheduledDate);

// After (fixed):
var scheduledDateObj = parseDateAsLocal(sourceTask.scheduledDate);
```

## Files Modified

- `src/87-RoutePlanner.gs`:
  - Added `parseDateAsLocal()` function (~45 lines, after line 80)
  - Updated `collectTasksForTripPlanner()` to use `parseDateAsLocal()` (line ~776)
  - Added diagnostic logging for scheduled tasks

## Data Flow Verification

The fix ensures consistent data flow between:

1. **Task List/Calendar** (ToDoSchedule.html)
   - User schedules a task for a date
   - Calls `saveScheduleTaskDateChanges()` which updates Task Metadata

2. **Task Metadata Sheet**
   - Stores `ScheduledDate` column as Date objects
   - When serialized via `getTasksWithMetadata()`, dates become `YYYY-MM-DD` strings

3. **Trip Planner** (TripPlanner.html + 87-RoutePlanner.gs)
   - Calls `suggestOptimalTrips()` → `getPendingTasksWithLocations()` → `collectTasksForTripPlanner()`
   - Reads scheduled dates from Task Metadata
   - **NEW:** Uses `parseDateAsLocal()` to correctly parse date strings
   - Pre-assigns scheduled tasks to their correct work day (Step 5.5)
   - Displays location cards on the correct day column

## Testing

After deploying, verify:

1. Schedule a task for a specific date in Task List
2. Open Trip Planner
3. The task should appear on the correct day

**Console Logging Added:**
The fix adds diagnostic logging to help troubleshoot future issues:
```
Scheduled task found: Big Sky (Matthew Miller) -> dateKey=2026-02-23 (original: 2026-02-23)
```

## Related Issues

This fix also addresses the general issue of JavaScript date parsing in Google Apps Script. Other places in the codebase that parse YYYY-MM-DD strings may have similar timezone issues. The `parseDateAsLocal()` function can be reused.

## Common Date Parsing Pitfalls

| Input | `new Date(str)` Result (MT) | `parseDateAsLocal(str)` Result |
|-------|---------------------------|-------------------------------|
| `"2026-02-23"` | Feb 22, 5:00 PM ❌ | Feb 23, 12:00 AM ✅ |
| `"02/23/2026"` | Feb 23, 12:00 AM ✅ | Feb 23, 12:00 AM ✅ |
| Date object | Unchanged | Unchanged |

