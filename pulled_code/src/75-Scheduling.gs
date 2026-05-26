/**
 * Glove Manager – Scheduling System
 *
 * Functions for managing crew visit schedules and training calendar.
 * Provides monthly calendar view with time estimates and route optimization.
 *
 * Last updated: 2026-02-24 19:30
 */

// ============================================================================

/**
 * DEBUG: Test function to diagnose Crew Visit Config auto-population issues.
 * Run this directly from Apps Script editor to see detailed logs.
 * Menu item: Can be run manually from script editor
 */
function debugAutoPopulateCrewVisitConfig() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var ui = SpreadsheetApp.getUi();

  var debugInfo = [];
  debugInfo.push('=== DEBUG: Auto-Populate Crew Visit Config ===');
  debugInfo.push('');

  // Check To-Do List
  var todoSheet = ss.getSheetByName('To Do List');
  if (!todoSheet) {
    debugInfo.push('❌ To-Do List sheet NOT FOUND');
    ui.alert('Debug Results', debugInfo.join('\n'), ui.ButtonSet.OK);
    return;
  }

  debugInfo.push('✅ To-Do List exists');
  debugInfo.push('   Total rows: ' + todoSheet.getLastRow());
  debugInfo.push('   Total columns: ' + todoSheet.getLastColumn());
  debugInfo.push('');

  // Check if has task data
  if (todoSheet.getLastRow() < 14) {
    debugInfo.push('❌ To-Do List has no task data (needs row 14+)');
    ui.alert('Debug Results', debugInfo.join('\n'), ui.ButtonSet.OK);
    return;
  }

  debugInfo.push('✅ To-Do List has task data');
  debugInfo.push('');

  // Read and display headers
  var todoData = todoSheet.getDataRange().getValues();
  var todoHeaders = todoData[12]; // Row 13

  debugInfo.push('Headers (Row 13):');
  for (var h = 0; h < Math.min(todoHeaders.length, 19); h++) {
    debugInfo.push('   Col ' + (h + 1) + ': "' + todoHeaders[h] + '"');
  }
  debugInfo.push('');

  // Find key columns
  var locationCol = -1;
  var employeeCol = -1;

  for (var h = 0; h < todoHeaders.length; h++) {
    var header = String(todoHeaders[h]).toLowerCase().trim();
    if (header === 'location') locationCol = h;
    if (header === 'employee/crew') employeeCol = h;
  }

  debugInfo.push('Key columns found:');
  debugInfo.push('   Location: ' + (locationCol >= 0 ? 'Column ' + (locationCol + 1) : 'NOT FOUND'));
  debugInfo.push('   Employee/Crew: ' + (employeeCol >= 0 ? 'Column ' + (employeeCol + 1) : 'NOT FOUND'));
  debugInfo.push('');

  if (locationCol === -1) {
    debugInfo.push('❌ PROBLEM: Location column not found!');
    debugInfo.push('   Expected header: "Location"');
    ui.alert('Debug Results', debugInfo.join('\n'), ui.ButtonSet.OK);
    return;
  }

  // Sample first 5 task rows
  debugInfo.push('Sample task data (first 5 rows):');
  for (var i = 13; i < Math.min(todoData.length, 18); i++) {
    var row = todoData[i];
    var location = row[locationCol] || '(empty)';
    var employee = employeeCol >= 0 ? (row[employeeCol] || '(empty)') : 'N/A';
    debugInfo.push('   Row ' + (i + 1) + ': Location="' + location + '", Employee="' + employee + '"');
  }
  debugInfo.push('');

  // Count unique locations
  var locations = {};
  for (var i = 13; i < todoData.length; i++) {
    var loc = String(todoData[i][locationCol] || '').trim();
    if (loc && loc !== 'Unknown') {
      locations[loc] = (locations[loc] || 0) + 1;
    }
  }

  var locationCount = Object.keys(locations).length;
  debugInfo.push('Unique locations found: ' + locationCount);

  if (locationCount > 0) {
    debugInfo.push('');
    debugInfo.push('Location breakdown:');
    for (var loc in locations) {
      debugInfo.push('   ' + loc + ': ' + locations[loc] + ' task(s)');
    }
  } else {
    debugInfo.push('');
    debugInfo.push('❌ PROBLEM: No valid locations found in tasks!');
    debugInfo.push('   Check if Location column has data');
  }

  // Try running auto-populate
  debugInfo.push('');
  debugInfo.push('--- Running autoPopulateCrewVisitConfigFromToDo ---');

  var result = autoPopulateCrewVisitConfigFromToDo(ss);

  debugInfo.push('Result: ' + (result || 'undefined'));
  debugInfo.push('');

  // Check Crew Visit Config after
  var configSheet = ss.getSheetByName('Crew Visit Config');
  if (configSheet) {
    debugInfo.push('✅ Crew Visit Config exists after auto-populate');
    debugInfo.push('   Rows: ' + configSheet.getLastRow());
  } else {
    debugInfo.push('❌ Crew Visit Config NOT created');
  }

  // Show results
  ui.alert('Debug Results', debugInfo.join('\n'), ui.ButtonSet.OK);

  // Also log to console
  Logger.log(debugInfo.join('\n'));
}

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
// JOB PREFIX EXCLUSION (for Crew Visits & Training)
// ============================================================================

/**
 * Default job number prefixes to exclude from Crew Visits and Training tasks.
 * Employees with job numbers starting with these prefixes are excluded.
 * - 002: Lost/Destroyed/In Testing equipment records (not real employees)
 * - 005: Light Duty employees (office-based, no field visits needed)
 */
var DEFAULT_EXCLUDED_JOB_PREFIXES = ['002', '005'];

/**
 * Gets the list of excluded job number prefixes from ScriptProperties.
 * Falls back to default if not configured.
 *
 * @return {Array} Array of excluded job prefixes (e.g., ['002', '005'])
 */
function getExcludedJobPrefixesInternal() {
  var props = PropertiesService.getScriptProperties();
  var json = props.getProperty('excludedJobPrefixes');
  if (json) {
    try {
      return JSON.parse(json);
    } catch (e) {
      Logger.log('getExcludedJobPrefixesInternal: Error parsing JSON: ' + e);
    }
  }
  return DEFAULT_EXCLUDED_JOB_PREFIXES;
}

/**
 * Checks if a job number should be excluded based on its prefix.
 * Used to filter out Light Duty, Lost, etc. from Crew Visits and Training.
 *
 * @param {string} jobNumber - Full job number (e.g., "005-26.27" or "013-26.1")
 * @return {boolean} True if job should be excluded
 */
function isExcludedJobPrefix(jobNumber) {
  if (!jobNumber) return true;
  var jobStr = String(jobNumber).trim();
  if (!jobStr || jobStr.toUpperCase() === 'N/A') return true;

  var excludedPrefixes = getExcludedJobPrefixesInternal();
  for (var i = 0; i < excludedPrefixes.length; i++) {
    if (jobStr.indexOf(excludedPrefixes[i] + '-') === 0) {
      return true;
    }
  }
  return false;
}

/**
 * API function for ToDoConfig.html - Gets excluded job prefixes.
 * Called by google.script.run.getExcludedJobPrefixes()
 *
 * @return {Array} Array of excluded job prefixes (e.g., ['002', '005'])
 */
function getExcludedJobPrefixes() {
  return getExcludedJobPrefixesInternal();
}

/**
 * API function for ToDoConfig.html - Saves excluded job prefixes.
 * Called by google.script.run.saveExcludedJobPrefixes(prefixes)
 *
 * @param {Array} prefixes - Array of job prefixes to exclude (e.g., ['002', '005'])
 * @return {boolean} True if saved successfully
 */
function saveExcludedJobPrefixes(prefixes) {
  try {
    var props = PropertiesService.getScriptProperties();
    props.setProperty('excludedJobPrefixes', JSON.stringify(prefixes || []));
    Logger.log('saveExcludedJobPrefixes: Saved prefixes: ' + JSON.stringify(prefixes));
    return true;
  } catch (e) {
    Logger.log('saveExcludedJobPrefixes: Error: ' + e);
    throw new Error('Failed to save excluded job prefixes: ' + e.message);
  }
}

// ============================================================================
// CREW EXTRACTION FUNCTIONS
// ============================================================================

/**
 * Extracts unique crew numbers from Employees sheet.
 * Converts job numbers like "009-26.1" → "009-26" (removes employee suffix).
 * Excludes employees with job prefixes in the exclusion list (002, 005, etc.).
 *
 * If Job Tracking sheet exists, ONLY returns crews with "Active" status.
 * Jobs with Completed, Pending Start, or On Hold status are excluded.
 *
 * @return {Array} Array of unique crew numbers sorted
 */
function getActiveCrews() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var employeesSheet = ss.getSheetByName(SHEET_EMPLOYEES);

  if (!employeesSheet || employeesSheet.getLastRow() < 2) {
    return [];
  }

  var data = employeesSheet.getDataRange().getValues();
  var headers = data[0];
  var jobNumCol = -1;
  var secondaryJobCol = -1;
  var lastDayCol = -1;

  // Find Job Number column (D), Secondary Job Number column, and Last Day column (L)
  for (var h = 0; h < headers.length; h++) {
    var header = String(headers[h]).toLowerCase().trim();
    if (header === 'job number') jobNumCol = h;
    if (header === 'secondary job number') secondaryJobCol = h;
    if (header === 'last day') lastDayCol = h;
  }

  if (jobNumCol === -1) {
    logEvent('getActiveCrews: Job Number column not found in Employees sheet', 'ERROR');
    return [];
  }

  var crewSet = {};

  // Process each employee
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var jobNumber = String(row[jobNumCol]).trim();
    var secondaryJob = secondaryJobCol !== -1 ? String(row[secondaryJobCol]).trim() : '';
    var lastDay = lastDayCol !== -1 ? row[lastDayCol] : '';

    // Skip if employee has left
    if (lastDay) continue;

    // Process primary job number
    if (jobNumber && !isExcludedJobPrefix(jobNumber)) {
      var crewNumber = extractCrewNumber(jobNumber);
      if (crewNumber) {
        crewSet[crewNumber] = true;
      }
    }

    // Also process secondary job number if present
    if (secondaryJob && !isExcludedJobPrefix(secondaryJob)) {
      var secondaryCrewNumber = extractCrewNumber(secondaryJob);
      if (secondaryCrewNumber) {
        crewSet[secondaryCrewNumber] = true;
      }
    }
  }

  // Convert to sorted array
  var crews = Object.keys(crewSet).sort();

  // If Job Tracking sheet exists, filter to only include "Active" status jobs
  var jobTrackingSheet = ss.getSheetByName('Job Tracking');
  if (jobTrackingSheet && jobTrackingSheet.getLastRow() > 1) {
    var activeJobsFromTracking = getActiveJobsFromTrackingSheet(jobTrackingSheet);

    // Filter crews to only include those that are Active in Job Tracking
    // If a crew exists in Employees but NOT in Job Tracking, include it (backwards compatibility)
    // If a crew exists in Job Tracking with non-Active status, exclude it
    var filteredCrews = [];
    for (var c = 0; c < crews.length; c++) {
      var crew = crews[c];
      if (activeJobsFromTracking.activeJobs[crew] === true) {
        // Explicitly marked as Active in Job Tracking
        filteredCrews.push(crew);
      } else if (activeJobsFromTracking.allJobs[crew] === undefined) {
        // Not in Job Tracking at all - include for backwards compatibility
        filteredCrews.push(crew);
      }
      // If in Job Tracking but NOT active, exclude it
    }

    Logger.log('getActiveCrews: Filtered from ' + crews.length + ' to ' + filteredCrews.length + ' crews based on Job Tracking status');
    return filteredCrews;
  }

  return crews;
}

/**
 * Helper function to get active jobs from Job Tracking sheet.
 * Returns both the set of active jobs and the set of all jobs for filtering.
 *
 * @param {Sheet} jobTrackingSheet - The Job Tracking sheet
 * @return {Object} { activeJobs: {job: true}, allJobs: {job: true} }
 */
function getActiveJobsFromTrackingSheet(jobTrackingSheet) {
  var result = {
    activeJobs: {},
    allJobs: {}
  };

  var data = jobTrackingSheet.getDataRange().getValues();
  var today = new Date();
  today.setHours(0, 0, 0, 0);

  // Columns: A=Job Number(0), B=Location(1), C=Foreman(2), D=Crew Size(3), E=Start Date(4),
  //          F=Put On Hold Date(5), G=Estimated Return(6), H=Est. End Date(7), I=Actual End Date(8), J=Status(9)
  for (var i = 1; i < data.length; i++) {
    var jobNum = String(data[i][0] || '').trim();
    var startDate = data[i][4];
    var status = String(data[i][9] || '').trim();  // Status (J, index 9)

    if (!jobNum) continue;

    // Track all jobs in the sheet
    result.allJobs[jobNum] = true;

    // Only add to activeJobs if status is Active AND start date has passed
    if (String(status).toLowerCase().trim() === 'active') {
      // If start date exists and is in the future, don't count as active yet
      if (startDate instanceof Date && startDate > today) {
        continue;
      }
      result.activeJobs[jobNum] = true;
    }
  }

  return result;
}

