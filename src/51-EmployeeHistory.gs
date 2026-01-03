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

    for (var h = 0; h < empHeaders.length; h++) {
      var header = String(empHeaders[h]).toLowerCase().trim();
      if (header === 'location') locationColIdx = h;
      if (header === 'job number') jobNumberColIdx = h;
      if (header === 'hire date') hireDateColIdx = h;
      if (header === 'last day') lastDayColIdx = h;
      if (header === 'last day reason') lastDayReasonColIdx = h;
    }

    var empName = empData[nameColIdx] || '';
    var location = locationColIdx !== -1 ? empData[locationColIdx] : '';
    var jobNumber = jobNumberColIdx !== -1 ? empData[jobNumberColIdx] : '';
    var lastDayReason = lastDayReasonColIdx !== -1 ? empData[lastDayReasonColIdx] : '';
    var hireDate = hireDateColIdx !== -1 ? empData[hireDateColIdx] : '';

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
      lastDayStr,
      empName,
      'Terminated',
      location,
      jobNumber,
      hireDateStr,
      lastDayStr,
      lastDayReason,
      '',
      ''
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

    if (!employeesSheet) {
      employeesSheet = ss.insertSheet(SHEET_EMPLOYEES);
    }

    var empHeaders = employeesSheet.getRange(1, 1, 1, employeesSheet.getLastColumn()).getValues()[0];
    var empNameColIdx = 0;
    var empLocationColIdx = -1;
    var empJobNumberColIdx = -1;
    var empHireDateColIdx = -1;

    for (var eh = 0; eh < empHeaders.length; eh++) {
      var empHeader = String(empHeaders[eh]).toLowerCase().trim();
      if (empHeader === 'location') empLocationColIdx = eh;
      if (empHeader === 'job number') empJobNumberColIdx = eh;
      if (empHeader === 'hire date') empHireDateColIdx = eh;
    }

    var newEmpRow = [];
    for (var c = 0; c < empHeaders.length; c++) {
      newEmpRow.push('');
    }

    newEmpRow[empNameColIdx] = empName;
    if (empLocationColIdx !== -1) newEmpRow[empLocationColIdx] = newLocation;
    if (empJobNumberColIdx !== -1) newEmpRow[empJobNumberColIdx] = newJobNumber;
    if (empHireDateColIdx !== -1) newEmpRow[empHireDateColIdx] = rehireDateStr;

    employeesSheet.appendRow(newEmpRow);

    var todayStr = Utilities.formatDate(new Date(), ss.getSpreadsheetTimeZone(), 'MM/dd/yyyy');
    var rehiredHistoryRow = [
      todayStr,
      empName,
      'Rehired',
      newLocation,
      newJobNumber,
      originalHireDate,
      '',
      '',
      rehireDateStr,
      'Rehired from Previous Employee'
    ];
    sheet.appendRow(rehiredHistoryRow);

    ui.alert('✅ Employee Rehired!',
      'Employee: ' + empName + '\n' +
      'Location: ' + newLocation + '\n' +
      'Job Number: ' + (newJobNumber || 'N/A') + '\n' +
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
      todayStr,
      empName,
      changeType,
      location,
      jobNumber,
      hireDateStr,
      '',
      '',
      '',
      changeNotes
    ];
    historySheet.appendRow(historyRow);

    Logger.log('Tracked ' + changeType + ' for employee "' + empName + '"');

  } catch (e) {
    Logger.log('[ERROR] trackEmployeeChange: ' + e);
  }
}

/**
 * Saves employee location and job number changes to Employee History.
 * Tracks every change in location and/or job number.
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

  var nameColIdx = 0;
  var locationColIdx = -1;
  var jobNumberColIdx = -1;
  var hireDateColIdx = -1;

  for (var h = 0; h < empHeaders.length; h++) {
    var header = String(empHeaders[h]).toLowerCase().trim();
    if (header === 'location') locationColIdx = h;
    if (header === 'job number') jobNumberColIdx = h;
    if (header === 'hire date') hireDateColIdx = h;
  }

  var historyData = [];
  if (historySheet.getLastRow() > 2) {
    historyData = historySheet.getRange(3, 1, historySheet.getLastRow() - 2, 10).getValues();
  }

  var lastKnownState = {};
  for (var hi = 0; hi < historyData.length; hi++) {
    var histName = (historyData[hi][1] || '').toString().trim().toLowerCase();
    if (histName) {
      lastKnownState[histName] = {
        location: historyData[hi][3] || '',
        jobNumber: historyData[hi][4] || ''
      };
    }
  }

  var todayStr = Utilities.formatDate(new Date(), ss.getSpreadsheetTimeZone(), 'MM/dd/yyyy');
  var newEntries = 0;

  for (var i = 1; i < empData.length; i++) {
    var name = (empData[i][nameColIdx] || '').toString().trim();
    if (!name) continue;

    var nameLower = name.toLowerCase();
    var currentLocation = locationColIdx !== -1 ? (empData[i][locationColIdx] || '').toString().trim() : '';
    var currentJobNumber = jobNumberColIdx !== -1 ? (empData[i][jobNumberColIdx] || '').toString().trim() : '';
    var hireDate = hireDateColIdx !== -1 ? empData[i][hireDateColIdx] : '';

    if (currentLocation.toLowerCase() === 'previous employee') continue;

    var last = lastKnownState[nameLower];

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

    if (!last) {
      var eventType = 'Current State';
      historySheet.appendRow([todayStr, name, eventType, currentLocation, currentJobNumber, hireDateStr, '', '', '', '']);
      newEntries++;
      lastKnownState[nameLower] = { location: currentLocation, jobNumber: currentJobNumber };
      continue;
    }

    var locationChanged = last.location !== currentLocation;
    var jobNumberChanged = last.jobNumber !== currentJobNumber;

    if (locationChanged || jobNumberChanged) {
      var changeType = '';
      if (locationChanged && jobNumberChanged) {
        changeType = 'Location & Job # Change';
      } else if (locationChanged) {
        changeType = 'Location Change';
      } else {
        changeType = 'Job Number Change';
      }

      var changeNotes = '';
      if (locationChanged) {
        changeNotes += 'From: ' + (last.location || 'N/A') + ' → ' + currentLocation;
      }
      if (jobNumberChanged) {
        if (changeNotes) changeNotes += '; ';
        changeNotes += 'Job#: ' + (last.jobNumber || 'N/A') + ' → ' + currentJobNumber;
      }

      historySheet.appendRow([todayStr, name, changeType, currentLocation, currentJobNumber, hireDateStr, '', '', '', changeNotes]);
      newEntries++;
      lastKnownState[nameLower] = { location: currentLocation, jobNumber: currentJobNumber };
    }
  }

  return newEntries;
}

