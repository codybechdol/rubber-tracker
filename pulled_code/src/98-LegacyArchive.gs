/**
 * @fileoverview LEGACY CODE ARCHIVE - February 18, 2026
 * ============================================================================
 *
 * ⚠️ DO NOT USE THESE FUNCTIONS - They are archived for reference only.
 *
 * This file contains deprecated functions that have been replaced by newer
 * implementations in their respective module files. Functions here are:
 *
 * 1. Renamed with _OLD suffix to prevent accidental use
 * 2. Kept for historical reference and rollback capability
 * 3. NOT called from anywhere in the active codebase
 *
 * ACTIVE IMPLEMENTATIONS:
 * - updatePurchaseNeeds() → 60-PurchaseNeeds.gs
 * - updateInventoryReports() → 61-InventoryReports.gs
 *
 * WHY THIS FILE EXISTS:
 * Google Apps Script uses "last definition wins" - if a function is defined
 * in both a module file and Code.gs, Code.gs wins because it loads last.
 * Moving legacy code here (with _OLD suffix) prevents any risk of override.
 *
 * SEE ALSO:
 * - ARCHITECTURE.md - Explains the duplicate function architecture
 * - REVERT_SUMMARY.md - Documents the January 2026 override bug
 *
 * ============================================================================
 */

// ============================================================================
// LEGACY: updatePurchaseNeeds_OLD
// Replaced by: 60-PurchaseNeeds.gs → updatePurchaseNeeds()
// Reason: Missing "In Testing" table support, different severity levels
// ============================================================================

/**
 * @deprecated Use updatePurchaseNeeds() in 60-PurchaseNeeds.gs instead.
 * This version lacks the 5-tier urgency system and proper In Testing handling.
 */