/**
 * Gets start dates from Job Tracking sheet for all jobs.
 * Used to filter crews from compliance tracking if the job hadn't started yet during a specific week.
 *
 * @return {Object} { jobNumber: startDate, ... } - Maps job numbers to their start dates
 */
function getJobTrackingStartDates() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var jobTrackingSheet = ss.getSheetByName('Job Tracking');

  if (!jobTrackingSheet || jobTrackingSheet.getLastRow() < 2) {
    return {};
  }

  var data = jobTrackingSheet.getDataRange().getValues();
  var result = {};

  // Columns: A=Job Number(0), E=Start Date(4), J=Status(9) (after adding Put On Hold Date and Estimated Return)
  for (var i = 1; i < data.length; i++) {
    var jobNum = String(data[i][0] || '').trim();
    var startDate = data[i][4];

    if (!jobNum) continue;

    // Only store if there's a valid start date
    if (startDate instanceof Date && !isNaN(startDate.getTime())) {
      result[jobNum] = startDate;
    }
  }

  return result;
}

/**
 * Filters a list of crews to only include those that were active during a specific week.
 * A crew is considered active during a week if:
 *   1. The job is NOT in Job Tracking (backwards compatibility) OR
 *   2. The job's start date is ON or BEFORE the week's END date
 *
 * @param {Array} crews - Array of crew numbers to filter
 * @param {Date} weekEndDate - The end date of the week being calculated
 * @return {Object} { filteredCrews: Array, excludedCrews: Array }
 */
function filterCrewsByJobTrackingStartDate(crews, weekEndDate) {
  var startDates = getJobTrackingStartDates();
  var weekEnd = new Date(weekEndDate);
  weekEnd.setHours(23, 59, 59, 999);

  var filteredCrews = [];
  var excludedCrews = [];

  for (var i = 0; i < crews.length; i++) {
    var crew = crews[i];
    var startDate = startDates[crew];

    if (!startDate) {
      // Not in Job Tracking - include for backwards compatibility
      filteredCrews.push(crew);
    } else if (startDate <= weekEnd) {
      // Job had started by the end of this week
      filteredCrews.push(crew);
    } else {
      // Job hadn't started yet during this week - exclude
      excludedCrews.push(crew);
      Logger.log("filterCrewsByJobTrackingStartDate: Excluding " + crew + " - start date " +
                 Utilities.formatDate(startDate, Session.getScriptTimeZone(), 'MM/dd/yyyy') +
                 " is after week end " + Utilities.formatDate(weekEnd, Session.getScriptTimeZone(), 'MM/dd/yyyy'));
    }
  }

  return {
    filteredCrews: filteredCrews,
    excludedCrews: excludedCrews
  };
}

/**
 * Extracts crew number from full job number.
 * Example: "009-26.1" → "009-26"
 * Returns empty string for invalid formats like "N/A", "Unknown", "000-XX", etc.
 *
 * @param {string} jobNumber - Full job number
 * @return {string} Crew number prefix (NNN-YY format) or empty string
 */
function extractCrewNumber(jobNumber) {
  var jobStr = String(jobNumber).trim();
  if (!jobStr) return '';

  // Find last dot and remove everything after it
  var lastDotIndex = jobStr.lastIndexOf('.');
  var crewNumber = lastDotIndex !== -1 ? jobStr.substring(0, lastDotIndex) : jobStr;

  // Validate format: NNN-YY (e.g., 009-26, 013-26)
  // Must be 3 digits, dash, 2 digits
  var validFormat = new RegExp('^\\d{3}-\\d{2}$');
  if (!validFormat.test(crewNumber)) {
    return ''; // Invalid format - skip
  }

  // Exclude placeholder job numbers like 000-XX
  if (crewNumber.startsWith('000-')) {
    return ''; // Placeholder - skip
  }

  return crewNumber;
}

/**
 * Gets crew lead/foreman information for a crew.
 * Uses a classification hierarchy to determine crew lead:
 * 1. F (Foreman) - Primary crew lead
 * 2. GTO F (Gas Tech Operator - Foreman) - Alternate foreman
 * 3. GF (General Foreman) - Supervisor role
 * 4. SUP (Superintendent) - Management role
 * 5. JRY (Journeyman Lineman) - Senior worker
 * 6. JRY OP (Journeyman Operator)
 * 7. WT (Working Technician)
 * 8. AP 7-1 (Apprentices by seniority, 7 is most senior)
 * 9. First employee in crew - Fallback
 * Excludes employees with excluded job prefixes (Light Duty, etc.).
 *
 * @param {string} crewNumber - Crew number (e.g., "009-26")
 * @return {Object} {name: string, jobNumber: string, classification: string} or null
 */
function getCrewLead(crewNumber) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var employeesSheet = ss.getSheetByName(SHEET_EMPLOYEES);

  if (!employeesSheet || employeesSheet.getLastRow() < 2) {
    return null;
  }

  var data = employeesSheet.getDataRange().getValues();
  var headers = data[0];
  var nameCol = -1;
  var jobNumCol = -1;
  var classificationCol = -1;
  var lastDayCol = -1;
  var crewLeadCol = -1;

  // Find columns
  for (var h = 0; h < headers.length; h++) {
    var header = String(headers[h]).toLowerCase().trim();
    if (header === 'name') nameCol = h;
    if (header === 'job number') jobNumCol = h;
    if (header === 'crew lead') crewLeadCol = h;
    if (header === 'job classification') classificationCol = h;
    if (header === 'last day') lastDayCol = h;
  }

  if (nameCol === -1 || jobNumCol === -1) {
    return null;
  }

  // Classification hierarchy (lower number = higher priority)
  // SUP > GF > F > GTO F > JRY > JRY OP > WT > GTO > EO > AP
  var classificationPriority = {
    'SUP': 1,      // Superintendent - Highest rank
    'GF': 2,       // General Foreman
    'F': 3,        // Foreman
    'GTO F': 4,    // Gas Tech Operator - Foreman
    'JRY': 5,      // Journeyman Lineman
    'JRY OP': 6,   // Journeyman Operator
    'WT': 7,       // Working Technician
    'GTO': 8,      // Gas Tech Operator
    'EO 1': 9,     // Equipment Operator 1
    'EO 2': 10,    // Equipment Operator 2
    'AP 7': 11,    // 7th Year Apprentice (most senior apprentice)
    'AP 6': 12,
    'AP 5': 13,
    'AP 4': 14,
    'AP 3': 15,
    'AP 2': 16,
    'AP 1': 17     // 1st Year Apprentice (least senior)
  };

  var bestCandidate = null;
  var bestPriority = 999;
  var firstEmployee = null;
  var manualLead = null;  // Manual assignment from "Crew Lead" column takes priority

  // Scan all employees in this crew
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var employeeJobNum = String(row[jobNumCol]).trim();
    var employeeCrew = extractCrewNumber(employeeJobNum);
    var lastDay = lastDayCol !== -1 ? row[lastDayCol] : '';

    // Skip if not in this crew or has left
    if (employeeCrew !== crewNumber || lastDay) continue;

    // Skip employees with excluded job prefixes (Light Duty, etc.)
    if (isExcludedJobPrefix(employeeJobNum)) continue;

    var employeeName = row[nameCol];
    var classification = classificationCol !== -1 ? String(row[classificationCol]).trim() : '';

    // Check for manual crew lead assignment - this takes PRIORITY over classification
    if (crewLeadCol !== -1) {
      var crewLeadValue = String(row[crewLeadCol] || '').toLowerCase().trim();
      if (crewLeadValue === 'yes' || crewLeadValue === 'true' || crewLeadValue === '1') {
        manualLead = {
          name: employeeName,
          jobNumber: employeeJobNum,
          classification: classification
        };
        // Don't break - continue to find all valid employees as fallback
      }
    }

    // Track first valid employee as fallback
    if (!firstEmployee) {
      firstEmployee = {
        name: employeeName,
        jobNumber: employeeJobNum,
        classification: classification
      };
    }

    // Check classification priority (used only if no manual lead)
    var priority = classificationPriority[classification];
    if (priority && priority < bestPriority) {
      bestPriority = priority;
      bestCandidate = {
        name: employeeName,
        jobNumber: employeeJobNum,
        classification: classification
      };
    }
  }

  // Priority: 1) Manual assignment from "Crew Lead" column
  //           2) Best classification priority
  //           3) First employee as fallback
  return manualLead || bestCandidate || firstEmployee;
}

/**
 * Gets crew size (count of active employees in crew).
 * Excludes employees with excluded job prefixes (Light Duty, etc.).
 *
 * @param {string} crewNumber - Crew number (e.g., "009-26")
 * @return {number} Number of active field employees
 */
function getCrewSize(crewNumber) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var employeesSheet = ss.getSheetByName(SHEET_EMPLOYEES);

  if (!employeesSheet || employeesSheet.getLastRow() < 2) {
    return 0;
  }

  var data = employeesSheet.getDataRange().getValues();
  var headers = data[0];
  var jobNumCol = -1;
  var lastDayCol = -1;

  for (var h = 0; h < headers.length; h++) {
    var header = String(headers[h]).toLowerCase().trim();
    if (header === 'job number') jobNumCol = h;
    if (header === 'last day') lastDayCol = h;
  }

  if (jobNumCol === -1) return 0;

  var count = 0;
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var employeeJobNum = String(row[jobNumCol]).trim();
    var employeeCrew = extractCrewNumber(employeeJobNum);
    var lastDay = lastDayCol !== -1 ? row[lastDayCol] : '';

    // Skip if not in this crew, has left, or has excluded job prefix
    if (employeeCrew !== crewNumber || lastDay) continue;
    if (isExcludedJobPrefix(employeeJobNum)) continue;

    count++;
  }

  return count;
}

/**
 * Checks if a crew should be excluded from training tracking.
 * Excludes crews where the foreman (F or GTO F) has:
 * - Job Number = "N/A"
 * - Location = "weeds" (case-insensitive)
 *
 * @param {string} crewNumber - Crew number (e.g., "009-26")
 * @return {boolean} True if crew should be excluded
 */
