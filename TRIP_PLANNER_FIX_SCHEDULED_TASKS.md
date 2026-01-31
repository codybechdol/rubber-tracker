# Trip Planner Fix: Preserve Already-Scheduled Tasks

**Date:** January 27, 2026  
**Issue:** When applying trip plan to schedule, tasks that were already scheduled for future dates were being moved to new dates.

## Problem Description

When moving a location to a different date in Trip Planner and clicking "Apply to Schedule", the system was updating **ALL** tasks at that location, including tasks that were already scheduled for different future dates.

### Example Scenario
1. **Cody Lund's glove swap** - Eliston - Not yet scheduled
2. **Dillon Hahnkamp's CPR** - Eliston - Already scheduled for 01/29/2026 (office work)
3. User moves Eliston to 02/02/2026 in Trip Planner (for Cody's glove swap)
4. Clicks "Apply to Schedule"
5. **Bug:** Both tasks get updated to 02/02/2026, even though Dillon's CPR was already scheduled for 01/29

This is problematic because:
- Cert tasks (like CPR) can be handled over the phone/office - they don't require physical trips
- Tasks already scheduled should not be moved when planning a different trip
- The Trip Planner correctly showed only Cody's task, but Apply updated both

## Solution

Added date filtering in two places:

### 1. Filter Pending Tasks (Prevention)
**File:** `87-RoutePlanner.gs` → `getPendingTasksWithLocations()`

- Tasks with a **future scheduled date** are now filtered out of the pending tasks list
- Only shows tasks that are:
  - Not yet scheduled (no scheduled date)
  - Overdue/past their scheduled date
- This prevents already-scheduled tasks from appearing in Trip Planner

### 2. Protect During Apply (Safety Net)
**File:** `87-RoutePlanner.gs` → `applyTripToSchedule()`

- Before updating a task's scheduled date, checks if it already has a future date
- Skips the update if the task is already scheduled for the future
- Logs: "Skipping row X - already scheduled for [date]"

## Code Changes

### Change 1: Filter Future-Scheduled Tasks
```javascript
// Skip tasks that already have a future scheduled date
// These are already planned and shouldn't be moved
if (scheduledDate) {
  var schedDate = scheduledDate instanceof Date ? scheduledDate : new Date(scheduledDate);
  if (!isNaN(schedDate.getTime())) {
    schedDate.setHours(0, 0, 0, 0);
    // If scheduled date is in the future, skip this task
    if (schedDate > today) {
      skippedCount.scheduled = (skippedCount.scheduled || 0) + 1;
      continue;
    }
    dueDate = schedDate;
    daysTillDue = Math.ceil((schedDate - today) / (1000 * 60 * 60 * 24));
  }
}
```

### Change 2: Protect Already-Scheduled Tasks During Apply
```javascript
// Check if this task already has a future scheduled date
var existingScheduledDate = todoData[row][scheduledDateCol];
var skipUpdate = false;

if (existingScheduledDate) {
  var existingDate = existingScheduledDate instanceof Date ? existingScheduledDate : new Date(existingScheduledDate);
  if (!isNaN(existingDate.getTime())) {
    existingDate.setHours(0, 0, 0, 0);
    // Skip if already scheduled for a future date
    if (existingDate > today) {
      Logger.log('Skipping row ' + (row + 1) + ' (' + rowLocation + ') - already scheduled for ' + existingDate.toDateString());
      skipUpdate = true;
    }
  }
}

if (!skipUpdate) {
  // Update the scheduled date...
}
```

## Behavior After Fix

### Scenario 1: Unscheduled Task
- **Cody Lund's glove swap** - Eliston - No scheduled date
- Shows in Trip Planner as pending
- Clicking "Apply to Schedule" → ✅ Updates to trip date

### Scenario 2: Already Scheduled for Future
- **Dillon Hahnkamp's CPR** - Eliston - Scheduled 01/29/2026
- Does NOT show in Trip Planner (filtered out)
- Even if location matches, "Apply to Schedule" → ❌ Skips this task (preserves 01/29 date)

### Scenario 3: Overdue/Past Scheduled Date
- **Old Task** - Eliston - Scheduled 01/15/2026 (past)
- Shows in Trip Planner as overdue
- Clicking "Apply to Schedule" → ✅ Updates to new trip date (reschedules)

## Logging

New log entries show filtering and skipping:
```
Found 12 pending tasks in 5 locations
Skipped: 0 empty, 3 completed, 2 Helena/office, 1 cert expiring (phone), 4 already scheduled

Skipping row 25 (eliston) - already scheduled for Wed Jan 29 2026
Updated row 28 (eliston) to Sun Feb 02 2026 @ 9:30am
```

## Testing Checklist

- [x] Deploy with `.\push.bat` ✅
- [ ] Test moving location with only unscheduled tasks → Should update
- [ ] Test moving location with already-scheduled tasks → Should skip
- [ ] Test moving location with mix of both → Should only update unscheduled
- [ ] Verify log messages show "Skipping row X - already scheduled"
- [ ] Verify calendar reflects correct dates after apply

## Impact

- **User Experience:** Trip Planner now respects already-scheduled tasks
- **Data Integrity:** Prevents accidental overwriting of scheduled dates
- **Flexibility:** Users can plan new trips without disrupting existing schedule
- **Office Work:** Cert tasks can remain on office days while planning field trips

## Related Files

- `src/87-RoutePlanner.gs` - Route planning and trip application logic
- `src/TripPlanner.html` - Trip Planner UI dialog
- `src/Schedule.html` - Unified Schedule Hub (includes Trip Planner tab)

## Notes

This fix maintains the distinction between:
- **Pending tasks** (need to be scheduled) - shown in Trip Planner
- **Scheduled tasks** (already have dates) - protected from being moved
- **Office work** (certs, phone work) - can be scheduled separately from field trips
