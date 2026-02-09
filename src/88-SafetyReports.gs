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
  var afterDateFilter = '';

  if (newOnlyMode && lastProcessedDate && batchStart === 0) {
    // Use after: filter to only get emails newer than last processed
    // Format: YYYY/MM/DD
    afterDateFilter = ' after:' + lastProcessedDate;
    Logger.log('New-only mode: filtering emails after ' + lastProcessedDate);
  }

  // Search queries for different report types
  // Search by subject only (works for both original and forwarded emails)
  var baseQueries = [
    'subject:"Job Hazard Report"',
    'subject:"Safety Meeting Report"',
    'subject:"Weekly Safety Repairs"',
    'subject:"Safety Checklist Report"'
  ];

  // Build queries with date filters
  var queries = baseQueries.map(function(q) {
    if (afterDateFilter) {
      return q + afterDateFilter;
    }
    return q + ' newer_than:' + daysBack + 'd';
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
      if (parsed && parsed.issues.length > 0) {
        issues = issues.concat(parsed.issues);
        processedCount++;
      }
    });
  });

  if (issues.length > 0) {
    var lastRow = sheet.getLastRow();
    sheet.getRange(lastRow + 1, 1, issues.length, 12).setValues(issues);

    // Apply conditional formatting for status
    applyStatusFormatting(sheet, lastRow + 1, issues.length);
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
        result.compliance.crews.push({
          jobNumber: jobNumber,
          foreman: crew.foreman,
          jha: crew.jha,
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
    ? lastProcessedTimestamp.replace(/\//g, '-')
    : (lastProcessedDate ? lastProcessedDate.replace(/\//g, '-') : 'Never');

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
    '<div id="status" class="status" style="display:none;"></div>' +
    '<div id="complianceSection" class="compliance-section" style="display:none;"></div>' +
    '<div class="warning">⚠️ Safety Checklist PDFs take ~5-10 seconds each to extract. Processing in batches of 50.</div>' +
    '<script>' +
    'var currentDays = 7;' +
    'var newOnlyMode = true;' +
    'function processEmails() {' +
    '  var btn = document.getElementById("processBtn");' +
    '  var status = document.getElementById("status");' +
    '  var days = parseInt(document.getElementById("daysBack").value);' +
    '  newOnlyMode = document.getElementById("newOnlyMode").checked;' +
    '  currentDays = days;' +
    '  btn.disabled = true;' +
    '  btn.textContent = "Processing Batch...";' +
    '  status.style.display = "block";' +
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
    '  var btn = document.getElementById("processBtn");' +
    '  var status = document.getElementById("status");' +
    '  if (result.complete) {' +
    '    var modeInfo = result.newOnlyMode ? " (new only since " + result.lastProcessedDate + ")" : "";' +
    '    status.innerHTML = ' +
    '      "✅ <span class=\\"progress\\">All Complete!</span>" + modeInfo + "<br>" +' +
    '      "<div class=\\"info\\">Total emails found: " + result.totalThreads + "</div>" +' +
    '      "<div class=\\"info\\">Processed: " + result.processedThisBatch + " | Skipped (duplicates): " + result.skippedThisBatch + "</div>" +' +
    '      "<div class=\\"info\\">Equipment issues found: " + result.issuesThisBatch + "</div>";' +
    '    if (result.compliance) {' +
    '      showComplianceGrid(result.compliance);' +
    '    }' +
    '    btn.className = "success";' +
    '    btn.textContent = "Close";' +
    '    btn.disabled = false;' +
    '    btn.onclick = function() { google.script.host.close(); };' +
    '  } else {' +
    '    status.innerHTML = ' +
    '      "📊 <span class=\\"progress\\">Batch " + result.batchNumber + " of " + result.totalBatches + " Complete</span><br>" +' +
    '      "<div class=\\"info\\">Progress: " + result.threadsProcessed + " / " + result.totalThreads + " emails</div>" +' +
    '      "<div class=\\"info\\">This batch: " + result.processedThisBatch + " processed, " + result.skippedThisBatch + " skipped, " + result.issuesThisBatch + " issues</div>" +' +
    '      "<div class=\\"info\\">Remaining: " + result.threadsRemaining + " emails</div>";' +
    '    btn.textContent = "Continue Processing (" + result.threadsRemaining + " left)";' +
    '    btn.disabled = false;' +
    '    btn.onclick = function() { processEmails(); };' +
    '  }' +
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
 * Parses safety email and extracts equipment issues
 *
 * @param {GmailMessage} message - Gmail message object
 * @returns {Object} - {issues: [[row data]]}
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
      var jobMatch = subject.match(/(\d{3}-\d{2})/);
      jobNumber = jobMatch ? jobMatch[1] : "";

    } else if (subject.indexOf("Safety Meeting Report") !== -1) {
      reportType = "Safety Meeting";
      var jobMatch = subject.match(/(\d{3}-\d{2})/);
      jobNumber = jobMatch ? jobMatch[1] : "";

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

    // Lookup foreman by job number - also validates job exists on Employee sheet
    var foremanResult = lookupForemanByJobNumber(jobNumber);
    var foreman = foremanResult.name || "";

    // Skip reports for job numbers not on the Employee sheet
    if (jobNumber && !foremanResult.jobExists) {
      Logger.log("Skipping report - Job " + jobNumber + " not found on Employees sheet");
      return { issues: [], skippedReason: "Job not on Employee sheet" };
    }

    // Extract equipment issues based on report type
    var issues = [];

    if (reportType === "Safety Checklist") {
      // Parse Safety Checklist PDF content
      issues = extractSafetyChecklistIssues(fullText, {
        date: reportDate,
        reportType: reportType,
        jobNumber: jobNumber,
        foreman: foreman,
        vehicleNumber: vehicleNumber,
        messageId: messageId,
        subject: subject
      });
    } else {
      // Extract equipment issues from email body + PDF content
      issues = extractEquipmentIssues(fullText, {
        date: reportDate,
        reportType: reportType,
        jobNumber: jobNumber,
        foreman: foreman,
        vehicleNumber: vehicleNumber,
        messageId: messageId,
        subject: subject
      });
    }

    Logger.log("Parsed " + reportType + " - Job: " + jobNumber + " - Issues: " + issues.length);
    return { issues: issues };

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
          context.date,                    // A: Report Date
          context.reportType,              // B: Report Type
          context.jobNumber,               // C: Job Number
          context.foreman,                 // D: Foreman
          context.vehicleNumber,           // E: Vehicle Number
          equipmentType,                   // F: Equipment Type
          description,                     // G: Issue Description
          "Needs Attention",               // H: Status
          "",                              // I: FE Test Date (only for fire extinguisher)
          context.messageId,               // J: Source Email ID
          "",                              // K: Notes
          context.subject || ""            // L: Email Subject
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
 * Extracts report date and job number from email subject line
 *
 * JHA format: "Job Hazard Report  MM-DD-YYYY_XXX-XX_..."
 * Weekly Meeting format: "Safety Meeting Report  Week of MM-DD-YYYY Safety Topic XXX-XX"
 *
 * @param {string} subject - Email subject line
 * @param {string} reportType - "JHA" or "Safety Meeting"
 * @returns {Object|null} - {reportDate: Date, jobNumber: string} or null
 */
function extractReportDateFromSubject(subject, reportType) {
  try {
    if (!subject) return null;

    var jobMatch = subject.match(/(\d{3}-\d{2})/);
    var jobNumber = jobMatch ? jobMatch[1] : "";

    if (reportType === "JHA") {
      // Format: Job Hazard Report  02-04-2026_009-26_...
      var dateMatch = subject.match(/Job Hazard Report\s+(\d{2})-(\d{2})-(\d{4})/i);
      if (dateMatch) {
        var month = parseInt(dateMatch[1], 10);
        var day = parseInt(dateMatch[2], 10);
        var year = parseInt(dateMatch[3], 10);
        return {
          reportDate: new Date(year, month - 1, day),
          jobNumber: jobNumber
        };
      }
    } else if (reportType === "Safety Meeting") {
      // Format: Safety Meeting Report  Week of 02-02-2026 Safety Topic 015-26
      var weekMatch = subject.match(/Week of\s+(\d{2})-(\d{2})-(\d{4})/i);
      if (weekMatch) {
        var month = parseInt(weekMatch[1], 10);
        var day = parseInt(weekMatch[2], 10);
        var year = parseInt(weekMatch[3], 10);
        return {
          reportDate: new Date(year, month - 1, day),
          jobNumber: jobNumber
        };
      }
    }

    return null;
  } catch (e) {
    Logger.log("Error extracting date from subject: " + e.toString());
    return null;
  }
}

/**
 * Gets the week boundaries (Sunday to Saturday) for a given date
 *
 * @param {Date} date - Any date within the week
 * @returns {Object} - {weekStart: Date (Sunday), weekEnd: Date (Saturday 11:59:59 PM)}
 */
function getWeekBoundaries(date) {
  var d = new Date(date);
  var dayOfWeek = d.getDay(); // 0 = Sunday, 6 = Saturday

  // Get Sunday (start of week)
  var weekStart = new Date(d);
  weekStart.setDate(d.getDate() - dayOfWeek);
  weekStart.setHours(0, 0, 0, 0);

  // Get Saturday 11:59:59 PM (end of week / deadline)
  var weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);
  weekEnd.setHours(23, 59, 59, 999);

  return {
    weekStart: weekStart,
    weekEnd: weekEnd
  };
}

/**
 * Checks if a report was submitted late (after Saturday 11:59 PM deadline)
 *
 * @param {GmailMessage} message - Gmail message object
 * @param {Date} reportDate - Date the report covers (from subject line)
 * @param {boolean} isForwarded - Whether email was forwarded (subject starts with "Fwd:")
 * @returns {boolean} - true if late, false if on time
 */
function isReportLate(message, reportDate, isForwarded) {
  // Forwarded emails: assume on time (can't detect actual received date)
  if (isForwarded) {
    return false;
  }

  var receivedDate = message.getDate();
  var weekBounds = getWeekBoundaries(reportDate);

  // Late if received after Saturday 11:59:59 PM of the report's week
  return receivedDate > weekBounds.weekEnd;
}

/**
 * Loads exclusion configuration from Safety Compliance Config sheet
 *
 * @returns {Object} - Map of jobNumber -> {skipDays: [0-6 booleans], skipWeeklyMeeting: boolean}
 */
function loadComplianceConfig() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("Safety Compliance Config");

  var config = {};

  if (!sheet || sheet.getLastRow() < 2) {
    return config;
  }

  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var jobNumber = String(row[0]).trim();
    if (!jobNumber) continue;

    config[jobNumber] = {
      foreman: row[1] || "",
      skipDays: [
        row[2] === true,  // Sun (column C)
        row[3] === true,  // Mon (column D)
        row[4] === true,  // Tue (column E)
        row[5] === true,  // Wed (column F)
        row[6] === true,  // Thu (column G)
        row[7] === true,  // Fri (column H)
        row[8] === true   // Sat (column I)
      ],
      skipWeeklyMeeting: row[9] === true,
      skipMonthlyChecklist: row[10] === true,
      notes: row[11] || ""
    };
  }

  return config;
}

/**
 * Gets the day name abbreviation for a day index
 * @param {number} dayIndex - 0=Sun, 1=Mon, etc.
 * @returns {string} - Day abbreviation
 */
function getDayAbbrev(dayIndex) {
  var days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return days[dayIndex] || "";
}

/**
 * Calculates safety compliance for a given week
 *
 * @param {Date} weekStartDate - Sunday of the week to calculate
 * @returns {Object} - Compliance data with crew stats
 */
function calculateSafetyCompliance(weekStartDate) {
  var weekBounds = getWeekBoundaries(weekStartDate);
  var weekStart = weekBounds.weekStart;
  var weekEnd = weekBounds.weekEnd;
  var today = new Date();
  var isPastDeadline = today > weekEnd;

  Logger.log("=== calculateSafetyCompliance ===");
  Logger.log("Week: " + weekStart.toDateString() + " to " + weekEnd.toDateString());
  Logger.log("Past deadline: " + isPastDeadline);

  // Get active crews and config
  var crews = getActiveCrews();
  var config = loadComplianceConfig();

  Logger.log("Active crews: " + crews.length);

  // Initialize crew compliance data
  var crewCompliance = {};
  for (var i = 0; i < crews.length; i++) {
    var jobNumber = crews[i];
    var foremanResult = lookupForemanByJobNumber(jobNumber);
    var foremanName = foremanResult.name || "";
    var crewConfig = config[jobNumber] || {
      foreman: foremanName,
      skipDays: [true, false, false, false, false, false, true], // Default: skip Sun/Sat
      skipWeeklyMeeting: false,
      skipMonthlyChecklist: false
    };

    crewCompliance[jobNumber] = {
      jobNumber: jobNumber,
      foreman: crewConfig.foreman || foremanName,
      phone: lookupForemanPhoneByJobNumber(jobNumber),
      jha: [null, null, null, null, null, null, null], // Sun-Sat: null=pending, true=received, false=missing
      weeklyMeeting: null, // null=pending, true=received, false=missing
      monthlyChecklist: null, // null=pending, true=received, false=missing
      skipDays: crewConfig.skipDays,
      skipWeeklyMeeting: crewConfig.skipWeeklyMeeting,
      skipMonthlyChecklist: crewConfig.skipMonthlyChecklist || false,
      missingJhaDates: [],
      missingWeeklyMeeting: false,
      missingMonthlyChecklist: false
    };
  }

  // Search Gmail for JHAs in date range
  var jhaQuery = 'subject:"Job Hazard Report" newer_than:14d';
  var meetingQuery = 'subject:"Safety Meeting Report" newer_than:14d';

  try {
    // Process JHA emails
    var jhaThreads = GmailApp.search(jhaQuery);
    Logger.log("JHA threads found: " + jhaThreads.length);

    for (var t = 0; t < jhaThreads.length; t++) {
      var messages = jhaThreads[t].getMessages();
      for (var m = 0; m < messages.length; m++) {
        var message = messages[m];
        var subject = message.getSubject();
        var isForwarded = subject.toLowerCase().indexOf("fwd:") === 0;

        var extracted = extractReportDateFromSubject(subject, "JHA");
        if (!extracted || !extracted.jobNumber) continue;

        var reportDate = extracted.reportDate;
        var jobNumber = extracted.jobNumber;

        // Check if this JHA is for our target week
        if (reportDate < weekStart || reportDate > weekEnd) continue;

        // Check if late
        if (isReportLate(message, reportDate, isForwarded)) {
          Logger.log("Late JHA detected: " + jobNumber + " for " + reportDate.toDateString());
          continue; // Late submissions don't count
        }

        // Mark as received
        if (crewCompliance[jobNumber]) {
          var dayIndex = reportDate.getDay(); // 0=Sun, 6=Sat
          crewCompliance[jobNumber].jha[dayIndex] = true;
          Logger.log("JHA received: " + jobNumber + " for " + getDayAbbrev(dayIndex) + " " + reportDate.toDateString());
        }
      }
    }

    // Process Weekly Safety Meeting emails
    var meetingThreads = GmailApp.search(meetingQuery);
    Logger.log("Safety Meeting threads found: " + meetingThreads.length);

    for (var t = 0; t < meetingThreads.length; t++) {
      var messages = meetingThreads[t].getMessages();
      for (var m = 0; m < messages.length; m++) {
        var message = messages[m];
        var subject = message.getSubject();
        var isForwarded = subject.toLowerCase().indexOf("fwd:") === 0;

        var extracted = extractReportDateFromSubject(subject, "Safety Meeting");
        if (!extracted || !extracted.jobNumber) continue;

        var weekOfDate = extracted.reportDate;
        var jobNumber = extracted.jobNumber;

        // Check if this meeting is for our target week
        // "Week of" date should match our weekStart
        var meetingWeekBounds = getWeekBoundaries(weekOfDate);
        if (meetingWeekBounds.weekStart.getTime() !== weekStart.getTime()) continue;

        // Check if late (compare email received date vs deadline)
        if (isReportLate(message, weekOfDate, isForwarded)) {
          Logger.log("Late Weekly Meeting detected: " + jobNumber + " for week of " + weekOfDate.toDateString());
          continue; // Late submissions don't count
        }

        // Mark as received
        if (crewCompliance[jobNumber]) {
          crewCompliance[jobNumber].weeklyMeeting = true;
          Logger.log("Weekly Meeting received: " + jobNumber + " for week of " + weekOfDate.toDateString());
        }
      }
    }

    // Process Monthly Safety Checklist Reports
    // These are submitted once per month per crew (Safety Checklist Report)
    var checklistQuery = 'subject:"Safety Checklist Report" newer_than:35d';
    var checklistThreads = GmailApp.search(checklistQuery);
    Logger.log("Safety Checklist threads found: " + checklistThreads.length);

    // Get the current month boundaries
    var monthStart = new Date(weekStart.getFullYear(), weekStart.getMonth(), 1);
    var monthEnd = new Date(weekStart.getFullYear(), weekStart.getMonth() + 1, 0);
    Logger.log("Checking for monthly checklists in: " + (monthStart.getMonth() + 1) + "/" + monthStart.getFullYear());

    for (var t = 0; t < checklistThreads.length; t++) {
      var messages = checklistThreads[t].getMessages();
      for (var m = 0; m < messages.length; m++) {
        var message = messages[m];
        var subject = message.getSubject();

        // Extract job number from subject: "Safety Checklist Report 578-033-26 01-15-2026"
        var checklistMatch = subject.match(/Safety Checklist Report\s+\d+-(\d{3}-\d{2})\s+(\d{2}-\d{2}-\d{4})/i);
        if (!checklistMatch) continue;

        var jobNumber = checklistMatch[1];
        var dateParts = checklistMatch[2].split('-');
        var reportDate = new Date(parseInt(dateParts[2]), parseInt(dateParts[0]) - 1, parseInt(dateParts[1]));

        // Check if this checklist is for the current month
        if (reportDate < monthStart || reportDate > monthEnd) continue;

        // Mark as received
        if (crewCompliance[jobNumber]) {
          crewCompliance[jobNumber].monthlyChecklist = true;
          Logger.log("Monthly Checklist received: " + jobNumber + " for " + reportDate.toDateString());
        }
      }
    }

  } catch (e) {
    Logger.log("Error searching Gmail: " + e.toString());
  }

  // Finalize status for each crew
  var compliantCount = 0;
  var missingCount = 0;

  for (var jobNumber in crewCompliance) {
    var crew = crewCompliance[jobNumber];
    var hasIssues = false;

    // Check each day for JHA
    for (var day = 0; day < 7; day++) {
      if (crew.skipDays[day]) {
        crew.jha[day] = "N/A";
      } else if (crew.jha[day] === true) {
        crew.jha[day] = "✅";
      } else if (isPastDeadline) {
        crew.jha[day] = "❌";
        hasIssues = true;
        // Calculate the actual date for this day
        var missedDate = new Date(weekStart);
        missedDate.setDate(weekStart.getDate() + day);
        crew.missingJhaDates.push(missedDate);
      } else {
        crew.jha[day] = "⏳";
      }
    }

    // Check weekly meeting
    if (crew.skipWeeklyMeeting) {
      crew.weeklyMeeting = "N/A";
    } else if (crew.weeklyMeeting === true) {
      crew.weeklyMeeting = "✅";
    } else if (isPastDeadline) {
      crew.weeklyMeeting = "❌";
      crew.missingWeeklyMeeting = true;
      hasIssues = true;
    } else {
      crew.weeklyMeeting = "⏳";
    }

    // Check monthly checklist (due once per month, check at end of month)
    var isEndOfMonth = weekEnd.getDate() >= 25; // Last week of month
    if (crew.skipMonthlyChecklist) {
      crew.monthlyChecklist = "N/A";
    } else if (crew.monthlyChecklist === true) {
      crew.monthlyChecklist = "✅";
    } else if (isEndOfMonth && isPastDeadline) {
      crew.monthlyChecklist = "❌";
      crew.missingMonthlyChecklist = true;
      hasIssues = true;
    } else {
      crew.monthlyChecklist = "⏳";
    }

    // Set overall status
    if (hasIssues) {
      crew.status = "Missing Reports";
      missingCount++;
    } else if (isPastDeadline) {
      crew.status = "Complete";
      compliantCount++;
    } else {
      crew.status = "Pending";
    }
  }

  Logger.log("Compliance summary: " + compliantCount + " complete, " + missingCount + " with missing reports");

  return {
    weekStart: weekStart,
    weekEnd: weekEnd,
    isPastDeadline: isPastDeadline,
    crews: crewCompliance,
    compliantCount: compliantCount,
    missingCount: missingCount,
    totalCrews: crews.length
  };
}

/**
 * Updates or inserts compliance data into Safety Compliance sheet
 *
 * @param {Object} complianceData - Result from calculateSafetyCompliance()
 */
function updateComplianceSheet(complianceData) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("Safety Compliance");

  if (!sheet) {
    Logger.log("Safety Compliance sheet not found. Creating it...");
    setupSafetyComplianceSheet();
    sheet = ss.getSheetByName("Safety Compliance");
  }

  var weekStartStr = Utilities.formatDate(complianceData.weekStart, Session.getScriptTimeZone(), "MM/dd/yyyy");
  var weekEndStr = Utilities.formatDate(complianceData.weekEnd, Session.getScriptTimeZone(), "MM/dd/yyyy");

  // Get existing data to check for updates
  var existingData = sheet.getDataRange().getValues();
  var existingRows = {};
  for (var i = 1; i < existingData.length; i++) {
    var rowWeekStart = existingData[i][0];
    var rowJobNumber = existingData[i][2];
    if (rowWeekStart && rowJobNumber) {
      var key = Utilities.formatDate(new Date(rowWeekStart), Session.getScriptTimeZone(), "MM/dd/yyyy") + "_" + rowJobNumber;
      existingRows[key] = i + 1; // 1-based row number
    }
  }

  var now = new Date();

  // Process each crew
  for (var jobNumber in complianceData.crews) {
    var crew = complianceData.crews[jobNumber];
    var key = weekStartStr + "_" + jobNumber;

    var rowData = [
      complianceData.weekStart,  // Week Start
      complianceData.weekEnd,    // Week End
      jobNumber,                  // Job Number
      crew.foreman,              // Foreman
      crew.jha[0],               // JHA Sun
      crew.jha[1],               // JHA Mon
      crew.jha[2],               // JHA Tue
      crew.jha[3],               // JHA Wed
      crew.jha[4],               // JHA Thu
      crew.jha[5],               // JHA Fri
      crew.jha[6],               // JHA Sat
      crew.weeklyMeeting,        // Weekly Meeting
      crew.monthlyChecklist,     // Monthly Checklist
      crew.status,               // Status
      now                        // Created/Updated Date
    ];

    if (existingRows[key]) {
      // Update existing row
      sheet.getRange(existingRows[key], 1, 1, 15).setValues([rowData]);
    } else {
      // Insert new row
      var lastRow = sheet.getLastRow();
      sheet.getRange(lastRow + 1, 1, 1, 15).setValues([rowData]);
    }
  }

  Logger.log("Updated Safety Compliance sheet for week of " + weekStartStr);

  // Apply visual formatting to make weeks easier to see
  formatComplianceSheetByWeek();
}

/**
 * Formats the Safety Compliance sheet with alternating colors for each work week
 * and adds visual separators between weeks for easier reading
 */
function formatComplianceSheetByWeek() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("Safety Compliance");

  if (!sheet || sheet.getLastRow() < 2) {
    Logger.log("Safety Compliance sheet empty or not found");
    return;
  }

  var data = sheet.getDataRange().getValues();
  var tz = Session.getScriptTimeZone();

  // Define alternating week colors
  var weekColors = [
    "#FFFFFF",  // White
    "#E3F2FD"   // Light blue
  ];

  // Track weeks and assign colors
  var weekColorMap = {};
  var colorIndex = 0;
  var lastWeekKey = null;

  // First pass: identify unique weeks and assign colors
  for (var i = 1; i < data.length; i++) {
    var weekStart = data[i][0];
    if (!weekStart) continue;

    var weekKey = Utilities.formatDate(new Date(weekStart), tz, "yyyy-MM-dd");

    if (weekKey !== lastWeekKey) {
      if (!weekColorMap[weekKey]) {
        weekColorMap[weekKey] = weekColors[colorIndex % 2];
        colorIndex++;
      }
      lastWeekKey = weekKey;
    }
  }

  // Second pass: apply colors and borders
  lastWeekKey = null;
  var weekStartRows = []; // Track where each new week starts

  for (var i = 1; i < data.length; i++) {
    var weekStart = data[i][0];
    if (!weekStart) continue;

    var weekKey = Utilities.formatDate(new Date(weekStart), tz, "yyyy-MM-dd");
    var rowNum = i + 1; // 1-based

    // Apply background color for this row
    var bgColor = weekColorMap[weekKey] || "#FFFFFF";
    sheet.getRange(rowNum, 1, 1, 15).setBackground(bgColor);

    // If this is a new week, add a top border
    if (weekKey !== lastWeekKey) {
      weekStartRows.push(rowNum);

      // Add thick top border to separate from previous week
      sheet.getRange(rowNum, 1, 1, 15).setBorder(
        true,   // top
        null,   // left
        null,   // bottom
        null,   // right
        null,   // vertical
        null,   // horizontal
        "#1565C0", // color (blue)
        SpreadsheetApp.BorderStyle.SOLID_MEDIUM // style
      );

      lastWeekKey = weekKey;
    }
  }

  // Sort by Week Start descending (most recent first) then by Job Number
  if (sheet.getLastRow() > 1) {
    var dataRange = sheet.getRange(2, 1, sheet.getLastRow() - 1, 15);
    dataRange.sort([
      {column: 1, ascending: false},  // Week Start descending
      {column: 3, ascending: true}     // Job Number ascending
    ]);

    // Re-apply formatting after sort
    applyWeekColorsAfterSort(sheet);
  }

  Logger.log("Applied week formatting to Safety Compliance sheet");
}

/**
 * Re-applies week colors after sorting the sheet
 */
function applyWeekColorsAfterSort(sheet) {
  var data = sheet.getDataRange().getValues();
  var tz = Session.getScriptTimeZone();

  var weekColors = ["#FFFFFF", "#E3F2FD"];
  var colorIndex = 0;
  var lastWeekKey = null;

  for (var i = 1; i < data.length; i++) {
    var weekStart = data[i][0];
    if (!weekStart) continue;

    var weekKey = Utilities.formatDate(new Date(weekStart), tz, "yyyy-MM-dd");
    var rowNum = i + 1;

    // Check if this is a new week
    if (weekKey !== lastWeekKey) {
      colorIndex++;
      lastWeekKey = weekKey;

      // Add separator border
      sheet.getRange(rowNum, 1, 1, 15).setBorder(
        true, null, null, null, null, null,
        "#1565C0",
        SpreadsheetApp.BorderStyle.SOLID_MEDIUM
      );
    }

    // Apply alternating background
    var bgColor = weekColors[colorIndex % 2];
    sheet.getRange(rowNum, 1, 1, 15).setBackground(bgColor);
  }
}

/**
 * Fixes the Safety Compliance sheet headers if columns are misaligned
 * This repairs sheets where headers don't match the data columns
 */
function fixSafetyComplianceHeaders() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("Safety Compliance");

  if (!sheet) {
    Browser.msgBox("❌ Safety Compliance sheet not found.");
    return;
  }

  // Expected headers (15 columns: A-O)
  var expectedHeaders = [
    "Week Start", "Week End", "Job Number", "Foreman",
    "JHA Sun", "JHA Mon", "JHA Tue", "JHA Wed", "JHA Thu", "JHA Fri", "JHA Sat",
    "Weekly Meeting", "Monthly Checklist", "Status", "Created Date"
  ];

  // Get current headers
  var currentHeaders = sheet.getRange(1, 1, 1, 16).getValues()[0];
  Logger.log("Current headers: " + JSON.stringify(currentHeaders));

  // Check if column M (13) says "Status" instead of "Monthly Checklist"
  var colMHeader = String(currentHeaders[12] || "").toLowerCase().trim();
  var colNHeader = String(currentHeaders[13] || "").toLowerCase().trim();

  Logger.log("Column M (13) header: " + colMHeader);
  Logger.log("Column N (14) header: " + colNHeader);

  // Case 1: Headers are only 14 columns (missing Monthly Checklist)
  // Column M = "Status", Column N = "Created Date"
  if (colMHeader.indexOf("status") !== -1 && colNHeader.indexOf("created") !== -1) {
    Logger.log("Detected: Headers missing Monthly Checklist column. Need to insert column M.");

    // Insert a new column at position 13 (column M)
    sheet.insertColumnAfter(12); // Insert after Weekly Meeting (column L)

    // Set the correct headers for columns M, N, O
    sheet.getRange(1, 13).setValue("Monthly Checklist");
    sheet.getRange(1, 14).setValue("Status");
    sheet.getRange(1, 15).setValue("Created Date");

    // Format the header row
    sheet.getRange(1, 13, 1, 3)
      .setFontWeight("bold")
      .setBackground("#4A86E8")
      .setFontColor("white");

    // Set column widths
    sheet.setColumnWidth(13, 110);
    sheet.setColumnWidth(14, 100);
    sheet.setColumnWidth(15, 110);

    // Fill new Monthly Checklist column with N/A for existing rows
    var lastRow = sheet.getLastRow();
    if (lastRow > 1) {
      sheet.getRange(2, 13, lastRow - 1, 1).setValue("N/A");
    }

    // Delete column P if it's now empty or duplicate
    var colPData = sheet.getRange(1, 16, 1, 1).getValue();
    if (!colPData || colPData === "") {
      // Column P is empty, we can delete it
      sheet.deleteColumn(16);
    }

    Browser.msgBox("✅ Fixed! Inserted 'Monthly Checklist' column (M).\n\n" +
      "- Column M: Monthly Checklist (set to N/A for existing rows)\n" +
      "- Column N: Status\n" +
      "- Column O: Created Date");
  } else {
    // Case 2: Just rewrite all headers to be correct
    sheet.getRange(1, 1, 1, expectedHeaders.length).setValues([expectedHeaders]);
    sheet.getRange(1, 1, 1, expectedHeaders.length)
      .setFontWeight("bold")
      .setBackground("#4A86E8")
      .setFontColor("white");

    // Set column widths
    sheet.setColumnWidth(1, 100);  // Week Start
    sheet.setColumnWidth(2, 100);  // Week End
    sheet.setColumnWidth(3, 90);   // Job Number
    sheet.setColumnWidth(4, 120);  // Foreman
    for (var i = 5; i <= 11; i++) {
      sheet.setColumnWidth(i, 70); // JHA columns
    }
    sheet.setColumnWidth(12, 100); // Weekly Meeting
    sheet.setColumnWidth(13, 110); // Monthly Checklist
    sheet.setColumnWidth(14, 100); // Status
    sheet.setColumnWidth(15, 110); // Created Date

    Browser.msgBox("✅ Headers have been corrected to 15 columns (A-O).");
  }

  Logger.log("Headers fixed successfully");
}