function shouldExcludeCrew(crewNumber) {
  // Check excluded job prefixes first (005- = office/management, 002- = lost/destroyed)
  if (isExcludedJobPrefix(crewNumber)) {
    return true;
  }

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var employeesSheet = ss.getSheetByName(SHEET_EMPLOYEES);

  if (!employeesSheet || employeesSheet.getLastRow() < 2) {
    return false;
  }

  var data = employeesSheet.getDataRange().getValues();
  var headers = data[0];
  var jobNumCol = -1;
  var locationCol = -1;
  var classificationCol = -1;
  var lastDayCol = -1;

  // Find columns
  for (var h = 0; h < headers.length; h++) {
    var header = String(headers[h]).toLowerCase().trim();
    if (header === 'job number') jobNumCol = h;
    if (header === 'location') locationCol = h;
    if (header === 'job classification') classificationCol = h;
    if (header === 'last day') lastDayCol = h;
  }

  if (jobNumCol === -1 || locationCol === -1) {
    return false;
  }

  // Look for foreman in this crew
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var employeeJobNum = String(row[jobNumCol]).trim();
    var employeeCrew = extractCrewNumber(employeeJobNum);
    var lastDay = lastDayCol !== -1 ? row[lastDayCol] : '';

    // Skip if not in this crew or has left
    if (employeeCrew !== crewNumber || lastDay) continue;

    // Check if this is a foreman
    if (classificationCol !== -1) {
      var classification = String(row[classificationCol]).trim();

      if (classification === 'F' || classification === 'GTO F') {
        // Found the foreman - check exclusion criteria
        var jobNumberValue = String(row[jobNumCol]).trim().toUpperCase();
        var locationValue = String(row[locationCol]).trim().toLowerCase();

        // Exclude if job number is N/A or location is weeds
        if (jobNumberValue === 'N/A' || locationValue === 'weeds') {
          return true; // Exclude this crew
        }
      }
    }
  }

  return false; // Don't exclude
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
    var nextVisit = row[colIndices.nextVisit];
    var frequency = row[colIndices.frequency] || 'Monthly';

    var visitDates = [];

    // If Next Visit Date is set and in this month, use it directly
    // Handle both Date objects and string dates
    var nextVisitDate = null;
    if (nextVisit) {
      if (nextVisit instanceof Date) {
        nextVisitDate = nextVisit;
      } else if (typeof nextVisit === 'string' && nextVisit.trim() !== '') {
        // Try to parse string date
        nextVisitDate = new Date(nextVisit);
      } else if (typeof nextVisit === 'number') {
        // Excel serial date number
        nextVisitDate = new Date(nextVisit);
      }

      // Validate the parsed date
      if (nextVisitDate && isNaN(nextVisitDate.getTime())) {
        Logger.log('Invalid date for ' + jobNumber + ': ' + nextVisit);
        nextVisitDate = null;
      }
    }

    if (nextVisitDate) {
      var nextVisitMonth = nextVisitDate.getMonth() + 1; // 1-12
      var nextVisitYear = nextVisitDate.getFullYear();

      Logger.log('Checking ' + jobNumber + ': Next Visit Date = ' + nextVisitDate + ', Month = ' + nextVisitMonth + ', Year = ' + nextVisitYear + ', Target = ' + month + '/' + year);

      if (nextVisitMonth === month && nextVisitYear === year) {
        visitDates.push(new Date(nextVisitDate));
        Logger.log('✓ Using Next Visit Date directly for ' + jobNumber + ': ' + nextVisitDate);
      } else {
        Logger.log('✗ Next Visit Date for ' + jobNumber + ' is in ' + nextVisitMonth + '/' + nextVisitYear + ', not ' + month + '/' + year);
      }
    }

    // If no visit found from Next Visit Date, try calculating from Last Visit
    if (visitDates.length === 0 && lastVisit) {
      visitDates = calculateVisitDatesForMonth(lastVisit, frequency, year, month);
    }

    // If still no visits and we have a next visit date (just in wrong month), log it
    if (visitDates.length === 0 && nextVisitDate) {
      Logger.log('No visits scheduled for ' + jobNumber + ' in ' + month + '/' + year + ' - Next Visit Date is: ' + nextVisitDate);
    }

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
 * Creates and sets up the Crew Visit Config sheet with data auto-populated from Employees sheet.
 * Pulls crew numbers, locations, leads, and sizes automatically.
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

  // Get active crews from Employees sheet
  var crews = getActiveCrews();

  if (crews.length === 0) {
    SpreadsheetApp.getUi().alert('⚠️ No Active Crews Found\n\nPlease add employees with job numbers to the Employees sheet first.\n\nJob numbers should be in format: XXX-YY.Z (e.g., 009-26.1)');
    return;
  }

  // Build crew data automatically
  var crewData = [];
  var today = new Date();
  var lastWeek = new Date(today);
  lastWeek.setDate(lastWeek.getDate() - 7);

  // Default drive times by location (can be customized)
  var driveTimesByLocation = {
    'helena': 0,
    'ennis': 60,
    'butte': 90,
    'big sky': 90,
    'bozeman': 90,
    'missoula': 120,
    'great falls': 90,
    'kalispell': 180,
    'billings': 180,
    'miles city': 240,
    'sidney': 300,
    'glendive': 270
  };

  for (var i = 0; i < crews.length; i++) {
    var crewNumber = crews[i];
    var lead = getCrewLead(crewNumber);
    var size = getCrewSize(crewNumber);

    // Get location from first crew member
    var location = getCrewLocation(crewNumber);

    // Estimate visit time based on crew size
    var estimatedTime = calculateCrewVisitTime(size);

    // Get drive time based on location
    var driveTime = 0;
    if (location) {
      var locationLower = location.toLowerCase();
      for (var loc in driveTimesByLocation) {
        if (locationLower.indexOf(loc) !== -1) {
          driveTime = driveTimesByLocation[loc];
          break;
        }
      }
    }

    // Determine default priority based on location class
    var priority = 'Medium';
    if (location && location.toLowerCase().indexOf('helena') !== -1) {
      priority = 'High'; // Helena crews are high priority
    }

    // Default frequency is Monthly for most crews
    var frequency = 'Monthly';

    crewData.push([
      crewNumber,
      location || '',
      lead ? lead.name : '',
      size,
      frequency,
      estimatedTime,
      lastWeek,
      calculateNextVisitDate(lastWeek, frequency),
      driveTime,
      priority,
      '' // Notes - user can fill in
    ]);
  }

  // Write crew data
  if (crewData.length > 0) {
    sheet.getRange(2, 1, crewData.length, headers.length).setValues(crewData);

    // Format dates
    sheet.getRange(2, 7, crewData.length, 2).setNumberFormat('mm/dd/yyyy');
  }

  // Add data validation for frequency
  var frequencyRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(['Weekly', 'Bi-Weekly', 'Monthly'], true)
    .setAllowInvalid(false)
    .build();
  sheet.getRange(2, 5, Math.max(crewData.length, 100), 1).setDataValidation(frequencyRule);

  // Add data validation for priority
  var priorityRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(['High', 'Medium', 'Low'], true)
    .setAllowInvalid(false)
    .build();
  sheet.getRange(2, 10, Math.max(crewData.length, 100), 1).setDataValidation(priorityRule);

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

  var message = '✅ Crew Visit Config sheet created!\n\n';
  message += 'Auto-populated with ' + crewData.length + ' crews from Employees sheet:\n\n';
  message += '📋 Data includes:\n';
  message += '• Job Numbers (from Employees)\n';
  message += '• Locations (from Employees)\n';
  message += '• Crew Leads (auto-detected)\n';
  message += '• Crew Sizes (counted)\n';
  message += '• Estimated Visit Times (calculated)\n';
  message += '• Drive Times (estimated by location)\n\n';
  message += '✏️ Review and adjust:\n';
  message += '• Visit Frequency (defaults to Monthly)\n';
  message += '• Drive Times (verify accuracy)\n';
  message += '• Priority levels\n';
  message += '• Add any notes';

  SpreadsheetApp.getUi().alert(message);
}

/**
 * Refreshes Crew Visit Config without losing user-customized data.
 * Preserves: Notes, Visit Frequency, Last Visit Date
 * Updates: Crew Lead, Crew Size, Location, Drive Time
 * Removes: Crews with no field employees (all on Light Duty, etc.)
 * Adds: New crews that appeared in Employees sheet
 *
 * Menu item: Glove Manager → Schedule & To-Do → Refresh Crew Visit Config
 */
function refreshCrewVisitConfig() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_CREW_VISIT_CONFIG);

  if (!sheet || sheet.getLastRow() < 2) {
    // No existing config, just run full setup
    setupCrewVisitConfig();
    return;
  }

  var ui = SpreadsheetApp.getUi();

  // Get current active crews from Employees sheet (with exclusions applied)
  var activeCrews = getActiveCrews();

  if (activeCrews.length === 0) {
    ui.alert('⚠️ No Active Crews Found\n\nNo field crews found in Employees sheet.\nAll employees may be on Light Duty or have excluded job prefixes.');
    return;
  }

  // Read existing config data
  var existingData = sheet.getDataRange().getValues();
  var headers = existingData[0];

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
    if (header === 'notes') colIndices.notes = h;
  }

  // Build map of existing crew data (preserve user customizations)
  var existingCrewMap = {};
  for (var i = 1; i < existingData.length; i++) {
    var row = existingData[i];
    var crewNum = String(row[colIndices.jobNumber] || '').trim();
    if (crewNum) {
      existingCrewMap[crewNum] = {
        frequency: row[colIndices.frequency] || 'Monthly',
        lastVisit: row[colIndices.lastVisit] || '',
        notes: row[colIndices.notes] || '',
        priority: row[colIndices.priority] || 'Medium'
      };
    }
  }

  // Drive times by location
  var driveTimesByLocation = {
    'helena': 0,
    'ennis': 60,
    'butte': 90,
    'big sky': 90,
    'bozeman': 90,
    'missoula': 120,
    'great falls': 90,
    'kalispell': 180,
    'billings': 180,
    'miles city': 240,
    'sidney': 300,
    'glendive': 270,
    'livingston': 90,
    'elliston': 45,
    'gold creek': 75,
    'rapelje': 120,
    'south dakota': 420,
    'california': 960,
    'stanford': 120,
    'northern lights': 420
  };

  // Build new crew data
  var newCrewData = [];
  var today = new Date();
  var lastWeek = new Date(today);
  lastWeek.setDate(lastWeek.getDate() - 7);

  var crewsAdded = 0;
  var crewsUpdated = 0;
  var crewsRemoved = Object.keys(existingCrewMap).length;

  for (var c = 0; c < activeCrews.length; c++) {
    var crewNumber = activeCrews[c];
    var lead = getCrewLead(crewNumber);
    var size = getCrewSize(crewNumber);
    var location = getCrewLocation(crewNumber);
    var estimatedTime = calculateCrewVisitTime(size);

    // Get drive time based on location
    var driveTime = 0;
    if (location) {
      var locationLower = location.toLowerCase();
      for (var loc in driveTimesByLocation) {
        if (locationLower.indexOf(loc) !== -1) {
          driveTime = driveTimesByLocation[loc];
          break;
        }
      }
    }

    // Check if this crew exists in current config
    var existing = existingCrewMap[crewNumber];
    var frequency, lastVisit, notes, priority;

    if (existing) {
      // Preserve user customizations
      frequency = existing.frequency;
      lastVisit = existing.lastVisit || lastWeek;
      notes = existing.notes;
      priority = existing.priority;
      crewsUpdated++;
      crewsRemoved--; // Don't count as removed
    } else {
      // New crew - use defaults
      frequency = 'Monthly';
      lastVisit = lastWeek;
      notes = '';
      priority = (location && location.toLowerCase().indexOf('helena') !== -1) ? 'High' : 'Medium';
      crewsAdded++;
    }

    newCrewData.push([
      crewNumber,
      location || '',
      lead ? lead.name : '',
      size,
      frequency,
      estimatedTime,
      lastVisit,
      calculateNextVisitDate(lastVisit instanceof Date ? lastVisit : new Date(lastVisit), frequency),
      driveTime,
      priority,
      notes
    ]);
  }

  // Clear existing data (except headers) and write new data
  if (sheet.getLastRow() > 1) {
    sheet.getRange(2, 1, sheet.getLastRow() - 1, headers.length).clearContent();
  }

  if (newCrewData.length > 0) {
    sheet.getRange(2, 1, newCrewData.length, headers.length).setValues(newCrewData);

    // Format dates
    sheet.getRange(2, colIndices.lastVisit + 1, newCrewData.length, 2).setNumberFormat('mm/dd/yyyy');
  }

  // Build summary message
  var message = '✅ Crew Visit Config refreshed!\n\n';
  message += '📊 Summary:\n';
  message += '• ' + crewsUpdated + ' existing crew(s) updated\n';
  message += '• ' + crewsAdded + ' new crew(s) added\n';
  message += '• ' + crewsRemoved + ' crew(s) removed (no field employees)\n\n';
  message += '📋 Preserved your customizations:\n';
  message += '• Visit Frequency\n';
  message += '• Last Visit Date\n';
  message += '• Priority\n';
  message += '• Notes\n\n';
  message += '🔄 Updated from Employees sheet:\n';
  message += '• Crew Leads\n';
  message += '• Crew Sizes\n';
  message += '• Locations\n';
  message += '• Drive Times';

  ui.alert(message);
}

/**
 * Gets the location for a crew by finding the first crew member's location.
 *
 * @param {string} crewNumber - Crew number (e.g., "009-26")
 * @return {string} Location name
 */
function getCrewLocation(crewNumber) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var employeesSheet = ss.getSheetByName(SHEET_EMPLOYEES);

  if (!employeesSheet || employeesSheet.getLastRow() < 2) {
    return '';
  }

  var data = employeesSheet.getDataRange().getValues();
  var headers = data[0];
  var jobNumCol = -1;
  var locationCol = -1;
  var lastDayCol = -1;

  // Find columns
  for (var h = 0; h < headers.length; h++) {
    var header = String(headers[h]).toLowerCase().trim();
    if (header === 'job number') jobNumCol = h;
    if (header === 'location') locationCol = h;
    if (header === 'last day') lastDayCol = h;
  }

  if (jobNumCol === -1 || locationCol === -1) {
    return '';
  }

  // Find first crew member
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var employeeJobNum = String(row[jobNumCol]).trim();
    var employeeCrew = extractCrewNumber(employeeJobNum);
    var lastDay = lastDayCol !== -1 ? row[lastDayCol] : '';

    if (employeeCrew === crewNumber && !lastDay) {
      return String(row[locationCol]).trim();
    }
  }

  return '';
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
    ['February: Job Briefings/ JHA\'s/ Emergency Action Plans', 'All', 2, 'Monthly', new Date(2026, 1, 15), new Date(2026, 2, 15), 0, '0%', 'Required monthly safety training'],
    ['March: OSHA ET&D 10 HR Refresher 1st Quarter', 'All', 10, 'Quarterly', new Date(2026, 2, 15), new Date(2026, 5, 15), 0, '0%', 'OSHA Certification - Q1 (full title TBD)'],
    ['April: Trenching & Shoring / Haz-Com Awareness', 'All', 2, 'Monthly', new Date(2026, 3, 15), new Date(2026, 4, 15), 0, '0%', 'Required monthly safety training'],
    ['May: Heat Stress & Wildfire Smoke', 'All', 2, 'Monthly', new Date(2026, 4, 15), new Date(2026, 5, 15), 0, '0%', 'Required monthly safety training'],
    ['June: OSHA ET&D 10 HR Refresher 2nd Quarter', 'All', 10, 'Quarterly', new Date(2026, 5, 15), new Date(2026, 8, 15), 0, '0%', 'OSHA Certification - Q2 (full title TBD)'],
    ['July: Rescue', 'All', 2, 'Monthly', new Date(2026, 6, 15), new Date(2026, 7, 15), 0, '0%', 'Emergency Response Training'],
    ['August: Rescue', 'All', 2, 'Monthly', new Date(2026, 7, 15), new Date(2026, 8, 15), 0, '0%', 'Emergency Response Training - continued'],
    ['September: OSHA ET&D 10 HR Refresher 3rd Quarter', 'All', 10, 'Quarterly', new Date(2026, 8, 15), new Date(2026, 10, 15), 0, '0%', 'OSHA Certification - Q3 (full title TBD)'],
    ['October: Back Feed / Winter Driving', 'All', 2, 'Monthly', new Date(2026, 9, 15), new Date(2026, 10, 15), 0, '0%', 'Operational Safety'],
    ['November: OSHA ET&D 10 HR Refresher 4th Quarter', 'All', 10, 'Quarterly', new Date(2026, 10, 15), new Date(2027, 0, 15), 0, '0%', 'OSHA Certification - Q4 (full title TBD)'],
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
 * Creates and sets up the Training Tracking sheet for crew-based compliance.
 * Auto-generates rows for all active crews × all 2026 training topics.
 * Menu item: Glove Manager → Schedule → Setup Training Tracking
 */
