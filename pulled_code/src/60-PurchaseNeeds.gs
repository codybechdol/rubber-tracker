/**
 * Glove Manager – Purchase Needs Reports
 *
 * Simplified 3-tier priority system:
 *   HIGH PRIORITY   – Less than 2 of any size On Shelf in inventory
 *   MEDIUM PRIORITY – Swap sheet items with no availability or only size-up available
 *   LOW PRIORITY    – Currently assigned (In Service) items that are a half size up
 */

/**
 * Updates the Purchase Needs sheet with items that need ordering.
 * Uses a simplified 3-tier priority system based on shelf stock,
 * swap shortages, and current size-up assignments.
 *
 * Menu item: Glove Manager → Update Purchase Needs
 */
function updatePurchaseNeeds() {
  try {
    logEvent('Updating Purchase Needs report...');
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var purchaseSheet = ss.getSheetByName('Purchase Needs') || ss.insertSheet('Purchase Needs');
    purchaseSheet.clear();

    // Column headers for all tables (10 columns)
    var tableHeaders = ['Priority', 'Item Type', 'Size', 'Class', 'On Shelf', 'Qty to Order', 'Reason', 'Status', 'In Testing', 'Notes'];
    var numCols = tableHeaders.length; // 10

    // =========================================================================
    // Build In Testing lookup from Gloves and Sleeves inventory
    // Key: "Glove|10|2" -> [{itemNum, dateSent, expectedReturn}]
    // =========================================================================
    var inTestingMap = buildInTestingMap(ss);

    // =========================================================================
    // HIGH PRIORITY – Less than 2 of any size On Shelf
    // =========================================================================
    var highPriorityItems = collectHighPriorityItems(ss);

    // =========================================================================
    // MEDIUM PRIORITY – Swap shortages (no availability or size-up only)
    // =========================================================================
    var mediumPriorityItems = collectMediumPriorityItems(ss);

    // =========================================================================
    // LOW PRIORITY – Currently assigned items that are a half size up
    // =========================================================================
    var lowPriorityItems = collectLowPriorityItems(ss);

    // Deduplicate: remove LOW items that already appear in MEDIUM (same size+class+type)
    var mediumKeys = {};
    for (var mk = 0; mk < mediumPriorityItems.length; mk++) {
      mediumKeys[mediumPriorityItems[mk].key] = true;
    }
    lowPriorityItems = lowPriorityItems.filter(function(item) {
      return !mediumKeys[item.key];
    });

    // Enrich all items with In Testing info
    var allItems = [highPriorityItems, mediumPriorityItems, lowPriorityItems];
    for (var ai = 0; ai < allItems.length; ai++) {
      for (var aj = 0; aj < allItems[ai].length; aj++) {
        var item = allItems[ai][aj];
        item.inTesting = formatInTestingInfo(inTestingMap[item.key]);
      }
    }

    // =========================================================================
    // Write to sheet
    // =========================================================================
    var highTotal = 0, medTotal = 0, lowTotal = 0;
    for (var h = 0; h < highPriorityItems.length; h++) highTotal += highPriorityItems[h].qtyToOrder;
    for (var m = 0; m < mediumPriorityItems.length; m++) medTotal += mediumPriorityItems[m].qtyToOrder;
    for (var l = 0; l < lowPriorityItems.length; l++) lowTotal += lowPriorityItems[l].qtyToOrder;

    var rowIdx = 1;

    // Title row
    purchaseSheet.getRange(rowIdx, 1, 1, numCols).merge()
      .setValue('📊 PURCHASE NEEDS SUMMARY - Generated: ' + new Date().toLocaleString())
      .setFontWeight('bold').setFontSize(14).setBackground('#b0bec5').setFontColor('#333333').setHorizontalAlignment('center');
    rowIdx++;

    // Summary row
    var summaryData = [
      ['🔴 High: ' + highTotal, '🟠 Medium: ' + medTotal, '🟢 Low: ' + lowTotal,
       'Total: ' + (highTotal + medTotal + lowTotal), '', '', '', '', '', '']
    ];
    purchaseSheet.getRange(rowIdx, 1, 1, numCols).setValues(summaryData)
      .setBackground('#eceff1').setFontWeight('bold').setHorizontalAlignment('center');
    rowIdx += 2;

    // Table definitions
    var tables = [
      {
        title: '🔴 HIGH PRIORITY - LOW SHELF STOCK',
        items: highPriorityItems,
        titleBg: '#ef9a9a',
        headerBg: '#ffcdd2'
      },
      {
        title: '🟠 MEDIUM PRIORITY - SWAP SHORTAGES',
        items: mediumPriorityItems,
        titleBg: '#ffcc80',
        headerBg: '#ffe0b2'
      },
      {
        title: '🟢 LOW PRIORITY - CONSIDER ORDERING',
        items: lowPriorityItems,
        titleBg: '#a5d6a7',
        headerBg: '#c8e6c9'
      }
    ];

    // Class sub-header colors for clear visual distinction
    var classColors = {
      0: { bg: '#e3f2fd', text: '#1565c0', label: '⚡ Class 0' },   // Blue
      2: { bg: '#fff3e0', text: '#e65100', label: '⚡⚡ Class 2' },  // Orange
      3: { bg: '#fce4ec', text: '#b71c1c', label: '⚡⚡⚡ Class 3' }  // Red/Pink
    };
    var classRowBands = {
      0: '#f5f9ff',  // Very light blue
      2: '#fffaf3',  // Very light orange
      3: '#fdf2f4'   // Very light pink
    };

    for (var t = 0; t < tables.length; t++) {
      var tbl = tables[t];
      if (tbl.items.length === 0) continue;

      // Sort items by Class then Item Type then Size
      tbl.items.sort(function(a, b) {
        if (a.classNum !== b.classNum) return a.classNum - b.classNum;
        if (a.itemType !== b.itemType) return a.itemType.localeCompare(b.itemType);
        var aSize = parseFloat(a.size) || 0;
        var bSize = parseFloat(b.size) || 0;
        return aSize - bSize;
      });

      // Table title
      purchaseSheet.getRange(rowIdx, 1, 1, numCols).merge().setValue(tbl.title)
        .setFontWeight('bold').setFontSize(12).setBackground(tbl.titleBg).setFontColor('#333333').setHorizontalAlignment('center');
      rowIdx++;

      // Table headers
      purchaseSheet.getRange(rowIdx, 1, 1, tableHeaders.length).setValues([tableHeaders])
        .setFontWeight('bold').setBackground(tbl.headerBg).setHorizontalAlignment('center');
      rowIdx++;

      // Table rows grouped by class with sub-headers
      var tableTotal = 0;
      var dataStartRow = rowIdx;
      var lastClass = null;
      for (var k = 0; k < tbl.items.length; k++) {
        var r = tbl.items[k];
        var cls = parseInt(r.classNum, 10);

        // Insert class sub-header when class changes
        if (cls !== lastClass) {
          var classInfo = classColors[cls] || { bg: '#eeeeee', text: '#333333', label: 'Class ' + cls };
          purchaseSheet.getRange(rowIdx, 1, 1, numCols).merge()
            .setValue(classInfo.label)
            .setFontWeight('bold').setFontSize(11)
            .setBackground(classInfo.bg).setFontColor(classInfo.text)
            .setHorizontalAlignment('left');
          rowIdx++;
          lastClass = cls;
        }

        tableTotal += r.qtyToOrder;
        var rowData = [
          r.priority, r.itemType, r.size, cls,
          r.onShelf, r.qtyToOrder, r.reason, r.status, r.inTesting || '', r.notes
        ];
        purchaseSheet.getRange(rowIdx, 1, 1, rowData.length).setValues([rowData]);
        purchaseSheet.getRange(rowIdx, 1, 1, 8).setHorizontalAlignment('center');
        purchaseSheet.getRange(rowIdx, 9).setWrap(true);
        purchaseSheet.getRange(rowIdx, 10).setWrap(true);

        // Apply light class-specific row banding
        var bandColor = classRowBands[cls] || '#ffffff';
        purchaseSheet.getRange(rowIdx, 1, 1, numCols).setBackground(bandColor);

        rowIdx++;
      }

      // Format Class column as plain numbers (skip sub-header rows)
      var numDataRows = rowIdx - dataStartRow;
      if (numDataRows > 0) {
        purchaseSheet.getRange(dataStartRow, 4, numDataRows, 1).setNumberFormat('0');
      }

      // Table total row
      purchaseSheet.getRange(rowIdx, 1, 1, 5).merge().setValue('TOTAL')
        .setFontWeight('bold').setHorizontalAlignment('right').setBackground('#e0e0e0');
      purchaseSheet.getRange(rowIdx, 6).setValue(tableTotal)
        .setFontWeight('bold').setHorizontalAlignment('center').setBackground('#e0e0e0');
      purchaseSheet.getRange(rowIdx, 7, 1, 4).setBackground('#e0e0e0');
      rowIdx += 2;
    }

    // If no data at all
    if (highPriorityItems.length === 0 && mediumPriorityItems.length === 0 && lowPriorityItems.length === 0) {
      purchaseSheet.getRange(rowIdx, 1, 1, numCols).merge().setValue('✅ No purchase needs at this time!')
        .setFontWeight('bold').setFontSize(12).setBackground('#4caf50').setFontColor('white').setHorizontalAlignment('center');
    }

    // Summary table to the right
    var summaryStartRow = 4;
    var summaryCol = 12;

    purchaseSheet.getRange(summaryStartRow, summaryCol, 1, 3).merge().setValue('📊 SUMMARY BY PRIORITY')
      .setFontWeight('bold').setBackground('#b0bec5').setFontColor('#333333').setHorizontalAlignment('center');

    var summaryRows = [
      ['🔴 High Priority', highTotal, 'Less than 2 on shelf', '#ef9a9a'],
      ['🟠 Medium Priority', medTotal, 'Swap needed, none or only size-up available', '#ffcc80'],
      ['🟢 Low Priority', lowTotal, 'Currently assigned a size up', '#a5d6a7']
    ];

    for (var s = 0; s < summaryRows.length; s++) {
      var sRow = summaryStartRow + 1 + s;
      purchaseSheet.getRange(sRow, summaryCol).setValue(summaryRows[s][0])
        .setBackground(summaryRows[s][3]).setFontColor('#333333').setFontWeight('bold');
      purchaseSheet.getRange(sRow, summaryCol + 1).setValue(summaryRows[s][1])
        .setBackground(summaryRows[s][3]).setFontColor('#333333').setFontWeight('bold').setHorizontalAlignment('center');
      purchaseSheet.getRange(sRow, summaryCol + 2).setValue(summaryRows[s][2])
        .setBackground(summaryRows[s][3]).setFontColor('#555555').setFontStyle('italic');
    }

    var totalRow = summaryStartRow + 4;
    purchaseSheet.getRange(totalRow, summaryCol).setValue('TOTAL')
      .setBackground('#cfd8dc').setFontColor('#333333').setFontWeight('bold');
    purchaseSheet.getRange(totalRow, summaryCol + 1).setValue(highTotal + medTotal + lowTotal)
      .setBackground('#cfd8dc').setFontColor('#333333').setFontWeight('bold').setHorizontalAlignment('center');
    purchaseSheet.getRange(totalRow, summaryCol + 2).setBackground('#cfd8dc');

    // Column widths
    var widths = [60, 75, 70, 50, 65, 80, 200, 175, 220, 300];
    for (var i = 0; i < widths.length; i++) {
      purchaseSheet.setColumnWidth(i + 1, widths[i]);
    }
    purchaseSheet.setColumnWidth(12, 140);
    purchaseSheet.setColumnWidth(13, 55);
    purchaseSheet.setColumnWidth(14, 280);
    purchaseSheet.setFrozenRows(2);

    logEvent('Purchase Needs report generated successfully.');
  } catch (e) {
    logEvent('Error in updatePurchaseNeeds: ' + e, 'ERROR');
    throw e;
  }
}


