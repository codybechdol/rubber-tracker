/**
 * MANUAL MENU CREATOR - Run this if menu doesn't appear
 *
 * If the Schedule menu is not showing after refresh:
 * 1. Open Apps Script Editor
 * 2. Select this function: forceCreateMenu
 * 3. Click Run
 * 4. Go back to spreadsheet and refresh
 */
function forceCreateMenu() {
  try {
    var ui = SpreadsheetApp.getUi();


    // Create the full menu structure
    ui.createMenu('Glove Manager')
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
      .addSubMenu(ui.createMenu('📅 Schedule')
        .addItem('Setup All Schedule Sheets', 'setupAllScheduleSheets')
        .addSeparator()
        .addItem('Setup Crew Visit Config', 'setupCrewVisitConfig')
        .addItem('Setup Training Config', 'setupTrainingConfig')
        .addItem('Setup Training Tracking', 'setupTrainingTracking')
        .addSeparator()
        .addItem('Refresh Training Attendees', 'refreshTrainingAttendees')
        .addSeparator()
        .addItem('📊 Generate Compliance Report', 'generateTrainingComplianceReport'))
      .addSubMenu(ui.createMenu('🔧 Utilities')
        .addItem('Fix All Change Out Dates', 'fixAllChangeOutDates')
        .addItem('⚡ Setup Auto Change Out Dates', 'createEditTrigger')
        .addItem('📤 Archive Previous Employees', 'archivePreviousEmployees')
        .addItem('🔄 Update Employee History Headers', 'updateEmployeeHistoryHeaders')
        .addSeparator()
        .addItem('📦 Reset Known Item Numbers', 'resetKnownItemNumbers')
        .addItem('🔄 Sync New Items Log', 'syncNewItemsLogWithInventory')
        .addSeparator()
        .addItem('👷 Setup Job Classification Dropdown', 'setupJobClassificationDropdown')
        .addItem('📖 View Classification Guide', 'showClassificationGuide')
        .addSeparator()
        .addItem('📥 Import Data', 'showImportDialog')
        .addItem('📥 Quick Import (1084)', 'importProvidedData')
        .addItem('🔍 View Crew Import Saved Settings', 'showCrewImportSavedSettings')
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
      .addSeparator()
      .addSeparator()
      .addItem('Close & Save History', 'closeAndSaveHistory')
      .addToUi();

    SpreadsheetApp.getUi().alert('✅ Menu Created!\n\nThe Schedule menu has been added.\n\nRefresh your spreadsheet (Ctrl+R) to see it.');

  } catch (e) {
    SpreadsheetApp.getUi().alert('❌ Error creating menu: ' + e.toString());
  }
}

/**
 * DIRECT SETUP - Run this to create sheets without using menu
 *
 * If you can't see the menu at all, run this to create the sheets directly:
 * 1. Open Apps Script Editor
 * 2. Select this function: directSetupScheduling
 * 3. Click Run
 * 4. Sheets will be created automatically
 */
function directSetupScheduling() {
  try {
    setupCrewVisitConfig();
    setupTrainingConfig();
    setupTrainingTracking();
    SpreadsheetApp.getUi().alert('✅ Scheduling Sheets Created!\n\nThree new sheets have been added:\n- Crew Visit Config\n- Training Config\n- Training Tracking\n\nCheck your spreadsheet tabs!');
  } catch (e) {
    SpreadsheetApp.getUi().alert('❌ Error: ' + e.toString());
  }
}

/**
 * TEST FUNCTION - Verify scheduling functions exist
 */
function testSchedulingFunctions() {
  var results = 'Function Test Results:\n\n';

  results += 'setupCrewVisitConfig: ' + (typeof setupCrewVisitConfig === 'function' ? '✅ Found' : '❌ Missing') + '\n';
  results += 'setupTrainingConfig: ' + (typeof setupTrainingConfig === 'function' ? '✅ Found' : '❌ Missing') + '\n';
  results += 'setupTrainingTracking: ' + (typeof setupTrainingTracking === 'function' ? '✅ Found' : '❌ Missing') + '\n';
  results += 'setupAllScheduleSheets: ' + (typeof setupAllScheduleSheets === 'function' ? '✅ Found' : '❌ Missing') + '\n';
  results += 'generateTrainingComplianceReport: ' + (typeof generateTrainingComplianceReport === 'function' ? '✅ Found' : '❌ Missing') + '\n';

  SpreadsheetApp.getUi().alert('🧪 Function Test', results, SpreadsheetApp.getUi().ButtonSet.OK);
}

