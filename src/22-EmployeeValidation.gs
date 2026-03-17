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
 * K: Work Schedule (hidden) - Current schedule type (Mon-Thu, Tue-Fri, Mon-Fri, Custom)
 * L: Skip Days (hidden) - Comma-separated list (e.g., "Sat,Sun,Fri")
 * M: Schedule Effective Date (hidden) - When current schedule started
 * N: Schedule History (hidden) - JSON array of past schedules
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

  // Define headers - including hidden schedule columns
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
    'Last Updated',
    'Work Schedule',      // Column K (hidden)
    'Skip Days',          // Column L (hidden)
    'Schedule Effective', // Column M (hidden)
    'Schedule History'    // Column N (hidden)
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
  sheet.setColumnWidth(11, 100); // Work Schedule (hidden)
  sheet.setColumnWidth(12, 120); // Skip Days (hidden)
  sheet.setColumnWidth(13, 130); // Schedule Effective (hidden)
  sheet.setColumnWidth(14, 200); // Schedule History (hidden)

  // Hide schedule columns (K-N)
  sheet.hideColumns(11, 4);

  // Add data validation for Status column
  var statusValues = ['Active', 'Pending Start', 'Completed', 'On Hold'];
  var statusRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(statusValues, true)
    .setAllowInvalid(false)
    .build();
  sheet.getRange(2, 8, 500, 1).setDataValidation(statusRule);

  // Add data validation for Work Schedule column (K)
  var scheduleValues = ['Mon-Thu', 'Tue-Fri', 'Mon-Fri', 'Custom'];
  var scheduleRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(scheduleValues, true)
    .setAllowInvalid(true)
    .build();
  sheet.getRange(2, 11, 500, 1).setDataValidation(scheduleRule);

  // Format date columns
  sheet.getRange(2, 5, 500, 3).setNumberFormat('mm/dd/yyyy');
  sheet.getRange(2, 10, 500, 1).setNumberFormat('mm/dd/yyyy hh:mm');
  sheet.getRange(2, 13, 500, 1).setNumberFormat('mm/dd/yyyy');  // Schedule Effective

  // Add conditional formatting for Status column
  addJobTrackingConditionalFormatting(sheet);

  // Freeze header row
  sheet.setFrozenRows(1);

  // Add filter
  sheet.getRange(1, 1, 1, 10).createFilter();  // Only filter visible columns

  // Populate with current crews from Employees sheet
  populateJobTrackingFromEmployees(sheet);

  ui.alert(
    '✅ Job Tracking Sheet Created!',
    'The Job Tracking sheet has been set up.\n\n' +
    'Key Features:\n' +
    '• Start Date - When a job becomes active\n' +
    '• Est. End Date - Projected completion date\n' +
    '• Status - Active, Pending Start, Completed, On Hold\n' +
    '• Schedule History - Tracked in hidden columns for compliance\n\n' +
    'Jobs with "Pending Start" status will not have employees assigned yet.\n' +
    'Use "Mark Job Complete" to close out finished jobs.',
    ui.ButtonSet.OK
  );
}

/**
 * Adds conditional formatting to Job Tracking sheet based on Status column.
 * - Completed = Grey row
 * - Active = Green row
 * - Pending Start = Yellow row
 * - On Hold = Orange row
 * @param {Sheet} sheet - The Job Tracking sheet (optional, will find by name if not provided)
 */
function addJobTrackingConditionalFormatting(sheet) {
  if (!sheet) {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    sheet = ss.getSheetByName('Job Tracking');
    if (!sheet) {
      Logger.log('addJobTrackingConditionalFormatting: Job Tracking sheet not found');
      return;
    }
  }

  // Clear existing conditional formatting rules
  var existingRules = sheet.getConditionalFormatRules();
  var newRules = [];

  // Keep any rules that don't apply to our data range (rows 2+)
  for (var i = 0; i < existingRules.length; i++) {
    var ranges = existingRules[i].getRanges();
    var keepRule = true;
    for (var r = 0; r < ranges.length; r++) {
      if (ranges[r].getRow() >= 2 && ranges[r].getColumn() === 1) {
        keepRule = false;
        break;
      }
    }
    if (keepRule) {
      newRules.push(existingRules[i]);
    }
  }

  // Define the range for conditional formatting (entire data rows)
  var lastRow = Math.max(sheet.getLastRow(), 500);
  var numCols = 10; // All columns A-J
  var range = sheet.getRange(2, 1, lastRow - 1, numCols);

  // Status column is H (column 8)
  // Formula references $H2 to check status for each row

  // Rule 1: Completed = Grey (#e0e0e0)
  var completedRule = SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied('=$H2="Completed"')
    .setBackground('#e0e0e0')
    .setFontColor('#757575')
    .setRanges([range])
    .build();
  newRules.push(completedRule);

  // Rule 2: Active = Light Green (#c8e6c9)
  var activeRule = SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied('=$H2="Active"')
    .setBackground('#c8e6c9')
    .setRanges([range])
    .build();
  newRules.push(activeRule);

  // Rule 3: Pending Start = Light Yellow (#fff9c4)
  var pendingRule = SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied('=$H2="Pending Start"')
    .setBackground('#fff9c4')
    .setRanges([range])
    .build();
  newRules.push(pendingRule);

  // Rule 4: On Hold = Light Orange (#ffe0b2)
  var onHoldRule = SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied('=$H2="On Hold"')
    .setBackground('#ffe0b2')
    .setRanges([range])
    .build();
  newRules.push(onHoldRule);

  // Apply all rules
  sheet.setConditionalFormatRules(newRules);

  Logger.log('addJobTrackingConditionalFormatting: Applied conditional formatting rules');
}

/**
 * Menu function to apply/refresh conditional formatting on existing Job Tracking sheet.
 */
