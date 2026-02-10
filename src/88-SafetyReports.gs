/**
 * 88-SafetyReports.gs
 *
 * Gmail integration for processing JHAs, Safety Meetings, and Fleet Checklists
 * Extracts equipment issues (fire extinguishers, hot sticks, rubber goods, etc.)
 * Logs to Safety Reports sheet for tracking and task creation
 *
 * Created: February 4, 2026
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
    Browser.msgBox("❌ Safety Reports sheet not found. Run 'Setup Safety Reports Sheet' first.");
    return { complete: true, error: "Sheet not found" };
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
    '      progressBar.style.background = "linear-gradient(90deg, #34a853, #137333)";' +
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

/**
 * Priority order for job classifications (who is in charge of the crew)
 * Higher priority = more responsible for safety items
 * Note: JRY OP and GTO are equivalent priority
 */
var CLASSIFICATION_PRIORITY = [
  'SUP',      // Superintendent - highest priority
  'GF',       // General Foreman
  'F',        // Foreman
  'GTO F',    // GTO Foreman
  'GTO',      // Gas Tech Operator
  'JRY OP',   // Journey Operator (equal to GTO)
  'AP 7',     // Apprentice 7th year
  'AP 6',     // Apprentice 6th year
  'AP 5',     // Apprentice 5th year
  'AP 4',     // Apprentice 4th year
  'AP 3',     // Apprentice 3rd year
  'AP 2',     // Apprentice 2nd year
  'AP 1'      // Apprentice 1st year - lowest priority
];

/**
 * Gets the priority index for a job classification (lower = higher priority)
 * @param {string} classification - Job classification string
 * @returns {number} - Priority index (0 = highest, 999 = not found)
 */
function getClassificationPriority(classification) {
  if (!classification) return 999;
  var classUpper = String(classification).trim().toUpperCase();

  for (var i = 0; i < CLASSIFICATION_PRIORITY.length; i++) {
    if (classUpper === CLASSIFICATION_PRIORITY[i]) {
      return i;
    }
  }

  // Handle variations (AP7, AP 7, JRYOP, JRY OP, etc.)
  var classNoSpaces = classUpper.replace(/\s+/g, '');
  for (var i = 0; i < CLASSIFICATION_PRIORITY.length; i++) {
    var priority = CLASSIFICATION_PRIORITY[i];
    // Remove spaces for comparison (AP 7 vs AP7, JRY OP vs JRYOP)
    if (classNoSpaces === priority.replace(/\s+/g, '')) {
      return i;
    }
  }

  // GTO and JRY OP are equivalent - if one matches, use that priority
  if (classNoSpaces === 'JRYOP' || classUpper === 'JRY OP') {
    return 5; // Same priority as GTO
  }

  return 999; // Not found in priority list
}

/**
 * Looks up the person in charge of a crew by job number from Employees sheet
 * Uses classification priority: Sup > GF > F > GTO F > GTO > AP7-1
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

  // Fallback to first column for name if not found
  if (nameCol === -1) nameCol = 0;
  if (jobCol === -1 || classCol === -1) return { name: "", jobExists: false };

  // Find all employees for this job number and pick the highest priority
  var bestEmployee = null;
  var bestPriority = 999;
  var jobExists = false;

  for (var i = 1; i < data.length; i++) {
    var empJobNumber = String(data[i][jobCol]).trim();
    var classification = String(data[i][classCol]).trim();
    var empName = data[i][nameCol] || "";

    // Match job number prefix (e.g., "013-26" matches "013-26.1", "013-26.2", etc.)
    if (empJobNumber && empJobNumber.indexOf(jobNumber) === 0) {
      jobExists = true;
      var priority = getClassificationPriority(classification);
      if (priority < bestPriority) {
        bestPriority = priority;
        bestEmployee = empName;
      }
    }
  }

  return { name: bestEmployee || "", jobExists: jobExists };
}

/**
 * Looks up phone number for the person in charge of a crew by job number
 * Uses classification priority: Sup > GF > F > GTO F > GTO > AP7-1
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
  if (jobCol === -1 || classCol === -1 || phoneCol === -1) return "";

  // Find all employees for this job number and pick the highest priority
  var bestPhone = "";
  var bestPriority = 999;

  for (var i = 1; i < data.length; i++) {
    var empJobNumber = String(data[i][jobCol]).trim();
    var classification = String(data[i][classCol]).trim();
    var phone = data[i][phoneCol] || "";

    // Match job number prefix
    if (empJobNumber && empJobNumber.indexOf(jobNumber) === 0) {
      var priority = getClassificationPriority(classification);
      if (priority < bestPriority) {
        bestPriority = priority;
        bestPhone = phone;
      }
    }
  }

  return bestPhone;
}

/**
 * Looks up location for a crew by job number
 * Uses classification priority to find the foreman/lead and get their location
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

  if (jobCol === -1 || classCol === -1 || locationCol === -1) return "";

  // Find all employees for this job number and pick the highest priority
  var bestLocation = "";
  var bestPriority = 999;

  for (var i = 1; i < data.length; i++) {
    var empJobNumber = String(data[i][jobCol]).trim();
    var classification = String(data[i][classCol]).trim();
    var location = data[i][locationCol] || "";

    // Match job number prefix
    if (empJobNumber && empJobNumber.indexOf(jobNumber) === 0) {
      var priority = getClassificationPriority(classification);
      if (priority < bestPriority) {
        bestPriority = priority;
        bestLocation = location;
      }
    }
  }

  return bestLocation;
}

/**
 * Extracts vehicle number from fleet checklist body
 * Supports formats: numeric (578), X# format (X1, X2), and labeled patterns
 *
 * @param {string} body - Email body text
 * @returns {string} - Vehicle number or empty string
 */
