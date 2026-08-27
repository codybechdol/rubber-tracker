/**
 * Glove Manager – Build Sheets
 *
 * DEPRECATED: This function has been consolidated into generateAllReports().
 * Keeping this as a wrapper for backward compatibility.
 */

/**
 * @deprecated Use generateAllReports() instead.
 * This function is kept for backward compatibility only.
 *
 * Builds or resets all swap and report sheets.
 * Menu item: Glove Manager → Build Sheets (DEPRECATED - use Generate All Reports)
 */
function buildSheets() {
  try {
    logEvent('[INFO] buildSheets() called - redirecting to generateAllReports()...');

    // Show deprecation notice
    var ui = SpreadsheetApp.getUi();
    var response = ui.alert(
      '⚠️ Deprecated Function',
      'The "Build Sheets" function has been consolidated into "Generate All Reports".\n\n' +
      'Would you like to run "Generate All Reports" instead?\n\n' +
      'This will generate all swap reports, purchase needs, inventory reports, and reclaims.',
      ui.ButtonSet.YES_NO
    );

    if (response === ui.Button.YES) {
      generateAllReports();
    } else {
      ui.alert('Operation cancelled. Please use "Generate All Reports" from the menu in the future.');
    }

  } catch (e) {
    logEvent('[ERROR] buildSheets: ' + e, 'ERROR');
    SpreadsheetApp.getUi().alert('❌ Error: ' + e);
  }
}

/**
 * Ensures the 'Picked For' column exists in Gloves and Sleeves tabs.
 * This column tracks which items are picked for swaps.
 */
function ensurePickedForColumn() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  // Check Gloves sheet
  var glovesSheet = ss.getSheetByName(SHEET_GLOVES);
  if (glovesSheet) {
    var lastCol = glovesSheet.getLastColumn();
    var headers = glovesSheet.getRange(1, 1, 1, lastCol).getValues()[0];
    var hasPickedFor = false;

    for (var i = 0; i < headers.length; i++) {
      if (String(headers[i]).toLowerCase().indexOf('picked for') !== -1) {
        hasPickedFor = true;
        break;
      }
    }

    if (!hasPickedFor) {
      glovesSheet.insertColumnAfter(lastCol);
      glovesSheet.getRange(1, lastCol + 1).setValue('Picked For')
        .setFontWeight('bold').setBackground('#4285f4').setFontColor('white');
      logEvent('Added "Picked For" column to Gloves sheet', 'INFO');
    }
  }

  // Check Sleeves sheet
  var sleevesSheet = ss.getSheetByName(SHEET_SLEEVES);
  if (sleevesSheet) {
    var lastCol = sleevesSheet.getLastColumn();
    var headers = sleevesSheet.getRange(1, 1, 1, lastCol).getValues()[0];
    var hasPickedFor = false;

    for (var i = 0; i < headers.length; i++) {
      if (String(headers[i]).toLowerCase().indexOf('picked for') !== -1) {
        hasPickedFor = true;
        break;
      }
    }

    if (!hasPickedFor) {
      sleevesSheet.insertColumnAfter(lastCol);
      sleevesSheet.getRange(1, lastCol + 1).setValue('Picked For')
        .setFontWeight('bold').setBackground('#4285f4').setFontColor('white');
      logEvent('Added "Picked For" column to Sleeves sheet', 'INFO');
    }
  }
}

/**
 * Converts all formula-heavy data sheets (Expiring Certs, Gloves, Sleeves, etc.)
 * into lightning-fast plain value storage and archives obsolete legacy UI tabs.
 *
 * Menu item: Maintenance → Sheets Setup → 🚀 Streamline Database (Flatten Formulas)
 */