/**
 * Menu function to manually reformat the Safety Compliance sheet
 */
function reformatSafetyComplianceSheet() {
  formatComplianceSheetByWeek();
  Browser.msgBox("✅ Safety Compliance sheet reformatted with work week separators!");
}

/**
 * Finalizes past weeks in Safety Compliance sheet that still show "Pending" status
 * Updates ⏳ to ❌ for any past-deadline items and creates missing report tasks
 *
 * @returns {Object} - Summary of what was updated
 */
function finalizePastWeeksCompliance() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("Safety Compliance");

  if (!sheet || sheet.getLastRow() < 2) {
    Logger.log("Safety Compliance sheet not found or empty");
    return { updatedRows: 0, tasksCreated: 0 };
  }

  var today = new Date();
  today.setHours(0, 0, 0, 0);
  var tz = Session.getScriptTimeZone();

  var data = sheet.getDataRange().getValues();
  var updatedRows = 0;
  var rowsToUpdate = [];

  Logger.log("=== finalizePastWeeksCompliance ===");
  Logger.log("Today: " + today.toDateString());

  // Scan for past weeks with Pending status
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var weekEnd = row[1]; // Column B: Week End
    var status = row[13]; // Column N: Status

    if (!weekEnd) continue;

    var weekEndDate = new Date(weekEnd);
    weekEndDate.setHours(23, 59, 59, 999);

    // Check if this week has passed its deadline but still shows Pending
    if (weekEndDate < today && status === "Pending") {
      var rowNum = i + 1;
      var jobNumber = row[2];
      var foreman = row[3];

      Logger.log("Found past week needing update: Row " + rowNum + ", Job " + jobNumber + ", Week End " + weekEndDate.toDateString());

      // Check each JHA column (E-K, indices 4-10)
      var hasMissing = false;
      var updatedJha = [];
      for (var d = 4; d <= 10; d++) {
        var jhaStatus = row[d];
        if (jhaStatus === "⏳") {
          updatedJha.push({ col: d + 1, value: "❌" }); // Convert to 1-based column
          hasMissing = true;
        }
      }

      // Check Weekly Meeting (Column L, index 11)
      var weeklyMeeting = row[11];
      var updatedMeeting = null;
      if (weeklyMeeting === "⏳") {
        updatedMeeting = "❌";
        hasMissing = true;
      }

      // Determine new status
      var newStatus = hasMissing ? "Missing Reports" : "Complete";

      rowsToUpdate.push({
        rowNum: rowNum,
        jobNumber: jobNumber,
        foreman: foreman,
        weekStart: row[0],
        weekEnd: weekEnd,
        jhaUpdates: updatedJha,
        meetingUpdate: updatedMeeting,
        newStatus: newStatus,
        hasMissing: hasMissing
      });
    }
  }

  // Apply updates
  for (var u = 0; u < rowsToUpdate.length; u++) {
    var update = rowsToUpdate[u];

    // Update JHA columns
    for (var j = 0; j < update.jhaUpdates.length; j++) {
      sheet.getRange(update.rowNum, update.jhaUpdates[j].col).setValue(update.jhaUpdates[j].value);
    }

    // Update Weekly Meeting
    if (update.meetingUpdate) {
      sheet.getRange(update.rowNum, 12).setValue(update.meetingUpdate); // Column L
    }

    // Update Status
    sheet.getRange(update.rowNum, 14).setValue(update.newStatus); // Column N

    updatedRows++;
    Logger.log("Updated row " + update.rowNum + ": " + update.jobNumber + " -> " + update.newStatus);
  }

  // Now create tasks for missing reports
  var tasksCreated = 0;
  var taskSheet = ss.getSheetByName("Task Metadata");

  if (taskSheet) {
    var existingTasks = {};
    var taskData = taskSheet.getDataRange().getValues();
    for (var t = 1; t < taskData.length; t++) {
      var taskKey = taskData[t][0]; // TaskKey column
      if (taskKey) existingTasks[taskKey] = true;
    }

    for (var m = 0; m < rowsToUpdate.length; m++) {
      var missingRow = rowsToUpdate[m];
      if (!missingRow.hasMissing) continue;

      var weekStartStr = Utilities.formatDate(new Date(missingRow.weekStart), tz, "MM-dd-yyyy");
      var taskKey = "SafetyCompliance_" + missingRow.jobNumber + "_" + weekStartStr;

      if (existingTasks[taskKey]) {
        Logger.log("Task already exists: " + taskKey);
        continue;
      }

      // Build task description
      var missingItems = [];
      if (missingRow.jhaUpdates.length > 0) {
        missingItems.push(missingRow.jhaUpdates.length + " JHA(s)");
      }
      if (missingRow.meetingUpdate) {
        missingItems.push("Weekly Meeting");
      }

      var weekStartDisplay = Utilities.formatDate(new Date(missingRow.weekStart), tz, "MM/dd/yyyy");
      var taskDescription = "Missing: " + missingItems.join(" + ") + " (Week of " + weekStartDisplay + ")";

      // Look up foreman phone
      var phone = lookupForemanPhoneByJobNumber(missingRow.jobNumber);

      // Create task in Task Metadata
      var now = new Date();
      var newTask = [
        taskKey,                           // A: TaskKey
        missingRow.jobNumber,              // B: Employee (using job number as identifier)
        "Missing Safety Report",           // C: TaskType
        missingItems.join(" + "),          // D: ItemType
        "",                                // E: ItemDetails
        lookupLocationByJobNumber(missingRow.jobNumber), // F: Location
        phone || "",                       // G: PhoneNumber
        now,                               // H: DueDate (immediate)
        "",                                // I: ScheduledDate
        "",                                // J: StartTime
        "",                                // K: EndTime
        "Pending",                         // L: Status
        "High",                            // M: Priority
        taskDescription,                   // N: Notes
        now,                               // O: CreatedDate
        "",                                // P: CompletedDate
        "Safety Compliance",               // Q: SourceSheet
        missingRow.rowNum,                 // R: RowIndex
        "FALSE",                           // S: IsOffice
        "FALSE",                           // T: NotifiedDate
        "FALSE",                           // U: IsDeleted
        "",                                // V: UpdatedDate
        missingRow.foreman || ""           // W: Foreman
      ];

      taskSheet.appendRow(newTask);
      tasksCreated++;
      Logger.log("Created task: " + taskKey);
    }
  }

  Logger.log("Summary: Updated " + updatedRows + " rows, created " + tasksCreated + " tasks");

  return {
    updatedRows: updatedRows,
    tasksCreated: tasksCreated,
    details: rowsToUpdate
  };
}