function extractVehicleNumber(body) {
  // Try multiple patterns - order matters, more specific first
  var patterns = [
    // X# format (X1, X2, X3, etc.) - spare/extra vehicles
    { regex: /\bX(\d+)\b/i, keepPrefix: true },
    // Labeled patterns
    { regex: /vehicle\s*#?\s*:?\s*(\d+)/i, keepPrefix: false },
    { regex: /truck\s*#?\s*:?\s*(\d+)/i, keepPrefix: false },
    { regex: /unit\s*#?\s*:?\s*(\d+)/i, keepPrefix: false },
    // Generic number with 3-5 digits
    { regex: /#(\d{3,5})/, keepPrefix: false }
  ];

  for (var i = 0; i < patterns.length; i++) {
    var pattern = patterns[i];
    var match = body.match(pattern.regex);
    if (match) {
      if (pattern.keepPrefix) {
        // Return full match for X# format (e.g., "X1" not just "1")
        return match[0].toUpperCase();
      }
      return match[1];
    }
  }

  return "";
}

/**
 * Applies conditional formatting to status column
 *
 * @param {Sheet} sheet - Safety Reports sheet
 * @param {number} startRow - Starting row for new data
 * @param {number} numRows - Number of rows to format
 */
function applyStatusFormatting(sheet, startRow, numRows) {
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
 * Opens the Safety Reports sheet
 */
function openSafetyReports() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("Safety Reports");
  if (sheet) {
    sheet.activate();
  } else {
    Browser.msgBox("❌ Safety Reports sheet not found. Run 'Setup Safety Reports Sheet' first.");
  }
}

/**
 * Resets the batch processing progress
 * Use this if you want to restart processing from the beginning
 */
function resetSafetyEmailBatchProgress() {
  var props = PropertiesService.getScriptProperties();
  props.deleteProperty('SAFETY_BATCH_START');
  Browser.msgBox("✅ Batch progress reset. Next run will start from the beginning.");
  Logger.log("Safety email batch progress reset");
}

/**
 * Creates safety equipment tasks from "Needs Attention" items
 * Adds them to Manual Tasks sheet for scheduling
 */
function createTasksFromSafetyIssues() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var safetySheet = ss.getSheetByName("Safety Reports");
  var manualTasksSheet = ss.getSheetByName("Manual Tasks");

  if (!safetySheet) {
    Browser.msgBox("❌ Safety Reports sheet not found.");
    return;
  }

  if (!manualTasksSheet) {
    Browser.msgBox("❌ Manual Tasks sheet not found.");
    return;
  }

  var data = safetySheet.getDataRange().getValues();
  var tasksCreated = 0;

  // Get existing manual tasks to avoid duplicates
  var manualData = manualTasksSheet.getDataRange().getValues();
  var existingTasks = {};
  for (var i = 1; i < manualData.length; i++) {
    var key = manualData[i][0] + "|" + manualData[i][2]; // Employee + Description
    existingTasks[key] = true;
  }

  // Equipment types to EXCLUDE (vehicle mechanical items - not safety equipment)
  var excludedEquipmentTypes = [
    'wipers', 'horn', 'reflectors', 'warning lights', 'brakes',
    'lights', 'mirrors', 'windshield', 'defrost', 'windows',
    'heater', 'seat belts', 'misc comment', 'tires', 'battery',
    'engine', 'oil', 'transmission', 'clutch', 'alternator',
    'starter', 'radiator', 'suspension', 'exhaust', 'fuel', 'coolant', 'filter'
  ];

  var skippedNoJobNumber = 0;
  var skippedExcludedType = 0;

  for (var i = 1; i < data.length; i++) {
    var status = data[i][7]; // Column H

    if (status === "Needs Attention") {
      var foreman = data[i][3];
      var jobNumber = String(data[i][2] || '').trim();
      var equipmentType = String(data[i][5] || '').trim();
      var description = data[i][6];
      var expirationDate = data[i][8];

      // Skip if no job number (can't determine location for trip planning)
      if (!jobNumber) {
        Logger.log('createTasksFromSafetyIssues: Skipping row ' + (i + 1) + ' - no job number');
        skippedNoJobNumber++;
        continue;
      }

      // Skip excluded equipment types (vehicle mechanical items)
      var equipLower = equipmentType.toLowerCase();
      var isExcluded = false;
      for (var e = 0; e < excludedEquipmentTypes.length; e++) {
        if (equipLower.indexOf(excludedEquipmentTypes[e]) !== -1) {
          isExcluded = true;
          break;
        }
      }
      if (isExcluded) {
        Logger.log('createTasksFromSafetyIssues: Skipping row ' + (i + 1) + ' - excluded equipment type: ' + equipmentType);
        skippedExcludedType++;
        continue;
      }

      // Create task description
      var taskDesc = "🔧 " + equipmentType + " - " + jobNumber + ": " + description;

      // Check for duplicate
      var taskKey = foreman + "|" + taskDesc;
      if (existingTasks[taskKey]) {
        continue; // Skip duplicate
      }

      // Add to Manual Tasks
      var lastRow = manualTasksSheet.getLastRow();
      manualTasksSheet.getRange(lastRow + 1, 1, 1, 11).setValues([[
        foreman,                    // Employee
        jobNumber,                  // Location (using job number)
        taskDesc,                   // Description
        expirationDate || "",       // Scheduled Date
        "",                         // Start Time
        "",                         // End Time
        30,                         // Estimated Time (minutes)
        "Safety Equipment",         // Type
        "Pending",                  // Status
        "",                         // Completed Date
        ""                          // Notes
      ]]);

      tasksCreated++;
    }
  }

  Logger.log('createTasksFromSafetyIssues: Skipped ' + skippedNoJobNumber + ' rows (no job number), ' + skippedExcludedType + ' rows (excluded equipment type)');

  if (tasksCreated > 0) {
    Browser.msgBox("✅ Created " + tasksCreated + " safety equipment tasks in Manual Tasks sheet.");
  } else {
    Browser.msgBox("No new tasks to create. All 'Needs Attention' items already have tasks.");
  }
}

// ============================================================================
// SAFETY REPORT COMPLETION SYNC
// Syncs task completion from Task Metadata to Safety Reports sheet
// ============================================================================

/**
 * Syncs a completed Safety Equipment task to Safety Reports sheet.
 * Updates the Status column to "Resolved" when task is marked complete.
 *
 * @param {string} taskKey - Task key in format "SourceSheet_SourceRow" (e.g., "SafetyReports_5")
 * @returns {Object} - {success: boolean, synced: boolean, error?: string}
 */
function syncSafetyReportCompletion(taskKey) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var taskMetadataSheet = ss.getSheetByName('Task Metadata');
    var safetySheet = ss.getSheetByName('Safety Reports');

    if (!taskMetadataSheet) {
      return { success: false, synced: false, error: 'Task Metadata sheet not found' };
    }
    if (!safetySheet) {
      return { success: false, synced: false, error: 'Safety Reports sheet not found' };
    }

    // Find the task in Task Metadata by TaskID
    var metaData = taskMetadataSheet.getDataRange().getValues();
    var metaHeaders = metaData[0];

    // Find column indices
    var taskIdCol = -1, sourceSheetCol = -1, sourceRowCol = -1;
    for (var h = 0; h < metaHeaders.length; h++) {
      var header = String(metaHeaders[h]).toLowerCase().trim();
      if (header === 'taskid') taskIdCol = h;
      if (header === 'sourcesheet') sourceSheetCol = h;
      if (header === 'sourcerow') sourceRowCol = h;
    }

    if (taskIdCol === -1 || sourceSheetCol === -1 || sourceRowCol === -1) {
      return { success: false, synced: false, error: 'Required columns not found in Task Metadata' };
    }

    // Find the task row
    var sourceRow = -1;
    for (var i = 1; i < metaData.length; i++) {
      if (String(metaData[i][taskIdCol]).trim() === taskKey) {
        var sourceSheet = String(metaData[i][sourceSheetCol]).trim();
        // Check if it's a Safety Reports task
        if (sourceSheet === 'Safety Reports' || sourceSheet === 'SafetyReports') {
          sourceRow = parseInt(metaData[i][sourceRowCol]);
          break;
        } else {
          // Not a Safety Reports task, nothing to sync
          return { success: true, synced: false };
        }
      }
    }

    if (sourceRow <= 0) {
      Logger.log('syncSafetyReportCompletion: Task not found or invalid source row: ' + taskKey);
      return { success: true, synced: false };
    }

    // Update the Safety Reports sheet Status column (H = 8)
    var currentStatus = safetySheet.getRange(sourceRow, 8).getValue();
    if (currentStatus === 'Needs Attention') {
      safetySheet.getRange(sourceRow, 8).setValue('Resolved');
      Logger.log('syncSafetyReportCompletion: Updated Safety Reports row ' + sourceRow + ' to Resolved');
      return { success: true, synced: true };
    } else {
      Logger.log('syncSafetyReportCompletion: Row ' + sourceRow + ' already has status: ' + currentStatus);
      return { success: true, synced: false };
    }

  } catch (e) {
    Logger.log('syncSafetyReportCompletion error: ' + e.toString());
    return { success: false, synced: false, error: e.toString() };
  }
}

/**
 * Syncs ALL completed Safety Equipment tasks from Task Metadata to Safety Reports.
 * Useful for fixing mismatches where tasks were completed but Safety Reports wasn't updated.
 *
 * @returns {Object} - {success: boolean, synced: number, total: number, error?: string}
 */
function syncAllCompletedSafetyTasks() {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var taskMetadataSheet = ss.getSheetByName('Task Metadata');
    var safetySheet = ss.getSheetByName('Safety Reports');

    if (!taskMetadataSheet) {
      return { success: false, synced: 0, total: 0, error: 'Task Metadata sheet not found' };
    }
    if (!safetySheet) {
      return { success: false, synced: 0, total: 0, error: 'Safety Reports sheet not found' };
    }

    var metaData = taskMetadataSheet.getDataRange().getValues();
    var metaHeaders = metaData[0];

    // Find column indices in Task Metadata
    var colMap = {};
    for (var h = 0; h < metaHeaders.length; h++) {
      var header = String(metaHeaders[h]).toLowerCase().trim();
      colMap[header] = h;
    }

    var sourceSheetCol = colMap['sourcesheet'];
    var sourceRowCol = colMap['sourcerow'];
    var statusCol = colMap['status'];
    var taskTypeCol = colMap['tasktype'];

    if (sourceSheetCol === undefined || sourceRowCol === undefined || statusCol === undefined) {
      return { success: false, synced: 0, total: 0, error: 'Required columns not found' };
    }

    // Find all completed Safety Equipment tasks
    var syncedCount = 0;
    var totalFound = 0;

    for (var i = 1; i < metaData.length; i++) {
      var row = metaData[i];
      var sourceSheet = String(row[sourceSheetCol] || '').trim();
      var status = String(row[statusCol] || '').trim();
      var taskType = taskTypeCol !== undefined ? String(row[taskTypeCol] || '').trim() : '';

      // Check if this is a completed Safety Reports task
      var isSafetyReports = (sourceSheet === 'Safety Reports' || sourceSheet === 'SafetyReports');
      var isCompleted = (status === 'Complete' || status === 'Completed');

      if (isSafetyReports && isCompleted) {
        totalFound++;
        var sourceRow = parseInt(row[sourceRowCol]);

        if (sourceRow > 1) {
          // Check current status in Safety Reports sheet
          var currentStatus = safetySheet.getRange(sourceRow, 8).getValue();
          if (currentStatus === 'Needs Attention') {
            safetySheet.getRange(sourceRow, 8).setValue('Resolved');
            syncedCount++;
            Logger.log('syncAllCompletedSafetyTasks: Updated row ' + sourceRow + ' to Resolved');
          }
        }
      }
    }

    Logger.log('syncAllCompletedSafetyTasks: Synced ' + syncedCount + ' of ' + totalFound + ' completed safety tasks');
    return { success: true, synced: syncedCount, total: totalFound };

  } catch (e) {
    Logger.log('syncAllCompletedSafetyTasks error: ' + e.toString());
    return { success: false, synced: 0, total: 0, error: e.toString() };
  }
}

