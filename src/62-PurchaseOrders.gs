/**
 * Glove Manager – Purchase Order System
 *
 * Functions for creating purchase orders, managing vendors, and tracking orders.
 * PO number format: 002-## (based on fiscal year, e.g., 002-26 for FY2026)
 */

/**
 * Sets up the Purchase Orders sheet for tracking order history.
 * Menu item: Glove Manager → 🛒 Purchase Orders → Setup (if needed)
 */
function setupPurchaseOrdersSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Purchase Orders');

  if (!sheet) {
    sheet = ss.insertSheet('Purchase Orders');
  } else {
    // Check if already has headers
    var firstCell = sheet.getRange(1, 1).getValue();
    if (firstCell === 'Date') {
      SpreadsheetApp.getUi().alert('Purchase Orders sheet already exists and is configured.');
      return;
    }
    sheet.clear();
  }

  // Headers
  var headers = ['Date', 'PO Number', 'Vendor', 'Items', 'Total Price', 'Expected Delivery', 'Status', 'Notes'];
  sheet.getRange(1, 1, 1, headers.length).setValues([headers])
    .setFontWeight('bold')
    .setBackground('#1a73e8')
    .setFontColor('white')
    .setHorizontalAlignment('center');

  // Set column widths
  sheet.setColumnWidth(1, 100);  // Date
  sheet.setColumnWidth(2, 80);   // PO Number
  sheet.setColumnWidth(3, 150);  // Vendor
  sheet.setColumnWidth(4, 400);  // Items
  sheet.setColumnWidth(5, 100);  // Total Price
  sheet.setColumnWidth(6, 120);  // Expected Delivery
  sheet.setColumnWidth(7, 100);  // Status
  sheet.setColumnWidth(8, 200);  // Notes

  // Freeze header row
  sheet.setFrozenRows(1);

  // Add data validation for Status column
  var statusRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(['Ordered', 'Shipped', 'Received', 'Cancelled'], true)
    .build();
  sheet.getRange(2, 7, 100, 1).setDataValidation(statusRule);

  logEvent('Purchase Orders sheet created successfully.');
  SpreadsheetApp.getUi().alert('Purchase Orders sheet has been set up!');
}

/**
 * Sets up the Vendors sheet (combined format: vendor info + items).
 * 8 columns: Vendor Name, Contact Name, Email, Phone, Notes, Item, Item Number, Price
 * Each row = one item for a vendor. Vendor info repeated per row.
 * Auto-migrates from old 17-col format + Vendor Items sheet if detected.
 */
function setupVendorsSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Vendors');

  if (sheet) {
    var firstCell = sheet.getRange(1, 1).getValue();
    if (firstCell === 'Vendor Name') {
      // Check if already in new 8-col combined format
      var col6 = String(sheet.getRange(1, 6).getValue()).trim();
      if (col6 === 'Item') {
        return sheet; // Already in new format
      }
      // Old format detected - migrate
      migrateVendorSheets();
      return ss.getSheetByName('Vendors');
    }
    sheet.clear();
  } else {
    sheet = ss.insertSheet('Vendors');
  }

  // Create fresh sheet with new 8-column format
  var headers = ['Vendor Name', 'Contact Name', 'Email', 'Phone', 'Notes', 'Item', 'Item Number', 'Price'];
  sheet.getRange(1, 1, 1, headers.length).setValues([headers])
    .setFontWeight('bold')
    .setBackground('#34A853')
    .setFontColor('white')
    .setHorizontalAlignment('center');

  sheet.setColumnWidth(1, 160);  // Vendor Name
  sheet.setColumnWidth(2, 140);  // Contact Name
  sheet.setColumnWidth(3, 200);  // Email
  sheet.setColumnWidth(4, 130);  // Phone
  sheet.setColumnWidth(5, 120);  // Notes
  sheet.setColumnWidth(6, 200);  // Item
  sheet.setColumnWidth(7, 130);  // Item Number
  sheet.setColumnWidth(8, 100);  // Price

  sheet.setFrozenRows(1);
  sheet.getRange(2, 8, 500, 1).setNumberFormat('$#,##0.00');

  logEvent('Vendors sheet created (combined format).');
  return sheet;
}

