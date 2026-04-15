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

