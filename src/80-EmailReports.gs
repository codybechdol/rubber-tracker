/**
 * Glove Manager – Enhanced Email Reports (Phase 3)
 * Glove Manager – Enhanced Email Reports (Phase 3)
 *
 * Premium HTML email reports with Google Charts visualizations
 * and admin-controlled per-recipient customization.
 *
 * Features:
 * - Admin config sheet for recipient preferences
 * - 9 report sections (Inventory, Purchase, Swaps, Certs, Training, Tasks, Calendar, Charts)
 * - Google Charts for visual impact
 * - Personalized emails per recipient
 *
 * Created: February 3, 2026
 */

// ============================================================================
// EMAIL REPORT CONFIG SHEET
// ============================================================================

/**
 * Section names for email report configuration.
 * Used as column headers in Email Report Config sheet.
 */
var EMAIL_REPORT_SECTIONS = [
  'Inventory',
  'Purchase Needs',
  'Glove Swaps',
  'Sleeve Swaps',
  'Certs',
  'Training',
  'Tasks',
  'Calendar',
  'Charts'
];

/**
 * Sets up the Email Report Config sheet.
 * Auto-imports existing Notification Emails with all sections enabled.
 * Menu item: Glove Manager → Email Reports → ⚙️ Configure Email Reports
 */
function setupEmailReportConfig() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var configSheet = ss.getSheetByName('Email Report Config');

  // Create sheet if it doesn't exist
  if (!configSheet) {
    configSheet = ss.insertSheet('Email Report Config');
  } else {
    // Ask before clearing existing config
    var ui = SpreadsheetApp.getUi();
    var response = ui.alert(
      'Email Report Config Exists',
      'Do you want to reset the configuration? This will clear existing settings.',
      ui.ButtonSet.YES_NO
    );
    if (response === ui.Button.NO) {
      // Just open the sheet
      ss.setActiveSheet(configSheet);
      return;
    }
    configSheet.clear();
  }

  // Set up headers
  var headers = ['Email Address'].concat(EMAIL_REPORT_SECTIONS);
  configSheet.getRange(1, 1, 1, headers.length).setValues([headers]);

  // Format header row
  var headerRange = configSheet.getRange(1, 1, 1, headers.length);
  headerRange.setFontWeight('bold');
  headerRange.setBackground('#1565c0');
  headerRange.setFontColor('white');
  headerRange.setHorizontalAlignment('center');

  // Set column widths
  configSheet.setColumnWidth(1, 250); // Email Address
  for (var i = 2; i <= headers.length; i++) {
    configSheet.setColumnWidth(i, 100);
  }

  // Freeze header row
  configSheet.setFrozenRows(1);

  // Add checkbox data validation for section columns
  var checkboxRule = SpreadsheetApp.newDataValidation()
    .requireCheckbox()
    .build();

  // Apply to 100 rows for future entries
  configSheet.getRange(2, 2, 100, EMAIL_REPORT_SECTIONS.length).setDataValidation(checkboxRule);

  // Auto-import existing Notification Emails
  var existingEmails = getNotificationRecipients();
  if (existingEmails.length > 0) {
    var importData = [];
    existingEmails.forEach(function(email) {
      // All sections enabled by default
      var row = [email];
      for (var s = 0; s < EMAIL_REPORT_SECTIONS.length; s++) {
        row.push(true);
      }
      importData.push(row);
    });

    configSheet.getRange(2, 1, importData.length, importData[0].length).setValues(importData);
  }

  // Add filter
  var dataRange = configSheet.getRange(1, 1, configSheet.getMaxRows(), headers.length);
  dataRange.createFilter();

  // Navigate to the sheet
  ss.setActiveSheet(configSheet);

  SpreadsheetApp.getUi().alert(
    '✅ Email Report Config Created!\n\n' +
    'Imported ' + existingEmails.length + ' email(s) from Notification Emails column.\n\n' +
    'Use checkboxes to control which report sections each recipient receives.'
  );
}

/**
 * Gets email report configuration for all recipients.
 * @return {Array} Array of {email, sections: {sectionName: boolean}}
 */
function getEmailReportConfig() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var configSheet = ss.getSheetByName('Email Report Config');

  if (!configSheet || configSheet.getLastRow() < 2) {
    // Fall back to old behavior - all recipients get all sections
    var emails = getNotificationRecipients();
    return emails.map(function(email) {
      var sections = {};
      EMAIL_REPORT_SECTIONS.forEach(function(s) {
        sections[s] = true;
      });
      return { email: email, sections: sections };
    });
  }

  var data = configSheet.getDataRange().getValues();
  var headers = data[0];
  var configs = [];

  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var email = (row[0] || '').toString().trim();
    if (!email || email.indexOf('@') === -1) continue;

    var sections = {};
    for (var j = 1; j < headers.length; j++) {
      var sectionName = headers[j];
      sections[sectionName] = row[j] === true || row[j] === 'TRUE';
    }

    configs.push({ email: email, sections: sections });
  }

  return configs;
}

/**
 * Opens the Email Report Config sheet.
 * Menu item: Glove Manager → Email Reports → ⚙️ Configure Email Reports
 */
function openEmailReportConfig() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var configSheet = ss.getSheetByName('Email Report Config');

  if (!configSheet) {
    setupEmailReportConfig();
  } else {
    ss.setActiveSheet(configSheet);
  }
}

// ============================================================================
// NOTIFICATION RECIPIENTS (Legacy support)
// ============================================================================

/**
 * Gets list of notification recipients from Employees sheet.
 * Returns array of unique email addresses from "Notification Emails" column.
 *
 * @return {Array} Array of email addresses
 */
function getNotificationRecipients() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var employeesSheet = ss.getSheetByName(SHEET_EMPLOYEES);

  if (!employeesSheet || employeesSheet.getLastRow() < 2) {
    return [];
  }

  var headers = employeesSheet.getRange(1, 1, 1, employeesSheet.getLastColumn()).getValues()[0];
  var notificationColIdx = -1;

  for (var i = 0; i < headers.length; i++) {
    if (String(headers[i]).toLowerCase().trim() === 'notification emails') {
      notificationColIdx = i;
      break;
    }
  }

  if (notificationColIdx === -1) {
    Logger.log('Notification Emails column not found');
    return [];
  }

  var data = employeesSheet.getRange(2, notificationColIdx + 1, employeesSheet.getLastRow() - 1, 1).getValues();
  var emailSet = {};

  data.forEach(function(row) {
    var email = (row[0] || '').toString().trim();
    if (email && email.indexOf('@') !== -1) {
      var emailStr = email.split(';').join(',');
      var emails = emailStr.split(',');
      emails.forEach(function(e) {
        var trimmed = e.trim();
        if (trimmed && trimmed.indexOf('@') !== -1) {
          emailSet[trimmed.toLowerCase()] = trimmed;
        }
      });
    }
  });

  return Object.values(emailSet);
}

// ============================================================================
// MAIN EMAIL SENDING FUNCTIONS
// ============================================================================

/**
 * Sends personalized email reports to all configured recipients.
 * Each recipient gets only the sections they're configured to receive.
 * Menu item: Glove Manager → Email Reports → Send Report Now
 */
