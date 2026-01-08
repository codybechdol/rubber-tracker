/**
 * Glove Manager – Reclaims System
 *
 * Functions for managing compliance reclaims.
 * Identifies items that need to be reclaimed based on location rules.
 */

/**
 * Runs the Reclaims check.
 * Menu item: Glove Manager → Run Reclaims Check
 */
function runReclaimsCheck() {
  try {
    logEvent('Running Reclaims check...');
    updateReclaimsSheet();
    logEvent('Reclaims check completed.');
  } catch (e) {
    logEvent('Error in runReclaimsCheck: ' + e, 'ERROR');
    throw e;
  }
}

/**
 * ⚠️ DEPRECATED - DO NOT USE
 *
 * This incomplete version was overriding the complete implementation in Code.gs.
 * The complete version (Code.gs line 3543) includes:
 * - Previous Employee items
 * - Class 3 items in non-approved locations (with auto pick list for Class 2 replacements)
 * - Class 2 items in Class 3-only locations (with auto pick list for Class 3 replacements)
 * - Lost items (LOST-LOCATE marker detection)
 * - Auto pick list generation that respects swap priorities
 * - Location approval checking
 * - Smart matching of available inventory to reclaim needs
 *
 * This function has been renamed to prevent override. The complete version in Code.gs
 * is now the active implementation.
 *
 * BUG FIX: This resolves the issue where "Need to Purchase ❌" was shown for reclaims
 * even when items were available "On Shelf" in inventory.
 *
 * Fixed: January 7, 2026
 */
