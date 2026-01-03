/**
 * Glove Manager – Purchase Needs Reports
 *
 * Functions for generating purchase needs reports.
 * Identifies items that need to be ordered based on swaps and reclaims.
 */

/**
 * Updates the Purchase Needs sheet with items that need ordering.
 * Consolidates data from Glove Swaps, Sleeve Swaps, and Reclaims sheets.
 * Creates prioritized tables based on urgency and timeframe.
 *
 * Menu item: Glove Manager → Update Purchase Needs
 */
function updatePurchaseNeeds() {
  try {
    logEvent('Updating Purchase Needs report...');
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var purchaseSheet = ss.getSheetByName('Purchase Needs') || ss.insertSheet('Purchase Needs');
    purchaseSheet.clear();

    // Table headers
    var tableHeaders = ['Severity', 'Timeframe', 'Item Type', 'Size', 'Class', 'Quantity Needed', 'Reason', 'Status', 'Notes'];

    // Table definitions with clear reasons - ordered by severity (1=most urgent, 5=least urgent)
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
        title: '📦 READY FOR DELIVERY',
        reason: 'Ready For Delivery',
        status: 'Packed For Delivery',
        severity: 2,
        timeframe: 'In 2 Weeks',
        titleBg: '#a5d6a7',
        headerBg: '#c8e6c9',
        match: function(status) { return status && status.indexOf('Ready For Delivery') === 0 && status.indexOf('Size Up') === -1; }
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
        title: '⏳ IN TESTING',
        reason: 'In Testing',
        status: 'Awaiting Test Results',
        severity: 4,
        timeframe: 'Within Month',
        titleBg: '#90caf9',
        headerBg: '#bbdefb',
        match: function(status) { return status && status.indexOf('In Testing') === 0 && status.indexOf('Size Up') === -1; }
      },
      {
        title: '⚠️ SIZE UP ASSIGNMENTS',
        reason: 'Size Up',
        status: 'Assigned (Size Up)',
        severity: 5,
        timeframe: 'Consider',
        titleBg: '#ffcc80',
        headerBg: '#ffe0b2',
        match: function(status) { return status && status.indexOf('In Stock (Size Up)') === 0; }
      }
    ];

    // Helper to process a swap tab
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

    var allRows = [{}, {}, {}, {}, {}, {}];
    processSwapTab('Glove Swaps', 'Glove', allRows);
    processSwapTab('Sleeve Swaps', 'Sleeve', allRows);

    // Also process Reclaims sheet for "Need to Purchase" items
    var reclaimsSheet = ss.getSheetByName('Reclaims');
    if (reclaimsSheet && reclaimsSheet.getLastRow() > 1) {
      var reclaimsData = reclaimsSheet.getDataRange().getValues();

      for (var ri = 0; ri < reclaimsData.length; ri++) {
        var rRow = reclaimsData[ri];
        var rFirstCell = (rRow[0] || '').toString().trim();

        // Skip headers, titles, location rows
        if (!rFirstCell || rFirstCell === 'Employee' ||
            rFirstCell.indexOf('⚠️') !== -1 ||
            rFirstCell.indexOf('📍') !== -1 ||
            rFirstCell.indexOf('Previous') !== -1 ||
            rFirstCell.indexOf('Lost Items') !== -1 ||
            rFirstCell === 'Item Type' ||
            rFirstCell === 'Location') {
          continue;
        }

        // Check if this is a reclaim data row with "Need to Purchase" status
        var rItemType = (rRow[1] || '').toString().trim();
        var rSize = (rRow[3] || '').toString().trim();
        var rClass = (rRow[4] || '').toString().trim();
        var rPickListStatus = (rRow[7] || '').toString().trim();
        var rEmployee = rFirstCell;

        // Only process if it's a valid reclaim row with Need to Purchase status
        if ((rItemType === 'Glove' || rItemType === 'Sleeve') &&
            rSize && rClass &&
            rPickListStatus.indexOf('Need to Purchase') !== -1) {

          var classNum = parseInt(rClass, 10);
          var key = rItemType + '|' + rSize + '|' + classNum;

          // Add to the "Need to Order" table (index 0)
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
      readyForDelivery: 0,
      readyForDeliverySizeUp: 0,
      inTestingSizeUp: 0,
      inTesting: 0,
      sizeUp: 0
    };

    for (var t = 0; t < tables.length; t++) {
      var keys = Object.keys(allRows[t]);
      for (var k = 0; k < keys.length; k++) {
        var qty = allRows[t][keys[k]].qty;
        if (t === 0) grandTotals.needToOrder += qty;
        else if (t === 1) grandTotals.readyForDelivery += qty;
        else if (t === 2) grandTotals.readyForDeliverySizeUp += qty;
        else if (t === 3) grandTotals.inTestingSizeUp += qty;
        else if (t === 4) grandTotals.inTesting += qty;
        else if (t === 5) grandTotals.sizeUp += qty;
      }
    }

    var rowIdx = 1;

    // Write summary section at top
    purchaseSheet.getRange(rowIdx, 1, 1, 9).merge().setValue('📊 PURCHASE NEEDS SUMMARY - Generated: ' + new Date().toLocaleString())
      .setFontWeight('bold').setFontSize(14).setBackground('#b0bec5').setFontColor('#333333').setHorizontalAlignment('center');
    rowIdx++;

    // Summary stats row
    var topSummaryData = [
      ['1️⃣ Immediate: ' + grandTotals.needToOrder,
       '2️⃣ 2 Weeks: ' + (grandTotals.readyForDelivery + grandTotals.readyForDeliverySizeUp),
       '3️⃣ 3 Weeks: ' + grandTotals.inTestingSizeUp,
       '4️⃣ Month: ' + grandTotals.inTesting,
       '5️⃣ Consider: ' + grandTotals.sizeUp,
       '', '', '', '']
    ];
    purchaseSheet.getRange(rowIdx, 1, 1, 9).setValues(topSummaryData)
      .setBackground('#eceff1').setFontWeight('bold').setHorizontalAlignment('center');
    rowIdx += 2;

    // Write each table
    for (var t = 0; t < tables.length; t++) {
      var keys = Object.keys(allRows[t]);
      if (keys.length === 0) continue;

      // Sort keys by Class (numeric), then by Size
      keys.sort(function(a, b) {
        var aData = allRows[t][a];
        var bData = allRows[t][b];
        if (aData.class !== bData.class) return aData.class - bData.class;
        var aSize = parseFloat(aData.size) || 0;
        var bSize = parseFloat(bData.size) || 0;
        if (aSize !== bSize) return aSize - bSize;
        return aData.itemType.localeCompare(bData.itemType);
      });

      // Table title
      purchaseSheet.getRange(rowIdx, 1, 1, 9).merge().setValue(tables[t].title)
        .setFontWeight('bold').setFontSize(12).setBackground(tables[t].titleBg).setFontColor('#333333').setHorizontalAlignment('center');
      rowIdx++;

      // Table headers
      purchaseSheet.getRange(rowIdx, 1, 1, tableHeaders.length).setValues([tableHeaders])
        .setFontWeight('bold').setBackground(tables[t].headerBg).setHorizontalAlignment('center');
      rowIdx++;

      // Table rows
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

      // Set Class column to plain number format
      var numDataRows = rowIdx - dataStartRow;
      if (numDataRows > 0) {
        purchaseSheet.getRange(dataStartRow, 5, numDataRows, 1).setNumberFormat('0');
      }

      // Table total row
      purchaseSheet.getRange(rowIdx, 1, 1, 5).merge().setValue('TOTAL')
        .setFontWeight('bold').setHorizontalAlignment('right').setBackground('#e0e0e0');
      purchaseSheet.getRange(rowIdx, 6).setValue(tableTotal)
        .setFontWeight('bold').setHorizontalAlignment('center').setBackground('#e0e0e0');
      purchaseSheet.getRange(rowIdx, 7, 1, 3).setBackground('#e0e0e0');
      rowIdx += 2;
    }

    // If no data at all, show message
    var totalItems = grandTotals.needToOrder + grandTotals.sizeUp + grandTotals.inTesting + grandTotals.inTestingSizeUp + grandTotals.readyForDelivery + grandTotals.readyForDeliverySizeUp;
    if (totalItems === 0) {
      purchaseSheet.getRange(rowIdx, 1, 1, 9).merge().setValue('✅ No purchase needs at this time!')
        .setFontWeight('bold').setFontSize(12).setBackground('#4caf50').setFontColor('white').setHorizontalAlignment('center');
    }

    // Create summary table to the right
    var summaryStartRow = 4;
    var summaryCol = 11;

    purchaseSheet.getRange(summaryStartRow, summaryCol, 1, 2).merge().setValue('📊 SUMMARY BY TIMEFRAME')
      .setFontWeight('bold').setBackground('#b0bec5').setFontColor('#333333').setHorizontalAlignment('center');

    var summaryData = [
      ['1️⃣ Immediate', grandTotals.needToOrder, '#ef9a9a'],
      ['2️⃣ In 2 Weeks', grandTotals.readyForDelivery + grandTotals.readyForDeliverySizeUp, '#a5d6a7'],
      ['3️⃣ In 3 Weeks', grandTotals.inTestingSizeUp, '#ce93d8'],
      ['4️⃣ Within Month', grandTotals.inTesting, '#90caf9'],
      ['5️⃣ Consider', grandTotals.sizeUp, '#ffcc80']
    ];

    for (var s = 0; s < summaryData.length; s++) {
      var sRow = summaryStartRow + 1 + s;
      purchaseSheet.getRange(sRow, summaryCol).setValue(summaryData[s][0])
        .setBackground(summaryData[s][2]).setFontColor('#333333').setFontWeight('bold');
      purchaseSheet.getRange(sRow, summaryCol + 1).setValue(summaryData[s][1])
        .setBackground(summaryData[s][2]).setFontColor('#333333').setFontWeight('bold').setHorizontalAlignment('center');
    }

    var totalRow = summaryStartRow + 6;
    var grandTotal = grandTotals.needToOrder + grandTotals.sizeUp + grandTotals.inTesting + grandTotals.inTestingSizeUp + grandTotals.readyForDelivery + grandTotals.readyForDeliverySizeUp;
    purchaseSheet.getRange(totalRow, summaryCol).setValue('TOTAL')
      .setBackground('#cfd8dc').setFontColor('#333333').setFontWeight('bold');
    purchaseSheet.getRange(totalRow, summaryCol + 1).setValue(grandTotal)
      .setBackground('#cfd8dc').setFontColor('#333333').setFontWeight('bold').setHorizontalAlignment('center');

    // Column widths
    var widths = [60, 100, 75, 70, 50, 100, 170, 175, 300];
    for (var i = 0; i < widths.length; i++) {
      purchaseSheet.setColumnWidth(i + 1, widths[i]);
    }
    purchaseSheet.setColumnWidth(11, 140);
    purchaseSheet.setColumnWidth(12, 55);
    purchaseSheet.setFrozenRows(2);

    logEvent('Purchase Needs report generated successfully.');
  } catch (e) {
    logEvent('Error in updatePurchaseNeeds: ' + e, 'ERROR');
    throw e;
  }
}