function menuApplyJobTrackingFormatting() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var ui = SpreadsheetApp.getUi();
  var sheet = ss.getSheetByName('Job Tracking');

  if (!sheet) {
    ui.alert('❌ Error', 'Job Tracking sheet not found.\n\nRun "Setup Job Tracking Sheet" first.', ui.ButtonSet.OK);
    return;
  }

  addJobTrackingConditionalFormatting(sheet);

  ui.alert('✅ Formatting Applied',
    'Conditional formatting has been applied to the Job Tracking sheet:\n\n' +
    '🟢 Active = Green\n' +
    '🟡 Pending Start = Yellow\n' +
    '🟠 On Hold = Orange\n' +
    '⚫ Completed = Grey',
    ui.ButtonSet.OK);
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

  // Auto-remove future training rows for this completed job
  var trainingRowsDeleted = autoSyncCompletedJobToTraining(jobNumber, today);

  var message = 'Job "' + jobNumber + '" has been marked as Completed.\n\n' +
    'Actual End Date: ' + Utilities.formatDate(today, Session.getScriptTimeZone(), 'MM/dd/yyyy');

  if (trainingRowsDeleted > 0) {
    message += '\n\n📚 Training Tracking: Removed ' + trainingRowsDeleted + ' future training row(s).\n' +
      '(Historical completed training records preserved)';
  }

  ui.alert('✅ Job Marked Complete', message, ui.ButtonSet.OK);
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

/**
 * Cleans up Training Tracking by removing ALL Pending training rows for jobs
 * that are marked as "Completed" in Job Tracking.
 *
 * Logic:
 * - If Job Tracking status = "Completed" AND Training Tracking status = "Pending"
 *   → DELETE the row (training was never completed, job is done)
 * - If Training Tracking status = "Complete" → KEEP (historical record)
 *
 * This is more aggressive than syncCompletedJobsToTraining() which only removes
 * FUTURE training months. This function removes ANY pending training regardless
 * of the month.
 *
 * Called from: Glove Manager → 🔧 Utilities → 🧹 Cleanup Pending Training for Completed Jobs
 */
function cleanupPendingTrainingForCompletedJobs() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var ui = SpreadsheetApp.getUi();

  var jobSheet = ss.getSheetByName('Job Tracking');
  var trainingSheet = ss.getSheetByName('Training Tracking');

  if (!jobSheet) {
    ui.alert('❌ Error', 'Job Tracking sheet not found.\n\nRun "Setup Job Tracking Sheet" first.', ui.ButtonSet.OK);
    return;
  }

  if (!trainingSheet) {
    ui.alert('❌ Error', 'Training Tracking sheet not found.\n\nRun "Setup Training Tracking" first.', ui.ButtonSet.OK);
    return;
  }

  // Get ALL completed jobs from Job Tracking (regardless of end date)
  var jobData = jobSheet.getDataRange().getValues();
  var completedJobs = {}; // jobNumber → true

  // Job Tracking columns: A=Job Number, B=Location, C=Foreman, D=Crew Size, E=Start Date, F=Est. End Date, G=Actual End Date, H=Status
  for (var j = 1; j < jobData.length; j++) {
    var jobNum = String(jobData[j][0] || '').trim();
    var status = String(jobData[j][7] || '').trim();

    if (status === 'Completed' && jobNum) {
      completedJobs[jobNum] = true;
    }
  }

  var completedJobCount = Object.keys(completedJobs).length;
  if (completedJobCount === 0) {
    ui.alert('ℹ️ No Completed Jobs', 'No jobs are marked as "Completed" in Job Tracking.\n\nNo changes needed.', ui.ButtonSet.OK);
    return;
  }

  Logger.log('cleanupPendingTrainingForCompletedJobs: Found ' + completedJobCount + ' completed jobs: ' + Object.keys(completedJobs).join(', '));

  // Get Training Tracking data
  var trainingData = trainingSheet.getDataRange().getValues();

  // Training Tracking structure:
  // Row 0: Title (row 1 in sheet)
  // Row 1: Headers (row 2 in sheet)
  // Row 2+: Data (row 3+ in sheet)
  // Columns: A=Month, B=Topic, C=Crew#, D=Lead, E=Size, F=CompletionDate, G=Attendees, H=Hours, I=Trainer, J=Status, K=Notes

  // Collect rows to delete (work backwards to avoid index shifting)
  var rowsToDelete = [];

  for (var t = 2; t < trainingData.length; t++) {
    var month = String(trainingData[t][0] || '').trim();
    var topic = String(trainingData[t][1] || '').trim();
    var crew = String(trainingData[t][2] || '').trim();
    var status = String(trainingData[t][9] || '').trim();

    // Only process rows for completed jobs
    if (!completedJobs[crew]) continue;

    // Skip if status is "Complete" - keep for historical purposes
    if (status === 'Complete') continue;

    // If status is "Pending", "N/A", or empty - mark for deletion
    if (status === 'Pending' || status === 'N/A' || status === '') {
      rowsToDelete.push({
        rowIndex: t + 1, // 1-based row number
        month: month,
        topic: topic,
        crew: crew,
        status: status || '(empty)'
      });
    }
  }

  if (rowsToDelete.length === 0) {
    ui.alert(
      'ℹ️ No Rows to Remove',
      'No "Pending" training records found for completed jobs.\n\n' +
      'All training for completed jobs is either already "Complete" (historical) or already removed.\n\n' +
      'Completed jobs checked:\n• ' + Object.keys(completedJobs).join('\n• '),
      ui.ButtonSet.OK
    );
    return;
  }

  // Build summary of what will be removed
  var summary = rowsToDelete.slice(0, 10).map(function(r) {
    return '• ' + r.crew + ' - ' + r.month + ' ' + r.topic.substring(0, 30) + (r.topic.length > 30 ? '...' : '') + ' (' + r.status + ')';
  }).join('\n');

  if (rowsToDelete.length > 10) {
    summary += '\n... and ' + (rowsToDelete.length - 10) + ' more rows';
  }

  // Confirm deletion
  var confirmResponse = ui.alert(
    'Confirm Removal',
    'Found ' + rowsToDelete.length + ' "Pending" training row(s) for completed jobs.\n\n' +
    'These will be REMOVED (training was never completed, job is done).\n' +
    '"Complete" training records will be preserved for history.\n\n' +
    'Rows to remove:\n' + summary + '\n\n' +
    'Continue?',
    ui.ButtonSet.YES_NO
  );

  if (confirmResponse !== ui.Button.YES) {
    ui.alert('Cancelled', 'No changes were made.', ui.ButtonSet.OK);
    return;
  }

  // Delete rows from bottom to top to avoid index shifting
  rowsToDelete.sort(function(a, b) { return b.rowIndex - a.rowIndex; });

  var deletedCount = 0;
  for (var d = 0; d < rowsToDelete.length; d++) {
    var rowInfo = rowsToDelete[d];
    trainingSheet.deleteRow(rowInfo.rowIndex);
    deletedCount++;
    Logger.log('cleanupPendingTrainingForCompletedJobs: Deleted row ' + rowInfo.rowIndex + ' - ' + rowInfo.month + ' ' + rowInfo.topic + ' for crew ' + rowInfo.crew);
  }

  ui.alert(
    '✅ Training Tracking Cleaned Up',
    'Removed ' + deletedCount + ' "Pending" training row(s) for completed jobs.\n\n' +
    '"Complete" training records were preserved for historical purposes.\n\n' +
    'Jobs cleaned:\n• ' + Object.keys(completedJobs).join('\n• '),
    ui.ButtonSet.OK
  );
}