function updateReclaimsSheet_INCOMPLETE_DEPRECATED() {
  try {
    logEvent('Updating Reclaims sheet...');
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var reclaimsSheet = ss.getSheetByName('Reclaims');

    if (!reclaimsSheet) {
      reclaimsSheet = ss.insertSheet('Reclaims');
    }

    // Get existing location approvals before clearing
    var savedApprovals = {};
    if (reclaimsSheet.getLastRow() > 0) {
      var existingData = reclaimsSheet.getDataRange().getDisplayValues();
      for (var i = 0; i < existingData.length; i++) {
        var row = existingData[i];
        var firstCell = (row[0] || '').toString().trim().toLowerCase();
        if (firstCell === 'location' && row.length > 1) {
          for (var j = i + 1; j < existingData.length; j++) {
            var locRow = existingData[j];
            var loc = (locRow[0] || '').toString().trim();
            var approval = (locRow[1] || '').toString().trim();
            if (!loc || loc === '') break;
            if (loc.toLowerCase().indexOf('location') === -1) {
              savedApprovals[loc] = approval;
            }
          }
          break;
        }
      }
    }

    Logger.log('Preserved ' + Object.keys(savedApprovals).length + ' location approvals');

    var glovesSheet = ss.getSheetByName(SHEET_GLOVES);
    var sleevesSheet = ss.getSheetByName(SHEET_SLEEVES);
    var employeesSheet = ss.getSheetByName(SHEET_EMPLOYEES);

    if (!glovesSheet || !sleevesSheet || !employeesSheet) {
      logEvent('Required sheets not found for Reclaims');
      return;
    }

    var glovesData = glovesSheet.getLastRow() > 1 ? glovesSheet.getRange(2, 1, glovesSheet.getLastRow() - 1, 11).getValues() : [];
    var sleevesData = sleevesSheet.getLastRow() > 1 ? sleevesSheet.getRange(2, 1, sleevesSheet.getLastRow() - 1, 11).getValues() : [];
    var empData = employeesSheet.getDataRange().getValues();
    var empHeaders = empData[0];
    var empRows = empData.slice(1);

    var locationColIdx = 2;
    for (var h = 0; h < empHeaders.length; h++) {
      if (String(empHeaders[h]).toLowerCase().trim() === 'location') {
        locationColIdx = h;
        break;
      }
    }

    var currentActiveEmployees = new Set();
    empRows.forEach(function(row) {
      var name = (row[0] || '').toString().trim().toLowerCase();
      var location = (row[locationColIdx] || '').toString().trim().toLowerCase();
      if (name && location !== 'previous employee') {
        currentActiveEmployees.add(name);
      }
    });

    Logger.log('Found ' + currentActiveEmployees.size + ' current active employees');

    var employeeHistorySheet = ss.getSheetByName('Employee History');
    var prevEmployees = new Set();
    if (employeeHistorySheet && employeeHistorySheet.getLastRow() > 2) {
      var histData = employeeHistorySheet.getRange(3, 1, employeeHistorySheet.getLastRow() - 2, 3).getValues();
      histData.forEach(function(row) {
        var name = (row[1] || '').toString().trim().toLowerCase();
        var eventType = (row[2] || '').toString().trim();
        if (name && eventType === 'Terminated') {
          prevEmployees.add(name);
        }
      });
    }

    Logger.log('Found ' + prevEmployees.size + ' previous employees from Employee History');

    var previousEmployeeItems = [];
    var class3Reclaims = [];
    var class2Reclaims = [];
    var lostItems = [];

    function processInventoryForReclaims(data, itemType) {
      data.forEach(function(item) {
        var itemNum = item[0];
        var size = item[1];
        var itemClass = item[2];
        var dateAssigned = item[4];
        var location = (item[5] || '').toString().trim();
        var status = (item[6] || '').toString().trim();
        var assignedTo = (item[7] || '').toString().trim();
        var assignedToLower = assignedTo.toLowerCase();

        if (assignedToLower === 'lost') {
          lostItems.push({
            itemType: itemType,
            itemNum: itemNum,
            size: size,
            class: itemClass,
            location: location,
            status: status,
            assignedTo: assignedTo,
            dateAssigned: dateAssigned
          });
          return;
        }

        if (!assignedTo || assignedToLower === 'on shelf' || assignedToLower === 'packed for delivery' ||
            assignedToLower === 'packed for testing' || assignedToLower === 'destroyed') {
          return;
        }

        var isCurrentEmployee = currentActiveEmployees.has(assignedToLower);
        var isPreviousEmployee = prevEmployees.has(assignedToLower) || !isCurrentEmployee;

        if (isPreviousEmployee) {
          previousEmployeeItems.push({
            itemType: itemType,
            itemNum: itemNum,
            size: size,
            class: itemClass,
            location: location,
            status: status,
            assignedTo: assignedTo,
            dateAssigned: dateAssigned
          });
        }
      });
    }

    processInventoryForReclaims(glovesData, 'Glove');
    processInventoryForReclaims(sleevesData, 'Sleeve');

    Logger.log('Found ' + previousEmployeeItems.length + ' Previous Employee items');

    var assignedItemsInSwaps = getSwapAssignedItems(ss);

    var prevEmpCount = previousEmployeeItems.length;
    setupReclaimsSheet(reclaimsSheet, savedApprovals, prevEmpCount);

    var currentRow = 3;

    if (previousEmployeeItems.length > 0) {
      previousEmployeeItems.forEach(function(item) {
        reclaimsSheet.getRange(currentRow, 1, 1, 8).setValues([[
          item.itemType,
          item.itemNum,
          item.size,
          item.class,
          item.location,
          item.status,
          item.assignedTo,
          item.dateAssigned
        ]]);
        currentRow++;
      });
    } else {
      reclaimsSheet.getRange(currentRow, 1, 1, 8).merge()
        .setValue('No Previous Employee items found')
        .setHorizontalAlignment('center').setFontStyle('italic').setBackground('#e8f5e9');
      currentRow++;
    }

    currentRow += 2;

    logEvent('Reclaims sheet updated - Previous Employee: ' + previousEmployeeItems.length +
             ', Class 3 Reclaims: ' + class3Reclaims.length +
             ', Class 2 Reclaims: ' + class2Reclaims.length +
             ', Lost Items: ' + lostItems.length);

  } catch (e) {
    logEvent('Error in updateReclaimsSheet: ' + e, 'ERROR');
    throw e;
  }
}

/**
 * Sets up the Reclaims sheet structure.
 *
 * @param {Sheet} sheet - The Reclaims sheet
 * @param {Object} savedApprovals - Preserved location approvals
 * @param {number} prevEmpCount - Count of Previous Employee items
 */
