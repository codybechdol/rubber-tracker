/**
 * Glove Manager – Utility Functions
 *
 * Common utility functions used throughout the application.
 * Pure functions with no side effects (except logging).
 */

/**
 * Logging utility for consistent logs and error tracking.
 * @param {string} message - The message to log
 * @param {string} level - Log level: 'INFO', 'ERROR', 'WARNING', 'DEBUG'
 */
const logEvent = (message, level = 'INFO') => {
  const now = new Date();
  const logMessage = `[${level}] [${now.toISOString()}] ${message}`;
  Logger.log(logMessage);

  if (level === 'ERROR') {
    try {
      SpreadsheetApp.getUi().alert(`Error: ${message}`);
    } catch (e) {
      // Ignore if no UI (e.g. trigger execution)
    }
  }
};

/**
 * Normalizes approval values to standard format.
 * Handles HTML entities and common variations.
 * Valid values: None, CL2, CL3, CL2 & CL3
 * @param {string} value - The approval value to normalize
 * @returns {string} - Normalized approval value
 */
const normalizeApprovalValue = (value) => {
  if (!value) return 'CL2'; // Default

  // Clean the value - decode HTML entities and normalize
  let cleaned = String(value).trim();
  // Decode &amp; and &#38; to &
  cleaned = cleaned.split('&amp;').join('&');
  cleaned = cleaned.split('&#38;').join('&');
  cleaned = cleaned.toUpperCase();

  // Map to valid values
  switch (cleaned) {
    case 'NONE':
      return 'None';
    case 'CL2':
    case 'CLASS 2':
    case '2':
      return 'CL2';
    case 'CL3':
    case 'CLASS 3':
    case '3':
      return 'CL3';
    case 'CL2 & CL3':
    case 'CL2 AND CL3':
    case 'CL2&CL3':
    case 'BOTH':
    case '2 & 3':
    case '2&3':
      return 'CL2 & CL3';
    default:
      // Check if it's already a valid value (case-insensitive match)
      if (cleaned === 'CL2 & CL3' || value === 'CL2 & CL3') return 'CL2 & CL3';
      Logger.log(`[WARN] Unrecognized approval value "${value}" - defaulting to CL2`);
      return 'CL2';
  }
};

/**
 * Gets the significant portion of a job number (###-## format).
 * Used for tracking job changes in employee history.
 * Examples: "123-45.6" → "123-45", "123-45" → "123-45"
 * @param {string} jobNumber - The job number to process
 * @returns {string} - The significant portion (###-##)
 */
const getSignificantJobNumber = (jobNumber) => {
  if (!jobNumber) return '';

  const jobStr = String(jobNumber).trim();

  // Match pattern: digits-digits (ignore anything after second dash or decimal)
  // eslint-disable-next-line no-useless-escape
  const match = jobStr.match(/^(\d+\-\d+)/);

  return match ? match[1] : jobStr;
};

/**
 * Extracts the physical city/base from a location string by removing parenthesized status suffixes.
 * E.g., "Helena (Vacation)" -> "Helena", "Bozeman (Light Duty)" -> "Bozeman".
 * If no parenthesis is found, returns the location as-is.
 * @param {string} location - The raw location string
 * @returns {string} - The physical location city
 */
const DOCK_TO_CITY_MAP = {
  'livingston dock': 'Livingston',
  'belgrade dock': 'Bozeman',
  'belgrade': 'Bozeman',
  'helena trans dock': 'Helena',
  'great falls dock': 'Great Falls',
  'butte dock': 'Butte',
  'big sky dock': 'Big Sky',
  'ennis dock': 'Ennis',
  'stanford trans dock': 'Stanford',
  'south dakota dock': 'South Dakota',
  'lolo sub dock': 'Lolo',
  'elliston distro poles': 'Elliston',
  'alkali/rapelje trans': 'Rapelje',
  'manhattan sub': 'Manhattan',
  'anaconda city sub dock': 'Anaconda',
  'three rivers sub dock': 'Three Forks',
  'rattlesnake sub dock': 'Bonner',
  'northern lights dock': 'Northern Lights',
  'ca sub foundation': 'California',
  'gold creek trans dock': 'Gold Creek',
  'texas dock': 'Texas'
};