/**
 * Syncs Training Tracking with Job Tracking completed jobs.
 * For jobs marked as "Completed" in Job Tracking, marks any training months
 * AFTER the Actual End Date as "N/A" in Training Tracking.
 *
 * This preserves historical completed training records while preventing
 * future training tasks from being created for crews that no longer exist.
 *
 * Called from: Glove Manager → 🔧 Utilities → 🔄 Sync Completed Jobs to Training
 */
function syncCompletedJobsToTraining() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var ui = SpreadsheetApp.getUi();

  var jobSheet = ss.getSheetByName('Job Tracking');
  var trainingSheet = ss.getSheetByName('Training Tracking');

  if (!jobSheet) {
    ui.alert('❌ Error', 'Job Tracking sheet not found.\n\nRun "Setup Job Tracking Sheet" first.', ui.ButtonSet.OK);
    return;
  }

  if (!trainingSheet) {
    ui.alert('❌ Error', 'Training Tracking sheet not found.\n\nRun "Setup Training Tracking" first.', ui.ButtonSet.OK);
    return;
  }

  // Get completed jobs from Job Tracking
  var jobData = jobSheet.getDataRange().getValues();
  var completedJobs = {}; // jobNumber → actualEndDate

  for (var j = 1; j < jobData.length; j++) {
    var jobNum = String(jobData[j][0] || '').trim();
    var status = String(jobData[j][7] || '').trim();
    var actualEndDate = jobData[j][6]; // Column G: Actual End Date

    if (status === 'Completed' && actualEndDate instanceof Date) {
      completedJobs[jobNum] = actualEndDate;
    }
  }

  var completedJobCount = Object.keys(completedJobs).length;
  if (completedJobCount === 0) {
    ui.alert('ℹ️ No Completed Jobs', 'No jobs are marked as "Completed" with an Actual End Date.\n\nNo changes made to Training Tracking.', ui.ButtonSet.OK);
    return;
  }

  Logger.log('syncCompletedJobsToTraining: Found ' + completedJobCount + ' completed jobs: ' + Object.keys(completedJobs).join(', '));

  // Month name to number mapping (0-indexed)
  var monthNumbers = {
    'january': 0, 'february': 1, 'march': 2, 'april': 3,
    'may': 4, 'june': 5, 'july': 6, 'august': 7,
    'september': 8, 'october': 9, 'november': 10, 'december': 11
  };

  // Get Training Tracking data
  var trainingData = trainingSheet.getDataRange().getValues();
  var currentYear = new Date().getFullYear();

  // Training Tracking structure:
  // Row 0: Title
  // Row 1: Headers
  // Row 2+: Data
  // Columns: A=Month, B=Topic, C=Crew#, D=Lead, E=Size, F=CompletionDate, G=Attendees, H=Hours, I=Trainer, J=Status, K=Notes

  // Collect rows to delete (work backwards to avoid index shifting)
  var rowsToDelete = [];

  for (var t = 2; t < trainingData.length; t++) {
    var month = String(trainingData[t][0] || '').toLowerCase().trim();
    var crew = String(trainingData[t][2] || '').trim();
    var status = String(trainingData[t][9] || '').trim();

    // Skip if already Complete (we want to preserve completed training records)
    if (status === 'Complete') continue;

    // Check if this crew's job is completed
    if (!completedJobs[crew]) continue;

    var endDate = completedJobs[crew];

    // Get the month number for this training row
    var trainingMonth = monthNumbers[month];
    if (trainingMonth === undefined) continue;

    // Determine if this training month is AFTER the job's end date
    // We use the START of the training month for comparison
    var trainingMonthStart = new Date(currentYear, trainingMonth, 1);

    // If the training month starts after the job ended, mark row for deletion
    if (trainingMonthStart > endDate) {
      rowsToDelete.push({
        rowIndex: t + 1, // 1-based row number
        month: month,
        crew: crew,
        endDate: endDate
      });
    }
  }

  if (rowsToDelete.length === 0) {
    ui.alert(
      'ℹ️ No Rows to Remove',
      'No future training records found for completed jobs.\n\n' +
      '(Completed training records are preserved)\n\n' +
      'Completed jobs checked:\n• ' + Object.keys(completedJobs).join('\n• '),
      ui.ButtonSet.OK
    );
    return;
  }

  // Confirm deletion
  var confirmResponse = ui.alert(
    'Confirm Removal',
    'Found ' + rowsToDelete.length + ' future training row(s) for completed jobs.\n\n' +
    'These are training months AFTER the job ended - they will be removed.\n' +
    '(Completed training records will be preserved)\n\n' +
    'Completed jobs:\n• ' + Object.keys(completedJobs).join('\n• ') + '\n\n' +
    'Continue?',
    ui.ButtonSet.YES_NO
  );

  if (confirmResponse !== ui.Button.YES) {
    ui.alert('Cancelled', 'No changes were made.', ui.ButtonSet.OK);
    return;
  }

  // Delete rows from bottom to top to avoid index shifting
  rowsToDelete.sort(function(a, b) { return b.rowIndex - a.rowIndex; });

  var deletedCount = 0;
  for (var d = 0; d < rowsToDelete.length; d++) {
    var rowInfo = rowsToDelete[d];
    trainingSheet.deleteRow(rowInfo.rowIndex);
    deletedCount++;
    Logger.log('syncCompletedJobsToTraining: Deleted row ' + rowInfo.rowIndex + ' - ' + rowInfo.month + ' training for crew ' + rowInfo.crew + ' (job ended ' + Utilities.formatDate(rowInfo.endDate, Session.getScriptTimeZone(), 'MM/dd/yyyy') + ')');
  }

  ui.alert(
    '✅ Training Tracking Cleaned Up',
    'Removed ' + deletedCount + ' future training row(s) for completed jobs.\n\n' +
    'Historical training records (completed before job ended) were preserved.\n\n' +
    'Completed jobs:\n• ' + Object.keys(completedJobs).join('\n• '),
    ui.ButtonSet.OK
  );
}

