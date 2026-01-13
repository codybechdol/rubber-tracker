/**
 * Glove Manager – Trigger Functions
 *
 * Functions for setting up and handling edit/change triggers.
 * Manages automatic updates when cells are edited in the spreadsheet.
 */

/**
 * Creates installable triggers for edit detection. Run this once from the Apps Script editor.
 * Go to Run > createEditTrigger
 *
 * IMPORTANT: This will delete all existing edit triggers and create new ones.
 */
function createEditTrigger() {
  var ss = SpreadsheetApp.getActive();
  var triggers = ScriptApp.getProjectTriggers();

  // Delete all existing onEdit/onChange triggers first
  var deleted = 0;
  for (var i = 0; i < triggers.length; i++) {
    var handlerName = triggers[i].getHandlerFunction();
    if (handlerName === 'onEditHandler' || handlerName === 'onChangeHandler' || handlerName === 'onEdit') {
      ScriptApp.deleteTrigger(triggers[i]);
      deleted++;
    }
  }
  Logger.log('Deleted ' + deleted + ' existing triggers');

  // Create new onEdit trigger (installable)
  ScriptApp.newTrigger('onEditHandler')
    .forSpreadsheet(ss)
    .onEdit()
    .create();
  Logger.log('Created onEditHandler trigger');

  // Create onChange trigger as backup (catches more changes)
  ScriptApp.newTrigger('onChangeHandler')
    .forSpreadsheet(ss)
    .onChange()
    .create();
  Logger.log('Created onChangeHandler trigger');

  SpreadsheetApp.getUi().alert('✅ Triggers created successfully!\n\n' +
    '• onEditHandler (for cell edits)\n' +
    '• onChangeHandler (backup for other changes)\n\n' +
    'The Change Out Date will now auto-update when you edit Date Assigned.');
}

/**
 * onChange handler - catches changes that onEdit might miss.
 * This is a backup trigger for more reliable change detection.
 */
function onChangeHandler(e) {
  try {
    if (!e) return;

    // onChange doesn't give us the specific cell, so we can't directly handle Date Assigned
    // But we can use this to catch paste operations and other changes
    Logger.log('onChangeHandler fired: changeType=' + (e.changeType || 'unknown'));

    // If it's an EDIT change type, the onEditHandler should have caught it
    // This is mainly for INSERT_ROW, INSERT_COLUMN, REMOVE_ROW, REMOVE_COLUMN, FORMAT, OTHER

    // Handle row deletion in Gloves/Sleeves sheets
    if (e.changeType === 'REMOVE_ROW') {
      var ss = SpreadsheetApp.getActiveSpreadsheet();
      var activeSheet = ss.getActiveSheet();
      var activeSheetName = activeSheet ? activeSheet.getName() : '';

      // If a row was deleted from Gloves or Sleeves, sync the New Items Log
      if (activeSheetName === 'Gloves' || activeSheetName === 'Sleeves') {
        Logger.log('Row deleted from ' + activeSheetName + ' - syncing New Items Log');

        // Use a slight delay to ensure the deletion is complete before syncing
        // Since we can't use Utilities.sleep in triggers reliably, we'll sync immediately
        syncNewItemsLogSilent();
      }
    }
  } catch (err) {
    Logger.log('Error in onChangeHandler: ' + err);
  }
}

/**
 * Silent version of syncNewItemsLogWithInventory - doesn't show UI alerts.
 * Used for automatic sync when rows are deleted.
 */
