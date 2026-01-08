/**
 * Diagnostic Tools for Troubleshooting Pick List Issues
 *
 * Dependencies: Requires constants from 00-Constants.gs and normalizeSleeveSize from 30-SwapGeneration.gs
 */

/* global SHEET_GLOVES, SHEET_SLEEVES, SHEET_GLOVE_SWAPS, SHEET_SLEEVE_SWAPS, SHEET_EMPLOYEES, normalizeSleeveSize */

/**
 * Diagnoses why an employee is showing "Need to Purchase" when items appear available.
 * Call this function with an employee name to see detailed matching logic.
 *
 * Usage: diagnosePurchaseNeed('Employee Name', 'Gloves' or 'Sleeves')
 */
function diagnosePurchaseNeed(employeeName, itemType) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var isGloves = (itemType === 'Gloves');
    var inventorySheetName = isGloves ? SHEET_GLOVES : SHEET_SLEEVES;
    var swapSheetName = isGloves ? SHEET_GLOVE_SWAPS : SHEET_SLEEVE_SWAPS;
    var employeesSheet = ss.getSheetByName(SHEET_EMPLOYEES);
    var inventorySheet = ss.getSheetByName(inventorySheetName);
    var swapSheet = ss.getSheetByName(swapSheetName);

    if (!employeesSheet || !inventorySheet) {
      Logger.log('ERROR: Required sheets not found');
      return;
    }

    // Find employee
    var employees = employeesSheet.getDataRange().getValues();
    var empData = employees.slice(1);
    var sizeColIndex = isGloves ? 8 : 9;

    var targetEmp = null;
    var empNameLower = employeeName.toLowerCase();
    for (var i = 0; i < empData.length; i++) {
      var name = (empData[i][0] || '').toString().trim().toLowerCase();
      if (name === empNameLower) {
        targetEmp = empData[i];
        break;
      }
    }

    if (!targetEmp) {
      Logger.log('ERROR: Employee "' + employeeName + '" not found');
      return;
    }

    var empPreferredSize = targetEmp[sizeColIndex];
    Logger.log('========================================');
    Logger.log('DIAGNOSTIC: ' + employeeName + ' - ' + itemType);
    Logger.log('========================================');
    Logger.log('Employee preferred size: ' + empPreferredSize);

    // Find their current item and swap entry
    var inventory = inventorySheet.getDataRange().getValues();
    var inventoryData = inventory.slice(1);

    var currentItems = inventoryData.filter(function(item) {
      var assignedTo = (item[7] || '').toString().trim().toLowerCase();
      return assignedTo === empNameLower;
    });

    Logger.log('Current items assigned to employee: ' + currentItems.length);
    currentItems.forEach(function(item) {
      Logger.log('  - Item #' + item[0] + ', Size: ' + item[1] + ', Class: ' + item[2] + ', Status: ' + item[6]);
    });

    // Find their swap entry
    if (swapSheet) {
      var swapData = swapSheet.getDataRange().getValues();
      var swapEntry = null;
      for (var j = 0; j < swapData.length; j++) {
        var swapRow = swapData[j];
        var swapName = (swapRow[0] || '').toString().trim().toLowerCase();
        if (swapName === empNameLower) {
          swapEntry = swapRow;
          break;
        }
      }

      if (swapEntry) {
        Logger.log('\nSwap Entry Found:');
        Logger.log('  Current Item: ' + swapEntry[1]);
        Logger.log('  Size: ' + swapEntry[2]);
        Logger.log('  Pick List Item: ' + swapEntry[6]);
        Logger.log('  Status: ' + swapEntry[7]);
        Logger.log('  Days Left: ' + swapEntry[5]);
      } else {
        Logger.log('\nNo swap entry found for this employee');
      }
    }

    // Now search for available items
    Logger.log('\n--- SEARCHING FOR AVAILABLE ITEMS ---');

    // Determine what class we need
    var neededClass = null;
    if (currentItems.length > 0) {
      neededClass = parseInt(currentItems[0][2], 10);
      Logger.log('Searching for Class ' + neededClass + ' items');
    } else {
      Logger.log('WARNING: No current item assigned, cannot determine class');
      return;
    }

    var useSize = empPreferredSize || currentItems[0][1];
    Logger.log('Search size: ' + useSize);
    if (!isGloves) {
      Logger.log('Normalized search size: ' + normalizeSleeveSize(useSize));
    }

    // Build list of all assigned item numbers (simulating assignedItemNums Set)
    var assignedItemNums = new Set();

    // Check for items that match criteria
    Logger.log('\n--- CHECKING INVENTORY ---');
    var onShelfExact = [];
    var onShelfSizeUp = [];
    var inTestingExact = [];
    var inTestingSizeUp = [];
    var readyForDeliveryExact = [];
    var readyForDeliverySizeUp = [];
    var reservedForOthers = [];
    var lostLocateItems = [];

    inventoryData.forEach(function(item) {
      var itemNum = item[0];
      var itemSize = item[1];
      var itemClass = parseInt(item[2], 10);
      var itemStatus = (item[6] || '').toString().trim().toLowerCase();
      var itemAssignedTo = (item[7] || '').toString().trim().toLowerCase();
      var pickedFor = (item[9] || '').toString().trim();
      var notes = (item[10] || '').toString().trim().toUpperCase();

      // Only check items of the right class
      if (itemClass !== neededClass) return;

      var isLostLocate = notes.indexOf('LOST-LOCATE') !== -1;
      if (isLostLocate) {
        lostLocateItems.push({num: itemNum, size: itemSize, status: itemStatus, notes: notes});
        return;
      }

      var isReservedForOther = pickedFor !== '' && pickedFor.toLowerCase().indexOf(empNameLower) === -1;
      if (isReservedForOther) {
        reservedForOthers.push({num: itemNum, size: itemSize, status: itemStatus, pickedFor: pickedFor});
        return;
      }

      var isAlreadyUsed = assignedItemNums.has(itemNum);

      // Check size match
      var sizeMatch = false;
      var sizeUpMatch = false;

      if (isGloves) {
        var itemSizeNum = parseFloat(itemSize);
        var useSizeNum = parseFloat(useSize);
        if (!isNaN(itemSizeNum) && !isNaN(useSizeNum)) {
          sizeMatch = itemSizeNum === useSizeNum;
          sizeUpMatch = itemSizeNum === useSizeNum + 0.5;
        }
      } else {
        var itemSizeNorm = normalizeSleeveSize(itemSize);
        var useSizeNorm = normalizeSleeveSize(useSize);
        sizeMatch = itemSizeNorm === useSizeNorm;
      }

      if (itemStatus === 'on shelf') {
        if (sizeMatch) {
          onShelfExact.push({num: itemNum, size: itemSize, assignedTo: itemAssignedTo, used: isAlreadyUsed, pickedFor: pickedFor});
        } else if (sizeUpMatch && isGloves) {
          onShelfSizeUp.push({num: itemNum, size: itemSize, assignedTo: itemAssignedTo, used: isAlreadyUsed, pickedFor: pickedFor});
        }
      } else if (itemStatus === 'in testing') {
        if (sizeMatch) {
          inTestingExact.push({num: itemNum, size: itemSize, assignedTo: itemAssignedTo, used: isAlreadyUsed, pickedFor: pickedFor});
        } else if (sizeUpMatch && isGloves) {
          inTestingSizeUp.push({num: itemNum, size: itemSize, assignedTo: itemAssignedTo, used: isAlreadyUsed, pickedFor: pickedFor});
        }
      } else if (itemStatus === 'ready for delivery') {
        if (sizeMatch) {
          readyForDeliveryExact.push({num: itemNum, size: itemSize, assignedTo: itemAssignedTo, used: isAlreadyUsed, pickedFor: pickedFor});
        } else if (sizeUpMatch && isGloves) {
          readyForDeliverySizeUp.push({num: itemNum, size: itemSize, assignedTo: itemAssignedTo, used: isAlreadyUsed, pickedFor: pickedFor});
        }
      }
    });

    // Report findings
    Logger.log('\n=== RESULTS ===');
    Logger.log('On Shelf (Exact Size): ' + onShelfExact.length);
    onShelfExact.forEach(function(i) {
      Logger.log('  Item #' + i.num + ' - Size ' + i.size + (i.used ? ' [ALREADY USED]' : '') + (i.pickedFor ? ' [PICKED FOR: ' + i.pickedFor + ']' : ''));
    });

    if (isGloves) {
      Logger.log('On Shelf (Size Up): ' + onShelfSizeUp.length);
      onShelfSizeUp.forEach(function(i) {
        Logger.log('  Item #' + i.num + ' - Size ' + i.size + (i.used ? ' [ALREADY USED]' : '') + (i.pickedFor ? ' [PICKED FOR: ' + i.pickedFor + ']' : ''));
      });
    }

    Logger.log('In Testing (Exact Size): ' + inTestingExact.length);
    inTestingExact.forEach(function(i) {
      Logger.log('  Item #' + i.num + ' - Size ' + i.size + (i.used ? ' [ALREADY USED]' : '') + (i.pickedFor ? ' [PICKED FOR: ' + i.pickedFor + ']' : ''));
    });

    if (isGloves) {
      Logger.log('In Testing (Size Up): ' + inTestingSizeUp.length);
      inTestingSizeUp.forEach(function(i) {
        Logger.log('  Item #' + i.num + ' - Size ' + i.size + (i.used ? ' [ALREADY USED]' : '') + (i.pickedFor ? ' [PICKED FOR: ' + i.pickedFor + ']' : ''));
      });
    }

    Logger.log('Ready For Delivery (Exact Size): ' + readyForDeliveryExact.length);
    readyForDeliveryExact.forEach(function(i) {
      Logger.log('  Item #' + i.num + ' - Size ' + i.size + (i.used ? ' [ALREADY USED]' : '') + (i.pickedFor ? ' [PICKED FOR: ' + i.pickedFor + ']' : ''));
    });

    if (isGloves) {
      Logger.log('Ready For Delivery (Size Up): ' + readyForDeliverySizeUp.length);
      readyForDeliverySizeUp.forEach(function(i) {
        Logger.log('  Item #' + i.num + ' - Size ' + i.size + (i.used ? ' [ALREADY USED]' : '') + (i.pickedFor ? ' [PICKED FOR: ' + i.pickedFor + ']' : ''));
      });
    }

    if (reservedForOthers.length > 0) {
      Logger.log('\nReserved for Other Employees: ' + reservedForOthers.length);
      reservedForOthers.forEach(function(i) {
        Logger.log('  Item #' + i.num + ' - Size ' + i.size + ' - Status: ' + i.status + ' - Picked For: ' + i.pickedFor);
      });
    }

    if (lostLocateItems.length > 0) {
      Logger.log('\nLOST-LOCATE Items (excluded): ' + lostLocateItems.length);
      lostLocateItems.forEach(function(i) {
        Logger.log('  Item #' + i.num + ' - Size ' + i.size + ' - Status: ' + i.status);
      });
    }

    Logger.log('\n=== CONCLUSION ===');
    var totalAvailable = onShelfExact.length + onShelfSizeUp.length + inTestingExact.length +
                         inTestingSizeUp.length + readyForDeliveryExact.length + readyForDeliverySizeUp.length;

    if (totalAvailable > 0) {
      Logger.log('✓ Items ARE available but may be filtered out due to:');
      Logger.log('  - Already used in another swap in this generation');
      Logger.log('  - Reserved for another employee (Picked For column)');
      Logger.log('  - LOST-LOCATE marker in Notes');
    } else {
      Logger.log('✗ No available items found matching criteria');
      Logger.log('  Reasons could be:');
      Logger.log('  - All matching items are reserved for other employees');
      Logger.log('  - All matching items have LOST-LOCATE marker');
      Logger.log('  - Size mismatch in inventory vs employee preference');
    }

    Logger.log('========================================');

  } catch (e) {
    Logger.log('ERROR in diagnosePurchaseNeed: ' + e);
  }
}

