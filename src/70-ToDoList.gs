/**
 * Glove Manager – To-Do List Generation
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

  // Get tasks from Reclaims sheet
  var reclaimsSheet = ss.getSheetByName('Reclaims');
  if (reclaimsSheet && reclaimsSheet.getLastRow() > 1) {
    var reclaimsData = reclaimsSheet.getDataRange().getValues();

    for (var i = 1; i < reclaimsData.length; i++) {
      var row = reclaimsData[i];
      if (row[0]) { // Has content
        tasks.push([
          'Medium',
          'Process Reclaim: ' + row[0],
          'Item #' + row[2] + ' - ' + row[1],
          'Reclaims',
          'Pending',
          '', // Scheduled Date
          15, // Estimated Time
          'Helena', // Start Location
          'Helena', // End Location
          0, // Drive Time
          false, // Overnight Required
          false // Completed
        ]);
      }
    }
  }

  // Get tasks from Purchase Needs
  var purchaseSheet = ss.getSheetByName('Purchase Needs');
  if (purchaseSheet && purchaseSheet.getLastRow() > 1) {
    var purchaseData = purchaseSheet.getDataRange().getValues();

    for (var j = 1; j < purchaseData.length; j++) {
      var pRow = purchaseData[j];
      if (pRow[0] && pRow[0] !== 'Class') { // Has class value
        tasks.push([
          'High',
          'Order: ' + pRow[0] + ' Size ' + pRow[1],
          'Quantity needed: ' + pRow[2],
          'Purchase Needs',
          'Pending',
          '', // Scheduled Date
          30, // Estimated Time
          'Helena', // Start Location
          'Helena', // End Location
          0, // Drive Time
          false, // Overnight Required
          false // Completed
        ]);
      }
    }
  }

  // Get incomplete swaps from Glove Swaps
  var gloveSwapsSheet = ss.getSheetByName('Glove Swaps');
  if (gloveSwapsSheet && gloveSwapsSheet.getLastRow() > 1) {
    var swapData = gloveSwapsSheet.getDataRange().getValues();
    var swapHeaders = swapData[0];

    var pickedColIdx = -1;
    var employeeColIdx = -1;

    for (var h = 0; h < swapHeaders.length; h++) {
      var headerLower = String(swapHeaders[h]).toLowerCase().trim();
      if (headerLower === 'picked') pickedColIdx = h;
      if (headerLower === 'employee') employeeColIdx = h;
    }

    if (pickedColIdx !== -1 && employeeColIdx !== -1) {
      for (var k = 1; k < swapData.length; k++) {
        var sRow = swapData[k];
        var isPicked = sRow[pickedColIdx];
        var employee = sRow[employeeColIdx];

        if (!isPicked && employee) {
          tasks.push([
            'Low',
            'Complete Swap for: ' + employee,
            'Check Picked box when delivered',
            'Glove Swaps',
            'Pending',
            '', // Scheduled Date
            10, // Estimated Time
            'Helena', // Start Location
            'Helena', // End Location - will be updated by scheduling
            0, // Drive Time
            false, // Overnight Required
            false // Completed
          ]);
        }
      }
    }
  }

  // Get pending/incomplete training from Training Tracking
  var trainingSheet = ss.getSheetByName('Training Tracking');
  if (trainingSheet && trainingSheet.getLastRow() > 2) {
    var trainingData = trainingSheet.getDataRange().getValues();

    // Headers are in row 2 (index 1), data starts at row 3 (index 2)
    var monthCol = 0;      // A: Month
    var topicCol = 1;      // B: Training Topic
    var crewCol = 2;       // C: Crew #
    var leadCol = 3;       // D: Crew Lead
    var dateCol = 5;       // F: Completion Date
    var statusCol = 9;     // J: Status

    // Get current month for priority determination
    var today = new Date();
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

      // Add task if training is incomplete
      if (month && crew && status !== 'Complete' && status !== 'N/A') {
        // Determine priority based on month
        var priority = 'Low';
        if (month === currentMonthName) {
          priority = 'High'; // Current month training is high priority
        } else if (month === 'December') {
          priority = 'Medium'; // December catch-ups are medium priority
        }

        var taskDescription = 'Training: ' + topic;
        if (crewLead) {
          taskDescription += ' - ' + crewLead;
        }

        var details = 'Crew: ' + crew + ' | Month: ' + month;
        if (status === 'In Progress') {
          details += ' | In Progress';
        } else if (status === 'Overdue') {
          details += ' | OVERDUE';
          priority = 'High'; // Overdue training is always high priority
        }

        tasks.push([
          priority,
          taskDescription,
          details,
          'Training Tracking',
          status === 'Overdue' ? 'Overdue' : 'Pending',
          '', // Scheduled Date
          60, // Estimated Time (1 hour default for training)
          'Helena', // Start Location
          'Helena', // End Location - will be updated by crew location
          0, // Drive Time
          false, // Overnight Required
          false // Completed
        ]);
      }
    }
  }

  // Write tasks to sheet
  if (tasks.length > 0) {
    var dataStartRow = 14;
    todoSheet.getRange(dataStartRow, 1, tasks.length, 12).setValues(tasks);

    // Format
    todoSheet.setColumnWidth(1, 80); // Priority
    todoSheet.setColumnWidth(2, 250); // Task
    todoSheet.setColumnWidth(3, 250); // Details
    todoSheet.setColumnWidth(4, 120); // Sheet
    todoSheet.setColumnWidth(5, 100); // Status
    todoSheet.setColumnWidth(6, 110); // Scheduled Date
    todoSheet.setColumnWidth(7, 120); // Estimated Time
    todoSheet.setColumnWidth(8, 110); // Start Location
    todoSheet.setColumnWidth(9, 110); // End Location
    todoSheet.setColumnWidth(10, 100); // Drive Time
    todoSheet.setColumnWidth(11, 130); // Overnight Required
    todoSheet.setColumnWidth(12, 100); // Completed

    // Add data validation for Completed column (checkboxes)
    var completedRange = todoSheet.getRange(dataStartRow, 12, tasks.length, 1);
    var completedRule = SpreadsheetApp.newDataValidation().requireCheckbox().build();
    completedRange.setDataValidation(completedRule);

    // Add data validation for Overnight Required column (checkboxes)
    var overnightRange = todoSheet.getRange(dataStartRow, 11, tasks.length, 1);
    var overnightRule = SpreadsheetApp.newDataValidation().requireCheckbox().build();
    overnightRange.setDataValidation(overnightRule);

    // Format Scheduled Date column as date
    var dateRange = todoSheet.getRange(dataStartRow, 6, tasks.length, 1);
    dateRange.setNumberFormat('MM/dd/yyyy');

    SpreadsheetApp.getUi().alert('✅ To-Do List generated with ' + tasks.length + ' tasks.');
  } else {
    todoSheet.getRange(14, 1).setValue('No tasks found. Great job!');
    SpreadsheetApp.getUi().alert('✅ To-Do List generated - no pending tasks!');
  }

  logEvent('To-Do List generated with ' + tasks.length + ' tasks', 'INFO');
}

/**
 * Clears completed tasks from the To-Do List.
 * Menu item: Glove Manager → To-Do List → Clear Completed Tasks
 */
