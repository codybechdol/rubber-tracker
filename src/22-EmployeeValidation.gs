/**
 * Employee Sheet Validation Utilities
 *
 * Functions to fix and maintain data validation on the Employees sheet.
 *
 * Updated: February 18, 2026 - Added Secondary Job Number column migration
 */

/**
 * Adds "Secondary Job Number" column to Employees sheet if it doesn't exist.
 * This column is added at the END of existing columns to avoid breaking any code.
 *
 * Used for tracking employees who work on multiple crews (primary M-Th, secondary Fri-Sat).
 *
 * Called from: Glove Manager → 🔧 Utilities → Add Secondary Job Column
 *
 * @returns {Object} {success: boolean, message: string, columnIndex: number}
 */
// eslint-disable-next-line no-unused-vars
function addSecondaryJobNumberColumn() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var ui = SpreadsheetApp.getUi();

  var employeesSheet = ss.getSheetByName('Employees');
  if (!employeesSheet) {
    ui.alert('❌ Error', 'Employees sheet not found!', ui.ButtonSet.OK);
    return { success: false, message: 'Employees sheet not found' };
  }

  // Get current headers
  var lastCol = employeesSheet.getLastColumn();
  var headers = employeesSheet.getRange(1, 1, 1, lastCol).getValues()[0];

  // Check if column already exists
  for (var h = 0; h < headers.length; h++) {
    var header = String(headers[h]).toLowerCase().trim();
    if (header === 'secondary job number' || header === 'secondary job') {
      ui.alert('ℹ️ Column Already Exists',
        'The "Secondary Job Number" column already exists at column ' +
        String.fromCharCode(65 + h) + ' (index ' + (h + 1) + ').\n\n' +
        'No changes were made.',
        ui.ButtonSet.OK);
      return { success: true, message: 'Column already exists', columnIndex: h + 1 };
    }
  }

  // Add new column at the end
  var newColIndex = lastCol + 1;
  employeesSheet.getRange(1, newColIndex).setValue('Secondary Job Number');

  // Format the header to match other headers
  var headerCell = employeesSheet.getRange(1, newColIndex);

  // Copy formatting from Job Number column if it exists
  var jobNumColIndex = -1;
  for (var j = 0; j < headers.length; j++) {
    if (String(headers[j]).toLowerCase().trim() === 'job number') {
      jobNumColIndex = j + 1;
      break;
    }
  }

  if (jobNumColIndex !== -1) {
    // Copy formatting from Job Number header
    var jobNumHeader = employeesSheet.getRange(1, jobNumColIndex);
    headerCell.setBackground(jobNumHeader.getBackground());
    headerCell.setFontColor(jobNumHeader.getFontColor());
    headerCell.setFontWeight(jobNumHeader.getFontWeight());
  } else {
    // Default header formatting
    headerCell.setBackground('#1a73e8');
    headerCell.setFontColor('#ffffff');
    headerCell.setFontWeight('bold');
  }

  // Set column width to match Job Number column
  if (jobNumColIndex !== -1) {
    var jobNumWidth = employeesSheet.getColumnWidth(jobNumColIndex);
    employeesSheet.setColumnWidth(newColIndex, jobNumWidth);
  } else {
    employeesSheet.setColumnWidth(newColIndex, 120);
  }

  Logger.log('Added Secondary Job Number column at column ' + newColIndex +
             ' (' + String.fromCharCode(64 + newColIndex) + ')');

  ui.alert(
    '✅ Column Added!',
    'Successfully added "Secondary Job Number" column.\n\n' +
    'Location: Column ' + String.fromCharCode(64 + newColIndex) + '\n\n' +
    'This column is used for employees who work on multiple crews:\n' +
    '• Primary Job Number = Main crew (M-Th)\n' +
    '• Secondary Job Number = Secondary crew (Fri-Sat, weekends)\n\n' +
    'The Crew Import feature will now save both job assignments.',
    ui.ButtonSet.OK
  );

  return { success: true, message: 'Column added', columnIndex: newColIndex };
}

/**
 * Fixes the Last Day Reason dropdown validation on the Employees sheet.
 * Ensures the dropdown only allows: Quit, Fired, Layoff, Resigned
 *
 * Called from: Glove Manager → 🔧 Utilities → Fix Last Day Reason Dropdown
 */
