/**
 * =============================================================================
 * 89-SyncAPI.gs - Offline Synchronization & Snapshot API
 * =============================================================================
 *
 * Provides bidirectional data synchronization between Google Sheets and the
 * standalone Tauri Desktop Application (.exe).
 *
 * Core capabilities:
 * 1. exportFullDatabaseSnapshot() - Bundles all sheet grids & configs into JSON
 * 2. generateAndStoreSyncSnapshot() - Auto-generates snapshot on Save & Backup
 * 3. applyBatchSyncMutations() - Applies offline field edits back to Google Sheets
 * 4. doGet(e) / doPost(e) - Web App endpoints for desktop app HTTP sync
 */

var SYNC_SNAPSHOT_FILENAME = 'SafetyAssistant_Sync_Snapshot.json';

/**
 * Exports a complete, structured snapshot of all database sheets and configurations.
 * Optimized for local SQLite / IndexedDB consumption in the desktop app.
 * Uses a single-pass getValues() read per sheet with fast in-memory formatting
 * to eliminate getDisplayValues() RPC overhead across all 34 sheets.
 *
 * @return {Object} The complete database snapshot
 */
function exportFullDatabaseSnapshot() {
  var ss = typeof getActiveSpreadsheetSafe === 'function' ? getActiveSpreadsheetSafe() : SpreadsheetApp.getActiveSpreadsheet();
  var timestamp = new Date();
  var tz = ss ? (ss.getSpreadsheetTimeZone() || 'America/Denver') : 'America/Denver';

  // Clean up any located items from swap sheets and clear stray Lost highlighting
  try {
    if (typeof cleanupLocatedItemsFromSwaps === 'function') {
      cleanupLocatedItemsFromSwaps();
    }
  } catch (cleanErr) { /* ignore */ }

  // List of all sheets to sync with their offline table keys
  var sheetConfigs = [
    { key: 'employees', name: typeof SHEET_EMPLOYEES !== 'undefined' ? SHEET_EMPLOYEES : 'Employees' },
    { key: 'job_tracking', name: 'Job Tracking' },
    { key: 'gloves', name: typeof SHEET_GLOVES !== 'undefined' ? SHEET_GLOVES : 'Gloves' },
    { key: 'sleeves', name: typeof SHEET_SLEEVES !== 'undefined' ? SHEET_SLEEVES : 'Sleeves' },
    { key: 'blankets', name: typeof SHEET_BLANKETS !== 'undefined' ? SHEET_BLANKETS : 'Blankets' },
    { key: 'macks', name: typeof SHEET_MACKS !== 'undefined' ? SHEET_MACKS : 'MACKs' },
    { key: 'hv_testers', name: typeof SHEET_HV_TESTERS !== 'undefined' ? SHEET_HV_TESTERS : 'HV Testers' },
    { key: 'phasing_sets', name: typeof SHEET_PHASING_SETS !== 'undefined' ? SHEET_PHASING_SETS : 'Phasing Sets' },
    { key: 'aed', name: typeof SHEET_AED !== 'undefined' ? SHEET_AED : 'AED' },
    { key: 'grounds', name: typeof SHEET_GROUNDS !== 'undefined' ? SHEET_GROUNDS : 'Grounds' },
    { key: 'hot_sticks', name: typeof SHEET_HOT_STICKS !== 'undefined' ? SHEET_HOT_STICKS : 'Hot Sticks' },
    { key: 'task_metadata', name: 'Task Metadata' },
    { key: 'glove_swaps', name: typeof SHEET_GLOVE_SWAPS !== 'undefined' ? SHEET_GLOVE_SWAPS : 'Glove Swaps' },
    { key: 'sleeve_swaps', name: typeof SHEET_SLEEVE_SWAPS !== 'undefined' ? SHEET_SLEEVE_SWAPS : 'Sleeve Swaps' },
    { key: 'blanket_swaps', name: typeof SHEET_BLANKET_SWAPS !== 'undefined' ? SHEET_BLANKET_SWAPS : 'Blanket Swaps' },
    { key: 'mack_swaps', name: typeof SHEET_MACK_SWAPS !== 'undefined' ? SHEET_MACK_SWAPS : 'MACK Swaps' },
    { key: 'hv_tester_swaps', name: 'HV Tester Swaps' },
    { key: 'phasing_set_swaps', name: 'Phasing Set Swaps' },
    { key: 'aed_swaps', name: 'AED Swaps' },
    { key: 'ground_swaps', name: 'Ground Swaps' },
    { key: 'hot_stick_swaps', name: 'Hot Stick Swaps' },
    { key: 'safety_compliance', name: typeof SHEET_SAFETY_COMPLIANCE !== 'undefined' ? SHEET_SAFETY_COMPLIANCE : 'Safety Compliance' },
    { key: 'expiring_certs', name: 'Expiring Certs' },
    { key: 'training_tracking', name: 'Training Tracking' },
    { key: 'gloves_history', name: typeof SHEET_GLOVES_HISTORY !== 'undefined' ? SHEET_GLOVES_HISTORY : 'Gloves History' },
    { key: 'sleeves_history', name: typeof SHEET_SLEEVES_HISTORY !== 'undefined' ? SHEET_SLEEVES_HISTORY : 'Sleeves History' },
    { key: 'blankets_history', name: typeof SHEET_BLANKETS_HISTORY !== 'undefined' ? SHEET_BLANKETS_HISTORY : 'Blankets History' },
    { key: 'macks_history', name: typeof SHEET_MACKS_HISTORY !== 'undefined' ? SHEET_MACKS_HISTORY : 'MACKs History' },
    { key: 'hv_testers_history', name: typeof SHEET_HV_TESTERS_HISTORY !== 'undefined' ? SHEET_HV_TESTERS_HISTORY : 'HV Testers History' },
    { key: 'phasing_sets_history', name: typeof SHEET_PHASING_SETS_HISTORY !== 'undefined' ? SHEET_PHASING_SETS_HISTORY : 'Phasing Sets History' },
    { key: 'aed_history', name: typeof SHEET_AED_HISTORY !== 'undefined' ? SHEET_AED_HISTORY : 'AED History' },
    { key: 'grounds_history', name: typeof SHEET_GROUNDS_HISTORY !== 'undefined' ? SHEET_GROUNDS_HISTORY : 'Grounds History' },
    { key: 'hot_sticks_history', name: typeof SHEET_HOT_STICKS_HISTORY !== 'undefined' ? SHEET_HOT_STICKS_HISTORY : 'Hot Sticks History' },
    { key: 'employee_history', name: typeof SHEET_EMPLOYEE_HISTORY !== 'undefined' ? SHEET_EMPLOYEE_HISTORY : 'Employee History' },
    { key: 'safety_equipment_needs', name: 'Safety Equipment Needs' },
    { key: 'locations', name: 'Locations' },
    { key: 'drive_time_routes', name: 'Drive Time Routes' },
    { key: 'vendors', name: 'Vendors' },
    { key: 'purchase_orders', name: 'Purchase Orders' }
  ];

  var tables = {};

  for (var i = 0; i < sheetConfigs.length; i++) {
    var cfg = sheetConfigs[i];
    var sheet = ss.getSheetByName(cfg.name);
    if (!sheet || sheet.getLastRow() < 1) {
      tables[cfg.key] = { name: cfg.name, headers: [], rows: [], rawGrid: [], rowCount: 0, maxRows: 0, maxCols: 0 };
      continue;
    }

    var lastRow = sheet.getLastRow();
    var lastCol = sheet.getLastColumn();
    var data = sheet.getRange(1, 1, lastRow, lastCol).getValues();

    var headerRowIdx = 0;
    if (cfg.key === 'training_tracking' && typeof findTrainingTrackingHeaderRow === 'function') {
      headerRowIdx = findTrainingTrackingHeaderRow(data);
    } else {
      var row0Count = data[0].filter(function(v) { return String(v || '').trim() !== ''; }).length;
      if (row0Count <= 2 && data.length > 1) {
        var row1Count = data[1].filter(function(v) { return String(v || '').trim() !== ''; }).length;
        if (row1Count >= 3) {
          headerRowIdx = 1;
        }
      }
    }

    var headers = data[headerRowIdx].map(function(h) { return String(h || '').trim(); });
    var rows = [];
    var rawGrid = [];

    for (var r = 0; r < data.length; r++) {
      var rowArray = data[r];
      var gridRow = [];
      var isDataRow = r > headerRowIdx;
      var rowObj = isDataRow ? { _rowIdx: r + 1 } : null;

      for (var c = 0; c < lastCol; c++) {
        var rawVal = rowArray[c];
        var formattedStr = '';

        if (rawVal instanceof Date) {
          formattedStr = Utilities.formatDate(rawVal, tz, 'MM/dd/yyyy');
        } else if (rawVal === null || rawVal === undefined) {
          formattedStr = '';
        } else {
          formattedStr = String(rawVal);
        }

        gridRow.push(formattedStr);

        if (isDataRow && c < headers.length) {
          var hName = headers[c];
          if (hName) {
            if (rawVal instanceof Date) {
              rowObj[hName] = formattedStr;
              rowObj[hName + '_raw'] = rawVal.toISOString();
            } else {
              rowObj[hName] = rawVal;
            }
          }
        }
      }

      rawGrid.push(gridRow);
      if (isDataRow) {
        rows.push(rowObj);
      }
    }

    tables[cfg.key] = {
      name: cfg.name,
      headers: headers,
      rows: rows,
      rawGrid: rawGrid,
      rowCount: rows.length,
      maxRows: lastRow,
      maxCols: lastCol
    };
  }

  // Configurations and reference data
  var holidays = [];
  try {
    holidays = typeof getHolidays === 'function' ? getHolidays() : [];
  } catch (e) {
    Logger.log('exportFullDatabaseSnapshot: Error reading holidays: ' + e);
  }

  var workSchedule = 'Mon-Thu';
  try {
    workSchedule = typeof getWorkSchedule === 'function' ? getWorkSchedule() : 'Mon-Thu';
  } catch (e) {
    Logger.log('exportFullDatabaseSnapshot: Error reading workSchedule: ' + e);
  }

  var driveTimeMap = {};
  try {
    driveTimeMap = typeof getDriveTimeMap === 'function' ? getDriveTimeMap() : {};
  } catch (e) {
    Logger.log('exportFullDatabaseSnapshot: Error reading driveTimeMap: ' + e);
  }

  var plannedTrips = {};
  try {
    var rawTrips = (typeof getChunkedScriptProperty === 'function') ? getChunkedScriptProperty('PLANNED_TRIPS') : PropertiesService.getScriptProperties().getProperty('PLANNED_TRIPS');
    if (rawTrips) {
      plannedTrips = typeof rawTrips === 'string' ? JSON.parse(rawTrips) : rawTrips;
    }
  } catch (e) {
    Logger.log('exportFullDatabaseSnapshot: Error reading plannedTrips: ' + e);
  }

  return {
    version: '2026.1.0',
    spreadsheetId: ss.getId(),
    spreadsheetName: ss.getName(),
    exportedAt: timestamp.toISOString(),
    timezone: ss.getSpreadsheetTimeZone(),
    configs: {
      holidays: holidays,
      workSchedule: workSchedule,
      driveTimeMap: driveTimeMap,
      plannedTrips: plannedTrips
    },
    tables: tables
  };
}

