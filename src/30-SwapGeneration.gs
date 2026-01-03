/**
 * Glove Manager – Swap Generation
 *
 * Functions for generating swap recommendations.
 * Identifies items due for replacement and suggests pick list items.
 */

/**
 * Generates all reports: Glove Swaps, Sleeve Swaps, Purchase Needs, Inventory Reports, and Reclaims.
 * Menu item: Glove Manager → Generate All Reports
 */
function generateAllReports() {
  try {
    logEvent('Generating all reports...');

    fixChangeOutDatesSilent();

    generateGloveSwaps();
    generateSleeveSwaps();
    updatePurchaseNeeds();
    updateInventoryReports();
    updateReclaimsSheet();
    logEvent('All reports generated.');
    SpreadsheetApp.getUi().alert('✅ All reports generated successfully!');
  } catch (e) {
    logEvent('Error in generateAllReports: ' + e, 'ERROR');
    SpreadsheetApp.getUi().alert('❌ Error generating reports: ' + e);
  }
}

/**
 * Generates Glove Swaps report.
 * Menu item: Glove Manager → Generate Glove Swaps
 */
function generateGloveSwaps() {
  generateSwaps('Gloves');
}

/**
 * Generates Sleeve Swaps report.
 * Menu item: Glove Manager → Generate Sleeve Swaps
 */
function generateSleeveSwaps() {
  generateSwaps('Sleeves');
}

/**
 * Consolidated swap generation function for both Gloves and Sleeves.
 * Creates comprehensive swap recommendations with pick list suggestions.
 * Preserves and restores manual pick list edits.
 *
 * @param {string} itemType - Either 'Gloves' or 'Sleeves'
 */
