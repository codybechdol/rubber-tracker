/**
 * Glove Manager – Inventory Reports
 *
 * Functions for generating inventory statistics and dashboards.
 * Provides status breakdowns, counts, and analytics.
 * Includes annual tracking with year-end summaries.
 */

// Property keys for annual tracking
var ANNUAL_STATS_KEY = 'annualInventoryStats';

/**
 * Updates the Inventory Reports sheet with comprehensive statistics.
 * Creates a colorful dashboard with status breakdowns, class summaries,
 * location distribution, assignment averages, and annual history.
 *
 * Menu item: Included in Generate All Reports
 */
function updateInventoryReports() {
  try {
    logEvent('Updating Inventory Reports...');
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var inventorySheet = ss.getSheetByName('Inventory Reports');
    if (!inventorySheet) {
      inventorySheet = ss.insertSheet('Inventory Reports');
    }

    // IMPORTANT: Get existing data BEFORE clearing the sheet!
    var existingLogData = getNewItemsLogDataFromSheet(inventorySheet);
    var sheetAnnualHistory = getAnnualHistoryFromSheet(inventorySheet);
    var propsAnnualHistory = getAnnualHistoryFromProperties();

    // Merge annual history from sheet and properties (properties takes precedence for new data)
    var existingAnnualHistory = mergeAnnualHistory(sheetAnnualHistory, propsAnnualHistory);
    logEvent('Preserved ' + existingLogData.length + ' new item log entries and ' + existingAnnualHistory.length + ' annual history records');

    inventorySheet.clear();

    var glovesSheet = ss.getSheetByName('Gloves');
    var sleevesSheet = ss.getSheetByName('Sleeves');

    if (!glovesSheet || !sleevesSheet) {
      inventorySheet.getRange(1, 1).setValue('Missing Gloves or Sleeves sheet');
      return;
    }

    var now = new Date();
    var currentYear = now.getFullYear();
    var timestamp = Utilities.formatDate(now, ss.getSpreadsheetTimeZone(), 'MM/dd/yyyy, h:mm:ss a');

    // Check for year rollover and handle it
    var storedYear = getStoredYear();
    if (storedYear && storedYear < currentYear) {
      // Year changed! Archive previous year's stats
      existingAnnualHistory = archivePreviousYearStats(storedYear, existingAnnualHistory, existingLogData);
      // Reset YTD stats for new year
      resetYearToDateStats();
      logEvent('New year detected! Archived ' + storedYear + ' stats and reset for ' + currentYear);
    }
    setStoredYear(currentYear);

    var glovesData = glovesSheet.getLastRow() > 1 ? glovesSheet.getRange(2, 1, glovesSheet.getLastRow() - 1, COLS.INVENTORY.NOTES).getValues() : [];
    var sleevesData = sleevesSheet.getLastRow() > 1 ? sleevesSheet.getRange(2, 1, sleevesSheet.getLastRow() - 1, COLS.INVENTORY.NOTES).getValues() : [];

    var totalGloves = glovesData.length;
    var totalSleeves = sleevesData.length;

    // Update peak counts if current totals are higher
    updatePeakCounts(totalGloves, totalSleeves);
    var peakGloves = getPeakGloveCount();
    var peakSleeves = getPeakSleeveCount();

    var gloveStatusCounts = {};
    var sleeveStatusCounts = {};
    var gloveClassCounts = {};
    var sleeveClassCounts = {};
    var locationCounts = {};

    // YTD counters
    var ytdGloveAssignments = 0;
    var ytdSleeveAssignments = 0;
    var ytdGlovesLost = 0;
    var ytdGlovesFailed = 0;
    var ytdSleevesLost = 0;
    var ytdSleevesFailed = 0;

    // Non-employee assignment values to exclude from employee assignment counts
    var nonEmployeeAssignments = [
      'lost', 'failed rubber', 'destroyed', 'on shelf', 'in testing',
      'ready for delivery', 'ready for test', 'unassigned', ''
    ];

    // Process gloves
    glovesData.forEach(function(row) {
      var status = normalizeStatusForReport(row[COLS.INVENTORY.STATUS - 1]);
      var itemClass = String(row[COLS.INVENTORY.CLASS - 1]).trim();
      var location = (row[COLS.INVENTORY.LOCATION - 1] || '').toString().trim();
      var dateAssigned = row[COLS.INVENTORY.DATE_ASSIGNED - 1];
      var assignedTo = String(row[COLS.INVENTORY.ASSIGNED_TO - 1] || '').trim();
      var assignedToLower = assignedTo.toLowerCase();

      gloveStatusCounts[status] = (gloveStatusCounts[status] || 0) + 1;

      if (itemClass === '0' || itemClass === '2' || itemClass === '3') {
        gloveClassCounts[itemClass] = (gloveClassCounts[itemClass] || 0) + 1;
      }

      if (location) {
        if (!locationCounts[location]) locationCounts[location] = { gloves: 0, sleeves: 0 };
        locationCounts[location].gloves++;
      }

      // Check if Date Assigned is in current year
      if (dateAssigned) {
        var assignDate = new Date(dateAssigned);
        if (!isNaN(assignDate.getTime()) && assignDate.getFullYear() === currentYear) {
          // Count YTD employee assignments only (exclude non-employee assignments)
          if (nonEmployeeAssignments.indexOf(assignedToLower) === -1 && status === 'Assigned') {
            ytdGloveAssignments++;
          }
          // Count YTD Lost - items assigned to "Lost" with Date Assigned in current year
          if (status === 'Lost' || assignedToLower === 'lost') {
            ytdGlovesLost++;
          }
          // Count YTD Failed - items assigned to "Failed Rubber" with Date Assigned in current year
          if (status === 'Failed Rubber' || assignedToLower === 'failed rubber') {
            ytdGlovesFailed++;
          }
        }
      }
    });

    // Process sleeves
    sleevesData.forEach(function(row) {
      var status = normalizeStatusForReport(row[COLS.INVENTORY.STATUS - 1]);
      var itemClass = String(row[COLS.INVENTORY.CLASS - 1]).trim();
      var location = (row[COLS.INVENTORY.LOCATION - 1] || '').toString().trim();
      var dateAssigned = row[COLS.INVENTORY.DATE_ASSIGNED - 1];
      var assignedTo = String(row[COLS.INVENTORY.ASSIGNED_TO - 1] || '').trim();
      var assignedToLower = assignedTo.toLowerCase();

      sleeveStatusCounts[status] = (sleeveStatusCounts[status] || 0) + 1;

      if (itemClass === '2' || itemClass === '3') {
        sleeveClassCounts[itemClass] = (sleeveClassCounts[itemClass] || 0) + 1;
      }

      if (location) {
        if (!locationCounts[location]) locationCounts[location] = { gloves: 0, sleeves: 0 };
        locationCounts[location].sleeves++;
      }

      // Check if Date Assigned is in current year
      if (dateAssigned) {
        var assignDate = new Date(dateAssigned);
        if (!isNaN(assignDate.getTime()) && assignDate.getFullYear() === currentYear) {
          // Count YTD employee assignments only (exclude non-employee assignments)
          if (nonEmployeeAssignments.indexOf(assignedToLower) === -1 && status === 'Assigned') {
            ytdSleeveAssignments++;
          }
          // Count YTD Lost - items assigned to "Lost" with Date Assigned in current year
          if (status === 'Lost' || assignedToLower === 'lost') {
            ytdSleevesLost++;
          }
          // Count YTD Failed - items assigned to "Failed Rubber" with Date Assigned in current year
          if (status === 'Failed Rubber' || assignedToLower === 'failed rubber') {
            ytdSleevesFailed++;
          }
        }
      }
    });


    var gloveAssigned = gloveStatusCounts['Assigned'] || 0;
    var sleeveAssigned = sleeveStatusCounts['Assigned'] || 0;

    // Calculate monthly averages based on month of year for YTD assignments
    var monthOfYear = now.getMonth() + 1; // 1-12
    var gloveMonthlyAvg = monthOfYear > 0 ? (ytdGloveAssignments / monthOfYear).toFixed(1) : '0';
    var sleeveMonthlyAvg = monthOfYear > 0 ? (ytdSleeveAssignments / monthOfYear).toFixed(1) : '0';

    // Calculate New Items for current year from log
    var glovesPurchased = 0, glovesReclaimed = 0;
    var sleevesPurchased = 0, sleevesReclaimed = 0;

    existingLogData.forEach(function(item) {
      var itemDate = new Date(item.dateAdded);
      if (isNaN(itemDate.getTime()) || itemDate.getFullYear() !== currentYear) return;

      if (item.itemType === 'Glove') {
        if (item.source === 'Purchased') glovesPurchased++;
        else if (item.source === 'Reclaimed') glovesReclaimed++;
      } else if (item.itemType === 'Sleeve') {
        if (item.source === 'Purchased') sleevesPurchased++;
        else if (item.source === 'Reclaimed') sleevesReclaimed++;
      }
    });

    // =========================================================================
    // BUILD THE REPORT
    // =========================================================================
    var row = 1;

    // Title
    inventorySheet.getRange(row, 1, 1, 10).merge()
      .setValue('INVENTORY DASHBOARD - Generated: ' + timestamp)
      .setFontWeight('bold').setFontSize(14).setBackground('#1565c0').setFontColor('white').setHorizontalAlignment('center');
    inventorySheet.setRowHeight(row, 35);
    row += 2;

    // Summary header row (10 columns now - added Peak Gloves, Peak Sleeves)
    var summaryHeaderRange = inventorySheet.getRange(row, 1, 1, 10);
    summaryHeaderRange.setValues([
      ['TOTAL GLOVES', 'TOTAL SLEEVES', 'NEW GLOVES (' + currentYear + ')', 'NEW SLEEVES (' + currentYear + ')',
       'Glove Avg/Month', 'Sleeve Avg/Month', 'Gloves Lost/Failed', 'Sleeves Lost/Failed',
       'Peak Gloves (' + currentYear + ')', 'Peak Sleeves (' + currentYear + ')']
    ]).setFontWeight('bold').setHorizontalAlignment('center').setFontColor('white').setFontSize(9);
    inventorySheet.getRange(row, 1).setBackground('#1565c0');
    inventorySheet.getRange(row, 2).setBackground('#2e7d32');
    inventorySheet.getRange(row, 3).setBackground('#6a1b9a');
    inventorySheet.getRange(row, 4).setBackground('#7b1fa2');
    inventorySheet.getRange(row, 5).setBackground('#0277bd');
    inventorySheet.getRange(row, 6).setBackground('#388e3c');
    inventorySheet.getRange(row, 7).setBackground('#c62828');
    inventorySheet.getRange(row, 8).setBackground('#d32f2f');
    inventorySheet.getRange(row, 9).setBackground('#ff6f00');
    inventorySheet.getRange(row, 10).setBackground('#ef6c00');
    inventorySheet.setRowHeight(row, 30);
    row++;

    // Summary data row
    var newGlovesStr = glovesPurchased + '/' + glovesReclaimed;
    var newSleevesStr = sleevesPurchased + '/' + sleevesReclaimed;

    var summaryDataRange = inventorySheet.getRange(row, 1, 1, 10);
    summaryDataRange.setValues([
      [totalGloves, totalSleeves, newGlovesStr, newSleevesStr, gloveMonthlyAvg, sleeveMonthlyAvg,
       ytdGlovesLost + '/' + ytdGlovesFailed, ytdSleevesLost + '/' + ytdSleevesFailed, peakGloves, peakSleeves]
    ]).setHorizontalAlignment('center').setFontSize(16).setFontWeight('bold');
    inventorySheet.getRange(row, 1).setBackground('#e3f2fd').setFontColor('#1565c0');
    inventorySheet.getRange(row, 2).setBackground('#e8f5e9').setFontColor('#2e7d32');
    inventorySheet.getRange(row, 3).setBackground('#f3e5f5').setFontColor('#6a1b9a');
    inventorySheet.getRange(row, 4).setBackground('#f3e5f5').setFontColor('#7b1fa2');
    inventorySheet.getRange(row, 5).setBackground('#e1f5fe').setFontColor('#0277bd');
    inventorySheet.getRange(row, 6).setBackground('#c8e6c9').setFontColor('#388e3c');
    inventorySheet.getRange(row, 7).setBackground('#ffebee').setFontColor('#c62828');
    inventorySheet.getRange(row, 8).setBackground('#ffcdd2').setFontColor('#d32f2f');
    inventorySheet.getRange(row, 9).setBackground('#fff3e0').setFontColor('#ff6f00');
    inventorySheet.getRange(row, 10).setBackground('#ffe0b2').setFontColor('#ef6c00');
    inventorySheet.setRowHeight(row, 45);
    row += 2;

    // Year-to-Date Statistics Section
    inventorySheet.getRange(row, 1, 1, 6).merge()
      .setValue('📊 YEAR-TO-DATE STATISTICS (' + currentYear + ')')
      .setFontWeight('bold').setFontSize(12).setBackground('#37474f').setFontColor('white').setHorizontalAlignment('center');
    inventorySheet.setRowHeight(row, 28);
    row++;

    inventorySheet.getRange(row, 1, 1, 6).setValues([
      ['Metric', 'Gloves', 'Sleeves', 'Total', '', '']
    ]).setFontWeight('bold').setBackground('#607d8b').setFontColor('white').setHorizontalAlignment('center');
    row++;

    var totalNewGloves = glovesPurchased + glovesReclaimed;
    var totalNewSleeves = sleevesPurchased + sleevesReclaimed;

    var ytdDataRange = inventorySheet.getRange(row, 1, 5, 4);
    ytdDataRange.setValues([
      ['Total Assignments (YTD)', ytdGloveAssignments, ytdSleeveAssignments, ytdGloveAssignments + ytdSleeveAssignments],
      ['Items Lost (YTD)', ytdGlovesLost, ytdSleevesLost, ytdGlovesLost + ytdSleevesLost],
      ['Items Failed (YTD)', ytdGlovesFailed, ytdSleevesFailed, ytdGlovesFailed + ytdSleevesFailed],
      ['New Items Purchased', glovesPurchased, sleevesPurchased, glovesPurchased + sleevesPurchased],
      ['New Items Reclaimed', glovesReclaimed, sleevesReclaimed, glovesReclaimed + sleevesReclaimed]
    ]).setHorizontalAlignment('center');
    // Set number format to prevent percentages showing
    inventorySheet.getRange(row, 2, 5, 3).setNumberFormat('0');
    inventorySheet.getRange(row, 1, 5, 1).setFontWeight('bold');
    row += 6;

    // Gloves by Status
    row = writeStatusTableForInventory(inventorySheet, row, 'GLOVES BY STATUS (' + currentYear + ')', gloveStatusCounts, totalGloves);
    row++;

    // Sleeves by Status
    row = writeStatusTableForInventory(inventorySheet, row, 'SLEEVES BY STATUS (' + currentYear + ')', sleeveStatusCounts, totalSleeves);
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
        ['Class ' + cls, gCount, sCount, gCount + sCount, (gCount / Math.max(monthOfYear, 1)).toFixed(1), (sCount / Math.max(monthOfYear, 1)).toFixed(1)]
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

    // =========================================================================
    // NEW ITEMS LOG SECTION
    // =========================================================================
    var totalNew = totalNewGloves + totalNewSleeves;
    var totalPurchased = glovesPurchased + sleevesPurchased;
    var totalReclaimed = glovesReclaimed + sleevesReclaimed;

    inventorySheet.getRange(row, 1, 1, 7).merge()
      .setValue('📦 NEW ITEMS LOG - ' + currentYear + ' (Total: ' + totalNew + ' | Purchased: ' + totalPurchased + ' | Reclaimed: ' + totalReclaimed + ')')
      .setFontWeight('bold').setFontSize(14).setBackground('#6a1b9a').setFontColor('white').setHorizontalAlignment('center');
    inventorySheet.setRowHeight(row, 35);
    row++;

    var logHeaders = ['Date Added', 'Item #', 'Item Type', 'Class', 'Size', 'Source', 'Cost'];
    inventorySheet.getRange(row, 1, 1, 7).setValues([logHeaders])
      .setFontWeight('bold').setBackground('#9c27b0').setFontColor('white').setHorizontalAlignment('center');
    row++;

    // Only show current year's log entries
    var currentYearLogData = existingLogData.filter(function(item) {
      var itemDate = new Date(item.dateAdded);
      return !isNaN(itemDate.getTime()) && itemDate.getFullYear() === currentYear;
    });

    if (currentYearLogData.length > 0) {
      var logDataRows = currentYearLogData.map(function(item) {
        return [
          item.dateAdded, item.itemNum, item.itemType, item.itemClass,
          item.size, item.source, item.cost
        ];
      });
      inventorySheet.getRange(row, 1, logDataRows.length, 7).setValues(logDataRows).setHorizontalAlignment('center');

      for (var i = 0; i < logDataRows.length; i++) {
        var source = logDataRows[i][5];
        if (source === 'Reclaimed') {
          inventorySheet.getRange(row + i, 6).setBackground('#fff9c4');
        } else if (source === 'Purchased') {
          inventorySheet.getRange(row + i, 6).setBackground('#c8e6c9');
        }
      }
      row += logDataRows.length;
    }
    row += 2;

    // =========================================================================
    // ANNUAL HISTORY SECTION
    // =========================================================================
    inventorySheet.getRange(row, 1, 1, 11).merge()
      .setValue('📅 ANNUAL HISTORY')
      .setFontWeight('bold').setFontSize(14).setBackground('#1a237e').setFontColor('white').setHorizontalAlignment('center');
    inventorySheet.setRowHeight(row, 35);
    row++;

    var historyHeaders = ['Year', 'Peak Gloves', 'Peak Sleeves', 'Gloves Assigned', 'Sleeves Assigned',
                          'Gloves Lost', 'Sleeves Lost', 'Gloves Failed', 'Sleeves Failed',
                          'New Gloves', 'New Sleeves'];
    inventorySheet.getRange(row, 1, 1, 11).setValues([historyHeaders])
      .setFontWeight('bold').setBackground('#3949ab').setFontColor('white').setHorizontalAlignment('center');
    row++;

    // Add annual history rows (newest first)
    if (existingAnnualHistory.length > 0) {
      // Sort by year descending
      existingAnnualHistory.sort(function(a, b) { return b.year - a.year; });

      existingAnnualHistory.forEach(function(yearData) {
        inventorySheet.getRange(row, 1, 1, 11).setValues([[
          yearData.year,
          yearData.peakGloves || 0,
          yearData.peakSleeves || 0,
          yearData.glovesAssigned || 0,
          yearData.sleevesAssigned || 0,
          yearData.glovesLost || 0,
          yearData.sleevesLost || 0,
          yearData.glovesFailed || 0,
          yearData.sleevesFailed || 0,
          yearData.newGloves || 0,
          yearData.newSleeves || 0
        ]]).setHorizontalAlignment('center');

        // Alternate row colors
        if (existingAnnualHistory.indexOf(yearData) % 2 === 0) {
          inventorySheet.getRange(row, 1, 1, 11).setBackground('#e8eaf6');
        }
        row++;
      });
    } else {
      // No history yet - show placeholder
      inventorySheet.getRange(row, 1, 1, 11).merge()
        .setValue('No annual history yet. History will be recorded at the end of each year.')
        .setFontStyle('italic').setHorizontalAlignment('center').setFontColor('#666666');
      row++;
    }

    // Set column widths
    var columnWidths = {
      1: 160,  // Column A - wider for "Total Assignments (YTD)" text
      2: 105,  // Column B
      3: 140,  // Column C
      4: 145,  // Column D
      5: 115,  // Column E
      6: 120,  // Column F
      7: 125,  // Column G
      8: 130,  // Column H
      9: 130,  // Column I
      10: 135, // Column J
      11: 100  // Column K
    };

    for (var col in columnWidths) {
      inventorySheet.setColumnWidth(parseInt(col), columnWidths[col]);
    }

    inventorySheet.setFrozenRows(1);

    logEvent('Inventory Reports updated successfully.');
  } catch (e) {
    logEvent('Error in updateInventoryReports: ' + e, 'ERROR');
    throw e;
  }
}