/**
 * Generates the offline sync snapshot and saves it as a JSON file in the Drive Backup folder.
 * Called automatically every time "Save & Backup" runs in Google Sheets.
 *
 * @param {Object} [existingSnapshot] - Optional pre-computed snapshot object to avoid re-exporting
 * @return {File|null} The saved snapshot file in Google Drive
 */
function generateAndStoreSyncSnapshot(existingSnapshot) {
  try {
    var startTime = new Date().getTime();
    var snapshot = existingSnapshot || exportFullDatabaseSnapshot();
    var jsonStr = JSON.stringify(snapshot, null, 2);

    var props = PropertiesService.getScriptProperties();
    var fileId = props.getProperty('SYNC_SNAPSHOT_FILE_ID');
    var file = null;

    if (fileId) {
      try {
        file = DriveApp.getFileById(fileId);
        if (file.isTrashed()) {
          file = null;
        } else {
          file.setContent(jsonStr);
          Logger.log('generateAndStoreSyncSnapshot: Updated cached ' + SYNC_SNAPSHOT_FILENAME + ' (ID: ' + fileId + ')');
        }
      } catch (idErr) {
        file = null;
      }
    }

    if (!file) {
      // Save snapshot to backup folder
      var folder = getOrCreateBackupFolder();
      var files = folder.getFilesByName(SYNC_SNAPSHOT_FILENAME);

      if (files.hasNext()) {
        file = files.next();
        file.setContent(jsonStr);
        Logger.log('generateAndStoreSyncSnapshot: Updated existing ' + SYNC_SNAPSHOT_FILENAME);
      } else {
        file = folder.createFile(SYNC_SNAPSHOT_FILENAME, jsonStr, MimeType.PLAIN_TEXT);
        Logger.log('generateAndStoreSyncSnapshot: Created new ' + SYNC_SNAPSHOT_FILENAME);
      }

      if (file) {
        try {
          props.setProperty('SYNC_SNAPSHOT_FILE_ID', file.getId());
        } catch (saveIdErr) { /* ignore */ }
      }
    }

    var elapsed = new Date().getTime() - startTime;
    Logger.log('generateAndStoreSyncSnapshot: Completed in ' + elapsed + 'ms (' + (jsonStr.length / 1024).toFixed(1) + ' KB)');
    return file;

  } catch (e) {
    Logger.log('generateAndStoreSyncSnapshot Error: ' + e.toString());
    return null;
  }
}

/**
 * Applies a batch of mutations (edits, creations, updates) from the offline desktop app back into Google Sheets.
 *
 * @param {Array<Object>} mutations - Array of mutation objects from the offline outbox
 * @return {Object} Result summary with success count and errors
 */
