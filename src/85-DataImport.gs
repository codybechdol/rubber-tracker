/**
 * Data Import Utilities
 *
 * Functions to help import external data into the Rubber Tracker system.
 */

/* global COLS, SHEET_GLOVES, SHEET_SLEEVES, SHEET_EMPLOYEES, logEvent */

// ============================================================================
// CREW MAKEUP IMPORT FUNCTIONS
// ============================================================================

/**
 * Shows the Crew Makeup Import dialog.
 * Menu item: Glove Manager → Data Import → Import Crew Makeup
 */
function showCrewImportDialog() {
  var html = HtmlService.createHtmlOutputFromFile('CrewImport')
    .setWidth(900)
    .setHeight(700);
  SpreadsheetApp.getUi().showModalDialog(html, 'Import Crew Makeup');
}

/**
 * Applies crew changes to the Employees sheet.
 * Called from CrewImport.html when user confirms changes.
 *
 * @param {Array} changes - Array of change objects with employee info and new values
 * @return {Object} Result with success message
 */
function applyCrewChanges(changes) {
  Logger.log('=== applyCrewChanges START ===');
  Logger.log('Applying ' + changes.length + ' changes');

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var employeesSheet = ss.getSheetByName(SHEET_EMPLOYEES);

  if (!employeesSheet) {
    return { success: false, message: 'Employees sheet not found' };
  }

  var data = employeesSheet.getDataRange().getValues();
  var headers = data[0];

  // Find column indices
  var nameCol = 0;
  var locationCol = -1;
  var jobNumCol = -1;

  for (var h = 0; h < headers.length; h++) {
    var header = String(headers[h]).toLowerCase().trim();
    if (header === 'location') locationCol = h;
    if (header === 'job number') jobNumCol = h;
  }

  if (locationCol === -1 || jobNumCol === -1) {
    return { success: false, message: 'Could not find Location or Job Number columns in Employees sheet' };
  }

  var updatedCount = 0;
  var historyLogged = 0;
  var timezone = ss.getSpreadsheetTimeZone();
  var today = new Date();
  var todayStr = Utilities.formatDate(today, timezone, 'MM/dd/yyyy');

  // Get or create Employee History sheet
  var historySheet = ss.getSheetByName('Employee History');

  for (var i = 0; i < changes.length; i++) {
    var change = changes[i];

    try {
      var rowIndex = change.rowIndex;

      if (!rowIndex || rowIndex < 2) {
        // Try to find by name
        var empNameLower = change.employeeName.toLowerCase().trim();
        for (var r = 1; r < data.length; r++) {
          if (String(data[r][nameCol]).toLowerCase().trim() === empNameLower) {
            rowIndex = r + 1;
            break;
          }
        }
      }

      if (!rowIndex || rowIndex < 2) {
        Logger.log('Could not find row for employee: ' + change.employeeName);
        continue;
      }

      var locationChanged = false;
      var jobChanged = false;

      // Update Location
      if (change.newLocation && change.newLocation !== change.oldLocation) {
        employeesSheet.getRange(rowIndex, locationCol + 1).setValue(change.newLocation);
        locationChanged = true;
      }

      // Update Job Number
      if (change.newJobNumber && change.newJobNumber !== change.oldJobNumber) {
        employeesSheet.getRange(rowIndex, jobNumCol + 1).setValue(change.newJobNumber);
        jobChanged = true;
      }

      if (locationChanged || jobChanged) {
        updatedCount++;

        // Log to Employee History
        if (historySheet) {
          var eventType = locationChanged && jobChanged ? 'Multiple Changes' :
                          (locationChanged ? 'Location Change' : 'Job Number Change');

          var notes = 'Crew Makeup Import: ';
          if (locationChanged) notes += 'Location: ' + (change.oldLocation || 'None') + ' → ' + change.newLocation + '. ';
          if (jobChanged) notes += 'Job #: ' + (change.oldJobNumber || 'None') + ' → ' + change.newJobNumber + '.';

          var historyRow = [
            todayStr,                    // Date
            change.employeeName,         // Employee Name
            eventType,                   // Event Type
            change.newLocation || '',    // Location
            change.newJobNumber || '',   // Job Number
            '',                          // Hire Date
            '',                          // Last Day
            '',                          // Last Day Reason
            '',                          // Rehire Date
            notes.trim(),                // Notes
            '',                          // Phone Number
            '',                          // Email Address
            '',                          // Glove Size
            ''                           // Sleeve Size
          ];

          historySheet.appendRow(historyRow);
          historyLogged++;
        }

        Logger.log('Updated employee: ' + change.employeeName +
                   ' | Location: ' + (locationChanged ? change.oldLocation + ' → ' + change.newLocation : 'unchanged') +
                   ' | Job #: ' + (jobChanged ? change.oldJobNumber + ' → ' + change.newJobNumber : 'unchanged'));
      }

    } catch (e) {
      Logger.log('Error updating employee ' + change.employeeName + ': ' + e.toString());
    }
  }

  Logger.log('=== applyCrewChanges END ===');
  Logger.log('Updated: ' + updatedCount + ', History logged: ' + historyLogged);

  var message = '✅ Crew Makeup Import Complete!\n\n';
  message += '📝 Updated: ' + updatedCount + ' employee(s)\n';
  message += '📋 History logged: ' + historyLogged + ' entries';

  logEvent('Crew Makeup Import: Updated ' + updatedCount + ' employees, logged ' + historyLogged + ' history entries');

  return { success: true, message: message };
}

