/**
 * 88-SafetyReports.gs
 *
 * Gmail integration for processing JHAs, Safety Meetings, and Fleet Checklists
 * Extracts equipment issues (fire extinguishers, hot sticks, rubber goods, etc.)
 * Logs to Safety Reports sheet for tracking and task creation
 *
 * Created: February 4, 2026
 * Updated: February 10, 2026 - Fixed column structure (removed Week End, fixed column indices)
 */

/**
 * Creates the Safety Reports tracking sheet
 */
function setupSafetyReportsSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("Safety Reports");

  if (sheet) {
    var response = Browser.msgBox(
      "Safety Reports sheet already exists",
      "Do you want to recreate it? This will DELETE all existing data.",
      Browser.Buttons.YES_NO
    );
    if (response === "no") return;
    ss.deleteSheet(sheet);
  }

  sheet = ss.insertSheet("Safety Reports");

  // Set up headers
  var headers = [
    "Report Date", "Report Type", "Job Number", "Foreman",
    "Vehicle Number", "Equipment Type", "Issue Description",
    "Status", "FE Test Date", "Source Email ID", "Notes", "Email Subject"
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
 * Menu function to add resolved formatting to existing Safety Reports sheet
 */
function addResolvedFormattingToSafetyReports() {
  addResolvedRowFormatting();
  SpreadsheetApp.getUi().alert("✅ Resolved row formatting added!\n\nRows with Status = 'Resolved' will now appear in light grey.");
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
 * Parses them and logs equipment issues to Safety Reports sheet
 *
 * @param {number} daysBack - Number of days to search back (default 7)
 * @param {number} batchSize - Number of emails to process at once (default 10 for PDF processing)
 * @param {boolean} newOnlyMode - If true, only process emails newer than last processed date (default true)
 * @returns {Object} - Status object with progress info
 */
function processSafetyEmails(daysBack, batchSize, newOnlyMode) {
  if (!daysBack) daysBack = 7;
  if (!batchSize) batchSize = 10; // Small batch size due to slow PDF extraction (~5-10 sec each)
  if (newOnlyMode === undefined) newOnlyMode = true; // Default to new-only mode

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("Safety Reports");
  if (!sheet) {
    // Auto-create the sheet
    Logger.log("Safety Reports sheet not found - creating it now");
    setupSafetyReportsSheet();
    sheet = ss.getSheetByName("Safety Reports");
    if (!sheet) {
      Browser.msgBox("❌ Failed to create Safety Reports sheet.");
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

      var issues = [];
      var complianceRecords = []; // Track all compliance reports (even with no issues)
      var pendingCorrections = []; // Track job number corrections that need approval
      var processedCount = 0;
      var skippedCount = 0;

      batchThreads.forEach(function(thread) {
        var messages = thread.getMessages();
        messages.forEach(function(message) {
          var messageId = message.getId();

          // Skip if already processed
          if (existingEmailIds[messageId]) {
            skippedCount++;
            return;
          }

          var parsed = parseSafetyEmail(message);
          if (parsed) {
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
                  // Create a "No Issues" row for compliance tracking
                  complianceRecords.push([
                    meta.date,           // Report Date
                    meta.reportType,     // Report Type (JHA, Safety Meeting, Safety Checklist, Fleet Checklist)
                    meta.jobNumber,      // Job Number
                    meta.foreman,        // Foreman
                    '',                  // Vehicle Number (N/A for JHA/SM)
                    'No Issues',         // Equipment Type - indicates this is just for tracking
                    'Report received - no equipment issues', // Issue Description
                    'Resolved',          // Status - auto-resolved since no issues
                    '',                  // FE Test Date
                    meta.messageId,      // Source Email ID
                    '',                  // Notes
                    meta.subject         // Email Subject
                  ]);
                }
              }
            }

            processedCount++;
          }
        });
      });

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

      // Write equipment issues to sheet
      if (issues.length > 0) {
        var lastRow = sheet.getLastRow();
        sheet.getRange(lastRow + 1, 1, issues.length, 12).setValues(issues);
        applyStatusFormatting(sheet, lastRow + 1, issues.length);
      }

      // Write compliance records (JHA/Safety Meetings/Safety Checklists/Fleet Checklists with no issues) to sheet
      if (complianceRecords.length > 0) {
        var lastRow = sheet.getLastRow();
        sheet.getRange(lastRow + 1, 1, complianceRecords.length, 12).setValues(complianceRecords);
        Logger.log("Added " + complianceRecords.length + " compliance records (no-issue reports)");
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
    totalThreads: allThreads.length,
    threadsProcessed: batchEnd,
    threadsRemaining: allThreads.length - batchEnd,
    newOnlyMode: newOnlyMode,
    lastProcessedDate: lastProcessedTimestamp
  };

  // When all batches are complete, run compliance tracking
  if (isComplete) {
    try {
      Logger.log("Running compliance tracking...");
      var today = new Date();
      var weekBounds = getWeekBoundaries(today);
      var complianceData = calculateSafetyCompliance(weekBounds.weekStart);

      // Update compliance sheet
      updateComplianceSheet(complianceData);

      // Create missing report tasks if past deadline
      var tasksCreated = 0;
      if (complianceData.isPastDeadline) {
        tasksCreated = createMissingReportTasks(complianceData);
      }

      // Also finalize any past weeks that still show "Pending"
      var pastWeekResult = finalizePastWeeksCompliance();
      tasksCreated += pastWeekResult.tasksCreated;

      // Add compliance stats to result
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

      // Add crew details for display
      for (var jobNumber in complianceData.crews) {
        var crew = complianceData.crews[jobNumber];
        // Convert individual jhaSun, jhaMon, etc. properties to jha array for UI
        var jhaArray = [
          crew.jhaSun || 'N/A',
          crew.jhaMon || '⏳',
          crew.jhaTue || '⏳',
          crew.jhaWed || '⏳',
          crew.jhaThu || '⏳',
          crew.jhaFri || '⏳',
          crew.jhaSat || 'N/A'
        ];
        result.compliance.crews.push({
          jobNumber: jobNumber,
          foreman: crew.foreman,
          jha: jhaArray,
          weeklyMeeting: crew.weeklyMeeting,
          monthlyChecklist: crew.monthlyChecklist,
          status: crew.status
        });
      }

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
  // Get last processed timestamp from ScriptProperties (includes time)
  var props = PropertiesService.getScriptProperties();
  var lastProcessedTimestamp = props.getProperty('LAST_SAFETY_EMAIL_TIMESTAMP') || '';
  var lastProcessedDate = props.getProperty('LAST_SAFETY_EMAIL_DATE') || '';
  // Prefer full timestamp for display, fall back to date-only
  var lastProcessedDisplay = lastProcessedTimestamp
    ? lastProcessedTimestamp.replace(new RegExp('/', 'g'), '-')
    : (lastProcessedDate ? lastProcessedDate.replace(new RegExp('/', 'g'), '-') : 'Never');

  var html = HtmlService.createHtmlOutput(
    '<style>' +
    'body { font-family: Arial, sans-serif; padding: 20px; }' +
    'label { display: block; margin-bottom: 8px; font-weight: bold; }' +
    'select { width: 100%; padding: 8px; margin-bottom: 16px; box-sizing: border-box; }' +
    'button { background: #4A86E8; color: white; padding: 10px 20px; border: none; border-radius: 4px; cursor: pointer; width: 100%; margin-bottom: 8px; }' +
    'button:hover { background: #3367D6; }' +
    'button:disabled { background: #ccc; cursor: not-allowed; }' +
    'button.success { background: #34A853; }' +
    'button.success:hover { background: #2D8E47; }' +
    'button.secondary { background: #6c757d; margin-top: 5px; }' +
    '.status { margin-top: 10px; padding: 10px; background: #f5f5f5; border-radius: 4px; font-size: 13px; }' +
    '.progress { color: #1155CC; font-weight: bold; }' +
    '.warning { color: #E67C00; margin-top: 8px; font-size: 12px; }' +
    '.info { color: #666; margin-top: 4px; font-size: 12px; }' +
    '.checkbox-row { display: flex; align-items: center; margin-bottom: 12px; gap: 8px; }' +
    '.checkbox-row input { width: 18px; height: 18px; margin: 0; }' +
    '.checkbox-row label { margin: 0; font-weight: normal; }' +
    '.last-run { font-size: 12px; color: #666; margin-bottom: 12px; padding: 6px 10px; background: #e8f4fd; border-radius: 4px; }' +
    '.compliance-section { margin-top: 15px; padding: 10px; background: #e8f5e9; border-radius: 4px; }' +
    '.compliance-section h4 { margin: 0 0 10px 0; color: #2e7d32; }' +
    '.compliance-grid { font-size: 11px; width: 100%; border-collapse: collapse; }' +
    '.compliance-grid th { background: #1a73e8; color: white; padding: 4px 2px; text-align: center; }' +
    '.compliance-grid td { padding: 3px 2px; text-align: center; border-bottom: 1px solid #ddd; }' +
    '.compliance-grid .ok { color: #28a745; }' +
    '.compliance-grid .missing { color: #dc3545; font-weight: bold; }' +
    '.compliance-grid .pending { color: #ffc107; }' +
    '.compliance-grid .na { color: #999; }' +
    '.summary-row { display: flex; gap: 10px; margin-bottom: 10px; }' +
    '.summary-item { flex: 1; text-align: center; padding: 8px; border-radius: 4px; }' +
    '.summary-item.good { background: #d4edda; }' +
    '.summary-item.bad { background: #f8d7da; }' +
    '.summary-item.neutral { background: #e2e3e5; }' +
    '.summary-item .num { font-size: 20px; font-weight: bold; }' +
    '.summary-item .lbl { font-size: 10px; color: #666; }' +
    '.progress-bar-container { width: 100%; height: 20px; background: #e0e0e0; border-radius: 10px; overflow: hidden; margin: 10px 0; }' +
    '.progress-bar { height: 100%; background: linear-gradient(90deg, #4285f4, #34a853); border-radius: 10px; transition: width 0.3s ease; display: flex; align-items: center; justify-content: center; color: white; font-size: 11px; font-weight: bold; min-width: 30px; }' +
    '</style>' +
    '<div class="last-run">📅 Last processed: <strong>' + lastProcessedDisplay + '</strong></div>' +
    '<div class="checkbox-row">' +
    '  <input type="checkbox" id="newOnlyMode" checked>' +
    '  <label for="newOnlyMode">Only process new emails since last run (faster)</label>' +
    '</div>' +
    '<label>Or search last:</label>' +
    '<select id="daysBack">' +
    '<option value="7">7 days</option>' +
    '<option value="14">14 days</option>' +
    '<option value="30">30 days</option>' +
    '<option value="60">60 days</option>' +
    '<option value="90">90 days</option>' +
    '</select>' +
    '<button id="processBtn" onclick="processEmails()">Start Processing</button>' +
    '<div id="progressContainer" class="progress-bar-container" style="display:none;"><div id="progressBar" class="progress-bar" style="width:0%;">0%</div></div>' +
    '<div id="status" class="status" style="display:none;"></div>' +
    '<div id="complianceSection" class="compliance-section" style="display:none;"></div>' +
    '<div class="warning">⚠️ Safety Checklist PDFs take ~5-10 seconds each to extract. Processing in batches of 50.</div>' +
    '<script>' +
    'var currentDays = 7;' +
    'var newOnlyMode = true;' +
    'var isFirstCall = true;' +
    'function processEmails() {' +
    '  var btn = document.getElementById("processBtn");' +
    '  var status = document.getElementById("status");' +
    '  var progressContainer = document.getElementById("progressContainer");' +
    '  var progressBar = document.getElementById("progressBar");' +
    '  var days = parseInt(document.getElementById("daysBack").value);' +
    '  newOnlyMode = document.getElementById("newOnlyMode").checked;' +
    '  currentDays = days;' +
    '  btn.disabled = true;' +
    '  btn.textContent = "Processing Batch...";' +
    '  status.style.display = "block";' +
    '  progressContainer.style.display = "block";' +
    '  if (isFirstCall) {' +
    '    progressBar.style.width = "0%";' +
    '    progressBar.textContent = "0%";' +
    '    isFirstCall = false;' +
    '  }' +
    '  var modeText = newOnlyMode ? "new emails only" : "last " + days + " days";' +
    '  status.innerHTML = "Searching Gmail for safety emails (" + modeText + ")...";' +
    '  document.getElementById("complianceSection").style.display = "none";' +
    '  google.script.run' +
    '    .withSuccessHandler(handleBatchComplete)' +
    '    .withFailureHandler(function(err) {' +
    '      status.innerHTML = "<span style=\\"color: red;\\">❌ Error: " + err.message + "</span>";' +
    '      btn.disabled = false;' +
    '      btn.textContent = "Retry";' +
    '    })' +
    '    .processSafetyEmails(days, 50, newOnlyMode);' +
    '}' +
    'function handleBatchComplete(result) {' +
    '  console.log("handleBatchComplete called", result);' +
    '  var btn = document.getElementById("processBtn");' +
    '  var status = document.getElementById("status");' +
    '  var progressContainer = document.getElementById("progressContainer");' +
    '  var progressBar = document.getElementById("progressBar");' +
    '  try {' +
    '    if (result && result.needsApproval) {' +
    '      showApprovalDialog(result.corrections, result);' +
    '    } else if (result && result.complete) {' +
    '      progressBar.style.width = "100%";' +
    '      progressBar.textContent = "100%";' +
    '      progressBar.style.background = "linear-gradient(90deg, #34A853, #137333)";' +
    '      var modeInfo = result.newOnlyMode ? " (new only since " + result.lastProcessedDate + ")" : " (last " + currentDays + " days)";' +
    '      var complianceInfo = result.complianceRecordsAdded ? "<div class=\\"info\\">📋 JHA/Safety Meeting records logged: " + result.complianceRecordsAdded + "</div>" : "";' +
    '      status.innerHTML = ' +
    '        "✅ <span class=\\"progress\\">All Complete!</span>" + modeInfo + "<br>" +' +
    '        "<div class=\\"info\\">Total emails found: " + result.totalThreads + "</div>" +' +
    '        "<div class=\\"info\\">Processed: " + result.processedThisBatch + " | Skipped (duplicates): " + result.skippedThisBatch + "</div>" +' +
    '        "<div class=\\"info\\">Equipment issues found: " + result.issuesThisBatch + "</div>" + complianceInfo;' +
    '      btn.style.background = "#34A853";' +
    '      btn.innerHTML = "✅ Close";' +
    '      btn.disabled = false;' +
    '      btn.onclick = function() { google.script.host.close(); };' +
    '      console.log("Button updated to Close");' +
    '      if (result.compliance) {' +
    '        showComplianceGrid(result.compliance);' +
    '      }' +
    '    } else if (result) {' +
    '      var pct = Math.round((result.threadsProcessed / result.totalThreads) * 100);' +
    '      progressBar.style.width = pct + "%";' +
    '      progressBar.textContent = pct + "%";' +
    '      status.innerHTML = ' +
    '        "📊 <span class=\\"progress\\">Batch " + result.batchNumber + " of " + result.totalBatches + " (" + pct + "%)</span><br>" +' +
    '        "<div class=\\"info\\">Progress: " + result.threadsProcessed + " / " + result.totalThreads + " emails</div>" +' +
    '        "<div class=\\"info\\">This batch: " + result.processedThisBatch + " processed, " + result.skippedThisBatch + " skipped, " + result.issuesThisBatch + " issues</div>" +' +
    '        "<div class=\\"info\\">⏳ Auto-continuing in 1 second...</div>";' +
    '      btn.innerHTML = "Processing... (" + result.threadsRemaining + " left)";' +
    '      btn.disabled = true;' +
    '      setTimeout(function() { continueBatch(); }, 1000);' +
    '    }' +
    '  } catch(e) {' +
    '    console.error("Error in handleBatchComplete:", e);' +
    '    status.innerHTML = "<span style=\\"color:red\\">UI Error: " + e.message + "</span>";' +
    '    btn.disabled = false;' +
    '    btn.innerHTML = "Close (error)";' +
    '    btn.onclick = function() { google.script.host.close(); };' +
    '  }' +
    '}' +
    'function showApprovalDialog(corrections, batchResult) {' +
    '  var status = document.getElementById("status");' +
    '  var btn = document.getElementById("processBtn");' +
    '  var html = "<div style=\\"background:#fff3cd;padding:10px;border-radius:4px;margin-bottom:10px;\\">";' +
    '  html += "<strong>⚠️ " + corrections.length + " job number(s) were auto-corrected</strong>";' +
    '  html += "<p style=\\"font-size:12px;margin:5px 0 0 0;\\">Review and edit if needed, then click Apply to log records.</p></div>";' +
    '  html += "<table style=\\"width:100%;font-size:11px;border-collapse:collapse;\\">";' +
    '  html += "<tr style=\\"background:#f0f0f0;\\"><th style=\\"padding:5px;text-align:left;\\">Type</th><th style=\\"padding:5px;\\">Original</th><th style=\\"padding:5px;\\">Corrected</th><th style=\\"padding:5px;\\">Remember</th><th style=\\"padding:5px;\\">Skip</th></tr>";' +
    '  for (var i = 0; i < corrections.length; i++) {' +
    '    var c = corrections[i];' +
    '    var shortSubject = c.subject.length > 30 ? c.subject.substring(0, 30) + "..." : c.subject;' +
    '    html += "<tr style=\\"border-bottom:1px solid #ddd;\\">";' +
    '    html += "<td style=\\"padding:5px;\\" title=\\"" + c.subject.replace(/"/g, "&quot;") + "\\">" + c.reportType + "</td>";' +
    '    html += "<td style=\\"padding:5px;color:#dc3545;font-weight:bold;\\">" + c.original + "</td>";' +
    '    html += "<td style=\\"padding:5px;\\"><input type=\\"text\\" id=\\"corrected_" + i + "\\" value=\\"" + c.normalized + "\\" style=\\"width:70px;padding:2px;\\"></td>";' +
    '    html += "<td style=\\"padding:5px;text-align:center;\\"><input type=\\"checkbox\\" id=\\"remember_" + i + "\\" title=\\"Remember this correction\\"></td>";' +
    '    html += "<td style=\\"padding:5px;text-align:center;\\"><input type=\\"checkbox\\" id=\\"skip_" + i + "\\" title=\\"Skip this record\\"></td>";' +
    '    html += "</tr>";' +
    '  }' +
    '  html += "</table>";' +
    '  html += "<div style=\\"margin-top:10px;display:flex;gap:8px;\\">";' +
    '  html += "<button onclick=\\"applyCorrections(" + corrections.length + ")\\" style=\\"flex:1;background:#28a745;color:white;border:none;padding:10px;border-radius:4px;cursor:pointer;\\">✅ Apply & Log</button>";' +
    '  html += "<button onclick=\\"cancelCorrections()\\" style=\\"flex:1;background:#dc3545;color:white;border:none;padding:10px;border-radius:4px;cursor:pointer;\\">❌ Cancel</button>";' +
    '  html += "</div>";' +
    '  status.innerHTML = html;' +
    '  btn.style.display = "none";' +
    '  window.pendingBatchResult = batchResult;' +
    '}' +
    'function applyCorrections(count) {' +
    '  var approvals = [];' +
    '  for (var i = 0; i < count; i++) {' +
    '    var corrected = document.getElementById("corrected_" + i).value;' +
    '    var remember = document.getElementById("remember_" + i).checked;' +
    '    var skip = document.getElementById("skip_" + i).checked;' +
    '    approvals.push({ index: i, corrected: corrected, remember: remember, skip: skip });' +
    '  }' +
    '  var status = document.getElementById("status");' +
    '  status.innerHTML = "<div style=\\"text-align:center;padding:20px;\\"><strong>⏳ Applying corrections and logging records...</strong></div>";' +
    '  google.script.run' +
    '    .withSuccessHandler(function(result) {' +
    '      handleBatchComplete(result);' +
    '    })' +
    '    .withFailureHandler(function(err) {' +
    '      status.innerHTML = "<span style=\\"color:red;\\">❌ Error: " + err.message + "</span>";' +
    '      var btn = document.getElementById("processBtn");' +
    '      btn.style.display = "block";' +
    '      btn.disabled = false;' +
    '      btn.textContent = "Retry";' +
    '    })' +
    '    .applyJobNumberCorrections(JSON.stringify(approvals));' +
    '}' +
    'function cancelCorrections() {' +
    '  google.script.run.cancelPendingCorrections();' +
    '  var status = document.getElementById("status");' +
    '  status.innerHTML = "<div style=\\"color:#dc3545;padding:10px;\\">❌ Batch cancelled. Records were not logged.</div>";' +
    '  var btn = document.getElementById("processBtn");' +
    '  btn.style.display = "block";' +
    '  btn.disabled = false;' +
    '  btn.textContent = "Start Over";' +
    '  btn.onclick = function() { location.reload(); };' +
    '}' +
    'function continueBatch() {' +
    '  google.script.run' +
    '    .withSuccessHandler(handleBatchComplete)' +
    '    .withFailureHandler(function(err) {' +
    '      var status = document.getElementById("status");' +
    '      var btn = document.getElementById("processBtn");' +
    '      status.innerHTML = "<span style=\\"color: red;\\">❌ Error: " + err.message + "</span>";' +
    '      btn.disabled = false;' +
    '      btn.textContent = "Retry";' +
    '      btn.onclick = function() { isFirstCall = true; processEmails(); };' +
    '    })' +
    '    .processSafetyEmails(currentDays, 50, newOnlyMode);' +
    '}' +
    'function showComplianceGrid(compliance) {' +
    '  var section = document.getElementById("complianceSection");' +
    '  var html = "<h4>📊 JHA/Weekly/Monthly Compliance - Week of " + compliance.weekStart + " - " + compliance.weekEnd + "</h4>";' +
    '  html += "<div class=\\"summary-row\\">";' +
    '  html += "<div class=\\"summary-item good\\"><div class=\\"num\\">" + compliance.compliantCount + "</div><div class=\\"lbl\\">Compliant</div></div>";' +
    '  if (compliance.isPastDeadline) {' +
    '    html += "<div class=\\"summary-item bad\\"><div class=\\"num\\">" + compliance.missingCount + "</div><div class=\\"lbl\\">Missing</div></div>";' +
    '  } else {' +
    '    var pending = compliance.totalCrews - compliance.compliantCount;' +
    '    html += "<div class=\\"summary-item neutral\\"><div class=\\"num\\">" + pending + "</div><div class=\\"lbl\\">Pending</div></div>";' +
    '  }' +
    '  html += "<div class=\\"summary-item neutral\\"><div class=\\"num\\">" + compliance.totalCrews + "</div><div class=\\"lbl\\">Total</div></div>";' +
    '  html += "</div>";' +
    '  if (compliance.tasksCreated > 0) {' +
    '    html += "<div style=\\"color: #1a73e8; margin-bottom: 10px;\\">📋 Created " + compliance.tasksCreated + " missing report tasks in Task Metadata</div>";' +
    '  }' +
    '  html += "<div style=\\"max-height: 200px; overflow-y: auto;\\">";' +
    '  html += "<table class=\\"compliance-grid\\"><tr><th>Crew</th><th>Sun</th><th>Mon</th><th>Tue</th><th>Wed</th><th>Thu</th><th>Fri</th><th>Sat</th><th>Weekly</th><th>Monthly</th></tr>";' +
    '  for (var i = 0; i < compliance.crews.length; i++) {' +
    '    var crew = compliance.crews[i];' +
    '    html += "<tr><td><strong>" + crew.jobNumber + "</strong></td>";' +
    '    for (var d = 0; d < 7; d++) {' +
    '      var st = crew.jha[d];' +
    '      var cls = st === "✅" ? "ok" : (st === "❌" ? "missing" : (st === "⏳" ? "pending" : "na"));' +
    '      html += "<td class=\\"" + cls + "\\">" + st + "</td>";' +
    '    }' +
    '    var mCls = crew.weeklyMeeting === "✅" ? "ok" : (crew.weeklyMeeting === "❌" ? "missing" : (crew.weeklyMeeting === "⏳" ? "pending" : "na"));' +
    '    html += "<td class=\\"" + mCls + "\\">" + crew.weeklyMeeting + "</td>";' +
    '    var mcCls = crew.monthlyChecklist === "✅" ? "ok" : (crew.monthlyChecklist === "❌" ? "missing" : (crew.monthlyChecklist === "⏳" ? "pending" : "na"));' +
    '    html += "<td class=\\"" + mcCls + "\\">" + (crew.monthlyChecklist || "⏳") + "</td></tr>";' +
    '  }' +
    '  html += "</table></div>";' +
    '  html += "<div style=\\"margin-top: 10px;\\">";' +
    '  html += "<button class=\\"secondary\\" style=\\"width: auto; padding: 6px 12px;\\" onclick=\\"google.script.run.openComplianceConfig()\\">⚙️ Configure</button> ";' +
    '  html += "<button class=\\"secondary\\" style=\\"width: auto; padding: 6px 12px;\\" onclick=\\"google.script.run.showComplianceDashboard()\\">📊 Full Dashboard</button>";' +
    '  html += "</div>";' +
    '  section.innerHTML = html;' +
    '  section.style.display = "block";' +
    '}' +
    '</script>'
  ).setWidth(500).setHeight(550);

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

    // Write equipment issues to sheet
    if (finalIssues.length > 0) {
      var lastRow = sheet.getLastRow();
      sheet.getRange(lastRow + 1, 1, finalIssues.length, 12).setValues(finalIssues);
      applyStatusFormatting(sheet, lastRow + 1, finalIssues.length);
      Logger.log("Wrote " + finalIssues.length + " issues to sheet");
    }

    // Write compliance records to sheet
    if (finalCompliance.length > 0) {
      var lastRow = sheet.getLastRow();
      sheet.getRange(lastRow + 1, 1, finalCompliance.length, 12).setValues(finalCompliance);
      Logger.log("Wrote " + finalCompliance.length + " compliance records to sheet");
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
 * @returns {Object} - {issues: [[row data]], reportMeta: {...}, jobNormalization: {...}}
 */
function parseSafetyEmail(message) {
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
      if (jhaMatch) {
        // Parse the date from subject (format: MM-DD-YYYY)
        var dateParts = jhaMatch[1].split('-');
        if (dateParts.length === 3) {
          var month = parseInt(dateParts[0]) - 1; // 0-indexed
          var day = parseInt(dateParts[1]);
          var year = parseInt(dateParts[2]);
          reportDate = new Date(year, month, day, 12, 0, 0);
          Logger.log("Parsed JHA - Date: " + reportDate.toDateString() + ", Job: " + jhaMatch[2] + (subject.indexOf("Modified") !== -1 ? " (Modified version)" : ""));
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

    // Extract PDF content for Safety Checklist reports (required - all data is in PDF)
    // This is slow (~5-10 seconds per PDF) but necessary
    if (reportType === "Safety Checklist") {
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

    // Lookup foreman by job number - also validates job exists on Employee sheet
    var foremanResult = lookupForemanByJobNumber(jobNumber);
    var foreman = foremanResult.name || "";

    // Build report metadata for compliance tracking
    var reportMeta = {
      date: reportDate,
      reportType: reportType,
      jobNumber: jobNumber,
      originalJobNumber: originalJobNumber,
      foreman: foreman,
      vehicleNumber: vehicleNumber,
      messageId: messageId,
      subject: subject
    };

    // Skip reports for job numbers not on the Employee sheet
    if (jobNumber && !foremanResult.jobExists) {
      Logger.log("Skipping report - Job " + jobNumber + " not found on Employees sheet");
      return { issues: [], skippedReason: "Job not on Employee sheet", reportMeta: reportMeta, jobNormalization: jobNormalization };
    }

    // Extract equipment issues based on report type
    var issues = [];

    if (reportType === "Safety Checklist") {
      // Parse Safety Checklist PDF content
      issues = extractSafetyChecklistIssues(fullText, reportMeta);
    } else {
      // Extract equipment issues from email body + PDF content
      issues = extractEquipmentIssues(fullText, reportMeta);
    }

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
  var nameCol = -1, jobCol = -1, classCol = -1;
  for (var h = 0; h < headers.length; h++) {
    var header = String(headers[h]).toLowerCase().trim();
    if (header === "name" || header === "employee" || header === "employee name") nameCol = h;
    if (header === "job number") jobCol = h;
    if (header === "job classification" || header === "classification") classCol = h;
  }

  if (nameCol === -1) nameCol = 0;
  if (jobCol === -1) return { name: "", jobExists: false };

  // Collect all employees for this crew
  var crewMembers = [];
  var jobExists = false;

  for (var i = 1; i < data.length; i++) {
    var empJobNumber = String(data[i][jobCol]).trim();
    var empName = String(data[i][nameCol]).trim();
    var classification = classCol !== -1 ? String(data[i][classCol]).trim() : "";

    // Match job number prefix (e.g., "013-26" matches "013-26.1", "013-26.2")
    if (empJobNumber && empJobNumber.indexOf(jobNumber) === 0) {
      jobExists = true;
      crewMembers.push({
        name: empName,
        jobNumber: empJobNumber,
        positionSuffix: getJobPositionSuffix(empJobNumber),
        classificationPriority: getClassificationPriority(classification)
      });
    }
  }

  if (crewMembers.length === 0) {
    return { name: "", jobExists: jobExists };
  }

  // Sort by: 1) Position suffix (lower = foreman), 2) Classification priority
  crewMembers.sort(function(a, b) {
    // First, check for .1 suffix (foreman position)
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
 * Priority: 1) Job number suffix (.1 = foreman), 2) Classification
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
  var nameCol = -1, jobCol = -1, classCol = -1, phoneCol = -1;
  for (var h = 0; h < headers.length; h++) {
    var header = String(headers[h]).toLowerCase().trim();
    if (header === "name" || header === "employee" || header === "employee name") nameCol = h;
    if (header === "job number") jobCol = h;
    if (header === "job classification" || header === "classification") classCol = h;
    if (header === "phone" || header === "phone number") phoneCol = h;
  }

  if (nameCol === -1) nameCol = 0;
  if (jobCol === -1 || phoneCol === -1) return "";

  // Collect all employees for this crew
  var crewMembers = [];

  for (var i = 1; i < data.length; i++) {
    var empJobNumber = String(data[i][jobCol]).trim();
    var classification = classCol !== -1 ? String(data[i][classCol]).trim() : "";
    var phone = data[i][phoneCol] || "";

    // Match job number prefix
    if (empJobNumber && empJobNumber.indexOf(jobNumber) === 0) {
      crewMembers.push({
        jobNumber: empJobNumber,
        phone: phone,
        positionSuffix: getJobPositionSuffix(empJobNumber),
        classificationPriority: getClassificationPriority(classification)
      });
    }
  }

  if (crewMembers.length === 0) return "";

  // Sort by: 1) Position suffix (lower = foreman), 2) Classification priority
  crewMembers.sort(function(a, b) {
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
  var jobCol = -1, classCol = -1, locationCol = -1;
  for (var h = 0; h < headers.length; h++) {
    var header = String(headers[h]).toLowerCase().trim();
    if (header === "job number") jobCol = h;
    if (header === "job classification" || header === "classification") classCol = h;
    if (header === "location") locationCol = h;
  }

  if (jobCol === -1 || locationCol === -1) return "";

  // Collect all employees for this crew
  var crewMembers = [];

  for (var i = 1; i < data.length; i++) {
    var empJobNumber = String(data[i][jobCol]).trim();
    var classification = classCol !== -1 ? String(data[i][classCol]).trim() : "";
    var location = data[i][locationCol] || "";

    // Match job number prefix
    if (empJobNumber && empJobNumber.indexOf(jobNumber) === 0) {
      crewMembers.push({
        jobNumber: empJobNumber,
        location: location,
        positionSuffix: getJobPositionSuffix(empJobNumber),
        classificationPriority: getClassificationPriority(classification)
      });
    }
  }

  if (crewMembers.length === 0) return "";

  // Sort by: 1) Position suffix (lower = foreman), 2) Classification priority
  crewMembers.sort(function(a, b) {
    if (a.positionSuffix !== b.positionSuffix) {
      return a.positionSuffix - b.positionSuffix;
    }
    return a.classificationPriority - b.classificationPriority;
  });

  return crewMembers[0].location;
}


// ============================================================================
// SAFETY COMPLIANCE TRACKING
// Tracks JHA submissions and Weekly Safety Meeting compliance per crew
// ============================================================================

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
 * Gets list of active crews (unique job numbers) from Employees sheet
 * Excludes employees in Weeds, Previous Employee, Light Duty, Vacation, Leave, Unknown
 *
 * @returns {Array<string>} - Array of unique job numbers (e.g., ["013-26", "015-26"])
 */
function getActiveCrews() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var employeeSheet = ss.getSheetByName("Employees");
  if (!employeeSheet) return [];

  var data = employeeSheet.getDataRange().getValues();
  var headers = data[0];

  // Find column indices
  var jobCol = -1, locationCol = -1;
  for (var h = 0; h < headers.length; h++) {
    var header = String(headers[h]).toLowerCase().trim();
    if (header === "job number") jobCol = h;
    if (header === "location") locationCol = h;
  }

  if (jobCol === -1) return [];

  // Office-only locations to exclude
  var excludedLocations = ["weeds", "previous employee", "light duty", "vacation", "leave", "unknown"];

  var crews = {};
  for (var i = 1; i < data.length; i++) {
    var jobNumber = String(data[i][jobCol] || '').trim();
    var location = String(data[i][locationCol] || '').toLowerCase().trim();

    // Skip if no job number or excluded location
    if (!jobNumber) continue;
    if (locationCol !== -1 && excludedLocations.indexOf(location) !== -1) continue;

    // Extract base job number (remove position suffix like .1, .2)
    var baseJob = jobNumber.split('.')[0];
    if (baseJob.match(/^\d{3}-\d{2}$/)) {
      crews[baseJob] = true;
    }
  }

  return Object.keys(crews).sort();
}

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

  // Green for ✅
  var checkRule = SpreadsheetApp.newConditionalFormatRule()
    .whenTextContains("✅")
    .setBackground("#D9EAD3")
    .setRanges([dayRange])
    .build();
  rules.push(checkRule);

  // Red for ❌
  var xRule = SpreadsheetApp.newConditionalFormatRule()
    .whenTextContains("❌")
    .setBackground("#F4CCCC")
    .setRanges([dayRange])
    .build();
  rules.push(xRule);

  // Yellow for ⏳
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

  // Headers
  var headers = [
    "Job Number", "Foreman",
    "Skip Sun", "Skip Mon", "Skip Tue", "Skip Wed", "Skip Thu", "Skip Fri", "Skip Sat",
    "Skip Weekly Meeting", "Notes"
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
        false, "" // Don't skip weekly meeting, no notes
      ]);
    }
    sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);

    // Add checkboxes for skip columns (C-J = columns 3-10)
    var checkboxRange = sheet.getRange(2, 3, rows.length, 8);
    checkboxRange.insertCheckboxes();
  }

  // Column widths
  sheet.setColumnWidth(1, 80);   // Job Number
  sheet.setColumnWidth(2, 120);  // Foreman
  for (var j = 3; j <= 10; j++) {
    sheet.setColumnWidth(j, 70); // Skip columns
  }
  sheet.setColumnWidth(11, 200); // Notes

  Logger.log("setupSafetyComplianceConfig: Created config with " + crews.length + " crews");
  return sheet;
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
      notes: data[i][10] || ''
    };
  }

  return config;
}

/**
 * Calculates safety compliance for all crews for a given week
 *
 * @param {Date} weekStartDate - The Sunday of the week to calculate
 * @returns {Object} - Compliance data for all crews
 */
function calculateSafetyCompliance(weekStartDate) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var safetySheet = ss.getSheetByName("Safety Reports");

  if (!safetySheet) {
    Logger.log("calculateSafetyCompliance: Safety Reports sheet not found");
    return null;
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

  // Read all Safety Reports data
  var reportData = safetySheet.getDataRange().getValues();

  // Build lookup: jobNumber -> { jhaByDay: [0..6], weeklyMeeting: boolean }
  var crewReports = {};
  for (var c = 0; c < crews.length; c++) {
    crewReports[crews[c]] = {
      jhaByDay: [false, false, false, false, false, false, false], // Sun-Sat
      weeklyMeeting: false
    };
  }

  // Scan Safety Reports for this week
  for (var i = 1; i < reportData.length; i++) {
    var reportDate = reportData[i][0]; // Column A: Report Date
    var reportType = String(reportData[i][1] || '').trim(); // Column B: Report Type
    var jobNumber = String(reportData[i][2] || '').trim(); // Column C: Job Number

    if (!reportDate || !jobNumber) continue;

    // Extract base job number
    var baseJob = jobNumber.split('.')[0];
    if (!crewReports[baseJob]) continue;

    // Check if report is within this week
    var reportDateObj = new Date(reportDate);
    if (reportDateObj < weekBounds.weekStart || reportDateObj > weekBounds.weekEnd) continue;

    var dayOfWeek = reportDateObj.getDay(); // 0=Sun, 6=Sat

    if (reportType === 'JHA' || reportType.indexOf('Job Hazard') !== -1) {
      crewReports[baseJob].jhaByDay[dayOfWeek] = true;
    } else if (reportType === 'Safety Meeting' || reportType.indexOf('Safety Meeting') !== -1) {
      crewReports[baseJob].weeklyMeeting = true;
    }
  }

  // Build compliance data for each crew
  var complianceData = {
    weekStart: weekBounds.weekStart,
    weekEnd: weekBounds.weekEnd,
    isPastDeadline: isPastDeadline,
    crews: {},
    totalCrews: crews.length
  };

  var dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  for (var c = 0; c < crews.length; c++) {
    var crew = crews[c];
    var crewConfig = config[crew] || { skipDays: [true, false, false, false, false, false, true], skipWeeklyMeeting: false };
    var reports = crewReports[crew];
    var foremanResult = lookupForemanByJobNumber(crew);
    var foremanName = (foremanResult && foremanResult.name) ? foremanResult.name : "";

    var crewData = {
      jobNumber: crew,
      foreman: foremanName,
      days: {},
      weeklyMeeting: '',
      status: 'Complete',
      missingItems: []
    };

    // Check each day
    for (var d = 0; d < 7; d++) {
      var dayName = dayNames[d];

      if (crewConfig.skipDays[d]) {
        crewData.days[dayName] = 'N/A';
      } else if (reports.jhaByDay[d]) {
        crewData.days[dayName] = '✅';
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
    } else if (reports.weeklyMeeting) {
      crewData.weeklyMeeting = '✅';
    } else if (isPastDeadline) {
      crewData.weeklyMeeting = '❌';
      crewData.status = 'Missing Reports';
      crewData.missingItems.push('Weekly Meeting');
    } else {
      crewData.weeklyMeeting = '⏳';
      if (crewData.status === 'Complete') crewData.status = 'Pending';
    }

    complianceData.crews[crew] = crewData;
  }

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
  for (var i = 1; i < existingData.length; i++) {
    var existingDate = existingData[i][0];
    var existingJob = String(existingData[i][1] || '').trim();
    if (existingDate && existingJob) {
      var dateStr = Utilities.formatDate(new Date(existingDate), Session.getScriptTimeZone(), "MM/dd/yyyy");
      existingRows[dateStr + '|' + existingJob] = i + 1; // Row number (1-based)
    }
  }

  // Update or insert rows for each crew
  var crewKeys = Object.keys(complianceData.crews);
  for (var c = 0; c < crewKeys.length; c++) {
    var crew = complianceData.crews[crewKeys[c]];
    var rowKey = weekStartStr + '|' + crew.jobNumber;

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
      '', // Monthly Checklist (not implemented yet)
      crew.status,
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
  if (data.length < 2) return;

  // Sort by Week Start (descending - most recent first) then by Job Number
  var dataRows = [];
  for (var i = 1; i < data.length; i++) {
    dataRows.push({ row: i + 1, data: data[i] });
  }

  dataRows.sort(function(a, b) {
    var dateA = new Date(a.data[0]);
    var dateB = new Date(b.data[0]);
    if (dateB.getTime() !== dateA.getTime()) {
      return dateB.getTime() - dateA.getTime(); // Most recent first
    }
    // Same week - sort by job number
    return String(a.data[1]).localeCompare(String(b.data[1]));
  });

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

  // Get existing tasks to avoid duplicates
  var existingData = taskSheet.getDataRange().getValues();
  var existingKeys = {};
  for (var i = 1; i < existingData.length; i++) {
    var taskType = String(existingData[i][3] || '').trim(); // TaskType column
    var notes = String(existingData[i][24] || '').trim(); // Notes column (Y)
    if (taskType === 'Missing Safety Report') {
      existingKeys[notes] = true;
    }
  }

  var tasksCreated = 0;
  var now = new Date();
  var nowStr = Utilities.formatDate(now, Session.getScriptTimeZone(), "MM/dd/yyyy HH:mm");

  for (var jobNumber in complianceData.crews) {
    var crew = complianceData.crews[jobNumber];

    if (crew.status !== 'Missing Reports' || crew.missingItems.length === 0) continue;

    // Build description of what's missing
    var missingJHA = [];
    var missingMeeting = false;

    for (var m = 0; m < crew.missingItems.length; m++) {
      var item = crew.missingItems[m];
      if (item.indexOf('JHA') !== -1) {
        missingJHA.push(item.replace('JHA (', '').replace(')', ''));
      } else if (item === 'Weekly Meeting') {
        missingMeeting = true;
      }
    }

    // Create task key for duplicate checking
    var taskKey = jobNumber + "|" + weekStartStr;
    if (existingKeys[taskKey]) continue;

    // Determine item type (JHA, Weekly Meeting, or both)
    var itemType = '';
    if (missingJHA.length > 0 && missingMeeting) {
      itemType = 'JHA + Weekly Meeting';
    } else if (missingJHA.length > 0) {
      itemType = 'JHA';
    } else if (missingMeeting) {
      itemType = 'Weekly Meeting';
    }

    // Build description
    var description = 'Week of ' + weekStartStr + ': ';
    if (missingJHA.length > 0) {
      description += 'Missing JHA for ' + missingJHA.join(', ');
      if (missingMeeting) description += '; ';
    }
    if (missingMeeting) {
      description += 'Missing Weekly Safety Meeting';
    }

    // Get foreman phone for SMS
    var foremanPhone = lookupForemanPhoneByJobNumber(jobNumber);

    // Create task row
    // Columns: TaskID, SourceSheet, SourceRow, TaskType, ItemType, Employee, Location, PhoneNumber,
    //          DueDate, Priority, EstimatedTime, ScheduledDate, StartTime, EndTime, Status,
    //          CompletedDate, CompletedBy, NotifiedDate, NotifiedMethod, ReminderDates,
    //          CreatedDate, ModifiedDate, ChangeOutDate, ClaimedBy, Notes
    var taskRow = [
      'SafetyCompliance_' + jobNumber + '_' + weekStartStr.replace(/\//g, '-'), // TaskID
      'Safety Compliance',    // SourceSheet
      '',                     // SourceRow (N/A for generated tasks)
      'Missing Safety Report',// TaskType
      itemType,               // ItemType
      crew.foreman || jobNumber, // Employee (foreman name or job number)
      lookupLocationByJobNumber(jobNumber), // Location
      foremanPhone,           // PhoneNumber
      complianceData.weekEnd, // DueDate (Saturday of that week)
      'High',                 // Priority
      15,                     // EstimatedTime (phone call)
      '',                     // ScheduledDate
      '',                     // StartTime
      '',                     // EndTime
      'Pending',              // Status
      '',                     // CompletedDate
      '',                     // CompletedBy
      '',                     // NotifiedDate
      '',                     // NotifiedMethod
      '',                     // ReminderDates
      now,                    // CreatedDate
      now,                    // ModifiedDate
      '',                     // ChangeOutDate
      '',                     // ClaimedBy
      taskKey                 // Notes (used for duplicate detection)
    ];

    taskSheet.appendRow(taskRow);
    tasksCreated++;
    Logger.log("Created missing report task for " + jobNumber + ": " + description);
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
 * Shows the Safety Compliance Dashboard with current week stats and trends
 */
function showComplianceDashboard() {
  var today = new Date();
  var weekBounds = getWeekBoundaries(today);
  var complianceData = calculateSafetyCompliance(weekBounds.weekStart);

  if (!complianceData || !complianceData.crews) {
    Browser.msgBox("❌ Could not calculate compliance data. Make sure Safety Reports and Safety Compliance Config sheets exist.");
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
    html += '<tr>';
    html += '<td><strong>' + crew.jobNumber + '</strong></td>';
    html += '<td>' + (crew.foreman || '-') + '</td>';

    var dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    for (var d = 0; d < dayNames.length; d++) {
      var st = crew.jha[d] || '';
      var cls = st === '✅' ? 'ok' : (st === '❌' ? 'missing' : (st === '⏳' ? 'pending' : 'na'));
      html += '<td class="' + cls + '">' + st + '</td>';
    }

    var mCls = crew.weeklyMeeting === '✅' ? 'ok' : (crew.weeklyMeeting === '❌' ? 'missing' : (crew.weeklyMeeting === '⏳' ? 'pending' : 'na'));
    html += '<td class="' + mCls + '">' + crew.weeklyMeeting + '</td>';
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

