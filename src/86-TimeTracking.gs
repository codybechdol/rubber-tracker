/**
 * Glove Manager – Time Tracking & Daily Accomplishment Breakdown
 *
 * Generates formatted daily breakdown of completed tasks for timesheet copy/paste.
 * Groups by date, then by crew/location visited with auto-calculated travel times.
 */

/* global getDriveTimeMap */
/* eslint-disable no-unused-vars */

// ============================================================================
// DIALOG FUNCTIONS
// ============================================================================

/**
 * Shows the Time Breakdown dialog.
 * Menu item: Glove Manager → Reports → Daily Accomplishments
 */
function showTimeBreakdownDialog() {
  var html = HtmlService.createHtmlOutputFromFile('TimeBreakdown')
    .setWidth(900)
    .setHeight(700)
    .setTitle('Daily Accomplishments');
  SpreadsheetApp.getUi().showModalDialog(html, '📝 Daily Accomplishments');
}

// ============================================================================
// DATA COLLECTION FUNCTIONS
// ============================================================================

/**
 * Gets completed tasks for a date range.
 * Phase 6: Now uses Task Metadata as single source of truth.
 * Called from TimeBreakdown.html
 *
 * @param {string} startDateStr - Start date string (YYYY-MM-DD)
 * @param {string} endDateStr - End date string (YYYY-MM-DD)
 * @return {Object} Completed tasks grouped by date with summary
 */
function getCompletedTasksForPeriod(startDateStr, endDateStr) {
  Logger.log('=== getCompletedTasksForPeriod (Phase 6): ' + startDateStr + ' to ' + endDateStr + ' ===');

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var startDate = new Date(startDateStr);
  var endDate = new Date(endDateStr);
  startDate.setHours(0, 0, 0, 0);
  endDate.setHours(23, 59, 59, 999);

  var allTasks = [];

  // Phase 6: Primary source is Task Metadata
  var metadataTasks = collectCompletedFromTaskMetadata(ss, startDate, endDate);
  allTasks = allTasks.concat(metadataTasks);
  Logger.log('Collected ' + metadataTasks.length + ' tasks from Task Metadata');

  // Also collect from Manual Tasks (these may not all be in Task Metadata)
  var manualTasks = collectCompletedFromManualTasks(ss, startDate, endDate);
  allTasks = allTasks.concat(manualTasks);
  Logger.log('Collected ' + manualTasks.length + ' tasks from Manual Tasks');

  // Also collect from Training Tracking (completion dates)
  var trainingTasks = collectCompletedFromTrainingTracking(ss, startDate, endDate);
  allTasks = allTasks.concat(trainingTasks);
  Logger.log('Collected ' + trainingTasks.length + ' tasks from Training Tracking');

  Logger.log('Total completed tasks: ' + allTasks.length);

  // Group by date, then by crew/location
  var breakdown = getDailyBreakdown(allTasks);

  // Add week summary
  breakdown.weekSummary = getWeekSummary(breakdown);

  // Check for missing times
  breakdown.missingTimesAlert = getMissingTimesAlert(allTasks);

  return breakdown;
}

/**
 * Phase 6: Collects completed tasks from Task Metadata sheet.
 * This is now the primary source for completed tasks.
 */