/**
 * Menu function to finalize past weeks and create missing report tasks
 */
function menuFinalizePastWeeks() {
  var result = finalizePastWeeksCompliance();

  if (result.updatedRows === 0 && result.tasksCreated === 0) {
    Browser.msgBox("✅ All past weeks are already finalized. No updates needed.");
  } else {
    Browser.msgBox("✅ Finalized " + result.updatedRows + " rows and created " + result.tasksCreated + " missing report tasks.");
  }

  // Re-apply formatting
  if (result.updatedRows > 0) {
    formatComplianceSheetByWeek();
  }
}

/**
 * Creates missing report tasks in Task Metadata sheet
 * Only runs when past the Saturday deadline
 * Combines JHA + Weekly Meeting into one task if crew is missing both
 *
 * @param {Object} complianceData - Result from calculateSafetyCompliance()
 * @returns {number} - Number of tasks created
 */
function createMissingReportTasks(complianceData) {
  if (!complianceData.isPastDeadline) {
    Logger.log("Not past deadline yet, skipping task creation");
    return 0;
  }

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var taskSheet = ss.getSheetByName("Task Metadata");
  if (!taskSheet) {
    Logger.log("Task Metadata sheet not found");
    return 0;
  }

  var weekStartStr = Utilities.formatDate(complianceData.weekStart, Session.getScriptTimeZone(), "MM-dd-yyyy");
  var weekStartDisplay = Utilities.formatDate(complianceData.weekStart, Session.getScriptTimeZone(), "MM/dd/yyyy");

  // Get existing tasks to avoid duplicates
  var existingData = taskSheet.getDataRange().getValues();
  var existingTaskIds = {};
  for (var i = 1; i < existingData.length; i++) {
    var taskId = existingData[i][0];
    if (taskId) {
      existingTaskIds[taskId] = true;
    }
  }

  var tasksCreated = 0;
  var now = new Date();

  for (var jobNumber in complianceData.crews) {
    var crew = complianceData.crews[jobNumber];

    // Skip if no issues
    if (crew.missingJhaDates.length === 0 && !crew.missingWeeklyMeeting) {
      continue;
    }

    // Generate unique task ID
    var taskId = "SafetyCompliance_" + jobNumber + "_" + weekStartStr;

    // Skip if already exists
    if (existingTaskIds[taskId]) {
      Logger.log("Task already exists: " + taskId);
      continue;
    }

    // Determine item type and build notes
    var itemType, notes;
    var missingDatesStr = "";

    if (crew.missingJhaDates.length > 0) {
      var dateStrs = [];
      for (var d = 0; d < crew.missingJhaDates.length; d++) {
        dateStrs.push(Utilities.formatDate(crew.missingJhaDates[d], Session.getScriptTimeZone(), "MM/dd/yyyy"));
      }
      missingDatesStr = dateStrs.join(", ");
    }

    if (crew.missingJhaDates.length > 0 && crew.missingWeeklyMeeting) {
      itemType = "JHA + Weekly Meeting";
      notes = "Missing JHA: " + missingDatesStr + "; Missing Weekly Safety Meeting for week of " + weekStartDisplay;
    } else if (crew.missingJhaDates.length > 0) {
      itemType = "JHA";
      notes = "Missing JHA: " + missingDatesStr;
    } else {
      itemType = "Weekly Meeting";
      notes = "Missing Weekly Safety Meeting for week of " + weekStartDisplay;
    }

    // Create task row matching Task Metadata schema
    // Columns: TaskID, SourceSheet, SourceRow, Employee, TaskType, ItemType, CurrentItem, Location, Foreman, PhoneNumber, DueDate, ScheduledDate, StartTime, EndTime, Status, NotifiedDate, ScheduledClassDate, ClassType, IsOffice, IsRegistered, IsDeclined, CompletedDate, Notes, CreatedDate, LastModified
    var taskRow = [
      taskId,                              // A: TaskID
      "Safety Compliance",                 // B: SourceSheet
      0,                                   // C: SourceRow (not applicable)
      crew.foreman,                        // D: Employee (foreman to contact)
      "Missing Safety Report",             // E: TaskType
      itemType,                            // F: ItemType (JHA, Weekly Meeting, or JHA + Weekly Meeting)
      "",                                  // G: CurrentItem
      "",                                  // H: Location
      crew.foreman,                        // I: Foreman
      crew.phone,                          // J: PhoneNumber
      now,                                 // K: DueDate (actionable now)
      "",                                  // L: ScheduledDate
      "",                                  // M: StartTime
      "",                                  // N: EndTime
      "Pending",                           // O: Status
      "",                                  // P: NotifiedDate
      "",                                  // Q: ScheduledClassDate
      "",                                  // R: ClassType
      true,                                // S: IsOffice (phone task)
      false,                               // T: IsRegistered
      false,                               // U: IsDeclined
      "",                                  // V: CompletedDate
      notes,                               // W: Notes
      now,                                 // X: CreatedDate
      now                                  // Y: LastModified
    ];

    var lastRow = taskSheet.getLastRow();
    taskSheet.getRange(lastRow + 1, 1, 1, taskRow.length).setValues([taskRow]);
    tasksCreated++;

    Logger.log("Created task: " + taskId + " - " + itemType);
  }

  Logger.log("Created " + tasksCreated + " missing report tasks");
  return tasksCreated;
}

