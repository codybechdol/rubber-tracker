# Fix: SMS Missing Dates for Missing Safety Report Tasks

## Date: February 11, 2026

## Problem
When clicking the SMS button for Missing Safety Report tasks, the message showed:
```
Hi Matthew, we did not receive a JHA for  from your crew...
```
The JHA dates were missing (empty string where dates should be).

## Root Cause
The issue was a **metadata lookup key mismatch**:

### How Task Metadata is Structured
Task Metadata has two formats of Safety Compliance records:
1. **Format 1**: `SafetyCompliance_015-26_02-01-2026` with SourceRow = `015-26` (job number)
2. **Format 2**: `SafetyCompliance_64_20260211` with SourceRow = `64` (numeric row)

### What Was Happening
In `collectMissingSafetyReportTasks()`:
```javascript
// OLD CODE - WRONG:
source: 'Safety Compliance',
sheetName: 'Task Metadata',
rowIndex: i + 1,  // This was the row in Task Metadata, NOT the SourceRow value
```

This created a lookup key like `Safety Compliance_72` but the metadataLookup had keys like `Safety Compliance_015-26` or `Safety Compliance_64`.

Because the keys didn't match, the task got no metadata enrichment, and the `notes` field (containing "Missing JHA: 02/02/2026") was lost.

## Solution
### Change 1: `76-SmartScheduling.gs` - Use actual SourceSheet/SourceRow values
```javascript
// NEW CODE - CORRECT:
source: String(row[colIdx.sourceSheet] || 'Safety Compliance').trim(),
sheetName: String(row[colIdx.sourceSheet] || 'Safety Compliance').trim(),
rowIndex: String(row[colIdx.sourceRow] || '').trim() || (i + 1),
metadataRow: i + 1, // Keep actual row for updates
```

### Change 2: `Code.gs` - Include notes when metadata not found
```javascript
// In getTasksWithMetadata() else branch:
notes: task.notes || '',  // Include notes from collected task
```

## Testing
1. Open Tasks & Calendar dialog
2. Go to Safety Compliance section
3. Click SMS button (💬) on a Missing Safety Report task
4. Message should now include the dates:
   - For JHA: "Hi Matthew, we did not receive a JHA for 02/02/2026 from your crew..."
   - For Weekly Meeting: "...Weekly Safety Meeting for the week of 02/01/2026..."
   - For both: Combined message with both dates

## Debug Logging Added
The fix includes debug logging to help troubleshoot if issues persist:
```
collectMissingSafetyReportTasks: Task SafetyCompliance_015-26_02-01-2026 - notes="Missing JHA: 02/02/2026", source=Safety Compliance, rowIndex=015-26
```

Check Apps Script logs if dates still appear empty.

## Files Modified
- `src/76-SmartScheduling.gs` - Fixed source/sheetName/rowIndex in task object
- `src/Code.gs` - Added notes to else branch when metadata not found