// =============================================================================
// ANNUAL TRACKING HELPER FUNCTIONS
// =============================================================================

/**
 * Gets the stored tracking year from Script Properties.
 */
function getStoredYear() {
  var props = PropertiesService.getScriptProperties();
  var year = props.getProperty('inventoryTrackingYear');
  return year ? parseInt(year) : null;
}

/**
 * Sets the stored tracking year in Script Properties.
 */
function setStoredYear(year) {
  PropertiesService.getScriptProperties().setProperty('inventoryTrackingYear', String(year));
}

/**
 * Gets the peak glove count for the current year.
 */
function getPeakGloveCount() {
  var props = PropertiesService.getScriptProperties();
  var peak = props.getProperty('peakGloveCount');
  return peak ? parseInt(peak) : 0;
}

/**
 * Gets the peak sleeve count for the current year.
 */
function getPeakSleeveCount() {
  var props = PropertiesService.getScriptProperties();
  var peak = props.getProperty('peakSleeveCount');
  return peak ? parseInt(peak) : 0;
}

/**
 * Updates peak counts if current values are higher.
 */
function updatePeakCounts(currentGloves, currentSleeves) {
  var props = PropertiesService.getScriptProperties();
  var peakGloves = getPeakGloveCount();
  var peakSleeves = getPeakSleeveCount();

  if (currentGloves > peakGloves) {
    props.setProperty('peakGloveCount', String(currentGloves));
  }
  if (currentSleeves > peakSleeves) {
    props.setProperty('peakSleeveCount', String(currentSleeves));
  }
}


