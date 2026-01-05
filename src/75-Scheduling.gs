/**
 * Glove Manager – Scheduling System
 *
 * Functions for managing crew visit schedules and training calendar.
 * Provides monthly calendar view with time estimates and route optimization.
 */

// ============================================================================
// SHEET NAMES
// ============================================================================

var SHEET_CREW_VISIT_CONFIG = 'Crew Visit Config';
var SHEET_TRAINING_CONFIG = 'Training Config';
var SHEET_SCHEDULE = 'Schedule';

// ============================================================================
// DATE CALCULATION FUNCTIONS
// ============================================================================

/**
 * Calculates the next visit date based on last visit and frequency.
 *
 * @param {Date} lastVisitDate - Date of last visit
 * @param {string} frequency - 'Weekly', 'Bi-Weekly', or 'Monthly'
 * @return {Date} Next visit date
 */
function calculateNextVisitDate(lastVisitDate, frequency) {
  if (!lastVisitDate) return new Date();

  var nextDate = new Date(lastVisitDate);
  var freqLower = frequency.toString().toLowerCase();

  if (freqLower === 'weekly') {
    nextDate.setDate(nextDate.getDate() + 7);
  } else if (freqLower === 'bi-weekly') {
    nextDate.setDate(nextDate.getDate() + 14);
  } else if (freqLower === 'monthly') {
    nextDate.setMonth(nextDate.getMonth() + 1);
  } else {
    nextDate.setDate(nextDate.getDate() + 30);
  }

  return nextDate;
}

/**
 * Calculates the next training date based on last training and frequency.
 *
 * @param {Date} lastDate - Date of last training
 * @param {string} frequency - 'Monthly', 'Quarterly', or 'Annual'
 * @return {Date} Next training date
 */
function calculateNextTrainingDate(lastDate, frequency) {
  if (!lastDate) return new Date();

  var nextDate = new Date(lastDate);
  var freqLower = frequency.toString().toLowerCase();

  if (freqLower === 'monthly') {
    nextDate.setMonth(nextDate.getMonth() + 1);
  } else if (freqLower === 'quarterly') {
    nextDate.setMonth(nextDate.getMonth() + 3);
  } else if (freqLower === 'annual') {
    nextDate.setFullYear(nextDate.getFullYear() + 1);
  } else {
    nextDate.setMonth(nextDate.getMonth() + 1);
  }

  return nextDate;
}

// ============================================================================
// CREW VISIT FUNCTIONS
// ============================================================================

/**
 * Gets all crew visits scheduled for a specific month.
 *
 * @param {number} year - Year (e.g., 2026)
 * @param {number} month - Month (1-12)
 * @return {Array} Array of crew visit objects
 */
function getCrewVisitsForMonth(year, month) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var configSheet = ss.getSheetByName(SHEET_CREW_VISIT_CONFIG);

  if (!configSheet || configSheet.getLastRow() < 2) {
    return [];
  }

  var data = configSheet.getDataRange().getValues();
  var headers = data[0];
  var visits = [];

  // Find column indices
  var colIndices = {};
  for (var h = 0; h < headers.length; h++) {
    var header = String(headers[h]).toLowerCase().trim();
    if (header === 'job number') colIndices.jobNumber = h;
    if (header === 'location') colIndices.location = h;
    if (header === 'crew lead') colIndices.crewLead = h;
    if (header === 'crew size') colIndices.crewSize = h;
    if (header === 'visit frequency') colIndices.frequency = h;
    if (header === 'est. visit time') colIndices.visitTime = h;
    if (header === 'last visit date') colIndices.lastVisit = h;
    if (header === 'next visit date') colIndices.nextVisit = h;
    if (header === 'drive time from helena') colIndices.driveTime = h;
    if (header === 'priority') colIndices.priority = h;
  }

  // Process each crew visit configuration
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var jobNumber = row[colIndices.jobNumber];

    if (!jobNumber) continue;

    var lastVisit = row[colIndices.lastVisit];
    var frequency = row[colIndices.frequency] || 'Monthly';

    // Calculate all visit dates for this month
    var visitDates = calculateVisitDatesForMonth(lastVisit, frequency, year, month);

    // Create a visit object for each date
    visitDates.forEach(function(date) {
      visits.push({
        date: date,
        jobNumber: jobNumber,
        location: row[colIndices.location] || '',
        crewLead: row[colIndices.crewLead] || '',
        crewSize: row[colIndices.crewSize] || 0,
        frequency: frequency,
        visitTime: row[colIndices.visitTime] || 45,
        driveTime: row[colIndices.driveTime] || 0,
        priority: row[colIndices.priority] || 'Medium'
      });
    });
  }

  return visits;
}

