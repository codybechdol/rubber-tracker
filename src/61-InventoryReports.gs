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

    var glovesData = glovesSheet.getLastRow() > 1 ? glovesSheet.getRange(2, 1, glovesSheet.getLastRow() - 1, 11).getValues() : [];
    var sleevesData = sleevesSheet.getLastRow() > 1 ? sleevesSheet.getRange(2, 1, sleevesSheet.getLastRow() - 1, 11).getValues() : [];

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
      var status = normalizeStatusForReport(row[6]);
      var itemClass = String(row[2]).trim();
      var location = (row[5] || '').toString().trim();
      var dateAssigned = row[4];
      var assignedTo = String(row[7] || '').trim();
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
      var status = normalizeStatusForReport(row[6]);
      var itemClass = String(row[2]).trim();
      var location = (row[5] || '').toString().trim();
      var dateAssigned = row[4];
      var assignedTo = String(row[7] || '').trim();
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

    // Current status counts (for display in status tables)
    var currentGlovesLost = gloveStatusCounts['Lost'] || 0;
    var currentGlovesFailed = gloveStatusCounts['Failed Rubber'] || 0;
    var currentSleevesLost = sleeveStatusCounts['Lost'] || 0;
    var currentSleevesFailed = sleeveStatusCounts['Failed Rubber'] || 0;


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

    inventorySheet.getRange(row, 1, 1, 9).merge()
      .setValue('📦 NEW ITEMS LOG - ' + currentYear + ' (Total: ' + totalNew + ' | Purchased: ' + totalPurchased + ' | Reclaimed: ' + totalReclaimed + ')')
      .setFontWeight('bold').setFontSize(14).setBackground('#6a1b9a').setFontColor('white').setHorizontalAlignment('center');
    inventorySheet.setRowHeight(row, 35);
    row++;

    var logHeaders = ['Date Added', 'Item #', 'Item Type', 'Class', 'Size', 'Source', 'Original Item #s', 'Cost', 'Notes'];
    inventorySheet.getRange(row, 1, 1, 9).setValues([logHeaders])
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
          item.size, item.source, item.originalItems, item.cost, item.notes
        ];
      });
      inventorySheet.getRange(row, 1, logDataRows.length, 9).setValues(logDataRows).setHorizontalAlignment('center');

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
 * Gets YTD stats from Script Properties.
 */
function getYTDStats() {
  var props = PropertiesService.getScriptProperties();
  return {
    glovesLost: parseInt(props.getProperty('ytdGlovesLost')) || 0,
    glovesFailed: parseInt(props.getProperty('ytdGlovesFailed')) || 0,
    sleevesLost: parseInt(props.getProperty('ytdSleevesLost')) || 0,
    sleevesFailed: parseInt(props.getProperty('ytdSleevesFailed')) || 0
  };
}

/**
 * Increments YTD Lost count for gloves or sleeves.
 * Called when an item status changes to "Lost".
 */
function incrementYTDLost(itemType) {
  var props = PropertiesService.getScriptProperties();
  var key = itemType === 'Glove' ? 'ytdGlovesLost' : 'ytdSleevesLost';
  var current = parseInt(props.getProperty(key)) || 0;
  props.setProperty(key, String(current + 1));
}

/**
 * Increments YTD Failed count for gloves or sleeves.
 * Called when an item status changes to "Failed Rubber".
 */