// eslint-disable-next-line no-unused-vars
function fixLastDayReasonValidation() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var ui = SpreadsheetApp.getUi();

  var employeesSheet = ss.getSheetByName('Employees');
  if (!employeesSheet) {
    ui.alert('❌ Error', 'Employees sheet not found!', ui.ButtonSet.OK);
    return;
  }

  // Find the Last Day Reason column
  var headers = employeesSheet.getRange(1, 1, 1, employeesSheet.getLastColumn()).getValues()[0];
  var lastDayReasonColIdx = -1;

  for (var h = 0; h < headers.length; h++) {
    if (String(headers[h]).toLowerCase().trim() === 'last day reason') {
      lastDayReasonColIdx = h + 1;  // 1-based column index
      break;
    }
  }

  if (lastDayReasonColIdx === -1) {
    ui.alert('❌ Error', 'Last Day Reason column not found in Employees sheet!', ui.ButtonSet.OK);
    return;
  }

  // Apply validation to all rows (starting from row 2)
  var lastRow = Math.max(employeesSheet.getLastRow(), 100);  // At least 100 rows for future entries
  var reasonRange = employeesSheet.getRange(2, lastDayReasonColIdx, lastRow - 1, 1);

  var reasonRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(['Quit', 'Fired', 'Layoff', 'Resigned'], true)
    .setAllowInvalid(false)  // Reject invalid entries
    .build();

  reasonRange.setDataValidation(reasonRule);

  Logger.log('Fixed Last Day Reason validation on column ' + lastDayReasonColIdx + ' (' + String.fromCharCode(64 + lastDayReasonColIdx) + ')');

  ui.alert(
    '✅ Validation Fixed!',
    'Last Day Reason dropdown has been updated.\n\n' +
    'Valid options:\n' +
    '• Quit\n' +
    '• Fired\n' +
    '• Layoff\n' +
    '• Resigned\n\n' +
    'Column: ' + String.fromCharCode(64 + lastDayReasonColIdx) + ' (Last Day Reason)\n' +
    'Applied to rows 2-' + lastRow,
    ui.ButtonSet.OK
  );
}

// ============================================================================
// JOB/CREW TRACKING SHEET
// ============================================================================

/**
 * Creates and sets up the "Job Tracking" sheet for managing crew/job lifecycle.
 * Tracks start dates, end dates, and status of each job/crew.
 *
 * Columns:
 * A: Job Number (e.g., 013-26)
 * B: Location
 * C: Foreman
 * D: Crew Size
 * E: Start Date (when job becomes active)
 * F: Est. End Date (projected completion)
 * G: Actual End Date (when completed)
 * H: Status (Active, Pending Start, Completed, On Hold)
 * I: Notes
 * J: Last Updated
 *
 * Called from: Glove Manager → 🔧 Utilities → Setup Job Tracking Sheet
 */
function setupJobTrackingSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var ui = SpreadsheetApp.getUi();

  // Check if sheet already exists
  var existingSheet = ss.getSheetByName('Job Tracking');
  if (existingSheet) {
    var response = ui.alert(
      '⚠️ Sheet Already Exists',
      'The "Job Tracking" sheet already exists.\n\n' +
      'Would you like to:\n' +
      '• YES - Refresh data from Employees sheet (preserves manual edits)\n' +
      '• NO - Cancel and keep current sheet',
      ui.ButtonSet.YES_NO
    );

    if (response === ui.Button.YES) {
      refreshJobTrackingFromEmployees();
      return;
    } else {
      return;
    }
  }

  // Create new sheet
  var sheet = ss.insertSheet('Job Tracking');

  // Define headers
  var headers = [
    'Job Number',
    'Location',
    'Foreman',
    'Crew Size',
    'Start Date',
    'Est. End Date',
    'Actual End Date',
    'Status',
    'Notes',
    'Last Updated'
  ];

  // Write headers
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);

  // Format header row
  var headerRange = sheet.getRange(1, 1, 1, headers.length);
  headerRange.setBackground('#1565c0');
  headerRange.setFontColor('#ffffff');
  headerRange.setFontWeight('bold');
  headerRange.setHorizontalAlignment('center');

  // Set column widths
  sheet.setColumnWidth(1, 100);  // Job Number
  sheet.setColumnWidth(2, 120);  // Location
  sheet.setColumnWidth(3, 140);  // Foreman
  sheet.setColumnWidth(4, 80);   // Crew Size
  sheet.setColumnWidth(5, 110);  // Start Date
  sheet.setColumnWidth(6, 110);  // Est. End Date
  sheet.setColumnWidth(7, 110);  // Actual End Date
  sheet.setColumnWidth(8, 100);  // Status
  sheet.setColumnWidth(9, 200);  // Notes
  sheet.setColumnWidth(10, 140); // Last Updated

  // Add data validation for Status column
  var statusValues = ['Active', 'Pending Start', 'Completed', 'On Hold'];
  var statusRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(statusValues, true)
    .setAllowInvalid(false)
    .build();
  sheet.getRange(2, 8, 500, 1).setDataValidation(statusRule);

  // Format date columns
  sheet.getRange(2, 5, 500, 3).setNumberFormat('mm/dd/yyyy');
  sheet.getRange(2, 10, 500, 1).setNumberFormat('mm/dd/yyyy hh:mm');

  // Freeze header row
  sheet.setFrozenRows(1);

  // Add filter
  sheet.getRange(1, 1, 1, headers.length).createFilter();

  // Populate with current crews from Employees sheet
  populateJobTrackingFromEmployees(sheet);

  ui.alert(
    '✅ Job Tracking Sheet Created!',
    'The Job Tracking sheet has been set up.\n\n' +
    'Key Features:\n' +
    '• Start Date - When a job becomes active\n' +
    '• Est. End Date - Projected completion date\n' +
    '• Status - Active, Pending Start, Completed, On Hold\n\n' +
    'Jobs with "Pending Start" status will not have employees assigned yet.\n' +
    'Use "Mark Job Complete" to close out finished jobs.',
    ui.ButtonSet.OK
  );
}

/**
 * Populates Job Tracking sheet with current crews from Employees sheet.
 * @param {Sheet} sheet - The Job Tracking sheet
 */
function populateJobTrackingFromEmployees(sheet) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var employeesSheet = ss.getSheetByName('Employees');

  if (!employeesSheet) {
    Logger.log('populateJobTrackingFromEmployees: Employees sheet not found');
    return;
  }

  var empData = employeesSheet.getDataRange().getValues();
  var empHeaders = empData[0];

  // Find columns
  var nameCol = -1, jobNumCol = -1, locationCol = -1, classificationCol = -1, lastDayCol = -1;
  for (var h = 0; h < empHeaders.length; h++) {
    var header = String(empHeaders[h]).toLowerCase().trim();
    if (header === 'name') nameCol = h;
    if (header === 'job number') jobNumCol = h;
    if (header === 'location') locationCol = h;
    if (header === 'job classification') classificationCol = h;
    if (header === 'last day') lastDayCol = h;
  }

  if (jobNumCol === -1) {
    Logger.log('populateJobTrackingFromEmployees: Job Number column not found');
    return;
  }

  // Build crew data
  var crewMap = {}; // { crewNumber: { location, foreman, crewSize, employees } }

  for (var i = 1; i < empData.length; i++) {
    var row = empData[i];
    var jobNumber = String(row[jobNumCol] || '').trim();
    var lastDay = lastDayCol !== -1 ? row[lastDayCol] : '';

    if (!jobNumber || lastDay) continue; // Skip if no job number or employee has left

    // Extract crew number (e.g., "013-26.1" → "013-26")
    var crewNumber = jobNumber;
    var dotIndex = jobNumber.lastIndexOf('.');
    if (dotIndex !== -1) {
      crewNumber = jobNumber.substring(0, dotIndex);
    }

    // Validate crew number format (NNN-YY)
    if (!/^\d{3}-\d{2}$/.test(crewNumber)) continue;

    // Skip placeholder crews (000-XX, 002-XX for Lost/Destroyed)
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

    // Update location if not set
    if (!crewMap[crewNumber].location && location) {
      crewMap[crewNumber].location = location;
    }

    // Check if this employee is a foreman (using classification hierarchy)
    if (classification === 'F' || classification === 'GTO F' || classification === 'GF') {
      crewMap[crewNumber].foreman = name;
    }
  }

  // Find foreman using classification hierarchy if not found
  var classificationPriority = ['F', 'GTO F', 'GF', 'SUP', 'JRY', 'JRY OP', 'WT', 'GTO', 'EO 1', 'EO 2'];

  for (var crew in crewMap) {
    if (!crewMap[crew].foreman && crewMap[crew].employees.length > 0) {
      // Find highest-ranked employee
      for (var i = 1; i < empData.length; i++) {
        var jobNum = String(empData[i][jobNumCol] || '').trim();
        if (!jobNum.startsWith(crew)) continue;

        var empName = nameCol !== -1 ? String(empData[i][nameCol] || '').trim() : '';
        var empClass = classificationCol !== -1 ? String(empData[i][classificationCol] || '').trim() : '';

        if (!crewMap[crew].foreman ||
            classificationPriority.indexOf(empClass) < classificationPriority.indexOf(crewMap[crew].foremanClass || '')) {
          crewMap[crew].foreman = empName;
          crewMap[crew].foremanClass = empClass;
        }
      }
    }
  }

  // Convert to array and write to sheet
  var crewNumbers = Object.keys(crewMap).sort();
  var dataRows = [];
  var timestamp = new Date();

  for (var c = 0; c < crewNumbers.length; c++) {
    var crewNum = crewNumbers[c];
    var crew = crewMap[crewNum];

    dataRows.push([
      crewNum,                    // Job Number
      crew.location || 'Unknown', // Location
      crew.foreman || '',         // Foreman
      crew.crewSize,              // Crew Size
      '',                         // Start Date (to be filled in)
      '',                         // Est. End Date (to be filled in)
      '',                         // Actual End Date
      'Active',                   // Status (default to Active for existing crews)
      '',                         // Notes
      timestamp                   // Last Updated
    ]);
  }

  if (dataRows.length > 0) {
    sheet.getRange(2, 1, dataRows.length, 10).setValues(dataRows);
    Logger.log('populateJobTrackingFromEmployees: Added ' + dataRows.length + ' crews');
  }
}