function clearCompletedTasks() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var todoSheet = ss.getSheetByName('To Do List');

  if (!todoSheet || todoSheet.getLastRow() < 14) {
    SpreadsheetApp.getUi().alert('To-Do List is empty or not found.');
    return;
  }

  var lastRow = todoSheet.getLastRow();
  var dataStartRow = 14;
  var completedColIdx = 11; // Completed column (L, 0-based index 11)
  var rowsToDelete = [];

  // Read only the data portion
  if (lastRow >= dataStartRow) {
    var data = todoSheet.getRange(dataStartRow, 1, lastRow - dataStartRow + 1, 12).getValues();

    // Find completed tasks (starting from bottom to avoid index issues)
    for (var i = data.length - 1; i >= 0; i--) {
      if (data[i][completedColIdx] === true) {
        rowsToDelete.push(dataStartRow + i); // Actual row number
      }
    }

    // Delete completed rows
    var deletedCount = 0;
    for (var j = 0; j < rowsToDelete.length; j++) {
      todoSheet.deleteRow(rowsToDelete[j]);
      deletedCount++;
    }

    if (deletedCount > 0) {
      SpreadsheetApp.getUi().alert('✅ Cleared ' + deletedCount + ' completed task(s).');
      logEvent('Cleared ' + deletedCount + ' completed tasks from To-Do List', 'INFO');
    } else {
      SpreadsheetApp.getUi().alert('No completed tasks to clear.');
    }
  } else {
    SpreadsheetApp.getUi().alert('No tasks to clear.');
  }
}

