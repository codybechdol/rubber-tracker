/**
 * Glove Manager – Rubber Glove & Sleeve Inventory System
 *
 * Google Apps Script foundation for automating and managing PPE inventory, assignments, swaps, compliance, and reporting.
 *
 * Hidden columns (K–W) on Glove/Sleeve Swaps tabs store workflow state for Stage 1-5 processing.
 *
 * Expand each placeholder as features are implemented. Logging and error handling included for maintainability.
 */

// Sheet/tab name constants
const SHEET_EMPLOYEES = 'Employees';
const SHEET_GLOVES = 'Gloves';
const SHEET_SLEEVES = 'Sleeves';
const SHEET_GLOVE_SWAPS = 'Glove Swaps';
const SHEET_SLEEVE_SWAPS = 'Sleeve Swaps';
const SHEET_PURCHASE_NEEDS = 'Purchase Needs';
const SHEET_INVENTORY_REPORTS = 'Inventory Reports';
const SHEET_RECLAIMS = 'Reclaims';
const SHEET_ITEM_HISTORY_LOOKUP = 'Item History Lookup';
const SHEET_GLOVES_HISTORY = 'Gloves History';
const SHEET_SLEEVES_HISTORY = 'Sleeves History';

// Header background color for swap tables
const HEADER_BG_COLOR = '#1565c0';

// Change-out intervals (months)
const INTERVAL_HELENA = 3;
const INTERVAL_DEFAULT = 6;

// Alternating colors for history grouping
const HISTORY_COLOR_GLOVE_1 = '#e3f2fd';  // Light blue
const HISTORY_COLOR_GLOVE_2 = '#ffffff';  // White
const HISTORY_COLOR_SLEEVE_1 = '#e8f5e9'; // Light green
const HISTORY_COLOR_SLEEVE_2 = '#ffffff'; // White

// Backup folder name in Google Drive
var BACKUP_FOLDER_NAME = 'Glove Manager Backups';

// =============================================================================
// COLUMN CONSTANTS - Per Workflow_and_Sheet_Expectations.md
// These columns are FIXED per the documentation and should be used directly
// =============================================================================
const COLS = {
  // Gloves & Sleeves Sheet (identical structure)
  INVENTORY: {
    ITEM_NUM: 1,        // A - "Glove" or "Sleeve" (Item #)
    SIZE: 2,            // B
    CLASS: 3,           // C
    TEST_DATE: 4,       // D
    DATE_ASSIGNED: 5,   // E
    LOCATION: 6,        // F
    STATUS: 7,          // G
    ASSIGNED_TO: 8,     // H
    CHANGE_OUT_DATE: 9, // I
    PICKED_FOR: 10,     // J
    NOTES: 11           // K
  },

  // Glove/Sleeve Swaps Sheet (visible columns A-J)
  SWAPS: {
    EMPLOYEE: 1,        // A
    CURRENT_ITEM: 2,    // B
    SIZE: 3,            // C
    DATE_ASSIGNED: 4,   // D
    CHANGE_OUT_DATE: 5, // E
    DAYS_LEFT: 6,       // F
    PICK_LIST: 7,       // G
    STATUS: 8,          // H
    PICKED: 9,          // I
    DATE_CHANGED: 10    // J
  },

  // Swaps Hidden Columns (Stage tracking K-W)
  SWAPS_HIDDEN: {
    STAGE1_PICK_STATUS: 11,      // K
    STAGE1_PICK_ASSIGNED: 12,    // L
    STAGE1_PICK_DATE: 13,        // M
    STAGE1_OLD_STATUS: 14,       // N
    STAGE1_OLD_ASSIGNED: 15,     // O
    STAGE1_OLD_DATE: 16,         // P
    STAGE2_STATUS: 17,           // Q
    STAGE2_ASSIGNED: 18,         // R
    STAGE2_DATE: 19,             // S
    STAGE2_PICKED_FOR: 20,       // T
    STAGE3_ASSIGNED: 21,         // U
    STAGE3_DATE: 22,             // V
    STAGE3_CHANGE_OUT: 23        // W
  },

  // Employees Sheet
  EMPLOYEES: {
    NAME: 1,              // A
    CLASS: 2,             // B
    LOCATION: 3,          // C
    JOB_NUMBER: 4,        // D
    PHONE: 5,             // E
    NOTIFICATION_EMAILS: 6, // F
    MP_EMAIL: 7,          // G
    EMAIL: 8,             // H
    GLOVE_SIZE: 9,        // I
    SLEEVE_SIZE: 10,      // J
    HIRE_DATE: 11,        // K
    LAST_DAY: 12,         // L
    LAST_DAY_REASON: 13   // M
  },

  // Employee History Sheet
  EMPLOYEE_HISTORY: {
    DATE: 1,              // A
    NAME: 2,              // B
    EVENT_TYPE: 3,        // C
    LOCATION: 4,          // D
    JOB_NUMBER: 5,        // E
    HIRE_DATE: 6,         // F
    LAST_DAY: 7,          // G
    LAST_DAY_REASON: 8,   // H
    REHIRE_DATE: 9,       // I
    NOTES: 10             // J
  }
};

/**
 * Global Schema mapping to avoid hardcoded column indices.
 * Loaded once per execution.
 * @deprecated Use COLS constants directly instead
 */
var SCHEMA = null;

function getColumnMapping(sheetName) {
  if (SCHEMA && SCHEMA[sheetName]) return SCHEMA[sheetName];
  
  if (!SCHEMA) SCHEMA = {};
  
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) return null;
  
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var mapping = {};
  for (var i = 0; i < headers.length; i++) {
    var header = headers[i].toString().trim();
    if (header) {
      mapping[header] = i + 1; // 1-based index
    }
  }
  
  SCHEMA[sheetName] = mapping;
  return mapping;
}

function getCol(sheetName, headerName) {
  var mapping = getColumnMapping(sheetName);
  if (!mapping || !mapping[headerName]) {
    // Fallback/Warning for critical missing columns
    logEvent('Column "' + headerName + '" not found in sheet "' + sheetName + '"', 'ERROR');
    return null;
  }
  return mapping[headerName];
}

/**
 * Adds a custom menu to the Google Sheet for Glove Manager actions.
 */
function onOpen() {
  ensurePickedForColumn();
  var ui = SpreadsheetApp.getUi();
  ui.createMenu('Glove Manager')
    .addItem('Build Sheets', 'buildSheets')
    .addItem('Generate All Reports', 'generateAllReports')
    .addSeparator()
    .addItem('📱 Open Dashboard', 'openDashboardSidebar')
    .addSeparator()
    .addItem('Generate Glove Swaps', 'generateGloveSwaps')
    .addItem('Generate Sleeve Swaps', 'generateSleeveSwaps')
    .addItem('Update Purchase Needs', 'updatePurchaseNeeds')
    .addItem('Update Inventory Reports', 'updateInventoryReports')
    .addItem('Run Reclaims Check', 'runReclaimsCheck')
    .addItem('Update Reclaims Sheet', 'updateReclaimsSheet')
    .addSeparator()
    .addSubMenu(ui.createMenu('📋 History')
      .addItem('Save Current State to History', 'saveHistory')
      .addItem('Import Legacy History', 'showImportLegacyHistoryDialog')
      .addItem('Item History Lookup', 'showItemHistoryLookup')
      .addItem('View Full History', 'viewFullHistory'))
    .addSubMenu(ui.createMenu('📝 To-Do List')
      .addItem('Generate To-Do List', 'generateToDoList')
      .addItem('Clear Completed Tasks', 'clearCompletedTasks'))
    .addSubMenu(ui.createMenu('🔧 Utilities')
      .addItem('Fix All Change Out Dates', 'fixAllChangeOutDates')
      .addItem('⚡ Setup Auto Change Out Dates', 'createEditTrigger')
      .addItem('📤 Archive Previous Employees', 'archivePreviousEmployees')
      .addSeparator()
      .addItem('💾 Create Backup Snapshot', 'createBackupSnapshot')
      .addItem('📂 View Backup Folder', 'openBackupFolder'))
    .addSubMenu(ui.createMenu('📧 Email Reports')
      .addItem('Send Report Now', 'sendEmailReport')
      .addItem('Set Up Weekly Email (Mon 12 PM)', 'createWeeklyEmailTrigger')
      .addItem('Remove Scheduled Email', 'removeEmailTrigger'))
    .addSubMenu(ui.createMenu('🔍 Debug')
      .addItem('Test Edit Trigger', 'testEditTrigger')
      .addItem('Recalc Current Row', 'recalcCurrentRow'))
    .addSeparator()
    .addItem('Close & Save History', 'closeAndSaveHistory')
    .addToUi();

  // Reset the previous sheet tracker for this session
  PropertiesService.getUserProperties().setProperty('previousSheet', '');
}

/**
 * Test function to verify the edit trigger is working.
 * Run this from the menu to see if triggers are properly set up.
 */
function testEditTrigger() {
  var ui = SpreadsheetApp.getUi();
  var triggers = ScriptApp.getProjectTriggers();
  var triggerInfo = 'Installed triggers: ' + triggers.length + '\n';

  for (var i = 0; i < triggers.length; i++) {
    triggerInfo += '- ' + triggers[i].getHandlerFunction() + ' (' + triggers[i].getEventType() + ')\n';
  }

  triggerInfo += '\nSimple onEdit function exists: ' + (typeof onEdit === 'function' ? 'YES' : 'NO');
  triggerInfo += '\nCOLS.INVENTORY.DATE_ASSIGNED = ' + COLS.INVENTORY.DATE_ASSIGNED;
  triggerInfo += '\nCOLS.INVENTORY.ASSIGNED_TO = ' + COLS.INVENTORY.ASSIGNED_TO;

  ui.alert('Edit Trigger Test', triggerInfo, ui.ButtonSet.OK);
}

/**
 * Manually recalculate Change Out Date for the currently selected row.
 * Use this when the automatic trigger doesn't fire.
 */
function recalcCurrentRow() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getActiveSheet();
  var sheetName = sheet.getName();

  if (sheetName !== SHEET_GLOVES && sheetName !== SHEET_SLEEVES) {
    SpreadsheetApp.getUi().alert('Please select a row in the Gloves or Sleeves sheet.');
    return;
  }

  var activeRow = ss.getActiveCell().getRow();
  if (activeRow < 2) {
    SpreadsheetApp.getUi().alert('Please select a data row (not the header).');
    return;
  }

  // Get current values
  var dateAssigned = sheet.getRange(activeRow, COLS.INVENTORY.DATE_ASSIGNED).getValue();
  var location = sheet.getRange(activeRow, COLS.INVENTORY.LOCATION).getValue();
  var assignedTo = sheet.getRange(activeRow, COLS.INVENTORY.ASSIGNED_TO).getValue();
  var isSleeve = (sheetName === SHEET_SLEEVES);

  // Calculate new Change Out Date
  var changeOutDate = calculateChangeOutDate(dateAssigned, location, assignedTo, isSleeve);

  if (changeOutDate) {
    var changeOutCell = sheet.getRange(activeRow, COLS.INVENTORY.CHANGE_OUT_DATE);
    if (changeOutDate === 'N/A') {
      changeOutCell.setNumberFormat('@');
    } else {
      changeOutCell.setNumberFormat('MM/dd/yyyy');
    }
    changeOutCell.setValue(changeOutDate);

    SpreadsheetApp.getUi().alert(
      'Recalculated',
      'Row ' + activeRow + ':\n' +
      'Date Assigned: ' + dateAssigned + '\n' +
      'Assigned To: ' + assignedTo + '\n' +
      'Location: ' + location + '\n' +
      'New Change Out Date: ' + changeOutDate,
      SpreadsheetApp.getUi().ButtonSet.OK
    );
  } else {
    SpreadsheetApp.getUi().alert('Could not calculate Change Out Date. Date Assigned may be empty.');
  }
}

/**
 * Logging utility for consistent logs and error tracking.
 */
function logEvent(message, level) {
  level = level || 'INFO';
  var now = new Date();
  var logMessage = '[' + level + '] [' + now.toISOString() + '] ' + message;
  Logger.log(logMessage);
  
  if (level === 'ERROR') {
    try {
      SpreadsheetApp.getUi().alert('Error: ' + message);
    } catch (e) {
      // Ignore if no UI (e.g. trigger execution)
    }
  }
}

/**
 * Normalizes approval values to standard format.
 * Handles HTML entities and common variations.
 * Valid values: None, CL2, CL3, CL2 & CL3
 * @param {string} value - The approval value to normalize
 * @returns {string} - Normalized approval value
 */
function normalizeApprovalValue(value) {
  if (!value) return 'CL2'; // Default

  // Clean the value - decode HTML entities and normalize
  var cleaned = String(value).trim();
  // Decode &amp; and &#38; to &
  cleaned = cleaned.split('&amp;').join('&');
  cleaned = cleaned.split('&#38;').join('&');
  cleaned = cleaned.toUpperCase();

  // Map to valid values
  switch(cleaned) {
    case 'NONE':
      return 'None';
    case 'CL2':
    case 'CLASS 2':
    case '2':
      return 'CL2';
    case 'CL3':
    case 'CLASS 3':
    case '3':
      return 'CL3';
    case 'CL2 & CL3':
    case 'CL2 AND CL3':
    case 'CL2&CL3':
    case 'BOTH':
    case '2 & 3':
    case '2&3':
      return 'CL2 & CL3';
    default:
      // Check if it's already a valid value (case-insensitive match)
      if (cleaned === 'CL2 & CL3' || value === 'CL2 & CL3') return 'CL2 & CL3';
      Logger.log('[WARN] Unrecognized approval value "' + value + '" - defaulting to CL2');
      return 'CL2';
  }
}

/**
 * Utility to ensure the 'Picked For' column exists in Gloves and Sleeves tabs.
 *
 * Both tabs have same layout:
 * Columns: Item, Size, Class, Test Date, Date Assigned, Location, Status, Assigned To, Change Out Date, Picked For, Notes
 *          A     B     C      D          E              F         G       H            I                J (col 10)   K
 */
function ensurePickedForColumn() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  [SHEET_GLOVES, SHEET_SLEEVES].forEach(function(sheetName) {
    var sheet = ss.getSheetByName(sheetName);
    if (!sheet) return;
    var lastCol = sheet.getLastColumn();
    var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
    var pickedForIdx = headers.indexOf('Picked For');
    
    if (pickedForIdx === -1) {
      // Find 'Notes' to insert before it, or just append
      var notesIdx = headers.indexOf('Notes');
      var insertAt = (notesIdx !== -1) ? notesIdx + 1 : lastCol + 1;
      sheet.insertColumnBefore(insertAt);
      sheet.getRange(1, insertAt).setValue('Picked For')
        .setFontWeight('bold')
        .setBackground(HEADER_BG_COLOR)
        .setFontColor('#ffffff')
        .setHorizontalAlignment('center');
      logEvent('Added Picked For column to ' + sheetName + ' at column ' + insertAt);
    }
  });
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
  } catch (err) {
    Logger.log('Error in onChangeHandler: ' + err);
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

  // Handle Gloves/Sleeves tab edits (Assigned To or Date Assigned columns)
  if (sheetName === SHEET_GLOVES || sheetName === SHEET_SLEEVES) {
    // Use COLS constants for reliable column indices
    var assignedToCol = COLS.INVENTORY.ASSIGNED_TO;     // Column H = 8
    var dateAssignedCol = COLS.INVENTORY.DATE_ASSIGNED; // Column E = 5

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

/**
 * Handles changes to the Assigned To column in Gloves/Sleeves tabs.
 * Updates Status and Location based on the new assignment.
 */
function handleInventoryAssignedToChange(ss, sheet, sheetName, editedRow, newValue) {
  if (editedRow < 2) return; // Skip header row

  // Clear schema cache to ensure fresh column mapping
  SCHEMA = null;

  var lock = null;
  try {
    // Try to get a lock (may fail with simple triggers due to authorization)
    try {
      lock = LockService.getScriptLock();
      lock.waitLock(30000);
    } catch (lockErr) {
      // Simple trigger - proceed without lock
      lock = null;
    }

    // Get the actual cell value directly from the sheet (more reliable than e.value)
    var assignedToCol = getCol(sheetName, 'Assigned To') || 8;  // Column H fallback
    var actualValue = sheet.getRange(editedRow, assignedToCol).getValue();

    logEvent('handleInventoryAssignedToChange ENTRY: Row=' + editedRow + ', newValue=' + newValue + ', actualValue=' + actualValue, 'DEBUG');

    var employeesSheet = ss.getSheetByName(SHEET_EMPLOYEES);
    if (!employeesSheet) {
      logEvent('handleInventoryAssignedToChange: Employees sheet not found!', 'ERROR');
      return;
    }

    // Build name to location map - use dynamic column lookup
    var empData = employeesSheet.getDataRange().getValues();
    var empHeaders = empData[0];
    var nameColIdx = 0; // Name is always first column
    var locationColIdx = -1;

    // Find Location column dynamically
    for (var h = 0; h < empHeaders.length; h++) {
      if (String(empHeaders[h]).trim().toLowerCase() === 'location') {
        locationColIdx = h;
        break;
      }
    }

    if (locationColIdx === -1) {
      logEvent('handleInventoryAssignedToChange: Location column not found in Employees sheet!', 'ERROR');
      locationColIdx = 2; // Fallback - Location is typically at index 2 (column C)
    }

    var nameToLocation = {};
    for (var i = 1; i < empData.length; i++) {
      var name = (empData[i][nameColIdx] || '').toString().trim().toLowerCase();
      var loc = empData[i][locationColIdx] || '';
      if (name) nameToLocation[name] = loc;
    }

    // Also check Employee History for Previous Employees (terminated employees not in current Employees sheet)
    var previousEmployeeNames = new Set();
    var employeeHistorySheet = ss.getSheetByName('Employee History');
    if (employeeHistorySheet && employeeHistorySheet.getLastRow() > 2) {
      var historyData = employeeHistorySheet.getRange(3, 1, employeeHistorySheet.getLastRow() - 2, 10).getValues();
      // Employee History columns: A=Date, B=Employee Name, C=Event Type, D=Location
      for (var hi = 0; hi < historyData.length; hi++) {
        var histName = (historyData[hi][1] || '').toString().trim();
        var histNameLower = histName.toLowerCase();
        var histLocation = (historyData[hi][3] || '').toString().trim().toLowerCase();

        // If this employee has Location = "Previous Employee" and not already in current employees
        if (histLocation === 'previous employee' && histName && !nameToLocation[histNameLower]) {
          nameToLocation[histNameLower] = 'Previous Employee';
          previousEmployeeNames.add(histNameLower);
        }
      }
    }

    logEvent('handleInventoryAssignedToChange: Built nameToLocation map with ' + Object.keys(nameToLocation).length + ' entries (including ' + previousEmployeeNames.size + ' previous employees)', 'DEBUG');

    // Use actualValue from the cell, fall back to newValue if needed
    var assignedTo = (actualValue !== undefined && actualValue !== null && actualValue !== '')
                     ? actualValue.toString().trim()
                     : (newValue || '').toString().trim();
    var assignedToLower = assignedTo.toLowerCase();

    logEvent('handleInventoryAssignedToChange: Processing assignedTo="' + assignedTo + '", lowercase="' + assignedToLower + '"', 'DEBUG');

    // Determine new status and location based on assigned to value
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
      // Regular employee assignment (or previous employee from history)
      newStatus = 'Assigned';
      newLocation = nameToLocation[assignedToLower];
    } else if (assignedTo !== '') {
      // Name not found in map or history
      logEvent('handleInventoryAssignedToChange: Employee "' + assignedTo + '" not found in ' + SHEET_EMPLOYEES + ' or Employee History', 'WARNING');
      newStatus = 'Assigned';
      newLocation = 'Unknown';
    }

    // Use COLS constants for column indices (more reliable than dynamic lookup)
    var colStatus = COLS.INVENTORY.STATUS;              // Column G = 7
    var colLocation = COLS.INVENTORY.LOCATION;          // Column F = 6
    var colDateAssigned = COLS.INVENTORY.DATE_ASSIGNED; // Column E = 5
    var colChangeOutDate = COLS.INVENTORY.CHANGE_OUT_DATE; // Column I = 9

    logEvent('handleInventoryAssignedToChange: Row=' + editedRow + ', AssignedTo=' + assignedTo +
             ', newStatus=' + newStatus + ', newLocation=' + newLocation +
             ', colStatus=' + colStatus + ', colLocation=' + colLocation, 'DEBUG');

    // Update Status and Location if we determined values
    if (newStatus) {
      sheet.getRange(editedRow, colStatus).setValue(newStatus);
      logEvent('Set Status to "' + newStatus + '" at row ' + editedRow + ', col ' + colStatus, 'DEBUG');
    }
    if (newLocation) {
      sheet.getRange(editedRow, colLocation).setValue(newLocation);
      logEvent('Set Location to "' + newLocation + '" at row ' + editedRow + ', col ' + colLocation, 'DEBUG');
    }

    // Update Change Out Date based on Date Assigned
    if (colDateAssigned && colChangeOutDate) {
      var dateAssigned = sheet.getRange(editedRow, colDateAssigned).getValue();
      if (dateAssigned) {
        var isSleeve = (sheetName === SHEET_SLEEVES);
        var changeOutDate = calculateChangeOutDate(dateAssigned, newLocation, assignedTo, isSleeve);
        if (changeOutDate) {
          var changeOutCell = sheet.getRange(editedRow, colChangeOutDate);
          if (changeOutDate === 'N/A') {
            changeOutCell.setNumberFormat('@');  // Plain text for N/A
          } else {
            changeOutCell.setNumberFormat('MM/dd/yyyy');
          }
          changeOutCell.setValue(changeOutDate);
          logEvent('Set Change Out Date to ' + changeOutDate + ' for row ' + editedRow, 'DEBUG');
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
 * Handles changes to the Date Assigned column in Gloves/Sleeves tabs.
 * Automatically recalculates and updates the Change Out Date based on Location.
 */
function handleDateAssignedChange(ss, sheet, sheetName, editedRow, newValue) {
  if (editedRow < 2) return; // Skip header row

  var lock = null;
  try {
    // Try to get a lock (may fail with simple triggers due to authorization)
    try {
      lock = LockService.getScriptLock();
      lock.waitLock(30000);
    } catch (lockErr) {
      // Simple trigger - proceed without lock
      lock = null;
    }

    // Flush any pending changes to ensure we read fresh data
    SpreadsheetApp.flush();

    logEvent('handleDateAssignedChange: Row=' + editedRow + ', newValue=' + newValue + ', type=' + typeof newValue, 'DEBUG');

    // Get column indices - use COLS constants with fallbacks
    var colDateAssigned = COLS.INVENTORY.DATE_ASSIGNED;   // Column E = 5
    var colLocation = COLS.INVENTORY.LOCATION;            // Column F = 6
    var colChangeOutDate = COLS.INVENTORY.CHANGE_OUT_DATE; // Column I = 9
    var colAssignedTo = COLS.INVENTORY.ASSIGNED_TO;       // Column H = 8

    // Get the current location and assigned to
    var location = sheet.getRange(editedRow, colLocation).getValue();
    var assignedTo = sheet.getRange(editedRow, colAssignedTo).getValue();

    // Read the actual cell value to get the proper Date object
    var dateAssigned = sheet.getRange(editedRow, colDateAssigned).getValue();

    // Determine if this is a sleeve
    var isSleeve = (sheetName === SHEET_SLEEVES);

    logEvent('handleDateAssignedChange: dateAssigned=' + dateAssigned + ', location=' + location + ', assignedTo=' + assignedTo + ', isSleeve=' + isSleeve, 'DEBUG');

    // Calculate Change Out Date
    var changeOutDate = calculateChangeOutDate(dateAssigned, location, assignedTo, isSleeve);

    logEvent('handleDateAssignedChange: Calculated changeOutDate=' + changeOutDate, 'DEBUG');

    if (changeOutDate) {
      var changeOutDateCell = sheet.getRange(editedRow, colChangeOutDate);
      if (changeOutDate === 'N/A') {
        changeOutDateCell.setNumberFormat('@');  // Plain text for N/A
      } else {
        changeOutDateCell.setNumberFormat('MM/dd/yyyy');
      }
      changeOutDateCell.setValue(changeOutDate);
      SpreadsheetApp.flush(); // Ensure the value is written
      logEvent('handleDateAssignedChange: Set Change Out Date to ' + changeOutDate + ' for row ' + editedRow, 'DEBUG');
    } else {
      logEvent('handleDateAssignedChange: Could not calculate Change Out Date for dateAssigned=' + dateAssigned, 'WARNING');
    }

  } catch (e) {
    logEvent('handleDateAssignedChange error: ' + e, 'ERROR');
  } finally {
    if (lock) lock.releaseLock();
  }
}

/**
 * Calculates the Change Out Date based on Date Assigned, Location, Assigned To, and Item Type.
 *
 * GLOVES (per Workflow_and_Sheet_Expectations.md):
 * - On Shelf = 12 months
 * - Northern Lights location = 6 months
 * - In Testing / Packed For Delivery / Packed For Testing = 3 months (counts toward employee period)
 * - All other locations (employee assigned) = 3 months (default)
 * - Lost / Failed Rubber / Previous Employee = N/A
 *
 * SLEEVES:
 * - All items = 12 months (hardcoded, no exceptions)
 * - Lost / Failed Rubber = N/A
 *
 * @param {Date|number|string} dateAssigned - The date assigned
 * @param {string} location - The location
 * @param {string} [assignedTo] - Optional: Who/what the item is assigned to
 * @param {boolean} [isSleeve] - Optional: True if this is a sleeve (default: false = glove)
 * @return {Date|null|string} The calculated change out date, or 'N/A' for Lost/Failed Rubber/Previous Employee
 */
function calculateChangeOutDate(dateAssigned, location, assignedTo, isSleeve) {
  if (!dateAssigned) return null;

  var assignedToLower = (assignedTo || '').toString().trim().toLowerCase();
  var locationLower = (location || '').toString().trim().toLowerCase();

  // SLEEVES: Always 12 months (hardcoded)
  if (isSleeve) {
    // Lost, Failed Rubber, and Previous Employee sleeves get N/A
    if (assignedToLower === 'lost' || assignedToLower === 'failed rubber' ||
        assignedToLower === 'not repairable' || locationLower === 'previous employee' ||
        locationLower === 'destroyed' || locationLower === 'lost') {
      return 'N/A';
    }
    var d = new Date(dateAssigned);
    if (isNaN(d.getTime())) return null;
    d.setMonth(d.getMonth() + 12);
    return d;
  }

  // GLOVES:
  // Lost, Failed Rubber, and Previous Employee items get N/A
  if (assignedToLower === 'lost' || assignedToLower === 'failed rubber' ||
      assignedToLower === 'not repairable' || locationLower === 'previous employee' ||
      locationLower === 'destroyed' || locationLower === 'lost') {
    return 'N/A';
  }

  var d = new Date(dateAssigned);
  if (isNaN(d.getTime())) return null;

  var months;

  // On Shelf = 12 months (sitting on shelf, not actively used)
  if (assignedToLower === 'on shelf') {
    months = 12;
  }
  // Northern Lights = 6 months (exception for this location)
  else if (locationLower === 'northern lights') {
    months = 6;
  }
  // In Testing / Packed For Delivery / Packed For Testing = 3 months
  // These count toward the employee period per workflow documentation
  else if (assignedToLower === 'packed for delivery' ||
           assignedToLower === 'packed for testing' ||
           assignedToLower === 'in testing') {
    months = 3;
  }
  // All other (employee assigned) = 3 months (default for gloves)
  else {
    months = 3;
  }

  d.setMonth(d.getMonth() + months);
  return d;
}

/**
 * Recalculates all Change Out Dates in Gloves and Sleeves sheets.
 * Called from Glove Manager menu → 🔧 Utilities → Fix All Change Out Dates
 */
// eslint-disable-next-line no-unused-vars
function fixAllChangeOutDates() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var ui = SpreadsheetApp.getUi();

  var result = ui.alert(
    'Recalculate All Change Out Dates',
    'This will recalculate ALL Change Out Dates in the Gloves and Sleeves sheets.\n\n' +
    'GLOVES:\n' +
    '• On Shelf = +12 months\n' +
    '• Northern Lights = +6 months\n' +
    '• In Testing / Packed For Delivery / Packed For Testing = +3 months\n' +
    '• All other locations (employee) = +3 months (default)\n' +
    '• Lost / Failed Rubber / Previous Employee = N/A\n\n' +
    'SLEEVES:\n' +
    '• All items = +12 months (hardcoded)\n' +
    '• Lost / Failed Rubber / Previous Employee = N/A\n\n' +
    'Continue?',
    ui.ButtonSet.YES_NO
  );

  if (result !== ui.Button.YES) {
    return;
  }

  var fixedCount = 0;
  var sheetsToFix = [SHEET_GLOVES, SHEET_SLEEVES];

  sheetsToFix.forEach(function(sheetName) {
    var sheet = ss.getSheetByName(sheetName);
    if (!sheet) return;

    var data = sheet.getDataRange().getValues();
    var headers = data[0];

    // Find column indices (0-based for array access)
    var colDateAssignedIdx = headers.indexOf('Date Assigned');
    var colLocationIdx = headers.indexOf('Location');
    var colChangeOutDateIdx = headers.indexOf('Change Out Date');
    var colAssignedToIdx = headers.indexOf('Assigned To');

    if (colDateAssignedIdx === -1 || colLocationIdx === -1 || colChangeOutDateIdx === -1 || colAssignedToIdx === -1) {
      Logger.log('fixAllChangeOutDates: Missing columns in ' + sheetName +
                 ' - DateAssigned=' + colDateAssignedIdx +
                 ', Location=' + colLocationIdx +
                 ', ChangeOutDate=' + colChangeOutDateIdx +
                 ', AssignedTo=' + colAssignedToIdx);
      return;
    }

    Logger.log('fixAllChangeOutDates: Processing ' + sheetName +
               ' - DateAssigned col=' + (colDateAssignedIdx + 1) +
               ', Location col=' + (colLocationIdx + 1) +
               ', ChangeOutDate col=' + (colChangeOutDateIdx + 1) +
               ', AssignedTo col=' + (colAssignedToIdx + 1));

    for (var i = 1; i < data.length; i++) {
      var row = data[i];
      var dateAssigned = row[colDateAssignedIdx];
      var location = row[colLocationIdx];
      var currentChangeOut = row[colChangeOutDateIdx];
      var assignedTo = row[colAssignedToIdx];

      // Skip rows without Date Assigned
      if (!dateAssigned) {
        continue;
      }

      // Determine if this is a sleeve sheet
      var isSleeve = (sheetName === SHEET_SLEEVES);

      // Calculate the correct Change Out Date (pass assignedTo and isSleeve)
      var correctChangeOut = calculateChangeOutDate(dateAssigned, location, assignedTo, isSleeve);

      if (correctChangeOut) {
        // Check if the current value is different from the correct value
        var needsUpdate = false;
        var currentChangeOutStr = '';

        if (correctChangeOut === 'N/A') {
          needsUpdate = (currentChangeOut !== 'N/A');
          currentChangeOutStr = String(currentChangeOut);
        } else if (correctChangeOut instanceof Date) {
          // Compare dates
          var correctDateStr = Utilities.formatDate(correctChangeOut, ss.getSpreadsheetTimeZone(), 'MM/dd/yyyy');

          if (currentChangeOut instanceof Date) {
            var currentDateStr = Utilities.formatDate(currentChangeOut, ss.getSpreadsheetTimeZone(), 'MM/dd/yyyy');
            needsUpdate = (currentDateStr !== correctDateStr);
            currentChangeOutStr = currentDateStr;
          } else if (typeof currentChangeOut === 'number' && currentChangeOut > 0) {
            // Serial date - convert and compare
            var tempDate = new Date(1899, 11, 30);
            tempDate.setDate(tempDate.getDate() + currentChangeOut);
            var currentDateStr2 = Utilities.formatDate(tempDate, ss.getSpreadsheetTimeZone(), 'MM/dd/yyyy');
            needsUpdate = (currentDateStr2 !== correctDateStr);
            currentChangeOutStr = currentDateStr2 + ' (serial: ' + currentChangeOut + ')';
          } else {
            // No valid current date
            needsUpdate = true;
            currentChangeOutStr = String(currentChangeOut || '(empty)');
          }
        }

        if (needsUpdate) {
          var cell = sheet.getRange(i + 1, colChangeOutDateIdx + 1);  // +1 for 1-based column
          if (correctChangeOut === 'N/A') {
            cell.setNumberFormat('@');  // Plain text for N/A
          } else {
            cell.setNumberFormat('MM/dd/yyyy');
          }
          cell.setValue(correctChangeOut);
          fixedCount++;

          var newValueStr = (correctChangeOut === 'N/A') ? 'N/A' : Utilities.formatDate(correctChangeOut, ss.getSpreadsheetTimeZone(), 'MM/dd/yyyy');
          Logger.log('Fixed row ' + (i + 1) + ' in ' + sheetName +
                     ': DateAssigned=' + dateAssigned +
                     ', Location=' + location +
                     ', AssignedTo=' + assignedTo +
                     ', Old=' + currentChangeOutStr +
                     ', New=' + newValueStr);
        }
      } else {
        Logger.log('Could not calculate Change Out Date for row ' + (i + 1) +
                   ' in ' + sheetName + ': DateAssigned=' + dateAssigned);
      }
    }
  });

  ui.alert('✅ Fixed ' + fixedCount + ' Change Out Dates in Gloves and Sleeves sheets.');
  Logger.log('fixAllChangeOutDates: Fixed ' + fixedCount + ' dates total');
}

/**
 * Handles manual edits to the Pick List Item # column (G) in Glove/Sleeve Swaps.
 * Applies light blue background (#e3f2fd) to indicate manual entry.
 * Appends "(Manual)" to the status column if not already present.
 * @param {Spreadsheet} ss - The active spreadsheet
 * @param {Sheet} swapSheet - The Glove/Sleeve Swaps sheet
 * @param {Sheet} inventorySheet - The Gloves/Sleeves inventory sheet
 * @param {number} editedRow - Row that was edited (1-based)
 * @param {string} newValue - The new Pick List item number
 * @param {boolean} isGloveSwaps - True if Glove Swaps, false if Sleeve Swaps
 */
function handlePickListManualEdit(ss, swapSheet, inventorySheet, editedRow, newValue, isGloveSwaps) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);

    logEvent('Manual Pick List edit at row ' + editedRow + ': ' + newValue, 'DEBUG');

    // Get the edited cell
    var pickListCell = swapSheet.getRange(editedRow, 7);  // Column G
    var statusCell = swapSheet.getRange(editedRow, 8);    // Column H

    // Apply light blue background to indicate manual entry
    pickListCell.setBackground('#e3f2fd');

    // Get current status and append "(Manual)" if not already present
    var currentStatus = statusCell.getValue().toString().trim();
    if (currentStatus && currentStatus.indexOf('(Manual)') === -1) {
      statusCell.setValue(currentStatus + ' (Manual)');
    }

    logEvent('Applied manual pick list formatting to row ' + editedRow);

  } catch (e) {
    logEvent('handlePickListManualEdit error: ' + e, 'ERROR');
  } finally {
    lock.releaseLock();
  }
}

/**
 * Handles Picked checkbox changes (column I) in Glove/Sleeve Swaps.
 * Stage 2: When checked - updates Pick List glove to Ready For Delivery
 * Stage 5: When unchecked - reverts Pick List glove to Stage 1 state
 */
function handlePickedCheckboxChange(ss, swapSheet, inventorySheet, editedRow, newValue, isGloveSwaps) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
    
    var isChecked = (newValue === true || newValue === 'TRUE' || newValue === true);

    // Get the row data (columns A-W, 1-23)
    var rowData = swapSheet.getRange(editedRow, 1, 1, 23).getValues()[0];

    // Use HARDCODED indices for Swap sheets - getCol() fails because row 1 contains
    // "Class X Glove/Sleeve Swaps" title, not column headers. The structure is fixed
    // per writeSwapTableHeadersDynamic(): A=Employee, B=Current Item#, C=Size,
    // D=Date Assigned, E=Change Out Date, F=Days Left, G=Pick List Item#,
    // H=Status, I=Picked, J=Date Changed
    var colEmpIdx = 0;       // Column A - Employee
    var colPickNumIdx = 6;   // Column G - Pick List Item #
    var colStatusIdx = 7;    // Column H - Status

    var stage1StatusIdx = 10;
    var stage1AssignedToIdx = 11;
    var stage1DateAssignedIdx = 12;

    var employeeName = rowData[colEmpIdx];
    var pickListNum = rowData[colPickNumIdx];
    var currentStatus = rowData[colStatusIdx];

    var stage1Status = rowData[stage1StatusIdx];
    var stage1AssignedTo = rowData[stage1AssignedToIdx];
    var stage1DateAssigned = rowData[stage1DateAssignedIdx];

    if (!pickListNum || pickListNum === '—') {
      logEvent('handlePickedCheckboxChange: No Pick List item for row ' + editedRow, 'WARNING');
      return;
    }

    // Find the Pick List item in the inventory sheet
    // Column A (index 0) is always the item number (header: "Glove" or "Sleeve Number")
    var inventoryData = inventorySheet.getDataRange().getValues();
    var invSheetName = inventorySheet.getName();

    var pickListRow = -1;
    for (var i = 1; i < inventoryData.length; i++) {
      if (String(inventoryData[i][0]).trim() === String(pickListNum).trim()) {
        pickListRow = i + 1;
        break;
      }
    }

    if (pickListRow === -1) {
      logEvent('handlePickedCheckboxChange: Pick List item ' + pickListNum + ' not found in ' + invSheetName, 'ERROR');
      return;
    }

    // Inventory sheet columns (1-based) - structure: A=Item#, B=Size, C=Class,
    // D=Test Date, E=Date Assigned(5), F=Location(6), G=Status(7),
    // H=Assigned To(8), I=Change Out Date(9), J=Picked For(10)
    var invColDateAssigned = 5;
    var invColLocation = 6;
    var invColStatus = 7;
    var invColAssignedTo = 8;
    var invColPickedFor = 10;

    var today = new Date();
    var todayStr = Utilities.formatDate(today, ss.getSpreadsheetTimeZone(), 'yyyy-MM-dd');

    if (isChecked) {
      // STAGE 2: Picked checkbox checked
      logEvent('Stage 2: Picked checked for row ' + editedRow + ', Pick List: ' + pickListNum);

      // Update visible Status column (H = column 8, 1-based)
      swapSheet.getRange(editedRow, 8).setValue('Ready For Delivery 🚚');

      // Store Stage 2 values in columns Q-T (indices 16-19)
      var stage2Values = [
        'Ready For Delivery',           // Q - Status
        'Packed For Delivery',          // R - Assigned To
        todayStr,                       // S - Date Assigned
        employeeName + ' Picked On ' + todayStr  // T - Picked For
      ];
      swapSheet.getRange(editedRow, 17, 1, 4).setValues([stage2Values]);

      // Update the Pick List item in inventory sheet
      var todayFormatted = Utilities.formatDate(today, ss.getSpreadsheetTimeZone(), 'MM/dd/yyyy');
      inventorySheet.getRange(pickListRow, invColStatus).setValue('Ready For Delivery');
      inventorySheet.getRange(pickListRow, invColAssignedTo).setValue('Packed For Delivery');
      inventorySheet.getRange(pickListRow, invColDateAssigned).setValue(todayFormatted);
      inventorySheet.getRange(pickListRow, invColLocation).setValue("Cody's Truck");
      inventorySheet.getRange(pickListRow, invColPickedFor).setValue(employeeName + ' Picked On ' + todayStr);

    } else {
      // STAGE 5: Picked checkbox unchecked - revert to Stage 1
      logEvent('Stage 5 Revert: ' + pickListNum + ' returned to ' + (stage1Status || 'Stage 1 state'));

      // Clear Date Changed (column J = column 10)
      swapSheet.getRange(editedRow, 10).setValue('');

      // Clear Stage 2 (Q-T) and Stage 3 (U-W) columns
      swapSheet.getRange(editedRow, 17, 1, 7).clearContent();

      // Revert visible Status based on original status
      var revertedStatus = stage1Status || 'In Stock ✅';
      if (stage1Status) {
        var statusLower = stage1Status.toString().toLowerCase();
        if (statusLower === 'on shelf') {
          revertedStatus = 'In Stock ✅';
        } else if (statusLower === 'ready for delivery') {
          revertedStatus = 'Ready For Delivery 🚚';
        } else if (statusLower === 'in testing') {
          revertedStatus = 'In Testing ⏳';
        }
      }
      // Update visible Status column (H = column 8, 1-based)
      swapSheet.getRange(editedRow, 8).setValue(revertedStatus);

      // Revert Pick List item in inventory to Stage 1 values
      inventorySheet.getRange(pickListRow, invColStatus).setValue(stage1Status || 'On Shelf');
      inventorySheet.getRange(pickListRow, invColAssignedTo).setValue(stage1AssignedTo || 'On Shelf');
      if (stage1DateAssigned) {
        var stage1Date = new Date(stage1DateAssigned);
        if (!isNaN(stage1Date.getTime())) {
          var stage1DateFormatted = Utilities.formatDate(stage1Date, ss.getSpreadsheetTimeZone(), 'MM/dd/yyyy');
          inventorySheet.getRange(pickListRow, invColDateAssigned).setValue(stage1DateFormatted);
        } else {
          inventorySheet.getRange(pickListRow, invColDateAssigned).setValue(stage1DateAssigned);
        }
      }
      inventorySheet.getRange(pickListRow, invColLocation).setValue('Helena');
      inventorySheet.getRange(pickListRow, invColPickedFor).setValue('');
    }
  } catch (e) {
    logEvent('handlePickedCheckboxChange error: ' + e, 'ERROR');
  } finally {
    lock.releaseLock();
  }
}

