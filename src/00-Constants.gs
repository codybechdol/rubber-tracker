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
var SHEET_DASHBOARD = 'Dashboard';
var SHEET_EMPLOYEES = 'Employees';
var SHEET_GLOVES = 'Gloves';
var SHEET_SLEEVES = 'Sleeves';
var SHEET_GLOVE_SWAPS = 'Glove Swaps';
var SHEET_SLEEVE_SWAPS = 'Sleeve Swaps';
var SHEET_RECLAIMS = 'Reclaims';
var SHEET_ITEM_HISTORY_LOOKUP = 'Item History Lookup';
var SHEET_GLOVES_HISTORY = 'Gloves History';
var SHEET_SLEEVES_HISTORY = 'Sleeves History';

// Phase 1: Blankets (March 2026)
var SHEET_BLANKETS = 'Blankets';
var SHEET_BLANKET_SWAPS = 'Blanket Swaps';
var SHEET_BLANKETS_HISTORY = 'Blankets History';

// Phase 6: MACKs (July 2026)
var SHEET_MACKS = 'MACKs';
var SHEET_MACK_SWAPS = 'MACK Swaps';
var SHEET_MACKS_HISTORY = 'MACKs History';

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

// Phase 4: Grounds (Overhead/Underground electrical grounds)
var SHEET_GROUNDS = 'Grounds';
var SHEET_GROUND_SWAPS = 'Ground Swaps';
var SHEET_GROUNDS_HISTORY = 'Grounds History';

// Phase 5: Hot Sticks (live-line tools, 1-year test cycle)
var SHEET_HOT_STICKS = 'Hot Sticks';
var SHEET_HOT_STICK_SWAPS = 'Hot Stick Swaps';
var SHEET_HOT_STICKS_HISTORY = 'Hot Sticks History';

// DOT Drug Testing
var SHEET_DRUG_TESTS = 'DOT Drug Tests';
var SHEET_DRUG_CLINICS = 'Drug Test Clinics';

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

// MACK test interval (months) - 1 year from test date
var INTERVAL_MACK_TEST = 12;

// HV Tester/Phasing Set calibration interval (years) - Phase 2
var INTERVAL_CALIBRATION_YEARS = 10;

// AED pad replacement lookahead (days) - Phase 3
// Show AEDs with pads expiring within 30 days on the AED Swaps report
var AED_SWAP_LOOKAHEAD_DAYS = 30;

// Grounds test interval (months) - Phase 4
// Grounds must be pulled for testing 1 year after their test date
var INTERVAL_GROUNDS_TEST = 12;

// Hot Stick test interval (months) - Phase 5
// Hot sticks (live-line tools) must be tested every 2 years per OSHA 1910.269 / ASTM F711
var INTERVAL_HOT_STICK_TEST = 24;

// Location values that represent employee STATUS, not physical cities.
// These should NOT be used as crew locations in Job Tracking.
var STATUS_LOCATIONS = ['vacation', 'light duty', 'weeds', 'leave', 'previous employee', 'medical', "worker's comp", 'unknown', 'on shelf', 'not repairable', 'in testing', 'packed for testing', 'packed for delivery', 'destroyed', 'failed rubber', 'reclaimed'];

// Alternating colors for history grouping
var HISTORY_COLOR_GLOVE_1 = '#e3f2fd';  // Light blue
var HISTORY_COLOR_GLOVE_2 = '#ffffff';  // White
var HISTORY_COLOR_SLEEVE_1 = '#e8f5e9'; // Light green
var HISTORY_COLOR_SLEEVE_2 = '#ffffff'; // White
var HISTORY_COLOR_BLANKET_1 = '#fff3e0'; // Light orange
var HISTORY_COLOR_BLANKET_2 = '#ffffff'; // White

// Alternating colors for MACK history grouping
var HISTORY_COLOR_MACK_1 = '#e0f2f1'; // Light teal
var HISTORY_COLOR_MACK_2 = '#ffffff'; // White
var HISTORY_COLOR_HV_TESTER_1 = '#f3e5f5'; // Light purple
var HISTORY_COLOR_HV_TESTER_2 = '#ffffff'; // White
var HISTORY_COLOR_PHASING_SET_1 = '#e0f7fa'; // Light cyan
var HISTORY_COLOR_PHASING_SET_2 = '#ffffff'; // White
var HISTORY_COLOR_AED_1 = '#ffebee'; // Light red
var HISTORY_COLOR_AED_2 = '#ffffff'; // White
var HISTORY_COLOR_GROUNDS_1 = '#fffde7'; // Light yellow
var HISTORY_COLOR_GROUNDS_2 = '#ffffff'; // White
var HISTORY_COLOR_HOT_STICK_1 = '#e8eaf6'; // Light indigo
var HISTORY_COLOR_HOT_STICK_2 = '#ffffff'; // White

