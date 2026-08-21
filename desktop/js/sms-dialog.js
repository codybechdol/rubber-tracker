/**
 * SMS Dialog Engine for Safety Assistant Desktop
 * Matches Google Sheets DashboardSMSDialogV2 with full interactive templates for 1st Aid/CPR and specific certs
 */

class SMSDialogEngine {
  constructor(db) {
    this.db = db;
    this.currentContext = null;
  }

  init() {
    console.log('SMSDialogEngine initialized');
  }

  /**
   * Returns default SMS template stock messages matching Google Sheets
   */
  getDefaultTemplates() {
    return {
      safety_missing_jha: 'Hi {firstName}, we did not receive a JHA for {dates} from your crew. This is just a reminder not to miss {itThem} this week. Was there an issue turning {itThem} in that you need help with?',
      safety_missing_weekly: 'Hi {firstName}, we did not receive a Weekly Safety Meeting for the week of {weekOf} from your crew. This is just a reminder not to miss it this week. Was there an issue turning it in that you need help with?',
      safety_late_submission: 'Hi {firstName}, the {reportType} for {dates} was received late. Be sure to submit it in the same week that it is due.',
      equipment_changeout: 'Hi {firstName}, your {itemType} for job {jobNum} is due for change-out on {changeOutDate}. Please coordinate with your foreman to return the current set and collect your new set.',
      certs_general: 'Hi {firstName}, your {certName} {expirationStatus}. Can you send me a picture of your new one?',
      'cert_1st aid': 'Hi {firstName}, your 1st Aid cert {expirationStatus}.',
      'cert_cpr': 'Hi {firstName}, your CPR cert {expirationStatus}.',
      'cert_dl': "Hi {firstName}, your Driver's License {expirationStatus}. Can you send me a picture (front and back) of your new one?",
      'cert_mec expiration': 'Hi {firstName}, your DOT Medical Card {expirationStatus} on {expirationDate}. Can you send me a picture of your new one?',
      'cert_harassment training': 'Hi {firstName}, your Harassment Training {expirationStatus}. Can you let me know when you get it done? This is required by the NJATC if you are going to be assigned apprentices and the Federal Govt in general. Go to SafetyWallet.org or the mobile app, sign in with your last name and phone number, upper left is a menu with Training and then On Line Training. Make sure you take the 65 minute class and not the 120 minute class. If you have trouble logging in call Safety Wallet at 424-342-7233 and they can get you straightened out.',
      'cert_crane cert': 'Hi {firstName}, your Crane Cert is expiring and needs to be renewed. There is a class at MSLCAT starting {startDate} and ending {endDate}. You will need to contact MSLCAT directly to register: Phone: (801) 562-2929 Email: office@mslcat.org Website: mslcat.org (Mon-Fri 7:30am-4pm MT). Have your Name, Email Address, and last 4 of your SSN ready when you call. Let me know when you get signed up!',
      'cert_crane evaluation': 'Hi {firstName}, your Crane Evaluation {expirationStatus}. Please let me know when you have scheduled your renewal evaluation.',
      'cert_pole top rescue': 'Hi {firstName}, your Pole Top Rescue certification {expirationStatus}. Please let me know when you have scheduled your annual re-evaluation.',
      'cert_forklift': 'Hi {firstName}, your Forklift Operator certification {expirationStatus}. Can you send me a copy of your new card when completed?',
      'cert_forklift operator safety training': 'Hi {firstName}, your Forklift Operator certification {expirationStatus}. Can you send me a copy of your new card when completed?',
      'cert_osha 1910': 'Hi {firstName}, your OSHA 1910 training {expirationStatus}. Can you send me a copy of your updated certificate?',
      'cert_bnsf': 'Hi {firstName}, your BNSF Railroad contractor qualification {expirationStatus}. Please verify your renewal status.',
      'cert_msha': 'Hi {firstName}, your MSHA Mining Safety certificate {expirationStatus}. Please send me your updated 5000-23 form.'
    };
  }

