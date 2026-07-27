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

  ui.createMenu('Glove Manager')
      // === QUICK ACTIONS SIDEBAR ===
      .addItem('📱 Quick Actions', 'openQuickActionsSidebar')
      .addItem('🧭 Tab Navigator', 'showTabNavigatorSidebar')
      .addSeparator()

      // === STEP 1: IMPORT CREW MAKEUP ===
      .addSubMenu(ui.createMenu('📥 Import Crew Makeup')
        .addItem('👥 Import Crew Makeup', 'showCrewImportDialog')
        .addItem('👷 Assign Crew Leads', 'showAssignCrewLeadsDialog')
        .addItem('🔄 Sync Crews', 'menuSyncCrews')
        .addSeparator()
        .addSubMenu(ui.createMenu('🔧 Utilities')
          .addItem('📋 Setup Job Tracking Sheet', 'setupJobTrackingSheet')
          .addSeparator()
          .addItem('🔄 Refresh Job Tracking', 'refreshJobTrackingFromEmployees')
          .addItem('👤 Refresh Job Tracking Foremen', 'refreshJobTrackingForemen')
          .addItem('✅ Mark Job Complete', 'markJobComplete')
          .addItem('➕ Add Future Job', 'addFutureJob')
          .addItem('🎨 Apply Job Tracking Formatting', 'menuApplyJobTrackingFormatting')
          .addItem('📝 Backfill Job Names', 'backfillJobNames')
          .addItem('🔧 Repair Misassigned Foremen', 'repairMisassignedForemen')
          .addItem('🔍 Diagnose Crew Lead Dialog Skips', 'diagnoseCrewLeadDialogSkips')
          .addItem('🔍 Diagnose Crew Lead (026-26)', 'debugDiagnoseChris')
          .addItem('📂 View Job Tracking', 'openJobTrackingSheet')
          .addSeparator()
          .addItem('🔄 Sync Employee Locations from Job Tracking', 'syncEmployeeLocationsFromJobTracking')
          .addItem('🔄 Sync Completed Jobs to Training', 'syncCompletedJobsToTraining')
          .addItem('🧹 Cleanup Pending Training for Completed Jobs', 'cleanupPendingTrainingForCompletedJobs')
          .addItem('🔄 Sync Completed Job (Manual)', 'menuSyncCompletedJob')
          .addSeparator()
          .addItem('🗂️ View Saved Import Settings', 'showCrewImportSavedSettings')))

      // === STEP 2: GENERATE ALL REPORTS ===
      .addSubMenu(ui.createMenu('📊 Generate All Reports')
        .addItem('⚡ Generate All Reports', 'generateAllReports')
        .addSeparator()
        .addItem('Generate Glove Swaps', 'generateGloveSwaps')
        .addItem('Generate Sleeve Swaps', 'generateSleeveSwaps')
        .addItem('🧱 Generate Blanket Swaps', 'menuGenerateBlanketSwaps')
        .addItem('🧱 Generate MACK Swaps', 'menuGenerateMackSwaps')
        .addItem('⚡ Generate HV Tester Swaps', 'menuGenerateHVTesterSwaps')
        .addItem('⚡ Generate Phasing Set Swaps', 'menuGeneratePhasingSetSwaps')
        .addItem('🔴 Generate Hot Stick Swaps', 'menuGenerateHotStickSwaps')
        .addItem('🏥 Generate AED Swaps', 'menuGenerateAEDSwaps')
        .addItem('⚡ Generate Ground Swaps', 'menuGenerateGroundSwaps')
        .addSeparator()
        .addSubMenu(ui.createMenu('🔧 Utilities')
          .addItem('Fix All Change Out Dates', 'fixAllChangeOutDates')
          .addItem('🧱 Fix Blanket Change Out Dates', 'fixBlanketChangeOutDates')
          .addItem('🧱 Fix MACK Change Out Dates', 'fixMackChangeOutDates')
          .addItem('⚡ Setup Auto Change Out Dates', 'createEditTrigger')
          .addItem('💬 Configure SMS Web App', 'menuConfigureSMSWebApp')
          .addItem('🔄 Update Training Tracking Crew Leads', 'updateTrainingTrackingCrewLeads')
          .addItem('📊 Deploy Swaps Dashboards', 'deploySwapsDashboards')))

      // === STEPS 4, 5, 6: PROCESS SAFETY EMAILS ===
      .addSubMenu(ui.createMenu('🛡️ Process Safety Emails')
        .addItem('📥 Process Safety Emails (All)', 'showProcessSafetyEmailsDialog')
        .addItem('📋 Step 4: Process JHA Emails', 'showProcessJHAEmailsDialog')
        .addItem('🗣️ Step 5: Process Weekly Safety Emails', 'showProcessWeeklySafetyEmailsDialog')
        .addItem('🚛 Step 6: Process Monthly Checklist Emails', 'showProcessMonthlyChecklistDialog')
        .addItem('📊 View Equipment Needs', 'openSafetyReports')
        .addItem('📈 View Compliance History', 'openComplianceSheet')
        .addItem('⚙️ Manage Schedules (Job Tracking)', 'openJobTrackingSheet')
        .addSeparator()
        .addSubMenu(ui.createMenu('🔧 Utilities')
          .addItem('🔑 Authorize Gmail Access', 'authorizeGmailAccess')
          .addItem('📊 Gmail Status', 'showGmailStatus')
          .addItem('🔄 Sync Crews', 'menuSyncCrews')
          .addItem('👤 Refresh Foreman Names', 'refreshComplianceForemenNames')
          .addItem('🔽 Add Dropdowns to Compliance Sheet', 'addDropdownsToSafetyCompliance')
          .addItem('🧹 Cleanup N/A Cells (make blank)', 'cleanupNACellsInCompliance')
          .addItem('💬 Refresh Compliance Tooltips', 'menuRefreshComplianceTooltips')
          .addItem('🔄 Master Recalculate', 'masterRecalculateCompliance')
          .addItem('🔧 Fix Notes Column', 'fixNotesColumnCheckboxes'))
        .addSubMenu(ui.createMenu('📄 Logs')
          .addItem('📋 Setup Log Sheets', 'setupAllSafetyLogSheets')
          .addItem('📄 View JHA Log', 'openJHALogSheet')
          .addItem('📄 View Weekly Safety Log', 'openWeeklySafetyLogSheet')
          .addItem('📄 View Monthly Checklist Log', 'openMonthlyChecklistLogSheet')
          .addSeparator()
          .addItem('🔗 Add Gmail Links to JHA Log', 'menuApplyJHALogEmailLinks')
          .addItem('🔗 Add Gmail Links to Weekly Safety Log', 'menuApplyWeeklySafetyLogEmailLinks')
          .addItem('🔗 Add Gmail Links to Monthly Checklist Log', 'menuApplyMonthlyChecklistLogEmailLinks')
          .addItem('🔗 Add Gmail Links to Equipment Needs', 'backfillSafetyEquipmentEmailLinks')
          .addItem('🔗 Add Gmail Links to ALL Logs', 'menuApplyAllEmailLinks')
          .addItem('🔽 Sort & Format Log Sheets (by Month / Job)', 'sortLogSheetsNewestFirst'))
        .addSubMenu(ui.createMenu('🔍 Debug')
          .addItem('🔍 Diagnose Compliance', 'diagnoseSafetyCompliance')
          .addItem('📊 Trace Compliance Calculation', 'traceComplianceCalculation')
          .addItem('🧪 Test Week Calculation', 'testComplianceCalculationForWeek')
          .addItem('📋 Quick JHA Log Diagnostic', 'quickDiagnoseJHALog')
          .addItem('🔬 Trace Week Compliance', 'traceComplianceForWeek')
          .addItem('⚡ Force Update Single Week', 'forceUpdateSingleWeek')
          .addItem('🔬 Test Email Parsing', 'testEmailParsing')
          .addItem('🔎 Diagnose Specific Crew', 'diagnoseCrewCompliance')
          .addItem('🔎 Diagnose Historical Crews', 'diagnoseHistoricalCrews')
          .addItem('📋 Processing Status', 'showSafetyProcessingStatus')
          .addItem('🔍 Diagnose Gmail Search', 'diagnoseGmailSearch')
          .addItem('🔄 Reset Last Processed Date', 'clearLastSafetyProcessedDate')
          .addItem('🗓️ Ensure Current Week Exists', 'ensureCurrentWeekInCompliance')
          .addItem('🔎 Quick Gmail Check', 'quickGmailCheck')
          .addItem('🔬 Diagnose Email Log Overlap', 'diagnoseEmailLogOverlap')
          .addSeparator()
          .addItem('🔍 Diagnose Missing Crews', 'diagnoseMissingCrews')
          .addItem('➕ Force Add Active Crews', 'forceAddMissingCrewsToCompliance')
          .addSeparator()
          .addItem('🔍 Audit CreditedTo Values (Dry Run)', 'auditCreditedToAccuracy'))
        .addSubMenu(ui.createMenu('🧹 Cleanup')
          .addItem('📋 Create Tasks from Issues', 'createTasksFromSafetyIssues')
          .addItem('🔄 Refresh Safety Sheets', 'refreshSafetySheets')
          .addItem('📅 Regenerate Previous Week Tasks', 'menuRegeneratePreviousWeekTasks')
          .addItem('📅 Backfill Past Weeks', 'menuBackfillPastWeeks')
          .addItem('🎨 Reformat by Week', 'menuReformatComplianceSheet')
          .addSeparator()
          .addItem('🧹 Cleanup Equipment Sheet', 'cleanupSafetyReportsSheet')
          .addItem('🗄️ Archive Resolved Equipment', 'showArchiveResolvedEquipmentDialog')
          .addItem('🧹 Remove Duplicate Rows', 'menuCleanupDuplicateComplianceRows')
          .addItem('🧹 Remove Duplicate Log Entries', 'menuCleanupDuplicateLogEntries')
          .addItem('🧹 Remove Duplicate Equipment Needs', 'cleanupDuplicateEquipmentNeeds')
          .addItem('🚫 Remove False Positive Equipment Rows', 'cleanupFalsePositiveEquipmentNeeds')
          .addItem('🧹 Clear Saved Job Corrections', 'clearJobNumberCorrections')
          .addItem('🧹 Remove Non-Config Crews', 'removeNonConfigCrewsFromCompliance')
          .addItem('🧹 Remove Pre-Start Job Rows', 'removePreStartJobRowsFromCompliance')
          .addItem('➕ Add Job Mappings Manually', 'addMissingJobMappings')
          .addItem('🗑️ Clear & Reprocess All Emails', 'clearAndReprocessSafetyEmails')
          .addSeparator()
          .addItem('🔧 Fix Bad JHA Credit — Row 277 (045-16/Abilene)', 'fixBadJHACreditRow277')
          .addItem('↩️ Revert Bug-Fixed CreditedTo Entries', 'menuRevertBuggyFixedCreditedTo')))

      // === STEP 7: GENERATE TASK METADATA ===
      .addSubMenu(ui.createMenu('🎯 Generate Task Metadata')
        .addItem('🎯 Generate Task Metadata', 'generateTaskMetadata')
        .addItem('📊 Task Dashboard', 'showTaskDashboard')
        .addItem('🗄️ Archive Completed Tasks', 'showArchiveCompletedTasksDialog')
        .addSeparator()
        .addSubMenu(ui.createMenu('🔧 Utilities')
          .addItem('📋 Setup Task Metadata Sheet', 'setupTaskMetadataSheet')
          .addItem('🎨 Standardize Task Metadata Formatting', 'standardizeTaskMetadataFormatting')
          .addItem('🔧 Fix Task Metadata Status Validation', 'fixTaskMetadataStatusValidation')
          .addItem('🏥 Task Metadata Health Check', 'showTaskMetadataHealthCheck')
          .addItem('🧹 Remove Duplicate Task Metadata', 'removeDuplicateTaskMetadata')
          .addItem('🧽 Cleanup Orphaned Metadata', 'cleanupOrphanedTaskMetadata')
          .addItem('🧹 Cleanup Incorrect Safety Tasks', 'cleanupIncorrectSafetyReportTasks')
          .addItem('🗺️ Fix Training Task Locations', 'fixTrainingTaskLocations')))

      // === STEP 5: REVIEW & SCHEDULE ===
      .addSubMenu(ui.createMenu('📅 Review & Schedule')
        .addItem('📋 Tasks & Calendar', 'showToDoSchedule')
        .addItem('🗺️ Trip Planner', 'showTripPlannerDialog')
        .addItem('⚙️ Schedule Config', 'showToDoConfig')
        .addItem('📝 Daily Accomplishments', 'showTimeBreakdownDialog')
        .addSeparator()
        .addSubMenu(ui.createMenu('📚 Training')
          .addItem('Setup Training Config', 'setupTrainingConfig')
          .addItem('Setup Training Tracking', 'setupTrainingTracking')
          .addItem('➕ Add Missing Crews to Training', 'menuAddMissingCrewsToTraining')
          .addItem('🧹 Remove On Hold / Duplicate Rows', 'menuCleanupTrainingTrackingOnHoldRows')
          .addItem('🔄 Re-sort Training Tracking', 'resortTrainingTrackingChronologically')
          .addItem('🎨 Apply Training Tracking Formatting', 'menuApplyTrainingTrackingFormatting')
          .addItem('Refresh Training Attendees', 'refreshTrainingAttendees')
          .addItem('🔄 Update December Catch-Ups', 'updateDecemberCatchUps')
          .addItem('🕐 Setup Auto December Updates', 'setupAutoDecemberUpdates')
          .addItem('📊 Recalculate Training Completion %', 'recalculateAllTrainingCompletionStatus')
          .addItem('📊 Generate Compliance Report', 'generateTrainingComplianceReport')
          .addItem('🚑 Red Cross CPR CSV Roster', 'showRedCrossCprDialog')
          .addItem('🔄 Sync Training Tracking with Config', 'syncTrainingTrackingWithConfig')
          .addItem('🔍 Debug Training Config', 'debugTrainingConfig'))
        .addSubMenu(ui.createMenu('👷 Crew Visit')
          .addItem('Setup Crew Visit Config', 'setupCrewVisitConfig')
          .addItem('🔄 Refresh Crew Visit Config', 'refreshCrewVisitConfig'))
        .addSubMenu(ui.createMenu('🔧 Utilities')
          .addItem('📅 Generate Monthly Schedule', 'generateMonthlySchedule')
          .addItem('🔄 Refresh Calendar', 'refreshCalendar')
          .addItem('✅ Mark Visit Complete', 'markVisitComplete')
          .addItem('🧹 Clear Completed Tasks', 'clearCompletedTasks')
          .addItem('Setup All Schedule Sheets', 'setupAllScheduleSheets')
          .addItem('🗑️ Archive Old To Do List (Legacy)', 'archiveToDoListSheet')
            .addSeparator()
            .addItem('🏖️ Manage Holidays / Blackout Days', 'showManageHolidaysDialog')
            .addItem('💬 Configure SMS Web App', 'menuConfigureSMSWebApp')
            .addSeparator()
          .addItem('🔄 Migrate Manual Tasks Sheet', 'migrateManualTasksSheet')
          .addItem('🧹 Clean Up Manual Tasks', 'cleanupDuplicateManualTasks')
          .addItem('🗑️ Remove Auto-Generated Cert Tasks', 'cleanupAutoGeneratedCertTasksFromManualTasks')
          .addItem('🗑️ Purge Stuck Task by Location', 'promptPurgeTaskByLocation')))

      // === STEP 6: SAVE & BACKUP ===
      .addSubMenu(ui.createMenu('💾 Save & Backup')
        .addItem('💾 Save Current State to History', 'saveHistoryFast')
        .addItem('💾 Create Backup Snapshot', 'createBackupSnapshot')
        .addItem('📂 View Backup Folder', 'openBackupFolder')
        .addSeparator()
        .addSubMenu(ui.createMenu('📋 History')
          .addItem('Item History Lookup', 'showItemHistoryLookup')
          .addItem('View Full History', 'viewFullHistory'))
        .addSubMenu(ui.createMenu('📧 Email Reports')
          .addItem('📤 Send Report Now', 'sendEmailReport')
          .addItem('👁️ Preview My Report', 'previewEmailReport')
          .addItem('⚙️ Configure Email Reports', 'openEmailReportConfig')
          .addItem('🕐 Set Up Weekly Email (Mon 12 PM)', 'createWeeklyEmailTrigger')
          .addItem('🚫 Remove Scheduled Email', 'removeEmailTrigger')))

      .addSeparator()

      // === MAINTENANCE (Rarely Used) ===
      .addSubMenu(ui.createMenu('🔧 Maintenance')
        .addSubMenu(ui.createMenu('📦 Inventory')
          .addItem('🗄️ Archive Lost & Failed Items', 'showArchiveLostFailedDialog')
          .addItem('↩️ Restore Item from Archive', 'showRestoreFromArchiveDialog')
          .addSeparator()
          .addItem('⚡ View HV Testers', 'openHVTestersSheet')
          .addItem('⚡ View Phasing Sets', 'openPhasingSetsSheet')
          .addItem('🔴 View Hot Sticks', 'openHotSticksSheet')
          .addItem('🏥 View AED', 'openAEDSheet')
          .addItem('🧱 View MACKs', 'openMacksSheet')
          .addItem('⚡ View Grounds', 'openGroundsSheet')
          .addItem('⚡ Setup Grounds Sheet', 'setupGroundsSheet'))
        .addSubMenu(ui.createMenu('🛒 Purchase Orders')
          .addItem('📝 Create Purchase Order', 'showPurchaseOrderDialog')
          .addItem('📋 Order History', 'openPurchaseOrdersSheet')
          .addItem('⚙️ Manage Vendors', 'showVendorConfigDialog'))
        .addSubMenu(ui.createMenu('👥 Employees')
          .addItem('📝 Update Location Validation', 'updateEmployeesLocationValidation')
          .addItem('📤 Archive Previous Employees', 'archivePreviousEmployees')
          .addItem('🔄 Restore Deleted Employee', 'showRestoreEmployeeDialog')
          .addItem('🧹 Clean Up Duplicate Employee History', 'cleanupDuplicateEmployeeHistoryEntries')
          .addItem('🧹 Fix Bad Employee Names', 'cleanupBadEmployeeNames')
          .addItem('🧹 Clean Up Duplicate Item History', 'cleanupDuplicateItemHistory')
          .addItem('🔍 Scan for Bad Dates in History', 'scanEmployeeHistoryForBadDates')
          .addItem('📱 Format Phone Numbers', 'formatEmployeePhoneNumbers')
          .addItem('✅ Fix Last Day Reason Dropdown', 'fixLastDayReasonValidation')
          .addItem('👷 Setup Job Classification Dropdown', 'setupJobClassificationDropdown')
          .addItem('📖 View Classification Guide', 'showClassificationGuide')
          .addItem('🏷️ Add Alternate Names Column', 'setupAlternateNamesColumn'))
        .addSubMenu(ui.createMenu('📋 Job Tracking')
          .addItem('📂 View Job Tracking', 'openJobTrackingSheet')
          .addItem('🔄 Refresh Job Tracking', 'refreshJobTrackingFromEmployees')
          .addItem('✅ Mark Job Complete', 'markJobComplete')
          .addItem('➕ Add Future Job', 'addFutureJob'))
        .addSubMenu(ui.createMenu('🏗️ Sheets Setup')
          .addItem('🏗️ Build Sheets', 'buildSheets')
          .addItem('🔗 Add ESL ID Column (Gloves/Sleeves)', 'migrateGlovesSleevesSheetsForESLID')
          .addItem('🔍 Diagnose Gloves/Sleeves Columns', 'diagnoseInventoryColumns')
          .addItem('🔧 Repair Gloves/Sleeves Column Order', 'repairInventoryColumnOrder')
          .addItem('🔧 Restore Assigned To Column', 'restoreInventoryAssignedTo')
          .addItem('⚡ Setup HV Tester & Phasing Set Sheets', 'setupHVTesterAndPhasingSetSheets')
          .addItem('🔴 Setup Hot Sticks Sheet', 'setupHotSticksSheet')
          .addItem('🏥 Setup AED Sheet', 'setupAEDSheet')
          .addItem('⚡ Setup Grounds Sheet', 'setupGroundsSheet')
          .addItem('⚡ Setup Grounds History & Swaps Sheets', 'setupGroundsCompanionSheets')
          .addItem('🔍 Setup Locations Sheet', 'setupLocationsSheet')
          .addItem('🎨 Migrate Locations Rubber Class', 'migrateLocationsSheetForRubberClass')
          .addItem('➕ Add Crew Time Columns (Locations)', 'migrateLocationsCrewTime')
          .addItem('🗺️ Update Locations Routes (Fix Drive Times)', 'migrateLocationsRoutes')
          .addItem('🛰️ Refresh Drive Times (Google Maps)', 'refreshDriveTimesFromGoogleMaps')
          .addItem('🔍 View Locations', 'openLocationsSheet')
          .addItem('📍 Review New Locations', 'reviewNewLocations')
          .addItem('📅 Fiscal Year Config', 'showFiscalYearConfig')
          .addItem('📥 Import Data', 'showImportDialog')
          .addSeparator()
          .addItem('🧹 Clean & Sort Expiring Certs Sheet', 'removeExpCertRowGroups')
          .addItem('📜 Expiring Certs Setup', 'showExpiringCertsSetupDialog'))
        .addSeparator()
        .addItem('🔍 Diagnose Auth Issues', 'diagnoseAuthIssues')
        .addItem('🗑️ Clear Background Triggers', 'clearAllBackgroundTriggers'))

      // === DEBUG ===
      .addSubMenu(ui.createMenu('🔍 Debug')
        .addItem('Test Edit Trigger', 'testEditTrigger')
        .addItem('Recalc Current Row', 'recalcCurrentRow')
        .addSeparator()
        .addItem('🔍 Diagnose Employee Pick List', 'runDiagnostic')
        .addItem('📊 Show All Sleeve Swaps', 'runSleeveSwapDiagnostic')
        .addItem('📊 Show All Glove Swaps', 'runGloveSwapDiagnostic')
        .addSeparator()
        .addItem('🧪 Test Trip Planner Data', 'debugTripPlannerData'))

      .addSeparator()
      .addItem('Close & Save History', 'closeAndSaveHistory')
      .addToUi();
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