/**
 * Refreshes Safety sheets:
 * 1. Syncs all completed Safety Equipment tasks to Safety Reports (status → Resolved)
 * 2. Recalculates current week's Safety Compliance based on config
 *
 * Called from menu: Glove Manager → Safety Reports → 🔄 Refresh Safety Sheets
 */
function refreshSafetySheets() {
  var results = {
    tasksSynced: 0,
    totalCompleted: 0,
    complianceUpdated: false,
    crewsChecked: 0,
    errors: []
  };

  // Step 1: Sync completed tasks to Safety Reports sheet
  try {
    var syncResult = syncAllCompletedSafetyTasks();
    if (syncResult.success) {
      results.tasksSynced = syncResult.synced;
      results.totalCompleted = syncResult.total;
    } else {
      results.errors.push('Task sync: ' + (syncResult.error || 'Unknown error'));
    }
  } catch (e) {
    results.errors.push('Task sync error: ' + e.toString());
  }

  // Step 2: Recalculate current week's Safety Compliance
  try {
    var today = new Date();
    var weekBounds = getWeekBoundaries(today);
    var complianceData = calculateSafetyCompliance(weekBounds.weekStart);

    if (complianceData && complianceData.crews) {
      updateComplianceSheet(complianceData);
      results.complianceUpdated = true;
      results.crewsChecked = complianceData.totalCrews || Object.keys(complianceData.crews).length;
    }
  } catch (e) {
    results.errors.push('Compliance update error: ' + e.toString());
  }

  // Show summary
  var message = '🔄 Safety Sheets Refreshed\n\n';
  message += '✅ Tasks synced to "Resolved": ' + results.tasksSynced + ' of ' + results.totalCompleted + ' completed\n';

  if (results.complianceUpdated) {
    message += '✅ Compliance updated for ' + results.crewsChecked + ' crews (current week)\n';
  } else {
    message += '⚠️ Compliance update skipped\n';
  }

  if (results.errors.length > 0) {
    message += '\n⚠️ Errors:\n' + results.errors.join('\n');
  }

  Browser.msgBox(message);
  Logger.log('refreshSafetySheets complete: ' + JSON.stringify(results));

  return results;
}

// ============================================================================
// SAFETY COMPLIANCE TRACKING SYSTEM
// JHA (daily) and Weekly Safety Meeting compliance per crew
// Week = Sunday to Saturday, Deadline = Saturday 11:59 PM
// ============================================================================

/**
 * Backfills compliance data for past weeks
 * Useful after rebuilding the Safety Compliance sheet
 *
 * @param {number} weeksBack - Number of past weeks to calculate (default 4)
 */
function backfillComplianceData(weeksBack) {
  weeksBack = weeksBack || 4;

  var today = new Date();
  var tz = Session.getScriptTimeZone();
  var weeksProcessed = 0;

  Logger.log("=== Backfilling compliance data for " + weeksBack + " weeks ===");

  // Start with current week and go backwards
  for (var w = 0; w <= weeksBack; w++) {
    var targetDate = new Date(today);
    targetDate.setDate(today.getDate() - (w * 7));

    var weekBounds = getWeekBoundaries(targetDate);
    var weekStartStr = Utilities.formatDate(weekBounds.weekStart, tz, "MM/dd/yyyy");

    Logger.log("Processing week " + (w + 1) + ": " + weekStartStr);

    try {
      var complianceData = calculateSafetyCompliance(weekBounds.weekStart);
      updateComplianceSheet(complianceData);

      // Create missing report tasks for past weeks
      if (complianceData.isPastDeadline) {
        createMissingReportTasks(complianceData);
      }

      weeksProcessed++;
      Logger.log("  - Processed: " + complianceData.compliantCount + " compliant, " +
                 complianceData.missingCount + " missing out of " + complianceData.totalCrews + " crews");
    } catch (e) {
      Logger.log("  - Error: " + e.toString());
    }
  }

  // Apply formatting
  formatComplianceSheetByWeek();

  Logger.log("=== Backfill complete. Processed " + weeksProcessed + " weeks ===");

  return weeksProcessed;
}

/**
 * Cleans up duplicate rows in Safety Compliance sheet and rebuilds with correct data
 * Call this after fixing date format issues
 */
function rebuildSafetyComplianceSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("Safety Compliance");

  if (!sheet) {
    Browser.msgBox("❌ Safety Compliance sheet not found. Run 'Setup Safety Compliance Sheet' first.");
    return;
  }

  // Clear all data rows (keep header)
  var lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    sheet.deleteRows(2, lastRow - 1);
  }

  Logger.log("Cleared Safety Compliance sheet, rebuilding...");

  // Backfill with correct data
  var weeksProcessed = backfillComplianceData(4);

  Browser.msgBox("✅ Safety Compliance sheet rebuilt!\n\n" +
    "• Deleted all existing rows (they had format issues)\n" +
    "• Regenerated " + weeksProcessed + " weeks of compliance data\n\n" +
    "All dates are now in consistent M/d/yyyy format.");
}

/**
 * Menu function to backfill compliance data after rebuilding the sheet
 */
function menuBackfillComplianceData() {
  var weeksBack = 4; // Process current week + 4 past weeks
  var weeksProcessed = backfillComplianceData(weeksBack);

  Browser.msgBox("✅ Backfill complete!\n\n" +
    "Processed " + weeksProcessed + " weeks of compliance data.\n\n" +
    "The sheet now contains compliance records for the current week and " + weeksBack + " previous weeks.");
}

/**
 * Creates the Safety Compliance tracking sheet for historical data
 */
function setupSafetyComplianceSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("Safety Compliance");

  if (sheet) {
    var response = Browser.msgBox(
      "Safety Compliance sheet already exists",
      "Do you want to recreate it? This will DELETE all existing compliance history.",
      Browser.Buttons.YES_NO
    );
    if (response === "no") return;
    ss.deleteSheet(sheet);
  }

  sheet = ss.insertSheet("Safety Compliance");

  // Set up headers
  var headers = [
    "Week Start", "Week End", "Job Number", "Foreman",
    "JHA Sun", "JHA Mon", "JHA Tue", "JHA Wed", "JHA Thu", "JHA Fri", "JHA Sat",
    "Weekly Meeting", "Monthly Checklist", "Status", "Created Date"
  ];
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.getRange(1, 1, 1, headers.length)
    .setFontWeight("bold")
    .setBackground("#4A86E8")
    .setFontColor("white");
  sheet.setFrozenRows(1);

  // Set column widths
  sheet.setColumnWidth(1, 100);  // Week Start
  sheet.setColumnWidth(2, 100);  // Week End
  sheet.setColumnWidth(3, 90);   // Job Number
  sheet.setColumnWidth(4, 120);  // Foreman
  // JHA columns (5-11)
  for (var i = 5; i <= 11; i++) {
    sheet.setColumnWidth(i, 70);
  }
  sheet.setColumnWidth(12, 100); // Weekly Meeting
  sheet.setColumnWidth(13, 110); // Monthly Checklist
  sheet.setColumnWidth(14, 100); // Status
  sheet.setColumnWidth(15, 110); // Created Date

  // Format dates
  sheet.getRange(2, 1, 1000, 2).setNumberFormat("MM/dd/yyyy");
  sheet.getRange(2, 15, 1000, 1).setNumberFormat("MM/dd/yyyy HH:mm");

  // Add conditional formatting for status icons
  applyComplianceFormatting(sheet);

  Browser.msgBox("✅ Safety Compliance sheet created successfully!");
  Logger.log("Safety Compliance sheet created");
}

/**
 * Creates the Safety Compliance Config sheet for exclusions
 */