/**
 * Migrates old Vendors (17-col) + Vendor Items sheets into new combined 8-col format.
 * Reads all data from both old sheets, writes to new format, deletes Vendor Items sheet.
 */
function migrateVendorSheets() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Vendors');
  if (!sheet) return;

  Logger.log('migrateVendorSheets: Starting migration from old format...');

  // 1. Read old vendor data (up to 17 columns)
  var lastCol = sheet.getLastColumn();
  var oldVendors = [];
  if (sheet.getLastRow() >= 2) {
    var data = sheet.getRange(2, 1, sheet.getLastRow() - 1, Math.min(lastCol, 17)).getValues();
    for (var i = 0; i < data.length; i++) {
      var row = data[i];
      if (!row[0]) continue;
      oldVendors.push({
        vendorName: String(row[0]).trim(),
        contactName: String(row[1] || ''),
        email: String(row[2] || ''),
        phone: String(row[3] || ''),
        notes: String(row[4] || ''),
        class0GlovePrice: row[5] || 0,
        class2GlovePrice: row[6] || 0,
        class3GlovePrice: row[7] || 0,
        class0SleevePrice: row[8] || 0,
        class2SleevePrice: row[9] || 0,
        class3SleevePrice: row[10] || 0,
        class0GloveItemNum: lastCol >= 12 ? String(row[11] || '') : '',
        class2GloveItemNum: lastCol >= 13 ? String(row[12] || '') : '',
        class3GloveItemNum: lastCol >= 14 ? String(row[13] || '') : '',
        class0SleeveItemNum: lastCol >= 15 ? String(row[14] || '') : '',
        class2SleeveItemNum: lastCol >= 16 ? String(row[15] || '') : '',
        class3SleeveItemNum: lastCol >= 17 ? String(row[16] || '') : ''
      });
    }
  }

  // 2. Read old Vendor Items sheet
  var viSheet = ss.getSheetByName('Vendor Items');
  var oldCustomItems = [];
  if (viSheet && viSheet.getLastRow() >= 2) {
    var viData = viSheet.getRange(2, 1, viSheet.getLastRow() - 1, 4).getValues();
    for (var j = 0; j < viData.length; j++) {
      var vr = viData[j];
      if (!vr[0] && !vr[1]) continue;
      oldCustomItems.push({
        vendorName: String(vr[0] || '').trim(),
        item: String(vr[1] || '').trim(),
        itemNumber: String(vr[2] || '').trim(),
        price: vr[3] || 0
      });
    }
  }

  // 3. Build combined rows
  var KNOWN_ITEMS = [
    { field: 'class0Glove', item: 'Class 0 Glove' },
    { field: 'class2Glove', item: 'Class 2 Glove' },
    { field: 'class3Glove', item: 'Class 3 Glove' },
    { field: 'class0Sleeve', item: 'Class 0 Sleeve' },
    { field: 'class2Sleeve', item: 'Class 2 Sleeve' },
    { field: 'class3Sleeve', item: 'Class 3 Sleeve' }
  ];

  var newRows = [];
  for (var v = 0; v < oldVendors.length; v++) {
    var vendor = oldVendors[v];
    var hasItems = false;

    // Convert 6 known glove/sleeve items to rows
    for (var k = 0; k < KNOWN_ITEMS.length; k++) {
      var ki = KNOWN_ITEMS[k];
      var price = vendor[ki.field + 'Price'] || 0;
      var itemNum = vendor[ki.field + 'ItemNum'] || '';
      if (price || itemNum) {
        newRows.push([
          vendor.vendorName, vendor.contactName, vendor.email, vendor.phone, vendor.notes,
          ki.item, itemNum, price
        ]);
        hasItems = true;
      }
    }

    // Add custom items for this vendor
    for (var ci = 0; ci < oldCustomItems.length; ci++) {
      if (oldCustomItems[ci].vendorName === vendor.vendorName) {
        newRows.push([
          vendor.vendorName, vendor.contactName, vendor.email, vendor.phone, vendor.notes,
          oldCustomItems[ci].item, oldCustomItems[ci].itemNumber, oldCustomItems[ci].price
        ]);
        hasItems = true;
      }
    }

    // If vendor has no items, still write one row to preserve contact info
    if (!hasItems) {
      newRows.push([
        vendor.vendorName, vendor.contactName, vendor.email, vendor.phone, vendor.notes,
        '', '', ''
      ]);
    }
  }

  // 4. Rewrite the Vendors sheet
  sheet.clear();
  var headers = ['Vendor Name', 'Contact Name', 'Email', 'Phone', 'Notes', 'Item', 'Item Number', 'Price'];
  sheet.getRange(1, 1, 1, headers.length).setValues([headers])
    .setFontWeight('bold')
    .setBackground('#34A853')
    .setFontColor('white')
    .setHorizontalAlignment('center');

  sheet.setColumnWidth(1, 160);
  sheet.setColumnWidth(2, 140);
  sheet.setColumnWidth(3, 200);
  sheet.setColumnWidth(4, 130);
  sheet.setColumnWidth(5, 120);
  sheet.setColumnWidth(6, 200);
  sheet.setColumnWidth(7, 130);
  sheet.setColumnWidth(8, 100);

  sheet.setFrozenRows(1);

  if (newRows.length > 0) {
    sheet.getRange(2, 1, newRows.length, 8).setValues(newRows);
    sheet.getRange(2, 8, newRows.length, 1).setNumberFormat('$#,##0.00');
  }

  // 5. Delete old Vendor Items sheet
  if (viSheet) {
    ss.deleteSheet(viSheet);
    Logger.log('migrateVendorSheets: Deleted Vendor Items sheet.');
  }

  Logger.log('migrateVendorSheets: Migrated ' + oldVendors.length + ' vendor(s) with ' + newRows.length + ' item row(s).');
  logEvent('Migrated Vendors sheet to combined format. ' + newRows.length + ' rows.');
}

