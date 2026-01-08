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

    // Add current employees
    for (var i = 1; i < empData.length; i++) {
      var name = (empData[i][nameColIdx] || '').toString().trim().toLowerCase();
      var loc = (empData[i][locationColIdx] || '').toString().trim();
      if (name && loc) {
        nameToLocation[name] = loc;
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

    logEvent('syncInventoryLocations: Updated ' + updateCount + ' item locations');

  } catch (e) {
    logEvent('Error in syncInventoryLocations: ' + e, 'ERROR');
  }
}

/**
 * Syncs locations for a specific inventory sheet (Gloves or Sleeves).
 *
 * @param {Spreadsheet} ss - The active spreadsheet
 * @param {string} sheetName - Name of the sheet ('Gloves' or 'Sleeves')
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
    if (header === 'assigned to') assignedToColIdx = h;
  }

  if (locationColIdx === -1 || assignedToColIdx === -1) {
    logEvent('syncSheetLocations: Required columns not found in ' + sheetName, 'ERROR');
    return 0;
  }

  var updateCount = 0;
  var updates = [];

  // Process each row
  for (var i = 1; i < data.length; i++) {
    var currentLocation = (data[i][locationColIdx] || '').toString().trim();
    var assignedTo = (data[i][assignedToColIdx] || '').toString().trim();
    var assignedToLower = assignedTo.toLowerCase();

    // Skip empty assignments
    if (!assignedTo) continue;

    // Look up correct location
    var correctLocation = nameToLocation[assignedToLower];

    // If location is unknown but person exists, mark as Unknown
    if (!correctLocation && assignedTo && assignedToLower !== '') {
      correctLocation = 'Unknown';
    }

    // Update if location has changed
    if (correctLocation && currentLocation !== correctLocation) {
      updates.push({
        row: i + 1, // Convert to 1-based
        newLocation: correctLocation,
        oldLocation: currentLocation,
        assignedTo: assignedTo
      });
    }
  }

  // Apply updates in batch
  if (updates.length > 0) {
    for (var u = 0; u < updates.length; u++) {
      var update = updates[u];
      sheet.getRange(update.row, locationColIdx + 1).setValue(update.newLocation);
      updateCount++;

      logEvent('syncSheetLocations: ' + sheetName + ' row ' + update.row +
               ' - Updated location for ' + update.assignedTo +
               ' from "' + update.oldLocation + '" to "' + update.newLocation + '"', 'DEBUG');
    }
  }

  return updateCount;
}

