/**
 * Glove Manager – Employee History Tracking
 *
 * Functions for tracking employee changes and history.
 * Manages terminations, rehires, location changes, and archiving.
 */

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
function handleLastDayChange(ss, sheet, editedRow, newValue) {
  if (!newValue || newValue === '') return;

  try {
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
      if (header === 'phone number') phoneNumberColIdx = h;
      if (header === 'email address') emailAddressColIdx = h;
      if (header === 'glove size') gloveSizeColIdx = h;
      if (header === 'sleeve size') sleeveSizeColIdx = h;
    }

    var empName = empData[nameColIdx] || '';
    var location = locationColIdx !== -1 ? empData[locationColIdx] : '';
    var jobNumber = jobNumberColIdx !== -1 ? empData[jobNumberColIdx] : '';
    var lastDayReason = lastDayReasonColIdx !== -1 ? empData[lastDayReasonColIdx] : '';
    var hireDate = hireDateColIdx !== -1 ? empData[hireDateColIdx] : '';
    var phoneNumber = phoneNumberColIdx !== -1 ? empData[phoneNumberColIdx] : '';
    var emailAddress = emailAddressColIdx !== -1 ? empData[emailAddressColIdx] : '';
    var gloveSize = gloveSizeColIdx !== -1 ? empData[gloveSizeColIdx] : '';
    var sleeveSize = sleeveSizeColIdx !== -1 ? empData[sleeveSizeColIdx] : '';

    var lastDayStr = '';
    if (newValue instanceof Date) {
      lastDayStr = Utilities.formatDate(newValue, ss.getSpreadsheetTimeZone(), 'MM/dd/yyyy');
    } else {
      var lastDayDate = new Date(newValue);
      if (!isNaN(lastDayDate.getTime())) {
        lastDayStr = Utilities.formatDate(lastDayDate, ss.getSpreadsheetTimeZone(), 'MM/dd/yyyy');
      } else {
        lastDayStr = String(newValue);
      }
    }

    var hireDateStr = '';
    if (hireDate) {
      if (hireDate instanceof Date) {
        hireDateStr = Utilities.formatDate(hireDate, ss.getSpreadsheetTimeZone(), 'MM/dd/yyyy');
      } else {
        var hDate = new Date(hireDate);
        if (!isNaN(hDate.getTime())) {
          hireDateStr = Utilities.formatDate(hDate, ss.getSpreadsheetTimeZone(), 'MM/dd/yyyy');
        }
      }
    }

    var historySheet = ss.getSheetByName('Employee History');
    if (!historySheet) {
      historySheet = ss.insertSheet('Employee History');
      setupEmployeeHistorySheet(historySheet);
    }

    var historyRow = [
      lastDayStr,      // Date
      empName,         // Employee Name
      'Terminated',    // Event Type
      location,        // Location
      jobNumber,       // Job Number
      hireDateStr,     // Hire Date
      lastDayStr,      // Last Day
      lastDayReason,   // Last Day Reason
      '',              // Rehire Date
      '',              // Notes
      phoneNumber,     // Phone Number
      emailAddress,    // Email Address
      gloveSize,       // Glove Size
      sleeveSize       // Sleeve Size
    ];
    historySheet.appendRow(historyRow);

    if (locationColIdx !== -1) {
      sheet.getRange(editedRow, locationColIdx + 1).setValue('Previous Employee');
    }

    Utilities.sleep(500);
    sheet.deleteRow(editedRow);

    Logger.log('Employee "' + empName + '" terminated and moved to history');

  } catch (e) {
    Logger.log('[ERROR] handleLastDayChange: ' + e);
  }
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

    var employeesSheet = ss.getSheetByName(SHEET_EMPLOYEES);
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
      employeesSheet = ss.insertSheet(SHEET_EMPLOYEES);
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
    if (empJobNumberColIdx !== -1) newEmpRow[empJobNumberColIdx] = newJobNumber;
    if (empHireDateColIdx !== -1) newEmpRow[empHireDateColIdx] = rehireDateStr;
    if (empJobClassificationColIdx !== -1) newEmpRow[empJobClassificationColIdx] = newJobClassification;

    employeesSheet.appendRow(newEmpRow);

    var todayStr = Utilities.formatDate(new Date(), ss.getSpreadsheetTimeZone(), 'MM/dd/yyyy');
    var rehiredHistoryRow = [
      todayStr,                             // Date
      empName,                              // Employee Name
      'Rehired',                            // Event Type
      newLocation,                          // Location
      newJobNumber,                         // Job Number
      originalHireDate,                     // Hire Date
      '',                                   // Last Day
      '',                                   // Last Day Reason
      rehireDateStr,                        // Rehire Date
      'Rehired from Previous Employee',    // Notes
      '',                                   // Phone Number
      '',                                   // Email Address
      '',                                   // Glove Size
      ''                                    // Sleeve Size
    ];
    sheet.appendRow(rehiredHistoryRow);

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
 * @param {number} locationColIdx - Location column index
 * @param {number} jobNumberColIdx - Job Number column index
 */