/**
 * Calculates all visit dates for a specific month based on frequency.
 *
 * @param {Date} lastVisit - Last visit date
 * @param {string} frequency - Visit frequency
 * @param {number} year - Target year
 * @param {number} month - Target month (1-12)
 * @return {Array} Array of Date objects
 */
function calculateVisitDatesForMonth(lastVisit, frequency, year, month) {
  var dates = [];
  var startDate = new Date(year, month - 1, 1); // First day of month
  var endDate = new Date(year, month, 0); // Last day of month

  var currentDate = lastVisit ? new Date(lastVisit) : new Date(year, month - 1, 1);

  // Calculate next visit after last visit
  currentDate = calculateNextVisitDate(currentDate, frequency);

  // Find all visits within the target month
  while (currentDate <= endDate) {
    if (currentDate >= startDate && currentDate <= endDate) {
      dates.push(new Date(currentDate));
    }
    currentDate = calculateNextVisitDate(currentDate, frequency);
  }

  return dates;
}

/**
 * Updates a crew visit after completion.
 *
 * @param {string} jobNumber - Job number that was visited
 * @param {Date} visitDate - Date of the visit
 */
function updateCrewVisit(jobNumber, visitDate) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var configSheet = ss.getSheetByName(SHEET_CREW_VISIT_CONFIG);

  if (!configSheet) return;

  var data = configSheet.getDataRange().getValues();
  var headers = data[0];

  // Find job number column and last visit column
  var jobNumCol = -1;
  var lastVisitCol = -1;
  var nextVisitCol = -1;
  var frequencyCol = -1;

  for (var h = 0; h < headers.length; h++) {
    var header = String(headers[h]).toLowerCase().trim();
    if (header === 'job number') jobNumCol = h;
    if (header === 'last visit date') lastVisitCol = h;
    if (header === 'next visit date') nextVisitCol = h;
    if (header === 'visit frequency') frequencyCol = h;
  }

  if (jobNumCol === -1 || lastVisitCol === -1) return;

  // Find the row with this job number
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][jobNumCol]).trim() === String(jobNumber).trim()) {
      var row = i + 1; // 1-based row number

      // Update last visit date
      configSheet.getRange(row, lastVisitCol + 1).setValue(visitDate);

      // Calculate and update next visit date
      if (nextVisitCol !== -1 && frequencyCol !== -1) {
        var frequency = data[i][frequencyCol];
        var nextVisit = calculateNextVisitDate(visitDate, frequency);
        configSheet.getRange(row, nextVisitCol + 1).setValue(nextVisit);
      }

      break;
    }
  }
}

// ============================================================================
// TRAINING FUNCTIONS
// ============================================================================

/**
 * Gets all training sessions scheduled for a specific month.
 *
 * @param {number} year - Year (e.g., 2026)
 * @param {number} month - Month (1-12)
 * @return {Array} Array of training objects
 */