function collectCompletedFromTaskMetadata(ss, startDate, endDate) {
  var tasks = [];
  var metadataSheet = ss.getSheetByName('Task Metadata');

  if (!metadataSheet || metadataSheet.getLastRow() <= 1) {
    Logger.log('Task Metadata sheet not found or empty - falling back to To Do List');
    return collectCompletedFromToDoList(ss, startDate, endDate);
  }

  var data = metadataSheet.getDataRange().getValues();
  var headers = data[0];

  // Build column index map
  var colMap = {};
  for (var h = 0; h < headers.length; h++) {
    colMap[headers[h]] = h;
  }

  // Required columns
  var statusCol = colMap['Status'];
  var completedDateCol = colMap['CompletedDate'];
  var scheduledDateCol = colMap['ScheduledDate'];
  var locationCol = colMap['Location'];
  var taskTypeCol = colMap['TaskType'];
  var employeeCol = colMap['Employee'];
  var itemTypeCol = colMap['ItemType'];
  var foremanCol = colMap['Foreman'];
  var startTimeCol = colMap['StartTime'];
  var endTimeCol = colMap['EndTime'];
  var notesCol = colMap['Notes'];
  var sourceSheetCol = colMap['SourceSheet'];

  for (var i = 1; i < data.length; i++) {
    var row = data[i];

    // Check if completed
    var status = statusCol !== undefined ? String(row[statusCol] || '').toLowerCase() : '';
    if (status !== 'complete' && status !== 'completed') {
      continue;
    }

    // Get completed date (prefer CompletedDate, fall back to ScheduledDate)
    var taskDate = null;
    if (completedDateCol !== undefined && row[completedDateCol]) {
      taskDate = row[completedDateCol] instanceof Date ? row[completedDateCol] : new Date(row[completedDateCol]);
    } else if (scheduledDateCol !== undefined && row[scheduledDateCol]) {
      taskDate = row[scheduledDateCol] instanceof Date ? row[scheduledDateCol] : new Date(row[scheduledDateCol]);
    }

    if (!taskDate || isNaN(taskDate.getTime())) continue;
    taskDate.setHours(0, 0, 0, 0);

    // Check if within date range
    if (taskDate < startDate || taskDate > endDate) continue;

    var location = locationCol !== undefined ? String(row[locationCol] || '') : '';
    var taskType = taskTypeCol !== undefined ? String(row[taskTypeCol] || '') : '';
    var employee = employeeCol !== undefined ? String(row[employeeCol] || '') : '';
    var itemType = itemTypeCol !== undefined ? String(row[itemTypeCol] || '') : '';
    var foreman = foremanCol !== undefined ? String(row[foremanCol] || '') : '';
    var startTime = startTimeCol !== undefined ? formatTimeValueForBreakdown(row[startTimeCol]) : '';
    var endTime = endTimeCol !== undefined ? formatTimeValueForBreakdown(row[endTimeCol]) : '';
    var notes = notesCol !== undefined ? String(row[notesCol] || '') : '';
    var sourceSheet = sourceSheetCol !== undefined ? String(row[sourceSheetCol] || '') : '';

    // Estimate time based on task type
    var estimatedTime = getTaskEstimatedTime(taskType);

    tasks.push({
      date: formatDateKey(taskDate),
      dateObj: taskDate,
      location: location || 'Helena',
      taskType: taskType,
      employee: employee,
      itemType: itemType,
      foreman: foreman,
      crew: '',
      estimatedTime: estimatedTime,
      startTime: startTime,
      endTime: endTime,
      notes: notes,
      source: 'Task Metadata (' + sourceSheet + ')'
    });
  }

  return tasks;
}

/**
 * Helper function to format time values for breakdown.
 */
function formatTimeValueForBreakdown(timeVal) {
  if (!timeVal) return '';
  if (timeVal instanceof Date) {
    var hours = timeVal.getHours();
    var mins = timeVal.getMinutes();
    return String(hours).padStart(2, '0') + ':' + String(mins).padStart(2, '0');
  }
  var timeStr = String(timeVal).trim();
  if (/^\d{1,2}:\d{2}/.test(timeStr)) {
    var parts = timeStr.match(/^(\d{1,2}):(\d{2})/);
    if (parts) {
      return String(parseInt(parts[1])).padStart(2, '0') + ':' + parts[2];
    }
  }
  return timeStr;
}

/**
 * Gets estimated time for a task type in minutes.
 */
function getTaskEstimatedTime(taskType) {
  var type = (taskType || '').toLowerCase();
  if (type.indexOf('training') !== -1) return 60;
  if (type.indexOf('swap') !== -1 || type.indexOf('change') !== -1) return 10;
  if (type.indexOf('cert') !== -1) return 15;
  if (type.indexOf('reclaim') !== -1) return 15;
  return 30; // Default
}

/**
 * Legacy function: Collects completed tasks from To Do List sheet.
 * Kept as fallback if Task Metadata is not available.
 */
