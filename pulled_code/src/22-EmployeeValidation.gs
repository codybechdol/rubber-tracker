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
 * Columns (25 total, 21 visible + 4 hidden):
 * A: Job Number (e.g., 013-26)
 * B: Location
 * C: Foreman
 * D: Crew Size
 * E: Start Date (when job becomes active)
 * F: Put On Hold Date (when job was put on hold - for On Hold jobs)
 * G: Estimated Return (expected return date - for On Hold jobs)
 * H: Est. End Date (projected completion)
 * I: Actual End Date (when completed)
 * J: Status (Active, Pending Start, Completed, On Hold)
 * K: Notes
 * L-R: Skip Sun, Skip Mon, Skip Tue, Skip Wed, Skip Thu, Skip Fri, Skip Sat (checkboxes)
 * S: Skip Weekly Meeting (checkbox)
 * T: Skip Monthly Checklist (checkbox)
 * U: Last Updated
 * V: Work Schedule (hidden) - Current schedule type (Mon-Thu, Tue-Fri, Mon-Fri, Custom)
 * W: Skip Days (hidden) - Comma-separated list (e.g., "Sat,Sun,Fri")
 * X: Schedule Effective Date (hidden) - When current schedule started
 * Y: Schedule History (hidden) - JSON array of past schedules
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

  // Define headers - visible columns A-U, hidden columns V-Y
  // NEW STRUCTURE: Added 9 visible schedule columns (L-T) for Safety Compliance
  var headers = [
    'Job Number',           // A
    'Location',             // B
    'Foreman',              // C
    'Crew Size',            // D
    'Start Date',           // E
    'Put On Hold Date',     // F (for On Hold jobs)
    'Estimated Return',     // G (for On Hold jobs)
    'Est. End Date',        // H
    'Actual End Date',      // I
    'Status',               // J
    'Notes',                // K
    'Skip Sun',             // L (NEW - checkbox, default checked)
    'Skip Mon',             // M (NEW - checkbox)
    'Skip Tue',             // N (NEW - checkbox)
    'Skip Wed',             // O (NEW - checkbox)
    'Skip Thu',             // P (NEW - checkbox)
    'Skip Fri',             // Q (NEW - checkbox, default checked)
    'Skip Sat',             // R (NEW - checkbox, default checked)
    'Skip Weekly Meeting',  // S (NEW - checkbox)
    'Skip Monthly Checklist', // T (NEW - checkbox)
    'Last Updated',         // U
    'Work Schedule',        // V (hidden)
    'Skip Days',            // W (hidden)
    'Schedule Effective',   // X (hidden)
    'Schedule History',     // Y (hidden)
    'Job Name'              // Z (project/site name, distinct from Location city)
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
  sheet.setColumnWidth(6, 120);  // Put On Hold Date
  sheet.setColumnWidth(7, 120);  // Estimated Return
  sheet.setColumnWidth(8, 110);  // Est. End Date
  sheet.setColumnWidth(9, 110);  // Actual End Date
  sheet.setColumnWidth(10, 100); // Status
  sheet.setColumnWidth(11, 200); // Notes
  sheet.setColumnWidth(12, 70);  // Skip Sun (NEW)
  sheet.setColumnWidth(13, 70);  // Skip Mon (NEW)
  sheet.setColumnWidth(14, 70);  // Skip Tue (NEW)
  sheet.setColumnWidth(15, 70);  // Skip Wed (NEW)
  sheet.setColumnWidth(16, 70);  // Skip Thu (NEW)
  sheet.setColumnWidth(17, 70);  // Skip Fri (NEW)
  sheet.setColumnWidth(18, 70);  // Skip Sat (NEW)
  sheet.setColumnWidth(19, 100); // Skip Weekly Meeting (NEW)
  sheet.setColumnWidth(20, 120); // Skip Monthly Checklist (NEW)
  sheet.setColumnWidth(21, 140); // Last Updated
  sheet.setColumnWidth(22, 100); // Work Schedule (hidden)
  sheet.setColumnWidth(23, 120); // Skip Days (hidden)
  sheet.setColumnWidth(24, 130); // Schedule Effective (hidden)
  sheet.setColumnWidth(25, 200); // Schedule History (hidden)
  sheet.setColumnWidth(26, 200); // Job Name

  // Hide schedule history columns (V-Y = columns 22-25)
  sheet.hideColumns(22, 4);

  // Add checkboxes for skip day columns (L-T = columns 12-20)
  sheet.getRange(2, 12, 500, 9).insertCheckboxes();

  // Add data validation for Status column (J = column 10)
  var statusValues = ['Active', 'Pending Start', 'Completed', 'On Hold'];
  var statusRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(statusValues, true)
    .setAllowInvalid(false)
    .build();
  sheet.getRange(2, 10, 500, 1).setDataValidation(statusRule);

  // Add data validation for Work Schedule column (V = column 22)
  var scheduleValues = ['Mon-Thu', 'Tue-Fri', 'Mon-Fri', 'Custom'];
  var scheduleRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(scheduleValues, true)
    .setAllowInvalid(true)
    .build();
  sheet.getRange(2, 22, 500, 1).setDataValidation(scheduleRule);

  // Format date columns (E, F, G, H, I = 5, 6, 7, 8, 9)
  sheet.getRange(2, 5, 500, 5).setNumberFormat('mm/dd/yyyy');
  sheet.getRange(2, 21, 500, 1).setNumberFormat('mm/dd/yyyy hh:mm');  // Last Updated (U)
  sheet.getRange(2, 24, 500, 1).setNumberFormat('mm/dd/yyyy');  // Schedule Effective (X)

  // Add conditional formatting for Status column
  addJobTrackingConditionalFormatting(sheet);

  // Freeze header row
  sheet.setFrozenRows(1);

  // Add filter for visible columns A-U (21 columns)
  sheet.getRange(1, 1, 1, 21).createFilter();

  // Populate with current crews from Employees sheet
  populateJobTrackingFromEmployees(sheet);

  ui.alert(
    '✅ Job Tracking Sheet Created!',
    'The Job Tracking sheet has been set up.\n\n' +
    'Key Features:\n' +
    '• Start Date - When a job becomes active\n' +
    '• Put On Hold Date & Estimated Return - For On Hold jobs\n' +
    '• Est. End Date - Projected completion date\n' +
    '• Status - Active, Pending Start, Completed, On Hold\n' +
    '• Skip Day Checkboxes (L-R) - For Safety Compliance tracking\n' +
    '• Skip Weekly Meeting/Monthly Checklist (S-T)\n' +
    '• Default: Mon-Thu schedule (Sun/Fri/Sat skipped)\n\n' +
    'Jobs with "Pending Start" status will not have employees assigned yet.\n' +
    'Use "Mark Job Complete" to close out finished jobs.',
    ui.ButtonSet.OK
  );
}

/**
 * Migrates existing Job Tracking sheet to add "Put On Hold Date" and "Estimated Return" columns.
 * Inserts two new columns after Start Date (E), shifting existing columns F-N to the right.
 *
 * Old structure: A=Job#, B=Location, C=Foreman, D=Size, E=Start, F=Est.End, G=Actual End, H=Status, I=Notes, J=Updated, K-N=Hidden
 * New structure: A=Job#, B=Location, C=Foreman, D=Size, E=Start, F=OnHold, G=Return, H=Est.End, I=Actual End, J=Status, K=Notes, L=Updated, M-P=Hidden
 *
 * Called from: Glove Manager → 🔧 Utilities → Migrate Job Tracking Sheet
 */
function migrateJobTrackingSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var ui = SpreadsheetApp.getUi();

  var sheet = ss.getSheetByName('Job Tracking');
  if (!sheet) {
    ui.alert('❌ Not Found', 'Job Tracking sheet not found.\n\nRun "Setup Job Tracking Sheet" first.', ui.ButtonSet.OK);
    return;
  }

  // Check if migration is needed by looking at headers
  var headers = sheet.getRange(1, 1, 1, 16).getValues()[0];
  var header6 = String(headers[5] || '').trim().toLowerCase();

  // If column F is already "Put On Hold Date", migration is done
  if (header6 === 'put on hold date') {
    ui.alert('ℹ️ Already Migrated', 'The Job Tracking sheet already has the "Put On Hold Date" and "Estimated Return" columns.', ui.ButtonSet.OK);
    return;
  }

  // Confirm migration
  var confirmResponse = ui.alert(
    '⚠️ Migrate Job Tracking Sheet',
    'This will add two new columns to the Job Tracking sheet:\n\n' +
    '• "Put On Hold Date" (column F)\n' +
    '• "Estimated Return" (column G)\n\n' +
    'These columns will be used when jobs have Status = "On Hold".\n\n' +
    'Existing data will be preserved and shifted to the right.\n\n' +
    'Continue with migration?',
    ui.ButtonSet.YES_NO
  );

  if (confirmResponse !== ui.Button.YES) {
    return;
  }

  try {
    // Insert 2 new columns after column E (Start Date)
    // This will shift columns F and beyond to the right
    sheet.insertColumnsAfter(5, 2);

    // Set the new headers
    sheet.getRange(1, 6).setValue('Put On Hold Date');
    sheet.getRange(1, 7).setValue('Estimated Return');

    // Format header style for new columns
    var newHeaderRange = sheet.getRange(1, 6, 1, 2);
    newHeaderRange.setBackground('#1565c0');
    newHeaderRange.setFontColor('#ffffff');
    newHeaderRange.setFontWeight('bold');
    newHeaderRange.setHorizontalAlignment('center');

    // Set column widths
    sheet.setColumnWidth(6, 120);  // Put On Hold Date
    sheet.setColumnWidth(7, 120);  // Estimated Return

    // Format as dates
    var lastRow = Math.max(sheet.getLastRow(), 500);
    sheet.getRange(2, 6, lastRow - 1, 2).setNumberFormat('mm/dd/yyyy');

    // Update conditional formatting to use new column J for Status
    addJobTrackingConditionalFormatting(sheet);

    // Update data validation for Status column (now column J = 10)
    var statusValues = ['Active', 'Pending Start', 'Completed', 'On Hold'];
    var statusRule = SpreadsheetApp.newDataValidation()
      .requireValueInList(statusValues, true)
      .setAllowInvalid(false)
      .build();
    sheet.getRange(2, 10, 500, 1).setDataValidation(statusRule);

    // Update data validation for Work Schedule column (now column M = 13)
    var scheduleValues = ['Mon-Thu', 'Tue-Fri', 'Mon-Fri', 'Custom'];
    var scheduleRule = SpreadsheetApp.newDataValidation()
      .requireValueInList(scheduleValues, true)
      .setAllowInvalid(true)
      .build();
    sheet.getRange(2, 13, 500, 1).setDataValidation(scheduleRule);

    // Hide schedule columns (M-P = columns 13-16)
    sheet.hideColumns(13, 4);

    // Update the filter to include new columns
    var existingFilter = sheet.getFilter();
    if (existingFilter) {
      existingFilter.remove();
    }
    sheet.getRange(1, 1, 1, 12).createFilter();  // Filter visible columns A-L

    ui.alert(
      '✅ Migration Complete',
      'The Job Tracking sheet has been updated with:\n\n' +
      '• "Put On Hold Date" column (F)\n' +
      '• "Estimated Return" column (G)\n\n' +
      'When a job status is set to "On Hold", you can now track:\n' +
      '• When it was put on hold\n' +
      '• When it\'s expected to return\n\n' +
      'All existing data has been preserved.',
      ui.ButtonSet.OK
    );

  } catch (e) {
    ui.alert('❌ Migration Error', 'Error during migration:\n\n' + e.toString(), ui.ButtonSet.OK);
    Logger.log('migrateJobTrackingSheet error: ' + e.toString());
  }
}

/**
 * Migrates existing Job Tracking sheet to add 9 visible schedule columns (L-T) for Safety Compliance.
 * Also shifts hidden columns from M-P to V-Y.
 *
 * OLD STRUCTURE (12 visible + 4 hidden = 16 cols):
 *   A-K: Job Number through Notes
 *   L: Last Updated
 *   M-P: Hidden (Work Schedule, Skip Days, Schedule Effective, Schedule History)
 *
 * NEW STRUCTURE (21 visible + 4 hidden = 25 cols):
 *   A-K: Job Number through Notes (unchanged)
 *   L-R: Skip Sun, Skip Mon, Skip Tue, Skip Wed, Skip Thu, Skip Fri, Skip Sat (NEW checkboxes)
 *   S-T: Skip Weekly Meeting, Skip Monthly Checklist (NEW checkboxes)
 *   U: Last Updated (moved from L)
 *   V-Y: Hidden (Work Schedule, Skip Days, Schedule Effective, Schedule History) (moved from M-P)
 *
 * Called from: Glove Manager → 🔧 Maintenance → Migrate Job Tracking for Compliance
 */
