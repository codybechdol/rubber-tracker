/**
 * cpr-roster.js - Red Cross CPR & 1st Aid Class Roster Generator
 * 
 * Discovers employees with upcoming/overdue 1st Aid & CPR certifications,
 * allows interactive selection, validates contact info, and exports formatted
 * CSVs for uploading to the Red Cross portal.
 */

class CprRosterEngine {
  constructor(db) {
    this.db = db;
    this.employeesData = [];
    this.searchQuery = '';
    this.statusFilter = 'candidates'; // 'candidates', 'expired', 'expiring', 'scheduled', 'all'
  }

  /**
   * Opens the Red Cross CPR Class Roster modal.
   */
  openCprRosterModal() {
    this.loadData();
    this.searchQuery = '';
    this.statusFilter = 'candidates';

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
    const snap = this.db.getSnapshot ? this.db.getSnapshot() : null;

    // 1. Build map of CPR / 1st Aid cert dates from expiring_certs (supporting both wide and tall formats)
    const certsMap = {};
    if (certsTable && certsTable.rows) {
      certsTable.rows.forEach(r => {
        const name = this.extractEmployeeName(r).toLowerCase();
        if (!name) return;

        if (!certsMap[name]) {
          certsMap[name] = { cpr: null, firstAid: null };
        }

        // Check if tall format (row per cert)
        const certType = String(r['Cert Type'] || r['Type'] || r['Cert'] || '').toLowerCase();
        const expDate = r['Expiration Date'] || r['Expiration'] || r['Change Out Date'] || r['Date'] || null;
        if (certType) {
          if (certType.includes('cpr')) certsMap[name].cpr = expDate;
          if (certType.includes('1st aid') || certType.includes('first aid')) certsMap[name].firstAid = expDate;
        }

        // Check wide format (columns for each cert)
        Object.keys(r).forEach(k => {
          const kLow = k.toLowerCase();
          if (kLow === 'cpr' || kLow === 'cpr exp' || kLow === 'cpr expiration') {
            if (r[k]) certsMap[name].cpr = r[k];
          }
          if (kLow === '1st aid' || kLow === 'first aid' || kLow === '1st aid exp' || kLow === 'first aid exp') {
            if (r[k]) certsMap[name].firstAid = r[k];
          }
          if (kLow.includes('1st aid / cpr') || kLow.includes('cpr / 1st aid') || kLow.includes('cpr/1st aid')) {
            if (r[k]) {
              certsMap[name].cpr = r[k];
              certsMap[name].firstAid = r[k];
            }
          }
        });
      });
    }

    // 2. Build scheduled map from training_tracking & tasks
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

    // 3. Collect employee roster from employees table or expiring_certs
    let rawEmployees = [];
    if (empTable && empTable.rows && empTable.rows.length > 0) {
      rawEmployees = empTable.rows;
    } else if (certsTable && certsTable.rows && certsTable.rows.length > 0) {
      rawEmployees = certsTable.rows;
    } else if (snap && snap.tables && snap.tables['employees'] && snap.tables['employees'].rows) {
      rawEmployees = snap.tables['employees'].rows;
    }

    const now = new Date();
    const ninetyDaysFromNow = new Date(now.getTime() + (90 * 24 * 60 * 60 * 1000));
    const seenNames = new Set();
    this.employeesData = [];

    rawEmployees.forEach((r, idx) => {
      const rawName = this.extractEmployeeName(r);
      if (!rawName) return;

      const normName = rawName.toLowerCase();
      if (seenNames.has(normName)) return;
      seenNames.add(normName);

      const location = String(r['Location'] || r['City'] || r['Area'] || '').trim();
      const locLower = location.toLowerCase();

      // Skip previous employees
      if (locLower === 'previous employee' || locLower.includes('previous')) return;

      const jobNumber = String(r['Job Number'] || r['Job #'] || r['Crew'] || r['Crew #'] || '').trim();
      const phone = String(r['Phone Number'] || r['Phone'] || r['Cell Phone'] || r['Cell'] || r['Phone #'] || '').trim();
      const email = String(r['Email Address'] || r['Email'] || r['MP Email'] || r['Notification Emails'] || '').trim();

      // Parse first & last name
      const nameParts = this.parseEmployeeName(rawName);

      // Lookup cert info
      const certInfo = certsMap[normName] || certsMap[`${nameParts.lastName.toLowerCase()}, ${nameParts.firstName.toLowerCase()}`] || certsMap[`${nameParts.firstName.toLowerCase()} ${nameParts.lastName.toLowerCase()}`] || {};

      const cprDateStr = certInfo.cpr || null;
      const firstAidDateStr = certInfo.firstAid || null;

      const cprDate = this.parseDate(cprDateStr);
      const isExpired = cprDate ? (cprDate < now) : false;
      const isExpiringSoon = cprDate ? (cprDate <= ninetyDaysFromNow && !isExpired) : false;
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

      // Candidate if overdue, expiring within 90 days, scheduled, or has no record
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

    // Also include any employees from expiring_certs that were not in employees table
    if (certsTable && certsTable.rows) {
      certsTable.rows.forEach((r, idx) => {
        const rawName = this.extractEmployeeName(r);
        if (!rawName) return;

        const normName = rawName.toLowerCase();
        if (seenNames.has(normName)) return;
        seenNames.add(normName);

        const nameParts = this.parseEmployeeName(rawName);
        const certInfo = certsMap[normName] || {};
        const cprDateStr = certInfo.cpr || null;
        const firstAidDateStr = certInfo.firstAid || null;
        const cprDate = this.parseDate(cprDateStr);
        const isExpired = cprDate ? (cprDate < now) : false;
        const isExpiringSoon = cprDate ? (cprDate <= ninetyDaysFromNow && !isExpired) : false;

        let status = 'none';
        if (isExpired) status = 'expired';
        else if (isExpiringSoon) status = 'expiring';
        else if (cprDate) status = 'valid';

        const isCandidate = isExpired || isExpiringSoon || status === 'none';

        this.employeesData.push({
          id: 10000 + idx,
          fullName: rawName,
          firstName: nameParts.firstName,
          lastName: nameParts.lastName,
          email: String(r['Email'] || '').trim(),
          phone: String(r['Phone'] || '').trim(),
          location: String(r['Location'] || '').trim(),
          jobNumber: String(r['Job Number'] || r['Job #'] || '').trim(),
          cprDateStr: cprDateStr,
          firstAidDateStr: firstAidDateStr,
          status: status,
          isCandidate: isCandidate,
          selected: isCandidate
        });
      });
    }

    // Sort by Last Name
    this.employeesData.sort((a, b) => a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName));
  }

  extractEmployeeName(row) {
    if (!row || typeof row !== 'object') return '';
    return String(
      row['Employee Name'] ||
      row['Name'] ||
      row['Employee'] ||
      row['EMPLOYEE'] ||
      row['Full Name'] ||
      row['Lineman'] ||
      row['Worker'] ||
      Object.values(row)[0] ||
      ''
    ).trim();
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

    const candidateCount = this.employeesData.filter(e => e.isCandidate).length;
    const expiredCount = this.employeesData.filter(e => e.status === 'expired').length;
    const expiringCount = this.employeesData.filter(e => e.status === 'expiring').length;

    body.innerHTML = `
      <div style="display: flex; flex-direction: column; gap: 14px;">
        <!-- Header Banner -->
        <div style="background: linear-gradient(135deg, rgba(220, 38, 38, 0.15) 0%, rgba(185, 28, 28, 0.05) 100%); border: 1px solid rgba(220, 38, 38, 0.35); border-radius: 8px; padding: 14px 18px; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px;">
          <div>
            <div style="font-size: 15px; font-weight: 800; color: #fca5a5; display: flex; align-items: center; gap: 8px;">
              <span>🚑</span> Red Cross CPR & 1st Aid Class Roster Generator
            </div>
            <div style="font-size: 12px; color: var(--text-secondary); margin-top: 2px;">
              Discovers overdue, expiring, or scheduled personnel and exports formatted CSV ready for uploading to the Red Cross portal.
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
          <input type="text" id="cpr-search-input" placeholder="🔍 Search employee name, job #, or location..." value="${this.escapeHtml(this.searchQuery)}" oninput="window.cprRosterEngine.onSearchInput(this.value)" style="flex: 1; min-width: 200px; background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 6px; padding: 7px 12px; color: var(--text-primary); font-size: 12.5px;" />
          
          <!-- Category Filter Tabs -->
          <div style="display: flex; align-items: center; gap: 4px; flex-wrap: wrap;">
            <button class="btn btn-secondary ${this.statusFilter === 'candidates' ? 'active' : ''}" onclick="window.cprRosterEngine.setStatusFilter('candidates')" style="font-size: 11px; font-weight: 700; color: #fde047;">
              ⚡ CPR Candidates (${candidateCount})
            </button>
            <button class="btn btn-secondary ${this.statusFilter === 'expired' ? 'active' : ''}" onclick="window.cprRosterEngine.setStatusFilter('expired')" style="font-size: 11px; color: #f87171;">
              🔴 Overdue (${expiredCount})
            </button>
            <button class="btn btn-secondary ${this.statusFilter === 'expiring' ? 'active' : ''}" onclick="window.cprRosterEngine.setStatusFilter('expiring')" style="font-size: 11px; color: #fbbf24;">
              ⏳ Expiring (${expiringCount})
            </button>
            <button class="btn btn-secondary ${this.statusFilter === 'all' ? 'active' : ''}" onclick="window.cprRosterEngine.setStatusFilter('all')" style="font-size: 11px;">
              👥 All (${this.employeesData.length})
            </button>
          </div>

          <!-- Selection Controls -->
          <div style="display: flex; align-items: center; gap: 4px;">
            <button class="btn btn-secondary" onclick="window.cprRosterEngine.selectCandidatesOnly()" style="font-size: 11px; font-weight: 600;" title="Pre-select all overdue and expiring employees">
              ⚡ Pre-Select Candidates
            </button>
            <button class="btn btn-secondary" onclick="window.cprRosterEngine.selectAll(true)" style="font-size: 11px;">
              ☑️ Select All
            </button>
            <button class="btn btn-secondary" onclick="window.cprRosterEngine.selectAll(false)" style="font-size: 11px;">
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
                <th style="width: 160px;">CPR / 1st Aid Status</th>
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

  setStatusFilter(filter) {
    this.statusFilter = filter;
    this.renderModalContent();
  }

  /**
   * Filters employees based on search query and status filter.
   */
  getFilteredEmployees() {
    let list = this.employeesData || [];

    if (this.statusFilter === 'candidates') {
      list = list.filter(e => e.isCandidate);
    } else if (this.statusFilter === 'expired') {
      list = list.filter(e => e.status === 'expired');
    } else if (this.statusFilter === 'expiring') {
      list = list.filter(e => e.status === 'expiring');
    } else if (this.statusFilter === 'scheduled') {
      list = list.filter(e => e.status === 'scheduled');
    }

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
            No employee records match the selected filter.
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
        badgeHtml = `<span class="badge" style="background: rgba(245, 158, 11, 0.2); color: #fde68a; border: 1px solid rgba(245, 158, 11, 0.4); font-size: 11px;">⏳ Expiring (${emp.cprDateStr || '< 90d'})</span>`;
      } else if (emp.status === 'valid') {
        badgeHtml = `<span class="badge" style="background: rgba(16, 185, 129, 0.2); color: #a7f3d0; border: 1px solid rgba(16, 185, 129, 0.4); font-size: 11px;">✅ Valid (${emp.cprDateStr})</span>`;
      } else {
        badgeHtml = '<span class="badge" style="background: rgba(100, 116, 139, 0.2); color: #cbd5e1; border: 1px solid rgba(100, 116, 139, 0.3); font-size: 11px;">⚪ No Date on File</span>';
      }

      const emailHtml = emp.email ? this.escapeHtml(emp.email) : '<span style="color: #ef4444; font-style: italic; font-size: 11px;">⚠️ Missing Email</span>';
      const phoneHtml = emp.phone ? this.escapeHtml(emp.phone) : '<span style="color: #ef4444; font-style: italic; font-size: 11px;">⚠️ Missing Phone</span>';
      const rowBg = emp.selected ? 'background: rgba(239, 68, 68, 0.08);' : '';

      return `
        <tr id="cpr-row-${emp.id}" style="${rowBg}">
          <td style="text-align: center;">
            <input type="checkbox" class="cpr-emp-checkbox" data-id="${emp.id}" ${emp.selected ? 'checked' : ''} onchange="window.cprRosterEngine.toggleEmployeeSelection(${emp.id}, this.checked)" style="accent-color: #ef4444; cursor: pointer;">
          </td>
          <td style="font-weight: 700; color: #f8fafc;">${this.escapeHtml(emp.firstName || emp.fullName)}</td>
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
    const filtered = this.getFilteredEmployees();
    filtered.forEach(e => {
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
        <span style="color: #f8fafc; font-weight: 700;">Selected for CSV:</span>
        <span class="badge" style="background: #ef4444; color: #fff; font-weight: 800; font-size: 11.5px; padding: 2px 8px; border-radius: 12px;">
          ${selected.length}
        </span>
        <span style="color: var(--text-muted);">/ ${this.employeesData.length} total employees</span>
      </div>

      ${missingContact.length > 0 ? `
        <div style="color: #f87171; font-weight: 600; display: flex; align-items: center; gap: 6px;">
          <span>⚠️</span> ${missingContact.length} selected employee(s) missing Email or Phone
        </div>
      ` : `
        <div style="color: #4ade80; font-weight: 600; display: flex; align-items: center; gap: 6px;">
          <span>✅</span> All ${selected.length} selected employees have complete contact info
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

    // Standard Red Cross CSV header: First Name,Last Name,Email,Phone Number
    const lines = ['First Name,Last Name,Email,Phone Number'];

    selected.forEach(e => {
      const fn = this.cleanCsvField(e.firstName || e.fullName);
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
