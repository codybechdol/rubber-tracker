# Fix: Duplicate Safety Compliance Tasks in Task List

**Date:** February 17, 2026

## Problem
Safety Compliance tasks (Missing JHA / Weekly Meeting reports) were appearing as duplicates in the Task List. Users would see the same task multiple times with slightly different TaskIDs due to different date formats.

## Root Causes

### 1. Double Loading
Safety Compliance tasks were being loaded from **two sources**:
1. **`allTasks`** - via `getTasksWithMetadata()` → `collectMissingSafetyReportTasks()` 
2. **`safetyComplianceTasks`** - via `getMissingSafetyReportTasks()` (separate call)

Both arrays were being rendered, causing duplicates.

### 2. Different Date Formats in TaskID
Task Metadata could have the same task with different TaskID date formats:
- `SafetyCompliance_013-26_02-08-2026` (MM-DD-YYYY)
- `SafetyCompliance_013-26_20260208` (YYYYMMDD)
- `SafetyCompliance_013-26_02/08/2026` (MM/DD/YYYY)

The deduplication wasn't normalizing dates before comparison.

## Solution

### Fix 1: Deduplicate in `processTaskData()` (ToDoSchedule.html)
Added deduplication logic after date normalization to remove duplicate Safety Compliance tasks with different date formats:

```javascript
// DEDUPLICATION: Remove duplicate Safety Compliance tasks (same job+week but different date formats)
var seenSafetyJobWeeks = {};
var beforeDedup = allTasks.length;
allTasks = allTasks.filter(function(task) {
  // Only dedupe Safety Compliance tasks
  var taskId = task.taskId || task.tid || '';
  var isSafetyTask = (task.taskType === 'Missing Safety Report' ||
                      task.source === 'Safety Compliance' ||
                      taskId.indexOf('SafetyCompliance_') === 0);

  if (!isSafetyTask) return true; // Keep non-safety tasks

  // Extract job number and date from TaskID
  var match = taskId.match(/SafetyCompliance_(\d{3}-\d{2})_(.+)/);
  if (!match) return true; // Can't parse, keep it

  var jobNum = match[1];
  var dateStr = match[2];

  // Normalize date to MM-DD-YYYY format for consistent comparison
  var normalizedDate = dateStr;
  // Handle YYYYMMDD format (8 digits)
  if (dateStr.match(/^\d{8}$/)) {
    normalizedDate = dateStr.substring(4, 6) + '-' + dateStr.substring(6, 8) + '-' + dateStr.substring(0, 4);
  }
  // Handle MM/DD/YYYY format
  if (dateStr.match(/^\d{2}\/\d{2}\/\d{4}$/)) {
    normalizedDate = dateStr.replace(/\//g, '-');
  }
  // Handle YYYY-MM-DD format
  if (dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
    var parts = dateStr.split('-');
    normalizedDate = parts[1] + '-' + parts[2] + '-' + parts[0];
  }

  var normalizedKey = jobNum + '_' + normalizedDate;

  if (seenSafetyJobWeeks[normalizedKey]) {
    console.log('processTaskData: Removing duplicate Safety task: ' + taskId);
    return false; // Duplicate, filter out
  }

  seenSafetyJobWeeks[normalizedKey] = true;
  return true; // First occurrence, keep it
});
```

### Fix 2: Deduplicate in `renderPersonalChecklist()` (ToDoSchedule.html)
Added logic to skip `safetyComplianceTasks` that already exist in `allTasks`:

```javascript
// DEDUPLICATION: Build a set of taskIds already in allTasks to avoid duplicates
var existingSafetyTaskIds = {};
allTasks.forEach(function(t) {
  if (t.taskType === 'Missing Safety Report' || t.source === 'Safety Compliance' ||
      (t.taskId && t.taskId.indexOf('SafetyCompliance_') === 0)) {
    existingSafetyTaskIds[t.taskId] = true;
    // Also track normalized versions to catch different date formats
    // ...normalization logic...
  }
});

safetyComplianceTasks.forEach(function(task) {
  // Skip if this task already exists in allTasks
  if (existingSafetyTaskIds[task.taskId]) {
    console.log('renderPersonalChecklist: Skipping duplicate safety task ' + task.taskId);
    return;
  }
  // ...rest of rendering logic
});
```

### Fix 3: Added Failure Handler to ProcessSafetyEmailsDialog
The "Last Processed: Loading..." issue was caused by no failure handler on the `getLastSafetyEmailProcessedTime()` call. Added:

```javascript
google.script.run
  .withSuccessHandler(function(lastProcessed) {
    document.getElementById('lastRunDisplay').innerHTML = '📅 Last processed: <strong>' + (lastProcessed || 'Never') + '</strong>';
  })
  .withFailureHandler(function(error) {
    console.error('Failed to get last processed time:', error);
    document.getElementById('lastRunDisplay').innerHTML = '📅 Last processed: <strong>Unknown</strong>';
  })
  .getLastSafetyEmailProcessedTime();
```

## Files Modified
- `src/ToDoSchedule.html` - Added deduplication in processTaskData() and renderPersonalChecklist()
- `src/ProcessSafetyEmailsDialog.html` - Added failure handler for getLastSafetyEmailProcessedTime()

## How to Test
1. Open the Tasks & Calendar dialog
2. Check the Safety Compliance category
3. Each foreman/crew should appear only ONCE per week
4. No duplicate "Missing JHA" tasks for the same crew + week

## Console Logging
When duplicates are found and removed, you'll see:
- `processTaskData: Removing duplicate Safety task: SafetyCompliance_013-26_20260208`
- `processTaskData: Removed X duplicate Safety Compliance tasks`
- `renderPersonalChecklist: Skipping duplicate safety task SafetyCompliance_013-26_02-08-2026`