/**
 * Gets trend statistics for a crew over the last N weeks
 *
 * @param {string} jobNumber - Job number to analyze
 * @param {number} weeksBack - Number of weeks to analyze (default 4)
 * @returns {Object} - {missedJhaCount, missedMeetingCount, totalWeeks, complianceRate}
 */
function getCrewComplianceTrend(jobNumber, weeksBack) {
  if (!weeksBack) weeksBack = 4;

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("Safety Compliance");

  if (!sheet || sheet.getLastRow() < 2) {
    return { missedJhaCount: 0, missedMeetingCount: 0, totalWeeks: 0, complianceRate: 100 };
  }

  var data = sheet.getDataRange().getValues();
  var cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - (weeksBack * 7));

  var missedJhaCount = 0;
  var missedMeetingCount = 0;
  var totalWeeks = 0;
  var totalRequiredJhas = 0;
  var receivedJhas = 0;

  for (var i = 1; i < data.length; i++) {
    var rowJobNumber = String(data[i][2]).trim();
    var weekStart = data[i][0];

    if (rowJobNumber !== jobNumber) continue;
    if (!weekStart || new Date(weekStart) < cutoffDate) continue;

    totalWeeks++;

    // Count JHA status (columns E-K = indices 4-10)
    for (var day = 4; day <= 10; day++) {
      var status = data[i][day];
      if (status === "❌") {
        missedJhaCount++;
        totalRequiredJhas++;
      } else if (status === "✅") {
        receivedJhas++;
        totalRequiredJhas++;
      }
      // N/A doesn't count toward totals
    }

    // Check weekly meeting (column L = index 11)
    if (data[i][11] === "❌") {
      missedMeetingCount++;
    }
  }

  var complianceRate = totalRequiredJhas > 0
    ? Math.round((receivedJhas / totalRequiredJhas) * 100)
    : 100;

  return {
    missedJhaCount: missedJhaCount,
    missedMeetingCount: missedMeetingCount,
    totalWeeks: totalWeeks,
    complianceRate: complianceRate
  };
}