function sendEmailReport() {
  try {
    var configs = getEmailReportConfig();

    if (!configs || configs.length === 0) {
      logEvent('sendEmailReport: No recipients configured, skipping email.');
      try {
        SpreadsheetApp.getUi().alert(
          'ℹ️ No Recipients Configured\n\n' +
          'To send email reports:\n' +
          '1. Go to Email Reports → ⚙️ Configure Email Reports\n' +
          '2. Add email addresses and select which sections to send'
        );
      } catch (e) {
        // Ignore UI error if running from trigger
      }
      return;
    }

    logEvent('Sending personalized email reports to ' + configs.length + ' recipient(s)...');

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var timezone = ss.getSpreadsheetTimeZone();
    var now = new Date();
    var dateStr = Utilities.formatDate(now, timezone, 'MM/dd/yyyy');

    var subject = '🛡️ Safety Assistant Weekly Report - ' + dateStr;

    // Pre-generate charts (expensive operation, do once)
    var chartImages = generateChartImages(ss);

    var successCount = 0;
    var failCount = 0;

    configs.forEach(function(config) {
      try {
        var htmlBody = buildPremiumEmailHtml(config.email, config.sections, chartImages, false); // false = use CID for email

        // Build inline images object for charts
        var inlineImages = {};
        if (config.sections['Charts'] && chartImages) {
          if (chartImages.taskStatusChart) {
            inlineImages.taskStatusChart = chartImages.taskStatusChart;
          }
          if (chartImages.locationChart) {
            inlineImages.locationChart = chartImages.locationChart;
          }
        }

        MailApp.sendEmail({
          to: config.email,
          subject: subject,
          htmlBody: htmlBody,
          inlineImages: inlineImages
        });

        logEvent('Email report sent to: ' + config.email);
        successCount++;
      } catch (emailError) {
        logEvent('Failed to send email to ' + config.email + ': ' + emailError, 'ERROR');
        failCount++;
      }
    });

    logEvent('Email report sending completed. Success: ' + successCount + ', Failed: ' + failCount);

    try {
      SpreadsheetApp.getUi().alert(
        '✅ Email Reports Sent!\n\n' +
        'Successfully sent: ' + successCount + '\n' +
        'Failed: ' + failCount
      );
    } catch (e) {
      // Ignore UI error if running from trigger
    }

  } catch (e) {
    logEvent('Error in sendEmailReport: ' + e, 'ERROR');
    throw e;
  }
}

/**
 * Previews the email report for the current user.
 * Menu item: Glove Manager → Email Reports → 👁️ Preview My Report
 */
function previewEmailReport() {
  var userEmail = Session.getActiveUser().getEmail();
  var configs = getEmailReportConfig();

  // Find config for current user, or use all sections as preview
  var userConfig = null;
  for (var i = 0; i < configs.length; i++) {
    if (configs[i].email.toLowerCase() === userEmail.toLowerCase()) {
      userConfig = configs[i];
      break;
    }
  }

  // Default to all sections for preview
  var sections = {};
  EMAIL_REPORT_SECTIONS.forEach(function(s) {
    sections[s] = true;
  });

  if (userConfig) {
    sections = userConfig.sections;
  }

  var chartImages = generateChartImages(SpreadsheetApp.getActiveSpreadsheet());
  var html = buildPremiumEmailHtml(userEmail, sections, chartImages, true); // true = use base64 for preview

  // Show in modal dialog
  var htmlOutput = HtmlService.createHtmlOutput(html)
    .setWidth(950)
    .setHeight(700);

  SpreadsheetApp.getUi().showModalDialog(htmlOutput, '👁️ Email Report Preview');
}

// ============================================================================
// PREMIUM EMAIL HTML BUILDER
// ============================================================================

/**
 * Premium email styles for consistent look.
 * Sleek, professional design with sharp edges and bold color accents.
 */
function getPremiumStyles() {
  return {
    // Primary colors
    primaryBg: '#1565c0',
    primaryGradient: 'linear-gradient(90deg, #0d47a1 0%, #1565c0 100%)',
    primaryColor: '#ffffff',

    // Section colors
    headerBg: '#1565c0',
    headerColor: '#ffffff',
    subHeaderBg: '#f8f9fa',

    // Status colors
    urgentBg: '#fff5f5',
    urgentColor: '#c62828',
    urgentBorder: '#c62828',

    warningBg: '#fffaf0',
    warningColor: '#e65100',
    warningBorder: '#e65100',

    successBg: '#f0fff4',
    successColor: '#2e7d32',
    successBorder: '#2e7d32',

    infoBg: '#f0f7ff',
    infoColor: '#1565c0',
    infoBorder: '#1565c0',

    // Table colors
    altRowBg: '#f8f9fa',
    borderColor: '#dee2e6',

    // Card styling - sharp, professional
    cardShadow: '0 1px 3px rgba(0,0,0,0.12), 0 1px 2px rgba(0,0,0,0.08)',
    cardRadius: '4px'
  };
}

/**
 * Builds premium HTML email content for a specific recipient.
 *
 * @param {string} recipientEmail - Recipient's email address
 * @param {Object} sections - Object with section names as keys, boolean values
 * @param {Object} chartImages - Pre-generated chart blob images
 * @param {boolean} useBase64 - If true, embed charts as base64 (for preview). If false, use CID (for email).
 * @return {string} Complete HTML email body
 */
function buildPremiumEmailHtml(recipientEmail, sections, chartImages, useBase64) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var timezone = ss.getSpreadsheetTimeZone();
  var now = new Date();
  var dateStr = Utilities.formatDate(now, timezone, 'MMMM d, yyyy');
  var styles = getPremiumStyles();

  var html = '<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>';
  html += '<body style="font-family: -apple-system, BlinkMacSystemFont, \'Segoe UI\', Roboto, \'Helvetica Neue\', Arial, sans-serif; max-width: 900px; margin: 0 auto; padding: 20px; background-color: #eef1f5;">';

  // Professional header with sharp edges
  html += '<div style="background: ' + styles.primaryGradient + '; color: white; padding: 24px 32px; border-radius: ' + styles.cardRadius + '; margin-bottom: 20px; box-shadow: ' + styles.cardShadow + '; border-left: 4px solid #0d47a1;">';
  html += '<table style="width: 100%; border-collapse: collapse;"><tr>';
  html += '<td style="vertical-align: middle;">';
  html += '<h1 style="margin: 0; font-size: 24px; font-weight: 600; letter-spacing: -0.5px;">SAFETY ASSISTANT</h1>';
  html += '<p style="margin: 4px 0 0 0; font-size: 14px; opacity: 0.9; font-weight: 400;">Weekly Status Report</p>';
  html += '</td>';
  html += '<td style="text-align: right; vertical-align: middle;">';
  html += '<p style="margin: 0; font-size: 13px; opacity: 0.8;">' + dateStr + '</p>';
  html += '</td>';
  html += '</tr></table>';
  html += '</div>';

  // Quick stats summary bar
  html += buildQuickStatsSummary(ss, styles);

  // Build each enabled section
  if (sections['Inventory']) {
    html += buildInventorySummarySection(ss, styles);
  }

  if (sections['Purchase Needs']) {
    html += buildPurchaseNeedsSectionEnhanced(ss, styles);
  }

  if (sections['Glove Swaps']) {
    html += buildSwapsSummarySection(ss, 'Glove Swaps', styles);
  }

  if (sections['Sleeve Swaps']) {
    html += buildSwapsSummarySection(ss, 'Sleeve Swaps', styles);
  }

  if (sections['Certs']) {
    html += buildExpiringCertsSection(ss, styles);
  }

  if (sections['Training']) {
    html += buildTrainingSummarySection(ss, styles);
  }

  if (sections['Tasks']) {
    html += buildTaskSummarySection(ss, styles);
  }

  if (sections['Calendar']) {
    html += buildCalendarSection(ss, styles);
  }

  if (sections['Charts']) {
    html += buildChartsSection(chartImages, styles, useBase64);
  }

  // Footer - professional and minimal
  html += '<div style="text-align: center; padding: 20px; color: #888; font-size: 11px; border-top: 1px solid #dee2e6; margin-top: 20px;">';
  html += '<p style="margin: 0;">Auto-generated by Safety Assistant</p>';
  html += '<p style="margin: 8px 0 0 0;"><a href="' + ss.getUrl() + '" style="color: ' + styles.primaryBg + '; text-decoration: none; font-weight: 500;">Open Spreadsheet →</a></p>';
  if (recipientEmail) {
    html += '<p style="margin: 10px 0 0 0; font-size: 10px; color: #aaa;">' + recipientEmail + '</p>';
  }
  html += '</div>';

  html += '</body></html>';

  return html;
}

// ============================================================================
// QUICK STATS SUMMARY
// ============================================================================

/**
 * Builds a quick stats summary bar at the top of the email.
 */
