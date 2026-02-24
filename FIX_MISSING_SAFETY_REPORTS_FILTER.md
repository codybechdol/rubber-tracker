# Fix: Missing Safety Reports Not Showing in Task List (Again)

## Date: February 11, 2026

## Problem
After running "Process Safety Emails", the Missing JHAs and Weekly Safety Meeting tasks were not appearing in the Task List dialog.

## Root Cause
The `collectMissingSafetyReportTasks()` function in `76-SmartScheduling.gs` was filtering to ONLY show tasks from the **PREVIOUS week** (the week immediately before the current week).

This was intentional to avoid showing current week tasks (whose deadline hasn't passed), but it was **too restrictive** - it also excluded:
- Tasks from 2 weeks ago that were never completed
- Tasks from 3+ weeks ago that were never completed
- Any older missing report tasks

The filter code was:
```javascript
// Filter: Only include tasks from previous week
if (taskWeekStart.getTime() !== previousWeekStart.getTime()) {
  // Skip if not exactly the previous week
  continue;
}
```

## Solution
Changed the filter to include **ALL past week tasks** (any week whose deadline has passed):

**Before:**
- Only showed tasks from exactly 1 week ago
- Tasks from 2+ weeks ago were hidden

**After:**
- Shows tasks from any past week
- Only excludes current week (deadline hasn't passed yet)

The new filter code:
```javascript
// Filter: Include all PAST week tasks (exclude current week - deadline hasn't passed)
// A task is from a past week if its week start is BEFORE the current week start
if (taskWeekStart.getTime() >= currentWeekStart.getTime()) {
  continue; // Skip current or future week
}
```

## Files Modified
- `src/76-SmartScheduling.gs` - Updated `collectMissingSafetyReportTasks()` (lines 2215-2265)

## What Changed
| Before | After |
|--------|-------|
| Filter: `taskWeekStart === previousWeekStart` | Filter: `taskWeekStart < currentWeekStart` |
| Only 1 week shown | All past weeks shown |
| Lost tasks after 1 week | Tasks persist until completed |

## Testing
1. Run: **Glove Manager → 🛡️ Safety Reports → 📥 Process Safety Emails**
2. Wait for processing to complete
3. Open: **Glove Manager → Schedule & To-Do → Tasks & Calendar**
4. Look for "Safety Compliance" category with Missing Safety Report tasks
5. Tasks should show:
   - Employee name (foreman)
   - Week date
   - What's missing (JHA dates, Weekly Meeting)

## Why This Happened
The original design only showed "last week's" tasks to keep the list focused. However, this caused older uncompleted tasks to disappear from view, making it seem like they vanished after being processed.

The new design shows ALL past incomplete tasks, which:
- Ensures no tasks are lost
- Shows the full backlog of compliance issues
- Makes it easier to track older outstanding items

## Deployment
✅ **DEPLOYED** - Changes pushed to Google Apps Script on February 11, 2026.

All 51 files were successfully pushed including:
- `76-SmartScheduling.gs` - Contains the updated `collectMissingSafetyReportTasks()` function
- `88-SafetyReports.gs` - Contains the `getLastSafetyEmailProcessedTime()` helper function
- `ProcessSafetyEmailsDialog.html` - New HTML file for the Process Safety Emails dialog