/**
 * Refreshes Job Tracking sheet from Employees sheet.
 * Preserves: Start Date, Est. End Date, Actual End Date, Status, Notes
 * Updates: Location, Foreman, Crew Size
 * Adds: New crews that appeared
 * Marks: Crews with no active employees as potentially completed
 */
function refreshJobTrackingFromEmployees() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var ui = SpreadsheetApp.getUi();

  var jobSheet = ss.getSheetByName('Job Tracking');
  if (!jobSheet) {
    ui.alert('❌ Error', 'Job Tracking sheet not found. Run "Setup Job Tracking Sheet" first.', ui.ButtonSet.OK);
    return;
  }

  var employeesSheet = ss.getSheetByName('Employees');
  if (!employeesSheet) {
    ui.alert('❌ Error', 'Employees sheet not found!', ui.ButtonSet.OK);
    return;
  }

  // Get existing job tracking data
  var jobData = jobSheet.getDataRange().getValues();
  var jobHeaders = jobData[0];

  // Build existing jobs map
  var existingJobs = {};
  for (var j = 1; j < jobData.length; j++) {
    var jobNum = String(jobData[j][0] || '').trim();
    if (jobNum) {
      existingJobs[jobNum] = {
        rowIndex: j + 1,
        startDate: jobData[j][4],
        estEndDate: jobData[j][5],
        actualEndDate: jobData[j][6],
        status: jobData[j][7] || 'Active',
        notes: jobData[j][8] || ''
      };
    }
  }

  // Get current crews from Employees
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

  if (jobNumCol === -1) {
    ui.alert('❌ Error', 'Job Number column not found in Employees sheet!', ui.ButtonSet.OK);
    return;
  }

  // Build current crew data
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
        crewSize: 0
      };
    }

    crewMap[crewNumber].crewSize++;

    if (!crewMap[crewNumber].location && location) {
      crewMap[crewNumber].location = location;
    }

    if (classification === 'F' || classification === 'GTO F' || classification === 'GF') {
      crewMap[crewNumber].foreman = name;
    }
  }

  // Update existing and add new
  var timestamp = new Date();
  var updatedCount = 0;
  var addedCount = 0;
  var noEmployeesCount = 0;

  var crewNumbers = Object.keys(crewMap).sort();
  var newRows = [];

  for (var c = 0; c < crewNumbers.length; c++) {
    var crewNum = crewNumbers[c];
    var crew = crewMap[crewNum];

    if (existingJobs[crewNum]) {
      // Update existing row
      var existing = existingJobs[crewNum];
      var rowIdx = existing.rowIndex;

      jobSheet.getRange(rowIdx, 2).setValue(crew.location || 'Unknown');  // Location
      jobSheet.getRange(rowIdx, 3).setValue(crew.foreman || '');          // Foreman
      jobSheet.getRange(rowIdx, 4).setValue(crew.crewSize);               // Crew Size
      jobSheet.getRange(rowIdx, 10).setValue(timestamp);                  // Last Updated

      updatedCount++;
      delete existingJobs[crewNum]; // Mark as processed
    } else {
      // New crew
      newRows.push([
        crewNum,
        crew.location || 'Unknown',
        crew.foreman || '',
        crew.crewSize,
        '',           // Start Date
        '',           // Est. End Date
        '',           // Actual End Date
        'Active',     // Status
        'New crew added ' + Utilities.formatDate(timestamp, Session.getScriptTimeZone(), 'MM/dd/yyyy'),
        timestamp
      ]);
      addedCount++;
    }
  }

  // Check for crews with no active employees (may need to be marked completed)
  for (var oldCrew in existingJobs) {
    var oldData = existingJobs[oldCrew];
    if (oldData.status !== 'Completed') {
      // Update note about no active employees
      var currentNotes = oldData.notes || '';
      var noEmpNote = 'No active employees as of ' + Utilities.formatDate(timestamp, Session.getScriptTimeZone(), 'MM/dd/yyyy');
      if (currentNotes.indexOf('No active employees') === -1) {
        jobSheet.getRange(oldData.rowIndex, 9).setValue(currentNotes ? currentNotes + '; ' + noEmpNote : noEmpNote);
      }
      noEmployeesCount++;
    }
  }

  // Add new rows
  if (newRows.length > 0) {
    var lastRow = jobSheet.getLastRow();
    jobSheet.getRange(lastRow + 1, 1, newRows.length, 10).setValues(newRows);
  }

  ui.alert(
    '✅ Job Tracking Refreshed!',
    'Results:\n\n' +
    '• Updated: ' + updatedCount + ' existing jobs\n' +
    '• Added: ' + addedCount + ' new jobs\n' +
    (noEmployeesCount > 0 ? '• ⚠️ ' + noEmployeesCount + ' jobs have no active employees\n  (Review and mark as Completed if appropriate)' : ''),
    ui.ButtonSet.OK
  );
}

