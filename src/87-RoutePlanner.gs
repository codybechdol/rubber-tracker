/**
 * Glove Manager – Smart Route Optimizer (Phase 2B)
 *
 * Analyzes pending tasks, groups by location/direction from Helena,
 * and suggests optimal multi-day trip plans with scheduling constraints.
 *
 * Constraints:
 * - 10-hour workdays (7am - 5pm)
 * - Monday-Thursday preferred, Friday only if necessary
 * - Tuesday nights: MUST return to Helena
 * - Overnight stays OK on Mon/Wed/Thu if saves significant time
 *
 * Phase 6 Update: Now uses Task Metadata as single source of truth.
 */

/* global getDriveTimeMap, calculateDriveTimeBetween, collectAndGroupTasks, getTasksWithMetadata */
/* eslint-disable no-unused-vars */

// ============================================================================
// CONSTANTS
// ============================================================================

var WORK_START_HOUR = 7;  // 7am
var WORK_END_HOUR = 17;   // 5pm
var MAX_WORK_MINUTES = 600; // 10 hours

// Urgency scoring
var URGENCY_OVERDUE = 100;
var URGENCY_3_DAYS = 80;
var URGENCY_THIS_WEEK = 50;
var URGENCY_NEXT_WEEK = 20;
var URGENCY_LATER = 10;

// Crew time calculation
var CREW_BASE_TIME = 15;  // 15 min base per location
var CREW_PER_TASK = 10;   // 10 min per task

// Non-field locations (office/phone work only - excluded from trip planning)
// Note: Helena is NOT included here - Helena crews need field visits for training/swaps
var OFFICE_ONLY_LOCATIONS = [
  'weeds',            // Employees waiting for job to start (phone work only)
  'previous employee',// No longer with company
  'light duty',       // Office-based employees
  'vacation',         // On vacation
  'leave',            // On leave
  'unknown'           // Unknown location
];

// Day name lookup
var DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/**
 * Gets the day name from a day-of-week number (0-6).
 * @param {number} dayOfWeek - Day of week (0 = Sunday, 6 = Saturday)
 * @return {string} Day name (e.g., "Monday")
 */
function getDayName(dayOfWeek) {
  return DAY_NAMES[dayOfWeek] || 'Unknown';
}

/**
 * Formats a date as YYYY-MM-DD for use as object key.
 * Local implementation to avoid cross-file dependency.
 */
function formatDateKeyForRoute(date) {
  return date.getFullYear() + '-' +
         String(date.getMonth() + 1).padStart(2, '0') + '-' +
         String(date.getDate()).padStart(2, '0');
}

/**
 * Formats a date for display (e.g., "01/15/2026").
 * Local implementation to avoid cross-file dependency.
 */
function formatDateForDisplayRoute(date) {
  if (!(date instanceof Date) || isNaN(date.getTime())) return '';
  return String(date.getMonth() + 1).padStart(2, '0') + '/' +
         String(date.getDate()).padStart(2, '0') + '/' +
         date.getFullYear();
}

// ============================================================================
// DIALOG FUNCTION
// ============================================================================

/**
 * Shows the Trip Planner dialog.
 * Menu item: Glove Manager → Schedule → 🗺️ Trip Planner
 */
function showTripPlannerDialog() {
  var html = HtmlService.createHtmlOutputFromFile('TripPlanner')
    .setWidth(1100)
    .setHeight(750)
    .setTitle('Trip Planner');
  SpreadsheetApp.getUi().showModalDialog(html, '🗺️ Trip Planner');
}

/**
 * Gets stats for the Schedule Hub dialog.
 * Returns task counts, trip info, and location counts.
 *
 * @return {Object} Stats object with tasks, trips, locations, overdue counts
 */
function getScheduleHubStats() {
  var stats = {
    pendingTasks: 0,
    plannedTrips: 0,
    locations: 0,
    overdue: 0
  };

  try {
    // Get pending tasks - returns object with tasks array, not array directly
    var result = getPendingTasksWithLocations();

    // Check for error
    if (result.error) {
      Logger.log('getScheduleHubStats: Error from getPendingTasksWithLocations: ' + result.error);
      return stats;
    }

    var tasks = result.tasks || [];
    if (tasks.length > 0) {
      stats.pendingTasks = tasks.length;

      // Count overdue
      var now = new Date();
      for (var i = 0; i < tasks.length; i++) {
        if (tasks[i].dueDate) {
          var dueDate = new Date(tasks[i].dueDate);
          if (dueDate < now) {
            stats.overdue++;
          }
        }
      }

      // Count unique locations from byLocation object (more efficient)
      stats.locations = Object.keys(result.byLocation || {}).length;
    }

    // Get saved trip plan to count planned trip days
    var savedPlan = loadTripPlan();
    if (savedPlan && savedPlan.workDays) {
      // Count days that have locations assigned (workDays with assignedLocations)
      for (var d = 0; d < savedPlan.workDays.length; d++) {
        var day = savedPlan.workDays[d];
        if (day.assignedLocations && day.assignedLocations.length > 0) {
          stats.plannedTrips++;
        }
      }
    }
  } catch (e) {
    Logger.log('Error getting schedule hub stats: ' + e);
  }

  return stats;
}

// ============================================================================
// LOCATION DIRECTION GROUPS
// ============================================================================

/**
 * Gets location direction groups from Helena.
 * Used to identify locations that can be combined into same-direction trips.
 *
 * @return {Object} Map of direction name to array of locations
 */
function getLocationDirectionGroups() {
  return {
    'East/Southeast': ['bozeman', 'livingston', 'big sky', 'ennis'],
    'North': ['great falls', 'stanford'],
    'West': ['missoula', 'lolo'],
    'Southwest': ['butte'],
    'Far': ['kalispell', 'billings', 'south dakota', 'california', 'northern lights', 'sidney', 'glendive', 'miles city']
  };
}

/**
 * Gets the direction for a given location.
 *
 * @param {string} location - Location name
 * @return {string} Direction name or 'Local' for Helena
 */
function getLocationDirection(location) {
  if (!location) return 'Unknown';

  var loc = location.toLowerCase().trim();
  if (loc === 'helena' || loc === 'office') return 'Local';

  var groups = getLocationDirectionGroups();
  for (var direction in groups) {
    if (groups[direction].indexOf(loc) !== -1) {
      return direction;
    }
  }

  return 'Other';
}

/**
 * Gets common overnight cities for the dropdown.
 *
 * @return {Array} Array of city names
 */
function getOvernightCities() {
  return [
    'Bozeman',
    'Billings',
    'Great Falls',
    'Missoula',
    'Butte',
    'Livingston',
    'Kalispell'
  ];
}

/**
 * Saves the current trip plan to User Properties for persistence.
 * Called from TripPlanner.html when user clicks "Save Plan".
 *
 * @param {Object} plan - The trip plan to save
 * @return {Object} Result with success status
 */
function saveTripPlan(plan) {
  try {
    var userProps = PropertiesService.getUserProperties();
    plan.savedDate = new Date().toISOString();
    userProps.setProperty('tripPlan', JSON.stringify(plan));
    Logger.log('Saved trip plan with ' + (plan.workDays ? plan.workDays.length : 0) + ' work days');
    return { success: true };
  } catch (e) {
    Logger.log('Error saving trip plan: ' + e.toString());
    return { success: false, error: e.toString() };
  }
}

/**
 * Loads the saved trip plan from User Properties.
 * Called from TripPlanner.html on initialization.
 *
 * @return {Object|null} The saved trip plan or null if none exists
 */
function loadTripPlan() {
  try {
    var userProps = PropertiesService.getUserProperties();
    var planJson = userProps.getProperty('tripPlan');
    if (planJson) {
      var plan = JSON.parse(planJson);
      Logger.log('Loaded saved trip plan from ' + (plan.savedDate || 'unknown date'));
      return plan;
    }
    return null;
  } catch (e) {
    Logger.log('Error loading trip plan: ' + e.toString());
    return null;
  }
}

/**
 * Clears the saved trip plan.
 * Called when user wants to start fresh.
 *
 * @return {Object} Result with success status
 */
function clearTripPlan() {
  try {
    var userProps = PropertiesService.getUserProperties();
    userProps.deleteProperty('tripPlan');
    Logger.log('Cleared saved trip plan');
    return { success: true };
  } catch (e) {
    Logger.log('Error clearing trip plan: ' + e.toString());
    return { success: false, error: e.toString() };
  }
}

// ============================================================================
// PENDING TASKS COLLECTION
// ============================================================================

/**
 * Gets manual tasks from Manual Tasks sheet with their flexibility options.
 * These tasks take priority in scheduling and respect their date/time constraints.
 *
 * @return {Object} Manual tasks grouped by date with flexibility info
 */