function getTrainingForMonth(year, month) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var configSheet = ss.getSheetByName(SHEET_TRAINING_CONFIG);

  if (!configSheet || configSheet.getLastRow() < 2) {
    return [];
  }

  var data = configSheet.getDataRange().getValues();
  var headers = data[0];
  var training = [];

  // Find column indices
  var colIndices = {};
  for (var h = 0; h < headers.length; h++) {
    var header = String(headers[h]).toLowerCase().trim();
    if (header === 'training topic') colIndices.topic = h;
    if (header === 'required for') colIndices.requiredFor = h;
    if (header === 'duration') colIndices.duration = h;
    if (header === 'frequency') colIndices.frequency = h;
    if (header === 'last training date') colIndices.lastDate = h;
    if (header === 'next training date') colIndices.nextDate = h;
  }

  var startDate = new Date(year, month - 1, 1);
  var endDate = new Date(year, month, 0);

  // Process each training configuration
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var topic = row[colIndices.topic];

    if (!topic) continue;

    var nextDate = row[colIndices.nextDate];
    if (!nextDate) continue;

    var nextDateObj = new Date(nextDate);

    // Check if this training is scheduled in the target month
    if (nextDateObj >= startDate && nextDateObj <= endDate) {
      training.push({
        date: nextDateObj,
        topic: topic,
        requiredFor: row[colIndices.requiredFor] || 'All',
        duration: row[colIndices.duration] || 1,
        frequency: row[colIndices.frequency] || 'Quarterly'
      });
    }
  }

  return training;
}

/**
 * Updates training completion.
 *
 * @param {string} topic - Training topic
 * @param {Date} completionDate - Date training was completed
 */
function updateTrainingCompletion(topic, completionDate) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var configSheet = ss.getSheetByName(SHEET_TRAINING_CONFIG);

  if (!configSheet) return;

  var data = configSheet.getDataRange().getValues();
  var headers = data[0];

  // Find columns
  var topicCol = -1;
  var lastDateCol = -1;
  var nextDateCol = -1;
  var frequencyCol = -1;

  for (var h = 0; h < headers.length; h++) {
    var header = String(headers[h]).toLowerCase().trim();
    if (header === 'training topic') topicCol = h;
    if (header === 'last training date') lastDateCol = h;
    if (header === 'next training date') nextDateCol = h;
    if (header === 'frequency') frequencyCol = h;
  }

  if (topicCol === -1 || lastDateCol === -1) return;

  // Find the row with this topic
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][topicCol]).trim().toLowerCase() === topic.toLowerCase()) {
      var row = i + 1; // 1-based

      // Update last training date
      configSheet.getRange(row, lastDateCol + 1).setValue(completionDate);

      // Calculate and update next training date
      if (nextDateCol !== -1 && frequencyCol !== -1) {
        var frequency = data[i][frequencyCol];
        var nextDate = calculateNextTrainingDate(completionDate, frequency);
        configSheet.getRange(row, nextDateCol + 1).setValue(nextDate);
      }

      break;
    }
  }
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Formats time in minutes to "Xh Ym" format.
 *
 * @param {number} minutes - Time in minutes
 * @return {string} Formatted time string
 */
function formatTimeEstimate(minutes) {
  if (!minutes || minutes === 0) return '0m';

  var hours = Math.floor(minutes / 60);
  var mins = minutes % 60;

  if (hours === 0) return mins + 'm';
  if (mins === 0) return hours + 'h';
  return hours + 'h ' + mins + 'm';
}

/**
 * Gets month name from month number.
 *
 * @param {number} monthNumber - Month (1-12)
 * @return {string} Month name
 */
function getMonthName(monthNumber) {
  var months = ['January', 'February', 'March', 'April', 'May', 'June',
                'July', 'August', 'September', 'October', 'November', 'December'];
  return months[monthNumber - 1] || 'Unknown';
}

/**
 * Gets weekday name from date.
 *
 * @param {Date} date - Date object
 * @return {string} Weekday name
 */
function getWeekdayName(date) {
  var days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  return days[date.getDay()];
}

// ============================================================================
// SHEET SETUP FUNCTIONS
// ============================================================================

/**
 * Creates and sets up the Crew Visit Config sheet with sample data.
 * Menu item: Glove Manager → Schedule → Setup Crew Visit Config
 */
