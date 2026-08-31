/**
 * Glove Manager – Inventory Change Handlers
 *
 * Functions for handling changes to inventory sheets (Gloves/Sleeves).
 * Manages Assigned To changes, Date changes, and Notes highlighting.
 */

/**
 * Helper function to get column index by header name.
 * @param {string} sheetName - The sheet name
 * @param {string} headerName - The header name to find
 * @return {number|null} Column index (1-based) or null if not found
 */
function getCol(sheetName, headerName) {
  var mapping = getColumnMapping(sheetName);
  if (!mapping || !mapping[headerName]) {
    logEvent('Column "' + headerName + '" not found in sheet "' + sheetName + '"', 'ERROR');
    return null;
  }
  return mapping[headerName];
}

/**
 * Handles changes to the Assigned To column in Gloves/Sleeves tabs.
 * Updates Status and Location based on the new assignment.
 *
 * @param {Spreadsheet} ss - The active spreadsheet
 * @param {Sheet} sheet - The sheet being edited
 * @param {string} sheetName - Name of the sheet
 * @param {number} editedRow - Row number that was edited
 * @param {string} newValue - The new assigned to value
 */
function handleInventoryAssignedToChange(ss, sheet, sheetName, editedRow, newValue) {
  if (editedRow < 2) return;

  var lock = null;
  try {
    try {
      lock = LockService.getScriptLock();
      lock.waitLock(30000);
    } catch (lockErr) {
      lock = null;
    }

    var assignedToCol = getCol(sheetName, 'Assigned To') || COLS.INVENTORY.ASSIGNED_TO;
    var actualValue = sheet.getRange(editedRow, assignedToCol).getValue();

    logEvent('handleInventoryAssignedToChange ENTRY: Row=' + editedRow + ', newValue=' + newValue + ', actualValue=' + actualValue, 'DEBUG');

    var employeesSheet = ss.getSheetByName(SHEET_EMPLOYEES);
    if (!employeesSheet) {
      logEvent('handleInventoryAssignedToChange: Employees sheet not found!', 'ERROR');
      return;
    }

    var empData = employeesSheet.getDataRange().getValues();
    var empHeaders = empData[0];
    var nameColIdx = 0;
    var locationColIdx = -1;

    for (var h = 0; h < empHeaders.length; h++) {
      if (String(empHeaders[h]).trim().toLowerCase() === 'location') {
        locationColIdx = h;
        break;
      }
    }

    if (locationColIdx === -1) {
      logEvent('handleInventoryAssignedToChange: Location column not found in Employees sheet!', 'ERROR');
      locationColIdx = 2;
    }

    var nameToLocation = {};
    for (var i = 1; i < empData.length; i++) {
      var name = (empData[i][nameColIdx] || '').toString().trim().toLowerCase();
      var loc = empData[i][locationColIdx] || '';
      if (name) nameToLocation[name] = loc;
    }

    var previousEmployeeNames = new Set();
    var employeeHistorySheet = ss.getSheetByName('Employee History');
    if (employeeHistorySheet && employeeHistorySheet.getLastRow() > 2) {
      var historyData = employeeHistorySheet.getRange(3, 1, employeeHistorySheet.getLastRow() - 2, 10).getValues();
      for (var hi = 0; hi < historyData.length; hi++) {
        var histName = (historyData[hi][1] || '').toString().trim();
        var histNameLower = histName.toLowerCase();
        var histLocation = (historyData[hi][3] || '').toString().trim().toLowerCase();

        if (histLocation === 'previous employee' && histName && !nameToLocation[histNameLower]) {
          nameToLocation[histNameLower] = 'Previous Employee';
          previousEmployeeNames.add(histNameLower);
        }
      }
    }

    logEvent('handleInventoryAssignedToChange: Built nameToLocation map with ' + Object.keys(nameToLocation).length + ' entries', 'DEBUG');

    var assignedTo = (actualValue !== undefined && actualValue !== null && actualValue !== '')
                     ? actualValue.toString().trim()
                     : (newValue || '').toString().trim();
    var assignedToLower = assignedTo.toLowerCase();

    var newStatus = '';
    var newLocation = '';

    if (assignedToLower === 'on shelf' || assignedToLower === '') {
      newStatus = 'On Shelf';
      newLocation = nameToLocation['on shelf'] || 'Helena';
      var todayFormatted = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'MM/dd/yyyy');
      sheet.getRange(editedRow, COLS.INVENTORY.DATE_ASSIGNED).setValue(todayFormatted);
      if (COLS.INVENTORY.PICKED_FOR) sheet.getRange(editedRow, COLS.INVENTORY.PICKED_FOR).setValue('');
      try {
        var ui = SpreadsheetApp.getUi();
        var curEsl = COLS.INVENTORY.ESL_ID ? sheet.getRange(editedRow, COLS.INVENTORY.ESL_ID).getValue() : '';
        var msg = 'Enter New Test Date (MM/DD/YYYY):';
        if (!curEsl || curEsl.toString().trim() === '') {
          msg = 'Item has no ESL ID.\nEnter Test Date and ESL ID (e.g. ' + todayFormatted + ', 5194269):';
        }
        var resp = ui.prompt('Return to Shelf', msg, ui.ButtonSet.OK_CANCEL);
        if (resp && resp.getSelectedButton() === ui.Button.OK) {
          var respText = (resp.getResponseText() || '').trim();
          if (respText) {
            var parts = respText.split(/[,;\s]+/);
            if (parts[0] && parts[0].indexOf('/') !== -1) {
              sheet.getRange(editedRow, COLS.INVENTORY.TEST_DATE).setValue(parts[0]);
            }
            if (parts.length > 1 && parts[1] && COLS.INVENTORY.ESL_ID && (!curEsl || curEsl.toString().trim() === '')) {
              sheet.getRange(editedRow, COLS.INVENTORY.ESL_ID).setValue(parts[1]);
            }
          }
        }
      } catch (uiErr) { /* non-interactive execution */ }
    } else if (assignedToLower === 'packed for delivery') {
      newStatus = 'Ready For Delivery';
      newLocation = nameToLocation['packed for delivery'] || "Cody's Truck";
    } else if (assignedToLower === 'packed for testing') {
      newStatus = 'Ready For Test';
      newLocation = nameToLocation['packed for testing'] || "Cody's Truck";
    } else if (assignedToLower === 'in testing') {
      newStatus = 'In Testing';
      newLocation = nameToLocation['in testing'] || 'Arnett / JM Test';
    } else if (assignedToLower === 'failed rubber' || assignedToLower === 'failed' || assignedToLower === 'not repairable') {
      newStatus = 'Failed Rubber';
      newLocation = 'Destroyed';
      var todayFormatted = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'MM/dd/yyyy');
      sheet.getRange(editedRow, COLS.INVENTORY.DATE_ASSIGNED).setValue(todayFormatted);
      try {
        var ui = SpreadsheetApp.getUi();
        var currentNote = sheet.getRange(editedRow, COLS.INVENTORY.NOTES).getValue();
        if (!currentNote || currentNote.toString().trim() === '') {
          var resp = ui.prompt(
            'Failed Rubber Reason & Test Date',
            'How did this item fail?\n1 = Electrical\n2 = Visual\n3 = Damaged In Field\n\nFormat: [Reason], [Test Date]\n(e.g., 2, ' + todayFormatted + '):',
            ui.ButtonSet.OK_CANCEL
          );
          if (resp && resp.getSelectedButton() === ui.Button.OK) {
            var input = (resp.getResponseText() || '').trim();
            var parts = input.split(/[,;]+/);
            var reasonPart = (parts[0] || '').trim();
            var datePart = (parts[1] || '').trim();

            var finalReason = 'Visual';
            if (reasonPart === '1' || reasonPart.toLowerCase() === 'electrical') finalReason = 'Electrical';
            else if (reasonPart === '2' || reasonPart.toLowerCase() === 'visual') finalReason = 'Visual';
            else if (reasonPart === '3' || reasonPart.toLowerCase().indexOf('damage') !== -1 || reasonPart.toLowerCase().indexOf('field') !== -1) finalReason = 'Damaged In Field';
            else if (reasonPart) finalReason = reasonPart;
            sheet.getRange(editedRow, COLS.INVENTORY.NOTES).setValue(finalReason);

            if (datePart && (datePart.indexOf('/') !== -1 || datePart.indexOf('-') !== -1)) {
              sheet.getRange(editedRow, COLS.INVENTORY.TEST_DATE).setValue(datePart);
            }
          }
        }
      } catch (uiErr) {
        // UI unavailable
      }
    } else if (assignedToLower === 'lost') {
      newStatus = 'Lost';
      newLocation = 'Lost';
    } else if (nameToLocation[assignedToLower]) {
      newStatus = 'Assigned';
      newLocation = nameToLocation[assignedToLower];
    } else if (assignedTo !== '') {
      logEvent('handleInventoryAssignedToChange: Employee "' + assignedTo + '" not found', 'WARNING');
      newStatus = 'Assigned';
      newLocation = 'Unknown';
    }

    var colStatus = COLS.INVENTORY.STATUS;
    var colLocation = COLS.INVENTORY.LOCATION;
    var colDateAssigned = COLS.INVENTORY.DATE_ASSIGNED;
    var colChangeOutDate = COLS.INVENTORY.CHANGE_OUT_DATE;

    if (newStatus) {
      sheet.getRange(editedRow, colStatus).setValue(newStatus);
    }
    if (newLocation) {
      sheet.getRange(editedRow, colLocation).setValue(newLocation);
    }

    if (newStatus === 'Assigned' || (newStatus && newStatus !== 'Ready For Delivery' && newStatus !== 'On Shelf' && newStatus !== 'In Testing')) {
      try {
        var colPicked = COLS.INVENTORY.PICKED_FOR;
        if (colPicked) sheet.getRange(editedRow, colPicked).setValue('');
      } catch (pErr) { /* ignore */ }
    }

    if (colDateAssigned && colChangeOutDate) {
      var dateAssigned = sheet.getRange(editedRow, colDateAssigned).getValue();
      if (dateAssigned) {
        var isSleeve = (sheetName === SHEET_SLEEVES);
        var changeOutDate = calculateChangeOutDate(dateAssigned, newLocation, assignedTo, isSleeve);
        if (changeOutDate) {
          var changeOutCell = sheet.getRange(editedRow, colChangeOutDate);
          try {
            if (changeOutDate === 'N/A') {
              changeOutCell.setNumberFormat('@');
            } else {
              changeOutCell.setNumberFormat('MM/dd/yyyy');
            }
          } catch (fmtErr) { /* Ignore format errors on typed columns */ }
          changeOutCell.setValue(changeOutDate);
        }
      }
    }

  } catch (e) {
    logEvent('handleInventoryAssignedToChange error: ' + e, 'ERROR');
  } finally {
    if (lock) lock.releaseLock();
  }
}