// Backup folder name in Google Drive
var BACKUP_FOLDER_NAME = 'Glove Manager Backups';

// =============================================================================
// COLUMN CONSTANTS - Per Workflow_and_Sheet_Expectations.md
// These columns are FIXED per the documentation and should be used directly
// =============================================================================
var COLS = {
  // Gloves & Sleeves Sheet (identical structure)
  // ⚠️ ESL ID column (B) added April 2026 - all columns after A shifted +1
  INVENTORY: {
    ITEM_NUM: 1,        // A - "Glove" or "Sleeve" (Item #)
    ESL_ID: 2,          // B - ESL ID (external system link)
    SIZE: 3,            // C
    CLASS: 4,           // D
    TEST_DATE: 5,       // E
    DATE_ASSIGNED: 6,   // F
    LOCATION: 7,        // G
    STATUS: 8,          // H
    ASSIGNED_TO: 9,     // I
    CHANGE_OUT_DATE: 10,// J
    PICKED_FOR: 11,     // K
    NOTES: 12           // L
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

  // MACKs Sheet - Phase 6 (July 2026)
  MACKS: {
    ITEM_NUM: 1,        // A - MACK item number (ESL ID, e.g., 64977789)
    KV: 2,              // B
    SIZE: 3,            // C
    LENGTH: 4,          // D
    TEST_DATE: 5,       // E - Last test date
    DATE_ASSIGNED: 6,   // F
    LOCATION: 7,        // G
    STATUS: 8,          // H
    ASSIGNED_TO: 9,     // I - Crew Lead
    CHANGE_OUT_DATE: 10,// J - Test Date + 12 months
    PICKED_FOR: 11,     // K
    NOTES: 12           // L
  },

  // HV Testers Sheet - Phase 2 (matches Phasing Sets layout)
  HV_TESTERS: {
    ITEM_NUM: 1,        // A - Equipment identifier
    MODEL: 2,           // B - Equipment model
    KV: 3,              // C - Voltage rating (KV)
    SERIAL_NUM: 4,      // D - Serial number
    CALIBRATION_DATE: 5,// E - Last calibration date
    DATE_ASSIGNED: 6,   // F
    LOCATION: 7,        // G
    STATUS: 8,          // H
    ASSIGNED_TO: 9,     // I - Crew Lead
    CHANGE_OUT_DATE: 10,// J - Calibration + 10 years
    PICKED_FOR: 11,     // K
    NOTES: 12           // L
  },

  // Phasing Sets - Same layout as HV_TESTERS
  PHASING_SETS: {
    ITEM_NUM: 1,        // A - Equipment identifier
    MODEL: 2,           // B - Equipment model
    KV: 3,              // C - Voltage rating (KV)
    SERIAL_NUM: 4,      // D - Serial number
    CALIBRATION_DATE: 5,// E - Last calibration date
    DATE_ASSIGNED: 6,   // F
    LOCATION: 7,        // G
    STATUS: 8,          // H
    ASSIGNED_TO: 9,     // I - Crew Lead
    CHANGE_OUT_DATE: 10,// J - Calibration + 10 years
    PICKED_FOR: 11,     // K
    NOTES: 12           // L
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

  // Grounds Sheet - Phase 4 (OH/UG electrical grounds, 1-year test cycle)
  // A=Serial#, B=Type(OH/UG), C=Size(OH:4/0|2/0), D=KV(UG:15KV|25KV),
  // E=Length, F=Test Date, G=Date Assigned, H=Location, I=Status,
  // J=Assigned To, K=Change Out Date, L=Picked For, M=Notes
  GROUNDS: {
    SERIAL_NUM: 1,      // A - Serial number / item identifier
    TYPE: 2,            // B - OH (Overhead) or UG (Underground)
    SIZE: 3,            // C - 4/0 or 2/0 (OH only; blank for UG)
    KV: 4,              // D - 15KV or 25KV (UG only; blank for OH)
    LENGTH: 5,          // E - Length (OH: various; UG: auto "6'")
    TEST_DATE: 6,       // F - Last electrical test date
    DATE_ASSIGNED: 7,   // G
    LOCATION: 8,        // H
    STATUS: 9,          // I
    ASSIGNED_TO: 10,    // J - Crew Lead
    CHANGE_OUT_DATE: 11,// K - Test Date + 12 months
    PICKED_FOR: 12,     // L
    NOTES: 13           // M
  },

  // Hot Sticks Sheet - Phase 5 (live-line tools, 1-year test cycle)
  // A=Item#, B=Type, C=Length, D=Test Date, E=Date Assigned, F=Location,
  // G=Status, H=Assigned To, I=Change Out Date, J=Picked For, K=Notes
  HOT_STICKS: {
    ITEM_NUM: 1,        // A - Item identifier
    TYPE: 2,            // B - Solid, Extendable, Shotgun, etc.
    LENGTH: 3,          // C - Length (e.g., "6 ft", "8 ft", "10 ft")
    TEST_DATE: 4,       // D - Last electrical test date
    DATE_ASSIGNED: 5,   // E
    LOCATION: 6,        // F
    STATUS: 7,          // G - On Shelf, In Service
    ASSIGNED_TO: 8,     // H - Crew Lead
    CHANGE_OUT_DATE: 9, // I - Test Date + 12 months
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

  // MACK Swaps Sheet - Phase 6 (July 2026)
  MACK_SWAPS: {
    EMPLOYEE: 1,        // A - Crew Lead
    CURRENT_ITEM: 2,    // B - Current MACK #
    KV: 3,              // C
    SIZE: 4,            // D
    LENGTH: 5,          // E
    DATE_ASSIGNED: 6,   // F
    CHANGE_OUT_DATE: 7, // G
    DAYS_LEFT: 8,       // H
    PICK_LIST: 9,       // I - New MACK to assign
    STATUS: 10,         // J
    PICKED: 11,         // K
    DATE_CHANGED: 12    // L
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
  },

  // DOT Drug Tests Sheet
  DRUG_TESTS: {
    QUARTER: 1,           // A - Quarter (e.g. Q3 2026)
    EMPLOYEE_NAME: 2,     // B - Employee Name
    LOCATION: 3,          // C - Physical Location / City
    JOB_NUMBER: 4,        // D - Job Number / Crew
    PHONE: 5,             // E - Phone Number
    TEST_TYPE: 6,         // F - Test Type (Drug Only / Drug & Alcohol)
    CLASSIFICATION: 7,    // G - Agency Classification (PHMSA / FMCSA / Non-DOT)
    COLLECTION_TYPE: 8,   // H - Clinic Visit / Mobile Collector
    CLINIC_NAME: 9,       // I - Selected Clinic / Provider Name
    CLINIC_CITY: 10,      // J - Clinic City/State
    APPT_REQUIRED: 11,    // K - Yes / No / Suggested
    SCHEDULED_DATE: 12,   // L - Scheduled Date
    SCHEDULED_TIME: 13,   // M - Scheduled Time
    MEETING_ADDRESS: 14,  // N - Meeting / Collection Address (for Mobile Collector)
    STATUS: 15,           // O - Pending, Scheduled, Completed, Excused
    DATE_COMPLETED: 16,   // P - Date Completed
    PAPERWORK_NOTES: 17,  // Q - Paperwork / Kit requirements
    NOTES: 18,            // R - Additional Notes / Confirmation # / Lab Results
    DATE_ADDED: 19        // S - Timestamp Created
  },

  // Drug Test Clinics Sheet
  DRUG_CLINICS: {
    FIRM: 1,              // A - Firm / Provider Name
    IS_MOBILE: 2,         // B - Is Mobile Collector? (Yes/No)
    STREET: 3,            // C - Street Address
    CITY: 4,              // D - City
    STATE: 5,             // E - State
    ZIP: 6,               // F - Zip Code
    PHONE: 7,             // G - Phone Number
    HOURS: 8,             // H - Operating Hours
    APPT_REQUIRED: 9,     // I - Appointment Required (Yes/No/Details)
    PAPERWORK_REQUIRED: 10,// J - Paperwork Required w/ Donor
    NOTES: 11,            // K - Special Instructions / Notes
    ACTIVE: 12            // L - Active (TRUE/FALSE)
  }
};

var DEFAULT_LOCATION_APPROVALS = {
  'Big Sky': 'CL3',
  'Billings': 'CL2',
  'Bozeman': 'CL2',
  'Butte': 'CL2',
  'CA Sub': 'CL2',
  'California': 'CL2',
  'Elliston': 'CL2',
  'Ennis': 'CL2',
  'Glendive': 'CL2',
  'Gold Creek': 'CL2',
  'Great Falls': 'CL2 & CL3',
  'Helena': 'CL2',
  'Kalispell': 'CL2',
  'Leave': 'CL2 & CL3',
  'Livingston': 'CL2 & CL3',
  'Lolo': 'CL2',
  'Miles City': 'CL2',
  'Missoula': 'CL2',
  'Northern Lights': 'CL2',
  'Rapelje': 'CL2',
  'Sidney': 'CL2',
  'South Dakota': 'CL2',
  'South Dakota Dock': 'CL2',
  'Stanford': 'CL2',
  'Vacation': 'CL2 & CL3'
};