function trackEmployeeChange(ss, sheet, editedRow, editedCol, newValue, oldValue, locationColIdx, jobNumberColIdx) {
  try {
    var empData = sheet.getRange(editedRow, 1, 1, sheet.getLastColumn()).getValues()[0];
    var empHeaders = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];

    var nameColIdx = 0;
    var hireDateColIdx = -1;

    for (var h = 0; h < empHeaders.length; h++) {
      var header = String(empHeaders[h]).toLowerCase().trim();
      if (header === 'hire date') hireDateColIdx = h;
    }

    var empName = empData[nameColIdx] || '';
    var location = locationColIdx !== -1 ? empData[locationColIdx] : '';
    var jobNumber = jobNumberColIdx !== -1 ? empData[jobNumberColIdx] : '';
    var hireDate = hireDateColIdx !== -1 ? empData[hireDateColIdx] : '';

    var todayStr = Utilities.formatDate(new Date(), ss.getSpreadsheetTimeZone(), 'MM/dd/yyyy');

    var hireDateStr = '';
    if (hireDate) {
      if (hireDate instanceof Date) {
        hireDateStr = Utilities.formatDate(hireDate, ss.getSpreadsheetTimeZone(), 'MM/dd/yyyy');
      } else {
        var hd = new Date(hireDate);
        if (!isNaN(hd.getTime())) {
          hireDateStr = Utilities.formatDate(hd, ss.getSpreadsheetTimeZone(), 'MM/dd/yyyy');
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

    if (editedCol === locationColIdx + 1) {
      changeType = 'Location Change';
      changeNotes = 'From: ' + (oldValue || 'N/A') + ' → ' + (newValue || 'N/A');
    } else if (editedCol === jobNumberColIdx + 1) {
      changeType = 'Job Number Change';
      changeNotes = 'From: ' + (oldValue || 'N/A') + ' → ' + (newValue || 'N/A');
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
  var employeesSheet = ss.getSheetByName(SHEET_EMPLOYEES);
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
    if (header === 'phone number') phoneNumberColIdx = h;
    if (header === 'email address') emailAddressColIdx = h;
    if (header === 'glove size') gloveSizeColIdx = h;
    if (header === 'sleeve size') sleeveSizeColIdx = h;
    if (header === 'job classification') jobClassificationColIdx = h;
  }

  // Get existing history to find last known state for each employee
  var historyData = [];
  if (historySheet.getLastRow() > 2) {
    historyData = historySheet.getRange(3, 1, historySheet.getLastRow() - 2, 14).getValues();
  }

  // Build map of last known state for each employee (most recent entry)
  // Also track Last Day, Last Day Reason, and Rehire Date to preserve them
  var lastKnownState = {};
  for (var hi = 0; hi < historyData.length; hi++) {
    var histName = (historyData[hi][1] || '').toString().trim().toLowerCase();
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

    // Format hire date
    var hireDateStr = '';
    if (hireDate) {
      if (hireDate instanceof Date) {
        hireDateStr = Utilities.formatDate(hireDate, ss.getSpreadsheetTimeZone(), 'MM/dd/yyyy');
      } else {
        var hd = new Date(hireDate);
        if (!isNaN(hd.getTime())) {
          hireDateStr = Utilities.formatDate(hd, ss.getSpreadsheetTimeZone(), 'MM/dd/yyyy');
        }
      }
    }

    // If no history exists for this employee, add initial "New Employee" entry
    if (!last) {
      var eventType = 'New Employee';
      historySheet.appendRow([
        todayStr,           // Date
        name,               // Employee Name
        eventType,          // Event Type
        currentLocation,    // Location
        currentJobNumber,   // Job Number
        hireDateStr,        // Hire Date
        '',                 // Last Day (new employee, no last day yet)
        '',                 // Last Day Reason
        '',                 // Rehire Date
        'Added to system',  // Notes
        phoneNumber,        // Phone Number
        emailAddress,       // Email Address
        gloveSize,          // Glove Size
        sleeveSize          // Sleeve Size
      ]);
      newEntries++;
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

      var changeType = changeTypes.length > 2 ? 'Multiple Changes' : changeTypes.join(' & ') + ' Change';
      var notesText = changeNotes.join('; ');

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

