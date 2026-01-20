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
 * ONLY shows items needing purchase: no inventory available OR only size-up available (+1 sleeve/+0.5 glove).
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

    // Table definitions - ordered by severity (1=most urgent, 5=least urgent)
    // Tracks items that need purchasing or are awaiting testing
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
        title: '⏳ IN TESTING',
        reason: 'In Testing',
        status: 'Awaiting Test',
        severity: 3,
        timeframe: 'In 3 Weeks',
        titleBg: '#fff9c4',
        headerBg: '#fffde7',
        // Match "In Testing ⏳" but NOT "In Testing (Size Up)"
        match: function(status) {
          if (!status) return false;
          // Check if status contains "In Testing" anywhere (handles emoji prefix/suffix)
          var hasInTesting = status.indexOf('In Testing') !== -1;
          var hasSizeUp = status.indexOf('Size Up') !== -1;
          return hasInTesting && !hasSizeUp;
        }
      },
      {
        title: '⏳⚠️ IN TESTING (SIZE UP)',
        reason: 'In Testing + Size Up',
        status: 'Awaiting Test (Size Up)',
        severity: 4,
        timeframe: 'In 3 Weeks',
        titleBg: '#ce93d8',
        headerBg: '#e1bee7',
        match: function(status) { return status && status.indexOf('In Testing (Size Up)') === 0; }
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

    var allRows = [{}, {}, {}, {}, {}];
    processSwapTab('Glove Swaps', 'Glove', allRows);
    processSwapTab('Sleeve Swaps', 'Sleeve', allRows);

    // Also process Reclaims sheet for "Need to Purchase" and "In Testing" items
    // Only process "Class X Reclaims" sections (active employees with pick list items)
    // Skip "Previous Employee Reclaims" since those don't have pick list assignments
    var reclaimsSheet = ss.getSheetByName('Reclaims');
    if (reclaimsSheet && reclaimsSheet.getLastRow() > 1) {
      var reclaimsData = reclaimsSheet.getDataRange().getValues();
      var inReclaimSection = false;
      var headerRowFound = false;

      // Column indices (will be set when we find header row)
      var employeeCol = -1;
      var itemTypeCol = -1;
      var sizeCol = -1;
      var classCol = -1;
      var statusCol = -1;

      console.log('DEBUG: Processing Reclaims sheet, ' + reclaimsData.length + ' rows');

      for (var ri = 0; ri < reclaimsData.length; ri++) {
        var rRow = reclaimsData[ri];
        var rFirstCell = String(rRow[0] || '').trim();
        var firstCellLower = rFirstCell.toLowerCase();

        // Detect section headers using lowercase comparison (handles emoji prefixes)
        // Class 3 Reclaims contains "downgrade", Class 2 Reclaims contains "upgrade"
        if ((firstCellLower.indexOf('reclaims') !== -1 && firstCellLower.indexOf('downgrade') !== -1) ||
            (firstCellLower.indexOf('reclaims') !== -1 && firstCellLower.indexOf('upgrade') !== -1)) {
          inReclaimSection = true;
          headerRowFound = false; // Reset to find new header
          console.log('DEBUG Row ' + (ri+1) + ': Found Class Reclaims section: "' + rFirstCell.substring(0,50) + '"');
          continue;
        }

        // Exit section when we hit other headers
        if (firstCellLower.indexOf('previous employee') !== -1 ||
            firstCellLower.indexOf('class location approvals') !== -1 ||
            firstCellLower.indexOf('location approvals') !== -1 ||
            firstCellLower.indexOf('lost items') !== -1) {
          if (inReclaimSection) {
            console.log('DEBUG Row ' + (ri+1) + ': Exiting reclaim section');
          }
          inReclaimSection = false;
          headerRowFound = false;
          continue;
        }

        // Skip if not in a reclaim section
        if (!inReclaimSection) continue;

        // Find header row within reclaim section
        if (firstCellLower === 'employee') {
          headerRowFound = true;
          // Find column indices dynamically
          for (var h = 0; h < rRow.length; h++) {
            var header = String(rRow[h]).toLowerCase().trim();
            if (header === 'employee') employeeCol = h;
            if (header === 'item type') itemTypeCol = h;
            if (header === 'size') sizeCol = h;
            if (header === 'class') classCol = h;
            if (header.indexOf('pick list') !== -1 && header.indexOf('status') !== -1) statusCol = h;
          }
          console.log('DEBUG Row ' + (ri+1) + ': Header found. statusCol=' + statusCol);
          continue;
        }

        // Skip if we haven't found header row yet or columns not found
        if (!headerRowFound || employeeCol === -1) continue;

        // Skip empty rows, stage rows, or location headers
        if (!rFirstCell || rFirstCell.indexOf('📍') !== -1 ||
            rFirstCell.indexOf('⚠️') !== -1 || firstCellLower.indexOf('stage') !== -1) {
          continue;
        }

        // Read data from columns
        var rEmployee = rFirstCell;
        var rItemType = itemTypeCol !== -1 ? String(rRow[itemTypeCol] || '').trim() : '';
        var rSize = sizeCol !== -1 ? String(rRow[sizeCol] || '').trim() : '';
        var rClass = classCol !== -1 ? String(rRow[classCol] || '').trim() : '';
        var rPickListStatus = statusCol !== -1 ? String(rRow[statusCol] || '').trim() : '';

        console.log('DEBUG Row ' + (ri+1) + ': ' + rEmployee + ', ' + rItemType + ', Size=' + rSize + ', Class=' + rClass + ', Status="' + rPickListStatus + '"');

        // Process valid reclaim rows with relevant statuses
        if ((rItemType === 'Glove' || rItemType === 'Sleeve') && rSize && rClass) {
          var classNum = parseInt(rClass, 10);
          if (isNaN(classNum)) continue;
          var key = rItemType + '|' + rSize + '|' + classNum;

          // Match against each table type
          for (var t = 0; t < tables.length; t++) {
            var matchResult = tables[t].match(rPickListStatus);
            if (matchResult) {
              console.log('DEBUG: MATCHED! ' + rEmployee + ' status "' + rPickListStatus + '" -> ' + tables[t].title);
              if (!allRows[t][key]) {
                allRows[t][key] = { itemType: rItemType, size: rSize, class: classNum, qty: 0, employees: [] };
              }
              allRows[t][key].qty++;
              var employeeLabel = rEmployee + ' (Reclaim)';
              if (allRows[t][key].employees.indexOf(employeeLabel) === -1) {
                allRows[t][key].employees.push(employeeLabel);
              }
              break;
            }
          }
        }
      }
      console.log('DEBUG: Finished processing Reclaims');
    }

    var grandTotals = {
      needToOrder: 0,
      readyForDeliverySizeUp: 0,
      inTesting: 0,
      inTestingSizeUp: 0,
      sizeUp: 0
    };

    for (var t = 0; t < tables.length; t++) {
      var keys = Object.keys(allRows[t]);
      for (var k = 0; k < keys.length; k++) {
        var qty = allRows[t][keys[k]].qty;
        if (t === 0) grandTotals.needToOrder += qty;
        else if (t === 1) grandTotals.readyForDeliverySizeUp += qty;
        else if (t === 2) grandTotals.inTesting += qty;
        else if (t === 3) grandTotals.inTestingSizeUp += qty;
        else if (t === 4) grandTotals.sizeUp += qty;
      }
    }

    var rowIdx = 1;

    // Write summary section at top
    purchaseSheet.getRange(rowIdx, 1, 1, 9).merge().setValue('📊 PURCHASE NEEDS SUMMARY - Generated: ' + new Date().toLocaleString())
      .setFontWeight('bold').setFontSize(14).setBackground('#b0bec5').setFontColor('#333333').setHorizontalAlignment('center');
    rowIdx++;

    // Summary stats row - combine In Testing counts for the "In 3 Weeks" timeframe
    var in3WeeksTotal = grandTotals.inTesting + grandTotals.inTestingSizeUp;
    var topSummaryData = [
      ['1️⃣ Immediate: ' + grandTotals.needToOrder,
       '2️⃣ In 2 Weeks: ' + grandTotals.readyForDeliverySizeUp,
       '3️⃣ In 3 Weeks: ' + in3WeeksTotal,
       '4️⃣ Consider: ' + grandTotals.sizeUp,
       '',
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
    var totalItems = grandTotals.needToOrder + grandTotals.readyForDeliverySizeUp + grandTotals.inTesting + grandTotals.inTestingSizeUp + grandTotals.sizeUp;
    if (totalItems === 0) {
      purchaseSheet.getRange(rowIdx, 1, 1, 9).merge().setValue('✅ No purchase needs at this time!')
        .setFontWeight('bold').setFontSize(12).setBackground('#4caf50').setFontColor('white').setHorizontalAlignment('center');
    }

    // Create summary table to the right
    var summaryStartRow = 4;
    var summaryCol = 11;

    purchaseSheet.getRange(summaryStartRow, summaryCol, 1, 2).merge().setValue('📊 SUMMARY BY TIMEFRAME')
      .setFontWeight('bold').setBackground('#b0bec5').setFontColor('#333333').setHorizontalAlignment('center');

    // Combine In Testing counts for summary (both are "In 3 Weeks")
    var summaryData = [
      ['1️⃣ Immediate', grandTotals.needToOrder, '#ef9a9a'],
      ['2️⃣ In 2 Weeks', grandTotals.readyForDeliverySizeUp, '#80cbc4'],
      ['3️⃣ In 3 Weeks', grandTotals.inTesting + grandTotals.inTestingSizeUp, '#ce93d8'],
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
    var grandTotal = grandTotals.needToOrder + grandTotals.readyForDeliverySizeUp + grandTotals.inTesting + grandTotals.inTestingSizeUp + grandTotals.sizeUp;
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