/**
 * Gets the current PO number based on fiscal year.
 * Format: 002-## (e.g., 002-26 for FY2026)
 * @returns {string} The PO number
 */
function getPurchaseOrderNumber() {
  var props = PropertiesService.getScriptProperties();
  var fiscalYear = props.getProperty('CURRENT_FISCAL_YEAR');

  if (!fiscalYear) {
    var currentYear = new Date().getFullYear();
    fiscalYear = String(currentYear).slice(-2);
  }

  return '002-' + fiscalYear;
}

/**
 * Gets all vendors from the combined Vendors sheet.
 * Groups rows by vendor name. All items (including gloves/sleeves) are in customItems.
 * @returns {Array} Array of vendor objects with customItems catalog
 */
function getVendors() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Vendors');

  if (!sheet || sheet.getLastRow() < 2) {
    return [];
  }

  // Auto-detect format: check col 6 header
  var col6Header = String(sheet.getRange(1, 6).getValue()).trim();
  if (col6Header !== 'Item') {
    // Old format - trigger migration first
    migrateVendorSheets();
    sheet = ss.getSheetByName('Vendors');
    if (!sheet || sheet.getLastRow() < 2) return [];
  }

  var data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 8).getValues();

  // Group rows by vendor name
  var vendorMap = {};
  var vendorOrder = [];

  for (var i = 0; i < data.length; i++) {
    var row = data[i];
    var name = String(row[0] || '').trim();
    if (!name) continue;

    if (!vendorMap[name]) {
      vendorMap[name] = {
        vendorName: name,
        contactName: String(row[1] || ''),
        email: String(row[2] || ''),
        phone: String(row[3] || ''),
        notes: String(row[4] || ''),
        customItems: []
      };
      vendorOrder.push(name);
    }

    var itemName = String(row[5] || '').trim();
    var itemNum = String(row[6] || '').trim();
    var price = row[7] || 0;

    if (!itemName) continue; // Empty item row (contact-info-only placeholder)

    // All items go into customItems (unified catalog)
    vendorMap[name].customItems.push({
      item: itemName,
      itemNumber: itemNum,
      price: price
    });
  }

  // Return in order
  var vendors = [];
  for (var o = 0; o < vendorOrder.length; o++) {
    vendors.push(vendorMap[vendorOrder[o]]);
  }

  return vendors;
}

/**
 * Saves vendor data to the combined Vendors sheet (8 columns).
 * Writes all items from customItems array as individual rows.
 * @param {Array} vendors - Array of vendor objects
 */