function setupCrewVisitConfig() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_CREW_VISIT_CONFIG);

  if (!sheet) {
    sheet = ss.insertSheet(SHEET_CREW_VISIT_CONFIG);
  }

  sheet.clear();

  // Headers
  var headers = [
    'Job Number',
    'Location',
    'Crew Lead',
    'Crew Size',
    'Visit Frequency',
    'Est. Visit Time',
    'Last Visit Date',
    'Next Visit Date',
    'Drive Time From Helena',
    'Priority',
    'Notes'
  ];

  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.getRange(1, 1, 1, headers.length)
    .setFontWeight('bold')
    .setBackground('#4285f4')
    .setFontColor('white')
    .setHorizontalAlignment('center');

  // Sample data
  var today = new Date();
  var lastWeek = new Date(today);
  lastWeek.setDate(lastWeek.getDate() - 7);

  var sampleData = [
    ['12345', 'Big Sky', 'John Smith', 8, 'Weekly', 45, lastWeek, calculateNextVisitDate(lastWeek, 'Weekly'), 90, 'High', 'Check arc flash equipment'],
    ['12346', 'Missoula', 'Jane Doe', 12, 'Bi-Weekly', 60, lastWeek, calculateNextVisitDate(lastWeek, 'Bi-Weekly'), 120, 'High', 'Large crew, plan extra time'],
    ['12347', 'Kalispell', 'Bob Johnson', 6, 'Monthly', 45, lastWeek, calculateNextVisitDate(lastWeek, 'Monthly'), 180, 'Medium', ''],
    ['12348', 'Ennis', 'Mike Wilson', 4, 'Weekly', 30, lastWeek, calculateNextVisitDate(lastWeek, 'Weekly'), 60, 'Medium', 'Small crew, quick visit'],
    ['12349', 'Butte', 'Tom Anderson', 10, 'Monthly', 45, lastWeek, calculateNextVisitDate(lastWeek, 'Monthly'), 90, 'Medium', '']
  ];

  sheet.getRange(2, 1, sampleData.length, headers.length).setValues(sampleData);

  // Format dates
  sheet.getRange(2, 7, sampleData.length, 2).setNumberFormat('mm/dd/yyyy');

  // Add data validation for frequency
  var frequencyRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(['Weekly', 'Bi-Weekly', 'Monthly'], true)
    .setAllowInvalid(false)
    .build();
  sheet.getRange(2, 5, 100, 1).setDataValidation(frequencyRule);

  // Add data validation for priority
  var priorityRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(['High', 'Medium', 'Low'], true)
    .setAllowInvalid(false)
    .build();
  sheet.getRange(2, 10, 100, 1).setDataValidation(priorityRule);

  // Auto-resize columns
  for (var i = 1; i <= headers.length; i++) {
    sheet.autoResizeColumn(i);
  }

  // Set minimum widths
  sheet.setColumnWidth(1, 100);  // Job Number
  sheet.setColumnWidth(2, 120);  // Location
  sheet.setColumnWidth(3, 120);  // Crew Lead
  sheet.setColumnWidth(11, 200); // Notes

  sheet.setFrozenRows(1);

  SpreadsheetApp.getUi().alert('✅ Crew Visit Config sheet created with sample data!');
}

/**
 * Creates and sets up the Training Config sheet with sample data.
 * Menu item: Glove Manager → Schedule → Setup Training Config
 */
