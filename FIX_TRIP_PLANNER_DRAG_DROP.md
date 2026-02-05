# Trip Planner Drag-and-Drop Fixes

**Date:** February 3, 2026  
**Status:** ✅ COMPLETE (Update 3)

## Issues Fixed

### Issue 1: Cannot Drag Location Cards
**Symptom:** Dragging location cards from Unassigned Locations to days (or between days) did not work.

**Root Cause:** Data structure inconsistency between assigned and unassigned locations:
- Assigned location cards used `loc.location` property
- Unassigned location cards used `loc.name` property
- The `handleDrop()` function looked for `location.name` first, which worked for unassigned but the data wasn't structured correctly

**Additional Fix (Update 2):** Added `e.dataTransfer.setData()` calls and console logging to debug drag issues.

### Issue 2: Missing Unassigned Locations
**Symptom:** Not all locations without scheduled dates appeared in the Unassigned Locations section.

**Root Cause:** The `cleanUnassigned` mapping in `suggestOptimalTrips()` didn't include the `tasks` array, so when locations were dragged, no task data was available for the drop handler.

**Clarification:** Some locations may not appear in Unassigned because:
- **Cert Expiring tasks** → Go to "Office Work" (phone tasks), not field trips
- **Tasks with scheduled dates** → Already assigned to calendar days, not unassigned

### Issue 3: Unassigned List Too Small
**Symptom:** Could not scroll through all unassigned locations when there were many.

**Root Cause:** CSS `max-height: 200px` was too restrictive.

### Issue 4: Christian Sugrue showing as his own section (NEW - Update 2)
**Symptom:** Christian Sugrue (a journeyman under Darrell Swann) appeared as his own foreman section instead of being grouped under Darrell Swann.

**Root Cause:** The `getTaskGroupName()` function in ToDoSchedule.html didn't use the `task.foreman` property - it only extracted foreman from the location string or used the employee name.

**Solution:** Updated `getTaskGroupName()` to check `task.foreman` property after checking location string but before falling back to employee name.

### Issue 5: Missing `recalculateDayPlan` function (Update 2)
**Symptom:** After drag-and-drop, console showed error: `google.script.run.withSuccessHandler(...).withFailureHandler(...).recalculateDayPlan is not a function`

**Root Cause:** The frontend `TripPlanner.html` was calling `recalculateDayPlan()` to recalculate day timings after a location is moved, but this function didn't exist in the backend.

**Solution:** Added `recalculateDayPlan(params)` function to `87-RoutePlanner.gs` that wraps the existing `calculateDayPlan()` function and accepts parameters from the frontend.

### Issue 6: Office Card Cannot Be Dragged (NEW - Update 3)
**Symptom:** The Office Work card in the Unassigned Locations panel could be clicked to show tasks but could NOT be dragged to a day like California and South Dakota cards.

**Root Cause:** The Office card was created with only a `click` event listener but NO drag event listeners (`dragstart`, `dragend`). Also, the `handleDrop()` function didn't know how to remove Office tasks from the source since they're stored in `tripPlan.officeTasks`, not `tripPlan.unassignedLocations`.

**Solution:** 
1. Added `draggable = true` to the Office card
2. Added `dragstart` and `dragend` event listeners to Office card
3. Created proper `draggedLocationData` object with `type: 'office'`
4. Updated `handleDrop()` to check for `type === 'office'` and clear `tripPlan.officeTasks` array when Office card is dropped
5. Added click/drag differentiation using mousedown timing (short click = popup, long hold = drag)

### Issue 7: Office Location Tasks Not Showing on Trip Planner After Scheduling (NEW - Update 3)
**Symptom:** When a task with location "Office" was given a scheduled date in the Task List, it would appear on the Calendar tab but NOT on the Trip Planner for that day.

**Root Cause:** The `collectTasksForTripPlanner()` function was skipping tasks that had future scheduled dates (line 690-700). These tasks weren't being collected into a separate data structure to be pre-assigned to their scheduled days. Additionally, "Office" wasn't recognized as a valid location direction.

