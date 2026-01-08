/**
 * Glove Manager – Swap Stage Handlers
 *
 * Functions for handling swap workflow stages (2-5).
 * Manages Picked checkbox, Date Changed, and manual picks.
 */

/**
 * Handles Picked checkbox changes (column I) in Glove/Sleeve Swaps.
 * Stage 2: Checked - marks item as Ready For Delivery
 * Stage 5: Unchecked - reverts to Stage 1 state
 *
 * @param {Spreadsheet} ss - The active spreadsheet
 * @param {Sheet} swapSheet - The Glove/Sleeve Swaps sheet
 * @param {Sheet} inventorySheet - The Gloves/Sleeves inventory sheet
 * @param {number} editedRow - Row that was edited
 * @param {*} newValue - The checkbox value
 * @param {boolean} isGloveSwaps - True if Glove Swaps, false if Sleeve Swaps
 */
function handlePickedCheckboxChange(ss, swapSheet, inventorySheet, editedRow, newValue, isGloveSwaps) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);

    var isChecked = (newValue === true || newValue === 'TRUE' || newValue === true);

    var rowData = swapSheet.getRange(editedRow, 1, 1, 23).getValues()[0];

    var colEmpIdx = 0;
    var colPickNumIdx = 6;
    var colStatusIdx = 7;
    var stage1StatusIdx = 10;
    var stage1AssignedToIdx = 11;
    var stage1DateAssignedIdx = 12;

    var employeeName = rowData[colEmpIdx];
    var pickListNum = rowData[colPickNumIdx];
    var currentStatus = rowData[colStatusIdx];
    var stage1Status = rowData[stage1StatusIdx];
    var stage1AssignedTo = rowData[stage1AssignedToIdx];
    var stage1DateAssigned = rowData[stage1DateAssignedIdx];

    if (!pickListNum || pickListNum === '—') {
      logEvent('handlePickedCheckboxChange: No Pick List item for row ' + editedRow, 'WARNING');
      return;
    }

    var inventoryData = inventorySheet.getDataRange().getValues();
    var invSheetName = inventorySheet.getName();

    var pickListRow = -1;
    for (var i = 1; i < inventoryData.length; i++) {
      if (String(inventoryData[i][0]).trim() === String(pickListNum).trim()) {
        pickListRow = i + 1;
        break;
      }
    }

    if (pickListRow === -1) {
      logEvent('handlePickedCheckboxChange: Pick List item ' + pickListNum + ' not found in ' + invSheetName, 'ERROR');
      return;
    }

    var invColDateAssigned = 5;
    var invColLocation = 6;
    var invColStatus = 7;
    var invColAssignedTo = 8;
    var invColPickedFor = 10;

    var today = new Date();
    var todayStr = Utilities.formatDate(today, ss.getSpreadsheetTimeZone(), 'yyyy-MM-dd');

    if (isChecked) {
      // STAGE 2: Picked checkbox checked
      logEvent('Stage 2: Picked checked for row ' + editedRow + ', Pick List: ' + pickListNum);

      // VALIDATION: Check if item is "In Testing" - if so, BLOCK the action
      var currentInvStatus = inventorySheet.getRange(pickListRow, invColStatus).getValue();
      var isInTesting = currentInvStatus && currentInvStatus.toString().trim().toLowerCase() === 'in testing';

      if (isInTesting) {
        // CANNOT pick items that are In Testing
        logEvent('Stage 2 BLOCKED: Cannot pick item ' + pickListNum + ' - status is "In Testing"', 'WARNING');

        // Uncheck the checkbox
        swapSheet.getRange(editedRow, 9).setValue(false);

        // Show error message to user
        SpreadsheetApp.getUi().alert(
          '⚠️ Cannot Pick Item',
          'Item ' + pickListNum + ' is currently "In Testing" and cannot be picked for delivery.\n\n' +
          'Please wait until testing is complete and the item status changes to "Ready For Delivery".',
          SpreadsheetApp.getUi().ButtonSet.OK
        );
        return;
      }

      swapSheet.getRange(editedRow, 8).setValue('Ready For Delivery 🚚');

      var stage2Values = [
        'Ready For Delivery',
        'Packed For Delivery',
        todayStr,
        employeeName + ' Picked On ' + todayStr
      ];
      swapSheet.getRange(editedRow, 17, 1, 4).setValues([stage2Values]);

      var todayFormatted = Utilities.formatDate(today, ss.getSpreadsheetTimeZone(), 'MM/dd/yyyy');
      var isSleeve = !isGloveSwaps;
      inventorySheet.getRange(pickListRow, invColStatus).setValue('Ready For Delivery');
      inventorySheet.getRange(pickListRow, invColAssignedTo).setValue('Packed For Delivery');
      inventorySheet.getRange(pickListRow, invColDateAssigned).setValue(todayFormatted);
      inventorySheet.getRange(pickListRow, invColLocation).setValue("Cody's Truck");
      inventorySheet.getRange(pickListRow, invColPickedFor).setValue(employeeName + ' Picked On ' + todayStr);

      var changeOutDate = calculateChangeOutDate(today, "Cody's Truck", 'Packed For Delivery', isSleeve);
      if (changeOutDate && changeOutDate !== 'N/A') {
        var invColChangeOutDate = 9;
        var changeOutCell = inventorySheet.getRange(pickListRow, invColChangeOutDate);
        changeOutCell.setNumberFormat('MM/dd/yyyy');
        changeOutCell.setValue(changeOutDate);
        logEvent('Stage 2: Set Change Out Date to ' + changeOutDate + ' for item ' + pickListNum);
      }

    } else {
      // STAGE 5: Picked checkbox unchecked - revert to Stage 1
      logEvent('Stage 5 Revert: ' + pickListNum + ' returned to ' + (stage1Status || 'Stage 1 state'));

      swapSheet.getRange(editedRow, 10).setValue('');
      swapSheet.getRange(editedRow, 17, 1, 7).clearContent();

      var revertedStatus = stage1Status || 'In Stock ✅';
      if (stage1Status) {
        var statusLower = stage1Status.toString().toLowerCase();
        if (statusLower === 'on shelf') {
          revertedStatus = 'In Stock ✅';
        } else if (statusLower === 'ready for delivery') {
          revertedStatus = 'Ready For Delivery 🚚';
        } else if (statusLower === 'in testing') {
          revertedStatus = 'In Testing ⏳';
        }
      }
      swapSheet.getRange(editedRow, 8).setValue(revertedStatus);

      var revertStatus = stage1Status || 'On Shelf';
      var revertAssignedTo = stage1AssignedTo || 'On Shelf';
      var revertLocation = 'Helena';
      var isSleeve = !isGloveSwaps;
      var invColChangeOutDate = 9;

      inventorySheet.getRange(pickListRow, invColStatus).setValue(revertStatus);
      inventorySheet.getRange(pickListRow, invColAssignedTo).setValue(revertAssignedTo);
      inventorySheet.getRange(pickListRow, invColLocation).setValue(revertLocation);
      inventorySheet.getRange(pickListRow, invColPickedFor).setValue('');

      if (stage1DateAssigned) {
        var stage1Date = new Date(stage1DateAssigned);
        if (!isNaN(stage1Date.getTime())) {
          var stage1DateFormatted = Utilities.formatDate(stage1Date, ss.getSpreadsheetTimeZone(), 'MM/dd/yyyy');
          inventorySheet.getRange(pickListRow, invColDateAssigned).setValue(stage1DateFormatted);

          var revertChangeOutDate = calculateChangeOutDate(stage1Date, revertLocation, revertAssignedTo, isSleeve);
          if (revertChangeOutDate) {
            var revertChangeOutCell = inventorySheet.getRange(pickListRow, invColChangeOutDate);
            if (revertChangeOutDate === 'N/A') {
              revertChangeOutCell.setNumberFormat('@');
            } else {
              revertChangeOutCell.setNumberFormat('MM/dd/yyyy');
            }
            revertChangeOutCell.setValue(revertChangeOutDate);
            logEvent('Stage 5: Reverted Change Out Date to ' + revertChangeOutDate + ' for item ' + pickListNum);
          }
        } else {
          inventorySheet.getRange(pickListRow, invColDateAssigned).setValue(stage1DateAssigned);
        }
      } else {
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
          logEvent('Stage 5: Set fallback Change Out Date to ' + fallbackChangeOutDate + ' for item ' + pickListNum);
        }
      }
    }
  } catch (e) {
    logEvent('handlePickedCheckboxChange error: ' + e, 'ERROR');
  } finally {
    lock.releaseLock();
  }
}