const getPhysicalLocation = (location) => {
  if (!location) return '';
  let locStr = String(location).trim();
  const parenIdx = locStr.indexOf('(');
  if (parenIdx !== -1) {
    locStr = locStr.substring(0, parenIdx).trim();
  }
  const mapped = DOCK_TO_CITY_MAP[locStr.toLowerCase()];
  return mapped || locStr;
};

/**
 * Checks if a location value is actually an employee status, not a physical city,
 * or if it contains a parenthesized employee status.
 * Uses the STATUS_LOCATIONS constant from 00-Constants.gs.
 * @param {string} location - The location string to check
 * @returns {boolean} - True if the location represents a status or contains a status suffix
 */
const isStatusLocation = (location) => {
  if (!location) return false;
  const loc = String(location).trim().toLowerCase();
  
  // 1. Direct match (old format)
  if (STATUS_LOCATIONS.indexOf(loc) !== -1) {
    return true;
  }
  
  // 2. Check parenthesized status suffix (new format: e.g. "Helena (Vacation)")
  const parenIdx = loc.indexOf('(');
  if (parenIdx !== -1) {
    const endParenIdx = loc.indexOf(')', parenIdx);
    if (endParenIdx !== -1) {
      const status = loc.substring(parenIdx + 1, endParenIdx).trim();
      if (STATUS_LOCATIONS.indexOf(status) !== -1) {
        return true;
      }
    }
  }
  
  return false;
};

/**
 * Checks if a string represents a non-employee value (e.g. equipment locations/statuses like "Not Repairable", "On Shelf", "In Testing", "Lost", etc.)
 * @param {string} name - The name to check
 * @returns {boolean} - True if name is a non-employee value
 */
const isNonEmployeeName = (name) => {
  if (!name) return true;
  const str = String(name).trim().toLowerCase();
  if (!str || str === 'n/a' || str === 'none' || str === 'unknown' || str === 'null' || str === 'undefined') return true;

  const nonEmpList = [
    'lost',
    'on shelf',
    'not repairable',
    'in testing',
    'packed for testing',
    'packed for delivery',
    'destroyed',
    'failed rubber',
    'reclaimed',
    'previous employee',
    'unassigned',
    'blank',
    'spare'
  ];

  if (nonEmpList.indexOf(str) !== -1) return true;
  if (typeof isStatusLocation === 'function' && isStatusLocation(str)) return true;

  return false;
};

/**
 * Checks if an employee is a pending new hire (Hire Date is in the future).
 * Used to exclude pending employees from swap reports, task collection,
 * safety compliance, and training until their start date.
 * Equipment can still be pre-assigned to pending employees.
 * @param {*} hireDate - The Hire Date value from the Employees sheet (col K)
 * @returns {boolean} - True if the employee is pending (hire date in the future)
 */
const isEmployeePending = (hireDate) => {
  if (!hireDate) return false;
  const date = (hireDate instanceof Date) ? hireDate : new Date(hireDate);
  if (isNaN(date.getTime())) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  date.setHours(0, 0, 0, 0);
  return date > today;
};

/**
 * Parses a YYYY-MM-DD string into a Date at noon to avoid timezone shifting.
 * Google Apps Script runs in UTC but spreadsheets use local timezone.
 * Creating dates at midnight UTC can shift back one day in US timezones.
 * @param {string} dateStr - Date string in YYYY-MM-DD format
 * @returns {Date|null} - Parsed date at noon, or null if invalid
 */
const parseDateNoon = (dateStr) => {
  if (!dateStr) return null;
  const parts = String(dateStr).split('-');
  if (parts.length !== 3) return null;
  const d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10), 12, 0, 0, 0);
  return isNaN(d.getTime()) ? null : d;
};

