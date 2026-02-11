# Safety Compliance Tasks Fix - February 11, 2026

## Commit: `574ea58`

## Problem Summary

The Task Metadata → Task List pipeline was not collecting Missing Safety Report tasks properly:
- Debug showed: **JHA: Metadata=7, Collected=0** and **JHA + Weekly Meeting: Metadata=1, Collected=0**
- Tasks existed in Task Metadata but weren't appearing in the Task List

## Root Cause Analysis

### Issue 1: Malformed Column Data
The `createMissingReportTasks()` function was creating tasks with correct data, but some rows in Task Metadata had **columns shifted by 1 position**:

| Column | Expected Value | Actual (Malformed) Value |
|--------|---------------|-------------------------|
| D (Employee) | Darrell Swann | Missing Safety Report |
| E (TaskType) | Missing Safety Report | JHA |
| F (ItemType) | JHA | Darrell Swann |
| G (CurrentItem) | (empty) | Bozeman |
| H (Location) | Bozeman | (406) 539-5603 |
| I (Foreman) | Darrell Swann | 2/7/2026 22:00:00 |
| K (DueDate) | 2/7/2026 | 1900-01-14 ← Wrong! |

### Issue 2: Invalid Due Date Filtering
The collection function was using the DueDate column to filter tasks to "previous week only". But malformed rows had:
- DueDate = `1900-01-14` (obviously wrong)
- This caused the filter `taskDueDate.getFullYear() > 2000` to fail
- Result: All Safety Compliance tasks were skipped

### Issue 3: Old Detection Logic
The code was checking `taskType === 'Missing Safety Report'` but in malformed rows, TaskType was `JHA`.

## Solution Implemented

### New Collection Strategy
Rewrote `collectMissingSafetyReportTasks()` in `76-SmartScheduling.gs` to:

1. **Parse TaskID for week detection** instead of relying on DueDate column:
   ```
   TaskID: SafetyCompliance_013-26_02-01-2026
                            ↓       ↓
                        Job#    Week Start
   ```

2. **Detect malformed data** by checking if Employee column contains "Missing Safety Report"

3. **Read from shifted columns** when malformed:
   - ItemType (F) → actually contains foreman name
   - TaskType (E) → actually contains item type (JHA, etc.)
   - CurrentItem (G) → actually contains location

4. **Calculate due date from TaskID** (Saturday of that week) instead of reading broken DueDate column

### Cleanup Function
Added menu item: **Glove Manager → Safety Reports → 🛠️ Fix Shifted Safety Tasks**
- Finds and deletes tasks with incorrect column structure
- User can then regenerate tasks via "Process Safety Emails" or "Regenerate Previous Week Tasks"

## Files Modified

- `src/76-SmartScheduling.gs` - Rewrote `collectMissingSafetyReportTasks()` (~200 lines)
- `src/Code.gs` - Added "Fix Shifted Safety Tasks" menu item

## Testing

1. Run: **Glove Manager → 🔍 Debug → 🔍 Metadata vs Collection**
2. Check that "JHA" and "JHA + Weekly Meeting" are now being collected
3. Open **Tasks & Calendar** → Should see Safety Compliance tasks

## Remaining Discrepancies (Expected)

| Type | Metadata | Collected | Reason |
|------|----------|-----------|--------|
| Cert Expiring | 29 | 14 | Duplicates in metadata from multiple generateTaskMetadata runs |
| 2026 Q1 Random DT | 3 | 2 | One duplicate row |
| Unknown | 1 | 0 | Empty TaskType not matched |

These are expected and don't affect functionality.

## How to Fix Existing Malformed Data

**Option 1: Clean up and regenerate (recommended)**
1. **Glove Manager → Safety Reports → 🛠️ Fix Shifted Safety Tasks**
2. **Glove Manager → Safety Reports → 📅 Regenerate Previous Week Tasks**

**Option 2: Leave as-is (also works)**
The collection function now handles both correct AND malformed formats, so existing data will still be collected properly.

