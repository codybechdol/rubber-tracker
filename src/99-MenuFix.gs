/**
 * MANUAL MENU CREATOR - Run this if menu doesn't appear
 *
 * If the menu is not showing after refresh:
 * 1. Open Apps Script Editor
 * 2. Select this function: forceCreateMenu
 * 3. Click Run
 * 4. Go back to spreadsheet and refresh
 *
 * LAST SYNCED: June 1, 2026 - onOpen() now delegates here; single source of truth
 */

/**
 * Shared menu builder — called by both onOpen() and forceCreateMenu().
 * Keeping all menu strings here avoids emoji encoding issues in Code.gs.
 */
function _buildGloveManagerMenu() {
  var ui = SpreadsheetApp.getUi();

  ui.createMenu('Safety Assistant')
      // === QUICK ACTIONS & TAB NAVIGATOR ===
      .addItem('📱 Quick Actions', 'openQuickActionsSidebar')
      .addItem('🧭 Tab Navigator', 'showTabNavigatorSidebar')
      .addSeparator()

      // === STEP 1: IMPORT CREW MAKEUP ===
      .addSubMenu(ui.createMenu('📥 Import Crew Makeup')
        .addItem('👥 Import Crew Makeup', 'showCrewImportDialog')
        .addItem('👷 Assign Crew Leads', 'showAssignCrewLeadsDialog')
        .addItem('🔄 Sync Crews', 'menuSyncCrews')
        .addItem('📂 View Job Tracking', 'openJobTrackingSheet'))

      // === STEP 2: GENERATE ALL REPORTS ===
      .addSubMenu(ui.createMenu('📊 Generate All Reports')
        .addItem('⚡ Generate All Reports', 'generateAllReports')
        .addItem('📊 Deploy Swaps Dashboards', 'deploySwapsDashboards')
        .addItem('⏳ Inventory Aging & Fleet Lifecycle', 'showInventoryAgingReportDialog')
        .addSeparator()
        .addItem('Generate Glove Swaps', 'generateGloveSwaps')
        .addItem('Generate Sleeve Swaps', 'generateSleeveSwaps')
        .addItem('🧱 Generate Blanket Swaps', 'menuGenerateBlanketSwaps')
        .addItem('🧱 Generate MACK Swaps', 'menuGenerateMackSwaps')
        .addItem('⚡ Generate HV Tester Swaps', 'menuGenerateHVTesterSwaps')
        .addItem('⚡ Generate Phasing Set Swaps', 'menuGeneratePhasingSetSwaps')
        .addItem('⚡ Generate Ground Swaps', 'menuGenerateGroundSwaps')
        .addItem('🔴 Generate Hot Stick Swaps', 'menuGenerateHotStickSwaps')
        .addItem('🏥 Generate AED Swaps', 'menuGenerateAEDSwaps'))

      // === STEP 3: PROCESS SAFETY EMAILS ===
      .addSubMenu(ui.createMenu('🛡️ Process Safety Emails')
        .addItem('📥 Process Safety Emails (All)', 'showProcessSafetyEmailsDialog')
        .addItem('📊 View Equipment Needs', 'openSafetyReports')
        .addItem('📈 View Compliance History', 'openComplianceSheet')
        .addItem('🗄️ Archive Resolved Equipment', 'showArchiveResolvedEquipmentDialog')
        .addItem('🔗 Restore Email Links (All Logs)', 'menuApplyAllEmailLinks')
        .addItem('📊 Gmail Status', 'showGmailStatus'))

      // === STEP 4: REVIEW & SCHEDULE ===
      .addSubMenu(ui.createMenu('📅 Review & Schedule')
        .addItem('🗺️ Trip Planner (Desktop App)', 'showTripPlannerDialog')
        .addItem('📋 Tasks & Calendar (Desktop App)', 'showToDoSchedule')
        .addItem('⚙️ Schedule Config', 'showToDoConfig')
        .addItem('📝 Daily Accomplishments', 'showTimeBreakdownDialog')
        .addSeparator()
        .addSubMenu(ui.createMenu('📧 Weekly Email Reports')
          .addItem('⏰ Schedule Weekly Auto-Send...', 'showScheduleWeeklyEmailDialog')
          .addItem('⚙️ Configure Recipients & Sections', 'setupEmailReportConfig')
          .addItem('👁️ Preview My Report', 'previewEmailReport')
          .addItem('📤 Send Report Now', 'sendEmailReport')
          .addItem('🛑 Cancel Scheduled Auto-Send', 'removeEmailTrigger')))

      // === STEP 5: SAVE & BACKUP ===
      .addSubMenu(ui.createMenu('💾 Save & Backup')
        .addItem('💾 Save Current State to History', 'saveHistoryFast')
        .addItem('📥 Import Item History Log', 'showImportItemHistoryDialog')
        .addItem('🧹 Clean & Repair History Sheets', 'menuCleanHistorySheets')
        .addItem('💾 Create Backup Snapshot', 'createBackupSnapshot')
        .addItem('↩️ Restore Gloves from Backup...', 'menuRestoreGlovesFromBackup')
        .addItem('🔄 Export Offline Snapshot (Desktop App)', 'menuExportSyncSnapshot')
        .addItem('📂 View Backup Folder', 'openBackupFolder'))

      .addSeparator()

      // === STEP 6: MAINTENANCE & SYSTEM SETUP ===
      .addSubMenu(ui.createMenu('🔧 Maintenance')
        .addSubMenu(ui.createMenu('🏗️ Sheets Setup')
          .addItem('📜 Certification Expectations & Requirements', 'showExpiringCertsSetupDialog')
          .addItem('🔄 Sync Full Certs Matrix (All Employees)', 'syncExpiringCertsSheetFullRoster')
          .addItem('🎨 Fix Expiring Certs Colors & Formatting', 'menuFixExpiringCertsFormatting')
          .addItem('🧹 Purge Non-Employee Rows (Expiring Certs)', 'menuCleanExpiringCertsSheet')
          .addSeparator()
          .addItem('🏗️ Build Sheets', 'buildSheets')
          .addItem('📅 Fiscal Year Config', 'showFiscalYearConfig')
          .addItem('🔗 Add ESL ID Column (Gloves/Sleeves)', 'migrateGlovesSleevesSheetsForESLID')
          .addItem('⚡ Setup HV Tester & Phasing Set Sheets', 'setupHVTesterAndPhasingSetSheets')
          .addItem('🔴 Setup Hot Sticks Sheet', 'setupHotSticksSheet')
          .addItem('🏥 Setup AED Sheet', 'setupAEDSheet')
          .addItem('⚡ Setup Grounds Sheet', 'setupGroundsSheet')
          .addItem('🔍 Setup Locations Sheet', 'setupLocationsSheet')
          .addItem('💬 Edit Stock SMS Messages', 'showSmsTemplateConfigDialog')
          .addItem('💬 Configure SMS Web App', 'menuConfigureSMSWebApp'))

        .addSubMenu(ui.createMenu('📦 Inventory & Equipment')
          .addItem('⚡ View HV Testers', 'openHVTestersSheet')
          .addItem('⚡ View Phasing Sets', 'openPhasingSetsSheet')
          .addItem('🔴 View Hot Sticks', 'openHotSticksSheet')
          .addItem('🏥 View AED', 'openAEDSheet')
          .addItem('🧱 View MACKs', 'openMacksSheet')
          .addItem('⚡ View Grounds', 'openGroundsSheet')
          .addItem('🗄️ Archive Lost & Failed Items', 'showArchiveLostFailedDialog')
          .addItem('↩️ Restore Item from Archive', 'showRestoreFromArchiveDialog')
          .addSeparator()
          .addItem('📥 Import Item History Log', 'showImportItemHistoryDialog')
          .addItem('🧹 Clean & Repair History Sheets', 'menuCleanHistorySheets')
          .addItem('🧹 Clean Up Located Items & Formatting', 'menuCleanupLocatedItems'))

        .addSubMenu(ui.createMenu('🛒 Purchase Orders')
          .addItem('📝 Create Purchase Order', 'showPurchaseOrderDialog')
          .addItem('📋 Order History', 'openPurchaseOrdersSheet')
          .addItem('⚙️ Manage Vendors', 'showVendorConfigDialog'))

        .addSubMenu(ui.createMenu('👥 Employees')
          .addItem('📋 Organize & Format Employees Sheet', 'organizeAndFormatEmployeesSheet')
          .addItem('📝 Update Location Validation', 'updateEmployeesLocationValidation')
          .addItem('📤 Archive Previous Employees', 'archivePreviousEmployees')
          .addItem('🔄 Restore Deleted Employee', 'showRestoreEmployeeDialog')
          .addItem('👷 Setup Job Classification Dropdown', 'setupJobClassificationDropdown')
          .addItem('📖 View Classification Guide', 'showClassificationGuide')
          .addItem('📱 Format Phone Numbers', 'formatEmployeePhoneNumbers'))

        .addSubMenu(ui.createMenu('📋 Job Tracking')
          .addItem('📂 View Job Tracking', 'openJobTrackingSheet')
          .addItem('🔄 Refresh Job Tracking', 'refreshJobTrackingFromEmployees')
          .addItem('👤 Refresh Job Tracking Foremen', 'refreshJobTrackingForemen')
          .addItem('📐 Auto-Configure Secondary Jobs (Mark N/A)', 'menuAutoConfigureSecondaryJobs')
          .addItem('✅ Mark Job Complete', 'markJobComplete')
          .addItem('🧹 Clean Completed Secondary Jobs', 'menuCleanupCompletedSecondaryJobs')
          .addItem('➕ Add Future Job', 'addFutureJob'))

        .addSubMenu(ui.createMenu('📚 Training & Calendar')
          .addItem('Setup Training Config', 'setupTrainingConfig')
          .addItem('Setup Training Tracking', 'setupTrainingTracking')
          .addItem('➕ Add Missing Crews to Training', 'menuAddMissingCrewsToTraining')
          .addItem('Refresh Training Attendees', 'refreshTrainingAttendees')
          .addItem('📊 Recalculate Training Completion %', 'recalculateAllTrainingCompletionStatus')
          .addItem('🚑 Red Cross CPR CSV Roster', 'showRedCrossCprDialog'))

        .addSubMenu(ui.createMenu('🔍 Diagnostics & Utilities')
          .addItem('🔍 Diagnose Auth Issues', 'diagnoseAuthIssues')
          .addItem('🔍 Diagnose Employee Pick List', 'runDiagnostic')
          .addItem('📊 Show All Glove Swaps', 'runGloveSwapDiagnostic')
          .addItem('📊 Show All Sleeve Swaps', 'runSleeveSwapDiagnostic')
          .addItem('🔍 Diagnose Compliance', 'diagnoseSafetyCompliance')
          .addItem('🔍 Audit CreditedTo Values', 'auditCreditedToAccuracy')
          .addItem('🗑️ Clear Background Triggers', 'clearAllBackgroundTriggers')
          .addItem('🔄 Reset Stuck Background Statuses', 'menuResetBackgroundStatuses')))

      .addSeparator()
      .addItem('Close & Save History', 'closeAndSaveHistory')
      .addToUi();
}

