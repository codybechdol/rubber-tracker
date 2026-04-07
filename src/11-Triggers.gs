/**
 * Glove Manager – Trigger Functions
 *
 * Functions for setting up and handling edit/change triggers.
 * Manages automatic updates when cells are edited in the spreadsheet.
 */

/**
 * Clears ALL background/time-based triggers that might be causing permission issues.
 * Run this from the menu if you see PERMISSION_DENIED errors.
 * Menu: Glove Manager → 🔧 Utilities → 🗑️ Clear Background Triggers
 */
function clearAllBackgroundTriggers() {
  var triggers = ScriptApp.getProjectTriggers();
  var deleted = 0;
  var kept = 0;

  for (var i = 0; i < triggers.length; i++) {
    var trigger = triggers[i];
    var handlerName = trigger.getHandlerFunction();
    var triggerType = trigger.getEventType();

    // Delete time-based triggers (background sync triggers)
    if (triggerType === ScriptApp.EventType.CLOCK) {
      ScriptApp.deleteTrigger(trigger);
      deleted++;
      Logger.log('Deleted time-based trigger: ' + handlerName);
    } else {
      kept++;
      Logger.log('Kept trigger: ' + handlerName + ' (type: ' + triggerType + ')');
    }
  }

  // Clear any pending sync requests from ScriptProperties
  try {
    var props = PropertiesService.getScriptProperties();
    props.deleteProperty('JOB_TRACKING_SYNC_PENDING');
    Logger.log('Cleared pending sync request from ScriptProperties');
  } catch (propErr) {
    Logger.log('Could not clear ScriptProperties (may not have access): ' + propErr);
  }

  SpreadsheetApp.getUi().alert('✅ Background Triggers Cleared!\n\n' +
    'Deleted: ' + deleted + ' time-based trigger(s)\n' +
    'Kept: ' + kept + ' edit/change trigger(s)\n\n' +
    'This should fix PERMISSION_DENIED errors from background syncs.');
}

/**
 * Diagnoses current authorization state and shows account info.
 * Menu: Glove Manager → 🔧 Utilities → 🔍 Diagnose Auth Issues
 */