/**
 * HIGH PRIORITY: Count On Shelf items by (itemType, size, class).
 * Flag any combo with fewer than 2 on the shelf.
 * Also checks Employees sheet for sizes that employees need.
 */
function collectHighPriorityItems(ss) {
  var results = [];

  // Count On Shelf items from Gloves and Sleeves sheets
  var onShelfCounts = {}; // key = "Glove|10|2" -> count

  var sheetConfigs = [
    { sheetName: SHEET_GLOVES, itemType: 'Glove', isGloves: true },
    { sheetName: SHEET_SLEEVES, itemType: 'Sleeve', isGloves: false }
  ];

  for (var sc = 0; sc < sheetConfigs.length; sc++) {
    var config = sheetConfigs[sc];
    var sheet = ss.getSheetByName(config.sheetName);
    if (!sheet || sheet.getLastRow() < 2) continue;

    var data = sheet.getDataRange().getValues();
    for (var i = 1; i < data.length; i++) {
      var row = data[i];
      var itemNum = String(row[COLS.INVENTORY.ITEM_NUM - 1] || '').trim();
      if (!itemNum) continue;

      var size = String(row[COLS.INVENTORY.SIZE - 1] || '').trim();
      var classNum = parseInt(row[COLS.INVENTORY.CLASS - 1], 10);
      var status = String(row[COLS.INVENTORY.STATUS - 1] || '').trim().toLowerCase();
      var notes = String(row[COLS.INVENTORY.NOTES - 1] || '').trim().toLowerCase();

      if (isNaN(classNum) || !size) continue;

      // Skip lost/locate items
      if (notes.indexOf('lost-locate') !== -1) continue;

      // Normalize sleeve sizes for consistent grouping
      if (!config.isGloves) {
        size = capitalizeSleeveSize(normalizeSleeveSize(size));
      }

      var key = config.itemType + '|' + size + '|' + classNum;

      // Initialize counter if first time seeing this size+class
      if (onShelfCounts[key] === undefined) {
        onShelfCounts[key] = 0;
      }

      if (status === 'on shelf') {
        onShelfCounts[key]++;
      }
    }
  }

  // Also check Employees sheet for sizes employees need that might not exist in inventory
  var empSheet = ss.getSheetByName(SHEET_EMPLOYEES);
  if (empSheet && empSheet.getLastRow() > 1) {
    var empData = empSheet.getDataRange().getValues();
    for (var e = 1; e < empData.length; e++) {
      var empRow = empData[e];
      var empName = String(empRow[COLS.EMPLOYEES.NAME - 1] || '').trim();
      var empClass = parseInt(empRow[COLS.EMPLOYEES.CLASS - 1], 10);
      var empLocation = String(empRow[COLS.EMPLOYEES.LOCATION - 1] || '').trim().toLowerCase();

      if (!empName || isNaN(empClass)) continue;

      // Skip status locations (Previous Employee, Vacation, etc.)
      if (typeof isStatusLocation === 'function' && isStatusLocation(empLocation)) continue;

      var gloveSize = String(empRow[COLS.EMPLOYEES.GLOVE_SIZE - 1] || '').trim();
      var sleeveSize = String(empRow[COLS.EMPLOYEES.SLEEVE_SIZE - 1] || '').trim();

      if (gloveSize && gloveSize.toLowerCase() !== 'n/a') {
        var gKey = 'Glove|' + gloveSize + '|' + empClass;
        if (onShelfCounts[gKey] === undefined) {
          onShelfCounts[gKey] = 0;
        }
      }

      if (sleeveSize && sleeveSize.toLowerCase() !== 'n/a') {
        var normalizedSleeve = capitalizeSleeveSize(normalizeSleeveSize(sleeveSize));
        var sKey = 'Sleeve|' + normalizedSleeve + '|' + empClass;
        if (onShelfCounts[sKey] === undefined) {
          onShelfCounts[sKey] = 0;
        }
      }
    }
  }

  // Build results for any combo with < 2 on shelf
  var keys = Object.keys(onShelfCounts);
  for (var k = 0; k < keys.length; k++) {
    var count = onShelfCounts[keys[k]];
    if (count < 2) {
      var parts = keys[k].split('|');
      var qtyNeeded = 2 - count;
      results.push({
        key: keys[k],
        priority: 'High',
        itemType: parts[0],
        size: parts[1],
        classNum: parseInt(parts[2], 10),
        onShelf: count,
        qtyToOrder: qtyNeeded,
        reason: 'Low shelf stock (' + count + ' of 2)',
        status: 'NEED TO ORDER',
        notes: ''
      });
    }
  }

  return results;
}


