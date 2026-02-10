# Fix: Missing Safety Report Tasks Not Showing in Task List

**Date:** February 9, 2026  
**Issue:** Missing Safety Report tasks appear in Task Metadata and Safety Compliance sheets, but don't show up in the Task List dialog.

## Problem Analysis

### What We Found
1. ✅ **Task Metadata sheet** - Tasks are being created correctly (rows 10-13 showing Benjamin Lapka missing JHAs for multiple dates)
2. ✅ **Safety Compliance sheet** - Compliance tracking is working (week 01/31/2026 shows Benjamin Lapka missing reports)
3. ❌ **Task List dialog** - Tasks are NOT appearing in the Elliston location group

### Root Cause
The `collectAndGroupTasks()` function in `76-SmartScheduling.gs` collects tasks from these sources:
- Glove Swaps ✅
- Sleeve Swaps ✅
- Training Tracking ✅
- Reclaims ✅
- Expiring Certs ✅
- Manual Tasks ✅
- Safety Reports ✅
- **Missing Safety Reports ❌ (MISSING!)**

**Problem:** Missing Safety Report tasks are created directly in Task Metadata by the compliance tracking system (bypassing normal source sheets), but there was NO collection function to read them back into the task list.

## Solution Implemented

### 1. Added Collection Function Call
**File:** `src/76-SmartScheduling.gs` (line ~220)

Added call to new collection function after Safety Reports collection:
```javascript
// Collect Missing Safety Report tasks from Task Metadata (JHA/Weekly Meeting compliance)
var beforeMissingSafety = countTasks(tasksByLocation);
collectMissingSafetyReportTasks(ss, tasksByLocation, employeeLocations, employeeForemen, employeePhones, today);
var afterMissingSafety = countTasks(tasksByLocation);
Logger.log('collectAndGroupTasks: Missing Safety Reports added ' + (afterMissingSafety - beforeMissingSafety) + ' tasks');
```

### 2. Created Collection Function
**File:** `src/76-SmartScheduling.gs` (added after line 1958)

New function `collectMissingSafetyReportTasks()` that:
- Reads Task Metadata sheet directly
- Filters for `TaskType = "Missing Safety Report"`
- Skips completed tasks
- Extracts employee (foreman), location, phone, itemType, dueDate, notes
- Builds task objects compatible with existing task structure
- Adds tasks to `tasksByLocation` grouped by location

### Key Features
- **TaskType:** "Missing Safety Report"
- **ItemType:** "JHA", "Weekly Meeting", or "JHA + Weekly Meeting"
- **Employee:** This is the foreman name for these tasks
- **Estimated Time:** 15 minutes (phone call)
- **Priority:** High if overdue, Medium otherwise
- **Source:** "Safety Compliance"

## How It Works

### Data Flow
1. **Email Processing** → Safety emails processed → Compliance calculated
2. **Compliance Tracking** → Missing reports detected → Tasks created in Task Metadata
3. **Task Collection** → `collectMissingSafetyReportTasks()` reads from Task Metadata
4. **Task List UI** → Tasks appear grouped by location with other tasks

### Task Properties
```javascript
{
  employee: "Benjamin Lapka",           // Foreman name
  foreman: "Benjamin Lapka",
  location: "Elliston",
  type: "Missing Safety Report",
  taskType: "Missing Safety Report",
  itemType: "JHA + Weekly Meeting",     // What's missing
  phoneNumber: "(406) 370-0421",
  dueDate: Date object,
  daysTillDue: -X,
  isOverdue: true,
  priority: "High",
  estimatedTime: 0.25,                  // 15 minutes
  notes: "Missing JHA: 01/11/26, 01/18/26, 01/25/26, 02/01/26; Missing Weekly Safety Meeting for week of 01/31/2026",
  source: "Safety Compliance",
  sheetName: "Safety Compliance",
  rowIndex: 10
}
```

## Testing Steps

1. **Open Task List Dialog**
   - Glove Manager → Schedule & To-Do → 📅 Tasks & Calendar
   - Click "Task List" tab

2. **Verify Tasks Appear**
   - Look for Elliston location group
   - Should see Benjamin Lapka with "Missing Safety Report" tasks
   - Task should show itemType (JHA + Weekly Meeting)
   - Should have SMS button if phone number exists
   - Should show as High priority (red) if overdue

3. **Verify Task Details**
   - Click task to expand details
   - Should show notes with missing dates
   - Should show foreman name
   - Should show phone number

4. **Test Completion**
   - Mark task complete
   - Should update Task Metadata Status to "Complete"
   - Should disappear from Task List on refresh

## Related Files Modified

- **src/76-SmartScheduling.gs** (2 changes)
  - Added collection function call in `collectAndGroupTasks()` (~line 220)
  - Added new function `collectMissingSafetyReportTasks()` (~line 1960, ~140 lines)

## Deployment

- Deployed via `.\push.bat` on February 9, 2026
- All 50 files pushed successfully
- No syntax errors
- Warnings are pre-existing (ES6 syntax, unmatched braces in comments)

## Notes

- This fix does NOT change how tasks are created (that was already working)
- This fix only changes how tasks are READ back for display
- Tasks will now appear in all views: Task List, Calendar, Trip Planner
- Foreman names are shown as "employee" for consistency with other task types
- Phone numbers enable SMS notification buttons
- Tasks are office work (IsOffice = TRUE in metadata), no travel required

## Future Enhancements

Consider adding:
- Batch completion for multiple missing reports
- Auto-resolution when late reports are received
- Historical tracking of compliance trends per foreman
- Dashboard widget showing compliance rate

