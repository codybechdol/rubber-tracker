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
 * Dialog size: 1920x1080 (maximum for full screen on most monitors)
 */
function showCrewImportDialog() {
  var html = HtmlService.createHtmlOutputFromFile('CrewImport')
    .setWidth(1900)
    .setHeight(1000);
  SpreadsheetApp.getUi().showModalDialog(html, 'Import Crew Makeup');
}

/**
 * Ensures that the given locations are included in the Location column's data validation.
 * If any location is not in the current validation list, updates the validation to include it.
 *
 * @param {Sheet} sheet - The Employees sheet
 * @param {number} locationColNum - 1-based column number for Location
 * @param {Array} locationsToAdd - Array of location strings to ensure are valid
 * @return {boolean} True if validation was updated, false if no changes needed
 */
function ensureLocationsInValidation(sheet, locationColNum, locationsToAdd) {
  try {
    // Get current validation from first data cell
    var validationCell = sheet.getRange(2, locationColNum);
    var currentRule = validationCell.getDataValidation();

    var existingLocations = [];

    if (currentRule) {
      var criteria = currentRule.getCriteriaType();
      if (criteria === SpreadsheetApp.DataValidationCriteria.VALUE_IN_LIST) {
        var args = currentRule.getCriteriaValues();
        if (args && args[0]) {
          existingLocations = args[0];
        }
      }
    }

    // If no existing validation, start with base locations
    if (existingLocations.length === 0) {
      existingLocations = [
        'Anaconda', 'Big Sky', 'Billings', 'Bonner', 'Bozeman', 'Butte',
        'CA Sub', 'California', 'Elliston', 'Ennis', 'Glendive', 'Gold Creek',
        'Great Falls', 'Helena', 'Kalispell', 'Leave', 'Light Duty', 'Livingston',
        'Lolo', 'Manhattan', 'Miles City', 'Missoula', 'Northern Lights', 'Rapelje',
        'Sidney', 'South Dakota', 'South Dakota Dock', 'Stanford', 'Texas',
        'Three Forks', 'Vacation', 'Weeds', 'Previous Employee'
      ];
    }

    // Check which locations need to be added
    var needsUpdate = false;
    for (var i = 0; i < locationsToAdd.length; i++) {
      var loc = locationsToAdd[i];
      if (loc && existingLocations.indexOf(loc) === -1) {
        existingLocations.push(loc);
        needsUpdate = true;
        Logger.log('ensureLocationsInValidation: Adding new location: ' + loc);
      }
    }

    if (!needsUpdate) {
      return false;
    }

    // Sort and create new validation rule
    existingLocations.sort();
    var newRule = SpreadsheetApp.newDataValidation()
      .requireValueInList(existingLocations, true)
      .setAllowInvalid(false)
      .build();

    // Apply to entire Location column (rows 2-500)
    var lastRow = Math.max(sheet.getLastRow(), 500);
    sheet.getRange(2, locationColNum, lastRow - 1, 1).setDataValidation(newRule);

    Logger.log('ensureLocationsInValidation: Updated validation with ' + existingLocations.length + ' locations');
    return true;

  } catch (e) {
    Logger.log('ensureLocationsInValidation ERROR: ' + e.toString());
    return false;
  }
}

/**
 * Ensures that the given locations exist in the Locations sheet.
 * If a location is not in the sheet, adds it with default values.
 * This keeps the Locations sheet (used for drive times) in sync with employee locations.
 *
 * @param {Spreadsheet} ss - The spreadsheet
 * @param {Array} locations - Array of location strings to ensure exist
 * @return {number} Number of locations added
 */
function ensureLocationsInLocationsSheet(ss, locations) {
  var locationsSheet = ss.getSheetByName('Locations');
  if (!locationsSheet) {
    Logger.log('ensureLocationsInLocationsSheet: Locations sheet not found');
    return 0;
  }

  var data = locationsSheet.getDataRange().getValues();
  var existingLocations = {};

  // Build map of existing locations (column A)
  for (var i = 1; i < data.length; i++) {
    var loc = String(data[i][0] || '').trim();
    if (loc) {
      existingLocations[loc.toLowerCase()] = true;
    }
  }

  var addedCount = 0;
  var newRows = [];

  for (var j = 0; j < locations.length; j++) {
    var location = locations[j];
    if (!location) continue;

    // Skip special status locations (not physical locations)
    // "Light Duty" kept for backwards compatibility - new ones get Location = "Helena"
    var skipLocations = ['Light Duty', 'Weeds', 'Vacation', 'Leave', 'Previous Employee', 'Unknown'];
    if (skipLocations.indexOf(location) !== -1) continue;

    // Check if location already exists
    if (existingLocations[location.toLowerCase()]) continue;

    // Add new location with default values
    // Columns: Location, Drive Time (min), Direction, Overnight City
    newRows.push([
      location,
      120,        // Default 2 hours drive time
      'Far',      // Default direction
      location    // Overnight city defaults to location name
    ]);

    Logger.log('ensureLocationsInLocationsSheet: Adding new location: ' + location);
    addedCount++;
  }

  if (newRows.length > 0) {
    var lastRow = locationsSheet.getLastRow();
    locationsSheet.getRange(lastRow + 1, 1, newRows.length, 4).setValues(newRows);
    Logger.log('ensureLocationsInLocationsSheet: Added ' + addedCount + ' new location(s)');
  }

  return addedCount;
}

/**
 * Applies crew changes to the Employees sheet.
 * Called from CrewImport.html when user confirms changes.
 * Updates: Location, Job Number, and Job Classification
 *
 * @param {Array} changes - Array of change objects with employee info and new values
 * @return {Object} Result with success message
 */
function applyCrewChanges(changes) {
  Logger.log('=== applyCrewChanges START (BATCH OPTIMIZED) ===');
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
  var secondaryJobNumCol = -1;
  var jobClassificationCol = -1;

  for (var h = 0; h < headers.length; h++) {
    var header = String(headers[h]).toLowerCase().trim();
    if (header === 'location') locationCol = h;
    if (header === 'job number') jobNumCol = h;
    if (header === 'secondary job number' || header === 'secondary job') secondaryJobNumCol = h;
    if (header === 'job classification') jobClassificationCol = h;
  }

  if (locationCol === -1 || jobNumCol === -1) {
    return { success: false, message: 'Could not find Location or Job Number columns in Employees sheet' };
  }

  // AUTO-UPDATE LOCATION VALIDATION: Collect all new locations and ensure they're allowed
  var newLocationsToAdd = [];
  for (var c = 0; c < changes.length; c++) {
    var loc = changes[c].newLocation;
    if (loc && newLocationsToAdd.indexOf(loc) === -1) {
      newLocationsToAdd.push(loc);
    }
  }
  if (newLocationsToAdd.length > 0) {
    // Update Employees sheet Location dropdown validation
    var validationUpdated = ensureLocationsInValidation(employeesSheet, locationCol + 1, newLocationsToAdd);
    if (validationUpdated) {
      Logger.log('applyCrewChanges: Updated Location validation to include: ' + newLocationsToAdd.join(', '));
    }

    // Also add new locations to the Locations sheet (for drive times)
    var locationsAdded = ensureLocationsInLocationsSheet(ss, newLocationsToAdd);
    if (locationsAdded > 0) {
      Logger.log('applyCrewChanges: Added ' + locationsAdded + ' new location(s) to Locations sheet');
    }
  }

  // If Job Classification column doesn't exist, it's column N (index 13)
  if (jobClassificationCol === -1) {
    jobClassificationCol = 13; // Column N = index 13 (0-based)
    Logger.log('Job Classification column not found by header, using column N (index 13)');
  }

  // Log secondary job column status
  if (secondaryJobNumCol !== -1) {
    Logger.log('Secondary Job Number column found at index: ' + secondaryJobNumCol);
  } else {
    Logger.log('Secondary Job Number column not found - run "Add Secondary Job Column" from Utilities menu');
  }

  var updatedCount = 0;
  var historyLogged = 0;
  var changeDetails = []; // Specific changes for UI display
  var historyRows = []; // BATCH: Collect all history entries for single write
  var columnsModified = { location: false, jobNum: false, secondaryJob: false, classification: false };
  var timezone = ss.getSpreadsheetTimeZone();
  var today = new Date();
  var todayStr = Utilities.formatDate(today, timezone, 'MM/dd/yyyy');

  // Get or create Employee History sheet
  var historySheet = ss.getSheetByName('Employee History');

  for (var i = 0; i < changes.length; i++) {
    var change = changes[i];

    // Skip sync-only entries (no actual employee change, just jobNameMap carrier)
    if (change._syncOnly) {
      Logger.log('applyCrewChanges: Skipping _syncOnly entry (no employee changes, just Job Tracking sync)');
      continue;
    }

    try {
      var rowIndex = change.rowIndex;

      // Check if this is a Previous Employee being rehired (rowIndex = -1)
      if (rowIndex === -1) {
        // This employee exists only in Employee History - REHIRE them
        Logger.log('Rehiring Previous Employee: ' + change.employeeName);

        // Add new row to Employees sheet (appendRow since it's a new row)
        var newRow = [];
        for (var col = 0; col < headers.length; col++) {
          var header = String(headers[col]).toLowerCase().trim();
          if (col === nameCol) newRow.push(change.employeeName);
          else if (header === 'location') newRow.push(change.newLocation || '');
          else if (header === 'job number') newRow.push(change.newJobNumber || '');
          else if (header === 'job classification') newRow.push(change.newClassification || '');
          else newRow.push(''); // Empty for other columns
        }

        employeesSheet.appendRow(newRow);
        updatedCount++;

        // Collect rehire history for batch write
        historyRows.push([
          todayStr,                    // Date
          change.employeeName,         // Employee Name
          'Rehired',                   // Event Type
          change.newLocation || '',    // Location
          change.newJobNumber || '',   // Job Number
          '',                          // Hire Date
          '',                          // Last Day
          '',                          // Last Day Reason
          todayStr,                    // Rehire Date
          'Crew Makeup Import: Rehired from Previous Employee. Location: ' + change.newLocation + ', Job #: ' + change.newJobNumber,
          '',                          // Phone Number
          '',                          // Email Address
          '',                          // Glove Size
          ''                           // Sleeve Size
        ]);
        historyLogged++;

        Logger.log('Rehired employee: ' + change.employeeName + ' | Location: ' + change.newLocation + ' | Job #: ' + change.newJobNumber);
        changeDetails.push({
          name: change.employeeName,
          changes: ['Rehired — Location: ' + change.newLocation + ', Job #: ' + change.newJobNumber]
        });
        continue; // Skip to next employee
      }

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

      var dataIdx = rowIndex - 1; // Array index into data[]
      var locationChanged = false;
      var jobChanged = false;
      var secondaryJobChanged = false;
      var classificationChanged = false;

      // BATCH: Modify in memory instead of individual setValue calls
      if (change.newLocation && change.newLocation !== change.oldLocation) {
        data[dataIdx][locationCol] = change.newLocation;
        locationChanged = true;
        columnsModified.location = true;
      }

      if (change.newJobNumber && change.newJobNumber !== change.oldJobNumber) {
        data[dataIdx][jobNumCol] = change.newJobNumber;
        jobChanged = true;
        columnsModified.jobNum = true;
      }

      if (secondaryJobNumCol !== -1 && change.newSecondaryJobNumber) {
        var currentSecondaryJob = String(data[dataIdx][secondaryJobNumCol] || '').trim();
        if (change.newSecondaryJobNumber !== currentSecondaryJob) {
          data[dataIdx][secondaryJobNumCol] = change.newSecondaryJobNumber;
          secondaryJobChanged = true;
          columnsModified.secondaryJob = true;
          Logger.log('Updated secondary job for ' + change.employeeName + ': ' + change.newSecondaryJobNumber);
        }
      }

      if (change.newClassification && change.newClassification !== change.oldClassification) {
        data[dataIdx][jobClassificationCol] = change.newClassification;
        classificationChanged = true;
        columnsModified.classification = true;
      }

      if (locationChanged || jobChanged || secondaryJobChanged || classificationChanged) {
        updatedCount++;

        // BATCH: Collect history rows for single write (instead of individual appendRow)
        if (historySheet) {
          var changesArr = [];
          if (locationChanged) changesArr.push('Location');
          if (jobChanged) changesArr.push('Job Number');
          if (secondaryJobChanged) changesArr.push('Secondary Job');
          if (classificationChanged) changesArr.push('Classification');

          var eventType = changesArr.length > 1 ? 'Multiple Changes' : changesArr[0] + ' Change';

          var notes = 'Crew Makeup Import: ';
          if (locationChanged) notes += 'Location: ' + (change.oldLocation || 'None') + ' → ' + change.newLocation + '. ';
          if (jobChanged) notes += 'Job #: ' + (change.oldJobNumber || 'None') + ' → ' + change.newJobNumber + '. ';
          if (secondaryJobChanged) notes += 'Secondary Job: ' + change.newSecondaryJobNumber + '. ';
          if (classificationChanged) notes += 'Role: ' + (change.oldClassification || 'None') + ' → ' + change.newClassification + '.';

          historyRows.push([
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
          ]);
          historyLogged++;
        }

        Logger.log('Updated (in memory): ' + change.employeeName +
                   ' | Location: ' + (locationChanged ? change.oldLocation + ' → ' + change.newLocation : 'unchanged') +
                   ' | Job #: ' + (jobChanged ? change.oldJobNumber + ' → ' + change.newJobNumber : 'unchanged') +
                   ' | Secondary Job #: ' + (secondaryJobChanged ? change.newSecondaryJobNumber : 'unchanged') +
                   ' | Classification: ' + (classificationChanged ? change.oldClassification + ' → ' + change.newClassification : 'unchanged'));

        // Track change details for UI display
        var empChanges = [];
        if (locationChanged) empChanges.push('Location: ' + (change.oldLocation || 'None') + ' → ' + change.newLocation);
        if (jobChanged) empChanges.push('Job #: ' + (change.oldJobNumber || 'None') + ' → ' + change.newJobNumber);
        if (secondaryJobChanged) empChanges.push('Secondary Job: → ' + change.newSecondaryJobNumber);
        if (classificationChanged) empChanges.push('Role: ' + (change.oldClassification || 'None') + ' → ' + change.newClassification);
        changeDetails.push({ name: change.employeeName, changes: empChanges });
      }

    } catch (e) {
      Logger.log('Error updating employee ' + change.employeeName + ': ' + e.toString());
    }
  }

  // ========== BATCH WRITE: Write modified columns back to Employees sheet ==========
  // Instead of ~200 individual setValue calls, write each modified column in one call
  var batchWriteCount = 0;
  if (columnsModified.location) {
    // Temporarily clear location validation to avoid errors from existing values
    // that might not be in the validation list (e.g., old locations like "Bonner", "Unknown")
    var locationRange = employeesSheet.getRange(2, locationCol + 1, data.length - 1, 1);
    locationRange.clearDataValidations();

    var locationValues = data.map(function(row) { return [row[locationCol]]; });
    employeesSheet.getRange(1, locationCol + 1, data.length, 1).setValues(locationValues);
    batchWriteCount++;

    // Re-apply validation with ALL location values that now exist in the sheet
    var allLocationValues = {};
    for (var lv = 1; lv < data.length; lv++) {
      var locVal = String(data[lv][locationCol] || '').trim();
      if (locVal) allLocationValues[locVal] = true;
    }
    var allLocs = Object.keys(allLocationValues).sort();
    if (allLocs.length > 0) {
      var revalidationRule = SpreadsheetApp.newDataValidation()
        .requireValueInList(allLocs, true)
        .setAllowInvalid(false)
        .build();
      locationRange.setDataValidation(revalidationRule);
      Logger.log('applyCrewChanges: Re-applied location validation with ' + allLocs.length + ' values');
    }
  }
  if (columnsModified.jobNum) {
    var jobNumValues = data.map(function(row) { return [row[jobNumCol]]; });
    employeesSheet.getRange(1, jobNumCol + 1, data.length, 1).setValues(jobNumValues);
    batchWriteCount++;
  }
  if (columnsModified.secondaryJob && secondaryJobNumCol !== -1) {
    var secJobValues = data.map(function(row) { return [row[secondaryJobNumCol]]; });
    employeesSheet.getRange(1, secondaryJobNumCol + 1, data.length, 1).setValues(secJobValues);
    batchWriteCount++;
  }
  if (columnsModified.classification) {
    var classValues = data.map(function(row) { return [row[jobClassificationCol]]; });
    employeesSheet.getRange(1, jobClassificationCol + 1, data.length, 1).setValues(classValues);
    batchWriteCount++;
  }
  Logger.log('applyCrewChanges: Batch wrote ' + batchWriteCount + ' column(s) to Employees sheet');

  // ========== BATCH WRITE: Write all history rows at once ==========
  if (historyRows.length > 0 && historySheet) {
    var lastHistRow = historySheet.getLastRow();
    historySheet.getRange(lastHistRow + 1, 1, historyRows.length, historyRows[0].length).setValues(historyRows);
    Logger.log('applyCrewChanges: Batch wrote ' + historyRows.length + ' history row(s)');
  }

  Logger.log('=== applyCrewChanges END ===');
  Logger.log('Updated: ' + updatedCount + ', History logged: ' + historyLogged);

  var message = '✅ Crew Makeup Import Complete!\n\n';
  message += '📝 Updated: ' + updatedCount + ' employee(s)\n';
  message += '📋 History logged: ' + historyLogged + ' entries';

  logEvent('Crew Makeup Import: Updated ' + updatedCount + ' employees, logged ' + historyLogged + ' history entries');

  // Extract jobNameMap from first change (if provided by client)
  var jobNameMap = null;
  if (changes.length > 0 && changes[0].jobNameMap) {
    jobNameMap = changes[0].jobNameMap;
    Logger.log('applyCrewChanges: Received jobNameMap with ' + Object.keys(jobNameMap).length + ' entries');
  }

  // Sync with Job Tracking sheet if it exists
  var jobTrackingResult = syncJobTrackingAfterImport(ss, jobNameMap);
  var pendingJobs = [];

  if (jobTrackingResult) {
    message += '\n\n📊 Job Tracking: ' + jobTrackingResult.message;
    pendingJobs = jobTrackingResult.pendingJobs || [];

    if (pendingJobs.length > 0) {
      message += '\n\n⚠️ ' + pendingJobs.length + ' "Pending Start" job(s) now have employees assigned.';
    }
  }

  return {
    success: true,
    message: message,
    pendingJobs: pendingJobs,
    changeDetails: changeDetails
  };
}