/**
 * Handles Date Changed edits (column J) in Glove/Sleeve Swaps.
 * Stage 3: When date entered - completes swap, assigns new glove to employee, old glove to testing
 * Stage 4: When date removed - reverts Pick List glove to Stage 2 state
 */
function handleDateChangedEdit(ss, swapSheet, inventorySheet, editedRow, newValue, isGloveSwaps) {
  var hasDate = (newValue !== null && newValue !== undefined && newValue !== '');

  // Get the row data (columns A-W, 1-23)
  var rowData = swapSheet.getRange(editedRow, 1, 1, 23).getValues()[0];

  var employeeName = rowData[0];     // Column A
  var oldItemNum = rowData[1];       // Column B - Current/Old glove number
  var pickListNum = rowData[6];      // Column G - Pick List glove/sleeve number
  var isPicked = rowData[8];         // Column I - Picked checkbox

  // Stage 2 stored values (columns Q-T, indices 16-19)
  var stage2Status = rowData[16];
  var stage2AssignedTo = rowData[17];
  var stage2DateAssigned = rowData[18];
  var stage2PickedFor = rowData[19];

  // Old glove Stage 1 values (columns N-P, indices 13-15)
  var oldGloveStatus = rowData[13];
  var oldGloveAssignedTo = rowData[14];
  var oldGloveDateAssigned = rowData[15];

  if (!pickListNum || pickListNum === '—') {
    Logger.log('processEdit: No Pick List item for row ' + editedRow);
    return;
  }

  // Verify Picked is checked before processing Date Changed
  if (!isPicked && hasDate) {
    Logger.log('processEdit: Date Changed entered but Picked not checked - ignoring');
    return;
  }

  // Find the Pick List item in the inventory sheet
  var inventoryData = inventorySheet.getDataRange().getValues();
  var pickListRow = -1;
  var oldItemRow = -1;

  for (var i = 1; i < inventoryData.length; i++) {
    var itemNum = String(inventoryData[i][0]).trim();
    if (itemNum === String(pickListNum).trim()) {
      pickListRow = i + 1;
    }
    if (oldItemNum && itemNum === String(oldItemNum).trim()) {
      oldItemRow = i + 1;
    }
  }

  if (pickListRow === -1) {
    Logger.log('processEdit: Pick List item not found: ' + pickListNum);
    return;
  }

  // Get employee location from Employees sheet
  var employeesSheet = ss.getSheetByName(SHEET_EMPLOYEES);
  var employeeLocation = 'Helena';
  if (employeesSheet) {
    var empData = employeesSheet.getDataRange().getValues();
    for (var j = 1; j < empData.length; j++) {
      if ((empData[j][0] || '').toString().trim().toLowerCase() === employeeName.toString().trim().toLowerCase()) {
        employeeLocation = empData[j][2] || 'Helena';
        break;
      }
    }
  }

  if (hasDate) {
    // STAGE 3: Date Changed entered - complete the swap
    Logger.log('Stage 3: Date Changed entered for row ' + editedRow + ', completing swap');
    Logger.log('Date Changed raw value: ' + newValue + ', type: ' + typeof newValue);

    // Parse the date properly - handle both Date objects and string formats
    var dateChanged;
    if (newValue instanceof Date) {
      dateChanged = newValue;
    } else {
      // Try to parse as date string
      dateChanged = new Date(newValue);
    }

    // If still invalid, try manual parsing for common formats like MM/DD/YYYY
    if (isNaN(dateChanged.getTime())) {
      var parts = String(newValue).split('/');
      if (parts.length === 3) {
        dateChanged = new Date(parseInt(parts[2]), parseInt(parts[0]) - 1, parseInt(parts[1]));
      }
    }

    // Last resort - use today
    if (isNaN(dateChanged.getTime())) {
      Logger.log('Could not parse date, using today');
      dateChanged = new Date();
    }

    var dateChangedStr = Utilities.formatDate(dateChanged, ss.getSpreadsheetTimeZone(), 'yyyy-MM-dd');
    var dateChangedFormatted = Utilities.formatDate(dateChanged, ss.getSpreadsheetTimeZone(), 'MM/dd/yyyy');
    Logger.log('Parsed date: ' + dateChangedFormatted);

    // Calculate Change Out Date based on location, assignedTo, and item type
    // Determine if this is a sleeve swap
    var isSleeve = (swapSheet.getName() === SHEET_SLEEVE_SWAPS);
    var changeOutDate = calculateChangeOutDate(dateChanged, employeeLocation, employeeName, isSleeve);
    var changeOutDateFormatted = changeOutDate && changeOutDate !== 'N/A' 
      ? Utilities.formatDate(changeOutDate, ss.getSpreadsheetTimeZone(), 'MM/dd/yyyy') 
      : (changeOutDate === 'N/A' ? 'N/A' : '');

    // Store Stage 3 values in columns U-W (indices 20-22)
    var stage3Values = [
      employeeName,                    // U - Assigned To
      dateChangedStr,                  // V - Date Assigned
      changeOutDateFormatted           // W - Change Out Date
    ];
    swapSheet.getRange(editedRow, 21, 1, 3).setValues([stage3Values]);

    // Update visible Status and Days Left to "Assigned"
    swapSheet.getRange(editedRow, 8).setValue('Assigned').setFontWeight('bold').setFontColor('#2e7d32');
    swapSheet.getRange(editedRow, 6).setValue('Assigned').setFontWeight('bold').setFontColor('#2e7d32');

    // Update the Pick List item (NEW glove/sleeve) in inventory - assign to employee
    inventorySheet.getRange(pickListRow, 7).setValue('Assigned');           // Status (G)
    inventorySheet.getRange(pickListRow, 8).setValue(employeeName);         // Assigned To (H)
    inventorySheet.getRange(pickListRow, 5).setNumberFormat('MM/dd/yyyy').setValue(dateChanged); // Date Assigned (E)
    inventorySheet.getRange(pickListRow, 6).setValue(employeeLocation);     // Location (F)
    // Write Change Out Date to inventory with proper formatting
    var changeOutCell = inventorySheet.getRange(pickListRow, 9); // Column I
    if (changeOutDate === 'N/A') {
      changeOutCell.setNumberFormat('@').setValue('N/A');  // Plain text for N/A
    } else if (changeOutDate) {
      changeOutCell.setNumberFormat('MM/dd/yyyy').setValue(changeOutDate);  // Date object
    }
    inventorySheet.getRange(pickListRow, 10).setValue('');                  // Clear Picked For (J)

    // Update the Old glove - send for testing
    if (oldItemRow > 0) {
      inventorySheet.getRange(oldItemRow, 7).setValue('Ready For Test');    // Status (G)
      inventorySheet.getRange(oldItemRow, 8).setValue('Packed For Testing');// Assigned To (H)
      inventorySheet.getRange(oldItemRow, 5).setNumberFormat('MM/dd/yyyy').setValue(dateChanged); // Date Assigned (E)
      inventorySheet.getRange(oldItemRow, 6).setValue("Cody's Truck");      // Location (F)
    }

  } else {
    // STAGE 4: Date Changed removed - revert to Stage 2 state
    Logger.log('Stage 4: Date Changed removed for row ' + editedRow + ', reverting to Stage 2');

    // Clear Stage 3 columns (U-W)
    swapSheet.getRange(editedRow, 21, 1, 3).clearContent();

    // Revert visible Status to Stage 2 emoji status
    swapSheet.getRange(editedRow, 8).setValue('Ready For Delivery 🚚');

    // Recalculate Days Left based on Change Out Date
    var changeOutDateVal = swapSheet.getRange(editedRow, 5).getValue();
    if (changeOutDateVal) {
      var today = new Date();
      var changeOut = new Date(changeOutDateVal);
      var diffDays = Math.ceil((changeOut - today) / (1000 * 60 * 60 * 24));
      var daysLeftText = diffDays < 0 ? 'OVERDUE' : String(diffDays);
      var daysLeftColor = diffDays < 0 ? '#d32f2f' : (diffDays <= 14 ? '#ff9800' : '#2e7d32');
      swapSheet.getRange(editedRow, 6).setValue(daysLeftText).setFontColor(daysLeftColor);
    }

    // Revert Pick List item to Stage 2 values
    inventorySheet.getRange(pickListRow, 7).setValue(stage2Status || 'Ready For Delivery');     // Status (G)
    inventorySheet.getRange(pickListRow, 8).setValue(stage2AssignedTo || 'Packed For Delivery'); // Assigned To (H)
    if (stage2DateAssigned) {
      // Format the date properly before setting
      var stage2Date = new Date(stage2DateAssigned);
      if (!isNaN(stage2Date)) {
        var stage2DateFormatted = Utilities.formatDate(stage2Date, ss.getSpreadsheetTimeZone(), 'MM/dd/yyyy');
        inventorySheet.getRange(pickListRow, 5).setValue(stage2DateFormatted);  // Date Assigned (E)
      } else {
        inventorySheet.getRange(pickListRow, 5).setValue(stage2DateAssigned);   // Use as-is if not a valid date
      }
    }
    inventorySheet.getRange(pickListRow, 6).setValue("Cody's Truck");                           // Location (F)
    inventorySheet.getRange(pickListRow, 10).setValue(stage2PickedFor || '');                   // Picked For (J)

    // Revert Old glove to Stage 1 values (columns N-P)
    if (oldItemRow > 0 && oldGloveStatus) {
      inventorySheet.getRange(oldItemRow, 7).setValue(oldGloveStatus);       // Status (G)
      inventorySheet.getRange(oldItemRow, 8).setValue(oldGloveAssignedTo);   // Assigned To (H)
      if (oldGloveDateAssigned) {
        // Format the date properly before setting
        var oldGloveDate = new Date(oldGloveDateAssigned);
        if (!isNaN(oldGloveDate)) {
          var oldGloveDateFormatted = Utilities.formatDate(oldGloveDate, ss.getSpreadsheetTimeZone(), 'MM/dd/yyyy');
          inventorySheet.getRange(oldItemRow, 5).setValue(oldGloveDateFormatted); // Date Assigned (E)
        } else {
          inventorySheet.getRange(oldItemRow, 5).setValue(oldGloveDateAssigned);  // Use as-is if not valid
        }
      }
      inventorySheet.getRange(oldItemRow, 6).setValue(employeeLocation);     // Location (F)
    }
  }
}

/**
 * Writes dynamic swap table headers for Glove/Sleeve Swaps sheets.
 * Supports any number of swap workflow stages.
 * @param {Sheet} swapSheet - The sheet to write headers to.
 * @param {number} currentRow - The row to start writing headers (1-based).
 * @param {string} itemType - 'Gloves' or 'Sleeves'.
 * @param {string} headerFont - Font color for visible headers.
 * @param {number} numStages - Number of swap workflow stages.
 * @return {number} The next available row after headers.
 */
function writeSwapTableHeadersDynamic(swapSheet, currentRow, itemType, headerFont, numStages) {
  const itemNumHeader = itemType === 'Gloves' ? 'Current Glove #' : 'Current Sleeve #';
  // Only visible headers (A–J)
  const visibleHeaders = [
    'Employee',           // A
    itemNumHeader,        // B
    'Size',               // C
    'Date Assigned',      // D
    'Change Out Date',    // E
    'Days Left',          // F
    'Pick List',          // G
    'Status',             // H
    'Picked',             // I
    'Date Changed'        // J
  ];
  swapSheet.getRange(currentRow, 1, 1, visibleHeaders.length).setValues([visibleHeaders]);
  swapSheet.getRange(currentRow, 1, 1, visibleHeaders.length)
    .setFontWeight('bold').setFontColor(headerFont).setHorizontalAlignment('center').setBackground(HEADER_BG_COLOR);
  return currentRow + 1;
}

/**
 * Removes the old combined History tab if it exists, and ensures separate Gloves History and Sleeves History sheets exist.
 * Call this during Build Sheets and before any history logging.
 */
function ensureSeparateHistorySheets() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  // Remove old History tab if it exists
  var oldHistory = ss.getSheetByName('History');
  if (oldHistory) {
    ss.deleteSheet(oldHistory);
    Logger.log('Deleted old combined History tab');
  }

  // Ensure Gloves History sheet exists with proper headers
  var glovesHistorySheet = ss.getSheetByName(SHEET_GLOVES_HISTORY);
  if (!glovesHistorySheet) {
    glovesHistorySheet = ss.insertSheet(SHEET_GLOVES_HISTORY);
    var headers = ['Date Assigned', 'Item #', 'Size', 'Class', 'Location', 'Assigned To'];
    glovesHistorySheet.getRange(1, 1, 1, 6).setValues([headers]);
    glovesHistorySheet.getRange(1, 1, 1, 6)
      .setFontWeight('bold')
      .setBackground('#1565c0')
      .setFontColor('#ffffff')
      .setHorizontalAlignment('center');
    glovesHistorySheet.setFrozenRows(1);
    glovesHistorySheet.setColumnWidth(1, 100);
    glovesHistorySheet.setColumnWidth(2, 70);
    glovesHistorySheet.setColumnWidth(3, 50);
    glovesHistorySheet.setColumnWidth(4, 50);
    glovesHistorySheet.setColumnWidth(5, 120);
    glovesHistorySheet.setColumnWidth(6, 150);
    Logger.log('Created Gloves History sheet');
  }

  // Ensure Sleeves History sheet exists with proper headers
  var sleevesHistorySheet = ss.getSheetByName(SHEET_SLEEVES_HISTORY);
  if (!sleevesHistorySheet) {
    sleevesHistorySheet = ss.insertSheet(SHEET_SLEEVES_HISTORY);
    var headers = ['Date Assigned', 'Item #', 'Size', 'Class', 'Location', 'Assigned To'];
    sleevesHistorySheet.getRange(1, 1, 1, 6).setValues([headers]);
    sleevesHistorySheet.getRange(1, 1, 1, 6)
      .setFontWeight('bold')
      .setBackground('#2e7d32')
      .setFontColor('#ffffff')
      .setHorizontalAlignment('center');
    sleevesHistorySheet.setFrozenRows(1);
    sleevesHistorySheet.setColumnWidth(1, 100);
    sleevesHistorySheet.setColumnWidth(2, 70);
    sleevesHistorySheet.setColumnWidth(3, 50);
    sleevesHistorySheet.setColumnWidth(4, 50);
    sleevesHistorySheet.setColumnWidth(5, 120);
    sleevesHistorySheet.setColumnWidth(6, 150);
    Logger.log('Created Sleeves History sheet');
  }
}

/**
 * Sets up the History sheet with dual-section headers (Gloves left, Sleeves right)
 */
function setupHistorySheetHeaders(sheet) {
  sheet.clear();

  // Title row
  sheet.getRange(1, 1, 1, 6).merge().setValue('🧤 GLOVES HISTORY')
    .setFontWeight('bold').setFontSize(14).setBackground('#e3f2fd').setHorizontalAlignment('center');
  sheet.getRange(1, 7).setBackground('#333333');
  sheet.getRange(1, 8, 1, 6).merge().setValue('🦺 SLEEVES HISTORY')
    .setFontWeight('bold').setFontSize(14).setBackground('#e8f5e9').setHorizontalAlignment('center');

  // Gloves section headers (A-F)
  var gloveHeaders = ['Date Assigned', 'Item #', 'Size', 'Class', 'Location', 'Assigned To'];
  sheet.getRange(2, 1, 1, 6).setValues([gloveHeaders]);
  sheet.getRange(2, 1, 1, 6)
    .setFontWeight('bold')
    .setBackground('#1565c0')
    .setFontColor('#ffffff')
    .setHorizontalAlignment('center');

  // Spacer column G
  sheet.setColumnWidth(7, 30);
  sheet.getRange(2, 7).setBackground('#333333');

  // Sleeves section headers (H-M)
  var sleeveHeaders = ['Date Assigned', 'Item #', 'Size', 'Class', 'Location', 'Assigned To'];
  sheet.getRange(2, 8, 1, 6).setValues([sleeveHeaders]);
  sheet.getRange(2, 8, 1, 6)
    .setFontWeight('bold')
    .setBackground('#2e7d32')
    .setFontColor('#ffffff')
    .setHorizontalAlignment('center');

  // Freeze header rows
  sheet.setFrozenRows(2);

  // Set column widths
  sheet.setColumnWidth(1, 100); // Date Assigned
  sheet.setColumnWidth(2, 70);  // Item #
  sheet.setColumnWidth(3, 50);  // Size
  sheet.setColumnWidth(4, 50);  // Class
  sheet.setColumnWidth(5, 120);
  sheet.setColumnWidth(6, 120);
  sheet.setColumnWidth(8, 100); // Date Assigned
  sheet.setColumnWidth(9, 70);  // Item #
  sheet.setColumnWidth(10, 50); // Size
  sheet.setColumnWidth(11, 50); // Class
  sheet.setColumnWidth(12, 120);// Location
  sheet.setColumnWidth(13, 120);// Assigned To
}

/**
 * Sets up the Employee History sheet structure with headers.
 * Tracks the lifecycle of employees: Hire Date, location/job number changes, to Last Day.
 * @param {Sheet} sheet - The Employee History sheet to set up
 */
function setupEmployeeHistorySheet(sheet) {
  // Only set up if sheet is empty or has minimal content
  if (sheet.getLastRow() > 2) return;

  sheet.clear();

  // Title row
  sheet.getRange(1, 1, 1, 10).merge()
    .setValue('👤 EMPLOYEE HISTORY')
    .setFontWeight('bold').setFontSize(16).setBackground('#1565c0').setFontColor('white').setHorizontalAlignment('center');
  sheet.setRowHeight(1, 35);

  // Headers
  var headers = [
    'Date',           // A - Date of the change/event
    'Employee Name',  // B - Employee name
    'Event Type',     // C - Current State, Location Change, Job Number Change, Terminated, Rehired
    'Location',       // D - Location at time of event
    'Job Number',     // E - Job number at time of event
    'Hire Date',      // F - Original hire date
    'Last Day',       // G - Employee's last day (for Terminated events)
    'Last Day Reason',// H - Only populated for Terminated events (Quit, Fired, Laid Off)
    'Rehire Date',    // I - Date employee was rehired (triggers re-add to Employees sheet)
    'Notes'           // J - Additional notes
  ];

  sheet.getRange(2, 1, 1, headers.length).setValues([headers])
    .setFontWeight('bold').setBackground('#90caf9').setFontColor('#333').setHorizontalAlignment('center');

  sheet.setFrozenRows(2);

  // Set column widths
  sheet.setColumnWidth(1, 100);  // Date
  sheet.setColumnWidth(2, 150);  // Employee Name
  sheet.setColumnWidth(3, 130);  // Event Type
  sheet.setColumnWidth(4, 130);  // Location
  sheet.setColumnWidth(5, 100);  // Job Number
  sheet.setColumnWidth(6, 100);  // Hire Date
  sheet.setColumnWidth(7, 100);  // Last Day
  sheet.setColumnWidth(8, 120);  // Last Day Reason
  sheet.setColumnWidth(9, 100);  // Rehire Date
  sheet.setColumnWidth(10, 200); // Notes
}

/**
 * Sets up the Item History Lookup sheet
 */
function setupItemHistoryLookupSheet(sheet) {
  sheet.clear();

  // Title
  sheet.getRange(1, 1, 1, 6).merge().setValue('🔍 ITEM HISTORY LOOKUP')
    .setFontWeight('bold').setFontSize(16).setBackground('#b0bec5').setHorizontalAlignment('center');

  // Instructions
  sheet.getRange(2, 1, 1, 6).merge().setValue('Use Glove Manager > History > Item History Lookup to search for an item')
    .setFontStyle('italic').setHorizontalAlignment('center');

  // Headers
  var headers = ['Date Assigned', 'Item #', 'Size', 'Class', 'Location', 'Assigned To'];
  sheet.getRange(4, 1, 1, 6).setValues([headers]);
  sheet.getRange(4, 1, 1, 6)
    .setFontWeight('bold')
    .setBackground('#1565c0')
    .setFontColor('#ffffff')
    .setHorizontalAlignment('center');

  sheet.setFrozenRows(4);

  // Set column widths
  sheet.setColumnWidth(1, 100);
  sheet.setColumnWidth(2, 70);
  sheet.setColumnWidth(3, 50);
  sheet.setColumnWidth(4, 50);
  sheet.setColumnWidth(5, 120);
  sheet.setColumnWidth(6, 150);
}

/**
 * Checks if an entry already exists in history for the given item.
 * Returns true if the last entry for this item has the same Assigned To, Date Assigned, AND Location values.
 * Used to prevent duplicate entries when saving history.
 */
function isDuplicateHistoryEntry(historySheet, itemNum, assignedTo, dateAssigned, location) {
  if (!historySheet || historySheet.getLastRow() < 2) return false;

  var lastRow = historySheet.getLastRow();
  var numDataRows = lastRow - 1;  // Data starts at row 2 (after header)
  if (numDataRows <= 0) return false;

  // Use getDisplayValues for consistent string comparison
  var data = historySheet.getRange(2, 1, numDataRows, 6).getDisplayValues();

  // Find the last entry for this item number
  var lastEntry = null;
  for (var i = data.length - 1; i >= 0; i--) {
    if (String(data[i][1]).trim() === String(itemNum).trim()) {
      lastEntry = data[i];
      break;
    }
  }

  if (!lastEntry) return false;

  // Normalize all values for comparison
  var lastAssignedTo = String(lastEntry[5] || '').toLowerCase().trim();
  var newAssignedTo = String(assignedTo || '').toLowerCase().trim();

  var lastDateAssigned = String(lastEntry[0] || '').trim();
  var newDateAssigned = String(dateAssigned || '').trim();

  var lastLocation = String(lastEntry[4] || '').toLowerCase().trim();
  var newLocation = String(location || '').toLowerCase().trim();

  // Return true only if ALL three fields match (duplicate)
  return lastAssignedTo === newAssignedTo &&
         lastDateAssigned === newDateAssigned &&
         lastLocation === newLocation;
}

/**
 * Saves the current state of Gloves and Sleeves tabs to their respective history sheets.
 * Only logs changes when 'Assigned To', 'Date Assigned', or 'Location' has changed since the last entry for each item.
 * Triggered manually from the menu.
 */
/**
 * Consolidated history save function.
 * @param {boolean} silent - If true, no UI alerts are shown (for automated backups)
 */
function saveHistory(silent) {
  silent = silent || false;

  if (silent) {
    ensureSeparateHistorySheets();
  }

  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var glovesSheet = ss.getSheetByName(SHEET_GLOVES);
    var sleevesSheet = ss.getSheetByName(SHEET_SLEEVES);
    var glovesHistorySheet = silent ?
      ss.getSheetByName(SHEET_GLOVES_HISTORY) :
      (ss.getSheetByName('Gloves History') || ss.insertSheet('Gloves History'));
    var sleevesHistorySheet = silent ?
      ss.getSheetByName(SHEET_SLEEVES_HISTORY) :
      (ss.getSheetByName('Sleeves History') || ss.insertSheet('Sleeves History'));

    function formatItemNum(val) {
      if (val === null || val === undefined || val === '') return '';
      if (val instanceof Date) return String(val);
      return String(val);
    }

    function formatClass(val) {
      if (val === null || val === undefined || val === '') return '';
      if (val instanceof Date) return String(val);
      var strVal = String(val).trim();
      if (strVal === '1/1/1900') return 2;
      if (strVal === '1/2/1900') return 2;
      if (strVal === '1/3/1900') return 3;
      if (strVal === '12/30/1899' || strVal === '12/31/1899') return 0;
      var num = parseInt(strVal, 10);
      if (!isNaN(num) && num >= 0 && num <= 4) return num;
      return strVal;
    }

    var newGloveEntries = 0;
    var newSleeveEntries = 0;

    // Process Gloves
    if (glovesSheet && glovesSheet.getLastRow() > 1 && glovesHistorySheet) {
      var numGloveRows = glovesSheet.getLastRow() - 1;
      var glovesDisplay = glovesSheet.getRange(2, 1, numGloveRows, 11).getDisplayValues();
      var glovesRawValues = glovesSheet.getRange(2, 1, numGloveRows, 11).getValues();

      for (var i = 0; i < glovesDisplay.length; i++) {
        var row = glovesDisplay[i];
        var rawRow = glovesRawValues[i];
        var itemNum = formatItemNum(rawRow[0]);
        var size = row[1];
        var classVal = formatClass(rawRow[2]);
        var dateAssigned = row[4];
        var location = row[5];
        var assignedTo = row[7];

        // Skip rows without item number or date assigned
        if (!itemNum || !dateAssigned) continue;

        // Check if this is a duplicate entry
        if (!isDuplicateHistoryEntry(glovesHistorySheet, itemNum, assignedTo, dateAssigned, location)) {
          glovesHistorySheet.appendRow([
            silent ? formatDateForHistory(dateAssigned) : dateAssigned,
            itemNum,
            size,
            classVal,
            location,
            assignedTo
          ]);
          newGloveEntries++;
        }
      }
    }

    // Process Sleeves
    if (sleevesSheet && sleevesSheet.getLastRow() > 1 && sleevesHistorySheet) {
      var numSleeveRows = sleevesSheet.getLastRow() - 1;
      var sleevesDisplay = sleevesSheet.getRange(2, 1, numSleeveRows, 11).getDisplayValues();
      var sleevesRawValues = sleevesSheet.getRange(2, 1, numSleeveRows, 11).getValues();

      for (var j = 0; j < sleevesDisplay.length; j++) {
        var row = sleevesDisplay[j];
        var rawRow = sleevesRawValues[j];
        var itemNum = formatItemNum(rawRow[0]);
        var size = row[1];
        var classVal = formatClass(rawRow[2]);
        var dateAssigned = row[4];
        var location = row[5];
        var assignedTo = row[7];

        // Skip rows without item number or date assigned
        if (!itemNum || !dateAssigned) continue;

        // Check if this is a duplicate entry
        if (!isDuplicateHistoryEntry(sleevesHistorySheet, itemNum, assignedTo, dateAssigned, location)) {
          sleevesHistorySheet.appendRow([
            silent ? formatDateForHistory(dateAssigned) : dateAssigned,
            itemNum,
            size,
            classVal,
            location,
            assignedTo
          ]);
          newSleeveEntries++;
        }
      }
    }

    // Save Employee History (track location/job changes)
    var newEmployeeEntries = 0;
    try {
      newEmployeeEntries = saveEmployeeHistory();
    } catch (empErr) {
      Logger.log('Error saving employee history: ' + empErr);
    }

    if (silent) {
      PropertiesService.getUserProperties().setProperty('historySavedThisSession', 'true');
      logEvent('Silent history backup completed. Gloves: ' + newGloveEntries + ', Sleeves: ' + newSleeveEntries + ', Employees: ' + newEmployeeEntries);
    } else {
      Logger.log('History saved - Gloves: ' + newGloveEntries + ', Sleeves: ' + newSleeveEntries + ', Employees: ' + newEmployeeEntries);

      // Show confirmation to user
      var message = '✅ History Saved Successfully!\n\n';
      message += '🧤 Gloves: ' + newGloveEntries + ' new entries\n';
      message += '🦺 Sleeves: ' + newSleeveEntries + ' new entries\n';
      message += '👤 Employees: ' + newEmployeeEntries + ' new entries\n\n';
      if (newGloveEntries === 0 && newSleeveEntries === 0 && newEmployeeEntries === 0) {
        message += 'No changes detected since last save.';
      }
      SpreadsheetApp.getUi().alert(message);
    }

  } catch (e) {
    if (silent) {
      logEvent('Error in saveHistory: ' + e, 'ERROR');
    } else {
      Logger.log('[ERROR] ' + e);
      SpreadsheetApp.getUi().alert('❌ Error saving history: ' + e);
      throw new Error('Error saving history: ' + e);
    }
  }
}