function getManualTasksWithFlexibility() {
  Logger.log('=== getManualTasksWithFlexibility ===');

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var manualSheet = ss.getSheetByName('Manual Tasks');

  var result = {
    tasks: [],
    byDate: {},
    lockedTasks: [],
    flexibleTasks: []
  };

  if (!manualSheet || manualSheet.getLastRow() < 2) {
    Logger.log('No Manual Tasks sheet or no data');
    return result;
  }

  var data = manualSheet.getDataRange().getValues();
  var headers = data[0];

  // Find column indices
  var colIndex = {};
  for (var h = 0; h < headers.length; h++) {
    var header = String(headers[h]).toLowerCase().trim();
    if (header === 'location') colIndex.location = h;
    if (header === 'priority') colIndex.priority = h;
    if (header === 'task' || header === 'task type') colIndex.taskType = h;
    if (header === 'employee') colIndex.employee = h;
    if (header === 'scheduled date') colIndex.scheduledDate = h;
    if (header === 'start time') colIndex.startTime = h;
    if (header === 'end time') colIndex.endTime = h;
    if (header === 'status') colIndex.status = h;
    if (header === 'notes') colIndex.notes = h;
    if (header === 'allow day change') colIndex.allowDayChange = h;
    if (header === 'allow week change') colIndex.allowWeekChange = h;
    if (header === 'allow time change') colIndex.allowTimeChange = h;
    if (header === 'locked') colIndex.locked = h;
  }

  Logger.log('Manual Tasks column indices: ' + JSON.stringify(colIndex));

  var today = new Date();
  today.setHours(0, 0, 0, 0);

  for (var i = 1; i < data.length; i++) {
    var row = data[i];

    var location = colIndex.location !== undefined ? String(row[colIndex.location] || '').trim() : '';
    var status = colIndex.status !== undefined ? String(row[colIndex.status] || '').toLowerCase() : 'pending';
    var taskType = colIndex.taskType !== undefined ? String(row[colIndex.taskType] || '').trim() : '';

    // Skip empty or completed tasks
    if (!location || status === 'completed' || status === 'done') {
      continue;
    }

    // Skip combined trip entries (created by "Apply to Schedule")
    // These have "+" in location (e.g., "Billings + Livingston") OR
    // taskType starts with "🗺️ Trip:" prefix
    if (location.indexOf(' + ') !== -1 || taskType.indexOf('🗺️ Trip:') !== -1) {
      Logger.log('Skipping trip summary entry: ' + location + ' / ' + taskType);
      continue;
    }

    var scheduledDate = colIndex.scheduledDate !== undefined ? row[colIndex.scheduledDate] : null;
    var startTime = colIndex.startTime !== undefined ? row[colIndex.startTime] : '';
    var endTime = colIndex.endTime !== undefined ? row[colIndex.endTime] : '';

    // Parse date
    var dateObj = null;
    var dateKey = null;
    if (scheduledDate) {
      dateObj = scheduledDate instanceof Date ? scheduledDate : new Date(scheduledDate);
      if (!isNaN(dateObj.getTime())) {
        dateObj.setHours(0, 0, 0, 0);
        dateKey = formatDateKeyForRoute(dateObj);
      }
    }

    // Parse flexibility options - default to locked if columns don't exist
    var isLocked = colIndex.locked !== undefined ?
      (row[colIndex.locked] === true || row[colIndex.locked] === 'TRUE' || row[colIndex.locked] === 'true') : true;
    var allowDayChange = colIndex.allowDayChange !== undefined ?
      (row[colIndex.allowDayChange] === true || row[colIndex.allowDayChange] === 'TRUE' || row[colIndex.allowDayChange] === 'true') : false;
    var allowWeekChange = colIndex.allowWeekChange !== undefined ?
      (row[colIndex.allowWeekChange] === true || row[colIndex.allowWeekChange] === 'TRUE' || row[colIndex.allowWeekChange] === 'true') : false;
    var allowTimeChange = colIndex.allowTimeChange !== undefined ?
      (row[colIndex.allowTimeChange] === true || row[colIndex.allowTimeChange] === 'TRUE' || row[colIndex.allowTimeChange] === 'true') : false;

    // If completely locked, override other options
    if (isLocked) {
      allowDayChange = false;
      allowWeekChange = false;
      allowTimeChange = false;
    }

    var task = {
      rowIndex: i + 1,
      location: location,
      direction: getLocationDirection(location),
      taskType: colIndex.taskType !== undefined ? String(row[colIndex.taskType] || 'Manual Task') : 'Manual Task',
      employee: colIndex.employee !== undefined ? String(row[colIndex.employee] || '') : '',
      priority: colIndex.priority !== undefined ? String(row[colIndex.priority] || 'Medium') : 'Medium',
      notes: colIndex.notes !== undefined ? String(row[colIndex.notes] || '') : '',
      scheduledDate: dateKey,
      scheduledDateObj: dateObj,
      startTime: formatTimeValue(startTime),
      endTime: formatTimeValue(endTime),
      // Flexibility options
      isLocked: isLocked,
      allowDayChange: allowDayChange,
      allowWeekChange: allowWeekChange,
      allowTimeChange: allowTimeChange,
      // Meta
      isManualTask: true,
      source: 'Manual Tasks'
    };

    result.tasks.push(task);

    // Group by date
    if (dateKey) {
      if (!result.byDate[dateKey]) {
        result.byDate[dateKey] = [];
      }
      result.byDate[dateKey].push(task);
    }

    // Track locked vs flexible
    if (isLocked || (!allowDayChange && !allowWeekChange && !allowTimeChange)) {
      result.lockedTasks.push(task);
    } else {
      result.flexibleTasks.push(task);
    }

    // Note: Removed per-task logging to improve performance
  }

  Logger.log('Found ' + result.tasks.length + ' manual tasks (' + result.lockedTasks.length + ' locked, ' + result.flexibleTasks.length + ' flexible)');

  return result;
}

/**
 * Formats a time value to HH:MM format string.
 * Handles Date objects, time strings, and numbers.
 *
 * @param {*} timeVal - Time value to format
 * @return {string} Formatted time string or empty string
 */
function formatTimeValue(timeVal) {
  if (!timeVal) return '';

  if (timeVal instanceof Date) {
    var hours = timeVal.getHours();
    var mins = timeVal.getMinutes();
    return String(hours).padStart(2, '0') + ':' + String(mins).padStart(2, '0');
  }

  var timeStr = String(timeVal).trim();
  if (!timeStr) return '';

  // Already in HH:MM or H:MM format
  if (/^\d{1,2}:\d{2}/.test(timeStr)) {
    var parts = timeStr.match(/^(\d{1,2}):(\d{2})/);
    if (parts) {
      return String(parseInt(parts[1])).padStart(2, '0') + ':' + parts[2];
    }
  }

  return timeStr;
}

/**
 * Debug function to test task collection
 * Run this from the Debug menu to see what's happening with Trip Planner
 */
function debugTripPlannerData() {
  var ui = SpreadsheetApp.getUi();

  try {
    ui.alert('Testing...', 'Checking To Do List and Manual Tasks sheets...', ui.ButtonSet.OK);

    var result = getPendingTasksWithLocations();
    var manualResult = getManualTasksWithFlexibility();

    var message = '=== Trip Planner Debug ===\n\n';

    if (result.error) {
      message += '❌ ERROR: ' + result.error + '\n\n';
    } else {
      message += '✅ To Do List Tasks: ' + result.tasks.length + '\n';
      message += '📍 Locations: ' + Object.keys(result.byLocation).length + '\n';
      if (Object.keys(result.byLocation).length > 0) {
        message += '   ' + Object.keys(result.byLocation).slice(0, 5).join(', ');
        if (Object.keys(result.byLocation).length > 5) message += '...';
        message += '\n';
      }
    }

    message += '\n📋 Manual Tasks: ' + manualResult.tasks.length + '\n';
    message += '   Locked: ' + manualResult.lockedTasks.length + '\n';
    message += '   Flexible: ' + manualResult.flexibleTasks.length + '\n';

    if (manualResult.tasks.length > 0) {
      message += '\nManual task locations:\n';
      for (var i = 0; i < Math.min(3, manualResult.tasks.length); i++) {
        var t = manualResult.tasks[i];
        message += '   • ' + t.location + ' on ' + (t.scheduledDate || 'no date') + (t.isLocked ? ' 🔒' : '') + '\n';
      }
    }

    ui.alert('Trip Planner Debug Results', message, ui.ButtonSet.OK);

    Logger.log(message);
    return result;

  } catch (e) {
    ui.alert('Error', 'Error running debug: ' + e.toString(), ui.ButtonSet.OK);
    Logger.log('Debug error: ' + e.toString());
    return { error: e.toString() };
  }
}


/**
 * Collects tasks for Trip Planner using Task Metadata as single source of truth.
 * Phase 6: Now uses getTasksWithMetadata() instead of reading source sheets directly.
 *
 * @return {Object} Tasks formatted for Trip Planner {tasks: [], byLocation: {}, byDirection: {}, officeTasks: []}
 */