/**
 * MEDIUM PRIORITY: Scan swap sheets for items with no availability
 * or only a size-up available.
 */
function collectMediumPriorityItems(ss) {
  var allRows = {};

  processSwapTabForMedium(ss, SHEET_GLOVE_SWAPS, 'Glove', allRows);
  processSwapTabForMedium(ss, SHEET_SLEEVE_SWAPS, 'Sleeve', allRows);

  // Also process Reclaims for "Need to Purchase" items
  processReclaimsForMedium(ss, allRows);

  var results = [];
  var keys = Object.keys(allRows);
  for (var k = 0; k < keys.length; k++) {
    var item = allRows[keys[k]];
    var reasonParts = [];
    if (item.noneAvailable > 0) reasonParts.push(item.noneAvailable + ' with no availability');
    if (item.sizeUpOnly > 0) reasonParts.push(item.sizeUpOnly + ' with size up only');
    var reasonStr = reasonParts.join(', ');

    results.push({
      key: keys[k],
      priority: 'Medium',
      itemType: item.itemType,
      size: item.size,
      classNum: item.classNum,
      onShelf: '',
      qtyToOrder: item.qty,
      reason: reasonStr,
      status: 'NEED TO ORDER',
      notes: item.employees.join(', ')
    });
  }

  return results;
}