function saveVendors(vendors) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Vendors');

  if (!sheet) {
    sheet = setupVendorsSheet();
  }

  // Ensure sheet is in new format
  var col6Header = String(sheet.getRange(1, 6).getValue()).trim();
  if (col6Header !== 'Item') {
    migrateVendorSheets();
    sheet = ss.getSheetByName('Vendors');
  }

  // Clear existing data (keep headers)
  if (sheet.getLastRow() > 1) {
    sheet.getRange(2, 1, sheet.getLastRow() - 1, 8).clear();
  }

  if (!vendors || vendors.length === 0) {
    return { success: true, message: 'Vendors cleared.' };
  }

  var allRows = [];
  var totalItems = 0;

  for (var i = 0; i < vendors.length; i++) {
    var v = vendors[i];
    var hasItems = false;

    // Write all catalog items
    if (v.customItems && v.customItems.length > 0) {
      for (var j = 0; j < v.customItems.length; j++) {
        var ci = v.customItems[j];
        if (ci.item && ci.item.trim() !== '') {
          allRows.push([
            v.vendorName || '', v.contactName || '', v.email || '', v.phone || '', v.notes || '',
            ci.item, ci.itemNumber || '', ci.price || ''
          ]);
          hasItems = true;
          totalItems++;
        }
      }
    }

    // At least one row per vendor to preserve contact info
    if (!hasItems) {
      allRows.push([
        v.vendorName || '', v.contactName || '', v.email || '', v.phone || '', v.notes || '',
        '', '', ''
      ]);
    }
  }

  if (allRows.length > 0) {
    sheet.getRange(2, 1, allRows.length, 8).setValues(allRows);
    sheet.getRange(2, 8, allRows.length, 1).setNumberFormat('$#,##0.00');
  }

  // Clean up old Vendor Items sheet if it still exists
  var viSheet = ss.getSheetByName('Vendor Items');
  if (viSheet) {
    ss.deleteSheet(viSheet);
  }

  logEvent('Saved ' + vendors.length + ' vendor(s), ' + totalItems + ' item(s).');
  return { success: true, message: 'Saved ' + vendors.length + ' vendor(s) with ' + totalItems + ' item(s).' };
}

/**
 * Gets items from ALL sections of the Purchase Needs sheet.
 * Reads: NEED TO ORDER, IN TESTING, IN TESTING (SIZE UP), SIZE UP ASSIGNMENTS
 * Each item includes its category so the dialog can display them grouped.
 * @returns {Array} Array of items with category info
 */
/**
 * Dynamically scans ALL equipment swap sheets (Gloves, Sleeves, Blankets, MACKs, HV Testers, Phasing Sets, AED, Grounds, Hot Sticks)
 * to find items requiring procurement (where Pick List Status = 'Need to Purchase ❌' or Picked Item = '—').
 * Aggregates by Item Type, Size, Class/Rating, and calculates priority based on swap due dates.
 *
 * @returns {Array} Array of items needing purchase
 */