/**
 * Marks a job as completed.
 * Sets Actual End Date to today and Status to Completed.
 *
 * Called from: Glove Manager → 🔧 Utilities → Mark Job Complete
 */
function markJobComplete() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var ui = SpreadsheetApp.getUi();

  var jobSheet = ss.getSheetByName('Job Tracking');
  if (!jobSheet) {
    ui.alert('❌ Error', 'Job Tracking sheet not found. Run "Setup Job Tracking Sheet" first.', ui.ButtonSet.OK);
    return;
  }

  // Prompt for job number
  var response = ui.prompt(
    'Mark Job Complete',
    'Enter the job number to mark as completed (e.g., 013-26):',
    ui.ButtonSet.OK_CANCEL
  );

  if (response.getSelectedButton() !== ui.Button.OK) {
    return;
  }

  var jobNumber = response.getResponseText().trim().toUpperCase();

  // Validate format
  if (!/^\d{3}-\d{2}$/.test(jobNumber)) {
    ui.alert('❌ Invalid Format', 'Job number must be in format NNN-YY (e.g., 013-26)', ui.ButtonSet.OK);
    return;
  }

  // Find the job
  var jobData = jobSheet.getDataRange().getValues();
  var foundRow = -1;

  for (var i = 1; i < jobData.length; i++) {
    if (String(jobData[i][0]).trim() === jobNumber) {
      foundRow = i + 1;
      break;
    }
  }

  if (foundRow === -1) {
    ui.alert('❌ Not Found', 'Job number "' + jobNumber + '" not found in Job Tracking sheet.', ui.ButtonSet.OK);
    return;
  }

  // Check current status
  var currentStatus = jobData[foundRow - 1][7];
  if (currentStatus === 'Completed') {
    ui.alert('ℹ️ Already Completed', 'Job "' + jobNumber + '" is already marked as Completed.', ui.ButtonSet.OK);
    return;
  }

  // Confirm completion
  var confirmResponse = ui.alert(
    'Confirm Completion',
    'Mark job "' + jobNumber + '" as Completed?\n\n' +
    'Location: ' + jobData[foundRow - 1][1] + '\n' +
    'Foreman: ' + jobData[foundRow - 1][2] + '\n\n' +
    'This will set:\n' +
    '• Status = Completed\n' +
    '• Actual End Date = Today',
    ui.ButtonSet.YES_NO
  );

  if (confirmResponse !== ui.Button.YES) {
    return;
  }

  // Update the row
  var today = new Date();
  jobSheet.getRange(foundRow, 7).setValue(today);       // Actual End Date
  jobSheet.getRange(foundRow, 8).setValue('Completed'); // Status
  jobSheet.getRange(foundRow, 10).setValue(today);      // Last Updated

  ui.alert(
    '✅ Job Marked Complete',
    'Job "' + jobNumber + '" has been marked as Completed.\n\n' +
    'Actual End Date: ' + Utilities.formatDate(today, Session.getScriptTimeZone(), 'MM/dd/yyyy'),
    ui.ButtonSet.OK
  );
}

