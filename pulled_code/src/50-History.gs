/**
 * Glove Manager – History Tracking
 *
 * Functions for saving and viewing glove/sleeve history.
 * Creates timestamped snapshots of current assignments.
 */

/**
 * Saves current glove and sleeve assignments to history sheets.
 * Can be called silently (from triggers) or interactively (from menu).
 *
 * @param {boolean} silent - If true, runs without user dialogs
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
 * Public wrapper for interactive history save (called from menu).
 * Menu item: Glove Manager → History → Save Current State to History
 */
function saveCurrentStateToHistory() {
  saveHistory(false);
}

/**
 * Public wrapper for silent history save (called from triggers).
 */
function saveCurrentStateToHistorySilent() {
  saveHistory(true);
}

/**
 * Helper to format date for history display.
 */
function formatDateForHistory(dateVal) {
  if (!dateVal) return '';
  var d = parseDateFlexible(dateVal);
  if (!d) return String(dateVal);
  return Utilities.formatDate(d, SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone(), 'MM/dd/yyyy');
}

/**
 * Flexible date parser that handles various date formats.
 */
function parseDateFlexible(dateStr) {
  if (!dateStr) return null;
  if (dateStr instanceof Date && !isNaN(dateStr)) return dateStr;
  if (typeof dateStr !== 'string') dateStr = String(dateStr);
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
 * Views the Gloves History sheet (default).
 * Menu item: Glove Manager → History → View Full History
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
 * Menu item: Glove Manager → Close & Save History
 */
function closeAndSaveHistory() {
  ensureSeparateHistorySheets();
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
  ensureSeparateHistorySheets();
  try {
    logEvent('Running daily history backup...');
    saveCurrentStateToHistorySilent();
    logEvent('Daily history backup completed successfully.');
  } catch (e) {
    logEvent('Error in dailyHistoryBackup: ' + e, 'ERROR');
  }
}

