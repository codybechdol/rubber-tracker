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

/**
 * Handles Picked checkbox changes in the Reclaims sheet.
 * When checked: Updates the pick list item to "Ready For Delivery" status
 *               Saves Stage 1 data for both Pick List item and Old Item
 * When unchecked: Reverts the pick list item to its previous state
 *
 * Reclaims Sheet Columns:
 * A=Employee, B=Item Type, C=Item #, D=Size, E=Class, F=Location,
 * G=Pick List Item #, H=Pick List Status, I=Picked, J=Date Changed
 *
 * Stage Columns (hidden):
 * K-M: STAGE 1 Pick List Item Before Check (Status, Assigned To, Date Assigned)
 * N-P: STAGE 1 Old Item Assignment (Status, Assigned To, Date Assigned)
 * Q-T: STAGE 2 Pick List Item After Check (Status, Picked For, Assigned To, Date Assigned)
 * U-X: STAGE 3 Pick List Item New Assignment (Assigned To, Date Assigned, Change Out Date)
 *
 * @param {Spreadsheet} ss - The active spreadsheet
 * @param {Sheet} reclaimsSheet - The Reclaims sheet
 * @param {Sheet} inventorySheet - The Gloves or Sleeves inventory sheet
 * @param {number} editedRow - Row that was edited
 * @param {*} newValue - The checkbox value
 * @param {boolean} isGlove - True if Glove, false if Sleeve
 */