/**
 * Menu wrapper to reset background job statuses and script properties.
 */
function menuResetBackgroundStatuses() {
  var result = clearAllBackgroundStatuses();
  var ui = SpreadsheetApp.getUi();
  if (result && result.success) {
    ui.alert('🔄 Background Statuses Reset', 'Successfully cleared all background job status flags in ScriptProperties.', ui.ButtonSet.OK);
  } else {
    ui.alert('❌ Error', 'Could not clear background statuses: ' + (result ? result.error : 'Unknown error'), ui.ButtonSet.OK);
  }
}

/**
 * Manually recreate the menu (run from Apps Script editor if menu is missing).
 */
function forceCreateMenu() {
  try {
    _buildGloveManagerMenu();
    SpreadsheetApp.getUi().alert('✅ Menu Created!\n\nThe Glove Manager menu has been added.\nIt now matches the 6-step Monday workflow.\n\nRefresh your spreadsheet (Ctrl+R) to see it.');

  } catch (e) {
    SpreadsheetApp.getUi().alert('❌ Error creating menu: ' + e.toString());
  }
}

// =============================================================================
// MENU STUBS & WRAPPERS FOR UNIMPLEMENTED FEATURES
// =============================================================================

/**
 * Stub for "Repair Misassigned Foremen"
 */