/**
 * Gets all crew compliance trends for dashboard - OPTIMIZED
 * Reads Safety Compliance sheet once and processes all crews in a single pass
 *
 * @param {number} weeksBack - Number of weeks to analyze (default 4)
 * @returns {Array} - Array of {jobNumber, foreman, missedJhaCount, missedMeetingCount, complianceRate}
 */
function getAllCrewComplianceTrends(weeksBack) {
  if (!weeksBack) weeksBack = 4;

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("Safety Compliance");
  var crews = getActiveCrews();

  // Build foreman map in one batch call
  var foremanMap = {};
  for (var i = 0; i < crews.length; i++) {
    var foremanResult = lookupForemanByJobNumber(crews[i]);
    foremanMap[crews[i]] = foremanResult.name || "";
  }

  // Initialize trend data for all crews
  var trendData = {};
  for (var i = 0; i < crews.length; i++) {
    trendData[crews[i]] = {
      jobNumber: crews[i],
      foreman: foremanMap[crews[i]],
      missedJhaCount: 0,
      missedMeetingCount: 0,
      totalWeeks: 0,
      totalRequiredJhas: 0,
      receivedJhas: 0
    };
  }

  // If no sheet or no data, return empty trends
  if (!sheet || sheet.getLastRow() < 2) {
    return crews.map(function(jobNumber) {
      return {
        jobNumber: jobNumber,
        foreman: foremanMap[jobNumber],
        missedJhaCount: 0,
        missedMeetingCount: 0,
        totalWeeks: 0,
        complianceRate: 100
      };
    });
  }

  // Read all data once
  var data = sheet.getDataRange().getValues();
  var cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - (weeksBack * 7));

  // Process all rows in a single pass
  for (var i = 1; i < data.length; i++) {
    var rowJobNumber = String(data[i][2]).trim();
    var weekStart = data[i][0];

    // Skip if not an active crew or too old
    if (!trendData[rowJobNumber]) continue;
    if (!weekStart || new Date(weekStart) < cutoffDate) continue;

    var crewTrend = trendData[rowJobNumber];
    crewTrend.totalWeeks++;

    // Count JHA status (columns E-K = indices 4-10)
    for (var day = 4; day <= 10; day++) {
      var status = data[i][day];
      if (status === "❌") {
        crewTrend.missedJhaCount++;
        crewTrend.totalRequiredJhas++;
      } else if (status === "✅") {
        crewTrend.receivedJhas++;
        crewTrend.totalRequiredJhas++;
      }
      // N/A doesn't count toward totals
    }

    // Check weekly meeting (column L = index 11)
    if (data[i][11] === "❌") {
      crewTrend.missedMeetingCount++;
    }
  }

  // Calculate compliance rates and build result array
  var trends = [];
  for (var jobNumber in trendData) {
    var t = trendData[jobNumber];
    t.complianceRate = t.totalRequiredJhas > 0
      ? Math.round((t.receivedJhas / t.totalRequiredJhas) * 100)
      : 100;
    trends.push(t);
  }

  // Sort by compliance rate (worst first)
  trends.sort(function(a, b) {
    return a.complianceRate - b.complianceRate;
  });

  return trends;
}