function migrateJobTrackingForComplianceConfig() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var ui = SpreadsheetApp.getUi();

  var sheet = ss.getSheetByName('Job Tracking');
  if (!sheet) {
    ui.alert('❌ Not Found', 'Job Tracking sheet not found.\n\nRun "Setup Job Tracking Sheet" first.', ui.ButtonSet.OK);
    return;
  }

  // Check if migration is needed by looking at headers
  var headers = sheet.getRange(1, 1, 1, 25).getValues()[0];
  var header12 = String(headers[11] || '').trim().toLowerCase();

  // If column L is already "Skip Sun", migration is done
  if (header12 === 'skip sun') {
    ui.alert('ℹ️ Already Migrated', 'The Job Tracking sheet already has the Schedule Compliance columns (L-T).', ui.ButtonSet.OK);
    return;
  }

  // Confirm migration
  var confirmResponse = ui.alert(
    '⚠️ Migrate Job Tracking for Compliance Config',
    'This will add 9 new columns to the Job Tracking sheet for Safety Compliance tracking:\n\n' +
    '• Skip Sun, Skip Mon, Skip Tue, Skip Wed, Skip Thu, Skip Fri, Skip Sat (L-R)\n' +
    '• Skip Weekly Meeting, Skip Monthly Checklist (S-T)\n\n' +
    'Default schedule: Mon-Thu (Sun, Fri, Sat will be checked)\n\n' +
    'This replaces the need for the separate "Safety Compliance Config" sheet.\n\n' +
    'Continue with migration?',
    ui.ButtonSet.YES_NO
  );

  if (confirmResponse !== ui.Button.YES) {
    return;
  }

  try {
    // First, save any data from the old hidden columns (M-P = 13-16)
    var lastRow = sheet.getLastRow();
    var oldHiddenData = [];
    if (lastRow > 1) {
      // Check if old hidden columns exist (column M = 13)
      var maxCol = sheet.getLastColumn();
      if (maxCol >= 16) {
        oldHiddenData = sheet.getRange(2, 13, lastRow - 1, 4).getValues();
      }
    }

    // Insert 9 new columns after K (Notes = column 11)
    // This shifts everything from L onwards to the right
    sheet.insertColumnsAfter(11, 9);

    // Set new headers for columns L-T (12-20)
    var newHeaders = [
      'Skip Sun',             // L (12)
      'Skip Mon',             // M (13)
      'Skip Tue',             // N (14)
      'Skip Wed',             // O (15)
      'Skip Thu',             // P (16)
      'Skip Fri',             // Q (17)
      'Skip Sat',             // R (18)
      'Skip Weekly Meeting',  // S (19)
      'Skip Monthly Checklist' // T (20)
    ];
    sheet.getRange(1, 12, 1, 9).setValues([newHeaders]);

    // Format new header cells
    var newHeaderRange = sheet.getRange(1, 12, 1, 9);
    newHeaderRange.setBackground('#1565c0');
    newHeaderRange.setFontColor('#ffffff');
    newHeaderRange.setFontWeight('bold');
    newHeaderRange.setHorizontalAlignment('center');

    // Set column widths for new columns
    for (var col = 12; col <= 18; col++) {
      sheet.setColumnWidth(col, 70);  // Skip day columns
    }
    sheet.setColumnWidth(19, 100);  // Skip Weekly Meeting
    sheet.setColumnWidth(20, 120);  // Skip Monthly Checklist

    // Add checkboxes for the new columns
    if (lastRow > 1) {
      sheet.getRange(2, 12, lastRow - 1, 9).insertCheckboxes();

      // Set default values: Sun (L), Fri (Q), Sat (R) = checked (Mon-Thu schedule)
      var defaultSkipDays = [];
      for (var r = 0; r < lastRow - 1; r++) {
        defaultSkipDays.push([
          true,   // Skip Sun (L)
          false,  // Skip Mon (M)
          false,  // Skip Tue (N)
          false,  // Skip Wed (O)
          false,  // Skip Thu (P)
          true,   // Skip Fri (Q)
          true,   // Skip Sat (R)
          false,  // Skip Weekly Meeting (S)
          false   // Skip Monthly Checklist (T)
        ]);
      }
      sheet.getRange(2, 12, lastRow - 1, 9).setValues(defaultSkipDays);
    }

    // Columns have now shifted:
    // Old L (Last Updated, was col 12) is now U (col 21)
    // Old M-P (hidden, were cols 13-16) are now V-Y (cols 22-25)

    // Update Last Updated header (now column U = 21)
    sheet.getRange(1, 21).setValue('Last Updated');

    // Update hidden column headers (now V-Y = 22-25)
    sheet.getRange(1, 22, 1, 4).setValues([['Work Schedule', 'Skip Days', 'Schedule Effective', 'Schedule History']]);

    // Format hidden column headers
    var hiddenHeaderRange = sheet.getRange(1, 22, 1, 4);
    hiddenHeaderRange.setBackground('#1565c0');
    hiddenHeaderRange.setFontColor('#ffffff');
    hiddenHeaderRange.setFontWeight('bold');
    hiddenHeaderRange.setHorizontalAlignment('center');

    // Set column widths for shifted columns
    sheet.setColumnWidth(21, 140); // Last Updated
    sheet.setColumnWidth(22, 100); // Work Schedule
    sheet.setColumnWidth(23, 120); // Skip Days
    sheet.setColumnWidth(24, 130); // Schedule Effective
    sheet.setColumnWidth(25, 200); // Schedule History

    // Hide the schedule history columns (V-Y = 22-25)
    sheet.hideColumns(22, 4);

    // Add data validation for Work Schedule column (V = 22)
    var scheduleValues = ['Mon-Thu', 'Tue-Fri', 'Mon-Fri', 'Custom'];
    var scheduleRule = SpreadsheetApp.newDataValidation()
      .requireValueInList(scheduleValues, true)
      .setAllowInvalid(true)
      .build();
    sheet.getRange(2, 22, 500, 1).setDataValidation(scheduleRule);

    // Format date columns
    sheet.getRange(2, 21, 500, 1).setNumberFormat('mm/dd/yyyy hh:mm');  // Last Updated (U)
    sheet.getRange(2, 24, 500, 1).setNumberFormat('mm/dd/yyyy');  // Schedule Effective (X)

    // Update conditional formatting to span all 21 visible columns
    addJobTrackingConditionalFormatting(sheet);

    // Update filter
    var existingFilter = sheet.getFilter();
    if (existingFilter) {
      existingFilter.remove();
    }
    sheet.getRange(1, 1, 1, 21).createFilter();  // Filter visible columns A-U

    ui.alert(
      '✅ Migration Complete',
      'The Job Tracking sheet has been updated with Safety Compliance columns:\n\n' +
      '• Skip Sun through Skip Sat (columns L-R) - checkboxes\n' +
      '• Skip Weekly Meeting, Skip Monthly Checklist (S-T) - checkboxes\n\n' +
      'Default schedule set to Mon-Thu (Sun, Fri, Sat are checked to skip).\n\n' +
      'You can now manage crew schedules directly in Job Tracking.\n' +
      'The separate "Safety Compliance Config" sheet is no longer needed.',
      ui.ButtonSet.OK
    );

    Logger.log('migrateJobTrackingForComplianceConfig: Migration complete for ' + (lastRow - 1) + ' crews');

  } catch (e) {
    ui.alert('❌ Migration Error', 'Error during migration:\n\n' + e.toString(), ui.ButtonSet.OK);
    Logger.log('migrateJobTrackingForComplianceConfig error: ' + e.toString());
  }
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
  var numCols = 21; // All visible columns A-U
  var range = sheet.getRange(2, 1, lastRow - 1, numCols);

  // Status column is J (column 10)
  // Formula references $J2 to check status for each row

  // Rule 1: Completed = Grey (#e0e0e0)
  var completedRule = SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied('=$J2="Completed"')
    .setBackground('#e0e0e0')
    .setFontColor('#757575')
    .setRanges([range])
    .build();
  newRules.push(completedRule);

  // Rule 2: Active = Light Green (#c8e6c9)
  var activeRule = SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied('=$J2="Active"')
    .setBackground('#c8e6c9')
    .setRanges([range])
    .build();
  newRules.push(activeRule);

  // Rule 3: Pending Start = Light Yellow (#fff9c4)
  var pendingRule = SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied('=$J2="Pending Start"')
    .setBackground('#fff9c4')
    .setRanges([range])
    .build();
  newRules.push(pendingRule);

  // Rule 4: On Hold = Light Orange (#ffe0b2)
  var onHoldRule = SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied('=$J2="On Hold"')
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
 * Refreshes the Foreman column in Job Tracking sheet by determining the crew lead
 * for each job from the Employees sheet using the classification hierarchy.
 *
 * Called from: Glove Manager → 📥 Import Crew Makeup → 🔧 Utilities → 🔄 Refresh Job Tracking Foremen
 */
function refreshJobTrackingForemen() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var ui = SpreadsheetApp.getUi();

  var jobSheet = ss.getSheetByName('Job Tracking');
  if (!jobSheet) {
    ui.alert('❌ Error', 'Job Tracking sheet not found.\n\nRun "Setup Job Tracking Sheet" first.', ui.ButtonSet.OK);
    return;
  }

  var employeesSheet = ss.getSheetByName('Employees');
  if (!employeesSheet) {
    ui.alert('❌ Error', 'Employees sheet not found!', ui.ButtonSet.OK);
    return;
  }

  // Get Job Tracking data
  var jobData = jobSheet.getDataRange().getValues();

  // Get Employees data
  var empData = employeesSheet.getDataRange().getValues();
  var empHeaders = empData[0];

  // Find employee columns
  var nameCol = -1, jobNumCol = -1, classificationCol = -1, lastDayCol = -1;
  for (var h = 0; h < empHeaders.length; h++) {
    var header = String(empHeaders[h]).toLowerCase().trim();
    if (header === 'name') nameCol = h;
    if (header === 'job number') jobNumCol = h;
    if (header === 'job classification') classificationCol = h;
    if (header === 'last day') lastDayCol = h;
  }

  if (nameCol === -1 || jobNumCol === -1) {
    ui.alert('❌ Error', 'Could not find Name or Job Number columns in Employees sheet!', ui.ButtonSet.OK);
    return;
  }

  // Classification hierarchy (lower number = higher priority)
  var classificationPriority = {
    'F': 1,        // Foreman - Primary crew lead
    'GTO F': 2,    // Gas Tech Operator - Foreman
    'GF': 3,       // General Foreman
    'SUP': 4,      // Superintendent
    'JRY': 5,      // Journeyman Lineman
    'JRY OP': 6,   // Journeyman Operator
    'WT': 7,       // Working Technician
    'GTO': 8,      // Gas Tech Operator
    'EO 1': 9,     // Equipment Operator 1
    'EO 2': 10,    // Equipment Operator 2
    'AP 7': 11,    // 7th Year Apprentice (most senior apprentice)
    'AP 6': 12,
    'AP 5': 13,
    'AP 4': 14,
    'AP 3': 15,
    'AP 2': 16,
    'AP 1': 17     // 1st Year Apprentice (least senior)
  };

  // Build crew lead map from Employees
  var crewLeadMap = {}; // { crewNumber: { name, priority } }

  for (var i = 1; i < empData.length; i++) {
    var row = empData[i];
    var name = String(row[nameCol] || '').trim();
    var jobNumber = String(row[jobNumCol] || '').trim();
    var classification = classificationCol !== -1 ? String(row[classificationCol] || '').trim() : '';
    var lastDay = lastDayCol !== -1 ? row[lastDayCol] : '';

    if (!name || !jobNumber || lastDay) continue;

    // Extract crew number (e.g., "013-26.1" → "013-26")
    var crewNumber = jobNumber;
    var dotIndex = jobNumber.lastIndexOf('.');
    if (dotIndex !== -1) {
      crewNumber = jobNumber.substring(0, dotIndex);
    }

    if (!/^\d{3}-\d{2}$/.test(crewNumber)) continue;

    var priority = classificationPriority[classification] || 999;

    if (!crewLeadMap[crewNumber] || priority < crewLeadMap[crewNumber].priority) {
      crewLeadMap[crewNumber] = { name: name, priority: priority, classification: classification };
    }
  }

  // Update Job Tracking foreman column
  var updatedCount = 0;
  var changedJobs = [];

  for (var j = 1; j < jobData.length; j++) {
    var jobNum = String(jobData[j][0] || '').trim();
    var currentForeman = String(jobData[j][2] || '').trim();  // Foreman is column C (index 2)

    if (!jobNum) continue;

    var crewLead = crewLeadMap[jobNum];
    if (crewLead && crewLead.name !== currentForeman) {
      jobSheet.getRange(j + 1, 3).setValue(crewLead.name);  // Column C = Foreman
      changedJobs.push(jobNum + ': ' + (currentForeman || '(none)') + ' → ' + crewLead.name + ' (' + crewLead.classification + ')');
      updatedCount++;
    }
  }

  if (updatedCount === 0) {
    ui.alert('ℹ️ No Changes', 'All Job Tracking foremen are already correct.', ui.ButtonSet.OK);
  } else {
    var message = '✅ Updated ' + updatedCount + ' foreman(s):\n\n';
    message += changedJobs.slice(0, 10).join('\n');
    if (changedJobs.length > 10) {
      message += '\n... and ' + (changedJobs.length - 10) + ' more';
    }
    ui.alert('✅ Foremen Updated', message, ui.ButtonSet.OK);
  }

  Logger.log('refreshJobTrackingForemen: Updated ' + updatedCount + ' foremen: ' + changedJobs.join(', '));
}

