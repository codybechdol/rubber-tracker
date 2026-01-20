/**
 * Glove Manager – Smart Scheduling System
 *
 * Automatically schedules crew visits based on tasks from Glove Swaps, Sleeve Swaps,
 * and Training. Groups tasks by location and prioritizes by due date to optimize trips.
 */

/* global logEvent, extractCrewNumber, buildToDoListCalendar, detectOvernightRequirement */
/* eslint-disable no-redeclare, no-unused-vars */

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Helper function to count total tasks across all locations.
 * @param {Object} tasksByLocation - Tasks grouped by location
 * @return {number} Total task count
 */
function countTasks(tasksByLocation) {
  var count = 0;
  for (var loc in tasksByLocation) {
    count += tasksByLocation[loc].length;
  }
  return count;
}

// ============================================================================
// MAIN SMART SCHEDULING FUNCTION
// ============================================================================

/**
 * Generates smart schedule by grouping tasks by location and prioritizing by due date.
 * Menu item: Glove Manager → Schedule → Generate Smart Schedule
 */
function generateSmartSchedule() {
  Logger.log('=== generateSmartSchedule START ===');
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  // Collect all tasks from different sources
  var tasksByLocation = collectAndGroupTasks(ss);

  var totalTasks = 0;
  var locationCount = Object.keys(tasksByLocation).length;
  for (var loc in tasksByLocation) {
    totalTasks += tasksByLocation[loc].length;
  }
  Logger.log('Collected ' + totalTasks + ' tasks from ' + locationCount + ' locations');

  if (locationCount === 0) {
    SpreadsheetApp.getUi().alert('⚠️ No Tasks Found\n\nNo tasks with locations and due dates found in Glove Swaps, Sleeve Swaps, Training Tracking, or Reclaims.');
    return;
  }

  // Create/update To-Do List with smart schedule
  createSmartScheduleToDoList(ss, tasksByLocation);

  SpreadsheetApp.getUi().alert('✅ Smart Schedule Generated!\n\n' + totalTasks + ' tasks from ' + locationCount + ' locations grouped and prioritized.');
  Logger.log('=== generateSmartSchedule END ===');
}

// ============================================================================
// TASK COLLECTION FUNCTIONS
// ============================================================================

/**
 * Collects all tasks from Glove Swaps, Sleeve Swaps, and Training Tracking.
 * Groups them by location with due date priority.
 *
 * @param {Spreadsheet} ss - Active spreadsheet
 * @return {Object} Tasks grouped by location {location: [{task details}]}
 */
function collectAndGroupTasks(ss) {
  var tasksByLocation = {};
  var today = new Date();
  today.setHours(0, 0, 0, 0);

  // Get location lookup from Employees sheet
  var employeeLocations = getEmployeeLocationMap(ss);
  Logger.log('collectAndGroupTasks: Found ' + Object.keys(employeeLocations).length + ' employee locations');

  // Get foreman lookup from Employees sheet
  var employeeForemen = getEmployeeForemanMap(ss);
  Logger.log('collectAndGroupTasks: Found ' + Object.keys(employeeForemen).length + ' employee foremen');

  // Collect from Glove Swaps
  var beforeGlove = countTasks(tasksByLocation);
  collectSwapTasks(ss, 'Glove Swaps', 'Glove', tasksByLocation, employeeLocations, employeeForemen, today);
  var afterGlove = countTasks(tasksByLocation);
  Logger.log('collectAndGroupTasks: Glove Swaps added ' + (afterGlove - beforeGlove) + ' tasks');

  // Collect from Sleeve Swaps
  var beforeSleeve = countTasks(tasksByLocation);
  collectSwapTasks(ss, 'Sleeve Swaps', 'Sleeve', tasksByLocation, employeeLocations, employeeForemen, today);
  var afterSleeve = countTasks(tasksByLocation);
  Logger.log('collectAndGroupTasks: Sleeve Swaps added ' + (afterSleeve - beforeSleeve) + ' tasks');

  // Collect from Training Tracking
  var beforeTraining = countTasks(tasksByLocation);
  collectTrainingTasks(ss, tasksByLocation, today);
  var afterTraining = countTasks(tasksByLocation);
  Logger.log('collectAndGroupTasks: Training added ' + (afterTraining - beforeTraining) + ' tasks');

  // Collect from Reclaims
  var beforeReclaims = countTasks(tasksByLocation);
  collectReclaimTasks(ss, tasksByLocation, employeeLocations, employeeForemen, today);
  var afterReclaims = countTasks(tasksByLocation);
  Logger.log('collectAndGroupTasks: Reclaims added ' + (afterReclaims - beforeReclaims) + ' tasks');

  // Collect from Expiring Certs (based on selected cert types in ToDoConfig)
  var beforeCerts = countTasks(tasksByLocation);
  collectExpiringCertTasks(ss, tasksByLocation, employeeLocations, employeeForemen, today);
  var afterCerts = countTasks(tasksByLocation);
  Logger.log('collectAndGroupTasks: Expiring Certs added ' + (afterCerts - beforeCerts) + ' tasks');

  // Collect from Manual Tasks
  var beforeManual = countTasks(tasksByLocation);
  collectManualTasks(ss, tasksByLocation, today);
  var afterManual = countTasks(tasksByLocation);
  Logger.log('collectAndGroupTasks: Manual Tasks added ' + (afterManual - beforeManual) + ' tasks');

  Logger.log('collectAndGroupTasks: TOTAL tasks = ' + countTasks(tasksByLocation));

  // Sort tasks within each location by foreman, then by due date
  for (var location in tasksByLocation) {
    tasksByLocation[location].sort(function(a, b) {
      // First sort by foreman (groups crew members together)
      var foremanCompare = (a.foreman || 'ZZZ').localeCompare(b.foreman || 'ZZZ');
      if (foremanCompare !== 0) return foremanCompare;

      // Overdue tasks first within foreman group
      if (a.isOverdue && !b.isOverdue) return -1;
      if (!a.isOverdue && b.isOverdue) return 1;

      // Then by due date (earliest first)
      if (a.dueDate && b.dueDate) {
        return a.dueDate - b.dueDate;
      }

      // Tasks with due dates before tasks without
      if (a.dueDate && !b.dueDate) return -1;
      if (!a.dueDate && b.dueDate) return 1;

      return 0;
    });
  }

  return tasksByLocation;
}


/**
 * Creates employee name to location map from Employees sheet.
 *
 * @param {Spreadsheet} ss - Active spreadsheet
 * @return {Object} Map of employee name (lowercase) to location
 */
function getEmployeeLocationMap(ss) {
  var employeesSheet = ss.getSheetByName('Employees');
  if (!employeesSheet || employeesSheet.getLastRow() < 2) {
    return {};
  }

  var data = employeesSheet.getDataRange().getValues();
  var headers = data[0];
  var nameCol = -1;
  var locationCol = -1;

  // Find columns
  for (var h = 0; h < headers.length; h++) {
    var header = String(headers[h]).toLowerCase().trim();
    if (header === 'name') nameCol = h;
    if (header === 'location') locationCol = h;
  }

  if (nameCol === -1 || locationCol === -1) {
    return {};
  }

  var locationMap = {};
  for (var i = 1; i < data.length; i++) {
    var name = String(data[i][nameCol]).trim();
    var location = String(data[i][locationCol]).trim();

    if (name && location) {
      locationMap[name.toLowerCase()] = location;
    }
  }

  return locationMap;
}

/**
 * Creates employee name to foreman map from Employees sheet.
 * Groups employees by crew (extracted from job number) and finds foreman (F or GTO F classification).
 *
 * @param {Spreadsheet} ss - Active spreadsheet
 * @return {Object} Map of employee name (lowercase) to foreman name
 */