/**
 * Syncs Job Tracking sheet after crew import.
 * - Updates existing jobs with new foreman/crew size/location
 * - Detects "Pending Start" jobs that now have employees (returns for UI decision)
 * - Adds new jobs that appeared in the import
 * - Marks jobs with no employees as needing review
 *
 * @param {Spreadsheet} ss - Active spreadsheet
 * @return {Object} Result with message and pendingJobs array
 */
function syncJobTrackingAfterImport(ss, jobNameMap) {
  var jobSheet = ss.getSheetByName('Job Tracking');
  if (!jobSheet) {
    Logger.log('syncJobTrackingAfterImport: Job Tracking sheet not found, skipping');
    return null;
  }

  // Auto-activate any On Hold / Pending Start jobs whose activation date has arrived
  try {
    var autoResult = checkAndActivateScheduledJobs();
    if (autoResult.activated > 0) {
      Logger.log('syncJobTrackingAfterImport: Auto-activated ' + autoResult.activated + ' job(s): ' + autoResult.jobs.join(', '));
    }
  } catch (e) {
    Logger.log('syncJobTrackingAfterImport: Auto-activation check failed (non-critical): ' + e.toString());
  }

  var employeesSheet = ss.getSheetByName('Employees');
  if (!employeesSheet) {
    return null;
  }

  // Get current Job Tracking data
  // Columns: A=Job Number(0), B=Location(1), C=Foreman(2), D=Crew Size(3), E=Start Date(4),
  //          F=Put On Hold Date(5), G=Estimated Return(6), H=Est. End Date(7), I=Actual End Date(8),
  //          J=Status(9), K=Notes(10), L-R=Skip Days(11-17), S-T=Skip Flags(18-19), U=Last Updated(20)
  var jobData = jobSheet.getDataRange().getValues();
  var existingJobs = {};

  for (var j = 1; j < jobData.length; j++) {
    var jobNum = String(jobData[j][0] || '').trim();
    if (jobNum) {
      existingJobs[jobNum] = {
        rowIndex: j + 1,
        location: jobData[j][1],
        foreman: jobData[j][2],
        crewSize: jobData[j][3],
        startDate: jobData[j][4],
        putOnHoldDate: jobData[j][5],
        estimatedReturn: jobData[j][6],
        estEndDate: jobData[j][7],
        actualEndDate: jobData[j][8],
        status: String(jobData[j][9] || '').trim(),
        notes: jobData[j][10] || ''
      };
    }
  }

  // Get current crews from Employees sheet
  var empData = employeesSheet.getDataRange().getValues();
  var empHeaders = empData[0];

  var nameCol = -1, jobNumCol = -1, locationCol = -1, classificationCol = -1, lastDayCol = -1;
  for (var h = 0; h < empHeaders.length; h++) {
    var header = String(empHeaders[h]).toLowerCase().trim();
    if (header === 'name') nameCol = h;
    if (header === 'job number') jobNumCol = h;
    if (header === 'location') locationCol = h;
    if (header === 'job classification') classificationCol = h;
    if (header === 'last day') lastDayCol = h;
  }

  if (jobNumCol === -1) return null;

  // Build current crew data from Employees
  var crewMap = {};

  for (var i = 1; i < empData.length; i++) {
    var row = empData[i];
    var jobNumber = String(row[jobNumCol] || '').trim();
    var lastDay = lastDayCol !== -1 ? row[lastDayCol] : '';

    if (!jobNumber || lastDay) continue;

    var crewNumber = jobNumber;
    var dotIndex = jobNumber.lastIndexOf('.');
    if (dotIndex !== -1) {
      crewNumber = jobNumber.substring(0, dotIndex);
    }

    if (!/^\d{3}-\d{2}$/.test(crewNumber)) continue;
    if (crewNumber.startsWith('000-') || crewNumber.startsWith('002-')) continue;

    var name = nameCol !== -1 ? String(row[nameCol] || '').trim() : '';
    var location = locationCol !== -1 ? String(row[locationCol] || '').trim() : '';
    var classification = classificationCol !== -1 ? String(row[classificationCol] || '').trim() : '';

    if (!crewMap[crewNumber]) {
      crewMap[crewNumber] = {
        location: location,
        foreman: '',
        crewSize: 0,
        employees: []
      };
    }

    crewMap[crewNumber].crewSize++;
    crewMap[crewNumber].employees.push(name);

    if (!crewMap[crewNumber].location && location) {
      crewMap[crewNumber].location = location;
    }

    // Check for foreman classification (includes F, GTO F, GF, SUP)
    if (classification === 'F' || classification === 'GTO F' || classification === 'GF' || classification === 'SUP') {
      crewMap[crewNumber].foreman = name;
    }
  }

  var timestamp = new Date();
  var updatedCount = 0;
  var addedCount = 0;
  var pendingJobsWithEmployees = []; // Jobs that are Pending Start but now have employees
  var newRows = [];
  var jobDataModified = false; // BATCH: Track if jobData array was modified

  // Process each crew from Employees
  for (var crewNum in crewMap) {
    var crew = crewMap[crewNum];

    if (existingJobs[crewNum]) {
      // Update existing job - BATCH: modify in memory instead of individual setValue
      var existing = existingJobs[crewNum];
      var dataIdx = existing.rowIndex - 1; // Array index into jobData[]

      jobData[dataIdx][1] = crew.location || existing.location || 'Unknown';  // Location (B)
      jobData[dataIdx][2] = crew.foreman || existing.foreman || '';           // Foreman (C)
      jobData[dataIdx][3] = crew.crewSize;                                    // Crew Size (D)
      jobData[dataIdx][20] = timestamp;                                       // Last Updated (U)
      jobDataModified = true;

      // If status is "Pending Start" and now has employees, DON'T auto-activate
      // Instead, track for user decision
      if (existing.status === 'Pending Start' && crew.crewSize > 0) {
        pendingJobsWithEmployees.push({
          jobNumber: crewNum,
          location: crew.location || existing.location || 'Unknown',
          foreman: crew.foreman || '',
          crewSize: crew.crewSize,
          startDate: existing.startDate,
          employees: crew.employees,
          rowIndex: existing.rowIndex
        });
        Logger.log('syncJobTrackingAfterImport: Pending Start job ' + crewNum + ' has ' + crew.crewSize + ' employees - needs user decision');
      }

      updatedCount++;
      delete existingJobs[crewNum];
    } else {
      // New crew - add to Job Tracking (21 columns: A-U)
      newRows.push([
        crewNum,                    // Job Number (A)
        crew.location || 'Unknown', // Location (B)
        crew.foreman || '',         // Foreman (C)
        crew.crewSize,              // Crew Size (D)
        timestamp,                  // Start Date (E) = today (just appeared)
        '',                         // Put On Hold Date (F)
        '',                         // Estimated Return (G)
        '',                         // Est. End Date (H)
        '',                         // Actual End Date (I)
        'Active',                   // Status (J)
        'Added via Crew Import on ' + Utilities.formatDate(timestamp, Session.getScriptTimeZone(), 'MM/dd/yyyy'), // Notes (K)
        true,                       // Skip Sun (L) - DEFAULT Mon-Thu
        false,                      // Skip Mon (M)
        false,                      // Skip Tue (N)
        false,                      // Skip Wed (O)
        false,                      // Skip Thu (P)
        true,                       // Skip Fri (Q) - DEFAULT Mon-Thu
        true,                       // Skip Sat (R) - DEFAULT Mon-Thu
        false,                      // Skip Weekly Meeting (S)
        false,                      // Skip Monthly Checklist (T)
        timestamp                   // Last Updated (U)
      ]);
      addedCount++;
    }
  }

  // Check for jobs that now have no employees (not in crewMap) - modify in memory
  var emptyJobCount = 0;
  for (var oldCrew in existingJobs) {
    var oldData = existingJobs[oldCrew];
    if (oldData.status === 'Active' || oldData.status === 'Pending Start') {
      // This job had no employees in the import
      if (oldData.crewSize > 0) {
        var emptyIdx = oldData.rowIndex - 1; // Array index
        // Update crew size to 0 and add note - BATCH: modify in memory
        jobData[emptyIdx][3] = 0;  // Crew Size (D)
        var oldNotes = String(jobData[emptyIdx][10] || '');
        var emptyNote = 'No employees in Crew Import on ' + Utilities.formatDate(timestamp, Session.getScriptTimeZone(), 'MM/dd/yyyy');
        if (oldNotes.indexOf('No employees') === -1) {
          jobData[emptyIdx][10] = oldNotes ? oldNotes + '; ' + emptyNote : emptyNote;  // Notes (K)
        }
        jobDataModified = true;
        emptyJobCount++;
      }
    }
  }

  // ========== BATCH WRITE: Write modified columns back to Job Tracking sheet ==========
  if (jobDataModified) {
    // Write Location (B), Foreman (C), Crew Size (D) columns
    var colBCD = jobData.map(function(row) { return [row[1], row[2], row[3]]; });
    jobSheet.getRange(1, 2, jobData.length, 3).setValues(colBCD);

    // Write Notes (K) column
    var colK = jobData.map(function(row) { return [row[10]]; });
    jobSheet.getRange(1, 11, jobData.length, 1).setValues(colK);

    // Write Last Updated (U) column
    var colU = jobData.map(function(row) { return [row[20]]; });
    jobSheet.getRange(1, 21, jobData.length, 1).setValues(colU);

    Logger.log('syncJobTrackingAfterImport: Batch wrote Job Tracking columns (B,C,D,K,U) for ' + jobData.length + ' rows');
  }

  // Add new rows (already batched)
  if (newRows.length > 0) {
    var lastRow = jobSheet.getLastRow();
    jobSheet.getRange(lastRow + 1, 1, newRows.length, 21).setValues(newRows);
    // Add checkboxes for skip day columns (L-T = cols 12-20) on new rows
    jobSheet.getRange(lastRow + 1, 12, newRows.length, 9).insertCheckboxes();
  }

  // Build result message
  var results = [];
  if (updatedCount > 0) results.push(updatedCount + ' updated');
  if (addedCount > 0) results.push(addedCount + ' new jobs added');
  if (emptyJobCount > 0) results.push(emptyJobCount + ' jobs have no employees');

  // Backfill empty Job Names from Excel header data (if available)
  var jobNamesFilled = 0;
  if (jobNameMap && Object.keys(jobNameMap).length > 0) {
    jobNamesFilled = backfillJobNamesFromImport(jobSheet, jobNameMap);
    if (jobNamesFilled > 0) {
      results.push(jobNamesFilled + ' Job Name(s) backfilled');
    }
  }

  Logger.log('syncJobTrackingAfterImport: ' + results.join(', '));
  if (pendingJobsWithEmployees.length > 0) {
    Logger.log('syncJobTrackingAfterImport: ' + pendingJobsWithEmployees.length + ' Pending Start jobs need activation decision');
  }

  // Also run syncCrews to ensure foremen and default schedules are applied
  // This updates the new schedule columns (L-T) if they exist
  try {
    var syncResult = syncCrews(true);  // Silent mode
    if (syncResult && syncResult.success) {
      Logger.log('syncJobTrackingAfterImport: syncCrews complete - ' +
                 syncResult.foremanUpdates + ' foreman updates, ' +
                 syncResult.scheduleDefaults + ' schedule defaults');
    }
  } catch (e) {
    Logger.log('syncJobTrackingAfterImport: syncCrews failed (non-critical): ' + e.toString());
  }

  return {
    message: results.length > 0 ? results.join(', ') : 'No changes',
    pendingJobs: pendingJobsWithEmployees
  };
}