/**
 * Helper: Process a swap tab for MEDIUM priority items.
 * Looks for "Need to Purchase" or "Size Up" statuses.
 */
function processSwapTabForMedium(ss, tabName, itemType, allRows) {
  var sheet = ss.getSheetByName(tabName);
  if (!sheet) return;

  var data = sheet.getDataRange().getValues();
  var currentClass = null;

  for (var i = 0; i < data.length; i++) {
    var row = data[i];
    var cellA = row[0];

    // Detect class section header
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
    if (typeof cellA === 'string' && cellA.indexOf('📍') !== -1) continue;

    var size = String(row[2] || '').trim();
    var status = String(row[7] || '').trim();
    var employeeName = String(row[0] || '').trim();

    if (!size || !status) continue;

    var isNoneAvailable = status.indexOf('Need to Purchase') !== -1;
    var isSizeUp = status.indexOf('Size Up') !== -1;

    if (!isNoneAvailable && !isSizeUp) continue;

    var key = itemType + '|' + size + '|' + currentClass;

    if (!allRows[key]) {
      allRows[key] = {
        itemType: itemType,
        size: size,
        classNum: currentClass,
        qty: 0,
        noneAvailable: 0,
        sizeUpOnly: 0,
        employees: []
      };
    }
    allRows[key].qty++;
    if (isNoneAvailable) allRows[key].noneAvailable++;
    if (isSizeUp) allRows[key].sizeUpOnly++;

    if (employeeName && allRows[key].employees.indexOf(employeeName) === -1) {
      allRows[key].employees.push(employeeName);
    }
  }
}