function getEmployeeForemanMap(ss) {
  var employeesSheet = ss.getSheetByName('Employees');
  if (!employeesSheet || employeesSheet.getLastRow() < 2) {
    return {};
  }

  var data = employeesSheet.getDataRange().getValues();
  var headers = data[0];
  var nameCol = -1;
  var locationCol = -1;
  var jobNumCol = -1;
  var classificationCol = -1;

  // Find columns
  for (var h = 0; h < headers.length; h++) {
    var header = String(headers[h]).toLowerCase().trim();
    if (header === 'name') nameCol = h;
    if (header === 'location') locationCol = h;
    if (header === 'job number') jobNumCol = h;
    if (header === 'job classification') classificationCol = h;
  }

  if (nameCol === -1) {
    return {};
  }

  // Helper to extract crew number from job number (e.g., "009-26.04" -> "009-26")
  function extractCrewNum(jobNum) {
    if (!jobNum) return '';
    var jobStr = String(jobNum).trim();
    var lastDotIndex = jobStr.lastIndexOf('.');
    if (lastDotIndex !== -1) {
      return jobStr.substring(0, lastDotIndex);
    }
    return jobStr;
  }

  // Build maps for location, job number, and classification
  var empLocationMap = {};
  var empJobNumMap = {};
  var empClassificationMap = {};
  var empNames = {}; // lowercase -> proper case

  for (var i = 1; i < data.length; i++) {
    var name = String(data[i][nameCol]).trim();
    var nameLower = name.toLowerCase();
    if (name) {
      empNames[nameLower] = name;
      empLocationMap[nameLower] = locationCol !== -1 ? String(data[i][locationCol]).trim() : '';
      empJobNumMap[nameLower] = jobNumCol !== -1 ? String(data[i][jobNumCol]).trim() : '';
      empClassificationMap[nameLower] = classificationCol !== -1 ? String(data[i][classificationCol]).trim() : '';
    }
  }

  // Find foreman for each employee based on same location and crew
  var foremanMap = {};
  Object.keys(empNames).forEach(function(nameLower) {
    var empLocation = empLocationMap[nameLower];
    var empCrew = extractCrewNum(empJobNumMap[nameLower]);

    if (!empCrew || !empLocation) {
      foremanMap[nameLower] = empCrew || 'Unknown';
      return;
    }

    // Search for foreman in same location and crew
    var foremanName = null;
    Object.keys(empNames).forEach(function(otherName) {
      if (empLocationMap[otherName] === empLocation) {
        var theirCrew = extractCrewNum(empJobNumMap[otherName]);
        if (theirCrew === empCrew) {
          var classification = empClassificationMap[otherName];
          if (classification === 'F' || classification === 'GTO F') {
            foremanName = empNames[otherName]; // Use proper-case name
          }
        }
      }
    });

    foremanMap[nameLower] = foremanName || empCrew || 'Unknown';
  });

  return foremanMap;
}

/**
 * Collects swap tasks from Glove Swaps or Sleeve Swaps sheet.
 *
 * Sheet structure:
 * - Row 1: "Class X Glove/Sleeve Swaps" header
 * - Row 2: STAGE headers
 * - Row 3: Sub-headers
 * - Row 4: Column headers (Employee, Current Glove #, etc.)
 * - Row 5+: Location sub-headers (📍 Location) and data rows
 *
 * @param {Spreadsheet} ss - Active spreadsheet
 * @param {string} sheetName - 'Glove Swaps' or 'Sleeve Swaps'
 * @param {string} itemType - 'Glove' or 'Sleeve'
 * @param {Object} tasksByLocation - Object to add tasks to
 * @param {Object} employeeLocations - Employee to location map
 * @param {Object} employeeForemen - Employee to foreman map
 * @param {Date} today - Today's date
 */
function collectSwapTasks(ss, sheetName, itemType, tasksByLocation, employeeLocations, employeeForemen, today) {
  Logger.log('*** collectSwapTasks CALLED for ' + sheetName + ' ***');

  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    Logger.log('collectSwapTasks: Sheet "' + sheetName + '" NOT FOUND');
    return;
  }

  var lastRow = sheet.getLastRow();
  Logger.log('collectSwapTasks: Sheet "' + sheetName + '" found with ' + lastRow + ' rows');

  if (lastRow < 4) {
    Logger.log('collectSwapTasks: Sheet ' + sheetName + ' has too few rows (' + lastRow + ')');
    return;
  }

  var data = sheet.getDataRange().getValues();
  Logger.log('collectSwapTasks: Processing ' + sheetName + ' with ' + data.length + ' rows of data');

  // Find ALL header rows (there's one per class section)
  // Header row contains "Employee" in first visible column
  var headerRowIndices = [];
  for (var i = 0; i < data.length; i++) {
    var firstCell = String(data[i][0]).toLowerCase().trim();
    if (firstCell === 'employee') {
      headerRowIndices.push(i);
      Logger.log('collectSwapTasks: Found header row at index ' + i);
    }
  }

  if (headerRowIndices.length === 0) {
    Logger.log('collectSwapTasks: Could not find any header rows in ' + sheetName);
    return;
  }

  // Process each section (Class 0, Class 2, Class 3)
  for (var section = 0; section < headerRowIndices.length; section++) {
    var headerRowIndex = headerRowIndices[section];
    var nextHeaderIndex = (section < headerRowIndices.length - 1) ? headerRowIndices[section + 1] : data.length;

    var headers = data[headerRowIndex];

    // Find column indices
    var employeeCol = -1;
    var currentItemCol = -1;
    var sizeCol = -1;
    var changeOutCol = -1;
    var daysLeftCol = -1;
    var pickListCol = -1;
    var statusCol = -1;
    var pickedCol = -1;
    var dateChangedCol = -1;

    for (var h = 0; h < headers.length; h++) {
      var header = String(headers[h]).toLowerCase().trim();
      if (header === 'employee') employeeCol = h;
      if (header.indexOf('current') !== -1 && header.indexOf('#') !== -1) currentItemCol = h;
      if (header === 'size') sizeCol = h;
      if (header === 'change out date') changeOutCol = h;
      if (header === 'days left') daysLeftCol = h;
      if (header.indexOf('pick list') !== -1 && header.indexOf('#') !== -1) pickListCol = h;
      if (header === 'status') statusCol = h;
      if (header === 'picked') pickedCol = h;
      if (header === 'date changed') dateChangedCol = h;
    }

    if (employeeCol === -1) {
      Logger.log('collectSwapTasks: Could not find Employee column in section ' + section);
      continue;
    }

    Logger.log('collectSwapTasks: Section ' + section + ' - Processing rows ' + (headerRowIndex + 2) + ' to ' + nextHeaderIndex + ', pickedCol=' + pickedCol + ', dateChangedCol=' + dateChangedCol);

    // Process data rows in this section
    var rowsChecked = 0;
    var rowsWithEmployee = 0;
    var rowsPicked = 0;
    var rowsNotDelivered = 0;

    for (var i = headerRowIndex + 1; i < nextHeaderIndex; i++) {
      var row = data[i];
      var employee = String(row[employeeCol]).trim();

      // Skip header rows, location markers, and empty rows
      if (!employee) continue;
      if (employee.indexOf('📍') !== -1) continue; // Skip location sub-headers
      if (employee.toLowerCase().indexOf('class') !== -1) continue; // Skip class headers
      if (employee.toLowerCase() === 'employee') continue; // Skip if header repeated
      if (employee.toLowerCase() === 'stage') continue; // Skip stage headers
      if (employee.toLowerCase().indexOf('no swaps') !== -1) continue; // Skip "No swaps due" message
      if (employee.toLowerCase().indexOf('pick list') !== -1) continue; // Skip sub-headers

      // Get picked status and date changed
      var pickedValue = pickedCol !== -1 ? row[pickedCol] : false;
      var isPicked = (pickedValue === true || pickedValue === 'TRUE' || pickedValue === 'true');
      var dateChanged = dateChangedCol !== -1 ? row[dateChangedCol] : '';

      rowsWithEmployee++;

      // Debug logging for first few rows in each section
      if (rowsWithEmployee <= 3) {
        Logger.log('collectSwapTasks: Row ' + (i+1) + ' Employee="' + employee + '" pickedValue=' + JSON.stringify(pickedValue) + ' (type=' + typeof pickedValue + ') isPicked=' + isPicked + ' dateChanged="' + dateChanged + '"');
      }

      // ONLY include items where Picked=TRUE AND Date Changed is empty
      // These are items ready for delivery but not yet delivered
      if (!isPicked) {
        continue; // Skip if NOT picked
      }
      rowsPicked++;

      if (dateChanged) {
        continue; // Skip if already delivered
      }
      rowsNotDelivered++;

      var currentItem = currentItemCol !== -1 ? String(row[currentItemCol]).trim() : '';
      var pickListItem = pickListCol !== -1 ? String(row[pickListCol]).trim() : '';
      var size = sizeCol !== -1 ? String(row[sizeCol]).trim() : '';
      var changeOutDate = changeOutCol !== -1 ? row[changeOutCol] : '';
      var daysLeftValue = daysLeftCol !== -1 ? row[daysLeftCol] : '';
      var status = statusCol !== -1 ? String(row[statusCol]).trim() : '';

      // Get location for this employee
      var location = employeeLocations[employee.toLowerCase()] || 'Unknown';

      // Parse due date
      var dueDate = null;
      var isOverdue = false;
      var daysTillDue = null;

      if (changeOutDate) {
        if (changeOutDate instanceof Date) {
          dueDate = new Date(changeOutDate);
          dueDate.setHours(0, 0, 0, 0);
          daysTillDue = Math.ceil((dueDate - today) / (1000 * 60 * 60 * 24));
          isOverdue = daysTillDue < 0;
        } else if (typeof changeOutDate === 'string' && changeOutDate.trim() !== '') {
          // Try to parse string date
          dueDate = new Date(changeOutDate);
          if (!isNaN(dueDate.getTime())) {
            dueDate.setHours(0, 0, 0, 0);
            daysTillDue = Math.ceil((dueDate - today) / (1000 * 60 * 60 * 24));
            isOverdue = daysTillDue < 0;
          } else {
            dueDate = null;
          }
        }
      }

      // Check if this is an overdue or due soon task
      if (daysLeftValue === 'OVERDUE') {
        isOverdue = true;
      }

      // Get foreman for this employee
      var foreman = employeeForemen[employee.toLowerCase()] || 'Unknown';

      // Create task object
      var task = {
        type: 'Swap',
        itemType: itemType,
        employee: employee,
        location: location,
        foreman: foreman,
        currentItem: currentItem,
        pickListItem: pickListItem,
        size: size,
        dueDate: dueDate,
        isOverdue: isOverdue,
        daysTillDue: daysTillDue,
        status: status,
        estimatedTime: 10, // 10 minutes per swap
        priority: isOverdue ? 'High' : (daysTillDue !== null && daysTillDue <= 7 ? 'Medium' : 'Low'),
        sheetName: sheetName,
        rowIndex: i + 1 // 1-based row number
      };

      // Add to location group
      if (!tasksByLocation[location]) {
        tasksByLocation[location] = [];
      }
      tasksByLocation[location].push(task);
      Logger.log('collectSwapTasks: Added ' + itemType + ' swap task for ' + employee + ' at ' + location);
    }

    Logger.log('collectSwapTasks: Section ' + section + ' summary - rowsWithEmployee=' + rowsWithEmployee + ', rowsPicked=' + rowsPicked + ', rowsNotDelivered=' + rowsNotDelivered);
  }
}