/**
 * Activates specified jobs from Pending Start to Active status.
 * Called from CrewImport.html after user confirms which jobs to activate.
 *
 * @param {Array} jobNumbers - Array of job numbers to activate
 * @return {Object} Result with count of activated jobs
 */
function activatePendingJobs(jobNumbers) {
  if (!jobNumbers || jobNumbers.length === 0) {
    return { success: true, activated: 0, message: 'No jobs to activate' };
  }

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var jobSheet = ss.getSheetByName('Job Tracking');

  if (!jobSheet) {
    return { success: false, message: 'Job Tracking sheet not found' };
  }

  var jobData = jobSheet.getDataRange().getValues();
  var timestamp = new Date();
  var activatedCount = 0;

  for (var i = 1; i < jobData.length; i++) {
    var jobNum = String(jobData[i][0] || '').trim();

    if (jobNumbers.indexOf(jobNum) !== -1) {
      var currentStatus = String(jobData[i][9] || '').trim();  // Status (J, index 9)

      if (currentStatus === 'Pending Start' || currentStatus === 'On Hold') {
        var rowIdx = i + 1;
        jobSheet.getRange(rowIdx, 10).setValue('Active');  // Status (J, column 10)

        // Clear Put On Hold Date (F) if coming from On Hold
        if (currentStatus === 'On Hold') {
          jobSheet.getRange(rowIdx, 6).setValue('');  // Put On Hold Date (F)
          jobSheet.getRange(rowIdx, 7).setValue('');  // Estimated Return (G)
        }

        var currentNotes = jobData[i][10] || '';  // Notes (K, index 10)
        var activateNote = 'Activated from ' + currentStatus + ' on ' + Utilities.formatDate(timestamp, Session.getScriptTimeZone(), 'MM/dd/yyyy') + ' via Crew Import';
        jobSheet.getRange(rowIdx, 11).setValue(currentNotes ? currentNotes + '; ' + activateNote : activateNote);  // Notes (K)
        jobSheet.getRange(rowIdx, 21).setValue(timestamp);  // Last Updated (U)

        activatedCount++;
        Logger.log('activatePendingJobs: Activated ' + jobNum);
      }
    }
  }

  return {
    success: true,
    activated: activatedCount,
    message: activatedCount + ' job(s) activated'
  };
}

/**
 * Sets a scheduled activation date for an On Hold or Pending Start job.
 * For On Hold jobs: saves to "Estimated Return" (column G).
 * For Pending Start jobs: saves to "Start Date" (column E).
 * checkAndActivateScheduledJobs() will auto-activate when the date arrives.
 *
 * @param {string} jobNumber - The job number (e.g., "041-26")
 * @param {string} activationDateStr - The activation date as YYYY-MM-DD string
 * @return {Object} Result with success status
 */
function setJobActivationDate(jobNumber, activationDateStr) {
  Logger.log('setJobActivationDate: ' + jobNumber + ' -> ' + activationDateStr);

  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var jobSheet = ss.getSheetByName('Job Tracking');
    if (!jobSheet) {
      return { success: false, message: 'Job Tracking sheet not found' };
    }

    // Parse YYYY-MM-DD explicitly to avoid timezone ambiguity
    // (new Date('YYYY-MM-DDT00:00:00') can be treated as UTC in GAS V8, causing off-by-one day)
    var dateParts = activationDateStr.split('-');
    var dateObj = new Date(parseInt(dateParts[0], 10), parseInt(dateParts[1], 10) - 1, parseInt(dateParts[2], 10));
    if (isNaN(dateObj.getTime())) {
      return { success: false, message: 'Invalid date: ' + activationDateStr };
    }

    var data = jobSheet.getDataRange().getValues();
    for (var i = 1; i < data.length; i++) {
      if (String(data[i][0]).trim() === jobNumber) {
        var rowIdx = i + 1;
        var status = String(data[i][9] || '').trim();
        var timestamp = new Date();

        if (status === 'On Hold') {
          // Save to Estimated Return (G, column 7)
          jobSheet.getRange(rowIdx, 7).setValue(dateObj);
          jobSheet.getRange(rowIdx, 7).setNumberFormat('MM/dd/yyyy');
        } else if (status === 'Pending Start') {
          // Save to Start Date (E, column 5)
          jobSheet.getRange(rowIdx, 5).setValue(dateObj);
          jobSheet.getRange(rowIdx, 5).setNumberFormat('MM/dd/yyyy');
        } else {
          return { success: false, message: 'Job ' + jobNumber + ' is "' + status + '", not On Hold or Pending Start' };
        }

        // Update notes and timestamp
        var currentNotes = String(data[i][10] || '');
        var dateNote = 'Activation scheduled for ' + Utilities.formatDate(dateObj, Session.getScriptTimeZone(), 'MM/dd/yyyy') +
                       ' (set on ' + Utilities.formatDate(timestamp, Session.getScriptTimeZone(), 'MM/dd/yyyy') + ')';
        jobSheet.getRange(rowIdx, 11).setValue(currentNotes ? currentNotes + '; ' + dateNote : dateNote);
        jobSheet.getRange(rowIdx, 21).setValue(timestamp);  // Last Updated (U)

        Logger.log('setJobActivationDate: Set activation date for ' + jobNumber + ' (' + status + ') to ' + activationDateStr);
        return { success: true, message: 'Activation date set to ' + Utilities.formatDate(dateObj, Session.getScriptTimeZone(), 'MM/dd/yyyy'), status: status };
      }
    }

    return { success: false, message: 'Job ' + jobNumber + ' not found in Job Tracking' };
  } catch (e) {
    Logger.log('setJobActivationDate error: ' + e.toString());
    return { success: false, message: 'Error: ' + e.toString() };
  }
}

/**
 * Checks all On Hold and Pending Start jobs and auto-activates any whose
 * scheduled activation date has arrived (today or earlier).
 * - On Hold jobs: checks "Estimated Return" (column G)
 * - Pending Start jobs: checks "Start Date" (column E)
 *
 * Called automatically during syncJobTrackingAfterImport() and generateAllReports().
 *
 * @return {Object} Result with activated job numbers and count
 */
function checkAndActivateScheduledJobs() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var jobSheet = ss.getSheetByName('Job Tracking');
  if (!jobSheet) return { activated: 0, jobs: [] };

  var data = jobSheet.getDataRange().getValues();
  var today = new Date();
  today.setHours(0, 0, 0, 0);

  var activatedJobs = [];
  var timestamp = new Date();
  var dataModified = false;

  for (var i = 1; i < data.length; i++) {
    var jobNum = String(data[i][0] || '').trim();
    var status = String(data[i][9] || '').trim();
    if (!jobNum) continue;

    var activationDate = null;
    var dateSource = '';

    if (status === 'On Hold') {
      // Check Estimated Return (G, index 6)
      var estReturn = data[i][6];
      if (estReturn instanceof Date && !isNaN(estReturn.getTime())) {
        activationDate = new Date(estReturn);
        dateSource = 'Estimated Return';
      }
    } else if (status === 'Pending Start') {
      // Check Start Date (E, index 4)
      var startDate = data[i][4];
      if (startDate instanceof Date && !isNaN(startDate.getTime())) {
        activationDate = new Date(startDate);
        dateSource = 'Start Date';
      }
    }

    if (!activationDate) continue;
    activationDate.setHours(0, 0, 0, 0);

    // If activation date is today or in the past, activate the job
    if (activationDate <= today) {
      // BATCH: Modify in memory instead of individual setValue
      data[i][9] = 'Active';  // Status (J)

      // Clear On Hold fields if coming from On Hold
      if (status === 'On Hold') {
        data[i][5] = '';  // Put On Hold Date (F)
        data[i][6] = '';  // Estimated Return (G)
      }

      var currentNotes = String(data[i][10] || '');
      var activateNote = 'Auto-activated on ' + Utilities.formatDate(timestamp, Session.getScriptTimeZone(), 'MM/dd/yyyy') +
                         ' (' + dateSource + ' reached)';
      data[i][10] = currentNotes ? currentNotes + '; ' + activateNote : activateNote;
      data[i][20] = timestamp;  // Last Updated (U)
      dataModified = true;

      activatedJobs.push(jobNum);
      Logger.log('checkAndActivateScheduledJobs: Auto-activated ' + jobNum + ' (was ' + status + ', ' + dateSource + ' = ' +
                 Utilities.formatDate(activationDate, Session.getScriptTimeZone(), 'MM/dd/yyyy') + ')');
    }
  }

  // BATCH WRITE: Write all modified columns at once
  if (dataModified) {
    // Write columns F, G (Put On Hold, Estimated Return)
    var colFG = data.map(function(row) { return [row[5], row[6]]; });
    jobSheet.getRange(1, 6, data.length, 2).setValues(colFG);

    // Write Status (J), Notes (K) columns
    var colJK = data.map(function(row) { return [row[9], row[10]]; });
    jobSheet.getRange(1, 10, data.length, 2).setValues(colJK);

    // Write Last Updated (U)
    var colU = data.map(function(row) { return [row[20]]; });
    jobSheet.getRange(1, 21, data.length, 1).setValues(colU);

    Logger.log('checkAndActivateScheduledJobs: Batch wrote activated job changes');
  }

  if (activatedJobs.length > 0) {
    Logger.log('checkAndActivateScheduledJobs: Activated ' + activatedJobs.length + ' job(s): ' + activatedJobs.join(', '));
  }

  return { activated: activatedJobs.length, jobs: activatedJobs };
}

/**
 * Marks a job as Completed from the Crew Import dialog.
 * Sets Status to "Completed" and Actual End Date to the specified date.
 * Also syncs related sheets (Training Tracking, Safety Compliance Config, etc.)
 *
 * @param {string} jobNumber - The job number to mark as completed (e.g., "052-25")
 * @param {string} completionDateStr - The completion date as string (YYYY-MM-DD format)
 * @return {Object} Result with success status and message
 */
function markJobCompletedFromImport(jobNumber, completionDateStr) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var jobSheet = ss.getSheetByName('Job Tracking');

  if (!jobSheet) {
    return { success: false, message: 'Job Tracking sheet not found' };
  }

  var jobData = jobSheet.getDataRange().getValues();
  var foundRow = -1;

  for (var i = 1; i < jobData.length; i++) {
    if (String(jobData[i][0] || '').trim() === jobNumber) {
      foundRow = i + 1;
      break;
    }
  }

  if (foundRow === -1) {
    return { success: false, message: 'Job number "' + jobNumber + '" not found in Job Tracking' };
  }

  // Parse the completion date
  var completionDate;
  if (completionDateStr) {
    var parts = completionDateStr.split('-');
    completionDate = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
  } else {
    completionDate = new Date();
  }

  var timestamp = new Date();

  // Update the row - BOTH Status AND Actual End Date (new column positions)
  jobSheet.getRange(foundRow, 9).setValue(completionDate);   // Actual End Date (I, column 9)
  jobSheet.getRange(foundRow, 10).setValue('Completed');     // Status (J, column 10)
  jobSheet.getRange(foundRow, 21).setValue(timestamp);       // Last Updated (U, column 21)

  // Add note about completion (Notes is now column K, index 10)
  var currentNotes = jobData[foundRow - 1][10] || '';
  var completedNote = 'Marked Completed via Crew Import on ' + Utilities.formatDate(timestamp, Session.getScriptTimeZone(), 'MM/dd/yyyy');
  jobSheet.getRange(foundRow, 11).setValue(currentNotes ? currentNotes + '; ' + completedNote : completedNote);  // Notes (K)

  Logger.log('markJobCompletedFromImport: Job ' + jobNumber + ' marked as Completed with date ' + completionDateStr);

  // Sync related sheets
  try {
    // Remove future training rows for this completed job
    var trainingDeleted = autoSyncCompletedJobToTraining(jobNumber, completionDate);
    Logger.log('markJobCompletedFromImport: Deleted ' + trainingDeleted + ' future training rows');
  } catch (err) {
    Logger.log('markJobCompletedFromImport: Error syncing training: ' + err);
  }

  return {
    success: true,
    message: 'Job ' + jobNumber + ' marked as Completed'
  };
}

/**
 * Gets Job Tracking data for the Crew Import dialog.
 * Returns status and dates for each job so the dialog can:
 * - Hide completed jobs from preview
 * - Show Pending Start jobs with their location and start date
 *
 * @return {Object} Map of job numbers to their tracking data
 */
function getJobTrackingForCrewImport() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var jobSheet = ss.getSheetByName('Job Tracking');

  if (!jobSheet) {
    Logger.log('getJobTrackingForCrewImport: Job Tracking sheet not found');
    return {};
  }

  var data = jobSheet.getDataRange().getValues();
  var headers = data[0];
  var result = {};

  // Find Job Name column dynamically (may not exist on older sheets)
  var jobNameCol = -1;
  for (var h = 0; h < headers.length; h++) {
    if (String(headers[h]).trim() === 'Job Name') { jobNameCol = h; break; }
  }

  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var jobNumber = String(row[0] || '').trim();

    if (!jobNumber) continue;

    // Updated column indexes: Status(9), Start Date(4), Est. End Date(7), Location(1), Foreman(2)
    var status = String(row[9] || '').trim();     // Status (J, index 9)
    var startDate = row[4];                       // Start Date (E, index 4)
    var estimatedReturn = row[6];                 // Estimated Return (G, index 6)
    var estEndDate = row[7];                      // Est. End Date (H, index 7)
    var location = String(row[1] || '').trim();
    var foreman = String(row[2] || '').trim();
    var jobName = jobNameCol !== -1 ? String(row[jobNameCol] || '').trim() : '';

    // Format dates for JSON
    var startDateStr = '';
    var estEndDateStr = '';
    var estimatedReturnStr = '';

    if (startDate instanceof Date && !isNaN(startDate.getTime())) {
      startDateStr = Utilities.formatDate(startDate, Session.getScriptTimeZone(), 'MM/dd/yyyy');
    } else if (startDate) {
      startDateStr = String(startDate);
    }

    if (estEndDate instanceof Date && !isNaN(estEndDate.getTime())) {
      estEndDateStr = Utilities.formatDate(estEndDate, Session.getScriptTimeZone(), 'MM/dd/yyyy');
    } else if (estEndDate) {
      estEndDateStr = String(estEndDate);
    }

    if (estimatedReturn instanceof Date && !isNaN(estimatedReturn.getTime())) {
      estimatedReturnStr = Utilities.formatDate(estimatedReturn, Session.getScriptTimeZone(), 'MM/dd/yyyy');
    } else if (estimatedReturn) {
      estimatedReturnStr = String(estimatedReturn);
    }

    result[jobNumber] = {
      status: status,
      location: location,
      foreman: foreman,
      jobName: jobName,
      startDate: startDateStr,
      estEndDate: estEndDateStr,
      estimatedReturn: estimatedReturnStr,
      isCompleted: status === 'Completed',
      isPendingStart: status === 'Pending Start',
      isActive: status === 'Active',
      isOnHold: status === 'On Hold',
      schedule: deriveScheduleLabel(row)
    };
  }

  Logger.log('getJobTrackingForCrewImport: Found ' + Object.keys(result).length + ' jobs' + (jobNameCol !== -1 ? ' (with Job Name column)' : ' (no Job Name column)'));
  return result;
}