function setupTrainingTracking() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_TRAINING_TRACKING);

  // Preserve existing Status and Completion Date data before clearing
  var existingData = {};
  if (sheet && sheet.getLastRow() > 2) {
    var data = sheet.getDataRange().getValues();
    // Skip title (row 0) and headers (row 1)
    for (var i = 2; i < data.length; i++) {
      var row = data[i];
      var month = String(row[0]).trim();
      var crew = String(row[2]).trim();
      var completionDate = row[5];
      var status = String(row[9]).trim();

      // Create unique key for this training record
      var key = month + '|' + crew;

      // Only preserve if status is not Pending (meaning user changed it)
      if (status && status !== 'Pending') {
        existingData[key] = {
          completionDate: completionDate,
          status: status,
          attendees: row[6],
          trainer: row[8]
        };
      }
    }
  }

  if (!sheet) {
    sheet = ss.insertSheet(SHEET_TRAINING_TRACKING);
  }

  sheet.clear();

  // Title row
  sheet.getRange(1, 1, 1, 11).merge()
    .setValue('NECA/IBEW Monthly Safety Training Tracking 2026')
    .setFontWeight('bold').setFontSize(14).setBackground('#0f9d58').setFontColor('white').setHorizontalAlignment('center');
  sheet.setRowHeight(1, 35);

  // Headers
  var headers = [
    'Month',
    'Training Topic',
    'Crew #',
    'Crew Lead',
    'Crew Size',
    'Completion Date',
    'Attendees',
    'Hours',
    'Trainer',
    'Status',
    'Notes'
  ];

  sheet.getRange(2, 1, 1, headers.length).setValues([headers]);
  sheet.getRange(2, 1, 1, headers.length)
    .setFontWeight('bold')
    .setBackground('#0f9d58')
    .setFontColor('white')
    .setHorizontalAlignment('center');

  // Get active crews from Employees sheet
  var crews = getActiveCrews();

  if (crews.length === 0) {
    SpreadsheetApp.getUi().alert('⚠️ No Active Crews Found\n\nPlease add employees with job numbers to the Employees sheet first.\n\nJob numbers should be in format: XXX-YY.Z (e.g., 009-26.1)');
    return;
  }

  // Hardcoded exclusions (e.g., management/office staff)
  var manualExclusions = ['002-26', '005-26']; // Exclude lost/destroyed and office/management crews

  // Filter out excluded crews (both manual and automatic)
  var filteredCrews = [];
  var excludedCrews = [];
  var autoExcludedCrews = [];

  for (var i = 0; i < crews.length; i++) {
    var crew = crews[i];

    // Check manual exclusions
    if (manualExclusions.indexOf(crew) !== -1) {
      excludedCrews.push(crew + ' (manual)');
      continue;
    }

    // Check automatic exclusions (foreman with N/A or weeds)
    if (shouldExcludeCrew(crew)) {
      excludedCrews.push(crew + ' (auto)');
      autoExcludedCrews.push(crew);
      continue;
    }

    // Crew is not excluded
    filteredCrews.push(crew);
  }

  if (filteredCrews.length === 0) {
    SpreadsheetApp.getUi().alert('⚠️ No Crews to Track\n\nAll active crews are excluded.\n\n' +
                                  'Excluded: ' + excludedCrews.join(', '));
    return;
  }

  // 2026 Training Topics (January - November only, December handled separately)
  var trainingTopics = [
    {month: 'January', topic: 'Respectful Workplace – Anti Harassment Training', hours: 2},
    {month: 'February', topic: 'Job Briefings/ JHA\'s/ Emergency Action Plans', hours: 2},
    {month: 'March', topic: 'OSHA ET&D 10 HR Refresher 1st Quarter', hours: 10},
    {month: 'April', topic: 'Trenching & Shoring / Haz-Com Awareness', hours: 2},
    {month: 'May', topic: 'Heat Stress & Wildfire Smoke', hours: 2},
    {month: 'June', topic: 'OSHA ET&D 10 HR Refresher 2nd Quarter', hours: 10},
    {month: 'July', topic: 'Rescue', hours: 2},
    {month: 'August', topic: 'Rescue', hours: 2},
    {month: 'September', topic: 'OSHA ET&D 10 HR Refresher 3rd Quarter', hours: 10},
    {month: 'October', topic: 'Back Feed / Winter Driving', hours: 2},
    {month: 'November', topic: 'OSHA ET&D 10 HR Refresher 4th Quarter', hours: 10}
  ];

  // Pre-build crew members cache to avoid redundant Employees sheet reads
  var crewMembersCache = {};
  for (var cm = 0; cm < filteredCrews.length; cm++) {
    crewMembersCache[filteredCrews[cm]] = getCrewMembers(filteredCrews[cm]);
  }

  // Generate all rows: each crew × each month's training (Jan-Nov)
  var dataRows = [];
  var crewTrainingMap = {}; // Track training records by crew for catch-up logic

  for (var t = 0; t < trainingTopics.length; t++) {
    var training = trainingTopics[t];

    for (var c = 0; c < filteredCrews.length; c++) {
      var crew = filteredCrews[c];
      var lead = getCrewLead(crew);
      var size = getCrewSize(crew);

      // Check if we have preserved data for this training record
      var key = training.month + '|' + crew;
      var preserved = existingData[key];

      // Auto-populate attendees from Employees if not preserved
      var attendees = preserved ? preserved.attendees : (crewMembersCache[crew] || '');

      var row = [
        training.month,
        training.topic,
        crew,
        lead ? lead.name : '',
        size,
        preserved ? preserved.completionDate : '', // Completion Date - preserved if exists
        attendees, // Attendees - preserved if exists, otherwise auto-populated
        training.hours,
        preserved ? preserved.trainer : '', // Trainer - preserved if exists
        preserved ? preserved.status : 'Unassigned', // Status - preserved if exists, otherwise Unassigned
        '' // Notes
      ];

      dataRows.push(row);

      // Track this training for catch-up logic
      if (!crewTrainingMap[crew]) {
        crewTrainingMap[crew] = [];
      }
      crewTrainingMap[crew].push({
        month: training.month,
        topic: training.topic,
        hours: training.hours,
        rowIndex: dataRows.length - 1
      });
    }
  }

  // Generate December catch-up rows
  // December automatically includes any incomplete training from Jan-Nov
  for (var c = 0; c < filteredCrews.length; c++) {
    var crew = filteredCrews[c];
    var lead = getCrewLead(crew);
    var size = getCrewSize(crew);
    var crewMembers = getCrewMembers(crew); // Get all crew member names

    // Get all training topics for this crew from Jan-Nov
    var crewTraining = crewTrainingMap[crew] || [];

    if (crewTraining.length > 0) {
      // Check if we have preserved data for December
      var decemberKey = 'December|' + crew;
      var decemberPreserved = existingData[decemberKey];

      // Add December catch-up row with note about incomplete training
      var catchupNote = 'Catch-up month: Complete any missed training from Jan-Nov';

      var decemberRow = [
        'December',
        'Catch Up - All Incomplete Training',
        crew,
        lead ? lead.name : '',
        size,
        decemberPreserved ? decemberPreserved.completionDate : '', // Completion Date - preserved
        decemberPreserved ? decemberPreserved.attendees : crewMembers, // Attendees - preserved if exists, otherwise auto-populate
        2,  // Default hours
        decemberPreserved ? decemberPreserved.trainer : '', // Trainer - preserved
        decemberPreserved ? decemberPreserved.status : 'Unassigned', // Status - preserved
        catchupNote
      ];

      dataRows.push(decemberRow);
    }
  }

  // Write all data at once
  if (dataRows.length > 0) {
    sheet.getRange(3, 1, dataRows.length, headers.length).setValues(dataRows);
  }

  // Format dates
  sheet.getRange(3, 6, dataRows.length, 1).setNumberFormat('mm/dd/yyyy');

  // Add data validation for Status
  var statusRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(['Pending', 'In Progress', 'Complete', 'Overdue', 'N/A'], true)
    .setAllowInvalid(false)
    .build();
  sheet.getRange(3, 10, Math.max(dataRows.length, 100), 1).setDataValidation(statusRule);

  // Add data validation for Month
  var months = ['January', 'February', 'March', 'April', 'May', 'June',
                'July', 'August', 'September', 'October', 'November', 'December'];
  var monthRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(months, true)
    .setAllowInvalid(false)
    .build();
  sheet.getRange(3, 1, Math.max(dataRows.length, 100), 1).setDataValidation(monthRule);

  // Conditional formatting for Status
  var completeRange = sheet.getRange(3, 10, Math.max(dataRows.length, 100), 1);
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

  // Add visual separation between months for easier reading
  if (dataRows.length > 0) {
    var currentRow = 3;
    var monthColors = ['#e8f4f8', '#ffffff']; // Alternating light blue and white
    var colorIndex = 0;

    for (var m = 0; m < trainingTopics.length; m++) {
      var monthName = trainingTopics[m].month;
      var crewCount = filteredCrews.length;

      if (crewCount > 0) {
        var monthRange = sheet.getRange(currentRow, 1, crewCount, headers.length);

        // Set alternating background color for entire month group
        monthRange.setBackground(monthColors[colorIndex % 2]);

        // Add thick border at bottom of each month group for separation
        monthRange.setBorder(null, null, true, null, null, null, '#666666', SpreadsheetApp.BorderStyle.SOLID_MEDIUM);

        // Make month name bold and slightly larger for first row of each month
        var firstRowRange = sheet.getRange(currentRow, 1, 1, headers.length);
        firstRowRange.setFontWeight('bold');

        currentRow += crewCount;
        colorIndex++;
      }
    }
  }

  // Auto-resize columns
  for (var i = 1; i <= headers.length; i++) {
    sheet.autoResizeColumn(i);
  }

  // Set minimum widths
  sheet.setColumnWidth(1, 100);  // Month
  sheet.setColumnWidth(2, 350);  // Training Topic
  sheet.setColumnWidth(3, 100);  // Crew #
  sheet.setColumnWidth(4, 150);  // Crew Lead
  sheet.setColumnWidth(5, 80);   // Crew Size
  sheet.setColumnWidth(7, 150);  // Attendees
  sheet.setColumnWidth(11, 200); // Notes

  sheet.setFrozenRows(2);

  var message = '✅ Training Tracking sheet created!\n\n';
  message += 'Generated ' + dataRows.length + ' training records for:\n';
  message += '• ' + filteredCrews.length + ' active crews (tracked)\n';

  if (excludedCrews.length > 0) {
    message += '• ' + excludedCrews.length + ' crew(s) excluded:\n';
    if (manualExclusions.length > 0) {
      message += '  - Manual: ' + manualExclusions.join(', ') + '\n';
    }
    if (autoExcludedCrews.length > 0) {
      message += '  - Auto (N/A or weeds): ' + autoExcludedCrews.join(', ') + '\n';
    }
  }

  message += '• 12 months of 2026 training topics\n\n';
  message += 'Update completion dates and status as training is completed.\n\n';
  message += '💡 TIP: Crews with foreman (F/GTO F) having job# N/A or location "weeds" are auto-excluded.';

  SpreadsheetApp.getUi().alert(message);
}

/**
 * Refreshes Crew Lead and Crew Size columns in Training Tracking sheet.
 * Preserves all user data (completion dates, status, attendees, etc.).
 * Use this after crew changes (e.g., after importing new crew makeup).
 *
 * Menu: Glove Manager → Schedule & To-Do → 🔄 Refresh Training Tracking Crew Leads
 */
function refreshTrainingTrackingCrewLeads() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_TRAINING_TRACKING);

  if (!sheet || sheet.getLastRow() < 3) {
    SpreadsheetApp.getUi().alert('⚠️ Training Tracking sheet not found or empty.\n\nRun "Setup Training Tracking" first.');
    return;
  }

  var data = sheet.getDataRange().getValues();
  var updatedCount = 0;
  var changes = [];

  // Column indices (0-based)
  var crewCol = 2;     // C: Crew #
  var leadCol = 3;     // D: Crew Lead
  var sizeCol = 4;     // E: Crew Size

  // Start from row 3 (index 2) - skip title and headers
  for (var i = 2; i < data.length; i++) {
    var row = data[i];
    var crewNumber = String(row[crewCol]).trim();
    var currentLead = String(row[leadCol]).trim();

    if (!crewNumber) continue;

    // Get current crew lead and size
    var leadInfo = getCrewLead(crewNumber);
    var newLead = leadInfo ? leadInfo.name : '';
    var newSize = getCrewSize(crewNumber);

    var rowNum = i + 1; // 1-based row number

    // Update if different
    if (currentLead !== newLead) {
      sheet.getRange(rowNum, leadCol + 1).setValue(newLead);
      if (currentLead && newLead && currentLead !== newLead) {
        changes.push(crewNumber + ': ' + currentLead + ' → ' + newLead);
      }
      updatedCount++;
    }

    // Update crew size
    sheet.getRange(rowNum, sizeCol + 1).setValue(newSize);
  }

  var message = '✅ Training Tracking Crew Leads Refreshed\n\n';
  message += '• ' + updatedCount + ' row(s) updated\n';

  if (changes.length > 0) {
    message += '\n📝 Crew Lead Changes:\n';
    for (var j = 0; j < Math.min(changes.length, 10); j++) {
      message += '  • ' + changes[j] + '\n';
    }
    if (changes.length > 10) {
      message += '  ... and ' + (changes.length - 10) + ' more\n';
    }
  }

  SpreadsheetApp.getUi().alert(message);
}