/**
 * Saves a large string value to ScriptProperties by splitting it into 8KB chunks.
 * Clears any older chunks to prevent leftover stale chunks.
 * 
 * @param {string} baseKey - The prefix key to use (e.g., 'TASKS_DATA')
 * @param {string} value - The large string to store
 */
const setChunkedScriptProperty = (baseKey, value) => {
  const props = PropertiesService.getScriptProperties();
  
  // First, clear any existing chunks of this key
  const keys = props.getKeys();
  const chunksToDelete = keys.filter(k => k.indexOf(`${baseKey}_chunk_`) === 0 || k === `${baseKey}_chunks`);
  if (chunksToDelete.length > 0) {
    props.deleteProperties(chunksToDelete);
  }
  
  if (!value) return;
  
  const chunkSize = 8000; // 8KB is safely under the 9KB limit
  const totalChunks = Math.ceil(value.length / chunkSize);
  
  const newProps = {};
  newProps[`${baseKey}_chunks`] = String(totalChunks);
  
  for (let i = 0; i < totalChunks; i++) {
    const start = i * chunkSize;
    const end = Math.min(start + chunkSize, value.length);
    newProps[`${baseKey}_chunk_${i}`] = value.substring(start, end);
  }
  
  props.setProperties(newProps);
  Logger.log(`setChunkedScriptProperty: Saved key "${baseKey}" across ${totalChunks} chunk(s)`);
};

/**
 * Retrieves a large string value from ScriptProperties by combining its 8KB chunks.
 * 
 * @param {string} baseKey - The prefix key to retrieve
 * @return {string|null} The combined string, or null if not found
 */
const getChunkedScriptProperty = (baseKey) => {
  const props = PropertiesService.getScriptProperties();
  const chunksStr = props.getProperty(`${baseKey}_chunks`);
  
  if (!chunksStr) {
    // Fall back to check if it was stored in old non-chunked format
    const legacyVal = props.getProperty(baseKey);
    if (legacyVal) {
      Logger.log(`getChunkedScriptProperty: Retrieved legacy non-chunked key "${baseKey}"`);
      return legacyVal;
    }
    return null;
  }
  
  const totalChunks = parseInt(chunksStr, 10);
  if (isNaN(totalChunks) || totalChunks <= 0) return null;
  
  // Batch retrieve properties for efficiency
  const chunkKeys = [];
  for (let i = 0; i < totalChunks; i++) {
    chunkKeys.push(`${baseKey}_chunk_${i}`);
  }
  
  const values = props.getProperties();
  let combined = '';
  for (let j = 0; j < totalChunks; j++) {
    const chunkVal = values[`${baseKey}_chunk_${j}`];
    if (chunkVal === undefined) {
      Logger.log(`getChunkedScriptProperty: Error - Missing chunk ${j} for key ${baseKey}`);
      return null;
    }
    combined += chunkVal;
  }
  
  Logger.log(`getChunkedScriptProperty: Retrieved and merged ${totalChunks} chunk(s) for key "${baseKey}"`);
  return combined;
};

/**
 * Deletes a chunked string value and legacy key from ScriptProperties.
 * 
 * @param {string} baseKey - The prefix key to delete (e.g., 'TASKS_DATA')
 */
const deleteChunkedScriptProperty = (baseKey) => {
  const props = PropertiesService.getScriptProperties();
  const keys = props.getKeys();
  const chunksToDelete = keys.filter(k => k.indexOf(`${baseKey}_chunk_`) === 0 || k === `${baseKey}_chunks` || k === baseKey);
  if (chunksToDelete.length > 0) {
    props.deleteProperties(chunksToDelete);
    Logger.log(`deleteChunkedScriptProperty: Deleted ${chunksToDelete.length} chunk property key(s) for "${baseKey}"`);
  }
};