function collectCompletedFromToDoList(ss, startDate, endDate) {
  var tasks = [];
  var todoSheet = ss.getSheetByName('To Do List');

  if (!todoSheet || todoSheet.getLastRow() < 14) {
    return tasks;
  }

  var data = todoSheet.getDataRange().getValues();
  var headers = data[12] || []; // Row 13 has headers

  // Find column indices
  var colIndex = {};
  for (var h = 0; h < headers.length; h++) {
    var header = String(headers[h]).toLowerCase().trim();
    if (header.indexOf('location') !== -1 && header.indexOf('visit') !== -1) colIndex.location = h;
    if (header === 'location') colIndex.locationAlt = h;
    if (header.indexOf('task type') !== -1) colIndex.taskType = h;
    if (header.indexOf('employee') !== -1) colIndex.employee = h;
    if (header.indexOf('item type') !== -1) colIndex.itemType = h;
    if (header === 'size') colIndex.size = h;
    if (header.indexOf('scheduled') !== -1) colIndex.scheduledDate = h;
    if (header.indexOf('completed') !== -1) colIndex.completed = h;
    if (header.indexOf('estimated') !== -1) colIndex.estimatedTime = h;
    if (header.indexOf('crew') !== -1) colIndex.crew = h;
    if (header.indexOf('foreman') !== -1) colIndex.foreman = h;
  }

  // Data starts at row 14 (index 13)
  for (var i = 13; i < data.length; i++) {
    var row = data[i];

    // Check if completed
    var completedVal = colIndex.completed !== undefined ? row[colIndex.completed] : false;
    if (completedVal !== true && completedVal !== 'TRUE' && completedVal !== 'true') {
      continue;
    }

    // Get scheduled date
    var scheduledDate = colIndex.scheduledDate !== undefined ? row[colIndex.scheduledDate] : null;
    if (!scheduledDate) continue;

    var taskDate = scheduledDate instanceof Date ? scheduledDate : new Date(scheduledDate);
    if (isNaN(taskDate.getTime())) continue;
    taskDate.setHours(0, 0, 0, 0);

    // Check if within date range
    if (taskDate < startDate || taskDate > endDate) continue;

    var location = colIndex.location !== undefined ? String(row[colIndex.location] || '').replace(/\uD83D\uDCCD\s*/g, '').trim() : '';
    if (!location && colIndex.locationAlt !== undefined) {
      location = String(row[colIndex.locationAlt] || '').trim();
    }

    var taskType = colIndex.taskType !== undefined ? String(row[colIndex.taskType] || '') : '';
    var employee = colIndex.employee !== undefined ? String(row[colIndex.employee] || '') : '';
    var itemType = colIndex.itemType !== undefined ? String(row[colIndex.itemType] || '') : '';
    var estimatedTime = colIndex.estimatedTime !== undefined ? parseFloat(row[colIndex.estimatedTime]) || 0 : 0;

    // Extract crew number from employee's job number or location context
    var crew = '';
    if (colIndex.crew !== undefined) {
      crew = String(row[colIndex.crew] || '');
    }

    tasks.push({
      date: formatDateKey(taskDate),
      dateObj: taskDate,
      location: location || 'Helena',
      taskType: taskType,
      employee: employee,
      itemType: itemType,
      crew: crew,
      estimatedTime: estimatedTime,
      startTime: '',
      endTime: '',
      source: 'To Do List'
    });
  }

  return tasks;
}

/**
 * Collects completed tasks from Manual Tasks sheet.
 */
function collectCompletedFromManualTasks(ss, startDate, endDate) {
  var tasks = [];
  var manualSheet = ss.getSheetByName('Manual Tasks');

  if (!manualSheet || manualSheet.getLastRow() < 2) {
    return tasks;
  }

  var data = manualSheet.getDataRange().getValues();
  var headers = data[0];

  // Find column indices
  var colIndex = {};
  for (var h = 0; h < headers.length; h++) {
    var header = String(headers[h]).toLowerCase().trim();
    if (header === 'location') colIndex.location = h;
    if (header === 'task type' || header === 'task') colIndex.taskType = h;
    if (header === 'employee') colIndex.employee = h;
    if (header === 'scheduled date') colIndex.scheduledDate = h;
    if (header === 'start time') colIndex.startTime = h;
    if (header === 'end time') colIndex.endTime = h;
    if (header === 'status') colIndex.status = h;
    if (header === 'notes') colIndex.notes = h;
  }

  for (var i = 1; i < data.length; i++) {
    var row = data[i];

    // Check if completed
    var status = colIndex.status !== undefined ? String(row[colIndex.status] || '').toLowerCase() : '';
    if (status !== 'complete' && status !== 'completed') {
      continue;
    }

    // Get scheduled date
    var scheduledDate = colIndex.scheduledDate !== undefined ? row[colIndex.scheduledDate] : null;
    if (!scheduledDate) continue;

    var taskDate = scheduledDate instanceof Date ? scheduledDate : new Date(scheduledDate);
    if (isNaN(taskDate.getTime())) continue;
    taskDate.setHours(0, 0, 0, 0);

    // Check if within date range
    if (taskDate < startDate || taskDate > endDate) continue;

    var location = colIndex.location !== undefined ? String(row[colIndex.location] || '') : '';
    var taskType = colIndex.taskType !== undefined ? String(row[colIndex.taskType] || '') : '';
    var employee = colIndex.employee !== undefined ? String(row[colIndex.employee] || '') : '';
    var startTime = colIndex.startTime !== undefined ? formatTimeValue(row[colIndex.startTime]) : '';
    var endTime = colIndex.endTime !== undefined ? formatTimeValue(row[colIndex.endTime]) : '';
    var notes = colIndex.notes !== undefined ? String(row[colIndex.notes] || '') : '';

    tasks.push({
      date: formatDateKey(taskDate),
      dateObj: taskDate,
      location: location || 'Helena',
      taskType: taskType || 'Manual Task',
      employee: employee,
      itemType: 'Manual',
      crew: '',
      estimatedTime: 30, // Default for manual tasks
      startTime: startTime,
      endTime: endTime,
      notes: notes,
      source: 'Manual Tasks'
    });
  }

  return tasks;
}