function handleReclaimsPickedCheckbox(ss, reclaimsSheet, inventorySheet, editedRow, newValue, isGlove) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);

    var isChecked = (newValue === true || newValue === 'TRUE');

    // Get row data from Reclaims sheet (columns A-J)
    var rowData = reclaimsSheet.getRange(editedRow, 1, 1, 10).getValues()[0];

    var employeeName = rowData[0];                    // Column A
    var oldItemNum = String(rowData[2]).trim();       // Column C (current item to reclaim)
    var pickListNum = String(rowData[6]).trim();      // Column G

    if (!pickListNum || pickListNum === '—' || pickListNum === '-' || pickListNum === '') {
      logEvent('handleReclaimsPickedCheckbox: No Pick List item for row ' + editedRow, 'WARNING');
      return;
    }

    // Find the pick list item and old item in inventory
    var inventoryData = inventorySheet.getDataRange().getValues();
    var pickListRow = -1;
    var oldItemRow = -1;
    var pickListInvData = null;
    var oldItemInvData = null;

    for (var i = 1; i < inventoryData.length; i++) {
      var itemNum = String(inventoryData[i][0]).trim();
      if (itemNum === pickListNum) {
        pickListRow = i + 1;
        pickListInvData = inventoryData[i];
      }
      if (oldItemNum && itemNum === oldItemNum) {
        oldItemRow = i + 1;
        oldItemInvData = inventoryData[i];
      }
    }

    if (pickListRow === -1) {
      logEvent('handleReclaimsPickedCheckbox: Pick List item ' + pickListNum + ' not found in inventory', 'ERROR');
      return;
    }

    // Inventory column indices (1-based for getRange, 0-based for array access)
    // Gloves/Sleeves columns: A=Item#, B=Size, C=Class, D=Test Date, E=Date Assigned, F=Location, G=Status, H=Assigned To, I=Change Out Date, J=Picked For, K=Notes
    var invColDateAssigned = 5;   // Column E (array index 4)
    var invColLocation = 6;       // Column F (array index 5)
    var invColStatus = 7;         // Column G (array index 6)
    var invColAssignedTo = 8;     // Column H (array index 7)
    var invColChangeOutDate = 9;  // Column I (array index 8)
    var invColPickedFor = 10;     // Column J (array index 9)

    var today = new Date();
    var todayStr = Utilities.formatDate(today, ss.getSpreadsheetTimeZone(), 'yyyy-MM-dd');
    var todayFormatted = Utilities.formatDate(today, ss.getSpreadsheetTimeZone(), 'MM/dd/yyyy');
    var isSleeve = !isGlove;

    // Read existing Stage 1 data (pre-populated during report generation or from previous pick)
    var existingStage1Data = reclaimsSheet.getRange(editedRow, 11, 1, 6).getValues()[0];
    var existingStage1Status = existingStage1Data[0];      // K - Pick List Status
    var existingStage1AssignedTo = existingStage1Data[1];  // L - Pick List Assigned To
    var existingStage1DateAssigned = existingStage1Data[2]; // M - Pick List Date Assigned
    var existingOldItemStatus = existingStage1Data[3];      // N - Old Item Status
    var existingOldItemAssignedTo = existingStage1Data[4];  // O - Old Item Assigned To
    var existingOldItemDateAssigned = existingStage1Data[5]; // P - Old Item Date Assigned

    if (isChecked) {
      // STAGE 2: Picked checkbox checked
      logEvent('Reclaims Stage 2: Picked checked for row ' + editedRow + ', Pick List: ' + pickListNum);

      // Check if item is "In Testing" - block if so
      // Array index is column - 1, so Status (col 7) is index 6
      var currentInvStatus = pickListInvData ? pickListInvData[6] : inventorySheet.getRange(pickListRow, invColStatus).getValue();
      if (currentInvStatus && currentInvStatus.toString().trim().toLowerCase() === 'in testing') {
        logEvent('Reclaims: Cannot pick item ' + pickListNum + ' - status is "In Testing"', 'WARNING');
        reclaimsSheet.getRange(editedRow, 9).setValue(false);
        SpreadsheetApp.getUi().alert(
          '⚠️ Cannot Pick Item',
          'Item ' + pickListNum + ' is currently "In Testing" and cannot be picked for delivery.\n\n' +
          'Please wait until testing is complete.',
          SpreadsheetApp.getUi().ButtonSet.OK
        );
        return;
      }

      // ===== STAGE 1: Save Pick List Item's current state (ONLY if not already populated) =====
      // Columns K-M: Status, Assigned To, Date Assigned
      // This preserves the original "On Shelf" state even if checkbox is toggled multiple times
      var stage1IsEmpty = !existingStage1Status || existingStage1Status === '';

      if (stage1IsEmpty) {
        // First time checking - save the original inventory state
        var pickListStatus = pickListInvData ? pickListInvData[6] : '';      // Column G (Status)
        var pickListAssignedTo = pickListInvData ? pickListInvData[7] : '';  // Column H (Assigned To)
        var pickListDateAssigned = pickListInvData ? pickListInvData[4] : ''; // Column E (Date Assigned)

        reclaimsSheet.getRange(editedRow, 11, 1, 3).setValues([[
          pickListStatus || 'On Shelf',
          pickListAssignedTo || 'On Shelf',
          pickListDateAssigned || ''
        ]]);

        logEvent('Reclaims Stage 1: Saved original state for Pick List item ' + pickListNum + ': ' +
                 (pickListStatus || 'On Shelf') + ', ' + (pickListAssignedTo || 'On Shelf'));
      } else {
        logEvent('Reclaims Stage 1: Using existing state for Pick List item ' + pickListNum + ': ' +
                 existingStage1Status + ', ' + existingStage1AssignedTo);
      }

      // ===== STAGE 1: Save Old Item's current state (ONLY if not already populated) =====
      // Columns N-P: Status, Assigned To, Date Assigned
      var oldItemStage1IsEmpty = !existingOldItemStatus || existingOldItemStatus === '';

      if (oldItemStage1IsEmpty && oldItemInvData) {
        var oldItemStatus = oldItemInvData[6] || '';      // Column G (Status)
        var oldItemAssignedTo = oldItemInvData[7] || '';  // Column H (Assigned To)
        var oldItemDateAssigned = oldItemInvData[4] || ''; // Column E (Date Assigned)

        reclaimsSheet.getRange(editedRow, 14, 1, 3).setValues([[
          oldItemStatus || 'Assigned',
          oldItemAssignedTo || employeeName,
          oldItemDateAssigned  // P = old item's Date Assigned from inventory
        ]]);

        logEvent('Reclaims Stage 1: Saved old item state - Status: ' + (oldItemStatus || 'Assigned') +
                 ', Assigned To: ' + (oldItemAssignedTo || employeeName) +
                 ', Date Assigned: ' + oldItemDateAssigned);
      }

      // ===== STAGE 2: Update Pick List Item After Check =====
      // Columns Q-T: Status, Picked For, Assigned To, Date Assigned
      reclaimsSheet.getRange(editedRow, 17, 1, 4).setValues([[
        'Ready For Delivery',
        employeeName + ' Picked On ' + todayStr,
        'Packed For Delivery',
        todayFormatted
      ]]);

      // Update Pick List Status in Reclaims sheet (column H)
      reclaimsSheet.getRange(editedRow, 8).setValue('Ready For Delivery 🚚');

      // Update inventory sheet
      inventorySheet.getRange(pickListRow, invColStatus).setValue('Ready For Delivery');
      inventorySheet.getRange(pickListRow, invColAssignedTo).setValue('Packed For Delivery');
      inventorySheet.getRange(pickListRow, invColDateAssigned).setValue(todayFormatted);
      inventorySheet.getRange(pickListRow, invColLocation).setValue("Cody's Truck");
      inventorySheet.getRange(pickListRow, invColPickedFor).setValue(employeeName + ' Picked On ' + todayStr);

      // Calculate and set Change Out Date
      var changeOutDate = calculateChangeOutDate(today, "Cody's Truck", 'Packed For Delivery', isSleeve);
      if (changeOutDate && changeOutDate !== 'N/A') {
        var changeOutCell = inventorySheet.getRange(pickListRow, invColChangeOutDate);
        changeOutCell.setNumberFormat('MM/dd/yyyy');
        changeOutCell.setValue(changeOutDate);
      }

      ss.toast('Item ' + pickListNum + ' marked as Ready For Delivery', '✅ Picked', 3);

    } else {
      // STAGE 5: Picked checkbox unchecked - Revert to Stage 1 state
      logEvent('Reclaims Stage 5: Picked unchecked for row ' + editedRow + ', reverting Pick List: ' + pickListNum);

      // Use existing Stage 1 data (read earlier) for revert
      var revertStatus = existingStage1Status || 'On Shelf';
      var revertAssignedTo = existingStage1AssignedTo || 'On Shelf';
      var revertDateAssigned = existingStage1DateAssigned || '';

      // Determine the correct status display text
      var revertedStatusDisplay = 'In Stock ✅';
      if (revertStatus) {
        var statusLower = revertStatus.toString().toLowerCase();
        if (statusLower === 'on shelf' || statusLower.indexOf('in stock') !== -1) {
          revertedStatusDisplay = 'In Stock ✅';
        } else if (statusLower === 'ready for delivery') {
          revertedStatusDisplay = 'Ready For Delivery 🚚';
        } else if (statusLower === 'in testing') {
          revertedStatusDisplay = 'In Testing ⏳';
        }
      }

      // Update Pick List Status in Reclaims sheet
      reclaimsSheet.getRange(editedRow, 8).setValue(revertedStatusDisplay);

      // Clear Stage 2 and Stage 3 data (but KEEP Stage 1 data for potential future use)
      reclaimsSheet.getRange(editedRow, 17, 1, 4).clearContent();  // Stage 2
      reclaimsSheet.getRange(editedRow, 21, 1, 4).clearContent();  // Stage 3

      // Clear Date Changed
      reclaimsSheet.getRange(editedRow, 10).setValue('');

      // Revert inventory sheet to Stage 1 state
      var revertLocation = 'Helena';

      inventorySheet.getRange(pickListRow, invColStatus).setValue(revertStatus);
      inventorySheet.getRange(pickListRow, invColAssignedTo).setValue(revertAssignedTo);
      inventorySheet.getRange(pickListRow, invColLocation).setValue(revertLocation);
      inventorySheet.getRange(pickListRow, invColPickedFor).setValue('');

      // Handle Date Assigned and Change Out Date
      if (revertDateAssigned) {
        var stage1Date = new Date(revertDateAssigned);
        if (!isNaN(stage1Date.getTime())) {
          var stage1DateFormatted = Utilities.formatDate(stage1Date, ss.getSpreadsheetTimeZone(), 'MM/dd/yyyy');
          inventorySheet.getRange(pickListRow, invColDateAssigned).setValue(stage1DateFormatted);

          // Recalculate Change Out Date based on original assignment
          var revertChangeOutDate = calculateChangeOutDate(stage1Date, revertLocation, revertAssignedTo, isSleeve);
          if (revertChangeOutDate) {
            var revertChangeOutCell = inventorySheet.getRange(pickListRow, invColChangeOutDate);
            if (revertChangeOutDate === 'N/A') {
              revertChangeOutCell.setNumberFormat('@');
            } else {
              revertChangeOutCell.setNumberFormat('MM/dd/yyyy');
            }
            revertChangeOutCell.setValue(revertChangeOutDate);
            logEvent('Reclaims Stage 5: Reverted Change Out Date to ' + revertChangeOutDate + ' for item ' + pickListNum);
          }
        } else {
          inventorySheet.getRange(pickListRow, invColDateAssigned).setValue(revertDateAssigned);
        }
      } else {
        // No original date - use current date for Change Out calculation
        var currentDateAssigned = inventorySheet.getRange(pickListRow, invColDateAssigned).getValue();
        var fallbackChangeOutDate = calculateChangeOutDate(currentDateAssigned || today, revertLocation, revertAssignedTo, isSleeve);
        if (fallbackChangeOutDate) {
          var fallbackCell = inventorySheet.getRange(pickListRow, invColChangeOutDate);
          if (fallbackChangeOutDate === 'N/A') {
            fallbackCell.setNumberFormat('@');
          } else {
            fallbackCell.setNumberFormat('MM/dd/yyyy');
          }
          fallbackCell.setValue(fallbackChangeOutDate);
          logEvent('Reclaims Stage 5: Set fallback Change Out Date to ' + fallbackChangeOutDate + ' for item ' + pickListNum);
        }
      }

      logEvent('Reclaims Stage 5: Reverted ' + pickListNum + ' to: ' + revertStatus + ', ' + revertAssignedTo);
      ss.toast('Item ' + pickListNum + ' returned to ' + revertStatus, '↩️ Reverted', 3);
    }

  } catch (e) {
    logEvent('handleReclaimsPickedCheckbox error: ' + e, 'ERROR');
  } finally {
    lock.releaseLock();
  }
}

