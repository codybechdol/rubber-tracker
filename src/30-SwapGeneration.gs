/**
 * Glove Manager – Swap Generation
 *
 * Functions for generating swap recommendations.
 * Identifies items due for replacement and suggests pick list items.
 */

/**
 * Normalizes sleeve size strings to handle common variations.
 * Converts "XL" to "X-Large", "L" to "Large", "Reg" to "Regular", etc.
 *
 * @param {string} size - The size string to normalize
 * @return {string} Normalized size string (lowercase)
 */
function normalizeSleeveSize(size) {
  if (!size) return '';

  var normalized = size.toString().trim().toLowerCase();

  // Handle common abbreviations
  var sizeMap = {
    'xl': 'x-large',
    'x-l': 'x-large',
    'xlarge': 'x-large',
    'extra large': 'x-large',
    'extralarge': 'x-large',
    'l': 'large',
    'lg': 'large',
    'reg': 'regular',
    'regular': 'regular',
    'm': 'regular',
    'med': 'regular',
    'medium': 'regular'
  };

  return sizeMap[normalized] || normalized;
}

/**
 * Status priority levels for pick list items.
 * Lower number = higher priority (should be picked first)
 * On Shelf items are immediately available, In Testing items need to wait.
 */
var STATUS_PRIORITY = {
  'on shelf': 1,
  'in testing': 2
};

/**
 * Gets the priority level for a status string.
 * Returns 999 for unknown statuses (lowest priority).
 *
 * @param {string} status - The status to check
 * @return {number} Priority level (1 = highest)
 */
function getStatusPriority(status) {
  if (!status) return 999;
  var normalized = status.toString().trim().toLowerCase();
  // Handle statuses with icons/modifiers
  if (normalized.indexOf('on shelf') !== -1 || normalized.indexOf('in stock') !== -1) return STATUS_PRIORITY['on shelf'];
  if (normalized.indexOf('in testing') !== -1) return STATUS_PRIORITY['in testing'];
  return 999;
}

/**
 * Generates all reports: Glove Swaps, Sleeve Swaps, Purchase Needs, Inventory Reports, and Reclaims.
 * Menu item: Glove Manager → Generate All Reports
 */
function generateAllReports() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  try {
    logEvent('Generating all reports...');

    // Ensure Picked For column exists (safety check)
    ensurePickedForColumn();

    ss.toast('Fixing change out dates...', '📊 Generate All Reports', 3);
    fixChangeOutDatesSilent();

    ss.toast('Generating Glove Swaps...', '📊 Generate All Reports', 5);
    generateGloveSwaps();

    ss.toast('Generating Sleeve Swaps...', '📊 Generate All Reports', 5);
    generateSleeveSwaps();

    // Ensure all data is written before running upgrades
    SpreadsheetApp.flush();

    // Run pick list upgrades AFTER generating swap reports
    ss.toast('Checking for pick list upgrades...', '📊 Generate All Reports', 3);
    var upgradeResults = upgradePickListItems();
    if (upgradeResults && upgradeResults.totalUpgrades > 0) {
      logEvent('Pick List Upgrades: ' + upgradeResults.totalUpgrades + ' items upgraded to better options');
    }

    // Update Reclaims BEFORE Purchase Needs so reclaim data is available
    ss.toast('Updating Reclaims...', '📊 Generate All Reports', 3);
    updateReclaimsSheet();

    ss.toast('Updating Purchase Needs...', '📊 Generate All Reports', 3);
    updatePurchaseNeeds();

    ss.toast('Updating Inventory Reports...', '📊 Generate All Reports', 3);
    updateInventoryReports();


    logEvent('All reports generated.');
    SpreadsheetApp.getUi().alert('✅ All reports generated successfully!' +
      (upgradeResults && upgradeResults.totalUpgrades > 0 ?
        '\n\n🔄 ' + upgradeResults.totalUpgrades + ' pick list item(s) upgraded to better options.' : ''));
  } catch (e) {
    logEvent('Error in generateAllReports: ' + e, 'ERROR');
    SpreadsheetApp.getUi().alert('❌ Error generating reports: ' + e);
  }
}

/**
 * Upgrades pick list items to better available options.
 * Checks both Glove Swaps and Sleeve Swaps for items that are "In Testing" or "Need to Purchase"
 * and looks for available "On Shelf" items that could replace them.
 *
 * UPGRADE RULES:
 * - Only upgrades items that do NOT have the "Picked" checkbox marked (column I)
 * - Only upgrades items that were NOT manually added (no light blue background #e3f2fd)
 * - Priority: On Shelf (1) > In Testing (2)
 * - Does NOT upgrade "Ready For Delivery" items
 * - Follows same pick list rules: exact size first, then size+0.5 for gloves
 *
 * STRATEGY:
 * 1. Find all employees with "In Testing" or "Need to Purchase" assignments (not picked, not manual)
 * 2. Find all unused "On Shelf" items of matching size/class
 * 3. Assign "On Shelf" items to employees, prioritizing by urgency (change out date)
 *
 * @return {Object} Results object with upgrade counts
 */