/**
 * Silent version of refreshJobTrackingForemen for batch operations.
 * Returns result object instead of showing alerts.
 *
 * Called from: generateAllReports()
 * @return {Object} { updatedCount, changedJobs }
 */
function refreshJobTrackingForemenSilent() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  var jobSheet = ss.getSheetByName('Job Tracking');
  if (!jobSheet) {
    return { updatedCount: 0, changedJobs: [], error: 'Job Tracking sheet not found' };
  }

  var employeesSheet = ss.getSheetByName('Employees');
  if (!employeesSheet) {
    return { updatedCount: 0, changedJobs: [], error: 'Employees sheet not found' };
  }

  // Get Job Tracking data
  var jobData = jobSheet.getDataRange().getValues();

  // Get Employees data
  var empData = employeesSheet.getDataRange().getValues();
  var empHeaders = empData[0];

  // Find employee columns
  var nameCol = -1, jobNumCol = -1, classificationCol = -1, lastDayCol = -1;
  for (var h = 0; h < empHeaders.length; h++) {
    var header = String(empHeaders[h]).toLowerCase().trim();
    if (header === 'name') nameCol = h;
    if (header === 'job number') jobNumCol = h;
    if (header === 'job classification') classificationCol = h;
    if (header === 'last day') lastDayCol = h;
  }

  if (nameCol === -1 || jobNumCol === -1) {
    return { updatedCount: 0, changedJobs: [], error: 'Could not find Name or Job Number columns' };
  }

  // Classification hierarchy (lower number = higher priority)
  // Must match syncCrews() and getCrewLead() hierarchy: SUP > GF > F > GTO F
  var classificationPriority = {
    'SUP': 1, 'GF': 2, 'F': 3, 'GTO F': 4, 'JRY': 5, 'JRY OP': 6,
    'WT': 7, 'GTO': 8, 'EO 1': 9, 'EO 2': 10,
    'AP 7': 11, 'AP 6': 12, 'AP 5': 13, 'AP 4': 14, 'AP 3': 15, 'AP 2': 16, 'AP 1': 17
  };

  // Build crew lead map from Employees
  var crewLeadMap = {};

  for (var i = 1; i < empData.length; i++) {
    var row = empData[i];
    var name = String(row[nameCol] || '').trim();
    var jobNumber = String(row[jobNumCol] || '').trim();
    var classification = classificationCol !== -1 ? String(row[classificationCol] || '').trim() : '';
    var lastDay = lastDayCol !== -1 ? row[lastDayCol] : '';

    if (!name || !jobNumber || lastDay) continue;

    var crewNumber = jobNumber;
    var dotIndex = jobNumber.lastIndexOf('.');
    if (dotIndex !== -1) {
      crewNumber = jobNumber.substring(0, dotIndex);
    }

    if (!/^\d{3}-\d{2}$/.test(crewNumber)) continue;

    var priority = classificationPriority[classification] || 999;

    if (!crewLeadMap[crewNumber] || priority < crewLeadMap[crewNumber].priority) {
      crewLeadMap[crewNumber] = { name: name, priority: priority, classification: classification };
    }
  }

  // Update Job Tracking foreman column
  var updatedCount = 0;
  var changedJobs = [];

  for (var j = 1; j < jobData.length; j++) {
    var jobNum = String(jobData[j][0] || '').trim();
    var currentForeman = String(jobData[j][2] || '').trim();

    if (!jobNum) continue;

    var crewLead = crewLeadMap[jobNum];
    if (crewLead && crewLead.name !== currentForeman) {
      jobSheet.getRange(j + 1, 3).setValue(crewLead.name);
      changedJobs.push(jobNum + ': ' + crewLead.name);
      updatedCount++;
    }
  }

  Logger.log('refreshJobTrackingForemenSilent: Updated ' + updatedCount + ' foremen');
  return { updatedCount: updatedCount, changedJobs: changedJobs };
}

/**
 * Updates the Location column data validation on the Employees sheet to include new locations.
 * This ensures that when Crew Import tries to assign employees to new locations, it won't fail.
 *
 * Called from: Glove Manager → 🔧 Maintenance → 🔧 Employees → 📍 Update Location Validation
 */