function flattenAllFormulasAndCleanDatabase(silent) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var log = [];
  var startTime = new Date().getTime();

  // 1. Create a safety backup first
  try {
    if (typeof createBackupSnapshot === 'function') {
      createBackupSnapshot(true);
      log.push('✅ Created Drive backup snapshot before cleanup');
    }
  } catch (bErr) {
    Logger.log('Backup error before flattening: ' + bErr);
  }

  // 2. Data sheets to flatten from dynamic formulas to plain static values
  var dataSheetsToFlatten = [
    'Expiring Certs',
    typeof SHEET_GLOVES !== 'undefined' ? SHEET_GLOVES : 'Gloves',
    typeof SHEET_SLEEVES !== 'undefined' ? SHEET_SLEEVES : 'Sleeves',
    typeof SHEET_BLANKETS !== 'undefined' ? SHEET_BLANKETS : 'Blankets',
    typeof SHEET_MACKS !== 'undefined' ? SHEET_MACKS : 'MACKs',
    typeof SHEET_HV_TESTERS !== 'undefined' ? SHEET_HV_TESTERS : 'HV Testers',
    typeof SHEET_PHASING_SETS !== 'undefined' ? SHEET_PHASING_SETS : 'Phasing Sets',
    typeof SHEET_AED !== 'undefined' ? SHEET_AED : 'AED',
    typeof SHEET_GROUNDS !== 'undefined' ? SHEET_GROUNDS : 'Grounds',
    typeof SHEET_HOT_STICKS !== 'undefined' ? SHEET_HOT_STICKS : 'Hot Sticks',
    typeof SHEET_EMPLOYEES !== 'undefined' ? SHEET_EMPLOYEES : 'Employees',
    'Job Tracking',
    'Training Tracking'
  ];

  var flattenedCount = 0;
  for (var i = 0; i < dataSheetsToFlatten.length; i++) {
    var sName = dataSheetsToFlatten[i];
    var sheet = ss.getSheetByName(sName);
    if (sheet && sheet.getLastRow() > 1 && sheet.getLastColumn() >= 1) {
      try {
        var range = sheet.getDataRange();
        var vals = range.getValues(); // Reads the evaluated value of every formula cell
        range.setValues(vals);        // Overwrites formulas with plain static values!
        
        // Remove heavy conditional formatting rules on Expiring Certs
        if (sName === 'Expiring Certs') {
          sheet.clearConditionalFormatRules();
        }
        flattenedCount++;
      } catch (err) {
        Logger.log('Error flattening sheet ' + sName + ': ' + err);
      }
    }
  }
  log.push('⚡ Flattened ' + flattenedCount + ' data sheets to static plain values (0 formula overhead)');

  // 3. Obsolete legacy UI tabs to hide / archive
  var obsoleteTabsToArchive = [
    'Dashboard',
    'Item History Lookup',
    'Reclaims',
    'Schedule',
    'Crew Visit Config',
    'Training Config',
    'Safety Equipment Needs'
  ];

  var archivedCount = 0;
  for (var j = 0; j < obsoleteTabsToArchive.length; j++) {
    var oName = obsoleteTabsToArchive[j];
    var oSheet = ss.getSheetByName(oName);
    if (oSheet) {
      try {
        oSheet.hideSheet();
        archivedCount++;
      } catch (hideErr) {
        Logger.log('Could not hide sheet ' + oName + ': ' + hideErr);
      }
    }
  }
  log.push('🗄️ Archived/hid ' + archivedCount + ' obsolete legacy UI tabs');

  SpreadsheetApp.flush();
  var elapsed = ((new Date().getTime() - startTime) / 1000).toFixed(1);

  if (!silent) {
    var msg = '🚀 Database Streamlining Complete (' + elapsed + 's)!\n\n' + log.join('\n') + '\n\nGoogle Sheets is now optimized as a high-speed database for the Desktop App.';
    try {
      SpreadsheetApp.getUi().alert(msg);
    } catch(e) {
      Logger.log(msg);
    }
  }

  return { success: true, elapsed: elapsed, log: log };
}