/**
 * Gets compliance history organized by week for dashboard display
 * @param {number} weeksBack - Number of past weeks to retrieve (excluding current week)
 * @returns {Array} Array of week objects with crews data
 */
function getComplianceHistoryByWeek(weeksBack) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("Safety Compliance");

  if (!sheet || sheet.getLastRow() < 2) {
    return [];
  }

  var data = sheet.getDataRange().getValues();
  var headers = data[0];
  var tz = Session.getScriptTimeZone();

  // Get current week boundaries to exclude
  var today = new Date();
  var currentWeekBounds = getWeekBoundaries(today);

  // Calculate cutoff date
  var cutoffDate = new Date(currentWeekBounds.weekStart);
  cutoffDate.setDate(cutoffDate.getDate() - (weeksBack * 7));

  // Group data by week
  var weekMap = {};

  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var weekStart = row[0]; // Column A: Week Start
    var weekEnd = row[1];   // Column B: Week End
    var jobNumber = row[2]; // Column C: Job Number
    var foreman = row[3];   // Column D: Foreman

    if (!weekStart || !jobNumber) continue;

    // Skip current week
    var rowWeekStart = new Date(weekStart);
    if (rowWeekStart >= currentWeekBounds.weekStart) continue;

    // Skip weeks before cutoff
    if (rowWeekStart < cutoffDate) continue;

    var weekKey = Utilities.formatDate(new Date(weekStart), tz, "yyyy-MM-dd");

    if (!weekMap[weekKey]) {
      weekMap[weekKey] = {
        weekStart: new Date(weekStart),
        weekEnd: new Date(weekEnd),
        weekStartStr: Utilities.formatDate(new Date(weekStart), tz, "MMM d"),
        weekEndStr: Utilities.formatDate(new Date(weekEnd), tz, "MMM d, yyyy"),
        crews: [],
        compliantCount: 0,
        missingCount: 0,
        totalCrews: 0
      };
    }

    var crewData = {
      jobNumber: jobNumber,
      foreman: foreman || '',
      jha: [],
      weeklyMeeting: row[11] || 'N/A', // Column L
      hasMissing: false
    };

    // JHA columns E-K (indices 4-10)
    for (var d = 4; d <= 10; d++) {
      var status = row[d] || 'N/A';
      crewData.jha.push(status);
      if (status === '❌') crewData.hasMissing = true;
    }

    // Check weekly meeting
    if (crewData.weeklyMeeting === '❌') crewData.hasMissing = true;

    weekMap[weekKey].crews.push(crewData);
    weekMap[weekKey].totalCrews++;

    if (crewData.hasMissing) {
      weekMap[weekKey].missingCount++;
    } else {
      weekMap[weekKey].compliantCount++;
    }
  }

  // Convert to array and sort by date (most recent first)
  var weeks = [];
  for (var key in weekMap) {
    weeks.push(weekMap[key]);
  }

  weeks.sort(function(a, b) {
    return b.weekStart - a.weekStart;
  });

  return weeks;
}

/**
 * Shows the Compliance Dashboard dialog
 */