function buildQuickStatsSummary(ss, styles) {
  var stats = {
    pendingTasks: 0,
    overdueTasks: 0,
    swapsDue: 0,
    certExpiring: 0
  };

  // Get task statistics
  try {
    var taskStats = getTaskStatistics();
    if (!taskStats.error) {
      stats.pendingTasks = taskStats.pendingTasks || 0;
      stats.overdueTasks = taskStats.overdueTasks || 0;
    }
  } catch (e) {
    Logger.log('Error getting task stats: ' + e);
  }

  // Count swaps due this week
  try {
    var gloveSwaps = ss.getSheetByName('Glove Swaps');
    var sleeveSwaps = ss.getSheetByName('Sleeve Swaps');

    if (gloveSwaps && gloveSwaps.getLastRow() > 1) {
      stats.swapsDue += countSwapsDueThisWeek(gloveSwaps);
    }
    if (sleeveSwaps && sleeveSwaps.getLastRow() > 1) {
      stats.swapsDue += countSwapsDueThisWeek(sleeveSwaps);
    }
  } catch (e) {
    Logger.log('Error counting swaps: ' + e);
  }

  // Count expiring certs
  try {
    var expiringCerts = ss.getSheetByName('Expiring Certs');
    if (expiringCerts && expiringCerts.getLastRow() > 1) {
      stats.certExpiring = countExpiringCerts(expiringCerts);
    }
  } catch (e) {
    Logger.log('Error counting certs: ' + e);
  }

  var html = '<div style="display: flex; justify-content: space-around; margin-bottom: 24px; flex-wrap: wrap;">';

  // Stat cards
  html += buildStatCard('📋', 'Pending Tasks', stats.pendingTasks, styles.infoBg, styles.infoColor);
  html += buildStatCard('🔴', 'Overdue', stats.overdueTasks, styles.urgentBg, styles.urgentColor);
  html += buildStatCard('🔄', 'Swaps Due', stats.swapsDue, styles.warningBg, styles.warningColor);
  html += buildStatCard('📜', 'Certs Expiring', stats.certExpiring, stats.certExpiring > 0 ? styles.warningBg : styles.successBg, stats.certExpiring > 0 ? styles.warningColor : styles.successColor);

  html += '</div>';

  return html;
}

/**
 * Builds a single stat card.
 * Professional design with top accent border.
 */
function buildStatCard(icon, label, value, bgColor, textColor) {
  return '<div style="background: white; border-radius: 2px; padding: 16px 20px; text-align: center; min-width: 130px; margin: 4px; box-shadow: 0 1px 3px rgba(0,0,0,0.08); border-top: 3px solid ' + textColor + ';">' +
    '<div style="font-size: 28px; font-weight: 700; color: ' + textColor + '; line-height: 1;">' + value + '</div>' +
    '<div style="font-size: 11px; color: #666; margin-top: 6px; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 500;">' + label + '</div>' +
    '</div>';
}

/**
 * Counts swaps due within the next 7 days.
 */
function countSwapsDueThisWeek(sheet) {
  var data = sheet.getDataRange().getValues();
  var headers = data[0];
  var daysLeftCol = -1;

  for (var h = 0; h < headers.length; h++) {
    if (String(headers[h]).toLowerCase().indexOf('days left') !== -1) {
      daysLeftCol = h;
      break;
    }
  }

  if (daysLeftCol === -1) return 0;

  var count = 0;
  for (var i = 1; i < data.length; i++) {
    var daysLeft = parseInt(data[i][daysLeftCol], 10);
    if (!isNaN(daysLeft) && daysLeft <= 7 && daysLeft >= 0) {
      count++;
    }
  }

  return count;
}

/**
 * Counts certs expiring within 90 days.
 */
function countExpiringCerts(sheet) {
  var data = sheet.getDataRange().getValues();
  if (data.length <= 1) return 0;

  var today = new Date();
  today.setHours(0, 0, 0, 0);
  var ninetyDays = new Date(today);
  ninetyDays.setDate(ninetyDays.getDate() + 90);

  var count = 0;
  // Assuming expiration date is in column 3 (index 2)
  for (var i = 1; i < data.length; i++) {
    var expDate = data[i][2];
    if (expDate instanceof Date && expDate <= ninetyDays) {
      count++;
    }
  }

  return count;
}

// ============================================================================
// SECTION BUILDERS
// ============================================================================

/**
 * Creates a section wrapper with consistent styling.
 * Professional design with left accent border.
 */
function buildSectionWrapper(title, icon, content, styles) {
  var html = '<div style="background: white; border-radius: ' + styles.cardRadius + '; margin-bottom: 16px; overflow: hidden; box-shadow: ' + styles.cardShadow + '; border-left: 3px solid ' + styles.primaryBg + ';">';
  html += '<div style="background: ' + styles.subHeaderBg + '; color: #1a1a2e; padding: 12px 20px; font-weight: 600; font-size: 14px; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 1px solid ' + styles.borderColor + ';">' + icon + '  ' + title + '</div>';
  html += '<div style="padding: 16px 20px;">' + content + '</div>';
  html += '</div>';
  return html;
}

/**
 * Builds inventory summary section.
 */
function buildInventorySummarySection(ss, styles) {
  var content = '';

  try {
    var inventoryItems = [
      { name: 'Gloves', label: '🧤 Gloves', sheetName: typeof SHEET_GLOVES !== 'undefined' ? SHEET_GLOVES : 'Gloves' },
      { name: 'Sleeves', label: '🦺 Sleeves', sheetName: typeof SHEET_SLEEVES !== 'undefined' ? SHEET_SLEEVES : 'Sleeves' },
      { name: 'Blankets', label: '🧱 Blankets', sheetName: typeof SHEET_BLANKETS !== 'undefined' ? SHEET_BLANKETS : 'Blankets' },
      { name: 'MACKs', label: '🧱 MACKs', sheetName: typeof SHEET_MACKS !== 'undefined' ? SHEET_MACKS : 'MACKs' },
      { name: 'HV Testers', label: '⚡ HV Testers', sheetName: typeof SHEET_HV_TESTERS !== 'undefined' ? SHEET_HV_TESTERS : 'HV Testers' },
      { name: 'Phasing Sets', label: '⚡ Phasing Sets', sheetName: typeof SHEET_PHASING_SETS !== 'undefined' ? SHEET_PHASING_SETS : 'Phasing Sets' },
      { name: 'Grounds', label: '⚡ Grounds', sheetName: typeof SHEET_GROUNDS !== 'undefined' ? SHEET_GROUNDS : 'Grounds' },
      { name: 'Hot Sticks', label: '🔴 Hot Sticks', sheetName: typeof SHEET_HOT_STICKS !== 'undefined' ? SHEET_HOT_STICKS : 'Hot Sticks' },
      { name: 'AED', label: '🏥 AED Units', sheetName: typeof SHEET_AED !== 'undefined' ? SHEET_AED : 'AED' }
    ];

    content += '<table style="width: 100%; border-collapse: collapse; font-size: 13px;">';
    content += '<tr style="background: ' + styles.subHeaderBg + ';">';
    content += '<th style="padding: 9px 10px; text-align: left; border-bottom: 2px solid ' + styles.borderColor + ';">Item Category</th>';
    content += '<th style="padding: 9px 10px; text-align: center; border-bottom: 2px solid ' + styles.borderColor + ';">Total</th>';
    content += '<th style="padding: 9px 10px; text-align: center; border-bottom: 2px solid ' + styles.borderColor + ';">Assigned / In Service</th>';
    content += '<th style="padding: 9px 10px; text-align: center; border-bottom: 2px solid ' + styles.borderColor + ';">On Shelf</th>';
    content += '<th style="padding: 9px 10px; text-align: center; border-bottom: 2px solid ' + styles.borderColor + ';">In Testing / Lab</th>';
    content += '</tr>';

    var rowIdx = 0;
    inventoryItems.forEach(function(item) {
      var sheet = ss.getSheetByName(item.sheetName);
      if (!sheet || sheet.getLastRow() < 2) return;

      var stats = getInventoryStats(sheet);
      var rowBg = (rowIdx % 2 === 1) ? ('background: ' + styles.altRowBg + ';') : '';

      content += '<tr style="' + rowBg + '">';
      content += '<td style="padding: 8px 10px; border-bottom: 1px solid ' + styles.borderColor + '; font-weight: 600;">' + item.label + '</td>';
      content += '<td style="padding: 8px 10px; text-align: center; border-bottom: 1px solid ' + styles.borderColor + '; font-weight: bold;">' + stats.total + '</td>';
      content += '<td style="padding: 8px 10px; text-align: center; border-bottom: 1px solid ' + styles.borderColor + '; color: ' + styles.successColor + '; font-weight: 600;">' + stats.assigned + '</td>';
      content += '<td style="padding: 8px 10px; text-align: center; border-bottom: 1px solid ' + styles.borderColor + '; color: ' + styles.infoColor + ';">' + stats.onShelf + '</td>';
      content += '<td style="padding: 8px 10px; text-align: center; border-bottom: 1px solid ' + styles.borderColor + '; color: ' + (stats.testing > 0 ? styles.warningColor : '#64748b') + ';">' + stats.testing + '</td>';
      content += '</tr>';
      rowIdx++;
    });

    content += '</table>';

  } catch (e) {
    content = '<p style="color: #666; text-align: center;">Unable to load inventory summary data.</p>';
    Logger.log('Error building inventory section: ' + e);
  }

  return buildSectionWrapper('Inventory Summary', '📊', content, styles);
}