function generateSwaps(itemType) {
  try {
    var isGloves = (itemType === 'Gloves');
    logEvent('Generating ' + itemType + ' Swaps report...');
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var swapSheetName = isGloves ? SHEET_GLOVE_SWAPS : SHEET_SLEEVE_SWAPS;
    var inventorySheetName = isGloves ? SHEET_GLOVES : SHEET_SLEEVES;
    var swapSheet = ss.getSheetByName(swapSheetName);
    var inventorySheet = ss.getSheetByName(inventorySheetName);
    var employeesSheet = ss.getSheetByName(SHEET_EMPLOYEES);

    if (!swapSheet || !inventorySheet || !employeesSheet) {
      logEvent('Required sheets not found for ' + itemType + ' Swaps');
      return;
    }

    var manualPicks = preserveManualPickLists(swapSheet);
    logEvent('Preserved ' + Object.keys(manualPicks).length + ' manual pick list entries');

    swapSheet.clear();

    var currentRow = 1;
    var classes = isGloves ? [0, 2, 3] : [2, 3];
    var classNames = {0: 'Class 0', 2: 'Class 2', 3: 'Class 3'};
    var today = new Date();
    var ignoreNames = [
      'on shelf', 'in testing', 'packed for delivery', 'packed for testing',
      'failed rubber', 'lost', 'not repairable', '', 'n/a', 'ready for test', 'ready for delivery', 'assigned', 'destroyed'
    ];

    var employees = employeesSheet.getDataRange().getValues();
    var inventory = inventorySheet.getDataRange().getValues();
    if (employees.length < 2 || inventory.length < 2) {
      Logger.log('No data in Employees or ' + itemType);
      return;
    }

    var empData = employees.slice(1);
    var inventoryData = inventory.slice(1);

    var empHeaders = employees[0];
    var locationColIdx = 2;
    for (var h = 0; h < empHeaders.length; h++) {
      if (String(empHeaders[h]).trim().toLowerCase() === 'location') {
        locationColIdx = h;
        break;
      }
    }

    var empMap = {};
    var empLocationMap = {};
    empData.forEach(function(row) {
      var name = (row[0] || '').toString().trim().toLowerCase();
      if (name && ignoreNames.indexOf(name) === -1) {
        empMap[name] = row;
        empLocationMap[name] = (row[locationColIdx] || 'Unknown').toString().trim();
      }
    });

    var itemLabel = isGloves ? 'Glove' : 'Sleeve';
    var sizeColIndex = isGloves ? 8 : 9;

    classes.forEach(function(itemClass) {
      swapSheet.getRange(currentRow, 1, 1, 23).merge().setValue(classNames[itemClass] + ' ' + itemLabel + ' Swaps');
      swapSheet.getRange(currentRow, 1, 1, 23)
        .setFontWeight('bold').setFontSize(12).setBackground('#e3eafc').setFontColor('#0d47a1').setHorizontalAlignment('center');
      currentRow++;

      swapSheet.getRange(currentRow, 11, 1, 3).merge().setValue('STAGE 1').setBackground('#e0e0e0').setFontWeight('bold').setHorizontalAlignment('center');
      swapSheet.getRange(currentRow, 14, 1, 3).merge().setValue('STAGE 1').setBackground('#e0e0e0').setFontWeight('bold').setHorizontalAlignment('center');
      swapSheet.getRange(currentRow, 17, 1, 4).merge().setValue('STAGE 2').setBackground('#e0e0e0').setFontWeight('bold').setHorizontalAlignment('center');
      swapSheet.getRange(currentRow, 21, 1, 3).merge().setValue('STAGE 3').setBackground('#e0e0e0').setFontWeight('bold').setHorizontalAlignment('center');
      currentRow++;

      swapSheet.getRange(currentRow, 11, 1, 3).merge().setValue('Pick List ' + itemLabel + ' Before Check').setBackground('#bdbdbd').setFontWeight('bold').setHorizontalAlignment('center').setFontSize(9);
      swapSheet.getRange(currentRow, 14, 1, 3).merge().setValue('Old ' + itemLabel + ' Assignment').setBackground('#bdbdbd').setFontWeight('bold').setHorizontalAlignment('center').setFontSize(9);
      swapSheet.getRange(currentRow, 17, 1, 4).merge().setValue('Pick List ' + itemLabel + ' After Check').setBackground('#bdbdbd').setFontWeight('bold').setHorizontalAlignment('center').setFontSize(9);
      swapSheet.getRange(currentRow, 21, 1, 3).merge().setValue('Pick List ' + itemLabel + ' New Assignment').setBackground('#bdbdbd').setFontWeight('bold').setHorizontalAlignment('center').setFontSize(9);
      currentRow++;

      var allHeaders = [
        'Employee', 'Current ' + itemLabel + ' #', 'Size', 'Date Assigned', 'Change Out Date', 'Days Left', 'Pick List Item #', 'Status', 'Picked', 'Date Changed',
        'Status', 'Assigned To', 'Date Assigned',
        'Status', 'Assigned To', 'Date Assigned',
        'Status', 'Assigned To', 'Date Assigned', 'Picked For',
        'Assigned To', 'Date Assigned', 'Change Out Date'
      ];
      swapSheet.getRange(currentRow, 1, 1, allHeaders.length).setValues([allHeaders]);
      swapSheet.getRange(currentRow, 1, 1, 10).setFontWeight('bold').setFontColor('#ffffff').setHorizontalAlignment('center').setBackground(HEADER_BG_COLOR);
      swapSheet.getRange(currentRow, 11, 1, 13).setFontWeight('bold').setBackground('#9e9e9e').setFontColor('#ffffff').setHorizontalAlignment('center').setFontSize(9);
      currentRow++;

      var swapRows = [];
      var swapMeta = [];

      inventoryData.forEach(function(item) {
        if (parseInt(item[2], 10) !== itemClass) return;
        var assignedTo = (item[7] || '').toString().trim().toLowerCase();
        if (!assignedTo || ignoreNames.indexOf(assignedTo) === -1 || !empMap[assignedTo]) {
          return;
        }
        var emp = empMap[assignedTo];
        var itemNum = item[0];
        var size = item[1];
        var dateAssigned = item[4];
        var changeOutDate = item[8];
        var status = item[6];
        var daysLeft = '';
        var daysLeftCell = {};

        if (changeOutDate && !isNaN(new Date(changeOutDate))) {
          var diff = (new Date(changeOutDate) - today) / (1000*60*60*24);
          var days = Math.ceil(diff);
          if (days < 0) {
            daysLeft = 'OVERDUE';
            daysLeftCell = {bold: true, color: '#ff5252'};
          } else if (days <= 14) {
            daysLeft = days;
            daysLeftCell = {bold: true, color: '#ff9800'};
          } else {
            daysLeft = days;
            daysLeftCell = {bold: false, color: '#388e3c'};
          }
        }

        if (dateAssigned && changeOutDate && daysLeft !== '' && ((typeof daysLeft === 'number' && daysLeft < 32) || daysLeft === 'OVERDUE')) {
          swapMeta.push({
            emp: emp,
            employeeLocation: empLocationMap[assignedTo] || 'Unknown',
            itemNum: itemNum,
            size: size,
            dateAssigned: dateAssigned,
            changeOutDate: changeOutDate,
            daysLeft: daysLeft,
            daysLeftCell: daysLeftCell,
            status: status,
            itemClass: itemClass,
            empPreferredSize: emp[sizeColIndex],
            itemSize: isGloves ? parseFloat(size) : size,
            oldStatus: status,
            oldAssignedTo: item[7],
            oldDateAssigned: dateAssigned
          });
        }
      });

      swapMeta.sort(function(a, b) {
        var locCompare = (a.employeeLocation || 'ZZZ').localeCompare(b.employeeLocation || 'ZZZ');
        if (locCompare !== 0) return locCompare;
        return new Date(a.changeOutDate) - new Date(b.changeOutDate);
      });

      var assignedItemNums = new Set();
      swapMeta.forEach(function(meta) {
        var useSize = isGloves ?
          (!isNaN(parseFloat(meta.empPreferredSize)) ? parseFloat(meta.empPreferredSize) : meta.itemSize) :
          (meta.empPreferredSize || meta.itemSize);
        var pickListValue = '—';
        var pickListStatus = '';
        var pickListSizeUp = false;
        var pickListStatusRaw = '';
        var pickListItemData = null;
        var isAlreadyPicked = false;
        var employeeName = meta.emp[0];

        var pickedForMatch = inventoryData.find(function(item) {
          var pickedFor = (item[9] || '').toString().trim();
          var classMatch = parseInt(item[2], 10) === meta.itemClass;
          var pickedForEmployee = pickedFor.toLowerCase().indexOf(employeeName.toLowerCase()) !== -1;
          var notAlreadyUsed = !assignedItemNums.has(item[0]);
          return classMatch && pickedForEmployee && notAlreadyUsed;
        });

        if (pickedForMatch) {
          pickListValue = pickedForMatch[0];
          pickListStatusRaw = (pickedForMatch[6] || '').toString().trim().toLowerCase();
          pickListItemData = pickedForMatch;
          isAlreadyPicked = true;
          assignedItemNums.add(pickedForMatch[0]);

          var pickedSize = isGloves ? parseFloat(pickedForMatch[1]) : pickedForMatch[1];
          if (isGloves && !isNaN(pickedSize) && !isNaN(useSize) && pickedSize > useSize) {
            pickListSizeUp = true;
          }
        }

        if (!pickListItemData) {
          var match = inventoryData.find(function(item) {
            var statusMatch = item[6] && item[6].toString().trim().toLowerCase() === 'on shelf';
            var classMatch = parseInt(item[2], 10) === meta.itemClass;
            var sizeMatch = isGloves ?
              parseFloat(item[1]) === useSize :
              (item[1] && useSize && item[1].toString().trim().toLowerCase() === useSize.toString().trim().toLowerCase());
            var notAssigned = !assignedItemNums.has(item[0]);
            var pickedFor = (item[9] || '').toString().trim();
            var isReservedForOther = pickedFor !== '' && pickedFor.toLowerCase().indexOf(employeeName.toLowerCase()) === -1;
            return statusMatch && classMatch && sizeMatch && notAssigned && !isReservedForOther;
          });
          if (match) {
            pickListValue = match[0];
            pickListStatusRaw = 'on shelf';
            pickListItemData = match;
            assignedItemNums.add(match[0]);
          }
        }

        if (!pickListItemData && isGloves && !isNaN(useSize)) {
          var match = inventoryData.find(function(item) {
            var pickedFor = (item[9] || '').toString().trim();
            var isReservedForOther = pickedFor !== '' && pickedFor.toLowerCase().indexOf(employeeName.toLowerCase()) === -1;
            return item[6] && item[6].toString().trim().toLowerCase() === 'on shelf' &&
                   parseInt(item[2], 10) === meta.itemClass &&
                   parseFloat(item[1]) === useSize + 0.5 &&
                   !assignedItemNums.has(item[0]) &&
                   !isReservedForOther;
          });
          if (match) {
            pickListValue = match[0];
            pickListStatusRaw = 'on shelf';
            pickListSizeUp = true;
            pickListItemData = match;
            assignedItemNums.add(match[0]);
          }
        }

        if (!pickListItemData) {
          var match = inventoryData.find(function(item) {
            var stat = item[6] && item[6].toString().trim().toLowerCase();
            var statusMatch = (stat === 'ready for delivery' || stat === 'in testing');
            var classMatch = parseInt(item[2], 10) === meta.itemClass;
            var sizeMatch = isGloves ?
              parseFloat(item[1]) === useSize :
              (item[1] && item[1].toString().trim().toLowerCase() === useSize.toString().trim().toLowerCase());
            var notAssigned = !assignedItemNums.has(item[0]);
            var pickedFor = (item[9] || '').toString().trim();
            var isReservedForOther = pickedFor !== '' && pickedFor.toLowerCase().indexOf(employeeName.toLowerCase()) === -1;
            return statusMatch && classMatch && sizeMatch && notAssigned && !isReservedForOther;
          });
          if (match) {
            pickListValue = match[0];
            pickListStatusRaw = match[6].toString().trim().toLowerCase();
            pickListItemData = match;
            assignedItemNums.add(match[0]);
          }
        }

        if (!pickListItemData && isGloves && !isNaN(useSize)) {
          var match = inventoryData.find(function(item) {
            var stat = item[6] && item[6].toString().trim().toLowerCase();
            var pickedFor = (item[9] || '').toString().trim();
            var isReservedForOther = pickedFor !== '' && pickedFor.toLowerCase().indexOf(employeeName.toLowerCase()) === -1;
            return (stat === 'ready for delivery' || stat === 'in testing') &&
                   parseInt(item[2], 10) === meta.itemClass &&
                   parseFloat(item[1]) === useSize + 0.5 &&
                   !assignedItemNums.has(item[0]) &&
                   !isReservedForOther;
          });
          if (match) {
            pickListValue = match[0];
            pickListStatusRaw = match[6].toString().trim().toLowerCase();
            pickListSizeUp = true;
            pickListItemData = match;
            assignedItemNums.add(match[0]);
          }
        }

        if (pickListValue === '—') {
          pickListStatus = 'Need to Purchase ❌';
        } else if (pickListStatusRaw === 'on shelf') {
          pickListStatus = pickListSizeUp ? 'In Stock (Size Up) ⚠️' : 'In Stock ✅';
        } else if (pickListStatusRaw === 'ready for delivery') {
          pickListStatus = pickListSizeUp ? 'Ready For Delivery (Size Up) ⚠️' : 'Ready For Delivery 🚚';
        } else if (pickListStatusRaw === 'in testing') {
          pickListStatus = pickListSizeUp ? 'In Testing (Size Up) ⚠️' : 'In Testing ⏳';
        } else {
          pickListStatus = meta.status;
        }

        var finalPickListValue = pickListValue;
        var finalPickListStatus = pickListStatus;

        if (isAlreadyPicked) {
          finalPickListStatus = pickListSizeUp ? 'Ready For Delivery (Size Up) ⚠️' : 'Ready For Delivery 🚚';
        }

        var stage2Status = '';
        var stage2AssignedTo = '';
        var stage2DateAssigned = '';
        var stage2PickedFor = '';

        if (isAlreadyPicked && pickListItemData) {
          stage2Status = pickListItemData[6] || 'Ready For Delivery';
          stage2AssignedTo = pickListItemData[7] || 'Packed For Delivery';
          stage2DateAssigned = pickListItemData[4] || '';
          stage2PickedFor = pickListItemData[9] || '';
        }

        var rowData = [
          meta.emp[0], meta.itemNum, meta.size, meta.dateAssigned, meta.changeOutDate, meta.daysLeft,
          finalPickListValue,
          finalPickListStatus,
          isAlreadyPicked,
          '',
          pickListItemData ? (isAlreadyPicked ? 'On Shelf' : (pickListItemData[6] || '')) : '',
          pickListItemData ? (isAlreadyPicked ? 'On Shelf' : (pickListItemData[7] || '')) : '',
          pickListItemData ? (isAlreadyPicked ? '' : (pickListItemData[4] || '')) : '',
          meta.oldStatus || '', meta.oldAssignedTo || '', meta.oldDateAssigned || '',
          stage2Status,
          stage2AssignedTo,
          stage2DateAssigned,
          stage2PickedFor,
          '', '', ''
        ];

        swapRows.push({
          data: rowData,
          location: meta.employeeLocation,
          daysLeftCell: meta.daysLeftCell
        });
      });

      var locationGroups = {};
      swapRows.forEach(function(row) {
        var loc = row.location || 'Unknown';
        if (!locationGroups[loc]) {
          locationGroups[loc] = [];
        }
        locationGroups[loc].push(row);
      });

      var sortedLocations = Object.keys(locationGroups).sort();

      if (sortedLocations.length > 0) {
        sortedLocations.forEach(function(location) {
          var locationRows = locationGroups[location];

          swapSheet.getRange(currentRow, 1, 1, 10).merge().setValue('📍 ' + location);
          swapSheet.getRange(currentRow, 1, 1, 10)
            .setFontWeight('bold')
            .setFontSize(10)
            .setBackground('#e8eaf6')
            .setFontColor('#3949ab')
            .setHorizontalAlignment('left');
          currentRow++;

          var rowDataArray = locationRows.map(function(r) { return r.data; });
          var rowStartIndex = currentRow;

          swapSheet.getRange(currentRow, 1, rowDataArray.length, 23).setValues(rowDataArray);
          swapSheet.getRange(currentRow, 1, rowDataArray.length, 23).setHorizontalAlignment('center');
          swapSheet.getRange(currentRow, 9, rowDataArray.length, 1).insertCheckboxes();

          var daysLeftRange = swapSheet.getRange(currentRow, 6, rowDataArray.length, 1);
          for (var i = 0; i < locationRows.length; i++) {
            var val = locationRows[i].data[5];
            var style = locationRows[i].daysLeftCell;
            if (val === 'OVERDUE') {
              daysLeftRange.getCell(i+1,1).setFontWeight('bold').setFontColor(style.color);
            } else if (style.bold) {
              daysLeftRange.getCell(i+1,1).setFontWeight('bold').setFontColor(style.color);
            } else {
              daysLeftRange.getCell(i+1,1).setFontWeight('normal').setFontColor(style.color);
            }
          }

          currentRow += rowDataArray.length;
        });
      } else {
        swapSheet.getRange(currentRow, 1).setValue('No swaps due for this class');
        swapSheet.getRange(currentRow, 1, 1, 10).merge().setHorizontalAlignment('center').setFontStyle('italic');
        currentRow++;
      }
      currentRow += 2;
    });

    SpreadsheetApp.flush();

    for (var c = 1; c <= 10; c++) {
      swapSheet.autoResizeColumn(c);
    }

    swapSheet.setColumnWidth(1, Math.max(swapSheet.getColumnWidth(1), 120));
    swapSheet.setColumnWidth(2, Math.max(swapSheet.getColumnWidth(2), 100));
    swapSheet.setColumnWidth(5, Math.max(swapSheet.getColumnWidth(5), 110));
    swapSheet.setColumnWidth(6, Math.max(swapSheet.getColumnWidth(6), 90));
    swapSheet.setColumnWidth(7, Math.max(swapSheet.getColumnWidth(7), 80));
    swapSheet.setColumnWidth(8, Math.max(swapSheet.getColumnWidth(8), 180));
    swapSheet.setColumnWidth(15, 120);

    swapSheet.hideColumns(11, 13);

    if (Object.keys(manualPicks).length > 0) {
      var firstDataRow = 1;
      var lastRow = swapSheet.getLastRow();
      for (var searchRow = 1; searchRow <= Math.min(lastRow, 20); searchRow++) {
        var cellValue = swapSheet.getRange(searchRow, 1).getValue();
        var cellStr = (cellValue || '').toString().trim();
        if (cellStr && cellStr !== 'Employee' &&
            cellStr.indexOf('Class') === -1 &&
            cellStr.indexOf('STAGE') === -1 &&
            cellStr.indexOf('Pick List') === -1 &&
            cellStr.indexOf('📍') === -1) {
          firstDataRow = searchRow;
          break;
        }
      }
      restoreManualPickLists(swapSheet, manualPicks, firstDataRow, swapSheet.getLastRow());
    }

    logEvent(itemType + ' Swaps report generated successfully.');
  } catch (e) {
    logEvent('Error in generateSwaps(' + itemType + '): ' + e, 'ERROR');
    throw e;
  }
}