/**
 * Shows a dialog to add a new job/crew with future start date.
 *
 * Called from: Glove Manager → 🔧 Utilities → Add Future Job
 */
function addFutureJob() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var ui = SpreadsheetApp.getUi();

  var jobSheet = ss.getSheetByName('Job Tracking');
  if (!jobSheet) {
    ui.alert('❌ Error', 'Job Tracking sheet not found. Run "Setup Job Tracking Sheet" first.', ui.ButtonSet.OK);
    return;
  }

  // Prompt for job number
  var jobResponse = ui.prompt(
    'Add Future Job - Step 1/3',
    'Enter the new job number (e.g., 055-26):',
    ui.ButtonSet.OK_CANCEL
  );

  if (jobResponse.getSelectedButton() !== ui.Button.OK) return;

  var jobNumber = jobResponse.getResponseText().trim().toUpperCase();

  if (!/^\d{3}-\d{2}$/.test(jobNumber)) {
    ui.alert('❌ Invalid Format', 'Job number must be in format NNN-YY (e.g., 055-26)', ui.ButtonSet.OK);
    return;
  }

  // Check if already exists
  var jobData = jobSheet.getDataRange().getValues();
  for (var i = 1; i < jobData.length; i++) {
    if (String(jobData[i][0]).trim() === jobNumber) {
      ui.alert('❌ Already Exists', 'Job "' + jobNumber + '" already exists in Job Tracking sheet.', ui.ButtonSet.OK);
      return;
    }
  }

  // Prompt for location
  var locationResponse = ui.prompt(
    'Add Future Job - Step 2/3',
    'Enter the location for job "' + jobNumber + '":',
    ui.ButtonSet.OK_CANCEL
  );

  if (locationResponse.getSelectedButton() !== ui.Button.OK) return;

  var location = locationResponse.getResponseText().trim();

  // Prompt for start date
  var dateResponse = ui.prompt(
    'Add Future Job - Step 3/3',
    'Enter the expected start date for job "' + jobNumber + '":\n\n' +
    'Format: MM/DD/YYYY (e.g., 03/15/2026)',
    ui.ButtonSet.OK_CANCEL
  );

  if (dateResponse.getSelectedButton() !== ui.Button.OK) return;

  var startDateStr = dateResponse.getResponseText().trim();
  var startDate;

  try {
    var parts = startDateStr.split('/');
    if (parts.length === 3) {
      startDate = new Date(parseInt(parts[2]), parseInt(parts[0]) - 1, parseInt(parts[1]));
    } else {
      throw new Error('Invalid format');
    }

    if (isNaN(startDate.getTime())) {
      throw new Error('Invalid date');
    }
  } catch (e) {
    ui.alert('❌ Invalid Date', 'Please enter date in MM/DD/YYYY format.', ui.ButtonSet.OK);
    return;
  }

  // Determine status based on start date
  var today = new Date();
  today.setHours(0, 0, 0, 0);
  var status = startDate > today ? 'Pending Start' : 'Active';

  // Add to sheet
  var timestamp = new Date();
  var newRow = [
    jobNumber,
    location,
    '',           // Foreman (not assigned yet)
    0,            // Crew Size
    startDate,    // Start Date
    '',           // Est. End Date
    '',           // Actual End Date
    status,
    'Added as future job on ' + Utilities.formatDate(timestamp, Session.getScriptTimeZone(), 'MM/dd/yyyy'),
    timestamp
  ];

  var lastRow = jobSheet.getLastRow();
  jobSheet.getRange(lastRow + 1, 1, 1, 10).setValues([newRow]);

  ui.alert(
    '✅ Future Job Added',
    'Job "' + jobNumber + '" has been added.\n\n' +
    'Location: ' + location + '\n' +
    'Start Date: ' + Utilities.formatDate(startDate, Session.getScriptTimeZone(), 'MM/dd/yyyy') + '\n' +
    'Status: ' + status + '\n\n' +
    (status === 'Pending Start' ?
      '⚠️ This job will not appear in Safety Compliance tracking until the start date.' :
      'This job is now active and will appear in tracking.'),
    ui.ButtonSet.OK
  );
}

