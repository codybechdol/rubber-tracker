/**
 * Glove Manager – Employee History Tracking
 *
 * Functions for tracking employee changes and history.
 * Manages terminations, rehires, location changes, and archiving.
 */

/**
 * Standardized event types for Employee History entries.
 * Use these constants instead of raw strings to ensure consistency.
 */
var EMPLOYEE_EVENT_TYPES = {
  TERMINATED: 'Terminated',
  REHIRED: 'Rehired',
  NEW_EMPLOYEE: 'New Employee',
  NEW_EMPLOYEE_IMPORT: 'New Employee (Import)',
  NAME_CORRECTED: 'Name Corrected',
  LOCATION_CHANGE: 'Location Change',
  JOB_NUMBER_CHANGE: 'Job Number Change',
  HIRE_DATE_CHANGE: 'Hire Date Change',
  CURRENT_STATE: 'Current State',
  MULTIPLE_CHANGES: 'Multiple Changes'
};

/**
 * Validates that a date has a reasonable year (between minYear and maxYear).
 * Returns null if the date is invalid or has an unrealistic year.
 *
 * This catches issues like:
 * - Year 46050 (caused by serial number being interpreted as year)
 * - Year 25 (2-digit year interpreted as 25 AD)
 * - Year 1899/1900 (Excel epoch dates)
 *
 * @param {Date|string|number} dateValue - The date value to validate
 * @param {number} minYear - Minimum valid year (default: 1950)
 * @param {number} maxYear - Maximum valid year (default: 2100)
 * @return {Date|null} Valid Date object or null if invalid/unrealistic
 */
function validateDateYear(dateValue, minYear, maxYear) {
  minYear = minYear || 1950;
  maxYear = maxYear || 2100;

  if (!dateValue) return null;

  var dateObj = null;

  if (dateValue instanceof Date) {
    dateObj = dateValue;
  } else {
    // Try to parse the date
    dateObj = new Date(dateValue);
  }

  // Check if valid date
  if (!dateObj || isNaN(dateObj.getTime())) {
    return null;
  }

  // Check year is reasonable
  var year = dateObj.getFullYear();
  if (year < minYear || year > maxYear) {
    Logger.log('[WARNING] validateDateYear: Unrealistic year ' + year +
               ' detected (valid range: ' + minYear + '-' + maxYear + '). ' +
               'Original value: ' + dateValue);
    return null;
  }

  return dateObj;
}

/**
 * Checks if a duplicate Employee History entry already exists.
 * Matches on employee name (case-insensitive), event type, and date.
 *
 * @param {Sheet} historySheet - The Employee History sheet
 * @param {string} employeeName - Employee's name
 * @param {string} eventType - Event type (e.g., 'Terminated', 'Rehired')
 * @param {string} dateStr - Date string (MM/dd/yyyy format)
 * @return {boolean} True if duplicate exists, false otherwise
 */
function isDuplicateEmployeeHistoryEntry(historySheet, employeeName, eventType, dateStr) {
  if (!historySheet || historySheet.getLastRow() <= 2) return false;

  var data = historySheet.getRange(3, 1, historySheet.getLastRow() - 2, 3).getDisplayValues();
  var empNameLower = String(employeeName).toLowerCase().trim();
  var eventTypeLower = String(eventType).toLowerCase().trim();
  var dateStrNorm = String(dateStr).trim();

  for (var i = 0; i < data.length; i++) {
    var rowDate = String(data[i][0]).trim();
    var rowName = String(data[i][1]).toLowerCase().trim();
    var rowEvent = String(data[i][2]).toLowerCase().trim();

    if (rowName === empNameLower && rowEvent === eventTypeLower && rowDate === dateStrNorm) {
      return true;
    }
  }

  return false;
}

/**
 * Cleans up duplicate entries in Employee History.
 * Keeps the most recent entry (last occurrence) for each employee+event+date combo.
 * Can be run from menu: Utilities > Clean Up Duplicate History Entries
 *
 * @return {number} Number of duplicates removed
 */
function cleanupDuplicateEmployeeHistoryEntries() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var historySheet = ss.getSheetByName('Employee History');

  if (!historySheet || historySheet.getLastRow() <= 2) {
    Logger.log('No Employee History data to clean up');
    return 0;
  }

  var lastRow = historySheet.getLastRow();
  var data = historySheet.getRange(3, 1, lastRow - 2, historySheet.getLastColumn()).getDisplayValues();

  // Track seen entries and rows to delete
  var seen = {};
  var rowsToDelete = [];

  // Process from bottom to top to keep the LAST (most recent) occurrence
  for (var i = data.length - 1; i >= 0; i--) {
    var date = String(data[i][0]).trim();
    var name = String(data[i][1]).toLowerCase().trim();
    var eventType = String(data[i][2]).toLowerCase().trim();

    // Skip empty rows
    if (!name) continue;

    var key = name + '|' + eventType + '|' + date;

    if (seen[key]) {
      // This is a duplicate (earlier occurrence) - mark for deletion
      rowsToDelete.push(i + 3);  // +3 because data starts at row 3
    } else {
      seen[key] = true;
    }
  }

  // Delete rows from bottom to top to preserve row numbers
  rowsToDelete.sort(function(a, b) { return b - a; });
  for (var d = 0; d < rowsToDelete.length; d++) {
    historySheet.deleteRow(rowsToDelete[d]);
  }

  if (rowsToDelete.length > 0) {
    Logger.log('Removed ' + rowsToDelete.length + ' duplicate Employee History entries');
    SpreadsheetApp.getActiveSpreadsheet().toast(
      'Removed ' + rowsToDelete.length + ' duplicate entries from Employee History',
      '🧹 Cleanup Complete', 5
    );
  }

  return rowsToDelete.length;
}

/**
 * Logs a name correction to Employee History.
 * Called when an employee's name is updated during Excel import.
 *
 * @param {string} oldName - The old/incorrect name
 * @param {string} newName - The new/corrected name
 * @param {string} location - Employee's location (optional)
 * @param {string} jobNumber - Employee's job number (optional)
 * @return {boolean} Success status
 */
function logNameCorrection(oldName, newName, location, jobNumber) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var historySheet = ss.getSheetByName('Employee History');

    if (!historySheet) {
      Logger.log('logNameCorrection: Employee History sheet not found');
      return false;
    }

    var today = new Date();
    var todayStr = Utilities.formatDate(today, ss.getSpreadsheetTimeZone(), 'MM/dd/yyyy');

    // Check for duplicate entry
    if (isDuplicateEmployeeHistoryEntry(historySheet, newName, EMPLOYEE_EVENT_TYPES.NAME_CORRECTED, todayStr)) {
      Logger.log('logNameCorrection: Duplicate entry exists for ' + newName);
      return true; // Not an error, just skip
    }

    var historyRow = [
      todayStr,                              // Date
      newName,                               // Employee Name (new/corrected)
      EMPLOYEE_EVENT_TYPES.NAME_CORRECTED,   // Event Type
      location || '',                        // Location
      jobNumber || '',                       // Job Number
      '',                                    // Hire Date
      '',                                    // Last Day
      '',                                    // Last Day Reason
      '',                                    // Rehire Date
      'Name corrected from: ' + oldName,     // Notes
      '',                                    // Phone Number
      '',                                    // Email Address
      '',                                    // Glove Size
      ''                                     // Sleeve Size
    ];

    historySheet.appendRow(historyRow);
    Logger.log('logNameCorrection: Logged name change from "' + oldName + '" to "' + newName + '"');
    return true;

  } catch (e) {
    Logger.log('logNameCorrection ERROR: ' + e.toString());
    return false;
  }
}

/**
 * Logs a new employee added during Excel import to Employee History.
 *
 * @param {Object} empData - Employee data object
 * @param {string} empData.name - Employee name
 * @param {string} empData.class - Employee class
 * @param {string} empData.location - Employee location
 * @param {string} empData.jobNum - Job number (optional)
 * @param {string} empData.phone - Phone number (optional)
 * @param {string} empData.email - Email address (optional)
 * @param {string} empData.gloveSize - Glove size (optional)
 * @param {string} empData.sleeveSize - Sleeve size (optional)
 * @param {string} empData.hireDate - Hire date (optional)
 * @return {boolean} Success status
 */