function applyBatchSyncMutations(mutations, returnSnapshot, options) {
  var ss = typeof getActiveSpreadsheetSafe === 'function' ? getActiveSpreadsheetSafe() : SpreadsheetApp.getActiveSpreadsheet();
  if (typeof returnSnapshot === 'object' && returnSnapshot !== null && options === undefined) {
    options = returnSnapshot;
    returnSnapshot = options.returnSnapshot !== false;
  }
  if (returnSnapshot === undefined) returnSnapshot = true;
  options = options || {};

  var detectConflicts = options.detectConflicts === true;
  var force = options.force === true;

  if (!mutations || !Array.isArray(mutations) || mutations.length === 0) {
    var emptySnap = returnSnapshot ? exportFullDatabaseSnapshot() : null;
    return { success: true, appliedCount: 0, errors: [], snapshot: emptySnap };
  }

  // 1. Conflict Detection Pre-Pass
  function normalizeValForComparison(v) {
    if (v === null || v === undefined) return '';
    if (v instanceof Date) {
      if (isNaN(v.getTime())) return '';
      return Utilities.formatDate(v, ss.getSpreadsheetTimeZone(), 'yyyy-MM-dd');
    }
    var s = String(v).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(s)) {
      var dObj = typeof parseDateNoon === 'function' ? parseDateNoon(s) : new Date(s);
      if (!isNaN(dObj.getTime())) return Utilities.formatDate(dObj, ss.getSpreadsheetTimeZone(), 'yyyy-MM-dd');
    }
    return s.toLowerCase();
  }

  var conflicts = [];
  if (detectConflicts && !force) {
    for (var cm = 0; cm < mutations.length; cm++) {
      var cMut = mutations[cm];
      if (cMut.force) continue;
      var cSheetName = cMut.sheetName || '';
      var cSheet = cSheetName ? ss.getSheetByName(cSheetName) : null;
      if (!cSheet) continue;

      if (cMut.action === 'UPDATE_CELL' && cMut.row && cMut.col && cMut.oldValue !== undefined && cMut.oldValue !== null) {
        var curVal = cSheet.getRange(cMut.row, cMut.col).getValue();
        var curNorm = normalizeValForComparison(curVal);
        var oldNorm = normalizeValForComparison(cMut.oldValue);
        var newNorm = normalizeValForComparison(cMut.value);

        if (curNorm !== oldNorm && curNorm !== newNorm) {
          conflicts.push({
            mutationIndex: cm,
            action: cMut.action,
            sheetName: cSheetName,
            row: cMut.row,
            col: cMut.col,
            header: cMut.header || cMut.colName || ('Col ' + cMut.col),
            itemIdentifier: cMut.itemIdentifier || '',
            serverValue: (curVal instanceof Date && !isNaN(curVal.getTime())) ? Utilities.formatDate(curVal, ss.getSpreadsheetTimeZone(), 'MM/dd/yyyy') : String(curVal || ''),
            localValue: (cMut.value instanceof Date && !isNaN(cMut.value.getTime())) ? Utilities.formatDate(cMut.value, ss.getSpreadsheetTimeZone(), 'MM/dd/yyyy') : String(cMut.value || ''),
            expectedValue: (cMut.oldValue instanceof Date && !isNaN(cMut.oldValue.getTime())) ? Utilities.formatDate(cMut.oldValue, ss.getSpreadsheetTimeZone(), 'MM/dd/yyyy') : String(cMut.oldValue || '')
          });
        }
      }
    }

    if (conflicts.length > 0) {
      return {
        status: 'conflict',
        success: false,
        conflict: true,
        conflicts: conflicts,
        appliedCount: 0,
        message: 'Detected ' + conflicts.length + ' simultaneous edit conflict(s) with Google Sheets.'
      };
    }
  }

  var appliedCount = 0;
  var errors = [];
  var sheetsModified = {};

  // In-memory lookup caches to avoid repeated O(N) sheet reads across mutations
  var empLocationCache = null;
  function getEmpLocationFast(empName) {
    if (!empName) return 'Helena';
    if (!empLocationCache) {
      empLocationCache = {};
      var empSheet = ss.getSheetByName(typeof SHEET_EMPLOYEES !== 'undefined' ? SHEET_EMPLOYEES : 'Employees');
      if (empSheet && empSheet.getLastRow() > 1) {
        var empData = empSheet.getDataRange().getValues();
        var empLocIdx = 2; // Default C
        for (var eh = 0; eh < empData[0].length; eh++) {
          var ehStr = String(empData[0][eh]).toLowerCase().trim();
          if (ehStr.indexOf('location') !== -1) {
            empLocIdx = eh;
            break;
          }
        }
        for (var er = 1; er < empData.length; er++) {
          var nameKey = String(empData[er][0] || '').trim().toLowerCase();
          if (nameKey) {
            var rawEmpLoc = String(empData[er][empLocIdx] || '').trim();
            empLocationCache[nameKey] = typeof getPhysicalLocation === 'function' ? getPhysicalLocation(rawEmpLoc) : rawEmpLoc;
          }
        }
      }
    }
    return empLocationCache[String(empName).trim().toLowerCase()] || 'Helena';
  }

  var invItemIndexCache = {};
  function getInvItemRowIndexFast(targetSheet, targetSheetName, itemNum) {
    if (!itemNum || itemNum === '—' || itemNum === '-') return -1;
    if (!invItemIndexCache[targetSheetName]) {
      invItemIndexCache[targetSheetName] = {};
      if (targetSheet && targetSheet.getLastRow() > 1) {
        var d = targetSheet.getDataRange().getValues();
        for (var r = 1; r < d.length; r++) {
          var itm = String(d[r][0] || '').trim();
          var esl = String(d[r][1] || '').trim();
          if (itm) invItemIndexCache[targetSheetName][itm] = r + 1;
          if (esl) invItemIndexCache[targetSheetName][esl] = r + 1;
        }
      }
    }
    return invItemIndexCache[targetSheetName][itemNum] || -1;
  }

  for (var m = 0; m < mutations.length; m++) {
    var mut = mutations[m];
    try {
      var sheetName = mut.sheetName || '';
      var sheet = sheetName ? ss.getSheetByName(sheetName) : null;
      var actionsWithoutSheet = ['DELETE_TASK', 'SET_TASK_STATUS', 'TRIGGER_SYNC_CREWS', 'SET_HOLIDAYS', 'SET_TRIP_SCHEDULE', 'SCHEDULE_CREW_VISIT', 'UNSCHEDULE_CREW_VISIT', 'SAVE_PLANNED_TRIPS', 'SAVE_TASK', 'ADD_LOCATION_OVERRIDE', 'IMPORT_HISTORY_LOG', 'RECALCULATE_CHANGE_OUT_DATES'];
      if (!sheet && actionsWithoutSheet.indexOf(mut.action) === -1) {
        errors.push('Sheet not found: ' + sheetName);
        continue;
      }

      switch (mut.action) {
        case 'UPDATE_CELL':
          if (mut.row && mut.col) {
            sheet.getRange(mut.row, mut.col).setValue(mut.value);
            sheetsModified[sheetName] = true;
            appliedCount++;

            // Trigger Swap Stages when Picked checkbox or Date Changed is synced
            try {
              var hLower = String(mut.header || '').toLowerCase();
              var isEquipmentSheet = [
                typeof SHEET_GLOVES !== 'undefined' ? SHEET_GLOVES : 'Gloves',
                typeof SHEET_SLEEVES !== 'undefined' ? SHEET_SLEEVES : 'Sleeves',
                typeof SHEET_BLANKETS !== 'undefined' ? SHEET_BLANKETS : 'Blankets',
                typeof SHEET_MACKS !== 'undefined' ? SHEET_MACKS : 'MACKs',
                typeof SHEET_HV_TESTERS !== 'undefined' ? SHEET_HV_TESTERS : 'HV Testers',
                typeof SHEET_PHASING_SETS !== 'undefined' ? SHEET_PHASING_SETS : 'Phasing Sets',
                typeof SHEET_AED !== 'undefined' ? SHEET_AED : 'AED',
                typeof SHEET_GROUNDS !== 'undefined' ? SHEET_GROUNDS : 'Grounds',
                typeof SHEET_HOT_STICKS !== 'undefined' ? SHEET_HOT_STICKS : 'Hot Sticks'
              ].indexOf(sheetName) !== -1;

              if (isEquipmentSheet) {
                var isGlove = (sheetName === (typeof SHEET_GLOVES !== 'undefined' ? SHEET_GLOVES : 'Gloves'));
                var isSleeve = (sheetName === (typeof SHEET_SLEEVES !== 'undefined' ? SHEET_SLEEVES : 'Sleeves'));
                var isBlanket = (sheetName === (typeof SHEET_BLANKETS !== 'undefined' ? SHEET_BLANKETS : 'Blankets'));
                var isMack = (sheetName === (typeof SHEET_MACKS !== 'undefined' ? SHEET_MACKS : 'MACKs'));
                var isHVTester = (sheetName === (typeof SHEET_HV_TESTERS !== 'undefined' ? SHEET_HV_TESTERS : 'HV Testers'));
                var isPhasingSet = (sheetName === (typeof SHEET_PHASING_SETS !== 'undefined' ? SHEET_PHASING_SETS : 'Phasing Sets'));
                var isAED = (sheetName === (typeof SHEET_AED !== 'undefined' ? SHEET_AED : 'AED'));
                var isGrounds = (sheetName === (typeof SHEET_GROUNDS !== 'undefined' ? SHEET_GROUNDS : 'Grounds'));
                var isHotSticks = (sheetName === (typeof SHEET_HOT_STICKS !== 'undefined' ? SHEET_HOT_STICKS : 'Hot Sticks'));

                // Identify column indices for this equipment sheet
                var eqColAssignedTo, eqColStatus, eqColLocation, eqColDateAssigned, eqColChangeOutDate, eqColTestDate, eqColPicked;
                if (isGlove || isSleeve) {
                  eqColAssignedTo = COLS.INVENTORY.ASSIGNED_TO;     // 9
                  eqColStatus = COLS.INVENTORY.STATUS;              // 8
                  eqColLocation = COLS.INVENTORY.LOCATION;          // 7
                  eqColDateAssigned = COLS.INVENTORY.DATE_ASSIGNED; // 6
                  eqColChangeOutDate = COLS.INVENTORY.CHANGE_OUT_DATE; // 10
                  eqColTestDate = COLS.INVENTORY.TEST_DATE;         // 5
                  eqColPicked = COLS.INVENTORY.PICKED_FOR;          // 11
                } else if (isBlanket) {
                  eqColAssignedTo = COLS.BLANKETS.ASSIGNED_TO;      // 8
                  eqColStatus = COLS.BLANKETS.STATUS;               // 7
                  eqColLocation = COLS.BLANKETS.LOCATION;           // 6
                  eqColDateAssigned = COLS.BLANKETS.DATE_ASSIGNED;  // 5
                  eqColChangeOutDate = COLS.BLANKETS.CHANGE_OUT_DATE; // 9
                  eqColTestDate = COLS.BLANKETS.TEST_DATE;          // 4
                  eqColPicked = COLS.BLANKETS.PICKED_FOR;           // 10
                } else if (isMack) {
                  eqColAssignedTo = COLS.MACKS.ASSIGNED_TO;         // 9
                  eqColStatus = COLS.MACKS.STATUS;                  // 8
                  eqColLocation = COLS.MACKS.LOCATION;              // 7
                  eqColDateAssigned = COLS.MACKS.DATE_ASSIGNED;     // 6
                  eqColChangeOutDate = COLS.MACKS.CHANGE_OUT_DATE;  // 10
                  eqColTestDate = COLS.MACKS.TEST_DATE;             // 5
                  eqColPicked = COLS.MACKS.PICKED_FOR;              // 11
                } else if (isHVTester || isPhasingSet) {
                  eqColAssignedTo = COLS.HV_TESTERS.ASSIGNED_TO;    // 9
                  eqColStatus = COLS.HV_TESTERS.STATUS;             // 8
                  eqColLocation = COLS.HV_TESTERS.LOCATION;         // 7
                  eqColDateAssigned = COLS.HV_TESTERS.DATE_ASSIGNED;// 6
                  eqColChangeOutDate = COLS.HV_TESTERS.CHANGE_OUT_DATE; // 10
                  eqColTestDate = COLS.HV_TESTERS.CALIBRATION_DATE; // 5
                  eqColPicked = COLS.HV_TESTERS.PICKED_FOR;         // 11
                } else if (isAED) {
                  eqColAssignedTo = COLS.AED.ASSIGNED_TO;           // 8
                  eqColStatus = COLS.AED.STATUS;                    // 7
                  eqColLocation = COLS.AED.LOCATION;                // 6
                  eqColDateAssigned = COLS.AED.DATE_ASSIGNED;       // 5
                  eqColChangeOutDate = COLS.AED.PAD_EXPIRATION;     // 4
                  eqColTestDate = COLS.AED.PAD_EXPIRATION;          // 4
                  eqColPicked = COLS.AED.PICKED_FOR;                // 10
                } else if (isGrounds) {
                  eqColAssignedTo = COLS.GROUNDS.ASSIGNED_TO;       // 10
                  eqColStatus = COLS.GROUNDS.STATUS;                // 9
                  eqColLocation = COLS.GROUNDS.LOCATION;            // 8
                  eqColDateAssigned = COLS.GROUNDS.DATE_ASSIGNED;   // 7
                  eqColChangeOutDate = COLS.GROUNDS.CHANGE_OUT_DATE;// 11
                  eqColTestDate = COLS.GROUNDS.TEST_DATE;           // 6
                  eqColPicked = COLS.GROUNDS.PICKED_FOR;            // 12
                } else if (isHotSticks) {
                  eqColAssignedTo = COLS.HOT_STICKS.ASSIGNED_TO;    // 8
                  eqColStatus = COLS.HOT_STICKS.STATUS;             // 7
                  eqColLocation = COLS.HOT_STICKS.LOCATION;         // 6
                  eqColDateAssigned = COLS.HOT_STICKS.DATE_ASSIGNED;// 5
                  eqColChangeOutDate = COLS.HOT_STICKS.CHANGE_OUT_DATE; // 9
                  eqColTestDate = COLS.HOT_STICKS.TEST_DATE;        // 4
                  eqColPicked = COLS.HOT_STICKS.PICKED_FOR;         // 10
                }

                var isAssignedToEdit = (mut.col === eqColAssignedTo || hLower === 'assigned to' || hLower === 'assigned_to');

                if (isAssignedToEdit) {
                  var assignedVal = String(mut.value || '').trim();
                  var assignedValLower = assignedVal.toLowerCase();

                  // 1. Run standard Apps Script trigger handler
                  try {
                    if ((isGlove || isSleeve) && typeof handleInventoryAssignedToChange === 'function') {
                      handleInventoryAssignedToChange(ss, sheet, sheetName, mut.row, mut.value);
                    } else if (isBlanket && typeof handleBlanketAssignedToChange === 'function') {
                      handleBlanketAssignedToChange(ss, sheet, mut.row, mut.value);
                    } else if (isMack && typeof handleMackAssignedToChange === 'function') {
                      handleMackAssignedToChange(ss, sheet, mut.row, mut.value);
                    } else if (isHVTester && typeof handleHVTesterAssignedToChange === 'function') {
                      handleHVTesterAssignedToChange(ss, sheet, mut.row, mut.value);
                    } else if (isPhasingSet && typeof handlePhasingSetAssignedToChange === 'function') {
                      handlePhasingSetAssignedToChange(ss, sheet, mut.row, mut.value);
                    } else if (isAED && typeof handleAEDAssignedToChange === 'function') {
                      handleAEDAssignedToChange(ss, sheet, mut.row, mut.value);
                    } else if (isGrounds && typeof handleGroundAssignedToChange === 'function') {
                      handleGroundAssignedToChange(ss, sheet, mut.row, mut.value);
                    } else if (isHotSticks && typeof handleHotStickAssignedToChange === 'function') {
                      handleHotStickAssignedToChange(ss, sheet, mut.row, mut.value);
                    }
                  } catch (assignedHandlerErr) {
                    Logger.log('AssignedTo handler error on ' + sheetName + ': ' + assignedHandlerErr);
                  }

                  // 2. Direct guarantee update for Status and Location
                  var newStatus = '';
                  var newLocation = '';

                  if (assignedValLower === 'on shelf') {
                    newStatus = 'On Shelf';
                    newLocation = 'Helena';
                    if (eqColPicked) sheet.getRange(mut.row, eqColPicked).setValue('');
                  } else if (assignedValLower === 'packed for delivery') {
                    newStatus = 'Ready For Delivery';
                    newLocation = "Cody's Truck";
                  } else if (assignedValLower === 'packed for testing') {
                    newStatus = 'Ready For Test';
                    newLocation = "Cody's Truck";
                  } else if (assignedValLower === 'in testing') {
                    newStatus = 'In Testing';
                    newLocation = 'Arnett / JM Test';
                  } else if (assignedValLower === 'failed rubber' || assignedValLower === 'not repairable') {
                    newStatus = 'Failed Rubber';
                    newLocation = 'Destroyed';
                    if (eqColChangeOutDate) sheet.getRange(mut.row, eqColChangeOutDate).setValue('N/A');
                    if (eqColPicked) sheet.getRange(mut.row, eqColPicked).setValue('');
                  } else if (assignedValLower === 'lost') {
                    newStatus = 'Lost';
                    newLocation = 'Lost';
                    if (eqColChangeOutDate) sheet.getRange(mut.row, eqColChangeOutDate).setValue('N/A');
                    if (eqColPicked) sheet.getRange(mut.row, eqColPicked).setValue('');
                  } else if (assignedVal !== '') {
                    // Regular employee assignment: look up in fast in-memory Employees cache
                    newStatus = 'Assigned';
                    newLocation = getEmpLocationFast(assignedVal);
                  }

                  if (newStatus && eqColStatus) {
                    sheet.getRange(mut.row, eqColStatus).setValue(newStatus);
                  }
                  if (newLocation && eqColLocation) {
                    sheet.getRange(mut.row, eqColLocation).setValue(newLocation);
                  }

                  // Recalculate Change Out Date if Date Assigned exists
                  if (eqColDateAssigned && eqColChangeOutDate && assignedValLower !== 'failed rubber' && assignedValLower !== 'lost') {
                    var dateAssignedVal = sheet.getRange(mut.row, eqColDateAssigned).getValue();
                    if (dateAssignedVal) {
                      var chgOut = null;
                      if (isBlanket && typeof calculateBlanketChangeOutDate === 'function') {
                        var bTest = sheet.getRange(mut.row, eqColTestDate).getValue();
                        chgOut = calculateBlanketChangeOutDate(bTest);
                      } else if (isMack && typeof calculateMackChangeOutDate === 'function') {
                        var mTest = sheet.getRange(mut.row, eqColTestDate).getValue();
                        chgOut = calculateMackChangeOutDate(mTest);
                      } else if (typeof calculateChangeOutDate === 'function') {
                        chgOut = calculateChangeOutDate(dateAssignedVal, newLocation, assignedVal, isSleeve);
                      }
                      if (chgOut && chgOut !== 'N/A') {
                        sheet.getRange(mut.row, eqColChangeOutDate).setValue(chgOut);
                      }
                    }
                  }
                }

                // If Status was edited directly
                var isStatusEdit = (mut.col === eqColStatus || hLower === 'status' || hLower === 'item status');
                if (isStatusEdit) {
                  var statVal = String(mut.value || '').trim().toLowerCase();
                  if (statVal === 'on shelf') {
                    if (eqColAssignedTo) sheet.getRange(mut.row, eqColAssignedTo).setValue('On Shelf');
                    if (eqColLocation) sheet.getRange(mut.row, eqColLocation).setValue('Helena');
                    if (eqColPicked) sheet.getRange(mut.row, eqColPicked).setValue('');
                  } else if (statVal === 'ready for delivery') {
                    if (eqColAssignedTo) sheet.getRange(mut.row, eqColAssignedTo).setValue('Packed For Delivery');
                    if (eqColLocation) sheet.getRange(mut.row, eqColLocation).setValue("Cody's Truck");
                  } else if (statVal === 'ready for test') {
                    if (eqColAssignedTo) sheet.getRange(mut.row, eqColAssignedTo).setValue('Packed For Testing');
                    if (eqColLocation) sheet.getRange(mut.row, eqColLocation).setValue("Cody's Truck");
                  } else if (statVal === 'in testing') {
                    if (eqColAssignedTo) sheet.getRange(mut.row, eqColAssignedTo).setValue('In Testing');
                    if (eqColLocation) sheet.getRange(mut.row, eqColLocation).setValue('Arnett / JM Test');
                  } else if (statVal === 'failed rubber' || statVal === 'not repairable') {
                    if (eqColAssignedTo) sheet.getRange(mut.row, eqColAssignedTo).setValue('Failed Rubber');
                    if (eqColLocation) sheet.getRange(mut.row, eqColLocation).setValue('Destroyed');
                    if (eqColChangeOutDate) sheet.getRange(mut.row, eqColChangeOutDate).setValue('N/A');
                    if (eqColPicked) sheet.getRange(mut.row, eqColPicked).setValue('');
                  } else if (statVal === 'lost') {
                    if (eqColAssignedTo) sheet.getRange(mut.row, eqColAssignedTo).setValue('Lost');
                    if (eqColLocation) sheet.getRange(mut.row, eqColLocation).setValue('Lost');
                    if (eqColChangeOutDate) sheet.getRange(mut.row, eqColChangeOutDate).setValue('N/A');
                    if (eqColPicked) sheet.getRange(mut.row, eqColPicked).setValue('');
                  }
                }

                // If item is not Lost, clear highlighting and remove from Swaps sheet
                var curStat = String(sheet.getRange(mut.row, eqColStatus).getValue() || '').trim().toLowerCase();
                var curAssigned = String(sheet.getRange(mut.row, eqColAssignedTo).getValue() || '').trim().toLowerCase();
                if (curStat !== 'lost' && curAssigned !== 'lost') {
                  try {
                    sheet.getRange(mut.row, 1, 1, sheet.getLastColumn()).setBackground(null);
                    if (eqColNotes) {
                      sheet.getRange(mut.row, eqColNotes).setFontWeight('normal').setFontColor(null);
                      var curNotes = String(sheet.getRange(mut.row, eqColNotes).getValue() || '').trim().toUpperCase();
                      if (curNotes.indexOf('LOST-LOCATE') !== -1 || curNotes.indexOf('LOST LOCATE') !== -1 || curNotes === 'LOCATE') {
                        sheet.getRange(mut.row, eqColNotes).setValue('');
                      }
                    }
                  } catch (clrErr) { /* ignore */ }

                  // Remove from companion swap sheet's Lost section
                  var itemNum = String(sheet.getRange(mut.row, 1).getValue() || '').trim();
                  var swapSheetName = '';
                  if (sheetName.toLowerCase().includes('glove')) swapSheetName = typeof SHEET_GLOVE_SWAPS !== 'undefined' ? SHEET_GLOVE_SWAPS : 'Glove Swaps';
                  else if (sheetName.toLowerCase().includes('sleeve')) swapSheetName = typeof SHEET_SLEEVE_SWAPS !== 'undefined' ? SHEET_SLEEVE_SWAPS : 'Sleeve Swaps';
                  else if (sheetName.toLowerCase().includes('blanket')) swapSheetName = typeof SHEET_BLANKET_SWAPS !== 'undefined' ? SHEET_BLANKET_SWAPS : 'Blanket Swaps';
                  else if (sheetName.toLowerCase().includes('mack')) swapSheetName = typeof SHEET_MACK_SWAPS !== 'undefined' ? SHEET_MACK_SWAPS : 'MACK Swaps';

                  if (swapSheetName && itemNum) {
                    var swSheet = ss.getSheetByName(swapSheetName);
                    if (swSheet) {
                      var swData = swSheet.getDataRange().getValues();
                      for (var sr = swData.length - 1; sr >= 1; sr--) {
                        var swItem = String(swData[sr][1] || '').trim();
                        var swDays = String(swData[sr][5] || '').trim().toUpperCase();
                        if (swItem === itemNum && (swDays === 'LOST-LOCATE' || swDays.includes('LOST'))) {
                          swSheet.deleteRow(sr + 1);
                        }
                      }
                    }
                  }
                }

                // If Date Assigned was edited directly
                var isDateAssignedEdit = (mut.col === eqColDateAssigned || hLower.includes('date assigned') || hLower === 'date assigned');
                if (isDateAssignedEdit && eqColChangeOutDate) {
                  var curLoc = sheet.getRange(mut.row, eqColLocation).getValue();
                  var curAssigned = sheet.getRange(mut.row, eqColAssignedTo).getValue();
                  var dateVal = mut.value;
                  if (dateVal) {
                    var chgOut = null;
                    if (isBlanket && typeof calculateBlanketChangeOutDate === 'function') {
                      var bTest = sheet.getRange(mut.row, eqColTestDate).getValue();
                      chgOut = calculateBlanketChangeOutDate(bTest);
                    } else if (isMack && typeof calculateMackChangeOutDate === 'function') {
                      var mTest = sheet.getRange(mut.row, eqColTestDate).getValue();
                      chgOut = calculateMackChangeOutDate(mTest);
                    } else if (typeof calculateChangeOutDate === 'function') {
                      chgOut = calculateChangeOutDate(dateVal, curLoc, curAssigned, isSleeve);
                    }
                    if (chgOut && chgOut !== 'N/A') {
                      sheet.getRange(mut.row, eqColChangeOutDate).setValue(chgOut);
                    }
                  }
                }
              }

              var sheetLower = sheetName.toLowerCase();
              var isSwapSheet = sheetLower.includes('swap');

              if (isSwapSheet) {
                var isGlove = sheetLower.includes('glove');
                var isSleeve = sheetLower.includes('sleeve');
                var isBlanket = sheetLower.includes('blanket');
                var isMack = sheetLower.includes('mack');

                var invSheet = null;
                var invSheetName = '';
                if (isGlove) { invSheetName = typeof SHEET_GLOVES !== 'undefined' ? SHEET_GLOVES : 'Gloves'; invSheet = ss.getSheetByName(invSheetName); }
                else if (isSleeve) { invSheetName = typeof SHEET_SLEEVES !== 'undefined' ? SHEET_SLEEVES : 'Sleeves'; invSheet = ss.getSheetByName(invSheetName); }
                else if (isBlanket) { invSheetName = typeof SHEET_BLANKETS !== 'undefined' ? SHEET_BLANKETS : 'Blankets'; invSheet = ss.getSheetByName(invSheetName); }
                else if (isMack) { invSheetName = typeof SHEET_MACKS !== 'undefined' ? SHEET_MACKS : 'MACKs'; invSheet = ss.getSheetByName(invSheetName); }

                // Picked checkbox (Col 9 / Picked header)
                if (mut.col === 9 || hLower === 'picked' || hLower.includes('picked')) {
                  var isChecked = (mut.value === true || mut.value === 'TRUE' || mut.value === 'true');

                  // 1. Run standard Apps Script trigger handler
                  if (invSheet) {
                    try {
                      if ((isGlove || isSleeve) && typeof handlePickedCheckboxChange === 'function') {
                        handlePickedCheckboxChange(ss, sheet, invSheet, mut.row, mut.value, isGlove);
                      } else if (isBlanket && typeof handleBlanketPickedCheckboxChange === 'function') {
                        handleBlanketPickedCheckboxChange(ss, sheet, invSheet, mut.row, mut.value);
                      } else if (isMack && typeof handleMackPickedCheckboxChange === 'function') {
                        handleMackPickedCheckboxChange(ss, sheet, invSheet, mut.row, mut.value);
                      }
                    } catch (hErr) {
                      Logger.log('handlePickedCheckboxChange error: ' + hErr);
                    }
                  }

                  // 2. Direct guarantee update on swap sheet and inventory sheet
                  var empName = String(sheet.getRange(mut.row, 1).getValue() || '').trim();
                  var oldItemNum = String(sheet.getRange(mut.row, 2).getValue() || '').trim();
                  var daysLeftVal = String(sheet.getRange(mut.row, 6).getValue() || '').trim().toUpperCase();
                  var pickListNum = String(sheet.getRange(mut.row, 7).getValue() || '').trim();
                  var isPrevEmp = (daysLeftVal === 'PREV EMP' || (!pickListNum || pickListNum === '—' || pickListNum === '-'));
                  var today = new Date();
                  var todayStr = Utilities.formatDate(today, ss.getSpreadsheetTimeZone(), 'yyyy-MM-dd');
                  var todayFormatted = Utilities.formatDate(today, ss.getSpreadsheetTimeZone(), 'MM/dd/yyyy');

                  if (isPrevEmp) {
                    sheet.getRange(mut.row, 8).setValue(isChecked ? 'Ready For Test' : 'Return to Shelf');
                    if (invSheet && oldItemNum && oldItemNum !== '—' && oldItemNum !== '-') {
                      var oldRowIdx = getInvItemRowIndexFast(invSheet, invSheetName, oldItemNum);
                      if (oldRowIdx !== -1) {
                        if (isChecked) {
                          invSheet.getRange(oldRowIdx, COLS.INVENTORY.STATUS).setValue('Ready For Test');
                          invSheet.getRange(oldRowIdx, COLS.INVENTORY.ASSIGNED_TO).setValue('Packed For Testing');
                          invSheet.getRange(oldRowIdx, COLS.INVENTORY.LOCATION).setValue("Cody's Truck");
                          invSheet.getRange(oldRowIdx, COLS.INVENTORY.PICKED_FOR).setValue('');
                        } else {
                          invSheet.getRange(oldRowIdx, COLS.INVENTORY.STATUS).setValue('Assigned');
                          invSheet.getRange(oldRowIdx, COLS.INVENTORY.ASSIGNED_TO).setValue(empName);
                          invSheet.getRange(oldRowIdx, COLS.INVENTORY.LOCATION).setValue('Previous Employee');
                          invSheet.getRange(oldRowIdx, COLS.INVENTORY.PICKED_FOR).setValue('');
                        }
                      }
                    }
                  } else {
                    sheet.getRange(mut.row, 8).setValue(isChecked ? 'Ready For Delivery 🚚' : 'In Stock ✅');

                    if (invSheet && pickListNum && pickListNum !== '—' && pickListNum !== '-') {
                      var invRowIdx = getInvItemRowIndexFast(invSheet, invSheetName, pickListNum);

                      if (invRowIdx !== -1) {
                        var colLoc, colStat, colAssigned, colDate, colChangeOut, colPicked;
                        if (isBlanket) {
                          colLoc = typeof COLS !== 'undefined' && COLS.BLANKETS ? COLS.BLANKETS.LOCATION : 6;
                          colStat = typeof COLS !== 'undefined' && COLS.BLANKETS ? COLS.BLANKETS.STATUS : 7;
                          colAssigned = typeof COLS !== 'undefined' && COLS.BLANKETS ? COLS.BLANKETS.ASSIGNED_TO : 8;
                          colDate = typeof COLS !== 'undefined' && COLS.BLANKETS ? COLS.BLANKETS.DATE_ASSIGNED : 5;
                          colChangeOut = typeof COLS !== 'undefined' && COLS.BLANKETS ? COLS.BLANKETS.CHANGE_OUT_DATE : 9;
                          colPicked = typeof COLS !== 'undefined' && COLS.BLANKETS ? COLS.BLANKETS.PICKED_FOR : 10;
                        } else if (isMack) {
                          colLoc = typeof COLS !== 'undefined' && COLS.MACKS ? COLS.MACKS.LOCATION : 7;
                          colStat = typeof COLS !== 'undefined' && COLS.MACKS ? COLS.MACKS.STATUS : 8;
                          colAssigned = typeof COLS !== 'undefined' && COLS.MACKS ? COLS.MACKS.ASSIGNED_TO : 9;
                          colDate = typeof COLS !== 'undefined' && COLS.MACKS ? COLS.MACKS.DATE_ASSIGNED : 6;
                          colChangeOut = typeof COLS !== 'undefined' && COLS.MACKS ? COLS.MACKS.CHANGE_OUT_DATE : 10;
                          colPicked = typeof COLS !== 'undefined' && COLS.MACKS ? COLS.MACKS.PICKED_FOR : 11;
                        } else {
                          colLoc = typeof COLS !== 'undefined' && COLS.INVENTORY ? COLS.INVENTORY.LOCATION : 7;
                          colStat = typeof COLS !== 'undefined' && COLS.INVENTORY ? COLS.INVENTORY.STATUS : 8;
                          colAssigned = typeof COLS !== 'undefined' && COLS.INVENTORY ? COLS.INVENTORY.ASSIGNED_TO : 9;
                          colDate = typeof COLS !== 'undefined' && COLS.INVENTORY ? COLS.INVENTORY.DATE_ASSIGNED : 6;
                          colChangeOut = typeof COLS !== 'undefined' && COLS.INVENTORY ? COLS.INVENTORY.CHANGE_OUT_DATE : 10;
                          colPicked = typeof COLS !== 'undefined' && COLS.INVENTORY ? COLS.INVENTORY.PICKED_FOR : 11;
                        }

                        if (isChecked) {
                          invSheet.getRange(invRowIdx, colLoc).setValue("Cody's Truck");
                          invSheet.getRange(invRowIdx, colStat).setValue('Ready For Delivery');
                          invSheet.getRange(invRowIdx, colAssigned).setValue('Packed For Delivery');
                          invSheet.getRange(invRowIdx, colDate).setValue(todayFormatted);
                          invSheet.getRange(invRowIdx, colPicked).setValue(empName + ' Picked On ' + todayStr);

                          var chgDate = null;
                          if (isBlanket && typeof calculateBlanketChangeOutDate === 'function') {
                            var bTest = invSheet.getRange(invRowIdx, COLS.BLANKETS.TEST_DATE).getValue();
                            chgDate = calculateBlanketChangeOutDate(bTest);
                          } else if (isMack && typeof calculateMackChangeOutDate === 'function') {
                            var mTest = invSheet.getRange(invRowIdx, COLS.MACKS.TEST_DATE).getValue();
                            chgDate = calculateMackChangeOutDate(mTest);
                          } else if (typeof calculateChangeOutDate === 'function') {
                            chgDate = calculateChangeOutDate(today, "Cody's Truck", 'Packed For Delivery', isSleeve);
                          }
                          if (chgDate && chgDate !== 'N/A') {
                            invSheet.getRange(invRowIdx, colChangeOut).setValue(chgDate);
                          }
                        } else {
                          invSheet.getRange(invRowIdx, colLoc).setValue('Helena');
                          invSheet.getRange(invRowIdx, colStat).setValue('In Stock');
                          invSheet.getRange(invRowIdx, colAssigned).setValue('On Shelf');
                          invSheet.getRange(invRowIdx, colDate).setValue('');
                          invSheet.getRange(invRowIdx, colPicked).setValue('');
                          invSheet.getRange(invRowIdx, colChangeOut).setValue('');
                        }
                      }
                    }
                  }

                } else if (mut.col === 10 || hLower === 'date changed' || hLower.includes('changed')) {
                  var dVal = sheet.getRange(mut.row, mut.col).getValue();
                  var hasDate = (dVal !== null && dVal !== undefined && String(dVal).trim() !== '');

                  // 1. Run standard Apps Script trigger handler
                  if (invSheet) {
                    try {
                      if ((isGlove || isSleeve) && typeof handleDateChangedEdit === 'function') {
                        handleDateChangedEdit(ss, sheet, invSheet, mut.row, dVal, isGlove);
                      } else if (isBlanket && typeof handleBlanketDateChangedEdit === 'function') {
                        handleBlanketDateChangedEdit(ss, sheet, invSheet, mut.row, dVal);
                      } else if (isMack && typeof handleMackDateChangedEdit === 'function') {
                        handleMackDateChangedEdit(ss, sheet, invSheet, mut.row, dVal);
                      }
                    } catch (dErr) {
                      Logger.log('handleDateChangedEdit error: ' + dErr);
                    }
                  }

                  // 2. Direct guarantee fallback update
                  var empName = String(sheet.getRange(mut.row, 1).getValue() || '').trim();
                  var oldItemNum = String(sheet.getRange(mut.row, 2).getValue() || '').trim();
                  var daysLeftVal = String(sheet.getRange(mut.row, 6).getValue() || '').trim().toUpperCase();
                  var pickListNum = String(sheet.getRange(mut.row, 7).getValue() || '').trim();
                  var isPrevEmp = (daysLeftVal === 'PREV EMP' || (!pickListNum || pickListNum === '—' || pickListNum === '-'));

                  if (isPrevEmp) {
                    sheet.getRange(mut.row, 8).setValue(hasDate ? 'Packed For Testing' : 'Return to Shelf');
                    if (invSheet && oldItemNum && oldItemNum !== '—' && oldItemNum !== '-') {
                      var oldRowIdx = getInvItemRowIndexFast(invSheet, invSheetName, oldItemNum);
                      if (oldRowIdx !== -1) {
                        if (hasDate) {
                          var dObj = (dVal instanceof Date) ? dVal : new Date(dVal);
                          var dFormatted = Utilities.formatDate(dObj, ss.getSpreadsheetTimeZone(), 'MM/dd/yyyy');
                          var chgOutDate = new Date(dObj.getTime());
                          chgOutDate.setFullYear(chgOutDate.getFullYear() + 1);
                          var chgOutFormatted = Utilities.formatDate(chgOutDate, ss.getSpreadsheetTimeZone(), 'MM/dd/yyyy');

                          invSheet.getRange(oldRowIdx, COLS.INVENTORY.STATUS).setValue('Ready For Test');
                          invSheet.getRange(oldRowIdx, COLS.INVENTORY.ASSIGNED_TO).setValue('Packed For Testing');
                          invSheet.getRange(oldRowIdx, COLS.INVENTORY.LOCATION).setValue("Cody's Truck");
                          invSheet.getRange(oldRowIdx, COLS.INVENTORY.DATE_ASSIGNED).setValue(dFormatted);
                          invSheet.getRange(oldRowIdx, COLS.INVENTORY.CHANGE_OUT_DATE).setValue(chgOutFormatted);
                          invSheet.getRange(oldRowIdx, COLS.INVENTORY.PICKED_FOR).setValue('');
                        } else {
                          invSheet.getRange(oldRowIdx, COLS.INVENTORY.STATUS).setValue('Ready For Test');
                          invSheet.getRange(oldRowIdx, COLS.INVENTORY.ASSIGNED_TO).setValue('Packed For Testing');
                          invSheet.getRange(oldRowIdx, COLS.INVENTORY.LOCATION).setValue("Cody's Truck");
                          invSheet.getRange(oldRowIdx, COLS.INVENTORY.DATE_ASSIGNED).setValue('');
                          invSheet.getRange(oldRowIdx, COLS.INVENTORY.CHANGE_OUT_DATE).setValue('');
                          invSheet.getRange(oldRowIdx, COLS.INVENTORY.PICKED_FOR).setValue('');
                        }
                      }
                    }
                  } else if (hasDate) {
                    // Update Swap Sheet Status and Days Left
                    sheet.getRange(mut.row, 8).setValue('Assigned');
                    sheet.getRange(mut.row, 6).setValue('Assigned');

                    // Look up employee location fast from in-memory cache
                    var empLocation = getEmpLocationFast(empName);

                    // Format dates
                    var dObj = (dVal instanceof Date) ? dVal : new Date(dVal);
                    if (isNaN(dObj.getTime())) dObj = new Date();
                    var dFormatted = Utilities.formatDate(dObj, ss.getSpreadsheetTimeZone(), 'MM/dd/yyyy');
                    var dIso = Utilities.formatDate(dObj, ss.getSpreadsheetTimeZone(), 'yyyy-MM-dd');

                    // Store Stage 3 values in columns U-W (indices 21-23)
                    var chgOutFormatted = '';
                    if (typeof calculateChangeOutDate === 'function') {
                      var calcDate = calculateChangeOutDate(dObj, empLocation, empName, isSleeve);
                      if (calcDate && calcDate !== 'N/A') {
                        chgOutFormatted = (calcDate instanceof Date) ? Utilities.formatDate(calcDate, ss.getSpreadsheetTimeZone(), 'MM/dd/yyyy') : String(calcDate);
                      } else if (calcDate === 'N/A') {
                        chgOutFormatted = 'N/A';
                      }
                    }
                    try {
                      sheet.getRange(mut.row, 21, 1, 3).setValues([[empName, dIso, chgOutFormatted]]);
                    } catch (stg3Err) { /* ignore */ }

                    if (invSheet) {
                      var pickRowIdx = pickListNum ? getInvItemRowIndexFast(invSheet, invSheetName, pickListNum) : -1;
                      var oldRowIdx = (oldItemNum && oldItemNum !== '—' && oldItemNum !== '-') ? getInvItemRowIndexFast(invSheet, invSheetName, oldItemNum) : -1;

                      var colLoc, colStat, colAssigned, colDate, colChangeOut, colPicked;
                      if (isBlanket) {
                        colLoc = typeof COLS !== 'undefined' && COLS.BLANKETS ? COLS.BLANKETS.LOCATION : 6;
                        colStat = typeof COLS !== 'undefined' && COLS.BLANKETS ? COLS.BLANKETS.STATUS : 7;
                        colAssigned = typeof COLS !== 'undefined' && COLS.BLANKETS ? COLS.BLANKETS.ASSIGNED_TO : 8;
                        colDate = typeof COLS !== 'undefined' && COLS.BLANKETS ? COLS.BLANKETS.DATE_ASSIGNED : 5;
                        colChangeOut = typeof COLS !== 'undefined' && COLS.BLANKETS ? COLS.BLANKETS.CHANGE_OUT_DATE : 9;
                        colPicked = typeof COLS !== 'undefined' && COLS.BLANKETS ? COLS.BLANKETS.PICKED_FOR : 10;
                      } else {
                        // Gloves, Sleeves, MACKs
                        colLoc = typeof COLS !== 'undefined' && COLS.INVENTORY ? COLS.INVENTORY.LOCATION : 7;
                        colStat = typeof COLS !== 'undefined' && COLS.INVENTORY ? COLS.INVENTORY.STATUS : 8;
                        colAssigned = typeof COLS !== 'undefined' && COLS.INVENTORY ? COLS.INVENTORY.ASSIGNED_TO : 9;
                        colDate = typeof COLS !== 'undefined' && COLS.INVENTORY ? COLS.INVENTORY.DATE_ASSIGNED : 6;
                        colChangeOut = typeof COLS !== 'undefined' && COLS.INVENTORY ? COLS.INVENTORY.CHANGE_OUT_DATE : 10;
                        colPicked = typeof COLS !== 'undefined' && COLS.INVENTORY ? COLS.INVENTORY.PICKED_FOR : 11;
                      }

                      // Update Pick List item (New item -> Assigned)
                      if (pickRowIdx !== -1) {
                        invSheet.getRange(pickRowIdx, colLoc).setValue(empLocation);
                        invSheet.getRange(pickRowIdx, colStat).setValue('Assigned');
                        invSheet.getRange(pickRowIdx, colAssigned).setValue(empName);
                        invSheet.getRange(pickRowIdx, colDate).setValue(dFormatted);
                        invSheet.getRange(pickRowIdx, colPicked).setValue(''); // Clear Picked For note!
                        if (chgOutFormatted) {
                          invSheet.getRange(pickRowIdx, colChangeOut).setValue(chgOutFormatted);
                        }
                      }

                      // Update Old item (Old item -> Ready For Test)
                      if (oldRowIdx !== -1) {
                        invSheet.getRange(oldRowIdx, colLoc).setValue("Cody's Truck");
                        invSheet.getRange(oldRowIdx, colStat).setValue('Ready For Test');
                        invSheet.getRange(oldRowIdx, colAssigned).setValue('Packed For Testing');
                        invSheet.getRange(oldRowIdx, colDate).setValue(dFormatted);
                        invSheet.getRange(oldRowIdx, colPicked).setValue('');

                        var oldChgOut = null;
                        if (typeof calculateChangeOutDate === 'function') {
                          oldChgOut = calculateChangeOutDate(dObj, "Cody's Truck", 'Packed For Testing', isSleeve);
                        }
                        if (oldChgOut && oldChgOut !== 'N/A') {
                          invSheet.getRange(oldRowIdx, colChangeOut).setValue(oldChgOut);
                        }
                      }
                    }
                  }
                }
              }
              
              if (sheetLower === 'expiring certs' || sheetLower.indexOf('expiring cert') !== -1) {
                try {
                  if (typeof handleExpiringCertDateChange === 'function') {
                    handleExpiringCertDateChange(ss, sheet, mut.row, mut.col);
                  }
                } catch (certErr) {
                  Logger.log('applyBatchSyncMutations Expiring Certs handler error: ' + certErr);
                }
              }
            } catch (swapErr) {
              Logger.log('applyBatchSyncMutations handler error: ' + swapErr);
            }
          }
          break;

        case 'UPDATE_ROW':
        case 'UPDATE_JOB_TRACKING':
          // mut: { sheetName, itemIdentifier, updatedFields, tableKey }
          if (sheet && (mut.updatedFields || mut.updates)) {
            var data = sheet.getDataRange().getValues();
            if (data && data.length > 0) {
              var headers = data[0].map(function(h) { return String(h || '').trim(); });
              var fields = mut.updatedFields || mut.updates;
              var idStr = String(mut.itemIdentifier || mut.jobNumber || mut.keyValue || '').trim().toLowerCase();
              var isEmpSheet = (sheetName.toLowerCase() === 'employees' || (typeof SHEET_EMPLOYEES !== 'undefined' && sheetName === SHEET_EMPLOYEES));
              
              var targetRowIdx = -1;
              if (idStr) {
                for (var r = 1; r < data.length; r++) {
                  var c0 = String(data[r][0] || '').trim().toLowerCase();
                  if (c0 === idStr) {
                    targetRowIdx = r + 1; // 1-based sheet row
                    break;
                  }
                  // For non-employees sheets (like Job Tracking or inventory), check secondary identifiers
                  if (!isEmpSheet) {
                    var c1 = String(data[r][1] || '').trim().toLowerCase();
                    var c3 = (data[r].length > 3) ? String(data[r][3] || '').trim().toLowerCase() : '';
                    if (c1 === idStr || c3 === idStr) {
                      targetRowIdx = r + 1;
                      break;
                    }
                  }
                }
              }

              if (targetRowIdx !== -1) {
                for (var colName in fields) {
                  var fldVal = fields[colName];
                  var fldLower = colName.toLowerCase().trim();
                  var cIdx = -1;
                  for (var h = 0; h < headers.length; h++) {
                    if (headers[h].toLowerCase().trim() === fldLower) {
                      cIdx = h;
                      break;
                    }
                  }
                  if (cIdx !== -1) {
                    if (fldLower === 'last day reason' && typeof fldVal === 'string' && fldVal.trim() !== '') {
                      var ldrLower = fldVal.toLowerCase().trim();
                      if (ldrLower.indexOf('quit') !== -1) fldVal = 'Quit';
                      else if (ldrLower.indexOf('fire') !== -1) fldVal = 'Fired';
                      else if (ldrLower.indexOf('layoff') !== -1 || ldrLower.indexOf('laid') !== -1) fldVal = 'Layoff';
                      else if (ldrLower.indexOf('resign') !== -1) fldVal = 'Resigned';
                      else fldVal = 'Quit';
                    }
                    if (typeof fldVal === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(fldVal)) {
                      fldVal = typeof parseDateNoon === 'function' ? parseDateNoon(fldVal) : new Date(fldVal);
                    }
                    sheet.getRange(targetRowIdx, cIdx + 1).setValue(fldVal);
                  }
                }
                sheetsModified[sheetName] = true;
                appliedCount++;
              } else {
                errors.push('Could not find row for ' + (mut.itemIdentifier || mut.jobNumber || 'item') + ' in ' + sheetName);
              }
            }
          }
          break;

        case 'UPDATE_ROW_BY_KEY':
          // mut: { sheetName, keyColName, keyValue, updates: { ColName: NewVal } }
          var data = sheet.getDataRange().getValues();
          var headers = data[0].map(function(h) { return String(h || '').trim(); });
          var keyColIdx = headers.indexOf(mut.keyColName);
          if (keyColIdx === -1) {
            errors.push('Key column ' + mut.keyColName + ' not found in ' + sheetName);
            break;
          }

          var targetRowIdx = -1;
          for (var r = 1; r < data.length; r++) {
            if (String(data[r][keyColIdx] || '').trim() === String(mut.keyValue || '').trim()) {
              targetRowIdx = r + 1; // 1-based sheet row
              break;
            }
          }

          if (targetRowIdx !== -1 && mut.updates) {
            for (var colName in mut.updates) {
              var cIdx = headers.indexOf(colName);
              if (cIdx !== -1) {
                var val = mut.updates[colName];
                if (typeof val === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(val)) {
                  val = parseDateNoon(val);
                }
                sheet.getRange(targetRowIdx, cIdx + 1).setValue(val);
              }
            }
            sheetsModified[sheetName] = true;
            appliedCount++;
          } else {
            errors.push('Key value ' + mut.keyValue + ' not found in ' + sheetName);
          }
          break;

        case 'SET_TASK_STATUS':
          // mut: { taskId, status, completedDate }
          var taskMetaSheet = ss.getSheetByName('Task Metadata');
          if (taskMetaSheet) {
            var metaData = taskMetaSheet.getDataRange().getValues();
            for (var tm = 1; tm < metaData.length; tm++) {
              var tId = String(metaData[tm][0] || '').trim();
              if (tId === mut.taskId || (mut.taskId && (tId.indexOf(mut.taskId) === 0 || mut.taskId.indexOf(tId) === 0))) {
                taskMetaSheet.getRange(tm + 1, 15).setValue(mut.status || 'Complete'); // Status (O)
                if (mut.completedDate) {
                  taskMetaSheet.getRange(tm + 1, 22).setValue(parseDateNoon(mut.completedDate) || new Date()); // CompletedDate (V)
                }
                sheetsModified['Task Metadata'] = true;
                appliedCount++;

                // If source sheet is Safety Equipment Needs, also mark Resolved in source
                var srcSheetName = String(metaData[tm][1] || '').trim();
                var srcRowIdx = parseInt(metaData[tm][2], 10);
                if (srcSheetName === 'Safety Equipment Needs' && srcRowIdx > 1) {
                  var eqSheet = ss.getSheetByName('Safety Equipment Needs');
                  if (eqSheet && srcRowIdx <= eqSheet.getLastRow()) {
                    var eqHeaders = eqSheet.getRange(1, 1, 1, eqSheet.getLastColumn()).getValues()[0];
                    var eqStatusCol = -1;
                    var eqResolvedCol = -1;
                    for (var eh = 0; eh < eqHeaders.length; eh++) {
                      var ehName = String(eqHeaders[eh] || '').toLowerCase().trim();
                      if (ehName === 'status') eqStatusCol = eh + 1;
                      if (ehName === 'resolved on') eqResolvedCol = eh + 1;
                    }
                    if (eqStatusCol !== -1) eqSheet.getRange(srcRowIdx, eqStatusCol).setValue('Resolved');
                    if (eqResolvedCol !== -1) eqSheet.getRange(srcRowIdx, eqResolvedCol).setValue(new Date());
                    sheetsModified['Safety Equipment Needs'] = true;
                  }
                }
                break;
              }
            }
          }
          break;

        case 'SET_HOLIDAYS':
          if (mut.holidays && typeof saveHolidays === 'function') {
            saveHolidays(mut.holidays);
            appliedCount++;
          }
          break;

        case 'SAVE_PLANNED_TRIPS':
        case 'SCHEDULE_CREW_VISIT':
        case 'UNSCHEDULE_CREW_VISIT':
        case 'SET_TRIP_SCHEDULE':
          if (mut.schedule && typeof setWorkSchedule === 'function') {
            setWorkSchedule(mut.schedule);
            appliedCount++;
          }
          if (mut.trips) {
            var tripsStr = typeof mut.trips === 'string' ? mut.trips : JSON.stringify(mut.trips);
            if (typeof setChunkedScriptProperty === 'function') {
              setChunkedScriptProperty('PLANNED_TRIPS', tripsStr);
            } else {
              PropertiesService.getScriptProperties().setProperty('PLANNED_TRIPS', tripsStr);
            }
            appliedCount++;
          } else if (mut.date) {
            var rawTrips = (typeof getChunkedScriptProperty === 'function') ? getChunkedScriptProperty('PLANNED_TRIPS') : PropertiesService.getScriptProperties().getProperty('PLANNED_TRIPS');
            var tripsObj = {};
            if (rawTrips) {
              try { tripsObj = JSON.parse(rawTrips); } catch (e) {}
            }
            if (mut.action === 'UNSCHEDULE_CREW_VISIT' && !mut.location) {
              delete tripsObj[mut.date];
            } else if (mut.action === 'UNSCHEDULE_CREW_VISIT' && mut.location && Array.isArray(tripsObj[mut.date])) {
              tripsObj[mut.date] = tripsObj[mut.date].filter(function(t) { return String(t.location || '').toLowerCase() !== String(mut.location).toLowerCase(); });
              if (tripsObj[mut.date].length === 0) delete tripsObj[mut.date];
            } else if (mut.location) {
              tripsObj[mut.date] = { location: mut.location, crew: mut.crew || '' };
            }
            var updatedStr = JSON.stringify(tripsObj);
            if (typeof setChunkedScriptProperty === 'function') {
              setChunkedScriptProperty('PLANNED_TRIPS', updatedStr);
            } else {
              PropertiesService.getScriptProperties().setProperty('PLANNED_TRIPS', updatedStr);
            }
            appliedCount++;
          }
          break;

        case 'SAVE_TASK':
          var taskMetaSheetSave = ss.getSheetByName('Task Metadata');
          if (taskMetaSheetSave && mut.taskId) {
            var metaDataSave = taskMetaSheetSave.getDataRange().getValues();
            var foundRowSave = -1;
            for (var tmS = 1; tmS < metaDataSave.length; tmS++) {
              var tIdS = String(metaDataSave[tmS][0] || '').trim();
              if (tIdS === String(mut.taskId).trim()) {
                foundRowSave = tmS + 1;
                break;
              }
            }
            if (foundRowSave !== -1) {
              if (mut.scheduledDate) taskMetaSheetSave.getRange(foundRowSave, 16).setValue(mut.scheduledDate); // ScheduledDate (P)
              if (mut.startTime) taskMetaSheetSave.getRange(foundRowSave, 17).setValue(mut.startTime); // StartTime (Q)
              if (mut.endTime) taskMetaSheetSave.getRange(foundRowSave, 18).setValue(mut.endTime); // EndTime (R)
              if (mut.status) taskMetaSheetSave.getRange(foundRowSave, 15).setValue(mut.status); // Status (O)
              sheetsModified['Task Metadata'] = true;
              appliedCount++;
            }
          }
          break;

        case 'IMPORT_HISTORY_LOG':
          if (mut.equipmentType && mut.itemNum && mut.logText && typeof parseAndImportItemHistoryLog === 'function') {
            var importRes = parseAndImportItemHistoryLog(mut.equipmentType, mut.itemNum, mut.logText);
            if (importRes && importRes.success) {
              appliedCount++;
              if (mut.sheetName) sheetsModified[mut.sheetName] = true;
            } else if (importRes && importRes.error) {
              errors.push('History import error: ' + importRes.error);
            }
          }
          break;

        case 'DELETE_TASK':
          if (mut.taskId) {
            var metaSheetDel = ss.getSheetByName('Task Metadata');
            if (metaSheetDel) {
              var mDataDel = metaSheetDel.getDataRange().getValues();
              var mHeadersDel = mDataDel[0];
              var idColDel = -1;
              var srcSheetColDel = -1;
              var srcRowColDel = -1;
              for (var hDel = 0; hDel < mHeadersDel.length; hDel++) {
                var hNameDel = String(mHeadersDel[hDel] || '').trim();
                if (hNameDel === 'TaskID' || hNameDel === 'Task ID') idColDel = hDel;
                else if (hNameDel === 'SourceSheet' || hNameDel === 'Source Sheet') srcSheetColDel = hDel;
                else if (hNameDel === 'SourceRow' || hNameDel === 'Source Row') srcRowColDel = hDel;
              }
              if (idColDel !== -1) {
                for (var rDel = mDataDel.length - 1; rDel >= 1; rDel--) {
                  var rowTaskIdDel = String(mDataDel[rDel][idColDel] || '').trim();
                  var rowKeyDel = (srcSheetColDel !== -1 && srcRowColDel !== -1) ? (mDataDel[rDel][srcSheetColDel] + '_' + mDataDel[rDel][srcRowColDel]) : '';
                  if (rowTaskIdDel === String(mut.taskId).trim() || rowKeyDel === String(mut.taskId).trim()) {
                    var srcSheetNameDel = srcSheetColDel !== -1 ? String(mDataDel[rDel][srcSheetColDel] || '').trim() : '';
                    var srcRowNumDel = srcRowColDel !== -1 ? parseInt(mDataDel[rDel][srcRowColDel], 10) : -1;
                    
                    // If source sheet is Safety Equipment Needs, delete the source row too
                    if (srcSheetNameDel && srcRowNumDel > 1) {
                      var srcSheetDel = ss.getSheetByName(srcSheetNameDel);
                      if (srcSheetDel && srcRowNumDel <= srcSheetDel.getLastRow()) {
                        try {
                          srcSheetDel.deleteRow(srcRowNumDel);
                          sheetsModified[srcSheetNameDel] = true;
                        } catch (eSrc) {
                          Logger.log('Could not delete from source sheet ' + srcSheetNameDel + ': ' + eSrc);
                        }
                      }
                    }

                    metaSheetDel.deleteRow(rDel + 1);
                    sheetsModified['Task Metadata'] = true;
                    appliedCount++;
                    break;
                  }
                }
              }
            }
          }
          break;

        case 'SET_TASK_STATUS':
          if (mut.taskId) {
            var metaSheetStatus = ss.getSheetByName('Task Metadata');
            if (metaSheetStatus) {
              var mDataSt = metaSheetStatus.getDataRange().getValues();
              var mHeadersSt = mDataSt[0];
              var idColSt = -1;
              var statColSt = -1;
              var compColSt = -1;
              var srcSheetColSt = -1;
              var srcRowColSt = -1;
              for (var hSt = 0; hSt < mHeadersSt.length; hSt++) {
                var hNameSt = String(mHeadersSt[hSt] || '').trim();
                if (hNameSt === 'TaskID' || hNameSt === 'Task ID') idColSt = hSt;
                else if (hNameSt === 'Status') statColSt = hSt;
                else if (hNameSt === 'CompletedDate' || hNameSt === 'Completed Date') compColSt = hSt;
                else if (hNameSt === 'SourceSheet' || hNameSt === 'Source Sheet') srcSheetColSt = hSt;
                else if (hNameSt === 'SourceRow' || hNameSt === 'Source Row') srcRowColSt = hSt;
              }
              if (idColSt !== -1 && statColSt !== -1) {
                for (var rSt = 1; rSt < mDataSt.length; rSt++) {
                  var rowTaskIdSt = String(mDataSt[rSt][idColSt] || '').trim();
                  var rowKeySt = (srcSheetColSt !== -1 && srcRowColSt !== -1) ? (mDataSt[rSt][srcSheetColSt] + '_' + mDataSt[rSt][srcRowColSt]) : '';
                  if (rowTaskIdSt === String(mut.taskId).trim() || rowKeySt === String(mut.taskId).trim()) {
                    metaSheetStatus.getRange(rSt + 1, statColSt + 1).setValue(mut.status || 'Complete');
                    if (compColSt !== -1) {
                      metaSheetStatus.getRange(rSt + 1, compColSt + 1).setValue(mut.completedDate || new Date());
                    }
                    sheetsModified['Task Metadata'] = true;
                    appliedCount++;
                    break;
                  }
                }
              }
            }
          }
          break;

        case 'SAVE_PLANNED_TRIPS':
        case 'SET_TRIP_SCHEDULE':
          if (mut.trips) {
            try {
              PropertiesService.getScriptProperties().setProperty('PLANNED_TRIPS', JSON.stringify(mut.trips));
              appliedCount++;
            } catch (eTr) {
              errors.push('Error saving planned trips: ' + eTr);
            }
          }
          break;

        case 'TRIGGER_SYNC_CREWS':
          if (typeof syncCrews === 'function') {
            syncCrews(true);
            appliedCount++;
          }
          break;

        case 'ADD_ROW':
          if (sheet && mut.rowData) {
            var lastRow = sheet.getLastRow();
            var lastCol = sheet.getLastColumn();
            var headers = [];
            if (lastRow >= 1 && lastCol >= 1) {
              headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(function(h) { return String(h || '').trim(); });
            }
            if (headers.length === 0) {
              headers = Object.keys(mut.rowData);
              sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
              lastRow = 1;
            }

            var rowArray = headers.map(function(h) {
              var cleanH = String(h || '').trim();
              var hLower = cleanH.toLowerCase();
              
              // 1. Direct match
              if (mut.rowData[cleanH] !== undefined) return mut.rowData[cleanH];
              
              // 2. Case-insensitive match in rowData
              for (var k in mut.rowData) {
                if (k.trim().toLowerCase() === hLower) return mut.rowData[k];
              }
              
              // 3. Known alias matches
              if (['item #', 'item', 'glove', 'sleeve', 'blanket', 'mack', 'serial #', 'serial', 'item number'].indexOf(hLower) !== -1) {
                return mut.rowData['Item #'] || mut.rowData['Glove'] || mut.rowData['Sleeve'] || mut.rowData['Blanket'] || mut.rowData['Serial #'] || mut.rowData['ESL ID'] || '';
              }
              if (['esl id', 'esl', 'barcode'].indexOf(hLower) !== -1) {
                return mut.rowData['ESL ID'] || mut.rowData['ESL'] || mut.rowData['Barcode'] || '';
              }
              if (['size', 'type', 'model'].indexOf(hLower) !== -1) {
                return mut.rowData['Size'] || mut.rowData['Type'] || mut.rowData['Model'] || '';
              }
              if (['class', 'kv'].indexOf(hLower) !== -1) {
                return mut.rowData['Class'] || mut.rowData['KV'] || '';
              }
              if (['test date', 'cal date', 'calibration date', 'pad expiration'].indexOf(hLower) !== -1) {
                return mut.rowData['Test Date'] || mut.rowData['Calibration Date'] || mut.rowData['Pad Expiration'] || '';
              }
              if (['change out date', 'changeout date', 'due date'].indexOf(hLower) !== -1) {
                return mut.rowData['Change Out Date'] || mut.rowData['Pad Expiration'] || '';
              }
              
              return '';
            }).map(function(val) {
              if (typeof val === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(val)) {
                return typeof parseDateNoon === 'function' ? parseDateNoon(val) : new Date(val);
              }
              return val;
            });

            var newRowIdx = lastRow + 1;
            if (sheet.getMaxRows() < newRowIdx) {
              sheet.insertRowsAfter(sheet.getMaxRows(), newRowIdx - sheet.getMaxRows());
            }

            if (typeof safeWriteRowToTable === 'function') {
              safeWriteRowToTable(sheet, newRowIdx, rowArray, headers);
            } else {
              sheet.getRange(newRowIdx, 1, 1, rowArray.length).setValues([rowArray]);
            }
            sheetsModified[sheetName] = true;
            appliedCount++;
          }
          break;

        case 'DELETE_ROW':
          if (sheet) {
            var data = sheet.getDataRange().getValues();
            var idStr = String(mut.itemIdentifier || '').trim().toLowerCase();
            if (idStr) {
              // Delete in reverse order to cleanly remove all matching rows (e.g. history records)
              for (var r = data.length - 1; r >= 1; r--) {
                var rowVals = data[r].map(function(c) { return String(c || '').trim().toLowerCase(); });
                if (rowVals.indexOf(idStr) !== -1) {
                  sheet.deleteRow(r + 1); // 1-indexed for Sheets
                  sheetsModified[sheetName] = true;
                  appliedCount++;
                }
              }
            } else if (mut.rowData) {
              var rDate = String(mut.rowData['Date Assigned'] || mut.rowData['Date'] || '').trim().toLowerCase();
              var rItem = String(mut.rowData['Item #'] || mut.rowData['Item'] || mut.rowData['Serial #'] || '').trim().toLowerCase();
              var rAssigned = String(mut.rowData['Assigned To'] || '').trim().toLowerCase();

              for (var r = data.length - 1; r >= 1; r--) {
                var rowVals = data[r].map(function(c) { return String(c || '').trim().toLowerCase(); });
                var matchDate = rDate ? (rowVals[0] === rDate || rowVals.indexOf(rDate) !== -1) : true;
                var matchItem = rItem ? (rowVals[1] === rItem || rowVals.indexOf(rItem) !== -1) : true;
                var matchAssigned = rAssigned ? (rowVals.indexOf(rAssigned) !== -1) : true;
                if (matchDate && matchItem && matchAssigned) {
                  sheet.deleteRow(r + 1);
                  sheetsModified[sheetName] = true;
                  appliedCount++;
                  break;
                }
              }
            }
          }
          break;

        case 'REPLACE_SWAP_TABLE':
        case 'REPLACE_TABLE_DATA':
        case 'SYNC_FULL_TABLE':
          if (sheet && (mut.rawGrid || mut.rows)) {
            var gridToWrite = [];
            var sheetHeaders = [];

            if (mut.rawGrid && Array.isArray(mut.rawGrid) && mut.rawGrid.length > 0) {
              gridToWrite = mut.rawGrid;
              sheetHeaders = mut.rawGrid[0];
            } else if (mut.headers && mut.rows && Array.isArray(mut.rows)) {
              sheetHeaders = mut.headers;
              gridToWrite = [sheetHeaders];
              for (var rIdx = 0; rIdx < mut.rows.length; rIdx++) {
                var rowObj = mut.rows[rIdx];
                var rowArr = sheetHeaders.map(function(h) {
                  var v = rowObj[h];
                  if (v === undefined || v === null) v = '';
                  return v;
                });
                gridToWrite.push(rowArr);
              }
            }

            if (gridToWrite.length > 0) {
              var targetRows = gridToWrite.length;
              var targetCols = gridToWrite[0].length;

              // Ensure sheet has enough columns and rows
              if (sheet.getMaxColumns() < targetCols) {
                sheet.insertColumnsAfter(sheet.getMaxColumns(), targetCols - sheet.getMaxColumns());
              }
              if (sheet.getMaxRows() < targetRows) {
                sheet.insertRowsAfter(sheet.getMaxRows(), targetRows - sheet.getMaxRows());
              }

              // Format date strings to Date objects if needed
              var lastDayReasonColIdx = -1;
              if (sheetName.toLowerCase() === 'employees' || sheetName === (typeof SHEET_EMPLOYEES !== 'undefined' ? SHEET_EMPLOYEES : 'Employees')) {
                for (var sh = 0; sh < sheetHeaders.length; sh++) {
                  if (String(sheetHeaders[sh] || '').toLowerCase().trim() === 'last day reason') {
                    lastDayReasonColIdx = sh;
                    break;
                  }
                }
              }

              var formattedGrid = gridToWrite.map(function(rowArr, rowNum) {
                if (rowNum === 0) return rowArr; // headers
                return rowArr.map(function(cellVal, cIdx) {
                  if (cIdx === lastDayReasonColIdx && typeof cellVal === 'string' && cellVal.trim() !== '') {
                    var ldrLower = cellVal.toLowerCase().trim();
                    if (ldrLower.indexOf('quit') !== -1) return 'Quit';
                    if (ldrLower.indexOf('fire') !== -1) return 'Fired';
                    if (ldrLower.indexOf('layoff') !== -1 || ldrLower.indexOf('laid') !== -1) return 'Layoff';
                    if (ldrLower.indexOf('resign') !== -1) return 'Resigned';
                    return 'Quit';
                  }
                  if (typeof cellVal === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(cellVal)) {
                    return typeof parseDateNoon === 'function' ? parseDateNoon(cellVal) : new Date(cellVal);
                  }
                  return cellVal;
                });
              });

              var currentLastRow = sheet.getLastRow();
              try {
                sheet.getRange(1, 1, targetRows, targetCols).setValues(formattedGrid);
              } catch (setValErr) {
                Logger.log('REPLACE_TABLE_DATA setValues error, falling back to safeWriteRowToTable: ' + setValErr);
                for (var fRow = 1; fRow < formattedGrid.length; fRow++) {
                  if (typeof safeWriteRowToTable === 'function') {
                    safeWriteRowToTable(sheet, fRow + 1, formattedGrid[fRow], sheetHeaders);
                  }
                }
              }
              if (currentLastRow > targetRows) {
                try {
                  sheet.getRange(targetRows + 1, 1, currentLastRow - targetRows, targetCols).clearContent();
                } catch (clearErr) {
                  Logger.log('REPLACE_TABLE_DATA clearContent warning: ' + clearErr);
                }
              }

              sheetsModified[sheetName] = true;
              appliedCount++;
            }
          }
          break;

        case 'RECALCULATE_CHANGE_OUT_DATES':
          try {
            if (typeof fixChangeOutDatesSilent === 'function') fixChangeOutDatesSilent();
            if (typeof fixBlanketChangeOutDatesSilent === 'function') fixBlanketChangeOutDatesSilent();
            if (typeof fixMackChangeOutDates === 'function') fixMackChangeOutDates();
            appliedCount++;
          } catch (eChg) {
            Logger.log('RECALCULATE_CHANGE_OUT_DATES error: ' + eChg);
          }
          break;

        default:
          Logger.log('applyBatchSyncMutations: Unknown mutation action ' + mut.action);
          break;
      }

    } catch (mutErr) {
      Logger.log('applyBatchSyncMutations error on mutation ' + m + ': ' + mutErr);
      errors.push('Error on mutation ' + m + ': ' + mutErr.toString());
    }
  }

  // Force spreadsheet to commit all pending writes
  SpreadsheetApp.flush();

  // Run crew synchronization & formatting if employee/job sheets were touched
  if (sheetsModified['Employees'] || sheetsModified['Job Tracking']) {
    try {
      if (typeof organizeAndFormatEmployeesSheet === 'function') organizeAndFormatEmployeesSheet(true);
      if (typeof syncCrews === 'function') syncCrews(true);
      if (typeof cleanupCompletedSecondaryJobNumbers === 'function') cleanupCompletedSecondaryJobNumbers(ss);
    } catch (syncErr) {
      Logger.log('applyBatchSyncMutations post-sync error: ' + syncErr);
    }
  }

  // Generate fresh snapshot ONCE (if requested for single-round-trip push)
  var snapshot = null;
  if (returnSnapshot) {
    try {
      snapshot = exportFullDatabaseSnapshot();
    } catch (expErr) {
      Logger.log('applyBatchSyncMutations snapshot export error: ' + expErr);
    }
  }

  // Save snapshot file to Drive ONLY if snapshot was generated
  if (snapshot) {
    try {
      generateAndStoreSyncSnapshot(snapshot);
    } catch (snapErr) {
      Logger.log('applyBatchSyncMutations Drive snapshot error: ' + snapErr);
    }
  }

  return {
    status: errors.length === 0 ? 'ok' : 'error',
    success: errors.length === 0,
    appliedCount: appliedCount,
    errors: errors,
    snapshot: snapshot
  };
}

