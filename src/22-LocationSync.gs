/**
 * Glove Manager – Inventory Location Sync
 *
 * Utility to sync all inventory item locations with current employee data.
 * Ensures that locations in Gloves/Sleeves sheets match the Employee sheet.
 */

/**
 * Syncs all inventory item locations with current employee data from the Employee sheet.
 * This ensures that if an employee's location changes, all their assigned items are updated.
 *
 * Called automatically during Generate All Reports.
 */
function syncInventoryLocations() {
  try {
    logEvent('Syncing inventory locations with employee data...');

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var employeesSheet = ss.getSheetByName('Employees');

    if (!employeesSheet) {
      logEvent('syncInventoryLocations: Employees sheet not found!', 'ERROR');
      return;
    }

    // Build employee name -> location map
    var empData = employeesSheet.getDataRange().getValues();
    var empHeaders = empData[0];
    var nameColIdx = 0;
    var locationColIdx = -1;

    // Find Location column
    for (var h = 0; h < empHeaders.length; h++) {
      if (String(empHeaders[h]).trim().toLowerCase().indexOf('location') !== -1) {
        locationColIdx = h;
        break;
      }
    }

    if (locationColIdx === -1) {
      logEvent('syncInventoryLocations: Location column not found in Employees sheet!', 'ERROR');
      locationColIdx = 2;
    }

    // Build name -> location map (case-insensitive)
    var nameToLocation = {};

    // Add special assignments
    nameToLocation['on shelf'] = 'Helena';
    nameToLocation['packed for delivery'] = "Cody's Truck";
    nameToLocation['packed for testing'] = "Cody's Truck";
    nameToLocation['in testing'] = 'Arnett / JM Test';
    nameToLocation['failed rubber'] = 'Destroyed';
    nameToLocation['not repairable'] = 'Destroyed';
    nameToLocation['lost'] = 'Lost';

    // Find Alternate Names column
    var altNamesColIdx = -1;
    for (var h = 0; h < empHeaders.length; h++) {
      var hdr = String(empHeaders[h]).trim().toLowerCase();
      if (hdr === 'alternate names' || hdr === 'alternatenames') altNamesColIdx = h;
    }

    // Add current employees
    for (var i = 1; i < empData.length; i++) {
      var name = (empData[i][nameColIdx] || '').toString().trim().toLowerCase();
      var loc = (empData[i][locationColIdx] || '').toString().trim();
      if (name && loc) {
        var physLoc = getPhysicalLocation(loc);
        nameToLocation[name] = physLoc;
        // Also register alternate names (e.g. Josh Roberts -> Joshua Roberts)
        if (altNamesColIdx !== -1 && empData[i][altNamesColIdx]) {
          var alts = String(empData[i][altNamesColIdx]).split(';');
          for (var a = 0; a < alts.length; a++) {
            var alt = alts[a].trim().toLowerCase();
            if (alt && !nameToLocation[alt]) nameToLocation[alt] = physLoc;
          }
        }
      }
    }

    // Add previous employees from Employee History
    var employeeHistorySheet = ss.getSheetByName('Employee History');
    if (employeeHistorySheet && employeeHistorySheet.getLastRow() > 2) {
      var lastCol = Math.min(employeeHistorySheet.getLastColumn(), 10);
      if (lastCol > 3) {
        var historyData = employeeHistorySheet.getRange(3, 1, employeeHistorySheet.getLastRow() - 2, lastCol).getValues();
        for (var hi = 0; hi < historyData.length; hi++) {
          var histName = (historyData[hi][1] || '').toString().trim();
          var histNameLower = histName.toLowerCase();
          var histLocation = (historyData[hi][3] || '').toString().trim().toLowerCase();

          if (histLocation === 'previous employee' && histName && !nameToLocation[histNameLower]) {
            nameToLocation[histNameLower] = 'Previous Employee';
          }
        }
      }
    }

    logEvent('syncInventoryLocations: Built location map with ' + Object.keys(nameToLocation).length + ' entries');

    // Process Gloves sheet
    var updateCount = syncSheetLocations(ss, 'Gloves', nameToLocation);

    // Process Sleeves sheet
    updateCount += syncSheetLocations(ss, 'Sleeves', nameToLocation);

    // Process Blankets sheet
    updateCount += syncSheetLocations(ss, 'Blankets', nameToLocation);

    // Process MACKs sheet
    updateCount += syncSheetLocations(ss, SHEET_MACKS, nameToLocation);

    // Process HV Testers sheet
    updateCount += syncSheetLocations(ss, 'HV Testers', nameToLocation);

    // Process Phasing Sets sheet
    updateCount += syncSheetLocations(ss, 'Phasing Sets', nameToLocation);

    // Process AED sheet
    updateCount += syncSheetLocations(ss, 'AED', nameToLocation);

    // Process Grounds sheet
    updateCount += syncSheetLocations(ss, SHEET_GROUNDS, nameToLocation);

    // Process Hot Sticks sheet
    updateCount += syncSheetLocations(ss, SHEET_HOT_STICKS, nameToLocation);

    // Process Expiring Certs sheet
    updateCount += syncSheetLocations(ss, 'Expiring Certs', nameToLocation);

    logEvent('syncInventoryLocations: Updated ' + updateCount + ' item locations');

  } catch (e) {
    Logger.log('Error in syncInventoryLocations: ' + e);
  }
}

