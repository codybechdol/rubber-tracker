/**
 * Glove Manager – Smart Scheduling System
 *
 * Automatically schedules crew visits based on tasks from Glove Swaps, Sleeve Swaps,
 * and Training. Groups tasks by location and prioritizes by due date to optimize trips.
 */

/* global logEvent, extractCrewNumber, buildToDoListCalendar, detectOvernightRequirement */
/* eslint-disable no-redeclare, no-unused-vars */

// ============================================================================
// CREW LOCATION MAPPING
// ============================================================================

/**
 * Builds a map of crew number → location by finding each crew's foreman (or first employee)
 * and returning their location from the Employees sheet.
 *
 * @param {Spreadsheet} ss - The spreadsheet object
 * @return {Object} Map of crew number to location (e.g., {'041-26': 'Gold Creek', '039-26': 'Rapelje'})
 */
function getCrewLocationMap(ss) {
  if (!ss) {
    ss = SpreadsheetApp.getActiveSpreadsheet();
  }

  var employeesSheet = ss.getSheetByName('Employees');
  if (!employeesSheet || employeesSheet.getLastRow() < 2) {
    Logger.log('getCrewLocationMap: No Employees sheet found');
    return {};
  }

  var data = employeesSheet.getDataRange().getValues();
  var headers = data[0];

  // Find columns
  var nameCol = -1, jobNumCol = -1, locationCol = -1, lastDayCol = -1, classificationCol = -1;
  for (var h = 0; h < headers.length; h++) {
    var header = String(headers[h]).toLowerCase().trim();
    if (header === 'name') nameCol = h;
    if (header === 'job number') jobNumCol = h;
    if (header === 'location') locationCol = h;
    if (header === 'last day') lastDayCol = h;
    if (header === 'job classification') classificationCol = h;
  }

  if (jobNumCol === -1 || locationCol === -1) {
    Logger.log('getCrewLocationMap: Missing required columns (Job Number or Location)');
    return {};
  }

  // Classification hierarchy for finding crew lead
  var classificationPriority = {
    'F': 1, 'GTO F': 2, 'GF': 3, 'SUP': 4, 'JRY': 5, 'JRY OP': 6,
    'WT': 7, 'GTO': 8, 'EO 1': 9, 'EO 2': 10,
    'AP 7': 11, 'AP 6': 12, 'AP 5': 13, 'AP 4': 14, 'AP 3': 15, 'AP 2': 16, 'AP 1': 17
  };

  // First pass: collect all employees grouped by crew
  var crewEmployees = {}; // crew number → [{name, location, classification, position}]

  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var jobNum = String(row[jobNumCol] || '').trim();
    var location = String(row[locationCol] || '').trim();
    var lastDay = lastDayCol !== -1 ? row[lastDayCol] : '';
    var classification = classificationCol !== -1 ? String(row[classificationCol] || '').trim() : '';
    var name = nameCol !== -1 ? String(row[nameCol] || '').trim() : '';

    // Skip if no job number, inactive employee, or excluded prefix
    if (!jobNum || lastDay) continue;

    // Extract crew number and position (e.g., "041-26.1" → "041-26", 1)
    var parts = jobNum.split('.');
    var crewNum = parts[0];
    var position = parts.length > 1 ? parseFloat(parts[1]) : 999;

    // Validate crew number format (NNN-YY)
    if (!/^\d{3}-\d{2}$/.test(crewNum)) continue;

    // Skip placeholder crews
    if (crewNum.indexOf('000-') === 0) continue;

    if (!crewEmployees[crewNum]) {
      crewEmployees[crewNum] = [];
    }

    crewEmployees[crewNum].push({
      name: name,
      location: location,
      classification: classification,
      position: position,
      priority: classificationPriority[classification] || 999
    });
  }

  // Second pass: for each crew, find the best employee (foreman or first by position)
  var crewLocations = {};

  for (var crew in crewEmployees) {
    var employees = crewEmployees[crew];

    // Sort by classification priority first, then by position number
    employees.sort(function(a, b) {
      if (a.priority !== b.priority) {
        return a.priority - b.priority; // Lower priority number = higher rank
      }
      return a.position - b.position; // Lower position = earlier
    });

    // Use the first (best) employee's location
    if (employees.length > 0 && employees[0].location) {
      crewLocations[crew] = employees[0].location;
    }
  }

  Logger.log('getCrewLocationMap: Built map with ' + Object.keys(crewLocations).length + ' crews');
  return crewLocations;
}

// ============================================================================
// PHONE NUMBER FORMATTING
// ============================================================================

/**
 * Formats all phone numbers in the Employees sheet to a consistent format.
 * Converts various formats to (XXX) XXX-XXXX format.
 * Menu item: Glove Manager → Utilities → Format Phone Numbers
 */