function collectTasksForTripPlanner() {
  Logger.log('=== collectTasksForTripPlanner (Using Task Metadata - Phase 6) ===');

  var today = new Date();
  today.setHours(0, 0, 0, 0);

  // Phase 6: Use getTasksWithMetadata() for all task data
  var metadataResult;
  try {
    metadataResult = getTasksWithMetadata();
    Logger.log('getTasksWithMetadata returned ' + (metadataResult.tasks ? metadataResult.tasks.length : 0) + ' tasks');

    // Check if data was stored in ScriptProperties (server-to-server call)
    if (metadataResult.stored === true && !metadataResult.tasks) {
      Logger.log('Data stored in ScriptProperties, fetching via getStoredTasks...');
      metadataResult = getStoredTasks();
      Logger.log('getStoredTasks returned ' + (metadataResult.tasks ? metadataResult.tasks.length : 0) + ' tasks');

      // Deserialize compressed tasks
      if (metadataResult.tasks && metadataResult.tasks.length > 0) {
        var firstTask = metadataResult.tasks[0];
        // Check if tasks are in compressed format (abbreviated field names)
        if (firstTask.emp !== undefined || firstTask.loc !== undefined) {
          Logger.log('Deserializing compressed task format...');
          metadataResult.tasks = metadataResult.tasks.map(function(t) {
            return {
              taskKey: t.taskKey,
              employee: t.emp || '',
              taskType: t.type || '',
              type: t.type || '', // Alias
              itemType: t.item || '',
              location: t.loc || '',
              phoneNumber: t.phone || '',
              dueDate: t.due || '',
              scheduledDate: t.sched || '',
              startTime: t.start || '',
              endTime: t.end || '',
              status: t.stat || 'Pending',
              isOverdue: t.over === 1,
              daysTillDue: t.days || 0,
              sheetName: t.src || '',
              source: t.src || '',
              rowIndex: t.row || 0,
              isManualTask: t.manual === 1,
              inTaskList: t.inList === 1,
              isRegistered: t.reg === 1
            };
          });
          Logger.log('Deserialized ' + metadataResult.tasks.length + ' tasks');
        }
      }
    }
  } catch (e) {
    Logger.log('ERROR calling getTasksWithMetadata: ' + e.message);
    // Fall back to old method if Task Metadata not available
    Logger.log('Falling back to collectAndGroupTasks...');
    return collectTasksForTripPlannerLegacy();
  }

  // Group tasks by location from the metadata result
  var tasksByLocation = {};
  var allTasks = metadataResult.tasks || [];

  for (var i = 0; i < allTasks.length; i++) {
    var task = allTasks[i];
    var location = task.location || 'Unknown';
    if (!tasksByLocation[location]) {
      tasksByLocation[location] = [];
    }
    tasksByLocation[location].push(task);
  }

  Logger.log('Grouped tasks into ' + Object.keys(tasksByLocation).length + ' locations');

  var tasks = [];
  var byLocation = {};
  var byDirection = {};
  var officeTasks = []; // NEW: Track office work tasks separately
  var scheduledTasks = {}; // NEW: Track tasks already scheduled by date key
  var skippedCount = { helena: 0, certExpiring: 0, futureScheduled: 0 };
  var trainingCount = 0; // Track training tasks specifically
  var rowCounter = 1; // Virtual row counter for tasks that don't have real row indices

  for (var locationName in tasksByLocation) {
    var locationTasks = tasksByLocation[locationName];

    var locLower = locationName.toLowerCase();

    // Check if this is a non-field location (but NOT Helena - Helena crews need field visits)
    var isNonFieldLocation = (locLower === 'weeds' ||
        locLower === 'unknown' ||
        locLower === 'previous employee' ||
        locLower === 'light duty' ||
        locLower === 'vacation' ||
        locLower === 'leave');

    if (isNonFieldLocation) {
      // Collect these as office tasks - they can't be visited in the field
      for (var ot = 0; ot < locationTasks.length; ot++) {
        var officeTask = locationTasks[ot];
        var taskType = officeTask.type || officeTask.taskType || '';
        var dueDate = officeTask.dueDate || officeTask.changeOutDate || null;
        var daysTillDue = null;

        if (dueDate) {
          var dueDateObj = dueDate instanceof Date ? dueDate : new Date(dueDate);
          if (!isNaN(dueDateObj.getTime())) {
            dueDateObj.setHours(0, 0, 0, 0);
            daysTillDue = Math.ceil((dueDateObj - today) / (1000 * 60 * 60 * 24));
          }
        }

        officeTasks.push({
          rowIndex: officeTask.rowIndex || rowCounter++,
          location: locationName,
          taskType: taskType,
          employee: officeTask.employee || '',
          dueDate: dueDate ? formatDateForDisplay(dueDate instanceof Date ? dueDate : new Date(dueDate)) : null,
          daysTillDue: daysTillDue,
          urgency: calculateUrgencyScore(daysTillDue),
          urgencyLabel: getUrgencyLabel(calculateUrgencyScore(daysTillDue)),
          source: officeTask.sheetName || officeTask.source || '',
          isOfficeTask: true
        });
      }
      skippedCount.helena += locationTasks.length;
      continue;
    }

    for (var t = 0; t < locationTasks.length; t++) {
      var sourceTask = locationTasks[t];

      // Get task type from 'type' property (used by collectAndGroupTasks) or 'taskType' property
      var taskType = sourceTask.type || sourceTask.taskType || '';
      var taskTypeLower = taskType.toLowerCase();

      // Collect Cert Expiring tasks as office tasks (they can be handled over the phone)
      if (taskTypeLower === 'cert expiring' ||
          taskTypeLower.indexOf('cert expir') !== -1 ||
          taskTypeLower.indexOf('certification expir') !== -1) {

        var certDueDate = sourceTask.dueDate || sourceTask.changeOutDate || null;
        var certDaysTillDue = null;

        if (certDueDate) {
          var certDueDateObj = certDueDate instanceof Date ? certDueDate : new Date(certDueDate);
          if (!isNaN(certDueDateObj.getTime())) {
            certDueDateObj.setHours(0, 0, 0, 0);
            certDaysTillDue = Math.ceil((certDueDateObj - today) / (1000 * 60 * 60 * 24));
          }
        }

        officeTasks.push({
          rowIndex: sourceTask.rowIndex || rowCounter++,
          location: locationName,
          taskType: taskType,
          employee: sourceTask.employee || '',
          certType: sourceTask.itemType || sourceTask.certType || '',
          itemType: sourceTask.itemType || sourceTask.certType || '',
          dueDate: certDueDate ? formatDateForDisplay(certDueDate instanceof Date ? certDueDate : new Date(certDueDate)) : null,
          daysTillDue: certDaysTillDue,
          urgency: calculateUrgencyScore(certDaysTillDue),
          urgencyLabel: getUrgencyLabel(calculateUrgencyScore(certDaysTillDue)),
          source: sourceTask.sheetName || sourceTask.source || '',
          isOfficeTask: true,
          isCertTask: true
        });

        skippedCount.certExpiring++;
        continue;
      }

      // Handle tasks already scheduled for a future date - collect them by date
      // so Trip Planner can show them on their scheduled days
      if (sourceTask.scheduledDate) {
        var scheduledDateObj = sourceTask.scheduledDate instanceof Date ?
            sourceTask.scheduledDate : new Date(sourceTask.scheduledDate);
        if (!isNaN(scheduledDateObj.getTime())) {
          scheduledDateObj.setHours(0, 0, 0, 0);
          if (scheduledDateObj >= today) {
            // Collect this task for its scheduled day instead of skipping
            var scheduledDateKey = formatDateKeyForRoute(scheduledDateObj);

            // Calculate urgency based on due date (not scheduled date)
            var taskDueDate = sourceTask.dueDate || sourceTask.changeOutDate || null;
            var taskDaysTillDue = null;
            if (taskDueDate) {
              var taskDueDateObj = taskDueDate instanceof Date ? taskDueDate : new Date(taskDueDate);
              if (!isNaN(taskDueDateObj.getTime())) {
                taskDueDateObj.setHours(0, 0, 0, 0);
                taskDaysTillDue = Math.ceil((taskDueDateObj - today) / (1000 * 60 * 60 * 24));
              }
            }
            var scheduledUrgency = calculateUrgencyScore(taskDaysTillDue);

            var scheduledTask = {
              rowIndex: sourceTask.rowIndex || rowCounter++,
              location: locationName,
              direction: getLocationDirection(locationName),
              taskType: sourceTask.type || sourceTask.taskType || '',
              employee: sourceTask.employee || '',
              itemType: sourceTask.itemType || '',
              crew: sourceTask.crew || '',
              foreman: sourceTask.foreman || '',
              dueDate: taskDueDate ? formatDateForDisplay(taskDueDate instanceof Date ? taskDueDate : new Date(taskDueDate)) : null,
              scheduledDate: scheduledDateKey,
              daysTillDue: taskDaysTillDue,
              urgency: scheduledUrgency,
              urgencyLabel: getUrgencyLabel(scheduledUrgency),
              source: sourceTask.sheetName || sourceTask.source || '',
              startTime: sourceTask.startTime || '',
              endTime: sourceTask.endTime || ''
            };

            if (!scheduledTasks[scheduledDateKey]) {
              scheduledTasks[scheduledDateKey] = [];
            }
            scheduledTasks[scheduledDateKey].push(scheduledTask);

            skippedCount.futureScheduled++;
            continue;
          }
        }
      }

      // Calculate days till due based on actual due date (cert expiration or change out date)
      var dueDate = sourceTask.dueDate || sourceTask.changeOutDate || null;
      var daysTillDue = null;

      if (dueDate) {
        var dueDateObj = dueDate instanceof Date ? dueDate : new Date(dueDate);
        if (!isNaN(dueDateObj.getTime())) {
          dueDateObj.setHours(0, 0, 0, 0);
          daysTillDue = Math.ceil((dueDateObj - today) / (1000 * 60 * 60 * 24));
        }
      }

      // Calculate urgency score
      var urgency = calculateUrgencyScore(daysTillDue);

      // Track training tasks
      if (taskTypeLower === 'training') {
        trainingCount++;
      }

      var task = {
        rowIndex: sourceTask.rowIndex || rowCounter++,
        location: locationName,
        direction: getLocationDirection(locationName),
        taskType: taskType, // Use the properly extracted taskType
        employee: sourceTask.employee || '',
        itemType: sourceTask.itemType || '',
        crew: sourceTask.crew || '',
        foreman: sourceTask.foreman || '',
        dueDate: dueDate ? formatDateForDisplay(dueDate instanceof Date ? dueDate : new Date(dueDate)) : null,
        daysTillDue: daysTillDue,
        urgency: urgency,
        urgencyLabel: getUrgencyLabel(urgency),
        isNew: false,
        source: sourceTask.sheetName || sourceTask.source || '' // Track where task came from
      };

      tasks.push(task);

      // Group by location
      var locKey = locationName.toLowerCase();
      if (!byLocation[locKey]) {
        byLocation[locKey] = {
          name: locationName,
          direction: task.direction,
          tasks: [],
          totalUrgency: 0,
          maxUrgency: 0,
          estimatedTime: CREW_BASE_TIME
        };
      }
      byLocation[locKey].tasks.push(task);
      byLocation[locKey].totalUrgency += urgency;
      byLocation[locKey].maxUrgency = Math.max(byLocation[locKey].maxUrgency, urgency);
      byLocation[locKey].estimatedTime = CREW_BASE_TIME + (byLocation[locKey].tasks.length * CREW_PER_TASK);

      // Group by direction
      if (!byDirection[task.direction]) {
        byDirection[task.direction] = [];
      }
      if (byDirection[task.direction].indexOf(locKey) === -1) {
        byDirection[task.direction].push(locKey);
      }
    }
  }

  Logger.log('=== TASK METADATA SUMMARY (Phase 6) ===');
  Logger.log('Found ' + tasks.length + ' pending tasks in ' + Object.keys(byLocation).length + ' locations');
  Logger.log('Task breakdown: ' + trainingCount + ' training, ' + (tasks.length - trainingCount) + ' other');
  Logger.log('Office tasks collected: ' + officeTasks.length);
  Logger.log('Pre-scheduled tasks by date: ' + Object.keys(scheduledTasks).length + ' dates, ' + skippedCount.futureScheduled + ' total tasks');
  Logger.log('Skipped from field trips: ' + skippedCount.helena + ' Helena/office, ' + skippedCount.certExpiring + ' cert expiring (phone)');

  return {
    tasks: tasks,
    byLocation: byLocation,
    byDirection: byDirection,
    officeTasks: officeTasks,
    scheduledTasks: scheduledTasks, // NEW: Tasks pre-assigned to specific dates
    fromTaskMetadata: true // Flag to indicate this used Task Metadata (Phase 6)
  };
}