/**
 * Finds the header row index in Training Tracking data array.
 * Searches the first 20 rows for a row that contains at least two standard headers.
 * @param {Array} data - 2D array from sheet.getDataRange().getValues()
 * @return {number} Index of the header row (0-based)
 */
const findTrainingTrackingHeaderRow = (data) => {
  for (let i = 0; i < Math.min(data.length, 20); i++) {
    const row = data[i];
    let matchCount = 0;
    for (let h = 0; h < row.length; h++) {
      const val = String(row[h]).toLowerCase().trim();
      if (val === 'month' || val === 'scheduled month' ||
          val === 'crew #' || val === 'crew' || val === 'job number' || val === 'crew number' ||
          val === 'crew lead' || val === 'foreman' || val === 'lead' ||
          val === 'training topic' || val === 'topic' ||
          val === 'status' || val === 'completion date' || val === 'date completed') {
        matchCount++;
      }
    }
    if (matchCount >= 2) {
      Logger.log(`findTrainingTrackingHeaderRow: Found header row at index ${i} (row ${i + 1}) with ${matchCount} matches`);
      return i;
    }
  }
  Logger.log('findTrainingTrackingHeaderRow: Header row not found, falling back to index 1');
  return 1; // default fallback
};

/**
 * Maps Training Tracking headers to column indices dynamically.
 * Provides fallback defaults if critical columns are not found.
 * @param {Array} headers - The header row values
 * @return {Object} Object mapping column names to 0-based indices
 */
const getTrainingTrackingColIndices = (headers) => {
  const indices = {
    month: -1,
    topic: -1,
    crew: -1,
    lead: -1,
    size: -1,
    completionDate: -1,
    attendees: -1,
    hours: -1,
    trainer: -1,
    status: -1,
    notes: -1
  };
  
  if (!headers) return indices;
  
  for (let h = 0; h < headers.length; h++) {
    const header = String(headers[h]).toLowerCase().trim();
    if (header === 'month' || header === 'scheduled month') indices.month = h;
    if (header === 'training topic' || header === 'topic') indices.topic = h;
    if (header === 'job number' || header === 'crew' || header === 'crew #' || header === 'crew number') indices.crew = h;
    if (header === 'crew lead' || header === 'foreman' || header === 'lead') indices.lead = h;
    if (header === 'crew size' || header === 'size') indices.size = h;
    if (header === 'completion date' || header === 'date completed' || header === 'date') indices.completionDate = h;
    if (header === 'attendees' || header === 'attendee list') indices.attendees = h;
    if (header === 'hours' || header === 'training hours') indices.hours = h;
    if (header === 'trainer' || header === 'instructor') indices.trainer = h;
    if (header === 'status' || header === 'training status') indices.status = h;
    if (header === 'notes' || header === 'comments') indices.notes = h;
  }
  
  // Track which fields were actually found
  indices._found = {
    month: indices.month !== -1,
    topic: indices.topic !== -1,
    crew: indices.crew !== -1,
    lead: indices.lead !== -1,
    size: indices.size !== -1,
    completionDate: indices.completionDate !== -1,
    attendees: indices.attendees !== -1,
    hours: indices.hours !== -1,
    trainer: indices.trainer !== -1,
    status: indices.status !== -1,
    notes: indices.notes !== -1
  };
  
  // Apply defaults for any columns that were not found, to avoid crash, but log warnings
  const defaults = {
    month: 0,
    topic: 1,
    crew: 2,
    lead: 3,
    size: 4,
    completionDate: 5,
    attendees: 6,
    hours: 7,
    trainer: 8,
    status: 9,
    notes: 10
  };
  
  for (const key in indices) {
    if (key !== '_found' && indices[key] === -1) {
      indices[key] = defaults[key];
      Logger.log(`getTrainingTrackingColIndices: Column "${key}" not found in headers, defaulting to index ${defaults[key]}`);
    }
  }
  
  return indices;
};