function updatePurchaseNeeds_OLD() {
  try {
    logEvent('LEGACY: updatePurchaseNeeds_OLD called - this should not be used');
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var purchaseSheet = ss.getSheetByName('Purchase Needs') || ss.insertSheet('Purchase Needs');
    purchaseSheet.clear();

    var tableHeaders = ['Severity', 'Timeframe', 'Item Type', 'Size', 'Class', 'Quantity Needed', 'Reason', 'Status', 'Notes'];

    var tables = [
      {
        title: '🛒 NEED TO ORDER',
        reason: 'None Available',
        status: 'NEED TO ORDER',
        severity: 1,
        timeframe: 'Immediate',
        titleBg: '#ef9a9a',
        headerBg: '#ffcdd2',
        match: function(status) { return status === 'Need to Purchase ❌'; }
      },
      {
        title: '📦⚠️ READY FOR DELIVERY (SIZE UP)',
        reason: 'Ready For Delivery + Size Up',
        status: 'Packed For Delivery (Size Up)',
        severity: 2,
        timeframe: 'In 2 Weeks',
        titleBg: '#80cbc4',
        headerBg: '#b2dfdb',
        match: function(status) { return status && status.indexOf('Ready For Delivery (Size Up)') === 0; }
      },
      {
        title: '⏳⚠️ IN TESTING (SIZE UP)',
        reason: 'In Testing + Size Up',
        status: 'Awaiting Test (Size Up)',
        severity: 3,
        timeframe: 'In 3 Weeks',
        titleBg: '#ce93d8',
        headerBg: '#e1bee7',
        match: function(status) { return status && status.indexOf('In Testing (Size Up)') === 0; }
      },
      {
        title: '⚠️ SIZE UP ASSIGNMENTS',
        reason: 'Size Up',
        status: 'Assigned (Size Up)',
        severity: 4,
        timeframe: 'Consider',
        titleBg: '#ffcc80',
        headerBg: '#ffe0b2',
        match: function(status) { return status && status.indexOf('In Stock (Size Up)') === 0; }
      }
    ];

    function processSwapTab(tabName, itemType, allRows) {
      var sheet = ss.getSheetByName(tabName);
      if (!sheet) return;
      var data = sheet.getDataRange().getValues();
      var currentClass = null;

      for (var i = 0; i < data.length; i++) {
        var row = data[i];
        var cellA = row[0];

        var classHeaderPattern = new RegExp('^Class (\\d+) (Glove|Sleeve) Swaps', 'i');
        var headerMatch = cellA && typeof cellA === 'string' && cellA.match(classHeaderPattern);
        if (headerMatch) {
          currentClass = parseInt(headerMatch[1], 10);
          continue;
        }

        if (currentClass === null) continue;
        if (!cellA) continue;
        if (typeof cellA === 'string' && cellA.toLowerCase() === 'employee') continue;
        if (typeof cellA === 'string' && (cellA.indexOf('STAGE') !== -1 || cellA.indexOf('Pick List') !== -1)) continue;

        var size = row[2];
        var status = row[7];
        var employeeName = row[0];

        if (!size || !status) continue;

        var sizeStr = String(size);

        for (var t = 0; t < tables.length; t++) {
          if (tables[t].match(status)) {
            var classNum = parseInt(currentClass, 10);
            var key = itemType + '|' + sizeStr + '|' + classNum;

            if (!allRows[t][key]) {
              allRows[t][key] = { itemType: itemType, size: sizeStr, class: classNum, qty: 0, employees: [] };
            }
            allRows[t][key].qty++;
            if (employeeName && allRows[t][key].employees.indexOf(employeeName) === -1) {
              allRows[t][key].employees.push(employeeName);
            }
            break;
          }
        }
      }
    }

    var allRows = [{}, {}, {}, {}];
    processSwapTab('Glove Swaps', 'Glove', allRows);
    processSwapTab('Sleeve Swaps', 'Sleeve', allRows);

    var reclaimsSheet = ss.getSheetByName('Reclaims');
    if (reclaimsSheet && reclaimsSheet.getLastRow() > 1) {
      var reclaimsData = reclaimsSheet.getDataRange().getValues();

      for (var ri = 0; ri < reclaimsData.length; ri++) {
        var rRow = reclaimsData[ri];
        var rFirstCell = (rRow[0] || '').toString().trim();

        if (!rFirstCell || rFirstCell === 'Employee' ||
            rFirstCell.indexOf('⚠️') !== -1 ||
            rFirstCell.indexOf('📍') !== -1 ||
            rFirstCell.indexOf('Previous') !== -1 ||
            rFirstCell.indexOf('Lost Items') !== -1 ||
            rFirstCell === 'Item Type' ||
            rFirstCell === 'Location') {
          continue;
        }

        var rItemType = (rRow[1] || '').toString().trim();
        var rSize = (rRow[3] || '').toString().trim();
        var rClass = (rRow[4] || '').toString().trim();
        var rPickListStatus = (rRow[7] || '').toString().trim();
        var rEmployee = rFirstCell;

        if ((rItemType === 'Glove' || rItemType === 'Sleeve') &&
            rSize && rClass &&
            rPickListStatus.indexOf('Need to Purchase') !== -1) {

          var classNum = parseInt(rClass, 10);
          var key = rItemType + '|' + rSize + '|' + classNum;

          if (!allRows[0][key]) {
            allRows[0][key] = { itemType: rItemType, size: rSize, class: classNum, qty: 0, employees: [] };
          }
          allRows[0][key].qty++;
          if (rEmployee && allRows[0][key].employees.indexOf(rEmployee + ' (Reclaim)') === -1) {
            allRows[0][key].employees.push(rEmployee + ' (Reclaim)');
          }
        }
      }
    }

    var grandTotals = {
      needToOrder: 0,
      readyForDeliverySizeUp: 0,
      inTestingSizeUp: 0,
      sizeUp: 0
    };

    for (var t = 0; t < tables.length; t++) {
      var keys = Object.keys(allRows[t]);
      for (var k = 0; k < keys.length; k++) {
        var qty = allRows[t][keys[k]].qty;
        if (t === 0) grandTotals.needToOrder += qty;
        else if (t === 1) grandTotals.readyForDeliverySizeUp += qty;
        else if (t === 2) grandTotals.inTestingSizeUp += qty;
        else if (t === 3) grandTotals.sizeUp += qty;
      }
    }

    var rowIdx = 1;

    purchaseSheet.getRange(rowIdx, 1, 1, 9).merge().setValue('📊 PURCHASE NEEDS SUMMARY - Generated: ' + new Date().toLocaleString())
      .setFontWeight('bold').setFontSize(14).setBackground('#b0bec5').setFontColor('#333333').setHorizontalAlignment('center');
    rowIdx++;

    var topSummaryData = [
      ['1️⃣ Immediate: ' + grandTotals.needToOrder,
       '2️⃣ In 2 Weeks: ' + grandTotals.readyForDeliverySizeUp,
       '3️⃣ In 3 Weeks: ' + grandTotals.inTestingSizeUp,
       '4️⃣ Consider: ' + grandTotals.sizeUp,
       '', '', '', '', '']
    ];
    purchaseSheet.getRange(rowIdx, 1, 1, 9).setValues(topSummaryData)
      .setBackground('#eceff1').setFontWeight('bold').setHorizontalAlignment('center');
    rowIdx += 2;

    for (var t = 0; t < tables.length; t++) {
      var keys = Object.keys(allRows[t]);
      if (keys.length === 0) continue;

      keys.sort(function(a, b) {
        var aData = allRows[t][a];
        var bData = allRows[t][b];
        if (aData.class !== bData.class) return aData.class - bData.class;
        var aSize = parseFloat(aData.size) || 0;
        var bSize = parseFloat(bData.size) || 0;
        if (aSize !== bSize) return aSize - bSize;
        return aData.itemType.localeCompare(bData.itemType);
      });

      purchaseSheet.getRange(rowIdx, 1, 1, 9).merge().setValue(tables[t].title)
        .setFontWeight('bold').setFontSize(12).setBackground(tables[t].titleBg).setFontColor('#333333').setHorizontalAlignment('center');
      rowIdx++;

      purchaseSheet.getRange(rowIdx, 1, 1, tableHeaders.length).setValues([tableHeaders])
        .setFontWeight('bold').setBackground(tables[t].headerBg).setHorizontalAlignment('center');
      rowIdx++;

      var tableTotal = 0;
      var dataStartRow = rowIdx;
      for (var k = 0; k < keys.length; k++) {
        var r = allRows[t][keys[k]];
        tableTotal += r.qty;
        var classValue = parseInt(r.class, 10);
        var employeeList = r.employees && r.employees.length > 0 ? r.employees.join(', ') : '';
        var rowData = [
          tables[t].severity, tables[t].timeframe, r.itemType, r.size, classValue,
          r.qty, tables[t].reason, tables[t].status, employeeList
        ];
        purchaseSheet.getRange(rowIdx, 1, 1, rowData.length).setValues([rowData]);
        purchaseSheet.getRange(rowIdx, 1, 1, 8).setHorizontalAlignment('center');
        purchaseSheet.getRange(rowIdx, 9).setWrap(true);
        rowIdx++;
      }

      var numDataRows = rowIdx - dataStartRow;
      if (numDataRows > 0) {
        purchaseSheet.getRange(dataStartRow, 5, numDataRows, 1).setNumberFormat('0');
      }

      purchaseSheet.getRange(rowIdx, 1, 1, 5).merge().setValue('TOTAL')
        .setFontWeight('bold').setHorizontalAlignment('right').setBackground('#e0e0e0');
      purchaseSheet.getRange(rowIdx, 6).setValue(tableTotal)
        .setFontWeight('bold').setHorizontalAlignment('center').setBackground('#e0e0e0');
      purchaseSheet.getRange(rowIdx, 7, 1, 3).setBackground('#e0e0e0');
      rowIdx += 2;
    }

    var totalItems = grandTotals.needToOrder + grandTotals.sizeUp + grandTotals.inTestingSizeUp + grandTotals.readyForDeliverySizeUp;
    if (totalItems === 0) {
      purchaseSheet.getRange(rowIdx, 1, 1, 9).merge().setValue('✅ No purchase needs at this time!')
        .setFontWeight('bold').setFontSize(12).setBackground('#4caf50').setFontColor('white').setHorizontalAlignment('center');
    }

    var summaryStartRow = 4;
    var summaryCol = 11;

    purchaseSheet.getRange(summaryStartRow, summaryCol, 1, 2).merge().setValue('📊 SUMMARY BY TIMEFRAME')
      .setFontWeight('bold').setBackground('#b0bec5').setFontColor('#333333').setHorizontalAlignment('center');

    var summaryData = [
      ['1️⃣ Immediate', grandTotals.needToOrder, '#ef9a9a'],
      ['2️⃣ In 2 Weeks', grandTotals.readyForDeliverySizeUp, '#80cbc4'],
      ['3️⃣ In 3 Weeks', grandTotals.inTestingSizeUp, '#ce93d8'],
      ['4️⃣ Consider', grandTotals.sizeUp, '#ffcc80']
    ];

    for (var s = 0; s < summaryData.length; s++) {
      var sRow = summaryStartRow + 1 + s;
      purchaseSheet.getRange(sRow, summaryCol).setValue(summaryData[s][0])
        .setBackground(summaryData[s][2]).setFontColor('#333333').setFontWeight('bold');
      purchaseSheet.getRange(sRow, summaryCol + 1).setValue(summaryData[s][1])
        .setBackground(summaryData[s][2]).setFontColor('#333333').setFontWeight('bold').setHorizontalAlignment('center');
    }

    var totalRow = summaryStartRow + 5;
    var grandTotal = grandTotals.needToOrder + grandTotals.readyForDeliverySizeUp + grandTotals.inTestingSizeUp + grandTotals.sizeUp;
    purchaseSheet.getRange(totalRow, summaryCol).setValue('TOTAL')
      .setBackground('#cfd8dc').setFontColor('#333333').setFontWeight('bold');
    purchaseSheet.getRange(totalRow, summaryCol + 1).setValue(grandTotal)
      .setBackground('#cfd8dc').setFontColor('#333333').setFontWeight('bold').setHorizontalAlignment('center');

    var widths = [60, 100, 75, 70, 50, 100, 170, 175, 300];
    for (var i = 0; i < widths.length; i++) {
      purchaseSheet.setColumnWidth(i + 1, widths[i]);
    }
    purchaseSheet.setColumnWidth(11, 140);
    purchaseSheet.setColumnWidth(12, 55);
    purchaseSheet.setFrozenRows(2);

    logEvent('LEGACY updatePurchaseNeeds_OLD completed (should not be called)');
  } catch (e) {
    logEvent('Error in updatePurchaseNeeds_OLD: ' + e, 'ERROR');
    throw e;
  }
}