function syncNewItemsLogSilent() {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var glovesSheet = ss.getSheetByName('Gloves');
    var sleevesSheet = ss.getSheetByName('Sleeves');
    var inventorySheet = ss.getSheetByName('Inventory Reports');

    if (!inventorySheet) return;

    // Build sets of current item numbers
    var currentGloves = new Set();
    var currentSleeves = new Set();

    if (glovesSheet && glovesSheet.getLastRow() > 1) {
      var gloveData = glovesSheet.getRange(2, 1, glovesSheet.getLastRow() - 1, 1).getValues();
      gloveData.forEach(function(row) {
        var itemNum = String(row[0]).trim();
        if (itemNum) currentGloves.add(itemNum);
      });
    }

    if (sleevesSheet && sleevesSheet.getLastRow() > 1) {
      var sleeveData = sleevesSheet.getRange(2, 1, sleevesSheet.getLastRow() - 1, 1).getValues();
      sleeveData.forEach(function(row) {
        var itemNum = String(row[0]).trim();
        if (itemNum) currentSleeves.add(itemNum);
      });
    }

    // Check New Items Log entries against current inventory
    var data = inventorySheet.getDataRange().getValues();
    var inLogSection = false;
    var headerFound = false;
    var rowsToDelete = [];
    var removedItems = [];

    for (var i = 0; i < data.length; i++) {
      var firstCell = String(data[i][0]).trim();

      if (firstCell.indexOf('NEW ITEMS LOG') !== -1) {
        inLogSection = true;
        continue;
      }

      if (inLogSection && firstCell === 'Date Added') {
        headerFound = true;
        continue;
      }

      if (inLogSection && headerFound && firstCell && firstCell !== '') {
        var logItemNum = String(data[i][1]).trim();
        var logItemType = String(data[i][2]).trim();

        // Check if item still exists in inventory
        var exists = false;
        if (logItemType === 'Glove') {
          exists = currentGloves.has(logItemNum);
        } else if (logItemType === 'Sleeve') {
          exists = currentSleeves.has(logItemNum);
        }

        if (!exists && logItemNum) {
          rowsToDelete.push(i + 1);
          removedItems.push(logItemNum);
        }
      }
    }

    // Delete orphaned entries (from bottom to top)
    if (rowsToDelete.length > 0) {
      rowsToDelete.reverse();
      for (var r = 0; r < rowsToDelete.length; r++) {
        inventorySheet.deleteRow(rowsToDelete[r]);
      }

      // Also reinitialize known item numbers
      initializeKnownItemNumbers('Gloves');
      initializeKnownItemNumbers('Sleeves');

      // Update the inventory reports
      updateInventoryReports();

      ss.toast('Removed ' + removedItems.length + ' item(s) from New Items Log', '🗑️ Auto-Synced', 3);
      logEvent('Auto-synced New Items Log: removed items ' + removedItems.join(', '));
    }
  } catch (err) {
    Logger.log('Error in syncNewItemsLogSilent: ' + err);
  }
}

/**
 * Simple onEdit trigger - fires automatically on any edit.
 * This is a "simple trigger" that doesn't require manual setup.
 * Note: Simple triggers have limitations (no authorization for some services).
 * For full functionality, use the installable trigger (onEditHandler).
 */
function onEdit(e) {
  try {
    if (!e || !e.range) return;

    var sheet = e.range.getSheet();
    var sheetName = sheet.getName();
    var editedCol = e.range.getColumn();
    var editedRow = e.range.getRow();

    // Only process Gloves/Sleeves sheets for Date Assigned changes
    if ((sheetName === SHEET_GLOVES || sheetName === SHEET_SLEEVES) && editedCol === 5) {
      // Column E (5) = Date Assigned - directly update Change Out Date
      var ss = SpreadsheetApp.getActiveSpreadsheet();
      var isSleeve = (sheetName === SHEET_SLEEVES);
      var dateAssigned = sheet.getRange(editedRow, 5).getValue();  // Column E
      var location = sheet.getRange(editedRow, 6).getValue();      // Column F
      var assignedTo = sheet.getRange(editedRow, 8).getValue();    // Column H

      if (dateAssigned) {
        var changeOutDate = calculateChangeOutDate(dateAssigned, location, assignedTo, isSleeve);
        if (changeOutDate) {
          var changeOutCell = sheet.getRange(editedRow, 9);  // Column I
          if (changeOutDate === 'N/A') {
            changeOutCell.setNumberFormat('@');
          } else {
            changeOutCell.setNumberFormat('MM/dd/yyyy');
          }
          changeOutCell.setValue(changeOutDate);

          // Show confirmation toast
          ss.toast('Change Out Date updated to ' + changeOutDate, 'Auto-Calc', 3);
        }
      }
      return;  // Don't call processEdit again, we handled it
    }

    // For all other edits, use the standard processEdit
    processEdit(e);
  } catch (err) {
    Logger.log('Error in onEdit: ' + err);
  }
}