function setupSafetyComplianceConfig() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("Safety Compliance Config");

  if (sheet) {
    var response = Browser.msgBox(
      "Safety Compliance Config sheet already exists",
      "Do you want to recreate it? This will reset all exclusion settings.",
      Browser.Buttons.YES_NO
    );
    if (response === "no") return;
    ss.deleteSheet(sheet);
  }

  sheet = ss.insertSheet("Safety Compliance Config");

  // Set up headers
  var headers = [
    "Job Number", "Foreman", "Skip Sun", "Skip Mon", "Skip Tue",
    "Skip Wed", "Skip Thu", "Skip Fri", "Skip Sat", "Skip Weekly Meeting", "Skip Monthly Checklist", "Notes"
  ];
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.getRange(1, 1, 1, headers.length)
    .setFontWeight("bold")
    .setBackground("#34A853")
    .setFontColor("white");
  sheet.setFrozenRows(1);

  // Set column widths
  sheet.setColumnWidth(1, 90);   // Job Number
  sheet.setColumnWidth(2, 120);  // Foreman
  for (var i = 3; i <= 11; i++) {
    sheet.setColumnWidth(i, 75);
  }
  sheet.setColumnWidth(12, 200); // Notes

  // Get active crews and populate
  var crews = getActiveCrews();
  if (crews.length > 0) {
    var rows = [];
    for (var i = 0; i < crews.length; i++) {
      var jobNumber = crews[i];
      var foremanResult = lookupForemanByJobNumber(jobNumber);
      var foreman = foremanResult.name || "";
      // Default: Skip Sun and Sat (weekend), don't skip weekdays, weekly meeting, or monthly checklist
      rows.push([
        jobNumber, foreman,
        true,   // Skip Sun (default checked)
        false,  // Skip Mon
        false,  // Skip Tue
        false,  // Skip Wed
        false,  // Skip Thu
        false,  // Skip Fri
        true,   // Skip Sat (default checked)
        false,  // Skip Weekly Meeting
        false,  // Skip Monthly Checklist
        ""      // Notes
      ]);
    }
    sheet.getRange(2, 1, rows.length, 12).setValues(rows);

    // Add checkboxes for skip columns (C-K = columns 3-11)
    var checkboxRange = sheet.getRange(2, 3, rows.length, 9);
    checkboxRange.insertCheckboxes();
  }

  Browser.msgBox("✅ Safety Compliance Config created with " + crews.length + " crews.\n\n" +
    "Sat/Sun are skipped by default. Uncheck to require JHA on those days.");
  Logger.log("Safety Compliance Config created with " + crews.length + " crews");
}

/**
 * Opens the Safety Compliance Config sheet
 * Creates it first if it doesn't exist
 */
function openComplianceConfig() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("Safety Compliance Config");

  if (!sheet) {
    // Create the sheet if it doesn't exist
    setupSafetyComplianceConfig();
    sheet = ss.getSheetByName("Safety Compliance Config");
  }

  if (sheet) {
    ss.setActiveSheet(sheet);
    SpreadsheetApp.flush();
  }
}

/**
 * Refreshes foreman names in the Safety Compliance Config sheet
 * Preserves all existing checkbox selections
 */
function refreshComplianceConfigForemen() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("Safety Compliance Config");

  if (!sheet) {
    Browser.msgBox("❌ Safety Compliance Config sheet not found. Run 'Configure Exclusions' first.");
    return;
  }

  var data = sheet.getDataRange().getValues();
  var updatedCount = 0;

  for (var i = 1; i < data.length; i++) {
    var jobNumber = String(data[i][0]).trim();
    if (!jobNumber) continue;

    var currentForeman = data[i][1] || "";
    var foremanResult = lookupForemanByJobNumber(jobNumber);
    var newForeman = foremanResult.name || "";

    if (newForeman && newForeman !== currentForeman) {
      sheet.getRange(i + 1, 2).setValue(newForeman);
      updatedCount++;
      Logger.log("Updated foreman for " + jobNumber + ": " + currentForeman + " → " + newForeman);
    }
  }

  if (updatedCount > 0) {
    Browser.msgBox("✅ Updated " + updatedCount + " foreman name(s).\n\nYour checkbox selections have been preserved.");
  } else {
    Browser.msgBox("All foreman names are already up to date.");
  }
}

/**
 * Migrates existing Safety Compliance Config sheet to add missing columns
 * Preserves all existing data and checkbox selections
 */
function migrateComplianceConfig() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("Safety Compliance Config");

  if (!sheet) {
    Browser.msgBox("Safety Compliance Config sheet not found. Use 'Configure Exclusions' to create it.");
    return;
  }

  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var changes = [];

  // Check if "Skip Monthly Checklist" column exists (should be column K = index 10)
  var hasMonthlyChecklist = headers.some(function(h) {
    return String(h).toLowerCase().indexOf('monthly') !== -1;
  });

  // Check if "Skip Weekly Meeting" column exists
  var hasWeeklyMeeting = headers.some(function(h) {
    return String(h).toLowerCase().indexOf('weekly') !== -1;
  });

  // Find the Notes column or last column
  var notesColIndex = -1;
  for (var i = 0; i < headers.length; i++) {
    if (String(headers[i]).toLowerCase() === 'notes') {
      notesColIndex = i;
      break;
    }
  }

  var lastCol = sheet.getLastColumn();
  var lastRow = sheet.getLastRow();

  // Add Skip Weekly Meeting column if missing
  if (!hasWeeklyMeeting) {
    // Insert before Notes column or at end
    var insertCol = notesColIndex >= 0 ? notesColIndex + 1 : lastCol + 1;
    sheet.insertColumnAfter(insertCol - 1);
    sheet.getRange(1, insertCol).setValue("Skip Weekly Meeting");
    sheet.getRange(1, insertCol).setFontWeight("bold").setBackground("#34A853").setFontColor("white");
    sheet.setColumnWidth(insertCol, 75);

    // Add checkboxes (default unchecked)
    if (lastRow > 1) {
      var checkRange = sheet.getRange(2, insertCol, lastRow - 1, 1);
      checkRange.insertCheckboxes();
      checkRange.setValue(false);
    }

    changes.push("Skip Weekly Meeting");
    lastCol++;
    if (notesColIndex >= 0) notesColIndex++;
  }

  // Add Skip Monthly Checklist column if missing
  if (!hasMonthlyChecklist) {
    // Insert before Notes column or at end
    var insertCol = notesColIndex >= 0 ? notesColIndex + 1 : lastCol + 1;
    sheet.insertColumnAfter(insertCol - 1);
    sheet.getRange(1, insertCol).setValue("Skip Monthly Checklist");
    sheet.getRange(1, insertCol).setFontWeight("bold").setBackground("#34A853").setFontColor("white");
    sheet.setColumnWidth(insertCol, 75);

    // Add checkboxes (default unchecked)
    if (lastRow > 1) {
      var checkRange = sheet.getRange(2, insertCol, lastRow - 1, 1);
      checkRange.insertCheckboxes();
      checkRange.setValue(false);
    }

    changes.push("Skip Monthly Checklist");
  }

  if (changes.length > 0) {
    Browser.msgBox("✅ Added missing columns:\n\n• " + changes.join("\n• ") +
      "\n\nAll existing data has been preserved. New columns default to unchecked (not skipped).");
  } else {
    Browser.msgBox("Safety Compliance Config sheet is already up to date. No changes needed.");
  }
}

/**
 * Applies conditional formatting to Safety Compliance sheet
 */
function applyComplianceFormatting(sheet) {
  var dataRange = sheet.getRange(2, 5, 1000, 8); // JHA Sun through Weekly Meeting

  var rules = [];

  // Green for ✅
  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .whenTextEqualTo("✅")
    .setBackground("#D9EAD3")
    .setFontColor("#38761D")
    .setRanges([dataRange])
    .build());

  // Red for ❌
  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .whenTextEqualTo("❌")
    .setBackground("#F4CCCC")
    .setFontColor("#CC0000")
    .setRanges([dataRange])
    .build());

  // Gray for N/A
  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .whenTextEqualTo("N/A")
    .setBackground("#EEEEEE")
    .setFontColor("#999999")
    .setRanges([dataRange])
    .build());

  // Yellow for ⏳ (pending)
  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .whenTextEqualTo("⏳")
    .setBackground("#FFF2CC")
    .setFontColor("#BF9000")
    .setRanges([dataRange])
    .build());

  // Status column formatting
  var statusRange = sheet.getRange(2, 13, 1000, 1);
  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .whenTextContains("Complete")
    .setBackground("#D9EAD3")
    .setFontColor("#38761D")
    .setRanges([statusRange])
    .build());

  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .whenTextContains("Missing")
    .setBackground("#F4CCCC")
    .setFontColor("#CC0000")
    .setRanges([statusRange])
    .build());

  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .whenTextContains("Pending")
    .setBackground("#FFF2CC")
    .setFontColor("#BF9000")
    .setRanges([statusRange])
    .build());

  sheet.setConditionalFormatRules(rules);
}