/**
 * Collects training tasks from Training Tracking sheet.
 * Filters crews based on job classifications selected in Training Config.
 *
 * @param {Spreadsheet} ss - Active spreadsheet
 * @param {Object} tasksByLocation - Object to add tasks to
 * @param {Date} today - Today's date
 */
function collectTrainingTasks(ss, tasksByLocation, today) {
  var trainingSheet = ss.getSheetByName('Training Tracking');
  if (!trainingSheet || trainingSheet.getLastRow() < 3) {
    Logger.log('collectTrainingTasks: Training Tracking sheet not found or empty');
    return;
  }

  var data = trainingSheet.getDataRange().getValues();
  Logger.log('collectTrainingTasks: Processing Training Tracking with ' + data.length + ' rows');

  // Get selected crews from config
  var properties = PropertiesService.getScriptProperties();
  var selectedJson = properties.getProperty('trainingCrews');
  var selectedCrews = null; // null means all crews are selected (default)

  if (selectedJson) {
    try {
      selectedCrews = JSON.parse(selectedJson);
      Logger.log('collectTrainingTasks: Selected crews: ' + selectedCrews.join(', '));
    } catch (e) {
      Logger.log('collectTrainingTasks: Error parsing trainingCrews: ' + e);
      selectedCrews = null; // Default to all crews
    }
  }

  // Headers are in row 2 (index 1), data starts at row 3 (index 2)
  var monthCol = 0;      // A: Month
  var topicCol = 1;      // B: Training Topic
  var crewCol = 2;       // C: Crew #
  var leadCol = 3;       // D: Crew Lead
  var dateCol = 5;       // F: Completion Date
  var statusCol = 9;     // J: Status

  // Month name to number mapping
  var monthNumbers = {
    'january': 0, 'february': 1, 'march': 2, 'april': 3,
    'may': 4, 'june': 5, 'july': 6, 'august': 7,
    'september': 8, 'october': 9, 'november': 10, 'december': 11
  };

  // Get crew locations
  var crewLocations = getCrewLocationMap(ss);
  var currentYear = today.getFullYear();
  var currentMonth = today.getMonth();
  var taskCount = 0;
  var skippedCrews = 0;

  for (var i = 2; i < data.length; i++) {
    var row = data[i];
    var month = String(row[monthCol]).trim();
    var topic = String(row[topicCol]).trim();
    var crew = String(row[crewCol]).trim();
    var crewLead = String(row[leadCol]).trim();
    var status = String(row[statusCol]).trim();
    var completionDate = row[dateCol];

    // Skip if complete, N/A, or already has completion date
    if (!crew || status === 'Complete' || status === 'N/A') continue;
    if (completionDate && completionDate instanceof Date) continue;

    // Skip if this crew is NOT in the selected crews list (if a list is configured)
    if (selectedCrews !== null && selectedCrews.indexOf(crew) === -1) {
      skippedCrews++;
      Logger.log('collectTrainingTasks: Skipping crew ' + crew + ' (' + crewLead + ') - not in selected crews');
      continue;
    }

    var location = crewLocations[crew] || 'Unknown';

    // Calculate due date based on month (training should be done by end of that month)
    var dueDate = null;
    var isOverdue = false;
    var daysTillDue = null;

    var monthNum = monthNumbers[month.toLowerCase()];
    if (monthNum !== undefined) {
      // Training is due by the last day of its scheduled month
      // Use next month's 0th day to get last day of scheduled month
      dueDate = new Date(currentYear, monthNum + 1, 0);
      dueDate.setHours(23, 59, 59, 0);

      daysTillDue = Math.ceil((dueDate - today) / (1000 * 60 * 60 * 24));
      isOverdue = daysTillDue < 0;
    }

    // Also check status for overdue
    if (status === 'Overdue') {
      isOverdue = true;
    }

    // Determine priority
    var priority = 'Medium';
    if (isOverdue) {
      priority = 'High';
    } else if (daysTillDue !== null && daysTillDue <= 7) {
      priority = 'High';
    } else if (daysTillDue !== null && daysTillDue <= 14) {
      priority = 'Medium';
    } else {
      priority = 'Low';
    }

    var task = {
      type: 'Training',
      itemType: topic, // Use topic as item type for training
      topic: topic,
      employee: crewLead || crew, // Use crew lead as employee, or crew number
      crew: crew,
      crewLead: crewLead,
      foreman: crewLead || crew, // Crew lead is the foreman for training tasks
      location: location,
      month: month,
      currentItem: '', // No current item for training
      pickListItem: '', // No pick list for training
      size: '', // No size for training
      dueDate: dueDate,
      isOverdue: isOverdue,
      daysTillDue: daysTillDue,
      status: status,
      estimatedTime: 60, // 60 minutes per training
      priority: priority,
      sheetName: 'Training Tracking',
      rowIndex: i + 1
    };

    // Only include training for current month or past months (not future)
    // For January, monthNum = 0, currentMonth = 0, so we include January
    if (monthNum !== undefined && monthNum > currentMonth) {
      // Skip future month training
      continue;
    }

    // Add to location group
    if (!tasksByLocation[location]) {
      tasksByLocation[location] = [];
    }
    tasksByLocation[location].push(task);
    taskCount++;
  }

  Logger.log('collectTrainingTasks: Added ' + taskCount + ' training tasks, skipped ' + skippedCrews + ' crews (not in selected list)');
}