/**
 * Returns location names from the Locations sheet for dropdown use.
 * @return {Array} Array of location name strings, sorted alphabetically
 */
function getLocationsForDropdown() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Locations');
  if (!sheet || sheet.getLastRow() < 2) return [];

  var data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues();
  var locations = [];
  for (var i = 0; i < data.length; i++) {
    var loc = String(data[i][0] || '').trim();
    if (loc) locations.push(loc);
  }
  return locations.sort();
}

/**
 * Derives a human-readable schedule label from Job Tracking skip-day columns.
 * Columns L-R (indices 11-17) are: Skip Sun, Skip Mon, Skip Tue, Skip Wed, Skip Thu, Skip Fri, Skip Sat
 * @param {Array} row - Full row from Job Tracking sheet
 * @returns {string} Schedule label (e.g., "Mon-Thu", "Tue-Fri", "Mon-Fri", or "" if no data)
 */
function deriveScheduleLabel(row) {
  // Indices 11-17 = Skip Sun, Skip Mon, Skip Tue, Skip Wed, Skip Thu, Skip Fri, Skip Sat
  var dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  var workDays = [];
  var hasAnySkipData = false;

  for (var d = 0; d < 7; d++) {
    var skipVal = row[11 + d];
    if (skipVal === true || skipVal === 'TRUE' || skipVal === 'true') {
      hasAnySkipData = true;
      // This day is skipped (not a work day)
    } else if (skipVal === false || skipVal === 'FALSE' || skipVal === 'false') {
      hasAnySkipData = true;
      workDays.push(dayNames[d]);
    } else {
      // No value / empty - assume it's a work day (weekday) or skip day (weekend)
      if (d === 0 || d === 6) {
        // Sun/Sat default to skip
      } else {
        workDays.push(dayNames[d]);
      }
    }
  }

  if (!hasAnySkipData) return ''; // No schedule data configured

  // Common patterns
  var workDayStr = workDays.join(',');
  if (workDayStr === 'Mon,Tue,Wed,Thu') return 'Mon-Thu';
  if (workDayStr === 'Tue,Wed,Thu,Fri') return 'Tue-Fri';
  if (workDayStr === 'Mon,Tue,Wed,Thu,Fri') return 'Mon-Fri';
  if (workDayStr === 'Mon,Tue,Wed,Thu,Fri,Sat') return 'Mon-Sat';

  // If consecutive, show range
  if (workDays.length >= 2) {
    return workDays[0] + '-' + workDays[workDays.length - 1];
  }

  return workDays.join(', ') || '';
}

/**
 * Adds or updates a job in the Job Tracking sheet.
 * Used from Crew Import to set a job as Pending Start with a start date.
 *
 * @param {string} jobNumber - Job number (e.g., "018-26")
 * @param {string} location - Location name
 * @param {string} foreman - Foreman name (optional)
 * @param {number} crewSize - Number of employees
 * @param {string} startDate - Start date as string (YYYY-MM-DD)
 * @param {string} status - Status (Active, Pending Start, Completed, On Hold)
 * @return {Object} Result with success status and message
 */
function addOrUpdateJobTracking(jobNumber, location, foreman, crewSize, startDate, status, jobName) {
  Logger.log('=== addOrUpdateJobTracking ===');
  Logger.log('Job: ' + jobNumber + ', Location: ' + location + ', JobName: ' + (jobName || '(none)') + ', Status: ' + status + ', Start: ' + startDate);

  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var jobSheet = ss.getSheetByName('Job Tracking');

    if (!jobSheet) {
      // Create the sheet if it doesn't exist (21 visible columns + 4 hidden + 1 Job Name = 26 total)
      jobSheet = ss.insertSheet('Job Tracking');
      var headers = ['Job Number', 'Location', 'Foreman', 'Crew Size', 'Start Date', 'Put On Hold Date', 'Estimated Return', 'Est. End Date', 'Actual End Date', 'Status', 'Notes', 'Skip Sun', 'Skip Mon', 'Skip Tue', 'Skip Wed', 'Skip Thu', 'Skip Fri', 'Skip Sat', 'Skip Weekly Meeting', 'Skip Monthly Checklist', 'Last Updated', 'Work Schedule', 'Skip Days', 'Schedule Effective', 'Schedule History', 'Job Name'];
      jobSheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      jobSheet.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#1565c0').setFontColor('white');
      jobSheet.hideColumns(22, 4);  // Hide V-Y (Work Schedule through Schedule History)
      Logger.log('Created Job Tracking sheet with 26 columns (includes Job Name)');
    }

    // Find Job Name column dynamically
    var allHeaders = jobSheet.getRange(1, 1, 1, jobSheet.getLastColumn()).getValues()[0];
    var jobNameCol = -1;
    for (var h = 0; h < allHeaders.length; h++) {
      if (String(allHeaders[h]).trim() === 'Job Name') { jobNameCol = h + 1; break; } // 1-based
    }

    var data = jobSheet.getDataRange().getValues();
    var existingRow = -1;

    // Find existing row for this job
    for (var i = 1; i < data.length; i++) {
      if (String(data[i][0]).trim() === jobNumber) {
        existingRow = i + 1; // 1-based row number
        break;
      }
    }

    var timestamp = new Date();
    var formattedTimestamp = Utilities.formatDate(timestamp, Session.getScriptTimeZone(), 'MM/dd/yyyy HH:mm');

    // Parse start date - use explicit constructor to avoid timezone issues
    // (new Date('YYYY-MM-DDT00:00:00') can be treated as UTC in GAS V8, causing off-by-one day)
    var startDateObj = null;
    if (startDate) {
      var sdParts = startDate.split('-');
      if (sdParts.length === 3) {
        startDateObj = new Date(parseInt(sdParts[0], 10), parseInt(sdParts[1], 10) - 1, parseInt(sdParts[2], 10));
      } else {
        startDateObj = new Date(startDate);
      }
      if (isNaN(startDateObj.getTime())) {
        startDateObj = null;
      }
    }

    if (existingRow > 0) {
      // Update existing row - preserve some values, update others (new column positions)
      jobSheet.getRange(existingRow, 2).setValue(location);                      // Location (B)
      if (foreman) jobSheet.getRange(existingRow, 3).setValue(foreman);          // Foreman (C)
      if (crewSize > 0) jobSheet.getRange(existingRow, 4).setValue(crewSize);    // Crew Size (D)
      if (startDateObj) jobSheet.getRange(existingRow, 5).setValue(startDateObj);// Start Date (E)
      jobSheet.getRange(existingRow, 10).setValue(status);                       // Status (J)
      jobSheet.getRange(existingRow, 21).setValue(formattedTimestamp);           // Last Updated (U)
      // Write Job Name if column exists and value provided
      if (jobNameCol > 0 && jobName) {
        jobSheet.getRange(existingRow, jobNameCol).setValue(jobName);
      }

      Logger.log('Updated existing job ' + jobNumber + ' at row ' + existingRow);
      return { success: true, message: 'Updated job ' + jobNumber, row: existingRow, action: 'updated' };
    } else {
      // Add new row (21 columns: A-U with skip day defaults)
      var newRow = [
        jobNumber,                  // Job Number (A)
        location,                   // Location (B)
        foreman || '',              // Foreman (C)
        crewSize || 0,              // Crew Size (D)
        startDateObj || '',         // Start Date (E)
        '',                         // Put On Hold Date (F)
        '',                         // Estimated Return (G)
        '',                         // Est. End Date (H)
        '',                         // Actual End Date (I)
        status,                     // Status (J)
        'Added via Crew Import',    // Notes (K)
        true,                       // Skip Sun (L) - DEFAULT Mon-Thu
        false,                      // Skip Mon (M)
        false,                      // Skip Tue (N)
        false,                      // Skip Wed (O)
        false,                      // Skip Thu (P)
        true,                       // Skip Fri (Q) - DEFAULT Mon-Thu
        true,                       // Skip Sat (R) - DEFAULT Mon-Thu
        false,                      // Skip Weekly Meeting (S)
        false,                      // Skip Monthly Checklist (T)
        formattedTimestamp          // Last Updated (U)
      ];

      // Pad to Job Name column if it exists
      if (jobNameCol > 0) {
        while (newRow.length < jobNameCol - 1) {
          newRow.push(''); // Pad hidden columns
        }
        newRow.push(jobName || ''); // Job Name (Z or wherever it is)
      }

      jobSheet.appendRow(newRow);
      var newRowNum = jobSheet.getLastRow();
      // Add checkboxes for skip day columns (L-T = cols 12-20)
      jobSheet.getRange(newRowNum, 12, 1, 9).insertCheckboxes();

      Logger.log('Added new job ' + jobNumber + ' at row ' + newRowNum);
      return { success: true, message: 'Added job ' + jobNumber, row: newRowNum, action: 'added' };
    }
  } catch (e) {
    Logger.log('Error in addOrUpdateJobTracking: ' + e.toString());
    return { success: false, message: 'Error: ' + e.toString() };
  }
}

/**
 * Adds multiple new jobs to Job Tracking from crew import.
 * Called when new job numbers are detected in the Excel file.
 *
 * @param {string} jobsJson - JSON array of {jobNumber, jobName, location}
 * @return {Object} Result with success count and details
 */
function addNewJobsToTracking(jobsJson) {
  Logger.log('=== addNewJobsToTracking ===');
  var jobs = JSON.parse(jobsJson);
  var results = [];
  var successCount = 0;

  for (var i = 0; i < jobs.length; i++) {
    var job = jobs[i];
    var result = addOrUpdateJobTracking(
      job.jobNumber,
      job.location,
      '',          // foreman (unknown yet)
      0,           // crew size (unknown yet)
      '',          // start date
      'Active',    // default to Active
      job.jobName  // new Job Name field
    );
    results.push(result);
    if (result.success) successCount++;
  }

  Logger.log('addNewJobsToTracking: Added ' + successCount + '/' + jobs.length + ' jobs');
  return { success: true, added: successCount, total: jobs.length, results: results };
}

/**
 * Migration function: Adds "Job Name" column to existing Job Tracking sheet.
 * Safe to run multiple times (idempotent).
 * Appends the column at the end so NO existing indices shift.
 */
function migrateJobTrackingAddJobName() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Job Tracking');

  if (!sheet) {
    SpreadsheetApp.getUi().alert('Job Tracking sheet not found. Run Setup Job Tracking Sheet first.');
    return;
  }

  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];

  // Check if already exists
  for (var i = 0; i < headers.length; i++) {
    if (String(headers[i]).trim() === 'Job Name') {
      SpreadsheetApp.getUi().alert('✅ Job Name column already exists at column ' + String.fromCharCode(65 + i) + '.');
      return;
    }
  }

  // Add at the end
  var newCol = sheet.getLastColumn() + 1;
  sheet.getRange(1, newCol).setValue('Job Name');
  sheet.getRange(1, newCol).setFontWeight('bold').setBackground('#1565c0').setFontColor('white');
  sheet.setColumnWidth(newCol, 200);

  SpreadsheetApp.getUi().alert('✅ Added "Job Name" column at column ' + String.fromCharCode(64 + newCol) + '.\n\n' +
    'Job Names will be filled automatically during the next Crew Import.');
  Logger.log('migrateJobTrackingAddJobName: Added Job Name column at column ' + newCol);
}

/**
 * Backfills empty "Job Name" values in Job Tracking using reverse location mapping.
 * Uses the primary dock/site name for each city (e.g., Bozeman → "Belgrade Dock").
 * Shows results and lets user know which were filled.
 *
 * Menu: Glove Manager → 📥 Import Crew Makeup → 🔧 Utilities → 📝 Backfill Job Names
 */
function backfillJobNames() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var ui = SpreadsheetApp.getUi();
  var sheet = ss.getSheetByName('Job Tracking');

  if (!sheet) {
    ui.alert('❌ Job Tracking sheet not found.\n\nRun "Setup Job Tracking Sheet" first.');
    return;
  }

  // Find Job Name column
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var jobNameCol = -1;
  var locationCol = -1;
  var statusCol = -1;

  for (var h = 0; h < headers.length; h++) {
    var hdr = String(headers[h]).trim();
    if (hdr === 'Job Name') jobNameCol = h;
    if (hdr === 'Location') locationCol = h;
    if (hdr === 'Status') statusCol = h;
  }

  if (jobNameCol === -1) {
    ui.alert('❌ Job Name column not found.\n\nRun "Add Job Name Column" first.');
    return;
  }

  if (locationCol === -1) {
    ui.alert('❌ Location column not found in Job Tracking.');
    return;
  }

  // Reverse location mapping: City → primary Excel header/dock name
  // This is the inverse of the mapping in CrewImport.html
  var reverseLocationMap = {
    'Bozeman': 'Belgrade Dock',
    'Big Sky': 'Big Sky Dock',
    'Helena': 'Helena Trans Dock',
    'Great Falls': 'Great Falls Dock',
    'Butte': 'Butte Dock',
    'Livingston': 'Livingston Dock',
    'Ennis': 'Ennis Dock',
    'Stanford': 'Stanford Trans Dock',
    'South Dakota': 'South Dakota Dock',
    'Lolo': 'Lolo Sub Dock',
    'Missoula': 'Missoula',
    'Elliston': 'Elliston Distro Poles',
    'Rapelje': 'Alkali/Rapelje Trans',
    'Manhattan': 'Manhattan Sub',
    'Anaconda': 'Anaconda City Sub Dock',
    'Three Forks': 'Three Rivers Sub Dock',
    'Bonner': 'Rattlesnake Sub Dock',
    'Northern Lights': 'Northern Lights Dock',
    'California': 'CA Sub Foundation',
    'Gold Creek': 'Gold Creek Trans Dock',
    'Texas': 'Texas Dock',
    'Kalispell': 'Kalispell',
    'Billings': 'Billings',
    'Miles City': 'Miles City',
    'Sidney': 'Sidney',
    'Glendive': 'Glendive'
  };

  // Also check for user-saved custom mappings (reverse them)
  try {
    var customMappings = getCrewImportLocationMappings();
    for (var excelName in customMappings) {
      var city = customMappings[excelName];
      // Only add if we don't already have a reverse mapping for this city
      if (!reverseLocationMap[city]) {
        reverseLocationMap[city] = excelName;
      }
    }
  } catch (e) {
    Logger.log('backfillJobNames: Could not load custom mappings: ' + e.message);
  }

  var data = sheet.getDataRange().getValues();
  var filledCount = 0;
  var skippedCount = 0;
  var alreadyHasCount = 0;
  var noMappingJobs = [];

  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var jobNumber = String(row[0] || '').trim();
    var location = String(row[locationCol] || '').trim();
    var currentJobName = String(row[jobNameCol] || '').trim();
    var status = statusCol !== -1 ? String(row[statusCol] || '').trim() : '';

    if (!jobNumber) continue;

    // Skip completed jobs
    if (status === 'Completed') {
      skippedCount++;
      continue;
    }

    // Already has a Job Name
    if (currentJobName) {
      alreadyHasCount++;
      continue;
    }

    // Try reverse mapping
    var suggestedName = reverseLocationMap[location] || '';

    if (suggestedName) {
      // Write the job name
      sheet.getRange(i + 1, jobNameCol + 1).setValue(suggestedName);
      filledCount++;
      Logger.log('backfillJobNames: ' + jobNumber + ' (' + location + ') → "' + suggestedName + '"');
    } else if (location && location !== 'Unknown') {
      // No mapping found - use location as fallback
      sheet.getRange(i + 1, jobNameCol + 1).setValue(location);
      filledCount++;
      noMappingJobs.push(jobNumber + ' (' + location + ')');
      Logger.log('backfillJobNames: ' + jobNumber + ' - no mapping, using location "' + location + '"');
    } else {
      noMappingJobs.push(jobNumber + ' (Unknown location)');
    }
  }

  // Build result message
  var msg = '📝 Job Name Backfill Complete!\n\n';
  msg += '✅ Filled: ' + filledCount + ' job(s)\n';
  msg += '⏭️ Already had names: ' + alreadyHasCount + '\n';
  msg += '⏭️ Completed (skipped): ' + skippedCount;

  if (noMappingJobs.length > 0) {
    msg += '\n\n⚠️ Used location as fallback for:\n';
    for (var n = 0; n < noMappingJobs.length; n++) {
      msg += '  • ' + noMappingJobs[n] + '\n';
    }
    msg += '\nYou can edit these directly in the Job Name column.';
  }

  msg += '\n\nTip: Future Crew Imports will automatically fill Job Names from the Excel header.';

  ui.alert('Job Name Backfill', msg, ui.ButtonSet.OK);
  Logger.log('backfillJobNames: Done - filled ' + filledCount + ', already had ' + alreadyHasCount + ', skipped ' + skippedCount);
}

