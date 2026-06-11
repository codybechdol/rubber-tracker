/**
 * Glove Manager – Swap Report Generation
 *
 * Generates Glove and Sleeve Swap reports.
 *
 * NOTE: generateSwaps(), generateAllReports(), preserveManualPickLists(), and
 * restoreManualPickLists() are implemented in Code.gs (loads last, wins on duplicate names).
 * This file contains: normalizeSleeveSize, getStatusPriority, upgradePickListItems,
 * generateGloveSwaps stub, generateSleeveSwaps stub.
 */

/**
 * Normalizes sleeve size to a comparable value.
 * @param {string|number} size
 * @return {string}
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

        // Skip header rows and empty rows.
        // Real employee rows always have a current item number in column B.
        // Merged location/foreman header rows have empty column B (merged cells).
        var currentItemNum = (swapData[row][1] || '').toString().trim();
        if (!employeeName || !currentItemNum ||
            employeeName === 'Employee' ||
            employeeName.indexOf('Class') !== -1 ||
            employeeName.indexOf('STAGE') !== -1 ||
            employeeName === 'No swaps due for this class') {
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
            // Uses COLS.INVENTORY.CLASS - 1 = index 3 (12-col layout with ESL ID at col B)
            for (var j = 1; j < inventoryData.length; j++) {
              if (String(inventoryData[j][COLS.INVENTORY.ITEM_NUM - 1]).trim() === pickListNum) {
                itemClass = parseInt(inventoryData[j][COLS.INVENTORY.CLASS - 1], 10);
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

      // Column indices use COLS.INVENTORY constants (12-col layout with ESL ID at col B):
      // ITEM_NUM=1(idx 0), ESL_ID=2(idx 1), SIZE=3(idx 2), CLASS=4(idx 3),
      // TEST_DATE=5(idx 4), DATE_ASSIGNED=6(idx 5), LOCATION=7(idx 6), STATUS=8(idx 7),
      // ASSIGNED_TO=9(idx 8), CHANGE_OUT_DATE=10(idx 9), PICKED_FOR=11(idx 10), NOTES=12(idx 11)
      for (var i = 1; i < inventoryData.length; i++) {
        var item = inventoryData[i];
        var itemNum = String(item[COLS.INVENTORY.ITEM_NUM - 1]).trim();
        var status = (item[COLS.INVENTORY.STATUS - 1] || '').toString().trim().toLowerCase();
        var assignedTo = (item[COLS.INVENTORY.ASSIGNED_TO - 1] || '').toString().trim().toLowerCase();
        var pickedFor = (item[COLS.INVENTORY.PICKED_FOR - 1] || '').toString().trim();
        var notes = (item[COLS.INVENTORY.NOTES - 1] || '').toString().trim().toUpperCase();

        // Only consider "On Shelf" items that aren't already assigned
        var isOnShelf = status === 'on shelf';
        var notAlreadyAssigned = !assignedPickListItems.has(itemNum);
        var notReserved = !pickedFor; // No Picked For reservation
        var notLost = notes.indexOf('LOST-LOCATE') === -1;
        var assignedToOk = (assignedTo === '' || assignedTo === 'on shelf');

        if (isOnShelf && notAlreadyAssigned && notReserved && notLost && assignedToOk) {
          var invItemClass = parseInt(item[COLS.INVENTORY.CLASS - 1], 10);
          var invItemSize = config.isGloves ? parseFloat(item[COLS.INVENTORY.SIZE - 1]) : normalizeSleeveSize(item[COLS.INVENTORY.SIZE - 1]);
          var key = invItemClass + '_' + invItemSize;

          if (!availableItems[key]) {
            availableItems[key] = [];
          }
          availableItems[key].push({
            itemNum: itemNum,
            size: item[COLS.INVENTORY.SIZE - 1],
            sizeNum: config.isGloves ? parseFloat(item[COLS.INVENTORY.SIZE - 1]) : null,
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