function getItemsToOrder() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var swapSheetDefs = [
    { type: 'Gloves', sheetName: typeof SHEET_GLOVE_SWAPS !== 'undefined' ? SHEET_GLOVE_SWAPS : 'Glove Swaps' },
    { type: 'Sleeves', sheetName: typeof SHEET_SLEEVE_SWAPS !== 'undefined' ? SHEET_SLEEVE_SWAPS : 'Sleeve Swaps' },
    { type: 'Blankets', sheetName: typeof SHEET_BLANKET_SWAPS !== 'undefined' ? SHEET_BLANKET_SWAPS : 'Blanket Swaps' },
    { type: 'MACKs', sheetName: typeof SHEET_MACK_SWAPS !== 'undefined' ? SHEET_MACK_SWAPS : 'MACK Swaps' },
    { type: 'HV Testers', sheetName: typeof SHEET_HV_TESTER_SWAPS !== 'undefined' ? SHEET_HV_TESTER_SWAPS : 'HV Tester Swaps' },
    { type: 'Phasing Sets', sheetName: typeof SHEET_PHASING_SET_SWAPS !== 'undefined' ? SHEET_PHASING_SET_SWAPS : 'Phasing Set Swaps' },
    { type: 'Grounds', sheetName: typeof SHEET_GROUND_SWAPS !== 'undefined' ? SHEET_GROUND_SWAPS : 'Ground Swaps' },
    { type: 'Hot Sticks', sheetName: typeof SHEET_HOT_STICK_SWAPS !== 'undefined' ? SHEET_HOT_STICK_SWAPS : 'Hot Stick Swaps' },
    { type: 'AED', sheetName: typeof SHEET_AED_SWAPS !== 'undefined' ? SHEET_AED_SWAPS : 'AED Swaps' }
  ];

  var aggregatedMap = {};

  swapSheetDefs.forEach(function(def) {
    var sheet = ss.getSheetByName(def.sheetName);
    if (!sheet || sheet.getLastRow() < 2) return;

    var data = sheet.getDataRange().getValues();
    var headers = data[0];

    // Find column indexes dynamically
    var cols = {
      empName: -1,
      crew: -1,
      location: -1,
      size: -1,
      classVal: -1,
      daysLeft: -1,
      pickItem: -1,
      pickStatus: -1,
      notes: -1
    };

    for (var h = 0; h < headers.length; h++) {
      var hStr = String(headers[h] || '').toLowerCase().trim();
      if (hStr.includes('employee') || hStr.includes('assigned to')) cols.empName = h;
      else if (hStr.includes('crew') || hStr.includes('job')) cols.crew = h;
      else if (hStr.includes('location') || hStr.includes('city')) cols.location = h;
      else if (hStr.includes('size')) cols.size = h;
      else if (hStr.includes('class') || hStr.includes('kv') || hStr.includes('model') || hStr.includes('type')) cols.classVal = h;
      else if (hStr.includes('days left')) cols.daysLeft = h;
      else if (hStr.includes('pick') && (hStr.includes('#') || hStr.includes('item') || hStr.includes('glove') || hStr.includes('sleeve'))) cols.pickItem = h;
      else if (hStr.includes('status') || hStr.includes('pick list')) cols.pickStatus = h;
      else if (hStr.includes('note')) cols.notes = h;
    }

    for (var r = 1; r < data.length; r++) {
      var row = data[r];
      var pickStatus = cols.pickStatus !== -1 ? String(row[cols.pickStatus] || '').trim() : '';
      var pickItem = cols.pickItem !== -1 ? String(row[cols.pickItem] || '').trim() : '';
      var pickStatusLower = pickStatus.toLowerCase();

      var isNeedToPurchase = pickStatusLower.includes('purchase') ||
                             pickStatusLower.includes('need to purchase') ||
                             pickItem === '—' ||
                             (pickItem === '' && pickStatusLower.includes('unassigned'));

      if (!isNeedToPurchase) continue;

      var size = cols.size !== -1 ? String(row[cols.size] || '').trim() : '—';
      var classVal = cols.classVal !== -1 ? String(row[cols.classVal] || '').trim() : '—';
      var emp = cols.empName !== -1 ? String(row[cols.empName] || '').trim() : '';
      var loc = cols.location !== -1 ? String(row[cols.location] || '').trim() : '';
      var daysLeft = cols.daysLeft !== -1 ? parseInt(row[cols.daysLeft], 10) : 30;
      if (isNaN(daysLeft)) daysLeft = 30;

      var key = def.type + '|' + size + '|' + classVal;

      if (!aggregatedMap[key]) {
        aggregatedMap[key] = {
          itemType: def.type,
          size: size,
          classNum: classVal,
          quantity: 0,
          employees: [],
          minDaysLeft: daysLeft,
          locations: {},
          sheetName: def.sheetName
        };
      }

      aggregatedMap[key].quantity += 1;
      if (emp && aggregatedMap[key].employees.indexOf(emp) === -1) {
        aggregatedMap[key].employees.push(emp);
      }
      if (loc) {
        aggregatedMap[key].locations[loc] = (aggregatedMap[key].locations[loc] || 0) + 1;
      }
      if (daysLeft < aggregatedMap[key].minDaysLeft) {
        aggregatedMap[key].minDaysLeft = daysLeft;
      }
    }
  });

  var items = [];
  for (var k in aggregatedMap) {
    var entry = aggregatedMap[k];
    var priority = 3;
    var timeframe = 'Consider / Future';
    var emoji = '🟢';
    var category = 'LOW PRIORITY';

    if (entry.minDaysLeft <= 14) {
      priority = 1;
      timeframe = 'Immediate (< 14d)';
      emoji = '🔴';
      category = 'HIGH PRIORITY';
    } else if (entry.minDaysLeft <= 30) {
      priority = 2;
      timeframe = 'Soon (15-30d)';
      emoji = '🟠';
      category = 'MEDIUM PRIORITY';
    }

    var notesText = entry.employees.length > 0
      ? 'Needed for: ' + entry.employees.slice(0, 3).join(', ') + (entry.employees.length > 3 ? ' +' + (entry.employees.length - 3) + ' more' : '')
      : 'Stock replenishment';

    items.push({
      itemType: entry.itemType,
      size: entry.size,
      classNum: entry.classNum,
      quantity: entry.quantity,
      notes: notesText,
      key: k,
      category: category,
      categoryEmoji: emoji,
      timeframe: timeframe,
      priority: priority,
      reason: entry.minDaysLeft < 0 ? 'Overdue swap' : (entry.minDaysLeft <= 14 ? 'Due soon' : 'Upcoming rotation'),
      isSizeUp: false
    });
  }

  items.sort(function(a, b) {
    return a.priority - b.priority || b.quantity - a.quantity;
  });

  return items;
}

