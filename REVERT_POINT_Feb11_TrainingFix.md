# STABLE REVERT POINT - February 11, 2026 (Training Fix)

## Commit Hash: `5064b62`
## Git Tag: `STABLE_Feb11_2026_TrainingFix`

## To Revert To This Point:
```bash
git checkout STABLE_Feb11_2026_TrainingFix
```

## What Was Fixed

### Training Tasks Now Appear in Task List ✅
**Root Cause:** Wrong column index for Status column in Training Tracking sheet.
- Code said: `statusCol = 9` (Column J - Notes)
- Actual: Status is in Column I (index 8)

**Files Fixed:**
- `76-SmartScheduling.gs` - collectTrainingTasks() and debugTrainingTasks()
- `Code.gs` - generateTaskMetadata() training section
- `75-Scheduling.gs` - training compliance function
- `70-ToDoList.gs` - legacy to-do list generation

### Debug Functions Added
New menu items under **Glove Manager → 🔍 Debug**:
- 🔍 Debug Task List - Shows all collected task counts
- 🔍 Debug Training Tasks - Deep-dive into Training Tracking
- 🔍 Metadata vs Collection - Compares Task Metadata vs live collection
- 🧹 Clear Training Filter - Removes crew filter

## Verification
Run: **Glove Manager → 🔍 Debug → 🔍 Metadata vs Collection**

Expected result:
- Training: Metadata ≈ Collected (should be close)
- Training tasks appear in Tasks & Calendar dialog

## All Features Working
- ✅ Training tasks appear in Task List
- ✅ Safety Compliance tasks working
- ✅ Cert Expiring tasks (add via Expiring Certs tab)
- ✅ Glove/Sleeve swap tasks
- ✅ Safety Equipment tasks
- ✅ Manual tasks
- ✅ Trip Planner
- ✅ Daily Accomplishments
- ✅ Purchase Orders
- ✅ Email Reports
- ✅ Crew Import

