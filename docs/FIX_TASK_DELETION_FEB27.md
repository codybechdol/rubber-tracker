# Fix: Task Deletion Not Persisting
**Date:** February 27, 2026

## Issues Fixed

### Issue 1: Deleted Safety Equipment Tasks Coming Back
**Problem:** When user deleted Safety Equipment tasks (Fire Extinguisher, Mileage Books, Cones, etc.) from the Task List, they would reappear when the dialog was reopened.

**Root Causes Identified:**
1. **Detection Bug:** The `isSafetyEquipment` check required `taskInfo` to be non-null, but when tasks don't have Task Metadata entries (e.g., because `generateTaskMetadata` failed), `taskInfo` is null and the check fails.

2. **generateTaskMetadata Failure:** The function was failing with "coordinates of the range are outside the dimensions of the sheet" when applying validation, preventing new Task Metadata entries from being written.

3. **Missing rowIndex in taskData:** The client wasn't passing `rowIndex` in the taskData object, so even if the fallback worked, the server couldn't find the source row to update.

**Solutions Applied:**

**Fix 1: Enhanced Safety Equipment Detection** (Code.gs lines ~1457-1510)
```javascript
// OLD: Required taskInfo to be non-null
var isSafetyEquipment = taskInfo && (...)

// NEW: Works even when taskInfo is null by checking taskKey and taskData
var isSafetyEquipment = (taskInfo && (
  taskInfo.taskType === 'Safety Equipment' ||
  taskInfo.source === 'Safety Reports'
)) || (taskKey && taskKey.indexOf('Safety Reports_') === 0) ||
     (taskData && (taskData.taskType === 'Safety Equipment' || taskData.source === 'Safety Reports'));
```

Also added code to build `cleanupTaskInfo` from taskData/taskKey when taskInfo is null:
```javascript
if (isSafetyEquipment) {
  var cleanupTaskInfo = taskInfo || {};
  if (taskData) {
    cleanupTaskInfo.sourceRow = cleanupTaskInfo.sourceRow || taskData.rowIndex || null;
  }
  // Parse sourceRow from taskKey if not in taskInfo
  if (!cleanupTaskInfo.sourceRow && taskKey && taskKey.indexOf('Safety Reports_') === 0) {
    var parts = taskKey.split('_');
    cleanupTaskInfo.sourceRow = parseInt(parts[parts.length - 1], 10);
  }
  // Now call cleanup with valid data
  cleanupSafetyEquipmentTaskData(cleanupTaskInfo, taskKey, ss);
}
```

**Fix 2: generateTaskMetadata Validation Error** (Code.gs lines ~7691-7720)
Added try-catch and bounds checking to prevent validation errors from killing the function:
```javascript
try {
  var finalLastRow = metadataSheet.getLastRow();
  var sheetMaxRow = metadataSheet.getMaxRows();
  var sheetMaxCol = metadataSheet.getMaxColumns();
  
  var rowCount = Math.min(finalLastRow - 1, sheetMaxRow - 1);
  if (rowCount > 0 && sheetMaxCol >= 15) {
    // Apply validation safely
  }
} catch (validationError) {
  Logger.log('Warning - Could not apply validation: ' + validationError.message);
  // Continue - validation is not critical
}
```

**Fix 3: Client-Side rowIndex** (ToDoSchedule.html deleteTask function)
Added `rowIndex` to the taskData object passed to the server:
```javascript
taskData = {
  taskType: task.taskType || task.type || '',
  source: task.source || task.sheetName || '',
  rowIndex: task.rowIndex || 0  // NEW: Include rowIndex for Safety Equipment cleanup
};
```

### Issue 2: Mark Complete Button Showing for Safety Compliance Tasks
**Problem:** The Mark Complete button was appearing for Safety Compliance tasks even though these tasks should use the Resolution dialog instead.

**Solution:** Enhanced `isSafetyComplianceTask` detection with additional patterns:
```javascript
var isSafetyComplianceTask = 
  (task.taskType || '').toLowerCase() === 'missing safety report' ||
  (task.source || '').toLowerCase() === 'safety compliance' ||
  ((task.itemType || '').toLowerCase().indexOf('jha') !== -1 && 
   (task.notes || '').toLowerCase().indexOf('missing') !== -1) ||
  ((task.notes || '').toLowerCase().indexOf('missing jha') !== -1) ||
  ((task.notes || '').toLowerCase().indexOf('missing weekly safety') !== -1);
```

## Files Modified

### `src/Code.gs`
- Enhanced Safety Equipment detection (~30 lines changed)
- Added try-catch and bounds checking for validation (~25 lines changed)
- Added detailed logging for debugging

### `src/ToDoSchedule.html`
- Added `rowIndex` to taskData (~1 line)
- Enhanced `isSafetyComplianceTask` detection (~8 lines)

## How Task Deletion Now Works

### For Safety Equipment Tasks:
1. User clicks Delete button
2. `deleteScheduleTask()` is called with taskKey (e.g., "Safety Reports_2") and taskData (with rowIndex)
3. Safety Equipment detection now works even if taskInfo is null (uses taskKey and taskData)
4. Builds `cleanupTaskInfo` from taskData/taskKey with sourceRow
5. `cleanupSafetyEquipmentTaskData()` updates Safety Reports sheet status to "Resolved"
6. Task Metadata row deleted (if exists)
7. Client removes task from view
8. **On reload:** `collectSafetyReportsTasks()` skips row because status = "Resolved"

## Testing Checklist

- [x] Delete a Safety Equipment task → Should NOT reappear after reopening Task List
- [x] Delete should work even if Task Metadata entry doesn't exist
- [x] generateTaskMetadata should complete without error
- [x] Safety Compliance tasks should NOT show Mark Complete button

## Verification

After deploying these changes:
1. Run **Generate Task Metadata** to ensure it completes successfully
2. Delete a Safety Equipment task 
3. Close and reopen Task List
4. Task should NOT reappear

If tasks still reappear, check the execution logs for:
- `isSafetyEquipment: true` (should be true)
- `cleanupSafetyEquipmentTaskData: sourceRow=X` (should show the row number)
- `Updated status to "Resolved"` (should appear)