/**
 * Gets completed jobs with their actual end dates.
 * Used by other functions that need to know which jobs have ended.
 *
 * @return {Object} Map of jobNumber → actualEndDate
 */
function getCompletedJobsWithEndDates() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var jobSheet = ss.getSheetByName('Job Tracking');

  if (!jobSheet) return {};

  var data = jobSheet.getDataRange().getValues();
  var completedJobs = {};

  for (var i = 1; i < data.length; i++) {
    var jobNum = String(data[i][0] || '').trim();
    var status = String(data[i][7] || '').trim();
    var actualEndDate = data[i][6];

    if (status === 'Completed' && actualEndDate instanceof Date) {
      completedJobs[jobNum] = actualEndDate;
    }
  }

  return completedJobs;
}

/**
 * Auto-syncs completed jobs to Training Tracking when a job is marked complete.
 * DELETES future training rows (after job end date) to reduce clutter.
 * Preserves historical completed training records.
 *
 * Called from markJobComplete() after a job status is changed to Completed.
 *
 * @param {string} jobNumber - The job number that was just completed
 * @param {Date} actualEndDate - The actual end date of the job
 * @return {number} Number of rows deleted
 */
function autoSyncCompletedJobToTraining(jobNumber, actualEndDate) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var trainingSheet = ss.getSheetByName('Training Tracking');

  if (!trainingSheet) {
    Logger.log('autoSyncCompletedJobToTraining: Training Tracking sheet not found');
    return 0;
  }

  var monthNumbers = {
    'january': 0, 'february': 1, 'march': 2, 'april': 3,
    'may': 4, 'june': 5, 'july': 6, 'august': 7,
    'september': 8, 'october': 9, 'november': 10, 'december': 11
  };

  var trainingData = trainingSheet.getDataRange().getValues();
  var currentYear = new Date().getFullYear();
  var endDate = (actualEndDate instanceof Date) ? actualEndDate : new Date(actualEndDate);
  var endMonth = endDate.getMonth();  // 0-11
  var endYear = endDate.getFullYear();

  // Collect rows to delete (work backwards to avoid index shifting)
  var rowsToDelete = [];

  for (var t = 2; t < trainingData.length; t++) {
    var month = String(trainingData[t][0] || '').toLowerCase().trim();
    var crew = String(trainingData[t][2] || '').trim();
    var status = String(trainingData[t][9] || '').trim();

    // Only process rows for this specific job
    if (crew !== jobNumber) continue;

    // Skip if already Complete (preserve completed training records)
    if (status === 'Complete') continue;

    var trainingMonth = monthNumbers[month];
    if (trainingMonth === undefined) continue;

    var trainingMonthStart = new Date(currentYear, trainingMonth, 1);
    var trainingYear = currentYear;  // Assume current year

    // Determine if this training should be removed:
    // 1. Training month is AFTER the end date month (future months)
    // 2. OR Training month is the SAME month but status is still Pending/N/A (job ended mid-month)
    var shouldDelete = false;

    if (trainingYear > endYear) {
      // Future year
      shouldDelete = true;
    } else if (trainingYear === endYear) {
      if (trainingMonth > endMonth) {
        // Future month in same year
        shouldDelete = true;
      } else if (trainingMonth === endMonth && (status === 'Pending' || status === 'N/A' || status === '')) {
        // Same month, but training hasn't started - remove it
        // (Job ended mid-month, no point keeping pending training)
        shouldDelete = true;
      }
    }

    if (shouldDelete) {
      rowsToDelete.push({
        rowIndex: t + 1, // 1-based row number
        month: month
      });
    }
  }

  // Delete rows from bottom to top to avoid index shifting
  rowsToDelete.sort(function(a, b) { return b.rowIndex - a.rowIndex; });

  var deletedCount = 0;
  for (var d = 0; d < rowsToDelete.length; d++) {
    var rowInfo = rowsToDelete[d];
    trainingSheet.deleteRow(rowInfo.rowIndex);
    deletedCount++;
    Logger.log('autoSyncCompletedJobToTraining: Deleted row ' + rowInfo.rowIndex + ' - ' + rowInfo.month + ' training for job ' + jobNumber);
  }

  Logger.log('autoSyncCompletedJobToTraining: Deleted ' + deletedCount + ' future/pending training rows for job ' + jobNumber);
  return deletedCount;
}

