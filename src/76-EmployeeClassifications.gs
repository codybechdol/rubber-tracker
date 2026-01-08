/* global SpreadsheetApp, SHEET_EMPLOYEES */

/**
 * Glove Manager – Employee Classifications
 *
 * Functions for managing employee job classifications and data validation.
 */

/**
 * Adds data validation dropdown to Job Classification column (N) in Employees sheet.
 * Menu item: Glove Manager → Utilities → Setup Job Classification Dropdown
 */
function setupJobClassificationDropdown() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var employeesSheet = ss.getSheetByName(SHEET_EMPLOYEES);

  if (!employeesSheet) {
    SpreadsheetApp.getUi().alert('❌ Employees sheet not found!');
    return;
  }

  // Job Classifications
  // AP = Apprentice, JRY = Journeyman, F = Foreman, OP = Operator
  // GF = General Foreman, GTO = General Trade Operator, SUP = Supervisor, EO = Equipment Operator
  var classifications = [
    'AP 1',
    'AP 2',
    'AP 3',
    'AP 4',
    'AP 5',
    'AP 6',
    'AP 7',
    'JRY',
    'F',
    'GF',
    'SUP',
    'JRY OP',
    'OP',
    'GTO F',
    'GTO',
    'EO 1',
    'EO 2'
  ];

  // Get or create Job Classification column (N)
  var headers = employeesSheet.getRange(1, 1, 1, employeesSheet.getLastColumn()).getValues()[0];
  var classificationCol = -1;

  for (var h = 0; h < headers.length; h++) {
    if (String(headers[h]).toLowerCase().trim() === 'job classification') {
      classificationCol = h + 1; // 1-based
      break;
    }
  }

  // If column doesn't exist, add it
  if (classificationCol === -1) {
    // Add as column N (14)
    classificationCol = 14;

    // Make sure we have enough columns
    if (employeesSheet.getMaxColumns() < classificationCol) {
      employeesSheet.insertColumnsAfter(employeesSheet.getMaxColumns(),
                                        classificationCol - employeesSheet.getMaxColumns());
    }

    // Set header
    employeesSheet.getRange(1, classificationCol).setValue('Job Classification');
    employeesSheet.getRange(1, classificationCol)
      .setFontWeight('bold')
      .setBackground('#4285f4')
      .setFontColor('white');
  }

  // Create data validation rule with dropdown
  var rule = SpreadsheetApp.newDataValidation()
    .requireValueInList(classifications, true)
    .setAllowInvalid(true) // Allow manual entry for flexibility
    .setHelpText('Select employee job classification. F = Foreman for training tracking.')
    .build();

  // Apply to column N, rows 2 onwards (skip header)
  var lastRow = Math.max(employeesSheet.getLastRow(), 100); // At least 100 rows
  var validationRange = employeesSheet.getRange(2, classificationCol, lastRow - 1, 1);
  validationRange.setDataValidation(rule);

  SpreadsheetApp.getUi().alert(
    '✅ Job Classification Dropdown Created!\n\n' +
    'Column: N (Job Classification)\n' +
    'Values: AP 1-7, JRY, F, GF, SUP, JRY OP, OP, GTO F, GTO, EO 1-2\n\n' +
    '⭐ Only "F" and "GTO F" are recognized as crew leads for training tracking'
  );
}

/**
 * Updates crew lead detection to recognize all foreman classifications.
 * This enhances the existing getCrewLead function logic.
 *
 * @param {string} classification - Job classification string
 * @return {boolean} True if classification indicates crew lead/foreman
 */
function isCrewLead(classification) {
  if (!classification) return false;

  var classStr = String(classification).trim();

  // Only F and GTO F are crew leads for training tracking
  if (classStr === 'F') return true;
  if (classStr === 'GTO F') return true;

  return false;
}

/**
 * Gets a human-readable description of job classifications.
 * Can be displayed in help dialogs.
 *
 * @return {string} Description of classification codes
 */
function getClassificationDescriptions() {
  var descriptions = 'Job Classification Reference:\n\n';
  descriptions += 'AP 1-7 = Apprentice (1st through 7th year)\n';
  descriptions += 'JRY = Journeyman\n';
  descriptions += 'F = Foreman (Crew Lead) ⭐\n';
  descriptions += 'GF = General Foreman\n';
  descriptions += 'SUP = Supervisor\n';
  descriptions += 'JRY OP = Journeyman Operator\n';
  descriptions += 'OP = Operator\n';
  descriptions += 'GTO F = General Trade Operator - Foreman (Crew Lead) ⭐\n';
  descriptions += 'GTO = General Trade Operator\n';
  descriptions += 'EO 1-2 = Equipment Operator (Level 1-2)\n\n';
  descriptions += '⭐ Only F and GTO F are recognized as crew leads for training tracking';

  return descriptions;
}

/**
 * Shows classification reference guide to user.
 * Menu item: Glove Manager → Utilities → View Classification Guide
 */
function showClassificationGuide() {
  SpreadsheetApp.getUi().alert(
    '📋 Job Classification Guide',
    getClassificationDescriptions(),
    SpreadsheetApp.getUi().ButtonSet.OK
  );
}