/**
 * Collects completed tasks from Training Tracking sheet.
 */
function collectCompletedFromTrainingTracking(ss, startDate, endDate) {
  var tasks = [];
  var trainingSheet = ss.getSheetByName('Training Tracking');

  if (!trainingSheet || trainingSheet.getLastRow() < 3) {
    return tasks;
  }

  var data = trainingSheet.getDataRange().getValues();

  // Headers in row 2 (index 1), data starts row 3 (index 2)
  // Columns: A=Month, B=Topic, C=Crew#, D=Lead, E=Location, F=CompletionDate, ...
  for (var i = 2; i < data.length; i++) {
    var row = data[i];

    var completionDate = row[5]; // Column F
    if (!completionDate) continue;

    var taskDate = completionDate instanceof Date ? completionDate : new Date(completionDate);
    if (isNaN(taskDate.getTime())) continue;
    taskDate.setHours(0, 0, 0, 0);

    // Check if within date range
    if (taskDate < startDate || taskDate > endDate) continue;

    var topic = String(row[1] || '');
    var crew = String(row[2] || '');
    var lead = String(row[3] || '');
    var location = String(row[4] || '');

    tasks.push({
      date: formatDateKey(taskDate),
      dateObj: taskDate,
      location: location || 'Helena',
      taskType: 'Training: ' + topic,
      employee: lead,
      itemType: 'Training',
      crew: crew,
      estimatedTime: 60, // Default 1 hour for training
      startTime: '',
      endTime: '',
      source: 'Training Tracking'
    });
  }

  return tasks;
}

// ============================================================================
// BREAKDOWN & FORMATTING FUNCTIONS
// ============================================================================

/**
 * Groups tasks by date, then by crew/location within each day.
 *
 * @param {Array} tasks - Array of task objects
 * @return {Object} Tasks grouped by date with crew breakdowns
 */