// ============================================================================
// LEGACY: updateInventoryReports_OLD
// Replaced by: 61-InventoryReports.gs → updateInventoryReports()
// Reason: Missing NEW GLOVES/SLEEVES columns, no purchased/reclaimed tracking
// ============================================================================

/**
 * @deprecated Use updateInventoryReports() in 61-InventoryReports.gs instead.
 * This version lacks NEW GLOVES/SLEEVES columns and purchased/reclaimed tracking.
 */
function updateInventoryReports_OLD() {
  try {
    logEvent('LEGACY: updateInventoryReports_OLD called - this should not be used');
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var inventorySheet = ss.getSheetByName('Inventory Reports');
    if (!inventorySheet) {
      inventorySheet = ss.insertSheet('Inventory Reports');
    }
    inventorySheet.clear();

    var glovesSheet = ss.getSheetByName('Gloves');
    var sleevesSheet = ss.getSheetByName('Sleeves');

    if (!glovesSheet || !sleevesSheet) {
      inventorySheet.getRange(1, 1).setValue('Missing Gloves or Sleeves sheet');
      return;
    }

    var now = new Date();
    var timestamp = Utilities.formatDate(now, ss.getSpreadsheetTimeZone(), 'MM/dd/yyyy, h:mm:ss a');

    var glovesData = glovesSheet.getLastRow() > 1 ? glovesSheet.getRange(2, 1, glovesSheet.getLastRow() - 1, 11).getValues() : [];
    var sleevesData = sleevesSheet.getLastRow() > 1 ? sleevesSheet.getRange(2, 1, sleevesSheet.getLastRow() - 1, 11).getValues() : [];

    var totalGloves = glovesData.length;
    var totalSleeves = sleevesData.length;

    var gloveStatusCounts = {};
    var sleeveStatusCounts = {};
    var gloveClassCounts = {};
    var sleeveClassCounts = {};
    var locationCounts = {};

    glovesData.forEach(function(row) {
      var status = normalizeStatusForReport_LEGACY(row[6]);
      var itemClass = String(row[2]).trim();
      var location = (row[5] || '').toString().trim();

      gloveStatusCounts[status] = (gloveStatusCounts[status] || 0) + 1;

      if (itemClass === '0' || itemClass === '2' || itemClass === '3') {
        gloveClassCounts[itemClass] = (gloveClassCounts[itemClass] || 0) + 1;
      }

      if (location) {
        if (!locationCounts[location]) locationCounts[location] = { gloves: 0, sleeves: 0 };
        locationCounts[location].gloves++;
      }
    });

    sleevesData.forEach(function(row) {
      var status = normalizeStatusForReport_LEGACY(row[6]);
      var itemClass = String(row[2]).trim();
      var location = (row[5] || '').toString().trim();

      sleeveStatusCounts[status] = (sleeveStatusCounts[status] || 0) + 1;

      if (itemClass === '2' || itemClass === '3') {
        sleeveClassCounts[itemClass] = (sleeveClassCounts[itemClass] || 0) + 1;
      }

      if (location) {
        if (!locationCounts[location]) locationCounts[location] = { gloves: 0, sleeves: 0 };
        locationCounts[location].sleeves++;
      }
    });

    var glovesLost = gloveStatusCounts['Lost'] || 0;
    var glovesFailed = gloveStatusCounts['Failed Rubber'] || 0;
    var sleevesLost = sleeveStatusCounts['Lost'] || 0;
    var sleevesFailed = sleeveStatusCounts['Failed Rubber'] || 0;

    var gloveAssigned = gloveStatusCounts['Assigned'] || 0;
    var sleeveAssigned = sleeveStatusCounts['Assigned'] || 0;
    var gloveMonthlyAvg = (gloveAssigned / 12).toFixed(1);
    var sleeveMonthlyAvg = (sleeveAssigned / 12).toFixed(1);

    var row = 1;

    // Title
    inventorySheet.getRange(row, 1, 1, 6).merge()
      .setValue('INVENTORY DASHBOARD - Generated: ' + timestamp)
      .setFontWeight('bold').setFontSize(14).setBackground('#1565c0').setFontColor('white').setHorizontalAlignment('center');
    inventorySheet.setRowHeight(row, 35);
    row += 2;

    // Summary header row
    var summaryHeaderRange = inventorySheet.getRange(row, 1, 1, 6);
    summaryHeaderRange.setValues([
      ['TOTAL GLOVES', 'TOTAL SLEEVES', 'Glove Avg/Month', 'Sleeve Avg/Month', 'Gloves Lost/Failed', 'Sleeves Lost/Failed']
    ]).setFontWeight('bold').setHorizontalAlignment('center').setFontColor('white');
    inventorySheet.getRange(row, 1).setBackground('#1565c0');
    inventorySheet.getRange(row, 2).setBackground('#2e7d32');
    inventorySheet.getRange(row, 3).setBackground('#0277bd');
    inventorySheet.getRange(row, 4).setBackground('#388e3c');
    inventorySheet.getRange(row, 5).setBackground('#c62828');
    inventorySheet.getRange(row, 6).setBackground('#d32f2f');
    inventorySheet.setRowHeight(row, 30);
    row++;

    // Summary data row
    var summaryDataRange = inventorySheet.getRange(row, 1, 1, 6);
    summaryDataRange.setValues([
      [totalGloves, totalSleeves, gloveMonthlyAvg, sleeveMonthlyAvg, glovesLost + '/' + glovesFailed, sleevesLost + '/' + sleevesFailed]
    ]).setHorizontalAlignment('center').setFontSize(18).setFontWeight('bold');
    inventorySheet.getRange(row, 1).setBackground('#e3f2fd').setFontColor('#1565c0');
    inventorySheet.getRange(row, 2).setBackground('#e8f5e9').setFontColor('#2e7d32');
    inventorySheet.getRange(row, 3).setBackground('#e1f5fe').setFontColor('#0277bd');
    inventorySheet.getRange(row, 4).setBackground('#c8e6c9').setFontColor('#388e3c');
    inventorySheet.getRange(row, 5).setBackground('#ffebee').setFontColor('#c62828');
    inventorySheet.getRange(row, 6).setBackground('#ffcdd2').setFontColor('#d32f2f');
    inventorySheet.setRowHeight(row, 45);
    row += 2;

    // Gloves by Status
    row = writeStatusTableForInventory_LEGACY(inventorySheet, row, 'GLOVES BY STATUS', gloveStatusCounts, totalGloves);
    row++;

    // Sleeves by Status
    row = writeStatusTableForInventory_LEGACY(inventorySheet, row, 'SLEEVES BY STATUS', sleeveStatusCounts, totalSleeves);
    row++;

    // Inventory by Class
    inventorySheet.getRange(row, 1, 1, 6).merge()
      .setValue('INVENTORY BY CLASS')
      .setFontWeight('bold').setFontSize(12).setBackground('#5c6bc0').setFontColor('white').setHorizontalAlignment('center');
    inventorySheet.setRowHeight(row, 28);
    row++;
    inventorySheet.getRange(row, 1, 1, 6).setValues([
      ['Class', 'Gloves', 'Sleeves', 'Total', 'Glove Avg/Mo', 'Sleeve Avg/Mo']
    ]).setFontWeight('bold').setBackground('#9fa8da').setHorizontalAlignment('center');
    row++;

    var classes = ['0', '2', '3'];
    classes.forEach(function(cls) {
      var gCount = gloveClassCounts[cls] || 0;
      var sCount = sleeveClassCounts[cls] || 0;
      inventorySheet.getRange(row, 1, 1, 6).setValues([
        ['Class ' + cls, gCount, sCount, gCount + sCount, (gCount / 12).toFixed(1), (sCount / 12).toFixed(1)]
      ]).setHorizontalAlignment('center');
      row++;
    });
    row++;

    // Inventory by Location
    inventorySheet.getRange(row, 1, 1, 4).merge()
      .setValue('INVENTORY BY LOCATION')
      .setFontWeight('bold').setFontSize(12).setBackground('#26a69a').setFontColor('white').setHorizontalAlignment('center');
    inventorySheet.setRowHeight(row, 28);
    row++;
    inventorySheet.getRange(row, 1, 1, 4).setValues([
      ['Location', 'Gloves', 'Sleeves', 'Total']
    ]).setFontWeight('bold').setBackground('#80cbc4').setHorizontalAlignment('center');
    row++;

    var locationArr = Object.keys(locationCounts).map(function(loc) {
      return { location: loc, gloves: locationCounts[loc].gloves, sleeves: locationCounts[loc].sleeves };
    });
    locationArr.sort(function(a, b) {
      return (b.gloves + b.sleeves) - (a.gloves + a.sleeves);
    });

    locationArr.forEach(function(loc) {
      inventorySheet.getRange(row, 1, 1, 4).setValues([
        [loc.location, loc.gloves, loc.sleeves, loc.gloves + loc.sleeves]
      ]).setHorizontalAlignment('center');
      row++;
    });
    row++;

    // 12-Month Assignment Averages
    inventorySheet.getRange(row, 1, 1, 5).merge()
      .setValue('12-MONTH ASSIGNMENT AVERAGES (Current Assignments Only)')
      .setFontWeight('bold').setFontSize(12).setBackground('#7e57c2').setFontColor('white').setHorizontalAlignment('center');
    inventorySheet.setRowHeight(row, 28);
    row++;
    inventorySheet.getRange(row, 1, 1, 5).setValues([
      ['Category', 'Assignments (12mo)', 'Monthly Avg', 'Weekly Avg', 'Daily Avg']
    ]).setFontWeight('bold').setBackground('#b39ddb').setHorizontalAlignment('center');
    row++;

    var combinedAssigned = gloveAssigned + sleeveAssigned;
    inventorySheet.getRange(row, 1, 3, 5).setValues([
      ['All Gloves', gloveAssigned, gloveMonthlyAvg, (gloveAssigned / 52).toFixed(1), (gloveAssigned / 365).toFixed(2)],
      ['All Sleeves', sleeveAssigned, sleeveMonthlyAvg, (sleeveAssigned / 52).toFixed(1), (sleeveAssigned / 365).toFixed(2)],
      ['Combined', combinedAssigned, (combinedAssigned / 12).toFixed(1), (combinedAssigned / 52).toFixed(1), (combinedAssigned / 365).toFixed(2)]
    ]).setHorizontalAlignment('center');

    // Column widths
    inventorySheet.setColumnWidth(1, 150);
    inventorySheet.setColumnWidth(2, 100);
    inventorySheet.setColumnWidth(3, 100);
    inventorySheet.setColumnWidth(4, 100);
    inventorySheet.setColumnWidth(5, 100);
    inventorySheet.setColumnWidth(6, 120);

    inventorySheet.setFrozenRows(1);

    logEvent('LEGACY updateInventoryReports_OLD completed (should not be called)');
  } catch (e) {
    logEvent('Error in updateInventoryReports_OLD: ' + e, 'ERROR');
    throw e;
  }
}