/**
 * Helper: Process Reclaims sheet for MEDIUM priority items.
 * Only reads active reclaim sections (not Previous Employee).
 */
function processReclaimsForMedium(ss, allRows) {
  var reclaimsSheet = ss.getSheetByName('Reclaims');
  if (!reclaimsSheet || reclaimsSheet.getLastRow() < 2) return;

  var reclaimsData = reclaimsSheet.getDataRange().getValues();
  var inReclaimSection = false;
  var reclaimDirection = '';
  var headerRowFound = false;
  var employeeCol = -1, itemTypeCol = -1, sizeCol = -1, classCol = -1, statusCol = -1;

  for (var ri = 0; ri < reclaimsData.length; ri++) {
    var rRow = reclaimsData[ri];
    var rFirstCell = String(rRow[0] || '').trim();
    var firstCellLower = rFirstCell.toLowerCase();

    // Detect section headers
    if (firstCellLower.indexOf('reclaims') !== -1 && firstCellLower.indexOf('downgrade') !== -1) {
      inReclaimSection = true;
      reclaimDirection = 'downgrade';
      headerRowFound = false;
      continue;
    }
    if (firstCellLower.indexOf('reclaims') !== -1 && firstCellLower.indexOf('upgrade') !== -1) {
      inReclaimSection = true;
      reclaimDirection = 'upgrade';
      headerRowFound = false;
      continue;
    }

    // Exit section
    if (firstCellLower.indexOf('previous employee') !== -1 ||
        firstCellLower.indexOf('class location approvals') !== -1 ||
        firstCellLower.indexOf('location approvals') !== -1 ||
        firstCellLower.indexOf('lost items') !== -1) {
      inReclaimSection = false;
      headerRowFound = false;
      continue;
    }

    if (!inReclaimSection) continue;

    // Find header row
    if (firstCellLower === 'employee') {
      headerRowFound = true;
      for (var h = 0; h < rRow.length; h++) {
        var header = String(rRow[h]).toLowerCase().trim();
        if (header === 'employee') employeeCol = h;
        if (header === 'item type') itemTypeCol = h;
        if (header === 'size') sizeCol = h;
        if (header === 'class') classCol = h;
        if (header.indexOf('pick list') !== -1 && header.indexOf('status') !== -1) statusCol = h;
      }
      continue;
    }

    if (!headerRowFound || employeeCol === -1) continue;
    if (!rFirstCell || rFirstCell.indexOf('📍') !== -1 || firstCellLower.indexOf('stage') !== -1) continue;

    var rEmployee = rFirstCell;
    var rItemType = itemTypeCol !== -1 ? String(rRow[itemTypeCol] || '').trim() : '';
    var rSize = sizeCol !== -1 ? String(rRow[sizeCol] || '').trim() : '';
    var rClass = classCol !== -1 ? String(rRow[classCol] || '').trim() : '';
    var rPickListStatus = statusCol !== -1 ? String(rRow[statusCol] || '').trim() : '';

    if ((rItemType === 'Glove' || rItemType === 'Sleeve') && rSize && rClass) {
      var originalClassNum = parseInt(rClass, 10);
      if (isNaN(originalClassNum)) continue;

      // Determine purchase class based on reclaim direction
      var purchaseClassNum;
      if (reclaimDirection === 'downgrade') {
        purchaseClassNum = 2;
      } else if (reclaimDirection === 'upgrade') {
        purchaseClassNum = 3;
      } else {
        purchaseClassNum = originalClassNum;
      }

      var isNoneAvailable = rPickListStatus.indexOf('Need to Purchase') !== -1;
      var isSizeUp = rPickListStatus.indexOf('Size Up') !== -1;

      if (!isNoneAvailable && !isSizeUp) continue;

      var key = rItemType + '|' + rSize + '|' + purchaseClassNum;
      if (!allRows[key]) {
        allRows[key] = {
          itemType: rItemType,
          size: rSize,
          classNum: purchaseClassNum,
          qty: 0,
          noneAvailable: 0,
          sizeUpOnly: 0,
          employees: []
        };
      }
      allRows[key].qty++;
      if (isNoneAvailable) allRows[key].noneAvailable++;
      if (isSizeUp) allRows[key].sizeUpOnly++;

      var empLabel = rEmployee + ' (Reclaim)';
      if (allRows[key].employees.indexOf(empLabel) === -1) {
        allRows[key].employees.push(empLabel);
      }
    }
  }
}