function getDailyBreakdown(tasks) {
  var breakdown = {
    days: {},
    dayOrder: []
  };

  // Group by date
  for (var i = 0; i < tasks.length; i++) {
    var task = tasks[i];
    var dateKey = task.date;

    if (!breakdown.days[dateKey]) {
      breakdown.days[dateKey] = {
        date: task.dateObj,
        dateFormatted: formatDisplayDate(task.dateObj),
        locations: {},
        locationOrder: [],
        isOfficeDay: true, // Assume office day until proven otherwise
        totalMinutes: 0,
        driveMinutes: 0,
        fieldMinutes: 0,
        tasksWithoutTimes: 0
      };
      breakdown.dayOrder.push(dateKey);
    }

    var day = breakdown.days[dateKey];
    var location = task.location || 'Helena';

    // Check if this is a field day (non-Helena location)
    if (location.toLowerCase() !== 'helena') {
      day.isOfficeDay = false;
    }

    // Group by location
    if (!day.locations[location]) {
      day.locations[location] = {
        name: location,
        crew: task.crew || '',
        tasks: [],
        gloveSwaps: [],
        sleeveSwaps: [],
        trainings: [],
        certTasks: [],
        otherTasks: [],
        totalMinutes: 0
      };
      day.locationOrder.push(location);
    }

    var locGroup = day.locations[location];

    // Calculate task duration
    var duration = calculateTaskDuration(task);
    task.durationMinutes = duration;
    locGroup.totalMinutes += duration;
    day.totalMinutes += duration;

    if (location.toLowerCase() !== 'helena') {
      day.fieldMinutes += duration;
    }

    // Check if missing times
    if (!task.startTime && !task.endTime) {
      day.tasksWithoutTimes++;
    }

    // Categorize task
    var taskTypeLower = String(task.taskType).toLowerCase();
    if (taskTypeLower.indexOf('swap') !== -1) {
      if (task.itemType && task.itemType.toLowerCase().indexOf('sleeve') !== -1) {
        locGroup.sleeveSwaps.push(task);
      } else {
        locGroup.gloveSwaps.push(task);
      }
    } else if (taskTypeLower.indexOf('training') !== -1) {
      locGroup.trainings.push(task);
    } else if (taskTypeLower.indexOf('cert') !== -1 || taskTypeLower.indexOf('expir') !== -1) {
      locGroup.certTasks.push(task);
    } else {
      locGroup.otherTasks.push(task);
    }

    locGroup.tasks.push(task);
  }

  // Sort days chronologically
  breakdown.dayOrder.sort(function(a, b) {
    return breakdown.days[a].date - breakdown.days[b].date;
  });

  // Calculate drive times for each day
  var driveTimeMap = getDriveTimeMap();

  for (var d = 0; d < breakdown.dayOrder.length; d++) {
    var dayKey = breakdown.dayOrder[d];
    var dayData = breakdown.days[dayKey];

    if (!dayData.isOfficeDay && dayData.locationOrder.length > 0) {
      // Calculate drive time: Helena → locations → Helena
      var prevLocation = 'helena';
      var totalDrive = 0;

      for (var l = 0; l < dayData.locationOrder.length; l++) {
        var loc = dayData.locationOrder[l].toLowerCase();
        if (loc !== 'helena') {
          // Drive from previous to this location
          var driveTime = getDriveTimeBetween(prevLocation, loc, driveTimeMap);
          totalDrive += driveTime;
          prevLocation = loc;
        }
      }

      // Drive back to Helena
      if (prevLocation !== 'helena') {
        totalDrive += getDriveTimeBetween(prevLocation, 'helena', driveTimeMap);
      }

      dayData.driveMinutes = totalDrive;
      dayData.totalMinutes += totalDrive;
    }
  }

  return breakdown;
}

/**
 * Calculates task duration respecting manual times or using defaults.
 *
 * @param {Object} task - Task object
 * @return {number} Duration in minutes
 */
function calculateTaskDuration(task) {
  // Priority 1: Manual start/end times
  if (task.startTime && task.endTime) {
    var diff = calculateTimeDifference(task.startTime, task.endTime);
    if (diff > 0) return diff;
  }

  // Priority 2: Stored estimatedTime
  if (task.estimatedTime && task.estimatedTime > 0) {
    return task.estimatedTime;
  }

  // Priority 3: Defaults by task type
  var taskTypeLower = String(task.taskType).toLowerCase();

  if (taskTypeLower.indexOf('swap') !== -1) {
    return 10; // 10 min per swap
  } else if (taskTypeLower.indexOf('training') !== -1) {
    return 60; // 1 hour for training
  } else if (taskTypeLower.indexOf('cert') !== -1 || taskTypeLower.indexOf('expir') !== -1) {
    return 15; // 15 min for cert tasks
  } else if (taskTypeLower.indexOf('reclaim') !== -1) {
    return 15; // 15 min for reclaims
  } else {
    return 30; // 30 min default for manual/other tasks
  }
}

/**
 * Calculates difference between two time strings.
 *
 * @param {string} startTime - Start time (HH:MM format)
 * @param {string} endTime - End time (HH:MM format)
 * @return {number} Difference in minutes
 */
function calculateTimeDifference(startTime, endTime) {
  try {
    var startParts = String(startTime).split(':');
    var endParts = String(endTime).split(':');

    var startMinutes = parseInt(startParts[0], 10) * 60 + parseInt(startParts[1], 10);
    var endMinutes = parseInt(endParts[0], 10) * 60 + parseInt(endParts[1], 10);

    return endMinutes - startMinutes;
  } catch (e) {
    return 0;
  }
}

/**
 * Gets drive time between two locations.
 *
 * @param {string} from - From location (lowercase)
 * @param {string} to - To location (lowercase)
 * @param {Object} driveTimeMap - Map of location to drive time from Helena
 * @return {number} Drive time in minutes
 */