/**
 * Builds a map of crew numbers to whether they have employees with selected job classifications.
 *
 * @param {Spreadsheet} ss - Active spreadsheet
 * @param {Array} selectedClassifications - Array of job classification codes to include
 * @return {Object} Map of crew number to true (if has selected employees)
 */
function getCrewClassificationMap(ss, selectedClassifications) {
  var employeesSheet = ss.getSheetByName('Employees');
  if (!employeesSheet || employeesSheet.getLastRow() < 2) {
    return {};
  }

  var data = employeesSheet.getDataRange().getValues();
  var headers = data[0];
  var jobNumCol = -1;
  var classificationCol = -1;

  // Find columns
  for (var h = 0; h < headers.length; h++) {
    var header = String(headers[h]).toLowerCase().trim();
    if (header === 'job number') jobNumCol = h;
    if (header === 'job classification') classificationCol = h;
  }

  if (jobNumCol === -1 || classificationCol === -1) {
    Logger.log('getCrewClassificationMap: Could not find required columns');
    return {};
  }

  var crewMap = {};

  for (var i = 1; i < data.length; i++) {
    var jobNumber = String(data[i][jobNumCol]).trim();
    var classification = String(data[i][classificationCol]).trim();

    if (!jobNumber) continue;

    // Extract crew number (e.g., "009-26.1" → "009-26")
    var crew = extractCrewNumber(jobNumber);
    if (!crew) continue;

    // If this employee has a selected classification, mark the crew
    if (selectedClassifications.indexOf(classification) !== -1) {
      crewMap[crew] = true;
    }
  }

  return crewMap;
}

/**
 * Collects reclaim tasks from Reclaims sheet.
 * Includes Class 3 Reclaims (downgrade to CL2) and Class 2 Reclaims (upgrade to CL3).
 *
 * Reclaims sheet structure:
 * - "Class 3 Reclaims" section header
 * - Headers: Employee, Item Type, Item #, Size, Class, Location, Pick List Item #, Pick List Status
 * - "Class 2 Reclaims" section header
 * - Same headers
 *
 * @param {Spreadsheet} ss - Active spreadsheet
 * @param {Object} tasksByLocation - Object to add tasks to
 * @param {Object} employeeLocations - Employee to location map
 * @param {Object} employeeForemen - Employee to foreman map
 * @param {Date} today - Today's date
 */
function collectReclaimTasks(ss, tasksByLocation, employeeLocations, employeeForemen, today) {
  var reclaimsSheet = ss.getSheetByName('Reclaims');
  if (!reclaimsSheet || reclaimsSheet.getLastRow() < 3) {
    Logger.log('collectReclaimTasks: Reclaims sheet not found or empty');
    return;
  }

  var data = reclaimsSheet.getDataRange().getValues();
  Logger.log('collectReclaimTasks: Processing Reclaims sheet with ' + data.length + ' rows');

  var taskCount = 0;
  var currentReclaimType = ''; // 'CL3→CL2' or 'CL2→CL3'
  var inReclaimSection = false;
  var headerRowIndex = -1;

  // Column indices (will be set when we find header row)
  var employeeCol = -1;
  var itemTypeCol = -1;
  var itemNumCol = -1;
  var sizeCol = -1;
  var classCol = -1;
  var locationCol = -1;
  var pickListCol = -1;
  var statusCol = -1;

  for (var i = 0; i < data.length; i++) {
    var row = data[i];
    var firstCell = String(row[0]).trim();
    var firstCellLower = firstCell.toLowerCase();

    // Detect section headers
    if (firstCellLower.indexOf('class 3 reclaims') !== -1) {
      currentReclaimType = 'Reclaim CL3→CL2';
      inReclaimSection = true;
      headerRowIndex = -1; // Reset to find new header
      Logger.log('collectReclaimTasks: Found Class 3 Reclaims section at row ' + (i + 1));
      continue;
    }

    if (firstCellLower.indexOf('class 2 reclaims') !== -1) {
      currentReclaimType = 'Reclaim CL2→CL3';
      inReclaimSection = true;
      headerRowIndex = -1; // Reset to find new header
      Logger.log('collectReclaimTasks: Found Class 2 Reclaims section at row ' + (i + 1));
      continue;
    }

    // Skip other section headers (Previous Employee, Approved Locations, Lost Items)
    if (firstCellLower.indexOf('previous employee') !== -1 ||
        firstCellLower.indexOf('approved') !== -1 ||
        firstCellLower.indexOf('lost items') !== -1) {
      inReclaimSection = false;
      continue;
    }

    // Skip if not in a reclaim section
    if (!inReclaimSection) continue;

    // Find header row within reclaim section
    if (firstCellLower === 'employee') {
      headerRowIndex = i;
      // Find column indices
      for (var h = 0; h < row.length; h++) {
        var header = String(row[h]).toLowerCase().trim();
        if (header === 'employee') employeeCol = h;
        if (header === 'item type') itemTypeCol = h;
        if (header === 'item #') itemNumCol = h;
        if (header === 'size') sizeCol = h;
        if (header === 'class') classCol = h;
        if (header === 'location') locationCol = h;
        if (header.indexOf('pick list') !== -1 && header.indexOf('#') !== -1) pickListCol = h;
        if (header.indexOf('pick list') !== -1 && header.indexOf('status') !== -1) statusCol = h;
      }
      Logger.log('collectReclaimTasks: Found header row at ' + (i + 1) + ', employeeCol=' + employeeCol);
      continue;
    }

    // Skip if we haven't found header row yet
    if (headerRowIndex === -1 || employeeCol === -1) continue;

    // Process data rows
    var employee = String(row[employeeCol]).trim();

    // Skip empty rows or location headers
    if (!employee) continue;
    if (employee.indexOf('📍') !== -1) continue;

    var itemType = itemTypeCol !== -1 ? String(row[itemTypeCol]).trim() : '';
    var itemNum = itemNumCol !== -1 ? String(row[itemNumCol]).trim() : '';
    var size = sizeCol !== -1 ? String(row[sizeCol]).trim() : '';
    var itemClass = classCol !== -1 ? String(row[classCol]).trim() : '';
    var location = locationCol !== -1 ? String(row[locationCol]).trim() : '';
    var pickListItem = pickListCol !== -1 ? String(row[pickListCol]).trim() : '';
    var status = statusCol !== -1 ? String(row[statusCol]).trim() : '';

    // Skip if already resolved (has "Already Has" in status)
    if (status.indexOf('Already Has') !== -1) {
      continue;
    }

    // Use location from row, or fall back to employee lookup
    if (!location) {
      location = employeeLocations[employee.toLowerCase()] || 'Unknown';
    }

    // Get foreman for this employee
    var foreman = employeeForemen[employee.toLowerCase()] || 'Unknown';

    // Reclaims are always high priority (ASAP)
    var task = {
      type: currentReclaimType, // 'Reclaim CL3→CL2' or 'Reclaim CL2→CL3'
      itemType: itemType,
      employee: employee,
      location: location,
      foreman: foreman,
      currentItem: itemNum,
      pickListItem: pickListItem,
      size: size,
      itemClass: itemClass,
      dueDate: null, // Reclaims don't have due dates
      isOverdue: false,
      daysTillDue: null,
      status: status || 'Pending',
      estimatedTime: 10, // 10 minutes per reclaim
      priority: 'High', // Reclaims are always high priority
      sheetName: 'Reclaims',
      rowIndex: i + 1
    };

    // Add to location group
    if (!tasksByLocation[location]) {
      tasksByLocation[location] = [];
    }
    tasksByLocation[location].push(task);
    taskCount++;

    Logger.log('collectReclaimTasks: Added ' + currentReclaimType + ' task for ' + employee + ' at ' + location);
  }

  Logger.log('collectReclaimTasks: Added ' + taskCount + ' reclaim tasks total');
}

