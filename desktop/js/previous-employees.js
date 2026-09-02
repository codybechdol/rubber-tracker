/**
 * previous-employees.js - Previous Employees Workspace & Rehire Engine
 * Provides dedicated offline workspace for viewing departed staff history, uncollected PPE, and one-click rehire workflows.
 */

class PreviousEmployeesEngine {
  constructor(db) {
    this.db = db;
    this.searchTerm = '';
    this.locationFilter = 'all';
    this.ppeFilter = 'all'; // 'all' | 'unreturned' | 'cleared'
    this.sortCol = 'lastDay';
    this.sortDir = 'desc';
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

  escapeJs(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/\\/g, '\\\\')
      .replace(/'/g, "\\'")
      .replace(/"/g, '&quot;')
      .replace(/[\n\r]/g, ' ');
  }

  normalizeName(name) {
    if (!name) return '';
    return String(name).toLowerCase()
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

  parseDate(val) {
    if (!val || val === 'N/A' || val === '—' || val === '-') return null;
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
    if (s.includes('-')) {
      const parts = s.split('-');
      if (parts.length === 3) {
        const y = parseInt(parts[0], 10);
        const m = parseInt(parts[1], 10) - 1;
        const d = parseInt(parts[2], 10);
        const dt = new Date(y, m, d, 12, 0, 0);
        return isNaN(dt.getTime()) ? null : dt;
      }
    }
    const dt = new Date(s);
    return isNaN(dt.getTime()) ? null : dt;
  }

  formatDate(d) {
    if (!d || !(d instanceof Date) || isNaN(d.getTime())) return '';
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const yyyy = d.getFullYear();
    return `${mm}/${dd}/${yyyy}`;
  }

  isValidEmployeeName(name) {
    if (!name || typeof name !== 'string') return false;
    const clean = name.trim();
    if (clean.length < 2 || clean.length > 60) return false;

    // Reject standard date formats (e.g. MM/DD/YYYY, YYYY-MM-DD, M/D/YY, 08.23.2026)
    if (/^\d{1,4}[.\/-]\d{1,2}[.\/-]\d{1,4}$/.test(clean)) return false;
    if (/^\d{1,2}[.\/-]\d{1,2}[.\/-]\d{2,4}$/.test(clean)) return false;
    if (/^[A-Za-z]{3,9}\s+\d{1,2},?\s+\d{4}$/.test(clean)) return false; // August 23, 2026
    if (/^\d{1,2}-[A-Za-z]{3,9}-\d{2,4}$/.test(clean)) return false; // 23-Aug-2026

    // Reject strings composed purely of digits, spaces, and punctuation
    if (/^[\d\s.,#\-_/():;'"[\]{}]+$/.test(clean)) return false;

    // Must have at least two alphabetic characters
    const letters = clean.match(/[a-zA-Z]/g);
    if (!letters || letters.length < 2) return false;

    // Reject obvious header names or system keywords
    const lower = clean.toLowerCase();
    const blacklist = [
      'employee name', 'employee', 'worker', 'full name', 'first name', 'last name',
      'date', 'date changed', 'event', 'event type', 'action', 'type',
      'location', 'job number', 'job #', 'hire date', 'last day', 'last day reason',
      'rehire date', 'notes', 'status', 'classification', 'total', 'count',
      'unknown', 'n/a', 'none', 'null', 'undefined', 'previous employee', 'previous employees', 'past employees'
    ];
    if (blacklist.includes(lower)) return false;

    return true;
  }

  extractRowValue(row, headers, aliasList) {
    if (!row) return '';
    const rowKeys = Object.keys(row);
    for (const alias of aliasList) {
      const aliasNorm = alias.toLowerCase().replace(/[^a-z0-9]/g, '');
      for (const k of rowKeys) {
        if (k.startsWith('_')) continue;
        const kNorm = k.toLowerCase().replace(/[^a-z0-9]/g, '');
        if (kNorm === aliasNorm) {
          const val = row[k];
          if (val !== undefined && val !== null && String(val).trim() !== '') {
            return String(val).trim();
          }
        }
      }
    }

    if (headers && Array.isArray(headers)) {
      for (const alias of aliasList) {
        const aliasNorm = alias.toLowerCase().replace(/[^a-z0-9]/g, '');
        for (let hIdx = 0; hIdx < headers.length; hIdx++) {
          const hNorm = String(headers[hIdx] || '').toLowerCase().replace(/[^a-z0-9]/g, '');
          if (hNorm === aliasNorm) {
            if (Array.isArray(row) && row[hIdx] !== undefined) {
              return String(row[hIdx] || '').trim();
            }
            if (row[headers[hIdx]] !== undefined && row[headers[hIdx]] !== null && String(row[headers[hIdx]]).trim() !== '') {
              return String(row[headers[hIdx]]).trim();
            }
          }
        }
      }
    }

    return '';
  }

  extractEmployeeNameFromRow(row, headers) {
    if (!row) return '';
    const aliases = ['Employee Name', 'Name', 'Worker', 'Employee', 'Full Name'];
    const candidate = this.extractRowValue(row, headers, aliases);
    if (candidate && this.isValidEmployeeName(candidate)) {
      return candidate;
    }

    if (typeof row === 'object') {
      for (const k of Object.keys(row)) {
        if (k.startsWith('_')) continue;
        const kl = k.toLowerCase();
        if (kl.includes('name') || kl.includes('worker') || kl.includes('employee') || kl.includes('person') || kl.includes('staff')) {
          const val = String(row[k] || '').trim();
          if (val && this.isValidEmployeeName(val)) {
            return val;
          }
        }
      }
    }

    return '';
  }

  /**
   * Compiles all departed / former employees from employee_history, previous_employees, and employees table.
   */
  getPreviousEmployees() {
    if (!this.db) this.db = window.localDB || window.safetyDB;
    if (!this.db) return [];

    const snap = this.db.getSnapshot();
    if (!snap || !snap.tables) return [];

    const empTable = snap.tables['employees'];
    const histTable = snap.tables['employee_history'];
    const prevSheetTable = snap.tables['previous_employees'] || snap.tables['previous_employee'] || snap.tables['past_employees'];
    const glovesTable = snap.tables['gloves'];
    const sleevesTable = snap.tables['sleeves'];

    const prevMap = new Map(); // normName -> employeeObject

    // 1. Scan Employee History sheet
    if (histTable && histTable.rows) {
      const headers = histTable.headers || [];
      histTable.rows.forEach(r => {
        const name = this.extractEmployeeNameFromRow(r, headers);
        if (!name || !this.isValidEmployeeName(name)) return;
        const norm = this.normalizeName(name);

        const eventType = this.extractRowValue(r, headers, ['Event Type', 'Event', 'Action', 'Type']);
        const dateStr = this.extractRowValue(r, headers, ['Date', 'Date Changed', 'Timestamp', 'Event Date']);
        const loc = this.extractRowValue(r, headers, ['Location', 'City', 'Yard', 'Shop']);
        const job = this.extractRowValue(r, headers, ['Job Number', 'Job #', 'Job', 'Crew', 'Crew #']);
        const hireDate = this.extractRowValue(r, headers, ['Hire Date', 'Hire', 'Start Date']);
        const lastDay = this.extractRowValue(r, headers, ['Last Day', 'Term Date', 'Termination Date', 'End Date', 'Departure Date']);
        const lastReason = this.extractRowValue(r, headers, ['Last Day Reason', 'Reason', 'Notes', 'Details', 'Comments']);

        if (!prevMap.has(norm)) {
          prevMap.set(norm, {
            name: name,
            lastLocation: loc || 'Unknown',
            lastJob: job || 'N/A',
            lastClassification: 'Lineman',
            hireDate: hireDate || '',
            lastDay: lastDay || dateStr || '',
            lastReason: lastReason || eventType || 'Departed',
            historyEvents: [],
            unreturnedGloves: [],
            unreturnedSleeves: [],
            isActive: false
          });
        }

        const entry = prevMap.get(norm);
        if (loc && entry.lastLocation === 'Unknown') entry.lastLocation = loc;
        if (job && entry.lastJob === 'N/A') entry.lastJob = job;
        if (hireDate && !entry.hireDate) entry.hireDate = hireDate;
        if (lastDay && !entry.lastDay) entry.lastDay = lastDay;
        if (lastReason && (!entry.lastReason || entry.lastReason === 'Departed')) entry.lastReason = lastReason;

        if (dateStr || eventType) {
          entry.historyEvents.push({
            date: dateStr,
            eventType: eventType || 'History Event',
            location: loc,
            jobNumber: job,
            notes: lastReason
          });
        }
      });
    }

    // 2. Scan dedicated Previous Employees sheet if present from Google Sheets
    if (prevSheetTable && prevSheetTable.rows) {
      const headers = prevSheetTable.headers || [];
      prevSheetTable.rows.forEach(r => {
        const name = this.extractEmployeeNameFromRow(r, headers);
        if (!name || !this.isValidEmployeeName(name)) return;
        const norm = this.normalizeName(name);

        const loc = this.extractRowValue(r, headers, ['Location', 'City', 'Yard', 'Shop']);
        const job = this.extractRowValue(r, headers, ['Job Number', 'Job #', 'Job', 'Crew', 'Crew #']);
        const role = this.extractRowValue(r, headers, ['Job Classification', 'Classification', 'Role', 'Title', 'Position']);
        const hireDate = this.extractRowValue(r, headers, ['Hire Date', 'Hire', 'Start Date']);
        const lastDay = this.extractRowValue(r, headers, ['Last Day', 'Term Date', 'Termination Date', 'End Date', 'Departure Date', 'Date']);
        const lastReason = this.extractRowValue(r, headers, ['Last Day Reason', 'Reason', 'Notes', 'Details', 'Comments', 'Status']);

        if (!prevMap.has(norm)) {
          prevMap.set(norm, {
            name: name,
            lastLocation: loc || 'Unknown',
            lastJob: job || 'N/A',
            lastClassification: role || 'Lineman',
            hireDate: hireDate || '',
            lastDay: lastDay || '',
            lastReason: lastReason || 'Previous Employee',
            historyEvents: [],
            unreturnedGloves: [],
            unreturnedSleeves: [],
            isActive: false
          });
        } else {
          const entry = prevMap.get(norm);
          if (loc && entry.lastLocation === 'Unknown') entry.lastLocation = loc;
          if (job && entry.lastJob === 'N/A') entry.lastJob = job;
          if (role && entry.lastClassification === 'Lineman') entry.lastClassification = role;
          if (hireDate && !entry.hireDate) entry.hireDate = hireDate;
          if (lastDay && !entry.lastDay) entry.lastDay = lastDay;
          if (lastReason && (!entry.lastReason || entry.lastReason === 'Departed')) entry.lastReason = lastReason;
        }
      });
    }

    // 3. Scan Active / Inactive rows in Employees table
    if (empTable && empTable.rows) {
      const headers = empTable.headers || [];
      empTable.rows.forEach(r => {
        const name = this.extractEmployeeNameFromRow(r, headers);
        if (!name || !this.isValidEmployeeName(name)) return;
        const norm = this.normalizeName(name);

        const loc = this.extractRowValue(r, headers, ['Location', 'City', 'Yard']);
        const locLower = loc.toLowerCase();
        const status = this.extractRowValue(r, headers, ['Status', 'Employee Status']).toLowerCase();
        const job = this.extractRowValue(r, headers, ['Job Number', 'Job #', 'Job', 'Crew']);
        const role = this.extractRowValue(r, headers, ['Job Classification', 'Classification', 'Role', 'Title']);
        const hireDate = this.extractRowValue(r, headers, ['Hire Date', 'Hire', 'Start Date']);
        const lastDay = this.extractRowValue(r, headers, ['Last Day', 'Term Date', 'End Date']);
        const lastReason = this.extractRowValue(r, headers, ['Last Day Reason', 'Reason', 'Notes', 'Details']);

        const isPrevious = locLower === 'previous employee' || locLower.includes('previous') ||
                           status === 'previous employee' || status.includes('inactive') || status.includes('terminated') || status.includes('departed');

        if (isPrevious) {
          if (!prevMap.has(norm)) {
            prevMap.set(norm, {
              name: name,
              lastLocation: locLower === 'previous employee' ? 'Unknown' : loc,
              lastJob: job || 'N/A',
              lastClassification: role || 'Lineman',
              hireDate: hireDate || '',
              lastDay: lastDay || '',
              lastReason: lastReason || 'Previous Employee',
              historyEvents: [],
              unreturnedGloves: [],
              unreturnedSleeves: [],
              isActive: false
            });
          } else {
            const entry = prevMap.get(norm);
            if (role) entry.lastClassification = role;
            if (hireDate && !entry.hireDate) entry.hireDate = hireDate;
            if (lastDay && !entry.lastDay) entry.lastDay = lastDay;
            if (lastReason && (!entry.lastReason || entry.lastReason === 'Departed')) entry.lastReason = lastReason;
          }
        } else {
          // If an active employee exists with this exact name, mark as currently active
          if (prevMap.has(norm)) {
            prevMap.get(norm).isActive = true;
          }
        }
      });
    }

    // 4. Scan Unreturned PPE (Gloves & Sleeves) assigned to former workers
    const scanPPE = (table, targetProp) => {
      if (!table || !table.rows) return;
      table.rows.forEach(item => {
        const assignedTo = String(item['Assigned To'] || item['Assigned'] || '').trim();
        if (!assignedTo) return;
        const holderLower = assignedTo.toLowerCase();
        const nonHolders = ['on shelf', 'in testing', 'packed for testing', 'packed for delivery', 'failed rubber', 'lost', 'destroyed', 'unassigned'];
        if (nonHolders.includes(holderLower)) return;

        const itemLoc = String(item['Location'] || '').toLowerCase();
        const itemStat = String(item['Status'] || '').toLowerCase();

        for (const [norm, prevEmp] of prevMap.entries()) {
          if (this.isNameMatch(assignedTo, prevEmp.name)) {
            const itemNum = String(item['Item #'] || item['Glove'] || item['Sleeve'] || item['Serial #'] || Object.values(item)[0] || '').trim();
            const eslId = String(item['ESL ID'] || '').trim();
            const size = String(item['Size'] || '').trim();
            const classVal = String(item['Class'] || '').trim();
            const changeOut = String(item['Change Out Date'] || item['Changeout Date'] || 'N/A').trim();

            prevEmp[targetProp].push({
              itemNum: itemNum,
              eslId: eslId,
              size: size,
              classVal: classVal,
              changeOut: changeOut,
              status: itemStat || 'Assigned (Previous)',
              location: item['Location'] || 'Previous Employee'
            });
            break;
          }
        }
      });
    };

    scanPPE(glovesTable, 'unreturnedGloves');
    scanPPE(sleevesTable, 'unreturnedSleeves');

    // 5. Scan Expiring Certs table for former employees' archived qualifications
    const certsTable = snap.tables['expiring_certs'];
    if (certsTable && certsTable.rows) {
      certsTable.rows.forEach(c => {
        const cEmp = String(c['Employee Name'] || c['Employee'] || c['Name'] || Object.values(c)[0] || '').trim();
        if (!cEmp) return;
        for (const [norm, prevEmp] of prevMap.entries()) {
          if (this.isNameMatch(cEmp, prevEmp.name)) {
            if (!prevEmp.certRecords) prevEmp.certRecords = [];
            prevEmp.certRecords.push({
              itemType: String(c['Item Type'] || c['Cert Type'] || c['Type'] || '').trim(),
              dateAcquired: String(c['Date Acquired'] || c['Test Date'] || 'N/A').trim(),
              expirationDate: String(c['Expiration Date'] || c['Expiration'] || 'N/A').trim(),
              daysUntil: String(c['Days Until Expiration'] || c['Days Left'] || 'N/A').trim(),
              status: String(c['Status'] || 'OK').trim()
            });
            break;
          }
        }
      });
    }

    // Convert map to array and exclude currently active staff
    const results = Array.from(prevMap.values()).filter(p => !p.isActive && this.isValidEmployeeName(p.name));

    // Apply sorting
    results.sort((a, b) => {
      const dtA = this.parseDate(a.lastDay) ? this.parseDate(a.lastDay).getTime() : 0;
      const dtB = this.parseDate(b.lastDay) ? this.parseDate(b.lastDay).getTime() : 0;
      if (this.sortCol === 'lastDay') {
        return this.sortDir === 'asc' ? dtA - dtB : dtB - dtA;
      }
      return a.name.localeCompare(b.name);
    });

    return results;
  }

  /**
   * Triggers a snapshot download from Google Sheets to backfill historical previous employees and history
   */
  async backfillFromGoogleSheets() {
    if (!window.syncEngine || typeof window.syncEngine.downloadLatestSnapshot !== 'function') {
      alert('Sync engine is not initialized. Please ensure the app is connected to Google Sheets.');
      return;
    }
    const res = await window.syncEngine.downloadLatestSnapshot();
    if (res && res.success) {
      this.renderWorkspace();
    }
  }

  /**
   * Renders the Previous Employees Workspace
   */
  renderWorkspace() {
    const container = document.getElementById('previous-employees-table-container');
    if (!container) return;

    const allPrevEmployees = this.getPreviousEmployees();

    // Collect filter options
    const locSet = new Set();
    let totalUnreturnedPPE = 0;
    allPrevEmployees.forEach(e => {
      if (e.lastLocation && e.lastLocation !== 'Unknown') locSet.add(e.lastLocation);
      totalUnreturnedPPE += (e.unreturnedGloves.length + e.unreturnedSleeves.length);
    });
    const uniqueLocations = Array.from(locSet).sort();

    // Filter list
    let filtered = allPrevEmployees.filter(e => {
      // Search
      if (this.searchTerm) {
        const term = this.searchTerm.toLowerCase();
        const match = e.name.toLowerCase().includes(term) ||
                      e.lastLocation.toLowerCase().includes(term) ||
                      e.lastJob.toLowerCase().includes(term) ||
                      e.lastClassification.toLowerCase().includes(term) ||
                      e.lastReason.toLowerCase().includes(term);
        if (!match) return false;
      }

      // Location
      if (this.locationFilter !== 'all') {
        if (e.lastLocation.toLowerCase() !== this.locationFilter.toLowerCase()) return false;
      }

      // PPE Status
      if (this.ppeFilter === 'unreturned') {
        if (e.unreturnedGloves.length === 0 && e.unreturnedSleeves.length === 0) return false;
      } else if (this.ppeFilter === 'cleared') {
        if (e.unreturnedGloves.length > 0 || e.unreturnedSleeves.length > 0) return false;
      }

      return true;
    });

    // Update count badge
    const countBadge = document.getElementById('previous-employees-count-badge');
    if (countBadge) {
      countBadge.textContent = `${filtered.length} former staff`;
    }

    let html = `
      <!-- KPI Stats Bar & Quick Actions -->
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; margin-bottom: 16px;">
        <div style="background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: 8px; padding: 12px 16px;">
          <div style="font-size: 11px; font-weight: 700; color: var(--text-muted); text-transform: uppercase;">Total Departed Staff</div>
          <div style="font-size: 20px; font-weight: 800; color: #93c5fd; margin-top: 2px;">👥 ${allPrevEmployees.length} Employees</div>
          <div style="font-size: 11px; color: var(--text-secondary); margin-top: 2px;">Compiled from History & Archive</div>
        </div>

        <div style="background: var(--bg-secondary); border: 1px solid ${totalUnreturnedPPE > 0 ? 'rgba(239, 68, 68, 0.4)' : 'var(--border-color)'}; border-radius: 8px; padding: 12px 16px;">
          <div style="font-size: 11px; font-weight: 700; color: ${totalUnreturnedPPE > 0 ? '#fca5a5' : 'var(--text-muted)'}; text-transform: uppercase;">Uncollected PPE (Reclaims)</div>
          <div style="font-size: 20px; font-weight: 800; color: ${totalUnreturnedPPE > 0 ? '#ef4444' : '#10b981'}; margin-top: 2px;">
            ${totalUnreturnedPPE > 0 ? `🧤 ${totalUnreturnedPPE} Items Pending` : '✅ All PPE Cleared'}
          </div>
          <div style="font-size: 11px; color: var(--text-secondary); margin-top: 2px;">Appears on Swaps for Reclaim</div>
        </div>

        <div style="background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: 8px; padding: 12px 16px;">
          <div style="font-size: 11px; font-weight: 700; color: var(--text-muted); text-transform: uppercase;">Google Sheets Backfill</div>
          <div style="margin-top: 5px;">
            <button class="btn btn-primary" style="background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%); border: none; font-size: 11.5px; font-weight: 700; padding: 6px 12px; display: inline-flex; align-items: center; gap: 6px; width: 100%; justify-content: center;" onclick="window.previousEmployeesEngine.backfillFromGoogleSheets()">
              <span>🔄</span> Backfill from Google Sheets
            </button>
          </div>
          <div style="font-size: 10.5px; color: var(--text-secondary); margin-top: 4px;">Pulls Previous Employees & History tabs</div>
        </div>

        <div style="background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: 8px; padding: 12px 16px;">
          <div style="font-size: 11px; font-weight: 700; color: var(--text-muted); text-transform: uppercase;">Quick Actions</div>
          <div style="margin-top: 5px; display: flex; gap: 6px;">
            <button class="btn btn-primary" style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); border: none; font-size: 11.5px; font-weight: 700; padding: 6px 10px; display: inline-flex; align-items: center; gap: 4px; flex: 1; justify-content: center;" onclick="window.previousEmployeesEngine.openRehireModal()">
              <span>⚡</span> Rehire
            </button>
            <button class="btn btn-secondary" style="font-size: 11.5px; font-weight: 600; padding: 6px 10px; display: inline-flex; align-items: center; gap: 4px; flex: 1; justify-content: center;" title="Move departed rows from active Employees sheet to Previous Employees" onclick="window.previousEmployeesEngine.purgePreviousEmployeesFromActiveSheet()">
              <span>🧹</span> Clean Roster
            </button>
          </div>
          <div style="font-size: 10.5px; color: var(--text-secondary); margin-top: 4px;">Manage active & former roster</div>
        </div>
      </div>

      <!-- Filter Controls Toolbar -->
      <div style="background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: 8px; padding: 10px 14px; margin-bottom: 16px; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px;">
        <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap; flex: 1;">
          <input type="text" id="prev-emp-search-input" placeholder="🔍 Search previous employees, past jobs, notes..." class="form-control" style="max-width: 280px; padding: 6px 10px; font-size: 12px; background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 6px; color: var(--text-primary);" value="${this.escapeHtml(this.searchTerm)}" oninput="window.previousEmployeesEngine.setSearch(this.value)">

          <div style="display: flex; align-items: center; gap: 6px;">
            <span style="font-size: 11.5px; font-weight: 700; color: var(--text-muted);">Location:</span>
            <select style="padding: 5px 8px; font-size: 11.5px; background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 6px; color: var(--text-primary);" onchange="window.previousEmployeesEngine.setLocationFilter(this.value)">
              <option value="all" ${this.locationFilter === 'all' ? 'selected' : ''}>All Locations (${uniqueLocations.length})</option>
              ${uniqueLocations.map(l => `<option value="${this.escapeHtml(l)}" ${this.locationFilter.toLowerCase() === l.toLowerCase() ? 'selected' : ''}>${this.escapeHtml(l)}</option>`).join('')}
            </select>
          </div>

          <div style="display: flex; align-items: center; gap: 6px;">
            <span style="font-size: 11.5px; font-weight: 700; color: var(--text-muted);">PPE Status:</span>
            <select style="padding: 5px 8px; font-size: 11.5px; background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 6px; color: var(--text-primary);" onchange="window.previousEmployeesEngine.setPpeFilter(this.value)">
              <option value="all" ${this.ppeFilter === 'all' ? 'selected' : ''}>All Records</option>
              <option value="unreturned" ${this.ppeFilter === 'unreturned' ? 'selected' : ''}>🔴 Has Unreturned PPE</option>
              <option value="cleared" ${this.ppeFilter === 'cleared' ? 'selected' : ''}>🟢 PPE Cleared</option>
            </select>
          </div>
        </div>

        <button class="btn btn-secondary" style="font-size: 11.5px; padding: 5px 10px;" onclick="window.previousEmployeesEngine.resetFilters()">
          🔄 Reset Filters
        </button>
      </div>
    `;

    if (filtered.length === 0) {
      html += `
        <div style="background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: 8px; padding: 40px 20px; text-align: center; color: var(--text-muted);">
          <div style="font-size: 32px; margin-bottom: 8px;">📂</div>
          <h4 style="color: var(--text-primary); font-size: 15px; margin-bottom: 4px;">No Previous Employees Found</h4>
          <p style="font-size: 12px; margin: 0;">Try adjusting your search query or location filters.</p>
        </div>
      `;
    } else {
      html += `
        <div style="background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: 8px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.2);">
          <table class="data-table" style="width: 100%; border-collapse: collapse; text-align: left;">
            <thead>
              <tr style="background: rgba(15, 23, 42, 0.85); border-bottom: 1px solid var(--border-color); font-size: 11.5px; text-transform: uppercase; color: var(--text-muted);">
                <th style="padding: 10px 14px;">Employee Name</th>
                <th style="padding: 10px 14px;">Former Role</th>
                <th style="padding: 10px 14px;">Last Job / Crew</th>
                <th style="padding: 10px 14px;">Last Location</th>
                <th style="padding: 10px 14px;">Departure Date & Reason</th>
                <th style="padding: 10px 14px;">Unreturned PPE Status</th>
                <th style="padding: 10px 14px; text-align: right;">Actions</th>
              </tr>
            </thead>
            <tbody>
      `;

      filtered.forEach((emp) => {
        const totalUnreturned = emp.unreturnedGloves.length + emp.unreturnedSleeves.length;
        const unreturnedTooltip = [];
        if (emp.unreturnedGloves.length > 0) {
          unreturnedTooltip.push(`🧤 Gloves: ${emp.unreturnedGloves.map(g => '#' + g.itemNum).join(', ')}`);
        }
        if (emp.unreturnedSleeves.length > 0) {
          unreturnedTooltip.push(`🦺 Sleeves: ${emp.unreturnedSleeves.map(s => '#' + s.itemNum).join(', ')}`);
        }

        html += `
          <tr style="border-bottom: 1px solid rgba(255, 255, 255, 0.05); transition: background 0.15s ease;" onmouseover="this.style.background='rgba(59, 130, 246, 0.05)'" onmouseout="this.style.background='transparent'">
            <td style="padding: 10px 14px;">
              <div style="display: flex; align-items: center; gap: 8px;">
                <div style="width: 28px; height: 28px; border-radius: 50%; background: linear-gradient(135deg, #475569 0%, #1e293b 100%); display: flex; align-items: center; justify-content: center; font-size: 14px;">
                  👤
                </div>
                <div>
                  <span style="font-weight: 700; color: #60a5fa; cursor: pointer; text-decoration: underline dotted; font-size: 13px;" title="Click to view full profile & equipment dossier for ${this.escapeHtml(emp.name)}" onclick="if(window.employeeProfileEngine){window.employeeProfileEngine.openProfileModal('${this.escapeJs(emp.name)}');}">
                    ${this.escapeHtml(emp.name)}
                  </span>
                </div>
              </div>
            </td>
            <td style="padding: 10px 14px; font-size: 12px; color: #cbd5e1;">
              <span class="badge" style="background: rgba(99, 102, 241, 0.15); color: #a5b4fc; border: 1px solid rgba(99, 102, 241, 0.3); font-size: 11px;">
                ⚡ ${this.escapeHtml(emp.lastClassification)}
              </span>
            </td>
            <td style="padding: 10px 14px; font-size: 12px; font-family: monospace; color: #93c5fd; font-weight: 600;">
              ${this.escapeHtml(emp.lastJob)}
            </td>
            <td style="padding: 10px 14px; font-size: 12px; color: #c4b5fd;">
              📍 ${this.escapeHtml(emp.lastLocation)}
            </td>
            <td style="padding: 10px 14px; font-size: 12px;">
              <div style="font-weight: 600; color: var(--text-primary);">${this.escapeHtml(emp.lastDay || 'N/A')}</div>
              <div style="font-size: 11px; color: var(--text-muted);">${this.escapeHtml(emp.lastReason)}</div>
            </td>
            <td style="padding: 10px 14px; font-size: 12px;">
              ${totalUnreturned > 0 ? `
                <span class="badge" style="background: rgba(239, 68, 68, 0.15); color: #f87171; border: 1px solid rgba(239, 68, 68, 0.4); font-size: 11px; font-weight: 700; cursor: help;" title="${this.escapeHtml(unreturnedTooltip.join('\n'))}">
                  ⚠️ ${totalUnreturned} Item(s) Pending Reclaim
                </span>
              ` : `
                <span class="badge" style="background: rgba(16, 185, 129, 0.15); color: #34d399; font-size: 11px; font-weight: 600;">
                  ✅ No PPE Held
                </span>
              `}
            </td>
            <td style="padding: 10px 14px; text-align: right; white-space: nowrap;">
              <div style="display: inline-flex; align-items: center; gap: 6px;">
                <button class="btn btn-secondary" style="padding: 4px 8px; font-size: 11.5px; border-color: #3b82f6; color: #60a5fa;" title="View dossier & profile" onclick="if(window.employeeProfileEngine){window.employeeProfileEngine.openProfileModal('${this.escapeJs(emp.name)}');}">
                  👤 Profile
                </button>
                ${(emp.certRecords && emp.certRecords.length > 0) ? `
                  <button class="btn btn-secondary" style="padding: 4px 8px; font-size: 11.5px; border-color: rgba(234, 179, 8, 0.4); color: #facc15; font-weight: 600;" title="View ${emp.certRecords.length} archived certifications on file" onclick="if(window.employeeProfileEngine){window.employeeProfileEngine.openProfileModal('${this.escapeJs(emp.name)}', 'certs');}">
                    📜 ${emp.certRecords.length} Certs
                  </button>
                ` : ''}
                <button class="btn btn-primary" style="padding: 4px 10px; font-size: 11.5px; background: #059669; border-color: #059669; font-weight: 700; display: inline-flex; align-items: center; gap: 4px;" title="Rehire to active roster" onclick="window.previousEmployeesEngine.openRehireModal('${this.escapeJs(emp.name)}')">
                  <span>⚡</span> Rehire
                </button>
              </div>
            </td>
          </tr>
        `;
      });

      html += `
            </tbody>
          </table>
        </div>
      `;
    }

    container.innerHTML = html;
  }

  setSearch(val) {
    this.searchTerm = val.trim();
    this.renderWorkspace();
  }

  setLocationFilter(val) {
    this.locationFilter = val;
    this.renderWorkspace();
  }

  setPpeFilter(val) {
    this.ppeFilter = val;
    this.renderWorkspace();
  }

  resetFilters() {
    this.searchTerm = '';
    this.locationFilter = 'all';
    this.ppeFilter = 'all';
    this.renderWorkspace();
  }

  /**
   * Opens interactive modal to rehire a previous employee
   */
  openRehireModal(preselectedName = '') {
    let modal = document.getElementById('rehire-employee-modal');
    if (modal) modal.remove();

    const allPrev = this.getPreviousEmployees();
    const snap = this.db.getSnapshot();
    const jtTable = snap ? snap.tables['job_tracking'] : null;
    const jtRows = jtTable ? (jtTable.rows || []) : [];

    const activeJobs = jtRows.map(j => {
      const jn = String(j['Job Number'] || j['Job #'] || Object.values(j)[0] || '').trim();
      const loc = String(j['Location'] || '').trim();
      return jn ? { job: jn, loc: loc } : null;
    }).filter(Boolean);

    // Selected employee record
    const targetEmp = allPrev.find(p => this.isNameMatch(p.name, preselectedName)) || allPrev[0] || null;

    modal = document.createElement('div');
    modal.id = 'rehire-employee-modal';
    modal.className = 'modal-overlay active';
    modal.style.zIndex = '1150';
    modal.style.display = 'flex';
    modal.innerHTML = `
      <div class="modal-box" style="max-width: 600px; width: 92%; max-height: 90vh; display: flex; flex-direction: column;">
        <div class="modal-header" style="background: linear-gradient(135deg, #059669 0%, #047857 100%); color: white;">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span style="font-size: 18px;">⚡</span>
            <span style="font-weight: 700; font-size: 15px;">Rehire Previous Employee</span>
          </div>
          <button class="btn btn-secondary" style="padding: 2px 8px; font-size: 12px; background: rgba(0,0,0,0.2); border: none; color: white; cursor: pointer;" onclick="document.getElementById('rehire-employee-modal').remove()">✕</button>
        </div>
        <div class="modal-body" style="max-height: 70vh; overflow-y: auto; padding: 20px;">
          <div style="background: rgba(16, 185, 129, 0.1); border-left: 4px solid #10b981; border-radius: 4px; padding: 10px 14px; margin-bottom: 16px; font-size: 12px; color: #cbd5e1; line-height: 1.5;">
            <strong style="color: #6ee7b7;">🔄 Rehire Action:</strong> Restores the worker to the active <strong>Employees</strong> sheet, assigns them to an active crew & location, and records a milestone in <strong>Employee History</strong>.
          </div>

          <div style="margin-bottom: 14px;">
            <label style="font-size: 12px; font-weight: 700; color: #94a3b8; display: block; margin-bottom: 6px;">
              Select Employee to Rehire:
            </label>
            <select id="rehire-emp-name" class="form-control" style="width: 100%; padding: 8px 10px; background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 6px; color: var(--text-primary);" onchange="window.previousEmployeesEngine.updateRehireDefaults(this.value)">
              ${allPrev.map(p => `<option value="${this.escapeHtml(p.name)}" ${this.isNameMatch(p.name, preselectedName) ? 'selected' : ''}>${this.escapeHtml(p.name)} (Former: ${this.escapeHtml(p.lastLocation)} - ${this.escapeHtml(p.lastJob)})</option>`).join('')}
            </select>
          </div>

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-bottom: 14px;">
            <div>
              <label style="font-size: 12px; font-weight: 700; color: #94a3b8; display: block; margin-bottom: 6px;">
                Rehire Effective Date:
              </label>
              <input type="date" id="rehire-date" class="form-control" style="width: 100%; padding: 8px 10px; background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 6px; color: var(--text-primary);">
            </div>
            <div>
              <label style="font-size: 12px; font-weight: 700; color: #94a3b8; display: block; margin-bottom: 6px;">
                Assigned Crew / Job #:
              </label>
              <select id="rehire-job-num" class="form-control" style="width: 100%; padding: 8px 10px; background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 6px; color: var(--text-primary);" onchange="window.previousEmployeesEngine.onRehireJobChange(this.value)">
                <option value="">-- Select Active Job --</option>
                ${activeJobs.map(j => `<option value="${this.escapeHtml(j.job)}" data-loc="${this.escapeHtml(j.loc)}">${this.escapeHtml(j.job)} (${this.escapeHtml(j.loc)})</option>`).join('')}
              </select>
            </div>
          </div>

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-bottom: 14px;">
            <div>
              <label style="font-size: 12px; font-weight: 700; color: #94a3b8; display: block; margin-bottom: 6px;">
                Physical Location:
              </label>
              <select id="rehire-location" class="form-control" style="width: 100%; padding: 8px 10px; background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 6px; color: var(--text-primary);">
                <option value="Bozeman">Bozeman</option>
                <option value="Helena">Helena</option>
                <option value="Great Falls">Great Falls</option>
                <option value="Billings">Billings</option>
                <option value="Butte">Butte</option>
                <option value="CA Sub">CA Sub</option>
                <option value="Big Sky">Big Sky</option>
                <option value="Elliston">Elliston</option>
                <option value="Ennis">Ennis</option>
                <option value="Missoula">Missoula</option>
              </select>
            </div>
            <div>
              <label style="font-size: 12px; font-weight: 700; color: #94a3b8; display: block; margin-bottom: 6px;">
                Job Classification:
              </label>
              <select id="rehire-role" class="form-control" style="width: 100%; padding: 8px 10px; background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 6px; color: var(--text-primary);">
                <option value="Foreman">Foreman</option>
                <option value="Journeyman Lineman">Journeyman Lineman</option>
                <option value="Journeyman Operator">Journeyman Operator</option>
                <option value="Winchtruck Operator">Winchtruck Operator</option>
                <option value="Apprentice 7">Apprentice 7</option>
                <option value="Apprentice 6">Apprentice 6</option>
                <option value="Apprentice 5">Apprentice 5</option>
                <option value="Apprentice 4">Apprentice 4</option>
                <option value="Apprentice 3">Apprentice 3</option>
                <option value="Apprentice 2">Apprentice 2</option>
                <option value="Apprentice 1">Apprentice 1</option>
                <option value="Equipment Operator 1">Equipment Operator 1</option>
                <option value="Equipment Operator 2">Equipment Operator 2</option>
                <option value="Groundman">Groundman</option>
                <option value="General Foreman">General Foreman</option>
                <option value="Superintendent">Superintendent</option>
              </select>
            </div>
          </div>

          <div style="margin-bottom: 14px;">
            <label style="font-size: 12px; font-weight: 700; color: #94a3b8; display: block; margin-bottom: 6px;">
              Rehire Notes / Comments:
            </label>
            <input type="text" id="rehire-notes" class="form-control" placeholder="Optional notes for Employee History audit log" style="width: 100%; padding: 8px 10px; background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 6px; color: var(--text-primary);">
          </div>
        </div>
        <div class="modal-footer" style="display: flex; justify-content: space-between; align-items: center; background: var(--bg-secondary); border-top: 1px solid var(--border-color); padding: 12px 20px;">
          <button class="btn btn-secondary" onclick="document.getElementById('rehire-employee-modal').remove()">Cancel</button>
          <button class="btn btn-primary" id="btn-submit-rehire" style="background: #059669; border-color: #059669; font-weight: 700; display: inline-flex; align-items: center; gap: 6px;" onclick="window.previousEmployeesEngine.executeRehire()">
            <span>⚡</span> Confirm & Rehire Employee
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    const dateInput = document.getElementById('rehire-date');
    if (dateInput) {
      dateInput.value = new Date().toISOString().split('T')[0];
    }

    if (targetEmp) {
      this.updateRehireDefaults(targetEmp.name);
    }
  }

  updateRehireDefaults(empName) {
    const allPrev = this.getPreviousEmployees();
    const emp = allPrev.find(p => this.isNameMatch(p.name, empName));
    if (!emp) return;

    const locSelect = document.getElementById('rehire-location');
    const roleSelect = document.getElementById('rehire-role');
    if (locSelect && emp.lastLocation && emp.lastLocation !== 'Unknown') {
      locSelect.value = emp.lastLocation;
    }
    if (roleSelect && emp.lastClassification) {
      roleSelect.value = emp.lastClassification;
    }
  }

  onRehireJobChange(jobNum) {
    const jobSelect = document.getElementById('rehire-job-num');
    const locSelect = document.getElementById('rehire-location');
    if (!jobSelect || !locSelect) return;
    const selectedOpt = jobSelect.options[jobSelect.selectedIndex];
    const loc = selectedOpt ? selectedOpt.getAttribute('data-loc') : '';
    if (loc && loc !== 'Unknown') {
      locSelect.value = loc;
    }
  }

  async executeRehire() {
    const nameSelect = document.getElementById('rehire-emp-name');
    const dateInput = document.getElementById('rehire-date');
    const jobSelect = document.getElementById('rehire-job-num');
    const locSelect = document.getElementById('rehire-location');
    const roleSelect = document.getElementById('rehire-role');
    const notesInput = document.getElementById('rehire-notes');

    const empName = nameSelect ? nameSelect.value.trim() : '';
    const rehireDate = dateInput ? dateInput.value : new Date().toISOString().split('T')[0];
    const jobNum = jobSelect ? jobSelect.value.trim() : '';
    const location = locSelect ? locSelect.value.trim() : 'Helena';
    const role = roleSelect ? roleSelect.value.trim() : 'Lineman';
    const notes = notesInput ? notesInput.value.trim() : '';

    if (!empName) {
      alert('Please select an employee to rehire.');
      return;
    }
    if (!jobNum) {
      alert('Please select the assigned Job / Crew # for this employee.');
      return;
    }

    const btn = document.getElementById('btn-submit-rehire');
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<span>⏳</span> Processing Rehire...';
    }

    try {
      if (!this.db) this.db = window.localDB || window.safetyDB;

      const empTable = this.db.getTable('employees');
      const histTable = this.db.getTable('employee_history');

      let existingEmp = null;
      let existingRowIdx = -1;

      if (empTable && empTable.rows) {
        existingRowIdx = empTable.rows.findIndex(r => this.isNameMatch(this.extractEmployeeNameFromRow(r, empTable.headers), empName));
        if (existingRowIdx !== -1) {
          existingEmp = empTable.rows[existingRowIdx];
        }
      }

      const updatedEmpData = {
        'Employee Name': empName,
        'Name': empName,
        'Location': location,
        'Job Number': jobNum,
        'Job #': jobNum,
        'Job Classification': role,
        'Status': 'Active',
        'Hire Date': rehireDate,
        'Last Day': '',
        'Last Day Reason': ''
      };

      if (existingEmp) {
        Object.assign(existingEmp, updatedEmpData);
        if (empTable.rawGrid && empTable.rawGrid[existingRowIdx + 1]) {
          const headers = empTable.headers || [];
          headers.forEach((h, hIdx) => {
            if (updatedEmpData[h] !== undefined) {
              empTable.rawGrid[existingRowIdx + 1][hIdx] = updatedEmpData[h];
            }
          });
        }

        await this.db.addMutation({
          action: 'UPDATE_ROW',
          sheetName: 'Employees',
          tableKey: 'employees',
          row: existingRowIdx + 2,
          rowData: existingEmp
        });
      } else if (empTable) {
        empTable.rows.push(updatedEmpData);
        if (empTable.rawGrid) {
          const headers = empTable.headers || Object.keys(updatedEmpData);
          empTable.rawGrid.push(headers.map(h => updatedEmpData[h] || ''));
        }
        await this.db.addMutation({
          action: 'ADD_ROW',
          sheetName: 'Employees',
          tableKey: 'employees',
          rowData: updatedEmpData
        });
      }

      // Add Rehire record to Employee History
      if (histTable) {
        const histRow = {
          'Date': rehireDate,
          'Employee Name': empName,
          'Name': empName,
          'Event Type': 'Rehired',
          'Location': location,
          'Job Number': jobNum,
          'Rehire Date': rehireDate,
          'Hire Date': rehireDate,
          'Notes': notes || `Rehired to Crew ${jobNum} (${location}) as ${role}`
        };

        histTable.rows.push(histRow);
        if (histTable.rawGrid) {
          const headers = histTable.headers || Object.keys(histRow);
          histTable.rawGrid.push(headers.map(h => histRow[h] || ''));
        }

        await this.db.addMutation({
          action: 'ADD_ROW',
          sheetName: 'Employee History',
          tableKey: 'employee_history',
          rowData: histRow
        });
      }

      // Save database snapshot
      if (typeof this.db.setSnapshot === 'function') {
        await this.db.setSnapshot(this.db.snapshot);
      }

      document.getElementById('rehire-employee-modal')?.remove();

      alert(`🎉 Successfully rehired ${empName} to Crew ${jobNum} (${location})!\n\nTheir record has been restored to active Employees and queued for Google Sheets sync.`);

      this.renderWorkspace();
      if (window.sheetNavigator) {
        window.sheetNavigator.renderCurrentSheet();
      }
    } catch (err) {
      alert(`❌ Error rehiring employee: ${err.message}`);
      console.error(err);
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = '<span>⚡</span> Confirm & Rehire Employee';
      }
    }
  }

  /**
   * Cleans up the active Employees table by archiving any departed staff rows to Employee History
   * and deleting them from the raw Employees table.
   */
  async purgePreviousEmployeesFromActiveSheet() {
    const snap = this.db.getSnapshot();
    if (!snap) return;

    const empTable = snap.tables['employees'];
    if (!empTable || !empTable.rows) return;

    let histTable = snap.tables['employee_history'];
    if (!histTable) {
      histTable = {
        name: 'Employee History',
        headers: ['Date', 'Employee Name', 'Event Type', 'Location', 'Job Number', 'Hire Date', 'Last Day', 'Last Day Reason', 'Rehire Date', 'Notes'],
        rows: []
      };
      snap.tables['employee_history'] = histTable;
    }

    const rowsToKeep = [];
    const removedEmployees = [];
    const todayStr = new Date().toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });

    empTable.rows.forEach(r => {
      const name = this.extractEmployeeNameFromRow(r, empTable.headers);
      if (!name || !this.isValidEmployeeName(name)) {
        rowsToKeep.push(r);
        return;
      }
      const loc = this.extractRowValue(r, empTable.headers, ['Location', 'City', 'Yard']);
      const locLower = loc.toLowerCase();
      const stat = this.extractRowValue(r, empTable.headers, ['Status', 'Employee Status']).toLowerCase();
      const isPrev = locLower === 'previous employee' || locLower.includes('previous') ||
                     stat === 'previous employee' || stat.includes('inactive') || stat.includes('terminated') || stat.includes('departed');

      if (isPrev) {
        removedEmployees.push(name);
        // Ensure documented in Employee History
        const alreadyInHistory = (histTable.rows || []).some(h => {
          const hName = this.extractEmployeeNameFromRow(h, histTable.headers);
          return this.isNameMatch(hName, name);
        });

        if (!alreadyInHistory) {
          const histEntry = {
            'Date': todayStr,
            'Employee Name': name,
            'Event Type': 'Archived',
            'Location': locLower === 'previous employee' ? 'Unknown' : loc,
            'Job Number': this.extractRowValue(r, empTable.headers, ['Job Number', 'Job #', 'Job', 'Crew']),
            'Hire Date': this.extractRowValue(r, empTable.headers, ['Hire Date', 'Hire', 'Start Date']),
            'Last Day': this.extractRowValue(r, empTable.headers, ['Last Day', 'Term Date', 'End Date']) || todayStr,
            'Last Day Reason': this.extractRowValue(r, empTable.headers, ['Last Day Reason', 'Reason', 'Notes']) || 'Departed',
            'Rehire Date': '',
            'Notes': 'Cleaned up from active Employees sheet to Previous Employees workspace'
          };
          histTable.rows.push(histEntry);
        }
      } else {
        rowsToKeep.push(r);
      }
    });

    if (removedEmployees.length === 0) {
      alert('ℹ️ No previous employee records found on the active Employees table to remove.');
      return;
    }

    const confirmClean = confirm(`Are you sure you want to clean up ${removedEmployees.length} previous employee(s) from the active Employees table?\n\n• ${removedEmployees.join('\n• ')}\n\nThey will be safely preserved in the Previous Employees workspace and Employee History.`);
    if (!confirmClean) return;

    // Update raw table
    empTable.rows = rowsToKeep;
    if (empTable.rawGrid && empTable.headers) {
      empTable.rawGrid = rowsToKeep.map(r => empTable.headers.map(h => r[h] || ''));
    }

    // Save snapshot locally
    if (typeof this.db.setSnapshot === 'function') {
      await this.db.setSnapshot(this.db.snapshot);
    }

    alert(`✅ Successfully cleaned up ${removedEmployees.length} previous employee(s) from the active Employees sheet.\n\nAll historical records and uncollected PPE are preserved in the Previous Employees workspace.`);

    this.renderWorkspace();
    if (window.sheetNavigator) {
      window.sheetNavigator.renderCurrentSheet();
    }
  }
}

window.previousEmployeesEngine = new PreviousEmployeesEngine(window.localDB);
