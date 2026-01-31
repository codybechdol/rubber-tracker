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
 */

/* global getDriveTimeMap, calculateDriveTimeBetween */
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

// Non-drivable locations (office/phone work only - excluded from trip planning)
// These are handled in getPendingTasksWithLocations()
var OFFICE_ONLY_LOCATIONS = [
  'helena',           // Home base
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
  if (loc === 'helena') return 'Local';

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
        dateKey = formatDateKey(dateObj);
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
 * Collects tasks directly from source sheets (Glove Swaps, Sleeve Swaps, etc.)
 * and formats them for Trip Planner use. This bypasses the To Do List sheet entirely.
 *
 * @return {Object} Tasks formatted for Trip Planner {tasks: [], byLocation: {}, byDirection: {}, officeTasks: []}
 */
function collectTasksForTripPlanner() {
  Logger.log('=== collectTasksForTripPlanner (Direct Source Reading) ===');

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var today = new Date();
  today.setHours(0, 0, 0, 0);

  // Use collectAndGroupTasks from 76-SmartScheduling.gs to get all pending tasks
  var tasksByLocation = collectAndGroupTasks(ss);

  Logger.log('collectAndGroupTasks returned ' + Object.keys(tasksByLocation).length + ' locations');

  var tasks = [];
  var byLocation = {};
  var byDirection = {};
  var officeTasks = []; // NEW: Track office work tasks separately
  var skippedCount = { helena: 0, certExpiring: 0, futureScheduled: 0 };
  var trainingCount = 0; // Track training tasks specifically
  var rowCounter = 1; // Virtual row counter for tasks that don't have real row indices

  for (var locationName in tasksByLocation) {
    var locationTasks = tasksByLocation[locationName];

    // Skip non-drivable locations (office work only) - BUT collect them for office tasks
    var locLower = locationName.toLowerCase();
    var isOfficeLocation = (locLower === 'helena' ||
        locLower === 'weeds' ||
        locLower === 'unknown' ||
        locLower === 'previous employee' ||
        locLower === 'light duty' ||
        locLower === 'vacation' ||
        locLower === 'leave');

    if (isOfficeLocation) {
      // Collect these as office tasks instead of skipping entirely
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
          certType: sourceTask.certType || '',
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

      // Skip tasks already scheduled for a future date
      if (sourceTask.scheduledDate) {
        var scheduledDateObj = sourceTask.scheduledDate instanceof Date ?
            sourceTask.scheduledDate : new Date(sourceTask.scheduledDate);
        if (!isNaN(scheduledDateObj.getTime())) {
          scheduledDateObj.setHours(0, 0, 0, 0);
          if (scheduledDateObj > today) {
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

  Logger.log('=== DIRECT READ SUMMARY ===');
  Logger.log('Found ' + tasks.length + ' pending tasks in ' + Object.keys(byLocation).length + ' locations');
  Logger.log('Task breakdown: ' + trainingCount + ' training, ' + (tasks.length - trainingCount) + ' other');
  Logger.log('Office tasks collected: ' + officeTasks.length);
  Logger.log('Skipped from field trips: ' + skippedCount.helena + ' Helena/office, ' + skippedCount.certExpiring + ' cert expiring (phone), ' + skippedCount.futureScheduled + ' future scheduled');

  return {
    tasks: tasks,
    byLocation: byLocation,
    byDirection: byDirection,
    officeTasks: officeTasks, // NEW: Include office tasks
    directRead: true // Flag to indicate this used direct source reading
  };
}

/**
 * Gets all pending tasks with locations for Trip Planner.
 * Now reads directly from source sheets (Glove Swaps, Sleeve Swaps, etc.)
 * instead of relying on the To Do List sheet.
 *
 * Called from TripPlanner.html
 *
 * @return {Object} Tasks grouped by location with urgency scores
 */
function getPendingTasksWithLocations() {
  Logger.log('=== getPendingTasksWithLocations (Using Direct Source Reading) ===');

  try {
    // Use direct source reading - no need for To Do List sheet
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
        var dateKey = formatDateKey(currentDate);

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
        name: loc.name,
        direction: loc.direction,
        taskCount: loc.tasks ? loc.tasks.length : 0,
        maxUrgency: loc.maxUrgency || 0,
        estimatedTime: loc.estimatedTime || 0
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
// DAY PLAN ADJUSTMENTS
// ============================================================================


/**
 * Recalculates day plan when user makes changes.
 * Called from TripPlanner.html when user drags locations.
 *
 * @param {Object} dayData - Day data with startLocation, assignedLocations, and arriveAt7am flag
 * @return {Object} Updated day plan
 */
function recalculateDayPlan(dayData) {
  var startLocation = dayData.startLocation || 'Helena';
  var assignedLocations = dayData.assignedLocations || [];
  var arriveFirstBy7am = dayData.arriveFirstBy7am || false;
  var endLocation = dayData.endLocation || 'Helena'; // Where user wants to end up

  // Calculate the regular day plan starting from the start location at 7am
  var plan = calculateDayPlan(
    startLocation,
    assignedLocations,
    WORK_START_HOUR,
    endLocation // Pass the desired end location
  );

  // If "arrive first stop by 7am" mode, calculate early drive time from start location to first stop
  // This drive time is tracked but NOT counted against the 10-hour limit
  if (arriveFirstBy7am && assignedLocations && assignedLocations.length > 0) {
    var driveTimeMap = getDriveTimeMap();
    var firstStop = assignedLocations[0].location;

    // Calculate drive time from start location to first stop
    var earlyDriveMinutes = getDriveTimeBetweenLocations(
      startLocation.toLowerCase(),
      firstStop.toLowerCase(),
      driveTimeMap
    );

    plan.earlyDriveMinutes = earlyDriveMinutes;
    plan.earlyDriveFrom = startLocation;
    plan.arriveFirstBy7am = true;
    plan.firstStop = firstStop;

    // The early drive is NOT added to totalMinutes (doesn't count against 10hr)
    // But we track it separately for reporting
    plan.totalDriveIncludingEarly = plan.driveMinutes + earlyDriveMinutes;

    // Recalculate exceeds limit WITHOUT the early drive
    plan.exceedsLimit = plan.totalMinutes > MAX_WORK_MINUTES;

    Logger.log('Arrive first stop by 7am: ' + earlyDriveMinutes + ' min early drive from ' + startLocation + ' to ' + firstStop + ' (not counted in 10hr)');
  }

  return plan;
}

/**
 * Updates overnight city for a day and recalculates subsequent day's start.
 *
 * @param {string} dayKey - Date key of the day
 * @param {string} overnightCity - City to stay overnight
 * @return {Object} Updated plan data
 */
function updateOvernightCity(dayKey, overnightCity) {
  // This would need to update the saved plan if persistence is active
  Logger.log('Updating overnight city for ' + dayKey + ' to ' + overnightCity);
  return { success: true, overnightCity: overnightCity };
}

/**
 * Simple test - just checks if sheets exist
 * Run from Extensions > Apps Script > select testTripPlannerSheets > Run
 */
function testTripPlannerSheets() {
  var ui = SpreadsheetApp.getUi();
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  var todoSheet = ss.getSheetByName('To Do List');
  var manualSheet = ss.getSheetByName('Manual Tasks');

  var msg = '=== Sheet Check ===\n\n';

  if (todoSheet) {
    msg += '✅ To Do List sheet exists\n';
    msg += '   Rows: ' + todoSheet.getLastRow() + '\n';
    msg += '   Cols: ' + todoSheet.getLastColumn() + '\n';
  } else {
    msg += '❌ To Do List sheet NOT FOUND\n';
    msg += '   Run "Generate Smart Schedule" first!\n';
  }

  msg += '\n';

  if (manualSheet) {
    msg += '✅ Manual Tasks sheet exists\n';
    msg += '   Rows: ' + manualSheet.getLastRow() + '\n';
    msg += '   Cols: ' + manualSheet.getLastColumn() + '\n';

    // Check headers
    if (manualSheet.getLastRow() > 0) {
      var headers = manualSheet.getRange(1, 1, 1, manualSheet.getLastColumn()).getValues()[0];
      msg += '   Headers: ' + headers.join(', ') + '\n';

      // Check if new columns exist
      var hasLocked = headers.some(function(h) { return String(h).toLowerCase() === 'locked'; });
      if (hasLocked) {
        msg += '   ✅ Has flexibility columns\n';
      } else {
        msg += '   ⚠️ Missing flexibility columns - run Migrate Manual Tasks Sheet\n';
      }
    }
  } else {
    msg += '⚠️ Manual Tasks sheet NOT FOUND (will be created when you add first task)\n';
  }

  ui.alert('Trip Planner Sheet Check', msg, ui.ButtonSet.OK);
}

/**
 * Removes a manual task from the Manual Tasks sheet.
 * Called from TripPlanner.html when user removes a manual task.
 *
 * @param {number} rowIndex - The row index (1-based) of the task to remove
 * @return {Object} Result with success flag and message
 */
function removeManualTaskFromSheet(rowIndex) {
  Logger.log('removeManualTaskFromSheet called with rowIndex: ' + rowIndex);

  if (!rowIndex || rowIndex < 2) {
    return { success: false, error: 'Invalid row index: ' + rowIndex };
  }

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var manualSheet = ss.getSheetByName('Manual Tasks');

  if (!manualSheet) {
    return { success: false, error: 'Manual Tasks sheet not found' };
  }

  var lastRow = manualSheet.getLastRow();
  if (rowIndex > lastRow) {
    return { success: false, error: 'Row ' + rowIndex + ' does not exist (last row is ' + lastRow + ')' };
  }

  try {
    // Get task info before deleting for logging
    var taskData = manualSheet.getRange(rowIndex, 1, 1, manualSheet.getLastColumn()).getValues()[0];
    var headers = manualSheet.getRange(1, 1, 1, manualSheet.getLastColumn()).getValues()[0];

    var colIndex = {};
    for (var h = 0; h < headers.length; h++) {
      var header = String(headers[h]).toLowerCase().trim();
      if (header === 'location') colIndex.location = h;
      if (header === 'task' || header === 'task type') colIndex.taskType = h;
      if (header === 'employee') colIndex.employee = h;
    }

    var taskInfo = (colIndex.taskType !== undefined ? taskData[colIndex.taskType] : 'Task') +
                   ' at ' + (colIndex.location !== undefined ? taskData[colIndex.location] : 'Unknown');

    Logger.log('Deleting manual task: ' + taskInfo + ' at row ' + rowIndex);

    // Delete the row
    manualSheet.deleteRow(rowIndex);

    return { success: true, message: 'Removed: ' + taskInfo };
  } catch (e) {
    Logger.log('Error removing manual task: ' + e.toString());
    return { success: false, error: e.toString() };
  }
}

/**
 * Removes a completed task from the current trip plan view (locally).
 * Updates the To Do List or Manual Tasks sheet to mark as complete.
 * This is called when marking tasks complete in Trip Planner.
 *
 * @param {Object} task - Task object with source and rowIndex
 * @return {Object} Result with success flag
 */
function removeTaskFromTripPlan(task) {
  if (!task || !task.rowIndex) {
    return { success: false, error: 'Invalid task data' };
  }

  // The actual completion is handled by markScheduleTaskComplete
  // This function is here for any additional cleanup if needed
  return { success: true };
}

/**
 * Test function to run suggestOptimalTrips directly
 * Run this from Apps Script editor to see the logs
 */
function testSuggestOptimalTrips() {
  var ui = SpreadsheetApp.getUi();
  ui.alert('Starting...', 'Running suggestOptimalTrips(14)...', ui.ButtonSet.OK);

  var startTime = new Date();
  var result = suggestOptimalTrips(14);
  var endTime = new Date();
  var duration = (endTime - startTime) / 1000;

  var msg = 'Completed in ' + duration + ' seconds\n\n';

  if (result.error) {
    msg += '❌ Error: ' + result.error;
  } else {
    msg += '✅ Success!\n';
    msg += 'Work days: ' + result.workDays.length + '\n';

    var daysWithTasks = result.workDays.filter(function(d) {
      return d.assignedLocations && d.assignedLocations.length > 0;
    }).length;
    msg += 'Days with tasks: ' + daysWithTasks + '\n';
    msg += 'Unassigned locations: ' + result.unassignedLocations.length + '\n';

    if (result.manualTasksSummary) {
      msg += '\nManual tasks: ' + result.manualTasksSummary.total + ' (locked: ' + result.manualTasksSummary.locked + ')';
    }
  }

  ui.alert('suggestOptimalTrips Result', msg, ui.ButtonSet.OK);
  return result;
}

/**
 * Purges all tasks for a specific location from all storage.
 * Use this to completely remove stuck tasks.
 *
 * Menu: Run from Apps Script editor or call purgeBillingsTask()
 *
 * @param {string} locationName - Location to purge (e.g., "Billings")
 * @return {Object} Summary of what was deleted
 */
function purgeTasksByLocation(locationName) {
  if (!locationName) {
    locationName = 'Billings'; // Default for the stuck task
  }

  var ui = SpreadsheetApp.getUi();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var summary = {
    toDoListDeleted: 0,
    manualTasksDeleted: 0,
    savedPlanCleared: false
  };

  var locationLower = locationName.toLowerCase().trim();

  // 1. Delete from To Do List sheet
  var todoSheet = ss.getSheetByName('To Do List');
  if (todoSheet && todoSheet.getLastRow() > 13) {
    var todoData = todoSheet.getDataRange().getValues();
    var rowsToDelete = [];

    // Find location column (usually column E or "Location")
    var headers = todoData[12] || []; // Row 13 has headers
    var locCol = -1;
    for (var h = 0; h < headers.length; h++) {
      if (String(headers[h]).toLowerCase().indexOf('location') !== -1) {
        locCol = h;
        break;
      }
    }

    if (locCol >= 0) {
      // Find rows to delete (from bottom up to avoid index shifting)
      for (var i = todoData.length - 1; i >= 13; i--) {
        var rowLoc = String(todoData[i][locCol] || '').toLowerCase().trim();
        if (rowLoc === locationLower || rowLoc.indexOf(locationLower) !== -1) {
          rowsToDelete.push(i + 1); // Convert to 1-based row number
        }
      }

      // Delete rows from bottom up
      rowsToDelete.forEach(function(rowNum) {
        todoSheet.deleteRow(rowNum);
        summary.toDoListDeleted++;
      });
    }
    Logger.log('Deleted ' + summary.toDoListDeleted + ' rows from To Do List');
  }

  // 2. Delete from Manual Tasks sheet
  var manualSheet = ss.getSheetByName('Manual Tasks');
  if (manualSheet && manualSheet.getLastRow() > 1) {
    var manualData = manualSheet.getDataRange().getValues();
    var manualHeaders = manualData[0];
    var manualLocCol = -1;

    for (var mh = 0; mh < manualHeaders.length; mh++) {
      if (String(manualHeaders[mh]).toLowerCase().trim() === 'location') {
        manualLocCol = mh;
        break;
      }
    }

    if (manualLocCol >= 0) {
      var manualRowsToDelete = [];
      for (var mi = manualData.length - 1; mi >= 1; mi--) {
        var manualLoc = String(manualData[mi][manualLocCol] || '').toLowerCase().trim();
        if (manualLoc === locationLower || manualLoc.indexOf(locationLower) !== -1) {
          manualRowsToDelete.push(mi + 1);
        }
      }

      manualRowsToDelete.forEach(function(rowNum) {
        manualSheet.deleteRow(rowNum);
        summary.manualTasksDeleted++;
      });
    }
    Logger.log('Deleted ' + summary.manualTasksDeleted + ' rows from Manual Tasks');
  }

  // 3. Clear saved trip plan from UserProperties
  var userProps = PropertiesService.getUserPropertiesService.getUserProperties();
  userProps.deleteProperty('tripPlan');
  summary.savedPlanCleared = true;
  Logger.log('Cleared saved trip plan from UserProperties');

  // Show summary
  var msg = '=== PURGE COMPLETE: ' + locationName + ' ===\n\n';
  msg += '📋 To Do List: Deleted ' + summary.toDoListDeleted + ' row(s)\n';
  msg += '📝 Manual Tasks: Deleted ' + summary.manualTasksDeleted + ' row(s)\n';
  msg += '💾 Saved Trip Plan: Cleared\n\n';
  msg += 'NEXT STEPS:\n';
  msg += '1. Close and reopen Trip Planner\n';
  msg += '2. The task should be gone\n';
  msg += '3. Run "Generate Smart Schedule" to refresh To Do List';

  ui.alert('Purge Complete', msg, ui.ButtonSet.OK);

  return summary;
}

/**
 * Quick function to purge the stuck Billings task.
 * Run this from Apps Script editor: purgeBillingsTask()
 */
function purgeBillingsTask() {
  return purgeTasksByLocation('Billings');
}

// ============================================================================
// OFFICE TASKS MANAGEMENT
// ============================================================================

/**
 * Saves office tasks to Manual Tasks sheet for a specific date.
 * Called when dragging the "Office" card to a day in Trip Planner.
 *
 * @param {string} dateKey - Date key (YYYY-MM-DD)
 * @param {Array} officeTasks - Array of office task descriptions
 * @return {Object} Result with success flag and message
 */
function saveOfficeTasks(dateKey, officeTasks) {
  Logger.log('=== saveOfficeTasks: ' + dateKey + ' ===');
  Logger.log('Tasks: ' + JSON.stringify(officeTasks));

  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var manualSheet = ss.getSheetByName('Manual Tasks');

    if (!manualSheet) {
      return { success: false, error: 'Manual Tasks sheet not found' };
    }

    var taskDate = new Date(dateKey);
    var rowsAdded = 0;

    // Add each office task as a separate row in Manual Tasks
    for (var i = 0; i < officeTasks.length; i++) {
      var task = officeTasks[i];
      if (!task || !task.description || task.description.trim() === '') continue;

      // Append row: Location, Task Type, Employee, Scheduled Date, Start Time, End Time, Status, Notes
      var newRow = [
        'Helena',                           // Location
        'Office Work',                      // Task Type
        '',                                 // Employee (empty)
        taskDate,                          // Scheduled Date
        task.startTime || '',              // Start Time
        task.endTime || '',                // End Time
        'Pending',                         // Status
        task.description,                  // Notes
        false,                             // Locked
        false,                             // Allow Day Change
        false,                             // Allow Week Change
        false                              // Allow Time Change
      ];

      manualSheet.appendRow(newRow);
      rowsAdded++;
    }

    Logger.log('Added ' + rowsAdded + ' office tasks to Manual Tasks sheet');

    return {
      success: true,
      message: 'Added ' + rowsAdded + ' office task(s)',
      rowsAdded: rowsAdded
    };

  } catch (e) {
    Logger.log('Error saving office tasks: ' + e);
    return {
      success: false,
      error: e.toString()
    };
  }
}

/**
 * Gets office tasks for a specific date from Manual Tasks sheet.
 * Used to display existing office tasks when user clicks on an Office card.
 *
 * @param {string} dateKey - Date key (YYYY-MM-DD)
 * @return {Array} Array of office task objects
 */
function getOfficeTasksForDate(dateKey) {
  Logger.log('=== getOfficeTasksForDate: ' + dateKey + ' ===');

  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var manualSheet = ss.getSheetByName('Manual Tasks');

    if (!manualSheet || manualSheet.getLastRow() < 2) {
      return [];
    }

    var data = manualSheet.getDataRange().getValues();
    var headers = data[0];

    // Find column indices
    var colIndex = {};
    for (var h = 0; h < headers.length; h++) {
      var header = String(headers[h]).toLowerCase().trim();
      if (header === 'location') colIndex.location = h;
      if (header === 'task type' || header === 'task') colIndex.taskType = h;
      if (header === 'scheduled date') colIndex.scheduledDate = h;
      if (header === 'start time') colIndex.startTime = h;
      if (header === 'end time') colIndex.endTime = h;
      if (header === 'notes') colIndex.notes = h;
      if (header === 'status') colIndex.status = h;
    }

    var targetDate = new Date(dateKey);
    targetDate.setHours(0, 0, 0, 0);

    var officeTasks = [];

    for (var i = 1; i < data.length; i++) {
      var row = data[i];

      // Check if this is a Helena/Office task
      var location = colIndex.location !== undefined ? String(row[colIndex.location] || '').toLowerCase().trim() : '';
      if (location !== 'helena') continue;

      // Check if task type is Office Work
      var taskType = colIndex.taskType !== undefined ? String(row[colIndex.taskType] || '').toLowerCase().trim() : '';
      if (taskType !== 'office work') continue;

      // Check if scheduled for this date
      var scheduledDate = colIndex.scheduledDate !== undefined ? row[colIndex.scheduledDate] : null;
      if (!scheduledDate) continue;

      var taskDate = scheduledDate instanceof Date ? scheduledDate : new Date(scheduledDate);
      if (isNaN(taskDate.getTime())) continue;
      taskDate.setHours(0, 0, 0, 0);

      if (taskDate.getTime() !== targetDate.getTime()) continue;

      // This is an office task for this date
      var startTime = colIndex.startTime !== undefined ? formatTimeValue(row[colIndex.startTime]) : '';
      var endTime = colIndex.endTime !== undefined ? formatTimeValue(row[colIndex.endTime]) : '';
      var notes = colIndex.notes !== undefined ? String(row[colIndex.notes] || '') : '';
      var status = colIndex.status !== undefined ? String(row[colIndex.status] || '').toLowerCase() : '';

      officeTasks.push({
        description: notes,
        startTime: startTime,
        endTime: endTime,
        status: status,
        rowIndex: i + 1
      });
    }

    Logger.log('Found ' + officeTasks.length + ' office tasks for ' + dateKey);
    return officeTasks;

  } catch (e) {
    Logger.log('Error getting office tasks: ' + e);
    return [];
  }
}