/**
 * Legacy fallback function - uses collectAndGroupTasks directly.
 * Only used if Task Metadata sheet is not available.
 * @private
 */
function collectTasksForTripPlannerLegacy() {
  Logger.log('=== collectTasksForTripPlannerLegacy (Fallback Mode) ===');

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var today = new Date();
  today.setHours(0, 0, 0, 0);

  // Use collectAndGroupTasks from 76-SmartScheduling.gs to get all pending tasks
  var tasksByLocation = collectAndGroupTasks(ss);

  Logger.log('collectAndGroupTasks returned ' + Object.keys(tasksByLocation).length + ' locations');

  var tasks = [];
  var byLocation = {};
  var byDirection = {};
  var officeTasks = [];
  var skippedCount = { helena: 0, certExpiring: 0, futureScheduled: 0 };
  var rowCounter = 1;

  for (var locationName in tasksByLocation) {
    var locationTasks = tasksByLocation[locationName];
    var locLower = locationName.toLowerCase();
    var isOfficeLocation = (locLower === 'helena' || locLower === 'weeds' || locLower === 'unknown' ||
        locLower === 'previous employee' || locLower === 'light duty' || locLower === 'vacation' || locLower === 'leave');

    if (isOfficeLocation) {
      skippedCount.helena += locationTasks.length;
      continue;
    }

    for (var t = 0; t < locationTasks.length; t++) {
      var sourceTask = locationTasks[t];
      var taskType = sourceTask.type || sourceTask.taskType || '';
      var taskTypeLower = taskType.toLowerCase();

      // Skip cert tasks
      if (taskTypeLower.indexOf('cert expir') !== -1) {
        skippedCount.certExpiring++;
        continue;
      }

      // Skip future scheduled tasks
      if (sourceTask.scheduledDate) {
        var scheduledDateObj = new Date(sourceTask.scheduledDate);
        if (!isNaN(scheduledDateObj.getTime()) && scheduledDateObj > today) {
          skippedCount.futureScheduled++;
          continue;
        }
      }

      var dueDate = sourceTask.dueDate || sourceTask.changeOutDate || null;
      var daysTillDue = null;
      if (dueDate) {
        var dueDateObj = dueDate instanceof Date ? dueDate : new Date(dueDate);
        if (!isNaN(dueDateObj.getTime())) {
          dueDateObj.setHours(0, 0, 0, 0);
          daysTillDue = Math.ceil((dueDateObj - today) / (1000 * 60 * 60 * 24));
        }
      }

      var urgency = calculateUrgencyScore(daysTillDue);
      var task = {
        rowIndex: sourceTask.rowIndex || rowCounter++,
        location: locationName,
        direction: getLocationDirection(locationName),
        taskType: taskType,
        employee: sourceTask.employee || '',
        itemType: sourceTask.itemType || '',
        crew: sourceTask.crew || '',
        foreman: sourceTask.foreman || '',
        dueDate: dueDate ? formatDateForDisplay(dueDate instanceof Date ? dueDate : new Date(dueDate)) : null,
        daysTillDue: daysTillDue,
        urgency: urgency,
        urgencyLabel: getUrgencyLabel(urgency),
        isNew: false,
        source: sourceTask.sheetName || sourceTask.source || ''
      };

      tasks.push(task);

      var locKey = locationName.toLowerCase();
      if (!byLocation[locKey]) {
        byLocation[locKey] = {
          name: locationName,
          direction: task.direction,
          tasks: [],
          totalUrgency: 0,
          maxUrgency: 0,
          estimatedTime: CREW_BASE_TIME
        };
      }
      byLocation[locKey].tasks.push(task);
      byLocation[locKey].totalUrgency += urgency;
      byLocation[locKey].maxUrgency = Math.max(byLocation[locKey].maxUrgency, urgency);
      byLocation[locKey].estimatedTime = CREW_BASE_TIME + (byLocation[locKey].tasks.length * CREW_PER_TASK);

      if (!byDirection[task.direction]) byDirection[task.direction] = [];
      if (byDirection[task.direction].indexOf(locKey) === -1) {
        byDirection[task.direction].push(locKey);
      }
    }
  }

  Logger.log('Legacy mode found ' + tasks.length + ' tasks');

  return {
    tasks: tasks,
    byLocation: byLocation,
    byDirection: byDirection,
    officeTasks: officeTasks,
    legacyMode: true
  };
}

/**
 * Gets all pending tasks with locations for Trip Planner.
 * Phase 6: Now uses Task Metadata as single source of truth.
 *
 * Called from TripPlanner.html
 *
 * @return {Object} Tasks grouped by location with urgency scores
 */
function getPendingTasksWithLocations() {
  Logger.log('=== getPendingTasksWithLocations (Using Task Metadata - Phase 6) ===');

  try {
    // Phase 6: Use Task Metadata as single source of truth
    var result = collectTasksForTripPlanner();

    // Add drive time map and overnight cities for the Trip Planner UI
    result.driveTimeMap = getDriveTimeMap();
    result.overnightCities = getOvernightCities();

    return result;

  } catch (e) {
    Logger.log('ERROR in getPendingTasksWithLocations: ' + e.toString());
    return {
      tasks: [],
      byLocation: {},
      byDirection: {},
      error: 'Failed to load tasks: ' + e.message
    };
  }
}

/**
 * Calculates urgency score based on days until due.
 *
 * @param {number} daysTillDue - Days until due (negative = overdue)
 * @return {number} Urgency score
 */
function calculateUrgencyScore(daysTillDue) {
  if (daysTillDue === null) return URGENCY_LATER;
  if (daysTillDue < 0) return URGENCY_OVERDUE;
  if (daysTillDue <= 3) return URGENCY_3_DAYS;
  if (daysTillDue <= 7) return URGENCY_THIS_WEEK;
  if (daysTillDue <= 14) return URGENCY_NEXT_WEEK;
  return URGENCY_LATER;
}

/**
 * Gets urgency label for display.
 *
 * @param {number} urgency - Urgency score
 * @return {string} Label with emoji
 */
function getUrgencyLabel(urgency) {
  if (urgency >= URGENCY_OVERDUE) return '🔴 Overdue';
  if (urgency >= URGENCY_3_DAYS) return '🟠 Due Soon';
  if (urgency >= URGENCY_THIS_WEEK) return '🟡 This Week';
  if (urgency >= URGENCY_NEXT_WEEK) return '🟢 Next Week';
  return '⚪ Later';
}

/**
 * Calculates estimated duration for a manual task in minutes.
 * Uses start/end times if available, otherwise defaults to 30 minutes.
 *
 * @param {Object} task - Manual task object with optional startTime, endTime
 * @return {number} Duration in minutes
 */
function calculateManualTaskDuration(task) {
  if (!task) return 30; // Default 30 minutes

  // If we have start and end times, calculate duration
  if (task.startTime && task.endTime) {
    var startParts = task.startTime.split(':');
    var endParts = task.endTime.split(':');

    if (startParts.length >= 2 && endParts.length >= 2) {
      var startMins = parseInt(startParts[0]) * 60 + parseInt(startParts[1]);
      var endMins = parseInt(endParts[0]) * 60 + parseInt(endParts[1]);

      if (endMins > startMins) {
        return endMins - startMins;
      }
    }
  }

  // Default durations based on task type
  var taskType = (task.taskType || '').toLowerCase();
  if (taskType.indexOf('training') !== -1) return 60; // 1 hour for training
  if (taskType.indexOf('office') !== -1) return 60; // 1 hour for office work

  return 30; // Default 30 minutes
}

/**
 * Calculates trip savings by combining nearby locations.
 * Compares combined trips vs separate trips for same-direction locations.
 *
 * @param {Array} workDays - Array of work day objects with assigned locations
 * @param {Object} byLocation - Locations grouped by name
 * @param {Object} driveTimeMap - Drive times from Helena for each location
 * @return {Object} Savings summary with details
 */
