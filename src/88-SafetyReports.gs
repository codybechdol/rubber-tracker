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
 * Updated: March 3, 2026 - Fixed past weeks recalculation to include crews from logs
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

// Execution-level caches (reset per execution, cleared explicitly at entry points)
var _complianceConfigCache = null;
var _customMappingsCache = null;
var _employeesDataCache = null;       // Cached Employees sheet data (full array)
var _jobTrackingDataCache = null;     // Cached Job Tracking sheet data (full array)
var _resolveJobCache = {};            // Cached resolveJobToTrackedCrew results by job number
var _foremanByJobCache = {};          // Cached lookupForemanByJobNumber results by job number

/**
 * NEW: Raw data logging sheet names (Option B implementation - Feb 24, 2026)
 * These sheets provide an audit trail for ALL safety emails processed
 */
var JHA_LOG_SHEET_NAME = "JHA Log";
var WEEKLY_SAFETY_LOG_SHEET_NAME = "Weekly Safety Log";
var MONTHLY_CHECKLIST_LOG_SHEET_NAME = "Monthly Checklist Log";

// ============================================================================
// GMAIL AUTHORIZATION FUNCTIONS
// ============================================================================

/**
 * Tests Gmail access and forces re-authorization if needed
 * This function must be run manually to trigger the OAuth consent screen
 * Menu function: Glove Manager → Safety → 🔑 Authorize Gmail Access
 */
function authorizeGmailAccess() {
  var ui = SpreadsheetApp.getUi();

  try {
    // This line triggers Gmail authorization
    var threads = GmailApp.search('subject:"test" newer_than:1d', 0, 1);

    // If we get here, Gmail is authorized
    ui.alert('\u2705 Gmail Access Authorized',
      'Gmail access is working!\n\n' +
      'The script can now search and read emails.\n\n' +
      'You can now run "Process Safety Emails" to fetch new JHAs and Safety Meetings.',
      ui.ButtonSet.OK);

    Logger.log('authorizeGmailAccess: Gmail access confirmed');
    return true;

  } catch (e) {
    // Authorization failed or was denied
    ui.alert('\u274C Gmail Authorization Required',
      'Gmail access could not be verified.\n\n' +
      'Error: ' + e.message + '\n\n' +
      'Please try again. When prompted, click "Allow" to grant Gmail access.\n\n' +
      'If you don\'t see an authorization prompt:\n' +
      '1. Go to Extensions → Apps Script\n' +
      '2. Run "authorizeGmailAccess" function directly\n' +
      '3. Accept the permissions when prompted',
      ui.ButtonSet.OK);

    Logger.log('authorizeGmailAccess: Failed - ' + e.message);
    return false;
  }
}

/**
 * Quick test to check if Gmail access is currently working
 * Returns true/false without showing UI
 */
function testGmailAccess() {
  try {
    GmailApp.search('subject:"test" newer_than:1d', 0, 1);
    Logger.log('testGmailAccess: Gmail access working');
    return true;
  } catch (e) {
    Logger.log('testGmailAccess: Gmail access FAILED - ' + e.message);
    return false;
  }
}

/**
 * Shows current Gmail authorization status
 * Menu function: Glove Manager → Safety → 🔁 Gmail Status
 */
function showGmailStatus() {
  var ui = SpreadsheetApp.getUi();
  var isAuthorized = testGmailAccess();

  if (isAuthorized) {
    // Try to get more info
    try {
      var threads = GmailApp.search('subject:"Job Hazard Report" newer_than:14d', 0, 100);
      var jhaCount = threads.length;

      threads = GmailApp.search('subject:"Safety Meeting Report" newer_than:14d', 0, 100);
      var meetingCount = threads.length;

      threads = GmailApp.search('subject:"Weekly Safety Repairs" newer_than:14d', 0, 100);
      var checklistCount = threads.length;

      ui.alert('\u2705 Gmail Access Status',
        'Gmail is authorized and working!\n\n' +
        'Emails found in last 14 days:\n' +
        '\u2022 Job Hazard Reports: ' + jhaCount + '\n' +
        '\u2022 Safety Meeting Reports: ' + meetingCount + '\n' +
        '\u2022 Weekly Safety Repairs: ' + checklistCount + '\n\n' +
        'Total emails to process: ' + (jhaCount + meetingCount + checklistCount),
        ui.ButtonSet.OK);

    } catch (e) {
      ui.alert('\u26A0\uFE0F Gmail Partial Access',
        'Gmail is authorized but search failed.\n\n' +
        'Error: ' + e.message,
        ui.ButtonSet.OK);
    }
  } else {
    ui.alert('\u274C Gmail Not Authorized',
      'Gmail access is NOT working.\n\n' +
      'Run "🔑 Authorize Gmail Access" from the Safety menu to fix this.',
      ui.ButtonSet.OK);
  }
}

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

  SpreadsheetApp.getUi().alert('\u2705 Log Sheets Created',
    'Created 3 safety log sheets:\n\n' +
    '\u2022 JHA Log - tracks all Job Hazard Reports\n' +
    '\u2022 Weekly Safety Log - tracks Safety Meeting Reports\n' +
    '\u2022 Monthly Checklist Log - tracks Fleet Safety Checklists\n\n' +
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
 * Core formatter: sorts a log sheet newest-month-first with job numbers grouped,
 * and inserts styled blue separator rows between each month.
 *
 * Sort order: Year-Month descending → Job Number ascending → Date Received descending
 *
 * Separator rows are identified by an empty emailIdCol cell, so all existing duplicate-
 * detection and ID-loading logic that skips empty cells handles them automatically.
 *
 * @param {string} sheetName - Name of the log sheet
 * @param {number} emailIdCol  - 1-based column of the Email ID (used to identify real data rows)
 * @param {number} dateReceivedCol - 1-based column of Date Received (col A = 1)
 * @param {number} jobNumCol  - 1-based column of Job Number
 */
function sortAndFormatLogSheet(sheetName, emailIdCol, dateReceivedCol, jobNumCol) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet || sheet.getLastRow() < 2) return 0;

  var tz = Session.getScriptTimeZone();
  var lastCol = sheet.getLastColumn();
  var MONTH_NAMES = ['January','February','March','April','May','June',
                     'July','August','September','October','November','December'];

  // ── 1. Read all rows ──────────────────────────────────────────────────────
  var allVals = sheet.getRange(2, 1, sheet.getLastRow() - 1, lastCol).getValues();

  // ── 1b. Save existing rich text (hyperlinks) before we clear ─────────────
  // Maps emailId → RichTextValue so links survive the sort+rewrite cycle.
  var savedRichTexts = {};
  try {
    var rtData = sheet.getRange(2, emailIdCol, sheet.getLastRow() - 1, 1).getRichTextValues();
    for (var rti = 0; rti < allVals.length; rti++) {
      var rtEid = String(allVals[rti][emailIdCol - 1] || '').trim();
      if (rtEid && rtData[rti] && rtData[rti][0]) {
        savedRichTexts[rtEid] = rtData[rti][0];
      }
    }
  } catch (rtSaveErr) {
    Logger.log('sortAndFormatLogSheet: Could not save rich text — ' + rtSaveErr);
  }

  // ── 2. Keep only real data rows (non-empty email ID) ─────────────────────
  var dataRows = allVals.filter(function(row) {
    return String(row[emailIdCol - 1] || '').trim() !== '';
  });
  if (dataRows.length === 0) return 0;

  // ── 3. Sort ───────────────────────────────────────────────────────────────
  dataRows.sort(function(a, b) {
    var dA = a[dateReceivedCol - 1];
    var dB = b[dateReceivedCol - 1];
    if (!(dA instanceof Date)) { try { dA = new Date(dA); } catch(e) { dA = new Date(0); } }
    if (!(dB instanceof Date)) { try { dB = new Date(dB); } catch(e) { dB = new Date(0); } }
    var ymA = isNaN(dA) ? 0 : (dA.getFullYear() * 100 + dA.getMonth());
    var ymB = isNaN(dB) ? 0 : (dB.getFullYear() * 100 + dB.getMonth());
    if (ymB !== ymA) return ymB - ymA;                          // newest month first
    var jA = String(a[jobNumCol - 1] || '');
    var jB = String(b[jobNumCol - 1] || '');
    if (jA !== jB) return jA < jB ? -1 : 1;                    // job number ascending
    return (isNaN(dB) ? 0 : dB.getTime()) - (isNaN(dA) ? 0 : dA.getTime()); // date desc
  });

  // ── 4. Build rows with month separator rows inserted ─────────────────────
  var rowsToWrite = [];
  var separatorSheetRows = [];   // 1-based sheet row numbers of separator rows
  var currentYM = null;

  dataRows.forEach(function(row) {
    var d = row[dateReceivedCol - 1];
    if (!(d instanceof Date)) { try { d = new Date(d); } catch(e) { d = null; } }
    var ym = (d && !isNaN(d)) ? (d.getFullYear() * 100 + d.getMonth()) : null;

    // Normalize Date Received to a proper Date object so it doesn't persist as
    // "June 2026" text (from older logging format) through sort cycles.
    if (d && !isNaN(d) && !(row[dateReceivedCol - 1] instanceof Date)) {
      row[dateReceivedCol - 1] = d;
    }

    if (ym !== currentYM) {
      // Month separator row — all cells empty except col A which has the label
      var sepRow = [];
      for (var c = 0; c < lastCol; c++) sepRow.push('');
      sepRow[0] = (d && !isNaN(d))
        ? MONTH_NAMES[d.getMonth()] + ' ' + d.getFullYear()
        : '— Unknown —';
      // +2 = skip header row (row 1) and convert 0-based index to 1-based
      separatorSheetRows.push(rowsToWrite.length + 2);
      rowsToWrite.push(sepRow);
      currentYM = ym;
    }
    rowsToWrite.push(row);
  });

  // ── 5. Clear data region and rewrite ─────────────────────────────────────
  var clearRows = sheet.getLastRow() - 1;
  sheet.getRange(2, 1, clearRows, lastCol).clearContent().clearFormat();

  if (rowsToWrite.length > 0) {
    sheet.getRange(2, 1, rowsToWrite.length, lastCol).setValues(rowsToWrite);

    // Apply date format to the Date Received column in one call, then override
    // separator rows with plain-text '@' format.  Avoids building a huge per-cell
    // matrix that causes Apps Script INTERNAL errors on large logs (1000+ rows).
    sheet.getRange(2, dateReceivedCol, rowsToWrite.length, 1).setNumberFormat('MM/dd/yyyy H:mm');
    separatorSheetRows.forEach(function(sheetRow) {
      sheet.getRange(sheetRow, dateReceivedCol, 1, 1).setNumberFormat('@');
    });
  }

  // ── 6. Apply colors and group dividers ───────────────────────────────────
  // Alternating colors per job-number group, medium top border between groups,
  // blue header for month separator rows.  All applied via one setBackgrounds()
  // call to minimise API quota usage.
  if (rowsToWrite.length > 0) {
    var separatorSet = {};
    separatorSheetRows.forEach(function(r) { separatorSet[r] = true; });

    var COLOR_A      = '#ffffff';   // white
    var COLOR_B      = '#dce9fb';   // soft blue
    var SEP_BG       = '#3c78d8';   // month header blue
    var BORDER_COLOR = '#9e9e9e';   // medium-gray divider line

    var bgMatrix       = [];
    var currentJobKey  = null;
    var colorToggle    = 0;          // 0 → COLOR_A, 1 → COLOR_B
    var groupDividers  = [];         // 1-based sheet rows that get a top border

    for (var ri = 0; ri < rowsToWrite.length; ri++) {
      var sheetRow = ri + 2;  // +2: row 1 is the header
      var color;

      if (separatorSet[sheetRow]) {
        // Month separator row — reset group tracking for the new month
        color         = SEP_BG;
        currentJobKey = null;
        colorToggle   = 0;
      } else {
        var jobKey = String(rowsToWrite[ri][jobNumCol - 1] || '');
        if (jobKey !== currentJobKey) {
          if (currentJobKey !== null) {
            // New group within the same month — flip color and mark for border
            colorToggle = 1 - colorToggle;
            groupDividers.push(sheetRow);
          }
          currentJobKey = jobKey;
        }
        color = (colorToggle === 0) ? COLOR_A : COLOR_B;
      }

      // Expand single color across all columns for this row
      var rowColors = [];
      for (var ci = 0; ci < lastCol; ci++) rowColors.push(color);
      bgMatrix.push(rowColors);
    }

    // One bulk setBackgrounds call for the entire data region
    sheet.getRange(2, 1, rowsToWrite.length, lastCol).setBackgrounds(bgMatrix);

    // Reapply hyperlinks to email ID column (lost during clearFormat + setValues)
    // Reuses saved rich text where available; builds a fresh link for any row that
    // never had one (e.g. historical rows logged before the Gmail-link feature).
    try {
      var rtMatrix = [];
      for (var rii = 0; rii < rowsToWrite.length; rii++) {
        if (separatorSet[rii + 2]) {
          rtMatrix.push([SpreadsheetApp.newRichTextValue().setText('').build()]);
        } else {
          var eid = String(rowsToWrite[rii][emailIdCol - 1] || '').trim();
          if (eid) {
            var rtVal = savedRichTexts[eid];
            if (!rtVal) {
              // Build fresh link for rows that never had one
              var baseId = eid.split('_')[0];
              var gmailUrl = 'https://mail.google.com/mail/u/0/#all/' + baseId;
              rtVal = SpreadsheetApp.newRichTextValue().setText(eid).setLinkUrl(gmailUrl).build();
            }
            rtMatrix.push([rtVal]);
          } else {
            rtMatrix.push([SpreadsheetApp.newRichTextValue().setText('').build()]);
          }
        }
      }
      sheet.getRange(2, emailIdCol, rowsToWrite.length, 1).setRichTextValues(rtMatrix);
    } catch (rtErr) {
      Logger.log('sortAndFormatLogSheet: Could not reapply rich text — ' + rtErr);
    }

    // Separator row text styling (font/weight set after background to avoid reset)
    separatorSheetRows.forEach(function(sheetRow) {
      var sepRange = sheet.getRange(sheetRow, 1, 1, lastCol);
      sepRange.setFontColor('#ffffff');
      sepRange.setFontWeight('bold');
      sepRange.setFontSize(11);
      sepRange.setHorizontalAlignment('left');
    });

    // Top border at each foreman/job-group boundary within a month
    groupDividers.forEach(function(sheetRow) {
      sheet.getRange(sheetRow, 1, 1, lastCol)
        .setBorder(true, null, null, null, null, null,
                   BORDER_COLOR, SpreadsheetApp.BorderStyle.SOLID_MEDIUM);
    });
  }

  // ── 7. Re-freeze header row if it was lost ───────────────────────────────
  if (sheet.getFrozenRows() < 1) sheet.setFrozenRows(1);

  Logger.log('sortAndFormatLogSheet: ' + sheetName + ' — ' + dataRows.length +
             ' data rows, ' + separatorSheetRows.length + ' month separators');
  return separatorSheetRows.length;
}

/**
 * Formats both the JHA Log and Weekly Safety Log.
 * Called automatically at the end of processSafetyEmails and available as a menu item.
/**
 * Formats JHA Log, Weekly Safety Log, and Monthly Checklist Log.
 * Sorts data rows (newest month first, job number ascending within month)
 * and inserts green/yellow month header banner rows.
 * @param {boolean} silent - If true, no UI alert shown
 */
function sortAndFormatSafetyLogs(silent) {
  var t0 = new Date().getTime();
  // JHA Log: emailIdCol=6, dateReceivedCol=1, jobNumCol=3
  var jhaMonths     = sortAndFormatLogSheet(JHA_LOG_SHEET_NAME,               6, 1, 3);
  // Weekly Safety Log: emailIdCol=6, dateReceivedCol=1, jobNumCol=3
  var weeklyMonths  = sortAndFormatLogSheet(WEEKLY_SAFETY_LOG_SHEET_NAME,     6, 1, 3);
  // Monthly Checklist Log: emailIdCol=7, dateReceivedCol=1, jobNumCol=3
  var monthlyMonths = sortAndFormatLogSheet(MONTHLY_CHECKLIST_LOG_SHEET_NAME, 7, 1, 3);
  var elapsed = Math.round((new Date().getTime() - t0) / 1000);
  Logger.log('sortAndFormatSafetyLogs: done in ' + elapsed + 's — JHA: ' + jhaMonths + ', Weekly: ' + weeklyMonths + ', Monthly: ' + monthlyMonths);
  if (!silent) {
    SpreadsheetApp.getUi().alert(
      'Log Sheets Formatted',
      'JHA Log, Weekly Safety Log, and Monthly Checklist Log sorted and grouped.\n' +
      'JHA Log: ' + jhaMonths + ' month sections\n' +
      'Weekly Safety Log: ' + weeklyMonths + ' month sections\n' +
      'Monthly Checklist Log: ' + monthlyMonths + ' month sections\n' +
      'Completed in ' + elapsed + 's.',
      SpreadsheetApp.getUi().ButtonSet.OK
    );
  }
}

/**
 * Menu wrapper — kept for backwards compatibility with old menu item name.
 */
function sortLogSheetsNewestFirst() {
  sortAndFormatSafetyLogs(false);
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
 * @param {Object} existingEmailIds - Optional pre-loaded set for fast duplicate check
 * @returns {Object} - { success: boolean, row: number }
 */
function logJHAEmail(params, existingEmailIds, rowsCollector) {
  var sheet = getJHALogSheet();
  var tz = Session.getScriptTimeZone();

  // Fast duplicate check using pre-loaded set if available
  if (existingEmailIds && existingEmailIds[params.emailId]) {
    return { success: false, duplicate: true };
  }

  // Fallback to sheet read if no pre-loaded set (slower but safe)
  if (!existingEmailIds && emailExistsInLog(sheet, params.emailId, 5)) {
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

  if (rowsCollector) {
    rowsCollector.push({
      sheetName: JHA_LOG_SHEET_NAME,
      row: row,
      emailId: params.emailId
    });
    return { success: true };
  }

  sheet.appendRow(row);
  var lastRow = sheet.getLastRow();

  // Apply clickable Gmail hyperlink to Email ID cell (col F = 6)
  try {
    var jhaEmailId = params.emailId || '';
    if (jhaEmailId) {
      var jhaBaseId = jhaEmailId.split('_')[0];
      var jhaUrl = 'https://mail.google.com/mail/u/0/#all/' + jhaBaseId;
      sheet.getRange(lastRow, 6).setRichTextValue(
        SpreadsheetApp.newRichTextValue().setText(jhaEmailId).setLinkUrl(jhaUrl).build()
      );
    }
  } catch (linkErr) {
    Logger.log('logJHAEmail: Could not apply Gmail link - ' + linkErr);
  }

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
 * @param {Object} existingEmailIds - Optional pre-loaded set for fast duplicate check
 * @returns {Object} - { success: boolean, row: number }
 */
function logWeeklySafetyEmail(params, existingEmailIds, rowsCollector) {
  var sheet = getWeeklySafetyLogSheet();
  var tz = Session.getScriptTimeZone();

  // Fast duplicate check using pre-loaded set if available
  if (existingEmailIds && existingEmailIds[params.emailId]) {
    return { success: false, duplicate: true };
  }

  // Fallback to sheet read if no pre-loaded set (slower but safe)
  if (!existingEmailIds && emailExistsInLog(sheet, params.emailId, 5)) {
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

  if (rowsCollector) {
    rowsCollector.push({
      sheetName: WEEKLY_SAFETY_LOG_SHEET_NAME,
      row: row,
      emailId: params.emailId
    });
    return { success: true };
  }

  sheet.appendRow(row);
  var lastRow = sheet.getLastRow();

  // Apply clickable Gmail hyperlink to Email ID cell (col F = 6)
  try {
    var wslEmailId = params.emailId || '';
    if (wslEmailId) {
      var wslBaseId = wslEmailId.split('_')[0];
      var wslUrl = 'https://mail.google.com/mail/u/0/#all/' + wslBaseId;
      sheet.getRange(lastRow, 6).setRichTextValue(
        SpreadsheetApp.newRichTextValue().setText(wslEmailId).setLinkUrl(wslUrl).build()
      );
    }
  } catch (linkErr) {
    Logger.log('logWeeklySafetyEmail: Could not apply Gmail link - ' + linkErr);
  }

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
 * @param {Object} existingEmailIds - Optional pre-loaded set for fast duplicate check
 * @returns {Object} - { success: boolean, row: number }
 */
function logMonthlyChecklistEmail(params, existingEmailIds, rowsCollector) {
  var sheet = getMonthlyChecklistLogSheet();
  var tz = Session.getScriptTimeZone();

  // Fast duplicate check using pre-loaded set if available
  if (existingEmailIds && existingEmailIds[params.emailId]) {
    return { success: false, duplicate: true };
  }

  // Fallback to sheet read if no pre-loaded set (slower but safe)
  if (!existingEmailIds && emailExistsInLog(sheet, params.emailId, 6)) {
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

  if (rowsCollector) {
    rowsCollector.push({
      sheetName: MONTHLY_CHECKLIST_LOG_SHEET_NAME,
      row: row,
      emailId: params.emailId
    });
    return { success: true };
  }

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
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return 0;
  var lastCol = sheet.getLastColumn();
  var range = sheet.getRange(2, 1, lastRow - 1, lastCol);
  var data = range.getValues();
  
  var rowsToKeep = [];
  var deletedCount = 0;
  
  for (var i = 0; i < data.length; i++) {
    var cellValue = data[i][dateCol];
    var keep = true;
    if (cellValue) {
      var rowDate = new Date(cellValue);
      if (!isNaN(rowDate.getTime()) && rowDate < cutoffDate) {
        keep = false;
        deletedCount++;
      }
    }
    if (keep) {
      rowsToKeep.push(data[i]);
    }
  }

  if (deletedCount > 0) {
    // Clear content of the old data range (preserving cell formats/borders)
    range.clearContent();
    if (rowsToKeep.length > 0) {
      sheet.getRange(2, 1, rowsToKeep.length, lastCol).setValues(rowsToKeep);
    }
  }

  return deletedCount;
}


/**
 * Parses a date input (string or Date) in local timezone to avoid UTC shifting.
 * @param {string|Date} dateInput - The date value to parse
 * @param {boolean} isEnd - If true, sets time to end of day (23:59:59.999); else start of day (00:00:00.000)
 * @returns {Date|null} - Local Date object
 */
function parseLocalDate(dateInput, isEnd) {
  if (!dateInput) return null;
  if (dateInput instanceof Date) {
    var d = new Date(dateInput.getTime());
    if (isEnd) d.setHours(23, 59, 59, 999);
    else d.setHours(0, 0, 0, 0);
    return d;
  }
  
  var dateStr = String(dateInput).trim();
  var parts = dateStr.split(/[\-\/]/);
  if (parts.length !== 3) {
    var d = new Date(dateStr);
    if (!isNaN(d.getTime())) {
      if (isEnd) d.setHours(23, 59, 59, 999);
      else d.setHours(0, 0, 0, 0);
      return d;
    }
    return null;
  }
  
  var year, month, day;
  if (parts[0].length === 4) {
    // YYYY-MM-DD
    year = parseInt(parts[0], 10);
    month = parseInt(parts[1], 10) - 1;
    day = parseInt(parts[2], 10);
  } else if (parts[2].length === 4) {
    // MM/DD/YYYY
    month = parseInt(parts[0], 10) - 1;
    day = parseInt(parts[1], 10);
    year = parseInt(parts[2], 10);
  } else {
    var d = new Date(dateStr);
    if (!isNaN(d.getTime())) {
      if (isEnd) d.setHours(23, 59, 59, 999);
      else d.setHours(0, 0, 0, 0);
      return d;
    }
    return null;
  }
  
  if (isEnd) {
    return new Date(year, month, day, 23, 59, 59, 999);
  } else {
    return new Date(year, month, day, 0, 0, 0, 0);
  }
}

/**
 * Helper to delete rows in a date range from a sheet (in-memory)
 * @param {Sheet} sheet - The sheet to clean
 * @param {string|Date} startDate - Start of date range (inclusive)
 * @param {string|Date} endDate - End of date range (inclusive)
 * @param {number} dateCol - Column index (0-based) containing the date
 * @returns {number} - Number of rows deleted
 */
function deleteRowsInRangeFromSheet(sheet, startDate, endDate, dateCol) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return 0;
  var lastCol = sheet.getLastColumn();
  var range = sheet.getRange(2, 1, lastRow - 1, lastCol);
  var data = range.getValues();
  
  var rowsToKeep = [];
  var deletedCount = 0;
  
  var start = parseLocalDate(startDate, false) || new Date(0);
  var end = parseLocalDate(endDate, true) || new Date();
  
  for (var i = 0; i < data.length; i++) {
    var cellValue = data[i][dateCol];
    var keep = true;
    if (cellValue) {
      var rowDate = new Date(cellValue);
      if (!isNaN(rowDate.getTime())) {
        if (rowDate >= start && rowDate <= end) {
          keep = false;
          deletedCount++;
        }
      }
    }
    if (keep) {
      rowsToKeep.push(data[i]);
    }
  }

  if (deletedCount > 0) {
    range.clearContent();
    if (rowsToKeep.length > 0) {
      sheet.getRange(2, 1, rowsToKeep.length, lastCol).setValues(rowsToKeep);
    }
  }

  return deletedCount;
}

/**
 * Clears JHA, Weekly Safety, Monthly Checklist logs, and Safety Compliance rows in a date range
 * @param {string|Date} startDate - Start of date range
 * @param {string|Date} endDate - End of date range
 */
function clearSafetyLogsInRange(startDate, endDate) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var jhaSheet = getJHALogSheet();
  var jhaDeleted = 0;
  if (jhaSheet) {
    jhaDeleted = deleteRowsInRangeFromSheet(jhaSheet, startDate, endDate, 0);
  }
  
  var weeklySheet = getWeeklySafetyLogSheet();
  var weeklyDeleted = 0;
  if (weeklySheet) {
    weeklyDeleted = deleteRowsInRangeFromSheet(weeklySheet, startDate, endDate, 0);
  }
  
  var monthlySheet = getMonthlyChecklistLogSheet();
  var monthlyDeleted = 0;
  if (monthlySheet) {
    monthlyDeleted = deleteRowsInRangeFromSheet(monthlySheet, startDate, endDate, 0);
  }
  
  var complianceSheet = ss.getSheetByName('Safety Compliance');
  var complianceDeleted = 0;
  if (complianceSheet) {
    complianceDeleted = deleteRowsInRangeFromSheet(complianceSheet, startDate, endDate, 0);
  }
  
  Logger.log('clearSafetyLogsInRange: Cleared rows in range [' + startDate + ', ' + (endDate || 'today') + '] - JHA Log: ' + jhaDeleted + ', Weekly: ' + weeklyDeleted + ', Monthly: ' + monthlyDeleted + ', Compliance: ' + complianceDeleted);
}

/**
 * Batch writes collected logs to JHA Log, Weekly Safety Log, and Monthly Checklist Log
 * @param {Array<Object>} rowsCollector - Array of log entries to batch write
 */
function writeCollectedSafetyLogs(rowsCollector) {
  if (!rowsCollector || rowsCollector.length === 0) return;
  Logger.log("writeCollectedSafetyLogs: Batch writing " + rowsCollector.length + " queued logs...");
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  
  // Group rows by sheetName
  var rowsBySheet = {};
  rowsCollector.forEach(function(item) {
    if (!rowsBySheet[item.sheetName]) {
      rowsBySheet[item.sheetName] = [];
    }
    rowsBySheet[item.sheetName].push(item);
  });
  
  for (var sName in rowsBySheet) {
    var sheet = ss.getSheetByName(sName);
    if (!sheet) continue;
    var items = rowsBySheet[sName];
    var lastRow = sheet.getLastRow();
    var valuesToWrite = items.map(function(item) { return item.row; });
    var lastCol = sheet.getLastColumn();
    
    // Batch write values
    sheet.getRange(lastRow + 1, 1, valuesToWrite.length, lastCol).setValues(valuesToWrite);
    
    // Batch write rich text hyperlinks (only JHA and Weekly logs have them)
    var richTextValues = [];
    var hasHyperlinks = false;
    for (var rIdx = 0; rIdx < items.length; rIdx++) {
      var item = items[rIdx];
      var rtCell = [null];
      if ((sName === JHA_LOG_SHEET_NAME || sName === WEEKLY_SAFETY_LOG_SHEET_NAME) && item.emailId) {
        var baseId = item.emailId.split('_')[0];
        var url = 'https://mail.google.com/mail/u/0/#all/' + baseId;
        rtCell[0] = SpreadsheetApp.newRichTextValue().setText(item.emailId).setLinkUrl(url).build();
        hasHyperlinks = true;
      }
      richTextValues.push(rtCell);
    }
    
    if (hasHyperlinks) {
      var linkColIndex = 6; // Column F
      sheet.getRange(lastRow + 1, linkColIndex, richTextValues.length, 1).setRichTextValues(richTextValues);
    }
    
    Logger.log("writeCollectedSafetyLogs: Batch wrote " + items.length + " rows to " + sName);
  }
}

/**
 * Removes duplicate entries from JHA Log and Weekly Safety Log.
 * Duplicates are identified by matching: Job Number + Date Created/Week Of + Email Subject.
 * Keeps the FIRST occurrence (lowest row) and removes later duplicates.
 *
 * @returns {Object} - { jhaDuplicates: number, weeklyDuplicates: number }
 */
function cleanupDuplicateLogEntries() {
  var result = { jhaDuplicates: 0, weeklyDuplicates: 0 };

  Logger.log('=== cleanupDuplicateLogEntries START ===');

  // Cleanup JHA Log duplicates
  var jhaSheet = getJHALogSheet();
  if (jhaSheet && jhaSheet.getLastRow() > 1) {
    var jhaData = jhaSheet.getDataRange().getValues();
    var seen = {};
    var rowsToDelete = [];

    Logger.log('JHA Log: ' + (jhaData.length - 1) + ' data rows');

    for (var i = 1; i < jhaData.length; i++) {
      // Build key from: Date Created (col B=1) + Job Number (col C=2) + Email Subject (col E=4)
      var dateCreated = jhaData[i][1] ? String(jhaData[i][1]) : '';
      var jobNum = String(jhaData[i][2] || '').trim();
      var subject = String(jhaData[i][4] || '').trim();
      var emailId = String(jhaData[i][5] || '').trim();

      // Primary key: email ID + date created (most reliable, allows multi-day JHAs)
      // Secondary key: date+job+subject (for entries without email ID)
      var key = emailId ? ('eid_' + emailId + '_' + dateCreated) : ('djn_' + dateCreated + '_' + jobNum + '_' + subject);

      if (seen[key]) {
        rowsToDelete.push(i + 1); // 1-based row
      } else {
        seen[key] = true;
      }
    }

    // Delete from bottom to top
    for (var r = rowsToDelete.length - 1; r >= 0; r--) {
      jhaSheet.deleteRow(rowsToDelete[r]);
    }
    result.jhaDuplicates = rowsToDelete.length;
    Logger.log('JHA Log: ' + Object.keys(seen).length + ' unique keys, ' + rowsToDelete.length + ' duplicates removed');
  } else {
    Logger.log('JHA Log: sheet not found or empty');
  }

  // Cleanup Weekly Safety Log duplicates
  var weeklySheet = getWeeklySafetyLogSheet();
  if (weeklySheet && weeklySheet.getLastRow() > 1) {
    var weeklyData = weeklySheet.getDataRange().getValues();
    var weeklySeen = {};
    var weeklyRowsToDelete = [];

    Logger.log('Weekly Safety Log: ' + (weeklyData.length - 1) + ' data rows');

    for (var w = 1; w < weeklyData.length; w++) {
      var weekOf = weeklyData[w][1] ? String(weeklyData[w][1]) : '';
      var wJobNum = String(weeklyData[w][2] || '').trim();
      var wEmailId = String(weeklyData[w][5] || '').trim();

      var wKey = wEmailId ? ('eid_' + wEmailId) : ('wjn_' + weekOf + '_' + wJobNum);

      if (weeklySeen[wKey]) {
        weeklyRowsToDelete.push(w + 1);
      } else {
        weeklySeen[wKey] = true;
      }
    }

    for (var wr = weeklyRowsToDelete.length - 1; wr >= 0; wr--) {
      weeklySheet.deleteRow(weeklyRowsToDelete[wr]);
    }
    result.weeklyDuplicates = weeklyRowsToDelete.length;
    Logger.log('Weekly Safety Log: ' + Object.keys(weeklySeen).length + ' unique keys, ' + weeklyRowsToDelete.length + ' duplicates removed');
  } else {
    Logger.log('Weekly Safety Log: sheet not found or empty');
  }

  Logger.log('=== cleanupDuplicateLogEntries END ===');
  return result;
}

/**
 * Menu function to clean up duplicate log entries with UI feedback
 */
function menuCleanupDuplicateLogEntries() {
  var result = cleanupDuplicateLogEntries();
  var total = result.jhaDuplicates + result.weeklyDuplicates;

  if (total === 0) {
    SpreadsheetApp.getUi().alert('\u2705 No Duplicates Found',
      'JHA Log and Weekly Safety Log have no duplicate entries.\n\nCheck the Execution Log for details on rows examined.', SpreadsheetApp.getUi().ButtonSet.OK);
  } else {
    SpreadsheetApp.getUi().alert('🧹 Duplicates Removed',
      'Removed ' + total + ' duplicate log entries:\n\n' +
      '\u2022 JHA Log: ' + result.jhaDuplicates + ' duplicates removed\n' +
      '\u2022 Weekly Safety Log: ' + result.weeklyDuplicates + ' duplicates removed\n\n' +
      'Run "Master Recalculate" to refresh compliance data.',
      SpreadsheetApp.getUi().ButtonSet.OK);
  }
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
 * Run this from Glove Manager → Safety → 🔁 Diagnose Log Sheets
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
    report.push('\\n\uD83D\uDCCA Safety Compliance: ' + compCount + ' records');
  } else {
    report.push('\\n\uD83D\uDCCA Safety Compliance: NOT FOUND');
  }

  // Recommendation
  report.push('\\n--- RECOMMENDATION ---');
  if (jhaSheet && jhaSheet.getLastRow() <= 1 && weeklySheet && weeklySheet.getLastRow() <= 1) {
    report.push('\u26A0\uFE0F Log sheets are EMPTY. Run "Process Safety Emails" to populate them.');
  } else if (jhaSheet && jhaSheet.getLastRow() > 1) {
    report.push('\u2705 Log sheets have data. Run "🔄 Recalculate Compliance" to update Safety Compliance from logs.');
  }

  ui.alert('🔁 Safety Log Sheets Diagnostic', report.join('\\n'), ui.ButtonSet.OK);
}

// ============================================================================
// COMPLIANCE CALCULATION FROM LOGS (Option B - Feb 24, 2026)
// ============================================================================

/**
 * DETAILED diagnostic that traces the exact compliance calculation
 * Shows: what dates are being compared, what matches, what doesn't
 * Menu function: Glove Manager → Safety → \uD83D\uDCCA Trace Compliance Calculation
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
    report.push('\u274C JHA Log sheet not found!');
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
          report.push(rowInfo + ' | \u274C OUTSIDE WEEK');
        }
        continue;
      }

      if (status !== 'Credited') {
        skippedNotCredited++;
        report.push(rowInfo + ' | \u26A0\uFE0F Not Credited (status=' + status + ')');
        continue;
      }

      if (!creditedTo) {
        skippedNotCredited++;
        report.push(rowInfo + ' | \u26A0\uFE0F No CreditedTo value');
        continue;
      }

      // Check if creditedTo is a tracked crew
      if (!crewSet[creditedTo]) {
        skippedCrewNotTracked++;
        report.push(rowInfo + ' | \u26A0\uFE0F Crew "' + creditedTo + '" NOT in tracked crews list!');
        continue;
      }

      // Success - this entry should be credited
      matchedCount++;
      report.push(rowInfo + ' | \u2705 IN WEEK, CREDITED');

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
    report.join('\n').replace(/\u2705/g, '<span style="color:green">\u2705</span>')
                     .replace(/\u274C/g, '<span style="color:red">\u274C</span>')
                     .replace(/\u26A0\uFE0F/g, '<span style="color:orange">\u26A0\uFE0F</span>') +
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
/**
 * Builds a tooltip/note for a Safety Compliance cell
 * @param {string} cellType - 'jha', 'weekly', or 'monthly'
 * @param {Date} dayDate - The actual date for this cell (for JHA day cells)
 * @param {string} statusIcon - The status icon (\u2705, \u274C, \u23F3, N/A, \u2705L)
 * @param {Object} details - Object with dateReceived, dateCreated (optional)
 * @returns {string} Formatted tooltip text
 */
function buildComplianceCellNote(cellType, dayDate, statusIcon, details) {
  var tz = Session.getScriptTimeZone();
  var lines = [];
  var dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  // Header based on cell type
  if (cellType === 'jha' && dayDate) {
    var dayName = dayNames[dayDate.getDay()];
    var dateStr = Utilities.formatDate(dayDate, tz, 'MMM dd, yyyy');
    lines.push('📅 ' + dayName + ', ' + dateStr);
  } else if (cellType === 'weekly') {
    lines.push('📋 Weekly Safety Meeting');
    if (details && details.weekOf) {
      var weekOfStr = Utilities.formatDate(new Date(details.weekOf), tz, 'MMM dd, yyyy');
      lines.push('Week of: ' + weekOfStr);
    }
  } else if (cellType === 'monthly') {
    lines.push('📋 Monthly Fleet Checklist');
    if (details && details.reportDate) {
      var reportDateStr = Utilities.formatDate(new Date(details.reportDate), tz, 'MMM dd, yyyy');
      lines.push('Report Date: ' + reportDateStr);
    }
  }

  // Add date details if available
  if (details) {
    if (details.dateCreated && cellType === 'jha') {
      var createdStr = Utilities.formatDate(new Date(details.dateCreated), tz, 'MM/dd/yyyy');
      lines.push('Created: ' + createdStr);
    }
    if (details.dateReceived) {
      var receivedStr = Utilities.formatDate(new Date(details.dateReceived), tz, 'MM/dd/yyyy h:mm a');
      lines.push('Received: ' + receivedStr);
    }
  }

  // Add explanation for ONLY the current status icon
  lines.push('');
  var iconExplanation = getIconExplanation(statusIcon, cellType);
  if (iconExplanation) {
    lines.push(iconExplanation);
  }

  return lines.join('\n');
}

/**
 * Returns the explanation for a specific status icon
 * @param {string} icon - The status icon
 * @param {string} cellType - 'jha', 'weekly', or 'monthly'
 * @returns {string} Explanation for the icon
 */
function getIconExplanation(icon, cellType) {
  var iconStr = String(icon || '').trim();

  if (iconStr === '\u2705') {
    return '\u2705 Received on time';
  } else if (iconStr === '\u2705L') {
    return '\u2705L Received late (after deadline)';
  } else if (iconStr === '\u274C') {
    return '\u274C Missing - not received';
  } else if (iconStr === '\u274CW' || iconStr.toUpperCase() === 'DNW') {
    return '\u274CW Did Not Work - crew did not work this day';
  } else if (iconStr === '\u23F3') {
    if (cellType === 'monthly') {
      return '\u23F3 Pending (month not over)';
    }
    return '\u23F3 Pending (week not over)';
  } else if (iconStr === 'N/A') {
    return '(Skipped - crew scheduled off this day)';
  } else if (iconStr === '\u26A0\uFE0F') {
    return '\u26A0\uFE0F Warning - Week 3, due soon';
  } else if (iconStr === '\u274C\u23F3') {
    return '\u274C\u23F3 Urgent - Week 4, deadline approaching';
  } else if (iconStr === '') {
    return '(Skipped - crew scheduled off this day)';
  }

  return iconStr + ' (unknown status)';
}

function calculateComplianceFromLogs(weekStartDate, options) {
  var ignoreResolved = (options && options.ignoreResolved) || false;
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var tz = Session.getScriptTimeZone();
  var weekBounds = getWeekBoundaries(weekStartDate);
  var weekStartStr = Utilities.formatDate(weekBounds.weekStart, tz, 'MM/dd/yyyy');
  var weekEndStr = Utilities.formatDate(weekBounds.weekEnd, tz, 'MM/dd/yyyy');
  var today = new Date();
  var isPastDeadline = today > weekBounds.weekEnd;

  // Determine if this is the CURRENT week (for applying config changes)
  var currentWeekBounds = getWeekBoundaries(today);
  var isCurrentWeek = weekStartStr === Utilities.formatDate(currentWeekBounds.weekStart, tz, 'MM/dd/yyyy');

  Logger.log("calculateComplianceFromLogs: Calculating for week " + weekStartStr + " to " + weekEndStr);
  Logger.log("calculateComplianceFromLogs: isCurrentWeek = " + isCurrentWeek);

  // Load holiday map once for the week (date -> name)
  var holidayMap = getHolidayMap();
  var holidayDatesThisWeek = [];
  for (var hd = 0; hd < 7; hd++) {
    var dayDate = new Date(weekBounds.weekStart.getTime());
    dayDate.setDate(dayDate.getDate() + hd);
    var dayKey = Utilities.formatDate(dayDate, tz, 'yyyy-MM-dd');
    if (holidayMap[dayKey]) {
      holidayDatesThisWeek.push(hd); // day-of-week index (0=Sun)
      Logger.log("calculateComplianceFromLogs: holiday on day " + hd + " (" + dayKey + " = " + holidayMap[dayKey] + ")");
    }
  }
  var weekHasHoliday = holidayDatesThisWeek.length > 0;

  // === LOAD RESOLVED CREWS FROM SAFETY COMPLIANCE SHEET ===
  // Crews with "Resolved" status should NOT be recalculated or have tasks created
  // UNLESS ignoreResolved=true (used by masterRecalculateCompliance for full refresh)
  var resolvedCrews = {};
  if (!ignoreResolved) {
    resolvedCrews = loadResolvedCrewsForWeek(ss, weekBounds.weekStart, tz);
    Logger.log("calculateComplianceFromLogs: Found " + Object.keys(resolvedCrews).length + " resolved crews for this week");
  } else {
    Logger.log("calculateComplianceFromLogs: ignoreResolved=true, recalculating ALL crews including Resolved");
  }

  // Load compliance config: Active crews for current week, All crews for past weeks
  var config = loadComplianceConfig({ includeAll: !isCurrentWeek });
  var configCrews = Object.keys(config).sort();

  var crews = [];
  var historicalForemanMap = {};

  if (isCurrentWeek) {
    // CURRENT WEEK: Strictly use ACTIVE crews only from Job Tracking
    var activeCrewsFromTrackingData = getActiveCrewsFromJobTracking();
    var activeCrewsFromTracking = activeCrewsFromTrackingData.map(function(c) { return c.jobNumber; });

    var crewSet = {};
    for (var cc = 0; cc < configCrews.length; cc++) {
      crewSet[configCrews[cc]] = true;
    }
    for (var ac = 0; ac < activeCrewsFromTracking.length; ac++) {
      if (!crewSet[activeCrewsFromTracking[ac]]) {
        crewSet[activeCrewsFromTracking[ac]] = true;
      }
    }
    crews = Object.keys(crewSet).sort();
    Logger.log("calculateComplianceFromLogs: Current week - using " + crews.length + " active crews");
  } else {
    // PAST WEEKS: Load all crews (active + completed) and filter by dates active during that historical week
    var existingCrewsForWeek = getExistingCrewsForWeek(ss, weekBounds.weekStart, tz);
    var crewsWithLogData = getCrewsWithLogDataForWeek(ss, weekBounds, configCrews);

    var crewSet = {};
    for (var ec = 0; ec < existingCrewsForWeek.length; ec++) {
      crewSet[existingCrewsForWeek[ec]] = true;
    }
    for (var lc = 0; lc < crewsWithLogData.length; lc++) {
      crewSet[crewsWithLogData[lc]] = true;
    }

    crews = Object.keys(crewSet).sort();

    if (crews.length > 0) {
      Logger.log("calculateComplianceFromLogs: Past week - using " + crews.length + " crews (existing: " + existingCrewsForWeek.length + ", from logs: " + crewsWithLogData.length + ")");
    } else {
      crews = configCrews;
      Logger.log("calculateComplianceFromLogs: Past week (no existing data) - using " + crews.length + " crews from Config");
    }
  }

  // === FILTER CREWS BY JOB TRACKING START AND END DATES ===
  // Remove crews that hadn't started yet OR completed in a prior week
  var filterResult = filterCrewsByJobTrackingStartDate(crews, weekBounds.weekEnd, weekBounds.weekStart);
  if (filterResult.excludedCrews.length > 0) {
    Logger.log("calculateComplianceFromLogs: Excluded " + filterResult.excludedCrews.length +
               " crews due to Job Tracking start/end dates: " + filterResult.excludedCrews.join(', '));
    crews = filterResult.filteredCrews;
  }

  if (crews.length === 0) {
    Logger.log("calculateComplianceFromLogs: No crews found");
    return null;
  }

  Logger.log("calculateComplianceFromLogs: Total crews to track: " + crews.length);

  // === LOAD EXISTING COMPLIANCE DATA FOR PAST WEEKS ===
  // For past weeks, we need to PRESERVE the existing N/A values from the sheet
  // because work schedules can change week to week (e.g., Mon-Fri to Mon-Thu)
  var existingComplianceData = {};
  if (!isCurrentWeek) {
    existingComplianceData = loadExistingComplianceForWeek(ss, weekBounds.weekStart, tz);
    Logger.log("calculateComplianceFromLogs: Loaded existing data for " + Object.keys(existingComplianceData).length + " crews (past week - preserving N/A values)");
  }

  // Initialize compliance state for each crew
  var crewCompliance = {};
  for (var c = 0; c < crews.length; c++) {
    var crewJob = crews[c];
    var existingCrewData = existingComplianceData[crewJob] || null;

    // For CURRENT week: Use Config skipDays settings
    // For PAST weeks: Preserve existing N/A values from the sheet (work schedules can change)
    var skipDays, skipWeeklyMeeting, skipMonthlyChecklist;
    var foreman = '';

    if (isCurrentWeek) {
      // CURRENT WEEK: Use current Config settings
      var crewConfig = config[crewJob] || {
        skipDays: [true, false, false, false, false, false, true], // Skip Sun/Sat by default
        skipWeeklyMeeting: false,
        skipMonthlyChecklist: false
      };
      skipDays = crewConfig.skipDays;
      skipWeeklyMeeting = crewConfig.skipWeeklyMeeting;
      skipMonthlyChecklist = crewConfig.skipMonthlyChecklist;
      foreman = crewConfig.foreman || '';
    } else if (existingCrewData) {
      // PAST WEEK with existing data: PRESERVE the N/A/blank values from the sheet
      // Convert existing day values to skipDays array
      var dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      skipDays = [];
      for (var di = 0; di < dayNames.length; di++) {
        var existingVal = existingCrewData.days[dayNames[di]] || '';
        // If it was N/A or blank in the sheet, keep it as a skip day
        skipDays.push(existingVal === 'N/A' || existingVal === '');
      }
      // Treat blank same as N/A for weekly/monthly
      skipWeeklyMeeting = (existingCrewData.weeklyMeeting === 'N/A' || existingCrewData.weeklyMeeting === '');
      skipMonthlyChecklist = (existingCrewData.monthlyChecklist === 'N/A' || existingCrewData.monthlyChecklist === '');
      foreman = existingCrewData.foreman || '';
      Logger.log("calculateComplianceFromLogs: Preserved skipDays for " + crewJob + ": " + JSON.stringify(skipDays) + " (from existing sheet data)");
    } else {
      // PAST WEEK without existing data (new crew for this week): Use current Config or defaults
      var crewConfig = config[crewJob] || {
        skipDays: [true, false, false, false, false, false, true], // Skip Sun/Sat by default
        skipWeeklyMeeting: false,
        skipMonthlyChecklist: false
      };
      skipDays = crewConfig.skipDays;
      skipWeeklyMeeting = crewConfig.skipWeeklyMeeting;
      skipMonthlyChecklist = crewConfig.skipMonthlyChecklist;
      foreman = crewConfig.foreman || '';
    }

    crewCompliance[crewJob] = {
      foreman: foreman,
      jhaByDay: [false, false, false, false, false, false, false], // Sun-Sat
      jhaLateByDay: [false, false, false, false, false, false, false],
      jhaDetails: [{}, {}, {}, {}, {}, {}, {}], // Details for each day (dateReceived, dateCreated)
      weeklyMeeting: false,
      weeklyMeetingLate: false,
      weeklyMeetingDetails: null, // {dateReceived, weekOf}
      monthlyChecklist: false,
      monthlyChecklistDetails: null, // {dateReceived, reportDate}
      skipDays: skipDays,
      skipWeeklyMeeting: skipWeeklyMeeting,
      skipMonthlyChecklist: skipMonthlyChecklist,
      status: 'Complete',
      isCurrentWeek: isCurrentWeek,
      isHistorical: configCrews.indexOf(crewJob) === -1 // Flag if this is a historical-only crew (not in current Config)
    };

    // Get foreman name - first try existing data, then current Employees sheet, then historical
    if (!crewCompliance[crewJob].foreman) {
      var foremanResult = lookupForemanByJobNumber(crewJob);
      if (foremanResult && foremanResult.name) {
        crewCompliance[crewJob].foreman = foremanResult.name;
      } else if (historicalForemanMap[crewJob]) {
        // Use foreman name from JHA Log for historical crews
        crewCompliance[crewJob].foreman = historicalForemanMap[crewJob];
      }
    }
  }

  // Track unknown jobs
  var unknownJobs = {};

  // === LOAD JOB TRACKING STATUS MAP ===
  // Used to filter out On Hold/Completed/Pending Start crews from unknownJobs
  var jobTrackingStatuses = getJobTrackingStatusMap();

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
      var dateReceived = jhaRow[0]; // Column A - Date Received
      var dateCreated = jhaRow[1]; // Column B - Date Created (JHA work date)
      var originalJobNumber = String(jhaRow[2] || '').trim(); // Column C - Original job from email
      var status = String(jhaRow[7] || '').trim(); // Column H - Status
      var creditedTo = String(jhaRow[8] || '').trim(); // Column I - Credited To (used for typo corrections)
      var notes = String(jhaRow[9] || '').trim(); // Column J - Notes

      if (!dateCreated) continue;
      jhaRowsProcessed++;

      var jhaDate = new Date(dateCreated);

      // Check if this JHA is within our week
      if (jhaDate < weekBounds.weekStart || jhaDate > weekBounds.weekEnd) {
        jhaRowsSkippedOutsideWeek++;
        continue;
      }

      // Compute dayOfWeek BEFORE the status check so it's available for Unknown Job tracking too
      var dayOfWeek = jhaDate.getDay(); // 0=Sun, 6=Sat

      // Check if this is a credited entry (or if CreditedTo has a valid tracked crew)
      if (status !== 'Credited' && !(creditedTo && crewCompliance[creditedTo])) {
        // Track unknown JHA jobs for user assignment
        // But ONLY if it's truly unknown - not if it's now a tracked crew
        if (status === 'Unknown Job') {
          var jhaBaseJob = originalJobNumber.split('.')[0].trim();
          // Skip empty job numbers
          if (!jhaBaseJob) {
            jhaRowsSkippedNotCredited++;
            continue;
          }
          // RE-CREDIT if this job is now a tracked crew (crew was added to tracking after initial processing)
          if (crewCompliance[jhaBaseJob]) {
            Logger.log("calculateComplianceFromLogs: Re-crediting Unknown Job JHA for " + jhaBaseJob + " - now a tracked crew");
            // Fall through to normal crediting logic below by overriding creditedTo
            creditedTo = jhaBaseJob;
            // Don't increment skipped count or continue - let it fall through
          } else {
            // Skip if this job exists in Job Tracking with On Hold/Completed/Pending Start status
            var jhaJobStatus = jobTrackingStatuses[jhaBaseJob];
            if (jhaJobStatus && jhaJobStatus !== 'active') {
              Logger.log("calculateComplianceFromLogs: Skipping Unknown Job log entry for " + jhaBaseJob + " - Job Tracking status: " + jhaJobStatus);
              jhaRowsSkippedNotCredited++;
              continue;
            }
            // Check if now has custom mapping
            var jhaCustomMappings = getCustomJobForemanMappings();
            if (!jhaCustomMappings[jhaBaseJob]) {
              if (!unknownJobs[originalJobNumber]) {
                unknownJobs[originalJobNumber] = { reportTypes: [], dates: [], reports: [], reason: 'Unknown Job' };
              }
              if (unknownJobs[originalJobNumber].reportTypes.indexOf('JHA') === -1) {
                unknownJobs[originalJobNumber].reportTypes.push('JHA');
              }
              var jhaDateStr = Utilities.formatDate(jhaDate, Session.getScriptTimeZone(), 'MM/dd/yyyy');
              if (unknownJobs[originalJobNumber].dates.indexOf(jhaDateStr) === -1) {
                unknownJobs[originalJobNumber].dates.push(jhaDateStr);
              }
              // Add individual report with email ID for PDF preview
              var jhaEmailId = String(jhaRow[5] || '').trim(); // Column F - Email ID
              var jhaEmailSubject = String(jhaRow[4] || '').trim(); // Column E - Email Subject
              var jhaReceivedDateStr = dateReceived ? Utilities.formatDate(new Date(dateReceived), Session.getScriptTimeZone(), 'MM/dd/yyyy') : '';
              // Check for duplicate report
              var jhaIsDup = unknownJobs[originalJobNumber].reports.some(function(r) {
                return r.reportType === 'JHA' && r.reportDate === jhaDateStr;
              });
              if (!jhaIsDup) {
                unknownJobs[originalJobNumber].reports.push({
                  reportType: 'JHA',
                  reportDate: jhaDateStr,
                  receivedDate: jhaReceivedDateStr,
                  dayOfWeek: dayOfWeek,
                  dayName: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][dayOfWeek],
                  emailSubject: jhaEmailSubject,
                  emailId: jhaEmailId
                });
              }
            }
            jhaRowsSkippedNotCredited++;
            continue;
          }
        } else {
          // Status is something else (not Credited and not Unknown Job) - skip
          jhaRowsSkippedNotCredited++;
          continue;
        }
      }

      // Determine which crew to credit
      // Priority 1: ORIGINAL job number if it's a tracked crew (historical foremen like Matt Miller on 015-26)
      // Priority 2: CreditedTo job number if original is NOT tracked (for typo corrections like 054-26 -> 052-25)
      var crewToCredit = null;
      var jhaForeman = String(jhaRow[3] || '').trim();

      if (status === 'Credited' && jhaForeman && jhaForeman !== 'UNKNOWN') {
        var crewKey = originalJobNumber || creditedTo;
        if (crewKey) {
          historicalForemanMap[crewKey] = jhaForeman;
        }
      }

      if (originalJobNumber && crewCompliance[originalJobNumber]) {
        // Original job is tracked - credit it directly
        crewToCredit = originalJobNumber;
      } else if (creditedTo && crewCompliance[creditedTo]) {
        // Original job not tracked, but creditedTo is - use that (for typo/reassignment cases)
        crewToCredit = creditedTo;
      }

      // Priority 3: If creditedTo crew exists but was excluded (e.g., start date filter),
      // look up the foreman and find any other tracked crew they're associated with
      if (!crewToCredit && creditedTo) {
        var foremanLookup = lookupForemanByJobNumber(creditedTo);
        if (foremanLookup && foremanLookup.name) {
          var foremanName = foremanLookup.name.toLowerCase().trim();
          for (var crewKey in crewCompliance) {
            if (crewCompliance[crewKey].foreman && crewCompliance[crewKey].foreman.toLowerCase().trim() === foremanName) {
              crewToCredit = crewKey;
              Logger.log("calculateComplianceFromLogs: Foreman fallback - " + creditedTo + " not tracked, but foreman " + foremanLookup.name + " found on " + crewKey);
              break;
            }
          }
        }
      }

      if (!crewToCredit) {
        jhaRowsSkippedCrewNotFound++;
        Logger.log("calculateComplianceFromLogs: CREW NOT FOUND - Original: " + originalJobNumber + ", CreditedTo: " + creditedTo);
        continue;
      }



      crewCompliance[crewToCredit].jhaByDay[dayOfWeek] = true;
      crewCompliance[crewToCredit].jhaDetails[dayOfWeek] = {
        dateReceived: dateReceived,
        dateCreated: dateCreated
      };
      // Compute lateness directly from dateReceived vs dateCreated (not from notes column,
      // which may be missing "LATE SUBMISSION" for older log entries logged before this fix).
      if (dateReceived && dateCreated) {
        if (isReportLate(new Date(dateCreated), new Date(dateReceived))) {
          crewCompliance[crewToCredit].jhaLateByDay[dayOfWeek] = true;
        }
      } else if (notes && notes.indexOf('LATE') !== -1) {
        // Fallback: notes-based check for entries missing dateReceived
        crewCompliance[crewToCredit].jhaLateByDay[dayOfWeek] = true;
      }
      jhaCreditsApplied++;

      Logger.log("calculateComplianceFromLogs: ✓ Credited JHA to " + crewToCredit + " for day " + dayOfWeek + " (row " + (j+1) + ", original=" + originalJobNumber + ", creditedTo=" + creditedTo + ")");
    }
  }

  Logger.log("calculateComplianceFromLogs: JHA Summary - " +
    "Processed: " + jhaRowsProcessed +
    ", Credits applied: " + jhaCreditsApplied +
    ", Skipped (outside week): " + jhaRowsSkippedOutsideWeek +
    ", Skipped (not credited): " + jhaRowsSkippedNotCredited +
    ", Skipped (crew not found): " + jhaRowsSkippedCrewNotFound);

  // Load custom mappings for re-checking unknown jobs
  var customMappings = getCustomJobForemanMappings();
  Logger.log("calculateComplianceFromLogs: Custom mappings loaded: " + JSON.stringify(customMappings));

  // === READ WEEKLY SAFETY LOG ===
  var weeklySheet = getWeeklySafetyLogSheet();
  if (weeklySheet && weeklySheet.getLastRow() > 1) {
    var weeklyData = weeklySheet.getDataRange().getValues();

    for (var w = 1; w < weeklyData.length; w++) {
      var weeklyRow = weeklyData[w];
      var weeklyDateReceived = weeklyRow[0]; // Column A - Date Received
      var weekOf = weeklyRow[1]; // Column B - Week Of
      var originalJobNumber = String(weeklyRow[2] || '').trim(); // Column C - Original job from email
      var status = String(weeklyRow[6] || '').trim(); // Column G - Status
      var creditedTo = String(weeklyRow[7] || '').trim(); // Column H - Credited To
      var notes = String(weeklyRow[8] || '').trim(); // Column I - Notes

      if (!weekOf) continue;

      var meetingWeekDate = new Date(weekOf);

      // Check if this meeting's "Week of" date falls within our compliance week (Sun-Sat)
      // The email subject shows "Week of 02-09-2026" (Monday), which should be credited
      // to the compliance week that CONTAINS that date (02/08/2026 - 02/14/2026)
      // NOT the week that starts after it (02/15/2026)
      // FIX: Changed from daysDiff <= 6 to proper boundary check
      if (meetingWeekDate < weekBounds.weekStart || meetingWeekDate > weekBounds.weekEnd) {
        continue;
      }

      if (status === 'Credited' || (creditedTo && crewCompliance[creditedTo])) {
        var weeklyForeman = String(weeklyRow[3] || '').trim();
        if (weeklyForeman && weeklyForeman !== 'UNKNOWN') {
          var crewKey = originalJobNumber || creditedTo;
          if (crewKey) {
            historicalForemanMap[crewKey] = weeklyForeman;
          }
        }

        // Determine which crew to credit (same priority logic as JHA)
        // Priority 1: ORIGINAL job number if it's a tracked crew
        // Priority 2: CreditedTo job number if original is NOT tracked
        var crewToCredit = null;

        if (originalJobNumber && crewCompliance[originalJobNumber]) {
          crewToCredit = originalJobNumber;
        } else if (creditedTo && crewCompliance[creditedTo]) {
          crewToCredit = creditedTo;
        }

        // Priority 3: Foreman fallback - look up the foreman of creditedTo crew
        if (!crewToCredit && creditedTo) {
          var wmForemanLookup = lookupForemanByJobNumber(creditedTo);
          if (wmForemanLookup && wmForemanLookup.name) {
            var wmForemanName = wmForemanLookup.name.toLowerCase().trim();
            for (var wmKey in crewCompliance) {
              if (crewCompliance[wmKey].foreman && crewCompliance[wmKey].foreman.toLowerCase().trim() === wmForemanName) {
                crewToCredit = wmKey;
                Logger.log("calculateComplianceFromLogs: Weekly Meeting foreman fallback - " + creditedTo + " not tracked, but foreman " + wmForemanLookup.name + " found on " + wmKey);
                break;
              }
            }
          }
        }

        if (crewToCredit) {
          crewCompliance[crewToCredit].weeklyMeeting = true;
          crewCompliance[crewToCredit].weeklyMeetingDetails = {
            dateReceived: weeklyDateReceived,
            weekOf: weekOf
          };
          // Compute lateness directly from dateReceived vs meetingWeekDate (not from notes column).
          if (weeklyDateReceived && meetingWeekDate) {
            if (isReportLate(meetingWeekDate, new Date(weeklyDateReceived))) {
              crewCompliance[crewToCredit].weeklyMeetingLate = true;
            }
          } else if (notes && notes.indexOf('LATE') !== -1) {
            crewCompliance[crewToCredit].weeklyMeetingLate = true;
          }
          Logger.log("calculateComplianceFromLogs: Credited Weekly Meeting to " + crewToCredit + " (original=" + originalJobNumber + ", creditedTo=" + creditedTo + ")");
        } else {
          Logger.log("calculateComplianceFromLogs: Weekly Meeting CREW NOT FOUND - Original: " + originalJobNumber + ", CreditedTo: " + creditedTo);
        }
      } else if (status === 'Unknown Job') {
        // Re-check if this job now has a custom mapping OR is a tracked crew
        var baseJob = originalJobNumber.split('.')[0].trim();
        // Skip empty job numbers
        if (!baseJob) {
          continue;
        }
        // RE-CREDIT if this job is now a tracked crew (crew was added to tracking after initial processing)
        if (crewCompliance[baseJob]) {
          Logger.log("calculateComplianceFromLogs: Re-crediting Unknown Job Weekly Meeting for " + baseJob + " - now a tracked crew");
          crewCompliance[baseJob].weeklyMeeting = true;
          crewCompliance[baseJob].weeklyMeetingDetails = {
            dateReceived: weeklyDateReceived,
            weekOf: weekOf
          };
          // Compute lateness directly from dateReceived vs meetingWeekDate (not from notes column).
          if (weeklyDateReceived && meetingWeekDate) {
            if (isReportLate(meetingWeekDate, new Date(weeklyDateReceived))) {
              crewCompliance[baseJob].weeklyMeetingLate = true;
            }
          } else if (notes && notes.indexOf('LATE') !== -1) {
            crewCompliance[baseJob].weeklyMeetingLate = true;
          }
          continue;
        }
        // Skip if this job exists in Job Tracking with On Hold/Completed/Pending Start status
        var wmJobStatus = jobTrackingStatuses[baseJob];
        if (wmJobStatus && wmJobStatus !== 'active') {
          Logger.log("calculateComplianceFromLogs: Skipping Unknown Job Weekly Meeting for " + baseJob + " - Job Tracking status: " + wmJobStatus);
          continue;
        }
        if (customMappings[baseJob]) {
          // User has mapped this job - don't treat as unknown anymore
          Logger.log("calculateComplianceFromLogs: Job " + baseJob + " was 'Unknown' but now has custom mapping to " + customMappings[baseJob] + " - skipping from unknowns");
          continue;
        }

        if (!unknownJobs[originalJobNumber]) {
          unknownJobs[originalJobNumber] = { reportTypes: [], dates: [], reports: [], reason: 'Unknown Job' };
        }
        if (unknownJobs[originalJobNumber].reportTypes.indexOf('Safety Meeting') === -1) {
          unknownJobs[originalJobNumber].reportTypes.push('Safety Meeting');
        }
        // Add the meeting date to the dates array
        var meetingDateStr = weekOf ? Utilities.formatDate(new Date(weekOf), Session.getScriptTimeZone(), 'MM/dd/yyyy') : '';
        if (meetingDateStr && unknownJobs[originalJobNumber].dates.indexOf(meetingDateStr) === -1) {
          unknownJobs[originalJobNumber].dates.push(meetingDateStr);
        }
        // Add individual report with email ID for PDF preview
        var weeklyEmailId = String(weeklyRow[5] || '').trim(); // Column F - Email ID
        var weeklyEmailSubject = String(weeklyRow[4] || '').trim(); // Column E - Email Subject
        var receivedDateStr = weeklyDateReceived ? Utilities.formatDate(new Date(weeklyDateReceived), Session.getScriptTimeZone(), 'MM/dd/yyyy') : '';
        var meetingDayOfWeek = meetingWeekDate.getDay();
        // Check for duplicate report
        var weeklyIsDup = unknownJobs[originalJobNumber].reports.some(function(r) {
          return r.reportType === 'Safety Meeting' && r.reportDate === meetingDateStr;
        });
        if (!weeklyIsDup && meetingDateStr) {
          unknownJobs[originalJobNumber].reports.push({
            reportType: 'Safety Meeting',
            reportDate: meetingDateStr,
            receivedDate: receivedDateStr,
            dayOfWeek: meetingDayOfWeek,
            dayName: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][meetingDayOfWeek],
            emailSubject: weeklyEmailSubject,
            emailId: weeklyEmailId
          });
        }
      }
    }
  }

  // === READ MONTHLY CHECKLIST LOG ===
  var monthlySheet = getMonthlyChecklistLogSheet();
  // Use Monday of the week (weekStart + 1 day) as the month reference, NOT Sunday weekStart.
  // Reason: weeks start on Sunday, but the first actual work day is Monday. When a week spans
  // a month boundary (e.g., week of 05/31 where Sun=May but Mon-Fri=June), using Sunday's month
  // would incorrectly credit May checklists to a June compliance week.
  var mondayOfWeek = new Date(weekBounds.weekStart.getTime() + 24 * 60 * 60 * 1000);
  var monthStart = new Date(mondayOfWeek.getFullYear(), mondayOfWeek.getMonth(), 1);
  var monthEnd = new Date(mondayOfWeek.getFullYear(), mondayOfWeek.getMonth() + 1, 0, 23, 59, 59);

  if (monthlySheet && monthlySheet.getLastRow() > 1) {
    var monthlyData = monthlySheet.getDataRange().getValues();

    for (var m = 1; m < monthlyData.length; m++) {
      var monthlyRow = monthlyData[m];
      var monthlyDateReceived = monthlyRow[0]; // Column A - Date Received
      var reportDate = monthlyRow[1]; // Column B - Report Date
      var status = String(monthlyRow[7] || '').trim(); // Column H - Status
      var creditedTo = String(monthlyRow[8] || '').trim(); // Column I - Credited To

      if (!reportDate) continue;

      var checklistDate = new Date(reportDate);

      // Check if this checklist is within our month (any week in the month counts)
      if (checklistDate < monthStart || checklistDate > monthEnd) {
        continue;
      }

      if ((status === 'Credited' || status === 'Unknown Job' || status === 'Skipped') && creditedTo && crewCompliance[creditedTo]) {
        var monthlyForeman = String(monthlyRow[3] || '').trim();
        if (monthlyForeman && monthlyForeman !== 'UNKNOWN') {
          historicalForemanMap[creditedTo] = monthlyForeman;
        }

        // Keep track of the newest checklist received in the month
        var existingDetails = crewCompliance[creditedTo].monthlyChecklistDetails;
        var receivedTime = monthlyDateReceived ? new Date(monthlyDateReceived).getTime() : 0;

        if (!existingDetails || !existingDetails.dateReceived ||
            receivedTime > new Date(existingDetails.dateReceived).getTime()) {
          // This is the newest checklist - store it
          crewCompliance[creditedTo].monthlyChecklist = true;
          crewCompliance[creditedTo].monthlyChecklistDetails = {
            dateReceived: monthlyDateReceived,
            reportDate: reportDate
          };
          Logger.log("calculateComplianceFromLogs: Credited Monthly Checklist to " + creditedTo +
            " (received: " + monthlyDateReceived + ")");
        }
      }
    }
  }

  // === CALCULATE STATUS FOR EACH CREW ===
  var compliantCount = 0;
  var missingCount = 0;
  var dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  for (var crewJob in crewCompliance) {
    var crew = crewCompliance[crewJob];

    // Check if this crew was already resolved (user deleted task or recorded resolutions)
    // If so, preserve the Resolved status and skip recalculation
    if (resolvedCrews[crewJob]) {
      crew.status = 'Resolved';
      crew.days = resolvedCrews[crewJob].days || {};
      crew.weeklyMeetingStatus = resolvedCrews[crewJob].weeklyMeetingStatus || 'N/A';
      crew.monthlyChecklistStatus = resolvedCrews[crewJob].monthlyChecklistStatus || 'N/A';
      crew.missingItems = [];
      crew.lateCount = 0;
      compliantCount++;
      Logger.log("calculateComplianceFromLogs: Skipping crew " + crewJob + " - already Resolved");
      continue;
    }

    var missingItems = [];
    var lateCount = 0;

    // Build day status and store dayDates for tooltips
    crew.days = {};
    crew.dayDates = {}; // Store the actual date for each day
    for (var d = 0; d < 7; d++) {
      // Calculate the actual date for this day of the week
      var dayDate = new Date(weekBounds.weekStart.getTime());
      dayDate.setDate(dayDate.getDate() + d);
      crew.dayDates[dayNames[d]] = dayDate;

      if (crew.skipDays[d]) {
        crew.days[dayNames[d]] = 'N/A';
      } else if (holidayDatesThisWeek.indexOf(d) !== -1) {
        // Holiday – excuse this day for all crews
        crew.days[dayNames[d]] = 'N/A';
      } else if (crew.jhaByDay[d]) {
        if (crew.jhaLateByDay[d]) {
          crew.days[dayNames[d]] = '\u2705L';
          lateCount++;
        } else {
          crew.days[dayNames[d]] = '\u2705';
        }
      } else {
        if (isPastDeadline) {
          crew.days[dayNames[d]] = '\u274C';
          missingItems.push('JHA (' + dayNames[d] + ')');
        } else {
          crew.days[dayNames[d]] = '\u23F3';
        }
      }
    }

    // Weekly meeting status
    if (crew.skipWeeklyMeeting) {
      crew.weeklyMeetingStatus = 'N/A';
    // NOTE: Holiday excuse for weekly meeting removed (May 2026).
    // Holidays only excuse the specific JHA day, NOT the weekly meeting report.
    // (was: } else if (weekHasHoliday && !crew.weeklyMeeting) { weeklyMeetingStatus='N/A'; }
    } else if (crew.weeklyMeeting) {
      crew.weeklyMeetingStatus = crew.weeklyMeetingLate ? '\u2705L' : '\u2705';
      if (crew.weeklyMeetingLate) lateCount++;
    } else {
      if (isPastDeadline) {
        crew.weeklyMeetingStatus = '\u274C';
        missingItems.push('Weekly Meeting');
      } else {
        crew.weeklyMeetingStatus = '\u23F3';
      }
    }

    // Monthly checklist status (progressive deadline)
    // Pass the received date from details so it shows \u2705 for all weeks after receipt
    var monthlyChecklistDate = crew.monthlyChecklistDetails ? crew.monthlyChecklistDetails.dateReceived : null;
    var monthlyStatus = getMonthlyChecklistStatus(
      weekBounds.weekStart,
      crew.monthlyChecklist,
      crew.skipMonthlyChecklist,
      monthlyChecklistDate
    );
    crew.monthlyChecklistStatus = monthlyStatus.status;

    // NOTE: Holiday excuse for monthly checklist removed (June 2026).
    // Holidays only excuse the specific JHA day. Monthly checklist is tracked by month,
    // not by day, so a holiday on one day does NOT excuse the monthly checklist.
    // (was: if weekHasHoliday && !crew.monthlyChecklist → set N/A)

    if (monthlyStatus.affectsStatus && monthlyStatus.shouldCreateTask) {
      missingItems.push('Monthly Checklist');
    }

    // Determine overall status
    if (missingItems.length > 0) {
      crew.status = 'Missing Reports';
      missingCount++;
    } else if (!isPastDeadline && (
      crew.days['Mon'] === '\u23F3' || crew.days['Tue'] === '\u23F3' ||
      crew.days['Wed'] === '\u23F3' || crew.days['Thu'] === '\u23F3' ||
      crew.days['Fri'] === '\u23F3' || crew.weeklyMeetingStatus === '\u23F3')) {
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

  // Convert unknown jobs to array, but FILTER OUT any jobs that are actually tracked crews,
  // empty job numbers, or jobs with known non-Active statuses in Job Tracking
  for (var uj in unknownJobs) {
    var baseJob = uj.split('.')[0].trim();
    // Skip empty job numbers
    if (!baseJob) {
      Logger.log("calculateComplianceFromLogs: Filtering out empty job number from uncredited list");
      continue;
    }
    // Skip if this job is actually a tracked crew
    if (crewCompliance[baseJob]) {
      Logger.log("calculateComplianceFromLogs: Filtering out " + uj + " from uncredited list - it's a tracked crew");
      continue;
    }
    // Skip if this job exists in Job Tracking with On Hold/Completed/Pending Start status
    var ujJobStatus = jobTrackingStatuses[baseJob];
    if (ujJobStatus && ujJobStatus !== 'active') {
      Logger.log("calculateComplianceFromLogs: Filtering out " + uj + " from uncredited list - Job Tracking status: " + ujJobStatus);
      continue;
    }
    result.uncreditedJobs.push({
      jobNumber: uj,
      reportTypes: unknownJobs[uj].reportTypes,
      dates: unknownJobs[uj].dates,
      reports: unknownJobs[uj].reports || [],  // Include reports with email IDs for PDF preview
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
 * Now includes cell notes (tooltips) with date details and icon legends
 *
 * @param {Object} complianceData - From calculateComplianceFromLogs()
 */
function updateComplianceSheetFromLogs(complianceData, options) {
  var ignoreResolved = (options && options.ignoreResolved) || false;
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
  var dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

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
  var affectedRows = []; // Track rows that need data validation re-applied

  for (var crewJob in complianceData.crews) {
    var crew = complianceData.crews[crewJob];

    // Skip if already resolved (unless ignoreResolved=true for master recalculate)
    if (!ignoreResolved && existingRows[crewJob] && existingRows[crewJob].status === 'Resolved') {
      Logger.log("updateComplianceSheetFromLogs: Skipping resolved crew " + crewJob);
      continue;
    }

    var rowData = [
      weekStartStr,
      crewJob,
      crew.foreman,
      crew.days['Sun'] || 'N/A',
      crew.days['Mon'] || '\u23F3',
      crew.days['Tue'] || '\u23F3',
      crew.days['Wed'] || '\u23F3',
      crew.days['Thu'] || '\u23F3',
      crew.days['Fri'] || '\u23F3',
      crew.days['Sat'] || 'N/A',
      crew.weeklyMeetingStatus || '\u23F3',
      crew.monthlyChecklistStatus || '\u23F3',
      crew.status,
      nowStr
    ];

    var rowNum;
    if (existingRows[crewJob]) {
      rowNum = existingRows[crewJob].rowNum;
      sheet.getRange(rowNum, 1, 1, rowData.length).setValues([rowData]);
      updated++;
    } else {
      sheet.appendRow(rowData);
      rowNum = sheet.getLastRow();
      added++;
    }
    affectedRows.push(rowNum);

    // Add cell notes/tooltips for day columns (D-J = columns 4-10), Weekly Meeting (K=11), Monthly (L=12)
    // Day columns: D=Sun(4), E=Mon(5), F=Tue(6), G=Wed(7), H=Thu(8), I=Fri(9), J=Sat(10)
    for (var dayIdx = 0; dayIdx < 7; dayIdx++) {
      var dayName = dayNames[dayIdx];
      var dayDate = crew.dayDates ? crew.dayDates[dayName] : null;
      var statusIcon = crew.days[dayName] || 'N/A';
      var details = (crew.jhaDetails && crew.jhaDetails[dayIdx]) ? crew.jhaDetails[dayIdx] : null;

      var note = buildComplianceCellNote('jha', dayDate, statusIcon, details);
      sheet.getRange(rowNum, 4 + dayIdx).setNote(note); // Column D=4 + dayIdx
    }

    // Weekly Meeting tooltip (column K = 11)
    var weeklyNote = buildComplianceCellNote('weekly', null, crew.weeklyMeetingStatus || '\u23F3', crew.weeklyMeetingDetails);
    sheet.getRange(rowNum, 11).setNote(weeklyNote);

    // Monthly Checklist tooltip (column L = 12)
    var monthlyNote = buildComplianceCellNote('monthly', null, crew.monthlyChecklistStatus || '\u23F3', crew.monthlyChecklistDetails);
    sheet.getRange(rowNum, 12).setNote(monthlyNote);
  }

  // === REMOVE STALE ROWS ===
  // Delete rows that exist in the sheet for this week but are NOT in complianceData
  // This handles crews that were filtered out (e.g., by filterCrewsByJobTrackingStartDate)
  // Skip "Resolved" rows - those were manually resolved by the user and should be preserved
  var rowsToDelete = [];
  for (var existingJob in existingRows) {
    if (!complianceData.crews[existingJob] && existingRows[existingJob].status !== 'Resolved') {
      rowsToDelete.push(existingRows[existingJob].rowNum);
      Logger.log("updateComplianceSheetFromLogs: Marking stale row for deletion - crew " + existingJob +
                 " (row " + existingRows[existingJob].rowNum + ", status: " + existingRows[existingJob].status + ")");
    }
  }

  // Delete stale rows in reverse order (bottom-up) to avoid shifting row numbers
  if (rowsToDelete.length > 0) {
    rowsToDelete.sort(function(a, b) { return b - a; }); // Sort descending
    for (var d = 0; d < rowsToDelete.length; d++) {
      sheet.deleteRow(rowsToDelete[d]);
    }
    Logger.log("updateComplianceSheetFromLogs: Deleted " + rowsToDelete.length + " stale rows for week " + weekStartStr);
  }

  // Re-apply data validation dropdowns to all affected rows
  // setValues() and appendRow() strip data validation, so we must restore it
  // NOTE: After deleting rows above, row numbers may have shifted. Re-read to get correct row numbers.
  if (affectedRows.length > 0 && rowsToDelete.length > 0) {
    // Row numbers shifted due to deletions - re-read the sheet to find correct rows
    var freshData = sheet.getDataRange().getValues();
    affectedRows = [];
    for (var fi = 1; fi < freshData.length; fi++) {
      var fWeek = freshData[fi][0];
      var fJob = String(freshData[fi][1] || '').trim();
      if (fWeek && fJob) {
        var fWeekStr = Utilities.formatDate(new Date(fWeek), tz, 'MM/dd/yyyy');
        if (fWeekStr === weekStartStr && complianceData.crews[fJob]) {
          affectedRows.push(fi + 1); // 1-based row number
        }
      }
    }
  }

  if (affectedRows.length > 0) {
    var dayValues = ['\u2705', '\u2705L', '\u274C', '\u274CW', 'N/A', '\u23F3', ''];
    var dayRule = SpreadsheetApp.newDataValidation()
      .requireValueInList(dayValues, true)
      .setAllowInvalid(true)
      .build();

    var statusValues = ['Complete', 'Missing Reports', 'Pending', 'Resolved'];
    var statusRule = SpreadsheetApp.newDataValidation()
      .requireValueInList(statusValues, true)
      .setAllowInvalid(true)
      .build();

    for (var ri = 0; ri < affectedRows.length; ri++) {
      var r = affectedRows[ri];
      // Day columns D-K (cols 4-11): 8 columns
      sheet.getRange(r, 4, 1, 8).setDataValidation(dayRule);
      // Status column M (col 13)
      sheet.getRange(r, 13, 1, 1).setDataValidation(statusRule);
    }
    Logger.log("updateComplianceSheetFromLogs: Re-applied dropdowns to " + affectedRows.length + " rows");
  }

  Logger.log("updateComplianceSheetFromLogs: Updated " + updated + ", Added " + added + ", Deleted " + rowsToDelete.length + " rows (with tooltips)");
}

/**
 * Adds tooltips to all rows in the Safety Compliance sheet
 * Reads data from log sheets to get date details for each cell
 * Can be called manually or from menu
 */
function refreshSafetyComplianceTooltips() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SAFETY_COMPLIANCE_SHEET_NAME);

  if (!sheet || sheet.getLastRow() < 2) {
    Logger.log("refreshSafetyComplianceTooltips: No Safety Compliance data found");
    return 0;
  }

  var tz = Session.getScriptTimeZone();
  var data = sheet.getDataRange().getValues();
  var numDataRows = data.length - 1; // exclude header

  if (numDataRows < 1) return 0;

  // Load all log data once into memory (3 API calls total)
  var jhaLog = loadJHALogData();
  var weeklyLog = loadWeeklySafetyLogData();
  var monthlyLog = loadMonthlyChecklistLogData();

  // Build 2D notes array for columns D-L (9 columns, indices 0-8 in this array)
  // Column D=4, E=5, F=6, G=7, H=8, I=9, J=10 (days 0-6), K=11 (weekly), L=12 (monthly)
  var notesArray = [];
  var updatedRows = 0;

  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var weekStart = row[0];
    var jobNumber = String(row[1] || '').trim();

    if (!weekStart || !jobNumber) {
      // Push empty notes to keep array aligned with sheet rows
      notesArray.push(['', '', '', '', '', '', '', '', '']);
      continue;
    }

    var weekBounds = getWeekBoundaries(new Date(weekStart));
    var rowNotes = [];

    // Day columns D-J (7 days)
    for (var dayIdx = 0; dayIdx < 7; dayIdx++) {
      var statusIcon = String(row[3 + dayIdx] || '').trim();
      var dayDate = new Date(weekBounds.weekStart.getTime());
      dayDate.setDate(dayDate.getDate() + dayIdx);
      var details = lookupJHADetails(jhaLog, jobNumber, dayDate, tz);
      rowNotes.push(buildComplianceCellNote('jha', dayDate, statusIcon, details));
    }

    // Weekly Meeting (column K)
    var weeklyStatus = String(row[10] || '').trim();
    var weeklyDetails = lookupWeeklyMeetingDetails(weeklyLog, jobNumber, weekBounds.weekStart, tz);
    rowNotes.push(buildComplianceCellNote('weekly', null, weeklyStatus, weeklyDetails));

    // Monthly Checklist (column L)
    var monthlyStatus = String(row[11] || '').trim();
    var monthlyDetails = lookupMonthlyChecklistDetails(monthlyLog, jobNumber, weekBounds.weekStart, tz);
    rowNotes.push(buildComplianceCellNote('monthly', null, monthlyStatus, monthlyDetails));

    notesArray.push(rowNotes);
    updatedRows++;
  }

  // Write ALL notes in a single API call instead of one per cell
  sheet.getRange(2, 4, numDataRows, 9).setNotes(notesArray);

  Logger.log("refreshSafetyComplianceTooltips: Added tooltips to " + updatedRows + " rows (batch write)");
  return updatedRows;
}

/**
 * Loads all JHA Log data into memory for fast lookups
 */
function loadJHALogData() {
  var sheet = getJHALogSheet();
  if (!sheet || sheet.getLastRow() < 2) return [];
  return sheet.getDataRange().getValues();
}

/**
 * Loads all Weekly Safety Log data into memory for fast lookups
 */
function loadWeeklySafetyLogData() {
  var sheet = getWeeklySafetyLogSheet();
  if (!sheet || sheet.getLastRow() < 2) return [];
  return sheet.getDataRange().getValues();
}

/**
 * Loads all Monthly Checklist Log data into memory for fast lookups
 */
function loadMonthlyChecklistLogData() {
  var sheet = getMonthlyChecklistLogSheet();
  if (!sheet || sheet.getLastRow() < 2) return [];
  return sheet.getDataRange().getValues();
}

/**
 * Looks up JHA details from log data for a specific crew and date
 */
function lookupJHADetails(jhaLog, jobNumber, dayDate, tz) {
  if (!jhaLog || jhaLog.length < 2) return null;

  var dayStr = Utilities.formatDate(dayDate, tz, 'MM/dd/yyyy');

  for (var i = 1; i < jhaLog.length; i++) {
    var row = jhaLog[i];
    var creditedTo = String(row[8] || '').trim(); // Column I - Credited To
    var dateCreated = row[1]; // Column B

    if (!creditedTo || !dateCreated) continue;

    // Check if this row matches our crew
    if (creditedTo !== jobNumber) continue;

    // Check if the date matches
    var createdStr = Utilities.formatDate(new Date(dateCreated), tz, 'MM/dd/yyyy');
    if (createdStr === dayStr) {
      return {
        dateReceived: row[0], // Column A
        dateCreated: dateCreated
      };
    }
  }

  return null;
}

/**
 * Looks up Weekly Meeting details from log data for a specific crew and week
 */
function lookupWeeklyMeetingDetails(weeklyLog, jobNumber, weekStart, tz) {
  if (!weeklyLog || weeklyLog.length < 2) return null;

  for (var i = 1; i < weeklyLog.length; i++) {
    var row = weeklyLog[i];
    var creditedTo = String(row[7] || '').trim(); // Column H - Credited To
    var weekOf = row[1]; // Column B

    if (!creditedTo || !weekOf) continue;

    // Check if this row matches our crew
    if (creditedTo !== jobNumber) continue;

    // Check if the week matches (exact boundaries of the compliance week)
    var weekBounds = getWeekBoundaries(weekStart);
    var weekOfDate = new Date(weekOf);
    if (weekOfDate >= weekBounds.weekStart && weekOfDate <= weekBounds.weekEnd) {
      return {
        dateReceived: row[0], // Column A
        weekOf: weekOf
      };
    }
  }

  return null;
}

/**
 * Looks up Monthly Checklist details from log data for a specific crew and month
 */
function lookupMonthlyChecklistDetails(monthlyLog, jobNumber, weekStart, tz) {
  if (!monthlyLog || monthlyLog.length < 2) return null;

  // Use Monday of the week (weekStart + 1 day) as the month reference, matching calculateComplianceFromLogs.
  var weekBounds = getWeekBoundaries(weekStart);
  var mondayOfWeek = new Date(weekBounds.weekStart.getTime() + 24 * 60 * 60 * 1000);
  var targetMonth = mondayOfWeek.getMonth();
  var targetYear = mondayOfWeek.getFullYear();
  var newestDetails = null;
  var newestDate = null;

  for (var i = 1; i < monthlyLog.length; i++) {
    var row = monthlyLog[i];
    var creditedTo = String(row[8] || '').trim(); // Column I - Credited To
    var reportDate = row[1]; // Column B

    if (!creditedTo || !reportDate) continue;

    // Check if this row matches our crew
    if (creditedTo !== jobNumber) continue;

    // Check if the report is in the same month
    var checkDate = new Date(reportDate);
    if (checkDate.getMonth() === targetMonth && checkDate.getFullYear() === targetYear) {
      // Keep the newest one
      if (!newestDate || checkDate > newestDate) {
        newestDate = checkDate;
        newestDetails = {
          dateReceived: row[0], // Column A
          reportDate: reportDate
        };
      }
    }
  }

  return newestDetails;
}

/**
 * Menu function to refresh all tooltips on the Safety Compliance sheet
 */
function menuRefreshComplianceTooltips() {
  var ui = SpreadsheetApp.getUi();

  try {
    var count = refreshSafetyComplianceTooltips();
    ui.alert('Tooltips Refreshed', '\u2705 Added tooltips to ' + count + ' rows.\n\nHover over any cell in columns D-L to see the tooltip.', ui.ButtonSet.OK);
  } catch (e) {
    ui.alert('Error', 'Failed to refresh tooltips: ' + e.toString(), ui.ButtonSet.OK);
  }
}

/**
 * Logs a parsed safety email to the appropriate log sheet based on report type
 * This is the central function for Option B - every email gets logged here
 *
 * @param {Object} parsed - Result from parseSafetyEmail()
 * @param {GmailMessage} message - The Gmail message object
 * @param {Object} context - Resolution context with trackedCrews, customMappings
 * @param {Object} existingEmailIds - Optional pre-loaded set of existing email IDs (for fast lookup)
 * @returns {Object} - { logged: boolean, status: string, creditedTo: string|null, logSheet: string }
 */
function logParsedSafetyEmail(parsed, message, context, existingEmailIds, rowsCollector) {
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
      }, existingEmailIds, rowsCollector);

      if (logResult.success) {
        result.logged = true;
        result.logSheet = JHA_LOG_SHEET_NAME;
        // Add to pre-loaded set to prevent duplicate logging in same batch
        if (existingEmailIds) {
          existingEmailIds[messageId + (datesToProcess.length > 1 ? '_' + i : '')] = true;
        }
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
    }, existingEmailIds, rowsCollector);

    if (logResult.success) {
      result.logged = true;
      result.logSheet = WEEKLY_SAFETY_LOG_SHEET_NAME;
      // Add to pre-loaded set to prevent duplicate logging in same batch
      if (existingEmailIds) {
        existingEmailIds[messageId] = true;
      }
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
    }, existingEmailIds, rowsCollector);

    if (logResult.success) {
      result.logged = true;
      result.logSheet = MONTHLY_CHECKLIST_LOG_SHEET_NAME;
      // Add to pre-loaded set to prevent duplicate logging in same batch
      if (existingEmailIds) {
        existingEmailIds[messageId] = true;
      }
    } else if (logResult.duplicate) {
      result.status = 'Duplicate';
      result.reason = 'duplicate';
    }
  }

  return result;
}

/**
 * Helper to get all unique week start dates (Sundays) to process.
 * Gathers dates from:
 * 1. The existing rows in the Safety Compliance sheet (if any exist)
 * 2. The dates in the log sheets (JHA Log, Weekly Safety Log, Monthly Checklist Log)
 * 
 * @param {Spreadsheet} ss - Active spreadsheet
 * @param {string} tz - Script timezone
 * @returns {Object} Map of yyyy-MM-dd -> Date object
 */
function getUniqueWeeksToProcess(ss, tz) {
  const uniqueWeeks = {};

  // 1. Get weeks from Safety Compliance sheet (if any exist)
  const complianceSheet = ss.getSheetByName('Safety Compliance');
  if (complianceSheet && complianceSheet.getLastRow() >= 2) {
    const data = complianceSheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      const weekStart = data[i][0];
      if (weekStart) {
        try {
          const weekStartDay = new Date(weekStart);
          if (!isNaN(weekStartDay.getTime())) {
            const weekBounds = getWeekBoundaries(weekStartDay);
            const weekKey = Utilities.formatDate(weekBounds.weekStart, tz, 'yyyy-MM-dd');
            uniqueWeeks[weekKey] = weekBounds.weekStart;
          }
        } catch(e) {
          Logger.log("getUniqueWeeksToProcess: Error parsing compliance week: " + weekStart + " - " + e.toString());
        }
      }
    }
  }

  // Helper to process dates from a sheet column
  const addWeeksFromSheet = (sheetName, dateColIndex) => {
    const sheet = ss.getSheetByName(sheetName);
    if (sheet && sheet.getLastRow() >= 2) {
      const lastRow = sheet.getLastRow();
      const data = sheet.getRange(2, dateColIndex, lastRow - 1, 1).getValues();
      for (let i = 0; i < data.length; i++) {
        const dateVal = data[i][0];
        if (dateVal) {
          try {
            const dateObj = new Date(dateVal);
            if (!isNaN(dateObj.getTime())) {
              const weekBounds = getWeekBoundaries(dateObj);
              const weekKey = Utilities.formatDate(weekBounds.weekStart, tz, 'yyyy-MM-dd');
              uniqueWeeks[weekKey] = weekBounds.weekStart;
            }
          } catch(e) {
            // ignore parse errors
          }
        }
      }
    }
  };

  // 2. Add weeks from JHA Log column B (Date Created, 1-based col 2)
  addWeeksFromSheet('JHA Log', 2);

  // 3. Add weeks from Weekly Safety Log column B (Week Of, 1-based col 2)
  addWeeksFromSheet('Weekly Safety Log', 2);

  // 4. Add weeks from Monthly Checklist Log column B (Report Date, 1-based col 2)
  addWeeksFromSheet('Monthly Checklist Log', 2);

  return uniqueWeeks;
}

/**
 * Recalculates ALL weeks in the Safety Compliance sheet from log data
 * Use this to fix incorrectly credited weeks after bug fixes
 * Menu function: Glove Manager → Safety → Recalculate ALL Compliance
 */
function recalculateAllComplianceFromLogs() {
  const ui = SpreadsheetApp.getUi();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const tz = Session.getScriptTimeZone();

  // Confirm with user
  const response = ui.alert(
    '\u26A0\uFE0F Recalculate ALL Compliance',
    'This will recalculate compliance for ALL weeks in the Safety Compliance sheet from the log sheets.\n\n' +
    'This fixes any incorrectly credited reports (e.g., wrong week assignments).\n\n' +
    'Continue?',
    ui.ButtonSet.YES_NO
  );

  if (response !== ui.Button.YES) {
    return;
  }

  try {
    const uniqueWeeks = getUniqueWeeksToProcess(ss, tz);
    const weekKeys = Object.keys(uniqueWeeks).sort().reverse(); // Most recent first
    Logger.log("recalculateAllComplianceFromLogs: Found " + weekKeys.length + " unique weeks to process");

    if (weekKeys.length === 0) {
      ui.alert('No Data', 'No unique weeks found in Safety Compliance or log sheets.', ui.ButtonSet.OK);
      return;
    }

    let processedCount = 0;
    let totalCompliant = 0;
    let totalMissing = 0;

    for (let w = 0; w < weekKeys.length; w++) {
      const weekStart = uniqueWeeks[weekKeys[w]];
      Logger.log("Processing week: " + weekKeys[w]);

      const complianceData = calculateComplianceFromLogs(weekStart);
      if (complianceData) {
        updateComplianceSheetFromLogs(complianceData);
        totalCompliant += complianceData.compliantCount || 0;
        totalMissing += complianceData.missingCount || 0;
        processedCount++;
      }
    }

    // Format the sheet
    formatComplianceSheetByWeek();

    // Refresh tooltips
    refreshSafetyComplianceTooltips();

    var msg = '\u2705 Recalculated ' + processedCount + ' weeks from log sheets!\n\n' +
              'Total compliant: ' + totalCompliant + '\n' +
              'Total missing: ' + totalMissing + '\n\n' +
              'Tooltips have been refreshed.';

    ui.alert('All Compliance Recalculated', msg, ui.ButtonSet.OK);

  } catch (e) {
    Logger.log("recalculateAllComplianceFromLogs error: " + e.toString());
    ui.alert('Error', 'Failed to recalculate: ' + e.toString(), ui.ButtonSet.OK);
  }
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

    var msg = '\u2705 Compliance recalculated from log sheets!\n\n';
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
 * Menu handler: backfills Gmail hyperlinks to all Email ID cells in JHA Log.
 */
function menuApplyJHALogEmailLinks() {
  var linkCount = applyJHALogEmailLinksSilent();
  if (linkCount === 0) {
    SpreadsheetApp.getUi().alert('No data rows found in JHA Log, or sheet not found.');
    return;
  }
  SpreadsheetApp.getUi().alert('\u2705 Added Gmail links to ' + linkCount + ' rows in JHA Log.\n\nClick any Email ID cell to open the original email in Gmail.');
}

/**
 * Menu handler: backfills Gmail hyperlinks to all Email ID cells in Weekly Safety Log.
 */
function menuApplyWeeklySafetyLogEmailLinks() {
  var linkCount = applyWeeklySafetyLogEmailLinksSilent();
  if (linkCount === 0) {
    SpreadsheetApp.getUi().alert('No data rows found in Weekly Safety Log, or sheet not found.');
    return;
  }
  SpreadsheetApp.getUi().alert('\u2705 Added Gmail links to ' + linkCount + ' rows in Weekly Safety Log.\n\nClick any Email ID cell to open the original email in Gmail.');
}

/**
 * Applies Gmail hyperlinks to all Email ID values in the Monthly Checklist Log sheet (col G = 7).
 * Silent version — called automatically at end of processSafetyEmails().
 * @return {number} Number of links applied
 */
function applyMonthlyChecklistLogEmailLinksSilent() {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(MONTHLY_CHECKLIST_LOG_SHEET_NAME);
    if (!sheet || sheet.getLastRow() < 2) return 0;

    var emailIdCol = 7; // Column G - Email ID
    var lastRow = sheet.getLastRow();
    var values = sheet.getRange(2, emailIdCol, lastRow - 1, 1).getValues();
    var richTextValues = [];
    var linkCount = 0;

    for (var i = 0; i < values.length; i++) {
      var msgId = String(values[i][0] || '').trim();
      if (msgId) {
        var baseId = msgId.split('_')[0];
        var gmailUrl = 'https://mail.google.com/mail/u/0/#all/' + baseId;
        richTextValues.push([SpreadsheetApp.newRichTextValue()
          .setText(msgId)
          .setLinkUrl(gmailUrl)
          .build()]);
        linkCount++;
      } else {
        richTextValues.push([SpreadsheetApp.newRichTextValue().setText('').build()]);
      }
    }

    sheet.getRange(2, emailIdCol, lastRow - 1, 1).setRichTextValues(richTextValues);
    Logger.log('applyMonthlyChecklistLogEmailLinksSilent: Applied links to ' + linkCount + ' rows');
    return linkCount;
  } catch (e) {
    Logger.log('applyMonthlyChecklistLogEmailLinksSilent: Error (non-fatal) - ' + e.toString());
    return 0;
  }
}

/**
 * Menu handler: backfills Gmail hyperlinks to all Email ID cells in Monthly Checklist Log.
 */
function menuApplyMonthlyChecklistLogEmailLinks() {
  var linkCount = applyMonthlyChecklistLogEmailLinksSilent();
  if (linkCount === 0) {
    SpreadsheetApp.getUi().alert('No data rows found in Monthly Checklist Log, or sheet not found.');
    return;
  }
  SpreadsheetApp.getUi().alert('\u2705 Added Gmail links to ' + linkCount + ' rows in Monthly Checklist Log.\n\nClick any Email ID cell to open the original email in Gmail.');
}

/**
 * Menu handler: backfills Gmail hyperlinks to ALL log sheets at once
 * (JHA Log, Weekly Safety Log, Monthly Checklist Log, Equipment Needs).
 */
function menuApplyAllEmailLinks() {
  var jhaCount = applyJHALogEmailLinksSilent();
  var weeklyCount = applyWeeklySafetyLogEmailLinksSilent();
  var monthlyCount = applyMonthlyChecklistLogEmailLinksSilent();
  var equipCount = backfillSafetyEquipmentEmailLinks();
  var total = jhaCount + weeklyCount + monthlyCount + (typeof equipCount === 'number' ? equipCount : 0);
  SpreadsheetApp.getUi().alert(
    '\u2705 Gmail links applied to all log sheets:\n\n' +
    '\u2022 JHA Log: ' + jhaCount + ' rows\n' +
    '\u2022 Weekly Safety Log: ' + weeklyCount + ' rows\n' +
    '\u2022 Monthly Checklist Log: ' + monthlyCount + ' rows\n' +
    '\u2022 Equipment Needs: ' + (typeof equipCount === 'number' ? equipCount : '?') + ' rows\n\n' +
    'Total: ' + total + ' links added.\n\nClick any Email ID cell to open the email in Gmail.'
  );
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
 * Menu function: Glove Manager → Safety → 🔁 Diagnose Compliance
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

  report.push('JHA Log: ' + (jhaLog ? '\u2705 Exists (' + (jhaLog.getLastRow() - 1) + ' records)' : '\u274C MISSING'));
  report.push('Weekly Safety Log: ' + (weeklyLog ? '\u2705 Exists (' + (weeklyLog.getLastRow() - 1) + ' records)' : '\u274C MISSING'));
  report.push('Monthly Checklist Log: ' + (monthlyLog ? '\u2705 Exists (' + (monthlyLog.getLastRow() - 1) + ' records)' : '\u274C MISSING'));

  if (!jhaLog || !weeklyLog || !monthlyLog) {
    report.push('\n\u26A0\uFE0F Missing log sheets! Run "Setup Log Sheets" from Safety menu.');
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
    report.push('\u274C Safety Compliance sheet not found!');
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
        report.push('    \u26A0\uFE0F Could not extract job number from subject');
      }

      // Try to extract date
      var dateMatch = subject.match(/(\d{2})-(\d{2})-(\d{4})/);
      if (dateMatch) {
        report.push('    Extracted Date: ' + dateMatch[0]);
      } else {
        report.push('    \u26A0\uFE0F Could not extract date from subject');
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
        report.push('    \u26A0\uFE0F Reason: ' + resolution.reason);
      }
    }
  } catch (e) {
    report.push('Error testing job resolution: ' + e.toString());
  }

  // Show report
  var htmlReport = '<pre style="font-family: monospace; font-size: 12px; white-space: pre-wrap;">' +
    report.join('\n').replace(/\u2705/g, '<span style="color:green">\u2705</span>')
                     .replace(/\u274C/g, '<span style="color:red">\u274C</span>')
                     .replace(/\u26A0\uFE0F/g, '<span style="color:orange">\u26A0\uFE0F</span>') +
    '</pre>';

  var htmlOutput = HtmlService.createHtmlOutput(htmlReport)
    .setWidth(800)
    .setHeight(600);
  ui.showModalDialog(htmlOutput, '🔁 Safety Compliance Diagnostic Report');

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
            report.push('\u26A0\uFE0F Skipped: ' + parsedData.skippedReason);
          }
        } else {
          report.push('\u274C parseSafetyEmail returned null');
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
  var tz = Session.getScriptTimeZone();
  var report = [];
  report.push('=== CREW COMPLIANCE DIAGNOSIS: ' + jobNum + ' ===\n');

  // 1. Check if crew exists in Employees and is in tracked crews
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
  report.push('   Foreman: ' + (foreman || '\u274C NOT FOUND'));
  if (crewMembers.length > 0) {
    for (var j = 0; j < crewMembers.length; j++) {
      report.push('   - ' + crewMembers[j].name + ' (' + crewMembers[j].classification + ') - ' + crewMembers[j].job);
    }
  }

  // Check if in tracked crews
  var trackedCrews = getActiveCrews();
  var isTracked = trackedCrews.indexOf(jobNum) !== -1;
  report.push('   Is tracked crew: ' + (isTracked ? '\u2705 YES' : '\u274C NO'));
  if (!isTracked) {
    report.push('   \u26A0\uFE0F This crew is NOT in the tracked crews list - compliance won\'t be calculated!');
  }

  // 2. Check JHA Log for this crew (both job number AND creditedTo)
  report.push('\n2. JHA LOG ENTRIES:');
  var jhaLog = ss.getSheetByName('JHA Log');
  if (jhaLog && jhaLog.getLastRow() > 1) {
    var jhaData = jhaLog.getDataRange().getValues();
    var jhaEntries = [];

    // JHA Log columns: A=DateReceived, B=DateCreated, C=JobNumber, D=Foreman, E=Subject, F=EmailID, G=Source, H=Status, I=CreditedTo, J=Notes
    for (var k = 1; k < jhaData.length; k++) {
      var rowJobNumber = String(jhaData[k][2] || '').trim();
      var creditedTo = String(jhaData[k][8] || '').trim();

      // Check if this row matches our crew (either original job or credited to)
      if (rowJobNumber.indexOf(jobNum) !== -1 || creditedTo === jobNum) {
        var dateCreated = jhaData[k][1];
        var dateStr = dateCreated ? Utilities.formatDate(new Date(dateCreated), tz, 'MM/dd/yyyy') : 'N/A';

        jhaEntries.push({
          row: k + 1,
          received: jhaData[k][0],
          created: dateStr,
          createdRaw: dateCreated,
          job: rowJobNumber,
          foreman: jhaData[k][3],
          status: jhaData[k][7],      // Column H - Status
          creditedTo: creditedTo,     // Column I - Credited To
          notes: jhaData[k][9]
        });
      }
    }

    report.push('   Found ' + jhaEntries.length + ' JHA entries');
    for (var e = 0; e < jhaEntries.length; e++) {
      var entry = jhaEntries[e];
      var statusIcon = entry.status === 'Credited' ? '\u2705' : '\u274C';
      var creditIcon = entry.creditedTo === jobNum ? '\u2705' : (entry.creditedTo ? '\u26A0\uFE0F' : '\u274C');
      report.push('   Row ' + entry.row + ': ' + entry.created + ' | Status: ' + statusIcon + entry.status + ' | CreditedTo: ' + creditIcon + (entry.creditedTo || 'EMPTY'));
      if (entry.creditedTo && entry.creditedTo !== jobNum) {
        report.push('      \u26A0\uFE0F Credited to different crew: ' + entry.creditedTo);
      }
    }

    // Check for entries that SHOULD be credited to this crew
    var shouldBeCredited = jhaEntries.filter(function(e) {
      return e.status === 'Credited' && e.creditedTo === jobNum;
    });
    report.push('\n   \u2705 Entries properly credited to ' + jobNum + ': ' + shouldBeCredited.length);

    var wrongCrew = jhaEntries.filter(function(e) {
      return e.status === 'Credited' && e.creditedTo !== jobNum;
    });
    if (wrongCrew.length > 0) {
      report.push('   \u26A0\uFE0F Entries credited to WRONG crew: ' + wrongCrew.length);
    }

  } else {
    report.push('   \u274C JHA Log not found or empty');
  }

  // 3. Check Safety Compliance sheet
  report.push('\n3. SAFETY COMPLIANCE SHEET:');
  var compSheet = ss.getSheetByName('Safety Compliance');
  if (compSheet && compSheet.getLastRow() > 1) {
    var compData = compSheet.getDataRange().getValues();
    var compEntries = [];

    // Columns: A=WeekStart, B=JobNumber, C=Foreman, D=Sun, E=Mon, F=Tue, G=Wed, H=Thu, I=Fri, J=Sat, K=Weekly, L=Monthly, M=Status
    for (var c = 1; c < compData.length; c++) {
      if (String(compData[c][1]).indexOf(jobNum) !== -1) {
        var weekDate = compData[c][0];
        var weekStr = weekDate ? Utilities.formatDate(new Date(weekDate), tz, 'MM/dd/yyyy') : 'N/A';

        compEntries.push({
          row: c + 1,
          week: weekStr,
          job: compData[c][1],
          foreman: compData[c][2],
          sun: compData[c][3],
          mon: compData[c][4],
          tue: compData[c][5],
          wed: compData[c][6],
          thu: compData[c][7],
          fri: compData[c][8],
          sat: compData[c][9],
          weekly: compData[c][10],
          monthly: compData[c][11],
          status: compData[c][12]
        });
      }
    }

    report.push('   Found ' + compEntries.length + ' compliance rows');
    for (var r = 0; r < compEntries.length; r++) {
      var row = compEntries[r];
      var statusIcon = row.status === 'Complete' ? '\u2705' : (row.status === 'Missing Reports' ? '\u274C' : '\u23F3');
      report.push('   Row ' + row.row + ' | Week: ' + row.week + ' | Status: ' + statusIcon + row.status);
      report.push('     Sun:' + row.sun + ' Mon:' + row.mon + ' Tue:' + row.tue + ' Wed:' + row.wed + ' Thu:' + row.thu + ' Fri:' + row.fri + ' Sat:' + row.sat);
      report.push('     Weekly: ' + row.weekly + ' | Monthly: ' + row.monthly);
    }
  } else {
    report.push('   \u274C Safety Compliance sheet not found or empty');
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
  ui.showModalDialog(htmlOutput, '🔁 Crew Compliance Diagnosis: ' + jobNum);
}

/**
/**
 * Test function to trace EXACTLY why compliance isn't being credited
 * Run this manually and check the Logs
 */
function testComplianceCalculationForWeek() {
  var ui = SpreadsheetApp.getUi();

  var response = ui.prompt(
    'Test Compliance Calculation',
    'Enter week start date (e.g., "02/22/2026"):',
    ui.ButtonSet.OK_CANCEL
  );

  if (response.getSelectedButton() !== ui.Button.OK) return;

  var weekStartStr = response.getResponseText().trim();
  var weekStart = new Date(weekStartStr);

  if (isNaN(weekStart.getTime())) {
    ui.alert('Error', 'Invalid date format. Use MM/DD/YYYY', ui.ButtonSet.OK);
    return;
  }

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var tz = Session.getScriptTimeZone();
  var report = [];

  report.push('=== TEST COMPLIANCE CALCULATION ===');
  report.push('Input week start: ' + weekStartStr);
  report.push('Parsed date: ' + weekStart.toString());

  // Get week bounds
  var weekBounds = getWeekBoundaries(weekStart);
  report.push('Week bounds: ' + weekBounds.weekStart + ' to ' + weekBounds.weekEnd);
  report.push('Week start formatted: ' + Utilities.formatDate(weekBounds.weekStart, tz, 'MM/dd/yyyy'));

  // Get tracked crews
  var trackedCrews = getActiveCrews();
  report.push('\nTracked crews (' + trackedCrews.length + '): ' + trackedCrews.join(', '));

  // Read JHA Log
  var jhaSheet = ss.getSheetByName('JHA Log');
  if (!jhaSheet) {
    report.push('\n\u274C JHA Log sheet not found!');
  } else {
    var jhaData = jhaSheet.getDataRange().getValues();
    report.push('\nJHA Log has ' + (jhaData.length - 1) + ' rows');

    var matchingRows = [];
    var skippedReasons = { outsideWeek: 0, notCredited: 0, crewNotFound: 0, noDate: 0 };

    for (var i = 1; i < jhaData.length; i++) {
      var dateCreated = jhaData[i][1]; // Column B
      var status = String(jhaData[i][7] || '').trim(); // Column H
      var creditedTo = String(jhaData[i][8] || '').trim(); // Column I

      if (!dateCreated) {
        skippedReasons.noDate++;
        continue;
      }

      var jhaDate = new Date(dateCreated);

      // Check if within week
      if (jhaDate < weekBounds.weekStart || jhaDate > weekBounds.weekEnd) {
        skippedReasons.outsideWeek++;
        continue;
      }

      // This row is within the week
      var rowInfo = {
        row: i + 1,
        dateCreated: Utilities.formatDate(jhaDate, tz, 'MM/dd/yyyy'),
        dayOfWeek: jhaDate.getDay(),
        dayName: ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][jhaDate.getDay()],
        status: status,
        creditedTo: creditedTo
      };

      if (status !== 'Credited') {
        rowInfo.skipReason = 'Status is "' + status + '", not "Credited"';
        skippedReasons.notCredited++;
      } else if (!creditedTo) {
        rowInfo.skipReason = 'CreditedTo is empty';
        skippedReasons.notCredited++;
      } else if (trackedCrews.indexOf(creditedTo) === -1) {
        rowInfo.skipReason = 'CreditedTo "' + creditedTo + '" is not a tracked crew';
        skippedReasons.crewNotFound++;
      } else {
        rowInfo.willCredit = true;
      }

      matchingRows.push(rowInfo);
    }

    report.push('\nJHA entries within week (' + matchingRows.length + '):');
    report.push('Skipped reasons - Outside week: ' + skippedReasons.outsideWeek +
      ', Not credited/empty: ' + skippedReasons.notCredited +
      ', Crew not found: ' + skippedReasons.crewNotFound +
      ', No date: ' + skippedReasons.noDate);

    var willCreditCount = 0;
    for (var j = 0; j < matchingRows.length; j++) {
      var row = matchingRows[j];
      var icon = row.willCredit ? '\u2705' : '\u274C';
      report.push('  ' + icon + ' Row ' + row.row + ': ' + row.dateCreated + ' (' + row.dayName + ') | Status: ' + row.status + ' | CreditedTo: ' + row.creditedTo);
      if (row.skipReason) {
        report.push('      \u26A0\uFE0F ' + row.skipReason);
      }
      if (row.willCredit) willCreditCount++;
    }

    report.push('\n\u2705 Total that WILL be credited: ' + willCreditCount);
  }

  // Now show results
  var htmlReport = '<pre style="font-family: monospace; font-size: 11px; white-space: pre-wrap;">' +
    report.join('\n') + '</pre>';

  var htmlOutput = HtmlService.createHtmlOutput(htmlReport)
    .setWidth(800)
    .setHeight(600);
  ui.showModalDialog(htmlOutput, 'Compliance Calculation Test: ' + weekStartStr);
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
    SpreadsheetApp.getUi().alert('\u2705 Already Migrated',
      '"Safety Equipment Needs" sheet already exists.\n\nNo migration needed.',
      SpreadsheetApp.getUi().ButtonSet.OK);
    return;
  }

  if (!oldSheet) {
    SpreadsheetApp.getUi().alert('ℹ\uFE0F No Sheet Found',
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

  SpreadsheetApp.getUi().alert('\u2705 Migration Complete',
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

  // Exclude placeholder/invalid jobs (starting with 000 or 002)
  if (baseJob.indexOf('000-') === 0 || baseJob.indexOf('002-') === 0) {
    return { found: false, crew: null, foreman: null, source: 'excluded', reason: 'Placeholder or excluded job number' };
  }

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
    Logger.log("resolveJobToCrew: Custom mapping " + baseJob + " → " + customForeman + ", primaryCrew=" + primaryCrew + ", tracked=" + (primaryCrew ? !!trackedCrews[primaryCrew] : false));

    if (primaryCrew && trackedCrews[primaryCrew]) {
      // Best case: foreman's primary crew is tracked
      return {
        found: true,
        crew: primaryCrew,
        foreman: customForeman,
        source: 'custom',
        reason: 'Custom mapping: ' + baseJob + ' → ' + customForeman + ' (primary: ' + primaryCrew + ')'
      };
    } else if (primaryCrew) {
      // Foreman found, has a primary crew, but it's not in tracked list
      // Still mark as "found" since user explicitly mapped it - credit to their primary crew anyway
      Logger.log("resolveJobToCrew: primaryCrew " + primaryCrew + " NOT in trackedCrews, but user mapped it - crediting anyway");
      return {
        found: true,
        crew: primaryCrew,
        foreman: customForeman,
        source: 'custom_untracked',
        reason: 'Custom mapping: ' + baseJob + ' → ' + customForeman + ' (crew ' + primaryCrew + ' not actively tracked)'
      };
    } else {
      // Foreman name doesn't match anyone in Employees sheet
      // Still mark as handled since user explicitly created mapping
      Logger.log("resolveJobToCrew: Foreman " + customForeman + " not found in Employees sheet, but user mapped it");
      return {
        found: true,
        crew: baseJob, // Use the original job number as the "crew"
        foreman: customForeman,
        source: 'custom_manual',
        reason: 'Custom mapping: ' + baseJob + ' → ' + customForeman + ' (foreman not in Employees sheet)'
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

  var nameCol = getEmployeeNameColumnIndex(empData[0]);
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

  // 4. Check Job Tracking sheet (which preserves historical/completed jobs)
  var jobTrackingData = getCachedJobTrackingData();
  if (jobTrackingData && jobTrackingData.length > 1) {
    var jtHeaders = jobTrackingData[0];
    var jtJobNumCol = jtHeaders.indexOf('Job Number');
    var jtForemanCol = jtHeaders.indexOf('Foreman');
    if (jtJobNumCol !== -1 && jtForemanCol !== -1) {
      for (var j = 1; j < jobTrackingData.length; j++) {
        var jtJobNum = String(jobTrackingData[j][jtJobNumCol] || '').split('.')[0].trim();
        if (jtJobNum === baseJob) {
          var jtForeman = String(jobTrackingData[j][jtForemanCol] || '').trim();
          if (jtForeman) {
            return {
              found: true,
              crew: baseJob,
              foreman: jtForeman,
              source: 'job_tracking',
              reason: 'Job found in Job Tracking sheet (historical/completed)'
            };
          }
        }
      }
    }
  }

  // 5. Not found
  return {
    found: false,
    crew: null,
    foreman: null,
    source: 'notfound',
    reason: 'Job ' + baseJob + ' not found in Employees or Job Tracking sheets'
  };
}

/**
 * Helper to find a foreman's primary crew from Employees data
 */
function findForemanPrimaryCrew(foremanName, employeeData) {
  if (!foremanName || !employeeData) return null;

  var headers = employeeData[0].map(function(h) { return String(h).toLowerCase().trim(); });
  var nameCol = getEmployeeNameColumnIndex(employeeData[0]);
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
          dayValues.push('\u2705L');
          lateCount++;
        } else {
          dayValues.push('\u2705');
        }
      } else {
        // Check existing data first (might have been credited before)
        if (existingRows[crew]) {
          var existingDayVal = String(existingRows[crew].data[3 + d] || '').trim();
          if (existingDayVal === '\u2705' || existingDayVal === '\u2705L') {
            dayValues.push(existingDayVal);
            continue;
          }
        }
        // Not credited
        if (isPastDeadline) {
          dayValues.push('\u274C');
          status = 'Missing Reports';
          missingItems.push('JHA (' + dayNames[d] + ')');
        } else {
          dayValues.push('\u23F3');
          if (status === 'Complete') status = 'Pending';
        }
      }
    }

    // Weekly meeting
    var weeklyVal = '';
    if (crewConfig.skipWeeklyMeeting) {
      weeklyVal = 'N/A';
    } else if (crewData.weeklyMeeting) {
      weeklyVal = crewData.weeklyMeetingLate ? '\u2705L' : '\u2705';
      if (crewData.weeklyMeetingLate) lateCount++;
    } else {
      // Check existing
      if (existingRows[crew]) {
        var existingMeeting = String(existingRows[crew].data[10] || '').trim();
        if (existingMeeting === '\u2705' || existingMeeting === '\u2705L') {
          weeklyVal = existingMeeting;
        }
      }
      if (!weeklyVal) {
        if (isPastDeadline) {
          weeklyVal = '\u274C';
          status = 'Missing Reports';
          missingItems.push('Weekly Meeting');
        } else {
          weeklyVal = '\u23F3';
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
      } else if (status === 'Complete' && monthlyVal !== '\u2705' && monthlyVal !== 'N/A') {
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
 * This is the key function that writes JHA/Meeting data to the \u2705/\u274C grid
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
    var checkVal = isLate ? '\u2705L' : '\u2705';

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
      if (currentVal === '\u2705' || currentVal === '\u2705L') {
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
          crewConfig.skipDays[0] ? 'N/A' : '\u23F3', // Sun
          crewConfig.skipDays[1] ? 'N/A' : '\u23F3', // Mon
          crewConfig.skipDays[2] ? 'N/A' : '\u23F3', // Tue
          crewConfig.skipDays[3] ? 'N/A' : '\u23F3', // Wed
          crewConfig.skipDays[4] ? 'N/A' : '\u23F3', // Thu
          crewConfig.skipDays[5] ? 'N/A' : '\u23F3', // Fri
          crewConfig.skipDays[6] ? 'N/A' : '\u23F3', // Sat
          crewConfig.skipWeeklyMeeting ? 'N/A' : '\u23F3', // Meeting
          '\u23F3',             // Monthly
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
      "Would you like to:\n\u2022 YES = Migrate existing data to 'Safety Equipment Needs'\n\u2022 NO = Delete and create fresh",
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
    "Status", "FE Test Date", "Source Email ID", "Notes", "Email Subject", "Received Date", "Resolved On"
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
  sheet.setColumnWidth(14, 120); // Resolved On

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
  sheet.getRange(2, 13, 1000, 1).setNumberFormat("MM/dd/yyyy"); // Received Date
  sheet.getRange(2, 14, 1000, 1).setNumberFormat("MM/dd/yyyy"); // Resolved On

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

  // Setup the Archive button in cell O2
  try {
    ensureSafetyReportsArchiveButtonExists();
  } catch (buttonErr) {
    Logger.log("Error creating archive button in setupSafetyReportsSheet: " + buttonErr);
  }

  Browser.msgBox("\u2705 Safety Reports sheet created successfully!");
  Logger.log("Safety Reports sheet created");
}

/**
 * Ensures the Safety Equipment Needs sheet has the Archive checkbox button in cell O2.
 */
function ensureSafetyReportsArchiveButtonExists() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Safety Equipment Needs') || ss.getSheetByName('Safety Reports');
  if (!sheet) return;
  
  // Check if O2 already has a checkbox data validation rule
  var cell = sheet.getRange("O2");
  var rule = cell.getDataValidation();
  
  if (!rule || rule.getCriteriaType() !== SpreadsheetApp.DataValidationCriteria.CHECKBOX) {
    // Need to set up the button
    Logger.log('ensureSafetyReportsArchiveButtonExists: Button missing. Setting up...');
    
    // Set up header in O1
    var headerCell = sheet.getRange("O1");
    headerCell.setValue("Archive Controller")
      .setFontWeight("bold")
      .setBackground("#4A86E8")
      .setFontColor("white")
      .setHorizontalAlignment("center");
      
    // Set up checkbox in O2
    cell.insertCheckboxes();
    cell.setValue(false);
    cell.setHorizontalAlignment("center");
    
    // Set up label in P2
    var labelCell = sheet.getRange("P2");
    labelCell.setValue("Check to Archive Resolved Items")
      .setFontWeight("bold")
      .setFontColor("#333333");
      
    // Format column O & P width
    sheet.setColumnWidth(15, 140); // Column O
    sheet.setColumnWidth(16, 220); // Column P
    
    Logger.log('ensureSafetyReportsArchiveButtonExists: Successfully set up Archive button in cell O2.');
  }
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
  Logger.log('=== cleanupSafetyReportsSheet START ===');
  var sheet = getSafetyEquipmentSheet();

  if (!sheet || sheet.getLastRow() < 2) {
    Browser.msgBox('ℹ\uFE0F No Data',
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
    Browser.msgBox('\u274C Error', 'Report Type column not found in Safety Reports sheet.', Browser.Buttons.OK);
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
    Logger.log('No rows to clean: ' + (data.length - 1) + ' rows checked, all are valid equipment issues');
    Logger.log('=== cleanupSafetyReportsSheet END (already clean) ===');
    Browser.msgBox('\u2705 Already Clean',
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

  Browser.msgBox('\u2705 Cleanup Complete',
    'Removed ' + deleted + ' records:\\n' + summaryMsg + '\\n\\n' +
    'Safety Reports now contains only actual equipment issues that need attention.',
    Browser.Buttons.OK);

  Logger.log("cleanupSafetyReportsSheet: Removed " + deleted + " records (" + jhaCount + " JHA, " + meetingCount + " Safety Meeting, " + noIssuesCount + " No Issues)");
}

/**
 * Removes duplicate rows from the Safety Equipment Needs sheet.
 * Duplicates are identified by matching Email ID + Equipment Type + first 50 chars of Description.
 * Keeps the FIRST occurrence and removes subsequent duplicates.
 * Menu: Glove Manager → Process Safety Emails → Cleanup → Remove Duplicate Equipment Needs
 */
function cleanupDuplicateEquipmentNeeds() {
  var sheet = getSafetyEquipmentSheet();
  if (!sheet || sheet.getLastRow() < 2) {
    SpreadsheetApp.getUi().alert('ℹ\uFE0F No Data', 'Safety Equipment Needs sheet is empty or does not exist.', SpreadsheetApp.getUi().ButtonSet.OK);
    return;
  }

  var data = sheet.getDataRange().getValues();
  var seen = {};
  var rowsToDelete = [];

  // Scan from row 1 (skip header at 0) - keep first occurrence, mark later ones for deletion
  // Use CONTENT-BASED dedup key: reportDate + vehicleNumber + jobNumber + equipType + description
  // This catches duplicates from different email messages that contain the same report
  for (var i = 1; i < data.length; i++) {
    var reportDate = '';
    try {
      var rd = data[i][0];
      if (rd instanceof Date && !isNaN(rd.getTime())) {
        reportDate = Utilities.formatDate(rd, Session.getScriptTimeZone(), 'yyyy-MM-dd');
      } else {
        reportDate = String(rd || '').substring(0, 10);
      }
    } catch (e) {
      reportDate = String(data[i][0] || '').substring(0, 10);
    }
    var vehicleNum = String(data[i][4] || '').trim();
    var jobNumber = String(data[i][2] || '').trim();
    var equipType = String(data[i][5] || '').trim();
    var desc = String(data[i][6] || '').substring(0, 50).trim();

    // Content-based key: same date + vehicle + job + equipment type + description = duplicate
    var contentKey = reportDate + '|' + vehicleNum + '|' + jobNumber + '|' + equipType + '|' + desc;

    if (seen[contentKey]) {
      rowsToDelete.push(i + 1); // 1-based row number
    } else {
      seen[contentKey] = true;
    }
  }

  if (rowsToDelete.length === 0) {
    SpreadsheetApp.getUi().alert('\u2705 No Duplicates', 'No duplicate equipment issue rows found.', SpreadsheetApp.getUi().ButtonSet.OK);
    return;
  }

  var response = SpreadsheetApp.getUi().alert(
    '🧹 Remove Duplicate Equipment Needs',
    'Found ' + rowsToDelete.length + ' duplicate rows out of ' + (data.length - 1) + ' total rows.\n\nRemove them?',
    SpreadsheetApp.getUi().ButtonSet.YES_NO
  );

  if (response !== SpreadsheetApp.getUi().Button.YES) return;

  // Delete from bottom to top to preserve row numbers
  for (var r = rowsToDelete.length - 1; r >= 0; r--) {
    sheet.deleteRow(rowsToDelete[r]);
  }

  SpreadsheetApp.getUi().alert('\u2705 Cleanup Complete', 'Removed ' + rowsToDelete.length + ' duplicate equipment issue rows.', SpreadsheetApp.getUi().ButtonSet.OK);
  Logger.log('cleanupDuplicateEquipmentNeeds: Removed ' + rowsToDelete.length + ' duplicates');
}

/**
 * Removes "false positive" rows from Safety Equipment Needs sheet.
 * These are rows where the Equipment Type passed its check (Good Condition = Yes)
 * but the parser incorrectly captured Trucks section content as an actionable comment.
 * Indicators: description starts with "Barriers - Note:", "Cones - Note:", etc.
 * AND the notes/description contains truck section keywords like "Wipers:", "Horn:", etc.
 *
 * Also offered as a manual cleanup for stale/incorrect rows.
 * Menu: Glove Manager → 🛡️ Process Safety Emails → 🧹 Cleanup → Remove False Positive Rows
 */
function cleanupFalsePositiveEquipmentNeeds() {
  var sheet = getSafetyEquipmentSheet();
  if (!sheet || sheet.getLastRow() < 2) {
    SpreadsheetApp.getUi().alert('\u2139\uFE0F No Data', 'Safety Equipment Needs sheet is empty.', SpreadsheetApp.getUi().ButtonSet.OK);
    return;
  }

  var data = sheet.getDataRange().getValues();
  var rowsToDelete = [];

  // Truck section keywords that indicate the parser grabbed the wrong section
  var truckKeywords = /Wipers:|Horn:|Heater:|Seat Belt|Warning Light|Wheel chocks:|Reflectors:|Are the following in good repair/i;

  for (var i = 1; i < data.length; i++) {
    var equipType = String(data[i][5] || '').trim();
    var description = String(data[i][6] || '').trim();
    var notes = String(data[i][10] || '').trim();

    // Flag rows where the description is a "Note:" for an equipment that passed (Good Condition = Yes)
    // AND the note content contains truck section data (garbage content)
    var isNoteRow = /\s*-\s*Note\s*:/i.test(description);
    var hasTruckContent = truckKeywords.test(description) || truckKeywords.test(notes);

    if (isNoteRow && hasTruckContent) {
      Logger.log('False positive row at ' + (i + 1) + ': ' + equipType + ' - ' + description.substring(0, 60));
      rowsToDelete.push(i + 1); // 1-based row number
    }
  }

  if (rowsToDelete.length === 0) {
    SpreadsheetApp.getUi().alert('\u2705 No False Positives', 'No false positive equipment rows found. The sheet looks clean.', SpreadsheetApp.getUi().ButtonSet.OK);
    return;
  }

  var response = SpreadsheetApp.getUi().alert(
    '\uD83E\uDDF9 Remove False Positive Rows',
    'Found ' + rowsToDelete.length + ' rows where equipment passed its check but the parser\n' +
    'incorrectly captured Trucks section content as an actionable comment.\n\n' +
    'These are NOT real equipment issues. Remove them?',
    SpreadsheetApp.getUi().ButtonSet.YES_NO
  );

  if (response !== SpreadsheetApp.getUi().Button.YES) return;

  // Delete from bottom to top to preserve row numbers
  for (var r = rowsToDelete.length - 1; r >= 0; r--) {
    sheet.deleteRow(rowsToDelete[r]);
  }

  SpreadsheetApp.getUi().alert('\u2705 Cleanup Complete',
    'Removed ' + rowsToDelete.length + ' false positive equipment rows.\n\n' +
    'These emails will be re-evaluated on the next "Process Safety Emails" run to detect\n' +
    'any real issues (AED, Hot Sticks, Misc Comments) that were missed.',
    SpreadsheetApp.getUi().ButtonSet.OK);
  Logger.log('cleanupFalsePositiveEquipmentNeeds: Removed ' + rowsToDelete.length + ' false positive rows');
}

/**
 * Creates Manual Tasks from Safety Reports with "Needs Attention" status
 * Menu function: Glove Manager → Safety → Create Tasks from Issues
 */
function createTasksFromSafetyIssues() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var safetySheet = getSafetyEquipmentSheet();

  if (!safetySheet || safetySheet.getLastRow() < 2) {
    Browser.msgBox('\u26A0\uFE0F No Safety Reports',
      'The Safety Equipment Needs sheet is empty or does not exist.\\n\\nRun "Process Safety Emails" first to populate the sheet.',
      Browser.Buttons.OK);
    return;
  }

  var taskSheet = ss.getSheetByName("Task Metadata");
  if (!taskSheet) {
    Browser.msgBox('\u26A0\uFE0F Task Metadata Not Found',
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
      'Safety Equipment Needs',         // SourceSheet (renamed from "Safety Reports" Feb 2026)
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
    Browser.msgBox('\u2705 Tasks Created',
      'Created ' + tasksCreated + ' task(s) from Safety Reports with "Needs Attention" status.',
      Browser.Buttons.OK);
  } else {
    Browser.msgBox('ℹ\uFE0F No New Tasks',
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
    'This will:\\n\u2022 Sync completed Safety Equipment tasks to Safety Reports\\n\u2022 Recalculate current week compliance\\n\\nPlease wait...',
    ui.ButtonSet.OK);

  var syncCount = 0;

  // Sync completed Safety Equipment tasks to Safety Equipment Needs sheet
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var taskSheet = ss.getSheetByName("Task Metadata");
  var safetySheet = getSafetyEquipmentSheet();

  if (taskSheet && safetySheet) {
    var taskData = taskSheet.getDataRange().getValues();
    var safetyData = safetySheet.getDataRange().getValues();

    // Find Resolved On column
    var safetyHeaders = safetyData[0];
    var resolvedOnColIdx = -1;
    for (var rh = 0; rh < safetyHeaders.length; rh++) {
      if (String(safetyHeaders[rh]).toLowerCase().trim() === 'resolved on') {
        resolvedOnColIdx = rh;
        break;
      }
    }

    for (var t = 1; t < taskData.length; t++) {
      var taskId = String(taskData[t][0] || '').trim();
      var sourceSheet = String(taskData[t][1] || '').trim();
      var status = String(taskData[t][14] || '').trim(); // Status column (O = 15, 0-indexed = 14)
      var completedDate = taskData[t][21]; // CompletedDate column (V = 22, 0-indexed = 21)

      // Check for all formats: "SafetyReports_", "Safety Reports_", and "Safety Equipment Needs_"
      var isSafetyReportsTask = (taskId.indexOf('SafetyReports_') === 0 || taskId.indexOf('Safety Reports_') === 0 || taskId.indexOf('Safety Equipment Needs_') === 0) ||
        (sourceSheet === 'Safety Equipment Needs' || sourceSheet === 'Safety Reports');
      if (!isSafetyReportsTask) continue;
      if (status !== 'Complete' && status !== 'Completed' && !completedDate) continue;

      // Extract source row safely
      var sourceRow = parseInt(taskData[t][2]); // Column C = SourceRow (0-indexed = 2)
      if (isNaN(sourceRow) || sourceRow < 1) {
        sourceRow = extractSourceRowFromTaskKey(taskId);
      }

      if (sourceRow > 0 && sourceRow <= safetyData.length) {
        var rowIdx = sourceRow - 1; // Convert to 0-based for safetyData array
        var currentStatus = String(safetyData[rowIdx][7] || '').trim(); // Status column (H = 8, 0-indexed = 7)
        if (currentStatus !== 'Resolved') {
          safetySheet.getRange(sourceRow, 8).setValue('Resolved');
          if (resolvedOnColIdx >= 0) {
            safetySheet.getRange(sourceRow, resolvedOnColIdx + 1).setValue(completedDate || new Date());
          }
          syncCount++;
        }
      }
    }

    // REVERSE SYNC: If Safety Equipment Needs row is Resolved, mark corresponding Task Metadata task as Complete
    for (var s = 1; s < safetyData.length; s++) {
      var sStatus = String(safetyData[s][7] || '').trim();
      if (sStatus === 'Resolved') {
        var sRow = s + 1;
        var sResolvedOn = resolvedOnColIdx >= 0 ? safetyData[s][resolvedOnColIdx] : new Date();
        for (var t2 = 1; t2 < taskData.length; t2++) {
          var t2SourceSheet = String(taskData[t2][1] || '').trim();
          var t2SourceRow = parseInt(taskData[t2][2]);
          var t2TaskId = String(taskData[t2][0] || '').trim();
          if ((t2SourceSheet === 'Safety Equipment Needs' || t2SourceSheet === 'Safety Reports') &&
              (t2SourceRow === sRow || extractSourceRowFromTaskKey(t2TaskId) === sRow)) {
            var t2Status = String(taskData[t2][14] || '').trim();
            if (t2Status !== 'Complete' && t2Status !== 'Completed') {
              taskSheet.getRange(t2 + 1, 15).setValue('Complete'); // Status (O)
              taskSheet.getRange(t2 + 1, 22).setValue(sResolvedOn || new Date()); // CompletedDate (V)
              syncCount++;
            }
          }
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

  ui.alert('\u2705 Refresh Complete',
    'Safety sheets refreshed:\\n\u2022 Synced ' + syncCount + ' completed task(s) to Safety Reports\\n\u2022 Recalculated current week compliance',
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

  var sourceRow = extractSourceRowFromTaskKey(taskKey);
  if (sourceRow < 1) {
    Logger.log('syncSafetyReportCompletion: Could not extract row index from taskKey=' + taskKey);
    return { synced: false, message: 'Invalid taskKey format' };
  }

  var safetySheet = getSafetyEquipmentSheet();

  if (!safetySheet) {
    Logger.log('syncSafetyReportCompletion: Safety Equipment Needs sheet not found');
    return { synced: false, message: 'Safety Equipment Needs sheet not found' };
  }

  var lastRow = safetySheet.getLastRow();
  if (sourceRow > lastRow) {
    Logger.log('syncSafetyReportCompletion: Row ' + sourceRow + ' is beyond last row ' + lastRow);
    return { synced: false, message: 'Row out of range' };
  }

  // Find Resolved On column
  var headers = safetySheet.getRange(1, 1, 1, safetySheet.getLastColumn()).getValues()[0];
  var resolvedOnCol = -1;
  for (var h = 0; h < headers.length; h++) {
    if (String(headers[h]).toLowerCase().trim() === 'resolved on') {
      resolvedOnCol = h + 1;
      break;
    }
  }

  // Get current status (column H = 8)
  var statusCell = safetySheet.getRange(sourceRow, 8);
  var currentStatus = String(statusCell.getValue() || '').trim();

  if (currentStatus === 'Resolved') {
    Logger.log('syncSafetyReportCompletion: Row ' + sourceRow + ' already Resolved');
    if (resolvedOnCol > 0 && !safetySheet.getRange(sourceRow, resolvedOnCol).getValue()) {
      safetySheet.getRange(sourceRow, resolvedOnCol).setValue(new Date());
    }
    return { synced: true, message: 'Already resolved' };
  }

  // Update to Resolved
  statusCell.setValue('Resolved');
  if (resolvedOnCol > 0) {
    safetySheet.getRange(sourceRow, resolvedOnCol).setValue(new Date());
  }
  Logger.log('syncSafetyReportCompletion: Updated row ' + sourceRow + ' to Resolved');

  return { synced: true, message: 'Updated to Resolved' };
}

/**
ddd/**
ddd/**
 * Adds "Resolved On" column to existing Safety Equipment Needs sheet if missing.
 * Run once to migrate existing sheets.
 */
function addResolvedOnColumn() {
  var sheet = getSafetyEquipmentSheet();
  if (!sheet) {
    SpreadsheetApp.getUi().alert('Safety Equipment Needs sheet not found');
    return;
  }

  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  for (var h = 0; h < headers.length; h++) {
    if (String(headers[h]).toLowerCase().trim() === 'resolved on') {
      SpreadsheetApp.getUi().alert('Resolved On column already exists (column ' + (h + 1) + ')');
      return;
    }
  }

  // Add header in next available column
  var newCol = headers.length + 1;
  sheet.getRange(1, newCol).setValue('Resolved On')
    .setFontWeight('bold')
    .setBackground('#4A86E8')
    .setFontColor('white');
  sheet.setColumnWidth(newCol, 120);

  // Format as date for existing rows
  if (sheet.getLastRow() > 1) {
    sheet.getRange(2, newCol, sheet.getLastRow() - 1, 1).setNumberFormat('MM/dd/yyyy');
  }

  SpreadsheetApp.getUi().alert('\u2705 Added "Resolved On" column (column ' + newCol + ') to Safety Equipment Needs sheet');
}

/**
 * Adds conditional formatting to grey out rows where Status = "Resolved"
 * Can be called on existing sheets to add the formatting
 * @param {Sheet} sheet - Optional sheet parameter, defaults to Safety Reports
 */
function addResolvedRowFormatting(sheet) {
  if (!sheet) {
    sheet = getSafetyEquipmentSheet();
    if (!sheet) {
      Logger.log("Safety Equipment Needs sheet not found");
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
  SpreadsheetApp.getUi().alert("\u2705 Resolved row formatting added!\n\nRows with Status = 'Resolved' will now appear in light grey.");
}

/**
 * Migration function to add "Received Date" column to existing Safety Reports sheet
 * This column stores when the email was actually received (separate from Report Date which is the work date)
 * Run this once to update existing sheets.
 */
function addReceivedDateColumnToSafetyReports() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = getSafetyEquipmentSheet();

  if (!sheet) {
    SpreadsheetApp.getUi().alert("\u274C Safety Equipment Needs sheet not found.\n\nPlease run 'Setup Safety Reports Sheet' first.");
    return;
  }

  // Check if column already exists
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var receivedDateExists = headers.some(function(h) {
    return String(h).toLowerCase().trim() === 'received date';
  });

  if (receivedDateExists) {
    SpreadsheetApp.getUi().alert("\u2705 'Received Date' column already exists in Safety Reports sheet.");
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

  SpreadsheetApp.getUi().alert("\u2705 'Received Date' column added to Safety Reports sheet!\n\nNew emails processed will now store the date the email was received separately from the Report Date.");
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
function processSafetyEmails(daysBack, batchSize, newOnlyMode, skipPdfExtraction, endDate, reportTypeFilter) {
  if (!daysBack) daysBack = 7;
  if (!batchSize) batchSize = 5; // REDUCED from 10 to 5 for better timeout handling
  if (newOnlyMode === undefined) newOnlyMode = true; // Default to new-only mode
  if (skipPdfExtraction === undefined) skipPdfExtraction = false; // Default to extracting PDFs
  if (!reportTypeFilter) reportTypeFilter = 'ALL';

  // Read batch state FIRST so we can skip expensive init on continuation batches
  var props = PropertiesService.getScriptProperties();
  var batchStart = parseInt(props.getProperty('SAFETY_BATCH_START') || '0');
  var isFirstBatch = (batchStart === 0);
  var batchCache = CacheService.getScriptCache();

  // Store skipPdfExtraction in script properties so parseSafetyEmail can access it
  props.setProperty('SKIP_PDF_EXTRACTION', skipPdfExtraction ? 'true' : 'false');

  if (isFirstBatch) {
    // Clear all execution-level caches at the start of this top-level entry point
    clearComplianceConfigCache();
    // Clear batch caches from any previous run
    batchCache.removeAll(['SAFETY_BATCH_CREWS', 'SAFETY_BATCH_EMP_DATA', 'SAFETY_BATCH_EMAIL_IDS']);

    // === SYNC CREWS (replaces old auto-populate Config) ===
    // Ensures any new crews from Employees sheet are added to Job Tracking before processing
    // This runs silently without alerts
    var configResult = populateComplianceConfigSilent();
    if (configResult.added > 0) {
      Logger.log("processSafetyEmails: syncCrews added " + configResult.added + " new crews to Job Tracking");
    }
  } else {
    Logger.log('Continuation batch ' + (Math.floor(batchStart / batchSize) + 1) + ' - skipping syncCrews and sheet init');
  }

  var startTime = new Date().getTime(); // Track execution time

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = getSafetyEquipmentSheet();
  if (!sheet) {
    // Auto-create the sheet
    Logger.log("Safety Equipment Needs sheet not found - creating it now");
    setupSafetyReportsSheet();
    sheet = getSafetyEquipmentSheet();
    if (!sheet) {
      Browser.msgBox("\u274C Failed to create Safety Equipment Needs sheet.");
      return { complete: true, error: "Failed to create sheet" };
    }
  }


  // Get last processed date for smart filtering
  var lastProcessedDate = props.getProperty('LAST_SAFETY_EMAIL_DATE');
  var dateFilter = '';

  // Parse optional endDate
  var formattedEndDate = '';
  if (endDate && typeof endDate === 'string') {
    var endParts = endDate.split(/[\-\/]/);
    if (endParts.length === 3) {
      try {
        var parsedEndDate = new Date(endDate.replace(/\//g, '-'));
        if (!isNaN(parsedEndDate.getTime())) {
          // Go forward 1 day to ensure it's inclusive of the end date (Gmail's before: is exclusive)
          parsedEndDate.setDate(parsedEndDate.getDate() + 1);
          formattedEndDate = Utilities.formatDate(parsedEndDate, Session.getScriptTimeZone(), 'yyyy/MM/dd');
        }
      } catch (e) {
        Logger.log('Error parsing endDate: ' + e);
      }
    }
  }

  // Parse if daysBack is a date string (YYYY-MM-DD or MM/DD/YYYY)
  var isDateStr = false;
  var formattedFilterDate = '';
  var startLimit = null;
  var endLimit = null;
  if (typeof daysBack === 'string') {
    var dateParts = daysBack.split(/[\-\/]/);
    if (dateParts.length === 3) {
      try {
        var parsedDate = new Date(daysBack.replace(/\//g, '-'));
        if (!isNaN(parsedDate.getTime())) {
          isDateStr = true;
          // Go back 1 day to ensure it's inclusive of the start date (Gmail's after: is exclusive)
          parsedDate.setDate(parsedDate.getDate() - 1);
          formattedFilterDate = Utilities.formatDate(parsedDate, Session.getScriptTimeZone(), 'yyyy/MM/dd');
          
          // Parse start and end limit dates timezone-safely
          startLimit = parseLocalDate(daysBack, false);
          if (endDate) {
            endLimit = parseLocalDate(endDate, true);
          }
          Logger.log('Date limits parsed: startLimit=' + startLimit + ', endLimit=' + endLimit);
        }
      } catch (e) {
        Logger.log('Error parsing daysBack as date: ' + e);
      }
    }
  }

  // On continuation batches, restore the SAME dateFilter used by batch 1
  // This prevents the thread list from changing between batches (41 vs 72 threads)
  if (!isFirstBatch) {
    var cachedDateFilter = props.getProperty('SAFETY_BATCH_DATE_FILTER');
    var cachedReportTypeFilter = props.getProperty('SAFETY_BATCH_REPORT_TYPE_FILTER');
    if (cachedDateFilter) {
      dateFilter = cachedDateFilter;
      Logger.log('Continuation batch: restored dateFilter from batch 1: ' + dateFilter);
    } else {
      // Fallback if cache was lost
      if (isDateStr) {
        dateFilter = ' after:' + formattedFilterDate;
      } else {
        dateFilter = ' newer_than:' + daysBack + 'd';
      }
      Logger.log('Continuation batch: no cached dateFilter, using fallback: ' + dateFilter);
    }
    if (cachedReportTypeFilter) {
      reportTypeFilter = cachedReportTypeFilter;
    }
  } else {
    if (reportTypeFilter) {
      props.setProperty('SAFETY_BATCH_REPORT_TYPE_FILTER', reportTypeFilter);
    }
    if (newOnlyMode && lastProcessedDate) {
      // Use after: filter to only get emails newer than last processed
      // Format: YYYY/MM/DD
      // IMPORTANT: Go back 14 days prior to lastProcessedDate so un-logged emails from prior days
      // are not permanently skipped if LAST_SAFETY_EMAIL_DATE was set on a day with no new emails.
      // Duplicate prevention via memory-cached existingEmailIds handles already-logged emails instantly.
      var lastDate = new Date(lastProcessedDate.replace(/\//g, '-'));
      lastDate.setDate(lastDate.getDate() - 14); // 14-day safety window
      var filterDate = Utilities.formatDate(lastDate, Session.getScriptTimeZone(), 'yyyy/MM/dd');
      dateFilter = ' after:' + filterDate;
      Logger.log('New-only mode: filtering emails after ' + filterDate + ' (14-day safety window from last processed: ' + lastProcessedDate + ')');
      // Save dateFilter for continuation batches so thread list stays consistent
      props.setProperty('SAFETY_BATCH_DATE_FILTER', dateFilter);
    } else {
      // Use the explicit day range or start date specified by user
      if (isDateStr) {
        dateFilter = ' after:' + formattedFilterDate;
        if (formattedEndDate) {
          dateFilter += ' before:' + formattedEndDate;
          Logger.log('Date range mode: filtering emails between ' + formattedFilterDate + ' and ' + formattedEndDate + ' (inclusive)');
        } else {
          Logger.log('Date range mode: filtering emails after ' + formattedFilterDate + ' (inclusive of start date: ' + daysBack + ')');
        }
      } else {
        dateFilter = ' newer_than:' + daysBack + 'd';
        Logger.log('Date range mode: filtering emails from last ' + daysBack + ' days');
      }
      // Save dateFilter for continuation batches so thread list stays consistent
      props.setProperty('SAFETY_BATCH_DATE_FILTER', dateFilter);
    }
  }

  // Search queries for different report types
  // Search by subject only (works for both original and forwarded emails)
  var baseQueries = [];
  if (!reportTypeFilter || reportTypeFilter === 'ALL') {
    baseQueries = [
      'subject:"Job Hazard Report"',
      'subject:"Safety Meeting Report"',
      'subject:"Safety Checklist Report"',
      'subject:"Safety Check List Report"'
    ];
  } else if (reportTypeFilter === 'JHA') {
    baseQueries = [
      'subject:"Job Hazard Report"'
    ];
  } else if (reportTypeFilter === 'WEEKLY') {
    baseQueries = [
      'subject:"Safety Meeting Report"'
    ];
  } else if (reportTypeFilter === 'MONTHLY') {
    baseQueries = [
      'subject:"Safety Checklist Report"',
      'subject:"Safety Check List Report"'
    ];
  }

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
      var threads = [];
      if (!newOnlyMode) {
        // Paged search to overcome GmailApp's default 500-thread search limit during full reprocesses
        var start = 0;
        var pageSize = 500;
        var page;
        do {
          page = GmailApp.search(query, start, pageSize);
          threads = threads.concat(page);
          start += pageSize;
        } while (page.length === pageSize && threads.length < 3000);
      } else {
        // Single search for normal fast daily processing
        threads = GmailApp.search(query);
      }
      allThreads = allThreads.concat(threads);
      Logger.log("Query: " + query + " - Found " + threads.length + " threads");
    } catch (e) {
      Logger.log("Error with query: " + query + " - " + e.toString());
    }
  });

  Logger.log("Total threads found: " + allThreads.length);

  if (allThreads.length === 0) {
    props.deleteProperty('SAFETY_BATCH_START');
    props.deleteProperty('SAFETY_BATCH_DATE_FILTER');
    batchCache.removeAll(['SAFETY_BATCH_CREWS', 'SAFETY_BATCH_EMP_DATA', 'SAFETY_BATCH_EMAIL_IDS']);

    // Still run compliance calculation to ensure current/previous weeks are created
    // This is important when no new emails exist but we need to show the week
    Logger.log("No threads found, but still ensuring weeks exist in compliance sheet...");
    try {
      var today = new Date();
      var currentWeekBounds = getWeekBoundaries(today);

      // Process previous week
      var previousWeekStart = new Date(currentWeekBounds.weekStart);
      previousWeekStart.setDate(previousWeekStart.getDate() - 7);
      var previousWeekBounds = getWeekBoundaries(previousWeekStart);
      var previousWeekData = calculateComplianceFromLogs(previousWeekBounds.weekStart);
      if (previousWeekData) {
        updateComplianceSheetFromLogs(previousWeekData);
        createMissingReportTasks(previousWeekData);
      }

      // Process current week
      var complianceData = calculateComplianceFromLogs(currentWeekBounds.weekStart);
      if (complianceData) {
        updateComplianceSheetFromLogs(complianceData);
      }

      formatComplianceSheetByWeek();
      Logger.log("Compliance weeks ensured even with no new emails");
    } catch (e) {
      Logger.log("Error ensuring weeks exist: " + e.toString());
    }

    var periodStr = isDateStr ? "since " + daysBack : "in the last " + daysBack + " days";
    Browser.msgBox("No NEW safety emails found " + periodStr + ".\n\nAll emails in this period have already been processed. Safety Compliance sheet has been updated.");
    return { complete: true, totalThreads: 0, message: "No new emails found - all already processed" };
  }

  // Get existing email IDs to avoid duplicates - load from ALL log sheets
  // This is critical for performance: pre-load once, check in memory, avoid repeated sheet reads
  var existingEmailIds = {};
  var emailIdsLoadedFromCache = false;

  // On continuation batches, try loading from CacheService first (avoids sheet reads)
  if (!isFirstBatch) {
    var cachedEmailIds = batchCache.get('SAFETY_BATCH_EMAIL_IDS');
    if (cachedEmailIds) {
      try {
        existingEmailIds = JSON.parse(cachedEmailIds);
        emailIdsLoadedFromCache = true;
        Logger.log("Loaded " + Object.keys(existingEmailIds).length + " email IDs from batch cache");
      } catch(e) {
        Logger.log("Email ID cache parse error, falling back to sheet reads");
      }
    }
  }

  if (!emailIdsLoadedFromCache) {
    // IMPORTANT: existingEmailIds is used to decide whether to SKIP an email entirely (skip parseSafetyEmail
    // and logParsedSafetyEmail). It must ONLY be built from the audit log sheets (JHA Log, Weekly Safety Log,
    // Monthly Checklist Log). Do NOT include Safety Equipment Needs here — equipment issue emails having their
    // ID in col J does NOT mean the JHA was logged. Including Safety Equipment Needs caused emails that had
    // equipment issues to be skipped on subsequent runs, preventing JHA Log entries from ever being written.
    // Equipment issues have their own independent content+email-key dedup when written to the sheet.

    // Load from JHA Log sheet (column F)
    var jhaLogSheet = getJHALogSheet();
    if (jhaLogSheet && jhaLogSheet.getLastRow() > 1) {
      var jhaEmailIds = jhaLogSheet.getRange(2, 6, jhaLogSheet.getLastRow() - 1, 1).getValues();
      for (var j = 0; j < jhaEmailIds.length; j++) {
        if (jhaEmailIds[j][0]) {
          existingEmailIds[String(jhaEmailIds[j][0]).split('_')[0]] = true; // base ID (strip _0, _1 suffixes)
          existingEmailIds[String(jhaEmailIds[j][0])] = true;               // exact ID too
        }
      }
    }

    // Load from Weekly Safety Log sheet (column F)
    var weeklyLogSheet = getWeeklySafetyLogSheet();
    if (weeklyLogSheet && weeklyLogSheet.getLastRow() > 1) {
      var weeklyEmailIds = weeklyLogSheet.getRange(2, 6, weeklyLogSheet.getLastRow() - 1, 1).getValues();
      for (var k = 0; k < weeklyEmailIds.length; k++) {
        if (weeklyEmailIds[k][0]) {
          existingEmailIds[String(weeklyEmailIds[k][0])] = true;
        }
      }
    }

    // Load from Monthly Checklist Log sheet (column G)
    var monthlyLogSheet = getMonthlyChecklistLogSheet();
    if (monthlyLogSheet && monthlyLogSheet.getLastRow() > 1) {
      var monthlyEmailIds = monthlyLogSheet.getRange(2, 7, monthlyLogSheet.getLastRow() - 1, 1).getValues();
      for (var m = 0; m < monthlyEmailIds.length; m++) {
        if (monthlyEmailIds[m][0]) {
          existingEmailIds[String(monthlyEmailIds[m][0])] = true;
        }
      }
    }

    Logger.log("Pre-loaded " + Object.keys(existingEmailIds).length + " existing email IDs from log sheets (JHA, Weekly Safety, Monthly Checklist)");
  }

  // Process only this batch
  var batchEnd = Math.min(batchStart + batchSize, allThreads.length);
  var batchThreads = allThreads.slice(batchStart, batchEnd);

  // Time tracking - stop 30 seconds before the 6-minute limit
  var MAX_EXECUTION_MS = 5.5 * 60 * 1000; // 5.5 minutes = 330 seconds
  var timedOut = false;

  // === OPTION B: Build job resolution context for logging ===
  // This allows us to resolve jobs to tracked crews as we process emails
  // On continuation batches, use cached data to avoid redundant Employees + Job Tracking sheet reads
  var crews, employeeData;

  if (!isFirstBatch) {
    var cachedCrews = batchCache.get('SAFETY_BATCH_CREWS');
    var cachedEmpData = batchCache.get('SAFETY_BATCH_EMP_DATA');
    if (cachedCrews && cachedEmpData) {
      try {
        crews = JSON.parse(cachedCrews);
        employeeData = JSON.parse(cachedEmpData);
        Logger.log("Loaded " + crews.length + " active crews and " + employeeData.length + " employee rows from batch cache");
      } catch(e) {
        Logger.log("Batch cache parse error, falling back to sheet reads");
        crews = null;
      }
    }
  }

  if (!crews) {
    crews = getActiveCrews();
    var empSheet = ss.getSheetByName('Employees');
    employeeData = empSheet ? empSheet.getDataRange().getValues() : [];
    // Cache for continuation batches (10 min TTL)
    try {
      batchCache.put('SAFETY_BATCH_CREWS', JSON.stringify(crews), 600);
      batchCache.put('SAFETY_BATCH_EMP_DATA', JSON.stringify(employeeData), 600);
    } catch(e) {
      Logger.log("Could not cache batch data: " + e.toString());
    }
  }

  var trackedCrews = {};
  for (var ci = 0; ci < crews.length; ci++) {
    trackedCrews[crews[ci]] = true;
  }

  // Always reload custom mappings (they can change between batches if user assigns unknown jobs)
  var customMappings = getCustomJobForemanMappings() || {};

  var jobResolutionContext = {
    trackedCrews: trackedCrews,
    customMappings: customMappings,
    employeeData: employeeData
  };

  // Auto-cleanup old log entries (>90 days) on first batch of normal runs only.
  // Skipping cleanup during historical reprocesses prevents deleting the data we are trying to rebuild.
  if (batchStart === 0 && newOnlyMode) {
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
      var rowsCollector = [];

      // Track skip reasons for UI display
      var skipReasons = {
        alreadyLogged: 0,    // Email ID already in log sheets
        logDuplicate: 0,     // logParsedSafetyEmail returned duplicate
        parseFailed: 0,      // parseSafetyEmail returned null
        userSkipped: 0,      // Job was previously skipped by user
        unknownJob: 0,       // Job not found in Employees sheet
        noJobNumber: 0       // No job number could be extracted
      };

      for (var tidx = 0; tidx < batchThreads.length && !timedOut; tidx++) {
        var thread = batchThreads[tidx];
        var messages = thread.getMessages();

        for (var midx = 0; midx < messages.length && !timedOut; midx++) {
          var message = messages[midx];
          var messageId = message.getId();

          // Check time remaining - if under 30 seconds, stop processing
          var elapsedMs = new Date().getTime() - startTime;
          if (elapsedMs > MAX_EXECUTION_MS) {
            Logger.log("\u23F1\uFE0F Timeout prevention: Stopping after " + Math.round(elapsedMs/1000) + " seconds to avoid 6-minute limit");
            timedOut = true;
            break;
          }

          // Skip if already processed
          if (existingEmailIds[messageId]) {
            skippedCount++;
            skipReasons.alreadyLogged++;
            continue;
          }

          // Skip if message date is outside range when filtering by explicit date range
          if (isDateStr) {
            var msgDate = message.getDate();
            if (startLimit && msgDate < startLimit) {
              skippedCount++;
              continue;
            }
            if (endLimit && msgDate > endLimit) {
              skippedCount++;
              continue;
            }
          }

          var parsed = parseSafetyEmail(message, skipPdfExtraction);
          lastProcessedIndex = tidx;
          if (parsed) {
            // === OPTION B: Log to audit trail sheets ===
            // This creates a complete audit trail in JHA Log, Weekly Safety Log, Monthly Checklist Log
            // Pass existingEmailIds for fast duplicate check and to track newly logged items
            var logResult = logParsedSafetyEmail(parsed, message, jobResolutionContext, existingEmailIds, rowsCollector);
            if (logResult.logged) {
              if (logResult.logSheet === JHA_LOG_SHEET_NAME) logsCreated.jha++;
              else if (logResult.logSheet === WEEKLY_SAFETY_LOG_SHEET_NAME) logsCreated.weekly++;
              else if (logResult.logSheet === MONTHLY_CHECKLIST_LOG_SHEET_NAME) logsCreated.monthly++;
              // Mark this email as processed to avoid re-processing in subsequent batches
              existingEmailIds[messageId] = true;
            } else if (logResult.reason === 'duplicate') {
              skippedCount++;
              skipReasons.logDuplicate++;
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
                skipReasons.unknownJob++;
              }
              skippedCount++;
            } else if (parsed.skippedReason === "User skipped") {
              // User already decided to skip this job - log it but don't prompt again
              Logger.log("Silently skipping user-skipped job: " + (parsed.reportMeta ? parsed.reportMeta.jobNumber : 'unknown'));
              skippedCount++;
              skipReasons.userSkipped++;
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
          } else {
            // parseSafetyEmail returned null - not a valid safety email format
            skippedCount++;
            skipReasons.parseFailed++;
          }
        } // end messages loop
      } // end threads loop

      // If we timed out, save progress and return early
      if (timedOut) {
        writeCollectedSafetyLogs(rowsCollector);
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
          skipReasons: skipReasons,
          issuesThisBatch: issues.length,
          totalThreads: allThreads.length,
          threadsProcessed: actualProcessed,
          threadsRemaining: allThreads.length - actualProcessed,
          elapsedSeconds: Math.round((new Date().getTime() - startTime) / 1000),
          message: "Stopping to prevent timeout. Click 'Continue Processing' to resume."
        };
      }

      // Bypassed: Let email processing run to completion without intermediate user prompting.
      // Unknown and uncredited jobs will be handled at the end of the run in the scrollable assignment section.
      /*
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
          skipReasons: skipReasons,
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
          skippedThisBatch: skippedCount,
          skipReasons: skipReasons,
          issuesThisBatch: issues.length,
          complianceRecordsCount: complianceRecords.length
        };
      }
      */

      // Write equipment issues to sheet (NOT compliance records - those go only to Safety Compliance sheet)
      // De-duplicate using BOTH email-ID-based AND content-based keys
      // Content key (date + vehicle + job + equipType + desc) catches duplicates from different email messages
      if (issues.length > 0) {
        var sheetData = sheet.getDataRange().getValues();
        var existingEmailKeys = {};
        var existingContentKeys = {};
        for (var eiIdx = 1; eiIdx < sheetData.length; eiIdx++) {
          var eiEmailId = String(sheetData[eiIdx][9] || '');
          var eiEquipType = String(sheetData[eiIdx][5] || '');
          var eiDesc = String(sheetData[eiIdx][6] || '').substring(0, 50);
          if (eiEmailId) {
            existingEmailKeys[eiEmailId + '|' + eiEquipType + '|' + eiDesc] = true;
          }
          // Content-based key: date + vehicle + job + equipType + desc
          var eiDateStr = '';
          try {
            var eiDate = sheetData[eiIdx][0];
            if (eiDate instanceof Date && !isNaN(eiDate.getTime())) {
              eiDateStr = Utilities.formatDate(eiDate, Session.getScriptTimeZone(), 'yyyy-MM-dd');
            }
          } catch (e) { eiDateStr = ''; }
          var eiVehicle = String(sheetData[eiIdx][4] || '').trim();
          var eiJob = String(sheetData[eiIdx][2] || '').trim();
          existingContentKeys[eiDateStr + '|' + eiVehicle + '|' + eiJob + '|' + eiEquipType + '|' + eiDesc] = true;
        }
        var dedupedIssues = [];
        for (var diIdx = 0; diIdx < issues.length; diIdx++) {
          var diEmailId = String(issues[diIdx][9] || '');
          var diEquipType = String(issues[diIdx][5] || '');
          var diDesc = String(issues[diIdx][6] || '').substring(0, 50);
          var emailKey = diEmailId + '|' + diEquipType + '|' + diDesc;

          // Build content key for this issue
          var diDateStr = '';
          try {
            var diDate = issues[diIdx][0];
            if (diDate instanceof Date && !isNaN(diDate.getTime())) {
              diDateStr = Utilities.formatDate(diDate, Session.getScriptTimeZone(), 'yyyy-MM-dd');
            }
          } catch (e) { diDateStr = ''; }
          var diVehicle = String(issues[diIdx][4] || '').trim();
          var diJob = String(issues[diIdx][2] || '').trim();
          var contentKey = diDateStr + '|' + diVehicle + '|' + diJob + '|' + diEquipType + '|' + diDesc;

          if (!existingEmailKeys[emailKey] && !existingContentKeys[contentKey]) {
            dedupedIssues.push(issues[diIdx]);
            existingEmailKeys[emailKey] = true;
            existingContentKeys[contentKey] = true;
          } else {
            Logger.log('Skipping duplicate equipment issue: ' + (existingEmailKeys[emailKey] ? 'email match' : 'content match') + ' - ' + contentKey);
          }
        }
        if (dedupedIssues.length > 0) {
          var lastRow = sheet.getLastRow();
          sheet.getRange(lastRow + 1, 1, dedupedIssues.length, 13).setValues(dedupedIssues);
          applyStatusFormatting(sheet, lastRow + 1, dedupedIssues.length);
        }
        if (dedupedIssues.length < issues.length) {
          Logger.log('Dedup: Wrote ' + dedupedIssues.length + ' issues, skipped ' + (issues.length - dedupedIssues.length) + ' duplicates');
        }
      }

      // NOTE: Compliance records (JHA/Safety Meeting tracking) are NO LONGER written to Safety Reports
      // JHA tracking is handled by the Safety Compliance sheet which shows the \u2705/\u274C grid per crew per day
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

      // Note: early exit removed. Gmail does NOT guarantee newest-first order — threads
      // for a given crew (e.g. 042-26) may appear later in the result set regardless of
      // date. Exiting early when a batch has 0 new emails causes those threads to be
      // silently missed. The timeout guard (MAX_EXECUTION_MS) is sufficient to prevent
      // the 6-minute limit from being hit.
      writeCollectedSafetyLogs(rowsCollector);

      Logger.log('Batch ' + (Math.floor(batchStart / batchSize) + 1) +
        ' processed ' + processedCount + ' new email(s), skipped ' + skippedCount + '.');

      // Cache email IDs for next continuation batch (includes newly logged IDs)
      try {
        batchCache.put('SAFETY_BATCH_EMAIL_IDS', JSON.stringify(existingEmailIds), 600);
      } catch(e) {
        Logger.log("Could not cache email IDs: " + e.toString());
      }

      if (isComplete) {
        props.deleteProperty('SAFETY_BATCH_START');
        props.deleteProperty('SAFETY_BATCH_DATE_FILTER');
        props.deleteProperty('SAFETY_BATCH_REPORT_TYPE_FILTER');
        // Clear batch caches - no longer needed
        batchCache.removeAll(['SAFETY_BATCH_CREWS', 'SAFETY_BATCH_EMP_DATA', 'SAFETY_BATCH_EMAIL_IDS']);

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

  var earlyExit = (isComplete && batchEnd < allThreads.length);
  var result = {
    complete: isComplete,
    earlyExit: earlyExit, // true when stopped early because continuation batch had 0 new emails
    batchNumber: Math.floor(batchStart / batchSize) + 1,
    totalBatches: Math.ceil(allThreads.length / batchSize),
    processedThisBatch: processedCount,
    skippedThisBatch: skippedCount,
    skipReasons: skipReasons, // Breakdown of why emails were skipped
    issuesThisBatch: issues.length,
    complianceRecordsAdded: complianceRecords.length,
    logsCreated: logsCreated, // Option B: show log counts
    totalThreads: allThreads.length,
    threadsProcessed: batchEnd,
    threadsRemaining: earlyExit ? 0 : (allThreads.length - batchEnd),
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

      // Auto-cleanup: Fix log entries and remove non-config crews (runs silently)
      // Pass true to skip syncCrews since we already ran it at the start of processSafetyEmails
      try {
        var cleanupResult = autoComplianceCleanup(true);
        Logger.log("Auto-cleanup complete - LogFixes: JHA=" + cleanupResult.logsFixes.jha +
                   ", Weekly=" + cleanupResult.logsFixes.weekly +
                   ", NonConfigRemoved=" + cleanupResult.nonConfigRemoved);
      } catch (cleanupErr) {
        Logger.log("Auto-cleanup error (non-fatal): " + cleanupErr.toString());
      }

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
            days['Mon'] || '\u23F3',
            days['Tue'] || '\u23F3',
            days['Wed'] || '\u23F3',
            days['Thu'] || '\u23F3',
            days['Fri'] || '\u23F3',
            days['Sat'] || 'N/A'
          ];
          result.compliance.crews.push({
            jobNumber: jobNumber,
            foreman: crew.foreman || '',
            jha: jhaArray,
            weeklyMeeting: crew.weeklyMeetingStatus || '\u23F3',
            monthlyChecklist: crew.monthlyChecklistStatus || '\u23F3',
            status: crew.status || 'Unassigned'
          });
        }

        // Combine uncredited jobs from both weeks (deduplicated)
        var allUncreditedJobs = {};

        // Add from current week
        Logger.log("Building uncreditedJobs - current week has " + (complianceData.uncreditedJobs ? complianceData.uncreditedJobs.length : 0) + " uncredited");
        Logger.log("Building uncreditedJobs - previous week has " + (previousWeekData && previousWeekData.uncreditedJobs ? previousWeekData.uncreditedJobs.length : 0) + " uncredited");

        if (complianceData.uncreditedJobs) {
          for (var ui = 0; ui < complianceData.uncreditedJobs.length; ui++) {
            var uj = complianceData.uncreditedJobs[ui];
            Logger.log("Current week uncredited job: " + uj.jobNumber + " with " + (uj.reports ? uj.reports.length : 0) + " reports");
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

      // Always set uncreditedJobs (empty array if none) so the UI always receives [] not undefined
      result.uncreditedJobs = uncreditedJobsList;
      if (uncreditedJobsList.length > 0) {
        Logger.log("Found " + uncreditedJobsList.length + " uncredited job(s) in Safety Reports not matched to any tracked crew");
        Logger.log("Uncredited jobs being returned to UI: " + JSON.stringify(uncreditedJobsList.map(function(j) { return j.jobNumber; })));
      } else {
        Logger.log("No uncredited jobs to return to UI (returning empty array)");
      }
      } // Close if (complianceData)

      Logger.log("Compliance tracking complete. Tasks created: " + tasksCreated);
    } catch (compError) {
      Logger.log("Error in compliance tracking: " + compError.toString());
      result.complianceError = compError.toString();
    }
  }

  // Only run post-processing steps (sorting/formatting/hyperlink backfill) when the 
  // entire processing run is complete. Skipping these on intermediate batches saves
  // a huge amount of time, reduces API calls, and avoids V8 INTERNAL engine crashes.
  var shouldRunPostProcessing = isComplete;

  if (shouldRunPostProcessing) {
    // Auto-apply Gmail hyperlinks to all Source Email ID cells so every row is clickable
    try {
      var linkCount = applySafetyEquipmentEmailLinksSilent();
      Logger.log("Gmail links applied to " + linkCount + " Source Email ID cells");
    } catch (linkErr) {
      Logger.log("Gmail link application error (non-fatal): " + linkErr.toString());
    }

    // Schedule Gmail link backfill to run in a fresh execution 2 minutes from now.
    // Done as a one-shot time trigger instead of inline because building 1000+ RichTextValue
    // objects in the same execution as heavy PDF OCR causes V8 INTERNAL memory errors.
    try {
      var existingTriggers = ScriptApp.getProjectTriggers();
      for (var ti = 0; ti < existingTriggers.length; ti++) {
        if (existingTriggers[ti].getHandlerFunction() === 'applyAllEmailLinksScheduled') {
          ScriptApp.deleteTrigger(existingTriggers[ti]);
        }
      }
      ScriptApp.newTrigger('applyAllEmailLinksScheduled')
        .timeBased()
        .after(2 * 60 * 1000) // 2 minutes
        .create();
      Logger.log("Gmail link backfill scheduled for 2 minutes from now");
    } catch (trigErr) {
      Logger.log("Could not schedule email link backfill (non-fatal): " + trigErr.toString());
    }

    // Auto-format JHA Log and Weekly Safety Log: sort by month desc → job number → date desc,
    // with blue separator rows between each month for easy visual scanning.
    try {
      sortAndFormatSafetyLogs(true); // silent = no alert
    } catch (fmtErr) {
      Logger.log("Log sheet formatting error (non-fatal): " + fmtErr.toString());
    }
  } else {
    Logger.log("Skipping post-processing (no new logs this batch, not final batch)");
  }

  return result;
}

/**
 * Shows dialog to process safety emails with custom date range and optional report type filter
 * @param {string} [reportTypeFilter] - Optional filter ('JHA', 'WEEKLY', 'MONTHLY', 'ALL')
 */
function showProcessSafetyEmailsDialog(reportTypeFilter) {
  var template = HtmlService.createTemplateFromFile('ProcessSafetyEmailsDialog');
  var filter = (typeof reportTypeFilter === 'string' && reportTypeFilter) ? reportTypeFilter : 'ALL';
  template.initialReportType = filter;
  var html = template.evaluate()
    .setWidth(550)
    .setHeight(700);
  var title = "Process Safety Emails";
  if (reportTypeFilter === 'JHA') title = "Process JHA Emails (Step 4)";
  else if (reportTypeFilter === 'WEEKLY') title = "Process Weekly Safety Emails (Step 5)";
  else if (reportTypeFilter === 'MONTHLY') title = "Process Monthly Checklist Emails (Step 6)";
  SpreadsheetApp.getUi().showModalDialog(html, title);
}

function showProcessJHAEmailsDialog() {
  showProcessSafetyEmailsDialog('JHA');
}

function showProcessWeeklySafetyEmailsDialog() {
  showProcessSafetyEmailsDialog('WEEKLY');
}

function showProcessMonthlyChecklistDialog() {
  showProcessSafetyEmailsDialog('MONTHLY');
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
  SpreadsheetApp.getUi().alert("\u2705 Saved job number corrections cleared.");
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
  var sheet = getSafetyEquipmentSheet();

  if (!sheet) {
    return { complete: true, error: "Safety Equipment Needs sheet not found" };
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

    // Write equipment issues to sheet (NOT compliance records) - with dedup
    // Uses BOTH email-ID-based AND content-based keys to catch all duplicates
    if (finalIssues.length > 0) {
      var sheetData = sheet.getDataRange().getValues();
      var existingEmailKeys = {};
      var existingContentKeys = {};
      for (var eiIdx = 1; eiIdx < sheetData.length; eiIdx++) {
        var eiEmailId = String(sheetData[eiIdx][9] || '');
        var eiEquipType = String(sheetData[eiIdx][5] || '');
        var eiDesc = String(sheetData[eiIdx][6] || '').substring(0, 50);
        if (eiEmailId) {
          existingEmailKeys[eiEmailId + '|' + eiEquipType + '|' + eiDesc] = true;
        }
        // Content-based key: date + vehicle + job + equipType + desc
        var eiDateStr = '';
        try {
          var eiDate = sheetData[eiIdx][0];
          if (eiDate instanceof Date && !isNaN(eiDate.getTime())) {
            eiDateStr = Utilities.formatDate(eiDate, Session.getScriptTimeZone(), 'yyyy-MM-dd');
          }
        } catch (e) { eiDateStr = ''; }
        var eiVehicle = String(sheetData[eiIdx][4] || '').trim();
        var eiJob = String(sheetData[eiIdx][2] || '').trim();
        existingContentKeys[eiDateStr + '|' + eiVehicle + '|' + eiJob + '|' + eiEquipType + '|' + eiDesc] = true;
      }
      var dedupedFinalIssues = [];
      for (var diIdx = 0; diIdx < finalIssues.length; diIdx++) {
        var diEmailId = String(finalIssues[diIdx][9] || '');
        var diEquipType = String(finalIssues[diIdx][5] || '');
        var diDesc = String(finalIssues[diIdx][6] || '').substring(0, 50);
        var emailKey = diEmailId + '|' + diEquipType + '|' + diDesc;

        var diDateStr = '';
        try {
          var diDate = finalIssues[diIdx][0];
          if (diDate instanceof Date && !isNaN(diDate.getTime())) {
            diDateStr = Utilities.formatDate(diDate, Session.getScriptTimeZone(), 'yyyy-MM-dd');
          }
        } catch (e) { diDateStr = ''; }
        var diVehicle = String(finalIssues[diIdx][4] || '').trim();
        var diJob = String(finalIssues[diIdx][2] || '').trim();
        var contentKey = diDateStr + '|' + diVehicle + '|' + diJob + '|' + diEquipType + '|' + diDesc;

        if (!existingEmailKeys[emailKey] && !existingContentKeys[contentKey]) {
          dedupedFinalIssues.push(finalIssues[diIdx]);
          existingEmailKeys[emailKey] = true;
          existingContentKeys[contentKey] = true;
        }
      }
      if (dedupedFinalIssues.length > 0) {
        var lastRow = sheet.getLastRow();
        sheet.getRange(lastRow + 1, 1, dedupedFinalIssues.length, 13).setValues(dedupedFinalIssues);
        applyStatusFormatting(sheet, lastRow + 1, dedupedFinalIssues.length);
        Logger.log("Wrote " + dedupedFinalIssues.length + " issues to sheet (skipped " + (finalIssues.length - dedupedFinalIssues.length) + " duplicates)");
      }
    }

    // NOTE: Compliance records are NO LONGER written to Safety Reports
    // JHA tracking is handled by the Safety Compliance sheet which shows the \u2705/\u274C grid per crew per day
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
  props.deleteProperty('SAFETY_BATCH_DATE_FILTER');
  props.deleteProperty('SAFETY_BATCH_DATE_FILTER');

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

    // Skip "not received" notification emails - these are reports ABOUT missing reports, not actual reports
    // Examples: "Weekly Safety Meeting Report not received last week", "JHA not received last week"
    if (subject.indexOf("not received last week") !== -1) {
      Logger.log("Skipping 'not received' notification email: " + subject.substring(0, 80));
      return { issues: [], skippedReason: "Notification email about missing reports" };
    }

    // Determine report type
    var reportType = "";
    var jobNumber = "";
    var vehicleNumber = "";
    var reportDate = date;

    if (subject.indexOf("Safety Checklist Report") !== -1 || subject.indexOf("Safety Check List Report") !== -1) {
      // Safety Checklist Report format: "Safety Checklist Report 578-033-26 01-15-2026"
      // Also supports X# / spaced format: "Safety Check List Report 3017-016-26 07-16-2026"
      // or "Fwd: Safety Checklist Report 578-033-26 01-15-2026"
      reportType = "Safety Checklist";

      // Extract equipment number and job number from subject
      // Format: 578-033-26 or 3017-016-26 or X6-033-26 where 578/3017/X6 is equipment#, 033-26 is job number
      // Equipment can be: numeric (578/3017), X# format (X1, X6), or alphanumeric (TRK3017)

      // First, try to extract standard/alphanumeric format
      var checklistMatch = subject.match(/Safety Check\s*list Report\s+([A-Z0-9]+)-(\d{3}-\d{1,2})\s+(\d{2}-\d{2}-\d{4})/i);
      if (checklistMatch) {
        vehicleNumber = checklistMatch[1].toUpperCase(); // Equipment number (3017, 578, X6, etc.)
        jobNumber = checklistMatch[2];      // Job number (016-26, 033-26)
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
        // Try more flexible parsing for X# / non-standard vehicles
        var xVehicleMatch = subject.match(/Safety Check\s*list Report\s+([A-Z0-9]+)-([^\s]+)\s+(\d{2}-\d{2}-\d{4})/i);
        if (xVehicleMatch) {
          vehicleNumber = xVehicleMatch[1].toUpperCase(); // X6, 3017, etc.
          jobNumber = xVehicleMatch[2];      // Whatever follows (may be malformed)
          // Try to parse the date
          var dateParts = xVehicleMatch[3].split('-');
          if (dateParts.length === 3) {
            var month = parseInt(dateParts[0]) - 1;
            var day = parseInt(dateParts[1]);
            var year = parseInt(dateParts[2]);
            reportDate = new Date(year, month, day, 12, 0, 0);
          }
          Logger.log("Parsed vehicle from subject: " + vehicleNumber);
        } else {
          // Fallback: try to extract any equipment number and job number
          var altMatch = subject.match(/([A-Z0-9]+)\s*-\s*(\d{3}-\d{1,2})/i);
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
      // Also handles: "Job Hazard Report 02-09-2026_015-26_24193885_...(Modified-23)"
      // NOTE: Modified-N emails all share the SAME subject date but each PDF has the real work date.
      //       PDF is the authoritative date source — subject date is only a fallback if PDF yields nothing.
      Logger.log("Processing JHA email subject: " + subject.substring(0, 100));
      var jhaMatch = subject.match(/Job Hazard Report\s+(\d{2}-\d{2}-\d{4})_(\d{3}-\d{2})/i);
      var subjectDate = null; // Date from subject — FALLBACK ONLY, NOT set as reportDate yet
      if (jhaMatch) {
        var dateParts = jhaMatch[1].split('-');
        if (dateParts.length === 3) {
          var month = parseInt(dateParts[0]) - 1; // 0-indexed
          var day = parseInt(dateParts[1]);
          var year = parseInt(dateParts[2]);
          subjectDate = new Date(year, month, day, 12, 0, 0);
          // DO NOT set reportDate here — PDF extraction below is the primary source.
          // reportDate will be set after PDF processing.
          Logger.log("JHA subject date (fallback only): " + subjectDate.toDateString() +
                     ", Job: " + jhaMatch[2] +
                     (subject.indexOf("Modified") !== -1 ? " ⚠️ Modified version — subject date may be stale" : ""));
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
    // Extract text from PDF attachments (JHA, Safety Checklist, Fleet Checklist)
    // NOTE: This is SLOW (~5-10 sec per PDF). Can be skipped with skipPdfExtraction=true
    if ((reportType === "JHA" || reportType === "Safety Checklist" || reportType === "Fleet Checklist") && !skipPdfExtraction) {
      Logger.log("Processing PDF attachments for " + reportType + " (Job: " + jobNumber + ")...");
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
        Logger.log("Extracting " + reportType + " PDF #" + pdfCount + ": " + attachment.getName() + " (" + Math.round(attachment.getSize()/1024) + "KB)");

        try {
          // Convert PDF to text using Drive API OCR
          var pdfText = extractTextFromPDF(attachment);
          if (pdfText && pdfText.length > 50) {
            fullText += "\n\n[PDF #" + pdfCount + " CONTENT]\n" + pdfText;
            Logger.log("Extracted " + pdfText.length + " chars from PDF #" + pdfCount);

            if (reportType === "JHA") {
              // Extract all "Date Completed" values from THIS PDF
              var thisPdfDates = extractDatesCompletedFromJHAPDF(pdfText);

              if (thisPdfDates.length > 0) {
                Logger.log("PDF #" + pdfCount + " contains " + thisPdfDates.length + " Date Completed entries:");
                for (var d = 0; d < thisPdfDates.length; d++) {
                  Logger.log("  - " + thisPdfDates[d].toDateString());
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
            }
          } else {
            Logger.log("PDF #" + pdfCount + ": Extraction returned empty or minimal text");
          }
        } catch (pdfError) {
          Logger.log("PDF #" + pdfCount + " extraction failed: " + pdfError.toString());
        }
      }

      if (reportType === "JHA") {
        Logger.log("Total JHA PDFs processed: " + pdfCount + ", Total unique dates found: " + allPdfDates.length);
        jhaDateOverrides = allPdfDates;

        if (jhaDateOverrides.length > 0) {
          jhaDateOverrides.sort(function(a, b) { return a.getTime() - b.getTime(); });
          reportDate = jhaDateOverrides[0];
          Logger.log("✅ JHA date from PDF: " + reportDate.toDateString() +
                     (subjectDate ? " (subject said: " + subjectDate.toDateString() + ")" : ""));
        } else {
          if (subjectDate) {
            reportDate = subjectDate;
            var isModified = subject.indexOf("Modified") !== -1;
            Logger.log("⚠️ JHA PDF had no date — falling back to subject date: " + reportDate.toDateString() +
                       (isModified ? " ⚠️ WARNING: This is a Modified-N email; subject date is likely WRONG for this JHA. Check the PDF manually." : ""));
          } else {
            reportDate = date;
            Logger.log("⚠️ JHA PDF had no date and subject had no date — using email receipt date: " + reportDate.toDateString());
          }
        }
      }
    } else if (reportType === "JHA" && skipPdfExtraction) {
      Logger.log("⚡ FAST MODE: Skipping JHA PDF extraction for job " + jobNumber + " — using subject date instead");
      if (subjectDate) {
        reportDate = subjectDate;
        if (subject.indexOf("Modified") !== -1) {
          Logger.log("⚠️ Fast mode + Modified email — subject date " + subjectDate.toDateString() + " may not be the actual work date");
        }
      } else {
        reportDate = date;
      }
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
      Logger.log("\u26A0\uFE0F LATE SUBMISSION: " + reportType + " for " + reportDateStr + " received on " + receivedDateStr + " (Job: " + jobNumber + ")");
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
 * @param {number} [maxSizeBytes] - Max PDF size to attempt (default 10MB). Pass larger value for reprocessing.
 * @returns {string} - Extracted text content
 */
function extractTextFromPDF(attachment, maxSizeBytes) {
  // Default: 10MB — large enough for all JHA PDFs (field tablets produce 2-18MB)
  // Original 2MB limit was too restrictive; OCR API handles large files fine (~0.4s/file)
  if (!maxSizeBytes) maxSizeBytes = 10 * 1024 * 1024;

  var file = null;
  var docFile = null;

  try {
    var size = attachment.getSize();
    if (size > maxSizeBytes) {
      Logger.log("PDF too large to process: " + (size / 1024 / 1024).toFixed(2) + "MB (limit: " + (maxSizeBytes / 1024 / 1024).toFixed(0) + "MB)");
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
 * One-shot time-triggered function that applies Gmail hyperlinks to JHA Log and
 * Weekly Safety Log after processSafetyEmails completes. Runs in a fresh execution
 * context (no PDF OCR memory pressure) to avoid V8 INTERNAL errors.
 * Scheduled automatically by processSafetyEmails — do not call directly.
 */

// ─────────────────────────────────────────────────────────────────────────────
// REPROCESS SUBJECT-DATE FALLBACKS
// When PDF extraction fails for JHA emails (e.g. Modified-N emails that all share
// the same subject date), entries land in the JHA Log with the wrong Date Created.
// These functions find those entries, re-extract the PDF date, and fix them.
//
// ARCHITECTURE: Each PDF OCR call takes ~10 seconds and there can be 100+ entries
// (exceeding the 6-minute Apps Script hard limit). This uses a background continuation
// trigger pattern: the user starts it via menu => it runs in ~18-entry batches via
// time triggers => a final batch triggers compliance recalculation automatically.
// ------------------------------------------------------------------------------------
var JHA_REPROCESS_STATE_KEY  = 'JHA_REPROCESS_STATE';
var JHA_REPROCESS_RESULT_KEY = 'JHA_REPROCESS_RESULT';
/**
 * Menu entry point - scans JHA Log for subject-fallback entries,
 * saves state to ScriptProperties, and kicks off background processing.
 */
function showReprocessJHAFallbacksDialog() {
  var ui = SpreadsheetApp.getUi();
  var confirm = ui.alert(
    '\uD83D\uDD04 Fix JHA Dates (Background Reprocess)',
    'Scans the JHA Log for entries where the date came from the email subject line\n' +
    'instead of the PDF. For each one, re-fetches the original email and extracts\n' +
    'the real "Date Completed" from the PDF attachment.\n\n' +
    'Common cause: "Modified-N" JHA emails that share the same subject date\n' +
    'but have different dates inside each PDF.\n\n' +
    'Scans the last 14 days. Runs in the BACKGROUND (batches of ~18 emails).\n' +
    'Check progress: Safety Emails -> Utilities -> Check Fix JHA Progress\n\n' +
    'Continue?',
    ui.ButtonSet.YES_NO
  );
  if (confirm !== ui.Button.YES) return;
  var started = startReprocessJHAContinuation(14);
  if (started.total === 0) {
    ui.alert('\u2705 Nothing to Fix',
      'No subject-fallback JHA entries found in the last 14 days.\n' +
      '(All recent JHAs already have dates from PDF or have been reprocessed.)',
      ui.ButtonSet.OK);
    return;
  }
  ui.alert('\uD83D\uDD04 Reprocessing Started',
    started.total + ' entries queued for background processing.\n' +
    'Runs in batches of ~18. Estimated time: ~' + Math.ceil(started.total * 10 / 60) + ' minutes.\n\n' +
    'Check progress: Safety Emails -> Utilities -> Check Fix JHA Progress\n\n' +
    'Compliance will be recalculated automatically when complete.',
    ui.ButtonSet.OK);
}
/**
 * Scans JHA Log for pending subject-fallback entries, stores them in
 * ScriptProperties, and schedules the first processing batch trigger.
 * @returns {{ total: number }}
 */
function startReprocessJHAContinuation(daysBack) {
  if (!daysBack) daysBack = 14;
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var jhaSheet = ss.getSheetByName(JHA_LOG_SHEET_NAME);
  if (!jhaSheet || jhaSheet.getLastRow() < 2) return { total: 0 };
  var cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - daysBack);
  var COL_DATE_RECEIVED = 0;
  var COL_DATE_CREATED  = 1;
  var COL_JOB_NUMBER    = 2;
  var COL_EMAIL_ID      = 5;
  var COL_SOURCE        = 6;
  var COL_NOTES         = 9;
  var data = jhaSheet.getDataRange().getValues();
  var pending = [];
  for (var i = 1; i < data.length; i++) {
    var row    = data[i];
    var source = String(row[COL_SOURCE] || '').trim().toLowerCase();
    if (source !== 'subject') continue;
    var recv = row[COL_DATE_RECEIVED];
    if (recv instanceof Date && recv < cutoff) continue;
    var emailId = String(row[COL_EMAIL_ID] || '').trim();
    if (!emailId) continue;
    var curDate = row[COL_DATE_CREATED];
    pending.push({
      sheetRow:     i + 1,
      emailId:      emailId,
      currentDate:  curDate instanceof Date ? curDate.getTime() : (curDate ? new Date(curDate).getTime() : null),
      jobNumber:    String(row[COL_JOB_NUMBER] || ''),
      currentNotes: String(row[COL_NOTES] || '')
    });
  }
  if (pending.length === 0) return { total: 0 };
  var props = PropertiesService.getScriptProperties();
  var state = {
    pending:     pending,
    fixed:       0,
    unchanged:   0,
    failed:      0,
    changes:     [],
    affectedWeeks: {},
    startedAt:   new Date().getTime(),
    totalQueued: pending.length
  };
  props.setProperty(JHA_REPROCESS_STATE_KEY, JSON.stringify(state));
  props.deleteProperty(JHA_REPROCESS_RESULT_KEY);
  _deleteJHAReprocessTriggers_();
  ScriptApp.newTrigger('runReprocessJHABatch').timeBased().after(5 * 1000).create();
  Logger.log('startReprocessJHAContinuation: Queued ' + pending.length + ' entries, first batch triggered.');
  return { total: pending.length };
}
/**
 * Processes one batch of ~18 subject-fallback JHA rows.
 * Auto-triggered by time trigger. Schedules next batch if more remain.
 */
function runReprocessJHABatch() {
  _deleteJHAReprocessTriggers_();
  var props = PropertiesService.getScriptProperties();
  var stateJson = props.getProperty(JHA_REPROCESS_STATE_KEY);
  if (!stateJson) {
    Logger.log('runReprocessJHABatch: No state found.');
    return;
  }
  var state;
  try { state = JSON.parse(stateJson); } catch(e) {
    Logger.log('runReprocessJHABatch: State parse error: ' + e);
    return;
  }
  var pending = state.pending || [];
  if (pending.length === 0) {
    ScriptApp.newTrigger('finalizeReprocessJHA').timeBased().after(5 * 1000).create();
    return;
  }
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var jhaSheet = ss.getSheetByName(JHA_LOG_SHEET_NAME);
  var tz = Session.getScriptTimeZone();
  var COL_DATE_CREATED = 1;
  var COL_SOURCE       = 6;
  var COL_NOTES        = 9;
  var BATCH_SIZE  = 18;
  var MAX_ELAPSED = 4 * 60 * 1000;  // 4-minute hard ceiling per batch
  var startTime   = new Date().getTime();
  var batch = pending.splice(0, BATCH_SIZE);
  for (var ri = 0; ri < batch.length; ri++) {
    if (new Date().getTime() - startTime > MAX_ELAPSED) {
      // Time guard: push remaining batch items back to front of pending
      for (var bi = batch.length - 1; bi >= ri; bi--) {
        pending.unshift(batch[bi]);
      }
      Logger.log('runReprocessJHABatch: 4-min guard after ' + ri + ' entries - rescheduling.');
      break;
    }
    var entry = batch[ri];
    try {
      var msg = GmailApp.getMessageById(entry.emailId);
      if (!msg) {
        jhaSheet.getRange(entry.sheetRow, COL_SOURCE + 1).setValue('pdf (not found)');
        state.failed++;
        continue;
      }
      var attachments = msg.getAttachments();
      var pdfDates = [];
      for (var ai = 0; ai < attachments.length; ai++) {
        var att = attachments[ai];
        var ct  = att.getContentType();
        var fn  = att.getName().toLowerCase();
        if (ct !== 'application/pdf' && !fn.endsWith('.pdf')) continue;
        try {
          var pdfText = extractTextFromPDF(att, 25 * 1024 * 1024);
          if (pdfText && pdfText.length > 50) {
            var thisDates = extractDatesCompletedFromJHAPDF(pdfText);
            for (var di = 0; di < thisDates.length; di++) {
              var dup = pdfDates.some(function(d) { return d.getTime() === thisDates[di].getTime(); });
              if (!dup) pdfDates.push(thisDates[di]);
            }
          }
        } catch (pdfErr) {
          Logger.log('runReprocessJHABatch: PDF error for ' + entry.emailId + ': ' + pdfErr);
        }
      }
      if (pdfDates.length === 0) {
        jhaSheet.getRange(entry.sheetRow, COL_SOURCE + 1).setValue('subject (no pdf date)');
        state.unchanged++;
        continue;
      }
      pdfDates.sort(function(a, b) { return a.getTime() - b.getTime(); });
      var newDate = pdfDates[0];
      var curDate = entry.currentDate ? new Date(entry.currentDate) : null;
      if (curDate && !isNaN(curDate.getTime()) &&
          curDate.toDateString() === newDate.toDateString()) {
        jhaSheet.getRange(entry.sheetRow, COL_SOURCE + 1).setValue('pdf (verified)');
        state.unchanged++;
        continue;
      }
      var oldDateStr = curDate ? Utilities.formatDate(curDate, tz, 'MM/dd/yyyy') : 'unknown';
      var newDateStr = Utilities.formatDate(newDate, tz, 'MM/dd/yyyy');
      jhaSheet.getRange(entry.sheetRow, COL_DATE_CREATED + 1).setValue(newDate);
      jhaSheet.getRange(entry.sheetRow, COL_SOURCE + 1).setValue('pdf (reprocessed)');
      var updatedNotes = entry.currentNotes
        .replace('Date from: subject',
                 'Date from: pdf (reprocessed - was ' + oldDateStr + ')');
      jhaSheet.getRange(entry.sheetRow, COL_NOTES + 1).setValue(updatedNotes);
      var weekStart = new Date(newDate);
      weekStart.setDate(weekStart.getDate() - weekStart.getDay());
      weekStart.setHours(0, 0, 0, 0);
      state.affectedWeeks[weekStart.getTime()] = true;
      if (curDate && !isNaN(curDate.getTime())) {
        var oldWeekStart = new Date(curDate);
        oldWeekStart.setDate(oldWeekStart.getDate() - oldWeekStart.getDay());
        oldWeekStart.setHours(0, 0, 0, 0);
        state.affectedWeeks[oldWeekStart.getTime()] = true;
      }
      Logger.log('runReprocessJHABatch: Fixed ' + entry.jobNumber + ' - ' + oldDateStr + ' -> ' + newDateStr);
      state.changes.push(entry.jobNumber + ': ' + oldDateStr + ' -> ' + newDateStr);
      state.fixed++;
    } catch (e) {
      Logger.log('runReprocessJHABatch: Error for ' + entry.emailId + ': ' + e);
      state.failed++;
    }
  }
  state.pending = pending;
  Logger.log('runReprocessJHABatch: Batch done. Fixed=' + state.fixed +
             ' Unchanged=' + state.unchanged + ' Failed=' + state.failed +
             ' Remaining=' + pending.length + '/' + state.totalQueued);
  props.setProperty(JHA_REPROCESS_STATE_KEY, JSON.stringify(state));
  if (pending.length > 0) {
    ScriptApp.newTrigger('runReprocessJHABatch').timeBased().after(5 * 1000).create();
    Logger.log('runReprocessJHABatch: Next batch scheduled. ' + pending.length + ' remain.');
  } else {
    ScriptApp.newTrigger('finalizeReprocessJHA').timeBased().after(5 * 1000).create();
    Logger.log('runReprocessJHABatch: All done. Finalize scheduled.');
  }
}
/**
 * Final step after all batches complete.
 * Recalculates compliance if any dates were fixed. Stores result for menu display.
 */
function finalizeReprocessJHA() {
  _deleteJHAReprocessTriggers_();
  var props = PropertiesService.getScriptProperties();
  var stateJson = props.getProperty(JHA_REPROCESS_STATE_KEY);
  var state = { fixed: 0, unchanged: 0, failed: 0, changes: [], affectedWeeks: {}, totalQueued: 0 };
  if (stateJson) { try { state = JSON.parse(stateJson); } catch(e) {} }
  props.deleteProperty(JHA_REPROCESS_STATE_KEY);
  var affectedWeekCount = Object.keys(state.affectedWeeks || {}).length;
  Logger.log('finalizeReprocessJHA: Fixed=' + state.fixed + ' Unchanged=' + state.unchanged +
             ' Failed=' + state.failed + ' Weeks affected=' + affectedWeekCount);
  if (state.fixed > 0 && affectedWeekCount > 0) {
    Logger.log('finalizeReprocessJHA: Recalculating compliance (silent)...');
    try {
      var compResult = masterRecalculateComplianceSilent();
      Logger.log('finalizeReprocessJHA: Compliance recalculated. Weeks=' + compResult.weeksProcessed +
                 ' Compliant=' + compResult.compliant + ' Missing=' + compResult.missing);
    }
    catch(e) { Logger.log('finalizeReprocessJHA: Compliance recalc error: ' + e); }
  }
  try { sortAndFormatSafetyLogs(true); } catch(e) {}
  var resultMsg = '\u2705 Fix JHA Dates - Complete!\n\n' +
    'Fixed: ' + state.fixed + ' date(s) corrected\n' +
    'Verified: ' + state.unchanged + ' already correct\n' +
    (state.failed > 0 ? 'Errors: ' + state.failed + ' (email not found or PDF unreadable)\n' : '') +
    (state.fixed > 0 ? '\nCompliance recalculated automatically.\n' : '') +
    (state.changes && state.changes.length > 0
      ? '\nChanges:\n' + state.changes.slice(0, 20).map(function(c) { return '  - ' + c; }).join('\n') +
        (state.changes.length > 20 ? '\n  ... and ' + (state.changes.length - 20) + ' more' : '')
      : '');
  props.setProperty(JHA_REPROCESS_RESULT_KEY, resultMsg);
  Logger.log('finalizeReprocessJHA: Result stored. Run "Check Fix JHA Progress" to view.');
}
/**
 * Menu item - shows status of running or completed JHA reprocess job.
 */
function showReprocessJHAProgress() {
  var ui = SpreadsheetApp.getUi();
  var props = PropertiesService.getScriptProperties();
  var resultMsg = props.getProperty(JHA_REPROCESS_RESULT_KEY);
  if (resultMsg) {
    ui.alert('\u2705 Fix JHA Dates - Complete', resultMsg, ui.ButtonSet.OK);
    props.deleteProperty(JHA_REPROCESS_RESULT_KEY);
    return;
  }
  var stateJson = props.getProperty(JHA_REPROCESS_STATE_KEY);
  if (stateJson) {
    try {
      var state = JSON.parse(stateJson);
      var done = state.totalQueued - (state.pending ? state.pending.length : 0);
      var pct  = state.totalQueued > 0 ? Math.round(done / state.totalQueued * 100) : 0;
      var elapsed = Math.round((new Date().getTime() - state.startedAt) / 1000);
      ui.alert('\u23F3 Fix JHA Dates - In Progress',
        'Progress: ' + done + ' / ' + state.totalQueued + ' (' + pct + '%)\n' +
        'Fixed so far: ' + state.fixed + '\n' +
        'Verified correct: ' + state.unchanged + '\n' +
        'Elapsed: ' + elapsed + 's\n\n' +
        'Check back in ~' + Math.ceil((state.pending ? state.pending.length : 0) * 10 / 60) + ' minute(s).',
        ui.ButtonSet.OK);
    } catch(e) {
      ui.alert('Status Unknown', 'Could not read progress.', ui.ButtonSet.OK);
    }
    return;
  }
  ui.alert('\uD83D\uDCCB No Active Job',
    'No Fix JHA Dates job is currently running.\n\n' +
    'To start: Safety Emails -> Utilities -> Fix JHA Dates',
    ui.ButtonSet.OK);
}
/** Removes any pending runReprocessJHABatch or finalizeReprocessJHA triggers. */
function _deleteJHAReprocessTriggers_() {
  try {
    var triggers = ScriptApp.getProjectTriggers();
    for (var i = 0; i < triggers.length; i++) {
      var fn = triggers[i].getHandlerFunction();
      if (fn === 'runReprocessJHABatch' || fn === 'finalizeReprocessJHA') {
        ScriptApp.deleteTrigger(triggers[i]);
      }
    }
  } catch(e) { Logger.log('_deleteJHAReprocessTriggers_: ' + e); }
}

function applyAllEmailLinksScheduled() {
  // Delete this one-shot trigger first so it never fires again
  try {
    var triggers = ScriptApp.getProjectTriggers();
    for (var i = 0; i < triggers.length; i++) {
      if (triggers[i].getHandlerFunction() === 'applyAllEmailLinksScheduled') {
        ScriptApp.deleteTrigger(triggers[i]);
      }
    }
  } catch (e) {
    Logger.log('applyAllEmailLinksScheduled: Could not delete trigger - ' + e);
  }

  var jhaCount = applyJHALogEmailLinksSilent();
  var weeklyCount = applyWeeklySafetyLogEmailLinksSilent();
  var monthlyCount = applyMonthlyChecklistLogEmailLinksSilent();
  Logger.log('applyAllEmailLinksScheduled: Applied Gmail links — JHA Log: ' + jhaCount + ', Weekly Safety Log: ' + weeklyCount + ', Monthly Checklist Log: ' + monthlyCount);
}

/**
 * Applies clickable Gmail hyperlinks to the Source Email ID column (col 10) for newly written rows.
 * The cell text stays as the messageId (for deduplication), but clicking it opens the Gmail email
 * where the user can view/download the PDF attachment.
 *
 * @param {Sheet} sheet - The Safety Equipment Needs sheet
 * @param {number} startRow - First data row number (1-based)
 * @param {Array} issues - Array of issue row arrays that were just written
 */
function applyEmailLinks(sheet, startRow, issues) {
  try {
    var richTextValues = [];
    for (var i = 0; i < issues.length; i++) {
      var msgId = String(issues[i][9] || '');
      if (msgId) {
        // Strip composite suffix (e.g. "abc123_0" -> "abc123") for the Gmail URL
        var baseId = msgId.split('_')[0];
        var gmailUrl = 'https://mail.google.com/mail/u/0/#all/' + baseId;
        richTextValues.push([SpreadsheetApp.newRichTextValue()
          .setText(msgId)
          .setLinkUrl(gmailUrl)
          .build()]);
      } else {
        richTextValues.push([SpreadsheetApp.newRichTextValue().setText('').build()]);
      }
    }
    if (richTextValues.length > 0) {
      sheet.getRange(startRow, 10, issues.length, 1).setRichTextValues(richTextValues);
    }
  } catch (e) {
    Logger.log('applyEmailLinks: Error setting rich text links - ' + e.toString());
  }
}

/**
 * Applies Gmail hyperlinks to all Source Email ID values in the Safety Equipment Needs sheet.
 * Silent version — no UI alert. Called automatically at end of processSafetyEmails().
 * @return {number} Number of links applied
 */
function applySafetyEquipmentEmailLinksSilent() {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(SAFETY_EQUIPMENT_SHEET_NAME);
    if (!sheet || sheet.getLastRow() < 2) return 0;

    var emailIdCol = 10; // Column J - Source Email ID
    var lastRow = sheet.getLastRow();
    var values = sheet.getRange(2, emailIdCol, lastRow - 1, 1).getValues();
    var richTextValues = [];
    var linkCount = 0;

    for (var i = 0; i < values.length; i++) {
      var msgId = String(values[i][0] || '').trim();
      if (msgId) {
        var baseId = msgId.split('_')[0];
        var gmailUrl = 'https://mail.google.com/mail/u/0/#all/' + baseId;
        richTextValues.push([SpreadsheetApp.newRichTextValue()
          .setText(msgId)
          .setLinkUrl(gmailUrl)
          .build()]);
        linkCount++;
      } else {
        richTextValues.push([SpreadsheetApp.newRichTextValue().setText('').build()]);
      }
    }

    sheet.getRange(2, emailIdCol, lastRow - 1, 1).setRichTextValues(richTextValues);
    Logger.log('applySafetyEquipmentEmailLinksSilent: Applied links to ' + linkCount + ' rows');
    return linkCount;
  } catch (e) {
    Logger.log('applySafetyEquipmentEmailLinksSilent: Error (non-fatal) - ' + e.toString());
    return 0;
  }
}

/**
 * Backfills Gmail hyperlinks for all existing Source Email ID values in Safety Equipment Needs sheet.
 * Run once via menu to make historical rows clickable.
 */
function backfillSafetyEquipmentEmailLinks() {
  var linkCount = applySafetyEquipmentEmailLinksSilent();
  if (linkCount === 0) {
    SpreadsheetApp.getUi().alert('No data rows to update, or Safety Equipment Needs sheet not found.');
    return;
  }
  SpreadsheetApp.getUi().alert('\u2705 Added Gmail links to ' + linkCount + ' rows in Source Email ID column.\n\nClick any Source Email ID cell to open the original email in Gmail.');
}

/**
 * Applies Gmail hyperlinks to all Email ID values in the JHA Log sheet (col F = 6).
 * Silent version — called automatically at end of processSafetyEmails().
 * @return {number} Number of links applied
 */
function applyJHALogEmailLinksSilent() {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(JHA_LOG_SHEET_NAME);
    if (!sheet || sheet.getLastRow() < 2) return 0;

    var emailIdCol = 6; // Column F - Email ID
    var lastRow = sheet.getLastRow();
    var values = sheet.getRange(2, emailIdCol, lastRow - 1, 1).getValues();
    var richTextValues = [];
    var linkCount = 0;

    for (var i = 0; i < values.length; i++) {
      var msgId = String(values[i][0] || '').trim();
      if (msgId) {
        var baseId = msgId.split('_')[0];
        var gmailUrl = 'https://mail.google.com/mail/u/0/#all/' + baseId;
        richTextValues.push([SpreadsheetApp.newRichTextValue()
          .setText(msgId)
          .setLinkUrl(gmailUrl)
          .build()]);
        linkCount++;
      } else {
        richTextValues.push([SpreadsheetApp.newRichTextValue().setText('').build()]);
      }
    }

    sheet.getRange(2, emailIdCol, lastRow - 1, 1).setRichTextValues(richTextValues);
    Logger.log('applyJHALogEmailLinksSilent: Applied links to ' + linkCount + ' rows');
    return linkCount;
  } catch (e) {
    Logger.log('applyJHALogEmailLinksSilent: Error (non-fatal) - ' + e.toString());
    return 0;
  }
}

/**
 * Applies Gmail hyperlinks to all Email ID values in the Weekly Safety Log sheet (col F = 6).
 * Silent version — called automatically at end of processSafetyEmails().
 * @return {number} Number of links applied
 */
function applyWeeklySafetyLogEmailLinksSilent() {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(WEEKLY_SAFETY_LOG_SHEET_NAME);
    if (!sheet || sheet.getLastRow() < 2) return 0;

    var emailIdCol = 6; // Column F - Email ID
    var lastRow = sheet.getLastRow();
    var values = sheet.getRange(2, emailIdCol, lastRow - 1, 1).getValues();
    var richTextValues = [];
    var linkCount = 0;

    for (var i = 0; i < values.length; i++) {
      var msgId = String(values[i][0] || '').trim();
      if (msgId) {
        var baseId = msgId.split('_')[0];
        var gmailUrl = 'https://mail.google.com/mail/u/0/#all/' + baseId;
        richTextValues.push([SpreadsheetApp.newRichTextValue()
          .setText(msgId)
          .setLinkUrl(gmailUrl)
          .build()]);
        linkCount++;
      } else {
        richTextValues.push([SpreadsheetApp.newRichTextValue().setText('').build()]);
      }
    }

    sheet.getRange(2, emailIdCol, lastRow - 1, 1).setRichTextValues(richTextValues);
    Logger.log('applyWeeklySafetyLogEmailLinksSilent: Applied links to ' + linkCount + ' rows');
    return linkCount;
  } catch (e) {
    Logger.log('applyWeeklySafetyLogEmailLinksSilent: Error (non-fatal) - ' + e.toString());
    return 0;
  }
}

/**
 * Backfills the Notes column (K) for existing "Needs Attention" rows that have no notes.
 * Re-fetches each unique email, extracts PDF text, and looks for the Comments field
 * near the equipment section that generated the issue.
 *
 * Menu: Glove Manager → 🛡\uFE0F Process Safety Emails → 🧹 Cleanup → \uD83D\uDD0D Backfill Notes from PDF Comments
 */
function backfillEquipmentNotes() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SAFETY_EQUIPMENT_SHEET_NAME);
  if (!sheet) {
    SpreadsheetApp.getUi().alert('Safety Equipment Needs sheet not found.');
    return;
  }

  var lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    SpreadsheetApp.getUi().alert('No data rows to update.');
    return;
  }

  // Column indices (1-based):
  // A=1 Date, B=2 ReportType, C=3 Job, D=4 Foreman, E=5 Vehicle
  // F=6 EquipType, G=7 Description, H=8 Status, I=9 TestDate, J=10 EmailID, K=11 Notes
  var data = sheet.getRange(2, 1, lastRow - 1, 13).getValues();

  // Collect rows that are "Needs Attention" with empty/short Notes
  var rowsToFill = [];
  for (var i = 0; i < data.length; i++) {
    var status    = String(data[i][7]  || '').trim();  // col H (index 7)
    var notes     = String(data[i][10] || '').trim();  // col K (index 10)
    var emailId   = String(data[i][9]  || '').trim();  // col J (index 9)
    var rptType   = String(data[i][1]  || '').trim();  // col B (index 1)
    var equipType = String(data[i][5]  || '').trim();  // col F (index 5)
    var desc      = String(data[i][6]  || '').trim();  // col G (index 6)
    if (status === 'Needs Attention' && notes.length < 10 && emailId) {
      rowsToFill.push({
        rowNum: i + 2,
        emailId: emailId,
        equipType: equipType,
        desc: desc,
        reportType: rptType
      });
    }
  }

  if (rowsToFill.length === 0) {
    SpreadsheetApp.getUi().alert('No rows need updating.\n\nAll "Needs Attention" rows already have notes, or have no Source Email ID.');
    return;
  }

  SpreadsheetApp.getActiveSpreadsheet().toast(
    'Backfilling notes for ' + rowsToFill.length + ' row(s)...\nThis may take a few minutes.',
    'Backfill Notes', 60);
  Logger.log('backfillEquipmentNotes: Processing ' + rowsToFill.length + ' rows');

  // -------------------------------------------------------------------------
  // Yes/No patterns for Safety Checklist PDF form structure
  // (Same as used in extractSafetyChecklistIssues)
  // -------------------------------------------------------------------------
  var CHECKLIST_PATTERNS = {
    'hot sticks':        /hot\s*sticks?\s+good\s*condition\s*\??\s*:?\s*(yes|no)/i,
    'insulated jumpers': /insulated\s*jumpers?[\s:]+good\s*condition\s*\??\s*:?\s*(yes|no)/i,
    'fire extinguisher': /(?:properly\s*charged|monthly\s*inspection\s*done|tag\s*signed\s*off)\s*\??\s*:?\s*(yes|no)/i,
    'signs':             /signs?\s+good\s*condition\s*\??\s*:?\s*(yes|no)/i,
    'cones':             /cones?\s+good\s*condition\s*\??\s*:?\s*(yes|no)/i,
    'triangles':         /triangles?\s+good\s*condition\s*\??\s*:?\s*(yes|no)/i,
    'wheel chocks':      /wheel\s*chocks?\s+good\s*condition\s*\??\s*:?\s*(yes|no)/i,
    'fall protection':   /fall\s*protection\s*gear\s+good\s*condition\s*\??\s*:?\s*(yes|no)/i,
    'harnesses':         /harnesses?\s*\/?\s*lanyards?\s+good\s*condition\s*\??\s*:?\s*(yes|no)/i,
    'first aid':         /fully\s*stocked\s*:?\s*(yes|no)/i,
    'aed':               /any\s*damage\s*visible\s*\??\s*:?\s*(yes|no|na)/i,
    'rubber goods':      /rubber\s*(?:goods?|gloves?|sleeves?)\s+good\s*condition\s*\??\s*:?\s*(yes|no)/i,
    'hot hoist':         /hot\s*hoist\s+good\s*condition\s*\??\s*:?\s*(yes|no)/i,
    'barriers':          /barriers?\s+good\s*condition\s*\??\s*:?\s*(yes|no)/i,
    'crane':             /crane\s*log\s*books?\s+log\s*book\s*in\s*unit\s*\??\s*:?\s*(yes|no)/i,
    'mileage':           /mileage\s*books?\s+need\s*new\s*book\s*\??\s*:?\s*(yes|no)/i
  };

  /**
   * Find the Comments: field immediately after a yes/no match in normalized text.
   * Two-strategy approach:
   *   1) Original lookahead regex (stops before next capitalized question)
   *   2) Fallback: find next "Comments:" boundary, grab text in between
   */
  function extractCommentAfterYesNo(text, match) {
    var afterPos = match.index + match[0].length;
    var segment = text.substring(afterPos, Math.min(afterPos + 900, text.length));

    // DEBUG: log what immediately follows the yes/no match
    Logger.log('backfillEquipmentNotes: segment[0:280]="' + segment.substring(0, 280) + '"');

    // — Strategy 1: original lookahead regex —
    var cm = segment.match(/comments?\s*:?\s*([A-Za-z0-9][^?]{4,300}?)(?=\s*(?:[A-Z][a-z][^?:\n]{0,45}?\?|$))/i);
    if (cm && cm[1]) {
      var c1 = cm[1].trim().replace(/\s+/g, ' ');
      if (c1.length >= 10 && !/^(n\/?a|none|ok|good|yes|no|na|-+)$/i.test(c1)) {
        return c1;
      }
    }

    // — Strategy 2: find first "Comments:" then grab to next "Comments:" OR field terminator —
    var labelMatch = segment.match(/comments?\s*:?\s*/i);
    if (!labelMatch) return '';
    var afterLabel = segment.substring(labelMatch.index + labelMatch[0].length);

    // Stop at the next "Comments:" (next section) OR a common multi-word field header
    var nextCmIdx  = afterLabel.search(/\s+comments?\s*:/i);
    var fieldStop  = afterLabel.search(/\s+(?:Test Date|Insulated Jumpers|Good condition|Fully Stocked|Properly charged|Monthly inspection|Expiration|AED|Fall Protection|Harnesses|Crane|Mileage|Signs|Triangles|Cones|Hot Hoist|Barriers|Fire Extinguisher|Hot Stick|Rubber|First Aid|Manuf)\s*[?:]/i);
    // Stop on AED-specific line items to prevent them from bleeding into previous comments
    var aedStop    = afterLabel.search(/\s*(?:2\s*sets?\s*of\s*defibrillation\s*pads|Expiration\s*date\s*of\s*pads\s*Set\s*[1-2]|Visual\s*Rescue\s*Ready\s*Light\s*is)\b/i);

    var stopAt = afterLabel.length; // default: take everything up to 500 chars
    if (nextCmIdx  >= 0) stopAt = Math.min(stopAt, nextCmIdx);
    if (fieldStop  >= 0) stopAt = Math.min(stopAt, fieldStop);
    if (aedStop   >= 0) stopAt = Math.min(stopAt, aedStop);
    stopAt = Math.min(stopAt, 500);

    var rawComment = afterLabel.substring(0, stopAt).trim().replace(/\s+/g, ' ');
    if (rawComment.length < 10) return '';
    // Reject if it contains "?:" — we captured the next form question, not actual comment text
    // e.g. "White slips to foreman?: Yes" or "Full set?: No" are next questions, not comments
    if (/\?:/.test(rawComment)) return '';
    // Reject standalone section labels like "Harnesses/Lanyards" (only word chars and slashes)
    if (/^[\w\/]+$/.test(rawComment)) return '';
    if (/^(n\/?a|none|ok|good|yes|no|na|-+)$/i.test(rawComment)) return '';
    return rawComment;
  }

  /**
   * For Fleet Checklist rows: look in the email body for the description line,
   * then look at the next 3 lines for a Comments: field.
   */
  function extractFleetComment(bodyLines, issueDesc) {
    var descLower = issueDesc.toLowerCase().substring(0, 60);
    for (var li = 0; li < bodyLines.length; li++) {
      var lineLower = bodyLines[li].toLowerCase().trim();
      if (lineLower.length > 5 && descLower.indexOf(lineLower.substring(0, 30)) !== -1) {
        // Found the keyword line - look at next 3 lines for Comments:
        for (var ni = li + 1; ni <= li + 3 && ni < bodyLines.length; ni++) {
          var nextLine = bodyLines[ni].trim();
          if (!nextLine) continue;
          var cm = nextLine.match(/^comments?\s*:?\s*(.+)$/i);
          if (cm && cm[1]) {
            var c = cm[1].trim();
            if (c.length >= 10 && !/^(n\/?a|none|ok|good|yes|no|na)$/i.test(c)) return c;
          }
        }
        break;
      }
    }
    return '';
  }

  // Cache fetched content per base message ID
  var textCache  = {};  // normalized text (PDF or body)
  var linesCache = {};  // body split into lines (for Fleet Checklist)
  var updatedCount = 0;
  var skippedCount = 0;
  var errorCount   = 0;

  for (var r = 0; r < rowsToFill.length; r++) {
    var row    = rowsToFill[r];
    var baseId = row.emailId.split('_')[0];

    try {
      // --- Fetch email content (cached) ---
      if (textCache[baseId] === undefined) {
        textCache[baseId]  = '';
        linesCache[baseId] = [];
        try {
          var message = GmailApp.getMessageById(baseId);
          if (message) {
            var body = message.getPlainBody() || '';
            linesCache[baseId] = body.split('\n');

            // For Safety Checklist: also try to extract PDF text
            if (row.reportType === 'Safety Checklist') {
              var atts = message.getAttachments();
              for (var a = 0; a < atts.length; a++) {
                var att = atts[a];
                var ct  = att.getContentType();
                var fn  = att.getName().toLowerCase();
                if (ct === 'application/pdf' || fn.indexOf('.pdf') !== -1) {
                  Logger.log('backfillEquipmentNotes: Extracting PDF from ' + baseId + '...');
                  var pdfRaw = extractTextFromPDF(att);
                  if (pdfRaw && pdfRaw.length > 50) {
                    // Store BOTH body and PDF text (normalized), same as main pipeline
                    textCache[baseId] = (body + '\n\n' + pdfRaw).replace(/\s+/g, ' ');
                    Logger.log('backfillEquipmentNotes: PDF OK, ' + textCache[baseId].length + ' chars for ' + baseId);
                  } else {
                    Logger.log('backfillEquipmentNotes: PDF empty/short for ' + baseId);
                  }
                  break;
                }
              }
            }

            // Fallback: normalized body (used for Fleet Checklist or if PDF failed)
            if (!textCache[baseId]) {
              textCache[baseId] = body.replace(/\s+/g, ' ');
              Logger.log('backfillEquipmentNotes: Using email body for ' + baseId + ' (' + row.reportType + ')');
            }
          } else {
            Logger.log('backfillEquipmentNotes: message not found: ' + baseId);
          }
        } catch (fetchErr) {
          Logger.log('backfillEquipmentNotes: Error fetching ' + baseId + ': ' + fetchErr);
        }
        Utilities.sleep(200);
      }

      var fullText = textCache[baseId];
      var bodyLines = linesCache[baseId];

      if (!fullText) {
        Logger.log('backfillEquipmentNotes: No text for ' + baseId);
        errorCount++;
        continue;
      }

      var noteText = '';
      var equipTypeLower = row.equipType.toLowerCase();

      if (row.reportType === 'Safety Checklist') {
        // --- Safety Checklist: use yes/no patterns against normalized PDF text ---
        var yesNoPattern = null;
        for (var key in CHECKLIST_PATTERNS) {
          if (equipTypeLower.indexOf(key) !== -1) {
            yesNoPattern = CHECKLIST_PATTERNS[key];
            break;
          }
        }
        if (yesNoPattern) {
          var m = fullText.match(yesNoPattern);
          if (m) {
            Logger.log('backfillEquipmentNotes: Matched "' + m[0] + '" for ' + row.equipType);
            noteText = extractCommentAfterYesNo(fullText, m);
          } else {
            Logger.log('backfillEquipmentNotes: No pattern match for "' + row.equipType + '" in ' + baseId);
          }
        } else {
          Logger.log('backfillEquipmentNotes: No pattern defined for "' + row.equipType + '"');
        }

      } else {
        // --- Fleet Checklist / other: search email body lines for Comments: after the issue line ---
        noteText = extractFleetComment(bodyLines, row.desc);
        if (!noteText) {
          // Also try searching the normalized body for Comments: near the equipment keyword
          var kwIdx = fullText.toLowerCase().indexOf(equipTypeLower.split(' ')[0]);
          if (kwIdx !== -1) {
            var win = fullText.substring(kwIdx, Math.min(kwIdx + 400, fullText.length));
            var cm2 = win.match(/comments?\s*:?\s*([A-Za-z0-9][^?]{9,300})/i);
            if (cm2 && cm2[1]) {
              var c2 = cm2[1].trim().replace(/\s+/g, ' ');
              if (!/^(n\/?a|none|ok|good|yes|no|na|-+)$/i.test(c2)) noteText = c2;
            }
          }
        }
      }

      if (noteText) {
        sheet.getRange(row.rowNum, 11).setValue(noteText);  // col K = 11
        updatedCount++;
        Logger.log('backfillEquipmentNotes: Row ' + row.rowNum + ' (' + row.equipType + ') ↁ  "' + noteText.substring(0, 100) + '"');
      } else {
        skippedCount++;
        Logger.log('backfillEquipmentNotes: Row ' + row.rowNum + ' (' + row.equipType + ') - no comment found');
      }

    } catch (e) {
      Logger.log('backfillEquipmentNotes: Error row ' + row.rowNum + ': ' + e.toString());
      errorCount++;
    }
  }

  var msg = 'Notes Backfill Complete\n\n' +
    'Updated: ' + updatedCount + ' row(s)\n' +
    'Skipped - no comment in PDF: ' + skippedCount + ' row(s)';
  if (errorCount > 0) {
    msg += '\nErrors (check Apps Script > Executions log): ' + errorCount + ' row(s)';
  }
  msg += '\n\nCheck Extensions > Apps Script > Executions to see exactly what happened for each row.';
  SpreadsheetApp.getUi().alert(msg);
}

/**
 * Gets a PDF preview from a Gmail message ID for uncredited job review
 * Extracts the PDF text content to help user determine which foreman to credit
 *
 * @param {string} messageId - Gmail message ID from JHA Log or Weekly Safety Log
 * @returns {Object} - {success: boolean, pdfText: string, subject: string, sender: string, error: string}
 */
function getEmailPdfPreview(messageId) {
  try {
    if (!messageId) {
      return { success: false, error: 'No message ID provided' };
    }

    Logger.log("getEmailPdfPreview: Getting PDF for message ID: " + messageId);

    // Handle composite message IDs (e.g., "abc123_0" for multi-JHA emails)
    var baseMessageId = messageId.split('_')[0];

    // Get the Gmail message
    var message;
    try {
      message = GmailApp.getMessageById(baseMessageId);
    } catch (gmailError) {
      Logger.log("getEmailPdfPreview: Gmail error - " + gmailError.toString());
      return { success: false, error: 'Could not find email. It may have been deleted or moved.' };
    }

    if (!message) {
      return { success: false, error: 'Email not found in Gmail' };
    }

    var subject = message.getSubject();
    var sender = message.getFrom();
    var receivedDate = message.getDate();
    var body = message.getPlainBody();

    // Look for PDF attachments
    var attachments = message.getAttachments();
    var pdfFound = false;
    var pdfText = '';
    var pdfName = '';

    for (var i = 0; i < attachments.length; i++) {
      var attachment = attachments[i];
      var contentType = attachment.getContentType();
      var fileName = attachment.getName().toLowerCase();

      if (contentType === 'application/pdf' || fileName.endsWith('.pdf')) {
        pdfFound = true;
        pdfName = attachment.getName();
        Logger.log("getEmailPdfPreview: Found PDF - " + pdfName + " (" + Math.round(attachment.getSize()/1024) + "KB)");

        try {
          pdfText = extractTextFromPDF(attachment);
          if (pdfText && pdfText.length > 0) {
            Logger.log("getEmailPdfPreview: Extracted " + pdfText.length + " chars from PDF");
          } else {
            pdfText = "[Could not extract text from PDF]";
          }
        } catch (extractError) {
          Logger.log("getEmailPdfPreview: PDF extraction error - " + extractError.toString());
          pdfText = "[Error extracting PDF: " + extractError.message + "]";
        }

        // Only process first PDF
        break;
      }
    }

    // Build preview text
    var previewText = '';
    previewText += 'Subject: ' + subject + '\n';
    previewText += 'From: ' + sender + '\n';
    previewText += 'Received: ' + Utilities.formatDate(receivedDate, Session.getScriptTimeZone(), 'MM/dd/yyyy h:mm a') + '\n';
    previewText += '\n';

    if (pdfFound) {
      previewText += 'PDF: ' + pdfName + '\n';
      previewText += '----------------------------------------\n';
      if (pdfText && pdfText.indexOf('[Could not extract') === -1 && pdfText.indexOf('[Error') === -1) {
        previewText += pdfText;
      } else {
        previewText += pdfText + '\n\n';
        previewText += 'NOTE: PDF text could not be read (may be image-only or encrypted).\n';
        previewText += 'Showing email body as fallback:\n';
        previewText += '----------------------------------------\n';
        var bodyFallback = body || '(no email body)';
        previewText += bodyFallback.length > 3000 ? bodyFallback.substring(0, 3000) + '\n\n[... truncated ...]' : bodyFallback;
      }
    } else {
      previewText += 'Email Body:\n';
      previewText += '----------------------------------------\n';
      // Limit body text preview
      previewText += body.length > 3000 ? body.substring(0, 3000) + '\n\n[... truncated ...]' : body;
    }

    return {
      success: true,
      pdfText: previewText,
      subject: subject,
      sender: sender,
      hasPdf: pdfFound,
      pdfName: pdfName
    };

  } catch (e) {
    Logger.log("getEmailPdfPreview: Error - " + e.toString());
    return { success: false, error: 'Error getting email: ' + e.message };
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

  // ========== PATTERN 1B: "Date Completed" with MONTH NAME format ==========
  // Handles: "Date Completed: Mar 16, 2026", "Date Completed: March 16, 2026"
  // This is the format used in the actual JHA PDFs from the field tablets
  if (dates.length === 0) {
    var monthNamePattern = /Date\s*Completed[\s:]*([A-Za-z]{3,9})\s+(\d{1,2}),?\s*(\d{4})/gi;
    while ((match = monthNamePattern.exec(normalizedText)) !== null) {
      var monthStr = match[1];
      var dayStr = match[2];
      var yearStr = match[3];
      var dateStr = monthStr + ' ' + dayStr + ', ' + yearStr;
      Logger.log("extractDatesCompletedFromJHAPDF: Pattern1B (month name) matched: '" + match[0] + "' -> date: " + dateStr);
      var parsedDate = new Date(dateStr);
      if (parsedDate && !isNaN(parsedDate.getTime())) {
        var year = parsedDate.getFullYear();
        if (year >= 2024 && year <= 2030) {
          if (!dates.some(function(d) { return d.getTime() === parsedDate.getTime(); })) {
            dates.push(parsedDate);
            Logger.log("extractDatesCompletedFromJHAPDF: ✓ Added from Pattern1B: " + parsedDate.toDateString());
          }
        }
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

  // ========== PATTERN 6B: Standalone month name date formats ==========
  // Handles: "Mar 16, 2026", "March 16, 2026", "16 Mar 2026" - as last resort
  if (dates.length === 0) {
    // Pattern: "Mar 16, 2026" or "March 16, 2026"
    var pattern6b = /\b([A-Za-z]{3,9})\s+(\d{1,2}),?\s*(202[4-7])\b/g;
    while ((match = pattern6b.exec(normalizedText)) !== null) {
      var monthStr = match[1].toLowerCase();
      var validMonths = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec',
                         'january', 'february', 'march', 'april', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
      if (validMonths.indexOf(monthStr) !== -1 || validMonths.indexOf(monthStr.substring(0, 3)) !== -1) {
        var dateStr = match[1] + ' ' + match[2] + ', ' + match[3];
        Logger.log("extractDatesCompletedFromJHAPDF: Pattern6B (standalone month name) matched: " + dateStr);
        var parsedDate = new Date(dateStr);
        if (parsedDate && !isNaN(parsedDate.getTime())) {
          if (!dates.some(function(d) { return d.getTime() === parsedDate.getTime(); })) {
            dates.push(parsedDate);
            Logger.log("extractDatesCompletedFromJHAPDF: ✓ Added from Pattern6B: " + parsedDate.toDateString());
          }
        }
      }
    }
  }

  // Sort dates chronologically
  dates.sort(function(a, b) {
    return a.getTime() - b.getTime();
  });

  if (dates.length === 0) {
    Logger.log("extractDatesCompletedFromJHAPDF: \u26A0\uFE0F NO DATES FOUND in PDF text. First 200 chars: " + normalizedText.substring(0, 200));
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
    "hot stick": "Hot Sticks",
    "hotstick": "Hot Sticks",
    "insulated jumper": "Insulated Jumpers",
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

  lines.forEach(function(line, lineIdx) {
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

        // Look at the next 1-3 lines for "Comments:" field
        var fleetComment = '';
        for (var nextIdx = lineIdx + 1; nextIdx <= lineIdx + 3 && nextIdx < lines.length; nextIdx++) {
          var nextLine = lines[nextIdx].trim();
          if (!nextLine) continue;
          // If the next line starts a new equipment section, stop
          var nextLower = nextLine.toLowerCase();
          var isNewSection = false;
          for (var kw in equipmentKeywords) {
            if (nextLower.indexOf(kw) !== -1) { isNewSection = true; break; }
          }
          if (isNewSection) break;
          // Look for "Comments:" label
          var commentMatch = nextLine.match(/^comments?\s*:?\s*(.+)$/i);
          if (commentMatch && commentMatch[1]) {
            var cText = commentMatch[1].trim();
            if (cText.length >= 5 && !/^(n\/?a|none|ok|good|yes|no|na)$/i.test(cText)) {
              fleetComment = cText;
            }
            break; // Found (or explicitly empty) - stop looking
          }
        }

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
          fleetComment,                    // Notes - from Comments field
          context.subject || "",           // Email Subject
          context.receivedDate || ""       // Received Date
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
   * Extracts the PDF "Comments:" field that immediately follows a Yes/No match.
   * The Safety Checklist form has a Comments field under each equipment section.
   * Uses the match object's index to locate the right comment in the normalized text.
   * @param {Object} matchObj - Return value of text.match(pattern) - has .index
   * @returns {string} - Comment text, or "" if none found / trivial value
   */
  function extractPdfComment(matchObj) {
    if (!matchObj || matchObj.index === undefined) return '';
    var afterPos = matchObj.index + matchObj[0].length;
    var windowText = text.substring(afterPos, Math.min(afterPos + 700, text.length));

    // Strategy 1: original lookahead regex (stops before next capitalized section with "?")
    var cm = windowText.match(/comments?\s*:?\s*([A-Za-z0-9][^?]{4,300}?)(?=\s*(?:[A-Z][a-z][^?:\n]{0,45}?\?|$))/i);
    if (cm && cm[1]) {
      var c1 = cm[1].trim().replace(/\s+/g, ' ');
      // Reject trivial/non-actionable values and section header words
      if (c1.length >= 5 && !/^(n\/?a|none|ok|good|yes|no|na|-+)$/i.test(c1) && !/\?:/.test(c1)
          && !/^(?:Trucks?|Misc\s*Comments?|Tools?|General|Are\s+the)$/i.test(c1)) {
        return c1;
      }
    }

    // Strategy 2: find first "Comments:" then grab to next "Comments:" OR known field/section header
    var labelMatch = windowText.match(/comments?\s*:?\s*/i);
    if (!labelMatch) return '';
    var afterLabel = windowText.substring(labelMatch.index + labelMatch[0].length);

    var nextCmIdx = afterLabel.search(/\s+comments?\s*:/i);
    // Stop at known question-style headers (e.g. "Good condition?:")
    // Also stop at Trucks section and Misc Comments to prevent comment bleed-through
    var fieldStop = afterLabel.search(/\s+(?:Test Date|Insulated Jumpers|Good condition|Fully Stocked|Properly charged|Monthly inspection|Expiration|AED|Fall Protection|Harnesses|Crane|Mileage|Signs|Triangles|Cones|Hot Hoist|Barriers|Fire Extinguisher|Hot Stick|Rubber|First Aid|Manuf|Trucks|Misc\s*Comments?|Tires|Wheel\s*chocks?|Brakes?|Wipers?|Horn\b|Heater|Seat\s*Belts?|Reflectors?|Warning\s*Lights?)\s*[?:.]?\s*(?:Yes|No|NA|Are\s)/i);
    // Stop on AED-specific line items to prevent them from bleeding into previous comments
    var aedStop = afterLabel.search(/\s*(?:2\s*sets?\s*of\s*defibrillation\s*pads|Expiration\s*date\s*of\s*pads\s*Set\s*[1-2]|Visual\s*Rescue\s*Ready\s*Light\s*is)\b/i);
    // Also stop at standalone section-header words at the start of a line (no ? or : required)
    // This prevents comment text from one section bleeding into the next section's header
    var lineHeaderStop = afterLabel.search(/\n\s*(?:Cones|Triangles|Signs|Barriers|Hot Hoist|Hot Stick|Chains|Chokers|AED|Fall Protection|Harnesses|Crane|Mileage|Fire Extinguisher|Insulated Jumpers|First Aid|Rubber Goods|Trucks)\s*\n/i);
    // Also stop at inline section headers (for normalized text without newlines)
    var inlineStop = afterLabel.search(/\s+(?:Trucks|Misc\s*Comments?)\s+(?:Are\s|Comments?\s*:)/i);
    if (inlineStop >= 0) fieldStop = (fieldStop >= 0) ? Math.min(fieldStop, inlineStop) : inlineStop;

    var stopAt = afterLabel.length;
    if (nextCmIdx  >= 0) stopAt = Math.min(stopAt, nextCmIdx);
    if (fieldStop  >= 0) stopAt = Math.min(stopAt, fieldStop);
    if (aedStop   >= 0) stopAt = Math.min(stopAt, aedStop);
    if (lineHeaderStop >= 0) stopAt = Math.min(stopAt, lineHeaderStop);
    stopAt = Math.min(stopAt, 500);

    var rawComment = afterLabel.substring(0, stopAt).trim().replace(/\s+/g, ' ');
    if (rawComment.length < 5) return '';
    // Reject if it captures a form question rather than actual comment text
    if (/\?:/.test(rawComment)) return '';
    // Reject standalone section labels (only word chars and slashes, no spaces or punctuation)
    if (/^[\w\/]+$/.test(rawComment)) return '';
    if (/^(n\/?a|none|ok|good|yes|no|na|-+)$/i.test(rawComment)) return '';
    return rawComment;
  }

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

            // Extract comment from the PDF form's Comments field for this equipment section
            var pdfComment = extractPdfComment(match);
            if (pdfComment) {
              Logger.log("  ** PDF Comment for " + equipmentType + ": " + pdfComment);
            }

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
              pdfComment,                      // Notes - from PDF Comments field
              context.subject || "",           // Email Subject
              context.receivedDate || ""       // Received Date
            ]);

            // Only match once per equipment type
            return;
          }

          // Even when the item passes (value !== issueValue), check for actionable comments.
          // e.g. "Insulated Jumpers Good condition?: Yes Comments: 8' 2/0 ground needs tested..."
          var commentFlagKey = flagKey + '_note';
          if (value !== issueValue && !flagged[commentFlagKey] && !flagged[flagKey]) {
            var passComment = extractPdfComment(match);
            if (passComment) {
              // Only create a row if the comment contains actionable language
              var isActionable = /needs?\s|need\s|requir|replac|expir|missing|broken|fix|repair|no\s+(?:log|book|manual)|not\s+in|not\s+have|do\s+not\s+have|don'?t\s+have|without|absent|lack|test(?:ed|ing)?\s|due|date\s+of\s+\d{4}|200\d|201\d|202[0-5]/i.test(passComment);
              if (isActionable) {
                flagged[commentFlagKey] = true;
                Logger.log("  ** NOTE (passed check but has actionable comment): " + equipmentType + " - " + passComment.substring(0, 80));
                var noteDesc = equipmentType + " - Note: " + passComment.substring(0, 80);
                issues.push([
                  context.date,
                  context.reportType,
                  context.jobNumber,
                  context.foreman,
                  context.vehicleNumber,
                  equipmentType,
                  noteDesc,
                  "Needs Attention",
                  testDate || "",
                  context.messageId,
                  passComment,
                  context.subject || "",
                  context.receivedDate || ""
                ]);
              }
            }
          }
        }
      }

  // ==== GENERAL EQUIPMENT SECTION ====

  // First Aid Kit
  checkEquipment("First Aid Kit", "Fully Stocked", /fully\s*stocked\s*:?\s*(yes|no)/i, "no", "Not fully stocked");

  // Cones
  // "No" = not in good condition; "NA" = not applicable = not present on vehicle (also an issue)
  checkEquipment("Cones", "Good Condition", /cones\s+good\s*condition\s*\??\s*:?\s*(yes|no)/i, "no", "Cones not in good condition");
  checkEquipment("Cones", "Not Present", /cones\s+good\s*condition\s*\??\s*:?\s*(na|n\/a)/i, "na", "Cones not present on vehicle");
  // Also catch n/a variant
  checkEquipment("Cones", "Not Present", /cones\s+good\s*condition\s*\??\s*:?\s*(n\/a)/i, "n/a", "Cones not present on vehicle");

  // Triangles
  checkEquipment("Triangles", "Good Condition", /triangles?\s+good\s*condition\s*\??\s*:?\s*(yes|no)/i, "no", "Triangles not in good condition");
  checkEquipment("Triangles", "Need More", /triangles?[^]*?need\s*more\s*\??\s*:?\s*(yes|no)/i, "yes", "Need more triangles");

  // Signs
  checkEquipment("Signs", "Good Condition", /signs?\s+good\s*condition\s*\??\s*:?\s*(yes|no)/i, "no", "Signs not in good condition");
  checkEquipment("Signs", "Full Set", /signs?[^]*?full\s*set\s*\??\s*:?\s*(yes|no)/i, "no", "Signs - not a full set");

  // Hot Sticks
  checkEquipment("Hot Sticks", "Good Condition", /hot\s*sticks?\s+good\s*condition\s*\??\s*:?\s*(yes|no)/i, "no", "Hot Sticks not in good condition");

  // Insulated Jumpers (note: PDF form has "Insulated Jumpers:" with colon before "Good condition?")
  checkEquipment("Insulated Jumpers", "Good Condition", /insulated\s*jumpers?[\s:]+good\s*condition\s*\??\s*:?\s*(yes|no)/i, "no", "Insulated Jumpers not in good condition");

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

        // Extract comment from the PDF form's Comments field for this FE section
        var pdfComment = extractPdfComment(match);
        if (pdfComment) {
          Logger.log("  ** PDF Comment for Fire Extinguisher: " + pdfComment);
        }

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
          pdfComment,                      // K: Notes - from PDF Comments field
          context.subject || "",           // L: Email Subject
          context.receivedDate || ""       // M: Received Date
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
      context.subject || "",  // L: Email Subject
      context.receivedDate || ""  // M: Received Date
    ]);
    Logger.log("  ** ISSUE: Fire Extinguisher Expired");
  }

  // ==== AED SECTION ====
  checkEquipment("AED", "Damage Visible", /any\s*damage\s*visible\s*\??\s*:?\s*(yes|no)/i, "yes", "AED has visible damage");
  
  // We can ignore 2 sets of defibrillation pads and Expiration date of pads Set 2 line items per user request
  // checkEquipment("AED", "2 Sets of Pads", /2\s*sets?\s*of\s*defibrillation\s*pads\s*\.?\s*:?\s*(yes|no)/i, "no", "AED does not have 2 sets of pads");

  // Check AED Pad Set 1 Expiration Date (Set 1 is the only pad date we need to look at)
  var aedPad1Match = text.match(/expiration\s*date\s*of\s*pads\s*set\s*1\s*:?\s*([A-Za-z]{3,9}\s+\d{1,2},?\s+\d{4})/i);
  if (!aedPad1Match) {
    aedPad1Match = text.match(/expiration\s*date\s*of\s*pads\s*set\s*1\s*:?\s*(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4})/i);
  }

  var aedPad1Date = null;
  var aedPad1IsExpired = false;

  if (aedPad1Match) {
    var aedPad1DateStr = aedPad1Match[1];
    Logger.log("  Found AED Pad Set 1 Expiration Date: " + aedPad1DateStr);
    try {
      var parsedDate = new Date(aedPad1DateStr);
      if (!isNaN(parsedDate.getTime())) {
        aedPad1Date = new Date(parsedDate.getFullYear(), parsedDate.getMonth(), parsedDate.getDate(), 12, 0, 0);
        aedPad1IsExpired = (new Date() > aedPad1Date);
        Logger.log("  AED Pad Set 1 Date: " + aedPad1Date.toDateString() + ", Expired: " + aedPad1IsExpired);
      }
    } catch (e) {
      Logger.log("  Could not parse AED Pad Set 1 Expiration Date: " + e);
    }
  }

  if (aedPad1IsExpired && !flagged["AED_Pads_Expired"]) {
    flagged["AED_Pads_Expired"] = true;
    issues.push([
      context.date,
      context.reportType,
      context.jobNumber,
      context.foreman,
      context.vehicleNumber,
      "AED",
      "AED Pads EXPIRED - Set 1 Expiration: " + Utilities.formatDate(aedPad1Date, Session.getScriptTimeZone(), "MMM dd, yyyy"),
      "Needs Attention",
      aedPad1Date,  // Column I: Test/Expiration Date
      context.messageId,
      "", // Note
      context.subject || "",
      context.receivedDate || ""
    ]);
    Logger.log("  ** ISSUE: AED Pads Expired (Set 1)");
  }

  // AED = NA means the vehicle does not have an AED at all — flag it
  // Pattern: "Any damage visible?:NA" indicates no AED present on this vehicle
  if (!flagged['AED_Not Present']) {
    var aedNaMatch = text.match(/any\s*damage\s*visible\s*\??\s*:?\s*(na|n\/a)/i);
    if (aedNaMatch) {
      flagged['AED_Not Present'] = true;
      Logger.log("  ** ISSUE: AED - Not present on vehicle (NA)");
      issues.push([
        context.date,
        context.reportType,
        context.jobNumber,
        context.foreman,
        context.vehicleNumber,
        "AED",
        "AED not present on vehicle (N/A reported)",
        "Needs Attention",
        testDate || "",
        context.messageId,
        "",
        context.subject || "",
        context.receivedDate || ""
      ]);
    }
  }

  // ==== FALL PROTECTION SECTION ====
  checkEquipment("Fall Protection", "Good Condition", /fall\s*protection\s*gear\s+good\s*condition\s*\??\s*:?\s*(yes|no)/i, "no", "Fall Protection gear not in good condition");

  // Harnesses/Lanyards
  checkEquipment("Harnesses/Lanyards", "Good Condition", /harnesses?\s*\/?\s*lanyards?\s+good\s*condition\s*\??\s*:?\s*(yes|no)/i, "no", "Harnesses/Lanyards not in good condition");

  // ==== TOOLS SECTION ====
  checkEquipment("Hot Hoist", "Good Condition", /hot\s*hoist\s+good\s*condition\s*\??\s*:?\s*(yes|no)/i, "no", "Hot Hoist not in good condition");
  checkEquipment("Chains/Chokers/Slings", "Tagged", /chains?,?\s*chokers?,?\s*slings?\s+tagged\s*\??\s*:?\s*(yes|no)/i, "no", "Chains/Chokers/Slings not tagged");
  checkEquipment("Barriers", "Good Condition", /barriers?\s+good\s*condition\s*\??\s*:?\s*(yes|no)/i, "no", "Barriers not in good condition");

  // ==== TRUCKS SECTION ====
  // Wheel chocks are safety equipment required on all trucks
  checkEquipment("Wheel Chocks", "Wheel Chocks", /wheel\s*chocks?\s*:?\s*(yes|no)/i, "no", "Wheel chocks missing or needed");

  // NOTE: We intentionally do NOT track mechanical items like Brakes, Lights, Mirrors, Windows, etc.
  // These are vehicle maintenance issues, not safety equipment issues.
  // Only Horn and Wipers are safety-related (visibility and signaling) but even those
  // are vehicle maintenance, not the safety equipment this report is designed to track.

  // REMOVED: Wipers, Horn, Reflectors, Warning Lights, Brakes, Lights, Mirrors,
  //          Windshield, Defrost, Windows, Heater, Seat Belts
  // These are all vehicle mechanical/maintenance items that should go to Fleet, not Safety Manager

  // ==== MISC COMMENTS SECTION ====
  // Extract from the normalized "Misc Comments Comments: [text]" structure.
  // The text is normalized (no newlines), so we look for the section inline.
  // Stop before page-2 duplicate content (starts with vehicle# pattern like "3015 028 26").
  var miscMatch = text.match(/misc\s*comments?\s+comments?\s*:?\s*(.{5,400}?)(?=\s*\d{4}[\s\-]+\d{3}[\s\-]+\d{2}\s+\d{2}|$)/i);
  if (miscMatch && miscMatch[1]) {
    var miscText = miscMatch[1].trim().replace(/\s+/g, ' ');
    Logger.log("  Misc Comments text: " + miscText.substring(0, 150));

    if (miscText.length >= 5 && !/^(n\/?a|none|ok|good|-)$/i.test(miscText)) {

      // --- AED missing from truck (overrides the generic NA check above) ---
      if (/no\s+aed|aed\s+(?:not\s+in|missing|absent|not\s+present)|without\s+aed/i.test(miscText) && !flagged['AED_Not Present']) {
        flagged['AED_Not Present'] = true;
        Logger.log("  ** ISSUE: AED - Misc Comments says no AED");
        issues.push([
          context.date, context.reportType, context.jobNumber, context.foreman,
          context.vehicleNumber, "AED",
          "AED not present - Misc Comments: " + miscText.substring(0, 100),
          "Needs Attention", testDate || "", context.messageId, miscText,
          context.subject || "", context.receivedDate || ""
        ]);
      }

      // --- Hot Sticks/rubber goods need retesting ---
      if (/sticks?\s+need|needs?\s+retest|retest(?:ed|ing)?\s+sticks?|rubber\s+goods?\s+need/i.test(miscText) && !flagged['Hot Sticks_MiscNote']) {
        flagged['Hot Sticks_MiscNote'] = true;
        Logger.log("  ** ISSUE: Hot Sticks - Misc Comments indicate retesting needed");
        issues.push([
          context.date, context.reportType, context.jobNumber, context.foreman,
          context.vehicleNumber, "Hot Sticks",
          "Hot Sticks - Misc Comments: " + miscText.substring(0, 100),
          "Needs Attention", testDate || "", context.messageId, miscText,
          context.subject || "", context.receivedDate || ""
        ]);
      }

      // --- Any other actionable Misc Comment (exclude pure vehicle/mechanical issues) ---
      var isMiscActionable = /needs?\s|need\s|fell\s+off|damaged?|broken|missing|replac|requir|loose|leaking/i.test(miscText);
      var isMechanicalOnly = /^(?:only\s+)?(?:oil|tire|brake|engine|fuel|coolant|battery|transmission)\b/i.test(miscText);
      if (isMiscActionable && !isMechanicalOnly && !flagged['Misc_General']) {
        flagged['Misc_General'] = true;
        Logger.log("  ** ISSUE: General Misc Comment: " + miscText.substring(0, 80));
        issues.push([
          context.date, context.reportType, context.jobNumber, context.foreman,
          context.vehicleNumber, "Other",
          "Misc Comment: " + miscText.substring(0, 100),
          "Needs Attention", testDate || "", context.messageId, miscText,
          context.subject || "", context.receivedDate || ""
        ]);
      }
    }
  }

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
  // Sub Tech (equivalent to Apprentice)
  if (classLower.match(/^st\s*7/)) return 20;
  if (classLower.match(/^st\s*6/)) return 21;
  if (classLower.match(/^st\s*5/)) return 22;
  if (classLower.match(/^st\s*4/)) return 23;
  if (classLower.match(/^st\s*3/)) return 24;
  if (classLower.match(/^st\s*2/)) return 25;
  if (classLower.match(/^st\s*1/)) return 26;
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

  // Return cached result if available
  if (_foremanByJobCache[jobNumber]) {
    return _foremanByJobCache[jobNumber];
  }

  // Use cached Employees data (reads sheet only once per execution)
  var data = getCachedEmployeesData();
  if (!data) return { name: "", jobExists: false };
  var headers = data[0];

  // Find column indices dynamically
  var nameCol = -1, jobCol = -1, classCol = -1, secondaryJobCol = -1;
  for (var h = 0; h < headers.length; h++) {
    var header = String(headers[h]).toLowerCase().trim();
    if (header === "job number") jobCol = h;
    if (header === "secondary job number") secondaryJobCol = h;
    if (header === "job classification" || header === "classification") classCol = h;
  }
  nameCol = getEmployeeNameColumnIndex(headers);

  if (nameCol === -1) nameCol = 0;
  if (jobCol === -1) return { name: "", jobExists: false };

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

    if (matchesPrimary || matchesSecondary) {
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
    var result = { name: "", jobExists: jobExists };
    _foremanByJobCache[jobNumber] = result;
    return result;
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

  var result = { name: crewMembers[0].name, jobExists: true };
  _foremanByJobCache[jobNumber] = result;
  return result;
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
    if (header === "job number") jobCol = h;
    if (header === "secondary job number") secondaryJobCol = h;
    if (header === "job classification" || header === "classification") classCol = h;
    // Match various phone column header formats
    if (header === "phone" || header === "phone number" || header === "phone #" || header === "cell" || header === "cell phone") phoneCol = h;
  }
  nameCol = getEmployeeNameColumnIndex(headers);

  // Use COLS constants as fallback if headers don't match
  // COLS.EMPLOYEES.NAME = 1 (column A, 0-based index 0)
  // COLS.EMPLOYEES.JOB_NUMBER = 4 (column D, 0-based index 3)
  // COLS.EMPLOYEES.PHONE = 5 (column E, 0-based index 4)
  if (nameCol === -1) nameCol = 0;
  if (jobCol === -1) jobCol = 3;
  if (phoneCol === -1) phoneCol = 4;
  if (jobCol === -1) return "";

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
 * Loads ALL existing compliance data for a specific week from Safety Compliance sheet.
 * Used to preserve historical data including N/A values when recalculating past weeks.
 * This is critical because work schedules can change week to week (e.g., Mon-Fri to Mon-Thu).
 *
 * @param {Spreadsheet} ss - Active spreadsheet
 * @param {Date} weekStart - Start date of the week (Sunday)
 * @param {string} tz - Timezone
 * @returns {Object} Map of jobNumber -> {foreman, days: {Sun, Mon, ...}, weeklyMeeting, monthlyChecklist, status}
 */
function loadExistingComplianceForWeek(ss, weekStart, tz) {
  var existingData = {};
  var complianceSheet = ss.getSheetByName('Safety Compliance');

  if (!complianceSheet || complianceSheet.getLastRow() < 2) {
    return existingData;
  }

  var data = complianceSheet.getDataRange().getValues();
  var headers = data[0];

  // Find column indices
  var colIdx = {};
  for (var h = 0; h < headers.length; h++) {
    var header = String(headers[h]).toLowerCase().trim().replace(/\s+/g, '');
    if (header === 'weekstart') colIdx.weekStart = h;
    else if (header === 'jobnumber') colIdx.jobNumber = h;
    else if (header === 'foreman') colIdx.foreman = h;
    else if (header === 'status') colIdx.status = h;
    else if (header === 'sun') colIdx.sun = h;
    else if (header === 'mon') colIdx.mon = h;
    else if (header === 'tue') colIdx.tue = h;
    else if (header === 'wed') colIdx.wed = h;
    else if (header === 'thu') colIdx.thu = h;
    else if (header === 'fri') colIdx.fri = h;
    else if (header === 'sat') colIdx.sat = h;
    else if (header === 'weeklymeeting') colIdx.weeklyMeeting = h;
    else if (header === 'monthly' || header === 'monthlychecklist') colIdx.monthly = h;
  }

  if (colIdx.weekStart === undefined || colIdx.jobNumber === undefined) {
    Logger.log("loadExistingComplianceForWeek: Required columns not found");
    return existingData;
  }

  var targetWeekStr = Utilities.formatDate(weekStart, tz, 'yyyy-MM-dd');

  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var rowWeekStart = row[colIdx.weekStart];
    var rowJob = String(row[colIdx.jobNumber] || '').trim();

    if (!rowWeekStart || !rowJob) continue;

    // Match week
    var rowWeekDate = (rowWeekStart instanceof Date) ? rowWeekStart : new Date(rowWeekStart);
    var rowWeekStr = Utilities.formatDate(rowWeekDate, tz, 'yyyy-MM-dd');

    if (rowWeekStr !== targetWeekStr) continue;

    // Store all the existing data for this crew/week
    existingData[rowJob] = {
      foreman: colIdx.foreman !== undefined ? String(row[colIdx.foreman] || '') : '',
      status: colIdx.status !== undefined ? String(row[colIdx.status] || '') : '',
      days: {
        'Sun': colIdx.sun !== undefined ? String(row[colIdx.sun] || '') : '',
        'Mon': colIdx.mon !== undefined ? String(row[colIdx.mon] || '') : '',
        'Tue': colIdx.tue !== undefined ? String(row[colIdx.tue] || '') : '',
        'Wed': colIdx.wed !== undefined ? String(row[colIdx.wed] || '') : '',
        'Thu': colIdx.thu !== undefined ? String(row[colIdx.thu] || '') : '',
        'Fri': colIdx.fri !== undefined ? String(row[colIdx.fri] || '') : '',
        'Sat': colIdx.sat !== undefined ? String(row[colIdx.sat] || '') : ''
      },
      weeklyMeeting: colIdx.weeklyMeeting !== undefined ? String(row[colIdx.weeklyMeeting] || '') : '',
      monthlyChecklist: colIdx.monthly !== undefined ? String(row[colIdx.monthly] || '') : ''
    };
  }

  Logger.log("loadExistingComplianceForWeek: Found existing data for " + Object.keys(existingData).length + " crews for week " + targetWeekStr);
  return existingData;
}

/**
 * Loads crews with "Resolved" status for a specific week from Safety Compliance sheet.
 * These crews should not have tasks recreated or statuses recalculated.
 *
 * @param {Spreadsheet} ss - Active spreadsheet
 * @param {Date} weekStart - Start date of the week (Sunday)
 * @param {string} tz - Timezone
 * @returns {Object} Map of jobNumber -> {status, days, weeklyMeetingStatus, monthlyChecklistStatus}
 */
function loadResolvedCrewsForWeek(ss, weekStart, tz) {
  var resolvedCrews = {};
  var complianceSheet = ss.getSheetByName('Safety Compliance');

  if (!complianceSheet || complianceSheet.getLastRow() < 2) {
    return resolvedCrews;
  }

  var data = complianceSheet.getDataRange().getValues();
  var headers = data[0];

  // Find column indices
  var colIdx = {};
  for (var h = 0; h < headers.length; h++) {
    var header = String(headers[h]).toLowerCase().trim().replace(/\s+/g, '');
    if (header === 'weekstart') colIdx.weekStart = h;
    else if (header === 'jobnumber') colIdx.jobNumber = h;
    else if (header === 'status') colIdx.status = h;
    else if (header === 'sun') colIdx.sun = h;
    else if (header === 'mon') colIdx.mon = h;
    else if (header === 'tue') colIdx.tue = h;
    else if (header === 'wed') colIdx.wed = h;
    else if (header === 'thu') colIdx.thu = h;
    else if (header === 'fri') colIdx.fri = h;
    else if (header === 'sat') colIdx.sat = h;
    else if (header === 'weeklymeeting') colIdx.weeklyMeeting = h;
    else if (header === 'monthly' || header === 'monthlychecklist') colIdx.monthly = h;
  }

  if (colIdx.weekStart === undefined || colIdx.jobNumber === undefined || colIdx.status === undefined) {
    Logger.log("loadResolvedCrewsForWeek: Required columns not found");
    return resolvedCrews;
  }

  var targetWeekStr = Utilities.formatDate(weekStart, tz, 'yyyy-MM-dd');

  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var rowWeekStart = row[colIdx.weekStart];
    var rowJob = String(row[colIdx.jobNumber] || '').trim();
    var rowStatus = String(row[colIdx.status] || '').trim();

    if (!rowWeekStart || !rowJob) continue;

    // Match week
    var rowWeekDate = (rowWeekStart instanceof Date) ? rowWeekStart : new Date(rowWeekStart);
    var rowWeekStr = Utilities.formatDate(rowWeekDate, tz, 'yyyy-MM-dd');

    if (rowWeekStr !== targetWeekStr) continue;

    // Check if status is "Resolved" (set by delete or resolution recording)
    if (rowStatus === 'Resolved') {
      resolvedCrews[rowJob] = {
        status: 'Resolved',
        days: {
          'Sun': colIdx.sun !== undefined ? String(row[colIdx.sun] || '') : 'N/A',
          'Mon': colIdx.mon !== undefined ? String(row[colIdx.mon] || '') : 'N/A',
          'Tue': colIdx.tue !== undefined ? String(row[colIdx.tue] || '') : 'N/A',
          'Wed': colIdx.wed !== undefined ? String(row[colIdx.wed] || '') : 'N/A',
          'Thu': colIdx.thu !== undefined ? String(row[colIdx.thu] || '') : 'N/A',
          'Fri': colIdx.fri !== undefined ? String(row[colIdx.fri] || '') : 'N/A',
          'Sat': colIdx.sat !== undefined ? String(row[colIdx.sat] || '') : 'N/A'
        },
        weeklyMeetingStatus: colIdx.weeklyMeeting !== undefined ? String(row[colIdx.weeklyMeeting] || '') : 'N/A',
        monthlyChecklistStatus: colIdx.monthly !== undefined ? String(row[colIdx.monthly] || '') : 'N/A'
      };
      Logger.log("loadResolvedCrewsForWeek: Found Resolved crew " + rowJob + " for week " + targetWeekStr);
    }
  }

  return resolvedCrews;
}

/**
 * Load ALL existing crew data for a specific week from the Safety Compliance sheet
 * This preserves N/A values, foreman names, and day-by-day data for past weeks
 *
 * @param {Spreadsheet} ss - Spreadsheet object
 * @param {Date} weekStart - The start of the week to look for (Sunday)
 * @param {string} tz - Timezone
 * @return {Object} Map of jobNumber -> {foreman, dayStatuses: {sun, mon, tue, wed, thu, fri, sat}, status}
 */
function loadExistingWeekData(ss, weekStart, tz) {
  var complianceSheet = ss.getSheetByName('Safety Compliance');
  if (!complianceSheet || complianceSheet.getLastRow() < 2) return {};

  var data = complianceSheet.getDataRange().getValues();
  var headers = data[0];

  // Find column indices
  var cols = {};
  for (var h = 0; h < headers.length; h++) {
    var header = String(headers[h]).toLowerCase().trim().replace(/\s+/g, '');
    if (header === 'weekstart') cols.weekStart = h;
    else if (header === 'jobnumber') cols.jobNumber = h;
    else if (header === 'foreman') cols.foreman = h;
    else if (header === 'sun') cols.sun = h;
    else if (header === 'mon') cols.mon = h;
    else if (header === 'tue') cols.tue = h;
    else if (header === 'wed') cols.wed = h;
    else if (header === 'thu') cols.thu = h;
    else if (header === 'fri') cols.fri = h;
    else if (header === 'sat') cols.sat = h;
    else if (header === 'status') cols.status = h;
  }

  if (cols.weekStart === undefined || cols.jobNumber === undefined) {
    return {};
  }

  var targetWeekStr = Utilities.formatDate(weekStart, tz, 'yyyy-MM-dd');
  var existingData = {};

  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var rowWeekStart = row[cols.weekStart];

    if (!rowWeekStart) continue;

    var rowWeekDate = (rowWeekStart instanceof Date) ? rowWeekStart : new Date(rowWeekStart);
    var rowWeekStr = Utilities.formatDate(rowWeekDate, tz, 'yyyy-MM-dd');

    if (rowWeekStr === targetWeekStr) {
      var jobNumber = String(row[cols.jobNumber] || '').trim();
      if (jobNumber) {
        existingData[jobNumber] = {
          foreman: cols.foreman !== undefined ? String(row[cols.foreman] || '').trim() : '',
          dayStatuses: {
            sun: cols.sun !== undefined ? row[cols.sun] : '',
            mon: cols.mon !== undefined ? row[cols.mon] : '',
            tue: cols.tue !== undefined ? row[cols.tue] : '',
            wed: cols.wed !== undefined ? row[cols.wed] : '',
            thu: cols.thu !== undefined ? row[cols.thu] : '',
            fri: cols.fri !== undefined ? row[cols.fri] : '',
            sat: cols.sat !== undefined ? row[cols.sat] : ''
          },
          status: cols.status !== undefined ? String(row[cols.status] || '').trim() : ''
        };
      }
    }
  }

  Logger.log('loadExistingWeekData: Found ' + Object.keys(existingData).length + ' existing crews for week ' + targetWeekStr);
  return existingData;
}

/**
 * Gets all crew job numbers that already exist in Safety Compliance sheet for a given week
 * Used for past weeks to preserve historical data without adding new non-config crews
 *
 * @param {Spreadsheet} ss - Spreadsheet object
 * @param {Date} weekStart - Sunday of the week to check
 * @param {string} tz - Timezone
 * @returns {Array} Array of job numbers that exist for this week
 */
function getExistingCrewsForWeek(ss, weekStart, tz) {
  var crews = [];
  var complianceSheet = ss.getSheetByName('Safety Compliance');

  if (!complianceSheet || complianceSheet.getLastRow() < 2) {
    return crews;
  }

  var data = complianceSheet.getDataRange().getValues();
  var headers = data[0];

  // Find column indices
  var weekStartCol = -1;
  var jobNumberCol = -1;
  for (var h = 0; h < headers.length; h++) {
    var header = String(headers[h]).toLowerCase().trim().replace(/\s+/g, '');
    if (header === 'weekstart') weekStartCol = h;
    else if (header === 'jobnumber') jobNumberCol = h;
  }

  if (weekStartCol === -1 || jobNumberCol === -1) {
    Logger.log("getExistingCrewsForWeek: Required columns not found");
    return crews;
  }

  var targetWeekStr = Utilities.formatDate(weekStart, tz, 'yyyy-MM-dd');
  var crewSet = {};

  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var rowWeekStart = row[weekStartCol];
    var rowJob = String(row[jobNumberCol] || '').trim();

    if (!rowWeekStart || !rowJob) continue;
    var lowerJob = rowJob.toLowerCase();
    if (lowerJob === 'job number' || lowerJob === 'job #' || lowerJob === 'job' || lowerJob === 'foreman') continue;

    // Match week
    var rowWeekDate = (rowWeekStart instanceof Date) ? rowWeekStart : new Date(rowWeekStart);
    var rowWeekStr = Utilities.formatDate(rowWeekDate, tz, 'yyyy-MM-dd');

    if (rowWeekStr === targetWeekStr) {
      crewSet[rowJob] = true;
    }
  }

  crews = Object.keys(crewSet).sort();
  Logger.log("getExistingCrewsForWeek: Found " + crews.length + " existing crews for week " + targetWeekStr);
  return crews;
}

/**
 * Gets crews that have log data (JHA or Weekly Safety) for a specific week
 * Used to ensure crews with logged data are included even if their row was deleted
 *
 * @param {Spreadsheet} ss - The spreadsheet
 * @param {Object} weekBounds - Week boundaries {weekStart, weekEnd}
 * @param {Array<string>} configCrews - List of crews in Safety Compliance Config
 * @returns {Array<string>} - List of crew job numbers found in logs for this week
 */
function getCrewsWithLogDataForWeek(ss, weekBounds, configCrews) {
  var crewsFound = {};

  // Create a set of config crews for fast lookup
  var configCrewSet = {};
  configCrews.forEach(function(c) { configCrewSet[c] = true; });

  // Check JHA Log
  var jhaLog = ss.getSheetByName('JHA Log');
  if (jhaLog && jhaLog.getLastRow() > 1) {
    var jhaData = jhaLog.getRange(2, 1, jhaLog.getLastRow() - 1, 10).getValues();
    var jhaHeaders = jhaLog.getRange(1, 1, 1, 10).getValues()[0];

    var dateCreatedCol = -1, creditedToCol = -1;
    for (var h = 0; h < jhaHeaders.length; h++) {
      var header = String(jhaHeaders[h]).toLowerCase().trim();
      if (header === 'date created') dateCreatedCol = h;
      if (header === 'credited to') creditedToCol = h;
    }

    if (dateCreatedCol >= 0 && creditedToCol >= 0) {
      for (var i = 0; i < jhaData.length; i++) {
        var dateCreated = jhaData[i][dateCreatedCol];
        var creditedTo = String(jhaData[i][creditedToCol] || '').trim();

        if (!dateCreated || !creditedTo) continue;
        var lowerCredited = creditedTo.toLowerCase();
        if (lowerCredited === 'job number' || lowerCredited === 'credited to' || lowerCredited === 'job #') continue;

        var d = new Date(dateCreated);
        if (isNaN(d.getTime())) continue;

        // Check if date falls within the week
        if (d >= weekBounds.weekStart && d <= weekBounds.weekEnd) {
          // Only include if it's in the config
          if (configCrewSet[creditedTo]) {
            crewsFound[creditedTo] = true;
          }
        }
      }
    }
  }

  // Check Weekly Safety Log
  var weeklyLog = ss.getSheetByName('Weekly Safety Log');
  if (weeklyLog && weeklyLog.getLastRow() > 1) {
    var weeklyData = weeklyLog.getRange(2, 1, weeklyLog.getLastRow() - 1, 10).getValues();
    var weeklyHeaders = weeklyLog.getRange(1, 1, 1, 10).getValues()[0];

    var weekOfCol = -1, creditedToCol2 = -1;
    for (var h = 0; h < weeklyHeaders.length; h++) {
      var header = String(weeklyHeaders[h]).toLowerCase().trim();
      if (header === 'week of' || header === 'date created') weekOfCol = h;
      if (header === 'credited to') creditedToCol2 = h;
    }

    if (weekOfCol >= 0 && creditedToCol2 >= 0) {
      for (var i = 0; i < weeklyData.length; i++) {
        var weekOf = weeklyData[i][weekOfCol];
        var creditedTo = String(weeklyData[i][creditedToCol2] || '').trim();

        if (!weekOf || !creditedTo) continue;

        var d = new Date(weekOf);
        if (isNaN(d.getTime())) continue;

        // Check if date falls within the week
        if (d >= weekBounds.weekStart && d <= weekBounds.weekEnd) {
          // Only include if it's in the config
          if (configCrewSet[creditedTo]) {
            crewsFound[creditedTo] = true;
          }
        }
      }
    }
  }

  var result = Object.keys(crewsFound);
  Logger.log("getCrewsWithLogDataForWeek: Found " + result.length + " crews with log data: " + result.join(', '));
  return result;
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
 * - Weeks 1-2: \u23F3 (yellow/pending) - plenty of time, does NOT affect crew status
 * - Week 3: \u26A0\uFE0F (orange/warning) - getting close, sets status to Pending
 * - Week 4/Final week: \u274C\u23F3 (red hourglass) - urgent, sets status to Pending
 * - After month ends: \u274C (red missing) - deadline passed, sets status to Missing Reports
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

  // If checklist was submitted, show \u2705 for all weeks in the same month
  // The received date will be shown in the tooltip instead of the cell
  if (hasSubmitted && checklistDate) {
    var checklistMonth = new Date(checklistDate).getMonth();
    var checklistYear = new Date(checklistDate).getFullYear();
    var targetMonth = weekStartDate.getMonth();
    var targetYear = weekStartDate.getFullYear();

    // If checklist was received in the same month as the target week, show \u2705
    if (checklistYear === targetYear && checklistMonth === targetMonth) {
      return { status: '\u2705', cssClass: 'ok', shouldCreateTask: false, affectsStatus: false };
    }

    // If checklist was received in a LATER month (shouldn't happen), still show \u2705
    if (checklistYear > targetYear || (checklistYear === targetYear && checklistMonth > targetMonth)) {
      return { status: '\u2705', cssClass: 'ok', shouldCreateTask: false, affectsStatus: false };
    }
  }

  // Legacy support: if hasSubmitted is true but no date provided, show checkmark
  if (hasSubmitted) {
    return { status: '\u2705', cssClass: 'ok', shouldCreateTask: false, affectsStatus: false };
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
    return { status: '\u274C', cssClass: 'missing', shouldCreateTask: true, affectsStatus: true };
  }

  // We're still in the same month as the week being evaluated
  var todayWeekInfo = getWeekOfMonth(today);

  if (todayWeekInfo.isLastWeek || todayWeekInfo.weekNumber >= 4) {
    // Final week of month - urgent (red hourglass) but not yet past deadline
    // This DOES affect status (Pending) because deadline is imminent
    return { status: '\u274C\u23F3', cssClass: 'urgent', shouldCreateTask: false, affectsStatus: true };
  } else if (todayWeekInfo.weekNumber === 3) {
    // Week 3 - warning (orange)
    // This DOES affect status (Pending) because deadline is approaching
    return { status: '\u26A0\uFE0F', cssClass: 'warning', shouldCreateTask: false, affectsStatus: true };
  } else {
    // Weeks 1-2 - pending (yellow)
    // This does NOT affect status - crew is "Complete" for weekly items even if Monthly not submitted yet
    return { status: '\u23F3', cssClass: 'pending', shouldCreateTask: false, affectsStatus: false };
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
    sheet.setColumnWidth(i, 55); // Day columns
  }
  sheet.setColumnWidth(11, 100); // Weekly Meeting
  sheet.setColumnWidth(12, 110); // Monthly Checklist
  sheet.setColumnWidth(13, 120); // Status
  sheet.setColumnWidth(14, 150); // Updated

  // Date format for Week Start
  sheet.getRange(2, 1, 1000, 1).setNumberFormat("MM/dd/yyyy");

  // Add data validation dropdowns for day columns (D-J) and Weekly Meeting (K)
  var dayValues = ['\u2705', '\u2705L', '\u274C', 'N/A', '\u23F3', ''];
  var dayRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(dayValues, true)
    .setAllowInvalid(true)  // Allow other values to be typed
    .build();
  sheet.getRange(2, 4, 1000, 8).setDataValidation(dayRule);  // Columns D-K (days + weekly meeting)

  // Add data validation for Status column (M)
  var statusValues = ['Complete', 'Missing Reports', 'Pending', 'Resolved'];
  var statusRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(statusValues, true)
    .setAllowInvalid(false)
    .build();
  sheet.getRange(2, 13, 1000, 1).setDataValidation(statusRule);

  // Add conditional formatting for status icons
  var dayRange = sheet.getRange("D2:L1001");
  var rules = sheet.getConditionalFormatRules();

  // Yellow-green for \u2705L (LATE submission - received but after deadline)
  // Must come BEFORE the \u2705 rule since that uses "contains"
  var lateRule = SpreadsheetApp.newConditionalFormatRule()
    .whenTextEqualTo("\u2705L")
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

  // Green for \u2705 (on-time submission)
  var checkRule = SpreadsheetApp.newConditionalFormatRule()
    .whenTextContains("\u2705")
    .setBackground("#D9EAD3")
    .setRanges([dayRange])
    .build();
  rules.push(checkRule);

  // Orange for \u26A0\uFE0F (Monthly Checklist warning - Week 3)
  var warningRule = SpreadsheetApp.newConditionalFormatRule()
    .whenTextContains("\u26A0\uFE0F")
    .setBackground("#FFE0B2")  // Light orange
    .setFontColor("#E65100")   // Dark orange text
    .setRanges([dayRange])
    .build();
  rules.push(warningRule);

  // Red/Pink for \u274C\u23F3 (Monthly Checklist urgent - Week 4, not yet past deadline)
  var urgentRule = SpreadsheetApp.newConditionalFormatRule()
    .whenTextContains("\u274C\u23F3")
    .setBackground("#FFCDD2")  // Light red/pink
    .setFontColor("#C62828")   // Dark red text
    .setRanges([dayRange])
    .build();
  rules.push(urgentRule);

  // Red for \u274C (but not \u274C\u23F3 since that's handled above)
  var xRule = SpreadsheetApp.newConditionalFormatRule()
    .whenTextEqualTo("\u274C")
    .setBackground("#F4CCCC")
    .setRanges([dayRange])
    .build();
  rules.push(xRule);

  // Yellow for \u23F3 (pending - Weeks 1-2 for Monthly, or regular pending)
  var pendingRule = SpreadsheetApp.newConditionalFormatRule()
    .whenTextContains("\u23F3")
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
 * Adds dropdown data validation to existing Safety Compliance sheet.
 * This makes it easy to change values by clicking and selecting from a dropdown.
 *
 * Called from: Glove Manager → Safety → Add Dropdowns to Safety Compliance
 */
function addDropdownsToSafetyCompliance() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("Safety Compliance");

  if (!sheet) {
    SpreadsheetApp.getUi().alert('Safety Compliance sheet not found.');
    return;
  }

  var lastRow = Math.max(sheet.getLastRow(), 100);

  // Add data validation dropdowns for day columns (D-J) and Weekly Meeting (K)
  // Include common variants that exist in the data
  var dayValues = ['\u2705', '\u2705L', '\u274C', '\u274CW', 'N/A', '\u23F3', ''];
  var dayRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(dayValues, true)
    .setAllowInvalid(true)  // MUST allow other values - existing data has variants
    .build();
  sheet.getRange(2, 4, lastRow, 8).setDataValidation(dayRule);  // Columns D-K

  // Add data validation for Status column (M)
  var statusValues = ['Complete', 'Missing Reports', 'Pending', 'Resolved'];
  var statusRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(statusValues, true)
    .setAllowInvalid(true)  // Allow flexibility
    .build();
  sheet.getRange(2, 13, lastRow, 1).setDataValidation(statusRule);

  // Also fix column widths for day columns (D-J)
  for (var i = 4; i <= 10; i++) {
    sheet.setColumnWidth(i, 55);
  }

  SpreadsheetApp.getUi().alert(
    '\u2705 Dropdowns Added!',
    'You can now click any day/meeting cell and select from a dropdown:\n\n' +
    '\u2022 \u2705 - Received on time\n' +
    '\u2022 \u2705L - Received late\n' +
    '\u2022 \u274C - Missing\n' +
    '\u2022 N/A - Skipped\n' +
    '\u2022 \u23F3 - Pending\n\n' +
    'Status column also has a dropdown.\nColumn widths adjusted to 55px.',
    SpreadsheetApp.getUi().ButtonSet.OK
  );

  Logger.log("addDropdownsToSafetyCompliance: Added dropdowns to " + lastRow + " rows");
}

/**
 * Cleans up the Safety Compliance sheet by replacing N/A with blank cells.
 * Blank cells will still have gray background from conditional formatting.
 * Tooltips are preserved/updated to explain the blank means "skipped".
 *
 * Called from: Glove Manager → Safety → 🧹 Cleanup N/A Cells
 */
function cleanupNACellsInCompliance() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Safety Compliance');

  if (!sheet || sheet.getLastRow() < 2) {
    SpreadsheetApp.getUi().alert('Safety Compliance sheet not found or empty.');
    return;
  }

  var tz = Session.getScriptTimeZone();
  var data = sheet.getDataRange().getValues();
  var replacedCount = 0;

  // Process each row
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var weekStart = row[0];
    var rowNum = i + 1;

    if (!weekStart) continue;

    // Check day columns D-J (indices 3-9 in 0-based, columns 4-10 in 1-based)
    for (var col = 4; col <= 10; col++) {
      var value = String(row[col - 1] || '').trim();

      if (value === 'N/A') {
        // Clear the cell but keep gray formatting via conditional formatting
        var cell = sheet.getRange(rowNum, col);
        cell.setValue('');

        // Calculate the date for this day
        var dayIdx = col - 4; // 0=Sun, 6=Sat
        var dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        var dayDate = new Date(weekStart);
        dayDate.setDate(dayDate.getDate() + dayIdx);
        var dateStr = Utilities.formatDate(dayDate, tz, 'MMM dd, yyyy');

        // Set tooltip to explain
        cell.setNote('📅 ' + dayNames[dayIdx] + ', ' + dateStr + '\n\n(Skipped - crew scheduled off this day)');
        replacedCount++;
      }
    }

    // Check Weekly Meeting column K (column 11, index 10)
    var weeklyValue = String(row[10] || '').trim();
    if (weeklyValue === 'N/A') {
      var weeklyCell = sheet.getRange(rowNum, 11);
      weeklyCell.setValue('');
      weeklyCell.setNote('📋 Weekly Safety Meeting\n\n(Skipped per config)');
      replacedCount++;
    }

    // Check Monthly Checklist column L (column 12, index 11)
    var monthlyValue = String(row[11] || '').trim();
    if (monthlyValue === 'N/A') {
      var monthlyCell = sheet.getRange(rowNum, 12);
      monthlyCell.setValue('');
      monthlyCell.setNote('📋 Monthly Fleet Checklist\n\n(Skipped per config)');
      replacedCount++;
    }
  }

  // Update conditional formatting to also apply gray to empty cells
  addBlankCellFormatting(sheet);

  SpreadsheetApp.getUi().alert(
    '🧹 Cleanup Complete',
    'Replaced ' + replacedCount + ' N/A cells with blank cells.\n\n' +
    'Blank cells now show gray background and have tooltips explaining they are skipped days.',
    SpreadsheetApp.getUi().ButtonSet.OK
  );

  Logger.log('cleanupNACellsInCompliance: Replaced ' + replacedCount + ' N/A cells');
}

/**
 * Adds conditional formatting for blank cells in Safety Compliance.
 * Blank cells in day columns (D-L) will show light gray background.
 */
function addBlankCellFormatting(sheet) {
  if (!sheet) {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    sheet = ss.getSheetByName('Safety Compliance');
  }

  if (!sheet) return;

  var rules = sheet.getConditionalFormatRules();
  var dayRange = sheet.getRange('D2:L1001');

  // Check if blank rule already exists
  var hasBlankRule = false;
  for (var r = 0; r < rules.length; r++) {
    var rule = rules[r];
    // Check if this is our blank cell rule (isBlank condition)
    try {
      if (rule.getBooleanCondition() &&
          rule.getBooleanCondition().getCriteriaType() === SpreadsheetApp.BooleanCriteria.CELL_EMPTY) {
        hasBlankRule = true;
        break;
      }
    } catch (e) {
      // Ignore errors checking rule type
    }
  }

  if (!hasBlankRule) {
    // Add rule for blank cells - light gray background
    var blankRule = SpreadsheetApp.newConditionalFormatRule()
      .whenCellEmpty()
      .setBackground('#EFEFEF')  // Light gray - same as N/A
      .setRanges([dayRange])
      .build();

    // Add at the END of the rules (lowest priority)
    rules.push(blankRule);
    sheet.setConditionalFormatRules(rules);

    Logger.log('addBlankCellFormatting: Added blank cell formatting rule');
  }
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

  // Get active crews directly from Job Tracking and populate
  var crewsData = getActiveCrewsFromJobTracking();
  if (crewsData.length > 0) {
    var rows = [];
    for (var i = 0; i < crewsData.length; i++) {
      var crew = crewsData[i];
      var foremanName = crew.foreman;
      if (!foremanName) {
        var foreman = lookupForemanByJobNumber(crew.jobNumber);
        foremanName = (foreman && foreman.name) ? foreman.name : "";
      }
      // Default: Skip Sun and Sat (weekends)
      rows.push([
        crew.jobNumber, foremanName,
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

  Logger.log("setupSafetyComplianceConfig: Created config with " + crewsData.length + " crews");
  return sheet;
}

/**
/**
 * Migrates settings from Safety Compliance Config sheet to Job Tracking sheet.
 * This is a ONE-TIME migration function.
 *
 * What it does:
 * 1. Reads all settings from Safety Compliance Config (skip days, foreman, notes)
 * 2. First ensures Job Tracking has the new columns (L-T) by calling migrateJobTrackingForComplianceConfig()
 * 3. Copies settings to matching crews in Job Tracking
 * 4. Optionally deletes the Safety Compliance Config sheet
 *
 * Called from: Glove Manager → 🔧 Maintenance → Sheets Setup → 📋 Migrate Config to Job Tracking
 */
function migrateConfigToJobTracking() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var ui = SpreadsheetApp.getUi();

  // Check if Safety Compliance Config exists
  var configSheet = ss.getSheetByName('Safety Compliance Config');
  if (!configSheet) {
    ui.alert('ℹ\uFE0F Not Needed',
      'Safety Compliance Config sheet not found.\n\n' +
      'This migration is only needed if you have existing settings in that sheet.\n\n' +
      'Your Job Tracking sheet will use default settings (Mon-Thu schedule).',
      ui.ButtonSet.OK);
    return;
  }

  // Check if Job Tracking exists
  var jobSheet = ss.getSheetByName('Job Tracking');
  if (!jobSheet) {
    ui.alert('\u274C Error',
      'Job Tracking sheet not found.\n\n' +
      'Please run "Setup Job Tracking Sheet" first.',
      ui.ButtonSet.OK);
    return;
  }

  // Check if Job Tracking has the new columns
  var headers = jobSheet.getRange(1, 1, 1, 25).getValues()[0];
  var skipSunIndex = headers.indexOf('Skip Sun');

  if (skipSunIndex === -1) {
    // Need to add the columns first
    var addColumnsResponse = ui.alert(
      '\u26A0\uFE0F Columns Needed',
      'Job Tracking sheet needs the new Schedule Compliance columns (L-T).\n\n' +
      'Would you like to add them now?\n\n' +
      '(This will insert 9 new columns after Notes)',
      ui.ButtonSet.YES_NO
    );

    if (addColumnsResponse !== ui.Button.YES) {
      return;
    }

    // Run the column migration
    migrateJobTrackingForComplianceConfig();

    // Refresh headers
    headers = jobSheet.getRange(1, 1, 1, 25).getValues()[0];
    skipSunIndex = headers.indexOf('Skip Sun');

    if (skipSunIndex === -1) {
      ui.alert('\u274C Error', 'Failed to add columns to Job Tracking sheet.', ui.ButtonSet.OK);
      return;
    }
  }

  // Confirm migration
  var confirmResponse = ui.alert(
    '📋 Migrate Safety Compliance Config',
    'This will:\n\n' +
    '1. Copy skip day settings from Safety Compliance Config to Job Tracking\n' +
    '2. Copy "Skip Weekly Meeting" and "Skip Monthly Checklist" flags\n' +
    '3. Delete the Safety Compliance Config sheet\n\n' +
    'After migration, all schedule/compliance settings will be in Job Tracking.\n\n' +
    'Continue?',
    ui.ButtonSet.YES_NO
  );

  if (confirmResponse !== ui.Button.YES) {
    return;
  }

  try {
    // Read Safety Compliance Config data
    var configData = configSheet.getDataRange().getValues();
    var configHeaders = configData[0];

    // Find column indices in Config sheet
    var cfgJobNumCol = configHeaders.indexOf('Job Number');
    var cfgForemanCol = configHeaders.indexOf('Foreman');
    var cfgSkipSunCol = configHeaders.indexOf('Skip Sun');
    var cfgSkipMonCol = configHeaders.indexOf('Skip Mon');
    var cfgSkipTueCol = configHeaders.indexOf('Skip Tue');
    var cfgSkipWedCol = configHeaders.indexOf('Skip Wed');
    var cfgSkipThuCol = configHeaders.indexOf('Skip Thu');
    var cfgSkipFriCol = configHeaders.indexOf('Skip Fri');
    var cfgSkipSatCol = configHeaders.indexOf('Skip Sat');
    var cfgSkipWeeklyCol = configHeaders.indexOf('Skip Weekly Meeting');
    var cfgSkipMonthlyCol = configHeaders.indexOf('Skip Monthly Checklist');
    var cfgNotesCol = configHeaders.indexOf('Notes');

    if (cfgJobNumCol === -1) {
      cfgJobNumCol = 0;
    }

    // Build config map
    var configMap = {};
    for (var i = 1; i < configData.length; i++) {
      var row = configData[i];
      var jobNum = String(row[cfgJobNumCol] || '').trim();
      if (!jobNum) continue;

      configMap[jobNum] = {
        foreman: cfgForemanCol !== -1 ? row[cfgForemanCol] : '',
        skipSun: cfgSkipSunCol !== -1 ? !!row[cfgSkipSunCol] : true,
        skipMon: cfgSkipMonCol !== -1 ? !!row[cfgSkipMonCol] : false,
        skipTue: cfgSkipTueCol !== -1 ? !!row[cfgSkipTueCol] : false,
        skipWed: cfgSkipWedCol !== -1 ? !!row[cfgSkipWedCol] : false,
        skipThu: cfgSkipThuCol !== -1 ? !!row[cfgSkipThuCol] : false,
        skipFri: cfgSkipFriCol !== -1 ? !!row[cfgSkipFriCol] : true,
        skipSat: cfgSkipSatCol !== -1 ? !!row[cfgSkipSatCol] : true,
        skipWeeklyMeeting: cfgSkipWeeklyCol !== -1 ? !!row[cfgSkipWeeklyCol] : false,
        skipMonthlyChecklist: cfgSkipMonthlyCol !== -1 ? !!row[cfgSkipMonthlyCol] : false,
        notes: cfgNotesCol !== -1 ? row[cfgNotesCol] : ''
      };
    }

    Logger.log('migrateConfigToJobTracking: Read ' + Object.keys(configMap).length + ' crews from Config');

    // Read Job Tracking data
    var jobData = jobSheet.getDataRange().getValues();
    var jobHeaders = jobData[0];

    // Find column indices in Job Tracking - NEW STRUCTURE
    var jtJobNumCol = 0;  // A
    var jtForemanCol = 2; // C
    var jtSkipSunCol = headers.indexOf('Skip Sun');  // Should be L (11)

    if (jtSkipSunCol === -1) {
      ui.alert('\u274C Error', 'Could not find Skip Sun column in Job Tracking.', ui.ButtonSet.OK);
      return;
    }

    // Update Job Tracking with config settings
    var updatedCount = 0;
    var notFoundCount = 0;
    var notFoundCrews = [];

    for (var jobNum in configMap) {
      var cfg = configMap[jobNum];

      // Find this crew in Job Tracking
      var foundRow = -1;
      for (var j = 1; j < jobData.length; j++) {
        if (String(jobData[j][jtJobNumCol] || '').trim() === jobNum) {
          foundRow = j + 1; // 1-based row
          break;
        }
      }

      if (foundRow === -1) {
        notFoundCount++;
        notFoundCrews.push(jobNum);
        continue;
      }

      // Update the skip day columns (L-T = columns 12-20)
      jobSheet.getRange(foundRow, jtSkipSunCol + 1, 1, 9).setValues([[
        cfg.skipSun,
        cfg.skipMon,
        cfg.skipTue,
        cfg.skipWed,
        cfg.skipThu,
        cfg.skipFri,
        cfg.skipSat,
        cfg.skipWeeklyMeeting,
        cfg.skipMonthlyChecklist
      ]]);

      updatedCount++;
    }

    Logger.log('migrateConfigToJobTracking: Updated ' + updatedCount + ' crews, ' + notFoundCount + ' not found');

    // Delete the Safety Compliance Config sheet
    ss.deleteSheet(configSheet);
    Logger.log('migrateConfigToJobTracking: Deleted Safety Compliance Config sheet');

    var message = '\u2705 Migration Complete!\n\n' +
      '\u2022 Settings copied: ' + updatedCount + ' crews\n' +
      '\u2022 Safety Compliance Config sheet deleted\n\n' +
      'All schedule settings are now in Job Tracking (columns L-T).';

    if (notFoundCount > 0) {
      message += '\n\n\u26A0\uFE0F ' + notFoundCount + ' crew(s) from Config were not found in Job Tracking:\n' +
        notFoundCrews.slice(0, 10).join(', ') +
        (notFoundCrews.length > 10 ? '...' : '');
    }

    ui.alert('Migration Complete', message, ui.ButtonSet.OK);

  } catch (e) {
    ui.alert('\u274C Migration Error', 'Error during migration:\n\n' + e.toString(), ui.ButtonSet.OK);
    Logger.log('migrateConfigToJobTracking error: ' + e.toString());
  }
}

/**
 * Returns a map of job number → status (lowercase) from Job Tracking sheet.
 * Used to identify On Hold/Completed/Pending Start crews that should not be
 * treated as "unknown" in compliance tracking.
 *
 * @returns {Object} Map of job number → status string (e.g., { '041-26': 'on hold' })
 */
function getJobTrackingStatusMap() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var jobTrackingSheet = ss.getSheetByName('Job Tracking');
  var statusMap = {};

  if (!jobTrackingSheet || jobTrackingSheet.getLastRow() <= 1) {
    return statusMap;
  }

  var jobData = jobTrackingSheet.getDataRange().getValues();
  var headers = jobData[0];

  var jobNumCol = headers.indexOf('Job Number');
  var statusCol = headers.indexOf('Status');

  if (jobNumCol === -1) jobNumCol = 0;
  if (statusCol === -1) statusCol = 9;

  for (var i = 1; i < jobData.length; i++) {
    var jobNum = jobData[i][jobNumCol];
    var status = jobData[i][statusCol];

    if (jobNum) {
      var jobNumStr = String(jobNum).split('.')[0].trim();
      var statusStr = status ? status.toString().toLowerCase().trim() : '';
      if (jobNumStr && statusStr) {
        statusMap[jobNumStr] = statusStr;
      }
    }
  }

  return statusMap;
}

/**
 * Gets all active crews directly from Job Tracking sheet
 * This is more reliable than getActiveCrews() which starts from Employees
 *
 * @returns {Array} Array of { jobNumber, foreman } objects
 */
function getActiveCrewsFromJobTracking() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var jobTrackingSheet = ss.getSheetByName('Job Tracking');
  var activeCrews = [];
  var today = new Date();
  today.setHours(0, 0, 0, 0); // Normalize to start of day for comparison

  if (jobTrackingSheet && jobTrackingSheet.getLastRow() > 1) {
    var jobData = jobTrackingSheet.getDataRange().getValues();
    var headers = jobData[0];

    var jobNumCol = headers.indexOf('Job Number');
    var foremanCol = headers.indexOf('Foreman');
    var statusCol = headers.indexOf('Status');
    var startDateCol = headers.indexOf('Start Date');

    if (jobNumCol === -1) jobNumCol = 0;
    if (foremanCol === -1) foremanCol = 2;
    if (statusCol === -1) statusCol = 9;

    Logger.log('getActiveCrewsFromJobTracking: Column indices - jobNumCol=' + jobNumCol + ', foremanCol=' + foremanCol + ', statusCol=' + statusCol + ', startDateCol=' + startDateCol);

    for (var i = 1; i < jobData.length; i++) {
      var row = jobData[i];
      var jobNum = row[jobNumCol];
      var foreman = row[foremanCol];
      var status = row[statusCol];
      var startDate = startDateCol !== -1 ? row[startDateCol] : null;

      var statusLower = status ? status.toString().toLowerCase().trim() : '';

      if (statusLower === 'active') {
        if (jobNum) {
          var jobNumStr = jobNum.toString().trim();
          var foremanStr = foreman ? foreman.toString().trim() : '';
          activeCrews.push({
            jobNumber: jobNumStr,
            foreman: foremanStr
          });
          // Log each active crew found
          Logger.log('getActiveCrewsFromJobTracking: Active crew - ' + jobNumStr + ' (' + foremanStr + ')');
        }
      }
    }
  } else {
    Logger.log('getActiveCrewsFromJobTracking: Job Tracking sheet not found or empty');
  }

  Logger.log('getActiveCrewsFromJobTracking: Found ' + activeCrews.length + ' active crews');
  return activeCrews;
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

  // Get all active crews directly from Job Tracking
  var allCrewsData = getActiveCrewsFromJobTracking();

  // Find missing crews
  var missingCrews = [];
  for (var c = 0; c < allCrewsData.length; c++) {
    if (!existingCrews[allCrewsData[c].jobNumber]) {
      missingCrews.push(allCrewsData[c]);
    }
  }

  if (missingCrews.length === 0) {
    SpreadsheetApp.getUi().alert("All " + allCrewsData.length + " active crews are already in the config.");
    return;
  }

  // Add missing crews
  var newRows = [];
  var crewNames = [];
  for (var m = 0; m < missingCrews.length; m++) {
    var crew = missingCrews[m];
    // Use foreman from Job Tracking, or lookup if not available
    var foremanName = crew.foreman;
    if (!foremanName) {
      var foreman = lookupForemanByJobNumber(crew.jobNumber);
      foremanName = (foreman && foreman.name) ? foreman.name : "";
    }
    // Default: Skip Sun and Sat (weekends)
    newRows.push([
      crew.jobNumber, foremanName,
      true, false, false, false, false, false, true, // Sun=skip, Sat=skip
      false, false, "" // Don't skip weekly meeting, don't skip monthly checklist, no notes
    ]);
    crewNames.push(crew.jobNumber);
  }

  // Append to sheet
  var lastRow = sheet.getLastRow();
  sheet.getRange(lastRow + 1, 1, newRows.length, 12).setValues(newRows);

  // Sort by job number FIRST
  if (sheet.getLastRow() > 1) {
    sheet.getRange(2, 1, sheet.getLastRow() - 1, 12).sort(1);
  }

  // Add checkboxes for ALL data rows AFTER sorting (columns C-K = 3-11)
  var totalRows = sheet.getLastRow() - 1;
  if (totalRows > 0) {
    var checkboxRange = sheet.getRange(2, 3, totalRows, 9);
    checkboxRange.insertCheckboxes();
  }

  SpreadsheetApp.getUi().alert("Added " + missingCrews.length + " new crew(s) to config:\n" + crewNames.join(", "));
  Logger.log("populateComplianceConfig: Added " + missingCrews.length + " crews: " + crewNames.join(", "));
}

/**
 * Silent version of populateComplianceConfig - no UI alerts
 * Called automatically at the start of processSafetyEmails()
 *
 * @returns {Object} Result with crewsAdded count and list
 */
function populateComplianceConfigSilent() {
  // As of March 2026, Safety Compliance Config is consolidated into Job Tracking.
  // This function now delegates to syncCrews() which handles foremen, schedules, and new crews.
  try {
    var result = syncCrews(true);
    var crewsAdded = (result && result.newCrews) || 0;
    Logger.log("populateComplianceConfigSilent: Delegated to syncCrews - " + crewsAdded + " new crews added");
    return { crewsAdded: crewsAdded, created: false, added: crewsAdded, newCrews: [] };
  } catch (e) {
    Logger.log("populateComplianceConfigSilent: syncCrews error (non-fatal): " + e.toString());
    return { crewsAdded: 0, created: false, added: 0, newCrews: [] };
  }
}

/**
 * Fixes missing checkboxes in Safety Compliance Config sheet.
 * Run this if dropdown/checkbox columns are missing after adding new crews.
 *
 * Menu: Glove Manager → Safety → 🔧 Fix Config Checkboxes
 */
function fixComplianceConfigCheckboxes() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("Safety Compliance Config");

  if (!sheet || sheet.getLastRow() < 2) {
    SpreadsheetApp.getUi().alert("Safety Compliance Config sheet not found or empty.");
    return;
  }

  var totalRows = sheet.getLastRow() - 1; // Exclude header row
  if (totalRows > 0) {
    // Columns C-K (3-11) should have checkboxes
    var checkboxRange = sheet.getRange(2, 3, totalRows, 9);
    checkboxRange.insertCheckboxes();
    Logger.log("fixComplianceConfigCheckboxes: Added checkboxes to " + totalRows + " rows");
    SpreadsheetApp.getUi().alert("\u2705 Fixed checkboxes for " + totalRows + " crews in Safety Compliance Config.");
  }
}

/**
 * Cleans up Safety Compliance Config by removing crews that no longer exist in Employees sheet
 * Also updates foreman names for crews that still exist
 * Shows interactive dialog allowing user to select which changes to apply
 *
 * Menu: Glove Manager → Safety → 🧹 Cleanup Config Crews
 */
function cleanupComplianceConfig() {
  var ui = SpreadsheetApp.getUi();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var configSheet = ss.getSheetByName("Safety Compliance Config");

  if (!configSheet || configSheet.getLastRow() < 2) {
    ui.alert('Error', 'Safety Compliance Config sheet not found or empty', ui.ButtonSet.OK);
    return;
  }

  // Get active crews from Employees sheet
  var activeCrews = getActiveCrews();
  var activeCrewSet = {};
  for (var i = 0; i < activeCrews.length; i++) {
    activeCrewSet[activeCrews[i]] = true;
  }

  var configData = configSheet.getDataRange().getValues();
  var crewsToRemove = [];
  var foremansToUpdate = [];

  // Check each config row
  for (var r = 1; r < configData.length; r++) {
    var jobNumber = String(configData[r][0] || '').trim();
    var currentForeman = String(configData[r][1] || '').trim();

    if (!jobNumber) continue;

    // Check if this crew still exists in Employees
    if (!activeCrewSet[jobNumber]) {
      crewsToRemove.push({
        row: r + 1, // 1-indexed
        jobNumber: jobNumber,
        foreman: currentForeman
      });
    } else {
      // Crew exists - check if foreman name needs updating
      var foremanInfo = lookupForemanByJobNumber(jobNumber);
      var newForeman = (foremanInfo && foremanInfo.name) ? foremanInfo.name : '';

      if (newForeman && newForeman !== currentForeman) {
        foremansToUpdate.push({
          row: r + 1,
          jobNumber: jobNumber,
          oldForeman: currentForeman,
          newForeman: newForeman
        });
      }
    }
  }

  // Show confirmation before proceeding
  if (crewsToRemove.length === 0 && foremansToUpdate.length === 0) {
    ui.alert('Config Up to Date', 'All ' + (configData.length - 1) + ' crews in Config are still active.\nNo changes needed.', ui.ButtonSet.OK);
    return;
  }

  // Store data for the dialog
  PropertiesService.getScriptProperties().setProperty('CONFIG_CLEANUP_DATA', JSON.stringify({
    crewsToRemove: crewsToRemove,
    foremansToUpdate: foremansToUpdate
  }));

  // Show HTML dialog for selection
  var html = HtmlService.createHtmlOutput(buildConfigCleanupHtml(crewsToRemove, foremansToUpdate))
    .setWidth(500)
    .setHeight(500);
  ui.showModalDialog(html, '🧹 Cleanup Config - Select Changes');
}

/**
 * Build the HTML for the config cleanup selection dialog
 */
function buildConfigCleanupHtml(crewsToRemove, foremansToUpdate) {
  var html = '<style>';
  html += 'body { font-family: Arial, sans-serif; padding: 15px; }';
  html += '.section { margin-bottom: 20px; }';
  html += '.section-title { font-weight: bold; color: #333; margin-bottom: 10px; padding: 8px; background: #f5f5f5; border-radius: 4px; }';
  html += '.item { padding: 8px; margin: 5px 0; background: #fff; border: 1px solid #ddd; border-radius: 4px; display: flex; align-items: center; }';
  html += '.item label { margin-left: 10px; flex: 1; }';
  html += '.item.remove { border-left: 4px solid #dc3545; }';
  html += '.item.update { border-left: 4px solid #0d6efd; }';
  html += '.old-val { color: #dc3545; text-decoration: line-through; }';
  html += '.new-val { color: #198754; font-weight: bold; }';
  html += '.arrow { color: #666; margin: 0 5px; }';
  html += '.buttons { margin-top: 20px; text-align: right; }';
  html += '.buttons button { padding: 10px 20px; margin-left: 10px; border: none; border-radius: 4px; cursor: pointer; }';
  html += '.btn-apply { background: #0d6efd; color: white; }';
  html += '.btn-cancel { background: #6c757d; color: white; }';
  html += '.select-all { margin-bottom: 10px; font-size: 12px; color: #666; }';
  html += '.select-all a { color: #0d6efd; cursor: pointer; text-decoration: underline; }';
  html += '</style>';

  html += '<div class="section">';
  if (crewsToRemove.length > 0) {
    html += '<div class="section-title">\uD83D\uDDD1\uFE0F Crews to REMOVE (not in Employees)</div>';
    html += '<div class="select-all"><a onclick="toggleAll(\'remove\', true)">Select All</a> | <a onclick="toggleAll(\'remove\', false)">Deselect All</a></div>';
    for (var i = 0; i < crewsToRemove.length; i++) {
      var crew = crewsToRemove[i];
      html += '<div class="item remove">';
      html += '<input type="checkbox" class="remove-cb" id="remove_' + i + '" checked>';
      html += '<label for="remove_' + i + '">' + crew.jobNumber + ' <span style="color:#666">(' + crew.foreman + ')</span></label>';
      html += '</div>';
    }
  }
  html += '</div>';

  html += '<div class="section">';
  if (foremansToUpdate.length > 0) {
    html += '<div class="section-title">✁\uFE0F Foreman Names to UPDATE</div>';
    html += '<div class="select-all"><a onclick="toggleAll(\'update\', true)">Select All</a> | <a onclick="toggleAll(\'update\', false)">Deselect All</a></div>';
    for (var j = 0; j < foremansToUpdate.length; j++) {
      var update = foremansToUpdate[j];
      html += '<div class="item update">';
      html += '<input type="checkbox" class="update-cb" id="update_' + j + '" checked>';
      html += '<label for="update_' + j + '">' + update.jobNumber + ': ';
      html += '<span class="old-val">' + update.oldForeman + '</span>';
      html += '<span class="arrow">→</span>';
      html += '<span class="new-val">' + update.newForeman + '</span>';
      html += '</label></div>';
    }
  }
  html += '</div>';

  html += '<div class="buttons">';
  html += '<button class="btn-cancel" onclick="google.script.host.close()">Cancel</button>';
  html += '<button class="btn-apply" onclick="applyChanges()">Apply Selected</button>';
  html += '</div>';

  html += '<script>';
  html += 'function toggleAll(type, checked) {';
  html += '  var cbs = document.querySelectorAll("." + type + "-cb");';
  html += '  for (var i = 0; i < cbs.length; i++) { cbs[i].checked = checked; }';
  html += '}';
  html += 'function applyChanges() {';
  html += '  var removeIndexes = [];';
  html += '  var updateIndexes = [];';
  html += '  var removeCbs = document.querySelectorAll(".remove-cb");';
  html += '  for (var i = 0; i < removeCbs.length; i++) {';
  html += '    if (removeCbs[i].checked) removeIndexes.push(i);';
  html += '  }';
  html += '  var updateCbs = document.querySelectorAll(".update-cb");';
  html += '  for (var j = 0; j < updateCbs.length; j++) {';
  html += '    if (updateCbs[j].checked) updateIndexes.push(j);';
  html += '  }';
  html += '  google.script.run.withSuccessHandler(function(result) {';
  html += '    alert(result);';
  html += '    google.script.host.close();';
  html += '  }).applyConfigCleanupSelections(JSON.stringify({remove: removeIndexes, update: updateIndexes}));';
  html += '}';
  html += '</script>';

  return html;
}

/**
 * Apply the selected config cleanup changes
 * Called from the HTML dialog
 */
function applyConfigCleanupSelections(selectionsJson) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var configSheet = ss.getSheetByName("Safety Compliance Config");

  var selections = JSON.parse(selectionsJson);
  var dataJson = PropertiesService.getScriptProperties().getProperty('CONFIG_CLEANUP_DATA');

  if (!dataJson) {
    return 'Error: No cleanup data found. Please try again.';
  }

  var data = JSON.parse(dataJson);
  var crewsToRemove = data.crewsToRemove || [];
  var foremansToUpdate = data.foremansToUpdate || [];

  var removedCount = 0;
  var updatedCount = 0;

  // Apply foreman updates first (before deleting rows changes indices)
  for (var u = 0; u < selections.update.length; u++) {
    var updateIdx = selections.update[u];
    if (foremansToUpdate[updateIdx]) {
      var updateInfo = foremansToUpdate[updateIdx];
      configSheet.getRange(updateInfo.row, 2).setValue(updateInfo.newForeman);
      updatedCount++;
      Logger.log('Updated foreman for ' + updateInfo.jobNumber + ': ' + updateInfo.oldForeman + ' → ' + updateInfo.newForeman);
    }
  }

  // Collect rows to delete (need to sort descending to delete from bottom up)
  var rowsToDelete = [];
  for (var r = 0; r < selections.remove.length; r++) {
    var removeIdx = selections.remove[r];
    if (crewsToRemove[removeIdx]) {
      rowsToDelete.push(crewsToRemove[removeIdx].row);
    }
  }

  // Sort descending so we delete from bottom up (preserves row indices)
  rowsToDelete.sort(function(a, b) { return b - a; });

  // Delete selected rows
  for (var d = 0; d < rowsToDelete.length; d++) {
    configSheet.deleteRow(rowsToDelete[d]);
    removedCount++;
    Logger.log('Deleted config row ' + rowsToDelete[d]);
  }

  // Clear the stored data
  PropertiesService.getScriptProperties().deleteProperty('CONFIG_CLEANUP_DATA');

  return '\u2705 Config Updated!\n\nRemoved: ' + removedCount + ' crews\nUpdated: ' + updatedCount + ' foreman names';
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
  // Safety Compliance Config was migrated into Job Tracking columns L-T (March 2026)
  var sheet = ss.getSheetByName("Job Tracking");

  if (!sheet) {
    SpreadsheetApp.getUi().alert('Job Tracking sheet not found.\n\nRun "Setup Job Tracking Sheet" first.');
    return;
  }

  sheet.activate();
  // Scroll to show compliance config columns (L-T)
  ss.setActiveRange(sheet.getRange('L1'));
}

/**
 * Refreshes foreman names in Job Tracking, Safety Compliance, and Safety Compliance Config sheets
 * based on current Employees data. Use when a foreman changes for a crew.
 *
 * Menu: Glove Manager → Process Safety Emails → Utilities → Refresh Foreman Names
 */
function refreshComplianceForemenNames() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var ui = SpreadsheetApp.getUi();

  Logger.log('=== refreshComplianceForemenNames START ===');

  var jobTrackingSheet = ss.getSheetByName("Job Tracking");
  var complianceSheet = ss.getSheetByName("Safety Compliance");
  var configSheet = ss.getSheetByName("Safety Compliance Config");

  var jobTrackingUpdates = 0;
  var complianceUpdates = 0;
  var configUpdates = 0;
  var changedJobs = [];

  // Update Job Tracking sheet FIRST (this is what diagnoseMissingCrews reads from)
  if (jobTrackingSheet) {
    Logger.log('Checking Job Tracking sheet...');
    var jobData = jobTrackingSheet.getDataRange().getValues();
    var jobHeaders = jobData[0];

    // Find column indices
    var jJobCol = -1, jForemanCol = -1;
    for (var jh = 0; jh < jobHeaders.length; jh++) {
      var jHeader = String(jobHeaders[jh]).toLowerCase().trim();
      if (jHeader === 'job number') jJobCol = jh;
      if (jHeader === 'foreman') jForemanCol = jh;
    }

    if (jJobCol === -1) jJobCol = 0;  // Column A default
    if (jForemanCol === -1) jForemanCol = 2;  // Column C default

    Logger.log('Job Tracking columns: jobCol=' + jJobCol + ', foremanCol=' + jForemanCol);

    for (var jt = 1; jt < jobData.length; jt++) {
      var jtJobNum = String(jobData[jt][jJobCol] || '').trim();
      var jtCurrentForeman = String(jobData[jt][jForemanCol] || '').trim();

      if (!jtJobNum) continue;

      var jtLookupResult = lookupForemanByJobNumber(jtJobNum);
      var jtNewForeman = (jtLookupResult && jtLookupResult.name) ? jtLookupResult.name : '';

      Logger.log('Job Tracking row ' + (jt + 1) + ': ' + jtJobNum + ' current="' + jtCurrentForeman + '" lookup="' + jtNewForeman + '"');

      if (jtNewForeman && jtNewForeman !== jtCurrentForeman) {
        jobTrackingSheet.getRange(jt + 1, jForemanCol + 1).setValue(jtNewForeman);
        jobTrackingUpdates++;
        changedJobs.push(jtJobNum + ': ' + (jtCurrentForeman || '(empty)') + ' → ' + jtNewForeman);
        Logger.log('Job Tracking: Updated ' + jtJobNum + ' foreman: ' + jtCurrentForeman + ' → ' + jtNewForeman);
      }
    }
  } else {
    Logger.log('Job Tracking sheet not found');
  }

  // Update Safety Compliance Config sheet
  if (configSheet) {
    Logger.log('Checking Safety Compliance Config sheet...');
    var configData = configSheet.getDataRange().getValues();
    for (var c = 1; c < configData.length; c++) {
      var jobNum = String(configData[c][0] || '').trim();
      var currentForeman = String(configData[c][1] || '').trim();

      if (!jobNum) continue;

      var lookupResult = lookupForemanByJobNumber(jobNum);
      var newForeman = (lookupResult && lookupResult.name) ? lookupResult.name : '';

      if (newForeman && newForeman !== currentForeman) {
        configSheet.getRange(c + 1, 2).setValue(newForeman);
        configUpdates++;
        if (changedJobs.indexOf(jobNum + ': ' + currentForeman + ' → ' + newForeman) === -1) {
          changedJobs.push(jobNum + ': ' + (currentForeman || '(empty)') + ' → ' + newForeman);
        }
        Logger.log('Config: Updated ' + jobNum + ' foreman: ' + currentForeman + ' → ' + newForeman);
      }
    }
  }

  // Update Safety Compliance sheet (column C is Foreman)
  if (complianceSheet) {
    Logger.log('Checking Safety Compliance sheet...');
    var complianceData = complianceSheet.getDataRange().getValues();
    var headers = complianceData[0];

    // Find column indices
    var jobCol = -1, foremanCol = -1;
    for (var h = 0; h < headers.length; h++) {
      var header = String(headers[h]).toLowerCase().trim();
      if (header === 'job number') jobCol = h;
      if (header === 'foreman') foremanCol = h;
    }

    if (jobCol === -1) jobCol = 1;  // Column B default
    if (foremanCol === -1) foremanCol = 2;  // Column C default

    for (var r = 1; r < complianceData.length; r++) {
      var jobNum = String(complianceData[r][jobCol] || '').trim();
      var currentForeman = String(complianceData[r][foremanCol] || '').trim();

      if (!jobNum) continue;

      var lookupResult = lookupForemanByJobNumber(jobNum);
      var newForeman = (lookupResult && lookupResult.name) ? lookupResult.name : '';

      if (newForeman && newForeman !== currentForeman) {
        complianceSheet.getRange(r + 1, foremanCol + 1).setValue(newForeman);
        complianceUpdates++;
        Logger.log('Compliance row ' + (r + 1) + ': Updated ' + jobNum + ' foreman: ' + currentForeman + ' → ' + newForeman);
      }
    }
  }

  // Show results
  var message = '\u2705 Foreman Names Refreshed\n\n';
  message += 'Job Tracking: ' + jobTrackingUpdates + ' updated\n';
  message += 'Safety Compliance Config: ' + configUpdates + ' updated\n';
  message += 'Safety Compliance: ' + complianceUpdates + ' rows updated\n';

  if (changedJobs.length > 0) {
    message += '\nChanges:\n' + changedJobs.slice(0, 15).join('\n');
    if (changedJobs.length > 15) {
      message += '\n... and ' + (changedJobs.length - 15) + ' more';
    }
  } else {
    message += '\nNo changes needed - all foreman names are current.';
  }

  ui.alert('Refresh Foreman Names', message, ui.ButtonSet.OK);
  Logger.log('=== refreshComplianceForemenNames END: JobTracking=' + jobTrackingUpdates + ', Config=' + configUpdates + ', Compliance=' + complianceUpdates + ' ===');
}

/**
 * Loads compliance config settings for crews from Job Tracking sheet.
 *
 * @param {Object} [options] - Optional settings (e.g. { includeAll: true })
 * @returns {Object} - Map of job number to config settings
 */
function loadComplianceConfig(options) {
  var includeAll = (options && options.includeAll) || false;

  // Return cached result if available (cleared at start of each top-level operation)
  if (includeAll && typeof _complianceConfigCacheAll !== 'undefined' && _complianceConfigCacheAll) {
    return _complianceConfigCacheAll;
  }
  if (!includeAll && typeof _complianceConfigCache !== 'undefined' && _complianceConfigCache) {
    return _complianceConfigCache;
  }

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var jobSheet = ss.getSheetByName("Job Tracking");

  // If Job Tracking doesn't exist, auto-create it
  if (!jobSheet) {
    Logger.log('loadComplianceConfig: Job Tracking sheet not found, creating...');
    setupJobTrackingSheet();
    jobSheet = ss.getSheetByName("Job Tracking");
    if (!jobSheet) {
      Logger.log('loadComplianceConfig: Failed to create Job Tracking sheet');
      return {};
    }
  }

  // Check if the new schedule columns exist (column L should be "Skip Sun")
  var headers = jobSheet.getRange(1, 1, 1, 25).getValues()[0];
  var skipSunIndex = -1;
  for (var h = 0; h < headers.length; h++) {
    if (String(headers[h]).toLowerCase().trim() === 'skip sun') {
      skipSunIndex = h;
      break;
    }
  }

  if (skipSunIndex === -1) {
    // Check if old Safety Compliance Config exists
    var oldConfigSheet = ss.getSheetByName("Safety Compliance Config");
    if (oldConfigSheet) {
      try {
        SpreadsheetApp.getUi().alert(
          '\u26A0\uFE0F Migration Required',
          'Job Tracking needs Schedule Compliance columns (L-T).\n\n' +
          'Please run: Glove Manager → 🔧 Maintenance → Sheets Setup → 📋 Migrate Config to Job Tracking',
          SpreadsheetApp.getUi().ButtonSet.OK
        );
      } catch (e) {
        Logger.log('loadComplianceConfig: Migration required - Safety Compliance Config exists but Job Tracking columns not found');
      }
    }
    Logger.log('loadComplianceConfig: Schedule columns not found in Job Tracking');
    return {};
  }

  var data = jobSheet.getDataRange().getValues();
  var config = {};

  var colJobNumber = 0;
  var colForeman = 2;
  var colStartDate = 4; // E
  var colEstEndDate = 7; // H
  var colActualEndDate = 8; // I
  var colStatus = 9; // J
  var colNotes = 10;
  var colSkipSun = 11;  // L
  var colSkipMon = 12;  // M
  var colSkipTue = 13;  // N
  var colSkipWed = 14;  // O
  var colSkipThu = 15;  // P
  var colSkipFri = 16;  // Q
  var colSkipSat = 17;  // R
  var colSkipWeeklyMeeting = 18;  // S
  var colSkipMonthlyChecklist = 19;  // T

  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var jobNumber = String(row[colJobNumber] || '').trim();
    var status = String(row[colStatus] || '').toLowerCase().trim();

    if (!jobNumber) continue;

    // Exclude lost/destroyed record jobs (002- prefix); 005- office crews may track weekly meetings
    var jobPrefix = jobNumber.split('-')[0];
    if (jobPrefix === '002') {
      Logger.log('loadComplianceConfig: Skipping excluded prefix job: ' + jobNumber);
      continue;
    }

    // Only include Active crews unless includeAll is requested
    if (!includeAll && status !== 'active' && status !== '') {
      continue;
    }

    var rawStartDate = row[colStartDate];
    var rawActualEndDate = row[colActualEndDate] || row[colEstEndDate];

    config[jobNumber] = {
      foreman: row[colForeman] || '',
      status: status,
      startDate: rawStartDate ? (rawStartDate instanceof Date ? rawStartDate : parseDateNoon(String(rawStartDate))) : null,
      actualEndDate: rawActualEndDate ? (rawActualEndDate instanceof Date ? rawActualEndDate : parseDateNoon(String(rawActualEndDate))) : null,
      skipDays: [
        !!row[colSkipSun],  // Sun (index 0)
        !!row[colSkipMon],  // Mon (index 1)
        !!row[colSkipTue],  // Tue (index 2)
        !!row[colSkipWed],  // Wed (index 3)
        !!row[colSkipThu],  // Thu (index 4)
        !!row[colSkipFri],  // Fri (index 5)
        !!row[colSkipSat]   // Sat (index 6)
      ],
      skipWeeklyMeeting: !!row[colSkipWeeklyMeeting],
      skipMonthlyChecklist: !!row[colSkipMonthlyChecklist],
      notes: row[colNotes] || ''
    };
  }

  Logger.log('loadComplianceConfig: Loaded config for ' + Object.keys(config).length + ' crews (includeAll=' + includeAll + ') from Job Tracking');
  if (includeAll) {
    _complianceConfigCacheAll = config;
  } else {
    _complianceConfigCache = config;
  }
  return config;
}

/**
 * Clears ALL execution-level caches.
 * Call at the start of top-level entry points (processSafetyEmails, masterRecalculateCompliance)
 * to ensure fresh data is loaded.
 */
function clearComplianceConfigCache() {
  _complianceConfigCache = null;
  _complianceConfigCacheAll = null;
  _customMappingsCache = null;
  _employeesDataCache = null;
  _jobTrackingDataCache = null;
  _resolveJobCache = {};
  _foremanByJobCache = {};
}

/**
 * Returns cached Employees sheet data (full 2D array including header row).
 * Reads the sheet only once per execution.
 */
function getCachedEmployeesData() {
  if (_employeesDataCache) return _employeesDataCache;
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Employees');
  if (!sheet) return null;
  _employeesDataCache = sheet.getDataRange().getValues();
  return _employeesDataCache;
}

/**
 * Returns cached Job Tracking sheet data (full 2D array including header row).
 * Reads the sheet only once per execution.
 */
function getCachedJobTrackingData() {
  if (_jobTrackingDataCache) return _jobTrackingDataCache;
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Job Tracking');
  if (!sheet) return null;
  _jobTrackingDataCache = sheet.getDataRange().getValues();
  return _jobTrackingDataCache;
}

/**
 * Calculates safety compliance for all crews for a given week
 * NOTE: This function now primarily reads from the Safety Compliance sheet itself
 * for existing compliance data, rather than from Safety Equipment Needs.
 * JHA/Meeting data is tracked directly in Safety Compliance during email processing.
 *
 * As of March 2026: Config is now loaded from Job Tracking sheet (not Safety Compliance Config)
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

  // Load config from Job Tracking (as of March 2026, replaces Safety Compliance Config)
  var config = loadComplianceConfig();

  // Get active crews from config (which now reads from Job Tracking)
  var crews = Object.keys(config).sort();

  if (crews.length === 0) {
    Logger.log("calculateSafetyCompliance: No active crews found in Job Tracking");
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
        if (dayVal === '\u2705') {
          crewReports[crewJob].jhaByDay[dayIdx] = true;
        } else if (dayVal === '\u2705L') {
          crewReports[crewJob].jhaByDay[dayIdx] = true;
          crewReports[crewJob].jhaLateByDay[dayIdx] = true;
        }
      }

      // Parse Weekly Meeting (column K, index 10)
      var meetingVal = String(existingRow[10] || '').trim();
      if (meetingVal === '\u2705') {
        crewReports[crewJob].weeklyMeeting = true;
      } else if (meetingVal === '\u2705L') {
        crewReports[crewJob].weeklyMeeting = true;
        crewReports[crewJob].weeklyMeetingLate = true;
      }

      // Parse Monthly Checklist (column L, index 11)
      var monthlyVal = String(existingRow[11] || '').trim();
      if (monthlyVal === '\u2705') {
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
          crewData.days[dayName] = '\u2705L';  // Received but late
          crewData.lateCount++;
          complianceData.lateCount++;
        } else {
          crewData.days[dayName] = '\u2705';
        }
      } else if (isPastDeadline) {
        crewData.days[dayName] = '\u274C';
        crewData.status = 'Missing Reports';
        crewData.missingItems.push('JHA (' + dayName + ')');
      } else {
        crewData.days[dayName] = '\u23F3';
        crewData.status = 'Pending';
      }
    }

    // Check weekly meeting
    if (crewConfig.skipWeeklyMeeting) {
      crewData.weeklyMeeting = 'N/A';
    } else if (reports && reports.weeklyMeeting) {
      // Check if this was a late submission
      if (reports.weeklyMeetingLate) {
        crewData.weeklyMeeting = '\u2705L';  // Received but late
        crewData.lateCount++;
        complianceData.lateCount++;
      } else {
        crewData.weeklyMeeting = '\u2705';
      }
    } else if (isPastDeadline) {
      crewData.weeklyMeeting = '\u274C';
      crewData.status = 'Missing Reports';
      crewData.missingItems.push('Weekly Meeting');
    } else {
      crewData.weeklyMeeting = '\u23F3';
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
      } else if (monthlyStatus.status !== '\u2705' && monthlyStatus.status !== 'N/A') {
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
  var tz = Session.getScriptTimeZone();

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

  // Helper to normalize date to YYYY-MM-DD string for consistent comparison
  function normalizeWeekDate(dateValue) {
    if (!dateValue) return '';
    var d = new Date(dateValue);
    if (isNaN(d.getTime())) return '';
    return Utilities.formatDate(d, tz, 'yyyy-MM-dd');
  }

  // Sort by: 1) Week Start (descending - most recent first), 2) Job Number
  var dataRows = [];
  for (var i = 1; i < data.length; i++) {
    dataRows.push({
      row: i + 1,
      data: data[i],
      weekKey: normalizeWeekDate(data[i][0])
    });
  }

  // Log unique weeks before sorting
  var uniqueWeeks = {};
  for (var i = 0; i < dataRows.length; i++) {
    var weekKey = dataRows[i].weekKey;
    uniqueWeeks[weekKey] = (uniqueWeeks[weekKey] || 0) + 1;
  }
  Logger.log("formatComplianceSheetByWeek: Unique weeks found: " + JSON.stringify(uniqueWeeks));

  dataRows.sort(function(a, b) {
    // Compare normalized week keys (YYYY-MM-DD format sorts correctly as strings)
    if (b.weekKey !== a.weekKey) {
      return b.weekKey.localeCompare(a.weekKey); // Most recent first (descending)
    }
    // Same week - sort by job number
    return String(a.data[1]).localeCompare(String(b.data[1]));
  });

  // Log first few rows after sorting to verify order
  if (dataRows.length > 0) {
    Logger.log("formatComplianceSheetByWeek: After sort, first week is: " + dataRows[0].weekKey);
  }

  // Rewrite sorted data
  var sortedData = dataRows.map(function(r) { return r.data; });
  var sortedWeekKeys = dataRows.map(function(r) { return r.weekKey; });
  sheet.getRange(2, 1, sortedData.length, sortedData[0].length).setValues(sortedData);

  // Clear existing borders and backgrounds first
  var dataRange = sheet.getRange(2, 1, sortedData.length, 14);
  dataRange.setBorder(false, false, false, false, false, false);
  dataRange.setBackground(null);

  // Now apply week coloring
  var lastWeek = "";
  var weekIndex = -1;
  var weekColors = ['#ffffff', '#e3f2fd']; // White, Light Blue alternating

  for (var i = 0; i < sortedData.length; i++) {
    var weekKey = sortedWeekKeys[i];
    var rowNum = i + 2; // 1-based, skip header

    if (weekKey !== lastWeek) {
      // New week - add thick border above this row (if not first data row)
      if (i > 0) {
        var borderRange = sheet.getRange(rowNum, 1, 1, 14);
        borderRange.setBorder(true, null, null, null, null, null, '#1565c0', SpreadsheetApp.BorderStyle.SOLID_MEDIUM);
      }
      weekIndex++;
      lastWeek = weekKey;
    }

    // Apply alternating background color for this week
    var color = weekColors[weekIndex % 2];
    sheet.getRange(rowNum, 1, 1, 14).setBackground(color);
  }

  Logger.log("formatComplianceSheetByWeek: Applied week formatting to " + sortedData.length + " rows across " + (weekIndex + 1) + " weeks");
}

/**
 * Menu function to manually reformat the compliance sheet by week
 */
function menuReformatComplianceSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("Safety Compliance");

  if (!sheet) {
    Browser.msgBox("\u274C Safety Compliance sheet not found. Run 'Backfill Past Weeks' first.");
    return;
  }

  formatComplianceSheetByWeek();
  Browser.msgBox("\u2705 Applied week-based formatting.\n\n- Sorted by week (most recent first)\n- Alternating colors for each week\n- Blue borders between weeks");
}

/**
 * Adds the new Monthly Checklist progressive status formatting rules to existing Safety Compliance sheet
 * Rules: \u26A0\uFE0F = orange (week 3), \u274C\u23F3 = red (week 4/urgent), plus existing rules
 */
function addMonthlyChecklistFormattingRules() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("Safety Compliance");

  if (!sheet) {
    Browser.msgBox("\u274C Safety Compliance sheet not found.");
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
      return values && values[0] === '\u26A0\uFE0F';
    }
    return false;
  });

  if (hasWarningRule) {
    Browser.msgBox("ℹ\uFE0F Monthly Checklist formatting rules already exist.");
    return;
  }

  // Add new rules at the beginning so they have priority

  // Orange for \u26A0\uFE0F (Monthly Checklist warning - Week 3)
  var warningRule = SpreadsheetApp.newConditionalFormatRule()
    .whenTextContains("\u26A0\uFE0F")
    .setBackground("#FFE0B2")  // Light orange
    .setFontColor("#E65100")   // Dark orange text
    .setRanges([dayRange])
    .build();

  // Red/Pink for \u274C\u23F3 (Monthly Checklist urgent - Week 4, not yet past deadline)
  var urgentRule = SpreadsheetApp.newConditionalFormatRule()
    .whenTextContains("\u274C\u23F3")
    .setBackground("#FFCDD2")  // Light red/pink
    .setFontColor("#C62828")   // Dark red text
    .setRanges([dayRange])
    .build();
  rules.push(urgentRule);

  // Insert at beginning for priority
  rules.unshift(warningRule);

  sheet.setConditionalFormatRules(rules);

  Browser.msgBox("\u2705 Added Monthly Checklist progressive formatting rules.\n\n\u2022 \u26A0\uFE0F = Orange (Week 3 - warning)\n\u2022 \u274C\u23F3 = Red (Week 4 - urgent, deadline approaching)\n\u2022 \u274C = Red (Month ended - missing)\n\u2022 \u23F3 = Yellow (Weeks 1-2 - pending, no urgency)");
}

/**
 * Menu function to add resolution formatting rules
 */
function menuAddMonthlyChecklistFormatting() {
  addMonthlyChecklistFormattingRules();
}

/**
 * Adds late submission formatting (\u2705L) to existing Safety Compliance sheet
 * Late submissions show yellow background with amber text to distinguish from on-time (green)
 */
function addLateSubmissionFormatting() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("Safety Compliance");

  if (!sheet) {
    Browser.msgBox("\u274C Safety Compliance sheet not found.");
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
      return values && values[0] === '\u2705L';
    }
    return false;
  });

  if (hasLateRule) {
    Browser.msgBox("ℹ\uFE0F Late submission formatting (\u2705L) already exists.");
    return;
  }

  // Yellow-green for \u2705L (LATE submission - received but after deadline)
  // Must be at the beginning so it takes priority over the \u2705 contains rule
  var lateRule = SpreadsheetApp.newConditionalFormatRule()
    .whenTextEqualTo("\u2705L")
    .setBackground("#FFF9C4")  // Light yellow background
    .setFontColor("#F57F17")   // Amber/dark yellow text
    .setRanges([dayRange])
    .build();

  // Insert at the very beginning for highest priority
  rules.unshift(lateRule);

  sheet.setConditionalFormatRules(rules);

  Browser.msgBox("\u2705 Added Late Submission formatting.\n\n\u2022 \u2705L = Yellow background, amber text\n   (Report received but submitted after week deadline)\n\n\u2022 \u2705 = Green background\n   (Report received on time)");
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

    // Only correct if current value is \u274C (missing) or \u23F3 (pending)
    if (currentValue !== '\u274C' && currentValue !== '\u23F3') {
      // Already has a value (\u2705, N/A, etc.) - don't overwrite
      Logger.log("autoCorrectPastWeekCompliance: Cell already has value '" + currentValue + "' for " + baseJob + " " + dayName + " - skipping");
      continue;
    }

    // Determine if this is a late submission
    var isLate = notes.indexOf('LATE SUBMISSION') !== -1;
    var newValue = isLate ? '\u2705L' : '\u2705';

    // Apply the correction
    complianceSheet.getRange(rowNum, colIdx + 1).setValue(newValue); // +1 for 1-indexed columns

    // Re-apply data validation dropdown (setValue strips it)
    var dayRule = SpreadsheetApp.newDataValidation()
      .requireValueInList(['\u2705', '\u2705L', '\u274C', '\u274CW', 'N/A', '\u23F3', ''], true)
      .setAllowInvalid(true)
      .build();
    complianceSheet.getRange(rowNum, colIdx + 1).setDataValidation(dayRule);

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
    // If all required days now have \u2705, the status should be updated
    // We'll do a quick check
    var rowData = complianceSheet.getRange(rowNum, 1, 1, 14).getValues()[0];
    var hasMissing = false;
    for (var d = 3; d <= 9; d++) { // Day columns (Sun-Sat)
      var val = String(rowData[d] || '').trim();
      if (val === '\u274C' || val === '\u23F3') {
        hasMissing = true;
        break;
      }
    }
    // Check Weekly Meeting (column 10)
    var wmVal = String(rowData[10] || '').trim();
    if (wmVal === '\u274C' || wmVal === '\u23F3') {
      hasMissing = true;
    }

    // If no more missing reports and status isn't already Resolved/Complete, update it
    var currentStatus = String(rowData[12] || '').trim(); // Status column (M)
    if (!hasMissing && currentStatus !== 'Resolved' && currentStatus !== 'Complete') {
      complianceSheet.getRange(rowNum, 13).setValue('Complete'); // Update status
      // Re-apply status dropdown (setValue strips it)
      var statusRule = SpreadsheetApp.newDataValidation()
        .requireValueInList(['Complete', 'Missing Reports', 'Pending', 'Resolved'], true)
        .setAllowInvalid(true)
        .build();
      complianceSheet.getRange(rowNum, 13).setDataValidation(statusRule);
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
    Browser.msgBox("\u274C Safety Compliance sheet not found.");
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
    Browser.msgBox("ℹ\uFE0F Monthly Checklist date formatting (✓MM/DD) already exists.");
    return;
  }

  // Light green for ✓ with date (Monthly Checklist received earlier in month)
  var checkDateRule = SpreadsheetApp.newConditionalFormatRule()
    .whenTextStartsWith("✓")
    .setBackground("#E8F5E9")  // Very light green
    .setFontColor("#2E7D32")   // Dark green text
    .setRanges([dayRange])
    .build();

  // Insert at the beginning for priority (before the \u2705 contains rule)
  rules.unshift(checkDateRule);

  sheet.setConditionalFormatRules(rules);

  Browser.msgBox("\u2705 Added Monthly Checklist date formatting.\n\n\u2022 ✓MM/DD = Light green background, dark green text\n   (Checklist received earlier in the month)\n\n\u2022 \u2705 = Green (received this week)");
}

/**
 * ONE-TIME FIX: Retroactively detect and mark late submissions in Safety Reports
 * This FAST version searches Gmail in bulk for the target week, then matches to Safety Reports.
 *
 * Specifically looks for JHAs from week of 02/08/2026 that were received in week of 02/15/2026.
 */
function fixLateSubmissionsRetroactively() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var safetySheet = getSafetyEquipmentSheet();

  if (!safetySheet) {
    Browser.msgBox("\u274C Safety Equipment Needs sheet not found.");
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
    Browser.msgBox("ℹ\uFE0F No late submissions found for the week of 02/08/2026.");
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

  Browser.msgBox("\u2705 Late Submission Fix Complete!\n\n" +
    "\u2022 Late emails found: " + lateCount + "\n" +
    "\u2022 Safety Reports updated: " + updatedCount + "\n\n" +
    "Safety Compliance sheet now shows \u2705L for late submissions.");
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
    '3. Update Safety Compliance to show \u2705L\n\n' +
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
  var safetySheet = getSafetyEquipmentSheet();

  if (!safetySheet) {
    Browser.msgBox("\u274C Safety Equipment Needs sheet not found. Run 'Process Safety Emails' first.");
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
    Browser.msgBox("ℹ\uFE0F No report dates found in Safety Reports sheet.");
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

  Browser.msgBox("\u2705 Backfilled compliance data for " + processed + " weeks.\n\nWeeks are now color-coded for easy viewing.");
  Logger.log("menuBackfillPastWeeks: Processed " + processed + " weeks");
}

/**
 * Removes duplicate rows from Safety Compliance sheet
 * Keeps the most recently updated row for each Week+Job combination
 */
function menuCleanupDuplicateComplianceRows() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("Safety Compliance");

  Logger.log('=== menuCleanupDuplicateComplianceRows START ===');

  if (!sheet) {
    Logger.log('ERROR: Safety Compliance sheet not found');
    Browser.msgBox("\u274C Safety Compliance sheet not found.");
    return;
  }

  var data = sheet.getDataRange().getValues();
  Logger.log('Safety Compliance: ' + (data.length - 1) + ' data rows');

  if (data.length < 2) {
    Logger.log('No data rows to check');
    Browser.msgBox("ℹ\uFE0F No data rows to clean up.");
    return;
  }

  // Find duplicates (keep last occurrence = most recent)
  var seen = {};
  var rowsToDelete = [];
  var skippedCount = 0;
  var processedCount = 0;

  for (var i = data.length - 1; i >= 1; i--) {
    var weekDate = data[i][0];
    var jobNumber = String(data[i][1] || '').trim();

    if (!weekDate || !jobNumber) {
      skippedCount++;
      continue;
    }

    var dateStr;
    try {
      dateStr = Utilities.formatDate(new Date(weekDate), Session.getScriptTimeZone(), "yyyy-MM-dd");
    } catch (e) {
      Logger.log('WARNING: Row ' + (i+1) + ' has invalid date: "' + weekDate + '" (type: ' + typeof weekDate + ')');
      skippedCount++;
      continue;
    }
    var key = dateStr + '|' + jobNumber;
    processedCount++;

    if (seen[key]) {
      rowsToDelete.push(i + 1); // Row number (1-based)
    } else {
      seen[key] = true;
    }
  }

  Logger.log('Processed ' + processedCount + ' rows, skipped ' + skippedCount + ' (empty/invalid), found ' + rowsToDelete.length + ' duplicates, ' + Object.keys(seen).length + ' unique keys');

  if (rowsToDelete.length === 0) {
    Logger.log('No duplicates found. Sample keys: ' + Object.keys(seen).slice(0, 5).join(', '));
    Logger.log('=== menuCleanupDuplicateComplianceRows END (no duplicates) ===');
    Browser.msgBox("\u2705 No duplicate rows found.\n\n" + processedCount + " rows checked, " + Object.keys(seen).length + " unique week+crew combos.");
    return;
  }

  // Delete rows from bottom to top to avoid index shifting
  rowsToDelete.sort(function(a, b) { return b - a; });
  for (var r = 0; r < rowsToDelete.length; r++) {
    sheet.deleteRow(rowsToDelete[r]);
  }

  Browser.msgBox("\u2705 Removed " + rowsToDelete.length + " duplicate rows.");
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
  ensureTaskMetadataHeaders(taskSheet);

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
 * Changes pending items to \u274C and creates tasks for missing reports
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

  // Re-calculate compliance for each past week using log-based calculation (will mark pending as \u274C)
  var totalTasksCreated = 0;
  for (var weekStr in weeksToUpdate) {
    var weekStart = weeksToUpdate[weekStr];
    var complianceData = calculateComplianceFromLogs(weekStart);

    if (complianceData) {
      updateComplianceSheetFromLogs(complianceData);
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
    Browser.msgBox("\u2705 No past weeks needed finalization. All are up to date.");
  } else {
    Browser.msgBox("\u2705 Finalized " + result.weeksFinalized + " past week(s).\n\nCreated " + result.tasksCreated + " missing report tasks.");
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
    Browser.msgBox("\u274C Error: " + result.error);
    return;
  }

  var message = "📋 Previous Week: " + result.weekStart + " - " + result.weekEnd + "\n\n";
  message += "\u2705 Compliant crews: " + result.compliantCount + "\n";
  message += "\u274C Crews with missing reports: " + result.missingCount + "\n\n";
  message += "\uD83D\uDD0D Tasks created: " + result.tasksCreated;

  if (result.tasksCreated === 0 && result.missingCount > 0) {
    message += "\n\n(Tasks may already exist - check Task Metadata sheet)";
  }

  Browser.msgBox("Previous Week Task Generation", message, Browser.Buttons.OK);
}

/**
 * Shows the Safety Compliance Dashboard with current week stats and trends
 * Now includes HTML tooltips on each day cell with date details
 */
function showComplianceDashboard() {
  var today = new Date();
  var weekBounds = getWeekBoundaries(today);
  var tz = Session.getScriptTimeZone();

  // Defensive check for weekBounds
  if (!weekBounds || !weekBounds.weekStart) {
    Browser.msgBox("\u274C Could not determine week boundaries.");
    return;
  }

  // Use calculateComplianceFromLogs instead of calculateSafetyCompliance to get detail data for tooltips
  var complianceData = calculateComplianceFromLogs(weekBounds.weekStart);

  if (!complianceData || !complianceData.crews) {
    Browser.msgBox("\u274C Could not calculate compliance data. Make sure Safety Reports and Safety Compliance Config sheets exist.");
    return;
  }

  // Defensive check for weekStart and weekEnd in complianceData
  if (!complianceData.weekStart || !complianceData.weekEnd) {
    Browser.msgBox("\u274C Compliance data is missing week boundaries.");
    return;
  }

  var weekStartStr = Utilities.formatDate(complianceData.weekStart, tz, "MM/dd");
  var weekEndStr = Utilities.formatDate(complianceData.weekEnd, tz, "MM/dd/yyyy");
  var dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  var fullDayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

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
    '.crew-table td { padding: 6px 4px; text-align: center; border-bottom: 1px solid #ddd; cursor: help; }' +
    '.crew-table tr:hover { background: #f5f5f5; }' +
    '.ok { color: #28a745; }' +
    '.late { color: #b8860b; background: #fff8dc; }' +
    '.missing { color: #dc3545; font-weight: bold; }' +
    '.pending { color: #ffc107; }' +
    '.na { color: #999; }' +
    '.scroll-container { max-height: 300px; overflow-y: auto; }' +
    '.legend { margin-top: 15px; font-size: 11px; color: #666; text-align: center; }' +
    '</style>';

  html += '<div class="header">' +
    '<h2>\uD83D\uDCCA Safety Compliance Dashboard</h2>' +
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
    '<tr><th>Crew</th><th>Foreman</th><th>Sun</th><th>Mon</th><th>Tue</th><th>Wed</th><th>Thu</th><th>Fri</th><th>Sat</th><th>Weekly</th><th>Monthly</th></tr>';

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

    // Day columns with tooltips
    for (var d = 0; d < dayNames.length; d++) {
      var st = (crew.days && crew.days[dayNames[d]]) ? crew.days[dayNames[d]] : '';
      var cls = st === '\u2705' ? 'ok' : (st === '\u2705L' ? 'late' : (st === '\u274C' ? 'missing' : (st === '\u23F3' ? 'pending' : 'na')));

      // Build tooltip for this day
      var dayDate = new Date(complianceData.weekStart.getTime());
      dayDate.setDate(dayDate.getDate() + d);
      var dayDateStr = Utilities.formatDate(dayDate, tz, 'MMM dd, yyyy');
      var details = (crew.jhaDetails && crew.jhaDetails[d]) ? crew.jhaDetails[d] : null;

      // Build tooltip with &#10; for line breaks in HTML title attribute
      var tooltipParts = [];
      tooltipParts.push('📅 ' + fullDayNames[d] + ', ' + dayDateStr);
      if (details && details.dateCreated) {
        tooltipParts.push('Created: ' + Utilities.formatDate(new Date(details.dateCreated), tz, 'MM/dd/yyyy'));
      }
      if (details && details.dateReceived) {
        tooltipParts.push('Received: ' + Utilities.formatDate(new Date(details.dateReceived), tz, 'MM/dd/yyyy h:mm a'));
      }
      tooltipParts.push('');
      tooltipParts.push(getIconExplanationForHtml(st));
      var tooltip = tooltipParts.join('&#10;');

      html += '<td class="' + cls + '" title="' + tooltip + '">' + st + '</td>';
    }

    // Weekly Meeting with tooltip
    var wst = (crew.weeklyMeetingStatus) ? crew.weeklyMeetingStatus : '';
    var mCls = wst === '\u2705' ? 'ok' : (wst === '\u2705L' ? 'late' : (wst === '\u274C' ? 'missing' : (wst === '\u23F3' ? 'pending' : 'na')));
    var wkDetails = crew.weeklyMeetingDetails || null;
    var wkTooltipParts = [];
    wkTooltipParts.push('📋 Weekly Safety Meeting');
    if (wkDetails && wkDetails.weekOf) {
      wkTooltipParts.push('Week of: ' + Utilities.formatDate(new Date(wkDetails.weekOf), tz, 'MMM dd, yyyy'));
    }
    if (wkDetails && wkDetails.dateReceived) {
      wkTooltipParts.push('Received: ' + Utilities.formatDate(new Date(wkDetails.dateReceived), tz, 'MM/dd/yyyy h:mm a'));
    }
    wkTooltipParts.push('');
    wkTooltipParts.push(getIconExplanationForHtml(wst));
    var wkTooltip = wkTooltipParts.join('&#10;');
    html += '<td class="' + mCls + '" title="' + wkTooltip + '">' + wst + '</td>';

    // Monthly Checklist with tooltip
    var mst = (crew.monthlyChecklistStatus) ? crew.monthlyChecklistStatus : '';
    var moCls = mst === '\u2705' ? 'ok' : (mst === '\u274C' ? 'missing' : (mst === '\u23F3' ? 'pending' : (mst === '\u26A0\uFE0F' ? 'pending' : 'na')));
    var moDetails = crew.monthlyChecklistDetails || null;
    var moTooltipParts = [];
    moTooltipParts.push('📋 Monthly Fleet Checklist');
    if (moDetails && moDetails.reportDate) {
      moTooltipParts.push('Report Date: ' + Utilities.formatDate(new Date(moDetails.reportDate), tz, 'MMM dd, yyyy'));
    }
    if (moDetails && moDetails.dateReceived) {
      moTooltipParts.push('Received: ' + Utilities.formatDate(new Date(moDetails.dateReceived), tz, 'MM/dd/yyyy h:mm a'));
    }
    moTooltipParts.push('');
    moTooltipParts.push(getIconExplanationForHtml(mst, 'monthly'));
    var moTooltip = moTooltipParts.join('&#10;');
    html += '<td class="' + moCls + '" title="' + moTooltip + '">' + mst + '</td>';

    html += '</tr>';
  }

  html += '</table></div>';

  // Add legend at bottom
  html += '<div class="legend">' +
    '\u2705 On time | \u2705L Late | \u274C Missing | \u23F3 Pending | N/A Skipped | \u26A0\uFE0F Warning (Monthly) | \u274C\u23F3 Urgent (Monthly)' +
    '</div>';

  html += '<div style="margin-top: 15px; text-align: center;">' +
    '<button onclick="google.script.host.close()" style="background:#4285f4;color:white;border:none;padding:10px 30px;border-radius:4px;cursor:pointer;">Close</button>' +
    '</div>';

  var output = HtmlService.createHtmlOutput(html)
    .setWidth(800)
    .setHeight(600);

  SpreadsheetApp.getUi().showModalDialog(output, 'Safety Compliance Dashboard');
}

/**
 * Returns icon explanation for HTML tooltips
 * @param {string} icon - The status icon
 * @param {string} cellType - Optional cell type for context
 * @returns {string} Explanation
 */
function getIconExplanationForHtml(icon, cellType) {
  var iconStr = String(icon || '').trim();

  if (iconStr === '\u2705') {
    return '\u2705 = Received on time';
  } else if (iconStr === '\u2705L') {
    return '\u2705L = Received late';
  } else if (iconStr === '\u274C') {
    return '\u274C = Missing/not received';
  } else if (iconStr === '\u23F3') {
    return '\u23F3 = Pending';
  } else if (iconStr === 'N/A') {
    return 'N/A = Skipped per config';
  } else if (iconStr === '\u26A0\uFE0F') {
    return '\u26A0\uFE0F = Warning (Week 3)';
  } else if (iconStr === '\u274C\u23F3') {
    return '\u274C\u23F3 = Urgent (Week 4)';
  }

  return '';
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

    // Check which days are missing (\u274C or contains \u274C)
    var missingDays = [];
    var dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    var dayColumns = [compColIdx.sun, compColIdx.mon, compColIdx.tue, compColIdx.wed, compColIdx.thu, compColIdx.fri, compColIdx.sat];

    for (var d = 0; d < dayNames.length; d++) {
      var cellValue = String(row[dayColumns[d]] || '').trim();
      // Check for \u274C that is NOT followed by a resolution code (D, F, A, W, L)
      // \u274C alone or \u274C🔔 (notified) means still missing
      if (cellValue === '\u274C' || cellValue === '\u274C🔔') {
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
    if (wmValue === '\u274C' || wmValue === '\u274C🔔') {
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
  Logger.log('taskId=' + taskId + ', weekOf=' + weekOf + ', jobNumber=' + jobNumber + ', employeeName=' + employeeName);

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

    // FALLBACK: If job number still not found, look up by employee name (foreman)
    if ((!jobNumber || !jobNumber.match(/^\d{3}-\d{2}$/)) && employeeName) {
      Logger.log('recordMissingReportResolutions: Looking up job number by foreman name: ' + employeeName);

      // First try Safety Compliance sheet itself (Foreman column)
      var compData = complianceSheet.getDataRange().getValues();
      var compHeaders = compData[0];
      var foremanCol = -1, jobCol = -1, weekStartCol = -1;
      for (var h = 0; h < compHeaders.length; h++) {
        var hdr = String(compHeaders[h]).toLowerCase().trim();
        if (hdr === 'foreman') foremanCol = h;
        if (hdr === 'job number') jobCol = h;
        if (hdr === 'week start') weekStartCol = h;
      }

      if (foremanCol >= 0 && jobCol >= 0 && weekStartCol >= 0) {
        var employeeNameLower = employeeName.toLowerCase().trim();
        for (var i = 1; i < compData.length; i++) {
          var rowForeman = String(compData[i][foremanCol] || '').toLowerCase().trim();
          var rowWeekStart = compData[i][weekStartCol];

          // Check if foreman matches and week matches
          if (rowForeman === employeeNameLower) {
            var rowWeekDate = (rowWeekStart instanceof Date) ? rowWeekStart : new Date(rowWeekStart);
            if (!isNaN(rowWeekDate.getTime()) &&
                rowWeekDate.getDate() === targetWeekStart.getDate() &&
                rowWeekDate.getMonth() === targetWeekStart.getMonth() &&
                rowWeekDate.getFullYear() === targetWeekStart.getFullYear()) {
              jobNumber = String(compData[i][jobCol] || '').trim();
              Logger.log('recordMissingReportResolutions: Found job number ' + jobNumber + ' for foreman ' + employeeName + ' in Safety Compliance');
              break;
            }
          }
        }
      }

      // If still not found, try Employees sheet
      if (!jobNumber || !jobNumber.match(/^\d{3}-\d{2}$/)) {
        var empSheet = ss.getSheetByName('Employees');
        if (empSheet) {
          var empData = empSheet.getDataRange().getValues();
          var empHeaders = empData[0];
          var empNameCol = -1, empJobCol = -1;
          for (var e = 0; e < empHeaders.length; e++) {
            var empHdr = String(empHeaders[e]).toLowerCase().trim();
            if (empHdr === 'job number' || empHdr === 'job') empJobCol = e;
          }
          empNameCol = getEmployeeNameColumnIndex(empHeaders);

          if (empNameCol >= 0 && empJobCol >= 0) {
            var employeeNameLower = employeeName.toLowerCase().trim();
            for (var j = 1; j < empData.length; j++) {
              var empName = String(empData[j][empNameCol] || '').toLowerCase().trim();
              if (empName === employeeNameLower) {
                var empJob = String(empData[j][empJobCol] || '').trim();
                // Extract base job number (remove .X suffix)
                var jobMatch = empJob.match(/^(\d{3}-\d{2})/);
                if (jobMatch) {
                  jobNumber = jobMatch[1];
                  Logger.log('recordMissingReportResolutions: Found job number ' + jobNumber + ' for employee ' + employeeName + ' in Employees sheet');
                  break;
                }
              }
            }
          }
        }
      }
    }

    if (!jobNumber) {
      return { success: false, error: 'Could not identify crew for ' + employeeName + '. Please ensure the employee is in the system.' };
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
      'C': '\u2705', 'D': '\u274CD', 'F': '\u274CF', 'A': '\u274CA', 'W': '\u274CW', 'L': '\u274CL'
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
    var dayValidationRule = SpreadsheetApp.newDataValidation()
      .requireValueInList(['\u2705', '\u2705L', '\u274C', '\u274CW', 'N/A', '\u23F3', ''], true)
      .setAllowInvalid(true)
      .build();
    var statusValidationRule = SpreadsheetApp.newDataValidation()
      .requireValueInList(['Complete', 'Missing Reports', 'Pending', 'Resolved'], true)
      .setAllowInvalid(true)
      .build();

    for (var r = 0; r < resolutions.length; r++) {
      var res = resolutions[r];
      var code = reasonCodes[res.reason] || res.reason;

      if (res.type === 'JHA') {
        var col = dayColumns[res.dayName];
        if (col !== undefined) {
          complianceSheet.getRange(foundRow, col + 1).setValue(code);
          complianceSheet.getRange(foundRow, col + 1).setDataValidation(dayValidationRule);
        }
      } else if (res.type === 'WeeklyMeeting') {
        complianceSheet.getRange(foundRow, colIdx.weeklyMeeting + 1).setValue(code);
        complianceSheet.getRange(foundRow, colIdx.weeklyMeeting + 1).setDataValidation(dayValidationRule);
      }
    }

    // Update status
    if (colIdx.status !== undefined) {
      complianceSheet.getRange(foundRow, colIdx.status + 1).setValue('Resolved');
      complianceSheet.getRange(foundRow, colIdx.status + 1).setDataValidation(statusValidationRule);
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
 * Updates Safety Compliance sheet cells from \u274C to \u274C🔔.
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

      // Check if this row has any missing items (\u274C)
      var hasMissing = false;
      var dayCols = [colIdx.sun, colIdx.mon, colIdx.tue, colIdx.wed, colIdx.thu, colIdx.fri, colIdx.sat, colIdx.weeklyMeeting];
      for (var dc = 0; dc < dayCols.length; dc++) {
        if (dayCols[dc] !== undefined && String(data[i][dayCols[dc]]).trim() === '\u274C') {
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
      var dayValRule = SpreadsheetApp.newDataValidation()
        .requireValueInList(['\u2705', '\u2705L', '\u274C', '\u274CW', 'N/A', '\u23F3', ''], true)
        .setAllowInvalid(true)
        .build();
      for (var d = 0; d < dayCols.length; d++) {
        var col = dayCols[d];
        if (col !== undefined && String(data[matchedRow][col]).trim() === '\u274C') {
          complianceSheet.getRange(row, col + 1).setValue('\u274C🔔');
          complianceSheet.getRange(row, col + 1).setDataValidation(dayValRule);
          updatedCount++;
        }
      }
      Logger.log('markSafetyReportNotified: Updated row ' + row + ' (week ' + matchedRowWeek + '), ' + updatedCount + ' cells changed to \u274C🔔');
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
    Browser.msgBox('\u2705 No Duplicates Found',
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
    if (header === 'job number') jobCol = h;
    if (header === 'secondary job number' || header === 'secondary job') secondaryJobCol = h;
    if (header === 'job classification' || header === 'classification') classCol = h;
    if (header === 'last day') lastDayCol = h;
  }
  nameCol = getEmployeeNameColumnIndex(headers);

  Logger.log('Columns found - name: ' + nameCol + ', job: ' + jobCol + ', secondaryJob: ' + secondaryJobCol + ', class: ' + classCol);

  if (nameCol === -1 || jobCol === -1) {
    Logger.log('Required columns not found');
    return { mappings: [], foremen: [] };
  }

  // FIRST: Get foremen from Job Tracking sheet (authoritative source)
  // This is updated from Excel crew import and has the correct foreman assignments
  var jobTrackingForemen = {};
  var jobTrackingCrews = getActiveCrewsFromJobTracking();
  for (var jt = 0; jt < jobTrackingCrews.length; jt++) {
    var jtCrew = jobTrackingCrews[jt];
    if (jtCrew.jobNumber && jtCrew.foreman) {
      jobTrackingForemen[jtCrew.jobNumber] = jtCrew.foreman;
      Logger.log('Job Tracking foreman: ' + jtCrew.jobNumber + ' -> ' + jtCrew.foreman);
    }
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

      // PRIORITY 1: Use Job Tracking foreman if available (authoritative source)
      if (jobTrackingForemen[crewNumber]) {
        crewForemen[crewNumber].foreman = jobTrackingForemen[crewNumber];
        crewForemen[crewNumber].priority = 0; // Highest priority
      }
      // FALLBACK: Use classification priority to determine foreman
      else {
        var priority = getClassificationPriority(classification);
        if (priority < crewForemen[crewNumber].priority) {
          crewForemen[crewNumber].foreman = name;
          crewForemen[crewNumber].priority = priority;
        }
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

        // PRIORITY 1: Use Job Tracking foreman if available
        if (jobTrackingForemen[secondaryCrewNumber]) {
          crewForemen[secondaryCrewNumber].foreman = jobTrackingForemen[secondaryCrewNumber];
          crewForemen[secondaryCrewNumber].priority = 0;
        }
        // FALLBACK: Same person could be foreman on secondary crew
        else {
          var secPriority = getClassificationPriority(classification);
          if (secPriority < crewForemen[secondaryCrewNumber].priority) {
            crewForemen[secondaryCrewNumber].foreman = name;
            crewForemen[secondaryCrewNumber].priority = secPriority;
          }
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
  // Return cached result if available
  if (_customMappingsCache) {
    return _customMappingsCache;
  }
  var props = PropertiesService.getScriptProperties();
  var saved = props.getProperty('CUSTOM_JOB_FOREMAN_MAPPINGS');
  if (saved) {
    try {
      _customMappingsCache = JSON.parse(saved);
      return _customMappingsCache;
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
 * MERGES with existing mappings (doesn't replace)
 * @param {string} mappingsJson - JSON string of {jobNumber: foremanName, ...}
 */
function saveCustomJobForemanMappings(mappingsJson) {
  var props = PropertiesService.getScriptProperties();

  // Load existing mappings first
  var existingMappings = {};
  var existingJson = props.getProperty('CUSTOM_JOB_FOREMAN_MAPPINGS');
  if (existingJson) {
    try {
      existingMappings = JSON.parse(existingJson);
    } catch (e) {
      Logger.log('Error parsing existing mappings: ' + e);
    }
  }

  // Parse new mappings
  var newMappings = {};
  try {
    newMappings = JSON.parse(mappingsJson);
  } catch (e) {
    Logger.log('Error parsing mappings JSON: ' + e);
    return { success: false, error: e.toString() };
  }

  // Merge: new mappings overwrite existing ones with same key
  for (var job in newMappings) {
    existingMappings[job] = newMappings[job];
  }

  props.setProperty('CUSTOM_JOB_FOREMAN_MAPPINGS', JSON.stringify(existingMappings));
  Logger.log('Saved custom job→foreman mappings. Total: ' + Object.keys(existingMappings).length + ' mappings');
  return { success: true, count: Object.keys(existingMappings).length };
}

/**
 * Clears all custom job→foreman mappings
 * Can be called from dialog (no alert) or from menu (shows alert)
 * @param {boolean} showAlert - Whether to show confirmation alert (default: false for dialog use)
 */
function clearCustomJobForemanMappings(showAlert) {
  var props = PropertiesService.getScriptProperties();
  props.deleteProperty('CUSTOM_JOB_FOREMAN_MAPPINGS');
  Logger.log('Cleared all custom job→foreman mappings');
  if (showAlert) {
    SpreadsheetApp.getUi().alert('\u2705 Custom job→foreman mappings cleared.');
  }
}

/**
 * Removes a single custom job→foreman mapping
 * @param {string} jobNumber - The job number to remove from mappings
 * @returns {Object} - {success: boolean, error?: string}
 */
function removeCustomJobForemanMapping(jobNumber) {
  if (!jobNumber) {
    return { success: false, error: 'No job number provided' };
  }

  var props = PropertiesService.getScriptProperties();
  var existingJson = props.getProperty('CUSTOM_JOB_FOREMAN_MAPPINGS');

  if (!existingJson) {
    return { success: false, error: 'No mappings found' };
  }

  try {
    var mappings = JSON.parse(existingJson);

    if (!mappings[jobNumber]) {
      return { success: false, error: 'Mapping for ' + jobNumber + ' not found' };
    }

    delete mappings[jobNumber];
    props.setProperty('CUSTOM_JOB_FOREMAN_MAPPINGS', JSON.stringify(mappings));

    Logger.log('Removed custom mapping for job ' + jobNumber + '. Remaining: ' + Object.keys(mappings).length);
    return { success: true, remaining: Object.keys(mappings).length };
  } catch (e) {
    Logger.log('Error removing mapping: ' + e);
    return { success: false, error: e.toString() };
  }
}

/**
 * Looks up foreman by job number, checking custom mappings and dialog config first
 * @param {string} jobNumber - Job number (e.g., "013-26")
 * @param {Object} dialogMappings - Optional mappings from dialog configuration
 * @returns {Object} - {name: string, jobExists: boolean, source: string}
 */
function lookupForemanWithCustomMapping(jobNumber, dialogMappings) {
  if (!jobNumber) return { name: '', jobExists: false, source: 'none' };

  // Check if this job was explicitly skipped in current session
  var props = PropertiesService.getScriptProperties();
  var skippedJobsStr = props.getProperty('SKIPPED_UNKNOWN_JOBS');
  if (skippedJobsStr) {
    try {
      var skippedJobs = JSON.parse(skippedJobsStr);
      if (skippedJobs.indexOf(jobNumber) !== -1) {
        Logger.log("lookupForemanWithCustomMapping: Job " + jobNumber + " was explicitly skipped");
        return { name: '', jobExists: false, source: 'skipped' };
      }
    } catch (e) {}
  }

  // Check saved custom mappings (permanent user overrides e.g. 005-26 -> Sydney Wade)
  var savedCustom = getCustomJobForemanMappings();
  if (savedCustom[jobNumber]) {
    Logger.log("lookupForemanWithCustomMapping: " + jobNumber + " -> saved_custom: " + savedCustom[jobNumber]);
    return { name: savedCustom[jobNumber], jobExists: true, source: 'saved_custom' };
  }

  // Check Safety Compliance Config (Job Tracking) - authoritative for ALL known active crews.
  // This is checked BEFORE temp_session so a stale temp_session from a prior run cannot
  // override the correct Job Tracking foreman for a known crew (e.g. 010-26 → Tyler Pierce).
  var complianceConfig = loadComplianceConfig();
  if (complianceConfig[jobNumber] && complianceConfig[jobNumber].foreman) {
    Logger.log("lookupForemanWithCustomMapping: " + jobNumber + " -> compliance_config: " + complianceConfig[jobNumber].foreman);
    return { name: complianceConfig[jobNumber].foreman, jobExists: true, source: 'compliance_config' };
  }

  // Check temporary mappings (set during unknown job resolution in this session).
  // Only reached for jobs NOT in compliance_config — i.e. truly unknown jobs the user resolved.
  var tempMappings = getTempJobForemanMappings();
  if (tempMappings && tempMappings[jobNumber]) {
    Logger.log("lookupForemanWithCustomMapping: " + jobNumber + " -> temp_session: " + tempMappings[jobNumber]);
    return { name: tempMappings[jobNumber], jobExists: true, source: 'temp_session' };
  }

  // Check dialog mappings (passed from current session)
  if (dialogMappings) {
    for (var foreman in dialogMappings) {
      var jobs = dialogMappings[foreman];
      if (jobs && jobs.indexOf(jobNumber) !== -1) {
        Logger.log("lookupForemanWithCustomMapping: " + jobNumber + " -> dialog: " + foreman);
        return { name: foreman, jobExists: true, source: 'dialog' };
      }
    }
  }

  // Check Job Tracking sheet - this is the authoritative source updated from Excel crew import
  // This takes precedence over Employees sheet classification-based lookup
  var jobTrackingCrews = getActiveCrewsFromJobTracking();
  var normalizedJobNumber = jobNumber.trim().toUpperCase();
  for (var j = 0; j < jobTrackingCrews.length; j++) {
    var jtJobNum = jobTrackingCrews[j].jobNumber.trim().toUpperCase();
    if (jtJobNum === normalizedJobNumber) {
      if (jobTrackingCrews[j].foreman) {
        Logger.log("lookupForemanWithCustomMapping: " + jobNumber + " -> job_tracking: " + jobTrackingCrews[j].foreman);
        return { name: jobTrackingCrews[j].foreman, jobExists: true, source: 'job_tracking' };
      } else {
        Logger.log("lookupForemanWithCustomMapping: " + jobNumber + " found in Job Tracking but NO FOREMAN");
        return { name: '', jobExists: true, source: 'job_tracking_no_foreman' };
      }
    }
  }
  Logger.log("lookupForemanWithCustomMapping: " + jobNumber + " not found, trying Employees sheet...");

  // Fall back to Employees sheet lookup (uses classification hierarchy)
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
 * Menu function: Add missing job→foreman mappings manually
 * Prompts for job numbers and foremen to add to the permanent custom mappings
 */
function addMissingJobMappings() {
  var ui = SpreadsheetApp.getUi();

  // Show current mappings first
  var currentMappings = getCustomJobForemanMappings();
  var currentList = Object.keys(currentMappings).map(function(j) {
    return j + ' → ' + currentMappings[j];
  }).join('\n') || 'None';

  var response = ui.prompt(
    'Add Job→Foreman Mappings',
    'Current mappings:\n' + currentList + '\n\n' +
    'Enter mappings in format: jobNumber=foremanName (one per line)\n' +
    'Example:\n054-26=Benjamin Lapka\n006-26=Benjamin Lapka\n038-26=Erik Davis',
    ui.ButtonSet.OK_CANCEL
  );

  if (response.getSelectedButton() !== ui.Button.OK) {
    return;
  }

  var input = response.getResponseText().trim();
  if (!input) {
    ui.alert('No Input', 'No mappings entered.', ui.ButtonSet.OK);
    return;
  }

  // Parse input
  var lines = input.split('\n');
  var newMappings = {};
  var errors = [];

  for (var i = 0; i < lines.length; i++) {
    var line = lines[i].trim();
    if (!line) continue;

    var parts = line.split('=');
    if (parts.length !== 2) {
      errors.push('Invalid format: ' + line);
      continue;
    }

    var jobNumber = parts[0].trim();
    var foreman = parts[1].trim();

    if (!jobNumber || !foreman) {
      errors.push('Missing job or foreman: ' + line);
      continue;
    }

    newMappings[jobNumber] = foreman;
  }

  if (errors.length > 0) {
    ui.alert('Errors Found', errors.join('\n'), ui.ButtonSet.OK);
    return;
  }

  if (Object.keys(newMappings).length === 0) {
    ui.alert('No Valid Mappings', 'No valid mappings were found in input.', ui.ButtonSet.OK);
    return;
  }

  // Merge with existing mappings
  var props = PropertiesService.getScriptProperties();
  var existingMappings = getCustomJobForemanMappings();

  for (var job in newMappings) {
    existingMappings[job] = newMappings[job];
  }

  props.setProperty('CUSTOM_JOB_FOREMAN_MAPPINGS', JSON.stringify(existingMappings));

  var addedList = Object.keys(newMappings).map(function(j) {
    return '\u2022 ' + j + ' → ' + newMappings[j];
  }).join('\n');

  ui.alert('Mappings Added', '\u2705 Added ' + Object.keys(newMappings).length + ' mapping(s):\n\n' + addedList +
    '\n\nNow run "Fix Skipped Log Entries" to update existing log entries.', ui.ButtonSet.OK);
}

/**
 * Menu function: Clear all safety log sheets and reprocess from scratch
 * WARNING: This deletes all data in JHA Log, Weekly Safety Log, Monthly Checklist Log
 */
function clearAndReprocessSafetyEmails() {
  var ui = SpreadsheetApp.getUi();

  var response = ui.alert(
    '\u26A0\uFE0F Clear and Reprocess ALL Safety Emails',
    'This will:\n' +
    '1. DELETE all data in JHA Log, Weekly Safety Log, Monthly Checklist Log\n' +
    '2. Clear the Safety Compliance sheet\n' +
    '3. Reset the "last processed" date so ALL emails are reprocessed\n\n' +
    'Your custom job→foreman mappings will be PRESERVED.\n\n' +
    'Are you sure you want to continue?',
    ui.ButtonSet.YES_NO
  );

  if (response !== ui.Button.YES) {
    return;
  }

  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();

    // Clear JHA Log (keep header)
    var jhaSheet = getJHALogSheet();
    if (jhaSheet && jhaSheet.getLastRow() > 1) {
      jhaSheet.deleteRows(2, jhaSheet.getLastRow() - 1);
      Logger.log('Cleared JHA Log');
    }

    // Clear Weekly Safety Log (keep header)
    var weeklySheet = getWeeklySafetyLogSheet();
    if (weeklySheet && weeklySheet.getLastRow() > 1) {
      weeklySheet.deleteRows(2, weeklySheet.getLastRow() - 1);
      Logger.log('Cleared Weekly Safety Log');
    }

    // Clear Monthly Checklist Log (keep header)
    var monthlySheet = getMonthlyChecklistLogSheet();
    if (monthlySheet && monthlySheet.getLastRow() > 1) {
      monthlySheet.deleteRows(2, monthlySheet.getLastRow() - 1);
      Logger.log('Cleared Monthly Checklist Log');
    }

    // Clear Safety Compliance (keep header)
    var complianceSheet = ss.getSheetByName('Safety Compliance');
    if (complianceSheet && complianceSheet.getLastRow() > 1) {
      complianceSheet.deleteRows(2, complianceSheet.getLastRow() - 1);
      Logger.log('Cleared Safety Compliance');
    }

    // Clear the last processed date
    var props = PropertiesService.getScriptProperties();
    props.deleteProperty('LAST_SAFETY_EMAIL_DATE');
    props.deleteProperty('SAFETY_BATCH_START');
    props.deleteProperty('SAFETY_BATCH_DATE_FILTER');
    props.deleteProperty('SAFETY_BATCH_DATE_FILTER');
    props.deleteProperty('SAFETY_BATCH_DATE_FILTER');
    props.deleteProperty('SAFETY_BATCH_DATE_FILTER');
    props.deleteProperty('TEMP_JOB_FOREMAN_MAPPINGS');
    props.deleteProperty('SKIPPED_UNKNOWN_JOBS');
    props.deleteProperty('PENDING_UNKNOWN_JOBS');
    Logger.log('Cleared processing state');

    ui.alert('Data Cleared', '\u2705 All safety log data has been cleared.\n\n' +
      'Now run "Process Safety Emails" and select a date range (e.g., 90 days or "All time").\n\n' +
      'When unknown jobs appear, assign them to foremen. The mappings will be saved permanently.',
      ui.ButtonSet.OK);

  } catch (e) {
    Logger.log('Error clearing safety data: ' + e.toString());
    ui.alert('Error', 'Failed to clear data: ' + e.toString(), ui.ButtonSet.OK);
  }
}

/**
 * Menu function: Fix existing "Skipped" log entries using saved custom job mappings
 * Use this to retroactively credit JHAs/Meetings that were previously skipped
 * because the job number wasn't recognized, but you've since assigned a foreman.
 */
function fixSkippedLogEntriesFromMappings() {
  var ui = SpreadsheetApp.getUi();

  try {
    // Get all saved custom mappings
    var customMappings = getCustomJobForemanMappings();
    var jobNumbers = Object.keys(customMappings);

    if (jobNumbers.length === 0) {
      ui.alert('No Mappings Found', 'There are no saved job→foreman mappings.\n\nMappings are created when you assign a foreman to an unknown job during safety email processing.', ui.ButtonSet.OK);
      return;
    }

    // Build assignments array
    var assignments = [];
    for (var i = 0; i < jobNumbers.length; i++) {
      assignments.push({
        jobNumber: jobNumbers[i],
        foreman: customMappings[jobNumbers[i]]
      });
    }

    Logger.log('fixSkippedLogEntriesFromMappings: Found ' + assignments.length + ' custom mappings');

    // Update log entries
    var updatedCount = updateLogEntriesForAssignedJobs(assignments);

    // Recalculate compliance to reflect the changes
    if (updatedCount > 0) {
      Logger.log('Recalculating compliance after updating ' + updatedCount + ' log entries...');
      recalculateComplianceFromLogs();
    }

    ui.alert('Log Entries Fixed', '\u2705 Updated ' + updatedCount + ' log entries from "Skipped" to "Credited".\n\n' +
      'Job mappings used:\n' + jobNumbers.map(function(j) { return '\u2022 ' + j + ' → ' + customMappings[j]; }).join('\n') +
      '\n\nCompliance has been recalculated.', ui.ButtonSet.OK);

  } catch (e) {
    Logger.log('Error fixing skipped log entries: ' + e.toString());
    ui.alert('Error', 'Failed to fix log entries: ' + e.toString(), ui.ButtonSet.OK);
  }
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

    // Track assignments to update existing log entries
    var jobsToCredit = [];

    for (var i = 0; i < decisions.length; i++) {
      var decision = decisions[i];
      if (decision.action === 'assign' && decision.foreman) {
        tempMappings[decision.jobNumber] = decision.foreman;
        Logger.log('Assigned: ' + decision.jobNumber + ' → ' + decision.foreman);

        // Track this assignment for updating existing log entries
        jobsToCredit.push({
          jobNumber: decision.jobNumber,
          foreman: decision.foreman
        });

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

    // === NEW: Update existing log entries for assigned jobs ===
    var updatedCount = 0;
    if (jobsToCredit.length > 0) {
      Logger.log('Updating existing log entries for ' + jobsToCredit.length + ' assigned jobs...');
      updatedCount = updateLogEntriesForAssignedJobs(jobsToCredit);
      Logger.log('Updated ' + updatedCount + ' log entries');
    }

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
      skipped: skippedJobs.length,
      logEntriesUpdated: updatedCount
    };

  } catch (e) {
    Logger.log('Error applying unknown job decisions: ' + e.toString());
    return { success: false, error: e.toString() };
  }
}

/**
 * Updates existing log entries (JHA Log, Weekly Safety Log) when a foreman is assigned
 * to an unknown job number. Changes status from "Skipped" or "Unknown Job" to "Credited".
 *
 * @param {Array} assignments - Array of {jobNumber, foreman} objects
 * @returns {number} Number of log entries updated
 */
function updateLogEntriesForAssignedJobs(assignments) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var totalUpdated = 0;

  // Load employee data to find foreman's primary crew
  var empSheet = ss.getSheetByName('Employees');
  var employeeData = empSheet ? empSheet.getDataRange().getValues() : null;

  // Build a map for quick lookup: jobNumber → {foreman, primaryCrew}
  var jobMap = {};
  for (var a = 0; a < assignments.length; a++) {
    var assignment = assignments[a];
    var baseJob = String(assignment.jobNumber).split('.')[0].trim();

    // Find the foreman's primary crew from Employees sheet
    var primaryCrew = null;
    if (employeeData) {
      primaryCrew = findForemanPrimaryCrew(assignment.foreman, employeeData);
    }

    // If we couldn't find the primary crew, the foreman assignment won't help much
    // But we'll still update with the base job as fallback
    jobMap[baseJob] = {
      foreman: assignment.foreman,
      primaryCrew: primaryCrew || baseJob // Use original job number if no primary crew found
    };

    if (primaryCrew) {
      Logger.log('updateLogEntriesForAssignedJobs: ' + baseJob + ' → ' + assignment.foreman + ' (primaryCrew: ' + primaryCrew + ')');
    } else {
      Logger.log('updateLogEntriesForAssignedJobs: WARNING - Could not find primary crew for ' + assignment.foreman + ', using ' + baseJob);
    }
  }

  // === Update JHA Log ===
  var jhaSheet = getJHALogSheet();
  if (jhaSheet && jhaSheet.getLastRow() > 1) {
    var jhaData = jhaSheet.getDataRange().getValues();
    // Columns: A=DateReceived, B=DateCreated, C=JobNumber, D=Foreman, E=Subject, F=EmailID, G=Source, H=Status, I=CreditedTo, J=Notes

    for (var i = 1; i < jhaData.length; i++) {
      var rowJobNumber = String(jhaData[i][2] || '').split('.')[0].trim(); // Column C
      var currentStatus = String(jhaData[i][7] || '').trim(); // Column H

      // Check if this job is in our assignment list and status is not already Credited
      if (jobMap[rowJobNumber] && (currentStatus === 'Skipped' || currentStatus === 'Unknown Job')) {
        var mapping = jobMap[rowJobNumber];
        var rowNum = i + 1; // 1-indexed row number

        // Update: Status = Credited, CreditedTo = primaryCrew, Foreman = foreman name
        jhaSheet.getRange(rowNum, 4).setValue(mapping.foreman); // Column D - Foreman
        jhaSheet.getRange(rowNum, 8).setValue('Credited'); // Column H - Status
        jhaSheet.getRange(rowNum, 9).setValue(mapping.primaryCrew); // Column I - Credited To

        // Append note about the assignment
        var existingNotes = String(jhaData[i][9] || '').trim(); // Column J
        var newNote = 'Assigned via dialog: ' + rowJobNumber + ' → ' + mapping.foreman;
        if (existingNotes && existingNotes.indexOf('Assigned via dialog') === -1) {
          newNote = existingNotes + '. ' + newNote;
        }
        jhaSheet.getRange(rowNum, 10).setValue(newNote); // Column J - Notes

        totalUpdated++;
        Logger.log('Updated JHA Log row ' + rowNum + ': ' + rowJobNumber + ' → Credited to ' + mapping.primaryCrew);
      }
    }
  }

  // === Update Weekly Safety Log ===
  var weeklySheet = getWeeklySafetyLogSheet();
  if (weeklySheet && weeklySheet.getLastRow() > 1) {
    var weeklyData = weeklySheet.getDataRange().getValues();
    // Columns: A=DateReceived, B=WeekOf, C=JobNumber, D=Foreman, E=Subject, F=EmailID, G=Status, H=CreditedTo, I=Notes

    for (var j = 1; j < weeklyData.length; j++) {
      var rowJobNumber = String(weeklyData[j][2] || '').split('.')[0].trim(); // Column C
      var currentStatus = String(weeklyData[j][6] || '').trim(); // Column G

      // Check if this job is in our assignment list and status is not already Credited
      if (jobMap[rowJobNumber] && (currentStatus === 'Skipped' || currentStatus === 'Unknown Job')) {
        var mapping = jobMap[rowJobNumber];
        var rowNum = j + 1;

        // Update: Status = Credited, CreditedTo = primaryCrew, Foreman = foreman name
        weeklySheet.getRange(rowNum, 4).setValue(mapping.foreman); // Column D - Foreman
        weeklySheet.getRange(rowNum, 7).setValue('Credited'); // Column G - Status
        weeklySheet.getRange(rowNum, 8).setValue(mapping.primaryCrew); // Column H - Credited To

        // Append note about the assignment
        var existingNotes = String(weeklyData[j][8] || '').trim(); // Column I
        var newNote = 'Assigned via dialog: ' + rowJobNumber + ' → ' + mapping.foreman;
        if (existingNotes && existingNotes.indexOf('Assigned via dialog') === -1) {
          newNote = existingNotes + '. ' + newNote;
        }
        weeklySheet.getRange(rowNum, 9).setValue(newNote); // Column I - Notes

        totalUpdated++;
        Logger.log('Updated Weekly Safety Log row ' + rowNum + ': ' + rowJobNumber + ' → Credited to ' + mapping.primaryCrew);
      }
    }
  }

  // === Update Monthly Checklist Log ===
  var monthlySheet = getMonthlyChecklistLogSheet();
  if (monthlySheet && monthlySheet.getLastRow() > 1) {
    var monthlyData = monthlySheet.getDataRange().getValues();
    // Columns: A=DateReceived, B=ReportDate, C=JobNumber, D=Foreman, E=Vehicle, F=Subject, G=EmailID, H=Status, I=CreditedTo, J=HasIssues, K=Notes

    for (var k = 1; k < monthlyData.length; k++) {
      var rowJobNumber = String(monthlyData[k][2] || '').split('.')[0].trim(); // Column C
      var currentStatus = String(monthlyData[k][7] || '').trim(); // Column H

      // Check if this job is in our assignment list and status is not already Credited
      if (jobMap[rowJobNumber] && (currentStatus === 'Skipped' || currentStatus === 'Unknown Job')) {
        var mapping = jobMap[rowJobNumber];
        var rowNum = k + 1;

        // Update: Status = Credited, CreditedTo = primaryCrew, Foreman = foreman name
        monthlySheet.getRange(rowNum, 4).setValue(mapping.foreman); // Column D - Foreman
        monthlySheet.getRange(rowNum, 8).setValue('Credited'); // Column H - Status
        monthlySheet.getRange(rowNum, 9).setValue(mapping.primaryCrew); // Column I - Credited To

        // Append note about the assignment
        var existingNotes = String(monthlyData[k][10] || '').trim(); // Column K
        var newNote = 'Assigned via dialog: ' + rowJobNumber + ' → ' + mapping.foreman;
        if (existingNotes && existingNotes.indexOf('Assigned via dialog') === -1) {
          newNote = existingNotes + '. ' + newNote;
        }
        monthlySheet.getRange(rowNum, 11).setValue(newNote); // Column K - Notes

        totalUpdated++;
        Logger.log('Updated Monthly Checklist Log row ' + rowNum + ': ' + rowJobNumber + ' → Credited to ' + mapping.primaryCrew);
      }
    }
  }

  return totalUpdated;
}

/**
 * Fixes ALL log entries that have incorrect "Credited To" values.
 * Looks up each foreman's primary crew from Employees sheet and updates the log.
 * This fixes entries where foreman was assigned but the primary crew lookup failed.
 *
 * @returns {Object} Result with counts of fixed entries
 */
function fixAllLogEntryCreditedTo() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var ui = SpreadsheetApp.getUi();

  // Load employee data
  var empSheet = ss.getSheetByName('Employees');
  if (!empSheet) {
    ui.alert('Error', 'Employees sheet not found', ui.ButtonSet.OK);
    return { success: false, error: 'Employees sheet not found' };
  }
  var employeeData = empSheet.getDataRange().getValues();

  // Get tracked crews from Config (authoritative source)
  var config = loadComplianceConfig();
  var trackedCrewSet = {};
  for (var crew in config) {
    trackedCrewSet[crew] = true;
  }
  Logger.log('fixAllLogEntryCreditedTo: Using ' + Object.keys(trackedCrewSet).length + ' crews from Config');

  var jhaFixed = 0;
  var weeklyFixed = 0;
  var monthlyFixed = 0;

  // === Fix JHA Log ===
  var jhaSheet = getJHALogSheet();
  if (jhaSheet && jhaSheet.getLastRow() > 1) {
    var jhaData = jhaSheet.getDataRange().getValues();
    // Columns: A=DateReceived, B=DateCreated, C=JobNumber, D=Foreman, E=Subject, F=EmailID, G=Source, H=Status, I=CreditedTo, J=Notes

    for (var i = 1; i < jhaData.length; i++) {
      var jobNumber = String(jhaData[i][2] || '').trim(); // Column C - Job Number
      var foreman = String(jhaData[i][3] || '').trim(); // Column D - Foreman
      var currentCreditedTo = String(jhaData[i][8] || '').trim(); // Column I - Credited To
      var status = String(jhaData[i][7] || '').trim(); // Column H - Status

      if (!foreman && !jobNumber) continue;

      // Try to find the correct crew to credit:
      // 1. First, try by job number (handles secondary job submissions like 053-26 → 052-25)
      // 2. Then, try by foreman name ONLY if there is no valid-format job number.
      //    If a well-formed job number (NNN-YY) exists but is untracked, it's a genuinely
      //    foreign/untracked job — don't claim it for the foreman's primary crew.
      //    Note: Dummy job numbers like 000-00 are NOT well-formed real jobs.
      var primaryCrew = null;
      var jobNumberIsWellFormed = /^\d{3}-\d{2}(\.\d+)?$/.test(jobNumber) && !jobNumber.startsWith('000-');

      if (jobNumber) {
        var resolution = resolveJobToTrackedCrew(jobNumber);
        if (resolution.resolved && resolution.creditedTo) {
          primaryCrew = resolution.creditedTo;
        }
      }

      // Only fall back to foreman lookup when there is NO well-formed job number.
      // A real job number that simply isn't tracked means it's a different/out-of-state job.
      if (!primaryCrew && !jobNumberIsWellFormed && foreman && foreman !== 'UNKNOWN') {
        primaryCrew = findForemanPrimaryCrew(foreman, employeeData);
      }

      var targetCrew = primaryCrew || (trackedCrewSet[currentCreditedTo] ? currentCreditedTo : null);

      if (targetCrew && trackedCrewSet[targetCrew]) {
        var rowNum = i + 1;
        var needsCreditedToUpdate = (primaryCrew && primaryCrew !== currentCreditedTo);
        var needsStatusUpdate = (status !== 'Credited' && (status === 'Unknown Job' || status === 'Skipped' || !status));

        if (needsCreditedToUpdate || needsStatusUpdate) {
          if (needsCreditedToUpdate) {
            jhaSheet.getRange(rowNum, 9).setValue(primaryCrew); // Column I - Credited To
          }
          if (needsStatusUpdate) {
            jhaSheet.getRange(rowNum, 8).setValue('Credited'); // Column H - Status
          }

          var existingNotes = String(jhaData[i][9] || '').trim(); // Column J
          if (existingNotes.indexOf('Fixed by fixAllLogEntryCreditedTo') === -1) {
            var newNote = 'Fixed by fixAllLogEntryCreditedTo: ' + (currentCreditedTo || 'empty') + ' → ' + targetCrew;
            jhaSheet.getRange(rowNum, 10).setValue(existingNotes ? existingNotes + '. ' + newNote : newNote);
          }

          jhaFixed++;
          Logger.log('Fixed JHA Log row ' + rowNum + ': job=' + jobNumber + ', foreman=' + foreman + ' → ' + targetCrew + ' (was: ' + currentCreditedTo + ')');
        }
      }
    }
  }

  // === Fix Weekly Safety Log ===
  var weeklySheet = getWeeklySafetyLogSheet();
  if (weeklySheet && weeklySheet.getLastRow() > 1) {
    var weeklyData = weeklySheet.getDataRange().getValues();
    // Columns: A=DateReceived, B=WeekOf, C=JobNumber, D=Foreman, E=Subject, F=EmailID, G=Status, H=CreditedTo, I=Notes

    for (var j = 1; j < weeklyData.length; j++) {
      var jobNumber = String(weeklyData[j][2] || '').trim(); // Column C - Job Number
      var foreman = String(weeklyData[j][3] || '').trim(); // Column D - Foreman
      var currentCreditedTo = String(weeklyData[j][7] || '').trim(); // Column H - Credited To
      var status = String(weeklyData[j][6] || '').trim(); // Column G - Status

      if (!foreman && !jobNumber) continue;

      // Try by job number first, then by foreman (same guard as JHA log above)
      var primaryCrew = null;
      var jobNumberIsWellFormed = /^\d{3}-\d{2}(\.\d+)?$/.test(jobNumber) && !jobNumber.startsWith('000-');

      if (jobNumber) {
        var resolution = resolveJobToTrackedCrew(jobNumber);
        if (resolution.resolved && resolution.creditedTo) {
          primaryCrew = resolution.creditedTo;
        }
      }

      if (!primaryCrew && !jobNumberIsWellFormed && foreman && foreman !== 'UNKNOWN') {
        primaryCrew = findForemanPrimaryCrew(foreman, employeeData);
      }

      var targetCrew = primaryCrew || (trackedCrewSet[currentCreditedTo] ? currentCreditedTo : null);

      if (targetCrew && trackedCrewSet[targetCrew]) {
        var rowNum = j + 1;
        var needsCreditedToUpdate = (primaryCrew && primaryCrew !== currentCreditedTo);
        var needsStatusUpdate = (status !== 'Credited' && (status === 'Unknown Job' || status === 'Skipped' || !status));

        if (needsCreditedToUpdate || needsStatusUpdate) {
          if (needsCreditedToUpdate) {
            weeklySheet.getRange(rowNum, 8).setValue(primaryCrew); // Column H - Credited To
          }
          if (needsStatusUpdate) {
            weeklySheet.getRange(rowNum, 7).setValue('Credited'); // Column G - Status
          }

          var existingNotes = String(weeklyData[j][8] || '').trim(); // Column I
          if (existingNotes.indexOf('Fixed by fixAllLogEntryCreditedTo') === -1) {
            var newNote = 'Fixed by fixAllLogEntryCreditedTo: ' + (currentCreditedTo || 'empty') + ' → ' + targetCrew;
            weeklySheet.getRange(rowNum, 9).setValue(existingNotes ? existingNotes + '. ' + newNote : newNote);
          }

          weeklyFixed++;
          Logger.log('Fixed Weekly Safety Log row ' + rowNum + ': job=' + jobNumber + ', foreman=' + foreman + ' → ' + targetCrew);
        }
      }
    }
  }

  // === Fix Monthly Checklist Log ===
  var monthlySheet = getMonthlyChecklistLogSheet();
  if (monthlySheet && monthlySheet.getLastRow() > 1) {
    var monthlyData = monthlySheet.getDataRange().getValues();
    // Columns: A=DateReceived, B=ReportDate, C=JobNumber, D=Foreman, E=Vehicle, F=Subject, G=EmailID, H=Status, I=CreditedTo, J=HasIssues, K=Notes

    for (var k = 1; k < monthlyData.length; k++) {
      var foreman = String(monthlyData[k][3] || '').trim(); // Column D - Foreman
      var currentCreditedTo = String(monthlyData[k][8] || '').trim(); // Column I - Credited To
      var status = String(monthlyData[k][7] || '').trim(); // Column H - Status

      if (!foreman || foreman === 'UNKNOWN') continue;

      var primaryCrew = findForemanPrimaryCrew(foreman, employeeData);
      var targetCrew = primaryCrew || (trackedCrewSet[currentCreditedTo] ? currentCreditedTo : null);

      if (targetCrew && trackedCrewSet[targetCrew]) {
        var rowNum = k + 1;
        var needsCreditedToUpdate = (primaryCrew && primaryCrew !== currentCreditedTo);
        var needsStatusUpdate = (status !== 'Credited' && (status === 'Unknown Job' || status === 'Skipped' || !status));

        if (needsCreditedToUpdate || needsStatusUpdate) {
          if (needsCreditedToUpdate) {
            monthlySheet.getRange(rowNum, 9).setValue(primaryCrew); // Column I - Credited To
          }
          if (needsStatusUpdate) {
            monthlySheet.getRange(rowNum, 8).setValue('Credited'); // Column H - Status
          }

          var existingNotes = String(monthlyData[k][10] || '').trim(); // Column K
          if (existingNotes.indexOf('Fixed by fixAllLogEntryCreditedTo') === -1) {
            var newNote = 'Fixed by fixAllLogEntryCreditedTo: ' + (currentCreditedTo || 'empty') + ' → ' + targetCrew;
            monthlySheet.getRange(rowNum, 11).setValue(existingNotes ? existingNotes + '. ' + newNote : newNote);
          }

          monthlyFixed++;
          Logger.log('Fixed Monthly Checklist Log row ' + rowNum + ': ' + foreman + ' → ' + targetCrew);
        }
      }
    }
  }

  var totalFixed = jhaFixed + weeklyFixed + monthlyFixed;
  Logger.log('fixAllLogEntryCreditedTo: Fixed ' + totalFixed + ' entries (JHA: ' + jhaFixed + ', Weekly: ' + weeklyFixed + ', Monthly: ' + monthlyFixed + ')');

  return {
    success: true,
    jhaFixed: jhaFixed,
    weeklyFixed: weeklyFixed,
    monthlyFixed: monthlyFixed,
    totalFixed: totalFixed
  };
}

/**
 * Audit all log sheet CreditedTo values using the current (fixed) resolution logic.
 *
 * For every row in JHA Log, Weekly Safety Log, and Monthly Checklist Log this function:
 *   1. Recomputes what creditedTo SHOULD be under the current fixed logic.
 *   2. Flags rows whose current value differs from the computed value.
 *   3. Specially identifies rows whose Notes show they were previously changed by
 *      fixAllLogEntryCreditedTo, and whether the foreman-fallback bug may have applied.
 *
 * This is a READ-ONLY dry run — nothing is changed.
 * Menu: Glove Manager -> Safety -> Debug -> Audit CreditedTo Values
 */
function auditCreditedToAccuracy() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var ui = SpreadsheetApp.getUi();

  var empSheet = ss.getSheetByName('Employees');
  if (!empSheet) {
    ui.alert('Error', 'Employees sheet not found', ui.ButtonSet.OK);
    return;
  }
  var employeeData = empSheet.getDataRange().getValues();

  var config = loadComplianceConfig();
  var trackedCrewSet = {};
  for (var crew in config) {
    trackedCrewSet[crew] = true;
  }

  var wouldChange = [];    // rows where current != computed
  var bugAffected = [];    // rows changed by old buggy run that appear wrong

  // Helper: compute correct creditedTo using the fixed logic
  function computeCorrect(jobNumber, foreman) {
    var cleanJob = String(jobNumber || '').trim();
    var jobNumberIsWellFormed = /^\d{3}-\d{2}(\.\d+)?$/.test(cleanJob) && !cleanJob.startsWith('000-');

    if (jobNumber) {
      var resolution = resolveJobToTrackedCrew(jobNumber);
      if (resolution.resolved && resolution.creditedTo) {
        primaryCrew = resolution.creditedTo;
      }
    }

    // Only fall back to foreman when there is NO well-formed job number
    if (!primaryCrew && !jobNumberIsWellFormed && foreman && foreman !== 'UNKNOWN') {
      primaryCrew = findForemanPrimaryCrew(foreman, employeeData);
    }

    return { crew: primaryCrew, jobNumberIsWellFormed: jobNumberIsWellFormed };
  }

  // Helper: parse "Fixed by fixAllLogEntryCreditedTo: ORIG → NEW" from note text
  function parseFixNote(notes) {
    var match = String(notes || '').match(/Fixed by fixAllLogEntryCreditedTo:\s*(.+?)\s*\u2192\s*(.+?)(?:\.|$)/);
    if (!match) {
      // Try plain ASCII arrow "-> "
      match = String(notes || '').match(/Fixed by fixAllLogEntryCreditedTo:\s*(.+?)\s*->\s*(.+?)(?:\.|$)/);
    }
    if (match) {
      return { original: match[1].trim(), changedTo: match[2].trim() };
    }
    return null;
  }

  // === Audit JHA Log ===
  var jhaSheet = getJHALogSheet();
  if (jhaSheet && jhaSheet.getLastRow() > 1) {
    var jhaData = jhaSheet.getDataRange().getValues();
    // Columns: A=DateReceived, B=DateCreated, C=JobNumber, D=Foreman, E=Subject, F=EmailID, G=Source, H=Status, I=CreditedTo, J=Notes
    for (var i = 1; i < jhaData.length; i++) {
      var jobNumber = String(jhaData[i][2] || '').trim();
      var foreman   = String(jhaData[i][3] || '').trim();
      var current   = String(jhaData[i][8] || '').trim();
      var notes     = String(jhaData[i][9] || '').trim();
      var rowNum    = i + 1;

      var computed = computeCorrect(jobNumber, foreman);
      var fixNote  = parseFixNote(notes);

      // Was the change made by the old function likely a bug?
      // Bug condition: job IS well-formed (NNN-YY) but untracked → foreman fallback fired incorrectly
      if (fixNote) {
        var resolution = resolveJobToTrackedCrew(jobNumber);
        var wasBug = computed.jobNumberIsWellFormed && !resolution.resolved;
        if (wasBug) {
          bugAffected.push({
            sheet: 'JHA Log', row: rowNum, jobNumber: jobNumber, foreman: foreman,
            original: fixNote.original, changedTo: fixNote.changedTo, current: current,
            correct: computed.crew
          });
        }
      }

      if (computed.crew && trackedCrewSet[computed.crew] && computed.crew !== current) {
        wouldChange.push({
          sheet: 'JHA Log', row: rowNum, jobNumber: jobNumber, foreman: foreman,
          current: current, correct: computed.crew
        });
      }
    }
  }

  // === Audit Weekly Safety Log ===
  var weeklySheet = getWeeklySafetyLogSheet();
  if (weeklySheet && weeklySheet.getLastRow() > 1) {
    var weeklyData = weeklySheet.getDataRange().getValues();
    // Columns: A=DateReceived, B=WeekOf, C=JobNumber, D=Foreman, E=Subject, F=EmailID, G=Status, H=CreditedTo, I=Notes
    for (var j = 1; j < weeklyData.length; j++) {
      var jobNumber = String(weeklyData[j][2] || '').trim();
      var foreman   = String(weeklyData[j][3] || '').trim();
      var current   = String(weeklyData[j][7] || '').trim();
      var notes     = String(weeklyData[j][8] || '').trim();
      var rowNum    = j + 1;

      var computed = computeCorrect(jobNumber, foreman);
      var fixNote  = parseFixNote(notes);

      if (fixNote) {
        var resolution = resolveJobToTrackedCrew(jobNumber);
        var wasBug = computed.jobNumberIsWellFormed && !resolution.resolved;
        if (wasBug) {
          bugAffected.push({
            sheet: 'Weekly Safety Log', row: rowNum, jobNumber: jobNumber, foreman: foreman,
            original: fixNote.original, changedTo: fixNote.changedTo, current: current,
            correct: computed.crew
          });
        }
      }

      if (computed.crew && trackedCrewSet[computed.crew] && computed.crew !== current) {
        wouldChange.push({
          sheet: 'Weekly Safety Log', row: rowNum, jobNumber: jobNumber, foreman: foreman,
          current: current, correct: computed.crew
        });
      }
    }
  }

  // === Audit Monthly Checklist Log ===
  // Monthly checklists have no job number field — foreman fallback is always intended here.
  // No bug risk for monthly entries.

  // Build summary text
  var lines = [];
  lines.push('=== CreditedTo Audit Results ===\n');
  lines.push('Entries that would change under current logic: ' + wouldChange.length);
  lines.push('Entries previously touched by fixAllLogEntryCreditedTo where foreman-fallback bug may have applied: ' + bugAffected.length);

  if (bugAffected.length > 0) {
    lines.push('\n--- Likely Bug-Affected Entries ---');
    for (var b = 0; b < bugAffected.length; b++) {
      var e = bugAffected[b];
      lines.push(e.sheet + ' row ' + e.row + ': job=' + e.jobNumber +
                 ' | original=' + e.original + ' | bug changed to=' + e.changedTo +
                 ' | current=' + e.current + ' | correct under fixed logic=' + (e.correct || '(unchanged)'));
    }
  }

  if (wouldChange.length > 0) {
    lines.push('\n--- Would Change Under Current Logic ---');
    for (var w = 0; w < wouldChange.length; w++) {
      var c = wouldChange[w];
      lines.push(c.sheet + ' row ' + c.row + ': job=' + c.jobNumber +
                 ', foreman=' + c.foreman + ' | current=' + c.current + ' -> ' + c.correct);
    }
  }

  var summary = lines.join('\n');
  Logger.log(summary);

  // Show concise UI message (details in Logger)
  var uiMsg = 'Entries that would change under current logic: ' + wouldChange.length + '\n' +
              'Likely bug-affected (well-formed untracked job + old foreman fallback): ' + bugAffected.length + '\n\n';
  if (bugAffected.length === 0 && wouldChange.length === 0) {
    uiMsg += 'All CreditedTo values look correct. No issues found.';
  } else {
    uiMsg += 'Full details written to Execution Log (Extensions > Apps Script > Executions).\n\n';
    if (bugAffected.length > 0) {
      uiMsg += 'Bug-affected rows:\n';
      for (var b2 = 0; b2 < bugAffected.length; b2++) {
        var e2 = bugAffected[b2];
        uiMsg += '  ' + e2.sheet + ' row ' + e2.row + ': ' + e2.jobNumber +
                 ' | ' + e2.original + ' -> (was changed to) ' + e2.changedTo + '\n';
      }
      uiMsg += '\nRun "Revert Bug-Fixed CreditedTo" to restore the original values.';
    }
  }

  ui.alert('CreditedTo Audit', uiMsg, ui.ButtonSet.OK);

  return { wouldChange: wouldChange, bugAffected: bugAffected };
}

/**
 * Revert CreditedTo values that were incorrectly set by the old buggy fixAllLogEntryCreditedTo.
 *
 * The bug: when a JHA or Weekly log entry had a well-formed job number (NNN-YY) that was NOT
 * in the tracked crew set, the old function fell back to the foreman's primary crew — wrong.
 * The Note column records the original value as "Fixed by fixAllLogEntryCreditedTo: ORIG -> NEW".
 *
 * This function:
 *   1. Shows a dry-run preview of what it would revert.
 *   2. Asks for confirmation.
 *   3. Reverts creditedTo to ORIG for bug-affected rows and appends a note.
 *
 * Menu: Glove Manager -> Safety -> Debug -> Revert Bug-Fixed CreditedTo
 */
function menuRevertBuggyFixedCreditedTo() {
  var ui = SpreadsheetApp.getUi();

  // First show the audit so the user can see what will be reverted
  var auditResult = auditCreditedToAccuracy();
  if (!auditResult) return;

  var bugAffected = auditResult.bugAffected;
  if (bugAffected.length === 0) {
    ui.alert('Nothing to Revert', 'No bug-affected CreditedTo entries found. Everything looks correct.', ui.ButtonSet.OK);
    return;
  }

  var previewLines = [
    'Found ' + bugAffected.length + ' entry(ies) to revert:\n'
  ];
  for (var b = 0; b < bugAffected.length; b++) {
    var e = bugAffected[b];
    previewLines.push(e.sheet + ' row ' + e.row + ': ' + e.changedTo + ' -> ' + e.original +
                      ' (job: ' + e.jobNumber + ')');
  }
  previewLines.push('\nProceed with revert?');

  var response = ui.alert('Revert Bug-Fixed CreditedTo', previewLines.join('\n'), ui.ButtonSet.YES_NO);
  if (response !== ui.Button.YES) {
    ui.alert('Cancelled', 'No changes were made.', ui.ButtonSet.OK);
    return;
  }

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var config = loadComplianceConfig();
  var reverted = 0;
  var skipped  = 0;

  for (var i = 0; i < bugAffected.length; i++) {
    var entry = bugAffected[i];
    var sheet = entry.sheet === 'JHA Log' ? getJHALogSheet()
              : entry.sheet === 'Weekly Safety Log' ? getWeeklySafetyLogSheet()
              : null;
    if (!sheet) { skipped++; continue; }

    var creditedToCol, notesCol;
    if (entry.sheet === 'JHA Log') {
      creditedToCol = 9;  // Column I (1-based)
      notesCol      = 10; // Column J
    } else {
      creditedToCol = 8;  // Column H
      notesCol      = 9;  // Column I
    }

    // Read current notes to append revert note
    var currentNotes = String(sheet.getRange(entry.row, notesCol).getValue() || '').trim();
    var revertNote   = 'BugReverted: ' + entry.changedTo + ' -> ' + entry.original + ' (bug fix reversal ' + new Date().toLocaleDateString() + ')';
    var updatedNotes = currentNotes ? currentNotes + '. ' + revertNote : revertNote;

    sheet.getRange(entry.row, creditedToCol).setValue(entry.original);
    sheet.getRange(entry.row, notesCol).setValue(updatedNotes);

    Logger.log('Reverted ' + entry.sheet + ' row ' + entry.row + ': ' + entry.changedTo + ' -> ' + entry.original);
    reverted++;
  }

  ui.alert('Revert Complete',
    'Reverted ' + reverted + ' entry(ies).\n' +
    (skipped > 0 ? 'Skipped ' + skipped + ' (sheet not found).\n' : '') +
    '\nYou should now run Master Recalculate Compliance to rebuild compliance from the corrected log data.',
    ui.ButtonSet.OK);
}

/**
 * MASTER RECALCULATE COMPLIANCE
 * Consolidated function that replaces the 3 separate recalculate options:
 * 1. Fixes log entries (Credited To values)
 * 2. Optionally removes non-config crews from current week
 * 3. Recalculates ALL weeks from log data
 * 4. Refreshes tooltips
 *
 * Menu: Glove Manager → Safety → 🔄 Master Recalculate
 */
function masterRecalculateCompliance() {
  const html = HtmlService.createHtmlOutputFromFile('MasterRecalculateDialog')
    .setWidth(450)
    .setHeight(320);
  SpreadsheetApp.getUi().showModalDialog(html, 'Master Recalculate Compliance');
}

/**
 * Removes any stray header rows (e.g. Job Number = "Job Number" or Foreman = "Foreman")
 * that accidentally got inserted as data rows on the Safety Compliance sheet.
 *
 * @returns {number} Count of removed rows
 */
function cleanUpHeaderRowsInSafetyCompliance() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Safety Compliance');
  if (!sheet || sheet.getLastRow() < 2) return 0;

  var data = sheet.getDataRange().getValues();
  var headers = data[0];
  var jobCol = -1, foremanCol = -1;

  for (var h = 0; h < headers.length; h++) {
    var hdr = String(headers[h]).toLowerCase().trim().replace(/\s+/g, '');
    if (hdr === 'jobnumber' || hdr === 'crew') jobCol = h;
    if (hdr === 'foreman' || hdr === 'lead') foremanCol = h;
  }

  if (jobCol === -1) jobCol = 1;

  var rowsToDelete = [];
  for (var i = data.length - 1; i >= 1; i--) {
    var jobVal = String(data[i][jobCol] || '').trim().toLowerCase();
    var foremanVal = foremanCol >= 0 ? String(data[i][foremanCol] || '').trim().toLowerCase() : '';

    if (jobVal === 'job number' || jobVal === 'job #' || jobVal === 'job' || foremanVal === 'foreman') {
      rowsToDelete.push(i + 1);
    }
  }

  if (rowsToDelete.length > 0) {
    for (var r = 0; r < rowsToDelete.length; r++) {
      sheet.deleteRow(rowsToDelete[r]);
    }
    Logger.log('cleanUpHeaderRowsInSafetyCompliance: Cleaned up ' + rowsToDelete.length + ' invalid header rows');
  }

  return rowsToDelete.length;
}

/**
 * Starts the master recalculation process.
 * Fixes log entries, removes non-config crews for the current week,
 * and returns the list of unique weeks to recalculate.
 * 
 * @returns {Object} Result metadata and array of unique week keys (yyyy-MM-dd)
 */
function startMasterRecalculate() {
  clearComplianceConfigCache();
  cleanUpHeaderRowsInSafetyCompliance();

  const today = new Date();
  const currentWeekBounds = getWeekBoundaries(today);
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const tz = Session.getScriptTimeZone();
  const config = loadComplianceConfig({ includeAll: true });

  // Step 1: Fix log entries
  Logger.log('startMasterRecalculate: Step 1 - Fixing log entries...');
  const fixResult = fixAllLogEntryCreditedTo();
  const logsFixes = {
    jha: fixResult.jhaFixed || 0,
    weekly: fixResult.weeklyFixed || 0,
    monthly: fixResult.monthlyFixed || 0
  };

  // Step 2: Remove non-config crews from CURRENT WEEK ONLY
  const nonConfigCrews = findNonConfigCrewsInCurrentWeek(ss, currentWeekBounds.weekStart, config, tz);
  let nonConfigRemoved = 0;
  if (nonConfigCrews.length > 0) {
    Logger.log('startMasterRecalculate: Step 2 - Removing ' + nonConfigCrews.length + ' non-config crews from current week...');
    nonConfigRemoved = removeNonConfigCrewsFromCurrentWeekSilent(ss, currentWeekBounds.weekStart, config, tz);
  }

  // Get all unique weeks to recalculate
  const uniqueWeeks = getUniqueWeeksToProcess(ss, tz);
  const weekKeys = Object.keys(uniqueWeeks).sort().reverse();

  return {
    success: true,
    weeks: weekKeys,
    logsFixes: logsFixes,
    nonConfigRemoved: nonConfigRemoved
  };
}

/**
 * Processes a batch of weeks during master recalculation.
 * 
 * @param {Array<string>} weekKeysBatch - Array of week start date keys (yyyy-MM-dd)
 * @returns {Object} Result of batch recalculation
 */
function recalculateWeeksBatch(weekKeysBatch) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const tz = Session.getScriptTimeZone();
  const results = {
    compliant: 0,
    missing: 0,
    weeksProcessed: 0
  };

  for (let w = 0; w < weekKeysBatch.length; w++) {
    const weekKey = weekKeysBatch[w];
    const weekStart = parseDateNoon(weekKey);
    if (!weekStart) continue;

    const complianceData = calculateComplianceFromLogs(weekStart, { ignoreResolved: true });
    if (complianceData) {
      updateComplianceSheetFromLogs(complianceData, { ignoreResolved: true });
      results.compliant += complianceData.compliantCount || 0;
      results.missing += complianceData.missingCount || 0;
      results.weeksProcessed++;
    }
  }

  return results;
}

/**
 * Finalizes the master recalculation process by formatting and refreshing tooltips.
 * 
 * @returns {Object} Success status
 */
function finishMasterRecalculate() {
  formatComplianceSheetByWeek();
  refreshSafetyComplianceTooltips();
  return { success: true };
}

/**
 * masterRecalculateComplianceSilent — same core logic as masterRecalculateCompliance
 * but with NO SpreadsheetApp.getUi() calls. Safe to call from time triggers.
 * @return {{ weeksProcessed, compliant, missing, logsFixes, nonConfigRemoved }}
 */
function masterRecalculateComplianceSilent() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var tz = Session.getScriptTimeZone();
  var startTime = new Date().getTime();

  clearComplianceConfigCache();

  var today = new Date();
  var currentWeekBounds = getWeekBoundaries(today);
  var config = loadComplianceConfig();
  var results = { logsFixes: { jha: 0, weekly: 0, monthly: 0 }, nonConfigRemoved: 0, weeksProcessed: 0, compliant: 0, missing: 0 };

  // Step 1: Fix log entries
  Logger.log('masterRecalculateComplianceSilent: Step 1 - Fixing log entries...');
  try {
    var fixResult = fixAllLogEntryCreditedTo();
    results.logsFixes = { jha: fixResult.jhaFixed || 0, weekly: fixResult.weeklyFixed || 0, monthly: fixResult.monthlyFixed || 0 };
  } catch(e) { Logger.log('masterRecalculateComplianceSilent: Step 1 error: ' + e); }

  // Step 2: Remove non-config crews from CURRENT WEEK ONLY
  try {
    var nonConfigCrews = findNonConfigCrewsInCurrentWeek(ss, currentWeekBounds.weekStart, config, tz);
    if (nonConfigCrews.length > 0) {
      Logger.log('masterRecalculateComplianceSilent: Step 2 - Removing ' + nonConfigCrews.length + ' non-config crews from current week...');
      results.nonConfigRemoved = removeNonConfigCrewsFromCurrentWeekSilent(ss, currentWeekBounds.weekStart, config, tz);
    }
  } catch(e) { Logger.log('masterRecalculateComplianceSilent: Step 2 error: ' + e); }

  // Step 3: Recalculate ALL weeks
  Logger.log('masterRecalculateComplianceSilent: Step 3 - Recalculating all weeks...');
  try {
    const uniqueWeeks = getUniqueWeeksToProcess(ss, tz);
    const weekKeys = Object.keys(uniqueWeeks).sort().reverse();
    for (let w = 0; w < weekKeys.length; w++) {
      const ws = uniqueWeeks[weekKeys[w]];
      const complianceData = calculateComplianceFromLogs(ws, { ignoreResolved: true });
      if (complianceData) {
        updateComplianceSheetFromLogs(complianceData, { ignoreResolved: true });
        results.compliant += complianceData.compliantCount || 0;
        results.missing += complianceData.missingCount || 0;
        results.weeksProcessed++;
      }
    }
  } catch(e) { Logger.log('masterRecalculateComplianceSilent: Step 3 error: ' + e); }

  // Step 4: Format and refresh tooltips
  Logger.log('masterRecalculateComplianceSilent: Step 4 - Formatting and tooltips...');
  try { formatComplianceSheetByWeek(); } catch(e) { Logger.log('masterRecalculateComplianceSilent: format error: ' + e); }
  try { refreshSafetyComplianceTooltips(); } catch(e) { Logger.log('masterRecalculateComplianceSilent: tooltips error: ' + e); }

  var elapsed = Math.round((new Date().getTime() - startTime) / 1000);
  Logger.log('masterRecalculateComplianceSilent: Done in ' + elapsed + 's — weeks=' + results.weeksProcessed +
             ' compliant=' + results.compliant + ' missing=' + results.missing);
  return results;
}

/**
 * Helper: Find non-config crews in current week
 */
function findNonConfigCrewsInCurrentWeek(ss, currentWeekStart, config, tz) {
  var sheet = ss.getSheetByName('Safety Compliance');
  if (!sheet || sheet.getLastRow() < 2) return [];

  var currentWeekKey = Utilities.formatDate(currentWeekStart, tz, 'yyyy-MM-dd');
  var data = sheet.getDataRange().getValues();
  var nonConfigCrews = [];

  for (var i = 1; i < data.length; i++) {
    var rowWeek = data[i][0];
    var rowJob = String(data[i][1] || '').trim();

    if (!rowWeek || !rowJob) continue;

    var rowWeekKey = Utilities.formatDate(new Date(rowWeek), tz, 'yyyy-MM-dd');

    if (rowWeekKey === currentWeekKey && !config[rowJob]) {
      if (nonConfigCrews.indexOf(rowJob) === -1) {
        nonConfigCrews.push(rowJob);
      }
    }
  }

  return nonConfigCrews;
}

/**
 * Helper: Remove non-config crews from current week (silent, no UI)
 */
function removeNonConfigCrewsFromCurrentWeekSilent(ss, currentWeekStart, config, tz) {
  var sheet = ss.getSheetByName('Safety Compliance');
  if (!sheet || sheet.getLastRow() < 2) return 0;

  var currentWeekKey = Utilities.formatDate(currentWeekStart, tz, 'yyyy-MM-dd');
  var data = sheet.getDataRange().getValues();
  var rowsToDelete = [];

  for (var i = data.length - 1; i >= 1; i--) {
    var rowWeek = data[i][0];
    var rowJob = String(data[i][1] || '').trim();

    if (!rowWeek || !rowJob) continue;

    var rowWeekKey = Utilities.formatDate(new Date(rowWeek), tz, 'yyyy-MM-dd');

    if (rowWeekKey === currentWeekKey && !config[rowJob]) {
      rowsToDelete.push(i + 1);
    }
  }

  for (var r = 0; r < rowsToDelete.length; r++) {
    sheet.deleteRow(rowsToDelete[r]);
  }

  return rowsToDelete.length;
}

/**
 * Lightweight auto-cleanup that runs at end of processSafetyEmails
 * Does NOT show UI dialogs - runs silently
 * Only fixes current + previous week (not all weeks)
/**
/**
 * Auto-cleanup: Fix log entries and remove non-config crews from current week.
 * Runs silently at the end of processSafetyEmails.
 * @param {boolean} skipSyncCrews - If true, skip the syncCrews step (already done by caller)
 * @returns {Object} - Results of cleanup operations
 */
function autoComplianceCleanup(skipSyncCrews) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var tz = Session.getScriptTimeZone();
  var results = {
    logsFixes: { jha: 0, weekly: 0, monthly: 0 },
    nonConfigRemoved: 0,
    configPopulated: false
  };

  try {
    var today = new Date();
    var currentWeekBounds = getWeekBoundaries(today);
    var previousWeekStart = new Date(currentWeekBounds.weekStart);
    previousWeekStart.setDate(previousWeekStart.getDate() - 7);

    // Step 1: Sync crews to Job Tracking (skip if already done by caller)
    if (!skipSyncCrews) {
      try {
        populateComplianceConfigSilent();
        results.configPopulated = true;
        Logger.log('autoComplianceCleanup: Crews synced to Job Tracking');
      } catch (e) {
        Logger.log('autoComplianceCleanup: Crew sync error (non-fatal): ' + e.toString());
      }
    } else {
      results.configPopulated = true;
      Logger.log('autoComplianceCleanup: Skipping crew sync (already done by caller)');
    }

    // Step 2: Fix log entries for current + previous week only
    // This is lighter than fixing ALL weeks
    try {
      var fixResult = fixLogEntriesForWeeks([currentWeekBounds.weekStart, previousWeekStart]);
      results.logsFixes = {
        jha: fixResult.jhaFixed || 0,
        weekly: fixResult.weeklyFixed || 0,
        monthly: fixResult.monthlyFixed || 0
      };
      Logger.log('autoComplianceCleanup: Fixed logs - JHA:' + results.logsFixes.jha +
                 ', Weekly:' + results.logsFixes.weekly + ', Monthly:' + results.logsFixes.monthly);
    } catch (e) {
      Logger.log('autoComplianceCleanup: Log fix error (non-fatal): ' + e.toString());
    }

    // Step 3: Remove non-config crews from CURRENT WEEK ONLY
    try {
      var config = loadComplianceConfig();
      results.nonConfigRemoved = removeNonConfigCrewsFromCurrentWeekSilent(ss, currentWeekBounds.weekStart, config, tz);
      Logger.log('autoComplianceCleanup: Removed ' + results.nonConfigRemoved + ' non-config crews from current week');
    } catch (e) {
      Logger.log('autoComplianceCleanup: Non-config removal error (non-fatal): ' + e.toString());
    }

    Logger.log('autoComplianceCleanup: Complete');

  } catch (e) {
    Logger.log('autoComplianceCleanup error: ' + e.toString());
  }

  return results;
}

/**
 * Fix log entries for specific weeks only (lighter than fixing all weeks)
 * @param {Array<Date>} weeks - Array of week start dates to fix
 * @returns {Object} - Count of fixes applied
 */
function fixLogEntriesForWeeks(weeks) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var tz = Session.getScriptTimeZone();
  var result = { jhaFixed: 0, weeklyFixed: 0, monthlyFixed: 0 };

  // Build week bounds for filtering
  var weekBoundsList = weeks.map(function(w) {
    var bounds = getWeekBoundaries(w);
    return {
      start: bounds.weekStart,
      end: bounds.weekEnd,
      startStr: Utilities.formatDate(bounds.weekStart, tz, 'yyyy-MM-dd')
    };
  });

  // Fix JHA Log
  var jhaSheet = ss.getSheetByName('JHA Log');
  if (jhaSheet && jhaSheet.getLastRow() >= 2) {
    var jhaData = jhaSheet.getDataRange().getValues();
    var creditedToCol = 9; // Column J (0-indexed)

    for (var i = 1; i < jhaData.length; i++) {
      var dateReceived = jhaData[i][0];
      if (!dateReceived) continue;

      var receivedDate = new Date(dateReceived);

      // Check if this row is in one of our target weeks
      var inTargetWeek = weekBoundsList.some(function(wb) {
        return receivedDate >= wb.start && receivedDate <= wb.end;
      });

      if (!inTargetWeek) continue;

      // Check if needs fixing
      var currentCreditedTo = String(jhaData[i][creditedToCol] || '').trim();
      var jobNumber = String(jhaData[i][2] || '').trim();

      if (!jobNumber) continue;

      // Look up correct crew assignment
      var resolution = resolveJobToTrackedCrew(jobNumber);
      var expectedCreditedTo = resolution.creditedTo || jobNumber.split('.')[0];

      if (currentCreditedTo !== expectedCreditedTo && currentCreditedTo !== 'Unknown') {
        jhaSheet.getRange(i + 1, creditedToCol + 1).setValue(expectedCreditedTo);
        result.jhaFixed++;
      }
    }
  }

  // Fix Weekly Safety Log (similar logic)
  var weeklySheet = ss.getSheetByName('Weekly Safety Log');
  if (weeklySheet && weeklySheet.getLastRow() >= 2) {
    var weeklyData = weeklySheet.getDataRange().getValues();
    var creditedToCol = 7; // Column H (0-indexed)

    for (var i = 1; i < weeklyData.length; i++) {
      var dateReceived = weeklyData[i][0];
      if (!dateReceived) continue;

      var receivedDate = new Date(dateReceived);

      var inTargetWeek = weekBoundsList.some(function(wb) {
        return receivedDate >= wb.start && receivedDate <= wb.end;
      });

      if (!inTargetWeek) continue;

      var currentCreditedTo = String(weeklyData[i][creditedToCol] || '').trim();
      var currentStatus = String(weeklyData[i][6] || '').trim();
      var jobNumber = String(weeklyData[i][2] || '').trim();

      if (!jobNumber) continue;

      var resolution = resolveJobToTrackedCrew(jobNumber);
      var expectedCreditedTo = resolution.creditedTo || jobNumber.split('.')[0];

      if (expectedCreditedTo && (currentCreditedTo !== expectedCreditedTo || currentStatus !== 'Credited')) {
        weeklySheet.getRange(i + 1, creditedToCol + 1).setValue(expectedCreditedTo);
        if (resolution.resolved) {
          weeklySheet.getRange(i + 1, 7).setValue('Credited'); // Column G - Status
          var foremanToSet = resolution.foreman;
          if (!foremanToSet || foremanToSet === 'UNKNOWN') {
            var fLookup = lookupForemanByJobNumber(expectedCreditedTo);
            if (fLookup && fLookup.name) foremanToSet = fLookup.name;
          }
          if (foremanToSet && foremanToSet !== 'UNKNOWN') {
            weeklySheet.getRange(i + 1, 4).setValue(foremanToSet); // Column D - Foreman
          }
        }
        result.weeklyFixed++;
      }
    }
  }

  return result;
}

/**
 * Resolve a job number to a tracked crew (used by auto-cleanup)
 * @param {string} jobNumber - Job number to resolve
 * @returns {Object} - Resolution result
 */
function resolveJobToTrackedCrew(jobNumber) {
  if (!jobNumber) return { creditedTo: '', resolved: false };

  var baseJob = String(jobNumber).split('.')[0].trim();

  // Exclude placeholder/invalid jobs (starting with 000 or 002)
  if (baseJob.indexOf('000-') === 0 || baseJob.indexOf('002-') === 0) {
    return { creditedTo: '', resolved: false };
  }

  // Return cached result if available
  if (_resolveJobCache[baseJob]) {
    return _resolveJobCache[baseJob];
  }

  var config = loadComplianceConfig();

  // If it's directly in config, use it
  if (config[baseJob]) {
    var result = { creditedTo: baseJob, resolved: true, source: 'config' };
    _resolveJobCache[baseJob] = result;
    return result;
  }

  // Check custom mappings
  var customMappings = getCustomJobForemanMappings() || {};
  if (customMappings[baseJob]) {
    // Custom mapping points to a foreman - find their primary crew
    var foremanName = customMappings[baseJob];
    for (var configJob in config) {
      if (config[configJob].foreman === foremanName) {
        var result = { creditedTo: configJob, resolved: true, source: 'custom_mapping' };
        _resolveJobCache[baseJob] = result;
        return result;
      }
    }
  }

  // Check Job Tracking sheet directly (uses cached data)
  var jtData = getCachedJobTrackingData();
  if (jtData && jtData.length > 1) {
    var jtHeaders = jtData[0].map(function(h) { return String(h).toLowerCase().trim(); });
    var jtJobCol = jtHeaders.indexOf('job number');
    var jtForemanCol = jtHeaders.indexOf('foreman');
    var jtStatusCol = jtHeaders.indexOf('status');

    if (jtJobCol >= 0) {
      for (var j = 1; j < jtData.length; j++) {
        var jtJobNum = String(jtData[j][jtJobCol] || '').split('.')[0];
        if (jtJobNum === baseJob) {
          var jtForeman = jtForemanCol >= 0 ? String(jtData[j][jtForemanCol] || '').trim() : '';
          var jtStatus = jtStatusCol >= 0 ? String(jtData[j][jtStatusCol] || '').trim() : '';
          Logger.log('resolveJobToTrackedCrew: Found ' + baseJob + ' in Job Tracking (status: ' + jtStatus + ', foreman: ' + jtForeman + ')');
          var result = { creditedTo: baseJob, resolved: true, source: 'job_tracking', foreman: jtForeman, status: jtStatus };
          _resolveJobCache[baseJob] = result;
          return result;
        }
      }
    }
  }

  // Try to find via Employees sheet (uses cached data)
  var empData = getCachedEmployeesData();
  if (empData && empData.length > 1) {
    var headers = empData[0].map(function(h) { return String(h).toLowerCase().trim(); });
    var nameCol = headers.indexOf('name');
    var jobCol = headers.indexOf('job number');
    var secondaryJobCol = headers.indexOf('secondary job number');

    // Find employee with this job (primary or secondary)
    for (var i = 1; i < empData.length; i++) {
      var empJob = String(empData[i][jobCol] || '').split('.')[0];
      var empSecondary = secondaryJobCol !== -1 ? String(empData[i][secondaryJobCol] || '').split('.')[0] : '';
      var empName = String(empData[i][nameCol] || '').trim();

      // Check if baseJob matches either primary or secondary job
      var matchesPrimary = (empJob === baseJob);
      var matchesSecondary = (empSecondary === baseJob);

      if (matchesPrimary || matchesSecondary) {
        // Found employee! Use their PRIMARY job for crediting (if it's in config)
        var primaryJob = empJob;

        if (config[primaryJob]) {
          var source = matchesSecondary ? 'secondary_to_primary' : 'primary';
          Logger.log('resolveJobToTrackedCrew: ' + baseJob + ' → ' + primaryJob + ' via ' + empName + ' (' + source + ')');
          var result = { creditedTo: primaryJob, resolved: true, source: source, employee: empName };
          _resolveJobCache[baseJob] = result;
          return result;
        }
      }
    }
  }

  // Couldn't resolve - return the base job
  Logger.log('resolveJobToTrackedCrew: Could not resolve ' + baseJob + ' to a tracked crew');
  var result = { creditedTo: baseJob, resolved: false };
  _resolveJobCache[baseJob] = result;
  return result;
}

/**
 * Menu function to fix log entries and recalculate compliance
 * LEGACY - kept for backward compatibility, consider using masterRecalculateCompliance instead
 */
function menuFixAndRecalculateCompliance() {
  var ui = SpreadsheetApp.getUi();

  var response = ui.alert(
    '🔧 Fix Log Entries & Recalculate',
    'This will:\n\n' +
    '1. Fix all log entries with incorrect "Credited To" values\n' +
    '2. Recalculate compliance for all weeks\n' +
    '3. Refresh tooltips\n\n' +
    'This may take a minute. Continue?',
    ui.ButtonSet.YES_NO
  );

  if (response !== ui.Button.YES) return;

  try {
    // Step 1: Fix log entries
    ui.alert('Step 1', 'Fixing log entries...', ui.ButtonSet.OK);
    var fixResult = fixAllLogEntryCreditedTo();

    // Step 2: Recalculate compliance
    recalculateAllComplianceFromLogs();

    var msg = '\u2705 Complete!\n\n' +
              'Log entries fixed:\n' +
              '\u2022 JHA Log: ' + fixResult.jhaFixed + '\n' +
              '\u2022 Weekly Safety Log: ' + fixResult.weeklyFixed + '\n' +
              '\u2022 Monthly Checklist Log: ' + fixResult.monthlyFixed + '\n\n' +
              'Compliance has been recalculated and tooltips refreshed.';

    ui.alert('Fix Complete', msg, ui.ButtonSet.OK);

  } catch (e) {
    Logger.log('menuFixAndRecalculateCompliance error: ' + e.toString());
    ui.alert('Error', 'Failed: ' + e.toString(), ui.ButtonSet.OK);
  }
}

/**
 * ONE-TIME FIX: Remove non-Config crews from specific past weeks
 * This fixes Ben Lapka's issue where 006-26 and 053-25 created separate rows
 * instead of crediting to his primary crew 052-25
 *
 * Run from: Glove Manager → Safety → 🔧 Fix Ben Lapka Weeks
 */
function fixBenLapkaWeeks() {
  var ui = SpreadsheetApp.getUi();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var tz = Session.getScriptTimeZone();

  var response = ui.alert(
    '🔧 Fix Ben Lapka Weeks',
    'This will:\n\n' +
    '1. Remove rows for 006-26 and 053-25 from weeks 02/15/2026 and 02/22/2026\n' +
    '2. Ensure their JHAs are credited to 052-25 (Ben\'s primary crew)\n' +
    '3. Recalculate compliance for those weeks\n\n' +
    'This is a ONE-TIME fix. Continue?',
    ui.ButtonSet.YES_NO
  );

  if (response !== ui.Button.YES) return;

  try {
    var sheet = ss.getSheetByName('Safety Compliance');
    if (!sheet) {
      ui.alert('Error', 'Safety Compliance sheet not found', ui.ButtonSet.OK);
      return;
    }

    // Weeks to fix
    var weeksToFix = ['02/15/2026', '02/22/2026'];
    // Non-config crews to remove (Ben's alternate job numbers)
    var crewsToRemove = ['006-26', '053-25'];

    var data = sheet.getDataRange().getValues();
    var rowsToDelete = [];

    // Find rows to delete (scan bottom to top for safe deletion)
    for (var i = data.length - 1; i >= 1; i--) {
      var rowWeek = data[i][0];
      var rowJob = String(data[i][1] || '').trim();

      if (!rowWeek) continue;

      var rowWeekStr = Utilities.formatDate(new Date(rowWeek), tz, 'MM/dd/yyyy');

      // Check if this row is in a week we want to fix AND has a crew we want to remove
      if (weeksToFix.indexOf(rowWeekStr) !== -1 && crewsToRemove.indexOf(rowJob) !== -1) {
        rowsToDelete.push(i + 1); // 1-indexed row number
        Logger.log('fixBenLapkaWeeks: Will delete row ' + (i + 1) + ' - Week: ' + rowWeekStr + ', Job: ' + rowJob);
      }
    }

    if (rowsToDelete.length === 0) {
      ui.alert('No Changes Needed', 'No rows found for 006-26 or 053-25 in weeks 02/15/2026 or 02/22/2026.', ui.ButtonSet.OK);
      return;
    }

    // Delete rows (already sorted from bottom to top)
    for (var r = 0; r < rowsToDelete.length; r++) {
      sheet.deleteRow(rowsToDelete[r]);
    }

    Logger.log('fixBenLapkaWeeks: Deleted ' + rowsToDelete.length + ' rows');

    // Now fix the JHA Log entries to ensure they credit 052-25
    var jhaSheet = getJHALogSheet();
    var weeklySheet = getWeeklySafetyLogSheet();
    var jhaFixed = 0;
    var weeklyFixed = 0;

    // Fix JHA Log
    if (jhaSheet && jhaSheet.getLastRow() > 1) {
      var jhaData = jhaSheet.getDataRange().getValues();
      for (var j = 1; j < jhaData.length; j++) {
        var jobNumber = String(jhaData[j][2] || '').split('.')[0].trim();
        var foreman = String(jhaData[j][3] || '').trim();
        var creditedTo = String(jhaData[j][8] || '').trim();

        // If this is a Ben Lapka entry with wrong creditedTo
        if ((jobNumber === '006-26' || jobNumber === '053-25') &&
            foreman.toLowerCase().indexOf('lapka') !== -1 &&
            creditedTo !== '052-25') {
          jhaSheet.getRange(j + 1, 9).setValue('052-25'); // Column I - Credited To
          jhaFixed++;
        }
      }
    }

    // Fix Weekly Safety Log
    if (weeklySheet && weeklySheet.getLastRow() > 1) {
      var weeklyData = weeklySheet.getDataRange().getValues();
      for (var w = 1; w < weeklyData.length; w++) {
        var jobNumber = String(weeklyData[w][2] || '').split('.')[0].trim();
        var foreman = String(weeklyData[w][3] || '').trim();
        var creditedTo = String(weeklyData[w][7] || '').trim();

        // If this is a Ben Lapka entry with wrong creditedTo
        if ((jobNumber === '006-26' || jobNumber === '053-25') &&
            foreman.toLowerCase().indexOf('lapka') !== -1 &&
            creditedTo !== '052-25') {
          weeklySheet.getRange(w + 1, 8).setValue('052-25'); // Column H - Credited To
          weeklyFixed++;
        }
      }
    }

    // Recalculate compliance for the fixed weeks
    var week1 = new Date(2026, 1, 15); // Feb 15, 2026
    var week2 = new Date(2026, 1, 22); // Feb 22, 2026

    var data1 = calculateComplianceFromLogs(week1);
    if (data1) updateComplianceSheetFromLogs(data1);

    var data2 = calculateComplianceFromLogs(week2);
    if (data2) updateComplianceSheetFromLogs(data2);

    // Format the sheet
    formatComplianceSheetByWeek();

    var msg = '\u2705 Fix Complete!\n\n' +
              'Rows deleted: ' + rowsToDelete.length + '\n' +
              'JHA Log entries fixed: ' + jhaFixed + '\n' +
              'Weekly Safety Log entries fixed: ' + weeklyFixed + '\n\n' +
              'Weeks 02/15/2026 and 02/22/2026 have been recalculated.\n' +
              'Ben Lapka\'s JHAs now credit to 052-25.';

    ui.alert('Fix Complete', msg, ui.ButtonSet.OK);

  } catch (e) {
    Logger.log('fixBenLapkaWeeks error: ' + e.toString());
    ui.alert('Error', 'Failed: ' + e.toString(), ui.ButtonSet.OK);
  }
}

/**
 * Removes non-Config crews from the CURRENT WEEK ONLY in Safety Compliance sheet
 * Past weeks are preserved to maintain historical data
 *
 * Run from: Glove Manager → Safety → 🧹 Remove Non-Config Crews
 */
function removeNonConfigCrewsFromCompliance() {
  var ui = SpreadsheetApp.getUi();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var tz = Session.getScriptTimeZone();

  // Get current week boundaries
  var today = new Date();
  var currentWeekBounds = getWeekBoundaries(today);
  var currentWeekStr = Utilities.formatDate(currentWeekBounds.weekStart, tz, 'MM/dd/yyyy');

  // Load Config crews
  var config = loadComplianceConfig();
  var configCrews = {};
  for (var crew in config) {
    configCrews[crew] = true;
  }

  var configCount = Object.keys(configCrews).length;

  var response = ui.alert(
    '🧹 Remove Non-Config Crews (Current Week Only)',
    'This will remove rows from the CURRENT WEEK (' + currentWeekStr + ') that have job numbers NOT in Job Tracking (active crews).\n\n' +
    'Config has ' + configCount + ' tracked crews.\n\n' +
    'IMPORTANT: Past weeks will NOT be affected - historical data is preserved.\n\n' +
    'Continue?',
    ui.ButtonSet.YES_NO
  );

  if (response !== ui.Button.YES) return;

  try {
    var sheet = ss.getSheetByName('Safety Compliance');
    if (!sheet || sheet.getLastRow() < 2) {
      ui.alert('Error', 'Safety Compliance sheet not found or empty', ui.ButtonSet.OK);
      return;
    }

    var data = sheet.getDataRange().getValues();
    var rowsToDelete = [];
    var crewsRemoved = {};

    var currentWeekKey = Utilities.formatDate(currentWeekBounds.weekStart, tz, 'yyyy-MM-dd');

    // Find rows to delete (scan bottom to top for safe deletion)
    for (var i = data.length - 1; i >= 1; i--) {
      var rowWeek = data[i][0]; // Column A - Week Start
      var rowJob = String(data[i][1] || '').trim(); // Column B - Job Number

      if (!rowWeek || !rowJob) continue;

      var rowWeekDate = (rowWeek instanceof Date) ? rowWeek : new Date(rowWeek);
      var rowWeekKey = Utilities.formatDate(rowWeekDate, tz, 'yyyy-MM-dd');

      // ONLY process current week
      if (rowWeekKey !== currentWeekKey) continue;

      // Check if this crew is NOT in Config
      if (!configCrews[rowJob]) {
        rowsToDelete.push(i + 1); // 1-indexed row number
        crewsRemoved[rowJob] = (crewsRemoved[rowJob] || 0) + 1;
      }
    }

    if (rowsToDelete.length === 0) {
      ui.alert('No Changes Needed', 'Current week (' + currentWeekStr + ') has no non-config crews to remove.', ui.ButtonSet.OK);
      return;
    }

    // Delete rows (already sorted from bottom to top)
    for (var r = 0; r < rowsToDelete.length; r++) {
      sheet.deleteRow(rowsToDelete[r]);
    }

    // Format the sheet
    formatComplianceSheetByWeek();

    // Build summary of removed crews
    var crewSummary = [];
    for (var crew in crewsRemoved) {
      crewSummary.push(crew);
    }

    var msg = '\u2705 Cleanup Complete!\n\n' +
              'Week: ' + currentWeekStr + '\n' +
              'Rows removed: ' + rowsToDelete.length + '\n\n' +
              'Non-config crews removed:\n' + crewSummary.join(', ') + '\n\n' +
              'Past weeks were NOT affected.';

    ui.alert('Cleanup Complete', msg, ui.ButtonSet.OK);
    Logger.log('removeNonConfigCrewsFromCompliance: Removed ' + rowsToDelete.length + ' rows for current week. Crews: ' + crewSummary.join(', '));

  } catch (e) {
    Logger.log('removeNonConfigCrewsFromCompliance error: ' + e.toString());
    ui.alert('Error', 'Failed: ' + e.toString(), ui.ButtonSet.OK);
  }
}

/**
 * Removes compliance rows for jobs that hadn't started yet during those weeks.
 * Checks Job Tracking "Start Date" column and removes rows where the week is
 * BEFORE the job's start date.
 *
 * Run from: Glove Manager → Safety → 🧹 Remove Pre-Start Job Rows
 */
function removePreStartJobRowsFromCompliance() {
  var ui = SpreadsheetApp.getUi();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var tz = Session.getScriptTimeZone();

  // Get Job Tracking start dates
  var startDates = getJobTrackingStartDates();
  var jobsWithStartDates = Object.keys(startDates);

  if (jobsWithStartDates.length === 0) {
    ui.alert('No Start Dates Found', 'No jobs found in Job Tracking with start dates.\n\nThis cleanup requires jobs to have Start Date values in the Job Tracking sheet.', ui.ButtonSet.OK);
    return;
  }

  // Build summary for confirmation dialog
  var jobSummary = [];
  for (var j = 0; j < Math.min(jobsWithStartDates.length, 10); j++) {
    var job = jobsWithStartDates[j];
    jobSummary.push(job + ': ' + Utilities.formatDate(startDates[job], tz, 'MM/dd/yyyy'));
  }
  if (jobsWithStartDates.length > 10) {
    jobSummary.push('... and ' + (jobsWithStartDates.length - 10) + ' more');
  }

  var response = ui.alert(
    '🧹 Remove Pre-Start Job Rows',
    'This will remove rows from the Safety Compliance sheet where the week is BEFORE the job\'s start date in Job Tracking.\n\n' +
    'Jobs with start dates:\n' + jobSummary.join('\n') + '\n\n' +
    'Example: Job 018-26 with start date 03/16/2026 will be removed from weeks before 03/16/2026.\n\n' +
    'Continue?',
    ui.ButtonSet.YES_NO
  );

  if (response !== ui.Button.YES) return;

  try {
    var sheet = ss.getSheetByName('Safety Compliance');
    if (!sheet || sheet.getLastRow() < 2) {
      ui.alert('Error', 'Safety Compliance sheet not found or empty', ui.ButtonSet.OK);
      return;
    }

    var data = sheet.getDataRange().getValues();
    var rowsToDelete = [];
    var removedDetails = {}; // { jobNumber: { weekStr: true, ... } }

    // Scan from bottom to top for safe deletion
    for (var i = data.length - 1; i >= 1; i--) {
      var rowWeek = data[i][0]; // Column A - Week Start
      var rowJob = String(data[i][1] || '').trim(); // Column B - Job Number

      if (!rowWeek || !rowJob) continue;

      // Check if this job has a start date in Job Tracking
      var jobStartDate = startDates[rowJob];
      if (!jobStartDate) continue; // No start date - keep the row

      var rowWeekDate = (rowWeek instanceof Date) ? rowWeek : new Date(rowWeek);
      if (isNaN(rowWeekDate.getTime())) continue;

      // Get the week END date (Saturday)
      var weekEndDate = new Date(rowWeekDate);
      weekEndDate.setDate(weekEndDate.getDate() + 6);
      weekEndDate.setHours(23, 59, 59, 999);

      // If the job's start date is AFTER this week's end date, remove the row
      if (jobStartDate > weekEndDate) {
        rowsToDelete.push(i + 1); // 1-indexed row number

        // Track for summary
        if (!removedDetails[rowJob]) removedDetails[rowJob] = [];
        removedDetails[rowJob].push(Utilities.formatDate(rowWeekDate, tz, 'MM/dd/yyyy'));
      }
    }

    if (rowsToDelete.length === 0) {
      ui.alert('No Changes Needed', 'No compliance rows found for jobs that hadn\'t started yet.', ui.ButtonSet.OK);
      return;
    }

    // Delete rows (already sorted from bottom to top)
    for (var r = 0; r < rowsToDelete.length; r++) {
      sheet.deleteRow(rowsToDelete[r]);
    }

    // Format the sheet
    formatComplianceSheetByWeek();

    // Build summary
    var summaryLines = [];
    for (var job in removedDetails) {
      var weeks = removedDetails[job];
      summaryLines.push('\u2022 ' + job + ' (start: ' + Utilities.formatDate(startDates[job], tz, 'MM/dd/yyyy') + '): removed ' + weeks.length + ' week(s)');
      if (weeks.length <= 3) {
        summaryLines.push('  Weeks: ' + weeks.join(', '));
      }
    }

    var msg = '\u2705 Cleanup Complete!\n\n' +
              'Rows removed: ' + rowsToDelete.length + '\n\n' +
              summaryLines.join('\n');

    ui.alert('Cleanup Complete', msg, ui.ButtonSet.OK);
    Logger.log('removePreStartJobRowsFromCompliance: Removed ' + rowsToDelete.length + ' rows. Details: ' + JSON.stringify(removedDetails));

  } catch (e) {
    Logger.log('removePreStartJobRowsFromCompliance error: ' + e.toString());
    ui.alert('Error', 'Failed: ' + e.toString(), ui.ButtonSet.OK);
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
function clearAllSafetyEmailData(keepCustomMappings) {
  var props = PropertiesService.getScriptProperties();

  // Clear all safety email related properties
  if (!keepCustomMappings) {
    props.deleteProperty('CUSTOM_JOB_FOREMAN_MAPPINGS');
  }
  props.deleteProperty('TEMP_JOB_FOREMAN_MAPPINGS');
  props.deleteProperty('SKIPPED_UNKNOWN_JOBS');
  props.deleteProperty('PENDING_UNKNOWN_JOBS');
  props.deleteProperty('LAST_SAFETY_EMAIL_DATE');
  props.deleteProperty('LAST_SAFETY_EMAIL_TIMESTAMP');  // Fixed: was PROCESSED_TIME

  Logger.log('clearAllSafetyEmailData: Cleared all safety email processing data' + (keepCustomMappings ? ' (preserved custom mappings)' : ''));

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
    '\uD83D\uDDD1\uFE0F Clear All Safety Email Data',
    'This will clear ALL saved data for Process Safety Emails:\\n\\n' +
    '\u2022 Custom job→foreman mappings\\n' +
    '\u2022 Temporary session mappings\\n' +
    '\u2022 Skipped job numbers\\n' +
    '\u2022 Last processed date\\n\\n' +
    'This gives you a completely fresh start.\\n\\n' +
    'Are you sure?',
    ui.ButtonSet.YES_NO
  );

  if (response === ui.Button.YES) {
    clearAllSafetyEmailData();
    ui.alert('\u2705 All safety email data cleared!\\n\\nYou can now run Process Safety Emails with a fresh start.');
  }
}

/**
 * Reprocess all safety emails from scratch
 * This clears ALL saved data first, then processes emails for the specified number of days
 *
 * @param {number|string} daysBack - Number of days to search back or a YYYY-MM-DD start date
 * @param {string} [endDate] - Optional YYYY-MM-DD end date for range processing
 * @returns {Object} Result
 */
function reprocessAllSafetyEmails(daysBack, endDate) {
  daysBack = daysBack || 90;

  Logger.log('=== reprocessAllSafetyEmails START ===');
  Logger.log('Days back (Start Date): ' + daysBack);
  if (endDate) Logger.log('End Date: ' + endDate);

  // Step 1: Clear existing log/compliance rows in range first so they can be reprocessed
  Logger.log('Step 1: Clearing existing log/compliance rows in range...');
  clearSafetyLogsInRange(daysBack, endDate);

  // Step 2: Clear temporary/session data only — preserve LAST_SAFETY_EMAIL_DATE
  //         so data outside the range isn't orphaned
  Logger.log('Step 2: Clearing session-only safety email properties (preserving last processed date)...');
  var props = PropertiesService.getScriptProperties();
  props.deleteProperty('TEMP_JOB_FOREMAN_MAPPINGS');
  props.deleteProperty('SKIPPED_UNKNOWN_JOBS');
  props.deleteProperty('PENDING_UNKNOWN_JOBS');

  // Step 3: Also clear batch position data
  props.deleteProperty('SAFETY_BATCH_START');
  props.deleteProperty('SAFETY_BATCH_DATE_FILTER');
  props.deleteProperty('PENDING_BATCH_START');

  // Clear batch caches for clean start
  try {
    CacheService.getScriptCache().removeAll(['SAFETY_BATCH_CREWS', 'SAFETY_BATCH_EMP_DATA', 'SAFETY_BATCH_EMAIL_IDS']);
  } catch(e) { /* ignore */ }

  Logger.log('Step 3: Ready to process starting from ' + daysBack + (endDate ? ' to ' + endDate : '') + '...');

  // Step 4: Return details to dialog
  return {
    success: true,
    dataCleared: true,
    message: 'All data and log sheets in range cleared. Ready to process from ' + daysBack + (endDate ? ' to ' + endDate : '') + '.',
    daysBack: daysBack,
    endDate: endDate
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
    var complianceSheet = ss.getSheetByName('Safety Compliance');
    var tz = Session.getScriptTimeZone();

    // Determine which log sheet to search based on report type
    var logSheet = null;
    var logSheetName = '';
    var logJobCol = 3; // Column C in both log sheets (1-based)
    var logCreditedToCol = -1;
    var logNotesCol = -1;
    var logDateCol = -1;

    if (data.reportType === 'JHA' || (data.reportType && data.reportType.indexOf('Job Hazard') !== -1)) {
      logSheet = ss.getSheetByName(JHA_LOG_SHEET_NAME);
      logSheetName = JHA_LOG_SHEET_NAME;
      logDateCol = 2;       // Column B = Date Created
      logCreditedToCol = 9; // Column I = Credited To
      logNotesCol = 10;     // Column J = Notes
    } else if (data.reportType === 'Safety Meeting' || (data.reportType && data.reportType.indexOf('Safety Meeting') !== -1)) {
      logSheet = ss.getSheetByName(WEEKLY_SAFETY_LOG_SHEET_NAME);
      logSheetName = WEEKLY_SAFETY_LOG_SHEET_NAME;
      logDateCol = 2;       // Column B = Week Of
      logCreditedToCol = 8; // Column H = Credited To
      logNotesCol = 9;      // Column I = Notes
    }

    var foundRows = [];

    // Search the log sheet for matching entries
    if (logSheet && logSheet.getLastRow() > 1) {
      var logData = logSheet.getDataRange().getValues();

      for (var i = 1; i < logData.length; i++) {
        var rowJobNumber = String(logData[i][logJobCol - 1] || '').trim();
        var baseJob = rowJobNumber.split('.')[0];
        if (baseJob !== data.originalJobNumber) continue;

        // Match report date (if specified)
        if (data.reportDate) {
          var rowDate = logData[i][logDateCol - 1];
          if (rowDate) {
            var rowDateStr = Utilities.formatDate(new Date(rowDate), tz, 'MM/dd/yyyy');
            if (rowDateStr !== data.reportDate) continue;
          }
        }

        foundRows.push({
          rowIndex: i + 1,
          reportDate: logData[i][logDateCol - 1]
        });
      }

      // Update matching rows in log sheet
      for (var r = 0; r < foundRows.length; r++) {
        var row = foundRows[r];
        logSheet.getRange(row.rowIndex, logCreditedToCol).setValue(data.targetCrew);
        // Update status to Credited
        var statusCol = (logSheetName === JHA_LOG_SHEET_NAME) ? 8 : 7;
        logSheet.getRange(row.rowIndex, statusCol).setValue('Credited');
        // Add transfer note
        var currentNotes = String(logSheet.getRange(row.rowIndex, logNotesCol).getValue() || '');
        var transferNote = 'Credited from ' + data.originalJobNumber + ' on ' + Utilities.formatDate(new Date(), tz, 'MM/dd/yyyy');
        var newNotes = currentNotes ? currentNotes + '; ' + transferNote : transferNote;
        logSheet.getRange(row.rowIndex, logNotesCol).setValue(newNotes);
        Logger.log('creditUncreditedReport: Updated ' + logSheetName + ' row ' + row.rowIndex + ' → ' + data.targetCrew);
      }
    }

    // Also check Safety Equipment Needs sheet for equipment-related reports
    if (foundRows.length === 0) {
      var equipSheet = getSafetyEquipmentSheet();
      if (equipSheet && equipSheet.getLastRow() > 1) {
        var equipData = equipSheet.getDataRange().getValues();
        for (var ei = 1; ei < equipData.length; ei++) {
          var eDate = equipData[ei][0];
          var eJob = String(equipData[ei][2] || '').trim();
          if (!eDate || !eJob) continue;
          var eBase = eJob.split('.')[0];
          if (eBase !== data.originalJobNumber) continue;
          if (data.reportDate) {
            var eDateStr = Utilities.formatDate(new Date(eDate), tz, 'MM/dd/yyyy');
            if (eDateStr !== data.reportDate) continue;
          }
          foundRows.push({ rowIndex: ei + 1, reportDate: eDate });
        }
        for (var er = 0; er < foundRows.length; er++) {
          var eRow = foundRows[er];
          equipSheet.getRange(eRow.rowIndex, 3).setValue(data.targetCrew);
          if (data.targetForeman) equipSheet.getRange(eRow.rowIndex, 4).setValue(data.targetForeman);
          var eNotes = String(equipSheet.getRange(eRow.rowIndex, 11).getValue() || '');
          var eTransfer = 'Credited from ' + data.originalJobNumber + ' on ' + Utilities.formatDate(new Date(), tz, 'MM/dd/yyyy');
          equipSheet.getRange(eRow.rowIndex, 11).setValue(eNotes ? eNotes + '; ' + eTransfer : eTransfer);
        }
      }
    }

    if (foundRows.length === 0) {
      Logger.log('creditUncreditedReport: No matching log entry found - proceeding with compliance update only');
    }

    // Update Safety Compliance sheet if specified
    // Skip compliance update when logEntryOnly=true (day already has a ✅, user just needs the log corrected)
    if (complianceSheet && data.targetDay && data.reportDate && !data.logEntryOnly) {
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

      // Calculate week start for the compliance date
      var complianceDateStr = data.targetDate || data.reportDate;
      Logger.log('creditUncreditedReport: Using complianceDateStr=' + complianceDateStr + ' (targetDate=' + data.targetDate + ', reportDate=' + data.reportDate + ')');
      var reportDateObj = new Date(complianceDateStr);
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
            var checkMark = '\u2705';
            if (data.receivedDate) {
              var receivedDateObj = new Date(data.receivedDate);
              var receivedWeekStart = new Date(receivedDateObj);
              receivedWeekStart.setDate(receivedWeekStart.getDate() - receivedDateObj.getDay());
              receivedWeekStart.setHours(0, 0, 0, 0);

              if (receivedWeekStart.getTime() !== weekStart.getTime()) {
                // Received in a different week - mark as LATE
                checkMark = '\u2705L';
                Logger.log('creditUncreditedReport: Report is LATE - report week: ' + weekStart.toDateString() + ', received week: ' + receivedWeekStart.toDateString());
              }
            }

            complianceSheet.getRange(ci + 1, colToUpdate + 1).setValue(checkMark);
            // Re-apply dropdown (setValue strips data validation)
            var creditDayRule = SpreadsheetApp.newDataValidation()
              .requireValueInList(['\u2705', '\u2705L', '\u274C', '\u274CW', 'N/A', '\u23F3', ''], true)
              .setAllowInvalid(true)
              .build();
            complianceSheet.getRange(ci + 1, colToUpdate + 1).setDataValidation(creditDayRule);
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
      message: 'Credited ' + data.originalJobNumber + ' to ' + data.targetCrew + (foundRows.length > 0 ? ' (' + foundRows.length + ' log entries updated)' : ' (compliance updated)'),
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
      return { success: false, error: 'Safety Compliance sheet not found', weeks: [] };
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

    // Parse base week start date (Sunday)
    var baseDate = new Date(weekStartDate);
    baseDate.setHours(0, 0, 0, 0);

    // Calculate week starts for 3 weeks: target week, 1 week ago, 2 weeks ago
    var weekStarts = [];
    for (var w = 0; w < 3; w++) {
      var wStart = new Date(baseDate.getTime());
      wStart.setDate(wStart.getDate() - (w * 7));
      weekStarts.push(wStart);
    }

    var matchingRows = [null, null, null]; // [target week, 1 week ago, 2 weeks ago]

    // Find matching rows in compliance sheet
    for (var i = 1; i < compData.length; i++) {
      var row = compData[i];
      var rowWeekStart = row[colIdx.weekStart];
      var rowJobNumber = String(row[colIdx.jobNumber] || '').trim();

      if (!rowWeekStart) continue;

      var rowWeekDate = new Date(rowWeekStart);
      rowWeekDate.setHours(0, 0, 0, 0);

      if (rowJobNumber === crewJobNumber) {
        for (var w = 0; w < weekStarts.length; w++) {
          if (rowWeekDate.getTime() === weekStarts[w].getTime()) {
            matchingRows[w] = row;
            break;
          }
        }
      }
    }

    var result = {
      success: true,
      crewJobNumber: crewJobNumber,
      weekStart: weekStartDate,
      weeks: []
    };

    for (var w = 0; w < weekStarts.length; w++) {
      var wStart = weekStarts[w];
      var row = matchingRows[w];
      var wStartStr = Utilities.formatDate(wStart, Session.getScriptTimeZone(), 'MM/dd/yyyy');

      var weekInfo = {
        weekStart: wStartStr,
        missingDays: [],
        creditedDays: [],
        weeklyMeetingMissing: false,
        weeklyMeetingCredited: false
      };

      if (row) {
        for (var d = 0; d < dayColumns.length; d++) {
          var dc = dayColumns[d];
          var cellValue = String(row[dc.col] || '').trim();
          if (cellValue === 'N/A' || cellValue === '') continue;

          var dayDate = new Date(wStart.getTime());
          dayDate.setDate(dayDate.getDate() + dc.dayNum);
          var dayDateStr = Utilities.formatDate(dayDate, Session.getScriptTimeZone(), 'MM/dd/yyyy');

          if (cellValue === '\u274C' || cellValue === '\u23F3' || cellValue.indexOf('\u274C') !== -1) {
            weekInfo.missingDays.push({
              dayName: dc.dayName,
              dayNum: dc.dayNum,
              date: dayDateStr,
              currentStatus: cellValue
            });
          } else if (cellValue === '\u2705' || cellValue.indexOf('\u2705') !== -1) {
            weekInfo.creditedDays.push({
              dayName: dc.dayName,
              dayNum: dc.dayNum,
              date: dayDateStr,
              currentStatus: cellValue
            });
          }
        }

        if (weeklyMeetingCol >= 0) {
          var wmValue = String(row[weeklyMeetingCol] || '').trim();
          if (wmValue === '\u274C' || wmValue === '\u23F3' || wmValue.indexOf('\u274C') !== -1) {
            weekInfo.weeklyMeetingMissing = true;
          } else if (wmValue === '\u2705' || wmValue.indexOf('\u2705') !== -1) {
            weekInfo.weeklyMeetingCredited = true;
          }
        }
      }

      result.weeks.push(weekInfo);
    }

    return result;

  } catch (e) {
    Logger.log('getMissingDaysForCrew error: ' + e.toString());
    return { success: false, error: e.toString(), weeks: [] };
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
    var crews = {};

    // 1. Get crews from Safety Compliance Config (authoritative source)
    var configSheet = ss.getSheetByName('Safety Compliance Config');
    if (configSheet && configSheet.getLastRow() > 1) {
      var configData = configSheet.getDataRange().getValues();
      for (var i = 1; i < configData.length; i++) {
        var jobNumber = String(configData[i][0] || '').trim(); // Column A: Job Number
        var foreman = String(configData[i][1] || '').trim();   // Column B: Foreman

        if (jobNumber && !crews[jobNumber]) {
          crews[jobNumber] = {
            jobNumber: jobNumber,
            foreman: foreman,
            source: 'config'
          };
        }
      }
    }

    // 2. Include ALL crews from Job Tracking (Active, Pending Start, AND Completed)
    // This allows users to credit JHAs to recently completed crews
    var jobTrackingSheet = ss.getSheetByName('Job Tracking');
    if (jobTrackingSheet && jobTrackingSheet.getLastRow() > 1) {
      var jtData = jobTrackingSheet.getDataRange().getValues();
      var jtHeaders = jtData[0].map(function(h) { return String(h).toLowerCase().trim(); });
      var jtJobCol = jtHeaders.indexOf('job number');
      var jtForemanCol = jtHeaders.indexOf('foreman');
      var jtStatusCol = jtHeaders.indexOf('status');

      if (jtJobCol >= 0) {
        for (var j = 1; j < jtData.length; j++) {
          var jtJobNum = String(jtData[j][jtJobCol] || '').trim();
          var jtForeman = jtForemanCol >= 0 ? String(jtData[j][jtForemanCol] || '').trim() : '';
          var jtStatus = jtStatusCol >= 0 ? String(jtData[j][jtStatusCol] || '').trim() : '';

          if (jtJobNum && !crews[jtJobNum]) {
            crews[jtJobNum] = {
              jobNumber: jtJobNum,
              foreman: jtForeman,
              status: jtStatus,
              source: 'job_tracking'
            };
          }
        }
      }
    }

    // 3. Fallback: Also get from Safety Compliance sheet for historical crews
    var complianceSheet = ss.getSheetByName('Safety Compliance');
    if (complianceSheet) {
      var compData = complianceSheet.getDataRange().getValues();
      var jobNumberCol = 1; // Column B
      var foremanCol = 2;   // Column C

      for (var k = 1; k < compData.length; k++) {
        var jobNumber = String(compData[k][jobNumberCol] || '').trim();
        var foreman = String(compData[k][foremanCol] || '').trim();

        if (jobNumber && !crews[jobNumber]) {
          crews[jobNumber] = {
            jobNumber: jobNumber,
            foreman: foreman,
            source: 'compliance_sheet'
          };
        }
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

    Logger.log('getTrackedCrewsForAssignment: Found ' + crewList.length + ' crews');
    return { success: true, crews: crewList };

  } catch (e) {
    Logger.log('getTrackedCrewsForAssignment error: ' + e.toString());
    return { success: false, error: e.toString(), crews: [] };
  }
}

/**
 * Quick diagnostic - run from Script Editor and check Logs
 * Shows exactly what's in the JHA Log and why entries aren't being credited
 */
function quickDiagnoseJHALog() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var tz = Session.getScriptTimeZone();

  // Get tracked crews
  var trackedCrews = getActiveCrews();
  Logger.log('=== TRACKED CREWS ===');
  Logger.log('Count: ' + trackedCrews.length);
  Logger.log('Crews: ' + trackedCrews.join(', '));

  // Get JHA Log
  var jhaSheet = ss.getSheetByName('JHA Log');
  if (!jhaSheet) {
    Logger.log('ERROR: JHA Log sheet not found!');
    return;
  }

  var jhaData = jhaSheet.getDataRange().getValues();
  Logger.log('\n=== JHA LOG ===');
  Logger.log('Total rows: ' + (jhaData.length - 1));

  // Show first 20 data rows
  Logger.log('\nFirst 20 rows:');
  for (var i = 1; i < Math.min(21, jhaData.length); i++) {
    var dateCreated = jhaData[i][1];
    var status = String(jhaData[i][7] || '').trim();
    var creditedTo = String(jhaData[i][8] || '').trim();

    var dateStr = dateCreated ? Utilities.formatDate(new Date(dateCreated), tz, 'MM/dd/yyyy') : 'NO DATE';
    var isTracked = trackedCrews.indexOf(creditedTo) !== -1;
    var icon = (status === 'Credited' && isTracked) ? '\u2705' : '\u274C';

    Logger.log('Row ' + (i + 1) + ': ' + icon + ' | Date: ' + dateStr + ' | Status: ' + status + ' | CreditedTo: "' + creditedTo + '" | IsTracked: ' + isTracked);
  }

  // Count by status
  var statusCounts = {};
  var creditedToCounts = {};
  var notTrackedCrews = {};

  for (var j = 1; j < jhaData.length; j++) {
    var status = String(jhaData[j][7] || '').trim() || 'EMPTY';
    var creditedTo = String(jhaData[j][8] || '').trim() || 'EMPTY';

    statusCounts[status] = (statusCounts[status] || 0) + 1;
    creditedToCounts[creditedTo] = (creditedToCounts[creditedTo] || 0) + 1;

    if (status === 'Credited' && creditedTo !== 'EMPTY' && trackedCrews.indexOf(creditedTo) === -1) {
      notTrackedCrews[creditedTo] = (notTrackedCrews[creditedTo] || 0) + 1;
    }
  }

  Logger.log('\n=== STATUS COUNTS ===');
  for (var s in statusCounts) {
    Logger.log(s + ': ' + statusCounts[s]);
  }

  Logger.log('\n=== CREDITED TO COUNTS (top 20) ===');
  var ctArray = [];
  for (var ct in creditedToCounts) {
    ctArray.push({ crew: ct, count: creditedToCounts[ct] });
  }
  ctArray.sort(function(a, b) { return b.count - a.count; });
  for (var k = 0; k < Math.min(20, ctArray.length); k++) {
    var isTracked = trackedCrews.indexOf(ctArray[k].crew) !== -1;
    Logger.log(ctArray[k].crew + ': ' + ctArray[k].count + (isTracked ? ' \u2705' : ' \u274C NOT TRACKED'));
  }

  Logger.log('\n=== CREDITED BUT NOT TRACKED CREWS ===');
  for (var nt in notTrackedCrews) {
    Logger.log(nt + ': ' + notTrackedCrews[nt] + ' entries');
  }

  Logger.log('\n=== DIAGNOSIS COMPLETE ===');
}

/**
 * Trace compliance calculation for a specific week - shows EXACTLY what's happening
 */
/**
 * Diagnoses why Gmail emails are being skipped in Process Safety Emails.
 * Cross-references Gmail search results against all log sheets to show
 * which sheet has each email ID, the date range of each sheet, and a
 * breakdown of why emails are being marked as "alreadyLogged".
 * Run from: Glove Manager → 🛡️ Process Safety Emails → 🔍 Debug → Diagnose Email Log Overlap
 */
function diagnoseEmailLogOverlap() {
  var ui = SpreadsheetApp.getUi();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var tz = Session.getScriptTimeZone();
  var report = [];

  // ── 1. Load existing IDs from all log sheets ──────────────────────────────
  var sources = {
    jha:     { sheet: ss.getSheetByName('JHA Log'),               col: 6, ids: {}, rowCount: 0, minDate: null, maxDate: null },
    weekly:  { sheet: ss.getSheetByName('Weekly Safety Log'),     col: 6, ids: {}, rowCount: 0, minDate: null, maxDate: null },
    monthly: { sheet: ss.getSheetByName('Monthly Checklist Log'), col: 7, ids: {}, rowCount: 0, minDate: null, maxDate: null },
    equip:   { sheet: ss.getSheetByName('Safety Equipment Needs'),col: 10, ids: {}, rowCount: 0, minDate: null, maxDate: null }
  };

  for (var key in sources) {
    var src = sources[key];
    if (!src.sheet || src.sheet.getLastRow() < 2) {
      report.push(key.toUpperCase() + ' LOG: NOT FOUND or empty');
      continue;
    }
    src.rowCount = src.sheet.getLastRow() - 1;
    var idVals = src.sheet.getRange(2, src.col, src.rowCount, 1).getValues();
    var dateVals = src.sheet.getRange(2, 1, src.rowCount, 1).getValues();
    for (var r = 0; r < idVals.length; r++) {
      var id = String(idVals[r][0] || '').trim();
      if (id) {
        src.ids[id] = true;
        src.ids[id.split('_')[0]] = true; // base ID too
      }
      var d = dateVals[r][0];
      if (d instanceof Date && !isNaN(d.getTime())) {
        if (!src.minDate || d < src.minDate) src.minDate = d;
        if (!src.maxDate || d > src.maxDate) src.maxDate = d;
      }
    }
    report.push(key.toUpperCase() + ' LOG: ' + src.rowCount + ' rows | ' +
      (src.minDate ? Utilities.formatDate(src.minDate, tz, 'MM/dd/yyyy') : '?') + ' → ' +
      (src.maxDate ? Utilities.formatDate(src.maxDate, tz, 'MM/dd/yyyy') : '?'));
  }

  // ── 2. Run the same Gmail search ─────────────────────────────────────────
  var queries = [
    'subject:"Job Hazard Report" newer_than:14d',
    'subject:"Safety Meeting Report" newer_than:14d',
    'subject:"Safety Checklist Report" newer_than:14d',
    'subject:"Safety Check List Report" newer_than:14d'
  ];
  var allThreads = [];
  queries.forEach(function(q) {
    try { allThreads = allThreads.concat(GmailApp.search(q)); } catch(e) {}
  });

  // ── 3. For each thread/message, determine which source has the ID ────────
  var notFound = 0, foundInJHA = 0, foundInWeekly = 0, foundInMonthly = 0, foundInEquip = 0, foundInMultiple = 0;
  var samples = { notFound: [], jha: [], weekly: [], monthly: [], equip: [] };
  var MAX_SAMPLE = 5;

  allThreads.forEach(function(thread) {
    var messages = thread.getMessages();
    messages.forEach(function(msg) {
      var msgId = msg.getId();
      var inJHA     = !!sources.jha.ids[msgId];
      var inWeekly  = !!sources.weekly.ids[msgId];
      var inMonthly = !!sources.monthly.ids[msgId];
      var inEquip   = !!sources.equip.ids[msgId];
      var foundCount = (inJHA ? 1 : 0) + (inWeekly ? 1 : 0) + (inMonthly ? 1 : 0) + (inEquip ? 1 : 0);

      if (foundCount === 0) {
        notFound++;
        if (samples.notFound.length < MAX_SAMPLE) {
          samples.notFound.push(msgId + ' | ' + Utilities.formatDate(msg.getDate(), tz, 'MM/dd/yyyy') + ' | ' + msg.getSubject().substring(0, 60));
        }
      } else {
        if (foundCount > 1) foundInMultiple++;
        if (inJHA)     { foundInJHA++;     if (samples.jha.length < MAX_SAMPLE) samples.jha.push(msgId + ' | ' + Utilities.formatDate(msg.getDate(), tz, 'MM/dd/yyyy')); }
        if (inWeekly)  { foundInWeekly++;  if (samples.weekly.length < MAX_SAMPLE) samples.weekly.push(msgId + ' | ' + Utilities.formatDate(msg.getDate(), tz, 'MM/dd/yyyy')); }
        if (inMonthly) { foundInMonthly++; if (samples.monthly.length < MAX_SAMPLE) samples.monthly.push(msgId + ' | ' + Utilities.formatDate(msg.getDate(), tz, 'MM/dd/yyyy')); }
        if (inEquip)   { foundInEquip++;   if (samples.equip.length < MAX_SAMPLE) samples.equip.push(msgId + ' | ' + Utilities.formatDate(msg.getDate(), tz, 'MM/dd/yyyy')); }
      }
    });
  });

  report.push('');
  report.push('=== GMAIL vs LOG SHEET OVERLAP (last 14 days) ===');
  report.push('Total Gmail threads: ' + allThreads.length);
  report.push('Messages NOT in any log (would be processed): ' + notFound);
  report.push('Messages in JHA Log only / any: ' + foundInJHA);
  report.push('Messages in Weekly Safety Log only / any: ' + foundInWeekly);
  report.push('Messages in Monthly Checklist Log only / any: ' + foundInMonthly);
  report.push('Messages in Safety Equipment Needs only / any: ' + foundInEquip);
  report.push('Messages found in MULTIPLE sources: ' + foundInMultiple);

  if (samples.notFound.length) {
    report.push('');
    report.push('Sample NOT-FOUND (new) messages:');
    samples.notFound.forEach(function(s) { report.push('  ' + s); });
  }
  if (samples.equip.length) {
    report.push('');
    report.push('Sample messages found only in Equipment Needs (NOT in log sheets):');
    samples.equip.forEach(function(s) { report.push('  ' + s); });
  }

  var fullReport = report.join('\n');
  Logger.log(fullReport);
  ui.alert('Email Log Overlap Diagnostic', fullReport, ui.ButtonSet.OK);
}

function traceComplianceForWeek() {
  var ui = SpreadsheetApp.getUi();
  var response = ui.prompt('Enter week start (MM/DD/YYYY):', ui.ButtonSet.OK_CANCEL);
  if (response.getSelectedButton() !== ui.Button.OK) return;

  var weekStartStr = response.getResponseText().trim();
  var weekStartDate = new Date(weekStartStr);

  if (isNaN(weekStartDate.getTime())) {
    ui.alert('Invalid date');
    return;
  }

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var tz = Session.getScriptTimeZone();
  var weekBounds = getWeekBoundaries(weekStartDate);

  Logger.log('=== TRACE COMPLIANCE FOR WEEK ===');
  Logger.log('Input: ' + weekStartStr);
  Logger.log('Week Start: ' + Utilities.formatDate(weekBounds.weekStart, tz, 'MM/dd/yyyy EEE'));
  Logger.log('Week End: ' + Utilities.formatDate(weekBounds.weekEnd, tz, 'MM/dd/yyyy EEE'));

  var today = new Date();
  var isPastDeadline = today > weekBounds.weekEnd;
  Logger.log('Today: ' + Utilities.formatDate(today, tz, 'MM/dd/yyyy EEE'));
  Logger.log('isPastDeadline: ' + isPastDeadline);

  // Get tracked crews
  var trackedCrews = getActiveCrews();
  Logger.log('\nTracked crews: ' + trackedCrews.join(', '));

  // Read JHA Log and count credits per crew per day
  var jhaSheet = ss.getSheetByName('JHA Log');
  var jhaData = jhaSheet.getDataRange().getValues();

  var crewCredits = {}; // crewJob -> [false, false, false, false, false, false, false] (Sun-Sat)
  for (var c = 0; c < trackedCrews.length; c++) {
    crewCredits[trackedCrews[c]] = [false, false, false, false, false, false, false];
  }

  var matchedCount = 0;
  var dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  Logger.log('\n=== JHA ENTRIES WITHIN WEEK ===');
  for (var i = 1; i < jhaData.length; i++) {
    var dateCreated = jhaData[i][1];
    var status = String(jhaData[i][7] || '').trim();
    var creditedTo = String(jhaData[i][8] || '').trim();

    if (!dateCreated) continue;

    var jhaDate = new Date(dateCreated);

    // Check if within week bounds
    if (jhaDate < weekBounds.weekStart || jhaDate > weekBounds.weekEnd) continue;

    matchedCount++;
    var dayOfWeek = jhaDate.getDay();
    var dayName = dayNames[dayOfWeek];
    var dateStr = Utilities.formatDate(jhaDate, tz, 'MM/dd/yyyy');

    Logger.log('Row ' + (i + 1) + ': ' + dateStr + ' (' + dayName + ') | Status: ' + status + ' | CreditedTo: ' + creditedTo);

    if (status === 'Credited' && crewCredits[creditedTo]) {
      crewCredits[creditedTo][dayOfWeek] = true;
      Logger.log('  → Credited to ' + creditedTo + ' for ' + dayName);
    }
  }

  Logger.log('\nTotal JHA entries in week: ' + matchedCount);

  // Show final credit status per crew
  Logger.log('\n=== FINAL CREDIT STATUS PER CREW ===');
  for (var crew in crewCredits) {
    var credits = crewCredits[crew];
    var line = crew + ': ';
    for (var d = 0; d < 7; d++) {
      var status = credits[d] ? '\u2705' : (isPastDeadline ? '\u274C' : '\u23F3');
      line += dayNames[d] + ':' + status + ' ';
    }
    Logger.log(line);
  }

  ui.alert('Trace complete! Check Apps Script logs (Ctrl+Enter or View > Logs)');
}

/**
 * Force update a single week's compliance from logs
 * This bypasses any caching and directly recalculates and writes to sheet
 */
function forceUpdateSingleWeek() {
  var ui = SpreadsheetApp.getUi();
  var response = ui.prompt('Force Update Week', 'Enter week start (MM/DD/YYYY):', ui.ButtonSet.OK_CANCEL);
  if (response.getSelectedButton() !== ui.Button.OK) return;

  var weekStartStr = response.getResponseText().trim();
  var weekStartDate = new Date(weekStartStr);

  if (isNaN(weekStartDate.getTime())) {
    ui.alert('Invalid date');
    return;
  }

  var tz = Session.getScriptTimeZone();

  Logger.log('=== FORCE UPDATE SINGLE WEEK ===');
  Logger.log('Input: ' + weekStartStr);
  Logger.log('Parsed: ' + weekStartDate);

  // Step 1: Calculate compliance
  Logger.log('\n--- Step 1: calculateComplianceFromLogs ---');
  var complianceData = calculateComplianceFromLogs(weekStartDate);

  if (!complianceData) {
    Logger.log('ERROR: calculateComplianceFromLogs returned null!');
    ui.alert('Error', 'Calculation returned no data', ui.ButtonSet.OK);
    return;
  }

  Logger.log('Compliance data received:');
  Logger.log('  weekStart: ' + complianceData.weekStart);
  Logger.log('  totalCrews: ' + complianceData.totalCrews);
  Logger.log('  compliantCount: ' + complianceData.compliantCount);
  Logger.log('  missingCount: ' + complianceData.missingCount);

  // Log each crew's calculated data
  Logger.log('\nCrew day statuses:');
  for (var crewJob in complianceData.crews) {
    var crew = complianceData.crews[crewJob];
    var dayStr = 'Sun:' + (crew.days['Sun'] || '?') +
                 ' Mon:' + (crew.days['Mon'] || '?') +
                 ' Tue:' + (crew.days['Tue'] || '?') +
                 ' Wed:' + (crew.days['Wed'] || '?') +
                 ' Thu:' + (crew.days['Thu'] || '?') +
                 ' Fri:' + (crew.days['Fri'] || '?') +
                 ' Sat:' + (crew.days['Sat'] || '?');
    Logger.log('  ' + crewJob + ': ' + dayStr + ' | Status: ' + crew.status);
  }

  // Step 2: Write to sheet
  Logger.log('\n--- Step 2: updateComplianceSheetFromLogs ---');
  updateComplianceSheetFromLogs(complianceData);

  Logger.log('\n=== FORCE UPDATE COMPLETE ===');

  ui.alert('Force Update Complete',
    'Week ' + weekStartStr + ' has been recalculated and written to the Safety Compliance sheet.\n\n' +
    'Check the sheet to verify the data.\n\n' +
    'See Apps Script logs for detailed information.',
    ui.ButtonSet.OK);
}

/**
 * Gets historical crews that had JHAs during a specific week.
 * This handles foremen who are no longer active but were active during that week.
 *
 * @param {Object} weekBounds - Object with weekStart and weekEnd Date objects
 * @returns {Array} Array of {crew: string, foreman: string} objects
 */
function getHistoricalCrewsForWeek(weekBounds) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var jhaSheet = ss.getSheetByName('JHA Log');

  if (!jhaSheet || jhaSheet.getLastRow() < 2) {
    return [];
  }

  var jhaData = jhaSheet.getDataRange().getValues();
  var crewMap = {}; // crew -> foreman name

  // JHA Log columns: A=DateReceived, B=DateCreated, C=JobNumber, D=Foreman, E=Subject, F=EmailID, G=Source, H=Status, I=CreditedTo, J=Notes
  for (var i = 1; i < jhaData.length; i++) {
    var dateCreated = jhaData[i][1]; // Column B
    var originalJobNumber = String(jhaData[i][2] || '').trim(); // Column C (ORIGINAL job number from email)
    var foreman = String(jhaData[i][3] || '').trim(); // Column D
    var status = String(jhaData[i][7] || '').trim(); // Column H
    var creditedTo = String(jhaData[i][8] || '').trim(); // Column I

    if (!dateCreated) continue;

    var jhaDate = new Date(dateCreated);

    // Check if within week bounds
    if (jhaDate < weekBounds.weekStart || jhaDate > weekBounds.weekEnd) continue;

    // Track BOTH the original job number AND the credited to job (if different)
    // This ensures historical foremen appear even if their credits went elsewhere

    // Track original job number (the one the foreman actually submitted under)
    if (originalJobNumber && /^\d{3}-\d{2}$/.test(originalJobNumber) && !originalJobNumber.startsWith('000-')) {
      if (!crewMap[originalJobNumber]) {
        crewMap[originalJobNumber] = foreman || 'UNKNOWN';
      }
    }

    // Also track credited to job (if different and credited)
    if (status === 'Credited' && creditedTo && /^\d{3}-\d{2}$/.test(creditedTo) && !creditedTo.startsWith('000-')) {
      if (!crewMap[creditedTo]) {
        crewMap[creditedTo] = foreman || 'UNKNOWN';
      }
    }
  }

  // Also check Weekly Safety Log
  var weeklySheet = ss.getSheetByName('Weekly Safety Log');
  if (weeklySheet && weeklySheet.getLastRow() > 1) {
    var weeklyData = weeklySheet.getDataRange().getValues();

    // Weekly Safety Log columns: A=DateReceived, B=WeekOf, C=JobNumber, D=Foreman, E=Subject, F=EmailID, G=Status, H=CreditedTo, I=Notes
    for (var w = 1; w < weeklyData.length; w++) {
      var weekOf = weeklyData[w][1]; // Column B
      var originalJob = String(weeklyData[w][2] || '').trim(); // Column C
      var foreman = String(weeklyData[w][3] || '').trim(); // Column D
      var status = String(weeklyData[w][6] || '').trim(); // Column G
      var creditedTo = String(weeklyData[w][7] || '').trim(); // Column H

      if (!weekOf) continue;

      var meetingDate = new Date(weekOf);

      // Check if within week bounds
      if (meetingDate < weekBounds.weekStart || meetingDate > weekBounds.weekEnd) continue;

      // Track original job number
      if (originalJob && /^\d{3}-\d{2}$/.test(originalJob) && !originalJob.startsWith('000-')) {
        if (!crewMap[originalJob]) {
          crewMap[originalJob] = foreman || 'UNKNOWN';
        }
      }

      // Also track credited to job
      if (status === 'Credited' && creditedTo && /^\d{3}-\d{2}$/.test(creditedTo) && !creditedTo.startsWith('000-')) {
        if (!crewMap[creditedTo]) {
          crewMap[creditedTo] = foreman || 'UNKNOWN';
        }
      }
    }
  }

  // Convert to array
  var result = [];
  for (var crew in crewMap) {
    result.push({
      crew: crew,
      foreman: crewMap[crew]
    });
  }

  Logger.log("getHistoricalCrewsForWeek: Found " + result.length + " crews: " + result.map(function(c) { return c.crew; }).join(', '));

  return result;
}

/**
 * Diagnose why historical foremen might not be appearing on the compliance sheet.
 * Menu: Glove Manager → 🛡\uFE0F Safety → 🔁 Diagnose Historical Crews
 */
function diagnoseHistoricalCrews() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var jhaSheet = ss.getSheetByName('JHA Log');

  if (!jhaSheet || jhaSheet.getLastRow() < 2) {
    SpreadsheetApp.getUi().alert('No JHA Log found.');
    return;
  }

  var jhaData = jhaSheet.getDataRange().getValues();

  // Get current active crews for comparison
  var activeCrews = getActiveCrews();
  var activeCrewSet = {};
  for (var a = 0; a < activeCrews.length; a++) {
    activeCrewSet[activeCrews[a]] = true;
  }

  // Track all unique job numbers and their statuses
  var jobStats = {}; // jobNumber -> {credited: count, skipped: count, unknown: count, foremen: []}

  for (var i = 1; i < jhaData.length; i++) {
    var jobNumber = String(jhaData[i][2] || '').trim(); // Column C (original job number)
    var foreman = String(jhaData[i][3] || '').trim(); // Column D
    var status = String(jhaData[i][7] || '').trim(); // Column H
    var creditedTo = String(jhaData[i][8] || '').trim(); // Column I

    // Validate format
    if (!jobNumber.match(/^\d{3}-\d{2}$/)) continue;
    if (jobNumber.startsWith('000-')) continue;

    if (!jobStats[jobNumber]) {
      jobStats[jobNumber] = { credited: 0, skipped: 0, unknown: 0, foremen: [], creditedTo: {} };
    }

    if (status === 'Credited') {
      jobStats[jobNumber].credited++;
      if (creditedTo && !jobStats[jobNumber].creditedTo[creditedTo]) {
        jobStats[jobNumber].creditedTo[creditedTo] = true;
      }
    } else if (status === 'Skipped') {
      jobStats[jobNumber].skipped++;
    } else {
      jobStats[jobNumber].unknown++;
    }

    if (foreman && jobStats[jobNumber].foremen.indexOf(foreman) === -1) {
      jobStats[jobNumber].foremen.push(foreman);
    }
  }

  // Find historical jobs (not in active crews but have JHA entries)
  var historicalJobs = [];
  for (var job in jobStats) {
    var stats = jobStats[job];
    var isActive = activeCrewSet[job] || false;

    historicalJobs.push({
      job: job,
      isActive: isActive,
      credited: stats.credited,
      skipped: stats.skipped,
      unknown: stats.unknown,
      foremen: stats.foremen.join(', '),
      creditedTo: Object.keys(stats.creditedTo).join(', ')
    });
  }

  // Sort by job number
  historicalJobs.sort(function(a, b) { return a.job.localeCompare(b.job); });

  // Build report
  var html = '<html><head><style>';
  html += 'body { font-family: Arial, sans-serif; padding: 15px; }';
  html += 'table { border-collapse: collapse; width: 100%; font-size: 12px; }';
  html += 'th, td { border: 1px solid #ddd; padding: 6px; text-align: left; }';
  html += 'th { background: #4285f4; color: white; }';
  html += 'tr:nth-child(even) { background: #f9f9f9; }';
  html += '.active { background: #e6ffe6 !important; }';
  html += '.historical { background: #fff3e6 !important; }';
  html += '.problem { color: red; font-weight: bold; }';
  html += 'h2 { color: #333; }';
  html += '.legend { margin: 10px 0; padding: 10px; background: #f0f0f0; border-radius: 5px; }';
  html += '</style></head><body>';

  html += '<h2>Historical Crews Diagnostic Report</h2>';
  html += '<div class="legend">';
  html += '<strong>Legend:</strong> ';
  html += '<span style="background:#e6ffe6;padding:2px 6px;">Active Crew</span> ';
  html += '<span style="background:#fff3e6;padding:2px 6px;">Historical Crew</span> ';
  html += '<span class="problem">Problem (has entries but not showing)</span>';
  html += '</div>';

  html += '<p><strong>Total unique job numbers in JHA Log:</strong> ' + historicalJobs.length + '</p>';
  html += '<p><strong>Active crews:</strong> ' + activeCrews.length + '</p>';

  html += '<table>';
  html += '<tr><th>Job #</th><th>Active?</th><th>Credited</th><th>Skipped</th><th>Unknown</th><th>Foremen</th><th>Credited To</th><th>Issue?</th></tr>';

  for (var h = 0; h < historicalJobs.length; h++) {
    var row = historicalJobs[h];
    var rowClass = row.isActive ? 'active' : 'historical';
    var issue = '';

    // Identify issues
    if (!row.isActive && row.credited === 0 && (row.skipped > 0 || row.unknown > 0)) {
      issue = '<span class="problem">Historical crew with no credits - needs re-assignment</span>';
    } else if (row.creditedTo && row.creditedTo !== row.job && !row.isActive) {
      issue = '<span class="problem">Credits assigned to different crew (' + row.creditedTo + ')</span>';
    }

    html += '<tr class="' + rowClass + '">';
    html += '<td>' + row.job + '</td>';
    html += '<td>' + (row.isActive ? '\u2705 Yes' : '\u274C No') + '</td>';
    html += '<td>' + row.credited + '</td>';
    html += '<td>' + row.skipped + '</td>';
    html += '<td>' + row.unknown + '</td>';
    html += '<td>' + row.foremen + '</td>';
    html += '<td>' + (row.creditedTo || '-') + '</td>';
    html += '<td>' + issue + '</td>';
    html += '</tr>';
  }

  html += '</table>';
  html += '</body></html>';

  var htmlOutput = HtmlService.createHtmlOutput(html)
    .setWidth(900)
    .setHeight(600)
    .setTitle('Historical Crews Diagnostic');

  SpreadsheetApp.getUi().showModalDialog(htmlOutput, 'Historical Crews Diagnostic');
}

/**
 * Clear the last safety email processed date to force a full re-scan
 * Menu function with confirmation dialog
 */
function clearLastSafetyProcessedDate() {
  var ui = SpreadsheetApp.getUi();
  var props = PropertiesService.getScriptProperties();

  var lastDate = props.getProperty('LAST_SAFETY_EMAIL_DATE');
  var lastTimestamp = props.getProperty('LAST_SAFETY_EMAIL_TIMESTAMP');

  var message = 'This will clear the last processed date, forcing Process Safety Emails to re-scan all emails within the selected date range.\n\n';
  if (lastDate) {
    message += 'Current last processed date: ' + lastDate + '\n';
  }
  if (lastTimestamp) {
    message += 'Last timestamp: ' + lastTimestamp + '\n';
  }
  message += '\nContinue?';

  var response = ui.alert('🔄 Reset Last Processed Date', message, ui.ButtonSet.YES_NO);

  if (response === ui.Button.YES) {
    props.deleteProperty('LAST_SAFETY_EMAIL_DATE');
    props.deleteProperty('LAST_SAFETY_EMAIL_TIMESTAMP');

    ui.alert('\u2705 Last Processed Date Cleared',
      'The last processed date has been cleared.\n\n' +
      'When you run Process Safety Emails, it will search using the day range you select (7, 14, 30, etc. days).\n\n' +
      'Note: Already-logged emails will still be skipped to prevent duplicates.',
      ui.ButtonSet.OK);

    Logger.log('clearLastSafetyProcessedDate: Cleared last processed date');
  }
}

/**
 * Show current safety email processing status
 * Menu function to display diagnostic information
 */
function showSafetyProcessingStatus() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var props = PropertiesService.getScriptProperties();

  // Get last processed info
  var lastDate = props.getProperty('LAST_SAFETY_EMAIL_DATE') || 'Not set';
  var lastTimestamp = props.getProperty('LAST_SAFETY_EMAIL_TIMESTAMP') || 'Not set';

  // Count log entries
  var jhaLogCount = 0;
  var weeklyLogCount = 0;
  var monthlyLogCount = 0;

  try {
    var jhaLog = ss.getSheetByName('JHA Log');
    if (jhaLog && jhaLog.getLastRow() > 1) {
      jhaLogCount = jhaLog.getLastRow() - 1;
    }
  } catch(e) {}

  try {
    var weeklyLog = ss.getSheetByName('Weekly Safety Log');
    if (weeklyLog && weeklyLog.getLastRow() > 1) {
      weeklyLogCount = weeklyLog.getLastRow() - 1;
    }
  } catch(e) {}

  try {
    var monthlyLog = ss.getSheetByName('Monthly Checklist Log');
    if (monthlyLog && monthlyLog.getLastRow() > 1) {
      monthlyLogCount = monthlyLog.getLastRow() - 1;
    }
  } catch(e) {}

  // Count compliance rows
  var complianceCount = 0;
  try {
    var compliance = ss.getSheetByName('Safety Compliance');
    if (compliance && compliance.getLastRow() > 1) {
      complianceCount = compliance.getLastRow() - 1;
    }
  } catch(e) {}

  // Get tracked crews count
  var trackedCrewsCount = 0;
  try {
    var crews = getActiveCrews();
    trackedCrewsCount = crews ? crews.length : 0;
  } catch(e) {}

  // Get custom mappings count
  var customMappingsCount = 0;
  try {
    var mappings = getCustomJobForemanMappings();
    customMappingsCount = Object.keys(mappings).length;
  } catch(e) {}

  // Build status message
  var html = '<html><head><style>';
  html += 'body { font-family: Arial, sans-serif; padding: 20px; }';
  html += 'h2 { color: #1a73e8; margin-top: 0; }';
  html += '.section { margin-bottom: 20px; padding: 15px; background: #f8f9fa; border-radius: 8px; }';
  html += '.section h3 { margin-top: 0; color: #5f6368; font-size: 14px; }';
  html += '.stat { display: flex; justify-content: space-between; padding: 5px 0; border-bottom: 1px solid #e0e0e0; }';
  html += '.stat:last-child { border-bottom: none; }';
  html += '.label { color: #5f6368; }';
  html += '.value { font-weight: bold; color: #202124; }';
  html += '.warning { color: #ea8600; }';
  html += '.ok { color: #1e8e3e; }';
  html += '</style></head><body>';

  html += '<h2>📋 Safety Email Processing Status</h2>';

  html += '<div class="section">';
  html += '<h3>📅 Last Processing</h3>';
  html += '<div class="stat"><span class="label">Last Processed Date:</span><span class="value">' + lastDate + '</span></div>';
  html += '<div class="stat"><span class="label">Last Timestamp:</span><span class="value">' + lastTimestamp + '</span></div>';
  html += '</div>';

  html += '<div class="section">';
  html += '<h3>\uD83D\uDCCA Log Sheet Counts</h3>';
  html += '<div class="stat"><span class="label">JHA Log entries:</span><span class="value">' + jhaLogCount + '</span></div>';
  html += '<div class="stat"><span class="label">Weekly Safety Log entries:</span><span class="value">' + weeklyLogCount + '</span></div>';
  html += '<div class="stat"><span class="label">Monthly Checklist Log entries:</span><span class="value">' + monthlyLogCount + '</span></div>';
  html += '</div>';

  html += '<div class="section">';
  html += '<h3>📈 Compliance Data</h3>';
  html += '<div class="stat"><span class="label">Safety Compliance rows:</span><span class="value">' + complianceCount + '</span></div>';
  html += '<div class="stat"><span class="label">Tracked crews:</span><span class="value">' + trackedCrewsCount + '</span></div>';
  html += '<div class="stat"><span class="label">Custom job mappings:</span><span class="value">' + customMappingsCount + '</span></div>';
  html += '</div>';

  html += '<div class="section">';
  html += '<h3>💡 Tips</h3>';
  html += '<p style="margin: 5px 0; font-size: 13px;">\u2022 Use "Reset Last Processed Date" to force a full re-scan</p>';
  html += '<p style="margin: 5px 0; font-size: 13px;">\u2022 Already-logged emails are skipped (no duplicates)</p>';
  html += '<p style="margin: 5px 0; font-size: 13px;">\u2022 Use "Recalculate ALL Weeks" to rebuild compliance from logs</p>';
  html += '</div>';

  html += '</body></html>';

  var htmlOutput = HtmlService.createHtmlOutput(html)
    .setWidth(450)
    .setHeight(500)
    .setTitle('Safety Processing Status');

  SpreadsheetApp.getUi().showModalDialog(htmlOutput, 'Safety Processing Status');
}

/**
 * Diagnostic function to test Gmail search and see what's found vs what's already logged
 * Menu function to help troubleshoot email processing issues
 */
function diagnoseGmailSearch() {
  var ui = SpreadsheetApp.getUi();
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  var html = '<html><head><style>';
  html += 'body { font-family: Arial, sans-serif; padding: 15px; font-size: 13px; }';
  html += 'h2 { color: #1a73e8; margin-top: 0; }';
  html += 'h3 { color: #5f6368; margin-top: 15px; }';
  html += '.section { margin-bottom: 15px; padding: 10px; background: #f8f9fa; border-radius: 6px; }';
  html += '.success { color: #1e8e3e; }';
  html += '.warning { color: #ea8600; }';
  html += '.error { color: #d93025; }';
  html += 'table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 12px; }';
  html += 'th, td { padding: 6px; border: 1px solid #ddd; text-align: left; }';
  html += 'th { background: #e8eaed; }';
  html += '.new { background: #e6f4ea; }';
  html += '.logged { background: #fce8e6; }';
  html += '</style></head><body>';

  html += '<h2>🔁 Gmail Search Diagnostic</h2>';

  // Test each query
  var queries = [
    { name: 'Job Hazard Report', query: 'subject:"Job Hazard Report" newer_than:14d' },
    { name: 'Safety Meeting Report', query: 'subject:"Safety Meeting Report" newer_than:14d' },
    { name: 'Weekly Safety Repairs', query: 'subject:"Weekly Safety Repairs" newer_than:14d' },
    { name: 'Safety Checklist Report', query: 'subject:"Safety Checklist Report" newer_than:14d' },
    { name: 'Safety Check List Report', query: 'subject:"Safety Check List Report" newer_than:14d' }
  ];

  // Load existing email IDs from log sheets
  var existingEmailIds = {};

  // JHA Log
  var jhaLogSheet = ss.getSheetByName('JHA Log');
  if (jhaLogSheet && jhaLogSheet.getLastRow() > 1) {
    var jhaData = jhaLogSheet.getRange(2, 6, jhaLogSheet.getLastRow() - 1, 1).getValues();
    for (var i = 0; i < jhaData.length; i++) {
      if (jhaData[i][0]) existingEmailIds[jhaData[i][0]] = 'JHA Log';
    }
  }

  // Weekly Safety Log
  var weeklyLogSheet = ss.getSheetByName('Weekly Safety Log');
  if (weeklyLogSheet && weeklyLogSheet.getLastRow() > 1) {
    var weeklyData = weeklyLogSheet.getRange(2, 6, weeklyLogSheet.getLastRow() - 1, 1).getValues();
    for (var j = 0; j < weeklyData.length; j++) {
      if (weeklyData[j][0]) existingEmailIds[weeklyData[j][0]] = 'Weekly Log';
    }
  }

  // Monthly Checklist Log
  var monthlyLogSheet = ss.getSheetByName('Monthly Checklist Log');
  if (monthlyLogSheet && monthlyLogSheet.getLastRow() > 1) {
    var monthlyData = monthlyLogSheet.getRange(2, 7, monthlyLogSheet.getLastRow() - 1, 1).getValues();
    for (var k = 0; k < monthlyData.length; k++) {
      if (monthlyData[k][0]) existingEmailIds[monthlyData[k][0]] = 'Monthly Log';
    }
  }

  html += '<div class="section">';
  html += '<strong>Existing logged email IDs:</strong> ' + Object.keys(existingEmailIds).length;
  html += '</div>';

  var totalNew = 0;
  var totalLogged = 0;

  for (var q = 0; q < queries.length; q++) {
    var queryInfo = queries[q];
    html += '<h3>' + queryInfo.name + '</h3>';
    html += '<div class="section">';
    html += '<strong>Query:</strong> <code>' + queryInfo.query + '</code><br><br>';

    try {
      var threads = GmailApp.search(queryInfo.query);
      html += '<strong>Threads found:</strong> ' + threads.length + '<br>';

      if (threads.length > 0) {
        html += '<table><tr><th>Date</th><th>Subject</th><th>Status</th></tr>';

        var maxShow = Math.min(threads.length, 10);
        for (var t = 0; t < maxShow; t++) {
          var thread = threads[t];
          var messages = thread.getMessages();
          var firstMsg = messages[0];
          var msgId = firstMsg.getId();
          var msgDate = Utilities.formatDate(firstMsg.getDate(), Session.getScriptTimeZone(), 'MM/dd/yyyy HH:mm');
          var subject = firstMsg.getSubject();
          if (subject.length > 60) subject = subject.substring(0, 60) + '...';

          var isLogged = existingEmailIds[msgId];
          var statusClass = isLogged ? 'logged' : 'new';
          var statusText = isLogged ? '\u26A0\uFE0F Already in ' + isLogged : '\u2705 NEW';

          if (isLogged) {
            totalLogged++;
          } else {
            totalNew++;
          }

          html += '<tr class="' + statusClass + '">';
          html += '<td>' + msgDate + '</td>';
          html += '<td>' + subject + '</td>';
          html += '<td>' + statusText + '</td>';
          html += '</tr>';
        }

        if (threads.length > 10) {
          html += '<tr><td colspan="3">... and ' + (threads.length - 10) + ' more</td></tr>';
        }

        html += '</table>';
      }
    } catch (e) {
      html += '<span class="error">Error: ' + e.toString() + '</span>';
    }

    html += '</div>';
  }

  html += '<div class="section">';
  html += '<h3>Summary</h3>';
  html += '<strong class="success">NEW emails (not logged):</strong> ' + totalNew + '<br>';
  html += '<strong class="warning">Already logged:</strong> ' + totalLogged + '<br>';
  if (totalNew === 0 && totalLogged > 0) {
    html += '<br><span class="warning">\u26A0\uFE0F All found emails are already in the log sheets. This is why "No NEW emails found" appears.</span>';
  }
  html += '</div>';

  html += '</body></html>';

  var htmlOutput = HtmlService.createHtmlOutput(html)
    .setWidth(700)
    .setHeight(600)
    .setTitle('Gmail Search Diagnostic');

  ui.showModalDialog(htmlOutput, 'Gmail Search Diagnostic');
}

// ============================================================================
// UTILITY FUNCTIONS FOR ENSURING WEEKS EXIST (Added Mar 3, 2026)
// ============================================================================

/**
 * Ensures current and previous week exist in Safety Compliance sheet
 * by calculating compliance from log data
 * Menu: Glove Manager → 🛡\uFE0F Safety → \uD83D\uDDBC\uFE0F Ensure Current Week Exists
 */
function ensureCurrentWeekInCompliance() {
  var today = new Date();
  var currentWeekBounds = getWeekBoundaries(today);

  // Calculate previous week
  var prevWeekStart = new Date(currentWeekBounds.weekStart);
  prevWeekStart.setDate(prevWeekStart.getDate() - 7);
  var prevWeekBounds = getWeekBoundaries(prevWeekStart);

  Logger.log('ensureCurrentWeekInCompliance: Previous week=' + prevWeekBounds.weekStart.toDateString() + ', Current week=' + currentWeekBounds.weekStart.toDateString());

  var results = {
    previousWeek: { weekStart: prevWeekBounds.weekStart, updated: false, crewCount: 0 },
    currentWeek: { weekStart: currentWeekBounds.weekStart, updated: false, crewCount: 0 }
  };

  // Calculate compliance for previous week (can create tasks if past deadline)
  try {
    var prevCompliance = calculateComplianceFromLogs(prevWeekBounds.weekStart);
    if (prevCompliance && prevCompliance.crews && Object.keys(prevCompliance.crews).length > 0) {
      updateComplianceSheetFromLogs(prevCompliance);
      results.previousWeek.updated = true;
      results.previousWeek.crewCount = Object.keys(prevCompliance.crews).length;
      Logger.log('ensureCurrentWeekInCompliance: Updated previous week with ' + results.previousWeek.crewCount + ' crews');
    }
  } catch (e) {
    Logger.log('ensureCurrentWeekInCompliance: Error calculating previous week: ' + e.message);
  }

  // Calculate compliance for current week
  try {
    var currCompliance = calculateComplianceFromLogs(currentWeekBounds.weekStart);
    if (currCompliance && currCompliance.crews && Object.keys(currCompliance.crews).length > 0) {
      updateComplianceSheetFromLogs(currCompliance);
      results.currentWeek.updated = true;
      results.currentWeek.crewCount = Object.keys(currCompliance.crews).length;
      Logger.log('ensureCurrentWeekInCompliance: Updated current week with ' + results.currentWeek.crewCount + ' crews');
    }
  } catch (e) {
    Logger.log('ensureCurrentWeekInCompliance: Error calculating current week: ' + e.message);
  }

  // Format the sheet
  try {
    formatComplianceSheetByWeek();
  } catch (e) {
    Logger.log('ensureCurrentWeekInCompliance: Error formatting sheet: ' + e.message);
  }

  // Show result
  var tz = Session.getScriptTimeZone();
  var prevDateStr = Utilities.formatDate(prevWeekBounds.weekStart, tz, 'MM/dd/yyyy');
  var currDateStr = Utilities.formatDate(currentWeekBounds.weekStart, tz, 'MM/dd/yyyy');

  var message = '📅 Ensure Current Week Results\n\n';
  message += '📆 Previous Week (' + prevDateStr + '):\n';
  message += results.previousWeek.updated ? '\u2705 Updated with ' + results.previousWeek.crewCount + ' crews\n' : '\u26A0\uFE0F No data or already exists\n';
  message += '\n📆 Current Week (' + currDateStr + '):\n';
  message += results.currentWeek.updated ? '\u2705 Updated with ' + results.currentWeek.crewCount + ' crews\n' : '\u26A0\uFE0F No data or already exists\n';
  message += '\n\u2705 Safety Compliance sheet has been formatted.';

  SpreadsheetApp.getUi().alert('Ensure Current Week', message, SpreadsheetApp.getUi().ButtonSet.OK);

  return results;
}

/**
 * Quick diagnostic showing Gmail emails vs already logged
 * Useful for debugging why emails aren't being found
 * Menu: Glove Manager → 🛡\uFE0F Safety → 🔎 Quick Gmail Check
 */
function quickGmailCheck() {
  var ui = SpreadsheetApp.getUi();
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  // Build a set of existing email IDs from all log sheets
  var existingIds = {};

  // Check JHA Log
  var jhaLog = ss.getSheetByName('JHA Log');
  if (jhaLog && jhaLog.getLastRow() > 1) {
    var jhaData = jhaLog.getRange(2, 6, jhaLog.getLastRow() - 1, 1).getValues(); // Column F = Email ID
    jhaData.forEach(function(row) {
      if (row[0]) existingIds[row[0]] = 'JHA Log';
    });
  }

  // Check Weekly Safety Log
  var weeklyLog = ss.getSheetByName('Weekly Safety Log');
  if (weeklyLog && weeklyLog.getLastRow() > 1) {
    var weeklyData = weeklyLog.getRange(2, 6, weeklyLog.getLastRow() - 1, 1).getValues(); // Column F = Email ID
    weeklyData.forEach(function(row) {
      if (row[0]) existingIds[row[0]] = 'Weekly Safety Log';
    });
  }

  // Check Monthly Checklist Log
  var monthlyLog = ss.getSheetByName('Monthly Checklist Log');
  if (monthlyLog && monthlyLog.getLastRow() > 1) {
    var monthlyData = monthlyLog.getRange(2, 6, monthlyLog.getLastRow() - 1, 1).getValues(); // Column F = Email ID
    monthlyData.forEach(function(row) {
      if (row[0]) existingIds[row[0]] = 'Monthly Checklist Log';
    });
  }

  var html = '<html><head><style>';
  html += 'body { font-family: Arial, sans-serif; padding: 15px; }';
  html += 'h3 { color: #1a73e8; margin-bottom: 10px; }';
  html += 'h4 { color: #5f6368; margin: 20px 0 10px 0; }';
  html += '.query { background: #f1f3f4; padding: 8px 12px; border-radius: 4px; font-family: monospace; margin: 10px 0; }';
  html += '.error { color: #d93025; font-size: 12px; margin: 10px 0; }';
  html += '.success { color: #1e8e3e; }';
  html += '.warning { color: #ea8600; }';
  html += 'table { border-collapse: collapse; width: 100%; margin: 10px 0; }';
  html += 'th, td { border: 1px solid #ddd; padding: 6px; text-align: left; font-size: 11px; }';
  html += 'th { background: #f1f3f4; }';
  html += '.new { background: #e6f4ea; }';
  html += '.logged { background: #fef7e0; }';
  html += '</style></head><body>';

  html += '<h3>🔎 Quick Gmail Check</h3>';
  html += '<p>Existing logged email IDs: <strong>' + Object.keys(existingIds).length + '</strong></p>';

  var queries = [
    { name: 'Job Hazard Report', query: 'subject:"Job Hazard Report" newer_than:14d' },
    { name: 'Safety Meeting Report', query: 'subject:"Safety Meeting Report" newer_than:14d' },
    { name: 'Weekly Safety Repairs', query: 'subject:"Weekly Safety Repairs" newer_than:14d' }
  ];

  var totalNew = 0;
  var totalLogged = 0;

  queries.forEach(function(q) {
    html += '<h4>' + q.name + '</h4>';
    html += '<p class="query"><strong>Query:</strong> ' + q.query + '</p>';

    try {
      var threads = GmailApp.search(q.query, 0, 50);
      html += '<p>Found: <strong>' + threads.length + '</strong> threads</p>';

      if (threads.length > 0) {
        html += '<table><tr><th>Date</th><th>Subject (truncated)</th><th>Status</th></tr>';

        var displayCount = Math.min(threads.length, 10);
        for (var i = 0; i < displayCount; i++) {
          var messages = threads[i].getMessages();
          var msg = messages[messages.length - 1]; // Most recent message
          var msgId = msg.getId();
          var msgDate = Utilities.formatDate(msg.getDate(), Session.getScriptTimeZone(), 'MM/dd HH:mm');
          var subject = msg.getSubject().substring(0, 60) + (msg.getSubject().length > 60 ? '...' : '');

          var isLogged = existingIds[msgId];
          var statusClass = isLogged ? 'logged' : 'new';
          var statusText = isLogged ? '\uD83D\uDD0D Already in ' + isLogged : '🆕 NEW';

          if (isLogged) {
            totalLogged++;
          } else {
            totalNew++;
          }

          html += '<tr class="' + statusClass + '">';
          html += '<td>' + msgDate + '</td>';
          html += '<td>' + subject + '</td>';
          html += '<td>' + statusText + '</td>';
          html += '</tr>';
        }

        if (threads.length > 10) {
          html += '<tr><td colspan="3">... and ' + (threads.length - 10) + ' more</td></tr>';
        }

        html += '</table>';
      }
    } catch (e) {
      html += '<p class="error">Error: ' + e.message + '</p>';
      if (e.message.indexOf('permission') !== -1) {
        html += '<p class="error">\u26A0\uFE0F Gmail permission required. Please run Process Safety Emails from the spreadsheet and authorize when prompted.</p>';
      }
    }
  });

  html += '<h4>Summary</h4>';
  html += '<p class="success">🆕 NEW emails (not logged): <strong>' + totalNew + '</strong></p>';
  html += '<p class="warning">\uD83D\uDD0D Already logged: <strong>' + totalLogged + '</strong></p>';

  if (totalNew === 0 && totalLogged > 0) {
    html += '<p class="warning">\u26A0\uFE0F All found emails are already in the log sheets.</p>';
  }

  if (totalNew > 0) {
    html += '<p class="success">\u2705 There are ' + totalNew + ' NEW emails to process. Run "Process Safety Emails" to log them.</p>';
  }

  html += '</body></html>';

  var htmlOutput = HtmlService.createHtmlOutput(html)
    .setWidth(650)
    .setHeight(550)
    .setTitle('Quick Gmail Check');

  ui.showModalDialog(htmlOutput, 'Quick Gmail Check');
}

/**
 * Diagnostic function to find crews missing from Safety Compliance for the current week.
 * Shows which active crews from Job Tracking are not yet in the compliance sheet.
 */
function diagnoseMissingCrews() {
  var ui = SpreadsheetApp.getUi();
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  var html = '<html><head><style>';
  html += 'body { font-family: Arial, sans-serif; padding: 15px; font-size: 13px; }';
  html += 'h2 { color: #1a73e8; margin-top: 0; }';
  html += 'h3 { color: #5f6368; margin-top: 15px; }';
  html += '.section { margin-bottom: 15px; padding: 10px; background: #f8f9fa; border-radius: 6px; }';
  html += '.success { color: #1e8e3e; }';
  html += '.warning { color: #ea8600; }';
  html += '.error { color: #d93025; }';
  html += 'table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 12px; }';
  html += 'th, td { padding: 6px; border: 1px solid #ddd; text-align: left; }';
  html += 'th { background: #e8eaed; }';
  html += '.missing { background: #fce8e6; }';
  html += '.present { background: #e6f4ea; }';
  html += '</style></head><body>';

  html += '<h2>🔁 Missing Crews Diagnostic</h2>';

  // Get current week
  var today = new Date();
  var boundaries = getWeekBoundaries(today);
  var weekStartStr = Utilities.formatDate(boundaries.weekStart, Session.getScriptTimeZone(), 'MM/dd/yyyy');

  html += '<div class="section">';
  html += '<strong>Current Week Start:</strong> ' + weekStartStr;
  html += '</div>';

  // Get active crews from Job Tracking
  var jobTrackingSheet = ss.getSheetByName('Job Tracking');
  var activeCrews = [];

  if (jobTrackingSheet && jobTrackingSheet.getLastRow() > 1) {
    var jobData = jobTrackingSheet.getDataRange().getValues();
    var headers = jobData[0];

    // Find column indices
    var jobNumCol = headers.indexOf('Job Number');
    var foremanCol = headers.indexOf('Foreman');
    var statusCol = headers.indexOf('Status');
    var startDateCol = headers.indexOf('Start Date');

    html += '<div class="section">';
    html += '<h3>📋 Job Tracking Column Positions</h3>';
    html += '<p>Job Number: col ' + jobNumCol + ', Foreman: col ' + foremanCol + ', Status: col ' + statusCol + ', Start Date: col ' + startDateCol + '</p>';
    html += '</div>';

    for (var i = 1; i < jobData.length; i++) {
      var row = jobData[i];
      var jobNum = row[jobNumCol];
      var foreman = row[foremanCol];
      var status = row[statusCol];
      var startDate = row[startDateCol];

      // Check if Active and started
      if (status && status.toString().toLowerCase() === 'active') {
        var startDateObj = startDate ? new Date(startDate) : null;
        var hasStarted = !startDateObj || startDateObj <= today;

        if (hasStarted && jobNum && foreman) {
          activeCrews.push({
            jobNumber: jobNum.toString(),
            foreman: foreman.toString(),
            startDate: startDateObj ? Utilities.formatDate(startDateObj, Session.getScriptTimeZone(), 'MM/dd/yyyy') : 'Not set'
          });
        }
      }
    }
  }

  html += '<div class="section">';
  html += '<h3>\u2705 Active Crews in Job Tracking (' + activeCrews.length + ')</h3>';
  html += '<table><tr><th>Job Number</th><th>Foreman</th><th>Start Date</th></tr>';
  for (var j = 0; j < activeCrews.length; j++) {
    html += '<tr><td>' + activeCrews[j].jobNumber + '</td><td>' + activeCrews[j].foreman + '</td><td>' + activeCrews[j].startDate + '</td></tr>';
  }
  html += '</table></div>';

  // Get crews already in Safety Compliance for current week
  var complianceSheet = ss.getSheetByName('Safety Compliance');
  var crewsInCompliance = [];

  if (complianceSheet && complianceSheet.getLastRow() > 1) {
    var compData = complianceSheet.getDataRange().getValues();
    var compHeaders = compData[0];
    var weekCol = compHeaders.indexOf('Week Start');
    var crewCol = compHeaders.indexOf('Crew');

    if (weekCol === -1) weekCol = 0;
    if (crewCol === -1) crewCol = 1;

    for (var k = 1; k < compData.length; k++) {
      var compWeek = compData[k][weekCol];
      var compWeekStr = '';
      if (compWeek instanceof Date) {
        compWeekStr = Utilities.formatDate(compWeek, Session.getScriptTimeZone(), 'MM/dd/yyyy');
      } else if (compWeek) {
        compWeekStr = compWeek.toString();
      }

      if (compWeekStr === weekStartStr) {
        var crewJob = compData[k][crewCol];
        if (crewJob) {
          crewsInCompliance.push(crewJob.toString());
        }
      }
    }
  }

  html += '<div class="section">';
  html += '<h3>\uD83D\uDCCA Crews in Safety Compliance for ' + weekStartStr + ' (' + crewsInCompliance.length + ')</h3>';
  html += '<p>' + crewsInCompliance.join(', ') + '</p>';
  html += '</div>';

  // Find missing crews
  var missingCrews = [];
  for (var m = 0; m < activeCrews.length; m++) {
    var found = false;
    for (var n = 0; n < crewsInCompliance.length; n++) {
      if (crewsInCompliance[n].indexOf(activeCrews[m].jobNumber) !== -1) {
        found = true;
        break;
      }
    }
    if (!found) {
      missingCrews.push(activeCrews[m]);
    }
  }

  if (missingCrews.length > 0) {
    html += '<div class="section missing">';
    html += '<h3 class="error">\u274C Missing Crews (' + missingCrews.length + ')</h3>';
    html += '<p>These active crews are NOT in Safety Compliance for the current week:</p>';
    html += '<table><tr><th>Job Number</th><th>Foreman</th></tr>';
    for (var p = 0; p < missingCrews.length; p++) {
      html += '<tr><td>' + missingCrews[p].jobNumber + '</td><td>' + missingCrews[p].foreman + '</td></tr>';
    }
    html += '</table>';
    html += '<p style="margin-top: 10px;">Use <strong>➕ Force Add Active Crews</strong> to add them.</p>';
    html += '</div>';
  } else {
    html += '<div class="section present">';
    html += '<h3 class="success">\u2705 All Active Crews Present</h3>';
    html += '<p>All active crews from Job Tracking are in Safety Compliance.</p>';
    html += '</div>';
  }

  html += '</body></html>';

  var htmlOutput = HtmlService.createHtmlOutput(html)
    .setWidth(600)
    .setHeight(550)
    .setTitle('Missing Crews Diagnostic');

  ui.showModalDialog(htmlOutput, 'Missing Crews Diagnostic');
}

/**
 * Force adds missing crews to Safety Compliance for the current week.
 */
function forceAddMissingCrewsToCompliance() {
  var ui = SpreadsheetApp.getUi();
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  Logger.log('=== forceAddMissingCrewsToCompliance START ===');

  // Get current week
  var today = new Date();
  var boundaries = getWeekBoundaries(today);
  var weekStart = boundaries.weekStart;
  var weekStartStr = Utilities.formatDate(weekStart, Session.getScriptTimeZone(), 'MM/dd/yyyy');

  Logger.log('Current week start: ' + weekStartStr);

  // Get active crews from Job Tracking
  var jobTrackingSheet = ss.getSheetByName('Job Tracking');
  var activeCrews = [];

  if (jobTrackingSheet && jobTrackingSheet.getLastRow() > 1) {
    var jobData = jobTrackingSheet.getDataRange().getValues();
    var headers = jobData[0];

    var jobNumCol = headers.indexOf('Job Number');
    var foremanCol = headers.indexOf('Foreman');
    var statusCol = headers.indexOf('Status');
    var startDateCol = headers.indexOf('Start Date');

    Logger.log('Job Tracking columns: jobNum=' + jobNumCol + ', foreman=' + foremanCol + ', status=' + statusCol);

    for (var i = 1; i < jobData.length; i++) {
      var row = jobData[i];
      var jobNum = row[jobNumCol];
      var foreman = row[foremanCol];
      var status = row[statusCol];
      var startDate = row[startDateCol];

      if (status && status.toString().toLowerCase() === 'active') {
        var startDateObj = startDate ? new Date(startDate) : null;
        var hasStarted = !startDateObj || startDateObj <= today;

        if (hasStarted && jobNum && foreman) {
          activeCrews.push({
            jobNumber: jobNum.toString(),
            foreman: foreman.toString()
          });
          Logger.log('Active crew: ' + jobNum + ' (' + foreman + ')');
        }
      }
    }
  }

  Logger.log('Total active crews: ' + activeCrews.length);

  // Get crews already in Safety Compliance for current week
  var complianceSheet = ss.getSheetByName('Safety Compliance');
  if (!complianceSheet) {
    ui.alert('Error', 'Safety Compliance sheet not found.', ui.ButtonSet.OK);
    return;
  }

  var crewsInCompliance = [];
  if (complianceSheet.getLastRow() > 1) {
    var compData = complianceSheet.getDataRange().getValues();
    var compHeaders = compData[0];
    var weekCol = compHeaders.indexOf('Week Start');
    var crewCol = compHeaders.indexOf('Job Number');

    if (weekCol === -1) weekCol = 0;
    if (crewCol === -1) crewCol = 1;

    Logger.log('Compliance columns: weekCol=' + weekCol + ', crewCol=' + crewCol);

    for (var k = 1; k < compData.length; k++) {
      var compWeek = compData[k][weekCol];
      var compWeekStr = '';
      if (compWeek instanceof Date) {
        compWeekStr = Utilities.formatDate(compWeek, Session.getScriptTimeZone(), 'MM/dd/yyyy');
      } else if (compWeek) {
        compWeekStr = compWeek.toString();
      }

      if (compWeekStr === weekStartStr) {
        var crewJob = compData[k][crewCol];
        if (crewJob) {
          crewsInCompliance.push(crewJob.toString());
        }
      }
    }
  }

  Logger.log('Crews already in compliance for ' + weekStartStr + ': ' + crewsInCompliance.join(', '));

  // Find missing crews
  var missingCrews = [];
  for (var m = 0; m < activeCrews.length; m++) {
    var found = false;
    for (var n = 0; n < crewsInCompliance.length; n++) {
      if (crewsInCompliance[n].indexOf(activeCrews[m].jobNumber) !== -1) {
        found = true;
        break;
      }
    }
    if (!found) {
      missingCrews.push(activeCrews[m]);
      Logger.log('Missing crew: ' + activeCrews[m].jobNumber);
    }
  }

  if (missingCrews.length === 0) {
    ui.alert('All Crews Present', 'All active crews from Job Tracking are already in Safety Compliance for week ' + weekStartStr, ui.ButtonSet.OK);
    return;
  }

  // Confirm before adding
  var crewList = missingCrews.map(function(c) { return c.jobNumber + ' (' + c.foreman + ')'; }).join('\n');
  var response = ui.alert(
    'Add Missing Crews?',
    'The following ' + missingCrews.length + ' crew(s) will be added to Safety Compliance for week ' + weekStartStr + ':\n\n' + crewList,
    ui.ButtonSet.YES_NO
  );

  if (response !== ui.Button.YES) {
    Logger.log('User cancelled');
    return;
  }

  // Get current timestamp as formatted string (no time zone issues)
  var nowStr = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'MM/dd/yyyy HH:mm');

  // Add missing crews
  var compHeaders = complianceSheet.getRange(1, 1, 1, complianceSheet.getLastColumn()).getValues()[0];
  var addedCount = 0;

  Logger.log('Compliance headers: ' + compHeaders.join(', '));

  for (var p = 0; p < missingCrews.length; p++) {
    var crew = missingCrews[p];

    // Build a new row with appropriate defaults
    // Use weekStartStr (formatted string) instead of Date object to avoid timezone issues
    var newRow = [];
    for (var h = 0; h < compHeaders.length; h++) {
      var header = compHeaders[h].toString().toLowerCase().trim();

      if (header === 'week start' || header === 'weekstart') {
        newRow.push(weekStartStr);  // Use formatted string, not Date object
      } else if (header === 'job number' || header === 'crew') {
        newRow.push(crew.jobNumber);
      } else if (header === 'foreman') {
        newRow.push(crew.foreman);
      } else if (header === 'status') {
        newRow.push('Pending');
      } else if (header === 'updated') {
        newRow.push(nowStr);  // Use formatted string
      } else if (header === 'sat' || header === 'sun') {
        newRow.push('N/A');
      } else if (header === 'mon' || header === 'tue' || header === 'wed' || header === 'thu' || header === 'fri') {
        newRow.push('\u23F3');
      } else if (header === 'weekly meeting') {
        newRow.push('\u23F3');
      } else if (header === 'monthly checklist') {
        newRow.push('\u23F3');
      } else {
        newRow.push('');
      }
    }

    Logger.log('Adding row for ' + crew.jobNumber + ': ' + JSON.stringify(newRow));
    complianceSheet.appendRow(newRow);
    addedCount++;
  }

  // Apply proper week formatting (sorts, alternating colors, blue borders between weeks)
  formatComplianceSheetByWeek();

  Logger.log('=== forceAddMissingCrewsToCompliance END: Added ' + addedCount + ' crews ===');
  ui.alert('Success', 'Added ' + addedCount + ' missing crew(s) to Safety Compliance for week ' + weekStartStr + '\n\nThe sheet has been formatted with alternating week colors and borders.', ui.ButtonSet.OK);
}

/**
 * Scans JHA Log, Weekly Safety Log, and Monthly Checklist Log for any rows
 * that are uncredited or Skipped (status is not Credited or Duplicate, or creditedTo is empty).
 * Returns an object with array lists of uncredited/skipped items.
 */
function scanForUncreditedLogs() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var result = {
    jha: [],
    weekly: [],
    monthly: []
  };

  // 1. Scan JHA Log
  var jhaSheet = ss.getSheetByName(JHA_LOG_SHEET_NAME);
  if (jhaSheet) {
    var lastRow = jhaSheet.getLastRow();
    if (lastRow > 1) {
      var data = jhaSheet.getRange(2, 1, lastRow - 1, 10).getValues();
      for (var i = 0; i < data.length; i++) {
        var rowNum = i + 2;
        var dateReceived = data[i][0];
        var dateCreated = data[i][1];
        var jobNum = String(data[i][2] || '').trim();
        var foreman = String(data[i][3] || '').trim();
        var subject = String(data[i][4] || '').trim();
        var emailId = String(data[i][5] || '').trim();
        var status = String(data[i][7] || '').trim();
        var creditedTo = String(data[i][8] || '').trim();

        // Skip month headers, section dividers, and empty rows
        if (isMonthHeaderOrEmptyLogRow(dateReceived, jobNum, foreman, subject, emailId)) {
          continue;
        }

        // Include any row that is NOT Duplicate and is NOT Credited (or has no creditedTo)
        if (status !== 'Duplicate' && (status !== 'Credited' || !creditedTo)) {
          result.jha.push({
            row: rowNum,
            date: dateCreated ? (dateCreated instanceof Date ? Utilities.formatDate(dateCreated, Session.getScriptTimeZone(), 'MM/dd/yyyy') : String(dateCreated)) : 'Unknown',
            jobNumber: jobNum,
            foreman: foreman,
            subject: subject,
            status: status || 'Uncredited'
          });
        }
      }
    }
  }

  // 2. Scan Weekly Safety Log
  var weeklySheet = ss.getSheetByName(WEEKLY_SAFETY_LOG_SHEET_NAME);
  if (weeklySheet) {
    var lastRow = weeklySheet.getLastRow();
    if (lastRow > 1) {
      var data = weeklySheet.getRange(2, 1, lastRow - 1, 9).getValues();
      for (var i = 0; i < data.length; i++) {
        var rowNum = i + 2;
        var dateReceived = data[i][0];
        var weekOf = data[i][1];
        var jobNum = String(data[i][2] || '').trim();
        var foreman = String(data[i][3] || '').trim();
        var subject = String(data[i][4] || '').trim();
        var emailId = String(data[i][5] || '').trim();
        var status = String(data[i][6] || '').trim();
        var creditedTo = String(data[i][7] || '').trim();

        // Skip month headers, section dividers, and empty rows
        if (isMonthHeaderOrEmptyLogRow(dateReceived, jobNum, foreman, subject, emailId)) {
          continue;
        }

        if (status !== 'Duplicate' && (status !== 'Credited' || !creditedTo)) {
          result.weekly.push({
            row: rowNum,
            date: weekOf ? (weekOf instanceof Date ? Utilities.formatDate(weekOf, Session.getScriptTimeZone(), 'MM/dd/yyyy') : String(weekOf)) : 'Unknown',
            jobNumber: jobNum,
            foreman: foreman,
            subject: subject,
            status: status || 'Uncredited'
          });
        }
      }
    }
  }

  // 3. Scan Monthly Checklist Log
  var monthlySheet = ss.getSheetByName(MONTHLY_CHECKLIST_LOG_SHEET_NAME);
  if (monthlySheet) {
    var lastRow = monthlySheet.getLastRow();
    if (lastRow > 1) {
      var data = monthlySheet.getRange(2, 1, lastRow - 1, 11).getValues();
      for (var i = 0; i < data.length; i++) {
        var rowNum = i + 2;
        var dateReceived = data[i][0];
        var reportDate = data[i][1];
        var jobNum = String(data[i][2] || '').trim();
        var foreman = String(data[i][3] || '').trim();
        var subject = String(data[i][5] || '').trim();
        var emailId = String(data[i][6] || '').trim();
        var status = String(data[i][7] || '').trim();
        var creditedTo = String(data[i][8] || '').trim();

        // Skip month headers, section dividers, and empty rows
        if (isMonthHeaderOrEmptyLogRow(dateReceived, jobNum, foreman, subject, emailId)) {
          continue;
        }

        if (status !== 'Duplicate' && (status !== 'Credited' || !creditedTo)) {
          result.monthly.push({
            row: rowNum,
            date: reportDate ? (reportDate instanceof Date ? Utilities.formatDate(reportDate, Session.getScriptTimeZone(), 'MM/dd/yyyy') : String(reportDate)) : 'Unknown',
            jobNumber: jobNum,
            foreman: foreman,
            subject: subject,
            status: status || 'Uncredited'
          });
        }
      }
    }
  }

  return result;
}
