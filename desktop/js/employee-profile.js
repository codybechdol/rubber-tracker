/**
 * employee-profile.js - Comprehensive Employee Profile, Assignments & Certifications Dossier Engine
 */

class EmployeeProfileEngine {
  constructor(db) {
    this.db = db;
    this.currentActiveTab = 'equipment'; // 'equipment' | 'certs' | 'history'
    this.currentEquipmentFilter = 'all'; // 'all' | 'gloves_sleeves' | 'blankets' | 'macks' | 'grounds' | 'hot_sticks' | 'hv_testers' | 'aed'
    this.currentEmployeeData = null;
    this.activeEditCert = null;
  }

  init() {
    // Escape key closes modals
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        const editModal = document.getElementById('edit-cert-dates-modal');
        if (editModal && editModal.classList.contains('active')) {
          this.closeEditCertModal();
          return;
        }
        this.closeProfileModal();
      }
    });
  }

  /**
   * Flexible name normalization
   */
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

  /**
   * Matches employee name across different formats (e.g. "Darrell Swann" vs "Swann, Darrell" vs "Keenan O'Keefe" vs "O'Keefe, Keenan")
   */
  isNameMatch(nameA, nameB) {
    if (!nameA || !nameB) return false;
    const normA = this.normalizeName(nameA);
    const normB = this.normalizeName(nameB);
    if (!normA || !normB) return false;

    if (normA === normB) return true;

    // Compact comparison (strips whitespace and punctuation, e.g. "keenanokeefe" === "keenanokeefe")
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
              // This is the latest historical event for this item
              const rowAssignedLower = assignedTo.toLowerCase();
              const rowNotesLower = (notes || '').toLowerCase();
              const rowLocLower = (location || '').toLowerCase();
              const isTerminatedState = rowAssignedLower.includes('shelf') || rowLocLower.includes('shelf') ||
                                        rowAssignedLower.includes('test') || rowLocLower.includes('test') ||
                                        rowAssignedLower.includes('retir') || rowNotesLower.includes('retir') ||
                                        rowAssignedLower.includes('lost') || rowNotesLower.includes('lost');

              if (!isTerminatedState) {
                returnDateStr = 'Present';
                returnStatus = 'Currently Active';
                isCurrent = true;

                if (issueDateObj) {
                  const now = new Date();
                  const days = Math.max(0, Math.round((now.getTime() - issueDateObj.getTime()) / (1000 * 60 * 60 * 24)));
                  durationStr = this.formatDuration(days);
                }

                // Ensure item is present in assignedEquipment list so it appears in active section
                const alreadyInAssigned = assignedEquipment.some(ae => ae.histKey === def.histKey && ae.itemNum === itemNum);
                if (!alreadyInAssigned) {
                  const eslId = String(row['ESL ID'] || row['ESLID'] || '').trim();
                  let changeOutDate = String(row['Change Out Date'] || row['Changeout Date'] || row['Pad Expiration'] || '').trim();
                  const testDate = String(row['Test Date'] || row['Calibration Date'] || 'N/A').trim();
                  const itemStatus = String(row['Status'] || 'Assigned').trim();
                  const itemLoc = String(row['Location'] || location || '').trim();

                  if ((!changeOutDate || changeOutDate === 'N/A') && issueDateStr && issueDateStr !== 'N/A') {
                    if (window.inventoryManager && typeof window.inventoryManager.calculateChangeOutDate === 'function') {
                      const calc = window.inventoryManager.calculateChangeOutDate(
                        issueDateStr, itemLoc, displayName, def.key, { testDate: testDate !== 'N/A' ? testDate : '' }
                      );
                      if (calc && calc !== 'N/A') {
                        changeOutDate = calc;
                      }
                    }
                  }
                  if (!changeOutDate) changeOutDate = 'N/A';

                  assignedEquipment.push({
                    eqType: def.title,
                    eqIcon: def.icon,
                    eqKey: def.key,
                    histKey: def.histKey,
                    itemNum: itemNum,
                    eslId: eslId,
                    specs: specs.join(' · ') || 'Standard',
                    dateAssigned: issueDateStr,
                    changeOutDate: changeOutDate,
                    testDate: testDate,
                    status: itemStatus,
                    location: itemLoc
                  });
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

    // Prune any items from assignedEquipment that history confirms were returned / sent to testing / reassigned
    for (let j = assignedEquipment.length - 1; j >= 0; j--) {
      const ae = assignedEquipment[j];
      const matchingHist = results.find(h => h.histKey === ae.histKey && String(h.itemNum).toLowerCase().trim() === String(ae.itemNum).toLowerCase().trim());
      if (matchingHist && !matchingHist.isCurrent) {
        assignedEquipment.splice(j, 1);
      }
    }

    return results;
  }

  /**
   * Extracts the full, accurate item number / serial number from an inventory or history row
   */
  getItemNum(item, tableHeaders) {
    if (!item) return 'N/A';

    // 1. Try specific known column headers for item / serial identifier
    const knownKeys = [
      'HVT #', 'HVT#', 'HVT', 'HV Tester #', 'HV Tester',
      'PS #', 'PS#', 'Phasing Set #', 'Phasing Set',
      'Item #', 'Item#', 'Item', 'Items',
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
        if (!this.isDateString(val)) {
          return val;
        }
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
            const val = String(item[h]).trim();
            if (!this.isDateString(val)) {
              return val;
            }
          }
        }
      }
    }

    // 3. Fallback: check other non-metadata keys
    for (let k of Object.keys(item)) {
      if (k.startsWith('_')) continue;
      const kl = k.toLowerCase();
      if (kl.includes('date') || kl.includes('assign') || kl.includes('time') || kl.includes('status') || kl.includes('location') || kl.includes('note') || kl.includes('spec') || kl.includes('name') || kl.includes('emp')) continue;
      const val = String(item[k]).trim();
      if (val && !this.isDateString(val)) {
        return val;
      }
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

    const profileData = this.compileProfileData(snap, employeeName);
    if (!profileData) return;

    this.currentActiveTab = 'equipment';
    this.currentEquipmentFilter = 'all';
    this.currentEmployeeData = profileData;

    if (titleEl) {
      titleEl.innerHTML = `<span style="font-size: 18px;">👤</span> Employee Profile: <strong>${this.escapeHtml(profileData.displayName)}</strong>`;
    }

    this.renderModalContent(body);
    modal.classList.add('active');
  }

  compileProfileData(snap, employeeName) {
    if (!snap || !snap.tables) return null;
    const rawEmpName = String(employeeName || '').trim();
    if (!rawEmpName) return null;

    // 1. Locate Employee Record in Employees table, Previous Employees table, or Employee History table
    const empTable = snap.tables['employees'];
    let empRow = null;
    if (empTable && empTable.rows) {
      empRow = empTable.rows.find(r => {
        const rName = r['Name'] || r['Employee Name'] || r['Employee'] || r['Worker'] || '';
        return this.isNameMatch(rName, rawEmpName);
      });
    }

    const prevTable = snap.tables['previous_employees'] || snap.tables['previous_employee'] || snap.tables['past_employees'];
    let prevRow = null;
    if (!empRow && prevTable && prevTable.rows) {
      prevRow = prevTable.rows.find(r => {
        const rName = r['Name'] || r['Employee Name'] || r['Employee'] || r['Worker'] || Object.values(r)[0] || '';
        return this.isNameMatch(rName, rawEmpName);
      });
    }

    const histTable = snap.tables['employee_history'];
    let histRow = null;
    if (!empRow && !prevRow && histTable && histTable.rows) {
      histRow = histTable.rows.slice().reverse().find(r => {
        const rName = r['Employee Name'] || r['Name'] || r['Employee'] || r['Worker'] || Object.values(r)[1] || '';
        return this.isNameMatch(rName, rawEmpName);
      });
    }

    const primaryRow = empRow || prevRow || histRow;
    const displayName = primaryRow ? (primaryRow['Name'] || primaryRow['Employee Name'] || primaryRow['Worker'] || rawEmpName) : rawEmpName;
    const location = primaryRow ? (primaryRow['Location'] || (prevRow ? 'Previous Employee' : (histRow ? 'Previous Employee' : 'Unknown'))) : 'Unknown';
    const jobNumber = primaryRow ? (primaryRow['Job Number'] || primaryRow['Job #'] || 'N/A') : 'N/A';
    const secondaryJob = primaryRow ? (primaryRow['Secondary Job Number'] || '') : '';
    const role = primaryRow ? (primaryRow['Job Classification'] || primaryRow['Classification'] || primaryRow['Role'] || (prevRow ? 'Previous Employee' : (histRow ? 'Previous Employee' : 'Lineman'))) : 'Previous Employee';
    const phone = primaryRow ? (primaryRow['Phone Number'] || primaryRow['Phone'] || 'N/A') : 'N/A';
    const email = primaryRow ? (primaryRow['Email Address'] || primaryRow['Email'] || '') : '';
    const mpEmail = primaryRow ? (primaryRow['MP Email'] || '') : '';
    const notifEmail = primaryRow ? (primaryRow['Notification Emails'] || '') : '';
    const hireDate = primaryRow ? (primaryRow['Hire Date'] || primaryRow['Hire'] || '') : '';

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
          if (this.isNameMatch(assignedTo, displayName) || this.isNameMatch(assignedTo, rawEmpName)) {
            const itemNum = this.getItemNum(item, t.headers);
            const eslId = String(item['ESL ID'] || '').trim();
            const size = String(item['Size'] || '').trim();
            const classVal = String(item['Class'] || '').trim();
            const kv = String(item['KV'] || '').trim();
            const model = String(item['Model'] || '').trim();
            const type = String(item['Type'] || '').trim();
            const length = String(item['Length'] || '').trim();
            const serial = String(item['Serial #'] || item['Serial'] || '').trim();
            let changeOutDate = String(item['Change Out Date'] || item['Changeout Date'] || item['Pad Expiration'] || '').trim();
            const dateAssigned = String(item['Date Assigned'] || item['Date'] || 'N/A').trim();
            const testDate = String(item['Test Date'] || item['Calibration Date'] || 'N/A').trim();
            const status = String(item['Status'] || 'Assigned').trim();
            const itemLoc = String(item['Location'] || location).trim();

            // Calculate Change Out Date if N/A or empty but Date Assigned / Test Date is present
            if ((!changeOutDate || changeOutDate === 'N/A') && (dateAssigned !== 'N/A' || testDate !== 'N/A')) {
              if (window.inventoryManager && typeof window.inventoryManager.calculateChangeOutDate === 'function') {
                const calc = window.inventoryManager.calculateChangeOutDate(
                  dateAssigned !== 'N/A' ? dateAssigned : testDate,
                  itemLoc,
                  assignedTo,
                  eq.key,
                  { testDate: testDate !== 'N/A' ? testDate : '' }
                );
                if (calc && calc !== 'N/A') {
                  changeOutDate = calc;
                }
              }
            }
            if (!changeOutDate) changeOutDate = 'N/A';

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
    const certsTable = snap.tables['expiring_certs'] || snap.tables['certs'] || snap.tables['certifications'];
    const certifications = [];
    const matchedCerts = new Set();

    if (certsTable && certsTable.rows) {
      certsTable.rows.forEach(c => {
        const cEmp = String(c['Employee Name'] || c['Employee'] || c['Name'] || c['Worker'] || Object.values(c)[0] || '').trim();
        if (this.isNameMatch(cEmp, displayName) || this.isNameMatch(cEmp, rawEmpName)) {
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

          matchedCerts.add(this.normalizeName(certType));

          certifications.push({
            rowIdx: c._rowIdx || null,
            rawRow: c,
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

    // Ensure all 16 standard company certifications are included in the qualification matrix
    const standardCertTypes = [
      'First Aid / CPR',
      'Pole Top Rescue',
      'Bucket Truck Rescue',
      'Crane - Mobile',
      'Rigging / Signal Person',
      'CDL - Medical',
      'OSHA 10/30',
      'Diggers Hotline',
      'Forklift / Telehandler',
      'Defensive Driving',
      'Substation Safety',
      'Enclosed Space',
      'MSHA',
      'BNSF Safety',
      'Crane Operator Eval',
      'Helicopter Safety'
    ];

    standardCertTypes.forEach(stdType => {
      const normStd = this.normalizeName(stdType);
      if (!matchedCerts.has(normStd) && !certifications.some(c => this.normalizeName(c.certType) === normStd)) {
        certifications.push({
          rowIdx: null,
          rawRow: null,
          certType: stdType,
          expDate: 'No Date Set',
          testDate: 'N/A',
          daysLeft: null,
          status: 'No Date Set',
          smsStatus: '',
          notes: ''
        });
      }
    });

    // 4. Scan Training Tracking for this employee / crew
    const trainingTable = snap.tables['training_tracking'];
    const trainingList = [];
    if (trainingTable && trainingTable.rows) {
      trainingTable.rows.forEach(tr => {
        const lead = String(tr['Lead'] || tr['Crew Lead'] || tr['Foreman'] || '').trim();
        const crew = String(tr['Crew'] || tr['Job #'] || tr['Job Number'] || '').trim();
        const attendees = String(tr['Attendees'] || tr['Crew Members'] || '').trim();

        const isLeadMatch = this.isNameMatch(lead, displayName) || this.isNameMatch(lead, rawEmpName);
        const isAttendeeMatch = attendees && (this.isNameMatch(attendees, displayName) || this.isNameMatch(attendees, rawEmpName));
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

    // 5. Scan Employee History & Certifications for Career Milestones
    const historyTable = snap.tables['employee_history'];
    const employeeHistory = [];

    // A. Lifecycle events from Employee History
    if (historyTable && historyTable.rows) {
      historyTable.rows.forEach(h => {
        const hName = String(h['Employee Name'] || h['Name'] || h['Employee'] || h['Worker'] || Object.values(h)[1] || '').trim();
        if (this.isNameMatch(hName, displayName) || this.isNameMatch(hName, rawEmpName)) {
          const rawEvent = String(h['Event'] || h['Event Type'] || h['Action'] || '').trim();
          const rawDetails = String(h['Details'] || h['Notes'] || h['Description'] || h['Last Day Reason'] || '').trim();
          const rawLoc = String(h['Location'] || '').trim();
          const rawJob = String(h['Job Number'] || h['Job #'] || '').trim();
          const dateStr = String(h['Date'] || h['Date Changed'] || 'N/A').trim();

          const eventLower = rawEvent.toLowerCase();
          const detailsLower = rawDetails.toLowerCase();

          const isHire = eventLower.includes('new hire') || (eventLower.includes('hire') && !eventLower.includes('rehire'));
          const isRehire = eventLower.includes('rehire');
          const isTerm = eventLower.includes('term') || eventLower.includes('quit') || eventLower.includes('departure') || eventLower.includes('layoff') || eventLower.includes('archive') || eventLower.includes('previous');
          const isRole = eventLower.includes('role') || eventLower.includes('promotion') || eventLower.includes('class');
          const isLocEvent = eventLower.includes('location') || eventLower.includes('rezone') || eventLower.includes('transfer');
          const detailsHasLoc = detailsLower.includes('location') || detailsLower.includes('rezone') || detailsLower.includes('moved to') || detailsLower.includes('transfer') || detailsLower.includes('changed from');
          const isCertEvent = eventLower.includes('cert') || eventLower.includes('cpr') || eventLower.includes('first aid') || eventLower.includes('osha') || eventLower.includes('crane') || eventLower.includes('license') || eventLower.includes('medical');
          const detailsHasCert = detailsLower.includes('cert') || detailsLower.includes('cpr') || detailsLower.includes('first aid') || detailsLower.includes('osha') || detailsLower.includes('crane') || detailsLower.includes('license') || detailsLower.includes('medical');

          if (isHire) {
            employeeHistory.push({
              type: 'hire',
              date: dateStr,
              event: '🎉 New Hire',
              details: rawDetails || `Hired at ${rawLoc || location || 'Helena'}${rawJob || jobNumber ? ` (Job ${rawJob || jobNumber})` : ''}`,
              location: rawLoc,
              job: rawJob
            });
          } else if (isRehire) {
            employeeHistory.push({
              type: 'rehire',
              date: dateStr,
              event: '🔄 Rehired',
              details: rawDetails || `Rehired at ${rawLoc || location || 'Helena'}${rawJob || jobNumber ? ` (Job ${rawJob || jobNumber})` : ''}`,
              location: rawLoc,
              job: rawJob
            });
          } else if (isTerm) {
            employeeHistory.push({
              type: 'term',
              date: dateStr,
              event: '🚪 Departure / Termination',
              details: rawDetails || `Separated from employment`,
              location: rawLoc,
              job: rawJob
            });
          } else if (isRole) {
            employeeHistory.push({
              type: 'role',
              date: dateStr,
              event: '⭐ Role & Classification Change',
              details: rawDetails || `Role updated`,
              location: rawLoc,
              job: rawJob
            });
          } else if (isLocEvent || (eventLower.includes('change') && detailsHasLoc)) {
            let locDetails = rawDetails;
            if (rawDetails.includes('Location:')) {
              const match = rawDetails.match(/Location:\s*([^;,\n]+)/i);
              if (match) locDetails = `Location: ${match[1].trim()}`;
            } else if (rawDetails.includes('Changed from')) {
              locDetails = rawDetails;
            } else if (rawLoc) {
              locDetails = `Location: ${rawLoc}${rawJob ? ` (Job ${rawJob})` : ''}`;
            }

            employeeHistory.push({
              type: 'location',
              date: dateStr,
              event: '📍 Location Change',
              details: locDetails || `Location: ${rawLoc || 'Updated'}`,
              location: rawLoc,
              job: rawJob
            });
          } else if (isCertEvent || detailsHasCert) {
            employeeHistory.push({
              type: 'cert',
              date: dateStr,
              event: rawEvent.startsWith('📜') ? rawEvent : `📜 ${rawEvent}`,
              details: rawDetails || 'Certification updated',
              location: rawLoc,
              job: rawJob
            });
          } else {
            employeeHistory.push({
              type: 'general',
              date: dateStr,
              event: rawEvent ? (rawEvent.startsWith('📋') ? rawEvent : `📋 ${rawEvent}`) : '📋 Career Milestone',
              details: rawDetails || (rawLoc ? `Recorded for ${rawLoc}` : 'Career event logged'),
              location: rawLoc,
              job: rawJob
            });
          }
        }
      });
    }

    // A2. Lifecycle events from Previous Employees table
    const prevSheetTable = snap.tables['previous_employees'] || snap.tables['previous_employee'] || snap.tables['past_employees'];
    if (prevSheetTable && prevSheetTable.rows) {
      prevSheetTable.rows.forEach(p => {
        const pName = String(p['Employee Name'] || p['Name'] || p['Employee'] || p['Worker'] || Object.values(p)[0] || '').trim();
        if (this.isNameMatch(pName, displayName) || this.isNameMatch(pName, rawEmpName)) {
          const lastDay = String(p['Last Day'] || p['Term Date'] || p['Date'] || '').trim();
          const reason = String(p['Last Day Reason'] || p['Reason'] || p['Notes'] || 'Departed').trim();
          const loc = String(p['Location'] || '').trim();
          const job = String(p['Job Number'] || p['Job #'] || '').trim();
          const roleVal = String(p['Job Classification'] || p['Classification'] || p['Role'] || '').trim();
          const hireVal = String(p['Hire Date'] || p['Hire'] || '').trim();

          if (lastDay && lastDay !== 'N/A') {
            const hasTerm = employeeHistory.some(e => e.type === 'term');
            if (!hasTerm) {
              employeeHistory.push({
                type: 'term',
                date: lastDay,
                event: '🚪 Departure / Termination',
                details: reason || 'Previous Employee',
                location: loc || location,
                job: job || jobNumber
              });
            }
          }

          if (hireVal && hireVal !== 'N/A') {
            const hasHire = employeeHistory.some(e => e.type === 'hire');
            if (!hasHire) {
              employeeHistory.push({
                type: 'hire',
                date: hireVal,
                event: '🎉 New Hire / Start Date',
                details: `Hired as ${roleVal || 'Lineworker'}${loc ? ` at ${loc}` : ''}${job ? ` (Job ${job})` : ''}`,
                location: loc || location,
                job: job || jobNumber
              });
            }
          }
        }
      });
    }

    // Synthesize Hire Milestone from Employees table Hire Date if not already logged in history
    if (hireDate && hireDate !== 'N/A') {
      const hasHireInHistory = employeeHistory.some(e => e.type === 'hire' || e.type === 'rehire');
      if (!hasHireInHistory) {
        employeeHistory.push({
          type: 'hire',
          date: hireDate,
          event: '🎉 New Hire / Start Date',
          details: `Hired as ${role || 'Lineworker'} at ${location || 'Helena'}${jobNumber ? ` (Job ${jobNumber})` : ''}`,
          location: location,
          job: jobNumber
        });
      }
    }

    // B. Cert Updates from Certifications List (for certs that have a recorded date)
    if (certifications && certifications.length > 0) {
      certifications.forEach(c => {
        const certName = c.certType || 'Certification';
        const dateUpdated = (c.testDate && c.testDate !== 'N/A') ? c.testDate : ((c.expDate && c.expDate !== 'N/A' && c.expDate !== 'No Date Set') ? c.expDate : null);
        if (dateUpdated) {
          const isDup = employeeHistory.some(e => e.type === 'cert' && e.date === dateUpdated && e.details.toLowerCase().includes(certName.toLowerCase()));
          if (!isDup) {
            let certDetail = `Valid · ${certName}`;
            if (c.testDate && c.testDate !== 'N/A' && c.expDate && c.expDate !== 'N/A' && c.expDate !== 'No Date Set') {
              certDetail = `Updated / Acquired: ${c.testDate} · Expires: ${c.expDate}`;
            } else if (c.expDate && c.expDate !== 'N/A' && c.expDate !== 'No Date Set') {
              certDetail = `Expires: ${c.expDate}`;
            } else if (c.testDate && c.testDate !== 'N/A') {
              certDetail = `Date Acquired: ${c.testDate}`;
            }

            employeeHistory.push({
              type: 'cert',
              date: dateUpdated,
              event: `📜 Cert Recorded: ${certName}`,
              details: certDetail,
              location: location,
              job: jobNumber
            });
          }
        }
      });
    }

    // C. Baseline Career Milestone Fallback for Former Employees if no history rows were logged
    if (employeeHistory.length === 0 && primaryRow) {
      if (prevRow || location === 'Previous Employee' || (primaryRow && String(primaryRow['Status'] || '').toLowerCase().includes('prev'))) {
        const lastReason = prevRow ? (prevRow['Last Day Reason'] || prevRow['Reason'] || prevRow['Notes'] || 'Separated') : 'Previous Employee Archive';
        const lastDate = prevRow ? (prevRow['Last Day'] || prevRow['Date'] || '') : '';
        employeeHistory.push({
          type: 'term',
          date: lastDate || 'Archive Record',
          event: '🚪 Departure / Archive Record',
          details: `Status: Previous Employee · ${lastReason}`,
          location: location || 'Helena',
          job: jobNumber || 'N/A'
        });
      }
      if (hireDate) {
        employeeHistory.push({
          type: 'hire',
          date: hireDate,
          event: '🎉 Employment Record',
          details: `Role: ${role || 'Lineman'} · Location: ${location || 'Helena'}`,
          location: location || 'Helena',
          job: jobNumber || 'N/A'
        });
      }
    }

    // 5b. Scan DOT Drug Tests for Completed and Scheduled tests
    const drugTestsTable = snap.tables['dot_drug_tests'];
    const completedDrugTests = [];
    const scheduledDrugTests = [];
    const allDrugTests = [];

    if (drugTestsTable && drugTestsTable.rows) {
      drugTestsTable.rows.forEach((r, idx) => {
        const empName = String(r['Employee Name'] || r['Name'] || r[1] || '').trim();
        if (!empName) return;
        if (this.isNameMatch(empName, displayName) || this.isNameMatch(empName, rawEmpName)) {
          const quarter = String(r['Quarter'] || r[0] || '').trim();
          const testType = String(r['Test Type'] || r[5] || 'Drug Only').trim();
          const classification = String(r['Classification'] || r[6] || 'FMCSA').trim();
          const collectionType = String(r['Collection Type'] || r[7] || 'Clinic Visit').trim();
          const clinicName = String(r['Clinic Name'] || r[8] || '').trim();
          const clinicCity = String(r['Clinic City / State'] || r[9] || '').trim();
          const schedDate = String(r['Scheduled Date'] || r[11] || '').trim();
          const schedTime = String(r['Scheduled Time'] || r[12] || '').trim();
          const meetingAddr = String(r['Meeting / Collection Address'] || r[13] || '').trim();
          const status = String(r['Status'] || r[14] || '').trim();
          const dateCompleted = String(r['Date Completed'] || r[15] || '').trim();
          const paperworkNotes = String(r['Paperwork / Kit Notes'] || r[16] || '').trim();
          const notes = String(r['Notes'] || r[17] || '').trim();

          const testObj = {
            id: `dt_${idx + 1}`,
            quarter,
            empName,
            testType,
            classification,
            collectionType,
            clinicName,
            clinicCity,
            schedDate,
            schedTime,
            meetingAddr,
            status,
            dateCompleted,
            paperworkNotes,
            notes,
            isCompleted: status.toLowerCase() === 'completed' || (dateCompleted && dateCompleted !== 'N/A' && dateCompleted !== '')
          };

          allDrugTests.push(testObj);

          if (testObj.isCompleted) {
            completedDrugTests.push(testObj);

            // Add Milestone to Career History
            employeeHistory.push({
              type: 'drug_test',
              date: dateCompleted || schedDate,
              event: '🧪 DOT Drug Test Completed',
              details: `${quarter} · ${testType} (${classification}) · ${collectionType === 'Mobile Collector' ? 'Mobile Collector' : (clinicName || 'Clinic')}${meetingAddr ? ' @ ' + meetingAddr : ''}${notes ? ' · ' + notes : ''}`,
              location: clinicCity || location || 'Helena',
              job: jobNumber || 'N/A'
            });
          } else if (status.toLowerCase() === 'scheduled' || schedDate) {
            scheduledDrugTests.push(testObj);
          }
        }
      });
    }

    // Sort Milestones chronologically (most recent first)
    employeeHistory.sort((a, b) => {
      const dA = this.parseDate(a.date);
      const dB = this.parseDate(b.date);
      if (dA && dB && !isNaN(dA.getTime()) && !isNaN(dB.getTime())) {
        return dB.getTime() - dA.getTime();
      }
      if (dA && !isNaN(dA.getTime())) return -1;
      if (dB && !isNaN(dB.getTime())) return 1;
      return 0;
    });

    // 6. Scan Equipment History for complete assignment and return lifecycle
    const equipmentHistory = this.extractEquipmentHistory(snap, displayName, assignedEquipment);

    // Store state for tab switching
    return {
      displayName,
      location,
      jobNumber,
      secondaryJob,
      role,
      phone,
      email,
      mpEmail,
      notifEmail,
      hireDate,
      assignedEquipment,
      equipmentHistory,
      certifications,
      trainingList,
      employeeHistory,
      completedDrugTests,
      scheduledDrugTests,
      allDrugTests
    };
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

          ${totalEquipment > 0 ? `
            <div style="display: flex; align-items: center; gap: 8px;">
              <button class="btn btn-secondary" style="font-size: 11.5px; padding: 6px 12px; border-color: #0284c7; color: #38bdf8; display: inline-flex; align-items: center; gap: 5px;" onclick="if(window.inventoryManager){window.inventoryManager.openTransferEquipmentModal('${this.escapeHtml(data.displayName)}');}">
                <span>⚡</span> Transfer Equipment
              </button>
            </div>
          ` : ''}

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
            <div style="font-size: 17px; font-weight: 800; color: ${expCerts > 0 ? '#ef4444' : (warnCerts > 0 ? '#f59e0b' : (okCerts > 0 ? '#10b981' : '#94a3b8'))};">
              ${expCerts > 0 ? `🔴 ${expCerts} Expired` : (warnCerts > 0 ? `🟡 ${warnCerts} Expiring` : (okCerts > 0 ? `🟢 ${okCerts} Valid` : `⚪ ${totalCerts} Tracked`))}
            </div>
            <div style="font-size: 11px; color: var(--text-secondary); margin-top: 2px;">${okCerts > 0 ? `${totalCerts} Total Certs Tracked` : 'Company Qualification Matrix'}</div>
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
        <button class="btn ${this.currentActiveTab === 'drug_tests' ? 'btn-primary' : 'btn-secondary'}" 
                style="padding: 7px 14px; font-size: 12px; font-weight: 700;" 
                onclick="window.employeeProfileEngine.setTab('drug_tests')">
          🧪 DOT Drug Tests (${data.completedDrugTests.length})
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

  isDateString(val) {
    if (!val || val === 'N/A') return false;
    if (val instanceof Date) return true;
    const s = String(val).trim();
    if (/^\d{1,4}[-/]\d{1,2}[-/]\d{1,4}/.test(s)) return true;
    return false;
  }

  /**
   * Helper to render compact 4-column history tables (Item#, Specifications, Issue Date, Return Date)
   */
  renderCompactHistoryTable(historyList, emptyMessage, showEquipmentCol = false) {
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
              ${showEquipmentCol ? `<th style="text-align: left; width: 140px;">Equipment</th>` : ''}
              <th style="text-align: center; width: 85px;">Item #</th>
              <th style="text-align: left;">Specifications</th>
              <th style="text-align: center; width: 105px;">Issue Date</th>
              <th style="text-align: center; width: 115px;">Return Date</th>
            </tr>
          </thead>
          <tbody>
            ${historyList.map(h => `
              <tr>
                ${showEquipmentCol ? `
                  <td style="font-weight: 700; text-align: left;">
                    <span style="margin-right: 4px;">${h.eqIcon}</span> ${this.escapeHtml(h.eqType)}
                  </td>
                ` : ''}
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
      const showActiveEqCol = this.currentEquipmentFilter === 'all';

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
                    ${showActiveEqCol ? `<th style="text-align: left;">Equipment Type</th>` : ''}
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
              ${showActiveEqCol ? `
                <td style="font-weight: 700; text-align: left;">
                  <span style="margin-right: 6px;">${item.eqIcon}</span> ${this.escapeHtml(item.eqType)}
                </td>
              ` : ''}
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
                ${this.renderCompactHistoryTable(filteredHistory.filter(h => h.eqKey === 'gloves'), 'No glove assignment records logged for this employee.', false)}
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
                ${this.renderCompactHistoryTable(filteredHistory.filter(h => h.eqKey === 'sleeves'), 'No sleeve assignment records logged for this employee.', false)}
              </div>

            </div>
          ` : `
            <!-- Single Table for specific categories -->
            <div style="background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 8px; padding: 12px;">
              ${this.renderCompactHistoryTable(filteredHistory, `No ${activeCat.title} assignment records logged for this employee.`, showActiveEqCol)}
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
              <button class="btn-cell-edit" title="Click to edit Expiration Date" onclick="window.employeeProfileEngine.openEditCertModal('${this.escapeHtml(data.displayName)}', '${this.escapeHtml(c.certType)}')">
                <span style="font-weight: 700; color: ${c.expDate && c.expDate !== 'N/A' ? '#facc15' : 'inherit'};">${this.escapeHtml(c.expDate)}</span>
                <span class="edit-icon">✏️</span>
              </button>
            </td>
            <td style="text-align: center;">
              ${daysHtml}
            </td>
            <td style="text-align: center;">
              ${statusBadge}
            </td>
            <td style="text-align: center;">
              <button class="btn-cell-edit" title="Click to edit Date Acquired" onclick="window.employeeProfileEngine.openEditCertModal('${this.escapeHtml(data.displayName)}', '${this.escapeHtml(c.certType)}')">
                <span style="color: var(--text-secondary);">${this.escapeHtml(c.testDate)}</span>
                <span class="edit-icon">✏️</span>
              </button>
            </td>
            <td style="text-align: center;">
              <div style="display: flex; align-items: center; justify-content: center; gap: 6px;">
                <button class="btn btn-secondary" style="font-size: 11px; padding: 2px 7px; display: inline-flex; align-items: center; gap: 4px; border-color: rgba(59, 130, 246, 0.4); color: #93c5fd;" title="Edit Date Acquired and Expiration Date for ${this.escapeHtml(c.certType)}" onclick="window.employeeProfileEngine.openEditCertModal('${this.escapeHtml(data.displayName)}', '${this.escapeHtml(c.certType)}')">
                  <span>✏️</span> Edit
                </button>
                ${c.smsStatus && (c.smsStatus.includes('Sent') || c.smsStatus.includes('Notified')) ? `
                  <button class="btn btn-secondary" style="font-size: 11px; padding: 2px 6px; background: rgba(59, 130, 246, 0.2); color: #93c5fd; border: 1px solid rgba(59, 130, 246, 0.4); cursor: pointer; border-radius: 4px;" title="Notification logged (${this.escapeHtml(c.smsStatus)}). Click to resend SMS." onclick="if(window.smsDialogEngine){window.smsDialogEngine.openCertSms('${this.escapeHtml(data.displayName)}', '${this.escapeHtml(c.certType)}', '${this.escapeHtml(c.expDate)}');}">
                    📱 ${this.escapeHtml(c.smsStatus)}
                  </button>
                ` : `
                  <button class="btn btn-primary" style="font-size: 11px; padding: 2px 8px; background-color: #f59e0b; border: 1px solid #d97706; color: #fff; font-weight: 700; cursor: pointer; border-radius: 4px; display: inline-flex; align-items: center; gap: 4px; box-shadow: 0 1px 3px rgba(0,0,0,0.2);" title="Send SMS reminder to ${this.escapeHtml(data.displayName)}" onclick="if(window.smsDialogEngine){window.smsDialogEngine.openCertSms('${this.escapeHtml(data.displayName)}', '${this.escapeHtml(c.certType)}', '${this.escapeHtml(c.expDate)}');}">
                    💬 Send SMS
                  </button>
                `}
              </div>
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
                No career milestones, location changes, or cert updates logged.
              </div>
            ` : `
              <div style="display: flex; flex-direction: column; gap: 8px;">
                ${data.employeeHistory.map(h => {
                  const styleMap = {
                    hire: { titleColor: '#10b981', borderColor: 'rgba(16, 185, 129, 0.35)', bg: 'rgba(16, 185, 129, 0.05)' },
                    rehire: { titleColor: '#f97316', borderColor: 'rgba(249, 115, 22, 0.35)', bg: 'rgba(249, 115, 22, 0.05)' },
                    location: { titleColor: '#60a5fa', borderColor: 'rgba(59, 130, 246, 0.35)', bg: 'var(--bg-primary)' },
                    role: { titleColor: '#a855f7', borderColor: 'rgba(168, 85, 247, 0.35)', bg: 'rgba(168, 85, 247, 0.05)' },
                    term: { titleColor: '#ef4444', borderColor: 'rgba(239, 68, 68, 0.35)', bg: 'rgba(239, 68, 68, 0.05)' },
                    cert: { titleColor: '#f59e0b', borderColor: 'rgba(245, 158, 11, 0.35)', bg: 'var(--bg-primary)' },
                    drug_test: { titleColor: '#c084fc', borderColor: 'rgba(192, 132, 252, 0.35)', bg: 'rgba(192, 132, 252, 0.08)' }
                  };
                  const s = styleMap[h.type] || styleMap.location;

                  return `
                    <div style="background: ${s.bg}; border: 1px solid ${s.borderColor}; border-radius: 6px; padding: 10px 12px; font-size: 12px;">
                      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                        <span style="font-weight: 700; color: ${s.titleColor}; display: flex; align-items: center; gap: 4px;">
                          ${this.escapeHtml(h.event)}
                        </span>
                        <span style="color: #94a3b8; font-size: 11px; font-weight: 600;">📅 ${this.escapeHtml(h.date)}</span>
                      </div>
                      <div style="color: var(--text-secondary); font-size: 11.5px; line-height: 1.4;">
                        ${this.escapeHtml(h.details || '')}
                      </div>
                    </div>
                  `;
                }).join('')}
              </div>
            `}
          </div>

        </div>
      `;
    }

    if (this.currentActiveTab === 'drug_tests') {
      return this.renderDrugTestsTab(data);
    }

    return '';
  }

  /**
   * Renders the complete DOT Drug & Alcohol Testing tab
   */
  renderDrugTestsTab(data) {
    const completed = data.completedDrugTests || [];
    const scheduled = data.scheduledDrugTests || [];
    const latestTest = completed.length > 0 ? completed[0] : null;

    let html = `
      <!-- Drug Test Summary KPI Cards -->
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 10px; margin-bottom: 20px;">
        <div style="background-color: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 8px; padding: 12px 14px;">
          <div style="font-size: 11px; color: var(--text-muted); text-transform: uppercase; font-weight: 700; margin-bottom: 3px;">Completed Tests</div>
          <div style="font-size: 20px; font-weight: 800; color: #4ade80;">${completed.length}</div>
          <div style="font-size: 11px; color: var(--text-secondary); margin-top: 2px;">Official Random / DOT</div>
        </div>

        <div style="background-color: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 8px; padding: 12px 14px;">
          <div style="font-size: 11px; color: var(--text-muted); text-transform: uppercase; font-weight: 700; margin-bottom: 3px;">Latest Test Date</div>
          <div style="font-size: 16px; font-weight: 800; color: #93c5fd;">
            ${latestTest ? this.escapeHtml(latestTest.dateCompleted || latestTest.schedDate || 'Recorded') : 'None on file'}
          </div>
          <div style="font-size: 11px; color: var(--text-secondary); margin-top: 2px;">${latestTest ? this.escapeHtml(latestTest.quarter) : 'No tests recorded'}</div>
        </div>

        <div style="background-color: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 8px; padding: 12px 14px;">
          <div style="font-size: 11px; color: var(--text-muted); text-transform: uppercase; font-weight: 700; margin-bottom: 3px;">Agency Classification</div>
          <div style="font-size: 16px; font-weight: 800; color: #c084fc;">
            ${latestTest ? this.escapeHtml(latestTest.classification) : 'FMCSA / DOT'}
          </div>
          <div style="font-size: 11px; color: var(--text-secondary); margin-top: 2px;">${latestTest ? this.escapeHtml(latestTest.testType) : 'Testing Pool'}</div>
        </div>

        <div style="background-color: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 8px; padding: 12px 14px;">
          <div style="font-size: 11px; color: var(--text-muted); text-transform: uppercase; font-weight: 700; margin-bottom: 3px;">Active Scheduled</div>
          <div style="font-size: 20px; font-weight: 800; color: ${scheduled.length > 0 ? '#facc15' : '#94a3b8'};">${scheduled.length}</div>
          <div style="font-size: 11px; color: var(--text-secondary); margin-top: 2px;">Upcoming appointments</div>
        </div>
      </div>
    `;

    // Show Scheduled Test Banner if pending
    if (scheduled.length > 0) {
      html += `
        <div style="background: rgba(234, 179, 8, 0.1); border: 1px solid rgba(234, 179, 8, 0.35); border-left: 4px solid #facc15; border-radius: 8px; padding: 12px 16px; margin-bottom: 20px;">
          <div style="font-size: 13px; font-weight: 800; color: #facc15; margin-bottom: 4px; display: flex; align-items: center; gap: 6px;">
            <span>🗓️</span> Active Scheduled DOT Drug Test (${scheduled.length})
          </div>
          ${scheduled.map(st => `
            <div style="font-size: 12px; color: #f8fafc; margin-top: 4px;">
              <strong>${this.escapeHtml(st.quarter)}</strong>: ${this.escapeHtml(st.testType)} (${this.escapeHtml(st.classification)}) &nbsp;•&nbsp; 
              Scheduled: <strong>${this.escapeHtml(st.schedDate || 'Pending Date')}${st.schedTime ? ' @ ' + this.escapeHtml(st.schedTime) : ''}</strong> &nbsp;•&nbsp; 
              Method: <strong>${this.escapeHtml(st.collectionType)}</strong> &nbsp;•&nbsp; 
              ${st.clinicName ? `Clinic: <strong>${this.escapeHtml(st.clinicName)}</strong>` : ''}
              ${st.meetingAddr ? ` &nbsp;•&nbsp; 📍 Meeting at: <strong style="color: #93c5fd;">${this.escapeHtml(st.meetingAddr)}</strong>` : ''}
            </div>
          `).join('')}
        </div>
      `;
    }

    // Historical Completed Tests Table
    html += `
      <div style="margin-bottom: 16px;">
        <div style="font-size: 13px; font-weight: 800; color: #f8fafc; margin-bottom: 10px; display: flex; align-items: center; justify-content: space-between;">
          <span style="display: flex; align-items: center; gap: 6px;">
            <span>📋</span> Completed Drug & Alcohol Testing Records (${completed.length})
          </span>
          <button class="btn btn-secondary" style="font-size: 11px; padding: 3px 9px;" onclick="if(window.drugTestingEngine){window.showView('drug-testing-view');window.employeeProfileEngine.closeProfileModal();}">
            🧪 Open DOT Drug Testing Console →
          </button>
        </div>
    `;

    if (completed.length === 0) {
      html += `
        <div style="padding: 36px 20px; text-align: center; color: var(--text-muted); background: var(--bg-primary); border-radius: 8px; border: 1px dashed var(--border-color);">
          <div style="font-size: 28px; margin-bottom: 6px;">🧪</div>
          <h4 style="font-size: 14px; font-weight: 700; color: #f8fafc; margin-bottom: 4px;">No Completed Drug Tests On File</h4>
          <p style="font-size: 12px; color: var(--text-secondary); max-width: 460px; margin: 0 auto;">
            When this employee completes an official random or pre-employment DOT drug/alcohol test, complete test records, paperwork notes, and clinic details will appear here automatically.
          </p>
        </div>
      </div>
      `;
    } else {
      html += `
        <div style="overflow-x: auto; background: var(--bg-primary); border-radius: 8px; border: 1px solid var(--border-color);">
          <table class="data-table" style="width: 100%; font-size: 12px;">
            <thead>
              <tr>
                <th style="text-align: center;">Quarter</th>
                <th style="text-align: center;">Date Completed</th>
                <th style="text-align: center;">Test Option</th>
                <th style="text-align: center;">Agency</th>
                <th style="text-align: center;">Collection Method</th>
                <th style="text-align: left;">Clinic / Provider</th>
                <th style="text-align: left;">Meeting / Location Address</th>
                <th style="text-align: left;">Paperwork / Kit Notes</th>
                <th style="text-align: center;">Status</th>
              </tr>
            </thead>
            <tbody>
              ${completed.map(ct => `
                <tr>
                  <td style="text-align: center; font-weight: 700; color: #93c5fd;">
                    ${this.escapeHtml(ct.quarter)}
                  </td>
                  <td style="text-align: center; font-weight: 700; color: #4ade80;">
                    ${this.escapeHtml(ct.dateCompleted || ct.schedDate || 'Completed')}
                  </td>
                  <td style="text-align: center;">
                    <span class="badge" style="background: rgba(139, 92, 246, 0.15); color: #c084fc; border: 1px solid rgba(139, 92, 246, 0.3); font-size: 10.5px; padding: 2px 7px;">
                      🧪 ${this.escapeHtml(ct.testType)}
                    </span>
                  </td>
                  <td style="text-align: center;">
                    <span class="badge" style="background: rgba(59, 130, 246, 0.15); color: #93c5fd; border: 1px solid rgba(59, 130, 246, 0.3); font-size: 10.5px; padding: 2px 7px;">
                      🏛️ ${this.escapeHtml(ct.classification)}
                    </span>
                  </td>
                  <td style="text-align: center; color: var(--text-secondary);">
                    ${ct.collectionType === 'Mobile Collector' ? '🚐 Mobile Collector' : '🏥 Clinic Visit'}
                  </td>
                  <td style="text-align: left; font-weight: 600; color: #f8fafc;">
                    ${this.escapeHtml(ct.clinicName || (ct.collectionType === 'Mobile Collector' ? 'Mobile Collector' : '—'))}
                    ${ct.clinicCity ? `<div style="font-size: 10.5px; color: #94a3b8; font-weight: normal;">${this.escapeHtml(ct.clinicCity)}</div>` : ''}
                  </td>
                  <td style="text-align: left; color: var(--text-secondary); font-size: 11.5px;">
                    ${this.escapeHtml(ct.meetingAddr || '—')}
                  </td>
                  <td style="text-align: left; color: var(--text-muted); font-size: 11px;">
                    ${this.escapeHtml(ct.paperworkNotes || ct.notes || '—')}
                  </td>
                  <td style="text-align: center;">
                    <span class="badge" style="background: rgba(34, 197, 94, 0.2); color: #4ade80; border: 1px solid rgba(34, 197, 94, 0.4); font-size: 11px; padding: 2px 8px; font-weight: 700;">
                      ✅ Completed
                    </span>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
      `;
    }

    return html;
  }

  /**
   * Identifies non-expiring certifications and qualifications
   */
  isNonExpiringCert(certType) {
    const ct = String(certType || '').trim().toLowerCase();
    return ct.includes('osha') || 
           ct.includes('crane eval') || 
           ct.includes('bnsf') || 
           ct.includes('msha') || 
           ct.includes('eica') || 
           ct.includes('helicopter');
  }

  /**
   * Returns validity cycle length and descriptive label for a certification
   */
  getCertCycleInfo(certType) {
    if (this.isNonExpiringCert(certType)) {
      return { isExpiring: false, years: null, label: 'Non-Expiring Qualification' };
    }
    const ct = String(certType || '').trim().toLowerCase();
    if (ct.includes('pole top') || ct.includes('harass') || ct.includes('coin cpr') || ct.includes('annual')) {
      return { isExpiring: true, years: 1, label: '1-Year Cycle (Annual)' };
    }
    if (ct.includes('cpr') || ct.includes('1st aid') || ct.includes('first aid')) {
      return { isExpiring: true, years: 2, label: '2-Year Cycle' };
    }
    if (ct.includes('forklift') || ct.includes('trench') || ct.includes('rigging')) {
      return { isExpiring: true, years: 3, label: '3-Year Cycle' };
    }
    if (ct.includes('crane')) {
      return { isExpiring: true, years: 5, label: '5-Year Cycle' };
    }
    if (ct.includes('dl') || ct.includes('driver')) {
      return { isExpiring: true, years: 8, label: '8-Year Cycle' };
    }
    if (ct.includes('mec') || ct.includes('dot') || ct.includes('medical') || ct.includes('physical')) {
      return { isExpiring: true, years: 2, label: '2-Year Cycle (DOT)' };
    }
    return { isExpiring: true, years: 1, label: 'Standard Cycle (1-Year)' };
  }

  /**
   * Auto-calculates expiration date from acquired date
   */
  calculateCertExpDate(certType, acqDate) {
    if (!acqDate || this.isNonExpiringCert(certType)) return null;
    const parsed = (acqDate instanceof Date) ? acqDate : this.parseDate(acqDate);
    if (!parsed) return null;
    const cycle = this.getCertCycleInfo(certType);
    if (!cycle.isExpiring || !cycle.years) return null;
    const exp = new Date(parsed.getTime());
    exp.setFullYear(exp.getFullYear() + cycle.years);
    return exp;
  }

  /**
   * Auto-calculates acquired date from expiration date
   */
  calculateCertAcqDate(certType, expDate) {
    if (!expDate || this.isNonExpiringCert(certType)) return null;
    const parsed = (expDate instanceof Date) ? expDate : this.parseDate(expDate);
    if (!parsed) return null;
    const cycle = this.getCertCycleInfo(certType);
    if (!cycle.isExpiring || !cycle.years) return null;
    const acq = new Date(parsed.getTime());
    acq.setFullYear(acq.getFullYear() - cycle.years);
    return acq;
  }

  /**
   * Calculates days remaining and standardized status string for a certification
   */
  calculateCertDaysAndStatus(certType, expDateStr, acqDateStr) {
    const isNonExp = this.isNonExpiringCert(certType);
    if (isNonExp) {
      const hasAcq = acqDateStr && acqDateStr !== 'N/A' && String(acqDateStr).trim() !== '';
      return {
        daysLeft: null,
        status: hasAcq ? 'OK' : 'No Date Set'
      };
    }

    if (!expDateStr || expDateStr === 'N/A' || String(expDateStr).trim() === '') {
      return {
        daysLeft: null,
        status: 'No Date Set'
      };
    }

    const expDt = this.parseDate(expDateStr);
    if (!expDt) {
      return {
        daysLeft: null,
        status: 'No Date Set'
      };
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const diffMs = expDt.getTime() - today.getTime();
    const daysLeft = Math.round(diffMs / (1000 * 60 * 60 * 24));
    let status = 'OK';
    if (daysLeft < 0) status = 'Expired';
    else if (daysLeft <= 7) status = 'Critical';
    else if (daysLeft <= 30) status = 'Warning';
    else if (daysLeft <= 60) status = 'Upcoming';
    else status = 'OK';

    return { daysLeft, status };
  }

  /**
   * Formats a date into YYYY-MM-DD format for HTML <input type="date">
   */
  formatDateInput(val) {
    if (!val || val === 'N/A') return '';
    if (typeof val === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(val.trim())) return val.trim();
    const d = (val instanceof Date) ? val : this.parseDate(val);
    if (!d || !(d instanceof Date) || isNaN(d.getTime())) return '';
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  /**
   * Opens the Edit Certification Dates Modal
   */
  openEditCertModal(employeeName, certType) {
    const modal = document.getElementById('edit-cert-dates-modal');
    const body = document.getElementById('edit-cert-dates-modal-body');
    const titleEl = document.getElementById('edit-cert-dates-modal-title');
    if (!modal || !body) return;

    const data = this.currentEmployeeData;
    const empName = employeeName || (data ? data.displayName : '');
    if (!empName || !certType) return;

    let certObj = null;
    if (data && data.certifications) {
      certObj = data.certifications.find(c => c.certType === certType || this.normalizeName(c.certType) === this.normalizeName(certType));
    }

    const currentAcq = certObj ? certObj.testDate : '';
    const currentExp = certObj ? certObj.expDate : '';
    const currentNotes = certObj ? certObj.notes : '';

    const acqIso = this.formatDateInput(currentAcq);
    const expIso = this.formatDateInput(currentExp);

    const cycle = this.getCertCycleInfo(certType);

    this.activeEditCert = {
      employeeName: empName,
      certType: certType,
      certObj: certObj
    };

    if (titleEl) {
      titleEl.innerHTML = `Edit Certification Dates: <strong>${this.escapeHtml(certType)}</strong>`;
    }

    body.innerHTML = `
      <div style="display: flex; flex-direction: column; gap: 16px;">
        <!-- Cert Info Header Card -->
        <div style="background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 8px; padding: 12px 16px; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px;">
          <div style="display: flex; align-items: center; gap: 10px;">
            <div style="font-size: 26px;">${this.getCertIcon(certType)}</div>
            <div>
              <div style="font-size: 15px; font-weight: 800; color: #f8fafc;">${this.escapeHtml(certType)}</div>
              <div style="font-size: 12px; color: #60a5fa; font-weight: 600;">👤 ${this.escapeHtml(empName)}</div>
            </div>
          </div>
          <div>
            <span class="badge" style="background: ${cycle.isExpiring ? 'rgba(59, 130, 246, 0.2)' : 'rgba(16, 185, 129, 0.2)'}; color: ${cycle.isExpiring ? '#93c5fd' : '#4ade80'}; border: 1px solid ${cycle.isExpiring ? 'rgba(59, 130, 246, 0.4)' : 'rgba(16, 185, 129, 0.4)'}; padding: 4px 10px; border-radius: 20px; font-size: 11.5px; font-weight: 700;">
              ${cycle.label}
            </span>
          </div>
        </div>

        <!-- Date Inputs Grid -->
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 14px;">
          <!-- Date Acquired -->
          <div class="form-group" style="display: flex; flex-direction: column; gap: 6px;">
            <label style="font-size: 12px; font-weight: 700; color: var(--text-primary); display: flex; align-items: center; justify-content: space-between;">
              <span>📅 Date Acquired / Class Date</span>
            </label>
            <input type="date" id="cert-edit-acq-date" value="${acqIso}" style="width: 100%; background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 6px; color: var(--text-primary); padding: 8px 10px; font-size: 13px; outline: none;">
            <div style="display: flex; gap: 6px; flex-wrap: wrap; margin-top: 2px;">
              <button type="button" class="btn-preset" onclick="window.employeeProfileEngine.quickSetAcqDate('today')">📅 Today</button>
              <button type="button" class="btn-preset" onclick="window.employeeProfileEngine.quickSetAcqDate('clear')">✕ Clear</button>
            </div>
            <div style="font-size: 11px; color: var(--text-muted); margin-top: 2px;">
              ${cycle.isExpiring ? `Setting Acquired date auto-calculates Expiration (${cycle.years} yrs).` : 'Evaluations & one-time certs record completion date.'}
            </div>
          </div>

          <!-- Expiration Date -->
          <div class="form-group" style="display: flex; flex-direction: column; gap: 6px;">
            <label style="font-size: 12px; font-weight: 700; color: var(--text-primary); display: flex; align-items: center; justify-content: space-between;">
              <span>⏳ Expiration Date</span>
            </label>
            <input type="date" id="cert-edit-exp-date" value="${expIso}" ${!cycle.isExpiring ? 'disabled placeholder="N/A (Non-Expiring)"' : ''} style="width: 100%; background: ${!cycle.isExpiring ? 'rgba(0,0,0,0.2)' : 'var(--bg-primary)'}; border: 1px solid var(--border-color); border-radius: 6px; color: ${!cycle.isExpiring ? 'var(--text-muted)' : 'var(--text-primary)'}; padding: 8px 10px; font-size: 13px; outline: none;">
            <div style="display: flex; gap: 6px; flex-wrap: wrap; margin-top: 2px;">
              ${cycle.isExpiring ? `
                <button type="button" class="btn-preset" onclick="window.employeeProfileEngine.quickSetExpDate('auto')">🔄 Auto-Calc</button>
                <button type="button" class="btn-preset" onclick="window.employeeProfileEngine.quickSetExpDate('+1yr')">+1 Yr</button>
                <button type="button" class="btn-preset" onclick="window.employeeProfileEngine.quickSetExpDate('+2yr')">+2 Yrs</button>
                <button type="button" class="btn-preset" onclick="window.employeeProfileEngine.quickSetExpDate('+5yr')">+5 Yrs</button>
                <button type="button" class="btn-preset" onclick="window.employeeProfileEngine.quickSetExpDate('clear')">✕ Clear</button>
              ` : `
                <span style="font-size: 11px; color: var(--text-muted); padding: 4px 0;">Non-expiring qualification (N/A)</span>
              `}
            </div>
            <div style="font-size: 11px; color: var(--text-muted); margin-top: 2px;">
              ${cycle.isExpiring ? 'Enter custom expiration or choose preset.' : 'Expiration date is not required.'}
            </div>
          </div>
        </div>

        <!-- Real-Time Dynamic Status & Days Preview Card -->
        <div class="cert-live-preview" id="cert-edit-live-preview">
          <!-- Updated dynamically -->
        </div>

        <!-- Notes Field -->
        <div class="form-group" style="display: flex; flex-direction: column; gap: 6px;">
          <label style="font-size: 12px; font-weight: 700; color: var(--text-primary);">
            📝 Notes / Reference # (Optional)
          </label>
          <input type="text" id="cert-edit-notes" value="${this.escapeHtml(currentNotes || '')}" placeholder="e.g. Card #, Evaluation notes, Instructor..." style="width: 100%; background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 6px; color: var(--text-primary); padding: 8px 10px; font-size: 12.5px; outline: none;">
        </div>
      </div>
    `;

    // Attach real-time calculation listeners
    const acqInput = document.getElementById('cert-edit-acq-date');
    const expInput = document.getElementById('cert-edit-exp-date');

    if (acqInput) {
      acqInput.addEventListener('change', () => {
        const acqVal = acqInput.value;
        if (acqVal && cycle.isExpiring && expInput) {
          const expDate = this.calculateCertExpDate(certType, acqVal);
          if (expDate) {
            expInput.value = this.formatDateInput(expDate);
          }
        }
        this.updateLiveCertPreview();
      });
      acqInput.addEventListener('input', () => this.updateLiveCertPreview());
    }

    if (expInput) {
      expInput.addEventListener('change', () => this.updateLiveCertPreview());
      expInput.addEventListener('input', () => this.updateLiveCertPreview());
    }

    this.updateLiveCertPreview();
    modal.classList.add('active');
  }

  /**
   * Closes the Edit Certification Dates Modal
   */
  closeEditCertModal() {
    const modal = document.getElementById('edit-cert-dates-modal');
    if (modal) modal.classList.remove('active');
    this.activeEditCert = null;
  }

  /**
   * Quick preset button handler for Date Acquired
   */
  quickSetAcqDate(preset) {
    const acqInput = document.getElementById('cert-edit-acq-date');
    const expInput = document.getElementById('cert-edit-exp-date');
    if (!acqInput || !this.activeEditCert) return;

    const certType = this.activeEditCert.certType;
    const cycle = this.getCertCycleInfo(certType);

    if (preset === 'today') {
      const today = new Date();
      const todayIso = this.formatDateInput(today);
      acqInput.value = todayIso;
      if (cycle.isExpiring && expInput) {
        const expDate = this.calculateCertExpDate(certType, today);
        if (expDate) expInput.value = this.formatDateInput(expDate);
      }
    } else if (preset === 'clear') {
      acqInput.value = '';
    }
    this.updateLiveCertPreview();
  }

  /**
   * Quick preset button handler for Expiration Date
   */
  quickSetExpDate(preset) {
    const acqInput = document.getElementById('cert-edit-acq-date');
    const expInput = document.getElementById('cert-edit-exp-date');
    if (!expInput || !this.activeEditCert) return;

    const certType = this.activeEditCert.certType;

    if (preset === 'auto') {
      const acqVal = acqInput ? acqInput.value : '';
      if (acqVal) {
        const expDate = this.calculateCertExpDate(certType, acqVal);
        if (expDate) expInput.value = this.formatDateInput(expDate);
      }
    } else if (preset.startsWith('+')) {
      const years = parseInt(preset.replace('+', '').replace('yr', '').replace('yrs', ''), 10) || 1;
      const baseDate = (acqInput && acqInput.value) ? this.parseDate(acqInput.value) : new Date();
      if (baseDate) {
        const target = new Date(baseDate.getTime());
        target.setFullYear(target.getFullYear() + years);
        expInput.value = this.formatDateInput(target);
      }
    } else if (preset === 'clear') {
      expInput.value = '';
    }
    this.updateLiveCertPreview();
  }

  /**
   * Updates the dynamic live preview card inside the Edit Certification Dates Modal
   */
  updateLiveCertPreview() {
    const container = document.getElementById('cert-edit-live-preview');
    if (!container || !this.activeEditCert) return;

    const certType = this.activeEditCert.certType;
    const acqInput = document.getElementById('cert-edit-acq-date');
    const expInput = document.getElementById('cert-edit-exp-date');

    const acqVal = acqInput ? acqInput.value : '';
    const expVal = expInput ? expInput.value : '';

    const isNonExp = this.isNonExpiringCert(certType);

    const expDisplay = expVal ? this.formatDateDisplay(this.parseDate(expVal)) : 'N/A';
    const acqDisplay = acqVal ? this.formatDateDisplay(this.parseDate(acqVal)) : 'N/A';

    const { daysLeft, status } = this.calculateCertDaysAndStatus(certType, expDisplay, acqDisplay);

    let statusBadge = `<span class="badge" style="background-color: #15803d; color: #fff; padding: 3px 10px; border-radius: 4px; font-weight: 700; font-size: 12px;">🟢 OK</span>`;
    const sLower = status.toLowerCase();

    if (sLower === 'upcoming') {
      statusBadge = `<span class="badge" style="background-color: #0284c7; color: #fff; padding: 3px 10px; border-radius: 4px; font-weight: 700; font-size: 12px;">🔵 Upcoming</span>`;
    } else if (sLower === 'warning') {
      statusBadge = `<span class="badge" style="background-color: #d97706; color: #fff; padding: 3px 10px; border-radius: 4px; font-weight: 700; font-size: 12px;">🟡 Warning</span>`;
    } else if (sLower === 'critical') {
      statusBadge = `<span class="badge" style="background-color: #ea580c; color: #fff; padding: 3px 10px; border-radius: 4px; font-weight: 700; font-size: 12px;">🟠 Critical</span>`;
    } else if (sLower === 'expired') {
      statusBadge = `<span class="badge" style="background-color: #dc2626; color: #fff; padding: 3px 10px; border-radius: 4px; font-weight: 700; font-size: 12px;">🔴 Expired</span>`;
    } else if (sLower === 'no date set' || sLower.includes('no date')) {
      statusBadge = `<span class="badge" style="background-color: #334155; color: #94a3b8; padding: 3px 10px; border-radius: 4px; font-weight: 600; font-size: 12px;">⚪ No Date Set</span>`;
    }

    let daysText = '—';
    if (daysLeft !== null) {
      if (daysLeft < 0) {
        daysText = `<span style="color: #ef4444; font-weight: 800;">${Math.abs(daysLeft)} days overdue (${daysLeft}d)</span>`;
      } else {
        daysText = `<span style="color: ${daysLeft <= 30 ? '#f97316' : (daysLeft <= 60 ? '#eab308' : '#4ade80')}; font-weight: 700;">${daysLeft} days remaining</span>`;
      }
    } else if (isNonExp) {
      daysText = `<span style="color: var(--text-secondary);">${acqVal ? 'Permanent / Valid' : 'No Date Set'}</span>`;
    }

    container.innerHTML = `
      <div>
        <div style="font-size: 11px; color: var(--text-muted); text-transform: uppercase; font-weight: 700; margin-bottom: 3px;">Calculated Status</div>
        <div>${statusBadge}</div>
      </div>
      <div style="text-align: right;">
        <div style="font-size: 11px; color: var(--text-muted); text-transform: uppercase; font-weight: 700; margin-bottom: 3px;">Time Remaining</div>
        <div style="font-size: 13px;">${daysText}</div>
      </div>
    `;
  }

  /**
   * Saves updated certification dates to local database and triggers background sync mutations
   */
  async saveCertDates() {
    if (!this.activeEditCert) return;

    const { employeeName, certType } = this.activeEditCert;
    const acqInput = document.getElementById('cert-edit-acq-date');
    const expInput = document.getElementById('cert-edit-exp-date');
    const notesInput = document.getElementById('cert-edit-notes');

    const rawAcqVal = acqInput ? acqInput.value : '';
    const rawExpVal = expInput ? expInput.value : '';
    const newNotes = notesInput ? notesInput.value.trim() : '';

    const isNonExp = this.isNonExpiringCert(certType);

    let formattedAcq = 'N/A';
    if (rawAcqVal) {
      const d = this.parseDate(rawAcqVal);
      formattedAcq = d ? this.formatDateDisplay(d) : rawAcqVal;
    }

    let formattedExp = 'N/A';
    if (!isNonExp && rawExpVal) {
      const d = this.parseDate(rawExpVal);
      formattedExp = d ? this.formatDateDisplay(d) : rawExpVal;
    }

    const { daysLeft, status } = this.calculateCertDaysAndStatus(certType, formattedExp, formattedAcq);

    const snap = this.db.getSnapshot();
    const certsTable = snap && snap.tables ? snap.tables['expiring_certs'] : null;

    if (certsTable) {
      const headers = certsTable.headers || [];
      let colAcq = -1;
      let colExp = -1;
      let colDays = -1;
      let colStat = -1;
      let colSms = -1;
      let colNotes = -1;

      headers.forEach((h, idx) => {
        const hl = String(h || '').toLowerCase().trim();
        if (/date.*acq|acq.*date|test.*date|issue.*date|class.*date/.test(hl) && colAcq === -1) colAcq = idx + 1;
        else if (/expir.*date|expir/.test(hl) && colExp === -1) colExp = idx + 1;
        else if (/days/.test(hl) && colDays === -1) colDays = idx + 1;
        else if (/^status$/.test(hl) && colStat === -1) colStat = idx + 1;
        else if (/sms/.test(hl) && colSms === -1) colSms = idx + 1;
        else if (/note/.test(hl) && colNotes === -1) colNotes = idx + 1;
      });

      if (colAcq === -1) colAcq = 3;
      if (colExp === -1) colExp = 4;
      if (colDays === -1) colDays = 7;
      if (colStat === -1) colStat = 8;
      if (colSms === -1) colSms = 9;

      // Find row in certsTable.rows
      let matchedRow = null;
      if (certsTable.rows) {
        matchedRow = certsTable.rows.find(r => {
          const emp = r['Employee Name'] || r['Employee'] || r['Name'] || '';
          const cType = this.getCertType(r, headers);
          return this.isNameMatch(emp, employeeName) && (cType === certType || this.normalizeName(cType) === this.normalizeName(certType));
        });
      }

      if (matchedRow) {
        const rowIdx = matchedRow._rowIdx;
        const oldAcq = matchedRow['Date Acquired'] || matchedRow['Acquired Date'] || '';
        const oldExp = matchedRow['Expiration Date'] || matchedRow['Expiration'] || '';
        const oldStat = matchedRow['Status'] || '';
        const oldNotes = matchedRow['Notes'] || '';

        const acqValueToSave = formattedAcq !== 'N/A' ? formattedAcq : '';
        const expValueToSave = formattedExp !== 'N/A' ? formattedExp : (isNonExp ? 'N/A' : '');

        // Mutations for offline outbox & sync back to Google Sheets
        if (rowIdx) {
          if (acqValueToSave !== oldAcq) {
            await this.db.addMutation({
              action: 'UPDATE_CELL',
              sheetName: 'Expiring Certs',
              row: rowIdx,
              col: colAcq,
              header: headers[colAcq - 1] || 'Date Acquired',
              oldValue: oldAcq,
              value: acqValueToSave
            });
          }
          if (expValueToSave !== oldExp) {
            await this.db.addMutation({
              action: 'UPDATE_CELL',
              sheetName: 'Expiring Certs',
              row: rowIdx,
              col: colExp,
              header: headers[colExp - 1] || 'Expiration Date',
              oldValue: oldExp,
              value: expValueToSave
            });
          }
          if (status !== oldStat) {
            await this.db.addMutation({
              action: 'UPDATE_CELL',
              sheetName: 'Expiring Certs',
              row: rowIdx,
              col: colStat,
              header: headers[colStat - 1] || 'Status',
              oldValue: oldStat,
              value: status
            });
          }
          if (colNotes !== -1 && newNotes !== oldNotes) {
            await this.db.addMutation({
              action: 'UPDATE_CELL',
              sheetName: 'Expiring Certs',
              row: rowIdx,
              col: colNotes,
              header: headers[colNotes - 1] || 'Notes',
              oldValue: oldNotes,
              value: newNotes
            });
          }
        }

        // Optimistically update in-memory row
        matchedRow['Date Acquired'] = acqValueToSave;
        matchedRow['Expiration Date'] = expValueToSave;
        matchedRow['Days Until Expiration'] = daysLeft !== null ? String(daysLeft) : (isNonExp ? 'N/A' : '');
        matchedRow['Status'] = status;
        if (colNotes !== -1) matchedRow['Notes'] = newNotes;
        matchedRow['SMS'] = '';

        // Also update rawGrid if present
        if (certsTable.rawGrid && rowIdx && certsTable.rawGrid[rowIdx - 1]) {
          certsTable.rawGrid[rowIdx - 1][colAcq - 1] = acqValueToSave;
          certsTable.rawGrid[rowIdx - 1][colExp - 1] = expValueToSave;
          if (colDays !== -1) certsTable.rawGrid[rowIdx - 1][colDays - 1] = daysLeft !== null ? String(daysLeft) : (isNonExp ? 'N/A' : '');
          certsTable.rawGrid[rowIdx - 1][colStat - 1] = status;
          if (colNotes !== -1) certsTable.rawGrid[rowIdx - 1][colNotes - 1] = newNotes;
          if (colSms !== -1) certsTable.rawGrid[rowIdx - 1][colSms - 1] = '';
        }
      } else {
        const acqValueToSave = formattedAcq !== 'N/A' ? formattedAcq : '';
        const expValueToSave = formattedExp !== 'N/A' ? formattedExp : (isNonExp ? 'N/A' : '');

        const newCertRow = {
          'Employee Name': employeeName,
          'Name': employeeName,
          'Item Type': certType,
          'Cert Type': certType,
          'Date Acquired': acqValueToSave,
          'Expiration Date': expValueToSave,
          'Days Until Expiration': daysLeft !== null ? String(daysLeft) : (isNonExp ? 'N/A' : ''),
          'Status': status,
          'SMS': '',
          'Notes': newNotes
        };
        if (!certsTable.rows) certsTable.rows = [];
        certsTable.rows.push(newCertRow);
        certsTable.rowCount = certsTable.rows.length;
        newCertRow._rowIdx = certsTable.rowCount + 1;

        if (certsTable.rawGrid) {
          const rowArr = headers.map(h => newCertRow[h] !== undefined ? newCertRow[h] : '');
          certsTable.rawGrid.push(rowArr);
          certsTable.maxRows = certsTable.rawGrid.length;
        }

        await this.db.addMutation({
          action: 'ADD_ROW',
          sheetName: 'Expiring Certs',
          tableKey: 'expiring_certs',
          rowData: newCertRow
        });
      }
    }

    // Update in-memory state in currentEmployeeData
    if (this.currentEmployeeData && this.currentEmployeeData.certifications) {
      const certItem = this.currentEmployeeData.certifications.find(c => c.certType === certType || this.normalizeName(c.certType) === this.normalizeName(certType));
      if (certItem) {
        certItem.testDate = formattedAcq;
        certItem.expDate = formattedExp;
        certItem.daysLeft = daysLeft;
        certItem.status = status;
        certItem.notes = newNotes;
        certItem.smsStatus = '';
      }

      // Update career milestones in currentEmployeeData.employeeHistory
      const milestoneDate = formattedAcq !== 'N/A' ? formattedAcq : (formattedExp !== 'N/A' ? formattedExp : null);
      if (milestoneDate && this.currentEmployeeData.employeeHistory) {
        const existingHist = this.currentEmployeeData.employeeHistory.find(h => h.type === 'cert' && h.event.includes(certType));
        let milestoneDetail = `Valid · ${certType}`;
        if (formattedAcq !== 'N/A' && formattedExp !== 'N/A') {
          milestoneDetail = `Updated / Acquired: ${formattedAcq} · Expires: ${formattedExp}`;
        } else if (formattedExp !== 'N/A') {
          milestoneDetail = `Expires: ${formattedExp}`;
        } else if (formattedAcq !== 'N/A') {
          milestoneDetail = `Date Acquired: ${formattedAcq}`;
        }

        if (existingHist) {
          existingHist.date = milestoneDate;
          existingHist.details = milestoneDetail;
        } else {
          this.currentEmployeeData.employeeHistory.unshift({
            type: 'cert',
            date: milestoneDate,
            event: `📜 Cert Updated: ${certType}`,
            details: milestoneDetail,
            location: this.currentEmployeeData.location,
            job: this.currentEmployeeData.jobNumber
          });
        }
      }
    }

    this.closeEditCertModal();

    // Re-render the profile modal body immediately to show updated dates & badges
    const modalBody = document.getElementById('employee-profile-modal-body');
    if (modalBody) {
      this.renderModalContent(modalBody);
    }

    // Refresh sheetNavigator view if Expiring Certs is open in background
    if (window.sheetNavigator && window.sheetNavigator.currentSheetKey === 'expiring_certs') {
      window.sheetNavigator.renderExpiringCerts();
    }
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

if (typeof window !== 'undefined') {
  window.EmployeeProfileEngine = EmployeeProfileEngine;
  window.employeeProfileEngine = new EmployeeProfileEngine(window.localDB);
}