/**
 * Gets inventory statistics from a sheet.
 */
function getInventoryStats(sheet) {
  if (!sheet || sheet.getLastRow() < 2) {
    return { total: 0, assigned: 0, onShelf: 0, testing: 0 };
  }

  var data = sheet.getDataRange().getValues();
  var headers = data[0];
  var statusCol = -1;

  for (var h = 0; h < headers.length; h++) {
    if (String(headers[h]).toLowerCase() === 'status') {
      statusCol = h;
      break;
    }
  }

  if (statusCol === -1) {
    return { total: data.length - 1, assigned: 0, onShelf: 0, testing: 0 };
  }

  var stats = { total: 0, assigned: 0, onShelf: 0, testing: 0 };

  for (var i = 1; i < data.length; i++) {
    var status = (data[i][statusCol] || '').toString().toLowerCase();
    if (!status) continue;

    stats.total++;

    if (status.indexOf('assigned') !== -1) {
      stats.assigned++;
    } else if (status.indexOf('shelf') !== -1) {
      stats.onShelf++;
    } else if (status.indexOf('testing') !== -1) {
      stats.testing++;
    }
  }

  return stats;
}

/**
 * Builds enhanced purchase needs section.
 */
function buildPurchaseNeedsSectionEnhanced(ss, styles) {
  var content = '';

  try {
    var sheet = ss.getSheetByName('Purchase Needs');
    if (!sheet || sheet.getLastRow() < 2) {
      content = '<p style="color: #666; text-align: center;">No purchase needs at this time. ✅</p>';
      return buildSectionWrapper('Purchase Needs', '🛒', content, styles);
    }

    var data = sheet.getDataRange().getValues();
    var headers = data[0];

    // Find column indices
    var colMap = {};
    for (var h = 0; h < headers.length; h++) {
      colMap[String(headers[h]).toLowerCase().trim()] = h;
    }

    var itemTypeCol = colMap['item type'] !== undefined ? colMap['item type'] : 0;
    var sizeCol = colMap['size'] !== undefined ? colMap['size'] : 1;
    var qtyCol = colMap['qty to order'] !== undefined ? colMap['qty to order'] : (colMap['quantity needed'] !== undefined ? colMap['quantity needed'] : 3);
    var statusCol = colMap['status'] !== undefined ? colMap['status'] : (colMap['status/notes'] !== undefined ? colMap['status/notes'] : 5);

    var needsOrder = [];

    for (var i = 1; i < data.length; i++) {
      var qty = parseInt(data[i][qtyCol], 10) || 0;
      if (qty > 0) {
        needsOrder.push({
          itemType: data[i][itemTypeCol] || '',
          size: data[i][sizeCol] || '',
          qty: qty,
          status: data[i][statusCol] || ''
        });
      }
    }

    if (needsOrder.length === 0) {
      content = '<p style="color: ' + styles.successColor + '; text-align: center; font-weight: 500;">✅ All inventory is stocked!</p>';
    } else {
      content += '<table style="width: 100%; border-collapse: collapse; font-size: 14px;">';
      content += '<tr style="background: ' + styles.subHeaderBg + ';">';
      content += '<th style="padding: 10px; text-align: left; border-bottom: 2px solid ' + styles.borderColor + ';">Item</th>';
      content += '<th style="padding: 10px; text-align: center; border-bottom: 2px solid ' + styles.borderColor + ';">Size</th>';
      content += '<th style="padding: 10px; text-align: center; border-bottom: 2px solid ' + styles.borderColor + ';">Qty Needed</th>';
      content += '<th style="padding: 10px; text-align: left; border-bottom: 2px solid ' + styles.borderColor + ';">Status</th>';
      content += '</tr>';

      needsOrder.forEach(function(item, idx) {
        var bgColor = idx % 2 === 1 ? styles.altRowBg : 'white';
        content += '<tr style="background: ' + bgColor + ';">';
        content += '<td style="padding: 10px; border-bottom: 1px solid ' + styles.borderColor + ';">' + item.itemType + '</td>';
        content += '<td style="padding: 10px; text-align: center; border-bottom: 1px solid ' + styles.borderColor + ';">' + item.size + '</td>';
        content += '<td style="padding: 10px; text-align: center; border-bottom: 1px solid ' + styles.borderColor + '; font-weight: bold; color: ' + styles.warningColor + ';">' + item.qty + '</td>';
        content += '<td style="padding: 10px; border-bottom: 1px solid ' + styles.borderColor + ';">' + item.status + '</td>';
        content += '</tr>';
      });

      content += '</table>';
    }

  } catch (e) {
    content = '<p style="color: #666; text-align: center;">Unable to load purchase needs data.</p>';
    Logger.log('Error building purchase needs section: ' + e);
  }

  return buildSectionWrapper('Purchase Needs', '🛒', content, styles);
}

/**
 * Builds swaps summary section.
 */