/**
 * Opens the Safety Compliance sheet (history)
 */
function openComplianceSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("Safety Compliance");

  if (!sheet) {
    setupSafetyComplianceSheet();
    sheet = ss.getSheetByName("Safety Compliance");
  }

  if (sheet) {
    sheet.activate();
  }
}

/**
 * Formats the Safety Compliance sheet with alternating colors by week
 * and separator lines between weeks
 */
function formatComplianceSheetByWeek() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("Safety Compliance");

  if (!sheet) {
    Logger.log("formatComplianceSheetByWeek: Safety Compliance sheet not found");
    return;
  }

  var lastRow = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();

  if (lastRow < 2) {
    Logger.log("formatComplianceSheetByWeek: No data rows to format");
    return;
  }

  // Sort by Week Start descending (most recent first), then by Job Number
  var dataRange = sheet.getRange(2, 1, lastRow - 1, lastCol);
  dataRange.sort([
    {column: 1, ascending: false},  // Week Start descending
    {column: 3, ascending: true}    // Job Number ascending
  ]);

  // Get the data to identify week boundaries
  var data = sheet.getRange(2, 1, lastRow - 1, 1).getValues(); // Column A = Week Start

  // Define alternating colors
  var color1 = '#FFFFFF'; // White
  var color2 = '#E3F2FD'; // Light blue
  var separatorColor = '#1565C0'; // Blue for separator

  var currentWeek = null;
  var colorIndex = 0;
  var weekStartRows = []; // Track where each week starts for separator lines

  for (var i = 0; i < data.length; i++) {
    var weekStart = data[i][0];
    var weekKey = weekStart instanceof Date ? weekStart.toDateString() : String(weekStart);

    if (weekKey !== currentWeek) {
      // New week started
      currentWeek = weekKey;
      colorIndex = 1 - colorIndex; // Toggle between 0 and 1
      if (i > 0) {
        weekStartRows.push(i + 2); // Row number (1-based, +1 for header, +1 for current row)
      }
    }

    // Apply background color to entire row
    var rowNum = i + 2; // +2 for header row and 0-based index
    var rowRange = sheet.getRange(rowNum, 1, 1, lastCol);
    rowRange.setBackground(colorIndex === 0 ? color1 : color2);
  }

  // Add thick blue border between weeks (top border of each new week's first row)
  for (var j = 0; j < weekStartRows.length; j++) {
    var separatorRow = weekStartRows[j];
    var borderRange = sheet.getRange(separatorRow, 1, 1, lastCol);
    borderRange.setBorder(true, null, null, null, null, null, separatorColor, SpreadsheetApp.BorderStyle.SOLID_MEDIUM);
  }

  Logger.log("formatComplianceSheetByWeek: Formatted " + (lastRow - 1) + " rows with " + (weekStartRows.length + 1) + " weeks");
}

/**
 * Menu function to manually reformat the Safety Compliance sheet by week
 */
function reformatSafetyComplianceSheet() {
  formatComplianceSheetByWeek();
  Browser.msgBox("✅ Safety Compliance sheet reformatted!\n\n" +
    "• Sorted by week (most recent first)\n" +
    "• Alternating row colors by week\n" +
    "• Blue separator lines between weeks");
}

/**
 * Gets week boundaries (Sunday to Saturday) for any given date
 *
 * @param {Date} date - Any date within the week
 * @returns {Object} - {weekStart: Date (Sunday 00:00), weekEnd: Date (Saturday 23:59:59)}
 */
function getWeekBoundaries(date) {
  var targetDate = new Date(date);
  var dayOfWeek = targetDate.getDay(); // 0 = Sunday, 6 = Saturday

  // Calculate Sunday of this week (week start)
  var weekStart = new Date(targetDate);
  weekStart.setDate(targetDate.getDate() - dayOfWeek);
  weekStart.setHours(0, 0, 0, 0);

  // Calculate Saturday of this week (week end)
  var weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);
  weekEnd.setHours(23, 59, 59, 999);

  return {
    weekStart: weekStart,
    weekEnd: weekEnd
  };
}

/**
 * Gets all active crews from Employees sheet (unique job numbers)
 *
 * @returns {Array} - Array of job numbers (e.g., ["009-26", "013-26", ...])
 */
function getActiveCrews() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var employeeSheet = ss.getSheetByName("Employees");

  if (!employeeSheet) {
    Logger.log("getActiveCrews: Employees sheet not found");
    return [];
  }

  var data = employeeSheet.getDataRange().getValues();
  var headers = data[0];

  // Find Job Number column
  var jobCol = -1;
  for (var h = 0; h < headers.length; h++) {
    var header = String(headers[h]).toLowerCase().trim();
    if (header === 'job number') {
      jobCol = h;
      break;
    }
  }

  if (jobCol === -1) {
    Logger.log("getActiveCrews: Job Number column not found");
    return [];
  }

  // Extract unique job number prefixes (e.g., "013-26" from "013-26.1")
  var crewsMap = {};
  for (var i = 1; i < data.length; i++) {
    var jobFull = String(data[i][jobCol] || '').trim();
    if (jobFull) {
      // Extract base job number (before the period)
      var baseJob = jobFull.split('.')[0];
      if (baseJob.match(/^\d{3}-\d{2}$/)) {
        crewsMap[baseJob] = true;
      }
    }
  }

  var crews = Object.keys(crewsMap).sort();
  Logger.log("getActiveCrews: Found " + crews.length + " active crews");
  return crews;
}

/**
 * Calculates safety compliance for a specific week by reading Safety Reports sheet
 * Checks which JHAs and Weekly Meetings were received for each crew
 *
 * @param {Date} weekStart - Sunday date for the week
 * @returns {Object} - Compliance data with crews, counts, and isPastDeadline flag
 */