/**
 * Safely writes a row of data to a sheet that may be a Google Sheets Table with typed columns.
 * Writes cell-by-cell, performing auto-conversions (e.g. string to Date) and skipping empty string writes.
 */
function safeWriteRowToTable(sheet, rowIndex, rowData, headers) {
  if (!headers) {
    headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  }
  Logger.log('safeWriteRowToTable: Writing row ' + rowIndex + ' with ' + rowData.length + ' columns to sheet "' + sheet.getName() + '"');
  for (var col = 0; col < rowData.length; col++) {
    var val = rowData[col];
    if (val === undefined || val === '') continue;
    var cell = sheet.getRange(rowIndex, col + 1);
    try {
      cell.setValue(val);
    } catch (err) {
      var headerName = headers[col] || ('Col ' + (col + 1));
      Logger.log('safeWriteRowToTable warning: Col ' + (col + 1) + ' (' + headerName + ') value "' + val + '" threw: ' + err.toString());
      
      // Auto-convert dates if they throw
      var headerLower = String(headerName).toLowerCase().trim();
      if (headerLower.indexOf('date') !== -1 && typeof val === 'string' && val) {
        var parsedDate = new Date(val);
        if (!isNaN(parsedDate.getTime())) {
          try {
            cell.setValue(parsedDate);
            Logger.log('  -> Auto-converted string to Date object successfully');
            continue;
          } catch (errDate) {
            Logger.log('  -> Date conversion fallback failed: ' + errDate.toString());
          }
        }
      }
      
      // If empty string failed, it might be a typed cell that doesn't accept empty strings.
      // We can try clearing content or setting to null, or skipping if already blank.
      if (val === '') {
        try {
          cell.clearContent();
          Logger.log('  -> Cleared content instead of setting empty string');
          continue;
        } catch (errClear) {
          Logger.log('  -> Clear content failed: ' + errClear.toString());
        }
      }
      
      // Re-throw if unhandled
      throw err;
    }
  }
}

/**
 * Calculates the next job number with suffix based on classification (.1 for leads, next sequential number for others).
 */
function calculateNextJobNumberSuffix(sheet, baseJobNumber, classification) {
  var data = sheet.getDataRange().getValues();
  var headers = data[0];
  var jobNumColIdx = -1;
  var lastDayColIdx = -1;
  
  for (var h = 0; h < headers.length; h++) {
    var hdr = String(headers[h]).toLowerCase().trim();
    if (hdr === 'job number') jobNumColIdx = h;
    if (hdr === 'last day') lastDayColIdx = h;
  }
  
  if (jobNumColIdx === -1) jobNumColIdx = 3; // Default fallback to column D
  
  var existingSuffixes = [];
  
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var jobVal = String(row[jobNumColIdx] || '').trim();
    var lastDay = lastDayColIdx !== -1 ? row[lastDayColIdx] : '';
    if (lastDay) continue; // Skip past/terminated employees
    
    if (jobVal.indexOf(baseJobNumber) === 0) {
      var dotIdx = jobVal.lastIndexOf('.');
      if (dotIdx !== -1) {
        var sufStr = jobVal.substring(dotIdx + 1);
        var sufVal = parseInt(sufStr);
        if (!isNaN(sufVal)) {
          existingSuffixes.push(sufVal);
        }
      }
    }
  }
  
  // Determine if lead classification
  var isLead = ['SUP', 'F', 'GTO F', 'GF'].indexOf(String(classification).toUpperCase().trim()) !== -1;
  
  if (isLead) {
    return baseJobNumber + '.1';
  } else {
    var nextSuf = 2;
    existingSuffixes.sort(function(a, b) { return a - b; });
    for (var s = 0; s < existingSuffixes.length; s++) {
      var val = existingSuffixes[s];
      if (val >= nextSuf) {
        nextSuf = val + 1;
      }
    }
    return baseJobNumber + '.' + nextSuf;
  }
}

