/**
 * Glove Manager – Swap Preservation
 *
 * Functions for preserving and restoring manual pick list edits.
 * Ensures manual selections survive swap regeneration.
 */

/**
 * Preserves manual pick list entries before regenerating swaps.
 * Stores them in a hidden sheet or properties for restoration.
 *
 * @param {Spreadsheet} ss - The active spreadsheet
 * @param {string} swapSheetName - Name of the swap sheet (Glove Swaps or Sleeve Swaps)
 * @return {Array} Array of preserved manual pick entries
 */
function preserveManualPickLists(ss, swapSheetName) {
  var preserved = [];
  var swapSheet = ss.getSheetByName(swapSheetName);

  if (!swapSheet || swapSheet.getLastRow() < 2) {
    logEvent('preserveManualPickLists: No data to preserve in ' + swapSheetName, 'DEBUG');
    return preserved;
  }

  try {
    var data = swapSheet.getDataRange().getValues();
    var headers = data[0];

    // Find Pick List Item # and Status columns
    var pickListColIdx = -1;
    var statusColIdx = -1;
    var employeeColIdx = -1;

    for (var h = 0; h < headers.length; h++) {
      var headerLower = String(headers[h]).toLowerCase().trim();
      if (headerLower === 'pick list item #') pickListColIdx = h;
      if (headerLower === 'pick list status') statusColIdx = h;
      if (headerLower === 'employee') employeeColIdx = h;
    }

    if (pickListColIdx === -1 || employeeColIdx === -1) {
      logEvent('preserveManualPickLists: Required columns not found', 'WARNING');
      return preserved;
    }

    // Find rows with manual entries (light blue background)
    for (var i = 1; i < data.length; i++) {
      var pickListValue = data[i][pickListColIdx];
      var employee = data[i][employeeColIdx];
      var status = statusColIdx !== -1 ? data[i][statusColIdx] : '';

      // Check if cell has manual edit background color
      var cell = swapSheet.getRange(i + 1, pickListColIdx + 1);
      var bgColor = cell.getBackground();

      if (bgColor === '#e3f2fd' && pickListValue) {
        preserved.push({
          employee: employee,
          pickListItem: pickListValue,
          status: status,
          row: i + 1
        });
      }
    }

    logEvent('preserveManualPickLists: Preserved ' + preserved.length + ' manual pick list entries', 'DEBUG');

  } catch (e) {
    logEvent('preserveManualPickLists error: ' + e, 'ERROR');
  }

  return preserved;
}

/**
 * Restores manual pick list entries after swap regeneration.
 * Matches employees and restores their manual picks.
 *
 * @param {Spreadsheet} ss - The active spreadsheet
 * @param {string} swapSheetName - Name of the swap sheet
 * @param {Array} preserved - Array of preserved manual picks
 */
function restoreManualPickLists(ss, swapSheetName, preserved) {
  if (!preserved || preserved.length === 0) {
    logEvent('restoreManualPickLists: No entries to restore', 'DEBUG');
    return;
  }

  var swapSheet = ss.getSheetByName(swapSheetName);
  if (!swapSheet) {
    logEvent('restoreManualPickLists: Sheet not found: ' + swapSheetName, 'ERROR');
    return;
  }

  try {
    var data = swapSheet.getDataRange().getValues();
    var headers = data[0];

    var pickListColIdx = -1;
    var statusColIdx = -1;
    var employeeColIdx = -1;

    for (var h = 0; h < headers.length; h++) {
      var headerLower = String(headers[h]).toLowerCase().trim();
      if (headerLower === 'pick list item #') pickListColIdx = h;
      if (headerLower === 'pick list status') statusColIdx = h;
      if (headerLower === 'employee') employeeColIdx = h;
    }

    if (pickListColIdx === -1 || employeeColIdx === -1) {
      logEvent('restoreManualPickLists: Required columns not found', 'ERROR');
      return;
    }

    var restored = 0;

    // Match preserved entries with current rows
    for (var p = 0; p < preserved.length; p++) {
      var preservedEntry = preserved[p];

      // Find matching employee in current data
      for (var i = 1; i < data.length; i++) {
        var currentEmployee = String(data[i][employeeColIdx]).trim();

        if (currentEmployee === preservedEntry.employee) {
          // Restore the manual pick
          var pickListCell = swapSheet.getRange(i + 1, pickListColIdx + 1);
          pickListCell.setValue(preservedEntry.pickListItem);
          pickListCell.setBackground('#e3f2fd'); // Light blue to indicate manual

          if (statusColIdx !== -1 && preservedEntry.status) {
            var statusCell = swapSheet.getRange(i + 1, statusColIdx + 1);
            var currentStatus = statusCell.getValue();
            if (currentStatus && currentStatus.indexOf('(Manual)') === -1) {
              statusCell.setValue(currentStatus + ' (Manual)');
            }
          }

          restored++;
          break;
        }
      }
    }

    logEvent('restoreManualPickLists: Restored ' + restored + ' of ' + preserved.length + ' manual entries', 'INFO');

  } catch (e) {
    logEvent('restoreManualPickLists error: ' + e, 'ERROR');
  }
}

