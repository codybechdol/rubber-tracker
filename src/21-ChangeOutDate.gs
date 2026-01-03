/**
 * Glove Manager – Change Out Date Calculation
 *
 * Functions for calculating and updating change out dates based on
 * item type, location, and assignment status.
 */

/**
 * Calculates the Change Out Date based on Date Assigned, Location, Assigned To, and Item Type.
 *
 * GLOVES:
 * - On Shelf = +12 months
 * - Northern Lights = +6 months
 * - In Testing / Packed For Delivery / Packed For Testing = +3 months
 * - All other locations (employee) = +3 months (default)
 * - Lost / Failed Rubber / Previous Employee = N/A
 *
 * SLEEVES:
 * - All items = +12 months (hardcoded)
 * - Lost / Failed Rubber / Previous Employee = N/A
 *
 * @param {Date|string} dateAssigned - The date the item was assigned
 * @param {string} location - The location of the item
 * @param {string} assignedTo - Who/what the item is assigned to
 * @param {boolean} isSleeve - True if this is a sleeve, false if glove
 * @return {Date|string|null} The calculated change out date, 'N/A', or null if invalid
 */
function calculateChangeOutDate(dateAssigned, location, assignedTo, isSleeve) {
  if (!dateAssigned) return null;

  var assignedToLower = (assignedTo || '').toString().trim().toLowerCase();
  var locationLower = (location || '').toString().trim().toLowerCase();

  // SLEEVES: Always 12 months (hardcoded)
  if (isSleeve) {
    // Lost, Failed Rubber, and Previous Employee sleeves get N/A
    if (assignedToLower === 'lost' || assignedToLower === 'failed rubber' ||
        assignedToLower === 'not repairable' || locationLower === 'previous employee' ||
        locationLower === 'destroyed' || locationLower === 'lost') {
      return 'N/A';
    }
    var d = new Date(dateAssigned);
    if (isNaN(d.getTime())) return null;
    d.setMonth(d.getMonth() + 12);
    return d;
  }

  // GLOVES:
  // Lost, Failed Rubber, and Previous Employee items get N/A
  if (assignedToLower === 'lost' || assignedToLower === 'failed rubber' ||
      assignedToLower === 'not repairable' || locationLower === 'previous employee' ||
      locationLower === 'destroyed' || locationLower === 'lost') {
    return 'N/A';
  }

  var d = new Date(dateAssigned);
  if (isNaN(d.getTime())) return null;

  var months;

  // On Shelf = 12 months (sitting on shelf, not actively used)
  if (assignedToLower === 'on shelf') {
    months = 12;
  }
  // Northern Lights = 6 months (exception for this location)
  else if (locationLower === 'northern lights') {
    months = 6;
  }
  // In Testing / Packed For Delivery / Packed For Testing = 3 months
  // These count toward the employee period per workflow documentation
  else if (assignedToLower === 'packed for delivery' ||
           assignedToLower === 'packed for testing' ||
           assignedToLower === 'in testing') {
    months = 3;
  }
  // All other (employee assigned) = 3 months (default for gloves)
  else {
    months = 3;
  }

  d.setMonth(d.getMonth() + months);
  return d;
}

/**
 * Recalculates all Change Out Dates in Gloves and Sleeves sheets.
 * Called from Glove Manager menu → 🔧 Utilities → Fix All Change Out Dates
 */