function showComplianceDashboard() {
  var today = new Date();
  var weekBounds = getWeekBoundaries(today);
  var complianceData = calculateSafetyCompliance(weekBounds.weekStart);
  var trends = getAllCrewComplianceTrends(4);

  var weekStartStr = Utilities.formatDate(complianceData.weekStart, Session.getScriptTimeZone(), "MMM d");
  var weekEndStr = Utilities.formatDate(complianceData.weekEnd, Session.getScriptTimeZone(), "MMM d, yyyy");

  // Get historical weeks data for collapsible sections
  var historicalWeeks = getComplianceHistoryByWeek(4);

  var html = '<style>' +
    'body { font-family: Arial, sans-serif; padding: 20px; margin: 0; background: #f5f5f5; }' +
    'h2 { margin-top: 0; color: #1a73e8; font-size: 24px; }' +
    'h3 { margin: 20px 0 12px 0; color: #333; font-size: 18px; }' +
    '.summary { display: flex; gap: 15px; margin-bottom: 20px; flex-wrap: wrap; }' +
    '.stat-box { background: white; border-radius: 10px; padding: 20px; text-align: center; flex: 1; min-width: 120px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }' +
    '.stat-box.good { background: linear-gradient(135deg, #d4edda 0%, #c3e6cb 100%); border: 2px solid #28a745; }' +
    '.stat-box.bad { background: linear-gradient(135deg, #f8d7da 0%, #f5c6cb 100%); border: 2px solid #dc3545; }' +
    '.stat-box.pending { background: linear-gradient(135deg, #fff3cd 0%, #ffeeba 100%); border: 2px solid #ffc107; }' +
    '.stat-number { font-size: 36px; font-weight: bold; }' +
    '.stat-label { font-size: 13px; color: #555; margin-top: 8px; }' +

    // Week card styles
    '.week-card { background: white; border-radius: 10px; margin-bottom: 15px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); overflow: hidden; }' +
    '.week-header { padding: 15px 20px; cursor: pointer; display: flex; justify-content: space-between; align-items: center; transition: background 0.2s; }' +
    '.week-header:hover { filter: brightness(95%); }' +
    '.week-header.current { background: linear-gradient(135deg, #1a73e8 0%, #0d47a1 100%); color: white; }' +
    '.week-header.past { background: linear-gradient(135deg, #6c757d 0%, #495057 100%); color: white; }' +
    '.week-header.problem { background: linear-gradient(135deg, #dc3545 0%, #c82333 100%); color: white; }' +
    '.week-header.good { background: linear-gradient(135deg, #28a745 0%, #1e7e34 100%); color: white; }' +
    '.week-title { font-size: 16px; font-weight: bold; display: flex; align-items: center; gap: 10px; }' +
    '.week-title i { font-style: normal; }' +
    '.week-badges { display: flex; gap: 8px; align-items: center; }' +
    '.week-badge { background: rgba(255,255,255,0.25); padding: 4px 10px; border-radius: 15px; font-size: 12px; }' +
    '.week-badge.good { background: rgba(40,167,69,0.9); }' +
    '.week-badge.bad { background: rgba(220,53,69,0.9); }' +
    '.week-body { display: none; padding: 0; }' +
    '.week-body.show { display: block; }' +
    '.chevron { transition: transform 0.2s; font-size: 12px; }' +
    '.chevron.open { transform: rotate(90deg); }' +

    // Table styles
    'table { width: 100%; border-collapse: collapse; font-size: 13px; }' +
    'th { background: #f8f9fa; color: #333; padding: 10px 6px; text-align: center; border-bottom: 2px solid #dee2e6; font-weight: 600; }' +
    'td { padding: 8px 6px; text-align: center; border-bottom: 1px solid #eee; }' +
    'tr:hover { background: #f8f9fa; }' +
    '.crew-name { text-align: left; font-weight: 600; }' +
    '.foreman-name { text-align: left; color: #666; font-size: 12px; }' +
    '.status-ok { color: #28a745; font-size: 16px; }' +
    '.status-missing { color: #dc3545; font-weight: bold; font-size: 16px; }' +
    '.status-pending { color: #ffc107; font-size: 16px; }' +
    '.status-na { color: #aaa; font-size: 14px; }' +
    '.row-problem { background: #fff5f5; }' +

    // Trend section
    '.trend-section { background: white; border-radius: 10px; padding: 20px; margin-top: 20px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }' +
    '.trend-row-bad { background: #ffebee; }' +
    '.trend-row-warning { background: #fff8e1; }' +

    // Buttons
    'button { background: #1a73e8; color: white; border: none; padding: 10px 20px; border-radius: 6px; cursor: pointer; margin: 5px; font-size: 14px; }' +
    'button:hover { background: #1557b0; }' +
    'button.secondary { background: #6c757d; }' +
    '</style>';

  // Add JavaScript for collapsible weeks
  html += '<script>' +
    'function toggleWeek(weekIndex) {' +
    '  var body = document.getElementById("week-body-" + weekIndex);' +
    '  var chevron = document.getElementById("week-chevron-" + weekIndex);' +
    '  if (body.classList.contains("show")) {' +
    '    body.classList.remove("show");' +
    '    chevron.classList.remove("open");' +
    '  } else {' +
    '    body.classList.add("show");' +
    '    chevron.classList.add("open");' +
    '  }' +
    '}' +
    '</script>';

  html += '<h2>📊 Safety Compliance Dashboard</h2>';

  // Summary boxes for current week
  html += '<div class="summary">';
  html += '<div class="stat-box good"><div class="stat-number">' + complianceData.compliantCount + '</div><div class="stat-label">✅ Compliant</div></div>';

  if (complianceData.isPastDeadline) {
    html += '<div class="stat-box bad"><div class="stat-number">' + complianceData.missingCount + '</div><div class="stat-label">❌ Missing</div></div>';
  } else {
    var pendingCount = complianceData.totalCrews - complianceData.compliantCount - complianceData.missingCount;
    html += '<div class="stat-box pending"><div class="stat-number">' + pendingCount + '</div><div class="stat-label">⏳ Pending</div></div>';
  }

  html += '<div class="stat-box"><div class="stat-number">' + complianceData.totalCrews + '</div><div class="stat-label">Total Crews</div></div>';
  html += '</div>';

  // CURRENT WEEK - Always expanded
  html += '<div class="week-card">';
  html += '<div class="week-header current" onclick="toggleWeek(0)">';
  html += '<div class="week-title"><span class="chevron open" id="week-chevron-0">▶</span><i>📅</i> Week of ' + weekStartStr + ' - ' + weekEndStr + ' <span style="font-size:12px; opacity:0.8;">(Current Week)</span></div>';
  html += '<div class="week-badges">';
  if (complianceData.missingCount > 0) {
    html += '<span class="week-badge bad">' + complianceData.missingCount + ' missing</span>';
  }
  html += '<span class="week-badge">' + complianceData.compliantCount + '/' + complianceData.totalCrews + ' compliant</span>';
  html += '</div>';
  html += '</div>';

  // Current week table - starts visible
  html += '<div class="week-body show" id="week-body-0">';
  html += '<table>';
  html += '<tr><th style="text-align:left; width:80px;">Crew</th><th style="text-align:left; width:120px;">Foreman</th><th>Sun</th><th>Mon</th><th>Tue</th><th>Wed</th><th>Thu</th><th>Fri</th><th>Sat</th><th>Weekly Mtg</th></tr>';

  for (var jobNumber in complianceData.crews) {
    var crew = complianceData.crews[jobNumber];
    var rowClass = crew.status === "Missing Reports" ? ' class="row-problem"' : '';

    html += '<tr' + rowClass + '>';
    html += '<td class="crew-name">' + jobNumber + '</td>';
    html += '<td class="foreman-name">' + (crew.foreman || '-') + '</td>';

    for (var day = 0; day < 7; day++) {
      var status = crew.jha[day];
      var cssClass = '';
      if (status === '✅') cssClass = 'status-ok';
      else if (status === '❌') cssClass = 'status-missing';
      else if (status === '⏳') cssClass = 'status-pending';
      else cssClass = 'status-na';
      html += '<td class="' + cssClass + '">' + status + '</td>';
    }

    var meetingClass = '';
    if (crew.weeklyMeeting === '✅') meetingClass = 'status-ok';
    else if (crew.weeklyMeeting === '❌') meetingClass = 'status-missing';
    else if (crew.weeklyMeeting === '⏳') meetingClass = 'status-pending';
    else meetingClass = 'status-na';
    html += '<td class="' + meetingClass + '">' + crew.weeklyMeeting + '</td>';

    html += '</tr>';
  }
  html += '</table>';
  html += '</div></div>'; // Close week-body and week-card

  // HISTORICAL WEEKS - Collapsible
  if (historicalWeeks && historicalWeeks.length > 0) {
    html += '<h3 style="margin-top: 25px;">📜 Previous Weeks</h3>';

    for (var w = 0; w < historicalWeeks.length; w++) {
      var week = historicalWeeks[w];
      var weekIdx = w + 1; // offset by 1 since current week is 0

      var headerClass = 'past';
      if (week.missingCount > 0) headerClass = 'problem';
      else if (week.compliantCount === week.totalCrews) headerClass = 'good';

      html += '<div class="week-card">';
      html += '<div class="week-header ' + headerClass + '" onclick="toggleWeek(' + weekIdx + ')">';
      html += '<div class="week-title"><span class="chevron" id="week-chevron-' + weekIdx + '">▶</span><i>📅</i> Week of ' + week.weekStartStr + ' - ' + week.weekEndStr + '</div>';
      html += '<div class="week-badges">';
      if (week.missingCount > 0) {
        html += '<span class="week-badge bad">' + week.missingCount + ' missing</span>';
      }
      html += '<span class="week-badge">' + week.compliantCount + '/' + week.totalCrews + ' compliant</span>';
      html += '</div>';
      html += '</div>';

      // Week body - starts collapsed
      html += '<div class="week-body" id="week-body-' + weekIdx + '">';
      html += '<table>';
      html += '<tr><th style="text-align:left; width:80px;">Crew</th><th style="text-align:left; width:120px;">Foreman</th><th>Sun</th><th>Mon</th><th>Tue</th><th>Wed</th><th>Thu</th><th>Fri</th><th>Sat</th><th>Weekly Mtg</th></tr>';

      for (var c = 0; c < week.crews.length; c++) {
        var crewData = week.crews[c];
        var crewRowClass = crewData.hasMissing ? ' class="row-problem"' : '';

        html += '<tr' + crewRowClass + '>';
        html += '<td class="crew-name">' + crewData.jobNumber + '</td>';
        html += '<td class="foreman-name">' + (crewData.foreman || '-') + '</td>';

        for (var d = 0; d < 7; d++) {
          var dayStatus = crewData.jha[d] || 'N/A';
          var dayCssClass = '';
          if (dayStatus === '✅') dayCssClass = 'status-ok';
          else if (dayStatus === '❌') dayCssClass = 'status-missing';
          else dayCssClass = 'status-na';
          html += '<td class="' + dayCssClass + '">' + dayStatus + '</td>';
        }

        var mtgStatus = crewData.weeklyMeeting || 'N/A';
        var mtgCssClass = '';
        if (mtgStatus === '✅') mtgCssClass = 'status-ok';
        else if (mtgStatus === '❌') mtgCssClass = 'status-missing';
        else mtgCssClass = 'status-na';
        html += '<td class="' + mtgCssClass + '">' + mtgStatus + '</td>';

        html += '</tr>';
      }
      html += '</table>';
      html += '</div></div>'; // Close week-body and week-card
    }
  }

  // Trend analysis (crews with issues in last 4 weeks)
  var problemCrews = trends.filter(function(t) { return t.missedJhaCount > 0 || t.missedMeetingCount > 0; });

  if (problemCrews.length > 0) {
    html += '<div class="trend-section">';
    html += '<h3 style="margin-top:0;">⚠️ Crews with Issues (Last 4 Weeks)</h3>';
    html += '<table>';
    html += '<tr><th style="text-align:left;">Crew</th><th style="text-align:left;">Foreman</th><th>Missed JHAs</th><th>Missed Meetings</th><th>Compliance Rate</th></tr>';

    for (var i = 0; i < problemCrews.length; i++) {
      var t = problemCrews[i];
      var trendRowClass = t.complianceRate < 80 ? ' class="trend-row-bad"' : (t.complianceRate < 95 ? ' class="trend-row-warning"' : '');

      html += '<tr' + trendRowClass + '>';
      html += '<td style="text-align:left; font-weight:600;">' + t.jobNumber + '</td>';
      html += '<td style="text-align:left;">' + (t.foreman || '-') + '</td>';
      html += '<td>' + t.missedJhaCount + '</td>';
      html += '<td>' + t.missedMeetingCount + '</td>';
      html += '<td>' + t.complianceRate + '%</td>';
      html += '</tr>';
    }
    html += '</table>';
    html += '</div>';
  } else {
    html += '<div class="trend-section" style="text-align:center; color: #28a745;">';
    html += '<h3 style="margin-top:0;">✅ All Crews Compliant (Last 4 Weeks)</h3>';
    html += '<p>No crews have missed any JHAs or Weekly Safety Meetings in the last 4 weeks.</p>';
    html += '</div>';
  }

  // Action buttons
  html += '<div style="margin-top: 20px; text-align: center;">';
  html += '<button onclick="google.script.run.openComplianceConfig()">⚙️ Configure Exclusions</button>';
  html += '<button onclick="google.script.run.openComplianceSheet()">📈 View Full History</button>';
  html += '<button class="secondary" onclick="google.script.host.close()">Close</button>';
  html += '</div>';

  var output = HtmlService.createHtmlOutput(html)
    .setWidth(1000)
    .setHeight(800);

  SpreadsheetApp.getUi().showModalDialog(output, "Safety Compliance Dashboard");
}