/**
 * Preserves manual Pick List edits before regenerating swap sheets.
 * Scans for cells with light blue background (#e3f2fd) in Pick List column.
 *
 * @param {Sheet} swapSheet - The Glove/Sleeve Swaps sheet
 * @return {Object} Map of employeeName -> { pickListNum, status }
 */
function preserveManualPickLists(swapSheet) {
  var manualPicks = {};

  if (!swapSheet || swapSheet.getLastRow() < 2) {
    return manualPicks;
  }

  try {
    var lastRow = swapSheet.getLastRow();
    var lastCol = Math.min(swapSheet.getLastColumn(), 23);

    var dataRange = swapSheet.getRange(1, 1, lastRow, lastCol);
    var values = dataRange.getValues();
    var backgrounds = dataRange.getBackgrounds();

    var manualEditColor = '#e3f2fd';

    for (var i = 0; i < values.length; i++) {
      var row = values[i];
      var bgRow = backgrounds[i];

      var employeeName = (row[0] || '').toString().trim();
      var pickListNum = (row[6] || '').toString().trim();
      var status = (row[7] || '').toString().trim();
      var pickListBg = (bgRow[6] || '').toString().toLowerCase();

      if (!employeeName || employeeName === 'Employee' ||
          employeeName.indexOf('Class') !== -1 ||
          employeeName.indexOf('STAGE') !== -1 ||
          employeeName.indexOf('📍') !== -1) {
        continue;
      }

      if (pickListBg === manualEditColor && pickListNum && pickListNum !== '—') {
        var empKey = employeeName.toLowerCase();
        manualPicks[empKey] = {
          pickListNum: pickListNum,
          status: status
        };
        Logger.log('Preserved manual pick for ' + employeeName + ': ' + pickListNum);
      }
    }
  } catch (e) {
    Logger.log('Error in preserveManualPickLists: ' + e);
  }

  return manualPicks;
}

