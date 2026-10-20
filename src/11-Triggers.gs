/**
 * Glove Manager – Trigger Functions
 *
 * Enforces the Single Source of Truth architecture:
 * Google Sheets is strictly a passive cloud data repository (database backend).
 * ALL edits, creations, deletions, and status updates MUST originate from the Safety Assistant Desktop App.
 *
 * Direct manual edits in Google Sheets are blocked and reverted by onEdit(e) triggers
 * to prevent data desynchronization with the offline database and outbox queue.
 */

/**
 * Clears ALL background/time-based triggers that might cause permission or concurrency issues.
 * Menu: Review & Schedule → 🔧 Utilities → 🗑️ Clear Background Triggers
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
    Logger.log('Could not clear ScriptProperties: ' + propErr);
  }

  SpreadsheetApp.getUi().alert('✅ Background Triggers Cleared!\n\n' +
    'Deleted: ' + deleted + ' time-based trigger(s)\n' +
    'Kept: ' + kept + ' edit/change trigger(s)\n\n' +
    'This ensures no rogue background syncs fight the Safety Assistant Desktop App.');
}

/**
 * Diagnoses current authorization state and shows account info.
 * Menu: Review & Schedule → 🔧 Utilities → 🔍 Diagnose Auth Issues
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
    report.push('❌ Could not get spreadsheet: ' + e.message);
  }

  SpreadsheetApp.getUi().alert('🔍 Auth & Trigger Diagnostic Report\n\n' + report.join('\n'));
}

/**
 * Deletes all installable spreadsheet edit/change triggers.
 * Direct editing in Google Sheets is no longer processed by spreadsheet triggers.
 * Menu: Review & Schedule → 🔧 Utilities → 🗑️ Remove Spreadsheet Edit Triggers
 */
function removeEditTriggers() {
  var triggers = ScriptApp.getProjectTriggers();
  var deleted = 0;
  for (var i = 0; i < triggers.length; i++) {
    var handlerName = triggers[i].getHandlerFunction();
    if (handlerName === 'onEditHandler' || handlerName === 'onChangeHandler' || handlerName === 'createEditTrigger' || handlerName === 'runJobTrackingSyncBackground') {
      ScriptApp.deleteTrigger(triggers[i]);
      deleted++;
    }
  }

  SpreadsheetApp.getUi().alert('✅ Spreadsheet Edit Triggers Removed!\n\n' +
    'Deleted ' + deleted + ' edit/change trigger(s).\n\n' +
    'Google Sheets is now configured strictly as a passive data repository.\n' +
    'All edits must originate from the Safety Assistant Desktop App.');
}

/**
 * Locks all sheets in Google Sheets with Sheet Protection.
 * Shows native warning dialogs to any user attempting to edit in Google Sheets.
 * Menu: Review & Schedule → 🔧 Utilities → 🔒 Protect Sheets (App-Only Repository)
 */
function lockAllSheetsAsRepositoryOnly() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheets = ss.getSheets();
  var protectedCount = 0;

  for (var i = 0; i < sheets.length; i++) {
    var sheet = sheets[i];
    var sheetName = sheet.getName();

    // Skip temp/scratch sheets if any
    if (sheetName.toLowerCase().startsWith('temp') || sheetName.toLowerCase().startsWith('test')) {
      continue;
    }

    // Remove existing protections created by this script
    var existingProtections = sheet.getProtections(SpreadsheetApp.ProtectionType.SHEET);
    for (var p = 0; p < existingProtections.length; p++) {
      existingProtections[p].remove();
    }

    var protection = sheet.protect();
    protection.setDescription('🔒 Safety Assistant Repository - Managed exclusively by Desktop App');
    protection.setWarningOnly(true);
    protectedCount++;
  }

  try {
    PropertiesService.getScriptProperties().setProperty('ALLOW_DIRECT_SHEETS_EDIT', 'false');
  } catch (e) {
    Logger.log('Could not set ALLOW_DIRECT_SHEETS_EDIT: ' + e);
  }

  SpreadsheetApp.getUi().alert(
    '🔒 Repository Protection Enabled!\n\n' +
    'Protected ' + protectedCount + ' sheet(s).\n\n' +
    'Direct edits in Google Sheets will display a warning and be reverted.\n' +
    'All edits must be performed in the Safety Assistant Desktop App.'
  );
}