/**
 * Handles Date Changed edits (column J) in Glove/Sleeve Swaps.
 * Stage 3: When date entered - completes swap, assigns new item to employee, old item to testing
 * Stage 4: When date removed - reverts to Stage 2 state
 *
 * @param {Spreadsheet} ss - The active spreadsheet
 * @param {Sheet} swapSheet - The Glove/Sleeve Swaps sheet
 * @param {Sheet} inventorySheet - The Gloves/Sleeves inventory sheet
 * @param {number} editedRow - Row that was edited
 * @param {*} newValue - The date value
 * @param {boolean} isGloveSwaps - True if Glove Swaps, false if Sleeve Swaps
 */
function handleDateChangedEdit(ss, swapSheet, inventorySheet, editedRow, newValue, isGloveSwaps) {
  var hasDate = (newValue !== null && newValue !== undefined && newValue !== '');

  var rowData = swapSheet.getRange(editedRow, 1, 1, 23).getValues()[0];

  var employeeName = rowData[0];
  var oldItemNum = rowData[1];
  var pickListNum = rowData[6];
  var isPicked = rowData[8];

  var stage2Status = rowData[16];
  var stage2AssignedTo = rowData[17];
  var stage2DateAssigned = rowData[18];
  var stage2PickedFor = rowData[19];

  var oldGloveStatus = rowData[13];
  var oldGloveAssignedTo = rowData[14];
  var oldGloveDateAssigned = rowData[15];

  if (!pickListNum || pickListNum === '—') {
    Logger.log('processEdit: No Pick List item for row ' + editedRow);
    return;
  }

  if (!isPicked && hasDate) {
    Logger.log('processEdit: Date Changed entered but Picked not checked - ignoring');
    return;
  }

  var inventoryData = inventorySheet.getDataRange().getValues();
  var pickListRow = -1;
  var oldItemRow = -1;

  for (var i = 1; i < inventoryData.length; i++) {
    var itemNum = String(inventoryData[i][0]).trim();
    if (itemNum === String(pickListNum).trim()) {
      pickListRow = i + 1;
    }
    if (oldItemNum && itemNum === String(oldItemNum).trim()) {
      oldItemRow = i + 1;
    }
  }

  if (pickListRow === -1) {
    Logger.log('processEdit: Pick List item not found: ' + pickListNum);
    return;
  }

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

  if (hasDate) {
    // STAGE 3: Date Changed entered - complete the swap
    Logger.log('Stage 3: Date Changed entered for row ' + editedRow + ', completing swap');

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
      Logger.log('Could not parse date, using today');
      dateChanged = new Date();
    }

    var dateChangedStr = Utilities.formatDate(dateChanged, ss.getSpreadsheetTimeZone(), 'yyyy-MM-dd');
    var dateChangedFormatted = Utilities.formatDate(dateChanged, ss.getSpreadsheetTimeZone(), 'MM/dd/yyyy');

    var isSleeve = (swapSheet.getName() === SHEET_SLEEVE_SWAPS);
    var changeOutDate = calculateChangeOutDate(dateChanged, employeeLocation, employeeName, isSleeve);
    var changeOutDateFormatted = changeOutDate && changeOutDate !== 'N/A'
      ? Utilities.formatDate(changeOutDate, ss.getSpreadsheetTimeZone(), 'MM/dd/yyyy')
      : (changeOutDate === 'N/A' ? 'N/A' : '');

    var stage3Values = [
      employeeName,
      dateChangedStr,
      changeOutDateFormatted
    ];
    swapSheet.getRange(editedRow, 21, 1, 3).setValues([stage3Values]);

    swapSheet.getRange(editedRow, 8).setValue('Assigned').setFontWeight('bold').setFontColor('#2e7d32');
    swapSheet.getRange(editedRow, 6).setValue('Assigned').setFontWeight('bold').setFontColor('#2e7d32');

    inventorySheet.getRange(pickListRow, 7).setValue('Assigned');
    inventorySheet.getRange(pickListRow, 8).setValue(employeeName);
    inventorySheet.getRange(pickListRow, 5).setNumberFormat('MM/dd/yyyy').setValue(dateChanged);
    inventorySheet.getRange(pickListRow, 6).setValue(employeeLocation);

    var changeOutCell = inventorySheet.getRange(pickListRow, 9);
    if (changeOutDate === 'N/A') {
      changeOutCell.setNumberFormat('@').setValue('N/A');
    } else if (changeOutDate) {
      changeOutCell.setNumberFormat('MM/dd/yyyy').setValue(changeOutDate);
    }
    inventorySheet.getRange(pickListRow, 10).setValue('');

    if (oldItemRow > 0) {
      inventorySheet.getRange(oldItemRow, 7).setValue('Ready For Test');
      inventorySheet.getRange(oldItemRow, 8).setValue('Packed For Testing');
      inventorySheet.getRange(oldItemRow, 5).setNumberFormat('MM/dd/yyyy').setValue(dateChanged);
      inventorySheet.getRange(oldItemRow, 6).setValue("Cody's Truck");

      var oldItemChangeOutDate = calculateChangeOutDate(dateChanged, "Cody's Truck", 'Packed For Testing', isSleeve);
      var oldItemChangeOutCell = inventorySheet.getRange(oldItemRow, 9);
      if (oldItemChangeOutDate === 'N/A') {
        oldItemChangeOutCell.setNumberFormat('@').setValue('N/A');
      } else if (oldItemChangeOutDate) {
        oldItemChangeOutCell.setNumberFormat('MM/dd/yyyy').setValue(oldItemChangeOutDate);
      }
    }

  } else {
    // STAGE 4: Date Changed removed - revert to Stage 2 state
    Logger.log('Stage 4: Date Changed removed for row ' + editedRow + ', reverting to Stage 2');

    swapSheet.getRange(editedRow, 21, 1, 3).clearContent();
    swapSheet.getRange(editedRow, 8).setValue('Ready For Delivery 🚚');

    var changeOutDateVal = swapSheet.getRange(editedRow, 5).getValue();
    if (changeOutDateVal) {
      var today = new Date();
      var changeOut = new Date(changeOutDateVal);
      var diffDays = Math.ceil((changeOut - today) / (1000 * 60 * 60 * 24));
      var daysLeftText = diffDays < 0 ? 'OVERDUE' : String(diffDays);
      var daysLeftColor = diffDays < 0 ? '#d32f2f' : (diffDays <= 14 ? '#ff9800' : '#2e7d32');
      swapSheet.getRange(editedRow, 6).setValue(daysLeftText).setFontColor(daysLeftColor);
    }

    inventorySheet.getRange(pickListRow, 7).setValue(stage2Status || 'Ready For Delivery');
    inventorySheet.getRange(pickListRow, 8).setValue(stage2AssignedTo || 'Packed For Delivery');

    if (stage2DateAssigned) {
      var stage2Date = new Date(stage2DateAssigned);
      if (!isNaN(stage2Date)) {
        var stage2DateFormatted = Utilities.formatDate(stage2Date, ss.getSpreadsheetTimeZone(), 'MM/dd/yyyy');
        inventorySheet.getRange(pickListRow, 5).setValue(stage2DateFormatted);

        var pickListChangeOut = calculateChangeOutDate(stage2Date, "Cody's Truck", 'Packed For Delivery', isSleeve);
        var pickListChangeOutCell = inventorySheet.getRange(pickListRow, 9);
        if (pickListChangeOut === 'N/A') {
          pickListChangeOutCell.setNumberFormat('@').setValue('N/A');
        } else if (pickListChangeOut) {
          pickListChangeOutCell.setNumberFormat('MM/dd/yyyy').setValue(pickListChangeOut);
        }
      } else {
        inventorySheet.getRange(pickListRow, 5).setValue(stage2DateAssigned);
      }
    }

    inventorySheet.getRange(pickListRow, 6).setValue("Cody's Truck");
    inventorySheet.getRange(pickListRow, 10).setValue(stage2PickedFor || '');

    if (oldItemRow > 0 && oldGloveStatus) {
      inventorySheet.getRange(oldItemRow, 7).setValue(oldGloveStatus);
      inventorySheet.getRange(oldItemRow, 8).setValue(oldGloveAssignedTo);
      inventorySheet.getRange(oldItemRow, 6).setValue(employeeLocation);

      if (oldGloveDateAssigned) {
        var oldGloveDate = new Date(oldGloveDateAssigned);
        if (!isNaN(oldGloveDate)) {
          var oldGloveDateFormatted = Utilities.formatDate(oldGloveDate, ss.getSpreadsheetTimeZone(), 'MM/dd/yyyy');
          inventorySheet.getRange(oldItemRow, 5).setValue(oldGloveDateFormatted);

          var oldItemChangeOut = calculateChangeOutDate(oldGloveDate, employeeLocation, oldGloveAssignedTo, isSleeve);
          var oldItemChangeOutCell = inventorySheet.getRange(oldItemRow, 9);
          if (oldItemChangeOut === 'N/A') {
            oldItemChangeOutCell.setNumberFormat('@').setValue('N/A');
          } else if (oldItemChangeOut) {
            oldItemChangeOutCell.setNumberFormat('MM/dd/yyyy').setValue(oldItemChangeOut);
          }
        } else {
          inventorySheet.getRange(oldItemRow, 5).setValue(oldGloveDateAssigned);
        }
      }
    }
  }
}