// ============================================================================
// LEGACY HELPER FUNCTIONS
// These support the _OLD functions above and should not be used elsewhere
// ============================================================================

/**
 * @deprecated Legacy helper for updateInventoryReports_OLD
 */
function normalizeStatusForReport_LEGACY(status) {
  if (!status) return 'Unknown';
  var s = status.toString().toLowerCase().trim();

  if (s === 'assigned') return 'Assigned';
  if (s === 'on shelf') return 'On Shelf';
  if (s === 'in testing') return 'In Testing';
  if (s.indexOf('ready for delivery') !== -1) return 'Ready For Delivery';
  if (s.indexOf('ready for test') !== -1) return 'Ready For Test';
  if (s === 'failed rubber') return 'Failed Rubber';
  if (s === 'lost') return 'Lost';

  return status;
}

/**
 * @deprecated Legacy helper for updateInventoryReports_OLD
 */
function getStatusColorForReport_LEGACY(status) {
  var colors = {
    'Assigned': '#c8e6c9',
    'On Shelf': '#bbdefb',
    'In Testing': '#fff9c4',
    'Ready For Delivery': '#e1bee7',
    'Ready For Test': '#b3e5fc',
    'Failed Rubber': '#ffcdd2',
    'Lost': '#d7ccc8'
  };
  return colors[status] || '#ffffff';
}

