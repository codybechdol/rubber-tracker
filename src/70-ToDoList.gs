/**
 * Glove Manager – To-Do List Generation
 *
 * Functions for generating and managing to-do lists.
 * Consolidates tasks from reclaims, swaps, and purchase needs.
 */

/**
 * Generates a consolidated To-Do List from Reclaims, Swaps, and other sources.
 * Menu item: Glove Manager → To-Do List → Generate To-Do List
 */
function generateToDoList() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var todoSheet = ss.getSheetByName('To Do List');

  if (!todoSheet) {
    todoSheet = ss.insertSheet('To Do List');
  }

  todoSheet.clear();

  // Set up headers
  var headers = ['Priority', 'Task', 'Details', 'Sheet', 'Status', 'Completed'];
  todoSheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  todoSheet.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#4285f4').setFontColor('white');

  var tasks = [];

  // Get tasks from Reclaims sheet
  var reclaimsSheet = ss.getSheetByName('Reclaims');
  if (reclaimsSheet && reclaimsSheet.getLastRow() > 1) {
    var reclaimsData = reclaimsSheet.getDataRange().getValues();

    for (var i = 1; i < reclaimsData.length; i++) {
      var row = reclaimsData[i];
      if (row[0]) { // Has content
        tasks.push([
          'Medium',
          'Process Reclaim: ' + row[0],
          'Item #' + row[2] + ' - ' + row[1],
          'Reclaims',
          'Pending',
          false
        ]);
      }
    }
  }

  // Get tasks from Purchase Needs
  var purchaseSheet = ss.getSheetByName('Purchase Needs');
  if (purchaseSheet && purchaseSheet.getLastRow() > 1) {
    var purchaseData = purchaseSheet.getDataRange().getValues();

    for (var j = 1; j < purchaseData.length; j++) {
      var pRow = purchaseData[j];
      if (pRow[0] && pRow[0] !== 'Class') { // Has class value
        tasks.push([
          'High',
          'Order: ' + pRow[0] + ' Size ' + pRow[1],
          'Quantity needed: ' + pRow[2],
          'Purchase Needs',
          'Pending',
          false
        ]);
      }
    }
  }

  // Get incomplete swaps from Glove Swaps
  var gloveSwapsSheet = ss.getSheetByName(SHEET_GLOVE_SWAPS);
  if (gloveSwapsSheet && gloveSwapsSheet.getLastRow() > 1) {
    var swapData = gloveSwapsSheet.getDataRange().getValues();
    var swapHeaders = swapData[0];

    var pickedColIdx = -1;
    var employeeColIdx = -1;

    for (var h = 0; h < swapHeaders.length; h++) {
      var headerLower = String(swapHeaders[h]).toLowerCase().trim();
      if (headerLower === 'picked') pickedColIdx = h;
      if (headerLower === 'employee') employeeColIdx = h;
    }

    if (pickedColIdx !== -1 && employeeColIdx !== -1) {
      for (var k = 1; k < swapData.length; k++) {
        var sRow = swapData[k];
        var isPicked = sRow[pickedColIdx];
        var employee = sRow[employeeColIdx];

        if (!isPicked && employee) {
          tasks.push([
            'Low',
            'Complete Swap for: ' + employee,
            'Check Picked box when delivered',
            'Glove Swaps',
            'Pending',
            false
          ]);
        }
      }
    }
  }

  // Write tasks to sheet
  if (tasks.length > 0) {
    todoSheet.getRange(2, 1, tasks.length, 6).setValues(tasks);

    // Format
    todoSheet.setColumnWidth(1, 100); // Priority
    todoSheet.setColumnWidth(2, 300); // Task
    todoSheet.setColumnWidth(3, 300); // Details
    todoSheet.setColumnWidth(4, 150); // Sheet
    todoSheet.setColumnWidth(5, 100); // Status
    todoSheet.setColumnWidth(6, 100); // Completed

    // Add data validation for Completed column (checkboxes)
    var completedRange = todoSheet.getRange(2, 6, tasks.length, 1);
    var rule = SpreadsheetApp.newDataValidation().requireCheckbox().build();
    completedRange.setDataValidation(rule);

    SpreadsheetApp.getUi().alert('✅ To-Do List generated with ' + tasks.length + ' tasks.');
  } else {
    todoSheet.getRange(2, 1).setValue('No tasks found. Great job!');
    SpreadsheetApp.getUi().alert('✅ To-Do List generated - no pending tasks!');
  }

  logEvent('To-Do List generated with ' + tasks.length + ' tasks', 'INFO');
}

/**
 * Clears completed tasks from the To-Do List.
 * Menu item: Glove Manager → To-Do List → Clear Completed Tasks
 */
function clearCompletedTasks() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var todoSheet = ss.getSheetByName('To Do List');

  if (!todoSheet || todoSheet.getLastRow() < 2) {
    SpreadsheetApp.getUi().alert('To-Do List is empty or not found.');
    return;
  }

  var data = todoSheet.getDataRange().getValues();
  var completedColIdx = 5; // Completed column (F)
  var rowsToDelete = [];

  // Find completed tasks (starting from bottom to avoid index issues)
  for (var i = data.length - 1; i > 0; i--) {
    if (data[i][completedColIdx] === true) {
      rowsToDelete.push(i + 1); // 1-based row number
    }
  }

  // Delete completed rows
  var deletedCount = 0;
  for (var j = 0; j < rowsToDelete.length; j++) {
    todoSheet.deleteRow(rowsToDelete[j]);
    deletedCount++;
  }

  if (deletedCount > 0) {
    SpreadsheetApp.getUi().alert('✅ Cleared ' + deletedCount + ' completed task(s).');
    logEvent('Cleared ' + deletedCount + ' completed tasks from To-Do List', 'INFO');
  } else {
    SpreadsheetApp.getUi().alert('No completed tasks to clear.');
  }
}