**Solution:**
1. **Changed skip logic to collect logic** - Instead of skipping future scheduled tasks, now collects them into `scheduledTasks` object grouped by date key (YYYY-MM-DD)
2. **Added Step 5.5 in `suggestOptimalTrips()`** - Pre-assigns scheduled tasks to their work days, grouping by location and merging with existing locations on the same day
3. **Added "Office" to local direction** - Updated `getLocationDirection()` to return "Local" for "office" location (same as Helena)
4. **Tasks include all metadata** - Scheduled tasks include urgency, due date, employee, times, etc. for proper display

---

## Changes Made

### 1. `87-RoutePlanner.gs` - `cleanUnassigned` mapping (lines 1649-1667)

**Before:**
```javascript
var cleanUnassigned = unassigned.map(function(loc) {
  return {
    name: loc.name,
    direction: loc.direction,
    taskCount: loc.tasks ? loc.tasks.length : 0,
    maxUrgency: loc.maxUrgency || 0,
    estimatedTime: loc.estimatedTime || 0
  };
});
```

**After:**
```javascript
var cleanUnassigned = unassigned.map(function(loc) {
  return {
    location: loc.name, // Standardized: use 'location' consistently
    name: loc.name, // Keep for backward compatibility
    direction: loc.direction,
    taskCount: loc.tasks ? loc.tasks.length : 0,
    maxUrgency: loc.maxUrgency || 0,
    estimatedTime: loc.estimatedTime || 0,
    // Include minimal task data for drag-drop and completion
    tasks: (loc.tasks || []).map(function(t) {
      return {
        rowIndex: t.rowIndex,
        source: t.source || 'To Do List',
        taskType: t.taskType || '',
        employee: t.employee || '',
        itemType: t.itemType || '',
        location: t.location || loc.name,
        urgencyLabel: t.urgencyLabel || ''
      };
    })
  };
});
```

### 2. `TripPlanner.html` - `handleUnassignedDragStart()` function

**Before:**
```javascript
function handleUnassignedDragStart(e) {
  draggedElement = e.target;
  draggedElement.classList.add('dragging');

  const idx = parseInt(e.target.dataset.unassignedIndex);

  draggedLocationData = {
    type: 'unassigned',
    index: idx,
    location: tripPlan.unassignedLocations[idx]
  };

  e.dataTransfer.effectAllowed = 'move';
}
```

**After:**
```javascript
function handleUnassignedDragStart(e) {
  draggedElement = e.target;
  draggedElement.classList.add('dragging');

  const idx = parseInt(e.target.dataset.unassignedIndex);
  var loc = tripPlan.unassignedLocations[idx];

  // Ensure location object has standardized 'location' property
  if (loc && !loc.location && loc.name) {
    loc.location = loc.name;
  }

  draggedLocationData = {
    type: 'unassigned',
    index: idx,
    location: loc
  };

  e.dataTransfer.effectAllowed = 'move';
}
```

### 3. `TripPlanner.html` - `handleDrop()` function

**Before:**
```javascript
var locationName = draggedLocationData.location.name || draggedLocationData.location.location || 'Unknown';
```

**After:**
```javascript
var locationName = draggedLocationData.location.location || draggedLocationData.location.name || 'Unknown';
```

### 4. `TripPlanner.html` - `renderUnassigned()` function

**Before:**
```javascript
card.dataset.location = loc.name;
// ...
loc.name +
```

**After:**
```javascript
var locationName = loc.location || loc.name;
card.dataset.location = locationName;
// ...
locationName +
```

### 5. `TripPlanner.html` - CSS `.unassigned-list`

**Before:**
```css
.unassigned-list {
  max-height: 200px;
  overflow-y: auto;
}
```

**After:**
```css
.unassigned-list {
  max-height: 400px;
  overflow-y: auto;
}
```

### 6. `ToDoSchedule.html` - `getTaskGroupName()` function (NEW - Update 2)

**Issue:** Employees like Christian Sugrue (journeyman) were showing as their own section instead of under their foreman (Darrell Swann).

**Fix:** Added check for `task.foreman` property after checking location string:

```javascript
// SECOND: Use task.foreman property if available (from employee lookup)
// This ensures crew members are grouped under their actual foreman
if (task.foreman && task.foreman.trim() && task.foreman.toLowerCase() !== 'unassigned') {
  var foremanName = task.foreman.trim();
  var parenIndex = foremanName.indexOf(' (');
  if (parenIndex !== -1) {
    return foremanName.substring(0, parenIndex);
  }
  return foremanName;
}
```