function upgradePickListItems() {
  var results = {
    gloveUpgrades: 0,
    sleeveUpgrades: 0,
    totalUpgrades: 0,
    details: []
  };

  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var manualEditColor = '#e3f2fd';

    // Process both Glove and Sleeve swaps
    var swapConfigs = [
      { swapSheet: SHEET_GLOVE_SWAPS, inventorySheet: SHEET_GLOVES, isGloves: true },
      { swapSheet: SHEET_SLEEVE_SWAPS, inventorySheet: SHEET_SLEEVES, isGloves: false }
    ];

    swapConfigs.forEach(function(config) {
      var swapSheet = ss.getSheetByName(config.swapSheet);
      var inventorySheet = ss.getSheetByName(config.inventorySheet);

      if (!swapSheet || !inventorySheet) return;

      var lastRow = swapSheet.getLastRow();
      if (lastRow < 2) return;

      // Get swap data with backgrounds to detect manual edits
      var swapRange = swapSheet.getDataRange();
      var swapData = swapRange.getValues();
      var swapBackgrounds = swapRange.getBackgrounds();
      var inventoryData = inventorySheet.getDataRange().getValues();

      // Collect employees who need upgrades and track all assigned items
      var needsUpgrade = [];
      var assignedPickListItems = new Set();

      Logger.log('=== UPGRADE CHECK: ' + config.swapSheet + ' ===');

      for (var row = 1; row < swapData.length; row++) {
        var employeeName = (swapData[row][0] || '').toString().trim();
        var pickListNum = (swapData[row][6] || '').toString().trim();
        var pickListStatus = (swapData[row][7] || '').toString().trim();
        var isPickedCheckbox = swapData[row][8]; // Column I - Picked checkbox
        var changeOutDate = swapData[row][4]; // Column E - Change Out Date
        var employeeSize = (swapData[row][2] || '').toString().trim(); // Column C - Size
        var pickListBgColor = (swapBackgrounds[row][6] || '').toString().toLowerCase(); // Column G background

        // Skip header rows and empty rows
        if (!employeeName || employeeName === 'Employee' ||
            employeeName.indexOf('Class') !== -1 ||
            employeeName.indexOf('STAGE') !== -1 ||
            employeeName.indexOf('📍') !== -1) {
          continue;
        }

        // Track all assigned items (except Need to Purchase which have no item)
        if (pickListNum && pickListNum !== '—' && pickListNum !== '') {
          assignedPickListItems.add(pickListNum);
        }

        // Skip if already picked (checkbox is checked)
        if (isPickedCheckbox === true) {
          Logger.log('SKIP: ' + employeeName + ' - Already picked (checkbox marked)');
          continue;
        }

        // Skip if manually edited (light blue background)
        if (pickListBgColor === manualEditColor) {
          Logger.log('SKIP: ' + employeeName + ' - Manual edit detected (light blue background)');
          continue;
        }

        // Check if this employee needs an upgrade
        var statusLower = pickListStatus.toLowerCase();
        var currentPriority = getStatusPriority(statusLower);

        // Only upgrade if current status is "In Testing" (priority 2) or "Need to Purchase" (no item)
        // Do NOT upgrade "Ready For Delivery" items
        var needsUpgradeFlag = false;

        if (statusLower.indexOf('need to purchase') !== -1 || pickListNum === '—' || pickListNum === '') {
          // Need to Purchase - try to find any available item
          needsUpgradeFlag = true;
          Logger.log('CANDIDATE: ' + employeeName + ' - Need to Purchase');
        } else if (currentPriority === STATUS_PRIORITY['in testing']) {
          // In Testing - try to find On Shelf item
          needsUpgradeFlag = true;
          Logger.log('CANDIDATE: ' + employeeName + ' - In Testing (priority ' + currentPriority + ')');
        } else if (statusLower.indexOf('ready for delivery') !== -1) {
          // Ready For Delivery - do NOT upgrade
          Logger.log('SKIP: ' + employeeName + ' - Ready For Delivery (no upgrade)');
          continue;
        }

        if (needsUpgradeFlag) {
          // Get the item's class from inventory (or from section header for Need to Purchase)
          var itemClass = null;

          if (pickListNum && pickListNum !== '—' && pickListNum !== '') {
            // Find class from current pick list item
            for (var j = 1; j < inventoryData.length; j++) {
              if (String(inventoryData[j][0]).trim() === pickListNum) {
                itemClass = parseInt(inventoryData[j][2], 10);
                break;
              }
            }
          }

          // If no class found, look backwards to find the class header
          if (itemClass === null) {
            for (var k = row - 1; k >= 0; k--) {
              var headerCell = (swapData[k][0] || '').toString();
              if (headerCell.indexOf('Class 0') !== -1) { itemClass = 0; break; }
              if (headerCell.indexOf('Class 2') !== -1) { itemClass = 2; break; }
              if (headerCell.indexOf('Class 3') !== -1) { itemClass = 3; break; }
            }
          }

          needsUpgrade.push({
            row: row,
            actualRow: row + 1,
            employeeName: employeeName,
            currentItem: pickListNum,
            currentStatus: pickListStatus,
            size: config.isGloves ? parseFloat(employeeSize) : normalizeSleeveSize(employeeSize),
            rawSize: employeeSize,
            itemClass: itemClass,
            isGloves: config.isGloves,
            changeOutDate: changeOutDate ? new Date(changeOutDate) : new Date('2099-12-31')
          });
        }
      }

      Logger.log('UPGRADE: Found ' + needsUpgrade.length + ' candidates for upgrade in ' + config.swapSheet);

      // Build a map of available "On Shelf" items by class and size
      var availableItems = {};

      for (var i = 1; i < inventoryData.length; i++) {
        var item = inventoryData[i];
        var itemNum = String(item[0]).trim();
        var status = (item[6] || '').toString().trim().toLowerCase();
        var assignedTo = (item[7] || '').toString().trim().toLowerCase();
        var pickedFor = (item[9] || '').toString().trim();
        var notes = (item[10] || '').toString().trim().toUpperCase();

        // Only consider "On Shelf" items that aren't already assigned
        var isOnShelf = status === 'on shelf';
        var notAlreadyAssigned = !assignedPickListItems.has(itemNum);
        var notReserved = !pickedFor; // No Picked For reservation
        var notLost = notes.indexOf('LOST-LOCATE') === -1;
        var assignedToOk = (assignedTo === '' || assignedTo === 'on shelf');

        if (isOnShelf && notAlreadyAssigned && notReserved && notLost && assignedToOk) {
          var invItemClass = parseInt(item[2], 10);
          var invItemSize = config.isGloves ? parseFloat(item[1]) : normalizeSleeveSize(item[1]);
          var key = invItemClass + '_' + invItemSize;

          if (!availableItems[key]) {
            availableItems[key] = [];
          }
          availableItems[key].push({
            itemNum: itemNum,
            size: item[1],
            sizeNum: config.isGloves ? parseFloat(item[1]) : null,
            class: invItemClass,
            rowIndex: i
          });
        }
      }

      // Log available items
      Logger.log('UPGRADE: Available On Shelf items (not assigned):');
      Object.keys(availableItems).forEach(function(key) {
        Logger.log('  ' + key + ': ' + availableItems[key].map(function(x) { return x.itemNum; }).join(', '));
      });

      // Sort employees by urgency (earliest change out date first)
      needsUpgrade.sort(function(a, b) {
        return a.changeOutDate - b.changeOutDate;
      });

      // Track which items we've used as upgrades
      var usedUpgradeItems = new Set();

      // Assign available On Shelf items to employees needing upgrade
      needsUpgrade.forEach(function(emp) {
        var lookupKey = emp.itemClass + '_' + emp.size;
        var lookupKeySizeUp = emp.isGloves && !isNaN(emp.size) ? emp.itemClass + '_' + (emp.size + 0.5) : null;

        Logger.log('UPGRADE: Checking ' + emp.employeeName + ' (Class ' + emp.itemClass + ' Size ' + emp.size + ')');

        // Try exact size first
        var upgradeItem = null;
        if (availableItems[lookupKey] && availableItems[lookupKey].length > 0) {
          for (var k = 0; k < availableItems[lookupKey].length; k++) {
            var candidate = availableItems[lookupKey][k];
            if (!usedUpgradeItems.has(candidate.itemNum)) {
              upgradeItem = candidate;
              usedUpgradeItems.add(candidate.itemNum);
              Logger.log('UPGRADE: Found exact size match: ' + candidate.itemNum);
              break;
            }
          }
        }

        // If no exact size match and this is gloves, try size+0.5
        var isSizeUp = false;
        if (!upgradeItem && lookupKeySizeUp && availableItems[lookupKeySizeUp] && availableItems[lookupKeySizeUp].length > 0) {
          for (var m = 0; m < availableItems[lookupKeySizeUp].length; m++) {
            var candidateSizeUp = availableItems[lookupKeySizeUp][m];
            if (!usedUpgradeItems.has(candidateSizeUp.itemNum)) {
              upgradeItem = candidateSizeUp;
              usedUpgradeItems.add(candidateSizeUp.itemNum);
              isSizeUp = true;
              Logger.log('UPGRADE: Found size+0.5 match: ' + candidateSizeUp.itemNum);
              break;
            }
          }
        }

        if (!upgradeItem) {
          Logger.log('UPGRADE: No available On Shelf items for ' + emp.employeeName + ' (tried key: ' + lookupKey + (lookupKeySizeUp ? ' and ' + lookupKeySizeUp : '') + ')');
          return;
        }

        Logger.log('UPGRADE SUCCESS: ' + emp.employeeName + ' -> Item ' + upgradeItem.itemNum + ' (was ' + (emp.currentItem || 'Need to Purchase') + ' / ' + emp.currentStatus + ')');

        // Update the swap sheet
        var newStatus = isSizeUp ? 'In Stock (Size Up) ⚠️' : 'In Stock ✅';
        swapSheet.getRange(emp.actualRow, 7).setValue(upgradeItem.itemNum);
        swapSheet.getRange(emp.actualRow, 8).setValue(newStatus);

        // Highlight the upgrade with green background
        swapSheet.getRange(emp.actualRow, 7).setBackground('#c8e6c9');
        swapSheet.getRange(emp.actualRow, 8).setBackground('#c8e6c9');

        // Track the upgrade
        results.details.push({
          employee: emp.employeeName,
          oldItem: emp.currentItem || 'Need to Purchase',
          oldStatus: emp.currentStatus,
          newItem: upgradeItem.itemNum,
          sizeUp: isSizeUp
        });

        if (config.isGloves) {
          results.gloveUpgrades++;
        } else {
          results.sleeveUpgrades++;
        }
        results.totalUpgrades++;

        logEvent('UPGRADE: ' + emp.employeeName + ' - Changed from "' + emp.currentStatus + '" (' + (emp.currentItem || 'none') + ') to On Shelf item #' + upgradeItem.itemNum + (isSizeUp ? ' (size up)' : ''), 'INFO');
      });
    });

    return results;

  } catch (e) {
    logEvent('Error in upgradePickListItems: ' + e, 'ERROR');
    Logger.log('Error in upgradePickListItems: ' + e);
    return results;
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
    Logger.log('*** generateSwaps START - itemType=' + itemType + ' ***');
    var isGloves = (itemType === 'Gloves');
    logEvent('Generating ' + itemType + ' Swaps report...');
    var ss = SpreadsheetApp.getActiveSpreadsheet();

    // IMMEDIATE DEBUG: Write to a specific cell to confirm code is running
    var testSheet = ss.getSheetByName('Sleeves');
    if (testSheet && !isGloves) {
      // Write debug marker to a far column temporarily
      testSheet.getRange('Z1').setValue('DEBUG: Swap gen ran at ' + new Date().toString());
    }

    Logger.log('*** generateSwaps - got spreadsheet, isGloves=' + isGloves + ' ***');
    var swapSheetName = isGloves ? SHEET_GLOVE_SWAPS : SHEET_SLEEVE_SWAPS;
    var inventorySheetName = isGloves ? SHEET_GLOVES : SHEET_SLEEVES;
    var swapSheet = ss.getSheetByName(swapSheetName);
    var inventorySheet = ss.getSheetByName(inventorySheetName);
    var employeesSheet = ss.getSheetByName(SHEET_EMPLOYEES);

    // Create swap sheet if it doesn't exist
    if (!swapSheet) {
      swapSheet = ss.insertSheet(swapSheetName);
      logEvent('Created new ' + swapSheetName + ' sheet');
    }

    if (!inventorySheet || !employeesSheet) {
      logEvent('Required sheets not found for ' + itemType + ' Swaps');
      return;
    }

    var manualPicks = preserveManualPickLists(swapSheet);
    logEvent('Preserved ' + Object.keys(manualPicks).length + ' manual pick list entries');

    swapSheet.clear();

    // Create debug sheet for logging - only for Sleeves to avoid duplicate creation
    var debugSheet = null;
    var debugRow = 1;
    if (!isGloves) {
      try {
        debugSheet = ss.getSheetByName('DEBUG_SWAP_GENERATION');
        if (!debugSheet) {
          debugSheet = ss.insertSheet('DEBUG_SWAP_GENERATION');
        }
        debugSheet.clear();
        debugSheet.getRange(debugRow++, 1).setValue('=== SWAP GENERATION DEBUG LOG ===');
        debugSheet.getRange(debugRow++, 1).setValue('Timestamp: ' + new Date().toString());
        debugSheet.getRange(debugRow++, 1).setValue('Item Type: ' + itemType);
        SpreadsheetApp.flush();
      } catch (debugErr) {
        Logger.log('Error creating debug sheet: ' + debugErr);
        debugSheet = null;
      }
    }

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

    // Debug: Log first few employees to verify structure
    logEvent('=== EMPLOYEE SHEET STRUCTURE CHECK ===', 'INFO');
    logEvent('Headers: ' + empHeaders.join(' | '), 'INFO');
    logEvent('First employee row (raw): ' + (empData.length > 0 ? JSON.stringify(empData[0].slice(0, 5)) : 'NO DATA'), 'INFO');

    debugSheet && debugSheet.getRange(debugRow++, 1).setValue('=== EMPLOYEE SHEET CHECK ===');
    debugSheet && debugSheet.getRange(debugRow++, 1).setValue('Headers: ' + empHeaders.join(' | '));
    if (empData.length > 0 && debugSheet) {
      debugSheet.getRange(debugRow++, 1).setValue('First employee: ' + JSON.stringify(empData[0].slice(0, 5)));
    }

    empData.forEach(function(row) {
      var name = (row[0] || '').toString().trim().toLowerCase();

      // Debug: Log if this is Waco
      if (name.indexOf('waco') !== -1 || (row[1] && row[1].toString().toLowerCase().indexOf('waco') !== -1)) {
        logEvent('FOUND WACO in employees: row[0]="' + row[0] + '" row[1]="' + row[1] + '" row[2]="' + row[2] + '"', 'INFO');
        debugSheet && debugSheet.getRange(debugRow++, 1).setValue('FOUND WACO: row[0]="' + row[0] + '" row[1]="' + row[1] + '" row[2]="' + row[2] + '"');
      }

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

        // Debug: Log if this is Waco's item
        if (item[0] === 108 || item[0] === '108') {
          logEvent('DEBUG: Found Item #108 in inventory loop - assignedTo="' + assignedTo + '" class=' + item[2], 'INFO');
          debugSheet && debugSheet.getRange(debugRow++, 1).setValue('Found Item #108: assignedTo="' + assignedTo + '" class=' + item[2]);
        }

        if (!assignedTo || ignoreNames.indexOf(assignedTo) !== -1 || !empMap[assignedTo]) {
          if (item[0] === 108 || item[0] === '108') {
            logEvent('DEBUG: Item #108 FILTERED OUT - assignedTo=' + assignedTo + ', in ignoreNames=' + (ignoreNames.indexOf(assignedTo) !== -1) + ', in empMap=' + !!empMap[assignedTo], 'INFO');
            debugSheet && debugSheet.getRange(debugRow++, 1).setValue('Item #108 FILTERED: assignedTo=' + assignedTo + ', inIgnore=' + (ignoreNames.indexOf(assignedTo) !== -1) + ', inEmpMap=' + !!empMap[assignedTo]);
          }
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
          // Debug: Log if this is Waco's item
          if (itemNum === 108 || itemNum === '108') {
            logEvent('DEBUG: Item #108 PASSED 31-day filter - daysLeft=' + daysLeft + ', adding to swapMeta for employee: ' + emp[0], 'INFO');
            debugSheet && debugSheet.getRange(debugRow++, 1).setValue('Item #108 PASSED filter: daysLeft=' + daysLeft + ', employee=' + emp[0]);
          }

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

      // Helper function to normalize item numbers to strings for consistent comparison
      var normalizeItemNum = function(num) {
        return (num || '').toString().trim();
      };

      // PRE-POPULATE assignedItemNums with manual picks to prevent duplicates
      // Check if any employees in this class have manual picks
      Object.keys(manualPicks).forEach(function(empKey) {
        var manualPick = manualPicks[empKey];
        if (manualPick && manualPick.pickListNum && manualPick.pickListNum !== '—') {
          // Check if this employee is in the current class being processed
          var isInCurrentClass = swapMeta.some(function(meta) {
            return meta.emp[0].toLowerCase() === empKey;
          });

          if (isInCurrentClass) {
            assignedItemNums.add(normalizeItemNum(manualPick.pickListNum));
            Logger.log('Pre-assigned item ' + manualPick.pickListNum + ' from manual pick for ' + empKey);
          }
        }
      });

      // Log how many swaps found for this class
      logEvent('Found ' + swapMeta.length + ' employees needing ' + classNames[itemClass] + ' ' + itemLabel + ' swaps', 'INFO');
      debugSheet && debugSheet.getRange(debugRow++, 1).setValue('=== CLASS ' + itemClass + ' ===');
      debugSheet && debugSheet.getRange(debugRow++, 1).setValue('Found ' + swapMeta.length + ' employees needing swaps');
      if (assignedItemNums.size > 0) {
        debugSheet && debugSheet.getRange(debugRow++, 1).setValue('Pre-assigned ' + assignedItemNums.size + ' items from manual picks');
      }

      // Helper function to check if item has LOST-LOCATE marker
      var isLostLocate = function(item) {
        var notes = (item[10] || '').toString().trim().toUpperCase();
        return notes.indexOf('LOST-LOCATE') !== -1;
      };

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
        var employeeKey = employeeName.toLowerCase();

        // CHECK FOR MANUAL PICK FIRST - Skip automatic assignment if manual pick exists
        var hasManualPick = manualPicks[employeeKey] &&
                           manualPicks[employeeKey].pickListNum &&
                           manualPicks[employeeKey].pickListNum !== '—';

        if (hasManualPick) {
          // Employee has a manual pick - we'll restore it later, skip automatic assignment
          Logger.log('Skipping automatic assignment for ' + employeeName + ' - has manual pick: ' + manualPicks[employeeKey].pickListNum);

          // Set placeholder values that will be overwritten by restoreManualPickLists
          pickListValue = '—';
          pickListStatus = 'Need to Purchase ❌';

          // Build the row and continue to next employee
          var rowData = [
            meta.emp[0], meta.itemNum, meta.size, meta.dateAssigned, meta.changeOutDate, meta.daysLeft,
            pickListValue,
            pickListStatus,
            false,
            '',
            '', '', '',
            meta.oldStatus || '', meta.oldAssignedTo || '', meta.oldDateAssigned || '',
            '', '', '', '',
            '', '', ''
          ];

          swapRows.push({
            data: rowData,
            location: meta.employeeLocation,
            daysLeftCell: meta.daysLeftCell
          });

          return; // Skip to next employee
        }

        // Debug logging for problematic cases
        var debugEmployee = (employeeName.toLowerCase().indexOf('waco') !== -1);

        // Write to debug sheet for Waco
        if (debugEmployee && !isGloves && debugSheet) {
          debugSheet.getRange(debugRow++, 1).setValue('=== PROCESSING WACO ===');
          debugSheet.getRange(debugRow++, 1).setValue('Employee: ' + employeeName);
          debugSheet.getRange(debugRow++, 1).setValue('empPreferredSize: "' + meta.empPreferredSize + '"');
          debugSheet.getRange(debugRow++, 1).setValue('itemSize: "' + meta.itemSize + '"');
          debugSheet.getRange(debugRow++, 1).setValue('useSize: "' + useSize + '"');
          debugSheet.getRange(debugRow++, 1).setValue('useSize normalized: "' + normalizeSleeveSize(useSize) + '"');
          debugSheet.getRange(debugRow++, 1).setValue('Looking for Class: ' + meta.itemClass);
          SpreadsheetApp.flush();
        }

        // Log all sleeve employees to see if Waco is being processed
        if (!isGloves && meta.itemClass === 2) {
          logEvent('Processing sleeve swap for: "' + employeeName + '" (lowercase: "' + employeeName.toLowerCase() + '") - debugEmployee=' + debugEmployee, 'INFO');
        }

        if (debugEmployee) {
          Logger.log('=== DEBUG for ' + employeeName + ' ===');
          Logger.log('Item type: ' + itemType);
          Logger.log('meta.empPreferredSize (raw from employee): "' + meta.empPreferredSize + '"');
          Logger.log('meta.itemSize (from current item): "' + meta.itemSize + '"');
          Logger.log('useSize (what we will search for): "' + useSize + '"');
          Logger.log('useSize normalized: "' + normalizeSleeveSize(useSize) + '"');
          Logger.log('Looking for Class ' + meta.itemClass);

          // Show all items of this class and size in inventory
          Logger.log('\n--- ALL Class ' + meta.itemClass + ' items in inventory (size matching) ---');
          var debugCount = 0;
          inventoryData.forEach(function(item) {
            if (parseInt(item[2], 10) !== meta.itemClass) return;
            var itemSize = item[1];
            var sizeMatch = false;
            if (isGloves) {
              sizeMatch = parseFloat(itemSize) === useSize || parseFloat(itemSize) === useSize + 0.5;
            } else {
              sizeMatch = normalizeSleeveSize(itemSize) === normalizeSleeveSize(useSize);
            }
            if (sizeMatch) {
              debugCount++;
              var pickedFor = (item[9] || '').toString().trim();
              var notes = (item[10] || '').toString().trim();
              var isInAssignedSet = assignedItemNums.has(item[0]);
              Logger.log('  [' + debugCount + '] Item #' + item[0] +
                         ' | Size: "' + itemSize + '"' +
                         ' | Status: "' + item[6] + '"' +
                         ' | Assigned To: "' + item[7] + '"' +
                         (pickedFor ? ' | Picked For: "' + pickedFor + '"' : '') +
                         (notes ? ' | Notes: "' + notes + '"' : '') +
                         (isInAssignedSet ? ' | [ALREADY IN assignedItemNums]' : ''));
            }
          });
          Logger.log('--- Total matching items found: ' + debugCount + ' ---\n');
        }

        var pickedForMatch = inventoryData.find(function(item) {
          var pickedFor = (item[9] || '').toString().trim();
          var classMatch = parseInt(item[2], 10) === meta.itemClass;
          var pickedForEmployee = pickedFor.toLowerCase().indexOf(employeeName.toLowerCase()) !== -1;
          var notAlreadyUsed = !assignedItemNums.has(normalizeItemNum(item[0]));
          var notLost = !isLostLocate(item);
          return classMatch && pickedForEmployee && notAlreadyUsed && notLost;
        });

        // UPGRADE CHECK: Before using a "Picked For" item, check if there's a better "On Shelf" option
        // If the picked item is NOT "On Shelf" (e.g., "In Testing" or "Ready For Delivery"),
        // look for a better "On Shelf" item with the correct size
        var upgradedFromPickedFor = false;
        if (pickedForMatch) {
          var pickedStatus = (pickedForMatch[6] || '').toString().trim().toLowerCase();

          // Only look for upgrade if picked item is NOT already "On Shelf"
          if (pickedStatus !== 'on shelf') {
            // Look for a better "On Shelf" item
            var betterOnShelfItem = inventoryData.find(function(item) {
              var statusMatch = item[6] && item[6].toString().trim().toLowerCase() === 'on shelf';
              var classMatch = parseInt(item[2], 10) === meta.itemClass;
              var sizeMatch = isGloves ?
                parseFloat(item[1]) === useSize :
                (item[1] && useSize && normalizeSleeveSize(item[1]) === normalizeSleeveSize(useSize));
              var notAssigned = !assignedItemNums.has(normalizeItemNum(item[0]));
              var pickedFor = (item[9] || '').toString().trim();
              // Item must either not be reserved, or reserved for this employee
              var notReservedForOther = pickedFor === '' || pickedFor.toLowerCase().indexOf(employeeName.toLowerCase()) !== -1;
              var notLost = !isLostLocate(item);
              // Don't select the same item as the picked match
              var notSameItem = normalizeItemNum(item[0]) !== normalizeItemNum(pickedForMatch[0]);

              return statusMatch && classMatch && sizeMatch && notAssigned && notReservedForOther && notLost && notSameItem;
            });

            if (betterOnShelfItem) {
              // Found a better "On Shelf" item - use it instead!
              if (debugEmployee) {
                Logger.log('🔄 UPGRADE: Found better On Shelf item #' + betterOnShelfItem[0] + ' instead of In Testing #' + pickedForMatch[0]);
                if (debugSheet) debugSheet.getRange(debugRow++, 1).setValue('🔄 UPGRADE: Using On Shelf #' + betterOnShelfItem[0] + ' instead of ' + pickedStatus + ' #' + pickedForMatch[0]);
              }
              logEvent('UPGRADE: Employee ' + employeeName + ' - switching from ' + pickedStatus + ' item #' + pickedForMatch[0] + ' to On Shelf item #' + betterOnShelfItem[0], 'INFO');

              // Use the better item
              pickListValue = betterOnShelfItem[0];
              pickListStatusRaw = 'on shelf';
              pickListItemData = betterOnShelfItem;
              isAlreadyPicked = false; // Not already picked - this is a new assignment
              assignedItemNums.add(normalizeItemNum(betterOnShelfItem[0]));
              upgradedFromPickedFor = true;

              var betterSize = isGloves ? parseFloat(betterOnShelfItem[1]) : betterOnShelfItem[1];
              if (isGloves && !isNaN(betterSize) && !isNaN(useSize) && betterSize > useSize) {
                pickListSizeUp = true;
              }
            }
          }
        }

        // If we didn't upgrade, use the original picked-for match
        if (pickedForMatch && !upgradedFromPickedFor) {
          pickListValue = pickedForMatch[0];
          pickListStatusRaw = (pickedForMatch[6] || '').toString().trim().toLowerCase();
          pickListItemData = pickedForMatch;
          isAlreadyPicked = true;
          assignedItemNums.add(normalizeItemNum(pickedForMatch[0]));

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
              (item[1] && useSize && normalizeSleeveSize(item[1]) === normalizeSleeveSize(useSize));
            var notAssigned = !assignedItemNums.has(normalizeItemNum(item[0]));
            var pickedFor = (item[9] || '').toString().trim();
            var isReservedForOther = pickedFor !== '' && pickedFor.toLowerCase().indexOf(employeeName.toLowerCase()) === -1;
            var notLost = !isLostLocate(item);

            if (debugEmployee && classMatch) {
              Logger.log('Checking item ' + item[0] + ': Size="' + item[1] + '" Status="' + item[6] + '"');
              Logger.log('  Item normalized: "' + normalizeSleeveSize(item[1]) + '" vs useSize normalized: "' + normalizeSleeveSize(useSize) + '"');
              Logger.log('  statusMatch=' + statusMatch + ', classMatch=' + classMatch + ', sizeMatch=' + sizeMatch);
              Logger.log('  notAssigned=' + notAssigned + ', pickedFor="' + pickedFor + '"');
              Logger.log('  isReservedForOther=' + isReservedForOther + ', notLost=' + notLost);
              Logger.log('  ALL CONDITIONS: ' + (statusMatch && classMatch && sizeMatch && notAssigned && !isReservedForOther && notLost));
            }

            return statusMatch && classMatch && sizeMatch && notAssigned && !isReservedForOther && notLost;
          });
          if (match) {
            pickListValue = match[0];
            pickListStatusRaw = 'on shelf';
            pickListItemData = match;
            assignedItemNums.add(normalizeItemNum(match[0]));
            if (debugEmployee) {
              Logger.log('✓✓✓ FOUND On Shelf match: ' + match[0]);
              if (debugSheet) debugSheet.getRange(debugRow++, 1).setValue('✓✓✓ FOUND On Shelf match: ' + match[0]);
            }
          } else if (debugEmployee) {
            Logger.log('✗✗✗ No On Shelf exact size match found');
            if (debugSheet) {
              debugSheet.getRange(debugRow++, 1).setValue('✗✗✗ No On Shelf exact size match found');

              // Show what items exist for debugging
              var onShelfItems = inventoryData.filter(function(item) {
                return parseInt(item[2], 10) === meta.itemClass &&
                       item[6] && item[6].toString().trim().toLowerCase() === 'on shelf';
              });
              debugSheet.getRange(debugRow++, 1).setValue('On Shelf items for Class ' + meta.itemClass + ': ' + onShelfItems.length);
              onShelfItems.forEach(function(item, idx) {
                if (idx < 10) { // Limit to 10 items
                  var itemNormalized = normalizeSleeveSize(item[1]);
                  var useSizeNormalized = normalizeSleeveSize(useSize);
                  var sizeMatch = itemNormalized === useSizeNormalized;
                  debugSheet.getRange(debugRow++, 1).setValue(
                    '  Item #' + item[0] + ' | Size: "' + item[1] + '" -> "' + itemNormalized +
                    '" | sizeMatch=' + sizeMatch + ' (vs "' + useSizeNormalized + '")' +
                    ' | inAssigned=' + assignedItemNums.has(normalizeItemNum(item[0])) +
                    ' | pickedFor="' + (item[9] || '') + '"'
                  );
                }
              });
            }
          }
        }

        if (!pickListItemData && isGloves && !isNaN(useSize)) {
          var match = inventoryData.find(function(item) {
            var pickedFor = (item[9] || '').toString().trim();
            var isReservedForOther = pickedFor !== '' && pickedFor.toLowerCase().indexOf(employeeName.toLowerCase()) === -1;
            var notLost = !isLostLocate(item);
            return item[6] && item[6].toString().trim().toLowerCase() === 'on shelf' &&
                   parseInt(item[2], 10) === meta.itemClass &&
                   parseFloat(item[1]) === useSize + 0.5 &&
                   !assignedItemNums.has(normalizeItemNum(item[0])) &&
                   !isReservedForOther &&
                   notLost;
          });
          if (match) {
            pickListValue = match[0];
            pickListStatusRaw = 'on shelf';
            pickListSizeUp = true;
            pickListItemData = match;
            assignedItemNums.add(normalizeItemNum(match[0]));
          }
        }

        if (!pickListItemData) {
          var match = inventoryData.find(function(item) {
            var stat = item[6] && item[6].toString().trim().toLowerCase();
            var statusMatch = (stat === 'ready for delivery' || stat === 'in testing');
            var classMatch = parseInt(item[2], 10) === meta.itemClass;
            var sizeMatch = isGloves ?
              parseFloat(item[1]) === useSize :
              (item[1] && useSize && normalizeSleeveSize(item[1]) === normalizeSleeveSize(useSize));
            var notAssigned = !assignedItemNums.has(normalizeItemNum(item[0]));
            var pickedFor = (item[9] || '').toString().trim();
            var isReservedForOther = pickedFor !== '' && pickedFor.toLowerCase().indexOf(employeeName.toLowerCase()) === -1;
            var notLost = !isLostLocate(item);
            return statusMatch && classMatch && sizeMatch && notAssigned && !isReservedForOther && notLost;
          });
          if (match) {
            pickListValue = match[0];
            pickListStatusRaw = match[6].toString().trim().toLowerCase();
            pickListItemData = match;
            assignedItemNums.add(normalizeItemNum(match[0]));
          }
        }

        if (!pickListItemData && isGloves && !isNaN(useSize)) {
          var match = inventoryData.find(function(item) {
            var stat = item[6] && item[6].toString().trim().toLowerCase();
            var pickedFor = (item[9] || '').toString().trim();
            var isReservedForOther = pickedFor !== '' && pickedFor.toLowerCase().indexOf(employeeName.toLowerCase()) === -1;
            var notLost = !isLostLocate(item);
            return (stat === 'ready for delivery' || stat === 'in testing') &&
                   parseInt(item[2], 10) === meta.itemClass &&
                   parseFloat(item[1]) === useSize + 0.5 &&
                   !assignedItemNums.has(normalizeItemNum(item[0])) &&
                   !isReservedForOther &&
                   notLost;
          });
          if (match) {
            pickListValue = match[0];
            pickListStatusRaw = match[6].toString().trim().toLowerCase();
            pickListSizeUp = true;
            pickListItemData = match;
            assignedItemNums.add(normalizeItemNum(match[0]));
          }
        }

        if (pickListValue === '—') {
          // Enhanced logging to understand WHY no match was found
          var debugReason = [];

          // Check if there are items of this class and size that are filtered out
          var potentialItems = inventoryData.filter(function(item) {
            return parseInt(item[2], 10) === meta.itemClass;
          });

          var sizeMatchItems = potentialItems.filter(function(item) {
            if (isGloves) {
              return parseFloat(item[1]) === useSize || parseFloat(item[1]) === useSize + 0.5;
            } else {
              return normalizeSleeveSize(item[1]) === normalizeSleeveSize(useSize);
            }
          });

          if (sizeMatchItems.length > 0) {
            var alreadyUsedCount = 0;
            var reservedCount = 0;
            var lostLocateCount = 0;
            var wrongStatusCount = 0;

            sizeMatchItems.forEach(function(item) {
              if (isLostLocate(item)) {
                lostLocateCount++;
              } else if (assignedItemNums.has(normalizeItemNum(item[0]))) {
                alreadyUsedCount++;
              } else {
                var pickedFor = (item[9] || '').toString().trim();
                var isReservedForOther = pickedFor !== '' && pickedFor.toLowerCase().indexOf(employeeName.toLowerCase()) === -1;
                if (isReservedForOther) {
                  reservedCount++;
                } else {
                  var stat = (item[6] || '').toString().trim().toLowerCase();
                  if (stat !== 'on shelf' && stat !== 'in testing' && stat !== 'ready for delivery') {
                    wrongStatusCount++;
                  }
                }
              }
            });

            if (alreadyUsedCount > 0) debugReason.push(alreadyUsedCount + ' already used in other swaps');
            if (reservedCount > 0) debugReason.push(reservedCount + ' reserved for others');
            if (lostLocateCount > 0) debugReason.push(lostLocateCount + ' marked LOST-LOCATE');
            if (wrongStatusCount > 0) debugReason.push(wrongStatusCount + ' wrong status');
          }

          pickListStatus = 'Need to Purchase ❌';
          if (debugReason.length > 0) {
            Logger.log('RESULT: Need to Purchase for ' + employeeName + ' - Filtered out: ' + debugReason.join(', '));
          } else if (debugEmployee) {
            Logger.log('RESULT: Need to Purchase - no matches found in any search');
          }
        } else if (pickListStatusRaw === 'on shelf') {
          pickListStatus = pickListSizeUp ? 'In Stock (Size Up) ⚠️' : 'In Stock ✅';
        } else if (pickListStatusRaw === 'ready for delivery') {
          pickListStatus = pickListSizeUp ? 'Ready For Delivery (Size Up) ⚠️' : 'Ready For Delivery 🚚';
        } else if (pickListStatusRaw === 'in testing') {
          pickListStatus = pickListSizeUp ? 'In Testing (Size Up) ⏳' : 'In Testing ⏳';
        } else {
          // Fallback for any other status
          pickListStatus = pickListStatusRaw || meta.status;
        }

        var finalPickListValue = pickListValue;
        var finalPickListStatus = pickListStatus;

        // Keep the actual status for already-picked items
        // Don't override "In Testing" with "Ready For Delivery"
        if (isAlreadyPicked && pickListStatusRaw !== 'in testing') {
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
 * Also populates Stage 1 columns with current inventory data for the manual pick.
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
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheetName = swapSheet.getName();
    var isGloveSwaps = (sheetName === SHEET_GLOVE_SWAPS);
    var inventorySheetName = isGloveSwaps ? SHEET_GLOVES : SHEET_SLEEVES;
    var inventorySheet = ss.getSheetByName(inventorySheetName);

    if (!inventorySheet) {
      Logger.log('restoreManualPickLists: Inventory sheet not found');
      return;
    }

    var inventoryData = inventorySheet.getDataRange().getValues();
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

        // Restore Pick List # and Status
        swapSheet.getRange(actualRow, 7).setValue(preserved.pickListNum);
        swapSheet.getRange(actualRow, 8).setValue(preserved.status);
        swapSheet.getRange(actualRow, 7).setBackground(manualEditColor);

        // Look up item in inventory to populate Stage 1 columns
        var itemData = null;
        for (var j = 1; j < inventoryData.length; j++) {
          if (String(inventoryData[j][0]).trim() === String(preserved.pickListNum).trim()) {
            itemData = inventoryData[j];
            break;
          }
        }

        if (itemData) {
          // Populate Stage 1 columns (K, L, M) with current inventory state
          var stage1Data = [[
            itemData[6] || '',    // K - Status
            itemData[7] || '',    // L - Assigned To
            itemData[4] || ''     // M - Date Assigned
          ]];
          swapSheet.getRange(actualRow, 11, 1, 3).setValues(stage1Data);
        }

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