/**
 * Restores manual Pick List edits after regenerating swap sheets.
 *
 * @param {Sheet} swapSheet - The regenerated Glove/Sleeve Swaps sheet
 * @param {Object} manualPicks - Map from preserveManualPickLists
 * @param {number} startRow - First data row to search (1-based)
 * @param {number} endRow - Last row to search (1-based)
 */
function restoreManualPickLists(swapSheet, manualPicks, startRow, endRow) {
  if (!swapSheet || !manualPicks || Object.keys(manualPicks).length === 0) {
    return;
  }

  try {
    var manualEditColor = '#e3f2fd';
    var numRows = endRow - startRow + 1;

    if (numRows <= 0) return;

    var dataRange = swapSheet.getRange(startRow, 1, numRows, 8);
    var values = dataRange.getValues();

    var restoredCount = 0;

    for (var i = 0; i < values.length; i++) {
      var row = values[i];
      var employeeName = (row[0] || '').toString().trim();

      if (!employeeName || employeeName === 'Employee' ||
          employeeName.indexOf('Class') !== -1 ||
          employeeName.indexOf('STAGE') !== -1 ||
          employeeName.indexOf('📍') !== -1) {
        continue;
      }

      var empKey = employeeName.toLowerCase();

      if (manualPicks[empKey]) {
        var actualRow = startRow + i;
        var preserved = manualPicks[empKey];

        swapSheet.getRange(actualRow, 7).setValue(preserved.pickListNum);
        swapSheet.getRange(actualRow, 8).setValue(preserved.status);
        swapSheet.getRange(actualRow, 7).setBackground(manualEditColor);

        Logger.log('Restored manual pick for ' + employeeName + ': ' + preserved.pickListNum);
        restoredCount++;
      }
    }

    if (restoredCount > 0) {
      Logger.log('Restored ' + restoredCount + ' manual pick list entries');
    }

  } catch (e) {
    Logger.log('Error in restoreManualPickLists: ' + e);
  }
}