/**
 * Handles changes to Training Tracking sheet.
 * Protects status selections and automatically updates completion dates.
 * Auto-populates Attendees when status changes to "Complete" (one time only).
 * Updates Training Config Completion Status % when training is completed.
 * Called by onEdit trigger.
 */
function handleTrainingTrackingEdit(e) {
  if (!e || !e.range) return;

  var sheet = e.range.getSheet();
  if (sheet.getName() !== SHEET_TRAINING_TRACKING) return;

  var row = e.range.getRow();
  var col = e.range.getColumn();

  // Skip header rows (row 1 = title, row 2 = headers)
  if (row < 3) return;

  // Column definitions
  var monthCol = 1;           // Column A - Month
  var topicCol = 2;           // Column B - Training Topic
  var crewCol = 3;            // Column C - Crew #
  var completionDateCol = 6;  // Column F - Completion Date
  var attendeesCol = 7;       // Column G - Attendees
  var statusCol = 10;         // Column J - Status

  // If Status was changed to Complete
  if (col === statusCol) {
    var status = e.range.getValue();
    if (status === 'Complete') {
      // Auto-fill completion date if empty
      var dateCell = sheet.getRange(row, completionDateCol);
      if (!dateCell.getValue()) {
        dateCell.setValue(new Date());
      }

      // Auto-populate Attendees if empty (one time only)
      var attendeesCell = sheet.getRange(row, attendeesCol);
      var currentAttendees = attendeesCell.getValue();

      if (!currentAttendees || String(currentAttendees).trim() === '') {
        // Get crew number for this training record
        var crewCell = sheet.getRange(row, crewCol);
        var crewNumber = String(crewCell.getValue()).trim();

        if (crewNumber) {
          // Fetch crew members from Employees sheet
          var crewMembers = getCrewMembers(crewNumber);

          if (crewMembers) {
            attendeesCell.setValue(crewMembers);
            Logger.log('Auto-populated attendees for crew ' + crewNumber + ': ' + crewMembers);
          } else {
            Logger.log('No crew members found for crew ' + crewNumber);
          }
        }
      } else {
        Logger.log('Attendees already populated, skipping auto-fill');
      }

      // Update Training Config completion status
      var monthCell = sheet.getRange(row, monthCol);
      var topicCell = sheet.getRange(row, topicCol);
      var month = String(monthCell.getValue()).trim();
      var topic = String(topicCell.getValue()).trim();

      updateTrainingConfigCompletionStatus(month, topic);
    }
  }

  // If Completion Date was filled in, auto-change Status to Complete if Pending
  if (col === completionDateCol) {
    var dateValue = e.range.getValue();
    if (dateValue) {
      var statusCell = sheet.getRange(row, statusCol);
      var currentStatus = statusCell.getValue();
      if (currentStatus === 'Pending' || currentStatus === '') {
        statusCell.setValue('Complete');

        // Also trigger the attendees population since status is now Complete
        var attendeesCell = sheet.getRange(row, attendeesCol);
        var currentAttendees = attendeesCell.getValue();

        if (!currentAttendees || String(currentAttendees).trim() === '') {
          var crewCell = sheet.getRange(row, crewCol);
          var crewNumber = String(crewCell.getValue()).trim();

          if (crewNumber) {
            var crewMembers = getCrewMembers(crewNumber);

            if (crewMembers) {
              attendeesCell.setValue(crewMembers);
              Logger.log('Auto-populated attendees for crew ' + crewNumber + ': ' + crewMembers);
            }
          }
        }

        // Update Training Config completion status
        var monthCell = sheet.getRange(row, monthCol);
        var topicCell = sheet.getRange(row, topicCol);
        var month = String(monthCell.getValue()).trim();
        var topic = String(topicCell.getValue()).trim();

        updateTrainingConfigCompletionStatus(month, topic);
      }
    }
  }
}

/**
 * Updates the Completion Status % in Training Config sheet based on completed training.
 * Calculates percentage of crews that have completed a specific training topic.
 *
 * @param {string} month - Month name (e.g., "January")
 * @param {string} topic - Training topic name
 */
function updateTrainingConfigCompletionStatus(month, topic) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var trackingSheet = ss.getSheetByName(SHEET_TRAINING_TRACKING);
    var configSheet = ss.getSheetByName(SHEET_TRAINING_CONFIG);

    if (!trackingSheet || !configSheet) {
      Logger.log('updateTrainingConfigCompletionStatus: Required sheets not found');
      return;
    }

    // Get all training records for this month/topic
    var trackingData = trackingSheet.getDataRange().getValues();
    var totalCrews = 0;
    var completedCrews = 0;

    // Count total crews and completed crews for this training
    for (var i = 2; i < trackingData.length; i++) { // Start at row 3 (index 2)
      var row = trackingData[i];
      var rowMonth = String(row[0]).trim();
      var rowTopic = String(row[1]).trim();
      var status = String(row[9]).trim();

      // Match by topic (handle December catch-up topics that start with month name)
      var isMatch = false;
      if (rowMonth === month && rowTopic === topic) {
        isMatch = true;
      } else if (rowMonth === 'December' && rowTopic.indexOf(topic) !== -1) {
        // December catch-up topics include original topic name
        isMatch = true;
      }

      if (isMatch) {
        totalCrews++;
        if (status === 'Complete') {
          completedCrews++;
        }
      }
    }

    // Calculate percentage
    var percentage = totalCrews > 0 ? Math.round((completedCrews / totalCrews) * 100) : 0;
    var percentageString = percentage + '%';

    Logger.log('Training completion: ' + topic + ' = ' + completedCrews + '/' + totalCrews + ' = ' + percentageString);

    // Update Training Config sheet
    var configData = configSheet.getDataRange().getValues();

    // Find the matching training row in Training Config
    for (var c = 1; c < configData.length; c++) { // Start at row 2 (index 1)
      var configRow = configData[c];
      var configTopic = String(configRow[0]).trim();

      // Match by topic name (Training Config has format "Month: Topic")
      if (configTopic.indexOf(month) !== -1 && configTopic.indexOf(topic) !== -1) {
        // Column H (index 7) is Completion Status
        configSheet.getRange(c + 1, 8).setValue(percentageString);
        Logger.log('Updated Training Config row ' + (c + 1) + ' with ' + percentageString);
        break;
      }
    }

  } catch (e) {
    Logger.log('updateTrainingConfigCompletionStatus error: ' + e.toString());
  }
}

/**
 * Manually recalculates all completion status percentages in Training Config.
 * Useful for bulk updates or fixing discrepancies.
 * Menu item: Glove Manager → Schedule → Recalculate Training Completion %
 */
function recalculateAllTrainingCompletionStatus() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var configSheet = ss.getSheetByName(SHEET_TRAINING_CONFIG);

  if (!configSheet || configSheet.getLastRow() < 2) {
    SpreadsheetApp.getUi().alert('❌ Training Config sheet not found or empty!');
    return;
  }

  var configData = configSheet.getDataRange().getValues();
  var monthMap = {
    'January': 'January', 'February': 'February', 'March': 'March',
    'April': 'April', 'May': 'May', 'June': 'June',
    'July': 'July', 'August': 'August', 'September': 'September',
    'October': 'October', 'November': 'November', 'December': 'December'
  };

  var updatedCount = 0;

  // Process each training topic in Training Config
  for (var i = 1; i < configData.length; i++) { // Start at row 2 (index 1)
    var configTopic = String(configData[i][0]).trim();

    // Extract month from topic (format: "Month: Topic Name")
    var month = '';
    for (var monthName in monthMap) {
      if (configTopic.indexOf(monthName) === 0) {
        month = monthName;
        break;
      }
    }

    // Extract the actual topic name (after the colon)
    var colonIndex = configTopic.indexOf(':');
    var topic = colonIndex !== -1 ? configTopic.substring(colonIndex + 1).trim() : configTopic;

    if (month && topic) {
      updateTrainingConfigCompletionStatus(month, topic);
      updatedCount++;
    }
  }

  SpreadsheetApp.getUi().alert(
    '✅ Training Completion Status Recalculated!\n\n' +
    'Updated ' + updatedCount + ' training topics.\n\n' +
    'All completion percentages have been refreshed based on current Training Tracking data.'
  );
}

/**
 * Automatically checks and updates December catch-ups based on current month.
 * Runs on the 1st of each month via time-based trigger.
 * Can also be called manually.
 */
function autoUpdateDecemberCatchUps() {
  var today = new Date();
  var currentMonth = today.getMonth() + 1; // 1-12

  // Only run from February onwards (month 2+)
  // This gives crews a chance to complete January training
  if (currentMonth < 2) {
    return;
  }

  // Run the update
  try {
    updateDecemberCatchUps();
  } catch (e) {
    Logger.log('autoUpdateDecemberCatchUps error: ' + e);
  }
}

/**
 * Gets all crew member names for a given crew number.
 * Returns a comma-separated list of employee names whose job numbers match the crew.
 *
 * @param {string} crewNumber - Crew number (e.g., "009-26")
 * @return {string} Comma-separated list of employee names (e.g., "John Doe, Jane Smith")
 */
function getCrewMembers(crewNumber) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var employeesSheet = ss.getSheetByName(SHEET_EMPLOYEES);

    if (!employeesSheet || employeesSheet.getLastRow() < 2) {
      Logger.log('getCrewMembers: Employees sheet not found or empty');
      return '';
    }

    var data = employeesSheet.getDataRange().getValues();
    var headers = data[0];
    var nameCol = -1;
    var jobNumCol = -1;
    var lastDayCol = -1;

    // Find columns
    for (var h = 0; h < headers.length; h++) {
      var header = String(headers[h]).toLowerCase().trim();
      if (header === 'name') nameCol = h;
      if (header === 'job number') jobNumCol = h;
      if (header === 'last day') lastDayCol = h;
    }

    if (nameCol === -1 || jobNumCol === -1) {
      Logger.log('getCrewMembers: Required columns not found (Name or Job Number)');
      return '';
    }

    var crewMembers = [];

    // Process each employee
    for (var i = 1; i < data.length; i++) {
      var row = data[i];
      var employeeName = String(row[nameCol]).trim();
      var employeeJobNum = String(row[jobNumCol]).trim();
      var lastDay = lastDayCol !== -1 ? row[lastDayCol] : '';

      // Skip if no name, no job number, or has left
      if (!employeeName || !employeeJobNum || lastDay) continue;

      // Extract crew number from job number
      var employeeCrew = extractCrewNumber(employeeJobNum);

      // If this employee belongs to the requested crew, add them
      if (employeeCrew === crewNumber) {
        crewMembers.push(employeeName);
      }
    }

    // Return comma-separated list
    var result = crewMembers.join(', ');
    Logger.log('getCrewMembers(' + crewNumber + '): Found ' + crewMembers.length + ' members - ' + result);
    return result;

  } catch (e) {
    Logger.log('getCrewMembers error: ' + e.toString());
    return '';
  }
}

/**
 * Refreshes the Attendees column in Training Tracking with current crew member names.
 * Only updates rows where Attendees is empty or matches previous crew roster.
 * Does NOT overwrite manually edited attendee lists.
 * Menu item: Glove Manager → Schedule → Refresh Training Attendees
 */
