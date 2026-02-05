# Fix: Trip Planner Breaking After Reset

**Date:** February 2, 2026  
**Status:** ✅ FIXED & DEPLOYED

## Problem

When clicking the "Reset" button in Trip Planner, it would break and show "No Pending Tasks" even though there were 45 tasks in the Task Metadata sheet.

### Root Cause

The Trip Planner's `collectTasksForTripPlanner()` function calls `getTasksWithMetadata()` to fetch tasks. However, when called from server-side code (not from a client dialog), `getTasksWithMetadata()` stores the data in ScriptProperties and returns a confirmation object:

```javascript
{
  stored: true,
  totalTasks: 45,
  lastGenerated: "2/2/2026"
}
```

The Trip Planner was expecting the actual tasks array:

```javascript
{
  tasks: [...],
  totalTasks: 45,
  lastGenerated: "2/2/2026"
}
```

This caused `metadataResult.tasks` to be `undefined`, which led to 0 tasks being processed.

## Error Logs Analysis

From the execution logs:

```
getTasksWithMetadata: Returning confirmation to client
getTasksWithMetadata returned 0 tasks          ← Wrong! Should be 45
Grouped tasks into 0 locations                 ← Wrong!
Found 0 pending tasks in 0 locations           ← Wrong!
```

The actual data was stored successfully in ScriptProperties, but the Trip Planner didn't know to fetch it.

## Solution

Updated `collectTasksForTripPlanner()` in `87-RoutePlanner.gs` to:

1. **Detect the confirmation response** - Check if `metadataResult.stored === true` and tasks array is missing
2. **Fetch actual tasks** - Call `getStoredTasks()` to retrieve the data from ScriptProperties
3. **Deserialize compressed format** - Convert abbreviated field names to full names

### Code Changes

**File:** `src/87-RoutePlanner.gs` (lines 527-573)

```javascript
// Phase 6: Use getTasksWithMetadata() for all task data
var metadataResult;
try {
  metadataResult = getTasksWithMetadata();
  Logger.log('getTasksWithMetadata returned ' + (metadataResult.tasks ? metadataResult.tasks.length : 0) + ' tasks');
  
  // NEW: Check if data was stored in ScriptProperties (server-to-server call)
  if (metadataResult.stored === true && !metadataResult.tasks) {
    Logger.log('Data stored in ScriptProperties, fetching via getStoredTasks...');
    metadataResult = getStoredTasks();
    Logger.log('getStoredTasks returned ' + (metadataResult.tasks ? metadataResult.tasks.length : 0) + ' tasks');
    
    // NEW: Deserialize compressed tasks
    if (metadataResult.tasks && metadataResult.tasks.length > 0) {
      var firstTask = metadataResult.tasks[0];
      // Check if tasks are in compressed format (abbreviated field names)
      if (firstTask.emp !== undefined || firstTask.loc !== undefined) {
        Logger.log('Deserializing compressed task format...');
        metadataResult.tasks = metadataResult.tasks.map(function(t) {
          return {
            taskKey: t.taskKey,
            employee: t.emp || '',
            taskType: t.type || '',
            type: t.type || '', // Alias
            itemType: t.item || '',
            location: t.loc || '',
            phoneNumber: t.phone || '',
            dueDate: t.due || '',
            scheduledDate: t.sched || '',
            startTime: t.start || '',
            endTime: t.end || '',
            status: t.stat || 'Pending',
            isOverdue: t.over === 1,
            daysTillDue: t.days || 0,
            sheetName: t.src || '',
            source: t.src || '',
            rowIndex: t.row || 0,
            isManualTask: t.manual === 1,
            inTaskList: t.inList === 1,
            isRegistered: t.reg === 1
          };
        });
        Logger.log('Deserialized ' + metadataResult.tasks.length + ' tasks');
      }
    }
  }
} catch (e) {
  Logger.log('ERROR calling getTasksWithMetadata: ' + e.message);
  // Fall back to old method if Task Metadata not available
  Logger.log('Falling back to collectAndGroupTasks...');
  return collectTasksForTripPlannerLegacy();
}
```

## Why This Happens

The `getTasksWithMetadata()` function was designed to work with client-side dialogs (HTML), where the 50KB transfer limit is a concern. To work around this:

1. It stores the full task data (15KB) in ScriptProperties
2. Returns a small confirmation object to the client
3. The client then calls `getStoredTasks()` to fetch the actual data

**Server-to-server calls** (like Trip Planner calling from `suggestOptimalTrips()`) don't have the same transfer limit, but they were getting the confirmation object instead of the data.

## Compressed Task Format

Tasks stored in ScriptProperties use abbreviated field names to save space:

| Full Name | Abbreviated | Example |
|-----------|-------------|---------|
| employee | emp | "Benjamin Lapka" |
| location | loc | "Elliston" |
| taskType | type | "Glove Swap" |
| itemType | item | "Glove" |
| phoneNumber | phone | "14063700421" |
| dueDate | due | "1/16/2026" |
| scheduledDate | sched | "2/5/2026" |
| startTime | start | "07:00" |
| endTime | end | "17:00" |
| status | stat | "Pending" |
| isOverdue | over | 1 or 0 |
| daysTillDue | days | -17 |
| sheetName | src | "Glove Swaps" |
| rowIndex | row | 19 |
| isManualTask | manual | 1 or 0 |
| inTaskList | inList | 1 or 0 |
| isRegistered | reg | 1 or 0 |

The deserialization code converts these back to full names for processing.

## Testing Checklist

- [x] Deploy fix to Google Apps Script
- [ ] Open Trip Planner dialog
- [ ] Click "Reset" button
- [ ] Verify tasks load correctly (should show 45 tasks)
- [ ] Verify locations appear in unassigned pool
- [ ] Verify dragging locations to days works
- [ ] Verify "Refresh Tasks" button works

## Expected Behavior After Fix

When the Trip Planner runs `suggestOptimalTrips()`, the logs should show:

```
getTasksWithMetadata returned 0 tasks
Data stored in ScriptProperties, fetching via getStoredTasks...
getStoredTasks returned 45 tasks
Deserializing compressed task format...
Deserialized 45 tasks
Grouped tasks into X locations
Found 45 pending tasks in X locations
```

## Related Files

- `src/87-RoutePlanner.gs` - Trip Planner backend (UPDATED)
- `src/Code.gs` - Contains `getTasksWithMetadata()` and `getStoredTasks()` functions
- `TripPlanner.html` - Trip Planner UI (no changes needed)

## Deployment

✅ **Deployed via push.bat** on February 2, 2026  
✅ **No syntax errors**  
✅ **Ready to test**

---

**Next Steps:** Test the Trip Planner reset button to verify the fix works!