function buildSwapsSummarySection(ss, sheetName, styles) {
  var icon = sheetName === 'Glove Swaps' ? '🧤' : '💪';
  var content = '';

  try {
    var sheet = ss.getSheetByName(sheetName);
    if (!sheet || sheet.getLastRow() < 2) {
      content = '<p style="color: #666; text-align: center;">No swaps pending.</p>';
      return buildSectionWrapper(sheetName, icon, content, styles);
    }

    var data = sheet.getDataRange().getValues();
    var headers = data[0];

    // Find columns
    var empCol = 0, daysLeftCol = -1, statusCol = -1;
    for (var h = 0; h < headers.length; h++) {
      var hdr = String(headers[h]).toLowerCase();
      if (hdr.indexOf('days left') !== -1) daysLeftCol = h;
      if (hdr === 'status') statusCol = h;
    }

    // Categorize swaps
    var overdue = [], dueThisWeek = [], upcoming = [];

    for (var i = 1; i < data.length; i++) {
      var row = data[i];
      var employee = row[empCol] || '';
      if (!employee) continue;

      var daysLeft = daysLeftCol !== -1 ? parseInt(row[daysLeftCol], 10) : 999;
      var status = statusCol !== -1 ? (row[statusCol] || '').toString().toLowerCase() : '';

      // Skip completed
      if (status.indexOf('complete') !== -1 || status.indexOf('done') !== -1) continue;

      var item = { employee: employee, daysLeft: isNaN(daysLeft) ? 999 : daysLeft };

      if (item.daysLeft < 0) {
        overdue.push(item);
      } else if (item.daysLeft <= 7) {
        dueThisWeek.push(item);
      } else if (item.daysLeft <= 30) {
        upcoming.push(item);
      }
    }

    // Build summary
    if (overdue.length === 0 && dueThisWeek.length === 0 && upcoming.length === 0) {
      content = '<p style="color: ' + styles.successColor + '; text-align: center; font-weight: 500;">✓ All swaps up to date</p>';
    } else {
      content += '<div style="display: flex; gap: 12px; flex-wrap: wrap;">';

      if (overdue.length > 0) {
        content += '<div style="flex: 1; min-width: 180px; background: ' + styles.urgentBg + '; border-left: 3px solid ' + styles.urgentBorder + '; padding: 12px 14px;">';
        content += '<div style="font-weight: 600; color: ' + styles.urgentColor + '; margin-bottom: 8px; font-size: 12px; text-transform: uppercase; letter-spacing: 0.3px;">Overdue (' + overdue.length + ')</div>';
        overdue.slice(0, 5).forEach(function(item) {
          content += '<div style="font-size: 13px; padding: 3px 0; color: #333;">' + item.employee + ' <span style="color: ' + styles.urgentColor + '; font-weight: 500;">(' + Math.abs(item.daysLeft) + 'd)</span></div>';
        });
        if (overdue.length > 5) {
          content += '<div style="font-size: 12px; color: #888; margin-top: 6px;">+' + (overdue.length - 5) + ' more</div>';
        }
        content += '</div>';
      }

      if (dueThisWeek.length > 0) {
        content += '<div style="flex: 1; min-width: 180px; background: ' + styles.warningBg + '; border-left: 3px solid ' + styles.warningBorder + '; padding: 12px 14px;">';
        content += '<div style="font-weight: 600; color: ' + styles.warningColor + '; margin-bottom: 8px; font-size: 12px; text-transform: uppercase; letter-spacing: 0.3px;">Due This Week (' + dueThisWeek.length + ')</div>';
        dueThisWeek.slice(0, 5).forEach(function(item) {
          content += '<div style="font-size: 13px; padding: 3px 0; color: #333;">' + item.employee + ' <span style="color: ' + styles.warningColor + '; font-weight: 500;">(' + item.daysLeft + 'd)</span></div>';
        });
        if (dueThisWeek.length > 5) {
          content += '<div style="font-size: 12px; color: #888; margin-top: 6px;">+' + (dueThisWeek.length - 5) + ' more</div>';
        }
        content += '</div>';
      }

      if (upcoming.length > 0) {
        content += '<div style="flex: 1; min-width: 180px; background: ' + styles.infoBg + '; border-left: 3px solid ' + styles.infoBorder + '; padding: 12px 14px;">';
        content += '<div style="font-weight: 600; color: ' + styles.infoColor + '; margin-bottom: 8px; font-size: 12px; text-transform: uppercase; letter-spacing: 0.3px;">Upcoming (' + upcoming.length + ')</div>';
        content += '<div style="font-size: 13px; color: #333;">Next 30 days: ' + upcoming.length + ' swaps</div>';
        content += '</div>';
      }

      content += '</div>';
    }

  } catch (e) {
    content = '<p style="color: #666; text-align: center;">Unable to load swap data.</p>';
    Logger.log('Error building swaps section: ' + e);
  }

  return buildSectionWrapper(sheetName, icon, content, styles);
}

/**
 * Builds expiring certs section.
 */
function buildExpiringCertsSection(ss, styles) {
  var content = '';

  try {
    var sheet = ss.getSheetByName('Expiring Certs');
    if (!sheet || sheet.getLastRow() < 2) {
      content = '<p style="color: ' + styles.successColor + '; text-align: center; font-weight: 500;">✅ All certifications current!</p>';
      return buildSectionWrapper('Expiring Certifications', '📜', content, styles);
    }

    var data = sheet.getDataRange().getValues();
    var today = new Date();
    today.setHours(0, 0, 0, 0);

    // Categorize by urgency
    var expired = [], critical = [], warning = [], upcoming = [];

    for (var i = 1; i < data.length; i++) {
      var row = data[i];
      var employee = row[0] || '';
      var certType = row[1] || '';
      var expDate = row[2];

      if (!employee || !expDate) continue;
      if (!(expDate instanceof Date)) continue;

      var daysUntil = Math.floor((expDate - today) / (1000 * 60 * 60 * 24));

      var item = {
        employee: employee,
        certType: certType,
        expDate: Utilities.formatDate(expDate, ss.getSpreadsheetTimeZone(), 'MM/dd/yyyy'),
        daysUntil: daysUntil
      };

      if (daysUntil < 0) {
        expired.push(item);
      } else if (daysUntil <= 30) {
        critical.push(item);
      } else if (daysUntil <= 90) {
        warning.push(item);
      } else if (daysUntil <= 180) {
        upcoming.push(item);
      }
    }

    if (expired.length === 0 && critical.length === 0 && warning.length === 0) {
      content = '<p style="color: ' + styles.successColor + '; text-align: center; font-weight: 500;">✓ All certifications current</p>';
    } else {
      // Expired
      if (expired.length > 0) {
        content += '<div style="background: ' + styles.urgentBg + '; border-left: 3px solid ' + styles.urgentBorder + '; padding: 12px 14px; margin-bottom: 10px;">';
        content += '<div style="font-weight: 600; color: ' + styles.urgentColor + '; margin-bottom: 8px; font-size: 12px; text-transform: uppercase; letter-spacing: 0.3px;">Expired (' + expired.length + ')</div>';
        expired.forEach(function(item) {
          content += '<div style="font-size: 13px; padding: 3px 0; color: #333;"><strong>' + item.employee + '</strong> — ' + item.certType + ' <span style="color: ' + styles.urgentColor + ';">(' + Math.abs(item.daysUntil) + 'd ago)</span></div>';
        });
        content += '</div>';
      }

      // Critical (within 30 days)
      if (critical.length > 0) {
        content += '<div style="background: ' + styles.warningBg + '; border-left: 3px solid ' + styles.warningBorder + '; padding: 12px 14px; margin-bottom: 10px;">';
        content += '<div style="font-weight: 600; color: ' + styles.warningColor + '; margin-bottom: 8px; font-size: 12px; text-transform: uppercase; letter-spacing: 0.3px;">Expiring Soon (' + critical.length + ')</div>';
        critical.forEach(function(item) {
          content += '<div style="font-size: 13px; padding: 3px 0; color: #333;"><strong>' + item.employee + '</strong> — ' + item.certType + ' <span style="color: ' + styles.warningColor + ';">(' + item.daysUntil + 'd)</span></div>';
        });
        content += '</div>';
      }

      // Warning (31-90 days)
      if (warning.length > 0) {
        content += '<div style="background: ' + styles.infoBg + '; border-left: 3px solid ' + styles.infoBorder + '; padding: 12px 14px;">';
        content += '<div style="font-weight: 600; color: ' + styles.infoColor + '; margin-bottom: 8px; font-size: 12px; text-transform: uppercase; letter-spacing: 0.3px;">Upcoming Renewals (' + warning.length + ')</div>';
        content += '<div style="font-size: 13px; color: #333;">' + warning.length + ' certifications expiring in 31-90 days</div>';
        content += '</div>';
      }
    }

  } catch (e) {
    content = '<p style="color: #666; text-align: center;">Unable to load certification data.</p>';
    Logger.log('Error building certs section: ' + e);
  }

  return buildSectionWrapper('Expiring Certifications', '📜', content, styles);
}

/**
 * Builds training summary section.
 */