/**
 * Public wrapper for interactive history save (called from menu)
 */
function saveCurrentStateToHistory() {
  saveHistory(false);
}

/**
 * Public wrapper for silent history save (called from triggers)
 */
function saveCurrentStateToHistorySilent() {
  saveHistory(true);
}

/**
 * Helper to format date for history display
 */
function formatDateForHistory(dateVal) {
  if (!dateVal) return '';
  var d = parseDateFlexible(dateVal);
  if (!d) return String(dateVal);
  return Utilities.formatDate(d, SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone(), 'MM/dd/yyyy');
}

/**
 * Flexible date parser that handles various date formats
 */
function parseDateFlexible(dateStr) {
  if (!dateStr) return null;
  // If already a valid Date object, return it
  if (dateStr instanceof Date && !isNaN(dateStr)) return dateStr;
  // Convert to string if needed
  if (typeof dateStr !== 'string') dateStr = String(dateStr);
  // Try standard Date parsing first
  var d = new Date(dateStr);
  if (!isNaN(d)) return d;
  // Try MM/DD/YYYY or MM-DD-YYYY format
  var mdyPattern = new RegExp('^(\\d{1,2})[\\/\\-](\\d{1,2})[\\/\\-](\\d{4})$');
  var mdy = dateStr.match(mdyPattern);
  if (mdy) {
    var dt = new Date(parseInt(mdy[3], 10), parseInt(mdy[1], 10) - 1, parseInt(mdy[2], 10));
    if (!isNaN(dt)) return dt;
  }
  // Try YYYY/MM/DD or YYYY-MM-DD format
  var ymdPattern = new RegExp('^(\\d{4})[\\/\\-](\\d{1,2})[\\/\\-](\\d{1,2})$');
  var ymd = dateStr.match(ymdPattern);
  if (ymd) {
    var dt2 = new Date(parseInt(ymd[1], 10), parseInt(ymd[2], 10) - 1, parseInt(ymd[3], 10));
    if (!isNaN(dt2)) return dt2;
  }
  return null;
}

/**
 * Shows dialog to import legacy history data for a single item.
 */
function showImportLegacyHistoryDialog() {
  ensureSeparateHistorySheets(); // Always ensure correct sheets before importing
  var html = HtmlService.createHtmlOutput(
    '<style>' +
    '  body { font-family: Arial, sans-serif; padding: 15px; }' +
    '  label { display: block; margin-top: 10px; font-weight: bold; }' +
    '  select, input, textarea { width: 100%; padding: 8px; margin-top: 5px; box-sizing: border-box; }' +
    '  textarea { height: 200px; font-family: monospace; }' +
    '  button { margin-top: 15px; padding: 10px 20px; background: #1565c0; color: white; border: none; cursor: pointer; }' +
    '  button:hover { background: #0d47a1; }' +
    '  .info { font-size: 12px; color: #666; margin-top: 5px; }' +
    '</style>' +
    '<label>Item Type:</label>' +
    '<select id="itemType">' +
    '  <option value="glove">Glove</option>' +
    '  <option value="sleeve">Sleeve</option>' +
    '</select>' +
    '<label>Item Number:</label>' +
    '<input type="text" id="itemNum" placeholder="e.g., 667">' +
    '<label>Size:</label>' +
    '<input type="text" id="itemSize" placeholder="e.g., 10 or 18in">' +
    '<label>Class:</label>' +
    '<input type="text" id="itemClass" placeholder="e.g., 0, 2, or 3">' +
    '<label>Legacy History Data:</label>' +
    '<textarea id="legacyData" placeholder="Paste legacy data here, one entry per line:\n06/06/2023 - C. Lovdahl\n02/22/2023 - L. Gill\n01/08/2024 - In Testing\n01/24/2024 - On Shelf"></textarea>' +
    '<div class="info">Format: MM/DD/YYYY - Name or Status (one per line)</div>' +
    '<button onclick="importData()">Import Legacy History</button>' +
    '<script>' +
    '  function importData() {' +
    '    var itemType = document.getElementById("itemType").value;' +
    '    var itemNum = document.getElementById("itemNum").value;' +
    '    var itemSize = document.getElementById("itemSize").value;' +
    '    var itemClass = document.getElementById("itemClass").value;' +
    '    var legacyData = document.getElementById("legacyData").value;' +
    '    if (!itemNum || !legacyData) {' +
    '      alert("Please enter Item Number and Legacy Data");' +
    '      return;' +
    '    }' +
    '    google.script.run' +
    '      .withSuccessHandler(function(result) {' +
    '        alert(result);' +
    '        google.script.host.close();' +
    '      })' +
    '      .withFailureHandler(function(error) {' +
    '        alert("Error: " + error);' +
    '      })' +
    '      .importLegacyHistoryData(itemType, itemNum, itemSize, itemClass, legacyData);' +
    '  }' +
    '</script>'
  )
  .setWidth(450)
  .setHeight(550);

  SpreadsheetApp.getUi().showModalDialog(html, 'Import Legacy History');
}

/**
 * Parses and imports legacy history data for a single item.
 */
function importLegacyHistoryData(itemType, itemNum, itemSize, itemClass, legacyData) {
  try {
    ensureSeparateHistorySheets();
    var ss = SpreadsheetApp.getActiveSpreadsheet();

    // Use the correct history sheet based on item type
    var historySheetName = (itemType === 'sleeve') ? SHEET_SLEEVES_HISTORY : SHEET_GLOVES_HISTORY;
    var historySheet = ss.getSheetByName(historySheetName);

    if (!historySheet) {
      return 'Error: ' + historySheetName + ' sheet not found. Please run Build Sheets first.';
    }

    // Parse legacy data
    var lines = legacyData.split('\n');
    var entries = [];

    lines.forEach(function(line) {
      line = line.trim();
      if (!line) return;

      // Parse format: MM/DD/YYYY - Name/Status (handle both - and –)
      var datePattern = new RegExp('^(\\d{1,2}\\/\\d{1,2}\\/\\d{4})\\s*[-–]\\s*(.+)$');
      var match = line.match(datePattern);
      if (match) {
        entries.push({
          dateAssigned: match[1],
          assignedTo: match[2].trim()
        });
      }
    });

    if (entries.length === 0) {
      return 'No valid entries found. Please check the format.';
    }

    // Sort by date (oldest first for lifecycle view)
    entries.sort(function(a, b) {
      return new Date(a.dateAssigned) - new Date(b.dateAssigned);
    });

    // Append entries to the appropriate history sheet
    entries.forEach(function(entry) {
      historySheet.appendRow([
        entry.dateAssigned,
        itemNum,
        itemSize || '',
        itemClass || '',
        '',  // Location unknown from legacy
        entry.assignedTo
      ]);
    });

    logEvent('Imported ' + entries.length + ' legacy history entries for ' + itemType + ' #' + itemNum);
    return '✅ Successfully imported ' + entries.length + ' entries for ' + itemType.charAt(0).toUpperCase() + itemType.slice(1) + ' #' + itemNum;

  } catch (e) {
    logEvent('Error in importLegacyHistoryData: ' + e, 'ERROR');
    return 'Error: ' + e;
  }
}

/**
 * Shows dialog to look up history for a specific item.
 */
function showItemHistoryLookup() {
  ensureSeparateHistorySheets(); // Always ensure correct sheets before lookup
  var html = HtmlService.createHtmlOutput(
    '<style>' +
    '  body { font-family: Arial, sans-serif; padding: 15px; }' +
    '  label { display: block; margin-top: 10px; font-weight: bold; }' +
    '  select, input { width: 100%; padding: 8px; margin-top: 5px; box-sizing: border-box; }' +
    '  button { margin-top: 15px; padding: 10px 20px; background: #1565c0; color: white; border: none; cursor: pointer; }' +
    '  button:hover { background: #0d47a1; }' +
    '</style>' +
    '<label>Item Type:</label>' +
    '<select id="itemType">' +
    '  <option value="glove">Glove</option>' +
    '  <option value="sleeve">Sleeve</option>' +
    '</select>' +
    '<label>Item Number:</label>' +
    '<input type="text" id="itemNum" placeholder="e.g., 667">' +
    '<button onclick="lookupItem()">Look Up Item History</button>' +
    '<script>' +
    '  function lookupItem() {' +
    '    var itemType = document.getElementById("itemType").value;' +
    '    var itemNum = document.getElementById("itemNum").value;' +
    '    if (!itemNum) {' +
    '      alert("Please enter an Item Number");' +
    '      return;' +
    '    }' +
    '    google.script.run' +
    '      .withSuccessHandler(function(result) {' +
    '        alert(result);' +
    '        google.script.host.close();' +
    '      })' +
    '      .withFailureHandler(function(error) {' +
    '        alert("Error: " + error);' +
    '      })' +
    '      .generateItemHistoryLookup(itemType, itemNum);' +
    '  }' +
    '</script>'
  )
  .setWidth(350)
  .setHeight(250);

  SpreadsheetApp.getUi().showModalDialog(html, 'Item History Lookup');
}

/**
 * Generates the Item History Lookup sheet for a specific item.
 */
function generateItemHistoryLookup(itemType, itemNum) {
  try {
    ensureSeparateHistorySheets();
    var ss = SpreadsheetApp.getActiveSpreadsheet();

    // Use the correct history sheet based on item type
    var historySheetName = (itemType === 'sleeve') ? SHEET_SLEEVES_HISTORY : SHEET_GLOVES_HISTORY;
    var historySheet = ss.getSheetByName(historySheetName);
    var lookupSheet = ss.getSheetByName(SHEET_ITEM_HISTORY_LOOKUP);

    if (!lookupSheet) {
      lookupSheet = ss.insertSheet(SHEET_ITEM_HISTORY_LOOKUP);
    }

    // Clear and setup
    lookupSheet.clear();

    // Title with item info
    var typeLabel = itemType === 'sleeve' ? '🦺 Sleeve' : '🧤 Glove';
    lookupSheet.getRange(1, 1, 1, 6).merge().setValue(typeLabel + ' #' + itemNum + ' - Complete History')
      .setFontWeight('bold').setFontSize(16).setBackground('#b0bec5').setHorizontalAlignment('center');

    // Headers
    var headers = ['Date Assigned', 'Item #', 'Size', 'Class', 'Location', 'Assigned To'];
    lookupSheet.getRange(3, 1, 1, 6).setValues([headers]);
    lookupSheet.getRange(3, 1, 1, 6)
      .setFontWeight('bold')
      .setBackground(itemType === 'sleeve' ? '#2e7d32' : '#1565c0')
      .setFontColor('#ffffff')
      .setHorizontalAlignment('center');

    // Find entries from the appropriate History sheet
    var entries = [];
    if (historySheet && historySheet.getLastRow() > 1) {
      var data = historySheet.getRange(2, 1, historySheet.getLastRow() - 1, 6).getValues();

      data.forEach(function(row) {
        if (String(row[1]).trim() === String(itemNum).trim()) {
          entries.push(row);
        }
      });
    }

    if (entries.length === 0) {
      lookupSheet.getRange(5, 1, 1, 6).merge().setValue('No history found for ' + typeLabel + ' #' + itemNum)
        .setFontStyle('italic').setHorizontalAlignment('center');
      SpreadsheetApp.setActiveSheet(lookupSheet);
      return 'No history found for ' + typeLabel + ' #' + itemNum;
    }

    // Sort by date (oldest first for lifecycle view)
    entries.sort(function(a, b) {
      return new Date(a[0]) - new Date(b[0]);
    });

    // Write entries with alternating colors
    var color1 = itemType === 'sleeve' ? HISTORY_COLOR_SLEEVE_1 : HISTORY_COLOR_GLOVE_1;
    var color2 = itemType === 'sleeve' ? HISTORY_COLOR_SLEEVE_2 : HISTORY_COLOR_GLOVE_2;

    entries.forEach(function(row, index) {
      var rowNum = 4 + index;
      lookupSheet.getRange(rowNum, 1, 1, 6).setValues([row]);
      lookupSheet.getRange(rowNum, 1, 1, 6)
        .setBackground(index % 2 === 0 ? color1 : color2)
        .setHorizontalAlignment('center');
    });

    // Add summary
    var summaryRow = 4 + entries.length + 1;
    lookupSheet.getRange(summaryRow, 1, 1, 6).merge()
      .setValue('📊 Total History Entries: ' + entries.length + ' | First: ' + entries[0][0] + ' | Latest: ' + entries[entries.length - 1][0])
      .setFontWeight('bold').setBackground('#eceff1').setHorizontalAlignment('center');

    // Set column widths
    lookupSheet.setColumnWidth(1, 100);
    lookupSheet.setColumnWidth(2, 70);
    lookupSheet.setColumnWidth(3, 50);
    lookupSheet.setColumnWidth(4, 50);
    lookupSheet.setColumnWidth(5, 120);
    lookupSheet.setColumnWidth(6, 150);

    lookupSheet.setFrozenRows(3);
    SpreadsheetApp.setActiveSheet(lookupSheet);

    logEvent('Generated history lookup for ' + itemType + ' #' + itemNum + ' with ' + entries.length + ' entries');
    return '✅ Found ' + entries.length + ' history entries for ' + typeLabel + ' #' + itemNum;

  } catch (e) {
    logEvent('Error in generateItemHistoryLookup: ' + e, 'ERROR');
    return 'Error: ' + e;
  }
}

/**
 * Views the Gloves History sheet (default).
 * Use the tabs at bottom to switch between Gloves History and Sleeves History.
 */
function viewFullHistory() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var glovesHistorySheet = ss.getSheetByName(SHEET_GLOVES_HISTORY);
  if (glovesHistorySheet) {
    SpreadsheetApp.setActiveSheet(glovesHistorySheet);
    SpreadsheetApp.getUi().alert('📋 History Sheets\n\nGloves History and Sleeves History are now separate sheets.\n\nUse the tabs at the bottom of the spreadsheet to switch between them.');
  } else {
    SpreadsheetApp.getUi().alert('History sheets not found. Run Build Sheets first.');
  }
}

/**
 * Close and Save History - saves current state and prompts user to close.
 */
function closeAndSaveHistory() {
  ensureSeparateHistorySheets(); // Always ensure correct sheets before saving
  saveCurrentStateToHistory();
  SpreadsheetApp.getUi().alert('✅ History has been saved!\n\nYou can now safely close this spreadsheet.');
}

/**
 * Creates a daily time-driven trigger to auto-save history.
 * Run this once from the script editor to set up the daily backup.
 */
function createDailyHistoryBackupTrigger() {
  // Remove existing daily triggers
  var triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(function(trigger) {
    if (trigger.getHandlerFunction() === 'dailyHistoryBackup') {
      ScriptApp.deleteTrigger(trigger);
    }
  });

  // Create new daily trigger at 11 PM
  ScriptApp.newTrigger('dailyHistoryBackup')
    .timeBased()
    .everyDays(1)
    .atHour(23)
    .create();

  Logger.log('Daily history backup trigger created for 11 PM');
  SpreadsheetApp.getUi().alert('✅ Daily history backup trigger created!\n\nHistory will auto-save every day at 11 PM.');
}

/**
 * Daily backup function called by time-driven trigger.
 */
function dailyHistoryBackup() {
  ensureSeparateHistorySheets(); // Always ensure correct sheets before backup
  try {
    logEvent('Running daily history backup...');
    saveCurrentStateToHistorySilent();
    logEvent('Daily history backup completed successfully.');
  } catch (e) {
    logEvent('Error in dailyHistoryBackup: ' + e, 'ERROR');
  }
}

/**
 * Idempotently creates all required sheets/tabs and headers for the Glove Manager system.
 */
function buildSheets() {
  ensureSeparateHistorySheets(); // Remove old History tab and ensure separate history sheets
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheetDefs = [
    { name: SHEET_EMPLOYEES, headers: ['Name', 'Class', 'Location', 'Job Number', 'Phone Number', 'Notification Emails', 'MP Email', 'Email Address', 'Glove Size', 'Sleeve Size', 'Hire Date', 'Last Day', 'Last Day Reason'] },
    { name: 'Employee History', headers: null, customSetup: true },
    { name: SHEET_GLOVES, headers: ['Glove', 'Size', 'Class', 'Test Date', 'Date Assigned', 'Location', 'Status', 'Assigned To', 'Change Out Date', 'Picked For', 'Notes'] },
    { name: SHEET_SLEEVES, headers: ['Sleeve', 'Size', 'Class', 'Test Date', 'Date Assigned', 'Location', 'Status', 'Assigned To', 'Change Out Date', 'Picked For', 'Notes'] },
    { name: SHEET_GLOVE_SWAPS, headers: ['Employee', 'Item Number', 'Size', 'Date Assigned', 'Change Out Date', 'Days Left', 'Pick List', 'Status', 'Picked', 'Date Changed'] },
    { name: SHEET_SLEEVE_SWAPS, headers: ['Employee', 'Item Number', 'Size', 'Date Assigned', 'Change Out Date', 'Days Left', 'Pick List', 'Status', 'Picked', 'Date Changed'] },
    { name: SHEET_PURCHASE_NEEDS, headers: ['Item Type', 'Size', 'Class', 'Quantity Needed', 'Reason', 'Status/Notes'] },
    { name: SHEET_INVENTORY_REPORTS, headers: null, customSetup: true },
    { name: SHEET_RECLAIMS, headers: null, customSetup: true },
    { name: SHEET_ITEM_HISTORY_LOOKUP, headers: null, customSetup: true }
  ];
  sheetDefs.forEach(function(def) {
    var sheet = ss.getSheetByName(def.name);
    if (!sheet) {
      sheet = ss.insertSheet(def.name);
      if (def.headers) {
        sheet.getRange(1, 1, 1, def.headers.length).setValues([def.headers]);
      }
    } else if ([SHEET_EMPLOYEES, SHEET_GLOVES, SHEET_SLEEVES].includes(def.name)) {
      // For Employees, ensure all headers exist (add missing ones without clearing data)
      if (def.name === SHEET_EMPLOYEES && sheet.getLastRow() > 0 && def.headers) {
        var existingHeaders = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
        var existingHeadersLower = existingHeaders.map(function(h) { return String(h).toLowerCase().trim(); });

        // Check each required header and add if missing
        for (var hi = 0; hi < def.headers.length; hi++) {
          var reqHeader = def.headers[hi];
          var reqHeaderLower = reqHeader.toLowerCase().trim();
          if (existingHeadersLower.indexOf(reqHeaderLower) === -1) {
            // Add missing header at the end
            var newCol = sheet.getLastColumn() + 1;
            sheet.getRange(1, newCol).setValue(reqHeader)
              .setFontWeight('bold').setBackground('#1565c0').setFontColor('#ffffff').setHorizontalAlignment('center');
            Logger.log('Added missing header "' + reqHeader + '" to ' + def.name + ' at column ' + newCol);
          }
        }
      } else if (sheet.getLastRow() === 0 && def.headers) {
        // Only set headers if sheet is empty (no data)
        sheet.getRange(1, 1, 1, def.headers.length).setValues([def.headers]);
      }
      // Do not clear or overwrite any data
    } else if (def.customSetup) {
      // Custom setup sheets - don't clear, handled separately
    } else {
      sheet.clear();
      if (def.headers) {
        sheet.getRange(1, 1, 1, def.headers.length).setValues([def.headers]);
      }
    }
    // Formatting for Employees, Gloves, Sleeves
    if ([SHEET_EMPLOYEES, SHEET_GLOVES, SHEET_SLEEVES].includes(def.name)) {
      sheet.setFrozenRows(1);
      sheet.setFrozenColumns(1);
      var headerRange = sheet.getRange(1, 1, 1, def.headers.length);
      headerRange.setBackground('#1565c0');
      headerRange.setFontColor('#ffffff');
      headerRange.setFontWeight('bold');
      var lastRow = sheet.getLastRow();
      var lastCol = def.headers.length;
      if (lastRow > 1) {
        sheet.getRange(2, 1, lastRow - 1, lastCol).setHorizontalAlignment('center');
      }
      headerRange.setHorizontalAlignment('center');

      SpreadsheetApp.flush();

      for (var c = 1; c <= lastCol; c++) {
        sheet.autoResizeColumn(c);
      }

      if (def.name === SHEET_EMPLOYEES) {
        sheet.setColumnWidth(1, Math.max(sheet.getColumnWidth(1), 150));
        sheet.setColumnWidth(3, Math.max(sheet.getColumnWidth(3), 150));
        sheet.setColumnWidth(4, Math.max(sheet.getColumnWidth(4), 100));
        sheet.setColumnWidth(6, Math.max(sheet.getColumnWidth(6), 150));
        sheet.setColumnWidth(8, Math.max(sheet.getColumnWidth(8), 180));
      }

      if (def.name === SHEET_GLOVES || def.name === SHEET_SLEEVES) {
        var totalRows = Math.max(lastRow, 1);
        sheet.getRange(1, 10, totalRows, 1).setWrap(true);
        sheet.setColumnWidth(10, 180);
        sheet.getRange(1, 11, totalRows, 1).setWrap(true);
        sheet.setColumnWidth(11, 200);
      }
    }
    // Formatting for Glove Swaps, Sleeve Swaps
    if ([SHEET_GLOVE_SWAPS, SHEET_SLEEVE_SWAPS].includes(def.name)) {
      var swapSheet = sheet;
      var swapHeaders = def.headers.length;
      swapSheet.getRange(1, 1, 1, swapHeaders).setHorizontalAlignment('center');
      var swapLastRow = swapSheet.getLastRow();
      if (swapLastRow > 1) {
        swapSheet.getRange(2, 1, swapLastRow - 1, swapHeaders).setHorizontalAlignment('center');
      }
    }
  });

  // Ensure Picked For column exists on Gloves and Sleeves tabs
  ensurePickedForColumn();

  // Custom setup for Item History Lookup sheet
  var lookupSheet = ss.getSheetByName(SHEET_ITEM_HISTORY_LOOKUP);
  if (lookupSheet && lookupSheet.getLastRow() < 3) {
    setupItemHistoryLookupSheet(lookupSheet);
  }

  // Custom setup for Reclaims sheet - set up all required tables
  var reclaimsSheet = ss.getSheetByName(SHEET_RECLAIMS);
  if (!reclaimsSheet) {
    reclaimsSheet = ss.insertSheet(SHEET_RECLAIMS);
  }
  setupReclaimsSheet(reclaimsSheet);

  // Custom setup for Employee History sheet
  var empHistorySheet = ss.getSheetByName('Employee History');
  if (!empHistorySheet) {
    empHistorySheet = ss.insertSheet('Employee History');
  }
  setupEmployeeHistorySheet(empHistorySheet);

  // Add dropdown validation for Last Day Reason column on Employees sheet
  var employeesSheet = ss.getSheetByName(SHEET_EMPLOYEES);
  if (employeesSheet) {
    var empHeaders = employeesSheet.getRange(1, 1, 1, employeesSheet.getLastColumn()).getValues()[0];
    var lastDayReasonColIdx = -1;
    for (var h = 0; h < empHeaders.length; h++) {
      if (String(empHeaders[h]).toLowerCase().trim() === 'last day reason') {
        lastDayReasonColIdx = h + 1;  // 1-based
        break;
      }
    }
    if (lastDayReasonColIdx !== -1) {
      // Set dropdown for all data rows in Last Day Reason column
      var lastRow = Math.max(employeesSheet.getLastRow(), 100);  // At least 100 rows
      var reasonRange = employeesSheet.getRange(2, lastDayReasonColIdx, lastRow - 1, 1);
      var reasonRule = SpreadsheetApp.newDataValidation()
        .requireValueInList(['Quit', 'Fired', 'Laid Off'], true)
        .setAllowInvalid(false)
        .build();
      reasonRange.setDataValidation(reasonRule);
    }
  }

  logEvent('Sheets built or reset.');

  // Fix all Change Out Dates to ensure they're correct
  fixChangeOutDatesSilent();

  SpreadsheetApp.getUi().alert('✅ Build Sheets completed!\n\nAll required sheets have been created or verified.');
}

/**
 * Silently fixes all Change Out Dates without showing any UI prompts.
 * Called automatically before generating reports and after building sheets.
 */
function fixChangeOutDatesSilent() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var tz = ss.getSpreadsheetTimeZone();
  var sheetsToFix = ['Gloves', 'Sleeves'];
  var totalFixed = 0;

  sheetsToFix.forEach(function(sheetName) {
    var sheet = ss.getSheetByName(sheetName);
    if (!sheet || sheet.getLastRow() < 2) return;

    var isSleeve = (sheetName === 'Sleeves');
    var data = sheet.getDataRange().getValues();

    // Column indices (0-based for array): E=4 (Date Assigned), F=5 (Location), H=7 (Assigned To), I=8 (Change Out Date)
    for (var i = 1; i < data.length; i++) {
      var dateAssigned = data[i][4];  // Column E
      var location = data[i][5];       // Column F
      var assignedTo = data[i][7];     // Column H
      var currentChangeOut = data[i][8]; // Column I

      if (!dateAssigned) continue;

      var correctChangeOut = calculateChangeOutDate(dateAssigned, location, assignedTo, isSleeve);
      if (!correctChangeOut) continue;

      // Always update to ensure correct value - simpler and more reliable
      var cell = sheet.getRange(i + 1, 9);  // Column I (1-based row)
      if (correctChangeOut === 'N/A') {
        if (currentChangeOut !== 'N/A') {
          cell.setNumberFormat('@');
          cell.setValue('N/A');
          totalFixed++;
        }
      } else {
        // Format both dates for comparison
        var correctStr = Utilities.formatDate(correctChangeOut, tz, 'MM/dd/yyyy');
        var currentStr = '';

        if (currentChangeOut instanceof Date) {
          currentStr = Utilities.formatDate(currentChangeOut, tz, 'MM/dd/yyyy');
        } else if (typeof currentChangeOut === 'number' && currentChangeOut > 0) {
          // Serial date number
          var tempDate = new Date((currentChangeOut - 25569) * 86400 * 1000);
          currentStr = Utilities.formatDate(tempDate, tz, 'MM/dd/yyyy');
        }

        if (correctStr !== currentStr) {
          cell.setNumberFormat('MM/dd/yyyy');
          cell.setValue(correctChangeOut);
          totalFixed++;
        }
      }
    }
  });

  if (totalFixed > 0) {
    Logger.log('fixChangeOutDatesSilent: Fixed ' + totalFixed + ' Change Out Dates');
  }
}

/**
 * Calls all report-generation/update functions to refresh all reports/tabs.
 */
function generateAllReports() {
  try {
    logEvent('Generating all reports...');

    // First, ensure all Change Out Dates are correct (in case triggers didn't fire)
    fixChangeOutDatesSilent();

    generateGloveSwaps();
    generateSleeveSwaps();
    updatePurchaseNeeds();
    updateInventoryReports();
    updateReclaimsSheet();
    logEvent('All reports generated.');
    SpreadsheetApp.getUi().alert('✅ All reports generated successfully!');
  } catch (e) {
    logEvent('Error in generateAllReports: ' + e, 'ERROR');
    SpreadsheetApp.getUi().alert('❌ Error generating reports: ' + e);
  }
}

/**
 * Preserves manual Pick List edits before regenerating swap sheets.
 * Scans for cells with light blue background (#e3f2fd) in Pick List column.
 * Returns a map of employee name (lowercase) to pick list data.
 * @param {Sheet} swapSheet - The Glove/Sleeve Swaps sheet
 * @return {Object} Map of employeeName -> { pickListNum, status }
 */
function preserveManualPickLists(swapSheet) {
  var manualPicks = {};

  if (!swapSheet || swapSheet.getLastRow() < 2) {
    return manualPicks;
  }

  try {
    var lastRow = swapSheet.getLastRow();
    var lastCol = Math.min(swapSheet.getLastColumn(), 23);  // Only scan up to column W

    // Get all data and backgrounds for the entire sheet
    var dataRange = swapSheet.getRange(1, 1, lastRow, lastCol);
    var values = dataRange.getValues();
    var backgrounds = dataRange.getBackgrounds();

    // Light blue color for manual edits
    var manualEditColor = '#e3f2fd';

    for (var i = 0; i < values.length; i++) {
      var row = values[i];
      var bgRow = backgrounds[i];

      // Column A (index 0) = Employee name
      // Column G (index 6) = Pick List Item #
      // Column H (index 7) = Status
      var employeeName = (row[0] || '').toString().trim();
      var pickListNum = (row[6] || '').toString().trim();
      var status = (row[7] || '').toString().trim();
      var pickListBg = (bgRow[6] || '').toString().toLowerCase();

      // Skip header rows and empty employees
      if (!employeeName || employeeName === 'Employee' ||
          employeeName.indexOf('Class') !== -1 ||
          employeeName.indexOf('STAGE') !== -1 ||
          employeeName.indexOf('📍') !== -1) {
        continue;
      }

      // Check if Pick List cell has light blue background (manual edit indicator)
      if (pickListBg === manualEditColor && pickListNum && pickListNum !== '—') {
        var empKey = employeeName.toLowerCase();
        manualPicks[empKey] = {
          pickListNum: pickListNum,
          status: status
        };
        Logger.log('Preserved manual pick for ' + employeeName + ': ' + pickListNum);
      }
    }
  } catch (e) {
    Logger.log('Error in preserveManualPickLists: ' + e);
  }

  return manualPicks;
}

/**
 * Restores manual Pick List edits after regenerating swap sheets.
 * Searches for employee names in the preserved map and restores their manual picks.
 * @param {Sheet} swapSheet - The regenerated Glove/Sleeve Swaps sheet
 * @param {Object} manualPicks - Map from preserveManualPickLists
 * @param {number} startRow - First data row to search (1-based, after headers)
 * @param {number} endRow - Last row to search (1-based)
 */
function restoreManualPickLists(swapSheet, manualPicks, startRow, endRow) {
  if (!swapSheet || !manualPicks || Object.keys(manualPicks).length === 0) {
    return;
  }

  try {
    var manualEditColor = '#e3f2fd';
    var numRows = endRow - startRow + 1;

    if (numRows <= 0) return;

    // Get data for the range we're checking
    var dataRange = swapSheet.getRange(startRow, 1, numRows, 8);  // A-H columns
    var values = dataRange.getValues();

    var restoredCount = 0;

    for (var i = 0; i < values.length; i++) {
      var row = values[i];
      var employeeName = (row[0] || '').toString().trim();

      // Skip header rows and empty
      if (!employeeName || employeeName === 'Employee' ||
          employeeName.indexOf('Class') !== -1 ||
          employeeName.indexOf('STAGE') !== -1 ||
          employeeName.indexOf('📍') !== -1) {
        continue;
      }

      var empKey = employeeName.toLowerCase();

      // Check if this employee has a preserved manual pick
      if (manualPicks[empKey]) {
        var actualRow = startRow + i;
        var preserved = manualPicks[empKey];

        // Restore the Pick List item number and status
        swapSheet.getRange(actualRow, 7).setValue(preserved.pickListNum);  // Column G
        swapSheet.getRange(actualRow, 8).setValue(preserved.status);       // Column H

        // Reapply the light blue background
        swapSheet.getRange(actualRow, 7).setBackground(manualEditColor);

        Logger.log('Restored manual pick for ' + employeeName + ': ' + preserved.pickListNum);
        restoredCount++;
      }
    }

    if (restoredCount > 0) {
      Logger.log('Restored ' + restoredCount + ' manual pick list entries');
    }

  } catch (e) {
    Logger.log('Error in restoreManualPickLists: ' + e);
  }
}

/**
 * Consolidated swap generation function for both Gloves and Sleeves.
 * @param {string} itemType - Either 'Gloves' or 'Sleeves'
 */
