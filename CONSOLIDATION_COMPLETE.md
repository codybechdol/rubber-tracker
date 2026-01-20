# Configuration Consolidation Complete

## Summary of Changes

The To Do Config dialog has been simplified from **6 tabs to 4 tabs** while preserving all functionality.

## Before → After

| Old Tab | New Tab | What Changed |
|---------|---------|--------------|
| Locations | **Locations** | No change |
| Priorities | ~~Removed~~ | Merged into Schedule Settings |
| Schedule Settings | **Schedule Settings** | Now includes Priority Thresholds + **Crew Visit Config** |
| Notifications | ~~Removed~~ | Removed (was unused in backend) |
| Training Config | **Task Sources** | Renamed & combined with cert type selection + **Training Completion Summary** + **Training Schedule editor** + **Training Tracking (by Crew)** |
| Expiring Certs | **Expiring Certs** | Now focused only on status view/editing |

## New Tab Structure

### 1. Locations Tab
- Location management for task scheduling
- Add/remove locations

### 2. Schedule Settings Tab (Enhanced)
- Work hours (start/end time)
- Task duration and buffer time
- Working days selection
- **Priority Thresholds section** (moved from old Priorities tab)
- **Crew Visit Schedule section** - Editable table of all crews

### 3. Task Sources Tab (Consolidated)
- **Training: Select Crews** - Which crews generate training tasks
- **Certifications: Select Types** - Which cert types generate tasks
- Crew summary table
- Info box explaining how task sources work
- **Training Completion Status section** - Summary cards + progress bar
- **Training Schedule (2026) section** - Editable table from Training Config sheet
- **NEW: Training Tracking (By Crew) section**
  - Editable table showing per-crew training completion
  - Filter by Month and Status
  - Edit: Completion Date, Attendees, Trainer, Status
  - Auto-updates when training is marked complete in To Do Schedule

### 4. Expiring Certs Tab (Focused)
- Certification Status Overview (by type)
- Employee Certification Status (expandable cards)
- Edit expiration dates inline
- Summary statistics

## Training Completion Flow

When training is marked complete in **To Do Schedule**:
1. ✅ Training Tracking sheet is updated (Status → Complete, Completion Date → Today)
2. ✅ Training Config sheet completion % is recalculated
3. ✅ To Do Config Training Completion Status summary is updated
4. ✅ Progress bars update in real-time

## Training Tracking Features

| Column | Editable | Description |
|--------|----------|-------------|
| Month | ❌ | Training month |
| Topic | ❌ | Training topic |
| Crew # | ❌ | Crew number |
| Crew Lead | ❌ | Foreman name |
| Size | ❌ | Crew size |
| **Completion Date** | ✅ | Date training was completed |
| **Attendees** | ✅ | Number who attended |
| **Trainer** | ✅ | Who conducted training |
| **Status** | ✅ | Pending/Complete/Overdue/N/A |

### Filters
- **Month Filter** - Show only specific month's trainings
- **Status Filter** - Show only Pending, Complete, Overdue, or N/A

## Benefits

1. **Fewer tabs to navigate** (6 → 4)
2. **Training completion visible at a glance** - Summary cards and progress bar
3. **Automatic sync** - Mark training complete in To Do Schedule, everything updates
4. **Filter large datasets** - Month and Status filters for Training Tracking
5. **Real-time updates** - Summary updates as you edit

## Preserved Features

✅ Training Tracking sheet - Status, Attendees, Completion Date columns
✅ Training Config sheet - Now editable from To Do Config dialog!
✅ Crew Visit Config sheet - Now editable from To Do Config dialog!
✅ All priority settings
✅ All cert type selection
✅ Inline cert date editing
✅ Completion status with progress bars

## Files Changed

- `src/ToDoConfig.html` - Added Training Tracking section with filters and editable table
- `src/Code.gs` - Added:
  - `getTrainingTrackingData()` - Read Training Tracking sheet
  - `saveTrainingTrackingData()` - Save changes to Training Tracking sheet
  - `updateTrainingConfigCompletionStatus()` - Calculate completion % from tracking data
  - `updateTrainingTrackingFromToDo()` - Sync when marking complete in To Do Schedule
  - Updated `markScheduleTaskComplete()` - Now updates Training Config completion status

## Deployment

Run `.\push.bat` to deploy changes to Google Apps Script.
