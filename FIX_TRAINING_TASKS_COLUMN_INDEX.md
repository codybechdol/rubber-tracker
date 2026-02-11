# Fix: Training Tasks Not Appearing in Task List

## Date: February 11, 2026

## Problem
Training tasks were stored in Task Metadata but not appearing in the Task List dialog.

**Debug showed:**
- Task Metadata: 32 Training tasks
- collectAndGroupTasks: 0 Training tasks collected

## Root Cause
**Wrong column index for Status column in Training Tracking sheet.**

The code was reading column J (index 9) but the actual Status column is **column I (index 8)**.

This caused the code to read the "Notes" column instead of "Status", so:
- All tasks had random text for status instead of "Pending", "Complete", or "N/A"
- Status checks like `status !== 'Complete'` always passed for wrong reasons
- But location/priority logic was also affected by wrong data

## Training Tracking Sheet Structure
| Column | Index | Header |
|--------|-------|--------|
| A | 0 | Month |
| B | 1 | Training Topic |
| C | 2 | Crew # |
| D | 3 | Crew Lead |
| E | 4 | Crew Size |
| F | 5 | Completion Date |
| G | 6 | Attendees |
| H | 7 | Hours Trainer |
| **I** | **8** | **Status** ← CORRECT |
| J | 9 | Notes ← was incorrectly used |

## Files Fixed

### 1. `76-SmartScheduling.gs`
- `collectTrainingTasks()` - Line ~760: Changed `statusCol = 9` to `statusCol = 8`
- `debugTrainingTasks()` - Line ~2370: Changed `statusCol = 9` to `statusCol = 8`

### 2. `Code.gs`
- `generateTaskMetadata()` - Line ~13281: Changed `statusCol = 9` to `statusCol = 8`

### 3. `75-Scheduling.gs`
- Training compliance function - Line ~1927: Changed `statusCol = 9` to `statusCol = 8`
- Also fixed `notesCol` from 10 to 9

### 4. `70-ToDoList.gs`
- Legacy `generateToDoListLegacy()` - Line ~155: Changed `statusCol = 9` to `statusCol = 8`

## Verification
After fix, debug showed:
- Task Metadata: 32 Training tasks
- collectAndGroupTasks: **33 Training tasks** ✅

The extra 1 task is likely due to a timing difference between when metadata was generated and when collection ran.

## How to Test
1. Open Google Sheets
2. Run: **Glove Manager → 🔍 Debug → 🔍 Metadata vs Collection**
3. Training count should now match between Metadata and Collection
4. Open: **Tasks & Calendar** dialog
5. Training tasks should now appear under crew lead names

## Related Issue: Training Config Completion %
The Training Config sheet shows 69% for January when Training Tracking shows all complete.

This is a **formula issue** in the Training Config sheet, not a code bug. The formula in column H calculates completion percentage. Check:
- Cell H2 formula in Training Config
- May be counting by date range instead of Status column
- May include crews marked N/A in the denominator