/**
 * Syncs a completed job to Safety Compliance sheet.
 * Marks remaining days in current week as N/A since crew is no longer active.
 * Also removes the crew from Safety Compliance Config.
 *
 * @param {string} jobNumber - The job number that was completed
 * @param {Date} actualEndDate - The actual end date of the job
 * @return {Object} Result with weeksUpdated and configUpdated flags
 */
function autoSyncCompletedJobToSafetyCompliance(jobNumber, actualEndDate) {
  var result = { weeksUpdated: 0, configRemoved: false };

  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var tz = Session.getScriptTimeZone();
    var endDate = (actualEndDate instanceof Date) ? actualEndDate : new Date(actualEndDate);

    // Get current week boundaries
    var dayOfWeek = endDate.getDay();
    var weekStart = new Date(endDate);
    weekStart.setDate(endDate.getDate() - dayOfWeek);  // Go back to Sunday
    weekStart.setHours(0, 0, 0, 0);

    var weekStartStr = Utilities.formatDate(weekStart, tz, 'MM/dd/yyyy');

    // Update Safety Compliance for current week
    var complianceSheet = ss.getSheetByName('Safety Compliance');
    if (complianceSheet && complianceSheet.getLastRow() > 1) {
      var data = complianceSheet.getDataRange().getValues();
      var headers = data[0];

      // Find the row for this job/week
      for (var i = 1; i < data.length; i++) {
        var rowWeekStart = data[i][0];
        var rowJob = String(data[i][1] || '').trim();

        if (rowJob !== jobNumber) continue;

        if (rowWeekStart instanceof Date) {
          var rowWeekStr = Utilities.formatDate(rowWeekStart, tz, 'MM/dd/yyyy');
          if (rowWeekStr === weekStartStr) {
            // Found the current week row for this job
            // Mark remaining days (after end date) as N/A
            var endDayOfWeek = endDate.getDay();  // 0=Sun, 6=Sat

            // Day columns are D-J (4-10), corresponding to Sun-Sat (0-6)
            for (var d = endDayOfWeek + 1; d <= 6; d++) {
              var colIndex = d + 4;  // Column D=4 is Sun=0, etc.
              var currentValue = String(data[i][colIndex - 1] || '').trim();

              // Only update if not already marked as received
              if (currentValue !== '✅' && currentValue !== '✅L') {
                complianceSheet.getRange(i + 1, colIndex).setValue('N/A');
                complianceSheet.getRange(i + 1, colIndex).setNote('Job completed on ' + Utilities.formatDate(endDate, tz, 'MM/dd/yyyy'));
              }
            }

            // Update status column
            complianceSheet.getRange(i + 1, 13).setValue('Resolved');
            complianceSheet.getRange(i + 1, 14).setValue(new Date());  // Updated timestamp

            result.weeksUpdated++;
            Logger.log('autoSyncCompletedJobToSafetyCompliance: Updated week ' + weekStartStr + ' for job ' + jobNumber);
            break;
          }
        }
      }
    }

    // Remove from Safety Compliance Config
    var configSheet = ss.getSheetByName('Safety Compliance Config');
    if (configSheet && configSheet.getLastRow() > 1) {
      var configData = configSheet.getDataRange().getValues();

      for (var c = 1; c < configData.length; c++) {
        var configJob = String(configData[c][0] || '').trim();
        if (configJob === jobNumber) {
          configSheet.deleteRow(c + 1);
          result.configRemoved = true;
          Logger.log('autoSyncCompletedJobToSafetyCompliance: Removed job ' + jobNumber + ' from Safety Compliance Config');
          break;
        }
      }
    }

    return result;

  } catch (err) {
    Logger.log('Error in autoSyncCompletedJobToSafetyCompliance: ' + err);
    return result;
  }
}

/**
 * Menu function to manually sync a completed job to Training and Safety Compliance.
 * Useful for fixing jobs that were marked complete but didn't sync properly.
 *
 * Called from: Glove Manager → 🔧 Utilities → Sync Completed Job
 */
