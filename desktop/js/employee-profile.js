/**
 * employee-profile.js - Comprehensive Employee Profile, Assignments & Certifications Dossier Engine
 */

class EmployeeProfileEngine {
  constructor(db) {
    this.db = db;
    this.currentActiveTab = 'equipment'; // 'equipment' | 'certs' | 'history'
    this.currentEquipmentFilter = 'all'; // 'all' | 'gloves_sleeves' | 'blankets' | 'macks' | 'grounds' | 'hot_sticks' | 'hv_testers' | 'aed'
    this.currentEmployeeData = null;
  }

  init() {
    // Escape key closes modal
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.closeProfileModal();
      }
    });
  }

  /**
   * Flexible name normalization
   */
  normalizeName(name) {
    if (!name) return '';
    return String(name).toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
  }

  /**
   * Matches employee name across different formats (e.g. "Darrell Swann" vs "Swann, Darrell" vs "Darrell Swann (Bozeman)")
   */
  isNameMatch(nameA, nameB) {
    if (!nameA || !nameB) return false;
    const normA = this.normalizeName(nameA);
    const normB = this.normalizeName(nameB);
    if (!normA || !normB) return false;

    if (normA === normB) return true;

    // Remove parenthesized status/city if present
    const cleanA = this.normalizeName(String(nameA).replace(/\(.*?\)/g, ''));
    const cleanB = this.normalizeName(String(nameB).replace(/\(.*?\)/g, ''));
    if (cleanA === cleanB) return true;

    // Check reversed "Last First" vs "First Last"
    const partsA = cleanA.split(' ').filter(Boolean);
    const partsB = cleanB.split(' ').filter(Boolean);

    if (partsA.length >= 2 && partsB.length >= 2) {
      if (partsA[0] === partsB[partsB.length - 1] && partsA[partsA.length - 1] === partsB[0]) return true;
      if (partsA.join(' ') === partsB.reverse().join(' ')) return true;
    }

    // Check containment if length is sufficient
    if (cleanA.length > 5 && cleanB.length > 5) {
      if (cleanA.includes(cleanB) || cleanB.includes(cleanA)) return true;
    }

    return false;
  }

  parseDate(val) {
    if (!val || val === 'N/A') return null;
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
    const dt = new Date(s);
    return isNaN(dt.getTime()) ? null : dt;
  }

  formatDateDisplay(d) {
    if (!d || !(d instanceof Date) || isNaN(d.getTime())) return '';
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const yyyy = d.getFullYear();
    return `${mm}/${dd}/${yyyy}`;
  }

  formatDuration(days) {
    days = Math.max(0, Math.round(days || 0));
    if (days === 0) return '< 1 day';
    if (days === 1) return '1 day';
    if (days < 30) return `${days} days`;
    if (days < 365) {
      const mos = (days / 30.4375).toFixed(1);
      return `${days} days (~${mos} mos)`;
    }
    const yrs = (days / 365.25).toFixed(1);
    return `${days} days (~${yrs} yrs)`;
  }

  /**
   * Scans history tables to extract full assignment lifecycle for this employee with issue and return dates
   */
  extractEquipmentHistory(snap, displayName, assignedEquipment) {
    const historyDefs = [
      { key: 'gloves', title: 'Rubber Gloves', icon: '🧤', histKey: 'gloves_history' },
      { key: 'sleeves', title: 'Rubber Sleeves', icon: '🦾', histKey: 'sleeves_history' },
      { key: 'blankets', title: 'Rubber Blankets', icon: '🔲', histKey: 'blankets_history' },
      { key: 'macks', title: 'MACKs', icon: '🧱', histKey: 'macks_history' },
      { key: 'hv_testers', title: 'HV Testers', icon: '⚡', histKey: 'hv_testers_history' },
      { key: 'phasing_sets', title: 'Phasing Sets', icon: '⚡', histKey: 'phasing_sets_history' },
      { key: 'aed', title: 'AED Units', icon: '🏥', histKey: 'aed_history' },
      { key: 'grounds', title: 'Grounds', icon: '⚡', histKey: 'grounds_history' },
      { key: 'hot_sticks', title: 'Hot Sticks', icon: '🔴', histKey: 'hot_sticks_history' }
    ];

    const results = [];

    historyDefs.forEach(def => {
      const histTable = snap.tables[def.histKey];
      if (!histTable || !histTable.rows || histTable.rows.length === 0) return;

      const headers = histTable.headers || [];

      // Group rows by item number
      const itemMap = new Map(); // itemKey -> [row1, row2, ...]

      histTable.rows.forEach(r => {
        const itemNum = this.getItemNum(r, headers);
        if (!itemNum || itemNum === 'N/A') return;
        const normKey = String(itemNum).toLowerCase().trim();
        if (!itemMap.has(normKey)) {
          itemMap.set(normKey, []);
        }
        itemMap.get(normKey).push(r);
      });

      // Process each item chronologically
      itemMap.forEach((rows, itemKey) => {
        // Sort oldest to newest
        const sorted = [...rows].sort((a, b) => {
          const dateA = this.parseDate(a['Date Assigned'] || a['Date'] || Object.values(a)[0]);
          const dateB = this.parseDate(b['Date Assigned'] || b['Date'] || Object.values(b)[0]);
          const tA = dateA ? dateA.getTime() : 0;
          const tB = dateB ? dateB.getTime() : 0;
          return tA - tB;
        });

        for (let i = 0; i < sorted.length; i++) {
          const row = sorted[i];
          const assignedTo = String(row['Assigned To'] || row['Employee Name'] || row['Employee'] || '').trim();

          if (this.isNameMatch(assignedTo, displayName)) {
            const itemNum = this.getItemNum(row, headers);
            const rawIssueDate = row['Date Assigned'] || row['Date'] || Object.values(row)[0] || '';
            const issueDateObj = this.parseDate(rawIssueDate);
            const issueDateStr = issueDateObj ? this.formatDateDisplay(issueDateObj) : String(rawIssueDate || 'N/A').trim();

            const size = String(row['Size'] || '').trim();
            const classVal = String(row['Class'] || '').trim();
            const kv = String(row['KV'] || '').trim();
            const model = String(row['Model'] || '').trim();
            const type = String(row['Type'] || '').trim();
            const length = String(row['Length'] || '').trim();
            const location = String(row['Location'] || '').trim();
            const notes = String(row['Notes'] || row['Note'] || '').trim();

            let specs = [];
            if (model) specs.push(`Model: ${model}`);
            if (type && type !== model) specs.push(`Type: ${type}`);
            if (size) specs.push(`Size: ${size}`);
            if (classVal) specs.push(`Class: ${classVal}`);
            if (kv) specs.push(`KV: ${kv}`);
            if (length) specs.push(`Len: ${length}`);

            let returnDateStr = '';
            let returnStatus = '';
            let isCurrent = false;
            let durationStr = '';

            const next = i < sorted.length - 1 ? sorted[i + 1] : null;

            if (next) {
              const rawReturnDate = next['Date Assigned'] || next['Date'] || Object.values(next)[0] || '';
              const returnDateObj = this.parseDate(rawReturnDate);
              returnDateStr = returnDateObj ? this.formatDateDisplay(returnDateObj) : String(rawReturnDate).trim();

              const nextAssigned = String(next['Assigned To'] || next['Employee Name'] || '').trim();
              const nextLoc = String(next['Location'] || '').trim();
              const nextNotes = String(next['Notes'] || '').trim();

              const nextAssignedLower = nextAssigned.toLowerCase();
              const nextLocLower = nextLoc.toLowerCase();

              if (nextAssignedLower.includes('shelf') || nextLocLower.includes('shelf')) {
                returnStatus = 'Returned to Shelf';
              } else if (nextAssignedLower.includes('test') || nextLocLower.includes('test')) {
                returnStatus = 'Sent to Testing';
              } else if (nextAssignedLower.includes('retir') || nextNotes.toLowerCase().includes('retir')) {
                returnStatus = 'Retired / Condemned';
              } else if (nextAssignedLower.includes('lost') || nextNotes.toLowerCase().includes('lost')) {
                returnStatus = 'Lost / Destroyed';
              } else if (nextAssigned) {
                returnStatus = `Reassigned to ${nextAssigned}`;
              } else {
                returnStatus = 'Returned';
              }

              if (issueDateObj && returnDateObj) {
                const days = Math.max(0, Math.round((returnDateObj.getTime() - issueDateObj.getTime()) / (1000 * 60 * 60 * 24)));
                durationStr = this.formatDuration(days);
              }
            } else {
              // Check if currently active in assignedEquipment
              const isCurrentlyAssigned = assignedEquipment.some(ae => ae.histKey === def.histKey && ae.itemNum === itemNum);
              if (isCurrentlyAssigned) {
                returnDateStr = 'Present';
                returnStatus = 'Currently Active';
                isCurrent = true;

                if (issueDateObj) {
                  const now = new Date();
                  const days = Math.max(0, Math.round((now.getTime() - issueDateObj.getTime()) / (1000 * 60 * 60 * 24)));
                  durationStr = this.formatDuration(days);
                }
              } else {
                returnDateStr = '—';
                returnStatus = 'Past Assignment';
                durationStr = '—';
              }
            }

            results.push({
              eqType: def.title,
              eqIcon: def.icon,
              eqKey: def.key,
              histKey: def.histKey,
              itemNum: itemNum,
              specs: specs.join(' · ') || 'Standard',
              issueDate: issueDateStr,
              issueTimestamp: issueDateObj ? issueDateObj.getTime() : 0,
              returnDate: returnDateStr,
              returnStatus: returnStatus,
              isCurrent: isCurrent,
              duration: durationStr || '—',
              location: location,
              notes: notes
            });
          }
        }
      });
    });

    // Sort all historical assignments newest issue date first
    results.sort((a, b) => b.issueTimestamp - a.issueTimestamp);

    return results;
  }

  /**
   * Extracts the full, accurate item number / serial number from an inventory or history row
   */
  getItemNum(item, tableHeaders) {
    if (!item) return 'N/A';

    // 1. Try specific known column headers for item / serial identifier
    const knownKeys = [
      'Item #', 'Item#', 'Item', 'Items',
      'HVT #', 'HVT#', 'HVT', 'HV Tester #', 'HV Tester',
      'PS #', 'PS#', 'Phasing Set #', 'Phasing Set',
      'Glove #', 'Glove#', 'Glove', 'Gloves #', 'Gloves',
      'Sleeve #', 'Sleeve#', 'Sleeve', 'Sleeves #', 'Sleeves',
      'Blanket #', 'Blanket#', 'Blanket', 'Blankets #', 'Blankets',
      'MACK #', 'MACK#', 'MACK', 'MACKs #', 'MACKs',
      'Serial #', 'Serial#', 'Serial', 'Serial Number',
      'ESL ID', 'ESLID', 'ESL_ID', 'Tag #', 'Tag',
      'Ground #', 'Grounds #', 'Grounds', 'Ground',
      'Hot Stick #', 'Hot Stick', 'Hot Sticks'
    ];

    for (let k of knownKeys) {
      if (item[k] !== undefined && item[k] !== null && String(item[k]).trim() !== '') {
        const val = String(item[k]).trim();
        return val;
      }
    }

    // 2. Check tableHeaders for column containing 'item' or '#' or 'serial' or 'hvt' or 'ps' (excluding dates/status/location/size/class)
    if (tableHeaders && tableHeaders.length > 0) {
      for (let h of tableHeaders) {
        const hl = String(h).toLowerCase();
        if (hl.includes('date') || hl.includes('status') || hl.includes('location') || hl.includes('assign') || hl.includes('note') || hl.includes('size') || hl.includes('class') || hl.includes('kv') || hl.includes('model') || hl.includes('length')) {
          continue;
        }
        if (hl.includes('item') || hl.includes('#') || hl.includes('serial') || hl.includes('hvt') || hl.includes('ps') || hl.includes('tag')) {
          if (item[h] !== undefined && item[h] !== null && String(item[h]).trim() !== '') {
            return String(item[h]).trim();
          }
        }
      }
    }

    // 3. Fallback: check first column if it does not look like a date or status
    if (tableHeaders && tableHeaders.length > 0) {
      const firstCol = tableHeaders[0];
      const fl = String(firstCol).toLowerCase();
      if (!fl.includes('date') && !fl.includes('assign') && !fl.includes('time') && !fl.includes('status') && !fl.includes('location')) {
        const val = String(item[firstCol] || '').trim();
        if (val) return val;
      }
    }

    // 4. Return first non-metadata value that does not look like a date
    for (let k of Object.keys(item)) {
      if (k.startsWith('_')) continue;
      const kl = k.toLowerCase();
      if (kl.includes('date') || kl.includes('assign') || kl.includes('time') || kl.includes('status') || kl.includes('location')) continue;
      const val = String(item[k]).trim();
      if (val) return val;
    }

    return 'N/A';
  }

  /**
   * Extracts the certification / license name from an expiring certs row
   */
  getCertType(c, tableHeaders) {
    if (!c) return 'Certification';

    const knownKeys = [
      'Item Type', 'ItemType', 'Item_Type', 'Cert Type', 'CertType', 'Cert_Type',
      'Certification', 'Cert', 'License', 'Course', 'Qualification', 'Type'
    ];

    for (let k of knownKeys) {
      if (c[k] !== undefined && c[k] !== '') {
        const val = String(c[k]).trim();
        if (val) return val;
      }
    }

    // Check case-insensitively across non-metadata keys
    for (let k of Object.keys(c)) {
      if (k.startsWith('_')) continue;
      const kl = k.toLowerCase();
      if ((kl.includes('item') && kl.includes('type')) || kl.includes('cert') || kl.includes('license') || kl.includes('course') || kl === 'type') {
        const val = String(c[k]).trim();
        if (val) return val;
      }
    }

    // Try second column from table headers if available (Col B is usually Item Type in Expiring Certs)
    if (tableHeaders && tableHeaders.length > 1) {
      const secondCol = tableHeaders[1];
      if (secondCol && c[secondCol] !== undefined && c[secondCol] !== '') {
        const val = String(c[secondCol]).trim();
        if (val) return val;
      }
    }

    return 'General Cert';
  }

  /**
   * Returns a recognizable icon for a certification / license
   */
  getCertIcon(certType) {
    const ct = String(certType || '').toLowerCase();
    if (ct.includes('dl') || ct.includes('driver')) return '🪪';
    if (ct.includes('mec') || ct.includes('med') || ct.includes('physical')) return '🩺';
    if (ct.includes('cpr') || ct.includes('aed')) return '🫀';
    if (ct.includes('1st aid') || ct.includes('first aid')) return '🩹';
    if (ct.includes('crane')) return '🏗️';
    if (ct.includes('digger') || ct.includes('derrick')) return '🚜';
    if (ct.includes('bucket')) return '🚚';
    if (ct.includes('pole') || ct.includes('rescue')) return '🪜';
    if (ct.includes('osha')) return '🦺';
    if (ct.includes('harass') || ct.includes('hr')) return '🛡️';
    if (ct.includes('bnsf') || ct.includes('rail')) return '🚆';
    if (ct.includes('msha') || ct.includes('mine') || ct.includes('mining')) return '⛏️';
    if (ct.includes('heli') || ct.includes('eica')) return '🚁';
    if (ct.includes('flag') || ct.includes('traffic')) return '🚩';
    if (ct.includes('climb')) return '🧗';
    return '📜';
  }

  /**
   * Opens the Employee Profile & Certifications Modal
   */
  openProfileModal(employeeName) {
    const modal = document.getElementById('employee-profile-modal');
    const body = document.getElementById('employee-profile-modal-body');
    const titleEl = document.getElementById('employee-profile-modal-title');
    if (!modal || !body) return;

    const snap = this.db.getSnapshot();
    if (!snap || !snap.tables) return;

    const rawEmpName = String(employeeName || '').trim();
    if (!rawEmpName) return;

    this.currentActiveTab = 'equipment';
    this.currentEquipmentFilter = 'all';

    // 1. Locate Employee Record in Employees table
    const empTable = snap.tables['employees'];
    let empRow = null;
    if (empTable && empTable.rows) {
      empRow = empTable.rows.find(r => {
        const rName = r['Name'] || r['Employee Name'] || r['Employee'] || '';
        return this.isNameMatch(rName, rawEmpName);
      });
    }

    const displayName = empRow ? (empRow['Name'] || empRow['Employee Name'] || rawEmpName) : rawEmpName;
    const location = empRow ? (empRow['Location'] || 'Unknown') : 'Unknown';
    const jobNumber = empRow ? (empRow['Job Number'] || empRow['Job #'] || 'N/A') : 'N/A';
    const secondaryJob = empRow ? (empRow['Secondary Job Number'] || '') : '';
    const role = empRow ? (empRow['Job Classification'] || empRow['Classification'] || 'Lineman') : 'Lineman';
    const phone = empRow ? (empRow['Phone Number'] || empRow['Phone'] || 'N/A') : 'N/A';
    const email = empRow ? (empRow['Email Address'] || empRow['Email'] || '') : '';
    const mpEmail = empRow ? (empRow['MP Email'] || '') : '';
    const notifEmail = empRow ? (empRow['Notification Emails'] || '') : '';

    // 2. Scan ALL equipment sheets for items currently assigned to this employee
    const equipmentSheets = [
      { key: 'gloves', title: 'Rubber Gloves', icon: '🧤', histKey: 'gloves_history' },
      { key: 'sleeves', title: 'Rubber Sleeves', icon: '🦾', histKey: 'sleeves_history' },
      { key: 'blankets', title: 'Rubber Blankets', icon: '🔲', histKey: 'blankets_history' },
      { key: 'macks', title: 'MACKs (Equipotential)', icon: '🧱', histKey: 'macks_history' },
      { key: 'hv_testers', title: 'HV Testers', icon: '⚡', histKey: 'hv_testers_history' },
      { key: 'phasing_sets', title: 'Phasing Sets', icon: '⚡', histKey: 'phasing_sets_history' },
      { key: 'aed', title: 'AED Units', icon: '🏥', histKey: 'aed_history' },
      { key: 'grounds', title: 'Grounds', icon: '⚡', histKey: 'grounds_history' },
      { key: 'hot_sticks', title: 'Hot Sticks', icon: '🔴', histKey: 'hot_sticks_history' }
    ];

    const assignedEquipment = [];

    equipmentSheets.forEach(eq => {
      const t = snap.tables[eq.key];
      if (t && t.rows) {
        t.rows.forEach(item => {
          const assignedTo = String(item['Assigned To'] || item['Assigned'] || item['Holder'] || '').trim();
          if (this.isNameMatch(assignedTo, displayName)) {
            const itemNum = this.getItemNum(item, t.headers);
            const eslId = String(item['ESL ID'] || '').trim();
            const size = String(item['Size'] || '').trim();
            const classVal = String(item['Class'] || '').trim();
            const kv = String(item['KV'] || '').trim();
            const model = String(item['Model'] || '').trim();
            const type = String(item['Type'] || '').trim();
            const length = String(item['Length'] || '').trim();
            const serial = String(item['Serial #'] || item['Serial'] || '').trim();
            const dateAssigned = String(item['Date Assigned'] || item['Date'] || 'N/A').trim();
            const changeOutDate = String(item['Change Out Date'] || item['Changeout Date'] || item['Pad Expiration'] || 'N/A').trim();
            const testDate = String(item['Test Date'] || item['Calibration Date'] || 'N/A').trim();
            const status = String(item['Status'] || 'Assigned').trim();
            const itemLoc = String(item['Location'] || location).trim();

            let specs = [];
            if (model) specs.push(`Model: ${model}`);
            if (type && type !== model) specs.push(`Type: ${type}`);
            if (size) specs.push(`Size: ${size}`);
            if (classVal) specs.push(`Class: ${classVal}`);
            if (kv) specs.push(`KV: ${kv}`);
            if (length) specs.push(`Len: ${length}`);
            if (serial && serial !== itemNum) specs.push(`SN: ${serial}`);

            assignedEquipment.push({
              eqType: eq.title,
              eqIcon: eq.icon,
              eqKey: eq.key,
              histKey: eq.histKey,
              itemNum: itemNum,
              eslId: eslId,
              specs: specs.join(' · ') || 'Standard',
              dateAssigned: dateAssigned,
              changeOutDate: changeOutDate,
              testDate: testDate,
              status: status,
              location: itemLoc
            });
          }
        });
      }
    });

    // 3. Scan Expiring Certs table for this employee
    const certsTable = snap.tables['expiring_certs'];
    const certifications = [];
    if (certsTable && certsTable.rows) {
      certsTable.rows.forEach(c => {
        const cEmp = String(c['Employee'] || c['Name'] || c['Employee Name'] || '').trim();
        if (this.isNameMatch(cEmp, displayName)) {
          const certType = this.getCertType(c, certsTable.headers);
          const expDate = String(c['Expiration Date'] || c['Expiration'] || c['Change Out Date'] || 'N/A').trim();
          const testDate = String(c['Date Acquired'] || c['Acquired Date'] || c['Test Date'] || c['Issue Date'] || c['Issued Date'] || c['Date'] || 'N/A').trim();
          
          let daysLeft = null;
          const rawDays = String(c['Days Until Expiration'] || c['Days Left'] || c['Days'] || c['Days Remaining'] || '').trim();
          if (rawDays && rawDays !== 'N/A' && rawDays !== '—') {
            const parsed = parseFloat(rawDays);
            if (!isNaN(parsed)) daysLeft = parsed;
          }
          if (daysLeft === null && expDate && expDate !== 'N/A') {
            const d = this.parseDate(expDate);
            if (d && !isNaN(d.getTime())) {
              const diffMs = d.getTime() - new Date().setHours(0, 0, 0, 0);
              daysLeft = Math.round(diffMs / (1000 * 60 * 60 * 24));
            }
          }

          let status = String(c['Status'] || '').trim();
          if (!status || status === 'N/A') {
            if (daysLeft !== null) {
              if (daysLeft <= 0) status = 'Expired';
              else if (daysLeft <= 30) status = 'Critical';
              else if (daysLeft <= 60) status = 'Warning';
              else if (daysLeft <= 90) status = 'Upcoming';
              else status = 'OK';
            } else {
              status = 'No Date Set';
            }
          }

          const smsStatus = String(c['SMS'] || c['SMS Sent'] || c['SMS Status'] || '').trim();
          const notes = String(c['Notes'] || '').trim();

          certifications.push({
            certType: certType,
            expDate: expDate,
            testDate: testDate,
            daysLeft: daysLeft,
            status: status,
            smsStatus: smsStatus,
            notes: notes
          });
        }
      });
    }

    // 4. Scan Training Tracking for this employee / crew
    const trainingTable = snap.tables['training_tracking'];
    const trainingList = [];
    if (trainingTable && trainingTable.rows) {
      trainingTable.rows.forEach(tr => {
        const lead = String(tr['Lead'] || tr['Crew Lead'] || tr['Foreman'] || '').trim();
        const crew = String(tr['Crew'] || tr['Job #'] || tr['Job Number'] || '').trim();
        const attendees = String(tr['Attendees'] || tr['Crew Members'] || '').trim();

        const isLeadMatch = this.isNameMatch(lead, displayName);
        const isAttendeeMatch = attendees && this.isNameMatch(attendees, displayName);
        const isCrewMatch = jobNumber && jobNumber !== 'N/A' && crew === jobNumber;

        if (isLeadMatch || isAttendeeMatch || isCrewMatch) {
          trainingList.push({
            month: String(tr['Month'] || tr['Scheduled Month'] || 'N/A').trim(),
            topic: String(tr['Topic'] || tr['Training Topic'] || tr['Training'] || 'Safety Training').trim(),
            crew: crew,
            lead: lead,
            status: String(tr['Status'] || tr['Training Status'] || 'Scheduled').trim(),
            hours: String(tr['Hours'] || '1.0').trim()
          });
        }
      });
    }

    // 5. Scan Employee History
    const historyTable = snap.tables['employee_history'];
    const employeeHistory = [];
    if (historyTable && historyTable.rows) {
      historyTable.rows.forEach(h => {
        const hName = String(h['Employee Name'] || h['Name'] || h['Employee'] || '').trim();
        if (this.isNameMatch(hName, displayName)) {
          employeeHistory.push({
            date: String(h['Date'] || h['Date Changed'] || 'N/A').trim(),
            event: String(h['Event'] || h['Event Type'] || h['Action'] || 'Assignment Change').trim(),
            details: String(h['Details'] || h['Notes'] || h['Description'] || '').trim(),
            location: String(h['Location'] || '').trim(),
            job: String(h['Job Number'] || '').trim()
          });
        }
      });
    }

    // 6. Scan Equipment History for complete assignment and return lifecycle
    const equipmentHistory = this.extractEquipmentHistory(snap, displayName, assignedEquipment);

    // Store state for tab switching
    this.currentEmployeeData = {
      displayName,
      location,
      jobNumber,
      secondaryJob,
      role,
      phone,
      email,
      mpEmail,
      notifEmail,
      assignedEquipment,
      equipmentHistory,
      certifications,
      trainingList,
      employeeHistory
    };

    if (titleEl) {
      titleEl.innerHTML = `<span style="font-size: 18px;">👤</span> Employee Profile: <strong>${this.escapeHtml(displayName)}</strong>`;
    }

    this.renderModalContent(body);
    modal.classList.add('active');
  }

  closeProfileModal() {
    const modal = document.getElementById('employee-profile-modal');
    if (modal) modal.classList.remove('active');
  }

  setTab(tabKey) {
    this.currentActiveTab = tabKey;
    const body = document.getElementById('employee-profile-modal-body');
    if (body && this.currentEmployeeData) {
      this.renderModalContent(body);
    }
  }

  /**
   * Renders the complete profile modal UI
   */
  renderModalContent(container) {
    const data = this.currentEmployeeData;
    if (!data) return;

    // Calculate quick stats
    const totalEquipment = data.assignedEquipment.length;
    const okCerts = data.certifications.filter(c => c.status.toLowerCase() === 'ok').length;
    const warnCerts = data.certifications.filter(c => ['warning', 'upcoming', 'critical'].includes(c.status.toLowerCase())).length;
    const expCerts = data.certifications.filter(c => ['expired', 'missing'].includes(c.status.toLowerCase())).length;
    const totalCerts = data.certifications.length;

    // Find earliest upcoming due date
    let earliestDueDate = 'None pending';
    let earliestTime = Infinity;

    data.assignedEquipment.forEach(eq => {
      const parsed = this.parseDate(eq.changeOutDate);
      if (parsed && parsed.getTime() < earliestTime) {
        earliestTime = parsed.getTime();
        earliestDueDate = `${eq.eqIcon} ${eq.eqType}: ${eq.changeOutDate}`;
      }
    });

    data.certifications.forEach(c => {
      const parsed = this.parseDate(c.expDate);
      if (parsed && parsed.getTime() < earliestTime) {
        earliestTime = parsed.getTime();
        earliestDueDate = `${this.getCertIcon(c.certType)} ${c.certType}: ${c.expDate}`;
      }
    });

    let html = `
      <!-- Employee Profile Header Card -->
      <div style="background-color: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 10px; padding: 18px; margin-bottom: 20px;">
        <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 14px; margin-bottom: 14px;">
          
          <div style="display: flex; align-items: center; gap: 14px;">
            <div style="width: 52px; height: 52px; border-radius: 50%; background: linear-gradient(135deg, #3b82f6 0%, #1e40af 100%); display: flex; align-items: center; justify-content: center; font-size: 26px; box-shadow: 0 4px 10px rgba(59, 130, 246, 0.3);">
              👤
            </div>
            <div>
              <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                <h2 style="font-size: 20px; font-weight: 800; color: var(--text-primary); margin: 0;">${this.escapeHtml(data.displayName)}</h2>
                <span class="brand-badge" style="background: rgba(99, 102, 241, 0.2); color: #a5b4fc; border: 1px solid rgba(99, 102, 241, 0.4); font-size: 11px; font-weight: 700;">
                  ⚡ ${this.escapeHtml(data.role)}
                </span>
                <span class="brand-badge" style="background: rgba(139, 92, 246, 0.2); color: #c4b5fd; border: 1px solid rgba(139, 92, 246, 0.4); font-size: 11px; font-weight: 700;">
                  📍 ${this.escapeHtml(data.location)}
                </span>
                <span class="brand-badge" style="background: rgba(59, 130, 246, 0.2); color: #93c5fd; border: 1px solid rgba(59, 130, 246, 0.4); font-size: 11px; font-weight: 700; font-family: monospace;">
                  🔢 Crew ${this.escapeHtml(data.jobNumber)}
                </span>
                ${data.secondaryJob ? `
                  <span class="brand-badge" style="background: rgba(100, 116, 139, 0.2); color: #cbd5e1; border: 1px solid rgba(100, 116, 139, 0.4); font-size: 11px;">
                    Secondary: ${this.escapeHtml(data.secondaryJob)}
                  </span>
                ` : ''}
              </div>

              <!-- Contact Bar -->
              <div style="display: flex; align-items: center; gap: 14px; margin-top: 8px; font-size: 12px; color: var(--text-secondary); flex-wrap: wrap;">
                ${data.phone && data.phone !== 'N/A' ? `
                  <span style="display: inline-flex; align-items: center; gap: 4px; color: #60a5fa; font-weight: 600;">
                    <span>📞</span> ${this.escapeHtml(data.phone)}
                  </span>
                ` : '<span style="color: var(--text-muted);">📞 No phone</span>'}

                ${data.email ? `
                  <span style="display: inline-flex; align-items: center; gap: 4px;">
                    <span>✉️</span> ${this.escapeHtml(data.email)}
                  </span>
                ` : ''}

                ${data.mpEmail && data.mpEmail !== data.email ? `
                  <span style="display: inline-flex; align-items: center; gap: 4px; color: #93c5fd;">
                    <span>🏢</span> ${this.escapeHtml(data.mpEmail)}
                  </span>
                ` : ''}
              </div>
            </div>
          </div>

        </div>

        <!-- 4-Card Quick KPI Grid -->
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 10px; margin-top: 14px;">
          
          <div style="background-color: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: 8px; padding: 10px 14px;">
            <div style="font-size: 11px; color: var(--text-muted); text-transform: uppercase; font-weight: 700; margin-bottom: 2px;">Assigned Equipment</div>
            <div style="font-size: 17px; font-weight: 800; color: ${totalEquipment > 0 ? '#38bdf8' : '#94a3b8'};">
              📦 ${totalEquipment} Item${totalEquipment === 1 ? '' : 's'}
            </div>
            <div style="font-size: 11px; color: var(--text-secondary); margin-top: 2px;">Active PPE & Safety gear</div>
          </div>

          <div style="background-color: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: 8px; padding: 10px 14px;">
            <div style="font-size: 11px; color: var(--text-muted); text-transform: uppercase; font-weight: 700; margin-bottom: 2px;">Certifications Status</div>
            <div style="font-size: 17px; font-weight: 800; color: ${expCerts > 0 ? '#ef4444' : (warnCerts > 0 ? '#f59e0b' : '#10b981')};">
              ${expCerts > 0 ? `🔴 ${expCerts} Expired` : (warnCerts > 0 ? `🟡 ${warnCerts} Expiring` : `🟢 ${okCerts} Valid`)}
            </div>
            <div style="font-size: 11px; color: var(--text-secondary); margin-top: 2px;">${totalCerts} Total Certs Tracked</div>
          </div>

          <div style="background-color: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: 8px; padding: 10px 14px;">
            <div style="font-size: 11px; color: var(--text-muted); text-transform: uppercase; font-weight: 700; margin-bottom: 2px;">Training History</div>
            <div style="font-size: 17px; font-weight: 800; color: #a78bfa;">
              🎓 ${data.trainingList.length} Module${data.trainingList.length === 1 ? '' : 's'}
            </div>
            <div style="font-size: 11px; color: var(--text-secondary); margin-top: 2px;">Scheduled & Completed</div>
          </div>

          <div style="background-color: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: 8px; padding: 10px 14px;">
            <div style="font-size: 11px; color: var(--text-muted); text-transform: uppercase; font-weight: 700; margin-bottom: 2px;">Earliest Due Date</div>
            <div style="font-size: 13px; font-weight: 700; color: #fbbf24; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${this.escapeHtml(earliestDueDate)}">
              ⏳ ${this.escapeHtml(earliestDueDate)}
            </div>
            <div style="font-size: 11px; color: var(--text-secondary); margin-top: 2px;">Next changeout or expiry</div>
          </div>

        </div>
      </div>

      <!-- Navigation Tabs inside Profile -->
      <div style="display: flex; gap: 8px; border-bottom: 2px solid var(--border-color); margin-bottom: 16px; padding-bottom: 2px;">
        <button class="btn ${this.currentActiveTab === 'equipment' ? 'btn-primary' : 'btn-secondary'}" 
                style="padding: 7px 14px; font-size: 12px; font-weight: 700;" 
                onclick="window.employeeProfileEngine.setTab('equipment')">
          📦 Assigned Equipment (${data.assignedEquipment.length})
        </button>
        <button class="btn ${this.currentActiveTab === 'certs' ? 'btn-primary' : 'btn-secondary'}" 
                style="padding: 7px 14px; font-size: 12px; font-weight: 700;" 
                onclick="window.employeeProfileEngine.setTab('certs')">
          📜 Certifications & Matrix (${data.certifications.length})
        </button>
        <button class="btn ${this.currentActiveTab === 'history' ? 'btn-primary' : 'btn-secondary'}" 
                style="padding: 7px 14px; font-size: 12px; font-weight: 700;" 
                onclick="window.employeeProfileEngine.setTab('history')">
          🎓 Training & Lifecycle (${data.trainingList.length + data.employeeHistory.length})
        </button>
      </div>

      <!-- Tab Content Area -->
      <div style="min-height: 260px;">
        ${this.renderActiveTabContent()}
      </div>
    `;

    container.innerHTML = html;
  }

  /**
   * Switches equipment sub-category filter tab
   */
  setEquipmentFilter(filterKey) {
    this.currentEquipmentFilter = filterKey;
    const body = document.getElementById('employee-profile-modal-body');
    if (body && this.currentEmployeeData) {
      this.renderModalContent(body);
    }
  }

  /**
   * Helper to render compact 4-column history tables (Item#, Specifications, Issue Date, Return Date)
   */
  renderCompactHistoryTable(historyList, emptyMessage) {
    if (!historyList || historyList.length === 0) {
      return `
        <div style="padding: 24px; text-align: center; color: var(--text-muted); font-size: 12px; background: rgba(0,0,0,0.15); border-radius: 6px; border: 1px dashed var(--border-color);">
          ${this.escapeHtml(emptyMessage)}
        </div>
      `;
    }

    return `
      <div style="overflow-x: auto;">
        <table class="data-table" style="width: 100%; font-size: 12px;">
          <thead>
            <tr>
              <th style="text-align: center; width: 85px;">Item #</th>
              <th style="text-align: left;">Specifications</th>
              <th style="text-align: center; width: 105px;">Issue Date</th>
              <th style="text-align: center; width: 115px;">Return Date</th>
            </tr>
          </thead>
          <tbody>
            ${historyList.map(h => `
              <tr>
                <td style="text-align: center; font-family: monospace; font-weight: 800; color: #60a5fa;">
                  <button class="btn-link" style="background: none; border: none; font-family: inherit; font-size: inherit; font-weight: inherit; color: #60a5fa; cursor: pointer; text-decoration: underline; padding: 0;" title="Click to view lifecycle dossier" onclick="if(window.itemStatsEngine){window.itemStatsEngine.openDossierModal('${this.escapeHtml(h.itemNum)}', '${this.escapeHtml(h.histKey)}');}">
                    ${this.escapeHtml(h.itemNum)}
                  </button>
                </td>
                <td style="text-align: left; color: var(--text-secondary); font-size: 11px;">
                  ${this.escapeHtml(h.specs)}
                </td>
                <td style="text-align: center; font-weight: 600; color: #94a3b8;">
                  ${this.escapeHtml(h.issueDate)}
                </td>
                <td style="text-align: center; font-weight: 700;">
                  ${h.isCurrent ? `
                    <span class="badge" style="background: rgba(34, 197, 94, 0.2); color: #4ade80; border: 1px solid rgba(34, 197, 94, 0.4); padding: 1px 6px; border-radius: 4px; font-size: 10.5px;">
                      🟢 Present
                    </span>
                  ` : (h.returnDate && h.returnDate !== '—' ? `
                    <span style="color: #f87171; font-size: 11px;">↩️ ${this.escapeHtml(h.returnDate)}</span>
                  ` : `<span style="color: var(--text-muted);">—</span>`)}
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  /**
   * Renders the current selected tab body
   */
  renderActiveTabContent() {
    const data = this.currentEmployeeData;
    if (!data) return '';

    if (this.currentActiveTab === 'equipment') {
      const allEq = data.assignedEquipment || [];
      const allHist = data.equipmentHistory || [];

      if (allEq.length === 0 && allHist.length === 0) {
        return `
          <div style="padding: 40px; text-align: center; color: var(--text-muted); background: var(--bg-primary); border-radius: 8px; border: 1px dashed var(--border-color);">
            <div style="font-size: 32px; margin-bottom: 10px;">📦</div>
            <h4 style="color: var(--text-primary); font-size: 15px; margin-bottom: 6px;">No Equipment Records Found</h4>
            <p style="font-size: 13px;">This employee does not have any active equipment checked out or recorded in equipment history.</p>
          </div>
        `;
      }

      // Calculate counts for each equipment category (Active)
      const countAll = allEq.length;
      const countGlovesSleeves = allEq.filter(e => e.eqKey === 'gloves' || e.eqKey === 'sleeves').length;
      const countBlankets = allEq.filter(e => e.eqKey === 'blankets').length;
      const countMacks = allEq.filter(e => e.eqKey === 'macks').length;
      const countGrounds = allEq.filter(e => e.eqKey === 'grounds').length;
      const countSticks = allEq.filter(e => e.eqKey === 'hot_sticks').length;
      const countHvTesters = allEq.filter(e => e.eqKey === 'hv_testers' || e.eqKey === 'phasing_sets').length;
      const countAed = allEq.filter(e => e.eqKey === 'aed').length;

      const categories = [
        { key: 'all', title: 'All Equipment', icon: '📦', count: countAll },
        { key: 'gloves_sleeves', title: 'Gloves & Sleeves', icon: '🧤', count: countGlovesSleeves },
        { key: 'blankets', title: 'Blankets', icon: '🔲', count: countBlankets },
        { key: 'macks', title: 'MACKs', icon: '🧱', count: countMacks },
        { key: 'grounds', title: 'Grounds', icon: '⚡', count: countGrounds },
        { key: 'hot_sticks', title: 'Sticks', icon: '🔴', count: countSticks },
        { key: 'hv_testers', title: 'HV Tester', icon: '⚡', count: countHvTesters },
        { key: 'aed', title: 'AED', icon: '🏥', count: countAed }
      ];

      // Filter active items and history items according to active category
      let filteredEquipment = allEq;
      let filteredHistory = allHist;

      if (this.currentEquipmentFilter === 'gloves_sleeves') {
        filteredEquipment = allEq.filter(e => e.eqKey === 'gloves' || e.eqKey === 'sleeves');
        filteredHistory = allHist.filter(h => h.eqKey === 'gloves' || h.eqKey === 'sleeves');
      } else if (this.currentEquipmentFilter === 'blankets') {
        filteredEquipment = allEq.filter(e => e.eqKey === 'blankets');
        filteredHistory = allHist.filter(h => h.eqKey === 'blankets');
      } else if (this.currentEquipmentFilter === 'macks') {
        filteredEquipment = allEq.filter(e => e.eqKey === 'macks');
        filteredHistory = allHist.filter(h => h.eqKey === 'macks');
      } else if (this.currentEquipmentFilter === 'grounds') {
        filteredEquipment = allEq.filter(e => e.eqKey === 'grounds');
        filteredHistory = allHist.filter(h => h.eqKey === 'grounds');
      } else if (this.currentEquipmentFilter === 'hot_sticks') {
        filteredEquipment = allEq.filter(e => e.eqKey === 'hot_sticks');
        filteredHistory = allHist.filter(h => h.eqKey === 'hot_sticks');
      } else if (this.currentEquipmentFilter === 'hv_testers') {
        filteredEquipment = allEq.filter(e => e.eqKey === 'hv_testers' || e.eqKey === 'phasing_sets');
        filteredHistory = allHist.filter(h => h.eqKey === 'hv_testers' || h.eqKey === 'phasing_sets');
      } else if (this.currentEquipmentFilter === 'aed') {
        filteredEquipment = allEq.filter(e => e.eqKey === 'aed');
        filteredHistory = allHist.filter(h => h.eqKey === 'aed');
      }

      const activeCat = categories.find(c => c.key === this.currentEquipmentFilter) || categories[0];

      let html = `
        <!-- Equipment Category Sub-Tabs -->
        <div style="display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 16px; padding: 6px; background: var(--bg-primary); border-radius: 8px; border: 1px solid var(--border-color);">
          ${categories.map(cat => {
            const isActive = this.currentEquipmentFilter === cat.key;
            const hasItems = cat.count > 0;
            return `
              <button class="btn" 
                      style="padding: 6px 12px; font-size: 12px; font-weight: ${isActive ? '800' : '600'}; border-radius: 6px; display: inline-flex; align-items: center; gap: 6px; transition: all 0.15s ease; cursor: pointer; ${isActive ? 'background: var(--accent); color: #fff; border: 1px solid var(--accent); box-shadow: 0 2px 6px rgba(59, 130, 246, 0.4);' : (hasItems ? 'background: var(--bg-secondary); color: var(--text-primary); border: 1px solid var(--border-color);' : 'background: transparent; color: var(--text-muted); border: 1px dashed rgba(255,255,255,0.1); opacity: 0.6;')}" 
                      onclick="window.employeeProfileEngine.setEquipmentFilter('${cat.key}')">
                <span>${cat.icon}</span>
                <span>${this.escapeHtml(cat.title)}</span>
                <span class="badge" style="background: ${isActive ? 'rgba(255,255,255,0.25)' : (hasItems ? 'rgba(59, 130, 246, 0.2)' : 'rgba(255,255,255,0.05)')}; color: ${isActive ? '#fff' : (hasItems ? '#93c5fd' : 'inherit')}; padding: 1px 6px; border-radius: 10px; font-size: 11px; font-weight: 700;">
                  ${cat.count}
                </span>
              </button>
            `;
          }).join('')}
        </div>
      `;

      // 1. Currently Active Equipment Section
      if (filteredEquipment.length > 0) {
        html += `
          <div style="margin-bottom: 24px;">
            <div style="font-size: 13px; font-weight: 800; color: #4ade80; margin-bottom: 8px; display: flex; align-items: center; gap: 6px;">
              <span>🟢</span> Currently Active ${this.escapeHtml(activeCat.title)} (${filteredEquipment.length})
            </div>
            <div style="overflow-x: auto;">
              <table class="data-table" style="width: 100%; font-size: 12.5px;">
                <thead>
                  <tr>
                    <th style="text-align: left;">Equipment Type</th>
                    <th style="text-align: center;">Item # / Tag</th>
                    <th style="text-align: left;">Specifications</th>
                    <th style="text-align: center;">Test / Cal Date</th>
                    <th style="text-align: center;">Date Assigned</th>
                    <th style="text-align: center;">Change Out Date</th>
                    <th style="text-align: center;">Location</th>
                    <th style="text-align: center;">Status</th>
                    <th style="text-align: center;">Action</th>
                  </tr>
                </thead>
                <tbody>
        `;

        filteredEquipment.forEach(item => {
          html += `
            <tr>
              <td style="font-weight: 700; text-align: left;">
                <span style="margin-right: 6px;">${item.eqIcon}</span> ${this.escapeHtml(item.eqType)}
              </td>
              <td style="text-align: center; font-family: monospace; font-weight: 800; color: #60a5fa;">
                ${this.escapeHtml(item.itemNum)}
                ${item.eslId ? `<div style="font-size: 10px; color: #94a3b8; font-weight: normal;">ESL: ${this.escapeHtml(item.eslId)}</div>` : ''}
              </td>
              <td style="text-align: left; color: var(--text-secondary); font-size: 11.5px;">
                ${this.escapeHtml(item.specs)}
              </td>
              <td style="text-align: center; color: var(--text-secondary);">
                ${this.escapeHtml(item.testDate)}
              </td>
              <td style="text-align: center; color: var(--text-secondary);">
                ${this.escapeHtml(item.dateAssigned)}
              </td>
              <td style="text-align: center; font-weight: 700; color: #facc15;">
                ${this.escapeHtml(item.changeOutDate)}
              </td>
              <td style="text-align: center;">
                <span class="badge" style="background: rgba(139, 92, 246, 0.2); color: #c4b5fd; padding: 2px 6px; border-radius: 4px; font-size: 11px;">
                  📍 ${this.escapeHtml(item.location)}
                </span>
              </td>
              <td style="text-align: center;">
                <span class="badge" style="background: #16a34a; color: #fff; padding: 2px 8px; border-radius: 4px; font-weight: 700; font-size: 11px;">
                  ✅ ${this.escapeHtml(item.status)}
                </span>
              </td>
              <td style="text-align: center;">
                <button class="btn btn-secondary" style="padding: 2px 8px; font-size: 11px;" title="Inspect item lifecycle dossier" onclick="if(window.itemStatsEngine){window.itemStatsEngine.openDossierModal('${this.escapeHtml(item.itemNum)}', '${this.escapeHtml(item.histKey)}');}">
                  📊 Dossier
                </button>
              </td>
            </tr>
          `;
        });

        html += `</tbody></table></div></div>`;
      } else {
        html += `
          <div style="padding: 16px 20px; text-align: center; color: var(--text-muted); background: var(--bg-primary); border-radius: 8px; border: 1px dashed var(--border-color); margin-bottom: 24px;">
            <div style="font-size: 13px; color: var(--text-secondary);">No active <strong>${this.escapeHtml(activeCat.title)}</strong> currently checked out to this employee.</div>
          </div>
        `;
      }

      // 2. Assignment History & Return Log Section
      html += `
        <div style="margin-top: 14px;">
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; border-bottom: 1px solid var(--border-color); padding-bottom: 6px; flex-wrap: wrap; gap: 6px;">
            <div style="font-size: 13px; font-weight: 800; color: #93c5fd; display: flex; align-items: center; gap: 6px;">
              <span>📜</span> ${this.escapeHtml(activeCat.title)} Assignment & Return History (${filteredHistory.length} Total)
            </div>
            <div style="font-size: 11px; color: var(--text-muted);">
              Chronological assignment records (Item #, Specifications, Issue Date, and Return Date)
            </div>
          </div>

          ${this.currentEquipmentFilter === 'gloves_sleeves' ? `
            <!-- Side-by-Side Layout: Gloves Left, Sleeves Right -->
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
              
              <!-- Left Side: Rubber Gloves -->
              <div style="background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 8px; padding: 12px; display: flex; flex-direction: column;">
                <div style="font-size: 13px; font-weight: 800; color: #c084fc; margin-bottom: 10px; display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid var(--border-color); padding-bottom: 6px;">
                  <span style="display: flex; align-items: center; gap: 6px;">
                    <span>🧤</span> Gloves Assignment History
                  </span>
                  <span class="badge" style="background: rgba(192, 132, 252, 0.2); color: #d8b4fe; font-size: 11px; padding: 2px 8px; border-radius: 10px; font-weight: 700;">
                    ${filteredHistory.filter(h => h.eqKey === 'gloves').length} Records
                  </span>
                </div>
                ${this.renderCompactHistoryTable(filteredHistory.filter(h => h.eqKey === 'gloves'), 'No glove assignment records logged for this employee.')}
              </div>

              <!-- Right Side: Rubber Sleeves -->
              <div style="background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 8px; padding: 12px; display: flex; flex-direction: column;">
                <div style="font-size: 13px; font-weight: 800; color: #60a5fa; margin-bottom: 10px; display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid var(--border-color); padding-bottom: 6px;">
                  <span style="display: flex; align-items: center; gap: 6px;">
                    <span>🦾</span> Sleeves Assignment History
                  </span>
                  <span class="badge" style="background: rgba(96, 165, 250, 0.2); color: #93c5fd; font-size: 11px; padding: 2px 8px; border-radius: 10px; font-weight: 700;">
                    ${filteredHistory.filter(h => h.eqKey === 'sleeves').length} Records
                  </span>
                </div>
                ${this.renderCompactHistoryTable(filteredHistory.filter(h => h.eqKey === 'sleeves'), 'No sleeve assignment records logged for this employee.')}
              </div>

            </div>
          ` : `
            <!-- Single Table for other categories -->
            <div style="background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 8px; padding: 12px;">
              ${this.renderCompactHistoryTable(filteredHistory, `No ${activeCat.title} assignment records logged for this employee.`)}
            </div>
          `}
        </div>
      `;

      return html;
    }

    if (this.currentActiveTab === 'certs') {
      if (data.certifications.length === 0) {
        return `
          <div style="padding: 40px; text-align: center; color: var(--text-muted); background: var(--bg-primary); border-radius: 8px; border: 1px dashed var(--border-color);">
            <div style="font-size: 32px; margin-bottom: 10px;">📜</div>
            <h4 style="color: var(--text-primary); font-size: 15px; margin-bottom: 6px;">No Certification Records Found</h4>
            <p style="font-size: 13px;">No expiring certs or qualification entries are currently mapped for this employee name.</p>
          </div>
        `;
      }

      let html = `
        <div style="overflow-x: auto;">
          <table class="data-table" style="width: 100%; font-size: 12.5px;">
            <thead>
              <tr>
                <th style="text-align: left;">Certification / License</th>
                <th style="text-align: center;">Expiration Date</th>
                <th style="text-align: center;">Days Remaining</th>
                <th style="text-align: center;">Status</th>
                <th style="text-align: center;">Date Acquired</th>
                <th style="text-align: center;">SMS Notification</th>
                <th style="text-align: left;">Notes</th>
              </tr>
            </thead>
            <tbody>
      `;

      data.certifications.forEach(c => {
        let statusBadge = `<span class="badge" style="background-color: #15803d; color: #fff; padding: 2px 8px; border-radius: 4px; font-weight: 700;">🟢 OK</span>`;
        const sLower = c.status.toLowerCase();

        if (sLower === 'upcoming') {
          statusBadge = `<span class="badge" style="background-color: #0284c7; color: #fff; padding: 2px 8px; border-radius: 4px; font-weight: 700;">🔵 Upcoming</span>`;
        } else if (sLower === 'warning') {
          statusBadge = `<span class="badge" style="background-color: #d97706; color: #fff; padding: 2px 8px; border-radius: 4px; font-weight: 700;">🟡 Warning</span>`;
        } else if (sLower === 'critical') {
          statusBadge = `<span class="badge" style="background-color: #ea580c; color: #fff; padding: 2px 8px; border-radius: 4px; font-weight: 700;">🟠 Critical</span>`;
        } else if (sLower === 'expired') {
          statusBadge = `<span class="badge" style="background-color: #dc2626; color: #fff; padding: 2px 8px; border-radius: 4px; font-weight: 700;">🔴 Expired</span>`;
        } else if (sLower === 'missing') {
          statusBadge = `<span class="badge" style="background-color: #991b1b; color: #fff; padding: 2px 8px; border-radius: 4px; font-weight: 700;">❌ Missing</span>`;
        } else if (sLower === 'declined') {
          statusBadge = `<span class="badge" style="background-color: #475569; color: #fff; padding: 2px 8px; border-radius: 4px; font-weight: 700;">🚫 Declined</span>`;
        } else if (sLower === 'no date set' || sLower.includes('no date')) {
          statusBadge = `<span class="badge" style="background-color: #334155; color: #94a3b8; padding: 2px 8px; border-radius: 4px; font-weight: 600;">⚪ No Date Set</span>`;
        } else if (sLower.includes('not req')) {
          statusBadge = `<span class="badge" style="background-color: #334155; color: #94a3b8; padding: 2px 8px; border-radius: 4px; font-weight: 600;">⚪ Not Required</span>`;
        }

        let daysHtml = '—';
        if (c.daysLeft !== null) {
          if (c.daysLeft <= 0) {
            daysHtml = `<span style="color: #ef4444; font-weight: 800;">${c.daysLeft}d (Expired)</span>`;
          } else if (c.daysLeft <= 30) {
            daysHtml = `<span style="color: #f97316; font-weight: 700;">${c.daysLeft}d</span>`;
          } else if (c.daysLeft <= 60) {
            daysHtml = `<span style="color: #eab308; font-weight: 600;">${c.daysLeft}d</span>`;
          } else {
            daysHtml = `<span style="color: #4ade80;">${c.daysLeft}d</span>`;
          }
        }

        html += `
          <tr>
            <td style="font-weight: 700; text-align: left; color: #f8fafc;">
              ${this.getCertIcon(c.certType)} ${this.escapeHtml(c.certType)}
            </td>
            <td style="text-align: center; font-weight: 700;">
              ${this.escapeHtml(c.expDate)}
            </td>
            <td style="text-align: center;">
              ${daysHtml}
            </td>
            <td style="text-align: center;">
              ${statusBadge}
            </td>
            <td style="text-align: center; color: var(--text-secondary);">
              ${this.escapeHtml(c.testDate)}
            </td>
            <td style="text-align: center;">
              ${c.smsStatus && (c.smsStatus.includes('Sent') || c.smsStatus.includes('Notified')) ? `
                <button class="btn btn-secondary" style="font-size: 11px; padding: 2px 6px; background: rgba(59, 130, 246, 0.2); color: #93c5fd; border: 1px solid rgba(59, 130, 246, 0.4); cursor: pointer; border-radius: 4px;" title="Notification logged (${this.escapeHtml(c.smsStatus)}). Click to resend SMS." onclick="if(window.smsDialogEngine){window.smsDialogEngine.openCertSms('${this.escapeHtml(data.displayName)}', '${this.escapeHtml(c.certType)}', '${this.escapeHtml(c.expDate)}');}">
                  📱 ${this.escapeHtml(c.smsStatus)}
                </button>
              ` : `
                <button class="btn btn-primary" style="font-size: 11px; padding: 2px 8px; background-color: #f59e0b; border: 1px solid #d97706; color: #fff; font-weight: 700; cursor: pointer; border-radius: 4px; display: inline-flex; align-items: center; gap: 4px; box-shadow: 0 1px 3px rgba(0,0,0,0.2);" title="Send SMS reminder to ${this.escapeHtml(data.displayName)}" onclick="if(window.smsDialogEngine){window.smsDialogEngine.openCertSms('${this.escapeHtml(data.displayName)}', '${this.escapeHtml(c.certType)}', '${this.escapeHtml(c.expDate)}');}">
                  💬 Send SMS
                </button>
              `}
            </td>
            <td style="text-align: left; font-size: 11px; color: var(--text-muted);">
              ${this.escapeHtml(c.notes || '')}
            </td>
          </tr>
        `;
      });

      html += `</tbody></table></div>`;
      return html;
    }

    if (this.currentActiveTab === 'history') {
      return `
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
          
          <!-- Column 1: Scheduled Training Modules -->
          <div>
            <h4 style="font-size: 13px; font-weight: 700; margin-bottom: 10px; color: #a78bfa; display: flex; align-items: center; gap: 6px;">
              <span>🎓</span> Scheduled & Completed Training (${data.trainingList.length})
            </h4>
            ${data.trainingList.length === 0 ? `
              <div style="padding: 20px; text-align: center; color: var(--text-muted); background: var(--bg-primary); border-radius: 6px; border: 1px dashed var(--border-color); font-size: 12px;">
                No training modules found for this crew.
              </div>
            ` : `
              <div style="display: flex; flex-direction: column; gap: 8px;">
                ${data.trainingList.map(tr => `
                  <div style="background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 6px; padding: 10px 12px; font-size: 12px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                      <span style="font-weight: 700; color: #f8fafc;">${this.escapeHtml(tr.topic)}</span>
                      <span class="badge" style="background: ${tr.status.toLowerCase().includes('comp') ? '#15803d' : '#d97706'}; color: #fff; padding: 1px 6px; border-radius: 3px; font-size: 10px;">
                        ${this.escapeHtml(tr.status)}
                      </span>
                    </div>
                    <div style="color: var(--text-secondary); font-size: 11px;">
                      📅 Month: <strong>${this.escapeHtml(tr.month)}</strong> &nbsp;|&nbsp; Crew: <strong>${this.escapeHtml(tr.crew)}</strong> (${this.escapeHtml(tr.lead || 'Lead')})
                    </div>
                  </div>
                `).join('')}
              </div>
            `}
          </div>

          <!-- Column 2: Employee Lifecycle Milestones -->
          <div>
            <h4 style="font-size: 13px; font-weight: 700; margin-bottom: 10px; color: #60a5fa; display: flex; align-items: center; gap: 6px;">
              <span>📋</span> Career Milestones & History (${data.employeeHistory.length})
            </h4>
            ${data.employeeHistory.length === 0 ? `
              <div style="padding: 20px; text-align: center; color: var(--text-muted); background: var(--bg-primary); border-radius: 6px; border: 1px dashed var(--border-color); font-size: 12px;">
                No employee history events logged.
              </div>
            ` : `
              <div style="display: flex; flex-direction: column; gap: 8px;">
                ${data.employeeHistory.map(h => `
                  <div style="background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 6px; padding: 10px 12px; font-size: 12px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                      <span style="font-weight: 700; color: #f8fafc;">${this.escapeHtml(h.event)}</span>
                      <span style="color: #60a5fa; font-size: 11px; font-weight: 600;">${this.escapeHtml(h.date)}</span>
                    </div>
                    <div style="color: var(--text-secondary); font-size: 11px;">
                      ${h.details ? this.escapeHtml(h.details) : `Location: ${this.escapeHtml(h.location || 'N/A')} · Job: ${this.escapeHtml(h.job || 'N/A')}`}
                    </div>
                  </div>
                `).join('')}
              </div>
            `}
          </div>

        </div>
      `;
    }

    return '';
  }

  parseDate(str) {
    if (!str || str === 'N/A') return null;
    if (str.includes('/')) {
      const parts = str.split('/');
      if (parts.length === 3) {
        const m = parseInt(parts[0], 10) - 1;
        const d = parseInt(parts[1], 10);
        const y = parseInt(parts[2], 10);
        return new Date(y, m, d, 12, 0, 0);
      }
    }
    const d = new Date(str);
    return isNaN(d.getTime()) ? null : d;
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

window.employeeProfileEngine = new EmployeeProfileEngine(window.localDB);