function refreshTrainingAttendees() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_TRAINING_TRACKING);

  if (!sheet || sheet.getLastRow() < 3) {
    SpreadsheetApp.getUi().alert('❌ Training Tracking sheet not found or empty!\n\nPlease run "Setup Training Tracking" first.');
    return;
  }

  var data = sheet.getDataRange().getValues();
  // Use dynamic header detection (handles extra rows between title and headers)
  var headerIdx = typeof findTrainingTrackingHeaderRow === 'function' ? findTrainingTrackingHeaderRow(data) : 1;
  var headers = data[headerIdx];
  var dataStartIdx = headerIdx + 1;

  // Find column indices
  var crewCol = -1;
  var attendeesCol = -1;
  var statusCol = -1;

  for (var h = 0; h < headers.length; h++) {
    var header = String(headers[h]).toLowerCase().trim();
    if (header === 'crew #' || header === 'crew' || header === 'job number' || header === 'crew number') crewCol = h;
    if (header === 'attendees') attendeesCol = h;
    if (header === 'status') statusCol = h;
  }

  if (crewCol === -1 || attendeesCol === -1) {
    SpreadsheetApp.getUi().alert('❌ Required columns not found in Training Tracking sheet!');
    return;
  }

  var updatedCount = 0;
  var skippedCount = 0;

  // Pre-cache crew members to avoid redundant Employees sheet reads
  var crewMembersCache = {};
  function getCachedCrewMembers(crewNum) {
    if (!crewMembersCache.hasOwnProperty(crewNum)) {
      crewMembersCache[crewNum] = getCrewMembers(crewNum);
    }
    return crewMembersCache[crewNum];
  }

  // Process each training record (start from first data row after headers)
  for (var i = dataStartIdx; i < data.length; i++) {
    var row = data[i];
    var crew = String(row[crewCol]).trim();
    var currentAttendees = String(row[attendeesCol] || '').trim();
    var status = String(row[statusCol] || '').trim();

    if (!crew) continue;

    // Skip if status is Complete (don't change historical records)
    if (status === 'Complete') {
      skippedCount++;
      continue;
    }

    // Get current crew members (from cache)
    var crewMembers = getCachedCrewMembers(crew);

    // Only update if:
    // 1. Attendees is empty, OR
    // 2. Current attendees matches the full crew roster (not manually edited)
    if (!currentAttendees || currentAttendees === crewMembers) {
      // Update the cell
      sheet.getRange(i + 1, attendeesCol + 1).setValue(crewMembers);
      updatedCount++;
    } else {
      // Skip - appears to be manually edited
      skippedCount++;
    }
  }

  SpreadsheetApp.getUi().alert(
    '✅ Training Attendees Refreshed!\n\n' +
    'Updated: ' + updatedCount + ' record(s)\n' +
    'Skipped: ' + skippedCount + ' record(s) (completed or manually edited)\n\n' +
    '💡 TIP: Completed training records are not modified to preserve historical data.'
  );
}

/**
 * Creates a monthly trigger to auto-update December catch-ups.
 * Runs on the 1st of each month.
 * Menu item: Glove Manager → Schedule → Setup Auto December Updates
 */
function setupAutoDecemberUpdates() {
  // Delete existing triggers for this function
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'autoUpdateDecemberCatchUps') {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }

  // Create new monthly trigger (1st of each month at 6 AM)
  ScriptApp.newTrigger('autoUpdateDecemberCatchUps')
    .timeBased()
    .onMonthDay(1)
    .atHour(6)
    .create();

  SpreadsheetApp.getUi().alert(
    '✅ Auto December Updates Enabled!\n\n' +
    'System will automatically update December catch-ups on the 1st of each month.\n\n' +
    'This ensures incomplete training is always tracked in December.\n\n' +
    '💡 You can still manually run "Update December Catch-Ups" anytime.'
  );
}

/**
 * Updates December catch-up training based on incomplete training from Jan-Nov.
 * Only adds entries for COMPLETED months with incomplete training.
 * Creates one December entry per crew per incomplete month/topic.
 * Removes crews that no longer exist on Employees sheet.
 * Menu item: Glove Manager → Schedule → Update December Catch-Ups
 */
function updateDecemberCatchUps() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_TRAINING_TRACKING);

  if (!sheet || sheet.getLastRow() < 3) {
    SpreadsheetApp.getUi().alert('❌ Training Tracking sheet not found or empty!\n\nPlease run "Setup Training Tracking" first.');
    return;
  }

  var data = sheet.getDataRange().getValues();
  var headerIdx = findTrainingTrackingHeaderRow ? findTrainingTrackingHeaderRow(data) : 1;
  var headers = data[headerIdx];

  // Find columns dynamically
  var monthCol = 0, topicCol = 1, crewCol = 2, leadCol = 3, sizeCol = 4;
  var dateCol = 5, attendeesCol = 6, hoursCol = 7, statusCol = 8, notesCol = 9;

  for (var hc = 0; hc < headers.length; hc++) {
    var hdr = String(headers[hc]).toLowerCase().trim();
    if (hdr === 'month') monthCol = hc;
    if (hdr === 'training topic' || hdr === 'topic' || hdr === 'title') topicCol = hc;
    if (hdr === 'crew #' || hdr === 'crew#' || hdr === 'job number' || hdr === 'crew' || hdr === 'crew number') crewCol = hc;
    if (hdr === 'crew lead' || hdr === 'foreman') leadCol = hc;
    if (hdr === 'crew size' || hdr === 'size') sizeCol = hc;
    if (hdr === 'completion date' || hdr === 'date') dateCol = hc;
    if (hdr === 'attendees') attendeesCol = hc;
    if (hdr === 'hours trainer' || hdr === 'hours') hoursCol = hc;
    if (hdr === 'status') statusCol = hc;
    if (hdr === 'notes') notesCol = hc;
  }

  // Get current month to determine which months are "complete" (past)
  var today = new Date();
  var currentMonth = today.getMonth() + 1; // 1-12

  // Month name to number mapping
  var monthNumbers = {
    'January': 1, 'February': 2, 'March': 3, 'April': 4,
    'May': 5, 'June': 6, 'July': 7, 'August': 8,
    'September': 9, 'October': 10, 'November': 11, 'December': 12
  };

  // Get list of active crews from Employees sheet
  var activeCrews = getActiveCrews();
  var activeCrewsSet = {};
  for (var ac = 0; ac < activeCrews.length; ac++) {
    activeCrewsSet[activeCrews[ac]] = true;
  }

  // Track incomplete training by crew (only for completed months)
  var incompleteByCrewMap = {};
  var decemberRowsToDelete = [];

  // Scan all training records
  for (var i = 2; i < data.length; i++) {
    var row = data[i];
    var month = String(row[monthCol]).trim();
    var topic = String(row[topicCol]).trim();
    var crew = String(row[crewCol]).trim();
    var status = String(row[statusCol]).trim();
    var completionDate = row[dateCol];

    // Track December rows for deletion
    if (month === 'December') {
      decemberRowsToDelete.push(i + 1); // +1 for 1-based row numbers
      continue;
    }

    // Only process months that have already passed (completed)
    var monthNum = monthNumbers[month];
    if (!monthNum || monthNum >= currentMonth) {
      continue; // Skip current and future months
    }

    // Check if crew still exists on Employees sheet
    if (!activeCrewsSet[crew]) {
      Logger.log('Skipping inactive crew: ' + crew);
      continue;
    }

    // Check if training is incomplete (past months only)
    if (crew) {
      var isIncomplete = (!completionDate || completionDate === '') &&
                        (status !== 'Complete' && status !== 'N/A');

      if (isIncomplete) {
        if (!incompleteByCrewMap[crew]) {
          incompleteByCrewMap[crew] = {
            lead: row[leadCol],
            size: row[sizeCol],
            topics: []
          };
        }

        // Create descriptive topic name with month and original topic
        var decemberTopicName = month + ': ' + topic;

        incompleteByCrewMap[crew].topics.push({
          month: month,
          topic: topic,
          decemberTopicName: decemberTopicName,
          hours: row[hoursCol]
        });
      }
    }
  }

  // Delete existing December rows (in reverse order to maintain indices)
  for (var d = decemberRowsToDelete.length - 1; d >= 0; d--) {
    sheet.deleteRow(decemberRowsToDelete[d]);
  }

  // Add new December catch-up rows based on incomplete training
  var newDecemberRows = [];
  var totalIncomplete = 0;

  for (var crew in incompleteByCrewMap) {
    var crewData = incompleteByCrewMap[crew];

    // Create one row per incomplete topic (each month shows separately)
    for (var t = 0; t < crewData.topics.length; t++) {
      var incompleteTopic = crewData.topics[t];
      var catchupNote = 'Makeup training from ' + incompleteTopic.month;

      newDecemberRows.push([
        'December',
        incompleteTopic.decemberTopicName, // e.g., "January: Respectful Workplace Training"
        crew,
        crewData.lead,
        crewData.size,
        '', // Completion Date
        '', // Attendees
        incompleteTopic.hours,
        '', // Trainer
        'Pending', // Status
        catchupNote
      ]);
      totalIncomplete++;
    }
  }

  // Append December rows to sheet
  if (newDecemberRows.length > 0) {
    var lastRow = sheet.getLastRow();
    sheet.getRange(lastRow + 1, 1, newDecemberRows.length, 11).setValues(newDecemberRows);

    // Apply December formatting
    var decemberRange = sheet.getRange(lastRow + 1, 1, newDecemberRows.length, 11);
    decemberRange.setBackground('#fff3cd'); // Light yellow for December catch-ups
    decemberRange.setBorder(null, null, true, null, null, null, '#666666', SpreadsheetApp.BorderStyle.SOLID_MEDIUM);
  }

  // Show summary
  var crewCount = Object.keys(incompleteByCrewMap).length;
  var message = '✅ December Catch-Ups Updated!\n\n';
  message += 'Current Month: ' + getMonthName(currentMonth) + '\n';
  message += 'Processing months: January - ' + getMonthName(currentMonth - 1) + '\n\n';

  if (totalIncomplete > 0) {
    message += 'Added ' + totalIncomplete + ' catch-up training record(s) for ' + crewCount + ' crew(s).\n\n';
    message += 'Crews with incomplete training:\n';
    for (var crew in incompleteByCrewMap) {
      var topics = incompleteByCrewMap[crew].topics;
      message += '• ' + crew + ': ' + topics.length + ' topic(s)\n';
    }
    message += '\n💡 TIP: Complete these in December or mark as N/A if not required.';
  } else {
    message += 'No incomplete training found!\n\n';
    message += 'All active crews are up-to-date on completed months.\n';
    message += 'December catch-up section is empty.';
  }

  SpreadsheetApp.getUi().alert(message);
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
  var headerIdx = findTrainingTrackingHeaderRow ? findTrainingTrackingHeaderRow(data) : 1;
  var headers = data[headerIdx];

  // Find column indices
  var colIndices = {};
  for (var h = 0; h < headers.length; h++) {
    var header = String(headers[h]).toLowerCase().trim();
    if (header === 'month') colIndices.month = h;
    if (header === 'job number' || header === 'crew' || header === 'crew #' || header === 'crew number') colIndices.jobNumber = h;
    if (header === 'status') colIndices.status = h;
    if (header === 'completion date') colIndices.completionDate = h;
    if (header === 'training topic' || header === 'title' || header === 'topic') colIndices.topic = h;
  }

  // Search for this job number and month
  for (var i = headerIdx + 1; i < data.length; i++) {
    var row = data[i];
    var rowMonth = String(row[colIndices.month]).trim();
    var rowJobNum = String(row[colIndices.jobNumber]).trim();

    if (rowMonth === month && rowJobNum === jobNumber) {
      return {
        found: true,
        status: row[colIndices.status] || 'Unassigned',
        completionDate: row[colIndices.completionDate],
        topic: row[colIndices.topic]
      };
    }
  }

  return {found: false, status: 'Not tracked'};
}