/**
 * Resets year-to-date stats for a new year.
 */
function resetYearToDateStats() {
  var props = PropertiesService.getScriptProperties();
  props.setProperty('peakGloveCount', '0');
  props.setProperty('peakSleeveCount', '0');
  props.setProperty('ytdGlovesLost', '0');
  props.setProperty('ytdGlovesFailed', '0');
  props.setProperty('ytdSleevesLost', '0');
  props.setProperty('ytdSleevesFailed', '0');
}

/**
 * Archives the previous year's stats into the annual history.
 */
function archivePreviousYearStats(previousYear, existingHistory, logData) {
  var props = PropertiesService.getScriptProperties();

  // Get final peak counts before reset
  var peakGloves = getPeakGloveCount();
  var peakSleeves = getPeakSleeveCount();

  // Calculate stats from log data for the previous year
  var glovesAssigned = 0, sleevesAssigned = 0;
  var glovesLost = 0, sleevesLost = 0;
  var glovesFailed = 0, sleevesFailed = 0;
  var newGloves = 0, newSleeves = 0;

  logData.forEach(function(item) {
    var itemDate = new Date(item.dateAdded);
    if (isNaN(itemDate.getTime()) || itemDate.getFullYear() !== previousYear) return;

    if (item.itemType === 'Glove') {
      newGloves++;
    } else if (item.itemType === 'Sleeve') {
      newSleeves++;
    }
  });

  // Create the archive record
  var yearRecord = {
    year: previousYear,
    peakGloves: peakGloves,
    peakSleeves: peakSleeves,
    glovesAssigned: glovesAssigned,
    sleevesAssigned: sleevesAssigned,
    glovesLost: glovesLost,
    sleevesLost: sleevesLost,
    glovesFailed: glovesFailed,
    sleevesFailed: sleevesFailed,
    newGloves: newGloves,
    newSleeves: newSleeves
  };

  // Add to history (will be sorted by year later)
  existingHistory.push(yearRecord);

  return existingHistory;
}