/**
 * Collects expiring certification tasks based on selected cert types in ToDoConfig.
 * Only creates tasks for cert types that are checked in the "Create To Do Tasks For" section.
 *
 * @param {Spreadsheet} ss - Active spreadsheet
 * @param {Object} tasksByLocation - Object to add tasks to
 * @param {Object} employeeLocations - Employee to location map
 * @param {Object} employeeForemen - Employee to foreman map
 * @param {Date} today - Today's date
 */
function collectExpiringCertTasks(ss, tasksByLocation, employeeLocations, employeeForemen, today) {
  var expiringSheet = ss.getSheetByName('Expiring Certs');
  if (!expiringSheet || expiringSheet.getLastRow() < 2) {
    Logger.log('collectExpiringCertTasks: Expiring Certs sheet not found or empty');
    return;
  }

  // Get selected cert types from config
  var properties = PropertiesService.getScriptProperties();
  var selectedJson = properties.getProperty('selectedCertTypes');
  var selectedCertTypes = [];

  if (selectedJson) {
    try {
      selectedCertTypes = JSON.parse(selectedJson);
    } catch (e) {
      Logger.log('collectExpiringCertTasks: Error parsing selectedCertTypes: ' + e);
      // Use defaults if parse fails - must match defaults in Code.gs getExpiringCertsMapping()
      selectedCertTypes = ['DL', 'MEC Expiration', '1st Aid', 'CPR', 'Crane Cert'];
    }
  } else {
    // Default cert types if none configured - must match defaults in Code.gs getExpiringCertsMapping()
    selectedCertTypes = ['DL', 'MEC Expiration', '1st Aid', 'CPR', 'Crane Cert'];
  }

  Logger.log('collectExpiringCertTasks: Selected cert types: ' + selectedCertTypes.join(', '));

  var data = expiringSheet.getDataRange().getValues();
  var headers = data[0];

  // Find column indices
  var empCol = -1;
  var certTypeCol = -1;
  var expirationCol = -1;
  var locationCol = -1;

  for (var h = 0; h < headers.length; h++) {
    var header = String(headers[h]).toLowerCase().trim();
    if (header === 'employee name' || header === 'employee') empCol = h;
    if (header === 'item type' || header === 'cert type' || header === 'certification') certTypeCol = h;
    if (header === 'expiration date' || header === 'expiration') expirationCol = h;
    if (header === 'location') locationCol = h;
  }

  // Fallback to positional columns (A=Employee, B=Cert Type, C=Expiration)
  if (empCol === -1) empCol = 0;
  if (certTypeCol === -1) certTypeCol = 1;
  if (expirationCol === -1) expirationCol = 2;

  Logger.log('collectExpiringCertTasks: empCol=' + empCol + ', certTypeCol=' + certTypeCol + ', expirationCol=' + expirationCol);

  var taskCount = 0;
  var thirtyDaysFromNow = new Date(today);
  thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var employee = String(row[empCol] || '').trim();
    var certType = String(row[certTypeCol] || '').trim();
    var expirationDate = row[expirationCol];

    // Skip if no employee or cert type
    if (!employee || !certType) continue;

    // Skip if this cert type is NOT selected in config
    if (selectedCertTypes.indexOf(certType) === -1) {
      continue;
    }

    // Parse expiration date
    var expDate = null;
    if (expirationDate instanceof Date) {
      expDate = new Date(expirationDate);
    } else if (expirationDate && typeof expirationDate === 'string') {
      expDate = new Date(expirationDate);
      if (isNaN(expDate.getTime())) {
        expDate = null;
      }
    }

    // Skip if no valid expiration date (non-expiring certs)
    if (!expDate) continue;

    expDate.setHours(0, 0, 0, 0);

    // Calculate days until expiration
    var daysTillDue = Math.ceil((expDate - today) / (1000 * 60 * 60 * 24));

    // Only include certs that are expired or expiring within 30 days
    if (daysTillDue > 30) continue;

    var isOverdue = daysTillDue < 0;

    // Determine priority
    var priority = 'Low';
    if (isOverdue) {
      priority = 'High';
    } else if (daysTillDue <= 7) {
      priority = 'High';
    } else if (daysTillDue <= 14) {
      priority = 'Medium';
    }

    // Get location from row or employee lookup
    var location = locationCol !== -1 ? String(row[locationCol] || '').trim() : '';
    if (!location) {
      location = employeeLocations[employee.toLowerCase()] || 'Unknown';
    }

    // Get foreman for this employee
    var foreman = employeeForemen[employee.toLowerCase()] || 'Unassigned';

    // Determine status
    var status = isOverdue ? 'Expired' : 'Expiring Soon';

    var task = {
      type: 'Cert Expiring',
      itemType: certType,
      employee: employee,
      location: location,
      foreman: foreman, // Use actual foreman from employee lookup
      currentItem: '', // No item number for certs
      pickListItem: '',
      size: '',
      dueDate: expDate,
      isOverdue: isOverdue,
      daysTillDue: daysTillDue,
      status: status,
      estimatedTime: 0, // No time for cert tasks - they're reminders
      priority: priority,
      sheetName: 'Expiring Certs',
      rowIndex: i + 1
    };

    // Add to location group
    if (!tasksByLocation[location]) {
      tasksByLocation[location] = [];
    }
    tasksByLocation[location].push(task);
    taskCount++;

    Logger.log('collectExpiringCertTasks: Added ' + certType + ' task for ' + employee + ' at ' + location + ' (days=' + daysTillDue + ')');
  }

  Logger.log('collectExpiringCertTasks: Added ' + taskCount + ' expiring cert tasks total');
}

/**
 * Collects manually added tasks from the Manual Tasks sheet.
 *
 * @param {Spreadsheet} ss - Active spreadsheet
 * @param {Object} tasksByLocation - Object to add tasks to
 * @param {Date} today - Today's date
 */
