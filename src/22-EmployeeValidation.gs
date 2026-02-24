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