/**
 * Shows all swap assignments to identify conflicts
 * This helps understand why items show "Need to Purchase"
 */
function showAllSwapAssignments(itemType) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var isGloves = (itemType === 'Gloves');
    var swapSheetName = isGloves ? SHEET_GLOVE_SWAPS : SHEET_SLEEVE_SWAPS;
    var inventorySheetName = isGloves ? SHEET_GLOVES : SHEET_SLEEVES;
    var swapSheet = ss.getSheetByName(swapSheetName);
    var inventorySheet = ss.getSheetByName(inventorySheetName);

    if (!swapSheet || !inventorySheet) {
      Logger.log('ERROR: Required sheets not found');
      return;
    }

    var swapData = swapSheet.getDataRange().getValues();
    var inventory = inventorySheet.getDataRange().getValues();
    var inventoryData = inventory.slice(1);

    Logger.log('========================================');
    Logger.log('ALL SWAP ASSIGNMENTS - ' + itemType);
    Logger.log('========================================\n');

    var currentClass = null;
    var swapCount = 0;
    var needToPurchaseCount = 0;
    var assignmentsBySize = {};

    for (var i = 0; i < swapData.length; i++) {
      var row = swapData[i];
      var cellA = row[0];

      // Detect class headers
      var classHeaderPattern = new RegExp('^Class (\\d+) (Glove|Sleeve) Swaps', 'i');
      var headerMatch = cellA && typeof cellA === 'string' && cellA.match(classHeaderPattern);
      if (headerMatch) {
        currentClass = parseInt(headerMatch[1], 10);
        Logger.log('\n=== CLASS ' + currentClass + ' ===\n');
        continue;
      }

      // Skip non-data rows
      if (!cellA || typeof cellA !== 'string') continue;
      if (cellA.toLowerCase() === 'employee' || cellA.indexOf('STAGE') !== -1 || cellA.indexOf('📍') !== -1) continue;

      var employeeName = cellA;
      var currentItemNum = row[1];
      var size = row[2];
      var pickListItem = row[6];
      var status = row[7];

      if (!employeeName || !size) continue;

      swapCount++;

      // Track assignments by size
      var key = 'Class ' + currentClass + ' Size ' + size;
      if (!assignmentsBySize[key]) {
        assignmentsBySize[key] = { needPurchase: [], assigned: [] };
      }

      if (status && status.indexOf('Need to Purchase') !== -1) {
        needToPurchaseCount++;
        assignmentsBySize[key].needPurchase.push(employeeName);

        Logger.log('❌ ' + employeeName + ' - Size ' + size);
        Logger.log('   Current: ' + currentItemNum);
        Logger.log('   Status: ' + status);

        // Check what's available in this size/class
        var availableItems = inventoryData.filter(function(item) {
          var itemClass = parseInt(item[2], 10);
          var itemStatus = (item[6] || '').toString().trim().toLowerCase();
          var itemSize = item[1];

          var sizeMatch = false;
          if (isGloves) {
            sizeMatch = parseFloat(itemSize) === parseFloat(size);
          } else {
            sizeMatch = normalizeSleeveSize(itemSize) === normalizeSleeveSize(size);
          }

          return itemClass === currentClass && sizeMatch &&
                 (itemStatus === 'on shelf' || itemStatus === 'in testing' || itemStatus === 'ready for delivery');
        });

        Logger.log('   Available in inventory: ' + availableItems.length);
        availableItems.forEach(function(item) {
          var pickedFor = (item[9] || '').toString().trim();
          var notes = (item[10] || '').toString().trim();
          Logger.log('     • Item #' + item[0] + ' - Status: ' + item[6] +
                     (pickedFor ? ' - Picked For: ' + pickedFor : '') +
                     (notes ? ' - Notes: ' + notes : ''));
        });
        Logger.log('');

      } else {
        assignmentsBySize[key].assigned.push({ emp: employeeName, item: pickListItem });
        Logger.log('✓ ' + employeeName + ' → ' + pickListItem + ' (' + size + ') - ' + status);
      }
    }

    Logger.log('\n========================================');
    Logger.log('SUMMARY BY SIZE/CLASS');
    Logger.log('========================================\n');

    Object.keys(assignmentsBySize).sort().forEach(function(key) {
      var data = assignmentsBySize[key];
      var totalNeeded = data.needPurchase.length + data.assigned.length;

      Logger.log(key + ':');
      Logger.log('  Total needing swaps: ' + totalNeeded);
      Logger.log('  Successfully assigned: ' + data.assigned.length);
      Logger.log('  Need to Purchase: ' + data.needPurchase.length);

      if (data.needPurchase.length > 0) {
        Logger.log('  Employees needing purchase: ' + data.needPurchase.join(', '));
      }
      Logger.log('');
    });

    Logger.log('========================================');
    Logger.log('TOTALS');
    Logger.log('========================================');
    Logger.log('Total swaps: ' + swapCount);
    Logger.log('Need to Purchase: ' + needToPurchaseCount);
    Logger.log('Successfully assigned: ' + (swapCount - needToPurchaseCount));
    Logger.log('========================================');

  } catch (e) {
    Logger.log('ERROR in showAllSwapAssignments: ' + e);
  }
}

/**
 * Quick menu option to run diagnostic on selected employee
 * Just change the employee name and item type below and run
 */
// eslint-disable-next-line no-unused-vars
function runDiagnostic() {
  // CHANGE THESE VALUES:
  var employeeName = 'Waco Worts';
  var itemType = 'Sleeves';

  diagnosePurchaseNeed(employeeName, itemType);

  SpreadsheetApp.getUi().alert('Diagnostic complete. Check the execution log:\nExtensions → Apps Script → View Logs');
}

/**
 * Run overview of all sleeve swaps
 */
// eslint-disable-next-line no-unused-vars
function runSleeveSwapDiagnostic() {
  showAllSwapAssignments('Sleeves');
  SpreadsheetApp.getUi().alert('Diagnostic complete. Check the execution log:\nExtensions → Apps Script → View Logs');
}

/**
 * Run overview of all glove swaps
 */
// eslint-disable-next-line no-unused-vars
function runGloveSwapDiagnostic() {
  showAllSwapAssignments('Gloves');
  SpreadsheetApp.getUi().alert('Diagnostic complete. Check the execution log:\nExtensions → Apps Script → View Logs');
}

