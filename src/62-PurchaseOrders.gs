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
 * Sets up the Vendors sheet for managing vendor information and pricing.
 * Menu item: Glove Manager → 🛒 Purchase Orders → ⚙️ Manage Vendors (auto-creates if missing)
 */
function setupVendorsSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Vendors');

  if (!sheet) {
    sheet = ss.insertSheet('Vendors');
  } else {
    // Check if already has headers
    var firstCell = sheet.getRange(1, 1).getValue();
    if (firstCell === 'Vendor Name') {
      return sheet; // Already configured
    }
    sheet.clear();
  }

  // Headers
  var headers = [
    'Vendor Name', 'Contact Name', 'Email', 'Phone', 'Notes',
    'Class 0 Glove Price', 'Class 2 Glove Price', 'Class 3 Glove Price',
    'Class 0 Sleeve Price', 'Class 2 Sleeve Price', 'Class 3 Sleeve Price'
  ];
  sheet.getRange(1, 1, 1, headers.length).setValues([headers])
    .setFontWeight('bold')
    .setBackground('#34A853')
    .setFontColor('white')
    .setHorizontalAlignment('center');

  // Set column widths
  sheet.setColumnWidth(1, 180);  // Vendor Name
  sheet.setColumnWidth(2, 140);  // Contact Name
  sheet.setColumnWidth(3, 180);  // Email
  sheet.setColumnWidth(4, 120);  // Phone
  sheet.setColumnWidth(5, 150);  // Notes
  sheet.setColumnWidth(6, 120);  // Class 0 Glove
  sheet.setColumnWidth(7, 120);  // Class 2 Glove
  sheet.setColumnWidth(8, 120);  // Class 3 Glove
  sheet.setColumnWidth(9, 120);  // Class 0 Sleeve
  sheet.setColumnWidth(10, 120); // Class 2 Sleeve
  sheet.setColumnWidth(11, 120); // Class 3 Sleeve

  // Freeze header row
  sheet.setFrozenRows(1);

  // Format price columns as currency
  sheet.getRange(2, 6, 100, 6).setNumberFormat('$#,##0.00');

  logEvent('Vendors sheet created successfully.');
  return sheet;
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
    // Default to current year's last 2 digits
    var currentYear = new Date().getFullYear();
    fiscalYear = String(currentYear).slice(-2);
  }

  return '002-' + fiscalYear;
}

/**
 * Gets all vendors from the Vendors sheet.
 * @returns {Array} Array of vendor objects with pricing
 */
function getVendors() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Vendors');

  if (!sheet || sheet.getLastRow() < 2) {
    return [];
  }

  var data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 11).getValues();
  var vendors = [];

  for (var i = 0; i < data.length; i++) {
    var row = data[i];
    if (!row[0]) continue; // Skip empty rows

    vendors.push({
      vendorName: row[0],
      contactName: row[1],
      email: row[2],
      phone: row[3],
      notes: row[4],
      class0GlovePrice: row[5] || 0,
      class2GlovePrice: row[6] || 0,
      class3GlovePrice: row[7] || 0,
      class0SleevePrice: row[8] || 0,
      class2SleevePrice: row[9] || 0,
      class3SleevePrice: row[10] || 0,
      rowIndex: i + 2 // For updates
    });
  }

  return vendors;
}

/**
 * Saves vendor data to the Vendors sheet.
 * @param {Array} vendors - Array of vendor objects
 */