/**
 * Builds a visually enhanced calendar section at the top of the To-Do List sheet.
 * Calendar shows detailed itinerary for each day including:
 * - Locations to visit
 * - Job numbers
 * - Tasks to complete
 * - Travel times between locations
 *
 * @param {Sheet} sheet - The sheet to add calendar to
 * @param {Object} tasksByDate - Optional: Tasks grouped by date for display in calendar cells
 */
function buildToDoListCalendar(sheet, tasksByDate) {
  var today = new Date();
  var currentMonth = today.getMonth(); // 0-11
  var currentYear = today.getFullYear();
  var todayDate = today.getDate();

  var monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
                    'July', 'August', 'September', 'October', 'November', 'December'];

  // IMPORTANT: Unfreeze any frozen rows/columns to allow scrolling
  sheet.setFrozenRows(0);
  sheet.setFrozenColumns(0);

  // Set CONSISTENT column widths for ALL columns
  // Calendar columns (1-7) - moderate width for itinerary display
  var calendarColWidth = 150; // Reduced width for better fit
  for (var col = 1; col <= 7; col++) {
    sheet.setColumnWidth(col, calendarColWidth);
  }

  // ============================================
  // ROW 1: Title Banner (spans all columns)
  // ============================================
  sheet.setRowHeight(1, 35);
  sheet.getRange(1, 1, 1, 19).merge(); // Span all 19 task columns
  sheet.getRange(1, 1).setValue('📅 ' + monthNames[currentMonth] + ' ' + currentYear + ' - Monthly Schedule');
  sheet.getRange(1, 1)
    .setFontSize(14)
    .setFontWeight('bold')
    .setHorizontalAlignment('center')
    .setVerticalAlignment('middle')
    .setBackground('#1565c0')
    .setFontColor('white');

  // ============================================
  // ROW 2: Subtitle (spans all columns)
  // ============================================
  sheet.setRowHeight(2, 22);
  sheet.getRange(2, 1, 1, 19).merge(); // Span all 19 task columns
  sheet.getRange(2, 1).setValue('🚗 Route Planning - 10hr Workday (7am-5pm) | 1 Location/Day');
  sheet.getRange(2, 1)
    .setFontSize(11)
    .setFontStyle('italic')
    .setHorizontalAlignment('center')
    .setVerticalAlignment('middle')
    .setBackground('#1976d2')
    .setFontColor('#e3f2fd');

  // ============================================
  // ROW 3: Week Day Headers
  // ============================================
  sheet.setRowHeight(3, 30);
  var weekDays = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
  sheet.getRange(3, 1, 1, 7).setValues([weekDays]);
  sheet.getRange(3, 1, 1, 7)
    .setFontSize(11)
    .setFontWeight('bold')
    .setBackground('#42a5f5')
    .setFontColor('white')
    .setHorizontalAlignment('center')
    .setVerticalAlignment('middle');

  // ============================================
  // ROWS 4-9: Calendar Grid (6 weeks)
  // ============================================
  var firstDay = new Date(currentYear, currentMonth, 1);
  var firstWeekday = firstDay.getDay(); // 0 = Sunday
  var daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();

  var calendarData = [];
  var currentDay = 1;

  // Set CONSISTENT row heights for calendar weeks
  var calendarRowHeight = 80; // Reduced height for better fit
  for (var weekRow = 4; weekRow <= 9; weekRow++) {
    sheet.setRowHeight(weekRow, calendarRowHeight);
  }

  for (var week = 0; week < 6; week++) {
    var weekRowData = [];
    for (var day = 0; day < 7; day++) {
      if ((week === 0 && day < firstWeekday) || currentDay > daysInMonth) {
        weekRowData.push('');
      } else {
        // Build detailed cell content
        var cellContent = '━━ ' + currentDay + ' ━━';

        // Add detailed task info if tasksByDate provided
        if (tasksByDate) {
          var monthStr = String(currentMonth + 1).padStart(2, '0');
          var dayStr = String(currentDay).padStart(2, '0');
          var dateKey = currentYear + '-' + monthStr + '-' + dayStr;

          if (tasksByDate[dateKey] && tasksByDate[dateKey].length > 0) {
            var dayTasks = tasksByDate[dateKey];
            var itinerary = buildDayItinerary(dayTasks);
            cellContent += '\n' + itinerary;
          }
        }

        weekRowData.push(cellContent);
        currentDay++;
      }
    }
    calendarData.push(weekRowData);
  }

  sheet.getRange(4, 1, 6, 7).setValues(calendarData);
  sheet.getRange(4, 1, 6, 7)
    .setHorizontalAlignment('left')
    .setVerticalAlignment('top')
    .setFontSize(8)
    .setWrap(true)
    .setBorder(true, true, true, true, true, true, '#90caf9', SpreadsheetApp.BorderStyle.SOLID);

  // Apply styling to each cell
  currentDay = 1;
  for (var weekIdx = 0; weekIdx < 6; weekIdx++) {
    for (var dayCol = 0; dayCol < 7; dayCol++) {
      var cell = sheet.getRange(4 + weekIdx, 1 + dayCol);
      var cellValue = calendarData[weekIdx][dayCol];

      if (cellValue === '') {
        // Empty cells (previous/next month)
        cell.setBackground('#eeeeee').setFontColor('#bdbdbd');
      } else {
        var dayNum = parseInt(String(cellValue).split('\n')[0].replace(/[━ ]/g, ''), 10);
        var hasTasks = cellValue.indexOf('📍') !== -1;

        // Weekend styling (Saturday/Sunday)
        if (dayCol === 0 || dayCol === 6) {
          cell.setBackground(hasTasks ? '#ffe0b2' : '#fff3e0'); // Orange tint for weekends
        } else {
          // Weekday styling
          if (hasTasks) {
            cell.setBackground('#e3f2fd'); // Blue tint if has tasks
          } else {
            cell.setBackground(weekIdx % 2 === 0 ? '#fafafa' : '#ffffff');
          }
        }

        // Highlight TODAY with special styling
        if (dayNum === todayDate) {
          cell.setBackground('#fff59d') // Bright yellow
            .setFontWeight('bold')
            .setBorder(true, true, true, true, null, null, '#f57c00', SpreadsheetApp.BorderStyle.SOLID_THICK);
        }

        // If has overnight required, add red border
        if (cellValue.indexOf('🏨') !== -1) {
          cell.setBorder(true, true, true, true, null, null, '#d32f2f', SpreadsheetApp.BorderStyle.SOLID_MEDIUM);
        }
      }
    }
  }

  // ============================================
  // ROW 10: Legend (spans all columns)
  // ============================================
  sheet.setRowHeight(10, 25);
  sheet.getRange(10, 1, 1, 19).merge(); // Span all 19 task columns
  sheet.getRange(10, 1).setValue('🟡 Today | 🟠 Weekend | 🔵 Tasks | 🏨 Overnight | 🚗 Drive Time');
  sheet.getRange(10, 1)
    .setFontSize(9)
    .setHorizontalAlignment('center')
    .setVerticalAlignment('middle')
    .setBackground('#e8eaf6')
    .setFontColor('#3949ab');

  // ============================================
  // ROW 11: Spacer (spans all columns)
  // ============================================
  sheet.setRowHeight(11, 3);
  sheet.getRange(11, 1, 1, 19).merge(); // Span all 19 task columns
  sheet.getRange(11, 1).setBackground('#ffffff');

  // ============================================
  // ROW 12: Tasks Section Header (spans all columns)
  // ============================================
  sheet.setRowHeight(12, 25);
  sheet.getRange(12, 1, 1, 19).merge(); // Span all 19 task columns
  sheet.getRange(12, 1).setValue('📋 TASK LIST - Grouped by Location');
  sheet.getRange(12, 1)
    .setFontSize(10)
    .setFontWeight('bold')
    .setHorizontalAlignment('center')
    .setVerticalAlignment('middle')
    .setBackground('#263238')
    .setFontColor('#ffffff');
}