/**
 * Gets active jobs (status = Active and start date has passed).
 * Used by Safety Compliance and other tracking functions.
 *
 * @return {Array} Array of active job numbers
 */
function getActiveJobNumbers() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var jobSheet = ss.getSheetByName('Job Tracking');

  // If no Job Tracking sheet, fall back to reading from Employees
  if (!jobSheet) {
    return getActiveCrewsFromEmployees();
  }

  var data = jobSheet.getDataRange().getValues();
  var activeJobs = [];
  var today = new Date();
  today.setHours(0, 0, 0, 0);

  for (var i = 1; i < data.length; i++) {
    var jobNum = String(data[i][0] || '').trim();
    var startDate = data[i][4];
    var status = String(data[i][7] || '').trim();

    if (!jobNum) continue;

    // Skip if not active
    if (status === 'Completed' || status === 'On Hold') continue;

    // Skip if start date is in the future
    if (startDate instanceof Date && startDate > today) continue;

    // Skip if status is "Pending Start" regardless of date
    if (status === 'Pending Start') continue;

    activeJobs.push(jobNum);
  }

  return activeJobs;
}

/**
 * Fallback function to get active crews from Employees sheet.
 * Used when Job Tracking sheet doesn't exist.
 *
 * @return {Array} Array of active crew numbers
 */
function getActiveCrewsFromEmployees() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var employeesSheet = ss.getSheetByName('Employees');

  if (!employeesSheet) return [];

  var data = employeesSheet.getDataRange().getValues();
  var headers = data[0];

  var jobNumCol = -1, lastDayCol = -1;
  for (var h = 0; h < headers.length; h++) {
    var header = String(headers[h]).toLowerCase().trim();
    if (header === 'job number') jobNumCol = h;
    if (header === 'last day') lastDayCol = h;
  }

  if (jobNumCol === -1) return [];

  var crews = {};

  for (var i = 1; i < data.length; i++) {
    var jobNumber = String(data[i][jobNumCol] || '').trim();
    var lastDay = lastDayCol !== -1 ? data[i][lastDayCol] : '';

    if (!jobNumber || lastDay) continue;

    var crewNumber = jobNumber;
    var dotIndex = jobNumber.lastIndexOf('.');
    if (dotIndex !== -1) {
      crewNumber = jobNumber.substring(0, dotIndex);
    }

    if (!/^\d{3}-\d{2}$/.test(crewNumber)) continue;
    if (crewNumber.startsWith('000-') || crewNumber.startsWith('002-')) continue;

    crews[crewNumber] = true;
  }

  return Object.keys(crews).sort();
}

/**
 * Checks if a job is currently active (not pending, completed, or on hold).
 *
 * @param {string} jobNumber - Job number to check
 * @return {boolean} True if job is active
 */
function isJobActive(jobNumber) {
  var activeJobs = getActiveJobNumbers();
  return activeJobs.indexOf(jobNumber) !== -1;
}

/**
 * Opens the Job Tracking sheet.
 */
function openJobTrackingSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Job Tracking');

  if (!sheet) {
    SpreadsheetApp.getUi().alert('Job Tracking sheet not found. Run "Setup Job Tracking Sheet" first.');
    return;
  }

  ss.setActiveSheet(sheet);
}