/**
 * Gets annual history data from the sheet.
 */
function getAnnualHistoryFromSheet(sheet) {
  if (!sheet || sheet.getLastRow() < 1) return [];

  var data = sheet.getDataRange().getValues();
  var history = [];
  var inHistorySection = false;
  var headerFound = false;

  for (var i = 0; i < data.length; i++) {
    var firstCell = String(data[i][0]).trim();

    if (firstCell.indexOf('ANNUAL HISTORY') !== -1) {
      inHistorySection = true;
      continue;
    }

    if (inHistorySection && firstCell === 'Year') {
      headerFound = true;
      continue;
    }

    if (inHistorySection && headerFound) {
      var year = parseInt(data[i][0]);
      if (!isNaN(year) && year > 2000) {
        history.push({
          year: year,
          peakGloves: parseInt(data[i][1]) || 0,
          peakSleeves: parseInt(data[i][2]) || 0,
          glovesAssigned: parseInt(data[i][3]) || 0,
          sleevesAssigned: parseInt(data[i][4]) || 0,
          glovesLost: parseInt(data[i][5]) || 0,
          sleevesLost: parseInt(data[i][6]) || 0,
          glovesFailed: parseInt(data[i][7]) || 0,
          sleevesFailed: parseInt(data[i][8]) || 0,
          newGloves: parseInt(data[i][9]) || 0,
          newSleeves: parseInt(data[i][10]) || 0
        });
      }
    }
  }

  return history;
}

/**
 * Initializes 2025 data with current stats (one-time setup).
 * Run this manually to seed historical data.
 */
function initialize2025AnnualData() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var glovesSheet = ss.getSheetByName('Gloves');
  var sleevesSheet = ss.getSheetByName('Sleeves');
  var inventorySheet = ss.getSheetByName('Inventory Reports');

  if (!glovesSheet || !sleevesSheet) {
    SpreadsheetApp.getUi().alert('Missing Gloves or Sleeves sheet');
    return;
  }

  var glovesData = glovesSheet.getLastRow() > 1 ? glovesSheet.getRange(2, 1, glovesSheet.getLastRow() - 1, COLS.INVENTORY.NOTES).getValues() : [];
  var sleevesData = sleevesSheet.getLastRow() > 1 ? sleevesSheet.getRange(2, 1, sleevesSheet.getLastRow() - 1, COLS.INVENTORY.NOTES).getValues() : [];

  var totalGloves = glovesData.length;
  var totalSleeves = sleevesData.length;

  // Count statuses
  var glovesLost = 0, glovesFailed = 0, glovesAssigned = 0;
  var sleevesLost = 0, sleevesFailed = 0, sleevesAssigned = 0;

  glovesData.forEach(function(row) {
    var status = normalizeStatusForReport(row[COLS.INVENTORY.STATUS - 1]);
    if (status === 'Lost') glovesLost++;
    if (status === 'Failed Rubber') glovesFailed++;
    if (status === 'Assigned') glovesAssigned++;
  });

  sleevesData.forEach(function(row) {
    var status = normalizeStatusForReport(row[COLS.INVENTORY.STATUS - 1]);
    if (status === 'Lost') sleevesLost++;
    if (status === 'Failed Rubber') sleevesFailed++;
    if (status === 'Assigned') sleevesAssigned++;
  });

  // Count new items from log for 2025
  var existingLogData = inventorySheet ? getNewItemsLogDataFromSheet(inventorySheet) : [];
  var newGloves = 0, newSleeves = 0;

  existingLogData.forEach(function(item) {
    var itemDate = new Date(item.dateAdded);
    if (!isNaN(itemDate.getTime()) && itemDate.getFullYear() === 2025) {
      if (item.itemType === 'Glove') newGloves++;
      else if (item.itemType === 'Sleeve') newSleeves++;
    }
  });

  // Create the 2025 record
  var record2025 = {
    year: 2025,
    peakGloves: totalGloves,
    peakSleeves: totalSleeves,
    glovesAssigned: glovesAssigned,
    sleevesAssigned: sleevesAssigned,
    glovesLost: glovesLost,
    sleevesLost: sleevesLost,
    glovesFailed: glovesFailed,
    sleevesFailed: sleevesFailed,
    newGloves: newGloves,
    newSleeves: newSleeves
  };

  // Save 2025 history to Script Properties (will be read by updateInventoryReports)
  saveAnnualHistoryToProperties([record2025]);

  // Set current year to 2026 and initialize peak counts
  setStoredYear(2026);
  var props = PropertiesService.getScriptProperties();
  props.setProperty('peakGloveCount', String(totalGloves));
  props.setProperty('peakSleeveCount', String(totalSleeves));

  // Reset YTD stats for 2026 (start fresh)
  props.setProperty('ytdGlovesLost', '0');
  props.setProperty('ytdGlovesFailed', '0');
  props.setProperty('ytdSleevesLost', '0');
  props.setProperty('ytdSleevesFailed', '0');

  // Now update the report - it will read the 2025 history from properties
  updateInventoryReports();

  SpreadsheetApp.getUi().alert('✅ 2025 Annual Data Initialized!\n\nThe 2025 year has been added to Annual History with current stats.\n2026 tracking has been started.\n\nNote: YTD Lost/Failed counters start at 0 for 2026.');
}

/**
 * Saves annual history to Script Properties for persistence.
 */
function saveAnnualHistoryToProperties(historyArray) {
  var props = PropertiesService.getScriptProperties();
  props.setProperty('annualHistoryData', JSON.stringify(historyArray));
}

/**
 * Gets annual history from Script Properties.
 */
function getAnnualHistoryFromProperties() {
  var props = PropertiesService.getScriptProperties();
  var data = props.getProperty('annualHistoryData');
  if (data) {
    try {
      return JSON.parse(data);
    } catch (e) {
      return [];
    }
  }
  return [];
}

/**
 * Merges annual history from sheet and properties.
 * Properties data takes precedence for years that exist in both.
 */
function mergeAnnualHistory(sheetHistory, propsHistory) {
  var merged = {};

  // Add sheet history first
  sheetHistory.forEach(function(record) {
    if (record.year) {
      merged[record.year] = record;
    }
  });

  // Properties history overwrites/adds
  propsHistory.forEach(function(record) {
    if (record.year) {
      merged[record.year] = record;
    }
  });

  // Convert back to array
  var result = [];
  for (var year in merged) {
    result.push(merged[year]);
  }

  return result;
}