function diagnoseAuthIssues() {
  var report = [];

  // Check current user
  try {
    var email = Session.getActiveUser().getEmail();
    report.push('✅ Current User: ' + (email || '(Could not determine - may need re-auth)'));
  } catch (e) {
    report.push('❌ Could not get current user: ' + e.message);
  }

  // Check effective user (the account that owns the script)
  try {
    var effectiveEmail = Session.getEffectiveUser().getEmail();
    report.push('✅ Effective User (script owner): ' + (effectiveEmail || '(unknown)'));
  } catch (e) {
    report.push('❌ Could not get effective user: ' + e.message);
  }

  // Check ScriptProperties access
  try {
    var props = PropertiesService.getScriptProperties();
    var testKey = 'AUTH_TEST_' + new Date().getTime();
    props.setProperty(testKey, 'test');
    props.deleteProperty(testKey);
    report.push('✅ ScriptProperties: Read/Write OK');
  } catch (e) {
    report.push('❌ ScriptProperties ERROR: ' + e.message);
    report.push('   → This causes PERMISSION_DENIED errors');
  }

  // List all triggers
  try {
    var triggers = ScriptApp.getProjectTriggers();
    report.push('\n📋 Current Triggers (' + triggers.length + '):');
    for (var i = 0; i < triggers.length; i++) {
      var t = triggers[i];
      report.push('   • ' + t.getHandlerFunction() + ' (' + t.getEventType() + ')');
    }
  } catch (e) {
    report.push('❌ Could not list triggers: ' + e.message);
  }

  // Check spreadsheet access
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    report.push('\n✅ Spreadsheet: ' + ss.getName());
    report.push('   ID: ' + ss.getId());
  } catch (e) {
    report.push('❌ Could not access spreadsheet: ' + e.message);
  }

  SpreadsheetApp.getUi().alert('🔍 Authorization Diagnosis\n\n' + report.join('\n'));
  Logger.log('Auth Diagnosis:\n' + report.join('\n'));
}

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

    // =========================================================================
    // DUPLICATE ITEM NUMBER VALIDATION (Column A edits on inventory sheets)
    // =========================================================================
    // Check if this is an item number edit on one of the unique-item sheets
    if (editedCol === 1 && editedRow >= 2) {
      // UNIQUE_ITEM_SHEETS is defined in Code.gs - these sheets require unique item numbers
      var uniqueSheets = [SHEET_GLOVES, SHEET_SLEEVES, SHEET_BLANKETS, SHEET_HV_TESTERS, SHEET_PHASING_SETS, SHEET_AED];
      if (uniqueSheets.indexOf(sheetName) !== -1) {
        // Validate uniqueness - this will clear the cell and show error if duplicate
        if (!validateUniqueItemNumber(e, sheetName)) {
          return;  // Stop processing if duplicate was found
        }
      }
    }

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
          try {
            if (changeOutDate === 'N/A') {
              changeOutCell.setNumberFormat('@');
            } else {
              changeOutCell.setNumberFormat('MM/dd/yyyy');
            }
          } catch (fmtErr) { /* Ignore format errors on typed columns */ }
          changeOutCell.setValue(changeOutDate);

          // Show confirmation toast
          ss.toast('Change Out Date updated to ' + changeOutDate, 'Auto-Calc', 3);
        }
      }
      return;  // Don't call processEdit again, we handled it
    }

    // Handle Blankets sheet - Test Date (column D) or Date Assigned (column E) changes update Change Out Date
    if (sheetName === SHEET_BLANKETS && (editedCol === 4 || editedCol === 5)) {
      // Column D (4) = Test Date, Column E (5) = Date Assigned
      // Change Out Date is based on Test Date + 12 months for blankets
      var ss = SpreadsheetApp.getActiveSpreadsheet();
      var testDate = sheet.getRange(editedRow, 4).getValue();      // Column D - Test Date
      var location = sheet.getRange(editedRow, 6).getValue();      // Column F
      var assignedTo = sheet.getRange(editedRow, 8).getValue();    // Column H

      if (testDate) {
        var changeOutDate = calculateBlanketChangeOut(testDate, assignedTo, location);
        if (changeOutDate) {
          var changeOutCell = sheet.getRange(editedRow, 9);  // Column I
          try {
            if (changeOutDate === 'N/A') {
              changeOutCell.setNumberFormat('@');
            } else {
              changeOutCell.setNumberFormat('MM/dd/yyyy');
            }
          } catch (fmtErr) { /* Ignore format errors on typed columns */ }
          changeOutCell.setValue(changeOutDate);

          // Auto-detect and set Type from item number if not set
          var itemNumber = sheet.getRange(editedRow, 1).getValue();  // Column A
          var currentType = sheet.getRange(editedRow, 2).getValue(); // Column B
          if (itemNumber && !currentType) {
            var detectedType = detectBlanketType(itemNumber);
            sheet.getRange(editedRow, 2).setValue(detectedType);
          }

          // Show confirmation toast
          ss.toast('Change Out Date updated to ' + changeOutDate, 'Auto-Calc', 3);
        }
      }
      return;  // Don't call processEdit again, we handled it
    }

    // Handle Blankets sheet - Assigned To (column H) changes auto-populate Location
    if (sheetName === SHEET_BLANKETS && editedCol === 8 && editedRow >= 2) {
      var ss = SpreadsheetApp.getActiveSpreadsheet();
      handleBlanketAssignedToChange(ss, sheet, editedRow, e.value);
      return;  // Don't call processEdit again, we handled it
    }

    // Handle HV Testers sheet - Assigned To (column H) changes auto-populate Status and Location
    if (sheetName === SHEET_HV_TESTERS && editedCol === 8 && editedRow >= 2) {
      var ss = SpreadsheetApp.getActiveSpreadsheet();
      handleHVTesterAssignedToChange(ss, sheet, editedRow, e.value);
      return;  // Don't call processEdit again, we handled it
    }

    // Handle HV Testers sheet - Calibration Date (column D) changes auto-calculate Change Out Date
    if (sheetName === SHEET_HV_TESTERS && editedCol === 4 && editedRow >= 2) {
      var ss = SpreadsheetApp.getActiveSpreadsheet();
      handleHVTesterCalibrationDateChange(ss, sheet, editedRow, e.value);
      return;  // Don't call processEdit again, we handled it
    }

    // Handle Phasing Sets sheet - Assigned To (column I = 9) changes auto-populate Status and Location
    if (sheetName === SHEET_PHASING_SETS && editedCol === 9 && editedRow >= 2) {
      var ss = SpreadsheetApp.getActiveSpreadsheet();
      handlePhasingSetAssignedToChange(ss, sheet, editedRow, e.value);
      return;  // Don't call processEdit again, we handled it
    }

    // Handle Phasing Sets sheet - Calibration Date (column E = 5) changes auto-calculate Change Out Date
    if (sheetName === SHEET_PHASING_SETS && editedCol === 5 && editedRow >= 2) {
      var ss = SpreadsheetApp.getActiveSpreadsheet();
      handlePhasingSetCalibrationDateChange(ss, sheet, editedRow, e.value);
      return;  // Don't call processEdit again, we handled it
    }

    // Handle AED sheet - Assigned To (column H = 8) changes auto-populate Status and Location
    if (sheetName === SHEET_AED && editedCol === COLS.AED.ASSIGNED_TO && editedRow >= 2) {
      var ss = SpreadsheetApp.getActiveSpreadsheet();
      handleAEDAssignedToChange(ss, sheet, editedRow, e.value);
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

    // =========================================================================
    // DUPLICATE ITEM NUMBER VALIDATION (Column A edits on inventory sheets)
    // =========================================================================
    // Check if this is an item number edit on one of the unique-item sheets
    if (editedCol === 1 && editedRow >= 2) {
      var uniqueSheets = [SHEET_GLOVES, SHEET_SLEEVES, SHEET_BLANKETS, SHEET_HV_TESTERS, SHEET_PHASING_SETS, SHEET_AED];
      if (uniqueSheets.indexOf(sheetName) !== -1) {
        // Validate uniqueness - this will clear the cell and show error if duplicate
        if (!validateUniqueItemNumber(e, sheetName)) {
          Logger.log('onEditHandler: Blocked duplicate item number in ' + sheetName);
          return;  // Stop processing if duplicate was found
        }
      }
    }

    // Handle Safety Compliance sheet edits (day columns, status, weekly meeting, monthly checklist)
    if (sheetName === 'Safety Compliance' && editedRow >= 2) {
      // Columns: A=Week Start, B=Job Number, C=Foreman, D-J=Days (Sun-Sat), K=Weekly Meeting, L=Monthly Checklist, M=Status
      // Editable columns: D-J (4-10) for days, K (11) for weekly meeting, L (12) for monthly checklist, M (13) for status
      if (editedCol >= 4 && editedCol <= 13) {
        handleSafetyComplianceEdit(e);
      }
      return;  // Handled - don't continue to processEdit
    }

    // Handle Safety Compliance Config sheet edits (sync schedule changes to Job Tracking)
    if (sheetName === 'Safety Compliance Config' && editedRow >= 2) {
      // Skip Day columns are D-J (4-10), corresponding to Skip Sun through Skip Sat
      if (editedCol >= 4 && editedCol <= 10) {
        handleSafetyComplianceConfigEdit(e);
      }
      return;  // Handled
    }

    // Handle Training Tracking sheet edits (Status and Completion Date columns)
    if (sheetName === 'Training Tracking') {
      handleTrainingTrackingEdit(e);
      return;  // Handled - don't continue to processEdit
    }

    // Handle Job Tracking sheet edits (Status, Actual End Date, Estimated Return, Start Date columns)
    if (sheetName === 'Job Tracking' && editedRow >= 2) {
      // Column E(5)=Start Date, G(7)=Estimated Return, I(9)=Actual End Date, J(10)=Status
      if (editedCol === 5 || editedCol === 7 || editedCol === 9 || editedCol === 10) {
        handleJobTrackingEdit(e);
      }
      return;  // Handled - don't continue to processEdit
    }

    // Handle To Do List Completed checkbox - auto-remove completed tasks
    if (sheetName === 'To Do List' && editedRow >= 14 && editedCol === 12) {
      // Column 12 (L) is the Completed checkbox column, data starts at row 14
      var isCompleted = e.range.getValue();
      if (isCompleted === true) {
        // Ask user if they want to remove the completed task
        var ui = SpreadsheetApp.getUi();
        var response = ui.alert(
          '✅ Task Completed',
          'Remove this completed task from the To Do List?',
          ui.ButtonSet.YES_NO
        );

        if (response === ui.Button.YES) {
          sheet.deleteRow(editedRow);
          SpreadsheetApp.getActiveSpreadsheet().toast('Task removed from To Do List', '✅ Removed', 3);
          Logger.log('Removed completed task from To Do List row ' + editedRow);
        }
      }
      return;  // Handled - don't continue to processEdit
    }

    // Handle new item number detection in Gloves/Sleeves/Blankets/HV Testers/Phasing Sets/AED (Column A = item number)
    if ((sheetName === 'Gloves' || sheetName === 'Sleeves' || sheetName === 'Blankets' || sheetName === 'HV Testers' || sheetName === 'Phasing Sets' || sheetName === 'AED') && editedCol === 1 && editedRow >= 2) {
      var newItemNum = e.range.getValue();
      var oldItemNum = e.oldValue;
      var itemNumStr = String(newItemNum).trim();

      // For Blankets, auto-detect and set Type, Class, Status, Location, Assigned To
      // Wrapped in try-catch so validation errors don't prevent the dialog from showing
      if (sheetName === 'Blankets' && newItemNum && itemNumStr !== '') {
        try {
          // Auto-detect and set Type from item number
          var detectedType = detectBlanketType(itemNumStr);
          var currentType = sheet.getRange(editedRow, 2).getValue(); // Column B = Type
          if (!currentType) {
            sheet.getRange(editedRow, 2).setValue(detectedType);
          }

          // Auto-set Class to '4' if empty
          var currentClass = sheet.getRange(editedRow, 3).getValue(); // Column C = Class
          if (!currentClass) {
            sheet.getRange(editedRow, 3).setValue('4');
          }

          // Auto-set Location to 'Helena' if empty
          var currentLocation = sheet.getRange(editedRow, 6).getValue(); // Column F = Location
          if (!currentLocation) {
            sheet.getRange(editedRow, 6).setValue('Helena');
          }

          // Auto-set Status - try 'On Shelf' first, fall back to 'Available' for old validation
          var currentStatus = sheet.getRange(editedRow, 7).getValue(); // Column G = Status
          if (!currentStatus) {
            try {
              sheet.getRange(editedRow, 7).setValue('On Shelf');
            } catch (statusErr) {
              // Old validation might not have 'On Shelf', try 'Available'
              try {
                sheet.getRange(editedRow, 7).setValue('Available');
              } catch (statusErr2) {
                Logger.log('Could not set Status - validation mismatch');
              }
            }
          }

          // Auto-set Assigned To to 'On Shelf' if empty
          var currentAssignedTo = sheet.getRange(editedRow, 8).getValue(); // Column H = Assigned To
          if (!currentAssignedTo) {
            sheet.getRange(editedRow, 8).setValue('On Shelf');
          }
        } catch (autoPopErr) {
          Logger.log('Blankets auto-population error (will show dialog): ' + autoPopErr);
        }
      }

      // For HV Testers, auto-set defaults
      if (sheetName === 'HV Testers' && newItemNum && itemNumStr !== '') {
        try {
          // Auto-set Location to 'Helena' if empty (col F)
          var currentLocation = sheet.getRange(editedRow, COLS.HV_TESTERS.LOCATION).getValue();
          if (!currentLocation) {
            sheet.getRange(editedRow, COLS.HV_TESTERS.LOCATION).setValue('Helena');
          }
          // Auto-set Status to 'On Shelf' if empty (col G)
          var currentStatus = sheet.getRange(editedRow, COLS.HV_TESTERS.STATUS).getValue();
          if (!currentStatus) {
            sheet.getRange(editedRow, COLS.HV_TESTERS.STATUS).setValue('On Shelf');
          }
          // Auto-set Assigned To to 'On Shelf' if empty (col H)
          var currentAssignedTo = sheet.getRange(editedRow, COLS.HV_TESTERS.ASSIGNED_TO).getValue();
          if (!currentAssignedTo) {
            sheet.getRange(editedRow, COLS.HV_TESTERS.ASSIGNED_TO).setValue('On Shelf');
          }
        } catch (autoPopErr) {
          Logger.log('HV Testers auto-population error (will show dialog): ' + autoPopErr);
        }
      }

      // For Phasing Sets, auto-set defaults
      if (sheetName === 'Phasing Sets' && newItemNum && itemNumStr !== '') {
        try {
          // Auto-set Location to 'Helena' if empty (col G)
          var currentLocation = sheet.getRange(editedRow, COLS.PHASING_SETS.LOCATION).getValue();
          if (!currentLocation) {
            sheet.getRange(editedRow, COLS.PHASING_SETS.LOCATION).setValue('Helena');
          }
          // Auto-set Status to 'On Shelf' if empty (col H)
          var currentStatus = sheet.getRange(editedRow, COLS.PHASING_SETS.STATUS).getValue();
          if (!currentStatus) {
            sheet.getRange(editedRow, COLS.PHASING_SETS.STATUS).setValue('On Shelf');
          }
          // Auto-set Assigned To to 'On Shelf' if empty (col I)
          var currentAssignedTo = sheet.getRange(editedRow, COLS.PHASING_SETS.ASSIGNED_TO).getValue();
          if (!currentAssignedTo) {
            sheet.getRange(editedRow, COLS.PHASING_SETS.ASSIGNED_TO).setValue('On Shelf');
          }
        } catch (autoPopErr) {
          Logger.log('Phasing Sets auto-population error (will show dialog): ' + autoPopErr);
        }
      }

      // For AED, auto-set defaults
      if (sheetName === 'AED' && newItemNum && itemNumStr !== '') {
        try {
          // Auto-set Location to 'Helena' if empty (col F)
          var currentLocation = sheet.getRange(editedRow, COLS.AED.LOCATION).getValue();
          if (!currentLocation) {
            sheet.getRange(editedRow, COLS.AED.LOCATION).setValue('Helena');
          }
          // Auto-set Status to 'On Shelf' if empty (col G)
          var currentStatus = sheet.getRange(editedRow, COLS.AED.STATUS).getValue();
          if (!currentStatus) {
            sheet.getRange(editedRow, COLS.AED.STATUS).setValue('On Shelf');
          }
          // Auto-set Assigned To to 'On Shelf' if empty (col H)
          var currentAssignedTo = sheet.getRange(editedRow, COLS.AED.ASSIGNED_TO).getValue();
          if (!currentAssignedTo) {
            sheet.getRange(editedRow, COLS.AED.ASSIGNED_TO).setValue('On Shelf');
          }
        } catch (autoPopErr) {
          Logger.log('AED auto-population error (will show dialog): ' + autoPopErr);
        }
      }

      // Check if an item number was REMOVED (cleared or changed)
      if (oldItemNum && String(oldItemNum).trim() !== '' &&
          (!newItemNum || String(newItemNum).trim() === '')) {
        // Item number was cleared - trigger removal handling
        Logger.log('Item number cleared: ' + oldItemNum + ' from ' + sheetName);
        handleItemRemoval(String(oldItemNum).trim(), sheetName);
      }
      // Check for DUPLICATE item numbers first (before checking if new)
      else if (newItemNum && itemNumStr !== '') {
        // Check if this item number already exists in the sheet
        if (handleDuplicateItemNumber(itemNumStr, sheetName, editedRow)) {
          Logger.log('Duplicate item number blocked: ' + itemNumStr + ' in ' + sheetName);
          // Duplicate was found and cleared - don't continue with new item processing
        }
        // Check if this is a new item number (not a duplicate)
        else if (isNewItemNumber(itemNumStr, sheetName)) {
          Logger.log('New item number detected: ' + itemNumStr + ' in ' + sheetName);
          promptNewItemSource(itemNumStr, sheetName, editedRow);
        }
      }
      // Don't return - allow other processing to continue
    }

    // Handle new employee name detection in Employees sheet (Column A = Name)
    if (sheetName === 'Employees' && editedCol === 1 && editedRow >= 2) {
      var newName = e.range.getValue();
      var oldName = e.oldValue;
      var nameStr = String(newName).trim();

      // Check if a new name was added (not edited)
      if (nameStr !== '' && (!oldName || String(oldName).trim() === '')) {
        Logger.log('New employee name detected: ' + nameStr + ' in row ' + editedRow);

        // Show the new employee dialog
        try {
          showNewEmployeeDialog(nameStr, editedRow);
        } catch (dialogErr) {
          Logger.log('Could not show new employee dialog: ' + dialogErr);
          // Fall back to toast notification
          SpreadsheetApp.getActiveSpreadsheet().toast(
            'New employee "' + nameStr + '" added. Fill in their details in the row.',
            '👤 New Employee', 5
          );
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
          try {
            if (changeOutDate === 'N/A') {
              changeOutCell.setNumberFormat('@');
            } else {
              changeOutCell.setNumberFormat('MM/dd/yyyy');
            }
          } catch (fmtErr) { /* Ignore format errors on typed columns */ }
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

    // SKIP Employees sheet Last Day Reason changes - already handled by onEdit → processEdit
    // This prevents the double popup issue when both simple and installable triggers fire
    if (sheetName === 'Employees') {
      var empHeaders = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
      for (var h = 0; h < empHeaders.length; h++) {
        if (String(empHeaders[h]).toLowerCase().trim() === 'last day reason' && editedCol === (h + 1)) {
          Logger.log('onEditHandler: Skipping Employees Last Day Reason change (handled by onEdit)');
          return;  // Already handled by onEdit's processEdit call
        }
      }
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

  // Only process edits in Glove Swaps, Sleeve Swaps, Blanket Swaps, Gloves, Sleeves, Blankets, Employees, Employee History, or Reclaims tabs
  if (sheetName !== SHEET_GLOVE_SWAPS && sheetName !== SHEET_SLEEVE_SWAPS && sheetName !== SHEET_BLANKET_SWAPS &&
      sheetName !== SHEET_GLOVES && sheetName !== SHEET_SLEEVES && sheetName !== SHEET_BLANKETS &&
      sheetName !== SHEET_EMPLOYEES && sheetName !== 'Employee History' &&
      sheetName !== SHEET_RECLAIMS) {
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

  // Handle Employees sheet edits (Last Day Reason, Location, Job Number, or Hire Date columns)
  if (sheetName === SHEET_EMPLOYEES) {
    // Get column indices dynamically
    var empHeaders = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    var lastDayReasonColIdx = -1;
    var locationColIdx = -1;
    var jobNumberColIdx = -1;
    var hireDateColIdx = -1;

    for (var h = 0; h < empHeaders.length; h++) {
      var headerLower = String(empHeaders[h]).toLowerCase().trim();
      if (headerLower === 'last day reason') lastDayReasonColIdx = h + 1;  // 1-based
      if (headerLower === 'location') locationColIdx = h + 1;
      if (headerLower === 'job number') jobNumberColIdx = h + 1;
      if (headerLower === 'hire date') hireDateColIdx = h + 1;
    }

    // Handle Last Day Reason change - terminate employee
    if (lastDayReasonColIdx !== -1 && editedCol === lastDayReasonColIdx) {
      handleLastDayReasonChange(ss, sheet, editedRow, newValue);
      return;
    }

    // Handle Location, Job Number, or Hire Date change - track in history
    if ((locationColIdx !== -1 && editedCol === locationColIdx) ||
        (jobNumberColIdx !== -1 && editedCol === jobNumberColIdx) ||
        (hireDateColIdx !== -1 && editedCol === hireDateColIdx)) {
      var oldValue = e.oldValue || '';
      trackEmployeeChange(ss, sheet, editedRow, editedCol, newValue, oldValue, locationColIdx, jobNumberColIdx, hireDateColIdx);
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
            try {
              if (changeOutDate === 'N/A') {
                changeOutCell.setNumberFormat('@');
              } else {
                changeOutCell.setNumberFormat('MM/dd/yyyy');
              }
            } catch (fmtErr) { /* Ignore format errors on typed columns */ }
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

  // Handle Blankets tab edits (Assigned To, Status, Test Date columns)
  if (sheetName === SHEET_BLANKETS) {
    var blanketAssignedToCol = 8;   // Column H = Assigned To
    var blanketTestDateCol = 4;     // Column D = Test Date
    var blanketStatusCol = 7;       // Column G = Status
    var blanketLocationCol = 6;     // Column F = Location
    var blanketClassCol = 3;        // Column C = Class
    var blanketNotesCol = 11;       // Column K = Notes

    logEvent('processEdit: Blankets sheet, editedCol=' + editedCol, 'DEBUG');

    // Handle Status changes - when 'On Shelf', auto-populate Location and Assigned To
    if (editedCol === blanketStatusCol) {
      var statusValue = String(newValue || '').trim();
      if (statusValue === 'On Shelf') {
        sheet.getRange(editedRow, blanketLocationCol).setValue('Helena');
        sheet.getRange(editedRow, blanketAssignedToCol).setValue('On Shelf');
        ss.toast('Location and Assigned To set to "On Shelf" / "Helena"', '📍 Auto-Updated', 3);
      }
      return;
    }

    // Handle Assigned To changes - auto-populate Location from Employees sheet
    if (editedCol === blanketAssignedToCol) {
      handleBlanketAssignedToChange(ss, sheet, editedRow, newValue);
      return;
    }

    // Handle Test Date changes - update Change Out Date
    if (editedCol === blanketTestDateCol) {
      var testDate = sheet.getRange(editedRow, 4).getValue();      // Column D
      var location = sheet.getRange(editedRow, 6).getValue();      // Column F
      var assignedTo = sheet.getRange(editedRow, 8).getValue();    // Column H

      if (testDate) {
        var changeOutDate = calculateBlanketChangeOut(testDate, assignedTo, location);
        if (changeOutDate) {
          var changeOutCell = sheet.getRange(editedRow, 9);  // Column I
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
      return;
    }
  }

  // Handle HV Testers sheet edits - Assigned To (column H) changes
  if (sheetName === SHEET_HV_TESTERS) {
    var hvAssignedToCol = 8;  // Column H = Assigned To
    var hvStatusCol = 7;      // Column G = Status
    var hvLocationCol = 6;    // Column F = Location

    logEvent('processEdit: HV Testers sheet, editedCol=' + editedCol, 'DEBUG');

    // Handle Status changes - when 'On Shelf', auto-populate Location and Assigned To
    if (editedCol === hvStatusCol) {
      var statusValue = String(newValue || '').trim();
      if (statusValue === 'On Shelf') {
        sheet.getRange(editedRow, hvLocationCol).setValue('Helena');
        sheet.getRange(editedRow, hvAssignedToCol).setValue('On Shelf');
        ss.toast('Location and Assigned To set to "On Shelf" / "Helena"', '📍 Auto-Updated', 3);
      }
      return;
    }

    // Handle Assigned To changes - auto-populate Location and Status from Employees sheet
    if (editedCol === hvAssignedToCol) {
      handleHVTesterAssignedToChange(ss, sheet, editedRow, newValue);
      return;
    }

    // Handle Calibration Date changes - auto-calculate Change Out Date (Calibration + 10 years)
    if (editedCol === 4) {  // Column D = Calibration Date
      handleHVTesterCalibrationDateChange(ss, sheet, editedRow, newValue);
      return;
    }
  }

  // Handle Phasing Sets sheet edits - Assigned To (column H) changes
  if (sheetName === SHEET_PHASING_SETS) {
    var psAssignedToCol = 8;  // Column H = Assigned To
    var psStatusCol = 7;      // Column G = Status
    var psLocationCol = 6;    // Column F = Location

    logEvent('processEdit: Phasing Sets sheet, editedCol=' + editedCol, 'DEBUG');

    // Handle Status changes - when 'On Shelf', auto-populate Location and Assigned To
    if (editedCol === psStatusCol) {
      var statusValue = String(newValue || '').trim();
      if (statusValue === 'On Shelf') {
        sheet.getRange(editedRow, psLocationCol).setValue('Helena');
        sheet.getRange(editedRow, psAssignedToCol).setValue('On Shelf');
        ss.toast('Location and Assigned To set to "On Shelf" / "Helena"', '📍 Auto-Updated', 3);
      }
      return;
    }

    // Handle Assigned To changes - auto-populate Location and Status from Employees sheet
    if (editedCol === psAssignedToCol) {
      handlePhasingSetAssignedToChange(ss, sheet, editedRow, newValue);
      return;
    }

    // Handle Calibration Date changes - auto-calculate Change Out Date (Calibration + 10 years)
    if (editedCol === 4) {  // Column D = Calibration Date
      handlePhasingSetCalibrationDateChange(ss, sheet, editedRow, newValue);
      return;
    }
  }

  // Handle AED sheet edits - Assigned To and Status changes
  if (sheetName === SHEET_AED) {
    var aedAssignedToCol = COLS.AED.ASSIGNED_TO;  // Column H = 8
    var aedStatusCol = COLS.AED.STATUS;            // Column G = 7
    var aedLocationCol = COLS.AED.LOCATION;        // Column F = 6

    logEvent('processEdit: AED sheet, editedCol=' + editedCol, 'DEBUG');

    // Handle Status changes - when 'On Shelf', auto-populate Location and Assigned To
    if (editedCol === aedStatusCol) {
      var statusValue = String(newValue || '').trim();
      if (statusValue === 'On Shelf') {
        sheet.getRange(editedRow, aedLocationCol).setValue('Helena');
        sheet.getRange(editedRow, aedAssignedToCol).setValue('On Shelf');
        ss.toast('Location and Assigned To set to "On Shelf" / "Helena"', '📍 Auto-Updated', 3);
      }
      return;
    }

    // Handle Assigned To changes - auto-populate Location and Status from Employees sheet
    if (editedCol === aedAssignedToCol) {
      handleAEDAssignedToChange(ss, sheet, editedRow, newValue);
      return;
    }
  }

  // Handle Reclaims sheet edits (Pick List Item #, Picked checkbox and Date Changed)
  if (sheetName === SHEET_RECLAIMS) {
    // Reclaims sheet has multiple sections - we need to handle the Class 2/3 Reclaims sections
    // Columns for reclaim rows: G (7) = Pick List Item #, I (9) = Picked checkbox, J (10) = Date Changed
    // But first, check if this row is in a reclaim section (has Item Type in column B)

    var rowData = sheet.getRange(editedRow, 1, 1, 10).getValues()[0];
    var itemType = String(rowData[1] || '').trim();  // Column B = Item Type
    var pickListNum = rowData[6];  // Column G = Pick List Item #

    // Only process if this is a reclaim data row (has Item Type: Glove or Sleeve)
    if (itemType === 'Glove' || itemType === 'Sleeve') {
      var isGlove = (itemType === 'Glove');
      var inventorySheetName = isGlove ? SHEET_GLOVES : SHEET_SLEEVES;
      var inventorySheet = ss.getSheetByName(inventorySheetName);

      if (!inventorySheet) {
        logEvent('processEdit: Inventory sheet not found for Reclaims: ' + inventorySheetName, 'ERROR');
        return;
      }

      // Column G (7) = Pick List Item # (manual edit), Column I (9) = Picked checkbox, Column J (10) = Date Changed
      if (editedCol === 7) {
        // Pick List Item # manually edited
        logEvent('Reclaims Pick List Item # manual edit: row=' + editedRow + ', itemType=' + itemType + ', newValue=' + newValue);
        handleReclaimsPickListManualEdit(ss, sheet, inventorySheet, editedRow, newValue, isGlove);
      } else if (editedCol === 9 && pickListNum) {
        // Picked checkbox changed (only if there's a pick list item)
        logEvent('Reclaims Picked checkbox changed: row=' + editedRow + ', itemType=' + itemType + ', pickList=' + pickListNum);
        handleReclaimsPickedCheckbox(ss, sheet, inventorySheet, editedRow, newValue, isGlove);
      } else if (editedCol === 10 && pickListNum) {
        // Date Changed column edited (only if there's a pick list item)
        var cellValue = sheet.getRange(editedRow, 10).getValue();
        logEvent('Reclaims Date Changed: row=' + editedRow + ', itemType=' + itemType + ', pickList=' + pickListNum);
        handleReclaimsDateChanged(ss, sheet, inventorySheet, editedRow, cellValue, isGlove);
      }
    }
    return;
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


  // Handle Blanket Swaps tab edits
  if (sheetName === SHEET_BLANKET_SWAPS) {
    var blanketsSheet = ss.getSheetByName(SHEET_BLANKETS);

    if (!blanketsSheet) {
      logEvent('processEdit: Blankets sheet not found', 'ERROR');
      return;
    }

    // Column G (7) = Pick List Item # (manual edit), Column I (9) = Picked checkbox, Column J (10) = Date Changed
    if (editedCol === 7) {
      // Pick List Item # manually edited
      handleBlanketPickListManualEdit(ss, sheet, blanketsSheet, editedRow, newValue);
    } else if (editedCol === 9) {
      // Picked checkbox changed
      handleBlanketPickedCheckboxChange(ss, sheet, blanketsSheet, editedRow, newValue);
    } else if (editedCol === 10) {
      // Date Changed column edited - read actual cell value to get Date object
      var cellValue = sheet.getRange(editedRow, 10).getValue();
      handleBlanketDateChangedEdit(ss, sheet, blanketsSheet, editedRow, cellValue);
    }
  }
}

// ============================================================================
// JOB TRACKING AUTO-SYNC
// ============================================================================

/**
 * Handles edits to the Job Tracking sheet.
 * When Status or Actual End Date is changed, automatically syncs related sheets:
 * - Training Tracking (removes future months for completed jobs)
 * - Crew Visit Config (refreshes to remove non-active crews)
 * - Safety Compliance Config (refreshes to remove non-active crews)
 *
 * @param {Object} e - Edit event object
 */
function handleJobTrackingEdit(e) {
  try {
    var sheet = e.range.getSheet();
    var editedRow = e.range.getRow();
    var editedCol = e.range.getColumn();
    var newValue = e.range.getValue();
    var oldValue = e.oldValue;

    // Job Tracking column layout (after On Hold columns were added):
    // A(1)=Job#, B(2)=Location, C(3)=Foreman, D(4)=Crew Size, E(5)=Start Date,
    // F(6)=Put On Hold Date, G(7)=Estimated Return, H(8)=Est. End Date,
    // I(9)=Actual End Date, J(10)=Status, K(11)=Notes
    var COL_START_DATE = 5;       // Column E
    var COL_PUT_ON_HOLD = 6;      // Column F
    var COL_ESTIMATED_RETURN = 7; // Column G
    var COL_ACTUAL_END_DATE = 9;  // Column I
    var COL_STATUS = 10;          // Column J
    var COL_NOTES = 11;           // Column K

    // Get job details from the row
    var jobNumber = String(sheet.getRange(editedRow, 1).getValue() || '').trim();
    var status = String(sheet.getRange(editedRow, COL_STATUS).getValue() || '').trim();
    var actualEndDate = sheet.getRange(editedRow, COL_ACTUAL_END_DATE).getValue();

    if (!jobNumber) {
      Logger.log('handleJobTrackingEdit: No job number in row ' + editedRow);
      return;
    }

    Logger.log('handleJobTrackingEdit: Job ' + jobNumber + ', col=' + editedCol + ', newValue=' + newValue + ', oldValue=' + oldValue);

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var syncActions = [];

    // === AUTO-ACTIVATE: On Hold job when Estimated Return date is today or past ===
    if (editedCol === COL_ESTIMATED_RETURN && newValue && status === 'On Hold') {
      var returnDate = new Date(newValue);
      var today = new Date();
      today.setHours(0, 0, 0, 0);
      returnDate.setHours(0, 0, 0, 0);

      if (!isNaN(returnDate.getTime()) && returnDate <= today) {
        Logger.log('handleJobTrackingEdit: Job ' + jobNumber + ' Estimated Return is today or past, auto-activating');
        sheet.getRange(editedRow, COL_STATUS).setValue('Active');
        sheet.getRange(editedRow, COL_PUT_ON_HOLD).setValue('');  // Clear Put On Hold Date
        sheet.getRange(editedRow, COL_ESTIMATED_RETURN).setValue('');  // Clear Estimated Return
        var currentNotes = String(sheet.getRange(editedRow, COL_NOTES).getValue() || '');
        var activateNote = 'Auto-activated on ' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'MM/dd/yyyy') +
                           ' (Estimated Return date reached)';
        sheet.getRange(editedRow, COL_NOTES).setValue(currentNotes ? currentNotes + '; ' + activateNote : activateNote);
        status = 'Active';
        syncActions.push('✅ Status auto-set to Active (returned from On Hold)');
        queueJobTrackingSync(jobNumber, 'Active', 'On Hold');
      }
    }

    // === AUTO-ACTIVATE: Pending Start job when Start Date is today or past ===
    if (editedCol === COL_START_DATE && newValue && status === 'Pending Start') {
      var startDate = new Date(newValue);
      var todayPS = new Date();
      todayPS.setHours(0, 0, 0, 0);
      startDate.setHours(0, 0, 0, 0);

      if (!isNaN(startDate.getTime()) && startDate <= todayPS) {
        Logger.log('handleJobTrackingEdit: Job ' + jobNumber + ' Start Date is today or past, auto-activating');
        sheet.getRange(editedRow, COL_STATUS).setValue('Active');
        var currentNotesPS = String(sheet.getRange(editedRow, COL_NOTES).getValue() || '');
        var activateNotePS = 'Auto-activated on ' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'MM/dd/yyyy') +
                             ' (Start Date reached)';
        sheet.getRange(editedRow, COL_NOTES).setValue(currentNotesPS ? currentNotesPS + '; ' + activateNotePS : activateNotePS);
        status = 'Active';
        syncActions.push('✅ Status auto-set to Active (Pending Start → Active)');
        queueJobTrackingSync(jobNumber, 'Active', 'Pending Start');
      }
    }

    // Check if Actual End Date was set (column I=9) and Status is NOT already "Completed"
    // This handles the case where someone sets the end date but forgets to change status
    if (editedCol === COL_ACTUAL_END_DATE && newValue && status !== 'Completed') {
      Logger.log('handleJobTrackingEdit: Job ' + jobNumber + ' Actual End Date set, auto-setting Status to Completed');
      sheet.getRange(editedRow, COL_STATUS).setValue('Completed');
      status = 'Completed';
      syncActions.push('Status auto-set to Completed');

      // Sync Training Tracking - remove future training rows
      var trainingDeletedAuto = autoSyncCompletedJobToTraining(jobNumber, newValue);
      if (trainingDeletedAuto > 0) {
        syncActions.push('Training: ' + trainingDeletedAuto + ' future row(s) removed');
      }

      // Sync Safety Compliance - mark remaining days as N/A
      var safetyResult = autoSyncCompletedJobToSafetyCompliance(jobNumber, newValue);
      if (safetyResult.weeksUpdated > 0) {
        syncActions.push('Safety Compliance: current week updated');
      }
      if (safetyResult.configRemoved) {
        syncActions.push('Safety Config: crew removed');
      }

      // Queue config sync
      queueJobTrackingSync(jobNumber, 'Completed', oldValue);
    }

    // Check if status changed TO "Completed"
    if (editedCol === COL_STATUS && status === 'Completed') {
      Logger.log('handleJobTrackingEdit: Job ' + jobNumber + ' marked as Completed');

      // If no Actual End Date set, set it to today
      if (!actualEndDate || !(actualEndDate instanceof Date)) {
        actualEndDate = new Date();
        sheet.getRange(editedRow, COL_ACTUAL_END_DATE).setValue(actualEndDate);
        Logger.log('handleJobTrackingEdit: Auto-set Actual End Date to today');
      }

      // Sync Training Tracking - remove future training rows
      var trainingDeleted = autoSyncCompletedJobToTraining(jobNumber, actualEndDate);
      if (trainingDeleted > 0) {
        syncActions.push('Training: ' + trainingDeleted + ' future row(s) removed');
      }

      // Sync Safety Compliance - mark remaining days as N/A
      var safetyResultStatus = autoSyncCompletedJobToSafetyCompliance(jobNumber, actualEndDate);
      if (safetyResultStatus.weeksUpdated > 0) {
        syncActions.push('Safety Compliance: current week updated');
      }
      if (safetyResultStatus.configRemoved) {
        syncActions.push('Safety Config: crew removed');
      }
    }

    // Check if status changed FROM "Active" to something else (or TO "Active")
    var statusChanged = (editedCol === COL_STATUS && oldValue !== newValue);

    if (statusChanged) {
      // Queue background sync for config sheets
      // Use a delayed sync to avoid slowing down the edit
      queueJobTrackingSync(jobNumber, status, oldValue);

      if (status !== 'Active' && oldValue === 'Active') {
        syncActions.push('Configs will be synced (job no longer active)');
      } else if (status === 'Active' && oldValue !== 'Active') {
        syncActions.push('Configs will be synced (job now active)');
      }
    }

    // Show toast notification
    if (syncActions.length > 0) {
      ss.toast(syncActions.join('\n'), '🔄 Job Tracking Sync', 5);
    }

  } catch (err) {
    Logger.log('Error in handleJobTrackingEdit: ' + err);
  }
}

// ============================================================================
// SAFETY COMPLIANCE EDIT HANDLER
// ============================================================================

/**
 * Handles edits to the Safety Compliance sheet.
 * When day status, weekly meeting, monthly checklist, or overall status changes,
 * syncs to Task Metadata and updates related tasks.
 *
 * Columns:
 * A (1): Week Start
 * B (2): Job Number
 * C (3): Foreman
 * D-J (4-10): Sun-Sat (day columns)
 * K (11): Weekly Meeting
 * L (12): Monthly Checklist
 * M (13): Status
 * N (14): Updated
 *
 * Valid day values: ✅, ✅L, ❌, N/A, ⏳, (empty)
 *
 * @param {Object} e - Edit event object
 */
function handleSafetyComplianceEdit(e) {
  try {
    var sheet = e.range.getSheet();
    var editedRow = e.range.getRow();
    var editedCol = e.range.getColumn();
    var newValue = String(e.range.getValue() || '').trim();
    var oldValue = String(e.oldValue || '').trim();

    // Get row data
    var rowData = sheet.getRange(editedRow, 1, 1, 14).getValues()[0];
    var weekStart = rowData[0];  // Column A
    var jobNumber = String(rowData[1] || '').trim();  // Column B
    var foreman = String(rowData[2] || '').trim();  // Column C

    if (!weekStart || !jobNumber) {
      Logger.log('handleSafetyComplianceEdit: Missing week start or job number, skipping');
      return;
    }

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var tz = Session.getScriptTimeZone();
    var weekStartStr = '';

    if (weekStart instanceof Date) {
      weekStartStr = Utilities.formatDate(weekStart, tz, 'MM/dd/yyyy');
    } else {
      weekStartStr = String(weekStart);
    }

    Logger.log('handleSafetyComplianceEdit: Job=' + jobNumber + ', Week=' + weekStartStr + ', Col=' + editedCol + ', Old=' + oldValue + ', New=' + newValue);

    // Determine what type of edit this is
    var columnNames = ['', 'Week Start', 'Job Number', 'Foreman', 'Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Weekly Meeting', 'Monthly Checklist', 'Status'];
    var columnName = columnNames[editedCol] || 'Unknown';
    var dayIndex = -1;  // 0=Sun, 6=Sat

    if (editedCol >= 4 && editedCol <= 10) {
      // Day column edit (Sun=4, Mon=5, Tue=6, Wed=7, Thu=8, Fri=9, Sat=10)
      dayIndex = editedCol - 4;  // Convert to 0-6 index
    }

    // Validate the new value for day/meeting columns
    // Allow common variants like ❌W (didn't work)
    var validDayValues = ['✅', '✅L', '❌', '❌W', 'N/A', '⏳', ''];
    if (editedCol >= 4 && editedCol <= 12 && validDayValues.indexOf(newValue) === -1) {
      // Check if it might be a partial entry like "✓" for Monthly Checklist
      if (editedCol !== 12 || !newValue.startsWith('✓')) {
        Logger.log('handleSafetyComplianceEdit: Non-standard value "' + newValue + '" for column ' + columnName + ' - allowing it');
        // Don't reject - just log and continue (allow flexibility)
      }
    }

    // Update the "Updated" column (N) with timestamp
    sheet.getRange(editedRow, 14).setValue(new Date());

    // === UPDATE TOOLTIP/NOTE based on new value ===
    var noteText = '';
    var timestamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'MM/dd/yyyy h:mm a');
    if (newValue === '✅') {
      noteText = 'Received on time\nUpdated: ' + timestamp;
    } else if (newValue === '✅L') {
      noteText = 'Received LATE (after deadline)\nUpdated: ' + timestamp;
    } else if (newValue === '❌') {
      noteText = 'Missing - not received\nUpdated: ' + timestamp;
    } else if (newValue === '❌W' || newValue.toUpperCase() === 'DNW') {
      noteText = 'Did Not Work this day\nUpdated: ' + timestamp;
    } else if (newValue === 'N/A') {
      noteText = 'N/A - Skipped (crew does not work this day)\nUpdated: ' + timestamp;
    } else if (newValue === '⏳') {
      noteText = 'Pending - not yet due\nUpdated: ' + timestamp;
    } else if (newValue === '') {
      noteText = '';  // Clear note for empty cells
    }
    // Set or clear the note on the cell
    if (noteText) {
      e.range.setNote(noteText);
    } else {
      e.range.clearNote();
    }

    // === SYNC TO TASK METADATA ===
    var syncResult = syncSafetyComplianceToTaskMetadata(jobNumber, weekStart, editedCol, newValue, oldValue, foreman);

    // === UPDATE STATUS COLUMN IF NEEDED ===
    // Recalculate overall status based on all day values
    if (editedCol >= 4 && editedCol <= 12) {
      updateSafetyComplianceRowStatus(sheet, editedRow);
    }

    // Show feedback
    var feedbackMsg = '🛡️ ' + jobNumber + ' ' + columnName;
    if (newValue === '✅' || newValue === '✅L') {
      feedbackMsg += ' marked received';
    } else if (newValue === '❌') {
      feedbackMsg += ' marked missing';
    } else if (newValue === '❌W') {
      feedbackMsg += ' marked Did Not Work';
    } else if (newValue === 'N/A') {
      feedbackMsg += ' marked N/A (skipped)';
    } else if (newValue === '⏳') {
      feedbackMsg += ' marked pending';
    }

    if (syncResult && syncResult.taskUpdated) {
      feedbackMsg += '\n✅ Task Metadata synced';
    }

    ss.toast(feedbackMsg, 'Safety Compliance Updated', 3);

  } catch (err) {
    Logger.log('Error in handleSafetyComplianceEdit: ' + err);
    SpreadsheetApp.getActiveSpreadsheet().toast('Error: ' + err, '❌ Error', 5);
  }
}

/**
 * Syncs a Safety Compliance edit to Task Metadata.
 * - If changed to ✅ or ✅L: Mark the Missing Safety Report task as Complete
 * - If changed to ❌: Create or update Missing Safety Report task
 * - If changed to N/A or ⏳: Remove or update the task status
 *
 * @param {string} jobNumber - The job number
 * @param {Date} weekStart - The week start date
 * @param {number} editedCol - The column that was edited (4-13)
 * @param {string} newValue - The new cell value
 * @param {string} oldValue - The old cell value
 * @param {string} foreman - The foreman name
 * @return {Object} Result with taskUpdated flag
 */
function syncSafetyComplianceToTaskMetadata(jobNumber, weekStart, editedCol, newValue, oldValue, foreman) {
  var result = { taskUpdated: false };

  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var metadataSheet = ss.getSheetByName('Task Metadata');

    if (!metadataSheet) {
      Logger.log('syncSafetyComplianceToTaskMetadata: Task Metadata sheet not found');
      return result;
    }

    var tz = Session.getScriptTimeZone();
    var weekStartDate = (weekStart instanceof Date) ? weekStart : new Date(weekStart);
    var weekStartStr = Utilities.formatDate(weekStartDate, tz, 'MM-dd-yyyy');

    // Determine what type of edit (day, weekly meeting, monthly checklist, or status)
    var dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    var itemType = '';
    var dayName = '';

    if (editedCol >= 4 && editedCol <= 10) {
      // Day column (JHA)
      itemType = 'JHA';
      dayName = dayNames[editedCol - 4];
    } else if (editedCol === 11) {
      // Weekly Meeting
      itemType = 'Weekly Meeting';
    } else if (editedCol === 12) {
      // Monthly Checklist
      itemType = 'Monthly Checklist';
    } else if (editedCol === 13) {
      // Status column - handled separately
      return result;
    }

    // Build the task key pattern to search for
    // TaskID format: SafetyCompliance_{jobNumber}_{weekStart}
    var taskIdPattern = 'SafetyCompliance_' + jobNumber + '_' + weekStartStr;

    // Search for existing task in Task Metadata
    var metadataData = metadataSheet.getDataRange().getValues();
    var headers = metadataData[0];

    // Find column indices
    var cols = {};
    for (var h = 0; h < headers.length; h++) {
      var header = String(headers[h]).toLowerCase().trim();
      if (header === 'taskid') cols.taskId = h;
      else if (header === 'tasktype') cols.taskType = h;
      else if (header === 'itemtype') cols.itemType = h;
      else if (header === 'status') cols.status = h;
      else if (header === 'notes') cols.notes = h;
      else if (header === 'lastupdated') cols.lastUpdated = h;
    }

    if (cols.taskId === undefined) {
      Logger.log('syncSafetyComplianceToTaskMetadata: TaskId column not found');
      return result;
    }

    // Find matching task row(s)
    var foundRow = -1;
    for (var i = 1; i < metadataData.length; i++) {
      var rowTaskId = String(metadataData[i][cols.taskId] || '');
      var rowItemType = String(metadataData[i][cols.itemType] || '');

      // Match by TaskID pattern and ItemType
      if (rowTaskId.indexOf(taskIdPattern) !== -1) {
        // Check if this is the right item type
        if (itemType === 'JHA' && (rowItemType.indexOf('JHA') !== -1 || rowItemType === 'JHA + Weekly Meeting')) {
          foundRow = i + 1;
          break;
        } else if (itemType === 'Weekly Meeting' && (rowItemType.indexOf('Weekly Meeting') !== -1 || rowItemType === 'JHA + Weekly Meeting')) {
          foundRow = i + 1;
          break;
        } else if (itemType === 'Monthly Checklist' && rowItemType.indexOf('Monthly') !== -1) {
          foundRow = i + 1;
          break;
        }
      }
    }

    var timestamp = new Date();

    if (newValue === '✅' || newValue === '✅L') {
      // Marked as received - mark task as Complete
      if (foundRow !== -1) {
        var currentStatus = String(metadataData[foundRow - 1][cols.status] || '');
        if (currentStatus !== 'Complete') {
          metadataSheet.getRange(foundRow, cols.status + 1).setValue('Complete');
          var note = 'Marked complete via Safety Compliance sheet edit';
          if (dayName) note += ' (' + dayName + ' JHA received)';
          if (cols.notes !== undefined) {
            metadataSheet.getRange(foundRow, cols.notes + 1).setValue(note);
          }
          if (cols.lastUpdated !== undefined) {
            metadataSheet.getRange(foundRow, cols.lastUpdated + 1).setValue(timestamp);
          }
          result.taskUpdated = true;
          Logger.log('syncSafetyComplianceToTaskMetadata: Marked task Complete for ' + jobNumber + ' ' + itemType);
        }
      }
    } else if (newValue === '❌') {
      // Marked as missing - create task if doesn't exist, or update to Pending
      if (foundRow !== -1) {
        // Update existing task to Pending
        var currentStatus = String(metadataData[foundRow - 1][cols.status] || '');
        if (currentStatus === 'Complete') {
          metadataSheet.getRange(foundRow, cols.status + 1).setValue('Pending');
          var note = 'Reverted to Pending via Safety Compliance sheet edit';
          if (dayName) note += ' (' + dayName + ' marked missing)';
          if (cols.notes !== undefined) {
            metadataSheet.getRange(foundRow, cols.notes + 1).setValue(note);
          }
          if (cols.lastUpdated !== undefined) {
            metadataSheet.getRange(foundRow, cols.lastUpdated + 1).setValue(timestamp);
          }
          result.taskUpdated = true;
          Logger.log('syncSafetyComplianceToTaskMetadata: Reverted task to Pending for ' + jobNumber + ' ' + itemType);
        }
      } else {
        // No task exists - create one
        var createResult = createMissingSafetyReportTask(jobNumber, weekStartDate, itemType, dayName, foreman);
        if (createResult && createResult.created) {
          result.taskUpdated = true;
          Logger.log('syncSafetyComplianceToTaskMetadata: Created new task for ' + jobNumber + ' ' + itemType);
        }
      }
    } else if (newValue === 'N/A' || newValue === '⏳') {
      // Marked as N/A (skipped) or pending - remove task or set to special status
      if (foundRow !== -1) {
        if (newValue === 'N/A') {
          // Mark task as Complete with special note (day was skipped)
          metadataSheet.getRange(foundRow, cols.status + 1).setValue('Complete');
          var note = 'Marked N/A (day skipped) via Safety Compliance sheet edit';
          if (cols.notes !== undefined) {
            metadataSheet.getRange(foundRow, cols.notes + 1).setValue(note);
          }
        } else {
          // ⏳ - Just update note, keep as Pending
          var note = 'Pending - not yet due';
          if (cols.notes !== undefined) {
            metadataSheet.getRange(foundRow, cols.notes + 1).setValue(note);
          }
        }
        if (cols.lastUpdated !== undefined) {
          metadataSheet.getRange(foundRow, cols.lastUpdated + 1).setValue(timestamp);
        }
        result.taskUpdated = true;
      }
    }

    return result;

  } catch (err) {
    Logger.log('Error in syncSafetyComplianceToTaskMetadata: ' + err);
    return result;
  }
}

/**
 * Creates a Missing Safety Report task in Task Metadata.
 *
 * @param {string} jobNumber - The job number
 * @param {Date} weekStart - The week start date
 * @param {string} itemType - The type (JHA, Weekly Meeting, Monthly Checklist)
 * @param {string} dayName - The day name for JHAs (Mon, Tue, etc.)
 * @param {string} foreman - The foreman name
 * @return {Object} Result with created flag
 */
function createMissingSafetyReportTask(jobNumber, weekStart, itemType, dayName, foreman) {
  var result = { created: false };

  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var metadataSheet = ss.getSheetByName('Task Metadata');

    if (!metadataSheet) return result;

    var tz = Session.getScriptTimeZone();
    var weekStartStr = Utilities.formatDate(weekStart, tz, 'MM-dd-yyyy');
    var taskId = 'SafetyCompliance_' + jobNumber + '_' + weekStartStr;

    // Get headers to determine column positions
    var headers = metadataSheet.getRange(1, 1, 1, metadataSheet.getLastColumn()).getValues()[0];
    var colMap = {};
    for (var h = 0; h < headers.length; h++) {
      colMap[String(headers[h]).toLowerCase().trim()] = h;
    }

    var timestamp = new Date();
    var itemTypeStr = itemType;
    if (itemType === 'JHA' && dayName) {
      itemTypeStr = 'JHA (' + dayName + ')';
    }

    // Build new row data
    var newRow = [];
    for (var c = 0; c < headers.length; c++) {
      var colName = String(headers[c]).toLowerCase().trim();
      switch (colName) {
        case 'taskid': newRow.push(taskId); break;
        case 'tasktype': newRow.push('Missing Safety Report'); break;
        case 'itemtype': newRow.push(itemTypeStr); break;
        case 'employee': newRow.push(foreman || ''); break;
        case 'location': newRow.push(jobNumber); break;  // Use job number as location
        case 'sourcesheet': newRow.push('Safety Compliance'); break;
        case 'sourcerowindex': newRow.push(0); break;
        case 'status': newRow.push('Pending'); break;
        case 'duedate': newRow.push(weekStart); break;
        case 'scheduleddate': newRow.push(''); break;
        case 'notes': newRow.push('Created via Safety Compliance sheet edit'); break;
        case 'createdat':
        case 'lastupdated': newRow.push(timestamp); break;
        default: newRow.push(''); break;
      }
    }

    // Add the row
    metadataSheet.appendRow(newRow);
    result.created = true;

    Logger.log('createMissingSafetyReportTask: Created task for ' + jobNumber + ' ' + itemTypeStr);
    return result;

  } catch (err) {
    Logger.log('Error in createMissingSafetyReportTask: ' + err);
    return result;
  }
}

/**
 * Updates the Status column (M) of a Safety Compliance row based on all day/meeting values.
 *
 * Status determination:
 * - "Complete" if all non-N/A days have ✅ or ✅L AND weekly meeting has ✅ or ✅L
 * - "Missing Reports" if any required day has ❌
 * - "Pending" if any required day has ⏳
 *
 * @param {Sheet} sheet - The Safety Compliance sheet
 * @param {number} row - The row number to update
 */
function updateSafetyComplianceRowStatus(sheet, row) {
  try {
    var rowData = sheet.getRange(row, 1, 1, 13).getValues()[0];

    // Day columns D-J (indices 3-9), Weekly Meeting K (index 10)
    var dayValues = [];
    for (var d = 3; d <= 9; d++) {
      dayValues.push(String(rowData[d] || '').trim());
    }
    var weeklyMeeting = String(rowData[10] || '').trim();
    var monthlyChecklist = String(rowData[11] || '').trim();

    var hasMissing = false;
    var hasPending = false;
    var allComplete = true;

    // Check day values
    for (var i = 0; i < dayValues.length; i++) {
      var val = dayValues[i];
      if (val === 'N/A' || val === '') continue;  // Skip N/A and empty

      if (val === '❌') {
        hasMissing = true;
        allComplete = false;
      } else if (val === '⏳') {
        hasPending = true;
        allComplete = false;
      } else if (val !== '✅' && val !== '✅L') {
        allComplete = false;
      }
    }

    // Check weekly meeting
    if (weeklyMeeting !== 'N/A' && weeklyMeeting !== '') {
      if (weeklyMeeting === '❌') {
        hasMissing = true;
        allComplete = false;
      } else if (weeklyMeeting === '⏳') {
        hasPending = true;
        allComplete = false;
      } else if (weeklyMeeting !== '✅' && weeklyMeeting !== '✅L') {
        allComplete = false;
      }
    }

    // Check monthly checklist (different logic - may have date suffix)
    if (monthlyChecklist !== 'N/A' && monthlyChecklist !== '') {
      // ⏳ or ⚠️ or ❌⏳ means still pending
      if (monthlyChecklist === '❌') {
        hasMissing = true;
        allComplete = false;
      } else if (monthlyChecklist === '⏳' || monthlyChecklist === '⚠️' || monthlyChecklist === '❌⏳') {
        hasPending = true;
        allComplete = false;
      } else if (!monthlyChecklist.startsWith('✅') && !monthlyChecklist.startsWith('✓')) {
        allComplete = false;
      }
    }

    // Determine new status
    var newStatus = 'Complete';
    if (hasMissing) {
      newStatus = 'Missing Reports';
    } else if (hasPending) {
      newStatus = 'Pending';
    } else if (!allComplete) {
      newStatus = 'Pending';
    }

    // Only update if different from current
    var currentStatus = String(rowData[12] || '').trim();
    if (currentStatus !== newStatus && currentStatus !== 'Resolved') {
      // Don't change Resolved status
      sheet.getRange(row, 13).setValue(newStatus);
      Logger.log('updateSafetyComplianceRowStatus: Updated row ' + row + ' status from "' + currentStatus + '" to "' + newStatus + '"');
    }

  } catch (err) {
    Logger.log('Error in updateSafetyComplianceRowStatus: ' + err);
  }
}

/**
 * Handles edits to the Safety Compliance Config sheet.
 * When skip day settings are changed, syncs to Job Tracking schedule history.
 *
 * Config columns:
 * A (1): Job Number
 * B (2): Foreman
 * C (3): Notes
 * D-J (4-10): Skip Sun, Skip Mon, ... Skip Sat (checkboxes)
 * K (11): Skip Weekly Meeting
 * L (12): Skip Monthly Checklist
 *
 * @param {Object} e - Edit event object
 */
function handleSafetyComplianceConfigEdit(e) {
  try {
    var sheet = e.range.getSheet();
    var editedRow = e.range.getRow();

    // Get the job number from column A
    var jobNumber = String(sheet.getRange(editedRow, 1).getValue() || '').trim();

    if (!jobNumber || !/^\d{3}-\d{2}$/.test(jobNumber)) {
      Logger.log('handleSafetyComplianceConfigEdit: Invalid job number, skipping');
      return;
    }

    // Get all skip day values for this row
    var skipValues = sheet.getRange(editedRow, 4, 1, 7).getValues()[0];  // D-J = Skip Sun through Skip Sat

    var skipDays = [];
    var dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    for (var d = 0; d < 7; d++) {
      if (skipValues[d] === true) {
        skipDays.push(dayNames[d]);
      }
    }

    var skipDaysStr = skipDays.join(',');
    var schedule = determineScheduleType(skipDaysStr);

    Logger.log('handleSafetyComplianceConfigEdit: Job ' + jobNumber + ' schedule changed to ' + schedule + ' (skip: ' + skipDaysStr + ')');

    // Sync to Job Tracking (if schedule columns exist)
    var result = updateCrewScheduleInJobTracking(jobNumber, schedule, skipDaysStr);

    if (result) {
      SpreadsheetApp.getActiveSpreadsheet().toast(
        'Schedule updated for ' + jobNumber + ': ' + schedule,
        '📅 Schedule Synced',
        3
      );
    }

  } catch (err) {
    Logger.log('Error in handleSafetyComplianceConfigEdit: ' + err);
  }
}

/**
 * Queues a background sync for config sheets when Job Tracking status changes.
 * Stores the sync request in ScriptProperties and creates a time-based trigger
 * to run the sync in a few seconds (avoids slowing down the edit).
 *
 * @param {string} jobNumber - The job number that changed
 * @param {string} newStatus - The new status value
 * @param {string} oldStatus - The previous status value
 */
function queueJobTrackingSync(jobNumber, newStatus, oldStatus) {
  try {
    // Store sync request (optional - sync will run anyway)
    var syncRequest = {
      jobNumber: jobNumber,
      newStatus: newStatus,
      oldStatus: oldStatus,
      timestamp: new Date().toISOString()
    };

    try {
      PropertiesService.getScriptProperties().setProperty('JOB_TRACKING_SYNC_PENDING', JSON.stringify(syncRequest));
    } catch (propErr) {
      // ScriptProperties access can fail - continue anyway since the trigger will run
      Logger.log('queueJobTrackingSync: ScriptProperties not accessible: ' + propErr);
    }

    // Check if a sync trigger already exists
    var triggers = ScriptApp.getProjectTriggers();
    var syncTriggerExists = false;

    for (var i = 0; i < triggers.length; i++) {
      if (triggers[i].getHandlerFunction() === 'runJobTrackingSyncBackground') {
        syncTriggerExists = true;
        break;
      }
    }

    // Create a one-time trigger to run the sync in 5 seconds
    if (!syncTriggerExists) {
      ScriptApp.newTrigger('runJobTrackingSyncBackground')
        .timeBased()
        .after(5000) // 5 seconds
        .create();
      Logger.log('queueJobTrackingSync: Created background sync trigger');
    }

  } catch (err) {
    Logger.log('Error in queueJobTrackingSync: ' + err);
    // Fall back to immediate sync if queueing fails
    runJobTrackingConfigSync();
  }
}

/**
 * Background trigger function that runs the config sync.
 * Called by the time-based trigger created in queueJobTrackingSync().
 */
function runJobTrackingSyncBackground() {
  try {
    // Delete this trigger (one-time use)
    var triggers = ScriptApp.getProjectTriggers();
    for (var i = 0; i < triggers.length; i++) {
      if (triggers[i].getHandlerFunction() === 'runJobTrackingSyncBackground') {
        ScriptApp.deleteTrigger(triggers[i]);
      }
    }

    // Try to check for pending sync request - but handle permission errors gracefully
    var pendingJson = null;
    try {
      var props = PropertiesService.getScriptProperties();
      pendingJson = props.getProperty('JOB_TRACKING_SYNC_PENDING');

      if (pendingJson) {
        // Clear the pending request
        props.deleteProperty('JOB_TRACKING_SYNC_PENDING');
        var syncRequest = JSON.parse(pendingJson);
        Logger.log('runJobTrackingSyncBackground: Processing sync for job ' + syncRequest.jobNumber);
      }
    } catch (propErr) {
      // ScriptProperties access can fail with PERMISSION_DENIED in background triggers
      // This is expected - just run the sync anyway since we know it was queued
      Logger.log('runJobTrackingSyncBackground: ScriptProperties not accessible (expected in background): ' + propErr);
    }

    // Run the actual sync regardless - if the trigger exists, we queued it for a reason
    runJobTrackingConfigSync();

  } catch (err) {
    Logger.log('Error in runJobTrackingSyncBackground: ' + err);
  }
}

/**
 * Silently syncs all config sheets based on current Job Tracking data.
 * Called after Job Tracking status changes to keep configs in sync.
 *
 * This function:
 * 1. Refreshes Crew Visit Config (removes non-active crews)
 * 2. Refreshes Safety Compliance Config (removes non-active crews)
 * 3. Does NOT rebuild Training Tracking (that's handled separately by autoSyncCompletedJobToTraining)
 */
function runJobTrackingConfigSync() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var results = [];

  Logger.log('runJobTrackingConfigSync: Starting config sync');

  // 1. Sync Crew Visit Config (if it exists)
  var crewVisitResult = syncCrewVisitConfigSilent();
  if (crewVisitResult.changed) {
    results.push('Crew Visit: ' + crewVisitResult.removed + ' removed, ' + crewVisitResult.added + ' added');
  }

  // 2. Sync Safety Compliance Config (if it exists)
  var safetyConfigResult = syncSafetyComplianceConfigSilent();
  if (safetyConfigResult.changed) {
    results.push('Safety Config: ' + safetyConfigResult.removed + ' removed, ' + safetyConfigResult.added + ' added');
  }

  if (results.length > 0) {
    Logger.log('runJobTrackingConfigSync: ' + results.join('; '));
    ss.toast(results.join('\n'), '🔄 Config Sync Complete', 5);
  } else {
    Logger.log('runJobTrackingConfigSync: No changes needed');
  }
}

/**
 * Silently syncs Crew Visit Config - removes non-active crews, adds new active crews.
 * Does not show UI alerts.
 *
 * @returns {Object} {changed: boolean, removed: number, added: number}
 */
function syncCrewVisitConfigSilent() {
  var result = { changed: false, removed: 0, added: 0 };

  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName('Crew Visit Config');

    if (!sheet || sheet.getLastRow() < 2) {
      Logger.log('syncCrewVisitConfigSilent: Sheet not found or empty');
      return result;
    }

    // Get active crews (filtered by Job Tracking)
    var activeCrews = getActiveCrews();
    var activeCrewSet = {};
    for (var i = 0; i < activeCrews.length; i++) {
      activeCrewSet[activeCrews[i]] = true;
    }

    // Get existing data
    var data = sheet.getDataRange().getValues();
    var headers = data[0];

    // Find rows to remove (work backwards)
    var rowsToRemove = [];
    var existingCrews = {};

    for (var r = 1; r < data.length; r++) {
      var jobNum = String(data[r][0] || '').trim();
      if (!jobNum) continue;

      existingCrews[jobNum] = true;

      if (!activeCrewSet[jobNum]) {
        rowsToRemove.push(r + 1); // 1-indexed
        result.removed++;
      }
    }

    // Delete rows from bottom to top
    rowsToRemove.sort(function(a, b) { return b - a; });
    for (var d = 0; d < rowsToRemove.length; d++) {
      sheet.deleteRow(rowsToRemove[d]);
    }

    // Check for new crews to add
    var crewsToAdd = [];
    for (var c = 0; c < activeCrews.length; c++) {
      if (!existingCrews[activeCrews[c]]) {
        crewsToAdd.push(activeCrews[c]);
        result.added++;
      }
    }

    // Add new crews (simplified - just job number and defaults)
    if (crewsToAdd.length > 0) {
      var lastRow = sheet.getLastRow();
      for (var a = 0; a < crewsToAdd.length; a++) {
        var crewNum = crewsToAdd[a];
        var lead = getCrewLead(crewNum);
        var location = getCrewLocation(crewNum);
        var size = getCrewSize(crewNum);

        sheet.appendRow([
          crewNum,
          location || '',
          lead ? lead.name : '',
          size,
          'Monthly',
          15 + (size * 5),  // Estimated time
          new Date(),       // Last visit (today as placeholder)
          '',               // Next visit
          0,                // Drive time
          'Medium',         // Priority
          'Auto-added ' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'MM/dd/yyyy')
        ]);
      }
    }

    result.changed = (result.removed > 0 || result.added > 0);
    Logger.log('syncCrewVisitConfigSilent: removed=' + result.removed + ', added=' + result.added);

  } catch (err) {
    Logger.log('Error in syncCrewVisitConfigSilent: ' + err);
  }

  return result;
}

/**
 * Silently syncs Safety Compliance Config - removes non-active crews, adds new active crews.
 * Does not show UI alerts.
 *
 * @returns {Object} {changed: boolean, removed: number, added: number}
 */
function syncSafetyComplianceConfigSilent() {
  var result = { changed: false, removed: 0, added: 0 };

  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName('Safety Compliance Config');

    if (!sheet || sheet.getLastRow() < 2) {
      Logger.log('syncSafetyComplianceConfigSilent: Sheet not found or empty');
      return result;
    }

    // Get active crews (filtered by Job Tracking)
    var activeCrews = getActiveCrews();
    var activeCrewSet = {};
    for (var i = 0; i < activeCrews.length; i++) {
      activeCrewSet[activeCrews[i]] = true;
    }

    // Get existing data
    var data = sheet.getDataRange().getValues();

    // Find rows to remove (work backwards)
    var rowsToRemove = [];
    var existingCrews = {};

    for (var r = 1; r < data.length; r++) {
      var jobNum = String(data[r][0] || '').trim();
      if (!jobNum) continue;

      existingCrews[jobNum] = true;

      if (!activeCrewSet[jobNum]) {
        rowsToRemove.push(r + 1); // 1-indexed
        result.removed++;
      }
    }

    // Delete rows from bottom to top
    rowsToRemove.sort(function(a, b) { return b - a; });
    for (var d = 0; d < rowsToRemove.length; d++) {
      sheet.deleteRow(rowsToRemove[d]);
    }

    // Check for new crews to add
    var crewsToAdd = [];
    for (var c = 0; c < activeCrews.length; c++) {
      if (!existingCrews[activeCrews[c]]) {
        crewsToAdd.push(activeCrews[c]);
        result.added++;
      }
    }

    // Add new crews with default settings
    if (crewsToAdd.length > 0) {
      var newRows = [];
      for (var a = 0; a < crewsToAdd.length; a++) {
        var crewNum = crewsToAdd[a];
        var foreman = lookupForemanByJobNumber(crewNum);
        var foremanName = (foreman && foreman.name) ? foreman.name : '';

        // Default: Skip Sun and Sat (weekends)
        newRows.push([
          crewNum, foremanName,
          true, false, false, false, false, false, true, // Sun=skip, Sat=skip
          false, false, 'Auto-added ' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'MM/dd/yyyy')
        ]);
      }

      var lastRow = sheet.getLastRow();
      sheet.getRange(lastRow + 1, 1, newRows.length, 12).setValues(newRows);

      // Add checkboxes for the new rows (columns C-K = 3-11)
      var checkboxRange = sheet.getRange(lastRow + 1, 3, newRows.length, 9);
      checkboxRange.insertCheckboxes();
    }

    // Sort by job number
    if (sheet.getLastRow() > 1 && (result.removed > 0 || result.added > 0)) {
      sheet.getRange(2, 1, sheet.getLastRow() - 1, 12).sort(1);
    }

    result.changed = (result.removed > 0 || result.added > 0);
    Logger.log('syncSafetyComplianceConfigSilent: removed=' + result.removed + ', added=' + result.added);

  } catch (err) {
    Logger.log('Error in syncSafetyComplianceConfigSilent: ' + err);
  }

  return result;
}