function incrementYTDFailed(itemType) {
  var props = PropertiesService.getScriptProperties();
  var key = itemType === 'Glove' ? 'ytdGlovesFailed' : 'ytdSleevesFailed';
  var current = parseInt(props.getProperty(key)) || 0;
  props.setProperty(key, String(current + 1));
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

  var glovesData = glovesSheet.getLastRow() > 1 ? glovesSheet.getRange(2, 1, glovesSheet.getLastRow() - 1, 11).getValues() : [];
  var sleevesData = sleevesSheet.getLastRow() > 1 ? sleevesSheet.getRange(2, 1, sleevesSheet.getLastRow() - 1, 11).getValues() : [];

  var totalGloves = glovesData.length;
  var totalSleeves = sleevesData.length;

  // Count statuses
  var glovesLost = 0, glovesFailed = 0, glovesAssigned = 0;
  var sleevesLost = 0, sleevesFailed = 0, sleevesAssigned = 0;

  glovesData.forEach(function(row) {
    var status = normalizeStatusForReport(row[6]);
    if (status === 'Lost') glovesLost++;
    if (status === 'Failed Rubber') glovesFailed++;
    if (status === 'Assigned') glovesAssigned++;
  });

  sleevesData.forEach(function(row) {
    var status = normalizeStatusForReport(row[6]);
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
 * @param {Sheet} sheet - The Inventory Reports sheet
 * @return {Array} Array of logged item objects
 */
function getNewItemsLogDataFromSheet(sheet) {
  if (!sheet || sheet.getLastRow() < 1) return [];

  var data = sheet.getDataRange().getValues();
  var items = [];
  var inLogSection = false;
  var headerFound = false;

  for (var i = 0; i < data.length; i++) {
    var firstCell = String(data[i][0]).trim();

    if (firstCell.indexOf('NEW ITEMS LOG') !== -1) {
      inLogSection = true;
      continue;
    }

    if (inLogSection && firstCell === 'Date Added') {
      headerFound = true;
      continue;
    }

    if (inLogSection && headerFound && firstCell && firstCell !== '') {
      items.push({
        dateAdded: data[i][0],
        itemNum: data[i][1],
        itemType: data[i][2],
        itemClass: data[i][3],
        size: data[i][4],
        source: data[i][5],
        originalItems: data[i][6],
        cost: data[i][7],
        notes: data[i][8]
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
 * @param {string} sheetName - 'Gloves' or 'Sleeves'
 * @return {boolean} True if this is a new item number
 */
function isNewItemNumber(itemNum, sheetName) {
  if (!itemNum || String(itemNum).trim() === '') return false;

  var props = PropertiesService.getScriptProperties();
  var key = NEW_ITEMS_PROPERTY_KEY + '_' + sheetName;
  var knownItems = props.getProperty(key);

  if (!knownItems) {
    initializeKnownItemNumbers(sheetName);
    knownItems = props.getProperty(key);
  }

  var knownSet = knownItems ? knownItems.split(',') : [];
  return knownSet.indexOf(String(itemNum).trim()) === -1;
}

/**
 * Adds an item number to the known items list.
 * @param {string} itemNum - Item number to add
 * @param {string} sheetName - 'Gloves' or 'Sleeves'
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
 * @param {string} sheetName - 'Gloves' or 'Sleeves'
 */
function initializeKnownItemNumbers(sheetName) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(sheetName);

  if (!sheet || sheet.getLastRow() < 2) {
    PropertiesService.getScriptProperties().setProperty(NEW_ITEMS_PROPERTY_KEY + '_' + sheetName, '');
    return;
  }

  var data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues();
  var itemNums = [];

  data.forEach(function(row) {
    var itemNum = String(row[0]).trim();
    if (itemNum && itemNums.indexOf(itemNum) === -1) {
      itemNums.push(itemNum);
    }
  });

  PropertiesService.getScriptProperties().setProperty(NEW_ITEMS_PROPERTY_KEY + '_' + sheetName, itemNums.join(','));
  logEvent('Initialized known item numbers for ' + sheetName + ': ' + itemNums.length + ' items');
}

/**
 * Resets the known item numbers tracking.
 */
function resetKnownItemNumbers() {
  var props = PropertiesService.getScriptProperties();
  props.deleteProperty(NEW_ITEMS_PROPERTY_KEY + '_Gloves');
  props.deleteProperty(NEW_ITEMS_PROPERTY_KEY + '_Sleeves');

  initializeKnownItemNumbers('Gloves');
  initializeKnownItemNumbers('Sleeves');

  SpreadsheetApp.getUi().alert('✅ Known item numbers have been reset and re-initialized from current inventory.');
}

/**
 * Prompts user when a new item number is detected in Gloves or Sleeves sheet.
 * Shows an HTML dialog with individual fields for all item details.
 * @param {string} itemNum - The new item number
 * @param {string} sheetName - 'Gloves' or 'Sleeves'
 * @param {number} rowNum - The row number where the item was added
 */
function promptNewItemSource(itemNum, sheetName, rowNum) {
  var itemType = sheetName === 'Gloves' ? 'Glove' : 'Sleeve';

  var template = HtmlService.createTemplateFromFile('NewItemDialog');
  template.itemNum = itemNum;
  template.sheetName = sheetName;
  template.rowNum = rowNum;
  template.itemType = itemType;

  var html = template.evaluate()
    .setWidth(420)
    .setHeight(580);

  SpreadsheetApp.getUi().showModalDialog(html, '📦 New ' + itemType + ' Entry');
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
  var itemType = sheetName === 'Gloves' ? 'Glove' : 'Sleeve';

  // Column mapping for Gloves/Sleeves:
  // A=Item#(1), B=Size(2), C=Class(3), D=Test Date(4), E=Date Assigned(5),
  // F=Location(6), G=Status(7), H=Assigned To(8), I=Change Out Date(9), J=Picked For(10), K=Notes(11)

  // Fill in the basic data
  if (formData.size) {
    sheet.getRange(rowNum, 2).setValue(formData.size);  // Column B = Size
  }

  if (formData.itemClass) {
    sheet.getRange(rowNum, 3).setValue(formData.itemClass);  // Column C = Class
  }

  if (formData.testDate) {
    var testDateCell = sheet.getRange(rowNum, 4);  // Column D = Test Date
    var parsedTestDate = new Date(formData.testDate);
    if (!isNaN(parsedTestDate.getTime())) {
      testDateCell.setValue(parsedTestDate);
      testDateCell.setNumberFormat('MM/dd/yyyy');
    }
  }

  // Handle Assigned To - this triggers location/status updates and Change Out Date calculation
  if (formData.assignedTo && formData.assignedTo.trim() !== '') {
    var assignedTo = formData.assignedTo.trim();

    // Set Assigned To
    sheet.getRange(rowNum, 8).setValue(assignedTo);  // Column H = Assigned To

    // Set Date Assigned to today
    var today = new Date();
    var dateAssignedCell = sheet.getRange(rowNum, 5);  // Column E = Date Assigned
    dateAssignedCell.setValue(today);
    dateAssignedCell.setNumberFormat('MM/dd/yyyy');

    // Set Status to Assigned
    sheet.getRange(rowNum, 7).setValue('Assigned');  // Column G = Status

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
              sheet.getRange(rowNum, 6).setValue(empLocation);  // Column F = Location
            }
            break;
          }
        }
      }
    }

    // Calculate and set Change Out Date
    var isSleeve = (sheetName === 'Sleeves');
    var location = sheet.getRange(rowNum, 6).getValue();  // Get location (may have been auto-filled)
    var changeOutDate = calculateChangeOutDate(today, location, assignedTo, isSleeve);

    if (changeOutDate) {
      var changeOutCell = sheet.getRange(rowNum, 9);  // Column I = Change Out Date
      if (changeOutDate === 'N/A') {
        changeOutCell.setNumberFormat('@');
      } else {
        changeOutCell.setNumberFormat('MM/dd/yyyy');
      }
      changeOutCell.setValue(changeOutDate);
    }

  } else {
    // Not assigned - just set location and status from form
    if (formData.location) {
      sheet.getRange(rowNum, 6).setValue(formData.location);  // Column F = Location
    }
    if (formData.status) {
      sheet.getRange(rowNum, 7).setValue(formData.status);  // Column G = Status
    }
  }

  // Add to known items to prevent re-prompting
  addToKnownItemNumbers(itemNum, sheetName);

  // Handle item source type
  var source = 'Purchased';
  if (formData.itemSource === '2') {
    source = 'Reclaimed';
  } else if (formData.itemSource === '3') {
    // Not a new item - don't log to New Items Log
    ss.toast('Item #' + itemNum + ' added (not logged as new)', '✅ Item Added', 5);

    // Still regenerate Inventory Reports to reflect updated inventory counts
    try {
      updateInventoryReports();
      ss.toast('Inventory Reports updated automatically', '📊 Reports Updated', 3);
    } catch (reportErr) {
      logEvent('Error auto-updating Inventory Reports: ' + reportErr, 'WARN');
    }
    return;
  }

  // Log as new item (Purchased or Reclaimed)
  logNewItem({
    itemNum: itemNum,
    itemType: itemType,
    itemClass: String(formData.itemClass || ''),
    size: String(formData.size || ''),
    source: source,
    originalItems: '',
    cost: '',
    notes: 'Auto-detected from ' + sheetName + ' sheet'
  });

  ss.toast('Item #' + itemNum + ' logged as ' + source, '✅ New Item Logged', 3);

  // Auto-regenerate Inventory Reports to reflect the new item
  try {
    updateInventoryReports();
    ss.toast('Inventory Reports updated automatically', '📊 Reports Updated', 3);
  } catch (reportErr) {
    logEvent('Error auto-updating Inventory Reports: ' + reportErr, 'WARN');
  }
}

/**
 * Logs a new item to the New Items Log section of Inventory Reports.
 * @param {Object} itemData - Item data object
 */
function logNewItem(itemData) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var inventorySheet = ss.getSheetByName('Inventory Reports');

  if (!inventorySheet) {
    logEvent('Inventory Reports sheet not found - cannot log new item', 'ERROR');
    return;
  }

  var data = inventorySheet.getDataRange().getValues();
  var logHeaderRow = -1;

  // Find the New Items Log section
  for (var i = 0; i < data.length; i++) {
    var firstCell = String(data[i][0]).trim();
    if (firstCell === 'Date Added' && i > 0) {
      var prevCell = String(data[i-1][0]).trim();
      if (prevCell.indexOf('NEW ITEMS LOG') !== -1) {
        logHeaderRow = i + 1;
        break;
      }
    }
  }

  // If New Items Log section doesn't exist, we need to regenerate the report
  if (logHeaderRow === -1) {
    logEvent('New Items Log section not found - run Update Inventory Reports first', 'WARN');
    return;
  }

  // Find the next empty row after the header
  var insertRow = logHeaderRow + 1;
  var lastRow = inventorySheet.getLastRow();

  for (var r = logHeaderRow + 1; r <= lastRow + 1; r++) {
    var cellValue = inventorySheet.getRange(r, 1).getValue();
    if (!cellValue || String(cellValue).trim() === '') {
      insertRow = r;
      break;
    }
    insertRow = r + 1;
  }

  var today = new Date();
  var dateStr = Utilities.formatDate(today, ss.getSpreadsheetTimeZone(), 'MM/dd/yyyy');

  var rowData = [
    dateStr,
    itemData.itemNum || '',
    itemData.itemType || '',
    itemData.itemClass || '',
    itemData.size || '',
    itemData.source || 'Purchased',
    itemData.originalItems || '',
    itemData.cost || '',
    itemData.notes || ''
  ];

  inventorySheet.getRange(insertRow, 1, 1, 9).setValues([rowData]);
  inventorySheet.getRange(insertRow, 1, 1, 9).setHorizontalAlignment('center');

  // Color code source column
  if (itemData.source === 'Reclaimed') {
    inventorySheet.getRange(insertRow, 6).setBackground('#fff9c4');
  } else {
    inventorySheet.getRange(insertRow, 6).setBackground('#c8e6c9');
  }

  logEvent('New item logged: ' + itemData.itemNum + ' (' + itemData.source + ')');
}

/**
 * Removes an item from the New Items Log section.
 * Called when an item is deleted from Gloves/Sleeves sheets.
 * @param {string} itemNum - The item number to remove
 * @param {string} itemType - 'Glove' or 'Sleeve' (optional, for more specific removal)
 * @return {boolean} True if an item was removed
 */
function removeFromNewItemsLog(itemNum, itemType) {
  if (!itemNum || String(itemNum).trim() === '') return false;

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var inventorySheet = ss.getSheetByName('Inventory Reports');

  if (!inventorySheet || inventorySheet.getLastRow() < 1) return false;

  var data = inventorySheet.getDataRange().getValues();
  var inLogSection = false;
  var headerFound = false;
  var removedCount = 0;
  var rowsToDelete = [];

  var itemNumStr = String(itemNum).trim();

  for (var i = 0; i < data.length; i++) {
    var firstCell = String(data[i][0]).trim();

    if (firstCell.indexOf('NEW ITEMS LOG') !== -1) {
      inLogSection = true;
      continue;
    }

    if (inLogSection && firstCell === 'Date Added') {
      headerFound = true;
      continue;
    }

    if (inLogSection && headerFound && firstCell && firstCell !== '') {
      // Column B (index 1) = Item #, Column C (index 2) = Item Type
      var logItemNum = String(data[i][1]).trim();
      var logItemType = String(data[i][2]).trim();

      // Match by item number, optionally filter by type
      if (logItemNum === itemNumStr) {
        if (!itemType || logItemType === itemType) {
          rowsToDelete.push(i + 1);  // 1-based row number
          removedCount++;
        }
      }
    }
  }

  // Delete rows from bottom to top to preserve row indices
  rowsToDelete.reverse();
  for (var r = 0; r < rowsToDelete.length; r++) {
    inventorySheet.deleteRow(rowsToDelete[r]);
  }

  if (removedCount > 0) {
    logEvent('Removed ' + removedCount + ' entries from New Items Log for item #' + itemNumStr);
  }

  return removedCount > 0;
}

/**
 * Removes an item number from the known items tracking.
 * @param {string} itemNum - Item number to remove
 * @param {string} sheetName - 'Gloves' or 'Sleeves'
 */
function removeFromKnownItemNumbers(itemNum, sheetName) {
  if (!itemNum || String(itemNum).trim() === '') return;

  var props = PropertiesService.getScriptProperties();
  var key = NEW_ITEMS_PROPERTY_KEY + '_' + sheetName;
  var knownItems = props.getProperty(key) || '';

  var knownSet = knownItems ? knownItems.split(',') : [];
  var itemStr = String(itemNum).trim();

  var idx = knownSet.indexOf(itemStr);
  if (idx !== -1) {
    knownSet.splice(idx, 1);
    props.setProperty(key, knownSet.join(','));
    logEvent('Removed item #' + itemStr + ' from known items for ' + sheetName);
  }
}

/**
 * Handles removal of an item from Gloves/Sleeves sheet.
 * Removes from known items and New Items Log, then updates reports.
 * @param {string} itemNum - The removed item number
 * @param {string} sheetName - 'Gloves' or 'Sleeves'
 */
function handleItemRemoval(itemNum, sheetName) {
  if (!itemNum || String(itemNum).trim() === '') return;

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var itemType = sheetName === 'Gloves' ? 'Glove' : 'Sleeve';

  logEvent('Handling removal of item #' + itemNum + ' from ' + sheetName);

  // Remove from known items tracking
  removeFromKnownItemNumbers(itemNum, sheetName);

  // Remove from New Items Log
  var removed = removeFromNewItemsLog(itemNum, itemType);

  // Update Inventory Reports to reflect the removal
  if (removed) {
    try {
      updateInventoryReports();
      ss.toast('Item #' + itemNum + ' removed from log and reports updated', '🗑️ Item Removed', 3);
    } catch (e) {
      logEvent('Error updating Inventory Reports after item removal: ' + e, 'WARN');
    }
  }
}

/**
 * Syncs the New Items Log with current inventory.
 * Removes any entries for items that no longer exist in Gloves/Sleeves sheets.
 * Can be called manually or as part of maintenance.
 */
function syncNewItemsLogWithInventory() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var glovesSheet = ss.getSheetByName('Gloves');
  var sleevesSheet = ss.getSheetByName('Sleeves');
  var inventorySheet = ss.getSheetByName('Inventory Reports');

  if (!inventorySheet) {
    SpreadsheetApp.getUi().alert('Inventory Reports sheet not found.');
    return;
  }

  // Build sets of current item numbers
  var currentGloves = new Set();
  var currentSleeves = new Set();

  if (glovesSheet && glovesSheet.getLastRow() > 1) {
    var gloveData = glovesSheet.getRange(2, 1, glovesSheet.getLastRow() - 1, 1).getValues();
    gloveData.forEach(function(row) {
      var itemNum = String(row[0]).trim();
      if (itemNum) currentGloves.add(itemNum);
    });
  }

  if (sleevesSheet && sleevesSheet.getLastRow() > 1) {
    var sleeveData = sleevesSheet.getRange(2, 1, sleevesSheet.getLastRow() - 1, 1).getValues();
    sleeveData.forEach(function(row) {
      var itemNum = String(row[0]).trim();
      if (itemNum) currentSleeves.add(itemNum);
    });
  }

  // Check New Items Log entries against current inventory
  var data = inventorySheet.getDataRange().getValues();
  var inLogSection = false;
  var headerFound = false;
  var rowsToDelete = [];
  var removedItems = [];

  for (var i = 0; i < data.length; i++) {
    var firstCell = String(data[i][0]).trim();

    if (firstCell.indexOf('NEW ITEMS LOG') !== -1) {
      inLogSection = true;
      continue;
    }

    if (inLogSection && firstCell === 'Date Added') {
      headerFound = true;
      continue;
    }

    if (inLogSection && headerFound && firstCell && firstCell !== '') {
      var logItemNum = String(data[i][1]).trim();
      var logItemType = String(data[i][2]).trim();

      // Check if item still exists in inventory
      var exists = false;
      if (logItemType === 'Glove') {
        exists = currentGloves.has(logItemNum);
      } else if (logItemType === 'Sleeve') {
        exists = currentSleeves.has(logItemNum);
      }

      if (!exists && logItemNum) {
        rowsToDelete.push(i + 1);
        removedItems.push(logItemNum + ' (' + logItemType + ')');
      }
    }
  }

  // Delete orphaned entries (from bottom to top)
  rowsToDelete.reverse();
  for (var r = 0; r < rowsToDelete.length; r++) {
    inventorySheet.deleteRow(rowsToDelete[r]);
  }

  // Also reset and reinitialize known item numbers
  initializeKnownItemNumbers('Gloves');
  initializeKnownItemNumbers('Sleeves');

  // Update the inventory reports
  if (rowsToDelete.length > 0) {
    updateInventoryReports();
  }

  var message = 'Sync complete.\n\n';
  if (removedItems.length > 0) {
    message += 'Removed ' + removedItems.length + ' orphaned entries:\n• ' + removedItems.join('\n• ');
  } else {
    message += 'No orphaned entries found. Log is already in sync.';
  }

  SpreadsheetApp.getUi().alert('📊 New Items Log Sync', message, SpreadsheetApp.getUi().ButtonSet.OK);
  logEvent('Synced New Items Log: removed ' + rowsToDelete.length + ' orphaned entries');
}