function calculateTripSavings(workDays, byLocation, driveTimeMap) {
  var savings = {
    totalSavedMinutes: 0,
    combinedTrips: [],
    details: []
  };

  // For each day, check if combining locations saves time vs separate trips
  for (var d = 0; d < workDays.length; d++) {
    var day = workDays[d];
    var locations = day.assignedLocations || [];

    if (locations.length < 2) continue;

    // Calculate time if we did separate trips from Helena
    var separateTripTime = 0;
    for (var l = 0; l < locations.length; l++) {
      var loc = locations[l];
      var locLower = (loc.location || '').toLowerCase();
      var driveTime = driveTimeMap[locLower] || 60;
      separateTripTime += (driveTime * 2) + (loc.estimatedTime || 30); // Round trip + crew time
    }

    // Calculate combined trip time (already calculated in day.plan)
    var combinedTripTime = day.plan ? day.plan.totalMinutes : separateTripTime;

    // Calculate savings
    var daySavings = separateTripTime - combinedTripTime;

    if (daySavings > 15) { // Only report if savings > 15 min
      savings.totalSavedMinutes += daySavings;

      var locationNames = locations.map(function(loc) { return loc.location; }).join(' + ');
      savings.combinedTrips.push({
        day: day.dayName,
        dateKey: day.dateKey,
        locations: locationNames,
        savedMinutes: daySavings,
        message: 'Combine ' + locationNames + ' → Save ' + formatDuration(daySavings)
      });

      savings.details.push('💡 ' + day.dayName + ': ' + locationNames + ' saves ' + formatDuration(daySavings));
    }
  }

  savings.summary = savings.totalSavedMinutes > 0
    ? '💰 Total savings: ' + formatDuration(savings.totalSavedMinutes) + ' by combining ' + savings.combinedTrips.length + ' trips'
    : 'No significant savings from combining trips';

  return savings;
}

// ============================================================================
// DAY SIMULATION ENGINE
// ============================================================================

/**
 * Calculates a day plan given start location and destinations.
 *
 * @param {string} startLocation - Starting location (e.g., 'Helena', 'Bozeman')
 * @param {Array} destinations - Array of {location, tasks, estimatedTime}
 * @param {number} startHour - Start hour (default 7)
 * @return {Object} Day plan with route, times, and warnings
 */
function calculateDayPlan(startLocation, destinations, startHour, endLocation) {
  startHour = startHour || WORK_START_HOUR;
  endLocation = endLocation || 'Helena'; // Default end location is Helena
  var driveTimeMap = getDriveTimeMap();

  var plan = {
    startLocation: startLocation,
    startTime: startHour + ':00',
    stops: [],
    endLocation: endLocation,
    requestedEndLocation: endLocation, // Store what user requested
    totalMinutes: 0,
    driveMinutes: 0,
    crewMinutes: 0,
    endTime: '',
    exceedsLimit: false,
    overnightSuggested: endLocation !== 'Helena', // Suggest overnight if not ending in Helena
    returnToHelena: endLocation === 'Helena'
  };

  if (!destinations || destinations.length === 0) {
    plan.endTime = startHour + ':00';
    return plan;
  }

  var currentLocation = startLocation.toLowerCase();
  var currentMinutes = 0;

  // Sort destinations by drive time from current location for efficiency
  var sortedDest = destinations.slice().sort(function(a, b) {
    var driveA = getDriveTimeBetweenLocations(currentLocation, a.location.toLowerCase(), driveTimeMap);
    var driveB = getDriveTimeBetweenLocations(currentLocation, b.location.toLowerCase(), driveTimeMap);
    return driveA - driveB;
  });

  // Process each destination
  for (var i = 0; i < sortedDest.length; i++) {
    var dest = sortedDest[i];
    var destLoc = dest.location.toLowerCase();

    // Calculate drive time from current location
    var driveTime = getDriveTimeBetweenLocations(currentLocation, destLoc, driveTimeMap);
    currentMinutes += driveTime;
    plan.driveMinutes += driveTime;

    // Add crew time at this location
    var crewTime = dest.estimatedTime || (CREW_BASE_TIME + (dest.taskCount || 1) * CREW_PER_TASK);
    currentMinutes += crewTime;
    plan.crewMinutes += crewTime;

    plan.stops.push({
      location: dest.location,
      arriveTime: formatMinutesToTime(startHour * 60 + currentMinutes - crewTime),
      departTime: formatMinutesToTime(startHour * 60 + currentMinutes),
      driveTimeFromPrev: driveTime,
      crewTime: crewTime,
      taskCount: dest.taskCount || dest.tasks?.length || 0,
      tasks: dest.tasks || []
    });

    currentLocation = destLoc;
  }

  // Calculate drive time to the desired end location
  var lastLocation = currentLocation;
  var endLocationLower = endLocation.toLowerCase();
  var returnDrive = getDriveTimeBetweenLocations(lastLocation, endLocationLower, driveTimeMap);
  var totalWithReturn = currentMinutes + returnDrive;

  // Add the return drive to totals
  plan.driveMinutes += returnDrive;
  plan.totalMinutes = totalWithReturn;
  plan.endLocation = endLocation;
  plan.returnToHelena = (endLocation === 'Helena');
  plan.overnightSuggested = (endLocation !== 'Helena');

  // Check if exceeds 10-hour limit
  if (totalWithReturn > MAX_WORK_MINUTES) {
    plan.exceedsLimit = true;
  }

  plan.endTime = formatMinutesToTime(startHour * 60 + plan.totalMinutes);

  return plan;
}

/**
 * Recalculates a day plan based on updated parameters.
 * Called from TripPlanner.html when locations are dragged to new days.
 *
 * @param {Object} params - Day plan parameters
 * @param {string} params.startLocation - Starting location (e.g., 'Helena')
 * @param {Array} params.assignedLocations - Array of assigned location objects
 * @param {boolean} params.arriveFirstBy7am - Whether to arrive at first stop by 7am
 * @param {string} params.endLocation - Ending location (default 'Helena')
 * @return {Object} Recalculated day plan
 */
function recalculateDayPlan(params) {
  Logger.log('recalculateDayPlan called with: ' + JSON.stringify(params));

  var startLocation = params.startLocation || 'Helena';
  var endLocation = params.endLocation || 'Helena';
  var assignedLocations = params.assignedLocations || [];
  var arriveFirstBy7am = params.arriveFirstBy7am || false;

  // Convert assignedLocations to the format expected by calculateDayPlan
  var destinations = assignedLocations.map(function(loc) {
    return {
      location: loc.location || loc.name || 'Unknown',
      taskCount: loc.taskCount || (loc.tasks ? loc.tasks.length : 0),
      estimatedTime: loc.estimatedTime || 25,
      tasks: loc.tasks || []
    };
  });

  // Calculate the plan
  var plan = calculateDayPlan(startLocation, destinations, WORK_START_HOUR, endLocation);

  // Handle early arrival option
  if (arriveFirstBy7am && destinations.length > 0) {
    var driveTimeMap = getDriveTimeMap();
    var firstDestLower = (destinations[0].location || '').toLowerCase();
    var earlyDriveMinutes = getDriveTimeBetweenLocations(startLocation.toLowerCase(), firstDestLower, driveTimeMap);

    plan.earlyDriveMinutes = earlyDriveMinutes;
    plan.arriveFirstBy7am = true;
    // Note: Early drive time is NOT counted against the 10-hour workday
  }

  Logger.log('recalculateDayPlan result: totalMinutes=' + plan.totalMinutes + ', stops=' + plan.stops.length);

  return plan;
}

/**
 * Gets drive time between two locations using coordinates.
 * Uses the calculateDriveTimeBetween function from 76-SmartScheduling.gs
 * which calculates actual distance-based drive times.
 *
 * @param {string} from - From location (lowercase)
 * @param {string} to - To location (lowercase)
 * @param {Object} driveTimeMap - Map of location to drive time from Helena (fallback)
 * @return {number} Drive time in minutes
 */
function getDriveTimeBetweenLocations(from, to, driveTimeMap) {
  if (from === to) return 0;

  // Try to use coordinate-based calculation (more accurate)
  try {
    var driveTime = calculateDriveTimeBetween(from, to);
    if (driveTime > 0) {
      return driveTime;
    }
  } catch (e) {
    // Fall through to legacy calculation
    Logger.log('Coordinate calculation failed for ' + from + ' to ' + to + ': ' + e);
  }

  // Fallback to legacy calculation using Helena-based times
  var fromTime = driveTimeMap[from] || 0;
  var toTime = driveTimeMap[to] || 0;

  if (from === 'helena') {
    return toTime;
  } else if (to === 'helena') {
    return fromTime;
  } else {
    // Check if same direction - if so, use difference; otherwise use sum
    var fromDir = getLocationDirection(from);
    var toDir = getLocationDirection(to);

    if (fromDir === toDir && fromDir !== 'Other' && fromDir !== 'Unknown') {
      // Same direction - drive time is roughly the difference
      return Math.abs(toTime - fromTime) + 10; // 10 min buffer
    } else {
      // Different directions - need to go back through Helena area
      return fromTime + toTime;
    }
  }
}

/**
 * Formats minutes since midnight to time string.
 *
 * @param {number} minutes - Minutes since midnight
 * @return {string} Time string (e.g., "2:30pm")
 */
function formatMinutesToTime(minutes) {
  var hours = Math.floor(minutes / 60);
  var mins = Math.round(minutes % 60);
  var ampm = hours >= 12 ? 'pm' : 'am';
  var displayHour = hours > 12 ? hours - 12 : (hours === 0 ? 12 : hours);
  return displayHour + ':' + String(mins).padStart(2, '0') + ampm;
}

/**
 * Formats minutes to human-readable duration.
 *
 * @param {number} minutes - Duration in minutes
 * @return {string} Formatted string (e.g., "2 hrs 30 min")
 */
function formatDuration(minutes) {
  if (minutes < 60) {
    return minutes + ' min';
  }
  var hours = Math.floor(minutes / 60);
  var mins = Math.round(minutes % 60);
  if (mins === 0) {
    return hours + ' hr' + (hours > 1 ? 's' : '');
  }
  return hours + ' hr' + (hours > 1 ? 's' : '') + ' ' + mins + ' min';
}

// ============================================================================
// TRIP SUGGESTION ENGINE
// ============================================================================

/**
 * Suggests optimal trips for the next N days.
 * Called from TripPlanner.html
 *
 * IMPORTANT: Respects manual tasks based on their flexibility settings:
 * - Locked tasks: Cannot be moved at all, must stay on scheduled date/time
 * - Allow Day Change: Can move within the same week
 * - Allow Week Change: Can move to a different week
 * - Allow Time Change: Can adjust start/end time within scheduled day
 *
 * @param {number} daysAhead - Number of days to plan (default 14)
 * @return {Object} Suggested trip plan
 */
