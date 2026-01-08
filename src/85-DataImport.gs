/**
 * Data Import Utilities
 *
 * Functions to help import external data into the Rubber Tracker system.
 */

/* global COLS, SHEET_GLOVES, SHEET_SLEEVES, logEvent, SpreadsheetApp, HtmlService */

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

