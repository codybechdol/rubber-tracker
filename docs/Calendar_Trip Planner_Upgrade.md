# Option C Implementation - Unassigned Tasks & Status Standardization

## Overview
This document tracks the implementation of Option C: converting the Trip Planner into the primary scheduling interface with individual task management and standardized status values.

## Implementation Date: February 18, 2026

---

## Phase 1: Status Standardization ✅ COMPLETE

### New Standardized Status Values
| Status | Meaning | Replaces |
|--------|---------|----------|
| `Unassigned` | No scheduled date | `Pending` |
| `Assigned` | Has scheduled date | `Scheduled` |
| `Complete` | Task finished | (unchanged) |
| `Overdue` | Past due, not complete | (unchanged) |
| `Deferred` | Intentionally postponed | `Declined` |

### Changes Made
1. **Code.gs**
   - Updated `setupTaskMetadataSheet()` status validation to use new values
   - Updated `generateTaskMetadata()` to set `Unassigned` instead of `Pending`
   - Updated `reAddDeclinedCertToTaskList()` to use `Unassigned`
   - Added `migrateTaskMetadataStatuses()` function:
     - First clears existing validation (prevents errors)
     - Updates all status values using mapping
     - Re-applies new validation rules
   - Added `menuMigrateTaskStatuses()` menu function

2. **87-RoutePlanner.gs**
   - Updated default status to `Unassigned`

3. **ToDoSchedule.html**
   - Added CSS classes for new statuses: `.status-unassigned`, `.status-assigned`, `.status-deferred`
   - Updated `getStatusClass()` to handle all new status values

### Migration
Run: **Glove Manager → Maintenance → 🔄 Migrate Task Statuses**

This function:
1. Clears old data validation on Status column
2. Updates all existing status values:
   - "Pending" → "Unassigned"
   - "Scheduled" → "Assigned"
   - "Declined" → "Deferred"
   - Empty → "Unassigned"
3. Applies new data validation rules

---

## Phase 2: Trip Planner / Scheduler Rename ✅ COMPLETE

### Changes Made
1. **TripPlanner.html**
   - Changed dialog title from "Trip Planner" to "Trip Planner / Scheduler"
   - Changed sidebar title from "Unassigned Locations" to "📋 Unassigned Tasks"

2. **Code.gs Menu**
   - Menu item updated to reflect new name

---

## Phase 3: Individual Task Cards in Sidebar ✅ COMPLETE

### Changes Made
1. **TripPlanner.html - `renderUnassigned()` rewritten**
   - Shows collapsible location headers (📍 Bozeman, etc.)
   - Individual task cards under each location
   - Each task shows: icon, employee name, task type, due date, urgency dot

2. **New function: `createUnassignedTaskCard()`**
   - Creates draggable task cards
   - Shows deferred badge if applicable
   - Right-click context menu support

3. **New function: `handleUnassignedTaskDragStart()`**
   - Handles drag for single tasks (not entire locations)
   - Sets up drag data for `unassignedTask` type

4. **Updated `handleDrop()` to handle `unassignedTask` type**
   - Merges task into existing location if already on day
   - Creates new location entry if not present
   - Removes task from unassigned sidebar

---

## Phase 4: Right-Click Context Menu ✅ COMPLETE

### Features
- **📅 Schedule Next Week** - Assigns to Monday of next week
- **📅 Schedule in 2 Weeks** - Assigns to Monday 2 weeks out
- **⏸️ Defer Task** - Sets status to Deferred
- **↩️ Remove Deferred Status** - Removes deferred status
- **👁️ View Details** - Shows full task info popup

### New Functions Added
- `showTaskContextMenu(e, task, parentLocation)`
- `scheduleTaskForWeek(task, parentLocation, weeksAhead)`
- `deferTask(task, parentLocation)`
- `undeferTask(task, parentLocation)`
- `showTaskDetailsPopup(task, parentLocation)`
- `removeTaskFromUnassigned(task, parentLocation)`
- `getUrgencyLabel(urgency)`
- `formatDateForDisplay(date)`

---

## Phase 5: Remove Calendar Tab ✅ COMPLETE

### Changes Made
1. **ToDoSchedule.html**
   - Removed Calendar tab from nav
   - Made Task List the default active tab
   - Removed Calendar CSS styles
   - Added stub `renderCalendar()` function (prevents errors from legacy calls)
   - Task List is now the primary view

2. **Reason**: Trip Planner / Scheduler provides better scheduling functionality. Calendar was redundant.

---

## Bug Fixes Applied

### 1. Task Metadata Data Validation Error ✅ FIXED
**Problem:** Error when saving tasks: "The data you entered in cell O2 violates the data validation rules"
**Cause:** Old validation rules (Pending, Scheduled, etc.) still in place on Task Metadata sheet
**Solution:** Migration function now clears validation FIRST, then updates values, then applies new validation

### 2. `resolvedCrews is not defined` Error ✅ FIXED
**Problem:** Safety compliance tracking failed with "resolvedCrews is not defined"
**Location:** `88-SafetyReports.gs` line 2885
**Solution:** Added initialization code to load resolved crews from Safety Compliance sheet at the beginning of `calculateSafetyCompliance()` function

### 3. Trip Planner Syntax Error - Orphaned Code ✅ FIXED
**Problem:** Trip Planner stuck at "Loading tasks from source sheets..." with error: "Uncaught SyntaxError: Failed to execute 'write' on 'Document': Unexpected token '}'"
**Location:** `TripPlanner.html` lines 3003-3014
**Cause:** Orphaned code fragment left behind from a previous edit - contained a partial function body without function declaration
**Solution:** Removed the orphaned code block (12 lines) that included:
- A comment for `renderOfficeTasks` 
- Orphan code inside an unclosed `forEach`
- Dangling `});` and `}`