function formatEmployeePhoneNumbers() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var employeesSheet = ss.getSheetByName('Employees');

  if (!employeesSheet || employeesSheet.getLastRow() < 2) {
    SpreadsheetApp.getUi().alert('No Employees sheet found or sheet is empty.');
    return;
  }

  var data = employeesSheet.getDataRange().getValues();
  var headers = data[0];
  var phoneCol = -1;

  // Find Phone Number column
  for (var h = 0; h < headers.length; h++) {
    var header = String(headers[h]).toLowerCase().trim();
    if (header === 'phone number' || header === 'phone') {
      phoneCol = h;
      break;
    }
  }

  if (phoneCol === -1) {
    SpreadsheetApp.getUi().alert('Could not find Phone Number column in Employees sheet.');
    return;
  }

  var updatedCount = 0;
  var updates = [];

  for (var i = 1; i < data.length; i++) {
    var phone = String(data[i][phoneCol] || '').trim();

    if (phone && phone !== 'N/A' && phone !== '') {
      // Extract only digits
      var digits = '';
      for (var c = 0; c < phone.length; c++) {
        var char = phone.charAt(c);
        if (char >= '0' && char <= '9') {
          digits += char;
        }
      }

      // Format as (XXX) XXX-XXXX if we have 10 or 11 digits
      var formatted = '';
      if (digits.length === 11 && digits.charAt(0) === '1') {
        // Remove leading 1 for US numbers
        digits = digits.substring(1);
      }

      if (digits.length === 10) {
        formatted = '(' + digits.substring(0, 3) + ') ' + digits.substring(3, 6) + '-' + digits.substring(6);
      } else if (digits.length > 0) {
        // Keep as-is if not 10 digits (might be international)
        formatted = digits;
      }

      if (formatted && formatted !== phone) {
        updates.push({
          row: i + 1,
          col: phoneCol + 1,
          oldValue: phone,
          newValue: formatted
        });
      }
    }
  }

  // Apply updates
  for (var u = 0; u < updates.length; u++) {
    employeesSheet.getRange(updates[u].row, updates[u].col).setValue(updates[u].newValue);
    updatedCount++;
  }

  SpreadsheetApp.getUi().alert('✅ Phone Number Formatting Complete!\n\n' +
    updatedCount + ' phone number(s) formatted to (XXX) XXX-XXXX format.');

  Logger.log('formatEmployeePhoneNumbers: Updated ' + updatedCount + ' phone numbers');
}

// ============================================================================
// DRIVE TIME MAP
// ============================================================================

/**
 * Returns a map of drive times from Helena to various locations.
 * Drive times are in minutes. Used by Trip Planner and Time Tracking.
 *
 * UPDATED Feb 23, 2026: Now reads from "Locations" sheet instead of hardcoded values.
 * UPDATED Feb 23, 2026: Now reads from "Locations" sheet instead of hardcoded values.
 * To add/modify locations, edit the Locations sheet (Menu: Setup & Admin → View Locations)
 *
 * @return {Object} Map of location (lowercase) to drive time in minutes
 */