### 7. `TripPlanner.html` - Added debug logging (NEW - Update 2)

Added `console.log()` statements to `handleDragStart()`, `handleUnassignedDragStart()`, and `handleDrop()` to debug drag-and-drop issues. Also added `e.dataTransfer.setData()` calls which some browsers require for drag operations.

### 8. `87-RoutePlanner.gs` - Added `recalculateDayPlan()` function (Update 2)

**Issue:** Frontend called `recalculateDayPlan()` after drag-and-drop, but the function didn't exist.

**Fix:** Added wrapper function that calls `calculateDayPlan()`:

```javascript
function recalculateDayPlan(params) {
  var startLocation = params.startLocation || 'Helena';
  var endLocation = params.endLocation || 'Helena';
  var assignedLocations = params.assignedLocations || [];
  var arriveFirstBy7am = params.arriveFirstBy7am || false;
  
  // Convert assignedLocations to destinations format
  var destinations = assignedLocations.map(function(loc) {
    return {
      location: loc.location || loc.name || 'Unknown',
      taskCount: loc.taskCount || (loc.tasks ? loc.tasks.length : 0),
      estimatedTime: loc.estimatedTime || 25,
      tasks: loc.tasks || []
    };
  });
  
  // Calculate the plan
  var plan = calculateDayPlan(startLocation, destinations, WORK_START_HOUR, endLocation);
  
  // Handle early arrival option
  if (arriveFirstBy7am && destinations.length > 0) {
    var driveTimeMap = getDriveTimeMap();
    var firstDestLower = (destinations[0].location || '').toLowerCase();
    var earlyDriveMinutes = getDriveTimeBetweenLocations(startLocation.toLowerCase(), firstDestLower, driveTimeMap);
    plan.earlyDriveMinutes = earlyDriveMinutes;
    plan.arriveFirstBy7am = true;
  }
  
  return plan;
}
```

### 9. `TripPlanner.html` - Added Office Card Drag Support (NEW - Update 3)

**Issue:** Office card could only be clicked to show tasks, not dragged to a day.

**Fix:** Added full drag support to Office card in `renderUnassigned()`:

```javascript
// Make Office card draggable
officeCard.draggable = true;
officeCard.dataset.location = 'Office';

// Track mousedown time to differentiate click vs drag
var officeMouseDownTime = 0;
officeCard.addEventListener('mousedown', function() {
  officeMouseDownTime = Date.now();
});

// Make it clickable to show office tasks (only if not dragging)
officeCard.addEventListener('click', function() {
  var clickDuration = Date.now() - officeMouseDownTime;
  if (clickDuration < 200) { // Quick click = show popup
    showOfficeTasksPopup(officeTasks);
  }
});

// Add drag handlers for Office card
officeCard.addEventListener('dragstart', function(e) {
  draggedElement = e.target;
  draggedElement.classList.add('dragging');

  draggedLocationData = {
    type: 'office',  // Special type for office tasks
    index: -1,
    location: {
      location: 'Helena',
      name: 'Office Work',
      direction: 'Home Base',
      taskCount: officeTasks.length,
      maxUrgency: maxOfficeUrgency,
      tasks: officeTasks.map(function(t) {
        return {
          rowIndex: t.rowIndex,
          source: t.source || 'Task Metadata',
          taskType: t.taskType || 'Office',
          employee: t.employee || '',
          location: 'Helena'
        };
      }),
      isOfficeCard: true
    }
  };

  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', 'Office');
});

officeCard.addEventListener('dragend', handleDragEnd);
```

### 10. `TripPlanner.html` - Updated `handleDrop()` for Office type (NEW - Update 3)

**Fix:** Added specific handling for `type === 'office'` in the drop handler:

```javascript
// Remove from source
if (draggedLocationData.type === 'assigned') {
  // ... existing code for assigned ...
} else if (draggedLocationData.type === 'office') {
  // Office card - clear office tasks (they're all being moved as one block)
  tripPlan.officeTasks = [];
  console.log('Cleared officeTasks array after dropping Office card');
} else {
  // From unassigned
  // ... existing code for unassigned ...
}
```

### 11. `87-RoutePlanner.gs` - Collect Scheduled Tasks Instead of Skipping (NEW - Update 3)

**Issue:** Tasks with future scheduled dates were being skipped entirely in `collectTasksForTripPlanner()`, so they never appeared on Trip Planner days.

