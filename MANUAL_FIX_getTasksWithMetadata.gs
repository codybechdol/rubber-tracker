/**
 * MANUAL FIX - Copy this ENTIRE function into Code.gs in the Apps Script editor
 * Replace the existing getTasksWithMetadata function
 *
 * This version stores data in ScriptProperties and returns a small confirmation,
 * which the client will then fetch separately. This bypasses the ~50KB transfer limit.
 */

// Find and replace the ENTIRE getTasksWithMetadata function (around line 6558) with this:

function getTasksWithMetadata() {
  Logger.log('=== getTasksWithMetadata START ===');

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var metadataSheet = ss.getSheetByName('Task Metadata');

  if (!metadataSheet) {
    Logger.log('getTasksWithMetadata: Task Metadata sheet not found');
    return { tasks: [], error: 'Task Metadata sheet not found. Please run "Generate Task Metadata" first.' };
  }

  // Read existing metadata
  var metadataData = metadataSheet.getDataRange().getValues();
  var headers = metadataData[0];
  Logger.log('getTasksWithMetadata: Found ' + (metadataData.length - 1) + ' metadata records');

  // Build column index map for metadata
  var colMap = {};
  for (var h = 0; h < headers.length; h++) {
    colMap[headers[h]] = h;
  }

  // Build metadata lookup by key (SourceSheet_SourceRow)
  var metadataLookup = {};
  var skippedUnknown = 0;
  for (var i = 1; i < metadataData.length; i++) {
    try {
      var row = metadataData[i];
      var sourceSheet = row[colMap['SourceSheet']];
      var sourceRow = row[colMap['SourceRow']];

      // Skip records with Unknown SourceSheet
      if (!sourceSheet || sourceSheet === 'Unknown') {
        skippedUnknown++;
        continue;
      }

      var key = sourceSheet + '_' + sourceRow;

      metadataLookup[key] = {
        taskID: row[colMap['TaskID']],
        employee: row[colMap['Employee']],
        taskType: row[colMap['TaskType']],
        itemType: row[colMap['ItemType']],
        currentItem: row[colMap['CurrentItem']],
        location: row[colMap['Location']],
        foreman: row[colMap['Foreman']],
        phoneNumber: row[colMap['PhoneNumber']],
        dueDate: row[colMap['DueDate']],
        scheduledDate: row[colMap['ScheduledDate']],
        startTime: row[colMap['StartTime']],
        endTime: row[colMap['EndTime']],
        status: row[colMap['Status']],
        notifiedDate: row[colMap['NotifiedDate']],
        scheduledClassDate: row[colMap['ScheduledClassDate']],
        classType: row[colMap['ClassType']],
        isOffice: row[colMap['IsOffice']],
        isRegistered: row[colMap['IsRegistered']],
        isDeclined: row[colMap['IsDeclined']],
        completedDate: row[colMap['CompletedDate']],
        notes: row[colMap['Notes']],
        createdDate: row[colMap['CreatedDate']],
        lastModified: row[colMap['LastModified']],
        metadataRow: i + 1,
        sourceSheet: sourceSheet,
        sourceRow: sourceRow
      };
    } catch (e) {
      Logger.log('getTasksWithMetadata: Error processing metadata row ' + (i + 1) + ': ' + e);
    }
  }

  Logger.log('getTasksWithMetadata: Built metadata lookup with ' + Object.keys(metadataLookup).length + ' entries');
  if (skippedUnknown > 0) {
    Logger.log('getTasksWithMetadata: Skipped ' + skippedUnknown + ' records with Unknown SourceSheet');
  }

  // Collect tasks from source sheets and enrich with metadata
  var enrichedTasks = collectAndGroupTasks(metadataLookup);

  Logger.log('getTasksWithMetadata: Returning ' + enrichedTasks.length + ' enriched tasks');

  try {
    // Get last generated date safely
    var lastGenerated = new Date();
    try {
      var createdDateCol = colMap['CreatedDate'] || colMap['LastModified'] || 24;
      var dateValue = metadataSheet.getRange(2, createdDateCol).getValue();
      if (dateValue && dateValue instanceof Date && !isNaN(dateValue.getTime())) {
        lastGenerated = dateValue;
      }
    } catch (dateErr) {
      Logger.log('getTasksWithMetadata: Could not get lastGenerated date: ' + dateErr);
    }

    // Serialize tasks to minimal format
    var serializedTasks = enrichedTasks.map(function(task, index) {
      return {
        taskKey: task.sheetName + '_' + task.rowIndex,
        idx: index,
        emp: task.employee || '',
        type: task.taskType || '',
        item: task.itemType || '',
        loc: task.location || '',
        phone: task.phoneNumber || '',
        due: task.dueDate ? formatDate(task.dueDate) : '',
        sched: task.scheduledDate ? formatDate(task.scheduledDate) : '',
        start: task.startTime || '',
        end: task.endTime || '',
        stat: task.status || 'Pending',
        over: task.isOverdue ? 1 : 0,
        days: task.daysTillDue || 0,
        src: task.sheetName || '',
        row: task.rowIndex || 0,
        manual: task.isManualTask ? 1 : 0
      };
    });

    Logger.log('getTasksWithMetadata: Serialized ' + serializedTasks.length + ' tasks');

    var result = {
      tasks: serializedTasks,
      lastGenerated: formatDate(lastGenerated),
      totalTasks: serializedTasks.length
    };

    // Store in ScriptProperties (500KB limit) - MORE RELIABLE than direct return
    var jsonStr;
    try {
      jsonStr = JSON.stringify(result);
      Logger.log('getTasksWithMetadata: JSON size = ' + Math.round(jsonStr.length / 1024) + 'KB');

      var props = PropertiesService.getScriptProperties();
      props.setProperty('TASKS_DATA', jsonStr);
      props.setProperty('TASKS_TIMESTAMP', new Date().toISOString());
      Logger.log('getTasksWithMetadata: Successfully stored in ScriptProperties');

      // Return small confirmation - client will call getStoredTasks() to get data
      Logger.log('=== getTasksWithMetadata END ===');
      return {
        stored: true,
        totalTasks: result.totalTasks,
        lastGenerated: result.lastGenerated
      };
    } catch (storeErr) {
      Logger.log('getTasksWithMetadata: ScriptProperties failed: ' + storeErr + ' - trying direct return');
      Logger.log('=== getTasksWithMetadata END (direct) ===');
      return result;
    }

  } catch (e) {
    Logger.log('getTasksWithMetadata: FATAL ERROR: ' + e.message);
    throw e;
  }
}