function getDriveTimeMap() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Locations');

  // If Locations sheet doesn't exist, create it with defaults
  if (!sheet) {
    Logger.log('getDriveTimeMap: Locations sheet not found - creating it');
    setupLocationsSheet();
    sheet = ss.getSheetByName('Locations');
  }

  // If still no sheet (shouldn't happen), return empty map
  if (!sheet || sheet.getLastRow() < 2) {
    Logger.log('getDriveTimeMap: Could not read Locations sheet - returning empty map');
    return {};
  }

  // Read all location data
  var data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 2).getValues();
  var driveTimeMap = {};

  for (var i = 0; i < data.length; i++) {
    var locationName = String(data[i][0] || '').toLowerCase().trim();
    var driveTime = Number(data[i][1]) || 0;

    if (locationName) {
      driveTimeMap[locationName] = driveTime;
    }
  }

  Logger.log('getDriveTimeMap: Loaded ' + Object.keys(driveTimeMap).length + ' locations from Locations sheet');
  return driveTimeMap;
}

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

  // Get phone number lookup from Employees sheet
  var employeePhones = getEmployeePhoneMapInternal(ss);
  Logger.log('collectAndGroupTasks: Found ' + Object.keys(employeePhones).length + ' employee phones');

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
  collectExpiringCertTasks(ss, tasksByLocation, employeeLocations, employeeForemen, employeePhones, today);
  var afterCerts = countTasks(tasksByLocation);
  Logger.log('collectAndGroupTasks: Expiring Certs added ' + (afterCerts - beforeCerts) + ' tasks');

  // Collect cert tasks that user explicitly added to Task List (InTaskList=TRUE in Task Metadata)
  // This captures Crane Certs and other certs that were manually added from the Expiring Certs tab
  var beforeInTaskListCerts = countTasks(tasksByLocation);
  collectInTaskListCerts(ss, tasksByLocation, employeeLocations, employeeForemen, employeePhones);
  var afterInTaskListCerts = countTasks(tasksByLocation);
  Logger.log('collectAndGroupTasks: InTaskList Certs added ' + (afterInTaskListCerts - beforeInTaskListCerts) + ' tasks');

  // Collect from Manual Tasks
  var beforeManual = countTasks(tasksByLocation);
  collectManualTasks(ss, tasksByLocation, today);
  var afterManual = countTasks(tasksByLocation);
  Logger.log('collectAndGroupTasks: Manual Tasks added ' + (afterManual - beforeManual) + ' tasks');

  // Collect from Safety Reports (Needs Attention items only)
  var beforeSafety = countTasks(tasksByLocation);
  collectSafetyReportsTasks(ss, tasksByLocation, employeeLocations, today);
  var afterSafety = countTasks(tasksByLocation);
  Logger.log('collectAndGroupTasks: Safety Reports added ' + (afterSafety - beforeSafety) + ' tasks');

  // Collect Missing Safety Report tasks from Task Metadata (JHA/Weekly Meeting compliance)
  var beforeMissingSafety = countTasks(tasksByLocation);
  collectMissingSafetyReportTasks(ss, tasksByLocation, employeeLocations, employeeForemen, employeePhones, today);
  var afterMissingSafety = countTasks(tasksByLocation);
  Logger.log('collectAndGroupTasks: Missing Safety Reports added ' + (afterMissingSafety - beforeMissingSafety) + ' tasks');

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
 * Creates employee name to phone number map from Employees sheet.
 * This is the canonical implementation - called by getEmployeePhoneMap() wrapper in Code.gs.
 *
 * @param {Spreadsheet} ss - Active spreadsheet
 * @return {Object} Map of employee name (lowercase) to phone number (digits only)
 */