/**
 * LOW PRIORITY: Find currently assigned (In Service) items where
 * the item size is a half size up from the employee's preferred size.
 */
function collectLowPriorityItems(ss) {
  // Build employee preferred size map
  var empSheet = ss.getSheetByName(SHEET_EMPLOYEES);
  if (!empSheet || empSheet.getLastRow() < 2) return [];

  var empData = empSheet.getDataRange().getValues();
  var empPrefs = {}; // name (lowercase) -> { gloveSize, sleeveSize, classNum }

  for (var e = 1; e < empData.length; e++) {
    var empRow = empData[e];
    var name = String(empRow[COLS.EMPLOYEES.NAME - 1] || '').trim();
    if (!name) continue;

    var classNum = parseInt(empRow[COLS.EMPLOYEES.CLASS - 1], 10);
    var location = String(empRow[COLS.EMPLOYEES.LOCATION - 1] || '').trim().toLowerCase();

    if (isNaN(classNum)) continue;
    if (typeof isStatusLocation === 'function' && isStatusLocation(location)) continue;

    var gloveSize = String(empRow[COLS.EMPLOYEES.GLOVE_SIZE - 1] || '').trim();
    var sleeveSize = String(empRow[COLS.EMPLOYEES.SLEEVE_SIZE - 1] || '').trim();

    empPrefs[name.toLowerCase()] = {
      gloveSize: gloveSize,
      sleeveSize: sleeveSize,
      classNum: classNum
    };
  }

  // Sleeve size ordering for comparison
  var sleeveSizeOrder = { 'regular': 1, 'large': 2, 'x-large': 3 };

  var sizeUpCounts = {}; // key -> { itemType, size (preferred), classNum, qty, employees }

  var sheetConfigs = [
    { sheetName: SHEET_GLOVES, itemType: 'Glove', isGloves: true },
    { sheetName: SHEET_SLEEVES, itemType: 'Sleeve', isGloves: false }
  ];

  for (var sc = 0; sc < sheetConfigs.length; sc++) {
    var config = sheetConfigs[sc];
    var sheet = ss.getSheetByName(config.sheetName);
    if (!sheet || sheet.getLastRow() < 2) continue;

    var data = sheet.getDataRange().getValues();
    for (var i = 1; i < data.length; i++) {
      var row = data[i];
      var status = String(row[COLS.INVENTORY.STATUS - 1] || '').trim().toLowerCase();
      if (status !== 'in service') continue;

      var assignedTo = String(row[COLS.INVENTORY.ASSIGNED_TO - 1] || '').trim();
      if (!assignedTo) continue;

      var emp = empPrefs[assignedTo.toLowerCase()];
      if (!emp) continue;

      var itemSize = String(row[COLS.INVENTORY.SIZE - 1] || '').trim();
      var itemClass = parseInt(row[COLS.INVENTORY.CLASS - 1], 10);
      if (!itemSize || isNaN(itemClass)) continue;

      // Compare sizes
      var isSizeUp = false;
      var preferredSize = '';

      if (config.isGloves) {
        preferredSize = emp.gloveSize;
        if (!preferredSize || preferredSize.toLowerCase() === 'n/a') continue;
        var prefNum = parseFloat(preferredSize);
        var itemNum = parseFloat(itemSize);
        if (!isNaN(prefNum) && !isNaN(itemNum) && itemNum > prefNum) {
          isSizeUp = true;
        }
      } else {
        preferredSize = emp.sleeveSize;
        if (!preferredSize || preferredSize.toLowerCase() === 'n/a') continue;
        var prefNorm = normalizeSleeveSize(preferredSize);
        var itemNorm = normalizeSleeveSize(itemSize);
        var prefOrder = sleeveSizeOrder[prefNorm] || 0;
        var itemOrder = sleeveSizeOrder[itemNorm] || 0;
        if (prefOrder > 0 && itemOrder > 0 && itemOrder > prefOrder) {
          isSizeUp = true;
        }
      }

      if (isSizeUp) {
        // The item we need to order is the PREFERRED size
        var key = config.itemType + '|' + preferredSize + '|' + itemClass;
        if (!sizeUpCounts[key]) {
          sizeUpCounts[key] = {
            itemType: config.itemType,
            size: preferredSize,
            classNum: itemClass,
            qty: 0,
            employees: []
          };
        }
        sizeUpCounts[key].qty++;
        var empLabel = assignedTo + ' (has ' + itemSize + ')';
        if (sizeUpCounts[key].employees.indexOf(empLabel) === -1) {
          sizeUpCounts[key].employees.push(empLabel);
        }
      }
    }
  }

  var results = [];
  var keys = Object.keys(sizeUpCounts);
  for (var k = 0; k < keys.length; k++) {
    var item = sizeUpCounts[keys[k]];
    results.push({
      key: keys[k],
      priority: 'Low',
      itemType: item.itemType,
      size: item.size,
      classNum: item.classNum,
      onShelf: '',
      qtyToOrder: item.qty,
      reason: 'Currently assigned size up',
      status: 'CONSIDER ORDERING',
      notes: item.employees.join(', ')
    });
  }

  return results;
}


