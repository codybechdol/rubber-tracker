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
 *
 * @return {Object} The complete database snapshot
 */
function exportFullDatabaseSnapshot() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var timestamp = new Date();

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
    { key: 'training_tracking', name: 'Training Tracking' }
  ];

  var tables = {};

  for (var i = 0; i < sheetConfigs.length; i++) {
    var cfg = sheetConfigs[i];
    var sheet = ss.getSheetByName(cfg.name);
    if (!sheet || sheet.getLastRow() < 1) {
      tables[cfg.key] = { name: cfg.name, headers: [], rows: [] };
      continue;
    }

    var lastRow = sheet.getLastRow();
    var lastCol = sheet.getLastColumn();
    var data = sheet.getRange(1, 1, lastRow, lastCol).getValues();
    var displayData = sheet.getRange(1, 1, lastRow, lastCol).getDisplayValues();

    var headers = data[0].map(function(h) { return String(h || '').trim(); });
    var rows = [];

    for (var r = 1; r < data.length; r++) {
      var rowObj = { _rowIdx: r + 1 };
      for (var c = 0; c < headers.length; c++) {
        var hName = headers[c];
        if (!hName) continue;
        var rawVal = data[r][c];
        var dispVal = displayData[r][c];

        // Format dates as ISO strings or YYYY-MM-DD
        if (rawVal instanceof Date) {
          rowObj[hName] = dispVal; // Use display value for clean UI representation
          rowObj[hName + '_raw'] = rawVal.toISOString();
        } else {
          rowObj[hName] = rawVal;
        }
      }
      rows.push(rowObj);
    }

    tables[cfg.key] = {
      name: cfg.name,
      headers: headers,
      rows: rows,
      rawGrid: displayData,
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

  return {
    version: '2026.1.0',
    spreadsheetId: ss.getId(),
    spreadsheetName: ss.getName(),
    exportedAt: timestamp.toISOString(),
    timezone: ss.getSpreadsheetTimeZone(),
    configs: {
      holidays: holidays,
      workSchedule: workSchedule,
      driveTimeMap: driveTimeMap
    },
    tables: tables
  };
}

/**
 * Generates the offline sync snapshot and saves it as a JSON file in the Drive Backup folder.
 * Called automatically every time "Save & Backup" runs in Google Sheets.
 *
 * @return {File|null} The saved snapshot file in Google Drive
 */
function generateAndStoreSyncSnapshot() {
  try {
    var startTime = new Date().getTime();
    var snapshot = exportFullDatabaseSnapshot();
    var jsonStr = JSON.stringify(snapshot, null, 2);

    // Save snapshot to backup folder
    var folder = getOrCreateBackupFolder();
    var files = folder.getFilesByName(SYNC_SNAPSHOT_FILENAME);
    var file;

    if (files.hasNext()) {
      file = files.next();
      file.setContent(jsonStr);
      Logger.log('generateAndStoreSyncSnapshot: Updated existing ' + SYNC_SNAPSHOT_FILENAME);
    } else {
      file = folder.createFile(SYNC_SNAPSHOT_FILENAME, jsonStr, MimeType.PLAIN_TEXT);
      Logger.log('generateAndStoreSyncSnapshot: Created new ' + SYNC_SNAPSHOT_FILENAME);
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
function applyBatchSyncMutations(mutations) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!mutations || !Array.isArray(mutations) || mutations.length === 0) {
    return { success: true, appliedCount: 0, errors: [] };
  }

  var appliedCount = 0;
  var errors = [];
  var sheetsModified = {};

  for (var m = 0; m < mutations.length; m++) {
    var mut = mutations[m];
    try {
      var sheetName = mut.sheetName;
      var sheet = ss.getSheetByName(sheetName);
      if (!sheet && mut.action !== 'TRIGGER_SYNC_CREWS' && mut.action !== 'SET_HOLIDAYS') {
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

              // If Date Assigned or Assigned To was edited on an inventory sheet
              if (isEquipmentSheet && (hLower.includes('assigned') || hLower === 'assigned to' || hLower === 'date assigned')) {
                // Trigger auto change-out date recalculation and location sync
                if (typeof fixChangeOutDatesSilent === 'function') fixChangeOutDatesSilent();
                if (typeof fixBlanketChangeOutDatesSilent === 'function') fixBlanketChangeOutDatesSilent();
                if (typeof fixMackChangeOutDates === 'function') fixMackChangeOutDates();
                if (typeof syncInventoryLocations === 'function') syncInventoryLocations();
              }

              var sheetLower = sheetName.toLowerCase();
              var isSwapSheet = sheetLower.includes('swap');

              if (isSwapSheet) {
                var isGlove = sheetLower.includes('glove');
                var isSleeve = sheetLower.includes('sleeve');
                var isBlanket = sheetLower.includes('blanket');

                var invSheet = null;
                if (isGlove) invSheet = ss.getSheetByName(typeof SHEET_GLOVES !== 'undefined' ? SHEET_GLOVES : 'Gloves');
                else if (isSleeve) invSheet = ss.getSheetByName(typeof SHEET_SLEEVES !== 'undefined' ? SHEET_SLEEVES : 'Sleeves');
                else if (isBlanket) invSheet = ss.getSheetByName(typeof SHEET_BLANKETS !== 'undefined' ? SHEET_BLANKETS : 'Blankets');

                // Column I is col 9 (Picked checkbox)
                if (mut.col === 9 || hLower.includes('picked') || mut.value === true || mut.value === 'TRUE' || mut.value === false || mut.value === 'FALSE') {
                  var isChecked = (mut.value === true || mut.value === 'TRUE' || mut.value === 'true');

                  // 1. Run standard Apps Script trigger handler
                  if (invSheet) {
                    try {
                      if ((isGlove || isSleeve) && typeof handlePickedCheckboxChange === 'function') {
                        handlePickedCheckboxChange(ss, sheet, invSheet, mut.row, mut.value, isGlove);
                      } else if (isBlanket && typeof handleBlanketPickedCheckboxChange === 'function') {
                        handleBlanketPickedCheckboxChange(ss, sheet, invSheet, mut.row, mut.value);
                      }
                    } catch (hErr) {
                      Logger.log('handlePickedCheckboxChange error: ' + hErr);
                    }
                  }

                  // 2. Direct guarantee update on swap sheet and inventory sheet
                  var empName = String(sheet.getRange(mut.row, 1).getValue() || '').trim();
                  var pickListNum = String(sheet.getRange(mut.row, 7).getValue() || '').trim();
                  var today = new Date();
                  var todayStr = Utilities.formatDate(today, ss.getSpreadsheetTimeZone(), 'yyyy-MM-dd');
                  var todayFormatted = Utilities.formatDate(today, ss.getSpreadsheetTimeZone(), 'MM/dd/yyyy');

                  sheet.getRange(mut.row, 8).setValue(isChecked ? 'Ready For Delivery 🚚' : 'In Stock ✅');

                  if (invSheet && pickListNum && pickListNum !== '—' && pickListNum !== '-') {
                    var invData = invSheet.getDataRange().getValues();
                    var invRowIdx = -1;
                    for (var rIdx = 1; rIdx < invData.length; rIdx++) {
                      var itm = String(invData[rIdx][0]).trim();
                      var esl = String(invData[rIdx][1] || '').trim();
                      if (itm === pickListNum || (esl && esl === pickListNum)) {
                        invRowIdx = rIdx + 1;
                        break;
                      }
                    }

                    if (invRowIdx !== -1) {
                      var colLoc = typeof COLS !== 'undefined' && COLS.INVENTORY ? COLS.INVENTORY.LOCATION : 7;
                      var colStat = typeof COLS !== 'undefined' && COLS.INVENTORY ? COLS.INVENTORY.STATUS : 8;
                      var colAssigned = typeof COLS !== 'undefined' && COLS.INVENTORY ? COLS.INVENTORY.ASSIGNED_TO : 9;
                      var colDate = typeof COLS !== 'undefined' && COLS.INVENTORY ? COLS.INVENTORY.DATE_ASSIGNED : 6;
                      var colChangeOut = typeof COLS !== 'undefined' && COLS.INVENTORY ? COLS.INVENTORY.CHANGE_OUT_DATE : 10;
                      var colPicked = typeof COLS !== 'undefined' && COLS.INVENTORY ? COLS.INVENTORY.PICKED_FOR : 11;

                      if (isChecked) {
                        invSheet.getRange(invRowIdx, colLoc).setValue("Cody's Truck");
                        invSheet.getRange(invRowIdx, colStat).setValue('Ready For Delivery');
                        invSheet.getRange(invRowIdx, colAssigned).setValue('Packed For Delivery');
                        invSheet.getRange(invRowIdx, colDate).setValue(todayFormatted);
                        invSheet.getRange(invRowIdx, colPicked).setValue(empName + ' Picked On ' + todayStr);

                        var chgDate = typeof calculateChangeOutDate === 'function' ? calculateChangeOutDate(today, "Cody's Truck", 'Packed For Delivery', isSleeve) : null;
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

                } else if (mut.col === 10 || hLower.includes('changed')) {
                  if (invSheet) {
                    var dVal = sheet.getRange(mut.row, mut.col).getValue();
                    try {
                      if ((isGlove || isSleeve) && typeof handleDateChangedEdit === 'function') {
                        handleDateChangedEdit(ss, sheet, invSheet, mut.row, dVal, isGlove);
                      } else if (isBlanket && typeof handleBlanketDateChangedEdit === 'function') {
                        handleBlanketDateChangedEdit(ss, sheet, invSheet, mut.row, dVal);
                      }
                    } catch (dErr) {
                      Logger.log('handleDateChangedEdit error: ' + dErr);
                    }
                  }
                }
              }
            } catch (swapErr) {
              Logger.log('applyBatchSyncMutations handler error: ' + swapErr);
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
              if (String(metaData[tm][0] || '').trim() === mut.taskId) {
                taskMetaSheet.getRange(tm + 1, 15).setValue(mut.status || 'Complete'); // Status (O)
                if (mut.completedDate) {
                  taskMetaSheet.getRange(tm + 1, 22).setValue(parseDateNoon(mut.completedDate) || new Date()); // CompletedDate (V)
                }
                sheetsModified['Task Metadata'] = true;
                appliedCount++;
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

        case 'TRIGGER_SYNC_CREWS':
          if (typeof syncCrews === 'function') {
            syncCrews(true);
            appliedCount++;
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

  // Run crew synchronization & completed secondary job cleanups if employee/job sheets were touched
  if (sheetsModified['Employees'] || sheetsModified['Job Tracking']) {
    try {
      if (typeof syncCrews === 'function') syncCrews(true);
      if (typeof cleanupCompletedSecondaryJobNumbers === 'function') cleanupCompletedSecondaryJobNumbers(ss);
    } catch (syncErr) {
      Logger.log('applyBatchSyncMutations post-sync error: ' + syncErr);
    }
  }

  // Regenerate snapshot file so next sync is instantly up-to-date
  generateAndStoreSyncSnapshot();

  return {
    success: errors.length === 0,
    appliedCount: appliedCount,
    errors: errors
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

  // Return full database snapshot
  try {
    var snapshot = exportFullDatabaseSnapshot();
    return ContentService.createTextOutput(JSON.stringify(snapshot))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({
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
    var action = payload.action || 'sync';

    if (action === 'applyMutations') {
      var result = applyBatchSyncMutations(payload.mutations || []);
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
