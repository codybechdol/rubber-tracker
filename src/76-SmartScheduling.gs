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
    // Match various phone column header formats
    if (header === 'phone number' || header === 'phone' || header === 'phone #' || header === 'cell' || header === 'cell phone') {
      phoneCol = h;
      break;
    }
  }

  // Use COLS constants as fallback if headers don't match
  // COLS.EMPLOYEES.PHONE = 5 (column E, 0-based index 4)
  if (phoneCol === -1) {
    phoneCol = 4; // Column E (0-based)
    Logger.log('formatEmployeePhoneNumbers: Using fallback phoneCol=4 (Column E)');
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
  collectSwapTasks(ss, 'Glove Swaps', 'Glove', tasksByLocation, employeeLocations, employeeForemen, employeePhones, today);
  var afterGlove = countTasks(tasksByLocation);
  Logger.log('collectAndGroupTasks: Glove Swaps added ' + (afterGlove - beforeGlove) + ' tasks');

  // Collect from Sleeve Swaps
  var beforeSleeve = countTasks(tasksByLocation);
  collectSwapTasks(ss, 'Sleeve Swaps', 'Sleeve', tasksByLocation, employeeLocations, employeeForemen, employeePhones, today);
  var afterSleeve = countTasks(tasksByLocation);
  Logger.log('collectAndGroupTasks: Sleeve Swaps added ' + (afterSleeve - beforeSleeve) + ' tasks');

  // Collect from Blanket Swaps (Phase 1 - March 2026)
  var beforeBlanket = countTasks(tasksByLocation);
  collectSwapTasks(ss, 'Blanket Swaps', 'Blanket', tasksByLocation, employeeLocations, employeeForemen, employeePhones, today);
  var afterBlanket = countTasks(tasksByLocation);
  Logger.log('collectAndGroupTasks: Blanket Swaps added ' + (afterBlanket - beforeBlanket) + ' tasks');

  // Collect from HV Tester Swaps (Phase 2 - equipment-based format)
  var beforeHVTester = countTasks(tasksByLocation);
  collectEquipmentSwapTasks(ss, SHEET_HV_TESTER_SWAPS, 'HV Tester', tasksByLocation, employeeLocations, employeeForemen, employeePhones, today);
  var afterHVTester = countTasks(tasksByLocation);
  Logger.log('collectAndGroupTasks: HV Tester Swaps added ' + (afterHVTester - beforeHVTester) + ' tasks');

  // Collect from Phasing Set Swaps (Phase 2 - equipment-based format)
  var beforePhasingSet = countTasks(tasksByLocation);
  collectEquipmentSwapTasks(ss, SHEET_PHASING_SET_SWAPS, 'Phasing Set', tasksByLocation, employeeLocations, employeeForemen, employeePhones, today);
  var afterPhasingSet = countTasks(tasksByLocation);
  Logger.log('collectAndGroupTasks: Phasing Set Swaps added ' + (afterPhasingSet - beforePhasingSet) + ' tasks');

  // Collect from AED Swaps (Phase 3 - equipment-based format)
  var beforeAED = countTasks(tasksByLocation);
  collectEquipmentSwapTasks(ss, SHEET_AED_SWAPS, 'AED', tasksByLocation, employeeLocations, employeeForemen, employeePhones, today);
  var afterAED = countTasks(tasksByLocation);
  Logger.log('collectAndGroupTasks: AED Swaps added ' + (afterAED - beforeAED) + ' tasks');

  // Collect from Training Tracking
  var beforeTraining = countTasks(tasksByLocation);
  collectTrainingTasks(ss, tasksByLocation, employeePhones, today);
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

  // Find columns - check various header name formats
  for (var h = 0; h < headers.length; h++) {
    var header = String(headers[h]).toLowerCase().trim();
    if (header === 'name') nameCol = h;
    // Match various phone column header formats
    if (header === 'phone number' || header === 'phone' || header === 'phone #' || header === 'cell' || header === 'cell phone') phoneCol = h;
  }

  // Use COLS constants as fallback if headers don't match
  // COLS.EMPLOYEES.NAME = 1 (column A, 0-based index 0)
  // COLS.EMPLOYEES.PHONE = 5 (column E, 0-based index 4)
  if (nameCol === -1) {
    nameCol = 0; // Column A (0-based)
    Logger.log('getEmployeePhoneMapInternal: Using fallback nameCol=0 (Column A)');
  }
  if (phoneCol === -1) {
    phoneCol = 4; // Column E (0-based) - COLS.EMPLOYEES.PHONE - 1
    Logger.log('getEmployeePhoneMapInternal: Using fallback phoneCol=4 (Column E)');
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

  Logger.log('getEmployeePhoneMapInternal: Found ' + Object.keys(phoneMap).length + ' employee phone numbers');
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
 * @param {Object} employeePhones - Employee to phone number map
 * @param {Date} today - Today's date
 */
function collectSwapTasks(ss, sheetName, itemType, tasksByLocation, employeeLocations, employeeForemen, employeePhones, today) {
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

      // Get phone number for this employee
      var phoneNumber = employeePhones[employee.toLowerCase()] || '';

      // Create task object
      var task = {
        type: 'Swap',
        itemType: itemType,
        employee: employee,
        location: location,
        foreman: foreman,
        phoneNumber: phoneNumber,
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
 * Collects equipment swap tasks from report-style swap sheets (HV Testers, Phasing Sets, AED).
 * These sheets have a different format from Glove/Sleeve/Blanket swaps:
 * - Equipment-based (Item #, Model, etc.) rather than employee-based
 * - No Picked/Date Changed workflow - items are listed if approaching replacement
 * - "Assigned To" column indicates who has the equipment
 *
 * @param {Spreadsheet} ss - Active spreadsheet
 * @param {string} sheetName - Name of the swap sheet (e.g., 'HV Tester Swaps')
 * @param {string} itemType - Type label (e.g., 'HV Tester', 'Phasing Set', 'AED')
 * @param {Object} tasksByLocation - Object to add tasks to
 * @param {Object} employeeLocations - Map of employee names to locations
 * @param {Object} employeeForemen - Map of employee names to foremen
 * @param {Object} employeePhones - Map of employee names to phone numbers
 * @param {Date} today - Today's date
 */
function collectEquipmentSwapTasks(ss, sheetName, itemType, tasksByLocation, employeeLocations, employeeForemen, employeePhones, today) {
  Logger.log('*** collectEquipmentSwapTasks CALLED for ' + sheetName + ' ***');

  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    Logger.log('collectEquipmentSwapTasks: Sheet "' + sheetName + '" NOT FOUND');
    return;
  }

  var lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    Logger.log('collectEquipmentSwapTasks: Sheet "' + sheetName + '" has no data rows');
    return;
  }

  var data = sheet.getDataRange().getValues();

  // Find header row (skip title/merge rows)
  var headerRowIndex = -1;
  for (var i = 0; i < Math.min(data.length, 5); i++) {
    var firstCell = String(data[i][0]).toLowerCase().trim();
    if (firstCell === 'item #' || firstCell === 'item') {
      headerRowIndex = i;
      break;
    }
  }

  if (headerRowIndex === -1) {
    Logger.log('collectEquipmentSwapTasks: Could not find header row in ' + sheetName);
    return;
  }

  var headers = data[headerRowIndex];

  // Find column indices dynamically
  var itemNumCol = -1;
  var modelCol = -1;
  var locationCol = -1;
  var assignedToCol = -1;
  var daysLeftCol = -1;
  var statusCol = -1;
  // Date column varies: "Replacement Date" for HV/Phasing, "Pad Expiration" for AED
  var dueDateCol = -1;

  for (var h = 0; h < headers.length; h++) {
    var header = String(headers[h]).toLowerCase().trim();
    if (header === 'item #' || header === 'item') itemNumCol = h;
    if (header === 'model') modelCol = h;
    if (header === 'location') locationCol = h;
    if (header === 'assigned to') assignedToCol = h;
    if (header === 'days left') daysLeftCol = h;
    if (header === 'status') statusCol = h;
    if (header === 'replacement date' || header === 'pad expiration' || header === 'change out date') dueDateCol = h;
  }

  Logger.log('collectEquipmentSwapTasks: ' + sheetName + ' columns - itemNum=' + itemNumCol + ', assignedTo=' + assignedToCol + ', dueDate=' + dueDateCol + ', location=' + locationCol);

  if (itemNumCol === -1) {
    Logger.log('collectEquipmentSwapTasks: Could not find Item # column in ' + sheetName);
    return;
  }

  var tasksAdded = 0;

  // Process data rows after header
  for (var r = headerRowIndex + 1; r < data.length; r++) {
    var row = data[r];
    var itemNum = String(row[itemNumCol] || '').trim();
    if (!itemNum) continue;

    // Skip summary rows
    if (itemNum.toLowerCase().indexOf('summary') !== -1) continue;

    var model = modelCol !== -1 ? String(row[modelCol] || '').trim() : '';
    var assignedTo = assignedToCol !== -1 ? String(row[assignedToCol] || '').trim() : '';
    var location = locationCol !== -1 ? String(row[locationCol] || '').trim() : '';
    var daysLeftValue = daysLeftCol !== -1 ? row[daysLeftCol] : '';
    var status = statusCol !== -1 ? String(row[statusCol] || '').trim() : '';

    // Skip "On Shelf" items or items without an assignment
    if (!assignedTo || assignedTo.toLowerCase() === 'on shelf') continue;

    // Parse due date
    var dueDate = null;
    var isOverdue = false;
    var daysTillDue = null;

    if (dueDateCol !== -1) {
      var rawDueDate = row[dueDateCol];
      if (rawDueDate instanceof Date) {
        dueDate = new Date(rawDueDate);
        dueDate.setHours(0, 0, 0, 0);
        daysTillDue = Math.ceil((dueDate - today) / (1000 * 60 * 60 * 24));
        isOverdue = daysTillDue < 0;
      }
    }

    // Fallback: use Days Left column
    if (daysTillDue === null && daysLeftValue !== '') {
      var parsedDays = parseInt(daysLeftValue, 10);
      if (!isNaN(parsedDays)) {
        daysTillDue = parsedDays;
        isOverdue = daysTillDue < 0;
      }
    }

    // Check status for overdue indicators
    if (status.indexOf('OVERDUE') !== -1 || status.indexOf('EXPIRED') !== -1) {
      isOverdue = true;
    }

    // Determine location - use sheet's location or look up from employee
    if (!location || location === 'Unknown') {
      location = employeeLocations[assignedTo.toLowerCase()] || 'Unknown';
    }

    // Get foreman and phone for this employee
    var foreman = employeeForemen[assignedTo.toLowerCase()] || 'Unknown';
    var phoneNumber = employeePhones[assignedTo.toLowerCase()] || '';

    // Build task description
    var taskDescription = itemType + ' ' + itemNum;
    if (model) taskDescription += ' (' + model + ')';

    var task = {
      type: 'Swap',
      itemType: itemType,
      employee: assignedTo,
      location: location,
      foreman: foreman,
      phoneNumber: phoneNumber,
      currentItem: itemNum,
      pickListItem: '',
      size: model,
      dueDate: dueDate,
      isOverdue: isOverdue,
      daysTillDue: daysTillDue,
      status: status,
      estimatedTime: 15,  // 15 minutes per equipment swap
      priority: isOverdue ? 'High' : (daysTillDue !== null && daysTillDue <= 30 ? 'Medium' : 'Low'),
      sheetName: sheetName,
      rowIndex: r + 1  // 1-based row number
    };

    // Add to location group
    if (!tasksByLocation[location]) {
      tasksByLocation[location] = [];
    }
    tasksByLocation[location].push(task);
    tasksAdded++;
  }

  Logger.log('collectEquipmentSwapTasks: Added ' + tasksAdded + ' ' + itemType + ' tasks from ' + sheetName);
}


/**
 * Collects reclaim tasks from Reclaims sheet.
 * Reclaims are gloves/sleeves that need to be reclaimed from employees (Class upgrades/downgrades).
 *
 * @param {Spreadsheet} ss - Active spreadsheet
 * @param {Object} tasksByLocation - Object to add tasks to
 * @param {Object} employeeLocations - Map of employee names to locations
 * @param {Object} employeeForemen - Map of employee names to foremen
 * @param {Date} today - Today's date
 */
function collectReclaimTasks(ss, tasksByLocation, employeeLocations, employeeForemen, today) {
  var reclaimsSheet = ss.getSheetByName('Reclaims');
  if (!reclaimsSheet) {
    Logger.log('collectReclaimTasks: Reclaims sheet not found');
    return;
  }

  var lastRow = reclaimsSheet.getLastRow();
  if (lastRow < 2) {
    Logger.log('collectReclaimTasks: Reclaims sheet has too few rows');
    return;
  }

  var data = reclaimsSheet.getDataRange().getValues();
  Logger.log('collectReclaimTasks: Processing ' + data.length + ' rows');

  var inClass3Table = false;
  var inClass2Table = false;
  var inLostItemsTable = false;
  var tasksAdded = 0;

  for (var i = 0; i < data.length; i++) {
    var row = data[i];
    var firstCell = String(row[0] || '').trim();

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

    // End of Lost Items table
    if (inLostItemsTable && (firstCell.indexOf('Previous') !== -1 ||
        firstCell.indexOf('Approved') !== -1 || firstCell.indexOf('Class') !== -1)) {
      inLostItemsTable = false;
      continue;
    }

    // Skip header rows and non-data rows
    if (firstCell === 'Employee' || firstCell === 'Item Type' || firstCell === '' ||
        firstCell.indexOf('Previous') !== -1 ||
        firstCell.indexOf('Approved') !== -1 || firstCell.indexOf('Location') !== -1 ||
        firstCell.indexOf('✅') !== -1 || firstCell.indexOf('📍') !== -1 ||
        firstCell.toLowerCase() === 'no reclaims') {
      continue;
    }

    if (inClass3Table || inClass2Table) {
      // Reclaims table structure: Employee, Item Type, Item #, Size, Class, Location, Pick List Item #, Pick List Status
      var employee = String(row[0] || '').trim();
      var itemType = String(row[1] || '').trim();
      var itemNum = String(row[2] || '').trim();
      var size = String(row[3] || '').trim();
      var itemClass = String(row[4] || '').trim();
      var location = String(row[5] || '').trim();

      // Skip if no employee name
      if (!employee) continue;

      // Get location from employee map if not in sheet
      if (!location || location === '') {
        location = employeeLocations[employee.toLowerCase()] || 'Unknown';
      }

      // Get foreman for this employee
      var foreman = employeeForemen[employee.toLowerCase()] || 'Unknown';

      var reclaimType = inClass3Table ? 'Reclaim CL3→CL2' : 'Reclaim CL2→CL3';

      var task = {
        type: 'Reclaim',
        taskType: reclaimType,
        itemType: itemType || 'Glove',
        employee: employee,
        location: location,
        foreman: foreman,
        currentItem: itemNum,
        pickListItem: '',
        size: size,
        itemClass: itemClass,
        dueDate: null,
        isOverdue: false,
        daysTillDue: null,
        status: 'Unassigned',
        estimatedTime: 15, // 15 minutes per reclaim
        priority: 'Medium',
        sheetName: 'Reclaims',
        rowIndex: i + 1
      };

      // Add to location group
      if (!tasksByLocation[location]) {
        tasksByLocation[location] = [];
      }
      tasksByLocation[location].push(task);
      tasksAdded++;
    }
  }

  Logger.log('collectReclaimTasks: Added ' + tasksAdded + ' reclaim tasks');
}


/**
 * Collects expiring cert tasks from Expiring Certs sheet.
 * Only includes certs that are expired or expiring soon based on config.
 *
 * @param {Spreadsheet} ss - Active spreadsheet
 * @param {Object} tasksByLocation - Object to add tasks to
 * @param {Object} employeeLocations - Map of employee names to locations
 * @param {Object} employeeForemen - Map of employee names to foremen
 * @param {Object} employeePhones - Map of employee names to phone numbers
 * @param {Date} today - Today's date
 */
function collectExpiringCertTasks(ss, tasksByLocation, employeeLocations, employeeForemen, employeePhones, today) {
  var expiringSheet = ss.getSheetByName('Expiring Certs');
  if (!expiringSheet || expiringSheet.getLastRow() < 2) {
    Logger.log('collectExpiringCertTasks: Expiring Certs sheet not found or empty');
    return;
  }

  // Build set of completed cert tasks from Task Metadata to skip
  // This prevents certs from reappearing after user updates the expiration date
  var completedCerts = {};
  var metadataSheet = ss.getSheetByName('Task Metadata');
  if (metadataSheet && metadataSheet.getLastRow() > 1) {
    var metaData = metadataSheet.getDataRange().getValues();
    var metaHeaders = metaData[0];
    var metaSourceSheetCol = -1, metaSourceRowCol = -1, metaStatusCol = -1;
    var metaEmployeeCol = -1, metaItemTypeCol = -1, metaTaskTypeCol = -1;

    for (var mh = 0; mh < metaHeaders.length; mh++) {
      var metaHdr = String(metaHeaders[mh]).trim();
      if (metaHdr === 'SourceSheet') metaSourceSheetCol = mh;
      if (metaHdr === 'SourceRow') metaSourceRowCol = mh;
      if (metaHdr === 'Status') metaStatusCol = mh;
      if (metaHdr === 'Employee') metaEmployeeCol = mh;
      if (metaHdr === 'ItemType') metaItemTypeCol = mh;
      if (metaHdr === 'TaskType') metaTaskTypeCol = mh;
    }

    if (metaStatusCol !== -1) {
      for (var mi = 1; mi < metaData.length; mi++) {
        var metaStatus = String(metaData[mi][metaStatusCol] || '').trim();
        var metaSourceSheet = String(metaData[mi][metaSourceSheetCol] || '').trim();
        var metaTaskType = String(metaData[mi][metaTaskTypeCol] || '').trim();

        // Only track completed Cert Expiring tasks from Expiring Certs sheet
        if (metaStatus === 'Complete' &&
            (metaSourceSheet === 'Expiring Certs' || metaTaskType === 'Cert Expiring')) {
          var metaSourceRow = metaData[mi][metaSourceRowCol];
          var metaEmployee = String(metaData[mi][metaEmployeeCol] || '').trim().toLowerCase();
          var metaItemType = String(metaData[mi][metaItemTypeCol] || '').trim().toLowerCase();

          // Track by row number AND by employee+certType combo
          if (metaSourceRow) {
            completedCerts['row_' + metaSourceRow] = true;
          }
          if (metaEmployee && metaItemType) {
            completedCerts['emp_' + metaEmployee + '_' + metaItemType] = true;
          }
        }
      }
    }
    Logger.log('collectExpiringCertTasks: Found ' + Object.keys(completedCerts).length + ' completed cert tasks to skip');
  }

  // Get config for which cert types to track
  var properties = PropertiesService.getScriptProperties();
  var selectedCertTypesJson = properties.getProperty('selectedCertTypes');
  var selectedCertTypes = null;
  if (selectedCertTypesJson) {
    try {
      selectedCertTypes = JSON.parse(selectedCertTypesJson);
    } catch (e) {
      Logger.log('collectExpiringCertTasks: Error parsing selectedCertTypes: ' + e);
    }
  }

  var data = expiringSheet.getDataRange().getValues();
  var headers = data[0];

  // Find column indices
  var nameCol = -1, certTypeCol = -1, expDateCol = -1, daysUntilCol = -1;
  for (var h = 0; h < headers.length; h++) {
    var hdr = String(headers[h]).toLowerCase().trim();
    if (hdr === 'employee name' || hdr === 'name') nameCol = h;
    if (hdr === 'cert type' || hdr === 'certification type' || hdr === 'item type') certTypeCol = h;
    if (hdr === 'expiration date' || hdr === 'exp date') expDateCol = h;
    if (hdr === 'days until' || hdr === 'days until expiration') daysUntilCol = h;
  }

  if (nameCol === -1 || certTypeCol === -1) {
    Logger.log('collectExpiringCertTasks: Required columns not found. nameCol=' + nameCol + ', certTypeCol=' + certTypeCol + '. Headers: ' + JSON.stringify(headers));
    return;
  }

  var tasksAdded = 0;
  var skippedCompleted = 0;
  var daysThreshold = 365; // Include certs expiring within this many days

  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var employee = String(row[nameCol] || '').trim();
    var certType = String(row[certTypeCol] || '').trim();
    var expDate = expDateCol !== -1 ? row[expDateCol] : null;
    var daysUntil = daysUntilCol !== -1 ? row[daysUntilCol] : null;

    if (!employee || !certType) continue;

    // Skip certs that have been marked Complete in Task Metadata
    // Check both by row number and by employee+certType combo
    var rowKey = 'row_' + (i + 1);
    var empCertKey = 'emp_' + employee.toLowerCase() + '_' + certType.toLowerCase();
    if (completedCerts[rowKey] || completedCerts[empCertKey]) {
      skippedCompleted++;
      continue;
    }

    // Check if cert type is in selected types (if configured)
    if (selectedCertTypes && selectedCertTypes.length > 0) {
      if (selectedCertTypes.indexOf(certType) === -1) continue;
    }

    // Skip Crane Evaluation - it's non-expiring
    if (certType === 'Crane Evaluation') continue;

    // Only include expired or expiring soon
    var isExpired = false;
    var daysLeft = null;

    if (typeof daysUntil === 'number') {
      daysLeft = daysUntil;
      isExpired = daysUntil < 0;
    } else if (expDate instanceof Date && !isNaN(expDate.getTime())) {
      var todayStart = new Date(today);
      todayStart.setHours(0, 0, 0, 0);
      var expDateStart = new Date(expDate);
      expDateStart.setHours(0, 0, 0, 0);
      daysLeft = Math.ceil((expDateStart - todayStart) / (1000 * 60 * 60 * 24));
      isExpired = daysLeft < 0;
    }

    // Only include if expired or expiring within threshold
    if (daysLeft === null || daysLeft > daysThreshold) continue;

    var location = employeeLocations[employee.toLowerCase()] || 'Unknown';
    var foreman = employeeForemen[employee.toLowerCase()] || 'Unknown';
    var phone = employeePhones[employee.toLowerCase()] || '';

    var task = {
      type: 'Cert Expiring',
      taskType: 'Cert Expiring',
      itemType: certType,
      certType: certType,
      employee: employee,
      location: location,
      foreman: foreman,
      phoneNumber: phone,
      dueDate: expDate instanceof Date ? expDate : null,
      isOverdue: isExpired,
      daysTillDue: daysLeft,
      status: isExpired ? 'Expired' : 'Expiring',
      estimatedTime: 15, // 15 minutes for phone call
      priority: isExpired ? 'High' : (daysLeft <= 30 ? 'Medium' : 'Low'),
      sheetName: 'Expiring Certs',
      rowIndex: i + 1
    };

    // Add to location group
    if (!tasksByLocation[location]) {
      tasksByLocation[location] = [];
    }
    tasksByLocation[location].push(task);
    tasksAdded++;
  }

  Logger.log('collectExpiringCertTasks: Added ' + tasksAdded + ' cert tasks (skipped ' + skippedCompleted + ' completed)');
}


/**
 * Collects certs that were manually added to task list (InTaskList=TRUE in Task Metadata).
 * This captures Crane Certs and other certs that were manually added from the Expiring Certs tab.
 *
 * @param {Spreadsheet} ss - Active spreadsheet
 * @param {Object} tasksByLocation - Object to add tasks to
 * @param {Object} employeeLocations - Map of employee names to locations
 * @param {Object} employeeForemen - Map of employee names to foremen
 * @param {Object} employeePhones - Map of employee names to phone numbers
 */
function collectInTaskListCerts(ss, tasksByLocation, employeeLocations, employeeForemen, employeePhones) {
  var metadataSheet = ss.getSheetByName('Task Metadata');
  if (!metadataSheet || metadataSheet.getLastRow() < 2) {
    Logger.log('collectInTaskListCerts: Task Metadata sheet not found or empty');
    return;
  }

  var data = metadataSheet.getDataRange().getValues();
  var headers = data[0];

  // Find column indices
  var cols = {};
  for (var h = 0; h < headers.length; h++) {
    var hdr = String(headers[h]).toLowerCase().trim();
    if (hdr === 'tasktype') cols.taskType = h;
    if (hdr === 'itemtype') cols.itemType = h;
    if (hdr === 'employee') cols.employee = h;
    if (hdr === 'location') cols.location = h;
    if (hdr === 'status') cols.status = h;
    if (hdr === 'intasklist' || hdr === 'in task list') cols.inTaskList = h;
    if (hdr === 'sourcesheet') cols.sourceSheet = h;
    if (hdr === 'sourcerowindex') cols.sourceRowIndex = h;
    if (hdr === 'duedate') cols.dueDate = h;
  }

  if (cols.inTaskList === undefined) {
    Logger.log('collectInTaskListCerts: InTaskList column not found');
    return;
  }

  var tasksAdded = 0;

  for (var i = 1; i < data.length; i++) {
    var row = data[i];

    // Only include if InTaskList is TRUE and it's a cert task
    var inTaskList = row[cols.inTaskList];
    if (inTaskList !== true && String(inTaskList).toLowerCase() !== 'true') continue;

    var taskType = cols.taskType !== undefined ? String(row[cols.taskType] || '').trim() : '';
    if (taskType !== 'Cert Expiring') continue;

    var status = cols.status !== undefined ? String(row[cols.status] || '').trim() : '';
    if (status === 'Complete' || status === 'Completed') continue;

    var employee = cols.employee !== undefined ? String(row[cols.employee] || '').trim() : '';
    var itemType = cols.itemType !== undefined ? String(row[cols.itemType] || '').trim() : '';
    var location = cols.location !== undefined ? String(row[cols.location] || '').trim() : '';
    var dueDate = cols.dueDate !== undefined ? row[cols.dueDate] : null;

    if (!employee) continue;

    // Use provided maps if location not in metadata
    if (!location || location === 'Unknown') {
      location = employeeLocations[employee.toLowerCase()] || 'Unknown';
    }
    var foreman = employeeForemen[employee.toLowerCase()] || 'Unknown';
    var phone = employeePhones[employee.toLowerCase()] || '';

    var task = {
      type: 'Cert Expiring',
      taskType: 'Cert Expiring',
      itemType: itemType,
      certType: itemType,
      employee: employee,
      location: location,
      foreman: foreman,
      phoneNumber: phone,
      dueDate: dueDate instanceof Date ? dueDate : null,
      isOverdue: false,
      daysTillDue: null,
      status: status || 'Unassigned',
      estimatedTime: 15,
      priority: 'Medium',
      sheetName: 'Task Metadata',
      rowIndex: i + 1,
      fromInTaskList: true
    };

    // Add to location group
    if (!tasksByLocation[location]) {
      tasksByLocation[location] = [];
    }
    tasksByLocation[location].push(task);
    tasksAdded++;
  }

  Logger.log('collectInTaskListCerts: Added ' + tasksAdded + ' manually-added cert tasks');
}


/**
 * Collects training tasks from Training Tracking sheet.
 * Filters crews based on job classifications selected in Training Config.
 *
 * @param {Spreadsheet} ss - Active spreadsheet
 * @param {Object} tasksByLocation - Object to add tasks to
 * @param {Date} today - Today's date
 */
function collectTrainingTasks(ss, tasksByLocation, employeePhones, today) {
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

    // Get phone number for the assignee
    var phoneNumber = employeePhones[assignee.toLowerCase()] || '';

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
      phoneNumber: phoneNumber,
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


/**
 * Collects tasks from the Manual Tasks sheet.
 * Manual Tasks are user-created tasks or system-generated tasks from Trip Planner.
 *
 * @param {Spreadsheet} ss - Active spreadsheet
 * @param {Object} tasksByLocation - Object to add tasks to
 * @param {Date} today - Current date
 */
function collectManualTasks(ss, tasksByLocation, today) {
  var manualSheet = ss.getSheetByName('Manual Tasks');
  if (!manualSheet || manualSheet.getLastRow() < 2) {
    Logger.log('collectManualTasks: Manual Tasks sheet not found or empty');
    return;
  }

  var data = manualSheet.getDataRange().getValues();
  var headers = data[0];

  // Find column indices
  var colMap = {};
  for (var h = 0; h < headers.length; h++) {
    var hdr = String(headers[h]).toLowerCase().trim();
    if (hdr === 'location') colMap.location = h;
    if (hdr === 'priority') colMap.priority = h;
    if (hdr === 'task' || hdr === 'task type') colMap.taskType = h;
    if (hdr === 'employee') colMap.employee = h;
    if (hdr === 'scheduled date') colMap.scheduledDate = h;
    if (hdr === 'start time') colMap.startTime = h;
    if (hdr === 'end time') colMap.endTime = h;
    if (hdr === 'status') colMap.status = h;
    if (hdr === 'notes') colMap.notes = h;
    if (hdr === 'date added') colMap.dateAdded = h;
    if (hdr === 'locked') colMap.locked = h;
    if (hdr === 'manually created') colMap.manuallyCreated = h;
    if (hdr === 'completed') colMap.completed = h;
  }

  if (colMap.location === undefined) {
    Logger.log('collectManualTasks: Required "Location" column not found');
    return;
  }

  var tasksAdded = 0;

  for (var i = 1; i < data.length; i++) {
    var row = data[i];

    var location = String(row[colMap.location] || '').trim();
    if (!location) continue;

    var status = colMap.status !== undefined ? String(row[colMap.status] || '').trim().toLowerCase() : '';
    var completed = colMap.completed !== undefined ? row[colMap.completed] : false;

    // Skip completed tasks
    if (status === 'complete' || status === 'completed' || completed === true || completed === 'TRUE') {
      continue;
    }

    var taskType = colMap.taskType !== undefined ? String(row[colMap.taskType] || 'Manual Task').trim() : 'Manual Task';
    var employee = colMap.employee !== undefined ? String(row[colMap.employee] || '').trim() : '';
    var priority = colMap.priority !== undefined ? String(row[colMap.priority] || 'Medium').trim() : 'Medium';
    var notes = colMap.notes !== undefined ? String(row[colMap.notes] || '').trim() : '';
    var scheduledDate = colMap.scheduledDate !== undefined ? row[colMap.scheduledDate] : null;
    var startTime = colMap.startTime !== undefined ? row[colMap.startTime] : null;
    var endTime = colMap.endTime !== undefined ? row[colMap.endTime] : null;
    var isLocked = colMap.locked !== undefined ? (row[colMap.locked] === true || row[colMap.locked] === 'TRUE') : false;
    var manuallyCreated = colMap.manuallyCreated !== undefined ? (row[colMap.manuallyCreated] === true || row[colMap.manuallyCreated] === 'TRUE') : true;

    // Parse scheduled date
    var dueDate = null;
    if (scheduledDate instanceof Date && !isNaN(scheduledDate.getTime())) {
      dueDate = scheduledDate;
    }

    // Check if overdue
    var isOverdue = false;
    if (dueDate) {
      var todayStart = new Date(today);
      todayStart.setHours(0, 0, 0, 0);
      var dueDateStart = new Date(dueDate);
      dueDateStart.setHours(0, 0, 0, 0);
      isOverdue = dueDateStart < todayStart;
    }

    var task = {
      type: 'Manual Task',
      taskType: taskType,
      itemType: taskType,
      employee: employee || 'N/A',
      location: location,
      foreman: '',
      phoneNumber: '',
      dueDate: dueDate,
      scheduledDate: dueDate,
      startTime: startTime,
      endTime: endTime,
      isOverdue: isOverdue,
      status: status || (dueDate ? 'Assigned' : 'Unassigned'),
      estimatedTime: 30,
      priority: priority,
      notes: notes,
      isLocked: isLocked,
      manuallyCreated: manuallyCreated,
      sheetName: 'Manual Tasks',
      rowIndex: i + 1
    };

    // Add to location group
    if (!tasksByLocation[location]) {
      tasksByLocation[location] = [];
    }
    tasksByLocation[location].push(task);
    tasksAdded++;
  }

  Logger.log('collectManualTasks: Added ' + tasksAdded + ' manual tasks');
}


/**
 * Collects tasks from the Safety Equipment Needs sheet (formerly Safety Reports).
 * Only includes items with "Needs Attention" status.
 *
 * @param {Spreadsheet} ss - Active spreadsheet
 * @param {Object} tasksByLocation - Object to add tasks to
 * @param {Object} employeeLocations - Map of employee names to locations
 * @param {Date} today - Current date
 */
function collectSafetyReportsTasks(ss, tasksByLocation, employeeLocations, today) {
  // Check for both old and new sheet names
  var safetySheet = ss.getSheetByName('Safety Equipment Needs') || ss.getSheetByName('Safety Reports');
  if (!safetySheet || safetySheet.getLastRow() < 2) {
    Logger.log('collectSafetyReportsTasks: Safety Equipment Needs sheet not found or empty');
    return;
  }

  var data = safetySheet.getDataRange().getValues();
  var headers = data[0];

  // Find column indices
  var colMap = {};
  for (var h = 0; h < headers.length; h++) {
    var hdr = String(headers[h]).toLowerCase().trim();
    if (hdr === 'report date') colMap.reportDate = h;
    if (hdr === 'report type') colMap.reportType = h;
    if (hdr === 'job number') colMap.jobNumber = h;
    if (hdr === 'foreman') colMap.foreman = h;
    if (hdr === 'vehicle number') colMap.vehicleNumber = h;
    if (hdr === 'equipment type') colMap.equipmentType = h;
    if (hdr === 'issue description') colMap.issueDescription = h;
    if (hdr === 'status') colMap.status = h;
    if (hdr === 'fe test date') colMap.feTestDate = h;
    if (hdr === 'notes') colMap.notes = h;
  }

  if (colMap.status === undefined || colMap.equipmentType === undefined) {
    Logger.log('collectSafetyReportsTasks: Required columns not found');
    return;
  }

  var tasksAdded = 0;

  for (var i = 1; i < data.length; i++) {
    var row = data[i];

    var status = String(row[colMap.status] || '').trim();
    // Only include "Needs Attention" items
    if (status !== 'Needs Attention') continue;

    var equipmentType = colMap.equipmentType !== undefined ? String(row[colMap.equipmentType] || '').trim() : '';
    if (!equipmentType || equipmentType === 'No Issues') continue;

    var foreman = colMap.foreman !== undefined ? String(row[colMap.foreman] || '').trim() : '';
    var jobNumber = colMap.jobNumber !== undefined ? String(row[colMap.jobNumber] || '').trim() : '';
    var vehicleNumber = colMap.vehicleNumber !== undefined ? String(row[colMap.vehicleNumber] || '').trim() : '';
    var issueDescription = colMap.issueDescription !== undefined ? String(row[colMap.issueDescription] || '').trim() : '';
    var reportDate = colMap.reportDate !== undefined ? row[colMap.reportDate] : null;
    var notes = colMap.notes !== undefined ? String(row[colMap.notes] || '').trim() : '';

    // Determine location from foreman's employee location
    var location = 'Unknown';
    if (foreman && employeeLocations[foreman.toLowerCase()]) {
      location = employeeLocations[foreman.toLowerCase()];
    }

    // Check if overdue (more than 7 days old)
    var isOverdue = false;
    if (reportDate instanceof Date && !isNaN(reportDate.getTime())) {
      var daysSince = Math.floor((today - reportDate) / (1000 * 60 * 60 * 24));
      isOverdue = daysSince > 7;
    }

    var task = {
      type: 'Safety Equipment',
      taskType: 'Safety Equipment',
      itemType: equipmentType,
      employee: foreman || 'N/A',
      location: location,
      foreman: foreman,
      jobNumber: jobNumber,
      vehicleNumber: vehicleNumber,
      currentItem: issueDescription,
      phoneNumber: '',
      dueDate: reportDate,
      description: issueDescription,
      isOverdue: isOverdue,
      status: 'Needs Attention',
      estimatedTime: 30,
      priority: isOverdue ? 'High' : 'Medium',
      notes: notes,
      sheetName: 'Safety Equipment Needs',
      rowIndex: i + 1
    };

    // Add to location group
    if (!tasksByLocation[location]) {
      tasksByLocation[location] = [];
    }
    tasksByLocation[location].push(task);
    tasksAdded++;
  }

  Logger.log('collectSafetyReportsTasks: Added ' + tasksAdded + ' safety equipment tasks');
}


/**
 * Collects Missing Safety Report tasks from Task Metadata.
 * These are JHA/Weekly Meeting compliance tasks created by the safety compliance tracking.
 *
 * @param {Spreadsheet} ss - Active spreadsheet
 * @param {Object} tasksByLocation - Object to add tasks to
 * @param {Object} employeeLocations - Map of employee names to locations
 * @param {Object} employeeForemen - Map of employee names to foremen
 * @param {Object} employeePhones - Map of employee names to phone numbers
 * @param {Date} today - Current date
 */
function collectMissingSafetyReportTasks(ss, tasksByLocation, employeeLocations, employeeForemen, employeePhones, today) {
  var metadataSheet = ss.getSheetByName('Task Metadata');
  if (!metadataSheet || metadataSheet.getLastRow() < 2) {
    Logger.log('collectMissingSafetyReportTasks: Task Metadata sheet not found or empty');
    return;
  }

  var data = metadataSheet.getDataRange().getValues();
  var headers = data[0];

  // Find column indices
  var colMap = {};
  for (var h = 0; h < headers.length; h++) {
    var hdr = String(headers[h]).toLowerCase().trim();
    if (hdr === 'taskid') colMap.taskId = h;
    if (hdr === 'tasktype') colMap.taskType = h;
    if (hdr === 'itemtype') colMap.itemType = h;
    if (hdr === 'employee') colMap.employee = h;
    if (hdr === 'location') colMap.location = h;
    if (hdr === 'jobnumber') colMap.jobNumber = h;
    if (hdr === 'phonenumber') colMap.phoneNumber = h;
    if (hdr === 'duedate') colMap.dueDate = h;
    if (hdr === 'status') colMap.status = h;
    if (hdr === 'completeddate') colMap.completedDate = h;
    if (hdr === 'notes') colMap.notes = h;
    if (hdr === 'sourcesheet') colMap.sourceSheet = h;
    if (hdr === 'sourcerow') colMap.sourceRow = h;
  }

  if (colMap.taskType === undefined || colMap.status === undefined) {
    Logger.log('collectMissingSafetyReportTasks: Required columns not found');
    return;
  }

  var tasksAdded = 0;
  var seenJobWeeks = {};

  for (var i = 1; i < data.length; i++) {
    var row = data[i];

    var taskType = String(row[colMap.taskType] || '').trim();
    // Only process Missing Safety Report tasks
    if (taskType !== 'Missing Safety Report') continue;

    var status = String(row[colMap.status] || '').trim().toLowerCase();
    // Skip completed/resolved tasks
    if (status === 'complete' || status === 'completed' || status === 'resolved') continue;

    var taskId = colMap.taskId !== undefined ? String(row[colMap.taskId] || '').trim() : '';
    var itemType = colMap.itemType !== undefined ? String(row[colMap.itemType] || '').trim() : 'JHA';
    var employee = colMap.employee !== undefined ? String(row[colMap.employee] || '').trim() : '';
    var location = colMap.location !== undefined ? String(row[colMap.location] || '').trim() : 'Unknown';
    var jobNumber = colMap.jobNumber !== undefined ? String(row[colMap.jobNumber] || '').trim() : '';
    var phone = colMap.phoneNumber !== undefined ? String(row[colMap.phoneNumber] || '').trim() : '';
    var dueDate = colMap.dueDate !== undefined ? row[colMap.dueDate] : null;
    var notes = colMap.notes !== undefined ? String(row[colMap.notes] || '').trim() : '';

    // Extract week date from taskId for deduplication
    var weekKey = '';
    if (taskId) {
      var parts = taskId.split('_');
      if (parts.length >= 3) {
        var job = parts[1];
        var weekPart = parts.slice(2).join('_');
        weekKey = job + '_' + weekPart;
      }
    }

    // Skip duplicate job+week combinations
    if (weekKey && seenJobWeeks[weekKey]) {
      continue;
    }
    if (weekKey) {
      seenJobWeeks[weekKey] = true;
    }

    // Parse due date
    var parsedDueDate = null;
    if (dueDate instanceof Date && !isNaN(dueDate.getTime())) {
      parsedDueDate = dueDate;
    }

    // Check if overdue
    var isOverdue = false;
    if (parsedDueDate) {
      var todayStart = new Date(today);
      todayStart.setHours(0, 0, 0, 0);
      var dueDateStart = new Date(parsedDueDate);
      dueDateStart.setHours(0, 0, 0, 0);
      isOverdue = dueDateStart < todayStart;
    }

    // Get phone from employee phones if not in task metadata
    if (!phone && employee && employeePhones[employee.toLowerCase()]) {
      phone = employeePhones[employee.toLowerCase()];
    }

    var task = {
      type: 'Missing Safety Report',
      taskType: 'Missing Safety Report',
      itemType: itemType,
      employee: employee || 'Unknown Foreman',
      location: location,
      foreman: employee,
      jobNumber: jobNumber,
      phoneNumber: phone,
      dueDate: parsedDueDate,
      isOverdue: isOverdue,
      status: isOverdue ? 'Overdue' : 'Unassigned',
      estimatedTime: 15,
      priority: isOverdue ? 'High' : 'Medium',
      notes: notes,
      taskId: taskId,
      sheetName: 'Task Metadata',
      rowIndex: i + 1,
      source: 'Safety Compliance'
    };

    // Add to location group
    if (!tasksByLocation[location]) {
      tasksByLocation[location] = [];
    }
    tasksByLocation[location].push(task);
    tasksAdded++;
  }

  Logger.log('collectMissingSafetyReportTasks: Added ' + tasksAdded + ' missing safety report tasks');
}
