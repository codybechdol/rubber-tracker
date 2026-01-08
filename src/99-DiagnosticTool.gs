/**
 * Diagnostic tool to identify why pick list items aren't being found
 */

/**
 * Normalizes sleeve size strings to handle common variations.
 */
function normalizeSleeveSize(size) {
  if (!size) return '';
  var normalized = size.toString().trim().toLowerCase();
  var sizeMap = {
    'xl': 'x-large',
    'x-l': 'x-large',
    'xlarge': 'x-large',
    'extra large': 'x-large',
    'extralarge': 'x-large',
    'l': 'large',
    'lg': 'large',
    'reg': 'regular',
    'regular': 'regular',
    'm': 'regular',
    'med': 'regular',
    'medium': 'regular'
  };
  return sizeMap[normalized] || normalized;
}

/**
 * Diagnose why a specific employee is showing "Need to Purchase"
 * Run this from Script Editor to see detailed analysis
 */
function diagnosePickListIssue() {
  var employeeName = 'Waco Worts'; // Change this to any employee name
  var itemType = 'Sleeves'; // 'Gloves' or 'Sleeves'

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var employeesSheet = ss.getSheetByName('Employees');
  var inventorySheet = ss.getSheetByName(itemType);
  var swapSheet = ss.getSheetByName(itemType + ' Swaps');

  if (!employeesSheet || !inventorySheet) {
    Logger.log('ERROR: Required sheets not found');
    return;
  }

  // Get employee data
  var empData = employeesSheet.getDataRange().getValues();
  var empHeaders = empData[0];
  var empRow = null;

  for (var i = 1; i < empData.length; i++) {
    if (empData[i][0].toString().trim().toLowerCase() === employeeName.toLowerCase()) {
      empRow = empData[i];
      break;
    }
  }

  if (!empRow) {
    Logger.log('ERROR: Employee "' + employeeName + '" not found in Employees sheet');
    return;
  }

  var empClass = empRow[1]; // Column B - Class
  var empLocation = empRow[2]; // Column C - Location
  var empSleeveSize = empRow[9]; // Column J - Sleeve Size
  var empGloveSize = empRow[8]; // Column I - Glove Size
  var empSize = (itemType === 'Sleeves') ? empSleeveSize : empGloveSize;

  Logger.log('='.repeat(80));
  Logger.log('DIAGNOSTIC REPORT FOR: ' + employeeName);
  Logger.log('='.repeat(80));
  Logger.log('Employee Class: ' + empClass);
  Logger.log('Employee Location: ' + empLocation);
  Logger.log('Employee ' + itemType + ' Size: "' + empSize + '"');
  Logger.log('');

  // Get all inventory items
  var invData = inventorySheet.getDataRange().getValues();

  Logger.log('Searching for: Class ' + empClass + ', Size "' + empSize + '", Status: On Shelf/Ready For Delivery/In Testing');
  Logger.log('');

  // Get items already assigned in swaps
  var assignedInSwaps = new Set();
  if (swapSheet) {
    var swapData = swapSheet.getDataRange().getValues();
    for (var s = 0; s < swapData.length; s++) {
      var pickListItem = (swapData[s][6] || '').toString().trim();
      if (pickListItem && pickListItem !== '—' && pickListItem !== '-' && pickListItem !== 'Pick List Item #') {
        assignedInSwaps.add(pickListItem);
      }
    }
  }
  Logger.log('Items already assigned in swaps: ' + (assignedInSwaps.size > 0 ? Array.from(assignedInSwaps).join(', ') : 'None'));
  Logger.log('');

  // Check each inventory item
  var matchingItems = [];
  var allClassItems = [];

  for (var i = 1; i < invData.length; i++) {
    var item = invData[i];
    var itemNum = item[0];
    var itemSize = item[1];
    var itemClass = item[2];
    var itemStatus = (item[6] || '').toString().trim();
    var itemAssignedTo = (item[7] || '').toString().trim();
    var itemPickedFor = (item[9] || '').toString().trim();
    var itemNotes = (item[10] || '').toString().trim();

    // Track all items of the correct class
    if (parseInt(itemClass, 10) === parseInt(empClass, 10)) {
      allClassItems.push({
        num: itemNum,
        size: itemSize,
        status: itemStatus,
        assignedTo: itemAssignedTo,
        pickedFor: itemPickedFor,
        notes: itemNotes
      });
    }

    // Check if item matches search criteria
    var classMatch = parseInt(itemClass, 10) === parseInt(empClass, 10);
    var statusMatch = (itemStatus.toLowerCase() === 'on shelf' ||
                      itemStatus.toLowerCase() === 'ready for delivery' ||
                      itemStatus.toLowerCase() === 'in testing');
    var sizeMatch = (itemType === 'Sleeves') ?
      (itemSize && empSize && normalizeSleeveSize(itemSize) === normalizeSleeveSize(empSize)) :
      (parseFloat(itemSize) === parseFloat(empSize));
    var notAssigned = !assignedInSwaps.has(itemNum.toString());
    var notReservedForOther = (itemPickedFor === '' || itemPickedFor.toLowerCase().indexOf(employeeName.toLowerCase()) !== -1);
    var notLost = (itemNotes.toUpperCase().indexOf('LOST-LOCATE') === -1);

    if (classMatch) {
      var reasonFailed = [];
      if (!statusMatch) reasonFailed.push('Status=' + itemStatus);
      if (!sizeMatch) reasonFailed.push('Size="' + itemSize + '" (normalized: "' + normalizeSleeveSize(itemSize) + '") != "' + empSize + '" (normalized: "' + normalizeSleeveSize(empSize) + '")');
      if (!notAssigned) reasonFailed.push('AlreadyAssignedInSwaps');
      if (!notReservedForOther) reasonFailed.push('ReservedFor="' + itemPickedFor + '"');
      if (!notLost) reasonFailed.push('LOST-LOCATE in notes');

      var allMatch = classMatch && statusMatch && sizeMatch && notAssigned && notReservedForOther && notLost;

      if (statusMatch || sizeMatch) { // Log items that are close matches
        Logger.log('Item ' + itemNum + ':');
        Logger.log('  Size: "' + itemSize + '" (match: ' + sizeMatch + ')');
        Logger.log('  Status: ' + itemStatus + ' (match: ' + statusMatch + ')');
        Logger.log('  Assigned To: ' + itemAssignedTo);
        Logger.log('  Picked For: "' + itemPickedFor + '" (notReservedForOther: ' + notReservedForOther + ')');
        Logger.log('  Already in Swaps: ' + !notAssigned);
        Logger.log('  Has LOST-LOCATE: ' + !notLost);
        Logger.log('  ✓ MATCHES ALL: ' + allMatch);
        if (!allMatch && reasonFailed.length > 0) {
          Logger.log('  ✗ FAILED: ' + reasonFailed.join(', '));
        }
        Logger.log('');

        if (allMatch) {
          matchingItems.push(itemNum);
        }
      }
    }
  }

  Logger.log('='.repeat(80));
  Logger.log('SUMMARY');
  Logger.log('='.repeat(80));
  Logger.log('Total Class ' + empClass + ' items in inventory: ' + allClassItems.length);
  Logger.log('Items matching ALL criteria: ' + matchingItems.length);
  if (matchingItems.length > 0) {
    Logger.log('Matching item numbers: ' + matchingItems.join(', '));
    Logger.log('');
    Logger.log('✓✓✓ ITEMS ARE AVAILABLE - There may be a bug in the pick list logic! ✓✓✓');
  } else {
    Logger.log('');
    Logger.log('✗✗✗ NO MATCHING ITEMS FOUND ✗✗✗');
    Logger.log('');
    Logger.log('All Class ' + empClass + ' items:');
    allClassItems.forEach(function(item) {
      Logger.log('  ' + item.num + ': Size=' + item.size + ', Status=' + item.status +
                ', AssignedTo=' + item.assignedTo + ', PickedFor="' + item.pickedFor + '"');
    });
  }
  Logger.log('='.repeat(80));
}