function buildTrainingSummarySection(ss, styles) {
  var content = '';

  try {
    var sheet = ss.getSheetByName('Training Tracking');
    if (!sheet || sheet.getLastRow() < 2) {
      content = '<p style="color: #666; text-align: center;">No training data available.</p>';
      return buildSectionWrapper('Training Status', '📅', content, styles);
    }

    var data = sheet.getDataRange().getValues();
    var headerIdx = findTrainingTrackingHeaderRow(data);
    var headers = data[headerIdx];
    var cols = getTrainingTrackingColIndices(headers);

    // Find relevant columns
    var topicCol = cols.topic;
    var statusCol = cols.status;
    var dateCol = cols.completionDate;

    // Count by status
    var pending = 0, completed = 0, upcoming = 0;
    var upcomingTopics = {};

    for (var i = headerIdx + 1; i < data.length; i++) {
      var status = statusCol !== -1 ? (data[i][statusCol] || '').toString().toLowerCase() : '';

      if (status.indexOf('complete') !== -1) {
        completed++;
      } else if (status.indexOf('pending') !== -1 || status === '') {
        pending++;
        if (topicCol !== -1) {
          var topic = data[i][topicCol] || 'Unknown';
          upcomingTopics[topic] = (upcomingTopics[topic] || 0) + 1;
        }
      }
    }

    var total = completed + pending;
    var completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;

    // Build visual progress bar - professional style
    content += '<div style="margin-bottom: 16px;">';
    content += '<div style="display: flex; justify-content: space-between; margin-bottom: 6px;">';
    content += '<span style="font-weight: 500; font-size: 13px; color: #333;">Completion Rate</span>';
    content += '<span style="font-weight: 700; color: ' + (completionRate >= 80 ? styles.successColor : styles.warningColor) + ';">' + completionRate + '%</span>';
    content += '</div>';
    content += '<div style="background: #e9ecef; height: 8px; overflow: hidden;">';
    content += '<div style="background: ' + (completionRate >= 80 ? styles.successColor : styles.warningColor) + '; width: ' + completionRate + '%; height: 100%;"></div>';
    content += '</div>';
    content += '<div style="display: flex; justify-content: space-between; margin-top: 8px; font-size: 12px; color: #666;">';
    content += '<span>Completed: ' + completed + '</span>';
    content += '<span>Pending: ' + pending + '</span>';
    content += '</div>';
    content += '</div>';

    // Upcoming topics
    var topicsList = Object.keys(upcomingTopics);
    if (topicsList.length > 0) {
      content += '<div style="border-top: 1px solid ' + styles.borderColor + '; padding-top: 12px; margin-top: 12px;">';
      content += '<div style="font-weight: 600; margin-bottom: 8px; font-size: 12px; text-transform: uppercase; letter-spacing: 0.3px; color: #555;">Pending Topics</div>';
      topicsList.slice(0, 5).forEach(function(topic) {
        content += '<div style="font-size: 13px; padding: 4px 0; color: #333;">• ' + topic + ' <span style="color: #888;">(' + upcomingTopics[topic] + ')</span></div>';
      });
      content += '</div>';
    }

  } catch (e) {
    content = '<p style="color: #666; text-align: center;">Unable to load training data.</p>';
    Logger.log('Error building training section: ' + e);
  }

  return buildSectionWrapper('Training Status', '📅', content, styles);
}

/**
 * Builds task summary section from Task Metadata.
 */
function buildTaskSummarySection(ss, styles) {
  var content = '';

  try {
    var stats = getTaskStatistics();

    if (stats.error) {
      content = '<p style="color: #666; text-align: center;">' + stats.message + '</p>';
      return buildSectionWrapper('Task Summary', '✅', content, styles);
    }

    // Task counts by status - professional stat boxes
    content += '<div style="display: flex; gap: 12px; flex-wrap: wrap; margin-bottom: 16px;">';

    content += '<div style="flex: 1; min-width: 90px; text-align: center; padding: 14px 12px; background: white; border: 1px solid ' + styles.borderColor + '; border-top: 3px solid ' + styles.infoColor + ';">';
    content += '<div style="font-size: 22px; font-weight: 700; color: ' + styles.infoColor + '; line-height: 1;">' + stats.totalTasks + '</div>';
    content += '<div style="font-size: 10px; color: #666; margin-top: 4px; text-transform: uppercase; letter-spacing: 0.3px;">Total</div>';
    content += '</div>';

    content += '<div style="flex: 1; min-width: 90px; text-align: center; padding: 14px 12px; background: white; border: 1px solid ' + styles.borderColor + '; border-top: 3px solid ' + styles.warningColor + ';">';
    content += '<div style="font-size: 22px; font-weight: 700; color: ' + styles.warningColor + '; line-height: 1;">' + stats.pendingTasks + '</div>';
    content += '<div style="font-size: 10px; color: #666; margin-top: 4px; text-transform: uppercase; letter-spacing: 0.3px;">Pending</div>';
    content += '</div>';

    content += '<div style="flex: 1; min-width: 90px; text-align: center; padding: 14px 12px; background: white; border: 1px solid ' + styles.borderColor + '; border-top: 3px solid ' + styles.urgentColor + ';">';
    content += '<div style="font-size: 22px; font-weight: 700; color: ' + styles.urgentColor + '; line-height: 1;">' + stats.overdueTasks + '</div>';
    content += '<div style="font-size: 10px; color: #666; margin-top: 4px; text-transform: uppercase; letter-spacing: 0.3px;">Overdue</div>';
    content += '</div>';

    content += '<div style="flex: 1; min-width: 90px; text-align: center; padding: 14px 12px; background: white; border: 1px solid ' + styles.borderColor + '; border-top: 3px solid ' + styles.successColor + ';">';
    content += '<div style="font-size: 22px; font-weight: 700; color: ' + styles.successColor + '; line-height: 1;">' + stats.completedThisWeek + '</div>';
    content += '<div style="font-size: 10px; color: #666; margin-top: 4px; text-transform: uppercase; letter-spacing: 0.3px;">Done This Week</div>';
    content += '</div>';

    content += '</div>';

    // By type breakdown
    if (stats.byType && Object.keys(stats.byType).length > 0) {
      content += '<div style="border-top: 1px solid ' + styles.borderColor + '; padding-top: 12px;">';
      content += '<div style="font-weight: 600; margin-bottom: 8px; font-size: 12px; text-transform: uppercase; letter-spacing: 0.3px; color: #555;">By Type</div>';
      for (var taskType in stats.byType) {
        content += '<div style="display: flex; justify-content: space-between; font-size: 13px; padding: 4px 0; color: #333;">';
        content += '<span>' + taskType + '</span>';
        content += '<span style="font-weight: 600; color: #1565c0;">' + stats.byType[taskType] + '</span>';
        content += '</div>';
      }
      content += '</div>';
    }

  } catch (e) {
    content = '<p style="color: #666; text-align: center;">Unable to load task data.</p>';
    Logger.log('Error building task section: ' + e);
  }

  return buildSectionWrapper('Task Summary', '✅', content, styles);
}

/**
 * Builds 2-week calendar section.
 */