function suggestOptimalTrips(daysAhead) {
  daysAhead = daysAhead || 14;
  Logger.log('=== suggestOptimalTrips: ' + daysAhead + ' days ===');

  try {
    // First, get manual tasks with their flexibility options
    Logger.log('Step 1: Getting manual tasks...');
    var manualData = getManualTasksWithFlexibility();
    Logger.log('Manual tasks found: ' + manualData.tasks.length + ' (' + manualData.lockedTasks.length + ' locked)');

    Logger.log('Step 2: Getting pending tasks...');
    var pendingData = getPendingTasksWithLocations();

    // If there was an error getting tasks, pass it through
    if (pendingData.error) {
      Logger.log('Error from getPendingTasksWithLocations: ' + pendingData.error);
      return { error: pendingData.error, workDays: [], unassignedLocations: [], manualTasks: manualData };
    }

    var byLocation = pendingData.byLocation;
    var driveTimeMap = pendingData.driveTimeMap;

    Logger.log('Step 3: Got ' + Object.keys(byLocation).length + ' locations with tasks');

    // Get date range (skip weekends initially, mark Fridays as "avoid")
    var today = new Date();
    today.setHours(0, 0, 0, 0);

    var workDays = [];
    var currentDate = new Date(today);

    Logger.log('Step 4: Building work days...');
    while (workDays.length < daysAhead) {
      var dayOfWeek = currentDate.getDay();

      // Skip Saturday (6) and Sunday (0)
      if (dayOfWeek !== 0 && dayOfWeek !== 6) {
        var dateKey = formatDateKeyForRoute(currentDate);

        // Check for locked manual tasks on this date
        var manualTasksOnDay = manualData.byDate[dateKey] || [];
        var lockedTasksOnDay = manualTasksOnDay.filter(function(t) { return t.isLocked || (!t.allowDayChange && !t.allowWeekChange); });

        workDays.push({
          date: currentDate.toISOString(), // Convert to string for serialization
          dateKey: dateKey,
          dayName: getDayName(dayOfWeek),
          dayOfWeek: dayOfWeek,
          isTuesday: dayOfWeek === 2,
          isFriday: dayOfWeek === 5,
          avoidIfPossible: dayOfWeek === 5, // Friday
          mustReturnToHelena: dayOfWeek === 2, // Tuesday
          assignedLocations: [],
          plan: null,
          startLocation: 'Helena',
          overnightCity: null,
          // Manual task tracking
          manualTasks: manualTasksOnDay,
          lockedManualTasks: lockedTasksOnDay,
          hasLockedTasks: lockedTasksOnDay.length > 0
        });
      }

      currentDate.setDate(currentDate.getDate() + 1);
    }
    Logger.log('Step 4 done: Created ' + workDays.length + ' work days');

    // Track assigned locations (including manual tasks) to prevent duplicates
    var assignedLocations = {};

    // Pre-assign locked manual tasks to their scheduled days
    Logger.log('Step 5: Pre-assigning locked manual tasks...');
    for (var d = 0; d < workDays.length; d++) {
      var day = workDays[d];
      if (day.lockedManualTasks && day.lockedManualTasks.length > 0) {
        for (var mt = 0; mt < day.lockedManualTasks.length; mt++) {
          var manualTask = day.lockedManualTasks[mt];
          var manualLocLower = manualTask.location.toLowerCase();

          // Mark this location as assigned so we don't add it again from To-Do List
          assignedLocations[manualLocLower] = true;

          // Create a location entry for this manual task
          day.assignedLocations.push({
            location: manualTask.location,
            taskCount: 1,
            estimatedTime: calculateManualTaskDuration(manualTask),
            maxUrgency: URGENCY_OVERDUE, // Treat locked tasks as high priority
            tasks: [manualTask],
            direction: manualTask.direction,
            isManualTask: true,
            isLocked: true,
            startTime: manualTask.startTime,
            endTime: manualTask.endTime,
            allowTimeChange: manualTask.allowTimeChange
          });

          Logger.log('Pre-assigned manual task: ' + manualTask.location + ' on ' + day.dateKey);
        }
      }
    }
    Logger.log('Step 5 done: ' + Object.keys(assignedLocations).length + ' locations from manual tasks');

    // Pre-assign tasks that were scheduled via Task List (Step 5.5)
    Logger.log('Step 5.5: Pre-assigning scheduled tasks from Task List...');
    var scheduledTasks = pendingData.scheduledTasks || {};
    var scheduledTaskCount = 0;

    for (var d = 0; d < workDays.length; d++) {
      var day = workDays[d];
      var tasksOnDate = scheduledTasks[day.dateKey] || [];

      if (tasksOnDate.length > 0) {
        // Group tasks by location for this day
        var locationGroups = {};
        for (var st = 0; st < tasksOnDate.length; st++) {
          var scheduledTask = tasksOnDate[st];
          var locName = scheduledTask.location || 'Unknown';
          var locKey = locName.toLowerCase();

          if (!locationGroups[locKey]) {
            locationGroups[locKey] = {
              location: locName,
              tasks: [],
              maxUrgency: 0,
              direction: scheduledTask.direction || getLocationDirection(locName)
            };
          }
          locationGroups[locKey].tasks.push(scheduledTask);
          locationGroups[locKey].maxUrgency = Math.max(
            locationGroups[locKey].maxUrgency,
            scheduledTask.urgency || 0
          );
        }

        // Add each location group to this day's assigned locations
        for (var locKey in locationGroups) {
          var group = locationGroups[locKey];

          // Check if this location is already assigned to this day (from manual tasks)
          var alreadyOnDay = day.assignedLocations.some(function(loc) {
            return (loc.location || '').toLowerCase() === locKey;
          });

          if (!alreadyOnDay) {
            var estimatedTime = CREW_BASE_TIME + (group.tasks.length * CREW_PER_TASK);

            day.assignedLocations.push({
              location: group.location,
              taskCount: group.tasks.length,
              estimatedTime: estimatedTime,
              maxUrgency: group.maxUrgency,
              tasks: group.tasks,
              direction: group.direction,
              isManualTask: false,
              isLocked: false, // Scheduled tasks from Task List can be moved
              isScheduledTask: true // Flag to indicate these came from Task List scheduling
            });

            scheduledTaskCount += group.tasks.length;
            Logger.log('Pre-assigned scheduled location: ' + group.location + ' (' + group.tasks.length + ' tasks) on ' + day.dateKey);
          } else {
            // Merge tasks into existing location on this day
            var existingLoc = day.assignedLocations.find(function(loc) {
              return (loc.location || '').toLowerCase() === locKey;
            });
            if (existingLoc) {
              existingLoc.tasks = (existingLoc.tasks || []).concat(group.tasks);
              existingLoc.taskCount = existingLoc.tasks.length;
              existingLoc.estimatedTime = CREW_BASE_TIME + (existingLoc.tasks.length * CREW_PER_TASK);
              existingLoc.maxUrgency = Math.max(existingLoc.maxUrgency, group.maxUrgency);
              scheduledTaskCount += group.tasks.length;
              Logger.log('Merged scheduled tasks into existing: ' + group.location + ' on ' + day.dateKey);
            }
          }

          // Mark this location as assigned for this date (but not globally -
          // same location can appear on multiple days with different tasks)
        }
      }
    }
    Logger.log('Step 5.5 done: Pre-assigned ' + scheduledTaskCount + ' scheduled tasks');

    // Sort locations by urgency (highest first)
    Logger.log('Step 6: Sorting locations...');
    var locationList = [];
    for (var loc in byLocation) {
      locationList.push(byLocation[loc]);
    }
    locationList.sort(function(a, b) {
      return b.maxUrgency - a.maxUrgency;
    });

    Logger.log('Step 6 done: ' + locationList.length + ' locations to assign');

    // Helper function to find the best day for a location
    function findBestDayForLocation(locData, workDays, byLocation, driveTimeMap) {
      var bestDayIdx = -1;
      var bestScore = -Infinity;

      for (var d = 0; d < workDays.length; d++) {
        var day = workDays[d];

        // Skip Fridays unless location is overdue
        if (day.isFriday && locData.maxUrgency < URGENCY_OVERDUE) {
          continue;
        }

        // Calculate current day load
        var currentLoad = 0;
        for (var a = 0; a < day.assignedLocations.length; a++) {
          currentLoad += day.assignedLocations[a].estimatedTime || 30;
        }

        // Calculate drive time to this location from day's last stop or Helena
        var lastLocation = 'helena';
        if (day.assignedLocations.length > 0) {
          var lastAssigned = day.assignedLocations[day.assignedLocations.length - 1];
          lastLocation = (lastAssigned.location || 'helena').toLowerCase();
        }
        var driveToLoc = getDriveTimeBetweenLocations(lastLocation, locData.name.toLowerCase(), driveTimeMap);

        // Estimate total time if we add this location
        var totalWithNew = currentLoad + driveToLoc + (locData.estimatedTime || 60);

        // Skip if day would exceed 10 hours (unless overnight is allowed)
        if (totalWithNew > MAX_WORK_MINUTES) {
          // Allow if overnight is OK and it's not Tuesday
          if (day.mustReturnToHelena || day.isFriday) {
            continue;
          }
          // Allow up to 11 hours for overnight days
          if (totalWithNew > MAX_WORK_MINUTES + 60) {
            continue;
          }
        }

        // Calculate score for this day
        var score = 0;

        // Prefer days with same-direction locations already assigned
        for (var a2 = 0; a2 < day.assignedLocations.length; a2++) {
          var assigned = day.assignedLocations[a2];
          if (assigned.direction === locData.direction) {
            score += 50; // Big bonus for same direction
          }
        }

        // Prefer earlier days for urgent tasks
        if (locData.maxUrgency >= URGENCY_OVERDUE) {
          score += (workDays.length - d) * 20; // Prefer earlier days
        } else if (locData.maxUrgency >= URGENCY_THIS_WEEK) {
          score += (workDays.length - d) * 10;
        }

        // Prefer days with fewer assigned locations (balance load)
        score -= day.assignedLocations.length * 5;

        // Prefer shorter drive times
        score -= driveToLoc / 10;

        // Penalty for Fridays
        if (day.isFriday) {
          score -= 100;
        }

        // Penalty for days requiring overtime
        if (totalWithNew > MAX_WORK_MINUTES) {
          score -= 50;
        }

        if (score > bestScore) {
          bestScore = score;
          bestDayIdx = d;
        }
      }

      return bestDayIdx;
    }

    // Assign locations to days (assignedLocations already has manual tasks from Step 5)
    Logger.log('Step 7: Assigning locations to days...');

    for (var l = 0; l < locationList.length; l++) {
      var locData = locationList[l];
      var locName = locData.name.toLowerCase();

      if (assignedLocations[locName]) continue;

      // Find best day for this location, considering manual tasks already scheduled
      var bestDayIdx = findBestDayForLocation(locData, workDays, byLocation, driveTimeMap);

      if (bestDayIdx !== -1) {
        workDays[bestDayIdx].assignedLocations.push({
          location: locData.name,
          taskCount: locData.tasks.length,
          estimatedTime: locData.estimatedTime,
          maxUrgency: locData.maxUrgency,
          tasks: locData.tasks,
          direction: locData.direction,
          isManualTask: false
        });
        assignedLocations[locName] = true;

        // Try to add same-direction locations to this day (limit iterations)
        var sameDirection = locationList.filter(function(other) {
          return other.direction === locData.direction &&
                 other.name.toLowerCase() !== locName &&
                 !assignedLocations[other.name.toLowerCase()];
        });

        // Limit to first 5 same-direction locations to avoid performance issues
        var maxSameDir = Math.min(5, sameDirection.length);
        for (var s = 0; s < maxSameDir; s++) {
          var otherLoc = sameDirection[s];
          var testPlan = calculateDayPlan(
            workDays[bestDayIdx].startLocation,
            workDays[bestDayIdx].assignedLocations.concat([{
              location: otherLoc.name,
              taskCount: otherLoc.tasks.length,
              estimatedTime: otherLoc.estimatedTime,
              tasks: otherLoc.tasks
            }]),
            WORK_START_HOUR
          );

          // Add if it fits within 10 hours (or day allows overnight)
          var canAdd = !testPlan.exceedsLimit ||
                       (!workDays[bestDayIdx].mustReturnToHelena && !workDays[bestDayIdx].isFriday);

          if (canAdd && testPlan.totalMinutes <= MAX_WORK_MINUTES + 60) // Allow 1hr buffer for overnight
          {
            workDays[bestDayIdx].assignedLocations.push({
              location: otherLoc.name,
              taskCount: otherLoc.tasks.length,
              estimatedTime: otherLoc.estimatedTime,
              maxUrgency: otherLoc.maxUrgency,
              tasks: otherLoc.tasks,
              direction: otherLoc.direction
            });
            assignedLocations[otherLoc.name.toLowerCase()] = true;
          }
        }
      }
    }
    Logger.log('Step 7 done');

    // Calculate plans for each day
    Logger.log('Step 8: Calculating day plans...');
    for (var d = 0; d < workDays.length; d++) {
      var day = workDays[d];

      if (day.assignedLocations.length > 0) {
        day.plan = calculateDayPlan(day.startLocation, day.assignedLocations, WORK_START_HOUR);

        // Handle overnight - next day starts from overnight city
        if (day.plan.overnightSuggested && !day.mustReturnToHelena && d < workDays.length - 1) {
          day.overnightCity = day.plan.endLocation;
          workDays[d + 1].startLocation = day.plan.endLocation;
        }

        // Force return on Tuesday
        if (day.mustReturnToHelena && day.plan.overnightSuggested) {
          day.plan.returnToHelena = true;
          day.plan.endLocation = 'Helena';
          day.plan.overnightSuggested = false;
          day.overnightCity = null;
          // Recalculate with forced return
          if (day.plan.stops && day.plan.stops.length > 0) {
            var returnDrive = getDriveTimeBetweenLocations(
              day.plan.stops[day.plan.stops.length - 1].location.toLowerCase(),
              'helena',
              driveTimeMap
            );
            day.plan.driveMinutes += returnDrive;
            day.plan.totalMinutes += returnDrive;
            day.plan.endTime = formatMinutesToTime(WORK_START_HOUR * 60 + day.plan.totalMinutes);
          }
        }

        // Flag days exceeding 10 hours for approval
        day.requiresOvertimeApproval = day.plan.totalMinutes > MAX_WORK_MINUTES;
      }
    }
    Logger.log('Step 8 done');

    // Calculate savings
    Logger.log('Step 9: Calculating savings...');
    var savings = calculateTripSavings(workDays, byLocation, driveTimeMap);
    Logger.log('Step 9 done');

    // Build result
    Logger.log('Step 10: Building result...');
    var unassigned = locationList.filter(function(loc) {
      return !assignedLocations[loc.name.toLowerCase()];
    });

    // NOTE: Office work is tracked separately in My Checklist (ToDoSchedule.html)
    // Trip Planner focuses on field trips only

    Logger.log('=== COMPLETE ===');
    Logger.log('Total locations assigned: ' + Object.keys(assignedLocations).length);
    Logger.log('Unassigned locations: ' + unassigned.length);

    // Clean the data for JSON serialization (remove Date objects, simplify tasks)
    var cleanWorkDays = workDays.map(function(day) {
      return {
        date: day.date,
        dateKey: day.dateKey,
        dayName: day.dayName,
        dayOfWeek: day.dayOfWeek,
        isTuesday: day.isTuesday,
        isFriday: day.isFriday,
        avoidIfPossible: day.avoidIfPossible,
        mustReturnToHelena: day.mustReturnToHelena,
        startLocation: day.startLocation,
        overnightCity: day.overnightCity,
        hasLockedTasks: day.hasLockedTasks,
        requiresOvertimeApproval: day.requiresOvertimeApproval || false,
        overtimeApproved: day.overtimeApproved || false,
        assignedLocations: (day.assignedLocations || []).map(function(loc) {
          return {
            location: loc.location,
            taskCount: loc.taskCount || 0,
            estimatedTime: loc.estimatedTime || 0,
            maxUrgency: loc.maxUrgency || 0,
            direction: loc.direction || 'Other',
            isManualTask: loc.isManualTask || false,
            isLocked: loc.isLocked || false,
            startTime: loc.startTime || '',
            endTime: loc.endTime || '',
            allowTimeChange: loc.allowTimeChange || false,
            source: loc.source || (loc.isManualTask ? 'Manual Tasks' : 'To Do List'),
            rowIndex: loc.rowIndex, // For single manual tasks
            taskType: loc.taskType || '', // For single manual tasks
            employee: loc.employee || '', // For single manual tasks
            notes: loc.notes || '', // For single manual tasks
            // Simplify tasks - just keep essential info for completion
            tasks: (loc.tasks || []).map(function(t) {
              return {
                rowIndex: t.rowIndex,
                source: t.source || (t.isManualTask ? 'Manual Tasks' : 'To Do List'),
                location: t.location,
                taskType: t.taskType || '',
                employee: t.employee || '',
                itemType: t.itemType || '',
                urgencyLabel: t.urgencyLabel || '',
                isManualTask: t.isManualTask || false
              };
            })
          };
        }),
        plan: day.plan ? {
          startLocation: day.plan.startLocation,
          startTime: day.plan.startTime,
          endLocation: day.plan.endLocation,
          endTime: day.plan.endTime,
          totalMinutes: day.plan.totalMinutes || 0,
          driveMinutes: day.plan.driveMinutes || 0,
          crewMinutes: day.plan.crewMinutes || 0,
          exceedsLimit: day.plan.exceedsLimit || false,
          overnightSuggested: day.plan.overnightSuggested || false,
          returnToHelena: day.plan.returnToHelena !== false,
          stops: (day.plan.stops || []).map(function(stop) {
            return {
              location: stop.location,
              arriveTime: stop.arriveTime,
              departTime: stop.departTime,
              driveTimeFromPrev: stop.driveTimeFromPrev || 0,
              crewTime: stop.crewTime || 0,
              taskCount: stop.taskCount || 0
            };
          })
        } : null
      };
    });

    var cleanUnassigned = unassigned.map(function(loc) {
      return {
        location: loc.name, // Standardized: use 'location' consistently
        name: loc.name, // Keep for backward compatibility
        direction: loc.direction,
        taskCount: loc.tasks ? loc.tasks.length : 0,
        maxUrgency: loc.maxUrgency || 0,
        estimatedTime: loc.estimatedTime || 0,
        // Include minimal task data for drag-drop and completion
        tasks: (loc.tasks || []).map(function(t) {
          return {
            rowIndex: t.rowIndex,
            source: t.source || 'To Do List',
            taskType: t.taskType || '',
            employee: t.employee || '',
            itemType: t.itemType || '',
            location: t.location || loc.name,
            urgencyLabel: t.urgencyLabel || ''
          };
        })
      };
    });

    // Include office tasks in the result
    var officeTasks = pendingData.officeTasks || [];
    Logger.log('Office tasks to include: ' + officeTasks.length);

    return {
      workDays: cleanWorkDays,
      unassignedLocations: cleanUnassigned,
      officeTasks: officeTasks, // Add office tasks for display
      savings: savings,
      driveTimeMap: driveTimeMap,
      overnightCities: getOvernightCities(),
      manualTasksSummary: {
        total: manualData.tasks.length,
        locked: manualData.lockedTasks.length,
        flexible: manualData.flexibleTasks.length
      }
    };

  } catch (e) {
    Logger.log('ERROR in suggestOptimalTrips: ' + e.toString());
    Logger.log('Stack: ' + e.stack);
    return {
      error: 'Error generating trip plan: ' + e.toString(),
      workDays: [],
      unassignedLocations: [],
      officeTasks: []
    };
  }
}

