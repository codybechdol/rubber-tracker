# Fix Safety Compliance Issues - February 12, 2026

## Issues Fixed

### Issue 1: "Week of: Unknown" in Resolution Dialog

**Problem:** The Resolution dialog showed "Week of: Unknown" even though missing dates were visible (e.g., Friday 02/06/2026).

**Root Cause:** The `openMissingReportResolutionModal` function only extracted weekOf from the notes string `week of MM/DD/YYYY` format, but many tasks didn't have this in their notes.

**Solution:** Added multiple fallback methods to calculate the week:
1. First try to extract from notes (existing method)
2. If not found, calculate from the first missing date (subtract to get Sunday of that week)
3. If not found, try to parse from task.tid (TaskID)
4. If not found, calculate from task.dueDate (due date is Saturday, so Sunday = due - 6 days)

Also added debug logging to trace notes parsing.

**Files Modified:** `src/ToDoSchedule.html` - `openMissingReportResolutionModal()` function

### Issue 2: "Could not identify crew from task" Error

**Problem:** When clicking "Save Resolutions", got error "Could not identify crew from task" because the job number couldn't be extracted.

**Root Cause:** 
1. The `recordMissingReportResolutions` function only accepted 4 parameters, but the client was passing 5 (including `employeeName`). 
2. The server function referenced `employeeName` without having it as a parameter.
3. The `jobNumber` field was NOT being passed through the data pipeline from server → client → server.

**Solution:** 
1. Added `employeeName` as 5th parameter to `recordMissingReportResolutions()` (already done)
2. **Added `jobNumber` to the enrichedTask object** in `getTasksWithMetadata()` when merging task with metadata
3. **Added `job` field to serialized tasks** in `getTasksWithMetadata()` (shortened name for transfer)
4. **Added `jobNumber` extraction in serialization** - extracts from task.jobNumber, taskID, or rowIndex
5. **Added `jobNumber` to expanded tasks** in client-side `processTaskData()`
6. The function now uses employee name lookup when job number can't be extracted from TaskID

**Files Modified:** 
- `src/88-SafetyReports.gs` - `recordMissingReportResolutions()` function signature
- `src/Code.gs` - `getTasksWithMetadata()` - Added jobNumber to enrichedTask and serialization
- `src/ToDoSchedule.html` - `processTaskData()` - Added jobNumber expansion

### Issue 3: Missing Safety Compliance Tasks Not Showing in Task List (8 crews from week 02/01/2026)

**Problem:** The Safety Compliance sheet showed 8 crews with missing reports (Darrell Swann, Matt Miller, Corey Allen, Waco Worts, Erik Davis, Kameron Jones, Keenan O'Keefe, Ben Lapka), but they weren't appearing in the Task List.

**Root Cause:** The `collectMissingSafetyReportTasks()` function only collected tasks where TaskID started with `SafetyCompliance_` in a specific format (`SafetyCompliance_XXX-XX_MM-DD-YYYY`). Tasks with incorrect TaskID formats were being skipped.

**Solution:** Enhanced the function to identify Safety Compliance tasks in multiple ways:
1. TaskID starts with `SafetyCompliance_` (existing)
2. SourceSheet is `'Safety Compliance'` (NEW)
3. TaskType is `'Missing Safety Report'` (NEW)

Also added multiple fallback methods to extract job number and week date:
- Extract from TaskID format
- Extract from SourceRow field
- Extract from Notes field
- Lookup by Employee name
- Calculate week from DueDate

**Files Modified:** `src/76-SmartScheduling.gs` - `collectMissingSafetyReportTasks()` function

### Issue 4: weekOf Not Being Passed Correctly to Server

**Problem:** The `saveResolutions()` function was recalculating weekOf from notes, but the notes might not have the week info.

**Solution:** Updated `saveResolutions()` to:
1. First get weekOf from the modal display (which was already calculated correctly)
2. Fall back to notes if modal didn't have it
3. Final fallback: calculate from the first missing date

**Files Modified:** `src/ToDoSchedule.html` - `saveResolutions()` function

## Data Flow Fix Summary

The job number was being lost in the data pipeline. Here's the fix:

```
collectMissingSafetyReportTasks() → creates task with jobNumber
        ↓
getTasksWithMetadata() → [FIXED] now copies task.jobNumber to enrichedTask
        ↓
serialization → [FIXED] now includes job: jobNumber
        ↓
client processTaskData() → [FIXED] now expands job to task.jobNumber
        ↓
saveResolutions() → now can read task.jobNumber
        ↓
recordMissingReportResolutions() → receives jobNumber, can find Safety Compliance row
```

## Changes Summary

| File | Function | Change |
|------|----------|--------|
| `ToDoSchedule.html` | `openMissingReportResolutionModal()` | Added weekOf calculation fallbacks + debug logging |
| `ToDoSchedule.html` | `saveResolutions()` | Get weekOf from modal display first |
| `ToDoSchedule.html` | `processTaskData()` | Added `jobNumber: t.job \|\| ''` expansion |
| `88-SafetyReports.gs` | `recordMissingReportResolutions()` | Added employeeName as 5th parameter |
| `76-SmartScheduling.gs` | `collectMissingSafetyReportTasks()` | Added multiple task identification methods |
| `Code.gs` | `getTasksWithMetadata()` | Added `jobNumber` to enrichedTask object |
| `Code.gs` | `getTasksWithMetadata()` serialization | Added `job` field with extraction logic |

## How to Verify

1. **Week of Display:** Open a Missing Safety Report task's resolution dialog - should show calculated week, not "Unknown"
2. **Save Resolutions:** Select reasons and save - should succeed without "Could not identify crew" error
3. **Task List:** All 8 crews from week 02/01/2026 should now appear under "Safety Compliance" category
4. **Console Debug:** Check browser console for `openMissingReportResolutionModal: DEBUG` messages showing notes parsing

## Deployed

Pushed to Google Apps Script via `.\push.bat` on February 12, 2026