function collectManualTasks(ss, tasksByLocation, today) {
  var manualSheet = ss.getSheetByName('Manual Tasks');
  if (!manualSheet || manualSheet.getLastRow() < 2) {
    Logger.log('collectManualTasks: Manual Tasks sheet not found or empty');
    return;
  }

  var data = manualSheet.getDataRange().getValues();
  var headers = data[0];

  // Find column indices from headers
  // Expected: Location, Priority, Task Type, Scheduled Date, Start Time, End Time,
  //           Estimated Time (hrs), Start Location, End Location, Notes, Date Added, Status
  var locationCol = -1;
  var priorityCol = -1;
  var taskTypeCol = -1;
  var scheduledDateCol = -1;
  var startTimeCol = -1;
  var endTimeCol = -1;
  var estimatedTimeCol = -1;
  var startLocationCol = -1;
  var endLocationCol = -1;
  var notesCol = -1;
  var statusCol = -1;

  for (var h = 0; h < headers.length; h++) {
    var header = String(headers[h]).toLowerCase().trim();
    if (header === 'location') locationCol = h;
    if (header === 'priority') priorityCol = h;
    if (header === 'task type') taskTypeCol = h;
    if (header === 'scheduled date') scheduledDateCol = h;
    if (header === 'start time') startTimeCol = h;
    if (header === 'end time') endTimeCol = h;
    if (header.indexOf('estimated time') !== -1) estimatedTimeCol = h;
    if (header === 'start location') startLocationCol = h;
    if (header === 'end location') endLocationCol = h;
    if (header === 'notes') notesCol = h;
    if (header === 'status') statusCol = h;
  }

  // Fallbacks for column positions
  if (locationCol === -1) locationCol = 0;
  if (priorityCol === -1) priorityCol = 1;
  if (taskTypeCol === -1) taskTypeCol = 2;
  if (scheduledDateCol === -1) scheduledDateCol = 3;
  if (startTimeCol === -1) startTimeCol = 4;
  if (endTimeCol === -1) endTimeCol = 5;
  if (estimatedTimeCol === -1) estimatedTimeCol = 6;
  if (statusCol === -1) statusCol = 11;

  var taskCount = 0;

  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var location = String(row[locationCol] || '').trim();
    var priority = String(row[priorityCol] || 'Medium').trim();
    var taskType = String(row[taskTypeCol] || 'Task').trim();
    var scheduledDate = row[scheduledDateCol];
    var startTime = row[startTimeCol] || '';
    var estimatedTime = parseFloat(row[estimatedTimeCol]) || 1;
    var notes = notesCol !== -1 ? String(row[notesCol] || '').trim() : '';
    var status = statusCol !== -1 ? String(row[statusCol] || 'Pending').trim() : 'Pending';

    // Skip if no location
    if (!location) {
      Logger.log('collectManualTasks: Skipping row ' + (i+1) + ' - no location');
      continue;
    }

    // Skip if already complete
    if (status.toLowerCase() === 'complete' || status.toLowerCase() === 'completed') {
      Logger.log('collectManualTasks: Skipping row ' + (i+1) + ' - already complete');
      continue;
    }

    // Parse scheduled date
    var dueDate = null;
    if (scheduledDate instanceof Date) {
      dueDate = new Date(scheduledDate);
      dueDate.setHours(0, 0, 0, 0);
    } else if (scheduledDate && typeof scheduledDate === 'string') {
      dueDate = new Date(scheduledDate);
      if (isNaN(dueDate.getTime())) {
        dueDate = null;
      } else {
        dueDate.setHours(0, 0, 0, 0);
      }
    }

    // Calculate days until due
    var daysTillDue = null;
    var isOverdue = false;
    if (dueDate) {
      daysTillDue = Math.ceil((dueDate - today) / (1000 * 60 * 60 * 24));
      isOverdue = daysTillDue < 0;
    }

    // Build task object
    var task = {
      type: taskType,
      itemType: taskType, // Use task type as item type for manual tasks
      employee: '', // Manual tasks may not have an employee
      location: location,
      foreman: 'Manual', // Indicate this is a manual task
      currentItem: '',
      pickListItem: '',
      size: '',
      dueDate: dueDate,
      isOverdue: isOverdue,
      daysTillDue: daysTillDue,
      status: status,
      estimatedTime: estimatedTime,
      priority: priority,
      startTime: startTime,
      notes: notes,
      sheetName: 'Manual Tasks',
      rowIndex: i + 1
    };

    // Add to location group
    if (!tasksByLocation[location]) {
      tasksByLocation[location] = [];
    }
    tasksByLocation[location].push(task);
    taskCount++;

    Logger.log('collectManualTasks: Added ' + taskType + ' task at ' + location +
               (dueDate ? ' (scheduled: ' + dueDate.toDateString() + ')' : ' (no date)'));
  }

  Logger.log('collectManualTasks: Added ' + taskCount + ' manual tasks total');
}

/**
 * Creates crew number to location map.
 *
 * @param {Spreadsheet} ss - Active spreadsheet
 * @return {Object} Map of crew number to location
 */
function getCrewLocationMap(ss) {
  var employeesSheet = ss.getSheetByName('Employees');
  if (!employeesSheet || employeesSheet.getLastRow() < 2) {
    return {};
  }

  var data = employeesSheet.getDataRange().getValues();
  var headers = data[0];
  var jobNumCol = -1;
  var locationCol = -1;

  // Find columns
  for (var h = 0; h < headers.length; h++) {
    var header = String(headers[h]).toLowerCase().trim();
    if (header === 'job number') jobNumCol = h;
    if (header === 'location') locationCol = h;
  }

  if (jobNumCol === -1 || locationCol === -1) {
    return {};
  }

  var crewMap = {};
  for (var i = 1; i < data.length; i++) {
    var jobNumber = String(data[i][jobNumCol]).trim();
    var location = String(data[i][locationCol]).trim();

    if (jobNumber && location) {
      // Extract crew number (e.g., "009-26.1" → "009-26")
      var crew = extractCrewNumber(jobNumber);
      if (crew) {
        crewMap[crew] = location;
      }
    }
  }

  return crewMap;
}

// ============================================================================
// TO-DO LIST CREATION FUNCTIONS
// ============================================================================

/**
 * Creates or updates the To-Do List with smart scheduled tasks.
 * - Preserves user-edited scheduled dates
 * - Schedules ONE location per day (no stacking)
 *
 * @param {Spreadsheet} ss - Active spreadsheet
 * @param {Object} tasksByLocation - Tasks grouped by location
 */