function saveVendors(vendors) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Vendors');

  if (!sheet) {
    sheet = setupVendorsSheet();
  }

  // Clear existing data (keep headers)
  if (sheet.getLastRow() > 1) {
    sheet.getRange(2, 1, sheet.getLastRow() - 1, 11).clear();
  }

  if (!vendors || vendors.length === 0) {
    return { success: true, message: 'Vendors cleared.' };
  }

  // Write vendor data
  var data = vendors.map(function(v) {
    return [
      v.vendorName || '',
      v.contactName || '',
      v.email || '',
      v.phone || '',
      v.notes || '',
      v.class0GlovePrice || '',
      v.class2GlovePrice || '',
      v.class3GlovePrice || '',
      v.class0SleevePrice || '',
      v.class2SleevePrice || '',
      v.class3SleevePrice || ''
    ];
  });

  sheet.getRange(2, 1, data.length, 11).setValues(data);

  // Format price columns
  sheet.getRange(2, 6, data.length, 6).setNumberFormat('$#,##0.00');

  logEvent('Saved ' + vendors.length + ' vendor(s) to Vendors sheet.');
  return { success: true, message: 'Saved ' + vendors.length + ' vendor(s).' };
}

/**
 * Gets items from ALL sections of the Purchase Needs sheet.
 * Reads: NEED TO ORDER, IN TESTING, IN TESTING (SIZE UP), SIZE UP ASSIGNMENTS
 * Each item includes its category so the dialog can display them grouped.
 * @returns {Array} Array of items with category info
 */