/**
 * Backfills Job Names for existing jobs during Crew Import.
 * Called from syncJobTrackingAfterImport after employee data is synced.
 * Uses the parsedCrews data (originalLocation) from the Excel file.
 *
 * @param {Sheet} jobSheet - Job Tracking sheet
 * @param {Object} crewJobNameMap - Map of job number → Excel header name (originalLocation)
 */
function backfillJobNamesFromImport(jobSheet, crewJobNameMap) {
  if (!jobSheet || !crewJobNameMap) return 0;

  var headers = jobSheet.getRange(1, 1, 1, jobSheet.getLastColumn()).getValues()[0];
  var jobNameCol = -1;
  for (var h = 0; h < headers.length; h++) {
    if (String(headers[h]).trim() === 'Job Name') { jobNameCol = h + 1; break; }
  }

  if (jobNameCol === -1) {
    Logger.log('backfillJobNamesFromImport: Job Name column not found, skipping');
    return 0;
  }

  var data = jobSheet.getDataRange().getValues();
  var filledCount = 0;
  var dataModified = false;

  for (var i = 1; i < data.length; i++) {
    var jobNumber = String(data[i][0] || '').trim();
    var currentJobName = String(data[i][jobNameCol - 1] || '').trim();

    // Only backfill if currently empty and we have a name from the import
    if (jobNumber && !currentJobName && crewJobNameMap[jobNumber]) {
      data[i][jobNameCol - 1] = crewJobNameMap[jobNumber];
      dataModified = true;
      filledCount++;
      Logger.log('backfillJobNamesFromImport: ' + jobNumber + ' → "' + crewJobNameMap[jobNumber] + '"');
    }
  }

  // BATCH WRITE: Write entire Job Name column at once
  if (dataModified) {
    var jobNameValues = data.map(function(row) { return [row[jobNameCol - 1]]; });
    jobSheet.getRange(1, jobNameCol, data.length, 1).setValues(jobNameValues);
    Logger.log('backfillJobNamesFromImport: Batch wrote Job Name column');
  }

  Logger.log('backfillJobNamesFromImport: Filled ' + filledCount + ' Job Name(s)');
  return filledCount;
}

/**
 * Batch searches Employee History for multiple names at once.
 * Used by Crew Import to check if NEW HIRE employees are rehires.
 * Single sheet read for efficiency.
 *
 * @param {string} namesJson - JSON array of employee names to search for
 * @return {Object} Map of name -> history data (or null if not found)
 */
function searchEmployeeHistoryBatch(namesJson) {
  var names = JSON.parse(namesJson);
  Logger.log('searchEmployeeHistoryBatch: Searching for ' + names.length + ' names');

  var result = {};
  for (var n = 0; n < names.length; n++) {
    result[names[n]] = null;
  }

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var historySheet = ss.getSheetByName('Employee History');
  var employeesSheet = ss.getSheetByName('Employees');

  if (!historySheet || historySheet.getLastRow() <= 2) {
    Logger.log('searchEmployeeHistoryBatch: No Employee History data');
    return result;
  }

  // Build set of current employees to check for Previous Employee status
  var currentEmployeeLocations = {};
  if (employeesSheet && employeesSheet.getLastRow() > 1) {
    var empData = employeesSheet.getDataRange().getValues();
    for (var e = 1; e < empData.length; e++) {
      var empName = String(empData[e][0] || '').toLowerCase().trim();
      var empLocation = String(empData[e][2] || '').toLowerCase().trim();
      if (empName) currentEmployeeLocations[empName] = empLocation;
    }
  }

  // Build search lookup (lowercase)
  var searchNames = {};
  for (var i = 0; i < names.length; i++) {
    searchNames[names[i].toLowerCase().trim()] = names[i];
  }

  // Read all history data in one call
  var historyData = historySheet.getRange(3, 1, historySheet.getLastRow() - 2, 14).getValues();

  // History columns: Date, Employee, EventType, Location, JobNumber, HireDate, LastDay, LastDayReason, RehireDate, Notes, Phone, Email, GloveSize, SleeveSize
  var employeeMap = {};

  for (var h = 0; h < historyData.length; h++) {
    var row = historyData[h];
    var histName = String(row[1] || '').trim();
    var histNameLower = histName.toLowerCase();

    // Only process names we're looking for
    if (!searchNames[histNameLower]) continue;

    if (!employeeMap[histNameLower]) {
      employeeMap[histNameLower] = {
        name: histName,
        location: '',
        jobNumber: '',
        phone: '',
        email: '',
        gloveSize: '',
        sleeveSize: '',
        hireDate: '',
        historyEntries: 0,
        isPreviousEmployee: currentEmployeeLocations[histNameLower] === 'previous employee'
      };
    }

    var emp = employeeMap[histNameLower];
    emp.historyEntries++;

    // Keep most recent non-empty values
    var location = String(row[3] || '').trim();
    var jobNumber = String(row[4] || '').trim();
    var hireDate = row[5];
    var phone = String(row[10] || '').trim();
    var email = String(row[11] || '').trim();
    var gloveSize = String(row[12] || '').trim();
    var sleeveSize = String(row[13] || '').trim();

    if (location) emp.location = location;
    if (jobNumber) emp.jobNumber = jobNumber;
    if (phone) emp.phone = phone;
    if (email) emp.email = email;
    if (gloveSize) emp.gloveSize = gloveSize;
    if (sleeveSize) emp.sleeveSize = sleeveSize;
    if (hireDate) {
      emp.hireDate = (hireDate instanceof Date)
        ? Utilities.formatDate(hireDate, ss.getSpreadsheetTimeZone(), 'MM/dd/yyyy')
        : String(hireDate);
    }
  }

  // Map results back to original names
  for (var key in employeeMap) {
    var originalName = searchNames[key];
    if (originalName) {
      result[originalName] = employeeMap[key];
    }
  }

  Logger.log('searchEmployeeHistoryBatch: Found ' + Object.keys(employeeMap).length + ' matches out of ' + names.length + ' names');
  return result;
}

/**
 * Adds a new employee from the Crew Import dialog.
 * Used when an employee from Excel is not found in the Employees sheet (new hire).
 *
 * @param {Object} employeeData - Object with name, location, jobNumber, classification
 * @return {Object} Result with success status, message, and row info
 */
function addNewEmployeeFromImport(employeeData) {
  Logger.log('=== addNewEmployeeFromImport START ===');
  Logger.log('Adding new employee: ' + JSON.stringify(employeeData));

  // Safety: Clean the name in case client-side parsing missed something
  // Strip "NEW HIRE", "ST #" (start date), "TEMP", etc. from the name
  if (employeeData.name) {
    var cleanedName = employeeData.name
      .replace(/\s+(NEW\s*HIRE|NEWHIRE|TEMP|TEMPORARY|CONTRACTOR|TRAINEE)\s*/gi, ' ')
      .replace(/\s+ST\s*\d+\s*/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (cleanedName !== employeeData.name) {
      Logger.log('Cleaned employee name: "' + employeeData.name + '" → "' + cleanedName + '"');
      employeeData.name = cleanedName;
    }
  }

  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var employeesSheet = ss.getSheetByName(SHEET_EMPLOYEES);

    if (!employeesSheet) {
      return { success: false, message: 'Employees sheet not found' };
    }

    var data = employeesSheet.getDataRange().getValues();
    var headers = data[0];

    // Find all column indices - match headers case-insensitively
    var colIndices = {
      name: 0,
      location: -1,
      jobNumber: -1,
      jobClassification: -1,
      hireDate: -1,
      phoneNumber: -1,
      emailAddress: -1,
      mpEmail: -1,
      notificationEmails: -1,
      gloveSize: -1,
      sleeveSize: -1
    };

    for (var h = 0; h < headers.length; h++) {
      var header = String(headers[h]).toLowerCase().trim();
      if (header === 'location') colIndices.location = h;
      if (header === 'job number') colIndices.jobNumber = h;
      if (header === 'job classification') colIndices.jobClassification = h;
      if (header === 'hire date') colIndices.hireDate = h;
      // Match various phone column header formats
      if (header === 'phone number' || header === 'phone' || header === 'phone #' || header === 'cell' || header === 'cell phone') colIndices.phoneNumber = h;
      if (header === 'email address' || header === 'email') colIndices.emailAddress = h;
      if (header === 'mp email') colIndices.mpEmail = h;
      if (header === 'notification emails' || header === 'notification email') colIndices.notificationEmails = h;
      if (header === 'glove size') colIndices.gloveSize = h;
      if (header === 'sleeve size') colIndices.sleeveSize = h;
    }

    // Use COLS constants as fallback if headers don't match
    // COLS.EMPLOYEES.LOCATION = 3 (column C, 0-based index 2)
    // COLS.EMPLOYEES.JOB_NUMBER = 4 (column D, 0-based index 3)
    // COLS.EMPLOYEES.PHONE = 5 (column E, 0-based index 4)
    if (colIndices.location === -1) colIndices.location = 2;
    if (colIndices.jobNumber === -1) colIndices.jobNumber = 3;
    if (colIndices.phoneNumber === -1) colIndices.phoneNumber = 4;

    // Check for duplicate name
    var nameLower = employeeData.name.toLowerCase().trim();
    for (var i = 1; i < data.length; i++) {
      if (String(data[i][colIndices.name]).toLowerCase().trim() === nameLower) {
        return { success: false, message: 'An employee with this name already exists' };
      }
    }

    // Create new row with employee data
    var newRow = new Array(headers.length).fill('');
    newRow[colIndices.name] = employeeData.name;
    newRow[colIndices.location] = employeeData.location;
    newRow[colIndices.jobNumber] = employeeData.jobNumber;

    // Set optional fields if columns exist and data provided
    if (colIndices.jobClassification !== -1 && employeeData.classification) {
      newRow[colIndices.jobClassification] = employeeData.classification;
    }
    if (colIndices.hireDate !== -1 && employeeData.hireDate) {
      // Convert YYYY-MM-DD to MM/DD/YYYY format (date only, no time)
      var hireDateParts = employeeData.hireDate.split('-');
      if (hireDateParts.length === 3) {
        // Format as MM/DD/YYYY string to avoid time component
        newRow[colIndices.hireDate] = hireDateParts[1] + '/' + hireDateParts[2] + '/' + hireDateParts[0];
      }
    }
    if (colIndices.phoneNumber !== -1 && employeeData.phoneNumber) {
      newRow[colIndices.phoneNumber] = employeeData.phoneNumber;
    }
    if (colIndices.emailAddress !== -1 && employeeData.emailAddress) {
      newRow[colIndices.emailAddress] = employeeData.emailAddress;
    }
    if (colIndices.mpEmail !== -1 && employeeData.mpEmail) {
      newRow[colIndices.mpEmail] = employeeData.mpEmail;
    }
    if (colIndices.notificationEmails !== -1 && employeeData.notificationEmails) {
      newRow[colIndices.notificationEmails] = employeeData.notificationEmails;
    }
    if (colIndices.gloveSize !== -1 && employeeData.gloveSize) {
      newRow[colIndices.gloveSize] = employeeData.gloveSize;
    }
    if (colIndices.sleeveSize !== -1 && employeeData.sleeveSize) {
      newRow[colIndices.sleeveSize] = employeeData.sleeveSize;
    }

    // Add to sheet
    employeesSheet.appendRow(newRow);
    var newRowIndex = employeesSheet.getLastRow();

    // Log to Employee History
    var historySheet = ss.getSheetByName('Employee History');
    if (historySheet) {
      var timezone = ss.getSpreadsheetTimeZone();
      var todayStr = Utilities.formatDate(new Date(), timezone, 'MM/dd/yyyy');

      var notes = 'New Employee from Crew Makeup Import. ';
      notes += 'Location: ' + employeeData.location + '. ';
      notes += 'Job #: ' + employeeData.jobNumber + '.';
      if (employeeData.classification) {
        notes += ' Classification: ' + employeeData.classification + '.';
      }
      if (employeeData.gloveSize) {
        notes += ' Glove: ' + employeeData.gloveSize + '.';
      }
      if (employeeData.sleeveSize) {
        notes += ' Sleeve: ' + employeeData.sleeveSize + '.';
      }

      var historyRow = [
        todayStr,                         // Date
        employeeData.name,                // Employee Name
        'NEW_EMPLOYEE_IMPORT',            // Event Type
        employeeData.location,            // Location
        employeeData.jobNumber,           // Job Number
        employeeData.hireDate || todayStr, // Hire Date
        '',                               // Last Day
        '',                               // Last Day Reason
        '',                               // Rehire Date
        notes,                            // Notes
        employeeData.phoneNumber || '',   // Phone Number
        employeeData.emailAddress || '',  // Email Address
        employeeData.gloveSize || '',     // Glove Size
        employeeData.sleeveSize || ''     // Sleeve Size
      ];

      historySheet.appendRow(historyRow);
    }

    Logger.log('Added new employee: ' + employeeData.name + ' at row ' + newRowIndex);
    logEvent('New Employee Import: Added ' + employeeData.name + ' from Crew Makeup Import');

    return {
      success: true,
      message: 'Employee added successfully',
      employeeName: employeeData.name,
      rowIndex: newRowIndex
    };

  } catch (error) {
    Logger.log('Error adding new employee: ' + error.toString());
    return { success: false, message: 'Error: ' + error.toString() };
  }
}