/**
 * Gets the New Items Log data directly from a sheet (used during report generation).
 * Uses dynamic header matching to handle column position changes.
 * @param {Sheet} sheet - The Inventory Reports sheet
 * @return {Array} Array of logged item objects
 */
function getNewItemsLogDataFromSheet(sheet) {
  if (!sheet || sheet.getLastRow() < 1) return [];

  var data = sheet.getDataRange().getValues();
  var items = [];
  var inLogSection = false;
  var headerRow = null;
  var colMap = {};

  for (var i = 0; i < data.length; i++) {
    var firstCell = String(data[i][0]).trim();

    if (firstCell.indexOf('NEW ITEMS LOG') !== -1) {
      inLogSection = true;
      continue;
    }

    // Detect header row and build column map
    if (inLogSection && firstCell === 'Date Added') {
      headerRow = data[i];
      // Build column index map from headers
      for (var h = 0; h < headerRow.length; h++) {
        var header = String(headerRow[h]).trim().toLowerCase();
        if (header === 'date added') colMap.dateAdded = h;
        else if (header === 'item #') colMap.itemNum = h;
        else if (header === 'item type') colMap.itemType = h;
        else if (header === 'class') colMap.itemClass = h;
        else if (header === 'size') colMap.size = h;
        else if (header === 'source') colMap.source = h;
        else if (header === 'cost') colMap.cost = h;
      }
      continue;
    }

    // Read data rows using the column map
    if (inLogSection && headerRow && firstCell && firstCell !== '' &&
        firstCell !== 'ANNUAL HISTORY' && firstCell.indexOf('📅') === -1) {
      // Stop if we hit the next section
      if (firstCell.indexOf('ANNUAL') !== -1 || firstCell.indexOf('Year') === 0) {
        break;
      }

      items.push({
        dateAdded: colMap.dateAdded !== undefined ? data[i][colMap.dateAdded] : '',
        itemNum: colMap.itemNum !== undefined ? data[i][colMap.itemNum] : '',
        itemType: colMap.itemType !== undefined ? data[i][colMap.itemType] : '',
        itemClass: colMap.itemClass !== undefined ? data[i][colMap.itemClass] : '',
        size: colMap.size !== undefined ? data[i][colMap.size] : '',
        source: colMap.source !== undefined ? data[i][colMap.source] : '',
        cost: colMap.cost !== undefined ? data[i][colMap.cost] : ''
      });
    }
  }

  return items;
}

/**
 * Helper function to write a status table for inventory reports.
 *
 * @param {Sheet} sheet - The sheet to write to
 * @param {number} startRow - Starting row number
 * @param {string} title - Table title
 * @param {Object} statusCounts - Status count object
 * @param {number} total - Total items
 * @return {number} Next available row number
 */
function writeStatusTableForInventory(sheet, startRow, title, statusCounts, total) {
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
    sheet.getRange(row, 1).setBackground(getStatusColorForReport(status));
    sheet.getRange(row, 4).setFontColor('#1565c0').setHorizontalAlignment('left');
    sheet.getRange(row, 2, 1, 2).setHorizontalAlignment('center');
    row++;
  });

  sheet.getRange(row, 1).setValue('TOTAL').setFontWeight('bold');
  sheet.getRange(row, 2).setValue(total).setFontWeight('bold').setHorizontalAlignment('center');
  row++;

  return row;
}

/**
 * Normalizes status strings for consistent counting in reports.
 *
 * @param {string} status - Status string to normalize
 * @return {string} Normalized status
 */
