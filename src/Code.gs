/**
 * Glove Manager – Rubber Glove & Sleeve Inventory System
 *
 * Google Apps Script foundation for automating and managing PPE inventory, assignments, swaps, compliance, and reporting.
 *
 * Hidden columns (K–W) on Glove/Sleeve Swaps tabs store workflow state for Stage 1-5 processing.
 *
 * Expand each placeholder as features are implemented. Logging and error handling included for maintainability.
 *
 * NOTE: Constants (COLS, sheet names, etc.) are defined in 00-Constants.gs
 *
 * UPDATE Feb 1, 2026: Phase 4 - Migrated localStorage to Task Metadata sheet
 * NOTE: Utility functions (logEvent, normalizeApprovalValue, etc.) are defined in 01-Utilities.gs
 */

// Local cache for getColumnMapping (deprecated function)
var _columnMappingCache = {};

function getColumnMapping(sheetName) {
  if (_columnMappingCache[sheetName]) return _columnMappingCache[sheetName];

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) return null;

  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var mapping = {};
  for (var i = 0; i < headers.length; i++) {
    var header = headers[i].toString().trim();
    if (header) {
      mapping[header] = i + 1; // 1-based index
    }
  }

  _columnMappingCache[sheetName] = mapping;
  return mapping;
}

function getCol(sheetName, headerName) {
  var mapping = getColumnMapping(sheetName);
  if (!mapping || !mapping[headerName]) {
    // Fallback/Warning for critical missing columns
    logEvent('Column "' + headerName + '" not found in sheet "' + sheetName + '"', 'ERROR');
    return null;
  }
  return mapping[headerName];
}

/**
 * Opens the Quick Actions sidebar for step-by-step workflow.
 * Menu item: Glove Manager → Quick Actions
 */
function openQuickActionsSidebar() {
  var html = HtmlService.createHtmlOutputFromFile('QuickActions')
    .setTitle('Quick Actions')
    .setWidth(280);
  SpreadsheetApp.getUi().showSidebar(html);
}

/**
 * Opens the To Do Schedule dialog
 * Called from QuickActions sidebar
 */
function showToDoSchedule() {
  var html = HtmlService.createHtmlOutputFromFile('ToDoSchedule')
    .setWidth(1400)
    .setHeight(900);
  SpreadsheetApp.getUi().showModalDialog(html, '📅 To Do Schedule');
}

/**
 * Opens the To Do Config dialog
 * Called from QuickActions sidebar
 */
function showToDoConfig() {
  var html = HtmlService.createHtmlOutputFromFile('ToDoConfig')
    .setWidth(1400)
    .setHeight(900);
  SpreadsheetApp.getUi().showModalDialog(html, '⚙️ To Do Config');
}

/**
 * Opens the unified Schedule dialog with tabs for Tasks, Trip Planner, and Config
 * This is the main scheduling interface that combines ToDoSchedule, TripPlanner, and ToDoConfig
 * @param {string} initialTab - Optional tab to open: 'schedule', 'trip', or 'config'
 */
function showScheduleDialog(initialTab) {
  var html = HtmlService.createHtmlOutputFromFile('Schedule')
    .setWidth(1400)
    .setHeight(900);
  SpreadsheetApp.getUi().showModalDialog(html, '📅 Schedule');
}

/**
 * Returns the HTML content of a specified file for embedding in Schedule dialog.
 * Used by Schedule.html to load ToDoSchedule, TripPlanner, and ToDoConfig as embedded content.
 *
 * NOTE: When HTML is loaded via iframe with document.write(), the google.script.run
 * context is lost. This function now returns content wrapped with the Apps Script
 * client library to restore functionality.
 *
 * @param {string} fileName - The HTML file name (without .html extension)
 * @return {string} The HTML content as a string with google.script.run support
 */
function getEmbeddedHtmlContent(fileName) {
  try {
    // Use createHtmlOutputFromFile which includes the Apps Script client library
    var htmlOutput = HtmlService.createHtmlOutputFromFile(fileName);

    // Get the content - this includes the necessary script tags for google.script.run
    var content = htmlOutput.getContent();

    return content;
  } catch (e) {
    Logger.log('Error loading embedded HTML ' + fileName + ': ' + e.toString());
    throw new Error('Could not load ' + fileName + ': ' + e.message);
  }
}

/**
 * Shows a specific embedded dialog by name.
 * This opens the dialog directly (not as iframe content), preserving google.script.run functionality.
 * Used as a workaround for iframe embedding limitations.
 * @param {string} dialogName - The dialog to show: 'ToDoSchedule', 'TripPlanner', or 'ToDoConfig'
 */
function showEmbeddedDialog(dialogName) {
  var ui = SpreadsheetApp.getUi();
  var titles = {
    'ToDoSchedule': 'Tasks',
    'TripPlanner': 'Trip Planner',
    'ToDoConfig': 'Configuration'
  };

  var html = HtmlService.createHtmlOutputFromFile(dialogName)
    .setWidth(1100)
    .setHeight(700);

  ui.showModalDialog(html, titles[dialogName] || dialogName);
}

// ============================================================================
// TO DO SCHEDULE & CONFIG BACKEND FUNCTIONS
// ============================================================================

/**
 * Creates employee name to phone number map from Employees sheet.
 * Used by getScheduleTasks to provide phone numbers for SMS notifications.
 *
 * @param {Spreadsheet} ss - Active spreadsheet
 * @return {Object} Map of employee name (lowercase) to phone number (digits only)
 */
function getEmployeePhoneMapForTasks(ss) {
  Logger.log('=== getEmployeePhoneMapForTasks START ===');
  var employeesSheet = ss.getSheetByName('Employees');
  if (!employeesSheet || employeesSheet.getLastRow() < 2) {
    Logger.log('ERROR: Employees sheet not found or empty');
    return {};
  }

  var data = employeesSheet.getDataRange().getValues();
  var headers = data[0];
  var nameCol = -1;
  var phoneCol = -1;

  // Find columns - log all headers for debugging
  Logger.log('Employees sheet headers: ' + JSON.stringify(headers));
  for (var h = 0; h < headers.length; h++) {
    var header = String(headers[h]).toLowerCase().trim();
    if (header === 'name') nameCol = h;
    if (header === 'phone number' || header === 'phone') phoneCol = h;
  }

  Logger.log('Found columns - nameCol: ' + nameCol + ', phoneCol: ' + phoneCol);

  if (nameCol === -1 || phoneCol === -1) {
    Logger.log('ERROR: Could not find Name or Phone Number column');
    return {};
  }

  var phoneMap = {};
  var foundCount = 0;
  var skippedCount = 0;

  for (var i = 1; i < data.length; i++) {
    var name = String(data[i][nameCol]).trim().replace(/\s+/g, ' '); // Normalize whitespace
    var phone = String(data[i][phoneCol] || '').trim();

    if (name && phone) {
      // Clean up phone number - keep only digits
      var cleanPhone = '';
      for (var c = 0; c < phone.length; c++) {
        var char = phone.charAt(c);
        if (char >= '0' && char <= '9') {
          cleanPhone += char;
        }
      }
      // If 10 digits, assume US number and add country code
      if (cleanPhone.length === 10) {
        cleanPhone = '1' + cleanPhone;
      }
      if (cleanPhone.length >= 10) {
        phoneMap[name.toLowerCase()] = cleanPhone;
        foundCount++;
        // Log first 5 entries for debugging
        if (foundCount <= 5) {
          Logger.log('Phone map entry: "' + name.toLowerCase() + '" => ' + cleanPhone);
        }
      } else {
        skippedCount++;
        if (skippedCount <= 3) {
          Logger.log('Skipped invalid phone for "' + name + '": "' + phone + '" (cleaned: ' + cleanPhone + ')');
        }
      }
    } else if (name && !phone) {
      skippedCount++;
    }
  }

  Logger.log('Phone map complete: ' + foundCount + ' valid phones, ' + skippedCount + ' skipped');
  Logger.log('=== getEmployeePhoneMapForTasks END ===');
  return phoneMap;
}

/**
 * Gets employee phone map - called from frontend dialogs.
 * Returns map of employee name (lowercase) to phone number.
 * @return {Object} Phone map
 */
function getEmployeePhoneMap() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  return getEmployeePhoneMapForTasks(ss);
}

/**
 * Gets all schedule tasks for the To Do Schedule dialog.
 * **Phase 2 Implementation** - Reads directly from source sheets via Task Metadata.
 * No longer uses deprecated To Do List sheet.
 *
 * @return {Array} Array of task objects for display
 */
function getScheduleTasks() {
  try {
    Logger.log('=== getScheduleTasks START (Phase 2 - Task Metadata) ===');
    var ss = SpreadsheetApp.getActiveSpreadsheet();

    // Get tasks with metadata - this is our new single source of truth
    var metadataResult = getTasksWithMetadata();

    // Check if metadataResult is null or invalid
    if (!metadataResult) {
      Logger.log('ERROR: getTasksWithMetadata returned null!');
      return null;
    }

    Logger.log('getTasksWithMetadata returned ' + (metadataResult.totalTasks || 0) + ' tasks');

    // The tasks from getTasksWithMetadata already have all the fields we need
    var tasks = metadataResult.tasks || [];
    Logger.log('Loaded ' + tasks.length + ' tasks from Task Metadata');

    // Load Manual Tasks ONLY for My Checklist section
    // These should NOT appear in Calendar or Task List (they're personal checklist items)
    // The My Checklist tab in ToDoSchedule.html will load these separately
    var manualSheet = ss.getSheetByName('Manual Tasks');
    if (manualSheet && manualSheet.getLastRow() > 1) {
      Logger.log('Reading Manual Tasks for My Checklist...');
      var manualData = manualSheet.getDataRange().getValues();
      var manualHeaders = manualData[0];

    // Find columns dynamically based on headers (supports both old and new structures)
    var colIndices = {};
    for (var mh = 0; mh < manualHeaders.length; mh++) {
      var header = String(manualHeaders[mh]).toLowerCase().trim();
      if (header === 'location') colIndices.location = mh;
      if (header === 'priority') colIndices.priority = mh;
      if (header === 'task' || header === 'task type') colIndices.taskType = mh;
      if (header === 'employee') colIndices.employee = mh;
      if (header === 'scheduled date') colIndices.scheduledDate = mh;
      if (header === 'start time') colIndices.startTime = mh;
      if (header === 'end time') colIndices.endTime = mh;
      if (header === 'status') colIndices.status = mh;
      if (header === 'notes') colIndices.notes = mh;
      if (header === 'manually created') colIndices.manuallyCreated = mh;
    }

    Logger.log('Manual Tasks column indices: ' + JSON.stringify(colIndices));

    var manualCount = 0;
    for (var mi = 1; mi < manualData.length; mi++) {
      var mRow = manualData[mi];

      // Get values with fallbacks
      var location = colIndices.location !== undefined ? (mRow[colIndices.location] || '') : '';
      var taskType = colIndices.taskType !== undefined ? (mRow[colIndices.taskType] || 'Task') : 'Task';
      var priority = colIndices.priority !== undefined ? (mRow[colIndices.priority] || 'Medium') : 'Medium';
      var employee = colIndices.employee !== undefined ? (mRow[colIndices.employee] || '') : '';
      var scheduledDate = colIndices.scheduledDate !== undefined ? mRow[colIndices.scheduledDate] : '';
      var startTime = colIndices.startTime !== undefined ? formatTimeForInput(mRow[colIndices.startTime]) : '';
      var endTime = colIndices.endTime !== undefined ? formatTimeForInput(mRow[colIndices.endTime]) : '';
      var status = colIndices.status !== undefined ? (mRow[colIndices.status] || 'Pending') : 'Pending';
      var notes = colIndices.notes !== undefined ? (mRow[colIndices.notes] || '') : '';
      // Check for manuallyCreated - handle all forms: boolean true, string 'TRUE', string 'true'
      // If column doesn't exist (old sheet), default to TRUE since all pre-migration tasks were user-created
      var manuallyCreatedRaw;
      if (colIndices.manuallyCreated !== undefined) {
        manuallyCreatedRaw = mRow[colIndices.manuallyCreated];
      } else {
        // Column doesn't exist - default to TRUE (user-created)
        manuallyCreatedRaw = true;
        Logger.log('Manual Tasks sheet missing "Manually Created" column - defaulting to TRUE');
      }
      var manuallyCreated = manuallyCreatedRaw === true || String(manuallyCreatedRaw).toUpperCase() === 'TRUE';

      // Debug logging for manual tasks
      Logger.log('Manual Task row ' + mi + ': location=' + location + ', taskType=' + taskType +
                 ', scheduledDate=' + scheduledDate + ', manuallyCreatedRaw=' + manuallyCreatedRaw +
                 ' (type: ' + typeof manuallyCreatedRaw + '), manuallyCreated=' + manuallyCreated);

      // Skip empty rows - check first few columns
      if (!location && !taskType) continue;

      // Skip completed tasks
      var statusLower = String(status).toLowerCase().trim();
      if (statusLower === 'complete' || statusLower === 'completed' || statusLower === 'done') {
        Logger.log('Skipping completed manual task: ' + taskType + ' at ' + location);
        continue;
      }

      // Skip trip summary entries (combined locations created by Trip Planner)
      // These have "+" in location (e.g., "Billings + Livingston") OR
      // taskType starts with "🗺️ Trip:" prefix
      var locationStr = String(location);
      var taskTypeStr = String(taskType);
      if (locationStr.indexOf(' + ') !== -1 || taskTypeStr.indexOf('🗺️ Trip:') !== -1) {
        Logger.log('Skipping trip summary entry: ' + location);
        continue;
      }

      tasks.push({
        id: 'manual-' + mi,
        source: 'Manual Tasks',
        taskType: taskType || 'Manual Task',
        priority: priority,
        location: location || 'No Location',
        scheduledDate: formatDateForInput(scheduledDate),
        startTime: startTime,
        endTime: endTime,
        status: status,
        notes: notes,
        estimatedTime: 1,
        startLocation: 'Helena',
        endLocation: location || 'Helena',
        employee: employee,
        itemType: 'Manual',
        rowIndex: mi + 1,
        manuallyCreated: manuallyCreated  // TRUE if user-created via "Add Manual Item"
      });
      manualCount++;
    }
    Logger.log('Added ' + manualCount + ' manual tasks (for My Checklist only)');
  }

  // Manual Tasks are included in the tasks array but will be filtered out
  // by Calendar/Task List views - they only appear in My Checklist tab

  // Sort by scheduled date, then priority
  tasks.sort(function(a, b) {
    // Priority order: High=1, Medium=2, Low=3
    var priorityOrder = { 'High': 1, 'Medium': 2, 'Low': 3 };
    var pA = priorityOrder[a.priority] || 2;
    var pB = priorityOrder[b.priority] || 2;

    // Scheduled date sort (empty dates last)
    if (a.scheduledDate && b.scheduledDate) {
      return a.scheduledDate.localeCompare(b.scheduledDate) || (pA - pB);
    }
    if (a.scheduledDate) return -1;
    if (b.scheduledDate) return 1;
    return pA - pB;
  });

  Logger.log('getScheduleTasks: Found ' + tasks.length + ' total tasks');
  Logger.log('=== getScheduleTasks END ===');
  return tasks;

  } catch (e) {
    Logger.log('ERROR in getScheduleTasks: ' + e.toString());
    Logger.log('Stack: ' + e.stack);
    Logger.log('Error occurred at line: ' + e.lineNumber);
    // Return null instead of empty array to signal error condition
    // This allows the client to show a proper error message
    return null;
  }
}


/**
 * Helper: Get pending swap tasks from a swap sheet (LEGACY - kept for compatibility)
 */
function getPendingSwapTasks(sheet, swapType) {
  // This function is no longer used since we get swap tasks from Task Metadata
  // Keeping for backwards compatibility
  return [];
}


/**
 * Helper: Format date for HTML date input (YYYY-MM-DD)
 */
function formatDateForInput(dateValue) {
  if (!dateValue) return '';

  // If already in YYYY-MM-DD format, return as-is
  if (typeof dateValue === 'string') {
    var isoMatch = dateValue.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (isoMatch) {
      return isoMatch[1] + '-' + isoMatch[2] + '-' + isoMatch[3];
    }
    // Try MM/DD/YYYY format
    var usMatch = dateValue.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (usMatch) {
      return usMatch[3] + '-' + String(usMatch[1]).padStart(2, '0') + '-' + String(usMatch[2]).padStart(2, '0');
    }
  }

  // For Date objects, use local timezone methods to avoid UTC conversion issues
  var date;
  if (dateValue instanceof Date) {
    date = dateValue;
  } else {
    date = new Date(dateValue);
  }

  if (isNaN(date.getTime())) return '';

  var year = date.getFullYear();
  var month = String(date.getMonth() + 1).padStart(2, '0');
  var day = String(date.getDate()).padStart(2, '0');
  return year + '-' + month + '-' + day;
}

/**
 * Helper: Format time for HTML time input (HH:MM)
 * Google Sheets stores times as Date objects - extract just the time portion
 */
function formatTimeForInput(timeValue) {
  if (!timeValue) return '';

  // If it's already a string in HH:MM format, return it
  if (typeof timeValue === 'string') {
    var match = timeValue.match(/^(\d{1,2}):(\d{2})/);
    if (match) {
      return String(match[1]).padStart(2, '0') + ':' + match[2];
    }
    return '';
  }

  // If it's a Date object (Google Sheets stores times as dates)
  if (timeValue instanceof Date || (typeof timeValue === 'object' && timeValue.getHours)) {
    var hours = String(timeValue.getHours()).padStart(2, '0');
    var minutes = String(timeValue.getMinutes()).padStart(2, '0');
    return hours + ':' + minutes;
  }

  // Try to parse as date
  var date = new Date(timeValue);
  if (!isNaN(date.getTime())) {
    var hours = String(date.getHours()).padStart(2, '0');
    var minutes = String(date.getMinutes()).padStart(2, '0');
    return hours + ':' + minutes;
  }

  return '';
}

/**
 * Saves multiple schedule task date and time changes at once.
 * @param {Array} changes - Array of {index, task, oldDate, newDate, startTime, endTime} objects
 * @return {Object} Result with success status
 */
function saveScheduleTaskDateChanges(changes) {
  Logger.log('=== saveScheduleTaskDateChanges START ===');
  Logger.log('Received ' + changes.length + ' changes');
  Logger.log('Changes: ' + JSON.stringify(changes, null, 2));

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var updatedCount = 0;

  for (var c = 0; c < changes.length; c++) {
    var change = changes[c];

    // NEW: Accept either taskKey OR index (for backwards compatibility)
    var taskKey = change.taskKey;
    var newDate = change.newDate;
    var startTime = change.startTime;
    var endTime = change.endTime;

    Logger.log('--- Processing change ' + (c + 1) + '/' + changes.length + ' ---');
    Logger.log('taskKey: ' + taskKey);
    Logger.log('newDate: ' + newDate);
    Logger.log('startTime: ' + startTime);
    Logger.log('endTime: ' + endTime);

    // If taskKey is provided, use it directly (preferred - fast & reliable)
    if (taskKey) {
      var metadataUpdates = {};
      if (newDate) metadataUpdates.ScheduledDate = newDate;
      if (startTime !== undefined && startTime !== null) metadataUpdates.StartTime = startTime;
      if (endTime !== undefined && endTime !== null) metadataUpdates.EndTime = endTime;

      // Also update Status to "Scheduled" when scheduling
      if (newDate) metadataUpdates.Status = 'Scheduled';

      if (Object.keys(metadataUpdates).length > 0) {
        Logger.log('Updating Task Metadata with: ' + JSON.stringify(metadataUpdates));
        var result = updateTaskMetadata(taskKey, metadataUpdates);
        if (result.success) {
          Logger.log('✓ Updated Task Metadata for: ' + taskKey);
          updatedCount++;

          // Also update Manual Tasks sheet if applicable
          if (taskKey.indexOf('Manual Tasks_') === 0) {
            var manualSheet = ss.getSheetByName('Manual Tasks');
            var rowIndex = parseInt(taskKey.split('_')[1]);
            if (manualSheet && rowIndex) {
              // Manual Tasks columns: E=Scheduled Date, F=Start Time, G=End Time
              if (newDate) manualSheet.getRange(rowIndex, 5).setValue(newDate);
              if (startTime !== undefined && startTime !== null) manualSheet.getRange(rowIndex, 6).setValue(startTime);
              if (endTime !== undefined && endTime !== null) manualSheet.getRange(rowIndex, 7).setValue(endTime);
              Logger.log('✓ Also updated Manual Tasks sheet row ' + rowIndex);
            }
          }
        } else {
          Logger.log('✗ Failed to update Task Metadata for: ' + taskKey + ' - ' + result.error);
        }
      } else {
        Logger.log('⚠️ No updates to apply for taskKey: ' + taskKey);
      }
      continue; // Skip to next change
    }

    // LEGACY FALLBACK: If no taskKey, try to use index (old behavior - less reliable)
    Logger.log('⚠️ WARNING: No taskKey provided for change ' + (c + 1) + ', attempting legacy index-based update');
    var taskIndex = change.index;
    if (taskIndex >= 0) {
      var tasks = getScheduleTasks();
      if (taskIndex >= tasks.length) {
        Logger.log('✗ Invalid task index: ' + taskIndex + ' (tasks.length=' + tasks.length + ')');
        continue;
      }

      var task = tasks[taskIndex];
      Logger.log('Legacy: Found task at index ' + taskIndex + ': ' + task.taskType + ' (' + task.employee + ')');

      // Try to update Task Metadata using task key extracted from task
      if (task.source && task.rowIndex) {
        taskKey = task.source + '_' + task.rowIndex;
        Logger.log('Legacy: Extracted taskKey from task: ' + taskKey);
        var metadataUpdates = {};
        if (newDate) metadataUpdates.ScheduledDate = newDate;
        if (startTime !== undefined && startTime !== null) metadataUpdates.StartTime = startTime;
        if (endTime !== undefined && endTime !== null) metadataUpdates.EndTime = endTime;
        if (newDate) metadataUpdates.Status = 'Scheduled';

        if (Object.keys(metadataUpdates).length > 0) {
          var result = updateTaskMetadata(taskKey, metadataUpdates);
          if (result.success) {
            Logger.log('✓ Legacy: Updated Task Metadata for: ' + taskKey);
            updatedCount++;
          }
        }
      } else {
        Logger.log('✗ Legacy: Task has no source or rowIndex - cannot update');
      }

      // Update Manual Tasks sheet if applicable
      if (task.source === 'Manual Tasks' && task.rowIndex) {
        var manualSheet = ss.getSheetByName('Manual Tasks');
        if (manualSheet) {
          if (newDate) manualSheet.getRange(task.rowIndex, 5).setValue(newDate);
          if (startTime !== undefined && startTime !== null) manualSheet.getRange(task.rowIndex, 6).setValue(startTime);
          if (endTime !== undefined && endTime !== null) manualSheet.getRange(task.rowIndex, 7).setValue(endTime);
          Logger.log('✓ Legacy: Updated Manual Tasks sheet row ' + task.rowIndex);
        }
      }
    } else {
      Logger.log('✗ No taskKey AND no valid index - cannot process change');
    }
  }

  SpreadsheetApp.flush();
  Logger.log('=== saveScheduleTaskDateChanges END ===');
  Logger.log('Updated ' + updatedCount + ' task(s)');

  return { success: true, updatedCount: updatedCount };
}

/**
 * Wrapper function for adding a manual scheduled item from the To Do Schedule dialog.
 * Called from ToDoSchedule.html when user clicks "Add Item" in the Add Manual Item modal.
 * @param {Object} data - Data from the form with title, notes, scheduledDate, location, startTime, endTime, priority, and flexibility options
 * @return {Object} Result with success status
 */
function addManualScheduledItem(data) {
  Logger.log('addManualScheduledItem: ' + JSON.stringify(data));

  try {
    // Map the form data to the task structure expected by addManualScheduleTask
    var task = {
      taskType: data.title || 'Manual Task',
      notes: data.notes || '',
      scheduledDate: data.scheduledDate || '',
      location: data.location || '',
      startTime: data.startTime || '',
      endTime: data.endTime || '',
      priority: data.priority || 'Medium',
      employee: '',  // Manual items don't have an employee by default
      // Flexibility options for Trip Planner
      locked: data.locked !== false ? true : false,  // Default to locked
      allowDayChange: data.allowDayChange === true,
      allowWeekChange: data.allowWeekChange === true,
      allowTimeChange: data.allowTimeChange === true,
      // Mark as user-created (not system-generated like Trip Planner entries)
      manuallyCreated: true
    };

    return addManualScheduleTask(task);
  } catch (e) {
    Logger.log('Error in addManualScheduledItem: ' + e.toString());
    return { success: false, error: e.toString() };
  }
}

/**
 * Adds a manual schedule task to the Manual Tasks sheet.
 * Uses unified column structure matching To Do List for consistency.
 * @param {Object} task - Task object with taskType, location, scheduledDate, startTime, endTime, priority, notes
 * @return {Object} Result with success status
 */
function addManualScheduleTask(task) {
  Logger.log('addManualScheduleTask: ' + JSON.stringify(task));

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var manualSheet = ss.getSheetByName('Manual Tasks');

  // Unified headers matching To Do List structure (simplified for manual tasks)
  // Includes flexibility options for Trip Planner scheduling
  var standardHeaders = [
    'Location',           // A - 0
    'Priority',           // B - 1
    'Task Type',          // C - 2
    'Employee',           // D - 3
    'Scheduled Date',     // E - 4
    'Start Time',         // F - 5
    'End Time',           // G - 6
    'Status',             // H - 7
    'Notes',              // I - 8
    'Date Added',         // J - 9
    'Allow Day Change',   // K - 10: Can move within same week? (TRUE/FALSE)
    'Allow Week Change',  // L - 11: Can move to different week? (TRUE/FALSE)
    'Allow Time Change',  // M - 12: Can adjust time within scheduled day? (TRUE/FALSE)
    'Locked',             // N - 13: Completely locked - no changes allowed (TRUE/FALSE)
    'Manually Created'    // O - 14: TRUE if user-created via "Add Manual Item", FALSE if system-generated
  ];

  // Create sheet if it doesn't exist with standard headers
  if (!manualSheet) {
    manualSheet = ss.insertSheet('Manual Tasks');
    manualSheet.getRange(1, 1, 1, standardHeaders.length).setValues([standardHeaders]);
    manualSheet.getRange(1, 1, 1, standardHeaders.length)
      .setFontWeight('bold')
      .setBackground('#667eea')
      .setFontColor('white');
    manualSheet.setFrozenRows(1);
    Logger.log('Created Manual Tasks sheet with unified headers');
  }

  // Read existing headers to find column positions (handles both old and new structures)
  var headers = manualSheet.getRange(1, 1, 1, manualSheet.getLastColumn()).getValues()[0];
  var colMap = {};

  for (var h = 0; h < headers.length; h++) {
    var header = String(headers[h]).toLowerCase().trim();
    if (header === 'location') colMap.location = h;
    if (header === 'priority') colMap.priority = h;
    if (header === 'task' || header === 'task type') colMap.taskType = h;
    if (header === 'employee') colMap.employee = h;
    if (header === 'scheduled date') colMap.scheduledDate = h;
    if (header === 'start time') colMap.startTime = h;
    if (header === 'end time') colMap.endTime = h;
    if (header === 'status') colMap.status = h;
    if (header === 'notes') colMap.notes = h;
    if (header === 'date added') colMap.dateAdded = h;
    if (header === 'allow day change') colMap.allowDayChange = h;
    if (header === 'allow week change') colMap.allowWeekChange = h;
    if (header === 'allow time change') colMap.allowTimeChange = h;
    if (header === 'locked') colMap.locked = h;
    if (header === 'manually created') colMap.manuallyCreated = h;
  }

  // Auto-add missing columns for flexibility options and manually created flag
  var missingColumns = [];
  if (colMap.manuallyCreated === undefined) missingColumns.push('Manually Created');
  if (colMap.locked === undefined) missingColumns.push('Locked');
  if (colMap.allowDayChange === undefined) missingColumns.push('Allow Day Change');
  if (colMap.allowWeekChange === undefined) missingColumns.push('Allow Week Change');
  if (colMap.allowTimeChange === undefined) missingColumns.push('Allow Time Change');

  if (missingColumns.length > 0) {
    Logger.log('Auto-adding missing columns to Manual Tasks: ' + missingColumns.join(', '));
    var lastCol = manualSheet.getLastColumn();
    for (var mc = 0; mc < missingColumns.length; mc++) {
      var newColIndex = lastCol + mc;
      manualSheet.getRange(1, newColIndex + 1).setValue(missingColumns[mc])
        .setFontWeight('bold')
        .setBackground('#667eea')
        .setFontColor('white');

      // Update colMap with new column position
      var colKey = missingColumns[mc].toLowerCase().replace(/ /g, '');
      if (missingColumns[mc] === 'Manually Created') colMap.manuallyCreated = newColIndex;
      if (missingColumns[mc] === 'Locked') colMap.locked = newColIndex;
      if (missingColumns[mc] === 'Allow Day Change') colMap.allowDayChange = newColIndex;
      if (missingColumns[mc] === 'Allow Week Change') colMap.allowWeekChange = newColIndex;
      if (missingColumns[mc] === 'Allow Time Change') colMap.allowTimeChange = newColIndex;
    }
    // Re-read headers after adding columns
    headers = manualSheet.getRange(1, 1, 1, manualSheet.getLastColumn()).getValues()[0];
    Logger.log('Added missing columns. New headers: ' + headers.join(', '));
  }

  Logger.log('addManualScheduleTask column map: ' + JSON.stringify(colMap));

  // Build new row - initialize with empty values (ES5 compatible)
  var newRow = [];
  for (var nr = 0; nr < headers.length; nr++) {
    newRow.push('');
  }

  // Set values in appropriate columns
  if (colMap.location !== undefined) newRow[colMap.location] = task.location || '';
  if (colMap.priority !== undefined) newRow[colMap.priority] = task.priority || 'Medium';
  if (colMap.taskType !== undefined) newRow[colMap.taskType] = task.taskType || 'Manual Task';
  if (colMap.employee !== undefined) newRow[colMap.employee] = task.employee || '';
  if (colMap.scheduledDate !== undefined) newRow[colMap.scheduledDate] = task.scheduledDate || '';
  if (colMap.startTime !== undefined) newRow[colMap.startTime] = task.startTime || '';
  if (colMap.endTime !== undefined) newRow[colMap.endTime] = task.endTime || '';
  if (colMap.status !== undefined) newRow[colMap.status] = 'Pending';
  if (colMap.notes !== undefined) newRow[colMap.notes] = task.notes || '';
  if (colMap.dateAdded !== undefined) {
    newRow[colMap.dateAdded] = Utilities.formatDate(new Date(), ss.getSpreadsheetTimeZone(), 'MM/dd/yyyy HH:mm');
  }
  // Flexibility options - default to locked (no changes allowed) unless explicitly set
  if (colMap.allowDayChange !== undefined) newRow[colMap.allowDayChange] = task.allowDayChange === true ? true : false;
  if (colMap.allowWeekChange !== undefined) newRow[colMap.allowWeekChange] = task.allowWeekChange === true ? true : false;
  if (colMap.allowTimeChange !== undefined) newRow[colMap.allowTimeChange] = task.allowTimeChange === true ? true : false;
  if (colMap.locked !== undefined) newRow[colMap.locked] = task.locked !== false ? true : false; // Default to locked
  // Mark as manually created (true for user-created, false for system-generated)
  if (colMap.manuallyCreated !== undefined) newRow[colMap.manuallyCreated] = task.manuallyCreated === true ? true : false;

  manualSheet.appendRow(newRow);
  Logger.log('Added manual task row');

  return { success: true };
}

/**
 * Migrates the Manual Tasks sheet to the new unified column structure.
 * Call this once to update an existing sheet to the new format.
 * Menu: Glove Manager → Utilities → Migrate Manual Tasks Sheet
 */
function migrateManualTasksSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var manualSheet = ss.getSheetByName('Manual Tasks');

  if (!manualSheet) {
    SpreadsheetApp.getUi().alert('Manual Tasks sheet not found. It will be created with the correct structure when you add your first task.');
    return;
  }

  // Read existing data
  var existingData = manualSheet.getDataRange().getValues();
  var oldHeaders = existingData[0];

  // Map old column positions
  var oldColMap = {};
  for (var h = 0; h < oldHeaders.length; h++) {
    var header = String(oldHeaders[h]).toLowerCase().trim();
    if (header === 'location') oldColMap.location = h;
    if (header === 'priority') oldColMap.priority = h;
    if (header === 'task' || header === 'task type') oldColMap.taskType = h;
    if (header === 'employee') oldColMap.employee = h;
    if (header === 'scheduled date') oldColMap.scheduledDate = h;
    if (header === 'start time') oldColMap.startTime = h;
    if (header === 'end time') oldColMap.endTime = h;
    if (header === 'status') oldColMap.status = h;
    if (header === 'notes') oldColMap.notes = h;
    if (header === 'date added') oldColMap.dateAdded = h;
    if (header === 'allow day change') oldColMap.allowDayChange = h;
    if (header === 'allow week change') oldColMap.allowWeekChange = h;
    if (header === 'allow time change') oldColMap.allowTimeChange = h;
    if (header === 'locked') oldColMap.locked = h;
    if (header === 'manually created') oldColMap.manuallyCreated = h;
  }

  Logger.log('Old column map: ' + JSON.stringify(oldColMap));

  // New unified headers with flexibility options and manually created flag
  var newHeaders = [
    'Location',           // A - 0
    'Priority',           // B - 1
    'Task Type',          // C - 2
    'Employee',           // D - 3
    'Scheduled Date',     // E - 4
    'Start Time',         // F - 5
    'End Time',           // G - 6
    'Status',             // H - 7
    'Notes',              // I - 8
    'Date Added',         // J - 9
    'Allow Day Change',   // K - 10
    'Allow Week Change',  // L - 11
    'Allow Time Change',  // M - 12
    'Locked',             // N - 13
    'Manually Created'    // O - 14: TRUE if user-created, FALSE if system-generated
  ];

  // Convert existing data to new format
  var newData = [newHeaders];

  for (var i = 1; i < existingData.length; i++) {
    var oldRow = existingData[i];

    // Skip empty rows
    var location = oldColMap.location !== undefined ? oldRow[oldColMap.location] : '';
    var taskType = oldColMap.taskType !== undefined ? oldRow[oldColMap.taskType] : '';
    if (!location && !taskType) continue;

    // Determine if this is a user-created manual task
    // Tasks with "🗺️ Trip:" prefix are system-generated by Trip Planner
    var taskTypeStr = String(taskType);
    var isUserCreated = oldColMap.manuallyCreated !== undefined
      ? (oldRow[oldColMap.manuallyCreated] === true || oldRow[oldColMap.manuallyCreated] === 'TRUE')
      : (taskTypeStr.indexOf('🗺️ Trip:') === -1);  // Legacy: assume non-trip tasks were user-created

    var newRow = [
      oldColMap.location !== undefined ? oldRow[oldColMap.location] : '',
      oldColMap.priority !== undefined ? oldRow[oldColMap.priority] : 'Medium',
      oldColMap.taskType !== undefined ? oldRow[oldColMap.taskType] : '',
      oldColMap.employee !== undefined ? oldRow[oldColMap.employee] : '',
      oldColMap.scheduledDate !== undefined ? oldRow[oldColMap.scheduledDate] : '',
      oldColMap.startTime !== undefined ? oldRow[oldColMap.startTime] : '',
      oldColMap.endTime !== undefined ? oldRow[oldColMap.endTime] : '',
      oldColMap.status !== undefined ? oldRow[oldColMap.status] : 'Pending',
      oldColMap.notes !== undefined ? oldRow[oldColMap.notes] : '',
      oldColMap.dateAdded !== undefined ? oldRow[oldColMap.dateAdded] : '',
      // Flexibility options - preserve if they exist, default to locked for existing tasks
      oldColMap.allowDayChange !== undefined ? oldRow[oldColMap.allowDayChange] : false,
      oldColMap.allowWeekChange !== undefined ? oldRow[oldColMap.allowWeekChange] : false,
      oldColMap.allowTimeChange !== undefined ? oldRow[oldColMap.allowTimeChange] : false,
      oldColMap.locked !== undefined ? oldRow[oldColMap.locked] : true,  // Default to locked
      isUserCreated  // Manually Created flag
    ];

    newData.push(newRow);
  }

  // Clear and rewrite sheet
  manualSheet.clear();
  manualSheet.getRange(1, 1, newData.length, newHeaders.length).setValues(newData);

  // Format headers
  manualSheet.getRange(1, 1, 1, newHeaders.length)
    .setFontWeight('bold')
    .setBackground('#667eea')
    .setFontColor('white');
  manualSheet.setFrozenRows(1);

  // Format date column
  if (newData.length > 1) {
    manualSheet.getRange(2, 5, newData.length - 1, 1).setNumberFormat('mm/dd/yyyy'); // Scheduled Date
  }

  // Set column widths
  manualSheet.setColumnWidth(1, 120); // Location
  manualSheet.setColumnWidth(2, 80);  // Priority
  manualSheet.setColumnWidth(3, 180); // Task Type
  manualSheet.setColumnWidth(4, 120); // Employee
  manualSheet.setColumnWidth(5, 110); // Scheduled Date
  manualSheet.setColumnWidth(6, 90);  // Start Time
  manualSheet.setColumnWidth(7, 90);  // End Time
  manualSheet.setColumnWidth(8, 80);  // Status
  manualSheet.setColumnWidth(9, 200); // Notes
  manualSheet.setColumnWidth(10, 130); // Date Added
  manualSheet.setColumnWidth(11, 110); // Allow Day Change
  manualSheet.setColumnWidth(12, 120); // Allow Week Change
  manualSheet.setColumnWidth(13, 115); // Allow Time Change
  manualSheet.setColumnWidth(14, 70);  // Locked
  manualSheet.setColumnWidth(15, 115); // Manually Created

  SpreadsheetApp.getUi().alert('✅ Manual Tasks sheet migrated to new format!\n\n' +
    'Old rows: ' + (existingData.length - 1) + '\n' +
    'New rows: ' + (newData.length - 1) + '\n\n' +
    'New columns:\n' +
    '• Allow Day Change - Can move within same week\n' +
    '• Allow Week Change - Can move to different week\n' +
    '• Allow Time Change - Can adjust time within day\n' +
    '• Locked - Completely locked (no changes allowed)\n' +
    '• Manually Created - TRUE if you created it, FALSE if system-generated\n\n' +
    'Tasks with "🗺️ Trip:" prefix are marked as NOT manually created.');
  Logger.log('Migration complete: ' + (newData.length - 1) + ' tasks migrated');
}

/**
 * Prompts user for a location name and purges all tasks for that location.
 * Menu: Glove Manager → Utilities → Purge Stuck Task by Location
 */
function promptPurgeTaskByLocation() {
  var ui = SpreadsheetApp.getUi();

  var response = ui.prompt(
    '🗑️ Purge Tasks by Location',
    'Enter the location name to purge (e.g., "Billings"):\n\n' +
    'This will remove ALL tasks for this location from:\n' +
    '• To Do List sheet\n' +
    '• Manual Tasks sheet\n' +
    '• Saved Trip Plan\n\n' +
    'This action cannot be undone!',
    ui.ButtonSet.OK_CANCEL
  );

  if (response.getSelectedButton() === ui.Button.OK) {
    var locationName = response.getResponseText().trim();
    if (locationName) {
      // Confirm before purging
      var confirm = ui.alert(
        'Confirm Purge',
        'Are you sure you want to purge ALL tasks for "' + locationName + '"?',
        ui.ButtonSet.YES_NO
      );

      if (confirm === ui.Button.YES) {
        purgeTasksByLocation(locationName);
      }
    } else {
      ui.alert('No location entered. Purge cancelled.');
    }
  }
}

/**
 * Fixes the manuallyCreated flag for existing manual tasks.
 * Sets manuallyCreated = TRUE for tasks that look like user-created manual tasks.
 * Run this once to fix existing data.
 */
function fixManuallyCreatedFlags() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var manualSheet = ss.getSheetByName('Manual Tasks');

  if (!manualSheet || manualSheet.getLastRow() < 2) {
    SpreadsheetApp.getUi().alert('Manual Tasks sheet not found or empty.');
    return;
  }

  var data = manualSheet.getDataRange().getValues();
  var headers = data[0];

  // Find column indices
  var colMap = {};
  for (var h = 0; h < headers.length; h++) {
    var header = String(headers[h]).toLowerCase().trim();
    if (header === 'task' || header === 'task type') colMap.taskType = h;
    if (header === 'manually created') colMap.manuallyCreated = h;
  }

  if (colMap.manuallyCreated === undefined) {
    SpreadsheetApp.getUi().alert('Manually Created column not found. Please run "Migrate Manual Tasks Sheet" first.');
    return;
  }

  var updatedCount = 0;

  for (var i = 1; i < data.length; i++) {
    var taskType = String(data[i][colMap.taskType] || '').toLowerCase().trim();
    var currentValue = data[i][colMap.manuallyCreated];

    // If already set to TRUE, skip
    if (currentValue === true || currentValue === 'TRUE') continue;

    // Skip system-generated tasks (Trip Planner entries)
    if (taskType.indexOf('🗺️ trip:') !== -1 || taskType.indexOf('trip:') !== -1) continue;

    // Set to TRUE for all other tasks
    manualSheet.getRange(i + 1, colMap.manuallyCreated + 1).setValue(true);
    updatedCount++;
  }

  SpreadsheetApp.getUi().alert('Fixed ' + updatedCount + ' task(s) - set manuallyCreated = TRUE');
  Logger.log('fixManuallyCreatedFlags: Updated ' + updatedCount + ' rows');
}

/**
 * Cleans up duplicate/non-manual entries from the Manual Tasks sheet.
 * Removes tasks that were NOT created manually (i.e., don't have "Manual" in task type
 * and don't look like legitimate manual tasks).
 *
 * Menu: Glove Manager → Utilities → Clean Up Manual Tasks
 * @return {Object} Result with count of removed tasks
 */
function cleanupDuplicateManualTasks() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var manualSheet = ss.getSheetByName('Manual Tasks');

  if (!manualSheet || manualSheet.getLastRow() < 2) {
    SpreadsheetApp.getUi().alert('Manual Tasks sheet not found or empty.');
    return { removed: 0, message: 'Sheet not found or empty' };
  }

  var data = manualSheet.getDataRange().getValues();
  var headers = data[0];

  // Find column indices
  var colMap = {};
  for (var h = 0; h < headers.length; h++) {
    var header = String(headers[h]).toLowerCase().trim();
    if (header === 'location') colMap.location = h;
    if (header === 'task' || header === 'task type') colMap.taskType = h;
    if (header === 'employee') colMap.employee = h;
    if (header === 'notes') colMap.notes = h;
  }

  Logger.log('cleanupDuplicateManualTasks - columns: ' + JSON.stringify(colMap));

  // Identify rows that are NOT legitimate manual tasks
  // Legitimate manual tasks have:
  // - Task Type contains "Manual", "Trip", "Visit", "Meeting", "Call", or similar
  // - OR Task Type matches location (indicating placeholder entry from Trip Planner)
  // Non-manual (duplicates to remove):
  // - Task Type is just a location name
  // - Task Type contains "Swap", "Cert", "Expir", "Reclaim", "Training"

  var rowsToDelete = [];
  var taskTypesToRemove = ['swap', 'cert', 'expir', 'reclaim', 'glove', 'sleeve'];
  var locationNames = ['bozeman', 'billings', 'helena', 'great falls', 'missoula',
                       'butte', 'livingston', 'california', 'lolo', 'ennis',
                       'stanford', 'big sky', 'kalispell', 'south dakota', 'rapelje',
                       'gold creek', 'elliston', 'weeds', 'northern lights'];

  for (var i = data.length - 1; i >= 1; i--) {
    var row = data[i];
    var location = String(row[colMap.location] || '').toLowerCase().trim();
    var taskType = String(row[colMap.taskType] || '').toLowerCase().trim();
    var employee = String(row[colMap.employee] || '').toLowerCase().trim();
    var notes = String(row[colMap.notes] || '').toLowerCase().trim();

    // Skip empty rows
    if (!location && !taskType) continue;

    var shouldRemove = false;
    var reason = '';

    // Check if task type is a swap/cert/reclaim task (these shouldn't be in Manual Tasks)
    for (var t = 0; t < taskTypesToRemove.length; t++) {
      if (taskType.indexOf(taskTypesToRemove[t]) !== -1) {
        shouldRemove = true;
        reason = 'Contains "' + taskTypesToRemove[t] + '"';
        break;
      }
    }

    // Check if task type is just a location name (placeholder from incorrect scheduling)
    if (!shouldRemove) {
      for (var l = 0; l < locationNames.length; l++) {
        if (taskType === locationNames[l] ||
            (taskType.indexOf(locationNames[l]) !== -1 && taskType.length < locationNames[l].length + 5)) {
          shouldRemove = true;
          reason = 'Task type is just location name: "' + taskType + '"';
          break;
        }
      }
    }

    // Check if it's a multi-location entry without proper task type (from Trip Planner)
    if (!shouldRemove && taskType.indexOf('+') !== -1) {
      // Multi-location entries like "Bozeman + Livingston" that aren't trips
      var hasManualKeyword = taskType.indexOf('trip') !== -1 ||
                             taskType.indexOf('visit') !== -1 ||
                             taskType.indexOf('manual') !== -1;
      if (!hasManualKeyword) {
        shouldRemove = true;
        reason = 'Multi-location without trip keyword';
      }
    }

    if (shouldRemove) {
      rowsToDelete.push({ row: i + 1, location: location, taskType: taskType, reason: reason });
      Logger.log('Flagged for removal: Row ' + (i + 1) + ' - "' + location + '" / "' + taskType + '" - ' + reason);
    }
  }

  // Confirm before deleting
  if (rowsToDelete.length === 0) {
    SpreadsheetApp.getUi().alert('✅ No duplicate entries found!\n\nYour Manual Tasks sheet is clean.');
    return { removed: 0, message: 'No duplicates found' };
  }

  var confirmMsg = 'Found ' + rowsToDelete.length + ' non-manual entries to remove:\n\n';
  for (var r = 0; r < Math.min(rowsToDelete.length, 10); r++) {
    confirmMsg += '• ' + rowsToDelete[r].location + ' - ' + rowsToDelete[r].taskType + '\n';
  }
  if (rowsToDelete.length > 10) {
    confirmMsg += '... and ' + (rowsToDelete.length - 10) + ' more\n';
  }
  confirmMsg += '\nProceed with removal?';

  var response = SpreadsheetApp.getUi().alert('Clean Up Manual Tasks', confirmMsg, SpreadsheetApp.getUi().ButtonSet.YES_NO);

  if (response !== SpreadsheetApp.getUi().Button.YES) {
    return { removed: 0, message: 'Cancelled by user' };
  }

  // Delete rows from bottom to top to maintain indices
  var removed = 0;
  for (var d = 0; d < rowsToDelete.length; d++) {
    manualSheet.deleteRow(rowsToDelete[d].row);
    removed++;
  }

  SpreadsheetApp.getUi().alert('✅ Cleanup Complete!\n\nRemoved ' + removed + ' non-manual entries from Manual Tasks sheet.');
  Logger.log('cleanupDuplicateManualTasks: Removed ' + removed + ' entries');

  return { removed: removed, message: 'Removed ' + removed + ' entries' };
}

/**
 * Updates the status of a manual task.
 * @param {number} taskIndex - Index of task in getScheduleTasks() array
 * @param {string} newStatus - New status ('Complete' or 'Pending')
 * @return {Object} Result with success status
 */
function updateManualTaskStatus(taskIndex, newStatus) {
  Logger.log('updateManualTaskStatus: index=' + taskIndex + ', status=' + newStatus);

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var tasks = getScheduleTasks();

  if (taskIndex < 0 || taskIndex >= tasks.length) {
    throw new Error('Invalid task index');
  }

  var task = tasks[taskIndex];

  if (task.source !== 'Manual Tasks') {
    throw new Error('Can only update status for Manual Tasks');
  }

  var manualSheet = ss.getSheetByName('Manual Tasks');
  if (!manualSheet || !task.rowIndex) {
    throw new Error('Manual Tasks sheet not found or invalid row');
  }

  // Manual Tasks columns: A=Location, B=Priority, C=Task Type, D=Employee, E=Scheduled Date, F=Start Time, G=End Time, H=Status
  manualSheet.getRange(task.rowIndex, 8).setValue(newStatus); // Column H = Status

  return { success: true };
}

/**
 * Updates a task's scheduled date from the To Do Schedule dialog.
 *
 * @param {number} taskIndex - Index of task in array
 * @param {string} newDate - New date in YYYY-MM-DD format
 */
function updateScheduleTaskDate(taskIndex, newDate) {
  Logger.log('updateScheduleTaskDate: index=' + taskIndex + ', date=' + newDate);

  // Get current tasks to find the source
  var tasks = getScheduleTasks();
  if (taskIndex < 0 || taskIndex >= tasks.length) {
    throw new Error('Invalid task index');
  }

  var task = tasks[taskIndex];
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  // Update the source sheet based on task source
  if (task.source === 'Manual Tasks') {
    var manualSheet = ss.getSheetByName('Manual Tasks');
    if (manualSheet) {
      // Manual Tasks columns: A=Location, B=Priority, C=Task Type, D=Employee, E=Scheduled Date
      manualSheet.getRange(task.rowIndex, 5).setValue(newDate); // Column E = Scheduled Date
    }
  } else if (task.source === 'Crew Visit Config') {
    var crewSheet = ss.getSheetByName('Crew Visit Config');
    if (crewSheet) {
      // Find the Next Visit Date column
      var headers = crewSheet.getRange(1, 1, 1, crewSheet.getLastColumn()).getValues()[0];
      for (var h = 0; h < headers.length; h++) {
        if (String(headers[h]).toLowerCase().indexOf('next') !== -1 &&
            String(headers[h]).toLowerCase().indexOf('date') !== -1) {
          crewSheet.getRange(task.rowIndex, h + 1).setValue(newDate);
          break;
        }
      }
    }
  }
  // Note: Training Tracking and Expiring Certs dates are calculated, not user-editable

  return { success: true };
}

/**
 * Marks a task as complete in the To Do Schedule.
 * Also updates Training Config completion status when training tasks are completed.
 *
 * @param {number|Object} taskIndexOrTask - Index of task in array OR the task object itself
 */
function markScheduleTaskComplete(taskIndexOrTask) {
  Logger.log('markScheduleTaskComplete called with: ' + JSON.stringify(taskIndexOrTask));

  var task;
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  // Handle both index and task object
  if (typeof taskIndexOrTask === 'number') {
    var tasks = getScheduleTasks();
    if (taskIndexOrTask < 0 || taskIndexOrTask >= tasks.length) {
      throw new Error('Invalid task index');
    }
    task = tasks[taskIndexOrTask];
  } else {
    task = taskIndexOrTask;
  }

  // Determine source if not provided
  var source = task.source;
  if (!source) {
    // Try to infer source from other properties
    if (task.isManualTask) {
      source = 'Manual Tasks';
    } else {
      source = 'To Do List'; // Default assumption
    }
    Logger.log('Source not provided, inferred as: ' + source);
  }

  Logger.log('markScheduleTaskComplete: source=' + source + ', rowIndex=' + task.rowIndex);

  if (!task.rowIndex) {
    Logger.log('ERROR: No rowIndex provided for task');
    throw new Error('Task rowIndex is required');
  }

  // Phase 3: Update Task Metadata first (single source of truth)
  if (source && task.rowIndex) {
    var taskKey = source + '_' + task.rowIndex;
    try {
      markTaskComplete(taskKey, { syncToSource: false }); // We'll update source below
      Logger.log('Updated Task Metadata for: ' + taskKey);
    } catch (metaErr) {
      Logger.log('Warning: Could not update Task Metadata: ' + metaErr);
      // Continue with source update
    }
  }

  var updated = false;

  if (source === 'Manual Tasks') {
    var manualSheet = ss.getSheetByName('Manual Tasks');
    if (manualSheet) {
      Logger.log('Marking Manual Tasks row ' + task.rowIndex + ' as Complete');

      // Find Status column dynamically
      var headers = manualSheet.getRange(1, 1, 1, manualSheet.getLastColumn()).getValues()[0];
      var statusCol = -1;
      for (var h = 0; h < headers.length; h++) {
        if (String(headers[h]).toLowerCase().trim() === 'status') {
          statusCol = h + 1; // Convert to 1-based
          break;
        }
      }

      if (statusCol > 0) {
        manualSheet.getRange(task.rowIndex, statusCol).setValue('Complete');
        Logger.log('Set Status to Complete in column ' + statusCol);
        updated = true;
      } else {
        // Fallback to column H (8) based on new structure
        manualSheet.getRange(task.rowIndex, 8).setValue('Complete');
        Logger.log('Set Status to Complete in column 8 (fallback)');
        updated = true;
      }
    } else {
      Logger.log('ERROR: Manual Tasks sheet not found');
    }
  } else if (source === 'Training Tracking') {
    var trainingSheet = ss.getSheetByName('Training Tracking');
    if (trainingSheet) {
      Logger.log('Marking Training Tracking row ' + task.rowIndex + ' as Complete');
      // Set status to Complete (column J = 10) and add completion date (column F = 6)
      trainingSheet.getRange(task.rowIndex, 10).setValue('Complete');
      trainingSheet.getRange(task.rowIndex, 6).setValue(new Date());
      updated = true;

      // Update Training Config completion status
      try {
        updateTrainingConfigCompletionStatus();
        Logger.log('Updated Training Config completion status');
      } catch (e) {
        Logger.log('Error updating Training Config: ' + e);
      }
    } else {
      Logger.log('ERROR: Training Tracking sheet not found');
    }
  } else if (source === 'To Do List' || !source) {
    // Handle To Do List tasks (from Smart Schedule) - this is the default
    var todoSheet = ss.getSheetByName('To Do List');
    if (todoSheet && task.rowIndex) {
      Logger.log('Marking To Do List row ' + task.rowIndex + ' as Complete');
      todoSheet.getRange(task.rowIndex, 12).setValue('Complete'); // Column L = Status
      updated = true;

      // If this is a training task, also update Training Tracking
      if (task.taskType && task.taskType.indexOf('Training') !== -1) {
        updateTrainingTrackingFromToDo(task);
      }
    } else {
      Logger.log('ERROR: To Do List sheet not found or no rowIndex');
    }
  } else {
    Logger.log('WARNING: Unrecognized source: ' + source + ', attempting To Do List');
    // Try To Do List as fallback
    var todoSheet = ss.getSheetByName('To Do List');
    if (todoSheet && task.rowIndex) {
      Logger.log('Marking To Do List row ' + task.rowIndex + ' as Complete (fallback)');
      todoSheet.getRange(task.rowIndex, 12).setValue('Complete');
      updated = true;
    }
  }

  Logger.log('markScheduleTaskComplete completed, updated=' + updated);
  return { success: updated };
}

/**
 * Updates Training Tracking sheet when a training task is completed from To Do List.
 * @param {Object} task - The completed task object
 */
function updateTrainingTrackingFromToDo(task) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var trainingSheet = ss.getSheetByName('Training Tracking');

  if (!trainingSheet || trainingSheet.getLastRow() < 3) return;

  var data = trainingSheet.getDataRange().getValues();

  // Try to find matching training record by crew and topic
  var crew = task.employee || task.crew || '';
  var topic = task.itemType || task.topic || ''; // itemType contains training topic

  for (var i = 2; i < data.length; i++) {
    var rowCrew = String(data[i][2] || '').trim();
    var rowTopic = String(data[i][1] || '').trim();
    var rowStatus = String(data[i][9] || '').trim();

    // Match by crew (could be crew lead name or crew number)
    var crewMatch = rowCrew === crew ||
                    String(data[i][3] || '').trim() === crew; // Check crew lead too

    // Match by topic (partial match)
    var topicMatch = rowTopic.indexOf(topic) !== -1 || topic.indexOf(rowTopic) !== -1;

    if (crewMatch && topicMatch && rowStatus !== 'Complete') {
      // Found matching incomplete training - mark it complete
      trainingSheet.getRange(i + 1, 10).setValue('Complete'); // Status
      trainingSheet.getRange(i + 1, 6).setValue(new Date()); // Completion Date
      Logger.log('Updated Training Tracking: row ' + (i + 1) + ' for crew ' + rowCrew);
      break;
    }
  }

  // Update Training Config completion status
  updateTrainingConfigCompletionStatus();
}

/**
 * Deletes a task from the To Do Schedule.
 * Works for Manual Tasks (deletes from sheet) and Task Metadata tasks (marks as deleted or removes).
 *
 * @param {number} taskIndex - Index of task in array
 * @param {string} taskKey - Optional: Task key in format "SourceSheet_RowIndex" for direct deletion
 */
function deleteScheduleTask(taskIndex, taskKey) {
  Logger.log('deleteScheduleTask: index=' + taskIndex + ', key=' + taskKey);

  var ss = SpreadsheetApp.getActiveSpreadsheet();

  // If taskKey is provided, use it for direct Task Metadata deletion
  if (taskKey) {
    var taskMetaSheet = ss.getSheetByName('Task Metadata');
    if (taskMetaSheet) {
      var data = taskMetaSheet.getDataRange().getValues();
      var headers = data[0];
      var taskKeyCol = -1;

      for (var h = 0; h < headers.length; h++) {
        if (String(headers[h]).toLowerCase() === 'taskkey') {
          taskKeyCol = h;
          break;
        }
      }

      if (taskKeyCol !== -1) {
        for (var i = data.length - 1; i >= 1; i--) {
          if (data[i][taskKeyCol] === taskKey) {
            taskMetaSheet.deleteRow(i + 1);
            Logger.log('Deleted task from Task Metadata: ' + taskKey);
            return { success: true, deleted: 'Task Metadata', key: taskKey };
          }
        }
      }
    }
  }

  var tasks = getScheduleTasks();
  if (taskIndex < 0 || taskIndex >= tasks.length) {
    throw new Error('Invalid task index');
  }

  var task = tasks[taskIndex];
  Logger.log('Task to delete: source=' + task.source + ', rowIndex=' + task.rowIndex);

  // Handle deletion based on source
  if (task.source === 'Manual Tasks') {
    var manualSheet = ss.getSheetByName('Manual Tasks');
    if (manualSheet && task.rowIndex) {
      manualSheet.deleteRow(task.rowIndex);
      Logger.log('Deleted from Manual Tasks sheet');
      return { success: true, deleted: 'Manual Tasks' };
    }
  } else if (task.source === 'Task Metadata' || task.taskKey) {
    // Delete from Task Metadata sheet
    var taskMetaSheet = ss.getSheetByName('Task Metadata');
    if (taskMetaSheet) {
      var data = taskMetaSheet.getDataRange().getValues();
      var headers = data[0];
      var taskKeyCol = -1;

      for (var h = 0; h < headers.length; h++) {
        if (String(headers[h]).toLowerCase() === 'taskkey') {
          taskKeyCol = h;
          break;
        }
      }

      // Try to find by taskKey first
      var keyToFind = task.taskKey || (task.source + '_' + task.rowIndex);
      if (taskKeyCol !== -1) {
        for (var i = data.length - 1; i >= 1; i--) {
          if (data[i][taskKeyCol] === keyToFind) {
            taskMetaSheet.deleteRow(i + 1);
            Logger.log('Deleted from Task Metadata by key: ' + keyToFind);
            return { success: true, deleted: 'Task Metadata', key: keyToFind };
          }
        }
      }

      // Fallback: delete by row index if we have it
      if (task.rowIndex && task.rowIndex > 1) {
        taskMetaSheet.deleteRow(task.rowIndex);
        Logger.log('Deleted from Task Metadata by rowIndex: ' + task.rowIndex);
        return { success: true, deleted: 'Task Metadata', rowIndex: task.rowIndex };
      }
    }
    throw new Error('Could not find task in Task Metadata to delete');
  } else {
    // For other sources (Glove Swaps, Sleeve Swaps, etc.), just remove from Task Metadata if present
    var taskMetaSheet = ss.getSheetByName('Task Metadata');
    if (taskMetaSheet && task.taskKey) {
      var data = taskMetaSheet.getDataRange().getValues();
      var headers = data[0];
      var taskKeyCol = -1;

      for (var h = 0; h < headers.length; h++) {
        if (String(headers[h]).toLowerCase() === 'taskkey') {
          taskKeyCol = h;
          break;
        }
      }

      if (taskKeyCol !== -1) {
        for (var i = data.length - 1; i >= 1; i--) {
          if (data[i][taskKeyCol] === task.taskKey) {
            taskMetaSheet.deleteRow(i + 1);
            Logger.log('Deleted from Task Metadata: ' + task.taskKey);
            return { success: true, deleted: 'Task Metadata', key: task.taskKey };
          }
        }
      }
    }

    // If we can't delete from Task Metadata, inform the user
    throw new Error('Cannot delete this task type (' + task.source + '). Please delete it from the source sheet or Task Metadata directly.');
  }

  return { success: true };
}

/**
 * Gets the To Do configuration settings.
 *
 * @return {Object} Configuration object
 */
function getToDoConfig() {
  var props = PropertiesService.getScriptProperties();
  var configStr = props.getProperty('TODO_CONFIG');

  if (configStr) {
    try {
      return JSON.parse(configStr);
    } catch (e) {
      Logger.log('Error parsing TODO_CONFIG: ' + e);
    }
  }

  // Default configuration
  return {
    workStartTime: '07:00',
    workEndTime: '17:00',
    defaultDuration: 1,
    bufferTime: 15,
    highPriorityDays: 3,
    mediumPriorityDays: 7,
    lowPriorityDays: 14,
    enableEmailNotifications: true,
    dailyDigest: true,
    digestTime: '07:00',
    reminderMinutes: 30,
    workingDays: ['mon', 'tue', 'wed', 'thu', 'fri']
  };
}

/**
 * Saves the To Do configuration settings.
 *
 * @param {Object} config - Configuration object to save
 */
function saveToDoConfig(config) {
  Logger.log('saveToDoConfig: ' + JSON.stringify(config));
  var props = PropertiesService.getScriptProperties();
  props.setProperty('TODO_CONFIG', JSON.stringify(config));

  // Also save locations to a separate property
  if (config.locations) {
    props.setProperty('TODO_LOCATIONS', JSON.stringify(config.locations));
  }

  return { success: true };
}

/**
 * Gets the configured locations for scheduling.
 *
 * @return {Array} Array of location names
 */
function getConfiguredLocations() {
  // Primary source: Location column from Employees sheet
  // This ensures all crew locations are automatically included
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var employeesSheet = ss.getSheetByName('Employees');
  var allLocations = {};

  // Essential base locations that should ALWAYS be available
  // (these are physical/operational locations that may not have employees)
  var essentialLocations = [
    'Helena'  // Home base - always needed
  ];

  // Locations to EXCLUDE (not real crew/inventory locations)
  var excludeLocations = [
    'Previous Employee',
    'Destroyed',
    'N/A',
    ''
  ];

  // Patterns to exclude (e.g., personal trucks)
  var excludePatterns = [
    /cody/i,           // Cody's Truck, etc.
    /^packed/i,        // Packed for Delivery, Packed for Testing
    /^not repair/i,    // Not Repairable
    /^failed/i         // Failed Rubber
  ];

  // Add essential locations first
  essentialLocations.forEach(function(loc) {
    allLocations[loc] = true;
  });

  // Pull locations from Employees sheet
  if (employeesSheet && employeesSheet.getLastRow() > 1) {
    var headers = employeesSheet.getRange(1, 1, 1, employeesSheet.getLastColumn()).getValues()[0];
    var locationCol = -1;

    for (var i = 0; i < headers.length; i++) {
      if (String(headers[i]).toLowerCase().trim() === 'location') {
        locationCol = i + 1;
        break;
      }
    }

    if (locationCol > 0) {
      var locationData = employeesSheet.getRange(2, locationCol, employeesSheet.getLastRow() - 1, 1).getValues();

      for (var j = 0; j < locationData.length; j++) {
        var loc = String(locationData[j][0]).trim();

        // Skip if in exclude list
        if (excludeLocations.indexOf(loc) !== -1) continue;

        // Skip if matches exclude pattern
        var skipPattern = false;
        for (var p = 0; p < excludePatterns.length; p++) {
          if (excludePatterns[p].test(loc)) {
            skipPattern = true;
            break;
          }
        }
        if (skipPattern) continue;

        // Add valid location
        if (loc) {
          allLocations[loc] = true;
        }
      }
    }
  }

  // Return sorted unique locations
  return Object.keys(allLocations).sort();
}

/**
 * Sets up the Expiring Certs sheet to track items with expiring certifications.
 * Scans Gloves and Sleeves sheets for items approaching cert expiration.
 */
function setupExpiringCertsSheet() {
  Logger.log('=== setupExpiringCertsSheet START ===');
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var ui = SpreadsheetApp.getUi();

  // Create or get Expiring Certs sheet
  var expiringSheet = ss.getSheetByName('Expiring Certs');
  if (!expiringSheet) {
    expiringSheet = ss.insertSheet('Expiring Certs');
    Logger.log('Created new Expiring Certs sheet');
  }

  // Clear and set up headers
  expiringSheet.clear();
  var headers = ['Item #', 'Expiration Date', 'Employee', 'Location', 'Item Type', 'Class', 'Days Until Expiration', 'Status'];
  expiringSheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  expiringSheet.getRange(1, 1, 1, headers.length)
    .setBackground('#1a73e8')
    .setFontColor('#ffffff')
    .setFontWeight('bold');
  expiringSheet.setFrozenRows(1);

  var expiringItems = [];
  var today = new Date();
  var warningDays = 60; // Items expiring within 60 days

  // Scan Gloves sheet
  var glovesSheet = ss.getSheetByName('Gloves');
  if (glovesSheet && glovesSheet.getLastRow() > 1) {
    var gloveData = glovesSheet.getDataRange().getValues();
    var gloveHeaders = gloveData[0];

    // Find columns
    var gCols = { item: -1, exp: -1, employee: -1, location: -1, class: -1 };
    for (var h = 0; h < gloveHeaders.length; h++) {
      var header = String(gloveHeaders[h]).toLowerCase().trim();
      if (header === 'item #' || header === 'item') gCols.item = h;
      if (header.indexOf('expir') !== -1 || header.indexOf('cert') !== -1) gCols.exp = h;
      if (header === 'employee' || header === 'assigned to') gCols.employee = h;
      if (header === 'location') gCols.location = h;
      if (header === 'class') gCols.class = h;
    }

    for (var g = 1; g < gloveData.length; g++) {
      var gRow = gloveData[g];
      var itemNum = gRow[gCols.item];
      var expDate = gCols.exp !== -1 ? gRow[gCols.exp] : null;

      if (itemNum && expDate) {
        var expDateObj = new Date(expDate);
        if (!isNaN(expDateObj.getTime())) {
          var daysUntil = Math.ceil((expDateObj - today) / (1000 * 60 * 60 * 24));
          if (daysUntil <= warningDays) {
            var status = daysUntil < 0 ? 'EXPIRED' : daysUntil <= 7 ? 'CRITICAL' : daysUntil <= 30 ? 'WARNING' : 'UPCOMING';
            expiringItems.push([
              itemNum,
              expDate,
              gCols.employee !== -1 ? gRow[gCols.employee] : '',
              gCols.location !== -1 ? gRow[gCols.location] : 'Helena',
              'Glove',
              gCols.class !== -1 ? gRow[gCols.class] : '',
              daysUntil,
              status
            ]);
          }
        }
      }
    }
  }

  // Scan Sleeves sheet
  var sleevesSheet = ss.getSheetByName('Sleeves');
  if (sleevesSheet && sleevesSheet.getLastRow() > 1) {
    var sleeveData = sleevesSheet.getDataRange().getValues();
    var sleeveHeaders = sleeveData[0];

    // Find columns
    var sCols = { item: -1, exp: -1, employee: -1, location: -1, class: -1 };
    for (var sh = 0; sh < sleeveHeaders.length; sh++) {
      var sHeader = String(sleeveHeaders[sh]).toLowerCase().trim();
      if (sHeader === 'item #' || sHeader === 'item') sCols.item = sh;
      if (sHeader.indexOf('expir') !== -1 || sHeader.indexOf('cert') !== -1) sCols.exp = sh;
      if (sHeader === 'employee' || sHeader === 'assigned to') sCols.employee = sh;
      if (sHeader === 'location') sCols.location = sh;
      if (sHeader === 'class') sCols.class = sh;
    }

    for (var s = 1; s < sleeveData.length; s++) {
      var sRow = sleeveData[s];
      var sItemNum = sRow[sCols.item];
      var sExpDate = sCols.exp !== -1 ? sRow[sCols.exp] : null;

      if (sItemNum && sExpDate) {
        var sExpDateObj = new Date(sExpDate);
        if (!isNaN(sExpDateObj.getTime())) {
          var sDaysUntil = Math.ceil((sExpDateObj - today) / (1000 * 60 * 60 * 24));
          if (sDaysUntil <= warningDays) {
            var sStatus = sDaysUntil < 0 ? 'EXPIRED' : sDaysUntil <= 7 ? 'CRITICAL' : sDaysUntil <= 30 ? 'WARNING' : 'UPCOMING';
            expiringItems.push([
              sItemNum,
              sExpDate,
              sCols.employee !== -1 ? sRow[sCols.employee] : '',
              sCols.location !== -1 ? sRow[sCols.location] : 'Helena',
              'Sleeve',
              sCols.class !== -1 ? sRow[sCols.class] : '',
              sDaysUntil,
              sStatus
            ]);
          }
        }
      }
    }
  }

  // Sort by days until expiration (soonest first)
  expiringItems.sort(function(a, b) { return a[6] - b[6]; });

  // Write data
  if (expiringItems.length > 0) {
    expiringSheet.getRange(2, 1, expiringItems.length, headers.length).setValues(expiringItems);

    // Apply conditional formatting
    var dataRange = expiringSheet.getRange(2, 8, expiringItems.length, 1); // Status column
    var rules = expiringSheet.getConditionalFormatRules();

    // EXPIRED - red
    rules.push(SpreadsheetApp.newConditionalFormatRule()
      .whenTextEqualTo('EXPIRED')
      .setBackground('#ea4335')
      .setFontColor('#ffffff')
      .setRanges([dataRange])
      .build());

    // CRITICAL - orange
    rules.push(SpreadsheetApp.newConditionalFormatRule()
      .whenTextEqualTo('CRITICAL')
      .setBackground('#ff6d00')
      .setFontColor('#ffffff')
      .setRanges([dataRange])
      .build());

    // WARNING - yellow
    rules.push(SpreadsheetApp.newConditionalFormatRule()
      .whenTextEqualTo('WARNING')
      .setBackground('#fbbc04')
      .setFontColor('#000000')
      .setRanges([dataRange])
      .build());

    // UPCOMING - blue
    rules.push(SpreadsheetApp.newConditionalFormatRule()
      .whenTextEqualTo('UPCOMING')
      .setBackground('#4285f4')
      .setFontColor('#ffffff')
      .setRanges([dataRange])
      .build());

    expiringSheet.setConditionalFormatRules(rules);

    // Format date column
    expiringSheet.getRange(2, 2, expiringItems.length, 1).setNumberFormat('MM/dd/yyyy');

    // Auto-resize columns
    for (var col = 1; col <= headers.length; col++) {
      expiringSheet.autoResizeColumn(col);
    }

    Logger.log('Found ' + expiringItems.length + ' items with expiring certifications');
    ui.alert('✅ Expiring Certs Updated', 'Found ' + expiringItems.length + ' items expiring within 60 days.\n\n' +
      '🔴 EXPIRED: ' + expiringItems.filter(function(i) { return i[7] === 'EXPIRED'; }).length + '\n' +
      '🟠 CRITICAL (≤7 days): ' + expiringItems.filter(function(i) { return i[7] === 'CRITICAL'; }).length + '\n' +
      '🟡 WARNING (≤30 days): ' + expiringItems.filter(function(i) { return i[7] === 'WARNING'; }).length + '\n' +
      '🔵 UPCOMING (≤60 days): ' + expiringItems.filter(function(i) { return i[7] === 'UPCOMING'; }).length,
      ui.ButtonSet.OK);
  } else {
    expiringSheet.getRange(2, 1).setValue('No items with expiring certifications found within 60 days.');
    ui.alert('✅ Expiring Certs Updated', 'No items found with certifications expiring within 60 days.', ui.ButtonSet.OK);
  }

  Logger.log('=== setupExpiringCertsSheet END ===');
}

// ============================================================================
// EXPIRING CERTS IMPORT WORKFLOW FUNCTIONS
// ============================================================================

/**
 * Shows the choice dialog for managing certifications (import or refresh).
 */
function showExpiringCertsChoiceDialog() {
  var html = HtmlService.createHtmlOutputFromFile('ExpiringCertsChoice')
    .setWidth(1000)
    .setHeight(700);
  SpreadsheetApp.getUi().showModalDialog(html, '📜 Manage Certifications');
}

/**
 * Shows the Excel import dialog for certifications.
 */
function showExpiringCertsImportDialog() {
  var html = HtmlService.createHtmlOutputFromFile('ExpiringCertsImport')
    .setWidth(1400)
    .setHeight(900);
  SpreadsheetApp.getUi().showModalDialog(html, '📤 Import Certifications');
}

/**
 * Gets certification type defaults including non-expiring certs and default checked certs.
 * @return {Object} Configuration object with cert types, defaults, and mappings
 */
function getCertTypeDefaults() {
  var allCertTypes = [
    'DL',
    'MEC Expiration',
    '1st Aid',
    'CPR',
    'Crane Cert',
    'Crane Evaluation',
    'OSHA 1910',
    'BNSF',
    'MSHA',
    'OSHA Trench Comp Person',
    'Forklift',
    'Forklift Operator Safety Training',
    'Rigging & Signaling/Signalperson & Spotter Cert',
    'Harassment Training',
    'EICA Basic Helicopter Line Construction Safety'
  ];

  var nonExpiring = [
    'Crane Evaluation',
    'OSHA 1910',
    'BNSF',
    'MSHA',
    'EICA Basic Helicopter Line Construction Safety'
  ];

  var defaultChecked = [
    'DL',
    'MEC Expiration',
    '1st Aid',
    'CPR',
    'Crane Cert',
    'Harassment Training'
  ];

  var defaultMapping = {
    'D': 'DL',
    'E': 'MEC Expiration',
    'F': '1st Aid',
    'G': 'CPR',
    'H': 'Crane Cert',
    'I': 'Crane Evaluation',
    'J': 'OSHA 1910',
    'K': 'BNSF',
    'L': 'MSHA',
    'M': 'OSHA Trench Comp Person',
    'N': 'Forklift',
    'O': 'Forklift Operator Safety Training',
    'P': 'Rigging & Signaling/Signalperson & Spotter Cert',
    'Q': 'Harassment Training',
    'R': 'EICA Basic Helicopter Line Construction Safety'
  };

  return {
    allCertTypes: allCertTypes,
    nonExpiring: nonExpiring,
    defaultChecked: defaultChecked,
    defaultMapping: defaultMapping
  };
}

/**
 * Gets employee names and data for fuzzy matching during import.
 * @return {Array} Array of employee objects with name and metadata
 */
function getEmployeeNamesForMatching() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var employeesSheet = ss.getSheetByName(SHEET_EMPLOYEES);
  var employees = [];

  // ===== PART 1: Read from Employees sheet (active employees) =====
  if (employeesSheet && employeesSheet.getLastRow() >= 2) {
    var data = employeesSheet.getDataRange().getValues();
    var headers = data[0];

    // Find column indices
    var nameCol = 0;
    var locationCol = -1;
    var jobNumCol = -1;
    var classCol = -1;
    var gloveSizeCol = -1;
    var sleeveSizeCol = -1;
    var jobClassificationCol = -1;

    for (var h = 0; h < headers.length; h++) {
      var header = String(headers[h]).toLowerCase().trim();
      if (header === 'location') locationCol = h;
      if (header === 'job number') jobNumCol = h;
      if (header === 'class') classCol = h;
      if (header === 'glove size') gloveSizeCol = h;
      if (header === 'sleeve size') sleeveSizeCol = h;
      if (header === 'job classification') jobClassificationCol = h;
    }

    for (var i = 1; i < data.length; i++) {
      var row = data[i];
      if (row[nameCol]) {
        var location = locationCol !== -1 ? String(row[locationCol] || '') : '';
        // Include all employees, even "Previous Employee" (they may be on crew temporarily)
        employees.push({
          name: String(row[nameCol]),
          location: location,
          jobNum: jobNumCol !== -1 ? String(row[jobNumCol] || '') : '',
          class: classCol !== -1 ? row[classCol] : '',
          gloveSize: gloveSizeCol !== -1 ? row[gloveSizeCol] : '',
          sleeveSize: sleeveSizeCol !== -1 ? row[sleeveSizeCol] : '',
          jobClassification: jobClassificationCol !== -1 ? String(row[jobClassificationCol] || '') : '',
          rowIndex: i + 1,
          source: 'Employees'
        });
      }
    }
  }

  // ===== PART 2: Read from Employee History (terminated employees) =====
  var historySheet = ss.getSheetByName('Employee History');
  if (historySheet && historySheet.getLastRow() >= 3) {
    var histData = historySheet.getDataRange().getValues();
    var histHeaders = histData[0];

    // Find column indices in Employee History
    var histNameCol = -1;
    var histDateCol = -1;
    var histLocationCol = -1;
    var histJobNumCol = -1;
    var histLastDayCol = -1;
    var histLastDayReasonCol = -1;

    for (var hh = 0; hh < histHeaders.length; hh++) {
      var histHeader = String(histHeaders[hh]).toLowerCase().trim();
      if (histHeader === 'employee name') histNameCol = hh;
      if (histHeader === 'date') histDateCol = hh;
      if (histHeader === 'location') histLocationCol = hh;
      if (histHeader === 'job number') histJobNumCol = hh;
      if (histHeader === 'last day') histLastDayCol = hh;
      if (histHeader === 'last day reason') histLastDayReasonCol = hh;
    }

    if (histNameCol === -1 || histDateCol === -1) {
      Logger.log('getEmployeeNamesForMatching: Could not find required columns in Employee History');
    } else {
      // Group all entries by employee name
      var employeeEntries = {};

      for (var hi = 2; hi < histData.length; hi++) {
        var histRow = histData[hi];
        var empName = String(histRow[histNameCol] || '').trim();
        var entryDate = histRow[histDateCol];

        if (!empName) continue;

        var empKey = empName.toLowerCase();
        if (!employeeEntries[empKey]) {
          employeeEntries[empKey] = [];
        }

        employeeEntries[empKey].push({
          name: empName,
          date: entryDate,
          lastDay: histLastDayCol !== -1 ? String(histRow[histLastDayCol] || '').trim() : '',
          lastDayReason: histLastDayReasonCol !== -1 ? String(histRow[histLastDayReasonCol] || '').trim() : '',
          location: histLocationCol !== -1 ? String(histRow[histLocationCol] || '').trim() : ''
        });
      }

      // For each employee, find the most recent entry and check if it's a termination
      var terminatedEmployees = {};

      for (var empKey in employeeEntries) {
        var entries = employeeEntries[empKey];

        // Find most recent entry by Date
        var mostRecentEntry = null;
        var mostRecentDate = null;

        for (var ei = 0; ei < entries.length; ei++) {
          var entry = entries[ei];
          var entryDate = entry.date;

          // Parse date for comparison
          var parsedDate = null;
          if (entryDate instanceof Date) {
            parsedDate = entryDate;
          } else if (entryDate) {
            parsedDate = new Date(entryDate);
          }

          if (parsedDate && !isNaN(parsedDate.getTime())) {
            if (!mostRecentDate || parsedDate > mostRecentDate) {
              mostRecentDate = parsedDate;
              mostRecentEntry = entry;
            }
          }
        }

        // Check if most recent entry is a termination (has Last Day + Last Day Reason)
        if (mostRecentEntry && mostRecentEntry.lastDay && mostRecentEntry.lastDayReason) {
          terminatedEmployees[empKey] = {
            name: mostRecentEntry.name,
            location: 'Previous Employee',
            jobNum: '',
            class: '',
            gloveSize: '',
            sleeveSize: '',
            jobClassification: '',
            rowIndex: -1, // No row index (not on Employees sheet)
            source: 'Employee History',
            lastDay: mostRecentEntry.lastDay,
            lastDayReason: mostRecentEntry.lastDayReason
          };
        }
      }

      // Add terminated employees to the list
      for (var termKey in terminatedEmployees) {
        employees.push(terminatedEmployees[termKey]);
      }

      Logger.log('getEmployeeNamesForMatching: Found ' + Object.keys(terminatedEmployees).length + ' terminated employees in Employee History');
    }
  }

  Logger.log('getEmployeeNamesForMatching: Returning ' + employees.length + ' total employees');
  return employees;
}

/**
 * Updates an employee's name on the Employees sheet and logs to Employee History.
 * Called when user confirms a name correction during Excel import.
 *
 * @param {string} oldName - The old/incorrect name (what's in Excel)
 * @param {string} newName - The correct name to update to (from Employees sheet match)
 * @return {Object} Result with success status and message
 */
function updateEmployeeNameOnSheet(oldName, newName) {
  try {
    Logger.log('updateEmployeeNameOnSheet: Updating "' + oldName + '" to "' + newName + '"');

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var employeesSheet = ss.getSheetByName(SHEET_EMPLOYEES);

    if (!employeesSheet) {
      return {
        success: false,
        message: 'Employees sheet not found'
      };
    }

    var data = employeesSheet.getDataRange().getValues();
    var nameCol = 0; // Name is always column A
    var locationCol = -1;
    var jobNumCol = -1;
    var headers = data[0];

    // Find column indices
    for (var h = 0; h < headers.length; h++) {
      var header = String(headers[h]).toLowerCase().trim();
      if (header === 'location') locationCol = h;
      if (header === 'job number') jobNumCol = h;
    }

    // Find the row with the matching name (case-insensitive)
    var targetRow = -1;
    var location = '';
    var jobNumber = '';
    var newNameLower = newName.toLowerCase().trim();

    for (var i = 1; i < data.length; i++) {
      var rowName = String(data[i][nameCol] || '').toLowerCase().trim();
      if (rowName === newNameLower) {
        targetRow = i + 1; // 1-based row number
        location = locationCol !== -1 ? data[i][locationCol] : '';
        jobNumber = jobNumCol !== -1 ? data[i][jobNumCol] : '';
        break;
      }
    }

    if (targetRow === -1) {
      // The "newName" should be the one that already exists, but if not found,
      // this means we're updating FROM an existing employee TO the Excel name
      // Let's search for the oldName instead
      var oldNameLower = oldName.toLowerCase().trim();
      for (var j = 1; j < data.length; j++) {
        var rowName2 = String(data[j][nameCol] || '').toLowerCase().trim();
        if (rowName2 === oldNameLower) {
          targetRow = j + 1;
          location = locationCol !== -1 ? data[j][locationCol] : '';
          jobNumber = jobNumCol !== -1 ? data[j][jobNumCol] : '';
          break;
        }
      }

      if (targetRow === -1) {
        return {
          success: false,
          message: 'Employee not found on Employees sheet: "' + oldName + '" or "' + newName + '"'
        };
      }

      // Update the name cell to the new name
      employeesSheet.getRange(targetRow, nameCol + 1).setValue(newName);

      // Log to Employee History
      logNameCorrection(oldName, newName, location, jobNumber);

      Logger.log('updateEmployeeNameOnSheet: Updated row ' + targetRow + ' from "' + oldName + '" to "' + newName + '"');

      return {
        success: true,
        message: 'Updated employee name from "' + oldName + '" to "' + newName + '"',
        updatedRow: targetRow
      };
    }

    // If we found by newName, that means newName already exists - no update needed
    // Just log that we're associating oldName (Excel) with newName (Employees sheet)
    Logger.log('updateEmployeeNameOnSheet: Employee "' + newName + '" already exists at row ' + targetRow + ', no update needed');

    return {
      success: true,
      message: 'Employee "' + newName + '" found (Excel had: "' + oldName + '")',
      matchedRow: targetRow,
      noUpdateNeeded: true
    };

  } catch (e) {
    Logger.log('updateEmployeeNameOnSheet ERROR: ' + e.toString());
    return {
      success: false,
      message: 'Error updating employee: ' + e.toString()
    };
  }
}

/**
 * Parses Excel certification data with multiple rows per employee (one per cert type).
 * @param {string} pastedText - Tab-separated Excel data
 * @param {Object} columnMapping - Mapping of column letters to cert types
 * @return {Object} Parsed certification data with employee matches and summary
 */
function parseExcelCertDataMultiRow(pastedText, columnMapping) {
  Logger.log('=== parseExcelCertDataMultiRow START ===');

  var nonExpiring = [
    'Crane Evaluation',
    'OSHA 1910',
    'BNSF',
    'MSHA',
    'EICA Basic Helicopter Line Construction Safety'
  ];

  // Header keywords to skip - these are not employee names
  var headerKeywords = [
    'name', 'expires', 'job #', 'job#', 'location', 'issued', 'eval date',
    'about to expire', 'expired', 'driver', 'license', 'medical', 'card',
    '1st aid', 'cpr', 'crane cert', 'crane evaluation', 'osha', 'bnsf',
    'msha', 'forklift', 'rigging', 'harassment', 'eica', 'helicopter'
  ];

  var lines = pastedText.split('\n');
  var certRows = [];
  var uniqueEmployees = {};
  var validationWarnings = [];
  var priorityCount = 0;
  var nonExpiringCount = 0;
  var certTypeCounts = {};
  var skippedHeaders = 0;

  for (var i = 0; i < lines.length; i++) {
    var line = lines[i].trim();
    if (!line) continue;

    var cells = line.split('\t');
    if (cells.length < 3) {
      validationWarnings.push('Row ' + (i + 1) + ': Insufficient columns');
      continue;
    }

    // Column A: Name (convert "LastName, FirstName" to "FirstName LastName")
    var excelName = String(cells[0] || '').trim();
    if (!excelName) continue;

    // Skip header rows - check if the name looks like a header keyword
    var nameLower = excelName.toLowerCase();
    var isHeader = false;
    for (var h = 0; h < headerKeywords.length; h++) {
      if (nameLower === headerKeywords[h] || nameLower.indexOf(headerKeywords[h]) === 0) {
        isHeader = true;
        break;
      }
    }

    // Also skip if the "name" doesn't look like a person's name (no comma for "Last, First" format)
    // and it's a single word that matches common headers
    if (!isHeader && excelName.indexOf(',') === -1) {
      var singleWordHeaders = ['name', 'expires', 'issued', 'location'];
      if (singleWordHeaders.indexOf(nameLower) !== -1) {
        isHeader = true;
      }
    }

    if (isHeader) {
      skippedHeaders++;
      Logger.log('Skipping header row: ' + excelName);
      continue;
    }

    var convertedName = excelName.replace(/^([^,]+),\s*(.+)$/, '$2 $1').trim();

    // Column B: Job #, Column C: Location
    var excelJobNum = String(cells[1] || '').trim();
    var excelLocation = String(cells[2] || '').trim();

    uniqueEmployees[convertedName] = true;

    // Iterate through certification columns D-R (indices 3-17)
    var columns = ['D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R'];
    for (var c = 0; c < columns.length && (c + 3) < cells.length; c++) {
      var cellValue = String(cells[c + 3] || '').trim();
      if (!cellValue) continue;

      var certType = columnMapping[columns[c]];
      if (!certType) continue;

      var isNonExpiring = nonExpiring.indexOf(certType) !== -1;
      var isPriority = false;
      var expirationDate = null;

      // Check for "Need Copy"
      if (cellValue.toLowerCase().indexOf('need copy') !== -1) {
        isPriority = true;
        priorityCount++;
      } else if (isNonExpiring) {
        // Non-expiring cert - ignore date value
        nonExpiringCount++;
      } else {
        // Parse date from "M.D.YY" or "MM.DD.YY" format
        var dateMatch = cellValue.match(/(\d{1,2})\.(\d{1,2})\.(\d{2})/);
        if (dateMatch) {
          var month = String(dateMatch[1]).padStart(2, '0');
          var day = String(dateMatch[2]).padStart(2, '0');
          var year = '20' + dateMatch[3];
          expirationDate = month + '/' + day + '/' + year;
        }
      }

      certRows.push({
        excelName: excelName,
        convertedName: convertedName,
        certType: certType,
        expirationDate: expirationDate,
        isPriority: isPriority,
        isNonExpiring: isNonExpiring,
        excelJobNum: excelJobNum,
        excelLocation: excelLocation
      });

      certTypeCounts[certType] = (certTypeCounts[certType] || 0) + 1;
    }
  }

  // Fuzzy match employees
  var employees = getEmployeeNamesForMatching();
  var employeeMatches = [];
  var employeeNames = Object.keys(uniqueEmployees);

  for (var e = 0; e < employeeNames.length; e++) {
    var empName = employeeNames[e];
    var match = fuzzyMatchEmployeeName(empName, employees);

    var certCount = certRows.filter(function(r) { return r.convertedName === empName; }).length;

    employeeMatches.push({
      excelName: empName,
      matchedName: match ? match.employeeName : null,
      confidence: match ? match.confidence : 0,
      certCount: certCount,
      isPreviousEmployee: match ? match.isPreviousEmployee : false,
      suggestions: match ? match.suggestions : [],
      matchType: match ? match.matchType : null
    });
  }

  Logger.log('Parsed ' + certRows.length + ' certification rows from ' + employeeNames.length + ' employees (skipped ' + skippedHeaders + ' header rows)');

  return {
    certRows: certRows,
    employeeMatches: employeeMatches,
    summary: {
      totalEmployees: employeeNames.length,
      totalCerts: certRows.length,
      priorityCount: priorityCount,
      nonExpiringCount: nonExpiringCount,
      certTypeCounts: certTypeCounts,
      validationWarnings: validationWarnings
    }
  };
}

/**
 * Fuzzy matches an employee name against the employee list using Levenshtein distance.
 * @param {string} convertedName - Name to match
 * @param {Array} employeeList - List of employee objects
 * @return {Object} Match result with confidence and suggestions
 */
function fuzzyMatchEmployeeName(convertedName, employeeList) {
  if (!convertedName || !employeeList || employeeList.length === 0) {
    return null;
  }

  var normalized = convertedName.toLowerCase().trim().replace(/\s+/g, ' ');
  var matches = [];

  for (var i = 0; i < employeeList.length; i++) {
    var emp = employeeList[i];
    var empNormalized = emp.name.toLowerCase().trim().replace(/\s+/g, ' ');

    // Exact match
    if (normalized === empNormalized) {
      return {
        employeeName: emp.name,
        confidence: 100,
        employeeData: emp,
        suggestions: [],
        matchType: 'exact'
      };
    }

    // Check for reversed name
    var parts1 = normalized.split(' ');
    var parts2 = empNormalized.split(' ');
    if (parts1.length === 2 && parts2.length === 2) {
      if (parts1[0] === parts2[1] && parts1[1] === parts2[0]) {
        matches.push({
          employeeName: emp.name,
          confidence: 98,
          employeeData: emp,
          matchType: 'reversed'
        });
        continue;
      }
    }

    // Substring/nickname match
    if (normalized.indexOf(empNormalized) !== -1 || empNormalized.indexOf(normalized) !== -1) {
      matches.push({
        employeeName: emp.name,
        confidence: 90,
        employeeData: emp,
        matchType: 'substring'
      });
      continue;
    }

    // Calculate Levenshtein similarity
    var distance = levenshteinDistance(normalized, empNormalized);
    var maxLen = Math.max(normalized.length, empNormalized.length);
    var levenshteinSimilarity = (1 - distance / maxLen) * 100;

    // Calculate Metaphone (phonetic) similarity
    var phoneticSimilarity = metaphoneNameSimilarity(normalized, empNormalized);

    // Combine scores: use weighted average if both have matches
    // Phonetic matching helps catch spelling variants like "Massen" vs "Masen"
    var combinedScore = levenshteinSimilarity;
    var matchType = 'levenshtein';

    if (phoneticSimilarity > 0) {
      // If phonetic match is strong, boost the score
      if (phoneticSimilarity >= 90) {
        // Strong phonetic match - boost significantly
        combinedScore = Math.max(levenshteinSimilarity, phoneticSimilarity * 0.95);
        matchType = 'phonetic';
      } else if (phoneticSimilarity >= 75) {
        // Moderate phonetic match - use weighted average
        combinedScore = (levenshteinSimilarity * 0.6) + (phoneticSimilarity * 0.4);
        matchType = 'combined';
      }
      // For weak phonetic matches, stick with Levenshtein
    }

    // Lower threshold to 60% to catch more potential matches for user review
    if (combinedScore >= 60) {
      matches.push({
        employeeName: emp.name,
        confidence: Math.round(combinedScore),
        employeeData: emp,
        matchType: matchType,
        phoneticScore: Math.round(phoneticSimilarity),
        levenshteinScore: Math.round(levenshteinSimilarity)
      });
    }
  }

  // Sort by confidence descending
  matches.sort(function(a, b) { return b.confidence - a.confidence; });

  if (matches.length === 0) {
    return null;
  }

  var topMatch = matches[0];
  var suggestions = matches.slice(0, 5).map(function(m) {
    return {
      name: m.employeeName,
      confidence: m.confidence,
      isPreviousEmployee: m.employeeData.isPreviousEmployee || false,
      lastDay: m.employeeData.lastDay || null,
      matchType: m.matchType,
      phoneticScore: m.phoneticScore,
      levenshteinScore: m.levenshteinScore
    };
  });

  return {
    employeeName: topMatch.employeeName,
    confidence: topMatch.confidence,
    employeeData: topMatch.employeeData,
    isPreviousEmployee: topMatch.employeeData.isPreviousEmployee || false,
    suggestions: suggestions,
    matchType: topMatch.matchType
  };
}

/**
 * Calculates Levenshtein distance between two strings.
 * @param {string} str1 - First string
 * @param {string} str2 - Second string
 * @return {number} Edit distance
 */
function levenshteinDistance(str1, str2) {
  var len1 = str1.length;
  var len2 = str2.length;
  var matrix = [];

  // Initialize matrix
  for (var i = 0; i <= len1; i++) {
    matrix[i] = [i];
  }
  for (var j = 0; j <= len2; j++) {
    matrix[0][j] = j;
  }

  // Fill matrix
  for (var i = 1; i <= len1; i++) {
    for (var j = 1; j <= len2; j++) {
      var cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,      // deletion
        matrix[i][j - 1] + 1,      // insertion
        matrix[i - 1][j - 1] + cost // substitution
      );
    }
  }

  return matrix[len1][len2];
}

/**
 * Double Metaphone algorithm for phonetic matching.
 * Returns primary and secondary phonetic codes for a string.
 * Based on Lawrence Philips' Double Metaphone algorithm.
 * @param {string} str - String to encode
 * @return {Object} Object with primary and secondary codes
 */
function doubleMetaphone(str) {
  if (!str || typeof str !== 'string') {
    return { primary: '', secondary: '' };
  }

  var primary = '';
  var secondary = '';
  var current = 0;
  var length = str.length;
  var last = length - 1;
  var original = (str.toUpperCase() + '     ').split('');

  // Helper functions
  function isVowel(c) {
    return 'AEIOU'.indexOf(c) !== -1;
  }

  function slavoGermanic() {
    return str.indexOf('W') !== -1 || str.indexOf('K') !== -1 ||
           str.indexOf('CZ') !== -1 || str.indexOf('WITZ') !== -1;
  }

  function charAt(pos) {
    return original[pos] || '';
  }

  function stringAt(start, len, list) {
    if (start < 0) return false;
    var target = original.slice(start, start + len).join('');
    return list.indexOf(target) !== -1;
  }

  // Skip initial silent letters
  if (stringAt(0, 2, ['GN', 'KN', 'PN', 'WR', 'PS'])) {
    current++;
  }

  // Initial X is pronounced Z
  if (charAt(0) === 'X') {
    primary += 'S';
    secondary += 'S';
    current++;
  }

  while (current < length) {
    var c = charAt(current);

    switch (c) {
      case 'A':
      case 'E':
      case 'I':
      case 'O':
      case 'U':
      case 'Y':
        if (current === 0) {
          primary += 'A';
          secondary += 'A';
        }
        current++;
        break;

      case 'B':
        primary += 'P';
        secondary += 'P';
        current += (charAt(current + 1) === 'B') ? 2 : 1;
        break;

      case 'C':
        if (stringAt(current, 2, ['CH'])) {
          primary += 'X';
          secondary += 'X';
          current += 2;
        } else if (stringAt(current, 2, ['CI', 'CE', 'CY'])) {
          primary += 'S';
          secondary += 'S';
          current += 2;
        } else {
          primary += 'K';
          secondary += 'K';
          current += (stringAt(current, 2, ['CK', 'CQ', 'CZ'])) ? 2 : 1;
        }
        break;

      case 'D':
        if (stringAt(current, 2, ['DG'])) {
          if (stringAt(current + 2, 1, ['I', 'E', 'Y'])) {
            primary += 'J';
            secondary += 'J';
            current += 3;
          } else {
            primary += 'TK';
            secondary += 'TK';
            current += 2;
          }
        } else {
          primary += 'T';
          secondary += 'T';
          current += (stringAt(current, 2, ['DT', 'DD'])) ? 2 : 1;
        }
        break;

      case 'F':
        primary += 'F';
        secondary += 'F';
        current += (charAt(current + 1) === 'F') ? 2 : 1;
        break;

      case 'G':
        if (charAt(current + 1) === 'H') {
          if (current > 0 && !isVowel(charAt(current - 1))) {
            current += 2;
            break;
          }
          if (current === 0) {
            if (charAt(current + 2) === 'I') {
              primary += 'J';
              secondary += 'J';
            } else {
              primary += 'K';
              secondary += 'K';
            }
            current += 2;
            break;
          }
          primary += 'K';
          secondary += 'K';
          current += 2;
        } else if (charAt(current + 1) === 'N') {
          if (current === 1 && isVowel(charAt(0)) && !slavoGermanic()) {
            primary += 'KN';
            secondary += 'N';
          } else if (!stringAt(current + 2, 2, ['EY']) && charAt(current + 1) !== 'Y' && !slavoGermanic()) {
            primary += 'N';
            secondary += 'KN';
          } else {
            primary += 'KN';
            secondary += 'KN';
          }
          current += 2;
        } else if (stringAt(current + 1, 2, ['LI']) && !slavoGermanic()) {
          primary += 'KL';
          secondary += 'L';
          current += 2;
        } else if (current === 0 && (charAt(current + 1) === 'Y' || stringAt(current + 1, 2, ['ES', 'EP', 'EB', 'EL', 'EY', 'IB', 'IL', 'IN', 'IE', 'EI', 'ER']))) {
          primary += 'K';
          secondary += 'J';
          current += 2;
        } else if ((stringAt(current + 1, 2, ['ER']) || charAt(current + 1) === 'Y') && !stringAt(0, 6, ['DANGER', 'RANGER', 'MANGER']) && !stringAt(current - 1, 1, ['E', 'I']) && !stringAt(current - 1, 3, ['RGY', 'OGY'])) {
          primary += 'K';
          secondary += 'J';
          current += 2;
        } else if (stringAt(current + 1, 1, ['E', 'I', 'Y']) || stringAt(current - 1, 4, ['AGGI', 'OGGI'])) {
          if (stringAt(0, 4, ['VAN ', 'VON ']) || stringAt(0, 3, ['SCH']) || stringAt(current + 1, 2, ['ET'])) {
            primary += 'K';
            secondary += 'K';
          } else if (stringAt(current + 1, 4, ['IER '])) {
            primary += 'J';
            secondary += 'J';
          } else {
            primary += 'J';
            secondary += 'K';
          }
          current += 2;
        } else {
          primary += 'K';
          secondary += 'K';
          current += (charAt(current + 1) === 'G') ? 2 : 1;
        }
        break;

      case 'H':
        if ((current === 0 || isVowel(charAt(current - 1))) && isVowel(charAt(current + 1))) {
          primary += 'H';
          secondary += 'H';
          current += 2;
        } else {
          current++;
        }
        break;

      case 'J':
        if (stringAt(current, 4, ['JOSE']) || stringAt(0, 4, ['SAN '])) {
          primary += 'H';
          secondary += 'H';
        } else {
          primary += 'J';
          secondary += 'J';
        }
        current += (charAt(current + 1) === 'J') ? 2 : 1;
        break;

      case 'K':
        primary += 'K';
        secondary += 'K';
        current += (charAt(current + 1) === 'K') ? 2 : 1;
        break;

      case 'L':
        primary += 'L';
        secondary += 'L';
        current += (charAt(current + 1) === 'L') ? 2 : 1;
        break;

      case 'M':
        primary += 'M';
        secondary += 'M';
        if (stringAt(current - 1, 3, ['UMB']) && (current + 1 === last || stringAt(current + 2, 2, ['ER']))) {
          current += 2;
        } else {
          current += (charAt(current + 1) === 'M') ? 2 : 1;
        }
        break;

      case 'N':
        primary += 'N';
        secondary += 'N';
        current += (charAt(current + 1) === 'N') ? 2 : 1;
        break;

      case 'P':
        if (charAt(current + 1) === 'H') {
          primary += 'F';
          secondary += 'F';
          current += 2;
        } else {
          primary += 'P';
          secondary += 'P';
          current += (stringAt(current + 1, 1, ['P', 'B'])) ? 2 : 1;
        }
        break;

      case 'Q':
        primary += 'K';
        secondary += 'K';
        current += (charAt(current + 1) === 'Q') ? 2 : 1;
        break;

      case 'R':
        primary += 'R';
        secondary += 'R';
        current += (charAt(current + 1) === 'R') ? 2 : 1;
        break;

      case 'S':
        if (stringAt(current, 2, ['SH'])) {
          primary += 'X';
          secondary += 'X';
          current += 2;
        } else if (stringAt(current, 3, ['SIO', 'SIA'])) {
          primary += 'S';
          secondary += 'X';
          current += 3;
        } else if (stringAt(current, 2, ['SC'])) {
          if (charAt(current + 2) === 'H') {
            primary += 'SK';
            secondary += 'SK';
            current += 3;
          } else if (stringAt(current + 2, 1, ['I', 'E', 'Y'])) {
            primary += 'S';
            secondary += 'S';
            current += 3;
          } else {
            primary += 'SK';
            secondary += 'SK';
            current += 3;
          }
        } else {
          primary += 'S';
          secondary += 'S';
          current += (stringAt(current + 1, 1, ['S', 'Z'])) ? 2 : 1;
        }
        break;

      case 'T':
        if (stringAt(current, 4, ['TION'])) {
          primary += 'X';
          secondary += 'X';
          current += 3;
        } else if (stringAt(current, 3, ['TIA', 'TCH'])) {
          primary += 'X';
          secondary += 'X';
          current += 3;
        } else if (stringAt(current, 2, ['TH'])) {
          primary += '0';  // theta
          secondary += 'T';
          current += 2;
        } else {
          primary += 'T';
          secondary += 'T';
          current += (stringAt(current + 1, 1, ['T', 'D'])) ? 2 : 1;
        }
        break;

      case 'V':
        primary += 'F';
        secondary += 'F';
        current += (charAt(current + 1) === 'V') ? 2 : 1;
        break;

      case 'W':
        if (charAt(current + 1) === 'R') {
          primary += 'R';
          secondary += 'R';
          current += 2;
        } else if (current === 0 && (isVowel(charAt(current + 1)) || charAt(current + 1) === 'H')) {
          if (isVowel(charAt(current + 1))) {
            primary += 'A';
            secondary += 'F';
          } else {
            primary += 'A';
            secondary += 'A';
          }
          current++;
        } else if ((current === last && isVowel(charAt(current - 1))) || stringAt(current - 1, 5, ['EWSKI', 'EWSKY', 'OWSKI', 'OWSKY']) || stringAt(0, 3, ['SCH'])) {
          secondary += 'F';
          current++;
        } else if (stringAt(current, 4, ['WICZ', 'WITZ'])) {
          primary += 'TS';
          secondary += 'FX';
          current += 4;
        } else {
          current++;
        }
        break;

      case 'X':
        if (!((current === last) && (stringAt(current - 3, 3, ['IAU', 'EAU']) || stringAt(current - 2, 2, ['AU', 'OU'])))) {
          primary += 'KS';
          secondary += 'KS';
        }
        current += (stringAt(current + 1, 1, ['C', 'X'])) ? 2 : 1;
        break;

      case 'Z':
        if (charAt(current + 1) === 'H') {
          primary += 'J';
          secondary += 'J';
          current += 2;
        } else {
          primary += 'S';
          secondary += 'S';
          current += (charAt(current + 1) === 'Z') ? 2 : 1;
        }
        break;

      default:
        current++;
    }
  }

  return {
    primary: primary.substring(0, 4),
    secondary: secondary.substring(0, 4)
  };
}

/**
 * Compares two strings using Double Metaphone and returns similarity score.
 * @param {string} str1 - First string
 * @param {string} str2 - Second string
 * @return {number} Similarity score (0-100)
 */
function metaphoneSimilarity(str1, str2) {
  if (!str1 || !str2) return 0;

  var m1 = doubleMetaphone(str1);
  var m2 = doubleMetaphone(str2);

  // Check all combinations of primary/secondary codes
  if (m1.primary === m2.primary && m1.primary !== '') return 100;
  if (m1.primary === m2.secondary && m1.primary !== '') return 95;
  if (m1.secondary === m2.primary && m1.secondary !== '') return 95;
  if (m1.secondary === m2.secondary && m1.secondary !== '') return 90;

  // Partial match - check if one code starts with the other
  if (m1.primary.length > 0 && m2.primary.length > 0) {
    if (m1.primary.indexOf(m2.primary) === 0 || m2.primary.indexOf(m1.primary) === 0) {
      return 75;
    }
  }

  return 0;
}

/**
 * Compares two full names using Metaphone on each part.
 * @param {string} name1 - First full name
 * @param {string} name2 - Second full name
 * @return {number} Similarity score (0-100)
 */
function metaphoneNameSimilarity(name1, name2) {
  if (!name1 || !name2) return 0;

  var parts1 = name1.toLowerCase().trim().split(/\s+/);
  var parts2 = name2.toLowerCase().trim().split(/\s+/);

  // Compare each part of the name
  var totalScore = 0;
  var comparisons = 0;

  // Compare first names
  if (parts1[0] && parts2[0]) {
    totalScore += metaphoneSimilarity(parts1[0], parts2[0]);
    comparisons++;
  }

  // Compare last names (assume last element)
  if (parts1.length > 1 && parts2.length > 1) {
    var last1 = parts1[parts1.length - 1];
    var last2 = parts2[parts2.length - 1];
    totalScore += metaphoneSimilarity(last1, last2);
    comparisons++;
  }

  // Check for reversed names (first/last swapped)
  if (parts1.length === 2 && parts2.length === 2) {
    var reversedScore = 0;
    reversedScore += metaphoneSimilarity(parts1[0], parts2[1]);
    reversedScore += metaphoneSimilarity(parts1[1], parts2[0]);
    var reversedAvg = reversedScore / 2;
    if (reversedAvg > totalScore / comparisons) {
      return reversedAvg * 0.95; // Slight penalty for reversed name
    }
  }

  return comparisons > 0 ? totalScore / comparisons : 0;
}

/**
 * Processes the certification import with matched employees and selected cert types.
 * @param {Object} parsedData - Parsed certification data
 * @param {Array} selectedCertTypes - Cert types to create To Do tasks for
 * @return {Object} Result with success message
 */
function processExpiringCertsImportMultiRow(parsedData, selectedCertTypes) {
  Logger.log('=== processExpiringCertsImportMultiRow START ===');

  var ss = SpreadsheetApp.getActiveSpreadsheet();

  // Add new employees first if any
  if (parsedData.newEmployees && parsedData.newEmployees.length > 0) {
    var employeesSheet = ss.getSheetByName(SHEET_EMPLOYEES);
    if (!employeesSheet) {
      employeesSheet = ss.insertSheet(SHEET_EMPLOYEES);
      // Add headers
      var empHeaders = ['Name', 'Class', 'Location', 'Job Number', 'Phone Number', 'Notification Emails', 'MP Email', 'Email Address', 'Glove Size', 'Sleeve Size', 'Hire Date', 'Last Day', 'Last Day Reason', 'Job Classification'];
      employeesSheet.getRange(1, 1, 1, empHeaders.length).setValues([empHeaders]);
      employeesSheet.getRange(1, 1, 1, empHeaders.length)
        .setBackground('#1a73e8')
        .setFontColor('#ffffff')
        .setFontWeight('bold');
    }

    // Add each new employee
    for (var ne = 0; ne < parsedData.newEmployees.length; ne++) {
      var newEmp = parsedData.newEmployees[ne];
      var newRow = [
        newEmp.name,
        newEmp.class,
        newEmp.location,
        newEmp.jobNum || '',
        newEmp.phone || '',
        '', // Notification Emails
        '', // MP Email
        newEmp.email || '',
        newEmp.gloveSize || '',
        newEmp.sleeveSize || '',
        newEmp.hireDate || new Date(),
        '', // Last Day
        '', // Last Day Reason
        '' // Job Classification
      ];
      employeesSheet.appendRow(newRow);
      Logger.log('Added new employee: ' + newEmp.name);

      // Log to Employee History
      logNewEmployeeFromImport(newEmp);
    }
  }

  var expiringSheet = ss.getSheetByName('Expiring Certs');

  if (!expiringSheet) {
    expiringSheet = ss.insertSheet('Expiring Certs');
  }

  // Clear sheet
  expiringSheet.clear();

  // Set headers
  var headers = ['Employee Name', 'Item Type', 'Expiration Date', 'Location', 'Job #', 'Days Until Expiration', 'Status'];
  expiringSheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  expiringSheet.getRange(1, 1, 1, headers.length)
    .setBackground('#1a73e8')
    .setFontColor('#ffffff')
    .setFontWeight('bold');
  expiringSheet.setFrozenRows(1);

  // Get employees for location/job lookup
  var employees = getEmployeeNamesForMatching();
  var empMap = {};
  for (var e = 0; e < employees.length; e++) {
    empMap[employees[e].name] = employees[e];
  }

  // Prepare batch data
  var batchData = [];
  var certRows = parsedData.certRows;

  for (var i = 0; i < certRows.length; i++) {
    var cert = certRows[i];

    // Find matched employee
    var matchedEmp = null;
    for (var m = 0; m < parsedData.employeeMatches.length; m++) {
      if (parsedData.employeeMatches[m].excelName === cert.convertedName) {
        if (parsedData.employeeMatches[m].matchedName) {
          matchedEmp = empMap[parsedData.employeeMatches[m].matchedName];
        }
        break;
      }
    }

    var location = matchedEmp ? matchedEmp.location : cert.excelLocation;
    var jobNum = matchedEmp ? matchedEmp.jobNum : cert.excelJobNum;

    batchData.push([
      cert.convertedName,
      cert.certType, // Always show the actual cert type
      cert.expirationDate || '',
      location,
      jobNum,
      '', // Formula will be added
      ''  // Formula will be added
    ]);
  }

  // Write batch data
  if (batchData.length > 0) {
    expiringSheet.getRange(2, 1, batchData.length, headers.length).setValues(batchData);

    // Add formulas - simple calculation for all certs
    var formulaRange = expiringSheet.getRange(2, 6, batchData.length, 2);
    var formulas = [];
    for (var f = 0; f < batchData.length; f++) {
      var rowNum = f + 2;
      formulas.push([
        // Days Until Expiration: If no date, show N/A, otherwise calculate days
        '=IF(ISBLANK(C' + rowNum + '),"N/A",DAYS(C' + rowNum + ',TODAY()))',
        // Status: If no date show "No Date Set", otherwise calculate based on days
        '=IF(F' + rowNum + '="PRIORITY - Need Copy","PRIORITY - Need Copy",IF(F' + rowNum + '="N/A","No Date Set",IF(F' + rowNum + '<0,"EXPIRED",IF(F' + rowNum + '<=7,"CRITICAL",IF(F' + rowNum + '<=30,"WARNING",IF(F' + rowNum + '<=60,"UPCOMING","OK"))))))'
      ]);
    }
    formulaRange.setFormulas(formulas);

    // Sort by employee name (column 1) then days (column 6)
    expiringSheet.getRange(2, 1, batchData.length, headers.length).sort([1, 6]);

    // Apply conditional formatting
    applyExpiringCertsFormatting(expiringSheet, batchData.length);

    // Create row groups by employee
    createEmployeeGroups(expiringSheet, batchData.length);

    // Generate To Do tasks for selected cert types
    var tasksCreated = generateToDoTasksFromCerts(certRows, selectedCertTypes, empMap);
  }

  Logger.log('Import complete: ' + batchData.length + ' certifications');

  return {
    success: true,
    message: '✅ Import Complete!\n\nImported ' + batchData.length + ' certifications for ' + parsedData.summary.totalEmployees + ' employees.\n\nPriority Items: ' + parsedData.summary.priorityCount + '\nNon-Expiring: ' + parsedData.summary.nonExpiringCount + '\nTo Do Tasks Created: ' + (tasksCreated || 0)
  };
}

/**
 * Generates To Do tasks from certification data.
 * @param {Array} certRows - Array of certification rows
 * @param {Array} selectedCertTypes - Cert types to create tasks for
 * @param {Object} empMap - Employee map for location lookup
 * @return {number} Number of tasks created
 */
function generateToDoTasksFromCerts(certRows, selectedCertTypes, empMap) {
  if (!selectedCertTypes || selectedCertTypes.length === 0) {
    Logger.log('No cert types selected for task generation');
    return 0;
  }

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var manualTasksSheet = ss.getSheetByName('Manual Tasks');

  if (!manualTasksSheet) {
    Logger.log('Manual Tasks sheet not found, skipping task generation');
    return 0;
  }

  var today = new Date();
  var tasksCreated = 0;

  for (var i = 0; i < certRows.length; i++) {
    var cert = certRows[i];

    // Skip if not in selected cert types
    if (selectedCertTypes.indexOf(cert.certType) === -1) {
      continue;
    }

    // Skip non-expiring certs
    if (cert.isNonExpiring) {
      continue;
    }

    // Create task if priority OR expiring soon
    var shouldCreateTask = false;
    var priority = 'Medium';

    if (cert.isPriority) {
      shouldCreateTask = true;
      priority = 'High';
    } else if (cert.expirationDate) {
      try {
        var expDate = new Date(cert.expirationDate);
        var daysUntil = Math.floor((expDate - today) / (1000 * 60 * 60 * 24));

        if (daysUntil <= 30) {
          shouldCreateTask = true;
          priority = daysUntil <= 7 ? 'High' : 'Medium';
        }
      } catch (e) {
        Logger.log('Error parsing date for cert: ' + cert.certType + ', date: ' + cert.expirationDate);
      }
    }

    if (shouldCreateTask) {
      var emp = empMap[cert.convertedName];
      var location = emp ? emp.location : cert.excelLocation;

      var taskRow = [
        location || '',
        priority,
        'Renew ' + cert.certType,
        cert.expirationDate || '',
        '', // Start Time
        '', // End Time
        1, // Estimated Time
        location || 'Helena', // Start Location
        location || '', // End Location
        'Employee: ' + cert.convertedName + ' | Current Expiration: ' + (cert.expirationDate || 'Unknown'),
        new Date(), // Date Added
        'Pending' // Status
      ];

      try {
        manualTasksSheet.appendRow(taskRow);
        tasksCreated++;
      } catch (e) {
        Logger.log('Error appending task row: ' + e);
      }
    }
  }

  Logger.log('Created ' + tasksCreated + ' To Do tasks from certifications');
  return tasksCreated;
}

/**
 * Applies conditional formatting to Expiring Certs sheet.
 */
function applyExpiringCertsFormatting(sheet, dataRows) {
  var statusRange = sheet.getRange(2, 7, dataRows, 1);
  var rules = [];

  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .whenTextEqualTo('PRIORITY - Need Copy')
    .setBackground('#9c27b0')
    .setFontColor('#ffffff')
    .setRanges([statusRange])
    .build());

  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .whenTextEqualTo('EXPIRED')
    .setBackground('#ea4335')
    .setFontColor('#ffffff')
    .setRanges([statusRange])
    .build());

  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .whenTextEqualTo('CRITICAL')
    .setBackground('#ff6d00')
    .setFontColor('#ffffff')
    .setRanges([statusRange])
    .build());

  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .whenTextEqualTo('WARNING')
    .setBackground('#fbbc04')
    .setFontColor('#000000')
    .setRanges([statusRange])
    .build());

  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .whenTextEqualTo('UPCOMING')
    .setBackground('#4285f4')
    .setFontColor('#ffffff')
    .setRanges([statusRange])
    .build());

  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .whenTextEqualTo('OK')
    .setBackground('#34a853')
    .setFontColor('#ffffff')
    .setRanges([statusRange])
    .build());

  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .whenTextEqualTo('Non-Expiring')
    .setBackground('#757575')
    .setFontColor('#ffffff')
    .setRanges([statusRange])
    .build());

  sheet.setConditionalFormatRules(rules);
}

/**
 * Creates collapsed row groups by employee in Expiring Certs sheet.
 */
function createEmployeeGroups(sheet, dataRows) {
  if (dataRows < 2) return;

  var data = sheet.getRange(2, 1, dataRows, 1).getValues();
  var currentEmployee = null;
  var groupStart = -1;

  for (var i = 0; i < data.length; i++) {
    var empName = data[i][0];

    if (empName !== currentEmployee) {
      // Close previous group
      if (groupStart !== -1 && (i - groupStart) > 1) {
        var range = sheet.getRange(groupStart + 2, 1, i - groupStart, 7);
        range.shiftRowGroupDepth(1);
        sheet.getRowGroup(groupStart + 2, 1).collapse();
      }

      // Start new group
      currentEmployee = empName;
      groupStart = i;
    }
  }

  // Close final group
  if (groupStart !== -1 && (dataRows - groupStart) > 1) {
    var range = sheet.getRange(groupStart + 2, 1, dataRows - groupStart, 7);
    range.shiftRowGroupDepth(1);
    sheet.getRowGroup(groupStart + 2, 1).collapse();
  }
}

/**
 * Refreshes certification expiration dates from completed To Do tasks.
 * @return {Object} Result with message
 */
function refreshCertsFromCompletedTasks() {
  Logger.log('=== refreshCertsFromCompletedTasks START ===');

  // Get completed tasks from To Do Schedule
  var tasks = getScheduleTasks();
  var completedCertTasks = tasks.filter(function(t) {
    return t.status === 'Complete' &&
           t.taskType &&
           t.taskType.indexOf('Renew') !== -1;
  });

  if (completedCertTasks.length === 0) {
    return {
      success: true,
      message: 'No completed certification renewal tasks found.'
    };
  }

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var expiringSheet = ss.getSheetByName('Expiring Certs');

  if (!expiringSheet || expiringSheet.getLastRow() < 2) {
    return {
      success: false,
      message: 'Expiring Certs sheet not found or empty. Please import certifications first.'
    };
  }

  var updatedCount = 0;
  var updateList = [];

  // For now, just return a summary - full implementation will be in next step
  Logger.log('Found ' + completedCertTasks.length + ' completed cert tasks');

  return {
    success: true,
    message: '✅ Refresh Complete!\n\nFound ' + completedCertTasks.length + ' completed certification tasks.\n\n(Full update functionality will be implemented when task completion dialog is added)'
  };
}

/**
 * Gets expiring certs configuration for To Do Config.
 */
function getExpiringCertsConfig() {
  var defaults = getCertTypeDefaults();
  var properties = PropertiesService.getScriptProperties();
  var selectedJson = properties.getProperty('selectedCertTypes');
  var selected = selectedJson ? JSON.parse(selectedJson) : defaults.defaultChecked;

  var certTypes = defaults.allCertTypes.map(function(name) {
    return {
      name: name,
      isNonExpiring: defaults.nonExpiring.indexOf(name) !== -1
    };
  });

  return {
    certTypes: certTypes,
    selectedCertTypes: selected
  };
}

/**
 * Saves expiring certs configuration.
 */
function saveExpiringCertsConfig(selectedCertTypes) {
  var properties = PropertiesService.getScriptProperties();
  properties.setProperty('selectedCertTypes', JSON.stringify(selectedCertTypes));
  return { success: true };
}

/**
 * Gets Training Config for ToDoConfig dialog.
 * Returns all crews (job numbers) and which ones are selected for training task generation.
 * @return {Object} Config with crews, selectedCrews, and crewDetails
 */
function getTrainingConfig() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var properties = PropertiesService.getScriptProperties();
  var employeesSheet = ss.getSheetByName('Employees');

  if (!employeesSheet || employeesSheet.getLastRow() < 2) {
    return {
      crews: [],
      selectedCrews: [],
      crewDetails: []
    };
  }

  var data = employeesSheet.getDataRange().getValues();
  var headers = data[0];

  // Find column indices
  var nameCol = -1;
  var jobNumCol = -1;
  var locationCol = -1;
  var classificationCol = -1;

  for (var h = 0; h < headers.length; h++) {
    var header = String(headers[h]).toLowerCase().trim();
    if (header === 'name') nameCol = h;
    if (header === 'job number') jobNumCol = h;
    if (header === 'location') locationCol = h;
    if (header === 'job classification') classificationCol = h;
  }

  if (jobNumCol === -1) {
    return {
      crews: [],
      selectedCrews: [],
      crewDetails: []
    };
  }

  // Build crew data - group employees by crew number
  var crewData = {}; // { crewNumber: { foreman, location, employees: [] } }

  for (var i = 1; i < data.length; i++) {
    var name = nameCol !== -1 ? String(data[i][nameCol] || '').trim() : '';
    var jobNumber = String(data[i][jobNumCol] || '').trim();
    var location = locationCol !== -1 ? String(data[i][locationCol] || '').trim() : '';
    var classification = classificationCol !== -1 ? String(data[i][classificationCol] || '').trim() : '';

    if (!jobNumber) continue;

    // Extract crew number (e.g., "009-26.1" → "009-26")
    var crewNumber = jobNumber;
    var lastDotIndex = jobNumber.lastIndexOf('.');
    if (lastDotIndex !== -1) {
      crewNumber = jobNumber.substring(0, lastDotIndex);
    }

    if (!crewData[crewNumber]) {
      crewData[crewNumber] = {
        foreman: null,
        location: location,
        employees: []
      };
    }

    crewData[crewNumber].employees.push(name);

    // Check if this employee is a foreman
    if (classification === 'F' || classification === 'GTO F' || classification === 'GF') {
      crewData[crewNumber].foreman = name;
    }

    // Use the first location found
    if (!crewData[crewNumber].location && location) {
      crewData[crewNumber].location = location;
    }
  }

  // Convert to array and sort
  var allCrews = [];
  var crewDetails = [];

  var crewNumbers = Object.keys(crewData).sort();

  for (var c = 0; c < crewNumbers.length; c++) {
    var crewNum = crewNumbers[c];
    var crew = crewData[crewNum];

    allCrews.push({
      number: crewNum,
      foreman: crew.foreman || '',
      location: crew.location || 'Unknown',
      employeeCount: crew.employees.length
    });

    crewDetails.push({
      number: crewNum,
      foreman: crew.foreman || '',
      location: crew.location || 'Unknown',
      employeeCount: crew.employees.length
    });
  }

  // Get saved selection (default: all crews selected)
  var selectedJson = properties.getProperty('trainingCrews');
  var selected;

  if (selectedJson) {
    try {
      selected = JSON.parse(selectedJson);
    } catch (e) {
      selected = crewNumbers; // Default to all crews
    }
  } else {
    selected = crewNumbers; // Default to all crews
  }

  return {
    crews: allCrews,
    selectedCrews: selected,
    crewDetails: crewDetails
  };
}

/**
 * Saves Training Config - which crews (job numbers) should generate training tasks.
 * @param {Array} selectedCrews - Array of crew numbers to include (e.g., ["009-26", "009-27"])
 * @return {Object} Result with success status
 */
function saveTrainingConfig(selectedCrews) {
  var properties = PropertiesService.getScriptProperties();
  properties.setProperty('trainingCrews', JSON.stringify(selectedCrews));
  return { success: true };
}

/**
 * Gets Crew Visit Config data for the To Do Config dialog.
 * Reads from the Crew Visit Config sheet.
 * @return {Array} Array of crew visit objects
 */
function getCrewVisitConfig() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Crew Visit Config');

  if (!sheet || sheet.getLastRow() < 2) {
    return [];
  }

  var data = sheet.getDataRange().getValues();
  var crews = [];

  // Helper function to format dates for JSON
  function formatDateForJson(dateVal) {
    if (!dateVal) return '';
    if (dateVal instanceof Date) {
      return dateVal.toISOString();
    }
    return String(dateVal);
  }

  // Headers: Job Number, Location, Crew Lead, Crew Size, Visit Frequency, Est. Visit Time,
  //          Last Visit Date, Next Visit Date, Drive Time From Helena, Priority, Notes
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    if (!row[0]) continue; // Skip empty rows

    crews.push({
      rowIndex: i + 1, // 1-based for sheet operations
      jobNumber: String(row[0] || '').trim(),
      location: String(row[1] || '').trim(),
      crewLead: String(row[2] || '').trim(),
      crewSize: row[3] || 0,
      frequency: String(row[4] || 'Monthly').trim(),
      estVisitTime: row[5] || 60,
      lastVisit: formatDateForJson(row[6]),
      nextVisit: formatDateForJson(row[7]),
      driveTime: row[8] || 0,
      priority: String(row[9] || 'Medium').trim(),
      notes: String(row[10] || '').trim()
    });
  }

  return crews;
}

/**
 * Saves Crew Visit Config data from the To Do Config dialog.
 * Updates the Crew Visit Config sheet.
 * @param {Array} crews - Array of crew visit objects
 * @return {Object} Result with success status
 */
function saveCrewVisitConfig(crews) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Crew Visit Config');

  if (!sheet) {
    throw new Error('Crew Visit Config sheet not found. Please run Setup Crew Visit Config first.');
  }

  // Update each row
  for (var i = 0; i < crews.length; i++) {
    var crew = crews[i];
    var rowIndex = crew.rowIndex || (i + 2); // Default to row position if rowIndex not set

    // Update editable columns: Frequency (5), Est Time (6), Last Visit (7), Next Visit (8), Drive Time (9), Priority (10)
    var updates = [
      [crew.frequency || 'Monthly'],
      [crew.estVisitTime || 60],
      [crew.lastVisit ? new Date(crew.lastVisit) : ''],
      [crew.nextVisit ? new Date(crew.nextVisit) : ''],
      [crew.driveTime || 0],
      [crew.priority || 'Medium']
    ];

    // Update columns E through J (5-10)
    sheet.getRange(rowIndex, 5, 1, 6).setValues([updates.map(function(u) { return u[0]; })]);
  }

  SpreadsheetApp.flush();
  return { success: true, message: 'Saved ' + crews.length + ' crew records' };
}

/**
 * Refreshes Crew Visit Config from the Employees sheet.
 * Preserves existing editable values where crews match.
 * @return {Array} Updated crew visit data
 */
function refreshCrewVisitConfigFromEmployees() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Crew Visit Config');

  // Get existing data to preserve settings
  var existingData = {};
  if (sheet && sheet.getLastRow() > 1) {
    var oldData = sheet.getDataRange().getValues();
    for (var i = 1; i < oldData.length; i++) {
      var jobNum = String(oldData[i][0] || '').trim();
      if (jobNum) {
        existingData[jobNum] = {
          frequency: oldData[i][4] || 'Monthly',
          estVisitTime: oldData[i][5] || 60,
          lastVisit: oldData[i][6] || '',
          nextVisit: oldData[i][7] || '',
          driveTime: oldData[i][8] || 0,
          priority: oldData[i][9] || 'Medium',
          notes: oldData[i][10] || ''
        };
      }
    }
  }

  // Create sheet if it doesn't exist
  if (!sheet) {
    sheet = ss.insertSheet('Crew Visit Config');
  }

  sheet.clear();

  // Headers
  var headers = [
    'Job Number', 'Location', 'Crew Lead', 'Crew Size', 'Visit Frequency',
    'Est. Visit Time', 'Last Visit Date', 'Next Visit Date', 'Drive Time From Helena', 'Priority', 'Notes'
  ];

  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.getRange(1, 1, 1, headers.length)
    .setFontWeight('bold')
    .setBackground('#4285f4')
    .setFontColor('white');

  // Get crews from Employees sheet
  var employeesSheet = ss.getSheetByName('Employees');
  if (!employeesSheet || employeesSheet.getLastRow() < 2) {
    return [];
  }

  var empData = employeesSheet.getDataRange().getValues();
  var empHeaders = empData[0];

  // Find column indices
  var nameCol = -1, jobNumCol = -1, locationCol = -1, classificationCol = -1, lastDayCol = -1;
  for (var h = 0; h < empHeaders.length; h++) {
    var header = String(empHeaders[h]).toLowerCase().trim();
    if (header === 'name') nameCol = h;
    if (header === 'job number') jobNumCol = h;
    if (header === 'location') locationCol = h;
    if (header === 'job classification') classificationCol = h;
    if (header === 'last day') lastDayCol = h;
  }

  if (jobNumCol === -1) {
    return [];
  }

  // Build crew data
  var crewMap = {};

  for (var i = 1; i < empData.length; i++) {
    var row = empData[i];
    var jobNumber = String(row[jobNumCol] || '').trim();
    var lastDay = lastDayCol !== -1 ? row[lastDayCol] : '';

    if (!jobNumber || lastDay) continue; // Skip if no job number or employee has left

    // Extract crew number
    var crewNumber = jobNumber;
    var dotIndex = jobNumber.lastIndexOf('.');
    if (dotIndex !== -1) {
      crewNumber = jobNumber.substring(0, dotIndex);
    }

    if (!crewMap[crewNumber]) {
      crewMap[crewNumber] = {
        location: locationCol !== -1 ? String(row[locationCol] || '').trim() : '',
        crewLead: '',
        crewSize: 0,
        employees: []
      };
    }

    crewMap[crewNumber].crewSize++;
    crewMap[crewNumber].employees.push(nameCol !== -1 ? String(row[nameCol] || '').trim() : '');

    // Check if foreman
    var classification = classificationCol !== -1 ? String(row[classificationCol] || '').trim() : '';
    if (classification === 'F' || classification === 'GTO F' || classification === 'GF') {
      crewMap[crewNumber].crewLead = nameCol !== -1 ? String(row[nameCol] || '').trim() : '';
    }
  }

  // Build rows
  var crewRows = [];
  var sortedCrews = Object.keys(crewMap).sort();

  for (var c = 0; c < sortedCrews.length; c++) {
    var crewNum = sortedCrews[c];
    var crew = crewMap[crewNum];
    var existing = existingData[crewNum] || {};

    crewRows.push([
      crewNum,
      crew.location,
      crew.crewLead,
      crew.crewSize,
      existing.frequency || 'Monthly',
      existing.estVisitTime || 60,
      existing.lastVisit || '',
      existing.nextVisit || '',
      existing.driveTime || 0,
      existing.priority || 'Medium',
      existing.notes || ''
    ]);
  }

  // Write data
  if (crewRows.length > 0) {
    sheet.getRange(2, 1, crewRows.length, headers.length).setValues(crewRows);

    // Format date columns
    sheet.getRange(2, 7, crewRows.length, 2).setNumberFormat('mm/dd/yyyy');
  }

  sheet.setFrozenRows(1);

  // Return the data in the format expected by the UI
  return getCrewVisitConfig();
}

/**
 * Gets Training Config data for the To Do Config dialog.
 * Reads from the Training Config sheet.
 * @return {Array} Array of training config objects
 */
function getTrainingConfigData() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Training Config');

  if (!sheet || sheet.getLastRow() < 2) {
    return [];
  }

  var data = sheet.getDataRange().getValues();
  var trainings = [];

  // Helper function to format dates for JSON
  function formatDateForJson(dateVal) {
    if (!dateVal) return '';
    if (dateVal instanceof Date) {
      return dateVal.toISOString();
    }
    return String(dateVal);
  }

  // Headers: Training Topic, Required For, Duration (Hours), Frequency,
  //          Last Training Date, Next Training Date, Required Attendees, Completion Status, Notes
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    if (!row[0]) continue; // Skip empty rows

    trainings.push({
      rowIndex: i + 1, // 1-based for sheet operations
      topic: String(row[0] || '').trim(),
      requiredFor: String(row[1] || 'All').trim(),
      duration: row[2] || 2,
      frequency: String(row[3] || 'Monthly').trim(),
      lastTraining: formatDateForJson(row[4]),
      nextTraining: formatDateForJson(row[5]),
      requiredAttendees: row[6] || 0,
      completionStatus: String(row[7] || '0%').trim(),
      notes: String(row[8] || '').trim()
    });
  }

  return trainings;
}

/**
 * Saves Training Config data from the To Do Config dialog.
 * Updates the Training Config sheet.
 * @param {Array} trainings - Array of training config objects
 * @return {Object} Result with success status
 */
function saveTrainingConfigData(trainings) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Training Config');

  if (!sheet) {
    throw new Error('Training Config sheet not found. Please run Setup Training Config first.');
  }

  // Update each row
  for (var i = 0; i < trainings.length; i++) {
    var training = trainings[i];
    var rowIndex = training.rowIndex || (i + 2); // Default to row position if rowIndex not set

    // Parse dates
    var lastDate = training.lastTraining ? new Date(training.lastTraining) : '';
    var nextDate = training.nextTraining ? new Date(training.nextTraining) : '';

    // Update all columns (1-9)
    var rowData = [
      training.topic || '',
      training.requiredFor || 'All',
      training.duration || 2,
      training.frequency || 'Monthly',
      lastDate,
      nextDate,
      training.requiredAttendees || 0,
      training.completionStatus || '0%',
      training.notes || ''
    ];

    sheet.getRange(rowIndex, 1, 1, 9).setValues([rowData]);
  }

  // Format date columns
  if (trainings.length > 0) {
    sheet.getRange(2, 5, trainings.length, 2).setNumberFormat('mm/dd/yyyy');
  }

  SpreadsheetApp.flush();
  return { success: true, message: 'Saved ' + trainings.length + ' training records' };
}

/**
 * Gets crew members for a given crew number.
 * Called from ToDoConfig.html to display crew member names in tooltips.
 * @param {string} crewNumber - Crew number (e.g., "009-26")
 * @return {string} Comma-separated list of employee names
 */
function getCrewMembersForDisplay(crewNumber) {
  return getCrewMembers(crewNumber);
}

/**
 * Gets Training Tracking data for the To Do Config dialog.
 * Reads from the Training Tracking sheet (per-crew training completion).
 * @return {Array} Array of training tracking records
 */
function getTrainingTrackingData() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Training Tracking');

  if (!sheet || sheet.getLastRow() < 3) {
    return [];
  }

  var data = sheet.getDataRange().getValues();
  var records = [];

  // Helper function to format dates for JSON
  function formatDateForJson(dateVal) {
    if (!dateVal) return '';
    if (dateVal instanceof Date) {
      return dateVal.toISOString();
    }
    return String(dateVal);
  }

  // Headers in row 2: Month, Training Topic, Crew #, Crew Lead, Crew Size,
  //                   Completion Date, Attendees, Hours, Trainer, Status, Notes
  // Data starts at row 3 (index 2)
  for (var i = 2; i < data.length; i++) {
    var row = data[i];
    if (!row[0] && !row[2]) continue; // Skip empty rows (need month or crew)

    records.push({
      rowIndex: i + 1, // 1-based for sheet operations
      month: String(row[0] || '').trim(),
      topic: String(row[1] || '').trim(),
      crew: String(row[2] || '').trim(),
      crewLead: String(row[3] || '').trim(),
      crewSize: row[4] || 0,
      completionDate: formatDateForJson(row[5]),
      attendees: row[6] || '',
      hours: row[7] || 0,
      trainer: String(row[8] || '').trim(),
      status: String(row[9] || 'Pending').trim(),
      notes: String(row[10] || '').trim()
    });
  }

  return records;
}

/**
 * Saves Training Tracking data from the To Do Config dialog.
 * Updates the Training Tracking sheet.
 * @param {Array} records - Array of training tracking records
 * @return {Object} Result with success status and updated count
 */
function saveTrainingTrackingData(records) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Training Tracking');

  if (!sheet) {
    throw new Error('Training Tracking sheet not found. Please run Setup Training Tracking first.');
  }

  var updatedCount = 0;

  // Update each row - only update editable columns
  for (var i = 0; i < records.length; i++) {
    var record = records[i];
    var rowIndex = record.rowIndex;

    if (!rowIndex || rowIndex < 3) continue; // Skip if no valid row index

    // Parse completion date
    var completionDate = record.completionDate ? new Date(record.completionDate) : '';

    // Update columns: Completion Date (F=6), Attendees (G=7), Trainer (I=9), Status (J=10)
    sheet.getRange(rowIndex, 6).setValue(completionDate); // Completion Date
    sheet.getRange(rowIndex, 7).setValue(record.attendees || ''); // Attendees
    sheet.getRange(rowIndex, 9).setValue(record.trainer || ''); // Trainer
    sheet.getRange(rowIndex, 10).setValue(record.status || 'Pending'); // Status

    updatedCount++;
  }

  // Format date column
  var lastRow = sheet.getLastRow();
  if (lastRow > 2) {
    sheet.getRange(3, 6, lastRow - 2, 1).setNumberFormat('mm/dd/yyyy');
  }

  SpreadsheetApp.flush();

  // Also update Training Config completion status based on Training Tracking
  updateTrainingConfigCompletionStatus();

  return { success: true, updatedCount: updatedCount };
}

/**
 * Updates Training Config completion status based on Training Tracking data.
 * Calculates percentage of crews that completed each training topic.
 */
function updateTrainingConfigCompletionStatus() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var trackingSheet = ss.getSheetByName('Training Tracking');
  var configSheet = ss.getSheetByName('Training Config');

  if (!trackingSheet || !configSheet) return;

  // Get tracking data
  var trackingData = trackingSheet.getDataRange().getValues();

  // Count completions by month/topic
  var completionStats = {};
  var totalByTopic = {};

  for (var i = 2; i < trackingData.length; i++) {
    var row = trackingData[i];
    var month = String(row[0] || '').trim();
    var status = String(row[9] || '').trim();

    if (!month) continue;

    if (!totalByTopic[month]) {
      totalByTopic[month] = 0;
      completionStats[month] = 0;
    }

    totalByTopic[month]++;
    if (status === 'Complete') {
      completionStats[month]++;
    }
  }

  // Update Training Config completion status
  var configData = configSheet.getDataRange().getValues();

  for (var j = 1; j < configData.length; j++) {
    var topic = String(configData[j][0] || '').trim();

    // Extract month from topic (e.g., "January: Respectful Workplace..." -> "January")
    var monthMatch = topic.match(/^(\w+):/);
    if (monthMatch) {
      var month = monthMatch[1];
      var total = totalByTopic[month] || 0;
      var completed = completionStats[month] || 0;

      if (total > 0) {
        var percent = Math.round((completed / total) * 100);
        configSheet.getRange(j + 1, 8).setValue(percent + '%'); // Column H = Completion Status
        configSheet.getRange(j + 1, 7).setValue(completed); // Column G = Required Attendees (using as completed count)
      }
    }
  }
}

/**
 * Updates certification expiration dates in the Expiring Certs sheet.
 * @param {Array} changes - Array of {employee, certType, newDate} objects
 * @return {Object} Result with success status and count
 */
function updateCertExpirationDates(changes) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var expiringSheet = ss.getSheetByName('Expiring Certs');

    if (!expiringSheet) {
      throw new Error('Expiring Certs sheet not found');
    }

    var data = expiringSheet.getDataRange().getValues();
    var updatedCount = 0;

    // Column indices (0-based)
    // A=Employee Name, B=Item Type, C=Expiration Date
    var empCol = 0;
    var certTypeCol = 1;
    var expirationCol = 2;

    for (var c = 0; c < changes.length; c++) {
      var change = changes[c];
      var employee = change.employee;
      var certType = change.certType;
      var newDate = change.newDate;

      // Find the matching row
      for (var i = 1; i < data.length; i++) {
        var rowEmp = String(data[i][empCol] || '').trim();
        var rowCert = String(data[i][certTypeCol] || '').trim();

        if (rowEmp === employee && rowCert === certType) {
          // Update the expiration date (column C, which is column 3 in 1-based)
          var dateValue = newDate ? new Date(newDate + 'T12:00:00') : '';
          expiringSheet.getRange(i + 1, expirationCol + 1).setValue(dateValue);
          updatedCount++;
          Logger.log('Updated: ' + employee + ' - ' + certType + ' to ' + newDate);
          break;
        }
      }
    }

    // Refresh formulas by triggering recalculation
    SpreadsheetApp.flush();

    return {
      success: true,
      updatedCount: updatedCount,
      message: 'Updated ' + updatedCount + ' certification date(s)'
    };
  } catch (error) {
    Logger.log('Error in updateCertExpirationDates: ' + error.toString());
    throw error;
  }
}

/**
 * Gets expiring certs data for To Do Config display.
 */
function getExpiringCertsForConfig() {
  try {
    Logger.log('=== getExpiringCertsForConfig START ===');
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var expiringSheet = ss.getSheetByName('Expiring Certs');

    if (!expiringSheet) {
      Logger.log('Expiring Certs sheet not found');
      return {
        employees: [],
        summary: { totalEmployees: 0, priorityCount: 0, expiredCount: 0 }
      };
    }

    var lastRow = expiringSheet.getLastRow();
    Logger.log('Last row: ' + lastRow);

    if (lastRow < 2) {
      Logger.log('No data in Expiring Certs sheet');
      return {
        employees: [],
        summary: { totalEmployees: 0, priorityCount: 0, expiredCount: 0 }
      };
    }

    // Build set of CURRENT employees from Employees sheet (exclude Previous Employee locations)
    var currentEmployees = new Set();
    var employeesSheet = ss.getSheetByName('Employees');
    if (employeesSheet && employeesSheet.getLastRow() > 1) {
      var empData = employeesSheet.getDataRange().getValues();
      var empHeaders = empData[0];
      var empNameCol = -1;
      var empLocCol = -1;

      for (var eh = 0; eh < empHeaders.length; eh++) {
        var hdr = String(empHeaders[eh]).toLowerCase().trim();
        if (hdr === 'name') empNameCol = eh;
        if (hdr === 'location') empLocCol = eh;
      }

      if (empNameCol !== -1) {
        for (var ei = 1; ei < empData.length; ei++) {
          var empName = (empData[ei][empNameCol] || '').toString().trim();
          var empLoc = empLocCol !== -1 ? (empData[ei][empLocCol] || '').toString().trim().toLowerCase() : '';
          // Only include employees who are NOT "Previous Employee"
          if (empName && empLoc !== 'previous employee') {
            currentEmployees.add(empName.toLowerCase());
          }
        }
      }
    }
    Logger.log('Found ' + currentEmployees.size + ' current employees');

    // Only get the columns we need (A, B, C, F, G) to reduce data size
    var numRows = lastRow - 1;
    var dataA = expiringSheet.getRange(2, 1, numRows, 1).getValues(); // Employee Name
    var dataB = expiringSheet.getRange(2, 2, numRows, 1).getValues(); // Item Type
    var dataC = expiringSheet.getRange(2, 3, numRows, 1).getValues(); // Expiration Date
    var dataF = expiringSheet.getRange(2, 6, numRows, 1).getValues(); // Days Until
    var dataG = expiringSheet.getRange(2, 7, numRows, 1).getValues(); // Status

    Logger.log('Processing ' + numRows + ' rows');

    // Group by employee
    var empMap = {};
    var priorityCount = 0;
    var expiredCount = 0;
    var skippedPrevious = 0;

    for (var i = 0; i < numRows; i++) {
      var empName = String(dataA[i][0] || '').trim();
      var certType = String(dataB[i][0] || '').trim();
      var expiration = dataC[i][0];
      var daysUntil = dataF[i][0];
      var status = String(dataG[i][0] || '').trim();

      // Skip rows with no employee name
      if (!empName) continue;

      // Skip employees who are NOT current employees (filters out Previous Employees)
      if (!currentEmployees.has(empName.toLowerCase())) {
        skippedPrevious++;
        continue;
      }

      if (!empMap[empName]) {
        empMap[empName] = {
          name: empName,
          certs: [],
          summary: { total: 0, expired: 0, critical: 0 }
        };
      }

      // Format expiration date - keep it simple
      var expDateStr = '';
      if (expiration) {
        if (expiration instanceof Date) {
          var m = expiration.getMonth() + 1;
          var d = expiration.getDate();
          var y = expiration.getFullYear();
          expDateStr = m + '/' + d + '/' + y;
        } else {
          expDateStr = String(expiration).substring(0, 10);
        }
      }

      // Special handling for Crane Evaluation:
      // Crane Evaluation is a non-expiring cert - the date is when evaluation was PERFORMED, not expiration
      // If the row exists with a date, the evaluation is complete and status should be "OK"
      // The evaluation never "expires" - it's a one-time requirement for employees with Crane Cert
      var adjustedStatus = status;
      var adjustedDaysUntil = (daysUntil !== null && daysUntil !== undefined && daysUntil !== '' && daysUntil !== 'N/A') ? Number(daysUntil) : null;

      if (certType === 'Crane Evaluation') {
        // If there's a date, the evaluation is complete - show as OK
        if (expiration && expDateStr !== 'N/A') {
          adjustedStatus = 'OK';
          adjustedDaysUntil = null; // No "days until" for non-expiring cert
        } else {
          // No date means evaluation is missing/needed
          adjustedStatus = 'MISSING';
        }
      }

      empMap[empName].certs.push({
        type: certType || 'Unknown',
        expiration: expDateStr || 'N/A',
        daysUntil: adjustedDaysUntil,
        status: adjustedStatus || 'Unknown',
        isNonExpiring: certType === 'Crane Evaluation' // Flag for UI
      });

      empMap[empName].summary.total++;
      if (adjustedStatus === 'EXPIRED') {
        empMap[empName].summary.expired++;
        expiredCount++;
      }
      if (adjustedStatus === 'CRITICAL') {
        empMap[empName].summary.critical++;
      }
      if (adjustedStatus.indexOf('PRIORITY') !== -1) {
        priorityCount++;
      }
    }

    var employees = Object.keys(empMap).map(function(name) {
      return empMap[name];
    });

    // Sort by most urgent first
    employees.sort(function(a, b) {
      return (b.summary.expired + b.summary.critical) - (a.summary.expired + a.summary.critical);
    });

    Logger.log('=== getExpiringCertsForConfig COMPLETE ===');
    Logger.log('Returning ' + employees.length + ' employees, skipped ' + skippedPrevious + ' previous employees');

    return {
      employees: employees,
      summary: {
        totalEmployees: employees.length,
        priorityCount: priorityCount,
        expiredCount: expiredCount
      }
    };
  } catch (error) {
    Logger.log('ERROR in getExpiringCertsForConfig: ' + error.toString());
    Logger.log('Stack: ' + error.stack);
    throw error;
  }
}

/**
 * Gets expiring certs data formatted for the To Do Schedule expiring certs tab.
 * Returns a flat list of certs with employee, type, expiration, and location.
 */
function getExpiringCertsForSchedule() {
  try {
    Logger.log('=== getExpiringCertsForSchedule START ===');
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var expiringSheet = ss.getSheetByName('Expiring Certs');

    if (!expiringSheet || expiringSheet.getLastRow() < 2) {
      return { certs: [] };
    }

    // Build current employee map with locations AND phone numbers
    var employeeLocations = {};
    var employeePhones = {};
    var currentEmployees = new Set();
    var employeesSheet = ss.getSheetByName('Employees');
    if (employeesSheet && employeesSheet.getLastRow() > 1) {
      var empData = employeesSheet.getDataRange().getValues();
      var empHeaders = empData[0];
      var empNameCol = -1, empLocCol = -1, empPhoneCol = -1;

      for (var eh = 0; eh < empHeaders.length; eh++) {
        var hdr = String(empHeaders[eh]).toLowerCase().trim();
        if (hdr === 'name') empNameCol = eh;
        if (hdr === 'location') empLocCol = eh;
        if (hdr === 'phone number' || hdr === 'phone') empPhoneCol = eh;
      }

      if (empNameCol !== -1) {
        for (var ei = 1; ei < empData.length; ei++) {
          var empName = (empData[ei][empNameCol] || '').toString().trim();
          var empLoc = empLocCol !== -1 ? (empData[ei][empLocCol] || '').toString().trim() : '';
          var empPhone = empPhoneCol !== -1 ? (empData[ei][empPhoneCol] || '').toString().trim() : '';
          if (empName && empLoc.toLowerCase() !== 'previous employee') {
            currentEmployees.add(empName.toLowerCase());
            employeeLocations[empName.toLowerCase()] = empLoc;
            // Clean and store phone number
            if (empPhone) {
              var cleanPhone = empPhone.replace(/\D/g, '');
              if (cleanPhone.length === 10) cleanPhone = '1' + cleanPhone;
              if (cleanPhone.length >= 10) {
                employeePhones[empName.toLowerCase()] = cleanPhone;
              }
            }
          }
        }
      }
    }

    var numRows = expiringSheet.getLastRow() - 1;
    var dataA = expiringSheet.getRange(2, 1, numRows, 1).getValues(); // Employee Name
    var dataB = expiringSheet.getRange(2, 2, numRows, 1).getValues(); // Cert Type
    var dataC = expiringSheet.getRange(2, 3, numRows, 1).getValues(); // Expiration Date
    var dataF = expiringSheet.getRange(2, 6, numRows, 1).getValues(); // Days Until

    // Check for Declined Date column
    var headers = expiringSheet.getRange(1, 1, 1, expiringSheet.getLastColumn()).getValues()[0];
    var declinedColIndex = -1;
    for (var h = 0; h < headers.length; h++) {
      if (String(headers[h]).toLowerCase().trim() === 'declined date') {
        declinedColIndex = h;
        break;
      }
    }
    var declinedData = declinedColIndex >= 0 ?
      expiringSheet.getRange(2, declinedColIndex + 1, numRows, 1).getValues() : null;

    var certs = [];
    for (var i = 0; i < numRows; i++) {
      var empName = String(dataA[i][0] || '').trim();
      var certType = String(dataB[i][0] || '').trim();
      var expDate = dataC[i][0];
      var daysUntil = dataF[i][0];

      if (!empName || !certType) continue;
      if (!currentEmployees.has(empName.toLowerCase())) continue;

      var expDateStr = '';
      if (expDate instanceof Date && !isNaN(expDate.getTime())) {
        expDateStr = Utilities.formatDate(expDate, Session.getScriptTimeZone(), 'MM/dd/yyyy');
      } else if (expDate) {
        expDateStr = String(expDate);
      }

      // Check if this cert was declined
      var declinedDate = null;
      var isDeclined = false;
      if (declinedData && declinedData[i][0]) {
        var decVal = declinedData[i][0];
        if (decVal instanceof Date && !isNaN(decVal.getTime())) {
          declinedDate = Utilities.formatDate(decVal, Session.getScriptTimeZone(), 'MM/dd/yyyy');
          isDeclined = true;
        } else if (decVal) {
          declinedDate = String(decVal);
          isDeclined = true;
        }
      }

      // Special handling for Crane Evaluation:
      // It's a non-expiring cert - the date is when evaluation was PERFORMED, not expiration
      // If date exists, it's complete (status OK), otherwise it's missing
      var adjustedDaysUntil = typeof daysUntil === 'number' ? daysUntil : null;
      var isNonExpiring = false;

      if (certType === 'Crane Evaluation') {
        isNonExpiring = true;
        // If there's a date, evaluation is complete - don't treat as "expired"
        if (expDateStr) {
          adjustedDaysUntil = null; // No "days until" for completed non-expiring cert
        }
      }

      certs.push({
        employee: empName,
        certType: certType,
        expirationDate: expDateStr,
        daysUntilExpiration: adjustedDaysUntil,
        location: employeeLocations[empName.toLowerCase()] || 'Unknown',
        phoneNumber: employeePhones[empName.toLowerCase()] || '',
        isNonExpiring: isNonExpiring,
        rowIndex: i + 2,  // Row number in Expiring Certs sheet (1-based, +1 for header)
        isDeclined: isDeclined,
        declinedDate: declinedDate
      });
    }

    // Sort by days until expiration (expired/soonest first)
    certs.sort(function(a, b) {
      var daysA = a.daysUntilExpiration !== null ? a.daysUntilExpiration : 9999;
      var daysB = b.daysUntilExpiration !== null ? b.daysUntilExpiration : 9999;
      return daysA - daysB;
    });

    Logger.log('=== getExpiringCertsForSchedule COMPLETE: ' + certs.length + ' certs ===');
    return { certs: certs };

  } catch (error) {
    Logger.log('ERROR in getExpiringCertsForSchedule: ' + error.toString());
    throw error;
  }
}

/**
 * Mark a certification as renewed/complete by updating the expiration date
 * @param {string} employee - Employee name
 * @param {string} certType - Certificate type
 */
function markCertAsRenewed(employee, certType) {
  try {
    Logger.log('markCertAsRenewed: ' + employee + ' - ' + certType);
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var expiringSheet = ss.getSheetByName('Expiring Certs');

    if (!expiringSheet) {
      throw new Error('Expiring Certs sheet not found');
    }

    var data = expiringSheet.getDataRange().getValues();
    var found = false;

    for (var i = 1; i < data.length; i++) {
      var empName = String(data[i][0] || '').trim();
      var rowCertType = String(data[i][1] || '').trim();

      if (empName.toLowerCase() === employee.toLowerCase() &&
          rowCertType.toLowerCase() === certType.toLowerCase()) {
        // Update expiration date to today (for non-expiring like Crane Evaluation)
        // or to 2 years from now (for expiring certs like CPR)
        var newDate = new Date();
        if (certType === 'Crane Evaluation') {
          // Non-expiring cert - just update the date to today
          expiringSheet.getRange(i + 1, 3).setValue(newDate);
        } else if (certType === '1st Aid' || certType === 'CPR' || certType === 'First Aid') {
          // These expire in 2 years
          newDate.setFullYear(newDate.getFullYear() + 2);
          expiringSheet.getRange(i + 1, 3).setValue(newDate);
        } else if (certType === 'Crane Cert') {
          // Crane cert expires in 5 years
          newDate.setFullYear(newDate.getFullYear() + 5);
          expiringSheet.getRange(i + 1, 3).setValue(newDate);
        } else if (certType === 'MEC Expiration' || certType === 'MEC') {
          // MEC expires in 2 years
          newDate.setFullYear(newDate.getFullYear() + 2);
          expiringSheet.getRange(i + 1, 3).setValue(newDate);
        } else if (certType === 'DL Expiration' || certType === 'DL') {
          // DL expires in 8 years (varies by state)
          newDate.setFullYear(newDate.getFullYear() + 8);
          expiringSheet.getRange(i + 1, 3).setValue(newDate);
        } else if (certType === 'Harassment Training') {
          // Harassment training typically annual
          newDate.setFullYear(newDate.getFullYear() + 1);
          expiringSheet.getRange(i + 1, 3).setValue(newDate);
        } else {
          // Default: 2 years
          newDate.setFullYear(newDate.getFullYear() + 2);
          expiringSheet.getRange(i + 1, 3).setValue(newDate);
        }

        found = true;
        Logger.log('Updated ' + certType + ' for ' + employee + ' to ' + newDate);
        break;
      }
    }

    if (!found) {
      throw new Error('Certification not found for ' + employee + ' - ' + certType);
    }

    return { success: true };

  } catch (error) {
    Logger.log('ERROR in markCertAsRenewed: ' + error.toString());
    throw error;
  }
}

/**
 * Adds a custom menu to the Google Sheet for Glove Manager actions.
 * Also automatically opens the Quick Actions sidebar.
 */
function onOpen() {
  ensurePickedForColumn();
  var ui = SpreadsheetApp.getUi();
  ui.createMenu('Glove Manager')
    .addItem('Generate All Reports', 'generateAllReports')
    .addSeparator()
    .addItem('📱 Quick Actions', 'openQuickActionsSidebar')
    .addSeparator()
    .addItem('Generate Glove Swaps', 'generateGloveSwaps')
    .addItem('Generate Sleeve Swaps', 'generateSleeveSwaps')
    .addItem('Update Purchase Needs', 'updatePurchaseNeeds')
    .addItem('Update Inventory Reports', 'updateInventoryReports')
    .addItem('Run Reclaims Check', 'runReclaimsCheck')
    .addItem('Update Reclaims Sheet', 'updateReclaimsSheet')
    .addSeparator()
    .addSubMenu(ui.createMenu('📋 History')
      .addItem('Save Current State to History', 'saveHistory')
      .addItem('Import Legacy History', 'showImportLegacyHistoryDialog')
      .addItem('Item History Lookup', 'showItemHistoryLookup')
      .addItem('View Full History', 'viewFullHistory'))
    .addSubMenu(ui.createMenu('📅 Schedule & To-Do')
      .addItem('📋 Tasks & Calendar', 'showToDoSchedule')
      .addItem('🗺️ Trip Planner', 'showTripPlannerDialog')
      .addItem('⚙️ Schedule Config', 'showToDoConfig')
      .addItem('📊 Task Dashboard', 'showTaskDashboard')
      .addSeparator()
      .addItem('🎯 Generate Task Metadata', 'generateTaskMetadata')
      .addItem('🗄️ Archive Completed Tasks', 'showArchiveCompletedTasksDialog')
      .addItem('🗑️ Archive Old To Do List (Legacy)', 'archiveToDoListSheet')
      .addSeparator()
      .addItem('📅 Generate Monthly Schedule', 'generateMonthlySchedule')
      .addItem('🔄 Refresh Calendar', 'refreshCalendar')
      .addItem('✅ Mark Visit Complete', 'markVisitComplete')
      .addItem('🧹 Clear Completed Tasks', 'clearCompletedTasks')
      .addSeparator()
      .addItem('Setup All Schedule Sheets', 'setupAllScheduleSheets')
      .addSeparator()
      .addItem('Setup Crew Visit Config', 'setupCrewVisitConfig')
      .addItem('Setup Training Config', 'setupTrainingConfig')
      .addItem('Setup Training Tracking', 'setupTrainingTracking')
      .addSeparator()
      .addItem('Refresh Training Attendees', 'refreshTrainingAttendees')
      .addItem('🔄 Update December Catch-Ups', 'updateDecemberCatchUps')
      .addItem('⏰ Setup Auto December Updates', 'setupAutoDecemberUpdates')
      .addSeparator()
      .addItem('📊 Recalculate Training Completion %', 'recalculateAllTrainingCompletionStatus')
      .addItem('📊 Generate Compliance Report', 'generateTrainingComplianceReport'))
    .addSubMenu(ui.createMenu('🔧 Utilities')
      .addItem('Fix All Change Out Dates', 'fixAllChangeOutDates')
      .addItem('⚡ Setup Auto Change Out Dates', 'createEditTrigger')
      .addItem('📤 Archive Previous Employees', 'archivePreviousEmployees')
      .addItem('🔄 Update Employee History Headers', 'updateEmployeeHistoryHeaders')
      .addItem('🧹 Clean Up Duplicate History Entries', 'cleanupDuplicateEmployeeHistoryEntries')
      .addItem('📱 Format Phone Numbers', 'formatEmployeePhoneNumbers')
      .addItem('✅ Fix Last Day Reason Dropdown', 'fixLastDayReasonValidation')
      .addSeparator()
      .addItem('📦 Reset Known Item Numbers', 'resetKnownItemNumbers')
      .addItem('🔄 Sync New Items Log', 'syncNewItemsLogWithInventory')
      .addSeparator()
      .addItem('👷 Setup Job Classification Dropdown', 'setupJobClassificationDropdown')
      .addItem('📖 View Classification Guide', 'showClassificationGuide')
      .addSeparator()
      .addItem('📅 Fiscal Year Config', 'showFiscalYearConfig')
      .addItem('👥 Import Crew Makeup', 'showCrewImportDialog')
      .addItem('📥 Import Data', 'showImportDialog')
      .addItem('📥 Quick Import (1084)', 'importProvidedData')
      .addSeparator()
      .addItem('📋 Setup Task Metadata Sheet', 'setupTaskMetadataSheet')
      .addItem('🏥 Task Metadata Health Check', 'showTaskMetadataHealthCheck')
      .addItem('🧹 Remove Duplicate Task Metadata', 'removeDuplicateTaskMetadata')
      .addItem('🧽 Cleanup Orphaned Metadata', 'cleanupOrphanedTaskMetadata')
      .addItem('🧹 Cleanup Incorrect Safety Tasks', 'cleanupIncorrectSafetyReportTasks')
      .addSeparator()
      .addItem('🔄 Migrate Manual Tasks Sheet', 'migrateManualTasksSheet')
      .addItem('🧹 Clean Up Manual Tasks', 'cleanupDuplicateManualTasks')
      .addItem('🗑️ Purge Stuck Task by Location', 'promptPurgeTaskByLocation')
      .addSeparator()
      .addItem('💾 Create Backup Snapshot', 'createBackupSnapshot')
      .addItem('📂 View Backup Folder', 'openBackupFolder'))
    .addSubMenu(ui.createMenu('📧 Email Reports')
      .addItem('📤 Send Report Now', 'sendEmailReport')
      .addItem('👁️ Preview My Report', 'previewEmailReport')
      .addSeparator()
      .addItem('⚙️ Configure Email Reports', 'openEmailReportConfig')
      .addSeparator()
      .addItem('🕐 Set Up Weekly Email (Mon 12 PM)', 'createWeeklyEmailTrigger')
      .addItem('🚫 Remove Scheduled Email', 'removeEmailTrigger'))
    .addSubMenu(ui.createMenu('📊 Reports')
      .addItem('📝 Daily Accomplishments', 'showTimeBreakdownDialog'))
    .addSubMenu(ui.createMenu('🛒 Purchase Orders')
      .addItem('📝 Create Purchase Order', 'showPurchaseOrderDialog')
      .addItem('📋 Order History', 'openPurchaseOrdersSheet')
      .addItem('⚙️ Manage Vendors', 'showVendorConfigDialog'))
    .addSubMenu(ui.createMenu('🛡️ Safety Reports')
      // === MAIN ACTIONS ===
      .addItem('📥 Process Safety Emails', 'showProcessSafetyEmailsDialog')
      .addItem('📊 View Safety Reports', 'openSafetyReports')
      .addItem('📈 View Compliance History', 'openComplianceSheet')
      .addItem('⚙️ Configure Crew Exclusions', 'openComplianceConfig')
      .addItem('👥 Populate Crew Config', 'populateComplianceConfig')
      .addItem('🔧 Add Monthly Checklist Column', 'migrateComplianceConfigAddMonthlyChecklist')
      .addItem('🔧 Fix Notes Column', 'fixNotesColumnCheckboxes')
      .addSeparator()
      // === TASKS ===
      .addItem('📋 Create Tasks from Issues', 'createTasksFromSafetyIssues')
      .addItem('🔄 Refresh Safety Sheets', 'refreshSafetySheets')
      .addItem('📅 Regenerate Previous Week Tasks', 'menuRegeneratePreviousWeekTasks')
      .addItem('📅 Backfill Past Weeks', 'menuBackfillPastWeeks')
      .addItem('🎨 Reformat by Week', 'menuReformatComplianceSheet')
      .addSeparator()
      // === CLEANUP & DEBUG ===
      .addItem('🔍 Diagnose Compliance', 'diagnoseSafetyCompliance')
      .addItem('🧹 Remove Duplicate Rows', 'menuCleanupDuplicateComplianceRows')
      .addItem('🧹 Clear Saved Job Corrections', 'clearJobNumberCorrections')
      .addItem('🛠️ Fix Shifted Safety Tasks', 'fixShiftedSafetyComplianceTasks'))
    .addSubMenu(ui.createMenu('🔍 Debug')
      .addItem('Test Edit Trigger', 'testEditTrigger')
      .addItem('Recalc Current Row', 'recalcCurrentRow')
      .addSeparator()
      .addItem('🔍 Diagnose Employee Pick List', 'runDiagnostic')
      .addItem('📊 Show All Sleeve Swaps', 'runSleeveSwapDiagnostic')
      .addItem('📊 Show All Glove Swaps', 'runGloveSwapDiagnostic')
      .addSeparator()
      .addItem('🔄 Migrate Manual Tasks Sheet', 'migrateManualTasksSheet')
      .addItem('🧪 Test Trip Planner Data', 'debugTripPlannerData')
      .addSeparator()
      .addItem('🔍 Debug Task List', 'debugTaskListData')
      .addItem('🔍 Debug Training Tasks', 'debugTrainingTasks')
      .addItem('🔍 Metadata vs Collection', 'debugMetadataVsCollection')
      .addItem('🧹 Clear Training Filter', 'clearTrainingCrewsFilter'))
    .addSeparator()
    .addItem('Close & Save History', 'closeAndSaveHistory')
    .addToUi();

  // Reset the previous sheet tracker for this session
  PropertiesService.getUserProperties().setProperty('previousSheet', '');

  // Note: Cannot auto-open sidebar from onOpen() due to Google Apps Script restrictions
  // Simple triggers cannot call services that require authorization (like showSidebar)
  // Users can click "Glove Manager → Quick Actions" to open the sidebar
}

/**
 * Test function to verify the edit trigger is working.
 * Run this from the menu to see if triggers are properly set up.
 */
function testEditTrigger() {
  var ui = SpreadsheetApp.getUi();
  var triggers = ScriptApp.getProjectTriggers();
  var triggerInfo = 'Installed triggers: ' + triggers.length + '\n';

  for (var i = 0; i < triggers.length; i++) {
    triggerInfo += '- ' + triggers[i].getHandlerFunction() + ' (' + triggers[i].getEventType() + ')\n';
  }

  triggerInfo += '\nSimple onEdit function exists: ' + (typeof onEdit === 'function' ? 'YES' : 'NO');
  triggerInfo += '\nCOLS.INVENTORY.DATE_ASSIGNED = ' + COLS.INVENTORY.DATE_ASSIGNED;
  triggerInfo += '\nCOLS.INVENTORY.ASSIGNED_TO = ' + COLS.INVENTORY.ASSIGNED_TO;

  ui.alert('Edit Trigger Test', triggerInfo, ui.ButtonSet.OK);
}

/**
 * Manually recalculate Change Out Date for the currently selected row.
 * Use this when the automatic trigger doesn't fire.
 */
function recalcCurrentRow() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getActiveSheet();
  var sheetName = sheet.getName();

  if (sheetName !== SHEET_GLOVES && sheetName !== SHEET_SLEEVES) {
    SpreadsheetApp.getUi().alert('Please select a row in the Gloves or Sleeves sheet.');
    return;
  }

  var activeRow = ss.getActiveCell().getRow();
  if (activeRow < 2) {
    SpreadsheetApp.getUi().alert('Please select a data row (not the header).');
    return;
  }

  // Get current values
  var dateAssigned = sheet.getRange(activeRow, COLS.INVENTORY.DATE_ASSIGNED).getValue();
  var location = sheet.getRange(activeRow, COLS.INVENTORY.LOCATION).getValue();
  var assignedTo = sheet.getRange(activeRow, COLS.INVENTORY.ASSIGNED_TO).getValue();
  var isSleeve = (sheetName === SHEET_SLEEVES);

  // Calculate new Change Out Date
  var changeOutDate = calculateChangeOutDate(dateAssigned, location, assignedTo, isSleeve);

  if (changeOutDate) {
    var changeOutCell = sheet.getRange(activeRow, COLS.INVENTORY.CHANGE_OUT_DATE);
    if (changeOutDate === 'N/A') {
      changeOutCell.setNumberFormat('@');
    } else {
      changeOutCell.setNumberFormat('MM/dd/yyyy');
    }
    changeOutCell.setValue(changeOutDate);

    SpreadsheetApp.getUi().alert(
      'Recalculated',
      'Row ' + activeRow + ':\n' +
      'Date Assigned: ' + dateAssigned + '\n' +
      'Assigned To: ' + assignedTo + '\n' +
      'Location: ' + location + '\n' +
      'New Change Out Date: ' + changeOutDate,
      SpreadsheetApp.getUi().ButtonSet.OK
    );
  } else {
    SpreadsheetApp.getUi().alert('Could not calculate Change Out Date. Date Assigned may be empty.');
  }
}


/**
 * Utility to ensure the 'Picked For' column exists in Gloves and Sleeves tabs.
 *
 * Both tabs have same layout:
 * Columns: Item, Size, Class, Test Date, Date Assigned, Location, Status, Assigned To, Change Out Date, Picked For, Notes
 *          A     B     C      D          E              F         G       H            I                J (col 10)   K
 */
function ensurePickedForColumn() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  [SHEET_GLOVES, SHEET_SLEEVES].forEach(function(sheetName) {
    var sheet = ss.getSheetByName(sheetName);
    if (!sheet) return;
    var lastCol = sheet.getLastColumn();
    var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
    var pickedForIdx = headers.indexOf('Picked For');

    if (pickedForIdx === -1) {
      // Find 'Notes' to insert before it, or just append
      var notesIdx = headers.indexOf('Notes');
      var insertAt = (notesIdx !== -1) ? notesIdx + 1 : lastCol + 1;
      sheet.insertColumnBefore(insertAt);
      sheet.getRange(1, insertAt).setValue('Picked For')
        .setFontWeight('bold')
        .setBackground(HEADER_BG_COLOR)
        .setFontColor('#ffffff')
        .setHorizontalAlignment('center');
      logEvent('Added Picked For column to ' + sheetName + ' at column ' + insertAt);
    }
  });
}

// =============================================================================
// TRIGGER FUNCTIONS - See 11-Triggers.gs
// =============================================================================

/**
 * Handles changes to the Assigned To column in Gloves/Sleeves tabs.
 * Updates Status and Location based on the new assignment.
 */
function handleInventoryAssignedToChange(ss, sheet, sheetName, editedRow, newValue) {
  if (editedRow < 2) return; // Skip header row

  // Schema cache was removed during refactoring (Jan 2026) - using COLS constants instead

  var lock = null;
  try {
    // Try to get a lock (may fail with simple triggers due to authorization)
    try {
      lock = LockService.getScriptLock();
      lock.waitLock(30000);
    } catch (lockErr) {
      // Simple trigger - proceed without lock
      lock = null;
    }

    // Get the actual cell value directly from the sheet (more reliable than e.value)
    var assignedToCol = getCol(sheetName, 'Assigned To') || 8;  // Column H fallback
    var actualValue = sheet.getRange(editedRow, assignedToCol).getValue();

    logEvent('handleInventoryAssignedToChange ENTRY: Row=' + editedRow + ', newValue=' + newValue + ', actualValue=' + actualValue, 'DEBUG');

    var employeesSheet = ss.getSheetByName(SHEET_EMPLOYEES);
    if (!employeesSheet) {
      logEvent('handleInventoryAssignedToChange: Employees sheet not found!', 'ERROR');
      return;
    }

    // Build name to location map - use dynamic column lookup
    var empData = employeesSheet.getDataRange().getValues();
    var empHeaders = empData[0];
    var nameColIdx = 0; // Name is always first column
    var locationColIdx = -1;

    // Find Location column dynamically
    for (var h = 0; h < empHeaders.length; h++) {
      if (String(empHeaders[h]).trim().toLowerCase() === 'location') {
        locationColIdx = h;
        break;
      }
    }

    if (locationColIdx === -1) {
      logEvent('handleInventoryAssignedToChange: Location column not found in Employees sheet!', 'ERROR');
      locationColIdx = 2; // Fallback - Location is typically at index 2 (column C)
    }

    var nameToLocation = {};
    for (var i = 1; i < empData.length; i++) {
      var name = (empData[i][nameColIdx] || '').toString().trim().toLowerCase();
      var loc = empData[i][locationColIdx] || '';
      if (name) nameToLocation[name] = loc;
    }

    // Also check Employee History for Previous Employees (terminated employees not in current Employees sheet)
    var previousEmployeeNames = new Set();
    var employeeHistorySheet = ss.getSheetByName('Employee History');
    if (employeeHistorySheet && employeeHistorySheet.getLastRow() > 2) {
      var historyData = employeeHistorySheet.getRange(3, 1, employeeHistorySheet.getLastRow() - 2, 10).getValues();
      // Employee History columns: A=Date, B=Employee Name, C=Event Type, D=Location
      for (var hi = 0; hi < historyData.length; hi++) {
        var histName = (historyData[hi][1] || '').toString().trim();
        var histNameLower = histName.toLowerCase();
        var histLocation = (historyData[hi][3] || '').toString().trim().toLowerCase();

        // If this employee has Location = "Previous Employee" and not already in current employees
        if (histLocation === 'previous employee' && histName && !nameToLocation[histNameLower]) {
          nameToLocation[histNameLower] = 'Previous Employee';
          previousEmployeeNames.add(histNameLower);
        }
      }
    }

    logEvent('handleInventoryAssignedToChange: Built nameToLocation map with ' + Object.keys(nameToLocation).length + ' entries (including ' + previousEmployeeNames.size + ' previous employees)', 'DEBUG');

    // Use actualValue from the cell, fall back to newValue if needed
    var assignedTo = (actualValue !== undefined && actualValue !== null && actualValue !== '')
                     ? actualValue.toString().trim()
                     : (newValue || '').toString().trim();
    var assignedToLower = assignedTo.toLowerCase();

    logEvent('handleInventoryAssignedToChange: Processing assignedTo="' + assignedTo + '", lowercase="' + assignedToLower + '"', 'DEBUG');

    // Determine new status and location based on assigned to value
    var newStatus = '';
    var newLocation = '';

    if (assignedToLower === 'on shelf') {
      newStatus = 'On Shelf';
      newLocation = nameToLocation['on shelf'] || 'Helena';
    } else if (assignedToLower === 'packed for delivery') {
      newStatus = 'Ready For Delivery';
      newLocation = nameToLocation['packed for delivery'] || "Cody's Truck";
    } else if (assignedToLower === 'packed for testing') {
      newStatus = 'Ready For Test';
      newLocation = nameToLocation['packed for testing'] || "Cody's Truck";
    } else if (assignedToLower === 'in testing') {
      newStatus = 'In Testing';
      newLocation = nameToLocation['in testing'] || 'Arnett / JM Test';
    } else if (assignedToLower === 'failed rubber' || assignedToLower === 'not repairable') {
      newStatus = 'Failed Rubber';
      newLocation = 'Destroyed';
    } else if (assignedToLower === 'lost') {
      newStatus = 'Lost';
      newLocation = 'Lost';
    } else if (nameToLocation[assignedToLower]) {
      // Regular employee assignment (or previous employee from history)
      newStatus = 'Assigned';
      newLocation = nameToLocation[assignedToLower];
    } else if (assignedTo !== '') {
      // Name not found in map or history
      logEvent('handleInventoryAssignedToChange: Employee "' + assignedTo + '" not found in ' + SHEET_EMPLOYEES + ' or Employee History', 'WARNING');
      newStatus = 'Assigned';
      newLocation = 'Unknown';
    }

    // Use COLS constants for column indices (more reliable than dynamic lookup)
    var colStatus = COLS.INVENTORY.STATUS;              // Column G = 7
    var colLocation = COLS.INVENTORY.LOCATION;          // Column F = 6
    var colDateAssigned = COLS.INVENTORY.DATE_ASSIGNED; // Column E = 5
    var colChangeOutDate = COLS.INVENTORY.CHANGE_OUT_DATE; // Column I = 9

    logEvent('handleInventoryAssignedToChange: Row=' + editedRow + ', AssignedTo=' + assignedTo +
             ', newStatus=' + newStatus + ', newLocation=' + newLocation +
             ', colStatus=' + colStatus + ', colLocation=' + colLocation, 'DEBUG');

    // Update Status and Location if we determined values
    if (newStatus) {
      sheet.getRange(editedRow, colStatus).setValue(newStatus);
      logEvent('Set Status to "' + newStatus + '" at row ' + editedRow + ', col ' + colStatus, 'DEBUG');
    }
    if (newLocation) {
      sheet.getRange(editedRow, colLocation).setValue(newLocation);
      logEvent('Set Location to "' + newLocation + '" at row ' + editedRow + ', col ' + colLocation, 'DEBUG');
    }

    // Update Change Out Date based on Date Assigned
    if (colDateAssigned && colChangeOutDate) {
      var dateAssigned = sheet.getRange(editedRow, colDateAssigned).getValue();
      if (dateAssigned) {
        var isSleeve = (sheetName === SHEET_SLEEVES);
        var changeOutDate = calculateChangeOutDate(dateAssigned, newLocation, assignedTo, isSleeve);
        if (changeOutDate) {
          var changeOutCell = sheet.getRange(editedRow, colChangeOutDate);
          if (changeOutDate === 'N/A') {
            changeOutCell.setNumberFormat('@');  // Plain text for N/A
          } else {
            changeOutCell.setNumberFormat('MM/dd/yyyy');
          }
          changeOutCell.setValue(changeOutDate);
          logEvent('Set Change Out Date to ' + changeOutDate + ' for row ' + editedRow, 'DEBUG');
        }
      }
    }

  } catch (e) {
    logEvent('handleInventoryAssignedToChange error: ' + e, 'ERROR');
  } finally {
    if (lock) lock.releaseLock();
  }
}

/**
 * Handles changes to the Date Assigned column in Gloves/Sleeves tabs.
 * Automatically recalculates and updates the Change Out Date based on Location.
 */
function handleDateAssignedChange(ss, sheet, sheetName, editedRow, newValue) {
  if (editedRow < 2) return; // Skip header row

  var lock = null;
  try {
    // Try to get a lock (may fail with simple triggers due to authorization)
    try {
      lock = LockService.getScriptLock();
      lock.waitLock(30000);
    } catch (lockErr) {
      // Simple trigger - proceed without lock
      lock = null;
    }

    // Flush any pending changes to ensure we read fresh data
    SpreadsheetApp.flush();

    logEvent('handleDateAssignedChange: Row=' + editedRow + ', newValue=' + newValue + ', type=' + typeof newValue, 'DEBUG');

    // Get column indices - use COLS constants with fallbacks
    var colDateAssigned = COLS.INVENTORY.DATE_ASSIGNED;   // Column E = 5
    var colLocation = COLS.INVENTORY.LOCATION;            // Column F = 6
    var colChangeOutDate = COLS.INVENTORY.CHANGE_OUT_DATE; // Column I = 9
    var colAssignedTo = COLS.INVENTORY.ASSIGNED_TO;       // Column H = 8

    // Get the current location and assigned to
    var location = sheet.getRange(editedRow, colLocation).getValue();
    var assignedTo = sheet.getRange(editedRow, colAssignedTo).getValue();

    // Read the actual cell value to get the proper Date object
    var dateAssigned = sheet.getRange(editedRow, colDateAssigned).getValue();

    // Determine if this is a sleeve
    var isSleeve = (sheetName === SHEET_SLEEVES);

    logEvent('handleDateAssignedChange: dateAssigned=' + dateAssigned + ', location=' + location + ', assignedTo=' + assignedTo + ', isSleeve=' + isSleeve, 'DEBUG');

    // Calculate Change Out Date
    var changeOutDate = calculateChangeOutDate(dateAssigned, location, assignedTo, isSleeve);

    logEvent('handleDateAssignedChange: Calculated changeOutDate=' + changeOutDate, 'DEBUG');

    if (changeOutDate) {
      var changeOutDateCell = sheet.getRange(editedRow, colChangeOutDate);
      if (changeOutDate === 'N/A') {
        changeOutDateCell.setNumberFormat('@');  // Plain text for N/A
      } else {
        changeOutDateCell.setNumberFormat('MM/dd/yyyy');
      }
      changeOutDateCell.setValue(changeOutDate);
      SpreadsheetApp.flush(); // Ensure the value is written
      logEvent('handleDateAssignedChange: Set Change Out Date to ' + changeOutDate + ' for row ' + editedRow, 'DEBUG');
    } else {
      logEvent('handleDateAssignedChange: Could not calculate Change Out Date for dateAssigned=' + dateAssigned, 'WARNING');
    }

  } catch (e) {
    logEvent('handleDateAssignedChange error: ' + e, 'ERROR');
  } finally {
    if (lock) lock.releaseLock();
  }
}

/**
 * Handles changes to the Notes column in Gloves/Sleeves tabs.
 * Detects "LOST-LOCATE" marker and applies visual highlighting.
 * Items marked with LOST-LOCATE will appear in the Lost Items section on Reclaims.
 *
 * Accepted markers (case-insensitive):
 * - LOST-LOCATE
 * - LOST LOCATE
 * - LOCATE
 */
function handleNotesChange(ss, sheet, sheetName, editedRow, newValue) {
  if (editedRow < 2) return; // Skip header row
  if (!sheet) {
    logEvent('handleNotesChange: sheet is undefined', 'ERROR');
    return;
  }

  try {
    var notesValue = (newValue || '').toString().trim().toUpperCase();
    var isLostLocate = notesValue.indexOf('LOST-LOCATE') !== -1 ||
                       notesValue.indexOf('LOST LOCATE') !== -1 ||
                       notesValue === 'LOCATE';

    // Get the number of columns in the row (up to column K = 11)
    var lastCol = sheet.getLastColumn();
    var numCols = Math.min(lastCol || 11, 11);

    if (isLostLocate) {
      // Apply orange/red highlight to the entire row to indicate lost item
      sheet.getRange(editedRow, 1, 1, numCols).setBackground('#ffccbc');  // Light orange/red
      sheet.getRange(editedRow, 11).setFontWeight('bold').setFontColor('#d32f2f');  // Bold red Notes

      // Log the event
      var itemNum = sheet.getRange(editedRow, 1).getValue();
      logEvent(sheetName + ' item ' + itemNum + ' marked as LOST-LOCATE at row ' + editedRow, 'INFO');

    } else {
      // Clear the highlighting if marker is removed
      sheet.getRange(editedRow, 1, 1, numCols).setBackground(null);
      sheet.getRange(editedRow, 11).setFontWeight('normal').setFontColor(null);

      // Log the event
      var itemNum2 = sheet.getRange(editedRow, 1).getValue();
      logEvent(sheetName + ' item ' + itemNum2 + ' LOST-LOCATE marker removed at row ' + editedRow, 'INFO');
    }

  } catch (e) {
    logEvent('handleNotesChange error: ' + e, 'ERROR');
  }
}

// =============================================================================
// CHANGE OUT DATE FUNCTIONS - See 21-ChangeOutDate.gs
// =============================================================================

/**
 * Handles manual edits to the Pick List Item # column (G) in Glove/Sleeve Swaps.
 * Applies light blue background (#e3f2fd) to indicate manual entry.
rate All Reports * Updates status based on inventory item status and populates Stage 1 columns.
 * @param {Spreadsheet} ss - The active spreadsheet
 * @param {Sheet} swapSheet - The Glove/Sleeve Swaps sheet
 * @param {Sheet} inventorySheet - The Gloves/Sleeves inventory sheet
 * @param {number} editedRow - Row that was edited (1-based)
 * @param {string} newValue - The new Pick List item number
 * @param {boolean} isGloveSwaps - True if Glove Swaps, false if Sleeve Swaps
 */
function handlePickListManualEdit(ss, swapSheet, inventorySheet, editedRow, newValue, isGloveSwaps) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);

    logEvent('Manual Pick List edit at row ' + editedRow + ': ' + newValue, 'DEBUG');

    // Mark with blue background
    var editedCell = swapSheet.getRange(editedRow, 7);
    editedCell.setBackground('#e3f2fd');

    // If newValue is empty or '—', clear the status and Stage 1 data
    if (!newValue || newValue === '—' || newValue.toString().trim() === '') {
      swapSheet.getRange(editedRow, 8).setValue('Need to Purchase ❌');
      swapSheet.getRange(editedRow, 11, 1, 3).clearContent(); // Clear Stage 1 columns K, L, M
      logEvent('Pick List cleared for row ' + editedRow, 'INFO');
      return;
    }

    // Look up the item in inventory
    var inventoryData = inventorySheet.getDataRange().getValues();
    var itemRow = -1;
    var itemData = null;

    for (var i = 1; i < inventoryData.length; i++) {
      if (String(inventoryData[i][0]).trim() === String(newValue).trim()) {
        itemRow = i;
        itemData = inventoryData[i];
        break;
      }
    }

    if (!itemData) {
      // Item not found in inventory
      swapSheet.getRange(editedRow, 8).setValue('Item Not Found ❌ (Manual)');
      swapSheet.getRange(editedRow, 11, 1, 3).clearContent();
      logEvent('Manual Pick List item ' + newValue + ' not found in inventory', 'WARNING');
      return;
    }

    // Get item data from inventory
    var itemStatus = (itemData[6] || '').toString().trim();
    var itemAssignedTo = (itemData[7] || '').toString().trim();
    var itemDateAssigned = itemData[4] || '';
    var itemStatusLower = itemStatus.toLowerCase();

    // Determine the status for column H
    var displayStatus = '';
    if (itemStatusLower === 'on shelf') {
      displayStatus = 'In Stock ✅ (Manual)';
    } else if (itemStatusLower === 'ready for delivery') {
      displayStatus = 'Ready For Delivery 🚚 (Manual)';
    } else if (itemStatusLower === 'in testing') {
      displayStatus = 'In Testing ⏳ (Manual)';
    } else {
      displayStatus = itemStatus + ' (Manual)';
    }

    // Update Status column (H)
    swapSheet.getRange(editedRow, 8).setValue(displayStatus);

    // Populate Stage 1 columns (K, L, M) with current inventory state
    var stage1Data = [[
      itemStatus,        // K - Status
      itemAssignedTo,    // L - Assigned To
      itemDateAssigned   // M - Date Assigned
    ]];
    swapSheet.getRange(editedRow, 11, 1, 3).setValues(stage1Data);

    logEvent('Manual Pick List entry updated for row ' + editedRow + ': Item #' + newValue + ', Status: ' + displayStatus, 'INFO');

  } catch (e) {
    logEvent('handlePickListManualEdit error: ' + e, 'ERROR');
  } finally {
    lock.releaseLock();
  }
}

/**
 * Handles Picked checkbox changes (column I) in Glove/Sleeve Swaps.
 * Stage 2: When checked - updates Pick List glove to Ready For Delivery
 * Stage 5: When unchecked - reverts Pick List glove to Stage 1 state
 */
function handlePickedCheckboxChange(ss, swapSheet, inventorySheet, editedRow, newValue, isGloveSwaps) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);

    var isChecked = (newValue === true || newValue === 'TRUE' || newValue === true);

    // Get the row data (columns A-W, 1-23)
    var rowData = swapSheet.getRange(editedRow, 1, 1, 23).getValues()[0];

    // Use HARDCODED indices for Swap sheets - getCol() fails because row 1 contains
    // "Class X Glove/Sleeve Swaps" title, not column headers. The structure is fixed
    // per writeSwapTableHeadersDynamic(): A=Employee, B=Current Item#, C=Size,
    // D=Date Assigned, E=Change Out Date, F=Days Left, G=Pick List Item#,
    // H=Status, I=Picked, J=Date Changed
    var colEmpIdx = 0;       // Column A - Employee
    var colPickNumIdx = 6;   // Column G - Pick List Item #
    var colStatusIdx = 7;    // Column H - Status

    var stage1StatusIdx = 10;
    var stage1AssignedToIdx = 11;
    var stage1DateAssignedIdx = 12;

    var employeeName = rowData[colEmpIdx];
    var pickListNum = rowData[colPickNumIdx];
    var currentStatus = rowData[colStatusIdx];

    var stage1Status = rowData[stage1StatusIdx];
    var stage1AssignedTo = rowData[stage1AssignedToIdx];
    var stage1DateAssigned = rowData[stage1DateAssignedIdx];

    if (!pickListNum || pickListNum === '—') {
      logEvent('handlePickedCheckboxChange: No Pick List item for row ' + editedRow, 'WARNING');
      return;
    }

    // Find the Pick List item in the inventory sheet
    // Column A (index 0) is always the item number (header: "Glove" or "Sleeve Number")
    var inventoryData = inventorySheet.getDataRange().getValues();
    var invSheetName = inventorySheet.getName();

    var pickListRow = -1;
    for (var i = 1; i < inventoryData.length; i++) {
      if (String(inventoryData[i][0]).trim() === String(pickListNum).trim()) {
        pickListRow = i + 1;
        break;
      }
    }

    if (pickListRow === -1) {
      logEvent('handlePickedCheckboxChange: Pick List item ' + pickListNum + ' not found in ' + invSheetName, 'ERROR');
      return;
    }

    // Inventory sheet columns (1-based) - structure: A=Item#, B=Size, C=Class,
    // D=Test Date, E=Date Assigned(5), F=Location(6), G=Status(7),
    // H=Assigned To(8), I=Change Out Date(9), J=Picked For(10)
    var invColDateAssigned = 5;
    var invColLocation = 6;
    var invColStatus = 7;
    var invColAssignedTo = 8;
    var invColPickedFor = 10;

    var today = new Date();
    var todayStr = Utilities.formatDate(today, ss.getSpreadsheetTimeZone(), 'yyyy-MM-dd');

    if (isChecked) {
      // STAGE 2: Picked checkbox checked
      logEvent('Stage 2: Picked checked for row ' + editedRow + ', Pick List: ' + pickListNum);

      // VALIDATION: Check if item is "In Testing" - if so, BLOCK the action
      var currentInvStatus = inventorySheet.getRange(pickListRow, invColStatus).getValue();
      var isInTesting = currentInvStatus && currentInvStatus.toString().trim().toLowerCase() === 'in testing';

      if (isInTesting) {
        // CANNOT pick items that are In Testing
        logEvent('Stage 2 BLOCKED: Cannot pick item ' + pickListNum + ' - status is "In Testing"', 'WARNING');

        // Uncheck the checkbox
        swapSheet.getRange(editedRow, 9).setValue(false);

        // Show error message to user
        SpreadsheetApp.getUi().alert(
          '⚠️ Cannot Pick Item',
          'Item ' + pickListNum + ' is currently "In Testing" and cannot be picked for delivery.\n\n' +
          'Please wait until testing is complete and the item status changes to "Ready For Delivery".',
          SpreadsheetApp.getUi().ButtonSet.OK
        );
        return;
      }

      // Update visible Status column (H = column 8, 1-based)
      swapSheet.getRange(editedRow, 8).setValue('Ready For Delivery 🚚');

      // Store Stage 2 values in columns Q-T (indices 16-19)
      var stage2Values = [
        'Ready For Delivery',           // Q - Status
        'Packed For Delivery',          // R - Assigned To
        todayStr,                       // S - Date Assigned
        employeeName + ' Picked On ' + todayStr  // T - Picked For
      ];
      swapSheet.getRange(editedRow, 17, 1, 4).setValues([stage2Values]);

      // Update the Pick List item in inventory sheet
      var todayFormatted = Utilities.formatDate(today, ss.getSpreadsheetTimeZone(), 'MM/dd/yyyy');
      var isSleeve = !isGloveSwaps;
      inventorySheet.getRange(pickListRow, invColStatus).setValue('Ready For Delivery');
      inventorySheet.getRange(pickListRow, invColAssignedTo).setValue('Packed For Delivery');
      inventorySheet.getRange(pickListRow, invColDateAssigned).setValue(todayFormatted);
      inventorySheet.getRange(pickListRow, invColLocation).setValue("Cody's Truck");
      inventorySheet.getRange(pickListRow, invColPickedFor).setValue(employeeName + ' Picked On ' + todayStr);

      // Calculate and set Change Out Date based on new assignment (Packed For Delivery = 3 months)
      var changeOutDate = calculateChangeOutDate(today, "Cody's Truck", 'Packed For Delivery', isSleeve);
      if (changeOutDate && changeOutDate !== 'N/A') {
        var invColChangeOutDate = 9;  // Column I
        var changeOutCell = inventorySheet.getRange(pickListRow, invColChangeOutDate);
        changeOutCell.setNumberFormat('MM/dd/yyyy');
        changeOutCell.setValue(changeOutDate);
        logEvent('Stage 2: Set Change Out Date to ' + changeOutDate + ' for item ' + pickListNum);
      }

    } else {
      // STAGE 5: Picked checkbox unchecked - revert to Stage 1
      logEvent('Stage 5 Revert: ' + pickListNum + ' returned to ' + (stage1Status || 'Stage 1 state'));

      // Clear Date Changed (column J = column 10)
      swapSheet.getRange(editedRow, 10).setValue('');

      // Clear Stage 2 (Q-T) and Stage 3 (U-W) columns
      swapSheet.getRange(editedRow, 17, 1, 7).clearContent();

      // Revert visible Status based on original status
      var revertedStatus = stage1Status || 'In Stock ✅';
      if (stage1Status) {
        var statusLower = stage1Status.toString().toLowerCase();
        if (statusLower === 'on shelf') {
          revertedStatus = 'In Stock ✅';
        } else if (statusLower === 'ready for delivery') {
          revertedStatus = 'Ready For Delivery 🚚';
        } else if (statusLower === 'in testing') {
          revertedStatus = 'In Testing ⏳';
        }
      }
      // Update visible Status column (H = column 8, 1-based)
      swapSheet.getRange(editedRow, 8).setValue(revertedStatus);

      // Revert Pick List item in inventory to Stage 1 values
      var revertStatus = stage1Status || 'On Shelf';
      var revertAssignedTo = stage1AssignedTo || 'On Shelf';
      var revertLocation = 'Helena';  // Default location for On Shelf items
      var isSleeve = !isGloveSwaps;
      var invColChangeOutDate = 9;  // Column I

      inventorySheet.getRange(pickListRow, invColStatus).setValue(revertStatus);
      inventorySheet.getRange(pickListRow, invColAssignedTo).setValue(revertAssignedTo);
      inventorySheet.getRange(pickListRow, invColLocation).setValue(revertLocation);
      inventorySheet.getRange(pickListRow, invColPickedFor).setValue('');

      // Revert Date Assigned and recalculate Change Out Date
      if (stage1DateAssigned) {
        var stage1Date = new Date(stage1DateAssigned);
        if (!isNaN(stage1Date.getTime())) {
          var stage1DateFormatted = Utilities.formatDate(stage1Date, ss.getSpreadsheetTimeZone(), 'MM/dd/yyyy');
          inventorySheet.getRange(pickListRow, invColDateAssigned).setValue(stage1DateFormatted);

          // Calculate and set Change Out Date based on reverted assignment
          var revertChangeOutDate = calculateChangeOutDate(stage1Date, revertLocation, revertAssignedTo, isSleeve);
          if (revertChangeOutDate) {
            var revertChangeOutCell = inventorySheet.getRange(pickListRow, invColChangeOutDate);
            if (revertChangeOutDate === 'N/A') {
              revertChangeOutCell.setNumberFormat('@');
            } else {
              revertChangeOutCell.setNumberFormat('MM/dd/yyyy');
            }
            revertChangeOutCell.setValue(revertChangeOutDate);
            logEvent('Stage 5: Reverted Change Out Date to ' + revertChangeOutDate + ' for item ' + pickListNum);
          }
        } else {
          inventorySheet.getRange(pickListRow, invColDateAssigned).setValue(stage1DateAssigned);
        }
      } else {
        // No stage 1 date stored - keep current date but recalculate change out
        var currentDateAssigned = inventorySheet.getRange(pickListRow, invColDateAssigned).getValue();
        var fallbackChangeOutDate = calculateChangeOutDate(currentDateAssigned || today, revertLocation, revertAssignedTo, isSleeve);
        if (fallbackChangeOutDate) {
          var fallbackCell = inventorySheet.getRange(pickListRow, invColChangeOutDate);
          if (fallbackChangeOutDate === 'N/A') {
            fallbackCell.setNumberFormat('@');
          } else {
            fallbackCell.setNumberFormat('MM/dd/yyyy');
          }
          fallbackCell.setValue(fallbackChangeOutDate);
          logEvent('Stage 5: Set fallback Change Out Date to ' + fallbackChangeOutDate + ' for item ' + pickListNum);
        }
      }
    }
  } catch (e) {
    logEvent('handlePickedCheckboxChange error: ' + e, 'ERROR');
  } finally {
    lock.releaseLock();
  }
}

/**
 * Handles Date Changed edits (column J) in Glove/Sleeve Swaps.
 * Stage 3: When date entered - completes swap, assigns new glove to employee, old glove to testing
 * Stage 4: When date removed - reverts Pick List glove to Stage 2 state
 */
function handleDateChangedEdit(ss, swapSheet, inventorySheet, editedRow, newValue, isGloveSwaps) {
  var hasDate = (newValue !== null && newValue !== undefined && newValue !== '');

  // Get the row data (columns A-W, 1-23)
  var rowData = swapSheet.getRange(editedRow, 1, 1, 23).getValues()[0];

  var employeeName = rowData[0];     // Column A
  var oldItemNum = rowData[1];       // Column B - Current/Old glove number
  var pickListNum = rowData[6];      // Column G - Pick List glove/sleeve number
  var isPicked = rowData[8];         // Column I - Picked checkbox

  // Stage 2 stored values (columns Q-T, indices 16-19)
  var stage2Status = rowData[16];
  var stage2AssignedTo = rowData[17];
  var stage2DateAssigned = rowData[18];
  var stage2PickedFor = rowData[19];

  // Old glove Stage 1 values (columns N-P, indices 13-15)
  var oldGloveStatus = rowData[13];
  var oldGloveAssignedTo = rowData[14];
  var oldGloveDateAssigned = rowData[15];

  if (!pickListNum || pickListNum === '—') {
    Logger.log('processEdit: No Pick List item for row ' + editedRow);
    return;
  }

  // Verify Picked is checked before processing Date Changed
  if (!isPicked && hasDate) {
    Logger.log('processEdit: Date Changed entered but Picked not checked - ignoring');
    return;
  }

  // Find the Pick List item in the inventory sheet
  var inventoryData = inventorySheet.getDataRange().getValues();
  var pickListRow = -1;
  var oldItemRow = -1;

  for (var i = 1; i < inventoryData.length; i++) {
    var itemNum = String(inventoryData[i][0]).trim();
    if (itemNum === String(pickListNum).trim()) {
      pickListRow = i + 1;
    }
    if (oldItemNum && itemNum === String(oldItemNum).trim()) {
      oldItemRow = i + 1;
    }
  }

  if (pickListRow === -1) {
    Logger.log('processEdit: Pick List item not found: ' + pickListNum);
    return;
  }

  // Get employee location from Employees sheet
  var employeesSheet = ss.getSheetByName(SHEET_EMPLOYEES);
  var employeeLocation = 'Helena';
  if (employeesSheet) {
    var empData = employeesSheet.getDataRange().getValues();
    for (var j = 1; j < empData.length; j++) {
      if ((empData[j][0] || '').toString().trim().toLowerCase() === employeeName.toString().trim().toLowerCase()) {
        employeeLocation = empData[j][2] || 'Helena';
        break;
      }
    }
  }

  if (hasDate) {
    // STAGE 3: Date Changed entered - complete the swap
    Logger.log('Stage 3: Date Changed entered for row ' + editedRow + ', completing swap');
    Logger.log('Date Changed raw value: ' + newValue + ', type: ' + typeof newValue);

    // Parse the date properly - handle both Date objects and string formats
    var dateChanged;
    if (newValue instanceof Date) {
      dateChanged = newValue;
    } else {
      // Try to parse as date string
      dateChanged = new Date(newValue);
    }

    // If still invalid, try manual parsing for common formats like MM/DD/YYYY
    if (isNaN(dateChanged.getTime())) {
      var parts = String(newValue).split('/');
      if (parts.length === 3) {
        dateChanged = new Date(parseInt(parts[2]), parseInt(parts[0]) - 1, parseInt(parts[1]));
      }
    }

    // Last resort - use today
    if (isNaN(dateChanged.getTime())) {
      Logger.log('Could not parse date, using today');
      dateChanged = new Date();
    }

    var dateChangedStr = Utilities.formatDate(dateChanged, ss.getSpreadsheetTimeZone(), 'yyyy-MM-dd');
    var dateChangedFormatted = Utilities.formatDate(dateChanged, ss.getSpreadsheetTimeZone(), 'MM/dd/yyyy');
    Logger.log('Parsed date: ' + dateChangedFormatted);

    // Calculate Change Out Date based on location, assignedTo, and item type
    // Determine if this is a sleeve swap
    var isSleeve = (swapSheet.getName() === SHEET_SLEEVE_SWAPS);
    var changeOutDate = calculateChangeOutDate(dateChanged, employeeLocation, employeeName, isSleeve);
    var changeOutDateFormatted = changeOutDate && changeOutDate !== 'N/A'
      ? Utilities.formatDate(changeOutDate, ss.getSpreadsheetTimeZone(), 'MM/dd/yyyy')
      : (changeOutDate === 'N/A' ? 'N/A' : '');

    // Store Stage 3 values in columns U-W (indices 20-22)
    var stage3Values = [
      employeeName,                    // U - Assigned To
      dateChangedStr,                  // V - Date Assigned
      changeOutDateFormatted           // W - Change Out Date
    ];
    swapSheet.getRange(editedRow, 21, 1, 3).setValues([stage3Values]);

    // Update visible Status and Days Left to "Assigned"
    swapSheet.getRange(editedRow, 8).setValue('Assigned').setFontWeight('bold').setFontColor('#2e7d32');
    swapSheet.getRange(editedRow, 6).setValue('Assigned').setFontWeight('bold').setFontColor('#2e7d32');

    // Update the Pick List item (NEW glove/sleeve) in inventory - assign to employee
    inventorySheet.getRange(pickListRow, 7).setValue('Assigned');           // Status (G)
    inventorySheet.getRange(pickListRow, 8).setValue(employeeName);         // Assigned To (H)
    inventorySheet.getRange(pickListRow, 5).setNumberFormat('MM/dd/yyyy').setValue(dateChanged); // Date Assigned (E)
    inventorySheet.getRange(pickListRow, 6).setValue(employeeLocation);     // Location (F)
    // Write Change Out Date to inventory with proper formatting
    var changeOutCell = inventorySheet.getRange(pickListRow, 9); // Column I
    if (changeOutDate === 'N/A') {
      changeOutCell.setNumberFormat('@').setValue('N/A');  // Plain text for N/A
    } else if (changeOutDate) {
      changeOutCell.setNumberFormat('MM/dd/yyyy').setValue(changeOutDate);  // Date object
    }
    inventorySheet.getRange(pickListRow, 10).setValue('');                  // Clear Picked For (J)

    // Update the Old glove - send for testing
    if (oldItemRow > 0) {
      inventorySheet.getRange(oldItemRow, 7).setValue('Ready For Test');    // Status (G)
      inventorySheet.getRange(oldItemRow, 8).setValue('Packed For Testing');// Assigned To (H)
      inventorySheet.getRange(oldItemRow, 5).setNumberFormat('MM/dd/yyyy').setValue(dateChanged); // Date Assigned (E)
      inventorySheet.getRange(oldItemRow, 6).setValue("Cody's Truck");      // Location (F)

      // Calculate Change Out Date for old item (Packed For Testing = 3 months for gloves, 12 months for sleeves)
      var oldItemChangeOutDate = calculateChangeOutDate(dateChanged, "Cody's Truck", 'Packed For Testing', isSleeve);
      var oldItemChangeOutCell = inventorySheet.getRange(oldItemRow, 9); // Column I
      if (oldItemChangeOutDate === 'N/A') {
        oldItemChangeOutCell.setNumberFormat('@').setValue('N/A');
      } else if (oldItemChangeOutDate) {
        oldItemChangeOutCell.setNumberFormat('MM/dd/yyyy').setValue(oldItemChangeOutDate);
      }
      Logger.log('Stage 3: Set old item ' + oldItemNum + ' Change Out Date to ' + oldItemChangeOutDate);
    }

  } else {
    // STAGE 4: Date Changed removed - revert to Stage 2 state
    Logger.log('Stage 4: Date Changed removed for row ' + editedRow + ', reverting to Stage 2');

    // Clear Stage 3 columns (U-W)
    swapSheet.getRange(editedRow, 21, 1, 3).clearContent();

    // Revert visible Status to Stage 2 emoji status
    swapSheet.getRange(editedRow, 8).setValue('Ready For Delivery 🚚');

    // Recalculate Days Left based on Change Out Date
    var changeOutDateVal = swapSheet.getRange(editedRow, 5).getValue();
    if (changeOutDateVal) {
      var today = new Date();
      var changeOut = new Date(changeOutDateVal);
      var diffDays = Math.ceil((changeOut - today) / (1000 * 60 * 60 * 24));
      var daysLeftText = diffDays < 0 ? 'OVERDUE' : String(diffDays);
      var daysLeftColor = diffDays < 0 ? '#d32f2f' : (diffDays <= 14 ? '#ff9800' : '#2e7d32');
      swapSheet.getRange(editedRow, 6).setValue(daysLeftText).setFontColor(daysLeftColor);
    }

    // Revert Pick List item to Stage 2 values
    inventorySheet.getRange(pickListRow, 7).setValue(stage2Status || 'Ready For Delivery');     // Status (G)
    inventorySheet.getRange(pickListRow, 8).setValue(stage2AssignedTo || 'Packed For Delivery'); // Assigned To (H)
    if (stage2DateAssigned) {
      // Format the date properly before setting
      var stage2Date = new Date(stage2DateAssigned);
      if (!isNaN(stage2Date)) {
        var stage2DateFormatted = Utilities.formatDate(stage2Date, ss.getSpreadsheetTimeZone(), 'MM/dd/yyyy');
        inventorySheet.getRange(pickListRow, 5).setValue(stage2DateFormatted);  // Date Assigned (E)

        // Recalculate Change Out Date for pick list item reverting to Stage 2
        var pickListChangeOut = calculateChangeOutDate(stage2Date, "Cody's Truck", 'Packed For Delivery', isSleeve);
        var pickListChangeOutCell = inventorySheet.getRange(pickListRow, 9);
        if (pickListChangeOut === 'N/A') {
          pickListChangeOutCell.setNumberFormat('@').setValue('N/A');
        } else if (pickListChangeOut) {
          pickListChangeOutCell.setNumberFormat('MM/dd/yyyy').setValue(pickListChangeOut);
        }
      } else {
        inventorySheet.getRange(pickListRow, 5).setValue(stage2DateAssigned);   // Use as-is if not a valid date
      }
    }
    inventorySheet.getRange(pickListRow, 6).setValue("Cody's Truck");                           // Location (F)
    inventorySheet.getRange(pickListRow, 10).setValue(stage2PickedFor || '');                   // Picked For (J)

    // Revert Old glove to Stage 1 values (columns N-P)
    if (oldItemRow > 0 && oldGloveStatus) {
      inventorySheet.getRange(oldItemRow, 7).setValue(oldGloveStatus);       // Status (G)
      inventorySheet.getRange(oldItemRow, 8).setValue(oldGloveAssignedTo);   // Assigned To (H)
      inventorySheet.getRange(oldItemRow, 6).setValue(employeeLocation);     // Location (F)

      if (oldGloveDateAssigned) {
        // Format the date properly before setting
        var oldGloveDate = new Date(oldGloveDateAssigned);
        if (!isNaN(oldGloveDate)) {
          var oldGloveDateFormatted = Utilities.formatDate(oldGloveDate, ss.getSpreadsheetTimeZone(), 'MM/dd/yyyy');
          inventorySheet.getRange(oldItemRow, 5).setValue(oldGloveDateFormatted); // Date Assigned (E)

          // Recalculate Change Out Date for old item reverting to employee assignment
          var oldItemChangeOut = calculateChangeOutDate(oldGloveDate, employeeLocation, oldGloveAssignedTo, isSleeve);
          var oldItemChangeOutCell = inventorySheet.getRange(oldItemRow, 9);
          if (oldItemChangeOut === 'N/A') {
            oldItemChangeOutCell.setNumberFormat('@').setValue('N/A');
          } else if (oldItemChangeOut) {
            oldItemChangeOutCell.setNumberFormat('MM/dd/yyyy').setValue(oldItemChangeOut);
          }
        } else {
          inventorySheet.getRange(oldItemRow, 5).setValue(oldGloveDateAssigned);  // Use as-is if not valid
        }
      }
    }
  }
}

/**
 * Writes dynamic swap table headers for Glove/Sleeve Swaps sheets.
 * Supports any number of swap workflow stages.
 * @param {Sheet} swapSheet - The sheet to write headers to.
 * @param {number} currentRow - The row to start writing headers (1-based).
 * @param {string} itemType - 'Gloves' or 'Sleeves'.
 * @param {string} headerFont - Font color for visible headers.
 * @param {number} numStages - Number of swap workflow stages.
 * @return {number} The next available row after headers.
 */
function writeSwapTableHeadersDynamic(swapSheet, currentRow, itemType, headerFont, numStages) {
  const itemNumHeader = itemType === 'Gloves' ? 'Current Glove #' : 'Current Sleeve #';
  // Only visible headers (A–J)
  const visibleHeaders = [
    'Employee',           // A
    itemNumHeader,        // B
    'Size',               // C
    'Date Assigned',      // D
    'Change Out Date',    // E
    'Days Left',          // F
    'Pick List',          // G
    'Status',             // H
    'Picked',             // I
    'Date Changed'        // J
  ];
  swapSheet.getRange(currentRow, 1, 1, visibleHeaders.length).setValues([visibleHeaders]);
  swapSheet.getRange(currentRow, 1, 1, visibleHeaders.length)
    .setFontWeight('bold').setFontColor(headerFont).setHorizontalAlignment('center').setBackground(HEADER_BG_COLOR);
  return currentRow + 1;
}

/**
 * Removes the old combined History tab if it exists, and ensures separate Gloves History and Sleeves History sheets exist.
 * Call this during Build Sheets and before any history logging.
 */
function ensureSeparateHistorySheets() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  // Remove old History tab if it exists
  var oldHistory = ss.getSheetByName('History');
  if (oldHistory) {
    ss.deleteSheet(oldHistory);
    Logger.log('Deleted old combined History tab');
  }

  // Ensure Gloves History sheet exists with proper headers
  var glovesHistorySheet = ss.getSheetByName(SHEET_GLOVES_HISTORY);
  if (!glovesHistorySheet) {
    glovesHistorySheet = ss.insertSheet(SHEET_GLOVES_HISTORY);
    var headers = ['Date Assigned', 'Item #', 'Size', 'Class', 'Location', 'Assigned To'];
    glovesHistorySheet.getRange(1, 1, 1, 6).setValues([headers]);
    glovesHistorySheet.getRange(1, 1, 1, 6)
      .setFontWeight('bold')
      .setBackground('#1565c0')
      .setFontColor('#ffffff')
      .setHorizontalAlignment('center');
    glovesHistorySheet.setFrozenRows(1);
    glovesHistorySheet.setColumnWidth(1, 100);
    glovesHistorySheet.setColumnWidth(2, 70);
    glovesHistorySheet.setColumnWidth(3, 50);
    glovesHistorySheet.setColumnWidth(4, 50);
    glovesHistorySheet.setColumnWidth(5, 120);
    glovesHistorySheet.setColumnWidth(6, 150);
    Logger.log('Created Gloves History sheet');
  }

  // Ensure Sleeves History sheet exists with proper headers
  var sleevesHistorySheet = ss.getSheetByName(SHEET_SLEEVES_HISTORY);
  if (!sleevesHistorySheet) {
    sleevesHistorySheet = ss.insertSheet(SHEET_SLEEVES_HISTORY);
    var headers = ['Date Assigned', 'Item #', 'Size', 'Class', 'Location', 'Assigned To'];
    sleevesHistorySheet.getRange(1, 1, 1, 6).setValues([headers]);
    sleevesHistorySheet.getRange(1, 1, 1, 6)
      .setFontWeight('bold')
      .setBackground('#2e7d32')
      .setFontColor('#ffffff')
      .setHorizontalAlignment('center');
    sleevesHistorySheet.setFrozenRows(1);
    sleevesHistorySheet.setColumnWidth(1, 100);
    sleevesHistorySheet.setColumnWidth(2, 70);
    sleevesHistorySheet.setColumnWidth(3, 50);
    sleevesHistorySheet.setColumnWidth(4, 50);
    sleevesHistorySheet.setColumnWidth(5, 120);
    sleevesHistorySheet.setColumnWidth(6, 150);
    Logger.log('Created Sleeves History sheet');
  }
}

/**
 * Sets up the History sheet with dual-section headers (Gloves left, Sleeves right)
 */
function setupHistorySheetHeaders(sheet) {
  sheet.clear();

  // Title row
  sheet.getRange(1, 1, 1, 6).merge().setValue('🧤 GLOVES HISTORY')
    .setFontWeight('bold').setFontSize(14).setBackground('#e3f2fd').setHorizontalAlignment('center');
  sheet.getRange(1, 7).setBackground('#333333');
  sheet.getRange(1, 8, 1, 6).merge().setValue('🦺 SLEEVES HISTORY')
    .setFontWeight('bold').setFontSize(14).setBackground('#e8f5e9').setHorizontalAlignment('center');

  // Gloves section headers (A-F)
  var gloveHeaders = ['Date Assigned', 'Item #', 'Size', 'Class', 'Location', 'Assigned To'];
  sheet.getRange(2, 1, 1, 6).setValues([gloveHeaders]);
  sheet.getRange(2, 1, 1, 6)
    .setFontWeight('bold')
    .setBackground('#1565c0')
    .setFontColor('#ffffff')
    .setHorizontalAlignment('center');

  // Spacer column G
  sheet.setColumnWidth(7, 30);
  sheet.getRange(2, 7).setBackground('#333333');

  // Sleeves section headers (H-M)
  var sleeveHeaders = ['Date Assigned', 'Item #', 'Size', 'Class', 'Location', 'Assigned To'];
  sheet.getRange(2, 8, 1, 6).setValues([sleeveHeaders]);
  sheet.getRange(2, 8, 1, 6)
    .setFontWeight('bold')
    .setBackground('#2e7d32')
    .setFontColor('#ffffff')
    .setHorizontalAlignment('center');

  // Freeze header rows
  sheet.setFrozenRows(2);

  // Set column widths
  sheet.setColumnWidth(1, 100); // Date Assigned
  sheet.setColumnWidth(2, 70);  // Item #
  sheet.setColumnWidth(3, 50);  // Size
  sheet.setColumnWidth(4, 50);  // Class
  sheet.setColumnWidth(5, 120);
  sheet.setColumnWidth(6, 120);
  sheet.setColumnWidth(8, 100); // Date Assigned
  sheet.setColumnWidth(9, 70);  // Item #
  sheet.setColumnWidth(10, 50); // Size
  sheet.setColumnWidth(11, 50); // Class
  sheet.setColumnWidth(12, 120);// Location
  sheet.setColumnWidth(13, 120);// Assigned To
}

/**
 * Sets up the Employee History sheet structure with headers.
 * Tracks the lifecycle of employees: Hire Date, location/job number changes, to Last Day.
 * @param {Sheet} sheet - The Employee History sheet to set up
 */
function setupEmployeeHistorySheet(sheet) {
  // Only set up if sheet is empty or has minimal content
  if (sheet.getLastRow() > 2) return;

  sheet.clear();

  // Title row
  sheet.getRange(1, 1, 1, 14).merge()
    .setValue('👤 EMPLOYEE HISTORY')
    .setFontWeight('bold').setFontSize(16).setBackground('#1565c0').setFontColor('white').setHorizontalAlignment('center');
  sheet.setRowHeight(1, 35);

  // Headers
  var headers = [
    'Date',           // A - Date of the change/event
    'Employee Name',  // B - Employee name
    'Event Type',     // C - Current State, Location Change, Job Number Change, Terminated, Rehired
    'Location',       // D - Location at time of event
    'Job Number',     // E - Job number at time of event
    'Hire Date',      // F - Original hire date
    'Last Day',       // G - Employee's last day (for Terminated events)
    'Last Day Reason',// H - Only populated for Terminated events (Quit, Fired, Layoff, Resigned)
    'Rehire Date',    // I - Date employee was rehired (triggers re-add to Employees sheet)
    'Notes',          // J - Additional notes
    'Phone Number',   // K - Employee phone number
    'Email Address',  // L - Employee email address
    'Glove Size',     // M - Employee glove size
    'Sleeve Size'     // N - Employee sleeve size
  ];

  sheet.getRange(2, 1, 1, headers.length).setValues([headers])
    .setFontWeight('bold').setBackground('#90caf9').setFontColor('#333').setHorizontalAlignment('center');

  sheet.setFrozenRows(2);

  // Set column widths
  sheet.setColumnWidth(1, 100);  // Date
  sheet.setColumnWidth(2, 150);  // Employee Name
  sheet.setColumnWidth(3, 130);  // Event Type
  sheet.setColumnWidth(4, 130);  // Location
  sheet.setColumnWidth(5, 100);  // Job Number
  sheet.setColumnWidth(6, 100);  // Hire Date
  sheet.setColumnWidth(7, 100);  // Last Day
  sheet.setColumnWidth(8, 120);  // Last Day Reason
  sheet.setColumnWidth(9, 100);  // Rehire Date
  sheet.setColumnWidth(10, 200); // Notes
  sheet.setColumnWidth(11, 120); // Phone Number
  sheet.setColumnWidth(12, 200); // Email Address
  sheet.setColumnWidth(13, 100); // Glove Size
  sheet.setColumnWidth(14, 100); // Sleeve Size
}

/**
 * Updates Employee History sheet headers to include new columns (Phone Number, Email Address, Glove Size, Sleeve Size).
 * This function updates ONLY the headers without clearing existing data.
 * Menu item: Glove Manager → Utilities → Update Employee History Headers
 */
function updateEmployeeHistoryHeaders() {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName('Employee History');

    if (!sheet) {
      SpreadsheetApp.getUi().alert('❌ Error', 'Employee History sheet not found.', SpreadsheetApp.getUi().ButtonSet.OK);
      return;
    }

    // Update title row merge to span 14 columns
    sheet.getRange(1, 1, 1, 14).merge()
      .setValue('👤 EMPLOYEE HISTORY')
      .setFontWeight('bold').setFontSize(16).setBackground('#1565c0').setFontColor('white').setHorizontalAlignment('center');
    sheet.setRowHeight(1, 35);

    // Update headers with all 14 columns
    var headers = [
      'Date',           // A
      'Employee Name',  // B
      'Event Type',     // C
      'Location',       // D
      'Job Number',     // E
      'Hire Date',      // F
      'Last Day',       // G
      'Last Day Reason',// H
      'Rehire Date',    // I
      'Notes',          // J
      'Phone Number',   // K - NEW
      'Email Address',  // L - NEW
      'Glove Size',     // M - NEW
      'Sleeve Size'     // N - NEW
    ];

    sheet.getRange(2, 1, 1, headers.length).setValues([headers])
      .setFontWeight('bold').setBackground('#90caf9').setFontColor('#333').setHorizontalAlignment('center');

    // Set column widths for new columns
    sheet.setColumnWidth(11, 120); // Phone Number
    sheet.setColumnWidth(12, 200); // Email Address
    sheet.setColumnWidth(13, 100); // Glove Size
    sheet.setColumnWidth(14, 100); // Sleeve Size

    SpreadsheetApp.getUi().alert(
      '✅ Headers Updated!',
      'Employee History sheet headers have been updated to include:\n' +
      '• Phone Number (Column K)\n' +
      '• Email Address (Column L)\n' +
      '• Glove Size (Column M)\n' +
      '• Sleeve Size (Column N)\n\n' +
      'New terminations will now save these fields automatically.',
      SpreadsheetApp.getUi().ButtonSet.OK
    );

    logEvent('Employee History headers updated to 14 columns');

  } catch (e) {
    logEvent('Error in updateEmployeeHistoryHeaders: ' + e, 'ERROR');
    SpreadsheetApp.getUi().alert('❌ Error', 'Error updating headers: ' + e.message, SpreadsheetApp.getUi().ButtonSet.OK);
  }
}

/**
 * Sets up the Item History Lookup sheet
 */
function setupItemHistoryLookupSheet(sheet) {
  sheet.clear();

  // Title
  sheet.getRange(1, 1, 1, 6).merge().setValue('🔍 ITEM HISTORY LOOKUP')
    .setFontWeight('bold').setFontSize(16).setBackground('#b0bec5').setHorizontalAlignment('center');

  // Instructions
  sheet.getRange(2, 1, 1, 6).merge().setValue('Use Glove Manager > History > Item History Lookup to search for an item')
    .setFontStyle('italic').setHorizontalAlignment('center');

  // Headers
  var headers = ['Date Assigned', 'Item #', 'Size', 'Class', 'Location', 'Assigned To'];
  sheet.getRange(4, 1, 1, 6).setValues([headers]);
  sheet.getRange(4, 1, 1, 6)
    .setFontWeight('bold')
    .setBackground('#1565c0')
    .setFontColor('#ffffff')
    .setHorizontalAlignment('center');

  sheet.setFrozenRows(4);

  // Set column widths
  sheet.setColumnWidth(1, 100);
  sheet.setColumnWidth(2, 70);
  sheet.setColumnWidth(3, 50);
  sheet.setColumnWidth(4, 50);
  sheet.setColumnWidth(5, 120);
  sheet.setColumnWidth(6, 150);
}

/**
 * Checks if an entry already exists in history for the given item.
 * Returns true if the last entry for this item has the same Assigned To, Date Assigned, AND Location values.
 * Used to prevent duplicate entries when saving history.
 */
function isDuplicateHistoryEntry(historySheet, itemNum, assignedTo, dateAssigned, location) {
  if (!historySheet || historySheet.getLastRow() < 2) return false;

  var lastRow = historySheet.getLastRow();
  var numDataRows = lastRow - 1;  // Data starts at row 2 (after header)
  if (numDataRows <= 0) return false;

  // Use getDisplayValues for consistent string comparison
  var data = historySheet.getRange(2, 1, numDataRows, 6).getDisplayValues();

  // Find the last entry for this item number
  var lastEntry = null;
  for (var i = data.length - 1; i >= 0; i--) {
    if (String(data[i][1]).trim() === String(itemNum).trim()) {
      lastEntry = data[i];
      break;
    }
  }

  if (!lastEntry) return false;

  // Normalize all values for comparison
  var lastAssignedTo = String(lastEntry[5] || '').toLowerCase().trim();
  var newAssignedTo = String(assignedTo || '').toLowerCase().trim();

  var lastDateAssigned = String(lastEntry[0] || '').trim();
  var newDateAssigned = String(dateAssigned || '').trim();

  var lastLocation = String(lastEntry[4] || '').toLowerCase().trim();
  var newLocation = String(location || '').toLowerCase().trim();

  // Return true only if ALL three fields match (duplicate)
  return lastAssignedTo === newAssignedTo &&
         lastDateAssigned === newDateAssigned &&
         lastLocation === newLocation;
}

/**
 * Saves the current state of Gloves and Sleeves tabs to their respective history sheets.
 * Only logs changes when 'Assigned To', 'Date Assigned', or 'Location' has changed since the last entry for each item.
 * Triggered manually from the menu.
 */
/**
 * Consolidated history save function.
 * @param {boolean} silent - If true, no UI alerts are shown (for automated backups)
 */
function saveHistory(silent) {
  silent = silent || false;

  if (silent) {
    ensureSeparateHistorySheets();
  }

  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var glovesSheet = ss.getSheetByName(SHEET_GLOVES);
    var sleevesSheet = ss.getSheetByName(SHEET_SLEEVES);
    var glovesHistorySheet = silent ?
      ss.getSheetByName(SHEET_GLOVES_HISTORY) :
      (ss.getSheetByName('Gloves History') || ss.insertSheet('Gloves History'));
    var sleevesHistorySheet = silent ?
      ss.getSheetByName(SHEET_SLEEVES_HISTORY) :
      (ss.getSheetByName('Sleeves History') || ss.insertSheet('Sleeves History'));

    function formatItemNum(val) {
      if (val === null || val === undefined || val === '') return '';
      if (val instanceof Date) return String(val);
      return String(val);
    }

    function formatClass(val) {
      if (val === null || val === undefined || val === '') return '';
      if (val instanceof Date) return String(val);
      var strVal = String(val).trim();
      if (strVal === '1/1/1900') return 2;
      if (strVal === '1/2/1900') return 2;
      if (strVal === '1/3/1900') return 3;
      if (strVal === '12/30/1899' || strVal === '12/31/1899') return 0;
      var num = parseInt(strVal, 10);
      if (!isNaN(num) && num >= 0 && num <= 4) return num;
      return strVal;
    }

    var newGloveEntries = 0;
    var newSleeveEntries = 0;

    // Process Gloves
    if (glovesSheet && glovesSheet.getLastRow() > 1 && glovesHistorySheet) {
      var numGloveRows = glovesSheet.getLastRow() - 1;
      var glovesDisplay = glovesSheet.getRange(2, 1, numGloveRows, 11).getDisplayValues();
      var glovesRawValues = glovesSheet.getRange(2, 1, numGloveRows, 11).getValues();

      for (var i = 0; i < glovesDisplay.length; i++) {
        var row = glovesDisplay[i];
        var rawRow = glovesRawValues[i];
        var itemNum = formatItemNum(rawRow[0]);
        var size = row[1];
        var classVal = formatClass(rawRow[2]);
        var dateAssigned = row[4];
        var location = row[5];
        var assignedTo = row[7];

        // Skip rows without item number or date assigned
        if (!itemNum || !dateAssigned) continue;

        // Check if this is a duplicate entry
        if (!isDuplicateHistoryEntry(glovesHistorySheet, itemNum, assignedTo, dateAssigned, location)) {
          glovesHistorySheet.appendRow([
            silent ? formatDateForHistory(dateAssigned) : dateAssigned,
            itemNum,
            size,
            classVal,
            location,
            assignedTo
          ]);
          newGloveEntries++;
        }
      }
    }

    // Process Sleeves
    if (sleevesSheet && sleevesSheet.getLastRow() > 1 && sleevesHistorySheet) {
      var numSleeveRows = sleevesSheet.getLastRow() - 1;
      var sleevesDisplay = sleevesSheet.getRange(2, 1, numSleeveRows, 11).getDisplayValues();
      var sleevesRawValues = sleevesSheet.getRange(2, 1, numSleeveRows, 11).getValues();

      for (var j = 0; j < sleevesDisplay.length; j++) {
        var row = sleevesDisplay[j];
        var rawRow = sleevesRawValues[j];
        var itemNum = formatItemNum(rawRow[0]);
        var size = row[1];
        var classVal = formatClass(rawRow[2]);
        var dateAssigned = row[4];
        var location = row[5];
        var assignedTo = row[7];

        // Skip rows without item number or date assigned
        if (!itemNum || !dateAssigned) continue;

        // Check if this is a duplicate entry
        if (!isDuplicateHistoryEntry(sleevesHistorySheet, itemNum, assignedTo, dateAssigned, location)) {
          sleevesHistorySheet.appendRow([
            silent ? formatDateForHistory(dateAssigned) : dateAssigned,
            itemNum,
            size,
            classVal,
            location,
            assignedTo
          ]);
          newSleeveEntries++;
        }
      }
    }

    // Save Employee History (track location/job changes)
    var newEmployeeEntries = 0;
    try {
      newEmployeeEntries = saveEmployeeHistory();
    } catch (empErr) {
      Logger.log('Error saving employee history: ' + empErr);
    }

    if (silent) {
      PropertiesService.getUserProperties().setProperty('historySavedThisSession', 'true');
      logEvent('Silent history backup completed. Gloves: ' + newGloveEntries + ', Sleeves: ' + newSleeveEntries + ', Employees: ' + newEmployeeEntries);
    } else {
      Logger.log('History saved - Gloves: ' + newGloveEntries + ', Sleeves: ' + newSleeveEntries + ', Employees: ' + newEmployeeEntries);

      // Show confirmation to user
      var message = '✅ History Saved Successfully!\n\n';
      message += '🧤 Gloves: ' + newGloveEntries + ' new entries\n';
      message += '🦺 Sleeves: ' + newSleeveEntries + ' new entries\n';
      message += '👤 Employees: ' + newEmployeeEntries + ' new entries\n\n';
      if (newGloveEntries === 0 && newSleeveEntries === 0 && newEmployeeEntries === 0) {
        message += 'No changes detected since last save.';
      }
      SpreadsheetApp.getUi().alert(message);
    }

  } catch (e) {
    if (silent) {
      logEvent('Error in saveHistory: ' + e, 'ERROR');
    } else {
      Logger.log('[ERROR] ' + e);
      SpreadsheetApp.getUi().alert('❌ Error saving history: ' + e);
      throw new Error('Error saving history: ' + e);
    }
  }
}

/**
 * Public wrapper for interactive history save (called from menu)
 */
function saveCurrentStateToHistory() {
  saveHistory(false);
}

/**
 * Public wrapper for silent history save (called from triggers)
 */
function saveCurrentStateToHistorySilent() {
  saveHistory(true);
}

/**
 * Combined Save & Backup function for the Monday Workflow sidebar.
 * Runs both saveHistory() and createBackupSnapshot() in sequence.
 * Called from QuickActions sidebar Step 6.
 */
function saveAndBackup() {
  try {
    // Step 1: Save to history (silent mode to avoid extra popups)
    saveHistory(true);
    Logger.log('saveAndBackup: History saved');

    // Step 2: Create backup snapshot
    createBackupSnapshot();
    Logger.log('saveAndBackup: Backup snapshot created');

    // Show combined success message
    SpreadsheetApp.getActiveSpreadsheet().toast(
      'History saved and backup created successfully!',
      '✅ Save & Backup Complete',
      5
    );
  } catch (e) {
    Logger.log('Error in saveAndBackup: ' + e.toString());
    SpreadsheetApp.getUi().alert('Error during Save & Backup: ' + e.message);
    throw e;
  }
}

// NOTE: formatDateForHistory() is defined later in this file (around line 4826)
// with better error handling (try-catch). The duplicate version that was here
// has been removed during the Option B safe cleanup on Jan 15, 2026.

/**
 * Flexible date parser that handles various date formats
 */
function parseDateFlexible(dateStr) {
  if (!dateStr) return null;
  // If already a valid Date object, return it
  if (dateStr instanceof Date && !isNaN(dateStr)) return dateStr;
  // Convert to string if needed
  if (typeof dateStr !== 'string') dateStr = String(dateStr);
  // Try standard Date parsing first
  var d = new Date(dateStr);
  if (!isNaN(d)) return d;
  // Try MM/DD/YYYY or MM-DD-YYYY format
  var mdyPattern = new RegExp('^(\\d{1,2})[\\/\\-](\\d{1,2})[\\/\\-](\\d{4})$');
  var mdy = dateStr.match(mdyPattern);
  if (mdy) {
    var dt = new Date(parseInt(mdy[3], 10), parseInt(mdy[1], 10) - 1, parseInt(mdy[2], 10));
    if (!isNaN(dt)) return dt;
  }
  // Try YYYY/MM/DD or YYYY-MM-DD format
  var ymdPattern = new RegExp('^(\\d{4})[\\/\\-](\\d{1,2})[\\/\\-](\\d{1,2})$');
  var ymd = dateStr.match(ymdPattern);
  if (ymd) {
    var dt2 = new Date(parseInt(ymd[1], 10), parseInt(ymd[2], 10) - 1, parseInt(ymd[3], 10));
    if (!isNaN(dt2)) return dt2;
  }
  return null;
}

/**
 * Shows dialog to import legacy history data for a single item.
 */
function showImportLegacyHistoryDialog() {
  ensureSeparateHistorySheets(); // Always ensure correct sheets before importing
  var html = HtmlService.createHtmlOutput(
    '<style>' +
    '  body { font-family: Arial, sans-serif; padding: 15px; }' +
    '  label { display: block; margin-top: 10px; font-weight: bold; }' +
    '  select, input, textarea { width: 100%; padding: 8px; margin-top: 5px; box-sizing: border-box; }' +
    '  textarea { height: 200px; font-family: monospace; }' +
    '  button { margin-top: 15px; padding: 10px 20px; background: #1565c0; color: white; border: none; cursor: pointer; }' +
    '  button:hover { background: #0d47a1; }' +
    '  .info { font-size: 12px; color: #666; margin-top: 5px; }' +
    '</style>' +
    '<label>Item Type:</label>' +
    '<select id="itemType">' +
    '  <option value="glove">Glove</option>' +
    '  <option value="sleeve">Sleeve</option>' +
    '</select>' +
    '<label>Item Number:</label>' +
    '<input type="text" id="itemNum" placeholder="e.g., 667">' +
    '<label>Size:</label>' +
    '<input type="text" id="itemSize" placeholder="e.g., 10 or 18in">' +
    '<label>Class:</label>' +
    '<input type="text" id="itemClass" placeholder="e.g., 0, 2, or 3">' +
    '<label>Legacy History Data:</label>' +
    '<textarea id="legacyData" placeholder="Paste legacy data here, one entry per line:\n06/06/2023 - C. Lovdahl\n02/22/2023 - L. Gill\n01/08/2024 - In Testing\n01/24/2024 - On Shelf"></textarea>' +
    '<div class="info">Format: MM/DD/YYYY - Name or Status (one per line)</div>' +
    '<button onclick="importData()">Import Legacy History</button>' +
    '<script>' +
    '  function importData() {' +
    '    var itemType = document.getElementById("itemType").value;' +
    '    var itemNum = document.getElementById("itemNum").value;' +
    '    var itemSize = document.getElementById("itemSize").value;' +
    '    var itemClass = document.getElementById("itemClass").value;' +
    '    var legacyData = document.getElementById("legacyData").value;' +
    '    if (!itemNum || !legacyData) {' +
    '      alert("Please enter Item Number and Legacy Data");' +
    '      return;' +
    '    }' +
    '    google.script.run' +
    '      .withSuccessHandler(function(result) {' +
    '        alert(result);' +
    '        google.script.host.close();' +
    '      })' +
    '      .withFailureHandler(function(error) {' +
    '        alert("Error: " + error);' +
    '      })' +
    '      .importLegacyHistoryData(itemType, itemNum, itemSize, itemClass, legacyData);' +
    '  }' +
    '</script>'
  )
  .setWidth(450)
  .setHeight(550);

  SpreadsheetApp.getUi().showModalDialog(html, 'Import Legacy History');
}

/**
 * Parses and imports legacy history data for a single item.
 */
function importLegacyHistoryData(itemType, itemNum, itemSize, itemClass, legacyData) {
  try {
    ensureSeparateHistorySheets();
    var ss = SpreadsheetApp.getActiveSpreadsheet();

    // Use the correct history sheet based on item type
    var historySheetName = (itemType === 'sleeve') ? SHEET_SLEEVES_HISTORY : SHEET_GLOVES_HISTORY;
    var historySheet = ss.getSheetByName(historySheetName);

    if (!historySheet) {
      return 'Error: ' + historySheetName + ' sheet not found. Please run Build Sheets first.';
    }

    // Parse legacy data
    var lines = legacyData.split('\n');
    var entries = [];

    lines.forEach(function(line) {
      line = line.trim();
      if (!line) return;

      // Parse format: MM/DD/YYYY - Name/Status (handle both - and –)
      var datePattern = new RegExp('^(\\d{1,2}\\/\\d{1,2}\\/\\d{4})\\s*[-–]\\s*(.+)$');
      var match = line.match(datePattern);
      if (match) {
        entries.push({
          dateAssigned: match[1],
          assignedTo: match[2].trim()
        });
      }
    });

    if (entries.length === 0) {
      return 'No valid entries found. Please check the format.';
    }

    // Sort by date (oldest first for lifecycle view)
    entries.sort(function(a, b) {
      return new Date(a.dateAssigned) - new Date(b.dateAssigned);
    });

    // Append entries to the appropriate history sheet
    entries.forEach(function(entry) {
      historySheet.appendRow([
        entry.dateAssigned,
        itemNum,
        itemSize || '',
        itemClass || '',
        '',  // Location unknown from legacy
        entry.assignedTo
      ]);
    });

    logEvent('Imported ' + entries.length + ' legacy history entries for ' + itemType + ' #' + itemNum);
    return '✅ Successfully imported ' + entries.length + ' entries for ' + itemType.charAt(0).toUpperCase() + itemType.slice(1) + ' #' + itemNum;

  } catch (e) {
    logEvent('Error in importLegacyHistoryData: ' + e, 'ERROR');
    return 'Error: ' + e;
  }
}

/**
 * Shows the enhanced lookup dialog with Employee and Item search tabs.
 */
function showItemHistoryLookup() {
  var html = HtmlService.createHtmlOutputFromFile('LookupDialog')
    .setWidth(900)
    .setHeight(700);
  SpreadsheetApp.getUi().showModalDialog(html, '🔍 Lookup');
}

/**
 * Looks up an employee by name and returns their info and current assignments.
 * @param {string} name - Employee name to search for
 * @return {Object} Employee data with assignments
 */
function lookupEmployee(name) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var employeesSheet = ss.getSheetByName(SHEET_EMPLOYEES);
  var glovesSheet = ss.getSheetByName(SHEET_GLOVES);
  var sleevesSheet = ss.getSheetByName(SHEET_SLEEVES);

  if (!employeesSheet) {
    return { found: false };
  }

  var empData = employeesSheet.getDataRange().getValues();
  var empHeaders = empData[0];

  // Find column indices
  var cols = {};
  empHeaders.forEach(function(h, i) {
    var header = String(h).toLowerCase().trim();
    if (header === 'name') cols.name = i;
    if (header === 'location') cols.location = i;
    if (header === 'job number') cols.jobNumber = i;
    if (header === 'job classification') cols.jobClassification = i;
    if (header === 'glove size') cols.gloveSize = i;
    if (header === 'sleeve size') cols.sleeveSize = i;
  });

  // Search for employee (case-insensitive partial match)
  var searchName = name.toLowerCase().trim();
  var employee = null;

  for (var i = 1; i < empData.length; i++) {
    var empName = String(empData[i][cols.name] || '').toLowerCase().trim();
    if (empName.indexOf(searchName) !== -1 || searchName.indexOf(empName) !== -1) {
      employee = empData[i];
      break;
    }
  }

  if (!employee) {
    return { found: false };
  }

  var result = {
    found: true,
    name: employee[cols.name] || '',
    location: employee[cols.location] || '',
    jobNumber: employee[cols.jobNumber] || '',
    jobClassification: employee[cols.jobClassification] || '',
    gloveSize: employee[cols.gloveSize] || '',
    sleeveSize: employee[cols.sleeveSize] || '',
    gloves: [],
    sleeves: []
  };

  // Find assigned gloves
  if (glovesSheet && glovesSheet.getLastRow() > 1) {
    var gloveData = glovesSheet.getDataRange().getValues();
    for (var g = 1; g < gloveData.length; g++) {
      var assignedTo = String(gloveData[g][7] || '').toLowerCase().trim(); // Column H = Assigned To
      if (assignedTo.indexOf(searchName) !== -1) {
        result.gloves.push({
          itemNum: gloveData[g][0] || '',
          size: gloveData[g][1] || '',
          itemClass: gloveData[g][2] || '',
          dateAssigned: formatDateForDisplay(gloveData[g][4]),
          changeOutDate: formatDateForDisplay(gloveData[g][8]),
          status: gloveData[g][6] || ''
        });
      }
    }
  }

  // Find assigned sleeves
  if (sleevesSheet && sleevesSheet.getLastRow() > 1) {
    var sleeveData = sleevesSheet.getDataRange().getValues();
    for (var s = 1; s < sleeveData.length; s++) {
      var sleeveAssignedTo = String(sleeveData[s][7] || '').toLowerCase().trim();
      if (sleeveAssignedTo.indexOf(searchName) !== -1) {
        result.sleeves.push({
          itemNum: sleeveData[s][0] || '',
          size: sleeveData[s][1] || '',
          itemClass: sleeveData[s][2] || '',
          dateAssigned: formatDateForDisplay(sleeveData[s][4]),
          changeOutDate: formatDateForDisplay(sleeveData[s][8]),
          status: sleeveData[s][6] || ''
        });
      }
    }
  }

  return result;
}

/**
 * Looks up an item by number and returns current info plus history.
 * @param {string} itemType - 'glove' or 'sleeve'
 * @param {string} itemNum - Item number to search for
 * @return {Object} Item data with history
 */
function lookupItem(itemType, itemNum) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheetName = (itemType === 'sleeve') ? SHEET_SLEEVES : SHEET_GLOVES;
  var historySheetName = (itemType === 'sleeve') ? SHEET_SLEEVES_HISTORY : SHEET_GLOVES_HISTORY;

  var sheet = ss.getSheetByName(sheetName);
  var historySheet = ss.getSheetByName(historySheetName);

  if (!sheet) {
    return { found: false };
  }

  var data = sheet.getDataRange().getValues();
  var item = null;

  // Find the item
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim() === String(itemNum).trim()) {
      item = data[i];
      break;
    }
  }

  if (!item) {
    return { found: false };
  }

  var result = {
    found: true,
    itemNum: item[0] || '',
    size: item[1] || '',
    itemClass: item[2] || '',
    testDate: formatDateForDisplay(item[3]),
    dateAssigned: formatDateForDisplay(item[4]),
    location: item[5] || '',
    status: item[6] || '',
    assignedTo: item[7] || '',
    changeOutDate: formatDateForDisplay(item[8]),
    notes: item[10] || '',
    history: []
  };

  // Get history if available
  if (historySheet && historySheet.getLastRow() > 1) {
    var historyData = historySheet.getDataRange().getValues();
    for (var h = 1; h < historyData.length; h++) {
      if (String(historyData[h][1]).trim() === String(itemNum).trim()) {
        result.history.push({
          date: formatDateForDisplay(historyData[h][0]),
          assignedTo: historyData[h][5] || '',
          location: historyData[h][4] || ''
        });
      }
    }
    // Sort by date descending (most recent first)
    result.history.sort(function(a, b) {
      return new Date(b.date) - new Date(a.date);
    });
  }

  return result;
}

/**
 * Helper function to format dates for display.
 * @param {Date|string} date - Date to format
 * @return {string} Formatted date string
 */
function formatDateForDisplay(date) {
  if (!date) return 'N/A';
  if (date === 'N/A') return 'N/A';
  try {
    var d = new Date(date);
    if (isNaN(d.getTime())) return String(date);
    return Utilities.formatDate(d, Session.getScriptTimeZone(), 'MM/dd/yyyy');
  } catch (e) {
    return String(date);
  }
}

/**
 * @deprecated Use lookupItem() instead - kept for backward compatibility
 * Generates the Item History Lookup sheet for a specific item.
 */
function generateItemHistoryLookup(itemType, itemNum) {
  try {
    ensureSeparateHistorySheets();
    var ss = SpreadsheetApp.getActiveSpreadsheet();

    // Use the correct history sheet based on item type
    var historySheetName = (itemType === 'sleeve') ? SHEET_SLEEVES_HISTORY : SHEET_GLOVES_HISTORY;
    var historySheet = ss.getSheetByName(historySheetName);
    var lookupSheet = ss.getSheetByName(SHEET_ITEM_HISTORY_LOOKUP);

    if (!lookupSheet) {
      lookupSheet = ss.insertSheet(SHEET_ITEM_HISTORY_LOOKUP);
    }

    // Clear and setup
    lookupSheet.clear();

    // Title with item info
    var typeLabel = itemType === 'sleeve' ? '🦺 Sleeve' : '🧤 Glove';
    lookupSheet.getRange(1, 1, 1, 6).merge().setValue(typeLabel + ' #' + itemNum + ' - Complete History')
      .setFontWeight('bold').setFontSize(16).setBackground('#b0bec5').setHorizontalAlignment('center');

    // Headers
    var headers = ['Date Assigned', 'Item #', 'Size', 'Class', 'Location', 'Assigned To'];
    lookupSheet.getRange(3, 1, 1, 6).setValues([headers]);
    lookupSheet.getRange(3, 1, 1, 6)
      .setFontWeight('bold')
      .setBackground(itemType === 'sleeve' ? '#2e7d32' : '#1565c0')
      .setFontColor('#ffffff')
      .setHorizontalAlignment('center');

    // Find entries from the appropriate History sheet
    var entries = [];
    if (historySheet && historySheet.getLastRow() > 1) {
      var data = historySheet.getRange(2, 1, historySheet.getLastRow() - 1, 6).getValues();

      data.forEach(function(row) {
        if (String(row[1]).trim() === String(itemNum).trim()) {
          entries.push(row);
        }
      });
    }

    if (entries.length === 0) {
      lookupSheet.getRange(5, 1, 1, 6).merge().setValue('No history found for ' + typeLabel + ' #' + itemNum)
        .setFontStyle('italic').setHorizontalAlignment('center');
      SpreadsheetApp.setActiveSheet(lookupSheet);
      return 'No history found for ' + typeLabel + ' #' + itemNum;
    }

    // Sort by date (oldest first for lifecycle view)
    entries.sort(function(a, b) {
      return new Date(a[0]) - new Date(b[0]);
    });

    // Write entries with alternating colors
    var color1 = itemType === 'sleeve' ? HISTORY_COLOR_SLEEVE_1 : HISTORY_COLOR_GLOVE_1;
    var color2 = itemType === 'sleeve' ? HISTORY_COLOR_SLEEVE_2 : HISTORY_COLOR_GLOVE_2;

    entries.forEach(function(row, index) {
      var rowNum = 4 + index;
      lookupSheet.getRange(rowNum, 1, 1, 6).setValues([row]);
      lookupSheet.getRange(rowNum, 1, 1, 6)
        .setBackground(index % 2 === 0 ? color1 : color2)
        .setHorizontalAlignment('center');
    });

    // Add summary
    var summaryRow = 4 + entries.length + 1;
    lookupSheet.getRange(summaryRow, 1, 1, 6).merge()
      .setValue('📊 Total History Entries: ' + entries.length + ' | First: ' + entries[0][0] + ' | Latest: ' + entries[entries.length - 1][0])
      .setFontWeight('bold').setBackground('#eceff1').setHorizontalAlignment('center');

    // Set column widths
    lookupSheet.setColumnWidth(1, 100);
    lookupSheet.setColumnWidth(2, 70);
    lookupSheet.setColumnWidth(3, 50);
    lookupSheet.setColumnWidth(4, 50);
    lookupSheet.setColumnWidth(5, 120);
    lookupSheet.setColumnWidth(6, 150);

    lookupSheet.setFrozenRows(3);
    SpreadsheetApp.setActiveSheet(lookupSheet);

    logEvent('Generated history lookup for ' + itemType + ' #' + itemNum + ' with ' + entries.length + ' entries');
    return '✅ Found ' + entries.length + ' history entries for ' + typeLabel + ' #' + itemNum;

  } catch (e) {
    logEvent('Error in generateItemHistoryLookup: ' + e, 'ERROR');
    return 'Error: ' + e;
  }
}

/**
 * Views the Gloves History sheet (default).
 * Use the tabs at bottom to switch between Gloves History and Sleeves History.
 */
function viewFullHistory() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var glovesHistorySheet = ss.getSheetByName(SHEET_GLOVES_HISTORY);
  if (glovesHistorySheet) {
    SpreadsheetApp.setActiveSheet(glovesHistorySheet);
    SpreadsheetApp.getUi().alert('📋 History Sheets\n\nGloves History and Sleeves History are now separate sheets.\n\nUse the tabs at the bottom of the spreadsheet to switch between them.');
  } else {
    SpreadsheetApp.getUi().alert('History sheets not found. Run Build Sheets first.');
  }
}

/**
 * Close and Save History - saves current state and prompts user to close.
 */
function closeAndSaveHistory() {
  ensureSeparateHistorySheets(); // Always ensure correct sheets before saving
  saveCurrentStateToHistory();
  SpreadsheetApp.getUi().alert('✅ History has been saved!\n\nYou can now safely close this spreadsheet.');
}

/**
 * Creates a daily time-driven trigger to auto-save history.
 * Run this once from the script editor to set up the daily backup.
 */
function createDailyHistoryBackupTrigger() {
  // Remove existing daily triggers
  var triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(function(trigger) {
    if (trigger.getHandlerFunction() === 'dailyHistoryBackup') {
      ScriptApp.deleteTrigger(trigger);
    }
  });

  // Create new daily trigger at 11 PM
  ScriptApp.newTrigger('dailyHistoryBackup')
    .timeBased()
    .everyDays(1)
    .atHour(23)
    .create();

  Logger.log('Daily history backup trigger created for 11 PM');
  SpreadsheetApp.getUi().alert('✅ Daily history backup trigger created!\n\nHistory will auto-save every day at 11 PM.');
}

/**
 * Daily backup function called by time-driven trigger.
 */
function dailyHistoryBackup() {
  ensureSeparateHistorySheets(); // Always ensure correct sheets before backup
  try {
    logEvent('Running daily history backup...');
    saveCurrentStateToHistorySilent();
    logEvent('Daily history backup completed successfully.');
  } catch (e) {
    logEvent('Error in dailyHistoryBackup: ' + e, 'ERROR');
  }
}

/**
 * Idempotently creates all required sheets/tabs and headers for the Glove Manager system.
 */
/**
 * Sets up the Task Metadata sheet with proper structure and formatting.
 * This sheet stores scheduling state for all tasks from source sheets.
 * Replaces To Do List sheet as the single source of truth for task state.
 * Menu item: Glove Manager → Utilities → Setup Task Metadata Sheet
 */
function setupTaskMetadataSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Task Metadata');

  // Create sheet if it doesn't exist
  if (!sheet) {
    sheet = ss.insertSheet('Task Metadata');
  } else {
    // Ask user if they want to reset
    var ui = SpreadsheetApp.getUi();
    var response = ui.alert(
      'Task Metadata Sheet Exists',
      'Sheet already exists. Do you want to reset it? (This will clear all data)',
      ui.ButtonSet.YES_NO
    );
    if (response === ui.Button.NO) {
      return;
    }
    sheet.clear();
  }

  // Set up headers
  var headers = [
    'TaskID', 'SourceSheet', 'SourceRow', 'Employee', 'TaskType', 'ItemType',
    'CurrentItem', 'Location', 'Foreman', 'PhoneNumber', 'DueDate',
    'ScheduledDate', 'StartTime', 'EndTime', 'Status', 'NotifiedDate',
    'ScheduledClassDate', 'ClassType', 'IsOffice', 'IsRegistered',
    'IsDeclined', 'CompletedDate', 'Notes', 'CreatedDate', 'LastModified',
    'InTaskList'  // Column Z - Flag for items added to Task List (Phase 5)
  ];

  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);

  // Format header row
  var headerRange = sheet.getRange(1, 1, 1, headers.length);
  headerRange.setFontWeight('bold');
  headerRange.setBackground('#4285f4');
  headerRange.setFontColor('white');
  headerRange.setHorizontalAlignment('center');

  // Freeze header row
  sheet.setFrozenRows(1);

  // Set column widths
  sheet.setColumnWidth(1, 200); // TaskID
  sheet.setColumnWidth(2, 120); // SourceSheet
  sheet.setColumnWidth(3, 80);  // SourceRow
  sheet.setColumnWidth(4, 150); // Employee
  sheet.setColumnWidth(5, 120); // TaskType
  sheet.setColumnWidth(6, 100); // ItemType
  sheet.setColumnWidth(7, 100); // CurrentItem
  sheet.setColumnWidth(8, 120); // Location
  sheet.setColumnWidth(9, 150); // Foreman
  sheet.setColumnWidth(10, 130); // PhoneNumber
  sheet.setColumnWidth(11, 100); // DueDate
  sheet.setColumnWidth(12, 120); // ScheduledDate
  sheet.setColumnWidth(13, 80);  // StartTime
  sheet.setColumnWidth(14, 80);  // EndTime
  sheet.setColumnWidth(15, 100); // Status
  sheet.setColumnWidth(16, 120); // NotifiedDate
  sheet.setColumnWidth(17, 140); // ScheduledClassDate
  sheet.setColumnWidth(18, 140); // ClassType
  sheet.setColumnWidth(19, 80);  // IsOffice
  sheet.setColumnWidth(20, 100); // IsRegistered
  sheet.setColumnWidth(21, 100); // IsDeclined
  sheet.setColumnWidth(22, 120); // CompletedDate
  sheet.setColumnWidth(23, 200); // Notes
  sheet.setColumnWidth(24, 140); // CreatedDate
  sheet.setColumnWidth(25, 160); // LastModified
  sheet.setColumnWidth(26, 100); // InTaskList

  // Add data validation for Status column (column O = 15)
  var statusValues = ['Pending', 'Scheduled', 'Complete', 'Overdue', 'Declined'];
  var statusRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(statusValues)
    .setAllowInvalid(false)
    .build();
  sheet.getRange(2, 15, sheet.getMaxRows() - 1, 1).setDataValidation(statusRule);

  // Add data validation for ClassType column (column R = 18)
  var classTypeValues = ['Online', 'InPersonMPC', 'InPersonMSLCAT', ''];
  var classTypeRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(classTypeValues)
    .setAllowInvalid(true)
    .build();
  sheet.getRange(2, 18, sheet.getMaxRows() - 1, 1).setDataValidation(classTypeRule);

  // Add data validation for boolean columns (IsOffice, IsRegistered, IsDeclined, InTaskList)
  var booleanValues = ['TRUE', 'FALSE', ''];
  var booleanRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(booleanValues)
    .setAllowInvalid(true)
    .build();
  sheet.getRange(2, 19, sheet.getMaxRows() - 1, 4).setDataValidation(booleanRule); // columns S-Z (19-22, but also 26)

  // Format date columns
  var dateColumns = [11, 12, 16, 17, 22, 24, 25]; // K, L, P, Q, V, X, Y
  dateColumns.forEach(function(col) {
    sheet.getRange(2, col, sheet.getMaxRows() - 1, 1).setNumberFormat('yyyy-mm-dd');
  });

  // Format time columns
  var timeColumns = [13, 14]; // M, N
  timeColumns.forEach(function(col) {
    sheet.getRange(2, col, sheet.getMaxRows() - 1, 1).setNumberFormat('hh:mm');
  });

  // Add filter to header row
  var dataRange = sheet.getRange(1, 1, sheet.getMaxRows(), headers.length);
  dataRange.createFilter();

  // Protect TaskID, SourceSheet, SourceRow columns (system-managed)
  var protection = sheet.getRange(2, 1, sheet.getMaxRows() - 1, 3).protect();
  protection.setDescription('System-managed fields - do not edit manually');
  protection.setWarningOnly(true);

  SpreadsheetApp.getUi().alert(
    '✅ Task Metadata Sheet Setup Complete!\n\n' +
    'Sheet created with ' + headers.length + ' columns.\n' +
    'Ready to generate task metadata.\n\n' +
    'Next step: Click "Generate Task Metadata" to populate from source sheets.'
  );

  Logger.log('setupTaskMetadataSheet: Complete');
}

/**
 * Migrates Task Metadata sheet to add InTaskList column if it doesn't exist.
 * Call this to update existing Task Metadata sheets without losing data.
 * Note: Previously named InMyChecklist, renamed to InTaskList in Phase 5.
 */
function migrateTaskMetadataAddChecklistColumn() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Task Metadata');

  if (!sheet) {
    Logger.log('migrateTaskMetadataAddChecklistColumn: Task Metadata sheet not found');
    return { success: false, message: 'Task Metadata sheet not found' };
  }

  // Check if InTaskList column already exists (or old InMyChecklist name)
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var checklistColIndex = headers.indexOf('InTaskList');

  // Also check for old column name and rename it
  var oldColIndex = headers.indexOf('InMyChecklist');
  if (oldColIndex >= 0) {
    // Rename old column to new name
    sheet.getRange(1, oldColIndex + 1).setValue('InTaskList');
    Logger.log('migrateTaskMetadataAddChecklistColumn: Renamed InMyChecklist to InTaskList at column ' + (oldColIndex + 1));
    return { success: true, message: 'Renamed InMyChecklist to InTaskList' };
  }

  if (checklistColIndex >= 0) {
    Logger.log('migrateTaskMetadataAddChecklistColumn: InTaskList column already exists at column ' + (checklistColIndex + 1));
    return { success: true, message: 'InTaskList column already exists' };
  }

  // Add the column after LastModified (column Y = 25)
  var newColIndex = headers.length + 1;
  sheet.getRange(1, newColIndex).setValue('InTaskList');
  sheet.setColumnWidth(newColIndex, 100);

  // Add data validation for boolean
  var booleanValues = ['TRUE', 'FALSE', ''];
  var booleanRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(booleanValues)
    .setAllowInvalid(true)
    .build();
  sheet.getRange(2, newColIndex, sheet.getMaxRows() - 1, 1).setDataValidation(booleanRule);

  Logger.log('migrateTaskMetadataAddChecklistColumn: Added InTaskList column at column ' + newColIndex);
  return { success: true, message: 'Added InTaskList column at column ' + newColIndex };
}

/**
 * Generates task metadata from all source sheets and populates Task Metadata sheet.
 * Reads from: Glove Swaps, Sleeve Swaps, Training Tracking, Reclaims, Expiring Certs, Manual Tasks
 * Creates metadata records with unique TaskIDs for scheduling and state tracking.
 * Menu item: Glove Manager → Schedule & To-Do → Generate Task Metadata
 */
function generateTaskMetadata() {
  Logger.log('=== generateTaskMetadata START ===');
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var ui = SpreadsheetApp.getUi();

  // Check if Task Metadata sheet exists
  var metadataSheet = ss.getSheetByName('Task Metadata');
  if (!metadataSheet) {
    var response = ui.alert(
      'Task Metadata Sheet Not Found',
      'The Task Metadata sheet does not exist. Would you like to create it now?',
      ui.ButtonSet.YES_NO
    );
    if (response === ui.Button.YES) {
      setupTaskMetadataSheet();
      metadataSheet = ss.getSheetByName('Task Metadata');
    } else {
      return;
    }
  }

  // Show progress
  ui.alert('⏳ Generating Task Metadata\n\nThis may take 30-60 seconds.\nReading from source sheets and creating metadata records...');

  // Collect all tasks from source sheets using existing function
  var tasksByLocation = collectAndGroupTasks(ss);

  // Count total tasks
  var totalTasks = 0;
  for (var loc in tasksByLocation) {
    totalTasks += tasksByLocation[loc].length;
  }
  Logger.log('generateTaskMetadata: Collected ' + totalTasks + ' tasks from source sheets');

  if (totalTasks === 0) {
    ui.alert('⚠️ No Tasks Found\n\nNo pending tasks found in source sheets.\n\nMake sure you have:\n• Pending glove or sleeve swaps\n• Upcoming training\n• Expiring certifications\n• Manual tasks');
    return;
  }

  // Get employee data for enrichment
  var employeePhones = getEmployeePhoneMapForTasks(ss);
  Logger.log('generateTaskMetadata: Loaded ' + Object.keys(employeePhones).length + ' phone numbers');

  // Prepare metadata records
  var metadataRecords = [];
  var timestamp = new Date();
  var dateCreated = Utilities.formatDate(timestamp, Session.getScriptTimeZone(), 'yyyyMMdd');

  // Process each location's tasks
  for (var location in tasksByLocation) {
    var locationTasks = tasksByLocation[location];

    for (var t = 0; t < locationTasks.length; t++) {
      var task = locationTasks[t];

      // Create unique TaskID - check both source and sheetName properties
      var sourceSheet = task.source || task.sheetName || 'Unknown';
      var sourceRow = task.rowIndex || 0;
      var taskID = sourceSheet.replace(/\s+/g, '') + '_' + sourceRow + '_' + dateCreated;

      // Get phone number for employee
      var empNameLower = (task.employee || '').toLowerCase().trim();
      var phoneNumber = employeePhones[empNameLower] || '';

      // Format dates
      var dueDate = task.dueDate ? Utilities.formatDate(task.dueDate, Session.getScriptTimeZone(), 'yyyy-MM-dd') : '';
      var scheduledDate = task.scheduledDate ? Utilities.formatDate(task.scheduledDate, Session.getScriptTimeZone(), 'yyyy-MM-dd') : '';
      var createdDateFormatted = Utilities.formatDate(timestamp, Session.getScriptTimeZone(), 'yyyy-MM-dd');
      var lastModified = Utilities.formatDate(timestamp, Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');

      // Determine initial status
      var status = 'Pending';
      if (task.isOverdue) {
        status = 'Overdue';
      } else if (scheduledDate) {
        status = 'Scheduled';
      }

      // Create metadata record (25 columns)
      var record = [
        taskID,                    // A: TaskID
        sourceSheet,               // B: SourceSheet
        sourceRow,                 // C: SourceRow
        task.employee || '',       // D: Employee
        task.type || task.taskType || '',       // E: TaskType (cert tasks use 'type', others use 'taskType')
        task.itemType || '',       // F: ItemType (cert name for certs, Glove/Sleeve for swaps)
        task.currentItem || '',    // G: CurrentItem
        location,                  // H: Location
        task.foreman || '',        // I: Foreman
        phoneNumber,               // J: PhoneNumber
        dueDate,                   // K: DueDate
        scheduledDate,             // L: ScheduledDate
        task.startTime || '',      // M: StartTime
        task.endTime || '',        // N: EndTime
        status,                    // O: Status
        '',                        // P: NotifiedDate
        '',                        // Q: ScheduledClassDate
        '',                        // R: ClassType
        'FALSE',                   // S: IsOffice
        'FALSE',                   // T: IsRegistered
        'FALSE',                   // U: IsDeclined
        '',                        // V: CompletedDate
        task.notes || '',          // W: Notes
        createdDateFormatted,      // X: CreatedDate
        lastModified               // Y: LastModified
      ];

      metadataRecords.push(record);
    }
  }

  Logger.log('generateTaskMetadata: Created ' + metadataRecords.length + ' metadata records');

  // Check for existing metadata to preserve user edits (scheduled dates/times)
  var existingData = metadataSheet.getDataRange().getValues();
  var existingMap = {};

  if (existingData.length > 1) {
    // Build map of existing sourceSheet_sourceRow keys with their data
    for (var i = 1; i < existingData.length; i++) {
      var existingSourceSheet = existingData[i][1]; // Column B: SourceSheet
      var existingSourceRow = existingData[i][2];   // Column C: SourceRow
      var key = existingSourceSheet + '_' + existingSourceRow;
      existingMap[key] = {
        rowIndex: i + 1, // 1-based row number
        scheduledDate: existingData[i][11],    // Column L: ScheduledDate
        startTime: existingData[i][12],        // Column M: StartTime
        endTime: existingData[i][13],          // Column N: EndTime
        status: existingData[i][14],           // Column O: Status
        notifiedDate: existingData[i][15],     // Column P: NotifiedDate
        scheduledClassDate: existingData[i][16], // Column Q: ScheduledClassDate
        classType: existingData[i][17],        // Column R: ClassType
        isOffice: existingData[i][18],         // Column S: IsOffice
        isRegistered: existingData[i][19],     // Column T: IsRegistered
        isDeclined: existingData[i][20],       // Column U: IsDeclined
        completedDate: existingData[i][21],    // Column V: CompletedDate
        notes: existingData[i][22],            // Column W: Notes
        createdDate: existingData[i][23]       // Column X: CreatedDate
      };
    }
  }

  // Separate new vs update records
  var newRecords = [];
  var updateRecords = [];
  var updatedCount = 0;

  for (var r = 0; r < metadataRecords.length; r++) {
    var rec = metadataRecords[r];
    var recSourceSheet = rec[1];
    var recSourceRow = rec[2];
    var recKey = recSourceSheet + '_' + recSourceRow;

    if (existingMap[recKey]) {
      // Task exists - PRESERVE user-edited fields, UPDATE source fields
      var existing = existingMap[recKey];

      // Update columns A-K (source-derived data) and Y (LastModified)
      // Preserve columns L-X (user-edited scheduling state)
      // For Safety Equipment tasks, always update notes to include vehicle number
      var taskType = rec[4]; // TaskType from source
      var notesToUse = existing.notes || rec[22];
      if (taskType === 'Safety Equipment' && rec[22]) {
        notesToUse = rec[22]; // Always use source notes for Safety Equipment (contains vehicle #)
      }

      var updatedRecord = [
        rec[0],  // A: TaskID (regenerate)
        rec[1],  // B: SourceSheet
        rec[2],  // C: SourceRow
        rec[3],  // D: Employee (from source)
        rec[4],  // E: TaskType (from source)
        rec[5],  // F: ItemType (from source)
        rec[6],  // G: CurrentItem (from source)
        rec[7],  // H: Location (from source)
        rec[8],  // I: Foreman (from source)
        rec[9],  // J: PhoneNumber (from source)
        rec[10], // K: DueDate (from source)
        existing.scheduledDate || '',      // L: PRESERVE ScheduledDate
        existing.startTime || '',          // M: PRESERVE StartTime
        existing.endTime || '',            // N: PRESERVE EndTime
        existing.status || rec[14],        // O: PRESERVE Status (or use new if empty)
        existing.notifiedDate || '',       // P: PRESERVE NotifiedDate
        existing.scheduledClassDate || '', // Q: PRESERVE ScheduledClassDate
        existing.classType || '',          // R: PRESERVE ClassType
        existing.isOffice || 'FALSE',      // S: PRESERVE IsOffice
        existing.isRegistered || 'FALSE',  // T: PRESERVE IsRegistered
        existing.isDeclined || 'FALSE',    // U: PRESERVE IsDeclined
        existing.completedDate || '',      // V: PRESERVE CompletedDate
        notesToUse,                        // W: Notes (use vehicle # for Safety Equipment)
        existing.createdDate || rec[23],   // X: PRESERVE CreatedDate
        rec[24]  // Y: UPDATE LastModified (new timestamp)
      ];

      updateRecords.push({
        rowIndex: existing.rowIndex,
        data: updatedRecord
      });
      updatedCount++;

    } else {
      // New task - add to sheet
      newRecords.push(rec);
    }
  }

  Logger.log('generateTaskMetadata: ' + newRecords.length + ' new records, ' + updatedCount + ' existing records to update');

  // Write updates to existing rows
  if (updateRecords.length > 0) {
    for (var u = 0; u < updateRecords.length; u++) {
      var update = updateRecords[u];
      metadataSheet.getRange(update.rowIndex, 1, 1, 25).setValues([update.data]);
    }
    Logger.log('generateTaskMetadata: Updated ' + updateRecords.length + ' existing records');
  }

  // Write new records to sheet
  if (newRecords.length > 0) {
    var startRow = metadataSheet.getLastRow() + 1;
    metadataSheet.getRange(startRow, 1, newRecords.length, 25).setValues(newRecords);
    Logger.log('generateTaskMetadata: Wrote ' + newRecords.length + ' records starting at row ' + startRow);
  }

  // Show success message
  var message = '✅ Task Metadata Generated!\n\n';
  message += '📊 Statistics:\n';
  message += '• Total tasks found: ' + totalTasks + '\n';
  message += '• New metadata records: ' + newRecords.length + '\n';
  message += '• Updated existing records: ' + updatedCount + '\n';
  message += '\n';
  message += '📍 Sources:\n';

  // Count by source
  var sourceCounts = {};
  for (var i = 0; i < metadataRecords.length; i++) {
    var source = metadataRecords[i][1];
    sourceCounts[source] = (sourceCounts[source] || 0) + 1;
  }
  for (var src in sourceCounts) {
    message += '• ' + src + ': ' + sourceCounts[src] + '\n';
  }

  message += '\n✅ Task Metadata sheet is ready for scheduling!';

  if (updatedCount > 0) {
    message += '\n\n💡 Note: Existing tasks were updated with fresh source data while preserving your scheduled dates, times, and completion status.';
  }

  ui.alert('Generate Task Metadata Complete', message, ui.ButtonSet.OK);
  Logger.log('=== generateTaskMetadata END ===');
}

/**
 * Gets all tasks with their metadata joined from Task Metadata sheet.
 * This is the new single-source-of-truth function that replaces getScheduleTasks().
 * Reads directly from source sheets and joins with Task Metadata for state info.
 *
 * @return {Object} Object with tasks array and metadata: {tasks: [...], lastGenerated: date}
 */
// Last updated: 2026-02-01 12:22 - Added formatTime function for time serialization
/**
 * Helper: Format Date object to YYYY-MM-DD string for JSON serialization
 * Google Apps Script cannot serialize Date objects to HTML client
 */
function formatDate(dateValue) {
  if (!dateValue) return null;

  // If already a string, return as-is
  if (typeof dateValue === 'string') {
    return dateValue;
  }

  // For Date objects, convert to YYYY-MM-DD
  var date;
  if (dateValue instanceof Date) {
    date = dateValue;
  } else {
    date = new Date(dateValue);
  }

  if (isNaN(date.getTime())) return null;

  var year = date.getFullYear();
  var month = String(date.getMonth() + 1).padStart(2, '0');
  var day = String(date.getDate()).padStart(2, '0');
  return year + '-' + month + '-' + day;
}

/**
 * Formats a time value to HH:MM string format.
 * Handles Date objects (from spreadsheet time cells) and strings.
 *
 * @param {Date|string|null} timeValue - The time to format
 * @return {string|null} Time in HH:MM format or null if invalid
 */
function formatTime(timeValue) {
  if (!timeValue) return null;

  // Debug: log input type and value
  Logger.log('formatTime input: ' + timeValue + ' (type: ' + typeof timeValue + ')');

  // If already a string, check format
  if (typeof timeValue === 'string') {
    var trimmed = timeValue.trim();

    // If already in 12-hour format with AM/PM, return as-is
    if (/^\d{1,2}:\d{2}\s*(AM|PM|am|pm)$/i.test(trimmed)) {
      Logger.log('formatTime: already 12-hour format, returning: ' + trimmed);
      return trimmed;
    }

    // If in HH:MM 24-hour format, convert to 12-hour
    if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(trimmed)) {
      var parts = trimmed.split(':');
      var hours = parseInt(parts[0], 10);
      var minutes = parts[1];
      var ampm = hours >= 12 ? 'PM' : 'AM';
      hours = hours % 12;
      if (hours === 0) hours = 12;
      var result = hours + ':' + minutes + ' ' + ampm;
      Logger.log('formatTime: converted 24hr to 12hr: ' + result);
      return result;
    }

    // Try to parse as date string
    timeValue = new Date(timeValue);
  }

  // For Date objects, extract hours and minutes using SPREADSHEET timezone
  var date;
  if (timeValue instanceof Date) {
    date = timeValue;
  } else {
    date = new Date(timeValue);
  }

  if (isNaN(date.getTime())) {
    Logger.log('formatTime: invalid date, returning null');
    return null;
  }

  // Use Utilities.formatDate with SPREADSHEET timezone and 12-hour format
  var spreadsheetTz = SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone();
  var result = Utilities.formatDate(date, spreadsheetTz, 'h:mm a');
  Logger.log('formatTime: Date object with spreadsheet timezone ' + spreadsheetTz + ', returning: ' + result);
  return result;
}

function getTasksWithMetadata() {
  Logger.log('=== getTasksWithMetadata START ===');
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var metadataSheet = ss.getSheetByName('Task Metadata');

  if (!metadataSheet) {
    throw new Error('TASK_METADATA_NOT_FOUND: Please run "Generate Task Metadata" first.');
  }

  // Check if metadata sheet is empty
  if (metadataSheet.getLastRow() <= 1) {
    throw new Error('TASK_METADATA_EMPTY: Please run "Generate Task Metadata" to populate data.');
  }

  // Read all metadata
  var metadataData = metadataSheet.getDataRange().getValues();
  var headers = metadataData[0];

  // Build column index map
  var colMap = {};
  for (var h = 0; h < headers.length; h++) {
    colMap[headers[h]] = h;
  }

  Logger.log('getTasksWithMetadata: Found ' + (metadataData.length - 1) + ' metadata records');

  // Build metadata lookup by sourceSheet_sourceRow
  var metadataLookup = {};
  var skippedUnknown = 0;
  for (var i = 1; i < metadataData.length; i++) {
    try {
      var row = metadataData[i];
      var sourceSheet = row[colMap['SourceSheet']];
      var sourceRow = row[colMap['SourceRow']];

      // Skip rows with "Unknown" SourceSheet (old invalid data)
      if (!sourceSheet || sourceSheet === 'Unknown') {
        skippedUnknown++;
        continue;
      }

      var key = sourceSheet + '_' + sourceRow;

      metadataLookup[key] = {
      taskID: row[colMap['TaskID']],
      employee: row[colMap['Employee']],
      taskType: row[colMap['TaskType']],
      itemType: row[colMap['ItemType']],
      currentItem: row[colMap['CurrentItem']],
      location: row[colMap['Location']],
      foreman: row[colMap['Foreman']],
      phoneNumber: row[colMap['PhoneNumber']],
      dueDate: row[colMap['DueDate']],
      scheduledDate: row[colMap['ScheduledDate']],
      startTime: formatTime(row[colMap['StartTime']]),
      endTime: formatTime(row[colMap['EndTime']]),
      status: row[colMap['Status']],
      notifiedDate: row[colMap['NotifiedDate']],
      scheduledClassDate: row[colMap['ScheduledClassDate']],
      classType: row[colMap['ClassType']],
      isOffice: row[colMap['IsOffice']] === true || row[colMap['IsOffice']] === 'TRUE',
      isRegistered: row[colMap['IsRegistered']],
      isDeclined: row[colMap['IsDeclined']],
      completedDate: row[colMap['CompletedDate']],
      notes: row[colMap['Notes']],
      createdDate: row[colMap['CreatedDate']],
      lastModified: row[colMap['LastModified']],
      // Support both old (InMyChecklist) and new (InTaskList) column names for backwards compatibility
      inTaskList: row[colMap['InTaskList']] === true || row[colMap['InTaskList']] === 'TRUE' ||
                  row[colMap['InMyChecklist']] === true || row[colMap['InMyChecklist']] === 'TRUE',
      metadataRow: i + 1, // 1-based row number for updates
      sourceSheet: sourceSheet,
      sourceRow: sourceRow
    };
    } catch (e) {
      Logger.log('getTasksWithMetadata: Error processing metadata row ' + (i + 1) + ': ' + e);
      // Continue with other rows
    }
  }

  Logger.log('getTasksWithMetadata: Built metadata lookup with ' + Object.keys(metadataLookup).length + ' entries');
  if (skippedUnknown > 0) {
    Logger.log('getTasksWithMetadata: Skipped ' + skippedUnknown + ' records with Unknown SourceSheet');
  }

  // Collect tasks from source sheets (reuse existing function)
  var tasksByLocation = collectAndGroupTasks(ss);

  // Enrich tasks with metadata
  var enrichedTasks = [];
  for (var location in tasksByLocation) {
    var locationTasks = tasksByLocation[location];

    for (var t = 0; t < locationTasks.length; t++) {
      var task = locationTasks[t];

      // Build lookup key
      var sourceSheet = task.source || task.sheetName || 'Unknown';
      var sourceRow = task.rowIndex || 0;
      var key = sourceSheet + '_' + sourceRow;

      // Look up metadata
      var metadata = metadataLookup[key];

      if (metadata) {
        // DEBUG: Log cert tasks to see if itemType is present
        if ((task.type || task.taskType || '').toLowerCase().indexOf('cert') !== -1) {
          Logger.log('CERT DEBUG: key=' + key + ' task.itemType=' + task.itemType + ' metadata.itemType=' + metadata.itemType);
        }

        // Merge task with metadata (metadata takes precedence for state fields)
        var enrichedTask = {
          // Source data - use task data first, fallback to metadata
          taskType: task.type || task.taskType || metadata.taskType, // Map 'type' to 'taskType' for frontend
          itemType: task.itemType || metadata.itemType || '', // Cert name for certs, Glove/Sleeve for swaps
          employee: task.employee,
          location: task.location,
          foreman: task.foreman,
          currentItem: task.currentItem,
          pickListItem: task.pickListItem,
          size: task.size,
          estimatedTime: task.estimatedTime,
          priority: task.priority,
          sheetName: sourceSheet,
          rowIndex: sourceRow,
          source: sourceSheet, // Also map sheetName to source
          vehicleNumber: task.vehicleNumber || '',      // Pass vehicle number for Safety Equipment tasks
          emailSubject: task.emailSubject || '',        // Pass email subject for Safety Equipment tasks

          // Metadata (state information)
          taskID: metadata.taskID,
          dueDate: metadata.dueDate,
          scheduledDate: metadata.scheduledDate,
          startTime: metadata.startTime,
          endTime: metadata.endTime,
          status: metadata.status,
          phoneNumber: metadata.phoneNumber,
          notifiedDate: metadata.notifiedDate,
          scheduledClassDate: metadata.scheduledClassDate,
          classType: metadata.classType,
          isOffice: metadata.isOffice,
          isRegistered: metadata.isRegistered === 'TRUE' || metadata.isRegistered === true,
          isDeclined: metadata.isDeclined === 'TRUE' || metadata.isDeclined === true,
          completedDate: metadata.completedDate,
          notes: metadata.notes,
          metadataRow: metadata.metadataRow,
          inTaskList: metadata.inTaskList,

          // Computed fields
          isOverdue: task.isOverdue,
          daysTillDue: task.daysTillDue
        };

        enrichedTasks.push(enrichedTask);
      } else {
        // No metadata found - this task needs metadata generated
        Logger.log('getTasksWithMetadata: WARNING - No metadata for ' + key + ' (' + task.employee + ')');

        // Include task anyway with basic info
        enrichedTasks.push({
          taskType: task.type || task.taskType, // Map 'type' to 'taskType' for frontend
          itemType: task.itemType || '', // Cert name for certs, Glove/Sleeve for swaps
          employee: task.employee,
          location: task.location,
          foreman: task.foreman,
          currentItem: task.currentItem,
          dueDate: task.dueDate,
          status: 'Pending',
          phoneNumber: task.phoneNumber || '',
          sheetName: sourceSheet,
          rowIndex: sourceRow,
          source: sourceSheet, // Also map sheetName to source
          vehicleNumber: task.vehicleNumber || '',      // Pass vehicle number for Safety Equipment tasks
          emailSubject: task.emailSubject || '',        // Pass email subject for Safety Equipment tasks
          isOverdue: task.isOverdue,
          daysTillDue: task.daysTillDue,
          needsMetadata: true // Flag for regeneration
        });
      }
    }
  }

  // Phase 5: Include Task Metadata records with InTaskList=TRUE that weren't collected from source sheets
  // This ensures certs added to Task List appear even if not expiring within 30 days
  var includedKeys = {};
  enrichedTasks.forEach(function(task) {
    var key = task.sheetName + '_' + task.rowIndex;
    includedKeys[key] = true;
  });

  // Calculate previous work week boundaries for filtering Missing Safety Report tasks
  var today = new Date();
  var dayOfWeek = today.getDay(); // 0 = Sunday
  var currentWeekStart = new Date(today);
  currentWeekStart.setDate(today.getDate() - dayOfWeek);
  currentWeekStart.setHours(0, 0, 0, 0);
  var previousWeekStart = new Date(currentWeekStart);
  previousWeekStart.setDate(currentWeekStart.getDate() - 7);
  var previousWeekEnd = new Date(currentWeekStart);
  previousWeekEnd.setDate(currentWeekStart.getDate() - 1); // Saturday
  previousWeekEnd.setHours(23, 59, 59, 999);

  var taskListAdditions = 0;
  for (var metaKey in metadataLookup) {
    var metadata = metadataLookup[metaKey];

    // Skip if already included from source collection
    if (includedKeys[metaKey]) continue;

    // Only include if InTaskList is TRUE
    if (!metadata.inTaskList) continue;

    // Skip completed tasks
    if (metadata.status === 'Complete') continue;

    // FILTER: Missing Safety Report tasks - only include from PREVIOUS work week
    if (metadata.taskType === 'Missing Safety Report') {
      var taskDueDate = metadata.dueDate;
      if (taskDueDate) {
        var dueDateObj;
        if (taskDueDate instanceof Date) {
          dueDateObj = new Date(taskDueDate);
        } else {
          dueDateObj = new Date(taskDueDate);
        }
        dueDateObj.setHours(0, 0, 0, 0);

        // Skip if not from previous week
        if (dueDateObj < previousWeekStart || dueDateObj > previousWeekEnd) {
          Logger.log('getTasksWithMetadata: Skipping old Missing Safety Report task for ' + metadata.employee + ' (due: ' + dueDateObj.toDateString() + ')');
          continue;
        }
      }
    }

    // Create task object from metadata (source data not available)
    var taskFromMetadata = {
      taskType: metadata.taskType || 'Cert Expiring',
      itemType: metadata.itemType,
      employee: metadata.employee,
      location: metadata.location,
      foreman: metadata.foreman,
      currentItem: metadata.currentItem || '',
      pickListItem: '',
      size: '',
      estimatedTime: 0,
      priority: 'Medium',
      sheetName: metadata.sourceSheet,
      rowIndex: metadata.sourceRow,
      source: metadata.sourceSheet,

      // Metadata (state information)
      taskID: metadata.taskID,
      dueDate: metadata.dueDate,
      scheduledDate: metadata.scheduledDate,
      startTime: metadata.startTime,
      endTime: metadata.endTime,
      status: metadata.status || 'Pending',
      phoneNumber: metadata.phoneNumber,
      notifiedDate: metadata.notifiedDate,
      scheduledClassDate: metadata.scheduledClassDate,
      classType: metadata.classType,
      isOffice: metadata.isOffice,
      isRegistered: metadata.isRegistered === 'TRUE' || metadata.isRegistered === true,
      isDeclined: metadata.isDeclined === 'TRUE' || metadata.isDeclined === true,
      completedDate: metadata.completedDate,
      notes: metadata.notes,
      metadataRow: metadata.metadataRow,
      inTaskList: true,

      // Computed fields
      isOverdue: false,
      daysTillDue: 0
    };

    enrichedTasks.push(taskFromMetadata);
    taskListAdditions++;
    Logger.log('getTasksWithMetadata: Added InTaskList item: ' + metadata.employee + ' - ' + metadata.itemType);
  }

  if (taskListAdditions > 0) {
    Logger.log('getTasksWithMetadata: Added ' + taskListAdditions + ' tasks from InTaskList flag');
  }

  Logger.log('getTasksWithMetadata: Returning ' + enrichedTasks.length + ' enriched tasks');

  try {
    // Get last generated date safely
    var lastGenerated = new Date(); // Default to now
    try {
      var createdDateCol = colMap['CreatedDate'] || colMap['LastModified'] || 24;
      var dateValue = metadataSheet.getRange(2, createdDateCol).getValue(); // Row 2 (first data row)

      Logger.log('getTasksWithMetadata: Raw dateValue = "' + dateValue + '" (type: ' + typeof dateValue + ')');

      // Only use if it's a valid date
      if (dateValue && dateValue instanceof Date && !isNaN(dateValue.getTime())) {
        lastGenerated = dateValue;
      } else if (dateValue) {
        // Try to parse as date string
        var parsed = new Date(dateValue);
        if (!isNaN(parsed.getTime())) {
          lastGenerated = parsed;
        }
      }
      Logger.log('getTasksWithMetadata: Using lastGenerated = ' + lastGenerated);
    } catch (dateErr) {
      Logger.log('getTasksWithMetadata: Could not get lastGenerated date: ' + dateErr + ' - using current date');
    }

    // Convert Date objects to ISO strings for safe serialization
    // MINIMAL task objects to stay under 50KB transfer limit (45 tasks × ~500 bytes each = ~22KB)
    var serializedTasks = enrichedTasks.map(function(task, index) {
      return {
        // Identity (for saves/updates)
        taskKey: task.sheetName + '_' + task.rowIndex,
        idx: index,
        // Display fields
        emp: task.employee || '',
        type: task.taskType || '',
        item: task.itemType || '',
        loc: task.location || '',
        phone: task.phoneNumber || '',
        // Dates
        due: task.dueDate ? formatDate(task.dueDate) : '',
        sched: task.scheduledDate ? formatDate(task.scheduledDate) : '',
        start: task.startTime || '',
        end: task.endTime || '',
        // Status
        stat: task.status || 'Pending',
        over: task.isOverdue ? 1 : 0,
        days: task.daysTillDue || 0,
        // Source info
        src: task.sheetName || '',
        row: task.rowIndex || 0,
        manual: task.isManualTask ? 1 : 0,
        // Task List flag (Phase 5)
        inList: task.inTaskList ? 1 : 0,
        // Registration flag (Phase 5)
        reg: task.isRegistered ? 1 : 0
      };
    });

    Logger.log('getTasksWithMetadata: Serialized ' + serializedTasks.length + ' tasks');

    // Build result object
    var result = {
      tasks: serializedTasks,
      lastGenerated: formatDate(lastGenerated),
      totalTasks: serializedTasks.length
    };

    // Log the approximate size
    var jsonStr;
    try {
      jsonStr = JSON.stringify(result);
      Logger.log('getTasksWithMetadata: Result size ~' + Math.round(jsonStr.length / 1024) + 'KB');
    } catch (e) {
      Logger.log('getTasksWithMetadata: Could not measure size: ' + e);
      throw new Error('Failed to serialize task data');
    }

    // Store in ScriptProperties (500KB limit) to bypass transfer limit
    try {
      var props = PropertiesService.getScriptProperties();
      props.setProperty('TASKS_DATA', jsonStr);
      props.setProperty('TASKS_TIMESTAMP', new Date().toISOString());
      Logger.log('getTasksWithMetadata: Stored ' + result.totalTasks + ' tasks in ScriptProperties');
    } catch (propErr) {
      Logger.log('getTasksWithMetadata: ScriptProperties storage failed: ' + propErr);
      // Fall back to direct return
      Logger.log('getTasksWithMetadata: Attempting direct return...');
      return result;
    }

    // Return a small confirmation object - client will fetch data from properties
    Logger.log('getTasksWithMetadata: Returning confirmation to client');
    Logger.log('=== getTasksWithMetadata END ===');
    return {
      stored: true,
      totalTasks: result.totalTasks,
      lastGenerated: result.lastGenerated
    };

  } catch (e) {
    Logger.log('getTasksWithMetadata: ERROR: ' + e);
    Logger.log('getTasksWithMetadata: Stack: ' + e.stack);
    throw e;
  }
}

/**
 * Retrieves task data stored in ScriptProperties.
 * Called by client after getTasksWithMetadata() confirms data is stored.
 *
 * @return {Object} Full task data object with tasks array
 */
function getStoredTasks() {
  try {
    Logger.log('=== getStoredTasks START ===');

    var props = PropertiesService.getScriptProperties();
    var jsonStr = props.getProperty('TASKS_DATA');

    if (!jsonStr) {
      Logger.log('getStoredTasks: No data found in ScriptProperties');
      return {
        error: true,
        message: 'No task data found. Please refresh.'
      };
    }

    var data = JSON.parse(jsonStr);
    Logger.log('getStoredTasks: Retrieved ' + data.totalTasks + ' tasks from ScriptProperties');
    Logger.log('=== getStoredTasks END ===');

    return data;

  } catch (e) {
    Logger.log('getStoredTasks: ERROR: ' + e);
    return {
      error: true,
      message: 'Failed to read task data: ' + e.toString()
    };
  }
}

/**
 * Retrieves cached task data by cache key (legacy - may be removed).
 *
 * @param {string} cacheKey - The cache key
 * @return {Object} Full task data object with tasks array
 */
function getTasksFromCache(cacheKey) {
  try {
    Logger.log('=== getTasksFromCache START ===');
    Logger.log('Cache key: ' + cacheKey);

    var cache = CacheService.getScriptCache();
    var cached = cache.get(cacheKey);

    if (!cached) {
      Logger.log('ERROR: Cache key not found or expired: ' + cacheKey);
      return {
        error: true,
        message: 'Cache expired. Please refresh to reload tasks.'
      };
    }

    Logger.log('Cache hit! Parsing cached data...');
    var data = JSON.parse(cached);
    Logger.log('Successfully loaded ' + data.totalTasks + ' tasks from cache');
    Logger.log('=== getTasksFromCache END ===');

    return data;

  } catch (e) {
    Logger.log('ERROR in getTasksFromCache: ' + e);
    Logger.log('Stack: ' + e.stack);
    return {
      error: true,
      message: 'Cache read failed: ' + e.toString()
    };
  }
}

/**
 * Updates task metadata for a specific task.
 * Phase 3: Task State Updates
 *
 * @param {string} taskKey - The task key in format "SourceSheet_SourceRow" OR the TaskID
 * @param {Object} updates - Object with fields to update (e.g., {status: 'Complete', completedDate: new Date()})
 * @return {Object} Result with success status and updated task
 */
function updateTaskMetadata(taskKey, updates) {
  Logger.log('=== updateTaskMetadata START ===');
  Logger.log('taskKey: ' + taskKey);
  Logger.log('updates: ' + JSON.stringify(updates));

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var metadataSheet = ss.getSheetByName('Task Metadata');

  if (!metadataSheet) {
    return { success: false, error: 'Task Metadata sheet not found' };
  }

  var data = metadataSheet.getDataRange().getValues();
  var headers = data[0];

  // Build column index map
  var colMap = {};
  for (var h = 0; h < headers.length; h++) {
    colMap[headers[h]] = h;
  }

  // Find the row to update
  var targetRow = -1;
  var taskIdCol = colMap['TaskID'];
  var sourceSheetCol = colMap['SourceSheet'];
  var sourceRowCol = colMap['SourceRow'];

  for (var i = 1; i < data.length; i++) {
    var row = data[i];

    // Match by TaskID
    if (row[taskIdCol] === taskKey) {
      targetRow = i + 1; // 1-based row number
      break;
    }

    // Match by SourceSheet_SourceRow key
    var rowKey = row[sourceSheetCol] + '_' + row[sourceRowCol];
    if (rowKey === taskKey) {
      targetRow = i + 1;
      break;
    }
  }

  if (targetRow === -1) {
    Logger.log('updateTaskMetadata: Task not found for key: ' + taskKey);
    return { success: false, error: 'Task not found: ' + taskKey };
  }

  Logger.log('updateTaskMetadata: Found task at row ' + targetRow);

  // Apply updates
  var updatedFields = [];
  for (var field in updates) {
    if (updates.hasOwnProperty(field) && colMap.hasOwnProperty(field)) {
      var colIndex = colMap[field] + 1; // 1-based column
      var value = updates[field];

      // Format dates properly
      if (value instanceof Date) {
        value = Utilities.formatDate(value, Session.getScriptTimeZone(), 'yyyy-MM-dd');
      }

      metadataSheet.getRange(targetRow, colIndex).setValue(value);
      updatedFields.push(field);
      Logger.log('updateTaskMetadata: Set ' + field + ' = ' + value);
    }
  }

  // Always update LastModified
  if (colMap['LastModified'] !== undefined) {
    var now = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
    metadataSheet.getRange(targetRow, colMap['LastModified'] + 1).setValue(now);
    updatedFields.push('LastModified');
  }

  Logger.log('updateTaskMetadata: Updated fields: ' + updatedFields.join(', '));
  Logger.log('=== updateTaskMetadata END ===');

  return {
    success: true,
    taskKey: taskKey,
    row: targetRow,
    updatedFields: updatedFields
  };
}

/**
 * Marks a task as complete in Task Metadata.
 * Phase 3: Task State Updates
 *
 * Also syncs Safety Equipment tasks to Safety Reports sheet (status → Resolved)
 *
 * @param {string} taskKey - The task key in format "SourceSheet_SourceRow"
 * @param {Object} options - Optional settings (e.g., {syncToSource: true})
 * @return {Object} Result with success status
 */
function markTaskComplete(taskKey, options) {
  options = options || {};

  var result = updateTaskMetadata(taskKey, {
    Status: 'Complete',
    CompletedDate: new Date()
  });

  if (result.success) {
    // For Safety Equipment tasks, sync completion to Safety Reports sheet
    // This updates the source row status from "Needs Attention" to "Resolved"
    if (taskKey && (taskKey.indexOf('SafetyReports') === 0 || taskKey.indexOf('Safety Reports') === 0)) {
      try {
        var syncResult = syncSafetyReportCompletion(taskKey);
        if (syncResult && syncResult.synced) {
          Logger.log('markTaskComplete: Synced Safety Report to Resolved for ' + taskKey);
        }
      } catch (syncError) {
        Logger.log('markTaskComplete: Error syncing Safety Report: ' + syncError.toString());
        // Don't fail the main completion - just log the error
      }
    }

    if (options.syncToSource) {
      // Optionally sync completion to other source sheets
      syncTaskCompletionToSource(taskKey);
    }
  }

  return result;
}

/**
 * Records that a notification was sent for a task.
 * Phase 3: Task State Updates
 *
 * @param {string} taskKey - The task key
 * @param {string} notificationType - Type of notification ('sms', 'email', 'schedule')
 * @return {Object} Result with success status
 */
function recordTaskNotification(taskKey, notificationType) {
  var updates = {
    NotifiedDate: new Date()
  };

  // If scheduling a class, also record that
  if (notificationType === 'schedule') {
    updates.ScheduledClassDate = new Date();
  }

  return updateTaskMetadata(taskKey, updates);
}

/**
 * Updates the scheduled date/time for a task.
 * Phase 3: Task State Updates
 *
 * @param {string} taskKey - The task key
 * @param {string} scheduledDate - Date in YYYY-MM-DD format
 * @param {string} startTime - Optional start time in HH:MM format
 * @param {string} endTime - Optional end time in HH:MM format
 * @return {Object} Result with success status
 */
function scheduleTask(taskKey, scheduledDate, startTime, endTime) {
  var updates = {
    ScheduledDate: scheduledDate,
    Status: 'Scheduled'
  };

  if (startTime) updates.StartTime = startTime;
  if (endTime) updates.EndTime = endTime;

  return updateTaskMetadata(taskKey, updates);
}

/**
 * Marks a task as declined (employee declined training/class).
 * Phase 3: Task State Updates
 *
 * @param {string} taskKey - The task key
 * @param {string} reason - Optional reason for decline
 * @return {Object} Result with success status
 */
function markTaskDeclined(taskKey, reason) {
  var updates = {
    IsDeclined: true,
    Status: 'Declined'
  };

  if (reason) {
    updates.Notes = 'Declined: ' + reason;
  }

  return updateTaskMetadata(taskKey, updates);
}

/**
 * Marks a cert as declined, removes from Task List, and updates Expiring Certs sheet with declined date.
 * Phase 5: Full declined workflow
 *
 * @param {string} taskKey - The task key in format "Expiring Certs_rowNumber"
 * @param {string} employee - Employee name
 * @param {string} certType - Certificate type (e.g., 'Crane Cert')
 * @return {Object} Result with success status
 */
function markCertDeclinedAndRemove(taskKey, employee, certType) {
  Logger.log('markCertDeclinedAndRemove: ' + taskKey + ' for ' + employee + ' - ' + certType);

  var today = new Date();
  var declinedDate = Utilities.formatDate(today, Session.getScriptTimeZone(), 'yyyy-MM-dd');

  // 1. Update Task Metadata - mark as declined and remove from Task List
  var metadataResult = updateTaskMetadata(taskKey, {
    IsDeclined: 'TRUE',
    Status: 'Declined',
    InTaskList: '',  // Remove from Task List
    CompletedDate: declinedDate,  // Use CompletedDate to store the declined date
    Notes: 'Declined on ' + declinedDate
  });

  if (!metadataResult.success) {
    Logger.log('markCertDeclinedAndRemove: Failed to update Task Metadata: ' + metadataResult.error);
  }

  // 2. Update Expiring Certs sheet - add declined date to column
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var expiringSheet = ss.getSheetByName('Expiring Certs');

  if (expiringSheet) {
    // Find or create "Declined Date" column
    var headers = expiringSheet.getRange(1, 1, 1, expiringSheet.getLastColumn()).getValues()[0];
    var declinedColIndex = -1;

    for (var h = 0; h < headers.length; h++) {
      if (String(headers[h]).toLowerCase().trim() === 'declined date') {
        declinedColIndex = h + 1;
        break;
      }
    }

    // If column doesn't exist, create it
    if (declinedColIndex === -1) {
      declinedColIndex = headers.length + 1;
      expiringSheet.getRange(1, declinedColIndex).setValue('Declined Date');
      expiringSheet.getRange(1, declinedColIndex).setFontWeight('bold');
      Logger.log('markCertDeclinedAndRemove: Created Declined Date column at ' + declinedColIndex);
    }

    // Find the row for this employee + cert type
    var data = expiringSheet.getDataRange().getValues();
    var empCol = 0;  // Column A - Employee Name
    var certCol = 1; // Column B - Cert Type

    for (var i = 1; i < data.length; i++) {
      var rowEmployee = String(data[i][empCol] || '').trim();
      var rowCertType = String(data[i][certCol] || '').trim();

      if (rowEmployee.toLowerCase() === employee.toLowerCase() &&
          rowCertType.toLowerCase() === certType.toLowerCase()) {
        // Found the row - write declined date
        expiringSheet.getRange(i + 1, declinedColIndex).setValue(today);
        expiringSheet.getRange(i + 1, declinedColIndex).setNumberFormat('yyyy-mm-dd');
        Logger.log('markCertDeclinedAndRemove: Set declined date at row ' + (i + 1));
        break;
      }
    }
  }

  Logger.log('markCertDeclinedAndRemove: Complete');
  return { success: true, declinedDate: declinedDate };
}

/**
 * Re-adds a previously declined cert back to Task List for a future class.
 * Resets declined status, clears notification history, ready for fresh workflow.
 * Phase 5: Declined cert re-add workflow
 *
 * @param {string} taskKey - The task key in format "Expiring Certs_rowNumber"
 * @param {string} employee - Employee name
 * @param {string} certType - Certificate type (e.g., 'Crane Cert')
 * @return {Object} Result with success status
 */
function reAddDeclinedCertToTaskList(taskKey, employee, certType) {
  Logger.log('reAddDeclinedCertToTaskList: ' + taskKey + ' for ' + employee + ' - ' + certType);

  // 1. Update Task Metadata - reset declined status, add back to Task List, clear notifications
  var metadataResult = updateTaskMetadata(taskKey, {
    IsDeclined: 'FALSE',
    Status: 'Pending',
    InTaskList: 'TRUE',
    NotifiedDate: '',           // Clear notification date for fresh start
    ScheduledClassDate: '',     // Clear scheduled class date
    ClassType: '',              // Clear class type
    IsRegistered: 'FALSE',      // Clear registered flag
    CompletedDate: '',          // Clear completed/declined date
    Notes: 'Re-added to Task List on ' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd')
  });

  if (!metadataResult.success) {
    Logger.log('reAddDeclinedCertToTaskList: Failed to update Task Metadata: ' + metadataResult.error);
    return { success: false, error: metadataResult.error };
  }

  // 2. Clear declined date from Expiring Certs sheet
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var expiringSheet = ss.getSheetByName('Expiring Certs');

  if (expiringSheet) {
    // Find "Declined Date" column
    var headers = expiringSheet.getRange(1, 1, 1, expiringSheet.getLastColumn()).getValues()[0];
    var declinedColIndex = -1;

    for (var h = 0; h < headers.length; h++) {
      if (String(headers[h]).toLowerCase().trim() === 'declined date') {
        declinedColIndex = h + 1;
        break;
      }
    }

    if (declinedColIndex !== -1) {
      // Find the row for this employee + cert type
      var data = expiringSheet.getDataRange().getValues();
      var empCol = 0;  // Column A - Employee Name
      var certCol = 1; // Column B - Cert Type

      for (var i = 1; i < data.length; i++) {
        var rowEmployee = String(data[i][empCol] || '').trim();
        var rowCertType = String(data[i][certCol] || '').trim();

        if (rowEmployee.toLowerCase() === employee.toLowerCase() &&
            rowCertType.toLowerCase() === certType.toLowerCase()) {
          // Found the row - clear declined date
          expiringSheet.getRange(i + 1, declinedColIndex).setValue('');
          Logger.log('reAddDeclinedCertToTaskList: Cleared declined date at row ' + (i + 1));
          break;
        }
      }
    }
  }

  Logger.log('reAddDeclinedCertToTaskList: Complete - ' + employee + ' re-added for future class');
  return { success: true };
}

/**
 * Marks a task as registered (employee registered for class).
 * Phase 3: Task State Updates
 *
 * @param {string} taskKey - The task key
 * @param {string} classDate - The class date in YYYY-MM-DD format
 * @param {string} classType - Type of class (e.g., 'CPR', 'First Aid')
 * @return {Object} Result with success status
 */
function markTaskRegistered(taskKey, classDate, classType) {
  var updates = {
    IsRegistered: true,
    ScheduledClassDate: classDate,
    Status: 'Registered'
  };

  if (classType) {
    updates.ClassType = classType;
  }

  return updateTaskMetadata(taskKey, updates);
}

/**
 * Toggles a task's "In Task List" status (Phase 5: unified Task List).
 * If the task doesn't exist in Task Metadata, creates a new record for it.
 *
 * @param {string} taskKey - The task key in format "SourceSheet_SourceRow"
 * @param {boolean} inTaskList - Whether to add or remove from Task List
 * @param {Object} taskInfo - Optional task info for creating new record (employee, certType, location, etc.)
 * @return {Object} Result with success status
 */
function toggleTaskChecklist(taskKey, inTaskList, taskInfo) {
  Logger.log('toggleTaskChecklist: ' + taskKey + ' -> ' + inTaskList);

  // Try to update existing record first
  var result = updateTaskMetadata(taskKey, {
    InTaskList: inTaskList ? 'TRUE' : ''
  });

  // If task not found and we're adding to Task List, try to create the record
  if (!result.success && result.error && result.error.indexOf('Task not found') !== -1 && inTaskList) {
    Logger.log('toggleTaskChecklist: Task not found, attempting to create record for: ' + taskKey);

    // Parse taskKey to get source sheet and row
    var parts = taskKey.split('_');
    if (parts.length >= 2) {
      var sourceSheet = parts.slice(0, -1).join('_'); // Handle "Expiring Certs_123" format
      var sourceRow = parseInt(parts[parts.length - 1]);

      // Try to create a minimal Task Metadata record
      var createResult = createTaskMetadataRecord(sourceSheet, sourceRow, taskInfo);
      if (createResult.success) {
        Logger.log('toggleTaskChecklist: Created new Task Metadata record, now setting InTaskList');
        // Now try to update again
        result = updateTaskMetadata(taskKey, {
          InTaskList: 'TRUE'
        });
      } else {
        Logger.log('toggleTaskChecklist: Failed to create record: ' + createResult.error);
      }
    }
  }

  return result;
}

/**
 * Creates a new Task Metadata record for a task that doesn't have one.
 * Used when adding certs from Expiring Certs tab to Task List.
 *
 * @param {string} sourceSheet - Source sheet name (e.g., "Expiring Certs")
 * @param {number} sourceRow - Row number in source sheet
 * @param {Object} taskInfo - Optional task info (employee, certType, location, phoneNumber, dueDate)
 * @return {Object} Result with success status
 */
function createTaskMetadataRecord(sourceSheet, sourceRow, taskInfo) {
  Logger.log('createTaskMetadataRecord: ' + sourceSheet + '_' + sourceRow);

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var metadataSheet = ss.getSheetByName('Task Metadata');

  if (!metadataSheet) {
    return { success: false, error: 'Task Metadata sheet not found' };
  }

  taskInfo = taskInfo || {};

  // For Expiring Certs, try to read data from the source sheet
  if (sourceSheet === 'Expiring Certs' && !taskInfo.employee) {
    var expiringSheet = ss.getSheetByName('Expiring Certs');
    if (expiringSheet && sourceRow >= 2) {
      try {
        var rowData = expiringSheet.getRange(sourceRow, 1, 1, 6).getValues()[0];
        taskInfo.employee = rowData[0] || '';
        taskInfo.certType = rowData[1] || '';
        taskInfo.dueDate = rowData[2] || '';
        Logger.log('createTaskMetadataRecord: Read from Expiring Certs - ' + taskInfo.employee + ', ' + taskInfo.certType);
      } catch (e) {
        Logger.log('createTaskMetadataRecord: Error reading Expiring Certs row: ' + e);
      }
    }
  }

  // Get employee phone/location if not provided
  if (taskInfo.employee && (!taskInfo.location || !taskInfo.phoneNumber)) {
    var employeesSheet = ss.getSheetByName('Employees');
    if (employeesSheet) {
      var empData = employeesSheet.getDataRange().getValues();
      var empHeaders = empData[0];
      var nameCol = -1, locCol = -1, phoneCol = -1, foremanCol = -1;

      for (var h = 0; h < empHeaders.length; h++) {
        var hdr = String(empHeaders[h]).toLowerCase().trim();
        if (hdr === 'name') nameCol = h;
        if (hdr === 'location') locCol = h;
        if (hdr === 'phone number' || hdr === 'phone') phoneCol = h;
        if (hdr === 'foreman') foremanCol = h;
      }

      var empNameLower = (taskInfo.employee || '').toLowerCase().trim();
      for (var i = 1; i < empData.length; i++) {
        var rowName = (empData[i][nameCol] || '').toString().toLowerCase().trim();
        if (rowName === empNameLower) {
          if (!taskInfo.location && locCol !== -1) taskInfo.location = empData[i][locCol] || '';
          if (!taskInfo.phoneNumber && phoneCol !== -1) {
            var phone = (empData[i][phoneCol] || '').toString().replace(/\D/g, '');
            if (phone.length === 10) phone = '1' + phone;
            if (phone.length >= 10) taskInfo.phoneNumber = phone;
          }
          if (!taskInfo.foreman && foremanCol !== -1) taskInfo.foreman = empData[i][foremanCol] || '';
          break;
        }
      }
    }
  }

  // Build TaskID
  var timestamp = new Date();
  var dateCreated = Utilities.formatDate(timestamp, Session.getScriptTimeZone(), 'yyyyMMdd');
  var taskID = sourceSheet.replace(/\s+/g, '') + '_' + sourceRow + '_' + dateCreated;

  // Format due date
  var dueDate = '';
  if (taskInfo.dueDate instanceof Date) {
    dueDate = Utilities.formatDate(taskInfo.dueDate, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  } else if (taskInfo.dueDate) {
    dueDate = String(taskInfo.dueDate);
  }

  // Build record
  var newRecord = [
    taskID,                           // TaskID
    sourceSheet,                      // SourceSheet
    sourceRow,                        // SourceRow
    taskInfo.employee || '',          // Employee
    'Cert Expiring',                  // TaskType
    taskInfo.certType || '',          // ItemType
    '',                               // CurrentItem
    taskInfo.location || '',          // Location
    taskInfo.foreman || '',           // Foreman
    taskInfo.phoneNumber || '',       // PhoneNumber
    dueDate,                          // DueDate
    '',                               // ScheduledDate
    '',                               // StartTime
    '',                               // EndTime
    'Pending',                        // Status
    '',                               // NotifiedDate
    '',                               // ScheduledClassDate
    '',                               // ClassType
    'FALSE',                          // IsOffice
    'FALSE',                          // IsRegistered
    'FALSE',                          // IsDeclined
    '',                               // CompletedDate
    '',                               // Notes
    Utilities.formatDate(timestamp, Session.getScriptTimeZone(), 'yyyy-MM-dd'),  // CreatedDate
    Utilities.formatDate(timestamp, Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss'),  // LastModified
    'TRUE'                            // InTaskList
  ];

  // Append to sheet
  var lastRow = metadataSheet.getLastRow();
  metadataSheet.getRange(lastRow + 1, 1, 1, newRecord.length).setValues([newRecord]);

  Logger.log('createTaskMetadataRecord: Created new record at row ' + (lastRow + 1));
  return { success: true, row: lastRow + 1 };
}

/**
 * Toggles a task's "Is Office" status (handled via phone/office work).
 * Phase 4: localStorage Migration
 *
 * @param {string} taskKey - The task key in format "SourceSheet_SourceRow"
 * @param {boolean} isOffice - Whether this is an office/phone task
 * @return {Object} Result with success status
 */
function toggleTaskOffice(taskKey, isOffice) {
  Logger.log('toggleTaskOffice: ' + taskKey + ' -> ' + isOffice);
  return updateTaskMetadata(taskKey, {
    IsOffice: isOffice ? 'TRUE' : ''
  });
}

/**
 * Gets all tasks that are in the user's Task List.
 * Phase 5: Renamed from "My Checklist" to "Task List"
 *
 * @return {Array} Array of tasks where InTaskList = TRUE
 */
function getChecklistTasks() {
  Logger.log('=== getChecklistTasks START ===');
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var metadataSheet = ss.getSheetByName('Task Metadata');

  if (!metadataSheet || metadataSheet.getLastRow() <= 1) {
    return [];
  }

  var data = metadataSheet.getDataRange().getValues();
  var headers = data[0];

  // Build column index map
  var colMap = {};
  for (var h = 0; h < headers.length; h++) {
    colMap[headers[h]] = h;
  }

  // Check for InTaskList column (new name) or InMyChecklist (old name)
  var inTaskListCol = colMap['InTaskList'];
  if (inTaskListCol === undefined) {
    // Check for old column name
    inTaskListCol = colMap['InMyChecklist'];
    if (inTaskListCol !== undefined) {
      // Rename it to InTaskList
      metadataSheet.getRange(1, inTaskListCol + 1).setValue('InTaskList');
      Logger.log('getChecklistTasks: Renamed InMyChecklist to InTaskList');
    }
  }

  // If column doesn't exist at all, add it
  if (inTaskListCol === undefined) {
    Logger.log('getChecklistTasks: InTaskList column not found, adding it now...');
    var newColIndex = headers.length + 1;
    metadataSheet.getRange(1, newColIndex).setValue('InTaskList');
    metadataSheet.setColumnWidth(newColIndex, 100);

    // Add TRUE/FALSE data validation
    var lastRow = metadataSheet.getLastRow();
    if (lastRow > 1) {
      var validation = SpreadsheetApp.newDataValidation()
        .requireValueInList(['TRUE', ''], true)
        .setAllowInvalid(false)
        .build();
      metadataSheet.getRange(2, newColIndex, lastRow - 1, 1).setDataValidation(validation);
    }
    Logger.log('getChecklistTasks: Added InTaskList column at column ' + newColIndex);
    return []; // Return empty for this call, next call will work
  }

  var checklistTasks = [];

  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    if (row[inTaskListCol] === true || row[inTaskListCol] === 'TRUE') {
      checklistTasks.push({
        taskKey: row[colMap['SourceSheet']] + '_' + row[colMap['SourceRow']],
        taskID: row[colMap['TaskID']],
        employee: row[colMap['Employee']],
        taskType: row[colMap['TaskType']],
        itemType: row[colMap['ItemType']],
        location: row[colMap['Location']],
        dueDate: formatDate(row[colMap['DueDate']]),
        scheduledDate: formatDate(row[colMap['ScheduledDate']]),
        status: row[colMap['Status']],
        notifiedDate: formatDate(row[colMap['NotifiedDate']]),
        isOffice: row[colMap['IsOffice']] === true || row[colMap['IsOffice']] === 'TRUE',
        phoneNumber: row[colMap['PhoneNumber']] || '',
        sourceSheet: row[colMap['SourceSheet']],
        sourceRow: row[colMap['SourceRow']]
      });
    }
  }

  Logger.log('getChecklistTasks: Found ' + checklistTasks.length + ' task list items');
  Logger.log('=== getChecklistTasks END ===');
  return checklistTasks;
}

/**
 * Syncs task completion status to the source sheet.
 * Called after marking a task complete in metadata.
 *
 * @param {string} taskKey - The task key in format "SourceSheet_SourceRow"
 */
function syncTaskCompletionToSource(taskKey) {
  Logger.log('syncTaskCompletionToSource: ' + taskKey);

  var parts = taskKey.split('_');
  if (parts.length < 2) {
    Logger.log('syncTaskCompletionToSource: Invalid key format');
    return;
  }

  var sourceSheetName = parts[0];
  var sourceRow = parseInt(parts[1], 10);

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sourceSheet = ss.getSheetByName(sourceSheetName);

  if (!sourceSheet) {
    Logger.log('syncTaskCompletionToSource: Source sheet not found: ' + sourceSheetName);
    return;
  }

  // Update based on sheet type
  if (sourceSheetName === 'Training Tracking') {
    // Find Status column and update
    var headers = sourceSheet.getRange(1, 1, 1, sourceSheet.getLastColumn()).getValues()[0];
    for (var h = 0; h < headers.length; h++) {
      if (String(headers[h]).toLowerCase() === 'status') {
        sourceSheet.getRange(sourceRow, h + 1).setValue('Complete');
        Logger.log('syncTaskCompletionToSource: Updated Training Tracking row ' + sourceRow);
        break;
      }
    }
  } else if (sourceSheetName === 'Glove Swaps' || sourceSheetName === 'Sleeve Swaps') {
    // For swaps, the "Date Changed" column indicates completion
    var headers = sourceSheet.getRange(1, 1, 1, sourceSheet.getLastColumn()).getValues()[0];
    for (var h = 0; h < headers.length; h++) {
      if (String(headers[h]).toLowerCase().indexOf('date changed') !== -1) {
        sourceSheet.getRange(sourceRow, h + 1).setValue(new Date());
        Logger.log('syncTaskCompletionToSource: Updated ' + sourceSheetName + ' row ' + sourceRow);
        break;
      }
    }
  }
  // Note: Expiring Certs don't have a "complete" status in source - they're handled by updating the cert date
}

/**
 * Batch update multiple tasks at once.
 * Phase 3: Task State Updates
 *
 * @param {Array} taskUpdates - Array of {taskKey: string, updates: Object}
 * @return {Object} Result with success counts
 */
function batchUpdateTaskMetadata(taskUpdates) {
  Logger.log('batchUpdateTaskMetadata: Processing ' + taskUpdates.length + ' updates');

  var successCount = 0;
  var failCount = 0;
  var results = [];

  for (var i = 0; i < taskUpdates.length; i++) {
    var update = taskUpdates[i];
    var result = updateTaskMetadata(update.taskKey, update.updates);

    if (result.success) {
      successCount++;
    } else {
      failCount++;
    }
    results.push(result);
  }

  return {
    success: failCount === 0,
    successCount: successCount,
    failCount: failCount,
    results: results
  };
}

// ============================================================================
// PHASE 7: CLEANUP & OPTIMIZATION FUNCTIONS
// ============================================================================

/**
 * Archives old completed tasks from Task Metadata to Task Metadata Archive sheet.
 * Tasks completed more than X days ago are moved to archive to keep the main sheet performant.
 * Phase 7: Cleanup & Optimization - Task 7.1
 *
 * @param {number} daysOld - Number of days after completion to archive (default: 30)
 * @return {Object} Result with counts of archived tasks
 */
function archiveOldCompletedTasks(daysOld) {
  daysOld = daysOld || 30;
  Logger.log('=== archiveOldCompletedTasks START (daysOld=' + daysOld + ') ===');

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var metadataSheet = ss.getSheetByName('Task Metadata');

  if (!metadataSheet) {
    return { success: false, error: 'Task Metadata sheet not found' };
  }

  // Get or create archive sheet
  var archiveSheet = ss.getSheetByName('Task Metadata Archive');
  if (!archiveSheet) {
    archiveSheet = ss.insertSheet('Task Metadata Archive');
    // Copy headers from metadata sheet
    var headers = metadataSheet.getRange(1, 1, 1, metadataSheet.getLastColumn()).getValues();
    archiveSheet.getRange(1, 1, 1, headers[0].length).setValues(headers);
    archiveSheet.getRange(1, 1, 1, headers[0].length)
      .setFontWeight('bold')
      .setBackground('#6aa84f')
      .setFontColor('white');
    archiveSheet.setFrozenRows(1);
    Logger.log('archiveOldCompletedTasks: Created Task Metadata Archive sheet');
  }

  var data = metadataSheet.getDataRange().getValues();
  if (data.length <= 1) {
    return { success: true, archivedCount: 0, message: 'No tasks to archive' };
  }

  var headers = data[0];

  // Find column indices
  var colMap = {};
  for (var h = 0; h < headers.length; h++) {
    colMap[headers[h]] = h;
  }

  var statusCol = colMap['Status'];
  var completedDateCol = colMap['CompletedDate'];
  var taskTypeCol = colMap['TaskType'];
  var dueDateCol = colMap['DueDate'];

  if (statusCol === undefined || completedDateCol === undefined) {
    return { success: false, error: 'Required columns (Status, CompletedDate) not found' };
  }

  var cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysOld);
  cutoffDate.setHours(0, 0, 0, 0);

  // Calculate previous work week boundaries for Safety Compliance tasks
  var now = new Date();
  var dayOfWeek = now.getDay();
  var currentWeekStart = new Date(now);
  currentWeekStart.setDate(now.getDate() - dayOfWeek);
  currentWeekStart.setHours(0, 0, 0, 0);
  var previousWeekStart = new Date(currentWeekStart);
  previousWeekStart.setDate(currentWeekStart.getDate() - 7);

  Logger.log('archiveOldCompletedTasks: Previous week start = ' + previousWeekStart.toDateString());

  var rowsToArchive = [];
  var rowIndicesToDelete = [];
  var safetyComplianceArchived = 0;
  var completedTasksArchived = 0;

  // Scan from bottom to top for safe deletion
  for (var i = data.length - 1; i >= 1; i--) {
    var row = data[i];
    var status = row[statusCol];
    var completedDate = row[completedDateCol];
    var taskType = taskTypeCol !== undefined ? row[taskTypeCol] : '';
    var dueDate = dueDateCol !== undefined ? row[dueDateCol] : null;

    var shouldArchive = false;

    // Case 1: Archive completed tasks older than cutoff
    if (status === 'Complete' && completedDate) {
      var completedDateObj;
      if (completedDate instanceof Date) {
        completedDateObj = completedDate;
      } else {
        completedDateObj = new Date(completedDate);
      }

      if (!isNaN(completedDateObj.getTime()) && completedDateObj < cutoffDate) {
        shouldArchive = true;
        completedTasksArchived++;
      }
    }

    // Case 2: Archive Safety Compliance tasks older than previous work week
    // These are "Missing Safety Report" tasks from weeks before the previous week
    if (taskType === 'Missing Safety Report' && dueDate) {
      var dueDateObj;
      if (dueDate instanceof Date) {
        dueDateObj = dueDate;
      } else {
        dueDateObj = new Date(dueDate);
      }

      if (!isNaN(dueDateObj.getTime()) && dueDateObj < previousWeekStart) {
        // This task is from a week older than the previous week - archive it
        shouldArchive = true;
        safetyComplianceArchived++;
        Logger.log('Archiving old Safety Compliance task with due date: ' + dueDateObj.toDateString());
      }
    }

    if (shouldArchive) {
      rowsToArchive.unshift(row); // Add to beginning to maintain order
      rowIndicesToDelete.unshift(i + 1); // 1-based row number
    }
  }

  Logger.log('archiveOldCompletedTasks: Found ' + rowsToArchive.length + ' tasks to archive');
  Logger.log('  - Completed tasks: ' + completedTasksArchived);
  Logger.log('  - Old Safety Compliance tasks: ' + safetyComplianceArchived);

  if (rowsToArchive.length === 0) {
    return { success: true, archivedCount: 0, message: 'No tasks to archive' };
  }

  // Append rows to archive sheet
  var archiveLastRow = archiveSheet.getLastRow();
  archiveSheet.getRange(archiveLastRow + 1, 1, rowsToArchive.length, rowsToArchive[0].length)
    .setValues(rowsToArchive);

  // Delete rows from metadata sheet (from bottom to top)
  for (var d = rowIndicesToDelete.length - 1; d >= 0; d--) {
    metadataSheet.deleteRow(rowIndicesToDelete[d]);
  }

  Logger.log('archiveOldCompletedTasks: Archived ' + rowsToArchive.length + ' tasks');
  Logger.log('=== archiveOldCompletedTasks END ===');

  return {
    success: true,
    archivedCount: rowsToArchive.length,
    completedTasksArchived: completedTasksArchived,
    safetyComplianceArchived: safetyComplianceArchived,
    cutoffDate: Utilities.formatDate(cutoffDate, Session.getScriptTimeZone(), 'yyyy-MM-dd'),
    message: 'Archived ' + rowsToArchive.length + ' tasks:\n' +
             '• ' + completedTasksArchived + ' completed tasks (older than ' + daysOld + ' days)\n' +
             '• ' + safetyComplianceArchived + ' old Safety Compliance tasks'
  };
}

/**
 * Shows archive completed tasks dialog.
 * Menu item: Glove Manager → Utilities → Archive Old Completed Tasks
 * Phase 7: Cleanup & Optimization - Task 7.1
 */
function showArchiveCompletedTasksDialog() {
  var ui = SpreadsheetApp.getUi();
  var response = ui.prompt(
    '🗄️ Archive Completed Tasks',
    'Enter number of days (tasks completed more than X days ago will be archived):\n\n' +
    'Default: 30 days\nRecommended: 30-90 days',
    ui.ButtonSet.OK_CANCEL
  );

  if (response.getSelectedButton() !== ui.Button.OK) {
    return;
  }

  var daysStr = response.getResponseText().trim();
  var days = parseInt(daysStr, 10);

  if (isNaN(days) || days < 1) {
    days = 30;
  }

  var result = archiveOldCompletedTasks(days);

  if (result.success) {
    ui.alert('✅ Archive Complete', result.message, ui.ButtonSet.OK);
  } else {
    ui.alert('❌ Archive Failed', result.error || 'Unknown error', ui.ButtonSet.OK);
  }
}

/**
 * Cleans up orphaned Task Metadata records where the source task no longer exists.
 * Phase 7: Cleanup & Optimization - Task 7.1
 *
 * @return {Object} Result with counts of cleaned up records
 */
function cleanupOrphanedTaskMetadata() {
  Logger.log('=== cleanupOrphanedTaskMetadata START ===');

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var metadataSheet = ss.getSheetByName('Task Metadata');

  if (!metadataSheet) {
    return { success: false, error: 'Task Metadata sheet not found' };
  }

  var data = metadataSheet.getDataRange().getValues();
  if (data.length <= 1) {
    return { success: true, cleanedCount: 0, message: 'No records to check' };
  }

  var headers = data[0];
  var colMap = {};
  for (var h = 0; h < headers.length; h++) {
    colMap[headers[h]] = h;
  }

  var sourceSheetCol = colMap['SourceSheet'];
  var sourceRowCol = colMap['SourceRow'];
  var statusCol = colMap['Status'];

  // Build cache of source sheet row counts
  var sourceSheets = {};
  var sheetNames = ['Glove Swaps', 'Sleeve Swaps', 'Training Tracking', 'Reclaims', 'Expiring Certs', 'Manual Tasks'];

  sheetNames.forEach(function(name) {
    var sheet = ss.getSheetByName(name);
    if (sheet) {
      sourceSheets[name] = sheet.getLastRow();
    }
  });

  var rowsToDelete = [];

  // Check each metadata record
  for (var i = data.length - 1; i >= 1; i--) {
    var row = data[i];
    var sourceSheet = row[sourceSheetCol];
    var sourceRow = row[sourceRowCol];
    var status = row[statusCol];

    // Skip completed/archived tasks - they may reference old rows
    if (status === 'Complete' || status === 'Archived') continue;

    // Skip if source sheet not tracked
    if (!sourceSheets.hasOwnProperty(sourceSheet)) continue;

    // Check if source row exists
    var maxRow = sourceSheets[sourceSheet];
    if (sourceRow > maxRow) {
      Logger.log('cleanupOrphanedTaskMetadata: Orphaned record - ' + sourceSheet + ' row ' + sourceRow + ' (max: ' + maxRow + ')');
      rowsToDelete.unshift(i + 1);
    }
  }

  Logger.log('cleanupOrphanedTaskMetadata: Found ' + rowsToDelete.length + ' orphaned records');

  if (rowsToDelete.length === 0) {
    return { success: true, cleanedCount: 0, message: 'No orphaned records found' };
  }

  // Delete orphaned rows (from bottom to top)
  for (var d = rowsToDelete.length - 1; d >= 0; d--) {
    metadataSheet.deleteRow(rowsToDelete[d]);
  }

  Logger.log('cleanupOrphanedTaskMetadata: Deleted ' + rowsToDelete.length + ' orphaned records');
  Logger.log('=== cleanupOrphanedTaskMetadata END ===');

  return {
    success: true,
    cleanedCount: rowsToDelete.length,
    message: 'Removed ' + rowsToDelete.length + ' orphaned metadata records'
  };
}

// ============================================================================
// PHASE 7.2: PHONE NUMBER CACHING
// ============================================================================

/**
 * Cache key for employee phone numbers
 */
var PHONE_CACHE_KEY = 'EMPLOYEE_PHONES';

/**
 * Gets employee phone numbers with caching for performance.
 * Phase 7: Cleanup & Optimization - Task 7.2
 *
 * @param {boolean} forceRefresh - If true, bypasses cache and reads fresh data
 * @return {Object} Map of employee names (lowercase) to phone numbers
 */
function getEmployeePhonesCached(forceRefresh) {
  Logger.log('=== getEmployeePhonesCached START (forceRefresh=' + forceRefresh + ') ===');

  var cache = CacheService.getScriptCache();

  // Try to get from cache first
  if (!forceRefresh) {
    var cached = cache.get(PHONE_CACHE_KEY);
    if (cached) {
      try {
        var phones = JSON.parse(cached);
        Logger.log('getEmployeePhonesCached: Cache hit - ' + Object.keys(phones).length + ' entries');
        return phones;
      } catch (e) {
        Logger.log('getEmployeePhonesCached: Cache parse error: ' + e);
      }
    }
  }

  // Read from sheet
  Logger.log('getEmployeePhonesCached: Cache miss - reading from Employees sheet');
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var empSheet = ss.getSheetByName('Employees');

  if (!empSheet) {
    Logger.log('getEmployeePhonesCached: Employees sheet not found');
    return {};
  }

  var data = empSheet.getDataRange().getValues();
  if (data.length <= 1) {
    return {};
  }

  var headers = data[0];
  var nameCol = -1, phoneCol = -1;

  for (var h = 0; h < headers.length; h++) {
    var hdr = String(headers[h]).toLowerCase().trim();
    if (hdr === 'name') nameCol = h;
    if (hdr === 'phone number' || hdr === 'phone') phoneCol = h;
  }

  if (nameCol === -1 || phoneCol === -1) {
    Logger.log('getEmployeePhonesCached: Required columns not found');
    return {};
  }

  var phones = {};
  for (var i = 1; i < data.length; i++) {
    var name = (data[i][nameCol] || '').toString().toLowerCase().trim();
    var phone = (data[i][phoneCol] || '').toString().replace(/\D/g, '');

    if (name && phone.length >= 10) {
      if (phone.length === 10) phone = '1' + phone;
      phones[name] = phone;
    }
  }

  // Store in cache (6 hours = 21600 seconds)
  try {
    cache.put(PHONE_CACHE_KEY, JSON.stringify(phones), 21600);
    Logger.log('getEmployeePhonesCached: Cached ' + Object.keys(phones).length + ' phone numbers');
  } catch (e) {
    Logger.log('getEmployeePhonesCached: Cache store error: ' + e);
  }

  Logger.log('=== getEmployeePhonesCached END ===');
  return phones;
}

/**
 * Clears the employee phone cache.
 * Call this when employee data is updated.
 */
function clearPhoneCache() {
  var cache = CacheService.getScriptCache();
  cache.remove(PHONE_CACHE_KEY);
  Logger.log('clearPhoneCache: Phone cache cleared');
}

/**
 * Gets phone number for a specific employee using cached data.
 * Phase 7: Cleanup & Optimization - Task 7.2
 *
 * @param {string} employeeName - Employee name to look up
 * @return {string} Phone number or empty string if not found
 */
function getEmployeePhoneCached(employeeName) {
  if (!employeeName) return '';

  var phones = getEmployeePhonesCached(false);
  var nameLower = employeeName.toLowerCase().trim();

  return phones[nameLower] || '';
}

// ============================================================================
// PHASE 7.3: TASK STATE DASHBOARD
// ============================================================================

/**
 * Gets task statistics for dashboard display.
 * Phase 7: Cleanup & Optimization - Task 7.3
 *
 * @return {Object} Statistics about tasks in the system
 */
function getTaskStatistics() {
  Logger.log('=== getTaskStatistics START ===');

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var metadataSheet = ss.getSheetByName('Task Metadata');

  if (!metadataSheet) {
    return {
      error: true,
      message: 'Task Metadata sheet not found. Run "Generate Task Metadata" first.'
    };
  }

  var data = metadataSheet.getDataRange().getValues();
  if (data.length <= 1) {
    return {
      totalTasks: 0,
      byStatus: {},
      byType: {},
      byLocation: {},
      overdueTasks: 0,
      scheduledThisWeek: 0,
      completedThisWeek: 0,
      lastGenerated: null
    };
  }

  var headers = data[0];
  var colMap = {};
  for (var h = 0; h < headers.length; h++) {
    colMap[headers[h]] = h;
  }

  var stats = {
    totalTasks: data.length - 1,
    byStatus: {},
    byType: {},
    byLocation: {},
    overdueTasks: 0,
    scheduledThisWeek: 0,
    completedThisWeek: 0,
    inTaskList: 0,
    notified: 0,
    lastGenerated: null
  };

  // Calculate date ranges
  var today = new Date();
  today.setHours(0, 0, 0, 0);

  var weekStart = new Date(today);
  weekStart.setDate(weekStart.getDate() - weekStart.getDay()); // Start of current week (Sunday)

  var weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);

  // Process each row
  for (var i = 1; i < data.length; i++) {
    var row = data[i];

    // Status counts
    var status = row[colMap['Status']] || 'Pending';
    stats.byStatus[status] = (stats.byStatus[status] || 0) + 1;

    // Type counts
    var taskType = row[colMap['TaskType']] || 'Unknown';
    stats.byType[taskType] = (stats.byType[taskType] || 0) + 1;

    // Location counts (only for non-completed)
    if (status !== 'Complete') {
      var location = row[colMap['Location']] || 'Unknown';
      stats.byLocation[location] = (stats.byLocation[location] || 0) + 1;
    }

    // Overdue check
    var dueDate = row[colMap['DueDate']];
    if (dueDate && status !== 'Complete') {
      var dueDateObj = dueDate instanceof Date ? dueDate : new Date(dueDate);
      if (!isNaN(dueDateObj.getTime()) && dueDateObj < today) {
        stats.overdueTasks++;
      }
    }

    // Scheduled this week check
    var scheduledDate = row[colMap['ScheduledDate']];
    if (scheduledDate) {
      var schedDateObj = scheduledDate instanceof Date ? scheduledDate : new Date(scheduledDate);
      if (!isNaN(schedDateObj.getTime()) && schedDateObj >= weekStart && schedDateObj <= weekEnd) {
        stats.scheduledThisWeek++;
      }
    }

    // Completed this week check
    var completedDate = row[colMap['CompletedDate']];
    if (completedDate && status === 'Complete') {
      var compDateObj = completedDate instanceof Date ? completedDate : new Date(completedDate);
      if (!isNaN(compDateObj.getTime()) && compDateObj >= weekStart && compDateObj <= weekEnd) {
        stats.completedThisWeek++;
      }
    }

    // In Task List count
    var inTaskList = row[colMap['InTaskList']];
    if (inTaskList === true || inTaskList === 'TRUE') {
      stats.inTaskList++;
    }

    // Notified count
    var notifiedDate = row[colMap['NotifiedDate']];
    if (notifiedDate) {
      stats.notified++;
    }

    // Get last generated date from first row
    if (i === 1) {
      var createdDate = row[colMap['CreatedDate']];
      if (createdDate) {
        stats.lastGenerated = createdDate instanceof Date ?
          Utilities.formatDate(createdDate, Session.getScriptTimeZone(), 'MMM d, yyyy h:mm a') :
          String(createdDate);
      }
    }
  }

  // Calculate pending (not completed, not declined)
  stats.pendingTasks = (stats.byStatus['Pending'] || 0) + (stats.byStatus['Scheduled'] || 0) + (stats.byStatus['Overdue'] || 0);

  Logger.log('getTaskStatistics: Total=' + stats.totalTasks + ', Pending=' + stats.pendingTasks + ', Overdue=' + stats.overdueTasks);
  Logger.log('=== getTaskStatistics END ===');

  return stats;
}

/**
 * Shows the Task State Dashboard dialog.
 * Menu item: Glove Manager → Schedule & To-Do → 📊 Task Dashboard
 * Phase 7: Cleanup & Optimization - Task 7.3
 */
function showTaskDashboard() {
  var stats = getTaskStatistics();

  if (stats.error) {
    SpreadsheetApp.getUi().alert('Error', stats.message, SpreadsheetApp.getUi().ButtonSet.OK);
    return;
  }

  // Build HTML dashboard
  var html = HtmlService.createHtmlOutput(buildTaskDashboardHtml(stats))
    .setWidth(600)
    .setHeight(500);

  SpreadsheetApp.getUi().showModalDialog(html, '📊 Task Dashboard');
}

/**
 * Builds HTML content for task dashboard.
 */
function buildTaskDashboardHtml(stats) {
  var html = '<style>';
  html += 'body { font-family: Arial, sans-serif; padding: 16px; }';
  html += '.stat-card { background: #f5f5f5; border-radius: 8px; padding: 12px; margin: 8px 0; }';
  html += '.stat-card h3 { margin: 0 0 8px 0; color: #333; font-size: 14px; }';
  html += '.stat-value { font-size: 24px; font-weight: bold; color: #1a73e8; }';
  html += '.stat-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }';
  html += '.stat-mini { text-align: center; padding: 8px; background: #fff; border-radius: 4px; }';
  html += '.stat-mini .label { font-size: 11px; color: #666; }';
  html += '.stat-mini .value { font-size: 18px; font-weight: bold; }';
  html += '.overdue { color: #d93025 !important; }';
  html += '.completed { color: #1e8e3e !important; }';
  html += '.scheduled { color: #f9ab00 !important; }';
  html += '.section { margin-top: 16px; }';
  html += '.section h4 { margin: 0 0 8px 0; color: #555; font-size: 13px; border-bottom: 1px solid #ddd; padding-bottom: 4px; }';
  html += '.breakdown { font-size: 12px; color: #666; }';
  html += '.breakdown div { padding: 2px 0; }';
  html += '.btn { padding: 8px 16px; border: none; border-radius: 4px; cursor: pointer; margin: 4px; }';
  html += '.btn-primary { background: #1a73e8; color: white; }';
  html += '.btn-secondary { background: #e8eaed; color: #333; }';
  html += '</style>';

  html += '<div class="stat-grid">';
  html += '<div class="stat-mini"><div class="value">' + stats.totalTasks + '</div><div class="label">Total Tasks</div></div>';
  html += '<div class="stat-mini"><div class="value">' + stats.pendingTasks + '</div><div class="label">Pending</div></div>';
  html += '<div class="stat-mini"><div class="value overdue">' + stats.overdueTasks + '</div><div class="label">Overdue</div></div>';
  html += '</div>';

  html += '<div class="stat-grid">';
  html += '<div class="stat-mini"><div class="value scheduled">' + stats.scheduledThisWeek + '</div><div class="label">Scheduled This Week</div></div>';
  html += '<div class="stat-mini"><div class="value completed">' + stats.completedThisWeek + '</div><div class="label">Completed This Week</div></div>';
  html += '<div class="stat-mini"><div class="value">' + stats.inTaskList + '</div><div class="label">In Task List</div></div>';
  html += '</div>';

  // Status breakdown
  html += '<div class="section"><h4>Status Breakdown</h4><div class="breakdown">';
  for (var status in stats.byStatus) {
    html += '<div>' + status + ': <strong>' + stats.byStatus[status] + '</strong></div>';
  }
  html += '</div></div>';

  // Task type breakdown
  html += '<div class="section"><h4>By Task Type</h4><div class="breakdown">';
  for (var taskType in stats.byType) {
    html += '<div>' + taskType + ': <strong>' + stats.byType[taskType] + '</strong></div>';
  }
  html += '</div></div>';

  // Top locations
  html += '<div class="section"><h4>Pending Tasks by Location</h4><div class="breakdown">';
  var sortedLocs = Object.keys(stats.byLocation).sort(function(a, b) {
    return stats.byLocation[b] - stats.byLocation[a];
  }).slice(0, 5);
  for (var l = 0; l < sortedLocs.length; l++) {
    var loc = sortedLocs[l];
    html += '<div>' + loc + ': <strong>' + stats.byLocation[loc] + '</strong></div>';
  }
  html += '</div></div>';

  // Footer with last generated
  if (stats.lastGenerated) {
    html += '<div style="margin-top: 16px; font-size: 11px; color: #999;">Last Generated: ' + stats.lastGenerated + '</div>';
  }

  // Action buttons
  html += '<div style="margin-top: 16px; text-align: center;">';
  html += '<button class="btn btn-primary" onclick="google.script.run.showToDoSchedule(); google.script.host.close();">Open Tasks & Calendar</button>';
  html += '<button class="btn btn-secondary" onclick="google.script.run.generateTaskMetadata(); google.script.host.close();">Refresh Data</button>';
  html += '</div>';

  return html;
}

// ============================================================================
// PHASE 7.4: PERFORMANCE OPTIMIZATION
// ============================================================================

/**
 * Performs health check on Task Metadata sheet.
 * Phase 7: Cleanup & Optimization - Task 7.4
 *
 * @return {Object} Health check results
 */
function performTaskMetadataHealthCheck() {
  Logger.log('=== performTaskMetadataHealthCheck START ===');

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var metadataSheet = ss.getSheetByName('Task Metadata');

  var results = {
    healthy: true,
    issues: [],
    suggestions: [],
    metrics: {}
  };

  if (!metadataSheet) {
    results.healthy = false;
    results.issues.push('Task Metadata sheet not found');
    return results;
  }

  var data = metadataSheet.getDataRange().getValues();
  results.metrics.totalRows = data.length - 1;

  if (data.length <= 1) {
    results.issues.push('No task data found');
    results.suggestions.push('Run "Generate Task Metadata" to populate data');
    return results;
  }

  var headers = data[0];
  var colMap = {};
  for (var h = 0; h < headers.length; h++) {
    colMap[headers[h]] = h;
  }

  // Check expected columns exist
  var expectedCols = ['TaskID', 'SourceSheet', 'SourceRow', 'Employee', 'Status', 'DueDate', 'ScheduledDate'];
  var missingCols = [];
  expectedCols.forEach(function(col) {
    if (colMap[col] === undefined) missingCols.push(col);
  });

  if (missingCols.length > 0) {
    results.healthy = false;
    results.issues.push('Missing columns: ' + missingCols.join(', '));
    results.suggestions.push('Re-run "Setup Task Metadata Sheet" to fix columns');
  }

  // Count statuses
  var statusCounts = {};
  var completedOlderThan30 = 0;
  var today = new Date();
  today.setHours(0, 0, 0, 0);
  var thirtyDaysAgo = new Date(today);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  var orphanedCount = 0;
  var duplicateKeys = {};
  var duplicateCount = 0;

  for (var i = 1; i < data.length; i++) {
    var row = data[i];

    // Status counts
    var status = row[colMap['Status']] || 'Unknown';
    statusCounts[status] = (statusCounts[status] || 0) + 1;

    // Old completed tasks
    if (status === 'Complete') {
      var completedDate = row[colMap['CompletedDate']];
      if (completedDate) {
        var compDate = completedDate instanceof Date ? completedDate : new Date(completedDate);
        if (!isNaN(compDate.getTime()) && compDate < thirtyDaysAgo) {
          completedOlderThan30++;
        }
      }
    }

    // Check for duplicates
    var sourceSheet = row[colMap['SourceSheet']];
    var sourceRow = row[colMap['SourceRow']];
    var key = sourceSheet + '_' + sourceRow;

    if (duplicateKeys[key]) {
      duplicateCount++;
    } else {
      duplicateKeys[key] = true;
    }
  }

  results.metrics.statusCounts = statusCounts;
  results.metrics.completedOlderThan30 = completedOlderThan30;
  results.metrics.duplicateCount = duplicateCount;

  // Generate suggestions
  if (completedOlderThan30 > 10) {
    results.suggestions.push('Consider archiving ' + completedOlderThan30 + ' completed tasks older than 30 days');
  }

  if (duplicateCount > 0) {
    results.issues.push(duplicateCount + ' duplicate task records found');
    results.suggestions.push('Run cleanup to remove duplicate records');
  }

  if (results.metrics.totalRows > 1000) {
    results.suggestions.push('Large dataset (' + results.metrics.totalRows + ' rows) - consider archiving old tasks for better performance');
  }

  Logger.log('performTaskMetadataHealthCheck: ' + JSON.stringify(results));
  Logger.log('=== performTaskMetadataHealthCheck END ===');

  return results;
}

/**
 * Shows health check results dialog.
 * Menu item: Glove Manager → Utilities → 🏥 Task Metadata Health Check
 */
function showTaskMetadataHealthCheck() {
  var results = performTaskMetadataHealthCheck();

  var message = '📊 Task Metadata Health Check\n\n';

  if (results.healthy) {
    message += '✅ Status: Healthy\n\n';
  } else {
    message += '⚠️ Status: Issues Found\n\n';
  }

  message += '📈 Metrics:\n';
  message += '• Total Tasks: ' + (results.metrics.totalRows || 0) + '\n';

  if (results.metrics.statusCounts) {
    for (var status in results.metrics.statusCounts) {
      message += '  - ' + status + ': ' + results.metrics.statusCounts[status] + '\n';
    }
  }

  if (results.metrics.completedOlderThan30 > 0) {
    message += '• Old completed (>30 days): ' + results.metrics.completedOlderThan30 + '\n';
  }

  if (results.metrics.duplicateCount > 0) {
    message += '• Duplicate records: ' + results.metrics.duplicateCount + '\n';
  }

  if (results.issues.length > 0) {
    message += '\n❌ Issues:\n';
    results.issues.forEach(function(issue) {
      message += '• ' + issue + '\n';
    });
  }

  if (results.suggestions.length > 0) {
    message += '\n💡 Suggestions:\n';
    results.suggestions.forEach(function(suggestion) {
      message += '• ' + suggestion + '\n';
    });
  }

  SpreadsheetApp.getUi().alert('Health Check Results', message, SpreadsheetApp.getUi().ButtonSet.OK);
}

/**
 * Removes duplicate Task Metadata records (keeps the newest one).
 * Phase 7: Cleanup & Optimization
 */
function removeDuplicateTaskMetadata() {
  Logger.log('=== removeDuplicateTaskMetadata START ===');

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var metadataSheet = ss.getSheetByName('Task Metadata');

  if (!metadataSheet) {
    return { success: false, error: 'Task Metadata sheet not found' };
  }

  var data = metadataSheet.getDataRange().getValues();
  if (data.length <= 1) {
    return { success: true, removedCount: 0, message: 'No data to check' };
  }

  var headers = data[0];
  var colMap = {};
  for (var h = 0; h < headers.length; h++) {
    colMap[headers[h]] = h;
  }

  var sourceSheetCol = colMap['SourceSheet'];
  var sourceRowCol = colMap['SourceRow'];
  var lastModifiedCol = colMap['LastModified'];

  // Find duplicates (keep the one with newest LastModified)
  var seen = {};
  var rowsToDelete = [];

  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var key = row[sourceSheetCol] + '_' + row[sourceRowCol];
    var lastMod = row[lastModifiedCol];

    if (seen[key]) {
      // Duplicate found - compare dates
      var existingMod = seen[key].lastMod;
      var existingRow = seen[key].row;

      var existingDate = existingMod instanceof Date ? existingMod : new Date(existingMod);
      var newDate = lastMod instanceof Date ? lastMod : new Date(lastMod);

      if (!isNaN(newDate.getTime()) && !isNaN(existingDate.getTime())) {
        if (newDate > existingDate) {
          // New row is newer - delete old row
          rowsToDelete.push(existingRow);
          seen[key] = { row: i + 1, lastMod: lastMod };
        } else {
          // Existing is newer - delete new row
          rowsToDelete.push(i + 1);
        }
      } else {
        // Can't compare dates - delete the later one
        rowsToDelete.push(i + 1);
      }
    } else {
      seen[key] = { row: i + 1, lastMod: lastMod };
    }
  }

  Logger.log('removeDuplicateTaskMetadata: Found ' + rowsToDelete.length + ' duplicates to remove');

  if (rowsToDelete.length === 0) {
    return { success: true, removedCount: 0, message: 'No duplicates found' };
  }

  // Sort descending for safe deletion
  rowsToDelete.sort(function(a, b) { return b - a; });

  // Delete duplicates
  for (var d = 0; d < rowsToDelete.length; d++) {
    metadataSheet.deleteRow(rowsToDelete[d]);
  }

  Logger.log('removeDuplicateTaskMetadata: Removed ' + rowsToDelete.length + ' duplicate records');
  Logger.log('=== removeDuplicateTaskMetadata END ===');

  return {
    success: true,
    removedCount: rowsToDelete.length,
    message: 'Removed ' + rowsToDelete.length + ' duplicate records'
  };
}

function buildSheets() {
  ensureSeparateHistorySheets(); // Remove old History tab and ensure separate history sheets
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheetDefs = [
    { name: SHEET_EMPLOYEES, headers: ['Name', 'Location', 'Job Number', 'Phone Number', 'Notification Emails', 'MP Email', 'Email Address', 'Glove Size', 'Sleeve Size', 'Hire Date', 'Last Day', 'Last Day Reason', 'Job Classification'] },
    { name: 'Employee History', headers: null, customSetup: true },
    { name: SHEET_GLOVES, headers: ['Glove', 'Size', 'Class', 'Test Date', 'Date Assigned', 'Location', 'Status', 'Assigned To', 'Change Out Date', 'Picked For', 'Notes'] },
    { name: SHEET_SLEEVES, headers: ['Sleeve', 'Size', 'Class', 'Test Date', 'Date Assigned', 'Location', 'Status', 'Assigned To', 'Change Out Date', 'Picked For', 'Notes'] },
    { name: SHEET_GLOVE_SWAPS, headers: ['Employee', 'Item Number', 'Size', 'Date Assigned', 'Change Out Date', 'Days Left', 'Pick List', 'Status', 'Picked', 'Date Changed'] },
    { name: SHEET_SLEEVE_SWAPS, headers: ['Employee', 'Item Number', 'Size', 'Date Assigned', 'Change Out Date', 'Days Left', 'Pick List', 'Status', 'Picked', 'Date Changed'] },
    { name: SHEET_PURCHASE_NEEDS, headers: ['Item Type', 'Size', 'Class', 'Quantity Needed', 'Reason', 'Status/Notes'] },
    { name: SHEET_INVENTORY_REPORTS, headers: null, customSetup: true },
    { name: SHEET_RECLAIMS, headers: null, customSetup: true }
    // Note: Item History Lookup sheet removed - lookup now displays in popup dialog
  ];
  sheetDefs.forEach(function(def) {
    var sheet = ss.getSheetByName(def.name);
    if (!sheet) {
      sheet = ss.insertSheet(def.name);
      if (def.headers) {
        sheet.getRange(1, 1, 1, def.headers.length).setValues([def.headers]);
      }
    } else if ([SHEET_EMPLOYEES, SHEET_GLOVES, SHEET_SLEEVES].includes(def.name)) {
      // For Employees, ensure all headers exist (add missing ones without clearing data)
      if (def.name === SHEET_EMPLOYEES && sheet.getLastRow() > 0 && def.headers) {
        var existingHeaders = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
        var existingHeadersLower = existingHeaders.map(function(h) { return String(h).toLowerCase().trim(); });

        // Check each required header and add if missing
        for (var hi = 0; hi < def.headers.length; hi++) {
          var reqHeader = def.headers[hi];
          var reqHeaderLower = reqHeader.toLowerCase().trim();
          if (existingHeadersLower.indexOf(reqHeaderLower) === -1) {
            // Add missing header at the end
            var newCol = sheet.getLastColumn() + 1;
            sheet.getRange(1, newCol).setValue(reqHeader)
              .setFontWeight('bold').setBackground('#1565c0').setFontColor('#ffffff').setHorizontalAlignment('center');
            Logger.log('Added missing header "' + reqHeader + '" to ' + def.name + ' at column ' + newCol);
          }
        }
      } else if (sheet.getLastRow() === 0 && def.headers) {
        // Only set headers if sheet is empty (no data)
        sheet.getRange(1, 1, 1, def.headers.length).setValues([def.headers]);
      }
      // Do not clear or overwrite any data
    } else if (def.customSetup) {
      // Custom setup sheets - don't clear, handled separately
    } else {
      sheet.clear();
      if (def.headers) {
        sheet.getRange(1, 1, 1, def.headers.length).setValues([def.headers]);
      }
    }
    // Formatting for Employees, Gloves, Sleeves
    if ([SHEET_EMPLOYEES, SHEET_GLOVES, SHEET_SLEEVES].includes(def.name)) {
      sheet.setFrozenRows(1);
      sheet.setFrozenColumns(1);
      var headerRange = sheet.getRange(1, 1, 1, def.headers.length);
      headerRange.setBackground('#1565c0');
      headerRange.setFontColor('#ffffff');
      headerRange.setFontWeight('bold');
      var lastRow = sheet.getLastRow();
      var lastCol = def.headers.length;
      if (lastRow > 1) {
        sheet.getRange(2, 1, lastRow - 1, lastCol).setHorizontalAlignment('center');
      }
      headerRange.setHorizontalAlignment('center');

      SpreadsheetApp.flush();

      for (var c = 1; c <= lastCol; c++) {
        sheet.autoResizeColumn(c);
      }

      if (def.name === SHEET_EMPLOYEES) {
        sheet.setColumnWidth(1, Math.max(sheet.getColumnWidth(1), 150));
        sheet.setColumnWidth(3, Math.max(sheet.getColumnWidth(3), 150));
        sheet.setColumnWidth(4, Math.max(sheet.getColumnWidth(4), 100));
        sheet.setColumnWidth(6, Math.max(sheet.getColumnWidth(6), 150));
        sheet.setColumnWidth(8, Math.max(sheet.getColumnWidth(8), 180));

        // Format Hire Date (column K=11) and Last Day (column L=12) as date only (no time)
        var empLastRow = Math.max(sheet.getLastRow(), 2);
        sheet.getRange(2, 11, empLastRow - 1, 2).setNumberFormat('mm/dd/yyyy');
      }

      if (def.name === SHEET_GLOVES || def.name === SHEET_SLEEVES) {
        var totalRows = Math.max(lastRow, 1);
        sheet.getRange(1, 10, totalRows, 1).setWrap(true);
        sheet.setColumnWidth(10, 180);
        sheet.getRange(1, 11, totalRows, 1).setWrap(true);
        sheet.setColumnWidth(11, 200);
      }
    }
    // Formatting for Glove Swaps, Sleeve Swaps
    if ([SHEET_GLOVE_SWAPS, SHEET_SLEEVE_SWAPS].includes(def.name)) {
      var swapSheet = sheet;
      var swapHeaders = def.headers.length;
      swapSheet.getRange(1, 1, 1, swapHeaders).setHorizontalAlignment('center');
      var swapLastRow = swapSheet.getLastRow();
      if (swapLastRow > 1) {
        swapSheet.getRange(2, 1, swapLastRow - 1, swapHeaders).setHorizontalAlignment('center');
      }
    }
  });

  // Ensure Picked For column exists on Gloves and Sleeves tabs
  ensurePickedForColumn();


  // Custom setup for Reclaims sheet - set up all required tables
  var reclaimsSheet = ss.getSheetByName(SHEET_RECLAIMS);
  if (!reclaimsSheet) {
    reclaimsSheet = ss.insertSheet(SHEET_RECLAIMS);
  }
  setupReclaimsSheet(reclaimsSheet);

  // Custom setup for Employee History sheet
  var empHistorySheet = ss.getSheetByName('Employee History');
  if (!empHistorySheet) {
    empHistorySheet = ss.insertSheet('Employee History');
  }
  setupEmployeeHistorySheet(empHistorySheet);

  // Add dropdown validation for Last Day Reason column on Employees sheet
  var employeesSheet = ss.getSheetByName(SHEET_EMPLOYEES);
  if (employeesSheet) {
    var empHeaders = employeesSheet.getRange(1, 1, 1, employeesSheet.getLastColumn()).getValues()[0];
    var lastDayReasonColIdx = -1;
    for (var h = 0; h < empHeaders.length; h++) {
      if (String(empHeaders[h]).toLowerCase().trim() === 'last day reason') {
        lastDayReasonColIdx = h + 1;  // 1-based
        break;
      }
    }
    if (lastDayReasonColIdx !== -1) {
      // Set dropdown for all data rows in Last Day Reason column
      var lastRow = Math.max(employeesSheet.getLastRow(), 100);  // At least 100 rows
      var reasonRange = employeesSheet.getRange(2, lastDayReasonColIdx, lastRow - 1, 1);
      var reasonRule = SpreadsheetApp.newDataValidation()
        .requireValueInList(['Quit', 'Fired', 'Layoff', 'Resigned'], true)
        .setAllowInvalid(false)
        .build();
      reasonRange.setDataValidation(reasonRule);
    }
  }

  logEvent('Sheets built or reset.');

  // Fix all Change Out Dates to ensure they're correct
  fixChangeOutDatesSilent();

  SpreadsheetApp.getUi().alert('✅ Build Sheets completed!\n\nAll required sheets have been created or verified.');
}

/**
 * Silently fixes all Change Out Dates without showing any UI prompts.
 * Called automatically before generating reports and after building sheets.
 */
function fixChangeOutDatesSilent() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var tz = ss.getSpreadsheetTimeZone();
  var sheetsToFix = ['Gloves', 'Sleeves'];
  var totalFixed = 0;

  sheetsToFix.forEach(function(sheetName) {
    var sheet = ss.getSheetByName(sheetName);
    if (!sheet || sheet.getLastRow() < 2) return;

    var isSleeve = (sheetName === 'Sleeves');
    var data = sheet.getDataRange().getValues();

    // Column indices (0-based for array): E=4 (Date Assigned), F=5 (Location), H=7 (Assigned To), I=8 (Change Out Date)
    for (var i = 1; i < data.length; i++) {
      var dateAssigned = data[i][4];  // Column E
      var location = data[i][5];       // Column F
      var assignedTo = data[i][7];     // Column H
      var currentChangeOut = data[i][8]; // Column I

      if (!dateAssigned) continue;

      var correctChangeOut = calculateChangeOutDate(dateAssigned, location, assignedTo, isSleeve);
      if (!correctChangeOut) continue;

      // Always update to ensure correct value - simpler and more reliable
      var cell = sheet.getRange(i + 1, 9);  // Column I (1-based row)
      if (correctChangeOut === 'N/A') {
        if (currentChangeOut !== 'N/A') {
          cell.setNumberFormat('@');
          cell.setValue('N/A');
          totalFixed++;
        }
      } else {
        // Format both dates for comparison
        var correctStr = Utilities.formatDate(correctChangeOut, tz, 'MM/dd/yyyy');
        var currentStr = '';

        if (currentChangeOut instanceof Date) {
          currentStr = Utilities.formatDate(currentChangeOut, tz, 'MM/dd/yyyy');
        } else if (typeof currentChangeOut === 'number' && currentChangeOut > 0) {
          // Serial date number
          var tempDate = new Date((currentChangeOut - 25569) * 86400 * 1000);
          currentStr = Utilities.formatDate(tempDate, tz, 'MM/dd/yyyy');
        }

        if (correctStr !== currentStr) {
          cell.setNumberFormat('MM/dd/yyyy');
          cell.setValue(correctChangeOut);
          totalFixed++;
        }
      }
    }
  });

  if (totalFixed > 0) {
    Logger.log('fixChangeOutDatesSilent: Fixed ' + totalFixed + ' Change Out Dates');
  }
}

/**
 * Calls all report-generation/update functions to refresh all reports/tabs.
 */
function generateAllReports() {
  try {
    logEvent('Generating all reports...');

    // First, ensure all Change Out Dates are correct (in case triggers didn't fire)
    fixChangeOutDatesSilent();

    // Sync inventory locations with current employee data
    syncInventoryLocations();

    generateGloveSwaps();
    generateSleeveSwaps();

    // Update Reclaims BEFORE Purchase Needs so reclaim data is available
    updateReclaimsSheet();
    updatePurchaseNeeds();
    updateInventoryReports();

    logEvent('All reports generated.');
    SpreadsheetApp.getUi().alert('✅ All reports generated successfully!');
  } catch (e) {
    logEvent('Error in generateAllReports: ' + e, 'ERROR');
    SpreadsheetApp.getUi().alert('❌ Error generating reports: ' + e);
  }
}

/**
 * Preserves manual Pick List edits before regenerating swap sheets.
 * Scans for cells with light blue background (#e3f2fd) in Pick List column.
 * Returns a map of employee name (lowercase) to pick list data.
 * @param {Sheet} swapSheet - The Glove/Sleeve Swaps sheet
 * @return {Object} Map of employeeName -> { pickListNum, status }
 */
function preserveManualPickLists(swapSheet) {
  var manualPicks = {};

  if (!swapSheet || swapSheet.getLastRow() < 2) {
    return manualPicks;
  }

  try {
    var lastRow = swapSheet.getLastRow();
    var lastCol = Math.min(swapSheet.getLastColumn(), 23);  // Only scan up to column W

    // Get all data and backgrounds for the entire sheet
    var dataRange = swapSheet.getRange(1, 1, lastRow, lastCol);
    var values = dataRange.getValues();
    var backgrounds = dataRange.getBackgrounds();

    // Light blue color for manual edits
    var manualEditColor = '#e3f2fd';

    for (var i = 0; i < values.length; i++) {
      var row = values[i];
      var bgRow = backgrounds[i];

      // Column A (index 0) = Employee name
      // Column G (index 6) = Pick List Item #
      // Column H (index 7) = Status
      var employeeName = (row[0] || '').toString().trim();
      var pickListNum = (row[6] || '').toString().trim();
      var status = (row[7] || '').toString().trim();
      var pickListBg = (bgRow[6] || '').toString().toLowerCase();

      // Skip header rows and empty employees
      if (!employeeName || employeeName === 'Employee' ||
          employeeName.indexOf('Class') !== -1 ||
          employeeName.indexOf('STAGE') !== -1 ||
          employeeName.indexOf('📍') !== -1) {
        continue;
      }

      // Check if Pick List cell has light blue background (manual edit indicator)
      if (pickListBg === manualEditColor && pickListNum && pickListNum !== '—') {
        var empKey = employeeName.toLowerCase();
        manualPicks[empKey] = {
          pickListNum: pickListNum,
          status: status
        };
        Logger.log('Preserved manual pick for ' + employeeName + ': ' + pickListNum);
      }
    }
  } catch (e) {
    Logger.log('Error in preserveManualPickLists: ' + e);
  }

  return manualPicks;
}

/**
 * Restores manual Pick List edits after regenerating swap sheets.
 * Searches for employee names in the preserved map and restores their manual picks.
 * @param {Sheet} swapSheet - The regenerated Glove/Sleeve Swaps sheet
 * @param {Object} manualPicks - Map from preserveManualPickLists
 * @param {number} startRow - First data row to search (1-based, after headers)
 * @param {number} endRow - Last row to search (1-based)
 */
function restoreManualPickLists(swapSheet, manualPicks, startRow, endRow) {
  if (!swapSheet || !manualPicks || Object.keys(manualPicks).length === 0) {
    return;
  }

  try {
    var manualEditColor = '#e3f2fd';
    var numRows = endRow - startRow + 1;

    if (numRows <= 0) return;

    // Get data for the range we're checking
    var dataRange = swapSheet.getRange(startRow, 1, numRows, 8);  // A-H columns
    var values = dataRange.getValues();

    var restoredCount = 0;

    for (var i = 0; i < values.length; i++) {
      var row = values[i];
      var employeeName = (row[0] || '').toString().trim();

      // Skip header rows and empty
      if (!employeeName || employeeName === 'Employee' ||
          employeeName.indexOf('Class') !== -1 ||
          employeeName.indexOf('STAGE') !== -1 ||
          employeeName.indexOf('📍') !== -1) {
        continue;
      }

      var empKey = employeeName.toLowerCase();

      // Check if this employee has a preserved manual pick
      if (manualPicks[empKey]) {
        var actualRow = startRow + i;
        var preserved = manualPicks[empKey];

        // Restore the Pick List item number and status
        swapSheet.getRange(actualRow, 7).setValue(preserved.pickListNum);  // Column G
        swapSheet.getRange(actualRow, 8).setValue(preserved.status);       // Column H

        // Reapply the light blue background
        swapSheet.getRange(actualRow, 7).setBackground(manualEditColor);

        Logger.log('Restored manual pick for ' + employeeName + ': ' + preserved.pickListNum);
        restoredCount++;
      }
    }

    if (restoredCount > 0) {
      Logger.log('Restored ' + restoredCount + ' manual pick list entries');
    }

  } catch (e) {
    Logger.log('Error in restoreManualPickLists: ' + e);
  }
}

/**
 * Consolidated swap generation function for both Gloves and Sleeves.
 * @param {string} itemType - Either 'Gloves' or 'Sleeves'
 */
function generateSwaps(itemType) {
  try {
    var isGloves = (itemType === 'Gloves');
    logEvent('Generating ' + itemType + ' Swaps report...');
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var swapSheetName = isGloves ? SHEET_GLOVE_SWAPS : SHEET_SLEEVE_SWAPS;
    var inventorySheetName = isGloves ? SHEET_GLOVES : SHEET_SLEEVES;
    var swapSheet = ss.getSheetByName(swapSheetName);
    var inventorySheet = ss.getSheetByName(inventorySheetName);
    var employeesSheet = ss.getSheetByName(SHEET_EMPLOYEES);

    // Create swap sheet if it doesn't exist
    if (!swapSheet) {
      swapSheet = ss.insertSheet(swapSheetName);
      logEvent('Created new ' + swapSheetName + ' sheet');
    }

    if (!inventorySheet || !employeesSheet) {
      logEvent('Required sheets not found for ' + itemType + ' Swaps');
      return;
    }

    // PRESERVE MANUAL PICK LIST EDITS BEFORE CLEARING
    var manualPicks = preserveManualPickLists(swapSheet);
    logEvent('Preserved ' + Object.keys(manualPicks).length + ' manual pick list entries');

    swapSheet.clear();

    // Schema cache removed during refactoring (Jan 2026)

    var currentRow = 1;
    var classes = isGloves ? [0, 2, 3] : [2, 3];  // Sleeves don't have Class 0
    var classNames = {0: 'Class 0', 2: 'Class 2', 3: 'Class 3'};
    var today = new Date();
    var ignoreNames = [
      'on shelf', 'in testing', 'packed for delivery', 'packed for testing',
      'failed rubber', 'lost', 'not repairable', '', 'n/a', 'ready for test', 'ready for delivery', 'assigned', 'destroyed'
    ];

    var employees = employeesSheet.getDataRange().getValues();
    var inventory = inventorySheet.getDataRange().getValues();
    if (employees.length < 2 || inventory.length < 2) {
      Logger.log('No data in Employees or ' + itemType);
      return;
    }

    var empData = employees.slice(1);
    var inventoryData = inventory.slice(1);

    // Find Location and Job Number columns in Employees sheet dynamically
    var empHeaders = employees[0];
    var locationColIdx = 2; // Default fallback (column C)
    var jobNumColIdx = 3; // Default fallback (column D)
    var classificationColIdx = 13; // Default fallback (column N)
    for (var h = 0; h < empHeaders.length; h++) {
      var headerLower = String(empHeaders[h]).trim().toLowerCase();
      if (headerLower === 'location') {
        locationColIdx = h;
      }
      if (headerLower === 'job number') {
        jobNumColIdx = h;
      }
      if (headerLower === 'job classification') {
        classificationColIdx = h;
      }
    }

    // Build employee map (includes location and job number)
    var empMap = {};
    var empLocationMap = {};  // Separate map for locations
    var empJobNumMap = {};    // Map for job numbers
    var empClassificationMap = {}; // Map for job classifications
    empData.forEach(function(row) {
      var name = (row[0] || '').toString().trim().toLowerCase();
      if (name && ignoreNames.indexOf(name) === -1) {
        empMap[name] = row;
        empLocationMap[name] = (row[locationColIdx] || 'Unknown').toString().trim();
        empJobNumMap[name] = (row[jobNumColIdx] || '').toString().trim();
        empClassificationMap[name] = (row[classificationColIdx] || '').toString().trim();
      }
    });

    // Helper function to extract crew number from job number (e.g., "009-26.04" -> "009-26")
    function extractCrewNum(jobNum) {
      if (!jobNum) return '';
      var jobStr = String(jobNum).trim();
      var lastDotIndex = jobStr.lastIndexOf('.');
      if (lastDotIndex !== -1) {
        return jobStr.substring(0, lastDotIndex);
      }
      return jobStr;
    }

    // Helper function to get foreman name for an employee's crew
    function getForemanForEmployee(employeeName) {
      var empNameLower = employeeName.toString().trim().toLowerCase();
      var empLocation = empLocationMap[empNameLower];
      var empJobNum = empJobNumMap[empNameLower];
      var empCrew = extractCrewNum(empJobNum);

      if (!empCrew || !empLocation) {
        return empCrew || 'Unknown';  // Return crew number if no foreman found
      }

      // Search for foreman in same location and crew
      var foremanName = null;
      Object.keys(empMap).forEach(function(name) {
        if (empLocationMap[name] === empLocation) {
          var theirCrew = extractCrewNum(empJobNumMap[name]);
          if (theirCrew === empCrew) {
            var classification = empClassificationMap[name];
            if (classification === 'F' || classification === 'GTO F') {
              foremanName = empMap[name][0]; // Get proper-case name from row
            }
          }
        }
      });

      return foremanName || empCrew || 'Unknown';  // Return foreman name, or crew number, or Unknown
    }

    // Read location approvals from Reclaims sheet to exclude employees
    // whose location is not approved for a given class (they go to Reclaims instead)
    var locationApprovals = {};
    var reclaimsSheet = ss.getSheetByName(SHEET_RECLAIMS);
    if (reclaimsSheet && reclaimsSheet.getLastRow() > 0) {
      var reclaimsData = reclaimsSheet.getDataRange().getValues();
      var inLocTable = false;
      for (var ri = 0; ri < reclaimsData.length; ri++) {
        var cellVal = (reclaimsData[ri][0] || '').toString();
        if (cellVal.indexOf('Class Location Approvals') !== -1 || cellVal.indexOf('Approved Class 3 Locations') !== -1) {
          inLocTable = true;
          continue;
        }
        if (inLocTable && (!cellVal || cellVal === '')) {
          inLocTable = false;
          continue;
        }
        if (inLocTable && cellVal && cellVal !== 'Location') {
          var approvalVal = (reclaimsData[ri][1] || '').toString().trim();
          if (approvalVal) {
            locationApprovals[cellVal] = approvalVal;
          }
        }
      }
    }

    /**
     * Helper function to check if a location is approved for a given class
     * @param {string} location - The employee's location
     * @param {number} itemClassNum - The item class (0, 2, or 3)
     * @returns {boolean} - True if the location is approved for this class
     */
    function isLocationApprovedForClass(location, itemClassNum) {
      var approval = locationApprovals[location] || '';
      if (!approval || approval === 'None') {
        return false;  // No approval means not approved for any class
      }
      if (itemClassNum === 0) {
        return true;  // Class 0 is always allowed (not voltage-rated)
      }
      if (itemClassNum === 2) {
        return approval === 'CL2' || approval === 'CL2 & CL3';
      }
      if (itemClassNum === 3) {
        return approval === 'CL3' || approval === 'CL2 & CL3';
      }
      return false;
    }

    var itemLabel = isGloves ? 'Glove' : 'Sleeve';
    var sizeColIndex = isGloves ? 8 : 9; // Glove Size in col I (8), Sleeve Size in col J (9)

    // Process each class
    classes.forEach(function(itemClass) {
      // Class title row - merge across all columns including hidden (A-W = 23 columns)
      swapSheet.getRange(currentRow, 1, 1, 23).merge().setValue(classNames[itemClass] + ' ' + itemLabel + ' Swaps');
      swapSheet.getRange(currentRow, 1, 1, 23)
        .setFontWeight('bold').setFontSize(12).setBackground('#e3eafc').setFontColor('#0d47a1').setHorizontalAlignment('center');
      currentRow++;

      // Stage group headers row (light grey background)
      swapSheet.getRange(currentRow, 11, 1, 3).merge().setValue('STAGE 1').setBackground('#e0e0e0').setFontWeight('bold').setHorizontalAlignment('center');
      swapSheet.getRange(currentRow, 14, 1, 3).merge().setValue('STAGE 1').setBackground('#e0e0e0').setFontWeight('bold').setHorizontalAlignment('center');
      swapSheet.getRange(currentRow, 17, 1, 4).merge().setValue('STAGE 2').setBackground('#e0e0e0').setFontWeight('bold').setHorizontalAlignment('center');
      swapSheet.getRange(currentRow, 21, 1, 3).merge().setValue('STAGE 3').setBackground('#e0e0e0').setFontWeight('bold').setHorizontalAlignment('center');
      currentRow++;

      // Stage description headers row (darker grey background)
      swapSheet.getRange(currentRow, 11, 1, 3).merge().setValue('Pick List ' + itemLabel + ' Before Check').setBackground('#bdbdbd').setFontWeight('bold').setHorizontalAlignment('center').setFontSize(9);
      swapSheet.getRange(currentRow, 14, 1, 3).merge().setValue('Old ' + itemLabel + ' Assignment').setBackground('#bdbdbd').setFontWeight('bold').setHorizontalAlignment('center').setFontSize(9);
      swapSheet.getRange(currentRow, 17, 1, 4).merge().setValue('Pick List ' + itemLabel + ' After Check').setBackground('#bdbdbd').setFontWeight('bold').setHorizontalAlignment('center').setFontSize(9);
      swapSheet.getRange(currentRow, 21, 1, 3).merge().setValue('Pick List ' + itemLabel + ' New Assignment').setBackground('#bdbdbd').setFontWeight('bold').setHorizontalAlignment('center').setFontSize(9);
      currentRow++;

      // Column headers row - visible (A-J) and hidden (K-W)
      var allHeaders = [
        'Employee', 'Current ' + itemLabel + ' #', 'Size', 'Date Assigned', 'Change Out Date', 'Days Left', 'Pick List Item #', 'Status', 'Picked', 'Date Changed',
        'Status', 'Assigned To', 'Date Assigned',
        'Status', 'Assigned To', 'Date Assigned',
        'Status', 'Assigned To', 'Date Assigned', 'Picked For',
        'Assigned To', 'Date Assigned', 'Change Out Date'
      ];
      swapSheet.getRange(currentRow, 1, 1, allHeaders.length).setValues([allHeaders]);
      swapSheet.getRange(currentRow, 1, 1, 10).setFontWeight('bold').setFontColor('#ffffff').setHorizontalAlignment('center').setBackground(HEADER_BG_COLOR);
      swapSheet.getRange(currentRow, 11, 1, 13).setFontWeight('bold').setBackground('#9e9e9e').setFontColor('#ffffff').setHorizontalAlignment('center').setFontSize(9);
      currentRow++;

      // Collect swap data
      var swapRows = [];
      var swapMeta = [];

      inventoryData.forEach(function(item) {
        if (parseInt(item[2], 10) !== itemClass) return;
        var assignedTo = (item[7] || '').toString().trim().toLowerCase();
        if (!assignedTo || ignoreNames.indexOf(assignedTo) !== -1 || !empMap[assignedTo]) {
          return;
        }
        var emp = empMap[assignedTo];
        var employeeLocation = empLocationMap[assignedTo] || 'Unknown';

        // Skip employees whose location is NOT approved for this class
        // These employees will appear in the Reclaims sheet instead
        if (!isLocationApprovedForClass(employeeLocation, itemClass)) {
          Logger.log('generateSwaps: Skipping ' + assignedTo + ' from Class ' + itemClass + ' swaps - location "' + employeeLocation + '" not approved');
          return;
        }

        var itemNum = item[0];
        var size = item[1];
        var dateAssigned = item[4];
        var changeOutDate = item[8];
        var status = item[6];
        var daysLeft = '';
        var daysLeftCell = {};

        if (changeOutDate && !isNaN(new Date(changeOutDate))) {
          var diff = (new Date(changeOutDate) - today) / (1000*60*60*24);
          var days = Math.ceil(diff);
          if (days < 0) {
            daysLeft = 'OVERDUE';
            daysLeftCell = {bold: true, color: '#ff5252'};
          } else if (days <= 14) {
            daysLeft = days;
            daysLeftCell = {bold: true, color: '#ff9800'};
          } else {
            daysLeft = days;
            daysLeftCell = {bold: false, color: '#388e3c'};
          }
        }

        if (dateAssigned && changeOutDate && daysLeft !== '' && ((typeof daysLeft === 'number' && daysLeft < 32) || daysLeft === 'OVERDUE')) {
          swapMeta.push({
            emp: emp,
            employeeLocation: empLocationMap[assignedTo] || 'Unknown',
            foreman: getForemanForEmployee(assignedTo),
            itemNum: itemNum,
            size: size,
            dateAssigned: dateAssigned,
            changeOutDate: changeOutDate,
            daysLeft: daysLeft,
            daysLeftCell: daysLeftCell,
            status: status,
            itemClass: itemClass,
            empPreferredSize: emp[sizeColIndex],
            itemSize: isGloves ? parseFloat(size) : size,
            oldStatus: status,
            oldAssignedTo: item[7],
            oldDateAssigned: dateAssigned
          });
        }
      });

      // Sort by Location (alphabetically), then by Foreman, then by Change Out Date (most urgent first)
      swapMeta.sort(function(a, b) {
        // First sort by location
        var locCompare = (a.employeeLocation || 'ZZZ').localeCompare(b.employeeLocation || 'ZZZ');
        if (locCompare !== 0) return locCompare;
        // Then by foreman (groups crew members together)
        var foremanCompare = (a.foreman || 'ZZZ').localeCompare(b.foreman || 'ZZZ');
        if (foremanCompare !== 0) return foremanCompare;
        // Finally by change out date (most urgent first)
        return new Date(a.changeOutDate) - new Date(b.changeOutDate);
      });

      var assignedItemNums = new Set();

      // Helper function to check if item has LOST-LOCATE marker
      var isLostLocate = function(item) {
        var notes = (item[10] || '').toString().trim().toUpperCase();
        return notes.indexOf('LOST-LOCATE') !== -1;
      };

      swapMeta.forEach(function(meta) {
        var useSize = isGloves ?
          (!isNaN(parseFloat(meta.empPreferredSize)) ? parseFloat(meta.empPreferredSize) : meta.itemSize) :
          (meta.empPreferredSize || meta.itemSize);
        var pickListValue = '—';
        var pickListStatus = '';
        var pickListSizeUp = false;
        var pickListStatusRaw = '';
        var pickListItemData = null;
        var isAlreadyPicked = false;  // Track if item was already picked for this employee
        var employeeName = meta.emp[0];  // Employee name for Picked For matching

        // FIRST: Check if there's already an item "Picked For" this employee in the inventory
        // Inventory columns: A=Item#(0), B=Size(1), C=Class(2), D=Test Date(3), E=Date Assigned(4),
        //                    F=Location(5), G=Status(6), H=Assigned To(7), I=Change Out Date(8), J=Picked For(9)
        var pickedForMatch = inventoryData.find(function(item) {
          var pickedFor = (item[9] || '').toString().trim();
          var classMatch = parseInt(item[2], 10) === meta.itemClass;
          // Check if Picked For contains this employee's name (case-insensitive)
          var pickedForEmployee = pickedFor.toLowerCase().indexOf(employeeName.toLowerCase()) !== -1;
          var notAlreadyUsed = !assignedItemNums.has(item[0]);
          var notLost = !isLostLocate(item);
          return classMatch && pickedForEmployee && notAlreadyUsed && notLost;
        });

        // Use the picked-for match if found
        // NOTE: Upgrades from "In Testing" to "On Shelf" are handled by upgradePickListItems() post-generation
        if (pickedForMatch) {
          // Found an item already picked for this employee!
          pickListValue = pickedForMatch[0];
          pickListStatusRaw = (pickedForMatch[6] || '').toString().trim().toLowerCase();
          pickListItemData = pickedForMatch;
          isAlreadyPicked = true;
          assignedItemNums.add(pickedForMatch[0]);

          // Check if it's a size up
          var pickedSize = isGloves ? parseFloat(pickedForMatch[1]) : pickedForMatch[1];
          if (isGloves && !isNaN(pickedSize) && !isNaN(useSize) && pickedSize > useSize) {
            pickListSizeUp = true;
          }

          Logger.log('Found Picked For match: ' + pickListValue + ' for ' + employeeName + ' (Status: ' + pickListStatusRaw + ')');
        }

        // If no Picked For match, search for available items as usual
        if (!pickListItemData) {
          // Try exact size On Shelf
          // IMPORTANT: Skip items that have a Picked For value for a DIFFERENT employee
          var match = inventoryData.find(function(item) {
            var statusMatch = item[6] && item[6].toString().trim().toLowerCase() === 'on shelf';
            var classMatch = parseInt(item[2], 10) === meta.itemClass;
            var sizeMatch = isGloves ?
              parseFloat(item[1]) === useSize :
              (item[1] && useSize && item[1].toString().trim().toLowerCase() === useSize.toString().trim().toLowerCase());
            var notAssigned = !assignedItemNums.has(item[0]);
            // Check if this item is reserved for someone else via Picked For
            var pickedFor = (item[9] || '').toString().trim();
            var isReservedForOther = pickedFor !== '' && pickedFor.toLowerCase().indexOf(employeeName.toLowerCase()) === -1;
            var notLost = !isLostLocate(item);
            return statusMatch && classMatch && sizeMatch && notAssigned && !isReservedForOther && notLost;
          });
          if (match) {
            pickListValue = match[0];
            pickListStatusRaw = 'on shelf';
            pickListItemData = match;
            assignedItemNums.add(match[0]);
          }
        }

        // Try size up On Shelf (Gloves only - sleeves don't have fractional sizes)
        if (!pickListItemData && isGloves && !isNaN(useSize)) {
          var match = inventoryData.find(function(item) {
            var pickedFor = (item[9] || '').toString().trim();
            var isReservedForOther = pickedFor !== '' && pickedFor.toLowerCase().indexOf(employeeName.toLowerCase()) === -1;
            var notLost = !isLostLocate(item);
            return item[6] && item[6].toString().trim().toLowerCase() === 'on shelf' &&
                   parseInt(item[2], 10) === meta.itemClass &&
                   parseFloat(item[1]) === useSize + 0.5 &&
                   !assignedItemNums.has(item[0]) &&
                   !isReservedForOther &&
                   notLost;
          });
          if (match) {
            pickListValue = match[0];
            pickListStatusRaw = 'on shelf';
            pickListSizeUp = true;
            pickListItemData = match;
            assignedItemNums.add(match[0]);
          }
        }

        // Try Ready For Delivery or In Testing
        if (!pickListItemData) {
          var match = inventoryData.find(function(item) {
            var stat = item[6] && item[6].toString().trim().toLowerCase();
            var statusMatch = (stat === 'ready for delivery' || stat === 'in testing');
            var classMatch = parseInt(item[2], 10) === meta.itemClass;
            var sizeMatch = isGloves ?
              parseFloat(item[1]) === useSize :
              (item[1] && item[1].toString().trim().toLowerCase() === useSize.toString().trim().toLowerCase());
            var notAssigned = !assignedItemNums.has(item[0]);
            // Check if this item is reserved for someone else via Picked For
            var pickedFor = (item[9] || '').toString().trim();
            var isReservedForOther = pickedFor !== '' && pickedFor.toLowerCase().indexOf(employeeName.toLowerCase()) === -1;
            var notLost = !isLostLocate(item);
            return statusMatch && classMatch && sizeMatch && notAssigned && !isReservedForOther && notLost;
          });
          if (match) {
            pickListValue = match[0];
            pickListStatusRaw = match[6].toString().trim().toLowerCase();
            pickListItemData = match;
            assignedItemNums.add(match[0]);
          }
        }

        // Try size up Ready For Delivery or In Testing (Gloves only)
        if (!pickListItemData && isGloves && !isNaN(useSize)) {
          var match = inventoryData.find(function(item) {
            var stat = item[6] && item[6].toString().trim().toLowerCase();
            var pickedFor = (item[9] || '').toString().trim();
            var isReservedForOther = pickedFor !== '' && pickedFor.toLowerCase().indexOf(employeeName.toLowerCase()) === -1;
            var notLost = !isLostLocate(item);
            return (stat === 'ready for delivery' || stat === 'in testing') &&
                   parseInt(item[2], 10) === meta.itemClass &&
                   parseFloat(item[1]) === useSize + 0.5 &&
                   !assignedItemNums.has(item[0]) &&
                   !isReservedForOther &&
                   notLost;
          });
          if (match) {
            pickListValue = match[0];
            pickListStatusRaw = match[6].toString().trim().toLowerCase();
            pickListSizeUp = true;
            pickListItemData = match;
            assignedItemNums.add(match[0]);
          }
        }

        // Determine display status
        if (pickListValue === '—') {
          pickListStatus = 'Need to Purchase ❌';
        } else if (pickListStatusRaw === 'on shelf') {
          pickListStatus = pickListSizeUp ? 'In Stock (Size Up) ⚠️' : 'In Stock ✅';
        } else if (pickListStatusRaw === 'ready for delivery') {
          pickListStatus = pickListSizeUp ? 'Ready For Delivery (Size Up) ⚠️' : 'Ready For Delivery 🚚';
        } else if (pickListStatusRaw === 'in testing') {
          pickListStatus = pickListSizeUp ? 'In Testing (Size Up) ⚠️' : 'In Testing ⏳';
        } else {
          pickListStatus = meta.status; // Default to original status if no match
        }

        // Determine final values - prioritize items already picked (from Picked For column)
        var finalPickListValue = pickListValue;
        var finalPickListStatus = pickListStatus;

        // Keep the actual status for already-picked items
        // Don't override "In Testing" with "Ready For Delivery"
        if (isAlreadyPicked && pickListStatusRaw !== 'in testing') {
          finalPickListStatus = pickListSizeUp ? 'Ready For Delivery (Size Up) ⚠️' : 'Ready For Delivery 🚚';
        }

        // Stage 2 data - populate if already picked
        var stage2Status = '';
        var stage2AssignedTo = '';
        var stage2DateAssigned = '';
        var stage2PickedFor = '';

        if (isAlreadyPicked && pickListItemData) {
          // Get Stage 2 data from the inventory item
          stage2Status = pickListItemData[6] || 'Ready For Delivery';
          stage2AssignedTo = pickListItemData[7] || 'Packed For Delivery';
          stage2DateAssigned = pickListItemData[4] || '';
          stage2PickedFor = pickListItemData[9] || '';  // Picked For column
        }

        // Build row data - all 23 columns (A-W)
        var rowData = [
          meta.emp[0], meta.itemNum, meta.size, meta.dateAssigned, meta.changeOutDate, meta.daysLeft,
          finalPickListValue,
          finalPickListStatus,
          isAlreadyPicked,  // Picked checkbox - TRUE if already picked for this employee
          '',               // Date Changed - empty until swap completed
          // K-M: Pick List Item Before Check (Stage 1 - original state before picking)
          pickListItemData ? (isAlreadyPicked ? 'On Shelf' : (pickListItemData[6] || '')) : '',
          pickListItemData ? (isAlreadyPicked ? 'On Shelf' : (pickListItemData[7] || '')) : '',
          pickListItemData ? (isAlreadyPicked ? '' : (pickListItemData[4] || '')) : '',
          // N-P: Old Item Assignment (the employee's current item)
          meta.oldStatus || '', meta.oldAssignedTo || '', meta.oldDateAssigned || '',
          // Q-T: Stage 2 (Ready For Delivery state)
          stage2Status,
          stage2AssignedTo,
          stage2DateAssigned,
          stage2PickedFor,
          // U-W: Stage 3 (empty until Date Changed is entered)
          '', '', ''
        ];

        swapRows.push({
          data: rowData,
          location: meta.employeeLocation,
          foreman: meta.foreman,
          daysLeftCell: meta.daysLeftCell
        });
      });

      // Group rows by location, then by foreman within each location
      var locationGroups = {};
      swapRows.forEach(function(row) {
        var loc = row.location || 'Unknown';
        var foreman = row.foreman || 'Unknown';
        if (!locationGroups[loc]) {
          locationGroups[loc] = {};
        }
        if (!locationGroups[loc][foreman]) {
          locationGroups[loc][foreman] = [];
        }
        locationGroups[loc][foreman].push(row);
      });

      // Get sorted location names (alphabetically)
      var sortedLocations = Object.keys(locationGroups).sort();

      if (sortedLocations.length > 0) {
        sortedLocations.forEach(function(location) {
          var foremanGroups = locationGroups[location];
          var sortedForemen = Object.keys(foremanGroups).sort();

          // Write location sub-header
          swapSheet.getRange(currentRow, 1, 1, 10).merge().setValue('📍 ' + location);
          swapSheet.getRange(currentRow, 1, 1, 10)
            .setFontWeight('bold')
            .setFontSize(10)
            .setBackground('#e8eaf6')
            .setFontColor('#3949ab')
            .setHorizontalAlignment('left');
          currentRow++;

          // Write foreman sub-groups within this location
          sortedForemen.forEach(function(foreman) {
            var foremanRows = foremanGroups[foreman];

            // Write foreman sub-header (only if multiple foremen in location)
            if (sortedForemen.length > 1 || foreman !== 'Unknown') {
              swapSheet.getRange(currentRow, 1, 1, 10).merge().setValue('    👷 ' + foreman);
              swapSheet.getRange(currentRow, 1, 1, 10)
                .setFontWeight('bold')
                .setFontSize(9)
                .setBackground('#f3e5f5')
                .setFontColor('#7b1fa2')
                .setHorizontalAlignment('left');
              currentRow++;
            }

            // Write data rows for this foreman
            var rowDataArray = foremanRows.map(function(r) { return r.data; });

            swapSheet.getRange(currentRow, 1, rowDataArray.length, 23).setValues(rowDataArray);
            swapSheet.getRange(currentRow, 1, rowDataArray.length, 23).setHorizontalAlignment('center');
            swapSheet.getRange(currentRow, 9, rowDataArray.length, 1).insertCheckboxes();

            // Apply Days Left styling
            var daysLeftRange = swapSheet.getRange(currentRow, 6, rowDataArray.length, 1);
            for (var i = 0; i < foremanRows.length; i++) {
              var val = foremanRows[i].data[5];
              var style = foremanRows[i].daysLeftCell;
              if (val === 'OVERDUE') {
                daysLeftRange.getCell(i+1,1).setFontWeight('bold').setFontColor(style.color);
              } else if (style.bold) {
                daysLeftRange.getCell(i+1,1).setFontWeight('bold').setFontColor(style.color);
              } else {
                daysLeftRange.getCell(i+1,1).setFontWeight('normal').setFontColor(style.color);
              }
            }

            currentRow += rowDataArray.length;
          }); // closes sortedForemen.forEach
        }); // closes sortedLocations.forEach
      } else {
        // No swaps due for this class
        swapSheet.getRange(currentRow, 1).setValue('No swaps due for this class');
        swapSheet.getRange(currentRow, 1, 1, 10).merge().setHorizontalAlignment('center').setFontStyle('italic');
        currentRow++;
      }
      currentRow += 2;
    }); // closes classes.forEach

    // Flush to ensure all data is written before resizing
    SpreadsheetApp.flush();

    // Auto-resize visible columns (A-J = columns 1-10)
    for (var c = 1; c <= 10; c++) {
      swapSheet.autoResizeColumn(c);
    }

    // Set minimum column widths for better readability
    swapSheet.setColumnWidth(1, Math.max(swapSheet.getColumnWidth(1), 120));  // Employee
    swapSheet.setColumnWidth(2, Math.max(swapSheet.getColumnWidth(2), 100));  // Current Glove #
    swapSheet.setColumnWidth(5, Math.max(swapSheet.getColumnWidth(5), 110));  // Change Out Date
    swapSheet.setColumnWidth(6, Math.max(swapSheet.getColumnWidth(6), 90));   // Days Left (F)
    swapSheet.setColumnWidth(7, Math.max(swapSheet.getColumnWidth(7), 80));   // Pick List
    swapSheet.setColumnWidth(8, Math.max(swapSheet.getColumnWidth(8), 180));  // Status

    // Set hidden column widths for readability when unhidden
    swapSheet.setColumnWidth(15, 120);  // Column O - Assigned To

    // Hide columns K-W (columns 11-23, which is 13 columns)
    swapSheet.hideColumns(11, 13);

    // RESTORE MANUAL PICK LIST EDITS AFTER REGENERATION
    if (Object.keys(manualPicks).length > 0) {
      // Find the first data row after all headers (skip class titles, stage headers, column headers)
      var firstDataRow = 1;
      var lastRow = swapSheet.getLastRow();
      for (var searchRow = 1; searchRow <= Math.min(lastRow, 20); searchRow++) {
        var cellValue = swapSheet.getRange(searchRow, 1).getValue();
        var cellStr = (cellValue || '').toString().trim();
        // Found a data row when it's not empty and not a header/title
        if (cellStr && cellStr !== 'Employee' &&
            cellStr.indexOf('Class') === -1 &&
            cellStr.indexOf('STAGE') === -1 &&
            cellStr.indexOf('Pick List') === -1 &&
            cellStr.indexOf('📍') === -1) {
          firstDataRow = searchRow;
          break;
        }
      }
      restoreManualPickLists(swapSheet, manualPicks, firstDataRow, swapSheet.getLastRow());
    }

    logEvent(itemType + ' Swaps report generated successfully.');
  } catch (e) {
    logEvent('Error in generateSwaps(' + itemType + '): ' + e, 'ERROR');
    throw e;
  }
}

/**
 * Generate Glove Swaps report (wrapper for generateSwaps).
 */
function generateGloveSwaps() {
  generateSwaps('Gloves');
}

/**
 * Generate Sleeve Swaps report (wrapper for generateSwaps).
 */
function generateSleeveSwaps() {
  generateSwaps('Sleeves');
}

// NOTE: generateSleeveSwaps_OLD was removed during refactoring (Jan 2026)
// The functionality is now handled by generateSwaps('Sleeves')

/**
 * Generate the Purchase Needs tab by parsing Glove Swaps and Sleeve Swaps tabs.
 * Groups items by reason (NEED TO ORDER, Size Up, In Testing, In Testing Size Up).
 * Each group is displayed as a separate table with totals.
 * Sorted by Class, then Size within each table.
 */
// NOTE: updatePurchaseNeeds() has been moved to 60-PurchaseNeeds.gs
// This version is kept for reference only and renamed to avoid conflicts.
function updatePurchaseNeeds_OLD() {
  try {
    logEvent('Updating Purchase Needs report...');
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var purchaseSheet = ss.getSheetByName('Purchase Needs') || ss.insertSheet('Purchase Needs');
    purchaseSheet.clear();

    // Table headers
    var tableHeaders = ['Severity', 'Timeframe', 'Item Type', 'Size', 'Class', 'Quantity Needed', 'Reason', 'Status', 'Notes'];

    // Table definitions - ordered by severity (1=most urgent, 4=least urgent)
    // ONLY tracks items that need purchasing: either no inventory or only size-up available
    var tables = [
      {
        title: '🛒 NEED TO ORDER',
        reason: 'None Available',
        status: 'NEED TO ORDER',
        severity: 1,
        timeframe: 'Immediate',
        titleBg: '#ef9a9a',
        headerBg: '#ffcdd2',
        match: function(status) { return status === 'Need to Purchase ❌'; }
      },
      {
        title: '📦⚠️ READY FOR DELIVERY (SIZE UP)',
        reason: 'Ready For Delivery + Size Up',
        status: 'Packed For Delivery (Size Up)',
        severity: 2,
        timeframe: 'In 2 Weeks',
        titleBg: '#80cbc4',
        headerBg: '#b2dfdb',
        match: function(status) { return status && status.indexOf('Ready For Delivery (Size Up)') === 0; }
      },
      {
        title: '⏳⚠️ IN TESTING (SIZE UP)',
        reason: 'In Testing + Size Up',
        status: 'Awaiting Test (Size Up)',
        severity: 3,
        timeframe: 'In 3 Weeks',
        titleBg: '#ce93d8',
        headerBg: '#e1bee7',
        match: function(status) { return status && status.indexOf('In Testing (Size Up)') === 0; }
      },
      {
        title: '⚠️ SIZE UP ASSIGNMENTS',
        reason: 'Size Up',
        status: 'Assigned (Size Up)',
        severity: 4,
        timeframe: 'Consider',
        titleBg: '#ffcc80',
        headerBg: '#ffe0b2',
        match: function(status) { return status && status.indexOf('In Stock (Size Up)') === 0; }
      }
    ];

    // Helper to process a swap tab
    function processSwapTab(tabName, itemType, allRows) {
      var sheet = ss.getSheetByName(tabName);
      if (!sheet) return;
      var data = sheet.getDataRange().getValues();
      var currentClass = null;

      for (var i = 0; i < data.length; i++) {
        var row = data[i];
        var cellA = row[0];

        var classHeaderPattern = new RegExp('^Class (\\d+) (Glove|Sleeve) Swaps', 'i');
        var headerMatch = cellA && typeof cellA === 'string' && cellA.match(classHeaderPattern);
        if (headerMatch) {
          currentClass = parseInt(headerMatch[1], 10);
          continue;
        }

        if (currentClass === null) continue;
        if (!cellA) continue;
        if (typeof cellA === 'string' && cellA.toLowerCase() === 'employee') continue;
        if (typeof cellA === 'string' && (cellA.indexOf('STAGE') !== -1 || cellA.indexOf('Pick List') !== -1)) continue;

        var size = row[2];
        var status = row[7];
        var employeeName = row[0];

        if (!size || !status) continue;

        var sizeStr = String(size);

        for (var t = 0; t < tables.length; t++) {
          if (tables[t].match(status)) {
            var classNum = parseInt(currentClass, 10);
            var key = itemType + '|' + sizeStr + '|' + classNum;

            if (!allRows[t][key]) {
              allRows[t][key] = { itemType: itemType, size: sizeStr, class: classNum, qty: 0, employees: [] };
            }
            allRows[t][key].qty++;
            if (employeeName && allRows[t][key].employees.indexOf(employeeName) === -1) {
              allRows[t][key].employees.push(employeeName);
            }
            break;
          }
        }
      }
    }

    var allRows = [{}, {}, {}, {}];
    processSwapTab('Glove Swaps', 'Glove', allRows);
    processSwapTab('Sleeve Swaps', 'Sleeve', allRows);

    // Also process Reclaims sheet for "Need to Purchase" items
    var reclaimsSheet = ss.getSheetByName('Reclaims');
    if (reclaimsSheet && reclaimsSheet.getLastRow() > 1) {
      var reclaimsData = reclaimsSheet.getDataRange().getValues();

      for (var ri = 0; ri < reclaimsData.length; ri++) {
        var rRow = reclaimsData[ri];
        var rFirstCell = (rRow[0] || '').toString().trim();

        // Skip headers, titles, location rows
        if (!rFirstCell || rFirstCell === 'Employee' ||
            rFirstCell.indexOf('⚠️') !== -1 ||
            rFirstCell.indexOf('📍') !== -1 ||
            rFirstCell.indexOf('Previous') !== -1 ||
            rFirstCell.indexOf('Lost Items') !== -1 ||
            rFirstCell === 'Item Type' ||
            rFirstCell === 'Location') {
          continue;
        }

        // Check if this is a reclaim data row with "Need to Purchase" status
        // Reclaims table format: Employee, Item Type, Item #, Size, Class, Location, Pick List Item #, Pick List Status
        var rItemType = (rRow[1] || '').toString().trim();  // Item Type (Glove/Sleeve)
        var rSize = (rRow[3] || '').toString().trim();       // Size
        var rClass = (rRow[4] || '').toString().trim();      // Class
        var rPickListStatus = (rRow[7] || '').toString().trim();  // Pick List Status
        var rEmployee = rFirstCell;  // Employee name

        // Only process if it's a valid reclaim row with Need to Purchase status
        if ((rItemType === 'Glove' || rItemType === 'Sleeve') &&
            rSize && rClass &&
            rPickListStatus.indexOf('Need to Purchase') !== -1) {

          var classNum = parseInt(rClass, 10);
          var key = rItemType + '|' + rSize + '|' + classNum;

          // Add to the "Need to Order" table (index 0)
          if (!allRows[0][key]) {
            allRows[0][key] = { itemType: rItemType, size: rSize, class: classNum, qty: 0, employees: [] };
          }
          allRows[0][key].qty++;
          if (rEmployee && allRows[0][key].employees.indexOf(rEmployee + ' (Reclaim)') === -1) {
            allRows[0][key].employees.push(rEmployee + ' (Reclaim)');
          }
        }
      }
    }

    var grandTotals = {
      needToOrder: 0,
      readyForDeliverySizeUp: 0,
      inTestingSizeUp: 0,
      sizeUp: 0
    };

    for (var t = 0; t < tables.length; t++) {
      var keys = Object.keys(allRows[t]);
      for (var k = 0; k < keys.length; k++) {
        var qty = allRows[t][keys[k]].qty;
        if (t === 0) grandTotals.needToOrder += qty;
        else if (t === 1) grandTotals.readyForDeliverySizeUp += qty;
        else if (t === 2) grandTotals.inTestingSizeUp += qty;
        else if (t === 3) grandTotals.sizeUp += qty;
      }
    }

    var rowIdx = 1;

    // Write summary section at top (9 columns)
    purchaseSheet.getRange(rowIdx, 1, 1, 9).merge().setValue('📊 PURCHASE NEEDS SUMMARY - Generated: ' + new Date().toLocaleString())
      .setFontWeight('bold').setFontSize(14).setBackground('#b0bec5').setFontColor('#333333').setHorizontalAlignment('center');
    rowIdx++;

    // Summary stats row (9 columns)
    var topSummaryData = [
      ['1️⃣ Immediate: ' + grandTotals.needToOrder,
       '2️⃣ In 2 Weeks: ' + grandTotals.readyForDeliverySizeUp,
       '3️⃣ In 3 Weeks: ' + grandTotals.inTestingSizeUp,
       '4️⃣ Consider: ' + grandTotals.sizeUp,
       '',
       '', '', '', '']
    ];
    purchaseSheet.getRange(rowIdx, 1, 1, 9).setValues(topSummaryData)
      .setBackground('#eceff1').setFontWeight('bold').setHorizontalAlignment('center');
    rowIdx += 2;

    // Write each table
    for (var t = 0; t < tables.length; t++) {
      var keys = Object.keys(allRows[t]);
      if (keys.length === 0) continue;

      // Sort keys by Class (numeric), then by Size
      keys.sort(function(a, b) {
        var aData = allRows[t][a];
        var bData = allRows[t][b];
        if (aData.class !== bData.class) return aData.class - bData.class;
        var aSize = parseFloat(aData.size) || 0;
        var bSize = parseFloat(bData.size) || 0;
        if (aSize !== bSize) return aSize - bSize;
        return aData.itemType.localeCompare(bData.itemType);
      });

      // Table title
      purchaseSheet.getRange(rowIdx, 1, 1, 9).merge().setValue(tables[t].title)
        .setFontWeight('bold').setFontSize(12).setBackground(tables[t].titleBg).setFontColor('#333333').setHorizontalAlignment('center');
      rowIdx++;

      // Table headers
      purchaseSheet.getRange(rowIdx, 1, 1, tableHeaders.length).setValues([tableHeaders])
        .setFontWeight('bold').setBackground(tables[t].headerBg).setHorizontalAlignment('center');
      rowIdx++;

      // Table rows
      var tableTotal = 0;
      var dataStartRow = rowIdx;
      for (var k = 0; k < keys.length; k++) {
        var r = allRows[t][keys[k]];
        tableTotal += r.qty;
        var classValue = parseInt(r.class, 10);
        var employeeList = r.employees && r.employees.length > 0 ? r.employees.join(', ') : '';
        var rowData = [
          tables[t].severity, tables[t].timeframe, r.itemType, r.size, classValue,
          r.qty, tables[t].reason, tables[t].status, employeeList
        ];
        purchaseSheet.getRange(rowIdx, 1, 1, rowData.length).setValues([rowData]);
        purchaseSheet.getRange(rowIdx, 1, 1, 8).setHorizontalAlignment('center');
        purchaseSheet.getRange(rowIdx, 9).setWrap(true);
        rowIdx++;
      }

      // Set Class column to plain number format
      var numDataRows = rowIdx - dataStartRow;
      if (numDataRows > 0) {
        purchaseSheet.getRange(dataStartRow, 5, numDataRows, 1).setNumberFormat('0');
      }

      // Table total row
      purchaseSheet.getRange(rowIdx, 1, 1, 5).merge().setValue('TOTAL')
        .setFontWeight('bold').setHorizontalAlignment('right').setBackground('#e0e0e0');
      purchaseSheet.getRange(rowIdx, 6).setValue(tableTotal)
        .setFontWeight('bold').setHorizontalAlignment('center').setBackground('#e0e0e0');
      purchaseSheet.getRange(rowIdx, 7, 1, 3).setBackground('#e0e0e0');
      rowIdx += 2;
    }

    // If no data at all, show message
    var totalItems = grandTotals.needToOrder + grandTotals.sizeUp + grandTotals.inTesting + grandTotals.inTestingSizeUp + grandTotals.readyForDelivery + grandTotals.readyForDeliverySizeUp;
    if (totalItems === 0) {
      purchaseSheet.getRange(rowIdx, 1, 1, 9).merge().setValue('✅ No purchase needs at this time!')
        .setFontWeight('bold').setFontSize(12).setBackground('#4caf50').setFontColor('white').setHorizontalAlignment('center');
    }

    // Create summary table to the right
    var summaryStartRow = 4;
    var summaryCol = 11;

    purchaseSheet.getRange(summaryStartRow, summaryCol, 1, 2).merge().setValue('📊 SUMMARY BY TIMEFRAME')
      .setFontWeight('bold').setBackground('#b0bec5').setFontColor('#333333').setHorizontalAlignment('center');

    var summaryData = [
      ['1️⃣ Immediate', grandTotals.needToOrder, '#ef9a9a'],
      ['2️⃣ In 2 Weeks', grandTotals.readyForDeliverySizeUp, '#80cbc4'],
      ['3️⃣ In 3 Weeks', grandTotals.inTestingSizeUp, '#ce93d8'],
      ['4️⃣ Consider', grandTotals.sizeUp, '#ffcc80']
    ];

    for (var s = 0; s < summaryData.length; s++) {
      var sRow = summaryStartRow + 1 + s;
      purchaseSheet.getRange(sRow, summaryCol).setValue(summaryData[s][0])
        .setBackground(summaryData[s][2]).setFontColor('#333333').setFontWeight('bold');
      purchaseSheet.getRange(sRow, summaryCol + 1).setValue(summaryData[s][1])
        .setBackground(summaryData[s][2]).setFontColor('#333333').setFontWeight('bold').setHorizontalAlignment('center');
    }

    var totalRow = summaryStartRow + 5;
    var grandTotal = grandTotals.needToOrder + grandTotals.readyForDeliverySizeUp + grandTotals.inTestingSizeUp + grandTotals.sizeUp;
    purchaseSheet.getRange(totalRow, summaryCol).setValue('TOTAL')
      .setBackground('#cfd8dc').setFontColor('#333333').setFontWeight('bold');
    purchaseSheet.getRange(totalRow, summaryCol + 1).setValue(grandTotal)
      .setBackground('#cfd8dc').setFontColor('#333333').setFontWeight('bold').setHorizontalAlignment('center');

    // Column widths
    var widths = [60, 100, 75, 70, 50, 100, 170, 175, 300];
    for (var i = 0; i < widths.length; i++) {
      purchaseSheet.setColumnWidth(i + 1, widths[i]);
    }
    purchaseSheet.setColumnWidth(11, 140);
    purchaseSheet.setColumnWidth(12, 55);
    purchaseSheet.setFrozenRows(2);

    logEvent('Purchase Needs report generated successfully.');
  } catch (e) {
    logEvent('Error in updatePurchaseNeeds: ' + e, 'ERROR');
    throw e;
  }
}

// NOTE: updateInventoryReports() has been moved to 61-InventoryReports.gs
// This version is kept commented out for reference only.
// The new version includes NEW GLOVES and NEW SLEEVES columns with purchased/reclaimed tracking.
/*
function updateInventoryReports_OLD() {
  try {
    logEvent('Updating Inventory Reports...');
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var inventorySheet = ss.getSheetByName('Inventory Reports');
    if (!inventorySheet) {
      inventorySheet = ss.insertSheet('Inventory Reports');
    }
    inventorySheet.clear();

    var glovesSheet = ss.getSheetByName('Gloves');
    var sleevesSheet = ss.getSheetByName('Sleeves');

    if (!glovesSheet || !sleevesSheet) {
      inventorySheet.getRange(1, 1).setValue('Missing Gloves or Sleeves sheet');
      return;
    }

    var now = new Date();
    var timestamp = Utilities.formatDate(now, ss.getSpreadsheetTimeZone(), 'MM/dd/yyyy, h:mm:ss a');

    // Get data
    var glovesData = glovesSheet.getLastRow() > 1 ? glovesSheet.getRange(2, 1, glovesSheet.getLastRow() - 1, 11).getValues() : [];
    var sleevesData = sleevesSheet.getLastRow() > 1 ? sleevesSheet.getRange(2, 1, sleevesSheet.getLastRow() - 1, 11).getValues() : [];

    var totalGloves = glovesData.length;
    var totalSleeves = sleevesData.length;

    var gloveStatusCounts = {};
    var sleeveStatusCounts = {};
    var gloveClassCounts = {};
    var sleeveClassCounts = {};
    var locationCounts = {};

    // Process gloves
    glovesData.forEach(function(row) {
      var status = normalizeStatusForReport(row[6]);
      var itemClass = String(row[2]).trim();
      var location = (row[5] || '').toString().trim();

      gloveStatusCounts[status] = (gloveStatusCounts[status] || 0) + 1;

      if (itemClass === '0' || itemClass === '2' || itemClass === '3') {
        gloveClassCounts[itemClass] = (gloveClassCounts[itemClass] || 0) + 1;
      }

      if (location) {
        if (!locationCounts[location]) locationCounts[location] = { gloves: 0, sleeves: 0 };
        locationCounts[location].gloves++;
      }
    });

    // Process sleeves
    sleevesData.forEach(function(row) {
      var status = normalizeStatusForReport(row[6]);
      var itemClass = String(row[2]).trim();
      var location = (row[5] || '').toString().trim();

      sleeveStatusCounts[status] = (sleeveStatusCounts[status] || 0) + 1;

      if (itemClass === '2' || itemClass === '3') {
        sleeveClassCounts[itemClass] = (sleeveClassCounts[itemClass] || 0) + 1;
      }

      if (location) {
        if (!locationCounts[location]) locationCounts[location] = { gloves: 0, sleeves: 0 };
        locationCounts[location].sleeves++;
      }
    });

    var glovesLost = gloveStatusCounts['Lost'] || 0;
    var glovesFailed = gloveStatusCounts['Failed Rubber'] || 0;
    var sleevesLost = sleeveStatusCounts['Lost'] || 0;
    var sleevesFailed = sleeveStatusCounts['Failed Rubber'] || 0;

    var gloveAssigned = gloveStatusCounts['Assigned'] || 0;
    var sleeveAssigned = sleeveStatusCounts['Assigned'] || 0;
    var gloveMonthlyAvg = (gloveAssigned / 12).toFixed(1);
    var sleeveMonthlyAvg = (sleeveAssigned / 12).toFixed(1);

    var row = 1;

    // Title
    inventorySheet.getRange(row, 1, 1, 6).merge()
      .setValue('INVENTORY DASHBOARD - Generated: ' + timestamp)
      .setFontWeight('bold').setFontSize(14).setBackground('#1565c0').setFontColor('white').setHorizontalAlignment('center');
    inventorySheet.setRowHeight(row, 35);
    row += 2;

    // Summary header row - colorful backgrounds for each column
    var summaryHeaderRange = inventorySheet.getRange(row, 1, 1, 6);
    summaryHeaderRange.setValues([
      ['TOTAL GLOVES', 'TOTAL SLEEVES', 'Glove Avg/Month', 'Sleeve Avg/Month', 'Gloves Lost/Failed', 'Sleeves Lost/Failed']
    ]).setFontWeight('bold').setHorizontalAlignment('center').setFontColor('white');
    inventorySheet.getRange(row, 1).setBackground('#1565c0');
    inventorySheet.getRange(row, 2).setBackground('#2e7d32');
    inventorySheet.getRange(row, 3).setBackground('#0277bd');
    inventorySheet.getRange(row, 4).setBackground('#388e3c');
    inventorySheet.getRange(row, 5).setBackground('#c62828');
    inventorySheet.getRange(row, 6).setBackground('#d32f2f');
    inventorySheet.setRowHeight(row, 30);
    row++;

    // Summary data row - larger font and taller row with colored backgrounds
    var summaryDataRange = inventorySheet.getRange(row, 1, 1, 6);
    summaryDataRange.setValues([
      [totalGloves, totalSleeves, gloveMonthlyAvg, sleeveMonthlyAvg, glovesLost + '/' + glovesFailed, sleevesLost + '/' + sleevesFailed]
    ]).setHorizontalAlignment('center').setFontSize(18).setFontWeight('bold');
    inventorySheet.getRange(row, 1).setBackground('#e3f2fd').setFontColor('#1565c0');
    inventorySheet.getRange(row, 2).setBackground('#e8f5e9').setFontColor('#2e7d32');
    inventorySheet.getRange(row, 3).setBackground('#e1f5fe').setFontColor('#0277bd');
    inventorySheet.getRange(row, 4).setBackground('#c8e6c9').setFontColor('#388e3c');
    inventorySheet.getRange(row, 5).setBackground('#ffebee').setFontColor('#c62828');
    inventorySheet.getRange(row, 6).setBackground('#ffcdd2').setFontColor('#d32f2f');
    inventorySheet.setRowHeight(row, 45);
    row += 2;

    // Gloves by Status
    row = writeStatusTableForInventory(inventorySheet, row, 'GLOVES BY STATUS', gloveStatusCounts, totalGloves);
    row++;

    // Sleeves by Status
    row = writeStatusTableForInventory(inventorySheet, row, 'SLEEVES BY STATUS', sleeveStatusCounts, totalSleeves);
    row++;

    // Inventory by Class
    inventorySheet.getRange(row, 1, 1, 6).merge()
      .setValue('INVENTORY BY CLASS')
      .setFontWeight('bold').setFontSize(12).setBackground('#5c6bc0').setFontColor('white').setHorizontalAlignment('center');
    inventorySheet.setRowHeight(row, 28);
    row++;
    inventorySheet.getRange(row, 1, 1, 6).setValues([
      ['Class', 'Gloves', 'Sleeves', 'Total', 'Glove Avg/Mo', 'Sleeve Avg/Mo']
    ]).setFontWeight('bold').setBackground('#9fa8da').setHorizontalAlignment('center');
    row++;

    var classes = ['0', '2', '3'];
    classes.forEach(function(cls) {
      var gCount = gloveClassCounts[cls] || 0;
      var sCount = sleeveClassCounts[cls] || 0;
      inventorySheet.getRange(row, 1, 1, 6).setValues([
        ['Class ' + cls, gCount, sCount, gCount + sCount, (gCount / 12).toFixed(1), (sCount / 12).toFixed(1)]
      ]).setHorizontalAlignment('center');
      row++;
    });
    row++;

    // Inventory by Location
    inventorySheet.getRange(row, 1, 1, 4).merge()
      .setValue('INVENTORY BY LOCATION')
      .setFontWeight('bold').setFontSize(12).setBackground('#26a69a').setFontColor('white').setHorizontalAlignment('center');
    inventorySheet.setRowHeight(row, 28);
    row++;
    inventorySheet.getRange(row, 1, 1, 4).setValues([
      ['Location', 'Gloves', 'Sleeves', 'Total']
    ]).setFontWeight('bold').setBackground('#80cbc4').setHorizontalAlignment('center');
    row++;

    var locationArr = Object.keys(locationCounts).map(function(loc) {
      return { location: loc, gloves: locationCounts[loc].gloves, sleeves: locationCounts[loc].sleeves };
    });
    locationArr.sort(function(a, b) {
      return (b.gloves + b.sleeves) - (a.gloves + a.sleeves);
    });

    locationArr.forEach(function(loc) {
      inventorySheet.getRange(row, 1, 1, 4).setValues([
        [loc.location, loc.gloves, loc.sleeves, loc.gloves + loc.sleeves]
      ]).setHorizontalAlignment('center');
      row++;
    });
    row++;

    // 12-Month Assignment Averages
    inventorySheet.getRange(row, 1, 1, 5).merge()
      .setValue('12-MONTH ASSIGNMENT AVERAGES (Current Assignments Only)')
      .setFontWeight('bold').setFontSize(12).setBackground('#7e57c2').setFontColor('white').setHorizontalAlignment('center');
    inventorySheet.setRowHeight(row, 28);
    row++;
    inventorySheet.getRange(row, 1, 1, 5).setValues([
      ['Category', 'Assignments (12mo)', 'Monthly Avg', 'Weekly Avg', 'Daily Avg']
    ]).setFontWeight('bold').setBackground('#b39ddb').setHorizontalAlignment('center');
    row++;

    var combinedAssigned = gloveAssigned + sleeveAssigned;
    inventorySheet.getRange(row, 1, 3, 5).setValues([
      ['All Gloves', gloveAssigned, gloveMonthlyAvg, (gloveAssigned / 52).toFixed(1), (gloveAssigned / 365).toFixed(2)],
      ['All Sleeves', sleeveAssigned, sleeveMonthlyAvg, (sleeveAssigned / 52).toFixed(1), (sleeveAssigned / 365).toFixed(2)],
      ['Combined', combinedAssigned, (combinedAssigned / 12).toFixed(1), (combinedAssigned / 52).toFixed(1), (combinedAssigned / 365).toFixed(2)]
    ]).setHorizontalAlignment('center');

    // Column widths
    inventorySheet.setColumnWidth(1, 150);
    inventorySheet.setColumnWidth(2, 100);
    inventorySheet.setColumnWidth(3, 100);
    inventorySheet.setColumnWidth(4, 100);
    inventorySheet.setColumnWidth(5, 100);
    inventorySheet.setColumnWidth(6, 120);

    inventorySheet.setFrozenRows(1);


    logEvent('Inventory Reports updated successfully.');
  } catch (e) {
    logEvent('Error in updateInventoryReports: ' + e, 'ERROR');
    throw e;
  }
}
*/

// NOTE: These helper functions have been moved to 61-InventoryReports.gs
// Keeping them commented out to avoid duplicates
/*
function writeStatusTableForInventory(sheet, startRow, title, statusCounts, total) {
  var row = startRow;

  sheet.getRange(row, 1, 1, 4).merge()
    .setValue(title)
    .setFontWeight('bold').setFontSize(12).setBackground('#b0bec5').setHorizontalAlignment('center');
  row++;

  sheet.getRange(row, 1, 1, 4).setValues([['Status', 'Count', '% of Total', 'Bar']])
    .setFontWeight('bold').setBackground('#cfd8dc').setHorizontalAlignment('center');
  row++;

  var statuses = ['Assigned', 'On Shelf', 'In Testing', 'Ready For Delivery', 'Ready For Test', 'Failed Rubber', 'Lost'];

  statuses.forEach(function(status) {
    var count = statusCounts[status] || 0;
    var pct = total > 0 ? ((count / total) * 100).toFixed(1) + '%' : '0%';
    var barLength = total > 0 ? Math.round((count / total) * 20) : 0;
    var bar = '';
    for (var i = 0; i < barLength; i++) bar += '|';

    sheet.getRange(row, 1, 1, 4).setValues([[status, count, pct, bar]]);
    sheet.getRange(row, 1).setBackground(getStatusColorForReport(status));
    // Set Bar column (column 4) to blue and left-aligned
    sheet.getRange(row, 4).setFontColor('#1565c0').setHorizontalAlignment('left');
    sheet.getRange(row, 2, 1, 2).setHorizontalAlignment('center');
    row++;
  });

  sheet.getRange(row, 1).setValue('TOTAL').setFontWeight('bold');
  sheet.getRange(row, 2).setValue(total).setFontWeight('bold').setHorizontalAlignment('center');
  row++;

  return row;
}

function normalizeStatusForReport(status) {
  if (!status) return 'Unknown';
  var s = status.toString().toLowerCase().trim();

  if (s === 'assigned') return 'Assigned';
  if (s === 'on shelf') return 'On Shelf';
  if (s === 'in testing') return 'In Testing';
  if (s.indexOf('ready for delivery') !== -1) return 'Ready For Delivery';
  if (s.indexOf('ready for test') !== -1) return 'Ready For Test';
  if (s === 'failed rubber') return 'Failed Rubber';
  if (s === 'lost') return 'Lost';

  return status; // Return original if no match
}

function getStatusColorForReport(status) {
  var colors = {
    'Assigned': '#c8e6c9',      // Light green
    'On Shelf': '#bbdefb',      // Light blue
    'In Testing': '#fff9c4',    // Light yellow
    'Ready For Delivery': '#e1bee7', // Light purple
    'Ready For Test': '#b3e5fc',     // Light cyan
    'Failed Rubber': '#ffcdd2', // Light red
    'Lost': '#d7ccc8'           // Light brown
  };
  return colors[status] || '#ffffff';
}
*/

// NOTE: updateGlovesLocationsFromAssignedTo was removed during refactoring (Jan 2026)
// Location updates are now handled by handleInventoryAssignedToChange()

/**
 * Run Reclaims check.
 * Cross-checks assignments for compliance with location rules and updates the Reclaims sheet.
 * This is a wrapper for updateReclaimsSheet() for menu consistency.
 */
function runReclaimsCheck() {
  try {
    logEvent('Running Reclaims check...');
    updateReclaimsSheet();
    logEvent('Reclaims check completed.');
  } catch (e) {
    logEvent('Error in runReclaimsCheck: ' + e, 'ERROR');
    throw e;
  }
}

/**
 * Sets up the Reclaims sheet structure with all required tables.
 * Called by buildSheets to create the initial layout.
 * @param {Sheet} sheet - The Reclaims sheet to set up
 * @param {Object} savedApprovals - Optional object mapping location names to their approval values
 * @param {number} prevEmpCount - Optional number of Previous Employee items to allocate space for
 */
function setupReclaimsSheet(sheet, savedApprovals, prevEmpCount) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var employeesSheet = ss.getSheetByName('Employees');
    savedApprovals = savedApprovals || {};
    prevEmpCount = prevEmpCount || 0;

    // Locations to exclude from Class Location Approvals table (lowercase for comparison)
    var excludeFromApprovalTable = [
      'weeds', 'previous employee', 'lost', 'kalispell gas dock',
      'destroyed', "cody's truck", 'arnett / jm test'
    ];

    // Helper function to normalize apostrophes in a string
    function normalizeApostrophes(str) {
      if (!str) return '';
      // Replace various apostrophe characters with standard apostrophe
      var result = String(str);
      result = result.split('\u2018').join("'");
      result = result.split('\u2019').join("'");
      return result;
    }

    // Helper function to check if location should be excluded (handles apostrophe variants)
    function shouldExcludeLocation(loc) {
      var locLower = normalizeApostrophes(loc.toLowerCase());
      for (var i = 0; i < excludeFromApprovalTable.length; i++) {
        var excludeLoc = normalizeApostrophes(excludeFromApprovalTable[i]);
        if (locLower === excludeLoc) {
          return true;
        }
      }
      return false;
    }

    // Filter out excluded locations from savedApprovals and normalize values
    var filteredApprovals = {};
    for (var locKey in savedApprovals) {
      if (!shouldExcludeLocation(locKey)) {
        // Normalize the approval value to fix HTML-encoded characters
        filteredApprovals[locKey] = normalizeApprovalValue(savedApprovals[locKey]);
      }
    }
    savedApprovals = filteredApprovals;

    // Completely clear the sheet including data validations
    // IMPORTANT: Clear validations BEFORE clearing content to avoid conflicts
    try {
      var maxRows = Math.max(sheet.getMaxRows(), 100);
      var maxCols = Math.max(sheet.getMaxColumns(), 10);
      Logger.log('Clearing data validations for ' + maxRows + ' rows x ' + maxCols + ' cols');
      sheet.getRange(1, 1, maxRows, maxCols).clearDataValidations();

      // Force the operation to complete before continuing
      SpreadsheetApp.flush();
      Logger.log('Data validations cleared successfully');
    } catch (clearErr) {
      Logger.log('[ERROR] Failed to clear data validations: ' + clearErr);
    }

    // Now clear the content
    sheet.clear();

    // Force flush again to ensure clear is complete
    SpreadsheetApp.flush();
    Logger.log('Sheet content cleared');

    var currentRow = 1;

    // Table 1: Previous Employee Reclaims
    sheet.getRange(currentRow, 1, 1, 10).merge()
      .setValue('Previous Employee Reclaims')
      .setFontWeight('bold').setFontSize(14).setBackground('#ffcdd2').setHorizontalAlignment('center');
    currentRow++;

    // Headers for Previous Employee table (10 columns with empty column J for alignment)
    var prevEmpHeaders = ['Item Type', 'Item #', 'Size', 'Class', 'Location', 'Status', 'Assigned To', 'Date Assigned', 'Last Day', ''];
    sheet.getRange(currentRow, 1, 1, prevEmpHeaders.length).setValues([prevEmpHeaders]).setFontWeight('bold').setBackground('#ef9a9a').setHorizontalAlignment('center');
    currentRow++;

    // Leave space for Previous Employee data (dynamic based on actual count)
    // Minimum 1 row for "No items" message, otherwise allocate exact count
    var prevEmpDataRows = Math.max(1, prevEmpCount);
    currentRow += prevEmpDataRows;
    currentRow++; // Add 1 blank row before next table

    // --- Table 2: Class Location Approvals ---
    sheet.getRange(currentRow, 1, 1, 8).merge()
      .setValue('📍 Class Location Approvals')
      .setFontWeight('bold').setFontSize(14).setBackground('#c8e6c9').setHorizontalAlignment('center');
    currentRow++;

    // Headers for Approved Locations table
    sheet.getRange(currentRow, 1, 1, 2).setValues([['Location', 'Approval']])
      .setFontWeight('bold').setBackground('#a5d6a7').setHorizontalAlignment('center');
    currentRow++;

    // Default location approvals
    var defaultApprovals = {
      'Big Sky': 'CL3',
      'Bozeman': 'CL2',
      'Butte': 'CL2',
      'CA Sub': 'CL2',
      'Ennis': 'CL2',
      'Great Falls': 'CL2 & CL3',
      'Helena': 'CL2',
      'Livingston': 'CL2 & CL3',
      'Missoula': 'CL2',
      'Northern Lights': 'CL2',
      'South Dakota Dock': 'CL2',
      'Stanford': 'CL2'
    };

    // Get unique locations from Employees sheet
    if (employeesSheet && employeesSheet.getLastRow() > 1) {
      var employeesData = employeesSheet.getDataRange().getValues();
      var locations = new Set();
      for (var i = 1; i < employeesData.length; i++) {
        var loc = employeesData[i][2]; // Column C (Location)
        if (loc && loc !== 'Location' && loc !== '' && loc !== 'N/A') {
          // Filter out excluded locations using helper function
          if (!shouldExcludeLocation(loc)) {
            locations.add(loc);
          }
        }
      }
      var locationsArr = Array.from(locations).sort();

      if (locationsArr.length > 0) {
        // Check for new locations that don't have a default or saved approval
        var newLocations = [];
        locationsArr.forEach(function(loc) {
          if (!savedApprovals[loc] && !defaultApprovals[loc]) {
            newLocations.push(loc);
          }
        });

        // Prompt user for approval class for new locations
        if (newLocations.length > 0) {
          var ui = SpreadsheetApp.getUi();
          newLocations.forEach(function(newLoc) {
            var response = ui.prompt(
              '🆕 New Location Found: ' + newLoc,
              'Please select the Approved Rubber Class for "' + newLoc + '":\n\n' +
              'Enter one of the following:\n' +
              '• CL2 - Class 2 only\n' +
              '• CL3 - Class 3 only\n' +
              '• CL2 & CL3 - Both Class 2 and Class 3',
              ui.ButtonSet.OK_CANCEL
            );

            if (response.getSelectedButton() === ui.Button.OK) {
              var input = response.getResponseText().trim().toUpperCase();
              // Normalize the input
              if (input === 'CL2' || input === '2' || input === 'CLASS 2') {
                savedApprovals[newLoc] = 'CL2';
              } else if (input === 'CL3' || input === '3' || input === 'CLASS 3') {
                savedApprovals[newLoc] = 'CL3';
              } else if (input === 'CL2 & CL3' || input === 'CL2 AND CL3' || input === 'CL2&CL3' ||
                         input === 'BOTH' || input === '2 & 3' || input === '2&3') {
                savedApprovals[newLoc] = 'CL2 & CL3';
              } else {
                // Default to CL2 if invalid input
                ui.alert('Invalid input "' + input + '" - defaulting to CL2 for ' + newLoc);
                savedApprovals[newLoc] = 'CL2';
              }
            } else {
              // User cancelled - default to CL2
              savedApprovals[newLoc] = 'CL2';
            }
          });
        }

        // Write locations with approval values (priority: savedApprovals > defaultApprovals)
        var locationData = locationsArr.map(function(loc) {
          var approval = savedApprovals[loc] || defaultApprovals[loc] || 'CL2';
          // Normalize one more time to ensure valid value is written
          return [loc, normalizeApprovalValue(approval)];
        });
        sheet.getRange(currentRow, 1, locationData.length, 2).setValues(locationData);

        // Add dropdown validation for Approval column
        var approvalRange = sheet.getRange(currentRow, 2, locationData.length, 1);
        var rule = SpreadsheetApp.newDataValidation()
          .requireValueInList(['None', 'CL2', 'CL3', 'CL2 & CL3'], true)
          .setAllowInvalid(false)
          .build();
        approvalRange.setDataValidation(rule);

        currentRow += locationData.length;
      }
    }
    currentRow += 2;

    // Note: Class 3 Reclaims and Class 2 Reclaims tables are created dynamically
    // in updateReclaimsSheet after data collection to properly size them

    // Auto-resize columns to fit content
    for (var col = 1; col <= 8; col++) {
      sheet.autoResizeColumn(col);
    }

    // Return the current row so updateReclaimsSheet knows where to start
    return currentRow;

  } catch (e) {
    Logger.log('[ERROR] setupReclaimsSheet: ' + e);
  }
}

/**
 * Updates the Reclaims sheet with current data from Gloves and Sleeves tabs.
 * Populates Previous Employee Reclaims, Class 3 Reclaims, and Class 2 Reclaims tables.
 * Includes Auto Pick List for reclaim items (runs AFTER swap pick lists to respect reservations).
 * Preserves Approved Class 3 Locations selections.
 * Called by generateAllReports.
 */
function updateReclaimsSheet() {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var reclaimsSheet = ss.getSheetByName('Reclaims');

    // Locations to ignore for Class 2/3 reclaims checks (lowercase)
    var ignoreLocations = [
      "cody's truck", "destroyed", "kalispell gas dock", "lost",
      "previous employee", "weeds", "arnett / jm test"
    ];

    // Get items already assigned in Glove Swaps and Sleeve Swaps (to respect their priority)
    var swapAssignedItems = getSwapAssignedItems(ss);

    // --- Preserve existing Class Location Approvals selections FIRST ---
    var savedApprovals = {};

    // --- Preserve existing reclaim workflow state (Picked, Date Changed, Stage data) ---
    // Key: employee + itemType + itemNum, Value: full row data including Picked, Date Changed, and all Stage columns
    var savedReclaimState = {};

    if (reclaimsSheet && reclaimsSheet.getLastRow() > 0) {
      var sheetData = reclaimsSheet.getDataRange().getValues();
      var inLocationsTable = false;
      var inReclaimsTable = false;

      for (var i = 0; i < sheetData.length; i++) {
        var cellA = (sheetData[i][0] || '').toString();
        var cellB = (sheetData[i][1] || '').toString().trim();

        if (cellA.indexOf('Class Location Approvals') !== -1 || cellA.indexOf('Approved Class 3 Locations') !== -1) {
          inLocationsTable = true;
          inReclaimsTable = false;
          continue;
        }

        if (cellA.indexOf('Class 3 Reclaims') !== -1 || cellA.indexOf('Class 2 Reclaims') !== -1) {
          inLocationsTable = false;
          inReclaimsTable = true;
          continue;
        }

        // Skip header rows
        if (cellA === 'Employee' || cellA === 'Item Type' || cellA === 'Location') {
          continue;
        }

        if (inLocationsTable && cellA && cellA !== '') {
          var approval = (sheetData[i][1] || '').toString();
          if (approval) {
            // Normalize the approval value to fix HTML-encoded characters
            savedApprovals[cellA] = normalizeApprovalValue(approval);
          }
        }

        // Preserve reclaim workflow state for data rows (has Item Type: Glove or Sleeve)
        if (inReclaimsTable && (cellB === 'Glove' || cellB === 'Sleeve')) {
          var employee = cellA;
          var itemType = cellB;
          var itemNum = String(sheetData[i][2] || '').trim();
          var pickListNum = String(sheetData[i][6] || '').trim();
          var isPicked = sheetData[i][8];  // Column I - Picked checkbox
          var dateChanged = sheetData[i][9];  // Column J - Date Changed

          // Only preserve if there's actual workflow state (picked or has date changed or has stage data)
          // NOTE: We preserve here temporarily - filtering for previous employees happens later
          // after previousEmployeeNames is populated
          if (isPicked === true || dateChanged || pickListNum) {
            var key = employee + '|' + itemType + '|' + itemNum;
            savedReclaimState[key] = {
              employee: employee,
              itemType: itemType,
              itemNum: itemNum,
              pickListNum: pickListNum,
              pickListStatus: sheetData[i][7],  // Column H
              isPicked: isPicked,
              dateChanged: dateChanged,
              // Stage 1 Pick List Item (K-M)
              stage1Status: sheetData[i][10],
              stage1AssignedTo: sheetData[i][11],
              stage1DateAssigned: sheetData[i][12],
              // Stage 1 Old Item (N-P)
              stage1OldStatus: sheetData[i][13],
              stage1OldAssignedTo: sheetData[i][14],
              stage1OldDateAssigned: sheetData[i][15],
              // Stage 2 (Q-T)
              stage2Status: sheetData[i][16],
              stage2PickedFor: sheetData[i][17],
              stage2AssignedTo: sheetData[i][18],
              stage2DateAssigned: sheetData[i][19],
              // Stage 3 (U-W)
              stage3AssignedTo: sheetData[i][20],
              stage3DateAssigned: sheetData[i][21],
              stage3ChangeOutDate: sheetData[i][22],
              // Manual edit indicator (check for blue background)
              isManualEdit: false  // Will check background below
            };

            // Check if Pick List column has manual edit background
            var pickListCell = reclaimsSheet.getRange(i + 1, 7);
            var bgColor = pickListCell.getBackground();
            if (bgColor === '#e3f2fd') {
              savedReclaimState[key].isManualEdit = true;
            }
          }
        }
      }

      Logger.log('Preserved ' + Object.keys(savedApprovals).length + ' location approvals');
      Logger.log('Preserved ' + Object.keys(savedReclaimState).length + ' reclaim workflow states');
    }

    if (!reclaimsSheet) {
      reclaimsSheet = ss.insertSheet('Reclaims');
    }

    var glovesSheet = ss.getSheetByName('Gloves');
    var sleevesSheet = ss.getSheetByName('Sleeves');
    var employeesSheet = ss.getSheetByName('Employees');

    if (!glovesSheet || !sleevesSheet || !employeesSheet) {
      SpreadsheetApp.getUi().alert('Missing required sheet(s): Gloves, Sleeves, or Employees.');
      return;
    }

    // Get inventory data FIRST (needed to count Previous Employee items)
    var glovesData = glovesSheet.getLastRow() > 1 ? glovesSheet.getRange(2, 1, glovesSheet.getLastRow() - 1, 11).getValues() : [];
    var sleevesData = sleevesSheet.getLastRow() > 1 ? sleevesSheet.getRange(2, 1, sleevesSheet.getLastRow() - 1, 11).getValues() : [];

    // Build set of CURRENT active employee names from Employees sheet
    // These should NEVER appear in Previous Employee Reclaims
    var currentActiveEmployees = new Set();
    if (employeesSheet && employeesSheet.getLastRow() > 1) {
      var empSheetData = employeesSheet.getDataRange().getValues();
      // Find Location column dynamically
      var empHeaders = empSheetData[0];
      var empLocationColIdx = 2; // Default
      for (var h = 0; h < empHeaders.length; h++) {
        if (String(empHeaders[h]).toLowerCase().trim() === 'location') {
          empLocationColIdx = h;
          break;
        }
      }

      for (var ei = 1; ei < empSheetData.length; ei++) {
        var empName = (empSheetData[ei][0] || '').toString().trim();
        var empLocation = (empSheetData[ei][empLocationColIdx] || '').toString().trim().toLowerCase();

        // If the employee is on the Employees sheet and their location is NOT "Previous Employee",
        // they are currently active
        if (empName && empLocation !== 'previous employee') {
          currentActiveEmployees.add(empName.toLowerCase());
        }
      }
    }
    Logger.log('Found ' + currentActiveEmployees.size + ' current active employees');

    // Build set of Previous Employee names from Employee History sheet
    // Only include employees who are NOT currently active on the Employees sheet
    var previousEmployeeNames = new Set();
    var previousEmployeeLastDay = {};  // Map of employee name -> Last Day date
    var employeeHistorySheet = ss.getSheetByName('Employee History');
    if (employeeHistorySheet && employeeHistorySheet.getLastRow() > 2) {
      var historyData = employeeHistorySheet.getRange(3, 1, employeeHistorySheet.getLastRow() - 2, 10).getValues();

      // Build a map of employee name -> termination info and rehire info
      // We need to track: Was terminated? When? Was rehired after termination?
      var employeeTerminationInfo = {};

      // First pass: collect ALL termination and rehire events for each employee
      for (var hi = 0; hi < historyData.length; hi++) {
        var histName = (historyData[hi][1] || '').toString().trim();
        var histDate = historyData[hi][0];  // Date column (Column A)
        var histLocation = (historyData[hi][3] || '').toString().trim();  // Column D
        var histEventType = (historyData[hi][2] || '').toString().trim();  // Column C
        var histLastDay = historyData[hi][6];  // Column G - Last Day

        if (!histName) continue;

        var histNameLower = histName.toLowerCase();
        var entryDate = histDate instanceof Date ? histDate : new Date(histDate);
        var eventTypeLower = histEventType.toLowerCase();
        var locationLower = histLocation.toLowerCase();

        // Initialize tracking for this employee if needed
        if (!employeeTerminationInfo[histNameLower]) {
          employeeTerminationInfo[histNameLower] = {
            terminationDates: [],  // All termination dates
            rehireDates: [],       // All rehire dates
            lastDay: null,
            latestTerminationDate: null,
            latestRehireDate: null
          };
        }

        var info = employeeTerminationInfo[histNameLower];

        // Check for termination events
        if (eventTypeLower === 'terminated' || locationLower === 'previous employee') {
          if (entryDate instanceof Date && !isNaN(entryDate)) {
            info.terminationDates.push(entryDate);
            if (!info.latestTerminationDate || entryDate > info.latestTerminationDate) {
              info.latestTerminationDate = entryDate;
              info.lastDay = histLastDay || info.lastDay;
            }
          }
        }

        // Check for rehire events
        if (eventTypeLower === 'rehired') {
          if (entryDate instanceof Date && !isNaN(entryDate)) {
            info.rehireDates.push(entryDate);
            if (!info.latestRehireDate || entryDate > info.latestRehireDate) {
              info.latestRehireDate = entryDate;
            }
          }
        }
      }

      // Second pass: Determine who is currently a previous employee
      // Logic: They are a previous employee if:
      // 1. They have at least one termination event, AND
      // 2. Their most recent termination is AFTER their most recent rehire (or no rehire), AND
      // 3. They are NOT currently active on the Employees sheet
      for (var empNameKey in employeeTerminationInfo) {
        // SKIP if this employee is currently active on the Employees sheet
        // (this is the most reliable indicator - if they're on the sheet, they're active)
        if (currentActiveEmployees.has(empNameKey)) {
          Logger.log('Skipping ' + empNameKey + ' - currently active on Employees sheet');
          continue;
        }

        var info = employeeTerminationInfo[empNameKey];

        // Must have at least one termination
        if (info.terminationDates.length === 0) {
          continue;
        }

        // Check if they were rehired AFTER their latest termination
        var wasRehiredAfterLatestTermination = false;
        if (info.latestRehireDate && info.latestTerminationDate) {
          wasRehiredAfterLatestTermination = info.latestRehireDate >= info.latestTerminationDate;
        }

        if (!wasRehiredAfterLatestTermination) {
          previousEmployeeNames.add(empNameKey);
          // Store the Last Day date for this employee
          previousEmployeeLastDay[empNameKey] = info.lastDay || '';
          Logger.log('Previous employee detected: ' + empNameKey +
                     ' (terminated: ' + info.latestTerminationDate +
                     ', rehired: ' + info.latestRehireDate + ')');
        } else {
          Logger.log('Employee ' + empNameKey + ' was rehired after termination - NOT a previous employee');
        }
      }

      Logger.log('Found ' + previousEmployeeNames.size + ' previous employees from Employee History');

      // Now filter out any preserved reclaim states for previous employees
      // This handles cases where an employee became a previous employee after the reclaim was preserved
      var keysToRemove = [];
      for (var savedKey in savedReclaimState) {
        var savedEmployee = savedReclaimState[savedKey].employee || '';
        if (previousEmployeeNames.has(savedEmployee.toLowerCase())) {
          keysToRemove.push(savedKey);
          Logger.log('Removing preserved reclaim state for previous employee: ' + savedEmployee);
        }
      }
      keysToRemove.forEach(function(key) {
        delete savedReclaimState[key];
      });
      if (keysToRemove.length > 0) {
        Logger.log('Removed ' + keysToRemove.length + ' preserved reclaim states for previous employees');
      }
    }

    // Collect items for each table - do this FIRST to get counts
    var prevEmpItems = [];
    var class3Reclaims = [];
    var class2Reclaims = [];

    // FIRST PASS: Collect Previous Employee items to get accurate count
    glovesData.forEach(function(row) {
      var itemNum = row[0];
      // Skip rows without a valid item number
      if (!itemNum || itemNum === '' || itemNum === null) return;

      var location = (row[5] || '').toString().trim();
      var assignedTo = (row[7] || '').toString().trim();
      var locationLower = location.toLowerCase();
      var assignedToLower = assignedTo.toLowerCase();

      if (locationLower === 'previous employee' || previousEmployeeNames.has(assignedToLower)) {
        if (assignedTo && assignedToLower !== 'on shelf' && assignedToLower !== 'in testing' &&
            assignedToLower !== 'packed for delivery' && assignedToLower !== 'packed for testing') {
          var lastDayValue = previousEmployeeLastDay[assignedToLower] || '';
          prevEmpItems.push(['Glove', row[0], row[1], row[2], location, row[6], assignedTo, row[4], lastDayValue]);
        }
      }
    });

    sleevesData.forEach(function(row) {
      var itemNum = row[0];
      // Skip rows without a valid item number
      if (!itemNum || itemNum === '' || itemNum === null) return;

      var location = (row[5] || '').toString().trim();
      var assignedTo = (row[7] || '').toString().trim();
      var locationLower = location.toLowerCase();
      var assignedToLower = assignedTo.toLowerCase();

      if (locationLower === 'previous employee' || previousEmployeeNames.has(assignedToLower)) {
        if (assignedTo && assignedToLower !== 'on shelf' && assignedToLower !== 'in testing' &&
            assignedToLower !== 'packed for delivery' && assignedToLower !== 'packed for testing') {
          var lastDayValue = previousEmployeeLastDay[assignedToLower] || '';
          prevEmpItems.push(['Sleeve', row[0], row[1], row[2], location, row[6], assignedTo, row[4], lastDayValue]);
        }
      }
    });

    Logger.log('Found ' + prevEmpItems.length + ' Previous Employee items');

    // Re-setup the sheet structure, passing savedApprovals AND prevEmpCount to allocate correct space
    setupReclaimsSheet(reclaimsSheet, savedApprovals, prevEmpItems.length);

    // Re-read the sheet to find table positions and get current approvals
    var newSheetData = reclaimsSheet.getDataRange().getValues();

    // Build location approval map from the rebuilt sheet
    var locationApprovals = {};
    var inLocTable = false;
    for (var r = 0; r < newSheetData.length; r++) {
      var cellVal = (newSheetData[r][0] || '').toString();

      if (cellVal.indexOf('Class Location Approvals') !== -1 || cellVal.indexOf('Approved Class 3 Locations') !== -1) {
        inLocTable = true;
        continue;
      }
      if (inLocTable && (!cellVal || cellVal === '')) {
        inLocTable = false;
        continue;
      }

      if (inLocTable && cellVal && cellVal !== 'Location') {
        var approvalVal = (newSheetData[r][1] || '').toString().trim();
        if (approvalVal) {
          locationApprovals[cellVal] = approvalVal;
        }
      }
    }


    // Get employee data for preferred sizes
    var employeeMap = {};
    if (employeesSheet && employeesSheet.getLastRow() > 1) {
      var empData = employeesSheet.getDataRange().getValues();
      var empHeaders = empData[0];
      var gloveSizeColIdx = 8;  // Column I
      var sleeveSizeColIdx = 9;  // Column J

      // Find size columns dynamically
      for (var h = 0; h < empHeaders.length; h++) {
        var header = String(empHeaders[h]).toLowerCase().trim();
        if (header === 'glove size') gloveSizeColIdx = h;
        if (header === 'sleeve size') sleeveSizeColIdx = h;
      }

      for (var e = 1; e < empData.length; e++) {
        var empName = (empData[e][0] || '').toString().trim().toLowerCase();
        if (empName) {
          employeeMap[empName] = {
            gloveSize: empData[e][gloveSizeColIdx],
            sleeveSize: empData[e][sleeveSizeColIdx]
          };
        }
      }
    }

    // Process Gloves for Class 2/3 reclaims (Previous Employee items already collected above)
    glovesData.forEach(function(row) {
      var itemNum = row[0];
      var size = row[1];
      var itemClass = row[2];
      var dateAssigned = row[4];
      var location = (row[5] || '').toString().trim();
      var status = (row[6] || '').toString().trim();
      var assignedTo = (row[7] || '').toString().trim();
      var locationLower = location.toLowerCase();
      var assignedToLower = assignedTo.toLowerCase();

      // Skip Previous Employee items - already collected above
      if (locationLower === 'previous employee' || previousEmployeeNames.has(assignedToLower)) {
        return;
      }

      // Skip non-assigned items and ignored locations for Class reclaims
      var skipStatuses = ['on shelf', 'failed rubber', 'lost', 'ready for test', 'ready for testing',
                          'packed for testing', 'packed for delivery', 'in testing', 'ready for delivery'];
      if (skipStatuses.indexOf(status.toLowerCase()) !== -1) {
        return;
      }

      if (ignoreLocations.indexOf(locationLower) !== -1) {
        return;
      }

      var approvalStatus = locationApprovals[location] || '';
      var itemClassNum = parseInt(itemClass, 10) || 0;

      // Get employee's preferred glove size
      var empKey = assignedToLower;
      var preferredSize = employeeMap[empKey] ? employeeMap[empKey].gloveSize : size;

      if (approvalStatus === 'None') {
        if (itemClassNum === 3) {
          class3Reclaims.push({
            employee: assignedTo, itemType: 'Glove', itemNum: itemNum, size: size,
            itemClass: itemClass, location: location, assignedTo: assignedTo,
            preferredSize: preferredSize, classNum: itemClassNum
          });
        }
        if (itemClassNum === 2) {
          class2Reclaims.push({
            employee: assignedTo, itemType: 'Glove', itemNum: itemNum, size: size,
            itemClass: itemClass, location: location, assignedTo: assignedTo,
            preferredSize: preferredSize, classNum: itemClassNum
          });
        }
        return;
      }

      if (itemClassNum === 3) {
        if (approvalStatus === '' || approvalStatus === 'CL2') {
          class3Reclaims.push({
            employee: assignedTo, itemType: 'Glove', itemNum: itemNum, size: size,
            itemClass: itemClass, location: location, assignedTo: assignedTo,
            preferredSize: preferredSize, classNum: itemClassNum
          });
        }
      }

      if (itemClassNum === 2) {
        if (approvalStatus === 'CL3') {
          class2Reclaims.push({
            employee: assignedTo, itemType: 'Glove', itemNum: itemNum, size: size,
            itemClass: itemClass, location: location, assignedTo: assignedTo,
            preferredSize: preferredSize, classNum: itemClassNum
          });
        }
      }
    });

    // Process Sleeves for Class 2/3 reclaims (Previous Employee items already collected above)
    sleevesData.forEach(function(row) {
      var itemNum = row[0];
      var size = row[1];
      var itemClass = row[2];
      var dateAssigned = row[4];
      var location = (row[5] || '').toString().trim();
      var status = (row[6] || '').toString().trim();
      var assignedTo = (row[7] || '').toString().trim();
      var locationLower = location.toLowerCase();
      var assignedToLower = assignedTo.toLowerCase();

      // Skip Previous Employee items - already collected above
      if (locationLower === 'previous employee' || previousEmployeeNames.has(assignedToLower)) {
        return;
      }

      var skipStatuses = ['on shelf', 'failed rubber', 'lost', 'ready for test',
                          'packed for testing', 'packed for delivery', 'in testing', 'ready for delivery'];
      if (skipStatuses.indexOf(status.toLowerCase()) !== -1) {
        return;
      }

      if (ignoreLocations.indexOf(locationLower) !== -1) {
        return;
      }

      var approvalStatus = locationApprovals[location] || '';
      var itemClassNum = parseInt(itemClass, 10) || 0;

      var empKey = assignedToLower;
      var preferredSize = employeeMap[empKey] ? employeeMap[empKey].sleeveSize : size;

      if (approvalStatus === 'None') {
        if (itemClassNum === 3) {
          class3Reclaims.push({
            employee: assignedTo, itemType: 'Sleeve', itemNum: itemNum, size: size,
            itemClass: itemClass, location: location, assignedTo: assignedTo,
            preferredSize: preferredSize, classNum: itemClassNum
          });
        }
        if (itemClassNum === 2) {
          class2Reclaims.push({
            employee: assignedTo, itemType: 'Sleeve', itemNum: itemNum, size: size,
            itemClass: itemClass, location: location, assignedTo: assignedTo,
            preferredSize: preferredSize, classNum: itemClassNum
          });
        }
        return;
      }

      if (itemClassNum === 3) {
        if (approvalStatus === '' || approvalStatus === 'CL2') {
          class3Reclaims.push({
            employee: assignedTo, itemType: 'Sleeve', itemNum: itemNum, size: size,
            itemClass: itemClass, location: location, assignedTo: assignedTo,
            preferredSize: preferredSize, classNum: itemClassNum
          });
        }
      }

      if (itemClassNum === 2) {
        if (approvalStatus === 'CL3') {
          class2Reclaims.push({
            employee: assignedTo, itemType: 'Sleeve', itemNum: itemNum, size: size,
            itemClass: itemClass, location: location, assignedTo: assignedTo,
            preferredSize: preferredSize, classNum: itemClassNum
          });
        }
      }
    });

    // Filter out reclaims for employees who are now Previous Employees
    // This handles cases where an employee became a previous employee after the reclaim was created
    class3Reclaims = class3Reclaims.filter(function(reclaim) {
      var empLower = (reclaim.employee || '').toLowerCase();
      if (previousEmployeeNames.has(empLower)) {
        Logger.log('Filtered out Class 3 reclaim for previous employee: ' + reclaim.employee);
        return false;
      }
      return true;
    });

    class2Reclaims = class2Reclaims.filter(function(reclaim) {
      var empLower = (reclaim.employee || '').toLowerCase();
      if (previousEmployeeNames.has(empLower)) {
        Logger.log('Filtered out Class 2 reclaim for previous employee: ' + reclaim.employee);
        return false;
      }
      return true;
    });

    // Sort reclaims by location, then by employee name (for weekly planning)
    class3Reclaims.sort(function(a, b) {
      var locCompare = (a.location || '').localeCompare(b.location || '');
      if (locCompare !== 0) return locCompare;
      return (a.employee || '').localeCompare(b.employee || '');
    });
    class2Reclaims.sort(function(a, b) {
      var locCompare = (a.location || '').localeCompare(b.location || '');
      if (locCompare !== 0) return locCompare;
      return (a.employee || '').localeCompare(b.employee || '');
    });

    // Generate Pick List for reclaims (respects swap assignments)
    var reclaimAssignedItems = new Set(swapAssignedItems);  // Start with swap-assigned items

    // Process Class 3 reclaims for Pick List (need DOWNGRADE to Class 2)
    class3Reclaims.forEach(function(reclaim) {
      var inventoryToSearch = reclaim.itemType === 'Glove' ? glovesData : sleevesData;

      // Check if there's a preserved pick list item for this reclaim
      var key = reclaim.employee + '|' + reclaim.itemType + '|' + reclaim.itemNum;
      var savedState = savedReclaimState[key];

      if (savedState && savedState.pickListNum && savedState.pickListNum !== '—' && savedState.pickListNum !== '') {
        // Use the preserved pick list item instead of finding a new one
        reclaim.pickListNum = savedState.pickListNum;
        reclaim.pickListStatus = savedState.pickListStatus || 'Ready For Delivery 🚚';
        reclaim.preservedState = savedState;  // Store for later restoration

        // Look up the preserved pick list item in inventory to get current data
        var preservedItemData = inventoryToSearch.find(function(item) {
          return String(item[0]).trim() === String(savedState.pickListNum).trim();
        });
        reclaim.pickListInvData = preservedItemData || null;

        // Add to assigned items to prevent duplicates
        reclaimAssignedItems.add(savedState.pickListNum);
        Logger.log('Preserved pick list item ' + savedState.pickListNum + ' for reclaim ' + key);
      } else {
        // No preserved state - find a new pick list item
        var pickResult = findReclaimPickListItem(
          inventoryToSearch, reclaim, reclaimAssignedItems, 'class3', inventoryToSearch
        );
        reclaim.pickListNum = pickResult.itemNum;
        reclaim.pickListStatus = pickResult.status;
        reclaim.pickListInvData = pickResult.inventoryData;

        if (pickResult.itemNum !== '—') {
          reclaimAssignedItems.add(pickResult.itemNum);
        }
      }

      // Look up the old item (the one being reclaimed) to get its Date Assigned
      var oldItemNum = String(reclaim.itemNum).trim();
      var oldItemData = inventoryToSearch.find(function(item) {
        return String(item[0]).trim() === oldItemNum;
      });
      reclaim.oldItemDateAssigned = oldItemData ? (oldItemData[4] || '') : '';  // Column E = Date Assigned
    });

    // Process Class 2 reclaims for Pick List (need UPGRADE to Class 3)
    class2Reclaims.forEach(function(reclaim) {
      var inventoryToSearch = reclaim.itemType === 'Glove' ? glovesData : sleevesData;

      // Check if there's a preserved pick list item for this reclaim
      var key = reclaim.employee + '|' + reclaim.itemType + '|' + reclaim.itemNum;
      var savedState = savedReclaimState[key];

      if (savedState && savedState.pickListNum && savedState.pickListNum !== '—' && savedState.pickListNum !== '') {
        // Use the preserved pick list item instead of finding a new one
        reclaim.pickListNum = savedState.pickListNum;
        reclaim.pickListStatus = savedState.pickListStatus || 'Ready For Delivery 🚚';
        reclaim.preservedState = savedState;  // Store for later restoration

        // Look up the preserved pick list item in inventory to get current data
        var preservedItemData = inventoryToSearch.find(function(item) {
          return String(item[0]).trim() === String(savedState.pickListNum).trim();
        });
        reclaim.pickListInvData = preservedItemData || null;

        // Add to assigned items to prevent duplicates
        reclaimAssignedItems.add(savedState.pickListNum);
        Logger.log('Preserved pick list item ' + savedState.pickListNum + ' for reclaim ' + key);
      } else {
        // No preserved state - find a new pick list item
        var pickResult = findReclaimPickListItem(
          inventoryToSearch, reclaim, reclaimAssignedItems, 'class2', inventoryToSearch
        );
        reclaim.pickListNum = pickResult.itemNum;
        reclaim.pickListStatus = pickResult.status;
        reclaim.pickListInvData = pickResult.inventoryData;

        if (pickResult.itemNum !== '—') {
          reclaimAssignedItems.add(pickResult.itemNum);
        }
      }

      // Look up the old item (the one being reclaimed) to get its Date Assigned
      var oldItemNum = String(reclaim.itemNum).trim();
      var oldItemData = inventoryToSearch.find(function(item) {
        return String(item[0]).trim() === oldItemNum;
      });
      reclaim.oldItemDateAssigned = oldItemData ? (oldItemData[4] || '') : '';  // Column E = Date Assigned
    });

    // Write Previous Employee data (row 3 = after title and headers)
    if (prevEmpItems.length > 0) {
      // Add empty column J to each row for alignment
      var prevEmpItemsWithCol = prevEmpItems.map(function(row) {
        return row.concat(['']);  // Add empty column J
      });

      // Clear any data validation on these rows first (in case of overlap with previous structure)
      var prevEmpRange = reclaimsSheet.getRange(3, 1, prevEmpItemsWithCol.length, 10);
      prevEmpRange.clearDataValidations();
      prevEmpRange.setValues(prevEmpItemsWithCol);
    }

    // Find where to start Class 3 table (after Approved Locations table)
    var sheetLastRow = reclaimsSheet.getLastRow();
    var currentRow = sheetLastRow + 2;

    // --- Create Class 3 Reclaims Table ---
    var reclaimsHeaders = ['Employee', 'Item Type', 'Item #', 'Size', 'Class', 'Location', 'Pick List Item #', 'Pick List Status', 'Picked', 'Date Changed'];
    var hiddenHeaders = ['Status', 'Assigned To', 'Date Assigned', 'Status', 'Assigned To', 'Date Assigned', 'Status', 'Assigned To', 'Date Assigned', 'Picked For', 'Assigned To', 'Date Assigned', 'Change Out Date'];

    reclaimsSheet.getRange(currentRow, 1, 1, 23).merge()
      .setValue('⚠️ Class 3 Reclaims - Need Downgrade to Class 2')
      .setFontWeight('bold').setFontSize(14).setBackground('#bbdefb').setHorizontalAlignment('center');
    currentRow++;

    // Add STAGE headers
    reclaimsSheet.getRange(currentRow, 11, 1, 3).merge().setValue('STAGE 1').setBackground('#e0e0e0').setFontWeight('bold').setHorizontalAlignment('center');
    reclaimsSheet.getRange(currentRow, 14, 1, 3).merge().setValue('STAGE 1').setBackground('#e0e0e0').setFontWeight('bold').setHorizontalAlignment('center');
    reclaimsSheet.getRange(currentRow, 17, 1, 4).merge().setValue('STAGE 2').setBackground('#e0e0e0').setFontWeight('bold').setHorizontalAlignment('center');
    reclaimsSheet.getRange(currentRow, 21, 1, 3).merge().setValue('STAGE 3').setBackground('#e0e0e0').setFontWeight('bold').setHorizontalAlignment('center');
    currentRow++;

    // Add stage descriptions
    reclaimsSheet.getRange(currentRow, 11, 1, 3).merge().setValue('Pick List Item Before Check').setBackground('#bdbdbd').setFontWeight('bold').setHorizontalAlignment('center').setFontSize(9);
    reclaimsSheet.getRange(currentRow, 14, 1, 3).merge().setValue('Old Item Assignment').setBackground('#bdbdbd').setFontWeight('bold').setHorizontalAlignment('center').setFontSize(9);
    reclaimsSheet.getRange(currentRow, 17, 1, 4).merge().setValue('Pick List Item After Check').setBackground('#bdbdbd').setFontWeight('bold').setHorizontalAlignment('center').setFontSize(9);
    reclaimsSheet.getRange(currentRow, 21, 1, 3).merge().setValue('Pick List Item New Assignment').setBackground('#bdbdbd').setFontWeight('bold').setHorizontalAlignment('center').setFontSize(9);
    currentRow++;

    var allHeaders = reclaimsHeaders.concat(hiddenHeaders);
    reclaimsSheet.getRange(currentRow, 1, 1, allHeaders.length).setValues([allHeaders]);
    reclaimsSheet.getRange(currentRow, 1, 1, 10).setFontWeight('bold').setBackground('#90caf9').setHorizontalAlignment('center');
    reclaimsSheet.getRange(currentRow, 11, 1, 13).setFontWeight('bold').setBackground('#9e9e9e').setFontColor('#ffffff').setHorizontalAlignment('center').setFontSize(9);
    currentRow++;

    if (class3Reclaims.length > 0) {
      var class3Data = class3Reclaims.map(function(r) {
        // Check if this reclaim has preserved state
        var preserved = r.preservedState;

        // If there's a pick list item, populate Stage 1 columns from inventory data or preserved state
        var hasPickListItem = r.pickListNum && r.pickListNum !== '—';
        var invData = r.pickListInvData;

        // Use preserved Stage 1 data if available, otherwise get from current inventory
        var pickListStatus, pickListAssignedTo, pickListDateAssigned;
        var oldItemStatus, oldItemAssignedTo, oldItemDateAssigned;
        var stage2Status, stage2PickedFor, stage2AssignedTo, stage2DateAssigned;
        var stage3AssignedTo, stage3DateAssigned, stage3ChangeOutDate;
        var isPicked, dateChanged;

        if (preserved) {
          // Use preserved data
          pickListStatus = preserved.stage1Status || '';
          pickListAssignedTo = preserved.stage1AssignedTo || '';
          pickListDateAssigned = preserved.stage1DateAssigned || '';
          oldItemStatus = preserved.stage1OldStatus || 'Assigned';
          oldItemAssignedTo = preserved.stage1OldAssignedTo || r.employee;
          oldItemDateAssigned = preserved.stage1OldDateAssigned || r.oldItemDateAssigned || '';
          stage2Status = preserved.stage2Status || '';
          stage2PickedFor = preserved.stage2PickedFor || '';
          stage2AssignedTo = preserved.stage2AssignedTo || '';
          stage2DateAssigned = preserved.stage2DateAssigned || '';
          stage3AssignedTo = preserved.stage3AssignedTo || '';
          stage3DateAssigned = preserved.stage3DateAssigned || '';
          stage3ChangeOutDate = preserved.stage3ChangeOutDate || '';
          isPicked = preserved.isPicked === true;
          dateChanged = preserved.dateChanged || '';
        } else {
          // Get from current inventory
          pickListStatus = hasPickListItem && invData ? (invData[6] || 'On Shelf') : '';
          pickListAssignedTo = hasPickListItem && invData ? (invData[7] || 'On Shelf') : '';
          pickListDateAssigned = hasPickListItem && invData ? (invData[4] || '') : '';
          oldItemStatus = 'Assigned';
          oldItemAssignedTo = r.employee;
          oldItemDateAssigned = r.oldItemDateAssigned || '';
          stage2Status = '';
          stage2PickedFor = '';
          stage2AssignedTo = '';
          stage2DateAssigned = '';
          stage3AssignedTo = '';
          stage3DateAssigned = '';
          stage3ChangeOutDate = '';
          isPicked = false;
          dateChanged = '';
        }

        return [
          r.employee, r.itemType, r.itemNum, r.size, r.itemClass, r.location,
          r.pickListNum || '—', r.pickListStatus || 'Need to Purchase ❌',
          isPicked, dateChanged,
          // Stage 1 - Pick List Item Before Check (K-M)
          pickListStatus, pickListAssignedTo, pickListDateAssigned,
          // Stage 1 - Old Item Assignment (N-P)
          oldItemStatus, oldItemAssignedTo, oldItemDateAssigned,
          // Stage 2 (Q-T)
          stage2Status, stage2PickedFor, stage2AssignedTo, stage2DateAssigned,
          // Stage 3 (U-W)
          stage3AssignedTo, stage3DateAssigned, stage3ChangeOutDate
        ];
      });
      var class3StartRow = currentRow;
      reclaimsSheet.getRange(currentRow, 1, class3Data.length, 23).setValues(class3Data);
      reclaimsSheet.getRange(currentRow, 1, class3Data.length, 10).setHorizontalAlignment('center');

      // Insert checkboxes in Picked column (I)
      reclaimsSheet.getRange(currentRow, 9, class3Data.length, 1).insertCheckboxes();

      // Hide columns K-W (STAGE data)
      reclaimsSheet.hideColumns(11, 13);

      // Apply conditional formatting to Pick List Status column
      for (var ci = 0; ci < class3Data.length; ci++) {
        var statusCell = reclaimsSheet.getRange(currentRow + ci, 8);
        var statusVal = class3Data[ci][7];
        if (statusVal.indexOf('Reclaim Only') !== -1) {
          statusCell.setBackground('#c8e6c9');  // Green for reclaim only
        } else if (statusVal.indexOf('In Stock') !== -1) {
          statusCell.setBackground('#c8e6c9');
        } else if (statusVal.indexOf('Need to Purchase') !== -1) {
          statusCell.setBackground('#ffcdd2');
        } else if (statusVal.indexOf('Ready For Delivery') !== -1) {
          statusCell.setBackground('#e1bee7');
        } else if (statusVal.indexOf('In Testing') !== -1) {
          statusCell.setBackground('#fff9c4');
        }
      }

      // Restore preserved workflow state for Class 3 reclaims
      restoreReclaimWorkflowState(reclaimsSheet, class3Reclaims, class3StartRow, savedReclaimState);

      currentRow += class3Data.length;
    } else {
      reclaimsSheet.getRange(currentRow, 1, 1, 23).merge()
        .setValue('✅ No Class 3 reclaims needed')
        .setFontStyle('italic').setHorizontalAlignment('center').setBackground('#c8e6c9');
      currentRow++;
    }

    currentRow += 2;

    // --- Create Class 2 Reclaims Table ---
    reclaimsSheet.getRange(currentRow, 1, 1, 23).merge()
      .setValue('⚠️ Class 2 Reclaims - Need Upgrade to Class 3')
      .setFontWeight('bold').setFontSize(14).setBackground('#ffe0b2').setHorizontalAlignment('center');
    currentRow++;

    // Add STAGE headers
    reclaimsSheet.getRange(currentRow, 11, 1, 3).merge().setValue('STAGE 1').setBackground('#e0e0e0').setFontWeight('bold').setHorizontalAlignment('center');
    reclaimsSheet.getRange(currentRow, 14, 1, 3).merge().setValue('STAGE 1').setBackground('#e0e0e0').setFontWeight('bold').setHorizontalAlignment('center');
    reclaimsSheet.getRange(currentRow, 17, 1, 4).merge().setValue('STAGE 2').setBackground('#e0e0e0').setFontWeight('bold').setHorizontalAlignment('center');
    reclaimsSheet.getRange(currentRow, 21, 1, 3).merge().setValue('STAGE 3').setBackground('#e0e0e0').setFontWeight('bold').setHorizontalAlignment('center');
    currentRow++;

    // Add stage descriptions
    reclaimsSheet.getRange(currentRow, 11, 1, 3).merge().setValue('Pick List Item Before Check').setBackground('#bdbdbd').setFontWeight('bold').setHorizontalAlignment('center').setFontSize(9);
    reclaimsSheet.getRange(currentRow, 14, 1, 3).merge().setValue('Old Item Assignment').setBackground('#bdbdbd').setFontWeight('bold').setHorizontalAlignment('center').setFontSize(9);
    reclaimsSheet.getRange(currentRow, 17, 1, 4).merge().setValue('Pick List Item After Check').setBackground('#bdbdbd').setFontWeight('bold').setHorizontalAlignment('center').setFontSize(9);
    reclaimsSheet.getRange(currentRow, 21, 1, 3).merge().setValue('Pick List Item New Assignment').setBackground('#bdbdbd').setFontWeight('bold').setHorizontalAlignment('center').setFontSize(9);
    currentRow++;

    reclaimsSheet.getRange(currentRow, 1, 1, allHeaders.length).setValues([allHeaders]);
    reclaimsSheet.getRange(currentRow, 1, 1, 10).setFontWeight('bold').setBackground('#ffcc80').setHorizontalAlignment('center');
    reclaimsSheet.getRange(currentRow, 11, 1, 13).setFontWeight('bold').setBackground('#9e9e9e').setFontColor('#ffffff').setHorizontalAlignment('center').setFontSize(9);
    currentRow++;

    if (class2Reclaims.length > 0) {
      var class2Data = class2Reclaims.map(function(r) {
        // Check if this reclaim has preserved state
        var preserved = r.preservedState;

        // If there's a pick list item, populate Stage 1 columns from inventory data or preserved state
        var hasPickListItem = r.pickListNum && r.pickListNum !== '—';
        var invData = r.pickListInvData;

        // Use preserved Stage 1 data if available, otherwise get from current inventory
        var pickListStatus, pickListAssignedTo, pickListDateAssigned;
        var oldItemStatus, oldItemAssignedTo, oldItemDateAssigned;
        var stage2Status, stage2PickedFor, stage2AssignedTo, stage2DateAssigned;
        var stage3AssignedTo, stage3DateAssigned, stage3ChangeOutDate;
        var isPicked, dateChanged;

        if (preserved) {
          // Use preserved data
          pickListStatus = preserved.stage1Status || '';
          pickListAssignedTo = preserved.stage1AssignedTo || '';
          pickListDateAssigned = preserved.stage1DateAssigned || '';
          oldItemStatus = preserved.stage1OldStatus || 'Assigned';
          oldItemAssignedTo = preserved.stage1OldAssignedTo || r.employee;
          oldItemDateAssigned = preserved.stage1OldDateAssigned || r.oldItemDateAssigned || '';
          stage2Status = preserved.stage2Status || '';
          stage2PickedFor = preserved.stage2PickedFor || '';
          stage2AssignedTo = preserved.stage2AssignedTo || '';
          stage2DateAssigned = preserved.stage2DateAssigned || '';
          stage3AssignedTo = preserved.stage3AssignedTo || '';
          stage3DateAssigned = preserved.stage3DateAssigned || '';
          stage3ChangeOutDate = preserved.stage3ChangeOutDate || '';
          isPicked = preserved.isPicked === true;
          dateChanged = preserved.dateChanged || '';
        } else {
          // Get from current inventory
          pickListStatus = hasPickListItem && invData ? (invData[6] || 'On Shelf') : '';
          pickListAssignedTo = hasPickListItem && invData ? (invData[7] || 'On Shelf') : '';
          pickListDateAssigned = hasPickListItem && invData ? (invData[4] || '') : '';
          oldItemStatus = 'Assigned';
          oldItemAssignedTo = r.employee;
          oldItemDateAssigned = r.oldItemDateAssigned || '';
          stage2Status = '';
          stage2PickedFor = '';
          stage2AssignedTo = '';
          stage2DateAssigned = '';
          stage3AssignedTo = '';
          stage3DateAssigned = '';
          stage3ChangeOutDate = '';
          isPicked = false;
          dateChanged = '';
        }

        return [
          r.employee, r.itemType, r.itemNum, r.size, r.itemClass, r.location,
          r.pickListNum || '—', r.pickListStatus || 'Need to Purchase ❌',
          isPicked, dateChanged,
          // Stage 1 - Pick List Item Before Check (K-M)
          pickListStatus, pickListAssignedTo, pickListDateAssigned,
          // Stage 1 - Old Item Assignment (N-P)
          oldItemStatus, oldItemAssignedTo, oldItemDateAssigned,
          // Stage 2 (Q-T)
          stage2Status, stage2PickedFor, stage2AssignedTo, stage2DateAssigned,
          // Stage 3 (U-W)
          stage3AssignedTo, stage3DateAssigned, stage3ChangeOutDate
        ];
      });
      var class2StartRow = currentRow;
      reclaimsSheet.getRange(currentRow, 1, class2Data.length, 23).setValues(class2Data);
      reclaimsSheet.getRange(currentRow, 1, class2Data.length, 10).setHorizontalAlignment('center');

      // Insert checkboxes in Picked column (I)
      reclaimsSheet.getRange(currentRow, 9, class2Data.length, 1).insertCheckboxes();

      // Hide columns K-W (STAGE data)
      reclaimsSheet.hideColumns(11, 13);

      // Apply conditional formatting to Pick List Status column
      for (var cj = 0; cj < class2Data.length; cj++) {
        var statusCell2 = reclaimsSheet.getRange(currentRow + cj, 8);
        var statusVal2 = class2Data[cj][7];
        if (statusVal2.indexOf('Reclaim Only') !== -1) {
          statusCell2.setBackground('#c8e6c9');
        } else if (statusVal2.indexOf('In Stock') !== -1) {
          statusCell2.setBackground('#c8e6c9');
        } else if (statusVal2.indexOf('Need to Purchase') !== -1) {
          statusCell2.setBackground('#ffcdd2');
        } else if (statusVal2.indexOf('Ready For Delivery') !== -1) {
          statusCell2.setBackground('#e1bee7');
        } else if (statusVal2.indexOf('In Testing') !== -1) {
          statusCell2.setBackground('#fff9c4');
        }
      }

      // Restore preserved workflow state for Class 2 reclaims
      restoreReclaimWorkflowState(reclaimsSheet, class2Reclaims, class2StartRow, savedReclaimState);

      currentRow += class2Data.length;
    } else {
      reclaimsSheet.getRange(currentRow, 1, 1, 23).merge()
        .setValue('✅ No Class 2 reclaims needed')
        .setFontStyle('italic').setHorizontalAlignment('center').setBackground('#c8e6c9');
      currentRow++;
    }

    currentRow += 2;

    // --- Create Lost Items - Need to Locate Table ---
    var lostItems = [];

    function hasLostLocateMarker(notesValue) {
      if (!notesValue) return false;
      var notes = notesValue.toString().trim().toUpperCase();
      return notes.indexOf('LOST-LOCATE') !== -1 ||
             notes.indexOf('LOST LOCATE') !== -1 ||
             notes === 'LOCATE';
    }

    // Scan Gloves
    glovesData.forEach(function(row) {
      var notes = row[10];  // Column K - Notes
      if (hasLostLocateMarker(notes)) {
        lostItems.push(['Glove', row[0], row[1], row[2], row[5], row[7], row[4], row[10]]);
      }
    });

    // Scan Sleeves
    sleevesData.forEach(function(row) {
      var notes = row[10];
      if (hasLostLocateMarker(notes)) {
        lostItems.push(['Sleeve', row[0], row[1], row[2], row[5], row[7], row[4], row[10]]);
      }
    });

    // Write Lost Items table
    reclaimsSheet.getRange(currentRow, 1, 1, 8).merge()
      .setValue('🔍 Lost Items - Need to Locate')
      .setFontWeight('bold').setFontSize(14).setBackground('#ffccbc').setHorizontalAlignment('center');
    currentRow++;

    var lostItemsHeaders = ['Item Type', 'Item #', 'Size', 'Class', 'Last Location', 'Last Assigned To', 'Date Assigned', 'Notes'];
    reclaimsSheet.getRange(currentRow, 1, 1, lostItemsHeaders.length).setValues([lostItemsHeaders])
      .setFontWeight('bold').setBackground('#ffab91').setHorizontalAlignment('center');
    currentRow++;

    if (lostItems.length > 0) {
      reclaimsSheet.getRange(currentRow, 1, lostItems.length, 8).setValues(lostItems);
      reclaimsSheet.getRange(currentRow, 1, lostItems.length, 8).setBackground('#fff3e0');
    } else {
      reclaimsSheet.getRange(currentRow, 1, 1, 8).merge()
        .setValue('✅ No items marked as LOST-LOCATE')
        .setFontStyle('italic').setHorizontalAlignment('center').setBackground('#c8e6c9');
    }

    // Auto-resize columns to fit content
    for (var col = 1; col <= 8; col++) {
      reclaimsSheet.autoResizeColumn(col);
    }

    // ===== CHECK FOR PICK LIST ITEMS MARKED FOR PREVIOUS EMPLOYEES =====
    // Find items that are "Ready For Delivery" or "Packed For Delivery" with Picked For containing a previous employee name
    var previousEmployeePickListItems = [];

    // Check Gloves
    glovesData.forEach(function(row) {
      var status = (row[6] || '').toString().trim().toLowerCase();
      var pickedFor = (row[9] || '').toString().trim();  // Column J - Picked For

      if ((status === 'ready for delivery' || status === 'packed for delivery') && pickedFor) {
        // Check if picked for a previous employee
        for (var empName in previousEmployeeLastDay) {
          if (pickedFor.toLowerCase().indexOf(empName.toLowerCase()) !== -1) {
            previousEmployeePickListItems.push({
              itemType: 'Glove',
              itemNum: row[0],
              size: row[1],
              itemClass: row[2],
              status: row[6],
              pickedFor: pickedFor,
              previousEmployee: empName
            });
            break;
          }
        }
        // Also check the previousEmployeeNames Set
        previousEmployeeNames.forEach(function(empNameLower) {
          if (pickedFor.toLowerCase().indexOf(empNameLower) !== -1) {
            // Check if already added
            var alreadyAdded = previousEmployeePickListItems.some(function(item) {
              return item.itemNum === row[0] && item.itemType === 'Glove';
            });
            if (!alreadyAdded) {
              previousEmployeePickListItems.push({
                itemType: 'Glove',
                itemNum: row[0],
                size: row[1],
                itemClass: row[2],
                status: row[6],
                pickedFor: pickedFor,
                previousEmployee: empNameLower
              });
            }
          }
        });
      }
    });

    // Check Sleeves
    sleevesData.forEach(function(row) {
      var status = (row[6] || '').toString().trim().toLowerCase();
      var pickedFor = (row[9] || '').toString().trim();  // Column J - Picked For

      if ((status === 'ready for delivery' || status === 'packed for delivery') && pickedFor) {
        // Check if picked for a previous employee
        for (var empName in previousEmployeeLastDay) {
          if (pickedFor.toLowerCase().indexOf(empName.toLowerCase()) !== -1) {
            previousEmployeePickListItems.push({
              itemType: 'Sleeve',
              itemNum: row[0],
              size: row[1],
              itemClass: row[2],
              status: row[6],
              pickedFor: pickedFor,
              previousEmployee: empName
            });
            break;
          }
        }
        // Also check the previousEmployeeNames Set
        previousEmployeeNames.forEach(function(empNameLower) {
          if (pickedFor.toLowerCase().indexOf(empNameLower) !== -1) {
            // Check if already added
            var alreadyAdded = previousEmployeePickListItems.some(function(item) {
              return item.itemNum === row[0] && item.itemType === 'Sleeve';
            });
            if (!alreadyAdded) {
              previousEmployeePickListItems.push({
                itemType: 'Sleeve',
                itemNum: row[0],
                size: row[1],
                itemClass: row[2],
                status: row[6],
                pickedFor: pickedFor,
                previousEmployee: empNameLower
              });
            }
          }
        });
      }
    });

    // If there are pick list items for previous employees, add to To Do List and show popup
    if (previousEmployeePickListItems.length > 0) {
      // Add to To Do Schedule config
      addPreviousEmployeePickListToToDo(ss, previousEmployeePickListItems);

      // Build popup message
      var popupMessage = '⚠️ The following pick list items are marked for PREVIOUS EMPLOYEES and need to be returned to "On Shelf":\n\n';
      previousEmployeePickListItems.forEach(function(item) {
        popupMessage += '• ' + item.itemType + ' #' + item.itemNum + ' (Class ' + item.itemClass + ') - was picked for ' + item.previousEmployee + '\n';
      });
      popupMessage += '\nThese items have been added to your To Do List.';

      // Show popup
      SpreadsheetApp.getUi().alert('Previous Employee Pick List Items Found', popupMessage, SpreadsheetApp.getUi().ButtonSet.OK);
    }

    Logger.log('Reclaims sheet updated - Previous Employee: ' + prevEmpItems.length +
               ', Class 3 Reclaims: ' + class3Reclaims.length +
               ', Class 2 Reclaims: ' + class2Reclaims.length +
               ', Lost Items: ' + lostItems.length +
               ', Previous Employee Pick List Items: ' + previousEmployeePickListItems.length);

  } catch (e) {
    Logger.log('[ERROR] updateReclaimsSheet: ' + e);
    SpreadsheetApp.getUi().alert('Error updating Reclaims sheet: ' + e);
  }
}

/**
 * Adds previous employee pick list items to the To Do List.
 * Creates tasks to return these items to "On Shelf" status.
 *
 * @param {Spreadsheet} ss - The active spreadsheet
 * @param {Array} items - Array of pick list item objects for previous employees
 */
function addPreviousEmployeePickListToToDo(ss, items) {
  if (!items || items.length === 0) return;

  try {
    var toDoConfigSheet = ss.getSheetByName('ToDoConfig');

    // If ToDoConfig sheet doesn't exist, create a simple log entry
    if (!toDoConfigSheet) {
      Logger.log('ToDoConfig sheet not found - logging items to return to shelf:');
      items.forEach(function(item) {
        Logger.log('  ' + item.itemType + ' #' + item.itemNum + ' - ' + item.pickedFor);
      });
      return;
    }

    // Add manual tasks to the ToDoConfig sheet
    // Find the Manual Tasks section or append to the end
    var lastRow = toDoConfigSheet.getLastRow();
    var data = toDoConfigSheet.getDataRange().getValues();

    // Look for existing "Return to Shelf" tasks and don't duplicate
    var existingTasks = new Set();
    for (var i = 0; i < data.length; i++) {
      var taskDesc = (data[i][1] || '').toString();
      if (taskDesc.indexOf('Return to Shelf') !== -1) {
        existingTasks.add(taskDesc);
      }
    }

    // Find the row to insert new manual tasks (after any existing manual tasks header)
    var manualTasksRow = -1;
    for (var j = 0; j < data.length; j++) {
      if ((data[j][0] || '').toString().indexOf('Manual Tasks') !== -1 ||
          (data[j][0] || '').toString().indexOf('Personal Tasks') !== -1) {
        manualTasksRow = j + 2;  // Row after the header
        break;
      }
    }

    // If no manual tasks section found, append at end
    if (manualTasksRow === -1) {
      manualTasksRow = lastRow + 2;
      toDoConfigSheet.getRange(lastRow + 1, 1).setValue('Personal Tasks');
      toDoConfigSheet.getRange(lastRow + 1, 1).setFontWeight('bold').setBackground('#e1bee7');
    }

    // Add tasks for each item
    var tasksAdded = 0;
    var today = new Date();
    var todayStr = Utilities.formatDate(today, ss.getSpreadsheetTimeZone(), 'MM/dd/yyyy');

    items.forEach(function(item) {
      var taskDesc = 'Return to Shelf: ' + item.itemType + ' #' + item.itemNum + ' (was picked for ' + item.previousEmployee + ')';

      // Skip if already exists
      if (existingTasks.has(taskDesc)) {
        return;
      }

      // Insert the task
      toDoConfigSheet.insertRowAfter(manualTasksRow);
      toDoConfigSheet.getRange(manualTasksRow + 1, 1).setValue('Previous Employee');  // Category
      toDoConfigSheet.getRange(manualTasksRow + 1, 2).setValue(taskDesc);  // Task description
      toDoConfigSheet.getRange(manualTasksRow + 1, 3).setValue(todayStr);  // Date added
      toDoConfigSheet.getRange(manualTasksRow + 1, 4).insertCheckboxes();  // Completed checkbox

      tasksAdded++;
      manualTasksRow++;
    });

    if (tasksAdded > 0) {
      Logger.log('Added ' + tasksAdded + ' "Return to Shelf" tasks to To Do List');
    }

  } catch (e) {
    Logger.log('Error adding previous employee items to To Do: ' + e);
  }
}

/**
 * Phase 6: Archives the old To Do List sheet.
 * Renames it to "To Do List (Archive)" and hides it.
 * The system now uses Task Metadata as the single source of truth.
 *
 * Menu item: Glove Manager → Schedule & To-Do → Archive Old To Do List (Legacy)
 */
function archiveToDoListSheet() {
  var ui = SpreadsheetApp.getUi();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var todoSheet = ss.getSheetByName('To Do List');

  if (!todoSheet) {
    ui.alert('ℹ️ Info', 'No "To Do List" sheet found. It may have already been archived or doesn\'t exist.', ui.ButtonSet.OK);
    return;
  }

  // Check if Task Metadata exists first
  var metadataSheet = ss.getSheetByName('Task Metadata');
  if (!metadataSheet || metadataSheet.getLastRow() <= 1) {
    ui.alert('⚠️ Warning',
      'Task Metadata sheet is empty or missing.\n\n' +
      'Please run "Generate Task Metadata" first before archiving the To Do List.\n\n' +
      'The system now uses Task Metadata as the single source of truth.',
      ui.ButtonSet.OK);
    return;
  }

  // Confirm with user
  var response = ui.alert('📦 Archive To Do List?',
    'This will:\n' +
    '1. Rename "To Do List" to "To Do List (Archive)"\n' +
    '2. Hide the archived sheet\n\n' +
    'The system now uses Task Metadata as the single source of truth.\n' +
    'The archived sheet will be preserved for reference but hidden from view.\n\n' +
    'Continue?',
    ui.ButtonSet.YES_NO);

  if (response !== ui.Button.YES) {
    return;
  }

  try {
    // Rename and hide
    todoSheet.setName('To Do List (Archive)');
    todoSheet.hideSheet();

    ui.alert('✅ Archived',
      'The To Do List has been archived and hidden.\n\n' +
      'The system now uses Task Metadata for all task management.\n\n' +
      'To unhide the archived sheet:\n' +
      '1. Right-click any sheet tab\n' +
      '2. Select "Show more sheets..."\n' +
      '3. Click "To Do List (Archive)"',
      ui.ButtonSet.OK);

    Logger.log('To Do List archived successfully');

  } catch (e) {
    ui.alert('❌ Error', 'Failed to archive To Do List: ' + e.message, ui.ButtonSet.OK);
    Logger.log('Error archiving To Do List: ' + e);
  }
}

/**
 * Archives employees with "Previous Employee" location to the Employee History sheet.
 * Searches the Employees sheet for all rows where Location = "Previous Employee",
 * adds a "Terminated" entry to Employee History (if not already present), and
 * optionally removes them from the Employees sheet.
 */
function archivePreviousEmployees() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var ui = SpreadsheetApp.getUi();
  var employeesSheet = ss.getSheetByName(SHEET_EMPLOYEES);
  var historySheet = ss.getSheetByName('Employee History');

  if (!employeesSheet) {
    ui.alert('❌ Error', 'Employees sheet not found.', ui.ButtonSet.OK);
    return;
  }

  if (!historySheet) {
    historySheet = ss.insertSheet('Employee History');
    setupEmployeeHistorySheet(historySheet);
  }

  var empData = employeesSheet.getDataRange().getValues();
  var empHeaders = empData[0];

  // Find column indices dynamically
  var nameColIdx = 0;
  var locationColIdx = -1;
  var jobNumberColIdx = -1;
  var hireDateColIdx = -1;
  var lastDayColIdx = -1;
  var lastDayReasonColIdx = -1;

  for (var h = 0; h < empHeaders.length; h++) {
    var header = String(empHeaders[h]).toLowerCase().trim();
    if (header === 'location') locationColIdx = h;
    if (header === 'job number') jobNumberColIdx = h;
    if (header === 'hire date') hireDateColIdx = h;
    if (header === 'last day') lastDayColIdx = h;
    if (header === 'last day reason') lastDayReasonColIdx = h;
  }

  if (locationColIdx === -1) {
    ui.alert('❌ Error', 'Location column not found in Employees sheet.', ui.ButtonSet.OK);
    return;
  }

  // Find all Previous Employee rows
  var previousEmployees = [];
  for (var i = 1; i < empData.length; i++) {
    var location = (empData[i][locationColIdx] || '').toString().trim().toLowerCase();
    if (location === 'previous employee') {
      previousEmployees.push({
        row: i + 1,  // 1-based row number
        name: empData[i][nameColIdx] || '',
        location: empData[i][locationColIdx] || '',
        jobNumber: jobNumberColIdx !== -1 ? empData[i][jobNumberColIdx] : '',
        hireDate: hireDateColIdx !== -1 ? empData[i][hireDateColIdx] : '',
        lastDay: lastDayColIdx !== -1 ? empData[i][lastDayColIdx] : '',
        lastDayReason: lastDayReasonColIdx !== -1 ? empData[i][lastDayReasonColIdx] : ''
      });
    }
  }

  if (previousEmployees.length === 0) {
    ui.alert('ℹ️ No Previous Employees', 'No employees found with Location = "Previous Employee".', ui.ButtonSet.OK);
    return;
  }

  // Ask user what to do
  var response = ui.alert(
    '📤 Archive Previous Employees',
    'Found ' + previousEmployees.length + ' employee(s) with Location = "Previous Employee".\n\n' +
    'This will:\n' +
    '1. Add "Terminated" entries to Employee History (if not already present)\n\n' +
    'Do you want to proceed?',
    ui.ButtonSet.YES_NO
  );

  if (response !== ui.Button.YES) {
    return;
  }

  var today = new Date();
  var todayStr = Utilities.formatDate(today, ss.getSpreadsheetTimeZone(), 'MM/dd/yyyy');
  var archived = 0;
  var skipped = 0;

  // Build map of existing terminated entries to avoid duplicates
  var existingTerminated = {};
  if (historySheet.getLastRow() > 2) {
    var historyData = historySheet.getRange(3, 1, historySheet.getLastRow() - 2, 10).getValues();
    for (var j = 0; j < historyData.length; j++) {
      var histName = (historyData[j][1] || '').toString().trim().toLowerCase();
      var histEventType = (historyData[j][2] || '').toString().trim().toLowerCase();
      if (histEventType === 'terminated') {
        existingTerminated[histName] = true;
      }
    }
  }

  // Track rows to delete (we'll delete in reverse order to preserve row numbers)
  var rowsToDelete = [];

  // Add to Employee History
  for (var k = 0; k < previousEmployees.length; k++) {
    var emp = previousEmployees[k];
    var empNameLower = emp.name.toString().trim().toLowerCase();

    // Track the row for deletion regardless of whether we archive
    rowsToDelete.push(emp.row);

    // Skip adding to history if already has a Terminated entry
    if (existingTerminated[empNameLower]) {
      skipped++;
      continue;
    }

    // Format Last Day date if present
    var lastDayStr = '';
    if (emp.lastDay) {
      if (emp.lastDay instanceof Date) {
        lastDayStr = Utilities.formatDate(emp.lastDay, ss.getSpreadsheetTimeZone(), 'MM/dd/yyyy');
      } else {
        lastDayStr = emp.lastDay.toString();
      }
    }

    // Format Hire Date if available
    var hireDateStr = '';
    if (emp.hireDate) {
      if (emp.hireDate instanceof Date) {
        hireDateStr = Utilities.formatDate(emp.hireDate, ss.getSpreadsheetTimeZone(), 'MM/dd/yyyy');
      } else {
        hireDateStr = emp.hireDate.toString();
      }
    }

    // Add history entry - format with Rehire Date column
    var historyRow = [
      lastDayStr || todayStr,  // Date (event date)
      emp.name,                // Employee Name
      'Terminated',            // Event Type
      'Previous Employee',     // Location
      emp.jobNumber,           // Job Number
      hireDateStr,             // Hire Date
      lastDayStr,              // Last Day
      emp.lastDayReason || '', // Last Day Reason
      '',                      // Rehire Date (empty)
      'Archived via Utilities menu'  // Notes
    ];
    historySheet.appendRow(historyRow);
    archived++;
  }

  // Delete rows from Employees sheet (in reverse order to preserve row numbers)
  rowsToDelete.sort(function(a, b) { return b - a; }); // Sort descending
  for (var d = 0; d < rowsToDelete.length; d++) {
    employeesSheet.deleteRow(rowsToDelete[d]);
  }

  // Show results
  var message = '✅ Archive Complete!\n\n';
  message += '📝 Archived to History: ' + archived + ' employee(s)\n';
  if (skipped > 0) {
    message += '⏭️ Already in history: ' + skipped + ' employee(s)\n';
  }
  message += '🗑️ Removed from Employees sheet: ' + rowsToDelete.length + ' employee(s)';

  ui.alert('Archive Results', message, ui.ButtonSet.OK);

  logEvent('archivePreviousEmployees: Archived ' + archived + ', Skipped ' + skipped + ', Removed ' + rowsToDelete.length, 'INFO');
}

// ============================================================================
// BACKUP SNAPSHOT FUNCTIONS - See 90-Backup.gs
// ============================================================================


// NOTE: listBackups() and formatFileSize() were removed during refactoring (Jan 2026)
// They were never called from the menu or elsewhere in the code
// NOTE: getSignificantJobNumber() moved to 01-Utilities.gs

/**
 * Formats a date value for Employee History entries.
 * @param {Date|string} dateValue - The date to format
 * @return {string} Formatted date string (MM/dd/yyyy)
 */
function formatDateForHistory(dateValue) {
  if (!dateValue) return '';
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var tz = ss.getSpreadsheetTimeZone();

    if (dateValue instanceof Date) {
      return Utilities.formatDate(dateValue, tz, 'MM/dd/yyyy');
    }

    var d = new Date(dateValue);
    if (!isNaN(d.getTime())) {
      return Utilities.formatDate(d, tz, 'MM/dd/yyyy');
    }

    return String(dateValue);
  } catch (e) {
    return String(dateValue);
  }
}

// NOTE: trackEmployeeChange() and ensureEmployeeInHistory() have been
// consolidated into 51-EmployeeHistory.gs to avoid duplicate function definitions.

// ============================================================================
// NEW EMPLOYEE DIALOG FUNCTIONS
// ============================================================================

/**
 * Shows the New Employee dialog when a new name is detected in the Employees sheet.
 * Called from the onEditHandler when a new name is added to column A.
 * @param {string} employeeName - The new employee's name
 * @param {number} rowIndex - The row index where the name was added
 */
function showNewEmployeeDialog(employeeName, rowIndex) {
  try {
    // Get locations for the dropdown
    var locations = getConfiguredLocations();

    var template = HtmlService.createTemplateFromFile('NewEmployeeDialog');
    // Pass data to the template
    template.employeeName = employeeName;
    template.rowIndex = rowIndex;
    template.locations = JSON.stringify(locations);

    var html = template.evaluate()
      .setWidth(500)
      .setHeight(650);

    SpreadsheetApp.getUi().showModalDialog(html, '👤 New Employee: ' + employeeName);
  } catch (err) {
    Logger.log('Error showing new employee dialog: ' + err);
    // Fall back to just notifying the user
    SpreadsheetApp.getActiveSpreadsheet().toast(
      'New employee "' + employeeName + '" added. Please fill in their details.',
      '👤 New Employee', 5
    );
  }
}

/**
 * Gets data for initializing the New Employee dialog.
 * @param {string} employeeName - The employee name
 * @param {number} rowIndex - The row index
 * @return {Object} Data for the dialog
 */
function getNewEmployeeDialogData(employeeName, rowIndex) {
  return {
    name: employeeName,
    rowIndex: rowIndex,
    locations: getConfiguredLocations()
  };
}

/**
 * Gets data for the New Employee dialog from the currently active/selected row.
 * Called by the dialog on initialization.
 * @return {Object} Data for the dialog including name, row index, and locations
 */
function getNewEmployeeDialogDataFromActiveRow() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getActiveSheet();
  var activeRange = sheet.getActiveRange();

  if (!activeRange || sheet.getName() !== 'Employees') {
    return {
      name: '',
      rowIndex: 0,
      locations: getConfiguredLocations()
    };
  }

  var rowIndex = activeRange.getRow();
  var employeeName = '';

  // Get the name from column A of the active row
  if (rowIndex >= 2) {
    employeeName = String(sheet.getRange(rowIndex, 1).getValue() || '').trim();
  }

  return {
    name: employeeName,
    rowIndex: rowIndex,
    locations: getConfiguredLocations()
  };
}

/**
 * Saves the new employee data from the dialog.
 * Updates the Employees sheet row with all the collected data.
 * @param {Object} data - Employee data from the dialog form
 * @return {Object} Result with success status
 */
function saveNewEmployeeData(data) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Employees');

  if (!sheet) {
    throw new Error('Employees sheet not found');
  }

  var rowIndex = data.rowIndex;
  if (!rowIndex || rowIndex < 2) {
    throw new Error('Invalid row index');
  }

  // Get headers to find column indices
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var cols = {};

  for (var i = 0; i < headers.length; i++) {
    var header = String(headers[i]).toLowerCase().trim();
    if (header === 'name') cols.name = i + 1;
    if (header === 'verify') cols.verify = i + 1;
    if (header === 'location') cols.location = i + 1;
    if (header === 'job number') cols.jobNumber = i + 1;
    if (header === 'phone number') cols.phoneNumber = i + 1;
    if (header === 'notification emails') cols.notificationEmails = i + 1;
    if (header === 'mp email') cols.mpEmail = i + 1;
    if (header === 'email address') cols.emailAddress = i + 1;
    if (header === 'glove size') cols.gloveSize = i + 1;
    if (header === 'sleeve size') cols.sleeveSize = i + 1;
    if (header === 'hire date') cols.hireDate = i + 1;
    // Prioritize 'job classification' over 'class' - only use 'class' if no 'job classification' exists
    if (header === 'job classification') cols.jobClassification = i + 1;
  }

  // If no 'Job Classification' column found, look for 'Class' as fallback
  if (!cols.jobClassification) {
    for (var j = 0; j < headers.length; j++) {
      var hdr = String(headers[j]).toLowerCase().trim();
      if (hdr === 'class') {
        cols.jobClassification = j + 1;
        break;
      }
    }
  }

  Logger.log('saveNewEmployeeData: rowIndex=' + rowIndex + ', cols=' + JSON.stringify(cols));

  // Update the row with the employee data
  if (cols.location && data.location) {
    sheet.getRange(rowIndex, cols.location).setValue(data.location);
  }
  if (cols.jobNumber && data.jobNumber) {
    sheet.getRange(rowIndex, cols.jobNumber).setValue(data.jobNumber);
  }
  if (cols.phoneNumber && data.phoneNumber) {
    sheet.getRange(rowIndex, cols.phoneNumber).setValue(data.phoneNumber);
  }
  if (cols.notificationEmails && data.notificationEmails) {
    sheet.getRange(rowIndex, cols.notificationEmails).setValue(data.notificationEmails);
  }
  if (cols.mpEmail && data.mpEmail) {
    sheet.getRange(rowIndex, cols.mpEmail).setValue(data.mpEmail);
  }
  if (cols.emailAddress && data.emailAddress) {
    sheet.getRange(rowIndex, cols.emailAddress).setValue(data.emailAddress);
  }
  if (cols.gloveSize && data.gloveSize) {
    sheet.getRange(rowIndex, cols.gloveSize).setValue(data.gloveSize);
  }
  if (cols.sleeveSize && data.sleeveSize) {
    sheet.getRange(rowIndex, cols.sleeveSize).setValue(data.sleeveSize);
  }
  if (cols.hireDate && data.hireDate) {
    var hireDateCell = sheet.getRange(rowIndex, cols.hireDate);
    var hireDate = new Date(data.hireDate);
    if (!isNaN(hireDate.getTime())) {
      hireDateCell.setValue(hireDate);
      hireDateCell.setNumberFormat('mm/dd/yyyy');
    }
  }
  if (cols.jobClassification && data.jobClassification) {
    sheet.getRange(rowIndex, cols.jobClassification).setValue(data.jobClassification);
  }

  // Log the event
  logEvent('New employee added: ' + data.name + ' at ' + data.location + ' (' + data.jobNumber + ')');

  // Show confirmation
  ss.toast('Employee "' + data.name + '" saved successfully!', '✅ Employee Added', 3);

  // Track in Employee History
  try {
    trackNewEmployeeInHistory(ss, data);
  } catch (histErr) {
    Logger.log('Error tracking new employee in history: ' + histErr);
  }

  return { success: true };
}

/**
 * Tracks a new employee addition in the Employee History sheet.
 * @param {Spreadsheet} ss - The spreadsheet
 * @param {Object} data - The employee data
 */
function trackNewEmployeeInHistory(ss, data) {
  var historySheet = ss.getSheetByName('Employee History');
  if (!historySheet) return;

  var today = new Date();
  var lastRow = historySheet.getLastRow();

  // Add a "New Employee" entry
  historySheet.getRange(lastRow + 1, 1, 1, 10).setValues([[
    data.name,                // A: Employee Name
    today,                    // B: Change Date
    'New Employee',           // C: Change Type
    '',                       // D: Old Value
    data.location,            // E: New Value (Location)
    data.location,            // F: Location
    data.jobNumber,           // G: Job Number
    'New Hire',               // H: Change Reason
    '',                       // I: Rehire Date
    'Added via New Employee dialog'  // J: Notes
  ]]);

  // Format the date cell
  historySheet.getRange(lastRow + 1, 2).setNumberFormat('mm/dd/yyyy');

  Logger.log('Tracked new employee in history: ' + data.name);
}

/**
 * Checks if a name in the Employees sheet is a new employee (not already tracked).
 * @param {string} employeeName - The employee name to check
 * @return {boolean} True if this is a new employee
 */
function isNewEmployee(employeeName) {
  if (!employeeName || employeeName.trim() === '') return false;

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Employees');

  if (!sheet || sheet.getLastRow() < 2) return true;

  // Get all names in column A
  var names = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues();
  var nameLower = employeeName.toLowerCase().trim();

  // Count how many times this name appears
  var count = 0;
  for (var i = 0; i < names.length; i++) {
    if (String(names[i][0]).toLowerCase().trim() === nameLower) {
      count++;
    }
  }

  // If this name appears only once, it's a new addition
  return count <= 1;
}

// ============================================================================
// EMPLOYEE HISTORY FUNCTIONS
// ============================================================================
// NOTE: handleLastDayChange(), handleRehireDateChange(), trackEmployeeChange(),
// and saveEmployeeHistory() have been consolidated into 51-EmployeeHistory.gs
// to avoid duplicate function definitions. See that file for implementation.
// ============================================================================

// ============================================================================
// RECLAIMS AUTO PICK LIST FUNCTIONS
// ============================================================================

/**
 * Gets all item numbers already assigned in Glove Swaps and Sleeve Swaps.
 * These items should not be assigned to reclaims (swap assignments take priority).
 * @param {Spreadsheet} ss - The active spreadsheet
 * @return {Set} Set of item numbers already assigned in swaps
 */
function getSwapAssignedItems(ss) {
  var assignedItems = new Set();

  // Check Glove Swaps
  var gloveSwapsSheet = ss.getSheetByName(SHEET_GLOVE_SWAPS);
  if (gloveSwapsSheet && gloveSwapsSheet.getLastRow() > 1) {
    var gloveSwapsData = gloveSwapsSheet.getDataRange().getValues();
    for (var i = 1; i < gloveSwapsData.length; i++) {
      var row = gloveSwapsData[i];
      var pickListItem = (row[6] || '').toString().trim();  // Column G = Pick List Item #

      // Skip header rows and location sub-headers
      var firstCell = (row[0] || '').toString().trim();
      if (!firstCell || firstCell.indexOf('Class') !== -1 || firstCell.indexOf('STAGE') !== -1 ||
          firstCell === 'Employee' || firstCell.indexOf('📍') !== -1) {
        continue;
      }

      if (pickListItem && pickListItem !== '—' && pickListItem !== '-') {
        assignedItems.add(pickListItem);
      }
    }
  }

  // Check Sleeve Swaps
  var sleeveSwapsSheet = ss.getSheetByName(SHEET_SLEEVE_SWAPS);
  if (sleeveSwapsSheet && sleeveSwapsSheet.getLastRow() > 1) {
    var sleeveSwapsData = sleeveSwapsSheet.getDataRange().getValues();
    for (var j = 1; j < sleeveSwapsData.length; j++) {
      var sRow = sleeveSwapsData[j];
      var sPickListItem = (sRow[6] || '').toString().trim();

      var sFirstCell = (sRow[0] || '').toString().trim();
      if (!sFirstCell || sFirstCell.indexOf('Class') !== -1 || sFirstCell.indexOf('STAGE') !== -1 ||
          sFirstCell === 'Employee' || sFirstCell.indexOf('📍') !== -1) {
        continue;
      }

      if (sPickListItem && sPickListItem !== '—' && sPickListItem !== '-') {
        assignedItems.add(sPickListItem);
      }
    }
  }

  // Also check Picked For column in Gloves and Sleeves sheets
  var glovesSheet = ss.getSheetByName(SHEET_GLOVES);
  if (glovesSheet && glovesSheet.getLastRow() > 1) {
    var glovesData = glovesSheet.getDataRange().getValues();
    for (var g = 1; g < glovesData.length; g++) {
      var pickedFor = (glovesData[g][9] || '').toString().trim();  // Column J = Picked For
      if (pickedFor) {
        assignedItems.add(glovesData[g][0].toString().trim());  // Item #
      }
    }
  }

  var sleevesSheet = ss.getSheetByName(SHEET_SLEEVES);
  if (sleevesSheet && sleevesSheet.getLastRow() > 1) {
    var sleevesData = sleevesSheet.getDataRange().getValues();
    for (var s = 1; s < sleevesData.length; s++) {
      var sPickedFor = (sleevesData[s][9] || '').toString().trim();
      if (sPickedFor) {
        assignedItems.add(sleevesData[s][0].toString().trim());
      }
    }
  }

  Logger.log('getSwapAssignedItems: Found ' + assignedItems.size + ' items already assigned in swaps');
  return assignedItems;
}

/**
 * Finds a suitable Pick List item for a reclaim.
 *
 * RECLAIM LOGIC:
 * - Class 3 Reclaims (employee has CL3 in non-approved location): Need DOWNGRADE to Class 2
 *   - BUT if employee already has a Class 2 item assigned, no pick list needed
 * - Class 2 Reclaims (employee has CL2 in CL3-only location): Need UPGRADE to Class 3
 *   - BUT if employee already has a Class 3 item assigned, no pick list needed
 *
 * @param {Array} inventoryData - The inventory data (gloves or sleeves)
 * @param {Object} reclaim - The reclaim object with employee, size, class info
 * @param {Set} assignedItems - Set of item numbers already assigned
 * @param {string} reclaimType - 'class3' for Class 3 Reclaims, 'class2' for Class 2 Reclaims
 * @param {Array} allInventoryData - Full inventory data to check for existing assignments
 * @return {Object} Object with itemNum and status
 */
function findReclaimPickListItem(inventoryData, reclaim, assignedItems, reclaimType, allInventoryData) {
  var result = { itemNum: '—', status: 'Need to Purchase ❌', inventoryData: null };

  var isGlove = (reclaim.itemType === 'Glove');
  var employeeName = reclaim.employee.toString().trim().toLowerCase();

  // Determine the target class based on reclaim type
  var targetClass;
  if (reclaimType === 'class3') {
    // Class 3 Reclaims: Employee has CL3 item in non-approved location
    // Need to RECLAIM the CL3 and replace with CL2
    targetClass = 2;

    // Check if employee already has a Class 2 item assigned
    var hasClass2 = allInventoryData.some(function(item) {
      var itemClass = parseInt(item[2], 10);
      var assignedTo = (item[7] || '').toString().trim().toLowerCase();
      return itemClass === 2 && assignedTo === employeeName;
    });

    if (hasClass2) {
      result.status = 'Reclaim Only - Has CL2 ✅';
      return result;
    }
  } else if (reclaimType === 'class2') {
    // Class 2 Reclaims: Employee has CL2 item in CL3-only location
    // Need to RECLAIM the CL2 and replace with CL3 (upgrade)
    targetClass = 3;

    // Check if employee already has a Class 3 item assigned
    var hasClass3 = allInventoryData.some(function(item) {
      var itemClass = parseInt(item[2], 10);
      var assignedTo = (item[7] || '').toString().trim().toLowerCase();
      return itemClass === 3 && assignedTo === employeeName;
    });

    if (hasClass3) {
      result.status = 'Reclaim Only - Has CL3 ✅';
      return result;
    }
  } else {
    return result;
  }

  var useSize = reclaim.preferredSize || reclaim.size;
  var useSizeNum = isGlove ? parseFloat(useSize) : null;

  // Helper function to check if item has LOST-LOCATE marker
  // Items with this marker should NOT be assigned in pick lists
  function isLostLocate(item) {
    var notes = (item[10] || '').toString().trim().toUpperCase();
    return notes.indexOf('LOST-LOCATE') !== -1;
  }

  // Search priority: 1) Exact size On Shelf, 2) Size up On Shelf, 3) Ready For Delivery, 4) In Testing

  // 1) Try exact size On Shelf
  var match = inventoryData.find(function(item) {
    var itemClass = parseInt(item[2], 10);
    var itemStatus = (item[6] || '').toString().trim().toLowerCase();
    var itemNum = item[0].toString().trim();
    var itemSize = isGlove ? parseFloat(item[1]) : item[1];

    var classMatch = (itemClass === targetClass);
    var statusMatch = (itemStatus === 'on shelf');
    var notAssigned = !assignedItems.has(itemNum);
    var notLost = !isLostLocate(item);
    var sizeMatch = isGlove ? (itemSize === useSizeNum) :
                    (item[1] && item[1].toString().trim().toLowerCase() === useSize.toString().trim().toLowerCase());

    // Debug logging when filtering due to LOST-LOCATE
    if (classMatch && statusMatch && !notAssigned && sizeMatch && !notLost) {
      Logger.log('findReclaimPickListItem: Filtered item #' + itemNum + ' for ' + employeeName + ' - LOST-LOCATE marker found');
    }

    return classMatch && statusMatch && notAssigned && notLost && sizeMatch;
  });

  if (match) {
    result.itemNum = String(match[0]);
    result.status = 'In Stock ✅';
    result.inventoryData = match;
    return result;
  }

  // 2) Try size up On Shelf (gloves only)
  if (isGlove && !isNaN(useSizeNum)) {
    match = inventoryData.find(function(item) {
      var itemClass = parseInt(item[2], 10);
      var itemStatus = (item[6] || '').toString().trim().toLowerCase();
      var itemNum = item[0].toString().trim();
      var itemSize = parseFloat(item[1]);
      var notLost = !isLostLocate(item);

      // Debug logging when filtering due to LOST-LOCATE
      if (itemClass === targetClass && itemStatus === 'on shelf' && !assignedItems.has(itemNum) && itemSize === useSizeNum + 0.5 && !notLost) {
        Logger.log('findReclaimPickListItem: Filtered item #' + itemNum + ' (size up) for ' + employeeName + ' - LOST-LOCATE marker found');
      }

      return itemClass === targetClass &&
             itemStatus === 'on shelf' &&
             !assignedItems.has(itemNum) &&
             notLost &&
             itemSize === useSizeNum + 0.5;
    });

    if (match) {
      result.itemNum = String(match[0]);
      result.status = 'In Stock (Size Up) ⚠️';
      result.inventoryData = match;
      return result;
    }
  }

  // 3) Try Ready For Delivery
  match = inventoryData.find(function(item) {
    var itemClass = parseInt(item[2], 10);
    var itemStatus = (item[6] || '').toString().trim().toLowerCase();
    var itemNum = item[0].toString().trim();
    var itemSize = isGlove ? parseFloat(item[1]) : item[1];

    var classMatch = (itemClass === targetClass);
    var statusMatch = (itemStatus === 'ready for delivery');
    var notAssigned = !assignedItems.has(itemNum);
    var notLost = !isLostLocate(item);
    var sizeMatch = isGlove ? (itemSize === useSizeNum) :
                    (item[1] && item[1].toString().trim().toLowerCase() === useSize.toString().trim().toLowerCase());

    // Debug logging when filtering due to LOST-LOCATE
    if (classMatch && statusMatch && !notAssigned && sizeMatch && !notLost) {
      Logger.log('findReclaimPickListItem: Filtered item #' + itemNum + ' (ready for delivery) for ' + employeeName + ' - LOST-LOCATE marker found');
    }

    return classMatch && statusMatch && notAssigned && notLost && sizeMatch;
  });

  if (match) {
    result.itemNum = String(match[0]);
    result.status = 'Ready For Delivery 🚚';
    result.inventoryData = match;
    return result;
  }

  // 3b) Try size up Ready For Delivery (gloves only)
  if (isGlove && !isNaN(useSizeNum)) {
    match = inventoryData.find(function(item) {
      var itemClass = parseInt(item[2], 10);
      var itemStatus = (item[6] || '').toString().trim().toLowerCase();
      var itemNum = item[0].toString().trim();
      var itemSize = parseFloat(item[1]);
      var notLost = !isLostLocate(item);

      // Debug logging when filtering due to LOST-LOCATE
      if (itemClass === targetClass && itemStatus === 'ready for delivery' && !assignedItems.has(itemNum) && itemSize === useSizeNum + 0.5 && !notLost) {
        Logger.log('findReclaimPickListItem: Filtered item #' + itemNum + ' (ready for delivery size up) for ' + employeeName + ' - LOST-LOCATE marker found');
      }

      return itemClass === targetClass &&
             itemStatus === 'ready for delivery' &&
             !assignedItems.has(itemNum) &&
             notLost &&
             itemSize === useSizeNum + 0.5;
    });

    if (match) {
      result.itemNum = String(match[0]);
      result.status = 'Ready For Delivery (Size Up) ⚠️';
      result.inventoryData = match;
      return result;
    }
  }

  // 4) Try In Testing
  match = inventoryData.find(function(item) {
    var itemClass = parseInt(item[2], 10);
    var itemStatus = (item[6] || '').toString().trim().toLowerCase();
    var itemNum = item[0].toString().trim();
    var itemSize = isGlove ? parseFloat(item[1]) : item[1];

    var classMatch = (itemClass === targetClass);
    var statusMatch = (itemStatus === 'in testing');
    var notAssigned = !assignedItems.has(itemNum);
    var notLost = !isLostLocate(item);
    var sizeMatch = isGlove ? (itemSize === useSizeNum) :
                    (item[1] && item[1].toString().trim().toLowerCase() === useSize.toString().trim().toLowerCase());

    // Debug logging when filtering due to LOST-LOCATE
    if (classMatch && statusMatch && !notAssigned && sizeMatch && !notLost) {
      Logger.log('findReclaimPickListItem: Filtered item #' + itemNum + ' (in testing) for ' + employeeName + ' - LOST-LOCATE marker found');
    }

    return classMatch && statusMatch && notAssigned && notLost && sizeMatch;
  });

  if (match) {
    result.itemNum = String(match[0]);
    result.status = 'In Testing ⏳';
    result.inventoryData = match;
    return result;
  }

  // 4b) Try size up In Testing (gloves only)
  if (isGlove && !isNaN(useSizeNum)) {
    match = inventoryData.find(function(item) {
      var itemClass = parseInt(item[2], 10);
      var itemStatus = (item[6] || '').toString().trim().toLowerCase();
      var itemNum = item[0].toString().trim();
      var itemSize = parseFloat(item[1]);
      var notLost = !isLostLocate(item);

      // Debug logging when filtering due to LOST-LOCATE
      if (itemClass === targetClass && itemStatus === 'in testing' && !assignedItems.has(itemNum) && itemSize === useSizeNum + 0.5 && !notLost) {
        Logger.log('findReclaimPickListItem: Filtered item #' + itemNum + ' (in testing size up) for ' + employeeName + ' - LOST-LOCATE marker found');
      }

      return itemClass === targetClass &&
             itemStatus === 'in testing' &&
             !assignedItems.has(itemNum) &&
             notLost &&
             itemSize === useSizeNum + 0.5;
    });

    if (match) {
      result.itemNum = String(match[0]);
      result.status = 'In Testing (Size Up) ⚠️';
      result.inventoryData = match;
      return result;
    }
  }

  return result;
}

// ============================================================================
// TO-DO LIST FUNCTIONS
// ============================================================================

/**
 * Helper function to format dates for display
 */
function formatDateForDisplay(dateValue) {
  if (!dateValue) return '';
  if (dateValue === 'N/A') return 'N/A';
  try {
    var d = new Date(dateValue);
    if (isNaN(d.getTime())) return String(dateValue);
    return Utilities.formatDate(d, SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone(), 'MM/dd/yyyy');
  } catch (e) {
    return String(dateValue);
  }
}

/**
 * Sets up the To-Do List sheet structure with headers.
 * @param {Sheet} sheet - The To-Do List sheet to set up
 */
function setupToDoListSheet(sheet) {
  // Only set up if sheet is empty or has minimal content
  if (sheet.getLastRow() > 3) return;

  sheet.clear();

  // Title row
  sheet.getRange(1, 1, 1, 13).merge()
    .setValue('📋 TO-DO LIST - Weekly Planning')
    .setFontWeight('bold').setFontSize(16).setBackground('#1565c0').setFontColor('white').setHorizontalAlignment('center');
  sheet.setRowHeight(1, 35);

  // Instructions row
  sheet.getRange(2, 1, 1, 13).merge()
    .setValue('Generated from Swaps & Reclaims. Check ☑ Done when complete. Use Glove Manager → 📝 To-Do List → Generate To-Do List to refresh.')
    .setFontStyle('italic').setFontSize(10).setBackground('#e3f2fd').setHorizontalAlignment('center');

  // Headers row
  var headers = [
    '☑ Done',      // A - Checkbox
    'Priority',    // B - 1=High, 2=Medium, 3=Low
    'Task Type',   // C - Swap, Reclaim, Custom
    'Employee',    // D - Who needs the item
    'Location',    // E - Employee's location (for route planning)
    'Current Item #', // F - Item to replace/reclaim
    'Pick List #', // G - Replacement item number
    'Item Type',   // H - Glove/Sleeve
    'Class',       // I - 0, 2, 3
    'Due Date',    // J - Change Out Date
    'Days Left',   // K - Calculated
    'Status',      // L - Pending, In Progress, Complete
    'Notes'        // M - User notes
  ];

  sheet.getRange(3, 1, 1, headers.length).setValues([headers])
    .setFontWeight('bold').setBackground('#90caf9').setFontColor('#333').setHorizontalAlignment('center');

  sheet.setFrozenRows(3);

  // Set column widths
  sheet.setColumnWidth(1, 60);   // Done
  sheet.setColumnWidth(2, 70);   // Priority
  sheet.setColumnWidth(3, 90);   // Task Type
  sheet.setColumnWidth(4, 140);  // Employee
  sheet.setColumnWidth(5, 110);  // Location
  sheet.setColumnWidth(6, 100);  // Current Item #
  sheet.setColumnWidth(7, 90);   // Pick List #
  sheet.setColumnWidth(8, 70);   // Item Type
  sheet.setColumnWidth(9, 50);   // Class
  sheet.setColumnWidth(10, 100); // Due Date
  sheet.setColumnWidth(11, 80);  // Days Left
  sheet.setColumnWidth(12, 100); // Status
  sheet.setColumnWidth(13, 200); // Notes
}

/**
 * Legacy To-Do List generator from Code.gs.
 * @deprecated Use generateSmartSchedule() from 76-SmartScheduling.gs instead.
 * This function is kept for reference but should not be called directly.
 * The main generateToDoList() in 70-ToDoList.gs now calls generateSmartSchedule().
 */
function generateToDoListLegacyCode() {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var todoSheet = ss.getSheetByName('To Do List');

    if (!todoSheet) {
      todoSheet = ss.insertSheet('To Do List');
      setupToDoListSheet(todoSheet);
    }

    // Preserve existing user data (Done checkmarks and Notes)
    var preservedData = preserveToDoUserData(todoSheet);

    // COMPLETELY clear the sheet and rebuild headers (fixes the range error)
    todoSheet.clear();

    // Clear all data validations (removes any residual checkboxes)
    var maxRows = todoSheet.getMaxRows();
    var maxCols = todoSheet.getMaxColumns();
    if (maxRows > 0 && maxCols > 0) {
      todoSheet.getRange(1, 1, maxRows, maxCols).clearDataValidations();
    }

    setupToDoListSheet(todoSheet);

    var today = new Date();
    var todoItems = [];

    // Build employee -> location map for fallback lookup
    var employeesSheet = ss.getSheetByName(SHEET_EMPLOYEES);
    var empLocationMap = {};
    if (employeesSheet && employeesSheet.getLastRow() > 1) {
      var empData = employeesSheet.getDataRange().getValues();
      var empHeaders = empData[0];
      var locationColIdx = 2; // Default
      for (var h = 0; h < empHeaders.length; h++) {
        if (String(empHeaders[h]).toLowerCase().trim() === 'location') {
          locationColIdx = h;
          break;
        }
      }
      for (var e = 1; e < empData.length; e++) {
        var empName = (empData[e][0] || '').toString().trim().toLowerCase();
        var empLoc = (empData[e][locationColIdx] || '').toString().trim();
        if (empName && empLoc) {
          empLocationMap[empName] = empLoc;
        }
      }
    }

    // Also check Employee History for Previous Employees
    var historySheet = ss.getSheetByName('Employee History');
    if (historySheet && historySheet.getLastRow() > 2) {
      var histData = historySheet.getRange(3, 1, historySheet.getLastRow() - 2, 10).getValues();
      for (var hi = 0; hi < histData.length; hi++) {
        var histName = (histData[hi][1] || '').toString().trim().toLowerCase();
        var histLoc = (histData[hi][3] || '').toString().trim();
        // Only use if not already in empLocationMap (current employee takes priority)
        if (histName && histLoc && !empLocationMap[histName]) {
          empLocationMap[histName] = histLoc;
        }
      }
    }

    // Collect items from Glove Swaps
    var gloveSwapsSheet = ss.getSheetByName(SHEET_GLOVE_SWAPS);
    if (gloveSwapsSheet && gloveSwapsSheet.getLastRow() > 1) {
      var gloveSwapsData = gloveSwapsSheet.getDataRange().getValues();
      collectSwapTasks(gloveSwapsData, 'Glove', todoItems, today, empLocationMap);
    }

    // Collect items from Sleeve Swaps
    var sleeveSwapsSheet = ss.getSheetByName(SHEET_SLEEVE_SWAPS);
    if (sleeveSwapsSheet && sleeveSwapsSheet.getLastRow() > 1) {
      var sleeveSwapsData = sleeveSwapsSheet.getDataRange().getValues();
      collectSwapTasks(sleeveSwapsData, 'Sleeve', todoItems, today, empLocationMap);
    }

    // Collect items from Reclaims
    var reclaimsSheet = ss.getSheetByName('Reclaims');
    if (reclaimsSheet && reclaimsSheet.getLastRow() > 1) {
      collectReclaimTasks(reclaimsSheet, todoItems, today, empLocationMap);
    }

    // Collect pending/incomplete training from Training Tracking
    var trainingSheet = ss.getSheetByName('Training Tracking');
    if (trainingSheet && trainingSheet.getLastRow() > 2) {
      var trainingData = trainingSheet.getDataRange().getValues();

      // Headers are in row 2 (index 1), data starts at row 3 (index 2)
      var monthCol = 0;      // A: Month
      var topicCol = 1;      // B: Training Topic
      var crewCol = 2;       // C: Crew #
      var leadCol = 3;       // D: Crew Lead
      var dateCol = 5;       // F: Completion Date
      var statusCol = 8;     // I: Status (0-indexed)

      // Get current month for priority determination
      var currentMonth = today.getMonth() + 1; // 1-12
      var currentMonthName = ['January', 'February', 'March', 'April', 'May', 'June',
                              'July', 'August', 'September', 'October', 'November', 'December'][currentMonth - 1];

      for (var t = 2; t < trainingData.length; t++) {
        var tRow = trainingData[t];
        var month = String(tRow[monthCol]).trim();
        var topic = String(tRow[topicCol]).trim();
        var crew = String(tRow[crewCol]).trim();
        var crewLead = String(tRow[leadCol]).trim();
        var status = String(tRow[statusCol]).trim();

        // Only include current month training (and December catch-ups if it's December)
        var includeTraining = false;
        if (month === currentMonthName) {
          includeTraining = true; // Current month training
        } else if (month === 'December' && currentMonthName === 'December') {
          includeTraining = true; // December catch-ups (only show in December)
        } else if (status === 'Overdue') {
          includeTraining = true; // Always show overdue training regardless of month
        }

        // Add task if training is incomplete and should be included
        if (includeTraining && month && crew && status !== 'Complete' && status !== 'N/A') {
          // Determine priority based on status
          var priority = 1; // High priority for current month and overdue
          if (status === 'Overdue') {
            priority = 1; // High - Overdue training is always high priority
          } else if (month === 'December') {
            priority = 2; // Medium - December catch-ups
          } else {
            priority = 1; // High - Current month training
          }

          var taskDescription = 'Training: ' + topic;
          if (crewLead) {
            taskDescription = taskDescription + ' - ' + crewLead;
          }

          // Calculate days left until end of current month
          var endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0); // Last day of current month
          var daysLeftNum = Math.ceil((endOfMonth - today) / (1000 * 60 * 60 * 24));

          var daysLeftText = daysLeftNum + ' days';
          if (status === 'In Progress') {
            daysLeftText = daysLeftNum + ' days (In Progress)';
          } else if (status === 'Overdue') {
            daysLeftText = 'OVERDUE';
            daysLeftNum = -1; // Negative for sorting overdue first
          }

          // Get location from crew lead name if possible
          var trainingLocation = 'All Locations';
          if (crewLead) {
            var leadNameLower = crewLead.toLowerCase().trim();
            if (empLocationMap[leadNameLower]) {
              trainingLocation = empLocationMap[leadNameLower];
            }
          }

          todoItems.push({
            done: false,
            priority: priority,
            taskType: 'Training',
            employee: crewLead || crew,
            location: trainingLocation,
            currentItemNum: crew,
            pickListNum: '',
            itemType: topic,
            itemClass: '', // Leave empty for Training tasks (not a rubber class)
            dueDate: '',
            daysLeft: daysLeftText,
            daysLeftNum: daysLeftNum,
            status: status === 'Overdue' ? 'Overdue' : 'Pending'
          });
        }
      }
    }

    // Sort by Location (for route planning), then by Task Type (group like items), then by Priority, then by Days Left
    todoItems.sort(function(a, b) {
      // First sort by location
      var locCompare = (a.location || 'ZZZ').localeCompare(b.location || 'ZZZ');
      if (locCompare !== 0) return locCompare;

      // Then by task type (groups Training, Glove, Sleeve, Reclaim together)
      var taskTypeCompare = (a.taskType || '').localeCompare(b.taskType || '');
      if (taskTypeCompare !== 0) return taskTypeCompare;

      // Then by priority
      if (a.priority !== b.priority) return a.priority - b.priority;

      // Then by days left (most urgent first)
      return (a.daysLeftNum || 999) - (b.daysLeftNum || 999);
    });

    // Check if we have any items
    if (todoItems.length === 0) {
      todoSheet.getRange(4, 1).setValue('No tasks to display - run Generate All Reports first');
      todoSheet.getRange(4, 1, 1, 13).merge().setHorizontalAlignment('center').setFontStyle('italic');
      SpreadsheetApp.getUi().alert('ℹ️ No Tasks Found\n\nRun "Generate All Reports" first to populate the Glove Swaps and Sleeve Swaps sheets.');
      return;
    }

    // Group by location and write to sheet
    var currentRow = 4;
    var lastLocation = '';
    var dataRows = [];  // Track rows that need checkboxes

    for (var i = 0; i < todoItems.length; i++) {
      var item = todoItems[i];

      // Add location header if location changed
      if (item.location !== lastLocation) {
        if (lastLocation !== '') {
          currentRow++; // Add spacing between location groups
        }
        todoSheet.getRange(currentRow, 1, 1, 13).merge()
          .setValue('📍 ' + (item.location || 'Unknown Location'))
          .setFontWeight('bold').setFontSize(11).setBackground('#e8eaf6').setFontColor('#3949ab').setHorizontalAlignment('left');
        currentRow++;
        lastLocation = item.location;
      }

      // Check if this item was previously marked done or has notes
      var preserveKey = item.taskType + '|' + item.employee + '|' + item.currentItemNum;
      var preserved = preservedData[preserveKey] || {};

      var rowData = [
        '',    // Done - leave empty, checkbox will be added later for all tasks
        item.priority,              // Priority
        item.taskType,              // Task Type
        item.employee,              // Employee
        item.location,              // Location
        item.currentItemNum,        // Current Item #
        item.pickListNum,           // Pick List #
        item.itemType,              // Item Type
        item.itemClass,             // Class
        item.dueDate,               // Due Date
        item.daysLeft,              // Days Left
        preserved.done ? 'Complete' : item.status,  // Status
        preserved.notes || ''       // Notes (preserve user notes)
      ];

      todoSheet.getRange(currentRow, 1, 1, 13).setValues([rowData]);

      // Track this as a data row that needs a checkbox (all tasks)
      dataRows.push(currentRow);

      // Apply styling
      todoSheet.getRange(currentRow, 1, 1, 13).setHorizontalAlignment('center');
      todoSheet.getRange(currentRow, 13).setHorizontalAlignment('left');  // Notes left-aligned

      // Color code by priority and status
      if (preserved.done) {
        todoSheet.getRange(currentRow, 1, 1, 13).setBackground('#c8e6c9');  // Green for done
        todoSheet.getRange(currentRow, 1, 1, 13).setFontColor('#666666');   // Gray text
      } else if (item.priority === 1) {
        todoSheet.getRange(currentRow, 2).setBackground('#ffcdd2');  // Red for high priority
      } else if (item.priority === 2) {
        todoSheet.getRange(currentRow, 2).setBackground('#ffe0b2');  // Orange for medium priority
      }

      // Color code Days Left column
      if (item.daysLeft === 'OVERDUE') {
        todoSheet.getRange(currentRow, 11).setFontColor('#d32f2f').setFontWeight('bold');
      } else if (item.daysLeftNum !== null && item.daysLeftNum <= 7) {
        todoSheet.getRange(currentRow, 11).setFontColor('#ff9800').setFontWeight('bold');
      } else if (item.daysLeftNum !== null && item.daysLeftNum <= 14) {
        todoSheet.getRange(currentRow, 11).setFontColor('#ff9800');
      }

      currentRow++;
    }

    // Add checkboxes only to data rows (not location headers or Training tasks)
    for (var dr = 0; dr < dataRows.length; dr++) {
      var row = dataRows[dr];
      todoSheet.getRange(row, 1).insertCheckboxes();

      // Set preserved checked state if exists
      var rowData = todoSheet.getRange(row, 1, 1, 13).getValues()[0];
      var taskType = rowData[2]; // Task Type column
      var employee = rowData[3];  // Employee column
      var currentItemNum = rowData[5]; // Current Item # column

      var preserveKey = taskType + '|' + employee + '|' + currentItemNum;
      var preserved = preservedData[preserveKey] || {};

      if (preserved.done === true) {
        todoSheet.getRange(row, 1).setValue(true);
      }
    }

    // Add summary at the top
    var totalTasks = todoItems.length;
    var completedTasks = Object.values(preservedData).filter(function(p) { return p.done; }).length;
    var overdueCount = todoItems.filter(function(t) { return t.daysLeft === 'OVERDUE'; }).length;

    var summaryText = 'Generated: ' + new Date().toLocaleString() + ' | Total: ' + totalTasks +
                      ' tasks | Overdue: ' + overdueCount + ' | Completed: ' + completedTasks;
    todoSheet.getRange(2, 1).setValue(summaryText);

    todoSheet.activate();
    SpreadsheetApp.getUi().alert('✅ To-Do List Generated!\n\n' +
                                 'Total Tasks: ' + totalTasks + '\n' +
                                 'Overdue: ' + overdueCount + '\n' +
                                 'Completed: ' + completedTasks);

  } catch (e) {
    Logger.log('[ERROR] generateToDoList: ' + e);
    SpreadsheetApp.getUi().alert('Error generating To-Do List: ' + e);
  }
}

/**
 * Collects swap tasks from a swap sheet and adds to todoItems array.
 * @param {Array} swapData - Data from the swap sheet
 * @param {string} itemType - 'Glove' or 'Sleeve'
 * @param {Array} todoItems - Array to add tasks to
 * @param {Date} today - Today's date
 * @param {Object} empLocationMap - Map of employee name (lowercase) to location for fallback
 * @deprecated Use collectSwapTasks in 76-SmartScheduling.gs instead
 */
function collectSwapTasksLegacy(swapData, itemType, todoItems, today, empLocationMap) {
  var currentClass = null;
  var currentLocation = null;

  for (var i = 1; i < swapData.length; i++) {
    var row = swapData[i];
    var firstCell = (row[0] || '').toString().trim();

    // Detect class headers
    if (firstCell.indexOf('Class') !== -1 && firstCell.indexOf('Swaps') !== -1) {
      var classPattern = new RegExp('Class (\\d+)');
      var classMatch = firstCell.match(classPattern);
      if (classMatch) {
        currentClass = parseInt(classMatch[1], 10);
      }
      currentLocation = null; // Reset location for new class
      continue;
    }

    // Detect location sub-headers
    if (firstCell.indexOf('📍') !== -1) {
      currentLocation = firstCell.replace('📍', '').trim();
      continue;
    }

    // Skip other header rows
    if (!firstCell || firstCell === 'Employee' || firstCell.indexOf('STAGE') !== -1 ||
        firstCell.indexOf('Pick List') !== -1) {
      continue;
    }

    // This is a data row
    var employee = row[0];
    var currentItemNum = row[1];
    var size = row[2];
    var dateAssigned = row[3];
    var changeOutDate = row[4];
    var daysLeft = row[5];
    var pickListNum = row[6];
    var status = row[7];
    var picked = row[8];
    var dateChanged = row[9];

    // Skip if already completed (has Date Changed)
    if (dateChanged && dateChanged !== '' && dateChanged !== false) {
      continue;
    }

    // Determine location - use currentLocation from header, or lookup from employee map
    var taskLocation = currentLocation;
    if (!taskLocation && employee && empLocationMap) {
      var empNameLower = employee.toString().trim().toLowerCase();
      taskLocation = empLocationMap[empNameLower] || 'Unknown Location';
    }
    if (!taskLocation) {
      taskLocation = 'Unknown Location';
    }

    // Calculate priority based on days left
    var priority = 3;  // Low
    var daysLeftNum = null;
    if (daysLeft === 'OVERDUE') {
      priority = 1;  // High
      daysLeftNum = -1;
    } else if (!isNaN(parseInt(daysLeft, 10))) {
      daysLeftNum = parseInt(daysLeft, 10);
      if (daysLeftNum <= 7) {
        priority = 1;  // High
      } else if (daysLeftNum <= 14) {
        priority = 2;  // Medium
      }
    }

    // Determine task status
    var taskStatus = 'Pending';
    if (picked === true || picked === 'TRUE') {
      taskStatus = 'Picked - Ready to Deliver';
    } else if (pickListNum && pickListNum !== '—' && pickListNum !== '-') {
      taskStatus = 'Item Assigned';
    } else if ((status || '').indexOf('Need to Purchase') !== -1) {
      taskStatus = 'Need to Order';
    }

    todoItems.push({
      taskType: 'Swap',
      employee: employee,
      location: taskLocation,
      currentItemNum: currentItemNum,
      pickListNum: pickListNum || '—',
      itemType: itemType,
      itemClass: currentClass,
      dueDate: formatDateForDisplay(changeOutDate),
      daysLeft: daysLeft,
      daysLeftNum: daysLeftNum,
      status: taskStatus,
      priority: priority
    });
  }
}

/**
 * Collects reclaim tasks from the Reclaims sheet and adds to todoItems array.
 * Includes Class 3 Reclaims, Class 2 Reclaims, and Lost Items (LOST-LOCATE).
 * @param {Sheet} reclaimsSheet - The Reclaims sheet
 * @param {Array} todoItems - Array to add tasks to
 * @param {Date} today - Today's date
 * @param {Object} empLocationMap - Map of employee name (lowercase) to location
 * @deprecated Use collectReclaimTasks in 76-SmartScheduling.gs instead
 */
function collectReclaimTasksLegacy(reclaimsSheet, todoItems, today, empLocationMap) {
  var data = reclaimsSheet.getDataRange().getValues();
  var inClass3Table = false;
  var inClass2Table = false;
  var inLostItemsTable = false;

  for (var i = 0; i < data.length; i++) {
    var row = data[i];
    var firstCell = (row[0] || '').toString().trim();

    // Detect table headers
    if (firstCell.indexOf('Class 3 Reclaims') !== -1) {
      inClass3Table = true;
      inClass2Table = false;
      inLostItemsTable = false;
      continue;
    }
    if (firstCell.indexOf('Class 2 Reclaims') !== -1) {
      inClass3Table = false;
      inClass2Table = true;
      inLostItemsTable = false;
      continue;
    }
    if (firstCell.indexOf('Lost Items') !== -1) {
      inClass3Table = false;
      inClass2Table = false;
      inLostItemsTable = true;
      continue;
    }

    // End of Lost Items table (next section or end of data)
    if (inLostItemsTable && (firstCell.indexOf('Previous') !== -1 ||
        firstCell.indexOf('Approved') !== -1 || firstCell.indexOf('Class') !== -1)) {
      inLostItemsTable = false;
      continue;
    }

    // Skip header rows
    if (firstCell === 'Employee' || firstCell === 'Item Type' || firstCell === '' ||
        firstCell.indexOf('Previous') !== -1 ||
        firstCell.indexOf('Approved') !== -1 || firstCell.indexOf('Location') !== -1 ||
        firstCell.indexOf('✅') !== -1 || firstCell.indexOf('📍') !== -1) {
      continue;
    }

    if (inClass3Table || inClass2Table) {
      // Reclaims table structure: Employee, Item Type, Item #, Size, Class, Location, Pick List Item #, Pick List Status
      var employee = row[0];
      var itemType = row[1];
      var itemNum = row[2];
      var size = row[3];
      var itemClass = row[4];
      var location = row[5];

      // Skip if no employee name (probably a header row we missed)
      if (!employee || typeof employee !== 'string') continue;

      // Determine priority - reclaims are generally medium priority
      var priority = 2;  // Medium
      var taskStatus = 'Reclaim Pending';

      var reclaimType = inClass3Table ? 'Reclaim CL3→CL2' : 'Reclaim CL2→CL3';

      todoItems.push({
        taskType: reclaimType,
        employee: employee,
        location: location,
        currentItemNum: itemNum,
        pickListNum: '—',
        itemType: itemType,
        itemClass: itemClass,
        dueDate: 'ASAP',  // Reclaims should be done ASAP
        daysLeft: 'ASAP',
        daysLeftNum: 0,  // Treat as urgent for sorting
        status: taskStatus,
        priority: priority
      });
    }

    if (inLostItemsTable) {
      // Lost Items table structure: Item Type, Item #, Size, Class, Last Location, Last Assigned To, Date Assigned, Notes
      var lostItemType = row[0];
      var lostItemNum = row[1];
      var lostSize = row[2];
      var lostClass = row[3];
      var lostLocation = row[4];
      var lostAssignedTo = row[5];
      var lostDateAssigned = row[6];
      var lostNotes = row[7];

      // Skip if no item type (probably a header row we missed)
      if (!lostItemType || (lostItemType !== 'Glove' && lostItemType !== 'Sleeve')) continue;

      // Lost items are HIGH priority - need to locate immediately
      todoItems.push({
        taskType: '🔍 Lost - Locate',
        employee: lostAssignedTo || 'Unknown',
        location: lostLocation || 'Unknown',
        currentItemNum: lostItemNum,
        pickListNum: '—',
        itemType: lostItemType,
        itemClass: lostClass,
        dueDate: 'URGENT',
        daysLeft: 'LOCATE',
        daysLeftNum: -999,  // Very high priority for sorting (appears first)
        status: 'Need to Locate',
        priority: 1  // High priority
      });
    }
  }
}

/**
 * Preserves user-entered data (Done checkmarks and Notes) from the To-Do List.
 * Returns a map of task keys to their preserved data.
 */
function preserveToDoUserData(todoSheet) {
  var preserved = {};

  if (todoSheet.getLastRow() <= 3) return preserved;

  var data = todoSheet.getRange(4, 1, todoSheet.getLastRow() - 3, 13).getValues();

  for (var i = 0; i < data.length; i++) {
    var row = data[i];
    var done = row[0];
    var taskType = (row[2] || '').toString().trim();
    var employee = (row[3] || '').toString().trim();
    var currentItemNum = (row[5] || '').toString().trim();
    var notes = (row[12] || '').toString().trim();

    // Skip location header rows
    if (!taskType || taskType === '' || taskType.indexOf('📍') !== -1) continue;

    var key = taskType + '|' + employee + '|' + currentItemNum;

    if (done === true || notes !== '') {
      preserved[key] = {
        done: done === true,
        notes: notes
      };
    }
  }

  return preserved;
}

/**
 * Clears completed tasks from the To-Do List.
 */
function clearCompletedTasks() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var todoSheet = ss.getSheetByName('To Do List');

  if (!todoSheet || todoSheet.getLastRow() <= 3) {
    SpreadsheetApp.getUi().alert('No tasks to clear.');
    return;
  }

  var ui = SpreadsheetApp.getUi();
  var result = ui.alert(
    'Clear Completed Tasks',
    'This will remove all tasks marked as Done (☑) from the To-Do List.\n\nContinue?',
    ui.ButtonSet.YES_NO
  );

  if (result !== ui.Button.YES) return;

  var data = todoSheet.getRange(4, 1, todoSheet.getLastRow() - 3, 13).getValues();
  var rowsToDelete = [];

  for (var i = data.length - 1; i >= 0; i--) {
    if (data[i][0] === true) {  // Done checkbox is checked
      rowsToDelete.push(i + 4);  // Adjust for header rows
    }
  }

  // Delete rows from bottom to top to avoid index shifting
  for (var j = 0; j < rowsToDelete.length; j++) {
    todoSheet.deleteRow(rowsToDelete[j]);
  }

  SpreadsheetApp.getUi().alert('✅ Cleared ' + rowsToDelete.length + ' completed tasks.');
}

// ============================================================================
// EMAIL REPORTS FUNCTIONS
// ============================================================================

/**
 * Gets unique, non-empty email addresses from the "Notification Emails" column in Employees sheet.
 * @return {Array} Array of unique email addresses
 */
function getNotificationRecipients() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var employeesSheet = ss.getSheetByName(SHEET_EMPLOYEES);

  if (!employeesSheet || employeesSheet.getLastRow() < 2) {
    return [];
  }

  var headers = employeesSheet.getRange(1, 1, 1, employeesSheet.getLastColumn()).getValues()[0];
  var notificationColIdx = -1;

  for (var i = 0; i < headers.length; i++) {
    if (String(headers[i]).toLowerCase().trim() === 'notification emails') {
      notificationColIdx = i;
      break;
    }
  }

  if (notificationColIdx === -1) {
    Logger.log('Notification Emails column not found');
    return [];
  }

  var data = employeesSheet.getRange(2, notificationColIdx + 1, employeesSheet.getLastRow() - 1, 1).getValues();
  var emailSet = {};

  data.forEach(function(row) {
    var email = (row[0] || '').toString().trim();
    if (email && email.indexOf('@') !== -1) {
      // Handle multiple emails separated by comma or semicolon
      var emailStr = email.split(';').join(',');
      var emails = emailStr.split(',');
      emails.forEach(function(e) {
        var trimmed = e.trim();
        if (trimmed && trimmed.indexOf('@') !== -1) {
          emailSet[trimmed.toLowerCase()] = trimmed;
        }
      });
    }
  });

  return Object.values(emailSet);
}

/**
 * Builds styled HTML content for the email report.
 * Includes: Inventory Reports, Purchase Needs, To-Do List, Glove Swaps, Sleeve Swaps, Reclaims
 * @return {string} HTML content for the email
 */
function buildEmailReportHtml() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var timezone = ss.getSpreadsheetTimeZone();
  var now = new Date();
  var dateStr = Utilities.formatDate(now, timezone, 'MMMM d, yyyy');

  // Common styles
  var styles = {
    headerBg: '#1565c0',
    headerColor: '#ffffff',
    subHeaderBg: '#90caf9',
    altRowBg: '#f5f5f5',
    urgentBg: '#ffcdd2',
    urgentColor: '#c62828',
    warningBg: '#fff3e0',
    warningColor: '#e65100',
    successBg: '#e8f5e9',
    successColor: '#2e7d32',
    infoBg: '#e3f2fd',
    infoColor: '#1565c0'
  };

  var html = '<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body style="font-family: Arial, sans-serif; max-width: 900px; margin: 0 auto; padding: 20px; background-color: #f5f5f5;">';

  // Title
  html += '<div style="background: linear-gradient(135deg, ' + styles.headerBg + ' 0%, #1976d2 100%); color: white; padding: 20px; border-radius: 8px; margin-bottom: 20px; text-align: center;">';
  html += '<h1 style="margin: 0; font-size: 24px;">🧤 Rubber Tracker Weekly Report</h1>';
  html += '<p style="margin: 10px 0 0 0; opacity: 0.9;">' + dateStr + '</p>';
  html += '</div>';

  // Build each section - Calendar at top, then other reports
  html += buildScheduleCalendarSection(ss, styles);
  html += buildInventoryReportSection(ss, styles);
  html += buildPurchaseNeedsSection(ss, styles);
  html += buildToDoListSection(ss, styles);
  html += buildSwapsSection(ss, 'Glove Swaps', styles);
  html += buildSwapsSection(ss, 'Sleeve Swaps', styles);
  html += buildReclaimsSection(ss, styles);

  // Footer
  html += '<div style="text-align: center; padding: 20px; color: #666; font-size: 12px; border-top: 1px solid #ddd; margin-top: 20px;">';
  html += '<p>This report was automatically generated from the Rubber Tracker spreadsheet.</p>';
  html += '<p><a href="' + ss.getUrl() + '" style="color: ' + styles.headerBg + ';">Open Spreadsheet</a></p>';
  html += '</div>';

  html += '</body></html>';

  return html;
}

/**
 * Builds the Inventory Reports section of the email.
 */
function buildInventoryReportSection(ss, styles) {
  var sheet = ss.getSheetByName('Inventory Reports');
  if (!sheet || sheet.getLastRow() < 2) {
    return buildEmptySection('📊 Inventory Reports', 'No inventory data available.', styles);
  }

  var html = '<div style="background: white; border-radius: 8px; margin-bottom: 20px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">';
  html += '<div style="background: ' + styles.headerBg + '; color: ' + styles.headerColor + '; padding: 12px 15px; font-weight: bold; font-size: 16px;">📊 Inventory Reports</div>';
  html += '<div style="padding: 15px;">';

  // Read the data from the sheet
  var data = sheet.getDataRange().getDisplayValues();

  // Extract summary info from row 4 (index 3) - the data row after header
  var summaryHeaders = data[2] || []; // Row 3 has headers
  var summaryData = data[3] || [];    // Row 4 has values

  if (summaryData.length >= 6) {
    html += '<table style="width: 100%; border-collapse: collapse; margin-bottom: 15px;">';
    html += '<tr>';
    html += '<td style="text-align: center; padding: 15px; background: ' + styles.infoBg + '; border-radius: 8px; margin: 5px;">';
    html += '<div style="font-size: 28px; font-weight: bold; color: ' + styles.infoColor + ';">' + (summaryData[0] || '0') + '</div>';
    html += '<div style="font-size: 12px; color: #666;">Total Gloves</div></td>';
    html += '<td style="text-align: center; padding: 15px; background: #f3e5f5; border-radius: 8px; margin: 5px;">';
    html += '<div style="font-size: 28px; font-weight: bold; color: #7b1fa2;">' + (summaryData[1] || '0') + '</div>';
    html += '<div style="font-size: 12px; color: #666;">Total Sleeves</div></td>';
    html += '<td style="text-align: center; padding: 15px; background: ' + styles.successBg + '; border-radius: 8px; margin: 5px;">';
    html += '<div style="font-size: 28px; font-weight: bold; color: ' + styles.successColor + ';">' + (summaryData[2] || '0') + '</div>';
    html += '<div style="font-size: 12px; color: #666;">Glove Avg/Month</div></td>';
    html += '<td style="text-align: center; padding: 15px; background: ' + styles.urgentBg + '; border-radius: 8px; margin: 5px;">';
    html += '<div style="font-size: 28px; font-weight: bold; color: ' + styles.urgentColor + ';">' + (summaryData[4] || '0') + '</div>';
    html += '<div style="font-size: 12px; color: #666;">Gloves Lost/Failed</div></td>';
    html += '</tr></table>';
  }

  // Find and display status breakdown tables
  var inStatusSection = false;
  var currentTableTitle = '';
  var tableData = [];

  for (var i = 4; i < data.length; i++) {
    var row = data[i];
    var firstCell = (row[0] || '').toString().trim();

    // Check for section headers
    if (firstCell.indexOf('GLOVES BY STATUS') !== -1 || firstCell.indexOf('SLEEVES BY STATUS') !== -1) {
      // Output previous table if exists
      if (tableData.length > 0) {
        html += buildStatusTable(currentTableTitle, tableData, styles);
      }
      currentTableTitle = firstCell;
      tableData = [];
      inStatusSection = true;
      continue;
    }

    // Skip empty rows or other headers
    if (!firstCell || firstCell === 'Status' || firstCell.indexOf('BY CLASS') !== -1 ||
        firstCell.indexOf('BY LOCATION') !== -1 || firstCell.indexOf('DASHBOARD') !== -1) {
      if (tableData.length > 0 && inStatusSection) {
        html += buildStatusTable(currentTableTitle, tableData, styles);
        tableData = [];
        inStatusSection = false;
      }
      continue;
    }

    if (inStatusSection && firstCell) {
      tableData.push({
        status: firstCell,
        count: row[1] || '0',
        percent: row[2] || '0%'
      });
    }
  }

  // Output last table
  if (tableData.length > 0) {
    html += buildStatusTable(currentTableTitle, tableData, styles);
  }

  html += '</div></div>';
  return html;
}

/**
 * Helper to build a status breakdown table.
 */
function buildStatusTable(title, data, styles) {
  if (!data || data.length === 0) return '';

  var html = '<div style="margin-bottom: 15px;">';
  html += '<h4 style="margin: 0 0 10px 0; color: ' + styles.headerBg + '; font-size: 14px;">' + title + '</h4>';
  html += '<table style="width: 100%; border-collapse: collapse; font-size: 13px;">';
  html += '<tr style="background: ' + styles.subHeaderBg + ';">';
  html += '<th style="padding: 8px; text-align: left; border: 1px solid #ddd;">Status</th>';
  html += '<th style="padding: 8px; text-align: center; border: 1px solid #ddd;">Count</th>';
  html += '<th style="padding: 8px; text-align: center; border: 1px solid #ddd;">%</th>';
  html += '</tr>';

  data.forEach(function(row, idx) {
    var bgColor = idx % 2 === 0 ? '#ffffff' : styles.altRowBg;
    var statusColor = getStatusEmailColor(row.status);
    html += '<tr style="background: ' + bgColor + ';">';
    html += '<td style="padding: 8px; border: 1px solid #ddd; color: ' + statusColor + ';">' + row.status + '</td>';
    html += '<td style="padding: 8px; text-align: center; border: 1px solid #ddd;">' + row.count + '</td>';
    html += '<td style="padding: 8px; text-align: center; border: 1px solid #ddd;">' + row.percent + '</td>';
    html += '</tr>';
  });

  html += '</table></div>';
  return html;
}

/**
 * Gets color for status text in emails.
 */
function getStatusEmailColor(status) {
  var s = (status || '').toString().toLowerCase();
  if (s.indexOf('assigned') !== -1) return '#2e7d32';
  if (s.indexOf('on shelf') !== -1) return '#1565c0';
  if (s.indexOf('testing') !== -1) return '#f57c00';
  if (s.indexOf('lost') !== -1 || s.indexOf('failed') !== -1) return '#c62828';
  if (s.indexOf('destroyed') !== -1) return '#c62828';
  return '#333333';
}

/**
 * Builds the Purchase Needs section of the email.
 */
function buildPurchaseNeedsSection(ss, styles) {
  var sheet = ss.getSheetByName('Purchase Needs');
  if (!sheet || sheet.getLastRow() < 2) {
    return buildEmptySection('🛒 Purchase Needs', 'No purchase needs at this time.', styles);
  }

  var html = '<div style="background: white; border-radius: 8px; margin-bottom: 20px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">';
  html += '<div style="background: #c62828; color: ' + styles.headerColor + '; padding: 12px 15px; font-weight: bold; font-size: 16px;">🛒 Purchase Needs</div>';
  html += '<div style="padding: 15px;">';

  var data = sheet.getDataRange().getDisplayValues();
  var currentSection = '';
  var sectionData = [];

  for (var i = 0; i < data.length; i++) {
    var row = data[i];
    var firstCell = (row[0] || '').toString().trim();

    // Check for section titles (they have emoji markers)
    if (firstCell.indexOf('🛒') !== -1 || firstCell.indexOf('📦') !== -1 ||
        firstCell.indexOf('⏳') !== -1 || firstCell.indexOf('⚠️') !== -1) {
      // Output previous section
      if (sectionData.length > 0) {
        html += buildPurchaseTable(currentSection, sectionData, styles);
      }
      currentSection = firstCell;
      sectionData = [];
      continue;
    }

    // Skip header rows
    if (firstCell === 'Severity' || firstCell === '' || !firstCell) continue;

    // Data row
    if (currentSection && row[2]) { // Has Item Type
      sectionData.push({
        severity: row[0],
        timeframe: row[1],
        itemType: row[2],
        size: row[3],
        classNum: row[4],
        qty: row[5],
        reason: row[6],
        status: row[7]
      });
    }
  }

  // Output last section
  if (sectionData.length > 0) {
    html += buildPurchaseTable(currentSection, sectionData, styles);
  }

  if (html.indexOf('<table') === -1) {
    html += '<p style="color: #2e7d32; text-align: center; padding: 20px;">✅ No purchase needs at this time!</p>';
  }

  html += '</div></div>';
  return html;
}

/**
 * Helper to build a purchase needs table.
 */
function buildPurchaseTable(title, data, styles) {
  if (!data || data.length === 0) return '';

  var titleBg = '#ffcdd2';
  if (title.indexOf('READY FOR DELIVERY') !== -1) titleBg = '#c8e6c9';
  if (title.indexOf('IN TESTING') !== -1) titleBg = '#bbdefb';
  if (title.indexOf('SIZE UP') !== -1) titleBg = '#ffe0b2';

  var html = '<div style="margin-bottom: 15px;">';
  html += '<div style="background: ' + titleBg + '; padding: 8px 12px; font-weight: bold; border-radius: 4px 4px 0 0;">' + title + '</div>';
  html += '<table style="width: 100%; border-collapse: collapse; font-size: 12px;">';
  html += '<tr style="background: ' + styles.subHeaderBg + ';">';
  html += '<th style="padding: 6px; border: 1px solid #ddd;">Item Type</th>';
  html += '<th style="padding: 6px; border: 1px solid #ddd;">Size</th>';
  html += '<th style="padding: 6px; border: 1px solid #ddd;">Class</th>';
  html += '<th style="padding: 6px; border: 1px solid #ddd;">Qty</th>';
  html += '<th style="padding: 6px; border: 1px solid #ddd;">Status</th>';
  html += '</tr>';

  data.forEach(function(row, idx) {
    var bgColor = idx % 2 === 0 ? '#ffffff' : styles.altRowBg;
    html += '<tr style="background: ' + bgColor + ';">';
    html += '<td style="padding: 6px; border: 1px solid #ddd;">' + row.itemType + '</td>';
    html += '<td style="padding: 6px; border: 1px solid #ddd; text-align: center;">' + row.size + '</td>';
    html += '<td style="padding: 6px; border: 1px solid #ddd; text-align: center;">' + row.classNum + '</td>';
    html += '<td style="padding: 6px; border: 1px solid #ddd; text-align: center; font-weight: bold;">' + row.qty + '</td>';
    html += '<td style="padding: 6px; border: 1px solid #ddd;">' + row.status + '</td>';
    html += '</tr>';
  });

  html += '</table></div>';
  return html;
}

/**
 * Builds the Schedule Calendar section for the email report.
 * Reads the calendar data from the To-Do List sheet (rows 1-9, columns A-G).
 */
function buildScheduleCalendarSection(ss, styles) {
  var sheet = ss.getSheetByName('To Do List');
  if (!sheet || sheet.getLastRow() < 9) {
    return buildEmptySection('📅 Monthly Schedule', 'No schedule calendar available. Run "Generate Smart Schedule" first.', styles);
  }

  var timezone = ss.getSpreadsheetTimeZone();
  var now = new Date();
  var currentMonth = now.getMonth();
  var currentYear = now.getFullYear();
  var todayDate = now.getDate();

  var monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
                    'July', 'August', 'September', 'October', 'November', 'December'];

  var html = '<div style="background: white; border-radius: 8px; margin-bottom: 20px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">';
  html += '<div style="background: #1565c0; color: ' + styles.headerColor + '; padding: 12px 15px; font-weight: bold; font-size: 16px;">📅 ' + monthNames[currentMonth] + ' ' + currentYear + ' Schedule</div>';
  html += '<div style="padding: 15px;">';

  // Read calendar data from sheet (rows 3-9 contain day headers and calendar grid)
  var calendarData = sheet.getRange(3, 1, 7, 7).getDisplayValues();

  // Build calendar HTML table
  html += '<table style="width: 100%; border-collapse: collapse; font-size: 11px; table-layout: fixed;">';

  // Day headers row
  var dayHeaders = calendarData[0];
  html += '<tr>';
  for (var d = 0; d < 7; d++) {
    var dayName = dayHeaders[d] || ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'][d];
    var isWeekend = (d === 0 || d === 6);
    var headerBg = isWeekend ? '#ff9800' : '#42a5f5';
    html += '<th style="padding: 8px; border: 1px solid #ddd; background: ' + headerBg + '; color: white; text-align: center; width: 14.28%;">' + dayName + '</th>';
  }
  html += '</tr>';

  // Calendar weeks (rows 1-6 of calendarData after headers)
  for (var week = 1; week < 7; week++) {
    html += '<tr>';
    for (var day = 0; day < 7; day++) {
      var cellContent = calendarData[week][day] || '';
      var isWeekend = (day === 0 || day === 6);

      // Parse cell content to extract date number and tasks
      var cellLines = cellContent.split('\n');
      var dateNumber = '';
      var tasks = [];

      if (cellLines.length > 0) {
        // First line contains the date number (format: "━━ X ━━")
        var firstLine = cellLines[0];
        var digitPattern = new RegExp('[0-9]+');
        var dateMatch = firstLine.match(digitPattern);
        if (dateMatch) {
          dateNumber = dateMatch[0];
        }

        // Remaining lines are task info
        for (var l = 1; l < cellLines.length; l++) {
          var line = cellLines[l].trim();
          if (line) {
            tasks.push(line);
          }
        }
      }

      // Determine cell styling
      var cellBg = '#ffffff';
      var hasTasks = tasks.length > 0;
      var isToday = (dateNumber && parseInt(dateNumber, 10) === todayDate);

      if (cellContent === '') {
        cellBg = '#f5f5f5'; // Empty cell (other month)
      } else if (isToday) {
        cellBg = '#fff9c4'; // Yellow for today
      } else if (hasTasks) {
        cellBg = isWeekend ? '#ffe0b2' : '#e3f2fd'; // Orange for weekend with tasks, blue for weekday with tasks
      } else if (isWeekend) {
        cellBg = '#fff3e0'; // Light orange for empty weekend
      }

      html += '<td style="padding: 6px; border: 1px solid #ddd; background: ' + cellBg + '; vertical-align: top; height: 70px;">';

      if (dateNumber) {
        var dateStyle = isToday ? 'font-weight: bold; color: #f57c00; font-size: 14px;' : 'font-weight: bold; color: #333; font-size: 12px;';
        html += '<div style="' + dateStyle + '">' + dateNumber + '</div>';

        if (hasTasks) {
          html += '<div style="font-size: 9px; color: #555; margin-top: 4px; line-height: 1.3;">';
          // Show first 3 task lines max
          var maxLines = Math.min(tasks.length, 3);
          for (var t = 0; t < maxLines; t++) {
            var taskLine = tasks[t];
            // Truncate long lines
            if (taskLine.length > 25) {
              taskLine = taskLine.substring(0, 22) + '...';
            }
            html += taskLine + '<br>';
          }
          if (tasks.length > 3) {
            html += '<span style="color: #999;">+' + (tasks.length - 3) + ' more</span>';
          }
          html += '</div>';
        }
      }

      html += '</td>';
    }
    html += '</tr>';
  }

  html += '</table>';

  // Add legend
  html += '<div style="margin-top: 10px; font-size: 10px; color: #666;">';
  html += '<span style="display: inline-block; width: 12px; height: 12px; background: #fff9c4; border: 1px solid #ddd; margin-right: 4px; vertical-align: middle;"></span> Today &nbsp;&nbsp;';
  html += '<span style="display: inline-block; width: 12px; height: 12px; background: #e3f2fd; border: 1px solid #ddd; margin-right: 4px; vertical-align: middle;"></span> Scheduled Tasks &nbsp;&nbsp;';
  html += '<span style="display: inline-block; width: 12px; height: 12px; background: #ffe0b2; border: 1px solid #ddd; margin-right: 4px; vertical-align: middle;"></span> Weekend Tasks';
  html += '</div>';

  html += '</div></div>';
  return html;
}

/**
 * Builds the To-Do List section of the email.
 */
function buildToDoListSection(ss, styles) {
  var sheet = ss.getSheetByName('To Do List');
  if (!sheet || sheet.getLastRow() < 4) {
    return buildEmptySection('📋 To-Do List', 'No tasks in the to-do list.', styles);
  }

  var html = '<div style="background: white; border-radius: 8px; margin-bottom: 20px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">';
  html += '<div style="background: #7b1fa2; color: ' + styles.headerColor + '; padding: 12px 15px; font-weight: bold; font-size: 16px;">📋 To-Do List</div>';
  html += '<div style="padding: 15px;">';

  var data = sheet.getDataRange().getDisplayValues();
  var currentLocation = '';
  var tasks = [];

  // Start from row 4 (index 3) to skip headers
  for (var i = 3; i < data.length; i++) {
    var row = data[i];
    var firstCell = (row[0] || '').toString().trim();
    var taskType = (row[2] || '').toString().trim();

    // Check for location headers
    if (taskType === '' && row[1] === '' && (firstCell.indexOf('📍') !== -1 || (row[0] === '' && data[i].join('').indexOf('📍') !== -1))) {
      // This is a location header row
      var locationCell = data[i].find(function(cell) { return cell && cell.toString().indexOf('📍') !== -1; });
      if (locationCell) {
        currentLocation = locationCell.toString().replace('📍', '').trim();
      }
      continue;
    }

    // Skip empty rows or non-task rows
    if (!taskType || taskType === 'Task Type') continue;

    var isDone = firstCell === 'TRUE' || firstCell === true || row[0] === true;

    tasks.push({
      done: isDone,
      priority: row[1] || '',
      taskType: taskType,
      employee: row[3] || '',
      location: row[4] || currentLocation,
      currentItem: row[5] || '',
      pickList: row[6] || '',
      itemType: row[7] || '',
      classNum: row[8] || '',
      dueDate: row[10] || '',
      status: row[11] || ''
    });
  }

  if (tasks.length === 0) {
    html += '<p style="color: #2e7d32; text-align: center; padding: 20px;">✅ No tasks to complete!</p>';
  } else {
    // Group by location
    var locations = {};
    tasks.forEach(function(task) {
      var loc = task.location || 'Unknown';
      if (!locations[loc]) locations[loc] = [];
      locations[loc].push(task);
    });

    Object.keys(locations).sort().forEach(function(loc) {
      html += '<div style="margin-bottom: 15px;">';
      html += '<div style="background: #e8eaf6; padding: 8px 12px; font-weight: bold; color: #3949ab; border-radius: 4px 4px 0 0;">📍 ' + loc + '</div>';
      html += '<table style="width: 100%; border-collapse: collapse; font-size: 12px;">';
      html += '<tr style="background: ' + styles.subHeaderBg + ';">';
      html += '<th style="padding: 6px; border: 1px solid #ddd; width: 30px;">✓</th>';
      html += '<th style="padding: 6px; border: 1px solid #ddd;">Task</th>';
      html += '<th style="padding: 6px; border: 1px solid #ddd;">Employee</th>';
      html += '<th style="padding: 6px; border: 1px solid #ddd;">Item</th>';
      html += '<th style="padding: 6px; border: 1px solid #ddd;">Pick List</th>';
      html += '<th style="padding: 6px; border: 1px solid #ddd;">Status</th>';
      html += '</tr>';

      locations[loc].forEach(function(task, idx) {
        var bgColor = task.done ? '#e8f5e9' : (idx % 2 === 0 ? '#ffffff' : styles.altRowBg);
        var textDecor = task.done ? 'line-through' : 'none';
        var checkMark = task.done ? '☑' : '☐';

        html += '<tr style="background: ' + bgColor + '; text-decoration: ' + textDecor + ';">';
        html += '<td style="padding: 6px; border: 1px solid #ddd; text-align: center;">' + checkMark + '</td>';
        html += '<td style="padding: 6px; border: 1px solid #ddd;">' + task.taskType + '</td>';
        html += '<td style="padding: 6px; border: 1px solid #ddd;">' + task.employee + '</td>';
        html += '<td style="padding: 6px; border: 1px solid #ddd;">' + task.currentItem + '</td>';
        html += '<td style="padding: 6px; border: 1px solid #ddd;">' + task.pickList + '</td>';
        html += '<td style="padding: 6px; border: 1px solid #ddd;">' + task.status + '</td>';
        html += '</tr>';
      });

      html += '</table></div>';
    });
  }

  html += '</div></div>';
  return html;
}

/**
 * Builds a Swaps section (Glove or Sleeve) of the email.
 */
function buildSwapsSection(ss, sheetName, styles) {
  var sheet = ss.getSheetByName(sheetName);
  var icon = sheetName === 'Glove Swaps' ? '🧤' : '💪';
  var headerBg = sheetName === 'Glove Swaps' ? '#2e7d32' : '#00695c';

  if (!sheet || sheet.getLastRow() < 2) {
    return buildEmptySection(icon + ' ' + sheetName, 'No swaps data available.', styles);
  }

  var html = '<div style="background: white; border-radius: 8px; margin-bottom: 20px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">';
  html += '<div style="background: ' + headerBg + '; color: ' + styles.headerColor + '; padding: 12px 15px; font-weight: bold; font-size: 16px;">' + icon + ' ' + sheetName + '</div>';
  html += '<div style="padding: 15px;">';

  var data = sheet.getDataRange().getDisplayValues();
  var currentClass = '';
  var currentLocation = '';
  var swapsByClass = {};

  for (var i = 0; i < data.length; i++) {
    var row = data[i];
    var firstCell = (row[0] || '').toString().trim();

    // Check for class headers
    if (firstCell.indexOf('Class') !== -1 && firstCell.indexOf('Swaps') !== -1) {
      currentClass = firstCell;
      if (!swapsByClass[currentClass]) {
        swapsByClass[currentClass] = { locations: {} };
      }
      continue;
    }

    // Check for location sub-headers
    if (firstCell.indexOf('📍') !== -1) {
      currentLocation = firstCell.replace('📍', '').trim();
      continue;
    }

    // Skip stage headers and column headers
    if (firstCell === 'Employee' || firstCell.indexOf('STAGE') !== -1 ||
        firstCell.indexOf('Pick List') !== -1 || !firstCell) continue;

    // This is a data row
    if (currentClass && firstCell) {
      var loc = currentLocation || 'Unknown';
      if (!swapsByClass[currentClass].locations[loc]) {
        swapsByClass[currentClass].locations[loc] = [];
      }

      swapsByClass[currentClass].locations[loc].push({
        employee: firstCell,
        itemNum: row[1] || '',
        size: row[2] || '',
        dateAssigned: row[3] || '',
        changeOutDate: row[4] || '',
        daysLeft: row[5] || '',
        pickList: row[6] || '',
        status: row[7] || ''
      });
    }
  }

  // Render the tables
  var hasData = false;
  Object.keys(swapsByClass).forEach(function(classHeader) {
    var classData = swapsByClass[classHeader];
    var locationKeys = Object.keys(classData.locations);

    if (locationKeys.length === 0) return;
    hasData = true;

    html += '<div style="margin-bottom: 15px;">';
    html += '<div style="background: ' + styles.subHeaderBg + '; padding: 8px 12px; font-weight: bold; border-radius: 4px 4px 0 0;">' + classHeader + '</div>';

    locationKeys.forEach(function(loc) {
      var swaps = classData.locations[loc];
      if (swaps.length === 0) return;

      html += '<div style="background: #e3f2fd; padding: 6px 12px; font-weight: bold; font-size: 12px; color: #1565c0;">📍 ' + loc + '</div>';
      html += '<table style="width: 100%; border-collapse: collapse; font-size: 11px;">';
      html += '<tr style="background: #e0e0e0;">';
      html += '<th style="padding: 5px; border: 1px solid #ddd;">Employee</th>';
      html += '<th style="padding: 5px; border: 1px solid #ddd;">Item #</th>';
      html += '<th style="padding: 5px; border: 1px solid #ddd;">Size</th>';
      html += '<th style="padding: 5px; border: 1px solid #ddd;">Change Out</th>';
      html += '<th style="padding: 5px; border: 1px solid #ddd;">Days Left</th>';
      html += '<th style="padding: 5px; border: 1px solid #ddd;">Pick List</th>';
      html += '<th style="padding: 5px; border: 1px solid #ddd;">Status</th>';
      html += '</tr>';

      swaps.forEach(function(swap, idx) {
        var bgColor = idx % 2 === 0 ? '#ffffff' : styles.altRowBg;
        var daysLeftColor = '#333';
        var daysNum = parseInt(swap.daysLeft, 10);
        if (!isNaN(daysNum)) {
          if (daysNum < 0) {
            bgColor = styles.urgentBg;
            daysLeftColor = styles.urgentColor;
          } else if (daysNum <= 14) {
            bgColor = styles.warningBg;
            daysLeftColor = styles.warningColor;
          }
        }

        html += '<tr style="background: ' + bgColor + ';">';
        html += '<td style="padding: 5px; border: 1px solid #ddd;">' + swap.employee + '</td>';
        html += '<td style="padding: 5px; border: 1px solid #ddd; text-align: center;">' + swap.itemNum + '</td>';
        html += '<td style="padding: 5px; border: 1px solid #ddd; text-align: center;">' + swap.size + '</td>';
        html += '<td style="padding: 5px; border: 1px solid #ddd; text-align: center;">' + swap.changeOutDate + '</td>';
        html += '<td style="padding: 5px; border: 1px solid #ddd; text-align: center; color: ' + daysLeftColor + '; font-weight: bold;">' + swap.daysLeft + '</td>';
        html += '<td style="padding: 5px; border: 1px solid #ddd; text-align: center;">' + swap.pickList + '</td>';
        html += '<td style="padding: 5px; border: 1px solid #ddd;">' + swap.status + '</td>';
        html += '</tr>';
      });

      html += '</table>';
    });

    html += '</div>';
  });

  if (!hasData) {
    html += '<p style="color: #2e7d32; text-align: center; padding: 20px;">✅ No swaps needed!</p>';
  }

  html += '</div></div>';
  return html;
}

/**
 * Builds the Reclaims section of the email.
 */
function buildReclaimsSection(ss, styles) {
  var sheet = ss.getSheetByName('Reclaims');
  if (!sheet || sheet.getLastRow() < 2) {
    return buildEmptySection('🔄 Reclaims', 'No reclaims data available.', styles);
  }

  var html = '<div style="background: white; border-radius: 8px; margin-bottom: 20px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">';
  html += '<div style="background: #e65100; color: ' + styles.headerColor + '; padding: 12px 15px; font-weight: bold; font-size: 16px;">🔄 Reclaims</div>';
  html += '<div style="padding: 15px;">';

  var data = sheet.getDataRange().getDisplayValues();
  var currentSection = '';
  var sectionData = [];
  var sections = {};

  for (var i = 0; i < data.length; i++) {
    var row = data[i];
    var firstCell = (row[0] || '').toString().trim();

    // Check for section headers
    if (firstCell.indexOf('Previous Employee') !== -1 ||
        firstCell.indexOf('Approved Class') !== -1 ||
        firstCell.indexOf('Class 3 Reclaims') !== -1 ||
        firstCell.indexOf('Class 2 Reclaims') !== -1 ||
        firstCell.indexOf('Lost Items') !== -1) {
      currentSection = firstCell;
      sections[currentSection] = [];
      continue;
    }

    // Skip headers and empty rows
    if (!firstCell || firstCell === 'Item Type' || firstCell === 'Employee' ||
        firstCell === 'Location' || firstCell.indexOf('📍') !== -1) continue;

    // Add data to current section
    if (currentSection && sections[currentSection]) {
      sections[currentSection].push(row);
    }
  }

  // Render Previous Employee Reclaims
  if (sections['Previous Employee Reclaims'] && sections['Previous Employee Reclaims'].length > 0) {
    html += buildReclaimsTable('⚠️ Previous Employee Reclaims', sections['Previous Employee Reclaims'],
      ['Item Type', 'Item #', 'Size', 'Class', 'Location', 'Status', 'Assigned To'], styles, '#ffcdd2');
  }

  // Render Class 3 Reclaims (if exists)
  Object.keys(sections).forEach(function(sectionName) {
    if (sectionName.indexOf('Class 3 Reclaims') !== -1 && sections[sectionName].length > 0) {
      html += buildReclaimsTable('⚠️ ' + sectionName, sections[sectionName],
        ['Employee', 'Item Type', 'Item #', 'Size', 'Class', 'Location', 'Pick List', 'Status'], styles, '#ffe0b2');
    }
    if (sectionName.indexOf('Class 2 Reclaims') !== -1 && sections[sectionName].length > 0) {
      html += buildReclaimsTable('⚠️ ' + sectionName, sections[sectionName],
        ['Employee', 'Item Type', 'Item #', 'Size', 'Class', 'Location', 'Pick List', 'Status'], styles, '#fff3e0');
    }
  });

  // Render Lost Items
  if (sections['Lost Items To Reclaim'] && sections['Lost Items To Reclaim'].length > 0) {
    html += buildReclaimsTable('❌ Lost Items To Reclaim', sections['Lost Items To Reclaim'],
      ['Employee', 'Item Type', 'Item #', 'Size', 'Class', 'Location', 'Pick List', 'Status'], styles, '#ffcdd2');
  }

  var hasContent = Object.keys(sections).some(function(k) {
    return sections[k] && sections[k].length > 0 && k !== 'Approved Class 3 Locations';
  });

  if (!hasContent) {
    html += '<p style="color: #2e7d32; text-align: center; padding: 20px;">✅ No reclaims needed!</p>';
  }

  html += '</div></div>';
  return html;
}

/**
 * Helper to build a reclaims table.
 */
function buildReclaimsTable(title, data, headers, styles, titleBg) {
  if (!data || data.length === 0) return '';

  var html = '<div style="margin-bottom: 15px;">';
  html += '<div style="background: ' + titleBg + '; padding: 8px 12px; font-weight: bold; border-radius: 4px 4px 0 0;">' + title + '</div>';
  html += '<table style="width: 100%; border-collapse: collapse; font-size: 11px;">';
  html += '<tr style="background: ' + styles.subHeaderBg + ';">';

  headers.forEach(function(h) {
    html += '<th style="padding: 5px; border: 1px solid #ddd;">' + h + '</th>';
  });
  html += '</tr>';

  data.forEach(function(row, idx) {
    var bgColor = idx % 2 === 0 ? '#ffffff' : styles.altRowBg;
    html += '<tr style="background: ' + bgColor + ';">';
    for (var c = 0; c < headers.length && c < row.length; c++) {
      html += '<td style="padding: 5px; border: 1px solid #ddd;">' + (row[c] || '') + '</td>';
    }
    html += '</tr>';
  });

  html += '</table></div>';
  return html;
}

/**
 * Helper to build an empty section placeholder.
 */
function buildEmptySection(title, message, styles) {
  var html = '<div style="background: white; border-radius: 8px; margin-bottom: 20px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">';
  html += '<div style="background: ' + styles.headerBg + '; color: ' + styles.headerColor + '; padding: 12px 15px; font-weight: bold; font-size: 16px;">' + title + '</div>';
  html += '<div style="padding: 20px; text-align: center; color: #666;">' + message + '</div>';
  html += '</div>';
  return html;
}

/**
 * Sends the weekly email report to all notification recipients.
 * Silently skips if no recipients are configured.
 */
function sendEmailReport() {
  try {
    var recipients = getNotificationRecipients();

    // If no recipients, show helpful message when called manually
    if (!recipients || recipients.length === 0) {
      logEvent('sendEmailReport: No notification recipients configured, skipping email.');
      try {
        SpreadsheetApp.getUi().alert('ℹ️ No Recipients Configured\n\nTo send email reports, add email addresses to the "Notification Emails" column (F) in the Employees sheet.');
      } catch (e) {
        // Ignore UI error if running from trigger - silently skip
      }
      return;
    }

    logEvent('Sending email report to ' + recipients.length + ' recipient(s)...');

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var timezone = ss.getSpreadsheetTimeZone();
    var now = new Date();
    var dateStr = Utilities.formatDate(now, timezone, 'MM/dd/yyyy');

    var subject = 'Rubber Tracker Weekly Report - ' + dateStr;
    var htmlBody = buildEmailReportHtml();

    // Send to all recipients
    recipients.forEach(function(email) {
      try {
        MailApp.sendEmail({
          to: email,
          subject: subject,
          htmlBody: htmlBody
        });
        logEvent('Email report sent to: ' + email);
      } catch (emailError) {
        logEvent('Failed to send email to ' + email + ': ' + emailError, 'ERROR');
      }
    });

    logEvent('Email report sending completed.');

    // Show confirmation if called manually (not from trigger)
    try {
      SpreadsheetApp.getUi().alert('✅ Email Report Sent!\n\nReport sent to ' + recipients.length + ' recipient(s):\n' + recipients.join('\n'));
    } catch (e) {
      // Ignore UI error if running from trigger
    }

  } catch (e) {
    logEvent('Error in sendEmailReport: ' + e, 'ERROR');
    throw e;
  }
}

/**
 * Creates a weekly time-driven trigger to send email reports on Monday at 12 PM.
 */
function createWeeklyEmailTrigger() {
  try {
    // Remove any existing email report triggers first
    removeEmailTrigger(true);  // silent mode

    // Create new weekly trigger for Monday at 12 PM
    ScriptApp.newTrigger('sendEmailReport')
      .timeBased()
      .onWeekDay(ScriptApp.WeekDay.MONDAY)
      .atHour(12)
      .create();

    logEvent('Weekly email report trigger created for Monday at 12 PM');
    SpreadsheetApp.getUi().alert('✅ Weekly Email Scheduled!\n\nEmail reports will be sent every Monday at 12 PM.\n\nMake sure to add email addresses in the "Notification Emails" column of the Employees sheet.');

  } catch (e) {
    logEvent('Error creating weekly email trigger: ' + e, 'ERROR');
    SpreadsheetApp.getUi().alert('❌ Error setting up weekly email: ' + e);
  }
}

/**
 * Removes the weekly email report trigger.
 * @param {boolean} silent - If true, don't show UI alerts
 */
function removeEmailTrigger(silent) {
  try {
    var triggers = ScriptApp.getProjectTriggers();
    var removed = 0;

    triggers.forEach(function(trigger) {
      if (trigger.getHandlerFunction() === 'sendEmailReport') {
        ScriptApp.deleteTrigger(trigger);
        removed++;
      }
    });

    if (removed > 0) {
      logEvent('Removed ' + removed + ' email report trigger(s)');
    }

    if (!silent) {
      if (removed > 0) {
        SpreadsheetApp.getUi().alert('✅ Scheduled Email Removed\n\nThe weekly email report has been disabled.');
      } else {
        SpreadsheetApp.getUi().alert('ℹ️ No Scheduled Email Found\n\nThere was no weekly email report scheduled.');
      }
    }

  } catch (e) {
    logEvent('Error removing email trigger: ' + e, 'ERROR');
    if (!silent) {
      SpreadsheetApp.getUi().alert('❌ Error removing scheduled email: ' + e);
    }
  }
}


/**
 * Cleans up incorrect Safety Report tasks from Task Metadata and Manual Tasks.
 * These were accidentally created as "Manual Tasks" with descriptions containing
 * Wipers, Brakes, Misc Comment, Defrost, Heater, etc.
 *
 * Menu: Glove Manager → Utilities → 🧹 Cleanup Incorrect Safety Tasks
 */
function cleanupIncorrectSafetyReportTasks() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var ui = SpreadsheetApp.getUi();

  // Patterns to match for incorrect safety report tasks
  var incorrectPatterns = [
    /wipers/i,
    /brakes/i,
    /misc\s*comment/i,
    /defrost/i,
    /heater/i,
    /reflectors/i,
    /warning\s*lights/i,
    /mirrors/i,
    /windshield/i,
    /windows/i,
    /seat\s*belts/i,
    /horn\s*-/i,
    /lights\s*-\s*(no|yes)/i
  ];

  function matchesIncorrectPattern(text) {
    if (!text) return false;
    var str = String(text);
    for (var p = 0; p < incorrectPatterns.length; p++) {
      if (incorrectPatterns[p].test(str)) {
        return true;
      }
    }
    return false;
  }

  var totalDeleted = 0;
  var taskMetaDeleted = 0;
  var manualTasksDeleted = 0;

  // Clean up Task Metadata sheet
  var taskMetaSheet = ss.getSheetByName('Task Metadata');
  if (taskMetaSheet && taskMetaSheet.getLastRow() > 1) {
    var data = taskMetaSheet.getDataRange().getValues();
    var headers = data[0];

    // Find column indices
    var taskTypeCol = -1, currentItemCol = -1, sourceSheetCol = -1;
    for (var h = 0; h < headers.length; h++) {
      var header = String(headers[h]).toLowerCase().trim();
      if (header === 'tasktype') taskTypeCol = h;
      if (header === 'currentitem') currentItemCol = h;
      if (header === 'sourcesheet') sourceSheetCol = h;
    }

    var rowsToDelete = [];

    // Find rows to delete (skip header row)
    for (var i = 1; i < data.length; i++) {
      var taskType = String(data[i][taskTypeCol] || '');
      var currentItem = String(data[i][currentItemCol] || '');
      var sourceSheet = String(data[i][sourceSheetCol] || '');

      // Check if this looks like an incorrect safety report task
      if (sourceSheet === 'Manual Tasks') {
        if (matchesIncorrectPattern(taskType) || matchesIncorrectPattern(currentItem)) {
          rowsToDelete.push(i + 1); // 1-based row number
          Logger.log('Task Metadata - will delete row ' + (i + 1) + ': ' + taskType + ' | ' + currentItem);
        }
      }
    }

    // Delete rows from bottom to top
    rowsToDelete.sort(function(a, b) { return b - a; });
    for (var r = 0; r < rowsToDelete.length; r++) {
      taskMetaSheet.deleteRow(rowsToDelete[r]);
      taskMetaDeleted++;
    }
  }

  // Clean up Manual Tasks sheet
  var manualSheet = ss.getSheetByName('Manual Tasks');
  if (manualSheet && manualSheet.getLastRow() > 1) {
    var manualData = manualSheet.getDataRange().getValues();
    var manualHeaders = manualData[0];

    // Find task type column (column C or "Task Type")
    var taskTypeColManual = 2; // Default column C
    for (var mh = 0; mh < manualHeaders.length; mh++) {
      var mheader = String(manualHeaders[mh]).toLowerCase().trim();
      if (mheader === 'task' || mheader === 'task type') {
        taskTypeColManual = mh;
        break;
      }
    }

    var manualRowsToDelete = [];

    for (var mi = 1; mi < manualData.length; mi++) {
      var mTaskType = String(manualData[mi][taskTypeColManual] || '');

      if (matchesIncorrectPattern(mTaskType)) {
        manualRowsToDelete.push(mi + 1);
        Logger.log('Manual Tasks - will delete row ' + (mi + 1) + ': ' + mTaskType);
      }
    }

    // Delete rows from bottom to top
    manualRowsToDelete.sort(function(a, b) { return b - a; });
    for (var mr = 0; mr < manualRowsToDelete.length; mr++) {
      manualSheet.deleteRow(manualRowsToDelete[mr]);
      manualTasksDeleted++;
    }
  }

  totalDeleted = taskMetaDeleted + manualTasksDeleted;

  if (totalDeleted === 0) {
    ui.alert('✅ No Cleanup Needed', 'No incorrect safety report tasks found to clean up.', ui.ButtonSet.OK);
  } else {
    ui.alert('✅ Cleanup Complete',
      'Deleted ' + totalDeleted + ' incorrect task(s):\n\n' +
      '• Task Metadata: ' + taskMetaDeleted + ' row(s)\n' +
      '• Manual Tasks: ' + manualTasksDeleted + ' row(s)\n\n' +
      'These were vehicle maintenance items (Wipers, Brakes, Defrost, etc.) that were incorrectly added as tasks.',
      ui.ButtonSet.OK);
  }

  Logger.log('cleanupIncorrectSafetyReportTasks: Deleted ' + totalDeleted + ' rows total');
}

/**
 * Fixes Safety Compliance tasks that have columns shifted incorrectly.
 * These tasks have TaskType containing "JHA" or "Weekly Meeting" instead of "Missing Safety Report".
 * The fix is to delete them and regenerate.
 * Menu item: Glove Manager → Utilities → Fix Shifted Safety Tasks
 */
function fixShiftedSafetyComplianceTasks() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var ui = SpreadsheetApp.getUi();

  var taskMetaSheet = ss.getSheetByName('Task Metadata');
  if (!taskMetaSheet || taskMetaSheet.getLastRow() < 2) {
    ui.alert('No Task Metadata Found', 'Task Metadata sheet is empty or missing.', ui.ButtonSet.OK);
    return;
  }

  var data = taskMetaSheet.getDataRange().getValues();
  var headers = data[0];

  // Find column indices
  var colIdx = {};
  for (var h = 0; h < headers.length; h++) {
    var header = String(headers[h]).toLowerCase().trim();
    if (header === 'taskid') colIdx.taskID = h;
    if (header === 'sourcesheet') colIdx.sourceSheet = h;
    if (header === 'tasktype') colIdx.taskType = h;
    if (header === 'itemtype') colIdx.itemType = h;
  }

  // Patterns that indicate shifted columns (these should be in ItemType, not TaskType)
  var shiftedPatterns = ['JHA', 'Weekly Meeting', 'JHA + Weekly Meeting', 'Monthly Checklist'];

  var rowsToDelete = [];

  for (var i = 1; i < data.length; i++) {
    var taskType = String(data[i][colIdx.taskType] || '').trim();
    var sourceSheet = String(data[i][colIdx.sourceSheet] || '').trim();

    // Check if TaskType contains values that should be in ItemType
    if (sourceSheet === 'Safety Compliance' ||
        shiftedPatterns.indexOf(taskType) !== -1) {
      // This is a shifted Safety Compliance task
      if (taskType !== 'Missing Safety Report') {
        rowsToDelete.push(i + 1); // 1-based
        Logger.log('Will delete row ' + (i + 1) + ': TaskType="' + taskType + '" (should be "Missing Safety Report")');
      }
    }
  }

  if (rowsToDelete.length === 0) {
    ui.alert('✅ No Shifted Tasks Found',
      'All Safety Compliance tasks have correct column structure.\n\n' +
      'If you still see JHA/Weekly Meeting in the debug, they might be from a different source.',
      ui.ButtonSet.OK);
    return;
  }

  // Confirm deletion
  var response = ui.alert('Fix Shifted Safety Tasks',
    'Found ' + rowsToDelete.length + ' task(s) with incorrect column structure.\n\n' +
    'These tasks will be deleted. You can regenerate them by:\n' +
    '1. Process Safety Emails\n' +
    '2. Or: Regenerate Previous Week Tasks\n\n' +
    'Continue?',
    ui.ButtonSet.YES_NO);

  if (response !== ui.Button.YES) {
    return;
  }

  // Delete rows from bottom to top
  rowsToDelete.sort(function(a, b) { return b - a; });
  for (var r = 0; r < rowsToDelete.length; r++) {
    taskMetaSheet.deleteRow(rowsToDelete[r]);
  }

  ui.alert('✅ Cleanup Complete',
    'Deleted ' + rowsToDelete.length + ' shifted task(s).\n\n' +
    'To regenerate these tasks correctly:\n' +
    '• Menu → Safety Reports → Regenerate Previous Week Tasks',
    ui.ButtonSet.OK);

  Logger.log('fixShiftedSafetyComplianceTasks: Deleted ' + rowsToDelete.length + ' rows');
}