function logNewEmployeeFromImport(empData) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var historySheet = ss.getSheetByName('Employee History');

    if (!historySheet) {
      Logger.log('logNewEmployeeFromImport: Employee History sheet not found');
      return false;
    }

    var today = new Date();
    var todayStr = Utilities.formatDate(today, ss.getSpreadsheetTimeZone(), 'MM/dd/yyyy');

    // Format hire date if provided
    var hireDateStr = '';
    if (empData.hireDate) {
      if (empData.hireDate instanceof Date) {
        hireDateStr = Utilities.formatDate(empData.hireDate, ss.getSpreadsheetTimeZone(), 'MM/dd/yyyy');
      } else {
        var hDate = new Date(empData.hireDate);
        if (!isNaN(hDate.getTime())) {
          hireDateStr = Utilities.formatDate(hDate, ss.getSpreadsheetTimeZone(), 'MM/dd/yyyy');
        }
      }
    }

    // Check for duplicate entry
    if (isDuplicateEmployeeHistoryEntry(historySheet, empData.name, EMPLOYEE_EVENT_TYPES.NEW_EMPLOYEE_IMPORT, todayStr)) {
      Logger.log('logNewEmployeeFromImport: Duplicate entry exists for ' + empData.name);
      return true; // Not an error, just skip
    }

    var historyRow = [
      todayStr,                                   // Date
      empData.name,                               // Employee Name
      EMPLOYEE_EVENT_TYPES.NEW_EMPLOYEE_IMPORT,   // Event Type
      empData.location || '',                     // Location
      empData.jobNum || '',                       // Job Number
      hireDateStr,                                // Hire Date
      '',                                         // Last Day
      '',                                         // Last Day Reason
      '',                                         // Rehire Date
      'Added via Excel certification import',    // Notes
      empData.phone || '',                        // Phone Number
      empData.email || '',                        // Email Address
      empData.gloveSize || '',                    // Glove Size
      empData.sleeveSize || ''                    // Sleeve Size
    ];

    historySheet.appendRow(historyRow);
    Logger.log('logNewEmployeeFromImport: Logged new employee "' + empData.name + '"');
    return true;

  } catch (e) {
    Logger.log('logNewEmployeeFromImport ERROR: ' + e.toString());
    return false;
  }
}

/**
 * Handles Last Day changes in the Employees sheet.
 * When Last Day is entered:
 * 1. Adds "Terminated" entry to Employee History
 * 2. Updates Location to "Previous Employee"
 * 3. Deletes employee from Employees sheet
 *
 * @param {Spreadsheet} ss - The active spreadsheet
 * @param {Sheet} sheet - The Employees sheet
 * @param {number} editedRow - Row number that was edited
 * @param {*} newValue - The Last Day value
 */
/**
 * Handles Last Day Reason changes in the Employees sheet.
 * Triggered when user selects a reason (Quit, Fired, Layoff, Resigned).
 *
 * When Last Day Reason is selected:
 * 1. Validates that Last Day date is filled in
 * 2. Shows confirmation popup
 * 3. Adds "Terminated" entry to Employee History
 * 4. Removes employee from Employees sheet
 *
 * @param {Spreadsheet} ss - The active spreadsheet
 * @param {Sheet} sheet - The Employees sheet
 * @param {number} editedRow - Row number that was edited
 * @param {*} newValue - The Last Day Reason value selected
 */
function handleLastDayReasonChange(ss, sheet, editedRow, newValue) {
  if (!newValue || newValue === '') return;

  // Get script lock to prevent duplicate execution from multiple triggers
  var lock = LockService.getScriptLock();
  var lockAcquired = false;

  try {
    // Try to acquire lock - if already locked, another process is handling this
    try {
      lock.waitLock(1000); // Wait up to 1 second
      lockAcquired = true;
    } catch (lockErr) {
      Logger.log('handleLastDayReasonChange: Could not acquire lock for row ' + editedRow + ' - likely duplicate trigger. Skipping.');
      return;
    }

    var ui = SpreadsheetApp.getUi();
    var empData = sheet.getRange(editedRow, 1, 1, sheet.getLastColumn()).getValues()[0];
    var empHeaders = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];

    var nameColIdx = 0;
    var locationColIdx = -1;
    var jobNumberColIdx = -1;
    var lastDayReasonColIdx = -1;
    var hireDateColIdx = -1;
    var lastDayColIdx = -1;
    var phoneNumberColIdx = -1;
    var emailAddressColIdx = -1;
    var gloveSizeColIdx = -1;
    var sleeveSizeColIdx = -1;

    for (var h = 0; h < empHeaders.length; h++) {
      var header = String(empHeaders[h]).toLowerCase().trim();
      if (header === 'location') locationColIdx = h;
      if (header === 'job number') jobNumberColIdx = h;
      if (header === 'hire date') hireDateColIdx = h;
      if (header === 'last day') lastDayColIdx = h;
      if (header === 'last day reason') lastDayReasonColIdx = h;
      // Match various phone column header formats
      if (header === 'phone number' || header === 'phone' || header === 'phone #' || header === 'cell' || header === 'cell phone') phoneNumberColIdx = h;
      if (header === 'email address') emailAddressColIdx = h;
      if (header === 'glove size') gloveSizeColIdx = h;
      if (header === 'sleeve size') sleeveSizeColIdx = h;
    }

    // Use COLS constants as fallback if headers don't match
    // COLS.EMPLOYEES.LOCATION = 3 (column C, 0-based index 2)
    // COLS.EMPLOYEES.JOB_NUMBER = 4 (column D, 0-based index 3)
    // COLS.EMPLOYEES.PHONE = 5 (column E, 0-based index 4)
    if (locationColIdx === -1) locationColIdx = 2;
    if (jobNumberColIdx === -1) jobNumberColIdx = 3;
    if (phoneNumberColIdx === -1) phoneNumberColIdx = 4;

    var empName = empData[nameColIdx] || '';
    var location = locationColIdx !== -1 ? empData[locationColIdx] : '';
    var jobNumber = jobNumberColIdx !== -1 ? empData[jobNumberColIdx] : '';
    var lastDay = lastDayColIdx !== -1 ? empData[lastDayColIdx] : '';
    var lastDayReason = newValue;
    var hireDate = hireDateColIdx !== -1 ? empData[hireDateColIdx] : '';
    var phoneNumber = phoneNumberColIdx !== -1 ? empData[phoneNumberColIdx] : '';
    var emailAddress = emailAddressColIdx !== -1 ? empData[emailAddressColIdx] : '';
    var gloveSize = gloveSizeColIdx !== -1 ? empData[gloveSizeColIdx] : '';
    var sleeveSize = sleeveSizeColIdx !== -1 ? empData[sleeveSizeColIdx] : '';

    // Validate that Last Day Reason is one of the allowed values
    var validReasons = ['Quit', 'Fired', 'Layoff', 'Resigned'];
    if (validReasons.indexOf(lastDayReason) === -1) {
      // Not a termination reason - ignore (might be clearing the field or invalid value)
      return; // Lock released in finally block
    }

    // Validate that Last Day date is filled in
    if (!lastDay || lastDay === '') {
      ui.alert(
        '⚠️ Missing Last Day Date',
        'Please fill in the "Last Day" date for "' + empName + '" before selecting a reason.\n\n' +
        'Fill in the "Last Day" column first, then select the reason.',
        ui.ButtonSet.OK
      );
      // Clear the Last Day Reason cell
      if (lastDayReasonColIdx !== -1) {
        sheet.getRange(editedRow, lastDayReasonColIdx + 1).setValue('');
      }
      return; // Lock released in finally block
    }

    // Show confirmation dialog before proceeding
    var response = ui.alert(
      '⚠️ Confirm Employee Termination',
      'Remove "' + empName + '" from the Employees sheet?\n\n' +
      'This action will:\n' +
      '• REMOVE the employee from the Employees sheet\n' +
      '• ADD them to the Employee History sheet as a Previous Employee\n\n' +
      'Last Day: ' + lastDay + '\n' +
      'Reason: ' + lastDayReason + '\n\n' +
      'Click YES to proceed or NO to cancel.',
      ui.ButtonSet.YES_NO
    );

    if (response !== ui.Button.YES) {
      // User cancelled - clear the Last Day Reason cell
      if (lastDayReasonColIdx !== -1) {
        sheet.getRange(editedRow, lastDayReasonColIdx + 1).setValue('');
      }
      ss.toast('Termination cancelled. Last Day Reason cleared.', '❌ Cancelled', 3);
      return; // Lock released in finally block
    }

    // Format Last Day date with validation
    var lastDayStr = '';
    var lastDayDateObj = null;

    if (lastDay instanceof Date) {
      lastDayDateObj = lastDay;
    } else if (lastDay) {
      // Try to parse the date
      var lastDayDate = new Date(lastDay);
      if (!isNaN(lastDayDate.getTime())) {
        lastDayDateObj = lastDayDate;
      }
    }

    // Validate year is reasonable (between 2000 and 2100)
    if (lastDayDateObj) {
      var year = lastDayDateObj.getFullYear();
      if (year < 2000 || year > 2100) {
        // Log the error and use current date as fallback
        Logger.log('[WARNING] handleLastDayReasonChange: Invalid year ' + year + ' detected for Last Day date. Original value: ' + lastDay + '. Using current date instead.');
        lastDayDateObj = new Date();
        ss.toast('⚠️ Invalid Last Day date detected (year: ' + year + '). Using today\'s date.', 'Date Warning', 5);
      }
      lastDayStr = Utilities.formatDate(lastDayDateObj, ss.getSpreadsheetTimeZone(), 'MM/dd/yyyy');
    } else {
      // Fallback to string if date parsing failed completely
      lastDayStr = String(lastDay || '');
      Logger.log('[WARNING] handleLastDayReasonChange: Could not parse Last Day date: ' + lastDay);
    }

    var hireDateStr = '';
    if (hireDate) {
      var hireDateObj = null;
      if (hireDate instanceof Date) {
        hireDateObj = hireDate;
      } else {
        var hDate = new Date(hireDate);
        if (!isNaN(hDate.getTime())) {
          hireDateObj = hDate;
        }
      }

      // Validate year is reasonable (between 1950 and 2100)
      if (hireDateObj) {
        var hireYear = hireDateObj.getFullYear();
        if (hireYear < 1950 || hireYear > 2100) {
          Logger.log('[WARNING] handleLastDayReasonChange: Invalid hire year ' + hireYear + ' detected. Original value: ' + hireDate);
          hireDateStr = '';  // Don't use invalid dates
        } else {
          hireDateStr = Utilities.formatDate(hireDateObj, ss.getSpreadsheetTimeZone(), 'MM/dd/yyyy');
        }
      }
    }

    var historySheet = ss.getSheetByName('Employee History');
    if (!historySheet) {
      historySheet = ss.insertSheet('Employee History');
      setupEmployeeHistorySheet(historySheet);
    }

    // Check for duplicate before adding
    if (!isDuplicateEmployeeHistoryEntry(historySheet, empName, EMPLOYEE_EVENT_TYPES.TERMINATED, lastDayStr)) {
      var historyRow = [
        lastDayStr,                        // Date
        empName,                           // Employee Name
        EMPLOYEE_EVENT_TYPES.TERMINATED,   // Event Type
        'Previous Employee',               // Location (set to Previous Employee)
        '',                                // Job Number (cleared)
        hireDateStr,                       // Hire Date
        lastDayStr,                        // Last Day
        lastDayReason,                     // Last Day Reason
        '',                                // Rehire Date
        'Previous Location: ' + location + ', Job #: ' + jobNumber,  // Notes
        phoneNumber,                       // Phone Number
        emailAddress,                      // Email Address
        gloveSize,                         // Glove Size
        sleeveSize                         // Sleeve Size
      ];
      historySheet.appendRow(historyRow);
      Logger.log('Added terminated employee "' + empName + '" to Employee History');
    } else {
      Logger.log('Skipped duplicate Terminated entry for ' + empName);
    }

    // Delete the employee row from Employees sheet
    // First verify the row still contains this employee (in case of race condition)
    var currentName = sheet.getRange(editedRow, 1).getValue();
    if (String(currentName).trim() === String(empName).trim()) {
      sheet.deleteRow(editedRow);
      Logger.log('Employee "' + empName + '" row deleted from Employees sheet');
      ss.toast('Employee "' + empName + '" removed from Employees sheet and added to Employee History.', '✅ Terminated', 5);
    } else {
      Logger.log('Row ' + editedRow + ' no longer contains "' + empName + '" - row may have already been deleted. Current: "' + currentName + '"');
      ss.toast('Employee "' + empName + '" added to history. Row may have already been removed.', '⚠️ Check', 5);
    }

  } catch (e) {
    Logger.log('[ERROR] handleLastDayReasonChange: ' + e);
  } finally {
    // Always release the lock
    if (lockAcquired) {
      try {
        lock.releaseLock();
      } catch (releaseErr) {
        Logger.log('handleLastDayReasonChange: Error releasing lock: ' + releaseErr);
      }
    }
  }
}