function setupTrainingConfig() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_TRAINING_CONFIG);

  if (!sheet) {
    sheet = ss.insertSheet(SHEET_TRAINING_CONFIG);
  }

  sheet.clear();

  // Headers
  var headers = [
    'Training Topic',
    'Required For',
    'Duration (Hours)',
    'Frequency',
    'Last Training Date',
    'Next Training Date',
    'Required Attendees',
    'Completion Status',
    'Notes'
  ];

  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.getRange(1, 1, 1, headers.length)
    .setFontWeight('bold')
    .setBackground('#0f9d58')
    .setFontColor('white')
    .setHorizontalAlignment('center');

  // NECA/IBEW Monthly Safety Training Schedule 2026
  var sampleData = [
    ['January: Respectful Workplace – Anti Harassment Training', 'All', 2, 'Monthly', new Date(2026, 0, 15), new Date(2026, 1, 15), 0, '0%', 'Required monthly safety training'],
    ['February: Job Briefings / JHA\'s / Emergency Action Plans', 'All', 2, 'Monthly', new Date(2026, 1, 15), new Date(2026, 2, 15), 0, '0%', 'Required monthly safety training'],
    ['March: OSHA ET&D 10 HR Refresher 1st Quarter', 'All', 10, 'Quarterly', new Date(2026, 2, 15), new Date(2026, 5, 15), 0, '0%', 'OSHA Certification - Q1'],
    ['April: Trenching & Shoring / Haz-Com Awareness', 'All', 2, 'Monthly', new Date(2026, 3, 15), new Date(2026, 4, 15), 0, '0%', 'Required monthly safety training'],
    ['May: Heat Stress & Wildfire Smoke', 'All', 2, 'Monthly', new Date(2026, 4, 15), new Date(2026, 5, 15), 0, '0%', 'Required monthly safety training'],
    ['June: OSHA ET&D 10 HR Refresher 2nd Quarter', 'All', 10, 'Quarterly', new Date(2026, 5, 15), new Date(2026, 8, 15), 0, '0%', 'OSHA Certification - Q2'],
    ['July: Rescue', 'All', 2, 'Monthly', new Date(2026, 6, 15), new Date(2026, 7, 15), 0, '0%', 'Emergency Response Training'],
    ['August: Rescue (continued)', 'All', 2, 'Monthly', new Date(2026, 7, 15), new Date(2026, 8, 15), 0, '0%', 'Emergency Response Training'],
    ['September: OSHA ET&D 10 HR Refresher 3rd Quarter', 'All', 10, 'Quarterly', new Date(2026, 8, 15), new Date(2026, 10, 15), 0, '0%', 'OSHA Certification - Q3'],
    ['October: Back Feed / Winter Driving', 'All', 2, 'Monthly', new Date(2026, 9, 15), new Date(2026, 10, 15), 0, '0%', 'Operational Safety'],
    ['November: OSHA ET&D 10 HR Refresher 4th Quarter', 'All', 10, 'Quarterly', new Date(2026, 10, 15), new Date(2027, 0, 15), 0, '0%', 'OSHA Certification - Q4'],
    ['December: Catch up month', 'All', 2, 'Monthly', new Date(2026, 11, 15), new Date(2027, 0, 15), 0, '0%', 'Complete any missed training']
  ];

  sheet.getRange(2, 1, sampleData.length, headers.length).setValues(sampleData);

  // Format dates
  sheet.getRange(2, 5, sampleData.length, 2).setNumberFormat('mm/dd/yyyy');

  // Add data validation for frequency
  var frequencyRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(['Monthly', 'Quarterly', 'Annual'], true)
    .setAllowInvalid(false)
    .build();
  sheet.getRange(2, 4, 100, 1).setDataValidation(frequencyRule);

  // Auto-resize columns
  for (var i = 1; i <= headers.length; i++) {
    sheet.autoResizeColumn(i);
  }

  // Set minimum widths
  sheet.setColumnWidth(1, 200);  // Training Topic
  sheet.setColumnWidth(2, 150);  // Required For
  sheet.setColumnWidth(9, 200);  // Notes

  sheet.setFrozenRows(1);

  SpreadsheetApp.getUi().alert('✅ Training Config sheet created with sample data!');
}

/**
 * Creates and sets up all scheduling sheets with sample data.
 * Menu item: Glove Manager → Schedule → Setup All Schedule Sheets
 */
function setupAllScheduleSheets() {
  setupCrewVisitConfig();
  setupTrainingConfig();
  setupTrainingTracking();
  SpreadsheetApp.getUi().alert('✅ All scheduling configuration sheets created!\n\nCreated:\n- Crew Visit Config\n- Training Config\n- Training Tracking');
}

// ============================================================================
// TRAINING TRACKING BY JOB NUMBER
// ============================================================================

var SHEET_TRAINING_TRACKING = 'Training Tracking';

/**
 * Creates and sets up the Training Tracking sheet for job number compliance.
 * Menu item: Glove Manager → Schedule → Setup Training Tracking
 */