/**
 * Builds a detailed itinerary string for a single day's tasks.
 * Shows: Location → Tasks → Travel time to next location
 *
 * @param {Array} tasks - Array of task objects for this day
 * @return {string} Formatted itinerary string
 */
function buildDayItinerary(tasks) {
  if (!tasks || tasks.length === 0) return '';

  // Group tasks by location
  var locationGroups = {};
  var locationOrder = [];

  for (var i = 0; i < tasks.length; i++) {
    var task = tasks[i];
    var loc = task.location || 'Unknown';

    if (!locationGroups[loc]) {
      locationGroups[loc] = [];
      locationOrder.push(loc);
    }
    locationGroups[loc].push(task);
  }

  // Build itinerary string
  var lines = [];
  var prevLocation = 'Helena'; // Start from Helena
  var totalTime = 0;
  var overnightRequired = false;

  // Get drive times map
  var driveTimes = {
    'Helena': { 'Helena': 0, 'Butte': 90, 'Bozeman': 105, 'Big Sky': 150, 'Great Falls': 90,
                'Missoula': 120, 'Ennis': 75, 'Livingston': 105, 'Stanford': 120,
                'Northern Lights': 420, 'South Dakota Dock': 600, 'CA Sub': 960 },
    'Butte': { 'Helena': 90, 'Bozeman': 90, 'Ennis': 75, 'Big Sky': 120 },
    'Bozeman': { 'Helena': 105, 'Butte': 90, 'Big Sky': 60, 'Livingston': 30, 'Ennis': 75 },
    'Big Sky': { 'Helena': 150, 'Bozeman': 60, 'Ennis': 90 },
    'Ennis': { 'Helena': 75, 'Butte': 75, 'Bozeman': 75 },
    'Great Falls': { 'Helena': 90, 'Stanford': 60 },
    'Missoula': { 'Helena': 120 },
    'Livingston': { 'Helena': 105, 'Bozeman': 30 }
  };

  for (var j = 0; j < locationOrder.length; j++) {
    var location = locationOrder[j];
    var locTasks = locationGroups[location];

    // Calculate drive time from previous location
    var driveTime = 0;
    if (prevLocation !== location) {
      if (driveTimes[prevLocation] && driveTimes[prevLocation][location]) {
        driveTime = driveTimes[prevLocation][location];
      } else if (driveTimes['Helena'] && driveTimes['Helena'][location]) {
        driveTime = driveTimes['Helena'][location];
      }
    }

    // Add drive time line if traveling
    if (driveTime > 0) {
      var driveHrs = Math.floor(driveTime / 60);
      var driveMins = driveTime % 60;
      var driveStr = driveHrs > 0 ? driveHrs + 'h' + (driveMins > 0 ? driveMins + 'm' : '') : driveMins + 'm';
      lines.push('🚗 ' + driveStr + ' →');
      totalTime += driveTime;
    }

    // Add location header
    lines.push('📍 ' + location);

    // Add tasks (abbreviated)
    var taskSummary = [];
    var swapCount = 0;
    var trainingCount = 0;
    var reclaimCount = 0;

    for (var k = 0; k < locTasks.length; k++) {
      var t = locTasks[k];
      if (t.type === 'Swap') swapCount++;
      else if (t.type === 'Training') trainingCount++;
      else if (t.type && t.type.indexOf('Reclaim') !== -1) reclaimCount++;
      totalTime += (t.estimatedTime || 15);
    }

    if (swapCount > 0) taskSummary.push(swapCount + ' swap' + (swapCount > 1 ? 's' : ''));
    if (trainingCount > 0) taskSummary.push(trainingCount + ' training');
    if (reclaimCount > 0) taskSummary.push(reclaimCount + ' reclaim' + (reclaimCount > 1 ? 's' : ''));

    if (taskSummary.length > 0) {
      lines.push('   ' + taskSummary.join(', '));
    }

    prevLocation = location;

    // Check if return trip makes it overnight (10-hour workday = 600 minutes, starting 7am)
    if (location !== 'Helena') {
      var returnTime = driveTimes['Helena'] && driveTimes['Helena'][location] ? driveTimes['Helena'][location] : 120;
      if (totalTime + returnTime > 600) { // More than 10 hours
        overnightRequired = true;
      }
    }
  }

  // Add return to Helena if needed
  if (prevLocation !== 'Helena') {
    var returnDrive = driveTimes['Helena'] && driveTimes['Helena'][prevLocation] ? driveTimes['Helena'][prevLocation] : 120;
    var returnHrs = Math.floor(returnDrive / 60);
    var returnMins = returnDrive % 60;
    var returnStr = returnHrs > 0 ? returnHrs + 'h' + (returnMins > 0 ? returnMins + 'm' : '') : returnMins + 'm';
    lines.push('🚗 ' + returnStr + ' → Helena');
  }

  // Add overnight indicator if needed
  if (overnightRequired) {
    lines.push('🏨 OVERNIGHT');
  }

  return lines.join('\n');
}