/**
 * Generates the PO text for copy/paste into email.
 * @param {Object} poData - Object containing items, vendor, expectedDelivery, notes
 * @returns {string} Formatted PO text
 */
function generatePurchaseOrderText(poData) {
  var poNumber = getPurchaseOrderNumber();
  var lines = [];

  lines.push('I need to Order the following:');
  lines.push('');

  // Build item lines with pricing
  var items = poData.items || [];
  for (var i = 0; i < items.length; i++) {
    var item = items[i];
    var line = '- (' + item.quantity + ') Class ' + item.classNum + ' ' + item.itemType + ', Size ' + item.size;
    if (item.price && item.price > 0) {
      line += ' @ $' + parseFloat(item.price).toFixed(2);
    }
    lines.push(line);
  }

  lines.push('');
  lines.push('Are these prices still correct?');
  lines.push('');

  var expectedDelivery = poData.expectedDelivery || '???';
  lines.push('Expected Delivery: ' + expectedDelivery);

  if (poData.notes) {
    lines.push('');
    lines.push('Notes: ' + poData.notes);
  }

  return lines.join('\n');
}

/**
 * Logs a purchase order to the Purchase Orders sheet.
 * @param {Object} orderData - Order details
 * @returns {Object} Result with success status
 */
function logPurchaseOrder(orderData) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Purchase Orders');

  if (!sheet) {
    setupPurchaseOrdersSheet();
    sheet = ss.getSheetByName('Purchase Orders');
  }

  var poNumber = getPurchaseOrderNumber();
  var date = new Date();
  var dateStr = Utilities.formatDate(date, ss.getSpreadsheetTimeZone(), 'MM/dd/yyyy');

  // Build items summary string
  var itemsSummary = orderData.items.map(function(item) {
    var line = '';
    if (item.isCustomItem) {
      line = '(' + item.quantity + ') ' + (item.itemType || 'Item');
      if (item.itemNumber) line += ' #' + item.itemNumber;
    } else {
      line = '(' + item.quantity + ') Class ' + item.classNum + ' ' + item.itemType + ', Size ' + item.size;
    }
    if (item.price && item.price > 0) {
      line += ' @ $' + parseFloat(item.price).toFixed(2);
    }
    return line;
  }).join('; ');

  // Calculate total price
  var totalPrice = 0;
  orderData.items.forEach(function(item) {
    if (item.price && item.quantity) {
      totalPrice += parseFloat(item.price) * parseInt(item.quantity);
    }
  });

  var expectedDelivery = orderData.expectedDelivery || '???';

  // Add row to sheet
  var newRow = [
    dateStr,
    poNumber,
    orderData.vendor || '',
    itemsSummary,
    totalPrice > 0 ? totalPrice : '',
    expectedDelivery,
    'Ordered',
    orderData.notes || ''
  ];

  sheet.appendRow(newRow);

  // Format the new row
  var lastRow = sheet.getLastRow();
  sheet.getRange(lastRow, 5).setNumberFormat('$#,##0.00');

  logEvent('Logged purchase order ' + poNumber + ' with ' + orderData.items.length + ' item(s).');

  return { success: true, poNumber: poNumber, message: 'Order logged successfully.' };
}