/**
 * Handles Date Changed edits in the Reclaims sheet.
 * Stage 3: When date entered - completes reclaim, assigns new item to employee, sends old item to testing
 * Stage 4: When date removed - reverts to Stage 2 (picked) state
 *
 * @param {Spreadsheet} ss - The active spreadsheet
 * @param {Sheet} reclaimsSheet - The Reclaims sheet
 * @param {Sheet} inventorySheet - The Gloves or Sleeves inventory sheet
 * @param {number} editedRow - Row that was edited
 * @param {*} newValue - The date value
 * @param {boolean} isGlove - True if Glove, false if Sleeve
 */
function handleReclaimsDateChanged(ss, reclaimsSheet, inventorySheet, editedRow, newValue, isGlove) {
  var hasDate = (newValue !== null && newValue !== undefined && newValue !== '');

  // Get row data from Reclaims sheet
  var rowData = reclaimsSheet.getRange(editedRow, 1, 1, 20).getValues()[0];

  var employeeName = rowData[0];                      // Column A
  var oldItemNum = String(rowData[2]).trim();         // Column C (item being reclaimed from employee)
  var pickListNum = String(rowData[6]).trim();        // Column G (new item being assigned)
  var isPicked = rowData[8];                          // Column I

  if (!pickListNum || pickListNum === '—' || pickListNum === '-' || pickListNum === '') {
    logEvent('handleReclaimsDateChanged: No Pick List item for row ' + editedRow, 'WARNING');
    return;
  }

  // Only process if Picked checkbox is checked
  if (!isPicked && hasDate) {
    logEvent('handleReclaimsDateChanged: Date entered but Picked not checked - ignoring');
    return;
  }

  // Find the items in inventory
  var inventoryData = inventorySheet.getDataRange().getValues();
  var pickListRow = -1;
  var oldItemRow = -1;

  for (var i = 1; i < inventoryData.length; i++) {
    var itemNum = String(inventoryData[i][0]).trim();
    if (itemNum === pickListNum) {
      pickListRow = i + 1;
    }
    if (oldItemNum && itemNum === oldItemNum) {
      oldItemRow = i + 1;
    }
  }

  if (pickListRow === -1) {
    logEvent('handleReclaimsDateChanged: Pick List item ' + pickListNum + ' not found', 'ERROR');
    return;
  }

  // Get employee's location
  var employeesSheet = ss.getSheetByName(SHEET_EMPLOYEES);
  var employeeLocation = 'Helena';
  if (employeesSheet) {
    var empData = employeesSheet.getDataRange().getValues();
    for (var j = 1; j < empData.length; j++) {
      if ((empData[j][0] || '').toString().trim().toLowerCase() === employeeName.toString().trim().toLowerCase()) {
        employeeLocation = empData[j][2] || 'Helena';
        break;
      }
    }
  }

  // Inventory column indices
  var invColDateAssigned = 5;
  var invColLocation = 6;
  var invColStatus = 7;
  var invColAssignedTo = 8;
  var invColChangeOutDate = 9;
  var invColPickedFor = 10;

  if (hasDate) {
    // STAGE 3: Date Changed entered - complete the reclaim
    logEvent('Reclaims Stage 3: Date Changed entered for row ' + editedRow + ', completing reclaim');

    var dateChanged;
    if (newValue instanceof Date) {
      dateChanged = newValue;
    } else {
      dateChanged = new Date(newValue);
    }

    if (isNaN(dateChanged.getTime())) {
      var parts = String(newValue).split('/');
      if (parts.length === 3) {
        dateChanged = new Date(parseInt(parts[2]), parseInt(parts[0]) - 1, parseInt(parts[1]));
      }
    }

    if (isNaN(dateChanged.getTime())) {
      dateChanged = new Date();
    }

    var dateChangedFormatted = Utilities.formatDate(dateChanged, ss.getSpreadsheetTimeZone(), 'MM/dd/yyyy');
    var isSleeve = !isGlove;

    // Calculate change out date for the new item
    var changeOutDate = calculateChangeOutDate(dateChanged, employeeLocation, employeeName, isSleeve);
    var changeOutDateFormatted = changeOutDate && changeOutDate !== 'N/A'
      ? Utilities.formatDate(changeOutDate, ss.getSpreadsheetTimeZone(), 'MM/dd/yyyy')
      : (changeOutDate === 'N/A' ? 'N/A' : '');

    // ===== STAGE 3: Save Pick List Item New Assignment =====
    // Columns U-X: Assigned To, Date Assigned, Change Out Date, (reserved)
    reclaimsSheet.getRange(editedRow, 21, 1, 3).setValues([[
      employeeName,
      dateChangedFormatted,
      changeOutDateFormatted
    ]]);

    // Update the NEW item (pick list item) - assign to employee
    inventorySheet.getRange(pickListRow, invColStatus).setValue('Assigned');
    inventorySheet.getRange(pickListRow, invColAssignedTo).setValue(employeeName);
    inventorySheet.getRange(pickListRow, invColLocation).setValue(employeeLocation);
    inventorySheet.getRange(pickListRow, invColDateAssigned).setValue(dateChangedFormatted);
    inventorySheet.getRange(pickListRow, invColPickedFor).setValue('');

    if (changeOutDateFormatted) {
      var changeOutCell = inventorySheet.getRange(pickListRow, invColChangeOutDate);
      if (changeOutDateFormatted === 'N/A') {
        changeOutCell.setNumberFormat('@');
      } else {
        changeOutCell.setNumberFormat('MM/dd/yyyy');
      }
      changeOutCell.setValue(changeOutDateFormatted);
    }

    // Update the OLD item (reclaimed) - send to testing
    if (oldItemRow !== -1) {
      inventorySheet.getRange(oldItemRow, invColStatus).setValue('In Testing');
      inventorySheet.getRange(oldItemRow, invColAssignedTo).setValue('Packed For Testing');
      inventorySheet.getRange(oldItemRow, invColLocation).setValue("Cody's Truck");
      inventorySheet.getRange(oldItemRow, invColDateAssigned).setValue(dateChangedFormatted);

      var testingChangeOutCell = inventorySheet.getRange(oldItemRow, invColChangeOutDate);
      testingChangeOutCell.setNumberFormat('@');
      testingChangeOutCell.setValue('N/A');
    }

    // Update Reclaims sheet status
    reclaimsSheet.getRange(editedRow, 8).setValue('Completed ✓');

    ss.toast('Reclaim completed: ' + pickListNum + ' → ' + employeeName + ', ' + oldItemNum + ' → Testing', '✅ Complete', 5);

  } else {
    // STAGE 4: Date Changed removed - revert to Stage 2 (picked) state
    logEvent('Reclaims Stage 4: Date Changed removed for row ' + editedRow + ', reverting to picked state');

    var today = new Date();
    var todayStr = Utilities.formatDate(today, ss.getSpreadsheetTimeZone(), 'yyyy-MM-dd');
    var todayFormatted = Utilities.formatDate(today, ss.getSpreadsheetTimeZone(), 'MM/dd/yyyy');

    // Read Stage 2 data to restore
    var stage2Data = reclaimsSheet.getRange(editedRow, 17, 1, 4).getValues()[0];
    var stage2PickedFor = stage2Data[1] || (employeeName + ' Picked On ' + todayStr);

    // Clear Stage 3 data
    reclaimsSheet.getRange(editedRow, 21, 1, 3).clearContent();

    // Revert the pick list item back to "Ready For Delivery" (Stage 2 state)
    inventorySheet.getRange(pickListRow, invColStatus).setValue('Ready For Delivery');
    inventorySheet.getRange(pickListRow, invColAssignedTo).setValue('Packed For Delivery');
    inventorySheet.getRange(pickListRow, invColLocation).setValue("Cody's Truck");
    inventorySheet.getRange(pickListRow, invColDateAssigned).setValue(todayFormatted);
    inventorySheet.getRange(pickListRow, invColPickedFor).setValue(stage2PickedFor);

    // Read Stage 1 old item data to restore
    var stage1OldItemData = reclaimsSheet.getRange(editedRow, 14, 1, 3).getValues()[0];
    var isSleeve = !isGlove;

    // If old item was sent to testing, revert it back to its Stage 1 state
    if (oldItemRow !== -1) {
      var oldStatus = stage1OldItemData[0] || 'Assigned';
      var oldAssignedTo = stage1OldItemData[1] || employeeName;
      var oldDateAssigned = stage1OldItemData[2] || '';

      inventorySheet.getRange(oldItemRow, invColStatus).setValue(oldStatus);
      inventorySheet.getRange(oldItemRow, invColAssignedTo).setValue(oldAssignedTo);
      inventorySheet.getRange(oldItemRow, invColLocation).setValue(employeeLocation);

      // Restore Date Assigned and recalculate Change Out Date for the old item
      if (oldDateAssigned) {
        var oldDateObj = new Date(oldDateAssigned);
        if (!isNaN(oldDateObj.getTime())) {
          var oldDateFormatted = Utilities.formatDate(oldDateObj, ss.getSpreadsheetTimeZone(), 'MM/dd/yyyy');
          inventorySheet.getRange(oldItemRow, invColDateAssigned).setValue(oldDateFormatted);

          // Recalculate the Change Out Date for the old item based on its original assignment
          var oldChangeOutDate = calculateChangeOutDate(oldDateObj, employeeLocation, oldAssignedTo, isSleeve);
          var oldChangeOutCell = inventorySheet.getRange(oldItemRow, invColChangeOutDate);
          if (oldChangeOutDate && oldChangeOutDate !== 'N/A') {
            oldChangeOutCell.setNumberFormat('MM/dd/yyyy');
            oldChangeOutCell.setValue(oldChangeOutDate);
            logEvent('Reclaims Stage 4: Restored old item ' + oldItemNum + ' Change Out Date to ' + oldChangeOutDate);
          } else if (oldChangeOutDate === 'N/A') {
            oldChangeOutCell.setNumberFormat('@');
            oldChangeOutCell.setValue('N/A');
          }
        } else {
          inventorySheet.getRange(oldItemRow, invColDateAssigned).setValue(oldDateAssigned);
        }
      }
    }

    // Update Reclaims sheet status
    reclaimsSheet.getRange(editedRow, 8).setValue('Ready For Delivery 🚚');

    ss.toast('Reverted to picked state', '↩️ Reverted', 3);
  }
}

