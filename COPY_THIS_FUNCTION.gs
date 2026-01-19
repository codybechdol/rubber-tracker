/**
 * Generates To Do tasks from certification data.
 * @param {Array} certRows - Array of certification rows
 * @param {Array} selectedCertTypes - Cert types to create tasks for
 * @param {Object} empMap - Employee map for location lookup
 * @return {number} Number of tasks created
 */
function generateToDoTasksFromCerts(certRows, selectedCertTypes, empMap) {
  if (!selectedCertTypes || selectedCertTypes.length === 0) {
    Logger.log('No cert types selected for task generation');
    return 0;
  }

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var manualTasksSheet = ss.getSheetByName('Manual Tasks');

  if (!manualTasksSheet) {
    Logger.log('Manual Tasks sheet not found, skipping task generation');
    return 0;
  }

  var today = new Date();
  var tasksCreated = 0;

  for (var i = 0; i < certRows.length; i++) {
    var cert = certRows[i];

    // Skip if not in selected cert types
    if (selectedCertTypes.indexOf(cert.certType) === -1) {
      continue;
    }

    // Skip non-expiring certs
    if (cert.isNonExpiring) {
      continue;
    }

    // Create task if priority OR expiring soon
    var shouldCreateTask = false;
    var priority = 'Medium';

    if (cert.isPriority) {
      shouldCreateTask = true;
      priority = 'High';
    } else if (cert.expirationDate) {
      try {
        var expDate = new Date(cert.expirationDate);
        var daysUntil = Math.floor((expDate - today) / (1000 * 60 * 60 * 24));

        if (daysUntil <= 30) {
          shouldCreateTask = true;
          priority = daysUntil <= 7 ? 'High' : 'Medium';
        }
      } catch (e) {
        Logger.log('Error parsing date for cert: ' + cert.certType + ', date: ' + cert.expirationDate);
      }
    }

    if (shouldCreateTask) {
      var emp = empMap[cert.convertedName];
      var location = emp ? emp.location : cert.excelLocation;

      var taskRow = [
        location || '',
        priority,
        'Renew ' + cert.certType,
        cert.expirationDate || '',
        '', // Start Time
        '', // End Time
        1, // Estimated Time
        location || 'Helena', // Start Location
        location || '', // End Location
        'Employee: ' + cert.convertedName + ' | Current Expiration: ' + (cert.expirationDate || 'Unknown'),
        new Date(), // Date Added
        'Pending' // Status
      ];

      try {
        manualTasksSheet.appendRow(taskRow);
        tasksCreated++;
      } catch (e) {
        Logger.log('Error appending task row: ' + e);
      }
    }
  }

  Logger.log('Created ' + tasksCreated + ' To Do tasks from certifications');
  return tasksCreated;
}