/**
 * Generates a compliance report showing training status for all crews.
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
  if (data.length < 3) {
    SpreadsheetApp.getUi().alert('⚠️ No training data found!\n\nPlease run "Setup Training Tracking" to generate training records.');
    return;
  }

  // Count completions by crew
  var crewStats = {};
  var totalRequired = 12; // 12 months of training in 2026
  var allMonths = ['January', 'February', 'March', 'April', 'May', 'June',
                   'July', 'August', 'September', 'October', 'November', 'December'];

  for (var i = 2; i < data.length; i++) {
    var row = data[i];
    var month = String(row[0]).trim();      // Column A - Month
    var crewNum = String(row[2]).trim();     // Column C - Crew #
    var crewLead = String(row[3]).trim();    // Column D - Crew Lead
    var status = String(row[9]).trim();      // Column J - Status

    if (!crewNum) continue;

    if (!crewStats[crewNum]) {
      crewStats[crewNum] = {
        lead: crewLead,
        complete: 0,
        pending: 0,
        overdue: 0,
        inProgress: 0,
        total: 0,
        missingMonths: []
      };
    }

    crewStats[crewNum].total++;

    if (status === 'Complete') {
      crewStats[crewNum].complete++;
    } else if (status === 'Overdue') {
      crewStats[crewNum].overdue++;
      crewStats[crewNum].missingMonths.push(month);
    } else if (status === 'In Progress') {
      crewStats[crewNum].inProgress++;
    } else {
      crewStats[crewNum].pending++;
    }
  }

  // Sort crews into categories
  var compliantCrews = [];
  var partialCrews = [];
  var nonCompliantCrews = [];

  for (var crew in crewStats) {
    var stats = crewStats[crew];
    var percentComplete = stats.total > 0 ? ((stats.complete / totalRequired) * 100) : 0;

    stats.percentComplete = percentComplete;
    stats.crewNum = crew;

    if (percentComplete === 100) {
      compliantCrews.push(stats);
    } else if (percentComplete >= 50) {
      partialCrews.push(stats);
    } else {
      nonCompliantCrews.push(stats);
    }
  }

  // Build formatted report
  var report = 'Training Compliance Report - 2026\n';
  report += '═════════════════════════════════════════\n\n';

  // Compliant crews
  if (compliantCrews.length > 0) {
    report += '✅ COMPLIANT CREWS (' + compliantCrews.length + '):\n';
    report += '─────────────────────────────────────────\n';
    compliantCrews.forEach(function(stats) {
      report += '  ' + stats.crewNum + ' - ' + (stats.lead || 'No lead assigned');
      report += ' (' + stats.complete + '/' + totalRequired + ' complete)\n';
    });
    report += '\n';
  }

  // Partially compliant crews
  if (partialCrews.length > 0) {
    report += '⚠️ PARTIALLY COMPLIANT (' + partialCrews.length + '):\n';
    report += '─────────────────────────────────────────\n';
    partialCrews.forEach(function(stats) {
      report += '  ' + stats.crewNum + ' - ' + (stats.lead || 'No lead assigned') + '\n';
      report += '    Complete: ' + stats.complete + '/' + totalRequired + ' (' + stats.percentComplete.toFixed(0) + '%)\n';
      report += '    In Progress: ' + stats.inProgress + ', Pending: ' + stats.pending;
      if (stats.overdue > 0) {
        report += ', Overdue: ' + stats.overdue;
      }
      report += '\n';
      if (stats.missingMonths.length > 0) {
        report += '    Missing: ' + stats.missingMonths.join(', ') + '\n';
      }
      report += '\n';
    });
  }

  // Non-compliant crews
  if (nonCompliantCrews.length > 0) {
    report += '🔴 NON-COMPLIANT (' + nonCompliantCrews.length + '):\n';
    report += '─────────────────────────────────────────\n';
    nonCompliantCrews.forEach(function(stats) {
      report += '  ' + stats.crewNum + ' - ' + (stats.lead || 'No lead assigned') + '\n';
      report += '    Complete: ' + stats.complete + '/' + totalRequired + ' (' + stats.percentComplete.toFixed(0) + '%)\n';
      report += '    In Progress: ' + stats.inProgress + ', Pending: ' + stats.pending;
      if (stats.overdue > 0) {
        report += ', Overdue: ' + stats.overdue;
      }
      report += '\n';
      if (stats.missingMonths.length > 0) {
        report += '    Missing: ' + stats.missingMonths.join(', ') + '\n';
      }
      report += '\n';
    });
  }

  // Summary
  var totalCrews = compliantCrews.length + partialCrews.length + nonCompliantCrews.length;
  var overallCompliance = totalCrews > 0 ? ((compliantCrews.length / totalCrews) * 100).toFixed(1) : 0;

  report += '═════════════════════════════════════════\n';
  report += 'SUMMARY:\n';
  report += '  Total Crews: ' + totalCrews + '\n';
  report += '  Overall Compliance: ' + overallCompliance + '%\n';
  report += '  Date: ' + Utilities.formatDate(new Date(), ss.getSpreadsheetTimeZone(), 'MM/dd/yyyy') + '\n';

  SpreadsheetApp.getUi().alert('📊 Training Compliance Report', report, SpreadsheetApp.getUi().ButtonSet.OK);
}

// ============================================================================
// ROUTE OPTIMIZATION & TASK SCHEDULING
// ============================================================================

/**
 * Generates a monthly schedule with optimized routes for crew visits.
 * Menu item: Glove Manager → Schedule → Generate Monthly Schedule
 *
 * Auto-populates Crew Visit Config from To-Do List if not already configured.
 */
function generateMonthlySchedule() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var ui = SpreadsheetApp.getUi();

  var today = new Date();
  var currentYear = today.getFullYear();
  var currentMonth = today.getMonth() + 1; // 1-12

  var result = ui.alert(
    'Generate Monthly Schedule',
    'Generate schedule for ' + getMonthName(currentMonth) + ' ' + currentYear + '?\n\n' +
    'This will:\n' +
    '• Auto-create crew visits from To-Do List\n' +
    '• Schedule based on due dates\n' +
    '• Optimize routes by location\n' +
    '• Calculate drive times\n' +
    '• Flag overnight stays required',
    ui.ButtonSet.YES_NO
  );

  if (result !== ui.Button.YES) {
    return;
  }

  try {
    // Auto-populate Crew Visit Config from To-Do List if needed
    var populationResult = autoPopulateCrewVisitConfigFromToDo(ss);

    // Check if Crew Visit Config was created
    var configSheet = ss.getSheetByName(SHEET_CREW_VISIT_CONFIG);
    if (!configSheet || configSheet.getLastRow() < 2) {
      ui.alert('⚠️ Could not create Crew Visit Config.\n\n' +
               'Debug Info:\n' +
               '• To-Do List exists: ' + (ss.getSheetByName('To Do List') ? 'Yes' : 'No') + '\n' +
               '• To-Do List rows: ' + (ss.getSheetByName('To Do List') ? ss.getSheetByName('To Do List').getLastRow() : 0) + '\n' +
               '• Population result: ' + (populationResult || 'No data returned') + '\n\n' +
               'Please check if To-Do List has tasks (should have rows 14+).');
      return;
    }

    // Get all crew visits for the month
    var visits = getCrewVisitsForMonth(currentYear, currentMonth);

    if (visits.length === 0) {
      // If still no visits, check why
      var configRowCount = configSheet.getLastRow();
      ui.alert('⚠️ No crew visits scheduled for ' + getMonthName(currentMonth) + ' ' + currentYear + '.\n\n' +
               'Debug Info:\n' +
               '• Crew Visit Config has ' + (configRowCount - 1) + ' crew(s)\n' +
               '• Next Visit Dates may be in different months\n\n' +
               'Check Crew Visit Config sheet "Next Visit Date" column.\n' +
               'Dates should be in January 2026 to appear on this month\'s calendar.');
      return;
    }

    // Optimize daily routes
    var optimizedSchedule = optimizeMonthlyRoutes(visits);

    // Update To-Do List calendar with scheduled visits
    updateToDoListWithSchedule(ss, visits, currentYear, currentMonth);

    ui.alert('✅ Monthly Schedule Generated!\n\n' +
      visits.length + ' crew visits scheduled\n' +
      optimizedSchedule.overnightCount + ' overnight stays required\n\n' +
      'Check the To-Do List calendar for scheduled visits.');

    logEvent('Monthly schedule generated for ' + getMonthName(currentMonth) + ' ' + currentYear, 'INFO');
  } catch (e) {
    ui.alert('❌ Error generating schedule:\n\n' + e.toString());
    Logger.log('Error in generateMonthlySchedule: ' + e.toString());
  }
}

/**
 * Optimizes crew visit routes for the month by grouping by location and date.
 * Calculates optimal visit sequences to minimize drive time.
 *
 * @param {Array} visits - Array of visit objects
 * @return {Object} Optimized schedule object with routes and statistics
 */
function optimizeMonthlyRoutes(visits) {
  var routesByDate = {};
  var overnightCount = 0;

  // Group visits by date
  visits.forEach(function(visit) {
    var dateKey = Utilities.formatDate(visit.date, Session.getScriptTimeZone(), 'yyyy-MM-dd');

    if (!routesByDate[dateKey]) {
      routesByDate[dateKey] = [];
    }

    routesByDate[dateKey].push(visit);

    // Check if overnight required
    var overnightInfo = detectOvernightRequirement(visit);
    if (overnightInfo.overnightRequired) {
      overnightCount++;
    }
  });

  // Optimize each day's route
  var optimizedDays = [];
  for (var dateKey in routesByDate) {
    var dayVisits = routesByDate[dateKey];
    var optimizedDay = optimizeDailyRoute(dateKey, dayVisits);
    optimizedDays.push(optimizedDay);
  }

  return {
    days: optimizedDays,
    totalVisits: visits.length,
    overnightCount: overnightCount
  };
}

/**
 * Optimizes the route for a single day's crew visits.
 * Orders visits by proximity to minimize total drive time.
 *
 * @param {string} dateKey - Date in 'yyyy-MM-dd' format
 * @param {Array} visits - Array of visit objects for this date
 * @return {Object} Optimized daily route object
 */
function optimizeDailyRoute(dateKey, visits) {
  if (!visits || visits.length === 0) {
    return {
      date: dateKey,
      visits: [],
      totalDriveTime: 0,
      totalVisitTime: 0,
      overnightRequired: false
    };
  }

  // Sort visits by drive time from Helena (closest first)
  var sortedVisits = visits.slice().sort(function(a, b) {
    return (a.driveTime || 0) - (b.driveTime || 0);
  });

  // Calculate total times
  var totalDriveTime = 0;
  var totalVisitTime = 0;
  var overnightRequired = false;

  sortedVisits.forEach(function(visit) {
    totalDriveTime += (visit.driveTime || 0);
    totalVisitTime += (visit.visitTime || 0);

    var overnightInfo = detectOvernightRequirement(visit);
    if (overnightInfo.overnightRequired) {
      overnightRequired = true;
    }
  });

  // Add return drive time for last location
  if (sortedVisits.length > 0) {
    var lastVisit = sortedVisits[sortedVisits.length - 1];
    totalDriveTime += (lastVisit.driveTime || 0);
  }

  return {
    date: dateKey,
    visits: sortedVisits,
    totalDriveTime: totalDriveTime,
    totalVisitTime: totalVisitTime,
    totalTime: totalDriveTime + totalVisitTime,
    overnightRequired: overnightRequired
  };
}

/**
 * Calculates estimated crew visit time based on crew size.
 * Base time + (time per employee × crew size).
 *
 * @param {number} crewSize - Number of crew members
 * @return {number} Estimated visit time in minutes
 */
function calculateCrewVisitTime(crewSize) {
  var baseTime = 15; // Base overhead time (setup, wrap up)
  var timePerEmployee = 5; // Minutes per employee (check gloves/sleeves)

  return baseTime + (timePerEmployee * (crewSize || 5));
}

/**
 * Marks a crew visit as complete and updates the next visit date.
 * Menu item: Glove Manager → Schedule → Mark Visit Complete
 */
function markVisitComplete() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var ui = SpreadsheetApp.getUi();
  var activeSheet = ss.getActiveSheet();

  // Check if we're on the To Do List sheet
  if (activeSheet.getName() !== 'To Do List') {
    ui.alert('Please select a task from the To Do List sheet first.');
    return;
  }

  var activeRow = ss.getActiveCell().getRow();

  // Check if it's a data row (row 14+)
  if (activeRow < 14) {
    ui.alert('Please select a task row (not header or calendar).');
    return;
  }

  // Get task details
  var taskType = activeSheet.getRange(activeRow, 4).getValue(); // Sheet column
  var taskName = activeSheet.getRange(activeRow, 2).getValue(); // Task column

  // Check if it's a crew visit
  if (taskType !== 'Crew Visit Config') {
    ui.alert('This function only works for Crew Visit tasks.\n\nSelected task type: ' + taskType);
    return;
  }

  // Extract job number from task name
  var jobNumberMatch = String(taskName).match(/Job\s*#(\S+)/);
  if (!jobNumberMatch) {
    ui.alert('Could not find job number in task: ' + taskName);
    return;
  }

  var jobNumber = jobNumberMatch[1];
  var visitDate = activeSheet.getRange(activeRow, 6).getValue(); // Scheduled Date column

  if (!visitDate) {
    visitDate = new Date();
  }

  // Update the visit in Crew Visit Config
  updateCrewVisit(jobNumber, visitDate);

  // Mark task as completed
  activeSheet.getRange(activeRow, 12).setValue(true); // Completed checkbox

  ui.alert('✅ Visit Complete!\n\n' +
    'Job #' + jobNumber + '\n' +
    'Last Visit Date updated\n' +
    'Next Visit Date calculated\n\n' +
    'Task marked as completed.');

  logEvent('Crew visit completed: Job #' + jobNumber, 'INFO');
}

/**
 * Refreshes the calendar and schedule in the To-Do List.
 * Menu item: Glove Manager → Schedule → Refresh Calendar
 */
function refreshCalendar() {
  var ui = SpreadsheetApp.getUi();

  var result = ui.alert(
    'Refresh Calendar',
    'This will regenerate the To-Do List with updated schedule.\n\nContinue?',
    ui.ButtonSet.YES_NO
  );

  if (result === ui.Button.YES) {
    generateToDoList();
  }
}

// ============================================================================
// AUTO-POPULATION FUNCTIONS
// ============================================================================

/**
 * Sets up headers for Crew Visit Config sheet.
 * Helper function to avoid code duplication.
 *
 * @param {Sheet} configSheet - Crew Visit Config sheet
 */
function setupCrewVisitConfigHeaders(configSheet) {
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

  configSheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  configSheet.getRange(1, 1, 1, headers.length)
    .setFontWeight('bold')
    .setBackground('#4285f4')
    .setFontColor('white')
    .setHorizontalAlignment('center');

  // Set column widths
  configSheet.setColumnWidth(1, 120); // Job Number
  configSheet.setColumnWidth(2, 120); // Location
  configSheet.setColumnWidth(3, 150); // Crew Lead
  configSheet.setColumnWidth(4, 80);  // Crew Size
  configSheet.setColumnWidth(5, 120); // Visit Frequency
  configSheet.setColumnWidth(6, 120); // Est. Visit Time
  configSheet.setColumnWidth(7, 120); // Last Visit Date
  configSheet.setColumnWidth(8, 120); // Next Visit Date
  configSheet.setColumnWidth(9, 150); // Drive Time
  configSheet.setColumnWidth(10, 80); // Priority
  configSheet.setColumnWidth(11, 200); // Notes

  Logger.log('Crew Visit Config headers created');
}