function generateSwaps(itemType) {
  try {
    var isGloves = (itemType === 'Gloves');
    logEvent('Generating ' + itemType + ' Swaps report...');
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var swapSheetName = isGloves ? SHEET_GLOVE_SWAPS : SHEET_SLEEVE_SWAPS;
    var inventorySheetName = isGloves ? SHEET_GLOVES : SHEET_SLEEVES;
    var swapSheet = ss.getSheetByName(swapSheetName);
    var inventorySheet = ss.getSheetByName(inventorySheetName);
    var employeesSheet = ss.getSheetByName(SHEET_EMPLOYEES);

    if (!swapSheet || !inventorySheet || !employeesSheet) {
      logEvent('Required sheets not found for ' + itemType + ' Swaps');
      return;
    }

    // PRESERVE MANUAL PICK LIST EDITS BEFORE CLEARING
    var manualPicks = preserveManualPickLists(swapSheet);
    logEvent('Preserved ' + Object.keys(manualPicks).length + ' manual pick list entries');

    swapSheet.clear();

    // Clear the schema cache for this sheet since we're rebuilding it with new headers
    if (SCHEMA && SCHEMA[swapSheetName]) {
      delete SCHEMA[swapSheetName];
    }

    var currentRow = 1;
    var classes = isGloves ? [0, 2, 3] : [2, 3];  // Sleeves don't have Class 0
    var classNames = {0: 'Class 0', 2: 'Class 2', 3: 'Class 3'};
    var today = new Date();
    var ignoreNames = [
      'on shelf', 'in testing', 'packed for delivery', 'packed for testing',
      'failed rubber', 'lost', 'not repairable', '', 'n/a', 'ready for test', 'ready for delivery', 'assigned', 'destroyed'
    ];

    var employees = employeesSheet.getDataRange().getValues();
    var inventory = inventorySheet.getDataRange().getValues();
    if (employees.length < 2 || inventory.length < 2) {
      Logger.log('No data in Employees or ' + itemType);
      return;
    }

    var empData = employees.slice(1);
    var inventoryData = inventory.slice(1);

    // Find Location column in Employees sheet dynamically
    var empHeaders = employees[0];
    var locationColIdx = 2; // Default fallback (column C)
    for (var h = 0; h < empHeaders.length; h++) {
      if (String(empHeaders[h]).trim().toLowerCase() === 'location') {
        locationColIdx = h;
        break;
      }
    }

    // Build employee map (includes location)
    var empMap = {};
    var empLocationMap = {};  // Separate map for locations
    empData.forEach(function(row) {
      var name = (row[0] || '').toString().trim().toLowerCase();
      if (name && ignoreNames.indexOf(name) === -1) {
        empMap[name] = row;
        empLocationMap[name] = (row[locationColIdx] || 'Unknown').toString().trim();
      }
    });

    var itemLabel = isGloves ? 'Glove' : 'Sleeve';
    var sizeColIndex = isGloves ? 8 : 9; // Glove Size in col I (8), Sleeve Size in col J (9)

    // Process each class
    classes.forEach(function(itemClass) {
      // Class title row - merge across all columns including hidden (A-W = 23 columns)
      swapSheet.getRange(currentRow, 1, 1, 23).merge().setValue(classNames[itemClass] + ' ' + itemLabel + ' Swaps');
      swapSheet.getRange(currentRow, 1, 1, 23)
        .setFontWeight('bold').setFontSize(12).setBackground('#e3eafc').setFontColor('#0d47a1').setHorizontalAlignment('center');
      currentRow++;

      // Stage group headers row (light grey background)
      swapSheet.getRange(currentRow, 11, 1, 3).merge().setValue('STAGE 1').setBackground('#e0e0e0').setFontWeight('bold').setHorizontalAlignment('center');
      swapSheet.getRange(currentRow, 14, 1, 3).merge().setValue('STAGE 1').setBackground('#e0e0e0').setFontWeight('bold').setHorizontalAlignment('center');
      swapSheet.getRange(currentRow, 17, 1, 4).merge().setValue('STAGE 2').setBackground('#e0e0e0').setFontWeight('bold').setHorizontalAlignment('center');
      swapSheet.getRange(currentRow, 21, 1, 3).merge().setValue('STAGE 3').setBackground('#e0e0e0').setFontWeight('bold').setHorizontalAlignment('center');
      currentRow++;

      // Stage description headers row (darker grey background)
      swapSheet.getRange(currentRow, 11, 1, 3).merge().setValue('Pick List ' + itemLabel + ' Before Check').setBackground('#bdbdbd').setFontWeight('bold').setHorizontalAlignment('center').setFontSize(9);
      swapSheet.getRange(currentRow, 14, 1, 3).merge().setValue('Old ' + itemLabel + ' Assignment').setBackground('#bdbdbd').setFontWeight('bold').setHorizontalAlignment('center').setFontSize(9);
      swapSheet.getRange(currentRow, 17, 1, 4).merge().setValue('Pick List ' + itemLabel + ' After Check').setBackground('#bdbdbd').setFontWeight('bold').setHorizontalAlignment('center').setFontSize(9);
      swapSheet.getRange(currentRow, 21, 1, 3).merge().setValue('Pick List ' + itemLabel + ' New Assignment').setBackground('#bdbdbd').setFontWeight('bold').setHorizontalAlignment('center').setFontSize(9);
      currentRow++;

      // Column headers row - visible (A-J) and hidden (K-W)
      var allHeaders = [
        'Employee', 'Current ' + itemLabel + ' #', 'Size', 'Date Assigned', 'Change Out Date', 'Days Left', 'Pick List Item #', 'Status', 'Picked', 'Date Changed',
        'Status', 'Assigned To', 'Date Assigned',
        'Status', 'Assigned To', 'Date Assigned',
        'Status', 'Assigned To', 'Date Assigned', 'Picked For',
        'Assigned To', 'Date Assigned', 'Change Out Date'
      ];
      swapSheet.getRange(currentRow, 1, 1, allHeaders.length).setValues([allHeaders]);
      swapSheet.getRange(currentRow, 1, 1, 10).setFontWeight('bold').setFontColor('#ffffff').setHorizontalAlignment('center').setBackground(HEADER_BG_COLOR);
      swapSheet.getRange(currentRow, 11, 1, 13).setFontWeight('bold').setBackground('#9e9e9e').setFontColor('#ffffff').setHorizontalAlignment('center').setFontSize(9);
      currentRow++;

      // Collect swap data
      var swapRows = [];
      var swapMeta = [];

      inventoryData.forEach(function(item) {
        if (parseInt(item[2], 10) !== itemClass) return;
        var assignedTo = (item[7] || '').toString().trim().toLowerCase();
        if (!assignedTo || ignoreNames.indexOf(assignedTo) !== -1 || !empMap[assignedTo]) {
          return;
        }
        var emp = empMap[assignedTo];
        var itemNum = item[0];
        var size = item[1];
        var dateAssigned = item[4];
        var changeOutDate = item[8];
        var status = item[6];
        var daysLeft = '';
        var daysLeftCell = {};

        if (changeOutDate && !isNaN(new Date(changeOutDate))) {
          var diff = (new Date(changeOutDate) - today) / (1000*60*60*24);
          var days = Math.ceil(diff);
          if (days < 0) {
            daysLeft = 'OVERDUE';
            daysLeftCell = {bold: true, color: '#ff5252'};
          } else if (days <= 14) {
            daysLeft = days;
            daysLeftCell = {bold: true, color: '#ff9800'};
          } else {
            daysLeft = days;
            daysLeftCell = {bold: false, color: '#388e3c'};
          }
        }

        if (dateAssigned && changeOutDate && daysLeft !== '' && ((typeof daysLeft === 'number' && daysLeft < 32) || daysLeft === 'OVERDUE')) {
          swapMeta.push({
            emp: emp,
            employeeLocation: empLocationMap[assignedTo] || 'Unknown',
            itemNum: itemNum,
            size: size,
            dateAssigned: dateAssigned,
            changeOutDate: changeOutDate,
            daysLeft: daysLeft,
            daysLeftCell: daysLeftCell,
            status: status,
            itemClass: itemClass,
            empPreferredSize: emp[sizeColIndex],
            itemSize: isGloves ? parseFloat(size) : size,
            oldStatus: status,
            oldAssignedTo: item[7],
            oldDateAssigned: dateAssigned
          });
        }
      });

      // Sort by Location (alphabetically), then by Change Out Date (most urgent first)
      swapMeta.sort(function(a, b) {
        var locCompare = (a.employeeLocation || 'ZZZ').localeCompare(b.employeeLocation || 'ZZZ');
        if (locCompare !== 0) return locCompare;
        return new Date(a.changeOutDate) - new Date(b.changeOutDate);
      });

      var assignedItemNums = new Set();
      swapMeta.forEach(function(meta) {
        var useSize = isGloves ?
          (!isNaN(parseFloat(meta.empPreferredSize)) ? parseFloat(meta.empPreferredSize) : meta.itemSize) :
          (meta.empPreferredSize || meta.itemSize);
        var pickListValue = '—';
        var pickListStatus = '';
        var pickListSizeUp = false;
        var pickListStatusRaw = '';
        var pickListItemData = null;

        // Try exact size On Shelf
        var match = inventoryData.find(function(item) {
          var statusMatch = item[6] && item[6].toString().trim().toLowerCase() === 'on shelf';
          var classMatch = parseInt(item[2], 10) === meta.itemClass;
          var sizeMatch = isGloves ?
            parseFloat(item[1]) === useSize :
            (item[1] && useSize && item[1].toString().trim().toLowerCase() === useSize.toString().trim().toLowerCase());
          var notAssigned = !assignedItemNums.has(item[0]);
          return statusMatch && classMatch && sizeMatch && notAssigned;
        });
        if (match) {
          pickListValue = match[0];
          pickListStatusRaw = 'on shelf';
          pickListItemData = match;
          assignedItemNums.add(match[0]);
        }

        // Try size up On Shelf (Gloves only - sleeves don't have fractional sizes)
        if (!pickListItemData && isGloves && !isNaN(useSize)) {
          match = inventoryData.find(function(item) {
            return item[6] && item[6].toString().trim().toLowerCase() === 'on shelf' &&
                   parseInt(item[2], 10) === meta.itemClass &&
                   parseFloat(item[1]) === useSize + 0.5 &&
                   !assignedItemNums.has(item[0]);
          });
          if (match) {
            pickListValue = match[0];
            pickListStatusRaw = 'on shelf';
            pickListSizeUp = true;
            pickListItemData = match;
            assignedItemNums.add(match[0]);
          }
        }

        // Try Ready For Delivery or In Testing
        if (!pickListItemData) {
          match = inventoryData.find(function(item) {
            var stat = item[6] && item[6].toString().trim().toLowerCase();
            var statusMatch = (stat === 'ready for delivery' || stat === 'in testing');
            var classMatch = parseInt(item[2], 10) === meta.itemClass;
            var sizeMatch = isGloves ?
              parseFloat(item[1]) === useSize :
              (item[1] && item[1].toString().trim().toLowerCase() === useSize.toString().trim().toLowerCase());
            var notAssigned = !assignedItemNums.has(item[0]);
            return statusMatch && classMatch && sizeMatch && notAssigned;
          });
          if (match) {
            pickListValue = match[0];
            pickListStatusRaw = match[6].toString().trim().toLowerCase();
            pickListItemData = match;
            assignedItemNums.add(match[0]);
          }
        }

        // Try size up Ready For Delivery or In Testing (Gloves only)
        if (!pickListItemData && isGloves && !isNaN(useSize)) {
          match = inventoryData.find(function(item) {
            var stat = item[6] && item[6].toString().trim().toLowerCase();
            return (stat === 'ready for delivery' || stat === 'in testing') &&
                   parseInt(item[2], 10) === meta.itemClass &&
                   parseFloat(item[1]) === useSize + 0.5 &&
                   !assignedItemNums.has(item[0]);
          });
          if (match) {
            pickListValue = match[0];
            pickListStatusRaw = match[6].toString().trim().toLowerCase();
            pickListSizeUp = true;
            pickListItemData = match;
            assignedItemNums.add(match[0]);
          }
        }

        // Determine display status
        if (pickListValue === '—') {
          pickListStatus = 'Need to Purchase ❌';
        } else if (pickListStatusRaw === 'on shelf') {
          pickListStatus = pickListSizeUp ? 'In Stock (Size Up) ⚠️' : 'In Stock ✅';
        } else if (pickListStatusRaw === 'ready for delivery') {
          pickListStatus = pickListSizeUp ? 'Ready For Delivery (Size Up) ⚠️' : 'Ready For Delivery 🚚';
        } else if (pickListStatusRaw === 'in testing') {
          pickListStatus = pickListSizeUp ? 'In Testing (Size Up) ⚠️' : 'In Testing ⏳';
        } else {
          pickListStatus = status; // Default to original status if no match
        }

        // Build row data - all 23 columns (A-W)
        var rowData = [
          meta.emp[0], meta.itemNum, meta.size, meta.dateAssigned, meta.changeOutDate, meta.daysLeft, pickListValue, pickListStatus, false, '',
          // K-M: Pick List Item Before Check
          pickListItemData ? (pickListItemData[6] || '') : '',
          pickListItemData ? (pickListItemData[7] || '') : '',
          pickListItemData ? (pickListItemData[4] || '') : '',
          // N-P: Old Item Assignment
          meta.oldStatus || '', meta.oldAssignedTo || '', meta.oldDateAssigned || '',
          // Q-T: Stage 2 (empty)
          '', '', '', '',
          // U-W: Stage 3 (empty)
          '', '', ''
        ];

        swapRows.push({
          data: rowData,
          location: meta.employeeLocation,
          daysLeftCell: meta.daysLeftCell
        });
      });

      // Group rows by location
      var locationGroups = {};
      swapRows.forEach(function(row) {
        var loc = row.location || 'Unknown';
        if (!locationGroups[loc]) {
          locationGroups[loc] = [];
        }
        locationGroups[loc].push(row);
      });

      // Get sorted location names (alphabetically)
      var sortedLocations = Object.keys(locationGroups).sort();

      if (sortedLocations.length > 0) {
        sortedLocations.forEach(function(location) {
          var locationRows = locationGroups[location];

          // Write location sub-header
          swapSheet.getRange(currentRow, 1, 1, 10).merge().setValue('📍 ' + location);
          swapSheet.getRange(currentRow, 1, 1, 10)
            .setFontWeight('bold')
            .setFontSize(10)
            .setBackground('#e8eaf6')
            .setFontColor('#3949ab')
            .setHorizontalAlignment('left');
          currentRow++;

          // Write data rows for this location
          var rowDataArray = locationRows.map(function(r) { return r.data; });
          var rowStartIndex = currentRow;

          swapSheet.getRange(currentRow, 1, rowDataArray.length, 23).setValues(rowDataArray);
          swapSheet.getRange(currentRow, 1, rowDataArray.length, 23).setHorizontalAlignment('center');
          swapSheet.getRange(currentRow, 9, rowDataArray.length, 1).insertCheckboxes();

          // Apply Days Left styling
          var daysLeftRange = swapSheet.getRange(currentRow, 6, rowDataArray.length, 1);
          for (var i = 0; i < locationRows.length; i++) {
            var val = locationRows[i].data[5];
            var style = locationRows[i].daysLeftCell;
            if (val === 'OVERDUE') {
              daysLeftRange.getCell(i+1,1).setFontWeight('bold').setFontColor(style.color);
            } else if (style.bold) {
              daysLeftRange.getCell(i+1,1).setFontWeight('bold').setFontColor(style.color);
            } else {
              daysLeftRange.getCell(i+1,1).setFontWeight('normal').setFontColor(style.color);
            }
          }

          currentRow += rowDataArray.length;
        });
      } else {
        // No swaps due for this class
        swapSheet.getRange(currentRow, 1).setValue('No swaps due for this class');
        swapSheet.getRange(currentRow, 1, 1, 10).merge().setHorizontalAlignment('center').setFontStyle('italic');
        currentRow++;
      }
      currentRow += 2;
    });

    // Flush to ensure all data is written before resizing
    SpreadsheetApp.flush();

    // Auto-resize visible columns (A-J = columns 1-10)
    for (var c = 1; c <= 10; c++) {
      swapSheet.autoResizeColumn(c);
    }

    // Set minimum column widths for better readability
    swapSheet.setColumnWidth(1, Math.max(swapSheet.getColumnWidth(1), 120));  // Employee
    swapSheet.setColumnWidth(2, Math.max(swapSheet.getColumnWidth(2), 100));  // Current Glove #
    swapSheet.setColumnWidth(5, Math.max(swapSheet.getColumnWidth(5), 110));  // Change Out Date
    swapSheet.setColumnWidth(6, Math.max(swapSheet.getColumnWidth(6), 90));   // Days Left (F)
    swapSheet.setColumnWidth(7, Math.max(swapSheet.getColumnWidth(7), 80));   // Pick List
    swapSheet.setColumnWidth(8, Math.max(swapSheet.getColumnWidth(8), 180));  // Status

    // Set hidden column widths for readability when unhidden
    swapSheet.setColumnWidth(15, 120);  // Column O - Assigned To

    // Hide columns K-W (columns 11-23, which is 13 columns)
    swapSheet.hideColumns(11, 13);

    // RESTORE MANUAL PICK LIST EDITS AFTER REGENERATION
    if (Object.keys(manualPicks).length > 0) {
      // Find the first data row after all headers (skip class titles, stage headers, column headers)
      var firstDataRow = 1;
      var lastRow = swapSheet.getLastRow();
      for (var searchRow = 1; searchRow <= Math.min(lastRow, 20); searchRow++) {
        var cellValue = swapSheet.getRange(searchRow, 1).getValue();
        var cellStr = (cellValue || '').toString().trim();
        // Found a data row when it's not empty and not a header/title
        if (cellStr && cellStr !== 'Employee' &&
            cellStr.indexOf('Class') === -1 &&
            cellStr.indexOf('STAGE') === -1 &&
            cellStr.indexOf('Pick List') === -1 &&
            cellStr.indexOf('📍') === -1) {
          firstDataRow = searchRow;
          break;
        }
      }
      restoreManualPickLists(swapSheet, manualPicks, firstDataRow, swapSheet.getLastRow());
    }

    logEvent(itemType + ' Swaps report generated successfully.');
  } catch (e) {
    logEvent('Error in generateSwaps(' + itemType + '): ' + e, 'ERROR');
    throw e;
  }
}

/**
 * Generate Glove Swaps report (wrapper for generateSwaps).
 */
function generateGloveSwaps() {
  generateSwaps('Gloves');
}

/**
 * Generate Sleeve Swaps report (wrapper for generateSwaps).
 */
function generateSleeveSwaps() {
  generateSwaps('Sleeves');
}

// NOTE: generateSleeveSwaps_OLD was removed during refactoring (Jan 2026)
// The functionality is now handled by generateSwaps('Sleeves')

/**
 * Generate the Purchase Needs tab by parsing Glove Swaps and Sleeve Swaps tabs.
 * Groups items by reason (NEED TO ORDER, Size Up, In Testing, In Testing Size Up).
 * Each group is displayed as a separate table with totals.
 * Sorted by Class, then Size within each table.
 */
function updatePurchaseNeeds() {
  try {
    logEvent('Updating Purchase Needs report...');
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var purchaseSheet = ss.getSheetByName('Purchase Needs') || ss.insertSheet('Purchase Needs');
    purchaseSheet.clear();

    // Table headers
    var tableHeaders = ['Severity', 'Timeframe', 'Item Type', 'Size', 'Class', 'Quantity Needed', 'Reason', 'Status', 'Notes'];

    // Table definitions with clear reasons - ordered by severity (1=most urgent, 5=least urgent)
    var tables = [
      {
        title: '🛒 NEED TO ORDER',
        reason: 'None Available',
        status: 'NEED TO ORDER',
        severity: 1,
        timeframe: 'Immediate',
        titleBg: '#ef9a9a',
        headerBg: '#ffcdd2',
        match: function(status) { return status === 'Need to Purchase ❌'; }
      },
      {
        title: '📦 READY FOR DELIVERY',
        reason: 'Ready For Delivery',
        status: 'Packed For Delivery',
        severity: 2,
        timeframe: 'In 2 Weeks',
        titleBg: '#a5d6a7',
        headerBg: '#c8e6c9',
        match: function(status) { return status && status.indexOf('Ready For Delivery') === 0 && status.indexOf('Size Up') === -1; }
      },
      {
        title: '📦⚠️ READY FOR DELIVERY (SIZE UP)',
        reason: 'Ready For Delivery + Size Up',
        status: 'Packed For Delivery (Size Up)',
        severity: 2,
        timeframe: 'In 2 Weeks',
        titleBg: '#80cbc4',
        headerBg: '#b2dfdb',
        match: function(status) { return status && status.indexOf('Ready For Delivery (Size Up)') === 0; }
      },
      {
        title: '⏳⚠️ IN TESTING (SIZE UP)',
        reason: 'In Testing + Size Up',
        status: 'Awaiting Test (Size Up)',
        severity: 3,
        timeframe: 'In 3 Weeks',
        titleBg: '#ce93d8',
        headerBg: '#e1bee7',
        match: function(status) { return status && status.indexOf('In Testing (Size Up)') === 0; }
      },
      {
        title: '⏳ IN TESTING',
        reason: 'In Testing',
        status: 'Awaiting Test Results',
        severity: 4,
        timeframe: 'Within Month',
        titleBg: '#90caf9',
        headerBg: '#bbdefb',
        match: function(status) { return status && status.indexOf('In Testing') === 0 && status.indexOf('Size Up') === -1; }
      },
      {
        title: '⚠️ SIZE UP ASSIGNMENTS',
        reason: 'Size Up',
        status: 'Assigned (Size Up)',
        severity: 5,
        timeframe: 'Consider',
        titleBg: '#ffcc80',
        headerBg: '#ffe0b2',
        match: function(status) { return status && status.indexOf('In Stock (Size Up)') === 0; }
      }
    ];

    // Helper to process a swap tab
    function processSwapTab(tabName, itemType, allRows) {
      var sheet = ss.getSheetByName(tabName);
      if (!sheet) return;
      var data = sheet.getDataRange().getValues();
      var currentClass = null;

      for (var i = 0; i < data.length; i++) {
        var row = data[i];
        var cellA = row[0];

        var classHeaderPattern = new RegExp('^Class (\\d+) (Glove|Sleeve) Swaps', 'i');
        var headerMatch = cellA && typeof cellA === 'string' && cellA.match(classHeaderPattern);
        if (headerMatch) {
          currentClass = parseInt(headerMatch[1], 10);
          continue;
        }

        if (currentClass === null) continue;
        if (!cellA) continue;
        if (typeof cellA === 'string' && cellA.toLowerCase() === 'employee') continue;
        if (typeof cellA === 'string' && (cellA.indexOf('STAGE') !== -1 || cellA.indexOf('Pick List') !== -1)) continue;

        var size = row[2];
        var status = row[7];
        var employeeName = row[0];

        if (!size || !status) continue;

        var sizeStr = String(size);

        for (var t = 0; t < tables.length; t++) {
          if (tables[t].match(status)) {
            var classNum = parseInt(currentClass, 10);
            var key = itemType + '|' + sizeStr + '|' + classNum;

            if (!allRows[t][key]) {
              allRows[t][key] = { itemType: itemType, size: sizeStr, class: classNum, qty: 0, employees: [] };
            }
            allRows[t][key].qty++;
            if (employeeName && allRows[t][key].employees.indexOf(employeeName) === -1) {
              allRows[t][key].employees.push(employeeName);
            }
            break;
          }
        }
      }
    }

    var allRows = [{}, {}, {}, {}, {}, {}];
    processSwapTab('Glove Swaps', 'Glove', allRows);
    processSwapTab('Sleeve Swaps', 'Sleeve', allRows);

    // Also process Reclaims sheet for "Need to Purchase" items
    var reclaimsSheet = ss.getSheetByName('Reclaims');
    if (reclaimsSheet && reclaimsSheet.getLastRow() > 1) {
      var reclaimsData = reclaimsSheet.getDataRange().getValues();

      for (var ri = 0; ri < reclaimsData.length; ri++) {
        var rRow = reclaimsData[ri];
        var rFirstCell = (rRow[0] || '').toString().trim();

        // Skip headers, titles, location rows
        if (!rFirstCell || rFirstCell === 'Employee' ||
            rFirstCell.indexOf('⚠️') !== -1 ||
            rFirstCell.indexOf('📍') !== -1 ||
            rFirstCell.indexOf('Previous') !== -1 ||
            rFirstCell.indexOf('Lost Items') !== -1 ||
            rFirstCell === 'Item Type' ||
            rFirstCell === 'Location') {
          continue;
        }

        // Check if this is a reclaim data row with "Need to Purchase" status
        // Reclaims table format: Employee, Item Type, Item #, Size, Class, Location, Pick List Item #, Pick List Status
        var rItemType = (rRow[1] || '').toString().trim();  // Item Type (Glove/Sleeve)
        var rSize = (rRow[3] || '').toString().trim();       // Size
        var rClass = (rRow[4] || '').toString().trim();      // Class
        var rPickListStatus = (rRow[7] || '').toString().trim();  // Pick List Status
        var rEmployee = rFirstCell;  // Employee name

        // Only process if it's a valid reclaim row with Need to Purchase status
        if ((rItemType === 'Glove' || rItemType === 'Sleeve') &&
            rSize && rClass &&
            rPickListStatus.indexOf('Need to Purchase') !== -1) {

          var classNum = parseInt(rClass, 10);
          var key = rItemType + '|' + rSize + '|' + classNum;

          // Add to the "Need to Order" table (index 0)
          if (!allRows[0][key]) {
            allRows[0][key] = { itemType: rItemType, size: rSize, class: classNum, qty: 0, employees: [] };
          }
          allRows[0][key].qty++;
          if (rEmployee && allRows[0][key].employees.indexOf(rEmployee + ' (Reclaim)') === -1) {
            allRows[0][key].employees.push(rEmployee + ' (Reclaim)');
          }
        }
      }
    }

    var grandTotals = {
      needToOrder: 0,
      readyForDelivery: 0,
      readyForDeliverySizeUp: 0,
      inTestingSizeUp: 0,
      inTesting: 0,
      sizeUp: 0
    };

    for (var t = 0; t < tables.length; t++) {
      var keys = Object.keys(allRows[t]);
      for (var k = 0; k < keys.length; k++) {
        var qty = allRows[t][keys[k]].qty;
        if (t === 0) grandTotals.needToOrder += qty;
        else if (t === 1) grandTotals.readyForDelivery += qty;
        else if (t === 2) grandTotals.readyForDeliverySizeUp += qty;
        else if (t === 3) grandTotals.inTestingSizeUp += qty;
        else if (t === 4) grandTotals.inTesting += qty;
        else if (t === 5) grandTotals.sizeUp += qty;
      }
    }

    var rowIdx = 1;

    // Write summary section at top (9 columns)
    purchaseSheet.getRange(rowIdx, 1, 1, 9).merge().setValue('📊 PURCHASE NEEDS SUMMARY - Generated: ' + new Date().toLocaleString())
      .setFontWeight('bold').setFontSize(14).setBackground('#b0bec5').setFontColor('#333333').setHorizontalAlignment('center');
    rowIdx++;

    // Summary stats row (9 columns)
    var topSummaryData = [
      ['1️⃣ Immediate: ' + grandTotals.needToOrder,
       '2️⃣ 2 Weeks: ' + (grandTotals.readyForDelivery + grandTotals.readyForDeliverySizeUp),
       '3️⃣ 3 Weeks: ' + grandTotals.inTestingSizeUp,
       '4️⃣ Month: ' + grandTotals.inTesting,
       '5️⃣ Consider: ' + grandTotals.sizeUp,
       '', '', '', '']
    ];
    purchaseSheet.getRange(rowIdx, 1, 1, 9).setValues(topSummaryData)
      .setBackground('#eceff1').setFontWeight('bold').setHorizontalAlignment('center');
    rowIdx += 2;

    // Write each table
    for (var t = 0; t < tables.length; t++) {
      var keys = Object.keys(allRows[t]);
      if (keys.length === 0) continue;

      // Sort keys by Class (numeric), then by Size
      keys.sort(function(a, b) {
        var aData = allRows[t][a];
        var bData = allRows[t][b];
        if (aData.class !== bData.class) return aData.class - bData.class;
        var aSize = parseFloat(aData.size) || 0;
        var bSize = parseFloat(bData.size) || 0;
        if (aSize !== bSize) return aSize - bSize;
        return aData.itemType.localeCompare(bData.itemType);
      });

      // Table title
      purchaseSheet.getRange(rowIdx, 1, 1, 9).merge().setValue(tables[t].title)
        .setFontWeight('bold').setFontSize(12).setBackground(tables[t].titleBg).setFontColor('#333333').setHorizontalAlignment('center');
      rowIdx++;

      // Table headers
      purchaseSheet.getRange(rowIdx, 1, 1, tableHeaders.length).setValues([tableHeaders])
        .setFontWeight('bold').setBackground(tables[t].headerBg).setHorizontalAlignment('center');
      rowIdx++;

      // Table rows
      var tableTotal = 0;
      var dataStartRow = rowIdx;
      for (var k = 0; k < keys.length; k++) {
        var r = allRows[t][keys[k]];
        tableTotal += r.qty;
        var classValue = parseInt(r.class, 10);
        var employeeList = r.employees && r.employees.length > 0 ? r.employees.join(', ') : '';
        var rowData = [
          tables[t].severity, tables[t].timeframe, r.itemType, r.size, classValue,
          r.qty, tables[t].reason, tables[t].status, employeeList
        ];
        purchaseSheet.getRange(rowIdx, 1, 1, rowData.length).setValues([rowData]);
        purchaseSheet.getRange(rowIdx, 1, 1, 8).setHorizontalAlignment('center');
        purchaseSheet.getRange(rowIdx, 9).setWrap(true);
        rowIdx++;
      }

      // Set Class column to plain number format
      var numDataRows = rowIdx - dataStartRow;
      if (numDataRows > 0) {
        purchaseSheet.getRange(dataStartRow, 5, numDataRows, 1).setNumberFormat('0');
      }

      // Table total row
      purchaseSheet.getRange(rowIdx, 1, 1, 5).merge().setValue('TOTAL')
        .setFontWeight('bold').setHorizontalAlignment('right').setBackground('#e0e0e0');
      purchaseSheet.getRange(rowIdx, 6).setValue(tableTotal)
        .setFontWeight('bold').setHorizontalAlignment('center').setBackground('#e0e0e0');
      purchaseSheet.getRange(rowIdx, 7, 1, 3).setBackground('#e0e0e0');
      rowIdx += 2;
    }

    // If no data at all, show message
    var totalItems = grandTotals.needToOrder + grandTotals.sizeUp + grandTotals.inTesting + grandTotals.inTestingSizeUp + grandTotals.readyForDelivery + grandTotals.readyForDeliverySizeUp;
    if (totalItems === 0) {
      purchaseSheet.getRange(rowIdx, 1, 1, 9).merge().setValue('✅ No purchase needs at this time!')
        .setFontWeight('bold').setFontSize(12).setBackground('#4caf50').setFontColor('white').setHorizontalAlignment('center');
    }

    // Create summary table to the right
    var summaryStartRow = 4;
    var summaryCol = 11;

    purchaseSheet.getRange(summaryStartRow, summaryCol, 1, 2).merge().setValue('📊 SUMMARY BY TIMEFRAME')
      .setFontWeight('bold').setBackground('#b0bec5').setFontColor('#333333').setHorizontalAlignment('center');

    var summaryData = [
      ['1️⃣ Immediate', grandTotals.needToOrder, '#ef9a9a'],
      ['2️⃣ In 2 Weeks', grandTotals.readyForDelivery + grandTotals.readyForDeliverySizeUp, '#a5d6a7'],
      ['3️⃣ In 3 Weeks', grandTotals.inTestingSizeUp, '#ce93d8'],
      ['4️⃣ Within Month', grandTotals.inTesting, '#90caf9'],
      ['5️⃣ Consider', grandTotals.sizeUp, '#ffcc80']
    ];

    for (var s = 0; s < summaryData.length; s++) {
      var sRow = summaryStartRow + 1 + s;
      purchaseSheet.getRange(sRow, summaryCol).setValue(summaryData[s][0])
        .setBackground(summaryData[s][2]).setFontColor('#333333').setFontWeight('bold');
      purchaseSheet.getRange(sRow, summaryCol + 1).setValue(summaryData[s][1])
        .setBackground(summaryData[s][2]).setFontColor('#333333').setFontWeight('bold').setHorizontalAlignment('center');
    }

    var totalRow = summaryStartRow + 6;
    var grandTotal = grandTotals.needToOrder + grandTotals.sizeUp + grandTotals.inTesting + grandTotals.inTestingSizeUp + grandTotals.readyForDelivery + grandTotals.readyForDeliverySizeUp;
    purchaseSheet.getRange(totalRow, summaryCol).setValue('TOTAL')
      .setBackground('#cfd8dc').setFontColor('#333333').setFontWeight('bold');
    purchaseSheet.getRange(totalRow, summaryCol + 1).setValue(grandTotal)
      .setBackground('#cfd8dc').setFontColor('#333333').setFontWeight('bold').setHorizontalAlignment('center');

    // Column widths
    var widths = [60, 100, 75, 70, 50, 100, 170, 175, 300];
    for (var i = 0; i < widths.length; i++) {
      purchaseSheet.setColumnWidth(i + 1, widths[i]);
    }
    purchaseSheet.setColumnWidth(11, 140);
    purchaseSheet.setColumnWidth(12, 55);
    purchaseSheet.setFrozenRows(2);

    logEvent('Purchase Needs report generated successfully.');
  } catch (e) {
    logEvent('Error in updatePurchaseNeeds: ' + e, 'ERROR');
    throw e;
  }
}

/**
 * Update Inventory Reports.
 * Summarizes inventory status from Gloves and Sleeves with colorful dashboard.
 */