/**
 * DEPRECATED: handleLastDayChange - No longer used
 * Kept for reference. The trigger now fires on Last Day Reason, not Last Day.
 * See handleLastDayReasonChange() above.
 */
function handleLastDayChange(ss, sheet, editedRow, newValue) {
  // This function is no longer called - trigger moved to Last Day Reason column
  Logger.log('handleLastDayChange called but deprecated - use handleLastDayReasonChange');
}

/**
 * Handles Rehire Date changes in the Employee History sheet.
 * When a Rehire Date is entered for a terminated employee:
 * 1. Prompts for new Location and Job Number
 * 2. Creates new row on Employees sheet
 * 3. Adds a "Rehired" entry to Employee History
 *
 * @param {Spreadsheet} ss - The active spreadsheet
 * @param {Sheet} sheet - The Employee History sheet
 * @param {number} editedRow - Row number that was edited
 * @param {*} newValue - The Rehire Date value
 */
function handleRehireDateChange(ss, sheet, editedRow, newValue) {
  if (!newValue || newValue === '') return;

  try {
    var ui = SpreadsheetApp.getUi();
    var histHeaders = sheet.getRange(2, 1, 1, sheet.getLastColumn()).getValues()[0];
    var histData = sheet.getRange(editedRow, 1, 1, sheet.getLastColumn()).getValues()[0];

    var dateColIdx = 0;
    var nameColIdx = 1;
    var eventTypeColIdx = 2;
    var locationColIdx = 3;
    var jobNumberColIdx = 4;
    var hireDateColIdx = 5;
    var rehireDateColIdx = 8;

    for (var h = 0; h < histHeaders.length; h++) {
      var header = String(histHeaders[h]).toLowerCase().trim();
      if (header === 'date') dateColIdx = h;
      if (header === 'employee name') nameColIdx = h;
      if (header === 'event type') eventTypeColIdx = h;
      if (header === 'rehire date') rehireDateColIdx = h;
      if (header === 'hire date') hireDateColIdx = h;
    }

    var empName = histData[nameColIdx] || '';
    var eventType = (histData[eventTypeColIdx] || '').toString().trim();
    var originalHireDate = histData[hireDateColIdx] || '';

    if (eventType !== 'Terminated') {
      ui.alert('⚠️ Cannot Rehire', 'Rehire Date can only be added to Terminated employee entries.', ui.ButtonSet.OK);
      sheet.getRange(editedRow, rehireDateColIdx + 1).setValue('');
      return;
    }

    var employeesSheet = ss.getSheetByName('Employees');
    if (employeesSheet) {
      var empSheetData = employeesSheet.getDataRange().getValues();
      for (var i = 1; i < empSheetData.length; i++) {
        var existingName = (empSheetData[i][0] || '').toString().trim().toLowerCase();
        if (existingName === empName.toLowerCase()) {
          ui.alert('⚠️ Employee Already Active',
            'An employee named "' + empName + '" already exists on the Employees sheet.',
            ui.ButtonSet.OK);
          sheet.getRange(editedRow, rehireDateColIdx + 1).setValue('');
          return;
        }
      }
    }

    var rehireDateStr = '';
    if (newValue instanceof Date) {
      rehireDateStr = Utilities.formatDate(newValue, ss.getSpreadsheetTimeZone(), 'MM/dd/yyyy');
    } else {
      var rehireDate = new Date(newValue);
      if (!isNaN(rehireDate.getTime())) {
        rehireDateStr = Utilities.formatDate(rehireDate, ss.getSpreadsheetTimeZone(), 'MM/dd/yyyy');
      } else {
        rehireDateStr = String(newValue);
      }
    }

    var locationResponse = ui.prompt(
      '📍 Enter New Location',
      'Employee: ' + empName + '\nRehire Date: ' + rehireDateStr + '\n\nEnter the new work location:',
      ui.ButtonSet.OK_CANCEL
    );

    if (locationResponse.getSelectedButton() !== ui.Button.OK) {
      sheet.getRange(editedRow, rehireDateColIdx + 1).setValue('');
      return;
    }

    var newLocation = locationResponse.getResponseText().trim();
    if (!newLocation) {
      ui.alert('❌ Error', 'Location is required. Rehire cancelled.', ui.ButtonSet.OK);
      sheet.getRange(editedRow, rehireDateColIdx + 1).setValue('');
      return;
    }

    var jobNumberResponse = ui.prompt(
      '🔢 Enter Job Number',
      'Employee: ' + empName + '\nLocation: ' + newLocation + '\n\nEnter the job number (or leave blank):',
      ui.ButtonSet.OK_CANCEL
    );

    if (jobNumberResponse.getSelectedButton() !== ui.Button.OK) {
      sheet.getRange(editedRow, rehireDateColIdx + 1).setValue('');
      return;
    }

    var newJobNumber = jobNumberResponse.getResponseText().trim();

    // Prompt for Job Classification
    var jobClassificationResponse = ui.prompt(
      '👷 Enter Job Classification',
      'Employee: ' + empName + '\nLocation: ' + newLocation + '\nJob Number: ' + (newJobNumber || 'N/A') + '\n\nEnter the job classification (or leave blank):',
      ui.ButtonSet.OK_CANCEL
    );

    if (jobClassificationResponse.getSelectedButton() !== ui.Button.OK) {
      sheet.getRange(editedRow, rehireDateColIdx + 1).setValue('');
      return;
    }

    var newJobClassification = jobClassificationResponse.getResponseText().trim();

    if (!employeesSheet) {
      employeesSheet = ss.insertSheet('Employees');
    }

    var empHeaders = employeesSheet.getRange(1, 1, 1, employeesSheet.getLastColumn()).getValues()[0];
    var empNameColIdx = 0;
    var empLocationColIdx = -1;
    var empJobNumberColIdx = -1;
    var empHireDateColIdx = -1;
    var empJobClassificationColIdx = -1;

    for (var eh = 0; eh < empHeaders.length; eh++) {
      var empHeader = String(empHeaders[eh]).toLowerCase().trim();
      if (empHeader === 'location') empLocationColIdx = eh;
      if (empHeader === 'job number') empJobNumberColIdx = eh;
      if (empHeader === 'hire date') empHireDateColIdx = eh;
      if (empHeader === 'job classification') empJobClassificationColIdx = eh;
    }

    var newEmpRow = [];
    for (var c = 0; c < empHeaders.length; c++) {
      newEmpRow.push('');
    }

    newEmpRow[empNameColIdx] = empName;
    if (empLocationColIdx !== -1) newEmpRow[empLocationColIdx] = newLocation;
    if (empJobNumberColIdx !== -1) {
      var baseJobNumber = String(newJobNumber || '').trim();
      var dotIdx = baseJobNumber.lastIndexOf('.');
      if (dotIdx !== -1) {
        baseJobNumber = baseJobNumber.substring(0, dotIdx);
      }
      var finalJobNumber = baseJobNumber;
      if (/^\d{3}-\d{2}$/.test(baseJobNumber)) {
        finalJobNumber = calculateNextJobNumberSuffix(employeesSheet, baseJobNumber, newJobClassification);
      }
      newEmpRow[empJobNumberColIdx] = finalJobNumber;
    }
    if (empHireDateColIdx !== -1) newEmpRow[empHireDateColIdx] = rehireDateStr;
    if (empJobClassificationColIdx !== -1) newEmpRow[empJobClassificationColIdx] = newJobClassification;

    var lastRowVal = employeesSheet.getLastRow();
    employeesSheet.insertRowAfter(lastRowVal);
    var newRowIndex = lastRowVal + 1;
    safeWriteRowToTable(employeesSheet, newRowIndex, newEmpRow, empHeaders);

    var todayStr = Utilities.formatDate(new Date(), ss.getSpreadsheetTimeZone(), 'MM/dd/yyyy');

    // Check for duplicate before adding Rehired entry
    if (!isDuplicateEmployeeHistoryEntry(sheet, empName, EMPLOYEE_EVENT_TYPES.REHIRED, todayStr)) {
      var rehiredHistoryRow = [
        todayStr,                             // Date
        empName,                              // Employee Name
        EMPLOYEE_EVENT_TYPES.REHIRED,         // Event Type
        newLocation,                          // Location
        newJobNumber,                         // Job Number
        originalHireDate,                     // Hire Date
        '',                                   // Last Day
        '',                                   // Last Day Reason
        rehireDateStr,                        // Rehire Date
        'Rehired from Previous Employee',     // Notes
        '',                                   // Phone Number
        '',                                   // Email Address
        '',                                   // Glove Size
        ''                                    // Sleeve Size
      ];
      var histLastRow = sheet.getLastRow();
      sheet.insertRowAfter(histLastRow);
      var nextHistRow = histLastRow + 1;
      safeWriteRowToTable(sheet, nextHistRow, rehiredHistoryRow);
    } else {
      Logger.log('Skipped duplicate Rehired entry for ' + empName);
    }

    ui.alert('✅ Employee Rehired!',
      'Employee: ' + empName + '\n' +
      'Location: ' + newLocation + '\n' +
      'Job Number: ' + (newJobNumber || 'N/A') + '\n' +
      'Job Classification: ' + (newJobClassification || 'N/A') + '\n' +
      'Rehire Date: ' + rehireDateStr,
      ui.ButtonSet.OK);

    Logger.log('Employee "' + empName + '" rehired to ' + newLocation);

  } catch (e) {
    Logger.log('[ERROR] handleRehireDateChange: ' + e);
    SpreadsheetApp.getUi().alert('❌ Error', 'Error processing rehire: ' + e.message, SpreadsheetApp.getUi().ButtonSet.OK);
  }
}