function setupReclaimsSheet(sheet, savedApprovals, prevEmpCount) {
  try {
    sheet.clear();

    var currentRow = 1;

    sheet.getRange(currentRow, 1, 1, 8).merge()
      .setValue('Previous Employee Reclaims')
      .setFontWeight('bold').setFontSize(14).setBackground('#ffcdd2').setHorizontalAlignment('center');
    currentRow++;

    var prevEmpHeaders = ['Item Type', 'Item #', 'Size', 'Class', 'Location', 'Status', 'Assigned To', 'Date Assigned'];
    sheet.getRange(currentRow, 1, 1, prevEmpHeaders.length).setValues([prevEmpHeaders])
      .setFontWeight('bold').setBackground('#ef9a9a').setHorizontalAlignment('center');
    currentRow++;

    var prevEmpDataRows = Math.max(1, prevEmpCount);
    currentRow += prevEmpDataRows;
    currentRow++;

    sheet.setColumnWidth(1, 80);
    sheet.setColumnWidth(2, 70);
    sheet.setColumnWidth(3, 60);
    sheet.setColumnWidth(4, 60);
    sheet.setColumnWidth(5, 120);
    sheet.setColumnWidth(6, 120);
    sheet.setColumnWidth(7, 150);
    sheet.setColumnWidth(8, 100);

    sheet.setFrozenRows(1);

    logEvent('Reclaims sheet structure set up');

  } catch (e) {
    logEvent('[ERROR] setupReclaimsSheet: Exception: ' + e);
    throw e;
  }
}

/**
 * Gets all item numbers already assigned in Glove Swaps and Sleeve Swaps.
 * These items should not be assigned to reclaims (swap assignments take priority).
 *
 * @param {Spreadsheet} ss - The active spreadsheet
 * @return {Set} Set of item numbers already assigned in swaps
 */
function getSwapAssignedItems(ss) {
  var assignedItems = new Set();

  var gloveSwapsSheet = ss.getSheetByName(SHEET_GLOVE_SWAPS);
  if (gloveSwapsSheet && gloveSwapsSheet.getLastRow() > 1) {
    var gloveSwapsData = gloveSwapsSheet.getDataRange().getValues();
    for (var i = 1; i < gloveSwapsData.length; i++) {
      var row = gloveSwapsData[i];
      var pickListItem = (row[6] || '').toString().trim();
      var firstCell = (row[0] || '').toString().trim();
      if (!firstCell || firstCell.indexOf('Class') !== -1 || firstCell.indexOf('STAGE') !== -1 ||
          firstCell === 'Employee' || firstCell.indexOf('📍') !== -1) {
        continue;
      }
      if (pickListItem && pickListItem !== '—' && pickListItem !== '-') {
        assignedItems.add(pickListItem);
      }
    }
  }

  var sleeveSwapsSheet = ss.getSheetByName(SHEET_SLEEVE_SWAPS);
  if (sleeveSwapsSheet && sleeveSwapsSheet.getLastRow() > 1) {
    var sleeveSwapsData = sleeveSwapsSheet.getDataRange().getValues();
    for (var j = 1; j < sleeveSwapsData.length; j++) {
      var sRow = sleeveSwapsData[j];
      var sPickListItem = (sRow[6] || '').toString().trim();
      var sFirstCell = (sRow[0] || '').toString().trim();
      if (!sFirstCell || sFirstCell.indexOf('Class') !== -1 || sFirstCell.indexOf('STAGE') !== -1 ||
          sFirstCell === 'Employee' || sFirstCell.indexOf('📍') !== -1) {
        continue;
      }
      if (sPickListItem && sPickListItem !== '—' && sPickListItem !== '-') {
        assignedItems.add(sPickListItem);
      }
    }
  }

  var glovesSheet = ss.getSheetByName(SHEET_GLOVES);
  if (glovesSheet && glovesSheet.getLastRow() > 1) {
    var glovesData = glovesSheet.getDataRange().getValues();
    for (var g = 1; g < glovesData.length; g++) {
      var pickedFor = (glovesData[g][9] || '').toString().trim();
      if (pickedFor) {
        assignedItems.add(glovesData[g][0].toString().trim());
      }
    }
  }

  var sleevesSheet = ss.getSheetByName(SHEET_SLEEVES);
  if (sleevesSheet && sleevesSheet.getLastRow() > 1) {
    var sleevesData = sleevesSheet.getDataRange().getValues();
    for (var s = 1; s < sleevesData.length; s++) {
      var sPickedFor = (sleevesData[s][9] || '').toString().trim();
      if (sPickedFor) {
        assignedItems.add(sleevesData[s][0].toString().trim());
      }
    }
  }

  Logger.log('getSwapAssignedItems: Found ' + assignedItems.size + ' items already assigned in swaps');
  return assignedItems;
}