function updateInventoryReports() {
  try {
    logEvent('Updating Inventory Reports...');
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var inventorySheet = ss.getSheetByName('Inventory Reports');
    if (!inventorySheet) {
      inventorySheet = ss.insertSheet('Inventory Reports');
    }
    inventorySheet.clear();

    var glovesSheet = ss.getSheetByName('Gloves');
    var sleevesSheet = ss.getSheetByName('Sleeves');

    if (!glovesSheet || !sleevesSheet) {
      inventorySheet.getRange(1, 1).setValue('Missing Gloves or Sleeves sheet');
      return;
    }

    var now = new Date();
    var timestamp = Utilities.formatDate(now, ss.getSpreadsheetTimeZone(), 'MM/dd/yyyy, h:mm:ss a');

    // Get data
    var glovesData = glovesSheet.getLastRow() > 1 ? glovesSheet.getRange(2, 1, glovesSheet.getLastRow() - 1, 11).getValues() : [];
    var sleevesData = sleevesSheet.getLastRow() > 1 ? sleevesSheet.getRange(2, 1, sleevesSheet.getLastRow() - 1, 11).getValues() : [];

    var totalGloves = glovesData.length;
    var totalSleeves = sleevesData.length;

    var gloveStatusCounts = {};
    var sleeveStatusCounts = {};
    var gloveClassCounts = {};
    var sleeveClassCounts = {};
    var locationCounts = {};

    // Process gloves
    glovesData.forEach(function(row) {
      var status = normalizeStatusForReport(row[6]);
      var itemClass = String(row[2]).trim();
      var location = (row[5] || '').toString().trim();

      gloveStatusCounts[status] = (gloveStatusCounts[status] || 0) + 1;

      if (itemClass === '0' || itemClass === '2' || itemClass === '3') {
        gloveClassCounts[itemClass] = (gloveClassCounts[itemClass] || 0) + 1;
      }

      if (location) {
        if (!locationCounts[location]) locationCounts[location] = { gloves: 0, sleeves: 0 };
        locationCounts[location].gloves++;
      }
    });

    // Process sleeves
    sleevesData.forEach(function(row) {
      var status = normalizeStatusForReport(row[6]);
      var itemClass = String(row[2]).trim();
      var location = (row[5] || '').toString().trim();

      sleeveStatusCounts[status] = (sleeveStatusCounts[status] || 0) + 1;

      if (itemClass === '2' || itemClass === '3') {
        sleeveClassCounts[itemClass] = (sleeveClassCounts[itemClass] || 0) + 1;
      }

      if (location) {
        if (!locationCounts[location]) locationCounts[location] = { gloves: 0, sleeves: 0 };
        locationCounts[location].sleeves++;
      }
    });

    var glovesLost = gloveStatusCounts['Lost'] || 0;
    var glovesFailed = gloveStatusCounts['Failed Rubber'] || 0;
    var sleevesLost = sleeveStatusCounts['Lost'] || 0;
    var sleevesFailed = sleeveStatusCounts['Failed Rubber'] || 0;

    var gloveAssigned = gloveStatusCounts['Assigned'] || 0;
    var sleeveAssigned = sleeveStatusCounts['Assigned'] || 0;
    var gloveMonthlyAvg = (gloveAssigned / 12).toFixed(1);
    var sleeveMonthlyAvg = (sleeveAssigned / 12).toFixed(1);

    var row = 1;

    // Title
    inventorySheet.getRange(row, 1, 1, 6).merge()
      .setValue('INVENTORY DASHBOARD - Generated: ' + timestamp)
      .setFontWeight('bold').setFontSize(14).setBackground('#1565c0').setFontColor('white').setHorizontalAlignment('center');
    inventorySheet.setRowHeight(row, 35);
    row += 2;

    // Summary header row - colorful backgrounds for each column
    var summaryHeaderRange = inventorySheet.getRange(row, 1, 1, 6);
    summaryHeaderRange.setValues([
      ['TOTAL GLOVES', 'TOTAL SLEEVES', 'Glove Avg/Month', 'Sleeve Avg/Month', 'Gloves Lost/Failed', 'Sleeves Lost/Failed']
    ]).setFontWeight('bold').setHorizontalAlignment('center').setFontColor('white');
    inventorySheet.getRange(row, 1).setBackground('#1565c0');
    inventorySheet.getRange(row, 2).setBackground('#2e7d32');
    inventorySheet.getRange(row, 3).setBackground('#0277bd');
    inventorySheet.getRange(row, 4).setBackground('#388e3c');
    inventorySheet.getRange(row, 5).setBackground('#c62828');
    inventorySheet.getRange(row, 6).setBackground('#d32f2f');
    inventorySheet.setRowHeight(row, 30);
    row++;

    // Summary data row - larger font and taller row with colored backgrounds
    var summaryDataRange = inventorySheet.getRange(row, 1, 1, 6);
    summaryDataRange.setValues([
      [totalGloves, totalSleeves, gloveMonthlyAvg, sleeveMonthlyAvg, glovesLost + '/' + glovesFailed, sleevesLost + '/' + sleevesFailed]
    ]).setHorizontalAlignment('center').setFontSize(18).setFontWeight('bold');
    inventorySheet.getRange(row, 1).setBackground('#e3f2fd').setFontColor('#1565c0');
    inventorySheet.getRange(row, 2).setBackground('#e8f5e9').setFontColor('#2e7d32');
    inventorySheet.getRange(row, 3).setBackground('#e1f5fe').setFontColor('#0277bd');
    inventorySheet.getRange(row, 4).setBackground('#c8e6c9').setFontColor('#388e3c');
    inventorySheet.getRange(row, 5).setBackground('#ffebee').setFontColor('#c62828');
    inventorySheet.getRange(row, 6).setBackground('#ffcdd2').setFontColor('#d32f2f');
    inventorySheet.setRowHeight(row, 45);
    row += 2;

    // Gloves by Status
    row = writeStatusTableForInventory(inventorySheet, row, 'GLOVES BY STATUS', gloveStatusCounts, totalGloves);
    row++;

    // Sleeves by Status
    row = writeStatusTableForInventory(inventorySheet, row, 'SLEEVES BY STATUS', sleeveStatusCounts, totalSleeves);
    row++;

    // Inventory by Class
    inventorySheet.getRange(row, 1, 1, 6).merge()
      .setValue('INVENTORY BY CLASS')
      .setFontWeight('bold').setFontSize(12).setBackground('#5c6bc0').setFontColor('white').setHorizontalAlignment('center');
    inventorySheet.setRowHeight(row, 28);
    row++;
    inventorySheet.getRange(row, 1, 1, 6).setValues([
      ['Class', 'Gloves', 'Sleeves', 'Total', 'Glove Avg/Mo', 'Sleeve Avg/Mo']
    ]).setFontWeight('bold').setBackground('#9fa8da').setHorizontalAlignment('center');
    row++;

    var classes = ['0', '2', '3'];
    classes.forEach(function(cls) {
      var gCount = gloveClassCounts[cls] || 0;
      var sCount = sleeveClassCounts[cls] || 0;
      inventorySheet.getRange(row, 1, 1, 6).setValues([
        ['Class ' + cls, gCount, sCount, gCount + sCount, (gCount / 12).toFixed(1), (sCount / 12).toFixed(1)]
      ]).setHorizontalAlignment('center');
      row++;
    });
    row++;

    // Inventory by Location
    inventorySheet.getRange(row, 1, 1, 4).merge()
      .setValue('INVENTORY BY LOCATION')
      .setFontWeight('bold').setFontSize(12).setBackground('#26a69a').setFontColor('white').setHorizontalAlignment('center');
    inventorySheet.setRowHeight(row, 28);
    row++;
    inventorySheet.getRange(row, 1, 1, 4).setValues([
      ['Location', 'Gloves', 'Sleeves', 'Total']
    ]).setFontWeight('bold').setBackground('#80cbc4').setHorizontalAlignment('center');
    row++;

    var locationArr = Object.keys(locationCounts).map(function(loc) {
      return { location: loc, gloves: locationCounts[loc].gloves, sleeves: locationCounts[loc].sleeves };
    });
    locationArr.sort(function(a, b) {
      return (b.gloves + b.sleeves) - (a.gloves + a.sleeves);
    });

    locationArr.forEach(function(loc) {
      inventorySheet.getRange(row, 1, 1, 4).setValues([
        [loc.location, loc.gloves, loc.sleeves, loc.gloves + loc.sleeves]
      ]).setHorizontalAlignment('center');
      row++;
    });
    row++;

    // 12-Month Assignment Averages
    inventorySheet.getRange(row, 1, 1, 5).merge()
      .setValue('12-MONTH ASSIGNMENT AVERAGES (Current Assignments Only)')
      .setFontWeight('bold').setFontSize(12).setBackground('#7e57c2').setFontColor('white').setHorizontalAlignment('center');
    inventorySheet.setRowHeight(row, 28);
    row++;
    inventorySheet.getRange(row, 1, 1, 5).setValues([
      ['Category', 'Assignments (12mo)', 'Monthly Avg', 'Weekly Avg', 'Daily Avg']
    ]).setFontWeight('bold').setBackground('#b39ddb').setHorizontalAlignment('center');
    row++;

    var combinedAssigned = gloveAssigned + sleeveAssigned;
    inventorySheet.getRange(row, 1, 3, 5).setValues([
      ['All Gloves', gloveAssigned, gloveMonthlyAvg, (gloveAssigned / 52).toFixed(1), (gloveAssigned / 365).toFixed(2)],
      ['All Sleeves', sleeveAssigned, sleeveMonthlyAvg, (sleeveAssigned / 52).toFixed(1), (sleeveAssigned / 365).toFixed(2)],
      ['Combined', combinedAssigned, (combinedAssigned / 12).toFixed(1), (combinedAssigned / 52).toFixed(1), (combinedAssigned / 365).toFixed(2)]
    ]).setHorizontalAlignment('center');

    // Column widths
    inventorySheet.setColumnWidth(1, 150);
    inventorySheet.setColumnWidth(2, 100);
    inventorySheet.setColumnWidth(3, 100);
    inventorySheet.setColumnWidth(4, 100);
    inventorySheet.setColumnWidth(5, 100);
    inventorySheet.setColumnWidth(6, 120);

    inventorySheet.setFrozenRows(1);


    logEvent('Inventory Reports updated successfully.');
  } catch (e) {
    logEvent('Error in updateInventoryReports: ' + e, 'ERROR');
    throw e;
  }
}

/**
 * Helper function to write a status table for inventory reports
 */
function writeStatusTableForInventory(sheet, startRow, title, statusCounts, total) {
  var row = startRow;

  sheet.getRange(row, 1, 1, 4).merge()
    .setValue(title)
    .setFontWeight('bold').setFontSize(12).setBackground('#b0bec5').setHorizontalAlignment('center');
  row++;

  sheet.getRange(row, 1, 1, 4).setValues([['Status', 'Count', '% of Total', 'Bar']])
    .setFontWeight('bold').setBackground('#cfd8dc').setHorizontalAlignment('center');
  row++;

  var statuses = ['Assigned', 'On Shelf', 'In Testing', 'Ready For Delivery', 'Ready For Test', 'Failed Rubber', 'Lost'];

  statuses.forEach(function(status) {
    var count = statusCounts[status] || 0;
    var pct = total > 0 ? ((count / total) * 100).toFixed(1) + '%' : '0%';
    var barLength = total > 0 ? Math.round((count / total) * 20) : 0;
    var bar = '';
    for (var i = 0; i < barLength; i++) bar += '|';

    sheet.getRange(row, 1, 1, 4).setValues([[status, count, pct, bar]]);
    sheet.getRange(row, 1).setBackground(getStatusColorForReport(status));
    // Set Bar column (column 4) to blue and left-aligned
    sheet.getRange(row, 4).setFontColor('#1565c0').setHorizontalAlignment('left');
    sheet.getRange(row, 2, 1, 2).setHorizontalAlignment('center');
    row++;
  });

  sheet.getRange(row, 1).setValue('TOTAL').setFontWeight('bold');
  sheet.getRange(row, 2).setValue(total).setFontWeight('bold').setHorizontalAlignment('center');
  row++;

  return row;
}

/**
 * Normalizes status strings for consistent counting in reports
 */
function normalizeStatusForReport(status) {
  if (!status) return 'Unknown';
  var s = status.toString().toLowerCase().trim();

  if (s === 'assigned') return 'Assigned';
  if (s === 'on shelf') return 'On Shelf';
  if (s === 'in testing') return 'In Testing';
  if (s.indexOf('ready for delivery') !== -1) return 'Ready For Delivery';
  if (s.indexOf('ready for test') !== -1) return 'Ready For Test';
  if (s === 'failed rubber') return 'Failed Rubber';
  if (s === 'lost') return 'Lost';

  return status; // Return original if no match
}

/**
 * Returns background color for status categories in reports
 */
function getStatusColorForReport(status) {
  var colors = {
    'Assigned': '#c8e6c9',      // Light green
    'On Shelf': '#bbdefb',      // Light blue
    'In Testing': '#fff9c4',    // Light yellow
    'Ready For Delivery': '#e1bee7', // Light purple
    'Ready For Test': '#b3e5fc',     // Light cyan
    'Failed Rubber': '#ffcdd2', // Light red
    'Lost': '#d7ccc8'           // Light brown
  };
  return colors[status] || '#ffffff';
}

// NOTE: updateGlovesLocationsFromAssignedTo was removed during refactoring (Jan 2026)
// Location updates are now handled by handleInventoryAssignedToChange()

/**
 * Run Reclaims check.
 * Cross-checks assignments for compliance with location rules and updates the Reclaims sheet.
 * This is a wrapper for updateReclaimsSheet() for menu consistency.
 */
function runReclaimsCheck() {
  try {
    logEvent('Running Reclaims check...');
    updateReclaimsSheet();
    logEvent('Reclaims check completed.');
  } catch (e) {
    logEvent('Error in runReclaimsCheck: ' + e, 'ERROR');
    throw e;
  }
}

/**
 * Sets up the Reclaims sheet structure with all required tables.
 * Called by buildSheets to create the initial layout.
 * @param {Sheet} sheet - The Reclaims sheet to set up
 * @param {Object} savedApprovals - Optional object mapping location names to their approval values
 * @param {number} prevEmpCount - Optional number of Previous Employee items to allocate space for
 */
function setupReclaimsSheet(sheet, savedApprovals, prevEmpCount) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var employeesSheet = ss.getSheetByName('Employees');
    savedApprovals = savedApprovals || {};
    prevEmpCount = prevEmpCount || 0;

    // Locations to exclude from Class Location Approvals table (lowercase for comparison)
    var excludeFromApprovalTable = [
      'weeds', 'previous employee', 'lost', 'kalispell gas dock',
      'destroyed', "cody's truck", 'arnett / jm test'
    ];

    // Helper function to normalize apostrophes in a string
    function normalizeApostrophes(str) {
      if (!str) return '';
      // Replace various apostrophe characters with standard apostrophe
      var result = String(str);
      result = result.split('\u2018').join("'");
      result = result.split('\u2019').join("'");
      return result;
    }

    // Helper function to check if location should be excluded (handles apostrophe variants)
    function shouldExcludeLocation(loc) {
      var locLower = normalizeApostrophes(loc.toLowerCase());
      for (var i = 0; i < excludeFromApprovalTable.length; i++) {
        var excludeLoc = normalizeApostrophes(excludeFromApprovalTable[i]);
        if (locLower === excludeLoc) {
          return true;
        }
      }
      return false;
    }

    // Filter out excluded locations from savedApprovals and normalize values
    var filteredApprovals = {};
    for (var locKey in savedApprovals) {
      if (!shouldExcludeLocation(locKey)) {
        // Normalize the approval value to fix HTML-encoded characters
        filteredApprovals[locKey] = normalizeApprovalValue(savedApprovals[locKey]);
      }
    }
    savedApprovals = filteredApprovals;

    // Completely clear the sheet including data validations
    // IMPORTANT: Clear validations BEFORE clearing content to avoid conflicts
    try {
      var maxRows = Math.max(sheet.getMaxRows(), 100);
      var maxCols = Math.max(sheet.getMaxColumns(), 10);
      Logger.log('Clearing data validations for ' + maxRows + ' rows x ' + maxCols + ' cols');
      sheet.getRange(1, 1, maxRows, maxCols).clearDataValidations();

      // Force the operation to complete before continuing
      SpreadsheetApp.flush();
      Logger.log('Data validations cleared successfully');
    } catch (clearErr) {
      Logger.log('[ERROR] Failed to clear data validations: ' + clearErr);
    }

    // Now clear the content
    sheet.clear();

    // Force flush again to ensure clear is complete
    SpreadsheetApp.flush();
    Logger.log('Sheet content cleared');

    var currentRow = 1;

    // Table 1: Previous Employee Reclaims
    sheet.getRange(currentRow, 1, 1, 8).merge()
      .setValue('Previous Employee Reclaims')
      .setFontWeight('bold').setFontSize(14).setBackground('#ffcdd2').setHorizontalAlignment('center');
    currentRow++;

    // Headers for Previous Employee table
    var prevEmpHeaders = ['Item Type', 'Item #', 'Size', 'Class', 'Location', 'Status', 'Assigned To', 'Date Assigned'];
    sheet.getRange(currentRow, 1, 1, prevEmpHeaders.length).setValues([prevEmpHeaders]).setFontWeight('bold').setBackground('#ef9a9a').setHorizontalAlignment('center');
    currentRow++;

    // Leave space for Previous Employee data (dynamic based on actual count)
    // Minimum 1 row for "No items" message, otherwise allocate exact count
    var prevEmpDataRows = Math.max(1, prevEmpCount);
    currentRow += prevEmpDataRows;
    currentRow++; // Add 1 blank row before next table

    // --- Table 2: Class Location Approvals ---
    sheet.getRange(currentRow, 1, 1, 8).merge()
      .setValue('📍 Class Location Approvals')
      .setFontWeight('bold').setFontSize(14).setBackground('#c8e6c9').setHorizontalAlignment('center');
    currentRow++;

    // Headers for Approved Locations table
    sheet.getRange(currentRow, 1, 1, 2).setValues([['Location', 'Approval']])
      .setFontWeight('bold').setBackground('#a5d6a7').setHorizontalAlignment('center');
    currentRow++;

    // Default location approvals
    var defaultApprovals = {
      'Big Sky': 'CL3',
      'Bozeman': 'CL2',
      'Butte': 'CL2',
      'CA Sub': 'CL2',
      'Ennis': 'CL2',
      'Great Falls': 'CL2 & CL3',
      'Helena': 'CL2',
      'Livingston': 'CL2 & CL3',
      'Missoula': 'CL2',
      'Northern Lights': 'CL2',
      'South Dakota Dock': 'CL2',
      'Stanford': 'CL2'
    };

    // Get unique locations from Employees sheet
    if (employeesSheet && employeesSheet.getLastRow() > 1) {
      var employeesData = employeesSheet.getDataRange().getValues();
      var locations = new Set();
      for (var i = 1; i < employeesData.length; i++) {
        var loc = employeesData[i][2]; // Column C (Location)
        if (loc && loc !== 'Location' && loc !== '' && loc !== 'N/A') {
          // Filter out excluded locations using helper function
          if (!shouldExcludeLocation(loc)) {
            locations.add(loc);
          }
        }
      }
      var locationsArr = Array.from(locations).sort();

      if (locationsArr.length > 0) {
        // Check for new locations that don't have a default or saved approval
        var newLocations = [];
        locationsArr.forEach(function(loc) {
          if (!savedApprovals[loc] && !defaultApprovals[loc]) {
            newLocations.push(loc);
          }
        });

        // Prompt user for approval class for new locations
        if (newLocations.length > 0) {
          var ui = SpreadsheetApp.getUi();
          newLocations.forEach(function(newLoc) {
            var response = ui.prompt(
              '🆕 New Location Found: ' + newLoc,
              'Please select the Approved Rubber Class for "' + newLoc + '":\n\n' +
              'Enter one of the following:\n' +
              '• CL2 - Class 2 only\n' +
              '• CL3 - Class 3 only\n' +
              '• CL2 & CL3 - Both Class 2 and Class 3',
              ui.ButtonSet.OK_CANCEL
            );

            if (response.getSelectedButton() === ui.Button.OK) {
              var input = response.getResponseText().trim().toUpperCase();
              // Normalize the input
              if (input === 'CL2' || input === '2' || input === 'CLASS 2') {
                savedApprovals[newLoc] = 'CL2';
              } else if (input === 'CL3' || input === '3' || input === 'CLASS 3') {
                savedApprovals[newLoc] = 'CL3';
              } else if (input === 'CL2 & CL3' || input === 'CL2 AND CL3' || input === 'CL2&CL3' ||
                         input === 'BOTH' || input === '2 & 3' || input === '2&3') {
                savedApprovals[newLoc] = 'CL2 & CL3';
              } else {
                // Default to CL2 if invalid input
                ui.alert('Invalid input "' + input + '" - defaulting to CL2 for ' + newLoc);
                savedApprovals[newLoc] = 'CL2';
              }
            } else {
              // User cancelled - default to CL2
              savedApprovals[newLoc] = 'CL2';
            }
          });
        }

        // Write locations with approval values (priority: savedApprovals > defaultApprovals)
        var locationData = locationsArr.map(function(loc) {
          var approval = savedApprovals[loc] || defaultApprovals[loc] || 'CL2';
          // Normalize one more time to ensure valid value is written
          return [loc, normalizeApprovalValue(approval)];
        });
        sheet.getRange(currentRow, 1, locationData.length, 2).setValues(locationData);

        // Add dropdown validation for Approval column
        var approvalRange = sheet.getRange(currentRow, 2, locationData.length, 1);
        var rule = SpreadsheetApp.newDataValidation()
          .requireValueInList(['None', 'CL2', 'CL3', 'CL2 & CL3'], true)
          .setAllowInvalid(false)
          .build();
        approvalRange.setDataValidation(rule);

        currentRow += locationData.length;
      }
    }
    currentRow += 2;

    // Note: Class 3 Reclaims and Class 2 Reclaims tables are created dynamically
    // in updateReclaimsSheet after data collection to properly size them

    // Auto-resize columns to fit content
    for (var col = 1; col <= 8; col++) {
      sheet.autoResizeColumn(col);
    }

    // Return the current row so updateReclaimsSheet knows where to start
    return currentRow;

  } catch (e) {
    Logger.log('[ERROR] setupReclaimsSheet: ' + e);
  }
}

/**
 * Updates the Reclaims sheet with current data from Gloves and Sleeves tabs.
 * Populates Previous Employee Reclaims, Class 3 Reclaims, and Class 2 Reclaims tables.
 * Includes Auto Pick List for reclaim items (runs AFTER swap pick lists to respect reservations).
 * Preserves Approved Class 3 Locations selections.
 * Called by generateAllReports.
 */
function updateReclaimsSheet() {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var reclaimsSheet = ss.getSheetByName('Reclaims');

    // Locations to ignore for Class 2/3 reclaims checks (lowercase)
    var ignoreLocations = [
      "cody's truck", "destroyed", "kalispell gas dock", "lost",
      "previous employee", "weeds", "arnett / jm test"
    ];

    // Get items already assigned in Glove Swaps and Sleeve Swaps (to respect their priority)
    var swapAssignedItems = getSwapAssignedItems(ss);

    // --- Preserve existing Class Location Approvals selections FIRST ---
    var savedApprovals = {};

    if (reclaimsSheet && reclaimsSheet.getLastRow() > 0) {
      var sheetData = reclaimsSheet.getDataRange().getValues();
      var inLocationsTable = false;

      for (var i = 0; i < sheetData.length; i++) {
        var cellA = (sheetData[i][0] || '').toString();

        if (cellA.indexOf('Class Location Approvals') !== -1 || cellA.indexOf('Approved Class 3 Locations') !== -1) {
          inLocationsTable = true;
          continue;
        }

        if (inLocationsTable && (cellA.indexOf('Class 3 Reclaims') !== -1 || cellA.indexOf('Class 2 Reclaims') !== -1)) {
          break;
        }

        if (inLocationsTable && cellA === 'Location') {
          continue;
        }

        if (inLocationsTable && cellA && cellA !== '') {
          var approval = (sheetData[i][1] || '').toString();
          if (approval) {
            // Normalize the approval value to fix HTML-encoded characters
            savedApprovals[cellA] = normalizeApprovalValue(approval);
          }
        }
      }

      Logger.log('Preserved ' + Object.keys(savedApprovals).length + ' location approvals');
    }

    if (!reclaimsSheet) {
      reclaimsSheet = ss.insertSheet('Reclaims');
    }

    var glovesSheet = ss.getSheetByName('Gloves');
    var sleevesSheet = ss.getSheetByName('Sleeves');
    var employeesSheet = ss.getSheetByName('Employees');

    if (!glovesSheet || !sleevesSheet || !employeesSheet) {
      SpreadsheetApp.getUi().alert('Missing required sheet(s): Gloves, Sleeves, or Employees.');
      return;
    }

    // Get inventory data FIRST (needed to count Previous Employee items)
    var glovesData = glovesSheet.getLastRow() > 1 ? glovesSheet.getRange(2, 1, glovesSheet.getLastRow() - 1, 11).getValues() : [];
    var sleevesData = sleevesSheet.getLastRow() > 1 ? sleevesSheet.getRange(2, 1, sleevesSheet.getLastRow() - 1, 11).getValues() : [];

    // Build set of CURRENT active employee names from Employees sheet
    // These should NEVER appear in Previous Employee Reclaims
    var currentActiveEmployees = new Set();
    if (employeesSheet && employeesSheet.getLastRow() > 1) {
      var empSheetData = employeesSheet.getDataRange().getValues();
      // Find Location column dynamically
      var empHeaders = empSheetData[0];
      var empLocationColIdx = 2; // Default
      for (var h = 0; h < empHeaders.length; h++) {
        if (String(empHeaders[h]).toLowerCase().trim() === 'location') {
          empLocationColIdx = h;
          break;
        }
      }

      for (var ei = 1; ei < empSheetData.length; ei++) {
        var empName = (empSheetData[ei][0] || '').toString().trim();
        var empLocation = (empSheetData[ei][empLocationColIdx] || '').toString().trim().toLowerCase();

        // If the employee is on the Employees sheet and their location is NOT "Previous Employee",
        // they are currently active
        if (empName && empLocation !== 'previous employee') {
          currentActiveEmployees.add(empName.toLowerCase());
        }
      }
    }
    Logger.log('Found ' + currentActiveEmployees.size + ' current active employees');

    // Build set of Previous Employee names from Employee History sheet
    // Only include employees who are NOT currently active on the Employees sheet
    var previousEmployeeNames = new Set();
    var employeeHistorySheet = ss.getSheetByName('Employee History');
    if (employeeHistorySheet && employeeHistorySheet.getLastRow() > 2) {
      var historyData = employeeHistorySheet.getRange(3, 1, employeeHistorySheet.getLastRow() - 2, 10).getValues();

      // Build a map of employee name -> most recent history entry
      var employeeLatestEntry = {};
      for (var hi = 0; hi < historyData.length; hi++) {
        var histName = (historyData[hi][1] || '').toString().trim();
        var histDate = historyData[hi][0];  // Date column
        var histLocation = (historyData[hi][3] || '').toString().trim();
        var histEventType = (historyData[hi][2] || '').toString().trim();

        if (!histName) continue;

        var histNameLower = histName.toLowerCase();
        var entryDate = histDate instanceof Date ? histDate : new Date(histDate);

        // Track the most recent entry for each employee
        if (!employeeLatestEntry[histNameLower] ||
            (entryDate instanceof Date && !isNaN(entryDate) &&
             entryDate > employeeLatestEntry[histNameLower].date)) {
          employeeLatestEntry[histNameLower] = {
            date: entryDate,
            location: histLocation,
            eventType: histEventType
          };
        }
      }

      // Now only add employees whose most recent entry has Location = "Previous Employee"
      // or eventType = "Terminated", AND who are NOT currently active
      for (var empNameKey in employeeLatestEntry) {
        // SKIP if this employee is currently active on the Employees sheet
        if (currentActiveEmployees.has(empNameKey)) {
          continue;
        }

        var latestEntry = employeeLatestEntry[empNameKey];
        var latestLocationLower = (latestEntry.location || '').toLowerCase();
        var latestEventTypeLower = (latestEntry.eventType || '').toLowerCase();

        if (latestLocationLower === 'previous employee' || latestEventTypeLower === 'terminated') {
          // Also check that they haven't been rehired (no "Rehired" event after the Terminated)
          if (latestEventTypeLower !== 'rehired') {
            previousEmployeeNames.add(empNameKey);
          }
        }
      }

      Logger.log('Found ' + previousEmployeeNames.size + ' previous employees from Employee History');
    }

    // Collect items for each table - do this FIRST to get counts
    var prevEmpItems = [];
    var class3Reclaims = [];
    var class2Reclaims = [];

    // FIRST PASS: Collect Previous Employee items to get accurate count
    glovesData.forEach(function(row) {
      var itemNum = row[0];
      // Skip rows without a valid item number
      if (!itemNum || itemNum === '' || itemNum === null) return;

      var location = (row[5] || '').toString().trim();
      var assignedTo = (row[7] || '').toString().trim();
      var locationLower = location.toLowerCase();
      var assignedToLower = assignedTo.toLowerCase();

      if (locationLower === 'previous employee' || previousEmployeeNames.has(assignedToLower)) {
        if (assignedTo && assignedToLower !== 'on shelf' && assignedToLower !== 'in testing' &&
            assignedToLower !== 'packed for delivery' && assignedToLower !== 'packed for testing') {
          prevEmpItems.push(['Glove', row[0], row[1], row[2], location, row[6], assignedTo, row[4]]);
        }
      }
    });

    sleevesData.forEach(function(row) {
      var itemNum = row[0];
      // Skip rows without a valid item number
      if (!itemNum || itemNum === '' || itemNum === null) return;

      var location = (row[5] || '').toString().trim();
      var assignedTo = (row[7] || '').toString().trim();
      var locationLower = location.toLowerCase();
      var assignedToLower = assignedTo.toLowerCase();

      if (locationLower === 'previous employee' || previousEmployeeNames.has(assignedToLower)) {
        if (assignedTo && assignedToLower !== 'on shelf' && assignedToLower !== 'in testing' &&
            assignedToLower !== 'packed for delivery' && assignedToLower !== 'packed for testing') {
          prevEmpItems.push(['Sleeve', row[0], row[1], row[2], location, row[6], assignedTo, row[4]]);
        }
      }
    });

    Logger.log('Found ' + prevEmpItems.length + ' Previous Employee items');

    // Re-setup the sheet structure, passing savedApprovals AND prevEmpCount to allocate correct space
    setupReclaimsSheet(reclaimsSheet, savedApprovals, prevEmpItems.length);

    // Re-read the sheet to find table positions and get current approvals
    var newSheetData = reclaimsSheet.getDataRange().getValues();

    // Build location approval map from the rebuilt sheet
    var locationApprovals = {};
    var inLocTable = false;
    for (var r = 0; r < newSheetData.length; r++) {
      var cellVal = (newSheetData[r][0] || '').toString();

      if (cellVal.indexOf('Class Location Approvals') !== -1 || cellVal.indexOf('Approved Class 3 Locations') !== -1) {
        inLocTable = true;
        continue;
      }
      if (inLocTable && (!cellVal || cellVal === '')) {
        inLocTable = false;
        continue;
      }

      if (inLocTable && cellVal && cellVal !== 'Location') {
        var approvalVal = (newSheetData[r][1] || '').toString().trim();
        if (approvalVal) {
          locationApprovals[cellVal] = approvalVal;
        }
      }
    }


    // Get employee data for preferred sizes
    var employeeMap = {};
    if (employeesSheet && employeesSheet.getLastRow() > 1) {
      var empData = employeesSheet.getDataRange().getValues();
      var empHeaders = empData[0];
      var gloveSizeColIdx = 8;  // Column I
      var sleeveSizeColIdx = 9;  // Column J

      // Find size columns dynamically
      for (var h = 0; h < empHeaders.length; h++) {
        var header = String(empHeaders[h]).toLowerCase().trim();
        if (header === 'glove size') gloveSizeColIdx = h;
        if (header === 'sleeve size') sleeveSizeColIdx = h;
      }

      for (var e = 1; e < empData.length; e++) {
        var empName = (empData[e][0] || '').toString().trim().toLowerCase();
        if (empName) {
          employeeMap[empName] = {
            gloveSize: empData[e][gloveSizeColIdx],
            sleeveSize: empData[e][sleeveSizeColIdx]
          };
        }
      }
    }

    // Process Gloves for Class 2/3 reclaims (Previous Employee items already collected above)
    glovesData.forEach(function(row) {
      var itemNum = row[0];
      var size = row[1];
      var itemClass = row[2];
      var dateAssigned = row[4];
      var location = (row[5] || '').toString().trim();
      var status = (row[6] || '').toString().trim();
      var assignedTo = (row[7] || '').toString().trim();
      var locationLower = location.toLowerCase();
      var assignedToLower = assignedTo.toLowerCase();

      // Skip Previous Employee items - already collected above
      if (locationLower === 'previous employee' || previousEmployeeNames.has(assignedToLower)) {
        return;
      }

      // Skip non-assigned items and ignored locations for Class reclaims
      var skipStatuses = ['on shelf', 'failed rubber', 'lost', 'ready for test', 'ready for testing',
                          'packed for testing', 'packed for delivery', 'in testing', 'ready for delivery'];
      if (skipStatuses.indexOf(status.toLowerCase()) !== -1) {
        return;
      }

      if (ignoreLocations.indexOf(locationLower) !== -1) {
        return;
      }

      var approvalStatus = locationApprovals[location] || '';
      var itemClassNum = parseInt(itemClass, 10) || 0;

      // Get employee's preferred glove size
      var empKey = assignedToLower;
      var preferredSize = employeeMap[empKey] ? employeeMap[empKey].gloveSize : size;

      if (approvalStatus === 'None') {
        if (itemClassNum === 3) {
          class3Reclaims.push({
            employee: assignedTo, itemType: 'Glove', itemNum: itemNum, size: size,
            itemClass: itemClass, location: location, assignedTo: assignedTo,
            preferredSize: preferredSize, classNum: itemClassNum
          });
        }
        if (itemClassNum === 2) {
          class2Reclaims.push({
            employee: assignedTo, itemType: 'Glove', itemNum: itemNum, size: size,
            itemClass: itemClass, location: location, assignedTo: assignedTo,
            preferredSize: preferredSize, classNum: itemClassNum
          });
        }
        return;
      }

      if (itemClassNum === 3) {
        if (approvalStatus === '' || approvalStatus === 'CL2') {
          class3Reclaims.push({
            employee: assignedTo, itemType: 'Glove', itemNum: itemNum, size: size,
            itemClass: itemClass, location: location, assignedTo: assignedTo,
            preferredSize: preferredSize, classNum: itemClassNum
          });
        }
      }

      if (itemClassNum === 2) {
        if (approvalStatus === 'CL3') {
          class2Reclaims.push({
            employee: assignedTo, itemType: 'Glove', itemNum: itemNum, size: size,
            itemClass: itemClass, location: location, assignedTo: assignedTo,
            preferredSize: preferredSize, classNum: itemClassNum
          });
        }
      }
    });

    // Process Sleeves for Class 2/3 reclaims (Previous Employee items already collected above)
    sleevesData.forEach(function(row) {
      var itemNum = row[0];
      var size = row[1];
      var itemClass = row[2];
      var dateAssigned = row[4];
      var location = (row[5] || '').toString().trim();
      var status = (row[6] || '').toString().trim();
      var assignedTo = (row[7] || '').toString().trim();
      var locationLower = location.toLowerCase();
      var assignedToLower = assignedTo.toLowerCase();

      // Skip Previous Employee items - already collected above
      if (locationLower === 'previous employee' || previousEmployeeNames.has(assignedToLower)) {
        return;
      }

      var skipStatuses = ['on shelf', 'failed rubber', 'lost', 'ready for test',
                          'packed for testing', 'packed for delivery', 'in testing', 'ready for delivery'];
      if (skipStatuses.indexOf(status.toLowerCase()) !== -1) {
        return;
      }

      if (ignoreLocations.indexOf(locationLower) !== -1) {
        return;
      }

      var approvalStatus = locationApprovals[location] || '';
      var itemClassNum = parseInt(itemClass, 10) || 0;

      var empKey = assignedToLower;
      var preferredSize = employeeMap[empKey] ? employeeMap[empKey].sleeveSize : size;

      if (approvalStatus === 'None') {
        if (itemClassNum === 3) {
          class3Reclaims.push({
            employee: assignedTo, itemType: 'Sleeve', itemNum: itemNum, size: size,
            itemClass: itemClass, location: location, assignedTo: assignedTo,
            preferredSize: preferredSize, classNum: itemClassNum
          });
        }
        if (itemClassNum === 2) {
          class2Reclaims.push({
            employee: assignedTo, itemType: 'Sleeve', itemNum: itemNum, size: size,
            itemClass: itemClass, location: location, assignedTo: assignedTo,
            preferredSize: preferredSize, classNum: itemClassNum
          });
        }
        return;
      }

      if (itemClassNum === 3) {
        if (approvalStatus === '' || approvalStatus === 'CL2') {
          class3Reclaims.push({
            employee: assignedTo, itemType: 'Sleeve', itemNum: itemNum, size: size,
            itemClass: itemClass, location: location, assignedTo: assignedTo,
            preferredSize: preferredSize, classNum: itemClassNum
          });
        }
      }

      if (itemClassNum === 2) {
        if (approvalStatus === 'CL3') {
          class2Reclaims.push({
            employee: assignedTo, itemType: 'Sleeve', itemNum: itemNum, size: size,
            itemClass: itemClass, location: location, assignedTo: assignedTo,
            preferredSize: preferredSize, classNum: itemClassNum
          });
        }
      }
    });

    // Sort reclaims by location, then by employee name (for weekly planning)
    class3Reclaims.sort(function(a, b) {
      var locCompare = (a.location || '').localeCompare(b.location || '');
      if (locCompare !== 0) return locCompare;
      return (a.employee || '').localeCompare(b.employee || '');
    });
    class2Reclaims.sort(function(a, b) {
      var locCompare = (a.location || '').localeCompare(b.location || '');
      if (locCompare !== 0) return locCompare;
      return (a.employee || '').localeCompare(b.employee || '');
    });

    // Generate Pick List for reclaims (respects swap assignments)
    var reclaimAssignedItems = new Set(swapAssignedItems);  // Start with swap-assigned items

    // Process Class 3 reclaims for Pick List (need DOWNGRADE to Class 2)
    class3Reclaims.forEach(function(reclaim) {
      var inventoryToSearch = reclaim.itemType === 'Glove' ? glovesData : sleevesData;
      var pickResult = findReclaimPickListItem(
        inventoryToSearch, reclaim, reclaimAssignedItems, 'class3', inventoryToSearch
      );
      reclaim.pickListNum = pickResult.itemNum;
      reclaim.pickListStatus = pickResult.status;
      if (pickResult.itemNum !== '—') {
        reclaimAssignedItems.add(pickResult.itemNum);
      }
    });

    // Process Class 2 reclaims for Pick List (need UPGRADE to Class 3)
    class2Reclaims.forEach(function(reclaim) {
      var inventoryToSearch = reclaim.itemType === 'Glove' ? glovesData : sleevesData;
      var pickResult = findReclaimPickListItem(
        inventoryToSearch, reclaim, reclaimAssignedItems, 'class2', inventoryToSearch
      );
      reclaim.pickListNum = pickResult.itemNum;
      reclaim.pickListStatus = pickResult.status;
      if (pickResult.itemNum !== '—') {
        reclaimAssignedItems.add(pickResult.itemNum);
      }
    });

    // Write Previous Employee data (row 3 = after title and headers)
    if (prevEmpItems.length > 0) {
      // Clear any data validation on these rows first (in case of overlap with previous structure)
      var prevEmpRange = reclaimsSheet.getRange(3, 1, prevEmpItems.length, 8);
      prevEmpRange.clearDataValidations();
      prevEmpRange.setValues(prevEmpItems);
    }

    // Find where to start Class 3 table (after Approved Locations table)
    var sheetLastRow = reclaimsSheet.getLastRow();
    var currentRow = sheetLastRow + 2;

    // --- Create Class 3 Reclaims Table ---
    var reclaimsHeaders = ['Employee', 'Item Type', 'Item #', 'Size', 'Class', 'Location', 'Pick List Item #', 'Pick List Status'];

    reclaimsSheet.getRange(currentRow, 1, 1, 8).merge()
      .setValue('⚠️ Class 3 Reclaims - Need Downgrade to Class 2')
      .setFontWeight('bold').setFontSize(14).setBackground('#bbdefb').setHorizontalAlignment('center');
    currentRow++;

    reclaimsSheet.getRange(currentRow, 1, 1, reclaimsHeaders.length).setValues([reclaimsHeaders])
      .setFontWeight('bold').setBackground('#90caf9').setHorizontalAlignment('center');
    currentRow++;

    if (class3Reclaims.length > 0) {
      var class3Data = class3Reclaims.map(function(r) {
        return [r.employee, r.itemType, r.itemNum, r.size, r.itemClass, r.location,
                r.pickListNum || '—', r.pickListStatus || 'Need to Purchase ❌'];
      });
      reclaimsSheet.getRange(currentRow, 1, class3Data.length, 8).setValues(class3Data);
      reclaimsSheet.getRange(currentRow, 1, class3Data.length, 8).setHorizontalAlignment('center');

      // Apply conditional formatting to Pick List Status column
      for (var ci = 0; ci < class3Data.length; ci++) {
        var statusCell = reclaimsSheet.getRange(currentRow + ci, 8);
        var statusVal = class3Data[ci][7];
        if (statusVal.indexOf('Reclaim Only') !== -1) {
          statusCell.setBackground('#c8e6c9');  // Green for reclaim only
        } else if (statusVal.indexOf('In Stock') !== -1) {
          statusCell.setBackground('#c8e6c9');
        } else if (statusVal.indexOf('Need to Purchase') !== -1) {
          statusCell.setBackground('#ffcdd2');
        } else if (statusVal.indexOf('Ready For Delivery') !== -1) {
          statusCell.setBackground('#e1bee7');
        } else if (statusVal.indexOf('In Testing') !== -1) {
          statusCell.setBackground('#fff9c4');
        }
      }

      currentRow += class3Data.length;
    } else {
      reclaimsSheet.getRange(currentRow, 1, 1, 8).merge()
        .setValue('✅ No Class 3 reclaims needed')
        .setFontStyle('italic').setHorizontalAlignment('center').setBackground('#c8e6c9');
      currentRow++;
    }

    currentRow += 2;

    // --- Create Class 2 Reclaims Table ---
    reclaimsSheet.getRange(currentRow, 1, 1, 8).merge()
      .setValue('⚠️ Class 2 Reclaims - Need Upgrade to Class 3')
      .setFontWeight('bold').setFontSize(14).setBackground('#ffe0b2').setHorizontalAlignment('center');
    currentRow++;

    reclaimsSheet.getRange(currentRow, 1, 1, reclaimsHeaders.length).setValues([reclaimsHeaders])
      .setFontWeight('bold').setBackground('#ffcc80').setHorizontalAlignment('center');
    currentRow++;

    if (class2Reclaims.length > 0) {
      var class2Data = class2Reclaims.map(function(r) {
        return [r.employee, r.itemType, r.itemNum, r.size, r.itemClass, r.location,
                r.pickListNum || '—', r.pickListStatus || 'Need to Purchase ❌'];
      });
      reclaimsSheet.getRange(currentRow, 1, class2Data.length, 8).setValues(class2Data);
      reclaimsSheet.getRange(currentRow, 1, class2Data.length, 8).setHorizontalAlignment('center');

      // Apply conditional formatting to Pick List Status column
      for (var cj = 0; cj < class2Data.length; cj++) {
        var statusCell2 = reclaimsSheet.getRange(currentRow + cj, 8);
        var statusVal2 = class2Data[cj][7];
        if (statusVal2.indexOf('Reclaim Only') !== -1) {
          statusCell2.setBackground('#c8e6c9');
        } else if (statusVal2.indexOf('In Stock') !== -1) {
          statusCell2.setBackground('#c8e6c9');
        } else if (statusVal2.indexOf('Need to Purchase') !== -1) {
          statusCell2.setBackground('#ffcdd2');
        } else if (statusVal2.indexOf('Ready For Delivery') !== -1) {
          statusCell2.setBackground('#e1bee7');
        } else if (statusVal2.indexOf('In Testing') !== -1) {
          statusCell2.setBackground('#fff9c4');
        }
      }

      currentRow += class2Data.length;
    } else {
      reclaimsSheet.getRange(currentRow, 1, 1, 8).merge()
        .setValue('✅ No Class 2 reclaims needed')
        .setFontStyle('italic').setHorizontalAlignment('center').setBackground('#c8e6c9');
      currentRow++;
    }

    currentRow += 2;

    // --- Create Lost Items - Need to Locate Table ---
    var lostItems = [];

    function hasLostLocateMarker(notesValue) {
      if (!notesValue) return false;
      var notes = notesValue.toString().trim().toUpperCase();
      return notes.indexOf('LOST-LOCATE') !== -1 ||
             notes.indexOf('LOST LOCATE') !== -1 ||
             notes === 'LOCATE';
    }

    // Scan Gloves
    glovesData.forEach(function(row) {
      var notes = row[10];  // Column K - Notes
      if (hasLostLocateMarker(notes)) {
        lostItems.push(['Glove', row[0], row[1], row[2], row[5], row[7], row[4], row[10]]);
      }
    });

    // Scan Sleeves
    sleevesData.forEach(function(row) {
      var notes = row[10];
      if (hasLostLocateMarker(notes)) {
        lostItems.push(['Sleeve', row[0], row[1], row[2], row[5], row[7], row[4], row[10]]);
      }
    });

    // Write Lost Items table
    reclaimsSheet.getRange(currentRow, 1, 1, 8).merge()
      .setValue('🔍 Lost Items - Need to Locate')
      .setFontWeight('bold').setFontSize(14).setBackground('#ffccbc').setHorizontalAlignment('center');
    currentRow++;

    var lostItemsHeaders = ['Item Type', 'Item #', 'Size', 'Class', 'Last Location', 'Last Assigned To', 'Date Assigned', 'Notes'];
    reclaimsSheet.getRange(currentRow, 1, 1, lostItemsHeaders.length).setValues([lostItemsHeaders])
      .setFontWeight('bold').setBackground('#ffab91').setHorizontalAlignment('center');
    currentRow++;

    if (lostItems.length > 0) {
      reclaimsSheet.getRange(currentRow, 1, lostItems.length, 8).setValues(lostItems);
      reclaimsSheet.getRange(currentRow, 1, lostItems.length, 8).setBackground('#fff3e0');
    } else {
      reclaimsSheet.getRange(currentRow, 1, 1, 8).merge()
        .setValue('✅ No items marked as LOST-LOCATE')
        .setFontStyle('italic').setHorizontalAlignment('center').setBackground('#c8e6c9');
    }

    // Auto-resize columns to fit content
    for (var col = 1; col <= 8; col++) {
      reclaimsSheet.autoResizeColumn(col);
    }

    Logger.log('Reclaims sheet updated - Previous Employee: ' + prevEmpItems.length +
               ', Class 3 Reclaims: ' + class3Reclaims.length +
               ', Class 2 Reclaims: ' + class2Reclaims.length +
               ', Lost Items: ' + lostItems.length);

  } catch (e) {
    Logger.log('[ERROR] updateReclaimsSheet: ' + e);
    SpreadsheetApp.getUi().alert('Error updating Reclaims sheet: ' + e);
  }
}