/**
 * Gets scheduled tasks from crew visits and training for the current month.
 * These tasks include scheduling information (dates, times, locations, drive times).
 *
 * @return {Array} Array of task arrays with scheduling info
 */
function getScheduledTasksForCurrentMonth() {
  var tasks = [];
  var today = new Date();
  var currentYear = today.getFullYear();
  var currentMonth = today.getMonth() + 1; // 1-12

  try {
    // Get crew visit tasks
    var crewVisits = getCrewVisitsForMonth(currentYear, currentMonth);

    for (var i = 0; i < crewVisits.length; i++) {
      var visit = crewVisits[i];
      var overnightInfo = detectOvernightRequirement(visit);

      tasks.push([
        visit.priority || 'Medium',
        'Crew Visit: ' + visit.location + ' (Job #' + visit.jobNumber + ')',
        'Crew Lead: ' + (visit.crewLead || 'Unknown') + ' | ' + visit.crewSize + ' crew members',
        'Crew Visit Config',
        'Scheduled',
        visit.date, // Scheduled Date
        visit.visitTime, // Estimated Time
        overnightInfo.startLocation, // Start Location
        overnightInfo.endLocation, // End Location
        visit.driveTime, // Drive Time
        overnightInfo.overnightRequired, // Overnight Required
        false // Completed
      ]);
    }
  } catch (e) {
    Logger.log('Error getting crew visits: ' + e.toString());
  }

  return tasks;
}