/**
 * Quick check for a specific item number
 */
function checkSpecificItem() {
  var itemNum = 108; // Change this to any item number
  var itemType = 'Sleeves'; // 'Gloves' or 'Sleeves'

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var inventorySheet = ss.getSheetByName(itemType);

  if (!inventorySheet) {
    Logger.log('ERROR: Sheet "' + itemType + '" not found');
    return;
  }

  var invData = inventorySheet.getDataRange().getValues();

  for (var i = 1; i < invData.length; i++) {
    if (invData[i][0].toString() === itemNum.toString()) {
      Logger.log('Found Item #' + itemNum + ':');
      Logger.log('  Size: ' + invData[i][1]);
      Logger.log('  Class: ' + invData[i][2]);
      Logger.log('  Test Date: ' + invData[i][3]);
      Logger.log('  Date Assigned: ' + invData[i][4]);
      Logger.log('  Location: ' + invData[i][5]);
      Logger.log('  Status: ' + invData[i][6]);
      Logger.log('  Assigned To: ' + invData[i][7]);
      Logger.log('  Change Out Date: ' + invData[i][8]);
      Logger.log('  Picked For: ' + invData[i][9]);
      Logger.log('  Notes: ' + invData[i][10]);
      return;
    }
  }

  Logger.log('Item #' + itemNum + ' not found in ' + itemType + ' sheet');
}
