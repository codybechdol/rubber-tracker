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
 * Applies crew changes to the Employees sheet.
 * Called from CrewImport.html when user confirms changes.
 * Updates: Location, Job Number, and Job Classification
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
  var timezone = ss.getSpreadsheetTimeZone();
  var today = new Date();
  var todayStr = Utilities.formatDate(today, timezone, 'MM/dd/yyyy');

  // Get or create Employee History sheet
  var historySheet = ss.getSheetByName('Employee History');

  for (var i = 0; i < changes.length; i++) {
    var change = changes[i];

    try {
      var rowIndex = change.rowIndex;

      // Check if this is a Previous Employee being rehired (rowIndex = -1)
      if (rowIndex === -1) {
        // This employee exists only in Employee History - REHIRE them
        Logger.log('Rehiring Previous Employee: ' + change.employeeName);

        // Add new row to Employees sheet
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

        // Log rehire to Employee History
        if (historySheet) {
          var historyRow = [
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
          ];
          historySheet.appendRow(historyRow);
          historyLogged++;
        }

        Logger.log('Rehired employee: ' + change.employeeName + ' | Location: ' + change.newLocation + ' | Job #: ' + change.newJobNumber);
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

      var locationChanged = false;
      var jobChanged = false;
      var secondaryJobChanged = false;
      var classificationChanged = false;

      // Update Location
      if (change.newLocation && change.newLocation !== change.oldLocation) {
        employeesSheet.getRange(rowIndex, locationCol + 1).setValue(change.newLocation);
        locationChanged = true;
      }

      // Update Job Number (with position, e.g., 013-26.1)
      if (change.newJobNumber && change.newJobNumber !== change.oldJobNumber) {
        employeesSheet.getRange(rowIndex, jobNumCol + 1).setValue(change.newJobNumber);
        jobChanged = true;
      }

      // Update Secondary Job Number (if column exists and value provided)
      if (secondaryJobNumCol !== -1 && change.newSecondaryJobNumber) {
        var currentSecondaryJob = String(data[rowIndex - 1][secondaryJobNumCol] || '').trim();
        if (change.newSecondaryJobNumber !== currentSecondaryJob) {
          employeesSheet.getRange(rowIndex, secondaryJobNumCol + 1).setValue(change.newSecondaryJobNumber);
          secondaryJobChanged = true;
          Logger.log('Updated secondary job for ' + change.employeeName + ': ' + change.newSecondaryJobNumber);
        }
      }

      // Update Job Classification (e.g., F, JRY, AP 1, AP 2, etc.)
      if (change.newClassification && change.newClassification !== change.oldClassification) {
        employeesSheet.getRange(rowIndex, jobClassificationCol + 1).setValue(change.newClassification);
        classificationChanged = true;
      }

      if (locationChanged || jobChanged || secondaryJobChanged || classificationChanged) {
        updatedCount++;

        // Log to Employee History
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
                   ' | Job #: ' + (jobChanged ? change.oldJobNumber + ' → ' + change.newJobNumber : 'unchanged') +
                   ' | Secondary Job #: ' + (secondaryJobChanged ? change.newSecondaryJobNumber : 'unchanged') +
                   ' | Classification: ' + (classificationChanged ? change.oldClassification + ' → ' + change.newClassification : 'unchanged'));
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

  // Sync with Job Tracking sheet if it exists
  var jobTrackingResult = syncJobTrackingAfterImport(ss);
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
    pendingJobs: pendingJobs
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
function syncJobTrackingAfterImport(ss) {
  var jobSheet = ss.getSheetByName('Job Tracking');
  if (!jobSheet) {
    Logger.log('syncJobTrackingAfterImport: Job Tracking sheet not found, skipping');
    return null;
  }

  var employeesSheet = ss.getSheetByName('Employees');
  if (!employeesSheet) {
    return null;
  }

  // Get current Job Tracking data
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
        estEndDate: jobData[j][5],
        actualEndDate: jobData[j][6],
        status: String(jobData[j][7] || '').trim(),
        notes: jobData[j][8] || ''
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

    // Check for foreman classification
    if (classification === 'F' || classification === 'GTO F' || classification === 'GF') {
      crewMap[crewNumber].foreman = name;
    }
  }

  var timestamp = new Date();
  var updatedCount = 0;
  var addedCount = 0;
  var pendingJobsWithEmployees = []; // Jobs that are Pending Start but now have employees
  var newRows = [];

  // Process each crew from Employees
  for (var crewNum in crewMap) {
    var crew = crewMap[crewNum];

    if (existingJobs[crewNum]) {
      // Update existing job
      var existing = existingJobs[crewNum];
      var rowIdx = existing.rowIndex;

      // Update location, foreman, crew size
      jobSheet.getRange(rowIdx, 2).setValue(crew.location || existing.location || 'Unknown');
      jobSheet.getRange(rowIdx, 3).setValue(crew.foreman || existing.foreman || '');
      jobSheet.getRange(rowIdx, 4).setValue(crew.crewSize);
      jobSheet.getRange(rowIdx, 10).setValue(timestamp);

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
          rowIndex: rowIdx
        });
        Logger.log('syncJobTrackingAfterImport: Pending Start job ' + crewNum + ' has ' + crew.crewSize + ' employees - needs user decision');
      }

      updatedCount++;
      delete existingJobs[crewNum];
    } else {
      // New crew - add to Job Tracking
      newRows.push([
        crewNum,
        crew.location || 'Unknown',
        crew.foreman || '',
        crew.crewSize,
        timestamp,        // Start Date = today (just appeared)
        '',               // Est. End Date
        '',               // Actual End Date
        'Active',         // Status
        'Added via Crew Import on ' + Utilities.formatDate(timestamp, Session.getScriptTimeZone(), 'MM/dd/yyyy'),
        timestamp
      ]);
      addedCount++;
    }
  }

  // Add new rows
  if (newRows.length > 0) {
    var lastRow = jobSheet.getLastRow();
    jobSheet.getRange(lastRow + 1, 1, newRows.length, 10).setValues(newRows);
  }

  // Check for jobs that now have no employees (not in crewMap)
  var emptyJobCount = 0;
  for (var oldCrew in existingJobs) {
    var oldData = existingJobs[oldCrew];
    if (oldData.status === 'Active' || oldData.status === 'Pending Start') {
      // This job had no employees in the import
      if (oldData.crewSize > 0) {
        // Update crew size to 0 and add note
        jobSheet.getRange(oldData.rowIndex, 4).setValue(0);
        var oldNotes = oldData.notes || '';
        var emptyNote = 'No employees in Crew Import on ' + Utilities.formatDate(timestamp, Session.getScriptTimeZone(), 'MM/dd/yyyy');
        if (oldNotes.indexOf('No employees') === -1) {
          jobSheet.getRange(oldData.rowIndex, 9).setValue(oldNotes ? oldNotes + '; ' + emptyNote : emptyNote);
        }
        emptyJobCount++;
      }
    }
  }

  // Build result message
  var results = [];
  if (updatedCount > 0) results.push(updatedCount + ' updated');
  if (addedCount > 0) results.push(addedCount + ' new jobs added');
  if (emptyJobCount > 0) results.push(emptyJobCount + ' jobs have no employees');

  Logger.log('syncJobTrackingAfterImport: ' + results.join(', '));
  if (pendingJobsWithEmployees.length > 0) {
    Logger.log('syncJobTrackingAfterImport: ' + pendingJobsWithEmployees.length + ' Pending Start jobs need activation decision');
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
      var currentStatus = String(jobData[i][7] || '').trim();

      if (currentStatus === 'Pending Start') {
        var rowIdx = i + 1;
        jobSheet.getRange(rowIdx, 8).setValue('Active');

        var currentNotes = jobData[i][8] || '';
        var activateNote = 'Activated on ' + Utilities.formatDate(timestamp, Session.getScriptTimeZone(), 'MM/dd/yyyy') + ' via Crew Import';
        jobSheet.getRange(rowIdx, 9).setValue(currentNotes ? currentNotes + '; ' + activateNote : activateNote);
        jobSheet.getRange(rowIdx, 10).setValue(timestamp);

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

  // Update the row - BOTH Status AND Actual End Date
  jobSheet.getRange(foundRow, 7).setValue(completionDate);  // Actual End Date (column G)
  jobSheet.getRange(foundRow, 8).setValue('Completed');     // Status (column H)
  jobSheet.getRange(foundRow, 10).setValue(timestamp);      // Last Updated (column J)

  // Add note about completion
  var currentNotes = jobData[foundRow - 1][8] || '';
  var completedNote = 'Marked Completed via Crew Import on ' + Utilities.formatDate(timestamp, Session.getScriptTimeZone(), 'MM/dd/yyyy');
  jobSheet.getRange(foundRow, 9).setValue(currentNotes ? currentNotes + '; ' + completedNote : completedNote);

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
  var result = {};

  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var jobNumber = String(row[0] || '').trim();

    if (!jobNumber) continue;

    var status = String(row[7] || '').trim();
    var startDate = row[4];
    var estEndDate = row[5];
    var location = String(row[1] || '').trim();
    var foreman = String(row[2] || '').trim();

    // Format dates for JSON
    var startDateStr = '';
    var estEndDateStr = '';

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

    result[jobNumber] = {
      status: status,
      location: location,
      foreman: foreman,
      startDate: startDateStr,
      estEndDate: estEndDateStr,
      isCompleted: status === 'Completed',
      isPendingStart: status === 'Pending Start',
      isActive: status === 'Active',
      isOnHold: status === 'On Hold'
    };
  }

  Logger.log('getJobTrackingForCrewImport: Found ' + Object.keys(result).length + ' jobs');
  return result;
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
function addOrUpdateJobTracking(jobNumber, location, foreman, crewSize, startDate, status) {
  Logger.log('=== addOrUpdateJobTracking ===');
  Logger.log('Job: ' + jobNumber + ', Location: ' + location + ', Status: ' + status + ', Start: ' + startDate);

  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var jobSheet = ss.getSheetByName('Job Tracking');

    if (!jobSheet) {
      // Create the sheet if it doesn't exist
      jobSheet = ss.insertSheet('Job Tracking');
      var headers = ['Job Number', 'Location', 'Foreman', 'Crew Size', 'Start Date', 'Est. End Date', 'Actual End Date', 'Status', 'Notes', 'Last Updated'];
      jobSheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      jobSheet.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#1565c0').setFontColor('white');
      Logger.log('Created Job Tracking sheet');
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

    // Parse start date
    var startDateObj = null;
    if (startDate) {
      startDateObj = new Date(startDate + 'T00:00:00');
      if (isNaN(startDateObj.getTime())) {
        startDateObj = null;
      }
    }

    if (existingRow > 0) {
      // Update existing row - preserve some values, update others
      jobSheet.getRange(existingRow, 2).setValue(location);  // Location
      if (foreman) jobSheet.getRange(existingRow, 3).setValue(foreman);  // Foreman
      if (crewSize > 0) jobSheet.getRange(existingRow, 4).setValue(crewSize);  // Crew Size
      if (startDateObj) jobSheet.getRange(existingRow, 5).setValue(startDateObj);  // Start Date
      jobSheet.getRange(existingRow, 8).setValue(status);  // Status
      jobSheet.getRange(existingRow, 10).setValue(formattedTimestamp);  // Last Updated

      Logger.log('Updated existing job ' + jobNumber + ' at row ' + existingRow);
      return { success: true, message: 'Updated job ' + jobNumber, row: existingRow, action: 'updated' };
    } else {
      // Add new row
      var newRow = [
        jobNumber,
        location,
        foreman || '',
        crewSize || 0,
        startDateObj || '',
        '',  // Est. End Date
        '',  // Actual End Date
        status,
        'Added via Crew Import',
        formattedTimestamp
      ];

      jobSheet.appendRow(newRow);
      var newRowNum = jobSheet.getLastRow();

      Logger.log('Added new job ' + jobNumber + ' at row ' + newRowNum);
      return { success: true, message: 'Added job ' + jobNumber, row: newRowNum, action: 'added' };
    }
  } catch (e) {
    Logger.log('Error in addOrUpdateJobTracking: ' + e.toString());
    return { success: false, message: 'Error: ' + e.toString() };
  }
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
    if (data.newLocation === 'Light Duty' && !data.clearJobNumber && !data.jobNumber) {
      newJobNumber = getNextLightDutyJobNumber(sheetData, jobNumCol);
      Logger.log('Auto-assigned Light Duty job number: ' + newJobNumber);
    }

    // Update Location if specified
    if (data.newLocation) {
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
function getNextLightDutyJobNumber(sheetData, jobNumCol) {
  var lightDutyPrefix = '005-26';
  var maxPosition = 0;

  // Scan all rows for existing 005-26.# job numbers
  for (var i = 1; i < sheetData.length; i++) {
    var jobNum = String(sheetData[i][jobNumCol] || '').trim();

    // Check if this is a Light Duty job number (005-26.#)
    if (jobNum.indexOf(lightDutyPrefix) === 0) {
      var match = jobNum.match(/005-26\.(\d+)/);
      if (match) {
        var position = parseInt(match[1], 10);
        if (position > maxPosition) {
          maxPosition = position;
        }
      }
    }
  }

  // Return the next available number
  var nextPosition = maxPosition + 1;
  return lightDutyPrefix + '.' + nextPosition;
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