// ============================================================================
// INVENTORY IMPORT FUNCTIONS
// ============================================================================

/**
 * Import a single inventory item from parsed data
 *
 * @param {string} itemNum - Item number (e.g., "1084")
 * @param {number} size - Size (e.g., 9.5)
 * @param {number} classNum - Class (e.g., 2)
 * @param {string} testDate - Test date (e.g., "07/22/2025")
 * @param {string} dateAssigned - Date assigned (e.g., "12/17/2025")
 * @param {string} location - Location (e.g., "Arnett / JM Test")
 * @param {string} status - Status (e.g., "In Testing")
 * @param {string} changeOutDate - Change-out date (e.g., "03/17/2026")
 * @param {string} sheetName - Target sheet name (SHEET_GLOVES or SHEET_SLEEVES)
 * @returns {boolean} Success status
 */
function importInventoryItem(itemNum, size, classNum, testDate, dateAssigned, location, status, changeOutDate, sheetName) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(sheetName);

    if (!sheet) {
      logEvent('importInventoryItem: Sheet "' + sheetName + '" not found', 'ERROR');
      return false;
    }

    // Parse dates
    var testDateObj = new Date(testDate);
    var dateAssignedObj = new Date(dateAssigned);
    var changeOutDateObj = new Date(changeOutDate);

    // Find next available row
    var lastRow = sheet.getLastRow();
    var newRow = lastRow + 1;

    // Set values according to COLS.INVENTORY structure
    sheet.getRange(newRow, COLS.INVENTORY.ITEM_NUM).setValue(itemNum);
    sheet.getRange(newRow, COLS.INVENTORY.SIZE).setValue(size);
    sheet.getRange(newRow, COLS.INVENTORY.CLASS).setValue(classNum);
    sheet.getRange(newRow, COLS.INVENTORY.TEST_DATE).setValue(testDateObj);
    sheet.getRange(newRow, COLS.INVENTORY.DATE_ASSIGNED).setValue(dateAssignedObj);
    sheet.getRange(newRow, COLS.INVENTORY.LOCATION).setValue(location);
    sheet.getRange(newRow, COLS.INVENTORY.STATUS).setValue(status);
    sheet.getRange(newRow, COLS.INVENTORY.CHANGE_OUT_DATE).setValue(changeOutDateObj);

    logEvent('importInventoryItem: Added item ' + itemNum + ' to ' + sheetName, 'INFO');
    return true;

  } catch (error) {
    logEvent('importInventoryItem: Error - ' + error.toString(), 'ERROR');
    return false;
  }
}