/**
 * Temporarily allows direct sheets editing for emergency maintenance.
 * Menu: Review & Schedule → 🔧 Utilities → 🔓 Maintenance Mode (Allow Sheets Editing)
 */
function unlockAllSheetsForMaintenance() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheets = ss.getSheets();
  var unlockedCount = 0;

  for (var i = 0; i < sheets.length; i++) {
    var sheet = sheets[i];
    var existingProtections = sheet.getProtections(SpreadsheetApp.ProtectionType.SHEET);
    for (var p = 0; p < existingProtections.length; p++) {
      existingProtections[p].remove();
      unlockedCount++;
    }
  }

  try {
    PropertiesService.getScriptProperties().setProperty('ALLOW_DIRECT_SHEETS_EDIT', 'true');
  } catch (e) {
    Logger.log('Could not set ALLOW_DIRECT_SHEETS_EDIT: ' + e);
  }

  SpreadsheetApp.getUi().alert(
    '🔓 Maintenance Mode Enabled\n\n' +
    'Removed ' + unlockedCount + ' sheet protection(s).\n' +
    'Direct editing in Google Sheets is temporarily enabled for maintenance.\n\n' +
    'Be sure to run "Protect Sheets (App-Only Repository)" when finished!'
  );
}

/**
 * onChange handler - logs unexpected structural changes.
 * Google Sheets is strictly a passive data repository.
 */
function onChangeHandler(e) {
  try {
    if (!e) return;
    Logger.log('onChangeHandler fired: changeType=' + (e.changeType || 'unknown'));
  } catch (err) {
    Logger.log('Error in onChangeHandler: ' + err);
  }
}

/**
 * Simple onEdit trigger - fires automatically on any interactive edit in Google Sheets.
 * Enforces the critical architecture rule:
 * Google Sheets is strictly a cloud data repository (database backend).
 * All edits, creations, deletions, and status updates MUST originate from the Safety Assistant Desktop App.
 *
 * Direct manual edits in Google Sheets are blocked and reverted by onEdit(e) triggers
 * to prevent data desynchronization with the offline database and outbox queue.
 */
function onEdit(e) {
  try {
    if (!e || !e.range) return;

    var bypass = '';
    try {
      bypass = PropertiesService.getScriptProperties().getProperty('ALLOW_DIRECT_SHEETS_EDIT');
    } catch (_) {}

    if (bypass === 'true') {
      // Maintenance mode enabled: allow administrative manual edit without running conflicting auto-calc scripts
      Logger.log('Maintenance mode active: direct edit allowed on ' + e.range.getSheet().getName() + ' row ' + e.range.getRow() + ', col ' + e.range.getColumn());
      return;
    }

    var sheet = e.range.getSheet();
    var sheetName = sheet.getName();
    var editedCol = e.range.getColumn();
    var editedRow = e.range.getRow();

    // Allow action buttons like Archive checkbox in cell O2 (row 2, col 15)
    if ((sheetName === 'Safety Equipment Needs' || sheetName === 'Safety Reports') && editedRow === 2 && editedCol === 15) {
      return;
    }

    // Revert the manual edit immediately
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    if (e.oldValue !== undefined) {
      e.range.setValue(e.oldValue);
    } else {
      e.range.clearContent();
    }

    ss.toast(
      '⛔ Direct edits in Google Sheets are disabled. Google Sheets is a data repository only. Please make all changes in the Safety Assistant Desktop App.',
      'Edits Disabled (Desktop App Only)',
      8
    );
    Logger.log('Blocked manual edit on ' + sheetName + ' row ' + editedRow + ', col ' + editedCol);
  } catch (err) {
    Logger.log('Error in onEdit trigger: ' + err);
  }
}

/**
 * Compatibility stubs for any legacy callers or test runners.
 */
function onEditHandler(e) {
  return onEdit(e);
}

function processEdit(e) {
  return onEdit(e);
}

function syncNewItemsLogSilent() {
  return;
}
