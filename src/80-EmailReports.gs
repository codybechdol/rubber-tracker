/**
 * 80-EmailReports.gs - Decommissioned Legacy Email Reports
 *
 * NOTE: Weekly safety email summaries and status reports have been transitioned
 * entirely to the Safety Assistant Desktop App (Field Edition).
 *
 * In accordance with the Single Source of Truth rule, Google Sheets serves strictly
 * as a cloud data repository. All reporting, notifications, and operational workflows
 * originate directly from the Desktop App.
 *
 * This file provides self-decommissioning cleanup functions to automatically remove
 * any legacy time-driven weekly email triggers from the Apps Script project so that
 * no orphaned triggers fire on Monday mornings.
 */

/**
 * Removes all active weekly email report triggers and deletes stored schedule properties.
 *
 * @param {boolean} [silent=true] If false, shows UI alert.
 * @return {number} Number of triggers deleted.
 */
function disableAndRemoveWeeklyEmailTriggers(silent) {
  var isSilent = (silent !== false);
  var removed = 0;

  try {
    var triggers = ScriptApp.getProjectTriggers();
    triggers.forEach(function(trigger) {
      try {
        var fn = trigger.getHandlerFunction();
        if (fn === 'automatedWeeklyEmailJob' || fn === 'sendEmailReport') {
          ScriptApp.deleteTrigger(trigger);
          removed++;
        }
      } catch (triggerErr) {
        Logger.log('Warning deleting trigger: ' + triggerErr);
      }
    });

    // Delete schedule properties
    var props = PropertiesService.getScriptProperties();
    props.deleteProperty('WEEKLY_EMAIL_SCHEDULE');
    props.deleteProperty('WEEKLY_EMAIL_LAST_SENT');

    if (removed > 0) {
      Logger.log('disableAndRemoveWeeklyEmailTriggers: Removed ' + removed + ' legacy weekly email trigger(s).');
      if (typeof logEvent === 'function') {
        logEvent('Removed ' + removed + ' legacy weekly email trigger(s) (transitioned to Desktop App)', 'INFO');
      }
    }

    if (!isSilent) {
      try {
        SpreadsheetApp.getUi().alert(
          '✅ Weekly Email Reports Decommissioned\n\n' +
          (removed > 0 ? ('Successfully removed ' + removed + ' scheduled trigger(s).\n\n') : 'No active scheduled email triggers found.\n\n') +
          'Weekly Summary and Monday Briefing reports are now managed directly in the Safety Assistant Desktop App.'
        );
      } catch (uiErr) {
        // Ignore UI error if non-interactive
      }
    }
  } catch (err) {
    Logger.log('Error in disableAndRemoveWeeklyEmailTriggers: ' + err);
  }

  return removed;
}

/**
 * Legacy handler called by any existing time-driven trigger.
 * Self-decommissions the trigger and exits without sending emails.
 */
// eslint-disable-next-line no-unused-vars
function automatedWeeklyEmailJob() {
  Logger.log('automatedWeeklyEmailJob invoked: Decommissioning trigger in favor of Desktop App...');
  disableAndRemoveWeeklyEmailTriggers(true);
}

/**
 * Legacy manual trigger stub.
 */
// eslint-disable-next-line no-unused-vars
function sendEmailReport() {
  disableAndRemoveWeeklyEmailTriggers(false);
}

/**
 * Legacy stub for trigger removal.
 */
// eslint-disable-next-line no-unused-vars
function removeEmailTrigger(silent) {
  return disableAndRemoveWeeklyEmailTriggers(silent);
}

/**
 * Legacy stub for trigger creation.
 */
// eslint-disable-next-line no-unused-vars
function createWeeklyEmailTrigger() {
  try {
    SpreadsheetApp.getUi().alert(
      'ℹ️ Notice: Weekly Reports Moved to Desktop App\n\n' +
      'Automated email reports from Google Sheets have been retired.\n\n' +
      'Please use the Weekly Summary / Monday Briefing workspace in the Safety Assistant Desktop App to view, print, or email weekly status reports.'
    );
  } catch (e) {
    Logger.log('createWeeklyEmailTrigger disabled.');
  }
}

/**
 * Legacy stub for report config.
 */
// eslint-disable-next-line no-unused-vars
function setupEmailReportConfig() {
  try {
    SpreadsheetApp.getUi().alert(
      'ℹ️ Email Reports Transitioned to Desktop App\n\n' +
      'Configuration and delivery of Weekly Summaries is now handled within the Safety Assistant Desktop App.'
    );
  } catch (e) {}
}

// eslint-disable-next-line no-unused-vars
function openEmailReportConfig() {
  setupEmailReportConfig();
}

// eslint-disable-next-line no-unused-vars
function previewEmailReport() {
  try {
    SpreadsheetApp.getUi().alert(
      'ℹ️ Weekly Summary Preview\n\n' +
      'Weekly reports have moved to the Safety Assistant Desktop App, featuring interactive drill-downs, compliance tracking, and PDF export.'
    );
  } catch (e) {}
}

// eslint-disable-next-line no-unused-vars
function showScheduleWeeklyEmailDialog() {
  createWeeklyEmailTrigger();
}

// eslint-disable-next-line no-unused-vars
function getWeeklyEmailScheduleStatus() {
  return {
    isScheduled: false,
    configuredDay: 'NONE',
    configuredHour: 0,
    dayName: 'Decommissioned',
    hourFormatted: 'N/A',
    lastSent: '',
    recipients: []
  };
}
