/**
 * Glove Manager – Menu & UI Functions
 *
 * Functions for creating menus and UI elements.
 */

/**
 * Creates the Glove Manager menu when the spreadsheet opens.
 * This is a simple trigger that runs automatically.
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