function setupTrainingTracking() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_TRAINING_TRACKING);

  if (!sheet) {
    sheet = ss.insertSheet(SHEET_TRAINING_TRACKING);
  }

  sheet.clear();

  // Title row
  sheet.getRange(1, 1, 1, 10).merge()
    .setValue('NECA/IBEW Monthly Safety Training Tracking 2026')
    .setFontWeight('bold').setFontSize(14).setBackground('#0f9d58').setFontColor('white').setHorizontalAlignment('center');
  sheet.setRowHeight(1, 35);

  // Headers
  var headers = [
    'Month',
    'Training Topic',
    'Job Number',
    'Completion Date',
    'Attendees',
    'Hours',
    'Trainer',
    'Status',
    'Verified By',
    'Notes'
  ];

  sheet.getRange(2, 1, 1, headers.length).setValues([headers]);
  sheet.getRange(2, 1, 1, headers.length)
    .setFontWeight('bold')
    .setBackground('#0f9d58')
    .setFontColor('white')
    .setHorizontalAlignment('center');

  // Sample data showing tracking structure
  var sampleData = [
    ['January', 'Respectful Workplace – Anti Harassment Training', '123.45', '', '', 2, '', 'Pending', '', 'Required for all jobs'],
    ['January', 'Respectful Workplace – Anti Harassment Training', '456.78', '', '', 2, '', 'Pending', '', 'Required for all jobs'],
    ['February', 'Job Briefings / JHA\'s / Emergency Action Plans', '123.45', '', '', 2, '', 'Pending', '', 'Required for all jobs'],
    ['March', 'OSHA ET&D 10 HR Refresher 1st Quarter', '123.45', '', '', 10, '', 'Pending', '', 'Quarterly OSHA - Q1'],
    ['March', 'OSHA ET&D 10 HR Refresher 1st Quarter', '456.78', '', '', 10, '', 'Pending', '', 'Quarterly OSHA - Q1']
  ];

  sheet.getRange(3, 1, sampleData.length, headers.length).setValues(sampleData);

  // Format dates
  sheet.getRange(3, 4, 100, 1).setNumberFormat('mm/dd/yyyy');

  // Add data validation for Status
  var statusRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(['Pending', 'In Progress', 'Complete', 'Overdue', 'N/A'], true)
    .setAllowInvalid(false)
    .build();
  sheet.getRange(3, 8, 100, 1).setDataValidation(statusRule);

  // Add data validation for Month
  var months = ['January', 'February', 'March', 'April', 'May', 'June',
                'July', 'August', 'September', 'October', 'November', 'December'];
  var monthRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(months, true)
    .setAllowInvalid(false)
    .build();
  sheet.getRange(3, 1, 100, 1).setDataValidation(monthRule);

  // Conditional formatting for Status
  var completeRange = sheet.getRange(3, 8, 100, 1);
  var completeRule = SpreadsheetApp.newConditionalFormatRule()
    .whenTextEqualTo('Complete')
    .setBackground('#d9ead3')
    .setFontColor('#38761d')
    .setRanges([completeRange])
    .build();

  var overdueRule = SpreadsheetApp.newConditionalFormatRule()
    .whenTextEqualTo('Overdue')
    .setBackground('#f4cccc')
    .setFontColor('#cc0000')
    .setRanges([completeRange])
    .build();

  var inProgressRule = SpreadsheetApp.newConditionalFormatRule()
    .whenTextEqualTo('In Progress')
    .setBackground('#fff2cc')
    .setFontColor('#bf9000')
    .setRanges([completeRange])
    .build();

  var rules = sheet.getConditionalFormatRules();
  rules.push(completeRule, overdueRule, inProgressRule);
  sheet.setConditionalFormatRules(rules);

  // Auto-resize columns
  for (var i = 1; i <= headers.length; i++) {
    sheet.autoResizeColumn(i);
  }

  // Set minimum widths
  sheet.setColumnWidth(1, 100);  // Month
  sheet.setColumnWidth(2, 300);  // Training Topic
  sheet.setColumnWidth(3, 100);  // Job Number
  sheet.setColumnWidth(5, 150);  // Attendees
  sheet.setColumnWidth(10, 200); // Notes

  sheet.setFrozenRows(2);

  SpreadsheetApp.getUi().alert('✅ Training Tracking sheet created!\n\nThis sheet tracks training completion by job number.\nAdd your job numbers and update completion dates as training is completed.');
}

