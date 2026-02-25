/**
 * 88-SafetyReports.gs
 *
 * Gmail integration for processing JHAs, Safety Meetings, and Fleet Checklists
 * Extracts equipment issues (fire extinguishers, hot sticks, rubber goods, etc.)
 * Logs to Safety Equipment Needs sheet for tracking and task creation
 *
 * Created: February 4, 2026
 * Updated: February 18, 2026 - Added secondary job number support for lookupForemanByJobNumber
 * Updated: February 24, 2026 - MAJOR REFACTOR: Direct compliance tracking from Gmail
 *   - Renamed "Safety Reports" → "Safety Equipment Needs"
 *   - JHA/Safety Meeting compliance tracked directly from parsed emails
 *   - Removed writing of "No Issues" records to Safety Equipment Needs
 *   - Added unified resolveJobToCrew() function
 *   - Added real-time compliance updates during email processing
 */

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Sheet name constants - allows for easy migration and backward compatibility
 */
var SAFETY_EQUIPMENT_SHEET_NAME = "Safety Equipment Needs";
var SAFETY_EQUIPMENT_SHEET_OLD_NAME = "Safety Reports"; // For backward compat
var SAFETY_COMPLIANCE_SHEET_NAME = "Safety Compliance";

/**
 * NEW: Raw data logging sheet names (Option B implementation - Feb 24, 2026)
 * These sheets provide an audit trail for ALL safety emails processed
 */
var JHA_LOG_SHEET_NAME = "JHA Log";
var WEEKLY_SAFETY_LOG_SHEET_NAME = "Weekly Safety Log";
var MONTHLY_CHECKLIST_LOG_SHEET_NAME = "Monthly Checklist Log";

// ============================================================================
// LOG SHEET SETUP FUNCTIONS (Option B - Feb 24, 2026)
// ============================================================================

/**
 * Creates the JHA Log sheet for tracking all JHA emails
 * This provides an audit trail - every JHA email gets logged here
 * Columns: Date Received, Date Created, Job Number, Foreman, Email Subject,
 *          Email ID, Source, Status, Credited To, Notes
 */
function setupJHALogSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(JHA_LOG_SHEET_NAME);

  if (sheet) {
    // Sheet exists - don't recreate (preserves data)
    Logger.log("setupJHALogSheet: Sheet already exists");
    return sheet;
  }

  sheet = ss.insertSheet(JHA_LOG_SHEET_NAME);

  var headers = [
    "Date Received",   // A - When email arrived
    "Date Created",    // B - JHA work date (from PDF or subject)
    "Job Number",      // C - Raw job number from email
    "Foreman",         // D - Resolved foreman name (or "UNKNOWN")
    "Email Subject",   // E - Full subject for debugging
    "Email ID",        // F - Gmail message ID (deduplication)
    "Source",          // G - "Subject" or "PDF" - where date came from
    "Status",          // H - "Credited", "Unknown Job", "Duplicate", "Error"
    "Credited To",     // I - Which tracked crew got credit
    "Notes"            // J - Additional info or error messages
  ];

  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.getRange(1, 1, 1, headers.length)
    .setFontWeight("bold")
    .setBackground("#4285F4")  // Blue
    .setFontColor("white");
  sheet.setFrozenRows(1);

  // Set column widths
  sheet.setColumnWidth(1, 120);  // Date Received
  sheet.setColumnWidth(2, 120);  // Date Created
  sheet.setColumnWidth(3, 90);   // Job Number
  sheet.setColumnWidth(4, 140);  // Foreman
  sheet.setColumnWidth(5, 400);  // Email Subject
  sheet.setColumnWidth(6, 180);  // Email ID
  sheet.setColumnWidth(7, 80);   // Source
  sheet.setColumnWidth(8, 100);  // Status
  sheet.setColumnWidth(9, 90);   // Credited To
  sheet.setColumnWidth(10, 250); // Notes

  // Format date columns
  sheet.getRange(2, 1, 1000, 1).setNumberFormat("MM/dd/yyyy HH:mm");
  sheet.getRange(2, 2, 1000, 1).setNumberFormat("MM/dd/yyyy");

  // Add conditional formatting for Status column
  var statusRange = sheet.getRange("H2:H1001");
  var rules = sheet.getConditionalFormatRules();

  // Credited = Green
  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .whenTextEqualTo("Credited")
    .setBackground("#C8E6C9")
    .setFontColor("#1B5E20")
    .setRanges([statusRange])
    .build());

  // Unknown Job = Orange
  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .whenTextEqualTo("Unknown Job")
    .setBackground("#FFE0B2")
    .setFontColor("#E65100")
    .setRanges([statusRange])
    .build());

  // Duplicate = Gray
  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .whenTextEqualTo("Duplicate")
    .setBackground("#E0E0E0")
    .setFontColor("#616161")
    .setRanges([statusRange])
    .build());

  // Error = Red
  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .whenTextEqualTo("Error")
    .setBackground("#FFCDD2")
    .setFontColor("#B71C1C")
    .setRanges([statusRange])
    .build());

  sheet.setConditionalFormatRules(rules);

  Logger.log("setupJHALogSheet: Created JHA Log sheet");
  return sheet;
}

/**
 * Creates the Weekly Safety Log sheet for tracking Safety Meeting emails
 */
function setupWeeklySafetyLogSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(WEEKLY_SAFETY_LOG_SHEET_NAME);

  if (sheet) {
    Logger.log("setupWeeklySafetyLogSheet: Sheet already exists");
    return sheet;
  }

  sheet = ss.insertSheet(WEEKLY_SAFETY_LOG_SHEET_NAME);

  var headers = [
    "Date Received",   // A - When email arrived
    "Week Of",         // B - Week date from subject
    "Job Number",      // C - Raw job number from email
    "Foreman",         // D - Resolved foreman name
    "Email Subject",   // E - Full subject
    "Email ID",        // F - Gmail message ID
    "Status",          // G - "Credited", "Unknown Job", "Duplicate"
    "Credited To",     // H - Which tracked crew got credit
    "Notes"            // I - Additional info
  ];

  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.getRange(1, 1, 1, headers.length)
    .setFontWeight("bold")
    .setBackground("#0F9D58")  // Green
    .setFontColor("white");
  sheet.setFrozenRows(1);

  // Set column widths
  sheet.setColumnWidth(1, 120);  // Date Received
  sheet.setColumnWidth(2, 120);  // Week Of
  sheet.setColumnWidth(3, 90);   // Job Number
  sheet.setColumnWidth(4, 140);  // Foreman
  sheet.setColumnWidth(5, 400);  // Email Subject
  sheet.setColumnWidth(6, 180);  // Email ID
  sheet.setColumnWidth(7, 100);  // Status
  sheet.setColumnWidth(8, 90);   // Credited To
  sheet.setColumnWidth(9, 250);  // Notes

  // Format date columns
  sheet.getRange(2, 1, 1000, 1).setNumberFormat("MM/dd/yyyy HH:mm");
  sheet.getRange(2, 2, 1000, 1).setNumberFormat("MM/dd/yyyy");

  // Add conditional formatting for Status column
  var statusRange = sheet.getRange("G2:G1001");
  var rules = sheet.getConditionalFormatRules();

  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .whenTextEqualTo("Credited")
    .setBackground("#C8E6C9")
    .setFontColor("#1B5E20")
    .setRanges([statusRange])
    .build());

  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .whenTextEqualTo("Unknown Job")
    .setBackground("#FFE0B2")
    .setFontColor("#E65100")
    .setRanges([statusRange])
    .build());

  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .whenTextEqualTo("Duplicate")
    .setBackground("#E0E0E0")
    .setFontColor("#616161")
    .setRanges([statusRange])
    .build());

  sheet.setConditionalFormatRules(rules);

  Logger.log("setupWeeklySafetyLogSheet: Created Weekly Safety Log sheet");
  return sheet;
}

/**
 * Creates the Monthly Checklist Log sheet for tracking Fleet Safety Checklists
 */
function setupMonthlyChecklistLogSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(MONTHLY_CHECKLIST_LOG_SHEET_NAME);

  if (sheet) {
    Logger.log("setupMonthlyChecklistLogSheet: Sheet already exists");
    return sheet;
  }

  sheet = ss.insertSheet(MONTHLY_CHECKLIST_LOG_SHEET_NAME);

  var headers = [
    "Date Received",      // A - When email arrived
    "Report Date",        // B - Date of checklist
    "Job Number",         // C - Raw job number
    "Foreman",            // D - Resolved foreman name
    "Vehicle Number",     // E - Extracted vehicle #
    "Email Subject",      // F - Full subject
    "Email ID",           // G - Gmail message ID
    "Status",             // H - "Credited", "Unknown Job", "Duplicate"
    "Credited To",        // I - Which crew got credit
    "Has Equipment Issues", // J - "Yes" or "No"
    "Notes"               // K - Additional info
  ];

  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.getRange(1, 1, 1, headers.length)
    .setFontWeight("bold")
    .setBackground("#F4B400")  // Yellow
    .setFontColor("#333333");
  sheet.setFrozenRows(1);

  // Set column widths
  sheet.setColumnWidth(1, 120);  // Date Received
  sheet.setColumnWidth(2, 100);  // Report Date
  sheet.setColumnWidth(3, 90);   // Job Number
  sheet.setColumnWidth(4, 140);  // Foreman
  sheet.setColumnWidth(5, 100);  // Vehicle Number
  sheet.setColumnWidth(6, 400);  // Email Subject
  sheet.setColumnWidth(7, 180);  // Email ID
  sheet.setColumnWidth(8, 100);  // Status
  sheet.setColumnWidth(9, 90);   // Credited To
  sheet.setColumnWidth(10, 60);  // Has Equipment Issues
  sheet.setColumnWidth(11, 250); // Notes

  // Format date columns
  sheet.getRange(2, 1, 1000, 1).setNumberFormat("MM/dd/yyyy HH:mm");
  sheet.getRange(2, 2, 1000, 1).setNumberFormat("MM/dd/yyyy");

  // Add conditional formatting for Status column
  var statusRange = sheet.getRange("H2:H1001");
  var rules = sheet.getConditionalFormatRules();

  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .whenTextEqualTo("Credited")
    .setBackground("#C8E6C9")
    .setFontColor("#1B5E20")
    .setRanges([statusRange])
    .build());

  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .whenTextEqualTo("Unknown Job")
    .setBackground("#FFE0B2")
    .setFontColor("#E65100")
    .setRanges([statusRange])
    .build());

  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .whenTextEqualTo("Duplicate")
    .setBackground("#E0E0E0")
    .setFontColor("#616161")
    .setRanges([statusRange])
    .build());

  sheet.setConditionalFormatRules(rules);

  Logger.log("setupMonthlyChecklistLogSheet: Created Monthly Checklist Log sheet");
  return sheet;
}

/**
 * Creates all three log sheets at once
 * Menu function: Glove Manager → Safety → Setup Log Sheets
 */
function setupAllSafetyLogSheets() {
  var jhaSheet = setupJHALogSheet();
  var weeklySheet = setupWeeklySafetyLogSheet();
  var monthlySheet = setupMonthlyChecklistLogSheet();

  SpreadsheetApp.getUi().alert('✅ Log Sheets Created',
    'Created 3 safety log sheets:\n\n' +
    '• JHA Log - tracks all Job Hazard Reports\n' +
    '• Weekly Safety Log - tracks Safety Meeting Reports\n' +
    '• Monthly Checklist Log - tracks Fleet Safety Checklists\n\n' +
    'These sheets provide an audit trail for compliance tracking.',
    SpreadsheetApp.getUi().ButtonSet.OK);

  Logger.log("setupAllSafetyLogSheets: Created all 3 log sheets");
}

// ============================================================================
// LOG SHEET DATA FUNCTIONS (Option B - Feb 24, 2026)
// ============================================================================

/**
 * Gets or creates the JHA Log sheet
 */
function getJHALogSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(JHA_LOG_SHEET_NAME);
  if (!sheet) {
    sheet = setupJHALogSheet();
  }
  return sheet;
}

/**
 * Gets or creates the Weekly Safety Log sheet
 */
function getWeeklySafetyLogSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(WEEKLY_SAFETY_LOG_SHEET_NAME);
  if (!sheet) {
    sheet = setupWeeklySafetyLogSheet();
  }
  return sheet;
}

/**
 * Gets or creates the Monthly Checklist Log sheet
 */
function getMonthlyChecklistLogSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(MONTHLY_CHECKLIST_LOG_SHEET_NAME);
  if (!sheet) {
    sheet = setupMonthlyChecklistLogSheet();
  }
  return sheet;
}

/**
 * Checks if an email ID already exists in a log sheet (deduplication)
 * @param {Sheet} sheet - The log sheet to check
 * @param {string} emailId - Gmail message ID
 * @param {number} emailIdCol - Column index (0-based) of Email ID
 * @returns {boolean} - true if already exists
 */
function emailExistsInLog(sheet, emailId, emailIdCol) {
  if (!sheet || sheet.getLastRow() < 2) return false;

  var data = sheet.getRange(2, emailIdCol + 1, sheet.getLastRow() - 1, 1).getValues();
  for (var i = 0; i < data.length; i++) {
    if (data[i][0] === emailId) {
      return true;
    }
  }
  return false;
}

/**
 * Logs a JHA email to the JHA Log sheet
 * This is THE key function for Option B - every JHA gets logged here
 *
 * @param {Object} params - Log parameters
 * @param {Date} params.dateReceived - When email arrived
 * @param {Date} params.dateCreated - JHA work date
 * @param {string} params.jobNumber - Raw job number from email
 * @param {string} params.foreman - Resolved foreman name
 * @param {string} params.emailSubject - Full subject line
 * @param {string} params.emailId - Gmail message ID
 * @param {string} params.source - "Subject" or "PDF"
 * @param {string} params.status - "Credited", "Unknown Job", "Duplicate", "Error"
 * @param {string} params.creditedTo - Tracked crew that got credit (or blank)
 * @param {string} params.notes - Additional info
 * @returns {Object} - { success: boolean, row: number }
 */
function logJHAEmail(params) {
  var sheet = getJHALogSheet();
  var tz = Session.getScriptTimeZone();

  // Check for duplicate
  if (emailExistsInLog(sheet, params.emailId, 5)) { // Column F = Email ID (0-indexed = 5)
    Logger.log("logJHAEmail: Duplicate - " + params.emailId);
    return { success: false, duplicate: true };
  }

  var row = [
    params.dateReceived ? Utilities.formatDate(params.dateReceived, tz, "MM/dd/yyyy HH:mm") : '',
    params.dateCreated ? Utilities.formatDate(params.dateCreated, tz, "MM/dd/yyyy") : '',
    params.jobNumber || '',
    params.foreman || 'UNKNOWN',
    params.emailSubject || '',
    params.emailId || '',
    params.source || 'Subject',
    params.status || 'Credited',
    params.creditedTo || '',
    params.notes || ''
  ];

  sheet.appendRow(row);
  var lastRow = sheet.getLastRow();

  Logger.log("logJHAEmail: Logged JHA for job " + params.jobNumber + " - Status: " + params.status + " - Credited To: " + params.creditedTo);
  return { success: true, row: lastRow };
}

/**
 * Logs a Safety Meeting email to the Weekly Safety Log sheet
 *
 * @param {Object} params - Log parameters
 * @param {Date} params.dateReceived - When email arrived
 * @param {Date} params.weekOf - Week date from subject
 * @param {string} params.jobNumber - Raw job number
 * @param {string} params.foreman - Resolved foreman name
 * @param {string} params.emailSubject - Full subject
 * @param {string} params.emailId - Gmail message ID
 * @param {string} params.status - Status
 * @param {string} params.creditedTo - Tracked crew
 * @param {string} params.notes - Additional info
 * @returns {Object} - { success: boolean, row: number }
 */
function logWeeklySafetyEmail(params) {
  var sheet = getWeeklySafetyLogSheet();
  var tz = Session.getScriptTimeZone();

  // Check for duplicate
  if (emailExistsInLog(sheet, params.emailId, 5)) { // Column F = Email ID
    Logger.log("logWeeklySafetyEmail: Duplicate - " + params.emailId);
    return { success: false, duplicate: true };
  }

  var row = [
    params.dateReceived ? Utilities.formatDate(params.dateReceived, tz, "MM/dd/yyyy HH:mm") : '',
    params.weekOf ? Utilities.formatDate(params.weekOf, tz, "MM/dd/yyyy") : '',
    params.jobNumber || '',
    params.foreman || 'UNKNOWN',
    params.emailSubject || '',
    params.emailId || '',
    params.status || 'Credited',
    params.creditedTo || '',
    params.notes || ''
  ];

  sheet.appendRow(row);
  var lastRow = sheet.getLastRow();

  Logger.log("logWeeklySafetyEmail: Logged meeting for job " + params.jobNumber + " - Status: " + params.status);
  return { success: true, row: lastRow };
}

/**
 * Logs a Monthly Checklist (Fleet Safety) email to the Monthly Checklist Log sheet
 *
 * @param {Object} params - Log parameters
 * @param {Date} params.dateReceived - When email arrived
 * @param {Date} params.reportDate - Report date
 * @param {string} params.jobNumber - Raw job number
 * @param {string} params.foreman - Resolved foreman name
 * @param {string} params.vehicleNumber - Vehicle number
 * @param {string} params.emailSubject - Full subject
 * @param {string} params.emailId - Gmail message ID
 * @param {string} params.status - Status
 * @param {string} params.creditedTo - Tracked crew
 * @param {boolean} params.hasEquipmentIssues - Whether equipment issues were found
 * @param {string} params.notes - Additional info
 * @returns {Object} - { success: boolean, row: number }
 */
function logMonthlyChecklistEmail(params) {
  var sheet = getMonthlyChecklistLogSheet();
  var tz = Session.getScriptTimeZone();

  // Check for duplicate
  if (emailExistsInLog(sheet, params.emailId, 6)) { // Column G = Email ID
    Logger.log("logMonthlyChecklistEmail: Duplicate - " + params.emailId);
    return { success: false, duplicate: true };
  }

  var row = [
    params.dateReceived ? Utilities.formatDate(params.dateReceived, tz, "MM/dd/yyyy HH:mm") : '',
    params.reportDate ? Utilities.formatDate(params.reportDate, tz, "MM/dd/yyyy") : '',
    params.jobNumber || '',
    params.foreman || 'UNKNOWN',
    params.vehicleNumber || '',
    params.emailSubject || '',
    params.emailId || '',
    params.status || 'Credited',
    params.creditedTo || '',
    params.hasEquipmentIssues ? 'Yes' : 'No',
    params.notes || ''
  ];

  sheet.appendRow(row);
  var lastRow = sheet.getLastRow();

  Logger.log("logMonthlyChecklistEmail: Logged checklist for job " + params.jobNumber + " - Status: " + params.status);
  return { success: true, row: lastRow };
}

/**
 * Cleans up old log entries (older than specified days)
 * This keeps the log sheets manageable in size
 * Run automatically at start of processSafetyEmails or via menu
 *
 * @param {number} daysToKeep - Number of days to keep (default: 90)
 * @returns {Object} - { jhaDeleted, weeklyDeleted, monthlyDeleted }
 */
function cleanupOldLogEntries(daysToKeep) {
  if (!daysToKeep) daysToKeep = 90;

  var cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

  var result = {
    jhaDeleted: 0,
    weeklyDeleted: 0,
    monthlyDeleted: 0
  };

  // Cleanup JHA Log
  var jhaSheet = getJHALogSheet();
  if (jhaSheet && jhaSheet.getLastRow() > 1) {
    result.jhaDeleted = deleteOldRowsFromSheet(jhaSheet, cutoffDate, 0); // Column A = Date Received
  }

  // Cleanup Weekly Safety Log
  var weeklySheet = getWeeklySafetyLogSheet();
  if (weeklySheet && weeklySheet.getLastRow() > 1) {
    result.weeklyDeleted = deleteOldRowsFromSheet(weeklySheet, cutoffDate, 0);
  }

  // Cleanup Monthly Checklist Log
  var monthlySheet = getMonthlyChecklistLogSheet();
  if (monthlySheet && monthlySheet.getLastRow() > 1) {
    result.monthlyDeleted = deleteOldRowsFromSheet(monthlySheet, cutoffDate, 0);
  }

  var total = result.jhaDeleted + result.weeklyDeleted + result.monthlyDeleted;
  Logger.log("cleanupOldLogEntries: Deleted " + total + " old entries (JHA: " + result.jhaDeleted +
    ", Weekly: " + result.weeklyDeleted + ", Monthly: " + result.monthlyDeleted + ")");

  return result;
}

/**
 * Helper to delete rows older than cutoff date from a sheet
 * @param {Sheet} sheet - The sheet to clean
 * @param {Date} cutoffDate - Delete rows with date before this
 * @param {number} dateCol - Column index (0-based) containing the date
 * @returns {number} - Number of rows deleted
 */
function deleteOldRowsFromSheet(sheet, cutoffDate, dateCol) {
  var data = sheet.getDataRange().getValues();
  var rowsToDelete = [];

  for (var i = data.length - 1; i >= 1; i--) {
    var cellValue = data[i][dateCol];
    if (cellValue) {
      var rowDate = new Date(cellValue);
      if (rowDate < cutoffDate) {
        rowsToDelete.push(i + 1); // 1-based row number
      }
    }
  }

  // Delete from bottom to top
  for (var r = 0; r < rowsToDelete.length; r++) {
    sheet.deleteRow(rowsToDelete[r]);
  }

  return rowsToDelete.length;
}

// ============================================================================
// DIAGNOSTIC FUNCTIONS (Debugging - Feb 24, 2026)
// ============================================================================

/**
 * Debug function to check what's in the JHA Log sheet
 * Run this from Script Editor to see the log contents
 */
function debugJHALogContents() {
  var sheet = getJHALogSheet();
  if (!sheet) {
    Logger.log("DEBUG: JHA Log sheet not found!");
    return;
  }

  var lastRow = sheet.getLastRow();
  Logger.log("DEBUG: JHA Log has " + (lastRow - 1) + " records (excluding header)");

  if (lastRow <= 1) {
    Logger.log("DEBUG: JHA Log is EMPTY - no records logged");
    return;
  }

  // Show first 10 records
  var data = sheet.getRange(2, 1, Math.min(10, lastRow - 1), 10).getValues();
  Logger.log("DEBUG: First " + data.length + " JHA records:");

  for (var i = 0; i < data.length; i++) {
    var row = data[i];
    Logger.log("  " + (i+1) + ": Date=" + row[1] + ", Job=" + row[2] + ", Status=" + row[7] + ", CreditedTo=" + row[8]);
  }

  // Count by status
  var allData = sheet.getRange(2, 8, lastRow - 1, 1).getValues();
  var statusCounts = {};
  for (var j = 0; j < allData.length; j++) {
    var status = String(allData[j][0] || 'Unknown').trim();
    statusCounts[status] = (statusCounts[status] || 0) + 1;
  }
  Logger.log("DEBUG: JHA Status counts: " + JSON.stringify(statusCounts));
}

/**
 * Debug function to check what's in the Weekly Safety Log sheet
 */
function debugWeeklySafetyLogContents() {
  var sheet = getWeeklySafetyLogSheet();
  if (!sheet) {
    Logger.log("DEBUG: Weekly Safety Log sheet not found!");
    return;
  }

  var lastRow = sheet.getLastRow();
  Logger.log("DEBUG: Weekly Safety Log has " + (lastRow - 1) + " records (excluding header)");

  if (lastRow <= 1) {
    Logger.log("DEBUG: Weekly Safety Log is EMPTY - no records logged");
    return;
  }

  // Show first 10 records
  var data = sheet.getRange(2, 1, Math.min(10, lastRow - 1), 9).getValues();
  Logger.log("DEBUG: First " + data.length + " Weekly Safety records:");

  for (var i = 0; i < data.length; i++) {
    var row = data[i];
    Logger.log("  " + (i+1) + ": WeekOf=" + row[1] + ", Job=" + row[2] + ", Status=" + row[6] + ", CreditedTo=" + row[7]);
  }
}

/**
 * Debug function to check compliance calculation
 */
function debugComplianceCalculation() {
  var today = new Date();
  var weekBounds = getWeekBoundaries(today);
  var tz = Session.getScriptTimeZone();

  Logger.log("DEBUG: Current week: " + Utilities.formatDate(weekBounds.weekStart, tz, "MM/dd/yyyy") +
             " to " + Utilities.formatDate(weekBounds.weekEnd, tz, "MM/dd/yyyy"));

  var result = calculateComplianceFromLogs(weekBounds.weekStart);

  if (!result) {
    Logger.log("DEBUG: calculateComplianceFromLogs returned null!");
    return;
  }

  Logger.log("DEBUG: Compliance data for " + Object.keys(result.crewCompliance).length + " crews");

  // Show crew summary
  var creditedCount = 0;
  var missingCount = 0;
  for (var crewJob in result.crewCompliance) {
    var crew = result.crewCompliance[crewJob];
    var hasJHA = crew.jhaByDay.some(function(d) { return d === true; });
    var hasWeekly = crew.weeklyMeeting;

    if (hasJHA || hasWeekly) {
      creditedCount++;
      Logger.log("  " + crewJob + " (" + crew.foreman + "): JHAs=" +
                 crew.jhaByDay.filter(function(d){return d;}).length +
                 " days, Weekly=" + (hasWeekly ? "YES" : "no"));
    } else {
      missingCount++;
    }
  }

  Logger.log("DEBUG: " + creditedCount + " crews have some reports, " + missingCount + " crews have none");

  if (result.unknownJobs) {
    Logger.log("DEBUG: Unknown jobs: " + Object.keys(result.unknownJobs).join(", "));
  }
}

/**
 * Menu function to diagnose the state of safety log sheets
 * Run this from Glove Manager → Safety → 🔍 Diagnose Log Sheets
 */
function menuDiagnoseLogSheets() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var ui = SpreadsheetApp.getUi();
  var report = [];

  // Check JHA Log
  var jhaSheet = ss.getSheetByName(JHA_LOG_SHEET_NAME);
  if (jhaSheet) {
    var jhaCount = jhaSheet.getLastRow() - 1;
    report.push('📄 JHA Log: ' + jhaCount + ' records');

    if (jhaCount > 0) {
      // Count by status
      var jhaData = jhaSheet.getRange(2, 8, jhaCount, 2).getValues(); // Status, Credited To
      var credited = 0, unknown = 0, other = 0;
      var creditedCrews = {};
      for (var i = 0; i < jhaData.length; i++) {
        var status = String(jhaData[i][0] || '').trim();
        var crew = String(jhaData[i][1] || '').trim();
        if (status === 'Credited') {
          credited++;
          creditedCrews[crew] = (creditedCrews[crew] || 0) + 1;
        } else if (status === 'Unknown Job') {
          unknown++;
        } else {
          other++;
        }
      }
      report.push('   - Credited: ' + credited + ', Unknown Job: ' + unknown + ', Other: ' + other);
      if (credited > 0) {
        var crewList = Object.keys(creditedCrews).slice(0, 5).map(function(c) { return c + ' (' + creditedCrews[c] + ')'; });
        report.push('   - Top crews: ' + crewList.join(', '));
      }
    }
  } else {
    report.push('📄 JHA Log: NOT FOUND');
  }

  // Check Weekly Safety Log
  var weeklySheet = ss.getSheetByName(WEEKLY_SAFETY_LOG_SHEET_NAME);
  if (weeklySheet) {
    var weeklyCount = weeklySheet.getLastRow() - 1;
    report.push('📄 Weekly Safety Log: ' + weeklyCount + ' records');

    if (weeklyCount > 0) {
      var weeklyData = weeklySheet.getRange(2, 7, weeklyCount, 2).getValues(); // Status, Credited To
      var credited = 0, unknown = 0;
      for (var i = 0; i < weeklyData.length; i++) {
        if (String(weeklyData[i][0]).trim() === 'Credited') credited++;
        else if (String(weeklyData[i][0]).trim() === 'Unknown Job') unknown++;
      }
      report.push('   - Credited: ' + credited + ', Unknown Job: ' + unknown);
    }
  } else {
    report.push('📄 Weekly Safety Log: NOT FOUND');
  }

  // Check Monthly Checklist Log
  var monthlySheet = ss.getSheetByName(MONTHLY_CHECKLIST_LOG_SHEET_NAME);
  if (monthlySheet) {
    var monthlyCount = monthlySheet.getLastRow() - 1;
    report.push('📄 Monthly Checklist Log: ' + monthlyCount + ' records');
  } else {
    report.push('📄 Monthly Checklist Log: NOT FOUND');
  }

  // Check Safety Compliance
  var complianceSheet = ss.getSheetByName(SAFETY_COMPLIANCE_SHEET_NAME);
  if (complianceSheet) {
    var compCount = complianceSheet.getLastRow() - 1;
    report.push('\\n📊 Safety Compliance: ' + compCount + ' records');
  } else {
    report.push('\\n📊 Safety Compliance: NOT FOUND');
  }

  // Recommendation
  report.push('\\n--- RECOMMENDATION ---');
  if (jhaSheet && jhaSheet.getLastRow() <= 1 && weeklySheet && weeklySheet.getLastRow() <= 1) {
    report.push('⚠️ Log sheets are EMPTY. Run "Process Safety Emails" to populate them.');
  } else if (jhaSheet && jhaSheet.getLastRow() > 1) {
    report.push('✅ Log sheets have data. Run "🔄 Recalculate Compliance" to update Safety Compliance from logs.');
  }

  ui.alert('🔍 Safety Log Sheets Diagnostic', report.join('\\n'), ui.ButtonSet.OK);
}

// ============================================================================
// COMPLIANCE CALCULATION FROM LOGS (Option B - Feb 24, 2026)
// ============================================================================

/**
 * DETAILED diagnostic that traces the exact compliance calculation
 * Shows: what dates are being compared, what matches, what doesn't
 * Menu function: Glove Manager → Safety → 📊 Trace Compliance Calculation
 */
function traceComplianceCalculation() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var tz = Session.getScriptTimeZone();
  var report = [];

  report.push('========================================');
  report.push('DETAILED COMPLIANCE TRACE');
  report.push('Generated: ' + new Date().toLocaleString());
  report.push('========================================');
  report.push('');

  // Get current week boundaries
  var today = new Date();
  var weekBounds = getWeekBoundaries(today);
  var weekStartStr = Utilities.formatDate(weekBounds.weekStart, tz, 'MM/dd/yyyy');
  var weekEndStr = Utilities.formatDate(weekBounds.weekEnd, tz, 'MM/dd/yyyy');

  report.push('=== WEEK BOUNDARIES ===');
  report.push('Today: ' + Utilities.formatDate(today, tz, 'MM/dd/yyyy HH:mm'));
  report.push('Week Start (Sunday): ' + weekStartStr + ' @ ' + weekBounds.weekStart.toTimeString());
  report.push('Week End (Saturday): ' + weekEndStr + ' @ ' + weekBounds.weekEnd.toTimeString());

  // Get tracked crews
  var crews = getActiveCrews();
  report.push('');
  report.push('=== TRACKED CREWS (' + crews.length + ' total) ===');
  report.push(crews.join(', '));

  // Build a set for fast lookup
  var crewSet = {};
  for (var c = 0; c < crews.length; c++) {
    crewSet[crews[c]] = true;
  }

  // Read JHA Log
  var jhaSheet = ss.getSheetByName('JHA Log');
  if (!jhaSheet) {
    report.push('');
    report.push('❌ JHA Log sheet not found!');
  } else {
    var jhaData = jhaSheet.getDataRange().getValues();
    report.push('');
    report.push('=== JHA LOG ANALYSIS ===');
    report.push('Total rows in JHA Log: ' + (jhaData.length - 1));

    var matchedCount = 0;
    var skippedOutsideWeek = 0;
    var skippedNoDate = 0;
    var skippedNotCredited = 0;
    var skippedCrewNotTracked = 0;
    var creditedByCrew = {};

    // Initialize crew tracking
    for (var ci = 0; ci < crews.length; ci++) {
      creditedByCrew[crews[ci]] = { mon: false, tue: false, wed: false, thu: false, fri: false, days: [] };
    }

    report.push('');
    report.push('--- Processing each JHA Log entry ---');

    for (var j = 1; j < Math.min(jhaData.length, 30); j++) { // Limit to first 30 for readability
      var jhaRow = jhaData[j];
      var dateCreated = jhaRow[1]; // Column B
      var jobNumber = String(jhaRow[2] || '').trim();
      var status = String(jhaRow[7] || '').trim(); // Column H
      var creditedTo = String(jhaRow[8] || '').trim(); // Column I

      if (!dateCreated) {
        skippedNoDate++;
        continue;
      }

      var jhaDate = new Date(dateCreated);
      jhaDate.setHours(12, 0, 0, 0); // Normalize to noon to avoid timezone issues
      var jhaDateStr = Utilities.formatDate(jhaDate, tz, 'MM/dd/yyyy');
      var dayOfWeek = jhaDate.getDay();
      var dayName = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][dayOfWeek];

      // Check if in week - use date comparison (ignoring time)
      var jhaDateOnly = new Date(jhaDate.getFullYear(), jhaDate.getMonth(), jhaDate.getDate());
      var weekStartOnly = new Date(weekBounds.weekStart.getFullYear(), weekBounds.weekStart.getMonth(), weekBounds.weekStart.getDate());
      var weekEndOnly = new Date(weekBounds.weekEnd.getFullYear(), weekBounds.weekEnd.getMonth(), weekBounds.weekEnd.getDate());

      var inWeek = (jhaDateOnly >= weekStartOnly && jhaDateOnly <= weekEndOnly);

      var rowInfo = 'Row ' + (j+1) + ': ' + jhaDateStr + ' (' + dayName + ') | Job=' + jobNumber +
                    ' | Status=' + status + ' | CreditedTo=' + creditedTo;

      if (!inWeek) {
        skippedOutsideWeek++;
        if (j <= 10) { // Only show first few skipped
          report.push(rowInfo + ' | ❌ OUTSIDE WEEK');
        }
        continue;
      }

      if (status !== 'Credited') {
        skippedNotCredited++;
        report.push(rowInfo + ' | ⚠️ Not Credited (status=' + status + ')');
        continue;
      }

      if (!creditedTo) {
        skippedNotCredited++;
        report.push(rowInfo + ' | ⚠️ No CreditedTo value');
        continue;
      }

      // Check if creditedTo is a tracked crew
      if (!crewSet[creditedTo]) {
        skippedCrewNotTracked++;
        report.push(rowInfo + ' | ⚠️ Crew "' + creditedTo + '" NOT in tracked crews list!');
        continue;
      }

      // Success - this entry should be credited
      matchedCount++;
      report.push(rowInfo + ' | ✅ IN WEEK, CREDITED');

      if (creditedByCrew[creditedTo]) {
        creditedByCrew[creditedTo].days.push(dayName);
        var dayKey = dayName.toLowerCase();
        if (creditedByCrew[creditedTo][dayKey] !== undefined) {
          creditedByCrew[creditedTo][dayKey] = true;
        }
      }
    }

    if (jhaData.length > 30) {
      report.push('... (showing first 30 rows only, ' + (jhaData.length - 30) + ' more)');
    }

    report.push('');
    report.push('=== SUMMARY ===');
    report.push('JHAs in current week (credited): ' + matchedCount);
    report.push('Skipped - outside week: ' + skippedOutsideWeek);
    report.push('Skipped - no date: ' + skippedNoDate);
    report.push('Skipped - not credited status: ' + skippedNotCredited);
    report.push('Skipped - crew not tracked: ' + skippedCrewNotTracked);

    report.push('');
    report.push('=== CREDITED STATUS BY CREW (Current Week) ===');
    var crewsWithCredits = 0;
    for (var crewJob in creditedByCrew) {
      var crewStatus = creditedByCrew[crewJob];
      var daysWithCredit = crewStatus.days.length;
      if (daysWithCredit > 0) {
        crewsWithCredits++;
        var statusStr = 'Days credited: ' + crewStatus.days.join(', ');
        report.push(crewJob + ': ' + statusStr);
      }
    }
    if (crewsWithCredits === 0) {
      report.push('(No crews have credited JHAs for this week)');
    }
  }

  // Show report
  var htmlReport = '<pre style="font-family: monospace; font-size: 11px; white-space: pre-wrap; max-height: 600px; overflow: auto;">' +
    report.join('\n').replace(/✅/g, '<span style="color:green">✅</span>')
                     .replace(/❌/g, '<span style="color:red">❌</span>')
                     .replace(/⚠️/g, '<span style="color:orange">⚠️</span>') +
    '</pre>';

  var html = HtmlService.createHtmlOutput(htmlReport)
    .setWidth(900)
    .setHeight(700)
    .setTitle('Compliance Calculation Trace');
  SpreadsheetApp.getUi().showModalDialog(html, 'Compliance Calculation Trace');
}

/**
 * Calculates Safety Compliance by reading from the log sheets
 * This is the NEW reliable method - reads from audit trail, not inline processing
 *
 * @param {Date} weekStartDate - Sunday of the week to calculate
 * @returns {Object} - Compliance data for updating Safety Compliance sheet
 */
function calculateComplianceFromLogs(weekStartDate) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var tz = Session.getScriptTimeZone();
  var weekBounds = getWeekBoundaries(weekStartDate);
  var weekStartStr = Utilities.formatDate(weekBounds.weekStart, tz, 'MM/dd/yyyy');
  var weekEndStr = Utilities.formatDate(weekBounds.weekEnd, tz, 'MM/dd/yyyy');
  var today = new Date();
  var isPastDeadline = today > weekBounds.weekEnd;

  Logger.log("calculateComplianceFromLogs: Calculating for week " + weekStartStr + " to " + weekEndStr);

  // Get all tracked crews
  var crews = getActiveCrews();
  if (crews.length === 0) {
    Logger.log("calculateComplianceFromLogs: No active crews found");
    return null;
  }

  // Load compliance config for skip days
  var config = loadComplianceConfig();

  // Initialize compliance state for each crew
  var crewCompliance = {};
  for (var c = 0; c < crews.length; c++) {
    var crewJob = crews[c];
    var crewConfig = config[crewJob] || {
      skipDays: [true, false, false, false, false, false, true], // Skip Sun/Sat by default
      skipWeeklyMeeting: false,
      skipMonthlyChecklist: false
    };

    crewCompliance[crewJob] = {
      foreman: '',
      jhaByDay: [false, false, false, false, false, false, false], // Sun-Sat
      jhaLateByDay: [false, false, false, false, false, false, false],
      weeklyMeeting: false,
      weeklyMeetingLate: false,
      monthlyChecklist: false,
      skipDays: crewConfig.skipDays,
      skipWeeklyMeeting: crewConfig.skipWeeklyMeeting,
      skipMonthlyChecklist: crewConfig.skipMonthlyChecklist,
      status: 'Complete'
    };

    // Get foreman name
    var foremanResult = lookupForemanByJobNumber(crewJob);
    if (foremanResult && foremanResult.name) {
      crewCompliance[crewJob].foreman = foremanResult.name;
    }
  }

  // Track unknown jobs
  var unknownJobs = {};

  // === READ JHA LOG ===
  var jhaSheet = getJHALogSheet();
  var jhaCreditsApplied = 0;
  var jhaRowsProcessed = 0;
  var jhaRowsSkippedOutsideWeek = 0;
  var jhaRowsSkippedNotCredited = 0;
  var jhaRowsSkippedCrewNotFound = 0;

  Logger.log("calculateComplianceFromLogs: Week bounds - Start: " + weekBounds.weekStart + ", End: " + weekBounds.weekEnd);
  Logger.log("calculateComplianceFromLogs: Tracked crews: " + crews.join(', '));

  if (jhaSheet && jhaSheet.getLastRow() > 1) {
    var jhaData = jhaSheet.getDataRange().getValues();
    Logger.log("calculateComplianceFromLogs: JHA Log has " + (jhaData.length - 1) + " rows");

    for (var j = 1; j < jhaData.length; j++) {
      var jhaRow = jhaData[j];
      var dateCreated = jhaRow[1]; // Column B - Date Created (JHA work date)
      var jobNumber = String(jhaRow[2] || '').trim();
      var status = String(jhaRow[7] || '').trim(); // Column H - Status
      var creditedTo = String(jhaRow[8] || '').trim(); // Column I - Credited To
      var notes = String(jhaRow[9] || '').trim(); // Column J - Notes

      if (!dateCreated) continue;
      jhaRowsProcessed++;

      var jhaDate = new Date(dateCreated);

      // Check if this JHA is within our week
      if (jhaDate < weekBounds.weekStart || jhaDate > weekBounds.weekEnd) {
        jhaRowsSkippedOutsideWeek++;
        continue;
      }

      // Check if this is a credited entry
      if (status !== 'Credited') {
        jhaRowsSkippedNotCredited++;
        continue;
      }

      if (!creditedTo) {
        jhaRowsSkippedNotCredited++;
        continue;
      }

      if (!crewCompliance[creditedTo]) {
        jhaRowsSkippedCrewNotFound++;
        Logger.log("calculateComplianceFromLogs: CREW NOT IN crewCompliance: " + creditedTo);
        continue;
      }

      // SUCCESS - this row should be credited
      var dayOfWeek = jhaDate.getDay(); // 0=Sun, 6=Sat
      crewCompliance[creditedTo].jhaByDay[dayOfWeek] = true;
      jhaCreditsApplied++;

      // Check if late
      if (notes && notes.indexOf('LATE') !== -1) {
        crewCompliance[creditedTo].jhaLateByDay[dayOfWeek] = true;
      }

      Logger.log("calculateComplianceFromLogs: ✓ Credited JHA to " + creditedTo + " for day " + dayOfWeek + " (row " + (j+1) + ")");
    }
  }

  Logger.log("calculateComplianceFromLogs: JHA Summary - " +
    "Processed: " + jhaRowsProcessed +
    ", Credits applied: " + jhaCreditsApplied +
    ", Skipped (outside week): " + jhaRowsSkippedOutsideWeek +
    ", Skipped (not credited): " + jhaRowsSkippedNotCredited +
    ", Skipped (crew not found): " + jhaRowsSkippedCrewNotFound);

  // === READ WEEKLY SAFETY LOG ===
  var weeklySheet = getWeeklySafetyLogSheet();
  if (weeklySheet && weeklySheet.getLastRow() > 1) {
    var weeklyData = weeklySheet.getDataRange().getValues();

    for (var w = 1; w < weeklyData.length; w++) {
      var weeklyRow = weeklyData[w];
      var weekOf = weeklyRow[1]; // Column B - Week Of
      var jobNumber = String(weeklyRow[2] || '').trim();
      var status = String(weeklyRow[6] || '').trim(); // Column G - Status
      var creditedTo = String(weeklyRow[7] || '').trim(); // Column H - Credited To
      var notes = String(weeklyRow[8] || '').trim(); // Column I - Notes

      if (!weekOf) continue;

      var meetingWeekDate = new Date(weekOf);

      // Check if this meeting is for our week
      // Meeting week should match (within 6 days of week start)
      var daysDiff = Math.abs((meetingWeekDate.getTime() - weekBounds.weekStart.getTime()) / (1000 * 60 * 60 * 24));
      if (daysDiff > 6) {
        continue;
      }

      if (status === 'Credited' && creditedTo && crewCompliance[creditedTo]) {
        crewCompliance[creditedTo].weeklyMeeting = true;

        if (notes && notes.indexOf('LATE') !== -1) {
          crewCompliance[creditedTo].weeklyMeetingLate = true;
        }

        Logger.log("calculateComplianceFromLogs: Credited Weekly Meeting to " + creditedTo);
      } else if (status === 'Unknown Job') {
        if (!unknownJobs[jobNumber]) {
          unknownJobs[jobNumber] = { reportTypes: [], dates: [], reason: 'Unknown Job' };
        }
        if (unknownJobs[jobNumber].reportTypes.indexOf('Safety Meeting') === -1) {
          unknownJobs[jobNumber].reportTypes.push('Safety Meeting');
        }
      }
    }
  }

  // === READ MONTHLY CHECKLIST LOG ===
  var monthlySheet = getMonthlyChecklistLogSheet();
  var monthStart = new Date(weekBounds.weekStart.getFullYear(), weekBounds.weekStart.getMonth(), 1);
  var monthEnd = new Date(weekBounds.weekStart.getFullYear(), weekBounds.weekStart.getMonth() + 1, 0, 23, 59, 59);

  if (monthlySheet && monthlySheet.getLastRow() > 1) {
    var monthlyData = monthlySheet.getDataRange().getValues();

    for (var m = 1; m < monthlyData.length; m++) {
      var monthlyRow = monthlyData[m];
      var reportDate = monthlyRow[1]; // Column B - Report Date
      var status = String(monthlyRow[7] || '').trim(); // Column H - Status
      var creditedTo = String(monthlyRow[8] || '').trim(); // Column I - Credited To

      if (!reportDate) continue;

      var checklistDate = new Date(reportDate);

      // Check if this checklist is within our month
      if (checklistDate < monthStart || checklistDate > monthEnd) {
        continue;
      }

      if (status === 'Credited' && creditedTo && crewCompliance[creditedTo]) {
        crewCompliance[creditedTo].monthlyChecklist = true;
        Logger.log("calculateComplianceFromLogs: Credited Monthly Checklist to " + creditedTo);
      }
    }
  }

  // === CALCULATE STATUS FOR EACH CREW ===
  var compliantCount = 0;
  var missingCount = 0;
  var dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  for (var crewJob in crewCompliance) {
    var crew = crewCompliance[crewJob];
    var missingItems = [];
    var lateCount = 0;

    // Build day status
    crew.days = {};
    for (var d = 0; d < 7; d++) {
      if (crew.skipDays[d]) {
        crew.days[dayNames[d]] = 'N/A';
      } else if (crew.jhaByDay[d]) {
        if (crew.jhaLateByDay[d]) {
          crew.days[dayNames[d]] = '✅L';
          lateCount++;
        } else {
          crew.days[dayNames[d]] = '✅';
        }
      } else {
        if (isPastDeadline) {
          crew.days[dayNames[d]] = '❌';
          missingItems.push('JHA (' + dayNames[d] + ')');
        } else {
          crew.days[dayNames[d]] = '⏳';
        }
      }
    }

    // Weekly meeting status
    if (crew.skipWeeklyMeeting) {
      crew.weeklyMeetingStatus = 'N/A';
    } else if (crew.weeklyMeeting) {
      crew.weeklyMeetingStatus = crew.weeklyMeetingLate ? '✅L' : '✅';
      if (crew.weeklyMeetingLate) lateCount++;
    } else {
      if (isPastDeadline) {
        crew.weeklyMeetingStatus = '❌';
        missingItems.push('Weekly Meeting');
      } else {
        crew.weeklyMeetingStatus = '⏳';
      }
    }

    // Monthly checklist status (progressive deadline)
    var monthlyStatus = getMonthlyChecklistStatus(
      weekBounds.weekStart,
      crew.monthlyChecklist,
      crew.skipMonthlyChecklist,
      null
    );
    crew.monthlyChecklistStatus = monthlyStatus.status;

    if (monthlyStatus.affectsStatus && monthlyStatus.shouldCreateTask) {
      missingItems.push('Monthly Checklist');
    }

    // Determine overall status
    if (missingItems.length > 0) {
      crew.status = 'Missing Reports';
      missingCount++;
    } else if (!isPastDeadline && (
      crew.days['Mon'] === '⏳' || crew.days['Tue'] === '⏳' ||
      crew.days['Wed'] === '⏳' || crew.days['Thu'] === '⏳' ||
      crew.days['Fri'] === '⏳' || crew.weeklyMeetingStatus === '⏳')) {
      crew.status = 'Pending';
    } else {
      crew.status = 'Complete';
      compliantCount++;
    }

    crew.missingItems = missingItems;
    crew.lateCount = lateCount;
  }

  // Build result object
  var result = {
    weekStart: weekBounds.weekStart,
    weekEnd: weekBounds.weekEnd,
    isPastDeadline: isPastDeadline,
    totalCrews: crews.length,
    compliantCount: compliantCount,
    missingCount: missingCount,
    crews: crewCompliance,
    uncreditedJobs: []
  };

  // Convert unknown jobs to array
  for (var uj in unknownJobs) {
    result.uncreditedJobs.push({
      jobNumber: uj,
      reportTypes: unknownJobs[uj].reportTypes,
      dates: unknownJobs[uj].dates,
      reason: unknownJobs[uj].reason
    });
  }

  Logger.log("calculateComplianceFromLogs: Complete - " + compliantCount + " compliant, " +
    missingCount + " missing, " + result.uncreditedJobs.length + " unknown jobs");

  return result;
}

/**
 * Updates the Safety Compliance sheet from calculated compliance data
 * This is the same updateComplianceSheet but called with data from calculateComplianceFromLogs
 *
 * @param {Object} complianceData - From calculateComplianceFromLogs()
 */
function updateComplianceSheetFromLogs(complianceData) {
  if (!complianceData || !complianceData.crews) {
    Logger.log("updateComplianceSheetFromLogs: No compliance data");
    return;
  }

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SAFETY_COMPLIANCE_SHEET_NAME);

  if (!sheet) {
    sheet = setupSafetyComplianceSheet();
  }

  var tz = Session.getScriptTimeZone();
  var weekStartStr = Utilities.formatDate(complianceData.weekStart, tz, 'MM/dd/yyyy');
  var nowStr = Utilities.formatDate(new Date(), tz, 'MM/dd/yyyy HH:mm');

  // Read existing data to find rows to update
  var data = sheet.getDataRange().getValues();
  var existingRows = {};

  for (var i = 1; i < data.length; i++) {
    var rowWeek = data[i][0];
    var rowJob = String(data[i][1] || '').trim();
    var rowStatus = String(data[i][12] || '').trim();

    if (rowWeek && rowJob) {
      var rowWeekStr = Utilities.formatDate(new Date(rowWeek), tz, 'MM/dd/yyyy');
      if (rowWeekStr === weekStartStr) {
        existingRows[rowJob] = {
          rowNum: i + 1,
          status: rowStatus
        };
      }
    }
  }

  var updated = 0;
  var added = 0;

  for (var crewJob in complianceData.crews) {
    var crew = complianceData.crews[crewJob];

    // Skip if already resolved
    if (existingRows[crewJob] && existingRows[crewJob].status === 'Resolved') {
      Logger.log("updateComplianceSheetFromLogs: Skipping resolved crew " + crewJob);
      continue;
    }

    var rowData = [
      weekStartStr,
      crewJob,
      crew.foreman,
      crew.days['Sun'] || 'N/A',
      crew.days['Mon'] || '⏳',
      crew.days['Tue'] || '⏳',
      crew.days['Wed'] || '⏳',
      crew.days['Thu'] || '⏳',
      crew.days['Fri'] || '⏳',
      crew.days['Sat'] || 'N/A',
      crew.weeklyMeetingStatus || '⏳',
      crew.monthlyChecklistStatus || '⏳',
      crew.status,
      nowStr
    ];

    if (existingRows[crewJob]) {
      sheet.getRange(existingRows[crewJob].rowNum, 1, 1, rowData.length).setValues([rowData]);
      updated++;
    } else {
      sheet.appendRow(rowData);
      added++;
    }
  }

  Logger.log("updateComplianceSheetFromLogs: Updated " + updated + ", Added " + added + " rows");
}

/**
 * Logs a parsed safety email to the appropriate log sheet based on report type
 * This is the central function for Option B - every email gets logged here
 *
 * @param {Object} parsed - Result from parseSafetyEmail()
 * @param {GmailMessage} message - The Gmail message object
 * @param {Object} context - Resolution context with trackedCrews, customMappings
 * @returns {Object} - { logged: boolean, status: string, creditedTo: string|null, logSheet: string }
 */
function logParsedSafetyEmail(parsed, message, context) {
  if (!parsed || !parsed.reportMeta) {
    return { logged: false, status: 'Error', error: 'No parsed data' };
  }

  var meta = parsed.reportMeta;
  var reportType = meta.reportType || 'Unknown';
  var jobNumber = meta.jobNumber || '';
  var messageId = message.getId();
  var receivedDate = message.getDate();
  var subject = message.getSubject();

  // Resolve job to tracked crew
  var resolution = resolveJobToCrew(jobNumber, context);

  var status = resolution.found ? 'Credited' : 'Unknown Job';
  var creditedTo = resolution.found ? resolution.crew : '';
  var foreman = resolution.foreman || meta.foreman || 'UNKNOWN';
  var notes = resolution.found ? resolution.reason : (resolution.reason || 'Could not resolve to tracked crew');

  // Check for late submission
  if (meta.date && meta.receivedDate) {
    var isLate = isReportLate(meta.date, meta.receivedDate);
    if (isLate) {
      notes = (notes ? notes + '. ' : '') + 'LATE SUBMISSION';
    }
  }

  // Add date source info
  if (meta.dateSource) {
    notes = (notes ? notes + '. ' : '') + 'Date from: ' + meta.dateSource;
  }

  // If user skipped this job, mark it appropriately
  if (parsed.skippedReason) {
    status = 'Skipped';
    notes = parsed.skippedReason;
  }

  var result = { logged: false, status: status, creditedTo: creditedTo };

  // Log to appropriate sheet based on report type
  if (reportType === 'JHA' || reportType.indexOf('Job Hazard') !== -1) {
    // Handle multiple JHAs per email
    var datesToProcess = [];
    if (meta.multipleJHADates && meta.multipleJHADates.length > 0) {
      datesToProcess = meta.multipleJHADates;
    } else if (meta.date) {
      datesToProcess = [meta.date];
    }

    // Log each JHA date separately
    for (var i = 0; i < datesToProcess.length; i++) {
      var jhaDate = datesToProcess[i];
      var logNotes = notes;
      if (datesToProcess.length > 1) {
        logNotes = (logNotes ? logNotes + '. ' : '') + 'JHA ' + (i + 1) + ' of ' + datesToProcess.length + ' in email';
      }

      // Check late for this specific date
      var jhaIsLate = isReportLate(jhaDate, receivedDate);
      if (jhaIsLate && logNotes.indexOf('LATE') === -1) {
        logNotes = (logNotes ? logNotes + '. ' : '') + 'LATE SUBMISSION';
      }

      var logResult = logJHAEmail({
        dateReceived: receivedDate,
        dateCreated: jhaDate,
        jobNumber: jobNumber,
        foreman: foreman,
        emailSubject: subject,
        emailId: messageId + (datesToProcess.length > 1 ? '_' + i : ''), // Unique ID for multiple JHAs
        source: meta.dateSource || 'Subject',
        status: status,
        creditedTo: creditedTo,
        notes: logNotes
      });

      if (logResult.success) {
        result.logged = true;
        result.logSheet = JHA_LOG_SHEET_NAME;
      }
    }

  } else if (reportType === 'Safety Meeting' || reportType.indexOf('Safety Meeting') !== -1) {
    var logResult = logWeeklySafetyEmail({
      dateReceived: receivedDate,
      weekOf: meta.date,
      jobNumber: jobNumber,
      foreman: foreman,
      emailSubject: subject,
      emailId: messageId,
      status: status,
      creditedTo: creditedTo,
      notes: notes
    });

    if (logResult.success) {
      result.logged = true;
      result.logSheet = WEEKLY_SAFETY_LOG_SHEET_NAME;
    } else if (logResult.duplicate) {
      result.status = 'Duplicate';
    }

  } else if (reportType === 'Fleet Checklist' || reportType === 'Safety Checklist') {
    var hasEquipmentIssues = parsed.issues && parsed.issues.length > 0;

    var logResult = logMonthlyChecklistEmail({
      dateReceived: receivedDate,
      reportDate: meta.date,
      jobNumber: jobNumber,
      foreman: foreman,
      vehicleNumber: meta.vehicleNumber || '',
      emailSubject: subject,
      emailId: messageId,
      status: status,
      creditedTo: creditedTo,
      hasEquipmentIssues: hasEquipmentIssues,
      notes: notes
    });

    if (logResult.success) {
      result.logged = true;
      result.logSheet = MONTHLY_CHECKLIST_LOG_SHEET_NAME;
    } else if (logResult.duplicate) {
      result.status = 'Duplicate';
    }
  }

  return result;
}

/**
 * Recalculates compliance from log sheets and updates Safety Compliance sheet
 * Menu function: Glove Manager → Safety → Recalculate Compliance
 */
function recalculateComplianceFromLogs() {
  var ui = SpreadsheetApp.getUi();

  try {
    var today = new Date();
    var currentWeek = getWeekBoundaries(today);
    var previousWeek = getWeekBoundaries(new Date(currentWeek.weekStart.getTime() - 7 * 24 * 60 * 60 * 1000));

    // Calculate for previous week (past deadline - can create tasks)
    Logger.log("recalculateComplianceFromLogs: Processing previous week");
    var prevData = calculateComplianceFromLogs(previousWeek.weekStart);
    if (prevData) {
      updateComplianceSheetFromLogs(prevData);
      createMissingReportTasks(prevData);
    }

    // Calculate for current week
    Logger.log("recalculateComplianceFromLogs: Processing current week");
    var currData = calculateComplianceFromLogs(currentWeek.weekStart);
    if (currData) {
      updateComplianceSheetFromLogs(currData);
    }

    // Format the sheet
    formatComplianceSheetByWeek();

    var msg = '✅ Compliance recalculated from log sheets!\n\n';
    if (prevData) {
      msg += 'Previous week: ' + prevData.compliantCount + ' compliant, ' + prevData.missingCount + ' missing\n';
    }
    if (currData) {
      msg += 'Current week: ' + currData.compliantCount + ' compliant, ' + currData.missingCount + ' missing';
    }

    ui.alert('Compliance Recalculated', msg, ui.ButtonSet.OK);

  } catch (e) {
    Logger.log("recalculateComplianceFromLogs error: " + e.toString());
    ui.alert('Error', 'Failed to recalculate compliance: ' + e.toString(), ui.ButtonSet.OK);
  }
}

/**
 * Opens the JHA Log sheet
 * Menu function
 */
function openJHALogSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = getJHALogSheet();
  ss.setActiveSheet(sheet);
}

/**
 * Opens the Weekly Safety Log sheet
 * Menu function
 */
function openWeeklySafetyLogSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = getWeeklySafetyLogSheet();
  ss.setActiveSheet(sheet);
}

/**
 * Opens the Monthly Checklist Log sheet
 * Menu function
 */
function openMonthlyChecklistLogSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = getMonthlyChecklistLogSheet();
  ss.setActiveSheet(sheet);
}

// ============================================================================
// ============================================================================
// DIAGNOSTIC TOOLS
// ============================================================================

/**
 * Comprehensive diagnostic tool for safety compliance issues
 * Checks: Email parsing, job resolution, log writing, compliance calculation
 * Menu function: Glove Manager → Safety → 🔍 Diagnose Compliance
 */
function diagnoseSafetyCompliance() {
  var ui = SpreadsheetApp.getUi();
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  var report = [];
  report.push('========================================');
  report.push('SAFETY COMPLIANCE DIAGNOSTIC REPORT');
  report.push('Generated: ' + new Date().toLocaleString());
  report.push('========================================\n');

  // 1. Check Log Sheets Exist
  report.push('=== 1. LOG SHEETS STATUS ===');
  var jhaLog = ss.getSheetByName('JHA Log');
  var weeklyLog = ss.getSheetByName('Weekly Safety Log');
  var monthlyLog = ss.getSheetByName('Monthly Checklist Log');

  report.push('JHA Log: ' + (jhaLog ? '✅ Exists (' + (jhaLog.getLastRow() - 1) + ' records)' : '❌ MISSING'));
  report.push('Weekly Safety Log: ' + (weeklyLog ? '✅ Exists (' + (weeklyLog.getLastRow() - 1) + ' records)' : '❌ MISSING'));
  report.push('Monthly Checklist Log: ' + (monthlyLog ? '✅ Exists (' + (monthlyLog.getLastRow() - 1) + ' records)' : '❌ MISSING'));

  if (!jhaLog || !weeklyLog || !monthlyLog) {
    report.push('\n⚠️ Missing log sheets! Run "Setup Log Sheets" from Safety menu.');
  }

  // 2. Check Recent JHA Log Entries
  report.push('\n=== 2. RECENT JHA LOG ENTRIES (Last 10) ===');
  if (jhaLog && jhaLog.getLastRow() > 1) {
    // Read all 10 columns: A=DateRecv, B=DateCreated, C=Job, D=Foreman, E=Subject, F=EmailID, G=Source, H=Status, I=CreditedTo, J=Notes
    var jhaData = jhaLog.getRange(2, 1, Math.min(10, jhaLog.getLastRow() - 1), 10).getValues();
    for (var i = 0; i < jhaData.length; i++) {
      var row = jhaData[i];
      // row[7]=Status (H), row[8]=CreditedTo (I)
      report.push('  ' + (i + 1) + '. Job: ' + row[2] + ' | Foreman: ' + row[3] + ' | Status: ' + row[7] + ' | CreditedTo: ' + row[8]);
    }

    // Add raw column data analysis for first 3 rows
    report.push('\n  --- RAW COLUMN DATA (First 3 rows for debugging) ---');
    for (var r = 0; r < Math.min(3, jhaData.length); r++) {
      var row = jhaData[r];
      report.push('  Row ' + (r + 1) + ':');
      report.push('    A (DateRecv): ' + row[0]);
      report.push('    B (DateCreated): ' + row[1]);
      report.push('    C (Job): ' + row[2]);
      report.push('    D (Foreman): ' + row[3]);
      report.push('    E (Subject): ' + String(row[4]).substring(0, 50) + '...');
      report.push('    F (EmailID): ' + row[5]);
      report.push('    G (Source): ' + row[6]);
      report.push('    H (Status): ' + row[7]);
      report.push('    I (CreditedTo): ' + row[8]);
      report.push('    J (Notes): ' + String(row[9]).substring(0, 50) + '...');
    }
  } else {
    report.push('  No JHA log entries found.');
  }

  // 3. Check Safety Compliance Sheet
  report.push('\n=== 3. SAFETY COMPLIANCE SHEET ===');
  var compSheet = ss.getSheetByName('Safety Compliance');
  if (compSheet) {
    var compRows = compSheet.getLastRow() - 1;
    report.push('Total rows: ' + compRows);

    // Check current week
    var today = new Date();
    var weekBounds = getWeekBoundaries(today);
    var weekKey = Utilities.formatDate(weekBounds.weekStart, Session.getScriptTimeZone(), 'MM/dd/yyyy');

    report.push('Current week start: ' + weekKey);

    var compData = compSheet.getDataRange().getValues();
    var currentWeekRows = 0;
    var crewsThisWeek = [];
    for (var j = 1; j < compData.length; j++) {
      var rowWeek = compData[j][0];
      if (rowWeek instanceof Date) {
        rowWeek = Utilities.formatDate(rowWeek, Session.getScriptTimeZone(), 'MM/dd/yyyy');
      }
      if (String(rowWeek) === weekKey) {
        currentWeekRows++;
        crewsThisWeek.push(compData[j][1]); // Job Number column
      }
    }
    report.push('Rows for current week: ' + currentWeekRows);
    if (crewsThisWeek.length > 0) {
      report.push('Crews tracked this week: ' + crewsThisWeek.join(', '));
    }
  } else {
    report.push('❌ Safety Compliance sheet not found!');
  }

  // 4. Check Tracked Crews Configuration
  report.push('\n=== 4. TRACKED CREWS (from Employee sheet) ===');
  try {
    // Use getActiveCrews() which validates job number format
    var activeCrews = getActiveCrews();
    report.push('Total tracked crews: ' + activeCrews.length);

    // Show each crew with foreman and size
    for (var ac = 0; ac < Math.min(15, activeCrews.length); ac++) {
      var crewNum = activeCrews[ac];
      var crewLead = getCrewLead(crewNum);
      var crewSize = getCrewSize(crewNum);
      var foremanName = crewLead ? crewLead.name : 'NOT FOUND';
      report.push('  ' + crewNum + ': Foreman=' + foremanName + ', Size=' + crewSize);
    }
    if (activeCrews.length > 15) {
      report.push('  ... and ' + (activeCrews.length - 15) + ' more');
    }
  } catch (e) {
    report.push('Error getting tracked crews: ' + e.toString());
  }

  // 5. Test Email Parsing (last 3 JHA emails)
  report.push('\n=== 5. RECENT JHA EMAIL PARSING TEST ===');
  try {
    var threads = GmailApp.search('subject:"Job Hazard Report"', 0, 3);
    report.push('Found ' + threads.length + ' recent JHA email threads');

    for (var t = 0; t < threads.length; t++) {
      var messages = threads[t].getMessages();
      var msg = messages[0];
      var subject = msg.getSubject();
      report.push('\n  Email ' + (t + 1) + ':');
      report.push('    Subject: ' + subject.substring(0, 80) + '...');

      // Try to extract job number
      var jobMatch = subject.match(/_(\d{3}-\d{2})_/);
      if (jobMatch) {
        report.push('    Extracted Job: ' + jobMatch[1]);
      } else {
        report.push('    ⚠️ Could not extract job number from subject');
      }

      // Try to extract date
      var dateMatch = subject.match(/(\d{2})-(\d{2})-(\d{4})/);
      if (dateMatch) {
        report.push('    Extracted Date: ' + dateMatch[0]);
      } else {
        report.push('    ⚠️ Could not extract date from subject');
      }
    }
  } catch (e) {
    report.push('Error accessing Gmail: ' + e.toString());
  }

  // 6. Check Custom Job Mappings
  report.push('\n=== 6. CUSTOM JOB MAPPINGS ===');
  try {
    var customMappings = JSON.parse(PropertiesService.getScriptProperties().getProperty('CUSTOM_JOB_FOREMAN_MAPPINGS') || '{}');
    var mapKeys = Object.keys(customMappings);
    report.push('Custom mappings saved: ' + mapKeys.length);
    for (var m = 0; m < mapKeys.length; m++) {
      report.push('  ' + mapKeys[m] + ' → ' + customMappings[mapKeys[m]]);
    }
  } catch (e) {
    report.push('Error reading custom mappings: ' + e.toString());
  }

  // 7. Test Job Resolution for Known Jobs
  report.push('\n=== 7. JOB RESOLUTION TEST ===');
  try {
    var crews = getActiveCrews();
    var trackedCrews = {};
    for (var ci = 0; ci < crews.length; ci++) {
      trackedCrews[crews[ci]] = true;
    }
    var customMappingsForTest = getCustomJobForemanMappings() || {};
    var empSheet = ss.getSheetByName('Employees');
    var employeeData = empSheet ? empSheet.getDataRange().getValues() : [];

    var testContext = {
      trackedCrews: trackedCrews,
      customMappings: customMappingsForTest,
      employeeData: employeeData
    };

    // Test a few job numbers from the JHA log
    var testJobs = ['013-26', '029-26', '016-26', '022-26', '041-26'];
    for (var tj = 0; tj < testJobs.length; tj++) {
      var testJob = testJobs[tj];
      var resolution = resolveJobToCrew(testJob, testContext);
      report.push('  ' + testJob + ' → found: ' + resolution.found + ', crew: ' + resolution.crew + ', source: ' + resolution.source);
      if (!resolution.found) {
        report.push('    ⚠️ Reason: ' + resolution.reason);
      }
    }
  } catch (e) {
    report.push('Error testing job resolution: ' + e.toString());
  }

  // Show report
  var htmlReport = '<pre style="font-family: monospace; font-size: 12px; white-space: pre-wrap;">' +
    report.join('\n').replace(/✅/g, '<span style="color:green">✅</span>')
                     .replace(/❌/g, '<span style="color:red">❌</span>')
                     .replace(/⚠️/g, '<span style="color:orange">⚠️</span>') +
    '</pre>';

  var htmlOutput = HtmlService.createHtmlOutput(htmlReport)
    .setWidth(800)
    .setHeight(600);
  ui.showModalDialog(htmlOutput, '🔍 Safety Compliance Diagnostic Report');

  Logger.log(report.join('\n'));
}

/**
 * Test parsing a single email by subject line pattern
 * Opens a dialog to test email parsing without processing
 */
function testEmailParsing() {
  var ui = SpreadsheetApp.getUi();

  var response = ui.prompt(
    'Test Email Parsing',
    'Enter search query (e.g., "Job Hazard Report 009-26" or "Safety Meeting 015-26"):',
    ui.ButtonSet.OK_CANCEL
  );

  if (response.getSelectedButton() !== ui.Button.OK) return;

  var query = response.getResponseText().trim();
  if (!query) return;

  var report = [];
  report.push('=== EMAIL PARSING TEST ===');
  report.push('Query: ' + query);
  report.push('');

  try {
    var threads = GmailApp.search('subject:"' + query + '"', 0, 5);
    report.push('Found ' + threads.length + ' threads\n');

    for (var t = 0; t < threads.length; t++) {
      var messages = threads[t].getMessages();
      for (var m = 0; m < messages.length; m++) {
        var msg = messages[m];
        var subject = msg.getSubject();
        var receivedDate = msg.getDate();

        report.push('--- Message ' + (t + 1) + '.' + (m + 1) + ' ---');
        report.push('Subject: ' + subject);
        report.push('Received: ' + receivedDate.toLocaleString());

        // Test parsing
        var parsedData = parseSafetyEmail(msg, {});
        if (parsedData) {
          report.push('Parsed Report Type: ' + parsedData.reportType);
          report.push('Parsed Job Number: ' + parsedData.jobNumber);
          report.push('Parsed Report Date: ' + parsedData.reportDate);
          report.push('Parsed Foreman: ' + parsedData.foreman);
          if (parsedData.skippedReason) {
            report.push('⚠️ Skipped: ' + parsedData.skippedReason);
          }
        } else {
          report.push('❌ parseSafetyEmail returned null');
        }
        report.push('');
      }
    }
  } catch (e) {
    report.push('Error: ' + e.toString());
  }

  var htmlReport = '<pre style="font-family: monospace; font-size: 12px; white-space: pre-wrap;">' +
    report.join('\n') + '</pre>';

  var htmlOutput = HtmlService.createHtmlOutput(htmlReport)
    .setWidth(700)
    .setHeight(500);
  ui.showModalDialog(htmlOutput, '🔬 Email Parsing Test Results');
}

/**
 * Check why a specific crew is not getting credited
 */
function diagnoseCrewCompliance() {
  var ui = SpreadsheetApp.getUi();

  var response = ui.prompt(
    'Diagnose Crew Compliance',
    'Enter job number (e.g., "009-26"):',
    ui.ButtonSet.OK_CANCEL
  );

  if (response.getSelectedButton() !== ui.Button.OK) return;

  var jobNum = response.getResponseText().trim();
  if (!jobNum) return;

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var report = [];
  report.push('=== CREW COMPLIANCE DIAGNOSIS: ' + jobNum + ' ===\n');

  // 1. Check if crew exists in Employees
  var empSheet = ss.getSheetByName('Employees');
  var empData = empSheet.getDataRange().getValues();
  var crewMembers = [];
  var foreman = null;

  for (var i = 1; i < empData.length; i++) {
    var empJob = String(empData[i][3] || '').trim();
    if (empJob.startsWith(jobNum)) {
      crewMembers.push({
        name: empData[i][0],
        job: empJob,
        classification: empData[i][4]
      });
      if (empData[i][4] === 'F' || empData[i][4] === 'GTO F') {
        foreman = empData[i][0];
      }
    }
  }

  report.push('1. EMPLOYEE SHEET:');
  report.push('   Crew members found: ' + crewMembers.length);
  report.push('   Foreman: ' + (foreman || '❌ NOT FOUND'));
  if (crewMembers.length > 0) {
    for (var j = 0; j < crewMembers.length; j++) {
      report.push('   - ' + crewMembers[j].name + ' (' + crewMembers[j].classification + ') - ' + crewMembers[j].job);
    }
  }

  // 2. Check JHA Log for this crew
  report.push('\n2. JHA LOG ENTRIES:');
  var jhaLog = ss.getSheetByName('JHA Log');
  if (jhaLog && jhaLog.getLastRow() > 1) {
    var jhaData = jhaLog.getDataRange().getValues();
    var jhaEntries = [];
    for (var k = 1; k < jhaData.length; k++) {
      if (String(jhaData[k][2]).indexOf(jobNum) !== -1 || String(jhaData[k][5]).indexOf(jobNum) !== -1) {
        jhaEntries.push({
          received: jhaData[k][0],
          created: jhaData[k][1],
          job: jhaData[k][2],
          foreman: jhaData[k][3],
          status: jhaData[k][4],
          creditedTo: jhaData[k][5]
        });
      }
    }
    report.push('   Found ' + jhaEntries.length + ' JHA entries');
    for (var e = 0; e < jhaEntries.length; e++) {
      var entry = jhaEntries[e];
      report.push('   - Date: ' + entry.created + ' | Status: ' + entry.status + ' | CreditedTo: ' + entry.creditedTo);
    }
  } else {
    report.push('   ❌ JHA Log not found or empty');
  }

  // 3. Check Safety Compliance sheet
  report.push('\n3. SAFETY COMPLIANCE SHEET:');
  var compSheet = ss.getSheetByName('Safety Compliance');
  if (compSheet && compSheet.getLastRow() > 1) {
    var compData = compSheet.getDataRange().getValues();
    var compEntries = [];
    for (var c = 1; c < compData.length; c++) {
      if (String(compData[c][1]).indexOf(jobNum) !== -1) {
        compEntries.push({
          week: compData[c][0],
          job: compData[c][1],
          foreman: compData[c][2],
          status: compData[c][11],
          mon: compData[c][3],
          tue: compData[c][4],
          wed: compData[c][5],
          thu: compData[c][6],
          fri: compData[c][7]
        });
      }
    }
    report.push('   Found ' + compEntries.length + ' compliance rows');
    for (var r = 0; r < compEntries.length; r++) {
      var row = compEntries[r];
      report.push('   - Week: ' + row.week + ' | Status: ' + row.status);
      report.push('     M:' + row.mon + ' T:' + row.tue + ' W:' + row.wed + ' Th:' + row.thu + ' F:' + row.fri);
    }
  } else {
    report.push('   ❌ Safety Compliance sheet not found or empty');
  }

  // 4. Check for recent Gmail
  report.push('\n4. GMAIL SEARCH (last 7 days):');
  try {
    var threads = GmailApp.search('subject:"Job Hazard Report" subject:"' + jobNum + '" newer_than:7d', 0, 10);
    report.push('   Found ' + threads.length + ' JHA email threads');
    for (var g = 0; g < threads.length; g++) {
      var gmsg = threads[g].getMessages()[0];
      report.push('   - ' + gmsg.getDate().toLocaleDateString() + ': ' + gmsg.getSubject().substring(0, 60) + '...');
    }
  } catch (e) {
    report.push('   Error searching Gmail: ' + e.toString());
  }

  var htmlReport = '<pre style="font-family: monospace; font-size: 12px; white-space: pre-wrap;">' +
    report.join('\n') + '</pre>';

  var htmlOutput = HtmlService.createHtmlOutput(htmlReport)
    .setWidth(800)
    .setHeight(600);
  ui.showModalDialog(htmlOutput, '🔍 Crew Compliance Diagnosis: ' + jobNum);
}

// ============================================================================
// MIGRATION FUNCTIONS
// ============================================================================

/**
 * Gets the Safety Equipment sheet, checking both new and old names
 * @returns {Sheet|null} The sheet or null if not found
 */
function getSafetyEquipmentSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SAFETY_EQUIPMENT_SHEET_NAME);
  if (!sheet) {
    // Try old name for backward compatibility
    sheet = ss.getSheetByName(SAFETY_EQUIPMENT_SHEET_OLD_NAME);
  }
  return sheet;
}

/**
 * Migrates the Safety Reports sheet to Safety Equipment Needs
 * Safe to run multiple times - only renames if old name exists
 * Menu function: Glove Manager → Safety → Migrate Safety Reports Sheet
 */
function migrateSafetyReportsToEquipmentNeeds() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var oldSheet = ss.getSheetByName(SAFETY_EQUIPMENT_SHEET_OLD_NAME);
  var newSheet = ss.getSheetByName(SAFETY_EQUIPMENT_SHEET_NAME);

  if (newSheet) {
    SpreadsheetApp.getUi().alert('✅ Already Migrated',
      '"Safety Equipment Needs" sheet already exists.\n\nNo migration needed.',
      SpreadsheetApp.getUi().ButtonSet.OK);
    return;
  }

  if (!oldSheet) {
    SpreadsheetApp.getUi().alert('ℹ️ No Sheet Found',
      'Neither "Safety Reports" nor "Safety Equipment Needs" sheet exists.\n\nRun "Setup Safety Equipment Sheet" to create one.',
      SpreadsheetApp.getUi().ButtonSet.OK);
    return;
  }

  // Rename the sheet
  oldSheet.setName(SAFETY_EQUIPMENT_SHEET_NAME);

  // Clean up any "No Issues" compliance records (they belong in Safety Compliance, not here)
  var data = oldSheet.getDataRange().getValues();
  var rowsToDelete = [];
  for (var i = data.length - 1; i >= 1; i--) {
    var equipType = String(data[i][5] || '').trim(); // Column F = Equipment Type
    if (equipType === 'No Issues') {
      rowsToDelete.push(i + 1);
    }
  }

  // Delete from bottom to top
  for (var r = 0; r < rowsToDelete.length; r++) {
    oldSheet.deleteRow(rowsToDelete[r]);
  }

  SpreadsheetApp.getUi().alert('✅ Migration Complete',
    '"Safety Reports" has been renamed to "Safety Equipment Needs".\n\n' +
    'Removed ' + rowsToDelete.length + ' "No Issues" compliance records.\n\n' +
    'The sheet now only contains actual equipment issues that need attention.',
    SpreadsheetApp.getUi().ButtonSet.OK);

  Logger.log("migrateSafetyReportsToEquipmentNeeds: Renamed sheet, removed " + rowsToDelete.length + " No Issues rows");
}

// ============================================================================
// UNIFIED JOB RESOLUTION
// ============================================================================

/**
 * Unified function to resolve a job number to its tracked crew
 * Consolidates all the job→foreman→primary crew logic in one place
 *
 * @param {string} jobNumber - Job number to resolve (e.g., "013-26", "054-26.1")
 * @param {Object} context - Context object with cached lookups (optional)
 *   - customMappings: Custom job→foreman mappings from dialog
 *   - employeeData: Cached Employees sheet data
 *   - trackedCrews: Set of tracked crew job numbers
 * @returns {Object} Resolution result:
 *   - found: boolean - Whether the job resolved to a tracked crew
 *   - crew: string - The tracked crew job number (or null)
 *   - foreman: string - Foreman name (or null)
 *   - source: string - How it was resolved ('direct', 'custom', 'primary', 'secondary', 'notfound')
 *   - reason: string - Human-readable explanation
 */
function resolveJobToCrew(jobNumber, context) {
  context = context || {};
  var customMappings = context.customMappings || {};
  var trackedCrews = context.trackedCrews || {};

  if (!jobNumber) {
    return { found: false, crew: null, foreman: null, source: 'invalid', reason: 'No job number provided' };
  }

  // Extract base job (remove position suffix like .1, .2)
  var baseJob = String(jobNumber).split('.')[0].trim();

  // 1. Check if job is directly a tracked crew
  if (trackedCrews[baseJob]) {
    var directForeman = lookupForemanByJobNumber(baseJob);
    return {
      found: true,
      crew: baseJob,
      foreman: directForeman.name || '',
      source: 'direct',
      reason: 'Job is a tracked crew'
    };
  }

  // 2. Check custom mappings (user-configured from dialog)
  if (customMappings[baseJob]) {
    var customForeman = customMappings[baseJob];
    // Find this foreman's primary crew
    var primaryCrew = findForemanPrimaryCrew(customForeman, context.employeeData);
    if (primaryCrew && trackedCrews[primaryCrew]) {
      return {
        found: true,
        crew: primaryCrew,
        foreman: customForeman,
        source: 'custom',
        reason: 'Custom mapping: ' + baseJob + ' → ' + customForeman + ' (primary: ' + primaryCrew + ')'
      };
    } else {
      return {
        found: false,
        crew: null,
        foreman: customForeman,
        source: 'custom_no_primary',
        reason: 'Custom mapping found foreman ' + customForeman + ' but no tracked primary crew'
      };
    }
  }

  // 3. Search Employees sheet for this job (primary or secondary)
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var empSheet = ss.getSheetByName('Employees');
  if (!empSheet) {
    return { found: false, crew: null, foreman: null, source: 'no_employees', reason: 'Employees sheet not found' };
  }

  var empData = context.employeeData || empSheet.getDataRange().getValues();
  var headers = empData[0].map(function(h) { return String(h).toLowerCase().trim(); });

  var nameCol = headers.indexOf('name');
  if (nameCol === -1) nameCol = headers.indexOf('employee');
  if (nameCol === -1) nameCol = headers.indexOf('employee name');
  if (nameCol === -1) nameCol = 0;

  var jobCol = headers.indexOf('job number');
  var secondaryJobCol = headers.indexOf('secondary job number');
  var classCol = headers.indexOf('job classification');

  if (jobCol === -1) {
    return { found: false, crew: null, foreman: null, source: 'no_job_col', reason: 'Job Number column not found in Employees' };
  }

  // Search for this job in Employees
  for (var i = 1; i < empData.length; i++) {
    var empJob = String(empData[i][jobCol] || '').split('.')[0].trim();
    var empSecondaryJob = secondaryJobCol !== -1 ? String(empData[i][secondaryJobCol] || '').split('.')[0].trim() : '';
    var empName = String(empData[i][nameCol] || '').trim();

    // Check if this employee's primary or secondary job matches
    if (empJob === baseJob || empSecondaryJob === baseJob) {
      // Found! Now find their primary crew
      var primaryCrew = empJob; // Primary job is the tracked crew

      // Check if their primary job is tracked
      if (trackedCrews[primaryCrew]) {
        var isSecondary = (empSecondaryJob === baseJob);
        return {
          found: true,
          crew: primaryCrew,
          foreman: empName,
          source: isSecondary ? 'secondary' : 'primary',
          reason: isSecondary
            ? 'Secondary job ' + baseJob + ' → primary crew ' + primaryCrew + ' (via ' + empName + ')'
            : 'Primary job match for ' + empName
        };
      }
    }
  }

  // 4. Not found
  return {
    found: false,
    crew: null,
    foreman: null,
    source: 'notfound',
    reason: 'Job ' + baseJob + ' not found in Employees sheet (primary or secondary)'
  };
}

/**
 * Helper to find a foreman's primary crew from Employees data
 */
function findForemanPrimaryCrew(foremanName, employeeData) {
  if (!foremanName || !employeeData) return null;

  var headers = employeeData[0].map(function(h) { return String(h).toLowerCase().trim(); });
  var nameCol = headers.indexOf('name');
  if (nameCol === -1) nameCol = headers.indexOf('employee');
  if (nameCol === -1) nameCol = 0;
  var jobCol = headers.indexOf('job number');
  if (jobCol === -1) return null;

  var foremanLower = foremanName.toLowerCase().trim();

  for (var i = 1; i < employeeData.length; i++) {
    var empName = String(employeeData[i][nameCol] || '').trim();
    if (empName.toLowerCase() === foremanLower) {
      var empJob = String(employeeData[i][jobCol] || '').split('.')[0].trim();
      return empJob || null;
    }
  }

  return null;
}

// ============================================================================
// REAL-TIME COMPLIANCE TRACKING
// ============================================================================

/**
 * Builds compliance state directly from parsed email data
 * This replaces reading from Safety Reports sheet for JHA/Meeting compliance
 *
 * @param {Array} parsedEmails - Array of parsed email results from parseSafetyEmail()
 * @param {Date} weekStartDate - Sunday of the week to track
 * @param {Object} context - Resolution context with trackedCrews, customMappings, employeeData
 * @returns {Object} Compliance state keyed by crew
 */
function buildComplianceStateFromEmails(parsedEmails, weekStartDate, context) {
  var weekBounds = getWeekBoundaries(weekStartDate);
  var state = {};
  var uncredited = {};

  var trackedCrews = context.trackedCrews || {};

  // Initialize state for all tracked crews
  for (var crew in trackedCrews) {
    state[crew] = {
      jhaByDay: [false, false, false, false, false, false, false], // Sun-Sat
      jhaLateByDay: [false, false, false, false, false, false, false],
      weeklyMeeting: false,
      weeklyMeetingLate: false,
      monthlyChecklist: false
    };
  }

  // Process each parsed email
  for (var i = 0; i < parsedEmails.length; i++) {
    var parsed = parsedEmails[i];
    if (!parsed || !parsed.reportMeta) continue;

    var meta = parsed.reportMeta;
    if (!meta.jobNumber) continue;

    // Resolve job to tracked crew
    var resolution = resolveJobToCrew(meta.jobNumber, context);

    if (!resolution.found) {
      // Track uncredited
      var baseJob = meta.jobNumber.split('.')[0];
      if (!uncredited[baseJob]) {
        uncredited[baseJob] = {
          reportTypes: [],
          dates: [],
          reason: resolution.reason
        };
      }
      if (uncredited[baseJob].reportTypes.indexOf(meta.reportType) === -1) {
        uncredited[baseJob].reportTypes.push(meta.reportType);
      }
      if (meta.date) {
        var dateStr = Utilities.formatDate(meta.date, Session.getScriptTimeZone(), 'MM/dd/yyyy');
        if (uncredited[baseJob].dates.indexOf(dateStr) === -1) {
          uncredited[baseJob].dates.push(dateStr);
        }
      }
      continue;
    }

    var crew = resolution.crew;

    // Handle multiple JHA dates (from PDF extraction)
    var datesToProcess = [];
    if (meta.reportType === 'JHA') {
      if (meta.multipleJHADates && meta.multipleJHADates.length > 0) {
        datesToProcess = meta.multipleJHADates;
      } else if (meta.date) {
        datesToProcess = [meta.date];
      }
    } else if (meta.date) {
      datesToProcess = [meta.date];
    }

    // Process each date
    for (var d = 0; d < datesToProcess.length; d++) {
      var reportDate = new Date(datesToProcess[d]);

      // Check if within this week
      if (reportDate < weekBounds.weekStart || reportDate > weekBounds.weekEnd) {
        continue;
      }

      var dayOfWeek = reportDate.getDay(); // 0=Sun, 6=Sat
      var isLate = isReportLate(reportDate, meta.receivedDate);

      if (meta.reportType === 'JHA' || meta.reportType.indexOf('Job Hazard') !== -1) {
        if (state[crew]) {
          state[crew].jhaByDay[dayOfWeek] = true;
          if (isLate) {
            state[crew].jhaLateByDay[dayOfWeek] = true;
          }
          Logger.log("buildComplianceStateFromEmails: Credited JHA to " + crew + " for day " + dayOfWeek + " (from job " + meta.jobNumber + ")");
        }
      } else if (meta.reportType === 'Safety Meeting' || meta.reportType.indexOf('Safety Meeting') !== -1) {
        if (state[crew]) {
          state[crew].weeklyMeeting = true;
          if (isLate) {
            state[crew].weeklyMeetingLate = true;
          }
          Logger.log("buildComplianceStateFromEmails: Credited Meeting to " + crew + " (from job " + meta.jobNumber + ")");
        }
      } else if (meta.reportType === 'Fleet Checklist' || meta.reportType === 'Safety Checklist') {
        if (state[crew]) {
          state[crew].monthlyChecklist = true;
        }
      }
    }
  }

  return {
    crewState: state,
    uncredited: uncredited
  };
}

/**
 * Merges newly parsed compliance state with existing Safety Compliance sheet data
 * Updates the sheet with combined state
 *
 * @param {Object} newState - From buildComplianceStateFromEmails()
 * @param {Date} weekStartDate - Week being processed
 */
function mergeAndUpdateComplianceSheet(newState, weekStartDate) {
  if (!newState || !newState.crewState) {
    Logger.log("mergeAndUpdateComplianceSheet: No new state to merge");
    return;
  }

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SAFETY_COMPLIANCE_SHEET_NAME);

  if (!sheet) {
    sheet = setupSafetyComplianceSheet();
  }

  var weekBounds = getWeekBoundaries(weekStartDate);
  var weekStartStr = Utilities.formatDate(weekBounds.weekStart, Session.getScriptTimeZone(), 'MM/dd/yyyy');
  var config = loadComplianceConfig();
  var today = new Date();
  var isPastDeadline = today > weekBounds.weekEnd;
  var nowStr = Utilities.formatDate(today, Session.getScriptTimeZone(), 'MM/dd/yyyy HH:mm');

  // Read existing data
  var data = sheet.getDataRange().getValues();
  var existingRows = {};
  for (var i = 1; i < data.length; i++) {
    var rowWeek = data[i][0];
    var rowJob = String(data[i][1] || '').trim();
    var rowStatus = String(data[i][12] || '').trim();

    if (rowWeek && rowJob) {
      var rowWeekStr = Utilities.formatDate(new Date(rowWeek), Session.getScriptTimeZone(), 'MM/dd/yyyy');
      if (rowWeekStr === weekStartStr) {
        existingRows[rowJob] = {
          rowNum: i + 1,
          status: rowStatus,
          data: data[i]
        };
      }
    }
  }

  var dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  var crewsUpdated = 0;

  // Process each crew
  for (var crew in newState.crewState) {
    var crewData = newState.crewState[crew];
    var crewConfig = config[crew] || { skipDays: [true, false, false, false, false, false, true], skipWeeklyMeeting: false, skipMonthlyChecklist: false };

    // Skip if already resolved
    if (existingRows[crew] && existingRows[crew].status === 'Resolved') {
      Logger.log("mergeAndUpdateComplianceSheet: Skipping resolved crew " + crew);
      continue;
    }

    var foremanResult = lookupForemanByJobNumber(crew);
    var foremanName = (foremanResult && foremanResult.name) ? foremanResult.name : "";

    // Build day columns
    var dayValues = [];
    var missingItems = [];
    var lateCount = 0;
    var status = 'Complete';

    for (var d = 0; d < 7; d++) {
      if (crewConfig.skipDays[d]) {
        dayValues.push('N/A');
      } else if (crewData.jhaByDay[d]) {
        if (crewData.jhaLateByDay[d]) {
          dayValues.push('✅L');
          lateCount++;
        } else {
          dayValues.push('✅');
        }
      } else {
        // Check existing data first (might have been credited before)
        if (existingRows[crew]) {
          var existingDayVal = String(existingRows[crew].data[3 + d] || '').trim();
          if (existingDayVal === '✅' || existingDayVal === '✅L') {
            dayValues.push(existingDayVal);
            continue;
          }
        }
        // Not credited
        if (isPastDeadline) {
          dayValues.push('❌');
          status = 'Missing Reports';
          missingItems.push('JHA (' + dayNames[d] + ')');
        } else {
          dayValues.push('⏳');
          if (status === 'Complete') status = 'Pending';
        }
      }
    }

    // Weekly meeting
    var weeklyVal = '';
    if (crewConfig.skipWeeklyMeeting) {
      weeklyVal = 'N/A';
    } else if (crewData.weeklyMeeting) {
      weeklyVal = crewData.weeklyMeetingLate ? '✅L' : '✅';
      if (crewData.weeklyMeetingLate) lateCount++;
    } else {
      // Check existing
      if (existingRows[crew]) {
        var existingMeeting = String(existingRows[crew].data[10] || '').trim();
        if (existingMeeting === '✅' || existingMeeting === '✅L') {
          weeklyVal = existingMeeting;
        }
      }
      if (!weeklyVal) {
        if (isPastDeadline) {
          weeklyVal = '❌';
          status = 'Missing Reports';
          missingItems.push('Weekly Meeting');
        } else {
          weeklyVal = '⏳';
          if (status === 'Complete') status = 'Pending';
        }
      }
    }

    // Monthly checklist (progressive deadline)
    var monthlyStatus = getMonthlyChecklistStatus(
      weekBounds.weekStart,
      crewData.monthlyChecklist,
      crewConfig.skipMonthlyChecklist,
      null
    );

    var monthlyVal = monthlyStatus.status;
    if (monthlyStatus.affectsStatus) {
      if (monthlyStatus.shouldCreateTask && status !== 'Missing Reports') {
        status = 'Missing Reports';
        missingItems.push('Monthly Checklist');
      } else if (status === 'Complete' && monthlyVal !== '✅' && monthlyVal !== 'N/A') {
        status = 'Pending';
      }
    }

    // Build row
    var rowData = [
      weekStartStr,
      crew,
      foremanName,
      dayValues[0], dayValues[1], dayValues[2], dayValues[3], dayValues[4], dayValues[5], dayValues[6],
      weeklyVal,
      monthlyVal,
      status,
      nowStr
    ];

    // Update or insert
    if (existingRows[crew]) {
      sheet.getRange(existingRows[crew].rowNum, 1, 1, rowData.length).setValues([rowData]);
    } else {
      sheet.appendRow(rowData);
    }
    crewsUpdated++;
  }

  Logger.log("mergeAndUpdateComplianceSheet: Updated " + crewsUpdated + " crews for week " + weekStartStr);
}

/**
 * Updates Safety Compliance sheet directly from parsed compliance records
 * This is the key function that writes JHA/Meeting data to the ✅/❌ grid
 * Called during email processing BEFORE calculateSafetyCompliance()
 *
 * @param {Array} complianceRecords - Array of compliance record arrays from processSafetyEmails
 *   Each record: [reportDate, reportType, jobNumber, foreman, vehicle, equipType, desc, status, feDate, emailId, notes, subject, receivedDate]
 * @returns {Object} - { updated: number, skipped: number }
 */
function updateComplianceFromParsedRecords(complianceRecords) {
  if (!complianceRecords || complianceRecords.length === 0) {
    return { updated: 0, skipped: 0 };
  }

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SAFETY_COMPLIANCE_SHEET_NAME);

  if (!sheet) {
    Logger.log("updateComplianceFromParsedRecords: Safety Compliance sheet not found - creating it");
    sheet = setupSafetyComplianceSheet();
    if (!sheet) {
      return { updated: 0, skipped: 0, error: "Could not create Safety Compliance sheet" };
    }
  }

  var tz = Session.getScriptTimeZone();
  var today = new Date();
  var nowStr = Utilities.formatDate(today, tz, 'MM/dd/yyyy HH:mm');
  var crews = getActiveCrews();
  var config = loadComplianceConfig();
  var customMappings = getCustomJobForemanMappings() || {};

  // Build tracked crews lookup
  var trackedCrews = {};
  for (var c = 0; c < crews.length; c++) {
    trackedCrews[crews[c]] = true;
  }

  // Build job resolution context
  var empSheet = ss.getSheetByName('Employees');
  var employeeData = empSheet ? empSheet.getDataRange().getValues() : [];
  var context = {
    trackedCrews: trackedCrews,
    customMappings: customMappings,
    employeeData: employeeData
  };

  // Read existing Safety Compliance data
  var data = sheet.getDataRange().getValues();
  var existingRows = {}; // Key: "weekStart|jobNumber" → { rowNum, data }

  for (var i = 1; i < data.length; i++) {
    var rowWeek = data[i][0];
    var rowJob = String(data[i][1] || '').trim();
    var rowStatus = String(data[i][12] || '').trim();

    if (rowWeek && rowJob) {
      var rowWeekStr = Utilities.formatDate(new Date(rowWeek), tz, 'MM/dd/yyyy');
      var key = rowWeekStr + '|' + rowJob;
      existingRows[key] = {
        rowNum: i + 1,
        data: data[i],
        status: rowStatus
      };
    }
  }

  var updatedCount = 0;
  var skippedCount = 0;
  var newRowsByWeekJob = {}; // Track new rows to add

  // Process each compliance record
  for (var r = 0; r < complianceRecords.length; r++) {
    var record = complianceRecords[r];
    var reportDate = record[0];
    var reportType = String(record[1] || '').trim();
    var jobNumber = String(record[2] || '').trim();
    var foreman = String(record[3] || '').trim();
    var notes = String(record[10] || '').trim();

    if (!reportDate || !jobNumber) {
      skippedCount++;
      continue;
    }

    // Only process JHA and Safety Meeting records
    if (reportType !== 'JHA' && reportType.indexOf('Job Hazard') === -1 &&
        reportType !== 'Safety Meeting' && reportType.indexOf('Safety Meeting') === -1) {
      skippedCount++;
      continue;
    }

    // Resolve job to tracked crew
    var baseJob = jobNumber.split('.')[0];
    var resolution = resolveJobToCrew(baseJob, context);

    if (!resolution.found) {
      Logger.log("updateComplianceFromParsedRecords: Could not resolve job " + jobNumber + " - " + resolution.reason);
      skippedCount++;
      continue;
    }

    var targetCrew = resolution.crew;
    var targetForeman = resolution.foreman || foreman;

    // Get week boundaries for this report date
    var reportDateObj = new Date(reportDate);
    var weekBounds = getWeekBoundaries(reportDateObj);
    var weekStartStr = Utilities.formatDate(weekBounds.weekStart, tz, 'MM/dd/yyyy');
    var key = weekStartStr + '|' + targetCrew;

    // Check if late submission
    var isLate = notes.indexOf('LATE SUBMISSION') !== -1;
    var checkVal = isLate ? '✅L' : '✅';

    // Determine which column to update
    var dayOfWeek = reportDateObj.getDay(); // 0=Sun, 6=Sat
    var isJHA = (reportType === 'JHA' || reportType.indexOf('Job Hazard') !== -1);
    var isMeeting = (reportType === 'Safety Meeting' || reportType.indexOf('Safety Meeting') !== -1);

    // Column indices: 0=Week, 1=Job, 2=Foreman, 3=Sun, 4=Mon, 5=Tue, 6=Wed, 7=Thu, 8=Fri, 9=Sat, 10=Meeting, 11=Monthly, 12=Status, 13=Updated
    var targetColIndex = -1;
    if (isJHA) {
      targetColIndex = 3 + dayOfWeek; // Sun=3, Mon=4, etc.
    } else if (isMeeting) {
      targetColIndex = 10; // Weekly Meeting column (K)
    }

    if (targetColIndex < 0) {
      skippedCount++;
      continue;
    }

    // Update existing row or create new row
    if (existingRows[key]) {
      var existingRow = existingRows[key];

      // Skip if already resolved
      if (existingRow.status === 'Resolved') {
        Logger.log("updateComplianceFromParsedRecords: Skipping resolved crew " + targetCrew + " for week " + weekStartStr);
        skippedCount++;
        continue;
      }

      // Check current value - only update if not already credited
      var currentVal = String(existingRow.data[targetColIndex] || '').trim();
      if (currentVal === '✅' || currentVal === '✅L') {
        // Already credited, skip
        skippedCount++;
        continue;
      }

      // Update the specific cell
      sheet.getRange(existingRow.rowNum, targetColIndex + 1).setValue(checkVal);
      sheet.getRange(existingRow.rowNum, 14).setValue(nowStr); // Update timestamp

      // Also update in-memory cache
      existingRow.data[targetColIndex] = checkVal;

      updatedCount++;
      Logger.log("updateComplianceFromParsedRecords: Credited " + reportType + " to " + targetCrew +
        " for " + weekStartStr + (isJHA ? " day " + dayOfWeek : " (meeting)"));

    } else {
      // Need to create new row - track it and add at end
      if (!newRowsByWeekJob[key]) {
        // Initialize new row with pending values
        var crewConfig = config[targetCrew] || { skipDays: [true, false, false, false, false, false, true], skipWeeklyMeeting: false };
        var newRow = [
          weekStartStr,     // Week
          targetCrew,       // Job
          targetForeman,    // Foreman
          crewConfig.skipDays[0] ? 'N/A' : '⏳', // Sun
          crewConfig.skipDays[1] ? 'N/A' : '⏳', // Mon
          crewConfig.skipDays[2] ? 'N/A' : '⏳', // Tue
          crewConfig.skipDays[3] ? 'N/A' : '⏳', // Wed
          crewConfig.skipDays[4] ? 'N/A' : '⏳', // Thu
          crewConfig.skipDays[5] ? 'N/A' : '⏳', // Fri
          crewConfig.skipDays[6] ? 'N/A' : '⏳', // Sat
          crewConfig.skipWeeklyMeeting ? 'N/A' : '⏳', // Meeting
          '⏳',             // Monthly
          'Pending',        // Status
          nowStr            // Updated
        ];
        newRowsByWeekJob[key] = newRow;
      }

      // Update the specific column in the new row
      newRowsByWeekJob[key][targetColIndex] = checkVal;
      updatedCount++;
      Logger.log("updateComplianceFromParsedRecords: Created new row for " + targetCrew + " week " + weekStartStr +
        ", credited " + reportType + (isJHA ? " day " + dayOfWeek : " (meeting)"));
    }
  }

  // Append all new rows
  var newRowKeys = Object.keys(newRowsByWeekJob);
  for (var nk = 0; nk < newRowKeys.length; nk++) {
    sheet.appendRow(newRowsByWeekJob[newRowKeys[nk]]);
  }

  Logger.log("updateComplianceFromParsedRecords: Complete - Updated " + updatedCount + ", Skipped " + skippedCount + ", New rows " + newRowKeys.length);

  return { updated: updatedCount, skipped: skippedCount, newRows: newRowKeys.length };
}

/**
 * Creates the Safety Equipment Needs tracking sheet (formerly "Safety Reports")
 * This sheet tracks ACTUAL EQUIPMENT ISSUES only - not JHA/Meeting compliance
 * JHA/Meeting compliance is tracked in the Safety Compliance sheet
 */
function setupSafetyReportsSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  // Check for both old and new names
  var sheet = ss.getSheetByName(SAFETY_EQUIPMENT_SHEET_NAME);
  var oldSheet = ss.getSheetByName(SAFETY_EQUIPMENT_SHEET_OLD_NAME);

  if (sheet) {
    var response = Browser.msgBox(
      "Safety Equipment Needs sheet already exists",
      "Do you want to recreate it? This will DELETE all existing data.",
      Browser.Buttons.YES_NO
    );
    if (response === "no") return;
    ss.deleteSheet(sheet);
  } else if (oldSheet) {
    // Offer to migrate instead of recreate
    var response = Browser.msgBox(
      "Found 'Safety Reports' sheet",
      "Would you like to:\n• YES = Migrate existing data to 'Safety Equipment Needs'\n• NO = Delete and create fresh",
      Browser.Buttons.YES_NO
    );
    if (response === "yes") {
      migrateSafetyReportsToEquipmentNeeds();
      return;
    }
    ss.deleteSheet(oldSheet);
  }

  sheet = ss.insertSheet(SAFETY_EQUIPMENT_SHEET_NAME);

  // Set up headers
  var headers = [
    "Report Date", "Report Type", "Job Number", "Foreman",
    "Vehicle Number", "Equipment Type", "Issue Description",
    "Status", "FE Test Date", "Source Email ID", "Notes", "Email Subject", "Received Date"
  ];
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.getRange(1, 1, 1, headers.length)
    .setFontWeight("bold")
    .setBackground("#4A86E8")
    .setFontColor("white");
  sheet.setFrozenRows(1);

  // Set column widths
  sheet.setColumnWidth(1, 100);  // Date
  sheet.setColumnWidth(2, 120);  // Type
  sheet.setColumnWidth(3, 80);   // Job Number
  sheet.setColumnWidth(4, 120);  // Foreman
  sheet.setColumnWidth(5, 100);  // Vehicle
  sheet.setColumnWidth(6, 150);  // Equipment
  sheet.setColumnWidth(7, 300);  // Description
  sheet.setColumnWidth(8, 120);  // Status
  sheet.setColumnWidth(9, 120);  // Expiration
  sheet.setColumnWidth(10, 200); // Email ID
  sheet.setColumnWidth(11, 200); // Notes
  sheet.setColumnWidth(12, 400); // Email Subject
  sheet.setColumnWidth(13, 100); // Received Date

  // Add status dropdown (column H = 8)
  var statusRange = sheet.getRange(2, 8, 1000, 1);
  var statusRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(["Needs Attention", "Resolved", "Ordered", "Replaced"], true)
    .build();
  statusRange.setDataValidation(statusRule);

  // Add equipment type dropdown (column F = 6)
  // Only includes actual safety equipment, not vehicle mechanical items
  var equipmentRange = sheet.getRange(2, 6, 1000, 1);
  var equipmentRule = SpreadsheetApp.newDataValidation()
    .requireValueInList([
      "First Aid Kit", "Cones", "Triangles", "Signs",
      "Hot Sticks", "Insulated Jumpers", "Fire Extinguisher",
      "AED", "Fall Protection", "Harnesses/Lanyards",
      "Rubber Goods", "Wheel Chocks", "Inspection Tag",
      "Crane Log Books", "Mileage Books",
      "Hot Hoist", "Chains/Chokers/Slings", "Barriers",
      "Other"
    ], true)
    .build();
  equipmentRange.setDataValidation(equipmentRule);

  // Format dates
  sheet.getRange(2, 1, 1000, 1).setNumberFormat("MM/dd/yyyy");
  sheet.getRange(2, 9, 1000, 1).setNumberFormat("MM/dd/yyyy");

  // Add conditional formatting for Fire Extinguisher expiration (Column I = FE Test Date)
  // Fire extinguishers expire 1 year after test date
  // Rules are applied in order - first match wins, so we apply from most urgent to least urgent

  var feTestDateRange = sheet.getRange("I2:I1001");
  var rules = sheet.getConditionalFormatRules();

  // Rule 1: RED - Expired (test date + 1 year < today)
  // Formula: =AND(I2<>"", I2<>"", EDATE(I2, 12) < TODAY())
  var expiredRule = SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied('=AND(I2<>"", EDATE(I2, 12) < TODAY())')
    .setBackground("#FFCDD2")  // Light red
    .setFontColor("#B71C1C")   // Dark red text
    .setRanges([feTestDateRange])
    .build();
  rules.push(expiredRule);

  // Rule 2: ORANGE - Expiring within 3 months (test date + 1 year is within 90 days)
  // Formula: =AND(I2<>"", EDATE(I2, 12) >= TODAY(), EDATE(I2, 12) <= TODAY() + 90)
  var expiringSoonRule = SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied('=AND(I2<>"", EDATE(I2, 12) >= TODAY(), EDATE(I2, 12) <= TODAY() + 90)')
    .setBackground("#FFE0B2")  // Light orange
    .setFontColor("#E65100")   // Dark orange text
    .setRanges([feTestDateRange])
    .build();
  rules.push(expiringSoonRule);

  // Rule 3: YELLOW - Expiring within 6 months (test date + 1 year is within 180 days)
  // Formula: =AND(I2<>"", EDATE(I2, 12) >= TODAY(), EDATE(I2, 12) <= TODAY() + 180)
  var expiringRule = SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied('=AND(I2<>"", EDATE(I2, 12) >= TODAY(), EDATE(I2, 12) <= TODAY() + 180)')
    .setBackground("#FFF9C4")  // Light yellow
    .setFontColor("#F57F17")   // Dark yellow/amber text
    .setRanges([feTestDateRange])
    .build();
  rules.push(expiringRule);

  sheet.setConditionalFormatRules(rules);
  Logger.log("Added FE Test Date conditional formatting (Red=Expired, Orange=<3mo, Yellow=<6mo)");

  // Add conditional formatting for Resolved status - grey out entire row
  addResolvedRowFormatting(sheet);

  Browser.msgBox("✅ Safety Reports sheet created successfully!");
  Logger.log("Safety Reports sheet created");
}

/**
 * Opens the Safety Equipment Needs sheet (formerly Safety Reports)
 * Menu function: Glove Manager → Safety → View Safety Equipment Needs
 */
function openSafetyReports() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = getSafetyEquipmentSheet();

  if (!sheet) {
    var ui = SpreadsheetApp.getUi();
    var response = ui.alert('Safety Equipment Needs Not Found',
      'The Safety Equipment Needs sheet does not exist. Would you like to create it?',
      ui.ButtonSet.YES_NO);

    if (response === ui.Button.YES) {
      setupSafetyReportsSheet();
      sheet = getSafetyEquipmentSheet();
    } else {
      return;
    }
  }

  ss.setActiveSheet(sheet);
  SpreadsheetApp.flush();
}

/**
 * Cleans up Safety Equipment Needs sheet by removing "No Issues" compliance records.
 * These records are now tracked only in the Safety Compliance sheet.
 * Menu function: Glove Manager → Safety → Cleanup Safety Equipment Needs
 */
function cleanupSafetyReportsSheet() {
  var sheet = getSafetyEquipmentSheet();

  if (!sheet || sheet.getLastRow() < 2) {
    Browser.msgBox('ℹ️ No Data',
      'The Safety Equipment Needs sheet is empty or does not exist.',
      Browser.Buttons.OK);
    return;
  }

  var data = sheet.getDataRange().getValues();
  var headers = data[0];

  // Find column indices
  var reportTypeCol = -1;
  var equipCol = -1;
  for (var h = 0; h < headers.length; h++) {
    var header = String(headers[h]).toLowerCase().trim();
    if (header === 'report type') {
      reportTypeCol = h;
    }
    if (header === 'equipment type') {
      equipCol = h;
    }
  }

  if (reportTypeCol === -1) {
    Logger.log("Report Type column not found");
    Browser.msgBox('❌ Error', 'Report Type column not found in Safety Reports sheet.', Browser.Buttons.OK);
    return;
  }

  // Find rows to delete (from bottom to top to preserve row numbers)
  // Remove ALL JHA and Safety Meeting records - they belong in Safety Compliance sheet, not here
  // Only keep Fleet Checklist records that report actual equipment issues
  var rowsToDelete = [];
  var jhaCount = 0;
  var meetingCount = 0;
  var noIssuesCount = 0;

  for (var i = data.length - 1; i >= 1; i--) {
    var reportType = String(data[i][reportTypeCol]).toLowerCase().trim();
    var equipType = equipCol >= 0 ? String(data[i][equipCol]).toLowerCase().trim() : '';

    // Remove if Report Type is JHA or Safety Meeting (these are compliance tracking, not equipment issues)
    if (reportType === 'jha' || reportType.indexOf('job hazard') !== -1) {
      rowsToDelete.push(i + 1); // +1 for 1-based row index
      jhaCount++;
    } else if (reportType === 'safety meeting' || reportType.indexOf('weekly safety') !== -1 || reportType.indexOf('safety meeting') !== -1) {
      rowsToDelete.push(i + 1);
      meetingCount++;
    } else if (equipType === 'no issues') {
      // Also remove any "No Issues" entries from other report types
      rowsToDelete.push(i + 1);
      noIssuesCount++;
    }
  }

  if (rowsToDelete.length === 0) {
    Browser.msgBox('✅ Already Clean',
      'No JHA or Safety Meeting compliance records found in Safety Reports.\\n\\n' +
      'The sheet already contains only actual equipment issues from Fleet Checklists.',
      Browser.Buttons.OK);
    return;
  }

  // Build summary message
  var summaryParts = [];
  if (jhaCount > 0) summaryParts.push(jhaCount + ' JHA records');
  if (meetingCount > 0) summaryParts.push(meetingCount + ' Safety Meeting records');
  if (noIssuesCount > 0) summaryParts.push(noIssuesCount + ' "No Issues" records');
  var summaryMsg = summaryParts.join(', ');

  // Confirm with user
  var response = Browser.msgBox(
    '🧹 Cleanup Safety Reports',
    'Found ' + rowsToDelete.length + ' records to remove:\\n' + summaryMsg + '\\n\\n' +
    'JHA/Safety Meeting compliance is now tracked in the Safety Compliance sheet.\\n' +
    'Safety Reports should only contain actual equipment issues from Fleet Checklists.\\n\\n' +
    'Remove these rows?',
    Browser.Buttons.YES_NO
  );

  if (response === 'no') return;

  // Delete rows from bottom to top
  var deleted = 0;
  for (var r = 0; r < rowsToDelete.length; r++) {
    sheet.deleteRow(rowsToDelete[r]);
    deleted++;
  }

  Browser.msgBox('✅ Cleanup Complete',
    'Removed ' + deleted + ' records:\\n' + summaryMsg + '\\n\\n' +
    'Safety Reports now contains only actual equipment issues that need attention.',
    Browser.Buttons.OK);

  Logger.log("cleanupSafetyReportsSheet: Removed " + deleted + " records (" + jhaCount + " JHA, " + meetingCount + " Safety Meeting, " + noIssuesCount + " No Issues)");
}

/**
 * Creates Manual Tasks from Safety Reports with "Needs Attention" status
 * Menu function: Glove Manager → Safety → Create Tasks from Issues
 */
function createTasksFromSafetyIssues() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var safetySheet = ss.getSheetByName("Safety Reports");

  if (!safetySheet || safetySheet.getLastRow() < 2) {
    Browser.msgBox('⚠️ No Safety Reports',
      'The Safety Reports sheet is empty or does not exist.\\n\\nRun "Process Safety Emails" first to populate the sheet.',
      Browser.Buttons.OK);
    return;
  }

  var taskSheet = ss.getSheetByName("Task Metadata");
  if (!taskSheet) {
    Browser.msgBox('⚠️ Task Metadata Not Found',
      'Please run "Setup Task Metadata Sheet" first.',
      Browser.Buttons.OK);
    return;
  }

  var data = safetySheet.getDataRange().getValues();
  var headers = data[0];

  // Find column indices
  var statusCol = -1, equipCol = -1, descCol = -1, jobCol = -1, vehicleCol = -1, dateCol = -1;
  for (var h = 0; h < headers.length; h++) {
    var header = String(headers[h]).toLowerCase().trim();
    if (header === 'status') statusCol = h;
    if (header === 'equipment type') equipCol = h;
    if (header === 'issue description') descCol = h;
    if (header === 'job number') jobCol = h;
    if (header === 'vehicle number') vehicleCol = h;
    if (header === 'report date') dateCol = h;
  }

  var tasksCreated = 0;
  var now = new Date();
  var dateStr = Utilities.formatDate(now, Session.getScriptTimeZone(), 'yyyyMMdd');

  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var status = String(row[statusCol] || '').trim();

    if (status !== 'Needs Attention') continue;

    var equipment = String(row[equipCol] || '').trim();
    var description = String(row[descCol] || '').trim();
    var jobNumber = String(row[jobCol] || '').trim();
    var vehicle = String(row[vehicleCol] || '').trim();
    var location = lookupLocationByJobNumber(jobNumber) || 'Unknown';

    // Create task ID
    var taskId = 'SafetyReports_' + i + '_' + dateStr;

    // Check if task already exists
    var existingTasks = taskSheet.getDataRange().getValues();
    var exists = false;
    for (var e = 1; e < existingTasks.length; e++) {
      if (existingTasks[e][0] === taskId) {
        exists = true;
        break;
      }
    }

    if (exists) continue;

    // Create task row
    var taskRow = [
      taskId,                           // TaskID
      'Safety Reports',                 // SourceSheet
      i + 1,                           // SourceRow
      equipment + ' - ' + vehicle,     // Employee (using equipment + vehicle as identifier)
      'Safety Equipment',               // TaskType
      equipment,                        // ItemType
      vehicle,                          // CurrentItem (vehicle number)
      location,                         // Location
      '',                               // Foreman
      '',                               // PhoneNumber
      now,                              // DueDate
      '',                               // ScheduledDate
      '',                               // StartTime
      '',                               // EndTime
      'Unassigned',                     // Status
      '',                               // NotifiedDate
      '',                               // ScheduledClassDate
      '',                               // ClassType
      '',                               // IsOffice
      '',                               // IsRegistered
      '',                               // IsDeclined
      '',                               // CompletedDate
      description,                      // Notes
      now,                              // CreatedDate
      now,                              // LastModified
      ''                                // InTaskList
    ];

    taskSheet.appendRow(taskRow);
    tasksCreated++;
  }

  if (tasksCreated > 0) {
    Browser.msgBox('✅ Tasks Created',
      'Created ' + tasksCreated + ' task(s) from Safety Reports with "Needs Attention" status.',
      Browser.Buttons.OK);
  } else {
    Browser.msgBox('ℹ️ No New Tasks',
      'No new tasks to create. All "Needs Attention" items already have tasks.',
      Browser.Buttons.OK);
  }
}

/**
 * Refreshes Safety sheets - syncs completed tasks and recalculates compliance
 * Menu function: Glove Manager → Safety → Refresh Safety Sheets
 */
function refreshSafetySheets() {
  var ui = SpreadsheetApp.getUi();

  ui.alert('🔄 Refreshing Safety Sheets...',
    'This will:\\n• Sync completed Safety Equipment tasks to Safety Reports\\n• Recalculate current week compliance\\n\\nPlease wait...',
    ui.ButtonSet.OK);

  var syncCount = 0;

  // Sync completed Safety Equipment tasks to Safety Reports sheet
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var taskSheet = ss.getSheetByName("Task Metadata");
  var safetySheet = ss.getSheetByName("Safety Reports");

  if (taskSheet && safetySheet) {
    var taskData = taskSheet.getDataRange().getValues();
    var safetyData = safetySheet.getDataRange().getValues();

    for (var t = 1; t < taskData.length; t++) {
      var taskId = String(taskData[t][0] || '').trim();
      var status = String(taskData[t][14] || '').trim(); // Status column (O = 15, 0-indexed = 14)
      var completedDate = taskData[t][21]; // CompletedDate column (V = 22, 0-indexed = 21)

      // Check for both formats: "SafetyReports_" and "Safety Reports_"
      var isSafetyReportsTask = (taskId.indexOf('SafetyReports_') === 0 || taskId.indexOf('Safety Reports_') === 0);
      if (!isSafetyReportsTask) continue;
      if (status !== 'Complete' && status !== 'Completed' && !completedDate) continue;

      // Extract source row from taskId - handle both formats
      var normalizedTaskId = taskId.replace('Safety Reports_', 'SafetyReports_');
      var parts = normalizedTaskId.split('_');
      if (parts.length < 2) continue;
      var sourceRow = parseInt(parts[1]);

      if (sourceRow > 0 && sourceRow < safetyData.length) {
        var currentStatus = String(safetyData[sourceRow][7] || '').trim(); // Status column (H = 8, 0-indexed = 7)
        if (currentStatus !== 'Resolved') {
          safetySheet.getRange(sourceRow + 1, 8).setValue('Resolved'); // +1 for 1-based row
          syncCount++;
        }
      }
    }
  }

  // Recalculate current week compliance
  var today = new Date();
  var weekBounds = getWeekBoundaries(today);

  try {
    var complianceData = calculateSafetyCompliance(weekBounds.weekStart);
    if (complianceData && complianceData.crews) {
      updateComplianceSheet(complianceData);
    }
  } catch (e) {
    Logger.log('refreshSafetySheets: Error recalculating compliance: ' + e);
  }

  ui.alert('✅ Refresh Complete',
    'Safety sheets refreshed:\\n• Synced ' + syncCount + ' completed task(s) to Safety Reports\\n• Recalculated current week compliance',
    ui.ButtonSet.OK);
}

/**
 * Syncs a single Safety Equipment task completion to the Safety Reports sheet.
 * Called by markTaskComplete() when completing a Safety Reports task.
 *
 * @param {string} taskKey - The task key in format "Safety Reports_RowIndex" or "SafetyReports_RowIndex"
 * @return {Object} Result with synced status: {synced: true/false, message: string}
 */
function syncSafetyReportCompletion(taskKey) {
  Logger.log('syncSafetyReportCompletion: Starting for taskKey=' + taskKey);

  if (!taskKey) {
    return { synced: false, message: 'No taskKey provided' };
  }

  // Normalize the taskKey - handle both "Safety Reports_X" and "SafetyReports_X" formats
  var normalizedKey = taskKey.replace('Safety Reports_', 'SafetyReports_');

  // Extract row index from taskKey
  var parts = normalizedKey.split('_');
  if (parts.length < 2) {
    Logger.log('syncSafetyReportCompletion: Could not parse taskKey');
    return { synced: false, message: 'Invalid taskKey format' };
  }

  var sourceRow = parseInt(parts[1]);
  if (isNaN(sourceRow) || sourceRow < 1) {
    Logger.log('syncSafetyReportCompletion: Invalid row index: ' + parts[1]);
    return { synced: false, message: 'Invalid row index' };
  }

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var safetySheet = ss.getSheetByName('Safety Reports');

  if (!safetySheet) {
    Logger.log('syncSafetyReportCompletion: Safety Reports sheet not found');
    return { synced: false, message: 'Safety Reports sheet not found' };
  }

  var lastRow = safetySheet.getLastRow();
  if (sourceRow > lastRow) {
    Logger.log('syncSafetyReportCompletion: Row ' + sourceRow + ' is beyond last row ' + lastRow);
    return { synced: false, message: 'Row out of range' };
  }

  // Get current status (column H = 8)
  var statusCell = safetySheet.getRange(sourceRow, 8);
  var currentStatus = String(statusCell.getValue() || '').trim();

  if (currentStatus === 'Resolved') {
    Logger.log('syncSafetyReportCompletion: Row ' + sourceRow + ' already Resolved');
    return { synced: true, message: 'Already resolved' };
  }

  // Update to Resolved
  statusCell.setValue('Resolved');
  Logger.log('syncSafetyReportCompletion: Updated row ' + sourceRow + ' to Resolved');

  return { synced: true, message: 'Updated to Resolved' };
}

/**
 * Adds conditional formatting to grey out rows where Status = "Resolved"
 * Can be called on existing sheets to add the formatting
 * @param {Sheet} sheet - Optional sheet parameter, defaults to Safety Reports
 */
function addResolvedRowFormatting(sheet) {
  if (!sheet) {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    sheet = ss.getSheetByName("Safety Reports");
    if (!sheet) {
      Logger.log("Safety Reports sheet not found");
      return;
    }
  }

  var rules = sheet.getConditionalFormatRules();

  // Check if rule already exists (avoid duplicates)
  var hasResolvedRule = rules.some(function(rule) {
    var criteria = rule.getBooleanCondition();
    if (criteria && criteria.getCriteriaType() === SpreadsheetApp.BooleanCriteria.CUSTOM_FORMULA) {
      var formula = criteria.getCriteriaValues()[0];
      return formula && formula.indexOf('$H') !== -1 && formula.indexOf('Resolved') !== -1;
    }
    return false;
  });

  if (hasResolvedRule) {
    Logger.log("Resolved row formatting already exists");
    return;
  }

  // Apply to entire row range (A2:L1001)
  var dataRange = sheet.getRange("A2:L1001");

  // Rule: Grey out entire row when Status (column H) = "Resolved"
  // Formula uses $H2 with $ to lock column H, but row 2 is relative so it applies per row
  var resolvedRule = SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied('=$H2="Resolved"')
    .setBackground("#E0E0E0")  // Light grey
    .setFontColor("#9E9E9E")   // Medium grey text
    .setRanges([dataRange])
    .build();

  // Add at the beginning so it takes priority
  rules.unshift(resolvedRule);
  sheet.setConditionalFormatRules(rules);

  Logger.log("Added Resolved row formatting (grey background)");
}

/**
 * Gets the timestamp of when safety emails were last processed.
 * Called by ProcessSafetyEmailsDialog.html to display last run time.
 *
 * @return {string} Timestamp string or 'Never' if not processed before
 */
function getLastSafetyEmailProcessedTime() {
  var props = PropertiesService.getScriptProperties();
  var timestamp = props.getProperty('LAST_SAFETY_EMAIL_TIMESTAMP');
  if (timestamp) {
    return timestamp;
  }
  // Fallback to date-only format if timestamp not available
  var dateOnly = props.getProperty('LAST_SAFETY_EMAIL_DATE');
  if (dateOnly) {
    return dateOnly;
  }
  return 'Never';
}

/**
 * Menu function to add resolved formatting to existing Safety Reports sheet
 */
function addResolvedFormattingToSafetyReports() {
  addResolvedRowFormatting();
  SpreadsheetApp.getUi().alert("✅ Resolved row formatting added!\n\nRows with Status = 'Resolved' will now appear in light grey.");
}

/**
 * Migration function to add "Received Date" column to existing Safety Reports sheet
 * This column stores when the email was actually received (separate from Report Date which is the work date)
 * Run this once to update existing sheets.
 */
function addReceivedDateColumnToSafetyReports() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("Safety Reports");

  if (!sheet) {
    SpreadsheetApp.getUi().alert("❌ Safety Reports sheet not found.\n\nPlease run 'Setup Safety Reports Sheet' first.");
    return;
  }

  // Check if column already exists
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var receivedDateExists = headers.some(function(h) {
    return String(h).toLowerCase().trim() === 'received date';
  });

  if (receivedDateExists) {
    SpreadsheetApp.getUi().alert("✅ 'Received Date' column already exists in Safety Reports sheet.");
    return;
  }

  // Add the new column header after "Email Subject" (column L = index 12)
  var lastCol = sheet.getLastColumn();
  var newColIndex = lastCol + 1;

  // If the sheet has 12 columns (original format), add column M
  if (lastCol === 12) {
    sheet.getRange(1, 13).setValue("Received Date");
    sheet.getRange(1, 13).setFontWeight("bold").setBackground("#4A86E8").setFontColor("white");
    sheet.setColumnWidth(13, 100);
    // Format as date
    sheet.getRange(2, 13, sheet.getMaxRows() - 1, 1).setNumberFormat("MM/dd/yyyy");
  } else {
    // Insert column at position 13 if sheet has more columns
    sheet.insertColumnAfter(12);
    sheet.getRange(1, 13).setValue("Received Date");
    sheet.getRange(1, 13).setFontWeight("bold").setBackground("#4A86E8").setFontColor("white");
    sheet.setColumnWidth(13, 100);
    sheet.getRange(2, 13, sheet.getMaxRows() - 1, 1).setNumberFormat("MM/dd/yyyy");
  }

  SpreadsheetApp.getUi().alert("✅ 'Received Date' column added to Safety Reports sheet!\n\nNew emails processed will now store the date the email was received separately from the Report Date.");
}

/**
 * Applies conditional formatting to status column for new rows
 *
 * @param {Sheet} sheet - Safety Reports sheet
 * @param {number} startRow - Starting row for new data
 * @param {number} numRows - Number of rows to format
 */
function applyStatusFormatting(sheet, startRow, numRows) {
  if (!sheet || !startRow || !numRows || numRows < 1) return;

  var statusRange = sheet.getRange(startRow, 8, numRows, 1); // Column H = Status

  var rules = sheet.getConditionalFormatRules();

  // Red for "Needs Attention"
  var needsAttentionRule = SpreadsheetApp.newConditionalFormatRule()
    .whenTextEqualTo("Needs Attention")
    .setBackground("#F4CCCC")
    .setFontColor("#CC0000")
    .setRanges([statusRange])
    .build();

  // Green for "Resolved"
  var resolvedRule = SpreadsheetApp.newConditionalFormatRule()
    .whenTextEqualTo("Resolved")
    .setBackground("#D9EAD3")
    .setFontColor("#38761D")
    .setRanges([statusRange])
    .build();

  // Yellow for "Ordered"
  var orderedRule = SpreadsheetApp.newConditionalFormatRule()
    .whenTextEqualTo("Ordered")
    .setBackground("#FFF2CC")
    .setFontColor("#BF9000")
    .setRanges([statusRange])
    .build();

  // Blue for "Replaced"
  var replacedRule = SpreadsheetApp.newConditionalFormatRule()
    .whenTextEqualTo("Replaced")
    .setBackground("#CFE2F3")
    .setFontColor("#1155CC")
    .setRanges([statusRange])
    .build();

  rules.push(needsAttentionRule, resolvedRule, orderedRule, replacedRule);
  sheet.setConditionalFormatRules(rules);
}

/**
 * Searches Gmail for JHAs, Safety Meetings, and Fleet Checklists
 * Parses them and logs equipment issues to Safety Equipment Needs sheet
 * JHA/Meeting compliance is tracked directly in Safety Compliance sheet (not via Safety Equipment Needs)
 *
 * @param {number} daysBack - Number of days to search back (default 7)
 * @param {number} batchSize - Number of emails to process at once (default 10 for PDF processing)
 * @param {boolean} newOnlyMode - If true, only process emails newer than last processed date (default true)
 * @returns {Object} - Status object with progress info
 */
/**
 * Process safety emails from Gmail
 * @param {number} daysBack - Number of days to look back (default 7)
 * @param {number} batchSize - Number of threads per batch (default 5 for speed)
 * @param {boolean} newOnlyMode - Only process emails since last run (default true)
 * @param {boolean} skipPdfExtraction - Skip slow PDF extraction, use subject date only (default false)
 */
function processSafetyEmails(daysBack, batchSize, newOnlyMode, skipPdfExtraction) {
  if (!daysBack) daysBack = 7;
  if (!batchSize) batchSize = 5; // REDUCED from 10 to 5 for better timeout handling
  if (newOnlyMode === undefined) newOnlyMode = true; // Default to new-only mode
  if (skipPdfExtraction === undefined) skipPdfExtraction = false; // Default to extracting PDFs

  // Store skipPdfExtraction in script properties so parseSafetyEmail can access it
  var props = PropertiesService.getScriptProperties();
  props.setProperty('SKIP_PDF_EXTRACTION', skipPdfExtraction ? 'true' : 'false');

  var startTime = new Date().getTime(); // Track execution time

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = getSafetyEquipmentSheet();
  if (!sheet) {
    // Auto-create the sheet
    Logger.log("Safety Equipment Needs sheet not found - creating it now");
    setupSafetyReportsSheet();
    sheet = getSafetyEquipmentSheet();
    if (!sheet) {
      Browser.msgBox("❌ Failed to create Safety Equipment Needs sheet.");
      return { complete: true, error: "Failed to create sheet" };
    }
  }

  var props = PropertiesService.getScriptProperties();
  var batchStart = parseInt(props.getProperty('SAFETY_BATCH_START') || '0');

  // Get last processed date for smart filtering
  var lastProcessedDate = props.getProperty('LAST_SAFETY_EMAIL_DATE');
  var dateFilter = '';

  if (newOnlyMode && lastProcessedDate && batchStart === 0) {
    // Use after: filter to only get emails newer than last processed
    // Format: YYYY/MM/DD
    dateFilter = ' after:' + lastProcessedDate;
    Logger.log('New-only mode: filtering emails after ' + lastProcessedDate);
  } else {
    // Use the explicit day range specified by user (14 days, 30 days, etc.)
    dateFilter = ' newer_than:' + daysBack + 'd';
    Logger.log('Date range mode: filtering emails from last ' + daysBack + ' days');
  }

  // Search queries for different report types
  // Search by subject only (works for both original and forwarded emails)
  var baseQueries = [
    'subject:"Job Hazard Report"',
    'subject:"Safety Meeting Report"',
    'subject:"Weekly Safety Repairs"',
    'subject:"Safety Checklist Report"'
  ];

  // Build queries with date filters - ALWAYS apply the date filter
  var queries = baseQueries.map(function(q) {
    return q + dateFilter;
  });

  // Valid senders for Safety Checklist Reports
  var validChecklistSenders = [
    'codyb@mountainpower.com',
    'mptablets@mountainpower.com',
    'fleet@mountainpower.com',
    'janw@mountainpower.com'
  ];

  var allThreads = [];
  queries.forEach(function(query) {
    try {
      var threads = GmailApp.search(query);
      allThreads = allThreads.concat(threads);
      Logger.log("Query: " + query + " - Found " + threads.length + " threads");
    } catch (e) {
      Logger.log("Error with query: " + query + " - " + e.toString());
    }
  });

  Logger.log("Total threads found: " + allThreads.length);

  if (allThreads.length === 0) {
    props.deleteProperty('SAFETY_BATCH_START');
    Browser.msgBox("No safety emails found in the last " + daysBack + " days.");
    return { complete: true, totalThreads: 0 };
  }

  // Get existing email IDs to avoid duplicates
  var existingData = sheet.getDataRange().getValues();
  var existingEmailIds = {};
  for (var i = 1; i < existingData.length; i++) {
    if (existingData[i][9]) { // Column J = Source Email ID
      existingEmailIds[existingData[i][9]] = true;
    }
  }

  // Process only this batch
  var batchEnd = Math.min(batchStart + batchSize, allThreads.length);
  var batchThreads = allThreads.slice(batchStart, batchEnd);

  // Time tracking - stop 30 seconds before the 6-minute limit
  var MAX_EXECUTION_MS = 5.5 * 60 * 1000; // 5.5 minutes = 330 seconds
  var timedOut = false;

  // === OPTION B: Build job resolution context for logging ===
  // This allows us to resolve jobs to tracked crews as we process emails
  var crews = getActiveCrews();
  var trackedCrews = {};
  for (var ci = 0; ci < crews.length; ci++) {
    trackedCrews[crews[ci]] = true;
  }

  var customMappings = getCustomJobForemanMappings() || {};
  var empSheet = ss.getSheetByName('Employees');
  var employeeData = empSheet ? empSheet.getDataRange().getValues() : [];

  var jobResolutionContext = {
    trackedCrews: trackedCrews,
    customMappings: customMappings,
    employeeData: employeeData
  };

  // Auto-cleanup old log entries (>90 days) on first batch only
  if (batchStart === 0) {
    var cleanupResult = cleanupOldLogEntries(90);
    Logger.log("Auto-cleanup: Removed " + (cleanupResult.jhaDeleted + cleanupResult.weeklyDeleted + cleanupResult.monthlyDeleted) + " old log entries");
  }
  // === END OPTION B SETUP ===

      var issues = [];
      var complianceRecords = []; // Track all compliance reports (even with no issues)
      var pendingCorrections = []; // Track job number corrections that need approval
      var unknownJobsEncountered = []; // Track unknown jobs for user assignment
      var processedCount = 0;
      var skippedCount = 0;
      var lastProcessedIndex = 0;
      var logsCreated = { jha: 0, weekly: 0, monthly: 0 }; // Track Option B logs

      for (var tidx = 0; tidx < batchThreads.length && !timedOut; tidx++) {
        var thread = batchThreads[tidx];
        var messages = thread.getMessages();

        for (var midx = 0; midx < messages.length && !timedOut; midx++) {
          var message = messages[midx];
          var messageId = message.getId();

          // Check time remaining - if under 30 seconds, stop processing
          var elapsedMs = new Date().getTime() - startTime;
          if (elapsedMs > MAX_EXECUTION_MS) {
            Logger.log("⏱️ Timeout prevention: Stopping after " + Math.round(elapsedMs/1000) + " seconds to avoid 6-minute limit");
            timedOut = true;
            break;
          }

          // Skip if already processed
          if (existingEmailIds[messageId]) {
            skippedCount++;
            continue;
          }

          var parsed = parseSafetyEmail(message, skipPdfExtraction);
          lastProcessedIndex = tidx;
          if (parsed) {
            // === OPTION B: Log to audit trail sheets ===
            // This creates a complete audit trail in JHA Log, Weekly Safety Log, Monthly Checklist Log
            var logResult = logParsedSafetyEmail(parsed, message, jobResolutionContext);
            if (logResult.logged) {
              if (logResult.logSheet === JHA_LOG_SHEET_NAME) logsCreated.jha++;
              else if (logResult.logSheet === WEEKLY_SAFETY_LOG_SHEET_NAME) logsCreated.weekly++;
              else if (logResult.logSheet === MONTHLY_CHECKLIST_LOG_SHEET_NAME) logsCreated.monthly++;
            }
            // === END OPTION B LOGGING ===

            // Track unknown jobs that need user assignment
            // NOTE: "User skipped" jobs are silently ignored (user already decided to skip them)
            if (parsed.skippedReason === "Job not on Employee sheet" && parsed.reportMeta && parsed.reportMeta.jobNumber) {
              // Check if we haven't already encountered this job number in this batch
              var alreadyTracked = unknownJobsEncountered.some(function(uj) {
                return uj.jobNumber === parsed.reportMeta.jobNumber;
              });
              if (!alreadyTracked) {
                var reportDateStr = parsed.reportMeta.date ?
                  Utilities.formatDate(parsed.reportMeta.date, Session.getScriptTimeZone(), "MM/dd/yyyy") : 'Unknown';
                var receivedDateStr = message.getDate() ?
                  Utilities.formatDate(message.getDate(), Session.getScriptTimeZone(), "MM/dd/yyyy") : 'Unknown';
                unknownJobsEncountered.push({
                  jobNumber: parsed.reportMeta.jobNumber,
                  reportType: parsed.reportMeta.reportType || 'Unknown',
                  subject: parsed.reportMeta.subject || '',
                  date: reportDateStr,
                  receivedDate: receivedDateStr,
                  messageId: messageId
                });
                Logger.log("Unknown job tracked for user assignment: " + parsed.reportMeta.jobNumber);
              }
            } else if (parsed.skippedReason === "User skipped") {
              // User already decided to skip this job - log it but don't prompt again
              Logger.log("Silently skipping user-skipped job: " + (parsed.reportMeta ? parsed.reportMeta.jobNumber : 'unknown'));
              skippedCount++;
            }

            // Track job number corrections that need approval (not remembered)
            if (parsed.jobNormalization && parsed.jobNormalization.wasChanged && !parsed.jobNormalization.wasRemembered) {
              pendingCorrections.push({
                messageId: messageId,
                reportType: parsed.reportMeta ? parsed.reportMeta.reportType : 'Unknown',
                subject: parsed.reportMeta ? parsed.reportMeta.subject : '',
                original: parsed.jobNormalization.original,
                normalized: parsed.jobNormalization.normalized
              });
            }

            // Always add equipment issues if found
            if (parsed.issues && parsed.issues.length > 0) {
              issues = issues.concat(parsed.issues);
            }

            // For JHA, Safety Meeting, Safety Checklist, Fleet Checklist, create a compliance record even if no equipment issues
            // This allows compliance tracking to see all received reports
            if (parsed.reportMeta && (
              parsed.reportMeta.reportType === 'JHA' ||
              parsed.reportMeta.reportType === 'Safety Meeting' ||
              parsed.reportMeta.reportType === 'Safety Checklist' ||
              parsed.reportMeta.reportType === 'Fleet Checklist'
            )) {
              var meta = parsed.reportMeta;
              // Only log if we have a valid job number and it wasn't skipped
              if (meta.jobNumber && !parsed.skippedReason) {
                // Check if we already have an equipment issue row for this email
                var hasIssueRow = parsed.issues && parsed.issues.length > 0;
                if (!hasIssueRow) {

                  // Handle multiple JHAs per email (when PDF contains multiple Date Completed entries)
                  var datesToProcess = [];
                  if (meta.reportType === 'JHA' && meta.multipleJHADates && meta.multipleJHADates.length > 0) {
                    // Multiple JHAs in one email - create a record for each
                    datesToProcess = meta.multipleJHADates;
                    Logger.log("Processing " + datesToProcess.length + " JHAs from single email for job " + meta.jobNumber);
                  } else if (meta.date) {
                    // Single report - just use the main date
                    datesToProcess = [meta.date];
                  }

                  // Create a compliance record for each date
                  for (var dIdx = 0; dIdx < datesToProcess.length; dIdx++) {
                    var reportDate = datesToProcess[dIdx];

                    // Check if THIS specific date was submitted late
                    var isLate = isReportLate(reportDate, meta.receivedDate);

                    // Build notes with late submission indicator
                    var recordNotes = '';
                    if (isLate) {
                      var receivedDateStr = meta.receivedDate ? Utilities.formatDate(meta.receivedDate, Session.getScriptTimeZone(), "MM/dd/yyyy") : 'Unknown';
                      recordNotes = 'LATE SUBMISSION - Received ' + receivedDateStr;
                      Logger.log("Recording LATE submission for " + meta.reportType + " date " + reportDate.toDateString() + " job " + meta.jobNumber);
                    }

                    // Add note about date source
                    if (meta.dateSource === 'pdf' && datesToProcess.length > 1) {
                      recordNotes = (recordNotes ? recordNotes + '. ' : '') + 'Date from PDF (' + (dIdx + 1) + ' of ' + datesToProcess.length + ' JHAs in email)';
                    } else if (meta.dateSource === 'pdf') {
                      recordNotes = (recordNotes ? recordNotes + '. ' : '') + 'Date from PDF Date Completed field';
                    }

                    // Create a "No Issues" row for compliance tracking
                    complianceRecords.push([
                      reportDate,          // Report Date (from PDF Date Completed)
                      meta.reportType,     // Report Type (JHA, Safety Meeting, Safety Checklist, Fleet Checklist)
                      meta.jobNumber,      // Job Number
                      meta.foreman,        // Foreman
                      '',                  // Vehicle Number (N/A for JHA/SM)
                      'No Issues',         // Equipment Type - indicates this is just for tracking
                      isLate ? 'Report received LATE - submitted after week deadline' : 'Report received - no equipment issues', // Issue Description
                      'Resolved',          // Status - auto-resolved since no issues
                      '',                  // FE Test Date
                      meta.messageId,      // Source Email ID
                      recordNotes,         // Notes - includes LATE indicator and date source
                      meta.subject,        // Email Subject
                      meta.receivedDate    // Received Date (when email was actually received)
                    ]);
                  }
                }
              }
            }

            processedCount++;
          }
        } // end messages loop
      } // end threads loop

      // If we timed out, save progress and return early
      if (timedOut) {
        var actualProcessed = batchStart + lastProcessedIndex;
        props.setProperty('SAFETY_BATCH_START', actualProcessed.toString());
        Logger.log("Timed out - saved progress at thread " + actualProcessed + " of " + allThreads.length);

        return {
          complete: false,
          timedOut: true,
          batchNumber: Math.floor(batchStart / batchSize) + 1,
          totalBatches: Math.ceil(allThreads.length / batchSize),
          processedThisBatch: processedCount,
          skippedThisBatch: skippedCount,
          issuesThisBatch: issues.length,
          totalThreads: allThreads.length,
          threadsProcessed: actualProcessed,
          threadsRemaining: allThreads.length - actualProcessed,
          elapsedSeconds: Math.round((new Date().getTime() - startTime) / 1000),
          message: "Stopping to prevent timeout. Click 'Continue Processing' to resume."
        };
      }

      // Check if we have unknown jobs that need user assignment FIRST
      // This takes priority over corrections - user must assign foremen before processing can continue
      if (unknownJobsEncountered.length > 0) {
        // Store pending data for unknown jobs resolution
        props.setProperty('PENDING_SAFETY_ISSUES', JSON.stringify(issues));
        props.setProperty('PENDING_COMPLIANCE_RECORDS', JSON.stringify(complianceRecords));
        props.setProperty('PENDING_UNKNOWN_JOBS', JSON.stringify(unknownJobsEncountered));
        props.setProperty('PENDING_BATCH_START', batchStart.toString());
        props.setProperty('PENDING_BATCH_END', batchEnd.toString());
        props.setProperty('PENDING_TOTAL_THREADS', allThreads.length.toString());

        Logger.log("Found " + unknownJobsEncountered.length + " unknown job numbers needing user assignment");

        return {
          needsJobAssignment: true,
          unknownJobs: unknownJobsEncountered,
          batchNumber: Math.floor(batchStart / batchSize) + 1,
          totalBatches: Math.ceil(allThreads.length / batchSize),
          processedThisBatch: processedCount,
          skippedThisBatch: skippedCount,
          issuesThisBatch: issues.length,
          complianceRecordsCount: complianceRecords.length,
          totalThreads: allThreads.length
        };
      }

      // Check if we have any pending corrections that need approval
      if (pendingCorrections.length > 0) {
        // Store pending data for approval dialog
        props.setProperty('PENDING_SAFETY_ISSUES', JSON.stringify(issues));
        props.setProperty('PENDING_COMPLIANCE_RECORDS', JSON.stringify(complianceRecords));
        props.setProperty('PENDING_JOB_CORRECTIONS', JSON.stringify(pendingCorrections));
        props.setProperty('PENDING_BATCH_END', batchEnd.toString());
        props.setProperty('PENDING_TOTAL_THREADS', allThreads.length.toString());

        Logger.log("Found " + pendingCorrections.length + " job number corrections needing approval");

        return {
          needsApproval: true,
          corrections: pendingCorrections,
          batchNumber: Math.floor(batchStart / batchSize) + 1,
          totalBatches: Math.ceil(allThreads.length / batchSize),
          processedThisBatch: processedCount,
          issuesThisBatch: issues.length,
          complianceRecordsCount: complianceRecords.length
        };
      }

      // Write equipment issues to sheet (NOT compliance records - those go only to Safety Compliance sheet)
      if (issues.length > 0) {
        var lastRow = sheet.getLastRow();
        sheet.getRange(lastRow + 1, 1, issues.length, 12).setValues(issues);
        applyStatusFormatting(sheet, lastRow + 1, issues.length);
      }

      // NOTE: Compliance records (JHA/Safety Meeting tracking) are NO LONGER written to Safety Reports
      // JHA tracking is handled by the Safety Compliance sheet which shows the ✅/❌ grid per crew per day
      // Safety Reports is now ONLY for actual equipment issues that need attention
      //
      // We still process complianceRecords for the auto-correction feature, but don't write them to Safety Reports
      if (complianceRecords.length > 0) {
        Logger.log("Processed " + complianceRecords.length + " compliance records (for Safety Compliance sheet - NOT written to Safety Reports)");

        // Auto-correct past week compliance data when JHA PDFs have dates from earlier weeks
        // This handles batched JHAs where email is received in current week but contains work from past weeks
        var currentWeekForCorrection = getWeekBoundaries(new Date());
        var correctionResult = autoCorrectPastWeekCompliance(complianceRecords, currentWeekForCorrection.weekStart);
        if (correctionResult.correctionsApplied > 0) {
          Logger.log("Auto-corrected " + correctionResult.correctionsApplied + " past week compliance entries");
        }
      }

      // Update batch progress
      var isComplete = batchEnd >= allThreads.length;
      if (isComplete) {
        props.deleteProperty('SAFETY_BATCH_START');

    // Store timestamp with date AND time for accurate tracking
    // Note: Gmail after: filter only supports dates, but we track time for user display
    // Duplicate prevention via existingEmailIds handles same-day processing
    var today = new Date();
    var dateStr = Utilities.formatDate(today, Session.getScriptTimeZone(), 'yyyy/MM/dd');
    var fullTimestamp = Utilities.formatDate(today, Session.getScriptTimeZone(), 'yyyy/MM/dd HH:mm:ss');
    props.setProperty('LAST_SAFETY_EMAIL_DATE', dateStr); // For Gmail filter
    props.setProperty('LAST_SAFETY_EMAIL_TIMESTAMP', fullTimestamp); // For display
    Logger.log("All batches complete! Set last processed: " + fullTimestamp);
  } else {
    props.setProperty('SAFETY_BATCH_START', batchEnd.toString());
    Logger.log("Batch complete. Progress: " + batchEnd + " / " + allThreads.length);
  }

  // Get the full timestamp for display (if available)
  var lastProcessedTimestamp = props.getProperty('LAST_SAFETY_EMAIL_TIMESTAMP') || lastProcessedDate || 'Never';

  var result = {
    complete: isComplete,
    batchNumber: Math.floor(batchStart / batchSize) + 1,
    totalBatches: Math.ceil(allThreads.length / batchSize),
    processedThisBatch: processedCount,
    skippedThisBatch: skippedCount,
    issuesThisBatch: issues.length,
    complianceRecordsAdded: complianceRecords.length,
    logsCreated: logsCreated, // Option B: show log counts
    totalThreads: allThreads.length,
    threadsProcessed: batchEnd,
    threadsRemaining: allThreads.length - batchEnd,
    newOnlyMode: newOnlyMode,
    lastProcessedDate: lastProcessedTimestamp
  };

  // When all batches are complete, run compliance tracking
  if (isComplete) {
    try {
      Logger.log("Running compliance tracking from log sheets (Option B)...");
      var today = new Date();
      var currentWeekBounds = getWeekBoundaries(today);

      // ALWAYS process the PREVIOUS week first (this is where tasks should be created)
      // The previous week's deadline has definitely passed, so we can create tasks for missing reports
      var previousWeekStart = new Date(currentWeekBounds.weekStart);
      previousWeekStart.setDate(previousWeekStart.getDate() - 7);
      var previousWeekBounds = getWeekBoundaries(previousWeekStart);

      Logger.log("Processing PREVIOUS week from logs: " + Utilities.formatDate(previousWeekBounds.weekStart, Session.getScriptTimeZone(), "MM/dd/yyyy"));
      var previousWeekData = calculateComplianceFromLogs(previousWeekBounds.weekStart);

      var tasksCreated = 0;
      if (previousWeekData) {
        updateComplianceSheetFromLogs(previousWeekData);
        // Previous week is always past deadline, so create tasks for missing reports
        tasksCreated = createMissingReportTasks(previousWeekData);
        Logger.log("Previous week tasks created: " + tasksCreated);
      }

      // Now process current week (for display purposes - won't create tasks since not past deadline)
      Logger.log("Processing CURRENT week from logs: " + Utilities.formatDate(currentWeekBounds.weekStart, Session.getScriptTimeZone(), "MM/dd/yyyy"));
      var complianceData = calculateComplianceFromLogs(currentWeekBounds.weekStart);

      // Update compliance sheet for current week
      if (complianceData) {
        updateComplianceSheetFromLogs(complianceData);
      }

      // Also finalize any OTHER past weeks that still show "Pending" (older than previous week)
      var pastWeekResult = finalizePastWeeksCompliance();
      tasksCreated += pastWeekResult.tasksCreated;

      // Sort and format the compliance sheet (newest weeks at top)
      formatComplianceSheetByWeek();
      Logger.log("Compliance sheet formatted - newest week now at top");

      // Add compliance stats to result (show current week to user)
      if (complianceData) {
        result.compliance = {
          weekStart: Utilities.formatDate(complianceData.weekStart, Session.getScriptTimeZone(), "MM/dd"),
          weekEnd: Utilities.formatDate(complianceData.weekEnd, Session.getScriptTimeZone(), "MM/dd/yyyy"),
          compliantCount: complianceData.compliantCount,
          missingCount: complianceData.missingCount,
          totalCrews: complianceData.totalCrews,
          isPastDeadline: complianceData.isPastDeadline,
          tasksCreated: tasksCreated,
          crews: []
        };

        // Also add previous week stats for reference
        if (previousWeekData) {
          result.previousWeek = {
            weekStart: Utilities.formatDate(previousWeekData.weekStart, Session.getScriptTimeZone(), "MM/dd"),
            weekEnd: Utilities.formatDate(previousWeekData.weekEnd, Session.getScriptTimeZone(), "MM/dd/yyyy"),
            compliantCount: previousWeekData.compliantCount,
            missingCount: previousWeekData.missingCount,
            totalCrews: previousWeekData.totalCrews,
            tasksCreated: tasksCreated
          };
        }

        // Add crew details for display
        for (var jobNumber in complianceData.crews) {
          var crew = complianceData.crews[jobNumber];
          // Convert crew.days object to jha array for UI (days are stored as crew.days['Sun'], etc.)
          // Use defensive access in case days object is missing
          var days = crew.days || {};
          var jhaArray = [
            days['Sun'] || 'N/A',
            days['Mon'] || '⏳',
            days['Tue'] || '⏳',
            days['Wed'] || '⏳',
            days['Thu'] || '⏳',
            days['Fri'] || '⏳',
            days['Sat'] || 'N/A'
          ];
          result.compliance.crews.push({
            jobNumber: jobNumber,
            foreman: crew.foreman || '',
            jha: jhaArray,
            weeklyMeeting: crew.weeklyMeetingStatus || '⏳',
            monthlyChecklist: crew.monthlyChecklistStatus || '⏳',
            status: crew.status || 'Unassigned'
          });
        }

        // Combine uncredited jobs from both weeks (deduplicated)
        var allUncreditedJobs = {};

        // Add from current week
        if (complianceData.uncreditedJobs) {
          for (var ui = 0; ui < complianceData.uncreditedJobs.length; ui++) {
            var uj = complianceData.uncreditedJobs[ui];
            if (!allUncreditedJobs[uj.jobNumber]) {
              allUncreditedJobs[uj.jobNumber] = uj;
            } else {
            // Merge dates and report types
            for (var rt = 0; rt < uj.reportTypes.length; rt++) {
              if (allUncreditedJobs[uj.jobNumber].reportTypes.indexOf(uj.reportTypes[rt]) === -1) {
                allUncreditedJobs[uj.jobNumber].reportTypes.push(uj.reportTypes[rt]);
              }
            }
            for (var dt = 0; dt < uj.dates.length; dt++) {
              if (allUncreditedJobs[uj.jobNumber].dates.indexOf(uj.dates[dt]) === -1) {
                allUncreditedJobs[uj.jobNumber].dates.push(uj.dates[dt]);
              }
            }
          }
        }
      }

      // Add from previous week
      if (previousWeekData && previousWeekData.uncreditedJobs) {
        for (var pi = 0; pi < previousWeekData.uncreditedJobs.length; pi++) {
          var puj = previousWeekData.uncreditedJobs[pi];
          if (!allUncreditedJobs[puj.jobNumber]) {
            allUncreditedJobs[puj.jobNumber] = puj;
          } else {
            // Merge dates and report types
            for (var prt = 0; prt < puj.reportTypes.length; prt++) {
              if (allUncreditedJobs[puj.jobNumber].reportTypes.indexOf(puj.reportTypes[prt]) === -1) {
                allUncreditedJobs[puj.jobNumber].reportTypes.push(puj.reportTypes[prt]);
              }
            }
            for (var pdt = 0; pdt < puj.dates.length; pdt++) {
              if (allUncreditedJobs[puj.jobNumber].dates.indexOf(puj.dates[pdt]) === -1) {
                allUncreditedJobs[puj.jobNumber].dates.push(puj.dates[pdt]);
              }
            }
          }
        }
      }

      // Convert to array for UI
      var uncreditedJobsList = [];
      for (var ujKey in allUncreditedJobs) {
        uncreditedJobsList.push(allUncreditedJobs[ujKey]);
      }

      if (uncreditedJobsList.length > 0) {
        result.uncreditedJobs = uncreditedJobsList;
        Logger.log("Found " + uncreditedJobsList.length + " uncredited job(s) in Safety Reports not matched to any tracked crew");
      }
      } // Close if (complianceData)

      Logger.log("Compliance tracking complete. Tasks created: " + tasksCreated);
    } catch (compError) {
      Logger.log("Error in compliance tracking: " + compError.toString());
      result.complianceError = compError.toString();
    }
  }

  return result;
}

/**
 * Shows dialog to process safety emails with custom date range
 */
function showProcessSafetyEmailsDialog() {
  var html = HtmlService.createHtmlOutputFromFile('ProcessSafetyEmailsDialog')
    .setWidth(550)
    .setHeight(700);
  SpreadsheetApp.getUi().showModalDialog(html, "Process Safety Emails");
}

/**
 * Normalizes malformed job numbers from OCR or text extraction errors
 * Examples:
 *   "332-6" -> "033-26" (missing leading zero, truncated year)
 *   "33-26" -> "033-26" (missing leading zero)
 *   "013-6" -> "013-26" (truncated year)
 *   "0013-26" -> "013-26" (extra digit)
 *
 * Expected format: NNN-YY (e.g., 013-26, 009-26)
 *
 * @param {string} jobNumber - Potentially malformed job number
 * @returns {Object} - { original, normalized, wasChanged }
 */
function normalizeJobNumber(jobNumber) {
  if (!jobNumber) return { original: "", normalized: "", wasChanged: false };

  var original = String(jobNumber).trim();

  // If already in correct format (NNN-YY), return as-is
  if (/^\d{3}-\d{2}$/.test(original)) {
    return { original: original, normalized: original, wasChanged: false };
  }

  // Try to fix common malformations
  var parts = original.split('-');
  if (parts.length !== 2) {
    // Can't fix if not in X-Y format
    return { original: original, normalized: original, wasChanged: false };
  }

  var prefix = parts[0];
  var suffix = parts[1];

  // Fix prefix: should be 3 digits
  prefix = prefix.replace(/^0+/, ''); // Remove all leading zeros first
  while (prefix.length < 3) {
    prefix = '0' + prefix; // Pad to 3 digits
  }
  if (prefix.length > 3) {
    prefix = prefix.slice(-3); // Take last 3 if too many
  }

  // Fix suffix: should be 2 digits (year)
  // Common issue: "6" instead of "26" (truncated year)
  suffix = suffix.replace(/^0+/, ''); // Remove leading zeros
  if (suffix.length === 1) {
    // Single digit - assume it's the ones place of a 2-digit year
    suffix = '2' + suffix; // e.g., "6" -> "26"
  }
  while (suffix.length < 2) {
    suffix = '0' + suffix;
  }
  if (suffix.length > 2) {
    suffix = suffix.slice(-2);
  }

  var normalized = prefix + '-' + suffix;
  var wasChanged = (normalized !== original);

  if (wasChanged) {
    Logger.log("Job number normalized: " + original + " -> " + normalized);
  }

  return { original: original, normalized: normalized, wasChanged: wasChanged };
}

/**
 * Gets saved job number corrections from ScriptProperties
 * @returns {Object} - Map of original -> corrected job numbers
 */
function getSavedJobNumberCorrections() {
  var props = PropertiesService.getScriptProperties();
  var saved = props.getProperty('JOB_NUMBER_CORRECTIONS');
  if (saved) {
    try {
      return JSON.parse(saved);
    } catch (e) {
      return {};
    }
  }
  return {};
}

/**
 * Saves a job number correction to remember for future processing
 * @param {string} original - Original malformed job number
 * @param {string} corrected - User-approved corrected job number
 */
function saveJobNumberCorrection(original, corrected) {
  var props = PropertiesService.getScriptProperties();
  var corrections = getSavedJobNumberCorrections();
  corrections[original] = corrected;
  props.setProperty('JOB_NUMBER_CORRECTIONS', JSON.stringify(corrections));
  Logger.log("Saved job number correction: " + original + " -> " + corrected);
}

/**
 * Clears all saved job number corrections
 */
function clearJobNumberCorrections() {
  var props = PropertiesService.getScriptProperties();
  props.deleteProperty('JOB_NUMBER_CORRECTIONS');
  SpreadsheetApp.getUi().alert("✅ Saved job number corrections cleared.");
}

/**
 * Applies job number normalization with saved corrections check
 * @param {string} jobNumber - Raw job number from email
 * @returns {Object} - { original, normalized, wasChanged, wasRemembered }
 */
function applyJobNumberNormalization(jobNumber) {
  if (!jobNumber) return { original: "", normalized: "", wasChanged: false, wasRemembered: false };

  var original = String(jobNumber).trim();

  // First check if we have a saved correction for this exact original
  var savedCorrections = getSavedJobNumberCorrections();
  if (savedCorrections[original]) {
    return {
      original: original,
      normalized: savedCorrections[original],
      wasChanged: true,
      wasRemembered: true
    };
  }

  // Otherwise, apply automatic normalization
  var result = normalizeJobNumber(original);
  result.wasRemembered = false;
  return result;
}

/**
 * Applies user-approved job number corrections and logs records to Safety Reports
 * Called from approval dialog when user clicks "Apply & Log"
 *
 * @param {string} approvalsJson - JSON string of approvals array
 * @returns {Object} - Result object to continue batch processing
 */
function applyJobNumberCorrections(approvalsJson) {
  var props = PropertiesService.getScriptProperties();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("Safety Reports");

  if (!sheet) {
    return { complete: true, error: "Safety Reports sheet not found" };
  }

  try {
    var approvals = JSON.parse(approvalsJson);
    var pendingIssues = JSON.parse(props.getProperty('PENDING_SAFETY_ISSUES') || '[]');
    var pendingCompliance = JSON.parse(props.getProperty('PENDING_COMPLIANCE_RECORDS') || '[]');
    var pendingCorrections = JSON.parse(props.getProperty('PENDING_JOB_CORRECTIONS') || '[]');
    var batchEnd = parseInt(props.getProperty('PENDING_BATCH_END') || '0');
    var totalThreads = parseInt(props.getProperty('PENDING_TOTAL_THREADS') || '0');

    Logger.log("Applying " + approvals.length + " corrections");

    // Build map of original -> new corrected job number
    var correctionMap = {};
    var skippedOriginals = [];

    for (var i = 0; i < approvals.length; i++) {
      var approval = approvals[i];
      var originalCorrection = pendingCorrections[approval.index];

      if (!originalCorrection) continue;

      if (approval.skip) {
        skippedOriginals.push(originalCorrection.original);
        Logger.log("Skipping record with job: " + originalCorrection.original);
      } else {
        correctionMap[originalCorrection.normalized] = approval.corrected;

        // If user wants to remember this correction
        if (approval.remember) {
          saveJobNumberCorrection(originalCorrection.original, approval.corrected);
        }
      }
    }

    // Filter out skipped records and apply corrections to issues
    var finalIssues = [];
    for (var i = 0; i < pendingIssues.length; i++) {
      var issue = pendingIssues[i];
      var jobNum = issue[2]; // Column C is job number

      // Check if this issue's original job number is in skip list
      var shouldSkip = false;
      for (var j = 0; j < pendingCorrections.length; j++) {
        if (pendingCorrections[j].normalized === jobNum && skippedOriginals.indexOf(pendingCorrections[j].original) !== -1) {
          shouldSkip = true;
          break;
        }
      }

      if (shouldSkip) continue;

      // Apply user's correction if different from auto-normalized
      if (correctionMap[jobNum]) {
        issue[2] = correctionMap[jobNum];
      }
      finalIssues.push(issue);
    }

    // Filter out skipped records and apply corrections to compliance records
    var finalCompliance = [];
    for (var i = 0; i < pendingCompliance.length; i++) {
      var record = pendingCompliance[i];
      var jobNum = record[2]; // Column C is job number

      // Check if should skip
      var shouldSkip = false;
      for (var j = 0; j < pendingCorrections.length; j++) {
        if (pendingCorrections[j].normalized === jobNum && skippedOriginals.indexOf(pendingCorrections[j].original) !== -1) {
          shouldSkip = true;
          break;
        }
      }

      if (shouldSkip) continue;

      // Apply user's correction if different
      if (correctionMap[jobNum]) {
        record[2] = correctionMap[jobNum];
      }
      finalCompliance.push(record);
    }

    // Write equipment issues to sheet (NOT compliance records)
    if (finalIssues.length > 0) {
      var lastRow = sheet.getLastRow();
      sheet.getRange(lastRow + 1, 1, finalIssues.length, 12).setValues(finalIssues);
      applyStatusFormatting(sheet, lastRow + 1, finalIssues.length);
      Logger.log("Wrote " + finalIssues.length + " issues to sheet");
    }

    // NOTE: Compliance records are NO LONGER written to Safety Reports
    // JHA tracking is handled by the Safety Compliance sheet which shows the ✅/❌ grid per crew per day
    // Safety Reports is now ONLY for actual equipment issues that need attention
    if (finalCompliance.length > 0) {
      Logger.log("Processed " + finalCompliance.length + " compliance records (for Safety Compliance - NOT written to Safety Reports)");

      // Auto-correct past week compliance data when JHA PDFs have dates from earlier weeks
      var currentWeekForCorrection = getWeekBoundaries(new Date());
      var correctionResult = autoCorrectPastWeekCompliance(finalCompliance, currentWeekForCorrection.weekStart);
      if (correctionResult.correctionsApplied > 0) {
        Logger.log("Auto-corrected " + correctionResult.correctionsApplied + " past week compliance entries");
      }
    }

    // Clear pending data
    props.deleteProperty('PENDING_SAFETY_ISSUES');
    props.deleteProperty('PENDING_COMPLIANCE_RECORDS');
    props.deleteProperty('PENDING_JOB_CORRECTIONS');
    props.deleteProperty('PENDING_BATCH_END');
    props.deleteProperty('PENDING_TOTAL_THREADS');

    // Update last processed timestamp
    var today = new Date();
    var dateStr = Utilities.formatDate(today, Session.getScriptTimeZone(), 'yyyy/MM/dd');
    var fullTimestamp = Utilities.formatDate(today, Session.getScriptTimeZone(), 'yyyy/MM/dd HH:mm:ss');
    props.setProperty('LAST_SAFETY_EMAIL_DATE', dateStr);
    props.setProperty('LAST_SAFETY_EMAIL_TIMESTAMP', fullTimestamp);

    // Run compliance tracking
    var complianceResult = null;
    var tasksCreated = 0;
    try {
      Logger.log("Running compliance tracking after corrections...");
      var weekBounds = getWeekBoundaries(new Date());
      var complianceData = calculateSafetyCompliance(weekBounds.weekStart);

      if (complianceData) {
        updateComplianceSheet(complianceData);

        if (complianceData.isPastDeadline) {
          tasksCreated = createMissingReportTasks(complianceData);
        }

        var pastWeekResult = finalizePastWeeksCompliance();
        tasksCreated += pastWeekResult.tasksCreated;

        complianceResult = {
          weekStart: Utilities.formatDate(complianceData.weekStart, Session.getScriptTimeZone(), "MM/dd"),
          weekEnd: Utilities.formatDate(complianceData.weekEnd, Session.getScriptTimeZone(), "MM/dd/yyyy"),
          compliantCount: complianceData.compliantCount,
          missingCount: complianceData.missingCount,
          totalCrews: complianceData.totalCrews,
          isPastDeadline: complianceData.isPastDeadline,
          tasksCreated: tasksCreated,
          crews: []
        };

        for (var jobNumber in complianceData.crews) {
          var crew = complianceData.crews[jobNumber];
          complianceResult.crews.push({
            jobNumber: jobNumber,
            foreman: crew.foreman,
            jha: [crew.jhaSun, crew.jhaMon, crew.jhaTue, crew.jhaWed, crew.jhaThu, crew.jhaFri, crew.jhaSat],
            weeklyMeeting: crew.weeklyMeeting,
            monthlyChecklist: crew.monthlyChecklist,
            status: crew.status
          });
        }
      }
    } catch (compError) {
      Logger.log("Error in compliance tracking: " + compError.toString());
    }

    return {
      complete: true,
      processedThisBatch: finalIssues.length + finalCompliance.length,
      skippedThisBatch: skippedOriginals.length,
      issuesThisBatch: finalIssues.length,
      complianceRecordsAdded: finalCompliance.length,
      totalThreads: totalThreads,
      threadsProcessed: batchEnd,
      newOnlyMode: true,
      lastProcessedDate: fullTimestamp,
      compliance: complianceResult,
      correctionsApplied: approvals.length - skippedOriginals.length
    };

  } catch (e) {
    Logger.log("Error applying corrections: " + e.toString());
    return { complete: true, error: e.toString() };
  }
}

/**
 * Cancels pending job number corrections and discards batch data
 * Called from approval dialog when user clicks "Cancel"
 */
function cancelPendingCorrections() {
  var props = PropertiesService.getScriptProperties();

  props.deleteProperty('PENDING_SAFETY_ISSUES');
  props.deleteProperty('PENDING_COMPLIANCE_RECORDS');
  props.deleteProperty('PENDING_JOB_CORRECTIONS');
  props.deleteProperty('PENDING_BATCH_END');
  props.deleteProperty('PENDING_TOTAL_THREADS');
  props.deleteProperty('SAFETY_BATCH_START');

  Logger.log("Pending corrections cancelled and batch data cleared");
}

/**
 * Parses safety email and extracts equipment issues
 *
 * @param {GmailMessage} message - Gmail message object
 * @param {boolean} skipPdfExtraction - If true, skip slow PDF extraction and use subject date only
 * @returns {Object} - {issues: [[row data]], reportMeta: {...}, jobNormalization: {...}}
 */
function parseSafetyEmail(message, skipPdfExtraction) {
  // Get skipPdfExtraction from script properties if not passed directly
  if (skipPdfExtraction === undefined) {
    var props = PropertiesService.getScriptProperties();
    skipPdfExtraction = props.getProperty('SKIP_PDF_EXTRACTION') === 'true';
  }

  try {
    var subject = message.getSubject();
    var body = message.getPlainBody();
    var date = message.getDate();
    var messageId = message.getId();
    var sender = message.getFrom();

    // Determine report type
    var reportType = "";
    var jobNumber = "";
    var vehicleNumber = "";
    var reportDate = date;

    if (subject.indexOf("Safety Checklist Report") !== -1) {
      // Safety Checklist Report format: "Safety Checklist Report 578-033-26 01-15-2026"
      // Also supports X# format: "Safety Checklist Report X6-033-26 01-15-2026"
      // or "Fwd: Safety Checklist Report 578-033-26 01-15-2026"
      reportType = "Safety Checklist";

      // Extract equipment number and job number from subject
      // Format: 578-033-26 or X6-033-26 where 578/X6 is equipment#, 033-26 is job number
      // Equipment can be: numeric (578) or X# format (X1, X6, etc.)

      // First, try to extract the standard format
      var checklistMatch = subject.match(/Safety Checklist Report\s+(X?\d+)-(\d{3}-\d{1,2})\s+(\d{2}-\d{2}-\d{4})/i);
      if (checklistMatch) {
        vehicleNumber = checklistMatch[1].toUpperCase(); // Equipment number (578 or X6)
        jobNumber = checklistMatch[2];      // Job number (033-26)
        // Parse the date from subject (format: MM-DD-YYYY)
        var dateParts = checklistMatch[3].split('-');
        if (dateParts.length === 3) {
          // Use noon UTC to avoid timezone issues that cause off-by-one-day
          var month = parseInt(dateParts[0]) - 1; // 0-indexed
          var day = parseInt(dateParts[1]);
          var year = parseInt(dateParts[2]);
          reportDate = new Date(year, month, day, 12, 0, 0);
          Logger.log("Parsed date from subject: " + reportDate.toDateString());
        }
      } else {
        // Try more flexible parsing for X# vehicles
        // Match: X followed by digits, then a dash, then anything until a space/date
        var xVehicleMatch = subject.match(/Safety Checklist Report\s+(X\d+)-([^\s]+)\s+(\d{2}-\d{2}-\d{4})/i);
        if (xVehicleMatch) {
          vehicleNumber = xVehicleMatch[1].toUpperCase(); // X6, X1, etc.
          jobNumber = xVehicleMatch[2];      // Whatever follows (may be malformed)
          // Try to parse the date
          var dateParts = xVehicleMatch[3].split('-');
          if (dateParts.length === 3) {
            var month = parseInt(dateParts[0]) - 1;
            var day = parseInt(dateParts[1]);
            var year = parseInt(dateParts[2]);
            reportDate = new Date(year, month, day, 12, 0, 0);
          }
          Logger.log("Parsed X# vehicle from subject: " + vehicleNumber);
        } else {
          // Fallback: try to extract any numeric equipment number
          var altMatch = subject.match(/(X?\d+)-(\d{3}-\d{1,2})/i);
          if (altMatch) {
            vehicleNumber = altMatch[1].toUpperCase();
            jobNumber = altMatch[2];
          }
        }
      }
      Logger.log("Safety Checklist detected - Equipment: " + vehicleNumber + ", Job: " + jobNumber);

    } else if (subject.indexOf("Job Hazard Report") !== -1) {
      reportType = "JHA";
      // Subject format: "Job Hazard Report 02-03-2026_009-26_24193851_HEL..."
      // or "Fwd: Job Hazard Report 02-03-2026_009-26_24193851_HEL..."
      // Also handles: "Job Hazard Report 02-09-2026_015-26_24193885_560 huckleberry...(Modified-23)"
      Logger.log("Processing JHA email subject: " + subject.substring(0, 100));
      var jhaMatch = subject.match(/Job Hazard Report\s+(\d{2}-\d{2}-\d{4})_(\d{3}-\d{2})/i);
      var subjectDate = null; // Date from subject (fallback)
      if (jhaMatch) {
        // Parse the date from subject (format: MM-DD-YYYY) - used as fallback
        var dateParts = jhaMatch[1].split('-');
        if (dateParts.length === 3) {
          var month = parseInt(dateParts[0]) - 1; // 0-indexed
          var day = parseInt(dateParts[1]);
          var year = parseInt(dateParts[2]);
          subjectDate = new Date(year, month, day, 12, 0, 0);
          reportDate = subjectDate; // Will be overridden by PDF date if found
          Logger.log("Parsed JHA subject date: " + subjectDate.toDateString() + ", Job: " + jhaMatch[2] + (subject.indexOf("Modified") !== -1 ? " (Modified version)" : ""));
        }
        jobNumber = jhaMatch[2];
      } else {
        // Fallback: just extract job number
        Logger.log("JHA regex did not match subject: " + subject);
        var jobMatch = subject.match(/(\d{3}-\d{2})/);
        jobNumber = jobMatch ? jobMatch[1] : "";
      }

    } else if (subject.indexOf("Safety Meeting Report") !== -1) {
      reportType = "Safety Meeting";
      // Subject format: "Safety Meeting Report  Week of 02-02-2026 Safety Topic 015-26"
      // or "Fwd: Safety Meeting Report  Week of 02-02-2026 Safety Topic 015-26"
      var meetingMatch = subject.match(/Week of\s+(\d{2}-\d{2}-\d{4}).*?(\d{3}-\d{2})/i);
      if (meetingMatch) {
        // Parse the date from subject (format: MM-DD-YYYY)
        var dateParts = meetingMatch[1].split('-');
        if (dateParts.length === 3) {
          var month = parseInt(dateParts[0]) - 1; // 0-indexed
          var day = parseInt(dateParts[1]);
          var year = parseInt(dateParts[2]);
          reportDate = new Date(year, month, day, 12, 0, 0);
          Logger.log("Parsed Safety Meeting date from subject: " + reportDate.toDateString());
        }
        jobNumber = meetingMatch[2];
      } else {
        // Fallback: just extract job number
        var jobMatch = subject.match(/(\d{3}-\d{2})/);
        jobNumber = jobMatch ? jobMatch[1] : "";
      }

    } else if (subject.indexOf("Weekly Safety Repairs") !== -1) {
      reportType = "Fleet Checklist";
      var jobMatch = subject.match(/(\d{3}-\d{2})/);
      jobNumber = jobMatch ? jobMatch[1] : "";

    } else {
      return { issues: [] };
    }

    // Start with email body text
    var fullText = body;
    var jhaDateOverrides = []; // Holds dates extracted from PDF for JHAs (may have multiple per email)

    // Extract PDF content for Safety Checklist reports (required - all data is in PDF)
    // This is slow (~5-10 seconds per PDF) but necessary for equipment issues
    // NOTE: Can be skipped with skipPdfExtraction=true for compliance-only mode
    if (reportType === "Safety Checklist" && !skipPdfExtraction) {
      Logger.log("Processing Safety Checklist PDF for job " + jobNumber + "...");
      var attachments = message.getAttachments();

      for (var i = 0; i < attachments.length; i++) {
        var attachment = attachments[i];
        var contentType = attachment.getContentType();
        var fileName = attachment.getName().toLowerCase();

        if (contentType === 'application/pdf' || fileName.endsWith('.pdf')) {
          Logger.log("Extracting PDF: " + attachment.getName() + " (" + Math.round(attachment.getSize()/1024) + "KB)");
          try {
            // Convert PDF to text using Drive API (slow ~5-10 seconds)
            var pdfText = extractTextFromPDF(attachment);
            if (pdfText && pdfText.length > 50) {
              fullText += "\n\n[PDF CONTENT]\n" + pdfText;
              Logger.log("Extracted " + pdfText.length + " chars from PDF");
            }
          } catch (pdfError) {
            Logger.log("PDF extraction failed: " + pdfError.toString());
          }
          // Only process first PDF per email
          break;
        }
      }
    } else if (reportType === "Safety Checklist" && skipPdfExtraction) {
      Logger.log("⚡ FAST MODE: Skipping Safety Checklist PDF extraction for job " + jobNumber + " - equipment issues won't be extracted");
    }

    // Extract PDF content for JHA reports to get actual "Date Completed" from the PDF
    // This is important because the email subject date may differ from actual work dates
    // PROCESSES ALL PDFs in the email (some emails have multiple JHA PDFs)
    // NOTE: This is SLOW (~5-10 sec per PDF). Can be skipped with skipPdfExtraction=true
    if (reportType === "JHA" && !skipPdfExtraction) {
      Logger.log("Processing ALL JHA PDFs for job " + jobNumber + " to extract Date Completed...");
      var attachments = message.getAttachments();
      var pdfCount = 0;
      var allPdfDates = []; // Collect dates from ALL PDFs

      for (var i = 0; i < attachments.length; i++) {
        var attachment = attachments[i];
        var contentType = attachment.getContentType();
        var fileName = attachment.getName().toLowerCase();

        // Skip non-PDF attachments (images, etc.)
        if (contentType !== 'application/pdf' && !fileName.endsWith('.pdf')) {
          Logger.log("Skipping non-PDF attachment: " + attachment.getName() + " (" + contentType + ")");
          continue;
        }

        pdfCount++;
        Logger.log("Extracting JHA PDF #" + pdfCount + ": " + attachment.getName() + " (" + Math.round(attachment.getSize()/1024) + "KB)");

        try {
          // Convert PDF to text using Drive API
          var pdfText = extractTextFromPDF(attachment);
          if (pdfText && pdfText.length > 50) {
            fullText += "\n\n[PDF #" + pdfCount + " CONTENT]\n" + pdfText;
            Logger.log("Extracted " + pdfText.length + " chars from PDF #" + pdfCount);

            // Extract all "Date Completed" values from THIS PDF
            var thisPdfDates = extractDatesCompletedFromJHAPDF(pdfText);

            if (thisPdfDates.length > 0) {
              Logger.log("PDF #" + pdfCount + " contains " + thisPdfDates.length + " Date Completed entries:");
              for (var d = 0; d < thisPdfDates.length; d++) {
                Logger.log("  - " + thisPdfDates[d].toDateString());
                // Add to allPdfDates if not duplicate
                var isDup = allPdfDates.some(function(existing) {
                  return existing.getTime() === thisPdfDates[d].getTime();
                });
                if (!isDup) {
                  allPdfDates.push(thisPdfDates[d]);
                }
              }
            } else {
              Logger.log("PDF #" + pdfCount + ": No Date Completed found in this PDF");
            }
          } else {
            Logger.log("PDF #" + pdfCount + ": Extraction returned empty or minimal text");
          }
        } catch (pdfError) {
          Logger.log("PDF #" + pdfCount + " extraction failed: " + pdfError.toString());
        }
        // DO NOT BREAK - process ALL PDFs in the email
      }

      Logger.log("Total PDFs processed: " + pdfCount + ", Total unique dates found: " + allPdfDates.length);

      // Use all collected dates
      jhaDateOverrides = allPdfDates;

      if (jhaDateOverrides.length > 0) {
        // Sort dates chronologically
        jhaDateOverrides.sort(function(a, b) { return a.getTime() - b.getTime(); });

        Logger.log("Final combined Date Completed entries from all PDFs:");
        for (var d = 0; d < jhaDateOverrides.length; d++) {
          Logger.log("  - " + jhaDateOverrides[d].toDateString());
        }
        // Use the FIRST date as the primary report date (for single-JHA emails)
        reportDate = jhaDateOverrides[0];
        Logger.log("Using PDF Date Completed: " + reportDate.toDateString() + " (subject date was: " + (subjectDate ? subjectDate.toDateString() : "unknown") + ")");
      } else {
        Logger.log("No Date Completed found in any PDF, using subject date: " + (reportDate ? reportDate.toDateString() : "unknown"));
      }
    } else if (reportType === "JHA" && skipPdfExtraction) {
      Logger.log("⚡ FAST MODE: Skipping JHA PDF extraction for job " + jobNumber + " - using subject date instead");
    }

    // Extract vehicle number from fleet checklist if not already set
    if (!vehicleNumber && reportType === "Fleet Checklist") {
      vehicleNumber = extractVehicleNumber(fullText);
    }

    // Normalize job number to fix OCR/parsing errors (e.g., "332-6" -> "033-26")
    var jobNormalization = applyJobNumberNormalization(jobNumber);
    var originalJobNumber = jobNumber;
    jobNumber = jobNormalization.normalized;

    if (jobNormalization.wasChanged && !jobNormalization.wasRemembered) {
      Logger.log("Job number needs approval: " + jobNormalization.original + " -> " + jobNormalization.normalized);
    }

    // Lookup foreman by job number - checks custom mappings first, then secondary job numbers, then primary
    var foremanResult = lookupForemanWithCustomMapping(jobNumber, null);
    var foreman = foremanResult.name || "";

    Logger.log("Job " + jobNumber + " lookup result: name=" + foreman + ", jobExists=" + foremanResult.jobExists + ", source=" + foremanResult.source);

    // Build report metadata for compliance tracking
    // Check if this report was submitted late (received after the week it was due)
    var isLate = isReportLate(reportDate, date); // reportDate = actual work date (from PDF if available), date = email received date

    var reportMeta = {
      date: reportDate,
      receivedDate: date,  // When the email was actually received
      isLate: isLate,      // True if report was received after its week ended
      reportType: reportType,
      jobNumber: jobNumber,
      originalJobNumber: originalJobNumber,
      foreman: foreman,
      vehicleNumber: vehicleNumber,
      messageId: messageId,
      subject: subject,
      // Multiple JHA support - if PDF contains multiple Date Completed entries, they're stored here
      multipleJHADates: (reportType === 'JHA' && jhaDateOverrides && jhaDateOverrides.length > 1) ? jhaDateOverrides : null,
      dateSource: (reportType === 'JHA' && jhaDateOverrides && jhaDateOverrides.length > 0) ? 'pdf' : 'subject'
    };

    // Log late submissions
    if (isLate && (reportType === 'JHA' || reportType === 'Safety Meeting')) {
      var reportDateStr = Utilities.formatDate(reportDate, Session.getScriptTimeZone(), "MM/dd/yyyy");
      var receivedDateStr = Utilities.formatDate(date, Session.getScriptTimeZone(), "MM/dd/yyyy");
      Logger.log("⚠️ LATE SUBMISSION: " + reportType + " for " + reportDateStr + " received on " + receivedDateStr + " (Job: " + jobNumber + ")");
    }

    // Skip reports for job numbers not on the Employee sheet
    // BUT differentiate between user-skipped and genuinely unknown jobs
    if (jobNumber && !foremanResult.jobExists) {
      var skippedReason = foremanResult.source === 'skipped' ?
        "User skipped" :
        "Job not on Employee sheet";
      Logger.log("Skipping report - Job " + jobNumber + ": " + skippedReason);
      return { issues: [], skippedReason: skippedReason, reportMeta: reportMeta, jobNormalization: jobNormalization };
    }

    // Extract equipment issues based on report type
    // NOTE: JHA and Safety Meeting are for COMPLIANCE TRACKING ONLY (tracked in Safety Compliance sheet)
    //       They should NOT create equipment issue records in Safety Reports
    //       Only Safety Checklist and Fleet Checklist should log actual equipment issues
    var issues = [];

    if (reportType === "Safety Checklist") {
      // Parse Safety Checklist PDF content for actual equipment issues
      issues = extractSafetyChecklistIssues(fullText, reportMeta);
    } else if (reportType === "Fleet Checklist") {
      // Extract actual equipment issues reported in Fleet Checklist
      issues = extractEquipmentIssues(fullText, reportMeta);
    }
    // JHA and Safety Meeting: No equipment issue extraction - compliance only
    // These report types exist for attendance/compliance tracking via Safety Compliance sheet

    Logger.log("Parsed " + reportType + " - Job: " + jobNumber + " - Issues: " + issues.length);
    return { issues: issues, reportMeta: reportMeta, jobNormalization: jobNormalization };

  } catch (e) {
    Logger.log("Error parsing email: " + e.toString());
    return { issues: [] };
  }
}

/**
 * Extracts text content from a PDF attachment using Google Drive OCR
 * NOTE: This is slow (~5-10 seconds per PDF). Used sparingly for Safety Checklist reports.
 *
 * @param {GmailAttachment} attachment - PDF attachment
 * @returns {string} - Extracted text content
 */
function extractTextFromPDF(attachment) {
  var file = null;
  var docFile = null;

  try {
    // Limit PDF size to avoid timeouts (max 2MB)
    var size = attachment.getSize();
    if (size > 2 * 1024 * 1024) {
      Logger.log("PDF too large to process: " + (size / 1024 / 1024).toFixed(2) + "MB");
      return "";
    }

    // Create a temporary file in Drive
    var blob = attachment.copyBlob();
    file = DriveApp.createFile(blob);
    var fileId = file.getId();

    // Use Drive API to convert PDF to Google Doc (which extracts text)
    var resource = {
      title: file.getName(),
      mimeType: 'application/vnd.google-apps.document'
    };

    var doc = Drive.Files.copy(resource, fileId, {ocr: true});
    var docId = doc.id;

    // Get the text content from the converted doc
    docFile = DriveApp.getFileById(docId);
    var textContent = DocumentApp.openById(docId).getBody().getText();

    // Clean up temporary files
    if (file) file.setTrashed(true);
    if (docFile) docFile.setTrashed(true);

    return textContent;
  } catch (e) {
    Logger.log("PDF extraction error: " + e.toString());
    // Clean up on error
    try {
      if (file) file.setTrashed(true);
      if (docFile) docFile.setTrashed(true);
    } catch (cleanupError) {
      Logger.log("Cleanup error: " + cleanupError.toString());
    }
    return "";
  }
}

/**
 * Extracts "Date Completed" values from JHA PDF text
 * JHA PDFs may contain multiple JHAs, each with their own Date Completed field
 *
 * Common patterns in JHA PDFs:
 * - "Date Completed: 02/09/2026"
 * - "Date Completed 02-09-2026"
 * - "Date: 02/09/2026" (if near "Completed" text)
 * - "Completed: 02/09/26"
 * - "Date Completed\n02/09/2026" (newline separated)
 *
 * @param {string} pdfText - Extracted text from PDF
 * @returns {Array<Date>} - Array of Date objects (one per JHA found in PDF)
 */
function extractDatesCompletedFromJHAPDF(pdfText) {
  var dates = [];
  if (!pdfText) {
    Logger.log("extractDatesCompletedFromJHAPDF: No PDF text provided");
    return dates;
  }

  Logger.log("extractDatesCompletedFromJHAPDF: Processing " + pdfText.length + " chars of PDF text");

  // Debug: Log first 500 chars to see what we're working with
  Logger.log("extractDatesCompletedFromJHAPDF: First 500 chars: " + pdfText.substring(0, 500).replace(/[\r\n]+/g, ' '));

  // Normalize text: replace multiple whitespace/newlines with single space
  var normalizedText = pdfText.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ');
  var match;

  // ========== PATTERN 1: "Date Completed" variants ==========
  // Handles: "Date Completed: 02/09/2026", "Date Completed 02-09-2026", "DateCompleted02/09/26"
  var pattern1 = /Date\s*Completed[\s:]*(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})/gi;
  while ((match = pattern1.exec(normalizedText)) !== null) {
    var dateStr = match[1];
    Logger.log("extractDatesCompletedFromJHAPDF: Pattern1 matched: '" + match[0] + "' -> date: " + dateStr);
    var parsedDate = parseFlexibleDate(dateStr);
    if (parsedDate && !isNaN(parsedDate.getTime())) {
      if (!dates.some(function(d) { return d.getTime() === parsedDate.getTime(); })) {
        dates.push(parsedDate);
        Logger.log("extractDatesCompletedFromJHAPDF: ✓ Added from Pattern1: " + parsedDate.toDateString());
      }
    }
  }

  // ========== PATTERN 2: "Completed" alone with date ==========
  // Handles: "Completed: 02/09/2026", "Completed 02-09-2026"
  if (dates.length === 0) {
    var pattern2 = /Completed[\s:]*(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})/gi;
    while ((match = pattern2.exec(normalizedText)) !== null) {
      var dateStr = match[1];
      Logger.log("extractDatesCompletedFromJHAPDF: Pattern2 matched: '" + match[0] + "' -> date: " + dateStr);
      var parsedDate = parseFlexibleDate(dateStr);
      if (parsedDate && !isNaN(parsedDate.getTime())) {
        if (!dates.some(function(d) { return d.getTime() === parsedDate.getTime(); })) {
          dates.push(parsedDate);
          Logger.log("extractDatesCompletedFromJHAPDF: ✓ Added from Pattern2: " + parsedDate.toDateString());
        }
      }
    }
  }

  // ========== PATTERN 3: OCR variations with spaces/errors ==========
  // Handles: "Da te Comp leted", "Date Com pleted", "Date_Completed" (OCR artifacts)
  if (dates.length === 0) {
    var pattern3 = /Da\s*te\s*Com\s*p?\s*le\s*ted[\s:_]*(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})/gi;
    while ((match = pattern3.exec(normalizedText)) !== null) {
      var dateStr = match[1];
      Logger.log("extractDatesCompletedFromJHAPDF: Pattern3 (OCR) matched: '" + match[0] + "' -> date: " + dateStr);
      var parsedDate = parseFlexibleDate(dateStr);
      if (parsedDate && !isNaN(parsedDate.getTime())) {
        if (!dates.some(function(d) { return d.getTime() === parsedDate.getTime(); })) {
          dates.push(parsedDate);
          Logger.log("extractDatesCompletedFromJHAPDF: ✓ Added from Pattern3: " + parsedDate.toDateString());
        }
      }
    }
  }

  // ========== PATTERN 4: "Date:" near "JHA" or "Job Hazard" ==========
  // Handles: Forms where Date field is just "Date: MM/DD/YYYY"
  if (dates.length === 0) {
    // Look for "JHA" or "Job Hazard" followed within 200 chars by "Date: MM/DD/YYYY"
    var pattern4 = /(?:JHA|Job\s*Hazard)[\s\S]{0,200}Date[\s:]*(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})/gi;
    while ((match = pattern4.exec(normalizedText)) !== null) {
      var dateStr = match[1];
      Logger.log("extractDatesCompletedFromJHAPDF: Pattern4 (JHA Date) matched: date: " + dateStr);
      var parsedDate = parseFlexibleDate(dateStr);
      if (parsedDate && !isNaN(parsedDate.getTime())) {
        if (!dates.some(function(d) { return d.getTime() === parsedDate.getTime(); })) {
          dates.push(parsedDate);
          Logger.log("extractDatesCompletedFromJHAPDF: ✓ Added from Pattern4: " + parsedDate.toDateString());
        }
      }
    }
  }

  // ========== PATTERN 5: Look for any date after "Date" label ==========
  // Fallback: Generic "Date" followed by date value
  if (dates.length === 0) {
    var pattern5 = /\bDate[\s:]*(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})/gi;
    while ((match = pattern5.exec(normalizedText)) !== null) {
      var dateStr = match[1];
      Logger.log("extractDatesCompletedFromJHAPDF: Pattern5 (generic Date) matched: '" + match[0] + "' -> date: " + dateStr);
      var parsedDate = parseFlexibleDate(dateStr);
      if (parsedDate && !isNaN(parsedDate.getTime())) {
        // Only accept dates within reasonable range (2024-2027)
        var year = parsedDate.getFullYear();
        if (year >= 2024 && year <= 2027) {
          if (!dates.some(function(d) { return d.getTime() === parsedDate.getTime(); })) {
            dates.push(parsedDate);
            Logger.log("extractDatesCompletedFromJHAPDF: ✓ Added from Pattern5: " + parsedDate.toDateString());
          }
        }
      }
    }
  }

  // ========== PATTERN 6: Standalone date formats (last resort) ==========
  // Look for any MM/DD/YYYY or MM-DD-YYYY pattern - useful if OCR mangled the "Date Completed" label
  if (dates.length === 0) {
    Logger.log("extractDatesCompletedFromJHAPDF: No dates found yet, trying standalone date patterns");
    var pattern6 = /\b(\d{1,2}[\/\-]\d{1,2}[\/\-](202[4-7]|2[4-7]))\b/g;
    while ((match = pattern6.exec(normalizedText)) !== null) {
      var dateStr = match[1];
      Logger.log("extractDatesCompletedFromJHAPDF: Pattern6 (standalone) matched: " + dateStr);
      var parsedDate = parseFlexibleDate(dateStr);
      if (parsedDate && !isNaN(parsedDate.getTime())) {
        if (!dates.some(function(d) { return d.getTime() === parsedDate.getTime(); })) {
          dates.push(parsedDate);
          Logger.log("extractDatesCompletedFromJHAPDF: ✓ Added from Pattern6: " + parsedDate.toDateString());
        }
      }
    }
  }

  // Sort dates chronologically
  dates.sort(function(a, b) {
    return a.getTime() - b.getTime();
  });

  if (dates.length === 0) {
    Logger.log("extractDatesCompletedFromJHAPDF: ⚠️ NO DATES FOUND in PDF text. First 200 chars: " + normalizedText.substring(0, 200));
  } else {
    Logger.log("extractDatesCompletedFromJHAPDF: Total unique dates found: " + dates.length);
  }

  return dates;
}

/**
 * Parses a date string in various formats
 * Handles: MM/DD/YYYY, MM-DD-YYYY, MM/DD/YY, MM-DD-YY
 *
 * @param {string} dateStr - Date string to parse
 * @returns {Date|null} - Parsed Date or null if invalid
 */
function parseFlexibleDate(dateStr) {
  if (!dateStr) return null;

  // Try to extract month, day, year using regex
  var match = dateStr.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
  if (!match) return null;

  var month = parseInt(match[1], 10) - 1; // 0-indexed
  var day = parseInt(match[2], 10);
  var year = parseInt(match[3], 10);

  // Handle 2-digit year
  if (year < 100) {
    year += (year > 50) ? 1900 : 2000;
  }

  // Validate ranges
  if (month < 0 || month > 11 || day < 1 || day > 31 || year < 2000 || year > 2100) {
    return null;
  }

  return new Date(year, month, day, 12, 0, 0);
}

/**
 * Extracts equipment issues from email body text
 *
 * @param {string} body - Email body text
 * @param {Object} context - Metadata (date, reportType, jobNumber, etc.)
 * @returns {Array} - Array of row data arrays
 */
function extractEquipmentIssues(body, context) {
  var issues = [];
  var lines = body.split("\n");

  // Equipment keywords to search for
  var equipmentKeywords = {
    "fire extinguisher": "Fire Extinguisher",
    "extinguisher": "Fire Extinguisher",
    "hot stick": "Hot Stick",
    "hotstick": "Hot Stick",
    "rubber goods": "Rubber Goods",
    "rubber glove": "Rubber Goods",
    "rubber sleeve": "Rubber Goods",
    "signs": "Signs",
    "sign": "Signs",
    "wheel chock": "Wheel Chocks",
    "chock": "Wheel Chocks",
    "inspection tag": "Inspection Tag",
    "tag": "Inspection Tag"
  };

  // Mechanical keywords to ignore
  var mechanicalKeywords = [
    "brake", "brakes", "engine", "oil", "tire", "tires", "battery",
    "transmission", "clutch", "alternator", "starter", "radiator",
    "suspension", "exhaust", "fuel", "coolant", "filter"
  ];

  lines.forEach(function(line) {
    var lineLower = line.toLowerCase().trim();

    // Skip empty lines
    if (lineLower.length < 5) return;

    // Skip mechanical issues
    var isMechanical = false;
    for (var i = 0; i < mechanicalKeywords.length; i++) {
      if (lineLower.indexOf(mechanicalKeywords[i]) !== -1) {
        isMechanical = true;
        break;
      }
    }
    if (isMechanical) return;

    // Check for equipment keywords
    for (var keyword in equipmentKeywords) {
      if (lineLower.indexOf(keyword) !== -1) {
        var equipmentType = equipmentKeywords[keyword];
        var testDate = extractDateFromText(line);

        // Clean up the description (remove extra whitespace)
        var description = line.trim().replace(/\s+/g, ' ');

        issues.push([
          context.date,                    // Report Date
          context.reportType,              // Report Type
          context.jobNumber,               // Job Number
          context.foreman,                 // Foreman
          context.vehicleNumber,           // Vehicle Number
          equipmentType,                   // Equipment Type
          description,                     // Issue Description
          "Needs Attention",               // Status
          testDate || "",                  // Test/Expiration Date
          context.messageId,               // Source Email ID
          "",                              // Notes
          context.subject || ""            // Email Subject
        ]);

        // Only match once per line
        break;
      }
    }
  });

  return issues;
}

/**
 * Extracts dates from text (e.g., "01.01.24" or "1/1/2024" or "01-01-2024")
 *
 * @param {string} text - Text to search for dates
 * @returns {Date|string} - Parsed date or empty string
 */
function extractDateFromText(text) {
  // Match patterns: 01.01.24, 1/1/2024, 01-01-2024
  var dateMatch = text.match(/(\d{1,2})[\.\/\-](\d{1,2})[\.\/\-](\d{2,4})/);
  if (dateMatch) {
    var month = parseInt(dateMatch[1]);
    var day = parseInt(dateMatch[2]);
    var year = parseInt(dateMatch[3]);

    // Handle 2-digit years
    if (year < 100) {
      year += 2000;
    }

    // Validate date components
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31 && year >= 2020 && year <= 2030) {
      return new Date(year, month - 1, day);
    }
  }
  return "";
}

/**
 * Extracts safety equipment issues from Safety Checklist Report PDF content
 *
 * ONLY creates issues when equipment actually needs attention:
 * - "No" answers for good condition questions
 * - "Yes" answers for "need more" questions
 * - Expired fire extinguisher test dates (> 1 year old)
 *
 * @param {string} pdfText - Extracted text from PDF
 * @param {Object} context - Metadata (date, reportType, jobNumber, etc.)
 * @returns {Array} - Array of row data arrays for issues found
 */
function extractSafetyChecklistIssues(pdfText, context) {
  var issues = [];

  if (!pdfText || pdfText.length < 50) {
    Logger.log("Safety Checklist: No PDF text to parse");
    return issues;
  }

  Logger.log("Parsing Safety Checklist PDF (" + pdfText.length + " chars)");

  // Normalize text - remove excessive whitespace
  var text = pdfText.replace(/\s+/g, ' ');

  // If job number is missing from subject, try to extract from PDF
  if (!context.jobNumber) {
    var jobMatch = text.match(/job\s*#?\s*:?\s*(\d{3}-\d{2})/i);
    if (jobMatch) {
      context.jobNumber = jobMatch[1];
      Logger.log("Extracted job number from PDF: " + context.jobNumber);
      // Try to lookup foreman again
      var foremanResult = lookupForemanByJobNumber(context.jobNumber);
      context.foreman = foremanResult.name || "";
    }
  }

  // If date is still the email date, try to extract from PDF
  // PDF format: "Date:Jan 29, 2026" or "Date: 01/29/2026"
  var pdfDateMatch = text.match(/date\s*:?\s*([A-Za-z]{3,9}\s+\d{1,2},?\s+\d{4})/i);
  if (!pdfDateMatch) {
    pdfDateMatch = text.match(/date\s*:?\s*(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4})/i);
  }
  if (pdfDateMatch) {
    try {
      var extractedDate = new Date(pdfDateMatch[1]);
      if (!isNaN(extractedDate.getTime())) {
        // Use noon to avoid timezone issues
        context.date = new Date(extractedDate.getFullYear(), extractedDate.getMonth(), extractedDate.getDate(), 12, 0, 0);
        Logger.log("Extracted date from PDF: " + context.date.toDateString());
      }
    } catch (e) {
      Logger.log("Could not parse PDF date: " + e);
    }
  }

  // Track equipment already flagged to avoid duplicates
  var flagged = {};
  var testDate = ""; // Placeholder for non-FE issues to avoid undefined reference

  /**
   * Helper to check for equipment issues
   * @param {string} equipmentType - Equipment category for column F
   * @param {string} fieldLabel - Readable field name for description
   * @param {RegExp} pattern - Pattern to match (must capture Yes/No/NA)
   * @param {string} issueValue - "no" or "yes" - which value indicates a problem
       * @param {string} issueText - Text describing the issue (e.g., "not in good condition")
       */
      function checkEquipment(equipmentType, fieldLabel, pattern, issueValue, issueText) {
        var match = text.match(pattern);
        if (match && match[1]) {
          var value = match[1].toLowerCase();
          var flagKey = equipmentType + "_" + fieldLabel;

          if (value === issueValue && !flagged[flagKey]) {
            flagged[flagKey] = true;
            Logger.log("  ** ISSUE: " + equipmentType + " - " + fieldLabel + ": " + value);

            // Clean description: "Equipment - Issue"
            var description = equipmentType + " - " + (issueText || fieldLabel + ": " + value.toUpperCase());

            issues.push([
              context.date,                    // Report Date
              context.reportType,              // Report Type
              context.jobNumber,               // Job Number
              context.foreman,                 // Foreman
              context.vehicleNumber,           // Vehicle Number
              equipmentType,                   // Equipment Type
              description,                     // Issue Description
              "Needs Attention",               // Status
              testDate || "",                  // Test/Expiration Date
              context.messageId,               // Source Email ID
              "",                              // Notes
              context.subject || ""            // Email Subject
            ]);

            // Only match once per equipment type
            return;
          }
        }
      }

  // ==== GENERAL EQUIPMENT SECTION ====

  // First Aid Kit
  checkEquipment("First Aid Kit", "Fully Stocked", /fully\s*stocked\s*:?\s*(yes|no)/i, "no", "Not fully stocked");

  // Cones
  checkEquipment("Cones", "Good Condition", /cones\s+good\s*condition\s*\??\s*:?\s*(yes|no)/i, "no", "Cones not in good condition");

  // Triangles
  checkEquipment("Triangles", "Good Condition", /triangles?\s+good\s*condition\s*\??\s*:?\s*(yes|no)/i, "no", "Triangles not in good condition");
  checkEquipment("Triangles", "Need More", /triangles?[^]*?need\s*more\s*\??\s*:?\s*(yes|no)/i, "yes", "Need more triangles");

  // Signs
  checkEquipment("Signs", "Good Condition", /signs?\s+good\s*condition\s*\??\s*:?\s*(yes|no)/i, "no", "Signs not in good condition");
  checkEquipment("Signs", "Full Set", /signs?[^]*?full\s*set\s*\??\s*:?\s*(yes|no)/i, "no", "Signs - not a full set");

  // Hot Sticks
  checkEquipment("Hot Sticks", "Good Condition", /hot\s*sticks?\s+good\s*condition\s*\??\s*:?\s*(yes|no)/i, "no", "Hot Sticks not in good condition");

  // Insulated Jumpers
  checkEquipment("Insulated Jumpers", "Good Condition", /insulated\s*jumpers?\s+good\s*condition\s*\??\s*:?\s*(yes|no)/i, "no", "Insulated Jumpers not in good condition");

  // Crane Log Books
  checkEquipment("Crane Log Books", "Log Book in Unit", /crane\s*log\s*books?\s+log\s*book\s*in\s*unit\s*\??\s*:?\s*(yes|no)/i, "no", "Crane log book not in unit");

  // Mileage Books
  checkEquipment("Mileage Books", "Need New Book", /mileage\s*books?\s+need\s*new\s*book\s*\??\s*:?\s*(yes|no)/i, "yes", "Mileage book needs replacing");

  // ==== FIRE EXTINGUISHER SECTION ====

  // First, extract the Fire Extinguisher Test Date (we'll add it to all FE issues)
  // Pattern matches: "Test date: Oct 29, 2025" or "Test Date Oct 29, 2025"
  var feTestMatch = text.match(/fire\s*extinguisher[^]*?test\s*date\s*:?\s*([A-Za-z]{3,9}\s+\d{1,2},?\s+\d{4})/i);
  if (!feTestMatch) {
    // Try matching just test date near fire extinguisher context
    feTestMatch = text.match(/test\s*date\s*:?\s*([A-Za-z]{3,9}\s+\d{1,2},?\s+\d{4})/i);
  }

  var feTestDate = null;
  var feExpirationDate = null;
  var feIsExpired = false;

  if (feTestMatch) {
    var testDateStr = feTestMatch[1];
    Logger.log("  Found Fire Extinguisher Test Date: " + testDateStr);

    try {
      feTestDate = new Date(testDateStr);
      if (!isNaN(feTestDate.getTime())) {
        // Calculate expiration (1 year from test date)
        feExpirationDate = new Date(feTestDate);
        feExpirationDate.setFullYear(feExpirationDate.getFullYear() + 1);
        feIsExpired = (new Date() > feExpirationDate);
        Logger.log("  FE Test Date: " + feTestDate.toDateString() + ", Expires: " + feExpirationDate.toDateString() + ", Expired: " + feIsExpired);
      }
    } catch (e) {
      Logger.log("  Could not parse FE test date: " + e);
      feTestDate = null;
    }
  }

  // Helper function specifically for Fire Extinguisher issues (includes test date in column I)
  function checkFireExtinguisher(fieldLabel, pattern, issueValue, issueText) {
    var match = text.match(pattern);
    if (match && match[1]) {
      var value = match[1].toLowerCase();
      var flagKey = "Fire Extinguisher_" + fieldLabel;

      if (value === issueValue && !flagged[flagKey]) {
        flagged[flagKey] = true;
        Logger.log("  ** ISSUE: Fire Extinguisher - " + fieldLabel + ": " + value);

        issues.push([
          context.date,                    // A: Report Date
          context.reportType,              // B: Report Type
          context.jobNumber,               // C: Job Number
          context.foreman,                 // D: Foreman
          context.vehicleNumber,           // E: Vehicle Number
          "Fire Extinguisher",             // F: Equipment Type
          issueText,                       // G: Issue Description
          "Needs Attention",               // H: Status
          feTestDate || "",                // I: FE Test Date (always include if available)
          context.messageId,               // J: Source Email ID
          "",                              // K: Notes
          context.subject || ""            // L: Email Subject
        ]);
      }
    }
  }

  // Check fire extinguisher conditions
  checkFireExtinguisher("Properly Charged", /properly\s*charged\s*\??\s*:?\s*(yes|no)/i, "no", "Fire Extinguisher - not properly charged");
  checkFireExtinguisher("Monthly Inspection", /monthly\s*inspection\s*done\s*:?\s*(yes|no)/i, "no", "Fire Extinguisher - monthly inspection not done");
  checkFireExtinguisher("Tag Signed Off", /tag\s*signed\s*off\s*\??\s*:?\s*(yes|no)/i, "no", "Fire Extinguisher - tag not signed off");

  // Check if fire extinguisher is expired (based on test date)
  if (feIsExpired && !flagged["Fire Extinguisher_Expired"]) {
    flagged["Fire Extinguisher_Expired"] = true;

    issues.push([
      context.date,
      context.reportType,
      context.jobNumber,
      context.foreman,
      context.vehicleNumber,
      "Fire Extinguisher",
      "Fire Extinguisher EXPIRED - Last test: " + Utilities.formatDate(feTestDate, Session.getScriptTimeZone(), "MMM dd, yyyy") + " (expired " + Utilities.formatDate(feExpirationDate, Session.getScriptTimeZone(), "M/d/yyyy") + ")",
      "Needs Attention",
      feTestDate,  // Column I: FE Test Date
      context.messageId,
      "",
      context.subject || ""  // L: Email Subject
    ]);
    Logger.log("  ** ISSUE: Fire Extinguisher Expired");
  }

  // ==== AED SECTION ====
  checkEquipment("AED", "Damage Visible", /any\s*damage\s*visible\s*\??\s*:?\s*(yes|no)/i, "yes", "AED has visible damage");
  checkEquipment("AED", "2 Sets of Pads", /2\s*sets?\s*of\s*defibrillation\s*pads\s*\.?\s*:?\s*(yes|no)/i, "no", "AED does not have 2 sets of pads");

  // ==== FALL PROTECTION SECTION ====
  checkEquipment("Fall Protection", "Good Condition", /fall\s*protection\s*gear\s+good\s*condition\s*\??\s*:?\s*(yes|no)/i, "no", "Fall Protection gear not in good condition");

  // Harnesses/Lanyards
  checkEquipment("Harnesses/Lanyards", "Good Condition", /harnesses?\s*\/?\s*lanyards?\s+good\s*condition\s*\??\s*:?\s*(yes|no)/i, "no", "Harnesses/Lanyards not in good condition");

  // ==== TOOLS SECTION ====
  checkEquipment("Hot Hoist", "Good Condition", /hot\s*hoist\s+good\s*condition\s*\??\s*:?\s*(yes|no)/i, "no", "Hot Hoist not in good condition");
  checkEquipment("Chains/Chokers/Slings", "Tagged", /chains?,?\s*chokers?,?\s*slings?\s+tagged\s*\??\s*:?\s*(yes|no)/i, "no", "Chains/Chokers/Slings not tagged");
  checkEquipment("Barriers", "Good Condition", /barriers?\s+good\s*condition\s*\??\s*:?\s*(yes|no)/i, "no", "Barriers not in good condition");

  // ==== TRUCKS SECTION ====
  // NOTE: We intentionally do NOT track mechanical items like Brakes, Lights, Mirrors, Windows, etc.
  // These are vehicle maintenance issues, not safety equipment issues.
  // Only Horn and Wipers are safety-related (visibility and signaling) but even those
  // are vehicle maintenance, not the safety equipment this report is designed to track.

  // REMOVED: Wipers, Horn, Reflectors, Warning Lights, Brakes, Lights, Mirrors,
  //          Windshield, Defrost, Windows, Heater, Seat Belts
  // These are all vehicle mechanical/maintenance items that should go to Fleet, not Safety Manager

  // ==== MISC COMMENTS SECTION ====
  // DISABLED: The OCR text is too messy to reliably extract meaningful comments
  // The regex was picking up garbage like "Reflectors:Warning Lights:Windows:Defrost:Wind..."
  // If there are real issues, they'll show up in the specific equipment checks above

  Logger.log("Safety Checklist parsed - " + issues.length + " issues found");
  return issues;
}

// ============================================================================
// FOREMAN LOOKUP FUNCTIONS
// ============================================================================

/**
 * Gets classification priority for determining who is in charge of a crew
 * Lower number = higher priority
 *
 * @param {string} classification - Employee classification (e.g., "F", "GF", "JRY")
 * @returns {number} - Priority (lower = higher priority)
 */
function getClassificationPriority(classification) {
  var classLower = String(classification).toLowerCase().trim();

  // Superintendent = highest
  if (classLower === 'sup') return 1;
  // General Foreman
  if (classLower === 'gf') return 2;
  // Foreman
  if (classLower === 'f') return 3;
  // GTO Foreman
  if (classLower === 'gto f') return 4;
  // GTO
  if (classLower === 'gto') return 5;
  // Journeyman
  if (classLower === 'jry' || classLower === 'jl') return 6;
  // Journey Operator
  if (classLower === 'jry op') return 7;
  // Working Technician
  if (classLower === 'wt') return 8;
  // Equipment Operators
  if (classLower === 'eo 1' || classLower === 'eo1') return 9;
  if (classLower === 'eo 2' || classLower === 'eo2') return 10;
  // Apprentices (7th year = highest, 1st year = lowest)
  if (classLower.match(/^ap\s*7/)) return 20;
  if (classLower.match(/^ap\s*6/)) return 21;
  if (classLower.match(/^ap\s*5/)) return 22;
  if (classLower.match(/^ap\s*4/)) return 23;
  if (classLower.match(/^ap\s*3/)) return 24;
  if (classLower.match(/^ap\s*2/)) return 25;
  if (classLower.match(/^ap\s*1/)) return 26;
  // All others
  return 99;
}

/**
 * Extracts the position suffix from a job number (e.g., "039-26.1" returns 1)
 * Lower suffix = higher priority (foreman is .1)
 *
 * @param {string} jobNumber - Full job number with suffix
 * @returns {number} - Position number (1 = foreman), 999 if no suffix
 */
function getJobPositionSuffix(jobNumber) {
  if (!jobNumber) return 999;
  var parts = String(jobNumber).split('.');
  if (parts.length === 2) {
    var suffix = parseInt(parts[1]);
    if (!isNaN(suffix)) return suffix;
  }
  return 999; // No suffix = lowest priority
}

/**
 * Looks up the foreman (person in charge) for a crew by job number
 * Priority: 1) Job number suffix (.1 = foreman), 2) Classification
 *
 * @param {string} jobNumber - Job number (e.g., "013-26")
 * @returns {Object} - {name: string, jobExists: boolean}
 */
function lookupForemanByJobNumber(jobNumber) {
  if (!jobNumber) return { name: "", jobExists: false };

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var employeeSheet = ss.getSheetByName("Employees");
  if (!employeeSheet) return { name: "", jobExists: false };

  var data = employeeSheet.getDataRange().getValues();
  var headers = data[0];

  // Find column indices dynamically
  var nameCol = -1, jobCol = -1, classCol = -1, secondaryJobCol = -1;
  for (var h = 0; h < headers.length; h++) {
    var header = String(headers[h]).toLowerCase().trim();
    if (header === "name" || header === "employee" || header === "employee name") nameCol = h;
    if (header === "job number") jobCol = h;
    if (header === "secondary job number") secondaryJobCol = h;
    if (header === "job classification" || header === "classification") classCol = h;
  }

  if (nameCol === -1) nameCol = 0;
  if (jobCol === -1) return { name: "", jobExists: false };

  // Debug logging for troubleshooting
  Logger.log("lookupForemanByJobNumber: Searching for job " + jobNumber);
  Logger.log("lookupForemanByJobNumber: Column indices - nameCol=" + nameCol + ", jobCol=" + jobCol + ", secondaryJobCol=" + secondaryJobCol);

  // Collect all employees for this crew (check both primary and secondary job columns)
  var crewMembers = [];
  var jobExists = false;

  for (var i = 1; i < data.length; i++) {
    var empJobNumber = String(data[i][jobCol]).trim();
    var empSecondaryJob = secondaryJobCol !== -1 ? String(data[i][secondaryJobCol]).trim() : "";
    var empName = String(data[i][nameCol]).trim();
    var classification = classCol !== -1 ? String(data[i][classCol]).trim() : "";

    // Match job number prefix in primary job (e.g., "013-26" matches "013-26.1", "013-26.2")
    var matchesPrimary = empJobNumber && empJobNumber.indexOf(jobNumber) === 0;
    // Also check secondary job number
    var matchesSecondary = empSecondaryJob && empSecondaryJob.indexOf(jobNumber) === 0;

    // Debug: Log matches for the specific job we're looking for
    if (matchesPrimary || matchesSecondary) {
      Logger.log("lookupForemanByJobNumber: MATCH - " + empName + " (primary=" + empJobNumber + ", secondary=" + empSecondaryJob + ")");
      jobExists = true;
      crewMembers.push({
        name: empName,
        jobNumber: matchesPrimary ? empJobNumber : empSecondaryJob,
        positionSuffix: getJobPositionSuffix(matchesPrimary ? empJobNumber : empSecondaryJob),
        classificationPriority: getClassificationPriority(classification),
        isPrimary: matchesPrimary  // Track if this is their primary job
      });
    }
  }

  if (crewMembers.length === 0) {
    return { name: "", jobExists: jobExists };
  }

  // Sort by: 1) Primary job holders first, 2) Position suffix (lower = foreman), 3) Classification priority
  crewMembers.sort(function(a, b) {
    // Primary job holders take precedence
    if (a.isPrimary !== b.isPrimary) {
      return a.isPrimary ? -1 : 1;
    }
    // Then check for .1 suffix (foreman position)
    if (a.positionSuffix !== b.positionSuffix) {
      return a.positionSuffix - b.positionSuffix;
    }
    // If same position, use classification
    return a.classificationPriority - b.classificationPriority;
  });

  return { name: crewMembers[0].name, jobExists: true };
}

/**
 * Looks up phone number for the person in charge of a crew by job number
 * Priority: 1) Primary job holders, 2) Job number suffix (.1 = foreman), 3) Classification
 *
 * @param {string} jobNumber - Job number (e.g., "013-26")
 * @returns {string} - Phone number or empty string
 */
function lookupForemanPhoneByJobNumber(jobNumber) {
  if (!jobNumber) return "";

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var employeeSheet = ss.getSheetByName("Employees");
  if (!employeeSheet) return "";

  var data = employeeSheet.getDataRange().getValues();
  var headers = data[0];

  // Find column indices dynamically
  var nameCol = -1, jobCol = -1, classCol = -1, phoneCol = -1, secondaryJobCol = -1;
  for (var h = 0; h < headers.length; h++) {
    var header = String(headers[h]).toLowerCase().trim();
    if (header === "name" || header === "employee" || header === "employee name") nameCol = h;
    if (header === "job number") jobCol = h;
    if (header === "secondary job number") secondaryJobCol = h;
    if (header === "job classification" || header === "classification") classCol = h;
    if (header === "phone" || header === "phone number") phoneCol = h;
  }

  if (nameCol === -1) nameCol = 0;
  if (jobCol === -1 || phoneCol === -1) return "";

  // Collect all employees for this crew (check both primary and secondary job)
  var crewMembers = [];

  for (var i = 1; i < data.length; i++) {
    var empJobNumber = String(data[i][jobCol]).trim();
    var empSecondaryJob = secondaryJobCol !== -1 ? String(data[i][secondaryJobCol]).trim() : "";
    var classification = classCol !== -1 ? String(data[i][classCol]).trim() : "";
    var phone = data[i][phoneCol] || "";

    // Match job number prefix in primary or secondary job
    var matchesPrimary = empJobNumber && empJobNumber.indexOf(jobNumber) === 0;
    var matchesSecondary = empSecondaryJob && empSecondaryJob.indexOf(jobNumber) === 0;

    if (matchesPrimary || matchesSecondary) {
      crewMembers.push({
        jobNumber: matchesPrimary ? empJobNumber : empSecondaryJob,
        phone: phone,
        positionSuffix: getJobPositionSuffix(matchesPrimary ? empJobNumber : empSecondaryJob),
        classificationPriority: getClassificationPriority(classification),
        isPrimary: matchesPrimary
      });
    }
  }

  if (crewMembers.length === 0) return "";

  // Sort by: 1) Primary job holders first, 2) Position suffix (lower = foreman), 3) Classification priority
  crewMembers.sort(function(a, b) {
    if (a.isPrimary !== b.isPrimary) {
      return a.isPrimary ? -1 : 1;
    }
    if (a.positionSuffix !== b.positionSuffix) {
      return a.positionSuffix - b.positionSuffix;
    }
    return a.classificationPriority - b.classificationPriority;
  });

  return crewMembers[0].phone;
}

/**
 * Looks up location for a crew by job number
 * Uses the foreman's location (person with .1 suffix or highest classification)
 * Checks both primary and secondary job number columns
 *
 * @param {string} jobNumber - Job number (e.g., "013-26")
 * @returns {string} - Location or empty string
 */
function lookupLocationByJobNumber(jobNumber) {
  if (!jobNumber) return "";

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var employeeSheet = ss.getSheetByName("Employees");
  if (!employeeSheet) return "";

  var data = employeeSheet.getDataRange().getValues();
  var headers = data[0];

  // Find column indices dynamically
  var jobCol = -1, classCol = -1, locationCol = -1, secondaryJobCol = -1;
  for (var h = 0; h < headers.length; h++) {
    var header = String(headers[h]).toLowerCase().trim();
    if (header === "job number") jobCol = h;
    if (header === "secondary job number") secondaryJobCol = h;
    if (header === "job classification" || header === "classification") classCol = h;
    if (header === "location") locationCol = h;
  }

  if (jobCol === -1 || locationCol === -1) return "";

  // Collect all employees for this crew (check both primary and secondary job)
  var crewMembers = [];

  for (var i = 1; i < data.length; i++) {
    var empJobNumber = String(data[i][jobCol]).trim();
    var empSecondaryJob = secondaryJobCol !== -1 ? String(data[i][secondaryJobCol]).trim() : "";
    var classification = classCol !== -1 ? String(data[i][classCol]).trim() : "";
    var location = data[i][locationCol] || "";

    // Match job number prefix in primary or secondary job
    var matchesPrimary = empJobNumber && empJobNumber.indexOf(jobNumber) === 0;
    var matchesSecondary = empSecondaryJob && empSecondaryJob.indexOf(jobNumber) === 0;

    if (matchesPrimary || matchesSecondary) {
      crewMembers.push({
        jobNumber: matchesPrimary ? empJobNumber : empSecondaryJob,
        location: location,
        positionSuffix: getJobPositionSuffix(matchesPrimary ? empJobNumber : empSecondaryJob),
        classificationPriority: getClassificationPriority(classification),
        isPrimary: matchesPrimary
      });
    }
  }

  if (crewMembers.length === 0) return "";

  // Sort by: 1) Primary job holders first, 2) Position suffix (lower = foreman), 3) Classification priority
  crewMembers.sort(function(a, b) {
    if (a.isPrimary !== b.isPrimary) {
      return a.isPrimary ? -1 : 1;
    }
    if (a.positionSuffix !== b.positionSuffix) {
      return a.positionSuffix - b.positionSuffix;
    }
    return a.classificationPriority - b.classificationPriority;
  });

  return crewMembers[0].location;
}


/**
 * Determines if a safety report was submitted late (received after its week ended)
 * A report is late if the email was received in a different (later) week than the report date
 *
 * Example: JHA for 02/13/2026 (week of 02/08) received on 02/16/2026 (week of 02/15) = LATE
 *
 * @param {Date} reportDate - The date the report covers (from email subject)
 * @param {Date} receivedDate - The date the email was received
 * @returns {boolean} - True if the report was submitted late
 */
function isReportLate(reportDate, receivedDate) {
  if (!reportDate || !receivedDate) return false;

  var reportWeek = getWeekBoundaries(reportDate);
  var receivedWeek = getWeekBoundaries(receivedDate);

  // Report is late if it was received after its week ended
  // Compare week start dates to see if they're in different weeks
  // AND the received date is AFTER the report week (not before - which would be impossible)
  return receivedWeek.weekStart.getTime() > reportWeek.weekStart.getTime();
}


/**
 * Gets the week boundaries (Sunday to Saturday) for a given date
 *
 * @param {Date} date - Any date within the week
 * @returns {Object} - {weekStart: Date (Sunday), weekEnd: Date (Saturday)}
 */
function getWeekBoundaries(date) {
  var d = new Date(date);
  var day = d.getDay(); // 0 = Sunday

  // Get Sunday (start of week)
  var weekStart = new Date(d);
  weekStart.setDate(d.getDate() - day);
  weekStart.setHours(0, 0, 0, 0);

  // Get Saturday (end of week)
  var weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);
  weekEnd.setHours(23, 59, 59, 999);

  return {
    weekStart: weekStart,
    weekEnd: weekEnd
  };
}

/**
 * Determines which week of the month a date falls into and month boundary info
 *
 * @param {Date} date - Any date within the month
 * @returns {Object} - {weekNumber: 1-5, isLastWeek: boolean, monthEnd: Date, daysUntilMonthEnd: number}
 */
function getWeekOfMonth(date) {
  var d = new Date(date);
  var month = d.getMonth();
  var year = d.getFullYear();

  // Get last day of the month
  var lastDay = new Date(year, month + 1, 0);

  // Calculate which week of the month we're in
  // Week 1: Days 1-7, Week 2: Days 8-14, Week 3: Days 15-21, Week 4+: Days 22+
  var dayOfMonth = d.getDate();
  var weekNumber;
  if (dayOfMonth <= 7) {
    weekNumber = 1;
  } else if (dayOfMonth <= 14) {
    weekNumber = 2;
  } else if (dayOfMonth <= 21) {
    weekNumber = 3;
  } else {
    weekNumber = 4;
  }

  // Determine if we're in the last week of the month (7 or fewer days remaining)
  var daysUntilMonthEnd = Math.ceil((lastDay.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
  var isLastWeek = daysUntilMonthEnd <= 7;

  return {
    weekNumber: weekNumber,
    isLastWeek: isLastWeek,
    monthEnd: lastDay,
    daysUntilMonthEnd: daysUntilMonthEnd
  };
}

/**
 * Determines the appropriate status for Monthly Checklist based on progressive deadline logic
 *
 * Monthly Checklist is due once per month, deadline is last work day of month
 * - Weeks 1-2: ⏳ (yellow/pending) - plenty of time, does NOT affect crew status
 * - Week 3: ⚠️ (orange/warning) - getting close, sets status to Pending
 * - Week 4/Final week: ❌⏳ (red hourglass) - urgent, sets status to Pending
 * - After month ends: ❌ (red missing) - deadline passed, sets status to Missing Reports
 *
 * @param {Date} weekStartDate - The Sunday of the week being evaluated
 * @param {boolean} hasSubmitted - Whether the checklist has been received
 * @param {boolean} isSkipped - Whether this crew has Monthly Checklist skipped
 * @returns {Object} - {status: string, cssClass: string, shouldCreateTask: boolean, affectsStatus: boolean}
 */
function getMonthlyChecklistStatus(weekStartDate, hasSubmitted, isSkipped, checklistDate) {
  if (isSkipped) {
    return { status: 'N/A', cssClass: 'na', shouldCreateTask: false, affectsStatus: false };
  }

  // If checklist was submitted THIS WEEK, show checkmark
  if (hasSubmitted && checklistDate) {
    var checklistWeek = getWeekBoundaries(checklistDate);
    var targetWeek = getWeekBoundaries(weekStartDate);

    // If checklist was received in THIS week being evaluated, show ✅
    if (checklistDate >= targetWeek.weekStart && checklistDate <= targetWeek.weekEnd) {
      return { status: '✅', cssClass: 'ok', shouldCreateTask: false, affectsStatus: false };
    }

    // Checklist was received EARLIER in the month - show the date (e.g., "✓02/10")
    var tz = Session.getScriptTimeZone();
    var dateStr = Utilities.formatDate(checklistDate, tz, "MM/dd");
    return { status: '✓' + dateStr, cssClass: 'ok-date', shouldCreateTask: false, affectsStatus: false };
  }

  // Legacy support: if hasSubmitted is true but no date provided, show checkmark
  if (hasSubmitted) {
    return { status: '✅', cssClass: 'ok', shouldCreateTask: false, affectsStatus: false };
  }

  var today = new Date();

  // Determine month boundaries using the week being evaluated
  var weekMonth = weekStartDate.getMonth();
  var weekYear = weekStartDate.getFullYear();
  var currentMonth = today.getMonth();
  var currentYear = today.getFullYear();

  // If we're looking at a past month (the week's month has ended)
  var monthHasEnded = (currentYear > weekYear) || (currentYear === weekYear && currentMonth > weekMonth);

  if (monthHasEnded) {
    // Month has ended and checklist wasn't received - red missing
    return { status: '❌', cssClass: 'missing', shouldCreateTask: true, affectsStatus: true };
  }

  // We're still in the same month as the week being evaluated
  var todayWeekInfo = getWeekOfMonth(today);

  if (todayWeekInfo.isLastWeek || todayWeekInfo.weekNumber >= 4) {
    // Final week of month - urgent (red hourglass) but not yet past deadline
    // This DOES affect status (Pending) because deadline is imminent
    return { status: '❌⏳', cssClass: 'urgent', shouldCreateTask: false, affectsStatus: true };
  } else if (todayWeekInfo.weekNumber === 3) {
    // Week 3 - warning (orange)
    // This DOES affect status (Pending) because deadline is approaching
    return { status: '⚠️', cssClass: 'warning', shouldCreateTask: false, affectsStatus: true };
  } else {
    // Weeks 1-2 - pending (yellow)
    // This does NOT affect status - crew is "Complete" for weekly items even if Monthly not submitted yet
    return { status: '⏳', cssClass: 'pending', shouldCreateTask: false, affectsStatus: false };
  }
}

/**
 * NOTE: getActiveCrews() REMOVED - Feb 17, 2026
 * ============================================================================
 * The duplicate getActiveCrews() function was removed from this file.
 * The canonical version in 75-Scheduling.gs is now used, which:
 * - Uses configurable job prefix exclusions via isExcludedJobPrefix()
 * - Checks Last Day column to exclude terminated employees
 * - Ensures consistent crew filtering across Scheduling and Safety Reports
 * ============================================================================
 */

/**
 * Creates the Safety Compliance sheet for tracking JHA/Meeting submissions
 */
function setupSafetyComplianceSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("Safety Compliance");

  if (sheet) {
    var response = Browser.msgBox(
      "Safety Compliance sheet already exists",
      "Do you want to recreate it? This will DELETE all existing data.",
      Browser.Buttons.YES_NO
    );
    if (response === "no") return sheet;
    ss.deleteSheet(sheet);
  }

  sheet = ss.insertSheet("Safety Compliance");

  // Headers: Week Start | Job Number | Foreman | Sun | Mon | Tue | Wed | Thu | Fri | Sat | Weekly Meeting | Monthly Checklist | Status | Updated
  var headers = [
    "Week Start", "Job Number", "Foreman",
    "Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat",
    "Weekly Meeting", "Monthly Checklist", "Status", "Updated"
  ];

  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.getRange(1, 1, 1, headers.length)
    .setFontWeight("bold")
    .setBackground("#4A86E8")
    .setFontColor("white");
  sheet.setFrozenRows(1);

  // Column widths
  sheet.setColumnWidth(1, 100);  // Week Start
  sheet.setColumnWidth(2, 80);   // Job Number
  sheet.setColumnWidth(3, 120);  // Foreman
  for (var i = 4; i <= 10; i++) {
    sheet.setColumnWidth(i, 50); // Day columns
  }
  sheet.setColumnWidth(11, 100); // Weekly Meeting
  sheet.setColumnWidth(12, 110); // Monthly Checklist
  sheet.setColumnWidth(13, 120); // Status
  sheet.setColumnWidth(14, 150); // Updated

  // Date format for Week Start
  sheet.getRange(2, 1, 1000, 1).setNumberFormat("MM/dd/yyyy");

  // Add conditional formatting for status icons
  var dayRange = sheet.getRange("D2:L1001");
  var rules = sheet.getConditionalFormatRules();

  // Yellow-green for ✅L (LATE submission - received but after deadline)
  // Must come BEFORE the ✅ rule since that uses "contains"
  var lateRule = SpreadsheetApp.newConditionalFormatRule()
    .whenTextEqualTo("✅L")
    .setBackground("#FFF9C4")  // Light yellow background
    .setFontColor("#F57F17")   // Amber/dark yellow text
    .setRanges([dayRange])
    .build();
  rules.push(lateRule);

  // Light green for ✓ with date (Monthly Checklist received earlier in month)
  // e.g., "✓02/10" - shows date checklist was received
  var checkDateRule = SpreadsheetApp.newConditionalFormatRule()
    .whenTextStartsWith("✓")
    .setBackground("#E8F5E9")  // Very light green
    .setFontColor("#2E7D32")   // Dark green text
    .setRanges([dayRange])
    .build();
  rules.push(checkDateRule);

  // Green for ✅ (on-time submission)
  var checkRule = SpreadsheetApp.newConditionalFormatRule()
    .whenTextContains("✅")
    .setBackground("#D9EAD3")
    .setRanges([dayRange])
    .build();
  rules.push(checkRule);

  // Orange for ⚠️ (Monthly Checklist warning - Week 3)
  var warningRule = SpreadsheetApp.newConditionalFormatRule()
    .whenTextContains("⚠️")
    .setBackground("#FFE0B2")  // Light orange
    .setFontColor("#E65100")   // Dark orange text
    .setRanges([dayRange])
    .build();
  rules.push(warningRule);

  // Red/Pink for ❌⏳ (Monthly Checklist urgent - Week 4, not yet past deadline)
  var urgentRule = SpreadsheetApp.newConditionalFormatRule()
    .whenTextContains("❌⏳")
    .setBackground("#FFCDD2")  // Light red/pink
    .setFontColor("#C62828")   // Dark red text
    .setRanges([dayRange])
    .build();
  rules.push(urgentRule);

  // Red for ❌ (but not ❌⏳ since that's handled above)
  var xRule = SpreadsheetApp.newConditionalFormatRule()
    .whenTextEqualTo("❌")
    .setBackground("#F4CCCC")
    .setRanges([dayRange])
    .build();
  rules.push(xRule);

  // Yellow for ⏳ (pending - Weeks 1-2 for Monthly, or regular pending)
  var pendingRule = SpreadsheetApp.newConditionalFormatRule()
    .whenTextContains("⏳")
    .setBackground("#FFF2CC")
    .setRanges([dayRange])
    .build();
  rules.push(pendingRule);

  // Gray for N/A
  var naRule = SpreadsheetApp.newConditionalFormatRule()
    .whenTextContains("N/A")
    .setBackground("#EFEFEF")
    .setRanges([dayRange])
    .build();
  rules.push(naRule);

  sheet.setConditionalFormatRules(rules);

  Logger.log("setupSafetyComplianceSheet: Created Safety Compliance sheet");
  return sheet;
}

/**
 * Creates the Safety Compliance Config sheet for exclusion settings
 */
function setupSafetyComplianceConfig() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("Safety Compliance Config");

  if (sheet) {
    var response = Browser.msgBox(
      "Safety Compliance Config sheet already exists",
      "Do you want to recreate it? This will DELETE all existing settings.",
      Browser.Buttons.YES_NO
    );
    if (response === "no") return sheet;
    ss.deleteSheet(sheet);
  }

  sheet = ss.insertSheet("Safety Compliance Config");

  // Headers - includes Monthly Checklist column
  var headers = [
    "Job Number", "Foreman",
    "Skip Sun", "Skip Mon", "Skip Tue", "Skip Wed", "Skip Thu", "Skip Fri", "Skip Sat",
    "Skip Weekly Meeting", "Skip Monthly Checklist", "Notes"
  ];

  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.getRange(1, 1, 1, headers.length)
    .setFontWeight("bold")
    .setBackground("#93C47D")
    .setFontColor("white");
  sheet.setFrozenRows(1);

  // Get active crews and populate
  var crews = getActiveCrews();
  if (crews.length > 0) {
    var rows = [];
    for (var i = 0; i < crews.length; i++) {
      var foreman = lookupForemanByJobNumber(crews[i]);
      var foremanName = (foreman && foreman.name) ? foreman.name : "";
      // Default: Skip Sun and Sat (weekends)
      rows.push([
        crews[i], foremanName,
        true, false, false, false, false, false, true, // Sun=skip, Sat=skip
        false, false, "" // Don't skip weekly meeting, don't skip monthly checklist, no notes
      ]);
    }
    sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);

    // Add checkboxes for skip columns (C-K = columns 3-11)
    var checkboxRange = sheet.getRange(2, 3, rows.length, 9);
    checkboxRange.insertCheckboxes();
  }

  // Column widths
  sheet.setColumnWidth(1, 80);   // Job Number
  sheet.setColumnWidth(2, 120);  // Foreman
  for (var j = 3; j <= 11; j++) {
    sheet.setColumnWidth(j, 70); // Skip columns
  }
  sheet.setColumnWidth(12, 200); // Notes

  Logger.log("setupSafetyComplianceConfig: Created config with " + crews.length + " crews");
  return sheet;
}

/**
 * Populates the Safety Compliance Config sheet with all active crews
 * Adds missing crews without deleting existing settings
 * Called from menu: "Populate Crew Config"
 */
function populateComplianceConfig() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("Safety Compliance Config");

  // If sheet doesn't exist, create it
  if (!sheet) {
    sheet = setupSafetyComplianceConfig();
    SpreadsheetApp.getUi().alert("Created Safety Compliance Config with " + (sheet.getLastRow() - 1) + " crews.");
    return;
  }

  // Get existing crews in config
  var existingData = sheet.getDataRange().getValues();
  var existingCrews = {};
  for (var i = 1; i < existingData.length; i++) {
    var jobNum = String(existingData[i][0] || '').trim();
    if (jobNum) {
      existingCrews[jobNum] = true;
    }
  }

  // Get all active crews
  var allCrews = getActiveCrews();

  // Find missing crews
  var missingCrews = [];
  for (var c = 0; c < allCrews.length; c++) {
    if (!existingCrews[allCrews[c]]) {
      missingCrews.push(allCrews[c]);
    }
  }

  if (missingCrews.length === 0) {
    SpreadsheetApp.getUi().alert("All " + allCrews.length + " active crews are already in the config.");
    return;
  }

  // Add missing crews
  var newRows = [];
  for (var m = 0; m < missingCrews.length; m++) {
    var foreman = lookupForemanByJobNumber(missingCrews[m]);
    var foremanName = (foreman && foreman.name) ? foreman.name : "";
    // Default: Skip Sun and Sat (weekends)
    newRows.push([
      missingCrews[m], foremanName,
      true, false, false, false, false, false, true, // Sun=skip, Sat=skip
      false, false, "" // Don't skip weekly meeting, don't skip monthly checklist, no notes
    ]);
  }

  // Append to sheet
  var lastRow = sheet.getLastRow();
  sheet.getRange(lastRow + 1, 1, newRows.length, 12).setValues(newRows);

  // Add checkboxes for the new rows (columns C-K = 3-11)
  var checkboxRange = sheet.getRange(lastRow + 1, 3, newRows.length, 9);
  checkboxRange.insertCheckboxes();

  // Sort by job number
  if (sheet.getLastRow() > 1) {
    sheet.getRange(2, 1, sheet.getLastRow() - 1, 12).sort(1);
  }

  SpreadsheetApp.getUi().alert("Added " + missingCrews.length + " new crew(s) to config:\n" + missingCrews.join(", "));
  Logger.log("populateComplianceConfig: Added " + missingCrews.length + " crews");
}

/**
 * Migrates existing Safety Compliance Config sheet to add missing "Skip Monthly Checklist" column
 * Call this if your config sheet has the old 11-column structure
 */
function migrateComplianceConfigAddMonthlyChecklist() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("Safety Compliance Config");

  if (!sheet) {
    SpreadsheetApp.getUi().alert("Safety Compliance Config sheet not found. Use 'Populate Crew Config' to create it.");
    return;
  }

  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];

  // Check if Monthly Checklist column already exists
  var hasMonthlyChecklist = false;
  var monthlyChecklistCol = -1;
  var notesCol = -1;

  for (var i = 0; i < headers.length; i++) {
    var header = String(headers[i]).toLowerCase().trim();
    if (header.indexOf('monthly') !== -1) {
      hasMonthlyChecklist = true;
      monthlyChecklistCol = i + 1;
    }
    if (header === 'notes') {
      notesCol = i + 1;
    }
  }

  if (hasMonthlyChecklist) {
    SpreadsheetApp.getUi().alert("Skip Monthly Checklist column already exists (column " + monthlyChecklistCol + ").");
    return;
  }

  if (notesCol === -1) {
    SpreadsheetApp.getUi().alert("Cannot find Notes column. Sheet structure may be corrupted.");
    return;
  }

  // Insert new column before Notes
  sheet.insertColumnBefore(notesCol);

  // Set header for new column
  sheet.getRange(1, notesCol).setValue("Skip Monthly Checklist");
  sheet.getRange(1, notesCol).setFontWeight("bold").setBackground("#93C47D").setFontColor("white");

  // Set column width
  sheet.setColumnWidth(notesCol, 120);

  // Add checkboxes for all data rows
  var lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    var checkboxRange = sheet.getRange(2, notesCol, lastRow - 1, 1);
    checkboxRange.insertCheckboxes();
    // Default to FALSE (require monthly checklist)
    checkboxRange.setValue(false);
  }

  SpreadsheetApp.getUi().alert("Added 'Skip Monthly Checklist' column (column " + notesCol + "). Default: unchecked (require checklist).");
  Logger.log("migrateComplianceConfigAddMonthlyChecklist: Added column at position " + notesCol);
}

/**
 * Fixes the Notes column by removing checkboxes (they were added incorrectly)
 * Call this if column L has checkboxes instead of plain text
 */
function fixNotesColumnCheckboxes() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("Safety Compliance Config");

  if (!sheet) {
    SpreadsheetApp.getUi().alert("Safety Compliance Config sheet not found.");
    return;
  }

  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var notesCol = -1;

  for (var i = 0; i < headers.length; i++) {
    var header = String(headers[i]).toLowerCase().trim();
    if (header === 'notes') {
      notesCol = i + 1;
      break;
    }
  }

  if (notesCol === -1) {
    SpreadsheetApp.getUi().alert("Cannot find Notes column.");
    return;
  }

  var lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    // Remove checkboxes from Notes column by clearing and setting as plain text
    var notesRange = sheet.getRange(2, notesCol, lastRow - 1, 1);
    notesRange.removeCheckboxes();
    notesRange.clearContent();
    notesRange.setNumberFormat("@"); // Plain text format
  }

  // Widen the Notes column for text
  sheet.setColumnWidth(notesCol, 200);

  SpreadsheetApp.getUi().alert("Fixed Notes column (column " + notesCol + "). Checkboxes removed, ready for text notes.");
  Logger.log("fixNotesColumnCheckboxes: Fixed column " + notesCol);
}

/**
 * Opens the Safety Compliance sheet (creates if doesn't exist)
 */
function openComplianceSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("Safety Compliance");

  if (!sheet) {
    sheet = setupSafetyComplianceSheet();
  }

  if (sheet) {
    sheet.activate();
  }
}

/**
 * Opens the Safety Compliance Config sheet (creates if doesn't exist)
 */
function openComplianceConfig() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("Safety Compliance Config");

  if (!sheet) {
    sheet = setupSafetyComplianceConfig();
  }

  if (sheet) {
    sheet.activate();
  }
}

/**
 * Loads compliance config settings for crews
 *
 * @returns {Object} - Map of job number to config settings
 */
function loadComplianceConfig() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("Safety Compliance Config");

  if (!sheet) return {};

  var data = sheet.getDataRange().getValues();
  var config = {};

  for (var i = 1; i < data.length; i++) {
    var jobNumber = String(data[i][0] || '').trim();
    if (!jobNumber) continue;

    config[jobNumber] = {
      foreman: data[i][1] || '',
      skipDays: [
        !!data[i][2],  // Sun
        !!data[i][3],  // Mon
        !!data[i][4],  // Tue
        !!data[i][5],  // Wed
        !!data[i][6],  // Thu
        !!data[i][7],  // Fri
        !!data[i][8]   // Sat
      ],
      skipWeeklyMeeting: !!data[i][9],
      skipMonthlyChecklist: !!data[i][10],
      notes: data[i][11] || ''
    };
  }

  return config;
}

/**
 * Calculates safety compliance for all crews for a given week
 * NOTE: This function now primarily reads from the Safety Compliance sheet itself
 * for existing compliance data, rather than from Safety Equipment Needs.
 * JHA/Meeting data is tracked directly in Safety Compliance during email processing.
 *
 * @param {Date} weekStartDate - The Sunday of the week to calculate
 * @returns {Object} - Compliance data for all crews
 */
function calculateSafetyCompliance(weekStartDate) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  // Safety Equipment Needs sheet is optional - only used for Monthly Checklist (Fleet Checklists)
  var safetySheet = getSafetyEquipmentSheet();

  // Log but don't fail if sheet doesn't exist - compliance can still work from Safety Compliance sheet
  if (!safetySheet) {
    Logger.log("calculateSafetyCompliance: Safety Equipment Needs sheet not found - compliance tracking will use Safety Compliance sheet only");
  }

  var config = loadComplianceConfig();
  var crews = getActiveCrews();

  if (crews.length === 0) {
    Logger.log("calculateSafetyCompliance: No active crews found");
    return null;
  }

  var weekBounds = getWeekBoundaries(weekStartDate);
  var today = new Date();
  var isPastDeadline = today > weekBounds.weekEnd;
  var weekStartStr = Utilities.formatDate(weekBounds.weekStart, Session.getScriptTimeZone(), 'MM/dd/yyyy');

  // Load existing compliance data from Safety Compliance sheet
  // This is now the PRIMARY source of JHA/Meeting compliance data
  var resolvedCrews = {};
  var existingComplianceByJob = {};  // Job → existing row data
  var complianceSheet = ss.getSheetByName(SAFETY_COMPLIANCE_SHEET_NAME);
  if (complianceSheet) {
    var complianceData = complianceSheet.getDataRange().getValues();
    for (var rc = 1; rc < complianceData.length; rc++) {
      var rowWeek = complianceData[rc][0]; // Week Start column
      var rowJob = String(complianceData[rc][1] || '').trim(); // Job Number column
      var rowStatus = String(complianceData[rc][12] || '').trim(); // Status column (M = 12)

      // Check if this row matches our week
      if (rowWeek && rowJob) {
        var rowWeekStr = Utilities.formatDate(new Date(rowWeek), Session.getScriptTimeZone(), 'MM/dd/yyyy');
        if (rowWeekStr === weekStartStr) {
          // Store the existing data for this job
          existingComplianceByJob[rowJob] = {
            rowData: complianceData[rc],
            rowNum: rc + 1,  // 1-based row number
            status: rowStatus
          };

          if (rowStatus === 'Resolved') {
            resolvedCrews[rowJob] = true;
            Logger.log('calculateSafetyCompliance: Found resolved crew ' + rowJob + ' for week ' + weekStartStr);
          }
        }
      }
    }
  }
  Logger.log('calculateSafetyCompliance: Loaded existing data for ' + Object.keys(existingComplianceByJob).length + ' crews, ' + Object.keys(resolvedCrews).length + ' resolved');

  // Build mappings for secondary/custom jobs → primary crew
  // This allows reports submitted on secondary jobs (e.g., 006-26) to credit the foreman's primary crew (e.g., 052-25)
  var foremanToPrimaryCrew = {};  // foreman name → primary job number
  var jobToForeman = {};          // job number → foreman name (includes secondary jobs)

  // Load custom job mappings from dialog configuration
  var customMappings = getCustomJobForemanMappings() || {};

  // Build from Employees sheet
  var empSheet = ss.getSheetByName('Employees');
  if (empSheet) {
    var empData = empSheet.getDataRange().getValues();
    var empHeaders = empData[0].map(function(h) { return String(h).toLowerCase().trim(); });
    var empNameCol = empHeaders.indexOf('name');
    var empJobCol = empHeaders.indexOf('job number');
    var empSecondaryJobCol = empHeaders.indexOf('secondary job number');
    var empClassCol = empHeaders.indexOf('job classification');

    if (empNameCol !== -1 && empJobCol !== -1) {
      for (var ei = 1; ei < empData.length; ei++) {
        var empName = String(empData[ei][empNameCol] || '').trim();
        var empJob = String(empData[ei][empJobCol] || '').trim();
        var empClass = empClassCol !== -1 ? String(empData[ei][empClassCol] || '').trim() : '';
        var empSecondaryJob = empSecondaryJobCol !== -1 ? String(empData[ei][empSecondaryJobCol] || '').trim() : '';

        if (!empName || !empJob) continue;

        // Extract base job (without position suffix)
        var baseJob = empJob.split('.')[0];

        // Track this job → employee
        if (!jobToForeman[baseJob]) {
          jobToForeman[baseJob] = empName;
        }

        // Track secondary job → same employee
        if (empSecondaryJob) {
          var baseSecondaryJob = empSecondaryJob.split('.')[0];
          jobToForeman[baseSecondaryJob] = empName;
        }

        // For foremen (F, GTO F, or first employee in crew with .1 suffix), track their primary crew
        var isForeman = empClass === 'F' || empClass === 'GTO F' || empJob.indexOf('.1') !== -1;
        if (isForeman && !foremanToPrimaryCrew[empName.toLowerCase()]) {
          foremanToPrimaryCrew[empName.toLowerCase()] = baseJob;
        }
      }
    }
  }

  // Add custom mappings (these override Employees sheet mappings)
  // For custom mappings, we also need to make sure the foreman has a primary crew entry
  for (var customJob in customMappings) {
    var customForeman = customMappings[customJob];
    jobToForeman[customJob] = customForeman;
    Logger.log('calculateSafetyCompliance: Added custom mapping ' + customJob + ' -> ' + customForeman);

    // If this foreman doesn't have a primary crew yet, we need to find it
    var foremanKey = customForeman.toLowerCase();
    if (!foremanToPrimaryCrew[foremanKey]) {
      // Search Employees sheet for this person's primary job
      if (empSheet && empData) {
        for (var fi = 1; fi < empData.length; fi++) {
          var checkName = String(empData[fi][empNameCol] || '').trim();
          if (checkName.toLowerCase() === foremanKey) {
            var checkJob = String(empData[fi][empJobCol] || '').trim();
            if (checkJob) {
              foremanToPrimaryCrew[foremanKey] = checkJob.split('.')[0];
              Logger.log('calculateSafetyCompliance: Found primary crew for ' + customForeman + ' -> ' + foremanToPrimaryCrew[foremanKey]);
            }
            break;
          }
        }
      }
    }
  }

  Logger.log('calculateSafetyCompliance: Built foreman→crew map with ' + Object.keys(foremanToPrimaryCrew).length + ' foremen');
  Logger.log('calculateSafetyCompliance: Built job→foreman map with ' + Object.keys(jobToForeman).length + ' jobs');

  // Debug: Log the mappings for custom jobs
  for (var debugJob in customMappings) {
    var debugForeman = customMappings[debugJob];
    var debugPrimary = foremanToPrimaryCrew[debugForeman.toLowerCase()];
    Logger.log('calculateSafetyCompliance: Custom job ' + debugJob + ' -> foreman ' + debugForeman + ' -> primary crew ' + (debugPrimary || 'NOT FOUND'));
  }

  // Get month boundaries for Monthly Checklist tracking
  // Monthly Checklist is valid for the entire month once received
  var monthStart = new Date(weekBounds.weekStart.getFullYear(), weekBounds.weekStart.getMonth(), 1);
  var monthEnd = new Date(weekBounds.weekStart.getFullYear(), weekBounds.weekStart.getMonth() + 1, 0, 23, 59, 59);
  var tz = Session.getScriptTimeZone();

  // Build lookup: jobNumber -> { jhaByDay, weeklyMeeting, monthlyChecklist, monthlyChecklistDate }
  // IMPORTANT: Initialize from existing Safety Compliance sheet data to preserve JHA/Meeting status
  var crewReports = {};
  for (var c = 0; c < crews.length; c++) {
    var crewJob = crews[c];
    crewReports[crewJob] = {
      jhaByDay: [false, false, false, false, false, false, false], // Sun-Sat
      jhaLateByDay: [false, false, false, false, false, false, false], // Track which were late
      weeklyMeeting: false,
      weeklyMeetingLate: false,
      monthlyChecklist: false,
      monthlyChecklistDate: null  // Track when checklist was received this month
    };

    // POPULATE from existing Safety Compliance sheet data (THIS IS THE KEY FIX)
    // The JHA/Meeting compliance data is now stored directly in Safety Compliance, not Safety Reports
    if (existingComplianceByJob[crewJob]) {
      var existingRow = existingComplianceByJob[crewJob].rowData;
      // Safety Compliance columns: 0=Week, 1=Job, 2=Foreman, 3=Sun, 4=Mon, 5=Tue, 6=Wed, 7=Thu, 8=Fri, 9=Sat, 10=Meeting, 11=Monthly, 12=Status

      // Parse JHA days (columns 3-9, indices 3-9)
      var dayColOffset = 3; // Sun is column D (index 3)
      for (var dayIdx = 0; dayIdx < 7; dayIdx++) {
        var dayVal = String(existingRow[dayColOffset + dayIdx] || '').trim();
        if (dayVal === '✅') {
          crewReports[crewJob].jhaByDay[dayIdx] = true;
        } else if (dayVal === '✅L') {
          crewReports[crewJob].jhaByDay[dayIdx] = true;
          crewReports[crewJob].jhaLateByDay[dayIdx] = true;
        }
      }

      // Parse Weekly Meeting (column K, index 10)
      var meetingVal = String(existingRow[10] || '').trim();
      if (meetingVal === '✅') {
        crewReports[crewJob].weeklyMeeting = true;
      } else if (meetingVal === '✅L') {
        crewReports[crewJob].weeklyMeeting = true;
        crewReports[crewJob].weeklyMeetingLate = true;
      }

      // Parse Monthly Checklist (column L, index 11)
      var monthlyVal = String(existingRow[11] || '').trim();
      if (monthlyVal === '✅') {
        crewReports[crewJob].monthlyChecklist = true;
      }

      Logger.log('calculateSafetyCompliance: Loaded existing compliance for ' + crewJob +
        ' - JHA days credited: ' + crewReports[crewJob].jhaByDay.filter(function(v) { return v; }).length +
        ', Meeting: ' + crewReports[crewJob].weeklyMeeting);
    }
  }

  // Read Safety Equipment Needs data ONLY for Monthly Checklist (Fleet Checklists)
  // JHA and Safety Meeting are NOT stored here anymore
  var reportData = [];
  var headers = [];
  var notesColIdx = 10;

  if (safetySheet) {
    reportData = safetySheet.getDataRange().getValues();
    headers = reportData[0];

    // Find Notes column index
    for (var h = 0; h < headers.length; h++) {
      var hdr = String(headers[h]).toLowerCase().trim();
      if (hdr === 'notes') {
        notesColIdx = h;
        break;
      }
    }
  }

  // Track jobs that couldn't be resolved to a tracked crew
  // Now tracks individual reports with full details for assignment capability
  var uncreditedJobs = {};  // jobNumber → { reportTypes: {}, reports: [], foreman, reason }

  /**
   * Helper to resolve a job number to its tracked primary crew
   * If the job is tracked directly, return it
   * If not, look up the foreman and return their primary crew
   * @param {string} baseJob - Job number (without position suffix)
   * @param {string} reportType - Type of report (for tracking)
   * @param {Date} reportDate - Date of report (for tracking)
   * @param {Date} receivedDate - Date email was received (optional)
   * @param {string} emailSubject - Email subject line (optional)
   * @returns {string|null} - Primary crew job number or null if unresolvable
   */
  function resolveToPrimaryCrew(baseJob, reportType, reportDate, receivedDate, emailSubject) {
    // Direct match - job is a tracked crew
    if (crewReports[baseJob]) {
      return baseJob;
    }

    // Try to find the foreman for this job and redirect to their primary crew
    var foreman = jobToForeman[baseJob];
    if (foreman) {
      var primaryCrew = foremanToPrimaryCrew[foreman.toLowerCase()];
      if (primaryCrew && crewReports[primaryCrew]) {
        return primaryCrew;
      }
    }

    // Unresolvable - track this job as uncredited with full report details
    if (reportType && baseJob) {
      if (!uncreditedJobs[baseJob]) {
        var reason = foreman ? 'Foreman found (' + foreman + ') but no tracked primary crew' : 'No foreman mapping found';
        uncreditedJobs[baseJob] = {
          reportTypes: {},
          reports: [],  // Array of individual report records
          foreman: foreman || null,
          reason: reason
        };
      }
      uncreditedJobs[baseJob].reportTypes[reportType] = true;

      // Add individual report record with full details
      if (reportDate) {
        var reportDateStr = Utilities.formatDate(new Date(reportDate), Session.getScriptTimeZone(), 'MM/dd/yyyy');
        var receivedDateStr = receivedDate ? Utilities.formatDate(new Date(receivedDate), Session.getScriptTimeZone(), 'MM/dd/yyyy') : reportDateStr;
        var reportDayOfWeek = new Date(reportDate).getDay(); // 0=Sun, 6=Sat

        // Check for duplicate - same report type + report date
        var isDup = uncreditedJobs[baseJob].reports.some(function(r) {
          return r.reportType === reportType && r.reportDate === reportDateStr;
        });

        if (!isDup) {
          uncreditedJobs[baseJob].reports.push({
            reportType: reportType,
            reportDate: reportDateStr,
            receivedDate: receivedDateStr,
            dayOfWeek: reportDayOfWeek,
            dayName: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][reportDayOfWeek],
            emailSubject: emailSubject || ''
          });
        }
      }
    }

    return null;
  }

  // First pass: Find Monthly Checklists received ANYWHERE in this month
  // Also find Email Subject and Received Date columns for uncredited job tracking
  var emailSubjectColIdx = 11; // Default to column L (0-indexed)
  var receivedDateColIdx = 12; // Default to column M (0-indexed)
  for (var h = 0; h < headers.length; h++) {
    var hdr = String(headers[h]).toLowerCase().trim();
    if (hdr === 'email subject') {
      emailSubjectColIdx = h;
    } else if (hdr === 'received date') {
      receivedDateColIdx = h;
    }
  }

  for (var i = 1; i < reportData.length; i++) {
    var reportDate = reportData[i][0];
    var reportType = String(reportData[i][1] || '').trim();
    var jobNumber = String(reportData[i][2] || '').trim();
    var notes = String(reportData[i][notesColIdx] || '').trim();
    var emailSubject = String(reportData[i][emailSubjectColIdx] || '').trim();

    if (!reportDate || !jobNumber) continue;

    var baseJob = jobNumber.split('.')[0];

    // Get received date - first try dedicated column, then fall back to notes parsing
    var receivedDate = null;
    if (receivedDateColIdx < reportData[i].length && reportData[i][receivedDateColIdx]) {
      receivedDate = new Date(reportData[i][receivedDateColIdx]);
    }
    if (!receivedDate || isNaN(receivedDate.getTime())) {
      // Fall back to extracting from notes (for late submissions)
      var lateMatch = notes.match(/Received\s+(\d{1,2}\/\d{1,2}\/\d{4})/);
      if (lateMatch) {
        receivedDate = new Date(lateMatch[1]);
      }
    }

    // Resolve to primary crew (handles secondary/custom jobs)
    var targetCrew = resolveToPrimaryCrew(baseJob, reportType, reportDate, receivedDate, emailSubject);
    if (!targetCrew) continue;

    var reportDateObj = new Date(reportDate);

    // For Monthly Checklist, check if received anywhere in the current MONTH
    if (reportType === 'Fleet Checklist' || reportType === 'Safety Checklist' ||
        reportType.indexOf('Fleet') !== -1 || reportType.indexOf('Monthly') !== -1) {
      // Check if report is within THIS MONTH
      if (reportDateObj >= monthStart && reportDateObj <= monthEnd) {
        crewReports[targetCrew].monthlyChecklist = true;
        // Track the date - keep the most recent one
        if (!crewReports[targetCrew].monthlyChecklistDate || reportDateObj > crewReports[targetCrew].monthlyChecklistDate) {
          crewReports[targetCrew].monthlyChecklistDate = reportDateObj;
        }
      }
    }
  }

  // Second pass: Scan for JHAs and Weekly Meetings within THIS WEEK only
  for (var i = 1; i < reportData.length; i++) {
    var reportDate = reportData[i][0]; // Column A: Report Date
    var reportType = String(reportData[i][1] || '').trim(); // Column B: Report Type
    var jobNumber = String(reportData[i][2] || '').trim(); // Column C: Job Number
    var notes = String(reportData[i][notesColIdx] || '').trim(); // Notes column
    var emailSubject = String(reportData[i][emailSubjectColIdx] || '').trim();

    if (!reportDate || !jobNumber) continue;

    // Extract base job number
    var baseJob = jobNumber.split('.')[0];

    // Get received date - first try dedicated column, then fall back to notes parsing
    var receivedDate = null;
    if (receivedDateColIdx < reportData[i].length && reportData[i][receivedDateColIdx]) {
      receivedDate = new Date(reportData[i][receivedDateColIdx]);
    }
    if (!receivedDate || isNaN(receivedDate.getTime())) {
      // Fall back to extracting from notes (for late submissions)
      var lateMatch = notes.match(/Received\s+(\d{1,2}\/\d{1,2}\/\d{4})/);
      if (lateMatch) {
        receivedDate = new Date(lateMatch[1]);
      }
    }

    // Resolve to primary crew (handles secondary/custom jobs)
    var targetCrew = resolveToPrimaryCrew(baseJob, reportType, reportDate, receivedDate, emailSubject);
    if (!targetCrew) continue;

    // Check if report is within this week (for JHA and Weekly Meeting only)
    var reportDateObj = new Date(reportDate);
    if (reportDateObj < weekBounds.weekStart || reportDateObj > weekBounds.weekEnd) continue;

    var dayOfWeek = reportDateObj.getDay(); // 0=Sun, 6=Sat

    // Check if this report was submitted late
    var isLate = notes.indexOf('LATE SUBMISSION') !== -1;

    if (reportType === 'JHA' || reportType.indexOf('Job Hazard') !== -1) {
      crewReports[targetCrew].jhaByDay[dayOfWeek] = true;
      if (isLate) {
        crewReports[targetCrew].jhaLateByDay[dayOfWeek] = true;
      }
      // Log when redirecting secondary job to primary crew
      if (targetCrew !== baseJob) {
        Logger.log('calculateSafetyCompliance: Credited JHA from ' + baseJob + ' to primary crew ' + targetCrew);
      }
    } else if (reportType === 'Safety Meeting' || reportType.indexOf('Safety Meeting') !== -1) {
      crewReports[targetCrew].weeklyMeeting = true;
      if (isLate) {
        crewReports[targetCrew].weeklyMeetingLate = true;
      }
      // Log when redirecting secondary job to primary crew
      if (targetCrew !== baseJob) {
        Logger.log('calculateSafetyCompliance: Credited Weekly Meeting from ' + baseJob + ' to primary crew ' + targetCrew);
      }
    }
    // Note: Monthly Checklist is handled in the first pass (month-wide scan)
  }

  // Log uncredited jobs for debugging
  var uncreditedJobKeys = Object.keys(uncreditedJobs);
  if (uncreditedJobKeys.length > 0) {
    Logger.log('calculateSafetyCompliance: Found ' + uncreditedJobKeys.length + ' uncredited job(s): ' + uncreditedJobKeys.join(', '));
    for (var uj = 0; uj < uncreditedJobKeys.length; uj++) {
      var ujKey = uncreditedJobKeys[uj];
      var ujData = uncreditedJobs[ujKey];
      Logger.log('  - ' + ujKey + ': ' + Object.keys(ujData.reportTypes).join(', ') + ' | Reason: ' + ujData.reason);
    }
  }

  // Build compliance data for each crew
  var complianceData = {
    weekStart: weekBounds.weekStart,
    weekEnd: weekBounds.weekEnd,
    isPastDeadline: isPastDeadline,
    crews: {},
    totalCrews: crews.length,
    lateCount: 0  // Track total late submissions across all crews
  };

  var dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  for (var c = 0; c < crews.length; c++) {
    var crew = crews[c];

    // Skip crews that have already been resolved for this week
    // They should retain their resolution codes and not be recalculated as "Missing Reports"
    if (resolvedCrews[crew]) {
      Logger.log('calculateSafetyCompliance: Skipping resolved crew ' + crew + ' for week ' + weekStartStr);
      // Still add to complianceData with "Resolved" status so it's included in counts
      var foremanResultResolved = lookupForemanByJobNumber(crew);
      var foremanNameResolved = (foremanResultResolved && foremanResultResolved.name) ? foremanResultResolved.name : "";
      complianceData.crews[crew] = {
        jobNumber: crew,
        foreman: foremanNameResolved,
        days: {},
        weeklyMeeting: '',
        monthlyChecklist: '',
        status: 'Resolved', // Mark as resolved - won't trigger task creation
        missingItems: [],
        lateCount: 0
      };
      continue;
    }

    var crewConfig = config[crew] || { skipDays: [true, false, false, false, false, false, true], skipWeeklyMeeting: false, skipMonthlyChecklist: false };
    var reports = crewReports[crew];

    // Defensive check - if reports is undefined, create default structure
    if (!reports) {
      Logger.log('calculateSafetyCompliance: No reports found for crew ' + crew + ', using defaults');
      reports = {
        jhaByDay: [false, false, false, false, false, false, false],
        jhaLateByDay: [false, false, false, false, false, false, false],
        weeklyMeeting: false,
        weeklyMeetingLate: false,
        monthlyChecklist: false,
        monthlyChecklistDate: null
      };
    }

    var foremanResult = lookupForemanByJobNumber(crew);
    var foremanName = (foremanResult && foremanResult.name) ? foremanResult.name : "";

    var crewData = {
      jobNumber: crew,
      foreman: foremanName,
      days: {},
      weeklyMeeting: '',
      monthlyChecklist: '',
      status: 'Complete',
      missingItems: [],
      lateCount: 0  // Track late submissions for this crew
    };

    // Check each day
    for (var d = 0; d < 7; d++) {
      var dayName = dayNames[d];

      if (crewConfig.skipDays[d]) {
        crewData.days[dayName] = 'N/A';
      } else if (reports && reports.jhaByDay && reports.jhaByDay[d]) {
        // Check if this was a late submission
        if (reports.jhaLateByDay && reports.jhaLateByDay[d]) {
          crewData.days[dayName] = '✅L';  // Received but late
          crewData.lateCount++;
          complianceData.lateCount++;
        } else {
          crewData.days[dayName] = '✅';
        }
      } else if (isPastDeadline) {
        crewData.days[dayName] = '❌';
        crewData.status = 'Missing Reports';
        crewData.missingItems.push('JHA (' + dayName + ')');
      } else {
        crewData.days[dayName] = '⏳';
        crewData.status = 'Pending';
      }
    }

    // Check weekly meeting
    if (crewConfig.skipWeeklyMeeting) {
      crewData.weeklyMeeting = 'N/A';
    } else if (reports && reports.weeklyMeeting) {
      // Check if this was a late submission
      if (reports.weeklyMeetingLate) {
        crewData.weeklyMeeting = '✅L';  // Received but late
        crewData.lateCount++;
        complianceData.lateCount++;
      } else {
        crewData.weeklyMeeting = '✅';
      }
    } else if (isPastDeadline) {
      crewData.weeklyMeeting = '❌';
      crewData.status = 'Missing Reports';
      crewData.missingItems.push('Weekly Meeting');
    } else {
      crewData.weeklyMeeting = '⏳';
      if (crewData.status === 'Complete') crewData.status = 'Pending';
    }

    // Check monthly checklist with progressive deadline logic
    // Monthly Checklist has different deadline logic - due once per month, not per week
    // Pass the checklist date so we can show when it was received if earlier in the month
    var monthlyStatus = getMonthlyChecklistStatus(
      weekBounds.weekStart,
      reports ? reports.monthlyChecklist : false,
      crewConfig.skipMonthlyChecklist,
      reports ? reports.monthlyChecklistDate : null  // Date checklist was received this month
    );
    crewData.monthlyChecklist = monthlyStatus.status;

    // Only affect crew status if monthlyStatus.affectsStatus is true
    // Weeks 1-2: affectsStatus = false (crew can be "Complete" even if Monthly not submitted)
    // Week 3+: affectsStatus = true (crew status changes to Pending or Missing Reports)
    if (monthlyStatus.affectsStatus) {
      if (monthlyStatus.shouldCreateTask) {
        // Month ended without checklist - Missing Reports
        if (crewData.status !== 'Missing Reports') {
          crewData.status = 'Missing Reports';
        }
        crewData.missingItems.push('Monthly Checklist');
      } else if (monthlyStatus.status !== '✅' && monthlyStatus.status !== 'N/A') {
        // Week 3-4 warning/urgent - set to Pending if not already worse
        if (crewData.status === 'Complete') {
          crewData.status = 'Pending';
        }
      }
    }
    // If affectsStatus = false (weeks 1-2), monthly checklist doesn't change crew status

    complianceData.crews[crew] = crewData;
  }

  // Calculate counts
  var compliantCount = 0;
  var missingCount = 0;
  var crewKeys = Object.keys(complianceData.crews);
  for (var k = 0; k < crewKeys.length; k++) {
    var crewStatus = complianceData.crews[crewKeys[k]].status;
    if (crewStatus === 'Complete') {
      compliantCount++;
    } else if (crewStatus === 'Missing Reports') {
      missingCount++;
    }
  }
  complianceData.compliantCount = compliantCount;
  complianceData.missingCount = missingCount;

  // Add uncredited jobs to the result
  // Convert to array format for easier consumption by UI
  // Include both legacy 'dates' array and new 'reports' array with full details
  var uncreditedJobsList = [];
  var uncreditedKeys = Object.keys(uncreditedJobs);
  for (var uIdx = 0; uIdx < uncreditedKeys.length; uIdx++) {
    var uJob = uncreditedKeys[uIdx];
    var uData = uncreditedJobs[uJob];

    // Build dates array from reports for backward compatibility
    var dates = [];
    if (uData.reports && uData.reports.length > 0) {
      for (var rIdx = 0; rIdx < uData.reports.length; rIdx++) {
        if (dates.indexOf(uData.reports[rIdx].reportDate) === -1) {
          dates.push(uData.reports[rIdx].reportDate);
        }
      }
    }

    uncreditedJobsList.push({
      jobNumber: uJob,
      reportTypes: Object.keys(uData.reportTypes),
      dates: dates,                    // Legacy format for backward compat
      reports: uData.reports || [],    // New detailed format
      foreman: uData.foreman,
      reason: uData.reason
    });
  }
  complianceData.uncreditedJobs = uncreditedJobsList;

  return complianceData;
}

/**
 * Updates the Safety Compliance sheet with calculated data
 *
 * @param {Object} complianceData - Data from calculateSafetyCompliance()
 */
function updateComplianceSheet(complianceData) {
  if (!complianceData || !complianceData.crews) {
    Logger.log("updateComplianceSheet: No compliance data");
    return;
  }

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("Safety Compliance");

  if (!sheet) {
    sheet = setupSafetyComplianceSheet();
  }

  var weekStartStr = Utilities.formatDate(complianceData.weekStart, Session.getScriptTimeZone(), "MM/dd/yyyy");
  var now = new Date();
  var nowStr = Utilities.formatDate(now, Session.getScriptTimeZone(), "MM/dd/yyyy HH:mm");

  // Get existing data to check for updates
  var existingData = sheet.getDataRange().getValues();
  var existingRows = {};
  var existingStatuses = {}; // Track existing statuses to preserve "Resolved"
  for (var i = 1; i < existingData.length; i++) {
    var existingDate = existingData[i][0];
    var existingJob = String(existingData[i][1] || '').trim();
    var existingStatus = String(existingData[i][12] || '').trim(); // Status column (M = 13, 0-indexed = 12)
    if (existingDate && existingJob) {
      var dateStr = Utilities.formatDate(new Date(existingDate), Session.getScriptTimeZone(), "MM/dd/yyyy");
      var key = dateStr + '|' + existingJob;
      existingRows[key] = i + 1; // Row number (1-based)
      existingStatuses[key] = existingStatus;
    }
  }

  // Update or insert rows for each crew
  var crewKeys = Object.keys(complianceData.crews);
  for (var c = 0; c < crewKeys.length; c++) {
    var crew = complianceData.crews[crewKeys[c]];
    var rowKey = weekStartStr + '|' + crew.jobNumber;

    // PRESERVE "Resolved" status if already set - don't overwrite with recalculated status
    var statusToUse = crew.status;
    if (existingStatuses[rowKey] === 'Resolved') {
      statusToUse = 'Resolved';
      Logger.log("updateComplianceSheet: Preserving 'Resolved' status for " + crew.jobNumber + " week " + weekStartStr);
    }

    var rowData = [
      weekStartStr,  // Store as formatted string to avoid time component
      crew.jobNumber,
      crew.foreman,
      crew.days['Sun'] || '',
      crew.days['Mon'] || '',
      crew.days['Tue'] || '',
      crew.days['Wed'] || '',
      crew.days['Thu'] || '',
      crew.days['Fri'] || '',
      crew.days['Sat'] || '',
      crew.weeklyMeeting || '',
      crew.monthlyChecklist || '', // Monthly Checklist from config
      statusToUse,
      nowStr
    ];

    if (existingRows[rowKey]) {
      // Update existing row
      sheet.getRange(existingRows[rowKey], 1, 1, rowData.length).setValues([rowData]);
    } else {
      // Append new row
      sheet.appendRow(rowData);
    }
  }

  Logger.log("updateComplianceSheet: Updated " + crewKeys.length + " crew records for week of " + weekStartStr);
}

/**
 * Applies visual formatting to Safety Compliance sheet to separate weeks
 * Adds alternating background colors and thick borders between week groups
 */
function formatComplianceSheetByWeek() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("Safety Compliance");

  if (!sheet) {
    Logger.log("formatComplianceSheetByWeek: Sheet not found");
    return;
  }

  var data = sheet.getDataRange().getValues();
  Logger.log("formatComplianceSheetByWeek: Found " + data.length + " total rows (including header)");
  if (data.length < 2) {
    Logger.log("formatComplianceSheetByWeek: Not enough data rows to format");
    return;
  }

  // Sort by: 1) Week Start (descending - most recent first), 2) Job Number
  var dataRows = [];
  for (var i = 1; i < data.length; i++) {
    dataRows.push({ row: i + 1, data: data[i] });
  }

  // Log unique weeks before sorting
  var uniqueWeeks = {};
  for (var i = 0; i < dataRows.length; i++) {
    var weekStr = String(dataRows[i].data[0]);
    uniqueWeeks[weekStr] = (uniqueWeeks[weekStr] || 0) + 1;
  }
  Logger.log("formatComplianceSheetByWeek: Unique weeks found: " + JSON.stringify(uniqueWeeks));

  dataRows.sort(function(a, b) {
    var dateA = new Date(a.data[0]);
    var dateB = new Date(b.data[0]);
    if (dateB.getTime() !== dateA.getTime()) {
      return dateB.getTime() - dateA.getTime(); // Most recent first
    }
    // Same week - sort by job number
    return String(a.data[1]).localeCompare(String(b.data[1]));
  });

  // Log first few rows after sorting to verify order
  if (dataRows.length > 0) {
    Logger.log("formatComplianceSheetByWeek: After sort, first week is: " + String(dataRows[0].data[0]));
  }

  // Rewrite sorted data
  var sortedData = dataRows.map(function(r) { return r.data; });
  sheet.getRange(2, 1, sortedData.length, sortedData[0].length).setValues(sortedData);

  // Now apply week coloring
  var lastWeek = "";
  var weekIndex = 0;
  var weekColors = ['#ffffff', '#e3f2fd']; // White, Light Blue alternating

  for (var i = 0; i < sortedData.length; i++) {
    var weekStr = String(sortedData[i][0]);
    var rowNum = i + 2; // 1-based, skip header

    if (weekStr !== lastWeek) {
      // New week - add thick border above this row (if not first row)
      if (i > 0) {
        var borderRange = sheet.getRange(rowNum, 1, 1, 14);
        borderRange.setBorder(true, null, null, null, null, null, '#1565c0', SpreadsheetApp.BorderStyle.SOLID_MEDIUM);
      }
      weekIndex++;
      lastWeek = weekStr;
    }

    // Apply alternating background color for this week
    var color = weekColors[weekIndex % 2];
    sheet.getRange(rowNum, 1, 1, 14).setBackground(color);
  }

  Logger.log("formatComplianceSheetByWeek: Applied week formatting to " + sortedData.length + " rows");
}

/**
 * Menu function to manually reformat the compliance sheet by week
 */
function menuReformatComplianceSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("Safety Compliance");

  if (!sheet) {
    Browser.msgBox("❌ Safety Compliance sheet not found. Run 'Backfill Past Weeks' first.");
    return;
  }

  formatComplianceSheetByWeek();
  Browser.msgBox("✅ Applied week-based formatting.\n\n- Sorted by week (most recent first)\n- Alternating colors for each week\n- Blue borders between weeks");
}

/**
 * Adds the new Monthly Checklist progressive status formatting rules to existing Safety Compliance sheet
 * Rules: ⚠️ = orange (week 3), ❌⏳ = red (week 4/urgent), plus existing rules
 */
function addMonthlyChecklistFormattingRules() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("Safety Compliance");

  if (!sheet) {
    Browser.msgBox("❌ Safety Compliance sheet not found.");
    return;
  }

  // Get current rules
  var rules = sheet.getConditionalFormatRules();

  // Define the range for day columns + Weekly Meeting + Monthly Checklist (D:L)
  var dayRange = sheet.getRange("D2:L1001");

  // Check if we already have the warning rule
  var hasWarningRule = rules.some(function(rule) {
    var criteria = rule.getBooleanCondition();
    if (criteria && criteria.getCriteriaType() === SpreadsheetApp.BooleanCriteria.TEXT_CONTAINS) {
      var values = criteria.getCriteriaValues();
      return values && values[0] === '⚠️';
    }
    return false;
  });

  if (hasWarningRule) {
    Browser.msgBox("ℹ️ Monthly Checklist formatting rules already exist.");
    return;
  }

  // Add new rules at the beginning so they have priority

  // Orange for ⚠️ (Monthly Checklist warning - Week 3)
  var warningRule = SpreadsheetApp.newConditionalFormatRule()
    .whenTextContains("⚠️")
    .setBackground("#FFE0B2")  // Light orange
    .setFontColor("#E65100")   // Dark orange text
    .setRanges([dayRange])
    .build();

  // Red/Pink for ❌⏳ (Monthly Checklist urgent - Week 4, not yet past deadline)
  var urgentRule = SpreadsheetApp.newConditionalFormatRule()
    .whenTextContains("❌⏳")
    .setBackground("#FFCDD2")  // Light red/pink
    .setFontColor("#C62828")   // Dark red text
    .setRanges([dayRange])
    .build();
  rules.push(urgentRule);

  // Insert at beginning for priority
  rules.unshift(warningRule);

  sheet.setConditionalFormatRules(rules);

  Browser.msgBox("✅ Added Monthly Checklist progressive formatting rules.\n\n• ⚠️ = Orange (Week 3 - warning)\n• ❌⏳ = Red (Week 4 - urgent, deadline approaching)\n• ❌ = Red (Month ended - missing)\n• ⏳ = Yellow (Weeks 1-2 - pending, no urgency)");
}

/**
 * Menu function to add resolution formatting rules
 */
function menuAddMonthlyChecklistFormatting() {
  addMonthlyChecklistFormattingRules();
}

/**
 * Adds late submission formatting (✅L) to existing Safety Compliance sheet
 * Late submissions show yellow background with amber text to distinguish from on-time (green)
 */
function addLateSubmissionFormatting() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("Safety Compliance");

  if (!sheet) {
    Browser.msgBox("❌ Safety Compliance sheet not found.");
    return;
  }

  // Get current rules
  var rules = sheet.getConditionalFormatRules();

  // Define the range for day columns + Weekly Meeting + Monthly Checklist (D:L)
  var dayRange = sheet.getRange("D2:L1001");

  // Check if we already have the late rule
  var hasLateRule = rules.some(function(rule) {
    var criteria = rule.getBooleanCondition();
    if (criteria && criteria.getCriteriaType() === SpreadsheetApp.BooleanCriteria.TEXT_EQUAL_TO) {
      var values = criteria.getCriteriaValues();
      return values && values[0] === '✅L';
    }
    return false;
  });

  if (hasLateRule) {
    Browser.msgBox("ℹ️ Late submission formatting (✅L) already exists.");
    return;
  }

  // Yellow-green for ✅L (LATE submission - received but after deadline)
  // Must be at the beginning so it takes priority over the ✅ contains rule
  var lateRule = SpreadsheetApp.newConditionalFormatRule()
    .whenTextEqualTo("✅L")
    .setBackground("#FFF9C4")  // Light yellow background
    .setFontColor("#F57F17")   // Amber/dark yellow text
    .setRanges([dayRange])
    .build();

  // Insert at the very beginning for highest priority
  rules.unshift(lateRule);

  sheet.setConditionalFormatRules(rules);

  Browser.msgBox("✅ Added Late Submission formatting.\n\n• ✅L = Yellow background, amber text\n   (Report received but submitted after week deadline)\n\n• ✅ = Green background\n   (Report received on time)");
}

/**
 * Menu function to add late submission formatting
 */
function menuAddLateSubmissionFormatting() {
  addLateSubmissionFormatting();
}


/**
 * Auto-corrects past week compliance data when new JHA reports are found with PDF dates
 * that belong to a past week (not the current week being processed).
 *
 * This handles the case where:
 * 1. Email subject shows date 02/17/2026 (current week)
 * 2. PDF contains JHAs with Date Completed: 02/09, 02/10, 02/11 (PAST week)
 * 3. Those past week dates should update the past week's compliance, not current week
 *
 * @param {Array} complianceRecords - Array of compliance records to check
 * @param {Date} currentWeekStart - Start of the current processing week
 * @returns {Object} - { correctionsApplied: number, details: Array }
 */
function autoCorrectPastWeekCompliance(complianceRecords, currentWeekStart) {
  if (!complianceRecords || complianceRecords.length === 0) {
    return { correctionsApplied: 0, details: [] };
  }

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var complianceSheet = ss.getSheetByName("Safety Compliance");

  if (!complianceSheet) {
    Logger.log("autoCorrectPastWeekCompliance: Safety Compliance sheet not found");
    return { correctionsApplied: 0, details: [] };
  }

  var tz = Session.getScriptTimeZone();
  var currentWeekBounds = getWeekBoundaries(currentWeekStart);
  var correctionsApplied = 0;
  var details = [];

  // Load existing compliance sheet data
  var complianceData = complianceSheet.getDataRange().getValues();
  var dayColumnMap = { 'Sun': 3, 'Mon': 4, 'Tue': 5, 'Wed': 6, 'Thu': 7, 'Fri': 8, 'Sat': 9 }; // 0-indexed

  // Build lookup: weekStr + '|' + jobNumber -> row index
  var complianceRowMap = {};
  for (var r = 1; r < complianceData.length; r++) {
    var weekVal = complianceData[r][0];
    var jobVal = String(complianceData[r][1] || '').trim();
    if (weekVal && jobVal) {
      var weekStr = Utilities.formatDate(new Date(weekVal), tz, 'MM/dd/yyyy');
      var key = weekStr + '|' + jobVal;
      complianceRowMap[key] = r + 1; // 1-based row number
    }
  }

  // Process each compliance record
  for (var i = 0; i < complianceRecords.length; i++) {
    var record = complianceRecords[i];
    var reportDate = record[0]; // Column A: Report Date
    var reportType = String(record[1] || '').trim(); // Column B: Report Type
    var jobNumber = String(record[2] || '').trim(); // Column C: Job Number
    var notes = String(record[10] || '').trim(); // Column K: Notes

    // Only process JHA records (Safety Meetings don't have daily tracking the same way)
    if (reportType !== 'JHA') continue;
    if (!reportDate || !jobNumber) continue;

    var reportDateObj = new Date(reportDate);
    var reportWeekBounds = getWeekBoundaries(reportDateObj);

    // Check if this report's date is from a PAST week (before current week)
    if (reportWeekBounds.weekStart.getTime() >= currentWeekBounds.weekStart.getTime()) {
      // Report is for current week or future - don't need correction
      continue;
    }

    // This report is for a PAST week - need to check/correct compliance sheet
    var reportWeekStr = Utilities.formatDate(reportWeekBounds.weekStart, tz, 'MM/dd/yyyy');
    var baseJob = jobNumber.split('.')[0];
    var rowKey = reportWeekStr + '|' + baseJob;
    var rowNum = complianceRowMap[rowKey];

    if (!rowNum) {
      // No existing compliance row for this crew+week - they might not be tracked
      // Or we need to resolve to their primary crew first
      Logger.log("autoCorrectPastWeekCompliance: No compliance row found for " + baseJob + " week " + reportWeekStr);
      continue;
    }

    // Determine which day column to update
    var dayOfWeek = reportDateObj.getDay(); // 0=Sun, 6=Sat
    var dayName = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][dayOfWeek];
    var colIdx = dayColumnMap[dayName];

    // Read current cell value
    var currentValue = String(complianceData[rowNum - 1][colIdx] || '').trim();

    // Only correct if current value is ❌ (missing) or ⏳ (pending)
    if (currentValue !== '❌' && currentValue !== '⏳') {
      // Already has a value (✅, N/A, etc.) - don't overwrite
      Logger.log("autoCorrectPastWeekCompliance: Cell already has value '" + currentValue + "' for " + baseJob + " " + dayName + " - skipping");
      continue;
    }

    // Determine if this is a late submission
    var isLate = notes.indexOf('LATE SUBMISSION') !== -1;
    var newValue = isLate ? '✅L' : '✅';

    // Apply the correction
    complianceSheet.getRange(rowNum, colIdx + 1).setValue(newValue); // +1 for 1-indexed columns

    correctionsApplied++;
    var detail = {
      jobNumber: baseJob,
      week: reportWeekStr,
      day: dayName,
      reportDate: Utilities.formatDate(reportDateObj, tz, 'MM/dd/yyyy'),
      previousValue: currentValue,
      newValue: newValue,
      wasLate: isLate
    };
    details.push(detail);

    Logger.log("autoCorrectPastWeekCompliance: Corrected " + baseJob + " week " + reportWeekStr + " " + dayName +
               ": " + currentValue + " -> " + newValue + (isLate ? " (LATE)" : ""));

    // Also update the status column if needed
    // If all required days now have ✅, the status should be updated
    // We'll do a quick check
    var rowData = complianceSheet.getRange(rowNum, 1, 1, 14).getValues()[0];
    var hasMissing = false;
    for (var d = 3; d <= 9; d++) { // Day columns (Sun-Sat)
      var val = String(rowData[d] || '').trim();
      if (val === '❌' || val === '⏳') {
        hasMissing = true;
        break;
      }
    }
    // Check Weekly Meeting (column 10)
    var wmVal = String(rowData[10] || '').trim();
    if (wmVal === '❌' || wmVal === '⏳') {
      hasMissing = true;
    }

    // If no more missing reports and status isn't already Resolved/Complete, update it
    var currentStatus = String(rowData[12] || '').trim(); // Status column (M)
    if (!hasMissing && currentStatus !== 'Resolved' && currentStatus !== 'Complete') {
      complianceSheet.getRange(rowNum, 13).setValue('Complete'); // Update status
      Logger.log("autoCorrectPastWeekCompliance: Updated status to 'Complete' for " + baseJob + " week " + reportWeekStr);
    }
  }

  if (correctionsApplied > 0) {
    Logger.log("autoCorrectPastWeekCompliance: Applied " + correctionsApplied + " corrections to past week compliance data");
  }

  return { correctionsApplied: correctionsApplied, details: details };
}

/**
 * Adds Monthly Checklist date formatting (✓MM/DD) to existing Safety Compliance sheet
 * Shows light green background with dark green text for cells starting with ✓
 */
function addMonthlyChecklistDateFormatting() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("Safety Compliance");

  if (!sheet) {
    Browser.msgBox("❌ Safety Compliance sheet not found.");
    return;
  }

  var rules = sheet.getConditionalFormatRules();
  var dayRange = sheet.getRange("D2:L1001");

  // Check if we already have the ✓ date rule
  var hasDateRule = rules.some(function(rule) {
    var criteria = rule.getBooleanCondition();
    if (criteria && criteria.getCriteriaType() === SpreadsheetApp.BooleanCriteria.TEXT_STARTS_WITH) {
      var values = criteria.getCriteriaValues();
      return values && values[0] === '✓';
    }
    return false;
  });

  if (hasDateRule) {
    Browser.msgBox("ℹ️ Monthly Checklist date formatting (✓MM/DD) already exists.");
    return;
  }

  // Light green for ✓ with date (Monthly Checklist received earlier in month)
  var checkDateRule = SpreadsheetApp.newConditionalFormatRule()
    .whenTextStartsWith("✓")
    .setBackground("#E8F5E9")  // Very light green
    .setFontColor("#2E7D32")   // Dark green text
    .setRanges([dayRange])
    .build();

  // Insert at the beginning for priority (before the ✅ contains rule)
  rules.unshift(checkDateRule);

  sheet.setConditionalFormatRules(rules);

  Browser.msgBox("✅ Added Monthly Checklist date formatting.\n\n• ✓MM/DD = Light green background, dark green text\n   (Checklist received earlier in the month)\n\n• ✅ = Green (received this week)");
}

/**
 * ONE-TIME FIX: Retroactively detect and mark late submissions in Safety Reports
 * This FAST version searches Gmail in bulk for the target week, then matches to Safety Reports.
 *
 * Specifically looks for JHAs from week of 02/08/2026 that were received in week of 02/15/2026.
 */
function fixLateSubmissionsRetroactively() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var safetySheet = ss.getSheetByName("Safety Reports");

  if (!safetySheet) {
    Browser.msgBox("❌ Safety Reports sheet not found.");
    return;
  }

  var tz = Session.getScriptTimeZone();

  // Target: Reports for week of 02/08/2026 that were received after 02/14/2026 (Saturday end)
  var targetWeekStart = new Date(2026, 1, 8);  // Feb 8, 2026 (Sunday)
  var targetWeekEnd = new Date(2026, 1, 14, 23, 59, 59);  // Feb 14, 2026 (Saturday end)

  Logger.log("=== Starting Late Submission Fix ===");
  Logger.log("Target week: " + Utilities.formatDate(targetWeekStart, tz, "MM/dd/yyyy") +
             " to " + Utilities.formatDate(targetWeekEnd, tz, "MM/dd/yyyy"));

  // Step 1: Search Gmail for JHAs received AFTER Feb 14 that have dates in Feb 8-14
  // This catches emails received in the NEXT week
  var lateEmails = {};

  // Search for JHAs received after Feb 14, 2026
  var searchQuery = 'subject:"Job Hazard Report" after:2026/02/14 before:2026/02/22';
  Logger.log("Searching Gmail: " + searchQuery);

  try {
    var threads = GmailApp.search(searchQuery);
    Logger.log("Found " + threads.length + " threads");

    for (var t = 0; t < threads.length; t++) {
      var messages = threads[t].getMessages();
      for (var m = 0; m < messages.length; m++) {
        var msg = messages[m];
        var subject = msg.getSubject();
        var receivedDate = msg.getDate();

        // Extract report date from subject: "Job Hazard Report 02-13-2026_015-26_..."
        var dateMatch = subject.match(/Job Hazard Report\s+(\d{2})-(\d{2})-(\d{4})/i);
        if (dateMatch) {
          var reportDate = new Date(parseInt(dateMatch[3]), parseInt(dateMatch[1]) - 1, parseInt(dateMatch[2]), 12, 0, 0);

          // Check if report date is in target week (02/08 - 02/14)
          if (reportDate >= targetWeekStart && reportDate <= targetWeekEnd) {
            // Check if received AFTER target week ended
            if (receivedDate > targetWeekEnd) {
              // Extract job number
              var jobMatch = subject.match(/_(\d{3}-\d{2})_/);
              var jobNumber = jobMatch ? jobMatch[1] : '';

              var key = Utilities.formatDate(reportDate, tz, "yyyy-MM-dd") + "_" + jobNumber;
              lateEmails[key] = {
                reportDate: reportDate,
                receivedDate: receivedDate,
                jobNumber: jobNumber,
                subject: subject
              };

              Logger.log("LATE: " + jobNumber + " - Report " + Utilities.formatDate(reportDate, tz, "MM/dd") +
                        " received " + Utilities.formatDate(receivedDate, tz, "MM/dd"));
            }
          }
        }
      }
    }
  } catch (e) {
    Logger.log("Gmail search error: " + e.toString());
  }

  // Also search for Safety Meetings received late
  searchQuery = 'subject:"Safety Meeting Report" after:2026/02/14 before:2026/02/22';
  Logger.log("Searching Gmail for Safety Meetings: " + searchQuery);

  try {
    var threads = GmailApp.search(searchQuery);
    Logger.log("Found " + threads.length + " Safety Meeting threads");

    for (var t = 0; t < threads.length; t++) {
      var messages = threads[t].getMessages();
      for (var m = 0; m < messages.length; m++) {
        var msg = messages[m];
        var subject = msg.getSubject();
        var receivedDate = msg.getDate();

        // Extract week date from subject: "Safety Meeting Report  Week of 02-02-2026 Safety Topic 015-26"
        var dateMatch = subject.match(/Week of\s+(\d{2})-(\d{2})-(\d{4})/i);
        if (dateMatch) {
          var reportDate = new Date(parseInt(dateMatch[3]), parseInt(dateMatch[1]) - 1, parseInt(dateMatch[2]), 12, 0, 0);

          // Check if report date is in or before target week
          if (reportDate >= targetWeekStart && reportDate <= targetWeekEnd) {
            if (receivedDate > targetWeekEnd) {
              var jobMatch = subject.match(/(\d{3}-\d{2})\s*$/);
              var jobNumber = jobMatch ? jobMatch[1] : '';

              var key = "SM_" + Utilities.formatDate(reportDate, tz, "yyyy-MM-dd") + "_" + jobNumber;
              lateEmails[key] = {
                reportDate: reportDate,
                receivedDate: receivedDate,
                jobNumber: jobNumber,
                subject: subject,
                type: 'Safety Meeting'
              };

              Logger.log("LATE Safety Meeting: " + jobNumber + " - Week of " + Utilities.formatDate(reportDate, tz, "MM/dd") +
                        " received " + Utilities.formatDate(receivedDate, tz, "MM/dd"));
            }
          }
        }
      }
    }
  } catch (e) {
    Logger.log("Gmail Safety Meeting search error: " + e.toString());
  }

  var lateCount = Object.keys(lateEmails).length;
  Logger.log("Total late emails found: " + lateCount);

  if (lateCount === 0) {
    Browser.msgBox("ℹ️ No late submissions found for the week of 02/08/2026.");
    return;
  }

  // Step 2: Update Safety Reports sheet with LATE SUBMISSION notes
  var data = safetySheet.getDataRange().getValues();
  var headers = data[0];

  var colIdx = { reportDate: 0, reportType: 1, jobNumber: 2, notes: 10 };
  for (var h = 0; h < headers.length; h++) {
    if (String(headers[h]).toLowerCase().trim() === 'notes') colIdx.notes = h;
  }

  var updatedCount = 0;

  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var reportDate = row[colIdx.reportDate];
    var reportType = String(row[colIdx.reportType] || '').trim();
    var jobNumber = String(row[colIdx.jobNumber] || '').trim();
    var notes = String(row[colIdx.notes] || '').trim();

    if (!reportDate || (reportType !== 'JHA' && reportType !== 'Safety Meeting')) continue;
    if (notes.indexOf('LATE SUBMISSION') !== -1) continue;

    var reportDateObj = new Date(reportDate);
    var key = Utilities.formatDate(reportDateObj, tz, "yyyy-MM-dd") + "_" + jobNumber;
    if (reportType === 'Safety Meeting') {
      key = "SM_" + key;
    }

    if (lateEmails[key]) {
      var lateInfo = lateEmails[key];
      var receivedDateStr = Utilities.formatDate(lateInfo.receivedDate, tz, "MM/dd/yyyy");
      var newNotes = notes;
      if (newNotes) newNotes += '\n';
      newNotes += 'LATE SUBMISSION - Received ' + receivedDateStr;

      safetySheet.getRange(i + 1, colIdx.notes + 1).setValue(newNotes);
      updatedCount++;
      Logger.log("Updated row " + (i+1) + ": " + jobNumber + " " + reportType);
    }
  }

  Logger.log("Updated " + updatedCount + " rows in Safety Reports");

  // Step 3: Recalculate compliance for the target week
  if (updatedCount > 0) {
    Logger.log("Recalculating compliance for week of 02/08/2026...");
    var complianceData = calculateSafetyCompliance(targetWeekStart);
    if (complianceData) {
      updateComplianceSheet(complianceData);
      formatComplianceSheetByWeek();
      Logger.log("Compliance updated");
    }
  }

  // Step 4: Add late submission formatting if not already present
  addLateSubmissionFormatting();

  Browser.msgBox("✅ Late Submission Fix Complete!\n\n" +
    "• Late emails found: " + lateCount + "\n" +
    "• Safety Reports updated: " + updatedCount + "\n\n" +
    "Safety Compliance sheet now shows ✅L for late submissions.");
}

/**
 * Menu function for late submission fix
 */
function menuFixLateSubmissions() {
  var ui = SpreadsheetApp.getUi();
  var response = ui.alert(
    '🔧 Fix Late Submissions (Week of 02/08/2026)',
    'This will:\n' +
    '1. Search Gmail for JHAs/Safety Meetings from week of 02/08 received after 02/14\n' +
    '2. Mark them as LATE in Safety Reports\n' +
    '3. Update Safety Compliance to show ✅L\n\n' +
    'Continue?',
    ui.ButtonSet.YES_NO
  );

  if (response === ui.Button.YES) {
    fixLateSubmissionsRetroactively();
  }
}

/**
 * Backfills compliance data for past weeks based on Safety Reports data
 * Scans all Safety Reports and populates Safety Compliance for each week found
 */
function menuBackfillPastWeeks() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var safetySheet = ss.getSheetByName("Safety Reports");

  if (!safetySheet) {
    Browser.msgBox("❌ Safety Reports sheet not found. Run 'Process Safety Emails' first.");
    return;
  }

  // Ensure compliance sheet exists
  var complianceSheet = ss.getSheetByName("Safety Compliance");
  if (!complianceSheet) {
    complianceSheet = setupSafetyComplianceSheet();
  }

  // Ensure config sheet exists
  var configSheet = ss.getSheetByName("Safety Compliance Config");
  if (!configSheet) {
    configSheet = setupSafetyComplianceConfig();
  }

  // Get all unique weeks from Safety Reports
  var reportData = safetySheet.getDataRange().getValues();
  var weeks = {};

  for (var i = 1; i < reportData.length; i++) {
    var reportDate = reportData[i][0];
    if (!reportDate) continue;

    var bounds = getWeekBoundaries(new Date(reportDate));
    var weekKey = Utilities.formatDate(bounds.weekStart, Session.getScriptTimeZone(), "yyyy-MM-dd");
    weeks[weekKey] = bounds.weekStart;
  }

  var weekKeys = Object.keys(weeks).sort().reverse(); // Most recent first

  if (weekKeys.length === 0) {
    Browser.msgBox("ℹ️ No report dates found in Safety Reports sheet.");
    return;
  }

  // Process each week
  var processed = 0;
  for (var w = 0; w < weekKeys.length; w++) {
    var weekStart = weeks[weekKeys[w]];
    var complianceData = calculateSafetyCompliance(weekStart);
    if (complianceData) {
      updateComplianceSheet(complianceData);
      // Previous week is always past deadline, so create tasks for missing reports
      tasksCreated = createMissingReportTasks(complianceData);
      processed++;
    }
  }

  // Apply visual formatting to separate weeks
  formatComplianceSheetByWeek();

  Browser.msgBox("✅ Backfilled compliance data for " + processed + " weeks.\n\nWeeks are now color-coded for easy viewing.");
  Logger.log("menuBackfillPastWeeks: Processed " + processed + " weeks");
}

/**
 * Removes duplicate rows from Safety Compliance sheet
 * Keeps the most recently updated row for each Week+Job combination
 */
function menuCleanupDuplicateComplianceRows() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("Safety Compliance");

  if (!sheet) {
    Browser.msgBox("❌ Safety Compliance sheet not found.");
    return;
  }

  var data = sheet.getDataRange().getValues();
  if (data.length < 2) {
    Browser.msgBox("ℹ️ No data rows to clean up.");
    return;
  }

  // Find duplicates (keep last occurrence = most recent)
  var seen = {};
  var rowsToDelete = [];

  for (var i = data.length - 1; i >= 1; i--) {
    var weekDate = data[i][0];
    var jobNumber = String(data[i][1] || '').trim();

    if (!weekDate || !jobNumber) continue;

    var dateStr = Utilities.formatDate(new Date(weekDate), Session.getScriptTimeZone(), "yyyy-MM-dd");
    var key = dateStr + '|' + jobNumber;

    if (seen[key]) {
      rowsToDelete.push(i + 1); // Row number (1-based)
    } else {
      seen[key] = true;
    }
  }

  if (rowsToDelete.length === 0) {
    Browser.msgBox("✅ No duplicate rows found.");
    return;
  }

  // Delete rows from bottom to top to avoid index shifting
  rowsToDelete.sort(function(a, b) { return b - a; });
  for (var r = 0; r < rowsToDelete.length; r++) {
    sheet.deleteRow(rowsToDelete[r]);
  }

  Browser.msgBox("✅ Removed " + rowsToDelete.length + " duplicate rows.");
  Logger.log("menuCleanupDuplicateComplianceRows: Removed " + rowsToDelete.length + " rows");
}

/**
 * Creates tasks in Task Metadata for missing JHA/Safety Meeting reports
 *
 * @param {Object} complianceData - Data from calculateSafetyCompliance()
 * @returns {number} - Number of tasks created
 */
function createMissingReportTasks(complianceData) {
  if (!complianceData || !complianceData.crews) return 0;

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var taskSheet = ss.getSheetByName("Task Metadata");

  if (!taskSheet) {
    Logger.log("createMissingReportTasks: Task Metadata sheet not found");
    return 0;
  }

  var weekStartStr = Utilities.formatDate(complianceData.weekStart, Session.getScriptTimeZone(), "MM/dd/yyyy");
  var now = new Date();
  var nowStr = Utilities.formatDate(now, Session.getScriptTimeZone(), "MM/dd/yyyy HH:mm");

  // Get existing tasks to avoid duplicates - check by TaskID now (not Notes)
  var existingData = taskSheet.getDataRange().getValues();
  var existingTaskIds = {};
  for (var i = 1; i < existingData.length; i++) {
    var taskId = String(existingData[i][0] || '').trim(); // TaskID column (A)
    if (taskId.indexOf('SafetyCompliance_') === 0) {
      existingTaskIds[taskId] = true;
    }
  }

  var tasksCreated = 0;
  var now = new Date();
  var nowStr = Utilities.formatDate(now, Session.getScriptTimeZone(), "MM/dd/yyyy HH:mm");

  for (var jobNumber in complianceData.crews) {
    var crew = complianceData.crews[jobNumber];

    if (crew.status !== 'Missing Reports' || crew.missingItems.length === 0) continue;

    // Build description of what's missing - consolidate all items
    var missingJHADays = [];
    var missingJHADates = [];
    var missingMeeting = false;
    var missingMonthlyChecklist = false;

    for (var m = 0; m < crew.missingItems.length; m++) {
      var item = crew.missingItems[m];
      if (item.indexOf('JHA') !== -1) {
        // Extract day name (Mon, Tue, etc.)
        var dayMatch = item.match(/JHA \(([A-Za-z]+)\)/);
        if (dayMatch) {
          var dayName = dayMatch[1];
          missingJHADays.push(dayName);
          // Calculate actual date for this day
          var dayOffset = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(dayName);
          if (dayOffset >= 0) {
            var jhaDate = new Date(complianceData.weekStart);
            jhaDate.setDate(jhaDate.getDate() + dayOffset);
            missingJHADates.push(Utilities.formatDate(jhaDate, Session.getScriptTimeZone(), "MM/dd/yyyy"));
          }
        }
      } else if (item === 'Weekly Meeting') {
        missingMeeting = true;
      } else if (item === 'Monthly Checklist') {
        missingMonthlyChecklist = true;
      }
    }

    // Create unique task ID for duplicate checking
    var taskId = 'SafetyCompliance_' + jobNumber + '_' + weekStartStr.replace(/\//g, '-');
    if (existingTaskIds[taskId]) {
      Logger.log("createMissingReportTasks: Task already exists: " + taskId);
      continue;
    }

    // Determine item type (JHA, Weekly Meeting, or combinations)
    // Note: Monthly Checklist is excluded from task creation per user request
    var itemType = '';
    if (missingJHADays.length > 0 && missingMeeting) {
      itemType = 'JHA + Weekly Meeting';
    } else if (missingJHADays.length > 0) {
      itemType = 'JHA';
    } else if (missingMeeting) {
      itemType = 'Weekly Meeting';
    } else {
      // Only monthly checklist missing - don't create task
      continue;
    }

    // Build Notes field in the format expected by ToDoSchedule.html and SMS builder
    // Format: "Missing JHA: 02/03/2026, 02/04/2026; Missing Weekly Safety Meeting for week of 02/01/2026"
    var notesParts = [];
    if (missingJHADates.length > 0) {
      notesParts.push('Missing JHA: ' + missingJHADates.join(', '));
    }
    if (missingMeeting) {
      notesParts.push('Missing Weekly Safety Meeting for week of ' + weekStartStr);
    }
    var notesText = notesParts.join('; ');

    // Get foreman phone for SMS
    var foremanPhone = lookupForemanPhoneByJobNumber(jobNumber);

    // Create task row
    // Actual Task Metadata columns (26 total):
    // TaskID, SourceSheet, SourceRow, Employee, TaskType, ItemType, CurrentItem, Location, Foreman, PhoneNumber,
    // DueDate, ScheduledDate, StartTime, EndTime, Status, NotifiedDate, ScheduledClassDate, ClassType,
    // IsOffice, IsRegistered, IsDeclined, CompletedDate, Notes, CreatedDate, LastModified, InTaskList
    var taskRow = [
      taskId,                           // 1. TaskID
      'Safety Compliance',              // 2. SourceSheet
      jobNumber,                        // 3. SourceRow (job number for reference)
      crew.foreman || jobNumber,        // 4. Employee (foreman name)
      'Missing Safety Report',          // 5. TaskType
      itemType,                         // 6. ItemType (JHA, Weekly Meeting, etc.)
      '',                               // 7. CurrentItem
      lookupLocationByJobNumber(jobNumber), // 8. Location
      crew.foreman || '',               // 9. Foreman
      foremanPhone,                     // 10. PhoneNumber
      complianceData.weekEnd,           // 11. DueDate (Saturday of that week)
      '',                               // 12. ScheduledDate
      '',                               // 13. StartTime
      '',                               // 14. EndTime
      'Unassigned',                     // 15. Status (standardized as of Feb 18, 2026)
      '',                               // 16. NotifiedDate
      '',                               // 17. ScheduledClassDate
      '',                               // 18. ClassType
      '',                               // 19. IsOffice
      '',                               // 20. IsRegistered
      '',                               // 21. IsDeclined
      '',                               // 22. CompletedDate
      notesText,                        // 23. Notes
      now,                              // 24. CreatedDate
      now,                              // 25. LastModified
      ''                                // 26. InTaskList
    ];

    taskSheet.appendRow(taskRow);
    tasksCreated++;
    Logger.log("Created missing report task for " + jobNumber + ": " + notesText);
  }

  return tasksCreated;
}

/**
 * Finalizes past weeks that still show "Pending" status
 * Changes pending items to ❌ and creates tasks for missing reports
 *
 * @returns {Object} - {weeksFinalized: number, tasksCreated: number}
 */
function finalizePastWeeksCompliance() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("Safety Compliance");

  if (!sheet) {
    return { weeksFinalized: 0, tasksCreated: 0 };
  }

  var data = sheet.getDataRange().getValues();
  var today = new Date();
  var currentWeekBounds = getWeekBoundaries(today);
  var currentWeekStr = Utilities.formatDate(currentWeekBounds.weekStart, Session.getScriptTimeZone(), "yyyy-MM-dd");

  var weeksToUpdate = {};
  var rowsToUpdate = [];

  for (var i = 1; i < data.length; i++) {
    var weekDate = data[i][0];
    var status = String(data[i][12] || '').trim(); // Status column (M = 13, 0-indexed = 12)

    if (!weekDate || status !== 'Pending') continue;

    var weekDateObj = new Date(weekDate);
    var weekBounds = getWeekBoundaries(weekDateObj);
    var weekStr = Utilities.formatDate(weekBounds.weekStart, Session.getScriptTimeZone(), "yyyy-MM-dd");

    // Skip current week (still in progress)
    if (weekStr === currentWeekStr) continue;

    // Skip future weeks
    if (weekBounds.weekEnd > today) continue;

    // This is a past week with pending status - needs finalization
    weeksToUpdate[weekStr] = weekBounds.weekStart;
    rowsToUpdate.push({
      row: i + 1,
      weekStart: weekBounds.weekStart
    });
  }

  if (Object.keys(weeksToUpdate).length === 0) {
    return { weeksFinalized: 0, tasksCreated: 0 };
  }

  // Re-calculate compliance for each past week (will mark pending as ❌)
  var totalTasksCreated = 0;
  for (var weekStr in weeksToUpdate) {
    var weekStart = weeksToUpdate[weekStr];
    var complianceData = calculateSafetyCompliance(weekStart);

    if (complianceData) {
      updateComplianceSheet(complianceData);
      var tasksCreated = createMissingReportTasks(complianceData);
      totalTasksCreated += tasksCreated;
    }
  }

  Logger.log("finalizePastWeeksCompliance: Finalized " + Object.keys(weeksToUpdate).length + " weeks, created " + totalTasksCreated + " tasks");

  return {
    weeksFinalized: Object.keys(weeksToUpdate).length,
    tasksCreated: totalTasksCreated
  };
}

/**
 * Menu function to manually finalize past weeks
 */
function menuFinalizePastWeeks() {
  var result = finalizePastWeeksCompliance();

  if (result.weeksFinalized === 0) {
    Browser.msgBox("✅ No past weeks needed finalization. All are up to date.");
  } else {
    Browser.msgBox("✅ Finalized " + result.weeksFinalized + " past week(s).\n\nCreated " + result.tasksCreated + " missing report tasks.");
  }
}

/**
 * Manually regenerate missing report tasks for the previous week
 * Useful when you want to recreate tasks that may have been deleted or if something went wrong
 *
 * @returns {Object} - {tasksCreated: number, weekStart: string, weekEnd: string}
 */
function regeneratePreviousWeekTasks() {
  var today = new Date();
  var currentWeekBounds = getWeekBoundaries(today);

  // Calculate previous week
  var previousWeekStart = new Date(currentWeekBounds.weekStart);
  previousWeekStart.setDate(previousWeekStart.getDate() - 7);
  var previousWeekBounds = getWeekBoundaries(previousWeekStart);

  Logger.log("Regenerating tasks for week: " + Utilities.formatDate(previousWeekBounds.weekStart, Session.getScriptTimeZone(), "MM/dd/yyyy"));

  // Calculate compliance for that week
  var complianceData = calculateSafetyCompliance(previousWeekBounds.weekStart);

  if (!complianceData) {
    return { tasksCreated: 0, error: "Could not calculate compliance data" };
  }

  // Update the compliance sheet
  updateComplianceSheet(complianceData);

  // Create tasks for missing reports
  var tasksCreated = createMissingReportTasks(complianceData);

  return {
    tasksCreated: tasksCreated,
    weekStart: Utilities.formatDate(previousWeekBounds.weekStart, Session.getScriptTimeZone(), "MM/dd/yyyy"),
    weekEnd: Utilities.formatDate(previousWeekBounds.weekEnd, Session.getScriptTimeZone(), "MM/dd/yyyy"),
    compliantCount: complianceData.compliantCount,
    missingCount: complianceData.missingCount
  };
}

/**
 * Menu function to regenerate tasks for previous week
 */
function menuRegeneratePreviousWeekTasks() {
  var result = regeneratePreviousWeekTasks();

  if (result.error) {
    Browser.msgBox("❌ Error: " + result.error);
    return;
  }

  var message = "📋 Previous Week: " + result.weekStart + " - " + result.weekEnd + "\n\n";
  message += "✅ Compliant crews: " + result.compliantCount + "\n";
  message += "❌ Crews with missing reports: " + result.missingCount + "\n\n";
  message += "📝 Tasks created: " + result.tasksCreated;

  if (result.tasksCreated === 0 && result.missingCount > 0) {
    message += "\n\n(Tasks may already exist - check Task Metadata sheet)";
  }

  Browser.msgBox("Previous Week Task Generation", message, Browser.Buttons.OK);
}

/**
 * Shows the Safety Compliance Dashboard with current week stats and trends
 */
function showComplianceDashboard() {
  var today = new Date();
  var weekBounds = getWeekBoundaries(today);

  // Defensive check for weekBounds
  if (!weekBounds || !weekBounds.weekStart) {
    Browser.msgBox("❌ Could not determine week boundaries.");
    return;
  }

  var complianceData = calculateSafetyCompliance(weekBounds.weekStart);

  if (!complianceData || !complianceData.crews) {
    Browser.msgBox("❌ Could not calculate compliance data. Make sure Safety Reports and Safety Compliance Config sheets exist.");
    return;
  }

  // Defensive check for weekStart and weekEnd in complianceData
  if (!complianceData.weekStart || !complianceData.weekEnd) {
    Browser.msgBox("❌ Compliance data is missing week boundaries.");
    return;
  }

  var weekStartStr = Utilities.formatDate(complianceData.weekStart, Session.getScriptTimeZone(), "MM/dd");
  var weekEndStr = Utilities.formatDate(complianceData.weekEnd, Session.getScriptTimeZone(), "MM/dd/yyyy");

  // Count compliant and missing
  var compliantCount = 0;
  var missingCount = 0;
  var pendingCount = 0;

  for (var jobNumber in complianceData.crews) {
    var crew = complianceData.crews[jobNumber];
    if (crew.status === 'Complete') compliantCount++;
    else if (crew.status === 'Missing Reports') missingCount++;
    else pendingCount++;
  }

  // Build HTML dashboard
  var html = '<style>' +
    'body { font-family: Arial, sans-serif; padding: 20px; }' +
    '.header { background: linear-gradient(135deg, #4285f4, #34a853); color: white; padding: 15px; border-radius: 8px; margin-bottom: 20px; }' +
    '.header h2 { margin: 0; }' +
    '.header .subtitle { opacity: 0.9; font-size: 14px; }' +
    '.summary { display: flex; gap: 15px; margin-bottom: 20px; }' +
    '.stat-card { flex: 1; padding: 15px; border-radius: 8px; text-align: center; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }' +
    '.stat-card.green { background: #e8f5e9; border: 2px solid #4caf50; }' +
    '.stat-card.red { background: #ffebee; border: 2px solid #f44336; }' +
    '.stat-card.yellow { background: #fff8e1; border: 2px solid #ffc107; }' +
    '.stat-card .num { font-size: 32px; font-weight: bold; }' +
    '.stat-card .label { font-size: 12px; color: #666; }' +
    '.crew-table { width: 100%; border-collapse: collapse; font-size: 12px; }' +
    '.crew-table th { background: #4285f4; color: white; padding: 8px 4px; text-align: center; }' +
    '.crew-table td { padding: 6px 4px; text-align: center; border-bottom: 1px solid #ddd; }' +
    '.crew-table tr:hover { background: #f5f5f5; }' +
    '.ok { color: #28a745; }' +
    '.late { color: #b8860b; background: #fff8dc; }' +
    '.missing { color: #dc3545; font-weight: bold; }' +
    '.pending { color: #ffc107; }' +
    '.na { color: #999; }' +
    '.scroll-container { max-height: 300px; overflow-y: auto; }' +
    '</style>';

  html += '<div class="header">' +
    '<h2>📊 Safety Compliance Dashboard</h2>' +
    '<div class="subtitle">Week of ' + weekStartStr + ' - ' + weekEndStr + '</div>' +
    '</div>';

  html += '<div class="summary">' +
    '<div class="stat-card green"><div class="num">' + compliantCount + '</div><div class="label">Compliant</div></div>';

  if (complianceData.isPastDeadline) {
    html += '<div class="stat-card red"><div class="num">' + missingCount + '</div><div class="label">Missing</div></div>';
  } else {
    html += '<div class="stat-card yellow"><div class="num">' + pendingCount + '</div><div class="label">Pending</div></div>';
  }

  html += '<div class="stat-card" style="background:#f5f5f5;"><div class="num">' + complianceData.totalCrews + '</div><div class="label">Total Crews</div></div>' +
    '</div>';

  html += '<div class="scroll-container">' +
    '<table class="crew-table">' +
    '<tr><th>Crew</th><th>Foreman</th><th>Sun</th><th>Mon</th><th>Tue</th><th>Wed</th><th>Thu</th><th>Fri</th><th>Sat</th><th>Weekly</th></tr>';

  var crewKeys = Object.keys(complianceData.crews).sort();
  for (var c = 0; c < crewKeys.length; c++) {
    var crew = complianceData.crews[crewKeys[c]];
    if (!crew) {
      Logger.log('showComplianceDashboard: Crew ' + crewKeys[c] + ' is undefined, skipping');
      continue;
    }

    html += '<tr>';
    html += '<td><strong>' + (crew.jobNumber || crewKeys[c]) + '</strong></td>';
    html += '<td>' + (crew.foreman || '-') + '</td>';

    var dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    for (var d = 0; d < dayNames.length; d++) {
      var st = (crew.days && crew.days[dayNames[d]]) ? crew.days[dayNames[d]] : '';
      var cls = st === '✅' ? 'ok' : (st === '✅L' ? 'late' : (st === '❌' ? 'missing' : (st === '⏳' ? 'pending' : 'na')));
      html += '<td class="' + cls + '">' + st + '</td>';
    }

    var mCls = crew.weeklyMeeting === '✅' ? 'ok' : (crew.weeklyMeeting === '❌' ? 'missing' : (crew.weeklyMeeting === '⏳' ? 'pending' : 'na'));
    html += '<td class="' + mCls + '">' + (crew.weeklyMeeting || '') + '</td>';
    html += '</tr>';
  }

  html += '</table></div>';

  html += '<div style="margin-top: 15px; text-align: center;">' +
    '<button onclick="google.script.host.close()" style="background:#4285f4;color:white;border:none;padding:10px 30px;border-radius:4px;cursor:pointer;">Close</button>' +
    '</div>';

  var output = HtmlService.createHtmlOutput(html)
    .setWidth(700)
    .setHeight(550);

  SpreadsheetApp.getUi().showModalDialog(output, 'Safety Compliance Dashboard');
}


// ============================================================================
// MISSING SAFETY REPORT TASK FUNCTIONS (for ToDoSchedule.html)
// These functions support the Safety Compliance section in the Task List
// Added: February 12, 2026 - Was documented but never implemented
// ============================================================================

/**
 * Returns missing safety report tasks from Task Metadata sheet.
 * Filters for PREVIOUS work week only (last Sunday to last Saturday).
 * Called by ToDoSchedule.html to populate the Safety Compliance section.
 *
 * @return {Array} Array of task objects with: taskId, foreman, itemType, location, phoneNumber, notes, status, completed, completedDate, dueDate, jobNumber
 */
function getMissingSafetyReportTasks() {
  Logger.log('=== getMissingSafetyReportTasks START ===');

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var metadataSheet = ss.getSheetByName('Task Metadata');

  if (!metadataSheet || metadataSheet.getLastRow() < 2) {
    Logger.log('getMissingSafetyReportTasks: Task Metadata sheet not found or empty');
    return [];
  }

  var data = metadataSheet.getDataRange().getValues();
  var headers = data[0];

  // Build column index map
  var colIdx = {};
  for (var h = 0; h < headers.length; h++) {
    var header = String(headers[h]).toLowerCase().trim();
    if (header === 'taskid') colIdx.taskID = h;
    if (header === 'sourcesheet') colIdx.sourceSheet = h;
    if (header === 'sourcerow') colIdx.sourceRow = h;
    if (header === 'employee') colIdx.employee = h;
    if (header === 'tasktype') colIdx.taskType = h;
    if (header === 'itemtype') colIdx.itemType = h;
    if (header === 'location') colIdx.location = h;
    if (header === 'foreman') colIdx.foreman = h;
    if (header === 'phonenumber') colIdx.phoneNumber = h;
    if (header === 'duedate') colIdx.dueDate = h;
    if (header === 'status') colIdx.status = h;
    if (header === 'notes') colIdx.notes = h;
    if (header === 'completeddate') colIdx.completedDate = h;
  }

  // Calculate PREVIOUS week boundaries (Sunday to Saturday)
  var today = new Date();
  today.setHours(0, 0, 0, 0);

  // Get current week start (Sunday)
  var dayOfWeek = today.getDay(); // 0 = Sunday
  var currentWeekStart = new Date(today);
  currentWeekStart.setDate(today.getDate() - dayOfWeek);
  currentWeekStart.setHours(0, 0, 0, 0);

  // Previous week boundaries
  var previousWeekStart = new Date(currentWeekStart);
  previousWeekStart.setDate(currentWeekStart.getDate() - 7); // Sunday of previous week

  var previousWeekEnd = new Date(currentWeekStart);
  previousWeekEnd.setDate(currentWeekStart.getDate() - 1); // Saturday of previous week
  previousWeekEnd.setHours(23, 59, 59, 999);

  Logger.log('getMissingSafetyReportTasks: Previous week: ' + previousWeekStart.toDateString() + ' to ' + previousWeekEnd.toDateString());

  var tasks = [];

  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var taskId = String(row[colIdx.taskID] || '').trim();
    var sourceSheet = String(row[colIdx.sourceSheet] || '').trim();
    var taskType = String(row[colIdx.taskType] || '').trim();

    // Check if this is a Safety Compliance task
    var isSafetyComplianceTask = (
      taskId.indexOf('SafetyCompliance_') === 0 ||
      sourceSheet === 'Safety Compliance' ||
      taskType === 'Missing Safety Report'
    );

    if (!isSafetyComplianceTask) continue;

    // Get due date to filter for previous week only
    var dueDate = row[colIdx.dueDate];
    if (dueDate) {
      var dueDateObj = (dueDate instanceof Date) ? dueDate : new Date(dueDate);
      if (!isNaN(dueDateObj.getTime())) {
        dueDateObj.setHours(0, 0, 0, 0);

        // Skip if not from previous week
        // Due date is Saturday of the week, so check if it falls within previous week
        if (dueDateObj < previousWeekStart || dueDateObj > previousWeekEnd) {
          continue;
        }
      }
    }

    // Get employee/foreman - handle malformed data
    var employee = String(row[colIdx.employee] || '').trim();
    var foreman = String(row[colIdx.foreman] || '').trim();
    var itemType = String(row[colIdx.itemType] || '').trim();
    var notes = String(row[colIdx.notes] || '').trim();

    // Detect malformed data where "Missing Safety Report" is in employee column
    if (employee === 'Missing Safety Report') {
      // Data is shifted - try to extract from other columns
      itemType = String(row[colIdx.taskType] || '').trim();
      employee = String(row[colIdx.itemType] || '').trim();
      foreman = employee;
    }

    var status = String(row[colIdx.status] || 'Pending').trim();
    var completedDate = row[colIdx.completedDate];
    var isCompleted = status === 'Complete' || status === 'Completed' || !!completedDate;

    // SKIP completed tasks - don't include them in the returned list!
    if (isCompleted) {
      Logger.log('getMissingSafetyReportTasks: Skipping completed task ' + taskId + ' (status=' + status + ')');
      continue;
    }

    // Extract job number from taskId
    var jobNumber = '';
    var taskIdParts = taskId.split('_');
    if (taskIdParts.length >= 2) {
      jobNumber = taskIdParts[1];
    }

    // Build task object
    var task = {
      taskId: taskId,
      foreman: foreman || employee || 'Unknown',
      employee: employee || foreman || 'Unknown',
      itemType: itemType || 'Missing Report',
      location: String(row[colIdx.location] || '').trim(),
      phoneNumber: String(row[colIdx.phoneNumber] || '').trim(),
      notes: notes,
      status: status,
      completed: isCompleted,
      completedDate: completedDate ? formatDate(completedDate) : '',
      dueDate: dueDate ? formatDate(dueDate) : '',
      jobNumber: jobNumber,
      metadataRow: i + 1 // 1-based row number for updates
    };

    tasks.push(task);
  }

  Logger.log('getMissingSafetyReportTasks: Returning ' + tasks.length + ' tasks from previous week');
  Logger.log('=== getMissingSafetyReportTasks END ===');

  return tasks;
}

/**
 * Marks a missing safety report task as Complete in Task Metadata.
 * Sets CompletedDate and appends resolution notes.
 *
 * @param {string} taskId - The TaskID to mark complete
 * @param {string} resolutionNotes - Notes explaining why the report wasn't received
 * @return {Object} Success/failure status with message
 */
function completeMissingSafetyReportTask(taskId, resolutionNotes) {
  Logger.log('=== completeMissingSafetyReportTask START ===');
  Logger.log('TaskID: ' + taskId);
  Logger.log('Notes: ' + resolutionNotes);

  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var metadataSheet = ss.getSheetByName('Task Metadata');

    if (!metadataSheet || metadataSheet.getLastRow() < 2) {
      return { success: false, message: 'Task Metadata sheet not found' };
    }

    var data = metadataSheet.getDataRange().getValues();
    var headers = data[0];

    // Build column index map
    var colIdx = {};
    for (var h = 0; h < headers.length; h++) {
      var header = String(headers[h]).toLowerCase().trim();
      if (header === 'taskid') colIdx.taskID = h;
      if (header === 'status') colIdx.status = h;
      if (header === 'notes') colIdx.notes = h;
      if (header === 'completeddate') colIdx.completedDate = h;
      if (header === 'lastmodified') colIdx.lastModified = h;
    }

    // Find the row with matching taskId
    var foundRow = -1;
    for (var i = 1; i < data.length; i++) {
      if (String(data[i][colIdx.taskID]).trim() === taskId) {
        foundRow = i + 1; // 1-based row number
        break;
      }
    }

    if (foundRow === -1) {
      return { success: false, message: 'Task not found: ' + taskId };
    }

    // Update the row
    var now = new Date();
    var timestamp = Utilities.formatDate(now, Session.getScriptTimeZone(), 'MM/dd/yyyy HH:mm');

    // Set Status to Complete
    metadataSheet.getRange(foundRow, colIdx.status + 1).setValue('Complete');

    // Set CompletedDate
    metadataSheet.getRange(foundRow, colIdx.completedDate + 1).setValue(now);

    // Append resolution notes
    var existingNotes = String(data[foundRow - 1][colIdx.notes] || '').trim();
    var newNotes = existingNotes;
    if (newNotes) newNotes += '\n\n';
    newNotes += '=== RESOLUTION (' + timestamp + ') ===\n' + resolutionNotes;
    metadataSheet.getRange(foundRow, colIdx.notes + 1).setValue(newNotes);

    // Update LastModified
    if (colIdx.lastModified !== undefined) {
      metadataSheet.getRange(foundRow, colIdx.lastModified + 1).setValue(now);
    }

    Logger.log('completeMissingSafetyReportTask: Updated row ' + foundRow);
    Logger.log('=== completeMissingSafetyReportTask END ===');

    return { success: true, message: 'Task marked complete' };

  } catch (e) {
    Logger.log('completeMissingSafetyReportTask ERROR: ' + e.toString());
    return { success: false, message: 'Error: ' + e.toString() };
  }
}

/**
 * Regenerates the Notes field for all Safety Compliance tasks by reading from Safety Compliance sheet.
 * Use this to fix tasks that have empty or incorrect notes.
 *
 * Menu: Glove Manager → Safety Reports → 🔧 Fix Missing Day Notes
 */
function fixSafetyComplianceNotes() {
  Logger.log('=== fixSafetyComplianceNotes START ===');

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var complianceSheet = ss.getSheetByName('Safety Compliance');
  var taskSheet = ss.getSheetByName('Task Metadata');

  if (!complianceSheet || !taskSheet) {
    SpreadsheetApp.getUi().alert('Error: Safety Compliance or Task Metadata sheet not found.');
    return;
  }

  // Read Safety Compliance data
  var compData = complianceSheet.getDataRange().getValues();
  var compHeaders = compData[0];

  // Find column indices in Safety Compliance sheet
  var compColIdx = {};
  for (var h = 0; h < compHeaders.length; h++) {
    var header = String(compHeaders[h]).toLowerCase().trim();
    if (header === 'week start') compColIdx.weekStart = h;
    if (header === 'job number') compColIdx.jobNumber = h;
    if (header === 'foreman') compColIdx.foreman = h;
    if (header === 'sun') compColIdx.sun = h;
    if (header === 'mon') compColIdx.mon = h;
    if (header === 'tue') compColIdx.tue = h;
    if (header === 'wed') compColIdx.wed = h;
    if (header === 'thu') compColIdx.thu = h;
    if (header === 'fri') compColIdx.fri = h;
    if (header === 'sat') compColIdx.sat = h;
    if (header === 'weekly meeting') compColIdx.weeklyMeeting = h;
    if (header === 'status') compColIdx.status = h;
    if (header === 'updated') compColIdx.updated = h;
  }

  // Build lookup: job number + week start -> missing days
  var complianceLookup = {};
  for (var i = 1; i < compData.length; i++) {
    var row = compData[i];
    var weekStart = row[compColIdx.weekStart];
    var jobNumber = String(row[compColIdx.jobNumber] || '').trim();

    if (!weekStart || !jobNumber) continue;

    var weekStartStr = '';
    if (weekStart instanceof Date) {
      weekStartStr = Utilities.formatDate(weekStart, Session.getScriptTimeZone(), 'MM-dd-yyyy');
    } else {
      weekStartStr = String(weekStart).replace(/\//g, '-');
    }

    var key = jobNumber + '_' + weekStartStr;

    // Check which days are missing (❌ or contains ❌)
    var missingDays = [];
    var dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    var dayColumns = [compColIdx.sun, compColIdx.mon, compColIdx.tue, compColIdx.wed, compColIdx.thu, compColIdx.fri, compColIdx.sat];

    for (var d = 0; d < dayNames.length; d++) {
      var cellValue = String(row[dayColumns[d]] || '').trim();
      // Check for ❌ that is NOT followed by a resolution code (D, F, A, W, L)
      // ❌ alone or ❌🔔 (notified) means still missing
      if (cellValue === '❌' || cellValue === '❌🔔') {
        // Calculate actual date
        var dayDate = new Date(weekStart);
        dayDate.setDate(dayDate.getDate() + d);
        var dateStr = Utilities.formatDate(dayDate, Session.getScriptTimeZone(), 'MM/dd/yyyy');
        missingDays.push({ day: dayNames[d], date: dateStr });
      }
    }

    // Check Weekly Meeting
    var weeklyMeetingMissing = false;
    var wmValue = String(row[compColIdx.weeklyMeeting] || '').trim();
    if (wmValue === '❌' || wmValue === '❌🔔') {
      weeklyMeetingMissing = true;
    }

    // Get week start as MM/dd/yyyy for notes
    var weekStartDisplay = '';
    if (weekStart instanceof Date) {
      weekStartDisplay = Utilities.formatDate(weekStart, Session.getScriptTimeZone(), 'MM/dd/yyyy');
    } else {
      weekStartDisplay = String(weekStart);
    }

    complianceLookup[key] = {
      missingDays: missingDays,
      weeklyMeetingMissing: weeklyMeetingMissing,
      weekStartDisplay: weekStartDisplay
    };
  }

  Logger.log('fixSafetyComplianceNotes: Built lookup with ' + Object.keys(complianceLookup).length + ' entries');

  // Read Task Metadata
  var taskData = taskSheet.getDataRange().getValues();
  var taskHeaders = taskData[0];

  // Find column indices in Task Metadata
  var taskColIdx = {};
  for (var h = 0; h < taskHeaders.length; h++) {
    var header = String(taskHeaders[h]).toLowerCase().trim();
    if (header === 'taskid') taskColIdx.taskID = h;
    if (header === 'notes') taskColIdx.notes = h;
    if (header === 'status') taskColIdx.status = h;
    if (header === 'lastmodified') taskColIdx.lastModified = h;
  }

  var updatedCount = 0;
  var now = new Date();

  for (var i = 1; i < taskData.length; i++) {
    var taskRow = taskData[i];
    var taskId = String(taskRow[taskColIdx.taskID] || '').trim();

    // Only process SafetyCompliance tasks
    if (taskId.indexOf('SafetyCompliance_') !== 0) continue;

    // Skip completed tasks
    var status = String(taskRow[taskColIdx.status] || '').trim();
    if (status === 'Complete' || status === 'Completed') continue;

    // Parse TaskID: SafetyCompliance_XXX-XX_MM-DD-YYYY
    var parts = taskId.split('_');
    if (parts.length < 3) continue;

    var jobNumber = parts[1];
    var weekDatePart = parts[2]; // MM-DD-YYYY
    var key = jobNumber + '_' + weekDatePart;

    var compInfo = complianceLookup[key];
    if (!compInfo) {
      Logger.log('fixSafetyComplianceNotes: No compliance data found for key=' + key);
      continue;
    }

    // Build new notes text
    var notesParts = [];
    if (compInfo.missingDays.length > 0) {
      var dates = compInfo.missingDays.map(function(d) { return d.date; });
      notesParts.push('Missing JHA: ' + dates.join(', '));
    }
    if (compInfo.weeklyMeetingMissing) {
      notesParts.push('Missing Weekly Safety Meeting for week of ' + compInfo.weekStartDisplay);
    }

    if (notesParts.length === 0) {
      // No missing items - task may have been resolved
      Logger.log('fixSafetyComplianceNotes: No missing items for ' + taskId + ' - skipping');
      continue;
    }

    var newNotes = notesParts.join(', ');
    var existingNotes = String(taskRow[taskColIdx.notes] || '').trim();

    // Check if notes need updating
    if (existingNotes !== newNotes) {
      // Update notes
      taskSheet.getRange(i + 1, taskColIdx.notes + 1).setValue(newNotes);

      // Update last modified
      if (taskColIdx.lastModified !== undefined) {
        taskSheet.getRange(i + 1, taskColIdx.lastModified + 1).setValue(now);
      }

      updatedCount++;
      Logger.log('fixSafetyComplianceNotes: Updated ' + taskId + ' notes to: ' + newNotes);
    }
  }

  Logger.log('=== fixSafetyComplianceNotes END - Updated ' + updatedCount + ' tasks ===');
}

/**
 * Records resolutions for missing safety report days.
 * Updates the Safety Compliance sheet with resolution codes and marks the task complete.
 * Updated: Feb 17, 2026 - Fixed taskId matching to use exact match + secondary match by notes dates
 *
 * @param {string} taskId - The TaskID from Task Metadata
 * @param {string} weekOf - Week start date (MM/DD/YYYY format)
 * @param {Array} resolutions - Array of {type, date, dayName, reason}
 * @param {string} jobNumber - The crew job number (XXX-XX)
 * @param {string} employeeName - The foreman/employee name
 * @return {Object} {success: boolean, error?: string}
 */
function recordMissingReportResolutions(taskId, weekOf, resolutions, jobNumber, employeeName) {
  Logger.log('=== recordMissingReportResolutions START ===');
  Logger.log('taskId=' + taskId + ', weekOf=' + weekOf + ', jobNumber=' + jobNumber);

  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var complianceSheet = ss.getSheetByName('Safety Compliance');
    var taskSheet = ss.getSheetByName('Task Metadata');

    if (!complianceSheet) {
      return { success: false, error: 'Safety Compliance sheet not found' };
    }

    // Parse weekOf date
    var weekOfParts = weekOf.match(/(\d{2})\/(\d{2})\/(\d{4})/);
    if (!weekOfParts) {
      return { success: false, error: 'Invalid week date: ' + weekOf };
    }
    var targetWeekStart = new Date(parseInt(weekOfParts[3]), parseInt(weekOfParts[1]) - 1, parseInt(weekOfParts[2]));

    // Get job number from taskId if not provided
    if (!jobNumber || !jobNumber.match(/^\d{3}-\d{2}$/)) {
      var match = taskId.match(/(\d{3}-\d{2})/);
      if (match) jobNumber = match[1];
    }

    if (!jobNumber) {
      return { success: false, error: 'Could not identify crew' };
    }

    // Find row in Safety Compliance
    var compData = complianceSheet.getDataRange().getValues();
    var headers = compData[0];
    var colIdx = {};
    for (var h = 0; h < headers.length; h++) {
      var hdr = String(headers[h]).toLowerCase().trim();
      if (hdr === 'week start') colIdx.weekStart = h;
      if (hdr === 'job number') colIdx.jobNumber = h;
      if (hdr === 'sun') colIdx.sun = h;
      if (hdr === 'mon') colIdx.mon = h;
      if (hdr === 'tue') colIdx.tue = h;
      if (hdr === 'wed') colIdx.wed = h;
      if (hdr === 'thu') colIdx.thu = h;
      if (hdr === 'fri') colIdx.fri = h;
      if (hdr === 'sat') colIdx.sat = h;
      if (hdr === 'weekly meeting') colIdx.weeklyMeeting = h;
      if (hdr === 'status') colIdx.status = h;
      if (hdr === 'updated') colIdx.updated = h;
    }

    var dayColumns = {
      'Sunday': colIdx.sun, 'Monday': colIdx.mon, 'Tuesday': colIdx.tue,
      'Wednesday': colIdx.wed, 'Thursday': colIdx.thu, 'Friday': colIdx.fri, 'Saturday': colIdx.sat
    };

    var reasonCodes = {
      'C': '✅', 'D': '❌D', 'F': '❌F', 'A': '❌A', 'W': '❌W', 'L': '❌L'
    };

    // Find matching row
    var foundRow = -1;
    for (var i = 1; i < compData.length; i++) {
      var row = compData[i];
      var weekStart = row[colIdx.weekStart];
      var rowJobNumber = String(row[colIdx.jobNumber] || '').trim();
      if (!weekStart) continue;

      var rowDate = (weekStart instanceof Date) ? weekStart : new Date(weekStart);
      if (rowDate.getDate() === targetWeekStart.getDate() &&
          rowDate.getMonth() === targetWeekStart.getMonth() &&
          rowDate.getFullYear() === targetWeekStart.getFullYear() &&
          rowJobNumber === jobNumber) {
        foundRow = i + 1;
        break;
      }
    }

    if (foundRow === -1) {
      return { success: false, error: 'Row not found for ' + jobNumber + ' week ' + weekOf };
    }

    // Apply resolutions
    var now = new Date();
    for (var r = 0; r < resolutions.length; r++) {
      var res = resolutions[r];
      var code = reasonCodes[res.reason] || res.reason;

      if (res.type === 'JHA') {
        var col = dayColumns[res.dayName];
        if (col !== undefined) {
          complianceSheet.getRange(foundRow, col + 1).setValue(code);
        }
      } else if (res.type === 'WeeklyMeeting') {
        complianceSheet.getRange(foundRow, colIdx.weeklyMeeting + 1).setValue(code);
      }
    }

    // Update status
    if (colIdx.status !== undefined) {
      complianceSheet.getRange(foundRow, colIdx.status + 1).setValue('Resolved');
    }
    if (colIdx.updated !== undefined) {
      complianceSheet.getRange(foundRow, colIdx.updated + 1).setValue(now);
    }

    // Mark Task Metadata complete - match by exact taskId first, then fall back to job number + week
    if (taskSheet) {
      var taskData = taskSheet.getDataRange().getValues();
      var taskHeaders = taskData[0];
      var taskColIdx = {};
      for (var th = 0; th < taskHeaders.length; th++) {
        var tHdr = String(taskHeaders[th]).toLowerCase().trim();
        if (tHdr === 'taskid') taskColIdx.taskID = th;
        if (tHdr === 'sourcesheet') taskColIdx.sourceSheet = th;
        if (tHdr === 'sourcerow') taskColIdx.sourceRow = th;
        if (tHdr === 'tasktype') taskColIdx.taskType = th;
        if (tHdr === 'status') taskColIdx.status = th;
        if (tHdr === 'completeddate') taskColIdx.completedDate = th;
        if (tHdr === 'notes') taskColIdx.notes = th;
        if (tHdr === 'lastmodified') taskColIdx.lastModified = th;
      }

      var markedCount = 0;
      var weekDateStr = Utilities.formatDate(targetWeekStart, Session.getScriptTimeZone(), 'MM/dd/yyyy');


      // Build expected taskId patterns to match
      // Format 1: SafetyCompliance_015-26_02-08-2026 (with dashes in date)
      // Format 2: SafetyCompliance_015-26_02/08/2026 (with slashes in date - less common)
      var expectedTaskIdPattern1 = 'SafetyCompliance_' + jobNumber + '_' + weekDateStr.replace(/\//g, '-');
      var expectedTaskIdPattern2 = 'SafetyCompliance_' + jobNumber + '_' + weekDateStr;

      Logger.log('recordMissingReportResolutions: Looking for taskId matching: ' + expectedTaskIdPattern1 + ' or exact=' + taskId);

      var safetyTaskCount = 0;
      for (var t = 1; t < taskData.length; t++) {
        var rowTaskId = String(taskData[t][taskColIdx.taskID] || '').trim();
        var rowSourceSheet = String(taskData[t][taskColIdx.sourceSheet] || '').trim();
        var rowTaskType = String(taskData[t][taskColIdx.taskType] || '').trim();
        var rowNotes = String(taskData[t][taskColIdx.notes] || '').trim();
        var rowSourceRow = String(taskData[t][taskColIdx.sourceRow] || '').trim();

        // Check if this is a Safety Compliance task
        var isSafetyTask = (
          rowTaskId.indexOf('SafetyCompliance_') === 0 ||
          rowSourceSheet === 'Safety Compliance' ||
          rowTaskType === 'Missing Safety Report'
        );

        if (!isSafetyTask) continue;

        safetyTaskCount++;

        // PRIMARY MATCH: Match by exact taskId (most reliable)
        var isExactMatch = (rowTaskId === expectedTaskIdPattern1 || rowTaskId === expectedTaskIdPattern2 || rowTaskId === taskId);


        if (isExactMatch) {
          // This is an exact match - mark complete
          var taskRow = t + 1;
          taskSheet.getRange(taskRow, taskColIdx.status + 1).setValue('Complete');
          taskSheet.getRange(taskRow, taskColIdx.completedDate + 1).setValue(now);
          if (taskColIdx.lastModified !== undefined) {
            taskSheet.getRange(taskRow, taskColIdx.lastModified + 1).setValue(now);
          }
          Logger.log('Marked Task Metadata row ' + taskRow + ' as Complete (exact match) for taskId: ' + rowTaskId);
          markedCount++;
          continue;
        }

        // SECONDARY MATCH: Check if it matches our job number and week
        // This catches tasks that might have slightly different taskId formats
        var rowJobNumber = '';
        if (rowTaskId.indexOf(jobNumber) !== -1) {
          rowJobNumber = jobNumber;
        } else if (rowSourceRow === jobNumber) {
          rowJobNumber = jobNumber;
        } else {
          var jm = rowTaskId.match(/(\d{3}-\d{2})/);
          if (jm) rowJobNumber = jm[1];
        }

        if (rowJobNumber !== jobNumber) continue;

        // Check if taskId contains the week date (in either format)
        var weekInTaskId = rowTaskId.indexOf(weekDateStr) !== -1 ||
                           rowTaskId.indexOf(weekDateStr.replace(/\//g, '-')) !== -1;

        // Also check notes for "week of" or the specific date
        var notesWeekMatch = rowNotes.match(/week of\s+(\d{2}\/\d{2}\/\d{4})/i);
        var rowWeek = notesWeekMatch ? notesWeekMatch[1] : '';
        var weekInNotes = (rowWeek === weekDateStr);

        // Also check if notes contain any of the missing dates from this week
        var missingDatesMatch = rowNotes.match(/Missing JHA:\s+([^;]+)/i);
        var notesContainWeekDates = false;
        if (missingDatesMatch) {
          var datesStr = missingDatesMatch[1];
          // Extract first date and check if it's in our week
          var firstDateMatch = datesStr.match(/(\d{2})\/(\d{2})\/(\d{4})/);
          if (firstDateMatch) {
            var firstDate = new Date(parseInt(firstDateMatch[3]), parseInt(firstDateMatch[1]) - 1, parseInt(firstDateMatch[2]));
            var weekStart = new Date(targetWeekStart);
            var weekEnd = new Date(targetWeekStart);
            weekEnd.setDate(weekEnd.getDate() + 6);
            notesContainWeekDates = (firstDate >= weekStart && firstDate <= weekEnd);
          }
        }

        if (weekInTaskId || weekInNotes || notesContainWeekDates) {
          // This is a matching task - mark complete
          var taskRow2 = t + 1;
          taskSheet.getRange(taskRow2, taskColIdx.status + 1).setValue('Complete');
          taskSheet.getRange(taskRow2, taskColIdx.completedDate + 1).setValue(now);
          if (taskColIdx.lastModified !== undefined) {
            taskSheet.getRange(taskRow2, taskColIdx.lastModified + 1).setValue(now);
          }
          Logger.log('Marked Task Metadata row ' + taskRow2 + ' as Complete (secondary match) for job ' + jobNumber + ' week ' + weekDateStr + ' (taskId: ' + rowTaskId + ')');
          markedCount++;
        }
      }

      Logger.log('Marked ' + markedCount + ' Task Metadata rows as Complete for job ' + jobNumber + ' week ' + weekDateStr);
    }

    Logger.log('=== recordMissingReportResolutions SUCCESS ===');
    return { success: true };

  } catch (e) {
    Logger.log('recordMissingReportResolutions ERROR: ' + e.toString());
    return { success: false, error: e.toString() };
  }
}

/**
 * Marks a Safety Compliance task as notified (SMS sent).
 * Updates Safety Compliance sheet cells from ❌ to ❌🔔.
 */
function markSafetyReportNotified(taskId, jobNumberParam, weekOfParam) {
  Logger.log('markSafetyReportNotified: taskId=' + taskId + ', jobNumberParam=' + jobNumberParam + ', weekOfParam=' + weekOfParam);
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var complianceSheet = ss.getSheetByName('Safety Compliance');
    if (!complianceSheet) return { success: false, error: 'Sheet not found' };

    var jobNumber = '';
    var targetWeek = null;

    // Method 1: Use direct parameters if provided
    if (jobNumberParam && weekOfParam) {
      jobNumber = jobNumberParam;
      // Parse weekOf in MM/DD/YYYY format
      var woParts = weekOfParam.match(/(\d{2})\/(\d{2})\/(\d{4})/);
      if (woParts) {
        targetWeek = new Date(parseInt(woParts[3]), parseInt(woParts[1]) - 1, parseInt(woParts[2]));
      }
    }

    // Method 2: Parse from taskId if parameters not provided/valid
    if (!jobNumber || !targetWeek) {
      var parts = taskId.split('_');
      if (parts.length >= 2) {
        // Extract job number from parts[1] if it looks like a job number
        if (parts[1] && parts[1].match(/^\d{3}-\d{2}$/)) {
          jobNumber = parts[1];
        }

        // Try multiple date formats for the week date
        if (parts.length >= 3) {
          var datePart = parts[2];

          // Format 1: MM-DD-YYYY
          var weekParts = datePart.match(/(\d{2})-(\d{2})-(\d{4})/);
          if (weekParts) {
            targetWeek = new Date(parseInt(weekParts[3]), parseInt(weekParts[1]) - 1, parseInt(weekParts[2]));
          }

          // Format 2: YYYYMMDD
          if (!targetWeek) {
            var yyyymmdd = datePart.match(/^(\d{4})(\d{2})(\d{2})$/);
            if (yyyymmdd) {
              var taskDate = new Date(parseInt(yyyymmdd[1]), parseInt(yyyymmdd[2]) - 1, parseInt(yyyymmdd[3]));
              // This date is task creation date, need to look up the actual week
              // For now, use it as a reference but we'll match by job number
              targetWeek = taskDate;
              Logger.log('markSafetyReportNotified: Using YYYYMMDD date format, date=' + targetWeek);
            }
          }
        }
      }
    }

    Logger.log('markSafetyReportNotified: Resolved jobNumber=' + jobNumber + ', targetWeek=' + targetWeek);

    if (!jobNumber) {
      return { success: false, error: 'Could not extract job number from taskId' };
    }

    var data = complianceSheet.getDataRange().getValues();
    var headers = data[0];
    var colIdx = {};
    for (var h = 0; h < headers.length; h++) {
      var hdr = String(headers[h]).toLowerCase().trim();
      if (hdr === 'week start') colIdx.weekStart = h;
      if (hdr === 'job number') colIdx.jobNumber = h;
      if (hdr === 'sun') colIdx.sun = h;
      if (hdr === 'mon') colIdx.mon = h;
      if (hdr === 'tue') colIdx.tue = h;
      if (hdr === 'wed') colIdx.wed = h;
      if (hdr === 'thu') colIdx.thu = h;
      if (hdr === 'fri') colIdx.fri = h;
      if (hdr === 'sat') colIdx.sat = h;
      if (hdr === 'weekly meeting') colIdx.weeklyMeeting = h;
    }

    // If targetWeek is null or today's date (from YYYYMMDD format which is task creation date),
    // find the most recent PAST week row with missing items for this job number
    var today = new Date();
    today.setHours(0, 0, 0, 0);
    var isDateFromCreation = false;

    if (targetWeek) {
      var twDate = new Date(targetWeek);
      twDate.setHours(0, 0, 0, 0);
      // Check if targetWeek is within 1 day of today (likely task creation date, not week start)
      var daysDiff = Math.abs((twDate - today) / (1000 * 60 * 60 * 24));
      isDateFromCreation = daysDiff <= 1;
    }

    var matchedRow = null;
    var matchedRowWeek = null;

    for (var i = 1; i < data.length; i++) {
      var rowWeek = data[i][colIdx.weekStart];
      var rowJob = String(data[i][colIdx.jobNumber] || '').trim();
      if (!rowWeek || rowJob !== jobNumber) continue;

      var rowDate = (rowWeek instanceof Date) ? rowWeek : new Date(rowWeek);

      // Check if this row has any missing items (❌)
      var hasMissing = false;
      var dayCols = [colIdx.sun, colIdx.mon, colIdx.tue, colIdx.wed, colIdx.thu, colIdx.fri, colIdx.sat, colIdx.weeklyMeeting];
      for (var dc = 0; dc < dayCols.length; dc++) {
        if (dayCols[dc] !== undefined && String(data[i][dayCols[dc]]).trim() === '❌') {
          hasMissing = true;
          break;
        }
      }

      if (!hasMissing) continue; // Skip rows without missing items

      // If we have an exact targetWeek match, use it
      if (targetWeek && !isDateFromCreation) {
        if (rowDate.getDate() === targetWeek.getDate() &&
            rowDate.getMonth() === targetWeek.getMonth() &&
            rowDate.getFullYear() === targetWeek.getFullYear()) {
          matchedRow = i;
          matchedRowWeek = rowDate;
          break; // Exact match found
        }
      } else {
        // No exact target week or date is task creation - find most recent PAST week
        rowDate.setHours(0, 0, 0, 0);
        if (rowDate < today) {
          // This is a past week - check if it's more recent than our current match
          if (!matchedRow || rowDate > matchedRowWeek) {
            matchedRow = i;
            matchedRowWeek = rowDate;
          }
        }
      }
    }

    if (matchedRow !== null) {
      var row = matchedRow + 1;
      var dayCols = [colIdx.sun, colIdx.mon, colIdx.tue, colIdx.wed, colIdx.thu, colIdx.fri, colIdx.sat, colIdx.weeklyMeeting];
      var updatedCount = 0;
      for (var d = 0; d < dayCols.length; d++) {
        var col = dayCols[d];
        if (col !== undefined && String(data[matchedRow][col]).trim() === '❌') {
          complianceSheet.getRange(row, col + 1).setValue('❌🔔');
          updatedCount++;
        }
      }
      Logger.log('markSafetyReportNotified: Updated row ' + row + ' (week ' + matchedRowWeek + '), ' + updatedCount + ' cells changed to ❌🔔');
      return { success: true, rowUpdated: row, cellsUpdated: updatedCount };
    }

    return { success: false, error: 'No matching row with missing items found for job ' + jobNumber };
  } catch (e) {
    Logger.log('markSafetyReportNotified ERROR: ' + e);
    return { success: false, error: e.toString() };
  }
}

/**
 * Cleans up duplicate Safety Compliance tasks in Task Metadata.
 * Keeps the task with best status (Complete > Resolved > others) for each job+week.
 *
 * @returns {Object} - {duplicatesRemoved: number, tasksKept: number}
 */
function cleanupDuplicateSafetyComplianceTasks() {
  Logger.log('=== cleanupDuplicateSafetyComplianceTasks START ===');

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var taskSheet = ss.getSheetByName('Task Metadata');

  if (!taskSheet || taskSheet.getLastRow() < 2) {
    Logger.log('cleanupDuplicateSafetyComplianceTasks: No Task Metadata sheet or empty');
    return { duplicatesRemoved: 0, tasksKept: 0 };
  }

  var data = taskSheet.getDataRange().getValues();
  var headers = data[0];

  // Find column indices
  var colIdx = {};
  for (var h = 0; h < headers.length; h++) {
    var header = String(headers[h]).toLowerCase().trim();
    if (header === 'taskid') colIdx.taskID = h;
    if (header === 'sourcesheet') colIdx.sourceSheet = h;
    if (header === 'sourcerow') colIdx.sourceRow = h;
    if (header === 'employee') colIdx.employee = h;
    if (header === 'tasktype') colIdx.taskType = h;
    if (header === 'status') colIdx.status = h;
    if (header === 'completeddate') colIdx.completedDate = h;
    if (header === 'notes') colIdx.notes = h;
    if (header === 'duedate') colIdx.dueDate = h;
    if (header === 'createddate') colIdx.createdDate = h;
  }

  Logger.log('cleanupDuplicateSafetyComplianceTasks: Found ' + (data.length - 1) + ' total rows in Task Metadata');

  /**
   * Helper function to normalize date string to MM-DD-YYYY format
   * Handles: YYYYMMDD, MM-DD-YYYY, MM/DD/YYYY, Date objects
   */
  function normalizeDateString(dateStr) {
    if (!dateStr) return null;

    // If it's a Date object
    if (dateStr instanceof Date) {
      if (isNaN(dateStr.getTime())) return null;
      return Utilities.formatDate(dateStr, Session.getScriptTimeZone(), 'MM-dd-yyyy');
    }

    dateStr = String(dateStr).trim();

    // Format: YYYYMMDD (e.g., 20260208)
    if (/^\d{8}$/.test(dateStr)) {
      var year = dateStr.substring(0, 4);
      var month = dateStr.substring(4, 6);
      var day = dateStr.substring(6, 8);
      return month + '-' + day + '-' + year;
    }

    // Format: MM-DD-YYYY (already normalized)
    if (/^\d{2}-\d{2}-\d{4}$/.test(dateStr)) {
      return dateStr;
    }

    // Format: MM/DD/YYYY
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(dateStr)) {
      return dateStr.replace(/\//g, '-');
    }

    // Format: YYYY-MM-DD (ISO)
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      var parts = dateStr.split('-');
      return parts[1] + '-' + parts[2] + '-' + parts[0];
    }

    // Try parsing as date
    var parsed = new Date(dateStr);
    if (!isNaN(parsed.getTime())) {
      return Utilities.formatDate(parsed, Session.getScriptTimeZone(), 'MM-dd-yyyy');
    }

    return null;
  }

  // Group Safety Compliance tasks by job+week
  // Key format: "jobNumber_weekStart" (e.g., "022-26_02-08-2026")
  var taskGroups = {};
  var safetyTaskCount = 0;

  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var taskId = String(row[colIdx.taskID] || '').trim();
    var sourceSheet = String(row[colIdx.sourceSheet] || '').trim();
    var taskType = String(row[colIdx.taskType] || '').trim();

    // Check if this is a Safety Compliance task
    var isSafetyComplianceTask = (
      taskId.indexOf('SafetyCompliance_') === 0 ||
      sourceSheet === 'Safety Compliance' ||
      taskType === 'Missing Safety Report'
    );

    if (!isSafetyComplianceTask) continue;

    safetyTaskCount++;
    Logger.log('cleanupDuplicateSafetyComplianceTasks: Row ' + (i+1) + ' - TaskID=' + taskId + ', SourceSheet=' + sourceSheet + ', TaskType=' + taskType);


    // Extract job number and week from TaskID or other fields
    var jobNumber = '';
    var weekStr = '';

    // Try to extract from TaskID format: SafetyCompliance_XXX-XX_MM-DD-YYYY or SafetyCompliance_XXX-XX_YYYYMMDD
    var taskIdParts = taskId.split('_');
    if (taskIdParts.length >= 3 && taskIdParts[0] === 'SafetyCompliance') {
      jobNumber = taskIdParts[1];
      // Normalize the date part from TaskID
      weekStr = normalizeDateString(taskIdParts[2]);
    }

    // Try to get job from SourceRow if not in TaskID
    if (!jobNumber || !jobNumber.match(/^\d{3}-\d{2}$/)) {
      var sourceRow = String(row[colIdx.sourceRow] || '').trim();
      var jobMatch = sourceRow.match(/(\d{3}-\d{2})/);
      if (jobMatch) jobNumber = jobMatch[1];
    }

    // Try to get week from notes
    if (!weekStr) {
      var notes = String(row[colIdx.notes] || '').trim();
      var weekMatch = notes.match(/week of\s+(\d{2})\/(\d{2})\/(\d{4})/i);
      if (weekMatch) {
        weekStr = weekMatch[1] + '-' + weekMatch[2] + '-' + weekMatch[3];
      }
    }

    // Try to get week from DueDate (Saturday = end of week)
    if (!weekStr) {
      var dueDate = row[colIdx.dueDate];
      if (dueDate) {
        var dueDateObj = (dueDate instanceof Date) ? dueDate : new Date(dueDate);
        if (!isNaN(dueDateObj.getTime())) {
          var weekStart = new Date(dueDateObj);
          weekStart.setDate(dueDateObj.getDate() - 6); // Saturday - 6 = Sunday
          weekStr = Utilities.formatDate(weekStart, Session.getScriptTimeZone(), 'MM-dd-yyyy');
        }
      }
    }

    if (!jobNumber || !weekStr) {
      Logger.log('cleanupDuplicateSafetyComplianceTasks: Could not parse job/week for row ' + (i+1) + ', taskId=' + taskId);
      continue;
    }

    // Final normalization of weekStr to ensure consistent format
    var normalizedWeek = normalizeDateString(weekStr) || weekStr;
    var key = jobNumber + '_' + normalizedWeek;

    // Get status info
    var status = String(row[colIdx.status] || '').trim();
    var completedDate = row[colIdx.completedDate];
    var isComplete = (status === 'Complete' || status === 'Completed' || completedDate);
    var isResolved = (status === 'Resolved');

    // Priority: Complete > Resolved > Pending > others
    var priority = 0;
    if (isComplete) priority = 3;
    else if (isResolved) priority = 2;
    else if (status === 'Pending' || status === 'Overdue') priority = 1;

    if (!taskGroups[key]) {
      taskGroups[key] = [];
    }

    taskGroups[key].push({
      rowIndex: i + 1, // 1-based row number
      taskId: taskId,
      status: status,
      priority: priority,
      isComplete: isComplete
    });
  }

  Logger.log('cleanupDuplicateSafetyComplianceTasks: Total Safety Compliance tasks found: ' + safetyTaskCount);
  Logger.log('cleanupDuplicateSafetyComplianceTasks: Unique job+week groups: ' + Object.keys(taskGroups).length);

  // Log each group
  for (var debugKey in taskGroups) {
    var debugGroup = taskGroups[debugKey];
    Logger.log('cleanupDuplicateSafetyComplianceTasks: Group ' + debugKey + ' has ' + debugGroup.length + ' task(s)');
  }

  // Find duplicates and rows to delete
  var rowsToDelete = [];
  var tasksKept = 0;

  for (var key in taskGroups) {
    var group = taskGroups[key];

    if (group.length <= 1) {
      tasksKept++;
      continue; // No duplicates for this job+week
    }

    // Sort by priority (highest first), then by rowIndex (newest first if same priority)
    group.sort(function(a, b) {
      if (b.priority !== a.priority) {
        return b.priority - a.priority;
      }
      return b.rowIndex - a.rowIndex; // Newer row has higher index
    });

    // Keep first (best), mark rest for deletion
    tasksKept++;
    Logger.log('cleanupDuplicateSafetyComplianceTasks: DUPLICATE FOUND - Keeping ' + group[0].taskId + ' (status=' + group[0].status + ') for ' + key);

    for (var g = 1; g < group.length; g++) {
      rowsToDelete.push(group[g].rowIndex);
      Logger.log('cleanupDuplicateSafetyComplianceTasks: Will delete row ' + group[g].rowIndex + ' (' + group[g].taskId + ', status=' + group[g].status + ')');
    }
  }

  // Delete rows (from bottom to top to preserve row indices)
  rowsToDelete.sort(function(a, b) { return b - a; }); // Descending order

  for (var d = 0; d < rowsToDelete.length; d++) {
    taskSheet.deleteRow(rowsToDelete[d]);
  }

  Logger.log('cleanupDuplicateSafetyComplianceTasks: Removed ' + rowsToDelete.length + ' duplicates, kept ' + tasksKept + ' tasks');
  Logger.log('=== cleanupDuplicateSafetyComplianceTasks END ===');

  return {
    duplicatesRemoved: rowsToDelete.length,
    tasksKept: tasksKept,
    totalSafetyTasks: safetyTaskCount,
    uniqueGroups: Object.keys(taskGroups).length
  };
}

/**
 * Menu function to clean up duplicate Safety Compliance tasks
 */
function menuCleanupDuplicateSafetyTasks() {
  var result = cleanupDuplicateSafetyComplianceTasks();

  if (result.duplicatesRemoved === 0) {
    Browser.msgBox('✅ No Duplicates Found',
      'Analyzed ' + result.totalSafetyTasks + ' Safety Compliance task(s) in ' + result.uniqueGroups + ' job+week group(s).\\n\\nNo duplicates detected in Task Metadata.',
      Browser.Buttons.OK);
  } else {
    Browser.msgBox('🧹 Cleanup Complete',
      'Removed ' + result.duplicatesRemoved + ' duplicate Safety Compliance task(s).\\n\\n' +
      'Kept ' + result.tasksKept + ' unique task(s).\\n\\n' +
      'For each job+week, the task with best status (Complete > Resolved > Pending) was kept.',
      Browser.Buttons.OK);
  }
}


// ============================================================
// JOB NUMBER → FOREMAN MAPPING FUNCTIONS
// For Process Safety Emails dialog configuration
// Added: February 18, 2026
// ============================================================

/**
 * Gets all job numbers and their associated foremen for the Process Safety Emails dialog.
 * Includes both primary and secondary job numbers from Employees sheet.
 *
 * @returns {Object} { mappings: [{foreman, jobs: [job1, job2, job3], source}], foremen: [names] }
 */
function getJobForemanMappingsForDialog() {
  Logger.log('=== getJobForemanMappingsForDialog START ===');

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var employeesSheet = ss.getSheetByName('Employees');

  if (!employeesSheet || employeesSheet.getLastRow() < 2) {
    Logger.log('Employees sheet not found or empty');
    return { mappings: [], foremen: [] };
  }

  var data = employeesSheet.getDataRange().getValues();
  var headers = data[0];

  // Find column indices dynamically
  var nameCol = -1, jobCol = -1, secondaryJobCol = -1, classCol = -1, lastDayCol = -1;
  for (var h = 0; h < headers.length; h++) {
    var header = String(headers[h]).toLowerCase().trim();
    if (header === 'name') nameCol = h;
    if (header === 'job number') jobCol = h;
    if (header === 'secondary job number' || header === 'secondary job') secondaryJobCol = h;
    if (header === 'job classification' || header === 'classification') classCol = h;
    if (header === 'last day') lastDayCol = h;
  }

  Logger.log('Columns found - name: ' + nameCol + ', job: ' + jobCol + ', secondaryJob: ' + secondaryJobCol + ', class: ' + classCol);

  if (nameCol === -1 || jobCol === -1) {
    Logger.log('Required columns not found');
    return { mappings: [], foremen: [] };
  }

  // Collect crew→foreman mappings
  // Key = crew number (without position suffix), Value = {foreman, priority, jobs: Set}
  var crewForemen = {};
  var allForemen = {};

  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var name = String(row[nameCol]).trim();
    var jobNumber = String(row[jobCol]).trim();
    var secondaryJob = secondaryJobCol !== -1 ? String(row[secondaryJobCol]).trim() : '';
    var classification = classCol !== -1 ? String(row[classCol]).trim() : '';
    var lastDay = lastDayCol !== -1 ? row[lastDayCol] : '';

    // Skip employees who have left
    if (lastDay) continue;

    // Skip if no name or job number
    if (!name || !jobNumber) continue;

    // Track all employee names for dropdown
    allForemen[name] = true;

    // Extract crew number (e.g., "013-26.1" → "013-26")
    var crewNumber = extractCrewNumber(jobNumber);

    if (crewNumber) {
      if (!crewForemen[crewNumber]) {
        crewForemen[crewNumber] = { foreman: '', priority: 999, jobs: {} };
      }
      crewForemen[crewNumber].jobs[crewNumber] = true;

      // Use classification priority to determine foreman
      var priority = getClassificationPriority(classification);
      if (priority < crewForemen[crewNumber].priority) {
        crewForemen[crewNumber].foreman = name;
        crewForemen[crewNumber].priority = priority;
      }
    }

    // Also check secondary job number
    if (secondaryJob) {
      var secondaryCrewNumber = extractCrewNumber(secondaryJob);
      if (secondaryCrewNumber) {
        if (!crewForemen[secondaryCrewNumber]) {
          crewForemen[secondaryCrewNumber] = { foreman: '', priority: 999, jobs: {} };
        }
        crewForemen[secondaryCrewNumber].jobs[secondaryCrewNumber] = true;

        // Same person could be foreman on secondary crew
        var secPriority = getClassificationPriority(classification);
        if (secPriority < crewForemen[secondaryCrewNumber].priority) {
          crewForemen[secondaryCrewNumber].foreman = name;
          crewForemen[secondaryCrewNumber].priority = secPriority;
        }
      }
    }
  }

  // Get saved custom mappings
  var customMappings = getCustomJobForemanMappings();

  // Build result grouped by foreman
  // Keep PRIMARY jobs separate from CUSTOM jobs so we can order them correctly
  var foremanJobs = {}; // foremanName → { primaryJobs: [], customJobs: [] }

  // Add crews from Employees sheet (these are PRIMARY jobs)
  for (var crew in crewForemen) {
    var info = crewForemen[crew];
    if (info.foreman) {
      if (!foremanJobs[info.foreman]) {
        foremanJobs[info.foreman] = { primaryJobs: [], customJobs: [] };
      }
      // Only add if not already in primary jobs
      if (foremanJobs[info.foreman].primaryJobs.indexOf(crew) === -1) {
        foremanJobs[info.foreman].primaryJobs.push(crew);
      }
    }
  }

  // Add custom mappings (these go in customJobs, NOT primaryJobs)
  for (var customJob in customMappings) {
    var customForeman = customMappings[customJob];
    if (!foremanJobs[customForeman]) {
      foremanJobs[customForeman] = { primaryJobs: [], customJobs: [] };
    }
    // Only add to customJobs if not already a primary job
    if (foremanJobs[customForeman].primaryJobs.indexOf(customJob) === -1 &&
        foremanJobs[customForeman].customJobs.indexOf(customJob) === -1) {
      foremanJobs[customForeman].customJobs.push(customJob);
    }
  }

  // Convert to array format for dialog
  // Order: primary jobs FIRST, then custom jobs
  var mappings = [];
  var foremenList = Object.keys(foremanJobs).sort();

  for (var f = 0; f < foremenList.length; f++) {
    var foremanName = foremenList[f];
    var jobsObj = foremanJobs[foremanName];

    // Sort primary jobs first, then append custom jobs
    var primarySorted = jobsObj.primaryJobs.sort();
    var customSorted = jobsObj.customJobs.sort();
    var jobArray = primarySorted.concat(customSorted);

    // Pad to 3 slots
    while (jobArray.length < 3) {
      jobArray.push('');
    }

    mappings.push({
      foreman: foremanName,
      jobs: jobArray.slice(0, 3), // Max 3 jobs per row
      primaryCount: primarySorted.length, // Track how many are primary (for UI styling)
      customCount: customSorted.length
    });
  }

  // Build full foremen list for dropdown (all employees who could be foremen)
  var allForemenList = Object.keys(allForemen).sort();

  Logger.log('Found ' + mappings.length + ' foreman→jobs mappings, ' + allForemenList.length + ' total employees');
  Logger.log('=== getJobForemanMappingsForDialog END ===');

  return {
    mappings: mappings,
    foremen: allForemenList
  };
}

/**
 * Gets saved custom job→foreman mappings from ScriptProperties
 * @returns {Object} Map of jobNumber → foremanName
 */
function getCustomJobForemanMappings() {
  var props = PropertiesService.getScriptProperties();
  var saved = props.getProperty('CUSTOM_JOB_FOREMAN_MAPPINGS');
  if (saved) {
    try {
      return JSON.parse(saved);
    } catch (e) {
      Logger.log('Error parsing custom job mappings: ' + e);
      return {};
    }
  }
  return {};
}

/**
 * Saves custom job→foreman mappings to ScriptProperties
 * Called from dialog when user adds custom job numbers
 * @param {string} mappingsJson - JSON string of {jobNumber: foremanName, ...}
 */
function saveCustomJobForemanMappings(mappingsJson) {
  var props = PropertiesService.getScriptProperties();
  var mappings = {};
  try {
    mappings = JSON.parse(mappingsJson);
  } catch (e) {
    Logger.log('Error parsing mappings JSON: ' + e);
    return { success: false, error: e.toString() };
  }
  props.setProperty('CUSTOM_JOB_FOREMAN_MAPPINGS', JSON.stringify(mappings));
  Logger.log('Saved ' + Object.keys(mappings).length + ' custom job→foreman mappings');
  return { success: true, count: Object.keys(mappings).length };
}

/**
 * Clears all custom job→foreman mappings
 */
function clearCustomJobForemanMappings() {
  var props = PropertiesService.getScriptProperties();
  props.deleteProperty('CUSTOM_JOB_FOREMAN_MAPPINGS');
  SpreadsheetApp.getUi().alert('✅ Custom job→foreman mappings cleared.');
}

/**
 * Looks up foreman by job number, checking custom mappings and dialog config first
 * @param {string} jobNumber - Job number (e.g., "013-26")
 * @param {Object} dialogMappings - Optional mappings from dialog configuration
 * @returns {Object} - {name: string, jobExists: boolean, source: string}
 */
function lookupForemanWithCustomMapping(jobNumber, dialogMappings) {
  if (!jobNumber) return { name: '', jobExists: false, source: 'none' };

  Logger.log("lookupForemanWithCustomMapping: Looking up job " + jobNumber);

  // Check temporary mappings first (set during unknown job resolution in this session)
  var tempMappings = getTempJobForemanMappings();
  Logger.log("lookupForemanWithCustomMapping: Temp mappings = " + JSON.stringify(tempMappings));
  if (tempMappings && tempMappings[jobNumber]) {
    Logger.log("lookupForemanWithCustomMapping: FOUND in temp mappings -> " + tempMappings[jobNumber]);
    return { name: tempMappings[jobNumber], jobExists: true, source: 'temp_session' };
  }

  // Check if this job was explicitly skipped in current session
  var props = PropertiesService.getScriptProperties();
  var skippedJobsStr = props.getProperty('SKIPPED_UNKNOWN_JOBS');
  Logger.log("lookupForemanWithCustomMapping: Skipped jobs = " + skippedJobsStr);
  if (skippedJobsStr) {
    try {
      var skippedJobs = JSON.parse(skippedJobsStr);
      if (skippedJobs.indexOf(jobNumber) !== -1) {
        Logger.log("lookupForemanWithCustomMapping: Job " + jobNumber + " was explicitly skipped");
        return { name: '', jobExists: false, source: 'skipped' };
      }
    } catch (e) {}
  }

  // Check dialog mappings next (passed from current session)
  if (dialogMappings) {
    Logger.log("lookupForemanWithCustomMapping: Checking dialog mappings...");
    for (var foreman in dialogMappings) {
      var jobs = dialogMappings[foreman];
      if (jobs && jobs.indexOf(jobNumber) !== -1) {
        Logger.log("lookupForemanWithCustomMapping: FOUND in dialog mappings -> " + foreman);
        return { name: foreman, jobExists: true, source: 'dialog' };
      }
    }
  }

  // Check saved custom mappings
  var savedCustom = getCustomJobForemanMappings();
  Logger.log("lookupForemanWithCustomMapping: Saved custom mappings = " + JSON.stringify(savedCustom));
  if (savedCustom[jobNumber]) {
    Logger.log("lookupForemanWithCustomMapping: FOUND in saved custom -> " + savedCustom[jobNumber]);
    return { name: savedCustom[jobNumber], jobExists: true, source: 'saved_custom' };
  }

  // Fall back to Employees sheet lookup
  Logger.log("lookupForemanWithCustomMapping: Falling back to Employees sheet lookup...");
  var result = lookupForemanByJobNumber(jobNumber);
  result.source = 'employees';
  return result;
}


/**
 * Stores unknown job numbers encountered during processing for user prompt
 * @param {Array} unknownJobs - Array of {jobNumber, reportType, subject, date}
 */
function storeUnknownJobsForPrompt(unknownJobs) {
  var props = PropertiesService.getScriptProperties();
  props.setProperty('PENDING_UNKNOWN_JOBS', JSON.stringify(unknownJobs || []));
}

/**
 * Gets pending unknown jobs for user prompt
 * @returns {Array} Array of unknown job info
 */
function getPendingUnknownJobs() {
  var props = PropertiesService.getScriptProperties();
  var saved = props.getProperty('PENDING_UNKNOWN_JOBS');
  if (saved) {
    try {
      return JSON.parse(saved);
    } catch (e) {
      return [];
    }
  }
  return [];
}

/**
 * Clears pending unknown jobs
 */
function clearPendingUnknownJobs() {
  var props = PropertiesService.getScriptProperties();
  props.deleteProperty('PENDING_UNKNOWN_JOBS');
}

/**
 * Applies user's decisions for unknown job numbers and continues processing
 * @param {string} decisionsJson - JSON string of [{jobNumber, foreman, action: 'assign'|'skip'}]
 * @returns {Object} Result with temporary mappings applied
 */
function applyUnknownJobDecisions(decisionsJson) {
  Logger.log('=== applyUnknownJobDecisions START ===');

  try {
    var decisions = JSON.parse(decisionsJson);
    var props = PropertiesService.getScriptProperties();

    // MERGE with existing temporary mappings (don't overwrite!)
    var tempMappings = getTempJobForemanMappings() || {};
    var skippedJobs = getSkippedUnknownJobs() || [];

    Logger.log('Existing temp mappings: ' + JSON.stringify(tempMappings));
    Logger.log('Existing skipped jobs: ' + JSON.stringify(skippedJobs));

    for (var i = 0; i < decisions.length; i++) {
      var decision = decisions[i];
      if (decision.action === 'assign' && decision.foreman) {
        tempMappings[decision.jobNumber] = decision.foreman;
        Logger.log('Assigned: ' + decision.jobNumber + ' → ' + decision.foreman);
        // Remove from skipped if it was there
        var skipIdx = skippedJobs.indexOf(decision.jobNumber);
        if (skipIdx !== -1) {
          skippedJobs.splice(skipIdx, 1);
        }
      } else {
        // Only add if not already in skippedJobs
        if (skippedJobs.indexOf(decision.jobNumber) === -1) {
          skippedJobs.push(decision.jobNumber);
        }
        Logger.log('Skipped: ' + decision.jobNumber);
      }
    }

    Logger.log('Final temp mappings: ' + JSON.stringify(tempMappings));
    Logger.log('Final skipped jobs: ' + JSON.stringify(skippedJobs));

    // Store temp mappings for the continuation of processing
    props.setProperty('TEMP_JOB_FOREMAN_MAPPINGS', JSON.stringify(tempMappings));
    props.setProperty('SKIPPED_UNKNOWN_JOBS', JSON.stringify(skippedJobs));

    // Reset batch position to re-process the same batch with new mappings
    // The PENDING_BATCH_START tells us where this batch began
    var pendingBatchStart = props.getProperty('PENDING_BATCH_START');
    if (pendingBatchStart) {
      props.setProperty('SAFETY_BATCH_START', pendingBatchStart);
      Logger.log('Reset batch position to ' + pendingBatchStart + ' to reprocess with new mappings');
    }

    // Clear the pending unknown jobs
    clearPendingUnknownJobs();

    Logger.log('=== applyUnknownJobDecisions END ===');

    return {
      success: true,
      assigned: Object.keys(tempMappings).length,
      skipped: skippedJobs.length
    };

  } catch (e) {
    Logger.log('Error applying unknown job decisions: ' + e.toString());
    return { success: false, error: e.toString() };
  }
}

/**
 * Gets temporary job→foreman mappings set during unknown job handling
 * @returns {Object} Map of jobNumber → foremanName
 */
function getTempJobForemanMappings() {
  var props = PropertiesService.getScriptProperties();
  var saved = props.getProperty('TEMP_JOB_FOREMAN_MAPPINGS');
  if (saved) {
    try {
      return JSON.parse(saved);
    } catch (e) {
      return {};
    }
  }
  return {};
}

/**
 * Gets skipped unknown job numbers
 * @returns {Array} Array of skipped job numbers
 */
function getSkippedUnknownJobs() {
  var props = PropertiesService.getScriptProperties();
  var saved = props.getProperty('SKIPPED_UNKNOWN_JOBS');
  if (saved) {
    try {
      return JSON.parse(saved);
    } catch (e) {
      return [];
    }
  }
  return [];
}

/**
 * Clears temporary session data after processing completes
 */
function clearTempProcessingData() {
  var props = PropertiesService.getScriptProperties();
  props.deleteProperty('TEMP_JOB_FOREMAN_MAPPINGS');
  props.deleteProperty('SKIPPED_UNKNOWN_JOBS');
  props.deleteProperty('PENDING_UNKNOWN_JOBS');
}

/**
 * Clears ALL saved data for Process Safety Emails - for a complete fresh start
 * This includes:
 * - Custom job→foreman mappings (permanent)
 * - Temp job→foreman mappings (session)
 * - Skipped unknown jobs
 * - Pending unknown jobs
 * - Last processed date (so "new only" mode won't filter)
 */
function clearAllSafetyEmailData() {
  var props = PropertiesService.getScriptProperties();

  // Clear all safety email related properties
  props.deleteProperty('CUSTOM_JOB_FOREMAN_MAPPINGS');
  props.deleteProperty('TEMP_JOB_FOREMAN_MAPPINGS');
  props.deleteProperty('SKIPPED_UNKNOWN_JOBS');
  props.deleteProperty('PENDING_UNKNOWN_JOBS');
  props.deleteProperty('LAST_SAFETY_EMAIL_DATE');
  props.deleteProperty('LAST_SAFETY_EMAIL_TIMESTAMP');  // Fixed: was PROCESSED_TIME

  Logger.log('clearAllSafetyEmailData: Cleared all safety email processing data');

  return {
    success: true,
    message: 'All safety email data cleared'
  };
}

/**
 * Menu function to clear all safety email data with confirmation
 */
function menuClearAllSafetyEmailData() {
  var ui = SpreadsheetApp.getUi();
  var response = ui.alert(
    '🗑️ Clear All Safety Email Data',
    'This will clear ALL saved data for Process Safety Emails:\\n\\n' +
    '• Custom job→foreman mappings\\n' +
    '• Temporary session mappings\\n' +
    '• Skipped job numbers\\n' +
    '• Last processed date\\n\\n' +
    'This gives you a completely fresh start.\\n\\n' +
    'Are you sure?',
    ui.ButtonSet.YES_NO
  );

  if (response === ui.Button.YES) {
    clearAllSafetyEmailData();
    ui.alert('✅ All safety email data cleared!\\n\\nYou can now run Process Safety Emails with a fresh start.');
  }
}

/**
 * Reprocess all safety emails from scratch
 * This clears ALL saved data first, then processes emails for the specified number of days
 *
 * @param {number} daysBack - Number of days to search back (default: 90)
 * @returns {Object} Result from processSafetyEmails
 */
function reprocessAllSafetyEmails(daysBack) {
  daysBack = daysBack || 90;

  Logger.log('=== reprocessAllSafetyEmails START ===');
  Logger.log('Days back: ' + daysBack);

  // Step 1: Clear ALL saved data for a fresh start
  Logger.log('Step 1: Clearing all safety email data...');
  clearAllSafetyEmailData();

  // Step 2: Also clear batch position data
  var props = PropertiesService.getScriptProperties();
  props.deleteProperty('SAFETY_BATCH_START');
  props.deleteProperty('PENDING_BATCH_START');

  Logger.log('Step 2: Starting processing for last ' + daysBack + ' days...');

  // Step 3: Process emails with newOnlyMode = false (use day range)
  // Note: processSafetyEmails will be called by the dialog iteratively
  // This function just clears data and returns success
  return {
    success: true,
    dataCleared: true,
    message: 'All data cleared. Ready to process last ' + daysBack + ' days.',
    daysBack: daysBack
  };
}

/**
 * Credits an uncredited report to a specific crew
 * Updates Safety Reports sheet job number and optionally updates Safety Compliance
 *
 * @param {Object} assignmentData - Assignment details:
 *   - originalJobNumber: The uncredited job number
 *   - reportType: "JHA" or "Safety Meeting"
 *   - reportDate: The report date (MM/dd/yyyy)
 *   - targetCrew: The crew job number to credit (e.g., "052-25")
 *   - targetForeman: The foreman name to assign
 *   - targetDay: Day name to credit ("Mon", "Tue", etc.) - for JHA only
 *   - saveMapping: Whether to save this as a permanent custom mapping
 * @returns {Object} Result with success status and message
 */
function creditUncreditedReport(assignmentDataJson) {
  try {
    var data = typeof assignmentDataJson === 'string' ? JSON.parse(assignmentDataJson) : assignmentDataJson;
    Logger.log('creditUncreditedReport: Processing assignment: ' + JSON.stringify(data));

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var safetySheet = ss.getSheetByName('Safety Reports');
    var complianceSheet = ss.getSheetByName('Safety Compliance');

    if (!safetySheet) {
      return { success: false, error: 'Safety Reports sheet not found' };
    }

    // Find the report in Safety Reports sheet
    var reportData = safetySheet.getDataRange().getValues();
    var foundRows = [];

    for (var i = 1; i < reportData.length; i++) {
      var reportDate = reportData[i][0]; // Column A
      var reportType = String(reportData[i][1] || '').trim(); // Column B
      var jobNumber = String(reportData[i][2] || '').trim(); // Column C

      if (!reportDate || !jobNumber) continue;

      // Match job number
      var baseJob = jobNumber.split('.')[0];
      if (baseJob !== data.originalJobNumber) continue;

      // Match report type (if specified)
      if (data.reportType) {
        var matchesType = false;
        if (data.reportType === 'JHA' && (reportType === 'JHA' || reportType.indexOf('Job Hazard') !== -1)) {
          matchesType = true;
        } else if (data.reportType === 'Safety Meeting' && (reportType === 'Safety Meeting' || reportType.indexOf('Safety Meeting') !== -1)) {
          matchesType = true;
        } else if (reportType === data.reportType) {
          matchesType = true;
        }
        if (!matchesType) continue;
      }

      // Match report date (if specified)
      if (data.reportDate) {
        var rowDateStr = Utilities.formatDate(new Date(reportDate), Session.getScriptTimeZone(), 'MM/dd/yyyy');
        if (rowDateStr !== data.reportDate) continue;
      }

      foundRows.push({
        rowIndex: i + 1, // 1-based for sheet operations
        reportDate: reportDate,
        reportType: reportType
      });
    }

    if (foundRows.length === 0) {
      return { success: false, error: 'No matching report found for ' + data.originalJobNumber + ' ' + data.reportType + ' on ' + data.reportDate };
    }

    // Update all matching rows in Safety Reports
    for (var r = 0; r < foundRows.length; r++) {
      var row = foundRows[r];
      // Update job number (column C = 3)
      safetySheet.getRange(row.rowIndex, 3).setValue(data.targetCrew);
      // Update foreman (column D = 4)
      if (data.targetForeman) {
        safetySheet.getRange(row.rowIndex, 4).setValue(data.targetForeman);
      }
      // Add note about credit transfer
      var currentNotes = String(safetySheet.getRange(row.rowIndex, 11).getValue() || '');
      var transferNote = 'Credited from ' + data.originalJobNumber + ' on ' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'MM/dd/yyyy');
      var newNotes = currentNotes ? currentNotes + '; ' + transferNote : transferNote;
      safetySheet.getRange(row.rowIndex, 11).setValue(newNotes);

      Logger.log('creditUncreditedReport: Updated row ' + row.rowIndex + ' from ' + data.originalJobNumber + ' to ' + data.targetCrew);
    }

    // Update Safety Compliance sheet if specified
    if (complianceSheet && data.targetDay && data.reportDate) {
      var compData = complianceSheet.getDataRange().getValues();
      var compHeaders = compData[0];

      // Find column indices
      var colIdx = { weekStart: 0, jobNumber: 1 };
      var dayColumnMap = { 'Sun': -1, 'Mon': -1, 'Tue': -1, 'Wed': -1, 'Thu': -1, 'Fri': -1, 'Sat': -1 };
      var weeklyMeetingCol = -1;

      for (var h = 0; h < compHeaders.length; h++) {
        var hdr = String(compHeaders[h]).toLowerCase().trim();
        if (hdr === 'sun' || hdr === 'sunday') dayColumnMap['Sun'] = h;
        if (hdr === 'mon' || hdr === 'monday') dayColumnMap['Mon'] = h;
        if (hdr === 'tue' || hdr === 'tuesday') dayColumnMap['Tue'] = h;
        if (hdr === 'wed' || hdr === 'wednesday') dayColumnMap['Wed'] = h;
        if (hdr === 'thu' || hdr === 'thursday') dayColumnMap['Thu'] = h;
        if (hdr === 'fri' || hdr === 'friday') dayColumnMap['Fri'] = h;
        if (hdr === 'sat' || hdr === 'saturday') dayColumnMap['Sat'] = h;
        if (hdr === 'weekly meeting' || hdr === 'weekly') weeklyMeetingCol = h;
      }

      // Calculate week start for the report date
      var reportDateObj = new Date(data.reportDate);
      var dayOfWeekNum = reportDateObj.getDay();
      var weekStart = new Date(reportDateObj);
      weekStart.setDate(weekStart.getDate() - dayOfWeekNum); // Move to Sunday
      weekStart.setHours(0, 0, 0, 0);

      // Find matching compliance row
      for (var ci = 1; ci < compData.length; ci++) {
        var compRow = compData[ci];
        var compWeekStart = compRow[colIdx.weekStart];
        var compJobNumber = String(compRow[colIdx.jobNumber] || '').trim();

        if (!compWeekStart) continue;

        var compWeekDate = new Date(compWeekStart);
        compWeekDate.setHours(0, 0, 0, 0);

        // Match week and crew
        if (compWeekDate.getTime() === weekStart.getTime() && compJobNumber === data.targetCrew) {
          var colToUpdate = -1;

          if (data.reportType === 'JHA' || data.reportType.indexOf('Job Hazard') !== -1) {
            // For JHA, update the specific day column
            colToUpdate = dayColumnMap[data.targetDay];
          } else if (data.reportType === 'Safety Meeting' || data.reportType.indexOf('Safety Meeting') !== -1) {
            // For Weekly Meeting, update the weekly meeting column
            colToUpdate = weeklyMeetingCol;
          }

          if (colToUpdate >= 0) {
            // Check if this is a late submission
            // Late = received in a different week than the report date
            var checkMark = '✅';
            if (data.receivedDate) {
              var receivedDateObj = new Date(data.receivedDate);
              var receivedWeekStart = new Date(receivedDateObj);
              receivedWeekStart.setDate(receivedWeekStart.getDate() - receivedDateObj.getDay());
              receivedWeekStart.setHours(0, 0, 0, 0);

              if (receivedWeekStart.getTime() !== weekStart.getTime()) {
                // Received in a different week - mark as LATE
                checkMark = '✅L';
                Logger.log('creditUncreditedReport: Report is LATE - report week: ' + weekStart.toDateString() + ', received week: ' + receivedWeekStart.toDateString());
              }
            }

            complianceSheet.getRange(ci + 1, colToUpdate + 1).setValue(checkMark);
            Logger.log('creditUncreditedReport: Updated Safety Compliance row ' + (ci + 1) + ' column ' + (colToUpdate + 1) + ' to ' + checkMark);
          }
          break;
        }
      }
    }

    // Save as permanent custom mapping if requested
    if (data.saveMapping) {
      var mapping = {};
      mapping[data.originalJobNumber] = data.targetForeman;
      saveCustomJobForemanMappings(JSON.stringify(mapping));
      Logger.log('creditUncreditedReport: Saved permanent mapping ' + data.originalJobNumber + ' -> ' + data.targetForeman);
    }

    return {
      success: true,
      message: 'Credited ' + foundRows.length + ' report(s) from ' + data.originalJobNumber + ' to ' + data.targetCrew,
      rowsUpdated: foundRows.length
    };

  } catch (e) {
    Logger.log('creditUncreditedReport error: ' + e.toString());
    return { success: false, error: e.toString() };
  }
}

/**
 * Gets missing days for a specific crew in a specific week
 * Used by UI to show which days can be credited for uncredited JHA reports
 *
 * @param {string} crewJobNumber - The crew job number (e.g., "052-25")
 * @param {string} weekStartDate - Week start date (MM/dd/yyyy format, should be a Sunday)
 * @returns {Object} Result with missing days array
 */
function getMissingDaysForCrew(crewJobNumber, weekStartDate) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var complianceSheet = ss.getSheetByName('Safety Compliance');

    if (!complianceSheet) {
      return { success: false, error: 'Safety Compliance sheet not found', missingDays: [] };
    }

    var compData = complianceSheet.getDataRange().getValues();
    var compHeaders = compData[0];

    // Find column indices
    var colIdx = { weekStart: 0, jobNumber: 1 };
    var dayColumns = [];
    var weeklyMeetingCol = -1;

    for (var h = 0; h < compHeaders.length; h++) {
      var hdr = String(compHeaders[h]).toLowerCase().trim();
      if (hdr === 'sun' || hdr === 'sunday') dayColumns.push({ dayName: 'Sun', dayNum: 0, col: h });
      if (hdr === 'mon' || hdr === 'monday') dayColumns.push({ dayName: 'Mon', dayNum: 1, col: h });
      if (hdr === 'tue' || hdr === 'tuesday') dayColumns.push({ dayName: 'Tue', dayNum: 2, col: h });
      if (hdr === 'wed' || hdr === 'wednesday') dayColumns.push({ dayName: 'Wed', dayNum: 3, col: h });
      if (hdr === 'thu' || hdr === 'thursday') dayColumns.push({ dayName: 'Thu', dayNum: 4, col: h });
      if (hdr === 'fri' || hdr === 'friday') dayColumns.push({ dayName: 'Fri', dayNum: 5, col: h });
      if (hdr === 'sat' || hdr === 'saturday') dayColumns.push({ dayName: 'Sat', dayNum: 6, col: h });
      if (hdr === 'weekly meeting' || hdr === 'weekly') weeklyMeetingCol = h;
    }

    // Parse week start date
    var targetWeekStart = new Date(weekStartDate);
    targetWeekStart.setHours(0, 0, 0, 0);

    // Find matching row
    for (var i = 1; i < compData.length; i++) {
      var row = compData[i];
      var rowWeekStart = row[colIdx.weekStart];
      var rowJobNumber = String(row[colIdx.jobNumber] || '').trim();

      if (!rowWeekStart) continue;

      var rowWeekDate = new Date(rowWeekStart);
      rowWeekDate.setHours(0, 0, 0, 0);

      if (rowWeekDate.getTime() === targetWeekStart.getTime() && rowJobNumber === crewJobNumber) {
        // Found the row, check for missing days
        var missingDays = [];

        for (var d = 0; d < dayColumns.length; d++) {
          var dc = dayColumns[d];
          var cellValue = String(row[dc.col] || '').trim();

          // Skip N/A days (usually weekends)
          if (cellValue === 'N/A' || cellValue === '') continue;

          // Check if missing (❌ or ⏳)
          if (cellValue === '❌' || cellValue === '⏳' || cellValue.indexOf('❌') !== -1) {
            // Calculate the actual date for this day
            var dayDate = new Date(targetWeekStart);
            dayDate.setDate(dayDate.getDate() + dc.dayNum);

            missingDays.push({
              dayName: dc.dayName,
              dayNum: dc.dayNum,
              date: Utilities.formatDate(dayDate, Session.getScriptTimeZone(), 'MM/dd/yyyy'),
              currentStatus: cellValue
            });
          }
        }

        // Also check Weekly Meeting
        var weeklyMeetingMissing = false;
        if (weeklyMeetingCol >= 0) {
          var wmValue = String(row[weeklyMeetingCol] || '').trim();
          if (wmValue === '❌' || wmValue === '⏳' || wmValue.indexOf('❌') !== -1) {
            weeklyMeetingMissing = true;
          }
        }

        return {
          success: true,
          missingDays: missingDays,
          weeklyMeetingMissing: weeklyMeetingMissing,
          crewJobNumber: crewJobNumber,
          weekStart: weekStartDate
        };
      }
    }

    return { success: false, error: 'Crew ' + crewJobNumber + ' not found for week ' + weekStartDate, missingDays: [] };

  } catch (e) {
    Logger.log('getMissingDaysForCrew error: ' + e.toString());
    return { success: false, error: e.toString(), missingDays: [] };
  }
}

/**
 * Gets list of all employees from Employees sheet for dropdown in uncredited jobs assignment
 * This includes ALL employees (not just foremen) since past reports may need to be credited
 * to employees who may no longer be foremen.
 * @returns {Object} Result with employees array [{name, jobNumber, location}]
 */
function getAllEmployeesForAssignment() {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var empSheet = ss.getSheetByName('Employees');

    if (!empSheet) {
      return { success: false, error: 'Employees sheet not found', employees: [] };
    }

    var empData = empSheet.getDataRange().getValues();
    var headers = empData[0];

    // Find column indices
    var nameCol = headers.indexOf('Name');
    var jobCol = headers.indexOf('Job Number');
    var locationCol = headers.indexOf('Location');
    var lastDayCol = headers.indexOf('Last Day');

    if (nameCol === -1) nameCol = 0;
    if (jobCol === -1) jobCol = 3;
    if (locationCol === -1) locationCol = 2;

    var employees = [];
    var seenNames = {};

    for (var i = 1; i < empData.length; i++) {
      var name = String(empData[i][nameCol] || '').trim();
      var jobNumber = String(empData[i][jobCol] || '').trim();
      var location = String(empData[i][locationCol] || '').trim();
      var lastDay = empData[i][lastDayCol];

      // Skip empty names, header-like rows, and utility rows
      if (!name || name === 'Name' || name.toLowerCase() === 'previous employees') continue;
      if (name.indexOf('Testing') !== -1 || name.indexOf('Lost') !== -1 || name.indexOf('Failed') !== -1) continue;

      // Skip if we already have this employee
      if (seenNames[name.toLowerCase()]) continue;
      seenNames[name.toLowerCase()] = true;

      // Include all employees, even those with last day (they may have old reports to credit)
      employees.push({
        name: name,
        jobNumber: jobNumber ? jobNumber.split('.')[0] : '',  // Strip position suffix
        location: location,
        isFormer: lastDay ? true : false
      });
    }

    // Sort by name
    employees.sort(function(a, b) {
      return a.name.localeCompare(b.name);
    });

    Logger.log('getAllEmployeesForAssignment: Found ' + employees.length + ' employees');
    return { success: true, employees: employees };

  } catch (e) {
    Logger.log('getAllEmployeesForAssignment error: ' + e.toString());
    return { success: false, error: e.toString(), employees: [] };
  }
}

/**
 * Gets list of all tracked crews for the uncredited jobs assignment UI
 * @returns {Object} Result with crews array
 */
function getTrackedCrewsForAssignment() {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var complianceSheet = ss.getSheetByName('Safety Compliance');

    if (!complianceSheet) {
      return { success: false, error: 'Safety Compliance sheet not found', crews: [] };
    }

    var compData = complianceSheet.getDataRange().getValues();
    var crews = {};

    // Find column indices
    var jobNumberCol = 1; // Column B
    var foremanCol = 2;   // Column C

    for (var i = 1; i < compData.length; i++) {
      var jobNumber = String(compData[i][jobNumberCol] || '').trim();
      var foreman = String(compData[i][foremanCol] || '').trim();

      if (jobNumber && !crews[jobNumber]) {
        crews[jobNumber] = {
          jobNumber: jobNumber,
          foreman: foreman
        };
      }
    }

    // Convert to array and sort
    var crewList = [];
    for (var job in crews) {
      crewList.push(crews[job]);
    }
    crewList.sort(function(a, b) {
      return a.jobNumber.localeCompare(b.jobNumber);
    });

    return { success: true, crews: crewList };

  } catch (e) {
    Logger.log('getTrackedCrewsForAssignment error: ' + e.toString());
    return { success: false, error: e.toString(), crews: [] };
  }
}