/**
 * Handles manual edits to the Pick List Item # column (G) in the Reclaims sheet.
 * Applies light blue background (#e3f2fd) to indicate manual entry.
 * Updates status based on inventory item status and populates Stage 1 columns.
 *
 * Reclaims Sheet Columns:
 * A=Employee, B=Item Type, C=Item #, D=Size, E=Class, F=Location,
 * G=Pick List Item #, H=Pick List Status, I=Picked, J=Date Changed
 *
 * Stage 1 Columns (K-M): Pick List Item Before Check (Status, Assigned To, Date Assigned)
 * Stage 1 Columns (N-P): Old Item Assignment (Status, Assigned To, Date Assigned)
 *
 * @param {Spreadsheet} ss - The active spreadsheet
 * @param {Sheet} reclaimsSheet - The Reclaims sheet
 * @param {Sheet} inventorySheet - The Gloves or Sleeves inventory sheet
 * @param {number} editedRow - Row that was edited
 * @param {string} newValue - The new Pick List item number
 * @param {boolean} isGlove - True if Glove, false if Sleeve
 */
function handleReclaimsPickListManualEdit(ss, reclaimsSheet, inventorySheet, editedRow, newValue, isGlove) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);

    logEvent('Reclaims Manual Pick List edit at row ' + editedRow + ': ' + newValue, 'DEBUG');

    // Mark with blue background to indicate manual entry
    var editedCell = reclaimsSheet.getRange(editedRow, 7);  // Column G
    editedCell.setBackground('#e3f2fd');

    // Get row data to find the old item number and employee name
    var rowData = reclaimsSheet.getRange(editedRow, 1, 1, 6).getValues()[0];
    var employeeName = rowData[0];          // Column A
    var oldItemNum = String(rowData[2]).trim();  // Column C (current item to reclaim)

    // If newValue is empty or '—', clear the status and Stage 1 data
    if (!newValue || newValue === '—' || newValue === '-' || newValue.toString().trim() === '') {
      reclaimsSheet.getRange(editedRow, 8).setValue('Need to Purchase ❌');
      reclaimsSheet.getRange(editedRow, 11, 1, 3).clearContent(); // Clear Stage 1 Pick List columns K, L, M
      logEvent('Reclaims Pick List cleared for row ' + editedRow, 'INFO');
      return;
    }

    // Look up the new pick list item in inventory
    var inventoryData = inventorySheet.getDataRange().getValues();
    var pickListItemRow = -1;
    var pickListItemData = null;
    var oldItemData = null;

    for (var i = 1; i < inventoryData.length; i++) {
      var itemNum = String(inventoryData[i][0]).trim();
      if (itemNum === String(newValue).trim()) {
        pickListItemRow = i;
        pickListItemData = inventoryData[i];
      }
      if (oldItemNum && itemNum === oldItemNum) {
        oldItemData = inventoryData[i];
      }
    }

    if (!pickListItemData) {
      // Item not found in inventory
      reclaimsSheet.getRange(editedRow, 8).setValue('Item Not Found ❌ (Manual)');
      reclaimsSheet.getRange(editedRow, 11, 1, 3).clearContent();
      logEvent('Reclaims Manual Pick List item ' + newValue + ' not found in inventory', 'WARNING');
      return;
    }

    // Get pick list item data from inventory
    // Inventory columns: A=Item#(0), B=Size(1), C=Class(2), D=Test Date(3), E=Date Assigned(4), F=Location(5), G=Status(6), H=Assigned To(7)
    var itemStatus = (pickListItemData[6] || '').toString().trim();
    var itemAssignedTo = (pickListItemData[7] || '').toString().trim();
    var itemDateAssigned = pickListItemData[4] || '';
    var itemStatusLower = itemStatus.toLowerCase();

    // Determine the status for column H
    var displayStatus = '';
    if (itemStatusLower === 'on shelf') {
      displayStatus = 'In Stock ✅ (Manual)';
    } else if (itemStatusLower === 'ready for delivery') {
      displayStatus = 'Ready For Delivery 🚚 (Manual)';
    } else if (itemStatusLower === 'in testing') {
      displayStatus = 'In Testing ⏳ (Manual)';
    } else {
      displayStatus = itemStatus + ' (Manual)';
    }

    // Update Status column (H)
    reclaimsSheet.getRange(editedRow, 8).setValue(displayStatus);

    // Populate Stage 1 Pick List columns (K, L, M) with current inventory state
    var stage1PickListData = [[
      itemStatus,        // K - Status
      itemAssignedTo,    // L - Assigned To
      itemDateAssigned   // M - Date Assigned
    ]];
    reclaimsSheet.getRange(editedRow, 11, 1, 3).setValues(stage1PickListData);

    // Also populate Stage 1 Old Item columns (N, O, P) if old item exists
    if (oldItemData) {
      var oldItemStatus = (oldItemData[6] || '').toString().trim();
      var oldItemAssignedTo = (oldItemData[7] || '').toString().trim();
      var oldItemDateAssigned = oldItemData[4] || '';

      var stage1OldItemData = [[
        oldItemStatus || 'Assigned',     // N - Status
        oldItemAssignedTo || employeeName, // O - Assigned To
        oldItemDateAssigned              // P - Date Assigned
      ]];
      reclaimsSheet.getRange(editedRow, 14, 1, 3).setValues(stage1OldItemData);
    }

    logEvent('Reclaims Manual Pick List entry updated for row ' + editedRow + ': Item #' + newValue + ', Status: ' + displayStatus, 'INFO');

  } catch (e) {
    logEvent('handleReclaimsPickListManualEdit error: ' + e, 'ERROR');
  } finally {
    lock.releaseLock();
  }
}