/**
 * Gets training compliance status for a specific job number.
 *
 * @param {string} jobNumber - Job number (format: ###.##)
 * @param {string} month - Month name (e.g., 'January')
 * @return {Object} Compliance status object
 */
function getTrainingComplianceStatus(jobNumber, month) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var trackingSheet = ss.getSheetByName(SHEET_TRAINING_TRACKING);

  if (!trackingSheet) {
    return {found: false, status: 'No tracking sheet'};
  }

  var data = trackingSheet.getDataRange().getValues();
  var headers = data[1]; // Row 2 (index 1) has headers due to title row

  // Find column indices
  var colIndices = {};
  for (var h = 0; h < headers.length; h++) {
    var header = String(headers[h]).toLowerCase().trim();
    if (header === 'month') colIndices.month = h;
    if (header === 'job number') colIndices.jobNumber = h;
    if (header === 'status') colIndices.status = h;
    if (header === 'completion date') colIndices.completionDate = h;
    if (header === 'training topic') colIndices.topic = h;
  }

  // Search for this job number and month
  for (var i = 2; i < data.length; i++) { // Start at row 3 (index 2) - skip title and headers
    var row = data[i];
    var rowMonth = String(row[colIndices.month]).trim();
    var rowJobNum = String(row[colIndices.jobNumber]).trim();

    if (rowMonth === month && rowJobNum === jobNumber) {
      return {
        found: true,
        status: row[colIndices.status] || 'Pending',
        completionDate: row[colIndices.completionDate],
        topic: row[colIndices.topic]
      };
    }
  }

  return {found: false, status: 'Not tracked'};
}

/**
 * Generates a compliance report showing training status for all job numbers.
 * Menu item: Glove Manager → Schedule → Generate Training Compliance Report
 */
function generateTrainingComplianceReport() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var trackingSheet = ss.getSheetByName(SHEET_TRAINING_TRACKING);

  if (!trackingSheet) {
    SpreadsheetApp.getUi().alert('❌ Training Tracking sheet not found!\n\nPlease run "Setup Training Tracking" first.');
    return;
  }

  var data = trackingSheet.getDataRange().getValues();
  var headers = data[1];

  // Count completions by job number
  var jobStats = {};
  var totalRequired = 12; // 12 months of training in 2026

  for (var i = 2; i < data.length; i++) {
    var row = data[i];
    var jobNum = String(row[2]).trim(); // Column C - Job Number
    var status = String(row[7]).trim(); // Column H - Status

    if (!jobNum) continue;

    if (!jobStats[jobNum]) {
      jobStats[jobNum] = {complete: 0, pending: 0, overdue: 0, total: 0};
    }

    jobStats[jobNum].total++;

    if (status === 'Complete') {
      jobStats[jobNum].complete++;
    } else if (status === 'Overdue') {
      jobStats[jobNum].overdue++;
    } else {
      jobStats[jobNum].pending++;
    }
  }

  // Build report
  var report = 'Training Compliance Report\n';
  report += '==========================\n\n';

  for (var job in jobStats) {
    var stats = jobStats[job];
    var percentComplete = stats.total > 0 ? ((stats.complete / totalRequired) * 100).toFixed(1) : 0;

    report += 'Job #' + job + ':\n';
    report += '  Complete: ' + stats.complete + '/' + totalRequired + ' (' + percentComplete + '%)\n';
    report += '  Pending: ' + stats.pending + '\n';
    report += '  Overdue: ' + stats.overdue + '\n\n';
  }

  SpreadsheetApp.getUi().alert('📊 Training Compliance Report', report, SpreadsheetApp.getUi().ButtonSet.OK);
}