/**
 * Tracks employee location and job number changes.
 * Called from processEdit when Location or Job Number is edited.
 *
 * @param {Spreadsheet} ss - The active spreadsheet
 * @param {Sheet} sheet - The Employees sheet
 * @param {number} editedRow - Row number
 * @param {number} editedCol - Column number
 * @param {*} newValue - New value
 * @param {*} oldValue - Old value
 * @param {number} locationColIdx - Location column index (1-based)
 * @param {number} jobNumberColIdx - Job Number column index (1-based)
 * @param {number} hireDateColIdx - Hire Date column index (1-based, optional)
 */
function trackEmployeeChange(ss, sheet, editedRow, editedCol, newValue, oldValue, locationColIdx, jobNumberColIdx, hireDateColIdx) {
  try {
    var empData = sheet.getRange(editedRow, 1, 1, sheet.getLastColumn()).getValues()[0];
    var empHeaders = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];

    var nameColIdx = 0;
    var foundHireDateColIdx = -1;

    for (var h = 0; h < empHeaders.length; h++) {
      var header = String(empHeaders[h]).toLowerCase().trim();
      if (header === 'hire date') foundHireDateColIdx = h;
    }

    var empName = empData[nameColIdx] || '';
    var location = locationColIdx > 0 ? empData[locationColIdx - 1] : '';
    var jobNumber = jobNumberColIdx > 0 ? empData[jobNumberColIdx - 1] : '';
    var hireDate = foundHireDateColIdx !== -1 ? empData[foundHireDateColIdx] : '';

    var todayStr = Utilities.formatDate(new Date(), ss.getSpreadsheetTimeZone(), 'MM/dd/yyyy');

    var hireDateStr = '';
    if (hireDate) {
      var hireDateObj = null;
      if (hireDate instanceof Date) {
        hireDateObj = hireDate;
      } else {
        var hd = new Date(hireDate);
        if (!isNaN(hd.getTime())) {
          hireDateObj = hd;
        }
      }

      // Validate year is reasonable (between 1950 and 2100)
      if (hireDateObj) {
        var hireYear = hireDateObj.getFullYear();
        if (hireYear >= 1950 && hireYear <= 2100) {
          hireDateStr = Utilities.formatDate(hireDateObj, ss.getSpreadsheetTimeZone(), 'MM/dd/yyyy');
        } else {
          Logger.log('[WARNING] trackEmployeeChange: Invalid hire year ' + hireYear + ' for ' + empName);
        }
      }
    }

    var historySheet = ss.getSheetByName('Employee History');
    if (!historySheet) {
      historySheet = ss.insertSheet('Employee History');
      setupEmployeeHistorySheet(historySheet);
    }

    var changeType = '';
    var changeNotes = '';

    if (editedCol === locationColIdx) {
      changeType = EMPLOYEE_EVENT_TYPES.LOCATION_CHANGE;
      changeNotes = 'From: ' + (oldValue || 'N/A') + ' → ' + (newValue || 'N/A');
    } else if (editedCol === jobNumberColIdx) {
      changeType = EMPLOYEE_EVENT_TYPES.JOB_NUMBER_CHANGE;
      changeNotes = 'From: ' + (oldValue || 'N/A') + ' → ' + (newValue || 'N/A');
    } else if (hireDateColIdx && editedCol === hireDateColIdx) {
      changeType = EMPLOYEE_EVENT_TYPES.HIRE_DATE_CHANGE;
      changeNotes = 'From: ' + (oldValue || 'N/A') + ' → ' + (newValue || 'N/A');
    }

    if (!changeType) {
      Logger.log('trackEmployeeChange: Unknown column edited: ' + editedCol);
      return;
    }

    // Check for duplicate before adding
    if (isDuplicateEmployeeHistoryEntry(historySheet, empName, changeType, todayStr)) {
      Logger.log('Skipped duplicate ' + changeType + ' entry for ' + empName);
      return;
    }

    var historyRow = [
      todayStr,        // Date
      empName,         // Employee Name
      changeType,      // Event Type
      location,        // Location
      jobNumber,       // Job Number
      hireDateStr,     // Hire Date
      '',              // Last Day
      '',              // Last Day Reason
      '',              // Rehire Date
      changeNotes,     // Notes
      '',              // Phone Number
      '',              // Email Address
      '',              // Glove Size
      ''               // Sleeve Size
    ];
    historySheet.appendRow(historyRow);

    Logger.log('Tracked ' + changeType + ' for employee "' + empName + '"');

  } catch (e) {
    Logger.log('[ERROR] trackEmployeeChange: ' + e);
  }
}