/**
 * Restore preserved reclaim workflow state after sheet regeneration
 * @param {Sheet} sheet - The Reclaims sheet
 * @param {Object} preservedState - Map of preserved workflow states keyed by employee|itemType|itemNum
 * @param {number} startRow - First data row of the reclaim table
 * @param {number} headerRow - Header row of the table (for column reference)
 */
function restoreReclaimWorkflowState(sheet, preservedState, startRow, headerRow) {
  if (!preservedState || Object.keys(preservedState).length === 0) {
    return;
  }

  try {
    // Get the data range - columns A through X (enough for all stage data)
    var lastRow = sheet.getLastRow();
    if (startRow > lastRow) return;

    var dataRange = sheet.getRange(startRow, 1, lastRow - startRow + 1, 24);
    var data = dataRange.getValues();
    var backgrounds = dataRange.getBackgrounds();

    // Find rows to restore and batch the updates
    var updates = [];

    for (var i = 0; i < data.length; i++) {
      var row = data[i];
      // Skip empty rows or header rows
      if (!row[0] && !row[1]) continue;

      // Build the key: employee|itemType|itemNum (columns vary by table structure)
      // For reclaims: ItemType(A), Item#(B), Size(C), Class(D), Location(E), PickListItem(F), PickListStatus(G), Picked(H), DateChanged(I)
      // Actually looking at the headers: Item Type, Item #, Size, Class, Location, Pick List Item #, Pick List Status, Picked, Date Changed
      var itemType = row[0]; // Column A
      var itemNum = row[1];  // Column B

      if (!itemType || !itemNum) continue;

      // We need to find the employee - this is in the Old Item Assignment section
      // Looking at the structure: columns N-P are Old Item Assignment (Status, Assigned To, Date Assigned)
      // Column O (index 14) is "Assigned To"
      var employee = row[14] || ''; // Column O - Old Item Assigned To

      var key = employee + '|' + itemType + '|' + itemNum;
      var state = preservedState[key];

      // Also try just itemType|itemNum as a fallback
      if (!state) {
        key = itemType + '|' + itemNum;
        state = preservedState[key];
      }

      if (state) {
        var actualRow = startRow + i;
        updates.push({
          row: actualRow,
          state: state,
          rowIndex: i
        });
      }
    }

    // Apply updates
    for (var u = 0; u < updates.length; u++) {
      var update = updates[u];
      var rowNum = update.row;
      var state = update.state;

      // Restore Pick List Item # (column F, index 6) - only if it was manually edited
      if (state.pickListItemNum && state.isManualEdit) {
        sheet.getRange(rowNum, 6).setValue(state.pickListItemNum);
        sheet.getRange(rowNum, 6).setBackground('#cfe2f3'); // Light blue for manual edit
      }

      // Restore Pick List Status (column G, index 7)
      if (state.pickListStatus) {
        var statusCell = sheet.getRange(rowNum, 7);
        statusCell.setValue(state.pickListStatus);
        // Apply status color
        var statusColor = getStatusBackgroundColor(state.pickListStatus);
        if (statusColor) {
          statusCell.setBackground(statusColor);
        }
      }

      // Restore Picked checkbox (column H, index 8)
      if (state.picked !== undefined) {
        sheet.getRange(rowNum, 8).setValue(state.picked);
      }

      // Restore Date Changed (column I, index 9)
      if (state.dateChanged) {
        sheet.getRange(rowNum, 9).setValue(state.dateChanged);
      }

      // Restore Stage 1 - Pick List Item Before Check (columns K-M, indices 11-13)
      if (state.stage1PickList) {
        sheet.getRange(rowNum, 11, 1, 3).setValues([state.stage1PickList]);
      }

      // Restore Stage 1 - Old Item Assignment (columns N-P, indices 14-16)
      if (state.stage1OldItem) {
        sheet.getRange(rowNum, 14, 1, 3).setValues([state.stage1OldItem]);
      }

      // Restore Stage 2 - Pick List Item After Check (columns Q-T, indices 17-20)
      if (state.stage2) {
        sheet.getRange(rowNum, 17, 1, 4).setValues([state.stage2]);
      }

      // Restore Stage 3 - Pick List Item New Assignment (columns U-X, indices 21-24)
      if (state.stage3) {
        sheet.getRange(rowNum, 21, 1, 4).setValues([state.stage3]);
      }
    }

    if (updates.length > 0) {
      logEvent('Restored reclaim workflow state for ' + updates.length + ' items', 'INFO');
    }

  } catch (e) {
    logEvent('restoreReclaimWorkflowState error: ' + e, 'ERROR');
  }
}

/**
 * Get background color for a status value
 */
function getStatusBackgroundColor(status) {
  if (!status) return null;
  var statusLower = status.toString().toLowerCase();
  if (statusLower.indexOf('in stock') >= 0) return '#b7e1cd'; // Green
  if (statusLower.indexOf('in testing') >= 0) return '#fce8b2'; // Yellow/orange
  if (statusLower.indexOf('ready for delivery') >= 0) return '#b7e1cd'; // Green
  if (statusLower.indexOf('on shelf') >= 0) return '#ffffff'; // White
  return null;
}