/**
 * Opens the Safety Compliance Config sheet
 */
function openComplianceConfig() {
  var html = HtmlService.createHtmlOutputFromFile('ComplianceConfig')
    .setWidth(1200)
    .setHeight(800);
  SpreadsheetApp.getUi().showModalDialog(html, '🛡️ Safety Compliance Config');
}

/**
 * Gets the compliance config data for the HTML dialog
 * @returns {Array} Array of crew config objects
 */
function getComplianceConfigData() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("Safety Compliance Config");

  // If sheet doesn't exist, create it first
  if (!sheet) {
    setupSafetyComplianceConfig();
    sheet = ss.getSheetByName("Safety Compliance Config");
  }

  if (!sheet || sheet.getLastRow() < 2) {
    return [];
  }

  var data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 12).getValues();
  var result = [];

  for (var i = 0; i < data.length; i++) {
    var row = data[i];
    if (!row[0]) continue; // Skip empty rows

    result.push({
      jobNumber: String(row[0]).trim(),
      foreman: String(row[1] || '').trim(),
      skipSun: row[2] === true,
      skipMon: row[3] === true,
      skipTue: row[4] === true,
      skipWed: row[5] === true,
      skipThu: row[6] === true,
      skipFri: row[7] === true,
      skipSat: row[8] === true,
      skipWeeklyMeeting: row[9] === true,
      skipMonthlyChecklist: row[10] === true,
      notes: String(row[11] || '').trim()
    });
  }

  return result;
}

/**
 * Saves the compliance config data from the HTML dialog
 * @param {Array} configData - Array of crew config objects
 */
function saveComplianceConfigData(configData) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("Safety Compliance Config");

  if (!sheet) {
    throw new Error("Safety Compliance Config sheet not found");
  }

  // Clear existing data (keep headers)
  if (sheet.getLastRow() > 1) {
    sheet.getRange(2, 1, sheet.getLastRow() - 1, 12).clearContent();
  }

  if (!configData || configData.length === 0) {
    return;
  }

  // Build rows array
  var rows = [];
  for (var i = 0; i < configData.length; i++) {
    var crew = configData[i];
    rows.push([
      crew.jobNumber,
      crew.foreman,
      crew.skipSun === true,
      crew.skipMon === true,
      crew.skipTue === true,
      crew.skipWed === true,
      crew.skipThu === true,
      crew.skipFri === true,
      crew.skipSat === true,
      crew.skipWeeklyMeeting === true,
      crew.skipMonthlyChecklist === true,
      crew.notes || ''
    ]);
  }

  // Write data
  sheet.getRange(2, 1, rows.length, 12).setValues(rows);

  // Re-add checkboxes for skip columns (C-K = columns 3-11)
  var checkboxRange = sheet.getRange(2, 3, rows.length, 9);
  checkboxRange.insertCheckboxes();

  Logger.log("Saved compliance config for " + rows.length + " crews");

  // IMPORTANT: Recalculate CURRENT WEEK compliance to apply N/A changes immediately
  // This updates the Safety Compliance sheet for the current week only, not past weeks
  try {
    var today = new Date();
    var weekBounds = getWeekBoundaries(today);
    Logger.log("Recalculating current week compliance after config change...");
    var complianceData = calculateSafetyCompliance(weekBounds.weekStart);
    updateComplianceSheet(complianceData);
    Logger.log("Current week compliance updated successfully");
  } catch (e) {
    Logger.log("Warning: Could not recalculate current week compliance: " + e.toString());
    // Don't throw - config was saved successfully, just log the warning
  }
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
 * Builds SMS message for missing safety reports
 *
 * @param {Object} task - Task object with itemType and notes
 * @returns {string} - SMS message text
 */
function buildMissingSafetyReportSmsMessage(task) {
  var itemType = task.itemType || task.ItemType || "";
  var notes = task.notes || task.Notes || "";

  // Extract dates from notes
  var jhaDateMatch = notes.match(/Missing JHA:\s*([^;]+)/);
  var weekOfMatch = notes.match(/week of\s+(\d{2}\/\d{2}\/\d{4})/i);

  var jhaDates = jhaDateMatch ? jhaDateMatch[1].trim() : "";
  var weekOf = weekOfMatch ? weekOfMatch[1] : "";

  // Count JHA dates for grammar
  var jhaDateCount = jhaDates ? jhaDates.split(",").length : 0;
  var itThem = jhaDateCount > 1 ? "them" : "it";

  var message = "";

  if (itemType === "JHA + Weekly Meeting") {
    message = "We did not receive a JHA for " + jhaDates + " or a Weekly Safety Meeting for the week of " + weekOf + " from your crew. This is just a reminder not to miss them this week. Was there an issue turning them in that you need help with?";
  } else if (itemType === "JHA") {
    message = "We did not receive a JHA for " + jhaDates + " from your crew. This is just a reminder not to miss " + itThem + " this week. Was there an issue turning " + itThem + " in that you need help with?";
  } else if (itemType === "Weekly Meeting") {
    message = "We did not receive a Weekly Safety Meeting for the week of " + weekOf + " from your crew. This is just a reminder not to miss it this week. Was there an issue turning it in that you need help with?";
  } else {
    message = "We did not receive a safety report from your crew. This is just a reminder not to miss it this week. Was there an issue turning it in that you need help with?";
  }

  return message;
}