function createSmartScheduleToDoList(ss, tasksByLocation) {
  var todoSheet = ss.getSheetByName('To Do List');

  // Read existing scheduled dates BEFORE clearing the sheet
  var existingScheduledDates = {};
  if (todoSheet && todoSheet.getLastRow() > 13) {
    var existingData = todoSheet.getRange(14, 1, todoSheet.getLastRow() - 13, 19).getValues();
    for (var e = 0; e < existingData.length; e++) {
      var row = existingData[e];
      var location = String(row[4]).trim(); // Location column (E)
      var employee = String(row[3]).trim(); // Employee column (D)
      var taskType = String(row[2]).trim(); // Task Type column (C)
      var scheduledDate = row[12]; // Scheduled Date column (M)

      // Create a unique key for this task
      var taskKey = location + '|' + employee + '|' + taskType;
      if (scheduledDate && scheduledDate !== '') {
        existingScheduledDates[taskKey] = scheduledDate;
      }
    }
    Logger.log('Preserved ' + Object.keys(existingScheduledDates).length + ' existing scheduled dates');
  }

  if (!todoSheet) {
    todoSheet = ss.insertSheet('To Do List');
  }

  todoSheet.clear();

  var tasks = [];
  var tasksByDate = {}; // For calendar display
  var today = new Date();
  today.setHours(0, 0, 0, 0);

  // Get drive times
  var driveTimesByLocation = getDriveTimeMap();

  // Track which dates are already scheduled (ONE location per day)
  var scheduledDates = {};

  // Process each location
  var locationNames = Object.keys(tasksByLocation).sort(function(a, b) {
    // Sort by priority: locations with overdue tasks first
    var aHasOverdue = tasksByLocation[a].some(function(t) { return t.isOverdue; });
    var bHasOverdue = tasksByLocation[b].some(function(t) { return t.isOverdue; });

    if (aHasOverdue && !bHasOverdue) return -1;
    if (!aHasOverdue && bHasOverdue) return 1;

    // Then by location name
    return a.localeCompare(b);
  });

  for (var i = 0; i < locationNames.length; i++) {
    var location = locationNames[i];
    var locationTasks = tasksByLocation[location];

    if (locationTasks.length === 0) continue;

    // Calculate total time for this location visit
    var totalTime = 0;
    var hasOverdue = false;
    var earliestDueDate = null;

    for (var j = 0; j < locationTasks.length; j++) {
      var task = locationTasks[j];
      totalTime += task.estimatedTime || 0;
      if (task.isOverdue) hasOverdue = true;
      if (task.dueDate && (!earliestDueDate || task.dueDate < earliestDueDate)) {
        earliestDueDate = task.dueDate;
      }
    }

    // Get drive time for this location
    var driveTime = driveTimesByLocation[location.toLowerCase()] || 0;

    // Calculate suggested scheduled date - ONE location per day
    var suggestedDate = calculateSuggestedScheduleDateOnePerDay(locationTasks, today, scheduledDates, location);

    // Mark this date as used for this location
    var dateKey = formatDateKey(suggestedDate);
    scheduledDates[dateKey] = location;
    Logger.log('Scheduled ' + location + ' on ' + dateKey + ' (scheduledDates now has ' + Object.keys(scheduledDates).length + ' entries)');

    // Detect overnight requirement (10-hour workday)
    var overnightInfo = detectOvernightRequirement({
      location: location,
      driveTime: driveTime,
      visitTime: totalTime
    });
    var overnightRequired = overnightInfo.overnightRequired;

    // Group tasks by foreman within this location
    var foremanGroups = {};
    for (var j = 0; j < locationTasks.length; j++) {
      var task = locationTasks[j];
      var foreman = task.foreman || 'Unknown';
      if (!foremanGroups[foreman]) {
        foremanGroups[foreman] = [];
      }
      foremanGroups[foreman].push(task);
    }

    // Sort foremen alphabetically
    var sortedForemen = Object.keys(foremanGroups).sort();

    // Add tasks grouped by foreman
    for (var fi = 0; fi < sortedForemen.length; fi++) {
      var foreman = sortedForemen[fi];
      var foremanTasks = foremanGroups[foreman];

      // Add each task for this foreman
      for (var j = 0; j < foremanTasks.length; j++) {
        var task = foremanTasks[j];

        // Check if user had previously set a scheduled date for this task
        var taskKey = location + '|' + (task.employee || task.crewLead || task.crew) + '|' + task.type;
        var finalScheduledDate = existingScheduledDates[taskKey] || suggestedDate;

        var daysTillDueDisplay = '';
        if (task.isOverdue) {
          daysTillDueDisplay = 'OVERDUE';
        } else if (task.daysTillDue !== null) {
          daysTillDueDisplay = task.daysTillDue;
        }

        // Include foreman info in the location label for ALL tasks (so frontend can group properly)
        var locationVisitLabel = '📍 ' + location;
        if (foreman && foreman !== 'Unknown') {
          locationVisitLabel = '📍 ' + location + ' (👷 ' + foreman + ')';
        }

        tasks.push([
          locationVisitLabel, // Location Visit with foreman info
        task.priority, // Priority
        task.type, // Task Type (Swap or Training)
        task.employee || task.crewLead || task.crew, // Employee/Crew
        location, // Location
        task.currentItem || '', // Current Item
        task.pickListItem || '', // Pick List Item
        task.itemType || (task.type === 'Training' ? task.topic : ''), // Item Type or Training Topic
        task.size || '', // Size
        task.dueDate || '', // Due Date
        daysTillDueDisplay, // Days Till Due
        task.status, // Status
        finalScheduledDate, // Scheduled Date (preserved if user edited)
        task.estimatedTime, // Estimated Time
        'Helena', // Start Location
        location, // End Location
        driveTime, // Drive Time
        overnightRequired, // Overnight Required
        false // Completed
      ]);

      // Group by scheduled date for calendar display
      if (finalScheduledDate) {
        var dateObj = finalScheduledDate instanceof Date ? finalScheduledDate : new Date(finalScheduledDate);
        if (!isNaN(dateObj.getTime())) {
          var calDateKey = dateObj.getFullYear() + '-' +
                        String(dateObj.getMonth() + 1).padStart(2, '0') + '-' +
                        String(dateObj.getDate()).padStart(2, '0');
          if (!tasksByDate[calDateKey]) {
            tasksByDate[calDateKey] = [];
          }
          tasksByDate[calDateKey].push({
            type: task.type,
            location: location,
            employee: task.employee || task.crewLead || task.crew,
            itemType: task.itemType || task.topic,
            estimatedTime: task.estimatedTime || 15,
            driveTime: driveTime,
            overnightRequired: overnightRequired
          });
        }
      }
      } // End foremanTasks for loop
    } // End sortedForemen for loop
  }

  // Now build calendar with task data
  Logger.log('=== tasksByDate summary ===');
  var dateKeys = Object.keys(tasksByDate).sort();
  for (var dk = 0; dk < dateKeys.length; dk++) {
    var key = dateKeys[dk];
    var locations = [];
    for (var t = 0; t < tasksByDate[key].length; t++) {
      var loc = tasksByDate[key][t].location;
      if (locations.indexOf(loc) === -1) {
        locations.push(loc);
      }
    }
    Logger.log('  ' + key + ': ' + locations.join(', ') + ' (' + tasksByDate[key].length + ' tasks)');
  }
  Logger.log('=== END tasksByDate ===');

  buildToDoListCalendar(todoSheet, tasksByDate);

  // Set up headers (starting at row 13 after calendar)
  var headerRow = 13;
  var headers = [
    'Location Visit',
    'Priority',
    'Task Type',
    'Employee/Crew',
    'Location',
    'Current Item',
    'Pick List Item',
    'Item Type',
    'Size',
    'Due Date',
    'Days Till Due',
    'Status',
    'Scheduled Date',
    'Estimated Time (min)',
    'Start Location',
    'End Location',
    'Drive Time (min)',
    'Overnight Required',
    'Completed'
  ];

  todoSheet.getRange(headerRow, 1, 1, headers.length).setValues([headers]);
  todoSheet.getRange(headerRow, 1, 1, headers.length)
    .setFontWeight('bold')
    .setBackground('#4285f4')
    .setFontColor('white')
    .setHorizontalAlignment('center')
    .setWrap(true);

  // Write tasks to sheet
  if (tasks.length > 0) {
    var dataStartRow = 14;
    todoSheet.getRange(dataStartRow, 1, tasks.length, headers.length).setValues(tasks);

    // Enable text wrapping for all data cells
    todoSheet.getRange(dataStartRow, 1, tasks.length, headers.length).setWrap(true);

    // Format columns - ONLY columns 8+ (don't override calendar columns 1-7)
    // Columns 1-7 are set by buildToDoListCalendar to 200px each
    todoSheet.setColumnWidth(8, 100); // Item Type
    todoSheet.setColumnWidth(9, 60);  // Size
    todoSheet.setColumnWidth(10, 100); // Due Date
    todoSheet.setColumnWidth(11, 100); // Days Till Due
    todoSheet.setColumnWidth(12, 120); // Status
    todoSheet.setColumnWidth(13, 110); // Scheduled Date
    todoSheet.setColumnWidth(14, 100); // Estimated Time
    todoSheet.setColumnWidth(15, 100); // Start Location
    todoSheet.setColumnWidth(16, 100); // End Location
    todoSheet.setColumnWidth(17, 80);  // Drive Time
    todoSheet.setColumnWidth(18, 100); // Overnight Required
    todoSheet.setColumnWidth(19, 80);  // Completed

    // Format dates
    todoSheet.getRange(dataStartRow, 10, tasks.length, 1).setNumberFormat('mm/dd/yyyy'); // Due Date
    todoSheet.getRange(dataStartRow, 13, tasks.length, 1).setNumberFormat('mm/dd/yyyy'); // Scheduled Date

    // Add checkboxes for Completed and Overnight Required
    var completedRule = SpreadsheetApp.newDataValidation().requireCheckbox().build();
    todoSheet.getRange(dataStartRow, 19, tasks.length, 1).setDataValidation(completedRule);

    var overnightRule = SpreadsheetApp.newDataValidation().requireCheckbox().build();
    todoSheet.getRange(dataStartRow, 18, tasks.length, 1).setDataValidation(overnightRule);

    // Color code by location groups with PROMINENT separators
    var currentLocation = '';
    var locationColorIndex = 0;
    // Alternating colors: light blue and light green for easy distinction
    var locationColors = ['#e3f2fd', '#e8f5e9'];

    for (var i = 0; i < tasks.length; i++) {
      var rowNum = dataStartRow + i;
      var taskLocation = tasks[i][4]; // Location column (E)
      var priority = tasks[i][1]; // Priority column
      var daysTillDue = tasks[i][10]; // Days Till Due column

      // Check if this is a new location group
      if (taskLocation !== currentLocation) {
        // Add THICK top border to clearly separate locations
        if (currentLocation !== '') {
          // Add thick dark border ABOVE the new location
          todoSheet.getRange(rowNum, 1, 1, headers.length)
            .setBorder(true, null, null, null, null, null, '#263238', SpreadsheetApp.BorderStyle.SOLID_THICK);
        }

        // Make the FIRST row of each location group stand out
        todoSheet.getRange(rowNum, 1, 1, headers.length)
          .setFontWeight('bold');

        currentLocation = taskLocation;
        locationColorIndex = (locationColorIndex + 1) % 2;
      }

      // Set base background color based on location group
      var baseColor = locationColors[locationColorIndex];

      // Apply background - priority colors override location colors
      if (daysTillDue === 'OVERDUE') {
        // Red background for overdue - but keep location distinction with border
        todoSheet.getRange(rowNum, 1, 1, headers.length).setBackground('#ffcdd2');
      } else if (priority === 'High') {
        // Light orange/yellow for high priority
        todoSheet.getRange(rowNum, 1, 1, headers.length).setBackground('#fff3e0');
      } else {
        // Use alternating location group color (blue/green)
        todoSheet.getRange(rowNum, 1, 1, headers.length).setBackground(baseColor);
      }
    }

    // Add thick bottom border to last row
    if (tasks.length > 0) {
      todoSheet.getRange(dataStartRow + tasks.length - 1, 1, 1, headers.length)
        .setBorder(null, null, true, null, null, null, '#263238', SpreadsheetApp.BorderStyle.SOLID_THICK);
    }

    // Don't freeze rows - allows scrolling with calendar above
    // todoSheet.setFrozenRows(headerRow);

    logEvent('Smart Schedule generated with ' + tasks.length + ' tasks across ' + locationNames.length + ' locations', 'INFO');
  } else {
    todoSheet.getRange(14, 1).setValue('No tasks found. Great job!');
  }
}