/**
 * Handles manual edits to the Pick List Item # column (G) in Glove/Sleeve Swaps.
 * Applies light blue background (#e3f2fd) to indicate manual entry.
 * Appends "(Manual)" to the status column if not already present.
 *
 * @param {Spreadsheet} ss - The active spreadsheet
 * @param {Sheet} swapSheet - The Glove/Sleeve Swaps sheet
 * @param {Sheet} inventorySheet - The Gloves/Sleeves inventory sheet
 * @param {number} editedRow - Row that was edited
 * @param {string} newValue - The new Pick List item number
 * @param {boolean} isGloveSwaps - True if Glove Swaps, false if Sleeve Swaps
 */
function handlePickListManualEdit(ss, swapSheet, inventorySheet, editedRow, newValue, isGloveSwaps) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);

    logEvent('Manual Pick List edit at row ' + editedRow + ': ' + newValue, 'DEBUG');

    var editedCell = swapSheet.getRange(editedRow, 7);
    editedCell.setBackground('#e3f2fd');

    var statusCell = swapSheet.getRange(editedRow, 8);
    var currentStatus = statusCell.getValue().toString();

    if (currentStatus && currentStatus.indexOf('(Manual)') === -1) {
      statusCell.setValue(currentStatus + ' (Manual)');
    }

    logEvent('Manual Pick List entry marked with blue background for row ' + editedRow, 'INFO');

  } catch (e) {
    logEvent('handlePickListManualEdit error: ' + e, 'ERROR');
  } finally {
    lock.releaseLock();
  }
}