function calculateSafetyCompliance(weekStart) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var safetyReportsSheet = ss.getSheetByName("Safety Reports");

  if (!safetyReportsSheet) {
    Logger.log("calculateSafetyCompliance: Safety Reports sheet not found");
    return null;
  }

  var weekBounds = getWeekBoundaries(weekStart);
  var weekEnd = weekBounds.weekEnd;
  var now = new Date();
  var isPastDeadline = now > weekEnd;

  // Check if this is the first week of the month (for monthly checklist)
  var isFirstWeekOfMonth = weekBounds.weekStart.getDate() <= 7;

  var tz = Session.getScriptTimeZone();
  var weekStartStr = Utilities.formatDate(weekStart, tz, 'MM/dd/yyyy');
  Logger.log("calculateSafetyCompliance for week: " + weekStartStr + ", isPastDeadline: " + isPastDeadline);

  // Load exclusion config
  var config = loadComplianceConfig();

  // Get all active crews
  var activeCrews = getActiveCrews();

  // Initialize crews object
  var crews = {};
  for (var c = 0; c < activeCrews.length; c++) {
    var jobNumber = activeCrews[c];
    var foremanResult = lookupForemanByJobNumber(jobNumber);

    crews[jobNumber] = {
      foreman: foremanResult.name || '',
      jhaSun: 'N/A', // Default to N/A (weekend)
      jhaMon: isPastDeadline ? '❌' : '⏳', // Default missing if past deadline, pending otherwise
      jhaTue: isPastDeadline ? '❌' : '⏳',
      jhaWed: isPastDeadline ? '❌' : '⏳',
      jhaThu: isPastDeadline ? '❌' : '⏳',
      jhaFri: isPastDeadline ? '❌' : '⏳',
      jhaSat: 'N/A', // Default to N/A (weekend)
      weeklyMeeting: isPastDeadline ? '❌' : '⏳',
      monthlyChecklist: isPastDeadline ? '❌' : '⏳', // Required every week now
      status: 'Pending'
    };

    // Apply config exclusions
    var crewConfig = config[jobNumber];
    if (crewConfig) {
      if (crewConfig.skipSun) crews[jobNumber].jhaSun = 'N/A';
      if (crewConfig.skipMon) crews[jobNumber].jhaMon = 'N/A';
      if (crewConfig.skipTue) crews[jobNumber].jhaTue = 'N/A';
      if (crewConfig.skipWed) crews[jobNumber].jhaWed = 'N/A';
      if (crewConfig.skipThu) crews[jobNumber].jhaThu = 'N/A';
      if (crewConfig.skipFri) crews[jobNumber].jhaFri = 'N/A';
      if (crewConfig.skipSat) crews[jobNumber].jhaSat = 'N/A';
      if (crewConfig.skipWeeklyMeeting) crews[jobNumber].weeklyMeeting = 'N/A';
      if (crewConfig.skipMonthlyChecklist) crews[jobNumber].monthlyChecklist = 'N/A';
    }
  }


  // Read Safety Reports sheet to mark received reports
  var data = safetyReportsSheet.getDataRange().getValues();
  var dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  for (var i = 1; i < data.length; i++) {
    var reportDate = data[i][0]; // Column A: Report Date
    var reportType = data[i][1]; // Column B: Report Type
    var jobNumber = String(data[i][2] || '').trim(); // Column C: Job Number

    if (!reportDate || !jobNumber || !crews[jobNumber]) continue;

    var reportDateObj = new Date(reportDate);

    // Check if this report is within the target week
    if (reportDateObj >= weekBounds.weekStart && reportDateObj <= weekBounds.weekEnd) {

      if (reportType === 'JHA' || reportType === 'Job Hazard Report') {
        // Mark the specific day as received
        var dayOfWeek = reportDateObj.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
        var dayName = dayNames[dayOfWeek];
        var jhaKey = 'jha' + dayName;

        if (crews[jobNumber][jhaKey] !== 'N/A') {
          crews[jobNumber][jhaKey] = '✅';
        }
      }
      else if (reportType === 'Safety Meeting' || reportType === 'Weekly Safety Meeting') {
        // Mark weekly meeting as received
        if (crews[jobNumber].weeklyMeeting !== 'N/A') {
          crews[jobNumber].weeklyMeeting = '✅';
        }
      }
      else if (reportType === 'Safety Checklist' || reportType === 'Fleet Checklist') {
        // Mark monthly checklist as received (if it's first week)
        if (isFirstWeekOfMonth && crews[jobNumber].monthlyChecklist !== 'N/A') {
          crews[jobNumber].monthlyChecklist = '✅';
        }
      }
    }
  }

  // Calculate final status for each crew
  var compliantCount = 0;
  var missingCount = 0;

  for (var jobNumber in crews) {
    var crew = crews[jobNumber];
    var hasMissing = false;

    // Check if any required items are missing (❌)
    if (crew.jhaSun === '❌') hasMissing = true;
    if (crew.jhaMon === '❌') hasMissing = true;
    if (crew.jhaTue === '❌') hasMissing = true;
    if (crew.jhaWed === '❌') hasMissing = true;
    if (crew.jhaThu === '❌') hasMissing = true;
    if (crew.jhaf === '❌') hasMissing = true;
    if (crew.jhaSat === '❌') hasMissing = true;
    if (crew.weeklyMeeting === '❌') hasMissing = true;
    if (crew.monthlyChecklist === '❌') hasMissing = true;

    if (isPastDeadline) {
      // Week is over - determine final status
      if (hasMissing) {
        crew.status = 'Missing Reports';
        missingCount++;
      } else {
        crew.status = 'Complete';
        compliantCount++;
      }
    } else {
      // Week is ongoing
      crew.status = 'Pending';
    }
  }

  var totalCrews = Object.keys(crews).length;

  return {
    weekStart: weekBounds.weekStart,
    weekEnd: weekBounds.weekEnd,
    isPastDeadline: isPastDeadline,
    crews: crews,
    totalCrews: totalCrews,
    compliantCount: compliantCount,
    missingCount: missingCount
  };
}

/**
 * Loads Safety Compliance Config sheet settings
 *
 * @returns {Object} - Map of job numbers to config settings
 */
function loadComplianceConfig() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var configSheet = ss.getSheetByName("Safety Compliance Config");

  if (!configSheet) {
    Logger.log("loadComplianceConfig: Config sheet not found, using defaults");
    return {};
  }

  var data = configSheet.getDataRange().getValues();
  var config = {};

  // Skip header row (row 0)
  for (var i = 1; i < data.length; i++) {
    var jobNumber = String(data[i][0] || '').trim();
    if (jobNumber) {
      config[jobNumber] = {
        skipSun: data[i][2] === true,
        skipMon: data[i][3] === true,
        skipTue: data[i][4] === true,
        skipWed: data[i][5] === true,
        skipThu: data[i][6] === true,
        skipFri: data[i][7] === true,
        skipSat: data[i][8] === true,
        skipWeeklyMeeting: data[i][9] === true,
        skipMonthlyChecklist: data[i][10] === true
      };
    }
  }

  return config;
}

/**
 * Updates Safety Compliance sheet with compliance data for a week
 *
 * @param {Object} complianceData - Output from calculateSafetyCompliance()
 */
function updateComplianceSheet(complianceData) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("Safety Compliance");

  if (!sheet) {
    Logger.log("updateComplianceSheet: Safety Compliance sheet not found");
    return;
  }

  var tz = Session.getScriptTimeZone();
  var weekStartStr = Utilities.formatDate(complianceData.weekStart, tz, 'M/d/yyyy');
  Logger.log("updateComplianceSheet for week: " + weekStartStr);

  var data = sheet.getDataRange().getValues();
  var now = new Date();

  // Update existing rows or append new rows
  for (var jobNumber in complianceData.crews) {
    var crew = complianceData.crews[jobNumber];

    // Find existing row for this job/week
    var rowIndex = -1;
    for (var i = 1; i < data.length; i++) {
      var rowWeekStart = String(data[i][0]).trim();
      var rowJobNumber = String(data[i][2]).trim();

      if (rowWeekStart === weekStartStr && rowJobNumber === jobNumber) {
        rowIndex = i + 1; // Convert to 1-based row number
        break;
      }
    }

    var rowData = [
      Utilities.formatDate(complianceData.weekStart, tz, 'M/d/yyyy'), // A: Week Start (date only)
      Utilities.formatDate(complianceData.weekEnd, tz, 'M/d/yyyy'), // B: Week End (date only)
      jobNumber, // C: Job Number
      crew.foreman, // D: Foreman
      crew.jhaSun || '', // E: JHA Sun
      crew.jhaMon || '', // F: JHA Mon
      crew.jhaTue || '', // G: JHA Tue
      crew.jhaWed || '', // H: JHA Wed
      crew.jhaThu || '', // I: JHA Thu
      crew.jhaFri || '', // J: JHA Fri
      crew.jhaSat || '', // K: JHA Sat
      crew.weeklyMeeting || '', // L: Weekly Meeting
      crew.monthlyChecklist || '', // M: Monthly Checklist
      crew.status || 'Pending', // N: Status
      now // O: Created Date
    ];

    if (rowIndex > 0) {
      // Update existing row
      sheet.getRange(rowIndex, 1, 1, rowData.length).setValues([rowData]);
      Logger.log("Updated row " + rowIndex + " for " + jobNumber);
    } else {
      // Append new row
      sheet.appendRow(rowData);
      Logger.log("Appended new row for " + jobNumber);
    }
  }

  Logger.log("updateComplianceSheet complete");
}

/**
 * Finalizes the PREVIOUS work week only (not all past weeks).
 * Updates status to "Complete" or "Missing Reports" and creates tasks for that week.
 * Tasks for older weeks are NOT created - those should be archived.
 *
 * Previous week = the Sunday-Saturday that ended most recently
 * Current week = the Sunday-Saturday we are currently in
 *
 * @returns {Object} - {weeksFinalized: number, tasksCreated: number, previousWeekStart: string}
 */