### 4. Apply to Schedule - Status Validation Error ✅ FIXED
**Problem:** Error: "The data you entered in cell O10 violates the data validation rules... Please enter one of the following values: Unassigned, Assigned, Complete, Overdue, Deferred"
**Location:** `87-RoutePlanner.gs` - `applyTripToSchedule()` function
**Cause:** Function was setting status to `'Scheduled'` (old value) instead of `'Assigned'` (new standardized value)
**Solution:** Changed all occurrences of `setValue('Scheduled')` to `setValue('Assigned')` in applyTripToSchedule()

### 5. Apply to Schedule - Date Mismatch / Wrong Dates ✅ FIXED
**Problem:** Tasks scheduled for 03/05/2026 in Trip Planner showed as 02/25/2026 in Task List
**Location:** `87-RoutePlanner.gs` - `applyTripToSchedule()` function
**Cause:** Function was matching tasks by LOCATION ONLY, not by specific task IDs. When a location (e.g., Bozeman) had tasks scheduled on multiple days, ALL Bozeman tasks were updated with whatever date was processed last.
**Solution:** Rewrote task matching logic to:
1. **If specific tasks provided** (from drag-drop): Match by `source + rowIndex` (precise matching)
2. **Fallback legacy behavior**: Match by location only (for backwards compatibility with saved plans)

**Code Changes:**
- Added `specificTasks` and `hasSpecificTasks` variables
- New task-specific matching loop using `source` and `rowIndex`
- Preserved original location-only matching as fallback in else block
- Added detailed logging for debugging

### 6. Drag to Office/Phone Tasks (Convert to Phone Tasks) ✅ FIXED
**Problem:** Users couldn't drag tasks FROM the calendar or Unassigned Tasks TO the Office/Phone Tasks sidebar to mark them as phone-only tasks (red circle/slash icon appeared).
**Solution:** Added drop handlers to the Office/Phone Tasks section:
1. **Drag from Calendar**: Removes location from scheduled day, converts all tasks to office tasks
2. **Drag from Unassigned**: Removes location from unassigned, converts tasks to office tasks  
3. **Drag individual task**: Moves single task to office tasks, removes from parent location

**Code Changes:**
- Added `handleOfficeDragOver()`, `handleOfficeDragLeave()`, `handleDropToOfficeTasks()` functions
- Added drop zone styling (green highlight on hover)
- Updated `renderOfficeTasks()` to add drag/drop event listeners
- Updated `handleDragEnd()` to clean up office drop zone styling
- Tasks moved to Office/Phone get `isOfficeTask: true` and `scheduledDate: null`

---

## Files Modified

| File | Changes |
|------|---------|
| `src/TripPlanner.html` | Renamed dialog, individual task cards, context menu, drag handling |
| `src/ToDoSchedule.html` | Removed Calendar tab, added status CSS, stub renderCalendar() |
| `src/Code.gs` | Status migration function, updated status validation |
| `src/87-RoutePlanner.gs` | Updated default status to 'Unassigned' |
| `src/88-SafetyReports.gs` | Added resolvedCrews initialization |

---

## Testing Checklist

- [x] Status migration runs without errors
- [x] Task Metadata shows new status values
- [x] Validation allows Unassigned, Assigned, Complete, Overdue, Deferred
- [x] Trip Planner loads correctly
- [x] Individual tasks appear under location headers
- [x] Tasks can be dragged to calendar days
- [x] Right-click context menu appears
- [x] Schedule Next Week/2 Weeks works
- [x] Defer/Undefer works
- [x] View Details popup works
- [x] Task List tab loads correctly
- [x] No errors in console (except known Google infrastructure warnings)
- [ ] Safety compliance tracking works (pending verification)

---

## Known Issues / Warnings (Non-Critical)

1. **Service worker warnings** - Google infrastructure, not our code
2. **Unrecognized feature warnings** - Browser feature policy, not critical
3. **Unmatched braces warnings** - False positives from simple brace counter (HTML attributes contain braces)

---

## Next Steps (If Needed)

1. **Phase 6: Office Tasks Scheduling** (Optional enhancement)
   - Allow dragging office tasks from sidebar to calendar days
   - Creates "Helena Office" location on that day
   
2. **Phase 7: Backlog Section** (Optional enhancement)
   - Split unassigned into "Urgent" (overdue, due soon) and "Backlog" (later)
   - Visual prioritization

---

## Rollback Instructions

If issues arise, revert status values:

```javascript
// Manual rollback in Apps Script console
function rollbackStatuses() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Task Metadata');
  var data = sheet.getDataRange().getValues();
  var statusCol = data[0].indexOf('Status');
  
  for (var i = 1; i < data.length; i++) {
    var status = String(data[i][statusCol]).toLowerCase();
    if (status === 'unassigned') sheet.getRange(i+1, statusCol+1).setValue('Pending');
    if (status === 'assigned') sheet.getRange(i+1, statusCol+1).setValue('Scheduled');
    if (status === 'deferred') sheet.getRange(i+1, statusCol+1).setValue('Declined');
  }
  
  // Restore old validation
  var oldValues = ['Pending', 'Scheduled', 'Complete', 'Overdue', 'Declined'];
  var rule = SpreadsheetApp.newDataValidation().requireValueInList(oldValues).setAllowInvalid(false).build();
  sheet.getRange(2, statusCol+1, sheet.getMaxRows()-1, 1).setDataValidation(rule);
}
```