/**
 * Marks items as ordered in the Purchase Needs sheet.
 * Changes status to "ORDERED! Est. Receive date (MM/DD/YYYY)" or "ORDERED! Est. Receive date (???)"
 * @param {Array} items - Array of items that were ordered
 * @param {string} expectedDelivery - Expected delivery date string
 * @returns {Object} Result with success status
 */
function markItemsAsOrdered(items, expectedDelivery) {
  // Filter out vendor catalog and custom items - they're not in Purchase Needs
  var purchaseNeedsItems = items.filter(function(item) {
    return !item.isCustomItem;
  });

  if (purchaseNeedsItems.length === 0) {
    return { success: true, message: 'No Purchase Needs items to mark (order contained only vendor/custom items).', updatedCount: 0 };
  }

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Purchase Needs');

  if (!sheet) {
    return { success: true, message: 'Order logged successfully (bypassed marking Purchase Needs).', updatedCount: 0 };
  }

  var data = sheet.getDataRange().getValues();
  var statusColIndex = -1;
  var updatedCount = 0;

  // Build a lookup map for items to order
  var itemsToMark = {};
  purchaseNeedsItems.forEach(function(item) {
    var key = item.itemType + '|' + item.size + '|' + item.classNum;
    itemsToMark[key] = true;
  });

  // Find the status column by scanning for header rows in any section
  var inSection = false;

  for (var i = 0; i < data.length; i++) {
    var firstCell = String(data[i][0] || '').trim();

    if (firstCell.indexOf('HIGH PRIORITY') !== -1 || firstCell.indexOf('MEDIUM PRIORITY') !== -1 || firstCell.indexOf('LOW PRIORITY') !== -1) {
      inSection = true;
      continue;
    }

    if (inSection && firstCell === 'Priority') {
      // Find status column
      for (var c = 0; c < data[i].length; c++) {
        if (String(data[i][c]).toLowerCase().trim() === 'status') {
          statusColIndex = c;
          break;
        }
      }
      break;
    }
  }

  if (statusColIndex === -1) {
    return { success: false, message: 'Could not find Status column in Purchase Needs.' };
  }

  // Determine delivery date string
  var deliveryStr = expectedDelivery || '???';
  var newStatus = 'ORDERED! Est. Receive date (' + deliveryStr + ')';

  // Second pass: update matching items across all sections
  inSection = false;
  var headerFound = false;
  var itemTypeCol = -1, sizeCol = -1, classCol = -1;

  for (var i = 0; i < data.length; i++) {
    var row = data[i];
    var firstCell = String(row[0] || '').trim();

    if (firstCell.indexOf('HIGH PRIORITY') !== -1 || firstCell.indexOf('MEDIUM PRIORITY') !== -1 || firstCell.indexOf('LOW PRIORITY') !== -1) {
      inSection = true;
      headerFound = false;
      continue;
    }

    if (inSection && firstCell === 'Priority') {
      headerFound = true;
      // Find columns
      for (var c = 0; c < row.length; c++) {
        var h = String(row[c]).toLowerCase().trim();
        if (h === 'item type') itemTypeCol = c;
        if (h === 'size') sizeCol = c;
        if (h === 'class') classCol = c;
      }
      continue;
    }

    // Skip TOTAL rows
    if (inSection && headerFound && firstCell === 'TOTAL') {
      headerFound = false;
      continue;
    }

    if (!inSection || !headerFound) continue;
    if (!firstCell || firstCell === '') continue;

    // Check if this item matches one we're marking
    var itemType = itemTypeCol !== -1 ? String(row[itemTypeCol] || '').trim() : '';
    var size = sizeCol !== -1 ? String(row[sizeCol] || '').trim() : '';
    var classNum = classCol !== -1 ? String(row[classCol] || '').trim() : '';

    var key = itemType + '|' + size + '|' + classNum;

    if (itemsToMark[key]) {
      // Update status cell
      var statusCell = sheet.getRange(i + 1, statusColIndex + 1);
      statusCell.setValue(newStatus);
      statusCell.setBackground('#ffe0b2'); // Orange background
      statusCell.setFontWeight('bold');
      updatedCount++;
    }
  }

  logEvent('Marked ' + updatedCount + ' item(s) as ordered in Purchase Needs.');

  return {
    success: true,
    message: 'Updated ' + updatedCount + ' item(s) to ORDERED status.',
    updatedCount: updatedCount
  };
}