/**
 * Syncs locations for a specific inventory sheet (Gloves or Sleeves or Expiring Certs).
 *
 * @param {Spreadsheet} ss - The active spreadsheet
 * @param {string} sheetName - Name of the sheet
 * @param {Object} nameToLocation - Map of employee names to locations
 * @returns {number} Count of updated rows
 */
function syncSheetLocations(ss, sheetName, nameToLocation) {
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet || sheet.getLastRow() < 2) {
    return 0;
  }

  var data = sheet.getDataRange().getValues();
  var headers = data[0];

  // Find column indices
  var locationColIdx = -1;
  var assignedToColIdx = -1;

  for (var h = 0; h < headers.length; h++) {
    var header = String(headers[h]).trim().toLowerCase();
    if (header.indexOf('location') !== -1) locationColIdx = h;
    if (header === 'assigned to' || header === 'employee name' || header === 'employee') assignedToColIdx = h;
  }

  if (locationColIdx === -1 || assignedToColIdx === -1) {
    Logger.log('syncSheetLocations: Required columns not found in ' + sheetName);
    return 0;
  }

  var updateCount = 0;
  var locationColumnValues = [];
  var changes = [];

  // Process each row in memory
  for (var i = 1; i < data.length; i++) {
    var rawAssignedTo = data[i][assignedToColIdx];
    var currentLocation = (data[i][locationColIdx] || '').toString().trim();
    var assignedTo = (rawAssignedTo || '').toString().trim();
    var assignedToLower = assignedTo.toLowerCase();

    // Skip Date objects or empty assignments
    if (rawAssignedTo instanceof Date || !assignedTo) {
      locationColumnValues.push([currentLocation]);
      continue;
    }

    // Look up correct location
    var correctLocation = nameToLocation[assignedToLower];

    // If location is unknown but person exists, mark as Unknown
    if (!correctLocation && assignedTo && assignedToLower !== '') {
      correctLocation = 'Unknown';
    }

    if (correctLocation && currentLocation !== correctLocation) {
      locationColumnValues.push([correctLocation]);
      changes.push({ row: i + 1, location: correctLocation });
      updateCount++;
    } else {
      locationColumnValues.push([currentLocation]);
    }
  }

  // Apply location updates
  if (updateCount > 0) {
    var batchSuccess = false;
    try {
      sheet.getRange(2, locationColIdx + 1, locationColumnValues.length, 1).setValues(locationColumnValues);
      logEvent('syncSheetLocations: ' + sheetName + ' - Batch updated ' + updateCount + ' location(s)', 'INFO');
      batchSuccess = true;
    } catch (err) {
      Logger.log('syncSheetLocations: Batch setValues failed on ' + sheetName + ' (' + err.message + '). Falling back to cell-by-cell update...');
    }

    if (!batchSuccess) {
      var cellSuccessCount = 0;
      for (var c = 0; c < changes.length; c++) {
        try {
          sheet.getRange(changes[c].row, locationColIdx + 1).setValue(changes[c].location);
          cellSuccessCount++;
        } catch (cellErr) {
          Logger.log('syncSheetLocations: Failed to set location for row ' + changes[c].row + ' on ' + sheetName + ': ' + cellErr.message);
        }
      }
      logEvent('syncSheetLocations: ' + sheetName + ' - Cell-by-cell updated ' + cellSuccessCount + ' of ' + updateCount + ' location(s)', 'INFO');
    }
  }

  return updateCount;
}

