/**
 * Glove Manager – Constants
 *
 * All global constants used throughout the application.
 * This file loads first (00- prefix) to ensure constants are available
 * to all other modules.
 */

// =============================================================================
// SHEET/TAB NAME CONSTANTS
// =============================================================================
var SHEET_EMPLOYEES = 'Employees';
var SHEET_GLOVES = 'Gloves';
var SHEET_SLEEVES = 'Sleeves';
var SHEET_GLOVE_SWAPS = 'Glove Swaps';
var SHEET_SLEEVE_SWAPS = 'Sleeve Swaps';
var SHEET_PURCHASE_NEEDS = 'Purchase Needs';
var SHEET_INVENTORY_REPORTS = 'Inventory Reports';
var SHEET_RECLAIMS = 'Reclaims';
var SHEET_ITEM_HISTORY_LOOKUP = 'Item History Lookup';
var SHEET_GLOVES_HISTORY = 'Gloves History';
var SHEET_SLEEVES_HISTORY = 'Sleeves History';

// Phase 1: Blankets (March 2026)
var SHEET_BLANKETS = 'Blankets';
var SHEET_BLANKET_SWAPS = 'Blanket Swaps';
var SHEET_BLANKETS_HISTORY = 'Blankets History';

// Phase 2: HV Testers & Phasing Sets (Future)
var SHEET_HV_TESTERS = 'HV Testers';
var SHEET_HV_TESTER_SWAPS = 'HV Tester Swaps';
var SHEET_HV_TESTERS_HISTORY = 'HV Testers History';
var SHEET_PHASING_SETS = 'Phasing Sets';
var SHEET_PHASING_SET_SWAPS = 'Phasing Set Swaps';
var SHEET_PHASING_SETS_HISTORY = 'Phasing Sets History';

// Phase 3: AED (Future)
var SHEET_AED = 'AED';
var SHEET_AED_SWAPS = 'AED Swaps';
var SHEET_AED_HISTORY = 'AED History';

// =============================================================================
// VISUAL CONSTANTS
// =============================================================================
// Header background color for swap tables
var HEADER_BG_COLOR = '#1565c0';

// =============================================================================
// BUSINESS LOGIC CONSTANTS
// =============================================================================
// Change-out intervals (months) for Gloves/Sleeves
var INTERVAL_HELENA = 3;
var INTERVAL_DEFAULT = 6;

// Blanket test interval (months) - 1 year from test date
var INTERVAL_BLANKET_TEST = 12;

// HV Tester/Phasing Set calibration interval (years) - Phase 2
var INTERVAL_CALIBRATION_YEARS = 10;

// Alternating colors for history grouping
var HISTORY_COLOR_GLOVE_1 = '#e3f2fd';  // Light blue
var HISTORY_COLOR_GLOVE_2 = '#ffffff';  // White
var HISTORY_COLOR_SLEEVE_1 = '#e8f5e9'; // Light green
var HISTORY_COLOR_SLEEVE_2 = '#ffffff'; // White
var HISTORY_COLOR_BLANKET_1 = '#fff3e0'; // Light orange
var HISTORY_COLOR_BLANKET_2 = '#ffffff'; // White
var HISTORY_COLOR_HV_TESTER_1 = '#f3e5f5'; // Light purple
var HISTORY_COLOR_HV_TESTER_2 = '#ffffff'; // White
var HISTORY_COLOR_PHASING_SET_1 = '#e0f7fa'; // Light cyan
var HISTORY_COLOR_PHASING_SET_2 = '#ffffff'; // White
var HISTORY_COLOR_AED_1 = '#ffebee'; // Light red
var HISTORY_COLOR_AED_2 = '#ffffff'; // White

// Backup folder name in Google Drive
var BACKUP_FOLDER_NAME = 'Glove Manager Backups';

