/**
 * procurement.js - Unified Procurement & Purchase Needs Engine (Phase 3)
 */

class ProcurementEngine {
  constructor(db) {
    this.db = db;
    this.items = [];
    this.selectedVendor = null;
    this.vendors = [];
    this.previousEmployeesSet = new Set();
    this.currentSectionFilter = 'all'; // 'all' | 'swaps_need' | 'swaps_size_up' | 'assigned_size_up' | 'compliance_missing'
    this.SECTIONS = {
      swaps_need: {
        key: 'swaps_need',
        title: 'Swaps Page — Need to Purchase',
        shortTitle: 'Swaps: Need to Purchase',
        icon: '🛒',
        badgeColor: 'rgba(59, 130, 246, 0.2)',
        badgeBorder: 'rgba(59, 130, 246, 0.4)',
        badgeText: '#93c5fd',
        headerBg: 'rgba(30, 41, 59, 0.95)',
        accentBorder: '#3b82f6',
        desc: 'Unassigned swap items & safety stock replenishment needing procurement'
      },
      swaps_size_up: {
        key: 'swaps_size_up',
        title: 'Swaps Page — Size Up Replacements',
        shortTitle: 'Swaps: Size Up',
        icon: '🔄',
        badgeColor: 'rgba(168, 85, 247, 0.2)',
        badgeBorder: 'rgba(168, 85, 247, 0.4)',
        badgeText: '#d8b4fe',
        headerBg: 'rgba(45, 30, 60, 0.95)',
        accentBorder: '#a855f7',
        desc: 'Temporary size-up replacements picked on swap pages (order proper size)'
      },
      assigned_size_up: {
        key: 'assigned_size_up',
        title: 'Currently Assigned — Size Up in Field',
        shortTitle: 'Assigned: Size Up',
        icon: '⚠️',
        badgeColor: 'rgba(245, 158, 11, 0.2)',
        badgeBorder: 'rgba(245, 158, 11, 0.4)',
        badgeText: '#fcd34d',
        headerBg: 'rgba(55, 35, 20, 0.95)',
        accentBorder: '#f59e0b',
        desc: 'Active personnel currently wearing oversized equipment (order preferred size)'
      },
      compliance_missing: {
        key: 'compliance_missing',
        title: 'PPE Compliance — Missing Equipment',
        shortTitle: 'PPE Compliance: Missing',
        icon: '🛡️',
        badgeColor: 'rgba(239, 68, 68, 0.2)',
        badgeBorder: 'rgba(239, 68, 68, 0.4)',
        badgeText: '#fca5a5',
        headerBg: 'rgba(45, 20, 30, 0.95)',
        accentBorder: '#ef4444',
        desc: 'Active mandated personnel (SUP, GF, F, JRY, AP 1-7) missing rubber gloves or sleeves'
      }
    };
  }

  init() {
    const vendorSelect = document.getElementById('procurement-vendor-select');
    if (vendorSelect) {
      vendorSelect.addEventListener('change', (e) => this.onVendorChange(e.target.value));
    }

    const btnRefresh = document.getElementById('btn-procurement-refresh');
    if (btnRefresh) {
      btnRefresh.addEventListener('click', () => this.refreshPurchaseNeeds());
    }

    const btnGenPO = document.getElementById('btn-procurement-gen-po');
    if (btnGenPO) {
      btnGenPO.addEventListener('click', () => this.generatePOText());
    }

    const btnCopy = document.getElementById('btn-procurement-copy-po');
    if (btnCopy) {
      btnCopy.addEventListener('click', () => {
        const textarea = document.getElementById('procurement-po-textarea');
        if (textarea) {
          navigator.clipboard.writeText(textarea.value).then(() => {
            btnCopy.textContent = '📋 Copied!';
            setTimeout(() => { btnCopy.textContent = '📋 Copy to Clipboard'; }, 2000);
          });
        }
      });
    }
  }

  loadData() {
    this.loadVendors();
    this.scanPurchaseNeeds();
    this.render();
  }

  loadVendors() {
    const vTable = this.db.getTable('vendors');
    const rawRows = vTable ? (vTable.rawGrid || vTable.rows || []) : [];

    const vendorMap = {};
    rawRows.forEach(r => {
      let vName = '';
      let contact = '';
      let email = '';
      let phone = '';
      let notes = '';
      let item = '';
      let itemNumber = '';
      let price = 0;

      if (Array.isArray(r)) {
        if (String(r[0] || '').toLowerCase() === 'vendor name') return; // skip header
        vName = String(r[0] || '').trim();
        contact = String(r[1] || '').trim();
        email = String(r[2] || '').trim();
        phone = String(r[3] || '').trim();
        notes = String(r[4] || '').trim();
        item = String(r[5] || '').trim();
        itemNumber = String(r[6] || '').trim();
        price = parseFloat(String(r[7] || '0').replace(/[$,]/g, '')) || 0;
      } else if (typeof r === 'object' && r !== null) {
        vName = String(r['Vendor Name'] || r['Vendor'] || r['name'] || '').trim();
        contact = String(r['Contact Name'] || r['Contact'] || '').trim();
        email = String(r['Email'] || '').trim();
        phone = String(r['Phone'] || '').trim();
        notes = String(r['Notes'] || '').trim();
        item = String(r['Item'] || '').trim();
        itemNumber = String(r['Item Number'] || r['Part Number'] || '').trim();
        price = parseFloat(String(r['Price'] || '0').replace(/[$,]/g, '')) || 0;
      }

      if (!vName) return;

      if (!vendorMap[vName]) {
        vendorMap[vName] = {
          name: vName,
          contact: contact,
          email: email,
          phone: phone,
          notes: notes,
          items: []
        };
      }

      if (item) {
        vendorMap[vName].items.push({
          item: item,
          itemNumber: itemNumber,
          price: price
        });
      }
    });

    this.vendors = Object.values(vendorMap);
  }

  cleanEmployeeName(name) {
    if (!name) return '';
    let str = String(name).trim();
    str = str.replace(/^active\s*\|\s*/i, '').trim();
    str = str.replace(/\s+(?:st|step)\s*\d+\s*(?:new\s*hire)?.*$/i, '').trim();
    str = str.replace(/\s+new\s*hire.*$/i, '').trim();
    return str;
  }