/**
 * Gets the job number (crew number) for an employee from the Employees sheet.
 * Looks up by employee name and optionally location.
 * Returns the crew number prefix (e.g., "009-26" from "009-26.1").
 *
 * @param {string} employeeName - Employee name to look up
 * @param {string} location - Optional location to match
 * @return {string} Crew job number or empty string if not found
 */
function getJobNumberForEmployee(employeeName, location) {
  if (!employeeName) return '';

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var employeesSheet = ss.getSheetByName(SHEET_EMPLOYEES);

  if (!employeesSheet || employeesSheet.getLastRow() < 2) {
    return '';
  }

  var data = employeesSheet.getDataRange().getValues();
  var headers = data[0];
  var nameCol = -1;
  var jobNumCol = -1;
  var locationCol = -1;
  var lastDayCol = -1;

  // Find columns
  for (var h = 0; h < headers.length; h++) {
    var header = String(headers[h]).toLowerCase().trim();
    if (header === 'name') nameCol = h;
    if (header === 'job number') jobNumCol = h;
    if (header === 'location') locationCol = h;
    if (header === 'last day') lastDayCol = h;
  }

  if (nameCol === -1 || jobNumCol === -1) {
    return '';
  }

  // Search for the employee
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var name = String(row[nameCol]).trim();
    var lastDay = lastDayCol !== -1 ? row[lastDayCol] : '';

    // Skip if employee has left
    if (lastDay) continue;

    // Match by name
    if (name === employeeName) {
      // If location specified, also match location
      if (location && locationCol !== -1) {
        var empLocation = String(row[locationCol]).trim();
        if (empLocation.toLowerCase() !== location.toLowerCase()) {
          continue; // Location doesn't match, keep looking
        }
      }

      // Found the employee - extract crew number
      var jobNumber = String(row[jobNumCol]).trim();
      var crewNumber = extractCrewNumber(jobNumber);

      Logger.log('Found job number for ' + employeeName + ': ' + crewNumber + ' (full: ' + jobNumber + ')');
      return crewNumber;
    }
  }

  Logger.log('No job number found for employee: ' + employeeName);
  return '';
}

/**
 * Auto-populates Crew Visit Config from To-Do List tasks.
 * Groups tasks by location, defaults to monthly frequency.
 * Only creates entries if Crew Visit Config is empty or missing.
 *
 * @param {Spreadsheet} ss - Active spreadsheet
 * @return {string} Status message
 */
function autoPopulateCrewVisitConfigFromToDo(ss) {
  var configSheet = ss.getSheetByName(SHEET_CREW_VISIT_CONFIG);

  // Create sheet if it doesn't exist
  if (!configSheet) {
    configSheet = ss.insertSheet(SHEET_CREW_VISIT_CONFIG);
    Logger.log('Created new Crew Visit Config sheet');
  }

  // Check if already populated (has data beyond header row)
  // If sheet has more than 1 row, it means headers + data exist
  if (configSheet.getLastRow() > 1) {
    Logger.log('Crew Visit Config already populated with ' + (configSheet.getLastRow() - 1) + ' rows, skipping auto-population');
    return 'Already populated'; // Already has data, don't overwrite
  }

  // Get To-Do List
  var todoSheet = ss.getSheetByName('To Do List');
  if (!todoSheet) {
    Logger.log('To-Do List sheet not found');

    // Set up headers even if no data
    if (configSheet.getLastRow() === 0) {
      setupCrewVisitConfigHeaders(configSheet);
    }

    return 'To-Do List not found';
  }

  var todoLastRow = todoSheet.getLastRow();
  Logger.log('To-Do List found with ' + todoLastRow + ' rows');

  if (todoLastRow < 14) {
    Logger.log('To-Do List has no task data (needs row 14+)');

    // Set up headers even if no data
    if (configSheet.getLastRow() === 0) {
      setupCrewVisitConfigHeaders(configSheet);
    }

    return 'To-Do List empty (no tasks)';
  }

  // Read To-Do List tasks (starts at row 14 after calendar)
  var todoData = todoSheet.getDataRange().getValues();
  var todoHeaders = todoData[12]; // Row 13, index 12

  Logger.log('To-Do List headers found: ' + JSON.stringify(todoHeaders));

  // Find column indices in To-Do List
  var colIndices = {
    location: -1,
    employee: -1,
    dueDate: -1,
    estimatedTime: -1,
    driveTime: -1
  };

  for (var h = 0; h < todoHeaders.length; h++) {
    var header = String(todoHeaders[h]).toLowerCase().trim();
    Logger.log('Header ' + h + ': "' + header + '"');

    // Match location column (index 4, column E)
    if (header === 'location') {
      colIndices.location = h;
      Logger.log('Found Location at index ' + h);
    }
    // Match employee/crew column (index 3, column D)
    if (header === 'employee/crew') {
      colIndices.employee = h;
      Logger.log('Found Employee/Crew at index ' + h);
    }
    // Match due date column (index 9, column J)
    if (header === 'due date') {
      colIndices.dueDate = h;
      Logger.log('Found Due Date at index ' + h);
    }
    // Match estimated time column (index 13, column N)
    if (header === 'estimated time (min)') {
      colIndices.estimatedTime = h;
      Logger.log('Found Estimated Time at index ' + h);
    }
    // Match drive time column (index 16, column Q)
    if (header === 'drive time (min)') {
      colIndices.driveTime = h;
      Logger.log('Found Drive Time at index ' + h);
    }
  }

  Logger.log('Column indices found: ' + JSON.stringify(colIndices));

  // Check if we found the required Location column
  if (colIndices.location === -1) {
    Logger.log('ERROR: Location column not found in To-Do List headers');

    // Set up headers even if no data
    if (configSheet.getLastRow() === 0) {
      setupCrewVisitConfigHeaders(configSheet);
    }

    return 'Location column not found in To-Do List';
  }

  // Group tasks by location
  var locationGroups = {};
  var processedRows = 0;
  var skippedRows = 0;

  Logger.log('Starting to process task rows from index 13 to ' + (todoData.length - 1));

  for (var i = 13; i < todoData.length; i++) { // Start from row 14, index 13
    var row = todoData[i];
    var location = String(row[colIndices.location] || '').trim();

    // Log first few rows for debugging
    if (i < 18) {
      Logger.log('Row ' + (i + 1) + ': Location="' + location + '", Employee="' + (row[colIndices.employee] || '') + '"');
    }

    if (!location || location === 'Unknown') {
      skippedRows++;
      continue;
    }

    processedRows++;

    if (!locationGroups[location]) {
      locationGroups[location] = {
        employees: [],
        totalTime: 0,
        driveTime: row[colIndices.driveTime] || 0,
        earliestDueDate: null,
        taskCount: 0
      };
    }

    var employee = String(row[colIndices.employee] || '').trim();
    if (employee && locationGroups[location].employees.indexOf(employee) === -1) {
      locationGroups[location].employees.push(employee);
    }

    locationGroups[location].totalTime += (row[colIndices.estimatedTime] || 0);
    locationGroups[location].taskCount++;

    // Track earliest due date
    var dueDate = row[colIndices.dueDate];
    if (dueDate instanceof Date) {
      if (!locationGroups[location].earliestDueDate || dueDate < locationGroups[location].earliestDueDate) {
        locationGroups[location].earliestDueDate = dueDate;
      }
    }
  }

  Logger.log('Processing complete: ' + processedRows + ' rows processed, ' + skippedRows + ' rows skipped');
  Logger.log('Location groups found: ' + Object.keys(locationGroups).length);
  Logger.log('Locations: ' + Object.keys(locationGroups).join(', '));

  // If no locations found, exit
  if (Object.keys(locationGroups).length === 0) {
    Logger.log('No valid location groups found in To-Do List');

    // Set up headers even if no data
    if (configSheet.getLastRow() === 0) {
      setupCrewVisitConfigHeaders(configSheet);
    }

    return 'No location groups found (processed ' + processedRows + ' rows, skipped ' + skippedRows + ')';
  }

  // Set up Crew Visit Config headers
  configSheet.clear();
  setupCrewVisitConfigHeaders(configSheet);

  // Create crew visit entries from location groups
  var configData = [];
  var today = new Date();
  today.setHours(0, 0, 0, 0);

  for (var location in locationGroups) {
    var group = locationGroups[location];

    // Determine priority based on due dates
    var priority = 'Medium';
    if (group.earliestDueDate) {
      var daysTillDue = Math.ceil((group.earliestDueDate - today) / (1000 * 60 * 60 * 24));
      if (daysTillDue < 0) {
        priority = 'High'; // Overdue
      } else if (daysTillDue <= 7) {
        priority = 'High'; // Due within a week
      }
    }

    // Calculate next visit date - MUST be in current month for calendar to show it
    // Use earliest due date if it's in current month, otherwise use a date in current month
    var currentMonth = today.getMonth();
    var currentYear = today.getFullYear();
    var nextVisitDate;

    if (group.earliestDueDate) {
      var dueDateMonth = group.earliestDueDate.getMonth();
      var dueDateYear = group.earliestDueDate.getFullYear();

      // If due date is in current month or past, use it (or tomorrow if overdue)
      if (dueDateYear < currentYear || (dueDateYear === currentYear && dueDateMonth <= currentMonth)) {
        // If overdue, schedule for tomorrow
        var daysTillDue = Math.ceil((group.earliestDueDate - today) / (1000 * 60 * 60 * 24));
        if (daysTillDue < 0) {
          // Overdue - schedule tomorrow
          nextVisitDate = new Date(today.getTime() + 24 * 60 * 60 * 1000);
        } else {
          // Due this month - use the due date
          nextVisitDate = new Date(group.earliestDueDate);
        }
      } else {
        // Due date is in future month - schedule for mid-current-month
        nextVisitDate = new Date(currentYear, currentMonth, 15);
      }
    } else {
      // No due date - schedule for next week (but in current month)
      nextVisitDate = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);
      // Make sure it's not past end of month
      if (nextVisitDate.getMonth() !== currentMonth) {
        nextVisitDate = new Date(currentYear, currentMonth + 1, 0); // Last day of current month
      }
    }

    Logger.log('Location ' + location + ': Next visit date = ' + nextVisitDate + ' (due date was: ' + group.earliestDueDate + ')');

    // Look up the actual job number from the crew lead
    var crewLead = group.employees[0] || '';
    var jobNumber = getJobNumberForEmployee(crewLead, location);

    // If no job number found, use location-based placeholder
    if (!jobNumber) {
      jobNumber = 'AUTO-' + location.substring(0, 3).toUpperCase();
    }

    configData.push([
      jobNumber, // Actual Job Number from Employees sheet
      location, // Location
      crewLead, // Crew Lead (first employee in list)
      group.employees.length, // Crew Size
      'Monthly', // Visit Frequency - DEFAULT TO MONTHLY
      Math.max(45, group.totalTime), // Est. Visit Time (minimum 45 min)
      '', // Last Visit Date (empty initially)
      nextVisitDate, // Next Visit Date (based on due date)
      group.driveTime, // Drive Time From Helena
      priority, // Priority
      group.taskCount + ' tasks from To-Do List' // Notes
    ]);
  }

  // Write data to sheet
  if (configData.length > 0) {
    configSheet.getRange(2, 1, configData.length, 11).setValues(configData);

    // Format date columns
    configSheet.getRange(2, 7, configData.length, 1).setNumberFormat('mm/dd/yyyy'); // Last Visit Date
    configSheet.getRange(2, 8, configData.length, 1).setNumberFormat('mm/dd/yyyy'); // Next Visit Date

    Logger.log('Auto-populated Crew Visit Config with ' + configData.length + ' locations from To-Do List');
    return 'Success: Created ' + configData.length + ' crew visits';
  } else {
    Logger.log('No config data to write');
    return 'No data generated';
  }
}

/**
 * Updates the To-Do List calendar with scheduled crew visits.
 * Highlights dates on the calendar when visits are scheduled.
 *
 * @param {Spreadsheet} ss - Active spreadsheet
 * @param {Array} visits - Array of visit objects
 * @param {number} year - Year
 * @param {number} month - Month (1-12)
 */
function updateToDoListWithSchedule(ss, visits, year, month) {
  var todoSheet = ss.getSheetByName('To Do List');
  if (!todoSheet) return;

  // Group visits by date
  var visitsByDate = {};
  visits.forEach(function(visit) {
    var dateKey = Utilities.formatDate(visit.date, Session.getScriptTimeZone(), 'd');
    if (!visitsByDate[dateKey]) {
      visitsByDate[dateKey] = [];
    }
    visitsByDate[dateKey].push(visit);
  });

  // Find calendar cells (rows 4-9, columns 1-7) and highlight scheduled dates
  var calendarData = todoSheet.getRange(4, 1, 6, 7).getValues();

  for (var r = 0; r < calendarData.length; r++) {
    for (var c = 0; c < calendarData[r].length; c++) {
      var dayNum = calendarData[r][c];
      if (dayNum && visitsByDate[String(dayNum)]) {
        // Highlight this date with blue background
        todoSheet.getRange(4 + r, 1 + c).setBackground('#bbdefb').setNote('Scheduled: ' + visitsByDate[String(dayNum)].length + ' visit(s)');
      }
    }
  }

  Logger.log('Updated To-Do List calendar with ' + visits.length + ' scheduled visits');
}