/**
 * Rehires a previous employee from the Crew Import dialog.
 * Creates a new row on the Employees sheet and logs "Rehired" to Employee History.
 *
 * @param {Object} employeeData - Object with all employee fields
 * @param {string} employeeData.name - Employee name
 * @param {string} employeeData.location - Work location
 * @param {string} employeeData.jobNumber - Job number (e.g., 013-26.1)
 * @param {string} employeeData.classification - Job classification (F, JRY, AP 1, etc.)
 * @param {string} employeeData.hireDate - Rehire date (becomes Hire Date on Employees sheet)
 * @param {string} employeeData.phoneNumber - Optional phone
 * @param {string} employeeData.emailAddress - Optional email
 * @param {string} employeeData.mpEmail - Optional MP email
 * @param {string} employeeData.notificationEmails - Optional notification emails
 * @param {string} employeeData.gloveSize - Optional glove size
 * @param {string} employeeData.sleeveSize - Optional sleeve size
 * @return {Object} Result with success status, message, and row info
 */
function rehireEmployeeFromImport(employeeData) {
  Logger.log('=== rehireEmployeeFromImport START ===');
  Logger.log('Rehiring employee: ' + JSON.stringify(employeeData));

  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var employeesSheet = ss.getSheetByName(SHEET_EMPLOYEES);

    if (!employeesSheet) {
      return { success: false, message: 'Employees sheet not found' };
    }

    var data = employeesSheet.getDataRange().getValues();
    var headers = data[0];

    // Find all column indices
    var colIndices = {
      name: 0,
      location: -1,
      jobNumber: -1,
      jobClassification: -1,
      hireDate: -1,
      phoneNumber: -1,
      emailAddress: -1,
      mpEmail: -1,
      notificationEmails: -1,
      gloveSize: -1,
      sleeveSize: -1
    };

    for (var h = 0; h < headers.length; h++) {
      var header = String(headers[h]).toLowerCase().trim();
      if (header === 'location') colIndices.location = h;
      if (header === 'job number') colIndices.jobNumber = h;
      if (header === 'job classification') colIndices.jobClassification = h;
      if (header === 'hire date') colIndices.hireDate = h;
      // Match various phone column header formats
      if (header === 'phone number' || header === 'phone' || header === 'phone #' || header === 'cell' || header === 'cell phone') colIndices.phoneNumber = h;
      if (header === 'email address' || header === 'email') colIndices.emailAddress = h;
      if (header === 'mp email') colIndices.mpEmail = h;
      if (header === 'notification emails' || header === 'notification email') colIndices.notificationEmails = h;
      if (header === 'glove size') colIndices.gloveSize = h;
      if (header === 'sleeve size') colIndices.sleeveSize = h;
    }

    // Use COLS constants as fallback if headers don't match
    // COLS.EMPLOYEES.LOCATION = 3 (column C, 0-based index 2)
    // COLS.EMPLOYEES.JOB_NUMBER = 4 (column D, 0-based index 3)
    // COLS.EMPLOYEES.PHONE = 5 (column E, 0-based index 4)
    if (colIndices.location === -1) colIndices.location = 2;
    if (colIndices.jobNumber === -1) colIndices.jobNumber = 3;
    if (colIndices.phoneNumber === -1) colIndices.phoneNumber = 4;

    // Check if employee already exists on Employees sheet (should NOT for a rehire)
    var nameLower = employeeData.name.toLowerCase().trim();
    for (var i = 1; i < data.length; i++) {
      var existingName = String(data[i][colIndices.name]).toLowerCase().trim();
      var existingLocation = String(data[i][colIndices.location] || '').toLowerCase().trim();

      if (existingName === nameLower && existingLocation !== 'previous employee') {
        return { success: false, message: 'An active employee with this name already exists' };
      }
    }

    // Create new row with employee data
    var newRow = new Array(headers.length).fill('');
    newRow[colIndices.name] = employeeData.name;
    newRow[colIndices.location] = employeeData.location;
    newRow[colIndices.jobNumber] = employeeData.jobNumber;

    // Set optional fields
    if (colIndices.jobClassification !== -1 && employeeData.classification) {
      newRow[colIndices.jobClassification] = employeeData.classification;
    }
    if (colIndices.hireDate !== -1 && employeeData.hireDate) {
      // Convert YYYY-MM-DD to MM/DD/YYYY format
      var hireDateParts = employeeData.hireDate.split('-');
      if (hireDateParts.length === 3) {
        newRow[colIndices.hireDate] = hireDateParts[1] + '/' + hireDateParts[2] + '/' + hireDateParts[0];
      }
    }
    if (colIndices.phoneNumber !== -1 && employeeData.phoneNumber) {
      newRow[colIndices.phoneNumber] = employeeData.phoneNumber;
    }
    if (colIndices.emailAddress !== -1 && employeeData.emailAddress) {
      newRow[colIndices.emailAddress] = employeeData.emailAddress;
    }
    if (colIndices.mpEmail !== -1 && employeeData.mpEmail) {
      newRow[colIndices.mpEmail] = employeeData.mpEmail;
    }
    if (colIndices.notificationEmails !== -1 && employeeData.notificationEmails) {
      newRow[colIndices.notificationEmails] = employeeData.notificationEmails;
    }
    if (colIndices.gloveSize !== -1 && employeeData.gloveSize) {
      newRow[colIndices.gloveSize] = employeeData.gloveSize;
    }
    if (colIndices.sleeveSize !== -1 && employeeData.sleeveSize) {
      newRow[colIndices.sleeveSize] = employeeData.sleeveSize;
    }

    // Add to Employees sheet
    employeesSheet.appendRow(newRow);
    var newRowIndex = employeesSheet.getLastRow();

    // Log to Employee History with "Rehired" event type and Rehire Date
    var historySheet = ss.getSheetByName('Employee History');
    if (historySheet) {
      var timezone = ss.getSpreadsheetTimeZone();
      var todayStr = Utilities.formatDate(new Date(), timezone, 'MM/dd/yyyy');

      // Format rehire date for display
      var rehireDateStr = todayStr;
      if (employeeData.hireDate) {
        var parts = employeeData.hireDate.split('-');
        if (parts.length === 3) {
          rehireDateStr = parts[1] + '/' + parts[2] + '/' + parts[0];
        }
      }

      var notes = 'Rehired from Crew Makeup Import. ';
      notes += 'Location: ' + employeeData.location + '. ';
      notes += 'Job #: ' + employeeData.jobNumber + '.';
      if (employeeData.classification) {
        notes += ' Classification: ' + employeeData.classification + '.';
      }

      var historyRow = [
        todayStr,                         // Date (event date)
        employeeData.name,                // Employee Name
        'Rehired',                        // Event Type
        employeeData.location,            // Location
        employeeData.jobNumber,           // Job Number
        '',                               // Hire Date (original hire date - preserved from history)
        '',                               // Last Day
        '',                               // Last Day Reason
        rehireDateStr,                    // Rehire Date (NEW!)
        notes,                            // Notes
        employeeData.phoneNumber || '',   // Phone Number
        employeeData.emailAddress || '',  // Email Address
        employeeData.gloveSize || '',     // Glove Size
        employeeData.sleeveSize || ''     // Sleeve Size
      ];

      historySheet.appendRow(historyRow);
    }

    Logger.log('Rehired employee: ' + employeeData.name + ' at row ' + newRowIndex);
    logEvent('Employee Rehired: ' + employeeData.name + ' from Crew Makeup Import');

    return {
      success: true,
      message: 'Employee rehired successfully',
      employeeName: employeeData.name,
      rowIndex: newRowIndex
    };

  } catch (error) {
    Logger.log('Error rehiring employee: ' + error.toString());
    return { success: false, message: 'Error: ' + error.toString() };
  }
}

/**
 * Marks an employee as Previous Employee (for Resigned, Quit, Layoff)
 * Sets Location to "Previous Employee", clears Job Number, logs to Employee History
 *
 * @param {Object} data - Object with name, status, date, notes, company
 * @return {Object} Result with success status and message
 */
function markEmployeeAsPrevious(data) {
  Logger.log('=== markEmployeeAsPrevious START ===');
  Logger.log('Data: ' + JSON.stringify(data));

  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var employeesSheet = ss.getSheetByName(SHEET_EMPLOYEES);

    if (!employeesSheet) {
      return { success: false, message: 'Employees sheet not found' };
    }

    var sheetData = employeesSheet.getDataRange().getValues();
    var headers = sheetData[0];

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
      return { success: false, message: 'Could not find required columns in Employees sheet' };
    }

    // Find the employee by name
    var nameLower = data.name.toLowerCase().trim();
    var rowIndex = -1;
    var oldLocation = '';
    var oldJobNum = '';

    for (var i = 1; i < sheetData.length; i++) {
      if (String(sheetData[i][nameCol]).toLowerCase().trim() === nameLower) {
        rowIndex = i + 1;
        oldLocation = String(sheetData[i][locationCol] || '');
        oldJobNum = String(sheetData[i][jobNumCol] || '');
        break;
      }
    }

    if (rowIndex === -1) {
      return { success: false, message: 'Employee "' + data.name + '" not found on Employees sheet' };
    }

    // Update the employee
    employeesSheet.getRange(rowIndex, locationCol + 1).setValue('Previous Employee');
    employeesSheet.getRange(rowIndex, jobNumCol + 1).setValue('');

    // Log to Employee History
    var historySheet = ss.getSheetByName('Employee History');
    if (historySheet) {
      var timezone = ss.getSpreadsheetTimeZone();
      var todayStr = Utilities.formatDate(new Date(), timezone, 'MM/dd/yyyy');

      // Determine event type based on status
      var eventType = 'SEPARATED';
      if (data.status === 'Resigned') eventType = 'RESIGNED';
      else if (data.status === 'Quit') eventType = 'QUIT';
      else if (data.status === 'Fired') eventType = 'FIRED';
      else if (data.status === 'Layoff') eventType = 'LAYOFF';

      var notes = 'Crew Makeup Import: ' + data.status;
      if (data.company) notes += ' from ' + data.company;
      if (data.date) notes += ' on ' + data.date;
      if (data.notes) notes += '. ' + data.notes;
      notes += '. Previous Location: ' + oldLocation + ', Job #: ' + oldJobNum;

      var historyRow = [
        todayStr,                         // Date
        data.name,                        // Employee Name
        eventType,                        // Event Type
        'Previous Employee',              // Location
        '',                               // Job Number
        '',                               // Hire Date
        data.date || todayStr,            // Last Day
        data.status,                      // Last Day Reason
        '',                               // Rehire Date
        notes,                            // Notes
        '',                               // Phone Number
        '',                               // Email Address
        '',                               // Glove Size
        ''                                // Sleeve Size
      ];

      historySheet.appendRow(historyRow);
    }

    // Delete employee from Employees sheet
    Utilities.sleep(500);
    employeesSheet.deleteRow(rowIndex);

    Logger.log('Marked ' + data.name + ' as Previous Employee and deleted from sheet');
    logEvent('Crew Import: Marked ' + data.name + ' as Previous Employee (' + data.status + ')');

    return { success: true, message: 'Employee marked as Previous Employee and removed from sheet' };

  } catch (error) {
    Logger.log('Error marking employee as previous: ' + error.toString());
    return { success: false, message: 'Error: ' + error.toString() };
  }
}

/**
 * Updates employee status notes (for Light Duty, Leave, etc.)
 * Does not change location, just logs notes to Employee History
 *
 * @param {Object} data - Object with name, notes
 * @return {Object} Result with success status and message
 */
function updateEmployeeStatusNotes(data) {
  Logger.log('=== updateEmployeeStatusNotes START ===');
  Logger.log('Data: ' + JSON.stringify(data));

  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var employeesSheet = ss.getSheetByName(SHEET_EMPLOYEES);

    if (!employeesSheet) {
      return { success: false, message: 'Employees sheet not found' };
    }

    var sheetData = employeesSheet.getDataRange().getValues();
    var headers = sheetData[0];
    var nameCol = 0;

    // Find the employee by name
    var nameLower = data.name.toLowerCase().trim();
    var found = false;

    for (var i = 1; i < sheetData.length; i++) {
      if (String(sheetData[i][nameCol]).toLowerCase().trim() === nameLower) {
        found = true;
        break;
      }
    }

    if (!found) {
      return { success: false, message: 'Employee "' + data.name + '" not found on Employees sheet' };
    }

    // Log to Employee History
    var historySheet = ss.getSheetByName('Employee History');
    if (historySheet) {
      var timezone = ss.getSpreadsheetTimeZone();
      var todayStr = Utilities.formatDate(new Date(), timezone, 'MM/dd/yyyy');

      var historyRow = [
        todayStr,                         // Date
        data.name,                        // Employee Name
        'STATUS_UPDATE',                  // Event Type
        '',                               // Location (unchanged)
        '',                               // Job Number (unchanged)
        '',                               // Hire Date
        '',                               // Last Day
        '',                               // Last Day Reason
        '',                               // Rehire Date
        'Crew Makeup Import: ' + data.notes,  // Notes
        '',                               // Phone Number
        '',                               // Email Address
        '',                               // Glove Size
        ''                                // Sleeve Size
      ];

      historySheet.appendRow(historyRow);
    }

    Logger.log('Updated status notes for ' + data.name);
    logEvent('Crew Import: Updated status notes for ' + data.name + ' - ' + data.notes);

    return { success: true, message: 'Status notes updated' };

  } catch (error) {
    Logger.log('Error updating status notes: ' + error.toString());
    return { success: false, message: 'Error: ' + error.toString() };
  }
}

/**
 * Applies a special circumstance update with user-editable fields.
 * Handles Vacation, Previous Employee, Light Duty, Leave, Layoff, Resigned, Quit
 *
 * @param {Object} data - Object with name, newLocation, classification, status, date, jobNumber, clearJobNumber, notes, company
 * @return {Object} Result with success status and message
 */
