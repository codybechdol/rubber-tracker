/**
 * cpr-roster.js - Red Cross CPR & 1st Aid Class Roster Generator
 * 
 * Provides an interactive modal to discover CPR candidates, validate contact details,
 * and export rosters formatted directly for Red Cross portal uploading.
 */

class CprRosterEngine {
  constructor(db) {
    this.db = db;
    this.employeesData = [];
    this.searchQuery = '';
    this.statusFilter = 'all'; // 'all', 'candidates', 'expiring', 'scheduled', 'valid'
  }

  /**
   * Opens the Red Cross CPR Class Roster modal.
   */
  openCprRosterModal() {
    this.loadData();
    this.searchQuery = '';
    this.statusFilter = 'candidates'; // Default to selecting candidates

    const modal = document.getElementById('cpr-roster-modal');
    if (!modal) return;

    modal.style.display = 'flex';
    this.renderModalContent();
  }

  /**
   * Closes the Red Cross CPR modal.
   */
  closeCprRosterModal() {
    const modal = document.getElementById('cpr-roster-modal');
    if (modal) modal.style.display = 'none';
  }

  /**
   * Loads employee data and correlates with Expiring Certs and scheduled tasks.
   */
  loadData() {
    const empTable = this.db.getTable('employees');
    const certsTable = this.db.getTable('expiring_certs');
    const trainTable = this.db.getTable('training_tracking');
    const tasksTable = this.db.getTable('tasks');

    if (!empTable || !empTable.rows) {
      this.employeesData = [];
      return;
    }

    // Build map of CPR / 1st Aid cert dates from expiring_certs
    const certsMap = {};
    if (certsTable && certsTable.rows) {
      certsTable.rows.forEach(r => {
        const name = String(r['Employee Name'] || r['Name'] || r['Employee'] || '').toLowerCase().trim();
        if (!name) return;

        certsMap[name] = {
          cpr: r['CPR'] || r['CPR Exp'] || r['CPR Expiration'] || null,
          firstAid: r['1st Aid'] || r['First Aid'] || r['First Aid Exp'] || null
        };
      });
    }

    // Build scheduled map from training_tracking & tasks
    const scheduledMap = {};
    if (trainTable && trainTable.rows) {
      trainTable.rows.forEach(r => {
        const topic = String(r['Topic'] || r['Training'] || r['Type'] || '').toLowerCase();
        const status = String(r['Status'] || '').toLowerCase();
        const attendees = String(r['Attendees'] || r['Crew Members'] || '').toLowerCase();
        const lead = String(r['Lead'] || r['Foreman'] || '').toLowerCase();

        if (status !== 'completed' && status !== 'complete') {
          if (topic.includes('cpr') || topic.includes('first aid') || topic.includes('1st aid')) {
            if (lead) scheduledMap[lead] = true;
            if (attendees) {
              attendees.split(',').forEach(a => {
                const aName = a.trim();
                if (aName) scheduledMap[aName] = true;
              });
            }
          }
        }
      });
    }

    if (tasksTable && tasksTable.rows) {
      tasksTable.rows.forEach(r => {
        const type = String(r['Task Type'] || r['Type'] || '').toLowerCase();
        const desc = String(r['Description'] || r['Item'] || '').toLowerCase();
        const emp = String(r['Assigned To'] || r['Employee'] || '').toLowerCase().trim();
        const status = String(r['Status'] || '').toLowerCase();

        if (status !== 'completed' && status !== 'complete') {
          if (type.includes('cpr') || desc.includes('cpr') || type.includes('1st aid') || desc.includes('1st aid')) {
            if (emp) scheduledMap[emp] = true;
          }
        }
      });
    }

    const now = new Date();
    const sixtyDaysFromNow = new Date(now.getTime() + (60 * 24 * 60 * 60 * 1000));

    this.employeesData = [];

    empTable.rows.forEach((r, idx) => {
      const rawName = String(r['Name'] || '').trim();
      if (!rawName) return;

      const location = String(r['Location'] || '').trim();
      const locLower = location.toLowerCase();

      // Skip previous employees
      if (locLower === 'previous employee' || locLower.includes('previous')) return;

      const jobNumber = String(r['Job Number'] || r['Job #'] || '').trim();
      const phone = String(r['Phone'] || r['Cell Phone'] || r['Phone #'] || '').trim();
      const email = String(r['Email'] || r['MP Email'] || r['Notification Emails'] || '').trim();

      // Parse first & last name
      const nameParts = this.parseEmployeeName(rawName);

      // Lookup cert info
      const normName = rawName.toLowerCase();
      const certInfo = certsMap[normName] || certsMap[`${nameParts.lastName.toLowerCase()}, ${nameParts.firstName.toLowerCase()}`] || {};

      const cprDateStr = certInfo.cpr || null;
      const firstAidDateStr = certInfo.firstAid || null;

      const cprDate = this.parseDate(cprDateStr);
      const isExpired = cprDate ? (cprDate < now) : false;
      const isExpiringSoon = cprDate ? (cprDate <= sixtyDaysFromNow) : false;
      const isScheduled = scheduledMap[normName] || scheduledMap[`${nameParts.firstName.toLowerCase()} ${nameParts.lastName.toLowerCase()}`] || false;

      let status = 'none';
      if (isScheduled) {
        status = 'scheduled';
      } else if (isExpired) {
        status = 'expired';
      } else if (isExpiringSoon) {
        status = 'expiring';
      } else if (cprDate) {
        status = 'valid';
      }

      const isCandidate = isScheduled || isExpired || isExpiringSoon || status === 'none';

      this.employeesData.push({
        id: idx,
        fullName: rawName,
        firstName: nameParts.firstName,
        lastName: nameParts.lastName,
        email: email,
        phone: phone,
        location: location,
        jobNumber: jobNumber,
        cprDateStr: cprDateStr,
        firstAidDateStr: firstAidDateStr,
        status: status,
        isCandidate: isCandidate,
        selected: isCandidate // Pre-select candidates by default
      });
    });

    // Sort by Last Name
    this.employeesData.sort((a, b) => a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName));
  }

  /**
   * Splits employee name into first & last name.
   */
  parseEmployeeName(rawName) {
    if (!rawName) return { firstName: '', lastName: '' };
    const str = rawName.trim();

    if (str.includes(',')) {
      const parts = str.split(',');
      const lastName = parts[0].trim();
      const firstName = (parts[1] || '').trim();
      return { firstName, lastName };
    }

    const parts = str.split(/\s+/);
    if (parts.length === 1) {
      return { firstName: parts[0], lastName: '' };
    }

    const firstName = parts[0];
    const lastName = parts.slice(1).join(' ');
    return { firstName, lastName };
  }

  /**
   * Safe date parser.
   */
  parseDate(val) {
    if (!val) return null;
    if (val instanceof Date) return isNaN(val.getTime()) ? null : val;
    const d = new Date(val);
    return isNaN(d.getTime()) ? null : d;
  }

  /**
   * Renders the complete modal layout and table.
   */
  renderModalContent() {
    const body = document.getElementById('cpr-roster-modal-body');
    if (!body) return;

    body.innerHTML = `
      <div style="display: flex; flex-direction: column; gap: 14px;">
        <!-- Header Banner -->
        <div style="background: linear-gradient(135deg, rgba(220, 38, 38, 0.15) 0%, rgba(185, 28, 28, 0.05) 100%); border: 1px solid rgba(220, 38, 38, 0.35); border-radius: 8px; padding: 14px 18px; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px;">
          <div>
            <div style="font-size: 15px; font-weight: 800; color: #fca5a5; display: flex; align-items: center; gap: 8px;">
              <span>🚑</span> Red Cross CPR & 1st Aid Class Roster Generator
            </div>
            <div style="font-size: 12px; color: var(--text-secondary); margin-top: 2px;">
              Pre-selects overdue, expiring, or scheduled personnel and exports formatted CSV ready for uploading to Red Cross.
            </div>
          </div>
          <div style="display: flex; gap: 8px;">
            <button class="btn btn-secondary" onclick="window.cprRosterEngine.copyCsvToClipboard()" style="font-size: 12px; font-weight: 700; background: #1e293b; border: 1px solid #475569; color: #93c5fd; display: flex; align-items: center; gap: 6px;">
              <span>📋</span> Copy CSV
            </button>
            <button class="btn btn-primary" onclick="window.cprRosterEngine.downloadCsv()" style="font-size: 12px; font-weight: 700; background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%); border: none; display: flex; align-items: center; gap: 6px; box-shadow: 0 2px 8px rgba(239, 68, 68, 0.4);">
              <span>📥</span> Download CSV
            </button>
          </div>
        </div>

        <!-- Filter & Search Toolbar -->
        <div style="display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap;">
          <input type="text" id="cpr-search-input" placeholder="🔍 Search employee name, job #, or location..." value="${this.escapeHtml(this.searchQuery)}" oninput="window.cprRosterEngine.onSearchInput(this.value)" style="flex: 1; min-width: 220px; background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 6px; padding: 7px 12px; color: var(--text-primary); font-size: 12.5px;" />
          
          <div style="display: flex; align-items: center; gap: 6px;">
            <button class="btn btn-secondary" onclick="window.cprRosterEngine.selectCandidatesOnly()" style="font-size: 11.5px; font-weight: 700; color: #facc15;">
              ⚡ Pre-Select CPR Candidates
            </button>
            <button class="btn btn-secondary" onclick="window.cprRosterEngine.selectAll(true)" style="font-size: 11.5px;">
              ☑️ Select All
            </button>
            <button class="btn btn-secondary" onclick="window.cprRosterEngine.selectAll(false)" style="font-size: 11.5px;">
              ⬜ Clear
            </button>
          </div>
        </div>

        <!-- Selection Stats & Warning Bar -->
        <div id="cpr-stats-bar" style="background: rgba(30, 41, 59, 0.8); border: 1px solid var(--border-color); border-radius: 6px; padding: 8px 14px; font-size: 12px; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px;">
          <!-- Injected dynamically -->
        </div>

        <!-- Employee Table -->
        <div style="max-height: 480px; overflow-y: auto; border: 1px solid var(--border-color); border-radius: 8px; background: var(--bg-primary);">
          <table class="data-table" style="width: 100%; border-collapse: collapse; font-size: 12.5px;">
            <thead>
              <tr style="position: sticky; top: 0; background: #1e293b; z-index: 5; border-bottom: 2px solid #334155;">
                <th style="width: 44px; text-align: center;">
                  <input type="checkbox" id="cpr-master-checkbox" onchange="window.cprRosterEngine.toggleMasterCheckbox(this.checked)" style="accent-color: #ef4444; cursor: pointer;">
                </th>
                <th>First Name</th>
                <th>Last Name</th>
                <th>Email Address</th>
                <th>Phone Number</th>
                <th>Location / Crew</th>
                <th style="width: 140px;">CPR / 1st Aid Status</th>
              </tr>
            </thead>
            <tbody id="cpr-table-body">
              ${this.renderTableRowsHtml()}
            </tbody>
          </table>
        </div>
      </div>
    `;

    this.updateStatsBar();
  }

  /**
   * Filters employees based on search query.
   */
  getFilteredEmployees() {
    let list = this.employeesData || [];
    if (this.searchQuery && this.searchQuery.trim()) {
      const q = this.searchQuery.toLowerCase().trim();
      list = list.filter(e => {
        return (e.fullName && e.fullName.toLowerCase().includes(q)) ||
               (e.firstName && e.firstName.toLowerCase().includes(q)) ||
               (e.lastName && e.lastName.toLowerCase().includes(q)) ||
               (e.location && e.location.toLowerCase().includes(q)) ||
               (e.jobNumber && e.jobNumber.toLowerCase().includes(q)) ||
               (e.email && e.email.toLowerCase().includes(q)) ||
               (e.phone && e.phone.includes(q));
      });
    }
    return list;
  }

  /**
   * Renders the table body rows HTML.
   */
  renderTableRowsHtml() {
    const list = this.getFilteredEmployees();
    if (list.length === 0) {
      return `
        <tr>
          <td colspan="7" style="padding: 32px 16px; text-align: center; color: var(--text-muted);">
            No employee records match your search query.
          </td>
        </tr>
      `;
    }

    return list.map(emp => {
      let badgeHtml = '';
      if (emp.status === 'scheduled') {
        badgeHtml = '<span class="badge" style="background: rgba(59, 130, 246, 0.2); color: #93c5fd; border: 1px solid rgba(59, 130, 246, 0.4); font-size: 11px;">📅 Scheduled</span>';
      } else if (emp.status === 'expired') {
        badgeHtml = `<span class="badge" style="background: rgba(239, 68, 68, 0.2); color: #fca5a5; border: 1px solid rgba(239, 68, 68, 0.4); font-size: 11px;">❌ Overdue (${emp.cprDateStr || 'Expired'})</span>`;
      } else if (emp.status === 'expiring') {
        badgeHtml = `<span class="badge" style="background: rgba(245, 158, 11, 0.2); color: #fde68a; border: 1px solid rgba(245, 158, 11, 0.4); font-size: 11px;">⏳ Expiring (${emp.cprDateStr || '< 60d'})</span>`;
      } else if (emp.status === 'valid') {
        badgeHtml = `<span class="badge" style="background: rgba(16, 185, 129, 0.2); color: #a7f3d0; border: 1px solid rgba(16, 185, 129, 0.4); font-size: 11px;">✅ Valid (${emp.cprDateStr})</span>`;
      } else {
        badgeHtml = '<span class="badge" style="background: rgba(100, 116, 139, 0.2); color: #cbd5e1; border: 1px solid rgba(100, 116, 139, 0.3); font-size: 11px;">⚪ No Record</span>';
      }

      const emailHtml = emp.email ? this.escapeHtml(emp.email) : '<span style="color: #ef4444; font-style: italic; font-size: 11px;">⚠️ Missing Email</span>';
      const phoneHtml = emp.phone ? this.escapeHtml(emp.phone) : '<span style="color: #ef4444; font-style: italic; font-size: 11px;">⚠️ Missing Phone</span>';
      const rowBg = emp.selected ? 'background: rgba(239, 68, 68, 0.08);' : '';

      return `
        <tr id="cpr-row-${emp.id}" style="${rowBg}">
          <td style="text-align: center;">
            <input type="checkbox" class="cpr-emp-checkbox" data-id="${emp.id}" ${emp.selected ? 'checked' : ''} onchange="window.cprRosterEngine.toggleEmployeeSelection(${emp.id}, this.checked)" style="accent-color: #ef4444; cursor: pointer;">
          </td>
          <td style="font-weight: 700; color: #f8fafc;">${this.escapeHtml(emp.firstName)}</td>
          <td style="font-weight: 700; color: #f8fafc;">${this.escapeHtml(emp.lastName)}</td>
          <td>${emailHtml}</td>
          <td style="font-family: monospace; color: #93c5fd;">${phoneHtml}</td>
          <td>${this.escapeHtml(emp.location || '—')} ${emp.jobNumber ? `<span style="font-family: monospace; color: #60a5fa;">(${this.escapeHtml(emp.jobNumber)})</span>` : ''}</td>
          <td>${badgeHtml}</td>
        </tr>
      `;
    }).join('');
  }

  onSearchInput(val) {
    this.searchQuery = val || '';
    const tbody = document.getElementById('cpr-table-body');
    if (tbody) tbody.innerHTML = this.renderTableRowsHtml();
    this.updateStatsBar();
  }

  toggleEmployeeSelection(id, checked) {
    const emp = this.employeesData.find(e => e.id === id);
    if (emp) {
      emp.selected = checked;
      const row = document.getElementById(`cpr-row-${id}`);
      if (row) row.style.background = checked ? 'rgba(239, 68, 68, 0.08)' : '';
    }
    this.updateStatsBar();
  }

  toggleMasterCheckbox(checked) {
    const filtered = this.getFilteredEmployees();
    filtered.forEach(e => {
      e.selected = checked;
      const row = document.getElementById(`cpr-row-${e.id}`);
      if (row) row.style.background = checked ? 'rgba(239, 68, 68, 0.08)' : '';
      const cb = document.querySelector(`.cpr-emp-checkbox[data-id="${e.id}"]`);
      if (cb) cb.checked = checked;
    });
    this.updateStatsBar();
  }

  selectAll(checked) {
    this.employeesData.forEach(e => {
      e.selected = checked;
      const row = document.getElementById(`cpr-row-${e.id}`);
      if (row) row.style.background = checked ? 'rgba(239, 68, 68, 0.08)' : '';
      const cb = document.querySelector(`.cpr-emp-checkbox[data-id="${e.id}"]`);
      if (cb) cb.checked = checked;
    });
    const masterCb = document.getElementById('cpr-master-checkbox');
    if (masterCb) masterCb.checked = checked;
    this.updateStatsBar();
  }

  selectCandidatesOnly() {
    this.employeesData.forEach(e => {
      e.selected = e.isCandidate;
      const row = document.getElementById(`cpr-row-${e.id}`);
      if (row) row.style.background = e.isCandidate ? 'rgba(239, 68, 68, 0.08)' : '';
      const cb = document.querySelector(`.cpr-emp-checkbox[data-id="${e.id}"]`);
      if (cb) cb.checked = e.isCandidate;
    });
    const masterCb = document.getElementById('cpr-master-checkbox');
    if (masterCb) masterCb.checked = false;
    this.updateStatsBar();
  }

  updateStatsBar() {
    const statsBar = document.getElementById('cpr-stats-bar');
    if (!statsBar) return;

    const selected = this.employeesData.filter(e => e.selected);
    const missingContact = selected.filter(e => !e.email || !e.phone);

    statsBar.innerHTML = `
      <div style="display: flex; align-items: center; gap: 8px;">
        <span style="color: #f8fafc; font-weight: 700;">Selected:</span>
        <span class="badge" style="background: #ef4444; color: #fff; font-weight: 800; font-size: 11.5px; padding: 2px 8px; border-radius: 12px;">
          ${selected.length}
        </span>
        <span style="color: var(--text-muted);">/ ${this.employeesData.length} active employees</span>
      </div>

      ${missingContact.length > 0 ? `
        <div style="color: #f87171; font-weight: 600; display: flex; align-items: center; gap: 6px;">
          <span>⚠️</span> ${missingContact.length} selected employee(s) missing Email or Phone
        </div>
      ` : `
        <div style="color: #4ade80; font-weight: 600; display: flex; align-items: center; gap: 6px;">
          <span>✅</span> All selected employees have contact info
        </div>
      `}
    `;
  }

  /**
   * Generates the CSV string for selected employees matching Red Cross portal format.
   */
  generateCsvContent() {
    const selected = this.employeesData.filter(e => e.selected);
    if (selected.length === 0) return null;

    // Standard Red Cross CSV header
    const lines = ['First Name,Last Name,Email,Phone Number'];

    selected.forEach(e => {
      const fn = this.cleanCsvField(e.firstName);
      const ln = this.cleanCsvField(e.lastName);
      const email = this.cleanCsvField(e.email || '');

      let rawPhone = String(e.phone || '').replace(/\D/g, '');
      if (rawPhone.length === 11 && rawPhone.startsWith('1')) rawPhone = rawPhone.substring(1);
      const phone = this.cleanCsvField(rawPhone);

      lines.push(`${fn},${ln},${email},${phone}`);
    });

    return lines.join('\r\n');
  }

  cleanCsvField(val) {
    if (!val) return '';
    let str = String(val).trim();
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      str = '"' + str.replace(/"/g, '""') + '"';
    }
    return str;
  }

  /**
   * Copies formatted CSV directly to user clipboard.
   */
  copyCsvToClipboard() {
    const csv = this.generateCsvContent();
    if (!csv) {
      alert('⚠️ Please select at least one employee for the CPR roster.');
      return;
    }

    navigator.clipboard.writeText(csv).then(() => {
      const selectedCount = this.employeesData.filter(e => e.selected).length;
      alert(`✅ Red Cross CPR CSV copied to clipboard (${selectedCount} employees)!\n\nYou can now paste directly into the Red Cross website.`);
    }).catch(err => {
      console.error('Clipboard copy failed:', err);
      prompt('Copy the CPR CSV data below:', csv);
    });
  }

  /**
   * Downloads formatted CSV file to user's computer.
   */
  downloadCsv() {
    const csv = this.generateCsvContent();
    if (!csv) {
      alert('⚠️ Please select at least one employee for the CPR roster.');
      return;
    }

    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    const filename = `Red_Cross_CPR_Roster_${yyyy}-${mm}-${dd}.csv`;

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  escapeHtml(str) {
    if (!str && str !== 0) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}

// Attach globally
window.CprRosterEngine = CprRosterEngine;