/**
 * Build a map of items currently In Testing from Gloves and Sleeves sheets.
 * Key: "Glove|10|2" -> [{itemNum, dateSent, expectedReturn}]
 * Date Assigned (col E) is used as the date sent to testing.
 * Expected return = dateSent + 21 days (3 weeks).
 */
function buildInTestingMap(ss) {
  var map = {}; // key -> [{itemNum, dateSent, expectedReturn}]
  var tz = ss.getSpreadsheetTimeZone();

  var sheetConfigs = [
    { sheetName: SHEET_GLOVES, itemType: 'Glove', isGloves: true },
    { sheetName: SHEET_SLEEVES, itemType: 'Sleeve', isGloves: false }
  ];

  for (var sc = 0; sc < sheetConfigs.length; sc++) {
    var config = sheetConfigs[sc];
    var sheet = ss.getSheetByName(config.sheetName);
    if (!sheet || sheet.getLastRow() < 2) continue;

    var data = sheet.getDataRange().getValues();
    for (var i = 1; i < data.length; i++) {
      var row = data[i];
      var itemNum = String(row[COLS.INVENTORY.ITEM_NUM - 1] || '').trim();
      if (!itemNum) continue;

      var status = String(row[COLS.INVENTORY.STATUS - 1] || '').trim().toLowerCase();
      if (status !== 'in testing') continue;

      var size = String(row[COLS.INVENTORY.SIZE - 1] || '').trim();
      var classNum = parseInt(row[COLS.INVENTORY.CLASS - 1], 10);
      if (isNaN(classNum) || !size) continue;

      // Normalize sleeve sizes
      if (!config.isGloves) {
        size = capitalizeSleeveSize(normalizeSleeveSize(size));
      }

      var dateAssigned = row[COLS.INVENTORY.DATE_ASSIGNED - 1];
      var dateSent = null;
      var expectedReturn = null;

      if (dateAssigned instanceof Date && !isNaN(dateAssigned.getTime())) {
        dateSent = dateAssigned;
        expectedReturn = new Date(dateSent.getTime() + 21 * 24 * 60 * 60 * 1000); // +3 weeks
      }

      var key = config.itemType + '|' + size + '|' + classNum;
      if (!map[key]) {
        map[key] = [];
      }
      map[key].push({
        itemNum: itemNum,
        dateSent: dateSent,
        expectedReturn: expectedReturn
      });
    }
  }

  return map;
}


