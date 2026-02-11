# Debug Training Tasks - February 11, 2026

## New Debug Functions Added

Three new debug functions have been added to help diagnose why training tasks may not appear in the Task List:

### 1. Debug Task List (`debugTaskListData`)
**Menu:** Glove Manager → 🔍 Debug → 🔍 Debug Task List

Shows counts of all task types being collected by `collectAndGroupTasks()`:
- Total tasks
- Number of locations
- Breakdown by task type (Training, Swap, Cert Expiring, etc.)
- Sample employee for each type

### 2. Debug Training Tasks (`debugTrainingTasks`)
**Menu:** Glove Manager → 🔍 Debug → 🔍 Debug Training Tasks

Deep-dive into the Training Tracking sheet to show why tasks are/aren't collected:
- Current month being processed
- Active crew filter (if any)
- Counts by category:
  - ✅ PENDING (should show in Task List)
  - ✓ Complete
  - - N/A
  - ⚠️ Filtered by crew (excluded by filter)
  - ❌ No crew lead
  - ⏭️ Future month
- Examples of pending tasks
- Warning if crew filter is excluding tasks

### 3. Clear Training Filter (`clearTrainingCrewsFilter`)
**Menu:** Glove Manager → 🔍 Debug → 🧹 Clear Training Filter

Removes the `trainingCrews` filter from ScriptProperties so all crews are included in training task collection.

## How to Use

1. **If no training tasks appear:**
   - Run "Debug Training Tasks" first
   - Check if there's a crew filter active
   - If filter is excluding crews, run "Clear Training Filter"
   - Then run "Generate Task Metadata" to rebuild tasks

2. **If tasks appear in one place but not another:**
   - Run "Debug Task List" to see overall collection counts
   - Compare with what shows in Tasks & Calendar dialog

## Training Config Completion Percentage Issue

The Training Config sheet shows completion % via a formula in column H. If January shows 69% when Training Tracking shows all complete:

1. Check the formula in Training Config cell H2 (January's Completion Status)
2. The formula may be counting rows differently than the Training Tracking status
3. Common issues:
   - Formula might count by date range, not by Status column
   - Formula might include crews that were later marked N/A
   - Formula might not account for "Complete" text variations

## Files Modified

- `src/76-SmartScheduling.gs` - Added debug functions at end of file
- `src/Code.gs` - Added menu items under Debug submenu

## Testing Checklist

1. ☐ Run "Debug Training Tasks" - note counts
2. ☐ Run "Debug Task List" - verify Training count matches
3. ☐ If crew filter active, run "Clear Training Filter"
4. ☐ Run "Generate Task Metadata"
5. ☐ Open Tasks & Calendar - verify training tasks appear
6. ☐ Check Training Config formula for completion %