/**
 * Detects if a task requires an overnight stay based on end location and total time.
 * Uses 10-hour workday (600 minutes) starting at 7am.
 * Returns start location, end location, and overnight required flag.
 *
 * @param {Object} task - Task object with location, visitTime, driveTime
 * @return {Object} Object with startLocation, endLocation, overnightRequired
 */
function detectOvernightRequirement(task) {
  var startLocation = 'Helena'; // Default start location
  var endLocation = task.location || 'Helena';
  var overnightRequired = false;

  // Calculate total time for the day (drive there + visit + drive back)
  var driveTime = task.driveTime || 0;
  var visitTime = task.visitTime || 45;
  var totalDayTime = (driveTime * 2) + visitTime; // Round trip

  // If end location is not Helena AND total time > 10 hours (600 minutes), require overnight
  // 10-hour workday: 7am to 5pm
  if (endLocation.toLowerCase() !== 'helena' && totalDayTime > 600) {
    overnightRequired = true;
  }

  // Specific locations that always require overnight (too far for same day)
  var overnightLocations = ['kalispell', 'missoula', 'miles city', 'sidney', 'glendive',
                            'northern lights', 'bonners ferry', 'south dakota', 'ca sub', 'california'];
  for (var i = 0; i < overnightLocations.length; i++) {
    if (endLocation.toLowerCase().indexOf(overnightLocations[i]) !== -1) {
      overnightRequired = true;
      break;
    }
  }

  return {
    startLocation: startLocation,
    endLocation: endLocation,
    overnightRequired: overnightRequired
  };
}
