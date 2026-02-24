# Fix: SMS Missing Safety Report - Dates Not Showing

## Issue
When clicking the SMS button for Missing Safety Report tasks, the message shows:
```
Hi Matthew, we did not receive a JHA for  from your crew...
```

The JHA dates are missing (empty string after "for").

## Root Cause
The console logs showed:
```
buildMissingSafetyReportMessage: task.notes = undefined
buildMissingSafetyReportMessage: jhaDates="", weekOf=""
```

**The actual issue was a KEY MISMATCH in metadata lookup.**

In `collectMissingSafetyReportTasks()`:
- Tasks were being created with `sheetName: 'Task Metadata'` and `rowIndex: i + 1` (row in Task Metadata sheet)
- But the `metadataLookup` in `getTasksWithMetadata()` uses keys like `'Safety Compliance_64'` (SourceSheet + SourceRow from the original data)

So the key built from the task (`'Task Metadata_64'`) didn't match the key in metadataLookup (`'Safety Compliance_64'`), causing the metadata (including notes) to NOT be found.

## Solution
Updated `collectMissingSafetyReportTasks()` in `76-SmartScheduling.gs` to use the original SourceSheet and SourceRow values from the Task Metadata record:

```javascript
// Before:
source: 'Safety Compliance',
sheetName: 'Task Metadata',
rowIndex: i + 1,

// After:
var sourceSheet = String(row[colIdx.sourceSheet] || 'Safety Compliance').trim();
var sourceRowNum = parseInt(row[colIdx.sourceRow], 10) || (i + 1);

source: sourceSheet,           // Use original SourceSheet for metadata key matching
sheetName: sourceSheet,        // Use original SourceSheet for metadata key matching
rowIndex: sourceRowNum,        // Use original SourceRow for metadata key matching
metadataRow: i + 1,            // Keep actual row in Task Metadata for updates
```

## Files Modified
1. **src/76-SmartScheduling.gs** - Lines 2356-2380
   - Updated `collectMissingSafetyReportTasks()` to use SourceSheet/SourceRow for key matching

## Deployment
Run: `.\push.bat` or `clasp push`

## Verification
1. Open Tasks & Calendar dialog
2. Find a Missing Safety Report task (Safety Compliance category)
3. Click the SMS button (blue chat icon)
4. Message should now show actual dates:
   ```
   Hi Matthew, we did not receive a JHA for 02/02/2026 from your crew...
   ```

## Notes Field Format
The notes field for Missing Safety Report tasks contains:
- `Missing JHA: 02/02/2026, 02/03/2026` - List of missing JHA dates
- `Missing Weekly Safety Meeting for week of 02/01/2026` - If weekly meeting is missing
- Combined format: `Missing JHA: 02/02/2026; Missing Weekly Safety Meeting for week of 02/01/2026`

The SMS builder function (`buildMissingSafetyReportMessage`) parses these patterns to build the appropriate message.

