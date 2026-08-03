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
      if (String(empHeaders[h]).trim().toLowerCase() === 'location') {
        locationColIdx = h;
        break;
      }
    }

    if (locationColIdx === -1) {
      logEvent('syncInventoryLocations: Location column not found in Employees sheet!', 'ERROR');
      return;
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
      var historyData = employeeHistorySheet.getRange(3, 1, employeeHistorySheet.getLastRow() - 2, 10).getValues();
      for (var hi = 0; hi < historyData.length; hi++) {
        var histName = (historyData[hi][1] || '').toString().trim();
        var histNameLower = histName.toLowerCase();
        var histLocation = (historyData[hi][3] || '').toString().trim().toLowerCase();

        if (histLocation === 'previous employee' && histName && !nameToLocation[histNameLower]) {
          nameToLocation[histNameLower] = 'Previous Employee';
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
    logEvent('Error in syncInventoryLocations: ' + e, 'ERROR');
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
    if (header === 'location') locationColIdx = h;
    if (header === 'assigned to' || header === 'employee name' || header === 'employee') assignedToColIdx = h;
  }

  if (locationColIdx === -1 || assignedToColIdx === -1) {
    logEvent('syncSheetLocations: Required columns not found in ' + sheetName, 'ERROR');
    return 0;
  }

  var updateCount = 0;
  var locationColumnValues = [];

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
      updateCount++;
    } else {
      locationColumnValues.push([currentLocation]);
    }
  }

  // Apply all location updates in a SINGLE setValues call
  if (updateCount > 0) {
    try {
      sheet.getRange(2, locationColIdx + 1, locationColumnValues.length, 1).setValues(locationColumnValues);
      logEvent('syncSheetLocations: ' + sheetName + ' - Batch updated ' + updateCount + ' location(s)', 'INFO');
    } catch (err) {
      logEvent('syncSheetLocations: Validation blocked setValues on ' + sheetName + ' (' + err.message + '). Clearing validation & retrying...', 'WARNING');
      try {
        var lastRow = sheet.getMaxRows();
        if (lastRow > 1) {
          sheet.getRange(2, locationColIdx + 1, lastRow - 1, 1).clearDataValidations();
        }
        sheet.getRange(2, locationColIdx + 1, locationColumnValues.length, 1).setValues(locationColumnValues);
        logEvent('syncSheetLocations: ' + sheetName + ' - Batch updated ' + updateCount + ' location(s) after clearing validation', 'INFO');
      } catch (retryErr) {
        logEvent('syncSheetLocations: Fallback failed on ' + sheetName + ': ' + retryErr.message, 'ERROR');
      }
    }
  }

  return updateCount;
}