/**
 * Installable onEdit handler - called by the trigger.
 * This handles Date Assigned changes directly for reliable Change Out Date updates.
 */
function onEditHandler(e) {
  try {
    if (!e || !e.range) {
      Logger.log('onEditHandler: No event object or range');
      return;
    }

    var sheet = e.range.getSheet();
    var sheetName = sheet.getName();
    var editedCol = e.range.getColumn();
    var editedRow = e.range.getRow();

    Logger.log('onEditHandler fired: sheet=' + sheetName + ', row=' + editedRow + ', col=' + editedCol);

    // Handle Training Tracking sheet edits (Status and Completion Date columns)
    if (sheetName === 'Training Tracking') {
      handleTrainingTrackingEdit(e);
      return;  // Handled - don't continue to processEdit
    }

    // Handle new item number detection in Gloves/Sleeves (Column A = item number)
    if ((sheetName === 'Gloves' || sheetName === 'Sleeves') && editedCol === 1 && editedRow >= 2) {
      var newItemNum = e.range.getValue();
      var oldItemNum = e.oldValue;
      var itemNumStr = String(newItemNum).trim();

      // Check if an item number was REMOVED (cleared or changed)
      if (oldItemNum && String(oldItemNum).trim() !== '' &&
          (!newItemNum || String(newItemNum).trim() === '')) {
        // Item number was cleared - trigger removal handling
        Logger.log('Item number cleared: ' + oldItemNum + ' from ' + sheetName);
        handleItemRemoval(String(oldItemNum).trim(), sheetName);
      }
      // Check if this is a new item number
      else if (newItemNum && itemNumStr !== '') {
        if (isNewItemNumber(itemNumStr, sheetName)) {
          Logger.log('New item number detected: ' + itemNumStr + ' in ' + sheetName);
          promptNewItemSource(itemNumStr, sheetName, editedRow);
        }
      }
      // Don't return - allow other processing to continue
    }

    // Handle Date Assigned changes in Gloves/Sleeves directly
    if ((sheetName === 'Gloves' || sheetName === 'Sleeves') && editedCol === 5 && editedRow >= 2) {
      Logger.log('Date Assigned change detected in ' + sheetName + ' row ' + editedRow);

      var ss = SpreadsheetApp.getActiveSpreadsheet();
      var isSleeve = (sheetName === 'Sleeves');

      // Read values directly using hardcoded column numbers
      var dateAssigned = sheet.getRange(editedRow, 5).getValue();  // Column E = Date Assigned
      var location = sheet.getRange(editedRow, 6).getValue();       // Column F = Location
      var assignedTo = sheet.getRange(editedRow, 8).getValue();     // Column H = Assigned To

      Logger.log('Values: dateAssigned=' + dateAssigned + ', location=' + location + ', assignedTo=' + assignedTo);

      if (dateAssigned) {
        var changeOutDate = calculateChangeOutDate(dateAssigned, location, assignedTo, isSleeve);
        Logger.log('Calculated changeOutDate=' + changeOutDate);

        if (changeOutDate) {
          var changeOutCell = sheet.getRange(editedRow, 9);  // Column I = Change Out Date
          if (changeOutDate === 'N/A') {
            changeOutCell.setNumberFormat('@');
          } else {
            changeOutCell.setNumberFormat('MM/dd/yyyy');
          }
          changeOutCell.setValue(changeOutDate);
          Logger.log('Set Change Out Date to ' + changeOutDate);

          // Show toast confirmation
          ss.toast('Row ' + editedRow + ': Change Out Date → ' +
                   (changeOutDate instanceof Date ? Utilities.formatDate(changeOutDate, ss.getSpreadsheetTimeZone(), 'MM/dd/yyyy') : changeOutDate),
                   '✅ Auto-Updated', 3);
        }
      }
      return;  // Handled - don't continue to processEdit
    }

    // For all other edits, use standard processing
    processEdit(e);
  } catch (err) {
    Logger.log('Error in onEditHandler: ' + err);
  }
}