/**
 * Handles changes to the Notes column in Gloves/Sleeves tabs.
 * Applies highlighting for LOST-LOCATE markers.
 *
 * @param {Spreadsheet} ss - The active spreadsheet
 * @param {Sheet} sheet - The sheet being edited
 * @param {string} sheetName - Name of the sheet
 * @param {number} editedRow - Row number that was edited
 * @param {string} newValue - The new notes value
 */
function handleNotesChange(ss, sheet, sheetName, editedRow, newValue) {
  if (editedRow < 2) return;
  if (!sheet) {
    logEvent('handleNotesChange: sheet is undefined', 'ERROR');
    return;
  }

  try {
    var notesValue = (newValue || '').toString().trim().toUpperCase();
    var isLostLocate = notesValue.indexOf('LOST-LOCATE') !== -1 ||
                       notesValue.indexOf('LOST LOCATE') !== -1 ||
                       notesValue === 'LOCATE';

    var lastCol = sheet.getLastColumn();
    var numCols = Math.min(lastCol || COLS.INVENTORY.NOTES, COLS.INVENTORY.NOTES);

    if (isLostLocate) {
      sheet.getRange(editedRow, 1, 1, numCols).setBackground('#ffccbc');
      sheet.getRange(editedRow, COLS.INVENTORY.NOTES).setFontWeight('bold').setFontColor('#d32f2f');

      var itemNum = sheet.getRange(editedRow, 1).getValue();
      logEvent(sheetName + ' item ' + itemNum + ' marked as LOST-LOCATE at row ' + editedRow, 'INFO');
    } else {
      sheet.getRange(editedRow, 1, 1, numCols).setBackground(null);
      sheet.getRange(editedRow, COLS.INVENTORY.NOTES).setFontWeight('normal').setFontColor(null);

      var itemNum2 = sheet.getRange(editedRow, 1).getValue();
      logEvent(sheetName + ' item ' + itemNum2 + ' LOST-LOCATE marker removed at row ' + editedRow, 'INFO');
    }

  } catch (e) {
    logEvent('handleNotesChange error: ' + e, 'ERROR');
  }
}