// =============================================================================
// COLUMN CONSTANTS - Per Workflow_and_Sheet_Expectations.md
// These columns are FIXED per the documentation and should be used directly
// =============================================================================
var COLS = {
  // Gloves & Sleeves Sheet (identical structure)
  INVENTORY: {
    ITEM_NUM: 1,        // A - "Glove" or "Sleeve" (Item #)
    SIZE: 2,            // B
    CLASS: 3,           // C
    TEST_DATE: 4,       // D
    DATE_ASSIGNED: 5,   // E
    LOCATION: 6,        // F
    STATUS: 7,          // G
    ASSIGNED_TO: 8,     // H
    CHANGE_OUT_DATE: 9, // I
    PICKED_FOR: 10,     // J
    NOTES: 11           // K
  },

  // Blankets Sheet - Phase 1 (March 2026)
  // Similar to INVENTORY but Type instead of Size
  BLANKETS: {
    ITEM_NUM: 1,        // A - "Blanket" (B### or S###)
    TYPE: 2,            // B - "Regular" or "Split" (auto-detected from prefix)
    CLASS: 3,           // C - 2 or 4
    TEST_DATE: 4,       // D - Last electrical test date
    DATE_ASSIGNED: 5,   // E
    LOCATION: 6,        // F
    STATUS: 7,          // G - Same statuses as gloves
    ASSIGNED_TO: 8,     // H - Crew Lead
    CHANGE_OUT_DATE: 9, // I - Test Date + 12 months
    PICKED_FOR: 10,     // J
    NOTES: 11           // K
  },

  // HV Testers Sheet - Phase 2 (Future)
  HV_TESTERS: {
    ITEM_NUM: 1,        // A - Equipment identifier
    MODEL: 2,           // B - Equipment model
    UNUSED_C: 3,        // C - (unused)
    CALIBRATION_DATE: 4,// D - Last calibration date
    DATE_ASSIGNED: 5,   // E
    LOCATION: 6,        // F
    STATUS: 7,          // G
    ASSIGNED_TO: 8,     // H - Crew Lead
    REPLACEMENT_DATE: 9,// I - Calibration + 10 years
    PICKED_FOR: 10,     // J
    NOTES: 11           // K
  },

  // Phasing Sets Sheet - Phase 2 (Future)
  // Same structure as HV_TESTERS
  PHASING_SETS: {
    ITEM_NUM: 1,        // A - Equipment identifier
    MODEL: 2,           // B - Equipment model
    UNUSED_C: 3,        // C - (unused)
    CALIBRATION_DATE: 4,// D - Last calibration date
    DATE_ASSIGNED: 5,   // E
    LOCATION: 6,        // F
    STATUS: 7,          // G
    ASSIGNED_TO: 8,     // H - Crew Lead
    REPLACEMENT_DATE: 9,// I - Calibration + 10 years
    PICKED_FOR: 10,     // J
    NOTES: 11           // K
  },

  // AED Sheet - Phase 3 (Future)
  AED: {
    ITEM_NUM: 1,        // A - Unit identifier
    MODEL: 2,           // B - Equipment model
    UNUSED_C: 3,        // C - (unused)
    PAD_EXPIRATION: 4,  // D - When pads expire
    DATE_ASSIGNED: 5,   // E
    LOCATION: 6,        // F
    STATUS: 7,          // G
    ASSIGNED_TO: 8,     // H - Crew Lead
    UNUSED_I: 9,        // I - (unused)
    PICKED_FOR: 10,     // J
    NOTES: 11           // K
  },

  // Glove/Sleeve Swaps Sheet (visible columns A-J)
  SWAPS: {
    EMPLOYEE: 1,        // A
    CURRENT_ITEM: 2,    // B
    SIZE: 3,            // C
    DATE_ASSIGNED: 4,   // D
    CHANGE_OUT_DATE: 5, // E
    DAYS_LEFT: 6,       // F
    PICK_LIST: 7,       // G
    STATUS: 8,          // H
    PICKED: 9,          // I
    DATE_CHANGED: 10    // J
  },

  // Blanket Swaps Sheet - Phase 1 (March 2026)
  // Type instead of Size in column C
  BLANKET_SWAPS: {
    EMPLOYEE: 1,        // A - Crew Lead
    CURRENT_ITEM: 2,    // B - Current blanket #
    TYPE: 3,            // C - Regular or Split
    DATE_ASSIGNED: 4,   // D
    CHANGE_OUT_DATE: 5, // E
    DAYS_LEFT: 6,       // F
    PICK_LIST: 7,       // G - New blanket to assign
    STATUS: 8,          // H
    PICKED: 9,          // I
    DATE_CHANGED: 10    // J
  },

  // Swaps Hidden Columns (Stage tracking K-W)
  SWAPS_HIDDEN: {
    STAGE1_PICK_STATUS: 11,      // K
    STAGE1_PICK_ASSIGNED: 12,    // L
    STAGE1_PICK_DATE: 13,        // M
    STAGE1_OLD_STATUS: 14,       // N
    STAGE1_OLD_ASSIGNED: 15,     // O
    STAGE1_OLD_DATE: 16,         // P
    STAGE2_STATUS: 17,           // Q
    STAGE2_ASSIGNED: 18,         // R
    STAGE2_DATE: 19,             // S
    STAGE2_PICKED_FOR: 20,       // T
    STAGE3_ASSIGNED: 21,         // U
    STAGE3_DATE: 22,             // V
    STAGE3_CHANGE_OUT: 23        // W
  },

  // Employees Sheet
  EMPLOYEES: {
    NAME: 1,              // A
    CLASS: 2,             // B
    LOCATION: 3,          // C
    JOB_NUMBER: 4,        // D
    PHONE: 5,             // E
    NOTIFICATION_EMAILS: 6, // F
    MP_EMAIL: 7,          // G
    EMAIL: 8,             // H
    GLOVE_SIZE: 9,        // I
    SLEEVE_SIZE: 10,      // J
    HIRE_DATE: 11,        // K
    LAST_DAY: 12,         // L
    LAST_DAY_REASON: 13,  // M
    JOB_CLASSIFICATION: 14 // N - e.g., "Foreman", "Lead", "Journeyman", "Apprentice"
  },

  // Employee History Sheet
  EMPLOYEE_HISTORY: {
    DATE: 1,              // A
    NAME: 2,              // B
    EVENT_TYPE: 3,        // C
    LOCATION: 4,          // D
    JOB_NUMBER: 5,        // E
    HIRE_DATE: 6,         // F
    LAST_DAY: 7,          // G
    LAST_DAY_REASON: 8,   // H
    REHIRE_DATE: 9,       // I
    NOTES: 10             // J
  }
};