/**
 * Format In Testing info: count and soonest return date.
 * @param {Array} items - Array of {itemNum, dateSent, expectedReturn} or undefined
 * @returns {string} Formatted string or empty
 */
function formatInTestingInfo(items) {
  if (!items || items.length === 0) return '';

  var tz = Session.getScriptTimeZone();
  var today = new Date();
  today.setHours(0, 0, 0, 0);

  // Find soonest return date and count overdue
  var soonestReturn = null;
  var overdueCount = 0;
  for (var i = 0; i < items.length; i++) {
    if (items[i].expectedReturn) {
      var retClean = new Date(items[i].expectedReturn);
      retClean.setHours(0, 0, 0, 0);
      if (retClean <= today) {
        overdueCount++;
      } else if (!soonestReturn || items[i].expectedReturn < soonestReturn) {
        soonestReturn = items[i].expectedReturn;
      }
    }
  }

  var result = items.length + ' in testing';
  if (overdueCount > 0) {
    result += ' (' + overdueCount + ' overdue)';
  }
  if (soonestReturn) {
    result += '\nBack ~' + Utilities.formatDate(soonestReturn, tz, 'M/d/yyyy');
  }

  return result;
}


/**
 * Helper: Capitalize a normalized sleeve size for display.
 * e.g., "regular" -> "Regular", "x-large" -> "X-Large"
 */
function capitalizeSleeveSize(normalized) {
  if (!normalized) return normalized;
  var map = {
    'regular': 'Regular',
    'large': 'Large',
    'x-large': 'X-Large'
  };
  return map[normalized] || normalized;
}