function getDriveTimeBetween(from, to, driveTimeMap) {
  // Simple approach: use drive times from Helena
  // For A→B, estimate as |driveTime(A) - driveTime(B)| if going same direction
  // or driveTime(A) + driveTime(B) if different directions
  // For simplicity, just use the destination's drive time from Helena

  var fromTime = driveTimeMap[from] || 0;
  var toTime = driveTimeMap[to] || 0;

  if (from === 'helena') {
    return toTime;
  } else if (to === 'helena') {
    return fromTime;
  } else {
    // Rough estimate: difference if close, sum if far apart
    // This is simplified - could be enhanced with actual route data
    return Math.abs(toTime - fromTime) + 15; // Add 15 min buffer
  }
}

/**
 * Generates week summary statistics.
 *
 * @param {Object} breakdown - Daily breakdown object
 * @return {Object} Week summary
 */
function getWeekSummary(breakdown) {
  var summary = {
    totalFieldMinutes: 0,
    totalDriveMinutes: 0,
    totalOfficeMinutes: 0,
    crewsVisited: [],
    taskCounts: {
      swaps: 0,
      trainings: 0,
      certs: 0,
      reclaims: 0,
      other: 0
    }
  };

  var crewSet = {};

  for (var d = 0; d < breakdown.dayOrder.length; d++) {
    var dayKey = breakdown.dayOrder[d];
    var day = breakdown.days[dayKey];

    summary.totalDriveMinutes += day.driveMinutes || 0;

    if (day.isOfficeDay) {
      summary.totalOfficeMinutes += day.totalMinutes - (day.driveMinutes || 0);
    } else {
      summary.totalFieldMinutes += day.fieldMinutes || 0;
    }

    // Count tasks and crews
    for (var loc in day.locations) {
      var locData = day.locations[loc];

      if (locData.crew) {
        crewSet[locData.crew] = true;
      }

      summary.taskCounts.swaps += locData.gloveSwaps.length + locData.sleeveSwaps.length;
      summary.taskCounts.trainings += locData.trainings.length;
      summary.taskCounts.certs += locData.certTasks.length;

      for (var t = 0; t < locData.otherTasks.length; t++) {
        var taskType = String(locData.otherTasks[t].taskType).toLowerCase();
        if (taskType.indexOf('reclaim') !== -1) {
          summary.taskCounts.reclaims++;
        } else {
          summary.taskCounts.other++;
        }
      }
    }
  }

  summary.crewsVisited = Object.keys(crewSet);

  return summary;
}

/**
 * Checks for tasks without manual times entered.
 *
 * @param {Array} tasks - All tasks
 * @return {Object} Alert info
 */
function getMissingTimesAlert(tasks) {
  var missingCount = 0;
  var daysMissing = {};

  for (var i = 0; i < tasks.length; i++) {
    if (!tasks[i].startTime && !tasks[i].endTime) {
      missingCount++;
      daysMissing[tasks[i].date] = true;
    }
  }

  return {
    hasMissing: missingCount > 0,
    count: missingCount,
    daysAffected: Object.keys(daysMissing).length
  };
}

/**
 * Formats the breakdown into plain text for timesheet.
 *
 * @param {Object} breakdown - Daily breakdown object
 * @param {string} format - Output format: 'text', 'bullets', or 'table'
 * @return {string} Formatted output
 */