function menuSyncCompletedJob() {
  var ui = SpreadsheetApp.getUi();
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  // Get job number from user
  var response = ui.prompt(
    '🔄 Sync Completed Job',
    'Enter the job number to sync (e.g., 052-25):\n\n' +
    'This will:\n' +
    '• Remove pending training rows for this job\n' +
    '• Update Safety Compliance for current week\n' +
    '• Remove from Safety Compliance Config',
    ui.ButtonSet.OK_CANCEL
  );

  if (response.getSelectedButton() !== ui.Button.OK) return;

  var jobNumber = response.getResponseText().trim();
  if (!jobNumber || !/^\d{3}-\d{2}$/.test(jobNumber)) {
    ui.alert('Invalid job number format. Use XXX-XX format (e.g., 052-25).');
    return;
  }

  // Get job info from Job Tracking
  var jobSheet = ss.getSheetByName('Job Tracking');
  if (!jobSheet) {
    ui.alert('Job Tracking sheet not found.');
    return;
  }

  var jobData = jobSheet.getDataRange().getValues();
  var jobRow = null;
  var actualEndDate = null;

  for (var i = 1; i < jobData.length; i++) {
    if (String(jobData[i][0]).trim() === jobNumber) {
      jobRow = jobData[i];
      actualEndDate = jobData[i][6];  // Column G = Actual End Date
      break;
    }
  }

  if (!jobRow) {
    ui.alert('Job ' + jobNumber + ' not found in Job Tracking.');
    return;
  }

  var status = String(jobRow[7] || '').trim();  // Column H = Status
  if (status !== 'Completed') {
    var confirm = ui.alert(
      'Job Not Completed',
      'Job ' + jobNumber + ' has status "' + status + '", not "Completed".\n\n' +
      'Do you want to mark it as Completed and sync anyway?',
      ui.ButtonSet.YES_NO
    );

    if (confirm !== ui.Button.YES) return;

    // Mark as completed
    for (var j = 1; j < jobData.length; j++) {
      if (String(jobData[j][0]).trim() === jobNumber) {
        jobSheet.getRange(j + 1, 8).setValue('Completed');
        if (!actualEndDate) {
          actualEndDate = new Date();
          jobSheet.getRange(j + 1, 7).setValue(actualEndDate);
        }
        break;
      }
    }
  }

  if (!actualEndDate || !(actualEndDate instanceof Date)) {
    actualEndDate = new Date();  // Default to today
  }

  // Sync Training
  var trainingDeleted = autoSyncCompletedJobToTraining(jobNumber, actualEndDate);

  // Sync Safety Compliance
  var safetyResult = autoSyncCompletedJobToSafetyCompliance(jobNumber, actualEndDate);

  // Show results
  var msg = '✅ Sync Complete for ' + jobNumber + '\n\n';
  msg += '📚 Training Tracking: ' + trainingDeleted + ' row(s) removed\n';
  msg += '🛡️ Safety Compliance: ' + (safetyResult.weeksUpdated > 0 ? 'Current week updated' : 'No update needed') + '\n';
  msg += '⚙️ Safety Config: ' + (safetyResult.configRemoved ? 'Crew removed' : 'Not found or already removed');

  ui.alert('Sync Complete', msg, ui.ButtonSet.OK);
}

// ============================================================================
// SCHEDULE TRACKING FUNCTIONS
// ============================================================================

/**
 * Migrates existing Job Tracking sheet to add schedule history columns (K-N).
 * Safe to run multiple times - checks if columns already exist.
 *
 * Called from: Glove Manager → 🔧 Utilities → Add Schedule History Columns
 */
function migrateJobTrackingScheduleColumns() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var jobSheet = ss.getSheetByName('Job Tracking');

  if (!jobSheet) {
    SpreadsheetApp.getUi().alert('Job Tracking sheet not found.');
    return;
  }

  var headers = jobSheet.getRange(1, 1, 1, 20).getValues()[0];
  var hasScheduleColumns = headers.indexOf('Work Schedule') !== -1;

  if (hasScheduleColumns) {
    SpreadsheetApp.getUi().alert('Schedule columns already exist in Job Tracking sheet.');
    return;
  }

  // Add new headers after column J (Last Updated)
  var newHeaders = ['Work Schedule', 'Skip Days', 'Schedule Effective', 'Schedule History'];
  jobSheet.getRange(1, 11, 1, 4).setValues([newHeaders]);

  // Format headers
  var headerRange = jobSheet.getRange(1, 11, 1, 4);
  headerRange.setBackground('#1565c0');
  headerRange.setFontColor('#ffffff');
  headerRange.setFontWeight('bold');
  headerRange.setHorizontalAlignment('center');

  // Set column widths
  jobSheet.setColumnWidth(11, 100);  // Work Schedule
  jobSheet.setColumnWidth(12, 120);  // Skip Days
  jobSheet.setColumnWidth(13, 130);  // Schedule Effective
  jobSheet.setColumnWidth(14, 200);  // Schedule History

  // Hide new columns
  jobSheet.hideColumns(11, 4);

  // Add data validation for Work Schedule
  var scheduleValues = ['Mon-Thu', 'Tue-Fri', 'Mon-Fri', 'Custom'];
  var scheduleRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(scheduleValues, true)
    .setAllowInvalid(true)
    .build();

  var lastRow = jobSheet.getLastRow();
  if (lastRow > 1) {
    jobSheet.getRange(2, 11, lastRow - 1, 1).setDataValidation(scheduleRule);
    jobSheet.getRange(2, 13, lastRow - 1, 1).setNumberFormat('mm/dd/yyyy');

    // Initialize with defaults from Safety Compliance Config if available
    initializeSchedulesFromConfig();
  }

  SpreadsheetApp.getUi().alert('✅ Schedule history columns added to Job Tracking sheet.\n\nColumns K-N are now hidden and will track schedule changes.');
}

/**
 * Initializes schedule data in Job Tracking from Safety Compliance Config.
 * Called during migration to populate existing crews with their current schedules.
 */
