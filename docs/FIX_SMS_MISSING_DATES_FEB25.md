# Fix: SMS Messages Missing Dates for Missing JHA/Safety Meeting Tasks

**Date:** February 25, 2026
**Status:** ✅ COMPLETE

## Problem

When sending SMS notifications for Missing Safety Report tasks (JHA and Weekly Safety Meeting), the message was missing the specific dates of the missing reports. The SMS showed generic text like "we did not receive a JHA from your crew" without specifying WHICH dates were missing.

### Expected Message
"Hi John, we did not receive a JHA for 02/03/2026, 02/04/2026 from your crew..."

### Actual Message
"Hi John, we did not receive a JHA from your crew..." (no dates)

## Root Cause

The task serialization in `getTasksWithMetadata()` was NOT including the `notes` field when compressing task data for transfer to the client.

### Data Flow
1. **Task Metadata Sheet** → Contains `Notes` column with format: `"Missing JHA: 02/03/2026, 02/04/2026; Missing Weekly Safety Meeting for week of 02/01/2026"`
2. **Server** (`getTasksWithMetadata()`) → Reads notes from metadata, creates `enrichedTask.notes`
3. **Serialization** → **BUG:** The compressed serialization was NOT including `n: task.notes`
4. **Client** (`ToDoSchedule.html`) → Expects `t.n` for notes field
5. **SMS Builder** (`buildMissingSafetyReportMessage()`) → Tries to parse `task.notes` for dates, but finds empty string

### Missing Fields
The following fields were expected by the client but NOT being sent by the server:
- `n` (notes) - Contains the "Missing JHA: DATE, DATE" text
- `tid` (taskID) - Contains TaskID like "SafetyCompliance_013-26_02-01-2026"
- `job` (jobNumber) - Contains job number like "013-26"

## Solution

Added the missing fields to the task serialization in `Code.gs`:

### 1. Added `extractJobNumberFromTaskID()` Helper Function
```javascript
function extractJobNumberFromTaskID(taskID) {
  if (!taskID) return '';
  var match = taskID.match(/SafetyCompliance_(\d{3}-\d{2})_/);
  return match ? match[1] : '';
}
```

### 2. Added Missing Fields to Serialization
```javascript
var serializedTasks = enrichedTasks.map(function(task, index) {
  return {
    taskKey: task.sheetName + '_' + task.rowIndex,
    tid: task.taskID || '',  // NEW: TaskID for Safety Compliance identification
    idx: index,
    // ... other fields ...
    n: task.notes || '',  // NEW: Notes for SMS messages
    job: task.jobNumber || extractJobNumberFromTaskID(task.taskID || '')  // NEW: Job number
  };
});
```

### 3. Added `jobNumber` to Enriched Task Objects
Added `jobNumber` field to all three task creation paths:
- Enriched tasks with metadata
- Tasks without metadata (needsMetadata flag)
- Tasks from InTaskList flag (Phase 5)

## Files Modified
- `src/Code.gs`
  - Added `extractJobNumberFromTaskID()` helper function (~line 7469)
  - Added `tid`, `n`, and `job` fields to serialization (~line 7805)
  - Added `jobNumber` to enrichedTask objects in all 3 creation paths

## Client-Side Mapping (Already Correct)
The `ToDoSchedule.html` already had the correct mapping (lines 1356-1385):
```javascript
allTasks = rawTasks.map(function(t) {
  return {
    // ...
    tid: t.tid || '',            // TaskID for Safety Compliance job number extraction
    notes: t.n || '',            // Notes (for SMS messages - Missing Safety Reports, etc.)
    jobNumber: t.job || ''       // Job number for Safety Compliance tasks
  };
});
```

## SMS Message Builder (Already Correct)
The `buildMissingSafetyReportMessage()` function (lines 3708-3804) already has the correct logic to parse the notes field:
```javascript
var jhaDateMatch = notes.match(/Missing JHA:\s*([^;]+)/);
var weekOfMatch = notes.match(/week of\s+(\d{2}\/\d{2}\/\d{4})/i);
```

## Testing
1. Open Tasks & Calendar dialog
2. Find a Missing Safety Report task
3. Click the SMS button
4. Verify the message includes specific dates: "...JHA for 02/03/2026, 02/04/2026..."

## Impact
- SMS notifications for missing JHA/Safety Meeting tasks now include specific missing dates
- Better communication with foremen about exactly which reports are missing
- No changes to existing functionality - only adds previously missing data