/**
 * @deprecated Legacy helper for updateInventoryReports_OLD
 */
function writeStatusTableForInventory_LEGACY(sheet, startRow, title, statusCounts, total) {
  var row = startRow;

  sheet.getRange(row, 1, 1, 4).merge()
    .setValue(title)
    .setFontWeight('bold').setFontSize(12).setBackground('#b0bec5').setHorizontalAlignment('center');
  row++;

  sheet.getRange(row, 1, 1, 4).setValues([['Status', 'Count', '% of Total', 'Bar']])
    .setFontWeight('bold').setBackground('#cfd8dc').setHorizontalAlignment('center');
  row++;

  var statuses = ['Assigned', 'On Shelf', 'In Testing', 'Ready For Delivery', 'Ready For Test', 'Failed Rubber', 'Lost'];

  statuses.forEach(function(status) {
    var count = statusCounts[status] || 0;
    var pct = total > 0 ? ((count / total) * 100).toFixed(1) + '%' : '0%';
    var barLength = total > 0 ? Math.round((count / total) * 20) : 0;
    var bar = '';
    for (var i = 0; i < barLength; i++) bar += '|';

    sheet.getRange(row, 1, 1, 4).setValues([[status, count, pct, bar]]);
    sheet.getRange(row, 1).setBackground(getStatusColorForReport_LEGACY(status));
    sheet.getRange(row, 4).setFontColor('#1565c0').setHorizontalAlignment('left');
    sheet.getRange(row, 2, 1, 2).setHorizontalAlignment('center');
    row++;
  });

  sheet.getRange(row, 1).setValue('TOTAL').setFontWeight('bold');
  sheet.getRange(row, 2).setValue(total).setFontWeight('bold').setHorizontalAlignment('center');
  row++;

  return row;
}