/**
 * Import the specific data row provided by user
 * 1084	9.5	2	07/22/2025	12/17/2025	Arnett / JM Test	In Testing	In Testing	03/17/2026
 */
function importProvidedData() {
  // Data from user
  var itemNum = '1084';
  var size = 9.5;
  var classNum = 2;
  var testDate = '07/22/2025';
  var dateAssigned = '12/17/2025';
  var location = 'Arnett / JM Test';
  var status = 'In Testing';
  var changeOutDate = '03/17/2026';

  // Determine if this is a glove or sleeve based on item number pattern
  // Adjust this logic based on your numbering system
  var sheetName = SHEET_GLOVES; // Default to Gloves, change if needed

  var result = importInventoryItem(
    itemNum,
    size,
    classNum,
    testDate,
    dateAssigned,
    location,
    status,
    changeOutDate,
    sheetName
  );

  if (result) {
    SpreadsheetApp.getUi().alert('✅ Success!\\n\\nItem ' + itemNum + ' imported to ' + sheetName);
  } else {
    SpreadsheetApp.getUi().alert('❌ Error!\\n\\nFailed to import item. Check logs.');
  }
}

/**
 * Bulk import from tab-separated values
 *
 * @param {string} tsvData - Tab-separated data rows
 * @param {string} sheetName - Target sheet name
 */
function bulkImportTSV(tsvData, sheetName) {
  var lines = tsvData.split('\n');
  var successCount = 0;
  var failCount = 0;

  for (var i = 0; i < lines.length; i++) {
    var line = lines[i].trim();
    if (!line) continue;

    var parts = line.split('\t');
    if (parts.length < 8) {
      logEvent('bulkImportTSV: Skipping line ' + (i + 1) + ' - insufficient columns', 'WARNING');
      failCount++;
      continue;
    }

    var result = importInventoryItem(
      parts[0],  // itemNum
      parseFloat(parts[1]),  // size
      parseFloat(parts[2]),  // classNum
      parts[3],  // testDate
      parts[4],  // dateAssigned
      parts[5],  // location
      parts[6],  // status
      parts[7],  // changeOutDate
      sheetName
    );

    if (result) {
      successCount++;
    } else {
      failCount++;
    }
  }

  var message = '✅ Import Complete!\\n\\n';
  message += 'Success: ' + successCount + ' items\\n';
  if (failCount > 0) {
    message += 'Failed: ' + failCount + ' items\\n';
    message += '\\nCheck logs for details.';
  }

  SpreadsheetApp.getUi().alert(message);
}

/**
 * Show import dialog for manual data entry
 */
function showImportDialog() {
  var html = HtmlService.createHtmlOutput(
    '<h2>Import Inventory Data</h2>' +
    '<p>Paste tab-separated data below:</p>' +
    '<textarea id="data" rows="10" cols="50"></textarea><br><br>' +
    '<label>Import to: ' +
    '<select id="sheet">' +
    '<option value="Gloves">Gloves</option>' +
    '<option value="Sleeves">Sleeves</option>' +
    '</select></label><br><br>' +
    '<button onclick="doImport()">Import</button>' +
    '<script>' +
    'function doImport() {' +
    '  var data = document.getElementById("data").value;' +
    '  var sheet = document.getElementById("sheet").value;' +
    '  google.script.run.bulkImportTSV(data, sheet);' +
    '  google.script.host.close();' +
    '}' +
    '</script>'
  ).setWidth(600).setHeight(400);

  SpreadsheetApp.getUi().showModalDialog(html, 'Import Data');
}

