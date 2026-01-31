/**
 * Diagnostic function to check To Do List scheduled dates
 * Run this from Script Editor to see what dates are actually stored
 */
function diagnosticToDoList() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var todoSheet = ss.getSheetByName('To Do List');

  if (!todoSheet) {
    Logger.log('To Do List sheet not found');
    return;
  }

  var data = todoSheet.getDataRange().getValues();
  Logger.log('To Do List has ' + data.length + ' rows');

  // Find header row (should be row 13)
  var headerRow = data[12];
  Logger.log('Headers: ' + JSON.stringify(headerRow));

  // Find column indexes
  var colIndex = {};
  for (var h = 0; h < headerRow.length; h++) {
    var header = String(headerRow[h]).toLowerCase().trim();
    if (header.indexOf('employee') !== -1) colIndex.employee = h;
    if (header.indexOf('task type') !== -1) colIndex.taskType = h;
    if (header.indexOf('scheduled date') !== -1) colIndex.scheduledDate = h;
    if (header.indexOf('due date') !== -1) colIndex.dueDate = h;
  }

  Logger.log('Column indexes: ' + JSON.stringify(colIndex));

  // Check cert tasks
  Logger.log('\n=== CERT TASKS ===');
  for (var i = 13; i < data.length; i++) {
    var row = data[i];
    var taskType = row[colIndex.taskType];
    var employee = row[colIndex.employee];
    var scheduledDate = row[colIndex.scheduledDate];
    var dueDate = row[colIndex.dueDate];

    if (String(taskType).toLowerCase().indexOf('cert') !== -1 ||
        String(taskType).toLowerCase().indexOf('cpr') !== -1 ||
        String(taskType).toLowerCase().indexOf('1st aid') !== -1) {
      Logger.log('Row ' + (i+1) + ': ' + employee + ' | ' + taskType + ' | Scheduled: ' + scheduledDate + ' | Due: ' + dueDate);
    }
  }
}
