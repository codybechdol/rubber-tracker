/**
 * Glove Manager – Smart Scheduling System
 *
 * Automatically schedules crew visits based on tasks from Glove Swaps, Sleeve Swaps,
 * and Training. Groups tasks by location and prioritizes by due date to optimize trips.
 */

/* global logEvent, extractCrewNumber, buildToDoListCalendar, detectOvernightRequirement */
/* eslint-disable no-redeclare, no-unused-vars */

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
  var employeePhones = getEmployeePhoneMap(ss);
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
 *
 * @param {Spreadsheet} ss - Active spreadsheet
 * @return {Object} Map of employee name (lowercase) to phone number (digits only)
 */
function getEmployeePhoneMap(ss) {
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

  // Job number prefixes to exclude from training (e.g., Light Duty, Vacation, etc.)
  var excludedJobPrefixes = ['002', '005'];

  // Build map of crew numbers to first employee (for crews without a designated foreman)
  // Exclude employees with job numbers starting with excluded prefixes (002, 005)
  var crewFirstEmployee = {};
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

        // Skip employees with excluded job number prefixes (002-xx, 005-xx)
        var shouldSkip = false;
        for (var p = 0; p < excludedJobPrefixes.length; p++) {
          if (jobNum.indexOf(excludedJobPrefixes[p] + '-') === 0) {
            shouldSkip = true;
            break;
          }
        }
        if (shouldSkip) continue;

        // Extract base crew number (e.g., "039-26" from "039-26.1")
        var crewNum = jobNum.split('.')[0];

        // Only store the first employee found for each crew
        if (empName && crewNum && !crewFirstEmployee[crewNum]) {
          crewFirstEmployee[crewNum] = empName;
        }
      }
    }
    Logger.log('collectTrainingTasks: Built crew-to-first-employee map with ' + Object.keys(crewFirstEmployee).length + ' crews (excluding job prefixes: ' + excludedJobPrefixes.join(', ') + ')');
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

    // Skip if complete, N/A, or already has completion date
    if (!crew || status === 'Complete' || status === 'N/A') {
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
 * @param {Object} employeePhones - Employee to phone number map
 * @param {Date} today - Today's date
 */
function collectExpiringCertTasks(ss, tasksByLocation, employeeLocations, employeeForemen, employeePhones, today) {
  var expiringSheet = ss.getSheetByName('Expiring Certs');
  if (!expiringSheet || expiringSheet.getLastRow() < 2) {
    Logger.log('collectExpiringCertTasks: Expiring Certs sheet not found or empty');
    return;
  }

  // Build set of previous/terminated employee names to exclude
  var previousEmployeeNames = new Set();

  // Check Employee History for terminated employees
  var employeeHistorySheet = ss.getSheetByName('Employee History');
  if (employeeHistorySheet && employeeHistorySheet.getLastRow() > 2) {
    var historyData = employeeHistorySheet.getRange(3, 1, employeeHistorySheet.getLastRow() - 2, 10).getValues();
    // Employee History columns: A=Date, B=Employee Name, C=Event Type, D=Location
    for (var hi = 0; hi < historyData.length; hi++) {
      var histEventType = (historyData[hi][2] || '').toString().trim().toLowerCase();
      var histName = (historyData[hi][1] || '').toString().trim().toLowerCase();

      // If employee was terminated or marked as previous employee
      if (histEventType === 'terminated' || histEventType === 'previous employee') {
        if (histName) {
          previousEmployeeNames.add(histName);
        }
      }
    }
  }

  // Also check Employees sheet for "Previous Employee" location
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

    if (empNameCol !== -1 && empLocCol !== -1) {
      for (var ei = 1; ei < empData.length; ei++) {
        var empName = (empData[ei][empNameCol] || '').toString().trim().toLowerCase();
        var empLoc = (empData[ei][empLocCol] || '').toString().trim().toLowerCase();
        if (empName && empLoc === 'previous employee') {
          previousEmployeeNames.add(empName);
        }
      }
    }
  }

  Logger.log('collectExpiringCertTasks: Found ' + previousEmployeeNames.size + ' previous/terminated employees to exclude');

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
      selectedCertTypes = ['DL', 'MEC Expiration', '1st Aid', 'CPR', 'Crane Cert', 'Harassment Training'];
    }
  } else {
    // Default cert types if none configured - must match defaults in Code.gs getExpiringCertsMapping()
    selectedCertTypes = ['DL', 'MEC Expiration', '1st Aid', 'CPR', 'Crane Cert', 'Harassment Training'];
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

  // Track added certs to prevent duplicates (employee + cert type combination)
  var addedCerts = new Set();
  var duplicateCount = 0;

  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var employee = String(row[empCol] || '').trim();
    var certType = String(row[certTypeCol] || '').trim();
    var expirationDate = row[expirationCol];

    // Skip if no employee or cert type
    if (!employee || !certType) continue;

    // Skip if employee is a previous/terminated employee
    if (previousEmployeeNames.has(employee.toLowerCase())) {
      Logger.log('collectExpiringCertTasks: Skipping ' + certType + ' for previous employee: ' + employee);
      continue;
    }

    // Skip if this cert type is NOT selected in config
    if (selectedCertTypes.indexOf(certType) === -1) {
      continue;
    }

    // Enhanced logging for Crane Cert specifically
    if (certType === 'Crane Cert') {
      Logger.log('collectExpiringCertTasks: Processing Crane Cert for ' + employee + ', expiration: ' + expirationDate);
    }

    // Special handling for Crane Evaluation:
    // Crane Evaluation is a non-expiring cert - the date is when evaluation was performed
    // If row exists, employee is in compliance - skip it
    // Missing Crane Evaluations are detected via special check later (employees with Crane Cert but no Crane Evaluation row)
    if (certType === 'Crane Evaluation') {
      Logger.log('collectExpiringCertTasks: Skipping Crane Evaluation for ' + employee + ' - evaluation completed (non-expiring)');
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

    // Handle other non-expiring certs (OSHA 1910, BNSF, MSHA, etc.)
    // If row exists but no expiration date, treat as completed/compliant
    var isNonExpiringCert = !expDate;

    if (isNonExpiringCert) {
      // Non-expiring cert with a row in sheet = employee has it, skip
      Logger.log('collectExpiringCertTasks: Skipping non-expiring cert ' + certType + ' for ' + employee + ' - has cert (non-expiring)');
      continue;
    }

    // Regular expiring cert - check if expired or expiring soon
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

    // ALWAYS use employee's current location from Employees sheet (not stale data in Expiring Certs)
    // This ensures employees who moved (e.g., to "Weeds") show up under their current location
    var location = employeeLocations[employee.toLowerCase()] || '';
    if (!location) {
      // Fallback to location in Expiring Certs row if employee not found in Employees sheet
      location = locationCol !== -1 ? String(row[locationCol] || '').trim() : 'Unknown';
    }

    // Enhanced logging for Crane Cert
    if (certType === 'Crane Cert') {
      Logger.log('collectExpiringCertTasks: Crane Cert for ' + employee + ' - Location: ' + location + ', Days till due: ' + daysTillDue + ', Overdue: ' + isOverdue);
    }

    // Get foreman for this employee
    var foreman = employeeForemen[employee.toLowerCase()] || 'Unassigned';

    // Get phone number for this employee - try multiple matching strategies
    var whitespaceRegex = new RegExp('\\s+', 'g');
    var empNameLower = employee.toLowerCase().trim().replace(whitespaceRegex, ' '); // Normalize whitespace
    var phoneNumber = employeePhones[empNameLower] || '';

    // If no direct match, try partial matching on first and last name
    if (!phoneNumber) {
      var nameParts = empNameLower.split(' ');
      if (nameParts.length >= 2) {
        var firstName = nameParts[0];
        var lastName = nameParts[nameParts.length - 1];
        for (var empKey in employeePhones) {
          if (empKey.indexOf(firstName) !== -1 && empKey.indexOf(lastName) !== -1) {
            phoneNumber = employeePhones[empKey];
            break;
          }
        }
      }
    }

    // Log if phone not found for debugging
    if (!phoneNumber && taskCount < 10) {
      Logger.log('collectExpiringCertTasks: No phone found for "' + employee + '" (normalized: "' + empNameLower + '")');
    }

    // Determine status
    var status = isOverdue ? 'Expired' : 'Expiring Soon';

    // Check for duplicate (same employee + cert type already added)
    var certKey = employee.toLowerCase() + '|' + certType;
    if (addedCerts.has(certKey)) {
      Logger.log('collectExpiringCertTasks: Skipping duplicate ' + certType + ' for ' + employee);
      duplicateCount++;
      continue;
    }
    addedCerts.add(certKey);

    var task = {
      type: 'Cert Expiring',
      itemType: certType,
      employee: employee,
      location: location,
      foreman: foreman, // Use actual foreman from employee lookup
      phoneNumber: phoneNumber, // For SMS notifications
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

  // Count Crane Cert tasks specifically
  var craneCertCount = 0;
  for (var loc in tasksByLocation) {
    for (var t = 0; t < tasksByLocation[loc].length; t++) {
      if (tasksByLocation[loc][t].itemType === 'Crane Cert' && tasksByLocation[loc][t].type === 'Cert Expiring') {
        craneCertCount++;
      }
    }
  }

  Logger.log('collectExpiringCertTasks: Added ' + taskCount + ' expiring cert tasks from Expiring Certs sheet (including ' + craneCertCount + ' Crane Cert tasks)');

  if (duplicateCount > 0) {
    Logger.log('collectExpiringCertTasks: Skipped ' + duplicateCount + ' duplicate cert tasks');
  }

  // === CRANE EVALUATION CHECK ===
  // Special logic: Check if employees have Crane Cert but are missing Crane Evaluation
  if (selectedCertTypes.indexOf('Crane Evaluation') !== -1) {
    Logger.log('collectExpiringCertTasks: Checking for missing Crane Evaluations...');

    // Build map of employees who have each cert type
    var employeeCerts = {}; // { employeeName: { 'Crane Cert': true, 'Crane Evaluation': true, ... } }

    for (var i = 1; i < data.length; i++) {
      var row = data[i];
      var employee = String(row[empCol] || '').trim();
      var certType = String(row[certTypeCol] || '').trim();

      if (!employee || !certType) continue;

      // Skip previous employees
      if (previousEmployeeNames.has(employee.toLowerCase())) continue;

      if (!employeeCerts[employee.toLowerCase()]) {
        employeeCerts[employee.toLowerCase()] = {};
      }
      employeeCerts[employee.toLowerCase()][certType] = true;
    }

    // Check for employees with Crane Cert but no Crane Evaluation
    var missingEvalCount = 0;
    for (var empName in employeeCerts) {
      var certs = employeeCerts[empName];

      if (certs['Crane Cert'] && !certs['Crane Evaluation']) {
        // Employee has Crane Cert but is missing Crane Evaluation
        var properName = empName.charAt(0).toUpperCase() + empName.slice(1);

        // Find proper capitalization from Employees sheet
        for (var empKey in employeeLocations) {
          if (empKey.toLowerCase() === empName) {
            var employeesSheet = ss.getSheetByName('Employees');
            if (employeesSheet) {
              var empData = employeesSheet.getDataRange().getValues();
              var empHeaders = empData[0];
              var empNameCol = -1;
              for (var eh = 0; eh < empHeaders.length; eh++) {
                if (String(empHeaders[eh]).toLowerCase().trim() === 'name') {
                  empNameCol = eh;
                  break;
                }
              }
              if (empNameCol !== -1) {
                for (var ei = 1; ei < empData.length; ei++) {
                  if (String(empData[ei][empNameCol]).trim().toLowerCase() === empName) {
                    properName = String(empData[ei][empNameCol]).trim();
                    break;
                  }
                }
              }
            }
            break;
          }
        }

        var location = employeeLocations[empName] || 'Unknown';
        var foreman = employeeForemen[empName] || 'Unassigned';

        // Get phone number - try direct match first, then partial match
        var phoneNumber = employeePhones[empName] || '';
        if (!phoneNumber) {
          var nameParts = empName.split(' ');
          if (nameParts.length >= 2) {
            var firstName = nameParts[0];
            var lastName = nameParts[nameParts.length - 1];
            for (var pk in employeePhones) {
              if (pk.indexOf(firstName) !== -1 && pk.indexOf(lastName) !== -1) {
                phoneNumber = employeePhones[pk];
                break;
              }
            }
          }
        }

        var task = {
          type: 'Cert Expiring',
          itemType: 'Crane Evaluation',
          employee: properName,
          location: location,
          foreman: foreman,
          phoneNumber: phoneNumber,
          currentItem: '',
          pickListItem: '',
          size: '',
          dueDate: null,
          isOverdue: true,
          daysTillDue: -1,
          status: 'Missing',
          estimatedTime: 0,
          priority: 'High',
          sheetName: 'Expiring Certs',
          rowIndex: 0,
          isMissingCert: true
        };

        if (!tasksByLocation[location]) {
          tasksByLocation[location] = [];
        }
        tasksByLocation[location].push(task);
        missingEvalCount++;

        Logger.log('collectExpiringCertTasks: Added missing Crane Evaluation for ' + properName + ' at ' + location);
      }
    }

    Logger.log('collectExpiringCertTasks: Added ' + missingEvalCount + ' missing Crane Evaluation tasks');
    taskCount += missingEvalCount;
  }

  Logger.log('collectExpiringCertTasks: TOTAL cert tasks = ' + taskCount);

  // Post-process: Group 1st Aid and CPR certs for same employee
  // This allows sending a single notification for both certs
  for (var loc in tasksByLocation) {
    var tasks = tasksByLocation[loc];
    var certTasksByEmployee = {};

    // Group cert tasks by employee
    for (var t = 0; t < tasks.length; t++) {
      var task = tasks[t];
      if (task.type === 'Cert Expiring') {
        var empKey = task.employee.toLowerCase();
        if (!certTasksByEmployee[empKey]) {
          certTasksByEmployee[empKey] = [];
        }
        certTasksByEmployee[empKey].push(task);
      }
    }

    // For each employee with multiple cert tasks, link them via relatedCerts
    for (var empKey in certTasksByEmployee) {
      var empCertTasks = certTasksByEmployee[empKey];
      if (empCertTasks.length > 1) {
        // Check if employee has both 1st Aid and CPR type certs
        var certTypes = empCertTasks.map(function(t) { return t.itemType; });
        var has1stAid = certTypes.some(function(ct) {
          return ct.toLowerCase().indexOf('1st aid') !== -1 || ct.toLowerCase().indexOf('first aid') !== -1;
        });
        var hasCPR = certTypes.some(function(ct) {
          return ct.toLowerCase().indexOf('cpr') !== -1;
        });

        // If employee has related certs (1st Aid + CPR), add relatedCerts array to each task
        if (has1stAid && hasCPR) {
          var relatedCertInfo = empCertTasks.map(function(t) {
            return {
              certType: t.itemType,
              expirationDate: t.dueDate ? t.dueDate.toISOString() : null,
              daysTillDue: t.daysTillDue
            };
          });

          for (var rt = 0; rt < empCertTasks.length; rt++) {
            empCertTasks[rt].relatedCerts = relatedCertInfo;
            empCertTasks[rt].hasRelatedCerts = true;
          }
          Logger.log('collectExpiringCertTasks: Grouped ' + empCertTasks.length + ' related certs for ' + empCertTasks[0].employee);
        }
      }
    }
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

    // Skip trip summary entries (combined locations created by Trip Planner)
    // These have "+" in location (e.g., "Billings + Livingston") OR
    // taskType starts with "🗺️ Trip:" prefix
    if (location.indexOf(' + ') !== -1 || taskType.indexOf('🗺️ Trip:') !== -1) {
      Logger.log('collectManualTasks: Skipping row ' + (i+1) + ' - trip summary entry: ' + location);
      continue;
    }

    // Skip Safety Equipment tasks - these are now collected directly from Safety Reports sheet
    // to avoid duplicate entries (old workflow created them here via createTasksFromSafetyIssues)
    if (taskType === 'Safety Equipment' || taskType.indexOf('🔧') !== -1) {
      Logger.log('collectManualTasks: Skipping row ' + (i+1) + ' - Safety Equipment task (handled by Safety Reports)');
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
      scheduledDate: dueDate, // Manual tasks use their scheduled date directly
      isOverdue: isOverdue,
      daysTillDue: daysTillDue,
      status: status,
      estimatedTime: estimatedTime,
      priority: priority,
      startTime: startTime,
      notes: notes,
      sheetName: 'Manual Tasks',
      rowIndex: i + 1,
      isManualTask: true // Flag to identify manual tasks
    };

    // Add to location group
    if (!tasksByLocation[location]) {
      tasksByLocation[location] = [];
    }
    tasksByLocation[location].push(task);
    taskCount++;

    Logger.log('collectManualTasks: Added ' + taskType + ' task at ' + location +
               (dueDate ? ' (scheduled: ' + dueDate.toDateString() + ')' : ' (no date)') +
               ' - isManualTask: ' + task.isManualTask + ', type: ' + task.type);
  }

  Logger.log('collectManualTasks: Added ' + taskCount + ' manual tasks total');
}

/**
 * Collects safety equipment issues from the Safety Reports sheet.
 * Only includes "Needs Attention" items with valid job numbers.
 * Excludes vehicle mechanical items (brakes, wipers, etc.)
 *
 * @param {Spreadsheet} ss - Active spreadsheet
 * @param {Object} tasksByLocation - Object to add tasks to
 * @param {Object} employeeLocations - Map of employee names to locations
 * @param {Date} today - Today's date
 */
function collectSafetyReportsTasks(ss, tasksByLocation, employeeLocations, today) {
  var safetySheet = ss.getSheetByName('Safety Reports');
  if (!safetySheet || safetySheet.getLastRow() < 2) {
    Logger.log('collectSafetyReportsTasks: Safety Reports sheet not found or empty');
    return;
  }

  var data = safetySheet.getDataRange().getValues();
  var headers = data[0];

  // Get crew-to-location map for job number lookups
  var crewLocationMap = getCrewLocationMap(ss);

  // Find column indices
  var colIdx = {};
  for (var h = 0; h < headers.length; h++) {
    var header = String(headers[h]).toLowerCase().trim();
    if (header === 'report date') colIdx.reportDate = h;
    if (header === 'report type') colIdx.reportType = h;
    if (header === 'job number') colIdx.jobNumber = h;
    if (header === 'foreman') colIdx.foreman = h;
    if (header === 'vehicle number') colIdx.vehicleNumber = h;
    if (header === 'equipment type') colIdx.equipmentType = h;
    if (header === 'issue description') colIdx.issueDescription = h;
    if (header === 'status') colIdx.status = h;
    if (header === 'fe test date') colIdx.feTestDate = h;
    if (header === 'email subject') colIdx.emailSubject = h;
  }

  // Equipment types to EXCLUDE (vehicle mechanical items)
  var excludedEquipmentTypes = [
    'wipers', 'horn', 'reflectors', 'warning lights', 'brakes',
    'lights', 'mirrors', 'windshield', 'defrost', 'windows',
    'heater', 'seat belts', 'misc comment', 'tires', 'battery',
    'engine', 'oil', 'transmission', 'clutch', 'alternator',
    'starter', 'radiator', 'suspension', 'exhaust', 'fuel', 'coolant', 'filter'
  ];

  var taskCount = 0;

  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var status = String(row[colIdx.status] || '').trim();
    var jobNumber = String(row[colIdx.jobNumber] || '').trim();
    var equipmentType = String(row[colIdx.equipmentType] || '').trim();
    var foreman = String(row[colIdx.foreman] || '').trim();
    var vehicleNumber = String(row[colIdx.vehicleNumber] || '').trim();
    var issueDescription = String(row[colIdx.issueDescription] || '').trim();
    var reportDate = row[colIdx.reportDate];
    var emailSubject = colIdx.emailSubject !== undefined ? String(row[colIdx.emailSubject] || '').trim() : '';

    // Skip if not "Needs Attention"
    if (status !== 'Needs Attention') {
      continue;
    }

    // Skip if no job number (can't determine location for trip planning)
    if (!jobNumber) {
      Logger.log('collectSafetyReportsTasks: Skipping row ' + (i + 1) + ' - no job number');
      continue;
    }

    // Skip excluded equipment types (vehicle mechanical items)
    var equipLower = equipmentType.toLowerCase();
    var isExcluded = false;
    for (var e = 0; e < excludedEquipmentTypes.length; e++) {
      if (equipLower.indexOf(excludedEquipmentTypes[e]) !== -1) {
        isExcluded = true;
        break;
      }
    }
    if (isExcluded) {
      Logger.log('collectSafetyReportsTasks: Skipping row ' + (i + 1) + ' - excluded equipment type: ' + equipmentType);
      continue;
    }

    // Lookup location from job number using crew map
    // Extract base crew number (e.g., "013-26" from "013-26.1")
    var crewNumber = jobNumber.split('.')[0];
    var location = crewLocationMap[crewNumber] || jobNumber;

    // Parse report date as due date
    var dueDate = null;
    if (reportDate instanceof Date) {
      dueDate = new Date(reportDate);
      dueDate.setHours(0, 0, 0, 0);
    } else if (reportDate && typeof reportDate === 'string') {
      dueDate = new Date(reportDate);
      if (isNaN(dueDate.getTime())) {
        dueDate = new Date(); // Default to today if invalid
      }
      dueDate.setHours(0, 0, 0, 0);
    } else {
      dueDate = new Date();
      dueDate.setHours(0, 0, 0, 0);
    }

    // Calculate days until due (safety issues are immediate priority)
    var daysTillDue = Math.ceil((dueDate - today) / (1000 * 60 * 60 * 24));
    var isOverdue = daysTillDue < 0;

    // Build notes with vehicle number for persistence to Task Metadata
    var notes = '';
    if (vehicleNumber) {
      notes = 'Vehicle #' + vehicleNumber;
    }

    // Build task object
    var task = {
      type: 'Safety Equipment',
      taskType: 'Safety Equipment',
      itemType: equipmentType,
      employee: foreman, // Foreman is the point of contact
      location: location,
      foreman: foreman,
      currentItem: issueDescription,
      vehicleNumber: vehicleNumber,
      emailSubject: emailSubject,
      notes: notes,
      dueDate: dueDate,
      scheduledDate: null,
      isOverdue: isOverdue,
      daysTillDue: daysTillDue,
      status: status,
      sheetName: 'Safety Reports',
      source: 'Safety Reports',
      rowIndex: i + 1
    };

    // Add to location group
    if (!tasksByLocation[location]) {
      tasksByLocation[location] = [];
    }
    tasksByLocation[location].push(task);
    taskCount++;

    Logger.log('collectSafetyReportsTasks: Added ' + equipmentType + ' task at ' + location +
               ' (job: ' + jobNumber + ', vehicle: ' + vehicleNumber + ')');
  }

  Logger.log('collectSafetyReportsTasks: Added ' + taskCount + ' safety report tasks total');
}

/**
 * Collects Missing Safety Report tasks directly from Task Metadata.
 * These tasks are created by the compliance tracking system when crews
 * miss JHAs or Weekly Safety Meetings.
 *
 * Only includes tasks from the PREVIOUS work week (not current week, not older weeks).
 *
 * @param {Spreadsheet} ss - Active spreadsheet
 * @param {Object} tasksByLocation - Object to add tasks to
 * @param {Object} employeeLocations - Map of employee names to locations
 * @param {Object} employeeForemen - Map of employee names to foremen
 * @param {Object} employeePhones - Map of employee names to phone numbers
 * @param {Date} today - Today's date
 */
function collectMissingSafetyReportTasks(ss, tasksByLocation, employeeLocations, employeeForemen, employeePhones, today) {
  var taskMetadataSheet = ss.getSheetByName('Task Metadata');
  if (!taskMetadataSheet || taskMetadataSheet.getLastRow() < 2) {
    Logger.log('collectMissingSafetyReportTasks: Task Metadata sheet not found or empty');
    return;
  }

  var data = taskMetadataSheet.getDataRange().getValues();
  var headers = data[0];

  // Find column indices
  var colIdx = {};
  for (var h = 0; h < headers.length; h++) {
    var header = String(headers[h]).toLowerCase().trim();
    if (header === 'taskid') colIdx.taskID = h;
    if (header === 'sourcesheet') colIdx.sourceSheet = h;
    if (header === 'sourcerow') colIdx.sourceRow = h;
    if (header === 'employee') colIdx.employee = h;
    if (header === 'tasktype') colIdx.taskType = h;
    if (header === 'itemtype') colIdx.itemType = h;
    if (header === 'location') colIdx.location = h;
    if (header === 'foreman') colIdx.foreman = h;
    if (header === 'phonenumber') colIdx.phoneNumber = h;
    if (header === 'duedate') colIdx.dueDate = h;
    if (header === 'status') colIdx.status = h;
    if (header === 'notes') colIdx.notes = h;
    if (header === 'createddate') colIdx.createdDate = h;
  }

  // Calculate PREVIOUS work week boundaries
  // Only show tasks from the previous week (not current week, not older weeks)
  var dayOfWeek = today.getDay(); // 0 = Sunday
  var currentWeekStart = new Date(today);
  currentWeekStart.setDate(today.getDate() - dayOfWeek);
  currentWeekStart.setHours(0, 0, 0, 0);

  var previousWeekStart = new Date(currentWeekStart);
  previousWeekStart.setDate(currentWeekStart.getDate() - 7);

  var previousWeekEnd = new Date(currentWeekStart);
  previousWeekEnd.setDate(currentWeekStart.getDate() - 1); // Saturday
  previousWeekEnd.setHours(23, 59, 59, 999);

  Logger.log('collectMissingSafetyReportTasks: Only collecting tasks for previous week ' +
    Utilities.formatDate(previousWeekStart, Session.getScriptTimeZone(), 'MM/dd/yyyy') + ' to ' +
    Utilities.formatDate(previousWeekEnd, Session.getScriptTimeZone(), 'MM/dd/yyyy'));

  var taskCount = 0;

  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var taskType = String(row[colIdx.taskType] || '').trim();
    var status = String(row[colIdx.status] || '').trim();

    // Only collect "Missing Safety Report" tasks
    if (taskType !== 'Missing Safety Report') {
      continue;
    }

    // Skip completed tasks
    if (status === 'Complete' || status === 'Completed') {
      continue;
    }

    // Filter to only PREVIOUS work week using DueDate
    var dueDateVal = row[colIdx.dueDate];
    if (dueDateVal) {
      var taskDueDate;
      if (dueDateVal instanceof Date) {
        taskDueDate = new Date(dueDateVal);
      } else {
        taskDueDate = new Date(dueDateVal);
      }
      taskDueDate.setHours(0, 0, 0, 0);

      // Skip if not from previous week (due date should be the Saturday of that week)
      if (taskDueDate < previousWeekStart || taskDueDate > previousWeekEnd) {
        continue; // Silently skip tasks not from previous week
      }
    }

    var employee = String(row[colIdx.employee] || '').trim();
    var location = String(row[colIdx.location] || '').trim();
    var foreman = String(row[colIdx.foreman] || '').trim();
    var phoneNumber = String(row[colIdx.phoneNumber] || '').trim();
    var itemType = String(row[colIdx.itemType] || '').trim(); // "JHA", "Weekly Meeting", or "JHA + Weekly Meeting"
    var notes = String(row[colIdx.notes] || '').trim();
    var sourceSheet = String(row[colIdx.sourceSheet] || '').trim();
    var sourceRow = row[colIdx.sourceRow];

    // Parse due date
    var dueDate = null;
    var dueDateValue = row[colIdx.dueDate];
    if (dueDateValue instanceof Date) {
      dueDate = new Date(dueDateValue);
      dueDate.setHours(0, 0, 0, 0);
    } else if (dueDateValue && typeof dueDateValue === 'string') {
      dueDate = new Date(dueDateValue);
      if (isNaN(dueDate.getTime())) {
        dueDate = new Date(); // Default to today if invalid
      }
      dueDate.setHours(0, 0, 0, 0);
    } else {
      dueDate = new Date();
      dueDate.setHours(0, 0, 0, 0);
    }

    // Calculate days until due
    var daysTillDue = Math.ceil((dueDate - today) / (1000 * 60 * 60 * 24));
    var isOverdue = daysTillDue < 0;

    // Use location from metadata, fallback to employee lookup
    if (!location && employee) {
      var empKey = employee.toLowerCase();
      location = employeeLocations[empKey] || 'Unknown';
    }
    if (!location) {
      location = 'Unknown';
    }

    // Build task object
    var task = {
      employee: employee, // This is the foreman for Missing Safety Reports
      foreman: foreman,
      location: location,
      type: taskType, // "Missing Safety Report"
      taskType: taskType,
      itemType: itemType, // "JHA", "Weekly Meeting", or "JHA + Weekly Meeting"
      phoneNumber: phoneNumber,
      dueDate: dueDate,
      daysTillDue: daysTillDue,
      isOverdue: isOverdue,
      priority: isOverdue ? 'High' : 'Medium',
      estimatedTime: 0.25, // 15 minutes for a phone call
      notes: notes,
      source: sourceSheet || 'Safety Compliance',
      sheetName: sourceSheet || 'Safety Compliance',
      rowIndex: sourceRow || (i + 1)
    };

    // Add to location
    if (!tasksByLocation[location]) {
      tasksByLocation[location] = [];
    }
    tasksByLocation[location].push(task);
    taskCount++;

    Logger.log('collectMissingSafetyReportTasks: Added ' + itemType + ' task for ' + employee +
               ' at ' + location + ' (overdue: ' + isOverdue + ')');
  }

  Logger.log('collectMissingSafetyReportTasks: Added ' + taskCount + ' missing safety report tasks total');
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

/**
 * Debug what tasks are being collected for Task List
 * Shows counts by task type to identify collection issues
 */
function debugTaskListData() {
  var ui = SpreadsheetApp.getUi();
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  try {
    Logger.log('=== debugTaskListData START ===');
    var tasksByLocation = collectAndGroupTasks(ss);

    var countsByType = {};
    var totalTasks = 0;
    var sampleByType = {};

    for (var loc in tasksByLocation) {
      var tasks = tasksByLocation[loc];
      for (var i = 0; i < tasks.length; i++) {
        var task = tasks[i];
        var taskType = task.type || task.taskType || 'Unknown';
        countsByType[taskType] = (countsByType[taskType] || 0) + 1;
        totalTasks++;

        if (!sampleByType[taskType]) {
          sampleByType[taskType] = {
            employee: task.employee,
            location: loc,
            status: task.status
          };
        }
      }
    }

    var message = '=== Task Collection Debug ===\n\n';
    message += 'Total: ' + totalTasks + ' tasks\n';
    message += 'Locations: ' + Object.keys(tasksByLocation).length + '\n\n';
    message += 'By Type:\n';

    var types = Object.keys(countsByType).sort();
    for (var t = 0; t < types.length; t++) {
      var typ = types[t];
      var sample = sampleByType[typ];
      message += '  ' + typ + ': ' + countsByType[typ];
      if (sample) {
        message += ' (e.g. ' + sample.employee + ')';
      }
      message += '\n';
    }

    Logger.log(message);
    ui.alert('Task List Debug', message, ui.ButtonSet.OK);

  } catch (e) {
    ui.alert('Error', 'Debug error: ' + e.toString(), ui.ButtonSet.OK);
    Logger.log('debugTaskListData error: ' + e.toString());
  }
}

/**
 * Debug: Compare Task Metadata vs collectAndGroupTasks
 * Shows discrepancy between stored metadata and live collection
 */
function debugMetadataVsCollection() {
  var ui = SpreadsheetApp.getUi();
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  try {
    // Count from Task Metadata
    var metadataSheet = ss.getSheetByName('Task Metadata');
    var metadataCount = 0;
    var metadataByType = {};

    if (metadataSheet && metadataSheet.getLastRow() > 1) {
      var metaData = metadataSheet.getDataRange().getValues();
      var headers = metaData[0];
      var taskTypeCol = -1;
      var statusCol = -1;

      for (var h = 0; h < headers.length; h++) {
        if (headers[h] === 'TaskType') taskTypeCol = h;
        if (headers[h] === 'Status') statusCol = h;
      }

      for (var i = 1; i < metaData.length; i++) {
        var taskType = metaData[i][taskTypeCol] || 'Unknown';
        var status = metaData[i][statusCol] || '';

        if (status !== 'Complete') {
          metadataCount++;
          metadataByType[taskType] = (metadataByType[taskType] || 0) + 1;
        }
      }
    }

    // Count from collectAndGroupTasks
    var tasksByLocation = collectAndGroupTasks(ss);
    var collectedCount = 0;
    var collectedByType = {};

    for (var loc in tasksByLocation) {
      var tasks = tasksByLocation[loc];
      for (var t = 0; t < tasks.length; t++) {
        var task = tasks[t];
        var type = task.type || task.taskType || 'Unknown';
        collectedCount++;
        collectedByType[type] = (collectedByType[type] || 0) + 1;
      }
    }

    var message = '=== Metadata vs Collection Comparison ===\n\n';
    message += 'TASK METADATA (stored): ' + metadataCount + ' non-completed tasks\n';
    for (var mt in metadataByType) {
      message += '  ' + mt + ': ' + metadataByType[mt] + '\n';
    }

    message += '\ncollectAndGroupTasks (live): ' + collectedCount + ' tasks\n';
    for (var ct in collectedByType) {
      message += '  ' + ct + ': ' + collectedByType[ct] + '\n';
    }

    message += '\n=== DISCREPANCIES ===\n';
    var allTypes = {};
    for (var k1 in metadataByType) allTypes[k1] = true;
    for (var k2 in collectedByType) allTypes[k2] = true;

    var hasDiscrepancy = false;
    for (var typ in allTypes) {
      var inMeta = metadataByType[typ] || 0;
      var inColl = collectedByType[typ] || 0;
      if (inMeta !== inColl) {
        hasDiscrepancy = true;
        message += typ + ': Metadata=' + inMeta + ', Collected=' + inColl;
        if (inMeta > inColl) {
          message += ' ⚠️ Missing ' + (inMeta - inColl) + ' from collection!\n';
        } else {
          message += ' ⚠️ Extra ' + (inColl - inMeta) + ' in collection!\n';
        }
      }
    }

    if (!hasDiscrepancy) {
      message += 'None - counts match!\n';
    }

    Logger.log(message);
    ui.alert('Metadata vs Collection Debug', message, ui.ButtonSet.OK);

  } catch (e) {
    ui.alert('Error', 'Debug error: ' + e.toString(), ui.ButtonSet.OK);
    Logger.log('debugMetadataVsCollection error: ' + e.toString());
  }
}

/**
 * Debug Training Tasks specifically - shows why training tasks may not be collected
 */
function debugTrainingTasks() {
  var ui = SpreadsheetApp.getUi();
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  try {
    var trainingSheet = ss.getSheetByName('Training Tracking');
    if (!trainingSheet || trainingSheet.getLastRow() < 3) {
      ui.alert('Training Tracking sheet not found or empty');
      return;
    }

    var data = trainingSheet.getDataRange().getValues();
    var today = new Date();
    var currentMonth = today.getMonth();
    var monthNames = ['January','February','March','April','May','June',
                      'July','August','September','October','November','December'];

    // Check trainingCrews filter
    var props = PropertiesService.getScriptProperties();
    var crewsJson = props.getProperty('trainingCrews');
    var selectedCrews = null;
    if (crewsJson) {
      try { selectedCrews = JSON.parse(crewsJson); } catch(e) {}
    }

    var monthNumbers = {
      'january': 0, 'february': 1, 'march': 2, 'april': 3,
      'may': 4, 'june': 5, 'july': 6, 'august': 7,
      'september': 8, 'october': 9, 'november': 10, 'december': 11
    };

    var pending = 0, complete = 0, na = 0, filteredByCrew = 0, noLead = 0, futureMonth = 0;
    var pendingList = [];
    var filteredCrewsList = [];

    // Column indices based on Training Tracking structure
    var monthCol = 0;      // A: Month
    var crewCol = 2;       // C: Crew #
    var leadCol = 3;       // D: Crew Lead
    var dateCol = 5;       // F: Completion Date
    var statusCol = 8;     // I: Status (0-indexed)

    for (var i = 2; i < data.length; i++) {
      var month = String(data[i][monthCol]).trim().toLowerCase();
      var crew = String(data[i][crewCol]).trim();
      var lead = String(data[i][leadCol]).trim();
      var status = String(data[i][statusCol]).trim();
      var completionDate = data[i][dateCol];

      if (!crew) continue;

      var monthNum = monthNumbers[month];

      // Skip future months beyond next month
      if (monthNum !== undefined && monthNum > currentMonth + 1) {
        futureMonth++;
        continue;
      }

      // Skip past months (before current month)
      if (monthNum !== undefined && monthNum < currentMonth) {
        continue; // Don't count as future, just skip silently
      }

      if (status === 'Complete' || (completionDate && completionDate instanceof Date)) {
        complete++;
      } else if (status === 'N/A') {
        na++;
      } else if (selectedCrews && selectedCrews.length > 0 && selectedCrews.indexOf(crew) === -1) {
        filteredByCrew++;
        if (filteredCrewsList.indexOf(crew) === -1) {
          filteredCrewsList.push(crew);
        }
      } else if (!lead) {
        noLead++;
      } else {
        pending++;
        if (pendingList.length < 5) {
          pendingList.push('Row ' + (i+1) + ': ' + crew + ' - ' + lead);
        }
      }
    }

    var message = '=== Training Debug ===\n\n';
    message += 'Current Month: ' + monthNames[currentMonth] + '\n';
    message += 'Crew Filter: ' + (selectedCrews ? (selectedCrews.length + ' crews: ' + selectedCrews.slice(0,3).join(', ') + (selectedCrews.length > 3 ? '...' : '')) : 'ALL crews (no filter)') + '\n\n';
    message += 'Current + Next Month Results:\n';
    message += '  ✅ PENDING (should show): ' + pending + '\n';
    message += '  ✓ Complete: ' + complete + '\n';
    message += '  - N/A: ' + na + '\n';
    message += '  ⚠️ Filtered by crew: ' + filteredByCrew + '\n';
    message += '  ❌ No crew lead: ' + noLead + '\n';
    message += '  ⏭️ Future month: ' + futureMonth + '\n';

    if (pendingList.length > 0) {
      message += '\nPending examples:\n';
      for (var p = 0; p < pendingList.length; p++) {
        message += '  • ' + pendingList[p] + '\n';
      }
    }

    if (filteredByCrew > 0) {
      message += '\n⚠️ WARNING: ' + filteredByCrew + ' tasks filtered out!\n';
      message += 'Crews excluded: ' + filteredCrewsList.slice(0,5).join(', ');
      if (filteredCrewsList.length > 5) message += '...';
      message += '\n\nRun "Clear Training Filter" to include all crews.';
    }

    if (pending === 0 && filteredByCrew === 0) {
      message += '\n\n❓ No pending tasks found. Check:\n';
      message += '1. Status column (J) values\n';
      message += '2. Completion Date column (F)\n';
      message += '3. Crew Lead column (D)';
    }

    Logger.log(message);
    ui.alert('Training Debug', message, ui.ButtonSet.OK);

  } catch (e) {
    ui.alert('Error', e.toString(), ui.ButtonSet.OK);
    Logger.log('debugTrainingTasks error: ' + e);
  }
}

/**
 * Clear the training crews filter to show all crews
 */
function clearTrainingCrewsFilter() {
  PropertiesService.getScriptProperties().deleteProperty('trainingCrews');
  SpreadsheetApp.getUi().alert('✅ Training Filter Cleared',
    'The training crews filter has been removed.\n\nAll crews will now be included in training task collection.\n\nPlease run "Generate Task Metadata" to update tasks.',
    SpreadsheetApp.getUi().ButtonSet.OK);
}