/**
 * Checks if there are any Office Work tasks in Manual Tasks sheet for the given date range.
 * @param {Date} startDate
 * @param {Date} endDate
 * @return {boolean}
 */
function hasOfficeTasksInRange(startDate, endDate) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var manualSheet = ss.getSheetByName('Manual Tasks');
  if (!manualSheet || manualSheet.getLastRow() < 2) return false;
  var data = manualSheet.getDataRange().getValues();
  var headers = data[0];
  var colIndex = {};
  for (var h = 0; h < headers.length; h++) {
    var header = String(headers[h]).toLowerCase().trim();
    if (header === 'location') colIndex.location = h;
    if (header === 'task type' || header === 'task') colIndex.taskType = h;
    if (header === 'scheduled date') colIndex.scheduledDate = h;
  }
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    if (
      row[colIndex.location] && String(row[colIndex.location]).toLowerCase() === 'helena' &&
      row[colIndex.taskType] && String(row[colIndex.taskType]).toLowerCase() === 'office work' &&
      row[colIndex.scheduledDate]
    ) {
      var taskDate = new Date(row[colIndex.scheduledDate]);
      if (taskDate >= startDate && taskDate <= endDate) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Checks if there are any Office Work tasks in Manual Tasks sheet at all (utility for front end).
 * @return {boolean}
 */
function hasAnyOfficeTasks() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var manualSheet = ss.getSheetByName('Manual Tasks');
  if (!manualSheet || manualSheet.getLastRow() < 2) return false;
  var data = manualSheet.getDataRange().getValues();
  var headers = data[0];
  var colIndex = {};
  for (var h = 0; h < headers.length; h++) {
    var header = String(headers[h]).toLowerCase().trim();
    if (header === 'location') colIndex.location = h;
    if (header === 'task type' || header === 'task') colIndex.taskType = h;
  }
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    if (
      row[colIndex.location] && String(row[colIndex.location]).toLowerCase() === 'helena' &&
      row[colIndex.taskType] && String(row[colIndex.taskType]).toLowerCase() === 'office work'
    ) {
      return true;
    }
  }
  return false;
}