/**
 * Retrieves task data stored in ScriptProperties.
 * Called by client after getTasksWithMetadata() confirms data is stored.
 */
function getStoredTasks() {
  try {
    var props = PropertiesService.getScriptProperties();
    var jsonStr = props.getProperty('TASKS_DATA');
    var timestamp = props.getProperty('TASKS_TIMESTAMP');

    if (!jsonStr) {
      Logger.log('getStoredTasks: No data found in ScriptProperties');
      return {
        error: true,
        message: 'No stored task data found. Please click Refresh to reload.',
        tasks: [],
        totalTasks: 0
      };
    }

    // Check if data is stale (older than 5 minutes)
    if (timestamp) {
      var storedTime = new Date(timestamp);
      var now = new Date();
      var ageMinutes = (now - storedTime) / 60000;
      if (ageMinutes > 5) {
        Logger.log('getStoredTasks: Data is ' + Math.round(ageMinutes) + ' minutes old - may be stale');
      }
    }

    var data = JSON.parse(jsonStr);
    Logger.log('getStoredTasks: Retrieved ' + data.totalTasks + ' tasks from ScriptProperties');
    return data;

  } catch (e) {
    Logger.log('getStoredTasks ERROR: ' + e.message);
    return {
      error: true,
      message: 'Failed to retrieve stored data: ' + e.message,
      tasks: [],
      totalTasks: 0
    };
  }
}