// eslint-disable-next-line no-unused-vars
function fixAllChangeOutDates() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var ui = SpreadsheetApp.getUi();

  var result = ui.alert(
    'Recalculate All Change Out Dates',
    'This will recalculate ALL Change Out Dates in the Gloves and Sleeves sheets.\n\n' +
    'GLOVES:\n' +
    '• On Shelf = +12 months\n' +
    '• Northern Lights = +6 months\n' +
    '• In Testing / Packed For Delivery / Packed For Testing = +3 months\n' +
    '• All other locations (employee) = +3 months (default)\n' +
    '• Lost / Failed Rubber / Previous Employee = N/A\n\n' +
    'SLEEVES:\n' +
    '• All items = +12 months (hardcoded)\n' +
    '• Lost / Failed Rubber / Previous Employee = N/A\n\n' +
    'Continue?',
    ui.ButtonSet.YES_NO
  );

  if (result !== ui.Button.YES) {
    return;
  }

  var fixedCount = 0;
  var sheetsToFix = [SHEET_GLOVES, SHEET_SLEEVES];

  sheetsToFix.forEach(function(sheetName) {
    var sheet = ss.getSheetByName(sheetName);
    if (!sheet) return;

    var data = sheet.getDataRange().getValues();
    var headers = data[0];

    // Find column indices (0-based for array access)
    var colDateAssignedIdx = headers.indexOf('Date Assigned');
    var colLocationIdx = headers.indexOf('Location');
    var colChangeOutDateIdx = headers.indexOf('Change Out Date');
    var colAssignedToIdx = headers.indexOf('Assigned To');

    if (colDateAssignedIdx === -1 || colLocationIdx === -1 || colChangeOutDateIdx === -1 || colAssignedToIdx === -1) {
      Logger.log('fixAllChangeOutDates: Missing columns in ' + sheetName +
                 ' - DateAssigned=' + colDateAssignedIdx +
                 ', Location=' + colLocationIdx +
                 ', ChangeOutDate=' + colChangeOutDateIdx +
                 ', AssignedTo=' + colAssignedToIdx);
      return;
    }

    Logger.log('fixAllChangeOutDates: Processing ' + sheetName +
               ' - DateAssigned col=' + (colDateAssignedIdx + 1) +
               ', Location col=' + (colLocationIdx + 1) +
               ', ChangeOutDate col=' + (colChangeOutDateIdx + 1) +
               ', AssignedTo col=' + (colAssignedToIdx + 1));

    for (var i = 1; i < data.length; i++) {
      var row = data[i];
      var dateAssigned = row[colDateAssignedIdx];
      var location = row[colLocationIdx];
      var currentChangeOut = row[colChangeOutDateIdx];
      var assignedTo = row[colAssignedToIdx];

      // Skip rows without Date Assigned
      if (!dateAssigned) {
        continue;
      }

      // Determine if this is a sleeve sheet
      var isSleeve = (sheetName === SHEET_SLEEVES);

      // Calculate the correct Change Out Date (pass assignedTo and isSleeve)
      var correctChangeOut = calculateChangeOutDate(dateAssigned, location, assignedTo, isSleeve);

      if (correctChangeOut) {
        // Check if the current value is different from the correct value
        var needsUpdate = false;
        var currentChangeOutStr = '';

        if (correctChangeOut === 'N/A') {
          needsUpdate = (currentChangeOut !== 'N/A');
          currentChangeOutStr = String(currentChangeOut);
        } else if (correctChangeOut instanceof Date) {
          // Compare dates
          var correctDateStr = Utilities.formatDate(correctChangeOut, ss.getSpreadsheetTimeZone(), 'MM/dd/yyyy');

          if (currentChangeOut instanceof Date) {
            var currentDateStr = Utilities.formatDate(currentChangeOut, ss.getSpreadsheetTimeZone(), 'MM/dd/yyyy');
            needsUpdate = (currentDateStr !== correctDateStr);
            currentChangeOutStr = currentDateStr;
          } else if (typeof currentChangeOut === 'number' && currentChangeOut > 0) {
            // Serial date - convert and compare
            var tempDate = new Date(1899, 11, 30);
            tempDate.setDate(tempDate.getDate() + currentChangeOut);
            var currentDateStr2 = Utilities.formatDate(tempDate, ss.getSpreadsheetTimeZone(), 'MM/dd/yyyy');
            needsUpdate = (currentDateStr2 !== correctDateStr);
            currentChangeOutStr = currentDateStr2 + ' (serial: ' + currentChangeOut + ')';
          } else {
            // No valid current date
            needsUpdate = true;
            currentChangeOutStr = String(currentChangeOut || '(empty)');
          }
        }

        if (needsUpdate) {
          var cell = sheet.getRange(i + 1, colChangeOutDateIdx + 1);  // +1 for 1-based column
          if (correctChangeOut === 'N/A') {
            cell.setNumberFormat('@');  // Plain text for N/A
          } else {
            cell.setNumberFormat('MM/dd/yyyy');
          }
          cell.setValue(correctChangeOut);
          fixedCount++;

          var newValueStr = (correctChangeOut === 'N/A') ? 'N/A' : Utilities.formatDate(correctChangeOut, ss.getSpreadsheetTimeZone(), 'MM/dd/yyyy');
          Logger.log('Fixed row ' + (i + 1) + ' in ' + sheetName +
                     ': DateAssigned=' + dateAssigned +
                     ', Location=' + location +
                     ', AssignedTo=' + assignedTo +
                     ', Old=' + currentChangeOutStr +
                     ', New=' + newValueStr);
        }
      }
    }
  });

  ui.alert('✅ Complete!', 'Fixed ' + fixedCount + ' Change Out Date(s).', ui.ButtonSet.OK);
  Logger.log('fixAllChangeOutDates: Complete - Fixed ' + fixedCount + ' dates');
}