/**
 * Shows the Purchase Order dialog.
 * Menu item: Glove Manager → 🛒 Purchase Orders → 📝 Create Purchase Order
 */
function showPurchaseOrderDialog() {
  var html = HtmlService.createHtmlOutputFromFile('PurchaseOrderDialog')
    .setWidth(1400)
    .setHeight(900);
  SpreadsheetApp.getUi().showModalDialog(html, '🛒 Create Purchase Order');
}

/**
 * Shows the Vendor Config dialog.
 * Menu item: Glove Manager → 🛒 Purchase Orders → ⚙️ Manage Vendors
 */
function showVendorConfigDialog() {
  // Ensure Vendors sheet exists
  setupVendorsSheet();

  var html = HtmlService.createHtmlOutputFromFile('VendorConfig')
    .setWidth(900)
    .setHeight(900);
  SpreadsheetApp.getUi().showModalDialog(html, '⚙️ Manage Vendors');
}

/**
 * Opens the Purchase Orders sheet.
 * Menu item: Glove Manager → 🛒 Purchase Orders → 📋 Order History
 */
function openPurchaseOrdersSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Purchase Orders');

  if (!sheet) {
    setupPurchaseOrdersSheet();
    sheet = ss.getSheetByName('Purchase Orders');
  }

  ss.setActiveSheet(sheet);
}

/**
 * Gets vendor data for the dialog.
 * @returns {Object} Object with vendors array and fiscal year info
 */
function getPurchaseOrderDialogData() {
  return {
    vendors: getVendors(),
    itemsToOrder: getItemsToOrder(),
    poNumber: getPurchaseOrderNumber()
  };
}

/**
 * Processes a complete purchase order from the dialog.
 * Logs the order and marks items as ordered.
 * @param {Object} orderData - The order data from the dialog
 * @returns {Object} Result object
 */
function processPurchaseOrder(orderData) {
  try {
    // Log the purchase order
    var logResult = logPurchaseOrder(orderData);

    if (!logResult.success) {
      return logResult;
    }

    // Mark items as ordered in Purchase Needs
    var markResult = markItemsAsOrdered(orderData.items, orderData.expectedDelivery);

    return {
      success: true,
      poNumber: logResult.poNumber,
      message: 'Purchase order ' + logResult.poNumber + ' created. ' + markResult.message
    };
  } catch (e) {
    logEvent('Error processing purchase order: ' + e, 'ERROR');
    return { success: false, message: 'Error: ' + e.toString() };
  }
}

/**
 * Sends a purchase order email directly to the vendor.
 * @param {Object} emailData - Object containing vendor email, subject, body, and order data
 * @returns {Object} Result object with success status
 */
function sendPurchaseOrderEmail(emailData) {
  try {
    var vendorEmail = emailData.vendorEmail;
    var poNumber = getPurchaseOrderNumber();
    var subject = emailData.subject || 'Purchase Order ' + poNumber;
    var body = emailData.body;

    if (!vendorEmail) {
      return { success: false, message: 'No vendor email address provided.' };
    }

    if (!body) {
      return { success: false, message: 'No email body provided.' };
    }

    // Send the email
    GmailApp.sendEmail(vendorEmail, subject, body);

    logEvent('Sent purchase order email to ' + vendorEmail + ' - PO#: ' + poNumber);

    // Process the order (log and mark as ordered)
    if (emailData.orderData) {
      var processResult = processPurchaseOrder(emailData.orderData);
      return {
        success: true,
        message: 'Email sent to ' + vendorEmail + '. ' + (processResult.message || ''),
        poNumber: poNumber
      };
    }

    return {
      success: true,
      message: 'Email sent to ' + vendorEmail,
      poNumber: poNumber
    };
  } catch (e) {
    logEvent('Error sending purchase order email: ' + e, 'ERROR');
    return { success: false, message: 'Error sending email: ' + e.toString() };
  }
}