function initializeSchedulesFromConfig() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var jobSheet = ss.getSheetByName('Job Tracking');
  var configSheet = ss.getSheetByName('Safety Compliance Config');

  if (!jobSheet || !configSheet) return;

  var configData = configSheet.getDataRange().getValues();
  var configHeaders = configData[0];

  // Find column indices in Config
  var jobCol = configHeaders.indexOf('Job Number');
  var sunCol = configHeaders.indexOf('Skip Sun');
  var monCol = configHeaders.indexOf('Skip Mon');
  var tueCol = configHeaders.indexOf('Skip Tue');
  var wedCol = configHeaders.indexOf('Skip Wed');
  var thuCol = configHeaders.indexOf('Skip Thu');
  var friCol = configHeaders.indexOf('Skip Fri');
  var satCol = configHeaders.indexOf('Skip Sat');

  if (jobCol === -1) return;

  // Build config map
  var configMap = {};
  for (var i = 1; i < configData.length; i++) {
    var job = String(configData[i][jobCol] || '').trim();
    if (!job) continue;

    var skipDays = [];
    if (sunCol !== -1 && configData[i][sunCol]) skipDays.push('Sun');
    if (monCol !== -1 && configData[i][monCol]) skipDays.push('Mon');
    if (tueCol !== -1 && configData[i][tueCol]) skipDays.push('Tue');
    if (wedCol !== -1 && configData[i][wedCol]) skipDays.push('Wed');
    if (thuCol !== -1 && configData[i][thuCol]) skipDays.push('Thu');
    if (friCol !== -1 && configData[i][friCol]) skipDays.push('Fri');
    if (satCol !== -1 && configData[i][satCol]) skipDays.push('Sat');

    configMap[job] = skipDays.join(',');
  }

  // Update Job Tracking
  var jobData = jobSheet.getDataRange().getValues();
  var today = new Date();
  var todayStr = Utilities.formatDate(today, Session.getScriptTimeZone(), 'MM/dd/yyyy');

  for (var j = 1; j < jobData.length; j++) {
    var jobNum = String(jobData[j][0] || '').trim();
    if (!jobNum || !configMap[jobNum]) continue;

    var skipDays = configMap[jobNum];
    var schedule = determineScheduleType(skipDays);

    var rowNum = j + 1;
    jobSheet.getRange(rowNum, 11).setValue(schedule);        // Work Schedule
    jobSheet.getRange(rowNum, 12).setValue(skipDays);        // Skip Days
    jobSheet.getRange(rowNum, 13).setValue(today);           // Schedule Effective
    jobSheet.getRange(rowNum, 14).setValue('[]');            // Schedule History (empty)
  }

  Logger.log('initializeSchedulesFromConfig: Initialized schedule data for ' + Object.keys(configMap).length + ' crews');
}

/**
 * Determines schedule type from skip days string.
 * @param {string} skipDays - Comma-separated skip days (e.g., "Sat,Sun,Fri")
 * @return {string} Schedule type (Mon-Thu, Tue-Fri, Mon-Fri, Custom)
 */
function determineScheduleType(skipDays) {
  if (!skipDays) return 'Mon-Fri';

  var days = skipDays.toLowerCase().split(',').map(function(d) { return d.trim(); });

  // Mon-Thu: Skips Fri, Sat, Sun
  if (days.indexOf('fri') !== -1 && days.indexOf('sat') !== -1 && days.indexOf('sun') !== -1 && days.length === 3) {
    return 'Mon-Thu';
  }

  // Tue-Fri: Skips Sat, Sun, Mon
  if (days.indexOf('sat') !== -1 && days.indexOf('sun') !== -1 && days.indexOf('mon') !== -1 && days.length === 3) {
    return 'Tue-Fri';
  }

  // Mon-Fri: Skips only Sat, Sun
  if (days.indexOf('sat') !== -1 && days.indexOf('sun') !== -1 && days.length === 2) {
    return 'Mon-Fri';
  }

  return 'Custom';
}

/**
 * Updates a crew's schedule in Job Tracking and archives the old schedule.
 * Called when schedule changes are made via Crew Import or Safety Compliance Config.
 *
 * @param {string} jobNumber - The job number (e.g., "013-26")
 * @param {string} newSchedule - New schedule type (Mon-Thu, Tue-Fri, Mon-Fri, Custom)
 * @param {string} newSkipDays - New skip days (e.g., "Sat,Sun,Fri")
 * @return {boolean} True if updated successfully
 */
function updateCrewScheduleInJobTracking(jobNumber, newSchedule, newSkipDays) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var jobSheet = ss.getSheetByName('Job Tracking');

  if (!jobSheet) {
    Logger.log('updateCrewScheduleInJobTracking: Job Tracking sheet not found');
    return false;
  }

  // Check if schedule columns exist
  var headers = jobSheet.getRange(1, 1, 1, 20).getValues()[0];
  var scheduleCol = headers.indexOf('Work Schedule') + 1;

  if (scheduleCol === 0) {
    Logger.log('updateCrewScheduleInJobTracking: Schedule columns not found - run migration first');
    return false;
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
    Logger.log('updateCrewScheduleInJobTracking: Job ' + jobNumber + ' not found');
    return false;
  }

  var today = new Date();
  var todayStr = Utilities.formatDate(today, Session.getScriptTimeZone(), 'MM/dd/yyyy');

  // Get current schedule info
  var currentSchedule = jobData[foundRow - 1][10] || '';  // Column K (index 10)
  var currentSkipDays = jobData[foundRow - 1][11] || '';  // Column L (index 11)
  var currentEffective = jobData[foundRow - 1][12] || ''; // Column M (index 12)
  var historyJson = jobData[foundRow - 1][13] || '[]';    // Column N (index 13)

  // Only update if schedule actually changed
  if (currentSchedule === newSchedule && currentSkipDays === newSkipDays) {
    Logger.log('updateCrewScheduleInJobTracking: No change for job ' + jobNumber);
    return true;
  }

  // Archive old schedule to history if it existed
  var history = [];
  try {
    history = JSON.parse(historyJson);
  } catch (e) {
    history = [];
  }

  if (currentSchedule && currentEffective) {
    var effectiveDate = '';
    if (currentEffective instanceof Date) {
      effectiveDate = Utilities.formatDate(currentEffective, Session.getScriptTimeZone(), 'MM/dd/yyyy');
    } else {
      effectiveDate = String(currentEffective);
    }

    history.push({
      schedule: currentSchedule,
      skipDays: currentSkipDays,
      startDate: effectiveDate,
      endDate: todayStr
    });
  }

  // Update with new schedule
  jobSheet.getRange(foundRow, 11).setValue(newSchedule);     // Work Schedule
  jobSheet.getRange(foundRow, 12).setValue(newSkipDays);     // Skip Days
  jobSheet.getRange(foundRow, 13).setValue(today);           // Schedule Effective
  jobSheet.getRange(foundRow, 14).setValue(JSON.stringify(history)); // Schedule History

  Logger.log('updateCrewScheduleInJobTracking: Updated ' + jobNumber + ' to ' + newSchedule + ' (skip: ' + newSkipDays + ')');
  return true;
}