function getItemsToOrder() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Purchase Needs');

  if (!sheet) {
    console.log('getItemsToOrder: Purchase Needs sheet not found');
    return [];
  }

  var lastRow = sheet.getLastRow();
  console.log('getItemsToOrder: Sheet has ' + lastRow + ' rows');

  if (lastRow < 3) {
    console.log('getItemsToOrder: Sheet has less than 3 rows, returning empty');
    return [];
  }

  var data = sheet.getDataRange().getValues();
  var items = [];

  // Track current section and header row
  var currentSection = null;
  var headerRowIndex = -1;

  // Section definitions for matching
  var sectionInfo = {
    'NEED TO ORDER': { priority: 1, timeframe: 'Immediate', emoji: '🛒' },
    'READY FOR DELIVERY (SIZE UP)': { priority: 2, timeframe: 'In 2 Weeks', emoji: '📦⚠️' },
    'IN TESTING': { priority: 3, timeframe: 'In 3 Weeks', emoji: '⏳' },
    'IN TESTING (SIZE UP)': { priority: 4, timeframe: 'In 3 Weeks', emoji: '⏳⚠️' },
    'SIZE UP ASSIGNMENTS': { priority: 5, timeframe: 'Consider', emoji: '⚠️' }
  };

  // Column indices (will be set when we find each header row)
  var cols = {
    severity: -1,
    timeframe: -1,
    itemType: -1,
    size: -1,
    classNum: -1,
    quantity: -1,
    reason: -1,
    status: -1,
    notes: -1
  };

  console.log('getItemsToOrder: Scanning all sections in Purchase Needs sheet');

  for (var i = 0; i < data.length; i++) {
    var row = data[i];
    var firstCell = String(row[0] || '').trim();

    // Check if this is a section header
    var foundSection = null;
    for (var sectionName in sectionInfo) {
      if (firstCell.indexOf(sectionName) !== -1) {
        foundSection = sectionName;
        break;
      }
    }

    if (foundSection) {
      currentSection = foundSection;
      headerRowIndex = -1; // Reset header for new section
      console.log('getItemsToOrder: Found section "' + currentSection + '" at row ' + (i + 1));
      continue;
    }

    // Detect header row within section (check for "Severity" case-insensitive)
    if (currentSection && (firstCell === 'Severity' || firstCell.toLowerCase() === 'severity')) {
      headerRowIndex = i;
      // Map columns
      for (var c = 0; c < row.length; c++) {
        var header = String(row[c]).toLowerCase().trim();
        if (header === 'severity') cols.severity = c;
        if (header === 'timeframe') cols.timeframe = c;
        if (header === 'item type') cols.itemType = c;
        if (header === 'size') cols.size = c;
        if (header === 'class') cols.classNum = c;
        if (header === 'quantity needed') cols.quantity = c;
        if (header === 'reason') cols.reason = c;
        if (header === 'status') cols.status = c;
        if (header === 'notes') cols.notes = c;
      }
      continue;
    }

    // Check for TOTAL row (end of section data)
    if (currentSection && headerRowIndex !== -1 && (firstCell === 'TOTAL' || firstCell.indexOf('TOTAL') !== -1)) {
      // Section ended, but continue to look for more sections
      headerRowIndex = -1;
      continue;
    }

    // Skip if not in section or no header found
    if (!currentSection || headerRowIndex === -1) continue;

    // Skip empty rows
    if (!firstCell || firstCell === '') continue;

    // Skip if already ordered
    var status = cols.status !== -1 ? String(row[cols.status] || '') : '';
    if (status.indexOf('ORDERED') !== -1) {
      continue;
    }

    // Read item data
    var itemType = cols.itemType !== -1 ? String(row[cols.itemType] || '').trim() : '';
    var size = cols.size !== -1 ? String(row[cols.size] || '').trim() : '';
    var classNum = cols.classNum !== -1 ? String(row[cols.classNum] || '').trim() : '';
    var quantity = cols.quantity !== -1 ? parseInt(row[cols.quantity]) || 0 : 0;
    var notes = cols.notes !== -1 ? String(row[cols.notes] || '').trim() : '';
    var timeframe = cols.timeframe !== -1 ? String(row[cols.timeframe] || '').trim() : '';

    if (itemType && size && classNum && quantity > 0) {
      var info = sectionInfo[currentSection] || { priority: 99, timeframe: 'Unknown', emoji: '' };
      items.push({
        itemType: itemType,
        size: size,
        classNum: parseInt(classNum),
        quantity: quantity,
        notes: notes,
        rowIndex: i + 1, // 1-based for sheet operations
        key: itemType + '|' + size + '|' + classNum,
        category: currentSection,
        categoryEmoji: info.emoji,
        timeframe: timeframe || info.timeframe,
        priority: info.priority,
        isSizeUp: currentSection.indexOf('SIZE UP') !== -1
      });
    }
  }

  // Sort by priority (most urgent first)
  items.sort(function(a, b) {
    return a.priority - b.priority;
  });

  console.log('getItemsToOrder: Found ' + items.length + ' total items across all sections');
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
    var line = '(' + item.quantity + ') Class ' + item.classNum + ' ' + item.itemType + ', Size ' + item.size;
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
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Purchase Needs');

  if (!sheet) {
    return { success: false, message: 'Purchase Needs sheet not found.' };
  }

  var data = sheet.getDataRange().getValues();
  var statusColIndex = -1;
  var inNeedToOrderSection = false;
  var updatedCount = 0;

  // Build a lookup map for items to order
  var itemsToMark = {};
  items.forEach(function(item) {
    var key = item.itemType + '|' + item.size + '|' + item.classNum;
    itemsToMark[key] = true;
  });

  // First pass: find the status column in NEED TO ORDER section
  for (var i = 0; i < data.length; i++) {
    var firstCell = String(data[i][0] || '').trim();

    if (firstCell.indexOf('NEED TO ORDER') !== -1) {
      inNeedToOrderSection = true;
      continue;
    }

    if (inNeedToOrderSection && firstCell === 'Severity') {
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

  // Second pass: update matching items
  inNeedToOrderSection = false;
  var headerFound = false;
  var itemTypeCol = -1, sizeCol = -1, classCol = -1;

  for (var i = 0; i < data.length; i++) {
    var row = data[i];
    var firstCell = String(row[0] || '').trim();

    if (firstCell.indexOf('NEED TO ORDER') !== -1) {
      inNeedToOrderSection = true;
      continue;
    }

    if (inNeedToOrderSection && firstCell === 'Severity') {
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

    // Exit section
    if (inNeedToOrderSection && (firstCell === 'TOTAL' || firstCell.indexOf('📦') !== -1 || firstCell.indexOf('⏳') !== -1)) {
      break;
    }

    if (!inNeedToOrderSection || !headerFound) continue;
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
    .setWidth(800)
    .setHeight(650);
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
    .setHeight(500);
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