function getEmployeePhoneMapInternal(ss) {
  var employeesSheet = ss.getSheetByName('Employees');
  if (!employeesSheet || employeesSheet.getLastRow() < 2) {
    return {};
  }

  var data = employeesSheet.getDataRange().getValues();
  var headers = data[0];
  var nameCol = -1;
  var phoneCol = -1;

  // Find columns
  for (var h = 0; h < headers.length; h++) {
    var header = String(headers[h]).toLowerCase().trim();
    if (header === 'name') nameCol = h;
    if (header === 'phone number' || header === 'phone') phoneCol = h;
  }

  if (nameCol === -1 || phoneCol === -1) {
    Logger.log('getEmployeePhoneMap: Could not find name or phone column');
    return {};
  }

  var phoneMap = {};
  var whitespaceRegex = new RegExp('\\s+', 'g');
  for (var i = 1; i < data.length; i++) {
    var name = String(data[i][nameCol]).trim().replace(whitespaceRegex, ' '); // Normalize whitespace
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
      }
    }
  }

  Logger.log('getEmployeePhoneMap: Found ' + Object.keys(phoneMap).length + ' employee phone numbers');
  return phoneMap;
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

    // Special handling for "Weeds" location - employees at home with no work
    // Group all Weeds employees under "Weeds" as the foreman/group name
    if (empLocation && empLocation.toLowerCase() === 'weeds') {
      foremanMap[nameLower] = 'Weeds';
      return;
    }

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
      // Match "change out date" - USE FIRST OCCURRENCE ONLY (visible column, not hidden)
      if (header.indexOf('change out date') !== -1 && changeOutCol === -1) {
        changeOutCol = h;
        Logger.log('collectSwapTasks: Found Change Out Date column at index ' + h + ', header="' + headers[h] + '"');
      }
      if (header === 'days left') daysLeftCol = h;
      if (header.indexOf('pick list') !== -1 && header.indexOf('#') !== -1) pickListCol = h;
      if (header === 'status') statusCol = h;
      if (header === 'picked') pickedCol = h;
      if (header === 'date changed') dateChangedCol = h;
    }

    Logger.log('collectSwapTasks: Section ' + section + ' column mapping - changeOutCol=' + changeOutCol + ', pickedCol=' + pickedCol + ', dateChangedCol=' + dateChangedCol);

    if (employeeCol === -1) {
      Logger.log('collectSwapTasks: Could not find Employee column in section ' + section);
      continue;
    }

    Logger.log('collectSwapTasks: Section ' + section + ' - Processing rows ' + (headerRowIndex + 2) + ' to ' + nextHeaderIndex + ', pickedCol=' + pickedCol + ', dateChangedCol=' + dateChangedCol + ', changeOutCol=' + changeOutCol);

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

      // DETAILED DEBUG LOGGING for employees we care about
      var isDebugEmployee = (employee.toLowerCase().indexOf('cody lund') !== -1 ||
                            employee.toLowerCase().indexOf('benjamin lapka') !== -1);

      if (isDebugEmployee) {
        Logger.log('=== DEBUG: Employee ' + employee + ' ===');
        Logger.log('  Row: ' + (i+1));
        Logger.log('  changeOutCol index: ' + changeOutCol);
        Logger.log('  changeOutDate raw value: ' + changeOutDate);
        Logger.log('  changeOutDate type: ' + typeof changeOutDate);
        Logger.log('  changeOutDate instanceof Date: ' + (changeOutDate instanceof Date));
        if (changeOutDate instanceof Date) {
          Logger.log('  changeOutDate as Date: ' + changeOutDate.toString());
        }
        Logger.log('  currentItem: ' + currentItem);
        Logger.log('  pickListItem: ' + pickListItem);
        Logger.log('  isPicked: ' + isPicked);
        Logger.log('  dateChanged: ' + dateChanged);
      }

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

          if (isDebugEmployee) {
            Logger.log('  PARSED dueDate: ' + dueDate.toString());
            Logger.log('  daysTillDue: ' + daysTillDue);
            Logger.log('  isOverdue: ' + isOverdue);
          }
        } else if (typeof changeOutDate === 'string' && changeOutDate.trim() !== '') {
          // Try to parse string date
          dueDate = new Date(changeOutDate);
          if (!isNaN(dueDate.getTime())) {
            dueDate.setHours(0, 0, 0, 0);
            daysTillDue = Math.ceil((dueDate - today) / (1000 * 60 * 60 * 24));
            isOverdue = daysTillDue < 0;

            if (isDebugEmployee) {
              Logger.log('  PARSED dueDate from string: ' + dueDate.toString());
              Logger.log('  daysTillDue: ' + daysTillDue);
            }
          } else {
            if (isDebugEmployee) {
              Logger.log('  FAILED to parse date from string');
            }
            dueDate = null;
          }
        } else {
          if (isDebugEmployee) {
            Logger.log('  changeOutDate was not Date or valid string');
          }
        }
      } else {
        if (isDebugEmployee) {
          Logger.log('  changeOutDate was empty/null');
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

      if (isDebugEmployee) {
        Logger.log('  CREATED TASK with dueDate: ' + (task.dueDate ? task.dueDate.toString() : 'NULL'));
        Logger.log('  Task object: ' + JSON.stringify({
          employee: task.employee,
          dueDate: task.dueDate ? task.dueDate.toString() : null,
          location: task.location,
          currentItem: task.currentItem,
          sheetName: task.sheetName,
          rowIndex: task.rowIndex
        }));
      }

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
  var statusCol = 8;     // I: Status (was incorrectly 9 for column J)

  // Month name to number mapping
  var monthNumbers = {
    'january': 0, 'february': 1, 'march': 2, 'april': 3,
    'may': 4, 'june': 5, 'july': 6, 'august': 7,
    'september': 8, 'october': 9, 'november': 10, 'december': 11
  };

  // Get crew locations
  var crewLocations = getCrewLocationMap(ss);

  // Get excluded job prefixes from config (defaults to ['002', '005'])
  var excludedJobPrefixes = getExcludedJobPrefixesInternal();
  Logger.log('collectTrainingTasks: Excluded job prefixes: ' + excludedJobPrefixes.join(', '));

  // Build maps from Employees sheet:
  // 1. crewFirstEmployee: crew number → first employee name (for fallback assignment)
  // 2. employeeJobNumber: employee name → job number (for exclusion lookup)
  var crewFirstEmployee = {};
  var employeeJobNumber = {};
  var employeesSheet = ss.getSheetByName('Employees');
  if (employeesSheet && employeesSheet.getLastRow() > 1) {
    var empData = employeesSheet.getDataRange().getValues();
    var empHeaders = empData[0];
    var empNameCol = -1;
    var empJobNumCol = -1;

    for (var eh = 0; eh < empHeaders.length; eh++) {
      var hdr = String(empHeaders[eh]).toLowerCase().trim();
      if (hdr === 'name') empNameCol = eh;
      if (hdr === 'job number') empJobNumCol = eh;
    }

    if (empNameCol !== -1 && empJobNumCol !== -1) {
      for (var ei = 1; ei < empData.length; ei++) {
        var empName = (empData[ei][empNameCol] || '').toString().trim();
        var jobNum = (empData[ei][empJobNumCol] || '').toString().trim();

        if (!empName) continue;

        // Store employee name → job number mapping (for exclusion lookup)
        employeeJobNumber[empName] = jobNum;

        // Check if this employee has excluded job prefix
        var hasExcludedPrefix = false;
        for (var p = 0; p < excludedJobPrefixes.length; p++) {
          if (jobNum.indexOf(excludedJobPrefixes[p] + '-') === 0) {
            hasExcludedPrefix = true;
            break;
          }
        }

        // Only add to crewFirstEmployee if NOT excluded
        if (!hasExcludedPrefix) {
          // Extract base crew number (e.g., "039-26" from "039-26.1")
          var crewNum = jobNum.split('.')[0];

          // Only store the first employee found for each crew
          if (crewNum && !crewFirstEmployee[crewNum]) {
            crewFirstEmployee[crewNum] = empName;
          }
        }
      }
    }
    Logger.log('collectTrainingTasks: Built crew-to-first-employee map with ' + Object.keys(crewFirstEmployee).length + ' crews');
    Logger.log('collectTrainingTasks: Built employee-to-job-number map with ' + Object.keys(employeeJobNumber).length + ' employees');
  }

  var currentYear = today.getFullYear();
  var currentMonth = today.getMonth();
  var taskCount = 0;
  var skippedCrews = 0;
  var skippedComplete = 0;
  var skippedFutureMonth = 0;
  var skippedNoAssignee = 0;

  Logger.log('collectTrainingTasks: DEBUG - currentMonth=' + currentMonth + ' (' + ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][currentMonth] + '), currentYear=' + currentYear);
  Logger.log('collectTrainingTasks: DEBUG - selectedCrews=' + (selectedCrews ? JSON.stringify(selectedCrews) : 'null (all crews)'));
  Logger.log('collectTrainingTasks: DEBUG - crewLocations keys=' + Object.keys(crewLocations).join(', '));

  for (var i = 2; i < data.length; i++) {
    var row = data[i];
    var month = String(row[monthCol]).trim();
    var topic = String(row[topicCol]).trim();
    var crew = String(row[crewCol]).trim();
    var crewLead = String(row[leadCol]).trim();
    var status = String(row[statusCol]).trim();
    var completionDate = row[dateCol];

    // DEBUG: Log Keenan's training to understand location assignment
    var isKeenan = crewLead.toLowerCase().indexOf('keenan') !== -1;
    if (isKeenan) {
      Logger.log('collectTrainingTasks: KEENAN DEBUG row=' + (i+1) +
                 ' crew=' + crew +
                 ' crewLead=' + crewLead +
                 ' crewLocations[' + crew + ']=' + (crewLocations[crew] || 'NOT FOUND') +
                 ' month=' + month + ' topic=' + topic);
    }

    // Skip if complete, N/A, or already has completion date
    if (status === 'Complete' || status === 'N/A') {
      if (month.toLowerCase() === 'february') {
        Logger.log('collectTrainingTasks: DEBUG - Skipping Feb row ' + (i+1) + ' crew=' + crew + ' status=' + status + ' (complete/N/A)');
        skippedComplete++;
      }
      continue;
    }
    if (completionDate && completionDate instanceof Date) {
      if (month.toLowerCase() === 'february') {
        Logger.log('collectTrainingTasks: DEBUG - Skipping Feb row ' + (i+1) + ' crew=' + crew + ' (has completion date)');
        skippedComplete++;
      }
      continue;
    }

    // Skip if this crew is NOT in the selected crews list (if a list is configured)
    // NOTE: null OR empty array means "all crews" - only filter if array has items
    if (selectedCrews !== null && selectedCrews.length > 0 && selectedCrews.indexOf(crew) === -1) {
      skippedCrews++;
      if (month.toLowerCase() === 'february') {
        Logger.log('collectTrainingTasks: DEBUG - Skipping Feb row ' + (i+1) + ' crew=' + crew + ' - not in selected crews');
      }
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

    // Determine who to assign the training to:
    // 1. If crewLead is specified, use them
    // 2. If no crewLead, use the first employee of the crew (from Employees sheet)
    // 3. As last resort, skip this crew (no one to assign to)
    var assignee = crewLead;
    if (!assignee) {
      // Try to find first employee for this crew
      assignee = crewFirstEmployee[crew];
      if (assignee) {
        Logger.log('collectTrainingTasks: No foreman for crew ' + crew + ', assigning to first employee: ' + assignee);
      }
    }

    // Skip if we still don't have anyone to assign to
    if (!assignee) {
      Logger.log('collectTrainingTasks: Skipping crew ' + crew + ' - no foreman and no employees found');
      skippedNoAssignee++;
      if (month.toLowerCase() === 'february') {
        Logger.log('collectTrainingTasks: DEBUG - Skipping Feb row ' + (i+1) + ' crew=' + crew + ' - no assignee');
      }
      continue;
    }

    // Check if assignee has an excluded job prefix (Light Duty, etc.)
    // This handles cases where a named crew lead is now on Light Duty
    var assigneeJobNum = employeeJobNumber[assignee] || '';
    if (assigneeJobNum) {
      var isAssigneeExcluded = false;
      for (var ep = 0; ep < excludedJobPrefixes.length; ep++) {
        if (assigneeJobNum.indexOf(excludedJobPrefixes[ep] + '-') === 0) {
          isAssigneeExcluded = true;
          break;
        }
      }
      if (isAssigneeExcluded) {
        Logger.log('collectTrainingTasks: Skipping training for ' + assignee + ' (job: ' + assigneeJobNum + ') - excluded job prefix');
        skippedNoAssignee++;
        continue;
      }
    }

    var task = {
      type: 'Training',
      itemType: 'Monthly Training: ' + topic, // Add "Monthly Training:" prefix for clarity
      topic: topic,
      employee: assignee, // Use determined assignee
      crew: crew,
      crewLead: crewLead || assignee, // Use assignee if no official crew lead
      foreman: assignee, // Use assignee as foreman for grouping
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

    // Only include training for current month or next month (not further in future)
    // For January, monthNum = 0, currentMonth = 0, so we include January and February (1)
    if (monthNum !== undefined && monthNum > currentMonth + 1) {
      // Skip training beyond next month
      skippedFutureMonth++;
      if (month.toLowerCase() === 'february') {
        Logger.log('collectTrainingTasks: DEBUG - UNEXPECTED! Feb row ' + (i+1) + ' skipped as future month! monthNum=' + monthNum + ' currentMonth=' + currentMonth);
      }
      continue;
    }

    // DEBUG: Log every February task that passes all filters
    if (month.toLowerCase() === 'february') {
      Logger.log('collectTrainingTasks: DEBUG - ADDING Feb task! row=' + (i+1) + ' crew=' + crew + ' assignee=' + assignee + ' location=' + location);
    }

    // Add to location group
    if (!tasksByLocation[location]) {
      tasksByLocation[location] = [];
    }
    tasksByLocation[location].push(task);
    taskCount++;
  }

  Logger.log('collectTrainingTasks: Added ' + taskCount + ' training tasks');
  Logger.log('collectTrainingTasks: Skipped: ' + skippedComplete + ' complete/N/A, ' + skippedCrews + ' not in selected crews, ' + skippedNoAssignee + ' no assignee, ' + skippedFutureMonth + ' future month');
}

/**
 * Debug function to trace Keenan's training task location assignment
 * Run from Script Editor to see detailed logging
 */
function debugKeenanTrainingLocation() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var ui = SpreadsheetApp.getUi();
  var message = '=== KEENAN TRAINING LOCATION DEBUG ===\n\n';

  // Step 1: Check Employees sheet for crew 041-26
  message += '1️⃣ EMPLOYEES SHEET - Crew 041-26:\n';
  var employeesSheet = ss.getSheetByName('Employees');
  if (employeesSheet) {
    var empData = employeesSheet.getDataRange().getValues();
    var empHeaders = empData[0];
    var nameCol = -1, locCol = -1, jobCol = -1;

    for (var h = 0; h < empHeaders.length; h++) {
      var hdr = String(empHeaders[h]).toLowerCase().trim();
      if (hdr === 'name') nameCol = h;
      if (hdr === 'location') locCol = h;
      if (hdr === 'job number') jobCol = h;
    }

    var crew041Members = [];
    for (var i = 1; i < empData.length; i++) {
      var jobNum = String(empData[i][jobCol] || '').trim();
      if (jobNum.indexOf('041-26') === 0) {
        crew041Members.push({
          name: empData[i][nameCol],
          location: empData[i][locCol],
          jobNumber: jobNum,
          row: i + 1
        });
      }
    }

    if (crew041Members.length === 0) {
      message += '  ❌ NO employees found with job number starting with 041-26!\n';
    } else {
      message += '  Found ' + crew041Members.length + ' employee(s):\n';
      crew041Members.forEach(function(emp) {
        message += '  Row ' + emp.row + ': ' + emp.name + ' @ ' + emp.location + ' (job: ' + emp.jobNumber + ')\n';
      });
    }
  }
  message += '\n';

  // Step 2: Check what getCrewLocationMap returns for 041-26
  message += '2️⃣ CREW LOCATION MAP:\n';
  var crewLocations = getCrewLocationMap(ss);
  message += '  041-26 → ' + (crewLocations['041-26'] || '❌ NOT FOUND') + '\n';
  message += '  039-26 → ' + (crewLocations['039-26'] || '❌ NOT FOUND') + '\n';
  message += '\n';

  // Step 3: Check Training Tracking for Keenan's rows
  message += '3️⃣ TRAINING TRACKING - Keenan\'s rows:\n';
  var trainingSheet = ss.getSheetByName('Training Tracking');
  if (trainingSheet) {
    var trainData = trainingSheet.getDataRange().getValues();
    var keenanRows = [];

    for (var t = 2; t < trainData.length; t++) {
      var crewLead = String(trainData[t][3] || '').trim();  // Column D = Crew Lead
      var crewNum = String(trainData[t][2] || '').trim();   // Column C = Crew #
      var topic = String(trainData[t][1] || '').trim();     // Column B = Topic
      var month = String(trainData[t][0] || '').trim();     // Column A = Month
      var status = String(trainData[t][8] || '').trim();    // Column I = Status

      if (crewLead.toLowerCase().indexOf('keenan') !== -1) {
        keenanRows.push({
          row: t + 1,
          month: month,
          crew: crewNum,
          topic: topic,
          status: status,
          mappedLocation: crewLocations[crewNum] || 'NOT FOUND'
        });
      }
    }

    if (keenanRows.length === 0) {
      message += '  ❌ No rows found with Keenan as Crew Lead!\n';
    } else {
      message += '  Found ' + keenanRows.length + ' training(s) for Keenan:\n';
      keenanRows.forEach(function(row) {
        message += '  Row ' + row.row + ': ' + row.month + ' - ' + row.topic + '\n';
        message += '    Crew: ' + row.crew + ' → Location: ' + row.mappedLocation + '\n';
        message += '    Status: ' + row.status + '\n';
      });
    }
  }
  message += '\n';

  // Step 4: Check Task Metadata for Keenan's tasks
  message += '4️⃣ TASK METADATA - Keenan\'s training tasks:\n';
  var metadataSheet = ss.getSheetByName('Task Metadata');
  if (metadataSheet && metadataSheet.getLastRow() > 1) {
    var metaData = metadataSheet.getDataRange().getValues();
    var metaHeaders = metaData[0];
    var empCol = -1, locCol = -1, typeCol = -1, itemCol = -1, srcCol = -1, srcRowCol = -1;

    for (var mh = 0; mh < metaHeaders.length; mh++) {
      var header = String(metaHeaders[mh]).toLowerCase().trim();
      if (header === 'employee') empCol = mh;
      if (header === 'location') locCol = mh;
      if (header === 'tasktype') typeCol = mh;
      if (header === 'itemtype') itemCol = mh;
      if (header === 'sourcesheet') srcCol = mh;
      if (header === 'sourcerow') srcRowCol = mh;
    }

    var keenanMeta = [];
    for (var m = 1; m < metaData.length; m++) {
      var emp = String(metaData[m][empCol] || '').trim();
      if (emp.toLowerCase().indexOf('keenan') !== -1) {
        keenanMeta.push({
          row: m + 1,
          employee: emp,
          location: metaData[m][locCol],
          taskType: metaData[m][typeCol],
          itemType: metaData[m][itemCol],
          sourceSheet: metaData[m][srcCol],
          sourceRow: metaData[m][srcRowCol] || '?'
        });
      }
    }

    if (keenanMeta.length === 0) {
      message += '  No Keenan tasks in Task Metadata\n';
    } else {
      message += '  Found ' + keenanMeta.length + ' task(s):\n';
      keenanMeta.forEach(function(task) {
        message += '  Row ' + task.row + ': ' + task.taskType + ' - ' + task.itemType + '\n';
        message += '    Location: ' + task.location + ' (source: ' + task.sourceSheet + ' row ' + task.sourceRow + ')\n';
      });
    }
  }
  message += '\n';

  // Step 5: Cross-reference Training Tracking source rows
  message += '5️⃣ CROSS-REFERENCE - What\'s at Training Tracking row 31?\n';
  if (trainingSheet) {
    var trainData = trainingSheet.getDataRange().getValues();
    // Check row 31 specifically (Feb Job Briefings)
    if (trainData.length >= 31) {
      var row31 = trainData[30]; // 0-indexed
      message += '  Row 31: Month=' + row31[0] + ', Topic=' + row31[1] + '\n';
      message += '          Crew=' + row31[2] + ', Lead=' + row31[3] + '\n';
      var row31Location = crewLocations[String(row31[2]).trim()] || 'NOT FOUND';
      message += '          Mapped Location: ' + row31Location + '\n';
    }
  }

  Logger.log(message);
  ui.alert('Keenan Training Debug', message, ui.ButtonSet.OK);
}


/**
 * Fixes training task locations in Task Metadata by looking up the crew from
 * the source Training Tracking row and mapping to current crew location.
 * This corrects stale location data when employees move between crews.
 *
 * Run from Script Editor or menu to fix location mismatches.
 */
function fixTrainingTaskLocations() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var ui = SpreadsheetApp.getUi();

  // Get current crew location map
  var crewLocations = getCrewLocationMap(ss);
  Logger.log('fixTrainingTaskLocations: Loaded ' + Object.keys(crewLocations).length + ' crew locations');

  // Get Training Tracking data
  var trainingSheet = ss.getSheetByName('Training Tracking');
  if (!trainingSheet) {
    ui.alert('Error', 'Training Tracking sheet not found.', ui.ButtonSet.OK);
    return;
  }
  var trainData = trainingSheet.getDataRange().getValues();
  Logger.log('fixTrainingTaskLocations: Training Tracking has ' + trainData.length + ' rows');

  // Get Task Metadata
  var metadataSheet = ss.getSheetByName('Task Metadata');
  if (!metadataSheet || metadataSheet.getLastRow() < 2) {
    ui.alert('Error', 'Task Metadata sheet not found or empty.', ui.ButtonSet.OK);
    return;
  }
  var metaData = metadataSheet.getDataRange().getValues();
  var metaHeaders = metaData[0];

  // Find column indices
  var srcSheetCol = -1, srcRowCol = -1, locationCol = -1, taskTypeCol = -1;
  for (var h = 0; h < metaHeaders.length; h++) {
    var header = String(metaHeaders[h]).toLowerCase().trim();
    if (header === 'sourcesheet') srcSheetCol = h;
    if (header === 'sourcerow') srcRowCol = h;
    if (header === 'location') locationCol = h;
    if (header === 'tasktype') taskTypeCol = h;
  }

  if (srcSheetCol === -1 || srcRowCol === -1 || locationCol === -1) {
    ui.alert('Error', 'Required columns not found in Task Metadata.', ui.ButtonSet.OK);
    return;
  }

  var updatedCount = 0;
  var updates = [];

  // Loop through Task Metadata and fix training task locations
  for (var m = 1; m < metaData.length; m++) {
    var sourceSheet = String(metaData[m][srcSheetCol] || '').trim();
    var sourceRow = metaData[m][srcRowCol];
    var currentLocation = String(metaData[m][locationCol] || '').trim();
    var taskType = String(metaData[m][taskTypeCol] || '').trim().toLowerCase();

    // Only process Training tasks from Training Tracking
    if (taskType !== 'training' || sourceSheet !== 'Training Tracking') {
      continue;
    }

    // Look up the crew from Training Tracking source row
    var trainRowIndex = parseInt(sourceRow, 10);
    if (isNaN(trainRowIndex) || trainRowIndex < 3 || trainRowIndex > trainData.length) {
      Logger.log('fixTrainingTaskLocations: Skipping row ' + (m+1) + ' - invalid source row: ' + sourceRow);
      continue;
    }

    var trainRow = trainData[trainRowIndex - 1]; // Convert to 0-indexed
    var crew = String(trainRow[2] || '').trim(); // Column C = Crew #

    // Get correct location from crew location map
    var correctLocation = crewLocations[crew] || 'Unknown';

    // Check if location needs updating
    if (correctLocation !== currentLocation && correctLocation !== 'Unknown') {
      Logger.log('fixTrainingTaskLocations: Row ' + (m+1) + ' crew ' + crew + ': ' + currentLocation + ' → ' + correctLocation);
      updates.push({
        row: m + 1, // 1-indexed for sheet
        col: locationCol + 1, // 1-indexed for sheet
        oldValue: currentLocation,
        newValue: correctLocation,
        crew: crew
      });
    }
  }

  // Apply updates
  if (updates.length === 0) {
    ui.alert('No Updates Needed', 'All training task locations are already correct.', ui.ButtonSet.OK);
    return;
  }

  var confirmMsg = 'Found ' + updates.length + ' training task(s) with incorrect locations.\n\n';
  for (var i = 0; i < Math.min(updates.length, 10); i++) {
    confirmMsg += '• Crew ' + updates[i].crew + ': ' + updates[i].oldValue + ' → ' + updates[i].newValue + '\n';
  }
  if (updates.length > 10) {
    confirmMsg += '... and ' + (updates.length - 10) + ' more\n';
  }
  confirmMsg += '\nUpdate these locations?';

  var response = ui.alert('Confirm Location Updates', confirmMsg, ui.ButtonSet.YES_NO);
  if (response !== ui.Button.YES) {
    return;
  }

  // Apply updates to sheet
  for (var u = 0; u < updates.length; u++) {
    metadataSheet.getRange(updates[u].row, updates[u].col).setValue(updates[u].newValue);
    updatedCount++;
  }

  ui.alert('Locations Updated', 'Updated ' + updatedCount + ' training task location(s).', ui.ButtonSet.OK);
  Logger.log('fixTrainingTaskLocations: Updated ' + updatedCount + ' locations');
}