function repairMisassignedForemen() {
  SpreadsheetApp.getUi().alert(
    '🔧 Repair Misassigned Foremen',
    'This diagnostic utility is under development.\n\nIt is designed to audit and repair foreman assignment discrepancies between Job Tracking and Employees sheets.',
    SpreadsheetApp.getUi().ButtonSet.OK
  );
}

/**
 * Stub for "Diagnose Crew Lead Dialog Skips"
 */
function diagnoseCrewLeadDialogSkips() {
  SpreadsheetApp.getUi().alert(
    '🔍 Diagnose Crew Lead Dialog Skips',
    'This diagnostic utility is under development.\n\nIt will analyze and report why crew lead assignments are skipped during crew imports or Dialog creation.',
    SpreadsheetApp.getUi().ButtonSet.OK
  );
}

/**
 * Stub for "Fix Bad JHA Credit — Row 277"
 */
function fixBadJHACreditRow277() {
  SpreadsheetApp.getUi().alert(
    '🔧 Fix Bad JHA Credit — Row 277',
    'This cleanup routine is a one-off task for Row 277 JHA credit. Its implementation is currently archived.',
    SpreadsheetApp.getUi().ButtonSet.OK
  );
}

/**
 * Wrapper for "Add Missing Crews to Training"
 */