function finalizePastWeeksCompliance() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var complianceSheet = ss.getSheetByName("Safety Compliance");

  if (!complianceSheet) {
    Logger.log("finalizePastWeeksCompliance: Safety Compliance sheet not found");
    return { weeksFinalized: 0, tasksCreated: 0 };
  }

  var now = new Date();
  var dayOfWeek = now.getDay(); // 0 = Sunday

  // Calculate PREVIOUS work week boundaries
  // Current week starts on Sunday
  var currentWeekStart = new Date(now);
  currentWeekStart.setDate(now.getDate() - dayOfWeek);
  currentWeekStart.setHours(0, 0, 0, 0);

  // Previous week is 7 days before current week
  var previousWeekStart = new Date(currentWeekStart);
  previousWeekStart.setDate(currentWeekStart.getDate() - 7);

  var previousWeekEnd = new Date(currentWeekStart);
  previousWeekEnd.setDate(currentWeekStart.getDate() - 1); // Saturday
  previousWeekEnd.setHours(23, 59, 59, 999);

  Logger.log("finalizePastWeeksCompliance: Previous week is " +
    Utilities.formatDate(previousWeekStart, Session.getScriptTimeZone(), "MM/dd/yyyy") + " to " +
    Utilities.formatDate(previousWeekEnd, Session.getScriptTimeZone(), "MM/dd/yyyy"));

  var data = complianceSheet.getDataRange().getValues();
  var weeksFinalized = 0;
  var totalTasksCreated = 0;

  // Find the row for the PREVIOUS week only
  for (var i = 1; i < data.length; i++) {
    var weekStart = data[i][0]; // Column A: Week Start
    var status = data[i][13];   // Column N: Status

    if (!weekStart) continue;

    var rowWeekStart = new Date(weekStart);
    rowWeekStart.setHours(0, 0, 0, 0);

    // Check if this row is for the PREVIOUS week
    var prevWeekStartTime = previousWeekStart.getTime();
    var rowWeekStartTime = rowWeekStart.getTime();

    // Match by comparing week start dates (within 1 day tolerance for timezone issues)
    var dayDiff = Math.abs(prevWeekStartTime - rowWeekStartTime) / (1000 * 60 * 60 * 24);

    if (dayDiff < 1) {
      Logger.log("Found previous week row: " + Utilities.formatDate(rowWeekStart, Session.getScriptTimeZone(), "MM/dd/yyyy"));

      // Only process if status is still Pending or Missing Reports
      if (status === 'Pending' || status === 'Missing Reports') {
        // Recalculate compliance for previous week
        var complianceData = calculateSafetyCompliance(previousWeekStart);

        if (complianceData) {
          // Update the compliance sheet
          updateComplianceSheet(complianceData);

          // Create tasks for missing reports (only for previous week)
          var tasksCreated = createMissingReportTasks(complianceData);
          totalTasksCreated = tasksCreated;
          weeksFinalized = 1;

          Logger.log("Finalized previous week " +
            Utilities.formatDate(previousWeekStart, Session.getScriptTimeZone(), "MM/dd/yyyy") +
            " - Created " + tasksCreated + " tasks");
        }
      } else {
        Logger.log("Previous week already finalized with status: " + status);
      }

      break; // Only process the previous week, not others
    }
  }

  Logger.log("finalizePastWeeksCompliance: Finalized " + weeksFinalized + " week(s), created " + totalTasksCreated + " tasks");
  return {
    weeksFinalized: weeksFinalized,
    tasksCreated: totalTasksCreated,
    previousWeekStart: Utilities.formatDate(previousWeekStart, Session.getScriptTimeZone(), "MM/dd/yyyy")
  };
}

/**
 * Menu function to manually finalize past weeks
 */
function menuFinalizePastWeeks() {
  var result = finalizePastWeeksCompliance();

  if (result.weeksFinalized > 0) {
    Browser.msgBox("✅ Finalized " + result.weeksFinalized + " past week(s).\n\n" +
                   "Created " + result.tasksCreated + " missing report task(s).");
  } else {
    Browser.msgBox("All past weeks are already finalized.");
  }
}

/**
 * Creates missing safety report tasks in Task Metadata.
 * Combines all missing items for a crew/week into ONE task.
 *
 * @param {Object} complianceData - Compliance data from calculateSafetyCompliance()
 * @returns {number} - Number of tasks created
 */
function createMissingReportTasks(complianceData) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var taskMetaSheet = ss.getSheetByName('Task Metadata');
  var employeesSheet = ss.getSheetByName('Employees');

  if (!taskMetaSheet || !employeesSheet) {
    Logger.log('createMissingReportTasks: Required sheets not found');
    return 0;
  }

  // Get foreman phone numbers
  var empData = employeesSheet.getDataRange().getValues();
  var empHeaders = empData[0];
  var nameCol = -1, phoneCol = -1, locationCol = -1;
  for (var h = 0; h < empHeaders.length; h++) {
    var header = String(empHeaders[h]).toLowerCase().trim();
    if (header === 'name') nameCol = h;
    if (header === 'phone') phoneCol = h;
    if (header === 'location') locationCol = h;
  }

  var phoneMap = {};
  var locationMap = {};
  for (var i = 1; i < empData.length; i++) {
    var name = String(empData[i][nameCol]).trim().toLowerCase();
    if (name && phoneCol >= 0) {
      phoneMap[name] = String(empData[i][phoneCol]).trim();
    }
    if (name && locationCol >= 0) {
      locationMap[name] = String(empData[i][locationCol]).trim();
    }
  }

  var tasksCreated = 0;
  var now = new Date();
  var weekEnd = complianceData.weekEnd;

  // Process each crew
  for (var jobNumber in complianceData.crews) {
    var crew = complianceData.crews[jobNumber];
    if (crew.status === 'Complete' || crew.status === 'N/A') continue;

    var foreman = crew.foreman;
    var foremanKey = foreman ? foreman.toLowerCase().trim() : '';
    var phone = phoneMap[foremanKey] || '';
    var location = locationMap[foremanKey] || '';

    // Collect all missing items
    var missingJHAs = [];
    var missingWeekly = false;
    var missingMonthly = false;

    // Check JHA columns (Mon-Fri, skip Sun/Sat)
    var dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    for (var d = 1; d <= 5; d++) { // Monday = 1, Friday = 5
      var jhaStatus = crew['jha' + dayNames[d]];
      if (jhaStatus === '❌' || jhaStatus === 'Missing') {
        // Calculate the actual date for this day
        var dayDate = new Date(complianceData.weekStart);
        dayDate.setDate(dayDate.getDate() + d);
        missingJHAs.push(Utilities.formatDate(dayDate, Session.getScriptTimeZone(), 'MM/dd/yyyy'));
      }
    }

    // Check Weekly Meeting
    if (crew.weeklyMeeting === '❌' || crew.weeklyMeeting === 'Missing') {
      missingWeekly = true;
    }

    // NOTE: Monthly Checklist is tracked but does NOT create tasks
    // Only JHAs and Weekly Meeting create tasks for the Task List

    // Skip if nothing is missing (only check JHAs and Weekly Meeting)
    if (missingJHAs.length === 0 && !missingWeekly) continue;

    // Build itemType (exclude Monthly Checklist)
    var itemTypeParts = [];
    if (missingJHAs.length > 0) itemTypeParts.push('JHA');
    if (missingWeekly) itemTypeParts.push('Weekly Meeting');
    var itemType = itemTypeParts.join(' + ');

    // Build notes with specific missing dates (exclude Monthly Checklist)
    var notesParts = [];
    if (missingJHAs.length > 0) {
      notesParts.push('Missing JHA: ' + missingJHAs.join(', '));
    }
    if (missingWeekly) {
      var weekStartStr = Utilities.formatDate(complianceData.weekStart, Session.getScriptTimeZone(), 'MM/dd/yyyy');
      notesParts.push('Missing Weekly Safety Meeting for week of ' + weekStartStr);
    }
    var notes = notesParts.join('; ');

    // Check if task already exists for this crew/week
    var taskId = 'SafetyCompliance_' + jobNumber + '_' + Utilities.formatDate(complianceData.weekStart, Session.getScriptTimeZone(), 'yyyy-MM-dd');
    var existingData = taskMetaSheet.getDataRange().getValues();
    var taskExists = false;
    for (var r = 1; r < existingData.length; r++) {
      if (existingData[r][0] === taskId) {
        taskExists = true;
        break;
      }
    }

    if (taskExists) {
      Logger.log('Task already exists: ' + taskId);
      continue;
    }

    // Create task record - using the last day of the week (Saturday) as due date
    var dueDate = new Date(weekEnd);

    var taskRow = [
      taskId,                           // A: TaskID
      'Safety Compliance',              // B: SourceSheet
      '',                               // C: SourceRow (not applicable)
      foreman,                          // D: Employee (foreman name)
      'Missing Safety Report',          // E: TaskType
      itemType,                         // F: ItemType
      '',                               // G: CurrentItem
      location,                         // H: Location
      foreman,                          // I: Foreman
      phone,                            // J: PhoneNumber
      dueDate,                          // K: DueDate (Saturday of the week)
      '',                               // L: ScheduledDate
      '',                               // M: StartTime
      '',                               // N: EndTime
      'Pending',                        // O: Status
      '',                               // P: NotifiedDate
      '',                               // Q: ScheduledClassDate
      '',                               // R: ClassType
      true,                             // S: IsOffice (phone call)
      false,                            // T: IsRegistered
      false,                            // U: IsDeclined
      '',                               // V: CompletedDate
      notes,                            // W: Notes
      now,                              // X: CreatedDate
      now                               // Y: LastModified
    ];

    taskMetaSheet.appendRow(taskRow);
    tasksCreated++;
    Logger.log('Created missing report task for ' + foreman + ' (' + jobNumber + '): ' + itemType);
  }

  Logger.log('createMissingReportTasks: Created ' + tasksCreated + ' tasks');
  return tasksCreated;
}

