/**
 * @fileoverview ARCHIVED - February 16, 2026
 * ============================================================================
 *
 * Legacy To-Do List functions have been REMOVED.
 * Task Metadata is now the single source of truth for task management.
 *
 * MIGRATED FUNCTIONALITY:
 * - generateTaskMetadata() in Code.gs - Creates/updates tasks
 * - getTasksWithMetadata() in Code.gs - Retrieves tasks for UI
 * - collectAndGroupTasks() in 76-SmartScheduling.gs - Collects from sources
 * - ToDoSchedule.html - Calendar and task list UI
 * - TripPlanner.html - Route planning and itinerary
 *
 * TO RESTORE LEGACY CODE: See docs/ARCHIVED_70-ToDoList.md
 *
 * ============================================================================
 */

// Stub functions to prevent errors if called from legacy code

/**
 * @deprecated Use generateTaskMetadata() instead
 */
function generateToDoList() {
  Logger.log('generateToDoList() is deprecated - calling generateTaskMetadata()');
  generateTaskMetadata();
}

/**
 * @deprecated Legacy function - no longer needed
 */
function generateToDoListLegacy() {
  Logger.log('generateToDoListLegacy() is deprecated - use generateTaskMetadata()');
  SpreadsheetApp.getUi().alert(
    '⚠️ Legacy Function',
    'This function has been deprecated.\n\nUse "Generate Task Metadata" instead:\nGlove Manager → Schedule & To-Do → 🎯 Generate Task Metadata',
    SpreadsheetApp.getUi().ButtonSet.OK
  );
}

/**
 * @deprecated Use archiveOldCompletedTasks() instead
 */
function clearCompletedTasks() {
  Logger.log('clearCompletedTasks() is deprecated - use archiveOldCompletedTasks()');
  SpreadsheetApp.getUi().alert(
    '⚠️ Legacy Function',
    'This function has been deprecated.\n\nUse "Archive Completed Tasks" instead:\nGlove Manager → Schedule & To-Do → 🗄️ Archive Completed Tasks',
    SpreadsheetApp.getUi().ButtonSet.OK
  );
}