/**
 * Archives employees with "Previous Employee" location to the Employee History sheet.
 * Searches the Employees sheet for all rows where Location = "Previous Employee",
 * adds a "Terminated" entry to Employee History (if not already present), and
 * optionally removes them from the Employees sheet.
 */
function archivePreviousEmployees() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var ui = SpreadsheetApp.getUi();
  var employeesSheet = ss.getSheetByName(SHEET_EMPLOYEES);
  var historySheet = ss.getSheetByName('Employee History');

  if (!employeesSheet) {
    ui.alert('❌ Error', 'Employees sheet not found.', ui.ButtonSet.OK);
    return;
  }

  if (!historySheet) {
    historySheet = ss.insertSheet('Employee History');
    setupEmployeeHistorySheet(historySheet);
  }

  var empData = employeesSheet.getDataRange().getValues();
  var empHeaders = empData[0];

  // Find column indices dynamically
  var nameColIdx = 0;
  var locationColIdx = -1;
  var jobNumberColIdx = -1;
  var hireDateColIdx = -1;
  var lastDayColIdx = -1;
  var lastDayReasonColIdx = -1;

  for (var h = 0; h < empHeaders.length; h++) {
    var header = String(empHeaders[h]).toLowerCase().trim();
    if (header === 'location') locationColIdx = h;
    if (header === 'job number') jobNumberColIdx = h;
    if (header === 'hire date') hireDateColIdx = h;
    if (header === 'last day') lastDayColIdx = h;
    if (header === 'last day reason') lastDayReasonColIdx = h;
  }

  if (locationColIdx === -1) {
    ui.alert('❌ Error', 'Location column not found in Employees sheet.', ui.ButtonSet.OK);
    return;
  }

  // Find all Previous Employee rows
  var previousEmployees = [];
  for (var i = 1; i < empData.length; i++) {
    var location = (empData[i][locationColIdx] || '').toString().trim().toLowerCase();
    if (location === 'previous employee') {
      previousEmployees.push({
        row: i + 1,  // 1-based row number
        name: empData[i][nameColIdx] || '',
        location: empData[i][locationColIdx] || '',
        jobNumber: jobNumberColIdx !== -1 ? empData[i][jobNumberColIdx] : '',
        hireDate: hireDateColIdx !== -1 ? empData[i][hireDateColIdx] : '',
        lastDay: lastDayColIdx !== -1 ? empData[i][lastDayColIdx] : '',
        lastDayReason: lastDayReasonColIdx !== -1 ? empData[i][lastDayReasonColIdx] : ''
      });
    }
  }

  if (previousEmployees.length === 0) {
    ui.alert('ℹ️ No Previous Employees', 'No employees found with Location = "Previous Employee".', ui.ButtonSet.OK);
    return;
  }

  // Ask user what to do
  var response = ui.alert(
    '📤 Archive Previous Employees',
    'Found ' + previousEmployees.length + ' employee(s) with Location = "Previous Employee".\n\n' +
    'This will:\n' +
    '1. Add "Terminated" entries to Employee History (if not already present)\n\n' +
    'Do you want to proceed?',
    ui.ButtonSet.YES_NO
  );

  if (response !== ui.Button.YES) {
    return;
  }

  var today = new Date();
  var todayStr = Utilities.formatDate(today, ss.getSpreadsheetTimeZone(), 'MM/dd/yyyy');
  var archived = 0;
  var skipped = 0;

  // Build map of existing terminated entries to avoid duplicates
  var existingTerminated = {};
  if (historySheet.getLastRow() > 2) {
    var historyData = historySheet.getRange(3, 1, historySheet.getLastRow() - 2, 10).getValues();
    for (var j = 0; j < historyData.length; j++) {
      var histName = (historyData[j][1] || '').toString().trim().toLowerCase();
      var histEventType = (historyData[j][2] || '').toString().trim().toLowerCase();
      if (histEventType === 'terminated') {
        existingTerminated[histName] = true;
      }
    }
  }

  // Track rows to delete (we'll delete in reverse order to preserve row numbers)
  var rowsToDelete = [];

  // Add to Employee History
  for (var k = 0; k < previousEmployees.length; k++) {
    var emp = previousEmployees[k];
    var empNameLower = emp.name.toString().trim().toLowerCase();

    // Track the row for deletion regardless of whether we archive
    rowsToDelete.push(emp.row);

    // Skip adding to history if already has a Terminated entry
    if (existingTerminated[empNameLower]) {
      skipped++;
      continue;
    }

    // Format Last Day date if present
    var lastDayStr = '';
    if (emp.lastDay) {
      if (emp.lastDay instanceof Date) {
        lastDayStr = Utilities.formatDate(emp.lastDay, ss.getSpreadsheetTimeZone(), 'MM/dd/yyyy');
      } else {
        lastDayStr = emp.lastDay.toString();
      }
    }

    // Format Hire Date if available
    var hireDateStr = '';
    if (emp.hireDate) {
      if (emp.hireDate instanceof Date) {
        hireDateStr = Utilities.formatDate(emp.hireDate, ss.getSpreadsheetTimeZone(), 'MM/dd/yyyy');
      } else {
        hireDateStr = emp.hireDate.toString();
      }
    }

    // Add history entry - format with Rehire Date column
    var historyRow = [
      lastDayStr || todayStr,  // Date (event date)
      emp.name,                // Employee Name
      'Terminated',            // Event Type
      'Previous Employee',     // Location
      emp.jobNumber,           // Job Number
      hireDateStr,             // Hire Date
      lastDayStr,              // Last Day
      emp.lastDayReason || '', // Last Day Reason
      '',                      // Rehire Date (empty)
      'Archived via Utilities menu'  // Notes
    ];
    historySheet.appendRow(historyRow);
    archived++;
  }

  // Delete rows from Employees sheet (in reverse order to preserve row numbers)
  rowsToDelete.sort(function(a, b) { return b - a; }); // Sort descending
  for (var d = 0; d < rowsToDelete.length; d++) {
    employeesSheet.deleteRow(rowsToDelete[d]);
  }

  // Show results
  var message = '✅ Archive Complete!\n\n';
  message += '📝 Archived to History: ' + archived + ' employee(s)\n';
  if (skipped > 0) {
    message += '⏭️ Already in history: ' + skipped + ' employee(s)\n';
  }
  message += '🗑️ Removed from Employees sheet: ' + rowsToDelete.length + ' employee(s)';

  ui.alert('Archive Results', message, ui.ButtonSet.OK);

  logEvent('archivePreviousEmployees: Archived ' + archived + ', Skipped ' + skipped + ', Removed ' + rowsToDelete.length, 'INFO');
}

// ============================================================================
// BACKUP SNAPSHOT FUNCTIONS
// ============================================================================

/**
 * Creates a backup snapshot of the entire workbook.
 * Saves a copy to a "Glove Manager Backups" folder in Google Drive with timestamp.
 */
function createBackupSnapshot() {
  var ui = SpreadsheetApp.getUi();

  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var ssName = ss.getName();

    // Create timestamp for the backup name
    var now = new Date();
    var timestamp = Utilities.formatDate(now, ss.getSpreadsheetTimeZone(), 'yyyy-MM-dd_HH-mm-ss');
    var backupName = ssName + ' - Backup ' + timestamp;

    // Show progress message
    ui.alert('Creating Backup', 'Creating backup snapshot...\nThis may take a moment.', ui.ButtonSet.OK);

    // Get or create the backup folder
    var backupFolder = getOrCreateBackupFolder();

    // Make a copy of the spreadsheet
    var backupFile = DriveApp.getFileById(ss.getId()).makeCopy(backupName, backupFolder);

    // Get the backup URL
    var backupUrl = backupFile.getUrl();

    // Log the backup
    logEvent('Backup created: ' + backupName, 'INFO');

    // Show success message with link
    var htmlOutput = HtmlService
      .createHtmlOutput(
        '<div style="font-family: Arial, sans-serif; padding: 20px;">' +
        '<h2 style="color: #2e7d32;">✅ Backup Created Successfully!</h2>' +
        '<p><strong>Name:</strong> ' + backupName + '</p>' +
        '<p><strong>Location:</strong> Google Drive > ' + BACKUP_FOLDER_NAME + '</p>' +
        '<p><strong>Time:</strong> ' + Utilities.formatDate(now, ss.getSpreadsheetTimeZone(), 'MM/dd/yyyy hh:mm:ss a') + '</p>' +
        '<br>' +
        '<a href="' + backupUrl + '" target="_blank" style="background-color: #1a73e8; color: white; padding: 10px 20px; text-decoration: none; border-radius: 4px;">Open Backup</a>' +
        '&nbsp;&nbsp;' +
        '<a href="' + backupFolder.getUrl() + '" target="_blank" style="background-color: #5f6368; color: white; padding: 10px 20px; text-decoration: none; border-radius: 4px;">View All Backups</a>' +
        '</div>'
      )
      .setWidth(450)
      .setHeight(250);

    ui.showModalDialog(htmlOutput, 'Backup Complete');

    return backupFile;

  } catch (e) {
    logEvent('Backup failed: ' + e, 'ERROR');
    ui.alert('❌ Backup Failed', 'Error creating backup: ' + e.message, ui.ButtonSet.OK);
    return null;
  }
}

/**
 * Gets the backup folder, creating it if it doesn't exist.
 * @return {Folder} The backup folder
 */
function getOrCreateBackupFolder() {
  var folders = DriveApp.getFoldersByName(BACKUP_FOLDER_NAME);

  if (folders.hasNext()) {
    return folders.next();
  } else {
    // Create the folder
    var newFolder = DriveApp.createFolder(BACKUP_FOLDER_NAME);
    Logger.log('Created backup folder: ' + BACKUP_FOLDER_NAME);
    return newFolder;
  }
}

/**
 * Opens the backup folder in a new tab.
 */
function openBackupFolder() {
  var ui = SpreadsheetApp.getUi();

  try {
    var backupFolder = getOrCreateBackupFolder();
    var folderUrl = backupFolder.getUrl();

    var htmlOutput = HtmlService
      .createHtmlOutput(
        '<script>window.open("' + folderUrl + '", "_blank");google.script.host.close();</script>' +
        '<p>Opening backup folder...</p>' +
        '<p>If the folder does not open, <a href="' + folderUrl + '" target="_blank">click here</a>.</p>'
      )
      .setWidth(300)
      .setHeight(100);

    ui.showModalDialog(htmlOutput, 'Opening Backup Folder');

  } catch (e) {
    ui.alert('❌ Error', 'Could not open backup folder: ' + e.message, ui.ButtonSet.OK);
  }
}

// NOTE: listBackups() and formatFileSize() were removed during refactoring (Jan 2026)
// They were never called from the menu or elsewhere in the code

/**
 * Extracts the significant portion of a job number for comparison.
 * Only tracks changes to the ###-## or ###.## portion, not the .# suffix.
 * Examples:
 *   - "002-26.1" → "002-26"
 *   - "005-26.2" → "005-26"
 *   - "123.45.6" → "123.45"
 *   - "ABC-123" → "ABC-123"
 * @param {string} jobNumber - The full job number
 * @return {string} The significant portion for tracking
 */
function getSignificantJobNumber(jobNumber) {
  if (!jobNumber) return '';
  var jobStr = String(jobNumber).trim();

  // Pattern: Match ###-## or ###.## followed by optional .# or -# suffix
  // We want to capture just the first two parts
  var pattern = new RegExp('^([A-Za-z0-9]+[-\\.][A-Za-z0-9]+)(?:[-\\.]\\d+)?$');
  var match = jobStr.match(pattern);
  if (match && match[1]) {
    return match[1];
  }

  // If no match, return original (handles simple job numbers)
  return jobStr;
}

/**
 * Formats a date value for Employee History entries.
 * @param {Date|string} dateValue - The date to format
 * @return {string} Formatted date string (MM/dd/yyyy)
 */
function formatDateForHistory(dateValue) {
  if (!dateValue) return '';
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var tz = ss.getSpreadsheetTimeZone();

    if (dateValue instanceof Date) {
      return Utilities.formatDate(dateValue, tz, 'MM/dd/yyyy');
    }

    var d = new Date(dateValue);
    if (!isNaN(d.getTime())) {
      return Utilities.formatDate(d, tz, 'MM/dd/yyyy');
    }

    return String(dateValue);
  } catch (e) {
    return String(dateValue);
  }
}

/**
 * Tracks employee location and job number changes in Employee History.
 * Called when editing Location or Job Number columns on the Employees sheet.
 * Only logs job number changes when the significant portion changes (###.## not ###.##.#)
 * @param {Spreadsheet} ss - The active spreadsheet
 * @param {Sheet} sheet - The Employees sheet
 * @param {number} editedRow - Row that was edited
 * @param {number} editedCol - Column that was edited (1-based)
 * @param {string} newValue - The new value
 * @param {string} oldValue - The old value
 * @param {number} locationColIdx - Location column index (1-based)
 * @param {number} jobNumberColIdx - Job Number column index (1-based)
 */
function trackEmployeeChange(ss, sheet, editedRow, editedCol, newValue, oldValue, locationColIdx, jobNumberColIdx) {
  try {
    var rowData = sheet.getRange(editedRow, 1, 1, sheet.getLastColumn()).getValues()[0];
    var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];

    // Find column indices
    var nameColIdx = 0;
    var hireDateColIdx = -1;

    for (var h = 0; h < headers.length; h++) {
      var headerLower = String(headers[h]).toLowerCase().trim();
      if (headerLower === 'hire date') hireDateColIdx = h;
    }

    var employeeName = (rowData[nameColIdx] || '').toString().trim();
    if (!employeeName) return;

    // Skip if location is "Previous Employee"
    var currentLocation = locationColIdx > 0 ? (rowData[locationColIdx - 1] || '').toString().trim() : '';
    if (currentLocation.toLowerCase() === 'previous employee') return;

    var isLocationChange = (editedCol === locationColIdx);
    var isJobNumberChange = (editedCol === jobNumberColIdx);

    // For job number changes, only track if significant portion changed
    if (isJobNumberChange) {
      var oldSignificant = getSignificantJobNumber(oldValue);
      var newSignificant = getSignificantJobNumber(newValue);

      if (oldSignificant === newSignificant) {
        Logger.log('Job number change not significant: ' + oldValue + ' → ' + newValue + ' (both ' + oldSignificant + ')');
        return;
      }
    }

    // Get current values
    var location = locationColIdx > 0 ? (rowData[locationColIdx - 1] || '').toString().trim() : '';
    var jobNumber = jobNumberColIdx > 0 ? (rowData[jobNumberColIdx - 1] || '').toString().trim() : '';
    var hireDate = hireDateColIdx >= 0 ? rowData[hireDateColIdx] : '';

    var hireDateStr = formatDateForHistory(hireDate);
    var todayStr = formatDateForHistory(new Date());

    // Determine event type
    var eventType = isLocationChange ? 'Location Change' : 'Job Number Change';
    var changeNotes = 'Changed from: ' + (oldValue || '(empty)') + ' → ' + (newValue || '(empty)');

    // Get or create Employee History sheet
    var historySheet = ss.getSheetByName('Employee History');
    if (!historySheet) {
      historySheet = ss.insertSheet('Employee History');
      setupEmployeeHistorySheet(historySheet);
    }

    // First, ensure the employee has a "Current State" entry if they're new to history
    ensureEmployeeInHistory(historySheet, employeeName, oldValue, isLocationChange ? jobNumber : location, hireDateStr, isLocationChange);

    // Add change entry to Employee History (10 columns)
    var nextRow = historySheet.getLastRow() + 1;
    historySheet.getRange(nextRow, 1, 1, 10).setValues([[
      todayStr,           // A: Date
      employeeName,       // B: Employee Name
      eventType,          // C: Event Type
      location,           // D: Location (current)
      jobNumber,          // E: Job Number (current)
      hireDateStr,        // F: Hire Date
      '',                 // G: Last Day
      '',                 // H: Last Day Reason
      '',                 // I: Rehire Date
      changeNotes         // J: Notes
    ]]);

    Logger.log('Tracked ' + eventType + ' for ' + employeeName + ': ' + oldValue + ' → ' + newValue);

  } catch (e) {
    Logger.log('[ERROR] trackEmployeeChange: ' + e);
  }
}

/**
 * Ensures an employee has at least a "Current State" entry in Employee History.
 * Called before logging a change to make sure we have baseline data.
 * @param {Sheet} historySheet - The Employee History sheet
 * @param {string} employeeName - Employee's name
 * @param {string} previousValue - The value before the change (used as baseline)
 * @param {string} otherValue - The other field's current value (location or job number)
 * @param {string} hireDateStr - Formatted hire date
 * @param {boolean} isLocationChange - True if tracking a location change
 */
function ensureEmployeeInHistory(historySheet, employeeName, previousValue, otherValue, hireDateStr, isLocationChange) {
  if (!historySheet || !employeeName) return;

  // Check if employee already has any entry in history
  if (historySheet.getLastRow() > 2) {
    var existingData = historySheet.getRange(3, 2, historySheet.getLastRow() - 2, 1).getValues();
    for (var i = 0; i < existingData.length; i++) {
      var histName = String(existingData[i][0] || '').trim().toLowerCase();
      if (histName === employeeName.toLowerCase()) {
        return; // Already has history entry
      }
    }
  }

  // Add "Current State" entry with the PREVIOUS values (before the change)
  var todayStr = formatDateForHistory(new Date());
  var baseLocation = isLocationChange ? previousValue : otherValue;
  var baseJobNumber = isLocationChange ? otherValue : previousValue;

  var nextRow = historySheet.getLastRow() + 1;
  historySheet.getRange(nextRow, 1, 1, 10).setValues([[
    todayStr,           // A: Date
    employeeName,       // B: Employee Name
    'Current State',    // C: Event Type
    baseLocation || '', // D: Location (before change)
    baseJobNumber || '',// E: Job Number (before change)
    hireDateStr,        // F: Hire Date
    '',                 // G: Last Day
    '',                 // H: Last Day Reason
    '',                 // I: Rehire Date
    'Initial tracking entry (before first tracked change)'  // J: Notes
  ]]);

  Logger.log('Created Current State entry for ' + employeeName);
}

// ============================================================================
// EMPLOYEE HISTORY FUNCTIONS
// ============================================================================

/**
 * Handles changes to the Last Day column in the Employees sheet.
 * When a Last Day date is entered:
 * 1. Adds a "Terminated" entry to Employee History
 * 2. Changes Location to "Previous Employee"
 * 3. Removes the employee from the Employees sheet
 */
function handleLastDayChange(ss, sheet, editedRow, newValue) {
  // If Last Day is cleared, do nothing
  if (!newValue || newValue === '') return;

  try {
    var empData = sheet.getRange(editedRow, 1, 1, sheet.getLastColumn()).getValues()[0];
    var empHeaders = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];

    // Find column indices
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

    // Format dates
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

    // Get or create Employee History sheet
    var historySheet = ss.getSheetByName('Employee History');
    if (!historySheet) {
      historySheet = ss.insertSheet('Employee History');
      setupEmployeeHistorySheet(historySheet);
    }

    // Add "Terminated" entry to Employee History - format with Rehire Date column
    var historyRow = [
      lastDayStr,           // Date (event date)
      empName,              // Employee Name
      'Terminated',         // Event Type
      location,             // Location (last known)
      jobNumber,            // Job Number
      hireDateStr,          // Hire Date
      lastDayStr,           // Last Day
      lastDayReason,        // Last Day Reason
      '',                   // Rehire Date (empty for terminated)
      ''                    // Notes
    ];
    historySheet.appendRow(historyRow);

    // Update Location to "Previous Employee"
    if (locationColIdx !== -1) {
      sheet.getRange(editedRow, locationColIdx + 1).setValue('Previous Employee');
    }

    // Delete the employee row from Employees sheet after a short delay
    // This gives time for the history to be saved
    Utilities.sleep(500);
    sheet.deleteRow(editedRow);

    Logger.log('Employee "' + empName + '" terminated and moved to history');

  } catch (e) {
    Logger.log('[ERROR] handleLastDayChange: ' + e);
  }
}

/**
 * Handles changes to the Rehire Date column in the Employee History sheet.
 * When a Rehire Date is entered for a terminated employee:
 * 1. Prompts for new Location and Job Number
 * 2. Creates new row on Employees sheet
 * 3. Adds a "Rehired" entry to Employee History
 */
function handleRehireDateChange(ss, sheet, editedRow, newValue) {
  // If Rehire Date is cleared, do nothing
  if (!newValue || newValue === '') return;

  try {
    var ui = SpreadsheetApp.getUi();

    // Get the history row data
    var histHeaders = sheet.getRange(2, 1, 1, sheet.getLastColumn()).getValues()[0];
    var histData = sheet.getRange(editedRow, 1, 1, sheet.getLastColumn()).getValues()[0];

    // Find column indices
    var dateColIdx = 0;
    var nameColIdx = 1;
    var eventTypeColIdx = 2;
    var locationColIdx = 3;
    var jobNumberColIdx = 4;
    var hireDateColIdx = 5;
    var lastDayColIdx = 6;
    var lastDayReasonColIdx = 7;
    var rehireDateColIdx = 8;
    var notesColIdx = 9;

    // Find columns dynamically
    for (var h = 0; h < histHeaders.length; h++) {
      var header = String(histHeaders[h]).toLowerCase().trim();
      if (header === 'date') dateColIdx = h;
      if (header === 'employee name') nameColIdx = h;
      if (header === 'event type') eventTypeColIdx = h;
      if (header === 'location') locationColIdx = h;
      if (header === 'job number') jobNumberColIdx = h;
      if (header === 'hire date') hireDateColIdx = h;
      if (header === 'last day') lastDayColIdx = h;
      if (header === 'last day reason') lastDayReasonColIdx = h;
      if (header === 'rehire date') rehireDateColIdx = h;
      if (header === 'notes') notesColIdx = h;
    }

    var empName = histData[nameColIdx] || '';
    var eventType = (histData[eventTypeColIdx] || '').toString().trim();
    var originalHireDate = histData[hireDateColIdx] || '';

    // Only process if this was a Terminated employee
    if (eventType !== 'Terminated') {
      ui.alert('⚠️ Cannot Rehire', 'Rehire Date can only be added to Terminated employee entries.', ui.ButtonSet.OK);
      // Clear the rehire date
      sheet.getRange(editedRow, rehireDateColIdx + 1).setValue('');
      return;
    }

    // Check if employee already exists on Employees sheet
    var employeesSheet = ss.getSheetByName(SHEET_EMPLOYEES);
    if (employeesSheet) {
      var empSheetData = employeesSheet.getDataRange().getValues();
      for (var i = 1; i < empSheetData.length; i++) {
        var existingName = (empSheetData[i][0] || '').toString().trim().toLowerCase();
        if (existingName === empName.toLowerCase()) {
          ui.alert('⚠️ Employee Already Active',
            'An employee named "' + empName + '" already exists on the Employees sheet.\n\n' +
            'Please check if this is a duplicate or use a different name.',
            ui.ButtonSet.OK);
          // Clear the rehire date
          sheet.getRange(editedRow, rehireDateColIdx + 1).setValue('');
          return;
        }
      }
    }

    // Format rehire date
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

    // Prompt for new Location
    var locationResponse = ui.prompt(
      '📍 Enter New Location',
      'Employee: ' + empName + '\nRehire Date: ' + rehireDateStr + '\n\nEnter the new work location:',
      ui.ButtonSet.OK_CANCEL
    );

    if (locationResponse.getSelectedButton() !== ui.Button.OK) {
      // User cancelled - clear the rehire date
      sheet.getRange(editedRow, rehireDateColIdx + 1).setValue('');
      return;
    }

    var newLocation = locationResponse.getResponseText().trim();
    if (!newLocation) {
      ui.alert('❌ Error', 'Location is required. Rehire cancelled.', ui.ButtonSet.OK);
      sheet.getRange(editedRow, rehireDateColIdx + 1).setValue('');
      return;
    }

    // Prompt for new Job Number
    var jobNumberResponse = ui.prompt(
      '🔢 Enter Job Number',
      'Employee: ' + empName + '\nLocation: ' + newLocation + '\n\nEnter the job number (or leave blank):',
      ui.ButtonSet.OK_CANCEL
    );

    if (jobNumberResponse.getSelectedButton() !== ui.Button.OK) {
      // User cancelled - clear the rehire date
      sheet.getRange(editedRow, rehireDateColIdx + 1).setValue('');
      return;
    }

    var newJobNumber = jobNumberResponse.getResponseText().trim();

    // Get or create Employees sheet
    if (!employeesSheet) {
      employeesSheet = ss.insertSheet(SHEET_EMPLOYEES);
    }

    // Get Employees sheet headers to match columns
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

    // Create new employee row (empty array with correct number of columns)
    var newEmpRow = [];
    for (var c = 0; c < empHeaders.length; c++) {
      newEmpRow.push('');
    }

    // Fill in the values we have
    newEmpRow[empNameColIdx] = empName;
    if (empLocationColIdx !== -1) newEmpRow[empLocationColIdx] = newLocation;
    if (empJobNumberColIdx !== -1) newEmpRow[empJobNumberColIdx] = newJobNumber;
    if (empHireDateColIdx !== -1) {
      // Use rehire date as the new hire date
      newEmpRow[empHireDateColIdx] = rehireDateStr;
    }

    // Add the new employee row
    employeesSheet.appendRow(newEmpRow);

    // Add "Rehired" entry to Employee History
    var todayStr = Utilities.formatDate(new Date(), ss.getSpreadsheetTimeZone(), 'MM/dd/yyyy');
    var rehiredHistoryRow = [
      todayStr,             // Date (event date)
      empName,              // Employee Name
      'Rehired',            // Event Type
      newLocation,          // New Location
      newJobNumber,         // New Job Number
      originalHireDate,     // Original Hire Date (preserved)
      '',                   // Last Day (empty for active employee)
      '',                   // Last Day Reason (empty)
      rehireDateStr,        // Rehire Date
      'Rehired from Previous Employee'  // Notes
    ];
    sheet.appendRow(rehiredHistoryRow);

    // Show success message
    ui.alert('✅ Employee Rehired!',
      'Employee: ' + empName + '\n' +
      'Location: ' + newLocation + '\n' +
      'Job Number: ' + (newJobNumber || 'N/A') + '\n' +
      'Rehire Date: ' + rehireDateStr + '\n\n' +
      'The employee has been added back to the Employees sheet and a "Rehired" entry has been added to the history.',
      ui.ButtonSet.OK);

    Logger.log('Employee "' + empName + '" rehired to ' + newLocation);

  } catch (e) {
    Logger.log('[ERROR] handleRehireDateChange: ' + e);
    SpreadsheetApp.getUi().alert('❌ Error', 'Error processing rehire: ' + e.message, SpreadsheetApp.getUi().ButtonSet.OK);
  }
}

