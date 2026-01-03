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

    var assignedToCol = getCol(sheetName, 'Assigned To') || 8;
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

    if (assignedToLower === 'on shelf') {
      newStatus = 'On Shelf';
      newLocation = nameToLocation['on shelf'] || 'Helena';
    } else if (assignedToLower === 'packed for delivery') {
      newStatus = 'Ready For Delivery';
      newLocation = nameToLocation['packed for delivery'] || "Cody's Truck";
    } else if (assignedToLower === 'packed for testing') {
      newStatus = 'Ready For Test';
      newLocation = nameToLocation['packed for testing'] || "Cody's Truck";
    } else if (assignedToLower === 'in testing') {
      newStatus = 'In Testing';
      newLocation = nameToLocation['in testing'] || 'Arnett / JM Test';
    } else if (assignedToLower === 'failed rubber' || assignedToLower === 'not repairable') {
      newStatus = 'Failed Rubber';
      newLocation = 'Destroyed';
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

    if (colDateAssigned && colChangeOutDate) {
      var dateAssigned = sheet.getRange(editedRow, colDateAssigned).getValue();
      if (dateAssigned) {
        var isSleeve = (sheetName === SHEET_SLEEVES);
        var changeOutDate = calculateChangeOutDate(dateAssigned, newLocation, assignedTo, isSleeve);
        if (changeOutDate) {
          var changeOutCell = sheet.getRange(editedRow, colChangeOutDate);
          if (changeOutDate === 'N/A') {
            changeOutCell.setNumberFormat('@');
          } else {
            changeOutCell.setNumberFormat('MM/dd/yyyy');
          }
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
    var numCols = Math.min(lastCol || 11, 11);

    if (isLostLocate) {
      sheet.getRange(editedRow, 1, 1, numCols).setBackground('#ffccbc');
      sheet.getRange(editedRow, 11).setFontWeight('bold').setFontColor('#d32f2f');

      var itemNum = sheet.getRange(editedRow, 1).getValue();
      logEvent(sheetName + ' item ' + itemNum + ' marked as LOST-LOCATE at row ' + editedRow, 'INFO');
    } else {
      sheet.getRange(editedRow, 1, 1, numCols).setBackground(null);
      sheet.getRange(editedRow, 11).setFontWeight('normal').setFontColor(null);

      var itemNum2 = sheet.getRange(editedRow, 1).getValue();
      logEvent(sheetName + ' item ' + itemNum2 + ' LOST-LOCATE marker removed at row ' + editedRow, 'INFO');
    }

  } catch (e) {
    logEvent('handleNotesChange error: ' + e, 'ERROR');
  }
}