/**
 * Web App GET endpoint: Handles snapshot requests from the Tauri Desktop App.
 */
function doGet(e) {
  var action = (e && e.parameter && e.parameter.action) || 'getSnapshot';

  if (action === 'ping') {
    return ContentService.createTextOutput(JSON.stringify({
      status: 'ok',
      serverTime: new Date().toISOString()
    })).setMimeType(ContentService.MimeType.JSON);
  }

  if (action === 'applyMutations') {
    try {
      var mutationsJson = (e && e.parameter && e.parameter.mutations) || '[]';
      var mutations = JSON.parse(mutationsJson);
      var returnSnap = (e && e.parameter && e.parameter.returnSnapshot) === 'true';
      var force = (e && e.parameter && e.parameter.force) === 'true';
      var detectConflicts = (e && e.parameter && e.parameter.detectConflicts) !== 'false';
      var result = applyBatchSyncMutations(mutations, returnSnap, { detectConflicts: detectConflicts, force: force });
      return ContentService.createTextOutput(JSON.stringify(result))
        .setMimeType(ContentService.MimeType.JSON);
    } catch (mutErr) {
      return ContentService.createTextOutput(JSON.stringify({
        status: 'error',
        success: false,
        error: mutErr.toString()
      })).setMimeType(ContentService.MimeType.JSON);
    }
  }

  // Return full database snapshot
  try {
    var snapshot = exportFullDatabaseSnapshot();
    return ContentService.createTextOutput(JSON.stringify(snapshot))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({
      status: 'error',
      error: err.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Web App POST endpoint: Handles batch mutation pushes from the Tauri Desktop App.
 */
function doPost(e) {
  try {
    var rawBody = e.postData ? e.postData.contents : '{}';
    var payload = JSON.parse(rawBody);
    var action = payload.action || 'applyMutations';

    if (action === 'applyMutations' || action === 'sync') {
      var returnSnap = payload.returnSnapshot === true;
      var options = {
        detectConflicts: payload.detectConflicts !== false,
        force: payload.force === true
      };
      var result = applyBatchSyncMutations(payload.mutations || [], returnSnap, options);
      return ContentService.createTextOutput(JSON.stringify(result))
        .setMimeType(ContentService.MimeType.JSON);
    }

    if (action === 'getSnapshot') {
      var snapshot = exportFullDatabaseSnapshot();
      return ContentService.createTextOutput(JSON.stringify(snapshot))
        .setMimeType(ContentService.MimeType.JSON);
    }

    return ContentService.createTextOutput(JSON.stringify({
      error: 'Unknown action: ' + action
    })).setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({
      error: err.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Menu item to manually export/update the offline sync snapshot.
 */
function menuExportSyncSnapshot() {
  var ui = SpreadsheetApp.getUi();
  try {
    var file = generateAndStoreSyncSnapshot();
    if (file) {
      ui.alert('✅ Offline Snapshot Created', 'The sync snapshot for the Tauri Desktop App has been updated in Google Drive:\n\n' + file.getName() + '\n\nUpdated: ' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'MM/dd/yyyy hh:mm a'), ui.ButtonSet.OK);
    } else {
      ui.alert('❌ Error', 'Could not create sync snapshot.', ui.ButtonSet.OK);
    }
  } catch (e) {
    ui.alert('❌ Error', 'Error creating sync snapshot: ' + e.toString(), ui.ButtonSet.OK);
  }
}