/**
 * Saves employee location and job number changes to Employee History.
 * Tracks every change in location and/or job number.
 * Called from saveHistory().
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

  // Find column indices
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

  // Get existing history entries to detect changes
  var historyData = [];
  if (historySheet.getLastRow() > 2) {
    historyData = historySheet.getRange(3, 1, historySheet.getLastRow() - 2, 10).getValues();
  }

  // Build map of last known state for each employee
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

  // Check each employee for changes
  for (var i = 1; i < empData.length; i++) {
    var name = (empData[i][nameColIdx] || '').toString().trim();
    if (!name) continue;

    var nameLower = name.toLowerCase();
    var currentLocation = locationColIdx !== -1 ? (empData[i][locationColIdx] || '').toString().trim() : '';
    var currentJobNumber = jobNumberColIdx !== -1 ? (empData[i][jobNumberColIdx] || '').toString().trim() : '';
    var hireDate = hireDateColIdx !== -1 ? empData[i][hireDateColIdx] : '';

    // Skip Previous Employee locations (already handled by handleLastDayChange)
    if (currentLocation.toLowerCase() === 'previous employee') continue;

    var last = lastKnownState[nameLower];

    // Format hire date if available
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

    // If no history exists for this employee, add initial "Current State" entry
    if (!last) {
      var eventType = 'Current State';
      // Format: Date, Name, Event Type, Location, Job Number, Hire Date, Last Day, Last Day Reason, Rehire Date, Notes
      historySheet.appendRow([todayStr, name, eventType, currentLocation, currentJobNumber, hireDateStr, '', '', '', '']);
      newEntries++;
      lastKnownState[nameLower] = { location: currentLocation, jobNumber: currentJobNumber };
      continue;
    }

    // Check for changes
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

      // Format: Date, Name, Event Type, Location, Job Number, Hire Date, Last Day, Last Day Reason, Rehire Date, Notes
      historySheet.appendRow([todayStr, name, changeType, currentLocation, currentJobNumber, hireDateStr, '', '', '', changeNotes]);
      newEntries++;

      // Update last known state
      lastKnownState[nameLower] = { location: currentLocation, jobNumber: currentJobNumber };
    }
  }

  return newEntries;
}

// ============================================================================
// RECLAIMS AUTO PICK LIST FUNCTIONS
// ============================================================================

/**
 * Gets all item numbers already assigned in Glove Swaps and Sleeve Swaps.
 * These items should not be assigned to reclaims (swap assignments take priority).
 * @param {Spreadsheet} ss - The active spreadsheet
 * @return {Set} Set of item numbers already assigned in swaps
 */
function getSwapAssignedItems(ss) {
  var assignedItems = new Set();

  // Check Glove Swaps
  var gloveSwapsSheet = ss.getSheetByName(SHEET_GLOVE_SWAPS);
  if (gloveSwapsSheet && gloveSwapsSheet.getLastRow() > 1) {
    var gloveSwapsData = gloveSwapsSheet.getDataRange().getValues();
    for (var i = 1; i < gloveSwapsData.length; i++) {
      var row = gloveSwapsData[i];
      var pickListItem = (row[6] || '').toString().trim();  // Column G = Pick List Item #

      // Skip header rows and location sub-headers
      var firstCell = (row[0] || '').toString().trim();
      if (!firstCell || firstCell.indexOf('Class') !== -1 || firstCell.indexOf('STAGE') !== -1 ||
          firstCell === 'Employee' || firstCell.indexOf('📍') !== -1) {
        continue;
      }

      if (pickListItem && pickListItem !== '—' && pickListItem !== '-') {
        assignedItems.add(pickListItem);
      }
    }
  }

  // Check Sleeve Swaps
  var sleeveSwapsSheet = ss.getSheetByName(SHEET_SLEEVE_SWAPS);
  if (sleeveSwapsSheet && sleeveSwapsSheet.getLastRow() > 1) {
    var sleeveSwapsData = sleeveSwapsSheet.getDataRange().getValues();
    for (var j = 1; j < sleeveSwapsData.length; j++) {
      var sRow = sleeveSwapsData[j];
      var sPickListItem = (sRow[6] || '').toString().trim();

      var sFirstCell = (sRow[0] || '').toString().trim();
      if (!sFirstCell || sFirstCell.indexOf('Class') !== -1 || sFirstCell.indexOf('STAGE') !== -1 ||
          sFirstCell === 'Employee' || sFirstCell.indexOf('📍') !== -1) {
        continue;
      }

      if (sPickListItem && sPickListItem !== '—' && sPickListItem !== '-') {
        assignedItems.add(sPickListItem);
      }
    }
  }

  // Also check Picked For column in Gloves and Sleeves sheets
  var glovesSheet = ss.getSheetByName(SHEET_GLOVES);
  if (glovesSheet && glovesSheet.getLastRow() > 1) {
    var glovesData = glovesSheet.getDataRange().getValues();
    for (var g = 1; g < glovesData.length; g++) {
      var pickedFor = (glovesData[g][9] || '').toString().trim();  // Column J = Picked For
      if (pickedFor) {
        assignedItems.add(glovesData[g][0].toString().trim());  // Item #
      }
    }
  }

  var sleevesSheet = ss.getSheetByName(SHEET_SLEEVES);
  if (sleevesSheet && sleevesSheet.getLastRow() > 1) {
    var sleevesData = sleevesSheet.getDataRange().getValues();
    for (var s = 1; s < sleevesData.length; s++) {
      var sPickedFor = (sleevesData[s][9] || '').toString().trim();
      if (sPickedFor) {
        assignedItems.add(sleevesData[s][0].toString().trim());
      }
    }
  }

  Logger.log('getSwapAssignedItems: Found ' + assignedItems.size + ' items already assigned in swaps');
  return assignedItems;
}

/**
 * Finds a suitable Pick List item for a reclaim.
 *
 * RECLAIM LOGIC:
 * - Class 3 Reclaims (employee has CL3 in non-approved location): Need DOWNGRADE to Class 2
 *   - BUT if employee already has a Class 2 item assigned, no pick list needed
 * - Class 2 Reclaims (employee has CL2 in CL3-only location): Need UPGRADE to Class 3
 *   - BUT if employee already has a Class 3 item assigned, no pick list needed
 *
 * @param {Array} inventoryData - The inventory data (gloves or sleeves)
 * @param {Object} reclaim - The reclaim object with employee, size, class info
 * @param {Set} assignedItems - Set of item numbers already assigned
 * @param {string} reclaimType - 'class3' for Class 3 Reclaims, 'class2' for Class 2 Reclaims
 * @param {Array} allInventoryData - Full inventory data to check for existing assignments
 * @return {Object} Object with itemNum and status
 */
function findReclaimPickListItem(inventoryData, reclaim, assignedItems, reclaimType, allInventoryData) {
  var result = { itemNum: '—', status: 'Need to Purchase ❌' };

  var isGlove = (reclaim.itemType === 'Glove');
  var employeeName = reclaim.employee.toString().trim().toLowerCase();

  // Determine the target class based on reclaim type
  var targetClass;
  if (reclaimType === 'class3') {
    // Class 3 Reclaims: Employee has CL3 item in non-approved location
    // Need to RECLAIM the CL3 and replace with CL2
    targetClass = 2;

    // Check if employee already has a Class 2 item assigned
    var hasClass2 = allInventoryData.some(function(item) {
      var itemClass = parseInt(item[2], 10);
      var assignedTo = (item[7] || '').toString().trim().toLowerCase();
      return itemClass === 2 && assignedTo === employeeName;
    });

    if (hasClass2) {
      result.status = 'Reclaim Only - Has CL2 ✅';
      return result;
    }
  } else if (reclaimType === 'class2') {
    // Class 2 Reclaims: Employee has CL2 item in CL3-only location
    // Need to RECLAIM the CL2 and replace with CL3 (upgrade)
    targetClass = 3;

    // Check if employee already has a Class 3 item assigned
    var hasClass3 = allInventoryData.some(function(item) {
      var itemClass = parseInt(item[2], 10);
      var assignedTo = (item[7] || '').toString().trim().toLowerCase();
      return itemClass === 3 && assignedTo === employeeName;
    });

    if (hasClass3) {
      result.status = 'Reclaim Only - Has CL3 ✅';
      return result;
    }
  } else {
    return result;
  }

  var useSize = reclaim.preferredSize || reclaim.size;
  var useSizeNum = isGlove ? parseFloat(useSize) : null;

  // Search priority: 1) Exact size On Shelf, 2) Size up On Shelf, 3) Ready For Delivery, 4) In Testing

  // 1) Try exact size On Shelf
  var match = inventoryData.find(function(item) {
    var itemClass = parseInt(item[2], 10);
    var itemStatus = (item[6] || '').toString().trim().toLowerCase();
    var itemNum = item[0].toString().trim();
    var itemSize = isGlove ? parseFloat(item[1]) : item[1];

    var classMatch = (itemClass === targetClass);
    var statusMatch = (itemStatus === 'on shelf');
    var notAssigned = !assignedItems.has(itemNum);
    var sizeMatch = isGlove ? (itemSize === useSizeNum) :
                    (item[1] && item[1].toString().trim().toLowerCase() === useSize.toString().trim().toLowerCase());

    return classMatch && statusMatch && notAssigned && sizeMatch;
  });

  if (match) {
    result.itemNum = match[0];
    result.status = 'In Stock ✅';
    return result;
  }

  // 2) Try size up On Shelf (gloves only)
  if (isGlove && !isNaN(useSizeNum)) {
    match = inventoryData.find(function(item) {
      var itemClass = parseInt(item[2], 10);
      var itemStatus = (item[6] || '').toString().trim().toLowerCase();
      var itemNum = item[0].toString().trim();
      var itemSize = parseFloat(item[1]);

      return itemClass === targetClass &&
             itemStatus === 'on shelf' &&
             !assignedItems.has(itemNum) &&
             itemSize === useSizeNum + 0.5;
    });

    if (match) {
      result.itemNum = match[0];
      result.status = 'In Stock (Size Up) ⚠️';
      return result;
    }
  }

  // 3) Try Ready For Delivery
  match = inventoryData.find(function(item) {
    var itemClass = parseInt(item[2], 10);
    var itemStatus = (item[6] || '').toString().trim().toLowerCase();
    var itemNum = item[0].toString().trim();
    var itemSize = isGlove ? parseFloat(item[1]) : item[1];

    var classMatch = (itemClass === targetClass);
    var statusMatch = (itemStatus === 'ready for delivery');
    var notAssigned = !assignedItems.has(itemNum);
    var sizeMatch = isGlove ? (itemSize === useSizeNum) :
                    (item[1] && item[1].toString().trim().toLowerCase() === useSize.toString().trim().toLowerCase());

    return classMatch && statusMatch && notAssigned && sizeMatch;
  });

  if (match) {
    result.itemNum = match[0];
    result.status = 'Ready For Delivery 🚚';
    return result;
  }

  // 3b) Try size up Ready For Delivery (gloves only)
  if (isGlove && !isNaN(useSizeNum)) {
    match = inventoryData.find(function(item) {
      var itemClass = parseInt(item[2], 10);
      var itemStatus = (item[6] || '').toString().trim().toLowerCase();
      var itemNum = item[0].toString().trim();
      var itemSize = parseFloat(item[1]);

      return itemClass === targetClass &&
             itemStatus === 'ready for delivery' &&
             !assignedItems.has(itemNum) &&
             itemSize === useSizeNum + 0.5;
    });

    if (match) {
      result.itemNum = match[0];
      result.status = 'Ready For Delivery (Size Up) ⚠️';
      return result;
    }
  }

  // 4) Try In Testing
  match = inventoryData.find(function(item) {
    var itemClass = parseInt(item[2], 10);
    var itemStatus = (item[6] || '').toString().trim().toLowerCase();
    var itemNum = item[0].toString().trim();
    var itemSize = isGlove ? parseFloat(item[1]) : item[1];

    var classMatch = (itemClass === targetClass);
    var statusMatch = (itemStatus === 'in testing');
    var notAssigned = !assignedItems.has(itemNum);
    var sizeMatch = isGlove ? (itemSize === useSizeNum) :
                    (item[1] && item[1].toString().trim().toLowerCase() === useSize.toString().trim().toLowerCase());

    return classMatch && statusMatch && notAssigned && sizeMatch;
  });

  if (match) {
    result.itemNum = match[0];
    result.status = 'In Testing ⏳';
    return result;
  }

  // 4b) Try size up In Testing (gloves only)
  if (isGlove && !isNaN(useSizeNum)) {
    match = inventoryData.find(function(item) {
      var itemClass = parseInt(item[2], 10);
      var itemStatus = (item[6] || '').toString().trim().toLowerCase();
      var itemNum = item[0].toString().trim();
      var itemSize = parseFloat(item[1]);

      return itemClass === targetClass &&
             itemStatus === 'in testing' &&
             !assignedItems.has(itemNum) &&
             itemSize === useSizeNum + 0.5;
    });

    if (match) {
      result.itemNum = match[0];
      result.status = 'In Testing (Size Up) ⚠️';
      return result;
    }
  }

  return result;
}

// ============================================================================
// TO-DO LIST FUNCTIONS
// ============================================================================

/**
 * Helper function to format dates for display
 */
function formatDateForDisplay(dateValue) {
  if (!dateValue) return '';
  if (dateValue === 'N/A') return 'N/A';
  try {
    var d = new Date(dateValue);
    if (isNaN(d.getTime())) return String(dateValue);
    return Utilities.formatDate(d, SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone(), 'MM/dd/yyyy');
  } catch (e) {
    return String(dateValue);
  }
}

/**
 * Sets up the To-Do List sheet structure with headers.
 * @param {Sheet} sheet - The To-Do List sheet to set up
 */
function setupToDoListSheet(sheet) {
  // Only set up if sheet is empty or has minimal content
  if (sheet.getLastRow() > 3) return;

  sheet.clear();

  // Title row
  sheet.getRange(1, 1, 1, 13).merge()
    .setValue('📋 TO-DO LIST - Weekly Planning')
    .setFontWeight('bold').setFontSize(16).setBackground('#1565c0').setFontColor('white').setHorizontalAlignment('center');
  sheet.setRowHeight(1, 35);

  // Instructions row
  sheet.getRange(2, 1, 1, 13).merge()
    .setValue('Generated from Swaps & Reclaims. Check ☑ Done when complete. Use Glove Manager → 📝 To-Do List → Generate To-Do List to refresh.')
    .setFontStyle('italic').setFontSize(10).setBackground('#e3f2fd').setHorizontalAlignment('center');

  // Headers row
  var headers = [
    '☑ Done',      // A - Checkbox
    'Priority',    // B - 1=High, 2=Medium, 3=Low
    'Task Type',   // C - Swap, Reclaim, Custom
    'Employee',    // D - Who needs the item
    'Location',    // E - Employee's location (for route planning)
    'Current Item #', // F - Item to replace/reclaim
    'Pick List #', // G - Replacement item number
    'Item Type',   // H - Glove/Sleeve
    'Class',       // I - 0, 2, 3
    'Due Date',    // J - Change Out Date
    'Days Left',   // K - Calculated
    'Status',      // L - Pending, In Progress, Complete
    'Notes'        // M - User notes
  ];

  sheet.getRange(3, 1, 1, headers.length).setValues([headers])
    .setFontWeight('bold').setBackground('#90caf9').setFontColor('#333').setHorizontalAlignment('center');

  sheet.setFrozenRows(3);

  // Set column widths
  sheet.setColumnWidth(1, 60);   // Done
  sheet.setColumnWidth(2, 70);   // Priority
  sheet.setColumnWidth(3, 90);   // Task Type
  sheet.setColumnWidth(4, 140);  // Employee
  sheet.setColumnWidth(5, 110);  // Location
  sheet.setColumnWidth(6, 100);  // Current Item #
  sheet.setColumnWidth(7, 90);   // Pick List #
  sheet.setColumnWidth(8, 70);   // Item Type
  sheet.setColumnWidth(9, 50);   // Class
  sheet.setColumnWidth(10, 100); // Due Date
  sheet.setColumnWidth(11, 80);  // Days Left
  sheet.setColumnWidth(12, 100); // Status
  sheet.setColumnWidth(13, 200); // Notes
}

/**
 * Generates the To-Do List from Glove Swaps, Sleeve Swaps, and Reclaims.
 * Preserves user checkmarks and notes from previous generation.
 * Groups items by location for weekly route planning.
 */
function generateToDoList() {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var todoSheet = ss.getSheetByName('To Do List');

    if (!todoSheet) {
      todoSheet = ss.insertSheet('To Do List');
      setupToDoListSheet(todoSheet);
    }

    // Preserve existing user data (Done checkmarks and Notes)
    var preservedData = preserveToDoUserData(todoSheet);

    // COMPLETELY clear the sheet and rebuild headers (fixes the range error)
    todoSheet.clear();
    setupToDoListSheet(todoSheet);

    var today = new Date();
    var todoItems = [];

    // Build employee -> location map for fallback lookup
    var employeesSheet = ss.getSheetByName(SHEET_EMPLOYEES);
    var empLocationMap = {};
    if (employeesSheet && employeesSheet.getLastRow() > 1) {
      var empData = employeesSheet.getDataRange().getValues();
      var empHeaders = empData[0];
      var locationColIdx = 2; // Default
      for (var h = 0; h < empHeaders.length; h++) {
        if (String(empHeaders[h]).toLowerCase().trim() === 'location') {
          locationColIdx = h;
          break;
        }
      }
      for (var e = 1; e < empData.length; e++) {
        var empName = (empData[e][0] || '').toString().trim().toLowerCase();
        var empLoc = (empData[e][locationColIdx] || '').toString().trim();
        if (empName && empLoc) {
          empLocationMap[empName] = empLoc;
        }
      }
    }

    // Also check Employee History for Previous Employees
    var historySheet = ss.getSheetByName('Employee History');
    if (historySheet && historySheet.getLastRow() > 2) {
      var histData = historySheet.getRange(3, 1, historySheet.getLastRow() - 2, 10).getValues();
      for (var hi = 0; hi < histData.length; hi++) {
        var histName = (histData[hi][1] || '').toString().trim().toLowerCase();
        var histLoc = (histData[hi][3] || '').toString().trim();
        // Only use if not already in empLocationMap (current employee takes priority)
        if (histName && histLoc && !empLocationMap[histName]) {
          empLocationMap[histName] = histLoc;
        }
      }
    }

    // Collect items from Glove Swaps
    var gloveSwapsSheet = ss.getSheetByName(SHEET_GLOVE_SWAPS);
    if (gloveSwapsSheet && gloveSwapsSheet.getLastRow() > 1) {
      var gloveSwapsData = gloveSwapsSheet.getDataRange().getValues();
      collectSwapTasks(gloveSwapsData, 'Glove', todoItems, today, empLocationMap);
    }

    // Collect items from Sleeve Swaps
    var sleeveSwapsSheet = ss.getSheetByName(SHEET_SLEEVE_SWAPS);
    if (sleeveSwapsSheet && sleeveSwapsSheet.getLastRow() > 1) {
      var sleeveSwapsData = sleeveSwapsSheet.getDataRange().getValues();
      collectSwapTasks(sleeveSwapsData, 'Sleeve', todoItems, today, empLocationMap);
    }

    // Collect items from Reclaims
    var reclaimsSheet = ss.getSheetByName('Reclaims');
    if (reclaimsSheet && reclaimsSheet.getLastRow() > 1) {
      collectReclaimTasks(reclaimsSheet, todoItems, today, empLocationMap);
    }

    // Sort by Location (for route planning), then by Priority, then by Days Left
    todoItems.sort(function(a, b) {
      // First sort by location
      var locCompare = (a.location || 'ZZZ').localeCompare(b.location || 'ZZZ');
      if (locCompare !== 0) return locCompare;
      // Then by priority
      if (a.priority !== b.priority) return a.priority - b.priority;
      // Then by days left (most urgent first)
      return (a.daysLeftNum || 999) - (b.daysLeftNum || 999);
    });

    // Check if we have any items
    if (todoItems.length === 0) {
      todoSheet.getRange(4, 1).setValue('No tasks to display - run Generate All Reports first');
      todoSheet.getRange(4, 1, 1, 13).merge().setHorizontalAlignment('center').setFontStyle('italic');
      SpreadsheetApp.getUi().alert('ℹ️ No Tasks Found\n\nRun "Generate All Reports" first to populate the Glove Swaps and Sleeve Swaps sheets.');
      return;
    }

    // Group by location and write to sheet
    var currentRow = 4;
    var lastLocation = '';
    var dataRows = [];  // Track rows that need checkboxes

    for (var i = 0; i < todoItems.length; i++) {
      var item = todoItems[i];

      // Add location header if location changed
      if (item.location !== lastLocation) {
        if (lastLocation !== '') {
          currentRow++; // Add spacing between location groups
        }
        todoSheet.getRange(currentRow, 1, 1, 13).merge()
          .setValue('📍 ' + (item.location || 'Unknown Location'))
          .setFontWeight('bold').setFontSize(11).setBackground('#e8eaf6').setFontColor('#3949ab').setHorizontalAlignment('left');
        currentRow++;
        lastLocation = item.location;
      }

      // Check if this item was previously marked done or has notes
      var preserveKey = item.taskType + '|' + item.employee + '|' + item.currentItemNum;
      var preserved = preservedData[preserveKey] || {};

      var rowData = [
        preserved.done || false,    // Done
        item.priority,              // Priority
        item.taskType,              // Task Type
        item.employee,              // Employee
        item.location,              // Location
        item.currentItemNum,        // Current Item #
        item.pickListNum,           // Pick List #
        item.itemType,              // Item Type
        item.itemClass,             // Class
        item.dueDate,               // Due Date
        item.daysLeft,              // Days Left
        preserved.done ? 'Complete' : item.status,  // Status
        preserved.notes || ''       // Notes (preserve user notes)
      ];

      todoSheet.getRange(currentRow, 1, 1, 13).setValues([rowData]);

      // Track this as a data row that needs a checkbox
      dataRows.push(currentRow);

      // Apply styling
      todoSheet.getRange(currentRow, 1, 1, 13).setHorizontalAlignment('center');
      todoSheet.getRange(currentRow, 13).setHorizontalAlignment('left');  // Notes left-aligned

      // Color code by priority and status
      if (preserved.done) {
        todoSheet.getRange(currentRow, 1, 1, 13).setBackground('#c8e6c9');  // Green for done
        todoSheet.getRange(currentRow, 1, 1, 13).setFontColor('#666666');   // Gray text
      } else if (item.priority === 1) {
        todoSheet.getRange(currentRow, 2).setBackground('#ffcdd2');  // Red for high priority
      } else if (item.priority === 2) {
        todoSheet.getRange(currentRow, 2).setBackground('#ffe0b2');  // Orange for medium priority
      }

      // Color code Days Left column
      if (item.daysLeft === 'OVERDUE') {
        todoSheet.getRange(currentRow, 11).setFontColor('#d32f2f').setFontWeight('bold');
      } else if (item.daysLeftNum !== null && item.daysLeftNum <= 7) {
        todoSheet.getRange(currentRow, 11).setFontColor('#ff9800').setFontWeight('bold');
      } else if (item.daysLeftNum !== null && item.daysLeftNum <= 14) {
        todoSheet.getRange(currentRow, 11).setFontColor('#ff9800');
      }

      currentRow++;
    }

    // Add checkboxes only to data rows (not location headers)
    for (var dr = 0; dr < dataRows.length; dr++) {
      todoSheet.getRange(dataRows[dr], 1).insertCheckboxes();
    }

    // Add summary at the top
    var totalTasks = todoItems.length;
    var completedTasks = Object.values(preservedData).filter(function(p) { return p.done; }).length;
    var overdueCount = todoItems.filter(function(t) { return t.daysLeft === 'OVERDUE'; }).length;

    var summaryText = 'Generated: ' + new Date().toLocaleString() + ' | Total: ' + totalTasks +
                      ' tasks | Overdue: ' + overdueCount + ' | Completed: ' + completedTasks;
    todoSheet.getRange(2, 1).setValue(summaryText);

    todoSheet.activate();
    SpreadsheetApp.getUi().alert('✅ To-Do List Generated!\n\n' +
                                 'Total Tasks: ' + totalTasks + '\n' +
                                 'Overdue: ' + overdueCount + '\n' +
                                 'Completed: ' + completedTasks);

  } catch (e) {
    Logger.log('[ERROR] generateToDoList: ' + e);
    SpreadsheetApp.getUi().alert('Error generating To-Do List: ' + e);
  }
}

/**
 * Collects swap tasks from a swap sheet and adds to todoItems array.
 * @param {Array} swapData - Data from the swap sheet
 * @param {string} itemType - 'Glove' or 'Sleeve'
 * @param {Array} todoItems - Array to add tasks to
 * @param {Date} today - Today's date
 * @param {Object} empLocationMap - Map of employee name (lowercase) to location for fallback
 */
function collectSwapTasks(swapData, itemType, todoItems, today, empLocationMap) {
  var currentClass = null;
  var currentLocation = null;

  for (var i = 1; i < swapData.length; i++) {
    var row = swapData[i];
    var firstCell = (row[0] || '').toString().trim();

    // Detect class headers
    if (firstCell.indexOf('Class') !== -1 && firstCell.indexOf('Swaps') !== -1) {
      var classPattern = new RegExp('Class (\\d+)');
      var classMatch = firstCell.match(classPattern);
      if (classMatch) {
        currentClass = parseInt(classMatch[1], 10);
      }
      currentLocation = null; // Reset location for new class
      continue;
    }

    // Detect location sub-headers
    if (firstCell.indexOf('📍') !== -1) {
      currentLocation = firstCell.replace('📍', '').trim();
      continue;
    }

    // Skip other header rows
    if (!firstCell || firstCell === 'Employee' || firstCell.indexOf('STAGE') !== -1 ||
        firstCell.indexOf('Pick List') !== -1) {
      continue;
    }

    // This is a data row
    var employee = row[0];
    var currentItemNum = row[1];
    var size = row[2];
    var dateAssigned = row[3];
    var changeOutDate = row[4];
    var daysLeft = row[5];
    var pickListNum = row[6];
    var status = row[7];
    var picked = row[8];
    var dateChanged = row[9];

    // Skip if already completed (has Date Changed)
    if (dateChanged && dateChanged !== '' && dateChanged !== false) {
      continue;
    }

    // Determine location - use currentLocation from header, or lookup from employee map
    var taskLocation = currentLocation;
    if (!taskLocation && employee && empLocationMap) {
      var empNameLower = employee.toString().trim().toLowerCase();
      taskLocation = empLocationMap[empNameLower] || 'Unknown Location';
    }
    if (!taskLocation) {
      taskLocation = 'Unknown Location';
    }

    // Calculate priority based on days left
    var priority = 3;  // Low
    var daysLeftNum = null;
    if (daysLeft === 'OVERDUE') {
      priority = 1;  // High
      daysLeftNum = -1;
    } else if (!isNaN(parseInt(daysLeft, 10))) {
      daysLeftNum = parseInt(daysLeft, 10);
      if (daysLeftNum <= 7) {
        priority = 1;  // High
      } else if (daysLeftNum <= 14) {
        priority = 2;  // Medium
      }
    }

    // Determine task status
    var taskStatus = 'Pending';
    if (picked === true || picked === 'TRUE') {
      taskStatus = 'Picked - Ready to Deliver';
    } else if (pickListNum && pickListNum !== '—' && pickListNum !== '-') {
      taskStatus = 'Item Assigned';
    } else if ((status || '').indexOf('Need to Purchase') !== -1) {
      taskStatus = 'Need to Order';
    }

    todoItems.push({
      taskType: 'Swap',
      employee: employee,
      location: taskLocation,
      currentItemNum: currentItemNum,
      pickListNum: pickListNum || '—',
      itemType: itemType,
      itemClass: currentClass,
      dueDate: formatDateForDisplay(changeOutDate),
      daysLeft: daysLeft,
      daysLeftNum: daysLeftNum,
      status: taskStatus,
      priority: priority
    });
  }
}

/**
 * Collects reclaim tasks from the Reclaims sheet and adds to todoItems array.
 * @param {Sheet} reclaimsSheet - The Reclaims sheet
 * @param {Array} todoItems - Array to add tasks to
 * @param {Date} today - Today's date
 * @param {Object} empLocationMap - Map of employee name (lowercase) to location
 */
function collectReclaimTasks(reclaimsSheet, todoItems, today, empLocationMap) {
  var data = reclaimsSheet.getDataRange().getValues();
  var inClass3Table = false;
  var inClass2Table = false;

  for (var i = 0; i < data.length; i++) {
    var row = data[i];
    var firstCell = (row[0] || '').toString().trim();

    // Detect table headers
    if (firstCell.indexOf('Class 3 Reclaims') !== -1) {
      inClass3Table = true;
      inClass2Table = false;
      continue;
    }
    if (firstCell.indexOf('Class 2 Reclaims') !== -1) {
      inClass3Table = false;
      inClass2Table = true;
      continue;
    }
    if (firstCell.indexOf('Lost Items') !== -1) {
      inClass3Table = false;
      inClass2Table = false;
      continue;
    }

    // Skip header rows
    if (firstCell === 'Employee' || firstCell === '' || firstCell.indexOf('Previous') !== -1 ||
        firstCell.indexOf('Approved') !== -1 || firstCell.indexOf('Location') !== -1 ||
        firstCell.indexOf('✅') !== -1) {
      continue;
    }

    if (inClass3Table || inClass2Table) {
      // Reclaims table structure: Employee, Item Type, Item #, Size, Class, Location, Assigned To
      var employee = row[0];
      var itemType = row[1];
      var itemNum = row[2];
      var size = row[3];
      var itemClass = row[4];
      var location = row[5];
      var assignedTo = row[6];

      // Skip if no employee name (probably a header row we missed)
      if (!employee || typeof employee !== 'string') continue;

      // Determine priority - reclaims are generally medium priority
      var priority = 2;  // Medium
      var taskStatus = 'Reclaim Pending';

      var reclaimType = inClass3Table ? 'Reclaim CL3→CL2' : 'Reclaim CL2→CL3';

      todoItems.push({
        taskType: reclaimType,
        employee: employee,
        location: location,
        currentItemNum: itemNum,
        pickListNum: '—',
        itemType: itemType,
        itemClass: itemClass,
        dueDate: 'ASAP',  // Reclaims should be done ASAP
        daysLeft: 'ASAP',
        daysLeftNum: 0,  // Treat as urgent for sorting
        status: taskStatus,
        priority: priority
      });
    }
  }
}

/**
 * Preserves user-entered data (Done checkmarks and Notes) from the To-Do List.
 * Returns a map of task keys to their preserved data.
 */
function preserveToDoUserData(todoSheet) {
  var preserved = {};

  if (todoSheet.getLastRow() <= 3) return preserved;

  var data = todoSheet.getRange(4, 1, todoSheet.getLastRow() - 3, 13).getValues();

  for (var i = 0; i < data.length; i++) {
    var row = data[i];
    var done = row[0];
    var taskType = (row[2] || '').toString().trim();
    var employee = (row[3] || '').toString().trim();
    var currentItemNum = (row[5] || '').toString().trim();
    var notes = (row[12] || '').toString().trim();

    // Skip location header rows
    if (!taskType || taskType === '' || taskType.indexOf('📍') !== -1) continue;

    var key = taskType + '|' + employee + '|' + currentItemNum;

    if (done === true || notes !== '') {
      preserved[key] = {
        done: done === true,
        notes: notes
      };
    }
  }

  return preserved;
}

