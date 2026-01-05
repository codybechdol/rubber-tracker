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