/**
 * Builds SMS message for missing safety reports (JHAs and Weekly Meeting only)
 *
 * @param {Object} task - Task object with itemType and notes
 * @returns {string} - SMS message text
 */
function buildMissingSafetyReportSmsMessage(task) {
  var itemType = task.itemType || task.ItemType || "";
  var notes = task.notes || task.Notes || "";

  // Extract dates from notes (only JHAs and Weekly Meeting)
  var jhaDateMatch = notes.match(/Missing JHA:\s*([^;]+)/);
  var weekOfMatch = notes.match(/week of\s+(\d{2}\/\d{2}\/\d{4})/i);

  var jhaDates = jhaDateMatch ? jhaDateMatch[1].trim() : "";
  var weekOf = weekOfMatch ? weekOfMatch[1] : "";

  // Parse JHA dates
  var jhaDateArray = jhaDates ? jhaDates.split(',').map(function(d) { return d.trim(); }) : [];
  var allWorkDays = jhaDateArray.length === 5; // Mon-Fri = 5 days

  var message = "";

  // Build opening (only JHAs and Weekly Meeting)
  var missingItems = [];
  if (jhaDateArray.length > 0) missingItems.push("JHA" + (jhaDateArray.length > 1 ? "s" : ""));
  if (weekOf) missingItems.push("Weekly Safety Meeting");

  if (missingItems.length === 0) {
    return "We did not receive a safety report from your crew. This is just a reminder not to miss them this week. Was there an issue turning them in that you need help with?";
  }

  var itemsList = missingItems.join(" or ");

  // Build message based on whether it's the entire week or specific days
  if (allWorkDays && weekOf) {
    // Missing entire week
    message = "We did not receive " + itemsList + " from your crew for the entire week of " + weekOf + ". This is just a reminder not to miss them this week. Was there an issue turning them in that you need help with?";
  } else {
    // Missing specific days
    message = "We did not receive " + itemsList + " from your crew";
    if (weekOf) {
      message += " for the week of " + weekOf;
    }
    message += ". ";

    // Add specific missing dates (only JHAs and Weekly Meeting)
    var detailParts = [];
    if (jhaDateArray.length > 0) {
      if (jhaDateArray.length <= 3) {
        // List specific dates if 3 or fewer
        detailParts.push("JHA - " + jhaDateArray.join(", "));
      } else {
        // Just say how many if more than 3
        detailParts.push("JHA (" + jhaDateArray.length + " days)");
      }
    }
    if (weekOf) {
      detailParts.push("Safety Meeting - " + weekOf);
    }

    if (detailParts.length > 0) {
      message += "Here are the items we are missing: " + detailParts.join(". ") + ". ";
    }

    message += "This is just a reminder not to miss them this week. Was there an issue turning them in that you need help with?";
  }

  return message;
}


/**
 * Gets missing safety report tasks from PREVIOUS work week only (not current week)
 * Returns tasks from Task Metadata where TaskType = "Missing Safety Report"
 *
 * Previous week = last Sunday to last Saturday
 * Current week = this Sunday to this Saturday (excluded)
 *
 * @returns {Array} - Array of missing safety report task objects from previous week
 */
function getMissingSafetyReportTasks() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var taskSheet = ss.getSheetByName("Task Metadata");

  if (!taskSheet || taskSheet.getLastRow() < 2) {
    Logger.log("getMissingSafetyReportTasks: Task Metadata sheet not found or empty");
    return [];
  }

  // Calculate previous work week boundaries
  var today = new Date();
  var dayOfWeek = today.getDay(); // 0 = Sunday

  // Current week start (this Sunday)
  var currentWeekStart = new Date(today);
  currentWeekStart.setDate(today.getDate() - dayOfWeek);
  currentWeekStart.setHours(0, 0, 0, 0);

  // Previous week start (last Sunday)
  var previousWeekStart = new Date(currentWeekStart);
  previousWeekStart.setDate(currentWeekStart.getDate() - 7);

  // Previous week end (last Saturday)
  var previousWeekEnd = new Date(currentWeekStart);
  previousWeekEnd.setDate(currentWeekStart.getDate() - 1);
  previousWeekEnd.setHours(23, 59, 59, 999);

  Logger.log("getMissingSafetyReportTasks - Previous week: " + previousWeekStart.toDateString() + " to " + previousWeekEnd.toDateString());

  var data = taskSheet.getDataRange().getValues();
  var headers = data[0];

  // Find column indices
  var colIndices = {};
  for (var i = 0; i < headers.length; i++) {
    colIndices[headers[i]] = i;
  }

  var tasks = [];

  // Scan for Missing Safety Report tasks from previous week
  for (var row = 1; row < data.length; row++) {
    var taskType = data[row][colIndices['TaskType']];
    var status = data[row][colIndices['Status']];
    var createdDate = data[row][colIndices['CreatedDate']];

    if (taskType === "Missing Safety Report" && createdDate) {
      // Check if task was created during previous week
      var taskCreated = new Date(createdDate);

      if (taskCreated >= previousWeekStart && taskCreated <= previousWeekEnd) {
        var task = {
          taskId: data[row][colIndices['TaskID']],
          sourceSheet: data[row][colIndices['SourceSheet']],
          sourceRow: data[row][colIndices['SourceRow']],
          employee: data[row][colIndices['Employee']] || '',
          taskType: taskType,
          itemType: data[row][colIndices['ItemType']] || '',
          location: data[row][colIndices['Location']] || '',
          foreman: data[row][colIndices['Foreman']] || '',
          phoneNumber: data[row][colIndices['PhoneNumber']] || '',
          dueDate: data[row][colIndices['DueDate']] || '',
          scheduledDate: data[row][colIndices['ScheduledDate']] || '',
          startTime: data[row][colIndices['StartTime']] || '',
          endTime: data[row][colIndices['EndTime']] || '',
          status: status,
          notes: data[row][colIndices['Notes']] || '',
          createdDate: createdDate,
          completedDate: data[row][colIndices['CompletedDate']] || '',
          lastModified: data[row][colIndices['LastModified']] || '',
          rowNumber: row + 1,
          completed: status === 'Complete'
        };

        tasks.push(task);
      }
    }
  }

  Logger.log("getMissingSafetyReportTasks: Found " + tasks.length + " tasks from previous week");
  return tasks;
}

/**
 * Marks a missing safety report task as complete with notes explaining why it wasn't received
 *
 * @param {string} taskId - The Task ID from Task Metadata
 * @param {string} resolutionNotes - Notes explaining why the report wasn't received
 * @returns {boolean} - Success status
 */
function completeMissingSafetyReportTask(taskId, resolutionNotes) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var taskSheet = ss.getSheetByName("Task Metadata");

  if (!taskSheet) {
    throw new Error("Task Metadata sheet not found");
  }

  var data = taskSheet.getDataRange().getValues();
  var headers = data[0];

  // Find column indices
  var colIndices = {};
  for (var i = 0; i < headers.length; i++) {
    colIndices[headers[i]] = i;
  }

  // Find the task by TaskID
  for (var row = 1; row < data.length; row++) {
    if (data[row][colIndices['TaskID']] === taskId) {
      var rowNum = row + 1;
      var now = new Date();

      // Update Status, CompletedDate, LastModified
      taskSheet.getRange(rowNum, colIndices['Status'] + 1).setValue('Complete');
      taskSheet.getRange(rowNum, colIndices['CompletedDate'] + 1).setValue(now);
      taskSheet.getRange(rowNum, colIndices['LastModified'] + 1).setValue(now);

      // Append resolution notes to existing notes
      var existingNotes = data[row][colIndices['Notes']] || '';
      var separator = existingNotes ? '\n\n' : '';
      var updatedNotes = existingNotes + separator + '=== RESOLUTION ===\n' + resolutionNotes + '\n(Completed: ' + Utilities.formatDate(now, Session.getScriptTimeZone(), 'MM/dd/yyyy hh:mm a') + ')';
      taskSheet.getRange(rowNum, colIndices['Notes'] + 1).setValue(updatedNotes);

      Logger.log("Completed missing safety report task: " + taskId);
      Logger.log("Resolution: " + resolutionNotes);
      return true;
    }
  }

  Logger.log("Task not found: " + taskId);
  return false;
}