// ============================================================================
// APPLY TO SCHEDULE - Phase 6
// ============================================================================

/**
 * Applies trip plan to Task Metadata by updating scheduled dates and times.
 * Phase 6: Updates Task Metadata sheet (not To Do List).
 *
 * Called from TripPlanner.html when user clicks "Apply to Schedule"
 *
 * @param {Array} daysToApply - Array of work day objects with assignedLocations
 * @return {Object} Result with success status and message
 */
function applyTripToSchedule(daysToApply) {
  Logger.log('=== applyTripToSchedule (Phase 6 - Task Metadata) ===');
  Logger.log('Days to apply: ' + daysToApply.length);

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var metadataSheet = ss.getSheetByName('Task Metadata');

  if (!metadataSheet) {
    return { success: false, message: 'Task Metadata sheet not found. Please run Generate Task Metadata first.' };
  }

  var metadataData = metadataSheet.getDataRange().getValues();
  var headers = metadataData[0];

  // Build column index map
  var colMap = {};
  for (var h = 0; h < headers.length; h++) {
    colMap[headers[h]] = h;
  }

  Logger.log('Task Metadata columns: ' + JSON.stringify(colMap));

  // Required columns
  var sourceSheetCol = colMap['SourceSheet'];
  var sourceRowCol = colMap['SourceRow'];
  var locationCol = colMap['Location'];
  var scheduledDateCol = colMap['ScheduledDate'];
  var startTimeCol = colMap['StartTime'];
  var endTimeCol = colMap['EndTime'];
  var lastModifiedCol = colMap['LastModified'];
  var statusCol = colMap['Status'];

  if (scheduledDateCol === undefined) {
    return { success: false, message: 'ScheduledDate column not found in Task Metadata' };
  }

  if (locationCol === undefined) {
    return { success: false, message: 'Location column not found in Task Metadata' };
  }

  // Log all unique locations in Task Metadata for debugging
  var metadataLocations = {};
  for (var m = 1; m < metadataData.length; m++) {
    var loc = String(metadataData[m][locationCol] || '').toLowerCase().trim();
    if (loc && !metadataLocations[loc]) {
      metadataLocations[loc] = 0;
    }
    if (loc) metadataLocations[loc]++;
  }
  Logger.log('Unique locations in Task Metadata: ' + JSON.stringify(metadataLocations));

  var today = new Date();
  today.setHours(0, 0, 0, 0);

  var updatedCount = 0;
  var skippedCount = 0;
  var skippedComplete = 0;
  var errorCount = 0;
  var noMatchCount = 0;

  // Process each day
  for (var d = 0; d < daysToApply.length; d++) {
    var day = daysToApply[d];
    var dateKey = day.dateKey;
    var locations = day.assignedLocations || [];

    if (!dateKey || locations.length === 0) continue;

    // Parse the target date
    var targetDate = new Date(dateKey + 'T12:00:00'); // Use noon to avoid timezone issues
    if (isNaN(targetDate.getTime())) {
      Logger.log('Invalid date: ' + dateKey);
      continue;
    }

    Logger.log('Processing ' + day.dayName + ' (' + dateKey + ') with ' + locations.length + ' locations');

    // Get arrival times from day plan
    var arrivalTimes = {};
    if (day.plan && day.plan.stops) {
      for (var s = 0; s < day.plan.stops.length; s++) {
        var stop = day.plan.stops[s];
        if (stop.location && stop.arrivalTime) {
          arrivalTimes[stop.location.toLowerCase()] = stop.arrivalTime;
        }
      }
    }

    // Process each location on this day
    for (var loc = 0; loc < locations.length; loc++) {
      var locData = locations[loc];
      var locationName = locData.name || locData.location || '';

      if (!locationName) {
        Logger.log('  WARNING: Location has no name: ' + JSON.stringify(locData));
        continue;
      }

      // Skip manual tasks (they're already in Manual Tasks sheet)
      if (locData.isManualTask) {
        Logger.log('  Skipping manual task: ' + locationName);
        continue;
      }

      // Get arrival time for this location
      var arrivalTime = arrivalTimes[locationName.toLowerCase()] || locData.arrivalTime || '';

      // Find matching tasks in Task Metadata by location
      var locLower = locationName.toLowerCase();
      var matchedForThisLocation = 0;

      Logger.log('  Looking for location: "' + locLower + '" (taskCount: ' + (locData.taskCount || locData.tasks?.length || 'unknown') + ')');

      for (var row = 1; row < metadataData.length; row++) {
        var rowData = metadataData[row];
        var rowLocation = locationCol !== undefined ? String(rowData[locationCol] || '').toLowerCase().trim() : '';

        // Match location
        if (rowLocation !== locLower) continue;

        // Skip completed tasks
        var status = statusCol !== undefined ? String(rowData[statusCol] || '').toLowerCase() : '';
        if (status === 'complete' || status === 'completed') {
          skippedComplete++;
          continue;
        }

        // Check if already scheduled for a future date (don't override)
        var existingScheduledDate = rowData[scheduledDateCol];
        if (existingScheduledDate) {
          var existingDate = existingScheduledDate instanceof Date ?
            existingScheduledDate : new Date(existingScheduledDate);
          if (!isNaN(existingDate.getTime())) {
            existingDate.setHours(0, 0, 0, 0);
            if (existingDate > today) {
              Logger.log('    Skipping row ' + (row + 1) + ' - already scheduled for ' + existingDate.toDateString());
              skippedCount++;
              continue;
            }
          }
        }

        // Update the task
        try {
          // Set scheduled date
          metadataSheet.getRange(row + 1, scheduledDateCol + 1).setValue(targetDate);

          // Set start time if available
          if (startTimeCol !== undefined && arrivalTime) {
            metadataSheet.getRange(row + 1, startTimeCol + 1).setValue(arrivalTime);
          }

          // Update last modified
          if (lastModifiedCol !== undefined) {
            metadataSheet.getRange(row + 1, lastModifiedCol + 1).setValue(new Date());
          }

          updatedCount++;
          matchedForThisLocation++;
          Logger.log('    Updated row ' + (row + 1) + ' (' + rowLocation + ') to ' + dateKey + (arrivalTime ? ' @ ' + arrivalTime : ''));

        } catch (e) {
          Logger.log('    Error updating row ' + (row + 1) + ': ' + e);
          errorCount++;
        }
      }

      if (matchedForThisLocation === 0) {
        Logger.log('  WARNING: No matching tasks found for location "' + locLower + '"');
        noMatchCount++;
      } else {
        Logger.log('  Matched ' + matchedForThisLocation + ' tasks for "' + locLower + '"');
      }
    }
  }

  var message = 'Updated ' + updatedCount + ' task(s) in Task Metadata';
  if (skippedCount > 0) {
    message += ', skipped ' + skippedCount + ' (already scheduled)';
  }
  if (skippedComplete > 0) {
    message += ', skipped ' + skippedComplete + ' (completed)';
  }
  if (noMatchCount > 0) {
    message += ', ' + noMatchCount + ' location(s) had no matching tasks';
  }
  if (errorCount > 0) {
    message += ', ' + errorCount + ' error(s)';
  }

  Logger.log('=== applyTripToSchedule COMPLETE: ' + message + ' ===');

  return {
    success: true,
    message: message,
    updated: updatedCount,
    skipped: skippedCount,
    noMatch: noMatchCount,
    errors: errorCount
  };
}

