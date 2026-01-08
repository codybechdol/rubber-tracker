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
const SHEET_EMPLOYEES = 'Employees';
const SHEET_GLOVES = 'Gloves';
const SHEET_SLEEVES = 'Sleeves';
const SHEET_GLOVE_SWAPS = 'Glove Swaps';
const SHEET_SLEEVE_SWAPS = 'Sleeve Swaps';
const SHEET_PURCHASE_NEEDS = 'Purchase Needs';
const SHEET_INVENTORY_REPORTS = 'Inventory Reports';
const SHEET_RECLAIMS = 'Reclaims';
const SHEET_ITEM_HISTORY_LOOKUP = 'Item History Lookup';
const SHEET_GLOVES_HISTORY = 'Gloves History';
const SHEET_SLEEVES_HISTORY = 'Sleeves History';

// =============================================================================
// VISUAL CONSTANTS
// =============================================================================
// Header background color for swap tables
const HEADER_BG_COLOR = '#1565c0';

// =============================================================================
// BUSINESS LOGIC CONSTANTS
// =============================================================================
// Change-out intervals (months)
const INTERVAL_HELENA = 3;
const INTERVAL_DEFAULT = 6;

// Alternating colors for history grouping
const HISTORY_COLOR_GLOVE_1 = '#e3f2fd';  // Light blue
const HISTORY_COLOR_GLOVE_2 = '#ffffff';  // White
const HISTORY_COLOR_SLEEVE_1 = '#e8f5e9'; // Light green
const HISTORY_COLOR_SLEEVE_2 = '#ffffff'; // White

// Backup folder name in Google Drive
const BACKUP_FOLDER_NAME = 'Glove Manager Backups';

// =============================================================================
// COLUMN CONSTANTS - Per Workflow_and_Sheet_Expectations.md
// These columns are FIXED per the documentation and should be used directly
// =============================================================================
const COLS = {
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

