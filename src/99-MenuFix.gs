/**
 * MANUAL MENU CREATOR - Run this if menu doesn't appear
 *
 * If the menu is not showing after refresh:
 * 1. Open Apps Script Editor
 * 2. Select this function: forceCreateMenu
 * 3. Click Run
 * 4. Go back to spreadsheet and refresh
 */
function forceCreateMenu() {
  try {
    var ui = SpreadsheetApp.getUi();

    // Create the streamlined menu structure (matches onOpen in Code.gs)
    ui.createMenu('Glove Manager')
      // ===== PRIMARY ENTRY POINT =====
      .addItem('📱 Quick Actions', 'openQuickActionsSidebar')
      .addSeparator()

      // ===== REPORTS =====
      .addSubMenu(ui.createMenu('📊 Reports')
        .addItem('📋 Generate All Reports', 'generateAllReports')
        .addSeparator()
        .addItem('🧤 Generate Glove Swaps', 'generateGloveSwaps')
        .addItem('💪 Generate Sleeve Swaps', 'generateSleeveSwaps')
        .addItem('🛒 Update Purchase Needs', 'updatePurchaseNeeds')
        .addItem('♻️ Update Reclaims Sheet', 'updateReclaimsSheet')
        .addSeparator()
        .addItem('📝 Daily Accomplishments', 'showTimeBreakdownDialog'))

      // ===== SCHEDULING =====
      .addSubMenu(ui.createMenu('📅 Scheduling')
        .addItem('📋 Tasks & Calendar', 'showToDoSchedule')
        .addItem('🗺️ Trip Planner', 'showTripPlannerDialog')
        .addItem('⚙️ Schedule Config', 'showToDoConfig')
        .addItem('📊 Task Dashboard', 'showTaskDashboard')
        .addSeparator()
        .addItem('🎯 Generate Task Metadata', 'generateTaskMetadata'))

      // ===== SAFETY =====
      .addSubMenu(ui.createMenu('🛡️ Safety')
        .addItem('🔑 Authorize Gmail Access', 'authorizeGmailAccess')
        .addItem('📊 Gmail Status', 'showGmailStatus')
        .addSeparator()
        .addItem('📥 Process Safety Emails', 'showProcessSafetyEmailsDialog')
        .addItem('📊 Compliance Dashboard', 'showComplianceDashboard')
        .addItem('📈 View Compliance History', 'openComplianceSheet')
        .addItem('⚙️ Manage Schedules (Job Tracking)', 'openJobTrackingSheet')
        .addItem('🔄 Sync Crews', 'menuSyncCrews')
        .addSeparator()
        .addItem('📋 Setup Log Sheets', 'setupAllSafetyLogSheets')
        .addItem('📄 View JHA Log', 'openJHALogSheet')
        .addItem('📄 View Weekly Safety Log', 'openWeeklySafetyLogSheet')
        .addItem('📄 View Monthly Checklist Log', 'openMonthlyChecklistLogSheet')
        .addSeparator()
        .addItem('🔄 Master Recalculate', 'masterRecalculateCompliance')
        .addItem('🔄 Recalculate Compliance', 'recalculateComplianceFromLogs')
        .addItem('🔄 Recalculate ALL Weeks', 'recalculateAllComplianceFromLogs')
        .addItem('🔧 Fix Log Entries & Recalculate', 'menuFixAndRecalculateCompliance')
        .addSeparator()
        .addItem('📋 Create Tasks from Issues', 'createTasksFromSafetyIssues')
        .addItem('🔄 Refresh Safety Sheets', 'refreshSafetySheets')
        .addItem('🗓️ Ensure Current Week Exists', 'ensureCurrentWeekInCompliance')
        .addItem('🔎 Quick Gmail Check', 'quickGmailCheck'))

      // ===== PURCHASE ORDERS =====
      .addSubMenu(ui.createMenu('🛒 Purchase Orders')
        .addItem('📝 Create Purchase Order', 'showPurchaseOrderDialog')
        .addItem('📋 Order History', 'openPurchaseOrdersSheet')
        .addItem('⚙️ Manage Vendors', 'showVendorConfigDialog'))

      // ===== EMAIL =====
      .addSubMenu(ui.createMenu('📧 Email Reports')
        .addItem('📤 Send Report Now', 'sendEmailReport')
        .addItem('👁️ Preview My Report', 'previewEmailReport')
        .addSeparator()
        .addItem('⚙️ Configure Email Reports', 'openEmailReportConfig')
        .addItem('🕐 Set Up Weekly Email', 'createWeeklyEmailTrigger'))

      // ===== HISTORY =====
      .addSubMenu(ui.createMenu('📋 History')
        .addItem('💾 Save Current State', 'saveHistory')
        .addItem('🔍 Item History Lookup', 'showItemHistoryLookup')
        .addItem('📂 View Full History', 'viewFullHistory'))

      .addSeparator()

      // ===== SETUP & ADMIN =====
      .addSubMenu(ui.createMenu('⚙️ Setup & Admin')
        .addItem('📋 Setup All Schedule Sheets', 'setupAllScheduleSheets')
        .addItem('📋 Setup Task Metadata Sheet', 'setupTaskMetadataSheet')
        .addItem('👥 Setup Crew Visit Config', 'setupCrewVisitConfig')
        .addItem('📚 Setup Training Config', 'setupTrainingConfig')
        .addItem('📊 Setup Training Tracking', 'setupTrainingTracking')
        .addSeparator()
        .addItem('👥 Import Crew Makeup', 'showCrewImportDialog')
        .addItem('📥 Import Data', 'showImportDialog')
        .addSeparator()
        .addItem('💾 Create Backup Snapshot', 'createBackupSnapshot')
        .addItem('📂 View Backup Folder', 'openBackupFolder'))

      // ===== MAINTENANCE =====
      .addSubMenu(ui.createMenu('🧹 Maintenance')
        .addItem('🗄️ Archive Completed Tasks', 'showArchiveCompletedTasksDialog')
        .addItem('🏥 Task Metadata Health Check', 'showTaskMetadataHealthCheck')
        .addItem('🧽 Cleanup Orphaned Metadata', 'cleanupOrphanedTaskMetadata')
        .addSeparator()
        .addItem('📤 Archive Previous Employees', 'archivePreviousEmployees')
        .addItem('🔄 Refresh Crew Visit Config', 'refreshCrewVisitConfig')
        .addItem('🔄 Refresh Training Crew Leads', 'refreshTrainingTrackingCrewLeads')
        .addItem('🎨 Apply Training Tracking Formatting', 'menuApplyTrainingTrackingFormatting')
        .addSeparator()
        .addItem('⚡ Setup Auto Change Out Dates', 'createEditTrigger')
        .addItem('🔧 Fix All Change Out Dates', 'fixAllChangeOutDates'))

      // ===== ADVANCED (Hidden unless needed) =====
      .addSubMenu(ui.createMenu('🔧 Advanced')
        .addItem('🔍 Diagnose Auth Issues', 'diagnoseAuthIssues')
        .addItem('🗑️ Clear Background Triggers', 'clearAllBackgroundTriggers')
        .addSeparator()
        .addItem('🧹 Remove Duplicate Task Metadata', 'removeDuplicateTaskMetadata')
        .addItem('🧹 Cleanup Duplicate Safety Tasks', 'menuCleanupDuplicateSafetyTasks')
        .addItem('🧹 Cleanup Duplicate Compliance Rows', 'menuCleanupDuplicateComplianceRows')
        .addItem('🧹 Clean Up Manual Tasks', 'cleanupDuplicateManualTasks'))

      .addSeparator()
      .addItem('💾 Close & Save History', 'closeAndSaveHistory')
      .addToUi();

    SpreadsheetApp.getUi().alert('✅ Menu Created!\n\nThe Glove Manager menu has been added.\n\nRefresh your spreadsheet (Ctrl+R) to see it.');

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