function updateEmployeesLocationValidation() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var ui = SpreadsheetApp.getUi();

  var employeesSheet = ss.getSheetByName('Employees');
  if (!employeesSheet) {
    ui.alert('❌ Error', 'Employees sheet not found!', ui.ButtonSet.OK);
    return;
  }

  // Complete list of valid locations (including new ones)
  var validLocations = [
    'Anaconda',
    'Anaconda City Sub',
    'Big Sky',
    'Billings',
    'Bozeman',
    'Butte',
    'CA Sub',
    'California',
    'Elliston',
    'Ennis',
    'Glendive',
    'Gold Creek',
    'Great Falls',
    'Helena',
    'Kalispell',
    'Leave',
    'Light Duty',
    'Livingston',
    'Lolo',
    'Miles City',
    'Missoula',
    'Northern Lights',
    'Rapelje',
    'Rattlesnake Sub',
    'Sidney',
    'South Dakota',
    'South Dakota Dock',
    'Stanford',
    'Texas',
    'Three Rivers Sub',
    'Vacation',
    'Weeds',
    'Previous Employee'
  ].sort();

  // Find the Location column
  var headers = employeesSheet.getRange(1, 1, 1, employeesSheet.getLastColumn()).getValues()[0];
  var locationCol = -1;
  for (var h = 0; h < headers.length; h++) {
    if (String(headers[h]).toLowerCase().trim() === 'location') {
      locationCol = h + 1;  // 1-based column number
      break;
    }
  }

  if (locationCol === -1) {
    ui.alert('❌ Error', 'Location column not found in Employees sheet!', ui.ButtonSet.OK);
    return;
  }

  // Create the new validation rule
  var rule = SpreadsheetApp.newDataValidation()
    .requireValueInList(validLocations, true)
    .setAllowInvalid(false)
    .build();

  // Apply to the Location column (from row 2 to 500)
  var lastRow = Math.max(employeesSheet.getLastRow(), 500);
  employeesSheet.getRange(2, locationCol, lastRow - 1, 1).setDataValidation(rule);

  ui.alert('✅ Location Validation Updated',
    'The Location column now accepts the following ' + validLocations.length + ' locations:\n\n' +
    validLocations.slice(0, 15).join(', ') + '...\n\n' +
    'New locations added:\n• Anaconda City Sub\n• Rattlesnake Sub\n• Texas\n• Three Rivers Sub',
    ui.ButtonSet.OK);

  Logger.log('updateEmployeesLocationValidation: Applied validation with ' + validLocations.length + ' locations');
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

    // Filter out status locations (Vacation, Light Duty, Weeds, Leave, etc.)
    var isRealLocation = location && !isStatusLocation(location);

    if (!crewMap[crewNumber]) {
      crewMap[crewNumber] = {
        location: isRealLocation ? location : '',
        foreman: '',
        crewSize: 0,
        employees: []
      };
    }

    crewMap[crewNumber].crewSize++;
    crewMap[crewNumber].employees.push(name);

    // Update location if not set (skip status locations)
    if (!crewMap[crewNumber].location && isRealLocation) {
      crewMap[crewNumber].location = location;
    }

    // Check if this employee is a foreman (using classification hierarchy)
    if (classification === 'F' || classification === 'GTO F' || classification === 'GF' || classification === 'SUP') {
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
      crewNum,                    // Job Number (A)
      crew.location || 'Unknown', // Location (B)
      crew.foreman || '',         // Foreman (C)
      crew.crewSize,              // Crew Size (D)
      '',                         // Start Date (E) - to be filled in
      '',                         // Put On Hold Date (F)
      '',                         // Estimated Return (G)
      '',                         // Est. End Date (H) - to be filled in
      '',                         // Actual End Date (I)
      'Active',                   // Status (J) - default to Active for existing crews
      '',                         // Notes (K)
      true,                       // Skip Sun (L) - DEFAULT CHECKED (Mon-Thu schedule)
      false,                      // Skip Mon (M)
      false,                      // Skip Tue (N)
      false,                      // Skip Wed (O)
      false,                      // Skip Thu (P)
      true,                       // Skip Fri (Q) - DEFAULT CHECKED (Mon-Thu schedule)
      true,                       // Skip Sat (R) - DEFAULT CHECKED (Mon-Thu schedule)
      false,                      // Skip Weekly Meeting (S)
      false,                      // Skip Monthly Checklist (T)
      timestamp                   // Last Updated (U)
    ]);
  }

  if (dataRows.length > 0) {
    sheet.getRange(2, 1, dataRows.length, 21).setValues(dataRows);
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
  // Columns: A=Job Number(0), B=Location(1), C=Foreman(2), D=Crew Size(3), E=Start Date(4),
  //          F=Put On Hold Date(5), G=Estimated Return(6), H=Est. End Date(7), I=Actual End Date(8),
  //          J=Status(9), K=Notes(10), L-R=Skip Days(11-17), S-T=Skip Flags(18-19), U=Last Updated(20)
  var existingJobs = {};
  for (var j = 1; j < jobData.length; j++) {
    var jobNum = String(jobData[j][0] || '').trim();
    if (jobNum) {
      existingJobs[jobNum] = {
        rowIndex: j + 1,
        startDate: jobData[j][4],
        putOnHoldDate: jobData[j][5],
        estimatedReturn: jobData[j][6],
        estEndDate: jobData[j][7],
        actualEndDate: jobData[j][8],
        status: jobData[j][9] || 'Active',
        notes: jobData[j][10] || ''
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

    // Filter out status locations (Vacation, Light Duty, Weeds, Leave, etc.)
    // These are employee statuses, not physical cities - should not appear in Job Tracking
    var isRealLocation = location && !isStatusLocation(location);

    if (!crewMap[crewNumber]) {
      crewMap[crewNumber] = {
        location: isRealLocation ? location : '',
        foreman: '',
        crewSize: 0
      };
    }

    crewMap[crewNumber].crewSize++;

    if (!crewMap[crewNumber].location && isRealLocation) {
      crewMap[crewNumber].location = location;
    }

    if (classification === 'F' || classification === 'GTO F' || classification === 'GF' || classification === 'SUP') {
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

      jobSheet.getRange(rowIdx, 2).setValue(crew.location || 'Unknown');  // Location (B)
      jobSheet.getRange(rowIdx, 3).setValue(crew.foreman || '');          // Foreman (C)
      jobSheet.getRange(rowIdx, 4).setValue(crew.crewSize);               // Crew Size (D)
      jobSheet.getRange(rowIdx, 21).setValue(timestamp);                  // Last Updated (U)

      updatedCount++;
      delete existingJobs[crewNum]; // Mark as processed
    } else {
      // New crew - 21 columns (A-U)
      newRows.push([
        crewNum,                    // Job Number (A)
        crew.location || 'Unknown', // Location (B)
        crew.foreman || '',         // Foreman (C)
        crew.crewSize,              // Crew Size (D)
        '',                         // Start Date (E)
        '',                         // Put On Hold Date (F)
        '',                         // Estimated Return (G)
        '',                         // Est. End Date (H)
        '',                         // Actual End Date (I)
        'Active',                   // Status (J)
        'New crew added ' + Utilities.formatDate(timestamp, Session.getScriptTimeZone(), 'MM/dd/yyyy'), // Notes (K)
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

  // Check for crews with no active employees (may need to be marked completed)
  for (var oldCrew in existingJobs) {
    var oldData = existingJobs[oldCrew];
    if (oldData.status !== 'Completed') {
      // Update note about no active employees
      var currentNotes = oldData.notes || '';
      var noEmpNote = 'No active employees as of ' + Utilities.formatDate(timestamp, Session.getScriptTimeZone(), 'MM/dd/yyyy');
      if (currentNotes.indexOf('No active employees') === -1) {
        jobSheet.getRange(oldData.rowIndex, 11).setValue(currentNotes ? currentNotes + '; ' + noEmpNote : noEmpNote);  // Notes (K)
      }
      noEmployeesCount++;
    }
  }

  // Add new rows
  if (newRows.length > 0) {
    var lastRow = jobSheet.getLastRow();
    jobSheet.getRange(lastRow + 1, 1, newRows.length, 21).setValues(newRows);
    // Add checkboxes for skip day columns (L-T = cols 12-20) on new rows
    jobSheet.getRange(lastRow + 1, 12, newRows.length, 9).insertCheckboxes();
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
 * Syncs crews between Employees sheet and Job Tracking.
 * - Auto-creates Job Tracking if missing
 * - Updates foreman names using getCrewLead() logic (classification hierarchy + Crew Lead column)
 * - Sets default schedule (Mon-Thu) for crews missing schedule settings
 * - Can be called after Import Crew Makeup
 *
 * Called from: Quick Actions Step 2, Menu, or after Crew Import
 *
 * @param {boolean} silent - If true, suppresses UI alerts (for batch mode)
 * @returns {Object} Summary of changes made
 */
function syncCrews(silent) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var ui = silent ? null : SpreadsheetApp.getUi();

  Logger.log('syncCrews: Starting crew sync...');

  // Check if Job Tracking sheet exists
  var jobSheet = ss.getSheetByName('Job Tracking');
  if (!jobSheet) {
    Logger.log('syncCrews: Job Tracking sheet not found, creating it...');
    // Auto-create Job Tracking sheet
    setupJobTrackingSheet();
    jobSheet = ss.getSheetByName('Job Tracking');
    if (!jobSheet) {
      if (!silent) {
        ui.alert('❌ Error', 'Could not create Job Tracking sheet.', ui.ButtonSet.OK);
      }
      return { success: false, error: 'Could not create Job Tracking sheet' };
    }
  }

  // Check if the new schedule columns exist (column L should be "Skip Sun")
  var headers = jobSheet.getRange(1, 1, 1, 25).getValues()[0];
  var skipSunCol = headers.indexOf('Skip Sun');

  if (skipSunCol === -1) {
    // Need to run migration first
    if (!silent) {
      var response = ui.alert(
        '⚠️ Migration Required',
        'The Job Tracking sheet needs to be migrated to add Schedule Compliance columns.\n\n' +
        'Would you like to run the migration now?',
        ui.ButtonSet.YES_NO
      );
      if (response === ui.Button.YES) {
        migrateJobTrackingForComplianceConfig();
        // Refresh headers after migration
        headers = jobSheet.getRange(1, 1, 1, 25).getValues()[0];
        skipSunCol = headers.indexOf('Skip Sun');
      } else {
        return { success: false, error: 'Migration required but declined' };
      }
    } else {
      Logger.log('syncCrews: Migration required - skipping in silent mode');
      return { success: false, error: 'Migration required' };
    }
  }

  // Get Employees sheet
  var employeesSheet = ss.getSheetByName('Employees');
  if (!employeesSheet) {
    if (!silent) {
      ui.alert('❌ Error', 'Employees sheet not found!', ui.ButtonSet.OK);
    }
    return { success: false, error: 'Employees sheet not found' };
  }

  // Read Job Tracking data
  var jobData = jobSheet.getDataRange().getValues();
  var jobHeaders = jobData[0];

  // Find column indices - NEW STRUCTURE
  var colIndices = {
    jobNumber: 0,     // A
    location: 1,      // B
    foreman: 2,       // C
    crewSize: 3,      // D
    status: 9,        // J
    skipSun: 11,      // L
    skipMon: 12,      // M
    skipTue: 13,      // N
    skipWed: 14,      // O
    skipThu: 15,      // P
    skipFri: 16,      // Q
    skipSat: 17,      // R
    skipWeeklyMeeting: 18,  // S
    skipMonthlyChecklist: 19, // T
    lastUpdated: 20   // U
  };

  // Build existing jobs map
  var existingJobs = {};
  for (var j = 1; j < jobData.length; j++) {
    var jobNum = String(jobData[j][0] || '').trim();
    if (jobNum) {
      existingJobs[jobNum] = {
        rowIndex: j + 1,
        foreman: jobData[j][colIndices.foreman] || '',
        status: jobData[j][colIndices.status] || 'Active',
        hasSkipDays: jobData[j][colIndices.skipSun] !== '' && jobData[j][colIndices.skipSun] !== undefined
      };
    }
  }

  // Read Employees sheet to build current crew data
  var empData = employeesSheet.getDataRange().getValues();
  var empHeaders = empData[0];

  // Find employee columns
  var nameCol = -1, jobNumCol = -1, locationCol = -1, classificationCol = -1, lastDayCol = -1, crewLeadCol = -1;
  for (var h = 0; h < empHeaders.length; h++) {
    var header = String(empHeaders[h]).toLowerCase().trim();
    if (header === 'name') nameCol = h;
    if (header === 'job number') jobNumCol = h;
    if (header === 'location') locationCol = h;
    if (header === 'job classification') classificationCol = h;
    if (header === 'last day') lastDayCol = h;
    if (header === 'crew lead') crewLeadCol = h;
  }

  if (jobNumCol === -1) {
    if (!silent) {
      ui.alert('❌ Error', 'Job Number column not found in Employees sheet!', ui.ButtonSet.OK);
    }
    return { success: false, error: 'Job Number column not found' };
  }

  // Classification hierarchy (lower number = higher priority)
  var classificationPriority = {
    'SUP': 1, 'GF': 2, 'F': 3, 'GTO F': 4, 'JRY': 5, 'JRY OP': 6,
    'WT': 7, 'GTO': 8, 'EO 1': 9, 'EO 2': 10,
    'AP 7': 11, 'AP 6': 12, 'AP 5': 13, 'AP 4': 14, 'AP 3': 15, 'AP 2': 16, 'AP 1': 17
  };

  // Build crew map from Employees
  var crewMap = {};
  for (var i = 1; i < empData.length; i++) {
    var row = empData[i];
    var jobNumber = String(row[jobNumCol] || '').trim();
    var lastDay = lastDayCol !== -1 ? row[lastDayCol] : '';

    if (!jobNumber || lastDay) continue;

    // Extract crew number
    var crewNumber = jobNumber;
    var dotIndex = jobNumber.lastIndexOf('.');
    if (dotIndex !== -1) {
      crewNumber = jobNumber.substring(0, dotIndex);
    }

    // Validate format
    if (!/^\d{3}-\d{2}$/.test(crewNumber)) continue;
    if (crewNumber.startsWith('000-') || crewNumber.startsWith('002-')) continue;

    var name = nameCol !== -1 ? String(row[nameCol] || '').trim() : '';
    var location = locationCol !== -1 ? String(row[locationCol] || '').trim() : '';
    var classification = classificationCol !== -1 ? String(row[classificationCol] || '').trim() : '';
    var isManualLead = crewLeadCol !== -1 &&
      (String(row[crewLeadCol] || '').toLowerCase() === 'yes' ||
       String(row[crewLeadCol] || '').toLowerCase() === 'true' ||
       row[crewLeadCol] === true);

    // Filter out status locations (Vacation, Light Duty, Weeds, Leave, etc.)
    var isRealLocation = location && !isStatusLocation(location);

    if (!crewMap[crewNumber]) {
      crewMap[crewNumber] = {
        location: isRealLocation ? location : '',
        foreman: '',
        foremanPriority: 999,
        manualLead: null,
        crewSize: 0
      };
    }

    crewMap[crewNumber].crewSize++;

    if (!crewMap[crewNumber].location && isRealLocation) {
      crewMap[crewNumber].location = location;
    }

    // Track manual lead (highest priority)
    if (isManualLead) {
      crewMap[crewNumber].manualLead = name;
    }

    // Track best classification-based lead
    var priority = classificationPriority[classification] || 999;
    if (priority < crewMap[crewNumber].foremanPriority) {
      crewMap[crewNumber].foremanPriority = priority;
      crewMap[crewNumber].foreman = name;
    }
  }

  // Finalize foreman for each crew (manual lead takes priority)
  for (var crew in crewMap) {
    if (crewMap[crew].manualLead) {
      crewMap[crew].foreman = crewMap[crew].manualLead;
    }
  }

  // Now sync to Job Tracking - track which crews we've seen
  var timestamp = new Date();
  var foremanUpdates = 0;
  var scheduleDefaults = 0;
  var processedCrews = {};
  var jobDataModified = false; // BATCH: Track if jobData was modified

  for (var crewNum in crewMap) {
    var crew = crewMap[crewNum];
    processedCrews[crewNum] = true;

    if (existingJobs[crewNum]) {
      // Update existing row - BATCH: modify in memory instead of individual setValue
      var existing = existingJobs[crewNum];
      var dataIdx = existing.rowIndex - 1; // Array index into jobData[]

      // Update foreman if different
      if (existing.foreman !== crew.foreman && crew.foreman) {
        jobData[dataIdx][colIndices.foreman] = crew.foreman;
        foremanUpdates++;
        jobDataModified = true;
        Logger.log('syncCrews: Updated foreman for ' + crewNum + ': ' + existing.foreman + ' → ' + crew.foreman);
      }

      // Set default schedule if not set (empty or undefined)
      if (!existing.hasSkipDays) {
        // Set Mon-Thu default: Sun=true, Mon=false, Tue=false, Wed=false, Thu=false, Fri=true, Sat=true
        jobData[dataIdx][colIndices.skipSun] = true;
        jobData[dataIdx][colIndices.skipMon] = false;
        jobData[dataIdx][colIndices.skipTue] = false;
        jobData[dataIdx][colIndices.skipWed] = false;
        jobData[dataIdx][colIndices.skipThu] = false;
        jobData[dataIdx][colIndices.skipFri] = true;
        jobData[dataIdx][colIndices.skipSat] = true;
        jobData[dataIdx][colIndices.skipWeeklyMeeting] = false;
        jobData[dataIdx][colIndices.skipMonthlyChecklist] = false;
        scheduleDefaults++;
        jobDataModified = true;
        Logger.log('syncCrews: Set default schedule (Mon-Thu) for ' + crewNum);
      }

      // Update Last Updated
      jobData[dataIdx][colIndices.lastUpdated] = timestamp;
      jobDataModified = true;
    }
  }

  // ========== BATCH WRITE: Write modified columns back to Job Tracking sheet ==========
  if (jobDataModified) {
    // Write Foreman (C) column
    var foremanValues = jobData.map(function(row) { return [row[colIndices.foreman]]; });
    jobSheet.getRange(1, colIndices.foreman + 1, jobData.length, 1).setValues(foremanValues);

    // Write Schedule columns (L-T, 9 columns)
    var scheduleValues = jobData.map(function(row) {
      return [
        row[colIndices.skipSun], row[colIndices.skipMon], row[colIndices.skipTue],
        row[colIndices.skipWed], row[colIndices.skipThu], row[colIndices.skipFri],
        row[colIndices.skipSat], row[colIndices.skipWeeklyMeeting], row[colIndices.skipMonthlyChecklist]
      ];
    });
    jobSheet.getRange(1, colIndices.skipSun + 1, jobData.length, 9).setValues(scheduleValues);

    // Write Last Updated (U) column
    var lastUpdatedValues = jobData.map(function(row) { return [row[colIndices.lastUpdated]]; });
    jobSheet.getRange(1, colIndices.lastUpdated + 1, jobData.length, 1).setValues(lastUpdatedValues);

    Logger.log('syncCrews: Batch wrote Foreman, Schedule, and Last Updated columns (' + jobData.length + ' rows)');
  }

  // Add new crews that weren't in Job Tracking
  var newCrewRows = [];
  for (var cn in crewMap) {
    if (!existingJobs[cn]) {
      var crewData = crewMap[cn];
      newCrewRows.push([
        cn,                         // Job Number (A)
        crewData.location || 'Unknown', // Location (B)
        crewData.foreman || '',     // Foreman (C)
        crewData.crewSize,          // Crew Size (D)
        '',                         // Start Date (E)
        '',                         // Put On Hold Date (F)
        '',                         // Estimated Return (G)
        '',                         // Est. End Date (H)
        '',                         // Actual End Date (I)
        'Active',                   // Status (J)
        'Added by syncCrews ' + Utilities.formatDate(timestamp, Session.getScriptTimeZone(), 'MM/dd/yyyy'), // Notes (K)
        true,                       // Skip Sun (L)
        false,                      // Skip Mon (M)
        false,                      // Skip Tue (N)
        false,                      // Skip Wed (O)
        false,                      // Skip Thu (P)
        true,                       // Skip Fri (Q)
        true,                       // Skip Sat (R)
        false,                      // Skip Weekly Meeting (S)
        false,                      // Skip Monthly Checklist (T)
        timestamp                   // Last Updated (U)
      ]);
    }
  }

  if (newCrewRows.length > 0) {
    var lastRow = jobSheet.getLastRow();
    jobSheet.getRange(lastRow + 1, 1, newCrewRows.length, 21).setValues(newCrewRows);
    // Add checkboxes for new rows
    jobSheet.getRange(lastRow + 1, 12, newCrewRows.length, 9).insertCheckboxes();
    Logger.log('syncCrews: Added ' + newCrewRows.length + ' new crews');
  }

  var summary = {
    success: true,
    foremanUpdates: foremanUpdates,
    scheduleDefaults: scheduleDefaults,
    newCrews: newCrewRows.length
  };

  Logger.log('syncCrews: Complete - ' + foremanUpdates + ' foreman updates, ' +
             scheduleDefaults + ' schedule defaults, ' + newCrewRows.length + ' new crews');

  if (!silent) {
    ui.alert(
      '✅ Crew Sync Complete',
      'Results:\n\n' +
      '• Foreman updates: ' + foremanUpdates + '\n' +
      '• Schedule defaults applied: ' + scheduleDefaults + '\n' +
      '• New crews added: ' + newCrewRows.length + '\n\n' +
      'Job Tracking is now in sync with Employees sheet.',
      ui.ButtonSet.OK
    );
  }

  return summary;
}

/**
 * Menu function for syncCrews
 */
function menuSyncCrews() {
  syncCrews(false);
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

  // Check current status (Status is now column J = index 9)
  var currentStatus = jobData[foundRow - 1][9];
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

  // Update the row (new column positions)
  var today = new Date();
  jobSheet.getRange(foundRow, 9).setValue(today);        // Actual End Date (I)
  jobSheet.getRange(foundRow, 10).setValue('Completed'); // Status (J)
  jobSheet.getRange(foundRow, 21).setValue(today);       // Last Updated (U)

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
    'Add Future Job - Step 1',
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
    'Add Future Job - Step 2',
    'Enter the location for job "' + jobNumber + '":',
    ui.ButtonSet.OK_CANCEL
  );

  if (locationResponse.getSelectedButton() !== ui.Button.OK) return;

  var location = locationResponse.getResponseText().trim();

  // Check if location exists in Locations sheet — if not, collect details
  var locCheck = checkLocationExists(location);
  if (!locCheck.exists) {
    // Step 2b: Drive time
    var driveTimeResponse = ui.prompt(
      '📍 New Location: ' + location + ' (Step 1/3)',
      '"' + location + '" is not in the Locations sheet.\n\n' +
      'Enter the drive time from Helena in minutes:\n' +
      '(e.g., 90 for 1.5 hours, 120 for 2 hours)',
      ui.ButtonSet.OK_CANCEL
    );
    if (driveTimeResponse.getSelectedButton() !== ui.Button.OK) return;
    var driveTime = parseInt(driveTimeResponse.getResponseText().trim(), 10);
    if (isNaN(driveTime) || driveTime < 0) {
      ui.alert('❌ Invalid Drive Time', 'Please enter a number of minutes (e.g., 90).', ui.ButtonSet.OK);
      return;
    }

    // Step 2c: Direction
    var directionResponse = ui.prompt(
      '📍 New Location: ' + location + ' (Step 2/3)',
      'Enter the direction from Helena:\n\n' +
      'Options: East, North, West, Southwest, Northwest, Far\n\n' +
      '(e.g., "Southwest" for Butte area, "East" for Bozeman area)',
      ui.ButtonSet.OK_CANCEL
    );
    if (directionResponse.getSelectedButton() !== ui.Button.OK) return;
    var direction = directionResponse.getResponseText().trim();
    var validDirections = ['East', 'North', 'West', 'Southwest', 'Northwest', 'Far'];
    // Case-insensitive match
    var matchedDirection = '';
    for (var vd = 0; vd < validDirections.length; vd++) {
      if (validDirections[vd].toLowerCase() === direction.toLowerCase()) {
        matchedDirection = validDirections[vd];
        break;
      }
    }
    if (!matchedDirection) {
      ui.alert('❌ Invalid Direction', 'Please enter one of: East, North, West, Southwest, Northwest, Far', ui.ButtonSet.OK);
      return;
    }

    // Step 2d: Overnight city
    var overnightResponse = ui.prompt(
      '📍 New Location: ' + location + ' (Step 3/3)',
      'Enter the nearest overnight city for "' + location + '":\n\n' +
      '(Leave blank to use "' + location + '" as the overnight city)\n\n' +
      'Examples: Bozeman, Butte, Missoula, Great Falls',
      ui.ButtonSet.OK_CANCEL
    );
    if (overnightResponse.getSelectedButton() !== ui.Button.OK) return;
    var overnightCity = overnightResponse.getResponseText().trim() || location;

    // Save the new location
    var addResult = addLocationWithDriveTime(location, driveTime, matchedDirection, overnightCity);
    if (addResult && addResult.success) {
      Logger.log('addFutureJob: Added new location "' + location + '" (' + driveTime + ' min, ' + matchedDirection + ', overnight: ' + overnightCity + ')');
    } else {
      Logger.log('addFutureJob: Warning - failed to add location: ' + (addResult ? addResult.message : 'unknown error'));
    }
  }

  // Prompt for start date
  var dateStepLabel = locCheck.exists ? 'Step 3/3' : 'Step 4/4';
  var dateResponse = ui.prompt(
    'Add Future Job - ' + dateStepLabel,
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

  // Add to sheet (21 columns: A-U)
  var timestamp = new Date();
  var newRow = [
    jobNumber,              // Job Number (A)
    location,               // Location (B)
    '',                     // Foreman (C) - not assigned yet
    0,                      // Crew Size (D)
    startDate,              // Start Date (E)
    '',                     // Put On Hold Date (F)
    '',                     // Estimated Return (G)
    '',                     // Est. End Date (H)
    '',                     // Actual End Date (I)
    status,                 // Status (J)
    'Added as future job on ' + Utilities.formatDate(timestamp, Session.getScriptTimeZone(), 'MM/dd/yyyy'), // Notes (K)
    true,                   // Skip Sun (L) - DEFAULT Mon-Thu
    false,                  // Skip Mon (M)
    false,                  // Skip Tue (N)
    false,                  // Skip Wed (O)
    false,                  // Skip Thu (P)
    true,                   // Skip Fri (Q) - DEFAULT Mon-Thu
    true,                   // Skip Sat (R) - DEFAULT Mon-Thu
    false,                  // Skip Weekly Meeting (S)
    false,                  // Skip Monthly Checklist (T)
    timestamp               // Last Updated (U)
  ];

  var lastRow = jobSheet.getLastRow();
  jobSheet.getRange(lastRow + 1, 1, 1, 21).setValues([newRow]);
  // Add checkboxes for skip day columns (L-T = cols 12-20)
  jobSheet.getRange(lastRow + 1, 12, 1, 9).insertCheckboxes();

  var successMsg = 'Job "' + jobNumber + '" has been added.\n\n' +
    'Location: ' + location + '\n' +
    'Start Date: ' + Utilities.formatDate(startDate, Session.getScriptTimeZone(), 'MM/dd/yyyy') + '\n' +
    'Status: ' + status;

  if (!locCheck.exists) {
    successMsg += '\n\n📍 New location "' + location + '" added to Locations sheet with drive time info.';
  }

  successMsg += '\n\n' + (status === 'Pending Start' ?
    '⚠️ This job will not appear in Safety Compliance tracking until the start date.' :
    'This job is now active and will appear in tracking.');

  ui.alert('✅ Future Job Added', successMsg, ui.ButtonSet.OK);
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

  // Columns: A=Job Number(0), E=Start Date(4), J=Status(9)
  for (var i = 1; i < data.length; i++) {
    var jobNum = String(data[i][0] || '').trim();
    var startDate = data[i][4];
    var status = String(data[i][9] || '').trim();  // Status (J, index 9)

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

  Logger.log('=== cleanupPendingTrainingForCompletedJobs START ===');

  var jobSheet = ss.getSheetByName('Job Tracking');
  var trainingSheet = ss.getSheetByName('Training Tracking');

  if (!jobSheet) {
    Logger.log('ERROR: Job Tracking sheet not found');
    ui.alert('❌ Error', 'Job Tracking sheet not found.\n\nRun "Setup Job Tracking Sheet" first.', ui.ButtonSet.OK);
    return;
  }

  if (!trainingSheet) {
    Logger.log('ERROR: Training Tracking sheet not found');
    ui.alert('❌ Error', 'Training Tracking sheet not found.\n\nRun "Setup Training Tracking" first.', ui.ButtonSet.OK);
    return;
  }

  // Get ALL completed jobs from Job Tracking (regardless of end date)
  var jobData = jobSheet.getDataRange().getValues();
  var completedJobs = {}; // jobNumber → true

  Logger.log('Job Tracking: ' + (jobData.length - 1) + ' data rows (headers: ' + String(jobData[0]).substring(0, 100) + ')');

  // Dynamically find Status column by header name
  var statusColIdx = -1;
  var jobNumColIdx = 0; // Default column A
  for (var h = 0; h < jobData[0].length; h++) {
    var hdr = String(jobData[0][h]).toLowerCase().trim();
    if (hdr === 'status') statusColIdx = h;
    if (hdr === 'job number') jobNumColIdx = h;
  }

  if (statusColIdx === -1) {
    Logger.log('ERROR: Could not find "Status" column in Job Tracking headers: ' + JSON.stringify(jobData[0]));
    ui.alert('❌ Error', 'Could not find "Status" column in Job Tracking sheet.\n\nHeaders found: ' + jobData[0].join(', '), ui.ButtonSet.OK);
    return;
  }

  Logger.log('Job Tracking column indices - Job Number: ' + jobNumColIdx + ', Status: ' + statusColIdx);

  // Log all unique status values found
  var statusCounts = {};
  for (var j = 1; j < jobData.length; j++) {
    var jobNum = String(jobData[j][jobNumColIdx] || '').trim();
    var status = String(jobData[j][statusColIdx] || '').trim();

    if (!statusCounts[status]) statusCounts[status] = [];
    statusCounts[status].push(jobNum);

    if (status === 'Completed' && jobNum) {
      completedJobs[jobNum] = true;
    }
  }

  Logger.log('Job Tracking status breakdown: ' + JSON.stringify(Object.keys(statusCounts).map(function(s) { return s + ': ' + statusCounts[s].length + ' (' + statusCounts[s].slice(0, 3).join(', ') + (statusCounts[s].length > 3 ? '...' : '') + ')'; })));

  var completedJobCount = Object.keys(completedJobs).length;
  if (completedJobCount === 0) {
    Logger.log('No completed jobs found. All statuses: ' + JSON.stringify(statusCounts));
    ui.alert('ℹ️ No Completed Jobs', 'No jobs are marked as "Completed" in Job Tracking.\n\nNo changes needed.\n\nStatuses found: ' + Object.keys(statusCounts).join(', '), ui.ButtonSet.OK);
    return;
  }

  Logger.log('cleanupPendingTrainingForCompletedJobs: Found ' + completedJobCount + ' completed jobs: ' + Object.keys(completedJobs).join(', '));

  // Get Training Tracking data
  var trainingData = trainingSheet.getDataRange().getValues();

  Logger.log('Training Tracking: ' + (trainingData.length - 2) + ' data rows (skipping title + header)');
  Logger.log('Training Tracking headers: ' + String(trainingData[1]).substring(0, 150));

  // Dynamically find column indices by header name (row 1 = headers)
  var ttCrewCol = 2;   // Default column C
  var ttStatusCol = 9;  // Default column J
  for (var th = 0; th < trainingData[1].length; th++) {
    var ttHdr = String(trainingData[1][th]).toLowerCase().trim();
    if (ttHdr === 'crew #' || ttHdr === 'crew#' || ttHdr === 'job number' || ttHdr === 'crew') ttCrewCol = th;
    if (ttHdr === 'status') ttStatusCol = th;
  }
  Logger.log('Training Tracking column indices - Crew: ' + ttCrewCol + ', Status: ' + ttStatusCol);

  // Collect rows to delete (work backwards to avoid index shifting)
  var rowsToDelete = [];
  var crewsSeenInTraining = {};
  var completedJobMatchCount = 0;
  var completeStatusCount = 0;
  var otherStatusCount = 0;

  for (var t = 2; t < trainingData.length; t++) {
    var month = String(trainingData[t][0] || '').trim();
    var topic = String(trainingData[t][1] || '').trim();
    var crew = String(trainingData[t][ttCrewCol] || '').trim();
    var status = String(trainingData[t][ttStatusCol] || '').trim();

    if (crew) crewsSeenInTraining[crew] = true;

    // Only process rows for completed jobs
    if (!completedJobs[crew]) continue;
    completedJobMatchCount++;

    // Skip if status is "Complete" - keep for historical purposes
    if (status === 'Complete') {
      completeStatusCount++;
      continue;
    }

    // If status is "Pending", "N/A", or empty - mark for deletion
    if (status === 'Pending' || status === 'N/A' || status === '') {
      rowsToDelete.push({
        rowIndex: t + 1, // 1-based row number
        month: month,
        topic: topic,
        crew: crew,
        status: status || '(empty)'
      });
    } else {
      otherStatusCount++;
      Logger.log('Training row skipped (status="' + status + '"): crew=' + crew + ', month=' + month);
    }
  }

  Logger.log('Training scan: ' + completedJobMatchCount + ' rows match completed jobs, ' + completeStatusCount + ' already Complete, ' + rowsToDelete.length + ' to delete, ' + otherStatusCount + ' other status');
  Logger.log('Unique crews in Training Tracking: ' + Object.keys(crewsSeenInTraining).join(', '));
  Logger.log('Completed jobs looking for: ' + Object.keys(completedJobs).join(', '));

  // Check for near-misses (similar but not exact match)
  var completedJobKeys = Object.keys(completedJobs);
  var trainingCrewKeys = Object.keys(crewsSeenInTraining);
  for (var ck = 0; ck < completedJobKeys.length; ck++) {
    if (!crewsSeenInTraining[completedJobKeys[ck]]) {
      Logger.log('WARNING: Completed job "' + completedJobKeys[ck] + '" NOT found in Training Tracking crews');
    }
  }

  if (rowsToDelete.length === 0) {
    Logger.log('cleanupPendingTrainingForCompletedJobs: No rows to delete. ' + completedJobMatchCount + ' matched rows were all Complete or other status.');
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

  // Columns: A=Job Number(0), B=Location(1), C=Foreman(2), D=Crew Size(3), E=Start Date(4),
  //          F=Put On Hold Date(5), G=Estimated Return(6), H=Est. End Date(7), I=Actual End Date(8), J=Status(9)
  for (var j = 1; j < jobData.length; j++) {
    var jobNum = String(jobData[j][0] || '').trim();
    var status = String(jobData[j][9] || '').trim();    // Status (J, index 9)
    var actualEndDate = jobData[j][8];                  // Actual End Date (I, index 8)

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
      actualEndDate = jobData[i][8];  // Column I = Actual End Date (index 8)
      break;
    }
  }

  if (!jobRow) {
    ui.alert('Job ' + jobNumber + ' not found in Job Tracking.');
    return;
  }

  var status = String(jobRow[9] || '').trim();  // Column J = Status (index 9)
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
        jobSheet.getRange(j + 1, 10).setValue('Completed');  // Status (J, column 10)
        if (!actualEndDate) {
          actualEndDate = new Date();
          jobSheet.getRange(j + 1, 9).setValue(actualEndDate);  // Actual End Date (I, column 9)
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

  var headers = jobSheet.getRange(1, 1, 1, 25).getValues()[0];
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
    jobSheet.getRange(rowNum, 22).setValue(schedule);        // Work Schedule (V)
    jobSheet.getRange(rowNum, 23).setValue(skipDays);        // Skip Days (W)
    jobSheet.getRange(rowNum, 24).setValue(today);           // Schedule Effective (X)
    jobSheet.getRange(rowNum, 25).setValue('[]');            // Schedule History (Y) (empty)
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
  var headers = jobSheet.getRange(1, 1, 1, 25).getValues()[0];
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

  // Get current schedule info from hidden columns V-Y (indices 21-24)
  var currentSchedule = jobData[foundRow - 1][21] || '';  // Column V (index 21) - Work Schedule
  var currentSkipDays = jobData[foundRow - 1][22] || '';  // Column W (index 22) - Skip Days
  var currentEffective = jobData[foundRow - 1][23] || ''; // Column X (index 23) - Schedule Effective
  var historyJson = jobData[foundRow - 1][24] || '[]';    // Column Y (index 24) - Schedule History

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
  jobSheet.getRange(foundRow, 22).setValue(newSchedule);     // Work Schedule (V)
  jobSheet.getRange(foundRow, 23).setValue(newSkipDays);     // Skip Days (W)
  jobSheet.getRange(foundRow, 24).setValue(today);           // Schedule Effective (X)
  jobSheet.getRange(foundRow, 25).setValue(JSON.stringify(history)); // Schedule History (Y)

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
  var headers = jobSheet.getRange(1, 1, 1, 25).getValues()[0];
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

  // NEW COLUMN STRUCTURE (after adding visible skip day columns L-T):
  // Hidden schedule columns are now V-Y (indices 21-24)
  var currentSchedule = foundRow[21] || '';   // Column V (index 21) - Work Schedule
  var currentSkipDays = foundRow[22] || '';   // Column W (index 22) - Skip Days
  var currentEffective = foundRow[23];        // Column X (index 23) - Schedule Effective
  var historyJson = foundRow[24] || '[]';     // Column Y (index 24) - Schedule History

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
  var headers = jobSheet.getRange(1, 1, 1, 25).getValues()[0];
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