**Fix:** Added `scheduledTasks` object to collect tasks by date key:

```javascript
// Instead of skipping, collect scheduled tasks by date
var scheduledTasks = {}; // Group by date key (YYYY-MM-DD)

// Handle tasks already scheduled for a future date - collect them by date
if (sourceTask.scheduledDate) {
  // ... collect into scheduledTasks[scheduledDateKey] array ...
}

// Return scheduledTasks in the result
return {
  tasks: tasks,
  byLocation: byLocation,
  byDirection: byDirection,
  officeTasks: officeTasks,
  scheduledTasks: scheduledTasks, // NEW
  fromTaskMetadata: true
};
```

### 12. `87-RoutePlanner.gs` - Step 5.5: Pre-assign Scheduled Tasks (NEW - Update 3)

**Issue:** Scheduled tasks weren't being assigned to their scheduled work days in Trip Planner.

**Fix:** Added Step 5.5 in `suggestOptimalTrips()` to pre-assign scheduled tasks:

```javascript
// Pre-assign tasks that were scheduled via Task List (Step 5.5)
var scheduledTasks = pendingData.scheduledTasks || {};

for (var d = 0; d < workDays.length; d++) {
  var day = workDays[d];
  var tasksOnDate = scheduledTasks[day.dateKey] || [];
  
  if (tasksOnDate.length > 0) {
    // Group tasks by location for this day
    var locationGroups = {};
    // ... group tasks by location ...
    
    // Add each location group to this day's assigned locations
    for (var locKey in locationGroups) {
      var group = locationGroups[locKey];
      day.assignedLocations.push({
        location: group.location,
        taskCount: group.tasks.length,
        // ...
        isScheduledTask: true // Flag to indicate these came from Task List scheduling
      });
    }
  }
}
```

### 13. `87-RoutePlanner.gs` - Added "Office" to Local Direction (NEW - Update 3)

**Issue:** "Office" wasn't recognized as a valid location, so it got "Other" direction.

**Fix:** Updated `getLocationDirection()`:

```javascript
function getLocationDirection(location) {
  if (!location) return 'Unknown';
  var loc = location.toLowerCase().trim();
  if (loc === 'helena' || loc === 'office') return 'Local'; // Added 'office'
  // ... rest of function ...
}
```

---

## Workflow Verification

The Trip Planner now supports this workflow:

1. **Step 1 - Generate Task Metadata** → Puts tasks from all sources on Task Metadata sheet
2. **Step 2 - Tasks & Calendar** → Pulls information from Task Metadata sheet
3. **Step 3 - Date Assignment** → Tasks without dates appear in Unassigned Locations; tasks with dates appear on Calendar and in Trip Planner days
4. **Step 4 - Scheduling** → Assign dates on Task List OR drag location cards in Trip Planner
5. **Step 5 - Sync** → Task List changes auto-save to Task Metadata; Trip Planner requires "Apply to Schedule" button for batch updates
6. **Step 6 - Completion** → Mark Complete on Task List or Trip Planner sets `CompletedDate` in Task Metadata → Daily Accomplishments reads completed tasks

---

## Testing Checklist

- [ ] Open Trip Planner
- [ ] Verify unassigned locations appear in right sidebar
- [ ] Drag a location from Unassigned to a day - should move
- [ ] Drag a location from one day to another - should move
- [ ] Verify task count shows correctly on location cards
- [ ] **Drag Office card from Unassigned to a day** - should move
- [ ] **Click Office card briefly** - should show popup with office tasks
- [ ] **Schedule an Office location task via Task List** - verify it appears on Trip Planner for that day
- [ ] **Schedule a regular location task via Task List** - verify it appears on Trip Planner for that day
- [ ] Click "Apply to Schedule" after making changes
- [ ] Mark tasks complete via Trip Planner popup
- [ ] Check Daily Accomplishments shows completed tasks

---

## Related Files

- `src/87-RoutePlanner.gs` - Backend trip planning logic
- `src/TripPlanner.html` - Trip Planner UI
- `src/86-TimeTracking.gs` - Daily Accomplishments backend
- `src/TimeBreakdown.html` - Daily Accomplishments UI
- `src/Code.gs` - `markTaskComplete()`, `markScheduleTaskComplete()`