/**
 * Calculates suggested schedule date based on task due dates.
 *
 * @param {Array} locationTasks - Tasks for this location
 * @param {Date} today - Today's date
 * @return {Date} Suggested schedule date
 */
function calculateSuggestedScheduleDate(locationTasks, today) {
  var hasOverdue = false;
  var earliestDueDate = null;

  for (var i = 0; i < locationTasks.length; i++) {
    var task = locationTasks[i];
    if (task.isOverdue) {
      hasOverdue = true;
    }
    if (task.dueDate && (!earliestDueDate || task.dueDate < earliestDueDate)) {
      earliestDueDate = task.dueDate;
    }
  }

  // If any task is overdue, schedule ASAP (today or tomorrow)
  if (hasOverdue) {
    var tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow;
  }

  // If there's a due date coming up, schedule a few days before
  if (earliestDueDate) {
    var daysAhead = Math.max(1, Math.ceil((earliestDueDate - today) / (1000 * 60 * 60 * 24)) - 2);
    var scheduleDate = new Date(today);
    scheduleDate.setDate(scheduleDate.getDate() + daysAhead);
    return scheduleDate;
  }

  // Default: schedule within next week
  var nextWeek = new Date(today);
  nextWeek.setDate(nextWeek.getDate() + 7);
  return nextWeek;
}

/**
 * Calculates suggested schedule date ensuring ONE location per day.
 * Skips weekends and already-scheduled dates.
 *
 * @param {Array} locationTasks - Tasks for this location
 * @param {Date} today - Today's date
 * @param {Object} scheduledDates - Map of dateKey -> location already scheduled
 * @param {string} location - Current location being scheduled
 * @return {Date} Suggested schedule date
 */
function calculateSuggestedScheduleDateOnePerDay(locationTasks, today, scheduledDates, location) {
  var hasOverdue = false;
  var earliestDueDate = null;

  for (var i = 0; i < locationTasks.length; i++) {
    var task = locationTasks[i];
    if (task.isOverdue) {
      hasOverdue = true;
    }
    if (task.dueDate && (!earliestDueDate || task.dueDate < earliestDueDate)) {
      earliestDueDate = task.dueDate;
    }
  }

  // ALWAYS start searching from tomorrow - this ensures we find sequential dates
  var searchStart = new Date(today);
  searchStart.setDate(searchStart.getDate() + 1); // Start from tomorrow

  // Find the next available weekday (Mon-Fri) that's not already scheduled
  var maxDaysToCheck = 90; // Look up to 90 days ahead
  for (var d = 0; d < maxDaysToCheck; d++) {
    var checkDate = new Date(searchStart);
    checkDate.setDate(checkDate.getDate() + d);

    var dayOfWeek = checkDate.getDay();

    // Skip weekends (0 = Sunday, 6 = Saturday)
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      continue;
    }

    var dateKey = formatDateKey(checkDate);

    // Check if this date is already scheduled for another location
    if (!scheduledDates[dateKey]) {
      Logger.log('calculateSuggestedScheduleDateOnePerDay: ' + location + ' -> ' + dateKey);
      return checkDate;
    }
  }

  // Fallback: return tomorrow if no open slots found (shouldn't happen)
  Logger.log('calculateSuggestedScheduleDateOnePerDay: ' + location + ' -> FALLBACK to tomorrow');
  return searchStart;
}

/**
 * Formats a date as YYYY-MM-DD string for use as a key.
 * @param {Date} date - Date to format
 * @return {string} Date key in YYYY-MM-DD format
 */
function formatDateKey(date) {
  if (!date || !(date instanceof Date) || isNaN(date.getTime())) {
    return '';
  }
  return date.getFullYear() + '-' +
         String(date.getMonth() + 1).padStart(2, '0') + '-' +
         String(date.getDate()).padStart(2, '0');
}

/**
 * Gets drive time map for common locations.
 *
 * @return {Object} Location (lowercase) to drive time (minutes)
 */
function getDriveTimeMap() {
  return {
    'helena': 0,
    'ennis': 60,
    'butte': 90,
    'big sky': 90,
    'bozeman': 90,
    'livingston': 60, // Livingston, MT
    'missoula': 120,
    'great falls': 90,
    'stanford': 120, // Stanford, MT (2 hrs from Helena)
    'kalispell': 180,
    'billings': 180,
    'miles city': 240,
    'sidney': 300,
    'glendive': 270,
    'northern lights': 420, // Bonner\'s Ferry, ID (~7 hours from Helena)
    'bonner\'s ferry': 420, // Alternative name
    'ca sub': 960, // California (16 hours driving - likely fly)
    'california': 960,
    'south dakota dock': 600, // Eastern South Dakota (~10 hours)
    'south dakota': 600
  };
}