function menuAddMissingCrewsToTraining() {
  var ui = SpreadsheetApp.getUi();
  try {
    var result = addMissingCrewsToTrainingTracking();
    var count = result.addedRows;
    var list = result.crews;
    var details = count > 0 ? 
      'Added ' + count + ' training rows for: ' + list.join(', ') : 
      'No missing training rows were found.';
    ui.alert('➕ Add Missing Crews to Training', 'Check complete!\n\n' + details, ui.ButtonSet.OK);
  } catch (e) {
    ui.alert('❌ Error Adding Crews to Training', 'Failed to add missing crews: ' + e.toString(), ui.ButtonSet.OK);
  }
}

/**
 * Stub for "Remove On Hold / Duplicate Rows" (Training)
 */
function menuCleanupTrainingTrackingOnHoldRows() {
  SpreadsheetApp.getUi().alert(
    '🧹 Remove On Hold / Duplicate Rows',
    'This cleanup feature is currently a placeholder.\n\nTraining Tracking automatically cleans up completed/on-hold rows during execution.',
    SpreadsheetApp.getUi().ButtonSet.OK
  );
}

/**
 * Re-sort Training Tracking chronologically then alphabetically by crew
 */
function resortTrainingTrackingChronologically() {
  var ui = SpreadsheetApp.getUi();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Training Tracking');
  if (!sheet) {
    ui.alert('❌ Error', 'Training Tracking sheet not found.', ui.ButtonSet.OK);
    return;
  }
  
  var data = sheet.getDataRange().getValues();
  var headerRowIdx = findTrainingTrackingHeaderRow(data);
  var headers = data[headerRowIdx];
  var cols = getTrainingTrackingColIndices(headers);
  var dataStartIdx = headerRowIdx + 1;
  var monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  
  var sortSuccess = false;
  try {
    if (data.length > dataStartIdx + 1) {
      var range = sheet.getRange(dataStartIdx + 1, 1, data.length - dataStartIdx, headers.length);
      var allData = range.getValues();
      allData.sort(function(a, b) {
        var monthA = monthNames.indexOf(String(a[cols.month] || '').trim());
        var monthB = monthNames.indexOf(String(b[cols.month] || '').trim());
        if (monthA !== monthB) return monthA - monthB;
        return String(a[cols.crew] || '').localeCompare(String(b[cols.crew] || ''));
      });
      range.setValues(allData);
      sortSuccess = true;
    }
  } catch (e) {
    Logger.log('resortTrainingTrackingChronologically: Sort skipped (typed column sheet): ' + e.toString());
  }

  // ALWAYS apply formatting to refresh alternating colors and conditional formatting rules
  try {
    applyTrainingTrackingFormatting(sheet);
    if (sortSuccess) {
      ui.alert('✅ Re-sorted and Formatted', 'Successfully re-sorted Training Tracking chronologically by month, then alphabetically by crew, and refreshed visual formatting.', ui.ButtonSet.OK);
    } else {
      ui.alert('✅ Formatted', 'Refreshed conditional formatting and month colors.\n\nNote: Row sorting was skipped because this sheet contains a Google Table (which handles sorting internally).', ui.ButtonSet.OK);
    }
  } catch (fmtErr) {
    ui.alert('❌ Error applying formatting: ' + fmtErr.toString(), ui.ButtonSet.OK);
  }
}

/**
 * Wrapper for "Remove Auto-Generated Cert Tasks"
 */
function cleanupAutoGeneratedCertTasksFromManualTasks() {
  var ui = SpreadsheetApp.getUi();
  try {
    var count = cleanupCertTasksFromManualTasks();
    ui.alert('🧹 Cert Tasks Cleaned Up', 'Removed ' + count + ' auto-generated certification tasks from Manual Tasks.', ui.ButtonSet.OK);
  } catch (e) {
    ui.alert('❌ Error Cleaning Cert Tasks', e.toString(), ui.ButtonSet.OK);
  }
}

/**
 * Stub for "Archive Lost & Failed Items"
 */
function showArchiveLostFailedDialog() {
  SpreadsheetApp.getUi().alert(
    '🗄️ Archive Lost & Failed Items',
    'The "Archive Lost & Failed Items" dialog is currently a placeholder and is planned for a future release.',
    SpreadsheetApp.getUi().ButtonSet.OK
  );
}

/**
 * Stub for "Restore Item from Archive"
 */
function showRestoreFromArchiveDialog() {
  SpreadsheetApp.getUi().alert(
    '↩️ Restore Item from Archive',
    'The "Restore Item from Archive" dialog is currently a placeholder and is planned for a future release.',
    SpreadsheetApp.getUi().ButtonSet.OK
  );
}