function formatBreakdownForTimesheet(breakdown, format) {
  format = format || 'text';
  var output = [];

  for (var d = 0; d < breakdown.dayOrder.length; d++) {
    var dayKey = breakdown.dayOrder[d];
    var day = breakdown.days[dayKey];

    output.push(day.dateFormatted + ':');

    if (day.isOfficeDay) {
      output.push('- Office Day (Helena):');

      // List office tasks
      var helenaTasks = day.locations['Helena'] || day.locations['helena'];
      if (helenaTasks) {
        var taskLines = formatLocationTasks(helenaTasks, format);
        for (var t = 0; t < taskLines.length; t++) {
          output.push('  ' + taskLines[t]);
        }
      }
    } else {
      // Field day - list by crew/location with drive times
      var prevLoc = 'Helena';
      var driveTimeMap = getDriveTimeMap();

      for (var l = 0; l < day.locationOrder.length; l++) {
        var locName = day.locationOrder[l];
        var locData = day.locations[locName];

        if (locName.toLowerCase() !== 'helena') {
          // Add drive line
          var driveTime = getDriveTimeBetween(prevLoc.toLowerCase(), locName.toLowerCase(), driveTimeMap);
          if (driveTime > 0) {
            output.push('- Drove to ' + locName + ' - ' + formatMinutes(driveTime));
          }
          prevLoc = locName;
        }

        // Crew header with time
        var crewLabel = locData.crew ? 'Crew ' + locData.crew + ' (' + locName + ')' : locName;
        output.push('- ' + crewLabel + ' - ' + formatMinutes(locData.totalMinutes) + ' total:');

        // List tasks
        var fieldTaskLines = formatLocationTasks(locData, format);
        for (var ft = 0; ft < fieldTaskLines.length; ft++) {
          output.push('  ' + fieldTaskLines[ft]);
        }
      }

      // Drive back to Helena
      if (prevLoc.toLowerCase() !== 'helena') {
        var returnDrive = getDriveTimeBetween(prevLoc.toLowerCase(), 'helena', driveTimeMap);
        if (returnDrive > 0) {
          output.push('- Drove back to Helena - ' + formatMinutes(returnDrive));
        }
      }
    }

    output.push('');
    output.push('Day Total: ' + formatMinutes(day.totalMinutes));
    output.push('');
  }

  // Week summary
  if (breakdown.weekSummary) {
    var ws = breakdown.weekSummary;
    output.push('=== WEEK SUMMARY ===');
    output.push('Total Field Time: ' + formatMinutes(ws.totalFieldMinutes));
    output.push('Total Drive Time: ' + formatMinutes(ws.totalDriveMinutes));
    output.push('Total Office Time: ' + formatMinutes(ws.totalOfficeMinutes));

    if (ws.crewsVisited.length > 0) {
      output.push('Crews Visited: ' + ws.crewsVisited.join(', '));
    }

    var taskParts = [];
    if (ws.taskCounts.swaps > 0) taskParts.push(ws.taskCounts.swaps + ' swaps');
    if (ws.taskCounts.trainings > 0) taskParts.push(ws.taskCounts.trainings + ' trainings');
    if (ws.taskCounts.certs > 0) taskParts.push(ws.taskCounts.certs + ' cert tasks');
    if (ws.taskCounts.reclaims > 0) taskParts.push(ws.taskCounts.reclaims + ' reclaims');
    if (ws.taskCounts.other > 0) taskParts.push(ws.taskCounts.other + ' other');

    if (taskParts.length > 0) {
      output.push('Tasks Completed: ' + taskParts.join(', '));
    }
  }

  return output.join('\n');
}

/**
 * Formats tasks for a single location with smart consolidation.
 *
 * @param {Object} locData - Location data with task arrays
 * @param {string} format - Output format
 * @return {Array} Array of formatted task lines
 */
function formatLocationTasks(locData, format) {
  var lines = [];
  var bullet = format === 'bullets' ? '• ' : '• ';

  // Consolidate swaps
  if (locData.gloveSwaps.length > 0 || locData.sleeveSwaps.length > 0) {
    var swapParts = [];
    if (locData.gloveSwaps.length > 0) {
      swapParts.push('gloves (' + locData.gloveSwaps.length + ')');
    }
    if (locData.sleeveSwaps.length > 0) {
      swapParts.push('sleeves (' + locData.sleeveSwaps.length + ')');
    }
    lines.push(bullet + 'Delivered ' + swapParts.join(', '));
  }

  // List trainings
  for (var t = 0; t < locData.trainings.length; t++) {
    var training = locData.trainings[t];
    var topic = String(training.taskType).replace(/^Training:\s*/i, '').trim();
    var timeStr = training.startTime && training.endTime ?
      ' (' + training.startTime + ' - ' + training.endTime + ')' : '';
    lines.push(bullet + 'Training - ' + topic + timeStr);
  }

  // List cert tasks
  for (var c = 0; c < locData.certTasks.length; c++) {
    var cert = locData.certTasks[c];
    lines.push(bullet + cert.taskType + (cert.employee ? ' - ' + cert.employee : ''));
  }

  // List other tasks
  for (var o = 0; o < locData.otherTasks.length; o++) {
    var other = locData.otherTasks[o];
    var otherTime = other.startTime && other.endTime ?
      ' (' + other.startTime + ' - ' + other.endTime + ')' : '';
    lines.push(bullet + other.taskType + otherTime);
  }

  return lines;
}