/**
 * Safely sets the number format of a range, catching any exceptions that might
 * occur when calling this on typed columns inside Google Sheets Tables.
 * 
 * @param {Range} range - The range to set format for
 * @param {string} format - The format pattern (e.g. 'MM/dd/yyyy')
 * @returns {Range} - The input range to preserve method chaining
 */
function safeSetNumberFormat(range, format) {
  if (!range) return range;
  try {
    range.setNumberFormat(format);
  } catch (e) {
    // Ignore format errors on typed columns
  }
  return range;
}

/**
 * Resolves the 0-based column index of the employee name column from headers in a prioritized way.
 * Prioritizes "employee name" and "employee" over generic "name" to prevent generic columns from overriding it.
 * @param {Array} headers - Array of header strings
 * @returns {number} - 0-based column index, or -1 if not found
 */
function getEmployeeNameColumnIndex(headers) {
  if (!headers || !headers.length) return -1;
  
  // 1. First priority: specific "employee name" or "employee"
  for (var i = 0; i < headers.length; i++) {
    var header = String(headers[i]).toLowerCase().trim();
    if (header === 'employee name' || header === 'employee') {
      return i;
    }
  }
  
  // 2. Second priority: generic "name"
  for (var i = 0; i < headers.length; i++) {
    var header = String(headers[i]).toLowerCase().trim();
    if (header === 'name') {
      return i;
    }
  }
  
  return -1;
}

/**
 * Safely extracts the source row number from a task key or task ID string.
 * Handles formats like:
 * - "Safety Equipment Needs_15"
 * - "SafetyEquipmentNeeds_15_20260720"
 * - "SafetyReports_15"
 * - "Glove Swaps_12"
 *
 * @param {string} taskKey - Task key or ID
 * @returns {number} Source row number (1-indexed), or -1 if invalid
 */
function extractSourceRowFromTaskKey(taskKey) {
  if (!taskKey) return -1;
  var keyStr = String(taskKey).trim();
  var parts = keyStr.split('_');
  for (var i = 0; i < parts.length; i++) {
    var part = parts[i].trim();
    if (/^\d+$/.test(part)) {
      var num = parseInt(part, 10);
      // Skip YYYYMMDD date format numbers (e.g. 20260720)
      if (num > 0 && num < 100000) {
        return num;
      }
    }
  }
  return -1;
}

/**
 * Checks if a log sheet row is a month header / section separator or empty row that should be ignored.
 *
 * @param {string|Date} dateVal - Column A text or date
 * @param {string} jobNum - Original job number
 * @param {string} foreman - Foreman name
 * @param {string} subject - Email subject / report title
 * @param {string} emailId - Gmail Message ID
 * @returns {boolean} True if the row is a month header, separator, or blank row
 */
function isMonthHeaderOrEmptyLogRow(dateVal, jobNum, foreman, subject, emailId) {
  var dStr = String(dateVal || '').trim();
  var jStr = String(jobNum || '').trim();
  var fStr = String(foreman || '').trim();
  var sStr = String(subject || '').trim();
  var eStr = String(emailId || '').trim();

  // If job number, foreman, subject, and email ID are all empty, it is a section divider or empty row
  if (!jStr && !fStr && !sStr && !eStr) {
    return true;
  }

  // Check if dateVal or Column A string matches a Month Year header pattern (e.g., "July 2026", "— Unknown —")
  if (!jStr && !fStr) {
    if (/^(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4}$/i.test(dStr) ||
        /^[\s—\-]*Unknown[\s—\-]*$/i.test(dStr) ||
        /^Header/i.test(dStr)) {
      return true;
    }
  }

  return false;
}

/**
 * Normalizes an input direction string to standard Title Case direction.
 * Accepts all 8 principal compass directions, Far, Home, Office, plus standard abbreviations (N, NE, E, SE, S, SW, W, NW).
 *
 * @param {string} input - User input direction (e.g., 'east', 'ne', 'South West')
 * @return {string|null} Normalized direction (e.g. 'Northeast') or null if invalid
 */