function buildCalendarSection(ss, styles) {
  var content = '';

  try {
    var timezone = ss.getSpreadsheetTimeZone();
    var today = new Date();

    // Get tasks with scheduled dates
    var tasksByDate = {};
    var metadataSheet = ss.getSheetByName('Task Metadata');

    if (metadataSheet && metadataSheet.getLastRow() > 1) {
      var data = metadataSheet.getDataRange().getValues();
      var headers = data[0];
      var schedDateCol = -1, statusCol = -1, taskTypeCol = -1;

      for (var h = 0; h < headers.length; h++) {
        var hdr = String(headers[h]).toLowerCase();
        if (hdr === 'scheduleddate') schedDateCol = h;
        if (hdr === 'status') statusCol = h;
        if (hdr === 'tasktype') taskTypeCol = h;
      }

      for (var i = 1; i < data.length; i++) {
        var schedDate = data[i][schedDateCol];
        var status = (data[i][statusCol] || '').toString();
        if (status.toLowerCase() === 'complete') continue;

        if (schedDate instanceof Date) {
          var dateKey = Utilities.formatDate(schedDate, timezone, 'yyyy-MM-dd');
          if (!tasksByDate[dateKey]) {
            tasksByDate[dateKey] = { total: 0, types: {} };
          }
          tasksByDate[dateKey].total++;

          var taskType = data[i][taskTypeCol] || 'Other';
          tasksByDate[dateKey].types[taskType] = (tasksByDate[dateKey].types[taskType] || 0) + 1;
        }
      }
    }

    // Build 2-week calendar grid - professional style
    var dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    content += '<table style="width: 100%; border-collapse: collapse; table-layout: fixed;">';

    // Header row
    content += '<tr>';
    dayNames.forEach(function(day) {
      var isWeekend = day === 'Sun' || day === 'Sat';
      content += '<th style="padding: 8px 4px; text-align: center; background: ' + (isWeekend ? '#f8f9fa' : '#f0f0f0') + '; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.3px; border: 1px solid ' + styles.borderColor + '; color: #555;">' + day + '</th>';
    });
    content += '</tr>';

    // Find the start of the current week (Sunday)
    var weekStart = new Date(today);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());

    // Build 2 weeks of days
    for (var week = 0; week < 2; week++) {
      content += '<tr>';

      for (var day = 0; day < 7; day++) {
        var cellDate = new Date(weekStart);
        cellDate.setDate(cellDate.getDate() + (week * 7) + day);

        var dateKey = Utilities.formatDate(cellDate, timezone, 'yyyy-MM-dd');
        var isToday = cellDate.toDateString() === today.toDateString();
        var isWeekend = day === 0 || day === 6;
        var tasksForDay = tasksByDate[dateKey];

        var cellBg = isToday ? '#e8f4fd' : (isWeekend ? '#fafafa' : 'white');
        var borderStyle = isToday ? '2px solid ' + styles.infoColor : '1px solid ' + styles.borderColor;

        content += '<td style="padding: 6px; vertical-align: top; height: 54px; background: ' + cellBg + '; border: ' + borderStyle + ';">';
        content += '<div style="font-size: 12px; font-weight: ' + (isToday ? '700' : '400') + '; color: ' + (isToday ? styles.infoColor : '#333') + ';">' + cellDate.getDate() + '</div>';

        if (tasksForDay && tasksForDay.total > 0) {
          content += '<div style="margin-top: 4px;">';
          content += '<div style="background: ' + styles.primaryBg + '; color: white; font-size: 9px; padding: 2px 5px; display: inline-block; font-weight: 600;">' + tasksForDay.total + '</div>';
          content += '</div>';
        }

        content += '</td>';
      }

      content += '</tr>';
    }

    content += '</table>';

    // Legend - minimal
    content += '<div style="margin-top: 10px; font-size: 10px; color: #888; text-transform: uppercase; letter-spacing: 0.3px;">';
    content += 'Today highlighted • Numbers = scheduled tasks';
    content += '</div>';

  } catch (e) {
    content = '<p style="color: #666; text-align: center;">Unable to generate calendar.</p>';
    Logger.log('Error building calendar section: ' + e);
  }

  return buildSectionWrapper('2-Week Calendar', '🗓️', content, styles);
}

// ============================================================================
// GOOGLE CHARTS
// ============================================================================

/**
 * Generates chart images for the email.
 * @return {Object} Object with chart blob images
 */
function generateChartImages(ss) {
  var charts = {};

  try {
    // Task Status Pie Chart
    charts.taskStatusChart = createTaskStatusPieChart(ss);
  } catch (e) {
    Logger.log('Error creating task status chart: ' + e);
  }

  try {
    // Tasks by Location Bar Chart
    charts.locationChart = createLocationBarChart(ss);
  } catch (e) {
    Logger.log('Error creating location chart: ' + e);
  }

  return charts;
}

/**
 * Creates a pie chart showing task status distribution.
 */
function createTaskStatusPieChart(ss) {
  try {
    var stats = getTaskStatistics();
    if (stats.error || !stats.byStatus) return null;

    var dataTable = Charts.newDataTable()
      .addColumn(Charts.ColumnType.STRING, 'Status')
      .addColumn(Charts.ColumnType.NUMBER, 'Count');

    for (var status in stats.byStatus) {
      dataTable.addRow([status, stats.byStatus[status]]);
    }

    var chart = Charts.newPieChart()
      .setDataTable(dataTable)
      .setTitle('Tasks by Status')
      .setDimensions(400, 300)
      .set3D()
      .setColors(['#4caf50', '#ff9800', '#f44336', '#2196f3', '#9c27b0'])
      .build();

    return chart.getAs('image/png');

  } catch (e) {
    Logger.log('Error in createTaskStatusPieChart: ' + e);
    return null;
  }
}

/**
 * Creates a bar chart showing tasks by location.
 */
function createLocationBarChart(ss) {
  try {
    var stats = getTaskStatistics();
    if (stats.error || !stats.byLocation) return null;

    var dataTable = Charts.newDataTable()
      .addColumn(Charts.ColumnType.STRING, 'Location')
      .addColumn(Charts.ColumnType.NUMBER, 'Tasks');

    // Sort by count and take top 8
    var locations = Object.keys(stats.byLocation).sort(function(a, b) {
      return stats.byLocation[b] - stats.byLocation[a];
    }).slice(0, 8);

    locations.forEach(function(loc) {
      dataTable.addRow([loc, stats.byLocation[loc]]);
    });

    var chart = Charts.newBarChart()
      .setDataTable(dataTable)
      .setTitle('Pending Tasks by Location')
      .setDimensions(500, 300)
      .setColors(['#1565c0'])
      .build();

    return chart.getAs('image/png');

  } catch (e) {
    Logger.log('Error in createLocationBarChart: ' + e);
    return null;
  }
}

/**
 * Builds the charts section with embedded images.
 * @param {Object} chartImages - Chart blob images
 * @param {Object} styles - Style definitions
 * @param {boolean} useBase64 - If true, embed as base64 data URLs (for preview). If false, use CID (for email).
 */
function buildChartsSection(chartImages, styles, useBase64) {
  var content = '';

  if (!chartImages) {
    content = '<p style="color: #666; text-align: center;">Charts not available.</p>';
    return buildSectionWrapper('Visual Analytics', '📈', content, styles);
  }

  content += '<div style="display: flex; gap: 20px; flex-wrap: wrap; justify-content: center;">';

  if (chartImages.taskStatusChart) {
    content += '<div style="text-align: center;">';
    if (useBase64) {
      var base64Status = Utilities.base64Encode(chartImages.taskStatusChart.getBytes());
      content += '<img src="data:image/png;base64,' + base64Status + '" alt="Task Status Chart" style="max-width: 100%; height: auto; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);" />';
    } else {
      content += '<img src="cid:taskStatusChart" alt="Task Status Chart" style="max-width: 100%; height: auto; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);" />';
    }
    content += '</div>';
  }

  if (chartImages.locationChart) {
    content += '<div style="text-align: center;">';
    if (useBase64) {
      var base64Location = Utilities.base64Encode(chartImages.locationChart.getBytes());
      content += '<img src="data:image/png;base64,' + base64Location + '" alt="Tasks by Location" style="max-width: 100%; height: auto; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);" />';
    } else {
      content += '<img src="cid:locationChart" alt="Tasks by Location" style="max-width: 100%; height: auto; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);" />';
    }
    content += '</div>';
  }

  content += '</div>';

  if (!chartImages.taskStatusChart && !chartImages.locationChart) {
    content = '<p style="color: #666; text-align: center;">No chart data available. Run "Generate Task Metadata" to populate data.</p>';
  }

  return buildSectionWrapper('Visual Analytics', '📈', content, styles);
}

// ============================================================================
// TRIGGER MANAGEMENT
// ============================================================================

// ============================================================================
// TRIGGER & AUTOMATED SCHEDULE MANAGEMENT
// ============================================================================

/**
 * Opens the Schedule Weekly Email modal dialog.
 * Menu item: Glove Manager → Email Reports → ⏰ Schedule Weekly Auto-Send...
 */
// eslint-disable-next-line no-unused-vars
function showScheduleWeeklyEmailDialog() {
  var html = HtmlService.createHtmlOutputFromFile('ScheduleEmailDialog')
    .setWidth(620)
    .setHeight(520);
  SpreadsheetApp.getUi().showModalDialog(html, '📧 Schedule Weekly Email Report');
}

/**
 * Returns current schedule status, configured day/hour, and active recipient count.
 */
