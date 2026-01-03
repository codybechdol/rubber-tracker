/**
 * Glove Manager – Build Sheets
 *
 * Functions for building and initializing all sheets.
 * Sets up structure, headers, and formatting.
 */

/**
 * Builds or resets all swap and report sheets.
 * Menu item: Glove Manager → Build Sheets
 */
function buildSheets() {
  try {
    logEvent('[INFO] Building/resetting sheets...');
    var ss = SpreadsheetApp.getActiveSpreadsheet();

    // Build or reset Glove Swaps sheet
    var gloveSwapsSheet = ss.getSheetByName(SHEET_GLOVE_SWAPS) || ss.insertSheet(SHEET_GLOVE_SWAPS);
    gloveSwapsSheet.clear();

    // Build or reset Sleeve Swaps sheet
    var sleeveSwapsSheet = ss.getSheetByName(SHEET_SLEEVE_SWAPS) || ss.insertSheet(SHEET_SLEEVE_SWAPS);
    sleeveSwapsSheet.clear();

    // Build or reset Purchase Needs
    var purchaseSheet = ss.getSheetByName('Purchase Needs') || ss.insertSheet('Purchase Needs');
    purchaseSheet.clear();

    // Build or reset Reclaims
    var reclaimsSheet = ss.getSheetByName('Reclaims') || ss.insertSheet('Reclaims');
    reclaimsSheet.clear();

    // Build or reset Inventory Reports
    var inventoryReportsSheet = ss.getSheetByName('Inventory Reports') || ss.insertSheet('Inventory Reports');
    inventoryReportsSheet.clear();

    // Build or reset To Do List
    var todoSheet = ss.getSheetByName('To Do List') || ss.insertSheet('To Do List');
    todoSheet.clear();

    // Ensure Picked For column exists in Gloves and Sleeves
    ensurePickedForColumn();

    logEvent('[INFO] Sheets built or reset.');
    SpreadsheetApp.getUi().alert('✅ Sheets built/reset successfully!');

  } catch (e) {
    logEvent('[ERROR] buildSheets: ' + e, 'ERROR');
    SpreadsheetApp.getUi().alert('❌ Error building sheets: ' + e);
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

