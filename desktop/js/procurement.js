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
    this.currentPOFormat = 'clean';
    this.generatedPOTexts = { clean: '', detailed: '' };
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
      },
      ordered_pending: {
        key: 'ordered_pending',
        title: 'Ordered — Awaiting Delivery',
        shortTitle: 'Ordered (Pending)',
        icon: '📦',
        badgeColor: 'rgba(16, 185, 129, 0.2)',
        badgeBorder: 'rgba(16, 185, 129, 0.4)',
        badgeText: '#34d399',
        headerBg: 'rgba(6, 78, 59, 0.95)',
        accentBorder: '#10b981',
        desc: 'Items placed on order with suppliers awaiting arrival, inspection & inventory assignment'
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
   * (checks manual exclusions and crew discipline exclusions)
   */
  isEmployeePpeExcluded(empName) {
    if (!empName) return false;
    if (window.ppeTrackingEngine && typeof window.ppeTrackingEngine.isEmployeeExcluded === 'function') {
      return window.ppeTrackingEngine.isEmployeeExcluded(empName);
    }
    // Fallback: check manual map
    try {
      const raw = localStorage.getItem('sa_ppe_excluded_employees');
      if (raw) {
        const arr = JSON.parse(raw);
        if (Array.isArray(arr)) {
          const norm = this.normalizeName(empName);
          if (arr.some(x => this.isNameMatch(this.normalizeName(x), norm))) return true;
        }
      }
    } catch { /* ignore */ }

    // Fallback: check crew discipline from db
    try {
      const snap = (this.db && typeof this.db.getSnapshot === 'function')
        ? this.db.getSnapshot()
        : (window.localDB ? window.localDB.getSnapshot() : null);
      const empTable = (this.db && typeof this.db.getTable === 'function' ? this.db.getTable('employees') : null) || snap?.tables?.['employees'];
      const jtTable = (this.db && typeof this.db.getTable === 'function' ? this.db.getTable('job_tracking') : null) || snap?.tables?.['job_tracking'];

      if (empTable && empTable.rows) {
        const norm = this.normalizeName(empName);
        const emp = empTable.rows.find(e => this.isNameMatch(this.normalizeName(e['Employee Name'] || e['Name'] || ''), norm));
        if (emp) {
          const jn = String(emp['Job Number'] || emp['Job #'] || '').replace(/\.\d+.*$/, '').trim();
          if (jn) {
            let crewType = '';
            if (jtTable && jtTable.rows) {
              const jt = jtTable.rows.find(j => {
                const jNum = String(j['Job Number'] || j['Job #'] || Object.values(j)[0] || '').replace(/\.\d+.*$/, '').trim();
                return jNum === jn;
              });
              if (jt && jt['Crew Type']) crewType = String(jt['Crew Type']).trim();
            }
            if (!crewType) {
              if (jn.startsWith('005')) crewType = 'Office';
              else crewType = 'Electric';
            }
            // Only Electric and Office require rubber PPE
            if (crewType !== 'Electric' && crewType !== 'Office') return true;
          }
        }
      }
    } catch { /* ignore */ }

    return false;
  }

  /**
   * Checks whether an employee was manually excluded from PPE tracking
   */
  isManualPpeExcluded(empName) {
    if (!empName) return false;
    try {
      const raw = localStorage.getItem('sa_ppe_excluded_employees');
      if (raw) {
        const arr = JSON.parse(raw);
        if (Array.isArray(arr)) {
          const norm = this.normalizeName(empName);
          if (arr.some(x => this.isNameMatch(this.normalizeName(x), norm))) return true;
        }
      }
    } catch { /* ignore */ }
    return false;
  }

  /**
   * Gets the crew discipline/type for an employee
   */
  getEmployeeCrewType(empName) {
    if (!empName) return 'Electric';
    if (window.ppeTrackingEngine && typeof window.ppeTrackingEngine.isEmployeeCrewDisciplineExcluded === 'function') {
      const check = window.ppeTrackingEngine.isEmployeeCrewDisciplineExcluded(empName);
      if (check && check.crewType) return check.crewType;
    }
    try {
      const snap = (this.db && typeof this.db.getSnapshot === 'function')
        ? this.db.getSnapshot()
        : (window.localDB ? window.localDB.getSnapshot() : null);
      const empTable = (this.db && typeof this.db.getTable === 'function' ? this.db.getTable('employees') : null) || snap?.tables?.['employees'];
      const jtTable = (this.db && typeof this.db.getTable === 'function' ? this.db.getTable('job_tracking') : null) || snap?.tables?.['job_tracking'];

      if (empTable && empTable.rows) {
        const norm = this.normalizeName(empName);
        const emp = empTable.rows.find(e => this.isNameMatch(this.normalizeName(e['Employee Name'] || e['Name'] || ''), norm));
        if (emp) {
          const rawJob = String(emp['Job Number'] || emp['Job #'] || '').trim();
          const jn = rawJob.replace(/\.\d+.*$/, '').trim();
          if (jtTable && jtTable.rows) {
            const jt = jtTable.rows.find(j => {
              const jNum = String(j['Job Number'] || j['Job #'] || Object.values(j)[0] || '').replace(/\.\d+.*$/, '').trim();
              return jNum === jn;
            });
            if (jt && jt['Crew Type']) return String(jt['Crew Type']).trim();
          }
          if (jn.startsWith('005')) return 'Office';
          const lower = (rawJob + ' ' + (emp['Location'] || '')).toLowerCase();
          if (lower.includes('sub') || lower.includes('substation')) return 'Substation';
          if (lower.includes('gas')) return 'Gas';
          if (lower.includes('mechanic') || lower.includes('shop')) return 'Mechanic';
          return 'Electric';
        }
      }
    } catch { /* ignore */ }
    return 'Electric';
  }

  escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  escapeJs(str) {
    if (!str) return '';
    return String(str)
      .replace(/\\/g, '\\\\')
      .replace(/'/g, "\\'")
      .replace(/"/g, '\\"')
      .replace(/\n/g, '\\n')
      .replace(/\r/g, '\\r');
  }

  cleanSize(val) {
    if (val === null || val === undefined) return '';
    const s = String(val).trim();
    const lower = s.toLowerCase();
    if (!s || s === '—' || s === '-' || lower === 'n/a' || lower === 'none' || lower === 'unknown' || lower === 'null') {
      return '';
    }
    return s;
  }

  isNeedToOrderStat(stat) {
    if (!stat) return false;
    const lower = String(stat).toLowerCase();
    return lower.includes('need to purchase') || lower.includes('purchase') || lower.includes('size up') || lower.includes('unassigned');
  }

  parseOrderInfoFromNotes(notesStr) {
    if (!notesStr) return null;
    const s = String(notesStr).trim();
    let orderNumber = '';
    let vendor = '';
    let orderDate = '';
    let price = 0;

    // Extract PO Number (e.g. "PO: 002-26", "PO #002-26", "Order #1234", "Order: 1234")
    // Use word boundaries so "Ordered" is never mistaken as "Order"
    const poMatch = s.match(/(?:\bpo\b|\border\b)\s*(?:#|num|number)?\s*[:#-]?\s*([A-Za-z0-9\-_.]+)/i);
    if (poMatch && !/^(?:on|by|at|for)$/i.test(poMatch[1])) {
      orderNumber = poMatch[1].trim();
    }

    // Extract Vendor
    const vMatch = s.match(/(?:vendor|from|supplier)\s*[:=]\s*([^,;·\n]+)/i);
    if (vMatch) vendor = vMatch[1].trim();

    // Extract Date (e.g. 10/12/2026 or 2026-10-12)
    const dMatch = s.match(/(?:date|ordered(?:\s*on)?)\s*[:=]?\s*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}|\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2})/i);
    if (dMatch) orderDate = dMatch[1].trim();

    // Extract Price
    const pMatch = s.match(/(?:price|cost|unit)\s*[:=]?\s*\$?\s*([\d,]+\.?\d{0,2})|\$\s*([\d,]+\.?\d{0,2})/i);
    if (pMatch) {
      const val = pMatch[1] || pMatch[2];
      price = parseFloat(val.replace(/,/g, '')) || 0;
    }

    // Extract Expected Delivery
    let expectedDelivery = '';
    const delivMatch = s.match(/(?:expected(?:\s*delivery)?|deliv(?:ery)?(?:\s*date)?|eta)\s*[:=]?\s*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}|\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2})/i);
    if (delivMatch) expectedDelivery = delivMatch[1].trim();

    return (orderNumber || vendor || orderDate || price || expectedDelivery) ? { orderNumber, vendor, orderDate, price, expectedDelivery } : null;
  }

  lookupOrderForEmployee(empName, itemType) {
    if (!empName) return null;
    const snap = (this.db && typeof this.db.getSnapshot === 'function')
      ? this.db.getSnapshot()
      : (window.localDB ? window.localDB.getSnapshot() : null);

    // 1. Check purchase_orders table for open orders
    const poTable = (this.db && typeof this.db.getTable === 'function' ? this.db.getTable('purchase_orders') : null) || snap?.tables?.['purchase_orders'];
    if (poTable && poTable.rows) {
      for (const po of poTable.rows) {
        const stat = String(po['Status'] || po['status'] || '').toLowerCase();
        if (stat.includes('received') || stat.includes('fulfilled') || stat.includes('cancel')) continue;
        const notes = String(po['Notes'] || '');
        const items = String(po['Items'] || '');
        if (this.isNameMatch(notes, empName) || this.isNameMatch(items, empName)) {
          return {
            orderNumber: String(po['PO Number'] || po['PO #'] || ''),
            vendor: String(po['Vendor'] || ''),
            orderDate: String(po['Date'] || ''),
            expectedDelivery: String(po['Expected Delivery'] || po['Delivery Date'] || ''),
            price: parseFloat(po['Total Price'] || po['Price'] || 0) || 0
          };
        }
      }
    }

    // 2. Check safety_equipment_needs table
    const needsTable = (this.db && typeof this.db.getTable === 'function' ? this.db.getTable('safety_equipment_needs') : null) || snap?.tables?.['safety_equipment_needs'];
    if (needsTable && needsTable.rows) {
      const match = needsTable.rows.find(r => {
        const emp = String(r['Employee'] || '').trim();
        const stat = String(r['Status'] || '').toLowerCase();
        const type = String(r['Item Type'] || '').toLowerCase();
        const isTypeMatch = !itemType || type.includes(itemType.toLowerCase().slice(0, 4));
        return this.isNameMatch(emp, empName) && stat.includes('ordered') && isTypeMatch;
      });
      if (match) {
        const parsed = this.parseOrderInfoFromNotes(match['Notes']);
        if (parsed) return parsed;
        return {
          orderNumber: '',
          vendor: '',
          orderDate: String(match['Date Requested'] || ''),
          expectedDelivery: '',
          price: 0
        };
      }
    }

    return null;
  }

  parsePoItemsString(itemsStr) {
    if (!itemsStr) return [];
    const result = [];
    const chunks = itemsStr.split(';').map(c => c.trim()).filter(Boolean);
    chunks.forEach(chunk => {
      let qty = 1;
      const qtyMatch = chunk.match(/^\((\d+)\)/) || chunk.match(/^(\d+)\s+x/i) || chunk.match(/^(\d+)\s+/);
      if (qtyMatch) {
        qty = parseInt(qtyMatch[1], 10) || 1;
      }

      let category = 'Gloves';
      const lower = chunk.toLowerCase();
      if (lower.includes('sleeve')) category = 'Sleeves';
      else if (lower.includes('blanket')) category = 'Blankets';
      else if (lower.includes('mack')) category = 'MACKs';
      else if (lower.includes('glove')) category = 'Gloves';
      else if (lower.includes('tester')) category = 'HV Testers';
      else if (lower.includes('phasing')) category = 'Phasing Sets';
      else if (lower.includes('ground')) category = 'Grounds';
      else if (lower.includes('stick')) category = 'Hot Sticks';
      else if (lower.includes('aed')) category = 'AED';

      let classVal = 'Class 2';
      const classMatch = chunk.match(/(?:class|cl)\s*([0-4])/i);
      if (classMatch) {
        classVal = `Class ${classMatch[1]}`;
      } else if (category === 'Blankets' || category === 'MACKs') {
        classVal = 'Class 4';
      }

      let size = 'Standard';
      // Match explicit "size 9.5" or standalone sizes like "CL2 9.5", "10", "Regular", "Split"
      const sizeMatch = chunk.match(/size\s*[:\s]*([0-9.]+|regular|small|large|x-large|2x-large|lg|xl|2xl|xxl|split)/i) ||
                        chunk.match(/\b(8\.5|9\.5|10\.5|11\.5|[89]|10|11|12)\b/) ||
                        chunk.match(/\b(regular|large|x-large|2x-large|small|split)\b/i);
      if (sizeMatch) {
        size = sizeMatch[1].trim();
      }

      let unitPrice = 0;
      const priceMatch = chunk.match(/@\s*\$?\s*([\d,]+\.?\d{0,2})/);
      if (priceMatch) {
        unitPrice = parseFloat(priceMatch[1].replace(/,/g, '')) || 0;
      }

      let employeeName = '';
      const forMatch = chunk.match(/(?:\[|\()?\bfor\s*[:=]?\s*([A-Za-z\s.'-]+?)(?:\]|\)|;|$)/i);
      if (forMatch && !/^(?:mountain|power|stock|operations|shelf|replenishment)$/i.test(forMatch[1].trim())) {
        employeeName = forMatch[1].trim();
      }

      result.push({
        quantity: qty,
        category: category,
        classVal: classVal,
        size: size,
        unitPrice: unitPrice,
        employeeName: employeeName
      });
    });
    return result;
  }

  suggestNextItemNumber(category) {
    const cat = String(category || '').toLowerCase();
    let tableKey = 'gloves';
    let prefix = '';
    let defaultStart = 1001;

    if (cat.includes('glove')) {
      tableKey = 'gloves';
      defaultStart = 2000;
    } else if (cat.includes('sleeve')) {
      tableKey = 'sleeves';
      defaultStart = 3000;
    } else if (cat.includes('blanket')) {
      tableKey = 'blankets';
      prefix = 'B';
      defaultStart = 100;
    } else if (cat.includes('mack')) {
      tableKey = 'macks';
      prefix = 'M';
      defaultStart = 1;
    } else if (cat.includes('hv') || cat.includes('tester')) {
      tableKey = 'hv_testers';
      prefix = 'HV';
      defaultStart = 1;
    } else if (cat.includes('phasing')) {
      tableKey = 'phasing_sets';
      prefix = 'PS';
      defaultStart = 1;
    } else if (cat.includes('ground')) {
      tableKey = 'grounds';
      prefix = 'GR';
      defaultStart = 1;
    } else if (cat.includes('hot') || cat.includes('stick')) {
      tableKey = 'hot_sticks';
      prefix = 'HS';
      defaultStart = 1;
    } else if (cat.includes('aed')) {
      tableKey = 'aed';
      prefix = 'AED';
      defaultStart = 1;
    }

    const table = (this.db && typeof this.db.getTable === 'function' ? this.db.getTable(tableKey) : null) || (window.localDB ? window.localDB.getTable(tableKey) : null);
    if (!table) return prefix ? `${prefix}${defaultStart}` : String(defaultStart);

    const rows = table.rows || table.rawGrid || [];
    let maxNum = defaultStart - 1;

    rows.forEach(r => {
      let numStr = '';
      if (Array.isArray(r)) {
        numStr = String(r[0] || '').trim();
      } else if (r && typeof r === 'object') {
        numStr = String(r['Item #'] || r['Item Number'] || r['Serial #'] || r['Glove'] || r['Sleeve'] || r['Blanket'] || r['MACK'] || Object.values(r)[0] || '').trim();
      }
      if (!numStr) return;
      const digits = numStr.replace(/^[A-Za-z#\s\-_]+/, '').trim();
      const parsed = parseInt(digits, 10);
      if (!isNaN(parsed) && parsed > maxNum) {
        maxNum = parsed;
      }
    });

    const nextVal = maxNum + 1;
    return prefix ? `${prefix}${nextVal}` : String(nextVal);
  }

  async syncVendorPrice(vendorName, itemCategory, size, classVal, newPrice) {
    if (!vendorName || !newPrice || isNaN(newPrice) || newPrice <= 0) return false;
    const vNorm = String(vendorName).trim().toLowerCase();
    let vendor = this.vendors.find(v => (v.name || '').trim().toLowerCase() === vNorm);
    if (!vendor) {
      vendor = {
        name: vendorName.trim(),
        contact: '',
        email: '',
        phone: '',
        notes: '',
        items: []
      };
      this.vendors.push(vendor);
    }
    if (!vendor.items) vendor.items = [];

    const tClassNum = (classVal || '').replace(/[^0-9]/g, '').trim();
    const tType = (itemCategory || '').toLowerCase();
    const tSize = (size || '').toLowerCase().trim();

    let matchedItem = null;
    if (tSize && tSize !== '—' && !tSize.includes('needs size')) {
      matchedItem = vendor.items.find(ci => {
        const name = (ci.item || '').toLowerCase();
        const typeMatch = name.includes(tType.slice(0, 4));
        const classMatch = !tClassNum || name.includes(`class ${tClassNum}`) || name.includes(`cl${tClassNum}`);
        const sizeMatch = name.includes(tSize);
        return typeMatch && classMatch && sizeMatch;
      });
    }
    if (!matchedItem) {
      matchedItem = vendor.items.find(ci => {
        const name = (ci.item || '').toLowerCase();
        const typeMatch = name.includes(tType.slice(0, 4));
        const classMatch = !tClassNum || name.includes(`class ${tClassNum}`) || name.includes(`cl${tClassNum}`);
        return typeMatch && classMatch;
      });
    }

    let updated = false;
    if (matchedItem) {
      if (Math.abs(matchedItem.price - newPrice) > 0.009) {
        matchedItem.price = newPrice;
        updated = true;
      }
    } else {
      const itemName = `${classVal ? classVal + ' ' : ''}${itemCategory}${size && size !== '—' && !size.includes('Needs') ? ' Size ' + size : ''}`.trim();
      vendor.items.push({
        item: itemName,
        itemNumber: '',
        price: newPrice
      });
      updated = true;
    }

    if (updated) {
      console.log(`[Procurement] Auto-synced vendor price for ${vendorName} - ${itemCategory} ${classVal} ${size}: $${newPrice}`);
      await this.saveVendorsToDB(true);
      if (this.selectedVendor && this.selectedVendor.name.toLowerCase() === vNorm) {
        this.updatePricing();
      }
    }
    return updated;
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
      let s = String(val).trim();
      const lower = s.toLowerCase();
      if (!s || s === '—' || s === '-' || lower === 'n/a' || lower === 'none' || lower === 'unknown' || lower === 'null') {
        return '';
      }
      // Strip parenthetical class or notes, e.g. "8 (Class 0)" -> "8", "12 (Class 2)" -> "12"
      s = s.replace(/\s*\([^)]*\)/g, '').trim();
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
    const blanketsTable = (this.db && typeof this.db.getTable === 'function' ? this.db.getTable('blankets') : null) || snap?.tables?.['blankets'];
    const macksTable = (this.db && typeof this.db.getTable === 'function' ? this.db.getTable('macks') : null) || snap?.tables?.['macks'];

    const getInventoryItemSize = (type, itemNum) => {
      if (!itemNum || itemNum === '—' || itemNum === '-') return '';
      const cleanNum = String(itemNum).trim().replace(/^[#]/, '');
      if (!cleanNum || cleanNum.toLowerCase() === 'none') return '';

      let table = null;
      if (type === 'Gloves') table = glovesTable;
      else if (type === 'Sleeves') table = sleevesTable;
      else if (type === 'Blankets') table = blanketsTable;
      else if (type === 'MACKs') table = macksTable;

      if (!table) return '';
      const rows = table.rows || table.rawGrid || [];
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        let num = '';
        let itemSz = '';
        if (Array.isArray(r)) {
          num = String(r[0] || '').trim();
          if (type === 'Blankets') {
            itemSz = String(r[1] || '').trim();
          } else {
            itemSz = String(r[2] || '').trim();
          }
        } else if (r && typeof r === 'object') {
          num = String(r['Item #'] || r['Item'] || r['Glove'] || r['Sleeve'] || r['Blanket'] || r['MACK'] || r['Serial #'] || r['ESL ID'] || Object.values(r)[0] || '').trim();
          itemSz = String(r['Size'] || r['Type'] || '').trim();
        }
        if (num) {
          const cleanRNum = num.replace(/^[#]/, '').trim();
          if (cleanRNum.toLowerCase() === cleanNum.toLowerCase()) {
            return cleanSize(itemSz);
          }
          const pNum = parseInt(cleanRNum, 10);
          const pClean = parseInt(cleanNum, 10);
          if (!isNaN(pNum) && !isNaN(pClean) && pNum === pClean && String(pNum) === cleanRNum && String(pClean) === cleanNum) {
            return cleanSize(itemSz);
          }
        }
      }
      return '';
    };

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

    const addItem = (section, itemType, typeLabel, size, hasNoSize, classVal, empLabel, minDaysLeft, isImmediate, orderInfo = null) => {
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
          price: (orderInfo && orderInfo.price) ? parseFloat(orderInfo.price) : 0,
          partNumber: '',
          orderInfo: orderInfo || null
        };
      }

      if (orderInfo && !aggregated[aggKey].orderInfo) {
        aggregated[aggKey].orderInfo = orderInfo;
        if (orderInfo.price && !aggregated[aggKey].price) {
          aggregated[aggKey].price = parseFloat(orderInfo.price) || 0;
        }
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
            checked: true,
            orderInfo: orderInfo || null
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
          if (s.type === 'MACKs') {
            size = String(row[3] || '—').trim();
            daysRaw = String(row[7] || '').trim();
            pickItem = String(row[8] || '').trim();
            status = String(row[9] || '').trim();
          } else {
            size = String(row[2] || '—').trim();
            daysRaw = String(row[5] || '').trim();
            pickItem = String(row[6] || '').trim();
            status = String(row[7] || '').trim();
          }
          const daysVal = parseInt(daysRaw, 10);
          if (!isNaN(daysVal)) daysLeft = daysVal;

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
          pickItem = String(row['Pick List Item #'] || row['Pick Item #'] || row['Pick Item'] || row['Pick List'] || row['Picked For'] || '').trim();
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

        // Check if item is already ordered (awaiting delivery)
        if (statLower.includes('ordered')) {
          if (this.isDepartedOrPreviousEmployee(emp)) return;
          const notesText = Array.isArray(row) ? String(row[11] || '') : String(row['Notes'] || '');
          const orderInfo = this.parseOrderInfoFromNotes(status) ||
                            this.parseOrderInfoFromNotes(notesText) ||
                            this.lookupOrderForEmployee(emp, s.type) ||
                            { orderNumber: '', vendor: '', orderDate: '', price: 0 };
          const validRowSize = cleanSize(size);
          const empRec = getEmpRecord(emp);
          let neededSize = validRowSize;
          if (!neededSize && !isShelfStock) {
            const prefSize = s.type === 'Gloves' ? cleanSize(empRec?.gloveSize) : (s.type === 'Sleeves' ? cleanSize(empRec?.sleeveSize) : '');
            neededSize = prefSize || 'Standard';
          }
          if (!neededSize && isShelfStock) neededSize = 'Standard';

          let poLabel = orderInfo.orderNumber ? `PO: ${orderInfo.orderNumber}` : 'Ordered';
          if (orderInfo.vendor) poLabel += ` · ${orderInfo.vendor}`;
          const empLabel = `${emp} (📦 ${poLabel})`;

          addItem('ordered_pending', s.type, s.label, neededSize, false, rowClass, empLabel, daysLeft, isImmediateRow, orderInfo);
          markCovered(s.type, emp);
          return;
        }

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

        // Exclude personnel on Gas and Mechanic crews from generating glove and sleeve purchase needs.
        // Electric, Office, AND Substation employees assigned an item that is out of stock or size up are included!
        if ((s.type === 'Gloves' || s.type === 'Sleeves') && !isShelfStock) {
          const crewType = this.getEmployeeCrewType(emp);
          if (crewType === 'Gas' || crewType === 'Mechanic') {
            return;
          }
          if (this.isManualPpeExcluded(emp)) {
            return;
          }
        }

        const empRec = getEmpRecord(emp);

        if (isSizeUp) {
          // Requirement 2: Swaps Page Size Up Replacements
          const prefSize = s.type === 'Gloves' ? cleanSize(empRec?.gloveSize) : (s.type === 'Sleeves' ? cleanSize(empRec?.sleeveSize) : '');
          const validRowSize = cleanSize(size);
          const neededSize = prefSize || validRowSize || '⚠️ Needs Size';
          const hasNoSize = (neededSize === '⚠️ Needs Size');

          // Resolve actual size of the picked item from inventory
          let pickedSize = getInventoryItemSize(s.type, pickItem);
          if (!pickedSize) {
            if (s.type === 'Gloves') {
              const n = parseFloat(neededSize);
              if (!isNaN(n)) pickedSize = String(n + 0.5);
            } else if (s.type === 'Sleeves') {
              const sleeveNext = {
                'small': 'Regular', 'sm': 'Regular',
                'regular': 'Large', 'reg': 'Large',
                'large': 'X-Large', 'lg': 'X-Large',
                'extra large': '2X-Large', 'xl': '2X-Large'
              };
              pickedSize = sleeveNext[neededSize.toLowerCase()] || '';
            }
          }
          if (!pickedSize || pickedSize === neededSize) {
            if (s.type === 'Gloves') {
              const n = parseFloat(neededSize);
              if (!isNaN(n)) pickedSize = String(n + 0.5);
            }
            if (!pickedSize) pickedSize = 'Size Up';
          }

          const cleanPickNum = String(pickItem || '').trim().replace(/^[#]/, '');
          const hasValidPickNum = cleanPickNum && cleanPickNum !== '—' && cleanPickNum !== '-' && cleanPickNum.toLowerCase() !== 'none';
          const itemTag = hasValidPickNum ? ` (#${cleanPickNum})` : '';

          const empLabel = hasNoSize
            ? `${emp} (Size Up Picked: ${pickedSize}${itemTag} ⚠️ Needs Size)`
            : `${emp} (Size Up Picked: ${pickedSize}${itemTag} → Needed: ${neededSize})`;

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

        if (status.includes('ordered')) {
          if (this.isDepartedOrPreviousEmployee(emp)) return;
          const orderInfo = this.parseOrderInfoFromNotes(row['Notes']) ||
                            this.lookupOrderForEmployee(emp, itemType) ||
                            { orderNumber: '', vendor: '', orderDate: '', price: 0 };
          let poLabel = orderInfo.orderNumber ? `PO: ${orderInfo.orderNumber}` : 'Ordered';
          if (orderInfo.vendor) poLabel += ` · ${orderInfo.vendor}`;
          const empLabel = `${emp} (📦 ${poLabel})`;
          addItem('ordered_pending', itemType, typeLabel, cleanSize(size) || 'Standard', false, rowClass, empLabel, 15, false, orderInfo);
          markCovered(itemType, emp);
          return;
        }

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
    // SECTION: ACTIVE PURCHASE ORDERS (Open POs Awaiting Delivery)
    // =========================================================================
    const poTable = (this.db && typeof this.db.getTable === 'function' ? this.db.getTable('purchase_orders') : null) || snap?.tables?.['purchase_orders'];
    if (poTable) {
      const poRows = poTable.rows || poTable.rawGrid || [];
      poRows.forEach(poRow => {
        let poNum = '';
        let vendor = '';
        let dateStr = '';
        let itemsStr = '';
        let totalPrice = 0;
        let expDeliv = '';
        let status = '';
        let notes = '';

        if (Array.isArray(poRow)) {
          if (String(poRow[0] || '').toLowerCase() === 'date') return;
          dateStr = String(poRow[0] || '').trim();
          poNum = String(poRow[1] || '').trim();
          vendor = String(poRow[2] || '').trim();
          itemsStr = String(poRow[3] || '').trim();
          totalPrice = parseFloat(poRow[4]) || 0;
          expDeliv = String(poRow[5] || '').trim();
          status = String(poRow[6] || '').trim().toLowerCase();
          notes = String(poRow[7] || '').trim();
        } else if (poRow && typeof poRow === 'object') {
          dateStr = String(poRow['Date'] || '').trim();
          poNum = String(poRow['PO Number'] || poRow['PO #'] || '').trim();
          vendor = String(poRow['Vendor'] || '').trim();
          itemsStr = String(poRow['Items'] || '').trim();
          totalPrice = parseFloat(poRow['Total Price'] || poRow['Price'] || 0) || 0;
          expDeliv = String(poRow['Expected Delivery'] || '').trim();
          status = String(poRow['Status'] || '').trim().toLowerCase();
          notes = String(poRow['Notes'] || '').trim();
        }

        if (!status || status.includes('received') || status.includes('fulfilled') || status.includes('cancel')) {
          return;
        }

        const parsedItems = this.parsePoItemsString(itemsStr);
        parsedItems.forEach(pi => {
          const normSize = cleanSize(pi.size) || 'Standard';
          const aggKey = `ordered_pending|${pi.category}|${normSize}|${pi.classVal}`;
          const currentQty = aggregated[aggKey] ? aggregated[aggKey].quantity : 0;
          if (currentQty < pi.quantity) {
            const neededQty = pi.quantity - currentQty;
            const typeLabel = pi.category === 'Gloves' ? '🧤 Gloves' : (pi.category === 'Sleeves' ? '🦺 Sleeves' : (pi.category === 'Blankets' ? '🧱 Blankets' : (pi.category === 'MACKs' ? '🧱 MACKs' : `📦 ${pi.category}`)));
            const orderInfo = {
              orderNumber: poNum,
              vendor: vendor,
              orderDate: dateStr,
              expectedDelivery: expDeliv || '',
              price: pi.unitPrice || (totalPrice / (pi.quantity || 1))
            };

            let empForPo = pi.employeeName || '';
            if (!empForPo && notes) {
              const notesEmpMatch = notes.match(/(?:for|assign(?:ed)?\s*to)\s*[:=]?\s*([A-Za-z\s.'-]+?)(?:;|,|\.|$)/i);
              if (notesEmpMatch && !/^(?:mountain|power|stock|operations|shelf|replenishment)$/i.test(notesEmpMatch[1].trim())) {
                empForPo = notesEmpMatch[1].trim();
              }
            }

            for (let q = 0; q < neededQty; q++) {
              const label = empForPo ? `${empForPo} (📦 PO: ${poNum || 'Pending'})` : `Stock Order (PO: ${poNum || 'Pending'} · ${vendor || 'Vendor'})`;
              addItem('ordered_pending', pi.category, typeLabel, normSize, false, pi.classVal, label, 15, false, orderInfo);
            }
          }
        });
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
      'ordered_pending': 1,
      'swaps_need': 2,
      'swaps_size_up': 3,
      'assigned_size_up': 4,
      'compliance_missing': 5
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

  getSectionTabsHtml(activeFilter = 'all', counts = null) {
    const c = counts || {
      all: this.items ? this.items.length : 0,
      needs: this.items ? this.items.filter(i => i.section !== 'ordered_pending').length : 0,
      ordered_pending: this.items ? this.items.filter(i => i.section === 'ordered_pending').length : 0,
      swaps_need: this.items ? this.items.filter(i => i.section === 'swaps_need').length : 0,
      swaps_size_up: this.items ? this.items.filter(i => i.section === 'swaps_size_up').length : 0,
      assigned_size_up: this.items ? this.items.filter(i => i.section === 'assigned_size_up').length : 0,
      compliance_missing: this.items ? this.items.filter(i => i.section === 'compliance_missing').length : 0
    };

    return `
      <!-- Section Filter Tabs Bar -->
      <div class="procurement-section-tabs" style="display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 14px; align-items: center; padding-bottom: 10px; border-bottom: 1px solid var(--border-color);">
        <span style="font-size: 12px; color: var(--text-muted); font-weight: 700; margin-right: 4px;">VIEW SECTION:</span>
        <button type="button" class="btn ${activeFilter === 'all' ? 'btn-primary' : 'btn-secondary'}" style="font-size: 11.5px; padding: 4px 10px; display: inline-flex; align-items: center; gap: 6px;" onclick="window.procurementEngine.setSectionFilter('all')">
          <span>📋 All Needs & Orders</span>
          <span style="background: rgba(255,255,255,0.15); padding: 1px 6px; border-radius: 10px; font-size: 10.5px;">${c.all}</span>
        </button>
        <button type="button" class="btn ${activeFilter === 'needs' ? 'btn-primary' : 'btn-secondary'}" style="font-size: 11.5px; padding: 4px 10px; display: inline-flex; align-items: center; gap: 6px;" onclick="window.procurementEngine.setSectionFilter('needs')">
          <span>🛒 Needs to Order</span>
          <span style="background: rgba(255,255,255,0.15); padding: 1px 6px; border-radius: 10px; font-size: 10.5px;">${c.needs}</span>
        </button>
        <button type="button" class="btn ${activeFilter === 'ordered_pending' ? 'btn-primary' : 'btn-secondary'}" style="font-size: 11.5px; padding: 4px 10px; display: inline-flex; align-items: center; gap: 6px; border-color: #10b981; color: ${activeFilter === 'ordered_pending' ? '#fff' : '#6ee7b7'};" onclick="window.procurementEngine.setSectionFilter('ordered_pending')">
          <span>📦 Ordered (Awaiting Delivery)</span>
          <span style="background: rgba(16,185,129,0.25); padding: 1px 6px; border-radius: 10px; font-size: 10.5px; color: #34d399; font-weight: 700;">${c.ordered_pending}</span>
        </button>
        <button type="button" class="btn ${activeFilter === 'history' ? 'btn-primary' : 'btn-secondary'}" style="font-size: 11.5px; padding: 4px 10px; display: inline-flex; align-items: center; gap: 6px; ${activeFilter === 'history' ? 'border-color: #38bdf8; color: #fff;' : ''}" onclick="window.procurementEngine.setSectionFilter('history')">
          <span>📜 Orders Tracking & History</span>
        </button>
        <button type="button" class="btn ${activeFilter === 'swaps_need' ? 'btn-primary' : 'btn-secondary'}" style="font-size: 11.5px; padding: 4px 10px; display: inline-flex; align-items: center; gap: 6px;" onclick="window.procurementEngine.setSectionFilter('swaps_need')">
          <span>🛒 Swaps: Need</span>
          <span style="background: rgba(255,255,255,0.15); padding: 1px 6px; border-radius: 10px; font-size: 10.5px;">${c.swaps_need}</span>
        </button>
        <button type="button" class="btn ${activeFilter === 'swaps_size_up' ? 'btn-primary' : 'btn-secondary'}" style="font-size: 11.5px; padding: 4px 10px; display: inline-flex; align-items: center; gap: 6px;" onclick="window.procurementEngine.setSectionFilter('swaps_size_up')">
          <span>🔄 Swaps: Size Up</span>
          <span style="background: rgba(255,255,255,0.15); padding: 1px 6px; border-radius: 10px; font-size: 10.5px;">${c.swaps_size_up}</span>
        </button>
        <button type="button" class="btn ${activeFilter === 'assigned_size_up' ? 'btn-primary' : 'btn-secondary'}" style="font-size: 11.5px; padding: 4px 10px; display: inline-flex; align-items: center; gap: 6px;" onclick="window.procurementEngine.setSectionFilter('assigned_size_up')">
          <span>⚠️ Assigned: Size Up</span>
          <span style="background: rgba(255,255,255,0.15); padding: 1px 6px; border-radius: 10px; font-size: 10.5px;">${c.assigned_size_up}</span>
        </button>
        <button type="button" class="btn ${activeFilter === 'compliance_missing' ? 'btn-primary' : 'btn-secondary'}" style="font-size: 11.5px; padding: 4px 10px; display: inline-flex; align-items: center; gap: 6px;" onclick="window.procurementEngine.setSectionFilter('compliance_missing')">
          <span>🛡️ Missing Equipment</span>
          <span style="background: rgba(255,255,255,0.15); padding: 1px 6px; border-radius: 10px; font-size: 10.5px;">${c.compliance_missing}</span>
        </button>
      </div>
    `;
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

    // Filter items based on active section filter
    const activeFilter = this.currentSectionFilter || 'all';

    // Calculate section counts
    const counts = {
      all: this.items.length,
      needs: this.items.filter(i => i.section !== 'ordered_pending').length,
      ordered_pending: this.items.filter(i => i.section === 'ordered_pending').length,
      swaps_need: this.items.filter(i => i.section === 'swaps_need').length,
      swaps_size_up: this.items.filter(i => i.section === 'swaps_size_up').length,
      assigned_size_up: this.items.filter(i => i.section === 'assigned_size_up').length,
      compliance_missing: this.items.filter(i => i.section === 'compliance_missing').length
    };

    const tabsHtml = this.getSectionTabsHtml(activeFilter, counts);

    // If History tab is selected, render dedicated purchase orders history view with tabs preserved
    if (activeFilter === 'history') {
      this.renderOrdersHistory(container, tabsHtml);
      return;
    }

    if (this.items.length === 0) {
      container.innerHTML = tabsHtml + `
        <div style="padding: 40px; text-align: center; color: var(--text-muted);">
          <div style="font-size: 32px; margin-bottom: 8px;">✅</div>
          <h3 style="color: var(--text-primary); font-size: 16px;">All Equipment In Stock</h3>
          <p style="margin-top: 6px; font-size: 13px;">No items currently require purchase across swap sheets, assignments, or compliance.</p>
        </div>
      `;
      this.updateTotals();
      return;
    }

    let displayItems = this.items;
    if (activeFilter === 'needs') {
      displayItems = this.items.filter(i => i.section !== 'ordered_pending');
    } else if (activeFilter !== 'all') {
      displayItems = this.items.filter(i => i.section === activeFilter);
    }

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

    let html = tabsHtml + `
      <table class="table" style="width: 100%; border-collapse: collapse; font-size: 13px;">
        <thead>
          <tr style="background: rgba(255,255,255,0.05); border-bottom: 2px solid var(--border-color);">
            <th style="padding: 10px; width: 40px; text-align: center;"><input type="checkbox" id="procurement-select-all" checked title="Select or deselect all items"></th>
            <th style="padding: 10px; text-align: left;">Category & Item</th>
            <th style="padding: 10px; text-align: center; width: 95px;">Size</th>
            <th style="padding: 10px; text-align: center; width: 90px;">Class / KV</th>
            <th style="padding: 10px; text-align: center; width: 80px;">Qty</th>
            <th style="padding: 10px; text-align: center; width: 145px;">Urgency / Status</th>
            <th style="padding: 10px; text-align: right; width: 95px;">Unit Price</th>
            <th style="padding: 10px; text-align: right; width: 105px;">Est. Total</th>
            <th style="padding: 10px; text-align: center; width: 90px;">Action</th>
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
          <td colspan="8" style="padding: 10px 12px;">
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
                      ${item.section === 'ordered_pending'
                        ? (emp.name.toLowerCase().includes('stock')
                            ? '📦 Stock Order (Replenishment)'
                            : (emp.name.toLowerCase().includes('shelf')
                                ? '📦 On Shelf (Safety Stock)'
                                : `👤 Ordered for: <strong style="color: #60a5fa;">${emp.name}</strong>`))
                        : `👤 ${emp.name}`}
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
                  ${item.section === 'ordered_pending' ? '📦 Ordered' : item.timeframe}
                </td>
                <td style="padding: 6px 8px; text-align: right; font-family: monospace; font-size: 11.5px; color: var(--text-muted);">
                  ${item.price > 0 ? `$${item.price.toFixed(2)}` : '—'}
                </td>
                <td style="padding: 6px 8px; text-align: right; font-family: monospace; font-size: 11.5px; color: ${emp.checked && item.price > 0 ? '#4ade80' : 'var(--text-muted)'}; font-weight: ${emp.checked ? '600' : 'normal'};">
                  ${empTotal}
                </td>
                <td style="padding: 6px 8px; text-align: center;">
                  ${item.section === 'ordered_pending' ? `
                    <button type="button" class="btn btn-xs" onclick="window.procurementEngine.openDeliverForEmployee('${this.escapeJs(emp.name)}', '${this.escapeJs(item.itemType)}', '${this.escapeJs(item.size)}')" style="background: rgba(59, 130, 246, 0.15); border: 1px solid rgba(59, 130, 246, 0.35); color: #93c5fd; padding: 2px 6px; font-size: 10.5px; border-radius: 3px; cursor: pointer;">
                      <span>🚚</span> Deliver
                    </button>
                  ` : `
                    <button type="button" class="btn btn-xs" onclick="window.procurementEngine.openMarkOrderedModal([{ ...window.procurementEngine.items[${item._globalIdx}], quantity: 1, employees: [{ name: '${this.escapeJs(emp.name)}', label: '${this.escapeJs(emp.label)}', checked: true }] }])" style="background: rgba(16, 185, 129, 0.15); border: 1px solid rgba(16, 185, 129, 0.35); color: #6ee7b7; padding: 2px 6px; font-size: 10.5px; border-radius: 3px; cursor: pointer;">
                      <span>📦</span> Order
                    </button>
                  `}
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
              ${item.section === 'ordered_pending' && item.orderInfo ? `
                <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-top: 4px; font-size: 11px;">
                  <span class="badge" style="background: rgba(16, 185, 129, 0.2); color: #34d399; border: 1px solid rgba(16, 185, 129, 0.4); font-weight: 700; padding: 2px 6px; border-radius: 4px;">
                    PO: ${this.escapeHtml(item.orderInfo.orderNumber || 'Pending')}
                  </span>
                  ${item.orderInfo.vendor ? `<span style="color: #cbd5e1; font-weight: 600;">🏢 ${this.escapeHtml(item.orderInfo.vendor)}</span>` : ''}
                  ${item.orderInfo.orderDate ? `<span style="color: #94a3b8;">📅 Ordered: <strong>${this.escapeHtml(item.orderInfo.orderDate)}</strong></span>` : ''}
                  ${item.orderInfo.expectedDelivery && item.orderInfo.expectedDelivery !== 'Pending' ? `<span style="color: #38bdf8;">🚚 Est. Delivery: <strong>${this.escapeHtml(item.orderInfo.expectedDelivery)}</strong></span>` : ''}
                </div>
              ` : (item.partNumber ? `<div style="font-size: 11px; color: #3b82f6; margin-top: 1px;">PN: ${item.partNumber}</div>` : (item.orderInfo?.orderNumber ? `<div style="font-size: 11px; color: #34d399; margin-top: 1px; font-weight: 600;">PO: ${this.escapeHtml(item.orderInfo.orderNumber)}${item.orderInfo.vendor ? ' · ' + this.escapeHtml(item.orderInfo.vendor) : ''}</div>` : ''))}
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
              ${item.section === 'ordered_pending' ? `
                <span class="badge" style="background: rgba(16, 185, 129, 0.2); color: #34d399; border: 1px solid rgba(16, 185, 129, 0.4); font-size: 11px; font-weight: 700; padding: 3px 8px; border-radius: 4px;">
                  📦 Ordered
                </span>
              ` : `
                <span class="badge ${item.priority === 'HIGH' ? 'badge-danger' : (item.priority === 'MEDIUM' ? 'badge-warning' : 'badge-success')}">
                  ${item.priorityEmoji} ${item.timeframe}
                </span>
              `}
            </td>
            <td style="padding: 8px; text-align: right; font-family: monospace;">
              ${item.price > 0 ? `$${item.price.toFixed(2)}` : '—'}
            </td>
            <td style="padding: 8px; text-align: right; font-weight: 600; font-family: monospace;">
              ${totalCost > 0 ? `$${totalCost.toFixed(2)}` : '—'}
            </td>
            <td style="padding: 8px; text-align: center;">
              ${item.section === 'ordered_pending' ? `
                <button type="button" class="btn btn-xs" onclick="window.procurementEngine.openBatchDeliveryModal([window.procurementEngine.items[${item._globalIdx}]])" style="background: rgba(59, 130, 246, 0.15); border: 1px solid rgba(59, 130, 246, 0.4); color: #93c5fd; padding: 3px 8px; font-size: 11px; border-radius: 3px; cursor: pointer; display: inline-flex; align-items: center; gap: 4px;" title="Receive this delivered item into inventory">
                  <span>🚚</span> Deliver
                </button>
              ` : `
                <button type="button" class="btn btn-xs" onclick="window.procurementEngine.openMarkOrderedModal([window.procurementEngine.items[${item._globalIdx}]])" style="background: rgba(16, 185, 129, 0.15); border: 1px solid rgba(16, 185, 129, 0.4); color: #6ee7b7; padding: 3px 8px; font-size: 11px; border-radius: 3px; cursor: pointer; display: inline-flex; align-items: center; gap: 4px;" title="Mark this item as Ordered">
                  <span>📦</span> Order
                </button>
              `}
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

  /**
   * Calculates the current fiscal year PO number prefix (002-XX).
   * Fiscal year runs October 1 to September 30 (e.g., Oct 2026 starts FY27 -> 002-27).
   */
  getPurchaseOrderNumber() {
    // 1. Check window.fiscalYearManager if initialized
    if (window.fiscalYearManager && window.fiscalYearManager.currentFY) {
      return `002-${window.fiscalYearManager.currentFY}`;
    }
    // 2. Check snapshot system config or metadata
    const snap = (this.db && typeof this.db.getSnapshot === 'function')
      ? this.db.getSnapshot()
      : (window.localDB ? window.localDB.getSnapshot() : null);
    if (snap?.metadata?.CURRENT_FISCAL_YEAR) {
      return `002-${snap.metadata.CURRENT_FISCAL_YEAR}`;
    }
    // 3. Fiscal Year starts Oct 1: Month >= 9 (October) transitions to next calendar year suffix (e.g. Oct 2026 -> FY27 -> 002-27)
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth(); // 0-indexed: 9 = October
    const fyYear = month >= 9 ? year + 1 : year;
    return `002-${String(fyYear).slice(-2)}`;
  }

  /**
   * Returns the primary shop & warehouse delivery shipping address.
   */
  getShippingAddress() {
    return '606 West Custer Ave, Helena, MT, 59602';
  }

  /**
  * Builds clean, consolidated purchase order text formatted specifically for sending to suppliers.
  * Consolidates identical items by type, size, class, and part number, omitting internal section names and worker names.
  */
  buildCleanPOText(selected) {
    const poNum = this.getPurchaseOrderNumber();
    const vendorName = this.selectedVendor ? this.selectedVendor.name : '[Vendor Name]';
    const dateStr = new Date().toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
    const shipTo = this.getShippingAddress();

    let lines = [];
    lines.push(`PURCHASE ORDER: ${poNum}`);
    lines.push(`Date: ${dateStr}`);
    lines.push(`Vendor: ${vendorName}`);
    if (this.selectedVendor && this.selectedVendor.email) {
      const contactPart = this.selectedVendor.contact ? `${this.selectedVendor.contact} ` : '';
      lines.push(`Attn: ${contactPart}(${this.selectedVendor.email})`);
    }
    lines.push(`Ship To: ${shipTo}`);
    lines.push('----------------------------------------------------');
    lines.push('Please fulfill the following order:\n');

    // Consolidate identical items by itemType, normalized size, class, partNumber, and unit price
    const consolidatedMap = new Map();

    const formatClassStr = (classVal) => {
      if (!classVal) return '';
      const s = String(classVal).trim();
      return /^class\b/i.test(s) ? s : `Class ${s}`;
    };

    const cleanSizeStr = (sizeVal, hasNoSize) => {
      if (hasNoSize) return '⚠️ NEEDS SIZE (VERIFY WITH WORKER)';
      if (!sizeVal) return 'Standard';
      let s = String(sizeVal).trim();
      // Remove redundant '(Class X)' if attached to size
      s = s.replace(/\s*\(\s*Class\s*[^)]*\)/i, '').trim();
      return s ? `Size ${s}` : 'Standard';
    };

    selected.forEach(item => {
      const type = item.itemType || 'Equipment';
      const sizeStr = cleanSizeStr(item.size, item.hasNoSize);
      const classStr = formatClassStr(item.classVal);
      const partNum = (item.partNumber || '').trim();
      const price = parseFloat(item.price) || 0;
      const qty = parseInt(item.quantity, 10) || 0;

      const key = `${type}__${sizeStr}__${classStr}__${partNum}__${price}`.toLowerCase();

      if (consolidatedMap.has(key)) {
        const existing = consolidatedMap.get(key);
        existing.quantity += qty;
        existing.totalCost += price * qty;
      } else {
        consolidatedMap.set(key, {
          itemType: type,
          sizeDisplay: sizeStr,
          classDisplay: classStr,
          partNumber: partNum,
          price: price,
          quantity: qty,
          totalCost: price * qty
        });
      }
    });

    const consolidatedItems = Array.from(consolidatedMap.values());

    // Sort items logically: Category (Gloves, Sleeves, Blankets, MACKs, etc.) -> Class -> Size
    const categoryRank = (type) => {
      const t = String(type).toLowerCase();
      if (t.includes('glove')) return 1;
      if (t.includes('sleeve')) return 2;
      if (t.includes('blanket')) return 3;
      if (t.includes('mack')) return 4;
      return 5;
    };

    const extractClassNum = (classStr) => {
      const m = String(classStr).match(/\d+/);
      return m ? parseInt(m[0], 10) : 99;
    };

    const extractSizeNum = (sizeStr) => {
      const m = String(sizeStr).match(/\d+(\.\d+)?/);
      return m ? parseFloat(m[0]) : 999;
    };

    consolidatedItems.sort((a, b) => {
      const rA = categoryRank(a.itemType);
      const rB = categoryRank(b.itemType);
      if (rA !== rB) return rA - rB;

      const cA = extractClassNum(a.classDisplay);
      const cB = extractClassNum(b.classDisplay);
      if (cA !== cB) return cA - cB;

      const sA = extractSizeNum(a.sizeDisplay);
      const sB = extractSizeNum(b.sizeDisplay);
      if (sA !== sB) return sA - sB;

      return a.sizeDisplay.localeCompare(b.sizeDisplay, undefined, { numeric: true });
    });

    let grandTotal = 0;

    consolidatedItems.forEach(item => {
      let desc = `${item.itemType} - ${item.sizeDisplay}`;
      if (item.classDisplay) desc += ` - ${item.classDisplay}`;
      if (item.partNumber) desc += ` [Part #: ${item.partNumber}]`;

      let line = `• (${item.quantity}) ${desc}`;
      if (item.price > 0) {
        grandTotal += item.totalCost;
        line += ` @ $${item.price.toFixed(2)} ea = $${item.totalCost.toFixed(2)}`;
      } else {
        grandTotal += item.totalCost;
      }
      lines.push(line);
    });

    lines.push('\n----------------------------------------------------');
    if (grandTotal > 0) {
      lines.push(`Estimated Total: $${grandTotal.toFixed(2)}`);
    }
    lines.push('Please confirm availability and estimated delivery date.\n');
    lines.push('Thank you,\nSafety Department');

    return lines.join('\n');
  }

  /**
  * Builds detailed internal purchase order summary for safety department audit records.
  * Preserves section categories and individual employee assignments.
  */
  buildDetailedPOText(selected) {
    const poNum = this.getPurchaseOrderNumber();
    const vendorName = this.selectedVendor ? this.selectedVendor.name : '[Vendor Name]';
    const dateStr = new Date().toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
    const shipTo = this.getShippingAddress();

    let lines = [];
    lines.push(`PURCHASE ORDER: ${poNum} (INTERNAL SUMMARY WITH WORKER BREAKDOWN)`);
    lines.push(`Date: ${dateStr}`);
    lines.push(`Vendor: ${vendorName}`);
    if (this.selectedVendor && this.selectedVendor.email) {
      const contactPart = this.selectedVendor.contact ? `${this.selectedVendor.contact} ` : '';
      lines.push(`Attn: ${contactPart}(${this.selectedVendor.email})`);
    }
    lines.push(`Ship To: ${shipTo}`);
    lines.push('----------------------------------------------------');
    lines.push('Internal Breakdown by Needs Category & Personnel:\n');

    let grandTotal = 0;

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
    lines.push('Generated for internal safety department records.\n');
    lines.push('Safety Department');

    return lines.join('\n');
  }

  /**
  * Switches between clean vendor order text and detailed internal summary text in the PO modal.
  */
  setPOFormat(format = 'clean') {
    this.currentPOFormat = format;
    const textarea = document.getElementById('procurement-po-textarea');
    const tabClean = document.getElementById('po-tab-clean');
    const tabDetailed = document.getElementById('po-tab-detailed');
    const hintEl = document.getElementById('po-format-hint');

    if (textarea && this.generatedPOTexts) {
      textarea.value = this.generatedPOTexts[format] || '';
    }

    if (tabClean && tabDetailed) {
      if (format === 'clean') {
        tabClean.style.background = '#2563eb';
        tabClean.style.color = '#ffffff';
        tabClean.style.boxShadow = '0 1px 3px rgba(0,0,0,0.3)';
        tabDetailed.style.background = 'transparent';
        tabDetailed.style.color = 'var(--text-secondary)';
        tabDetailed.style.boxShadow = 'none';
        if (hintEl) hintEl.textContent = 'Consolidated order ready to email to supplier (no worker names or internal section tags)';
      } else {
        tabDetailed.style.background = '#2563eb';
        tabDetailed.style.color = '#ffffff';
        tabDetailed.style.boxShadow = '0 1px 3px rgba(0,0,0,0.3)';
        tabClean.style.background = 'transparent';
        tabClean.style.color = 'var(--text-secondary)';
        tabClean.style.boxShadow = 'none';
        if (hintEl) hintEl.textContent = 'Internal department audit summary with worker assignments and swap reasons';
      }
    }
  }

  /**
  * Opens default email client (mailto:) with current PO text pre-filled.
  */
  openInEmailClient() {
    const textarea = document.getElementById('procurement-po-textarea');
    const bodyText = textarea ? textarea.value : (this.generatedPOTexts?.clean || '');
    const vendorEmail = this.selectedVendor?.email || '';
    const poNum = this.getPurchaseOrderNumber();
    const vendorName = this.selectedVendor?.name || 'Vendor';

    const subject = `Purchase Order ${poNum} - ${vendorName}`;

    if (!vendorEmail) {
      if (textarea) {
        navigator.clipboard.writeText(bodyText).then(() => {
          alert(`Copied Purchase Order to clipboard!\n\nNote: No email address is configured for ${vendorName}. You can paste this directly into your email.`);
        });
      }
      return;
    }

    const mailtoUrl = `mailto:${encodeURIComponent(vendorEmail)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(bodyText)}`;
    window.open(mailtoUrl, '_blank');
  }

  cleanSize(val) {
    if (val === null || val === undefined) return '';
    const s = String(val).trim();
    const lower = s.toLowerCase();
    if (!s || s === '—' || s === '-' || lower === 'n/a' || lower === 'none' || lower === 'unknown' || lower === 'null') {
      return '';
    }
    return s;
  }

  isNeedToOrderStat(stat) {
    if (!stat) return false;
    const s = String(stat).toLowerCase().trim();
    if (s.includes('ordered')) return false;
    return s.includes('purchase') || s.includes('need to order') || s.includes('need to purchase') || s === 'unassigned';
  }

  /**
   * Marks corresponding swap sheet rows as 'Ordered 📦' instead of 'Need to Purchase ❌' / 'Need To Order'
   * for items selected when the PO is generated. Updates in-memory rows & rawGrid, saves snapshot,
   * and queues UPDATE_CELL mutations for cloud sync.
   * @param {Array} selectedItems - Selected procurement items
   * @returns {Promise<number>} Number of swap rows updated
   */
  async markSwapsAsOrdered(selectedItems) {
    if (!selectedItems || !Array.isArray(selectedItems) || selectedItems.length === 0) {
      return 0;
    }

    const snap = (this.db && typeof this.db.getSnapshot === 'function')
      ? this.db.getSnapshot()
      : (window.localDB ? window.localDB.getSnapshot() : null);

    const SWAP_MAP = {
      'gloves': 'glove_swaps',
      'sleeves': 'sleeve_swaps',
      'blankets': 'blanket_swaps',
      'macks': 'mack_swaps',
      'hv testers': 'hv_tester_swaps',
      'phasing sets': 'phasing_set_swaps',
      'grounds': 'ground_swaps',
      'hot sticks': 'hot_stick_swaps',
      'aed': 'aed_swaps'
    };

    const SHEET_NAME_MAP = {
      'glove_swaps': 'Glove Swaps',
      'sleeve_swaps': 'Sleeve Swaps',
      'blanket_swaps': 'Blanket Swaps',
      'mack_swaps': 'MACK Swaps',
      'hv_tester_swaps': 'HV Tester Swaps',
      'phasing_set_swaps': 'Phasing Set Swaps',
      'ground_swaps': 'Ground Swaps',
      'hot_stick_swaps': 'Hot Stick Swaps',
      'aed_swaps': 'AED Swaps'
    };

    let totalUpdated = 0;
    const modifiedTables = new Set();
    const updatedRows = new Set();

    for (const item of selectedItems) {
      // Only process items that correspond to swap sheets
      if (item.section !== 'swaps_need' && item.section !== 'swaps_size_up') {
        continue;
      }

      const itemTypeLower = String(item.itemType || '').trim().toLowerCase();
      const swapKey = SWAP_MAP[itemTypeLower];
      if (!swapKey) continue;

      const table = (this.db && typeof this.db.getTable === 'function' ? this.db.getTable(swapKey) : null) ||
                    snap?.tables?.[swapKey];
      if (!table) continue;

      const sheetName = (this.db && typeof this.db.getSheetName === 'function')
        ? this.db.getSheetName(swapKey)
        : (SHEET_NAME_MAP[swapKey] || table.name || swapKey);

      // Determine column indices
      let statCol = -1;
      let sizeCol = -1;
      if (table.headers && Array.isArray(table.headers)) {
        statCol = table.headers.findIndex(h => /^status$/i.test(String(h || '').trim()));
        sizeCol = table.headers.findIndex(h => /^size$/i.test(String(h || '').trim()));
      }
      if (statCol === -1) {
        statCol = swapKey.includes('mack') ? 9 : 7;
      }
      if (sizeCol === -1) {
        sizeCol = swapKey.includes('mack') ? 3 : 2;
      }

      // Collect target employee names that were selected
      let targetEmployees = [];
      if (item.employees && Array.isArray(item.employees) && item.employees.length > 0) {
        targetEmployees = item.employees.filter(e => e.checked !== false).map(e => e.name);
      }
      if (targetEmployees.length === 0 && item.quantity > 0) {
        for (let q = 0; q < item.quantity; q++) {
          targetEmployees.push('On Shelf');
        }
      }

      for (const targetName of targetEmployees) {
        const isTargetShelf = targetName.toLowerCase().includes('on shelf') || targetName.toLowerCase() === 'shelf';

        let matchedRowObj = null;
        let matchedGridIdx = -1;
        let oldStatusVal = '';

        // 1. Search table.rows if available
        if (table.rows && Array.isArray(table.rows)) {
          for (const r of table.rows) {
            const rowEmp = String(r['Employee'] || r['Employee Name'] || r['Assigned To'] || '').trim();
            const rowIdx = r._rowIdx || (table.rows.indexOf(r) + 2);
            const rowKey = `${swapKey}:${rowIdx}`;
            if (updatedRows.has(rowKey)) continue;

            const curStat = String(r['Status'] || '').trim();
            if (!this.isNeedToOrderStat(curStat)) continue;

            if (isTargetShelf) {
              const isRowShelf = rowEmp.toLowerCase().includes('on shelf') || rowEmp.toLowerCase() === 'shelf';
              if (isRowShelf) {
                const rSize = this.cleanSize(r['Size']);
                const itemSize = this.cleanSize(item.size);
                if (!itemSize || !rSize || itemSize.includes(rSize) || rSize.includes(itemSize)) {
                  matchedRowObj = r;
                  matchedGridIdx = rowIdx - 1;
                  oldStatusVal = curStat;
                  break;
                }
              }
            } else {
              if (this.isNameMatch(rowEmp, targetName)) {
                matchedRowObj = r;
                matchedGridIdx = rowIdx - 1;
                oldStatusVal = curStat;
                break;
              }
            }
          }
        }

        // 2. Search table.rawGrid if not matched in rows
        if (!matchedRowObj && table.rawGrid && Array.isArray(table.rawGrid)) {
          for (let gIdx = 1; gIdx < table.rawGrid.length; gIdx++) {
            const gr = table.rawGrid[gIdx];
            if (!Array.isArray(gr)) continue;
            const rowKey = `${swapKey}:${gIdx + 1}`;
            if (updatedRows.has(rowKey)) continue;

            const rowEmp = String(gr[0] || '').trim();
            if (rowEmp.includes('📍') || rowEmp.includes('👤') || rowEmp.includes('👷') ||
                rowEmp.includes('Foreman:') || rowEmp.includes('Swaps') || rowEmp === 'Employee' || rowEmp === 'Item #') {
              continue;
            }

            const curStat = String(gr[statCol] || '').trim();
            if (!this.isNeedToOrderStat(curStat)) continue;

            if (isTargetShelf) {
              const isRowShelf = rowEmp.toLowerCase().includes('on shelf') || rowEmp.toLowerCase() === 'shelf';
              if (isRowShelf) {
                const rSize = this.cleanSize(gr[sizeCol]);
                const itemSize = this.cleanSize(item.size);
                if (!itemSize || !rSize || itemSize.includes(rSize) || rSize.includes(itemSize)) {
                  matchedGridIdx = gIdx;
                  oldStatusVal = curStat;
                  break;
                }
              }
            } else {
              if (this.isNameMatch(rowEmp, targetName)) {
                matchedGridIdx = gIdx;
                oldStatusVal = curStat;
                break;
              }
            }
          }
        }

        // Apply status transition to 'Ordered 📦'
        if (matchedGridIdx !== -1 || matchedRowObj) {
          const actualRowIdx = matchedRowObj ? (matchedRowObj._rowIdx || (matchedGridIdx + 1)) : (matchedGridIdx + 1);
          const rowKey = `${swapKey}:${actualRowIdx}`;
          updatedRows.add(rowKey);

          // Update in-memory rowObj
          if (matchedRowObj) {
            matchedRowObj['Status'] = 'Ordered 📦';
          }

          // Update in-memory rawGrid
          if (table.rawGrid && Array.isArray(table.rawGrid) && table.rawGrid[actualRowIdx - 1]) {
            table.rawGrid[actualRowIdx - 1][statCol] = 'Ordered 📦';
          }

          // Queue UPDATE_CELL mutation for cloud repository sync
          if (this.db && typeof this.db.addMutation === 'function') {
            await this.db.addMutation({
              action: 'UPDATE_CELL',
              sheetName: sheetName,
              tableKey: swapKey,
              row: actualRowIdx,
              col: statCol + 1,
              header: 'Status',
              oldValue: oldStatusVal || 'Need to Purchase ❌',
              value: 'Ordered 📦'
            });
          }

          modifiedTables.add(swapKey);
          totalUpdated++;
        }
      }
    }

    if (totalUpdated > 0) {
      // Save local database snapshot
      if (this.db && typeof this.db.saveLocalSnapshot === 'function') {
        await this.db.saveLocalSnapshot();
      } else if (window.desktopAPI && typeof window.desktopAPI.saveLocalSnapshot === 'function' && snap) {
        await window.desktopAPI.saveLocalSnapshot(snap);
      }

      // Re-scan purchase needs so ordered items are excluded from demand
      this.scanPurchaseNeeds();
      this.render();

      // If active sheet matches a modified swap table, re-render it
      if (window.sheetsEngine && modifiedTables.has(window.sheetsEngine.currentSheetKey)) {
        window.sheetsEngine.render();
      }
    }

    return totalUpdated;
  }

  async generatePOText() {
    const selected = this.items.filter(i => i.selected && i.quantity > 0);
    if (selected.length === 0) {
      alert('Please select at least one item to generate a purchase order.');
      return;
    }

    // Mark corresponding swap items as ordered instead of Need To Order on swap sheets
    const updatedCount = await this.markSwapsAsOrdered(selected);

    this.generatedPOTexts = {
      clean: this.buildCleanPOText(selected),
      detailed: this.buildDetailedPOText(selected)
    };

    const modal = document.getElementById('procurement-po-modal');
    if (modal) {
      const banner = document.getElementById('po-swaps-ordered-banner');
      const bannerText = document.getElementById('po-swaps-ordered-text');
      if (banner && bannerText) {
        if (updatedCount > 0) {
          bannerText.textContent = `Marked ${updatedCount} swap line item${updatedCount === 1 ? '' : 's'} as Ordered 📦 on Swaps sheets.`;
          banner.style.display = 'flex';
        } else {
          banner.style.display = 'none';
        }
      }
      this.setPOFormat('clean');
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

  async saveVendorsToDB(silent = false) {
    const saveBtn = document.getElementById('btn-save-vendors');
    if (saveBtn && !silent) saveBtn.textContent = '⏳ Saving...';

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
      if (!silent) {
        this.closeManageVendorsModal();
        alert('✅ Vendor catalog saved successfully! Click "Push Changes to Sheets" at the top whenever you wish to sync changes back to Google Sheets.');
      }
    } catch (err) {
      console.error('Error saving vendor catalog:', err);
      if (!silent) {
        alert('❌ Failed to save vendor changes: ' + (err.message || err));
      }
    } finally {
      if (saveBtn && !silent) saveBtn.innerHTML = '<span>💾</span> Save Vendor Changes';
    }
  }

  // =========================================================================
  // MARK AS ORDERED MODAL & WORKFLOW
  // =========================================================================

  openMarkOrderedModal(itemsToOrder = null) {
    let items = itemsToOrder;
    if (!items || !items.length) {
      items = (this.items || []).filter(i => i.selected && i.quantity > 0 && i.section !== 'ordered_pending');
    }
    if (!items || !items.length) {
      alert('⚠️ Please select at least one item to mark as Ordered.');
      return;
    }

    this.pendingMarkOrderedItems = items;
    const modal = document.getElementById('mark-ordered-modal');
    const body = document.getElementById('mark-ordered-modal-body');
    if (!modal || !body) return;

    const poNumber = this.getPurchaseOrderNumber();
    const today = new Date();
    const todayYmd = today.toISOString().split('T')[0];
    const defaultDelivery = new Date(today.getTime() + 14 * 86400000).toISOString().split('T')[0];

    const currentVendorName = this.selectedVendor ? this.selectedVendor.name : (this.vendors[0]?.name || '');

    let vendorOptions = this.vendors.map(v => `<option value="${this.escapeHtml(v.name)}" ${v.name === currentVendorName ? 'selected' : ''}>${this.escapeHtml(v.name)}</option>`).join('');
    vendorOptions += '<option value="__custom__">➕ New / Custom Vendor...</option>';

    let rowsHtml = '';
    let totalEst = 0;

    items.forEach((item, idx) => {
      const unitPrice = item.price > 0 ? item.price : 0;
      const subtotal = unitPrice * item.quantity;
      totalEst += subtotal;

      const empNames = (item.employees && item.employees.length > 0)
        ? item.employees.filter(e => e.checked).map(e => e.name).join(', ')
        : (item.employees?.[0]?.name || 'Shelf Stock');

      rowsHtml += `
        <tr class="mark-ordered-item-row" data-idx="${idx}">
          <td style="padding: 8px 10px; font-weight: 600; color: #f1f5f9;">
            ${this.escapeHtml(item.typeLabel || item.itemType)}
          </td>
          <td style="padding: 8px 10px; text-align: center;">
            <input type="text" class="mark-ordered-size-input batch-delivery-input" value="${this.escapeHtml(item.size || 'Standard')}" style="width: 80px; text-align: center;">
          </td>
          <td style="padding: 8px 10px; text-align: center; color: #94a3b8;">
            ${this.escapeHtml(item.classVal || 'Class 2')}
          </td>
          <td style="padding: 8px 10px; text-align: center;">
            <input type="number" min="1" class="mark-ordered-qty-input batch-delivery-input" value="${item.quantity}" style="width: 60px; text-align: center;" onchange="window.procurementEngine.recalcMarkOrderedModal()">
          </td>
          <td style="padding: 8px 10px; text-align: right;">
            <div style="display: flex; align-items: center; justify-content: flex-end; gap: 4px;">
              <span style="color: #64748b;">$</span>
              <input type="number" step="0.01" min="0" class="mark-ordered-price-input batch-delivery-input" value="${unitPrice > 0 ? unitPrice.toFixed(2) : ''}" placeholder="0.00" style="width: 85px; text-align: right;" onchange="window.procurementEngine.recalcMarkOrderedModal()">
            </div>
          </td>
          <td style="padding: 8px 10px; text-align: right; font-weight: 700; color: #34d399;" class="mark-ordered-subtotal">
            $${subtotal.toFixed(2)}
          </td>
          <td style="padding: 8px 10px; font-size: 11.5px; color: #cbd5e1;">
            ${this.escapeHtml(empNames)}
          </td>
        </tr>
      `;
    });

    body.innerHTML = `
      <div style="margin-bottom: 18px; background: rgba(16, 185, 129, 0.08); border: 1px solid rgba(16, 185, 129, 0.25); border-radius: 8px; padding: 14px 18px;">
        <div style="font-weight: 700; font-size: 14px; color: #34d399; margin-bottom: 4px; display: flex; align-items: center; gap: 8px;">
          <span>📦</span> Order Information
        </div>
        <div style="font-size: 12px; color: #cbd5e1;">
          Items marked as Ordered will remain on the Purchase Needs page under <strong>"Ordered — Awaiting Delivery"</strong> and will display an <strong>"Ordered"</strong> status badge on the PPE Tracker until delivered into inventory.
        </div>
      </div>

      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 14px; margin-bottom: 20px;">
        <div>
          <label style="display: block; font-size: 12px; font-weight: 600; color: #94a3b8; margin-bottom: 5px;">PO / Order Number *</label>
          <input type="text" id="mark-order-po-num" class="batch-delivery-input" value="${this.escapeHtml(poNumber)}" style="font-weight: 700; color: #38bdf8;">
        </div>
        <div>
          <label style="display: block; font-size: 12px; font-weight: 600; color: #94a3b8; margin-bottom: 5px;">Vendor *</label>
          <select id="mark-order-vendor-select" class="batch-delivery-input" onchange="window.procurementEngine.onMarkOrderVendorChange(this.value)">
            ${vendorOptions}
          </select>
          <input type="text" id="mark-order-custom-vendor" class="batch-delivery-input" placeholder="Enter vendor name..." style="display: none; margin-top: 6px;">
        </div>
        <div>
          <label style="display: block; font-size: 12px; font-weight: 600; color: #94a3b8; margin-bottom: 5px;">Order Date *</label>
          <input type="date" id="mark-order-date" class="batch-delivery-input" value="${todayYmd}">
        </div>
        <div>
          <label style="display: block; font-size: 12px; font-weight: 600; color: #94a3b8; margin-bottom: 5px;">Expected Delivery Date</label>
          <input type="date" id="mark-order-delivery-date" class="batch-delivery-input" value="${defaultDelivery}">
        </div>
      </div>

      <div style="margin-bottom: 12px; display: flex; justify-content: space-between; align-items: center;">
        <span style="font-size: 12.5px; font-weight: 700; color: #cbd5e1; text-transform: uppercase; letter-spacing: 0.5px;">Items in this Order (${items.length})</span>
        <span style="font-size: 11.5px; color: #64748b;">Prices entered will auto-update vendor catalog</span>
      </div>

      <div style="overflow-x: auto; border: 1px solid var(--border-color); border-radius: 6px; margin-bottom: 16px;">
        <table style="width: 100%; border-collapse: collapse; font-size: 12.5px;">
          <thead>
            <tr style="background: rgba(30, 41, 59, 0.85); border-bottom: 2px solid var(--border-color); text-align: left; color: #94a3b8; font-size: 11px; text-transform: uppercase;">
              <th style="padding: 8px 10px;">Item / Equipment</th>
              <th style="padding: 8px 10px; text-align: center; width: 90px;">Size</th>
              <th style="padding: 8px 10px; text-align: center; width: 85px;">Class</th>
              <th style="padding: 8px 10px; text-align: center; width: 70px;">Qty</th>
              <th style="padding: 8px 10px; text-align: right; width: 105px;">Unit Price</th>
              <th style="padding: 8px 10px; text-align: right; width: 95px;">Subtotal</th>
              <th style="padding: 8px 10px;">Assigned Linemen</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>
      </div>

      <div style="display: flex; justify-content: flex-end; align-items: center; gap: 14px; padding: 12px 16px; background: rgba(15, 23, 42, 0.6); border-radius: 6px; border: 1px solid var(--border-color);">
        <span style="font-size: 13px; color: #94a3b8; font-weight: 600;">Estimated Order Total:</span>
        <span id="mark-order-grand-total" style="font-size: 20px; font-weight: 800; color: #34d399; font-family: monospace;">
          $${totalEst.toFixed(2)}
        </span>
      </div>
    `;

    modal.style.display = 'flex';
  }

  closeMarkOrderedModal() {
    const modal = document.getElementById('mark-ordered-modal');
    if (modal) modal.style.display = 'none';
  }

  recalcMarkOrderedModal() {
    const rows = document.querySelectorAll('.mark-ordered-item-row');
    let grandTotal = 0;
    rows.forEach(r => {
      const qtyInput = r.querySelector('.mark-ordered-qty-input');
      const priceInput = r.querySelector('.mark-ordered-price-input');
      const subtotalEl = r.querySelector('.mark-ordered-subtotal');
      const qty = parseInt(qtyInput?.value, 10) || 0;
      const price = parseFloat(priceInput?.value) || 0;
      const sub = qty * price;
      grandTotal += sub;
      if (subtotalEl) subtotalEl.textContent = `$${sub.toFixed(2)}`;
    });
    const totalEl = document.getElementById('mark-order-grand-total');
    if (totalEl) totalEl.textContent = `$${grandTotal.toFixed(2)}`;
  }

  onMarkOrderVendorChange(val) {
    const customInput = document.getElementById('mark-order-custom-vendor');
    if (!customInput) return;
    if (val === '__custom__') {
      customInput.style.display = 'block';
      customInput.focus();
    } else {
      customInput.style.display = 'none';
      const v = this.vendors.find(vend => vend.name === val);
      if (v && v.items && this.pendingMarkOrderedItems) {
        const rows = document.querySelectorAll('.mark-ordered-item-row');
        rows.forEach((r, idx) => {
          const item = this.pendingMarkOrderedItems[idx];
          if (!item) return;
          const priceInput = r.querySelector('.mark-ordered-price-input');
          const tType = (item.itemType || '').toLowerCase();
          const tClassNum = (item.classVal || '').replace(/[^0-9]/g, '').trim();
          const tSize = (item.size || '').toLowerCase().trim();

          const match = v.items.find(ci => {
            const name = (ci.item || '').toLowerCase();
            return name.includes(tType.slice(0, 4)) && (!tClassNum || name.includes(`class ${tClassNum}`)) && (!tSize || name.includes(tSize));
          }) || v.items.find(ci => ci.item.toLowerCase().includes(tType.slice(0, 4)));

          if (match && match.price > 0 && priceInput) {
            priceInput.value = match.price.toFixed(2);
          }
        });
        this.recalcMarkOrderedModal();
      }
    }
  }

  async confirmMarkOrdered() {
    const poNumInput = document.getElementById('mark-order-po-num');
    const poNum = poNumInput ? poNumInput.value.trim() : '';
    if (!poNum) {
      alert('⚠️ Please enter a PO / Order Number.');
      if (poNumInput) poNumInput.focus();
      return;
    }

    const vSelect = document.getElementById('mark-order-vendor-select');
    let vendorName = vSelect ? vSelect.value : '';
    if (vendorName === '__custom__') {
      const customV = document.getElementById('mark-order-custom-vendor');
      vendorName = customV ? customV.value.trim() : '';
    }
    if (!vendorName) {
      alert('⚠️ Please select or enter a Vendor.');
      return;
    }

    const orderDateInput = document.getElementById('mark-order-date');
    const orderDate = orderDateInput ? orderDateInput.value : '';
    const deliveryDateInput = document.getElementById('mark-order-delivery-date');
    const expectedDelivery = deliveryDateInput ? deliveryDateInput.value : '';

    const confirmBtn = document.getElementById('btn-confirm-mark-ordered');
    if (confirmBtn) confirmBtn.textContent = '⏳ Saving Order...';

    try {
      const snap = (this.db && typeof this.db.getSnapshot === 'function')
        ? this.db.getSnapshot()
        : (window.localDB ? window.localDB.getSnapshot() : null);

      const itemsSummaryList = [];
      let grandTotal = 0;
      let totalUnits = 0;
      const allCheckedEmps = [];

      const rows = document.querySelectorAll('.mark-ordered-item-row');

      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        const origItem = this.pendingMarkOrderedItems[i];
        if (!origItem) continue;

        const sizeInput = r.querySelector('.mark-ordered-size-input');
        const qtyInput = r.querySelector('.mark-ordered-qty-input');
        const priceInput = r.querySelector('.mark-ordered-price-input');

        const resolvedSize = sizeInput ? sizeInput.value.trim() : (origItem.size || 'Standard');
        const qty = parseInt(qtyInput?.value, 10) || origItem.quantity || 1;
        const unitPrice = parseFloat(priceInput?.value) || 0;
        const subtotal = qty * unitPrice;

        grandTotal += subtotal;
        totalUnits += qty;

        const checkedEmps = (origItem.employees && origItem.employees.length > 0)
          ? origItem.employees.filter(e => e.checked).map(e => e.name)
          : (origItem.employees?.map(e => e.name) || []);

        allCheckedEmps.push(...checkedEmps);

        const empTag = checkedEmps.length > 0 ? ` [For: ${checkedEmps.join(', ')}]` : '';
        const summaryStr = `(${qty}) ${origItem.classVal || ''} ${origItem.itemType}, Size ${resolvedSize}${empTag}${unitPrice > 0 ? ' @ $' + unitPrice.toFixed(2) : ''}`;
        itemsSummaryList.push(summaryStr);

        // Auto-sync vendor price if entered
        if (unitPrice > 0) {
          await this.syncVendorPrice(vendorName, origItem.itemType, resolvedSize, origItem.classVal, unitPrice);
        }

        const catKey = (origItem.itemType || '').toLowerCase();
        let swapKey = '';
        if (catKey.includes('glove')) swapKey = 'glove_swaps';
        else if (catKey.includes('sleeve')) swapKey = 'sleeve_swaps';
        else if (catKey.includes('blanket')) swapKey = 'blanket_swaps';
        else if (catKey.includes('mack')) swapKey = 'mack_swaps';

        const swapTable = swapKey ? ((this.db && typeof this.db.getTable === 'function' ? this.db.getTable(swapKey) : null) || snap?.tables?.[swapKey]) : null;

        for (const empName of checkedEmps) {
          if (!empName) continue;
          const orderNote = `Ordered on ${orderDate || new Date().toLocaleDateString()}, PO: ${poNum}, Vendor: ${vendorName}${expectedDelivery ? ', Est. Delivery: ' + expectedDelivery : ''}${unitPrice > 0 ? ', Price: $' + unitPrice.toFixed(2) : ''}`;

          if (swapTable && swapTable.rows) {
            const sRow = swapTable.rows.find(sr => {
              const name = String(sr['Employee'] || sr['Employee Name'] || sr['Assigned To'] || Object.values(sr)[0] || '').trim();
              return this.isNameMatch(name, empName);
            });
            if (sRow) {
              sRow['Status'] = `Ordered (PO: ${poNum})`;
              if (sRow['Notes']) {
                sRow['Notes'] = `${sRow['Notes']}; ${orderNote}`;
              } else {
                sRow['Notes'] = orderNote;
              }
              this.db.syncRowToRawGrid(swapTable, sRow);
              const rIdx = sRow._rowIdx || (swapTable.rows.indexOf(sRow) + 2);
              await this.db.addMutation({
                action: 'UPDATE_CELL',
                sheetName: swapTable.name,
                tableKey: swapKey,
                row: rIdx,
                col: 8,
                value: `Ordered (PO: ${poNum})`
              });
              await this.db.addMutation({
                action: 'UPDATE_CELL',
                sheetName: swapTable.name,
                tableKey: swapKey,
                row: rIdx,
                col: 12,
                value: sRow['Notes']
              });
            }
          }

          const needsTable = (this.db && typeof this.db.getTable === 'function' ? this.db.getTable('safety_equipment_needs') : null) || snap?.tables?.['safety_equipment_needs'];
          if (needsTable && needsTable.rows) {
            const nRow = needsTable.rows.find(nr => {
              const name = String(nr['Employee'] || '').trim();
              const type = String(nr['Item Type'] || '').trim().toLowerCase();
              return this.isNameMatch(name, empName) && type.includes(catKey.slice(0, 4));
            });
            if (nRow) {
              nRow['Status'] = 'Ordered';
              nRow['Notes'] = orderNote;
              this.db.syncRowToRawGrid(needsTable, nRow);
              const nrIdx = nRow._rowIdx || (needsTable.rows.indexOf(nRow) + 2);
              await this.db.addMutation({
                action: 'UPDATE_ROW',
                sheetName: needsTable.name || 'Safety Equipment Needs',
                tableKey: 'safety_equipment_needs',
                row: nrIdx,
                rowData: nRow
              });
            } else {
              const newNeed = {
                'Employee': empName,
                'Item Type': origItem.typeLabel || origItem.itemType,
                'Size': resolvedSize,
                'Class': origItem.classVal || 'Class 2',
                'Urgency': 'Immediate',
                'Status': 'Ordered',
                'Date Requested': orderDate || new Date().toLocaleDateString(),
                'Notes': orderNote
              };
              await this.db.addRow('safety_equipment_needs', newNeed, 'Purchase Order');
            }
          }
        }
      }

      const formatToMdY = (dStr) => {
        if (!dStr) return '';
        if (dStr.includes('/')) return dStr;
        const parts = dStr.split('-');
        if (parts.length === 3) return `${parts[1]}/${parts[2]}/${parts[0]}`;
        return dStr;
      };

      const uniqueEmps = Array.from(new Set(allCheckedEmps)).filter(Boolean);
      const empNoteStr = uniqueEmps.length > 0
        ? `Ordered ${totalUnits} units (For: ${uniqueEmps.join(', ')})`
        : `Ordered ${totalUnits} units for Mountain Power Operations`;

      const poRowObj = {
        'Date': formatToMdY(orderDate) || new Date().toLocaleDateString(),
        'PO Number': poNum,
        'Vendor': vendorName,
        'Items': itemsSummaryList.join('; '),
        'Total Price': grandTotal > 0 ? grandTotal : 0,
        'Expected Delivery': formatToMdY(expectedDelivery) || 'Pending',
        'Status': 'Ordered',
        'Notes': empNoteStr
      };

      await this.db.addRow('purchase_orders', poRowObj, 'Purchase Order');

      this.closeMarkOrderedModal();
      await this.loadData();

      if (window.ppeTrackingEngine && typeof window.ppeTrackingEngine.refresh === 'function') {
        window.ppeTrackingEngine.refresh();
      }

      alert(`✅ Successfully marked ${totalUnits} item(s) as Ordered under PO #${poNum} with ${vendorName}!`);
    } catch (err) {
      console.error('Error confirming mark ordered:', err);
      alert('❌ Failed to mark items as ordered: ' + (err.message || err));
    } finally {
      if (confirmBtn) confirmBtn.innerHTML = '<span>📦</span> Confirm & Save Order';
    }
  }

  // =========================================================================
  // BATCH DELIVERY TO INVENTORY MODAL & WORKFLOW
  // =========================================================================

  openBatchDeliveryModal(itemsToDeliver = null) {
    let items = itemsToDeliver;
    if (!items || !items.length) {
      items = (this.items || []).filter(i => i.selected && i.quantity > 0 && i.section === 'ordered_pending');
      if (!items || !items.length) {
        items = (this.items || []).filter(i => i.section === 'ordered_pending');
      }
    }
    if (!items || !items.length) {
      alert('⚠️ No ordered items found awaiting delivery. Mark items as Ordered first.');
      return;
    }

    this.pendingBatchDeliveryItems = items;
    const modal = document.getElementById('batch-delivery-modal');
    const body = document.getElementById('batch-delivery-modal-body');
    if (!modal || !body) return;

    const today = new Date();
    const todayYmd = today.toISOString().split('T')[0];

    const units = [];
    const catCounters = {};

    items.forEach(item => {
      const cat = item.itemType || 'Gloves';
      const cleanCat = cat.toLowerCase();
      if (!catCounters[cleanCat]) {
        catCounters[cleanCat] = 0;
      }

      const emps = (item.employees && item.employees.length > 0)
        ? item.employees.filter(e => e.checked).map(e => e.name)
        : (item.employees?.map(e => e.name) || []);

      const count = Math.max(item.quantity, emps.length, 1);

      for (let u = 0; u < count; u++) {
        const empName = emps[u] || '';
        const baseSuggested = this.suggestNextItemNumber(cat);
        let suggestedNum = baseSuggested;
        const prefixMatch = baseSuggested.match(/^([A-Za-z#\s\-_]+)(\d+)$/);
        const numOnlyMatch = baseSuggested.match(/^(\d+)$/);

        if (prefixMatch) {
          const pref = prefixMatch[1];
          const val = parseInt(prefixMatch[2], 10) + catCounters[cleanCat];
          suggestedNum = `${pref}${val}`;
        } else if (numOnlyMatch) {
          const val = parseInt(numOnlyMatch[1], 10) + catCounters[cleanCat];
          suggestedNum = String(val);
        }
        catCounters[cleanCat]++;

        units.push({
          category: cat,
          size: item.size || 'Standard',
          classVal: item.classVal || 'Class 2',
          empName: empName,
          suggestedNum: suggestedNum,
          orderInfo: item.orderInfo || null,
          origItem: item
        });
      }
    });

    let unitRowsHtml = units.map((u, idx) => {
      const isAssigned = !!u.empName && !u.empName.toLowerCase().includes('shelf') && !u.empName.toLowerCase().includes('stock');
      const defaultStatus = isAssigned ? 'Assigned' : 'On Shelf';
      const defaultLoc = 'Helena';

      return `
        <tr class="batch-delivery-unit-row" data-unit-idx="${idx}" style="border-bottom: 1px solid var(--border-color);">
          <td style="padding: 10px; font-weight: 700; color: #38bdf8; text-align: center;">
            #${idx + 1}
          </td>
          <td style="padding: 10px;">
            <div style="font-weight: 600; color: #f1f5f9; font-size: 13px;">${this.escapeHtml(u.category)}</div>
            <div style="font-size: 11px; color: #94a3b8;">${this.escapeHtml(u.classVal)} • Size: <strong style="color: #e2e8f0;">${this.escapeHtml(u.size)}</strong></div>
            ${u.orderInfo?.orderNumber ? `<div style="font-size: 10.5px; color: #34d399;">PO: ${this.escapeHtml(u.orderInfo.orderNumber)}</div>` : ''}
          </td>
          <td style="padding: 10px;">
            <input type="text" class="batch-delivery-input batch-assigned-to" value="${this.escapeHtml(u.empName || '')}" placeholder="Lineman Name or leave blank for Shelf">
          </td>
          <td style="padding: 10px; width: 140px;">
            <input type="text" class="batch-delivery-input batch-item-num" value="${this.escapeHtml(u.suggestedNum)}" style="font-weight: 700; color: #4ade80;" placeholder="Item # *">
          </td>
          <td style="padding: 10px; width: 130px;">
            <input type="text" class="batch-delivery-input batch-esl-id" placeholder="Optional ESL ID">
          </td>
          <td style="padding: 10px; width: 130px;">
            <input type="date" class="batch-delivery-input batch-test-date" value="${todayYmd}">
          </td>
          <td style="padding: 10px; width: 120px;">
            <input type="text" class="batch-delivery-input batch-location" value="${defaultLoc}" placeholder="Helena">
          </td>
          <td style="padding: 10px; width: 110px;">
            <select class="batch-delivery-input batch-status">
              <option value="Assigned" ${defaultStatus === 'Assigned' ? 'selected' : ''}>Assigned</option>
              <option value="On Shelf" ${defaultStatus === 'On Shelf' ? 'selected' : ''}>On Shelf</option>
            </select>
          </td>
        </tr>
      `;
    }).join('');

    body.innerHTML = `
      <div style="margin-bottom: 16px; background: rgba(59, 130, 246, 0.08); border: 1px solid rgba(59, 130, 246, 0.25); border-radius: 8px; padding: 14px 18px;">
        <div style="font-weight: 700; font-size: 14px; color: #60a5fa; margin-bottom: 4px; display: flex; align-items: center; gap: 8px;">
          <span>🚚</span> Batch Delivery Receiving
        </div>
        <div style="font-size: 12px; color: #cbd5e1;">
          Enter the new stamped <strong>Item #</strong> (pre-filled with the next sequential available numbers) and details for each arriving unit. 
          When confirmed, these items will automatically be inserted into their respective tracking sheets (<strong>Gloves, Sleeves, Blankets, MACKs, etc.</strong>), change-out dates will be calculated, swap rows marked complete, and PO status resolved.
        </div>
      </div>

      <div style="overflow-x: auto; border: 1px solid var(--border-color); border-radius: 6px; margin-bottom: 16px;">
        <table style="width: 100%; border-collapse: collapse; font-size: 12.5px;">
          <thead>
            <tr style="background: rgba(30, 41, 59, 0.85); border-bottom: 2px solid var(--border-color); text-align: left; color: #94a3b8; font-size: 11px; text-transform: uppercase;">
              <th style="padding: 10px; text-align: center; width: 45px;">#</th>
              <th style="padding: 10px; width: 180px;">Item / Spec</th>
              <th style="padding: 10px;">Assign To Lineman</th>
              <th style="padding: 10px; width: 140px;">New Item # *</th>
              <th style="padding: 10px; width: 130px;">ESL ID</th>
              <th style="padding: 10px; width: 130px;">Test Date *</th>
              <th style="padding: 10px; width: 120px;">Location</th>
              <th style="padding: 10px; width: 110px;">Status</th>
            </tr>
          </thead>
          <tbody>
            ${unitRowsHtml}
          </tbody>
        </table>
      </div>
    `;

    this._pendingDeliveryUnits = units;
    modal.style.display = 'flex';
  }

  closeBatchDeliveryModal() {
    const modal = document.getElementById('batch-delivery-modal');
    if (modal) modal.style.display = 'none';
  }

  async confirmBatchDelivery() {
    const rows = document.querySelectorAll('.batch-delivery-unit-row');
    if (!rows.length || !this._pendingDeliveryUnits) {
      alert('⚠️ No delivery units found.');
      return;
    }

    const confirmBtn = document.getElementById('btn-confirm-batch-delivery');
    if (confirmBtn) confirmBtn.textContent = '⏳ Adding to Inventory...';

    try {
      const snap = (this.db && typeof this.db.getSnapshot === 'function')
        ? this.db.getSnapshot()
        : (window.localDB ? window.localDB.getSnapshot() : null);

      const addedItemsSummary = [];
      const formatToMdY = (dStr) => {
        if (!dStr) return '';
        if (dStr.includes('/')) return dStr;
        const parts = dStr.split('-');
        if (parts.length === 3) return `${parts[1]}/${parts[2]}/${parts[0]}`;
        return dStr;
      };

      const todayStr = formatToMdY(new Date().toISOString().split('T')[0]);

      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        const u = this._pendingDeliveryUnits[i];
        if (!u) continue;

        const itemNumInput = r.querySelector('.batch-item-num');
        const itemNum = itemNumInput ? itemNumInput.value.trim() : '';
        if (!itemNum) {
          alert(`⚠️ Please provide an Item # for unit #${i + 1} (${u.category}).`);
          if (itemNumInput) itemNumInput.focus();
          return;
        }

        const assignedInput = r.querySelector('.batch-assigned-to');
        const assignedTo = assignedInput ? assignedInput.value.trim() : u.empName || '';
        const eslInput = r.querySelector('.batch-esl-id');
        const eslId = eslInput ? eslInput.value.trim() : '';
        const testDateInput = r.querySelector('.batch-test-date');
        const testDate = formatToMdY(testDateInput?.value) || todayStr;
        const locInput = r.querySelector('.batch-location');
        const location = locInput ? locInput.value.trim() : 'Helena';
        const statSelect = r.querySelector('.batch-status');
        const status = statSelect ? statSelect.value : (assignedTo ? 'Assigned' : 'On Shelf');

        const cat = u.category.toLowerCase();
        let catKey = 'gloves';
        if (cat.includes('glove')) catKey = 'gloves';
        else if (cat.includes('sleeve')) catKey = 'sleeves';
        else if (cat.includes('blanket')) catKey = 'blankets';
        else if (cat.includes('mack')) catKey = 'macks';
        else if (cat.includes('hv') || cat.includes('tester')) catKey = 'hv_testers';
        else if (cat.includes('phasing')) catKey = 'phasing_sets';
        else if (cat.includes('ground')) catKey = 'grounds';
        else if (cat.includes('hot') || cat.includes('stick')) catKey = 'hot_sticks';
        else if (cat.includes('aed')) catKey = 'aed';

        let changeOutDate = '';
        if (window.inventoryManager && typeof window.inventoryManager.calculateChangeOutDate === 'function') {
          changeOutDate = window.inventoryManager.calculateChangeOutDate(todayStr, location, assignedTo, catKey, { testDate: testDate });
        } else {
          const d = new Date();
          d.setMonth(d.getMonth() + 6);
          changeOutDate = `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}/${d.getFullYear()}`;
        }

        let newRow = {};
        if (catKey === 'gloves' || catKey === 'sleeves') {
          const itemHeader = catKey === 'gloves' ? 'Glove' : 'Sleeve';
          newRow = {
            [itemHeader]: itemNum,
            'Item #': itemNum,
            'ESL ID': eslId,
            'Size': u.size,
            'Class': (u.classVal || 'Class 2').replace(/[^0-9]/g, '') || '2',
            'Test Date': testDate,
            'Date Assigned': assignedTo ? todayStr : '',
            'Location': location,
            'Status': status,
            'Assigned To': assignedTo,
            'Change Out Date': changeOutDate,
            'Picked For': '',
            'Notes': 'New'
          };
        } else if (catKey === 'blankets') {
          newRow = {
            'Blanket': itemNum,
            'Item #': itemNum,
            'Type': u.size || 'Regular',
            'Class': (u.classVal || 'Class 4').replace(/[^0-9]/g, '') || '4',
            'Test Date': testDate,
            'Date Assigned': assignedTo ? todayStr : testDate,
            'Location': location,
            'Status': status,
            'Assigned To': assignedTo,
            'Change Out Date': changeOutDate,
            'Picked For': '',
            'Notes': 'New'
          };
        } else if (catKey === 'macks') {
          newRow = {
            'MACK': itemNum,
            'Item #': itemNum,
            'ESL ID': eslId || itemNum,
            'KV': '15KV',
            'Size': u.size || '1/0',
            'Length': '8 ft',
            'Test Date': testDate,
            'Date Assigned': assignedTo ? todayStr : testDate,
            'Location': location,
            'Status': status,
            'Assigned To': assignedTo,
            'Change Out Date': changeOutDate,
            'Picked For': '',
            'Notes': 'New'
          };
        } else {
          newRow = {
            'Item #': itemNum,
            'Location': location,
            'Status': status,
            'Assigned To': assignedTo,
            'Test Date': testDate,
            'Date Assigned': assignedTo ? todayStr : '',
            'Change Out Date': changeOutDate,
            'Notes': 'New'
          };
        }

        await this.db.addRow(catKey, newRow, 'New Purchase');
        addedItemsSummary.push(`${u.category} #${itemNum} (${assignedTo || 'Shelf'})`);

        if (assignedTo) {
          let swapKey = '';
          if (catKey === 'gloves') swapKey = 'glove_swaps';
          else if (catKey === 'sleeves') swapKey = 'sleeve_swaps';
          else if (catKey === 'blankets') swapKey = 'blanket_swaps';
          else if (catKey === 'macks') swapKey = 'mack_swaps';

          const swapTable = swapKey ? ((this.db && typeof this.db.getTable === 'function' ? this.db.getTable(swapKey) : null) || snap?.tables?.[swapKey]) : null;
          if (swapTable && swapTable.rows) {
            const sRow = swapTable.rows.find(sr => {
              const name = String(sr['Employee'] || sr['Employee Name'] || sr['Assigned To'] || Object.values(sr)[0] || '').trim();
              return this.isNameMatch(name, assignedTo);
            });
            if (sRow) {
              sRow['Status'] = 'Complete';
              sRow['Pick List Item #'] = itemNum;
              sRow['Picked For'] = itemNum;
              this.db.syncRowToRawGrid(swapTable, sRow);
              const rIdx = sRow._rowIdx || (swapTable.rows.indexOf(sRow) + 2);
              await this.db.addMutation({
                action: 'UPDATE_CELL',
                sheetName: swapTable.name,
                tableKey: swapKey,
                row: rIdx,
                col: 7,
                value: itemNum
              });
              await this.db.addMutation({
                action: 'UPDATE_CELL',
                sheetName: swapTable.name,
                tableKey: swapKey,
                row: rIdx,
                col: 8,
                value: 'Complete'
              });
            }
          }

          const needsTable = (this.db && typeof this.db.getTable === 'function' ? this.db.getTable('safety_equipment_needs') : null) || snap?.tables?.['safety_equipment_needs'];
          if (needsTable && needsTable.rows) {
            const nRow = needsTable.rows.find(nr => {
              const name = String(nr['Employee'] || '').trim();
              const type = String(nr['Item Type'] || '').trim().toLowerCase();
              return this.isNameMatch(name, assignedTo) && type.includes(catKey.slice(0, 4));
            });
            if (nRow) {
              nRow['Status'] = 'Fulfilled';
              nRow['Notes'] = `Delivered & added as #${itemNum} on ${todayStr}`;
              this.db.syncRowToRawGrid(needsTable, nRow);
              const nrIdx = nRow._rowIdx || (needsTable.rows.indexOf(nRow) + 2);
              await this.db.addMutation({
                action: 'UPDATE_ROW',
                sheetName: needsTable.name || 'Safety Equipment Needs',
                tableKey: 'safety_equipment_needs',
                row: nrIdx,
                rowData: nRow
              });
            }
          }
        }
      }

      const poTable = (this.db && typeof this.db.getTable === 'function' ? this.db.getTable('purchase_orders') : null) || snap?.tables?.['purchase_orders'];
      if (poTable && poTable.rows) {
        for (const po of poTable.rows) {
          const stat = String(po['Status'] || '').toLowerCase();
          if (stat.includes('ordered')) {
            const poNum = String(po['PO Number'] || po['PO #'] || '');
            const matchedUnit = this._pendingDeliveryUnits.find(u => u.orderInfo?.orderNumber === poNum);
            if (matchedUnit) {
              po['Status'] = 'Received';
              po['Notes'] = `${po['Notes'] || ''}; Delivered and added to inventory on ${todayStr}`.trim().replace(/^;\s*/, '');
              this.db.syncRowToRawGrid(poTable, po);
              const rIdx = po._rowIdx || (poTable.rows.indexOf(po) + 2);
              await this.db.addMutation({
                action: 'UPDATE_ROW',
                sheetName: poTable.name || 'Purchase Orders',
                tableKey: 'purchase_orders',
                row: rIdx,
                rowData: po
              });
            }
          }
        }
      }

      this.closeBatchDeliveryModal();
      await this.loadData();

      if (window.ppeTrackingEngine && typeof window.ppeTrackingEngine.refresh === 'function') {
        window.ppeTrackingEngine.refresh();
      }
      if (window.inventoryManager && typeof window.inventoryManager.loadData === 'function') {
        window.inventoryManager.loadData();
      }

      alert(`✅ Successfully received and created ${addedItemsSummary.length} inventory item(s)!\n\n` + addedItemsSummary.join('\n'));
    } catch (err) {
      console.error('Error confirming batch delivery:', err);
      alert('❌ Failed to process batch delivery: ' + (err.message || err));
    } finally {
      if (confirmBtn) confirmBtn.innerHTML = '<span>✅</span> Add to Inventory & Complete Delivery';
    }
  }

  async confirmMarkDeliveredWithoutInventory() {
    if (!this._pendingDeliveryUnits || !this._pendingDeliveryUnits.length) {
      alert('⚠️ No delivery units found.');
      return;
    }

    if (!confirm('Mark this order as Received / Delivered WITHOUT adding new items to the inventory sheets?\n\nUse this when the items have already been manually entered into the Gloves/Sleeves sheets previously. It will resolve the PO in tracking history and clear it from Awaiting Delivery.')) {
      return;
    }

    const noInvBtn = document.getElementById('btn-mark-delivered-no-inv');
    if (noInvBtn) noInvBtn.textContent = '⏳ Marking Delivered...';

    try {
      const snap = (this.db && typeof this.db.getSnapshot === 'function')
        ? this.db.getSnapshot()
        : (window.localDB ? window.localDB.getSnapshot() : null);

      const formatToMdY = (dStr) => {
        if (!dStr) return '';
        if (dStr.includes('/')) return dStr;
        const parts = dStr.split('-');
        if (parts.length === 3) return `${parts[1]}/${parts[2]}/${parts[0]}`;
        return dStr;
      };

      const todayStr = formatToMdY(new Date().toISOString().split('T')[0]);

      // Collect all PO numbers and assigned employees from pending units
      const poNums = new Set();
      for (const u of this._pendingDeliveryUnits) {
        if (u.orderInfo?.orderNumber) {
          poNums.add(String(u.orderInfo.orderNumber).trim());
        }
        const assignedTo = u.empName;
        if (assignedTo && !assignedTo.toLowerCase().includes('shelf') && !assignedTo.toLowerCase().includes('stock')) {
          const cat = (u.category || '').toLowerCase();
          let swapKey = '';
          if (cat.includes('glove')) swapKey = 'glove_swaps';
          else if (cat.includes('sleeve')) swapKey = 'sleeve_swaps';
          else if (cat.includes('blanket')) swapKey = 'blanket_swaps';
          else if (cat.includes('mack')) swapKey = 'mack_swaps';

          const swapTable = swapKey ? ((this.db && typeof this.db.getTable === 'function' ? this.db.getTable(swapKey) : null) || snap?.tables?.[swapKey]) : null;
          if (swapTable && swapTable.rows) {
            const sRow = swapTable.rows.find(sr => {
              const name = String(sr['Employee'] || sr['Employee Name'] || sr['Assigned To'] || Object.values(sr)[0] || '').trim();
              return this.isNameMatch(name, assignedTo);
            });
            if (sRow && String(sRow['Status'] || '').toLowerCase().includes('ordered')) {
              sRow['Status'] = 'Complete';
              this.db.syncRowToRawGrid(swapTable, sRow);
              const rIdx = sRow._rowIdx || (swapTable.rows.indexOf(sRow) + 2);
              await this.db.addMutation({
                action: 'UPDATE_CELL',
                sheetName: swapTable.name,
                tableKey: swapKey,
                row: rIdx,
                col: 8,
                value: 'Complete'
              });
            }
          }
        }
      }

      // Update purchase_orders table
      const poTable = (this.db && typeof this.db.getTable === 'function' ? this.db.getTable('purchase_orders') : null) || snap?.tables?.['purchase_orders'];
      if (poTable && poTable.rows) {
        for (const po of poTable.rows) {
          const pNum = String(po['PO Number'] || po['PO #'] || '').trim();
          const stat = String(po['Status'] || '').toLowerCase();
          if (poNums.has(pNum) || (poNums.size === 0 && stat.includes('ordered'))) {
            po['Status'] = 'Received';
            if (!po['Expected Delivery'] || po['Expected Delivery'] === 'Pending') {
              po['Expected Delivery'] = todayStr;
            }
            this.db.syncRowToRawGrid(poTable, po);
            const rIdx = po._rowIdx || (poTable.rows.indexOf(po) + 2);
            await this.db.addMutation({
              action: 'UPDATE_ROW',
              sheetName: poTable.name || 'Purchase Orders',
              tableKey: 'purchase_orders',
              row: rIdx,
              rowData: po
            });
          }
        }
      }

      this.closeBatchDeliveryModal();
      await this.loadData();
      this.render();

      if (window.ppeTrackingEngine && typeof window.ppeTrackingEngine.refresh === 'function') {
        window.ppeTrackingEngine.refresh();
      }

      alert('✅ Order marked as Received/Delivered. No duplicate items were added to the Gloves inventory page.');
    } catch (err) {
      console.error('Error marking delivered without inventory:', err);
      alert('❌ Failed to update order: ' + (err.message || err));
    } finally {
      if (noInvBtn) noInvBtn.innerHTML = '<span>✅</span> Mark Delivered Only (Already Added to Inventory)';
    }
  }

  openDeliverForEmployee(empName, itemType, preferredSize) {
    const norm = this.cleanEmployeeName(empName);
    const cat = (itemType || '').toLowerCase();
    const isGlove = cat.includes('glove');
    const targetType = isGlove ? 'Gloves' : 'Sleeves';

    const match = this.items.find(i => {
      if (i.section !== 'ordered_pending') return false;
      if (!i.itemType.toLowerCase().includes(cat.slice(0, 4))) return false;
      if (i.employees && i.employees.some(e => this.isNameMatch(e.name, norm))) return true;
      return false;
    });

    if (match) {
      this.openBatchDeliveryModal([match]);
    } else {
      const classVal = (window.ppeTrackingEngine && typeof window.ppeTrackingEngine.getPreferredPpeClass === 'function')
        ? window.ppeTrackingEngine.getPreferredPpeClass(empName, isGlove ? 'gloves' : 'sleeves')
        : 'Class 2';

      const singleItem = {
        section: 'ordered_pending',
        itemType: targetType,
        typeLabel: isGlove ? '🧤 Gloves' : '🦺 Sleeves',
        size: (preferredSize && preferredSize !== '—') ? preferredSize : (isGlove ? '10' : 'Regular'),
        classVal: classVal,
        quantity: 1,
        employees: [{ name: empName, label: empName, checked: true }],
        orderInfo: this.lookupOrderForEmployee(empName, targetType) || { orderNumber: '', vendor: '' }
      };
      this.openBatchDeliveryModal([singleItem]);
    }
  }

  // =========================================================================
  // ADD PAST ORDER MODAL & ORDERS HISTORY
  // =========================================================================

  openAddPastOrderModal() {
    const modal = document.getElementById('add-past-order-modal');
    const body = document.getElementById('add-past-order-modal-body');
    if (!modal || !body) return;

    const todayYmd = new Date().toISOString().split('T')[0];
    const vendorOptions = this.vendors.map(v => `<option value="${this.escapeHtml(v.name)}">${this.escapeHtml(v.name)}</option>`).join('');

    body.innerHTML = `
      <div style="margin-bottom: 16px; background: rgba(71, 85, 105, 0.15); border: 1px solid rgba(71, 85, 105, 0.35); border-radius: 8px; padding: 12px 16px;">
        <div style="font-weight: 700; font-size: 13.5px; color: #cbd5e1; margin-bottom: 3px; display: flex; align-items: center; gap: 8px;">
          <span>➕</span> Manually Log Past or External Purchase Order
        </div>
        <div style="font-size: 12px; color: #94a3b8;">
          Record past purchase orders into the system tracking log. If you enter purchase prices for items, they will automatically synchronize with the vendor catalog.
        </div>
      </div>

      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-bottom: 14px;">
        <div>
          <label style="display: block; font-size: 12px; font-weight: 600; color: #94a3b8; margin-bottom: 5px;">PO / Order Number *</label>
          <input type="text" id="past-order-po-num" class="batch-delivery-input" placeholder="e.g. 002-26 or PO-9811" style="font-weight: 700; color: #38bdf8;">
        </div>
        <div>
          <label style="display: block; font-size: 12px; font-weight: 600; color: #94a3b8; margin-bottom: 5px;">Vendor *</label>
          <select id="past-order-vendor-select" class="batch-delivery-input" onchange="window.procurementEngine.onPastOrderVendorChange(this.value)">
            ${vendorOptions}
            <option value="__custom__">➕ New / Custom Vendor...</option>
          </select>
          <input type="text" id="past-order-custom-vendor" class="batch-delivery-input" placeholder="Enter vendor name..." style="display: none; margin-top: 6px;">
        </div>
      </div>

      <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 14px; margin-bottom: 14px;">
        <div>
          <label style="display: block; font-size: 12px; font-weight: 600; color: #94a3b8; margin-bottom: 5px;">Order Date *</label>
          <input type="date" id="past-order-date" class="batch-delivery-input" value="${todayYmd}">
        </div>
        <div>
          <label style="display: block; font-size: 12px; font-weight: 600; color: #94a3b8; margin-bottom: 5px;">Delivery Date</label>
          <input type="date" id="past-order-deliv-date" class="batch-delivery-input" value="${todayYmd}">
        </div>
        <div>
          <label style="display: block; font-size: 12px; font-weight: 600; color: #94a3b8; margin-bottom: 5px;">Status *</label>
          <select id="past-order-status" class="batch-delivery-input">
            <option value="Received" selected>Received (Delivered)</option>
            <option value="Ordered">Ordered (Awaiting Delivery)</option>
            <option value="Partially Received">Partially Received</option>
            <option value="Cancelled">Cancelled</option>
          </select>
        </div>
      </div>

      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-bottom: 14px;">
        <div>
          <label style="display: block; font-size: 12px; font-weight: 600; color: #94a3b8; margin-bottom: 5px;">Total Order Cost ($)</label>
          <input type="number" step="0.01" min="0" id="past-order-total-price" class="batch-delivery-input" placeholder="0.00" style="font-weight: 700; color: #34d399;">
        </div>
        <div>
          <label style="display: block; font-size: 12px; font-weight: 600; color: #94a3b8; margin-bottom: 5px;">Item Summary / Description *</label>
          <input type="text" id="past-order-items" class="batch-delivery-input" placeholder="e.g. (4) Class 2 Gloves, Size 10; (2) Class 2 Sleeves, Regular">
        </div>
      </div>

      <div style="margin-bottom: 10px;">
        <label style="display: block; font-size: 12px; font-weight: 600; color: #94a3b8; margin-bottom: 5px;">Notes & Reference Info</label>
        <textarea id="past-order-notes" class="batch-delivery-input" rows="3" placeholder="Additional details, invoice number, or recipient notes..."></textarea>
      </div>
    `;

    modal.style.display = 'flex';
  }

  closeAddPastOrderModal() {
    const modal = document.getElementById('add-past-order-modal');
    if (modal) modal.style.display = 'none';
  }

  onPastOrderVendorChange(val) {
    const custom = document.getElementById('past-order-custom-vendor');
    if (!custom) return;
    if (val === '__custom__') {
      custom.style.display = 'block';
      custom.focus();
    } else {
      custom.style.display = 'none';
    }
  }

  async confirmAddPastOrder() {
    const poNumInput = document.getElementById('past-order-po-num');
    const poNum = poNumInput ? poNumInput.value.trim() : '';
    if (!poNum) {
      alert('⚠️ Please enter a PO / Order Number.');
      if (poNumInput) poNumInput.focus();
      return;
    }

    const vSelect = document.getElementById('past-order-vendor-select');
    let vendorName = vSelect ? vSelect.value : '';
    if (vendorName === '__custom__') {
      const customV = document.getElementById('past-order-custom-vendor');
      vendorName = customV ? customV.value.trim() : '';
    }
    if (!vendorName) {
      alert('⚠️ Please select or enter a Vendor.');
      return;
    }

    const orderDateInput = document.getElementById('past-order-date');
    const orderDate = orderDateInput ? orderDateInput.value : '';
    const delivDateInput = document.getElementById('past-order-deliv-date');
    const delivDate = delivDateInput ? delivDateInput.value : '';
    const statusSelect = document.getElementById('past-order-status');
    const status = statusSelect ? statusSelect.value : 'Received';
    const priceInput = document.getElementById('past-order-total-price');
    const totalPrice = parseFloat(priceInput?.value) || 0;
    const itemsInput = document.getElementById('past-order-items');
    const itemsStr = itemsInput ? itemsInput.value.trim() : '';
    if (!itemsStr) {
      alert('⚠️ Please enter an item summary or description.');
      if (itemsInput) itemsInput.focus();
      return;
    }
    const notesInput = document.getElementById('past-order-notes');
    const notes = notesInput ? notesInput.value.trim() : '';

    const formatToMdY = (dStr) => {
      if (!dStr) return '';
      if (dStr.includes('/')) return dStr;
      const parts = dStr.split('-');
      if (parts.length === 3) return `${parts[1]}/${parts[2]}/${parts[0]}`;
      return dStr;
    };

    const confirmBtn = document.getElementById('btn-confirm-add-past-order');
    if (confirmBtn) confirmBtn.textContent = '⏳ Saving...';

    try {
      const rowObj = {
        'Date': formatToMdY(orderDate) || new Date().toLocaleDateString(),
        'PO Number': poNum,
        'Vendor': vendorName,
        'Items': itemsStr,
        'Total Price': totalPrice > 0 ? totalPrice : 0,
        'Expected Delivery': formatToMdY(delivDate) || 'Delivered',
        'Status': status,
        'Notes': notes || 'Manually logged past order'
      };

      const parsedItems = this.parsePoItemsString(itemsStr);
      for (const pi of parsedItems) {
        if (pi.unitPrice > 0) {
          await this.syncVendorPrice(vendorName, pi.category, pi.size, pi.classVal, pi.unitPrice);
        }
      }

      await this.db.addRow('purchase_orders', rowObj, 'Manual Past Order');

      this.closeAddPastOrderModal();
      await this.loadData();

      alert(`✅ Past Purchase Order #${poNum} logged successfully!`);
    } catch (err) {
      console.error('Error logging past order:', err);
      alert('❌ Failed to save past order: ' + (err.message || err));
    } finally {
      if (confirmBtn) confirmBtn.innerHTML = '<span>💾</span> Save Order to Tracking Log';
    }
  }

  renderOrdersHistory(container, tabsHtml = '') {
    if (!tabsHtml) {
      const counts = {
        all: this.items.length,
        needs: this.items.filter(i => i.section !== 'ordered_pending').length,
        ordered_pending: this.items.filter(i => i.section === 'ordered_pending').length,
        swaps_need: this.items.filter(i => i.section === 'swaps_need').length,
        swaps_size_up: this.items.filter(i => i.section === 'swaps_size_up').length,
        assigned_size_up: this.items.filter(i => i.section === 'assigned_size_up').length,
        compliance_missing: this.items.filter(i => i.section === 'compliance_missing').length
      };
      tabsHtml = this.getSectionTabsHtml('history', counts);
    }

    const snap = (this.db && typeof this.db.getSnapshot === 'function')
      ? this.db.getSnapshot()
      : (window.localDB ? window.localDB.getSnapshot() : null);

    const poTable = (this.db && typeof this.db.getTable === 'function' ? this.db.getTable('purchase_orders') : null) || snap?.tables?.['purchase_orders'];
    const rows = poTable ? (poTable.rows || poTable.rawGrid || []) : [];

    let totalSpend = 0;
    let openCount = 0;
    let completedCount = 0;

    const poList = [];
    rows.forEach((r, idx) => {
      let date = '';
      let poNum = '';
      let vendor = '';
      let items = '';
      let price = 0;
      let expDeliv = '';
      let status = '';
      let notes = '';

      if (Array.isArray(r)) {
        if (String(r[0] || '').toLowerCase() === 'date') return;
        date = String(r[0] || '').trim();
        poNum = String(r[1] || '').trim();
        vendor = String(r[2] || '').trim();
        items = String(r[3] || '').trim();
        price = parseFloat(r[4]) || 0;
        expDeliv = String(r[5] || '').trim();
        status = String(r[6] || '').trim();
        notes = String(r[7] || '').trim();
      } else if (r && typeof r === 'object') {
        date = String(r['Date'] || '').trim();
        poNum = String(r['PO Number'] || r['PO #'] || '').trim();
        vendor = String(r['Vendor'] || '').trim();
        items = String(r['Items'] || '').trim();
        price = parseFloat(r['Total Price'] || r['Price'] || 0) || 0;
        expDeliv = String(r['Expected Delivery'] || '').trim();
        status = String(r['Status'] || '').trim();
        notes = String(r['Notes'] || '').trim();
      }

      if (!poNum && !vendor && !items) return;

      totalSpend += price;
      const statLower = status.toLowerCase();
      if (statLower.includes('received') || statLower.includes('fulfilled')) {
        completedCount++;
      } else if (statLower.includes('ordered') || statLower.includes('pending')) {
        openCount++;
      }

      const rowIdx = (r && r._rowIdx) ? r._rowIdx : (idx + 2);
      poList.push({ rowIdx, date, poNum, vendor, items, price, expDeliv, status, notes, raw: r });
    });

    poList.reverse();
    this.poHistoryList = poList;

    let tableRows = '';
    if (poList.length === 0) {
      tableRows = `
        <tr>
          <td colspan="7" style="padding: 30px; text-align: center; color: #64748b;">
            No purchase orders currently recorded in history. Click <strong>"➕ Add Past Order"</strong> above to record orders.
          </td>
        </tr>
      `;
    } else {
      tableRows = poList.map((po, poHistoryIdx) => {
        const statLower = po.status.toLowerCase();
        let badgeStyle = 'background: rgba(100, 116, 139, 0.2); color: #94a3b8; border: 1px solid rgba(100, 116, 139, 0.4);';
        let badgeIcon = '📄';

        if (statLower.includes('received') || statLower.includes('fulfilled')) {
          badgeStyle = 'background: rgba(16, 185, 129, 0.2); color: #34d399; border: 1px solid rgba(16, 185, 129, 0.4);';
          badgeIcon = '✅';
        } else if (statLower.includes('ordered')) {
          badgeStyle = 'background: rgba(245, 158, 11, 0.2); color: #fbbf24; border: 1px solid rgba(245, 158, 11, 0.4);';
          badgeIcon = '📦';
        } else if (statLower.includes('partial')) {
          badgeStyle = 'background: rgba(59, 130, 246, 0.2); color: #93c5fd; border: 1px solid rgba(59, 130, 246, 0.4);';
          badgeIcon = '🔄';
        }

        const isDeliverable = statLower.includes('ordered') || statLower.includes('partial');

        return `
          <tr style="border-bottom: 1px solid var(--border-color);">
            <td style="padding: 10px 12px; font-family: monospace; font-size: 12px; color: #94a3b8;">
              ${this.escapeHtml(po.date)}
            </td>
            <td style="padding: 10px 12px; font-weight: 700; color: #38bdf8; font-size: 13px;">
              ${this.escapeHtml(po.poNum || '—')}
            </td>
            <td style="padding: 10px 12px; font-weight: 600; color: #f1f5f9;">
              ${this.escapeHtml(po.vendor || '—')}
            </td>
            <td style="padding: 10px 12px; font-size: 12px; max-width: 380px;">
              <div style="color: #cbd5e1;">${this.escapeHtml(po.items)}</div>
              ${po.notes ? `<div style="font-size: 11px; color: #64748b; margin-top: 2px;">${this.escapeHtml(po.notes)}</div>` : ''}
              ${po.expDeliv && po.expDeliv !== 'Pending' ? `<div style="font-size: 11px; color: #38bdf8; margin-top: 2px;">🚚 Deliv: ${this.escapeHtml(po.expDeliv)}</div>` : ''}
            </td>
            <td style="padding: 10px 12px; text-align: right; font-weight: 700; font-family: monospace; color: ${po.price > 0 ? '#34d399' : '#64748b'};">
              ${po.price > 0 ? `$${po.price.toFixed(2)}` : '—'}
            </td>
            <td style="padding: 10px 12px; text-align: center;">
              <span class="badge" style="${badgeStyle} font-size: 11px; padding: 3px 8px; border-radius: 4px; display: inline-flex; align-items: center; gap: 4px;">
                <span>${badgeIcon}</span> ${this.escapeHtml(po.status || 'Ordered')}
              </span>
            </td>
            <td style="padding: 8px 10px; text-align: center;">
              <div style="display: flex; align-items: center; justify-content: center; gap: 4px; flex-wrap: wrap;">
                ${isDeliverable ? `
                  <button class="btn btn-xs" onclick="window.procurementEngine.openBatchDeliveryModal()" style="background: rgba(59, 130, 246, 0.15); border: 1px solid rgba(59, 130, 246, 0.4); color: #93c5fd; padding: 3px 7px; font-size: 11px; border-radius: 3px; cursor: pointer; display: inline-flex; align-items: center; gap: 3px;" title="Receive items and generate inventory serial numbers on Gloves/Sleeves page">
                    <span>🚚</span> Receive
                  </button>
                  <button class="btn btn-xs" onclick="window.procurementEngine.quickMarkOrderReceived(${po.rowIdx}, '${this.escapeJs(po.poNum)}')" style="background: rgba(16, 185, 129, 0.15); border: 1px solid rgba(16, 185, 129, 0.4); color: #6ee7b7; padding: 3px 7px; font-size: 11px; border-radius: 3px; cursor: pointer; display: inline-flex; align-items: center; gap: 3px;" title="Quick mark as Received WITHOUT adding duplicate items to Gloves page">
                    <span>✅</span> Mark Rec'd
                  </button>
                ` : ''}
                <button class="btn btn-xs" onclick="window.procurementEngine.openEditOrderModal(${poHistoryIdx})" style="background: rgba(148, 163, 184, 0.15); border: 1px solid rgba(148, 163, 184, 0.35); color: #cbd5e1; padding: 3px 7px; font-size: 11px; border-radius: 3px; cursor: pointer; display: inline-flex; align-items: center; gap: 3px;" title="Edit PO #, Vendor, Dates, or Details">
                  <span>✏️</span> Edit
                </button>
              </div>
            </td>
          </tr>
        `;
      }).join('');
    }

    container.innerHTML = tabsHtml + `
      <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px; margin-bottom: 16px; padding: 14px 18px; background: rgba(30, 41, 59, 0.7); border: 1px solid var(--border-color); border-radius: 8px;">
        <div style="display: flex; align-items: center; gap: 10px;">
          <span style="font-size: 20px;">📜</span>
          <div>
            <div style="font-weight: 800; font-size: 15px; color: #f1f5f9;">PURCHASE ORDERS TRACKING & HISTORY</div>
            <div style="font-size: 12px; color: #94a3b8;">Full historical log of placed, delivered, and past purchase orders with suppliers</div>
          </div>
        </div>
        <div style="display: flex; align-items: center; gap: 12px; flex-wrap: wrap;">
          <div style="display: flex; gap: 8px;">
            <span class="brand-badge" style="background: rgba(59, 130, 246, 0.15); color: #93c5fd; border: 1px solid rgba(59, 130, 246, 0.35); font-size: 11.5px; padding: 4px 10px;">
              Total Orders: <strong>${poList.length}</strong>
            </span>
            <span class="brand-badge" style="background: rgba(245, 158, 11, 0.15); color: #fcd34d; border: 1px solid rgba(245, 158, 11, 0.35); font-size: 11.5px; padding: 4px 10px;">
              Open: <strong>${openCount}</strong>
            </span>
            <span class="brand-badge" style="background: rgba(16, 185, 129, 0.15); color: #6ee7b7; border: 1px solid rgba(16, 185, 129, 0.35); font-size: 11.5px; padding: 4px 10px;">
              Delivered: <strong>${completedCount}</strong>
            </span>
            <span class="brand-badge" style="background: rgba(168, 85, 247, 0.15); color: #d8b4fe; border: 1px solid rgba(168, 85, 247, 0.35); font-size: 11.5px; padding: 4px 10px;">
              Total Spend: <strong>$${totalSpend.toFixed(2)}</strong>
            </span>
          </div>
          <button class="btn btn-secondary" onclick="window.procurementEngine.openAddPastOrderModal()" style="display: flex; align-items: center; gap: 6px; font-size: 12px; padding: 6px 12px;">
            <span>➕</span> Log Past Order
          </button>
        </div>
      </div>

      <div style="overflow-x: auto; border: 1px solid var(--border-color); border-radius: 6px;">
        <table class="procurement-orders-table" style="width: 100%; border-collapse: collapse; font-size: 12.5px;">
          <thead>
            <tr>
              <th style="width: 95px;">Date</th>
              <th style="width: 110px;">PO #</th>
              <th style="width: 150px;">Vendor</th>
              <th>Items & Order Details</th>
              <th style="text-align: right; width: 110px;">Total Price</th>
              <th style="text-align: center; width: 120px;">Status</th>
              <th style="text-align: center; width: 165px;">Actions</th>
            </tr>
          </thead>
          <tbody>
            ${tableRows}
          </tbody>
        </table>
      </div>
    `;
  }

  async quickMarkOrderReceived(rowIdx, poNum) {
    if (!confirm(`Mark PO #${poNum || ''} as Received?\n\nThis will update the order tracking status to "Received" WITHOUT adding duplicate items to the Gloves/Sleeves inventory page.`)) {
      return;
    }

    try {
      const snap = (this.db && typeof this.db.getSnapshot === 'function')
        ? this.db.getSnapshot()
        : (window.localDB ? window.localDB.getSnapshot() : null);

      const poTable = (this.db && typeof this.db.getTable === 'function' ? this.db.getTable('purchase_orders') : null) || snap?.tables?.['purchase_orders'];
      if (!poTable) throw new Error('Purchase Orders table not found');

      const todayStr = new Date().toLocaleDateString();

      // Find row in poTable
      let targetRow = null;
      let targetIdx = rowIdx;
      if (poTable.rows) {
        targetRow = poTable.rows.find((r, idx) => {
          const rIdx = r._rowIdx || (idx + 2);
          return rIdx === rowIdx;
        });
        if (targetRow) {
          targetIdx = targetRow._rowIdx || (poTable.rows.indexOf(targetRow) + 2);
        }
      }

      if (targetRow) {
        targetRow['Status'] = 'Received';
        if (!targetRow['Expected Delivery'] || targetRow['Expected Delivery'] === 'Pending') {
          targetRow['Expected Delivery'] = todayStr;
        }
        this.db.syncRowToRawGrid(poTable, targetRow);
      }

      await this.db.addMutation({
        action: 'UPDATE_CELL',
        sheetName: poTable.name || 'Purchase Orders',
        tableKey: 'purchase_orders',
        row: targetIdx,
        col: 7, // Column G is Status
        value: 'Received'
      });

      await this.loadData();
      this.render();

      alert(`✅ PO #${poNum || ''} marked as Received in Purchase Order history!`);
    } catch (err) {
      console.error('Error marking order received:', err);
      alert('❌ Failed to update order status: ' + (err.message || err));
    }
  }

  openEditOrderModal(poIndex) {
    const po = this.poHistoryList ? this.poHistoryList[poIndex] : null;
    if (!po) return;

    this.editingOrder = { ...po, _historyIdx: poIndex };
    const modal = document.getElementById('edit-order-modal');
    const body = document.getElementById('edit-order-modal-body');
    const title = document.getElementById('edit-order-modal-title');
    if (!modal || !body) return;

    if (title) {
      title.textContent = `Edit Purchase Order #${po.poNum || ''}`;
    }

    const toYmd = (dStr) => {
      if (!dStr) return '';
      if (dStr.includes('-')) return dStr;
      const parts = dStr.split('/');
      if (parts.length === 3) {
        const m = parts[0].padStart(2, '0');
        const d = parts[1].padStart(2, '0');
        const y = parts[2].length === 2 ? '20' + parts[2] : parts[2];
        return `${y}-${m}-${d}`;
      }
      return '';
    };

    const orderYmd = toYmd(po.date) || new Date().toISOString().split('T')[0];
    const delivYmd = toYmd(po.expDeliv) || '';

    const currentVendor = po.vendor || '';
    const vendorExists = this.vendors.some(v => v.name.toLowerCase() === currentVendor.toLowerCase());

    let vendorOptions = this.vendors.map(v => 
      `<option value="${this.escapeHtml(v.name)}" ${v.name.toLowerCase() === currentVendor.toLowerCase() ? 'selected' : ''}>${this.escapeHtml(v.name)}</option>`
    ).join('');
    vendorOptions += `<option value="__custom__" ${(!vendorExists && currentVendor) ? 'selected' : ''}>➕ New / Custom Vendor...</option>`;

    body.innerHTML = `
      <div style="margin-bottom: 16px; background: rgba(30, 58, 138, 0.2); border: 1px solid rgba(59, 130, 246, 0.35); border-radius: 8px; padding: 12px 16px;">
        <div style="font-weight: 700; font-size: 13.5px; color: #93c5fd; margin-bottom: 3px; display: flex; align-items: center; gap: 8px;">
          <span>✏️</span> Edit Order Details & Historical Log
        </div>
        <div style="font-size: 12px; color: #cbd5e1;">
          Update the PO Number, vendor, status, or item descriptions. Correcting the PO # will update tracking across Safety Assistant.
        </div>
      </div>

      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-bottom: 14px;">
        <div>
          <label style="display: block; font-size: 12px; font-weight: 600; color: #94a3b8; margin-bottom: 5px;">PO / Order Number *</label>
          <input type="text" id="edit-order-po-num" class="batch-delivery-input" value="${this.escapeHtml(po.poNum || '')}" style="font-weight: 700; color: #38bdf8;">
        </div>
        <div>
          <label style="display: block; font-size: 12px; font-weight: 600; color: #94a3b8; margin-bottom: 5px;">Vendor *</label>
          <select id="edit-order-vendor-select" class="batch-delivery-input" onchange="window.procurementEngine.onEditOrderVendorChange(this.value)">
            ${vendorOptions}
          </select>
          <input type="text" id="edit-order-custom-vendor" class="batch-delivery-input" value="${this.escapeHtml(!vendorExists ? currentVendor : '')}" placeholder="Enter vendor name..." style="display: ${(!vendorExists && currentVendor) ? 'block' : 'none'}; margin-top: 6px;">
        </div>
      </div>

      <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 14px; margin-bottom: 14px;">
        <div>
          <label style="display: block; font-size: 12px; font-weight: 600; color: #94a3b8; margin-bottom: 5px;">Order Date *</label>
          <input type="date" id="edit-order-date" class="batch-delivery-input" value="${orderYmd}">
        </div>
        <div>
          <label style="display: block; font-size: 12px; font-weight: 600; color: #94a3b8; margin-bottom: 5px;">Delivery Date</label>
          <input type="date" id="edit-order-deliv-date" class="batch-delivery-input" value="${delivYmd}">
        </div>
        <div>
          <label style="display: block; font-size: 12px; font-weight: 600; color: #94a3b8; margin-bottom: 5px;">Status *</label>
          <select id="edit-order-status" class="batch-delivery-input">
            <option value="Ordered" ${po.status.toLowerCase().includes('order') ? 'selected' : ''}>Ordered (Awaiting Delivery)</option>
            <option value="Received" ${po.status.toLowerCase().includes('received') || po.status.toLowerCase().includes('fulfill') ? 'selected' : ''}>Received (Delivered)</option>
            <option value="Partially Received" ${po.status.toLowerCase().includes('partial') ? 'selected' : ''}>Partially Received</option>
            <option value="Cancelled" ${po.status.toLowerCase().includes('cancel') ? 'selected' : ''}>Cancelled</option>
          </select>
        </div>
      </div>

      <div style="display: grid; grid-template-columns: 1fr 2fr; gap: 14px; margin-bottom: 14px;">
        <div>
          <label style="display: block; font-size: 12px; font-weight: 600; color: #94a3b8; margin-bottom: 5px;">Total Order Cost ($)</label>
          <input type="number" step="0.01" min="0" id="edit-order-total-price" class="batch-delivery-input" value="${po.price > 0 ? po.price.toFixed(2) : ''}" placeholder="0.00" style="font-weight: 700; color: #34d399;">
        </div>
        <div>
          <label style="display: block; font-size: 12px; font-weight: 600; color: #94a3b8; margin-bottom: 5px;">Item Summary / Description *</label>
          <input type="text" id="edit-order-items" class="batch-delivery-input" value="${this.escapeHtml(po.items || '')}" placeholder="e.g. (4) Class 2 Gloves, Size 10; (2) Class 2 Sleeves, Regular">
        </div>
      </div>

      <div style="margin-bottom: 10px;">
        <label style="display: block; font-size: 12px; font-weight: 600; color: #94a3b8; margin-bottom: 5px;">Notes & Reference Info</label>
        <textarea id="edit-order-notes" class="batch-delivery-input" rows="3" placeholder="Additional details, invoice number, or recipient notes...">${this.escapeHtml(po.notes || '')}</textarea>
      </div>
    `;

    modal.style.display = 'flex';
  }

  closeEditOrderModal() {
    const modal = document.getElementById('edit-order-modal');
    if (modal) modal.style.display = 'none';
    this.editingOrder = null;
  }

  onEditOrderVendorChange(val) {
    const custom = document.getElementById('edit-order-custom-vendor');
    if (!custom) return;
    if (val === '__custom__') {
      custom.style.display = 'block';
      custom.focus();
    } else {
      custom.style.display = 'none';
    }
  }

  async confirmSaveEditOrder() {
    if (!this.editingOrder) return;
    const poNumInput = document.getElementById('edit-order-po-num');
    const poNum = poNumInput ? poNumInput.value.trim() : '';
    if (!poNum) {
      alert('⚠️ Please enter a PO / Order Number.');
      if (poNumInput) poNumInput.focus();
      return;
    }

    const vSelect = document.getElementById('edit-order-vendor-select');
    let vendorName = vSelect ? vSelect.value : '';
    if (vendorName === '__custom__') {
      const customV = document.getElementById('edit-order-custom-vendor');
      vendorName = customV ? customV.value.trim() : '';
    }
    if (!vendorName) {
      alert('⚠️ Please select or enter a Vendor.');
      return;
    }

    const orderDateInput = document.getElementById('edit-order-date');
    const orderDate = orderDateInput ? orderDateInput.value : '';
    const delivDateInput = document.getElementById('edit-order-deliv-date');
    const delivDate = delivDateInput ? delivDateInput.value : '';
    const statusSelect = document.getElementById('edit-order-status');
    const status = statusSelect ? statusSelect.value : 'Ordered';
    const priceInput = document.getElementById('edit-order-total-price');
    const totalPrice = parseFloat(priceInput?.value) || 0;
    const itemsInput = document.getElementById('edit-order-items');
    const itemsStr = itemsInput ? itemsInput.value.trim() : '';
    if (!itemsStr) {
      alert('⚠️ Please enter an item summary or description.');
      if (itemsInput) itemsInput.focus();
      return;
    }
    const notesInput = document.getElementById('edit-order-notes');
    const notes = notesInput ? notesInput.value.trim() : '';

    const formatToMdY = (dStr) => {
      if (!dStr) return '';
      if (dStr.includes('/')) return dStr;
      const parts = dStr.split('-');
      if (parts.length === 3) return `${parts[1]}/${parts[2]}/${parts[0]}`;
      return dStr;
    };

    const saveBtn = document.getElementById('btn-save-edit-order');
    if (saveBtn) saveBtn.textContent = '⏳ Saving...';

    try {
      const snap = (this.db && typeof this.db.getSnapshot === 'function')
        ? this.db.getSnapshot()
        : (window.localDB ? window.localDB.getSnapshot() : null);

      const poTable = (this.db && typeof this.db.getTable === 'function' ? this.db.getTable('purchase_orders') : null) || snap?.tables?.['purchase_orders'];
      if (!poTable) throw new Error('Purchase Orders table not found');

      const updatedRowObj = {
        'Date': formatToMdY(orderDate) || this.editingOrder.date,
        'PO Number': poNum,
        'Vendor': vendorName,
        'Items': itemsStr,
        'Total Price': totalPrice > 0 ? totalPrice : 0,
        'Expected Delivery': formatToMdY(delivDate) || (status === 'Received' ? 'Delivered' : 'Pending'),
        'Status': status,
        'Notes': notes
      };

      const targetRowIdx = this.editingOrder.rowIdx;

      let foundRow = null;
      if (poTable.rows) {
        foundRow = poTable.rows.find((r, idx) => {
          const rIdx = r._rowIdx || (idx + 2);
          return rIdx === targetRowIdx;
        });
      }

      if (foundRow) {
        Object.assign(foundRow, updatedRowObj);
        this.db.syncRowToRawGrid(poTable, foundRow);
      }

      await this.db.addMutation({
        action: 'UPDATE_ROW',
        sheetName: poTable.name || 'Purchase Orders',
        tableKey: 'purchase_orders',
        row: targetRowIdx,
        rowData: updatedRowObj
      });

      const parsedItems = this.parsePoItemsString(itemsStr);
      for (const pi of parsedItems) {
        if (pi.unitPrice > 0) {
          await this.syncVendorPrice(vendorName, pi.category, pi.size, pi.classVal, pi.unitPrice);
        }
      }

      this.closeEditOrderModal();
      await this.loadData();
      this.render();

      alert(`✅ Purchase Order #${poNum} updated successfully!`);
    } catch (err) {
      console.error('Error saving edited order:', err);
      alert('❌ Failed to save order changes: ' + (err.message || err));
    } finally {
      if (saveBtn) saveBtn.innerHTML = '<span>💾</span> Save Changes';
    }
  }

  async confirmDeleteCurrentOrder() {
    if (!this.editingOrder) return;
    const poNum = this.editingOrder.poNum || 'Unknown';
    if (!confirm(`Are you sure you want to permanently delete Purchase Order #${poNum} from the tracking history?\n\nThis cannot be undone.`)) {
      return;
    }

    try {
      const snap = (this.db && typeof this.db.getSnapshot === 'function')
        ? this.db.getSnapshot()
        : (window.localDB ? window.localDB.getSnapshot() : null);

      const poTable = (this.db && typeof this.db.getTable === 'function' ? this.db.getTable('purchase_orders') : null) || snap?.tables?.['purchase_orders'];
      if (!poTable) throw new Error('Purchase Orders table not found');

      const targetRowIdx = this.editingOrder.rowIdx;

      if (poTable.rows) {
        const idx = poTable.rows.findIndex((r, i) => (r._rowIdx || (i + 2)) === targetRowIdx);
        if (idx !== -1) {
          poTable.rows.splice(idx, 1);
        }
      }

      await this.db.addMutation({
        action: 'DELETE_ROW',
        sheetName: poTable.name || 'Purchase Orders',
        tableKey: 'purchase_orders',
        row: targetRowIdx
      });

      this.closeEditOrderModal();
      await this.loadData();
      this.render();

      alert(`🗑️ Purchase Order #${poNum} deleted.`);
    } catch (err) {
      console.error('Error deleting order:', err);
      alert('❌ Failed to delete order: ' + (err.message || err));
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