/**
 * Gets the schedule that was in effect for a crew during a specific week.
 * Used by Safety Compliance calculation to determine correct N/A days.
 *
 * @param {string} jobNumber - The job number (e.g., "013-26")
 * @param {Date} weekStartDate - The start of the week to look up
 * @return {Object} Schedule info {schedule, skipDays} or null if not found
 */
function getCrewScheduleForWeek(jobNumber, weekStartDate) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var jobSheet = ss.getSheetByName('Job Tracking');

  if (!jobSheet) return null;

  // Check if schedule columns exist
  var headers = jobSheet.getRange(1, 1, 1, 20).getValues()[0];
  var scheduleCol = headers.indexOf('Work Schedule');

  if (scheduleCol === -1) {
    // Schedule columns don't exist yet - return null (will use Config instead)
    return null;
  }

  var jobData = jobSheet.getDataRange().getValues();
  var foundRow = null;

  for (var i = 1; i < jobData.length; i++) {
    if (String(jobData[i][0] || '').trim() === jobNumber) {
      foundRow = jobData[i];
      break;
    }
  }

  if (!foundRow) return null;

  var currentSchedule = foundRow[10] || '';   // Column K (index 10)
  var currentSkipDays = foundRow[11] || '';   // Column L (index 11)
  var currentEffective = foundRow[12];        // Column M (index 12)
  var historyJson = foundRow[13] || '[]';     // Column N (index 13)

  // Parse effective date
  var effectiveDate = null;
  if (currentEffective instanceof Date) {
    effectiveDate = currentEffective;
  } else if (currentEffective) {
    effectiveDate = new Date(currentEffective);
  }

  // Check if current schedule was in effect during requested week
  if (!effectiveDate || effectiveDate <= weekStartDate) {
    // Current schedule was active during this week
    return {
      schedule: currentSchedule,
      skipDays: currentSkipDays
    };
  }

  // Need to look in history
  var history = [];
  try {
    history = JSON.parse(historyJson);
  } catch (e) {
    history = [];
  }

  // Search history for the schedule active during this week
  // History entries have startDate and endDate
  for (var h = history.length - 1; h >= 0; h--) {
    var entry = history[h];
    var startDate = new Date(entry.startDate);
    var endDate = new Date(entry.endDate);

    if (startDate <= weekStartDate && weekStartDate < endDate) {
      return {
        schedule: entry.schedule,
        skipDays: entry.skipDays
      };
    }
  }

  // No matching history entry - return current as fallback
  return {
    schedule: currentSchedule,
    skipDays: currentSkipDays
  };
}

/**
 * Syncs schedule changes from Safety Compliance Config to Job Tracking.
 * Called when changes are made to the Config sheet.
 */
function syncConfigToJobTrackingSchedule() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var configSheet = ss.getSheetByName('Safety Compliance Config');
  var jobSheet = ss.getSheetByName('Job Tracking');

  if (!configSheet || !jobSheet) {
    Logger.log('syncConfigToJobTrackingSchedule: Required sheets not found');
    return;
  }

  // Check if schedule columns exist
  var headers = jobSheet.getRange(1, 1, 1, 20).getValues()[0];
  if (headers.indexOf('Work Schedule') === -1) {
    Logger.log('syncConfigToJobTrackingSchedule: Schedule columns not found - run migration first');
    return;
  }

  var configData = configSheet.getDataRange().getValues();
  var configHeaders = configData[0];

  // Find column indices
  var jobCol = configHeaders.indexOf('Job Number');
  var sunCol = configHeaders.indexOf('Skip Sun');
  var monCol = configHeaders.indexOf('Skip Mon');
  var tueCol = configHeaders.indexOf('Skip Tue');
  var wedCol = configHeaders.indexOf('Skip Wed');
  var thuCol = configHeaders.indexOf('Skip Thu');
  var friCol = configHeaders.indexOf('Skip Fri');
  var satCol = configHeaders.indexOf('Skip Sat');

  if (jobCol === -1) return;

  var updatedCount = 0;

  for (var i = 1; i < configData.length; i++) {
    var job = String(configData[i][jobCol] || '').trim();
    if (!job) continue;

    var skipDays = [];
    if (sunCol !== -1 && configData[i][sunCol]) skipDays.push('Sun');
    if (monCol !== -1 && configData[i][monCol]) skipDays.push('Mon');
    if (tueCol !== -1 && configData[i][tueCol]) skipDays.push('Tue');
    if (wedCol !== -1 && configData[i][wedCol]) skipDays.push('Wed');
    if (thuCol !== -1 && configData[i][thuCol]) skipDays.push('Thu');
    if (friCol !== -1 && configData[i][friCol]) skipDays.push('Fri');
    if (satCol !== -1 && configData[i][satCol]) skipDays.push('Sat');

    var skipDaysStr = skipDays.join(',');
    var schedule = determineScheduleType(skipDaysStr);

    if (updateCrewScheduleInJobTracking(job, schedule, skipDaysStr)) {
      updatedCount++;
    }
  }

  Logger.log('syncConfigToJobTrackingSchedule: Updated ' + updatedCount + ' crews');
}