function applySpecialCircumstanceUpdate(data) {
  Logger.log('=== applySpecialCircumstanceUpdate START ===');
  Logger.log('Data: ' + JSON.stringify(data));

  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var employeesSheet = ss.getSheetByName(SHEET_EMPLOYEES);

    if (!employeesSheet) {
      return { success: false, message: 'Employees sheet not found' };
    }

    var sheetData = employeesSheet.getDataRange().getValues();
    var headers = sheetData[0];

    // Find column indices
    var nameCol = 0;
    var locationCol = -1;
    var jobNumCol = -1;
    var jobClassificationCol = -1;
    var lastDayCol = -1;
    var lastDayReasonCol = -1;

    for (var h = 0; h < headers.length; h++) {
      var header = String(headers[h]).toLowerCase().trim();
      if (header === 'location') locationCol = h;
      if (header === 'job number') jobNumCol = h;
      if (header === 'job classification') jobClassificationCol = h;
      if (header === 'last day') lastDayCol = h;
      if (header === 'last day reason') lastDayReasonCol = h;
    }

    if (locationCol === -1 || jobNumCol === -1) {
      return { success: false, message: 'Could not find required columns in Employees sheet' };
    }

    // Default job classification column if not found
    if (jobClassificationCol === -1) {
      jobClassificationCol = 13; // Column N
    }

    // Find the employee by name (with fuzzy matching support)
    var nameLower = data.name.toLowerCase().trim();
    var rowIndex = -1;
    var oldLocation = '';
    var oldJobNum = '';
    var oldClassification = '';
    var actualEmployeeName = data.name; // Will be updated if fuzzy match is used

    // First pass: exact match
    for (var i = 1; i < sheetData.length; i++) {
      var sheetNameLower = String(sheetData[i][nameCol]).toLowerCase().trim();
      if (sheetNameLower === nameLower) {
        rowIndex = i + 1;
        oldLocation = String(sheetData[i][locationCol] || '');
        oldJobNum = String(sheetData[i][jobNumCol] || '');
        oldClassification = String(sheetData[i][jobClassificationCol] || '');
        actualEmployeeName = String(sheetData[i][nameCol]);
        break;
      }
    }

    // Second pass: fuzzy match if exact match failed
    if (rowIndex === -1) {
      var nameParts = nameLower.split(/\s+/);
      var searchFirst = nameParts[0] || '';
      var searchLast = nameParts.length > 1 ? nameParts[nameParts.length - 1] : '';
      var bestMatch = { rowIndex: -1, score: 0, name: '' };

      for (var i = 1; i < sheetData.length; i++) {
        var sheetName = String(sheetData[i][nameCol] || '');
        var sheetNameLower = sheetName.toLowerCase().trim();
        var sheetParts = sheetNameLower.split(/\s+/);
        var sheetFirst = sheetParts[0] || '';
        var sheetLast = sheetParts.length > 1 ? sheetParts[sheetParts.length - 1] : '';

        // Check for nickname/abbreviation matches (Nick/Nicholas, Matt/Matthew, etc.)
        var firstNameMatches = sheetFirst === searchFirst ||
          (searchFirst === 'nick' && sheetFirst === 'nicholas') ||
          (searchFirst === 'nicholas' && sheetFirst === 'nick') ||
          (searchFirst === 'matt' && sheetFirst === 'matthew') ||
          (searchFirst === 'matthew' && sheetFirst === 'matt') ||
          (searchFirst === 'jim' && sheetFirst === 'james') ||
          (searchFirst === 'james' && sheetFirst === 'jim') ||
          (searchFirst === 'jimmy' && sheetFirst === 'james') ||
          (searchFirst === 'james' && sheetFirst === 'jimmy') ||
          (searchFirst === 'bob' && sheetFirst === 'robert') ||
          (searchFirst === 'robert' && sheetFirst === 'bob') ||
          (searchFirst === 'mike' && sheetFirst === 'michael') ||
          (searchFirst === 'michael' && sheetFirst === 'mike') ||
          (searchFirst === 'chris' && sheetFirst === 'christopher') ||
          (searchFirst === 'christopher' && sheetFirst === 'chris') ||
          sheetFirst.indexOf(searchFirst) === 0 ||  // Sheet name starts with search name
          searchFirst.indexOf(sheetFirst) === 0;    // Search name starts with sheet name

        var lastNameMatches = sheetLast === searchLast;

        // Calculate match score
        var score = 0;
        if (firstNameMatches) score += 40;
        if (lastNameMatches) score += 60;

        // If first and last name both match (with nickname support), this is a strong match
        if (score > bestMatch.score && score >= 80) {
          bestMatch.rowIndex = i + 1;
          bestMatch.score = score;
          bestMatch.name = sheetName;
          bestMatch.data = sheetData[i];
        }
      }

      if (bestMatch.rowIndex !== -1) {
        rowIndex = bestMatch.rowIndex;
        oldLocation = String(bestMatch.data[locationCol] || '');
        oldJobNum = String(bestMatch.data[jobNumCol] || '');
        oldClassification = String(bestMatch.data[jobClassificationCol] || '');
        actualEmployeeName = bestMatch.name;
        Logger.log('Fuzzy matched "' + data.name + '" to "' + actualEmployeeName + '" (score: ' + bestMatch.score + ')');
      }
    }

    if (rowIndex === -1) {
      return { success: false, message: 'Employee "' + data.name + '" not found on Employees sheet' };
    }

    // Get timezone for date formatting
    var timezone = ss.getSpreadsheetTimeZone();
    var todayStr = Utilities.formatDate(new Date(), timezone, 'MM/dd/yyyy');

    // Apply updates
    var locationChanged = false;
    var jobChanged = false;
    var classificationChanged = false;
    var newJobNumber = data.jobNumber || '';

    // Special handling for Light Duty - auto-assign job number 005-26.#
    // Uses LockService internally to prevent duplicate numbers from parallel calls
    // Light Duty is a STATUS, not a location — actual location is Helena
    var isLightDutyAssignment = (data.newLocation === 'Light Duty' || data.status === 'Light Duty');
    if (isLightDutyAssignment && !data.clearJobNumber && !data.jobNumber) {
      newJobNumber = getNextLightDutyJobNumber(sheetData, jobNumCol, employeesSheet, rowIndex);
      Logger.log('Auto-assigned Light Duty job number: ' + newJobNumber);
    }

    // Light Duty employees are physically in Helena — change location to real city
    if (data.newLocation === 'Light Duty') {
      data.newLocation = 'Helena';
      Logger.log('Light Duty → Helena (Light Duty is a status, not a location)');
    }

    // Update Location if specified
    if (data.newLocation) {
      // Ensure the location value is in the data validation list before writing
      // (applyCrewChanges handles this for crew changes, but special circumstances
      // may set status-type locations like Vacation, Leave, Previous Employee)
      ensureLocationsInValidation(employeesSheet, locationCol + 1, [data.newLocation]);

      employeesSheet.getRange(rowIndex, locationCol + 1).setValue(data.newLocation);
      locationChanged = (oldLocation !== data.newLocation);
    }

    // Update Job Number - either set new value, auto-assigned value, or clear
    if (data.clearJobNumber) {
      employeesSheet.getRange(rowIndex, jobNumCol + 1).setValue('');
      jobChanged = (oldJobNum !== '');
    } else if (newJobNumber) {
      employeesSheet.getRange(rowIndex, jobNumCol + 1).setValue(newJobNumber);
      jobChanged = (oldJobNum !== newJobNumber);
    }

    // Update Classification if specified
    if (data.classification) {
      employeesSheet.getRange(rowIndex, jobClassificationCol + 1).setValue(data.classification);
      classificationChanged = (oldClassification !== data.classification);
    }

    // For Previous Employee, also set Last Day and Last Day Reason columns
    if (data.newLocation === 'Previous Employee') {
      // Format the date for display (convert from YYYY-MM-DD to MM/DD/YYYY if needed)
      var lastDayDate = data.date || todayStr;
      if (data.date && data.date.indexOf('-') !== -1 && data.date.length === 10) {
        // Convert YYYY-MM-DD to MM/DD/YYYY
        var dateParts = data.date.split('-');
        if (dateParts.length === 3) {
          lastDayDate = dateParts[1] + '/' + dateParts[2] + '/' + dateParts[0];
        }
      }

      // Set Last Day column
      if (lastDayCol !== -1) {
        employeesSheet.getRange(rowIndex, lastDayCol + 1).setValue(lastDayDate);
        Logger.log('Set Last Day to: ' + lastDayDate);
      }

      // Set Last Day Reason column
      if (lastDayReasonCol !== -1) {
        employeesSheet.getRange(rowIndex, lastDayReasonCol + 1).setValue(data.status);
        Logger.log('Set Last Day Reason to: ' + data.status);
      }
    }

    // Determine event type for history
    var eventType = 'STATUS_UPDATE';
    var statusLower = (data.status || '').toLowerCase();
    if (statusLower === 'resigned') eventType = 'RESIGNED';
    else if (statusLower === 'quit') eventType = 'QUIT';
    else if (statusLower === 'fired') eventType = 'FIRED';
    else if (statusLower === 'layoff') eventType = 'LAYOFF';
    else if (statusLower === 'vacation' || statusLower === 'time off') eventType = 'VACATION';
    else if (statusLower === 'leave' || statusLower === 'fmla') eventType = 'LEAVE';
    else if (statusLower === 'light duty') eventType = 'LIGHT_DUTY';

    // Log to Employee History
    var historySheet = ss.getSheetByName('Employee History');
    if (historySheet) {

      var notes = 'Crew Makeup Import: ' + data.status;
      if (data.company) notes += ' from ' + data.company;
      if (data.date) notes += ' on ' + data.date;
      if (data.notes) notes += '. ' + data.notes;
      if (locationChanged) notes += '. Location: ' + oldLocation + ' → ' + data.newLocation;
      if (jobChanged) {
        if (data.clearJobNumber) {
          notes += '. Job # cleared (was: ' + oldJobNum + ')';
        } else {
          notes += '. Job #: ' + oldJobNum + ' → ' + newJobNumber;
        }
      }
      if (classificationChanged) notes += '. Classification: ' + oldClassification + ' → ' + data.classification;

      // Determine Last Day value
      var lastDay = '';
      var lastDayReason = '';
      if (data.newLocation === 'Previous Employee') {
        lastDay = data.date || todayStr;
        lastDayReason = data.status;
      }

      var historyRow = [
        todayStr,                         // Date
        data.name,                        // Employee Name
        eventType,                        // Event Type
        data.newLocation || oldLocation,  // Location
        data.clearJobNumber ? '' : (newJobNumber || oldJobNum),  // Job Number
        '',                               // Hire Date
        lastDay,                          // Last Day
        lastDayReason,                    // Last Day Reason
        '',                               // Rehire Date
        notes,                            // Notes
        '',                               // Phone Number
        '',                               // Email Address
        '',                               // Glove Size
        ''                                // Sleeve Size
      ];

      historySheet.appendRow(historyRow);
    }

    Logger.log('Applied special update for ' + data.name + ': ' + data.status);
    logEvent('Crew Import: Special update for ' + data.name + ' - ' + data.status +
             (locationChanged ? ', Location → ' + data.newLocation : '') +
             (jobChanged ? (data.clearJobNumber ? ', Job # cleared' : ', Job # → ' + newJobNumber) : '') +
             (classificationChanged ? ', Classification → ' + data.classification : ''));

    // Delete employee from Employees sheet if marked as Previous Employee
    if (data.newLocation === 'Previous Employee') {
      Utilities.sleep(500);
      employeesSheet.deleteRow(rowIndex);
      Logger.log('Deleted employee row ' + rowIndex + ' for ' + data.name);
    }

    return { success: true, message: 'Update applied successfully' };

  } catch (error) {
    Logger.log('Error applying special update: ' + error.toString());
    return { success: false, message: 'Error: ' + error.toString() };
  }
}

/**
 * Gets the next available Light Duty job number (005-26.#)
 * Scans existing job numbers to find the highest used position number
 *
 * @param {Array} sheetData - 2D array of employee sheet data
 * @param {number} jobNumCol - Index of the job number column
 * @return {string} Next available Light Duty job number (e.g., "005-26.3")
 */