// ============================================================================
// FAVORITE PHRASES FUNCTIONS
// ============================================================================

/**
 * Gets saved favorite phrases.
 *
 * @return {Array} Array of phrase strings
 */
function getFavoritePhrases() {
  var props = PropertiesService.getScriptProperties();
  var phrasesJson = props.getProperty('favoritePhrases');

  if (phrasesJson) {
    try {
      return JSON.parse(phrasesJson);
    } catch (e) {
      Logger.log('Error parsing favorite phrases: ' + e);
    }
  }

  // Default phrases
  return [
    'Delivered PPE to field crew',
    'Conducted monthly safety training',
    'Processed equipment returns and updated inventory',
    'Reviewed and updated expiring certifications',
    'Completed administrative tasks and documentation'
  ];
}

/**
 * Saves favorite phrases.
 *
 * @param {Array} phrases - Array of phrase strings
 * @return {boolean} Success
 */
function saveFavoritePhrases(phrases) {
  try {
    var props = PropertiesService.getScriptProperties();
    props.setProperty('favoritePhrases', JSON.stringify(phrases));
    return true;
  } catch (e) {
    Logger.log('Error saving favorite phrases: ' + e);
    return false;
  }
}

/**
 * Adds a new favorite phrase.
 *
 * @param {string} phrase - Phrase to add
 * @return {Array} Updated phrases array
 */
function addFavoritePhrase(phrase) {
  var phrases = getFavoritePhrases();
  if (phrases.indexOf(phrase) === -1) {
    phrases.push(phrase);
    saveFavoritePhrases(phrases);
  }
  return phrases;
}

/**
 * Removes a favorite phrase.
 *
 * @param {string} phrase - Phrase to remove
 * @return {Array} Updated phrases array
 */
function removeFavoritePhrase(phrase) {
  var phrases = getFavoritePhrases();
  var index = phrases.indexOf(phrase);
  if (index !== -1) {
    phrases.splice(index, 1);
    saveFavoritePhrases(phrases);
  }
  return phrases;
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Formats a date as YYYY-MM-DD for use as object key.
 */
function formatDateKey(date) {
  return date.getFullYear() + '-' +
         String(date.getMonth() + 1).padStart(2, '0') + '-' +
         String(date.getDate()).padStart(2, '0');
}

/**
 * Formats a date for display (e.g., "Thursday, Jan 23").
 */
function formatDisplayDate(date) {
  var days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  return days[date.getDay()] + ', ' + months[date.getMonth()] + ' ' + date.getDate();
}

/**
 * Formats minutes as "X hrs Y min" or "X min".
 */
function formatMinutes(minutes) {
  if (!minutes || minutes <= 0) return '0 min';

  var hrs = Math.floor(minutes / 60);
  var mins = Math.round(minutes % 60);

  if (hrs > 0 && mins > 0) {
    return hrs + ' hr' + (hrs > 1 ? 's' : '') + ' ' + mins + ' min';
  } else if (hrs > 0) {
    return hrs + ' hr' + (hrs > 1 ? 's' : '');
  } else {
    return mins + ' min';
  }
}

// NOTE: formatTimeValue() is defined in 87-RoutePlanner.gs which loads after this file.
// That version is used by all callers including this file's own calls at lines 342-343.

/**
 * Gets date range presets.
 *
 * @param {string} preset - Preset name: 'today', 'yesterday', 'thisWeek', 'lastWeek'
 * @return {Object} {startDate, endDate} as YYYY-MM-DD strings
 */
function getDateRangePreset(preset) {
  var today = new Date();
  today.setHours(0, 0, 0, 0);

  var startDate, endDate;

  switch (preset) {
    case 'today':
      startDate = endDate = today;
      break;

    case 'yesterday':
      startDate = endDate = new Date(today);
      startDate.setDate(startDate.getDate() - 1);
      break;

    case 'thisWeek':
      startDate = new Date(today);
      startDate.setDate(today.getDate() - today.getDay()); // Sunday
      endDate = today;
      break;

    case 'lastWeek':
      endDate = new Date(today);
      endDate.setDate(today.getDate() - today.getDay() - 1); // Last Saturday
      startDate = new Date(endDate);
      startDate.setDate(endDate.getDate() - 6); // Previous Sunday
      break;

    default:
      startDate = endDate = today;
  }

  return {
    startDate: formatDateKey(startDate),
    endDate: formatDateKey(endDate)
  };
}
