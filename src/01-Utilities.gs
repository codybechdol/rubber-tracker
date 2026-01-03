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
function logEvent(message, level) {
  level = level || 'INFO';
  var now = new Date();
  var logMessage = '[' + level + '] [' + now.toISOString() + '] ' + message;
  Logger.log(logMessage);

  if (level === 'ERROR') {
    try {
      SpreadsheetApp.getUi().alert('Error: ' + message);
    } catch (e) {
      // Ignore if no UI (e.g. trigger execution)
    }
  }
}

/**
 * Normalizes approval values to standard format.
 * Handles HTML entities and common variations.
 * Valid values: None, CL2, CL3, CL2 & CL3
 * @param {string} value - The approval value to normalize
 * @returns {string} - Normalized approval value
 */
function normalizeApprovalValue(value) {
  if (!value) return 'CL2'; // Default

  // Clean the value - decode HTML entities and normalize
  var cleaned = String(value).trim();
  // Decode &amp; and &#38; to &
  cleaned = cleaned.split('&amp;').join('&');
  cleaned = cleaned.split('&#38;').join('&');
  cleaned = cleaned.toUpperCase();

  // Map to valid values
  switch(cleaned) {
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
      Logger.log('[WARN] Unrecognized approval value "' + value + '" - defaulting to CL2');
      return 'CL2';
  }
}

/**
 * Gets the significant portion of a job number (###-## format).
 * Used for tracking job changes in employee history.
 * Examples: "123-45.6" → "123-45", "123-45" → "123-45"
 * @param {string} jobNumber - The job number to process
 * @returns {string} - The significant portion (###-##)
 */
function getSignificantJobNumber(jobNumber) {
  if (!jobNumber) return '';

  var jobStr = String(jobNumber).trim();

  // Match pattern: digits-digits (ignore anything after second dash or decimal)
  // eslint-disable-next-line no-useless-escape
  var match = jobStr.match(/^(\d+\-\d+)/);

  return match ? match[1] : jobStr;
}