function getNextLightDutyJobNumber(sheetData, jobNumCol, employeesSheet, rowIndex) {
  // Use LockService to prevent race condition when multiple parallel calls
  // each try to assign the next Light Duty job number simultaneously
  var lock = LockService.getScriptLock();
  lock.waitLock(30000); // Wait up to 30 seconds - throws on failure (intentional)

  try {
    var lightDutyPrefix = '005-26';
    var maxFromSheet = 0;

    // Scan sheet data for existing 005-26.# job numbers
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var freshSheet = employeesSheet || ss.getSheetByName('Employees');
    var freshData = freshSheet ? freshSheet.getDataRange().getValues() : sheetData;

    for (var i = 1; i < freshData.length; i++) {
      var jobNum = String(freshData[i][jobNumCol] || '').trim();
      if (jobNum.indexOf(lightDutyPrefix) === 0) {
        var match = jobNum.match(/005-26\.(\d+)/);
        if (match) {
          var position = parseInt(match[1], 10);
          if (position > maxFromSheet) {
            maxFromSheet = position;
          }
        }
      }
    }

    // ALSO check ScriptProperties for recently assigned numbers.
    // This handles the case where Google Sheets read cache returns stale data
    // even after a prior call did flush(). Properties are always fresh.
    var props = PropertiesService.getScriptProperties();
    var recentMax = parseInt(props.getProperty('LIGHT_DUTY_RECENT_MAX') || '0', 10);

    // Use the higher of sheet scan vs properties counter
    var maxPosition = Math.max(maxFromSheet, recentMax);
    var nextPosition = maxPosition + 1;
    var newJobNumber = lightDutyPrefix + '.' + nextPosition;

    // Save to ScriptProperties FIRST (so next caller sees it even with stale sheet cache)
    props.setProperty('LIGHT_DUTY_RECENT_MAX', String(nextPosition));

    // Also write to the sheet
    if (freshSheet && rowIndex) {
      freshSheet.getRange(rowIndex, jobNumCol + 1).setValue(newJobNumber);
      SpreadsheetApp.flush();
    }

    Logger.log('getNextLightDutyJobNumber: sheet max=' + maxFromSheet + ', props max=' + recentMax + ', assigned=' + newJobNumber);
    return newJobNumber;
  } finally {
    lock.releaseLock();
  }
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

// ============================================================================
// FISCAL YEAR MANAGEMENT FUNCTIONS
// ============================================================================

/**
 * Shows the Fiscal Year Configuration dialog.
 * Menu item: Glove Manager → Utilities → Fiscal Year Config
 */
function showFiscalYearConfig() {
  var html = HtmlService.createHtmlOutputFromFile('FiscalYearConfig')
    .setWidth(700)
    .setHeight(750);
  SpreadsheetApp.getUi().showModalDialog(html, 'Fiscal Year Configuration');
}

/**
 * Gets the current fiscal year settings from script properties.
 *
 * @return {Object} Object with currentFY and newFY values
 */
function getFiscalYearSettings() {
  var props = PropertiesService.getScriptProperties();
  return {
    currentFY: props.getProperty('fiscalYearCurrent') || '26',
    newFY: props.getProperty('fiscalYearNew') || '27'
  };
}

/**
 * Saves fiscal year settings to script properties.
 *
 * @param {string} currentFY - Current fiscal year suffix (e.g., "26")
 * @param {string} newFY - New fiscal year suffix (e.g., "27")
 */
function saveFiscalYearSettings(currentFY, newFY) {
  var props = PropertiesService.getScriptProperties();
  props.setProperty('fiscalYearCurrent', currentFY);
  props.setProperty('fiscalYearNew', newFY);
  Logger.log('Saved fiscal year settings: current=' + currentFY + ', new=' + newFY);
}

/**
 * Gets all unique crew job numbers (base numbers without position) for fiscal year transition.
 * Groups by job number and counts employees.
 *
 * @return {Array} Array of crew objects with jobNumber, location, employeeCount, willTransition
 */
function getCrewsForFiscalYearTransition() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var employeesSheet = ss.getSheetByName(SHEET_EMPLOYEES);

  if (!employeesSheet || employeesSheet.getLastRow() < 2) {
    return [];
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

  if (jobNumCol === -1) {
    Logger.log('getCrewsForFiscalYearTransition: Job Number column not found');
    return [];
  }

  // Group employees by base job number (e.g., "013-26" from "013-26.1")
  var crewMap = {};

  for (var i = 1; i < data.length; i++) {
    var jobNum = String(data[i][jobNumCol] || '').trim();
    var location = locationCol !== -1 ? String(data[i][locationCol] || '').trim() : '';

    if (!jobNum) continue;

    // Skip special locations
    if (location.toLowerCase() === 'previous employee') continue;

    // Extract base crew number (e.g., "013-26" from "013-26.1")
    var baseJobNum = jobNum.split('.')[0];

    if (!baseJobNum || !baseJobNum.match(/^\d{3}-\d{2}$/)) continue;

    if (!crewMap[baseJobNum]) {
      crewMap[baseJobNum] = {
        jobNumber: baseJobNum,
        location: location,
        employeeCount: 0,
        willTransition: true // Default to will transition
      };
    }
    crewMap[baseJobNum].employeeCount++;

    // Use the first non-empty location found
    if (!crewMap[baseJobNum].location && location) {
      crewMap[baseJobNum].location = location;
    }
  }

  // Convert to array and sort by job number
  var crews = Object.values(crewMap);
  crews.sort(function(a, b) {
    return a.jobNumber.localeCompare(b.jobNumber);
  });

  Logger.log('getCrewsForFiscalYearTransition: Found ' + crews.length + ' unique crews');
  return crews;
}

/**
 * Applies the fiscal year transition to selected crews.
 * Updates job numbers from old fiscal year suffix to new one.
 *
 * @param {string} oldFY - Old fiscal year suffix (e.g., "26")
 * @param {string} newFY - New fiscal year suffix (e.g., "27")
 * @param {Array} crewsToTransition - Array of base job numbers to transition (e.g., ["013-26", "029-26"])
 * @return {Object} Result with success status and message
 */
function applyFiscalYearTransition(oldFY, newFY, crewsToTransition) {
  Logger.log('=== applyFiscalYearTransition START ===');
  Logger.log('Old FY: ' + oldFY + ', New FY: ' + newFY);
  Logger.log('Crews to transition: ' + crewsToTransition.join(', '));

  if (!oldFY || !newFY || !crewsToTransition || crewsToTransition.length === 0) {
    return { success: false, message: 'Invalid parameters' };
  }

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var employeesSheet = ss.getSheetByName(SHEET_EMPLOYEES);

  if (!employeesSheet) {
    return { success: false, message: 'Employees sheet not found' };
  }

  var data = employeesSheet.getDataRange().getValues();
  var headers = data[0];

  // Find job number column
  var jobNumCol = -1;
  var nameCol = 0;

  for (var h = 0; h < headers.length; h++) {
    var header = String(headers[h]).toLowerCase().trim();
    if (header === 'job number') jobNumCol = h;
  }

  if (jobNumCol === -1) {
    return { success: false, message: 'Job Number column not found' };
  }

  // Build set of base job numbers to transition for faster lookup
  var transitionSet = {};
  for (var c = 0; c < crewsToTransition.length; c++) {
    transitionSet[crewsToTransition[c]] = true;
  }

  var updatedCount = 0;
  var updatedEmployees = [];
  var timezone = ss.getSpreadsheetTimeZone();
  var todayStr = Utilities.formatDate(new Date(), timezone, 'MM/dd/yyyy');

  // Process each employee
  for (var i = 1; i < data.length; i++) {
    var jobNum = String(data[i][jobNumCol] || '').trim();
    var empName = String(data[i][nameCol] || '').trim();

    if (!jobNum) continue;

    // Extract base crew number
    var baseJobNum = jobNum.split('.')[0];

    // Check if this crew should transition
    if (!transitionSet[baseJobNum]) continue;

    // Replace old FY suffix with new one
    // e.g., "013-26.1" -> "013-27.1"
    var newJobNum = jobNum.replace('-' + oldFY, '-' + newFY);

    if (newJobNum !== jobNum) {
      // Update the cell
      employeesSheet.getRange(i + 1, jobNumCol + 1).setValue(newJobNum);
      updatedCount++;
      updatedEmployees.push({
        name: empName,
        oldJobNum: jobNum,
        newJobNum: newJobNum
      });
    }
  }

  // Log to Employee History
  var historySheet = ss.getSheetByName('Employee History');
  if (historySheet && updatedEmployees.length > 0) {
    for (var e = 0; e < updatedEmployees.length; e++) {
      var emp = updatedEmployees[e];
      var historyRow = [
        todayStr,                                // Date
        emp.name,                                // Employee Name
        'FISCAL_YEAR_TRANSITION',                // Event Type
        '',                                      // Location (unchanged)
        emp.newJobNum,                           // Job Number (new)
        '',                                      // Hire Date
        '',                                      // Last Day
        '',                                      // Last Day Reason
        '',                                      // Rehire Date
        'Fiscal Year Transition: ' + emp.oldJobNum + ' → ' + emp.newJobNum,  // Notes
        '',                                      // Phone Number
        '',                                      // Email Address
        '',                                      // Glove Size
        ''                                       // Sleeve Size
      ];
      historySheet.appendRow(historyRow);
    }
  }

  // Also update Training Tracking if it exists
  var trainingSheet = ss.getSheetByName('Training Tracking');
  var trainingUpdated = 0;
  if (trainingSheet && trainingSheet.getLastRow() > 2) {
    var trainingData = trainingSheet.getDataRange().getValues();
    var trainingCrewCol = 2; // Column C = Crew #

    for (var t = 2; t < trainingData.length; t++) {
      var trainCrew = String(trainingData[t][trainingCrewCol] || '').trim();
      if (transitionSet[trainCrew]) {
        var newTrainCrew = trainCrew.replace('-' + oldFY, '-' + newFY);
        if (newTrainCrew !== trainCrew) {
          trainingSheet.getRange(t + 1, trainingCrewCol + 1).setValue(newTrainCrew);
          trainingUpdated++;
        }
      }
    }
  }

  Logger.log('=== applyFiscalYearTransition END ===');
  Logger.log('Updated ' + updatedCount + ' employees, ' + trainingUpdated + ' training rows');

  logEvent('Fiscal Year Transition: -' + oldFY + ' to -' + newFY + ', ' + updatedCount + ' employees updated');

  var message = '✅ Fiscal Year Transition Complete!\n\n';
  message += '📝 Updated ' + updatedCount + ' employee job number(s)\n';
  message += '📋 Updated ' + trainingUpdated + ' training tracking row(s)\n';
  message += '📋 Logged ' + updatedEmployees.length + ' history entries';

  return { success: true, message: message };
}

// ============================================================================
// CREW IMPORT SETTINGS PERSISTENCE
// ============================================================================

/**
 * Saves custom location mappings for crew import.
 * These are additional mappings the user has added beyond the defaults.
 *
 * @param {Object} customMappings - Object with location name -> mapped name
 * @return {Object} Result with success status
 */
function saveCrewImportLocationMappings(customMappings) {
  try {
    var props = PropertiesService.getScriptProperties();
    props.setProperty('CREW_IMPORT_LOCATION_MAPPINGS', JSON.stringify(customMappings));
    Logger.log('Saved ' + Object.keys(customMappings).length + ' custom location mappings');
    return { success: true };
  } catch (e) {
    Logger.log('Error saving location mappings: ' + e.message);
    return { success: false, error: e.message };
  }
}

/**
 * Loads custom location mappings for crew import.
 *
 * @return {Object} Custom mappings object (empty if none saved)
 */
function getCrewImportLocationMappings() {
  try {
    var props = PropertiesService.getScriptProperties();
    var saved = props.getProperty('CREW_IMPORT_LOCATION_MAPPINGS');
    if (saved) {
      return JSON.parse(saved);
    }
  } catch (e) {
    Logger.log('Error loading location mappings: ' + e.message);
  }
  return {};
}

/**
 * Saves duplicate employee selections for crew import.
 * Format: { "Employee Name": { selectedCrewIndex: 0, selectedJobNumber: "013-26" } }
 *
 * @param {Object} selections - Object with employee name -> selection info
 * @return {Object} Result with success status
 */
function saveCrewImportDuplicateSelections(selections) {
  try {
    var props = PropertiesService.getScriptProperties();
    props.setProperty('CREW_IMPORT_DUPLICATE_SELECTIONS', JSON.stringify(selections));
    Logger.log('Saved ' + Object.keys(selections).length + ' duplicate employee selections');
    return { success: true };
  } catch (e) {
    Logger.log('Error saving duplicate selections: ' + e.message);
    return { success: false, error: e.message };
  }
}

/**
 * Loads duplicate employee selections for crew import.
 *
 * @return {Object} Selections object (empty if none saved)
 */
function getCrewImportDuplicateSelections() {
  try {
    var props = PropertiesService.getScriptProperties();
    var saved = props.getProperty('CREW_IMPORT_DUPLICATE_SELECTIONS');
    if (saved) {
      return JSON.parse(saved);
    }
  } catch (e) {
    Logger.log('Error loading duplicate selections: ' + e.message);
  }
  return {};
}

/**
 * Clears a specific employee's saved duplicate selection.
 * Called from CrewImport UI when user clicks "Reset" on a remembered selection.
 *
 * @param {string} employeeName - The employee name to clear
 * @return {Object} Result with success flag
 */
function clearCrewImportDuplicateSelection(employeeName) {
  try {
    var props = PropertiesService.getScriptProperties();
    var saved = props.getProperty('CREW_IMPORT_DUPLICATE_SELECTIONS');
    if (saved) {
      var selections = JSON.parse(saved);
      if (selections[employeeName]) {
        delete selections[employeeName];
        props.setProperty('CREW_IMPORT_DUPLICATE_SELECTIONS', JSON.stringify(selections));
        Logger.log('Cleared saved duplicate selection for: ' + employeeName);
      }
    }
    return { success: true };
  } catch (e) {
    Logger.log('Error clearing duplicate selection: ' + e.message);
    return { success: false, error: e.message };
  }
}

/**
 * Saves special circumstance selections for crew import.
 * Format: { "Employee Name": { status: "Light Duty", location: "Light Duty", skip: false } }
 *
 * @param {Object} selections - Object with employee name -> selection info
 * @return {Object} Result with success status
 */
function saveCrewImportSpecialSelections(selections) {
  try {
    var props = PropertiesService.getScriptProperties();
    props.setProperty('CREW_IMPORT_SPECIAL_SELECTIONS', JSON.stringify(selections));
    Logger.log('Saved ' + Object.keys(selections).length + ' special circumstance selections');
    return { success: true };
  } catch (e) {
    Logger.log('Error saving special selections: ' + e.message);
    return { success: false, error: e.message };
  }
}

/**
 * Loads special circumstance selections for crew import.
 *
 * @return {Object} Selections object (empty if none saved)
 */
function getCrewImportSpecialSelections() {
  try {
    var props = PropertiesService.getScriptProperties();
    var saved = props.getProperty('CREW_IMPORT_SPECIAL_SELECTIONS');
    if (saved) {
      return JSON.parse(saved);
    }
  } catch (e) {
    Logger.log('Error loading special selections: ' + e.message);
  }
  return {};
}

/**
 * Gets all crew import settings at once (for dialog initialization).
 *
 * @return {Object} Object with locationMappings, duplicateSelections, and specialSelections
 */
function getCrewImportSettings() {
  return {
    locationMappings: getCrewImportLocationMappings(),
    duplicateSelections: getCrewImportDuplicateSelections(),
    specialSelections: getCrewImportSpecialSelections()
  };
}

/**
 * Clears all saved crew import settings.
 *
 * @return {Object} Result with success status
 */
function clearCrewImportSettings() {
  try {
    var props = PropertiesService.getScriptProperties();
    props.deleteProperty('CREW_IMPORT_LOCATION_MAPPINGS');
    props.deleteProperty('CREW_IMPORT_DUPLICATE_SELECTIONS');
    props.deleteProperty('CREW_IMPORT_SPECIAL_SELECTIONS');
    Logger.log('Cleared crew import settings');
    return { success: true };
  } catch (e) {
    Logger.log('Error clearing settings: ' + e.message);
    return { success: false, error: e.message };
  }
}

/**
 * Shows what's currently saved in crew import settings.
 * Use this to debug why certain employees are being auto-applied.
 */
function showCrewImportSavedSettings() {
  var settings = getCrewImportSettings();
  var html = '<h3>Saved Crew Import Settings</h3>';

  html += '<h4>Location Mappings (' + Object.keys(settings.locationMappings || {}).length + ')</h4>';
  html += '<pre>' + JSON.stringify(settings.locationMappings, null, 2) + '</pre>';

  html += '<h4>Duplicate Selections (' + Object.keys(settings.duplicateSelections || {}).length + ')</h4>';
  html += '<pre>' + JSON.stringify(settings.duplicateSelections, null, 2) + '</pre>';

  html += '<h4>Special Selections (' + Object.keys(settings.specialSelections || {}).length + ')</h4>';
  html += '<pre>' + JSON.stringify(settings.specialSelections, null, 2) + '</pre>';

  html += '<br><button onclick="google.script.run.withSuccessHandler(function() { alert(\'Settings cleared!\'); google.script.host.close(); }).clearCrewImportSettings()">Clear All Saved Settings</button>';

  var output = HtmlService.createHtmlOutput(html)
    .setWidth(600)
    .setHeight(500);
  SpreadsheetApp.getUi().showModalDialog(output, 'Crew Import Saved Settings');
}

/**
 * Removes a specific employee from saved special selections.
 * @param {string} employeeName - Name to remove
 */
function removeSpecialSelection(employeeName) {
  var selections = getCrewImportSpecialSelections();
  var removed = false;

  // Try exact match
  if (selections[employeeName]) {
    delete selections[employeeName];
    removed = true;
  }

  // Try case-insensitive match
  if (!removed) {
    var nameLower = employeeName.toLowerCase();
    for (var key in selections) {
      if (key.toLowerCase() === nameLower) {
        delete selections[key];
        removed = true;
        break;
      }
    }
  }

  if (removed) {
    saveCrewImportSpecialSelections(selections);
    Logger.log('Removed special selection for: ' + employeeName);
  }

  return { success: removed, removed: employeeName };
}