  normalizeName(name) {
    if (!name) return '';
    const cleaned = this.cleanEmployeeName(name);
    return cleaned.toLowerCase()
      .replace(/\(.*?\)/g, '')
      .replace(/[^a-z0-9]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  isNameMatch(nameA, nameB) {
    if (!nameA || !nameB) return false;
    if (window.employeeProfileEngine && typeof window.employeeProfileEngine.isNameMatch === 'function') {
      return window.employeeProfileEngine.isNameMatch(nameA, nameB);
    }
    const nA = this.normalizeName(nameA);
    const nB = this.normalizeName(nameB);
    if (!nA || !nB) return false;
    if (nA === nB) return true;
    if (nA.includes(nB) || nB.includes(nA)) return true;
    return false;
  }

  /**
   * Pre-loads the set of former / departed personnel across employee tables, history, and archive
   */
  loadPreviousEmployees() {
    this.previousEmployeesSet = new Set();
    const snap = (this.db && typeof this.db.getSnapshot === 'function')
      ? this.db.getSnapshot()
      : (window.localDB ? window.localDB.getSnapshot() : null);
    if (!snap || !snap.tables) return this.previousEmployeesSet;

    // 1. Check window.previousEmployeesEngine if available
    if (window.previousEmployeesEngine && typeof window.previousEmployeesEngine.getPreviousEmployees === 'function') {
      try {
        const prevList = window.previousEmployeesEngine.getPreviousEmployees();
        prevList.forEach(p => {
          if (!p.isActive && p.name) {
            this.previousEmployeesSet.add(this.normalizeName(p.name));
          }
        });
      } catch (err) {
        console.warn('Error reading from previousEmployeesEngine:', err);
      }
    }

    // 2. Check dedicated previous_employees / past_employees table
    const prevTable = (this.db && typeof this.db.getTable === 'function' ? (this.db.getTable('previous_employees') || this.db.getTable('Previous Employees')) : null)
      || snap.tables['previous_employees'] || snap.tables['previous_employee'] || snap.tables['past_employees'] || snap.tables['Previous Employees'];
    if (prevTable) {
      const rows = prevTable.rows || prevTable.rawGrid || [];
      rows.forEach(r => {
        let name = '';
        if (Array.isArray(r)) {
          if (String(r[0] || '').toLowerCase().includes('employee')) return;
          name = String(r[0] || '').trim();
        } else if (r && typeof r === 'object') {
          name = String(r['Employee Name'] || r['Name'] || r['Worker'] || r['Employee'] || '').trim();
        }
        if (name) this.previousEmployeesSet.add(this.normalizeName(name));
      });
    }

    // 3. Check employees table for departed/inactive markers
    const empTable = snap.tables['employees'] || (this.db && typeof this.db.getTable === 'function' ? this.db.getTable('employees') : null);
    if (empTable) {
      const rows = empTable.rows || empTable.rawGrid || [];
      rows.forEach(r => {
        let name = '';
        let loc = '';
        let status = '';
        let lastDay = '';

        if (Array.isArray(r)) {
          name = String(r[0] || '').trim();
          loc = String(r[1] || '').trim();
          status = String(r[2] || '').trim();
        } else if (r && typeof r === 'object') {
          name = String(r['Employee Name'] || r['Name'] || r['Worker'] || '').trim();
          loc = String(r['Location'] || r['City'] || '').trim();
          status = String(r['Status'] || r['Employee Status'] || '').trim();
          lastDay = String(r['Last Day'] || r['Term Date'] || r['Termination Date'] || '').trim();
        }

        if (!name) return;
        const locLower = loc.toLowerCase();
        const statLower = status.toLowerCase();

        const isDeparted = locLower === 'previous employee' || locLower.includes('previous') ||
                           statLower === 'previous employee' || statLower.includes('inactive') ||
                           statLower.includes('terminated') || statLower.includes('departed') ||
                           statLower.includes('former') || statLower.includes('quit') ||
                           statLower.includes('resigned') || statLower.includes('reclaim');

        let isPastLastDay = false;
        if (lastDay) {
          const ld = new Date(lastDay);
          if (!isNaN(ld.getTime()) && ld < new Date()) {
            isPastLastDay = true;
          }
        }

        if (isDeparted || isPastLastDay) {
          this.previousEmployeesSet.add(this.normalizeName(name));
        }
      });
    }

    // 4. Check employee_history table for departure events
    const histTable = snap.tables['employee_history'] || (this.db && typeof this.db.getTable === 'function' ? this.db.getTable('employee_history') : null);
    if (histTable && histTable.rows) {
      histTable.rows.forEach(r => {
        const name = String(r['Employee Name'] || r['Name'] || r['Worker'] || '').trim();
        const eventType = String(r['Event Type'] || r['Event'] || r['Action'] || '').toLowerCase();
        if (name && (eventType.includes('term') || eventType.includes('quit') || eventType.includes('depart') || eventType.includes('last day') || eventType.includes('previous'))) {
          this.previousEmployeesSet.add(this.normalizeName(name));
        }
      });
    }

    // 5. Scan active inventory tables for items assigned to Previous Employees
    const invKeys = ['gloves', 'sleeves', 'blankets', 'macks'];
    invKeys.forEach(iKey => {
      const iTable = snap.tables[iKey] || (this.db && typeof this.db.getTable === 'function' ? this.db.getTable(iKey) : null);
      if (iTable && iTable.rows) {
        iTable.rows.forEach(r => {
          const asg = String(r['Assigned To'] || r['Assigned'] || '').trim();
          if (!asg) return;
          const loc = String(r['Location'] || '').toLowerCase();
          const st = String(r['Status'] || '').toLowerCase();
          if (loc.includes('previous') || st.includes('previous') || st.includes('reclaim')) {
            this.previousEmployeesSet.add(this.normalizeName(asg));
          }
        });
      }
    });

    // 6. Scan swap sheets for explicit PREV EMP reclaim rows
    const swapKeys = ['glove_swaps', 'sleeve_swaps', 'blanket_swaps', 'mack_swaps'];
    swapKeys.forEach(sKey => {
      const sTable = snap.tables[sKey] || (this.db && typeof this.db.getTable === 'function' ? this.db.getTable(sKey) : null);
      if (sTable) {
        const rows = sTable.rows || [];
        rows.forEach(r => {
          const emp = String(r['Employee'] || r['Employee Name'] || r['Assigned To'] || '').trim();
          if (!emp) return;
          const dl = String(r['Days Left'] || r['Days Remaining'] || '').toUpperCase();
          const st = String(r['Status'] || '').toLowerCase();
          if (dl.includes('PREV') || st.includes('return to shelf') || st.includes('reclaim')) {
            this.previousEmployeesSet.add(this.normalizeName(emp));
          }
        });

        const rawGrid = sTable.rawGrid || [];
        rawGrid.forEach(gRow => {
          if (!Array.isArray(gRow) || !gRow.length) return;
          const first = String(gRow[0] || '').trim();
          if (!first || first.includes('📍') || first.includes('👤') || first.includes('Foreman:') || first === 'Employee') return;
          const daysCell = String(gRow[5] || '').toUpperCase();
          const statCell = String(gRow[7] || '').toLowerCase();
          if (daysCell.includes('PREV') || statCell.includes('return to shelf') || statCell.includes('reclaim')) {
            this.previousEmployeesSet.add(this.normalizeName(first));
          }
        });
      }
    });

    return this.previousEmployeesSet;
  }

  /**
   * Returns true if an employee is a former / departed employee
   */
  isDepartedOrPreviousEmployee(empName) {
    if (!empName) return false;
    const clean = String(empName).trim();
    const cleanLower = clean.toLowerCase();

    // On Shelf items are safety stock, not employees
    if (cleanLower === 'on shelf' || cleanLower === 'shelf' || cleanLower.startsWith('on shelf')) {
      return false;
    }

    // Explicit previous employee or reclaim tags in name
    if (cleanLower.includes('previous employee') || cleanLower.includes('(previous)') || cleanLower.includes('reclaim') || cleanLower.includes('departed')) {
      return true;
    }

    const norm = this.normalizeName(clean);
    if (!norm) return false;

    // Direct check in pre-built set
    if (this.previousEmployeesSet && this.previousEmployeesSet.has(norm)) {
      return true;
    }

    // Fuzzy check against previous employees set
    if (this.previousEmployeesSet) {
      for (const prevNorm of this.previousEmployeesSet) {
        if (this.isNameMatch(norm, prevNorm)) {
          return true;
        }
      }
    }

    // Fallback 1: check employees table directly
    const snap = (this.db && typeof this.db.getSnapshot === 'function')
      ? this.db.getSnapshot()
      : (window.localDB ? window.localDB.getSnapshot() : null);
    const empTable = snap?.tables?.employees || (this.db && typeof this.db.getTable === 'function' ? this.db.getTable('employees') : null);
    if (empTable && empTable.rows) {
      const empRow = empTable.rows.find(r => this.isNameMatch(r['Employee Name'] || r['Name'] || r[0] || '', clean));
      if (empRow) {
        const loc = String(empRow['Location'] || empRow['City'] || empRow[1] || '').toLowerCase();
        const stat = String(empRow['Status'] || empRow['Employee Status'] || empRow[2] || '').toLowerCase();
        const lastDay = String(empRow['Last Day'] || empRow['Term Date'] || '').trim();

        if (loc === 'previous employee' || loc.includes('previous') ||
            stat === 'previous employee' || stat.includes('inactive') ||
            stat.includes('terminated') || stat.includes('departed') ||
            stat.includes('former') || stat.includes('quit') || stat.includes('resigned') ||
            stat.includes('reclaim')) {
          this.previousEmployeesSet?.add(norm);
          return true;
        }
        if (lastDay) {
          const ld = new Date(lastDay);
          if (!isNaN(ld.getTime()) && ld < new Date()) {
            this.previousEmployeesSet?.add(norm);
            return true;
          }
        }
      }
    }

    // Fallback 2: Check if employee is in PPE inventory with Location: 'Previous Employee'
    const invKeys = ['gloves', 'sleeves', 'blankets', 'macks'];
    for (const iKey of invKeys) {
      const iTable = snap?.tables?.[iKey] || (this.db && typeof this.db.getTable === 'function' ? this.db.getTable(iKey) : null);
      if (iTable && iTable.rows) {
        const found = iTable.rows.some(r => {
          const asg = String(r['Assigned To'] || r['Assigned'] || '').trim();
          if (!this.isNameMatch(asg, clean)) return false;
          const loc = String(r['Location'] || '').toLowerCase();
          const st = String(r['Status'] || '').toLowerCase();
          return loc.includes('previous') || st.includes('previous') || st.includes('reclaim');
        });
        if (found) {
          this.previousEmployeesSet?.add(norm);
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Cleans up lingering 'Need to Purchase' flags on swap sheets for confirmed former staff.
   */
  async cleanupDepartedEmployeeSwapNeeds() {
    const snap = (this.db && typeof this.db.getSnapshot === 'function')
      ? this.db.getSnapshot()
      : (window.localDB ? window.localDB.getSnapshot() : null);
    if (!snap || !snap.tables) return;

    let modified = false;
    const swapKeys = ['glove_swaps', 'sleeve_swaps', 'blanket_swaps', 'mack_swaps'];
    const fn = (this.db && typeof this.db.addMutation === 'function')
      ? this.db.addMutation.bind(this.db)
      : ((this.db && typeof this.db.queueMutation === 'function') ? this.db.queueMutation.bind(this.db) : null);

    for (const sKey of swapKeys) {
      const table = snap.tables[sKey];
      if (!table) continue;
      const headers = table.headers || (Array.isArray(table.rawGrid?.[1]) ? table.rawGrid[1] : []);

      // 1. Clean table.rows
      if (table.rows && Array.isArray(table.rows)) {
        for (let rIdx = 0; rIdx < table.rows.length; rIdx++) {
          const row = table.rows[rIdx];
          const emp = String(row['Employee'] || row['Employee Name'] || row['Assigned To'] || '').trim();
          if (!emp) continue;

          if (this.isDepartedOrPreviousEmployee(emp)) {
            const status = String(row['Status'] || '').trim().toLowerCase();
            const pickItem = String(row['Pick List Item #'] || '').trim();

            // If this row has a purchase need status, clear it or convert to Reclaim / Departed
            if (status.includes('purchase') || pickItem === '—') {
              const hasExistingItem = row['Current Item'] && row['Current Item'] !== '—' && row['Current Item'] !== 'N/A';
              const newStatus = hasExistingItem ? 'Reclaim (Departed)' : 'Departed — Inactive';
              row['Status'] = newStatus;
              row['Pick List Item #'] = '';
              row['Urgency'] = 'None';
              modified = true;

              if (fn) {
                const actualRowIdx = row._rowIdx || (rIdx + 2);
                const getColNum = (hName) => {
                  const idx = headers.findIndex(h => h.toLowerCase() === hName.toLowerCase());
                  return idx !== -1 ? idx + 1 : headers.length;
                };
                const sName = table.name || sKey;
                try {
                  await fn({ action: 'UPDATE_CELL', sheetName: sName, tableKey: sKey, row: actualRowIdx, col: getColNum('Status'), header: 'Status', value: newStatus });
                  await fn({ action: 'UPDATE_CELL', sheetName: sName, tableKey: sKey, row: actualRowIdx, col: getColNum('Pick List Item #'), header: 'Pick List Item #', value: '' });
                  if (headers.includes('Urgency')) {
                    await fn({ action: 'UPDATE_CELL', sheetName: sName, tableKey: sKey, row: actualRowIdx, col: getColNum('Urgency'), header: 'Urgency', value: 'None' });
                  }
                } catch (e) {
                  console.warn('Could not queue cleanup mutation for', emp, e);
                }
              }
            }
          }
        }
      }

      // 2. Clean table.rawGrid if present
      if (table.rawGrid && Array.isArray(table.rawGrid)) {
        const pickIdx = headers.findIndex(h => /pick\s*list/i.test(h));
        const statIdx = headers.findIndex(h => /^status$/i.test(h));
        const effPickIdx = pickIdx !== -1 ? pickIdx : 6;
        const effStatIdx = statIdx !== -1 ? statIdx : 7;

        for (let gIdx = 0; gIdx < table.rawGrid.length; gIdx++) {
          const gRow = table.rawGrid[gIdx];
          if (!Array.isArray(gRow) || !gRow.length) continue;
          const emp = String(gRow[0] || '').trim();
          if (!emp || emp.includes('📍') || emp.includes('👤') || emp.includes('Foreman:') || emp === 'Employee') continue;

          if (this.isDepartedOrPreviousEmployee(emp)) {
            const st = String(gRow[effStatIdx] || '').toLowerCase();
            const pi = String(gRow[effPickIdx] || '').trim();
            if (st.includes('purchase') || pi === '—') {
              gRow[effStatIdx] = 'Reclaim (Departed)';
              gRow[effPickIdx] = '';
              modified = true;
            }
          }
        }
      }
    }

    if (modified && this.db && typeof this.db.persistSnapshot === 'function') {
      await this.db.persistSnapshot(snap);
    }
  }

  /**
   * Refreshes the purchase needs from inventory & swap sheets, cleans up departed employee flags,
   * updates pricing, and re-renders the workspace.
   */
  async refreshPurchaseNeeds() {
    const btn = document.getElementById('btn-procurement-refresh');
    if (btn) {
      btn.innerHTML = '<span>⏳</span> Refreshing...';
      btn.disabled = true;
    }

    try {
      this.loadVendors();
      this.loadPreviousEmployees();
      await this.cleanupDepartedEmployeeSwapNeeds();
      this.scanPurchaseNeeds();
      this.updatePricing();
      this.render();

      if (typeof window.showToast === 'function') {
        window.showToast('🔄 Purchase Needs refreshed! Former employees excluded.', 'success');
      }
    } catch (err) {
      console.error('Error refreshing purchase needs:', err);
      if (typeof window.showToast === 'function') {
        window.showToast('⚠️ Error refreshing Purchase Needs: ' + err.message, 'error');
      }
    } finally {
      if (btn) {
        btn.innerHTML = '<span>🔄</span> Refresh';
        btn.disabled = false;
      }
    }
  }

  /**
   * Sets the active section filter tab ('all' or specific section key)
   */
  setSectionFilter(filterKey) {
    this.currentSectionFilter = filterKey || 'all';
    this.render();
  }

  /**
   * Toggles selection for all items in a specific section
   */
  toggleSectionSelected(sectionKey, isChecked) {
    this.items.forEach(item => {
      if (item.section === sectionKey) {
        item.selected = isChecked;
        if (item.employees && item.employees.length > 0) {
          item.employees.forEach(emp => {
            emp.checked = isChecked;
          });
          item.quantity = isChecked ? item.employees.length : 0;
        }
      }
    });
    this.render();
  }

  /**
   * Evaluates if classification is one of SUP, GF, F, JRY, or AP 1-7.
   * Matches standard Rubber PPE Compliance rules.
   */
  parseTrackedClassification(rawCls) {
    if (!rawCls) return null;
    const s = String(rawCls).trim();
    const up = s.toUpperCase();

    // 1. Apprentices & Sub Techs (AP 1-7, ST 1-7, etc.)
    const apMatch = up.match(/^(?:AP|ST|APP|APPRENTICE|SUB TECH)[\s\-_.]*([1-7])(?:\b|\s|$)/i) ||
                    up.match(/^([1-7])[\s\-_.]*(?:AP|ST|APP|APPRENTICE)\b/i) ||
                    up.match(/^(?:AP|ST)\s*([1-7])$/i);

    if (apMatch) {
      const level = parseInt(apMatch[1], 10);
      return {
        code: `AP ${level}`,
        level: level,
        tier: level <= 3 ? 'ap1_3' : 'ap4_7',
        needsGloves: true,
        needsSleeves: level >= 4
      };
    }

    // 2. Supervisor / Superintendent (SUP)
    if (/^(SUP|SUPERVISOR|SUPERINTENDENT|SUPV|SUP\.)(\s|$)/i.test(up)) {
      return { code: 'SUP', level: 0, tier: 'sup', needsGloves: true, needsSleeves: true };
    }

    // 3. General Foreman (GF)
    if (/^(GF|GENERAL\s*FOREMAN|GEN\s*FOREMAN|GEN\.\s*FOREMAN|GF\.)(\s|$)/i.test(up)) {
      return { code: 'GF', level: 0, tier: 'gf', needsGloves: true, needsSleeves: true };
    }

    // 4. Foreman (F, GTO F, Foreman, Crew Lead)
    if (/^(F|FOREMAN|GTO\s*F|GTO\s*FOREMAN|F\.)(\s|$)/i.test(up)) {
      return { code: up.includes('GTO') ? 'GTO F' : 'F', level: 0, tier: 'f', needsGloves: true, needsSleeves: true };
    }

    // 5. Journeyman Lineman (JRY, JL, Journeyman - but NOT JRY OP)
    if (/^(JRY|JL|JOURNEYMAN|JOURNEYMAN\s*LINEMAN)$/i.test(up) ||
        (/^(JRY|JL|JOURNEYMAN|JOURNEYMAN\s*LINEMAN)\b/i.test(up) && !/\b(OP|OPERATOR)\b/i.test(up))) {
      return { code: 'JRY', level: 0, tier: 'jry', needsGloves: true, needsSleeves: true };
    }

    return null;
  }

  /**
   * Checks whether an employee is excluded from PPE compliance tracking
   */
  isEmployeePpeExcluded(empName) {
    if (!empName) return false;
    if (window.ppeTrackingEngine && typeof window.ppeTrackingEngine.isEmployeeExcluded === 'function') {
      return window.ppeTrackingEngine.isEmployeeExcluded(empName);
    }
    try {
      const raw = localStorage.getItem('sa_ppe_excluded_employees');
      if (raw) {
        const arr = JSON.parse(raw);
        if (Array.isArray(arr)) {
          const norm = this.normalizeName(empName);
          return arr.some(x => this.isNameMatch(this.normalizeName(x), norm));
        }
      }
    } catch { /* ignore */ }
    return false;
  }

  scanPurchaseNeeds() {
    this.loadPreviousEmployees();

    const snap = (this.db && typeof this.db.getSnapshot === 'function')
      ? this.db.getSnapshot()
      : (window.localDB ? window.localDB.getSnapshot() : null);

    const NON_ASSIGNED_STATUSES = new Set([
      'on shelf', 'shelf', 'lost', 'destroyed', 'failed rubber', 'failed',
      'retired', 'in testing', 'packed for testing', 'not repairable', 'reclaimed'
    ]);

    const cleanSize = (val) => {
      if (val === null || val === undefined) return '';
      const s = String(val).trim();
      const lower = s.toLowerCase();
      if (!s || s === '—' || s === '-' || lower === 'n/a' || lower === 'none' || lower === 'unknown' || lower === 'null') {
        return '';
      }
      return s;
    };

    // Tracks employees who already have purchase demands queued to avoid duplicate demands
    const coveredMap = {
      Gloves: new Set(),
      Sleeves: new Set(),
      Blankets: new Set(),
      MACKs: new Set()
    };

    const markCovered = (type, empName) => {
      if (!empName) return;
      const clean = this.cleanEmployeeName(empName);
      if (clean && coveredMap[type]) {
        coveredMap[type].add(this.normalizeName(clean));
      }
    };

    const isCovered = (type, empName) => {
      if (!empName) return false;
      const norm = this.normalizeName(empName);
      if (!norm || !coveredMap[type]) return false;
      if (coveredMap[type].has(norm)) return true;
      for (const k of coveredMap[type]) {
        if (this.isNameMatch(k, norm)) return true;
      }
      return false;
    };

    // Build active employees directory
    const empTable = snap?.tables?.employees || (this.db && typeof this.db.getTable === 'function' ? this.db.getTable('employees') : null);
    const empRows = empTable ? (empTable.rows || empTable.rawGrid || []) : [];
    const empDirectory = new Map();

    empRows.forEach(r => {
      let name = '';
      let gloveSize = '';
      let sleeveSize = '';
      let classification = '';
      let loc = '';
      let jobNumber = '';
      let lastDay = '';

      if (Array.isArray(r)) {
        name = String(r[0] || '').trim();
        loc = String(r[1] || '').trim();
        jobNumber = String(r[2] || '').trim();
        classification = String(r[3] || '').trim();
        gloveSize = String(r[4] || '').trim();
        sleeveSize = String(r[5] || '').trim();
        lastDay = String(r[13] || '').trim();
      } else if (r && typeof r === 'object') {
        name = String(r['Employee Name'] || r['Name'] || r['Worker'] || '').trim();
        loc = String(r['Location'] || r['City'] || '').trim();
        jobNumber = String(r['Job Number'] || r['Job #'] || r['Crew'] || '').trim();
        classification = String(r['Job Classification'] || r['Classification'] || r['Class'] || '').trim();
        gloveSize = String(r['Glove Size'] || r['Glove'] || '').trim();
        sleeveSize = String(r['Sleeve Size'] || r['Sleeve'] || '').trim();
        lastDay = String(r['Last Day'] || r['Term Date'] || '').trim();
      }

      if (!name) return;
      const normName = this.normalizeName(name);
      empDirectory.set(normName, {
        raw: r,
        name: name,
        location: loc,
        jobNumber: jobNumber,
        classification: classification,
        gloveSize: gloveSize,
        sleeveSize: sleeveSize,
        lastDay: lastDay
      });
    });

    const getEmpRecord = (empName) => {
      if (!empName) return null;
      const norm = this.normalizeName(empName);
      if (empDirectory.has(norm)) return empDirectory.get(norm);
      for (const [k, v] of empDirectory.entries()) {
        if (this.isNameMatch(k, norm)) return v;
      }
      return null;
    };

    const aggregated = {};

    // Tables & helper lookups for inventory presence and location voltage approval
    const glovesTable = (this.db && typeof this.db.getTable === 'function' ? this.db.getTable('gloves') : null) || snap?.tables?.['gloves'];
    const sleevesTable = (this.db && typeof this.db.getTable === 'function' ? this.db.getTable('sleeves') : null) || snap?.tables?.['sleeves'];

    const hasInventoryItem = (table, empName) => {
      if (!table || !empName) return false;
      const rows = table.rows || table.rawGrid || [];
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        let asg = '';
        let st = '';
        if (Array.isArray(r)) {
          asg = String(r[8] || '').trim();
          st = String(r[7] || '').trim().toLowerCase();
        } else if (r && typeof r === 'object') {
          asg = String(r['Assigned To'] || r['Assigned'] || '').trim();
          st = String(r['Status'] || '').trim().toLowerCase();
        }
        if (!asg || NON_ASSIGNED_STATUSES.has(st) || asg.toLowerCase().includes('shelf')) continue;
        if (this.isNameMatch(asg, empName)) return true;
      }
      return false;
    };

    const locTable = (this.db && typeof this.db.getTable === 'function' ? this.db.getTable('locations') : null) || snap?.tables?.['locations'];
    const locApprovals = {};
    if (locTable && locTable.rows) {
      locTable.rows.forEach(r => {
        const loc = String(r['Location'] || Object.values(r)[0] || '').trim().toLowerCase();
        const app = String(r['Rubber Class Approval'] || r['Approval'] || Object.values(r)[6] || '').trim();
        if (loc && app) locApprovals[loc] = app;
      });
    }

    const getLocationApprovalClass = (empRec) => {
      if (!empRec || !empRec.location) return 'Class 2';
      const cleanEmpLoc = String(empRec.location).replace(/\s*\([^)]*\)/g, '').trim().toLowerCase();
      const app = locApprovals[cleanEmpLoc] ? locApprovals[cleanEmpLoc].toUpperCase() : '';
      if (app === 'CL3') return 'Class 3';
      if (app === 'CL2') return 'Class 2';
      return 'Class 2';
    };

    const addItem = (section, itemType, typeLabel, size, hasNoSize, classVal, empLabel, minDaysLeft, isImmediate) => {
      const aggKey = `${section}|${itemType}|${size}|${classVal}`;
      if (!aggregated[aggKey]) {
        aggregated[aggKey] = {
          section: section,
          sectionTitle: this.SECTIONS[section] ? this.SECTIONS[section].title : section,
          itemType: itemType,
          typeLabel: typeLabel,
          size: size,
          hasNoSize: !!hasNoSize,
          classVal: classVal,
          quantity: 0,
          employees: [],
          sizeUpCount: 0,
          minDaysLeft: minDaysLeft !== undefined ? minDaysLeft : 30,
          isImmediate: !!isImmediate,
          selected: true,
          price: 0,
          partNumber: ''
        };
      }

      if (empLabel) {
        let empName = empLabel;
        let empDetail = '';
        const match = empLabel.match(/^([^(]+?)\s*\((.+)\)$/);
        if (match) {
          empName = match[1].trim();
          empDetail = match[2].trim();
        } else {
          empName = empLabel.trim();
        }

        const existing = aggregated[aggKey].employees.find(e => this.isNameMatch(e.name, empName));
        if (!existing) {
          aggregated[aggKey].employees.push({
            name: empName,
            label: empLabel,
            detail: empDetail,
            checked: true
          });
          aggregated[aggKey].quantity += 1;
        }
      } else {
        aggregated[aggKey].quantity += 1;
      }

      if (isImmediate) aggregated[aggKey].isImmediate = true;
      if (minDaysLeft !== undefined && minDaysLeft < aggregated[aggKey].minDaysLeft) {
        aggregated[aggKey].minDaysLeft = minDaysLeft;
      }
    };

    // =========================================================================
    // SECTION 1 & 2: SWAPS PAGES (Need to Purchase & Size Up Replacements)
    // =========================================================================
    const swapSheets = [
      { key: 'glove_swaps', type: 'Gloves', label: '🧤 Gloves' },
      { key: 'sleeve_swaps', type: 'Sleeves', label: '🦺 Sleeves' },
      { key: 'blanket_swaps', type: 'Blankets', label: '🧱 Blankets' },
      { key: 'mack_swaps', type: 'MACKs', label: '🧱 MACKs' },
      { key: 'hv_tester_swaps', type: 'HV Testers', label: '⚡ HV Testers' },
      { key: 'phasing_set_swaps', type: 'Phasing Sets', label: '⚡ Phasing Sets' },
      { key: 'ground_swaps', type: 'Grounds', label: '⚡ Grounds' },
      { key: 'hot_stick_swaps', type: 'Hot Sticks', label: '🔴 Hot Sticks' },
      { key: 'aed_swaps', type: 'AED', label: '🏥 AED Units' }
    ];

    swapSheets.forEach(s => {
      const table = (this.db && typeof this.db.getTable === 'function' ? this.db.getTable(s.key) : null) || snap?.tables?.[s.key];
      if (!table) return;

      const rawRows = table.rawGrid || table.rows || [];
      if (!rawRows.length) return;

      let defaultClass = 'Class 2';
      if (s.type === 'Gloves') defaultClass = 'Class 2';
      else if (s.type === 'Sleeves') defaultClass = 'Class 2';
      else if (s.type === 'Blankets') defaultClass = 'Class 4';
      else if (s.type === 'MACKs') defaultClass = 'Class 4';
      let currentClass = defaultClass;

      rawRows.forEach((row) => {
        let emp = '';
        let size = '—';
        let pickItem = '';
        let status = '';
        let daysLeft = 30;
        let daysRaw = '';
        let rowClass = currentClass;
        let isImmediateRow = false;

        if (Array.isArray(row)) {
          const firstCell = String(row[0] || '').trim();
          if (firstCell.toUpperCase().includes('CLASS 0')) currentClass = 'Class 0';
          else if (firstCell.toUpperCase().includes('CLASS 2')) currentClass = 'Class 2';
          else if (firstCell.toUpperCase().includes('CLASS 3')) currentClass = 'Class 3';
          else if (firstCell.toUpperCase().includes('CLASS 4')) currentClass = 'Class 4';

          // Skip section headers or subheaders
          if (firstCell.includes('📍') || firstCell.includes('👤') || firstCell.includes('👷') ||
              firstCell.includes('Foreman:') || firstCell.includes('Swaps') || firstCell === 'Employee' || firstCell === 'Item #') {
            return;
          }

          emp = firstCell;
          size = String(row[2] || '—').trim();
          daysRaw = String(row[5] || '').trim();
          const daysVal = parseInt(daysRaw, 10);
          if (!isNaN(daysVal)) daysLeft = daysVal;
          pickItem = String(row[6] || '').trim();
          status = String(row[7] || '').trim();

          if (row[10] && String(row[10]).toLowerCase().includes('class')) {
            rowClass = String(row[10]).trim();
          } else {
            rowClass = currentClass;
          }
          if (String(row[11] || '').toLowerCase() === 'immediate' || daysVal <= 0) {
            isImmediateRow = true;
          }
        } else if (typeof row === 'object' && row !== null) {
          emp = String(row['Employee'] || row['Employee Name'] || row['Assigned To'] || '').trim();
          size = String(row['Size'] || '—').trim();
          daysRaw = String(row['Days Left'] || row['Days Remaining'] || '').trim();
          const daysVal = parseInt(daysRaw, 10);
          if (!isNaN(daysVal)) daysLeft = daysVal;
          pickItem = String(row['Pick List Item #'] || row['Pick Item #'] || '').trim();
          status = String(row['Status'] || row['Pick List Status'] || '').trim();
          if (row['Class'] || row['KV']) {
            const cStr = String(row['Class'] || row['KV']).trim();
            rowClass = cStr.toLowerCase().startsWith('class') ? cStr : `Class ${cStr}`;
          } else {
            rowClass = currentClass;
          }
          if (String(row['Urgency'] || '').toLowerCase() === 'immediate' || daysLeft <= 0) {
            isImmediateRow = true;
          }
        }

        const statLower = status.toLowerCase();
        const isSizeUp = statLower.includes('size up');
        const isShelfStock = emp.toLowerCase().includes('on shelf') || emp.toLowerCase() === 'shelf';

        // Filter out return/reclaim/former employee indicators
        const isPrevEmpIndicator = daysRaw.toUpperCase().includes('PREV') ||
                                   statLower.includes('return to shelf') ||
                                   statLower.includes('reclaim') ||
                                   statLower.includes('previous') ||
                                   statLower.includes('departed') ||
                                   statLower.includes('inactive') ||
                                   (statLower.includes('return') && !isShelfStock) ||
                                   (statLower.includes('shelf') && !isShelfStock);

        if (isPrevEmpIndicator) return;

        const isNeedToPurchase = statLower.includes('need to purchase') ||
                                 statLower.includes('purchase') ||
                                 isSizeUp ||
                                 (pickItem === '—' && !statLower.includes('return') && !statLower.includes('reclaim')) ||
                                 (pickItem === '' && statLower.includes('unassigned'));

        if (!isNeedToPurchase || !emp) return;

        // Filter out former / previous employees
        if (this.isDepartedOrPreviousEmployee(emp)) return;
        if (statLower.includes('reclaim') || statLower.includes('previous') || statLower.includes('departed')) return;

        const empRec = getEmpRecord(emp);

        if (isSizeUp) {
          // Requirement 2: Swaps Page Size Up Replacements
          const prefSize = s.type === 'Gloves' ? cleanSize(empRec?.gloveSize) : (s.type === 'Sleeves' ? cleanSize(empRec?.sleeveSize) : '');
          const validRowSize = cleanSize(size);
          const neededSize = prefSize || validRowSize || '⚠️ Needs Size';
          const hasNoSize = (neededSize === '⚠️ Needs Size');
          const empLabel = hasNoSize
            ? `${emp} (Size Up Picked ⚠️ Needs Size)`
            : `${emp} (Size Up Picked: ${size || '—'} → Needed: ${neededSize})`;

          addItem('swaps_size_up', s.type, s.label, neededSize, hasNoSize, rowClass, empLabel, daysLeft, isImmediateRow);
          markCovered(s.type, emp);
        } else {
          // Requirement 1: Swaps Page Need To Purchase
          const validRowSize = cleanSize(size);
          let neededSize = validRowSize;
          let hasNoSize = false;

          if (!neededSize && !isShelfStock) {
            const prefSize = s.type === 'Gloves' ? cleanSize(empRec?.gloveSize) : (s.type === 'Sleeves' ? cleanSize(empRec?.sleeveSize) : '');
            neededSize = prefSize || '⚠️ Needs Size';
            hasNoSize = (neededSize === '⚠️ Needs Size');
          }
          if (!neededSize && isShelfStock) {
            neededSize = 'Standard';
          }

          const empLabel = hasNoSize ? `${emp} (⚠️ No preferred size listed in Employees)` : emp;
          addItem('swaps_need', s.type, s.label, neededSize, hasNoSize, rowClass, empLabel, daysLeft, isImmediateRow);
          markCovered(s.type, emp);
        }
      });
    });

    // Scan safety_equipment_needs table
    const needsTable = (this.db && typeof this.db.getTable === 'function' ? this.db.getTable('safety_equipment_needs') : null) || snap?.tables?.['safety_equipment_needs'];
    if (needsTable) {
      const nRows = needsTable.rows || needsTable.rawGrid || [];
      nRows.forEach(row => {
        let emp = '';
        let itemType = 'Gloves';
        let typeLabel = '🧤 Gloves';
        let size = '—';
        let rowClass = 'Class 2';
        let urgency = 'Immediate';
        let status = '';

        if (row && typeof row === 'object') {
          emp = String(row['Employee'] || '').trim();
          const rawType = String(row['Item Type'] || '').trim();
          if (rawType.toLowerCase().includes('sleeve')) {
            itemType = 'Sleeves';
            typeLabel = '🦺 Sleeves';
          } else if (rawType.toLowerCase().includes('glove')) {
            itemType = 'Gloves';
            typeLabel = '🧤 Gloves';
          } else if (rawType.toLowerCase().includes('blanket')) {
            itemType = 'Blankets';
            typeLabel = '🧱 Blankets';
          } else if (rawType.toLowerCase().includes('mack')) {
            itemType = 'MACKs';
            typeLabel = '🧱 MACKs';
          } else {
            itemType = rawType || 'Other';
            typeLabel = `📦 ${itemType}`;
          }
          size = String(row['Size'] || '—').trim();
          const rawRowClass = (row['Class'] !== undefined && row['Class'] !== null && String(row['Class']).trim() !== '') ? row['Class'] : 'Class 2';
          rowClass = String(rawRowClass).trim();
          urgency = String(row['Urgency'] || 'Immediate').trim();
          status = String(row['Status'] || '').trim().toLowerCase();
        }

        if (!emp || status.includes('received') || status.includes('fulfilled')) return;
        if (this.isDepartedOrPreviousEmployee(emp)) return;

        // If the employee already holds active inventory for this item type, their need is already met
        if (itemType === 'Gloves' && hasInventoryItem(glovesTable, emp)) return;
        if (itemType === 'Sleeves' && hasInventoryItem(sleevesTable, emp)) return;

        const empRec = getEmpRecord(emp);
        const meta = empRec ? this.parseTrackedClassification(empRec.classification) : null;
        // For electrical lineworkers, sanitize Class 0 default to location approval or Class 2
        if (meta && (rowClass === 'Class 0' || !rowClass)) {
          rowClass = getLocationApprovalClass(empRec);
        }

        const isImmediate = urgency.toLowerCase() === 'immediate';
        const isSizeUp = status.includes('size up');
        // Non-swap missing PPE belongs under PPE Compliance — Missing Equipment, not Swaps
        const section = isSizeUp ? 'swaps_size_up' : 'compliance_missing';
        const cleanS = cleanSize(size) || '⚠️ Needs Size';
        const hasNoSize = (cleanS === '⚠️ Needs Size');
        const empDetail = isSizeUp ? 'Size Up' : (meta ? `${meta.code} - Missing ${itemType}` : `Missing ${itemType}`);
        const empLabel = `${emp} (${empDetail})`;

        addItem(section, itemType, typeLabel, cleanS, hasNoSize, rowClass, empLabel, isImmediate ? 0 : 15, isImmediate);
        markCovered(itemType, emp);
      });
    }

    // =========================================================================
    // SECTION 3: CURRENTLY ASSIGNED — SIZE UP IN FIELD
    // =========================================================================
    // Active personnel in the field currently wearing an oversized glove or sleeve
    if (glovesTable) {
      const gRows = glovesTable.rows || glovesTable.rawGrid || [];
      gRows.forEach(g => {
        let asg = '';
        let assignedSize = '';
        let classVal = 'Class 2';
        let status = '';
        let notes = '';

        if (Array.isArray(g)) {
          asg = String(g[8] || '').trim();
          assignedSize = String(g[2] || '').trim();
          const rawClass = (g[3] !== undefined && g[3] !== null && String(g[3]).trim() !== '') ? g[3] : 'Class 2';
          classVal = String(rawClass).trim();
          status = String(g[7] || '').trim();
          notes = String(g[11] || '').trim();
        } else if (g && typeof g === 'object') {
          asg = String(g['Assigned To'] || g['Assigned'] || '').trim();
          assignedSize = String(g['Size'] || '').trim();
          const rawClass = (g['Class'] !== undefined && g['Class'] !== null && String(g['Class']).trim() !== '') ? g['Class'] : 'Class 2';
          classVal = String(rawClass).trim();
          status = String(g['Status'] || '').trim();
          notes = String(g['Notes'] || '').trim();
        }

        if (!asg) return;
        const asgLower = asg.toLowerCase();
        if (asgLower.includes('shelf') || asgLower === 'unassigned' || asgLower === 'lost' || asgLower === 'in testing') return;
        if (this.isDepartedOrPreviousEmployee(asg)) return;

        const statLower = status.toLowerCase();
        if (NON_ASSIGNED_STATUSES.has(statLower)) return;

        // Skip if already queued under Swaps for Gloves
        if (isCovered('Gloves', asg)) return;

        const empRec = getEmpRecord(asg);
        if (!empRec) return;
        if (empRec.location && empRec.location.toLowerCase().includes('previous')) return;

        const prefGlove = cleanSize(empRec.gloveSize);
        const notesLower = notes.toLowerCase();

        const hasMarker = statLower.includes('size up') || notesLower.includes('size up');
        const numAssigned = parseFloat(assignedSize);
        const numPref = parseFloat(prefGlove);
        const isMismatch = !isNaN(numAssigned) && !isNaN(numPref) && (numAssigned > numPref);

        if (hasMarker || isMismatch) {
          const neededSize = prefGlove || '⚠️ Needs Size';
          const hasNoSize = !prefGlove;
          const finalClass = classVal.toLowerCase().startsWith('class') ? classVal : `Class ${classVal}`;
          const empLabel = hasNoSize
            ? `${asg} (Wearing Size ${assignedSize} ⚠️ Needs Preferred Size)`
            : `${asg} (Wearing Size ${assignedSize} → Needed: ${neededSize})`;

          addItem('assigned_size_up', 'Gloves', '🧤 Gloves', neededSize, hasNoSize, finalClass, empLabel, 10, true);
          markCovered('Gloves', asg);
        }
      });
    }

    if (sleevesTable) {
      const sRows = sleevesTable.rows || sleevesTable.rawGrid || [];
      const sleeveRanks = { 'small': 1, 'sm': 1, 'regular': 2, 'reg': 2, 'large': 3, 'lg': 3, 'extra large': 4, 'xl': 4, '2xl': 5, 'xxl': 5 };

      sRows.forEach(s => {
        let asg = '';
        let assignedSize = '';
        let classVal = 'Class 2';
        let status = '';
        let notes = '';

        if (Array.isArray(s)) {
          asg = String(s[8] || '').trim();
          assignedSize = String(s[2] || '').trim();
          const rawClass = (s[3] !== undefined && s[3] !== null && String(s[3]).trim() !== '') ? s[3] : 'Class 2';
          classVal = String(rawClass).trim();
          status = String(s[7] || '').trim();
          notes = String(s[11] || '').trim();
        } else if (s && typeof s === 'object') {
          asg = String(s['Assigned To'] || s['Assigned'] || '').trim();
          assignedSize = String(s['Size'] || '').trim();
          const rawClass = (s['Class'] !== undefined && s['Class'] !== null && String(s['Class']).trim() !== '') ? s['Class'] : 'Class 2';
          classVal = String(rawClass).trim();
          status = String(s['Status'] || '').trim();
          notes = String(s['Notes'] || '').trim();
        }

        if (!asg) return;
        const asgLower = asg.toLowerCase();
        if (asgLower.includes('shelf') || asgLower === 'unassigned' || asgLower === 'lost' || asgLower === 'in testing') return;
        if (this.isDepartedOrPreviousEmployee(asg)) return;

        const statLower = status.toLowerCase();
        if (NON_ASSIGNED_STATUSES.has(statLower)) return;

        // Skip if already queued under Swaps for Sleeves
        if (isCovered('Sleeves', asg)) return;

        const empRec = getEmpRecord(asg);
        if (!empRec) return;
        if (empRec.location && empRec.location.toLowerCase().includes('previous')) return;

        const prefSleeve = cleanSize(empRec.sleeveSize);
        const notesLower = notes.toLowerCase();

        const hasMarker = statLower.includes('size up') || notesLower.includes('size up');
        const rankAssigned = sleeveRanks[assignedSize.toLowerCase()] || 0;
        const rankPref = sleeveRanks[prefSleeve.toLowerCase()] || 0;
        const isMismatch = rankAssigned > 0 && rankPref > 0 && (rankAssigned > rankPref);

        if (hasMarker || isMismatch) {
          const neededSize = prefSleeve || '⚠️ Needs Size';
          const hasNoSize = !prefSleeve;
          const finalClass = classVal.toLowerCase().startsWith('class') ? classVal : `Class ${classVal}`;
          const empLabel = hasNoSize
            ? `${asg} (Wearing Size ${assignedSize} ⚠️ Needs Preferred Size)`
            : `${asg} (Wearing Size ${assignedSize} → Needed: ${neededSize})`;

          addItem('assigned_size_up', 'Sleeves', '🦺 Sleeves', neededSize, hasNoSize, finalClass, empLabel, 10, true);
          markCovered('Sleeves', asg);
        }
      });
    }

    // =========================================================================
    // SECTION 4: PPE COMPLIANCE — MISSING EQUIPMENT
    // =========================================================================
    // Active personnel in tracked classifications (SUP, GF, F, JRY, AP 1-7) missing rubber equipment
    empDirectory.forEach(empRec => {
      if (this.isDepartedOrPreviousEmployee(empRec.name)) return;
      if (empRec.location && empRec.location.toLowerCase().includes('previous')) return;
      if (empRec.lastDay) {
        const ld = new Date(empRec.lastDay);
        if (!isNaN(ld.getTime()) && ld < new Date()) return;
      }

      const meta = this.parseTrackedClassification(empRec.classification);
      if (!meta) return;

      if (this.isEmployeePpeExcluded(empRec.name)) return;

      // Determine appropriate rubber class approval for employee location
      const locationApprovalClass = getLocationApprovalClass(empRec);

      // 4A. Missing Rubber Gloves
      if (meta.needsGloves && !isCovered('Gloves', empRec.name) && !hasInventoryItem(glovesTable, empRec.name)) {
        const validPref = cleanSize(empRec.gloveSize);
        const neededSize = validPref || '⚠️ Needs Size';
        const hasNoSize = !validPref;
        const empLabel = hasNoSize
          ? `${empRec.name} (⚠️ No preferred size listed in Employees)`
          : `${empRec.name} (${meta.code} - Missing Gloves)`;

        addItem('compliance_missing', 'Gloves', '🧤 Gloves', neededSize, hasNoSize, locationApprovalClass, empLabel, 0, true);
        markCovered('Gloves', empRec.name);
      }

      // 4B. Missing Rubber Sleeves (AP 4-7, JRY, SUP, GF, F)
      if (meta.needsSleeves && !isCovered('Sleeves', empRec.name) && !hasInventoryItem(sleevesTable, empRec.name)) {
        const validPref = cleanSize(empRec.sleeveSize);
        const neededSize = validPref || '⚠️ Needs Size';
        const hasNoSize = !validPref;
        const empLabel = hasNoSize
          ? `${empRec.name} (⚠️ No preferred size listed in Employees)`
          : `${empRec.name} (${meta.code} - Missing Sleeves)`;

        addItem('compliance_missing', 'Sleeves', '🦺 Sleeves', neededSize, hasNoSize, locationApprovalClass, empLabel, 0, true);
        markCovered('Sleeves', empRec.name);
      }
    });

    // =========================================================================
    // COMPILE & PRIORITIZE ITEMS
    // =========================================================================
    this.items = Object.values(aggregated).map(item => {
      let priority = 'LOW';
      let priorityEmoji = '🟢';
      let timeframe = 'Consider / Future';

      if (item.hasNoSize) {
        priority = 'HIGH';
        priorityEmoji = '🔴';
        timeframe = 'Immediate (Needs Size)';
      } else if (item.isImmediate || item.minDaysLeft <= 0) {
        priority = 'HIGH';
        priorityEmoji = '🔴';
        timeframe = 'Immediate';
      } else if (item.minDaysLeft <= 14) {
        priority = 'HIGH';
        priorityEmoji = '🔴';
        timeframe = 'Immediate (< 14d)';
      } else if (item.minDaysLeft <= 30) {
        priority = 'MEDIUM';
        priorityEmoji = '🟠';
        timeframe = 'Soon (15-30d)';
      }

      return {
        ...item,
        priority,
        priorityEmoji,
        timeframe
      };
    });

    // Sort order: Group by Section first, then by Urgency, then Quantity
    const sectionOrder = {
      'swaps_need': 1,
      'swaps_size_up': 2,
      'assigned_size_up': 3,
      'compliance_missing': 4
    };
    const priorityOrder = { 'HIGH': 1, 'MEDIUM': 2, 'LOW': 3 };

    this.items.sort((a, b) => {
      const sA = sectionOrder[a.section] || 9;
      const sB = sectionOrder[b.section] || 9;
      if (sA !== sB) return sA - sB;

      const pA = priorityOrder[a.priority] || 4;
      const pB = priorityOrder[b.priority] || 4;
      if (pA !== pB) return pA - pB;

      return b.quantity - a.quantity;
    });
  }

  onVendorChange(vendorName) {
    this.selectedVendor = this.vendors.find(v => v.name === vendorName) || null;
    this.updatePricing();
    this.render();
  }

  updatePricing() {
    if (!this.selectedVendor || !this.selectedVendor.items) {
      this.items.forEach(i => {
        i.price = 0;
        i.partNumber = '';
      });
      return;
    }

    const catalog = this.selectedVendor.items;

    this.items.forEach(item => {
      const tClassNum = (item.classVal || '').replace(/[^0-9]/g, '').trim(); // e.g. "0", "2", "4"
      const tType = (item.itemType || '').toLowerCase(); // e.g. "gloves", "sleeves", "blankets", "macks"
      const tSize = (item.size || '').toLowerCase().trim(); // e.g. "10.5", "9", "regular"

      // 1. Exact Match (Type + Class + Size) if valid size
      let match = null;
      if (!item.hasNoSize && tSize !== '—' && tSize !== '' && !tSize.includes('needs size')) {
        match = catalog.find(ci => {
          const name = ci.item.toLowerCase();
          const typeMatch = name.includes(tType.slice(0, 4)) || (tType.startsWith('glove') && name.includes('glove')) || (tType.startsWith('sleeve') && name.includes('sleeve')) || (tType.startsWith('blanket') && name.includes('blanket'));
          const classMatch = !tClassNum || name.includes(`cl${tClassNum}`) || name.includes(`class ${tClassNum}`) || name.includes(`class${tClassNum}`) || name.includes(` ${tClassNum} `) || name.endsWith(` ${tClassNum}`);
          const sizeMatch = name.endsWith(` ${tSize}`) || name.includes(` ${tSize} `) || name.includes(` ${tSize}`) || name.includes(`size ${tSize}`) || name.includes(` ${tSize}h`) || name.includes(tSize);
          return typeMatch && classMatch && sizeMatch;
        });
      }

      // 2. Type + Class Match (e.g. "Class 2 Glove", "Class 2 Sleeve", or item needing size confirmation)
      if (!match) {
        match = catalog.find(ci => {
          const name = ci.item.toLowerCase();
          const typeMatch = name.includes(tType.slice(0, 4)) || (tType.startsWith('glove') && name.includes('glove')) || (tType.startsWith('sleeve') && name.includes('sleeve')) || (tType.startsWith('blanket') && name.includes('blanket'));
          const classMatch = !tClassNum || name.includes(`cl${tClassNum}`) || name.includes(`class ${tClassNum}`) || name.includes(`class${tClassNum}`);
          return typeMatch && classMatch;
        });
      }

      // 3. Fallback Type Match (e.g. "AED", "Grounding", "Hot Stick")
      if (!match) {
        match = catalog.find(ci => {
          const name = ci.item.toLowerCase();
          return name.includes(tType.slice(0, 4));
        });
      }

      if (match) {
        item.price = match.price;
        item.partNumber = match.itemNumber || '';
      } else {
        item.price = 0;
        item.partNumber = '';
      }
    });
  }

  render() {
    const vSelect = document.getElementById('procurement-vendor-select');
    if (vSelect) {
      const currentVal = this.selectedVendor ? this.selectedVendor.name : '';
      vSelect.innerHTML = '<option value="">Select a vendor...</option>' +
        this.vendors.map(v => `<option value="${v.name}" ${v.name === currentVal ? 'selected' : ''}>${v.name} (${v.items.length} items)</option>`).join('');
    }

    const vInfo = document.getElementById('procurement-vendor-info');
    if (vInfo) {
      if (this.selectedVendor) {
        vInfo.innerHTML = `<strong>${this.selectedVendor.name}</strong> • Contact: ${this.selectedVendor.contact || 'N/A'} • Email: ${this.selectedVendor.email || 'N/A'} • Phone: ${this.selectedVendor.phone || 'N/A'}`;
      } else {
        vInfo.innerHTML = '<span style="color: var(--text-muted);">Select a vendor to auto-match catalog pricing and part numbers.</span>';
      }
    }

    const container = document.getElementById('procurement-items-table');
    if (!container) return;

    if (this.items.length === 0) {
      container.innerHTML = `
        <div style="padding: 40px; text-align: center; color: var(--text-muted);">
          <div style="font-size: 32px; margin-bottom: 8px;">✅</div>
          <h3 style="color: var(--text-primary); font-size: 16px;">All Equipment In Stock</h3>
          <p style="margin-top: 6px; font-size: 13px;">No items currently require purchase across swap sheets, assignments, or compliance.</p>
        </div>
      `;
      this.updateTotals();
      return;
    }

    // Calculate section counts
    const counts = {
      all: this.items.length,
      swaps_need: this.items.filter(i => i.section === 'swaps_need').length,
      swaps_size_up: this.items.filter(i => i.section === 'swaps_size_up').length,
      assigned_size_up: this.items.filter(i => i.section === 'assigned_size_up').length,
      compliance_missing: this.items.filter(i => i.section === 'compliance_missing').length
    };

    // Filter items based on active section filter
    const activeFilter = this.currentSectionFilter || 'all';
    const displayItems = activeFilter === 'all'
      ? this.items
      : this.items.filter(i => i.section === activeFilter);

    // Group display items by section
    const grouped = {};
    Object.keys(this.SECTIONS).forEach(secKey => {
      grouped[secKey] = [];
    });
    displayItems.forEach((item, globalIdx) => {
      const sKey = item.section || 'swaps_need';
      if (!grouped[sKey]) grouped[sKey] = [];
      grouped[sKey].push({ ...item, _globalIdx: globalIdx });
    });

    let html = `
      <!-- Section Filter Tabs Bar -->
      <div class="procurement-section-tabs" style="display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 14px; align-items: center; padding-bottom: 10px; border-bottom: 1px solid var(--border-color);">
        <span style="font-size: 12px; color: var(--text-muted); font-weight: 700; margin-right: 4px;">VIEW SECTION:</span>
        <button type="button" class="btn ${activeFilter === 'all' ? 'btn-primary' : 'btn-secondary'}" style="font-size: 11.5px; padding: 4px 10px; display: inline-flex; align-items: center; gap: 6px;" onclick="window.procurementEngine.setSectionFilter('all')">
          <span>📋 All Sections</span>
          <span style="background: rgba(255,255,255,0.15); padding: 1px 6px; border-radius: 10px; font-size: 10.5px;">${counts.all}</span>
        </button>
        <button type="button" class="btn ${activeFilter === 'swaps_need' ? 'btn-primary' : 'btn-secondary'}" style="font-size: 11.5px; padding: 4px 10px; display: inline-flex; align-items: center; gap: 6px;" onclick="window.procurementEngine.setSectionFilter('swaps_need')">
          <span>🛒 Swaps: Need to Purchase</span>
          <span style="background: rgba(255,255,255,0.15); padding: 1px 6px; border-radius: 10px; font-size: 10.5px;">${counts.swaps_need}</span>
        </button>
        <button type="button" class="btn ${activeFilter === 'swaps_size_up' ? 'btn-primary' : 'btn-secondary'}" style="font-size: 11.5px; padding: 4px 10px; display: inline-flex; align-items: center; gap: 6px;" onclick="window.procurementEngine.setSectionFilter('swaps_size_up')">
          <span>🔄 Swaps: Size Up</span>
          <span style="background: rgba(255,255,255,0.15); padding: 1px 6px; border-radius: 10px; font-size: 10.5px;">${counts.swaps_size_up}</span>
        </button>
        <button type="button" class="btn ${activeFilter === 'assigned_size_up' ? 'btn-primary' : 'btn-secondary'}" style="font-size: 11.5px; padding: 4px 10px; display: inline-flex; align-items: center; gap: 6px;" onclick="window.procurementEngine.setSectionFilter('assigned_size_up')">
          <span>⚠️ Assigned: Size Up</span>
          <span style="background: rgba(255,255,255,0.15); padding: 1px 6px; border-radius: 10px; font-size: 10.5px;">${counts.assigned_size_up}</span>
        </button>
        <button type="button" class="btn ${activeFilter === 'compliance_missing' ? 'btn-primary' : 'btn-secondary'}" style="font-size: 11.5px; padding: 4px 10px; display: inline-flex; align-items: center; gap: 6px;" onclick="window.procurementEngine.setSectionFilter('compliance_missing')">
          <span>🛡️ PPE Compliance: Missing</span>
          <span style="background: rgba(255,255,255,0.15); padding: 1px 6px; border-radius: 10px; font-size: 10.5px;">${counts.compliance_missing}</span>
        </button>
      </div>

      <table class="table" style="width: 100%; border-collapse: collapse; font-size: 13px;">
        <thead>
          <tr style="background: rgba(255,255,255,0.05); border-bottom: 2px solid var(--border-color);">
            <th style="padding: 10px; width: 40px; text-align: center;"><input type="checkbox" id="procurement-select-all" checked title="Select or deselect all items"></th>
            <th style="padding: 10px; text-align: left;">Category & Item</th>
            <th style="padding: 10px; text-align: center; width: 95px;">Size</th>
            <th style="padding: 10px; text-align: center; width: 90px;">Class / KV</th>
            <th style="padding: 10px; text-align: center; width: 80px;">Qty</th>
            <th style="padding: 10px; text-align: center; width: 150px;">Urgency</th>
            <th style="padding: 10px; text-align: right; width: 100px;">Unit Price</th>
            <th style="padding: 10px; text-align: right; width: 110px;">Est. Total</th>
          </tr>
        </thead>
        <tbody>
    `;

    // Render grouped sections
    Object.keys(this.SECTIONS).forEach(secKey => {
      const secConfig = this.SECTIONS[secKey];
      const secItems = grouped[secKey] || [];
      if (secItems.length === 0) return;

      const secUnits = secItems.reduce((acc, it) => acc + it.quantity, 0);
      const secAllChecked = secItems.every(it => it.selected);

      html += `
        <!-- Section Header Row -->
        <tr class="procurement-section-header-row" style="background: ${secConfig.headerBg}; border-top: 2px solid ${secConfig.accentBorder}; border-bottom: 1px solid var(--border-color);">
          <td style="padding: 8px; text-align: center;">
            <input type="checkbox" class="procurement-section-check" data-section="${secKey}" ${secAllChecked ? 'checked' : ''} title="Select/Deselect all in ${secConfig.title}">
          </td>
          <td colspan="7" style="padding: 10px 12px;">
            <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px;">
              <div style="display: flex; align-items: center; gap: 8px;">
                <span style="font-size: 16px;">${secConfig.icon}</span>
                <span style="font-weight: 800; font-size: 13.5px; color: ${secConfig.badgeText};">${secConfig.title.toUpperCase()}</span>
                <span class="brand-badge" style="background: ${secConfig.badgeColor}; color: ${secConfig.badgeText}; border: 1px solid ${secConfig.badgeBorder}; font-size: 11px; font-weight: 700;">
                  ${secItems.length} line ${secItems.length === 1 ? 'item' : 'items'} (${secUnits} units)
                </span>
              </div>
              <div style="font-size: 11.5px; color: var(--text-muted); font-style: italic;">
                ${secConfig.desc}
              </div>
            </div>
          </td>
        </tr>
      `;

      secItems.forEach(item => {
        const isChecked = item.selected ? 'checked' : '';
        const totalCost = (item.price || 0) * item.quantity;
        const hasEmployees = item.employees && item.employees.length > 0;
        const checkedEmpCount = hasEmployees ? item.employees.filter(e => e.checked).length : 0;

        let empRowsHtml = '';
        if (hasEmployees) {
          empRowsHtml = item.employees.map((emp, empIdx) => {
            const isEmpChecked = emp.checked ? 'checked' : '';
            const empTotal = (emp.checked && item.price > 0) ? `$${item.price.toFixed(2)}` : '—';
            return `
              <tr class="procurement-emp-row" data-item-idx="${item._globalIdx}" data-emp-idx="${empIdx}" style="background: rgba(15, 23, 42, 0.45); border-bottom: 1px solid rgba(255, 255, 255, 0.05); ${emp.checked ? '' : 'opacity: 0.55;'}">
                <td style="padding: 6px 8px; text-align: right; color: #64748b; font-size: 13px; border-right: 1px solid rgba(255,255,255,0.04);">
                  ↳
                </td>
                <td style="padding: 6px 12px;">
                  <label style="display: inline-flex; align-items: center; gap: 8px; cursor: pointer; user-select: none; margin: 0;">
                    <input type="checkbox" class="procurement-emp-check" data-item-idx="${item._globalIdx}" data-emp-idx="${empIdx}" ${isEmpChecked} style="cursor: pointer; accent-color: #2563eb; width: 15px; height: 15px; margin: 0;">
                    <span style="font-weight: 600; font-size: 12.5px; color: ${emp.checked ? '#f8fafc' : '#94a3b8'};">
                      👤 ${emp.name}
                    </span>
                    ${emp.detail ? `
                      <span style="font-size: 11px; padding: 2px 7px; border-radius: 4px; background: rgba(255, 255, 255, 0.06); color: var(--text-secondary); border: 1px solid rgba(255, 255, 255, 0.08); font-weight: 500;">
                        ${emp.detail}
                      </span>
                    ` : ''}
                  </label>
                </td>
                <td style="padding: 6px 8px; text-align: center; color: var(--text-muted); font-size: 12px;">
                  ${item.size}
                </td>
                <td style="padding: 6px 8px; text-align: center; color: var(--text-muted); font-size: 12px;">
                  ${item.classVal}
                </td>
                <td style="padding: 6px 8px; text-align: center; font-size: 12px; font-weight: 600; color: ${emp.checked ? '#4ade80' : '#64748b'};">
                  ${emp.checked ? '1' : '0'}
                </td>
                <td style="padding: 6px 8px; text-align: center; font-size: 11px; color: var(--text-muted);">
                  ${item.timeframe}
                </td>
                <td style="padding: 6px 8px; text-align: right; font-family: monospace; font-size: 11.5px; color: var(--text-muted);">
                  ${item.price > 0 ? `$${item.price.toFixed(2)}` : '—'}
                </td>
                <td style="padding: 6px 8px; text-align: right; font-family: monospace; font-size: 11.5px; color: ${emp.checked && item.price > 0 ? '#4ade80' : 'var(--text-muted)'}; font-weight: ${emp.checked ? '600' : 'normal'};">
                  ${empTotal}
                </td>
              </tr>
            `;
          }).join('');
        }

        html += `
          <tr style="border-bottom: 1px solid var(--border-color); ${item.selected ? 'background: rgba(37, 99, 235, 0.07);' : ''}">
            <td style="padding: 8px; text-align: center;">
              <input type="checkbox" class="procurement-item-check" data-idx="${item._globalIdx}" ${isChecked} title="Select/Deselect line item">
            </td>
            <td style="padding: 8px;">
              <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
                <span style="font-weight: 600; color: var(--text-primary); font-size: 13.5px;">${item.typeLabel}</span>
                <span class="badge" style="font-size: 10px; padding: 1px 5px; background: ${secConfig.badgeColor}; color: ${secConfig.badgeText}; border: 1px solid ${secConfig.badgeBorder};">
                  ${secConfig.shortTitle}
                </span>
                ${hasEmployees ? `
                  <span class="badge" style="font-size: 10.5px; padding: 1px 6px; background: rgba(255,255,255,0.08); color: var(--text-secondary); border-radius: 10px; border: 1px solid rgba(255,255,255,0.12);">
                    👥 ${checkedEmpCount}/${item.employees.length} selected
                  </span>
                ` : ''}
              </div>
              ${item.partNumber ? `<div style="font-size: 11px; color: #3b82f6; margin-top: 1px;">PN: ${item.partNumber}</div>` : ''}
            </td>
            <td style="padding: 8px; text-align: center;">
              ${item.hasNoSize ? `
                <span class="badge" style="background: rgba(245, 158, 11, 0.25); color: #fbbf24; border: 1px solid rgba(245, 158, 11, 0.5); font-weight: 700; padding: 3px 8px; border-radius: 4px; font-size: 11px; display: inline-block;">
                  ⚠️ Needs Size
                </span>
              ` : `
                <span style="font-weight: 600; color: var(--text-primary); font-size: 13px;">${item.size}</span>
              `}
            </td>
            <td style="padding: 8px; text-align: center; color: var(--text-secondary); font-weight: 500;">${item.classVal}</td>
            <td style="padding: 8px; text-align: center;">
              <input type="number" min="0" value="${item.quantity}" data-idx="${item._globalIdx}" class="procurement-qty-input" style="width: 55px; padding: 4px 6px; text-align: center; background: var(--bg-tertiary); border: 1px solid var(--border-color); border-radius: 4px; color: var(--text-primary); font-weight: 600;">
            </td>
            <td style="padding: 8px; text-align: center;">
              <span class="badge ${item.priority === 'HIGH' ? 'badge-danger' : (item.priority === 'MEDIUM' ? 'badge-warning' : 'badge-success')}">
                ${item.priorityEmoji} ${item.timeframe}
              </span>
            </td>
            <td style="padding: 8px; text-align: right; font-family: monospace;">
              ${item.price > 0 ? `$${item.price.toFixed(2)}` : '—'}
            </td>
            <td style="padding: 8px; text-align: right; font-weight: 600; font-family: monospace;">
              ${totalCost > 0 ? `$${totalCost.toFixed(2)}` : '—'}
            </td>
          </tr>
          ${empRowsHtml}
        `;
      });
    });

    html += '</tbody></table>';
    container.innerHTML = html;

    // Master Select All Event
    const selectAll = document.getElementById('procurement-select-all');
    if (selectAll) {
      selectAll.addEventListener('change', (e) => {
        const val = e.target.checked;
        displayItems.forEach(i => {
          i.selected = val;
          if (i.employees && i.employees.length > 0) {
            i.employees.forEach(emp => {
              emp.checked = val;
            });
            i.quantity = val ? i.employees.length : 0;
          }
        });
        this.render();
      });
    }

    // Section Select All Checkboxes
    container.querySelectorAll('.procurement-section-check').forEach(cb => {
      cb.addEventListener('change', (e) => {
        const sKey = e.target.dataset.section;
        this.toggleSectionSelected(sKey, e.target.checked);
      });
    });

    // Individual Item Checkboxes
    container.querySelectorAll('.procurement-item-check').forEach(cb => {
      cb.addEventListener('change', (e) => {
        const idx = parseInt(e.target.dataset.idx, 10);
        const item = this.items[idx];
        if (!item) return;

        item.selected = e.target.checked;
        if (item.employees && item.employees.length > 0) {
          item.employees.forEach(emp => {
            emp.checked = item.selected;
          });
          item.quantity = item.selected ? item.employees.length : 0;
        }
        this.render();
      });
    });

    // Individual Employee Checkboxes
    container.querySelectorAll('.procurement-emp-check').forEach(cb => {
      cb.addEventListener('change', (e) => {
        const itemIdx = parseInt(e.target.dataset.itemIdx, 10);
        const empIdx = parseInt(e.target.dataset.empIdx, 10);
        const item = this.items[itemIdx];
        if (!item || !item.employees || !item.employees[empIdx]) return;

        item.employees[empIdx].checked = e.target.checked;
        const checkedCount = item.employees.filter(emp => emp.checked).length;
        item.quantity = checkedCount;
        item.selected = checkedCount > 0;
        this.render();
      });
    });

    // Quantity Input Handlers
    container.querySelectorAll('.procurement-qty-input').forEach(input => {
      input.addEventListener('change', (e) => {
        const idx = parseInt(e.target.dataset.idx, 10);
        const qty = parseInt(e.target.value, 10);
        const item = this.items[idx];
        if (item) {
          item.quantity = isNaN(qty) ? 0 : Math.max(0, qty);
          item.selected = item.quantity > 0;
          this.render();
        }
      });
    });

    this.updateTotals();
  }

  updateTotals() {
    let selectedCount = 0;
    let totalQty = 0;
    let totalCost = 0;

    this.items.forEach(i => {
      if (i.selected) {
        selectedCount++;
        totalQty += i.quantity;
        totalCost += (i.price || 0) * i.quantity;
      }
    });

    const badge = document.getElementById('procurement-selected-badge');
    if (badge) badge.textContent = `${selectedCount} items selected (${totalQty} units)`;

    const totalEl = document.getElementById('procurement-total-cost');
    if (totalEl) totalEl.textContent = `$${totalCost.toFixed(2)}`;
  }

  generatePOText() {
    const selected = this.items.filter(i => i.selected && i.quantity > 0);
    if (selected.length === 0) {
      alert('Please select at least one item to generate a purchase order.');
      return;
    }

    const currentYear = new Date().getFullYear();
    const poNum = `002-${String(currentYear).slice(-2)}`;
    const vendorName = this.selectedVendor ? this.selectedVendor.name : '[Vendor Name]';
    const dateStr = new Date().toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });

    let lines = [];
    lines.push(`PURCHASE ORDER: ${poNum}`);
    lines.push(`Date: ${dateStr}`);
    lines.push(`Vendor: ${vendorName}`);
    if (this.selectedVendor && this.selectedVendor.email) lines.push(`Attn: ${this.selectedVendor.contact || ''} (${this.selectedVendor.email})`);
    lines.push('----------------------------------------------------');
    lines.push('Please fulfill the following order:\n');

    let grandTotal = 0;

    // Group selected items by section in the PO text
    const secKeys = ['swaps_need', 'swaps_size_up', 'assigned_size_up', 'compliance_missing'];
    secKeys.forEach(sKey => {
      const secItems = selected.filter(i => i.section === sKey);
      if (secItems.length === 0) return;

      const secTitle = this.SECTIONS[sKey]?.title || sKey;
      lines.push(`--- ${secTitle.toUpperCase()} ---`);

      secItems.forEach(item => {
        const sizeDisplay = item.hasNoSize ? '⚠️ NEEDS SIZE (VERIFY WITH WORKER)' : `Size ${item.size}`;
        let line = `• (${item.quantity}) ${item.itemType} - ${sizeDisplay} - Class/Rating: ${item.classVal}`;
        if (item.partNumber) line += ` [Part #: ${item.partNumber}]`;
        if (item.price > 0) {
          const itemTotal = item.price * item.quantity;
          grandTotal += itemTotal;
          line += ` @ $${item.price.toFixed(2)} ea = $${itemTotal.toFixed(2)}`;
        }
        if (item.employees && item.employees.length > 0) {
          const checkedEmps = item.employees.filter(e => e.checked).map(e => e.label || e.name);
          if (checkedEmps.length > 0) {
            line += `\n    └ ${checkedEmps.join(', ')}`;
          }
        }
        lines.push(line);
      });
      lines.push('');
    });

    lines.push('----------------------------------------------------');
    if (grandTotal > 0) {
      lines.push(`Estimated Total: $${grandTotal.toFixed(2)}`);
    }
    lines.push('Please confirm availability and estimated delivery date.\n');
    lines.push('Thank you,\nSafety Department');

    const poText = lines.join('\n');

    const modal = document.getElementById('procurement-po-modal');
    const textarea = document.getElementById('procurement-po-textarea');
    if (modal && textarea) {
      textarea.value = poText;
      modal.style.display = 'flex';
    }
  }

  openManageVendorsModal() {
    this.activeModalVendorIdx = (this.activeModalVendorIdx !== undefined && this.activeModalVendorIdx < this.vendors.length) ? this.activeModalVendorIdx : 0;
    this.renderVendorModal();
    const modal = document.getElementById('manage-vendors-modal');
    if (modal) modal.style.display = 'flex';
  }

  closeManageVendorsModal() {
    const modal = document.getElementById('manage-vendors-modal');
    if (modal) modal.style.display = 'none';
  }

  renderVendorModal() {
    const body = document.getElementById('manage-vendors-modal-body');
    if (!body) return;

    if (!this.vendors || this.vendors.length === 0) {
      body.innerHTML = `
        <div style="padding: 50px 20px; text-align: center; color: var(--text-muted);">
          <div style="font-size: 36px; margin-bottom: 10px;">🏢</div>
          <h3 style="color: var(--text-primary); font-size: 16px; margin-bottom: 6px;">No Vendors Configured</h3>
          <p style="font-size: 13px; max-width: 440px; margin: 0 auto 16px;">
            Click <strong>"➕ Add Vendor"</strong> to create a vendor, or click <strong>"Download Snapshot"</strong> to sync with Google Sheets.
          </p>
          <button class="btn btn-primary" style="font-size: 12px; padding: 6px 16px;" onclick="window.procurementEngine.addVendor()">➕ Add Vendor</button>
        </div>
      `;
      return;
    }

    const currentV = this.vendors[this.activeModalVendorIdx] || this.vendors[0];

    let html = `
      <div style="display: grid; grid-template-columns: 280px 1fr; gap: 20px; min-height: 480px;">
        <!-- Left Column: Vendors List -->
        <div style="background: rgba(15, 23, 42, 0.6); border: 1px solid var(--border-color); border-radius: 8px; padding: 14px; display: flex; flex-direction: column; gap: 12px;">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <div style="font-weight: 700; font-size: 13px; color: #93c5fd;">🏢 Vendors (${this.vendors.length})</div>
            <button class="btn btn-primary" style="font-size: 11px; padding: 4px 8px;" onclick="window.procurementEngine.addVendor()">➕ Add</button>
          </div>
          <div style="flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 6px; max-height: 420px;">
    `;

    this.vendors.forEach((v, idx) => {
      const isSelected = idx === this.activeModalVendorIdx;
      html += `
        <div style="padding: 10px; border-radius: 6px; cursor: pointer; border: 1px solid ${isSelected ? '#3b82f6' : 'var(--border-color)'}; background: ${isSelected ? 'rgba(59, 130, 246, 0.15)' : 'rgba(30, 41, 59, 0.4)'}; display: flex; justify-content: space-between; align-items: center;" onclick="window.procurementEngine.selectModalVendor(${idx})">
          <div>
            <div style="font-weight: ${isSelected ? '700' : '500'}; color: ${isSelected ? '#fff' : 'var(--text-primary)'}; font-size: 12.5px;">${v.name || 'Unnamed Vendor'}</div>
            <div style="font-size: 11px; color: var(--text-muted);">${(v.items || []).length} catalog items</div>
          </div>
          <button class="btn btn-secondary" style="padding: 2px 6px; font-size: 11px; color: #f87171;" title="Delete Vendor" onclick="event.stopPropagation(); window.procurementEngine.deleteVendor(${idx})">🗑️</button>
        </div>
      `;
    });

    html += `
          </div>
        </div>

        <!-- Right Column: Vendor Details & Product Catalog -->
        <div style="display: flex; flex-direction: column; gap: 16px; overflow-y: auto;">
          <!-- Vendor Contact Info -->
          <div style="background: rgba(30, 41, 59, 0.5); border: 1px solid var(--border-color); border-radius: 8px; padding: 14px;">
            <div style="font-weight: 700; font-size: 13px; color: #93c5fd; margin-bottom: 10px;">👤 Vendor Contact Details</div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
              <div>
                <label style="font-size: 11px; color: var(--text-muted); display: block; margin-bottom: 3px;">Vendor Name</label>
                <input type="text" value="${currentV.name || ''}" class="form-input" style="width: 100%; font-size: 12px; padding: 6px; background: var(--bg-tertiary); border: 1px solid var(--border-color); border-radius: 4px; color: #fff;" onchange="window.procurementEngine.updateCurrentVendorField('name', this.value)">
              </div>
              <div>
                <label style="font-size: 11px; color: var(--text-muted); display: block; margin-bottom: 3px;">Contact Person</label>
                <input type="text" value="${currentV.contact || ''}" class="form-input" style="width: 100%; font-size: 12px; padding: 6px; background: var(--bg-tertiary); border: 1px solid var(--border-color); border-radius: 4px; color: #fff;" onchange="window.procurementEngine.updateCurrentVendorField('contact', this.value)">
              </div>
              <div>
                <label style="font-size: 11px; color: var(--text-muted); display: block; margin-bottom: 3px;">Email Address</label>
                <input type="email" value="${currentV.email || ''}" class="form-input" style="width: 100%; font-size: 12px; padding: 6px; background: var(--bg-tertiary); border: 1px solid var(--border-color); border-radius: 4px; color: #fff;" onchange="window.procurementEngine.updateCurrentVendorField('email', this.value)">
              </div>
              <div>
                <label style="font-size: 11px; color: var(--text-muted); display: block; margin-bottom: 3px;">Phone Number</label>
                <input type="text" value="${currentV.phone || ''}" class="form-input" style="width: 100%; font-size: 12px; padding: 6px; background: var(--bg-tertiary); border: 1px solid var(--border-color); border-radius: 4px; color: #fff;" onchange="window.procurementEngine.updateCurrentVendorField('phone', this.value)">
              </div>
            </div>
          </div>

          <!-- Product Catalog Section -->
          <div style="background: rgba(30, 41, 59, 0.5); border: 1px solid var(--border-color); border-radius: 8px; padding: 14px; flex: 1; display: flex; flex-direction: column;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
              <div style="font-weight: 700; font-size: 13px; color: #93c5fd;">📦 Product Catalog & Pricing</div>
              <button class="btn btn-primary" style="font-size: 11px; padding: 4px 10px;" onclick="window.procurementEngine.addCatalogItem()">➕ Add Item</button>
            </div>

            <div style="flex: 1; max-height: 280px; overflow-y: auto;">
              <table style="width: 100%; border-collapse: collapse; font-size: 12px;">
                <thead>
                  <tr style="border-bottom: 1px solid var(--border-color); color: var(--text-muted); text-align: left;">
                    <th style="padding: 6px;">Item Description</th>
                    <th style="padding: 6px; width: 160px;">Part / Item #</th>
                    <th style="padding: 6px; width: 110px; text-align: right;">Unit Price ($)</th>
                    <th style="padding: 6px; width: 40px;"></th>
                  </tr>
                </thead>
                <tbody>
    `;

    if (!currentV.items || currentV.items.length === 0) {
      html += `<tr><td colspan="4" style="text-align: center; padding: 20px; color: var(--text-muted);">No catalog items. Click "➕ Add Item" to add pricing.</td></tr>`;
    } else {
      currentV.items.forEach((it, iIdx) => {
        html += `
          <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">
            <td style="padding: 6px;">
              <input type="text" value="${it.item || ''}" placeholder="e.g. Class 0 Glove, Class 4 Blanket" style="width: 100%; font-size: 12px; padding: 4px 6px; background: var(--bg-tertiary); border: 1px solid var(--border-color); border-radius: 4px; color: #fff;" onchange="window.procurementEngine.updateCatalogItem(${iIdx}, 'item', this.value)">
            </td>
            <td style="padding: 6px;">
              <input type="text" value="${it.itemNumber || ''}" placeholder="e.g. WS-GLV-0" style="width: 100%; font-size: 12px; padding: 4px 6px; background: var(--bg-tertiary); border: 1px solid var(--border-color); border-radius: 4px; color: #fff;" onchange="window.procurementEngine.updateCatalogItem(${iIdx}, 'itemNumber', this.value)">
            </td>
            <td style="padding: 6px; text-align: right;">
              <input type="number" step="0.01" min="0" value="${it.price || 0}" style="width: 90px; text-align: right; font-size: 12px; padding: 4px 6px; background: var(--bg-tertiary); border: 1px solid var(--border-color); border-radius: 4px; color: #4ade80;" onchange="window.procurementEngine.updateCatalogItem(${iIdx}, 'price', parseFloat(this.value)||0)">
            </td>
            <td style="padding: 6px; text-align: center;">
              <button class="btn btn-secondary" style="padding: 2px 5px; font-size: 11px; color: #f87171;" title="Delete Item" onclick="window.procurementEngine.deleteCatalogItem(${iIdx})">✕</button>
            </td>
          </tr>
        `;
      });
    }

    html += `
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    `;

    body.innerHTML = html;
  }

  selectModalVendor(idx) {
    this.activeModalVendorIdx = idx;
    this.renderVendorModal();
  }

  addVendor() {
    const newName = prompt('Enter new vendor name:');
    if (!newName || !newName.trim()) return;
    this.vendors.push({
      name: newName.trim(),
      contact: '',
      email: '',
      phone: '',
      notes: '',
      items: [
        { item: 'Class 0 Glove', itemNumber: '', price: 0 },
        { item: 'Class 2 Glove', itemNumber: '', price: 0 },
        { item: 'Class 2 Sleeve', itemNumber: '', price: 0 },
        { item: 'Class 4 Blanket', itemNumber: '', price: 0 }
      ]
    });
    this.activeModalVendorIdx = this.vendors.length - 1;
    this.renderVendorModal();
  }

  deleteVendor(idx) {
    const v = this.vendors[idx];
    if (!v) return;
    if (confirm(`Are you sure you want to delete vendor "${v.name}"?`)) {
      this.vendors.splice(idx, 1);
      if (this.activeModalVendorIdx >= this.vendors.length) {
        this.activeModalVendorIdx = Math.max(0, this.vendors.length - 1);
      }
      this.renderVendorModal();
    }
  }

  updateCurrentVendorField(field, val) {
    const currentV = this.vendors[this.activeModalVendorIdx];
    if (currentV) {
      currentV[field] = val;
    }
  }

  addCatalogItem() {
    const currentV = this.vendors[this.activeModalVendorIdx];
    if (!currentV) return;
    if (!currentV.items) currentV.items = [];
    currentV.items.push({
      item: 'New Item',
      itemNumber: '',
      price: 0
    });
    this.renderVendorModal();
  }

  deleteCatalogItem(iIdx) {
    const currentV = this.vendors[this.activeModalVendorIdx];
    if (!currentV || !currentV.items) return;
    currentV.items.splice(iIdx, 1);
    this.renderVendorModal();
  }

  updateCatalogItem(iIdx, field, val) {
    const currentV = this.vendors[this.activeModalVendorIdx];
    if (currentV && currentV.items && currentV.items[iIdx]) {
      currentV.items[iIdx][field] = val;
    }
  }

  async saveVendorsToDB() {
    const saveBtn = document.getElementById('btn-save-vendors');
    if (saveBtn) saveBtn.textContent = '⏳ Saving...';

    try {
      const headers = ['Vendor Name', 'Contact Name', 'Email', 'Phone', 'Notes', 'Item', 'Item Number', 'Price'];
      const rows = [];
      const rawGrid = [headers];

      this.vendors.forEach(v => {
        if (v.items && v.items.length > 0) {
          v.items.forEach(it => {
            const rowObj = {
              'Vendor Name': v.name,
              'Contact Name': v.contact,
              'Email': v.email,
              'Phone': v.phone,
              'Notes': v.notes,
              'Item': it.item,
              'Item Number': it.itemNumber,
              'Price': it.price
            };
            rows.push(rowObj);
            rawGrid.push([v.name, v.contact, v.email, v.phone, v.notes, it.item, it.itemNumber, it.price]);
          });
        } else {
          const rowObj = {
            'Vendor Name': v.name,
            'Contact Name': v.contact,
            'Email': v.email,
            'Phone': v.phone,
            'Notes': v.notes,
            'Item': '',
            'Item Number': '',
            'Price': 0
          };
          rows.push(rowObj);
          rawGrid.push([v.name, v.contact, v.email, v.phone, v.notes, '', '', 0]);
        }
      });

      const vTable = {
        name: 'Vendors',
        headers: headers,
        rows: rows,
        rawGrid: rawGrid,
        rowCount: rows.length,
        maxRows: rows.length + 1,
        maxCols: 8
      };

      await this.db.saveTable('vendors', vTable);

      this.updatePricing();
      this.render();
      this.closeManageVendorsModal();

      alert('✅ Vendor catalog saved successfully! Click "Push Changes to Sheets" at the top whenever you wish to sync changes back to Google Sheets.');
    } catch (err) {
      console.error('Error saving vendor catalog:', err);
      alert('❌ Failed to save vendor changes: ' + (err.message || err));
    } finally {
      if (saveBtn) saveBtn.innerHTML = '<span>💾</span> Save Vendor Changes';
    }
  }

  /**
   * Generates formatted PO Email via mailto:
   */
  sendPoEmail() {
    const activeItems = (this.items || []).filter(i => i.selected && i.quantity > 0);
    if (activeItems.length === 0) {
      alert('⚠️ No purchase items selected.');
      return;
    }

    const v = this.selectedVendor;
    const recipient = v ? v.email : '';
    const subject = encodeURIComponent(`Purchase Order Request - PPE & Equipment (${new Date().toLocaleDateString()})`);

    let bodyText = `Dear ${v ? (v.contact || v.name) : 'Vendor'},\n\nPlease process the following purchase order for Mountain Power:\n\n`;
    bodyText += `========================================================\n`;
    bodyText += `SECTION | ITEM | SPEC / SIZE | PART # | QTY | UNIT | TOTAL\n`;
    bodyText += `========================================================\n`;

    let grandTotal = 0;
    activeItems.forEach(item => {
      const lineTotal = item.price > 0 ? (item.price * item.quantity) : 0;
      grandTotal += lineTotal;
      const sizeDisplay = item.hasNoSize ? '⚠️ NEEDS SIZE (VERIFY)' : item.size;
      const secTag = item.sectionTitle || item.section;
      bodyText += `[${secTag}] ${item.itemType} | Size: ${sizeDisplay} (${item.classVal}) | Part: ${item.partNumber || 'N/A'} | Qty: ${item.quantity} | Unit: $${item.price.toFixed(2)} | Total: $${lineTotal.toFixed(2)}\n`;
    });

    bodyText += `========================================================\n`;
    bodyText += `ESTIMATED GRAND TOTAL: $${grandTotal.toFixed(2)}\n\n`;
    bodyText += `Ship To:\nMountain Power - Helena Base\nSafety & PPE Operations\nHelena, MT\n\nThank you,\nSafety Department`;

    const mailtoUrl = `mailto:${encodeURIComponent(recipient)}?subject=${subject}&body=${encodeURIComponent(bodyText)}`;
    window.open(mailtoUrl, '_blank');
  }

  /**
   * Downloads formatted CSV for purchasing system import.
   */
  downloadPoCsv() {
    const activeItems = (this.items || []).filter(i => i.selected && i.quantity > 0);
    if (activeItems.length === 0) {
      alert('⚠️ No purchase items selected.');
      return;
    }

    const lines = ['Section,Item Category,Size,Class / KV,Part Number,Quantity,Unit Price,Subtotal,Assigned Personnel'];
    activeItems.forEach(i => {
      const sub = (i.price * i.quantity).toFixed(2);
      const checkedEmps = (i.employees || []).filter(e => e.checked).map(e => e.name || e.label);
      const emps = checkedEmps.length > 0 ? `"${checkedEmps.join('; ')}"` : '""';
      const sizeDisplay = i.hasNoSize ? '⚠️ Needs Size' : i.size;
      const secName = i.sectionTitle || i.section;
      lines.push(`"${secName}","${i.itemType}","${sizeDisplay}","${i.classVal}","${i.partNumber}",${i.quantity},$${i.price.toFixed(2)},$${sub},${emps}`);
    });

    const csvContent = lines.join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Purchase_Order_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }
}

// Attach globally
window.ProcurementEngine = ProcurementEngine;