function normalizeStatusForReport(status) {
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
 * Returns background color for status categories in reports.
 *
 * @param {string} status - Status name
 * @return {string} Hex color code
 */
function getStatusColorForReport(status) {
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

// =============================================================================
// NEW ITEMS LOG FUNCTIONS
// =============================================================================

// Property key for tracking known item numbers
var NEW_ITEMS_PROPERTY_KEY = 'knownItemNumbers';

/**
 * Checks if an item number is new (not previously tracked).
 * @param {string} itemNum - Item number to check
 * @param {string} sheetName - 'Gloves', 'Sleeves', or 'Blankets'
 * @return {boolean} True if this is a new item number
 */
function isNewItemNumber(itemNum, sheetName) {
  if (!itemNum || String(itemNum).trim() === '') return false;

  var props = PropertiesService.getScriptProperties();
  var key = NEW_ITEMS_PROPERTY_KEY + '_' + sheetName;
  var knownItems = props.getProperty(key);

  // If no tracking exists for this sheet yet, initialize it EXCLUDING the current item
  // (since the item is already in the sheet by the time this check runs)
  // and return true (this IS a new item)
  if (!knownItems) {
    initializeKnownItemNumbers(sheetName, itemNum);  // Exclude current item
    return true;  // This is a new item since we never tracked this sheet before
  }

  var knownSet = knownItems ? knownItems.split(',') : [];
  return knownSet.indexOf(String(itemNum).trim()) === -1;
}

/**
 * Adds an item number to the known items list.
 * @param {string} itemNum - Item number to add
 * @param {string} sheetName - 'Gloves', 'Sleeves', or 'Blankets'
 */
function addToKnownItemNumbers(itemNum, sheetName) {
  if (!itemNum || String(itemNum).trim() === '') return;

  var props = PropertiesService.getScriptProperties();
  var key = NEW_ITEMS_PROPERTY_KEY + '_' + sheetName;
  var knownItems = props.getProperty(key) || '';

  var knownSet = knownItems ? knownItems.split(',') : [];
  var itemStr = String(itemNum).trim();

  if (knownSet.indexOf(itemStr) === -1) {
    knownSet.push(itemStr);
    props.setProperty(key, knownSet.join(','));
  }
}

/**
 * Initializes the known item numbers from the current sheet data.
 * @param {string} sheetName - 'Gloves', 'Sleeves', or 'Blankets'
 * @param {string} excludeItem - Optional item number to exclude (for new items being added)
 */
function initializeKnownItemNumbers(sheetName, excludeItem) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(sheetName);

  if (!sheet || sheet.getLastRow() < 2) {
    PropertiesService.getScriptProperties().setProperty(NEW_ITEMS_PROPERTY_KEY + '_' + sheetName, '');
    return;
  }

  var data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues();
  var itemNums = [];
  var excludeItemStr = excludeItem ? String(excludeItem).trim() : '';

  data.forEach(function(row) {
    var itemNum = String(row[0]).trim();
    // Skip the excluded item (the one being added that triggered this initialization)
    if (itemNum && itemNums.indexOf(itemNum) === -1 && itemNum !== excludeItemStr) {
      itemNums.push(itemNum);
    }
  });

  PropertiesService.getScriptProperties().setProperty(NEW_ITEMS_PROPERTY_KEY + '_' + sheetName, itemNums.join(','));
  logEvent('Initialized known item numbers for ' + sheetName + ': ' + itemNums.length + ' items' + (excludeItemStr ? ' (excluding ' + excludeItemStr + ')' : ''));
}

/**
 * Resets the known item numbers tracking for all inventory sheets.
 */
function resetKnownItemNumbers() {
  var props = PropertiesService.getScriptProperties();
  props.deleteProperty(NEW_ITEMS_PROPERTY_KEY + '_Gloves');
  props.deleteProperty(NEW_ITEMS_PROPERTY_KEY + '_Sleeves');
  props.deleteProperty(NEW_ITEMS_PROPERTY_KEY + '_Blankets');
  props.deleteProperty(NEW_ITEMS_PROPERTY_KEY + '_HV Testers');
  props.deleteProperty(NEW_ITEMS_PROPERTY_KEY + '_Phasing Sets');

  initializeKnownItemNumbers('Gloves');
  initializeKnownItemNumbers('Sleeves');
  initializeKnownItemNumbers('Blankets');
  initializeKnownItemNumbers('HV Testers');
  initializeKnownItemNumbers('Phasing Sets');

  SpreadsheetApp.getUi().alert('✅ Known item numbers have been reset and re-initialized from current inventory.');
}

/**
 * Resets the known item numbers tracking for Blankets only.
 * Run this if the New Blanket dialog isn't showing.
 */
function resetBlanketTracking() {
  var props = PropertiesService.getScriptProperties();
  props.deleteProperty(NEW_ITEMS_PROPERTY_KEY + '_Blankets');

  // Don't initialize - let it be empty so the next blanket is detected as "new"
  SpreadsheetApp.getUi().alert('✅ Blanket tracking has been reset.\n\nThe next blanket number you enter will trigger the New Blanket Entry dialog.');
}

/**
 * Prompts user when a new item number is detected in Gloves, Sleeves, or Blankets sheet.
 * Shows an HTML dialog with individual fields for all item details.
 * @param {string} itemNum - The new item number
 * @param {string} sheetName - 'Gloves', 'Sleeves', or 'Blankets'
 * @param {number} rowNum - The row number where the item was added
 */
function promptNewItemSource(itemNum, sheetName, rowNum) {
  var itemType;
  var dialogTitle;

  if (sheetName === 'Gloves') {
    itemType = 'Glove';
    dialogTitle = '📦 New Glove Entry';
  } else if (sheetName === 'Sleeves') {
    itemType = 'Sleeve';
    dialogTitle = '📦 New Sleeve Entry';
  } else if (sheetName === 'Blankets') {
    itemType = 'Blanket';
    dialogTitle = '🧱 New Blanket Entry';
  } else if (sheetName === 'HV Testers') {
    itemType = 'HV Tester';
    dialogTitle = '⚡ New HV Tester Entry';
  } else if (sheetName === 'Phasing Sets') {
    itemType = 'Phasing Set';
    dialogTitle = '⚡ New Phasing Set Entry';
  } else {
    itemType = 'Item';
    dialogTitle = '📦 New Item Entry';
  }

  var template = HtmlService.createTemplateFromFile('NewItemDialog');
  template.itemNum = itemNum;
  template.sheetName = sheetName;
  template.rowNum = rowNum;
  template.itemType = itemType;

  var html = template.evaluate()
    .setWidth(500)
    .setHeight(750);

  SpreadsheetApp.getUi().showModalDialog(html, dialogTitle);
}

/**
 * Processes the form submission from the New Item dialog.
 * Fills in the row data and logs the new item if applicable.
 * @param {Object} formData - Form data from the dialog
 * @param {string} itemNum - The item number
 * @param {string} sheetName - 'Gloves' or 'Sleeves'
 * @param {number} rowNum - The row number
 */
function processNewItemDialogSubmit(formData, itemNum, sheetName, rowNum) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(sheetName);
  var isBlanket = (sheetName === 'Blankets');
  var isHVTester = (sheetName === 'HV Testers');
  var isPhasingSet = (sheetName === 'Phasing Sets');
  var isAED = (sheetName === 'AED');
  var isEquipment = isHVTester || isPhasingSet || isAED;
  var itemType = sheetName === 'Gloves' ? 'Glove' : (sheetName === 'Sleeves' ? 'Sleeve' : (isBlanket ? 'Blanket' : (isHVTester ? 'HV Tester' : (isPhasingSet ? 'Phasing Set' : (isAED ? 'AED' : 'Item')))));

  // ===========================================================================
  // DUPLICATE ITEM NUMBER VALIDATION
  // ===========================================================================
  // Check if this item number already exists (excluding the current row being edited)
  var duplicateCheck = checkDuplicateItemNumber(sheetName, itemNum);
  if (duplicateCheck.isDuplicate) {
    // Clear the item number from the cell
    sheet.getRange(rowNum, 1).clearContent();
    throw new Error(duplicateCheck.message);
  }

  // ===========================================================================
  // HV TESTERS: A=Item#(1), B=Model(2), C=KV(3), D=Serial#(4),
  // HV TESTERS: A=Item#(1), B=Model(2), C=KV(3), D=Serial#(4),
  //             E=Calibration Date(5), F=Date Assigned(6), G=Location(7),
  //             H=Status(8), I=Assigned To(9), J=Change Out Date(10),
  //             K=Picked For(11), L=Notes(12)
  // ===========================================================================
  if (isHVTester) {
    if (formData.model) {
      sheet.getRange(rowNum, COLS.HV_TESTERS.MODEL).setValue(formData.model);
    }
    if (formData.kv) {
      sheet.getRange(rowNum, COLS.HV_TESTERS.KV).setValue(formData.kv);
    }
    if (formData.serialNum) {
      sheet.getRange(rowNum, COLS.HV_TESTERS.SERIAL_NUM).setValue(formData.serialNum);
    }
    if (formData.calibrationDate) {
      var calCell = sheet.getRange(rowNum, COLS.HV_TESTERS.CALIBRATION_DATE);
      var parsedDate = parseDateNoon(formData.calibrationDate);
      if (parsedDate) {
        calCell.setValue(parsedDate);
        try { calCell.setNumberFormat('MM/dd/yyyy'); } catch (fmtErr) {}
        // Calculate Replacement Date = Calibration Date + 10 years
        var replacementDate = new Date(parsedDate);
        replacementDate.setFullYear(replacementDate.getFullYear() + (typeof INTERVAL_CALIBRATION_YEARS !== 'undefined' ? INTERVAL_CALIBRATION_YEARS : 10));
        var replCell = sheet.getRange(rowNum, COLS.HV_TESTERS.CHANGE_OUT_DATE);
        replCell.setValue(replacementDate);
        try { replCell.setNumberFormat('MM/dd/yyyy'); } catch (fmtErr) {}
      }
    }
    if (formData.location) {
      sheet.getRange(rowNum, COLS.HV_TESTERS.LOCATION).setValue(formData.location);
    }
    if (formData.status) {
      sheet.getRange(rowNum, COLS.HV_TESTERS.STATUS).setValue(formData.status);
    }
    if (formData.assignedTo && formData.assignedTo.trim() !== '') {
      var assignedTo = formData.assignedTo.trim();
      sheet.getRange(rowNum, COLS.HV_TESTERS.ASSIGNED_TO).setValue(assignedTo);
      // If assigned to employee, set Date Assigned & look up location
      if (assignedTo.toLowerCase() !== 'on shelf') {
        var today = new Date();
        var dateCell = sheet.getRange(rowNum, COLS.HV_TESTERS.DATE_ASSIGNED);
        dateCell.setValue(today);
        try { dateCell.setNumberFormat('MM/dd/yyyy'); } catch (fmtErr) {}
        sheet.getRange(rowNum, COLS.HV_TESTERS.STATUS).setValue('In Service');
        // Look up employee location
        var empLoc = lookupEmployeeLocation(ss, assignedTo);
        if (empLoc) {
          sheet.getRange(rowNum, COLS.HV_TESTERS.LOCATION).setValue(empLoc);
        }
      }
    } else {
      sheet.getRange(rowNum, COLS.HV_TESTERS.ASSIGNED_TO).setValue('On Shelf');
      sheet.getRange(rowNum, COLS.HV_TESTERS.STATUS).setValue('On Shelf');
    }
    // Add to known items
    addToKnownItemNumbers(itemNum, sheetName);
    // Handle item source logging
    processItemSourceLogging(formData, itemNum, itemType, sheetName, ss);
    return;
  }

  // ===========================================================================
  // PHASING SETS: A=Item#(1), B=Model(2), C=KV(3), D=Serial#(4),
  //               E=Calibration Date(5), F=Date Assigned(6), G=Location(7),
  //               H=Status(8), I=Assigned To(9), J=Replacement Date(10),
  //               K=Picked For(11), L=Notes(12)
  // ===========================================================================
  if (isPhasingSet) {
    if (formData.model) {
      sheet.getRange(rowNum, COLS.PHASING_SETS.MODEL).setValue(formData.model);
    }
    if (formData.kv) {
      sheet.getRange(rowNum, COLS.PHASING_SETS.KV).setValue(formData.kv);
    }
    if (formData.serialNum) {
      sheet.getRange(rowNum, COLS.PHASING_SETS.SERIAL_NUM).setValue(formData.serialNum);
    }
    if (formData.calibrationDate) {
      var calCell = sheet.getRange(rowNum, COLS.PHASING_SETS.CALIBRATION_DATE);
      var parsedDate = parseDateNoon(formData.calibrationDate);
      if (parsedDate) {
        calCell.setValue(parsedDate);
        try { calCell.setNumberFormat('MM/dd/yyyy'); } catch (fmtErr) {}
        // Calculate Replacement Date = Calibration Date + 10 years
        var replacementDate = new Date(parsedDate);
        replacementDate.setFullYear(replacementDate.getFullYear() + (typeof INTERVAL_CALIBRATION_YEARS !== 'undefined' ? INTERVAL_CALIBRATION_YEARS : 10));
        var replCell = sheet.getRange(rowNum, COLS.PHASING_SETS.CHANGE_OUT_DATE);
        replCell.setValue(replacementDate);
        try { replCell.setNumberFormat('MM/dd/yyyy'); } catch (fmtErr) {}
      }
    }
    if (formData.location) {
      sheet.getRange(rowNum, COLS.PHASING_SETS.LOCATION).setValue(formData.location);
    }
    if (formData.status) {
      sheet.getRange(rowNum, COLS.PHASING_SETS.STATUS).setValue(formData.status);
    }
    if (formData.assignedTo && formData.assignedTo.trim() !== '') {
      var assignedTo = formData.assignedTo.trim();
      sheet.getRange(rowNum, COLS.PHASING_SETS.ASSIGNED_TO).setValue(assignedTo);
      // If assigned to employee, set Date Assigned & look up location
      if (assignedTo.toLowerCase() !== 'on shelf') {
        var today = new Date();
        var dateCell = sheet.getRange(rowNum, COLS.PHASING_SETS.DATE_ASSIGNED);
        dateCell.setValue(today);
        try { dateCell.setNumberFormat('MM/dd/yyyy'); } catch (fmtErr) {}
        sheet.getRange(rowNum, COLS.PHASING_SETS.STATUS).setValue('In Service');
        // Look up employee location
        var empLoc = lookupEmployeeLocation(ss, assignedTo);
        if (empLoc) {
          sheet.getRange(rowNum, COLS.PHASING_SETS.LOCATION).setValue(empLoc);
        }
      }
    } else {
      sheet.getRange(rowNum, COLS.PHASING_SETS.ASSIGNED_TO).setValue('On Shelf');
      sheet.getRange(rowNum, COLS.PHASING_SETS.STATUS).setValue('On Shelf');
    }
    // Add to known items
    addToKnownItemNumbers(itemNum, sheetName);
    // Handle item source logging
    processItemSourceLogging(formData, itemNum, itemType, sheetName, ss);
    return;
  }

  // ===========================================================================
  // AED: A=Item#(1), B=Model(2), C=(unused)(3), D=Pad Expiration(4),
  //      E=Date Assigned(5), F=Location(6), G=Status(7), H=Assigned To(8),
  //      I=(unused)(9), J=Picked For(10), K=Notes(11)
  // ===========================================================================
  if (isAED) {
    if (formData.model) {
      sheet.getRange(rowNum, COLS.AED.MODEL).setValue(formData.model);
    }
    if (formData.padExpiration) {
      var padCell = sheet.getRange(rowNum, COLS.AED.PAD_EXPIRATION);
      var parsedDate = parseDateNoon(formData.padExpiration);
      if (parsedDate) {
        padCell.setValue(parsedDate);
        try { padCell.setNumberFormat('MM/dd/yyyy'); } catch (fmtErr) {}
      }
    }
    if (formData.location) {
      sheet.getRange(rowNum, COLS.AED.LOCATION).setValue(formData.location);
    }
    if (formData.status) {
      sheet.getRange(rowNum, COLS.AED.STATUS).setValue(formData.status);
    }
    if (formData.assignedTo && formData.assignedTo.trim() !== '') {
      var assignedTo = formData.assignedTo.trim();
      sheet.getRange(rowNum, COLS.AED.ASSIGNED_TO).setValue(assignedTo);
      // If assigned to employee, set Date Assigned & look up location
      if (assignedTo.toLowerCase() !== 'on shelf') {
        var today = new Date();
        var dateCell = sheet.getRange(rowNum, COLS.AED.DATE_ASSIGNED);
        dateCell.setValue(today);
        try { dateCell.setNumberFormat('MM/dd/yyyy'); } catch (fmtErr) {}
        sheet.getRange(rowNum, COLS.AED.STATUS).setValue('In Service');
        // Look up employee location
        var empLoc = lookupEmployeeLocation(ss, assignedTo);
        if (empLoc) {
          sheet.getRange(rowNum, COLS.AED.LOCATION).setValue(empLoc);
        }
      }
    } else {
      sheet.getRange(rowNum, COLS.AED.ASSIGNED_TO).setValue('On Shelf');
      sheet.getRange(rowNum, COLS.AED.STATUS).setValue('On Shelf');
    }
    // Add to known items
    addToKnownItemNumbers(itemNum, sheetName);
    // Handle item source logging
    processItemSourceLogging(formData, itemNum, itemType, sheetName, ss);
    return;
  }

  // ===========================================================================
  // GLOVES / SLEEVES / BLANKETS (original logic)
  // Use appropriate COLS namespace: INVENTORY for Gloves/Sleeves, BLANKETS for Blankets
  // ===========================================================================
  var COL = isBlanket ? COLS.BLANKETS : COLS.INVENTORY;

  // Fill in the basic data
  if (formData.size) {
    sheet.getRange(rowNum, isBlanket ? COL.TYPE : COL.SIZE).setValue(formData.size);
  }

  if (formData.itemClass) {
    sheet.getRange(rowNum, COL.CLASS).setValue(formData.itemClass);
  }

  if (formData.testDate) {
    var testDateCell = sheet.getRange(rowNum, COL.TEST_DATE);
    var parsedTestDate = parseDateNoon(formData.testDate);
    if (parsedTestDate) {
      testDateCell.setValue(parsedTestDate);
      try {
        testDateCell.setNumberFormat('MM/dd/yyyy');
      } catch (fmtErr) { /* Ignore format errors on typed columns */ }
    }
  }

  // Handle ESL ID for Gloves/Sleeves
  if (!isBlanket && formData.eslId) {
    sheet.getRange(rowNum, COL.ESL_ID).setValue(formData.eslId);
  }

  // Handle Assigned To - this triggers location/status updates and Change Out Date calculation
  if (formData.assignedTo && formData.assignedTo.trim() !== '') {
    var assignedTo = formData.assignedTo.trim();
    var assignedToLower = assignedTo.toLowerCase();

    // Check if "Assigned To" is a status value rather than an employee name
    // Different status values for Blankets vs Gloves/Sleeves
    var statusValuesGloves = ['on shelf', 'in testing', 'ready for delivery', 'ready for test', 'lost', 'failed rubber', 'failed'];
    var statusValuesBlankets = ['on shelf', 'in service', 'in testing', 'lost', 'failed'];
    var statusValues = isBlanket ? statusValuesBlankets : statusValuesGloves;
    var isStatusValue = statusValues.indexOf(assignedToLower) !== -1;

    if (isStatusValue) {
      // This is a status value, not an employee assignment
      sheet.getRange(rowNum, COL.ASSIGNED_TO).setValue(assignedTo);

      // Set Status based on the form's status field (which should match)
      var statusToSet = formData.status || assignedTo;
      sheet.getRange(rowNum, COL.STATUS).setValue(statusToSet);

      // Set Location from form or default to Helena for On Shelf items
      if (formData.location && formData.location.trim() !== '') {
        sheet.getRange(rowNum, COL.LOCATION).setValue(formData.location.trim());
      } else if (assignedToLower === 'on shelf') {
        sheet.getRange(rowNum, COL.LOCATION).setValue('Helena');
      }

      // Set Date Assigned to today for tracking purposes
      var today = new Date();
      var dateAssignedCell = sheet.getRange(rowNum, COL.DATE_ASSIGNED);
      dateAssignedCell.setValue(today);
      try {
        dateAssignedCell.setNumberFormat('MM/dd/yyyy');
      } catch (fmtErr) { /* Ignore format errors on typed columns */ }

      // Calculate Change Out Date based on test date (only for non-failed/lost items)
      if (formData.testDate && assignedToLower !== 'lost' && assignedToLower !== 'failed' && assignedToLower !== 'failed rubber') {
        var isSleeve = (sheetName === 'Sleeves');
        var location = sheet.getRange(rowNum, COL.LOCATION).getValue();
        var changeOutDate = calculateChangeOutDate(today, location, assignedTo, isSleeve);
        if (changeOutDate) {
          var changeOutCell = sheet.getRange(rowNum, COL.CHANGE_OUT_DATE);
          try {
            if (changeOutDate === 'N/A') {
              changeOutCell.setNumberFormat('@');
            } else {
              changeOutCell.setNumberFormat('MM/dd/yyyy');
            }
          } catch (fmtErr) { /* Ignore format errors on typed columns */ }
          changeOutCell.setValue(changeOutDate);
        }
      }

    } else {
      // This is an actual employee assignment
      sheet.getRange(rowNum, COL.ASSIGNED_TO).setValue(assignedTo);

      // Set Date Assigned to today
      var today = new Date();
      var dateAssignedCell = sheet.getRange(rowNum, COL.DATE_ASSIGNED);
      dateAssignedCell.setValue(today);
      try {
        dateAssignedCell.setNumberFormat('MM/dd/yyyy');
      } catch (fmtErr) { /* Ignore format errors on typed columns */ }

      // Set Status - "In Service" for Blankets, "Assigned" for Gloves/Sleeves
      var assignedStatus = isBlanket ? 'In Service' : 'Assigned';
      sheet.getRange(rowNum, COL.STATUS).setValue(assignedStatus);

      // Look up employee's location from Employees sheet
      var employeesSheet = ss.getSheetByName('Employees');
      if (employeesSheet && employeesSheet.getLastRow() > 1) {
        var empData = employeesSheet.getDataRange().getValues();
        var empHeaders = empData[0];
        var nameCol = -1;
        var locCol = -1;

        for (var h = 0; h < empHeaders.length; h++) {
          var hdr = String(empHeaders[h]).toLowerCase().trim();
          if (hdr === 'name') nameCol = h;
          if (hdr === 'location') locCol = h;
        }

        if (nameCol !== -1 && locCol !== -1) {
          for (var i = 1; i < empData.length; i++) {
            var empName = String(empData[i][nameCol]).trim().toLowerCase();
            if (empName === assignedTo.toLowerCase()) {
              var empLocation = String(empData[i][locCol]).trim();
              if (empLocation) {
                sheet.getRange(rowNum, COL.LOCATION).setValue(empLocation);
              }
              break;
            }
          }
        }
      }

      // Calculate and set Change Out Date (for Gloves/Sleeves, not Blankets)
      if (!isBlanket) {
        var isSleeve = (sheetName === 'Sleeves');
        var location = sheet.getRange(rowNum, COL.LOCATION).getValue();
        var changeOutDate = calculateChangeOutDate(today, location, assignedTo, isSleeve);

        if (changeOutDate) {
          var changeOutCell = sheet.getRange(rowNum, COL.CHANGE_OUT_DATE);
          try {
            if (changeOutDate === 'N/A') {
              changeOutCell.setNumberFormat('@');
            } else {
              changeOutCell.setNumberFormat('MM/dd/yyyy');
            }
          } catch (fmtErr) { /* Ignore format errors on typed columns */ }
          changeOutCell.setValue(changeOutDate);
        }
      }
    }

  } else {
    // Not assigned - just set location and status from form
    if (formData.location) {
      sheet.getRange(rowNum, COL.LOCATION).setValue(formData.location);
    }
    if (formData.status) {
      sheet.getRange(rowNum, COL.STATUS).setValue(formData.status);
    }
  }
}