/**
 * Saves employee changes to Employee History.
 * Tracks: new employees, location changes, job number changes, phone/email/size changes.
 * Captures all employee data (phone, email, sizes) for each entry.
 * Called from saveHistory().
 *
 * @return {number} Number of new entries added
 */
function saveEmployeeHistory() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var employeesSheet = ss.getSheetByName('Employees');
  var historySheet = ss.getSheetByName('Employee History');

  if (!employeesSheet || !historySheet) return 0;
  if (employeesSheet.getLastRow() < 2) return 0;

  var empData = employeesSheet.getDataRange().getValues();
  var empHeaders = empData[0];

  // Find all column indices dynamically
  var nameColIdx = 0;
  var locationColIdx = -1;
  var jobNumberColIdx = -1;
  var hireDateColIdx = -1;
  var phoneNumberColIdx = -1;
  var emailAddressColIdx = -1;
  var gloveSizeColIdx = -1;
  var sleeveSizeColIdx = -1;
  var jobClassificationColIdx = -1;

  for (var h = 0; h < empHeaders.length; h++) {
    var header = String(empHeaders[h]).toLowerCase().trim();
    if (header === 'location') locationColIdx = h;
    if (header === 'job number') jobNumberColIdx = h;
    if (header === 'hire date') hireDateColIdx = h;
    // Match various phone column header formats
    if (header === 'phone number' || header === 'phone' || header === 'phone #' || header === 'cell' || header === 'cell phone') phoneNumberColIdx = h;
    if (header === 'email address') emailAddressColIdx = h;
    if (header === 'glove size') gloveSizeColIdx = h;
    if (header === 'sleeve size') sleeveSizeColIdx = h;
    if (header === 'job classification') jobClassificationColIdx = h;
  }

  // Use COLS constants as fallback if headers don't match
  // COLS.EMPLOYEES.LOCATION = 3 (column C, 0-based index 2)
  // COLS.EMPLOYEES.JOB_NUMBER = 4 (column D, 0-based index 3)
  // COLS.EMPLOYEES.PHONE = 5 (column E, 0-based index 4)
  if (locationColIdx === -1) locationColIdx = 2;
  if (jobNumberColIdx === -1) jobNumberColIdx = 3;
  if (phoneNumberColIdx === -1) phoneNumberColIdx = 4;

  // Get existing history to find last known state for each employee
  var historyData = [];
  if (historySheet.getLastRow() > 2) {
    historyData = historySheet.getRange(3, 1, historySheet.getLastRow() - 2, 14).getValues();
  }

  // Build map of last known state for each employee (most recent entry)
  // Also track Last Day, Last Day Reason, and Rehire Date to preserve them
  var lastKnownState = {};
  for (var hi = 0; hi < historyData.length; hi++) {
    var histName = (historyData[hi][1] || '').toString().replace(/^["']+|["']+$/g, '').trim().toLowerCase();
    if (histName) {
      // Get current stored values
      var existing = lastKnownState[histName] || {};

      // Always update to the latest entry for this employee
      lastKnownState[histName] = {
        location: (historyData[hi][3] || '').toString().trim(),
        jobNumber: (historyData[hi][4] || '').toString().trim(),
        // Preserve Last Day, Last Day Reason, Rehire Date if they exist (don't overwrite with empty)
        lastDay: (historyData[hi][6] || existing.lastDay || '').toString().trim(),
        lastDayReason: (historyData[hi][7] || existing.lastDayReason || '').toString().trim(),
        rehireDate: (historyData[hi][8] || existing.rehireDate || '').toString().trim(),
        phoneNumber: (historyData[hi][10] || '').toString().trim(),
        emailAddress: (historyData[hi][11] || '').toString().trim(),
        gloveSize: (historyData[hi][12] || '').toString().trim(),
        sleeveSize: (historyData[hi][13] || '').toString().trim()
      };
    }
  }

  var todayStr = Utilities.formatDate(new Date(), ss.getSpreadsheetTimeZone(), 'MM/dd/yyyy');
  var newEntries = 0;

  // Check each employee for changes
  for (var i = 1; i < empData.length; i++) {
    var name = (empData[i][nameColIdx] || '').toString().trim();
    if (!name) continue;

    var nameLower = name.toLowerCase();

    // Get current values from Employees sheet
    var currentLocation = locationColIdx !== -1 ? (empData[i][locationColIdx] || '').toString().trim() : '';
    var currentJobNumber = jobNumberColIdx !== -1 ? (empData[i][jobNumberColIdx] || '').toString().trim() : '';
    var hireDate = hireDateColIdx !== -1 ? empData[i][hireDateColIdx] : '';
    var phoneNumber = phoneNumberColIdx !== -1 ? (empData[i][phoneNumberColIdx] || '').toString().trim() : '';
    var emailAddress = emailAddressColIdx !== -1 ? (empData[i][emailAddressColIdx] || '').toString().trim() : '';
    var gloveSize = gloveSizeColIdx !== -1 ? (empData[i][gloveSizeColIdx] || '').toString().trim() : '';
    var sleeveSize = sleeveSizeColIdx !== -1 ? (empData[i][sleeveSizeColIdx] || '').toString().trim() : '';

    // Skip Previous Employee locations (already handled by handleLastDayChange)
    if (currentLocation.toLowerCase() === 'previous employee') continue;

    var last = lastKnownState[nameLower];

    // Format hire date with validation
    var hireDateStr = '';
    if (hireDate) {
      var hireDateObj = null;
      if (hireDate instanceof Date) {
        hireDateObj = hireDate;
      } else {
        var hd = new Date(hireDate);
        if (!isNaN(hd.getTime())) {
          hireDateObj = hd;
        }
      }

      // Validate year is reasonable (between 1950 and 2100)
      if (hireDateObj) {
        var hireYear = hireDateObj.getFullYear();
        if (hireYear >= 1950 && hireYear <= 2100) {
          hireDateStr = Utilities.formatDate(hireDateObj, ss.getSpreadsheetTimeZone(), 'MM/dd/yyyy');
        } else {
          Logger.log('[WARNING] saveEmployeeHistory: Invalid hire year ' + hireYear + ' for ' + name);
        }
      }
    }

    // If no history exists for this employee, add initial "New Employee" entry
    if (!last) {
      // Check for duplicate before adding
      if (!isDuplicateEmployeeHistoryEntry(historySheet, name, EMPLOYEE_EVENT_TYPES.NEW_EMPLOYEE, todayStr)) {
        historySheet.appendRow([
          todayStr,                           // Date
          name,                               // Employee Name
          EMPLOYEE_EVENT_TYPES.NEW_EMPLOYEE,  // Event Type
          currentLocation,                    // Location
          currentJobNumber,                   // Job Number
          hireDateStr,                        // Hire Date
          '',                                 // Last Day (new employee, no last day yet)
          '',                                 // Last Day Reason
          '',                                 // Rehire Date
          'Added to system',                  // Notes
          phoneNumber,                        // Phone Number
          emailAddress,                       // Email Address
          gloveSize,                          // Glove Size
          sleeveSize                          // Sleeve Size
        ]);
        newEntries++;
      } else {
        Logger.log('Skipped duplicate New Employee entry for ' + name);
      }
      lastKnownState[nameLower] = {
        location: currentLocation,
        jobNumber: currentJobNumber,
        lastDay: '',
        lastDayReason: '',
        rehireDate: '',
        phoneNumber: phoneNumber,
        emailAddress: emailAddress,
        gloveSize: gloveSize,
        sleeveSize: sleeveSize
      };
      continue;
    }

    // Check for any changes
    var locationChanged = last.location !== currentLocation;
    var jobNumberChanged = last.jobNumber !== currentJobNumber;
    var phoneChanged = last.phoneNumber !== phoneNumber;
    var emailChanged = last.emailAddress !== emailAddress;
    var gloveSizeChanged = last.gloveSize !== gloveSize;
    var sleeveSizeChanged = last.sleeveSize !== sleeveSize;

    // Only log if something significant changed
    if (locationChanged || jobNumberChanged || phoneChanged || emailChanged || gloveSizeChanged || sleeveSizeChanged) {

      // Build change type and notes
      var changeTypes = [];
      var changeNotes = [];

      if (locationChanged) {
        changeTypes.push('Location');
        changeNotes.push('Location: ' + (last.location || 'N/A') + ' → ' + currentLocation);
      }
      if (jobNumberChanged) {
        changeTypes.push('Job #');
        changeNotes.push('Job#: ' + (last.jobNumber || 'N/A') + ' → ' + currentJobNumber);
      }
      if (phoneChanged) {
        changeTypes.push('Phone');
        changeNotes.push('Phone: ' + (last.phoneNumber || 'N/A') + ' → ' + phoneNumber);
      }
      if (emailChanged) {
        changeTypes.push('Email');
        changeNotes.push('Email: ' + (last.emailAddress || 'N/A') + ' → ' + emailAddress);
      }
      if (gloveSizeChanged) {
        changeTypes.push('Glove Size');
        changeNotes.push('Glove: ' + (last.gloveSize || 'N/A') + ' → ' + gloveSize);
      }
      if (sleeveSizeChanged) {
        changeTypes.push('Sleeve Size');
        changeNotes.push('Sleeve: ' + (last.sleeveSize || 'N/A') + ' → ' + sleeveSize);
      }

      var changeType = changeTypes.length > 2 ? EMPLOYEE_EVENT_TYPES.MULTIPLE_CHANGES : changeTypes.join(' & ') + ' Change';
      var notesText = changeNotes.join('; ');

      // Check for duplicate before adding
      if (isDuplicateEmployeeHistoryEntry(historySheet, name, changeType, todayStr)) {
        Logger.log('Skipped duplicate ' + changeType + ' entry for ' + name);
        continue;
      }

      // Preserve Last Day, Last Day Reason, and Rehire Date from previous entries
      historySheet.appendRow([
        todayStr,               // Date
        name,                   // Employee Name
        changeType,             // Event Type
        currentLocation,        // Location
        currentJobNumber,       // Job Number
        hireDateStr,            // Hire Date
        last.lastDay || '',     // Last Day (preserved from history)
        last.lastDayReason || '',// Last Day Reason (preserved from history)
        last.rehireDate || '',  // Rehire Date (preserved from history)
        notesText,              // Notes
        phoneNumber,            // Phone Number
        emailAddress,           // Email Address
        gloveSize,              // Glove Size
        sleeveSize              // Sleeve Size
      ]);
      newEntries++;

      // Update last known state
      lastKnownState[nameLower] = {
        location: currentLocation,
        jobNumber: currentJobNumber,
        lastDay: last.lastDay || '',
        lastDayReason: last.lastDayReason || '',
        rehireDate: last.rehireDate || '',
        phoneNumber: phoneNumber,
        emailAddress: emailAddress,
        gloveSize: gloveSize,
        sleeveSize: sleeveSize
      };
    }
  }

  return newEntries;
}

/**
 * Restores an accidentally deleted employee from Employee History data.
 * Shows a dialog to search for the employee and preview data before restoring.
 *
 * Menu: Glove Manager → Utilities → 🔄 Restore Deleted Employee
 */
function showRestoreEmployeeDialog() {
  var html = HtmlService.createHtmlOutput(buildRestoreEmployeeHtml())
    .setWidth(600)
    .setHeight(550);
  SpreadsheetApp.getUi().showModalDialog(html, '🔄 Restore Deleted Employee');
}

/**
 * Build the HTML for restore employee dialog
 */
function buildRestoreEmployeeHtml() {
  var html = '<style>';
  html += 'body { font-family: Arial, sans-serif; padding: 15px; }';
  html += '.search-box { display: flex; gap: 10px; margin-bottom: 20px; }';
  html += '.search-box input { flex: 1; padding: 10px; border: 1px solid #ddd; border-radius: 4px; font-size: 14px; }';
  html += '.search-box button { padding: 10px 20px; background: #1a73e8; color: white; border: none; border-radius: 4px; cursor: pointer; }';
  html += '.results { margin-top: 10px; }';
  html += '.result-item { padding: 12px; border: 1px solid #ddd; border-radius: 4px; margin: 8px 0; cursor: pointer; }';
  html += '.result-item:hover { background: #f5f5f5; border-color: #1a73e8; }';
  html += '.result-item.selected { background: #e8f0fe; border-color: #1a73e8; border-width: 2px; }';
  html += '.preview { margin-top: 20px; padding: 15px; background: #f9f9f9; border-radius: 4px; display: none; }';
  html += '.preview h3 { margin-top: 0; color: #1a73e8; }';
  html += '.preview-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }';
  html += '.preview-item { padding: 8px; background: white; border-radius: 4px; }';
  html += '.preview-item label { display: block; font-size: 11px; color: #666; margin-bottom: 2px; }';
  html += '.preview-item input { width: 100%; padding: 6px; border: 1px solid #ddd; border-radius: 3px; box-sizing: border-box; }';
  html += '.buttons { margin-top: 20px; text-align: right; }';
  html += '.buttons button { padding: 10px 20px; margin-left: 10px; border: none; border-radius: 4px; cursor: pointer; }';
  html += '.btn-restore { background: #34a853; color: white; }';
  html += '.btn-cancel { background: #6c757d; color: white; }';
  html += '.no-results { color: #666; font-style: italic; padding: 20px; text-align: center; }';
  html += '.loading { color: #666; padding: 20px; text-align: center; }';
  html += '.error { color: #dc3545; padding: 10px; background: #f8d7da; border-radius: 4px; margin-top: 10px; }';
  html += '.pending-badge { display: none; background: #fff3cd; color: #856404; border: 1px solid #ffc107; border-radius: 6px; padding: 8px 12px; margin-top: 12px; font-size: 13px; }';
  html += '</style>';

  html += '<div class="search-box">';
  html += '<input type="text" id="searchInput" placeholder="Enter employee name to search..." onkeypress="if(event.key===\'Enter\')searchEmployee()">';
  html += '<button onclick="searchEmployee()">🔍 Search</button>';
  html += '</div>';

  html += '<div id="results" class="results"></div>';

  html += '<div id="preview" class="preview">';
  html += '<h3>📋 Employee Data Preview</h3>';
  html += '<p style="font-size:12px;color:#666;margin-bottom:15px;">Review and edit if needed before restoring:</p>';
  html += '<div class="preview-grid">';
  html += '<div class="preview-item"><label>Name</label><input type="text" id="prev_name" readonly style="background:#eee;"></div>';
  html += '<div class="preview-item"><label>Job Classification</label><input type="text" id="prev_class"></div>';
  html += '<div class="preview-item"><label>Location</label><input type="text" id="prev_location"></div>';
  html += '<div class="preview-item"><label>Job Number</label><input type="text" id="prev_jobNumber"></div>';
  html += '<div class="preview-item"><label>Phone Number</label><input type="text" id="prev_phone"></div>';
  html += '<div class="preview-item"><label>Email Address</label><input type="text" id="prev_email"></div>';
  html += '<div class="preview-item"><label>Glove Size</label><input type="text" id="prev_gloveSize"></div>';
  html += '<div class="preview-item"><label>Sleeve Size</label><input type="text" id="prev_sleeveSize"></div>';
  html += '<div class="preview-item"><label>Hire Date (future = Pending New Hire)</label><input type="date" id="prev_hireDate" onchange="checkPending()"></div>';
  html += '<div class="preview-item"><label>Notes (history source)</label><input type="text" id="prev_notes" readonly style="background:#eee;font-size:11px;"></div>';
  html += '</div>';
  html += '<div class="pending-badge" id="pendingBadge">⏳ <strong>Pending New Hire</strong> — Future Hire Date detected. Employee will be restored but excluded from swap reports and tasks until this date.</div>';
  html += '<div class="buttons">';
  html += '<button class="btn-cancel" onclick="google.script.host.close()">Cancel</button>';
  html += '<button class="btn-restore" onclick="restoreEmployee()">✅ Restore Employee</button>';
  html += '</div>';
  html += '</div>';

  html += '<script>';
  html += 'var selectedEmployee = null;';

  html += 'function searchEmployee() {';
  html += '  var query = document.getElementById("searchInput").value.trim();';
  html += '  if (!query || query.length < 2) { alert("Please enter at least 2 characters"); return; }';
  html += '  document.getElementById("results").innerHTML = "<div class=\\"loading\\">🔍 Searching...</div>";';
  html += '  document.getElementById("preview").style.display = "none";';
  html += '  google.script.run.withSuccessHandler(showResults).withFailureHandler(showError).searchEmployeeHistory(query);';
  html += '}';

  html += 'function showResults(results) {';
  html += '  var container = document.getElementById("results");';
  html += '  if (!results || results.length === 0) {';
  html += '    container.innerHTML = "<div class=\\"no-results\\">No employees found in history matching that name.</div>";';
  html += '    return;';
  html += '  }';
  html += '  var html = "";';
  html += '  for (var i = 0; i < results.length; i++) {';
  html += '    var r = results[i];';
  html += '    html += "<div class=\\"result-item\\" onclick=\\"selectResult(" + i + ")\\" id=\\"result_" + i + "\\">";';
  html += '    html += "<strong>" + r.name + "</strong>";';
  html += '    if (r.jobNumber) html += " <span style=\\"color:#666\\">(" + r.jobNumber + ")</span>";';
  html += '    html += "<br><span style=\\"font-size:12px;color:#666\\">";';
  html += '    if (r.location) html += "📍 " + r.location + " ";';
  html += '    html += "Last seen: " + r.lastSeen + "</span>";';
  html += '    html += "</div>";';
  html += '  }';
  html += '  container.innerHTML = html;';
  html += '  window.searchResults = results;';
  html += '}';

  html += 'function showError(error) {';
  html += '  document.getElementById("results").innerHTML = "<div class=\\"error\\">Error: " + error.message + "</div>";';
  html += '}';

  html += 'function selectResult(index) {';
  html += '  var items = document.querySelectorAll(".result-item");';
  html += '  for (var i = 0; i < items.length; i++) { items[i].classList.remove("selected"); }';
  html += '  document.getElementById("result_" + index).classList.add("selected");';
  html += '  selectedEmployee = window.searchResults[index];';
  html += '  document.getElementById("prev_name").value = selectedEmployee.name || "";';
  html += '  document.getElementById("prev_class").value = selectedEmployee.class || "";';
  html += '  document.getElementById("prev_location").value = selectedEmployee.location || "";';
  html += '  document.getElementById("prev_jobNumber").value = selectedEmployee.jobNumber || "";';
  html += '  document.getElementById("prev_phone").value = selectedEmployee.phone || "";';
  html += '  document.getElementById("prev_email").value = selectedEmployee.email || "";';
  html += '  document.getElementById("prev_gloveSize").value = selectedEmployee.gloveSize || "";';
  html += '  document.getElementById("prev_sleeveSize").value = selectedEmployee.sleeveSize || "";';
  html += '  var rawHire = selectedEmployee.hireDate || "";';
  html += '  if (rawHire) {';
  html += '    var parts = rawHire.split("/");';
  html += '    if (parts.length === 3) { rawHire = parts[2] + "-" + parts[0].padStart(2,"0") + "-" + parts[1].padStart(2,"0"); }';
  html += '  }';
  html += '  document.getElementById("prev_hireDate").value = rawHire;';
  html += '  document.getElementById("prev_notes").value = "From " + selectedEmployee.historyEntries + " history entries";';
  html += '  document.getElementById("preview").style.display = "block";';
  html += '  checkPending();';
  html += '}';

  html += 'function checkPending() {';
  html += '  var val = document.getElementById("prev_hireDate").value;';
  html += '  var badge = document.getElementById("pendingBadge");';
  html += '  if (!val) { badge.style.display = "none"; return; }';
  html += '  var hd = new Date(val + "T00:00:00");';
  html += '  var today = new Date(); today.setHours(0,0,0,0);';
  html += '  badge.style.display = hd > today ? "block" : "none";';
  html += '}';

  html += 'function restoreEmployee() {';
  html += '  if (!selectedEmployee) { alert("Please select an employee first"); return; }';
  html += '  var data = {';
  html += '    name: document.getElementById("prev_name").value,';
  html += '    class: document.getElementById("prev_class").value,';
  html += '    location: document.getElementById("prev_location").value,';
  html += '    jobNumber: document.getElementById("prev_jobNumber").value,';
  html += '    phone: document.getElementById("prev_phone").value,';
  html += '    email: document.getElementById("prev_email").value,';
  html += '    gloveSize: document.getElementById("prev_gloveSize").value,';
  html += '    sleeveSize: document.getElementById("prev_sleeveSize").value,';
  html += '    hireDate: document.getElementById("prev_hireDate").value';
  html += '  };';
  html += '  if (!confirm("Restore " + data.name + " to the Employees sheet?")) return;';
  html += '  google.script.run.withSuccessHandler(function(result) {';
  html += '    alert(result);';
  html += '    google.script.host.close();';
  html += '  }).withFailureHandler(function(error) {';
  html += '    alert("Error: " + error.message);';
  html += '  }).restoreEmployeeToSheet(JSON.stringify(data));';
  html += '}';

  html += '</script>';

  return html;
}

/**
 * Search Employee History for employees matching the query.
 * Returns reconstructed employee data from history entries.
 *
 * @param {string} query - Name to search for
 * @return {Array} Array of employee data objects
 */
function searchEmployeeHistory(query) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var historySheet = ss.getSheetByName('Employee History');
  var employeesSheet = ss.getSheetByName('Employees');

  if (!historySheet || historySheet.getLastRow() <= 2) {
    return [];
  }

  var queryLower = query.toLowerCase().trim();
  var historyData = historySheet.getRange(3, 1, historySheet.getLastRow() - 2, 14).getValues();

  // Get current employees to exclude them from results
  var currentEmployees = {};
  if (employeesSheet && employeesSheet.getLastRow() > 1) {
    var empData = employeesSheet.getDataRange().getValues();
    for (var e = 1; e < empData.length; e++) {
      var empName = String(empData[e][0] || '').toLowerCase().trim();
      if (empName) currentEmployees[empName] = true;
    }
  }

  // Build employee data from history entries
  // History columns: Date, Employee, EventType, Location, JobNumber, HireDate, LastDay, LastDayReason, RehireDate, Notes, Phone, Email, GloveSize, SleeveSize
  var employeeMap = {};

  for (var i = 0; i < historyData.length; i++) {
    var row = historyData[i];
    var name = String(row[1] || '').trim();
    var nameLower = name.toLowerCase();

    if (!name || nameLower.indexOf(queryLower) === -1) continue;

    // Skip if currently in Employees sheet
    if (currentEmployees[nameLower]) continue;

    if (!employeeMap[nameLower]) {
      employeeMap[nameLower] = {
        name: name,
        location: '',
        jobNumber: '',
        class: '',
        phone: '',
        email: '',
        gloveSize: '',
        sleeveSize: '',
        hireDate: '',
        lastSeen: '',
        historyEntries: 0
      };
    }

    var emp = employeeMap[nameLower];
    emp.historyEntries++;

    // Update with latest non-empty values
    var date = row[0];
    var location = String(row[3] || '').trim();
    var jobNumber = String(row[4] || '').trim();
    var hireDate = row[5];
    var phone = String(row[10] || '').trim();
    var email = String(row[11] || '').trim();
    var gloveSize = String(row[12] || '').trim();
    var sleeveSize = String(row[13] || '').trim();

    // Keep most recent non-empty values
    if (location) emp.location = location;
    if (jobNumber) emp.jobNumber = jobNumber;
    if (phone) emp.phone = phone;
    if (email) emp.email = email;
    if (gloveSize) emp.gloveSize = gloveSize;
    if (sleeveSize) emp.sleeveSize = sleeveSize;
    if (hireDate) {
      emp.hireDate = (hireDate instanceof Date)
        ? Utilities.formatDate(hireDate, ss.getSpreadsheetTimeZone(), 'MM/dd/yyyy')
        : String(hireDate);
    }

    // Track last seen date
    if (date) {
      var dateStr = (date instanceof Date)
        ? Utilities.formatDate(date, ss.getSpreadsheetTimeZone(), 'MM/dd/yyyy')
        : String(date);
      emp.lastSeen = dateStr;
    }
  }

  // Convert to array and sort by last seen date
  var results = [];
  for (var key in employeeMap) {
    results.push(employeeMap[key]);
  }

  return results;
}