function normalizeDirection(input) {
  if (!input) return null;
  var str = String(input).trim().toLowerCase().replace(/[-_]/g, ' ');

  var dirMap = {
    'n': 'North', 'north': 'North',
    'ne': 'Northeast', 'northeast': 'Northeast', 'north east': 'Northeast',
    'e': 'East', 'east': 'East',
    'se': 'Southeast', 'southeast': 'Southeast', 'south east': 'Southeast',
    's': 'South', 'south': 'South',
    'sw': 'Southwest', 'southwest': 'Southwest', 'south west': 'Southwest',
    'w': 'West', 'west': 'West',
    'nw': 'Northwest', 'northwest': 'Northwest', 'north west': 'Northwest',
    'far': 'Far',
    'home': 'Home',
    'office': 'Office'
  };

  return dirMap[str] || null;
}

/**
 * Checks whether an employee's job classification satisfies a requirement rule's required job classes list.
 * Handles exact matches, Apprentice (AP 1-7), Sub Tech (ST 1-7), and full classification aliases.
 *
 * @param {string} empClass - The employee's job classification (e.g. 'ST 1', 'AP 4', 'JRY', 'F', 'FOREMAN')
 * @param {Array<string>} reqClasses - List of required job class codes (e.g. ['F', 'GTO F', 'GF', 'JRY', 'WT', 'GTO', 'AP 7-1'])
 * @return {boolean} True if the employee's classification matches requirement rule
 */
function isJobClassMatching(empClass, reqClasses) {
  if (!empClass) return false;
  if (!Array.isArray(reqClasses) || reqClasses.length === 0) return true;

  var normEmpClass = String(empClass).trim().toUpperCase();
  var normReqClasses = reqClasses.map(function(cls) { return String(cls).trim().toUpperCase(); });

  // 1. Direct exact match (e.g. "JRY" === "JRY", "F" === "F")
  if (normReqClasses.indexOf(normEmpClass) !== -1) return true;

  // 2. Apprentice & Sub Tech rule ("AP 7-1" or "AP" or "ST" in required classes)
  var hasApRule = normReqClasses.indexOf('AP 7-1') !== -1 ||
                  normReqClasses.indexOf('AP') !== -1 ||
                  normReqClasses.indexOf('ST') !== -1;

  if (hasApRule) {
    // Match any Apprentice or Sub Tech code (AP 1-7, ST 1-7, AP-1, ST-1, AP1, ST1, APPRENTICE, SUB TECH, etc.)
    if (normEmpClass.indexOf('AP') === 0 ||
        normEmpClass.indexOf('ST') === 0 ||
        normEmpClass.indexOf('APP') === 0 ||
        normEmpClass.indexOf('SUB') === 0) {
      return true;
    }
  }

  // 3. Common expanded alias mappings
  if (normReqClasses.indexOf('F') !== -1 && (normEmpClass === 'FOREMAN' || normEmpClass === 'CREW LEAD')) return true;
  if (normReqClasses.indexOf('GF') !== -1 && normEmpClass === 'GENERAL FOREMAN') return true;
  if (normReqClasses.indexOf('JRY') !== -1 && (normEmpClass === 'JOURNEYMAN' || normEmpClass === 'JOURNEYMAN LINEMAN' || normEmpClass === 'JOURNEYMAN LINEMAN/FOREMAN')) return true;
  if (normReqClasses.indexOf('GTO F') !== -1 && (normEmpClass === 'GTO FOREMAN' || normEmpClass === 'GTO F')) return true;
  if (normReqClasses.indexOf('WT') !== -1 && normEmpClass === 'WHITE TICKET') return true;
  if (normReqClasses.indexOf('SUP') !== -1 && (normEmpClass === 'SUPERVISOR' || normEmpClass === 'SUPERINTENDENT')) return true;

  return false;
}


