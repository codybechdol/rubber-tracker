# Archived Legacy Code: 70-ToDoList.gs

**Archived Date:** February 16, 2026  
**Reason:** Legacy To-Do List functions replaced by Task Metadata system

## Migration Summary

The functions in this file have been replaced by:

| Legacy Function | New Function | Location |
|-----------------|--------------|----------|
| `generateToDoList()` | `generateTaskMetadata()` | Code.gs |
| `generateToDoListLegacy()` | `generateTaskMetadata()` | Code.gs |
| `clearCompletedTasks()` | `archiveOldCompletedTasks()` | Code.gs |
| `buildToDoListCalendar()` | Calendar in `ToDoSchedule.html` | Client-side |
| `buildDayItinerary()` | `TripPlanner.html` | Client-side |
| `getScheduledTasksForCurrentMonth()` | `getTasksWithMetadata()` | Code.gs |
| `detectOvernightRequirement()` | `suggestOptimalTrips()` | 87-RoutePlanner.gs |

## Why This Was Archived

1. **Task Metadata Sheet** is now the single source of truth for task management
2. **To Do List Sheet** is no longer needed and can be archived
3. **UI-based calendar** in ToDoSchedule.html replaced server-side calendar generation
4. **Trip Planner** handles route optimization and overnight detection

## Original Code (for reference)

<details>
<summary>Click to expand archived code</summary>

```javascript
/**
 * @deprecated LEGACY FILE - Feb 16, 2026
 * ============================================================================
 *
 * This file contains legacy To-Do List functions that are NO LONGER USED.
 * Task Metadata sheet is now the single source of truth for task management.
 *
 * DO NOT CALL THESE FUNCTIONS DIRECTLY. Use these alternatives instead:
 * - generateTaskMetadata() in Code.gs - Creates/updates Task Metadata
 * - getTasksWithMetadata() in Code.gs - Retrieves tasks for UI
 * - collectAndGroupTasks() in 76-SmartScheduling.gs - Collects tasks from sources
 *
 * This file is preserved for backward compatibility but can be safely archived.
 * The functions here delegate to newer implementations or are unused.
 *
 * ============================================================================
 * Glove Manager – To-Do List Generation (LEGACY)
 *
 * Functions for generating and managing to-do lists.
 * Now delegates to generateSmartSchedule() for consistent output.
 */

/**
 * Generates a consolidated To-Do List from Reclaims, Swaps, and other sources.
 * Menu item: Glove Manager → To-Do List → Generate To-Do List
 *
 * NOTE: This function now delegates to generateSmartSchedule() for consistent
 * To-Do List format. Both menu items will produce the same result.
 */
function generateToDoList() {
  Logger.log('=== generateToDoList called - delegating to generateSmartSchedule ===');
  // Delegate to the smart scheduling function for consistent output
  generateSmartSchedule();
}

/**
 * Legacy generateToDoList implementation.
 * Kept for reference but no longer used - generateSmartSchedule is preferred.
 * @deprecated Use generateSmartSchedule() instead
 */
function generateToDoListLegacy() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var todoSheet = ss.getSheetByName('To Do List');

  if (!todoSheet) {
    todoSheet = ss.insertSheet('To Do List');
  }

  todoSheet.clear();

  // Add calendar section at top
  buildToDoListCalendar(todoSheet);

  // Set up headers (starting at row 13 after calendar)
  var headerRow = 13;
  var headers = ['Priority', 'Task', 'Details', 'Sheet', 'Status', 'Scheduled Date', 'Estimated Time (min)', 'Start Location', 'End Location', 'Drive Time (min)', 'Overnight Required', 'Completed'];
  todoSheet.getRange(headerRow, 1, 1, headers.length).setValues([headers]);
  todoSheet.getRange(headerRow, 1, 1, headers.length).setFontWeight('bold').setBackground('#4285f4').setFontColor('white');

  var tasks = [];

  // Get scheduled tasks from crew visits and training
  var scheduledTasks = getScheduledTasksForCurrentMonth();
  tasks = tasks.concat(scheduledTasks);

  // ... (rest of legacy code preserved in archive)
}

// Additional functions: clearCompletedTasks, buildToDoListCalendar, 
// buildDayItinerary, getScheduledTasksForCurrentMonth, detectOvernightRequirement
// All preserved in this archive file.
```

</details>

## Restoration Instructions

If you need to restore this functionality:

1. Copy the code from this archive
2. Create a new file `src/70-ToDoList.gs`
3. Paste the archived code
4. Run `.\push.bat` to deploy

**Note:** Restoring this code is NOT recommended. Use the Task Metadata system instead.