// =============================================================================
// DUPLICATE ITEM NUMBER PROTECTION
// =============================================================================

/**
 * Checks if an item number already exists in a sheet (excluding the current row).
 * @param {string} itemNum - Item number to check
 * @param {string} sheetName - 'Gloves', 'Sleeves', or 'Blankets'
 * @param {number} excludeRow - Row to exclude from check (the current row being edited)
 * @return {Object} {isDuplicate: boolean, existingRow: number or null}
 */
function checkDuplicateItemNumber(itemNum, sheetName, excludeRow) {
  if (!itemNum || String(itemNum).trim() === '') {
    return { isDuplicate: false, existingRow: null };
  }

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(sheetName);

  if (!sheet || sheet.getLastRow() < 2) {
    return { isDuplicate: false, existingRow: null };
  }

  var itemNumStr = String(itemNum).trim().toUpperCase();
  var data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues();

  for (var i = 0; i < data.length; i++) {
    var rowNum = i + 2;
    if (rowNum === excludeRow) continue;

    var existingItemNum = String(data[i][0] || '').trim().toUpperCase();
    if (existingItemNum === itemNumStr) {
      return { isDuplicate: true, existingRow: rowNum };
    }
  }

  return { isDuplicate: false, existingRow: null };
}

/**
 * Handles duplicate item number detection and warns the user.
 * Called from the onEdit trigger when an item number is entered.
 * @param {string} itemNum - Item number entered
 * @param {string} sheetName - 'Gloves', 'Sleeves', or 'Blankets'
 * @param {number} currentRow - Current row being edited
 * @return {boolean} True if duplicate was found and handled
 */
function handleDuplicateItemNumber(itemNum, sheetName, currentRow) {
  var result = checkDuplicateItemNumber(itemNum, sheetName, currentRow);

  if (result.isDuplicate) {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(sheetName);

    sheet.getRange(currentRow, 1).setValue('');

    var ui = SpreadsheetApp.getUi();
    ui.alert(
      '⚠️ Duplicate Item Number',
      'Item number "' + itemNum + '" already exists in row ' + result.existingRow + ' of the ' + sheetName + ' sheet.\n\n' +
      'Please use a unique item number.',
      ui.ButtonSet.OK
    );

    return true;
  }

  return false;
}