// eslint-disable-next-line no-unused-vars
function getWeeklyEmailScheduleStatus() {
  var triggers = ScriptApp.getProjectTriggers();
  var activeTrigger = null;

  for (var i = 0; i < triggers.length; i++) {
    var fn = triggers[i].getHandlerFunction();
    if (fn === 'automatedWeeklyEmailJob' || fn === 'sendEmailReport') {
      activeTrigger = triggers[i];
      break;
    }
  }

  var props = PropertiesService.getScriptProperties();
  var savedScheduleStr = props.getProperty('WEEKLY_EMAIL_SCHEDULE');
  var savedSchedule = savedScheduleStr ? JSON.parse(savedScheduleStr) : null;
  var lastSent = props.getProperty('WEEKLY_EMAIL_LAST_SENT') || '';

  var dayNames = {
    'MONDAY': 'Monday',
    'TUESDAY': 'Tuesday',
    'WEDNESDAY': 'Wednesday',
    'THURSDAY': 'Thursday',
    'FRIDAY': 'Friday',
    'SATURDAY': 'Saturday',
    'SUNDAY': 'Sunday'
  };

  var dayKey = savedSchedule && savedSchedule.day ? savedSchedule.day : 'MONDAY';
  var hourVal = savedSchedule && savedSchedule.hour !== undefined ? savedSchedule.hour : 6;
  var hourFormatted = (hourVal === 0 ? '12:00 AM' : (hourVal < 12 ? hourVal + ':00 AM' : (hourVal === 12 ? '12:00 PM' : (hourVal - 12) + ':00 PM')));

  var configs = getEmailReportConfig() || [];
  var recipients = configs.map(function(c) {
    var enabledSections = Object.keys(c.sections || {}).filter(function(k) { return c.sections[k]; }).length;
    return { email: c.email, sectionsCount: enabledSections };
  });

  return {
    isScheduled: Boolean(activeTrigger),
    configuredDay: dayKey,
    configuredHour: hourVal,
    dayName: dayNames[dayKey] || dayKey,
    hourFormatted: hourFormatted,
    lastSent: lastSent,
    recipients: recipients
  };
}

/**
 * Creates or updates a weekly time-driven trigger to automatically send email reports.
 *
 * @param {string} [dayStr='MONDAY'] MONDAY, TUESDAY, etc.
 * @param {number} [hourNum=6] 0-23 (e.g. 6 = 6:00 AM)
 * @param {boolean} [silent=false] Suppresses alerts if true
 */
function createWeeklyEmailTrigger(dayStr, hourNum, silent) {
  try {
    removeEmailTrigger(true);

    var dayMap = {
      'MONDAY': ScriptApp.WeekDay.MONDAY,
      'TUESDAY': ScriptApp.WeekDay.TUESDAY,
      'WEDNESDAY': ScriptApp.WeekDay.WEDNESDAY,
      'THURSDAY': ScriptApp.WeekDay.THURSDAY,
      'FRIDAY': ScriptApp.WeekDay.FRIDAY,
      'SATURDAY': ScriptApp.WeekDay.SATURDAY,
      'SUNDAY': ScriptApp.WeekDay.SUNDAY
    };

    var selectedDayStr = (dayStr || 'MONDAY').toUpperCase().trim();
    var selectedDay = dayMap[selectedDayStr] || ScriptApp.WeekDay.MONDAY;
    var selectedHour = (hourNum !== undefined && hourNum !== null) ? parseInt(hourNum, 10) : 6;

    ScriptApp.newTrigger('automatedWeeklyEmailJob')
      .timeBased()
      .onWeekDay(selectedDay)
      .atHour(selectedHour)
      .create();

    // Persist configuration in ScriptProperties
    var props = PropertiesService.getScriptProperties();
    props.setProperty('WEEKLY_EMAIL_SCHEDULE', JSON.stringify({
      day: selectedDayStr,
      hour: selectedHour,
      enabled: true,
      updatedAt: new Date().toISOString()
    }));

    var hourFormatted = (selectedHour === 0 ? '12:00 AM' : (selectedHour < 12 ? selectedHour + ':00 AM' : (selectedHour === 12 ? '12:00 PM' : (selectedHour - 12) + ':00 PM')));
    logEvent('Weekly email report trigger created for ' + selectedDayStr + ' at ' + hourFormatted);

    if (!silent) {
      SpreadsheetApp.getUi().alert(
        '✅ Weekly Email Scheduled!\n\n' +
        'Reports will be sent automatically every ' + selectedDayStr + ' at ' + hourFormatted + '.\n\n' +
        'Recipients can be customized via: Email Reports → ⚙️ Configure Recipients'
      );
    }

  } catch (e) {
    logEvent('Error creating weekly email trigger: ' + e, 'ERROR');
    if (!silent) {
      SpreadsheetApp.getUi().alert('❌ Error setting up weekly email: ' + e);
    }
    throw e;
  }
}

/**
 * Removes all active weekly email report triggers.
 *
 * @param {boolean} [silent=false] Suppresses alerts if true
 */
function removeEmailTrigger(silent) {
  try {
    var triggers = ScriptApp.getProjectTriggers();
    var removed = 0;

    triggers.forEach(function(trigger) {
      var fn = trigger.getHandlerFunction();
      if (fn === 'sendEmailReport' || fn === 'automatedWeeklyEmailJob') {
        ScriptApp.deleteTrigger(trigger);
        removed++;
      }
    });

    // Update ScriptProperties
    var props = PropertiesService.getScriptProperties();
    props.deleteProperty('WEEKLY_EMAIL_SCHEDULE');

    if (removed > 0) {
      logEvent('Removed ' + removed + ' email report trigger(s)');
    }

    if (!silent) {
      if (removed > 0) {
        SpreadsheetApp.getUi().alert('✅ Scheduled Email Removed\n\nThe weekly email report has been disabled.');
      } else {
        SpreadsheetApp.getUi().alert('ℹ️ No Scheduled Email Found\n\nThere was no weekly email report scheduled.');
      }
    }

  } catch (e) {
    logEvent('Error removing email trigger: ' + e, 'ERROR');
    if (!silent) {
      SpreadsheetApp.getUi().alert('❌ Error removing scheduled email: ' + e);
    }
  }
}

/**
 * Automated scheduled job executed by the time-based trigger:
 * 1. Checks and activates scheduled on-hold jobs.
 * 2. Recalculates change out dates.
 * 3. Dispatches personalized weekly email reports to all configured recipients.
 * 4. Records last sent timestamp.
 */
// eslint-disable-next-line no-unused-vars
function automatedWeeklyEmailJob() {
  logEvent('automatedWeeklyEmailJob: Starting scheduled weekly email pipeline...');
  try {
    // 1. Auto-activate scheduled jobs
    if (typeof checkAndActivateScheduledJobs === 'function') {
      try { checkAndActivateScheduledJobs(); } catch (actErr) { Logger.log('Auto activate error: ' + actErr); }
    }

    // 2. Fix change out dates
    if (typeof fixChangeOutDatesSilent === 'function') {
      try { fixChangeOutDatesSilent(); } catch (fixErr) { Logger.log('Fix change out dates error: ' + fixErr); }
    }

    // 3. Send email reports
    sendEmailReport();

    // 4. Record timestamp
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var tz = ss.getSpreadsheetTimeZone();
    var nowFormatted = Utilities.formatDate(new Date(), tz, 'MM/dd/yyyy h:mm a');
    PropertiesService.getScriptProperties().setProperty('WEEKLY_EMAIL_LAST_SENT', nowFormatted);

    logEvent('automatedWeeklyEmailJob: Weekly email job completed successfully at ' + nowFormatted);
  } catch (err) {
    logEvent('automatedWeeklyEmailJob failed: ' + err, 'ERROR');
  }
}

// ============================================================================
// LEGACY SUPPORT - Keep old function names working
// ============================================================================

function buildEmailReportHtml() {
  // Legacy function - build with all sections for backward compatibility
  var sections = {};
  EMAIL_REPORT_SECTIONS.forEach(function(s) {
    sections[s] = true;
  });
  var chartImages = generateChartImages(SpreadsheetApp.getActiveSpreadsheet());
  return buildPremiumEmailHtml('', sections, chartImages, false);
}

function buildEmptySection(title, message, styles) {
  var html = '<div style="background: white; border-radius: 8px; margin-bottom: 20px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">';
  html += '<div style="background: ' + styles.headerBg + '; color: ' + styles.headerColor + '; padding: 12px 15px; font-weight: bold; font-size: 16px;">' + title + '</div>';
  html += '<div style="padding: 20px; text-align: center; color: #666;">' + message + '</div>';
  html += '</div>';
  return html;
}