/**
 * Restore an employee to the Employees sheet.
 * Called from the restore dialog.
 *
 * @param {string} dataJson - JSON string of employee data
 * @return {string} Result message
 */
function restoreEmployeeToSheet(dataJson) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var employeesSheet = ss.getSheetByName('Employees');
  var historySheet = ss.getSheetByName('Employee History');

  if (!employeesSheet) {
    throw new Error('Employees sheet not found');
  }

  var data = JSON.parse(dataJson);

  if (!data.name) {
    throw new Error('Employee name is required');
  }

  // Check if employee already exists
  var empData = employeesSheet.getDataRange().getValues();
  var nameLower = data.name.toLowerCase().trim();

  for (var i = 1; i < empData.length; i++) {
    if (String(empData[i][0] || '').toLowerCase().trim() === nameLower) {
      throw new Error('Employee "' + data.name + '" already exists in Employees sheet (row ' + (i + 1) + ')');
    }
  }

  // Get headers to find column indices
  var headers = empData[0];
  var colMap = {};
  for (var h = 0; h < headers.length; h++) {
    var hdr = String(headers[h]).toLowerCase().trim();
    if (hdr === 'name') colMap.name = h;
    else if (hdr === 'class') colMap.class = h;
    else if (hdr === 'location') colMap.location = h;
    else if (hdr === 'job number') colMap.jobNumber = h;
    // Match various phone column header formats
    else if (hdr === 'phone number' || hdr === 'phone' || hdr === 'phone #' || hdr === 'cell' || hdr === 'cell phone') colMap.phone = h;
    else if (hdr === 'email address') colMap.email = h;
    else if (hdr === 'glove size') colMap.gloveSize = h;
    else if (hdr === 'sleeve size') colMap.sleeveSize = h;
    else if (hdr === 'hire date') colMap.hireDate = h;
    else if (hdr === 'job classification') colMap.classification = h;
  }

  // Use COLS constants as fallback if headers don't match
  // COLS.EMPLOYEES.NAME = 1 (column A, 0-based index 0)
  // COLS.EMPLOYEES.LOCATION = 3 (column C, 0-based index 2)
  // COLS.EMPLOYEES.JOB_NUMBER = 4 (column D, 0-based index 3)
  // COLS.EMPLOYEES.PHONE = 5 (column E, 0-based index 4)
  if (colMap.name === undefined) colMap.name = 0;
  if (colMap.location === undefined) colMap.location = 2;
  if (colMap.jobNumber === undefined) colMap.jobNumber = 3;
  if (colMap.phone === undefined) colMap.phone = 4;

  // Build the new row (match header order)
  var newRow = new Array(headers.length).fill('');
  if (colMap.name !== undefined) newRow[colMap.name] = data.name;
  if (colMap.class !== undefined) newRow[colMap.class] = data.class || '';
  if (colMap.location !== undefined) newRow[colMap.location] = data.location || '';
  if (colMap.jobNumber !== undefined) newRow[colMap.jobNumber] = data.jobNumber || '';
  if (colMap.phone !== undefined) newRow[colMap.phone] = data.phone || '';
  if (colMap.email !== undefined) newRow[colMap.email] = data.email || '';
  if (colMap.gloveSize !== undefined) newRow[colMap.gloveSize] = data.gloveSize || '';
  if (colMap.sleeveSize !== undefined) newRow[colMap.sleeveSize] = data.sleeveSize || '';
  if (colMap.classification !== undefined) newRow[colMap.classification] = data.class || '';

  // Format hire date for the sheet (convert YYYY-MM-DD to MM/DD/YYYY)
  var hireDateForSheet = data.hireDate || '';
  if (hireDateForSheet && hireDateForSheet.indexOf('-') !== -1) {
    var hdParts = hireDateForSheet.split('-');
    if (hdParts.length === 3) {
      hireDateForSheet = hdParts[1] + '/' + hdParts[2] + '/' + hdParts[0];
    }
  }
  if (colMap.hireDate !== undefined) newRow[colMap.hireDate] = hireDateForSheet;

  // Detect if this is a pending new hire (future hire date)
  var isPending = false;
  if (hireDateForSheet) {
    isPending = isEmployeePending(new Date(hireDateForSheet));
  }

  // Append the row
  var lastRowVal = employeesSheet.getLastRow();
  employeesSheet.insertRowAfter(lastRowVal);
  var newRowIndex = lastRowVal + 1;
  safeWriteRowToTable(employeesSheet, newRowIndex, newRow, headers);

  // Log to Employee History
  if (historySheet) {
    var today = new Date();
    var todayStr = Utilities.formatDate(today, ss.getSpreadsheetTimeZone(), 'MM/dd/yyyy');

    var eventType = isPending ? 'NEW_EMPLOYEE_PENDING' : 'Restored';
    var notes = isPending
      ? 'Rehired as Pending New Hire (start date: ' + hireDateForSheet + '). Restored from Employee History.'
      : 'Restored from Employee History - accidentally deleted';

    var histRow = [
      todayStr,                    // Date
      data.name,                   // Employee Name
      eventType,                   // Event Type
      data.location || '',         // Location
      data.jobNumber || '',        // Job Number
      hireDateForSheet,            // Hire Date
      '',                          // Last Day
      '',                          // Last Day Reason
      isPending ? '' : todayStr,   // Rehire Date (only for immediate rehires)
      notes,                       // Notes
      data.phone || '',            // Phone
      data.email || '',            // Email
      data.gloveSize || '',        // Glove Size
      data.sleeveSize || ''        // Sleeve Size
    ];
    var histLastRow = historySheet.getLastRow();
    historySheet.insertRowAfter(histLastRow);
    var nextHistRow = histLastRow + 1;
    safeWriteRowToTable(historySheet, nextHistRow, histRow);
  }

  Logger.log('restoreEmployeeToSheet: Restored ' + data.name + ' to Employees sheet' + (isPending ? ' (PENDING)' : ''));

  if (isPending) {
    return '⏳ Pending New Hire Restored!\n\n' + data.name + ' has been added to the Employees sheet as a Pending New Hire.\n\nStart Date: ' + hireDateForSheet + '\nLocation: ' + (data.location || 'Not set') + '\n\nThey will be excluded from swap reports and tasks until their start date. Equipment can be pre-assigned now.';
  }

  return '✅ Employee Restored!\n\n' + data.name + ' has been added back to the Employees sheet.\n\nJob Number: ' + (data.jobNumber || 'Not set') + '\nLocation: ' + (data.location || 'Not set');
}
