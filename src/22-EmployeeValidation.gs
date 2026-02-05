/**
 * Employee Sheet Validation Utilities
 *
 * Functions to fix and maintain data validation on the Employees sheet.
 */

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