  /**
   * Looks up an employee's phone number from the Employees table
   */
  getEmployeePhone(employeeName) {
    const snap = this.db.getSnapshot();
    if (!snap || !snap.tables || !snap.tables.employees) return '';

    const empRows = snap.tables.employees.rows || [];
    const rawTarget = String(employeeName || '').toLowerCase().trim();
    if (!rawTarget) return '';

    const emp = empRows.find(r => {
      const name = String(r['Name'] || r['Employee Name'] || r['Employee'] || '').toLowerCase().trim();
      if (!name) return false;
      if (name === rawTarget) return true;
      const cleanName = name.replace(/\s*\([^)]*\)/g, '').trim();
      const cleanTarget = rawTarget.replace(/\s*\([^)]*\)/g, '').trim();
      return cleanName === cleanTarget;
    });

    if (emp) {
      return String(emp['Phone Number'] || emp['Phone'] || '').trim();
    }
    return '';
  }

  /**
   * Opens the SMS modal for an expiring certification
   */
  openCertSms(employeeName, certType, expirationDate, rowIdx = null, colIdx = null, sheetName = 'Expiring Certs') {
    const modal = document.getElementById('sms-notification-modal');
    const body = document.getElementById('sms-notification-modal-body');
    if (!modal || !body) return;

    const phone = this.getEmployeePhone(employeeName);
    let cleanPhone = phone.replace(/[^0-9]/g, '');
    if (cleanPhone.length === 10) cleanPhone = '1' + cleanPhone;

    const firstName = String(employeeName || '').trim().split(' ')[0] || 'there';
    
    let dateStr = '';
    let isExpired = false;
    if (expirationDate && expirationDate !== 'N/A' && expirationDate !== '—') {
      dateStr = String(expirationDate).trim();
      const d = new Date(expirationDate);
      if (!isNaN(d.getTime())) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        isExpired = d < today;
      }
    }

    const certKey = 'cert_' + String(certType || '').toLowerCase().trim();
    const defaults = this.getDefaultTemplates();
    const expStatusStr = isExpired ? 'is expired' : (dateStr ? `expires on ${dateStr}` : 'is expiring');

    const vars = {
      firstName: firstName,
      certName: certType || 'Certification',
      expirationStatus: expStatusStr,
      expirationDate: dateStr || 'soon',
      startDate: 'soon',
      endDate: 'soon'
    };

    let defaultMsg = '';
    if (defaults[certKey]) {
      defaultMsg = defaults[certKey];
      Object.keys(vars).forEach(k => {
        defaultMsg = defaultMsg.split('{' + k + '}').join(vars[k]);
      });
    } else {
      defaultMsg = defaults['certs_general'];
      Object.keys(vars).forEach(k => {
        defaultMsg = defaultMsg.split('{' + k + '}').join(vars[k]);
      });
    }

    const certLower = String(certType || '').toLowerCase();
    const isFirstAidCpr = certLower.includes('cpr') || certLower.includes('1st aid') || certLower.includes('first aid');

    this.currentContext = {
      type: 'cert',
      employeeName,
      firstName,
      certType,
      expirationDate: dateStr,
      isExpired,
      phone,
      cleanPhone,
      isFirstAidCpr,
      defaultMsg,
      rowIdx,
      colIdx,
      sheetName
    };

    this.renderModalUI(body);
    modal.classList.add('active');

    if (isFirstAidCpr) {
      setTimeout(() => this.updateNotifyMessage(), 50);
    }
  }

  /**
   * Renders the SMS Notification modal content
   */
  renderModalUI(container) {
    const ctx = this.currentContext;
    if (!ctx) return;

    let html = `
      <!-- Employee Info Summary Card -->
      <div style="background-color: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 8px; padding: 14px; margin-bottom: 16px; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px;">
        <div>
          <div style="font-size: 16px; font-weight: 800; color: var(--text-primary); display: flex; align-items: center; gap: 6px;">
            <span>👤</span> ${this.escapeHtml(ctx.employeeName)}
          </div>
          <div style="font-size: 13px; color: var(--text-secondary); margin-top: 2px;">
            <strong>${this.escapeHtml(ctx.certType)}</strong> &nbsp;·&nbsp; 
            <span style="color: ${ctx.isExpired ? '#ef4444' : '#f59e0b'}; font-weight: 700;">
              ${ctx.isExpired ? '⚠️ Expired: ' : '⏳ Expires: '} ${this.escapeHtml(ctx.expirationDate || 'N/A')}
            </span>
          </div>
        </div>
        <div>
          ${ctx.phone ? `
            <div style="font-size: 14px; font-weight: 700; color: #60a5fa; background: rgba(59, 130, 246, 0.15); padding: 4px 10px; border-radius: 6px; border: 1px solid rgba(59, 130, 246, 0.3);">
              📞 ${this.escapeHtml(ctx.phone)}
            </div>
          ` : `
            <div style="font-size: 12px; color: #ef4444; background: rgba(239, 68, 68, 0.15); padding: 4px 10px; border-radius: 6px; border: 1px solid rgba(239, 68, 68, 0.3);">
              ⚠️ No Phone on File
            </div>
          `}
        </div>
      </div>

      ${ctx.isFirstAidCpr ? `
        <!-- 1st Aid / CPR Interactive Options Section -->
        <div style="background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: 8px; padding: 14px; margin-bottom: 16px;">
          <div style="font-size: 13px; font-weight: 700; color: #93c5fd; margin-bottom: 10px; display: flex; align-items: center; gap: 6px;">
            <span>📋</span> Select Class Options to Offer:
          </div>

          <div style="display: flex; flex-direction: column; gap: 10px;">
            <!-- Online Class Option -->
            <label style="display: flex; align-items: center; gap: 8px; font-size: 13px; cursor: pointer; user-select: none;">
              <input type="checkbox" id="dt-sms-opt-online" checked onchange="window.smsDialogEngine.updateNotifyMessage()" style="accent-color: var(--accent); width: 16px; height: 16px;">
              <span>💻 <strong>Online Class</strong> <span style="color: var(--text-muted); font-size: 12px;">(no date/time required)</span></span>
            </label>

            <!-- In Person with Me Option -->
            <div style="border: 1px solid var(--border-color); border-radius: 6px; padding: 8px 12px; background: var(--bg-primary);">
              <label style="display: flex; align-items: center; gap: 8px; font-size: 13px; cursor: pointer; user-select: none;">
                <input type="checkbox" id="dt-sms-opt-inperson" onchange="window.smsDialogEngine.updateNotifyMessage()" style="accent-color: var(--accent); width: 16px; height: 16px;">
                <span>🧑‍🏫 <strong>In Person with Me</strong></span>
              </label>

              <div id="dt-sms-inperson-details" style="display: none; margin-top: 10px; padding-top: 8px; border-top: 1px dashed var(--border-color);">
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 8px;">
                  <div>
                    <label style="font-size: 11px; color: var(--text-muted); display: block; margin-bottom: 2px;">Class Date</label>
                    <input type="date" id="dt-sms-ip-date" onchange="window.smsDialogEngine.updateNotifyMessage()" style="width: 100%; background: var(--bg-tertiary); border: 1px solid var(--border-color); border-radius: 4px; color: var(--text-primary); padding: 4px 6px; font-size: 12px;">
                  </div>
                  <div>
                    <label style="font-size: 11px; color: var(--text-muted); display: block; margin-bottom: 2px;">Start Time</label>
                    <input type="time" id="dt-sms-ip-start" onchange="window.smsDialogEngine.updateNotifyMessage()" style="width: 100%; background: var(--bg-tertiary); border: 1px solid var(--border-color); border-radius: 4px; color: var(--text-primary); padding: 4px 6px; font-size: 12px;">
                  </div>
                  <div>
                    <label style="font-size: 11px; color: var(--text-muted); display: block; margin-bottom: 2px;">End Time</label>
                    <input type="time" id="dt-sms-ip-end" onchange="window.smsDialogEngine.updateNotifyMessage()" style="width: 100%; background: var(--bg-tertiary); border: 1px solid var(--border-color); border-radius: 4px; color: var(--text-primary); padding: 4px 6px; font-size: 12px;">
                  </div>
                  <div>
                    <label style="font-size: 11px; color: var(--text-muted); display: block; margin-bottom: 2px;">Location</label>
                    <input type="text" id="dt-sms-ip-loc" placeholder="e.g. Helena Shop" onkeyup="window.smsDialogEngine.updateNotifyMessage()" style="width: 100%; background: var(--bg-tertiary); border: 1px solid var(--border-color); border-radius: 4px; color: var(--text-primary); padding: 4px 6px; font-size: 12px;">
                  </div>
                </div>
              </div>
            </div>

            <!-- MSLCAT Helena Option -->
            <div style="border: 1px solid var(--border-color); border-radius: 6px; padding: 8px 12px; background: var(--bg-primary);">
              <label style="display: flex; align-items: center; gap: 8px; font-size: 13px; cursor: pointer; user-select: none;">
                <input type="checkbox" id="dt-sms-opt-mslcat" onchange="window.smsDialogEngine.updateNotifyMessage()" style="accent-color: var(--accent); width: 16px; height: 16px;">
                <span>🏢 <strong>In Person at MSLCAT (Helena)</strong></span>
              </label>

              <div id="dt-sms-mslcat-details" style="display: none; margin-top: 10px; padding-top: 8px; border-top: 1px dashed var(--border-color);">
                <div style="max-width: 200px;">
                  <label style="font-size: 11px; color: var(--text-muted); display: block; margin-bottom: 2px;">Class Date</label>
                  <input type="date" id="dt-sms-mslcat-date" onchange="window.smsDialogEngine.updateNotifyMessage()" style="width: 100%; background: var(--bg-tertiary); border: 1px solid var(--border-color); border-radius: 4px; color: var(--text-primary); padding: 4px 6px; font-size: 12px;">
                </div>
              </div>
            </div>
          </div>
        </div>
      ` : ''}

      <!-- Message Editor / Preview Box -->
      <div style="margin-bottom: 16px;">
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px;">
          <label style="font-size: 12px; font-weight: 700; color: var(--text-secondary);">💬 Text Message Content</label>
          <label style="display: flex; align-items: center; gap: 6px; font-size: 11px; color: var(--text-muted); cursor: pointer;">
            <input type="checkbox" id="dt-sms-edit-toggle" onchange="window.smsDialogEngine.toggleEditMode()" style="accent-color: var(--accent);">
            <span>Edit message text manually</span>
          </label>
        </div>
        <textarea id="dt-sms-message-text" rows="5" style="width: 100%; background: var(--bg-tertiary); border: 1px solid var(--border-color); border-radius: 6px; color: var(--text-primary); padding: 10px; font-family: sans-serif; font-size: 13px; line-height: 1.4; resize: vertical;">${this.escapeHtml(ctx.defaultMsg)}</textarea>
      </div>

      <!-- Action notice -->
      <div style="background: rgba(59, 130, 246, 0.1); border: 1px solid rgba(59, 130, 246, 0.25); border-radius: 6px; padding: 8px 12px; font-size: 12px; color: #93c5fd; display: flex; align-items: center; gap: 8px; margin-bottom: 16px;">
        <span>💡</span> Clicking <strong>Launch SMS App</strong> opens your system messaging application with recipient and text pre-filled. You can also copy to clipboard.
      </div>
    `;

    container.innerHTML = html;
  }

  toggleEditMode() {
    const isEdit = document.getElementById('dt-sms-edit-toggle')?.checked;
    if (!isEdit) {
      this.updateNotifyMessage();
    }
  }

  /**
   * Dynamically formats 1st Aid / CPR text message based on user option selections
   */
  updateNotifyMessage() {
    const ctx = this.currentContext;
    if (!ctx || !ctx.isFirstAidCpr) return;

    // Skip regeneration if manual edit mode is turned on
    const isManualEdit = document.getElementById('dt-sms-edit-toggle')?.checked;
    if (isManualEdit) return;

    const onlineChecked = document.getElementById('dt-sms-opt-online')?.checked;
    const inPersonChecked = document.getElementById('dt-sms-opt-inperson')?.checked;
    const mslcatChecked = document.getElementById('dt-sms-opt-mslcat')?.checked;

    const ipDetails = document.getElementById('dt-sms-inperson-details');
    if (ipDetails) ipDetails.style.display = inPersonChecked ? 'block' : 'none';

    const mslcatDetails = document.getElementById('dt-sms-mslcat-details');
    if (mslcatDetails) mslcatDetails.style.display = mslcatChecked ? 'block' : 'none';

    const expStatus = ctx.isExpired ? 'is expired' : (ctx.expirationDate ? `will expire on ${ctx.expirationDate}` : 'is expiring');
    let message = `Hi ${ctx.firstName}, your 1st Aid/CPR certification ${expStatus}. `;

    const options = [];

    if (onlineChecked) {
      options.push('get into my next Online Class');
    }

    if (inPersonChecked) {
      const ipDate = document.getElementById('dt-sms-ip-date')?.value;
      const ipStart = document.getElementById('dt-sms-ip-start')?.value;
      const ipEnd = document.getElementById('dt-sms-ip-end')?.value;
      const ipLoc = document.getElementById('dt-sms-ip-loc')?.value.trim();

      let inPersonText = 'take my next In Person class';
      if (ipDate) {
        inPersonText += ' on ' + this.formatDateMMDDYYYY(ipDate);
        if (ipStart) {
          inPersonText += ' from ' + this.formatTimeAMPM(ipStart);
          if (ipEnd) {
            inPersonText += ' - ' + this.formatTimeAMPM(ipEnd);
          }
        }
        if (ipLoc) {
          inPersonText += ' in ' + ipLoc;
        }
      }
      options.push(inPersonText);
    }

    if (mslcatChecked) {
      const mslcatDate = document.getElementById('dt-sms-mslcat-date')?.value;
      let mslcatText = 'let Tim know that you are taking the one in Helena at the MSLCAT Training Center';
      if (mslcatDate) {
        mslcatText += ' on ' + this.formatDateMMDDYYYY(mslcatDate);
      }
      options.push(mslcatText);
    }

    if (options.length === 0) {
      message += 'Please let me know your availability for a renewal class.';
    } else if (options.length === 1) {
      message += 'Would you like to ' + options[0] + '?';
    } else if (options.length === 2) {
      message += 'Would you like to ' + options[0] + ' or ' + options[1] + '?';
    } else if (options.length === 3) {
      message += 'Would you like to ' + options[0] + ', ' + options[1] + ', or ' + options[2] + '?';
    }

    const textarea = document.getElementById('dt-sms-message-text');
    if (textarea) textarea.value = message;
  }

  /**
   * Launches native SMS application with prefilled number and message
   */
  launchSmsClient() {
    const ctx = this.currentContext;
    if (!ctx) return;

    const textarea = document.getElementById('dt-sms-message-text');
    const msg = textarea ? textarea.value : ctx.defaultMsg;

    const cleanPhone = ctx.cleanPhone || '';
    const smsUrl = `sms:${cleanPhone}?body=${encodeURIComponent(msg)}`;

    // Copy message to clipboard automatically as a convenience
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(msg).catch(() => {});
    }

    // Launch default OS SMS handler (Windows Phone Link, Messages, etc.)
    window.location.href = smsUrl;

    // Record notification in local database
    this.recordSmsNotification();
  }

  /**
   * Copies phone number and text message to clipboard
   */
  copyMessageToClipboard() {
    const ctx = this.currentContext;
    if (!ctx) return;

    const textarea = document.getElementById('dt-sms-message-text');
    const msg = textarea ? textarea.value : ctx.defaultMsg;
    const cleanPhone = ctx.cleanPhone || ctx.phone || 'No phone';

    const fullPayload = `To: ${cleanPhone}\n\n${msg}`;

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(fullPayload).then(() => {
        alert('📋 Message & phone copied to clipboard!\n\nYou can now paste it directly into your messaging app.');
        this.recordSmsNotification();
      }).catch(err => {
        alert('Could not copy automatically. Please copy the text from the preview box.');
      });
    }
  }

  /**
   * Records that SMS notification was sent in IndexedDB / local database mutations
   */
  recordSmsNotification() {
    const ctx = this.currentContext;
    if (!ctx) return;

    const todayStr = new Date().toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
    const notifStatus = `Sent ${todayStr}`;

    // If opened from a table with rowIdx and colIdx, queue local mutation
    if (ctx.rowIdx !== null && ctx.sheetName) {
      this.db.queueMutation({
        sheetName: ctx.sheetName,
        row: ctx.rowIdx,
        col: ctx.colIdx || 9,
        header: 'SMS',
        oldValue: '💬 Send SMS',
        newValue: notifStatus
      });
    }

    // Refresh UI if visible
    if (window.sheetNavigator && window.sheetNavigator.currentSheetKey === 'expiring_certs') {
      window.sheetNavigator.renderExpiringCerts();
    }
    if (window.employeeProfileEngine && window.employeeProfileEngine.currentEmployeeData) {
      const match = window.employeeProfileEngine.currentEmployeeData.certifications.find(c => c.certType === ctx.certType);
      if (match) {
        match.smsStatus = notifStatus;
        const modalBody = document.getElementById('employee-profile-modal-body');
        if (modalBody) window.employeeProfileEngine.renderModalContent(modalBody);
      }
    }

    setTimeout(() => {
      this.closeSmsModal();
    }, 600);
  }

  closeSmsModal() {
    const modal = document.getElementById('sms-notification-modal');
    if (modal) modal.classList.remove('active');
    this.currentContext = null;
  }

  formatDateMMDDYYYY(dateStr) {
    if (!dateStr) return '';
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      return `${parts[1]}/${parts[2]}/${parts[0]}`;
    }
    return dateStr;
  }

  formatTimeAMPM(timeStr) {
    if (!timeStr) return '';
    const parts = timeStr.split(':');
    let hours = parseInt(parts[0], 10);
    const minutes = parts[1];
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12 || 12;
    return `${hours}:${minutes} ${ampm}`;
  }

  escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}

window.smsDialogEngine = new SMSDialogEngine(window.localDB);
