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

    // 1. Build comprehensive map of CPR / 1st Aid cert records from expiring_certs
    // expiring_certs rows typically have: Employee Name, Item Type (CPR, 1st Aid), Expiration Date, Status, Days Until Expiration
    const certsList = [];
    if (certsTable && certsTable.rows) {
      certsTable.rows.forEach(r => {
        const empName = this.extractEmployeeName(r);
        if (!empName) return;

        const itemType = String(r['Item Type'] || r['Item'] || r['Cert Type'] || r['Type'] || r['Cert'] || '').trim();
        const expDate = r['Expiration Date'] || r['Expiration'] || r['Exp Date'] || r['Change Out Date'] || r['Date'] || null;
        const acqDate = r['Date Acquired'] || r['Acquired Date'] || r['Test Date'] || r['Issue Date'] || null;
        const rawDays = r['Days Until Expiration'] || r['Days Left'] || r['Days'] || null;
        const status = String(r['Status'] || '').trim();

        certsList.push({
          employeeName: empName,
          itemType: itemType,
          expDate: expDate,
          acqDate: acqDate,
          rawDays: rawDays,
          status: status,
          row: r
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
            if (lead) scheduledMap[lead.toLowerCase().trim()] = true;
            if (attendees) {
              attendees.split(',').forEach(a => {
                const aName = a.toLowerCase().trim();
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

    // 3. Collect raw employees from employees table or expiring_certs
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

      const normName = this.normalizeName(rawName);
      if (seenNames.has(normName)) return;
      seenNames.add(normName);

      const location = String(r['Location'] || r['City'] || r['Area'] || '').trim();
      const locLower = location.toLowerCase();

      // Skip previous employees and dummy system rows
      if (locLower === 'previous employee' || locLower.includes('previous')) return;
      if (normName === 'lost' || normName === 'in testing' || normName.includes('system placeholder')) return;

      const jobNumber = String(r['Job Number'] || r['Job #'] || r['Crew'] || r['Crew #'] || '').trim();
      if (jobNumber.startsWith('002-') && (normName === 'lost' || normName.includes('destroyed'))) return;

      const phone = String(r['Phone Number'] || r['Phone'] || r['Cell Phone'] || r['Cell'] || r['Phone #'] || '').trim();
      const email = String(r['Email Address'] || r['Email'] || r['MP Email'] || r['Notification Emails'] || '').trim();

      // Parse first & last name
      const nameParts = this.parseEmployeeName(rawName);

      // Correlate with all CPR & 1st Aid cert records using flexible fuzzy name matching
      let cprCert = null;
      let firstAidCert = null;

      certsList.forEach(c => {
        if (this.isNameMatch(c.employeeName, rawName)) {
          const tLow = c.itemType.toLowerCase();
          if (tLow.includes('cpr') && !cprCert) {
            cprCert = c;
          }
          if ((tLow.includes('1st aid') || tLow.includes('first aid')) && !firstAidCert) {
            firstAidCert = c;
          }
          // Also check composite or wide columns if present on row
          if (!cprCert && (c.row['CPR'] || c.row['CPR Exp'])) {
            cprCert = { expDate: c.row['CPR'] || c.row['CPR Exp'], status: '' };
          }
          if (!firstAidCert && (c.row['1st Aid'] || c.row['First Aid'] || c.row['1st Aid Exp'])) {
            firstAidCert = { expDate: c.row['1st Aid'] || c.row['First Aid'] || c.row['1st Aid Exp'], status: '' };
          }
        }
      });

      const cprDateStr = cprCert ? String(cprCert.expDate || '').trim() : '';
      const firstAidDateStr = firstAidCert ? String(firstAidCert.expDate || '').trim() : '';

      const cprDate = this.parseDate(cprDateStr);
      const firstAidDate = this.parseDate(firstAidDateStr);

      // Check if scheduled
      const isScheduled = !!(scheduledMap[normName] || scheduledMap[`${nameParts.firstName.toLowerCase()} ${nameParts.lastName.toLowerCase()}`] || scheduledMap[rawName.toLowerCase()]);

      // Calculate status for CPR and 1st Aid
      const cprExpired = cprDate ? (cprDate < now) : (cprCert && String(cprCert.status || '').toLowerCase().includes('expired'));
      const cprExpiringSoon = cprDate ? (cprDate <= ninetyDaysFromNow && !cprExpired) : (cprCert && (String(cprCert.status || '').toLowerCase().includes('warning') || String(cprCert.status || '').toLowerCase().includes('upcoming')));

      const faExpired = firstAidDate ? (firstAidDate < now) : (firstAidCert && String(firstAidCert.status || '').toLowerCase().includes('expired'));
      const faExpiringSoon = firstAidDate ? (firstAidDate <= ninetyDaysFromNow && !faExpired) : (firstAidCert && (String(firstAidCert.status || '').toLowerCase().includes('warning') || String(firstAidCert.status || '').toLowerCase().includes('upcoming')));

      let status = 'none';
      let statusDetails = '';

      if (isScheduled) {
        status = 'scheduled';
        statusDetails = 'Scheduled in Training';
      } else if (cprExpired || faExpired) {
        status = 'expired';
        if (cprExpired && faExpired) {
          statusDetails = `CPR: ${cprDateStr || 'Expired'} · 1st Aid: ${firstAidDateStr || 'Expired'}`;
        } else if (cprExpired) {
          statusDetails = `CPR: ${cprDateStr || 'Expired'}`;
        } else {
          statusDetails = `1st Aid: ${firstAidDateStr || 'Expired'}`;
        }
      } else if (cprExpiringSoon || faExpiringSoon) {
        status = 'expiring';
        if (cprExpiringSoon && faExpiringSoon) {
          statusDetails = `CPR: ${cprDateStr} · 1st Aid: ${firstAidDateStr}`;
        } else if (cprExpiringSoon) {
          statusDetails = `CPR: ${cprDateStr}`;
        } else {
          statusDetails = `1st Aid: ${firstAidDateStr}`;
        }
      } else if (cprDate || firstAidDate) {
        status = 'valid';
        if (cprDate && firstAidDate) {
          statusDetails = `CPR: ${cprDateStr} · 1st Aid: ${firstAidDateStr}`;
        } else if (cprDate) {
          statusDetails = `CPR: ${cprDateStr}`;
        } else {
          statusDetails = `1st Aid: ${firstAidDateStr}`;
        }
      } else {
        status = 'none';
        statusDetails = 'No Date on File';
      }

      // Candidate if overdue, expiring within 90 days, scheduled, or has no record
      const isCandidate = isScheduled || status === 'expired' || status === 'expiring' || status === 'none';

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
        statusDetails: statusDetails,
        isCandidate: isCandidate,
        selected: (status === 'expired' || status === 'expiring' || status === 'scheduled') // Pre-select overdue/expiring by default
      });
    });

    // Also include any employees from expiring_certs that were not in employees table
    if (certsTable && certsTable.rows) {
      certsTable.rows.forEach((r, idx) => {
        const rawName = this.extractEmployeeName(r);
        if (!rawName) return;

        const normName = this.normalizeName(rawName);
        if (seenNames.has(normName)) return;
        seenNames.add(normName);

        if (normName === 'lost' || normName === 'in testing' || normName.includes('placeholder')) return;

        const nameParts = this.parseEmployeeName(rawName);
        const itemType = String(r['Item Type'] || r['Type'] || '').toLowerCase();
        const expDate = r['Expiration Date'] || r['Expiration'] || r['Change Out Date'] || null;
        const d = this.parseDate(expDate);

        let status = 'none';
        let statusDetails = '';
        if (itemType.includes('cpr') || itemType.includes('1st aid') || itemType.includes('first aid')) {
          if (d && d < now) {
            status = 'expired';
            statusDetails = `${r['Item Type'] || 'Cert'}: ${expDate || 'Expired'}`;
          } else if (d && d <= ninetyDaysFromNow) {
            status = 'expiring';
            statusDetails = `${r['Item Type'] || 'Cert'}: ${expDate}`;
          } else if (d) {
            status = 'valid';
            statusDetails = `${r['Item Type'] || 'Cert'}: ${expDate}`;
          }
        }

        const isCandidate = status === 'expired' || status === 'expiring' || status === 'none';

        this.employeesData.push({
          id: 10000 + idx,
          fullName: rawName,
          firstName: nameParts.firstName,
          lastName: nameParts.lastName,
          email: String(r['Email'] || '').trim(),
          phone: String(r['Phone'] || '').trim(),
          location: String(r['Location'] || '').trim(),
          jobNumber: String(r['Job Number'] || r['Job #'] || '').trim(),
          cprDateStr: expDate,
          firstAidDateStr: '',
          status: status,
          statusDetails: statusDetails || 'No Date on File',
          isCandidate: isCandidate,
          selected: (status === 'expired' || status === 'expiring')
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

  normalizeName(name) {
    if (!name) return '';
    return String(name)
      .toLowerCase()
      .replace(/\(.*?\)/g, '')
      .replace(/[^a-z0-9]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  normalizeNameCompact(name) {
    if (!name) return '';
    return String(name).toLowerCase()
      .replace(/\(.*?\)/g, '')
      .replace(/[^a-z0-9]/g, '')
      .trim();
  }

  isNameMatch(nameA, nameB) {
    if (!nameA || !nameB) return false;
    if (window.employeeProfileEngine && typeof window.employeeProfileEngine.isNameMatch === 'function') {
      return window.employeeProfileEngine.isNameMatch(nameA, nameB);
    }
    const normA = this.normalizeName(nameA);
    const normB = this.normalizeName(nameB);
    if (!normA || !normB) return false;
    if (normA === normB) return true;

    const compA = this.normalizeNameCompact(nameA);
    const compB = this.normalizeNameCompact(nameB);
    if (compA && compB && compA === compB) return true;

    const wordsA = normA.split(' ').filter(w => w.length > 0);
    const wordsB = normB.split(' ').filter(w => w.length > 0);

    const cleanWordsA = wordsA.filter(w => !['jr', 'sr', 'ii', 'iii', 'iv'].includes(w));
    const cleanWordsB = wordsB.filter(w => !['jr', 'sr', 'ii', 'iii', 'iv'].includes(w));

    if (cleanWordsA.length > 0 && cleanWordsB.length > 0) {
      const setA = new Set(cleanWordsA);
      const setB = new Set(cleanWordsB);
      if (cleanWordsA.every(w => setB.has(w)) && cleanWordsB.every(w => setA.has(w))) {
        return true;
      }

      const [shorter, longer] = cleanWordsA.length <= cleanWordsB.length ? [cleanWordsA, cleanWordsB] : [cleanWordsB, cleanWordsA];
      const longerSet = new Set(longer);
      const majorWords = shorter.filter(w => w.length > 1);
      if (majorWords.length >= 2 && majorWords.every(w => longerSet.has(w))) {
        return true;
      }
    }

    if (cleanWordsA.length >= 2 && cleanWordsB.length >= 2) {
      const firstLastA = cleanWordsA[0] + cleanWordsA.slice(1).join('');
      const lastFirstA = cleanWordsA.slice(1).join('') + cleanWordsA[0];
      const lastFirstFullA = cleanWordsA[cleanWordsA.length - 1] + cleanWordsA.slice(0, -1).join('');
      const firstLastFullA = cleanWordsA.slice(0, -1).join('') + cleanWordsA[cleanWordsA.length - 1];

      const firstLastB = cleanWordsB[0] + cleanWordsB.slice(1).join('');
      const lastFirstB = cleanWordsB.slice(1).join('') + cleanWordsB[0];
      const lastFirstFullB = cleanWordsB[cleanWordsB.length - 1] + cleanWordsB.slice(0, -1).join('');
      const firstLastFullB = cleanWordsB.slice(0, -1).join('') + cleanWordsB[cleanWordsB.length - 1];

      const variantsA = [compA, firstLastA, lastFirstA, lastFirstFullA, firstLastFullA];
      const variantsB = [compB, firstLastB, lastFirstB, lastFirstFullB, firstLastFullB];

      for (const vA of variantsA) {
        if (variantsB.includes(vA)) return true;
      }
    }

    return false;
  }

  /**
   * Splits employee name into first & last name.
   */
  parseEmployeeName(rawName) {
    if (!rawName) return { firstName: '', lastName: '' };
    const cleanStr = String(rawName).replace(/\(.*?\)/g, '').trim();

    if (cleanStr.includes(',')) {
      const parts = cleanStr.split(',');
      const lastName = parts[0].trim();
      const firstName = (parts[1] || '').trim();
      return { firstName, lastName };
    }

    const parts = cleanStr.split(/\s+/);
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
    if (!val || val === 'N/A' || val === '—') return null;
    if (val instanceof Date) return isNaN(val.getTime()) ? null : val;
    const s = String(val).trim();
    if (s.includes('/')) {
      const parts = s.split('/');
      if (parts.length === 3) {
        const m = parseInt(parts[0], 10) - 1;
        const d = parseInt(parts[1], 10);
        let y = parseInt(parts[2], 10);
        if (y < 100) y += 2000;
        const dt = new Date(y, m, d, 12, 0, 0);
        return isNaN(dt.getTime()) ? null : dt;
      }
    }
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
              ⚡ Select Overdue / Expiring
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
                <th style="width: 220px;">CPR / 1st Aid Status</th>
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
               (e.phone && e.phone.includes(q)) ||
               (e.statusDetails && e.statusDetails.toLowerCase().includes(q));
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
        badgeHtml = `<span class="badge" style="background: rgba(59, 130, 246, 0.2); color: #93c5fd; border: 1px solid rgba(59, 130, 246, 0.4); font-size: 11px; font-weight: 700;">📅 Scheduled</span>`;
      } else if (emp.status === 'expired') {
        badgeHtml = `<span class="badge" style="background: rgba(239, 68, 68, 0.25); color: #fca5a5; border: 1px solid rgba(239, 68, 68, 0.5); font-size: 11px; font-weight: 700;">🔴 Overdue (${this.escapeHtml(emp.statusDetails)})</span>`;
      } else if (emp.status === 'expiring') {
        badgeHtml = `<span class="badge" style="background: rgba(245, 158, 11, 0.25); color: #fde68a; border: 1px solid rgba(245, 158, 11, 0.5); font-size: 11px; font-weight: 700;">⏳ Expiring (${this.escapeHtml(emp.statusDetails)})</span>`;
      } else if (emp.status === 'valid') {
        badgeHtml = `<span class="badge" style="background: rgba(16, 185, 129, 0.2); color: #a7f3d0; border: 1px solid rgba(16, 185, 129, 0.4); font-size: 11px;">✅ Valid (${this.escapeHtml(emp.statusDetails)})</span>`;
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
      const shouldSelect = (e.status === 'expired' || e.status === 'expiring' || e.status === 'scheduled');
      e.selected = shouldSelect;
      const row = document.getElementById(`cpr-row-${e.id}`);
      if (row) row.style.background = shouldSelect ? 'rgba(239, 68, 68, 0.08)' : '';
      const cb = document.querySelector(`.cpr-emp-checkbox[data-id="${e.id}"]`);
      if (cb) cb.checked = shouldSelect;
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