/**
 * Clears completed tasks from the To-Do List.
 */
function clearCompletedTasks() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var todoSheet = ss.getSheetByName('To Do List');

  if (!todoSheet || todoSheet.getLastRow() <= 3) {
    SpreadsheetApp.getUi().alert('No tasks to clear.');
    return;
  }

  var ui = SpreadsheetApp.getUi();
  var result = ui.alert(
    'Clear Completed Tasks',
    'This will remove all tasks marked as Done (☑) from the To-Do List.\n\nContinue?',
    ui.ButtonSet.YES_NO
  );

  if (result !== ui.Button.YES) return;

  var data = todoSheet.getRange(4, 1, todoSheet.getLastRow() - 3, 13).getValues();
  var rowsToDelete = [];

  for (var i = data.length - 1; i >= 0; i--) {
    if (data[i][0] === true) {  // Done checkbox is checked
      rowsToDelete.push(i + 4);  // Adjust for header rows
    }
  }

  // Delete rows from bottom to top to avoid index shifting
  for (var j = 0; j < rowsToDelete.length; j++) {
    todoSheet.deleteRow(rowsToDelete[j]);
  }

  SpreadsheetApp.getUi().alert('✅ Cleared ' + rowsToDelete.length + ' completed tasks.');
}

// ============================================================================
// EMAIL REPORTS FUNCTIONS
// ============================================================================

/**
 * Gets unique, non-empty email addresses from the "Notification Emails" column in Employees sheet.
 * @return {Array} Array of unique email addresses
 */
function getNotificationRecipients() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var employeesSheet = ss.getSheetByName(SHEET_EMPLOYEES);

  if (!employeesSheet || employeesSheet.getLastRow() < 2) {
    return [];
  }

  var headers = employeesSheet.getRange(1, 1, 1, employeesSheet.getLastColumn()).getValues()[0];
  var notificationColIdx = -1;

  for (var i = 0; i < headers.length; i++) {
    if (String(headers[i]).toLowerCase().trim() === 'notification emails') {
      notificationColIdx = i;
      break;
    }
  }

  if (notificationColIdx === -1) {
    Logger.log('Notification Emails column not found');
    return [];
  }

  var data = employeesSheet.getRange(2, notificationColIdx + 1, employeesSheet.getLastRow() - 1, 1).getValues();
  var emailSet = {};

  data.forEach(function(row) {
    var email = (row[0] || '').toString().trim();
    if (email && email.indexOf('@') !== -1) {
      // Handle multiple emails separated by comma or semicolon
      var emailStr = email.split(';').join(',');
      var emails = emailStr.split(',');
      emails.forEach(function(e) {
        var trimmed = e.trim();
        if (trimmed && trimmed.indexOf('@') !== -1) {
          emailSet[trimmed.toLowerCase()] = trimmed;
        }
      });
    }
  });

  return Object.values(emailSet);
}

/**
 * Builds styled HTML content for the email report.
 * Includes: Inventory Reports, Purchase Needs, To-Do List, Glove Swaps, Sleeve Swaps, Reclaims
 * @return {string} HTML content for the email
 */
function buildEmailReportHtml() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var timezone = ss.getSpreadsheetTimeZone();
  var now = new Date();
  var dateStr = Utilities.formatDate(now, timezone, 'MMMM d, yyyy');

  // Common styles
  var styles = {
    headerBg: '#1565c0',
    headerColor: '#ffffff',
    subHeaderBg: '#90caf9',
    altRowBg: '#f5f5f5',
    urgentBg: '#ffcdd2',
    urgentColor: '#c62828',
    warningBg: '#fff3e0',
    warningColor: '#e65100',
    successBg: '#e8f5e9',
    successColor: '#2e7d32',
    infoBg: '#e3f2fd',
    infoColor: '#1565c0'
  };

  var html = '<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body style="font-family: Arial, sans-serif; max-width: 900px; margin: 0 auto; padding: 20px; background-color: #f5f5f5;">';

  // Title
  html += '<div style="background: linear-gradient(135deg, ' + styles.headerBg + ' 0%, #1976d2 100%); color: white; padding: 20px; border-radius: 8px; margin-bottom: 20px; text-align: center;">';
  html += '<h1 style="margin: 0; font-size: 24px;">🧤 Rubber Tracker Weekly Report</h1>';
  html += '<p style="margin: 10px 0 0 0; opacity: 0.9;">' + dateStr + '</p>';
  html += '</div>';

  // Build each section
  html += buildInventoryReportSection(ss, styles);
  html += buildPurchaseNeedsSection(ss, styles);
  html += buildToDoListSection(ss, styles);
  html += buildSwapsSection(ss, 'Glove Swaps', styles);
  html += buildSwapsSection(ss, 'Sleeve Swaps', styles);
  html += buildReclaimsSection(ss, styles);

  // Footer
  html += '<div style="text-align: center; padding: 20px; color: #666; font-size: 12px; border-top: 1px solid #ddd; margin-top: 20px;">';
  html += '<p>This report was automatically generated from the Rubber Tracker spreadsheet.</p>';
  html += '<p><a href="' + ss.getUrl() + '" style="color: ' + styles.headerBg + ';">Open Spreadsheet</a></p>';
  html += '</div>';

  html += '</body></html>';

  return html;
}

/**
 * Builds the Inventory Reports section of the email.
 */
function buildInventoryReportSection(ss, styles) {
  var sheet = ss.getSheetByName('Inventory Reports');
  if (!sheet || sheet.getLastRow() < 2) {
    return buildEmptySection('📊 Inventory Reports', 'No inventory data available.', styles);
  }

  var html = '<div style="background: white; border-radius: 8px; margin-bottom: 20px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">';
  html += '<div style="background: ' + styles.headerBg + '; color: ' + styles.headerColor + '; padding: 12px 15px; font-weight: bold; font-size: 16px;">📊 Inventory Reports</div>';
  html += '<div style="padding: 15px;">';

  // Read the data from the sheet
  var data = sheet.getDataRange().getDisplayValues();

  // Extract summary info from row 4 (index 3) - the data row after header
  var summaryHeaders = data[2] || []; // Row 3 has headers
  var summaryData = data[3] || [];    // Row 4 has values

  if (summaryData.length >= 6) {
    html += '<table style="width: 100%; border-collapse: collapse; margin-bottom: 15px;">';
    html += '<tr>';
    html += '<td style="text-align: center; padding: 15px; background: ' + styles.infoBg + '; border-radius: 8px; margin: 5px;">';
    html += '<div style="font-size: 28px; font-weight: bold; color: ' + styles.infoColor + ';">' + (summaryData[0] || '0') + '</div>';
    html += '<div style="font-size: 12px; color: #666;">Total Gloves</div></td>';
    html += '<td style="text-align: center; padding: 15px; background: #f3e5f5; border-radius: 8px; margin: 5px;">';
    html += '<div style="font-size: 28px; font-weight: bold; color: #7b1fa2;">' + (summaryData[1] || '0') + '</div>';
    html += '<div style="font-size: 12px; color: #666;">Total Sleeves</div></td>';
    html += '<td style="text-align: center; padding: 15px; background: ' + styles.successBg + '; border-radius: 8px; margin: 5px;">';
    html += '<div style="font-size: 28px; font-weight: bold; color: ' + styles.successColor + ';">' + (summaryData[2] || '0') + '</div>';
    html += '<div style="font-size: 12px; color: #666;">Glove Avg/Month</div></td>';
    html += '<td style="text-align: center; padding: 15px; background: ' + styles.urgentBg + '; border-radius: 8px; margin: 5px;">';
    html += '<div style="font-size: 28px; font-weight: bold; color: ' + styles.urgentColor + ';">' + (summaryData[4] || '0') + '</div>';
    html += '<div style="font-size: 12px; color: #666;">Gloves Lost/Failed</div></td>';
    html += '</tr></table>';
  }

  // Find and display status breakdown tables
  var inStatusSection = false;
  var currentTableTitle = '';
  var tableData = [];

  for (var i = 4; i < data.length; i++) {
    var row = data[i];
    var firstCell = (row[0] || '').toString().trim();

    // Check for section headers
    if (firstCell.indexOf('GLOVES BY STATUS') !== -1 || firstCell.indexOf('SLEEVES BY STATUS') !== -1) {
      // Output previous table if exists
      if (tableData.length > 0) {
        html += buildStatusTable(currentTableTitle, tableData, styles);
      }
      currentTableTitle = firstCell;
      tableData = [];
      inStatusSection = true;
      continue;
    }

    // Skip empty rows or other headers
    if (!firstCell || firstCell === 'Status' || firstCell.indexOf('BY CLASS') !== -1 ||
        firstCell.indexOf('BY LOCATION') !== -1 || firstCell.indexOf('DASHBOARD') !== -1) {
      if (tableData.length > 0 && inStatusSection) {
        html += buildStatusTable(currentTableTitle, tableData, styles);
        tableData = [];
        inStatusSection = false;
      }
      continue;
    }

    if (inStatusSection && firstCell) {
      tableData.push({
        status: firstCell,
        count: row[1] || '0',
        percent: row[2] || '0%'
      });
    }
  }

  // Output last table
  if (tableData.length > 0) {
    html += buildStatusTable(currentTableTitle, tableData, styles);
  }

  html += '</div></div>';
  return html;
}

/**
 * Helper to build a status breakdown table.
 */
function buildStatusTable(title, data, styles) {
  if (!data || data.length === 0) return '';

  var html = '<div style="margin-bottom: 15px;">';
  html += '<h4 style="margin: 0 0 10px 0; color: ' + styles.headerBg + '; font-size: 14px;">' + title + '</h4>';
  html += '<table style="width: 100%; border-collapse: collapse; font-size: 13px;">';
  html += '<tr style="background: ' + styles.subHeaderBg + ';">';
  html += '<th style="padding: 8px; text-align: left; border: 1px solid #ddd;">Status</th>';
  html += '<th style="padding: 8px; text-align: center; border: 1px solid #ddd;">Count</th>';
  html += '<th style="padding: 8px; text-align: center; border: 1px solid #ddd;">%</th>';
  html += '</tr>';

  data.forEach(function(row, idx) {
    var bgColor = idx % 2 === 0 ? '#ffffff' : styles.altRowBg;
    var statusColor = getStatusEmailColor(row.status);
    html += '<tr style="background: ' + bgColor + ';">';
    html += '<td style="padding: 8px; border: 1px solid #ddd; color: ' + statusColor + ';">' + row.status + '</td>';
    html += '<td style="padding: 8px; text-align: center; border: 1px solid #ddd;">' + row.count + '</td>';
    html += '<td style="padding: 8px; text-align: center; border: 1px solid #ddd;">' + row.percent + '</td>';
    html += '</tr>';
  });

  html += '</table></div>';
  return html;
}

/**
 * Gets color for status text in emails.
 */
function getStatusEmailColor(status) {
  var s = (status || '').toString().toLowerCase();
  if (s.indexOf('assigned') !== -1) return '#2e7d32';
  if (s.indexOf('on shelf') !== -1) return '#1565c0';
  if (s.indexOf('testing') !== -1) return '#f57c00';
  if (s.indexOf('lost') !== -1 || s.indexOf('failed') !== -1) return '#c62828';
  if (s.indexOf('destroyed') !== -1) return '#c62828';
  return '#333333';
}

/**
 * Builds the Purchase Needs section of the email.
 */
function buildPurchaseNeedsSection(ss, styles) {
  var sheet = ss.getSheetByName('Purchase Needs');
  if (!sheet || sheet.getLastRow() < 2) {
    return buildEmptySection('🛒 Purchase Needs', 'No purchase needs at this time.', styles);
  }

  var html = '<div style="background: white; border-radius: 8px; margin-bottom: 20px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">';
  html += '<div style="background: #c62828; color: ' + styles.headerColor + '; padding: 12px 15px; font-weight: bold; font-size: 16px;">🛒 Purchase Needs</div>';
  html += '<div style="padding: 15px;">';

  var data = sheet.getDataRange().getDisplayValues();
  var currentSection = '';
  var sectionData = [];

  for (var i = 0; i < data.length; i++) {
    var row = data[i];
    var firstCell = (row[0] || '').toString().trim();

    // Check for section titles (they have emoji markers)
    if (firstCell.indexOf('🛒') !== -1 || firstCell.indexOf('📦') !== -1 ||
        firstCell.indexOf('⏳') !== -1 || firstCell.indexOf('⚠️') !== -1) {
      // Output previous section
      if (sectionData.length > 0) {
        html += buildPurchaseTable(currentSection, sectionData, styles);
      }
      currentSection = firstCell;
      sectionData = [];
      continue;
    }

    // Skip header rows
    if (firstCell === 'Severity' || firstCell === '' || !firstCell) continue;

    // Data row
    if (currentSection && row[2]) { // Has Item Type
      sectionData.push({
        severity: row[0],
        timeframe: row[1],
        itemType: row[2],
        size: row[3],
        classNum: row[4],
        qty: row[5],
        reason: row[6],
        status: row[7]
      });
    }
  }

  // Output last section
  if (sectionData.length > 0) {
    html += buildPurchaseTable(currentSection, sectionData, styles);
  }

  if (html.indexOf('<table') === -1) {
    html += '<p style="color: #2e7d32; text-align: center; padding: 20px;">✅ No purchase needs at this time!</p>';
  }

  html += '</div></div>';
  return html;
}

/**
 * Helper to build a purchase needs table.
 */
function buildPurchaseTable(title, data, styles) {
  if (!data || data.length === 0) return '';

  var titleBg = '#ffcdd2';
  if (title.indexOf('READY FOR DELIVERY') !== -1) titleBg = '#c8e6c9';
  if (title.indexOf('IN TESTING') !== -1) titleBg = '#bbdefb';
  if (title.indexOf('SIZE UP') !== -1) titleBg = '#ffe0b2';

  var html = '<div style="margin-bottom: 15px;">';
  html += '<div style="background: ' + titleBg + '; padding: 8px 12px; font-weight: bold; border-radius: 4px 4px 0 0;">' + title + '</div>';
  html += '<table style="width: 100%; border-collapse: collapse; font-size: 12px;">';
  html += '<tr style="background: ' + styles.subHeaderBg + ';">';
  html += '<th style="padding: 6px; border: 1px solid #ddd;">Item Type</th>';
  html += '<th style="padding: 6px; border: 1px solid #ddd;">Size</th>';
  html += '<th style="padding: 6px; border: 1px solid #ddd;">Class</th>';
  html += '<th style="padding: 6px; border: 1px solid #ddd;">Qty</th>';
  html += '<th style="padding: 6px; border: 1px solid #ddd;">Status</th>';
  html += '</tr>';

  data.forEach(function(row, idx) {
    var bgColor = idx % 2 === 0 ? '#ffffff' : styles.altRowBg;
    html += '<tr style="background: ' + bgColor + ';">';
    html += '<td style="padding: 6px; border: 1px solid #ddd;">' + row.itemType + '</td>';
    html += '<td style="padding: 6px; border: 1px solid #ddd; text-align: center;">' + row.size + '</td>';
    html += '<td style="padding: 6px; border: 1px solid #ddd; text-align: center;">' + row.classNum + '</td>';
    html += '<td style="padding: 6px; border: 1px solid #ddd; text-align: center; font-weight: bold;">' + row.qty + '</td>';
    html += '<td style="padding: 6px; border: 1px solid #ddd;">' + row.status + '</td>';
    html += '</tr>';
  });

  html += '</table></div>';
  return html;
}

/**
 * Builds the To-Do List section of the email.
 */
function buildToDoListSection(ss, styles) {
  var sheet = ss.getSheetByName('To Do List');
  if (!sheet || sheet.getLastRow() < 4) {
    return buildEmptySection('📋 To-Do List', 'No tasks in the to-do list.', styles);
  }

  var html = '<div style="background: white; border-radius: 8px; margin-bottom: 20px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">';
  html += '<div style="background: #7b1fa2; color: ' + styles.headerColor + '; padding: 12px 15px; font-weight: bold; font-size: 16px;">📋 To-Do List</div>';
  html += '<div style="padding: 15px;">';

  var data = sheet.getDataRange().getDisplayValues();
  var currentLocation = '';
  var tasks = [];

  // Start from row 4 (index 3) to skip headers
  for (var i = 3; i < data.length; i++) {
    var row = data[i];
    var firstCell = (row[0] || '').toString().trim();
    var taskType = (row[2] || '').toString().trim();

    // Check for location headers
    if (taskType === '' && row[1] === '' && (firstCell.indexOf('📍') !== -1 || (row[0] === '' && data[i].join('').indexOf('📍') !== -1))) {
      // This is a location header row
      var locationCell = data[i].find(function(cell) { return cell && cell.toString().indexOf('📍') !== -1; });
      if (locationCell) {
        currentLocation = locationCell.toString().replace('📍', '').trim();
      }
      continue;
    }

    // Skip empty rows or non-task rows
    if (!taskType || taskType === 'Task Type') continue;

    var isDone = firstCell === 'TRUE' || firstCell === true || row[0] === true;

    tasks.push({
      done: isDone,
      priority: row[1] || '',
      taskType: taskType,
      employee: row[3] || '',
      location: row[4] || currentLocation,
      currentItem: row[5] || '',
      pickList: row[6] || '',
      itemType: row[7] || '',
      classNum: row[8] || '',
      dueDate: row[10] || '',
      status: row[11] || ''
    });
  }

  if (tasks.length === 0) {
    html += '<p style="color: #2e7d32; text-align: center; padding: 20px;">✅ No tasks to complete!</p>';
  } else {
    // Group by location
    var locations = {};
    tasks.forEach(function(task) {
      var loc = task.location || 'Unknown';
      if (!locations[loc]) locations[loc] = [];
      locations[loc].push(task);
    });

    Object.keys(locations).sort().forEach(function(loc) {
      html += '<div style="margin-bottom: 15px;">';
      html += '<div style="background: #e8eaf6; padding: 8px 12px; font-weight: bold; color: #3949ab; border-radius: 4px 4px 0 0;">📍 ' + loc + '</div>';
      html += '<table style="width: 100%; border-collapse: collapse; font-size: 12px;">';
      html += '<tr style="background: ' + styles.subHeaderBg + ';">';
      html += '<th style="padding: 6px; border: 1px solid #ddd; width: 30px;">✓</th>';
      html += '<th style="padding: 6px; border: 1px solid #ddd;">Task</th>';
      html += '<th style="padding: 6px; border: 1px solid #ddd;">Employee</th>';
      html += '<th style="padding: 6px; border: 1px solid #ddd;">Item</th>';
      html += '<th style="padding: 6px; border: 1px solid #ddd;">Pick List</th>';
      html += '<th style="padding: 6px; border: 1px solid #ddd;">Status</th>';
      html += '</tr>';

      locations[loc].forEach(function(task, idx) {
        var bgColor = task.done ? '#e8f5e9' : (idx % 2 === 0 ? '#ffffff' : styles.altRowBg);
        var textDecor = task.done ? 'line-through' : 'none';
        var checkMark = task.done ? '☑' : '☐';

        html += '<tr style="background: ' + bgColor + '; text-decoration: ' + textDecor + ';">';
        html += '<td style="padding: 6px; border: 1px solid #ddd; text-align: center;">' + checkMark + '</td>';
        html += '<td style="padding: 6px; border: 1px solid #ddd;">' + task.taskType + '</td>';
        html += '<td style="padding: 6px; border: 1px solid #ddd;">' + task.employee + '</td>';
        html += '<td style="padding: 6px; border: 1px solid #ddd;">' + task.currentItem + '</td>';
        html += '<td style="padding: 6px; border: 1px solid #ddd;">' + task.pickList + '</td>';
        html += '<td style="padding: 6px; border: 1px solid #ddd;">' + task.status + '</td>';
        html += '</tr>';
      });

      html += '</table></div>';
    });
  }

  html += '</div></div>';
  return html;
}

/**
 * Builds a Swaps section (Glove or Sleeve) of the email.
 */
function buildSwapsSection(ss, sheetName, styles) {
  var sheet = ss.getSheetByName(sheetName);
  var icon = sheetName === 'Glove Swaps' ? '🧤' : '💪';
  var headerBg = sheetName === 'Glove Swaps' ? '#2e7d32' : '#00695c';

  if (!sheet || sheet.getLastRow() < 2) {
    return buildEmptySection(icon + ' ' + sheetName, 'No swaps data available.', styles);
  }

  var html = '<div style="background: white; border-radius: 8px; margin-bottom: 20px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">';
  html += '<div style="background: ' + headerBg + '; color: ' + styles.headerColor + '; padding: 12px 15px; font-weight: bold; font-size: 16px;">' + icon + ' ' + sheetName + '</div>';
  html += '<div style="padding: 15px;">';

  var data = sheet.getDataRange().getDisplayValues();
  var currentClass = '';
  var currentLocation = '';
  var swapsByClass = {};

  for (var i = 0; i < data.length; i++) {
    var row = data[i];
    var firstCell = (row[0] || '').toString().trim();

    // Check for class headers
    if (firstCell.indexOf('Class') !== -1 && firstCell.indexOf('Swaps') !== -1) {
      currentClass = firstCell;
      if (!swapsByClass[currentClass]) {
        swapsByClass[currentClass] = { locations: {} };
      }
      continue;
    }

    // Check for location sub-headers
    if (firstCell.indexOf('📍') !== -1) {
      currentLocation = firstCell.replace('📍', '').trim();
      continue;
    }

    // Skip stage headers and column headers
    if (firstCell === 'Employee' || firstCell.indexOf('STAGE') !== -1 ||
        firstCell.indexOf('Pick List') !== -1 || !firstCell) continue;

    // This is a data row
    if (currentClass && firstCell) {
      var loc = currentLocation || 'Unknown';
      if (!swapsByClass[currentClass].locations[loc]) {
        swapsByClass[currentClass].locations[loc] = [];
      }

      swapsByClass[currentClass].locations[loc].push({
        employee: firstCell,
        itemNum: row[1] || '',
        size: row[2] || '',
        dateAssigned: row[3] || '',
        changeOutDate: row[4] || '',
        daysLeft: row[5] || '',
        pickList: row[6] || '',
        status: row[7] || ''
      });
    }
  }

  // Render the tables
  var hasData = false;
  Object.keys(swapsByClass).forEach(function(classHeader) {
    var classData = swapsByClass[classHeader];
    var locationKeys = Object.keys(classData.locations);

    if (locationKeys.length === 0) return;
    hasData = true;

    html += '<div style="margin-bottom: 15px;">';
    html += '<div style="background: ' + styles.subHeaderBg + '; padding: 8px 12px; font-weight: bold; border-radius: 4px 4px 0 0;">' + classHeader + '</div>';

    locationKeys.forEach(function(loc) {
      var swaps = classData.locations[loc];
      if (swaps.length === 0) return;

      html += '<div style="background: #e3f2fd; padding: 6px 12px; font-weight: bold; font-size: 12px; color: #1565c0;">📍 ' + loc + '</div>';
      html += '<table style="width: 100%; border-collapse: collapse; font-size: 11px;">';
      html += '<tr style="background: #e0e0e0;">';
      html += '<th style="padding: 5px; border: 1px solid #ddd;">Employee</th>';
      html += '<th style="padding: 5px; border: 1px solid #ddd;">Item #</th>';
      html += '<th style="padding: 5px; border: 1px solid #ddd;">Size</th>';
      html += '<th style="padding: 5px; border: 1px solid #ddd;">Change Out</th>';
      html += '<th style="padding: 5px; border: 1px solid #ddd;">Days Left</th>';
      html += '<th style="padding: 5px; border: 1px solid #ddd;">Pick List</th>';
      html += '<th style="padding: 5px; border: 1px solid #ddd;">Status</th>';
      html += '</tr>';

      swaps.forEach(function(swap, idx) {
        var bgColor = idx % 2 === 0 ? '#ffffff' : styles.altRowBg;
        var daysLeftColor = '#333';
        var daysNum = parseInt(swap.daysLeft, 10);
        if (!isNaN(daysNum)) {
          if (daysNum < 0) {
            bgColor = styles.urgentBg;
            daysLeftColor = styles.urgentColor;
          } else if (daysNum <= 14) {
            bgColor = styles.warningBg;
            daysLeftColor = styles.warningColor;
          }
        }

        html += '<tr style="background: ' + bgColor + ';">';
        html += '<td style="padding: 5px; border: 1px solid #ddd;">' + swap.employee + '</td>';
        html += '<td style="padding: 5px; border: 1px solid #ddd; text-align: center;">' + swap.itemNum + '</td>';
        html += '<td style="padding: 5px; border: 1px solid #ddd; text-align: center;">' + swap.size + '</td>';
        html += '<td style="padding: 5px; border: 1px solid #ddd; text-align: center;">' + swap.changeOutDate + '</td>';
        html += '<td style="padding: 5px; border: 1px solid #ddd; text-align: center; color: ' + daysLeftColor + '; font-weight: bold;">' + swap.daysLeft + '</td>';
        html += '<td style="padding: 5px; border: 1px solid #ddd; text-align: center;">' + swap.pickList + '</td>';
        html += '<td style="padding: 5px; border: 1px solid #ddd;">' + swap.status + '</td>';
        html += '</tr>';
      });

      html += '</table>';
    });

    html += '</div>';
  });

  if (!hasData) {
    html += '<p style="color: #2e7d32; text-align: center; padding: 20px;">✅ No swaps needed!</p>';
  }

  html += '</div></div>';
  return html;
}

/**
 * Builds the Reclaims section of the email.
 */
function buildReclaimsSection(ss, styles) {
  var sheet = ss.getSheetByName('Reclaims');
  if (!sheet || sheet.getLastRow() < 2) {
    return buildEmptySection('🔄 Reclaims', 'No reclaims data available.', styles);
  }

  var html = '<div style="background: white; border-radius: 8px; margin-bottom: 20px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">';
  html += '<div style="background: #e65100; color: ' + styles.headerColor + '; padding: 12px 15px; font-weight: bold; font-size: 16px;">🔄 Reclaims</div>';
  html += '<div style="padding: 15px;">';

  var data = sheet.getDataRange().getDisplayValues();
  var currentSection = '';
  var sectionData = [];
  var sections = {};

  for (var i = 0; i < data.length; i++) {
    var row = data[i];
    var firstCell = (row[0] || '').toString().trim();

    // Check for section headers
    if (firstCell.indexOf('Previous Employee') !== -1 ||
        firstCell.indexOf('Approved Class') !== -1 ||
        firstCell.indexOf('Class 3 Reclaims') !== -1 ||
        firstCell.indexOf('Class 2 Reclaims') !== -1 ||
        firstCell.indexOf('Lost Items') !== -1) {
      currentSection = firstCell;
      sections[currentSection] = [];
      continue;
    }

    // Skip headers and empty rows
    if (!firstCell || firstCell === 'Item Type' || firstCell === 'Employee' ||
        firstCell === 'Location' || firstCell.indexOf('📍') !== -1) continue;

    // Add data to current section
    if (currentSection && sections[currentSection]) {
      sections[currentSection].push(row);
    }
  }

  // Render Previous Employee Reclaims
  if (sections['Previous Employee Reclaims'] && sections['Previous Employee Reclaims'].length > 0) {
    html += buildReclaimsTable('⚠️ Previous Employee Reclaims', sections['Previous Employee Reclaims'],
      ['Item Type', 'Item #', 'Size', 'Class', 'Location', 'Status', 'Assigned To'], styles, '#ffcdd2');
  }

  // Render Class 3 Reclaims (if exists)
  Object.keys(sections).forEach(function(sectionName) {
    if (sectionName.indexOf('Class 3 Reclaims') !== -1 && sections[sectionName].length > 0) {
      html += buildReclaimsTable('⚠️ ' + sectionName, sections[sectionName],
        ['Employee', 'Item Type', 'Item #', 'Size', 'Class', 'Location', 'Pick List', 'Status'], styles, '#ffe0b2');
    }
    if (sectionName.indexOf('Class 2 Reclaims') !== -1 && sections[sectionName].length > 0) {
      html += buildReclaimsTable('⚠️ ' + sectionName, sections[sectionName],
        ['Employee', 'Item Type', 'Item #', 'Size', 'Class', 'Location', 'Pick List', 'Status'], styles, '#fff3e0');
    }
  });

  // Render Lost Items
  if (sections['Lost Items To Reclaim'] && sections['Lost Items To Reclaim'].length > 0) {
    html += buildReclaimsTable('❌ Lost Items To Reclaim', sections['Lost Items To Reclaim'],
      ['Employee', 'Item Type', 'Item #', 'Size', 'Class', 'Location', 'Pick List', 'Status'], styles, '#ffcdd2');
  }

  var hasContent = Object.keys(sections).some(function(k) {
    return sections[k] && sections[k].length > 0 && k !== 'Approved Class 3 Locations';
  });

  if (!hasContent) {
    html += '<p style="color: #2e7d32; text-align: center; padding: 20px;">✅ No reclaims needed!</p>';
  }

  html += '</div></div>';
  return html;
}

/**
 * Helper to build a reclaims table.
 */
function buildReclaimsTable(title, data, headers, styles, titleBg) {
  if (!data || data.length === 0) return '';

  var html = '<div style="margin-bottom: 15px;">';
  html += '<div style="background: ' + titleBg + '; padding: 8px 12px; font-weight: bold; border-radius: 4px 4px 0 0;">' + title + '</div>';
  html += '<table style="width: 100%; border-collapse: collapse; font-size: 11px;">';
  html += '<tr style="background: ' + styles.subHeaderBg + ';">';

  headers.forEach(function(h) {
    html += '<th style="padding: 5px; border: 1px solid #ddd;">' + h + '</th>';
  });
  html += '</tr>';

  data.forEach(function(row, idx) {
    var bgColor = idx % 2 === 0 ? '#ffffff' : styles.altRowBg;
    html += '<tr style="background: ' + bgColor + ';">';
    for (var c = 0; c < headers.length && c < row.length; c++) {
      html += '<td style="padding: 5px; border: 1px solid #ddd;">' + (row[c] || '') + '</td>';
    }
    html += '</tr>';
  });

  html += '</table></div>';
  return html;
}

/**
 * Helper to build an empty section placeholder.
 */
function buildEmptySection(title, message, styles) {
  var html = '<div style="background: white; border-radius: 8px; margin-bottom: 20px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">';
  html += '<div style="background: ' + styles.headerBg + '; color: ' + styles.headerColor + '; padding: 12px 15px; font-weight: bold; font-size: 16px;">' + title + '</div>';
  html += '<div style="padding: 20px; text-align: center; color: #666;">' + message + '</div>';
  html += '</div>';
  return html;
}

/**
 * Sends the weekly email report to all notification recipients.
 * Silently skips if no recipients are configured.
 */
function sendEmailReport() {
  try {
    var recipients = getNotificationRecipients();

    // If no recipients, show helpful message when called manually
    if (!recipients || recipients.length === 0) {
      logEvent('sendEmailReport: No notification recipients configured, skipping email.');
      try {
        SpreadsheetApp.getUi().alert('ℹ️ No Recipients Configured\n\nTo send email reports, add email addresses to the "Notification Emails" column (F) in the Employees sheet.');
      } catch (e) {
        // Ignore UI error if running from trigger - silently skip
      }
      return;
    }

    logEvent('Sending email report to ' + recipients.length + ' recipient(s)...');

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var timezone = ss.getSpreadsheetTimeZone();
    var now = new Date();
    var dateStr = Utilities.formatDate(now, timezone, 'MM/dd/yyyy');

    var subject = 'Rubber Tracker Weekly Report - ' + dateStr;
    var htmlBody = buildEmailReportHtml();

    // Send to all recipients
    recipients.forEach(function(email) {
      try {
        MailApp.sendEmail({
          to: email,
          subject: subject,
          htmlBody: htmlBody
        });
        logEvent('Email report sent to: ' + email);
      } catch (emailError) {
        logEvent('Failed to send email to ' + email + ': ' + emailError, 'ERROR');
      }
    });

    logEvent('Email report sending completed.');

    // Show confirmation if called manually (not from trigger)
    try {
      SpreadsheetApp.getUi().alert('✅ Email Report Sent!\n\nReport sent to ' + recipients.length + ' recipient(s):\n' + recipients.join('\n'));
    } catch (e) {
      // Ignore UI error if running from trigger
    }

  } catch (e) {
    logEvent('Error in sendEmailReport: ' + e, 'ERROR');
    throw e;
  }
}

/**
 * Creates a weekly time-driven trigger to send email reports on Monday at 12 PM.
 */
function createWeeklyEmailTrigger() {
  try {
    // Remove any existing email report triggers first
    removeEmailTrigger(true);  // silent mode

    // Create new weekly trigger for Monday at 12 PM
    ScriptApp.newTrigger('sendEmailReport')
      .timeBased()
      .onWeekDay(ScriptApp.WeekDay.MONDAY)
      .atHour(12)
      .create();

    logEvent('Weekly email report trigger created for Monday at 12 PM');
    SpreadsheetApp.getUi().alert('✅ Weekly Email Scheduled!\n\nEmail reports will be sent every Monday at 12 PM.\n\nMake sure to add email addresses in the "Notification Emails" column of the Employees sheet.');

  } catch (e) {
    logEvent('Error creating weekly email trigger: ' + e, 'ERROR');
    SpreadsheetApp.getUi().alert('❌ Error setting up weekly email: ' + e);
  }
}

/**
 * Removes the weekly email report trigger.
 * @param {boolean} silent - If true, don't show UI alerts
 */
function removeEmailTrigger(silent) {
  try {
    var triggers = ScriptApp.getProjectTriggers();
    var removed = 0;

    triggers.forEach(function(trigger) {
      if (trigger.getHandlerFunction() === 'sendEmailReport') {
        ScriptApp.deleteTrigger(trigger);
        removed++;
      }
    });

    if (removed > 0) {
      logEvent('Removed ' + removed + ' email report trigger(s)');
    }

    if (!silent) {
      if (removed > 0) {
        SpreadsheetApp.getUi().alert('✅ Scheduled Email Removed\n\nThe weekly email report has been disabled.');
      } else {
        SpreadsheetApp.getUi().alert('ℹ️ No Scheduled Email Found\n\nThere was no weekly email report scheduled.');
      }
    }

  } catch (e) {
    logEvent('Error removing email trigger: ' + e, 'ERROR');
    if (!silent) {
      SpreadsheetApp.getUi().alert('❌ Error removing scheduled email: ' + e);
    }
  }
}

