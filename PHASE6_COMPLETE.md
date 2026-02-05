# Phase 6 Complete: Remove To Do List Sheet Dependencies

**Date:** February 1, 2026  
**Status:** ✅ DEPLOYED

## Summary

Phase 6 eliminates the dependency on the "To Do List" sheet by making Task Metadata the single source of truth for all task-related operations.

## Changes Made

### 1. Trip Planner (87-RoutePlanner.gs)

**Function: `collectTasksForTripPlanner()`**
- Now calls `getTasksWithMetadata()` as primary data source
- Falls back to `collectTasksForTripPlannerLegacy()` if Task Metadata unavailable
- Added local helper functions to avoid cross-file dependencies:
  - `formatDateKeyForRoute()` - Formats date as YYYY-MM-DD
  - `formatDateForDisplayRoute()` - Formats date as MM/DD/YYYY
- Returns `{ fromTaskMetadata: true }` flag when using Task Metadata

**Function: `getPendingTasksWithLocations()`**
- Updated comment to reflect Phase 6 architecture
- Still calls `collectTasksForTripPlanner()` which now uses Task Metadata

### 2. Time Tracking (86-TimeTracking.gs)

**Function: `getCompletedTasksForPeriod()`**
- Now uses Task Metadata as primary source
- Calls `collectCompletedFromTaskMetadata()` first
- Still collects from Manual Tasks and Training Tracking sheets

**New Function: `collectCompletedFromTaskMetadata()`**
- Reads completed tasks from Task Metadata sheet
- Falls back to `collectCompletedFromToDoList()` if Task Metadata unavailable
- Uses Status = 'Complete' or 'Completed' to filter

**Helper Functions Added:**
- `formatTimeValueForBreakdown()` - Formats time values
- `getTaskEstimatedTime()` - Returns estimated minutes by task type

### 3. Menu Changes (Code.gs)

**Removed:**
- "🎯 Generate Smart Schedule" menu item

**Added:**
- "🗑️ Archive Old To Do List (Legacy)" menu item

**New Function: `archiveToDoListSheet()`**
- Renames "To Do List" to "To Do List (Archive)"
- Hides the archived sheet
- Requires Task Metadata to exist before allowing archive
- Confirms with user before proceeding

### 4. QuickActions Sidebar (QuickActions.html)

**Step 2 Changes:**
- Button now calls `generateTaskMetadata` instead of `generateSmartSchedule`
- Text changed from "Create Smart Schedule" to "Generate Task Metadata"
- Subtitle changed to "Update task database"
- Added "🗺️ Trip Planner" as sub-action button

### 5. Trip Planner Empty State (TripPlanner.html)

**Button Change:**
- "Generate Smart Schedule" button now calls `generateTaskMetadata`
- Button text changed to "Generate Task Metadata"

## Data Flow (Phase 6)

```
Source Sheets                    Task Metadata Sheet              Dialogs
┌─────────────┐                 ┌──────────────────┐             ┌────────────────┐
│ Glove Swaps │──────┐          │                  │             │                │
│ Sleeve Swaps│──────┤          │  Task Metadata   │             │ Tasks&Calendar │
│ Training    │──────┼─────────▶│  (25 columns)    │────────────▶│ Trip Planner   │
│ Manual Tasks│──────┤          │                  │             │ Time Breakdown │
│ Employees   │──────┘          │  Single Source   │             │                │
└─────────────┘                 │  of Truth        │             └────────────────┘
                                └──────────────────┘

                                ┌──────────────────┐
                                │ To Do List       │
                                │ (ARCHIVED)       │  ← No longer used
                                └──────────────────┘
```

## Testing Checklist

- [ ] Open Trip Planner → Should load tasks from Task Metadata
- [ ] Open Tasks & Calendar → Should work as before
- [ ] Open Daily Accomplishments → Should show completed tasks from Task Metadata
- [ ] Archive To Do List → Should rename and hide sheet
- [ ] QuickActions Step 2 → Should call generateTaskMetadata

## Rollback Plan

If issues arise:
1. The legacy functions are still in place as fallbacks
2. `collectTasksForTripPlannerLegacy()` uses the old `collectAndGroupTasks()` method
3. `collectCompletedFromToDoList()` is still available as fallback
4. Unhide "To Do List (Archive)" sheet if needed

## Next Steps (Phase 7)

- [ ] Remove deprecated functions after testing period
- [ ] Clean up unused code
- [ ] Optimize Task Metadata queries
- [ ] Add Task Metadata auto-refresh trigger
