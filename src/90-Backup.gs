/**
 * Glove Manager – Backup Functions
 *
 * Functions for creating and managing backups of the spreadsheet.
 */

/**
 * Creates a timestamped backup copy of the spreadsheet.
 * Saves a copy to a "Glove Manager Backups" folder in Google Drive with timestamp.
 */
function createBackupSnapshot() {
  var ui = SpreadsheetApp.getUi();

  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var ssName = ss.getName();

    // Create timestamp for the backup name
    var now = new Date();
    var timestamp = Utilities.formatDate(now, ss.getSpreadsheetTimeZone(), 'yyyy-MM-dd_HH-mm-ss');
    var backupName = ssName + ' - Backup ' + timestamp;

    // Show progress message
    ui.alert('Creating Backup', 'Creating backup snapshot...\nThis may take a moment.', ui.ButtonSet.OK);

    // Get or create the backup folder
    var backupFolder = getOrCreateBackupFolder();

    // Make a copy of the spreadsheet
    var backupFile = DriveApp.getFileById(ss.getId()).makeCopy(backupName, backupFolder);

    // Get the backup URL
    var backupUrl = backupFile.getUrl();

    // Log the backup
    logEvent('Backup created: ' + backupName, 'INFO');

    // Show success message with link
    var htmlOutput = HtmlService
      .createHtmlOutput(
        '<div style="font-family: Arial, sans-serif; padding: 20px;">' +
        '<h2 style="color: #2e7d32;">✅ Backup Created Successfully!</h2>' +
        '<p><strong>Name:</strong> ' + backupName + '</p>' +
        '<p><strong>Location:</strong> Google Drive > ' + BACKUP_FOLDER_NAME + '</p>' +
        '<p><strong>Time:</strong> ' + Utilities.formatDate(now, ss.getSpreadsheetTimeZone(), 'MM/dd/yyyy hh:mm:ss a') + '</p>' +
        '<br>' +
        '<a href="' + backupUrl + '" target="_blank" style="background-color: #1a73e8; color: white; padding: 10px 20px; text-decoration: none; border-radius: 4px;">Open Backup</a>' +
        '&nbsp;&nbsp;' +
        '<a href="' + backupFolder.getUrl() + '" target="_blank" style="background-color: #5f6368; color: white; padding: 10px 20px; text-decoration: none; border-radius: 4px;">View All Backups</a>' +
        '</div>'
      )
      .setWidth(450)
      .setHeight(250);

    ui.showModalDialog(htmlOutput, 'Backup Complete');

    return backupFile;

  } catch (e) {
    logEvent('Backup failed: ' + e, 'ERROR');
    ui.alert('❌ Backup Failed', 'Error creating backup: ' + e.message, ui.ButtonSet.OK);
    return null;
  }
}

/**
 * Gets the backup folder, creating it if it doesn't exist.
 * @return {Folder} The backup folder
 */
function getOrCreateBackupFolder() {
  var folders = DriveApp.getFoldersByName(BACKUP_FOLDER_NAME);

  if (folders.hasNext()) {
    return folders.next();
  } else {
    // Create the folder
    var newFolder = DriveApp.createFolder(BACKUP_FOLDER_NAME);
    Logger.log('Created backup folder: ' + BACKUP_FOLDER_NAME);
    return newFolder;
  }
}

/**
 * Opens the backup folder in a new tab.
 */
function openBackupFolder() {
  var ui = SpreadsheetApp.getUi();

  try {
    var backupFolder = getOrCreateBackupFolder();
    var folderUrl = backupFolder.getUrl();

    var htmlOutput = HtmlService
      .createHtmlOutput(
        '<script>window.open("' + folderUrl + '", "_blank");google.script.host.close();</script>' +
        '<p>Opening backup folder...</p>' +
        '<p>If the folder does not open, <a href="' + folderUrl + '" target="_blank">click here</a>.</p>'
      )
      .setWidth(300)
      .setHeight(100);

    ui.showModalDialog(htmlOutput, 'Opening Backup Folder');

  } catch (e) {
    ui.alert('❌ Error', 'Could not open backup folder: ' + e.message, ui.ButtonSet.OK);
  }
}