/**
 * Processes edit events for Glove/Sleeve Swaps and Gloves/Sleeves tabs.
 * Handles Stage 2-5 workflow logic:
 *   Stage 2: Picked checkbox checked - updates Pick List glove to "Ready For Delivery"
 *   Stage 3: Date Changed entered - completes swap, assigns glove to employee
 *   Stage 4: Date Changed removed - reverts Pick List glove to Stage 2 state
 *   Stage 5: Picked unchecked - reverts Pick List glove to Stage 1 state
 *
 * @param {Object} e - The edit event object from Google Sheets
 */
function processEdit(e) {
  if (!e || !e.range) return;

  var sheet = e.range.getSheet();
  var sheetName = sheet.getName();
  var editedRow = e.range.getRow();
  var editedCol = e.range.getColumn();
  var newValue = e.value;

  // Ignore header rows
  if (editedRow < 2) return;

  // Only process edits in Glove Swaps, Sleeve Swaps, Gloves, Sleeves, Employees, or Employee History tabs
  if (sheetName !== SHEET_GLOVE_SWAPS && sheetName !== SHEET_SLEEVE_SWAPS &&
      sheetName !== SHEET_GLOVES && sheetName !== SHEET_SLEEVES &&
      sheetName !== SHEET_EMPLOYEES && sheetName !== 'Employee History') {
    return;
  }

  logEvent('Edit detected in ' + sheetName + ' at ' + e.range.getA1Notation() + ' (Value: ' + newValue + ')', 'DEBUG');

  var ss = SpreadsheetApp.getActiveSpreadsheet();

  // Handle Employee History sheet edits (Rehire Date column I = column 9)
  if (sheetName === 'Employee History') {
    // Get Rehire Date column dynamically
    var histHeaders = sheet.getRange(2, 1, 1, sheet.getLastColumn()).getValues()[0];
    var rehireDateColIdx = -1;
    for (var rh = 0; rh < histHeaders.length; rh++) {
      if (String(histHeaders[rh]).toLowerCase().trim() === 'rehire date') {
        rehireDateColIdx = rh + 1;  // 1-based
        break;
      }
    }

    if (rehireDateColIdx !== -1 && editedCol === rehireDateColIdx && editedRow > 2) {
      handleRehireDateChange(ss, sheet, editedRow, newValue);
    }
    return;
  }

  // Handle Employees sheet edits (Last Day, Location, or Job Number columns)
  if (sheetName === SHEET_EMPLOYEES) {
    // Get column indices dynamically
    var empHeaders = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    var lastDayColIdx = -1;
    var locationColIdx = -1;
    var jobNumberColIdx = -1;

    for (var h = 0; h < empHeaders.length; h++) {
      var headerLower = String(empHeaders[h]).toLowerCase().trim();
      if (headerLower === 'last day') lastDayColIdx = h + 1;  // 1-based
      if (headerLower === 'location') locationColIdx = h + 1;
      if (headerLower === 'job number') jobNumberColIdx = h + 1;
    }

    // Handle Last Day change - terminate employee
    if (lastDayColIdx !== -1 && editedCol === lastDayColIdx) {
      handleLastDayChange(ss, sheet, editedRow, newValue);
      return;
    }

    // Handle Location or Job Number change - track in history
    if ((locationColIdx !== -1 && editedCol === locationColIdx) ||
        (jobNumberColIdx !== -1 && editedCol === jobNumberColIdx)) {
      var oldValue = e.oldValue || '';
      trackEmployeeChange(ss, sheet, editedRow, editedCol, newValue, oldValue, locationColIdx, jobNumberColIdx);
    }
    return;
  }

  // Handle Gloves/Sleeves tab edits (Assigned To, Date Assigned, Status, or Notes columns)
  if (sheetName === SHEET_GLOVES || sheetName === SHEET_SLEEVES) {
    // Use COLS constants for reliable column indices
    var assignedToCol = COLS.INVENTORY.ASSIGNED_TO;     // Column H = 8
    var dateAssignedCol = COLS.INVENTORY.DATE_ASSIGNED; // Column E = 5
    var statusCol = COLS.INVENTORY.STATUS;              // Column G = 7
    var notesCol = COLS.INVENTORY.NOTES;                // Column K = 11

    logEvent('processEdit: sheetName=' + sheetName + ', editedCol=' + editedCol + ', assignedToCol=' + assignedToCol + ', dateAssignedCol=' + dateAssignedCol, 'DEBUG');

    if (editedCol === assignedToCol) {
      handleInventoryAssignedToChange(ss, sheet, sheetName, editedRow, newValue);
      return;
    }


    if (editedCol === dateAssignedCol) {
      // Direct inline handling for Date Assigned changes - more reliable than separate function
      try {
        var isSleeve = (sheetName === SHEET_SLEEVES);
        var dateAssigned = sheet.getRange(editedRow, COLS.INVENTORY.DATE_ASSIGNED).getValue();
        var location = sheet.getRange(editedRow, COLS.INVENTORY.LOCATION).getValue();
        var assignedTo = sheet.getRange(editedRow, COLS.INVENTORY.ASSIGNED_TO).getValue();

        logEvent('Date Assigned changed: row=' + editedRow + ', date=' + dateAssigned + ', assignedTo=' + assignedTo + ', location=' + location, 'DEBUG');

        if (dateAssigned) {
          var changeOutDate = calculateChangeOutDate(dateAssigned, location, assignedTo, isSleeve);
          if (changeOutDate) {
            var changeOutCell = sheet.getRange(editedRow, COLS.INVENTORY.CHANGE_OUT_DATE);
            if (changeOutDate === 'N/A') {
              changeOutCell.setNumberFormat('@');
            } else {
              changeOutCell.setNumberFormat('MM/dd/yyyy');
            }
            changeOutCell.setValue(changeOutDate);
            logEvent('Set Change Out Date to ' + changeOutDate + ' for row ' + editedRow, 'DEBUG');
          }
        }
      } catch (dateErr) {
        logEvent('Error updating Change Out Date: ' + dateErr, 'ERROR');
      }
      return;
    }

    // Handle Notes column edits (LOST-LOCATE highlighting)
    if (editedCol === notesCol) {
      handleNotesChange(ss, sheet, sheetName, editedRow, newValue);
      return;
    }
  }

  // Handle Glove Swaps or Sleeve Swaps tab edits
  if (sheetName === SHEET_GLOVE_SWAPS || sheetName === SHEET_SLEEVE_SWAPS) {
    var isGloveSwaps = (sheetName === SHEET_GLOVE_SWAPS);
    var inventorySheetName = isGloveSwaps ? SHEET_GLOVES : SHEET_SLEEVES;
    var inventorySheet = ss.getSheetByName(inventorySheetName);

    if (!inventorySheet) {
      logEvent('processEdit: Inventory sheet not found: ' + inventorySheetName, 'ERROR');
      return;
    }

    // Column G (7) = Pick List Item # (manual edit), Column I (9) = Picked checkbox, Column J (10) = Date Changed
    if (editedCol === 7) {
      // Pick List Item # manually edited
      handlePickListManualEdit(ss, sheet, inventorySheet, editedRow, newValue, isGloveSwaps);
    } else if (editedCol === 9) {
      // Picked checkbox changed
      handlePickedCheckboxChange(ss, sheet, inventorySheet, editedRow, newValue, isGloveSwaps);
    } else if (editedCol === 10) {
      // Date Changed column edited - read actual cell value to get Date object
      var cellValue = sheet.getRange(editedRow, 10).getValue();
      handleDateChangedEdit(ss, sheet, inventorySheet, editedRow, cellValue, isGloveSwaps);
    }
  }
}

